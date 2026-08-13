/**
 * Support bundle redactado (Corte C / F2) — sin .env, tokens, imágenes ni prompts.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PROJECT_ROOT, DATA_DIR, DB_PATH, ensureDataLayout } = require('./paths');
const { runDoctor } = require('./studio-doctor');
const { readPendingRestore } = require('./pending-restore');

function boolEnv(name, env = process.env) {
  const v = String(env[name] || '').trim();
  return !!(v && v !== '0' && v.toLowerCase() !== 'false');
}

function collectRedactedConfig(env = process.env) {
  return {
    HOST: env.HOST || '(default 127.0.0.1)',
    PORT: env.PORT || '3000',
    DATA_DIR: env.DATA_DIR ? '(custom)' : '(default ./data)',
    STUDIO_PIN_set: !!(env.STUDIO_PIN || '').trim(),
    STUDIO_PIN_is_default: String(env.STUDIO_PIN || '1234').trim() === '1234',
    POLLINATIONS_TOKEN_set: !!(env.POLLINATIONS_TOKEN || env.POLLINATIONS_API_TOKEN || '').trim(),
    GEMINI_API_KEY_set: !!(env.GEMINI_API_KEY || '').trim(),
    REPLICATE_API_TOKEN_set: !!(env.REPLICATE_API_TOKEN || env.REPLICATE_API_KEY || '').trim(),
    ENABLE_PAID_FACE_LOCK: boolEnv('ENABLE_PAID_FACE_LOCK', env),
    ENABLE_PAID_LORA: boolEnv('ENABLE_PAID_LORA', env),
    PREFER_LOCAL_GPU: boolEnv('PREFER_LOCAL_GPU', env),
    COMFYUI_URL_set: !!(env.COMFYUI_URL || '').trim(),
    A1111_URL_set: !!(env.A1111_URL || env.FORGE_URL || '').trim(),
    ENABLE_GIT_BACKUP: boolEnv('ENABLE_GIT_BACKUP', env),
    CSRF_PROTECTION: env.CSRF_PROTECTION === '0' ? 'off' : 'on',
    API_RATE_LIMIT: env.API_RATE_LIMIT === '0' ? 'off' : 'on',
    TRUST_PROXY: boolEnv('TRUST_PROXY', env),
    COOKIE_SECURE: boolEnv('COOKIE_SECURE', env)
  };
}

/**
 * @param {{ outPath?: string, includeAudit?: boolean }} [opts]
 * @returns {Promise<{ zipPath: string, doctor: object }>}
 */
async function writeSupportBundle(opts = {}) {
  ensureDataLayout();
  const archiverMod = require('archiver');
  function createZipArchive(options = { zlib: { level: 9 } }) {
    if (typeof archiverMod === 'function') return archiverMod('zip', options);
    if (archiverMod.ZipArchive) return new archiverMod.ZipArchive(options);
    if (archiverMod.Archiver) {
      const a = new archiverMod.Archiver(options);
      if (typeof a.format === 'function') a.format('zip', options);
      return a;
    }
    throw new Error('No se pudo inicializar archiver (ZIP)');
  }
  const doctor = runDoctor({ includeAudit: !!opts.includeAudit });
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

  let schemaVersion = null;
  let pendingInfo = { pending: false };
  try {
    const pending = readPendingRestore(DATA_DIR);
    if (pending) {
      pendingInfo = { pending: true, sourceFilename: pending.sourceFilename || null };
    }
  } catch (_) {}

  try {
    const { getSchemaVersion } = require('./migrations');
    if (fs.existsSync(DB_PATH)) {
      const Database = require('better-sqlite3');
      const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      try {
        schemaVersion = getSchemaVersion(db);
      } finally {
        db.close();
      }
    }
  } catch (_) {}

  const manifest = {
    generatedAt: new Date().toISOString(),
    app: { name: pkg.name, version: pkg.version },
    platform: `${os.platform()} ${os.arch()} ${os.release()}`,
    node: process.versions.node,
    schemaVersion,
    pendingRestore: pendingInfo,
    configFlags: collectRedactedConfig(),
    note: 'Redactado: sin .env, tokens, prompts, imágenes ni personas.json completo.'
  };

  const outPath =
    opts.outPath ||
    path.join(
      DATA_DIR,
      'backups',
      `support-bundle_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
    );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = createZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify(doctor, null, 2), { name: 'doctor.json' });
    archive.append(
      [
        '# influ-JSON support bundle',
        '',
        `Generado: ${manifest.generatedAt}`,
        `App: ${pkg.name}@${pkg.version}`,
        `Node: ${manifest.node}`,
        `Doctor ok: ${doctor.ok}`,
        `Errores: ${doctor.summary.errors} · avisos: ${doctor.summary.warns}`,
        '',
        'Este ZIP no contiene secretos ni imágenes.',
        ''
      ].join('\n'),
      { name: 'README.txt' }
    );
    archive.finalize();
  });

  return { zipPath: outPath, doctor, manifest };
}

module.exports = {
  collectRedactedConfig,
  writeSupportBundle
};
