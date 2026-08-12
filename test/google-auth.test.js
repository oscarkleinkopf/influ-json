/**
 * Google OAuth opt-in → perfiles aislados (schema v12 + rutas).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('http');
const os = require('os');

const root = path.join(__dirname, '..');

test('Google auth: módulo + UI gated + migración 12', () => {
  const authG = fs.readFileSync(path.join(root, 'auth-google.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
  const mig = fs.readFileSync(path.join(root, 'migrations.js'), 'utf8');
  const envEx = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

  assert.match(authG, /function isGoogleAuthEnabled/);
  assert.match(authG, /function beginGoogleLogin/);
  assert.match(authG, /function completeGoogleLogin/);
  assert.match(mig, /id:\s*12/);
  assert.match(mig, /studio_profiles_google_auth/);
  assert.match(mig, /google_sub/);
  assert.match(server, /\/api\/auth\/google/);
  assert.match(server, /googleAuthEnabled/);
  assert.match(server, /findOrCreateStudioProfileFromGoogle/);
  assert.match(foot, /id="googleAuthLoginBlock"/);
  assert.match(foot, /id="btnGoogleLogin"/);
  assert.match(app, /applyGoogleAuthLoginUi/);
  assert.match(envEx, /ENABLE_GOOGLE_AUTH/);
  assert.match(envEx, /GOOGLE_CLIENT_ID/);
});

test('Google auth: flag off → isGoogleAuthEnabled false y /api/auth/google 404', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-gauth-'));
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.ENABLE_GIT_BACKUP = '';
  process.env.STUDIO_PIN = '1234';
  process.env.SESSION_SECRET = 'gauth-test-secret';
  process.env.HOST = '127.0.0.1';
  delete process.env.ENABLE_GOOGLE_AUTH;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  Object.keys(require.cache).forEach((k) => {
    if (/\/(paths|db|server|auth-google|auth|migrations)\.js$/.test(k.replace(/\\/g, '/'))) {
      delete require.cache[k];
    }
  });

  const googleAuth = require('../auth-google');
  assert.equal(googleAuth.isGoogleAuthEnabled(), false);

  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const st = await fetch(`http://127.0.0.1:${port}/api/status`);
    const status = await st.json();
    assert.equal(status.googleAuthEnabled, false);

    const g = await fetch(`http://127.0.0.1:${port}/api/auth/google`, { redirect: 'manual' });
    assert.equal(g.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Google auth: findOrCreateStudioProfileFromGoogle aísla por sub', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-gauth2-'));
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.STUDIO_PIN = '1234';
  process.env.SESSION_SECRET = 'gauth-test-secret-2';

  Object.keys(require.cache).forEach((k) => {
    if (/\/(paths|db|auth|migrations)\.js$/.test(k.replace(/\\/g, '/'))) {
      delete require.cache[k];
    }
  });

  const db = require('../db');
  assert.ok(db.getSchemaVersion() >= 12);

  const a = db.findOrCreateStudioProfileFromGoogle({
    sub: 'google-sub-aaa',
    email: 'alice@example.com',
    name: 'Alice G'
  });
  const b = db.findOrCreateStudioProfileFromGoogle({
    sub: 'google-sub-bbb',
    email: 'bob@example.com',
    name: 'Bob G'
  });
  const a2 = db.findOrCreateStudioProfileFromGoogle({
    sub: 'google-sub-aaa',
    email: 'alice@example.com',
    name: 'Alice G'
  });

  assert.notEqual(a.id, b.id);
  assert.equal(a.id, a2.id);
  assert.equal(a.auth_provider, 'google');
  assert.equal(a.google_sub, 'google-sub-aaa');
  assert.equal(a.pin_salt, 'google-oauth-only');

  // Login list no incluye solo-Google
  const forLogin = db.listStudioProfilesPublic({ forLogin: true });
  assert.ok(!forLogin.some((p) => p.id === a.id));

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Google auth: state HMAC roundtrip', () => {
  const g = require('../auth-google');
  const secret = 'state-secret';
  const token = g.signOAuthState({ n: 'nonce1', ts: Date.now() }, secret);
  const ok = g.verifyOAuthState(token, secret);
  assert.equal(ok.n, 'nonce1');
  assert.equal(g.verifyOAuthState(token + 'x', secret), null);
});
