const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const sharp = require('sharp');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-consistency-secret';

const {
  hashImage,
  hammingDistance,
  gradeFromDistance,
  scoreAgainstAnchor,
  summarizeScores,
  THRESHOLDS
} = require('../consistency-score');
const db = require('../db');
const app = require('../server');

async function writeTempPattern(name, kind) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-dhash-'));
  const file = path.join(dir, name);
  const w = 64;
  const h = 64;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let v;
      if (kind === 'hgrad') {
        v = Math.round((x / (w - 1)) * 255);
      } else if (kind === 'vgrad') {
        v = Math.round((y / (h - 1)) * 255);
      } else if (kind === 'checker') {
        v = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 255;
      } else {
        v = 180;
      }
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = kind === 'hgrad' ? Math.min(255, v + 40) : v;
    }
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(file);
  return file;
}

test('THRESHOLDS estables (ok≤8, warn≤14)', () => {
  assert.equal(THRESHOLDS.okMax, 8);
  assert.equal(THRESHOLDS.warnMax, 14);
  assert.equal(gradeFromDistance(0).grade, 'ok');
  assert.equal(gradeFromDistance(8).grade, 'ok');
  assert.equal(gradeFromDistance(9).grade, 'warn');
  assert.equal(gradeFromDistance(14).grade, 'warn');
  assert.equal(gradeFromDistance(15).grade, 'bad');
});

test('misma imagen → distancia 0; patrones distintos → distancia alta', async () => {
  const a = await writeTempPattern('a.jpg', 'hgrad');
  const bCopyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-dhash-b-'));
  const b = path.join(bCopyDir, 'b.jpg');
  fs.copyFileSync(a, b);
  const c = await writeTempPattern('c.jpg', 'checker');

  try {
    const ha = await hashImage(a);
    const hb = await hashImage(b);
    const hc = await hashImage(c);
    assert.match(ha, /^[a-f0-9]{16}$/);
    assert.equal(hammingDistance(ha, hb), 0);

    const same = await scoreAgainstAnchor(a, b);
    assert.equal(same.distance, 0);
    assert.equal(same.grade, 'ok');

    const diff = await scoreAgainstAnchor(a, c);
    assert.ok(diff.distance > 14, `expected high distance, got ${diff.distance}`);
    assert.equal(diff.grade, 'bad');
  } finally {
    try { fs.rmSync(path.dirname(a), { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(bCopyDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(path.dirname(c), { recursive: true, force: true }); } catch (_) {}
  }
});

test('summarizeScores agrega promedio y peor grado', () => {
  const s = summarizeScores([
    { consistency_distance: 2, consistency_grade: 'ok' },
    { consistency_distance: 12, consistency_grade: 'warn' },
    { consistency_distance: null }
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.avgDistance, 7);
  assert.equal(s.worstGrade, 'warn');
});

test('API rescore guarda consistency_* en variantes', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const anchorPath = await writeTempPattern(`anchor_${Date.now()}.jpg`, 'hgrad');
  const variantPath = await writeTempPattern(`var_${Date.now()}.jpg`, 'checker');

  const refs = path.join(__dirname, '..', 'assets', 'references');
  fs.mkdirSync(refs, { recursive: true });
  const anchorRel = `assets/references/ref_dhash_anchor_${Date.now()}.jpg`;
  const variantRel = `assets/references/ref_dhash_var_${Date.now()}.jpg`;
  fs.copyFileSync(anchorPath, path.join(__dirname, '..', anchorRel));
  fs.copyFileSync(variantPath, path.join(__dirname, '..', variantRel));

  const persona = db.savePersona({
    forceCreate: true,
    name: `DhashP_${Date.now()}`,
    gender: 'Female',
    image: anchorRel,
    imageUGC: anchorRel,
    profile_id: adminId
  });
  const variant = db.saveVariant({
    persona_id: persona.id,
    pose: 'test',
    clothing: 'test',
    attitude: 'test',
    setting: 'test',
    image_path: variantRel
  });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
    });
    const cookie = (login.headers.getSetCookie?.()?.[0] || login.headers.get('set-cookie') || '').split(';')[0];

    const res = await fetch(`${base}/api/personas/${persona.id}/consistency/rescore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({})
    });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.success, true);
    const row = (data.variants || []).find((v) => v.id === variant.id);
    assert.ok(row);
    assert.ok(row.consistency_distance != null);
    assert.ok(['ok', 'warn', 'bad'].includes(row.consistency_grade));
    assert.ok(row.consistency_distance > 8, `patrones distintos deberían divergir, got ${row.consistency_distance}`);
  } finally {
    await new Promise((r) => server.close(r));
    try { db.deletePersona(persona.id); } catch (_) {}
    try { fs.unlinkSync(path.join(__dirname, '..', anchorRel)); } catch (_) {}
    try { fs.unlinkSync(path.join(__dirname, '..', variantRel)); } catch (_) {}
    try { fs.rmSync(path.dirname(anchorPath), { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(path.dirname(variantPath), { recursive: true, force: true }); } catch (_) {}
  }
});

test('UI: chip dHash y botón rescore en markup', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="qaMatrixDhash"/);
  assert.match(html, /id="btnRescoreConsistency"/);
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const vault = fs.readFileSync(path.join(__dirname, '..', 'variant-vault-ui.js'), 'utf8');
  assert.match(js, /function consistencyChipHtml/);
  assert.match(vault, /function consistencyChipHtml/);
  assert.match(vault, /\/api\/personas\/\$\{personaId\}\/consistency\/rescore/);
});
