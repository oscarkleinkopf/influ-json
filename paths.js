/**
 * Portable project paths (ROADMAP 1.6).
 * - DATA_DIR env overrides default ./data
 * - No hard dependency on Antigravity brain paths for runtime
 */
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname);

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PROJECT_ROOT, 'data');

/** Optional one-time migration source (never required at runtime). */
const LEGACY_BRAIN_SCRATCH =
  process.env.LEGACY_SCRATCH_DIR ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.gemini',
    'antigravity',
    'brain',
    '7d7c6673-5ef4-440b-aa1e-adaeba8ce81d',
    'scratch'
  );

const DB_FILENAME = 'influ.sqlite';
const DB_PATH = path.join(DATA_DIR, DB_FILENAME);
/** Mirror next to package root so existing git auto-backup keeps working. */
const WORKSPACE_DB_MIRROR = path.join(PROJECT_ROOT, DB_FILENAME);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function ensureDataLayout() {
  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, 'references'));
  ensureDir(path.join(DATA_DIR, 'generated'));
  ensureDir(path.join(DATA_DIR, 'backups'));
  return DATA_DIR;
}

/**
 * Pick best existing DB among candidates (prefer larger size, then newer mtime).
 */
function pickBestDbFile(candidates) {
  let best = null;
  for (const p of candidates) {
    if (!p || !fs.existsSync(p)) continue;
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.size < 100) continue;
      if (
        !best ||
        st.size > best.size ||
        (st.size === best.size && st.mtimeMs > best.mtimeMs)
      ) {
        best = { path: p, size: st.size, mtimeMs: st.mtimeMs };
      }
    } catch (_) {
      /* skip unreadable */
    }
  }
  return best;
}

/**
 * Ensure data/influ.sqlite exists, migrating once from legacy locations if needed.
 */
function resolveDatabasePath() {
  ensureDataLayout();

  if (fs.existsSync(DB_PATH)) {
    return DB_PATH;
  }

  const candidates = [
    WORKSPACE_DB_MIRROR,
    path.join(PROJECT_ROOT, 'scratch', DB_FILENAME),
    path.join(LEGACY_BRAIN_SCRATCH, DB_FILENAME)
  ];

  const best = pickBestDbFile(candidates);
  if (best) {
    fs.copyFileSync(best.path, DB_PATH);
    console.log(`[paths] Migrated database:\n  from: ${best.path}\n  to:   ${DB_PATH}`);
  } else {
    console.log(`[paths] No legacy DB found; creating new database at ${DB_PATH}`);
  }

  return DB_PATH;
}

module.exports = {
  PROJECT_ROOT,
  DATA_DIR,
  DB_PATH,
  WORKSPACE_DB_MIRROR,
  LEGACY_BRAIN_SCRATCH,
  ensureDir,
  ensureDataLayout,
  resolveDatabasePath
};
