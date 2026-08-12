/**
 * URL pública del Studio (deploy online).
 * PUBLIC_BASE_URL=https://tu-app.onrender.com — sin slash final.
 * Usado por Google OAuth redirect y enlaces absolutos.
 */
'use strict';

function normalizeBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  return s || '';
}

function getPublicBaseUrl(req, env = process.env) {
  const fromEnv = normalizeBaseUrl(env.PUBLIC_BASE_URL);
  if (fromEnv) return fromEnv;
  if (!req || typeof req.get !== 'function') return '';
  const host = req.get('host');
  if (!host) return '';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}

function isHttpsPublicBase(env = process.env) {
  return normalizeBaseUrl(env.PUBLIC_BASE_URL).toLowerCase().startsWith('https://');
}

/** Deploy detrás de proxy (Render/Fly/Railway) o URL pública HTTPS. */
function shouldTrustProxy(env = process.env) {
  const v = String(env.TRUST_PROXY || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return isHttpsPublicBase(env);
}

function shouldUseSecureCookies(env = process.env) {
  const v = String(env.COOKIE_SECURE || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return isHttpsPublicBase(env);
}

module.exports = {
  normalizeBaseUrl,
  getPublicBaseUrl,
  isHttpsPublicBase,
  shouldTrustProxy,
  shouldUseSecureCookies
};
