const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const db = require('../db');
const app = require('../server');

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

test('migración v10 audit_events está definida', () => {
  const { MIGRATIONS } = require('../migrations');
  const m = MIGRATIONS.find((x) => x.id === 10);
  assert.ok(m);
  assert.equal(m.name, 'audit_events');
});

test('recordAuditEvent + listAuditEvents persisten acción', () => {
  const tag = `ae_${Date.now()}`;
  const id = db.recordAuditEvent({
    profile_id: tag,
    actor_profile_id: tag,
    action: 'persona.archive',
    entity_type: 'persona',
    entity_id: 'p_test',
    meta: { name: 'Test' }
  });
  assert.ok(id);
  const events = db.listAuditEvents({ limit: 50 });
  assert.ok(events.some((e) => e.id === id && e.action === 'persona.archive'));
});

test('archive escribe evento; export registra actor; member 403 al listar', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const member = db.createStudioProfile({
    name: `AuditMem_${Date.now()}`,
    pin: '6677',
    role: 'member'
  });
  const persona = db.savePersona({
    name: `AuditP_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
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

    const arch = await fetch(`${base}/api/personas/${persona.id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ archived: true })
    });
    assert.equal(arch.status, 200);

    const afterArchive = db.listAuditEvents({ limit: 50 });
    assert.ok(
      afterArchive.some(
        (e) => e.action === 'persona.archive' && e.entity_id === persona.id
      ),
      'archive debe escribir audit event'
    );

    const exp = await fetch(`${base}/api/export/persona/${persona.id}`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(exp.status, 200);
    // Drain ZIP body so connection closes cleanly
    await exp.arrayBuffer();

    const afterExport = db.listAuditEvents({ limit: 50 });
    const exportEv = afterExport.find(
      (e) => e.action === 'persona.export' && e.entity_id === persona.id
    );
    assert.ok(exportEv, 'export debe registrar evento');
    assert.ok(exportEv.actor_profile_id, 'export debe registrar actor');

    const adminList = await fetch(`${base}/api/audit/events?limit=50`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(adminList.status, 200);
    const adminBody = await adminList.json();
    assert.equal(adminBody.success, true);
    assert.ok(Array.isArray(adminBody.events));
    assert.ok(adminBody.events.some((e) => e.action === 'persona.archive'));

    const memLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '6677', profileId: member.id })
    });
    const memCookie = (memLogin.headers.getSetCookie?.()?.[0] || memLogin.headers.get('set-cookie') || '').split(';')[0];
    const memRes = await fetch(`${base}/api/audit/events`, {
      headers: { Cookie: memCookie }
    });
    assert.equal(memRes.status, 403);
  });

  try { db.deletePersona(persona.id); } catch (_) {}
  try { db.deleteStudioProfile(member.id); } catch (_) {}
});

test('UI y admin route montan audit log', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /auditLogSettingsSection/);
  assert.match(html, /btnRefreshAuditLog/);
  const admin = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(admin, /\/api\/audit\/events/);
  assert.match(admin, /studio\.export/);
  assert.match(admin, /backup\.create/);
  const personas = fs.readFileSync(path.join(__dirname, '..', 'routes', 'personas.js'), 'utf8');
  assert.match(personas, /persona\.archive/);
  assert.match(personas, /persona\.delete/);
  assert.match(personas, /persona\.export/);
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appJs, /refreshAuditLogSettings/);
  assert.match(appJs, /btnRefreshAuditLog/);
});
