/**
 * UX-5 — npm test must not open the workspace roster DB.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workspaceDataDir = path.join(root, 'data');
const workspaceDb = path.join(workspaceDataDir, 'influ.sqlite');

test('UX-5: paths honra INFLU_SKIP_DB_MIGRATE (sin copiar root mirror)', () => {
  const pathsSrc = fs.readFileSync(path.join(root, 'paths.js'), 'utf8');
  assert.match(pathsSrc, /INFLU_SKIP_DB_MIGRATE/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /scripts\/run-tests\.js/);
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'run-tests.js')));
});

test('UX-5: con DATA_DIR temporal, getDbPath no apunta a data/ del workspace', () => {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;
  assert.ok(dataDir, 'run-tests.js debe exportar DATA_DIR al proceso de test');
  assert.notEqual(
    path.resolve(dataDir),
    path.resolve(workspaceDataDir),
    'DATA_DIR de tests no debe ser ./data del repo'
  );

  const db = require('../db');
  const dbPath = path.resolve(db.getDbPath());
  assert.ok(
    dbPath.startsWith(path.resolve(dataDir) + path.sep) || dbPath === path.join(path.resolve(dataDir), 'influ.sqlite'),
    `db abierta en ${dbPath}, esperado bajo ${dataDir}`
  );
  assert.notEqual(dbPath, path.resolve(workspaceDb));
});

test('UX-5: run-tests.js fuerza aislamiento (script source)', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'run-tests.js'), 'utf8');
  assert.match(src, /mkdtempSync/);
  assert.match(src, /INFLU_SKIP_DB_MIGRATE/);
  assert.match(src, /STUDIO_PIN/);
  assert.match(src, /ENABLE_LEGACY_MIRRORS/);
});

test('UX-5: PLAN-NEXT DoD pide captura de pestaña afectada', () => {
  const plan = fs.readFileSync(path.join(root, 'PLAN-NEXT.md'), 'utf8');
  assert.match(plan, /captura de la pestaña afectada/i);
});
