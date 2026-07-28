/**
 * Migraciones formales de schema (SQLite).
 * Cada migración es idempotente vía tabla schema_migrations.
 * El backend free-path sigue siendo SQLite local — ver db-repository.js.
 */
const fs = require('fs');

const MIGRATIONS = [
  {
    id: 1,
    name: 'baseline_core_tables',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS personas (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          gender TEXT,
          age TEXT,
          ethnicity TEXT,
          style TEXT,
          hair TEXT,
          lighting TEXT,
          camera TEXT,
          clothing TEXT,
          setting TEXT,
          image TEXT,
          imageUGC TEXT,
          handle TEXT,
          detailedJSON TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          benefit TEXT,
          audience TEXT,
          frustration TEXT,
          image TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS campaigns (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          product_id TEXT,
          status TEXT DEFAULT 'draft',
          budget REAL DEFAULT 0,
          client_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS campaign_personas (
          campaign_id TEXT,
          persona_id TEXT,
          PRIMARY KEY(campaign_id, persona_id),
          FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
          FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scripts (
          id TEXT PRIMARY KEY,
          campaign_id TEXT,
          angle TEXT,
          hook TEXT,
          hookCue TEXT,
          demo TEXT,
          demoCue TEXT,
          turn TEXT,
          turnCue TEXT,
          cta TEXT,
          ctaCue TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompt_gallery (
          id TEXT PRIMARY KEY,
          prompt TEXT NOT NULL,
          image_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS generation_history (
          id TEXT PRIMARY KEY,
          persona_id TEXT NOT NULL,
          prompt TEXT,
          image_path TEXT NOT NULL,
          generation_type TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          brand_niche TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS versions (
          id TEXT PRIMARY KEY,
          persona_id TEXT,
          field_changed TEXT,
          old_value TEXT,
          new_value TEXT,
          full_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS persona_variants (
          id TEXT PRIMARY KEY,
          persona_id TEXT NOT NULL,
          pose TEXT,
          clothing TEXT,
          attitude TEXT,
          setting TEXT,
          image_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
        );
      `);
    }
  },
  {
    id: 2,
    name: 'personas_archived',
    up(db) {
      addColumnIfMissing(db, 'personas', 'archived', 'INTEGER DEFAULT 0');
    }
  },
  {
    id: 3,
    name: 'studio_profiles_and_persona_tenancy',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          pin_salt TEXT NOT NULL,
          role TEXT DEFAULT 'owner',
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login_at DATETIME
        );
      `);
      addColumnIfMissing(db, 'personas', 'profile_id', 'TEXT');
    }
  },
  {
    id: 4,
    name: 'products_campaigns_profile_tenancy',
    up(db) {
      addColumnIfMissing(db, 'products', 'profile_id', 'TEXT');
      addColumnIfMissing(db, 'campaigns', 'profile_id', 'TEXT');
      addColumnIfMissing(db, 'prompt_gallery', 'profile_id', 'TEXT');
    }
  },
  {
    id: 5,
    name: 'backup_meta_table',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          last_backup_at DATETIME,
          last_backup_path TEXT,
          schema_note TEXT
        );
        INSERT OR IGNORE INTO backup_meta (id, schema_note) VALUES (1, 'SQLite free-path');
      `);
    }
  },
  {
    id: 6,
    name: 'studio_invites',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_invites (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          note TEXT,
          email_hint TEXT,
          invited_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          used_at DATETIME,
          used_by_profile_id TEXT,
          revoked_at DATETIME,
          max_uses INTEGER DEFAULT 1,
          use_count INTEGER DEFAULT 0,
          FOREIGN KEY(invited_by) REFERENCES studio_profiles(id),
          FOREIGN KEY(used_by_profile_id) REFERENCES studio_profiles(id)
        );
        CREATE INDEX IF NOT EXISTS idx_studio_invites_code ON studio_invites(code);
      `);
    }
  }
];

function tableExists(db, name) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  return !!row;
}

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function addColumnIfMissing(db, table, column, ddlType) {
  if (!tableExists(db, table)) return;
  if (columnExists(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
  console.log(`[migrations] Added ${table}.${column}`);
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Aplica migraciones pendientes en orden.
 * @returns {{ applied: string[], currentVersion: number }}
 */
function runMigrations(db) {
  ensureMigrationsTable(db);
  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id)
  );

  // Bootstrap: si ya existían tablas legacy sin schema_migrations, marcar 1–3 como aplicadas
  // cuando personas ya tiene profile_id / archived (evita re-log ruido).
  if (applied.size === 0 && tableExists(db, 'personas')) {
    const bootstrap = [];
    bootstrap.push(1);
    if (columnExists(db, 'personas', 'archived')) bootstrap.push(2);
    if (tableExists(db, 'studio_profiles') || columnExists(db, 'personas', 'profile_id')) {
      if (!bootstrap.includes(2)) bootstrap.push(2);
      bootstrap.push(3);
    }
    const insert = db.prepare(
      'INSERT OR IGNORE INTO schema_migrations (id, name) VALUES (?, ?)'
    );
    for (const id of bootstrap) {
      const m = MIGRATIONS.find((x) => x.id === id);
      if (m) {
        insert.run(m.id, m.name + '_bootstrap');
        applied.add(m.id);
      }
    }
    if (bootstrap.length) {
      console.log(`[migrations] Bootstrapped legacy schema as versions: ${bootstrap.join(', ')}`);
    }
  }

  const newly = [];
  const run = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
      newly.push(`${m.id}:${m.name}`);
      console.log(`[migrations] Applied ${m.id} — ${m.name}`);
    }
  });
  run();

  const current = db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get().v || 0;
  return { applied: newly, currentVersion: current };
}

function getSchemaVersion(db) {
  if (!tableExists(db, 'schema_migrations')) return 0;
  return db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get().v || 0;
}

module.exports = {
  MIGRATIONS,
  runMigrations,
  getSchemaVersion,
  tableExists,
  columnExists,
  addColumnIfMissing
};
