const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const archiverMod = require('archiver');
/** Archiver v8 (ESM interop) usa ZipArchive; v7 era archiver('zip'). */
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
const dotenv = require('dotenv');
const sharp = require('sharp');

// Load environment variables
dotenv.config();

// Persist SESSION_SECRET before auth session middleware is constructed
const firstRun = require('./first-run');
firstRun.ensureSessionSecret();

const dbService = require('./db');
const authService = require('./auth');
const sessionStore = require('./session-store');

// Corte F: SQLite sessions en bind público (NAS/LAN); MemoryStore en localhost.
(function wireSessionStore() {
  const mode = sessionStore.resolveSessionStoreMode();
  if (mode === 'sqlite') {
    try {
      const store = sessionStore.createSqliteSessionStore(dbService.db, {
        ttlMs: 24 * 60 * 60 * 1000
      });
      authService.initSessionMiddleware({ store, storeKind: 'sqlite' });
      console.log('[session] store=sqlite (sesiones sobreviven reinicios)');
    } catch (err) {
      console.error('[session] No se pudo abrir store SQLite; usando memoria:', err.message);
      authService.initSessionMiddleware({ storeKind: 'memory' });
    }
  } else {
    authService.initSessionMiddleware({ storeKind: 'memory' });
  }
})();

const aiService = require('./ai-service');
const genQueue = require('./gen-queue');
const {
  resolveSafeAssetPath,
  assertSafeRemoteImageUrl,
  assertSafeRemoteImageUrlResolved,
  UNSAFE_PATH,
  UNSAFE_URL
} = require('./safe-paths');
const gitBackup = require('./git-backup');
/** Same entry point routes use — never stages binary root influ.sqlite. */
function runGitBackup(callback, opts) {
  return gitBackup.runGitBackup(callback, opts);
}
const imageValidation = require('./image-validation');
const consistencyScore = require('./consistency-score');
const { registerPersonasRoutes, scoreVariantAgainstPersona: scoreVariantAgainstPersonaFn } = require('./routes/personas');
const { registerGenerationRoutes } = require('./routes/generation');
const { registerImportRoutes } = require('./routes/import');
const { registerInviteRedeemRoute, registerAdminRoutes } = require('./routes/admin');
const { registerLocalGpuRoutes } = require('./routes/local-gpu');

// Initialize DB and migrate legacy JSON data if empty
dbService.runMigrations();

const app = express();
const PORT = process.env.PORT || 3000;
const LISTEN_HOST = firstRun.resolveListenHost();

// Solo confiar en X-Forwarded-* cuando el despliegue está detrás de un proxy conocido.
if (authService.isTrustProxyEnabled()) {
  app.set('trust proxy', 1);
}

app.use(authService.securityHeaders);
app.use(authService.hostAllowlistProtection);
app.use(express.json({ limit: firstRun.getJsonBodyLimit() }));
app.use(express.urlencoded({ limit: firstRun.getJsonBodyLimit(), extended: true }));
app.use(authService.sessionMiddleware);
app.use(authService.originAllowlistProtection);

/**
 * If Studio is bound publicly (0.0.0.0) with insecure auth (default PIN or auth off),
 * block API use until the admin sets a real PIN.
 * Static assets + status + auth + setup remain reachable so the wizard works.
 */
app.use((req, res, next) => {
  const gateOpts = {
    isPinDefault: () => authService.isPinDefault(),
    isAuthEnabled: () => authService.isAuthEnabled()
  };
  if (!firstRun.shouldBlockPublicInsecureAuth(gateOpts)) {
    return next();
  }
  const reason = firstRun.getPublicBindBlockReason(gateOpts);
  const p = req.path || '';
  const allowed =
    p === '/api/status' ||
    p === '/api/auth/login' ||
    p === '/api/auth/logout' ||
    p === '/api/auth/profiles' ||
    p === '/api/auth/me' ||
    p === '/api/setup/change-pin' ||
    p.startsWith('/api/invites/redeem') ||
    !p.startsWith('/api/');
  if (allowed) return next();
  return res.status(503).json({
    success: false,
    code: 'SETUP_REQUIRED',
    reason: reason || 'DEFAULT_PIN',
    message: firstRun.publicBindBlockMessage(reason)
  });
});

/** Resuelve perfil activo en sesión (o Bearer PIN → perfil). */
function resolveSessionProfile(req) {
  if (req.session?.profileId) return req.session.profileId;
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    const byPin = dbService.findStudioProfileByPin(bearer);
    if (byPin) {
      req.session.authenticated = true;
      req.session.profileId = byPin.id;
      req.session.profileName = byPin.name;
      req.session.profileRole = byPin.role;
      return byPin.id;
    }
    if (authService.verifyLegacyStudioPin(bearer)) {
      const def = dbService.ensureDefaultStudioProfile();
      const row = dbService.getStudioProfileById(def);
      req.session.authenticated = true;
      req.session.profileId = def;
      req.session.profileName = row?.name || 'Administración';
      req.session.profileRole = row?.role || 'admin';
      req.session.authVia = 'bearer_studio_pin';
      return def;
    }
  }
  if (!authService.isAuthEnabled()) {
    const def = dbService.ensureDefaultStudioProfile();
    req.session.authenticated = true;
    req.session.profileId = def;
    const row = dbService.getStudioProfileById(def);
    req.session.profileName = row?.name || 'Administración';
    req.session.profileRole = row?.role || 'admin';
    return def;
  }
  return null;
}

