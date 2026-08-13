/**
 * Helpers de seguridad local (Paso 2 HANDOFF):
 * - Rutas de assets acotadas al proyecto / DATA_DIR
 * - URLs remotas sin SSRF a redes privadas / link-local
 * - IPv4-mapped IPv6, puertos 80/443, resolución DNS (anti-rebinding básico)
 */
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { URL } = require('url');
const { PROJECT_ROOT, DATA_DIR } = require('./paths');

const UNSAFE_PATH = 'UNSAFE_PATH';
const UNSAFE_URL = 'UNSAFE_URL';

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * ¿Auto git backup habilitado?
 * Opt-in: solo con ENABLE_GIT_BACKUP=1.
 * DISABLE_GIT_BACKUP=1 siempre lo apaga (tests / CI).
 */
function isGitBackupEnabled() {
  if (process.env.DISABLE_GIT_BACKUP === '1' || process.env.DISABLE_GIT_BACKUP === 'true') {
    return false;
  }
  return process.env.ENABLE_GIT_BACKUP === '1' || process.env.ENABLE_GIT_BACKUP === 'true';
}

/**
 * Resuelve una ruta de asset local y la valida contra raíces permitidas.
 * @param {string} inputPath
 * @param {{ projectRoot?: string, dataDir?: string }} [opts]
 * @returns {string} absolute path
 */
function resolveSafeAssetPath(inputPath, opts = {}) {
  if (inputPath == null || typeof inputPath !== 'string' || !inputPath.trim()) {
    throw makeError(UNSAFE_PATH, 'Ruta de archivo inválida.');
  }
  if (inputPath.includes('\0')) {
    throw makeError(UNSAFE_PATH, 'Ruta de archivo inválida.');
  }

  const projectRoot = path.resolve(opts.projectRoot || PROJECT_ROOT);
  const dataDir = path.resolve(opts.dataDir || DATA_DIR);

  // Paths absolutos solo si ya están bajo una raíz permitida
  let candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(projectRoot, inputPath);

  // UX detalles / harness: refs y generated pueden vivir solo en DATA_DIR
  // (multer escribe ahí con INFLU_TEST_UPLOADS / INFLU_SKIP_DB_MIGRATE).
  if (!path.isAbsolute(inputPath)) {
    const remap = (prefix, sub) => {
      if (!inputPath.startsWith(prefix)) return;
      const name = inputPath.slice(prefix.length);
      if (!name || name.includes('..')) return;
      const underData = path.resolve(dataDir, sub, name);
      const isolate =
        process.env.INFLU_TEST_UPLOADS === '1' ||
        process.env.INFLU_SKIP_DB_MIGRATE === '1';
      if (fs.existsSync(underData)) {
        candidate = underData;
      } else if (isolate && !fs.existsSync(candidate)) {
        // New uploads land in DATA_DIR during tests
        candidate = underData;
      }
    };
    remap('assets/references/', 'references');
    remap('assets/generated/', 'generated');
  }

  const allowedRoots = [
    path.join(projectRoot, 'assets', 'references'),
    path.join(projectRoot, 'assets', 'generated'),
    path.join(projectRoot, 'assets'), // avatares por defecto (influencer_*.png)
    path.join(dataDir, 'references'),
    path.join(dataDir, 'generated'),
    dataDir
  ].map((r) => path.resolve(r));

  const isInside = allowedRoots.some((root) => {
    return candidate === root || candidate.startsWith(root + path.sep);
  });

  if (!isInside) {
    throw makeError(UNSAFE_PATH, 'Ruta de archivo fuera del área permitida.');
  }

  return candidate;
}

