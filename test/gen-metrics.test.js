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

test('migración v8 gen_metrics está definida', () => {
  const { MIGRATIONS } = require('../migrations');
  const m = MIGRATIONS.find((x) => x.id === 8);
  assert.ok(m);
  assert.equal(m.name, 'gen_metrics');
});

test('recordGenMetric + getGenMetricsSummary incrementan contadores', () => {
  const tag = `gm_${Date.now()}`;
  db.recordGenMetric({
    profile_id: tag + '_a',
    persona_id: 'p1',
    provider: 'pollinations',
    generation_type: 'portrait',
    ok: true,
    duration_ms: 120
  });
  db.recordGenMetric({
    profile_id: tag + '_a',
    persona_id: 'p1',
    provider: 'pollinations',
    generation_type: 'variant',
    ok: true,
    duration_ms: 200
  });
  db.recordGenMetric({
    profile_id: tag + '_a',
    persona_id: 'p1',
    provider: 'pollinations',
    generation_type: 'variant',
    ok: false,
    error_code: '429',
    duration_ms: 50
  });
  db.recordGenMetric({
    profile_id: tag + '_b',
    persona_id: 'p2',
    generation_type: 'portrait',
    ok: true
  });

  const onlyA = db.getGenMetricsSummary({ profileId: tag + '_a', sinceDays: 30 });
  assert.equal(onlyA.totals.portraits, 1);
  assert.equal(onlyA.totals.variants, 1);
  assert.equal(onlyA.totals.fail429, 1);

  const onlyB = db.getGenMetricsSummary({ profileId: tag + '_b', sinceDays: 30 });
  assert.equal(onlyB.totals.portraits, 1);
  assert.equal(onlyB.totals.variants, 0);
});

test('API metrics: admin OK, member 403', async () => {
  const member = db.createStudioProfile({
    name: `MetricsMem_${Date.now()}`,
    pin: '6688',
    role: 'member'
  });

  await withServer(async (base) => {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = (adminLogin.headers.getSetCookie?.()?.[0] || adminLogin.headers.get('set-cookie') || '').split(';')[0];

    const adminRes = await fetch(`${base}/api/metrics/generations`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(adminRes.status, 200);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.success, true);
    assert.ok(adminBody.summary?.totals);

    const memLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '6688', profileId: member.id })
    });
    const memCookie = (memLogin.headers.getSetCookie?.()?.[0] || memLogin.headers.get('set-cookie') || '').split(';')[0];
    const memRes = await fetch(`${base}/api/metrics/generations`, {
      headers: { Cookie: memCookie }
    });
    assert.equal(memRes.status, 403);
  });
});

test('UI y admin route montan métricas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /genMetricsSettingsSection/);
  const admin = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(admin, /\/api\/metrics\/generations/);
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appJs, /refreshGenMetricsSettings/);
});
