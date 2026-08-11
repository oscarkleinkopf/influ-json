/**
 * Detecta cuando el retrato ancla (face DNA) contradice el character_lock.
 * Caso Eru: JSON = morena / pelo negro, foto = rubia clara → img2img clava la cara equivocada.
 *
 * Heurística local con sharp (cero API). No bloquea si falla: retorna conflict=false.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const DARK_SKIN_RE = /morena|oscura|profunda|deep|dark\s*skin|ebony|negra|brown\s*skin|piel\s*negra|medium[_\s-]?dark/i;
const FAIR_SKIN_RE = /clara|fair|light|porcelana|beige\s*claro|pale|ivory|porcelain|piel\s*clara/i;
const BLONDE_HAIR_RE = /rubi[oa]|blonde|blond|platino|golden\s*blond|honey\s*blond|amarill/i;
const DARK_HAIR_RE = /negro|black|casta[nñ]o\s*oscuro|dark\s*brown|brunette|azabache|moreno/i;

function parseDetailed(detailedJSON) {
  let d = detailedJSON;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (_) { return {}; }
  }
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (_) { return {}; }
  }
  return d && typeof d === 'object' ? d : {};
}

function hexBrightness(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return (r + g + b) / 3;
}

/**
 * @returns {{ skin: 'dark'|'fair'|'unknown', hair: 'blonde'|'dark'|'unknown', skinTone: string, hairColor: string }}
 */
function classifyLockAppearance(detailedJSON) {
  const d = parseDetailed(detailedJSON);
  const f = d.facial_features || {};
  const h = d.hair || {};
  const must = d.character_lock?.must_match_every_image || {};
  const skinTone = String(f.skin_tone || must.skin_tone || '').trim();
  const hairColor = String(h.color || must.hair_color || must.hair || '').trim();
  const hex = f.skin_tone_hex || must.skin_tone_hex || '';
  const bright = hexBrightness(hex);

  let skin = 'unknown';
  if (DARK_SKIN_RE.test(skinTone) || (bright != null && bright < 110)) skin = 'dark';
  else if (FAIR_SKIN_RE.test(skinTone) || (bright != null && bright >= 175)) skin = 'fair';

  let hair = 'unknown';
  if (BLONDE_HAIR_RE.test(hairColor)) hair = 'blonde';
  else if (DARK_HAIR_RE.test(hairColor)) hair = 'dark';

  return { skin, hair, skinTone, hairColor };
}

/**
 * Sample face/skin via skin-like pixels (not whole-crop mean — dark furniture
 * behind a fair face would otherwise look "dark" and miss Eru-style mismatches).
 * @returns {Promise<{ skin: 'dark'|'fair'|'unknown', hair: 'blonde'|'dark'|'unknown', skinBright: number|null, hairBright: number|null }>}
 */
