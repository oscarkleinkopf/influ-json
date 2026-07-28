const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const auth = require('../auth');
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

test('auth: PIN default detection and hashing', () => {
  assert.equal(auth.isAuthEnabled(), true);
  assert.equal(auth.isPinDefault(), process.env.STUDIO_PIN.trim() === '1234');
  const { salt, hash } = auth.hashPin('9999');
  assert.ok(auth.verifyPinHash('9999', salt, hash));
  assert.equal(auth.verifyPinHash('0000', salt, hash), false);
});

test('auth: rate-limit locks after MAX fails', () => {
  const req = { ip: '203.0.113.50', headers: {}, socket: {} };
  // reset by using unique IP
  for (let i = 0; i < 5; i++) auth.registerLoginFailure(req);
  const status = auth.getLoginLockStatus(req);
  assert.equal(status.locked, true);
  assert.ok(status.retryAfterSec > 0);
  auth.clearLoginFailures(req);
  assert.equal(auth.getLoginLockStatus(req).locked, false);
});

test('db: default Admin profile exists and personas are scoped', () => {
  const def = db.ensureDefaultStudioProfile();
  assert.ok(def);
  const profiles = db.listStudioProfilesPublic();
  assert.ok(profiles.length >= 1);
  assert.ok(profiles.some(p => p.name === 'Admin'));

  const other = db.createStudioProfile({ name: `QA_${Date.now()}`, pin: '5678', role: 'member' });
  const a = db.savePersona({
    name: `ScopedA_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    profile_id: def
  });
  const b = db.savePersona({
    name: `ScopedB_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    profile_id: other.id
  });

  const listA = db.getAllPersonas(def);
  const listB = db.getAllPersonas(other.id);
  assert.ok(listA.some(p => p.id === a.id));
  assert.equal(listA.some(p => p.id === b.id), false);
  assert.ok(listB.some(p => p.id === b.id));
  assert.equal(listB.some(p => p.id === a.id), false);

  db.deletePersona(a.id);
  db.deletePersona(b.id);
  db.deleteStudioProfile(other.id);
});

test('API: login + profiles + status pinIsDefault', async () => {
  await withServer(async (base) => {
    const statusRes = await fetch(`${base}/api/status`);
    const status = await statusRes.json();
    assert.equal(status.success, true);
    assert.equal(typeof status.pinIsDefault, 'boolean');
    assert.equal(status.pinRequired, true);

    const profilesRes = await fetch(`${base}/api/auth/profiles`);
    const profiles = await profilesRes.json();
    assert.ok(profiles.profiles.length >= 1);

    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' })
    });
    const login = await loginRes.json();
    assert.equal(login.success, true);
    assert.ok(login.profile?.id);

    // Create second profile via authenticated fetch (cookie from login)
    const cookie = loginRes.headers.getSetCookie?.()?.[0] || loginRes.headers.get('set-cookie');
    const createRes = await fetch(`${base}/api/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie.split(';')[0] } : authHeaders())
      },
      body: JSON.stringify({ name: `ApiProfile_${Date.now()}`, pin: '4321' })
    });
    const created = await createRes.json();
    assert.equal(created.success, true, created.message || 'create profile');

    // Wrong PIN should 401
    const bad = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0000', profileId: created.profile.id })
    });
    assert.equal(bad.status, 401);

    // Cleanup
    await fetch(`${base}/api/profiles/${created.profile.id}`, {
      method: 'DELETE',
      headers: cookie ? { Cookie: cookie.split(';')[0] } : authHeaders()
    });
  });
});

test('API: /api/data returns only current profile personas', async () => {
  await withServer(async (base) => {
    const def = db.ensureDefaultStudioProfile();
    const other = db.createStudioProfile({ name: `DataScope_${Date.now()}`, pin: '8765' });
    const mine = db.savePersona({ name: `Mine_${Date.now()}`, gender: 'Female', forceCreate: true, profile_id: def });
    const theirs = db.savePersona({ name: `Theirs_${Date.now()}`, gender: 'Female', forceCreate: true, profile_id: other.id });

    const res = await fetch(`${base}/api/data`, { headers: authHeaders() });
    assert.equal(res.status, 200);
    const data = await res.json();
    const ids = (data.personas || []).map(p => p.id);
    assert.ok(ids.includes(mine.id));
    assert.equal(ids.includes(theirs.id), false);

    db.deletePersona(mine.id);
    db.deletePersona(theirs.id);
    db.deleteStudioProfile(other.id);
  });
});
