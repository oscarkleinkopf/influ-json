/**
 * Corte C — doctor, pending restore, support bundle.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Database = require('better-sqlite3');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-corte-c';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const {
  sqliteQuickCheck,
  schedulePendingRestore,
  applyPendingRestoreIfAny,
  readPendingRestore,
  candidatePath,
  pendingPath
} = require('../pending-restore');
const { runDoctor } = require('../studio-doctor');
const { writeSupportBundle, collectRedactedConfig } = require('../support-bundle');
const { loginSession } = require('./helpers/session');

test('sqliteQuickCheck ok en DB mínima', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-qc-'));
  const dbFile = path.join(dir, 't.sqlite');
  const db = new Database(dbFile);
  db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);');
  db.close();
  const r = sqliteQuickCheck(dbFile);
  assert.equal(r.ok, true);
  assert.equal(r.detail, 'ok');
});

test('pending restore: inválido no aplica; válido swap al apply', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-pr-'));
  const active = path.join(dir, 'influ.sqlite');
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups);

  const activeDb = new Database(active);
  activeDb.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('ACTIVE');");
  activeDb.close();

  const goodSrc = path.join(backups, 'good.sqlite');
  const goodDb = new Database(goodSrc);
  goodDb.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('RESTORED');");
  goodDb.close();

  const badSrc = path.join(backups, 'bad.sqlite');
  fs.writeFileSync(badSrc, 'not-a-sqlite', 'utf8');

  assert.throws(
    () => schedulePendingRestore({ dataDir: dir, sourceAbs: badSrc }),
    /quick_check|inválido/i
  );
  assert.equal(readPendingRestore(dir), null);
  assert.equal(fs.readFileSync(active).length > 0, true);

  const scheduled = schedulePendingRestore({
    dataDir: dir,
    sourceAbs: goodSrc,
    sourceFilename: 'good.sqlite'
  });
  assert.equal(scheduled.pending, true);
  assert.ok(fs.existsSync(candidatePath(dir)));
  assert.ok(fs.existsSync(pendingPath(dir)));

  // Active unchanged until apply
  const before = new Database(active, { readonly: true });
  assert.equal(before.prepare('SELECT v FROM marker').get().v, 'ACTIVE');
  before.close();

  const applied = applyPendingRestoreIfAny(dir, active);
  assert.equal(applied.applied, true);
  assert.equal(readPendingRestore(dir), null);

  const after = new Database(active, { readonly: true });
  assert.equal(after.prepare('SELECT v FROM marker').get().v, 'RESTORED');
  after.close();
});

test('runDoctor devuelve checks sin secretos', () => {
  const report = runDoctor();
  assert.equal(typeof report.ok, 'boolean');
  assert.ok(Array.isArray(report.checks));
  assert.ok(report.checks.some((c) => c.id === 'node'));
  assert.ok(report.checks.some((c) => c.id === 'sqlite_quick_check'));
  const blob = JSON.stringify(report);
  assert.doesNotMatch(blob, /POLLINATIONS_TOKEN=[^\s"]+/);
  assert.doesNotMatch(blob, /"STUDIO_PIN"\s*:\s*"[^"]+"/);
});

test('support bundle ZIP no incluye .env ni tokens', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-sb-'));
  const outPath = path.join(dir, 'bundle.zip');
  const { zipPath, doctor } = await writeSupportBundle({ outPath });
  assert.equal(zipPath, outPath);
  assert.ok(fs.existsSync(outPath));
  assert.equal(typeof doctor.ok, 'boolean');

  const listing = execFileSync('unzip', ['-l', outPath], { encoding: 'utf8' });
  assert.match(listing, /manifest\.json/);
  assert.match(listing, /doctor\.json/);
  assert.doesNotMatch(listing, /(^|\s)\.env(\s|$)/);
  assert.doesNotMatch(listing, /influ\.sqlite/);

  const cfg = collectRedactedConfig({
    POLLINATIONS_TOKEN: 'secret-token-value',
    STUDIO_PIN: '999999'
  });
  assert.equal(cfg.POLLINATIONS_TOKEN_set, true);
  assert.equal(cfg.STUDIO_PIN_set, true);
  assert.equal(JSON.stringify(cfg).includes('secret-token-value'), false);
});

test('GET /api/doctor admin OK; member 403', async () => {
  const app = require('../server');
  const dbService = require('../db');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const admin = await loginSession(base);
    const ok = await fetch(`${base}/api/doctor`, { headers: admin.headers() });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.success, true);
    assert.ok(body.doctor?.checks?.length > 0);

    const member = dbService.createStudioProfile({
      name: `DocMem_${Date.now()}`,
      pin: '556600',
      role: 'member'
    });
    const mem = await loginSession(base, { pin: '556600', profileId: member.id });
    const forbid = await fetch(`${base}/api/doctor`, { headers: mem.headers() });
    assert.equal(forbid.status, 403);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('launchers y scripts doctor existen', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'start-studio.sh')));
  assert.ok(fs.existsSync(path.join(root, 'start-studio.cmd')));
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'doctor.js')));
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'support-bundle.js')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.doctor, 'node scripts/doctor.js');
  assert.equal(pkg.scripts['support-bundle'], 'node scripts/support-bundle.js');
});