function ipv4Parts(host) {
  const m = String(host).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map((n) => Number(n));
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

/**
 * Extrae IPv4 de formas IPv4-mapped IPv6 (::ffff:127.0.0.1 o ::ffff:7f00:1).
 * @param {string} host
 * @returns {string|null} dotted IPv4 o null
 */
function extractIpv4Mapped(host) {
  const h = String(host || '').toLowerCase();
  const dotted = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

/** Hostname sin brackets; IPv4-mapped colapsado a dotted quad. */
function normalizeHostname(hostname) {
  let host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = extractIpv4Mapped(host);
  return mapped || host;
}

function getAllowedRemotePorts() {
  const raw = process.env.REMOTE_IMAGE_ALLOWED_PORTS;
  if (raw == null || String(raw).trim() === '') return [80, 443];
  return String(raw)
    .split(',')
    .map((p) => Number(String(p).trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 65535);
}

function assertSafeRemotePort(parsed) {
  const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
  const port = parsed.port ? Number(parsed.port) : defaultPort;
  const allowed = getAllowedRemotePorts();
  if (!allowed.includes(port)) {
    throw makeError(
      UNSAFE_URL,
      `Puerto remoto no permitido (${port}). Solo ${allowed.join('/')}.`
    );
  }
  return port;
}

function isPrivateOrLocalHost(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host === '0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  }

  // IPv6 locales / ULA / link-local (forma textual básica)
  if (host.includes(':')) {
    if (host === '::1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('fe80')) return true;
  }

  return false;
}

/**
 * Valida URL remota para descarga de referencias (anti-SSRF) — checks síncronos.
 * @param {string} inputUrl
 * @returns {URL}
 */
function assertSafeRemoteImageUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw makeError(UNSAFE_URL, 'URL inválida.');
  }
  let parsed;
  try {
    parsed = new URL(inputUrl.trim());
  } catch (_) {
    throw makeError(UNSAFE_URL, 'URL inválida.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw makeError(UNSAFE_URL, 'Solo se permiten URLs http(s).');
  }
  if (parsed.username || parsed.password) {
    throw makeError(UNSAFE_URL, 'URL con credenciales no permitida.');
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw makeError(UNSAFE_URL, 'URL apunta a una red privada o local (bloqueada).');
  }
  assertSafeRemotePort(parsed);
  return parsed;
}

/**
 * Además de assertSafeRemoteImageUrl, resuelve DNS y rechaza A/AAAA privadas.
 * @param {string} inputUrl
 * @param {{ lookup?: Function }} [opts] lookup(hostname, { all: true }) → [{ address, family }]
 * @returns {Promise<URL>}
 */
async function assertSafeRemoteImageUrlResolved(inputUrl, opts = {}) {
  const parsed = assertSafeRemoteImageUrl(inputUrl);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // Literal IP ya cubierta por isPrivateOrLocalHost; no hace falta lookup.
  if (ipv4Parts(normalizeHostname(host)) || host.includes(':')) {
    return parsed;
  }

  const lookupFn =
    opts.lookup ||
    ((hostname, options) =>
      new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true, verbatim: true, ...(options || {}) }, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      }));

  let addresses;
  try {
    addresses = await lookupFn(host, { all: true });
  } catch (err) {
    throw makeError(UNSAFE_URL, `No se pudo resolver el host remoto: ${err.message || 'DNS'}`);
  }

  const list = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];
  if (list.length === 0) {
    throw makeError(UNSAFE_URL, 'El host remoto no resolvió ninguna dirección.');
  }

  for (const entry of list) {
    const addr = typeof entry === 'string' ? entry : entry.address;
    if (isPrivateOrLocalHost(addr)) {
      throw makeError(
        UNSAFE_URL,
        'URL resuelve a una red privada o local (bloqueada).'
      );
    }
  }

  return parsed;
}

module.exports = {
  UNSAFE_PATH,
  UNSAFE_URL,
  isGitBackupEnabled,
  resolveSafeAssetPath,
  assertSafeRemoteImageUrl,
  assertSafeRemoteImageUrlResolved,
  isPrivateOrLocalHost,
  normalizeHostname,
  extractIpv4Mapped,
  getAllowedRemotePorts
};
