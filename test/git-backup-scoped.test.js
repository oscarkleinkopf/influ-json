/**
 * Scoped git backup: only data/ + personas.json + influ.sqlite (never `git add .`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, exec } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const {
  getGitBackupStagePaths,
  buildGitBackupCommand,
  runGitBackup
} = require('../git-backup');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeTempRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-git-backup-'));
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  // Allow committing backup artifacts in the fixture; keep normal source noise visible.
  fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n.env\n');
  fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'data', 'influ.sqlite'), 'baseline-db');
  fs.writeFileSync(path.join(cwd, 'personas.json'), '[]');
  fs.writeFileSync(path.join(cwd, 'influ.sqlite'), 'mirror-baseline');
  fs.writeFileSync(path.join(cwd, 'README.md'), 'fixture\n');
  git(cwd, ['add', 'README.md', '.gitignore', 'data', 'personas.json', 'influ.sqlite']);
  git(cwd, ['commit', '-m', 'baseline']);
  return cwd;
}

test('getGitBackupStagePaths lists data, personas.json, influ.sqlite', () => {
  const paths = getGitBackupStagePaths();
  assert.deepEqual(paths, ['data', 'personas.json', 'influ.sqlite']);
});

test('buildGitBackupCommand stages explicit paths — never git add .', () => {
  const cmd = buildGitBackupCommand('Backup auto-sync: test');
  assert.match(cmd, /git add -- /);
  assert.doesNotMatch(cmd, /git add \./);
  assert.match(cmd, /"data"/);
  assert.match(cmd, /"personas\.json"/);
  assert.match(cmd, /"influ\.sqlite"/);
  assert.match(cmd, /git push origin main/);
  assert.match(cmd, /--allow-empty/);
});

test('server.js wires git-backup module (no inline unscoped add)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/git-backup'\)/);
  // Strip comments before checking for the anti-pattern
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /git add \./);
  assert.doesNotMatch(code, /git add --all/);
});

test('backup commit includes only intended data paths; unrelated file stays out', async () => {
  const cwd = makeTempRepo();
  const unrelated = path.join(cwd, 'unrelated-should-stay-out.js');
  const sourceNoise = path.join(cwd, 'server-fake.js');
  fs.writeFileSync(unrelated, 'console.log("do not commit")\n');
  fs.writeFileSync(sourceNoise, '// unrelated source change\n');

  // Simulate post-save data mutations the backup is meant to protect
  fs.writeFileSync(path.join(cwd, 'data', 'influ.sqlite'), 'db-after-persona-save');
  fs.writeFileSync(path.join(cwd, 'personas.json'), '[{"name":"AfterSave"}]');
  fs.writeFileSync(path.join(cwd, 'influ.sqlite'), 'mirror-after-save');

  const prevEnable = process.env.ENABLE_GIT_BACKUP;
  const prevDisable = process.env.DISABLE_GIT_BACKUP;
  process.env.ENABLE_GIT_BACKUP = '1';
  delete process.env.DISABLE_GIT_BACKUP;

  try {
    const ran = await new Promise((resolve, reject) => {
      let httpCbMs = null;
      const t0 = Date.now();
      runGitBackup(
        () => {
          httpCbMs = Date.now() - t0;
        },
        {
          cwd,
          skipPush: true,
          exec,
          onComplete: (err, stdout) => {
            if (err) reject(err);
            else resolve({ stdout, httpCbMs });
          }
        }
      );
    });

    assert.ok(ran.httpCbMs != null && ran.httpCbMs < 50, 'HTTP callback must be non-blocking');

    const show = git(cwd, ['show', '--name-only', '--pretty=format:', 'HEAD']);
    const files = show.split(/\n/).map((s) => s.trim()).filter(Boolean);
    assert.ok(files.length >= 1, 'backup commit should include staged data paths');
    for (const f of files) {
      assert.ok(
        f === 'data/influ.sqlite' || f === 'personas.json' || f === 'influ.sqlite' || f.startsWith('data/'),
        `unexpected path in backup commit: ${f}`
      );
    }
    assert.ok(!files.includes('unrelated-should-stay-out.js'));
    assert.ok(!files.includes('server-fake.js'));

    const status = git(cwd, ['status', '--porcelain']);
    assert.match(status, /unrelated-should-stay-out\.js/);
    assert.match(status, /server-fake\.js/);
    assert.doesNotMatch(status, /^[MAD]\s+server-fake\.js/m);
  } finally {
    if (prevEnable === undefined) delete process.env.ENABLE_GIT_BACKUP;
    else process.env.ENABLE_GIT_BACKUP = prevEnable;
    if (prevDisable === undefined) delete process.env.DISABLE_GIT_BACKUP;
    else process.env.DISABLE_GIT_BACKUP = prevDisable;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('POST /api/personas schedules scoped backup; unrelated working tree file untouched', async () => {
  const cwd = makeTempRepo();
  const unrelated = path.join(cwd, 'leak-me.js');
  fs.writeFileSync(unrelated, 'export default 1\n');
  fs.writeFileSync(path.join(cwd, 'data', 'influ.sqlite'), 'api-save-db');
  fs.writeFileSync(path.join(cwd, 'personas.json'), '[{"n":1}]');
  fs.writeFileSync(path.join(cwd, 'influ.sqlite'), 'api-mirror');

  const prevEnable = process.env.ENABLE_GIT_BACKUP;
  const prevDisable = process.env.DISABLE_GIT_BACKUP;
  process.env.ENABLE_GIT_BACKUP = '1';
  delete process.env.DISABLE_GIT_BACKUP;

  const gitBackupMod = require('../git-backup');
  const app = require('../server');
  const db = require('../db');

  const headBefore = git(cwd, ['rev-parse', 'HEAD']);
  const original = gitBackupMod.runGitBackup;
  let backupDone;
  const backupPromise = new Promise((resolve, reject) => {
    backupDone = { resolve, reject };
  });

  gitBackupMod.runGitBackup = (callback, opts = {}) =>
    original(callback, {
      ...opts,
      cwd,
      skipPush: true,
      exec,
      onComplete: (err, stdout, stderr) => {
        if (typeof opts.onComplete === 'function') opts.onComplete(err, stdout, stderr);
        if (err) backupDone.reject(err);
        else backupDone.resolve({ stdout, stderr });
      }
    });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  try {
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.STUDIO_PIN || '1234'}`
      },
      body: JSON.stringify({
        name: `ScopedBackupApi_${Date.now()}`,
        gender: 'Female',
        forceCreate: true
      })
    });
    const elapsed = Date.now() - t0;
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.gitSynced, true);
    assert.ok(elapsed < 2000, `persona save should stay fast (got ${elapsed}ms)`);

    await backupPromise;

    const headAfter = git(cwd, ['rev-parse', 'HEAD']);
    assert.notEqual(headAfter, headBefore, 'backup should create a commit');

    const files = git(cwd, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    assert.ok(files.length >= 1);
    for (const f of files) {
      assert.ok(
        f === 'personas.json' || f === 'influ.sqlite' || f.startsWith('data/'),
        `unexpected path in backup commit: ${f}`
      );
    }
    assert.ok(!files.includes('leak-me.js'));

    const status = git(cwd, ['status', '--porcelain']);
    assert.match(status, /leak-me\.js/);
    assert.doesNotMatch(status, /^[MADRC]\s+leak-me\.js/m);

    if (body.persona?.id) {
      try {
        db.deletePersona(body.persona.id);
      } catch (_) {}
    }
  } finally {
    gitBackupMod.runGitBackup = original;
    await new Promise((r) => server.close(r));
    if (prevEnable === undefined) delete process.env.ENABLE_GIT_BACKUP;
    else process.env.ENABLE_GIT_BACKUP = prevEnable;
    if (prevDisable === undefined) delete process.env.DISABLE_GIT_BACKUP;
    else process.env.DISABLE_GIT_BACKUP = prevDisable;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
