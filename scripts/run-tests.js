#!/usr/bin/env node
/**
 * UX-5 — run npm tests against an isolated DATA_DIR (temp SQLite).
 * Prevents SpeedTestPersona / DualSyncPersona_* from polluting workspace data/.
 *
 * Override: DATA_DIR=/custom/path node scripts/run-tests.js
 * Keep temp: INFLU_KEEP_TEST_DATA=1
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const createdOwnDataDir = !process.env.DATA_DIR;
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'influ-test-'));

fs.mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  DATA_DIR: dataDir,
  // Match hardcoded login pins in several suites (auth-profiles, etc.)
  STUDIO_PIN: process.env.STUDIO_PIN || '1234',
  SESSION_SECRET: process.env.SESSION_SECRET || 'test-session-secret-influ-json',
  INFLU_SKIP_ENV_PERSIST: '1',
  DISABLE_GIT_BACKUP: '1',
  ENABLE_GIT_BACKUP: '',
  // Do not migrate workspace root influ.sqlite into the temp dir
  INFLU_SKIP_DB_MIGRATE: process.env.INFLU_SKIP_DB_MIGRATE || '1',
  ENABLE_LEGACY_MIRRORS: '0',
  HOST: process.env.HOST || '127.0.0.1'
};

console.log(`[run-tests] DATA_DIR=${dataDir}`);

const glob = path.join('test', '*.test.js');
const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', glob],
  {
    cwd: root,
    env,
    stdio: 'inherit',
    // shell expands the glob on Linux/macOS (same as previous package.json script)
    shell: true
  }
);

const code = result.status == null ? 1 : result.status;

if (createdOwnDataDir && process.env.INFLU_KEEP_TEST_DATA !== '1') {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('[run-tests] cleanup failed:', err.message || err);
  }
}

process.exit(code);
