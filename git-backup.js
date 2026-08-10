/**
 * Opt-in Git backup (ENABLE_GIT_BACKUP=1).
 *
 * Stages the text roster mirror only (`personas.json`) — never the binary
 * root `influ.sqlite` (W6: write-only legacy mirror / migration candidate).
 * Live DB remains `data/influ.sqlite` (gitignored). Still pushes origin main.
 */
const path = require('path');
const { exec } = require('child_process');
const { isGitBackupEnabled } = require('./safe-paths');
const { PROJECT_ROOT } = require('./paths');

/** Text mirror kept as the intentional git-backup artifact (not the binary DB). */
const GIT_BACKUP_STAGE_PATHS = ['personas.json'];

function getGitBackupStagePaths() {
  return GIT_BACKUP_STAGE_PATHS.slice();
}

/**
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
  GIT_BACKUP_STAGE_PATHS,
  getGitBackupStagePaths,
  buildGitBackupCommand,
  runGitBackup
};
