const expressSession = require('express-session');
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Resolve studio PIN.
 * - STUDIO_AUTH_DISABLED=1 → auth off
 * - STUDIO_PIN set (including empty) → use that value (empty = auth off)
 * - production without STUDIO_PIN → misconfigured (auth required, no default)
 * - local/dev without STUDIO_PIN → default "1234" for DX only
 */
function resolveConfiguredPin() {
  if (process.env.STUDIO_AUTH_DISABLED === '1' || process.env.STUDIO_AUTH_DISABLED === 'true') {
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(process.env, 'STUDIO_PIN')) {
    return String(process.env.STUDIO_PIN || '').trim();
  }
  if (isProd) {
    console.warn('[auth] NODE_ENV=production without STUDIO_PIN — set STUDIO_PIN or STUDIO_AUTH_DISABLED=1');
    return null;
  }
  return '1234';
}

const CONFIGURED_PIN = resolveConfiguredPin();

function isAuthEnabled() {
  return CONFIGURED_PIN !== null && CONFIGURED_PIN !== '';
}

function pinRequiredForStatus() {
  return isAuthEnabled();
}

const sessionSecret = (process.env.SESSION_SECRET || '').trim()
  || (isProd ? crypto.randomBytes(32).toString('hex') : 'influ-json-dev-only-session-secret');

if (isProd && !(process.env.SESSION_SECRET || '').trim()) {
  console.warn('[auth] SESSION_SECRET missing in production — generated ephemeral secret (sessions reset on restart). Set SESSION_SECRET in .env');
}

const sessionMiddleware = expressSession({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true'
  }
});

/** Simple in-memory login rate limit (per IP). */
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function getClientKey(req) {
  return (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString();
}

function checkLoginRateLimit(req) {
  const key = getClientKey(req);
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    loginAttempts.set(key, entry);
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfterSec };
  }
  return { ok: true, entry };
}

function recordLoginFailure(req) {
  const checked = checkLoginRateLimit(req);
  if (checked.entry) checked.entry.count += 1;
}

function clearLoginFailures(req) {
  loginAttempts.delete(getClientKey(req));
}

function requireAuth(req, res, next) {
  if (!isAuthEnabled()) {
    return next();
  }

  if (CONFIGURED_PIN === null) {
    return res.status(503).json({
      success: false,
      message: 'Auth mal configurada: define STUDIO_PIN o STUDIO_AUTH_DISABLED=1.'
    });
  }

  if (req.session && req.session.authenticated) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === CONFIGURED_PIN) {
      if (req.session) req.session.authenticated = true;
      return next();
    }
  }

  res.status(401).json({ success: false, message: 'Acceso denegado. PIN inválido o sesión expirada.' });
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  isAuthEnabled,
  pinRequiredForStatus,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  verifyPin(pin) {
    if (!isAuthEnabled()) return true;
    if (!pin || CONFIGURED_PIN === null) return false;
    return String(pin).trim() === CONFIGURED_PIN;
  }
};
