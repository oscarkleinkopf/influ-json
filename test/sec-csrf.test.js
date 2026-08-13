/**
 * CSRF synchronizer — mutaciones cookie exigen X-CSRF-Token; Bearer exento.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-csrf';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.CSRF_PROTECTION;

const auth = require('../auth');
const app = require('../server');
const { loginSession, cookieFrom } = require('./helpers/session');

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

test('isCsrfProtectionEnabled default ON; CSRF_PROTECTION=0 apaga', () => {
  assert.equal(auth.isCsrfProtectionEnabled({}), true);
  assert.equal(auth.isCsrfProtectionEnabled({ CSRF_PROTECTION: '1' }), true);
  assert.equal(auth.isCsrfProtectionEnabled({ CSRF_PROTECTION: '0' }), false);
});

test('login devuelve csrfToken; POST cookie sin token → 403; con token → ok', async () => {
  await withServer(async (base) => {
    const session = await loginSession(base);
    assert.equal(session.data.success, true);
    assert.ok(session.csrf && session.csrf.length >= 32, 'csrfToken en login');

    const denied = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
      body: JSON.stringify({
        name: `CsrfDenied_${Date.now()}`,
        benefit: 'b',
        audience: 'a',
        frustration: 'f'
      })
    });
    assert.equal(denied.status, 403);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.code, 'CSRF');

    const ok = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: session.jsonHeaders(),
      body: JSON.stringify({
        name: `CsrfOk_${Date.now()}`,
        benefit: 'b',
        audience: 'a',
        frustration: 'f'
      })
    });
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.success, true);
  });
});

test('Bearer PIN exime CSRF (CLI / tests)', async () => {
  await withServer(async (base) => {
    const pin = process.env.STUDIO_PIN || '1234';
    const res = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pin}`
      },
      body: JSON.stringify({
        name: `CsrfBearer_${Date.now()}`,
        benefit: 'b',
        audience: 'a',
        frustration: 'f'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });
});

test('POST /api/auth/logout sin CSRF → 403; con token → 200', async () => {
  await withServer(async (base) => {
    const session = await loginSession(base);
    const bad = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: session.cookie }
    });
    assert.equal(bad.status, 403);

    const again = await loginSession(base);
    const good = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: again.headers()
    });
    assert.equal(good.status, 200);
  });
});

test('app.js: authFetch envía X-CSRF-Token; rememberCsrfToken', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /rememberCsrfToken/);
  assert.match(src, /X-CSRF-Token/);
  assert.match(src, /state\.csrfToken/);
  assert.doesNotMatch(src, /Authorization['"]\s*\]\s*=\s*`Bearer/);
});

test('GET /api/status autenticado incluye csrfToken', async () => {
  await withServer(async (base) => {
    const session = await loginSession(base);
    const res = await fetch(`${base}/api/status`, { headers: { Cookie: session.cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.csrfToken);
    assert.equal(body.csrfToken, session.csrf);
  });
});

// silence unused import if tree-shaken oddly
void cookieFrom;