async function sampleImageAppearance(absolutePath) {
  const sharp = require('sharp');
  const { data, info } = await sharp(absolutePath)
    .rotate()
    .resize(128, 128, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const skinBrights = [];
  const topNonSkin = []; // y < 25% — hair/background candidates

  function cxWeight(x, width) {
    return Math.abs(x - width / 2) / (width / 2);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const bright = (r + g + b) / 3;
      const warm = (r + g) / 2 - b;
      // Skin-like: warm undertone; exclude deep brown furniture (too dark)
      const skinLike =
        r >= 90 &&
        r >= g * 0.92 &&
        g >= b - 8 &&
        warm >= 10 &&
        bright >= 95 &&
        bright <= 235 &&
        (r - b) >= 15;

      if (skinLike) {
        // Prefer central face column
        const cx = cxWeight(x, w);
        const cy = y / h;
        if (cx < 0.55 && cy > 0.12 && cy < 0.72) {
          skinBrights.push(bright);
        }
      } else if (y < h * 0.22 && cxWeight(x, w) < 0.65) {
        topNonSkin.push({ bright, warm, r, g, b });
      }
    }
  }

  let skinBright = null;
  if (skinBrights.length >= 8) {
    skinBrights.sort((a, b) => a - b);
    // p70: shadows/furniture false-positives pull the median down on moody portraits
    skinBright = skinBrights[Math.min(skinBrights.length - 1, Math.floor(skinBrights.length * 0.7))];
  }

  let skin = 'unknown';
  if (skinBright != null) {
    if (skinBright < 100) skin = 'dark';
    else if (skinBright >= 130) skin = 'fair'; // dim-lit fair faces often land ~120–150
  }

  let hairBright = null;
  let hair = 'unknown';
  // Blonde hair often sits on the SIDES (voluminous), not only the top band
  const sideHair = [];
  for (let y = Math.floor(h * 0.05); y < Math.floor(h * 0.55); y++) {
    for (let x = 0; x < w; x++) {
      const side = x < w * 0.22 || x > w * 0.78;
      if (!side) continue;
      const i = (y * w + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const bright = (r + g + b) / 3;
      const warm = (r + g) / 2 - b;
      sideHair.push({ bright, warm });
    }
  }
  const hairPool = topNonSkin.concat(sideHair).filter((p) => p.bright > 30);
  if (hairPool.length >= 10) {
    const avgB = hairPool.reduce((s, p) => s + p.bright, 0) / hairPool.length;
    const avgW = hairPool.reduce((s, p) => s + p.warm, 0) / hairPool.length;
    hairBright = avgB;
    const blondeVotes = hairPool.filter((p) => p.bright >= 115 && p.warm > 15).length;
    const darkVotes = hairPool.filter((p) => p.bright < 85).length;
    if (blondeVotes > hairPool.length * 0.18 || (avgB >= 125 && avgW > 12)) hair = 'blonde';
    else if (darkVotes > hairPool.length * 0.4 || avgB < 75) hair = 'dark';
  }

  return { skin, hair, skinBright, hairBright };
}

function resolveAbsoluteAsset(localPath, rootDir) {
  if (!localPath || typeof localPath !== 'string') return null;
  if (localPath.startsWith('http')) return null;
  try {
    const { resolveSafeAssetPath } = require('./safe-paths');
    return resolveSafeAssetPath(localPath);
  } catch (_) {
    const root = rootDir || process.cwd();
    const abs = path.isAbsolute(localPath) ? localPath : path.join(root, localPath);
    return abs;
  }
}

/**
 * @param {string} imagePath - repo-relative or absolute
 * @param {object|string} detailedJSON
 * @param {{ rootDir?: string }} [opts]
 * @returns {Promise<{ conflict: boolean, reason: string|null, lock: object, image: object|null }>}
 */
async function anchorConflictsWithLock(imagePath, detailedJSON, opts = {}) {
  const lock = classifyLockAppearance(detailedJSON);
  if (lock.skin === 'unknown' && lock.hair === 'unknown') {
    return { conflict: false, reason: null, lock, image: null };
  }

  const abs = resolveAbsoluteAsset(imagePath, opts.rootDir);
  if (!abs || !fs.existsSync(abs)) {
    return { conflict: false, reason: null, lock, image: null };
  }

  let image;
  try {
    image = await sampleImageAppearance(abs);
  } catch (err) {
    console.warn('[anchor-lock] sample failed:', err.message);
    return { conflict: false, reason: null, lock, image: null };
  }

  const reasons = [];
  if (lock.skin === 'dark' && image.skin === 'fair') {
    reasons.push(`lock tez oscura (${lock.skinTone || 'dark'}) vs foto clara (bright≈${Math.round(image.skinBright)})`);
  }
  // Soft: deep/dark lock hex + mid-fair portrait samples (moody lighting → skin band "unknown")
  if (
    lock.skin === 'dark' &&
    image.skin === 'unknown' &&
    image.skinBright != null &&
    image.skinBright >= 118
  ) {
    reasons.push(`lock tez oscura (${lock.skinTone || 'dark'}) vs foto más clara (bright≈${Math.round(image.skinBright)})`);
  }
  if (lock.skin === 'fair' && image.skin === 'dark') {
    reasons.push(`lock tez clara (${lock.skinTone || 'fair'}) vs foto oscura (bright≈${Math.round(image.skinBright)})`);
  }
  if (lock.hair === 'dark' && image.hair === 'blonde') {
    reasons.push(`lock pelo oscuro (${lock.hairColor || 'dark'}) vs foto rubia`);
  }
  if (lock.hair === 'blonde' && image.hair === 'dark') {
    reasons.push(`lock pelo rubio (${lock.hairColor || 'blonde'}) vs foto oscura`);
  }

  // Strong conflict: both skin and hair disagree, or dark-lock vs lighter portrait
  const strong =
    reasons.length >= 2 ||
    (lock.skin === 'dark' && lock.hair === 'dark' && (image.skin === 'fair' || image.hair === 'blonde')) ||
    (lock.skin === 'dark' && reasons.some((r) => /tez oscura/i.test(r)));

  return {
    conflict: strong || reasons.length >= 1,
    reason: reasons.length ? reasons.join('; ') : null,
    lock,
    image
  };
}

module.exports = {
  classifyLockAppearance,
  sampleImageAppearance,
  anchorConflictsWithLock,
  DARK_SKIN_RE,
  FAIR_SKIN_RE,
  BLONDE_HAIR_RE,
  DARK_HAIR_RE
};
