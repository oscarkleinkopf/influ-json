/**
 * First-run helpers: SESSION_SECRET persistence, .env upserts, listen host.
 * Free-path safe — no paid APIs. Runs before auth session middleware needs a secret.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROJECT_ROOT } = require('./paths');

const MIN_SETUP_PIN_LENGTH = 6;
const DEFAULT_LISTEN_HOST = '127.0.0.1';

function getEnvPath() {
  if (process.env.INFLU_ENV_PATH && String(process.env.INFLU_ENV_PATH).trim()) {
    return path.resolve(String(process.env.INFLU_ENV_PATH).trim());
  }
  return path.join(PROJECT_ROOT, '.env');
}

/**
 * Upsert KEY=value in .env without rewriting unrelated lines.
 * Creates the file if missing. Also sets process.env[key].
 */
function upsertEnvVar(key, val, envPath = getEnvPath()) {
  const safeKey = String(key || '').trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(safeKey)) {
    throw new Error(`Clave .env inválida: ${key}`);
  }
  if (val === undefined || val === null) {
    throw new Error(`Valor requerido para ${safeKey}`);
  }
  const value = String(val);
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  } else {
    const dir = path.dirname(envPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const line = `${safeKey}=${value}`;
  const regex = new RegExp(`^${safeKey}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    const trimmed = content.replace(/\s*$/, '');
    content = trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
  }
  fs.writeFileSync(envPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  process.env[safeKey] = value;
  return envPath;
}

/**
 * If SESSION_SECRET is unset in process.env, generate one and persist to .env.
 * No-op when already present (tests / production with secret set).
 * Set INFLU_SKIP_ENV_PERSIST=1 to only set process.env (used by npm test).
 */
function ensureSessionSecret(opts = {}) {
  const existing = (process.env.SESSION_SECRET || '').trim();
  if (existing) {
    return { created: false, persisted: false, secret: existing, envPath: getEnvPath() };
  }

  const envPath = opts.envPath || getEnvPath();
  // Explicit opts.skipPersist wins; otherwise honor INFLU_SKIP_ENV_PERSIST (npm test).
  const skipPersist =
    opts.skipPersist === true
      ? true
      : opts.skipPersist === false
        ? false
        : process.env.INFLU_SKIP_ENV_PERSIST === '1' ||
          process.env.INFLU_SKIP_ENV_PERSIST === 'true';

  // Prefer reading from file if present but not yet loaded into process.env
  if (!skipPersist && fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^SESSION_SECRET=(.*)$/m);
    const fromFile = match ? String(match[1] || '').trim() : '';
    if (fromFile) {
      process.env.SESSION_SECRET = fromFile;
      return { created: false, persisted: false, secret: fromFile, envPath };
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');
  if (skipPersist) {
    process.env.SESSION_SECRET = secret;
    return { created: true, persisted: false, secret, envPath };
  }

  upsertEnvVar('SESSION_SECRET', secret, envPath);
  console.log(`[first-run] SESSION_SECRET generado y guardado en ${envPath}`);
  return { created: true, persisted: true, secret, envPath };
}

function resolveListenHost() {
  const raw = process.env.HOST;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_LISTEN_HOST;
  }
  return String(raw).trim();
}

/** True when listening on all interfaces (LAN/WAN exposure). */
function isPublicBind(host = resolveListenHost()) {
  const h = String(host || '').trim().toLowerCase();
  return h === '0.0.0.0' || h === '::' || h === '[::]' || h === '*';
}

function isLoopbackBind(host = resolveListenHost()) {
  const h = String(host || '').trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

/**
 * Network exposure with default PIN is unsafe — callers should block API until PIN changes.
 * Evaluated at request time so change-pin can unlock without restart.
 */
function shouldBlockPublicDefaultPin(isPinDefaultFn) {
  if (typeof isPinDefaultFn !== 'function') return false;
  return isPublicBind() && !!isPinDefaultFn();
}

function validateNewStudioPin(pin, confirmPin) {
  const next = String(pin || '').trim();
  const confirm = confirmPin != null ? String(confirmPin).trim() : next;
  if (next.length < MIN_SETUP_PIN_LENGTH) {
    const err = new Error(`El PIN debe tener al menos ${MIN_SETUP_PIN_LENGTH} caracteres.`);
    err.code = 'PIN_TOO_SHORT';
    throw err;
  }
  if (next === '1234') {
    const err = new Error('Elige un PIN distinto del valor por defecto (1234).');
    err.code = 'PIN_STILL_DEFAULT';
    throw err;
  }
  if (confirm !== next) {
    const err = new Error('Los PIN no coinciden.');
    err.code = 'PIN_MISMATCH';
    throw err;
  }
  return next;
}

module.exports = {
  MIN_SETUP_PIN_LENGTH,
  DEFAULT_LISTEN_HOST,
  getEnvPath,
  upsertEnvVar,
  ensureSessionSecret,
  resolveListenHost,
  isPublicBind,
  isLoopbackBind,
  shouldBlockPublicDefaultPin,
  validateNewStudioPin
};
