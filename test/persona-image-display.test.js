/**
 * persona-image: no servir thumbs 8×8 (bloque amarillo) ni rutas rotas al portafolio.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-persona-image';

const {
  DEFAULT_PERSONA_THUMB,
  resolvePersonaDisplayImage,
  mapPersonasDisplayImages
} = require('../persona-image');

test('resolvePersonaDisplayImage: missing → default', () => {
  assert.equal(
    resolvePersonaDisplayImage('assets/references/no_such_file_xyz.jpg'),
    DEFAULT_PERSONA_THUMB
  );
});

test('resolvePersonaDisplayImage: tiny fixture → default', () => {
  const tiny = path.join(__dirname, '..', 'assets', 'references', `tiny_yellow_${Date.now()}.jpg`);
  // Minimal valid 1x1-ish jpeg via copy of known tiny harness file if present
  const known = path.join(__dirname, '..', 'assets', 'references', 'ref_1786382208559_photo.jpg');
  if (fs.existsSync(known) && fs.statSync(known).size < 2048) {
    assert.equal(resolvePersonaDisplayImage('assets/references/ref_1786382208559_photo.jpg'), DEFAULT_PERSONA_THUMB);
  } else {
    // write a tiny buffer file
    fs.writeFileSync(tiny, Buffer.alloc(100, 0xff));
    try {
      assert.equal(resolvePersonaDisplayImage(`assets/references/${path.basename(tiny)}`), DEFAULT_PERSONA_THUMB);
    } finally {
      try { fs.unlinkSync(tiny); } catch (_) {}
    }
  }
});

test('resolvePersonaDisplayImage: real generated kept', () => {
  const genDir = path.join(__dirname, '..', 'assets', 'generated');
  if (!fs.existsSync(genDir)) return;
  const big = fs.readdirSync(genDir)
    .map((n) => path.join(genDir, n))
    .find((p) => fs.statSync(p).isFile() && fs.statSync(p).size >= 2048);
  if (!big) return;
  const rel = `assets/generated/${path.basename(big)}`;
  assert.equal(resolvePersonaDisplayImage(rel), rel);
});

test('mapPersonasDisplayImages replaces tiny/missing', () => {
  const out = mapPersonasDisplayImages([
    { id: '1', name: 'A', image: 'assets/references/definitely_missing_123.jpg' },
    { id: '2', name: 'B', image: '' }
  ]);
  assert.equal(out[0].image, DEFAULT_PERSONA_THUMB);
  assert.equal(out[1].image, DEFAULT_PERSONA_THUMB);
});

test('app.js: bindPersonaThumbFallback handles img.complete (cache)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /imgEl\.complete/);
  assert.match(app, /isHarnessPersonaName\(p\?\.name\)/);
});

function cookieFrom(res) {
  const multi = res.headers.getSetCookie?.();
  if (multi && multi.length) return multi.map((c) => c.split(';')[0]).join('; ');
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

test('API /api/data sustituye thumbs minúsculos por default', async () => {
  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
    });
    assert.equal(login.status, 200);
    const cookie = cookieFrom(login);
    const res = await fetch(`${base}/api/data`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const data = await res.json();
    const personas = data.personas || [];
    const dual = personas.find((p) => /^DualSyncPersona/i.test(p.name || ''));
    if (dual) {
      assert.equal(dual.image, DEFAULT_PERSONA_THUMB);
    }
    const withTinyPath = personas.filter((p) => /ref_.*photo\.jpg$/i.test(p.image || ''));
    // After map, tiny refs should not remain as original tiny paths if they were tiny
    for (const p of withTinyPath.slice(0, 5)) {
      const abs = path.join(__dirname, '..', p.image);
      if (fs.existsSync(abs)) {
        assert.ok(fs.statSync(abs).size >= 2048, `still tiny: ${p.name} ${p.image}`);
      }
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});