function requireAuth(req, res, next) {
  if (!authService.isAuthEnabled()) {
    resolveSessionProfile(req);
    if (req.session) authService.ensureCsrfToken(req.session);
    return next();
  }
  if (req.session && req.session.authenticated && req.session.profileId) {
    authService.ensureCsrfToken(req.session);
    return next();
  }
  const profileId = resolveSessionProfile(req);
  if (req.session?.authenticated && profileId) {
    authService.ensureCsrfToken(req.session);
    return next();
  }
  return res.status(401).json({ success: false, message: 'Acceso denegado. PIN inválido o sesión expirada.' });
}

function requireAdmin(req, res, next) {
  const role = req.session?.profileRole;
  if (dbService.isAdminRole(role)) return next();
  // Re-check from DB in case session is stale
  const profile = req.session?.profileId
    ? dbService.getStudioProfileById(req.session.profileId)
    : null;
  if (profile && dbService.isAdminRole(profile.role)) {
    req.session.profileRole = profile.role;
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Solo el perfil Administración puede realizar esta acción.'
  });
}

/** 404 si la persona no existe o no pertenece al perfil de sesión (no filtrar existencia ajena). */
function requireOwnedPersona(req, res, next) {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const persona = dbService.assertPersonaOwnedBy(req.params.id, profileId);
  if (!persona) {
    return res.status(404).json({ success: false, message: 'Influencer no encontrado.' });
  }
  req.persona = persona;
  req.profileId = profileId;
  next();
}

function publicProfileDTO(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: !!row.active,
    created_at: row.created_at,
    last_login_at: row.last_login_at || null
  };
}

// Assets: referencias y generadas requieren sesión (cookie) cuando auth está on.
// Guías, PNGs demo en raíz de /assets y el resto siguen públicos (UI / docs).
// Fallback a DATA_DIR/{references,generated}: imports/gens dual-write ahí y a veces
// solo queda el mirror en data/ (p. ej. limpieza de assets/ref_* de tests) → Resumen 404.
const assetsRoot = path.join(__dirname, 'assets');
const { DATA_DIR: assetsDataDir, ensureDataLayout } = require('./paths');
ensureDataLayout();

function gatedPrivateAssets(req, res, next) {
  if (!authService.isAuthEnabled()) return next();
  return requireAuth(req, res, next);
}

app.use(
  '/assets/references',
  gatedPrivateAssets,
  express.static(path.join(assetsRoot, 'references')),
  express.static(path.join(assetsDataDir, 'references'))
);
app.use(
  '/assets/generated',
  gatedPrivateAssets,
  express.static(path.join(assetsRoot, 'generated')),
  express.static(path.join(assetsDataDir, 'generated'))
);
app.use('/assets', express.static(assetsRoot));

const { composeIndexHtml } = require('./views/compose-index');

// Serve main app pages (HTML composed from views/ partials — UX-4)
app.get('/', (req, res) => {
  res.type('html').send(composeIndexHtml(__dirname));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});
app.get('/character-lock-validator.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'character-lock-validator.js'));
});
app.get('/niche-presets.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'niche-presets.js'));
});
app.get('/qa-matrix.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'qa-matrix.js'));
});
app.get('/chatbot-packs.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'chatbot-packs.js'));
});
app.get('/ugc-shot-composer.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'ugc-shot-composer.js'));
});
app.get('/import-flow.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'import-flow.js'));
});
app.get('/prompt-builder.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'prompt-builder.js'));
});
app.get('/face-pack.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'face-pack.js'));
});
app.get('/studio-toast.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio-toast.js'));
});
app.get('/queue-poller.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'queue-poller.js'));
});
app.get('/persona-form.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'persona-form.js'));
});
app.get('/persona-card.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'persona-card.js'));
});
app.get('/variant-presets.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'variant-presets.js'));
});
app.get('/variant-vault-ui.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'variant-vault-ui.js'));
});
app.get('/photo-analysis.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'photo-analysis.js'));
});
app.get('/photo-upload-ui.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'photo-upload-ui.js'));
});
app.get('/influ-persona.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'influ-persona.js'));
});
app.get('/persona-draft.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'persona-draft.js'));
});
app.get('/studio-dialogs.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio-dialogs.js'));
});
app.get('/studio-activation.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio-activation.js'));
});
app.get('/identity-trial.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'identity-trial.js'));
});
app.get('/lock-lab.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'lock-lab.js'));
});
app.get('/studio-work-mode.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio-work-mode.js'));
});
app.get('/production-recipe.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'production-recipe.js'));
});
app.get('/production-brief.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'production-brief.js'));
});
app.get('/community-templates.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'community-templates.js'));
});
app.get('/index.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.css'));
});

