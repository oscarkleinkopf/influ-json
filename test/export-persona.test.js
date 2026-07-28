const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';

const dbService = require('../db');
const app = require('../server');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

test('GET /api/export/persona/:id returns ZIP with character_lock + packs', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const persona = dbService.savePersona({
    name: `ExportTest_${Date.now()}`,
    gender: 'Female',
    age: '25 años',
    ethnicity: 'Latina de tez clara',
    style: 'Natural',
    forceCreate: true,
    detailedJSON: {
      identity: { name: 'Export Test', apparent_age: '25 años' },
      facial_features: { skin_tone: 'Piel clara', skin_tone_hex: '#f0d5c0', face_shape: 'Ovalada', eye_color: 'Marrón' },
      hair: { color: 'Castaño', texture: 'Ondulado', length: 'Largo' },
      body: { body_type: 'Atlético' },
      character_lock: {
        version: 1,
        free_tier: true,
        must_match_every_image: { name: 'Export Test', skin_tone_hex: '#f0d5c0' }
      }
    }
  });

  const tmpZip = path.join(__dirname, `../scratch/export_test_${persona.id}.zip`);
  const tmpDir = path.join(__dirname, `../scratch/export_test_${persona.id}_out`);

  try {
    const res = await fetch(`${baseUrl}/api/export/persona/${persona.id}`, {
      headers: authHeaders()
    });
    assert.equal(res.status, 200, 'export should return 200');
    const ctype = res.headers.get('content-type') || '';
    assert.match(ctype, /zip|octet-stream/i);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 100, 'zip should not be empty');
    fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
    fs.writeFileSync(tmpZip, buf);

    fs.mkdirSync(tmpDir, { recursive: true });
    // unzip if available; otherwise just assert magic bytes PK
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);

    try {
      execFileSync('unzip', ['-o', tmpZip, '-d', tmpDir], { stdio: 'ignore' });
      assert.ok(fs.existsSync(path.join(tmpDir, 'character_lock.json')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'persona.json')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'packs', 'fullbody.txt')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'packs', 'bikini.txt')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'licencia.json')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'README.txt')));
      const lock = JSON.parse(fs.readFileSync(path.join(tmpDir, 'character_lock.json'), 'utf8'));
      assert.equal(lock.must_match_every_image.skin_tone_hex, '#f0d5c0');
    } catch (unzipErr) {
      if (unzipErr && unzipErr.status === 127) {
        // unzip binary missing — magic-byte check above still validates ZIP
        console.warn('unzip not available; skipped content assertions');
      } else if (!String(unzipErr.message || '').includes('ENOENT')) {
        throw unzipErr;
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tmpZip, { force: true }); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { dbService.deletePersona(persona.id); } catch (_) {}
  }
});

test('GET /api/export/persona/:id → 404 for missing id', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export/persona/does-not-exist`, {
      headers: authHeaders()
    });
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
