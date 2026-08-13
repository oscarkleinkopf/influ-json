/**
 * Doctor del Studio (Corte C / F2) — diagnóstico local sin secretos.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  PROJECT_ROOT,
  DATA_DIR,
  DB_PATH,
  ensureDataLayout
} = require('./paths');
const firstRun = require('./first-run');
const { sqliteQuickCheck, readPendingRestore } = require('./pending-restore');

function check(id, ok, detail, level = null) {
  return {
    id,
    ok: !!ok,
    level: level || (ok ? 'ok' : 'error'),
    detail: String(detail || '')
  };
}

function diskFreeBytes(dir) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(dir);
      return Number(s.bavail) * Number(s.bsize);
    }
  } catch (_) {}
  return null;
}

function listLatestBackup(dataDir) {
  const backupsDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) return null;
  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const abs = path.join(backupsDir, f);
      try {
        const st = fs.statSync(abs);
        return { filename: f, mtime: st.mtime.toISOString(), size: st.size };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return files[0] || null;
}

/**
 * @param {{ includeAudit?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
function runDoctor(opts = {}) {
  const env = opts.env || process.env;
  ensureDataLayout();

  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push(
    check(
      'node',
      nodeMajor >= 18,
      `Node ${process.versions.node}${nodeMajor < 18 ? ' (se recomienda ≥18)' : ''}`
    )
  );

  let dataWritable = false;
  try {
    const probe = path.join(DATA_DIR, `.doctor-write-${process.pid}`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    dataWritable = true;
  } catch (err) {
    checks.push(check('data_dir_writable', false, err.message));
  }
  if (dataWritable) {
    checks.push(check('data_dir_writable', true, DATA_DIR));
  }

  const free = diskFreeBytes(DATA_DIR);
  if (free == null) {
    checks.push(check('disk_space', true, 'No disponible en este SO', 'info'));
  } else {
    const mb = Math.round(free / (1024 * 1024));
    checks.push(
      check('disk_space', mb >= 100, `${mb} MB libres`, mb >= 100 ? 'ok' : 'warn')
    );
  }

  if (fs.existsSync(DB_PATH)) {
    const qc = sqliteQuickCheck(DB_PATH);
    checks.push(check('sqlite_quick_check', qc.ok, qc.detail));
  } else {
    checks.push(check('sqlite_quick_check', true, 'DB aún no creada (se creará al arrancar)', 'info'));
  }

  const envPath = firstRun.getEnvPath();
  const envExists = fs.existsSync(envPath);
  let envMode = null;
  if (envExists) {
    try {
      envMode = fs.statSync(envPath).mode & 0o777;
    } catch (_) {}
  }
  checks.push(
    check(
      'env_file',
      true,
      envExists
        ? `presente${envMode != null ? ` mode=${(envMode).toString(8)}` : ''}`
        : 'ausente (opcional; STUDIO_PIN puede vivir solo en el entorno)',
      envExists ? 'ok' : 'info'
    )
  );

  const listenHost = firstRun.resolveListenHost();
  const publicBind = firstRun.isPublicBind(listenHost);
  const authEnabled = !!(env.STUDIO_PIN || '').trim();
  const pinDefault = String(env.STUDIO_PIN || '1234').trim() === '1234';
  const unsafe = firstRun.shouldBlockPublicInsecureAuth({
    isPinDefault: pinDefault,
    isAuthEnabled: authEnabled
  });
  checks.push(
    check(
      'bind_auth',
      !unsafe,
      `HOST=${listenHost} auth=${authEnabled ? 'on' : 'off'} pinDefault=${pinDefault}`,
      unsafe ? 'error' : publicBind ? 'warn' : 'ok'
    )
  );

  const pollen = !!(env.POLLINATIONS_TOKEN || env.POLLINATIONS_API_TOKEN || '').trim();
  checks.push(
    check(
      'pollinations',
      true,
      pollen ? 'token configurado (valor oculto)' : 'sin token — Copiar JSON sigue gratis; bocetos pueden pedir pollen',
      pollen ? 'ok' : 'info'
    )
  );

  const comfy = !!(env.COMFYUI_URL || '').trim();
  const a1111 = !!(env.A1111_URL || env.FORGE_URL || '').trim();
  checks.push(
    check(
      'local_gpu',
      true,
      comfy || a1111 ? `opt-in configurado (comfy=${comfy}, a1111=${a1111})` : 'no configurado (OK — path free)',
      'info'
    )
  );

  const latest = listLatestBackup(DATA_DIR);
  checks.push(
    check(
      'last_backup',
      true,
      latest ? `${latest.filename} (${latest.mtime})` : 'ningún snapshot en data/backups/',
      latest ? 'ok' : 'warn'
    )
  );

  const pending = readPendingRestore(DATA_DIR);
  checks.push(
    check(
      'pending_restore',
      true,
      pending
        ? `restore pendiente de ${pending.sourceFilename || 'candidato'} — reinicia para aplicar`
        : 'ninguno',
      pending ? 'warn' : 'ok'
    )
  );

  if (opts.includeAudit) {
    try {
      const out = execFileSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 120000
      });
      const parsed = JSON.parse(out || '{}');
      const vulns = parsed.metadata?.vulnerabilities || {};
      const high = Number(vulns.high || 0) + Number(vulns.critical || 0);
      checks.push(
        check('npm_audit', high === 0, high === 0 ? '0 high/critical' : `${high} high/critical`)
      );
    } catch (err) {
      // npm audit exits non-zero when vulns found
      let high = null;
      try {
        const parsed = JSON.parse(err.stdout || '{}');
        const vulns = parsed.metadata?.vulnerabilities || {};
        high = Number(vulns.high || 0) + Number(vulns.critical || 0);
      } catch (_) {}
      if (high != null) {
        checks.push(check('npm_audit', high === 0, `${high} high/critical`));
      } else {
        checks.push(check('npm_audit', false, err.message || 'npm audit falló', 'warn'));
      }
    }
  }

  const errors = checks.filter((c) => !c.ok && c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;

  return {
    ok: errors === 0,
    generatedAt: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()}`,
    node: process.versions.node,
    projectRoot: PROJECT_ROOT,
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    summary: { errors, warns, total: checks.length },
    checks
  };
}

module.exports = {
  runDoctor,
  listLatestBackup,
  diskFreeBytes
};
