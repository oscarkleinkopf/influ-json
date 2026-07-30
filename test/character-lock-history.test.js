const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const db = require('../db');
const app = require('../server');
const {
  diffCharacterLocks,
  didLockHealthDrop
} = require('../character-lock-validator');

function sampleLock(overrides = {}) {
  return {
    version: 1,
    free_tier: true,
    niche: 'beauty',
    must_match_every_image: {
      name: 'LockHist Test',
      skin_tone: 'Piel clara / beige claro',
      skin_tone_hex: '#f0d5c0',
      eye_color: 'Miel',
      hair_color: 'Castaño oscuro',
      hair_texture: 'Ondulado',
      hair_length: 'Largo',
      ...overrides.must
    },
    ...overrides.meta
  };
}

function personaPayload(name, lock) {
  return {
    name,
    gender: 'Female',
    age: '26',
    ethnicity: 'Latina',
    forceCreate: true,
    detailedJSON: {
      identity: { name, gender: 'Female', apparent_age: '26' },
      facial_features: {
        skin_tone: lock.must_match_every_image.skin_tone,
        skin_tone_hex: lock.must_match_every_image.skin_tone_hex,
        eye_color: lock.must_match_every_image.eye_color
      },
      hair: {
        color: lock.must_match_every_image.hair_color,
        texture: lock.must_match_every_image.hair_texture,
        length: lock.must_match_every_image.hair_length
      },
      character_lock: lock
    }
  };
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

test('migración v9 character_lock_revisions está definida', () => {
  const { MIGRATIONS } = require('../migrations');
  const m = MIGRATIONS.find((x) => x.id === 9);
  assert.ok(m);
  assert.equal(m.name, 'character_lock_revisions');
});

test('diffCharacterLocks y didLockHealthDrop', () => {
  const a = sampleLock();
  const b = sampleLock({ must: { skin_tone_hex: '#aabbcc' }, meta: { niche: 'fitness' } });
  const d = diffCharacterLocks(a, b);
  assert.equal(d.changed, true);
  assert.ok(d.changes.some((c) => c.path === 'niche'));
  assert.ok(d.changes.some((c) => c.path === 'must_match_every_image.skin_tone_hex'));
  assert.equal(didLockHealthDrop(100, 90, 'solid', 'ok'), true);
  assert.equal(didLockHealthDrop(100, 95, 'solid', 'solid'), false);
  assert.equal(didLockHealthDrop(100, 91, 'solid', 'solid'), true);
});

test('savePersona crea revisión; save idéntico no duplica; restore vuelve al lock previo', () => {
  const adminId = db.ensureDefaultStudioProfile();
  const name = `LockHist_${Date.now()}`;
  const lockA = sampleLock();
  const created = db.savePersona({ ...personaPayload(name, lockA), profile_id: adminId });
  assert.ok(created?.id);
  assert.ok(created.lockRevision?.created);
  assert.ok(created.lockRevision?.id);

  let revs = db.listCharacterLockRevisions(created.id, adminId);
  assert.equal(revs.length, 1);
  assert.equal(revs[0].lock.must_match_every_image.skin_tone_hex, '#f0d5c0');

  const same = db.savePersona({
    ...created,
    id: created.id,
    detailedJSON: created.detailedJSON,
    profile_id: adminId,
    forceCreate: false
  });
  assert.equal(same.lockRevision?.created, false);
  revs = db.listCharacterLockRevisions(created.id, adminId);
  assert.equal(revs.length, 1);

  const lockB = sampleLock({ must: { skin_tone_hex: '#112233', hair_color: 'Negro' } });
  const detailedB = typeof created.detailedJSON === 'object'
    ? { ...created.detailedJSON, character_lock: lockB }
    : { character_lock: lockB };
  if (detailedB.facial_features) {
    detailedB.facial_features = { ...detailedB.facial_features, skin_tone_hex: '#112233' };
  }
  if (detailedB.hair) {
    detailedB.hair = { ...detailedB.hair, color: 'Negro' };
  }
  const updated = db.savePersona({
    ...created,
    id: created.id,
    detailedJSON: detailedB,
    profile_id: adminId,
    forceCreate: false
  });
  assert.equal(updated.lockRevision?.created, true);
  revs = db.listCharacterLockRevisions(created.id, adminId);
  assert.equal(revs.length, 2);

  const olderId = revs[1].id;
  const restored = db.restoreCharacterLockRevision(created.id, olderId, adminId);
  assert.ok(restored);
  const curLock = db.extractCharacterLock(restored.detailedJSON);
  assert.equal(curLock.must_match_every_image.skin_tone_hex, '#f0d5c0');
  assert.equal(curLock.must_match_every_image.hair_color, 'Castaño oscuro');

  revs = db.listCharacterLockRevisions(created.id, adminId);
  assert.ok(revs.length >= 2);
  assert.equal(revs[0].source, 'restore');

  db.deletePersona(created.id);
});

test('API lock-revisions: owner OK; member 404 en persona ajena', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const member = db.createStudioProfile({
    name: `LockMem_${Date.now()}`,
    pin: '6677',
    role: 'member'
  });
  const persona = db.savePersona({
    ...personaPayload(`LockApi_${Date.now()}`, sampleLock()),
    profile_id: adminId
  });

  await withServer(async (base) => {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = (adminLogin.headers.getSetCookie?.()?.[0] || adminLogin.headers.get('set-cookie') || '').split(';')[0];

    const list = await fetch(`${base}/api/personas/${persona.id}/lock-revisions`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.success, true);
    assert.ok((listed.revisions || []).length >= 1);

    const revId = listed.revisions[0].id;
    const one = await fetch(`${base}/api/personas/${persona.id}/lock-revisions/${revId}`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(one.status, 200);
    const oneBody = await one.json();
    assert.equal(oneBody.success, true);
    assert.ok(oneBody.revision?.lock);
    assert.ok(oneBody.diff);

    const memLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '6677', profileId: member.id })
    });
    const memCookie = (memLogin.headers.getSetCookie?.()?.[0] || memLogin.headers.get('set-cookie') || '').split(';')[0];

    const forbid = await fetch(`${base}/api/personas/${persona.id}/lock-revisions`, {
      headers: { Cookie: memCookie }
    });
    assert.equal(forbid.status, 404);

    const forbidRestore = await fetch(`${base}/api/personas/${persona.id}/lock-revisions/${revId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: memCookie },
      body: '{}'
    });
    assert.equal(forbidRestore.status, 404);
  });

  db.deletePersona(persona.id);
  db.deleteStudioProfile(member.id);
});

test('UI app.js y routes montan historial lock', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appJs, /function setupLockRevisions/);
  assert.match(appJs, /function refreshLockRevisions/);
  assert.match(appJs, /lockRevision\?\.healthDropped/);
  assert.match(appJs, /\/api\/personas\/\$\{personaId\}\/lock-revisions/);

  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'personas.js'), 'utf8');
  assert.match(routes, /\/api\/personas\/:id\/lock-revisions/);
  assert.match(routes, /restoreCharacterLockRevision/);

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="lockRevisionsPanel"/);
});
