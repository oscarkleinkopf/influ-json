/**
 * Contrato de persistencia del Studio (free-path = SQLite).
 *
 * Hoy: adapta `db.js` (better-sqlite3).
 * Futuro (opt-in): un adapter Postgres podría implementar la misma superficie
 * sin romper el happy path local. Nunca hacer Postgres el default.
 *
 * Uso:
 *   const store = require('./db-repository');
 *   store.backend // 'sqlite'
 *   store.personas.list(profileId)
 */
const db = require('./db');
const paths = require('./paths');

const repository = {
  backend: 'sqlite',
  paths: {
    dataDir: () => db.getDataDir(),
    dbPath: () => db.getDbPath(),
    mirrorPath: () => paths.WORKSPACE_DB_MIRROR,
    backupsDir: () => paths.ensureDir(require('path').join(db.getDataDir(), 'backups'))
  },

  schema: {
    version: () => db.getSchemaVersion(),
    migrationsApplied: () => db.listMigrations()
  },

  profiles: {
    list: () => db.listStudioProfilesPublic(),
    get: (id) => db.getStudioProfileById(id),
    ensureDefault: () => db.ensureDefaultStudioProfile(),
    create: (input) => db.createStudioProfile(input),
    update: (id, input) => db.updateStudioProfile(id, input),
    remove: (id) => db.deleteStudioProfile(id),
    findByPin: (pin) => db.findStudioProfileByPin(pin)
  },

  personas: {
    list: (profileId) => db.getAllPersonas(profileId || null),
    get: (id) => db.getPersonaById(id),
    save: (p) => db.savePersona(p),
    remove: (id) => db.deletePersona(id),
    assertOwned: (personaId, profileId) => db.assertPersonaOwnedBy(personaId, profileId)
  },

  products: {
    list: (profileId) => db.getAllProducts(profileId || null),
    get: (id) => db.getProductById(id),
    save: (p) => db.saveProduct(p)
  },

  campaigns: {
    list: (profileId) => db.getAllCampaigns(profileId || null),
    get: (id) => db.getCampaignById(id),
    save: (c, personaIds) => db.saveCampaign(c, personaIds),
    remove: (id) => db.deleteCampaign(id)
  },

  invites: {
    list: () => db.listStudioInvites(),
    create: (input) => db.createStudioInvite(input),
    revoke: (id, actorId) => db.revokeStudioInvite(id, actorId),
    redeem: (input) => db.redeemStudioInvite(input)
  },

  backup: {
    createSnapshot: (label) => db.createBackupSnapshot(label),
    listSnapshots: () => db.listBackupSnapshots(),
    restoreFromFile: (absPath) => db.restoreBackupFromFile(absPath),
    getMeta: () => db.getBackupMeta()
  },

  /** Acceso escape-hatch al servicio SQLite completo (evitar en código nuevo). */
  _sqlite: db
};

module.exports = repository;
