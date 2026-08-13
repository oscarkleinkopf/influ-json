/**
 * Restore en dos fases (Corte C / F3):
 * 1) Validar backup → restore-candidate.sqlite + pending-restore.json (DB activa intacta)
 * 2) Al arrancar, antes de abrir SQLite: quick_check + swap atómico
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CANDIDATE_NAME = 'restore-candidate.sqlite';
const PENDING_NAME = 'pending-restore.json';

function candidatePath(dataDir) {
  return path.join(dataDir, CANDIDATE_NAME);
}

function pendingPath(dataDir) {
  return path.join(dataDir, PENDING_NAME);
}

/**
 * PRAGMA quick_check sobre un archivo SQLite (read-only).
 * @returns {{ ok: boolean, detail: string }}
 */
function sqliteQuickCheck(dbFile) {
  if (!dbFile || !fs.existsSync(dbFile)) {
    return { ok: false, detail: 'Archivo SQLite no encontrado.' };
  }
  let handle;
  try {
    handle = new Database(dbFile, { readonly: true, fileMustExist: true });
    const row = handle.pragma('quick_check', { simple: true });
    const detail = Array.isArray(row) ? row.join('; ') : String(row);
    const ok = detail === 'ok' || (Array.isArray(row) && row.length === 1 && row[0] === 'ok');
    return { ok, detail: ok ? 'ok' : detail };
  } catch (err) {
    return { ok: false, detail: err.message || String(err) };
  } finally {
    try { handle?.close(); } catch (_) {}
  }
}

/**
 * Programa restore: no toca la DB activa.
 * @param {{ dataDir: string, sourceAbs: string, safetyBackupAbs?: string|null, sourceFilename?: string }} opts
 */
function schedulePendingRestore(opts) {
  const dataDir = opts.dataDir;
  const sourceAbs = path.resolve(opts.sourceAbs);
  if (!fs.existsSync(sourceAbs)) {
    throw new Error('Archivo de backup no encontrado.');
  }

  const checkSrc = sqliteQuickCheck(sourceAbs);
  if (!checkSrc.ok) {
    throw new Error(`Backup inválido (quick_check): ${checkSrc.detail}`);
  }

  const dest = candidatePath(dataDir);
  fs.copyFileSync(sourceAbs, dest);
  const checkCand = sqliteQuickCheck(dest);
  if (!checkCand.ok) {
    try { fs.unlinkSync(dest); } catch (_) {}
    throw new Error(`Candidato de restore inválido (quick_check): ${checkCand.detail}`);
  }

  const meta = {
    version: 1,
    scheduledAt: new Date().toISOString(),
    source: sourceAbs,
    sourceFilename: opts.sourceFilename || path.basename(sourceAbs),
    candidate: dest,
    safetyBackup: opts.safetyBackupAbs || null,
    quickCheck: checkCand.detail
  };
  const pending = pendingPath(dataDir);
  const tmp = `${pending}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmp, pending);

  return {
    ok: true,
    pending: true,
    restartRequired: true,
    candidate: dest,
    pendingMeta: meta,
    message:
      'Restore programado. Reinicia el servidor (npm start / start-studio) para aplicar el swap. La DB activa no se tocó aún.'
  };
}

function readPendingRestore(dataDir) {
  const p = pendingPath(dataDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Aplicar pending restore ANTES de abrir better-sqlite3 en el proceso.
 * Si falla quick_check, deja la DB activa intacta y limpia el marcador.
 * @returns {{ applied: boolean, reason?: string, meta?: object }|null}
 */
function applyPendingRestoreIfAny(dataDir, activeDbPath) {
  const pendingFile = pendingPath(dataDir);
  if (!fs.existsSync(pendingFile)) return null;

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  } catch (err) {
    console.error('[pending-restore] Marcador corrupto — se ignora:', err.message);
    try { fs.unlinkSync(pendingFile); } catch (_) {}
    return { applied: false, reason: 'corrupt_pending' };
  }

  const candidate = meta.candidate || candidatePath(dataDir);
  const check = sqliteQuickCheck(candidate);
  if (!check.ok) {
    console.error(`[pending-restore] Candidato inválido (${check.detail}) — DB activa intacta.`);
    try { fs.unlinkSync(pendingFile); } catch (_) {}
    try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch (_) {}
    return { applied: false, reason: 'quick_check_failed', detail: check.detail, meta };
  }

  try {
    // Swap: candidate → active (copy + replace). Conservar pre_restore vía safetyBackup en meta.
    const tmpActive = `${activeDbPath}.swap-tmp`;
    fs.copyFileSync(candidate, tmpActive);
    fs.renameSync(tmpActive, activeDbPath);
    try { fs.unlinkSync(pendingFile); } catch (_) {}
    try { fs.unlinkSync(candidate); } catch (_) {}
    console.log(`[pending-restore] Aplicado desde ${meta.sourceFilename || candidate}`);
    return { applied: true, meta };
  } catch (err) {
    console.error('[pending-restore] Falló el swap — DB puede estar parcial:', err.message);
    try { fs.unlinkSync(pendingFile); } catch (_) {}
    return { applied: false, reason: 'swap_failed', detail: err.message, meta };
  }
}

module.exports = {
  CANDIDATE_NAME,
  PENDING_NAME,
  candidatePath,
  pendingPath,
  sqliteQuickCheck,
  schedulePendingRestore,
  readPendingRestore,
  applyPendingRestoreIfAny
};
