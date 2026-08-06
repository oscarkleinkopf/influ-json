/**
 * Auth local del Studio — PIN + perfiles + rate-limit.
 * Sin OAuth / multi-tenant cloud: perfiles locales en SQLite.
 */
const crypto = require('crypto');
const expressSession = require('express-session');

const DEFAULT_PIN_FALLBACK = '1234';

function getConfiguredPin() {
  if (process.env.STUDIO_PIN === undefined || process.env.STUDIO_PIN === null) {
    return DEFAULT_PIN_FALLBACK;
  }
  return String(process.env.STUDIO_PIN);
}

function isAuthEnabled() {
  const pin = getConfiguredPin();
  // PIN vacío en .env desactiva auth (modo abierto local)
  return String(pin).trim() !== '';
}

function isPinDefault() {
  if (!isAuthEnabled()) return false;
  return String(getConfiguredPin()).trim() === DEFAULT_PIN_FALLBACK;
}

function getSessionSecret() {
  const fromEnv = (process.env.SESSION_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  // Derivado del PIN + salt fijo de instalación (mejor que hardcode público; aún así: set SESSION_SECRET)
  const pin = getConfiguredPin() || 'open';
  return crypto.createHash('sha256').update(`influ-json-session|${pin}`).digest('hex');
}

const sessionMiddleware = expressSession({
  name: 'influ.sid',
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1'
  }
});

// ─── Rate limit login (memoria) ─────────────────────────────────
const loginAttempts = new Map(); // key → { fails, lockedUntil }
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 5);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 60_000);

/** True when behind a reverse proxy that sets X-Forwarded-For (explicit opt-in). */
function isTrustProxyEnabled() {
  const v = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Rate-limit key. Without TRUST_PROXY, ignore spoofable X-Forwarded-For / req.ip
 * (Express req.ip follows XFF only when trust proxy is on; we also skip raw header).
 */
function clientKey(req) {
  if (isTrustProxyEnabled()) {
    return (
      req.ip ||
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function getLoginLockStatus(req) {
  const key = clientKey(req);
  const row = loginAttempts.get(key);
  if (!row) return { locked: false, retryAfterSec: 0 };
  const left = (row.lockedUntil || 0) - Date.now();
  if (left > 0) return { locked: true, retryAfterSec: Math.ceil(left / 1000) };
  return { locked: false, retryAfterSec: 0, fails: row.fails || 0 };
}

function registerLoginFailure(req) {
  const key = clientKey(req);
  const row = loginAttempts.get(key) || { fails: 0, lockedUntil: 0 };
  row.fails += 1;
  if (row.fails >= MAX_FAILS) {
    row.lockedUntil = Date.now() + LOCK_MS;
    row.fails = 0;
  }
  loginAttempts.set(key, row);
  return getLoginLockStatus(req);
}

function clearLoginFailures(req) {
  loginAttempts.delete(clientKey(req));
}

// ─── PIN hashing (perfiles) ─────────────────────────────────────
function hashPin(pin, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPinHash(pin, salt, hash) {
  if (!pin || !salt || !hash) return false;
  try {
    const { hash: next } = hashPin(pin, salt);
    const a = Buffer.from(next, 'hex');
    const b = Buffer.from(String(hash), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function verifyLegacyStudioPin(pin) {
  if (!isAuthEnabled()) return true;
  if (!pin) return false;
  const expected = String(getConfiguredPin()).trim();
  const got = String(pin).trim();
  // timing-safe compare for equal-length; fallback if lengths differ
  if (expected.length === got.length) {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
    } catch (_) {
      return false;
    }
  }
  return false;
}

function requireAuth(req, res, next) {
  if (!isAuthEnabled()) {
    // Modo abierto: perfil por defecto si existe
    if (req.session && !req.session.profileId) {
      req.session.authenticated = true;
    }
    return next();
  }

  if (req.session && req.session.authenticated) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (verifyLegacyStudioPin(token)) {
      if (req.session) {
        req.session.authenticated = true;
        req.session.authVia = 'bearer_studio_pin';
      }
      return next();
    }
    // Bearer puede ser PIN de un perfil — se resuelve en login de perfiles vía db (lazy)
    if (req.session) {
      req._bearerPin = token;
    }
  }

  res.status(401).json({ success: false, message: 'Acceso denegado. PIN inválido o sesión expirada.' });
}

/**
 * CSP endurecida para el Studio monolítico.
 *
 * - connect-src: solo 'self' (Pollinations / Replicate van server-side; el front solo llama /api/*).
 * - img-src: self + data + blob (assets locales y previews; sin https: wildcard).
 * - script-src / style-src: 'unsafe-inline' queda (onclick/onerror + estilos en templates + Google Fonts @import).
 * - CSP_REPORT_ONLY=1 → Content-Security-Policy-Report-Only (sin romper UI al probar).
 * - CSP_ALLOW_HTTPS_IMG=1 → reañade https: a img-src (escape hatch legacy).
 */
function buildContentSecurityPolicy(env = process.env) {
  const imgSrc = ["'self'", 'data:', 'blob:'];
  if (String(env.CSP_ALLOW_HTTPS_IMG || '').trim() === '1') {
    imgSrc.push('https:');
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `img-src ${imgSrc.join(' ')}`,
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'"
  ].join('; ');
}

function isCspReportOnly(env = process.env) {
  return String(env.CSP_REPORT_ONLY || '').trim() === '1';
}

/**
 * Cabeceras de seguridad mínimas (sin romper el Studio local).
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  const csp = buildContentSecurityPolicy();
  const headerName = isCspReportOnly()
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';
  res.setHeader(headerName, csp);
  next();
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  securityHeaders,
  buildContentSecurityPolicy,
  isCspReportOnly,
  verifyPin: verifyLegacyStudioPin,
  verifyLegacyStudioPin,
  verifyPinHash,
  hashPin,
  isAuthEnabled,
  isPinDefault,
  getConfiguredPin,
  getLoginLockStatus,
  registerLoginFailure,
  clearLoginFailures,
  clientKey,
  isTrustProxyEnabled,
  DEFAULT_PIN_FALLBACK
};
