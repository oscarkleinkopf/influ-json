const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';

const app = require('../server');
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

test('POST /api/import-preview/discard borra ref_* y rechaza traversal', async () => {
  await withServer(async (base) => {
    const refsDir = path.join(PROJECT_ROOT, 'assets', 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    const fname = `ref_discard_test_${Date.now()}.jpg`;
    const rel = `assets/references/${fname}`;
    const abs = path.join(refsDir, fname);
    fs.writeFileSync(abs, Buffer.from('fake-preview'));

    const ok = await fetch(`${base}/api/import-preview/discard`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imagePaths: [rel, '../../../etc/passwd', 'assets/influencer_female.png'] })
    });
    const data = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.removed.includes(rel));
    assert.equal(fs.existsSync(abs), false);

    const bad = await fetch(`${base}/api/import-preview/discard`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imagePaths: ['../../../etc/passwd'] })
    });
    const badData = await bad.json();
    assert.equal(bad.status, 200);
    assert.ok(badData.skipped.includes('../../../etc/passwd'));
  });
});
