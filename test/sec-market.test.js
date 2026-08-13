/**
 * Seguridad de mercado — status slim sin auth, queue-status gated, cookies sesión.
 * docs/SECURITY_MARKET.md
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-sec-market';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.COOKIE_SECURE;

const app = require('../server');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

function setCookieHeaders(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get('set-cookie');
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function cookieFrom(res) {
  return setCookieHeaders(res)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/status sin auth: sin dataDir/dbPath ni URLs internas de providers', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.authenticated, false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'dataDir'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'dbPath'), false);
    assert.ok(body.imageProviders, 'flags de providers para UI free/face-lock');
    assert.equal(body.imageProviders.freePathAlwaysOn, true);
    if (body.imageProviders.comfyui) {
      assert.equal(Object.prototype.hasOwnProperty.call(body.imageProviders.comfyui, 'url'), false);
    }
    if (body.imageProviders.paidLora) {
      assert.equal(Object.prototype.hasOwnProperty.call(body.imageProviders.paidLora, 'username'), false);
    }
    const raw = JSON.stringify(body);
    assert.doesNotMatch(raw, /comfy\.|127\.0\.0\.1:\d{4}|localhost:\d{4}/i);
  });
});

test('GET /api/status con sesión: incluye dataDir/dbPath', async () => {
  await withServer(async (base) => {
    const pin = process.env.STUDIO_PIN || '1234';
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    assert.equal(login.status, 200);
    const cookie = cookieFrom(login);
    assert.ok(cookie.includes('influ.sid='));

    const res = await fetch(`${base}/api/status`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, true);
    assert.ok(body.dataDir, 'dataDir con sesión');
    assert.ok(body.dbPath, 'dbPath con sesión');
  });
});

test('GET /api/queue-status sin auth → 401; con Bearer → 200', async () => {
  await withServer(async (base) => {
    const unauth = await fetch(`${base}/api/queue-status`);
    assert.equal(unauth.status, 401);

    const authed = await fetch(`${base}/api/queue-status`, { headers: authHeaders() });
    assert.equal(authed.status, 200);
    const body = await authed.json();
    assert.equal(body.success, true);
    assert.ok(body.queue);
    assert.equal(typeof body.queue.pendingCount, 'number');
  });
});

test('login Set-Cookie: HttpOnly + SameSite=Lax; sin Secure si COOKIE_SECURE off', async () => {
  await withServer(async (base) => {
    const pin = process.env.STUDIO_PIN || '1234';
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    assert.equal(login.status, 200);
    const headers = setCookieHeaders(login);
    const sid = headers.find((h) => /influ\.sid=/i.test(h));
    assert.ok(sid, 'debe Set-Cookie influ.sid');
    assert.match(sid, /HttpOnly/i);
    assert.match(sid, /SameSite=Lax/i);
    assert.doesNotMatch(sid, /;\s*Secure/i);
  });
});

test('auth.js: cookie.secure sigue COOKIE_SECURE=1', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  assert.match(src, /secure:\s*process\.env\.COOKIE_SECURE\s*===\s*['"]1['"]/);
});
