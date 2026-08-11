/**
 * Thumbs de portafolio: evita servir fixtures 8×8 (bloque amarillo/peach) o rutas rotas.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');
const { resolveSafeAssetPath } = require('./safe-paths');

const DEFAULT_PERSONA_THUMB = 'assets/influencer_female.png';
/** Por debajo de esto suele ser JPEG 8×8 de harness (amarillo al escalar). */
const MIN_THUMB_BYTES = 2048;

function resolveExistingAssetFile(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  const rel = imagePath.trim().replace(/^\/+/, '');
  if (!rel) return null;

  const candidates = [];
  try {
    candidates.push(resolveSafeAssetPath(rel));
  } catch (_) {
    /* ignore unsafe */
  }

  const base = path.basename(rel);
  if (rel.startsWith('assets/references/') || rel.includes('/references/')) {
    candidates.push(path.join(DATA_DIR, 'references', base));
    candidates.push(path.join(__dirname, 'assets', 'references', base));
  } else if (rel.startsWith('assets/generated/') || rel.includes('/generated/')) {
    candidates.push(path.join(DATA_DIR, 'generated', base));
    candidates.push(path.join(__dirname, 'assets', 'generated', base));
  } else if (rel.startsWith('assets/')) {
    candidates.push(path.join(__dirname, rel));
  }

  for (const abs of candidates) {
    if (!abs) continue;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch (_) {
      /* skip */
    }
  }
  return null;
}

/**
 * Ruta relativa a usar en <img src> del roster.
 * Si el archivo no existe o es un fixture minúsculo → avatar por defecto.
 */
function resolvePersonaDisplayImage(imagePath) {
  const abs = resolveExistingAssetFile(imagePath);
  if (!abs) return DEFAULT_PERSONA_THUMB;
  try {
    if (fs.statSync(abs).size < MIN_THUMB_BYTES) return DEFAULT_PERSONA_THUMB;
  } catch (_) {
    return DEFAULT_PERSONA_THUMB;
  }
  return String(imagePath).trim().replace(/^\/+/, '') || DEFAULT_PERSONA_THUMB;
}

function mapPersonasDisplayImages(personas) {
  if (!Array.isArray(personas)) return [];
  return personas.map((p) => {
    if (!p || typeof p !== 'object') return p;
    return { ...p, image: resolvePersonaDisplayImage(p.image) };
  });
}

module.exports = {
  DEFAULT_PERSONA_THUMB,
  MIN_THUMB_BYTES,
  resolveExistingAssetFile,
  resolvePersonaDisplayImage,
  mapPersonasDisplayImages
};
