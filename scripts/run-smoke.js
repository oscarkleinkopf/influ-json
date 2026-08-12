#!/usr/bin/env node
/**
 * UX-5 — smoke against isolated DATA_DIR (same idea as run-tests.js).
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
  : fs.mkdtempSync(path.join(os.tmpdir(), 'influ-smoke-'));

fs.mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  DATA_DIR: dataDir,
  STUDIO_PIN: process.env.STUDIO_PIN || '1234',
  SESSION_SECRET: process.env.SESSION_SECRET || 'test-session-secret-influ-json',
  INFLU_SKIP_ENV_PERSIST: '1',
  DISABLE_GIT_BACKUP: '1',
  ENABLE_GIT_BACKUP: '',
  INFLU_SKIP_DB_MIGRATE: process.env.INFLU_SKIP_DB_MIGRATE || '1',
  INFLU_TEST_UPLOADS: process.env.INFLU_TEST_UPLOADS || '1',
  ENABLE_LEGACY_MIRRORS: '0',
  HOST: process.env.HOST || '127.0.0.1'
};

console.log(`[run-smoke] DATA_DIR=${dataDir}`);

const result = spawnSync(
  process.execPath,
  [path.join('test', 'smoke.js')],
  { cwd: root, env, stdio: 'inherit' }
);

const code = result.status == null ? 1 : result.status;

if (createdOwnDataDir && process.env.INFLU_KEEP_TEST_DATA !== '1') {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('[run-smoke] cleanup failed:', err.message || err);
  }
}

process.exit(code);
