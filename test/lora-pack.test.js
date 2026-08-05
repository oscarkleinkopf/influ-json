const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';

const dbService = require('../db');
const loraPack = require('../lora-pack');
const app = require('../server');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

test('buildLoraPack derives trigger token + captions from character_lock', () => {
  const persona = {
    name: 'Daniela Test',
    gender: 'Female',
    image: 'assets/generated/anchor.jpg',
    detailedJSON: { character_lock: { version: 1, must_match_every_image: { name: 'Daniela' } } }
  };
  const variants = [
    { image_path: 'assets/generated/v1.jpg', pose: 'De pie (cuerpo entero)', clothing: 'Vestido rojo', setting: 'Playa' }
  ];
  const pack = loraPack.buildLoraPack(persona, variants);

  assert.match(pack.triggerToken, /^ohwx_/, 'trigger token has rare prefix');
  assert.equal(pack.classWord, 'woman');
  assert.equal(pack.count, 2, 'anchor + 1 variant');
  // caption of the anchor (no variant) and variant
  const anchorItem = pack.datasetItems[0];
  assert.ok(anchorItem.caption.startsWith(`${pack.triggerToken} woman`), 'caption leads with trigger + class');
  assert.equal(anchorItem.imageName, 'img_01.jpg');
  assert.equal(anchorItem.captionName, 'img_01.txt');
  const variantItem = pack.datasetItems[1];
  assert.match(variantItem.caption, /de pie/i, 'variant caption includes pose');
  assert.match(variantItem.caption, /wearing vestido rojo/i, 'variant caption includes clothing');
  // text files present
  const names = pack.textFiles.map((f) => f.name);
  assert.ok(names.includes('README.txt'));
  assert.ok(names.includes('config/ai-toolkit-flux.yaml'));
  assert.ok(names.includes('character_lock.json'));
  assert.ok(names.includes('trigger.txt'));
  const readme = pack.textFiles.find((f) => f.name === 'README.txt').content;
  assert.match(readme, /docs\/lora\/L1_COLAB\.md/, 'README points to L1 Colab guide');
  assert.match(readme, /influ_json_lora_train\.ipynb/, 'README points to L1 notebook');
});

test('L1 Colab docs exist in repo', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'docs', 'lora', 'L1_COLAB.md')));
  assert.ok(fs.existsSync(path.join(root, 'docs', 'lora', 'influ_json_lora_train.ipynb')));
  const nb = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'lora', 'influ_json_lora_train.ipynb'), 'utf8'));
  assert.ok(Array.isArray(nb.cells) && nb.cells.length >= 5, 'notebook has training cells');
});

test('GET /api/export/persona/:id/lora-pack returns a ZIP with dataset + config', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // Create a persona with a real anchor image on disk so the dataset has ≥1 image.
  const genDir = path.join(__dirname, '..', 'assets', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const imgName = `loratest_${Date.now()}.jpg`;
  const imgAbs = path.join(genDir, imgName);
  // Minimal valid JPEG (SOI + EOI is enough for archiver to copy bytes)
  fs.writeFileSync(imgAbs, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const persona = dbService.savePersona({
    name: `LoraTest_${Date.now()}`,
    gender: 'Female',
    age: '25 años',
    ethnicity: 'Latina de tez clara',
    forceCreate: true,
    image: `assets/generated/${imgName}`,
    detailedJSON: {
      facial_features: { skin_tone_hex: '#f0d5c0' },
      character_lock: { version: 1, free_tier: true, must_match_every_image: { name: 'Lora Test' } }
    }
  });

  const tmpZip = path.join(__dirname, `../scratch/lora_test_${persona.id}.zip`);
  const tmpDir = path.join(__dirname, `../scratch/lora_test_${persona.id}_out`);

  try {
    const res = await fetch(`${baseUrl}/api/export/persona/${persona.id}/lora`, {
      headers: authHeaders()
    });
    assert.equal(res.status, 200, 'lora-pack export should return 200');
    const ctype = res.headers.get('content-type') || '';
    assert.match(ctype, /zip|octet-stream/i);
    const cd = res.headers.get('content-disposition') || '';
    assert.match(cd, /lora_pack\.zip/i);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 100, 'zip should not be empty');
    assert.equal(buf[0], 0x50); // P
    assert.equal(buf[1], 0x4b); // K

    fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
    fs.writeFileSync(tmpZip, buf);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      execFileSync('unzip', ['-o', tmpZip, '-d', tmpDir], { stdio: 'ignore' });
      assert.ok(fs.existsSync(path.join(tmpDir, 'README.txt')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'config', 'ai-toolkit-flux.yaml')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'trigger.txt')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'dataset', 'img_01.jpg')), 'dataset image present');
      assert.ok(fs.existsSync(path.join(tmpDir, 'dataset', 'img_01.txt')), 'dataset caption present');
      const caption = fs.readFileSync(path.join(tmpDir, 'dataset', 'img_01.txt'), 'utf8');
      assert.match(caption, /^ohwx_/, 'caption leads with trigger token');
    } catch (unzipErr) {
      if (unzipErr && unzipErr.status === 127) {
        console.warn('unzip not available; skipped content assertions');
      } else if (!String(unzipErr.message || '').includes('ENOENT')) {
        throw unzipErr;
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tmpZip, { force: true }); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(imgAbs, { force: true }); } catch (_) {}
    try { dbService.deletePersona(persona.id); } catch (_) {}
  }
});
