const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const db = require('../db');
const app = require('../server');
const { DATA_DIR } = require('../paths');
const { loginSession } = require('./helpers/session');

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

test('ownership: member cannot delete or export another profile persona', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const member = db.createStudioProfile({ name: `OwnMem_${Date.now()}`, pin: '778800', role: 'member' });
  const adminPersona = db.savePersona({
    name: `AdminP_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    profile_id: adminId
  });

  await withServer(async (base) => {
    const mem = await loginSession(base, { pin: '778800', profileId: member.id });

    const del = await fetch(`${base}/api/personas/${adminPersona.id}`, {
      method: 'DELETE',
      headers: mem.headers()
    });
    assert.equal(del.status, 404);

    const exp = await fetch(`${base}/api/export/persona/${adminPersona.id}`, {
      headers: mem.headers()
    });
    assert.equal(exp.status, 404);

    // Still exists for admin
    assert.ok(db.getPersonaById(adminPersona.id));
  });

  db.deletePersona(adminPersona.id);
  db.deleteStudioProfile(member.id);
});

test('ownership: POST update rejects foreign persona id', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const member = db.createStudioProfile({ name: `OwnUpd_${Date.now()}`, pin: '889900', role: 'member' });
  const adminPersona = db.savePersona({
    name: `AdminUpd_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    profile_id: adminId
  });

  await withServer(async (base) => {
    const mem = await loginSession(base, { pin: '889900', profileId: member.id });

    const res = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: mem.jsonHeaders(),
      body: JSON.stringify({
        id: adminPersona.id,
        name: 'Hijacked',
        gender: 'Female'
      })
    });
    assert.equal(res.status, 404);
    const still = db.getPersonaById(adminPersona.id);
    assert.notEqual(still.name, 'Hijacked');
  });

  db.deletePersona(adminPersona.id);
  db.deleteStudioProfile(member.id);
});

test('backups: admin can create and list; member forbidden', async () => {
  const member = db.createStudioProfile({ name: `BakMem_${Date.now()}`, pin: '556600', role: 'member' });

  await withServer(async (base) => {
    const admin = await loginSession(base);
    assert.equal(admin.data.success, true);

    const create = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: admin.jsonHeaders(),
      body: JSON.stringify({ label: 'test_qa' })
    });
    const created = await create.json();
    assert.equal(created.success, true, created.message || 'backup create');
    assert.ok(created.snapshot?.filename?.endsWith('.sqlite'));
    assert.ok(fs.existsSync(path.join(DATA_DIR, 'backups', created.snapshot.filename)));

    const list = await fetch(`${base}/api/backups`, { headers: admin.headers() });
    const listed = await list.json();
    assert.equal(listed.success, true);
    assert.ok((listed.snapshots || []).some((s) => s.filename === created.snapshot.filename));

    const mem = await loginSession(base, { pin: '556600', profileId: member.id });
    const forbid = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: mem.jsonHeaders(),
      body: JSON.stringify({ label: 'nope' })
    });
    assert.equal(forbid.status, 403);
  });

  db.deleteStudioProfile(member.id);
});

test('gallery: items scoped by profile', () => {
  const adminId = db.ensureDefaultStudioProfile();
  const other = db.createStudioProfile({ name: `Gal_${Date.now()}`, pin: '334400', role: 'member' });
  const a = db.saveToGallery('prompt-admin', 'assets/x.png', adminId);
  const b = db.saveToGallery('prompt-member', 'assets/y.png', other.id);
  const listA = db.getGalleryItems(adminId);
  const listB = db.getGalleryItems(other.id);
  assert.ok(listA.some((i) => i.id === a.id));
  assert.equal(listA.some((i) => i.id === b.id), false);
  assert.ok(listB.some((i) => i.id === b.id));
  db.deleteStudioProfile(other.id);
});

void authHeaders;
