/**
 * Consistency score — dHash local (PLAN W4).
 * Señal grosera de composición/color ancla↔variante. NO es face-lock.
 * Umbrales calibrados con imágenes sintéticas sharp; ajustar con fotos reales.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PROJECT_ROOT } = require('./paths');

/** Hamming ≤8 → ok · 9–14 → warn · >14 → bad */
const THRESHOLDS = Object.freeze({
  okMax: 8,
  warnMax: 14
});

function resolveImagePath(relOrAbs) {
  if (!relOrAbs) return null;
  const raw = String(relOrAbs).trim();
  if (!raw || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return null;
  }
  if (path.isAbsolute(raw)) return raw;
  return path.join(PROJECT_ROOT, raw.replace(/^\.?[/\\]/, ''));
}

/**
 * Difference hash 64-bit as 16-char hex.
 * Resize 9×8 grayscale; bit = pixel[x] > pixel[x+1] per row.
 */
async function hashImage(relOrAbs) {
  const abs = resolveImagePath(relOrAbs);
  if (!abs || !fs.existsSync(abs)) {
    const err = new Error('Imagen no encontrada para hash de consistencia.');
    err.code = 'HASH_MISSING';
    throw err;
  }

  const raw = await sharp(abs, { failOn: 'none' })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  if (raw.length < 72) {
    const err = new Error('No se pudo calcular dHash (buffer corto).');
    err.code = 'HASH_FAILED';
    throw err;
  }

  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB) return null;
  const a = BigInt(`0x${String(hashA)}`);
  const b = BigInt(`0x${String(hashB)}`);
  let x = a ^ b;
  let dist = 0;
  while (x > 0n) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return dist;
}

function gradeFromDistance(distance) {
  if (distance == null || Number.isNaN(distance)) {
    return { grade: 'unknown', label: 'Sin score', tone: 'muted' };
  }
  const d = Number(distance);
  if (d <= THRESHOLDS.okMax) {
    return { grade: 'ok', label: 'Consistente', tone: 'ok' };
  }
  if (d <= THRESHOLDS.warnMax) {
    return { grade: 'warn', label: 'Revisar', tone: 'warn' };
  }
  return { grade: 'bad', label: 'Drift', tone: 'bad' };
}

/**
 * Compara variante vs ancla. Devuelve distance + grade.
 * @param {string} anchorPath
 * @param {string} variantPath
 */
async function scoreAgainstAnchor(anchorPath, variantPath) {
  const [anchorHash, variantHash] = await Promise.all([
    hashImage(anchorPath),
    hashImage(variantPath)
  ]);
  const distance = hammingDistance(anchorHash, variantHash);
  const graded = gradeFromDistance(distance);
  return {
    distance,
    grade: graded.grade,
    label: graded.label,
    tone: graded.tone,
    anchorHash,
    variantHash,
    anchorPath: String(anchorPath || ''),
    note: 'Señal grosera de composición/color — no es face-lock.'
  };
}

function summarizeScores(variants) {
  const scored = (variants || []).filter(
    (v) => v && v.consistency_distance != null && !Number.isNaN(Number(v.consistency_distance))
  );
  if (!scored.length) {
    return { count: 0, avgDistance: null, worstGrade: 'unknown' };
  }
  const sum = scored.reduce((acc, v) => acc + Number(v.consistency_distance), 0);
  const avgDistance = Math.round((sum / scored.length) * 10) / 10;
  let worstGrade = 'ok';
  for (const v of scored) {
    const g = String(v.consistency_grade || gradeFromDistance(v.consistency_distance).grade);
    if (g === 'bad') worstGrade = 'bad';
    else if (g === 'warn' && worstGrade !== 'bad') worstGrade = 'warn';
  }
  return { count: scored.length, avgDistance, worstGrade };
}

module.exports = {
  THRESHOLDS,
  hashImage,
  hammingDistance,
  gradeFromDistance,
  scoreAgainstAnchor,
  summarizeScores,
  resolveImagePath
};
