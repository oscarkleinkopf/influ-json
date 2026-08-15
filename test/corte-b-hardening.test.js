/**
 * Corte B — integridad .env (CR/LF), scope stats/sync, GPU mask, import rate-limit.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-corte-b';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.CSRF_PROTECTION;

const firstRun = require('../first-run');
const dbService = require('../db');
const app = require('../server');
const { loginSession } = require('./helpers/session');
const { maskBackendUrls } = require('../routes/local-gpu');

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('upsertEnvVar rechaza CR/LF y no modifica el archivo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-env-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'FOO=bar\n', 'utf8');
  const before = fs.readFileSync(envPath, 'utf8');
  assert.throws(
    () => firstRun.upsertEnvVar('POLLINATIONS_TOKEN', 'abc\nOTHER=evil', envPath),
    (err) => err && err.code === 'ENV_VALUE_UNSAFE'
  );
  assert.equal(fs.readFileSync(envPath, 'utf8'), before);
  firstRun.upsertEnvVar('POLLINATIONS_TOKEN', 'safe-token', envPath);
  const after = fs.readFileSync(envPath, 'utf8');
  assert.match(after, /^POLLINATIONS_TOKEN=safe-token$/m);
  assert.doesNotMatch(after, /OTHER=evil/);
});

test('validateNewStudioPin rechaza saltos de línea', () => {
  assert.throws(
    () => firstRun.validateNewStudioPin('abcdef\nX=1', 'abcdef\nX=1'),
    (err) => err && err.code === 'PIN_UNSAFE_CHARS'
  );
});

test('GET /api/stats/generations está scoped al perfil', async () => {
  await withServer(async (base) => {
    const adminId = dbService.ensureDefaultStudioProfile();
    const member = dbService.createStudioProfile({
      name: `StatsMem_${Date.now()}`,
      pin: '667700',
      role: 'member'
    });
    const adminPersona = dbService.savePersona({
      name: `StatsAdmin_${Date.now()}`,
      profile_id: adminId
    });
    const memPersona = dbService.savePersona({
      name: `StatsMemP_${Date.now()}`,
      profile_id: member.id
    });
    dbService.saveGeneration({
      persona_id: adminPersona.id,
      prompt: 'a',
      image_path: 'assets/generated/a.jpg',
      generation_type: 'portrait'
    });
    dbService.saveGeneration({
      persona_id: memPersona.id,
      prompt: 'b',
      image_path: 'assets/generated/b.jpg',
      generation_type: 'portrait'
    });

    const mem = await loginSession(base, { pin: '667700', profileId: member.id });
    const res = await fetch(`${base}/api/stats/generations`, { headers: mem.headers() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.stats.total, 1);
    assert.ok(body.stats.byPersona.every((r) => r.persona_id === memPersona.id));
  });
});

test('POST /api/sync exige admin (member → 403)', async () => {
  await withServer(async (base) => {
    const member = dbService.createStudioProfile({
      name: `SyncMem_${Date.now()}`,
      pin: '778800',
      role: 'member'
    });
    const mem = await loginSession(base, { pin: '778800', profileId: member.id });
    const res = await fetch(`${base}/api/sync`, {
      method: 'POST',
      headers: mem.jsonHeaders()
    });
    assert.equal(res.status, 403);
  });
});

test('maskBackendUrls redacta urls internas', () => {
  const masked = maskBackendUrls({
    configured: true,
    backends: {
      comfyui: { ok: false, url: 'http://127.0.0.1:8188', reason: 'down' },
      a1111: { ok: true, url: 'http://192.168.1.5:7860' }
    }
  });
  assert.equal(masked.backends.comfyui.url, '[redacted]');
  assert.equal(masked.backends.a1111.url, '[redacted]');
});

test('GET /api/local-gpu/status enmascara URL para member', async () => {
  const prev = process.env.COMFYUI_URL;
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  try {
    await withServer(async (base) => {
      const member = dbService.createStudioProfile({
        name: `GpuMem_${Date.now()}`,
        pin: '889900',
        role: 'member'
      });
      const mem = await loginSession(base, { pin: '889900', profileId: member.id });
      const res = await fetch(`${base}/api/local-gpu/status`, { headers: mem.headers() });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.backends.comfyui.url, '[redacted]');
    });
  } finally {
    if (prev === undefined) delete process.env.COMFYUI_URL;
    else process.env.COMFYUI_URL = prev;
  }
});

test('import-influencer route registra apiRateLimit heavy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'import.js'), 'utf8');
  assert.match(
    src,
    /app\.post\(\s*\[[^\]]*import-influencer[\s\S]*?apiRateLimit\(\s*['"]heavy['"]\s*\)/
  );
});
