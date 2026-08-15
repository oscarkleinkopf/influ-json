/**
 * Store de sesiones SQLite para express-session (Corte F / LAN).
 * MemoryStore basta en localhost; en HOST=0.0.0.0 las sesiones sobreviven reinicios del NAS.
 */
'use strict';

const session = require('express-session');
const firstRun = require('./first-run');

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'sqlite'|'memory'}
 */
function resolveSessionStoreMode(env = process.env) {
  const raw = String(env.SESSION_STORE || '').trim().toLowerCase();
  if (raw === 'memory' || raw === 'mem') return 'memory';
  if (raw === 'sqlite' || raw === 'db') return 'sqlite';
  // Default: SQLite en bind público; memoria en loopback
  return firstRun.isPublicBind(firstRun.resolveListenHost()) ? 'sqlite' : 'memory';
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ ttlMs?: number, pruneEvery?: number }} [opts]
 */
function createSqliteSessionStore(sqlite, opts = {}) {
  if (!sqlite || typeof sqlite.prepare !== 'function') {
    throw new Error('createSqliteSessionStore requiere un handle better-sqlite3');
  }

  const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : 24 * 60 * 60 * 1000;
  const pruneEvery = Number(opts.pruneEvery) > 0 ? Number(opts.pruneEvery) : 50;
  let ops = 0;

  // Tabla también creada por migrations id 12; IF NOT EXISTS por si el store arranca antes.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
  `);

  const getStmt = sqlite.prepare('SELECT sess, expired FROM sessions WHERE sid = ?');
  const setStmt = sqlite.prepare(
    'INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired'
  );
  const delStmt = sqlite.prepare('DELETE FROM sessions WHERE sid = ?');
  const pruneStmt = sqlite.prepare('DELETE FROM sessions WHERE expired < ?');

  function maybePrune() {
    ops += 1;
    if (ops % pruneEvery !== 0) return;
    try {
      pruneStmt.run(Date.now());
    } catch (_) { /* best-effort */ }
  }

  class SqliteSessionStore extends session.Store {
    get(sid, cb) {
      try {
        maybePrune();
        const row = getStmt.get(String(sid));
        if (!row) return cb(null, null);
        if (Number(row.expired) < Date.now()) {
          try { delStmt.run(String(sid)); } catch (_) {}
          return cb(null, null);
        }
        const sess = JSON.parse(row.sess);
        return cb(null, sess);
      } catch (err) {
        return cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        maybePrune();
        const maxAge = sess?.cookie?.maxAge;
        const expired =
          Number.isFinite(maxAge) && maxAge > 0 ? Date.now() + maxAge : Date.now() + ttlMs;
        setStmt.run(String(sid), JSON.stringify(sess), expired);
        return cb(null);
      } catch (err) {
        return cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        delStmt.run(String(sid));
        return cb(null);
      } catch (err) {
        return cb(err);
      }
    }

    touch(sid, sess, cb) {
      // Reusa set para renovar expired según cookie.maxAge
      this.set(sid, sess, cb);
    }
  }

  return new SqliteSessionStore();
}

module.exports = {
  resolveSessionStoreMode,
  createSqliteSessionStore
};
