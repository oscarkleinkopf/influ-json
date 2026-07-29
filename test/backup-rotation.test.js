const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const db = require('../db');
const app = require('../server');
const { DATA_DIR } = require('../paths');

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

async function loginAdmin(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: process.env.STUDIO_PIN || '1234' })
  });
  const data = await res.json();
  const raw = res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '';
  const cookie = raw.split(';')[0];
  return { data, cookie, headers: { 'Content-Type': 'application/json', Cookie: cookie } };
}

function parseUnzipList(listing) {
  return listing
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+/.test(l))
    .map((l) => l.replace(/^\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+/, '').trim())
    .filter(Boolean);
}

test('backup rotation: 12 creates con keep=10 → quedan 10', () => {
  const prevKeep = process.env.BACKUP_KEEP;
  process.env.BACKUP_KEEP = '10';

  const backupsDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const aside = path.join(os.tmpdir(), `influ_bak_aside_${Date.now()}`);
  fs.mkdirSync(aside, { recursive: true });
  const parked = [];
  for (const f of fs.readdirSync(backupsDir)) {
    const src = path.join(backupsDir, f);
    const dest = path.join(aside, f);
    fs.renameSync(src, dest);
    parked.push(f);
  }

  const labelPrefix = `w10rot_${Date.now()}_`;
  try {
    for (let i = 0; i < 12; i++) {
      db.createBackupSnapshot(`${labelPrefix}${i}`);
    }
    const after = db.listBackupSnapshots();
    assert.equal(after.length, 10, `esperaba 10, hay ${after.length}: ${after.map((s) => s.filename).join(', ')}`);
    assert.ok(after.every((s) => s.filename.includes(labelPrefix)));
  } finally {
    for (const s of db.listBackupSnapshots()) {
      if (!s.filename.includes(labelPrefix)) continue;
      try { fs.unlinkSync(s.path); } catch (_) {}
      const twin = s.path.replace(/\.sqlite$/i, '_personas.json');
      try { if (fs.existsSync(twin)) fs.unlinkSync(twin); } catch (_) {}
    }
    for (const f of parked) {
      try { fs.renameSync(path.join(aside, f), path.join(backupsDir, f)); } catch (_) {}
    }
    try { fs.rmSync(aside, { recursive: true, force: true }); } catch (_) {}
    if (prevKeep === undefined) delete process.env.BACKUP_KEEP;
    else process.env.BACKUP_KEEP = prevKeep;
  }
});

test('GET /api/export/studio: ZIP con DB y sin .env', async () => {
  const poison = path.join(DATA_DIR, '.env');
  const plantedPoison = !fs.existsSync(poison);
  if (plantedPoison) fs.writeFileSync(poison, 'STUDIO_PIN=should-not-export\n', 'utf8');

  const tmpZip = path.join(os.tmpdir(), `influ_studio_export_test_${Date.now()}.zip`);

  try {
    await withServer(async (base) => {
      const admin = await loginAdmin(base);
      assert.equal(admin.data.success, true);

      const res = await fetch(`${base}/api/export/studio`, { headers: { Cookie: admin.cookie } });
      if (res.status !== 200) {
        const errBody = await res.text();
        assert.fail(`export studio status ${res.status}: ${errBody.slice(0, 400)}`);
      }
      const ctype = res.headers.get('content-type') || '';
      assert.ok(/zip|octet-stream/i.test(ctype), ctype);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 100);
      assert.equal(buf.slice(0, 2).toString('utf8'), 'PK');
      fs.writeFileSync(tmpZip, buf);

      const listing = execFileSync('unzip', ['-l', tmpZip], { encoding: 'utf8' });
      const names = parseUnzipList(listing);
      assert.ok(
        names.some((n) => n === '.env.example' || n.endsWith('/.env.example')),
        'debe incluir .env.example'
      );
      assert.ok(
        names.some((n) => n.includes('influ.sqlite') || n.startsWith('data/')),
        'debe incluir data/ o influ.sqlite'
      );
      assert.ok(
        names.every((n) => path.basename(n) !== '.env'),
        `no debe incluir .env; entradas: ${names.filter((n) => n.includes('.env')).join(', ')}`
      );
    });
  } finally {
    if (plantedPoison) {
      try { fs.unlinkSync(poison); } catch (_) {}
    }
    try { fs.unlinkSync(tmpZip); } catch (_) {}
  }
});

test('export studio UI + createZipArchive wired', () => {
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(adminJs, /\/api\/export\/studio/);
  assert.match(adminJs, /BACKUP_KEEP|getBackupKeepLimit|rotation/);
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverJs, /createZipArchive/);
  assert.match(serverJs, /registerAdminRoutes\(app,\s*\{[\s\S]*createZipArchive/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /btnExportStudioZip/);
  assert.match(html, /\/api\/export\/studio/);
});
