/**
 * Path and URL guards for market-facing Studio (light security).
 * Keep image reads inside project/assets (+ DATA_DIR); block SSRF to private nets.
 */
const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT, DATA_DIR } = require('./paths');

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isInsideDir(candidate, rootDir) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(candidate);
  const rel = path.relative(root, resolved);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve a local image path for read/upload. Rejects escapes outside project + DATA_DIR.
 * @param {string} localPath relative or absolute path from client/API
 * @returns {string} absolute path
 */
function resolveSafeLocalImagePath(localPath) {
  if (!localPath || typeof localPath !== 'string') {
    throw new Error('Ruta de imagen inválida.');
  }
  const trimmed = localPath.trim();
  if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file:')) {
    throw new Error('Ruta de imagen local inválida.');
  }
  if (trimmed.includes('\0')) {
    throw new Error('Ruta de imagen inválida.');
  }

  const absolute = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(PROJECT_ROOT, trimmed);

  const allowedRoots = [
    path.join(PROJECT_ROOT, 'assets'),
    DATA_DIR,
    PROJECT_ROOT
  ];

  const underAllowed = allowedRoots.some((root) => isInsideDir(absolute, root));
  if (!underAllowed) {
    throw new Error('Ruta de imagen fuera del directorio permitido.');
  }

  // Prefer assets/ and DATA_DIR over arbitrary project files (e.g. .env)
  const underAssetsOrData =
    isInsideDir(absolute, path.join(PROJECT_ROOT, 'assets')) ||
    isInsideDir(absolute, DATA_DIR);
  if (!underAssetsOrData) {
    throw new Error('Solo se permiten imágenes bajo assets/ o DATA_DIR.');
  }

  const ext = path.extname(absolute).toLowerCase();
  if (ext && !ALLOWED_IMAGE_EXT.has(ext)) {
    throw new Error('Extensión de imagen no permitida.');
  }

  if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isDirectory()) {
    throw new Error('Archivo de imagen no encontrado.');
  }

  return absolute;
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  if (host === 'metadata.google.internal' || host === 'metadata' || host.endsWith('.internal')) {
    return true;
  }

  // IPv6 local / link-local / ULA
  if (host.includes(':')) {
    if (
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host === '::'
    ) {
      return true;
    }
    return false;
  }

  const n = ipv4ToInt(host);
  if (n == null) return false; // public DNS name — allow (resolve-time SSRF still possible; block obvious literals)

  const ranges = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
    [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')]
  ];
  return ranges.some(([a, b]) => n >= a && n <= b);
}

/**
 * Assert URL is http(s) and not clearly private/local (SSRF guard for URL import).
 * @param {string} inputUrl
 * @returns {URL}
 */
function assertPublicHttpUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(String(inputUrl || '').trim());
  } catch {
    throw new Error('URL inválida.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs http(s).');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL con credenciales no permitida.');
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error('URL apunta a un host local o privado (bloqueado).');
  }
  return parsed;
}

module.exports = {
  resolveSafeLocalImagePath,
  assertPublicHttpUrl,
  isPrivateOrLocalHostname,
  isInsideDir,
  ALLOWED_IMAGE_EXT
};
