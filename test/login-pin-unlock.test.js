/**
 * Login unlock: no perfiles harness en el selector; cookie credentials; 429 claro.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-login-fix';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const root = path.join(__dirname, '..');
const db = require('../db');
const app = require('../server');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('harness profile names detectados', () => {
  assert.equal(db.isHarnessStudioProfileName('MetricsMem_123'), true);
  assert.equal(db.isHarnessStudioProfileName('Onboard_99'), true);
  assert.equal(db.isHarnessStudioProfileName('Member Sec3 1'), true);
  assert.equal(db.isHarnessStudioProfileName('Administración'), false);
});

test('GET /api/auth/profiles (login) omite perfiles harness activos', async () => {
  await withServer(async (base) => {
    // Create a harness-named profile (active) then ensure login list hides it
    let harnessId = null;
    try {
      const p = db.createStudioProfile({
        name: `MetricsMem_${Date.now()}`,
        pin: '9999',
        role: 'member'
      });
      harnessId = p.id;
    } catch (e) {
      // may already exist from parallel — ignore
    }

    const res = await fetch(`${base}/api/auth/profiles`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    for (const p of data.profiles || []) {
      assert.equal(db.isHarnessStudioProfileName(p.name), false, `login list leaked ${p.name}`);
    }

    // Admin list (no forLogin) still can see harness if we query db directly
    const all = db.listStudioProfilesPublic();
    assert.ok(all.some((p) => /MetricsMem_/.test(p.name)) || harnessId, 'harness exists in DB');

    if (harnessId) {
      try {
        db.db.prepare('UPDATE studio_profiles SET active = 0 WHERE id = ?').run(harnessId);
      } catch (_) {}
    }
  });
});

test('login UI envía credentials y muestra retryAfterSec', () => {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(appJs, /\/api\/auth\/login[\s\S]{0,200}credentials:\s*'same-origin'/);
  assert.match(appJs, /retryAfterSec/);
  assert.match(appJs, /loadLoginProfiles[\s\S]{0,400}harnessRe|MetricsMem_/);
});

test('POST /api/auth/login con PIN default desbloquea Administración', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.profile?.name);
  });
});