// Multer storage — references go to DATA_DIR in tests (UX detalles / harness)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { getReferencesUploadDir } = require('./paths');
      cb(null, getReferencesUploadDir());
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const unique = `ref_${Date.now()}_${safeName}`;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: firstRun.getUploadFileSizeLimitBytes() }
});

const loraStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { DATA_DIR: dataDir, ensureDir: ensure } = require('./paths');
    const dir = path.join(dataDir, 'loras', '_upload');
    ensure(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = (file.originalname || 'weights.safetensors').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `up_${Date.now()}_${safeName}`);
  }
});
const uploadLora = multer({
  storage: loraStorage,
  limits: { fileSize: firstRun.getLoraUploadFileSizeLimitBytes() },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.safetensors') || name.endsWith('.pt') || name.endsWith('.ckpt')) {
      return cb(null, true);
    }
    cb(new Error('Solo se aceptan pesos .safetensors (o .pt/.ckpt)'));
  }
});

// Portable data directory (ROADMAP 1.6) — was hardcoded Antigravity brain path
const { DATA_DIR, ensureDir } = require('./paths');
const SCRATCH_DIR = DATA_DIR;
ensureDir(SCRATCH_DIR);

// Git backup — OPT-IN (ENABLE_GIT_BACKUP=1). See ./git-backup.js
// (stages personas.json text mirror only; never root influ.sqlite binary).

// =============================================
// PUBLIC ENDPOINTS
// =============================================

// Auth Login (perfiles locales + rate-limit)
app.post('/api/auth/login', (req, res) => {
  const lock = authService.getLoginLockStatus(req);
  if (lock.locked) {
    dbService.recordAuditEvent({
      action: 'auth.login.lock',
      meta: { retryAfterSec: lock.retryAfterSec }
    });
    return res.status(429).json({
      success: false,
      message: `Demasiados intentos. Espera ${lock.retryAfterSec}s.`,
      retryAfterSec: lock.retryAfterSec
    });
  }

  const { pin, profileId } = req.body || {};
  if (!pin || !String(pin).trim()) {
    return res.status(400).json({ success: false, message: 'PIN requerido.' });
  }

  let profile = null;
  if (profileId) {
    profile = dbService.getStudioProfileById(profileId);
    if (!profile || !profile.active) {
      authService.registerLoginFailure(req);
      dbService.recordAuditEvent({
        action: 'auth.login.fail',
        entity_type: 'profile',
        entity_id: String(profileId),
        meta: { reason: 'profile_missing' }
      });
      return res.status(401).json({ success: false, message: 'Perfil no encontrado.' });
    }
    if (!authService.verifyPinHash(pin, profile.pin_salt, profile.pin_hash)) {
      const status = authService.registerLoginFailure(req);
      dbService.recordAuditEvent({
        action: status.locked ? 'auth.login.lock' : 'auth.login.fail',
        profile_id: profile.id,
        entity_type: 'profile',
        entity_id: profile.id,
        meta: { reason: 'bad_pin', locked: !!status.locked }
      });
      return res.status(401).json({
        success: false,
        message: status.locked
          ? `PIN incorrecto. Cuenta bloqueada ${status.retryAfterSec}s.`
          : 'PIN incorrecto. Inténtalo de nuevo.'
      });
    }
  } else {
    profile = dbService.findStudioProfileByPin(pin);
    if (!profile && authService.verifyLegacyStudioPin(pin)) {
      const defId = dbService.ensureDefaultStudioProfile();
      profile = dbService.getStudioProfileById(defId);
    }
    if (!profile) {
      const status = authService.registerLoginFailure(req);
      dbService.recordAuditEvent({
        action: status.locked ? 'auth.login.lock' : 'auth.login.fail',
        meta: { reason: 'bad_pin', locked: !!status.locked }
      });
      return res.status(401).json({
        success: false,
        message: status.locked
          ? `PIN incorrecto. Cuenta bloqueada ${status.retryAfterSec}s.`
          : 'PIN incorrecto. Inténtalo de nuevo.'
      });
    }
  }

  authService.clearLoginFailures(req);
  dbService.touchStudioProfileLogin(profile.id);
  authService.establishAuthenticatedSession(req, profile, (err) => {
    if (err) {
      console.error('[auth/login] session regenerate', err);
      return res.status(500).json({ success: false, message: 'No se pudo crear la sesión.' });
    }
    dbService.recordAuditEvent({
      action: 'auth.login.ok',
      profile_id: profile.id,
      actor_profile_id: profile.id,
      entity_type: 'profile',
      entity_id: profile.id
    });
    res.json({
      success: true,
      message: 'Sesión iniciada correctamente.',
      profile: publicProfileDTO(profile),
      pinIsDefault: authService.isPinDefault(),
      csrfToken: authService.ensureCsrfToken(req.session)
    });
  });
});

