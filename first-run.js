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
 * Rechaza CR/LF/NUL; escritura temporal + rename; chmod 0600 en POSIX.
 */
function assertSafeEnvValue(val, keyLabel) {
  const value = String(val);
  if (/[\r\n\0]/.test(value)) {
    const err = new Error(
      `Valor de ${keyLabel || 'variable'} inválido: no se permiten saltos de línea ni NUL.`
    );
    err.code = 'ENV_VALUE_UNSAFE';
    throw err;
  }
  return value;
}

function upsertEnvVar(key, val, envPath = getEnvPath()) {
  const safeKey = String(key || '').trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(safeKey)) {
    throw new Error(`Clave .env inválida: ${key}`);
  }
  if (val === undefined || val === null) {
    throw new Error(`Valor requerido para ${safeKey}`);
  }
  const value = assertSafeEnvValue(val, safeKey);
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
  const finalContent = content.endsWith('\n') ? content : `${content}\n`;
  const dir = path.dirname(envPath);
  const tmp = path.join(dir, `.env.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, finalContent, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, envPath);
  try {
    if (process.platform !== 'win32') fs.chmodSync(envPath, 0o600);
  } catch (_) { /* ignore chmod failures on exotic FS */ }
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
 * Network exposure with insecure auth is unsafe — callers should block API until fixed.
 * Cases:
 *  - public bind + default PIN (1234)
 *  - public bind + auth disabled (STUDIO_PIN empty)  ← worse than default PIN
 * Evaluated at request time so change-pin / .env reload can unlock without restart.
 *
 * @param {{ isPinDefault?: Function|boolean, isAuthEnabled?: Function|boolean }} opts
 */
function shouldBlockPublicInsecureAuth(opts = {}) {
  if (!isPublicBind()) return false;
  const authOn = typeof opts.isAuthEnabled === 'function'
    ? !!opts.isAuthEnabled()
    : (opts.isAuthEnabled != null ? !!opts.isAuthEnabled : true);
  if (!authOn) return true;
  const pinDefault = typeof opts.isPinDefault === 'function'
    ? !!opts.isPinDefault()
    : !!opts.isPinDefault;
  return !!pinDefault;
}

/** @deprecated Prefer shouldBlockPublicInsecureAuth — kept for callers/tests. */
function shouldBlockPublicDefaultPin(isPinDefaultFn, isAuthEnabledFn) {
  return shouldBlockPublicInsecureAuth({
    isPinDefault: isPinDefaultFn,
    isAuthEnabled: isAuthEnabledFn
  });
}

/**
 * Why public bind is blocked (null if safe).
 * @returns {'AUTH_DISABLED'|'DEFAULT_PIN'|null}
 */
function getPublicBindBlockReason(opts = {}) {
  if (!shouldBlockPublicInsecureAuth(opts)) return null;
  const authOn = typeof opts.isAuthEnabled === 'function'
    ? !!opts.isAuthEnabled()
    : (opts.isAuthEnabled != null ? !!opts.isAuthEnabled : true);
  if (!authOn) return 'AUTH_DISABLED';
  return 'DEFAULT_PIN';
}

function publicBindBlockMessage(reason) {
  if (reason === 'AUTH_DISABLED') {
    return 'Studio expuesto en red (HOST=0.0.0.0) sin autenticación (STUDIO_PIN vacío). Define un PIN en .env o usa HOST=127.0.0.1.';
  }
  return 'Studio expuesto en red (HOST=0.0.0.0) con PIN por defecto. Cambia el PIN en el asistente de primer arranque antes de continuar.';
}

function validateNewStudioPin(pin, confirmPin) {
  const next = String(pin || '').trim();
  const confirm = confirmPin != null ? String(confirmPin).trim() : next;
  if (/[\r\n\0]/.test(String(pin || '')) || /[\r\n\0]/.test(String(confirmPin || ''))) {
    const err = new Error('El PIN no puede contener saltos de línea.');
    err.code = 'PIN_UNSAFE_CHARS';
    throw err;
  }
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
  assertSafeEnvValue,
  ensureSessionSecret,
  resolveListenHost,
  isPublicBind,
  isLoopbackBind,
  shouldBlockPublicInsecureAuth,
  shouldBlockPublicDefaultPin,
  getPublicBindBlockReason,
  publicBindBlockMessage,
  validateNewStudioPin
};
