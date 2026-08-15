/**
 * Corte F — LAN casera: session store, PIN uniforme, allowlist, límites.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-corte-f';

const firstRun = require('../first-run');
const sessionStore = require('../session-store');
const auth = require('../auth');
const db = require('../db');

test('resolveSessionStoreMode: sqlite on public bind, memory on loopback', () => {
  const prevHost = process.env.HOST;
  const prevStore = process.env.SESSION_STORE;
  try {
    delete process.env.SESSION_STORE;
    process.env.HOST = '127.0.0.1';
    assert.equal(sessionStore.resolveSessionStoreMode(), 'memory');
    process.env.HOST = '0.0.0.0';
    assert.equal(sessionStore.resolveSessionStoreMode(), 'sqlite');
    process.env.SESSION_STORE = 'memory';
    assert.equal(sessionStore.resolveSessionStoreMode(), 'memory');
    process.env.SESSION_STORE = 'sqlite';
    process.env.HOST = '127.0.0.1';
    assert.equal(sessionStore.resolveSessionStoreMode(), 'sqlite');
  } finally {
    if (prevHost === undefined) delete process.env.HOST;
    else process.env.HOST = prevHost;
    if (prevStore === undefined) delete process.env.SESSION_STORE;
    else process.env.SESSION_STORE = prevStore;
  }
});

test('SqliteSessionStore get/set/destroy roundtrip', () => {
  const Database = require('better-sqlite3');
  const tmp = path.join(os.tmpdir(), `influ-sess-${Date.now()}.sqlite`);
  const sqlite = new Database(tmp);
  try {
    const store = sessionStore.createSqliteSessionStore(sqlite, { ttlMs: 60_000 });
    const sid = 'sid-test-1';
    const sess = { authenticated: true, cookie: { maxAge: 60_000 } };
    awaitableSet(store, sid, sess);
    const got = awaitableGet(store, sid);
    assert.equal(got.authenticated, true);
    awaitableDestroy(store, sid);
    assert.equal(awaitableGet(store, sid), null);
  } finally {
    sqlite.close();
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

function awaitableSet(store, sid, sess) {
  let err;
  store.set(sid, sess, (e) => { err = e; });
  if (err) throw err;
}
function awaitableGet(store, sid) {
  let err;
  let out;
  store.get(sid, (e, s) => { err = e; out = s; });
  if (err) throw err;
  return out;
}
function awaitableDestroy(store, sid) {
  let err;
  store.destroy(sid, (e) => { err = e; });
  if (err) throw err;
}

test('validateProfilePin: min 6 + reject trivial; legacy short not auto-invalidated', () => {
  assert.throws(() => firstRun.validateProfilePin('1234'), (e) => e.code === 'PIN_TRIVIAL' || e.code === 'PIN_TOO_SHORT');
  assert.throws(() => firstRun.validateProfilePin('123456'), (e) => e.code === 'PIN_TRIVIAL');
  assert.throws(() => firstRun.validateProfilePin('ab12'), (e) => e.code === 'PIN_TOO_SHORT');
  assert.equal(firstRun.validateProfilePin('casa42'), 'casa42');
  assert.throws(() => firstRun.validateNewStudioPin('1234', '1234'), (e) => e.code === 'PIN_STILL_DEFAULT');
});

test('createStudioProfile rejects short/trivial PIN; accepts 6+', () => {
  assert.throws(
    () => db.createStudioProfile({ name: `Short_${Date.now()}`, pin: '1234' }),
    /PIN|trivial|caracteres/i
  );
  const p = db.createStudioProfile({ name: `OkPin_${Date.now()}`, pin: 'casa42', role: 'member' });
  assert.ok(p.id);
  db.deleteStudioProfile(p.id);
});

test('host allowlist rejects unknown Host when configured', () => {
  const prev = process.env.ALLOWED_HOSTS;
  process.env.ALLOWED_HOSTS = 'studio.lan';
  try {
    let status = null;
    let body = null;
    auth.hostAllowlistProtection(
      { headers: { host: 'evil.example' } },
      {
        status(c) { status = c; return this; },
        json(b) { body = b; }
      },
      () => { status = 200; }
    );
    assert.equal(status, 421);
    assert.equal(body.code, 'HOST_NOT_ALLOWED');

    status = null;
    auth.hostAllowlistProtection(
      { headers: { host: 'studio.lan:3000' } },
      {
        status(c) { status = c; return this; },
        json() {}
      },
      () => { status = 200; }
    );
    assert.equal(status, 200);
  } finally {
    if (prev === undefined) delete process.env.ALLOWED_HOSTS;
    else process.env.ALLOWED_HOSTS = prev;
  }
});

test('HSTS only when COOKIE_SECURE + PUBLIC_HTTPS_ORIGIN (or ENABLE_HSTS)', () => {
  assert.equal(auth.isHstsEnabled({}), false);
  assert.equal(auth.isHstsEnabled({ COOKIE_SECURE: '1' }), false);
  assert.equal(
    auth.isHstsEnabled({ COOKIE_SECURE: '1', PUBLIC_HTTPS_ORIGIN: 'https://studio.example' }),
    true
  );
  assert.equal(auth.isHstsEnabled({ ENABLE_HSTS: '1' }), true);
});

test('public bind JSON limit is 2mb by default', () => {
  const prev = process.env.HOST;
  try {
    process.env.HOST = '0.0.0.0';
    assert.equal(firstRun.getJsonBodyLimit(), '2mb');
    process.env.HOST = '127.0.0.1';
    assert.equal(firstRun.getJsonBodyLimit(), '50mb');
  } finally {
    if (prev === undefined) delete process.env.HOST;
    else process.env.HOST = prev;
  }
});

test('GET /api/status exposes sessionStore + jsonBodyLimit', async () => {
  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.sessionStore === 'memory' || body.sessionStore === 'sqlite');
    assert.ok(typeof body.jsonBodyLimit === 'string');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('login success writes auth.login.ok audit event', async () => {
  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const { loginSession } = require('./helpers/session');
    await loginSession(`http://127.0.0.1:${port}`, { pin: '1234' });
    const rows = db.listAuditEvents({ limit: 20 });
    assert.ok(rows.some((r) => r.action === 'auth.login.ok'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