app.post('/api/auth/logout', authService.csrfProtection, (req, res) => {
  const actorId = req.session?.profileId || null;
  req.session.destroy(() => {
    if (actorId) {
      dbService.recordAuditEvent({
        action: 'auth.logout',
        profile_id: actorId,
        actor_profile_id: actorId,
        entity_type: 'profile',
        entity_id: actorId
      });
    }
    res.clearCookie('influ.sid');
    res.json({ success: true, message: 'Sesión cerrada.' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.authenticated) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  const profile = dbService.getStudioProfileById(req.session.profileId);
  res.json({
    success: true,
    authenticated: true,
    profile: publicProfileDTO(profile),
    pinIsDefault: authService.isPinDefault(),
    csrfToken: authService.ensureCsrfToken(req.session)
  });
});

app.get('/api/auth/profiles', (req, res) => {
  res.json({
    success: true,
    profiles: dbService.listStudioProfilesPublic({ forLogin: true }).map(publicProfileDTO),
    pinRequired: authService.isAuthEnabled(),
    pinIsDefault: authService.isPinDefault()
  });
});

/** Quita URLs / paths internos del payload de providers (recon sin auth). */
function publicSafeImageProviders(caps) {
  if (!caps || typeof caps !== 'object') return null;
  const pick = (block, extra = {}) => {
    if (!block || typeof block !== 'object') return undefined;
    return {
      available: !!block.available,
      configured: block.configured != null ? !!block.configured : undefined,
      cost: block.cost,
      faceLock: block.faceLock,
      ...extra
    };
  };
  return {
    active: caps.active,
    freePathAlwaysOn: !!caps.freePathAlwaysOn,
    pollinations: pick(caps.pollinations),
    replicate: pick(caps.replicate, { model: caps.replicate?.model || null }),
    paidFaceLock: pick(caps.paidFaceLock, { model: caps.paidFaceLock?.model || null }),
    comfyui: pick(caps.comfyui),
    localGpu: caps.localGpu
      ? {
          available: !!caps.localGpu.available,
          configured: !!caps.localGpu.configured,
          preferLocal: !!caps.localGpu.preferLocal,
          comfyui: !!caps.localGpu.comfyui,
          a1111: !!caps.localGpu.a1111
        }
      : undefined,
    lora: pick(caps.lora),
    paidLora: pick(caps.paidLora)
  };
}

// API Connection Status (sin auth: sin dataDir/dbPath/URLs internas — docs/SECURITY_MARKET.md)
app.get('/api/status', (req, res) => {
  let imageProviders = null;
  try {
    imageProviders = require('./image-provider').getProviderCapabilities();
  } catch (_) { /* optional module */ }
  const pinIsDefault = authService.isPinDefault();
  const authEnabled = authService.isAuthEnabled();
  const listenHost = firstRun.resolveListenHost();
  const gateOpts = {
    isPinDefault: () => pinIsDefault,
    isAuthEnabled: () => authEnabled
  };
  const publicBindUnsafe = firstRun.shouldBlockPublicInsecureAuth(gateOpts);
  const publicBindBlockReason = firstRun.getPublicBindBlockReason(gateOpts);
  const authenticated = !!(req.session && req.session.authenticated);
  const body = {
    success: true,
    apiConnected: aiService.isApiConnected(),
    gitLinked: fs.existsSync(path.join(__dirname, '.git')),
    pinRequired: authEnabled,
    pinIsDefault,
    setupRequired: pinIsDefault || (publicBindUnsafe && !authEnabled),
    listenHost,
    publicBind: firstRun.isPublicBind(listenHost),
    publicBindUnsafe,
    publicBindBlockReason,
    authEnabled,
    authenticated,
    sessionStore: authService.getSessionStoreKind(),
    jsonBodyLimit: firstRun.getJsonBodyLimit(),
    profile: req.session?.profileId
      ? { id: req.session.profileId, name: req.session.profileName, role: req.session.profileRole }
      : null,
    imageProviders: authenticated
      ? imageProviders
      : publicSafeImageProviders(imageProviders),
    freeTier: {
      imageGen: 'pollinations',
      characterIntegrity: 'json_character_lock + free_chatbots',
      paidFaceLock: 'optional_opt_in_replicate'
    }
  };
  if (authenticated) {
    body.dataDir = dbService.getDataDir ? dbService.getDataDir() : DATA_DIR;
    body.dbPath = dbService.getDbPath ? dbService.getDbPath() : null;
    body.csrfToken = authService.ensureCsrfToken(req.session);
  }
  res.json(body);
});

/**
 * Primer arranque: cambiar PIN por defecto (escribe STUDIO_PIN en .env + hash admin).
 * Requiere sesión de Administración. Mínimo 6 caracteres; no admite 1234.
 */
app.post('/api/setup/change-pin', requireAuth, authService.csrfProtection, requireAdmin, (req, res) => {
  try {
    const { pin, confirmPin } = req.body || {};
    const nextPin = firstRun.validateNewStudioPin(pin, confirmPin);

    firstRun.upsertEnvVar('STUDIO_PIN', nextPin);
    process.env.STUDIO_PIN = nextPin;

    const adminId =
      req.session?.profileId ||
      dbService.ensureDefaultStudioProfile();
    if (adminId) {
      dbService.updateStudioProfile(adminId, { pin: nextPin });
    }

    if (req.session) {
      const profile = adminId ? dbService.getStudioProfileById(adminId) : null;
      authService.establishAuthenticatedSession(
        req,
        profile || { id: adminId, name: 'Administración', role: 'admin' },
        (err) => {
          if (err) {
            console.error('[setup/change-pin] session regenerate', err);
            return res.status(500).json({ success: false, message: 'PIN guardado pero no se pudo renovar la sesión.' });
          }
          dbService.recordAuditEvent({
            action: 'auth.pin.change',
            profile_id: adminId || null,
            actor_profile_id: adminId || null,
            entity_type: 'profile',
            entity_id: adminId || null,
            meta: { via: 'setup' }
          });
          console.log('[setup] STUDIO_PIN actualizado (ya no es el valor por defecto).');
          res.json({
            success: true,
            message: 'PIN actualizado. Guárdalo en un lugar seguro.',
            pinIsDefault: authService.isPinDefault(),
            setupRequired: authService.isPinDefault(),
            csrfToken: authService.ensureCsrfToken(req.session)
          });
        }
      );
      return;
    }

    console.log('[setup] STUDIO_PIN actualizado (ya no es el valor por defecto).');
    dbService.recordAuditEvent({
      action: 'auth.pin.change',
      profile_id: adminId || null,
      actor_profile_id: adminId || null,
      entity_type: 'profile',
      entity_id: adminId || null,
      meta: { via: 'setup_no_session' }
    });
    res.json({
      success: true,
      message: 'PIN actualizado. Guárdalo en un lugar seguro.',
      pinIsDefault: authService.isPinDefault(),
      setupRequired: authService.isPinDefault(),
      csrfToken: req.session ? authService.ensureCsrfToken(req.session) : null
    });
  } catch (err) {
    const status =
      err.code === 'PIN_TOO_SHORT' ||
      err.code === 'PIN_MISMATCH' ||
      err.code === 'PIN_STILL_DEFAULT' ||
      err.code === 'PIN_TRIVIAL' ||
      err.code === 'PIN_UNSAFE_CHARS'
        ? 400
        : 500;
    res.status(status).json({ success: false, message: err.message, code: err.code || null });
  }
});

// Invites redeem (público — antes de requireAuth)
registerInviteRedeemRoute(app, {
  dbService,
  authService,
  publicProfileDTO
});

// =============================================
// PROTECTED ENDPOINTS (requireAuth)
// =============================================

app.use('/api', requireAuth);
// CSRF tras auth: mutaciones cookie exigen X-CSRF-Token (Bearer/CLI exento).
app.use('/api', authService.csrfProtection);

// Cola: solo con sesión (o auth off en localhost). Evita recon de currentTaskInfo.
app.get('/api/queue-status', (req, res) => {
  res.json({
    success: true,
    queue: genQueue.getStatus()
  });
});

registerLocalGpuRoutes(app, {
  isAdmin: (req) => dbService.isAdminRole(req.session?.profileRole)
});

// Personas (W5c) — CRUD / variants / versions / license / export
// triggerBackgroundVariants llega desde routes/import.js (W5d) justo abajo.
const _personaBg = { trigger: null };
registerPersonasRoutes(app, {
  dbService,
  aiService,
  consistencyScore,
  requireOwnedPersona,
  resolveSessionProfile,
  runGitBackup,
  triggerBackgroundVariants: (persona) => {
    if (!_personaBg.trigger) throw new Error('triggerBackgroundVariants no inicializado');
    return _personaBg.trigger(persona);
  },
  createZipArchive,
  rootDir: __dirname,
  uploadLora
});

registerGenerationRoutes(app, {
  dbService,
  aiService,
  resolveSessionProfile,
  resolveSafeAssetPath,
  UNSAFE_PATH,
  apiRateLimit: authService.apiRateLimit
});

const { triggerBackgroundVariants } = registerImportRoutes(app, {
  dbService,
  aiService,
  genQueue,
  imageValidation,
  consistencyScore,
  resolveSessionProfile,
  resolveSafeAssetPath,
  runGitBackup,
  upload,
  assertSafeRemoteImageUrl,
  assertSafeRemoteImageUrlResolved,
  UNSAFE_URL,
  scoreVariantAgainstPersona: scoreVariantAgainstPersonaFn,
  scratchDir: SCRATCH_DIR,
  rootDir: __dirname,
  apiRateLimit: authService.apiRateLimit
});
_personaBg.trigger = triggerBackgroundVariants;

registerAdminRoutes(app, {
  dbService,
  requireAdmin,
  publicProfileDTO,
  dataDir: DATA_DIR,
  rootDir: __dirname,
  createZipArchive
});




// Get All Data (legacy fallback endpoint)
app.get('/api/data', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const { mapPersonasDisplayImages } = require('./persona-image');
  const personas = mapPersonasDisplayImages(dbService.getAllPersonas(profileId));
  const products = dbService.getAllProducts(profileId);
  const generationStats = dbService.getGenerationStats(profileId);
  const scriptsCount = dbService.countScriptsForProfile(profileId);
  res.json({
    personas,
    products,
    generationStats,
    scriptsCount,
    profile: {
      id: req.session.profileId,
      name: req.session.profileName,
      role: req.session.profileRole
    }
  });
});

// Products endpoints
app.get('/api/products', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  res.json(dbService.getAllProducts(profileId));
});

app.post('/api/products', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const product = dbService.saveProduct({ ...req.body, profile_id: profileId });
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, products: dbService.getAllProducts(profileId), product, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Bulk Import Products (Shopify / AliExpress Dropshipping CSV / JSON)
app.post('/api/products/import', (req, res) => {
  try {
    const profileId = req.session.profileId || resolveSessionProfile(req);
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, error: 'Formato inválido. Debe enviar un array de productos.' });
    }
    const imported = dbService.bulkImportProducts(products, profileId);
    runGitBackup((gitSuccess, msg) => {
      res.json({
        success: true,
        count: imported.length,
        products: dbService.getAllProducts(profileId),
        gitSynced: gitSuccess,
        gitMessage: msg
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/api/workspaces', (req, res) => {
  res.json(dbService.getAllWorkspaces());
});

app.post('/api/workspaces', (req, res) => {
  const workspaces = dbService.createWorkspace(req.body);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, workspaces, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Bulk Ad Generator Pipeline (5x2 Matrix per Product)
const activeAdBatches = {};

const AD_CONVERSION_HOOKS = [
  'Probé esto por 7 días y los resultados me sorprendieron 😱',
  'La razón por la que todos en TikTok están obsesionados con esto...',
  '⚡ 50% OFF — Solo por hoy con envío gratis',
  '🛑 STOP SCROLLING: La solución definitiva que buscabas',
  '✨ El secreto de calidad que las grandes marcas no quieren que sepas'
];

const AD_FORMATS = ['9:16', '1:1'];

app.post('/api/ads/bulk-generate', authService.apiRateLimit('heavy'), async (req, res) => {
  try {
    const profileId = req.session.profileId || resolveSessionProfile(req);
    const { personaId, productIds } = req.body;
    if (!personaId) return res.status(400).json({ success: false, error: 'personaId es requerido.' });
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar al menos 1 producto.' });
    }

    const persona = dbService.assertPersonaOwnedBy(personaId, profileId);
    if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada.' });

    const products = productIds
      .map(id => dbService.assertProductOwnedBy(id, profileId))
      .filter(Boolean);
    if (products.length === 0) return res.status(404).json({ success: false, error: 'Productos no encontrados.' });

    // BULK_ADS_TEST_MATRIX=1 → 1 hook × 2 formats (2 tareas/producto) para tests offline.
    const hooks = process.env.BULK_ADS_TEST_MATRIX === '1'
      ? AD_CONVERSION_HOOKS.slice(0, 1)
      : AD_CONVERSION_HOOKS;
    const formats = AD_FORMATS;
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const totalTasks = products.length * hooks.length * formats.length; // 10 per product (2 in test matrix)

    activeAdBatches[batchId] = {
      batchId,
      profileId,
      personaName: persona.name,
      total: totalTasks,
      completed: 0,
      failed: 0,
      status: 'processing',
      images: [],
      created_at: new Date().toISOString()
    };

    // Enqueue tasks into genQueue (label, jobFn) — never enqueue(fn) alone.
    for (const prod of products) {
      for (const hookText of hooks) {
        for (const format of formats) {
          const label = `bulk-ad:${prod.name}:${format}`;
          genQueue.enqueue(label, async () => {
            try {
              const masterPrompt = aiService.buildUnifiedMasterPrompt({
                name: persona.name,
                age: persona.age || '25 años',
                gender: persona.gender || 'Female',
                ethnicity: persona.ethnicity || 'Latina',
                hair: persona.hair || 'dark brown wavy hair',
                clothing: 'atuendo publicitario elegante',
                setting: 'estudio comercial iluminado',
                product: prod.name,
                framing: format === '9:16' ? 'fullbody' : 'medium'
              }) + `. AD HOOK TEXT: "${hookText}". COMMERCIAL AD CREATIVE FOR ${format.toUpperCase()}.`;

              const imagePath = await aiService.generateInfluencerImage(masterPrompt, {
                personaName: persona.name,
                width: 1024,
                height: 1024
              });

              const adRecord = {
                id: `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                productName: prod.name,
                productId: prod.id,
                hookText,
                format,
                imagePath,
                caption: `🎯 ANUNCIO ${format} — ${prod.name}\n\n"${hookText}"\n\n👉 ¡Consíguelo hoy con envío rápido! #ad #dropshipping #${prod.name.toLowerCase().replace(/\s+/g, '')}`
              };

              dbService.saveGeneration({
                persona_id: persona.id,
                prompt: masterPrompt,
                image_path: imagePath,
                generation_type: 'bulk_ad',
                metadata: JSON.stringify(adRecord)
              });

              activeAdBatches[batchId].completed++;
              activeAdBatches[batchId].images.push(adRecord);
            } catch (err) {
              console.error(`Error in bulk ad generation task:`, err.message);
              activeAdBatches[batchId].failed++;
            } finally {
              const b = activeAdBatches[batchId];
              if (b && b.completed + b.failed >= b.total) {
                b.status = 'completed';
              }
            }
          });
        }
      }
    }

    res.json({ success: true, batchId, totalTasks, status: 'processing' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/ads/batch-status/:batchId', (req, res) => {
  const batch = activeAdBatches[req.params.batchId];
  if (!batch) return res.status(404).json({ success: false, error: 'Lote no encontrado.' });
  const profileId = req.session.profileId || resolveSessionProfile(req);
  if (batch.profileId && profileId && batch.profileId !== profileId) {
    return res.status(404).json({ success: false, error: 'Lote no encontrado.' });
  }
  // No filtrar profileId interno al cliente.
  const { profileId: _pid, ...publicBatch } = batch;
  res.json({ success: true, batch: publicBatch });
});

// Campaigns endpoints
app.get('/api/campaigns', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  res.json(dbService.getAllCampaigns(profileId));
});

app.get('/api/campaigns/:id', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const c = dbService.getCampaignById(req.params.id);
  if (!c) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }
  if (profileId && c.profile_id && c.profile_id !== profileId) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }
  res.json(c);
});

app.post('/api/campaigns', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const { campaign, personaIds } = req.body;
  const c = dbService.saveCampaign({ ...campaign, profile_id: profileId }, personaIds);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, campaign: c, campaigns: dbService.getAllCampaigns(profileId), gitSynced: gitSuccess, gitMessage: msg });
  });
});

