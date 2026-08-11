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
  function warmish(r, g, b) {
    return (r + g) / 2 - b;
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
    // Honey/blonde in dim light: warm midtones (not near-black furniture)
    const honeyVotes = hairPool.filter(
      (p) => p.warm > 22 && p.bright >= 50 && p.bright < 160
    ).length;
    const darkVotes = hairPool.filter((p) => p.bright < 55 && p.warm < 25).length;
    if (
      blondeVotes > hairPool.length * 0.15 ||
      honeyVotes > hairPool.length * 0.22 ||
      (avgB >= 110 && avgW > 18)
    ) {
      hair = 'blonde';
    } else if (darkVotes > hairPool.length * 0.4 || (avgB < 70 && avgW < 20)) {
      hair = 'dark';
    }
  }

  // Eye band (approx iris region): cool bright pixels → blue/green; warm → brown
  const eyeSamples = [];
  for (let y = Math.floor(h * 0.28); y < Math.floor(h * 0.42); y++) {
    for (let x = Math.floor(w * 0.32); x < Math.floor(w * 0.68); x++) {
      const i = (y * w + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const bright = (r + g + b) / 3;
      // Skip skin-like, sclera-white, and pupil-black
      const skinLike = r >= 95 && r >= g * 0.92 && warmish(r, g, b) >= 10 && (r - b) >= 15;
      if (skinLike || bright > 210 || bright < 40) continue;
      eyeSamples.push({ r, g, b, bright });
    }
  }

  let eyes = 'unknown';
  let eyeLabel = null;
  if (eyeSamples.length >= 6) {
    const avgR = eyeSamples.reduce((s, p) => s + p.r, 0) / eyeSamples.length;
    const avgG = eyeSamples.reduce((s, p) => s + p.g, 0) / eyeSamples.length;
    const avgB = eyeSamples.reduce((s, p) => s + p.b, 0) / eyeSamples.length;
    if (avgB > avgR + 8 && avgB >= avgG - 2) {
      eyes = 'blue';
      eyeLabel = 'Azul claro / cristalino';
    } else if (avgG > avgR + 5 && avgG >= avgB - 5) {
      eyes = 'green';
      eyeLabel = 'Verde / avellana claro';
    } else if (avgR > avgB + 15 && (avgR + avgG + avgB) / 3 < 140) {
      eyes = 'brown';
      eyeLabel = 'Marrón cálido';
    } else if ((avgR + avgG + avgB) / 3 >= 120) {
      eyes = 'light';
      eyeLabel = 'Ojos claros (según foto de referencia)';
    }
  }

  return { skin, hair, skinBright, hairBright, eyes, eyeLabel };
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

/** True when portrait is an intentional inspiration upload (Tomar Inspiración / ref_*). */
function isInspirationPortrait(imagePath, detailedJSON) {
  const d = parseDetailed(detailedJSON);
  if (d.inspired_from_photo === true || d.anchor_source === 'inspiration_upload') return true;
  if (!imagePath) return false;
  const s = String(imagePath).replace(/\\/g, '/');
  return /(?:^|\/)assets\/references\/ref_/i.test(s) || /(?:^|\/)references\/ref_/i.test(s);
}

/**
 * Labels derived from photo sampling — used to sync character_lock FROM inspiration.
 */
function appearanceLabelsFromSample(sample) {
  if (!sample) return null;
  const out = {};
  if (sample.skin === 'fair') {
    out.skin_tone = 'Piel clara / beige claro / tez blanca';
    out.skin_tone_hex = '#f0d5c0';
    out.ethnicity_hint = 'Europea / Latina de tez clara';
    out.skin_lock = 'fair light porcelain-beige skin, NOT dark, NOT morena';
    out.skin_avoid = 'dark skin, deep tan, morena';
  } else if (sample.skin === 'dark') {
    out.skin_tone = 'Piel morena / media-oscura';
    out.skin_tone_hex = '#8d5524';
    out.skin_lock = 'medium-dark / deep skin tone';
    out.skin_avoid = 'pale skin, whitewashed';
  }
  if (sample.hair === 'blonde') {
    out.hair_color = 'Rubio dorado / rubia natural';
    out.hair_color_hex = '#d4b483';
  } else if (sample.hair === 'dark') {
    out.hair_color = 'Castaño oscuro / negro';
    out.hair_color_hex = '#3d2314';
  }
  if (sample.eyeLabel) {
    out.eye_color = sample.eyeLabel;
  } else if (sample.eyes === 'blue') {
    out.eye_color = 'Azul claro / cristalino';
  }
  return out;
}

/**
 * Sync detailedJSON appearance FROM the inspiration photo (photo wins over wrong defaults).
 * Marks inspired_from_photo so variants keep face-anchoring the upload.
 */
async function enrichDetailedFromInspiration(imagePath, detailedJSON, opts = {}) {
  const base = parseDetailed(detailedJSON);
  const abs = resolveAbsoluteAsset(imagePath, opts.rootDir);
  if (!abs || !fs.existsSync(abs)) {
    return {
      ...base,
      inspired_from_photo: true,
      anchor_source: 'inspiration_upload',
      anchor_reference: imagePath || base.anchor_reference || null
    };
  }

  let sample = null;
  try {
    sample = await sampleImageAppearance(abs);
  } catch (err) {
    console.warn('[anchor-lock] enrich sample failed:', err.message);
  }
  const labels = appearanceLabelsFromSample(sample) || {};

  if (!base.identity) base.identity = {};
  if (!base.facial_features) base.facial_features = {};
  if (!base.hair) base.hair = {};
  if (!base.character_lock) base.character_lock = { version: 1, free_tier: true, must_match_every_image: {} };
  if (!base.character_lock.must_match_every_image) base.character_lock.must_match_every_image = {};

  const lockSkin = classifyLockAppearance(base).skin;
  const lockHair = classifyLockAppearance(base).hair;
  const weakEyes = !base.facial_features.eye_color
    || /marr[oó]n\s*oscuro|brown\s*dark|^marr[oó]n$/i.test(String(base.facial_features.eye_color));
  const weakHair = !base.hair.color || lockHair === 'dark' || /casta[nñ]o\s*oscuro|negro|black/i.test(String(base.hair.color));
  const weakSkin = !base.facial_features.skin_tone || lockSkin === 'dark'
    || /morena|oscura|profunda/i.test(String(base.facial_features.skin_tone));

  // Photo wins when sample is confident OR stored lock looks like Latina/morena defaults
  if (labels.skin_tone && (sample?.skin === 'fair' || weakSkin)) {
    base.facial_features.skin_tone = labels.skin_tone;
    if (labels.skin_tone_hex) base.facial_features.skin_tone_hex = labels.skin_tone_hex;
    if (labels.skin_lock) base.facial_features.skin_lock = labels.skin_lock;
    if (labels.skin_avoid) base.facial_features.skin_avoid = labels.skin_avoid;
    if (labels.ethnicity_hint && (!base.identity.ethnicity_appearance || /latina$/i.test(base.identity.ethnicity_appearance))) {
      base.identity.ethnicity_appearance = labels.ethnicity_hint;
    }
  }
  // Prefer blonde from sample; never "upgrade" unknown→dark over an existing blonde lock
  if (labels.hair_color && sample?.hair === 'blonde') {
    base.hair.color = labels.hair_color;
    if (labels.hair_color_hex) base.hair.color_hex = labels.hair_color_hex;
  } else if (weakHair && sample?.skin === 'fair') {
    // Fair inspiration + weak/dark defaults: prefer blonde cue (dim photos often miss honey hair)
    base.hair.color = 'Rubio dorado / rubia natural';
    base.hair.color_hex = labels.hair_color_hex || '#d4b483';
  }
  if (labels.eye_color && (weakEyes || sample?.eyes === 'blue' || sample?.eyes === 'green' || sample?.eyes === 'light')) {
    base.facial_features.eye_color = labels.eye_color;
  }
  // Fair + blonde/inspire: warm cafe lighting often mis-labels light eyes as brown — prefer light cue
  if (
    sample?.skin === 'fair' &&
    (sample?.hair === 'blonde' || /rubio|blonde/i.test(String(base.hair.color || ''))) &&
    (sample?.eyes === 'brown' || weakEyes)
  ) {
    base.facial_features.eye_color = 'Ojos claros (azul / gris / hazel según foto de referencia)';
  }
  // Capability: if caller hints blue eyes (form/import) keep them when photo eyes unknown
  if (opts.preferEyeColor) {
    base.facial_features.eye_color = opts.preferEyeColor;
  }

  const must = base.character_lock.must_match_every_image;
  must.skin_tone = base.facial_features.skin_tone;
  must.skin_tone_hex = base.facial_features.skin_tone_hex;
  must.hair_color = base.hair.color;
  must.hair_color_hex = base.hair.color_hex || null;
  must.eye_color = base.facial_features.eye_color;
  must.ethnicity = base.identity.ethnicity_appearance;

  base.inspired_from_photo = true;
  base.anchor_source = 'inspiration_upload';
  base.anchor_reference = imagePath || base.anchor_reference || null;
  if (sample) base.inspiration_sample = {
    skin: sample.skin,
    hair: sample.hair,
    eyes: sample.eyes,
    skinBright: sample.skinBright
  };

  return base;
}

/**
 * Strip prompt fragments that fight an inspiration photo (e.g. SKIN LOCK morena on a blonde ref).
 */
function reconcilePromptWithInspiration(prompt, detailedJSON) {
  let p = String(prompt || '');
  const d = parseDetailed(detailedJSON);
  const f = d.facial_features || {};
  const h = d.hair || {};
  // Drop dark-skin locks that contradict fair inspiration
  if (FAIR_SKIN_RE.test(f.skin_tone || '') || /NOT dark|porcelain|beige claro/i.test(f.skin_lock || '')) {
    p = p.replace(/\.?\s*SKIN LOCK:[^.]*morena[^.]*\./gi, '.');
    p = p.replace(/\.?\s*SKIN LOCK:[^.]*deep\/dark[^.]*\./gi, '.');
    p = p.replace(/\bPiel morena oscura[^,.]*/gi, f.skin_tone || 'Piel clara');
    p = p.replace(/\bNegro\s+hair\b/gi, `${h.color || 'Rubio'} hair`);
  }
  const reinforce = [
    f.skin_tone && `SKIN LOCK: ${f.skin_tone}${f.skin_tone_hex ? ` hex ${f.skin_tone_hex}` : ''}, ${f.skin_lock || 'fair light skin'}`,
    h.color && `HAIR LOCK: ${h.color}`,
    f.eye_color && `EYES: ${f.eye_color}`
  ].filter(Boolean).join('. ');
  if (reinforce && !/HAIR LOCK:/i.test(p)) {
    p = `${p}. ${reinforce}`.replace(/\s+/g, ' ').trim();
  }
  return p;
}

module.exports = {
  classifyLockAppearance,
  sampleImageAppearance,
  anchorConflictsWithLock,
  isInspirationPortrait,
  appearanceLabelsFromSample,
  enrichDetailedFromInspiration,
  reconcilePromptWithInspiration,
  DARK_SKIN_RE,
  FAIR_SKIN_RE,
  BLONDE_HAIR_RE,
  DARK_HAIR_RE
};
