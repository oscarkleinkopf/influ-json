/**
 * Google OAuth (opt-in) → studio_profiles aislados por cuenta.
 * ENABLE_GOOGLE_AUTH=1 + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
 * Sin flag: rutas 404 / UI oculta. PIN e invitaciones intactos.
 */
'use strict';

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

function isGoogleAuthEnabled(env = process.env) {
  const on = String(env.ENABLE_GOOGLE_AUTH || '').trim() === '1';
  if (!on) return false;
  return !!(String(env.GOOGLE_CLIENT_ID || '').trim() && String(env.GOOGLE_CLIENT_SECRET || '').trim());
}

function getGoogleRedirectUri(req, env = process.env) {
  const fromEnv = String(env.GOOGLE_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  const host = req.get('host') || '127.0.0.1:3000';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${host}/api/auth/google/callback`;
}

function signOAuthState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyOAuthState(token, secret, maxAgeMs = 10 * 60 * 1000) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.n !== 'string' || typeof payload.ts !== 'number') return null;
  if (Date.now() - payload.ts > maxAgeMs) return null;
  return payload;
}

function httpsRequestJson(method, urlStr, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { ...headers }
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = { raw }; }
        if (res.statusCode >= 400) {
          const err = new Error(data?.error_description || data?.error || `HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = data;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function exchangeCodeForTokens({ code, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  }).toString();
  return httpsRequestJson('POST', GOOGLE_TOKEN, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    },
    body
  });
}

async function fetchGoogleUserInfo(accessToken) {
  return httpsRequestJson('GET', GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

/**
 * Build authorize URL + signed state (store nonce in session).
 */
function beginGoogleLogin(req, env = process.env) {
  if (!isGoogleAuthEnabled(env)) {
    const err = new Error('Google auth desactivado');
    err.code = 'GOOGLE_AUTH_OFF';
    throw err;
  }
  const clientId = String(env.GOOGLE_CLIENT_ID).trim();
  const secret = String(env.SESSION_SECRET || env.GOOGLE_CLIENT_SECRET || 'influ-google-state').trim();
  const nonce = crypto.randomBytes(16).toString('hex');
  if (req.session) req.session.googleOAuthNonce = nonce;
  const state = signOAuthState({ n: nonce, ts: Date.now() }, secret);
  const redirectUri = getGoogleRedirectUri(req, env);
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return { url: url.toString(), redirectUri, state };
}

/**
 * Complete callback: verify state, exchange code, return Google identity.
 * @returns {Promise<{ sub: string, email: string|null, name: string|null, picture: string|null }>}
 */
async function completeGoogleLogin(req, { code, state }, env = process.env) {
  if (!isGoogleAuthEnabled(env)) {
    const err = new Error('Google auth desactivado');
    err.code = 'GOOGLE_AUTH_OFF';
    throw err;
  }
  if (!code) {
    const err = new Error('Falta code de Google');
    err.code = 'GOOGLE_NO_CODE';
    throw err;
  }
  const secret = String(env.SESSION_SECRET || env.GOOGLE_CLIENT_SECRET || 'influ-google-state').trim();
  const payload = verifyOAuthState(state, secret);
  if (!payload) {
    const err = new Error('State OAuth inválido o expirado');
    err.code = 'GOOGLE_BAD_STATE';
    throw err;
  }
  if (req.session?.googleOAuthNonce && req.session.googleOAuthNonce !== payload.n) {
    const err = new Error('State OAuth no coincide con la sesión');
    err.code = 'GOOGLE_BAD_STATE';
    throw err;
  }
  delete req.session?.googleOAuthNonce;

  const redirectUri = getGoogleRedirectUri(req, env);
  const tokens = await exchangeCodeForTokens({
    code,
    redirectUri,
    clientId: String(env.GOOGLE_CLIENT_ID).trim(),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET).trim()
  });
  if (!tokens?.access_token) {
    const err = new Error('Google no devolvió access_token');
    err.code = 'GOOGLE_TOKEN';
    throw err;
  }
  const info = await fetchGoogleUserInfo(tokens.access_token);
  const sub = String(info?.sub || '').trim();
  if (!sub) {
    const err = new Error('Google userinfo sin sub');
    err.code = 'GOOGLE_NO_SUB';
    throw err;
  }
  return {
    sub,
    email: info.email ? String(info.email).trim().toLowerCase() : null,
    name: info.name ? String(info.name).trim() : null,
    picture: info.picture || null
  };
}

module.exports = {
  isGoogleAuthEnabled,
  getGoogleRedirectUri,
  beginGoogleLogin,
  completeGoogleLogin,
  signOAuthState,
  verifyOAuthState,
  // test hooks
  _exchangeCodeForTokens: exchangeCodeForTokens,
  _fetchGoogleUserInfo: fetchGoogleUserInfo,
  GOOGLE_AUTH,
  GOOGLE_TOKEN,
  GOOGLE_USERINFO
};
