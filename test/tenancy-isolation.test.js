/**
 * Aislamiento multi-tenant (profile_id) — fail-closed + assets + API.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('os');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

async function withFreshDb(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-tenancy-'));
  const prev = { ...process.env };
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.ENABLE_GIT_BACKUP = '';
  process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'tenancy-test-secret';
  process.env.HOST = '127.0.0.1';

  Object.keys(require.cache).forEach((k) => {
    if (/\/(paths|db|server|auth|migrations|auth-google|routes\/)\.js$/.test(k.replace(/\\/g, '/'))) {
      delete require.cache[k];
    }
  });

  try {
    const db = require('../db');
    const app = require('../server');
    await fn({ db, app, dataDir });
  } finally {
    Object.keys(process.env).forEach((k) => {
      if (!(k in prev)) delete process.env[k];
    });
    Object.assign(process.env, prev);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function loginCookie(base, pin, profileId) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, profileId })
  });
  assert.equal(res.status, 200, await res.text());
  const cookie = res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

test('tenancy: asserts fail-closed sin profileId', async () => {
  await withFreshDb(async ({ db }) => {
    const def = db.ensureDefaultStudioProfile();
    const p = db.savePersona({
      name: `T_${Date.now()}`,
      gender: 'Female',
      forceCreate: true,
      profile_id: def,
      image: 'assets/generated/tenancy_a.png'
    });
    assert.equal(db.assertPersonaOwnedBy(p.id, null), null);
    assert.equal(db.assertPersonaOwnedBy(p.id, ''), null);
    assert.ok(db.assertPersonaOwnedBy(p.id, def));

    const other = db.createStudioProfile({ name: `O_${Date.now()}`, pin: '5678', role: 'member' });
    assert.equal(db.assertPersonaOwnedBy(p.id, other.id), null);

    const prod = db.saveProduct({
      name: `Prod_${Date.now()}`,
      benefit: 'b',
      audience: 'a',
      frustration: 'f',
      profile_id: def
    });
    assert.equal(db.assertProductOwnedBy(prod.id, null), null);
    assert.equal(db.assertProductOwnedBy(prod.id, other.id), null);
    assert.ok(db.assertProductOwnedBy(prod.id, def));

    assert.equal(
      db.assertAssetReadableByProfile('generated', '/tenancy_a.png', other.id),
      false
    );
    assert.equal(
      db.assertAssetReadableByProfile('generated', '/tenancy_a.png', def),
      true
    );
    // huérfana / no indexada → allow
    assert.equal(
      db.assertAssetReadableByProfile('generated', '/orphan_xyz.png', other.id),
      true
    );

    db.deletePersona(p.id);
    db.deleteStudioProfile(other.id);
  });
});

test('tenancy: API member no ve / muta recursos de admin', async () => {
  await withFreshDb(async ({ db, app }) => {
    const adminId = db.ensureDefaultStudioProfile();
    const member = db.createStudioProfile({ name: `Mem_${Date.now()}`, pin: '2468', role: 'member' });
    const adminPersona = db.savePersona({
      name: `AdminP_${Date.now()}`,
      gender: 'Female',
      forceCreate: true,
      profile_id: adminId,
      image: 'assets/generated/admin_only_face.png'
    });
    const adminProd = db.saveProduct({
      name: `AdminProd_${Date.now()}`,
      benefit: 'b',
      audience: 'a',
      frustration: 'f',
      profile_id: adminId
    });

    await withServer(app, async (base) => {
      const memberCookie = await loginCookie(base, '2468', member.id);
      const hdr = { Cookie: memberCookie, 'Content-Type': 'application/json' };

      const list = await fetch(`${base}/api/personas`, { headers: hdr });
      assert.equal(list.status, 200);
      const personas = await list.json();
      assert.equal(personas.some((p) => p.id === adminPersona.id), false);

      const steal = await fetch(`${base}/api/personas`, {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ id: adminPersona.id, name: 'Hacked', gender: 'Female' })
      });
      assert.equal(steal.status, 404);

      const stealProd = await fetch(`${base}/api/products`, {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({
          id: adminProd.id,
          name: 'Stolen',
          benefit: 'x',
          audience: 'y',
          frustration: 'z'
        })
      });
      assert.equal(stealProd.status, 404);

      const profiles = await fetch(`${base}/api/profiles`, { headers: hdr });
      const pj = await profiles.json();
      assert.equal(pj.success, true);
      assert.equal(pj.isAdmin, false);
      assert.equal(pj.profiles.length, 1);
      assert.equal(pj.profiles[0].id, member.id);

      const ws = await fetch(`${base}/api/workspaces`, { headers: hdr });
      assert.equal(ws.status, 403);

      const asset = await fetch(`${base}/assets/generated/admin_only_face.png`, {
        headers: { Cookie: memberCookie }
      });
      assert.equal(asset.status, 404);

      // still owned by admin
      assert.ok(db.assertPersonaOwnedBy(adminPersona.id, adminId));
      assert.equal(db.getPersonaById(adminPersona.id).name, adminPersona.name);
    });

    db.deletePersona(adminPersona.id);
    try { db.deleteStudioProfile(member.id); } catch (_) {}
  });
});

test('tenancy: docs SAAS_TENANCY + asserts en código', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'docs', 'SAAS_TENANCY.md')));
  const dbJs = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
  assert.match(dbJs, /assertAssetReadableByProfile/);
  assert.match(dbJs, /Fail-closed/);
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /requireSessionProfileId/);
  assert.match(server, /assetMountKind/);
  assert.match(server, /batch\.profileId/);
});
