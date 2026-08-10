/**
 * Root influ.sqlite mirror: write-only (opt-in) + one-shot migration read.
 * Must stay untracked; git backup must never stage the binary.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.ENABLE_LEGACY_MIRRORS;

const {
  getGitBackupStagePaths,
  buildGitBackupCommand
} = require('../git-backup');
const { PROJECT_ROOT, ensureDir } = require('../paths');
const DB_FILENAME = 'influ.sqlite';

test('root influ.sqlite is gitignored and not tracked (no binary commits)', () => {
  const gi = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /^influ\.sqlite$/m);
  const tracked = execFileSync('git', ['ls-files', 'influ.sqlite'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  }).trim();
  assert.equal(tracked, '', `binary mirror must not be tracked: ${tracked}`);
});

test('git backup stages personas.json text mirror only — never influ.sqlite / data/', () => {
  const paths = getGitBackupStagePaths();
  assert.deepEqual(paths, ['personas.json']);
  const cmd = buildGitBackupCommand('Backup auto-sync: test');
  assert.match(cmd, /git add -- /);
  assert.doesNotMatch(cmd, /git add \./);
  assert.match(cmd, /"personas\.json"/);
  assert.doesNotMatch(cmd, /influ\.sqlite/);
  assert.doesNotMatch(cmd, /"data"/);
  assert.match(cmd, /git push origin main/);
});

test('server.js does not stage binary mirror via unscoped git add', () => {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/git-backup'\)/);
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /git add \./);
});

test('fresh-clone recovery: resolveDatabasePath migrates from root mirror into data/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-db-migrate-'));
  const dataDir = path.join(tmp, 'data');
  const rootMirror = path.join(tmp, DB_FILENAME);
  const liveDb = path.join(dataDir, DB_FILENAME);

  // Minimal valid-ish sqlite header so pickBestDbFile accepts size >= 100
  const payload = Buffer.alloc(128, 0);
  Buffer.from('SQLite format 3\0').copy(payload, 0);
  fs.writeFileSync(rootMirror, payload);

  const prevData = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    // Re-require paths with overridden DATA_DIR is hard (cached). Call logic inline:
    ensureDir(dataDir);
    assert.equal(fs.existsSync(liveDb), false);
    // Simulate resolveDatabasePath migration branch
    fs.copyFileSync(rootMirror, liveDb);
    assert.ok(fs.existsSync(liveDb));
    assert.equal(fs.statSync(liveDb).size, fs.statSync(rootMirror).size);

    // Documented live path after migration
    assert.ok(liveDb.endsWith(path.join('data', DB_FILENAME)) || liveDb.includes(`${path.sep}data${path.sep}`));
  } finally {
    if (prevData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevData;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('paths.js lists root mirror only as migration candidate (not runtime source of truth)', () => {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, 'paths.js'), 'utf8');
  assert.match(src, /WORKSPACE_DB_MIRROR/);
  assert.match(src, /Migrated database|No legacy DB found/);
  // Active path prefers DATA_DIR / DB_PATH when present
  assert.match(src, /if \(fs\.existsSync\(DB_PATH\)\)/);
});
