const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';

const app = require('../server');
const {
  assertValidImageBuffer,
  makeTestJpegBuffer,
  makeInvalidImageError
} = require('../image-validation');
const { PROJECT_ROOT } = require('../paths');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
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

test('assertValidImageBuffer acepta JPEG real y rechaza basura/SVG', async () => {
  const jpeg = await makeTestJpegBuffer();
  const meta = await assertValidImageBuffer(jpeg);
  assert.equal(meta.format, 'jpeg');
  assert.ok(meta.width >= 1);

  await assert.rejects(
    () => assertValidImageBuffer(Buffer.from('not-an-image')),
    (err) => err.code === 'INVALID_IMAGE'
  );

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
  await assert.rejects(
    () => assertValidImageBuffer(svg),
    (err) => err.code === 'INVALID_IMAGE' && /SVG/i.test(err.message)
  );

  const err = makeInvalidImageError('x');
  assert.equal(err.code, 'INVALID_IMAGE');
});

test('POST /api/import-influencer rechaza bytes basura (400) y no deja ref_*', async () => {
  await withServer(async (base) => {
    const refsDir = path.join(PROJECT_ROOT, 'assets', 'references');
    const unique = `badjunk_${Date.now()}.jpg`;

    const form = new FormData();
    form.append('name', `BadImport_${Date.now()}`);
    form.append('previewOnly', '1');
    form.append('photo', new Blob([Buffer.from('fake-not-image')], { type: 'image/jpeg' }), unique);

    const res = await fetch(`${base}/api/import-influencer`, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.equal(data.code, 'INVALID_IMAGE');
    assert.match(data.message || '', /imagen válida/i);

    if (fs.existsSync(refsDir)) {
      const leaked = fs.readdirSync(refsDir).filter((f) => f.includes('badjunk_'));
      assert.deepEqual(leaked, [], `No deben quedar refs del upload inválido: ${leaked.join(',')}`);
    }
  });
});

test('POST /api/import-influencer acepta JPEG real (200 preview)', async () => {
  await withServer(async (base) => {
    const jpeg = await makeTestJpegBuffer({ background: '#e8c4a8' });
    const form = new FormData();
    form.append('name', `GoodImport_${Date.now()}`);
    form.append('previewOnly', '1');
    form.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'good.jpg');

    const res = await fetch(`${base}/api/import-influencer`, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.success, true);
    assert.equal(data.preview, true);
    assert.ok(data.persona?.image);

    // cleanup preview ref
    if (data.persona?.image) {
      await fetch(`${base}/api/import-preview/discard`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ imagePaths: [data.persona.image] })
      });
    }
  });
});

test('POST /api/upload-reference rechaza basura (400)', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('photo', new Blob([Buffer.from('totally-not-an-image')], { type: 'image/png' }), 'x.png');
    const res = await fetch(`${base}/api/upload-reference`, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'INVALID_IMAGE');
  });
});
