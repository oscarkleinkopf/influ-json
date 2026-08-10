/**
 * Opt-in Git backup (ENABLE_GIT_BACKUP=1).
 * Stages only data artifacts — never `git add .` — then pushes origin main.
 */
const path = require('path');
const { exec } = require('child_process');
const { isGitBackupEnabled } = require('./safe-paths');
const { PROJECT_ROOT, DATA_DIR, WORKSPACE_DB_MIRROR } = require('./paths');

/**
 * Relative paths (from repo root) that the backup is meant to protect.
 * @returns {string[]}
 */
function getGitBackupStagePaths() {
  let dataRel = 'data';
  const rel = path.relative(PROJECT_ROOT, DATA_DIR);
  if (rel && !path.isAbsolute(rel) && !rel.startsWith(`..${path.sep}`) && rel !== '..') {
    dataRel = rel.split(path.sep).join('/');
  }
  return [dataRel, 'personas.json', path.basename(WORKSPACE_DB_MIRROR) || 'influ.sqlite'];
}

/**
 * Build the non-interactive shell command for backup.
 * @param {string} commitMsg
 * @param {{ skipPush?: boolean, paths?: string[] }} [opts]
 */
function buildGitBackupCommand(commitMsg, opts = {}) {
  const paths = opts.paths || getGitBackupStagePaths();
  const quoted = paths.map((p) => JSON.stringify(String(p))).join(' ');
  const safeMsg = String(commitMsg)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '')
    .replace(/\$/g, '');
  const push = opts.skipPush ? 'true' : 'git push origin main';
  return `git add -- ${quoted} && git commit -m "${safeMsg}" --allow-empty && ${push}`;
}

/**
 * Schedule backup in background; invoke callback immediately (non-blocking HTTP).
 * @param {(ok: boolean, msg: string) => void} [callback]
 * @param {{
 *   exec?: typeof exec,
 *   cwd?: string,
 *   skipPush?: boolean,
 *   onComplete?: (err: Error|null, stdout: string, stderr: string) => void
 * }} [opts]
 */
function runGitBackup(callback, opts = {}) {
  if (!isGitBackupEnabled()) {
    if (callback) {
      callback(true, 'Git backup omitido (requiere ENABLE_GIT_BACKUP=1; o DISABLE_GIT_BACKUP=1)');
    }
    return;
  }

  const commitMsg = `Backup auto-sync: Campaign update ${new Date().toISOString()}`;
  const commands = buildGitBackupCommand(commitMsg, { skipPush: opts.skipPush });

  // Call callback immediately to prevent blocking HTTP response
  if (callback) {
    callback(true, 'Git backup scheduled in background');
  }

  const execFn = opts.exec || exec;
  const cwd = opts.cwd || PROJECT_ROOT;
  execFn(commands, { cwd }, (error, stdout, stderr) => {
    if (typeof opts.onComplete === 'function') {
      opts.onComplete(error || null, stdout || '', stderr || '');
    }
    if (error) {
      console.warn('Background Git backup failed:', error.message);
    } else {
      console.log('Background Git backup success:', (stdout || '').trim());
    }
  });
}

module.exports = {
  getGitBackupStagePaths,
  buildGitBackupCommand,
  runGitBackup
};
