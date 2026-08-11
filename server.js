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
const aiService = require('./ai-service');
const genQueue = require('./gen-queue');
const {
  resolveSafeAssetPath,
  assertSafeRemoteImageUrl,
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(authService.sessionMiddleware);

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
    return next();
  }
  if (req.session && req.session.authenticated && req.session.profileId) {
    return next();
  }
  const profileId = resolveSessionProfile(req);
  if (req.session?.authenticated && profileId) return next();
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

// Serve main app pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
app.get('/index.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.css'));
});

// Multer storage config — saves uploaded reference photos to assets/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'assets', 'references');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const unique = `ref_${Date.now()}_${safeName}`;
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

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
  limits: { fileSize: 500 * 1024 * 1024 },
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
      return res.status(401).json({ success: false, message: 'Perfil no encontrado.' });
    }
    if (!authService.verifyPinHash(pin, profile.pin_salt, profile.pin_hash)) {
      const status = authService.registerLoginFailure(req);
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
    res.json({
      success: true,
      message: 'Sesión iniciada correctamente.',
      profile: publicProfileDTO(profile),
      pinIsDefault: authService.isPinDefault()
    });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
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
    pinIsDefault: authService.isPinDefault()
  });
});

app.get('/api/auth/profiles', (req, res) => {
  res.json({
    success: true,
    profiles: dbService.listStudioProfilesPublic().map(publicProfileDTO),
    pinRequired: authService.isAuthEnabled(),
    pinIsDefault: authService.isPinDefault()
  });
});

// API Connection Status
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
  res.json({
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
    authenticated: !!(req.session && req.session.authenticated),
    profile: req.session?.profileId
      ? { id: req.session.profileId, name: req.session.profileName, role: req.session.profileRole }
      : null,
    dataDir: dbService.getDataDir ? dbService.getDataDir() : DATA_DIR,
    dbPath: dbService.getDbPath ? dbService.getDbPath() : null,
    imageProviders,
    freeTier: {
      imageGen: 'pollinations',
      characterIntegrity: 'json_character_lock + free_chatbots',
      paidFaceLock: 'optional_opt_in_replicate'
    }
  });
});

/**
 * Primer arranque: cambiar PIN por defecto (escribe STUDIO_PIN en .env + hash admin).
 * Requiere sesión de Administración. Mínimo 6 caracteres; no admite 1234.
 */
app.post('/api/setup/change-pin', requireAuth, requireAdmin, (req, res) => {
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
          console.log('[setup] STUDIO_PIN actualizado (ya no es el valor por defecto).');
          res.json({
            success: true,
            message: 'PIN actualizado. Guárdalo en un lugar seguro.',
            pinIsDefault: authService.isPinDefault(),
            setupRequired: authService.isPinDefault()
          });
        }
      );
      return;
    }

    console.log('[setup] STUDIO_PIN actualizado (ya no es el valor por defecto).');
    res.json({
      success: true,
      message: 'PIN actualizado. Guárdalo en un lugar seguro.',
      pinIsDefault: authService.isPinDefault(),
      setupRequired: authService.isPinDefault()
    });
  } catch (err) {
    const status = err.code === 'PIN_TOO_SHORT' || err.code === 'PIN_MISMATCH' || err.code === 'PIN_STILL_DEFAULT'
      ? 400
      : 500;
    res.status(status).json({ success: false, message: err.message, code: err.code || null });
  }
});

// Image Generation Queue Status Endpoint
app.get('/api/queue-status', (req, res) => {
  res.json({
    success: true,
    queue: genQueue.getStatus()
  });
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

registerLocalGpuRoutes(app);

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
  const generationStats = dbService.getGenerationStats();
  res.json({
    personas,
    products,
    generationStats,
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

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const totalTasks = products.length * AD_CONVERSION_HOOKS.length * AD_FORMATS.length; // 10 per product

    activeAdBatches[batchId] = {
      batchId,
      personaName: persona.name,
      total: totalTasks,
      completed: 0,
      failed: 0,
      status: 'processing',
      images: [],
      created_at: new Date().toISOString()
    };

    // Enqueue tasks into genQueue
    for (const prod of products) {
      for (const hookText of AD_CONVERSION_HOOKS) {
        for (const format of AD_FORMATS) {
          genQueue.enqueue(async () => {
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
              if (activeAdBatches[batchId].completed + activeAdBatches[batchId].failed >= activeAdBatches[batchId].total) {
                activeAdBatches[batchId].status = 'completed';
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
  res.json({ success: true, batch });
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

// Git sync trigger
app.post('/api/sync', (req, res) => {
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
      message = 'Una de las imágenes excede el límite de tamaño permitido (50MB).';
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
    console.warn('╚══════════════════════════════════════════════════════════════════╝');
    console.warn('');
  }

  const server = app.listen(port, host, () => {
    const where = host === '0.0.0.0' ? `todas las interfaces :${port}` : `${host}:${port}`;
    console.log(`Server is running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port} (bind ${where})`);
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