app.delete('/api/campaigns/:id', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const existing = dbService.getCampaignById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }
  if (profileId && existing.profile_id && existing.profile_id !== profileId) {
    return res.status(403).json({ success: false, message: 'No puedes eliminar campañas de otro perfil.' });
  }
  dbService.deleteCampaign(req.params.id);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, campaigns: dbService.getAllCampaigns(profileId), gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Scripts endpoints
app.post('/api/campaigns/:id/scripts', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const owned = dbService.assertCampaignOwnedBy(req.params.id, profileId);
  if (!owned) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }
  const saved = dbService.saveScripts(req.params.id, req.body.scripts);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, scripts: saved, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Gallery endpoints
app.get('/api/gallery', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  res.json(dbService.getGalleryItems(profileId));
});

app.post('/api/gallery', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const { prompt, imagePath } = req.body;
  const item = dbService.saveToGallery(prompt, imagePath, profileId);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, item, gitSynced: gitSuccess, gitMessage: msg });
  });
});

app.get('/api/export/campaign/:id', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const c = dbService.assertCampaignOwnedBy(req.params.id, profileId);
  if (!c) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }

  res.attachment(`campana_${c.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_export.zip`);

  const archive = createZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);

  // 1. Add Campaign metadata JSON
  archive.append(JSON.stringify(c, null, 2), { name: 'campana.json' });

  // 2. Add Personas JSON
  if (c.personas && c.personas.length > 0) {
    c.personas.forEach(p => {
      archive.append(JSON.stringify(p, null, 2), { name: `personas/${p.name.toLowerCase()}_persona.json` });
      
      // If reference image exists, bundle it
      if (p.image && fs.existsSync(path.join(__dirname, p.image))) {
        archive.file(path.join(__dirname, p.image), { name: `imagenes/${path.basename(p.image)}` });
      }
      if (p.imageUGC && fs.existsSync(path.join(__dirname, p.imageUGC))) {
        archive.file(path.join(__dirname, p.imageUGC), { name: `imagenes/${path.basename(p.imageUGC)}` });
      }
    });
  }

  // 3. Add Scripts
  if (c.scripts && c.scripts.length > 0) {
    c.scripts.forEach((s, idx) => {
      const scriptText = `
ÁNGULO PUBLICITARIO: ${s.angle}
=========================================================

1. EL GANCHO (HOOK) [0-3s]:
Texto: "${s.hook}"
Visual: [${s.hookCue}]

2. DEMOSTRACIÓN (DEMO) [3-10s]:
Texto: "${s.demo}"
Visual: [${s.demoCue}]

3. EL GIRO (THE TURN) [10-15s]:
Texto: "${s.turn}"
Visual: [${s.turnCue}]

4. LLAMADO A LA ACCIÓN (CTA) [15-20s]:
Texto: "${s.cta}"
Visual: [${s.ctaCue}]
=========================================================
`;
      archive.append(scriptText.trim(), { name: `scripts/script_${idx + 1}_${s.angle.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt` });
    });
  }

  // 4. Add Proposal / Cotización text
  const basePrice = 150;
  const total = basePrice * 2;
  const proposalText = `
=========================================================
COTIZACIÓN COMERCIAL - CAMPAÑA AI UGC
=========================================================
Campaña: ${c.name}
Cliente: ${c.client_name || 'Estándar'}
Producto: ${c.product ? c.product.name : 'N/D'}

DESGLOSE DE TARIFAS:
1. Derechos del Modelo Virtual AI: $${basePrice.toFixed(2)} USD
2. Licencia Comercial Ampliada (90 Días): $${basePrice.toFixed(2)} USD
3. Copywriting de 10 variaciones de scripts: INCLUIDO

INVERSIÓN TOTAL DE CAMPAÑA: $${total.toFixed(2)} USD
=========================================================
`;
  archive.append(proposalText.trim(), { name: 'propuesta_licencia.txt' });

  archive.finalize();
});

