const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-w1';

const firstRun = require('../first-run');
const auth = require('../auth');
const db = require('../db');
const app = require('../server');

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port, address } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`, { port, address });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function cookieFrom(res) {
  return (res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '').split(';')[0];
}

test('resolveListenHost defaults to 127.0.0.1 when HOST unset', () => {
  const prev = process.env.HOST;
  delete process.env.HOST;
  try {
    assert.equal(firstRun.resolveListenHost(), '127.0.0.1');
    assert.equal(firstRun.isLoopbackBind(), true);
    assert.equal(firstRun.isPublicBind(), false);
  } finally {
    if (prev === undefined) delete process.env.HOST;
    else process.env.HOST = prev;
  }
});

test('resolveListenHost respects HOST=0.0.0.0 as public bind', () => {
  const prev = process.env.HOST;
  process.env.HOST = '0.0.0.0';
  try {
    assert.equal(firstRun.resolveListenHost(), '0.0.0.0');
    assert.equal(firstRun.isPublicBind(), true);
    assert.equal(firstRun.shouldBlockPublicDefaultPin(() => true), true);
    assert.equal(firstRun.shouldBlockPublicDefaultPin(() => false), false);
  } finally {
    if (prev === undefined) delete process.env.HOST;
    else process.env.HOST = prev;
  }
});

test('LISTEN_HOST export on server matches resolveListenHost at load', () => {
  assert.equal(typeof app.LISTEN_HOST, 'string');
  assert.ok(app.LISTEN_HOST.length > 0);
});

test('ensureSessionSecret no-ops when already set; can persist to temp .env', () => {
  const prev = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'already-there';
  const noop = firstRun.ensureSessionSecret({ skipPersist: true });
  assert.equal(noop.created, false);
  assert.equal(noop.secret, 'already-there');

  process.env.SESSION_SECRET = '';
  const tmp = path.join(os.tmpdir(), `influ-env-w1-${Date.now()}.env`);
  try {
    const created = firstRun.ensureSessionSecret({ envPath: tmp, skipPersist: false });
    assert.equal(created.created, true);
    assert.equal(created.persisted, true);
    assert.match(created.secret, /^[a-f0-9]{64}$/);
    const file = fs.readFileSync(tmp, 'utf8');
    assert.match(file, /^SESSION_SECRET=[a-f0-9]{64}$/m);
    assert.equal(process.env.SESSION_SECRET, created.secret);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  }
});

test('POST /api/setup/change-pin rejects short PIN and 1234; accepts valid', async () => {
  const prevPin = process.env.STUDIO_PIN;
  const prevHost = process.env.HOST;
  process.env.STUDIO_PIN = '1234';
  delete process.env.HOST;

  const tmpEnv = path.join(os.tmpdir(), `influ-setup-pin-${Date.now()}.env`);
  fs.writeFileSync(tmpEnv, 'STUDIO_PIN=1234\n', 'utf8');
  const prevEnvPath = process.env.INFLU_ENV_PATH;
  process.env.INFLU_ENV_PATH = tmpEnv;

  try {
    assert.equal(auth.isPinDefault(), true);

    await withServer(async (base) => {
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' })
      });
      const loginData = await login.json();
      assert.equal(login.status, 200);
      assert.equal(loginData.success, true);
      const cookie = cookieFrom(login);

      const tooShort = await fetch(`${base}/api/setup/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ pin: 'abc', confirmPin: 'abc' })
      });
      assert.equal(tooShort.status, 400);
      const shortBody = await tooShort.json();
      assert.match(shortBody.message || '', /al menos 6/i);

      const stillDefault = await fetch(`${base}/api/setup/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ pin: '1234', confirmPin: '1234' })
      });
      assert.equal(stillDefault.status, 400);

      const mismatch = await fetch(`${base}/api/setup/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ pin: 'seguro99', confirmPin: 'seguro00' })
      });
      assert.equal(mismatch.status, 400);

      const ok = await fetch(`${base}/api/setup/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ pin: 'seguro99', confirmPin: 'seguro99' })
      });
      const okBody = await ok.json();
      assert.equal(ok.status, 200, JSON.stringify(okBody));
      assert.equal(okBody.success, true);
      assert.equal(okBody.pinIsDefault, false);
      assert.equal(auth.isPinDefault(), false);

      const envContent = fs.readFileSync(tmpEnv, 'utf8');
      assert.match(envContent, /^STUDIO_PIN=seguro99$/m);

      // Login with new PIN works
      const relogin = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: 'seguro99' })
      });
      assert.equal(relogin.status, 200);
      assert.equal((await relogin.json()).success, true);
    });
  } finally {
    // Restore default PIN on admin profile + process.env for other tests
    process.env.STUDIO_PIN = prevPin || '1234';
    try {
      const adminId = db.ensureDefaultStudioProfile();
      if (adminId) db.updateStudioProfile(adminId, { pin: process.env.STUDIO_PIN });
    } catch (_) {}
    try { fs.unlinkSync(tmpEnv); } catch (_) {}
    if (prevEnvPath === undefined) delete process.env.INFLU_ENV_PATH;
    else process.env.INFLU_ENV_PATH = prevEnvPath;
    if (prevHost === undefined) delete process.env.HOST;
    else process.env.HOST = prevHost;
  }
});

test('public bind + default PIN → 503 on protected API; status still 200', async () => {
  const prevHost = process.env.HOST;
  const prevPin = process.env.STUDIO_PIN;
  process.env.HOST = '0.0.0.0';
  process.env.STUDIO_PIN = '1234';

  try {
    assert.equal(auth.isPinDefault(), true);
    assert.equal(firstRun.shouldBlockPublicDefaultPin(() => auth.isPinDefault()), true);

    await withServer(async (base) => {
      const status = await fetch(`${base}/api/status`);
      assert.equal(status.status, 200);
      const statusBody = await status.json();
      assert.equal(statusBody.publicBindUnsafe, true);
      assert.equal(statusBody.setupRequired, true);

      const blocked = await fetch(`${base}/api/personas`, {
        headers: { Authorization: 'Bearer 1234' }
      });
      assert.equal(blocked.status, 503);
      const blockedBody = await blocked.json();
      assert.equal(blockedBody.code, 'SETUP_REQUIRED');

      // Login still allowed
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' })
      });
      assert.equal(login.status, 200);
    });
  } finally {
    if (prevHost === undefined) delete process.env.HOST;
    else process.env.HOST = prevHost;
    process.env.STUDIO_PIN = prevPin || '1234';
  }
});

test('setup modal markup exists in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="setupPinModal"/);
  assert.match(html, /id="setupPinForm"/);
  assert.match(html, /id="btnSetupPinSubmit"/);
});

test('app.js wires setup pin wizard', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /function maybeShowSetupPinWizard/);
  assert.match(js, /function setupPinWizard/);
  assert.match(js, /\/api\/setup\/change-pin/);
});
