/**
 * Validación de imágenes subidas — magic bytes vía sharp (PLAN W3).
 * Rechaza basura / SVG / formatos no raster. No requiere APIs de pago.
 */
const fs = require('fs');
const sharp = require('sharp');

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

function makeInvalidImageError(message) {
  const err = new Error(message || 'El archivo no es una imagen válida.');
  err.code = 'INVALID_IMAGE';
  return err;
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ format: string, width?: number, height?: number }>}
 */
async function assertValidImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    throw makeInvalidImageError('El archivo no es una imagen válida.');
  }

  // Rechazo rápido de SVG (texto) aunque el MIME diga image/svg+xml
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').toLowerCase();
  if (head.includes('<svg') || head.includes('<?xml')) {
    throw makeInvalidImageError('SVG no está permitido. Usa JPG, PNG, WebP o GIF.');
  }

  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (_) {
    throw makeInvalidImageError('El archivo no es una imagen válida.');
  }

  const format = String(meta.format || '').toLowerCase();
  if (!ALLOWED_FORMATS.has(format)) {
    throw makeInvalidImageError(
      format === 'svg'
        ? 'SVG no está permitido. Usa JPG, PNG, WebP o GIF.'
        : `Formato de imagen no soportado (${format || 'desconocido'}). Usa JPG, PNG, WebP o GIF.`
    );
  }

  if (!meta.width || !meta.height || meta.width < 1 || meta.height < 1) {
    throw makeInvalidImageError('La imagen no tiene dimensiones válidas.');
  }

  return { format, width: meta.width, height: meta.height };
}

/**
 * Valida un archivo en disco. Si falla, lo elimina (y opcionales extras).
 * @param {string} absPath
 * @param {{ alsoUnlink?: string[] }} [opts]
 */
async function assertValidImageFile(absPath, opts = {}) {
  let buffer;
  try {
    buffer = fs.readFileSync(absPath);
  } catch (_) {
    throw makeInvalidImageError('No se pudo leer el archivo subido.');
  }

  try {
    return await assertValidImageBuffer(buffer);
  } catch (err) {
    safeUnlink(absPath);
    for (const p of opts.alsoUnlink || []) safeUnlink(p);
    throw err;
  }
}

function safeUnlink(p) {
  if (!p) return;
  try {
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) fs.unlinkSync(p);
  } catch (_) {}
}

/** JPEG mínimo sintético para tests (no es basura de bytes). */
async function makeTestJpegBuffer(opts = {}) {
  const width = opts.width || 8;
  const height = opts.height || 8;
  const background = opts.background || '#a86b4c';
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background
    }
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

module.exports = {
  ALLOWED_FORMATS,
  assertValidImageBuffer,
  assertValidImageFile,
  makeTestJpegBuffer,
  makeInvalidImageError,
  safeUnlink
};