app.get('/api/niches', (req, res) => {
  try {
    const { listNichePresets } = require('./niche-presets');
    res.json({ success: true, niches: listNichePresets() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Git sync trigger (solo Administración — puede empujar a remoto si ENABLE_GIT_BACKUP=1)
app.post('/api/sync', requireAdmin, (req, res) => {
  // Save DB copy first to ensure latest backup
  dbService.syncDbToWorkspace();
  runGitBackup((gitSuccess, msg) => {
    if (gitSuccess) {
      res.json({ success: true, message: "Sincronización exitosa con GitHub", gitMessage: msg });
    } else {
      res.status(500).json({ success: false, message: "Error al sincronizar con GitHub", gitMessage: msg });
    }
  });
});

// Global error handling middleware (e.g. for Multer errors)
app.use((err, req, res, next) => {
  console.error('Unhandled error handler:', err);
  if (err && err.name === 'MulterError') {
    let message = 'Error al procesar archivos.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(firstRun.getUploadFileSizeLimitBytes() / (1024 * 1024));
      message = `Una de las imágenes excede el límite de tamaño permitido (${mb}MB).`;
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Has excedido el límite máximo de fotos (máximo 4 fotos).';
    }
    return res.status(400).json({ success: false, message });
  }
  res.status(500).json({ success: false, message: err.message || 'Error interno del servidor.' });
});

function startHttpServer(port = PORT, host = LISTEN_HOST) {
  const gateOpts = {
    isPinDefault: () => authService.isPinDefault(),
    isAuthEnabled: () => authService.isAuthEnabled()
  };
  if (firstRun.shouldBlockPublicInsecureAuth(gateOpts)) {
    const reason = firstRun.getPublicBindBlockReason(gateOpts);
    console.warn('');
    console.warn('╔══════════════════════════════════════════════════════════════════╗');
    console.warn('║  AVISO DE SEGURIDAD                                              ║');
    if (reason === 'AUTH_DISABLED') {
      console.warn('║  HOST público + STUDIO_PIN vacío (auth off).                     ║');
      console.warn('║  La API quedará en 503 hasta que definas un PIN.                 ║');
    } else {
      console.warn('║  HOST público + PIN por defecto (1234).                          ║');
      console.warn('║  La API quedará en 503 hasta que cambies el PIN en el asistente. ║');
    }
    console.warn('║  Recomendado: HOST=127.0.0.1 (default) o STUDIO_PIN fuerte.      ║');
    console.warn('║  Guía: docs/SECURITY_MARKET.md                                   ║');
    console.warn('╚══════════════════════════════════════════════════════════════════╝');
    console.warn('');
  } else if (
    firstRun.isPublicBind(firstRun.resolveListenHost())
    && authService.isTrustProxyEnabled
    && authService.isTrustProxyEnabled()
    && process.env.COOKIE_SECURE !== '1'
  ) {
    console.warn('[security] HOST público + TRUST_PROXY sin COOKIE_SECURE=1 — si hay HTTPS, activa COOKIE_SECURE (docs/SECURITY_MARKET.md).');
  }

  const server = app.listen(port, host, () => {
    const where = host === '0.0.0.0' ? `todas las interfaces :${port}` : `${host}:${port}`;
    console.log(`Server is running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port} (bind ${where})`);
    if (firstRun.isPublicBind(host)) {
      console.log(`[session] store=${authService.getSessionStoreKind()} · LAN: docs/SECURITY_MARKET.md § LAN casera`);
    }
    if (authService.isPinDefault()) {
      console.log('[setup] PIN por defecto activo — abre el Studio y completa el asistente de primer arranque.');
    }
    if (!authService.isAuthEnabled()) {
      console.log('[setup] STUDIO_PIN vacío — auth desactivada (solo seguro en localhost).');
    }
  });
  return server;
}

if (require.main === module) {
  startHttpServer();
}

module.exports = app;
module.exports.LISTEN_HOST = LISTEN_HOST;
module.exports.startHttpServer = startHttpServer;
module.exports.resolveListenHost = firstRun.resolveListenHost;
