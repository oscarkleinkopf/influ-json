/**
 * Resumen / portfolio: servir assets desde DATA_DIR si faltan en assets/.
 * Evita thumbnails rotos cuando el mirror en data/ existe pero assets/ fue limpiado.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-asset-fallback';

const { DATA_DIR, ensureDataLayout } = require('../paths');
ensureDataLayout();

const app = require('../server');

const ASSETS_REF = path.join(__dirname, '..', 'assets', 'references');
const ASSETS_GEN = path.join(__dirname, '..', 'assets', 'generated');
const DATA_REF = path.join(DATA_DIR, 'references');
const DATA_GEN = path.join(DATA_DIR, 'generated');

function cookieFrom(res) {
  const multi = res.headers.getSetCookie?.();
  if (multi && multi.length) return multi.map((c) => c.split(';')[0]).join('; ');
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

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

test('DATA_DIR fallback: referencia solo en data/ se sirve en /assets/references', async () => {
  fs.mkdirSync(DATA_REF, { recursive: true });
  fs.mkdirSync(ASSETS_REF, { recursive: true });
  const name = `fallback_ref_${Date.now()}.txt`;
  const dataPath = path.join(DATA_REF, name);
  const assetsPath = path.join(ASSETS_REF, name);
  fs.writeFileSync(dataPath, 'from-data-dir');
  try {
    if (fs.existsSync(assetsPath)) fs.unlinkSync(assetsPath);
  } catch (_) {}

  try {
    await withServer(async (base) => {
      const unauth = await fetch(`${base}/assets/references/${name}`);
      assert.equal(unauth.status, 401, 'sigue gated sin sesión');

      const pin = (process.env.STUDIO_PIN || '1234').trim();
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      assert.equal(login.status, 200);
      const cookie = cookieFrom(login);
      assert.ok(cookie.includes('influ.sid'));

      const ok = await fetch(`${base}/assets/references/${name}`, {
        headers: { Cookie: cookie }
      });
      assert.equal(ok.status, 200);
      assert.equal(await ok.text(), 'from-data-dir');
    });
  } finally {
    try { fs.unlinkSync(dataPath); } catch (_) {}
  }
});

test('DATA_DIR fallback: generated solo en data/ se sirve en /assets/generated', async () => {
  fs.mkdirSync(DATA_GEN, { recursive: true });
  fs.mkdirSync(ASSETS_GEN, { recursive: true });
  const name = `fallback_gen_${Date.now()}.txt`;
  const dataPath = path.join(DATA_GEN, name);
  const assetsPath = path.join(ASSETS_GEN, name);
  fs.writeFileSync(dataPath, 'gen-from-data');
  try {
    if (fs.existsSync(assetsPath)) fs.unlinkSync(assetsPath);
  } catch (_) {}

  try {
    await withServer(async (base) => {
      const pin = (process.env.STUDIO_PIN || '1234').trim();
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      assert.equal(login.status, 200);
      const cookie = cookieFrom(login);

      const ok = await fetch(`${base}/assets/generated/${name}`, {
        headers: { Cookie: cookie }
      });
      assert.equal(ok.status, 200);
      assert.equal(await ok.text(), 'gen-from-data');
    });
  } finally {
    try { fs.unlinkSync(dataPath); } catch (_) {}
  }
});

test('server.js monta static DATA_DIR tras assets para references/generated', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /express\.static\(path\.join\(assetsRoot, 'references'\)\)/);
  assert.match(src, /express\.static\(path\.join\(assetsDataDir, 'references'\)\)/);
  assert.match(src, /express\.static\(path\.join\(assetsDataDir, 'generated'\)\)/);
});
