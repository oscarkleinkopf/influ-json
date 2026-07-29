const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.ENABLE_LEGACY_MIRRORS;

const db = require('../db');
const { DATA_DIR } = require('../paths');

test('W6: influ.sqlite y personas.json están en .gitignore y no tracked', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gi, /^influ\.sqlite$/m);
  assert.match(gi, /^personas\.json$/m);

  const tracked = execFileSync('git', ['ls-files', 'influ.sqlite', 'personas.json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  }).trim();
  assert.equal(tracked, '', `aún tracked: ${tracked}`);
});

test('W6: sync mirrors son no-op sin ENABLE_LEGACY_MIRRORS', () => {
  assert.equal(db.legacyMirrorsEnabled(), false);
  const rootDb = path.join(__dirname, '..', 'influ.sqlite');
  const rootJson = path.join(__dirname, '..', 'personas.json');
  const beforeDbMtime = fs.existsSync(rootDb) ? fs.statSync(rootDb).mtimeMs : null;
  const beforeJsonMtime = fs.existsSync(rootJson) ? fs.statSync(rootJson).mtimeMs : null;

  db.syncDbToWorkspace();
  db.syncPersonasJson();

  if (beforeDbMtime != null) {
    assert.equal(fs.statSync(rootDb).mtimeMs, beforeDbMtime);
  }
  if (beforeJsonMtime != null) {
    assert.equal(fs.statSync(rootJson).mtimeMs, beforeJsonMtime);
  }
});

test('W6: backup escribe personas JSON desde SQLite (no desde mirror raíz)', () => {
  const snap = db.createBackupSnapshot('w6_export');
  assert.ok(snap.ok);
  assert.ok(fs.existsSync(snap.dbPath));
  assert.ok(snap.personasJsonPath && fs.existsSync(snap.personasJsonPath));
  const payload = JSON.parse(fs.readFileSync(snap.personasJsonPath, 'utf8'));
  assert.ok(Array.isArray(payload));
  // cleanup
  try { fs.unlinkSync(snap.dbPath); } catch (_) {}
  try { if (snap.personasJsonPath) fs.unlinkSync(snap.personasJsonPath); } catch (_) {}
});

test('W6: buildPersonasExportPayload exporta desde DB activa', () => {
  const rows = db.buildPersonasExportPayload();
  assert.ok(Array.isArray(rows));
  assert.ok(db.getDbPath().includes(path.basename(DATA_DIR)) || db.getDbPath().endsWith('influ.sqlite'));
});
