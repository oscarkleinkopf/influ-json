const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
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

const dbService = require('./db');
const authService = require('./auth');
const aiService = require('./ai-service');
const genQueue = require('./gen-queue');
const {
  isGitBackupEnabled,
  resolveSafeAssetPath,
  assertSafeRemoteImageUrl,
  UNSAFE_PATH,
  UNSAFE_URL
} = require('./safe-paths');
const imageValidation = require('./image-validation');
const consistencyScore = require('./consistency-score');
const { registerPersonasRoutes, scoreVariantAgainstPersona: scoreVariantAgainstPersonaFn } = require('./routes/personas');

// Initialize DB and migrate legacy JSON data if empty
dbService.runMigrations();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(authService.securityHeaders);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(authService.sessionMiddleware);

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

// Serve static assets with no auth required
app.use('/assets', express.static(path.join(__dirname, 'assets')));

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
app.get('/import-flow.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'import-flow.js'));
});
app.get('/prompt-builder.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'prompt-builder.js'));
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

// Portable data directory (ROADMAP 1.6) — was hardcoded Antigravity brain path
const { DATA_DIR, ensureDir } = require('./paths');
const SCRATCH_DIR = DATA_DIR;
ensureDir(SCRATCH_DIR);

// Git backup helper — OPT-IN (ENABLE_GIT_BACKUP=1). Default: off.
function runGitBackup(callback) {
  if (!isGitBackupEnabled()) {
    if (callback) {
      callback(true, 'Git backup omitido (requiere ENABLE_GIT_BACKUP=1; o DISABLE_GIT_BACKUP=1)');
    }
    return;
  }
  const commitMsg = `Backup auto-sync: Campaign update ${new Date().toISOString()}`;
  const commands = `git add . && git commit -m "${commitMsg}" --allow-empty && git push origin main`;

  // Call callback immediately to prevent blocking HTTP response
  if (callback) {
    callback(true, 'Git backup scheduled in background');
  }

  // Run the commands in the background asynchronously
  exec(commands, (error, stdout, stderr) => {
    if (error) {
      console.warn('Background Git backup failed:', error.message);
    } else {
      console.log('Background Git backup success:', stdout.trim());
    }
  });
}

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
  req.session.authenticated = true;
  req.session.profileId = profile.id;
  req.session.profileName = profile.name;
  req.session.profileRole = profile.role;

  res.json({
    success: true,
    message: 'Sesión iniciada correctamente.',
    profile: publicProfileDTO(profile),
    pinIsDefault: authService.isPinDefault()
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

/** Canje público de invitación → perfil member aislado (sin mezclar creaciones). */
app.post('/api/invites/redeem', (req, res) => {
  const lock = authService.getLoginLockStatus(req);
  if (lock.locked) {
    return res.status(429).json({
      success: false,
      message: `Demasiados intentos. Espera ${lock.retryAfterSec}s.`,
      retryAfterSec: lock.retryAfterSec
    });
  }
  try {
    const { code, name, pin } = req.body || {};
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Código de invitación requerido.' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Nombre de perfil requerido.' });
    }
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'El PIN debe tener al menos 4 caracteres.' });
    }
    const result = dbService.redeemStudioInvite({ code, name, pin });
    authService.clearLoginFailures(req);
    dbService.touchStudioProfileLogin(result.profile.id);
    req.session.authenticated = true;
    req.session.profileId = result.profile.id;
    req.session.profileName = result.profile.name;
    req.session.profileRole = result.profile.role;
    res.json({
      success: true,
      message: 'Invitación aceptada. Tu espacio está vacío y aislado del resto.',
      profile: publicProfileDTO(result.profile),
      pinIsDefault: false
    });
  } catch (err) {
    authService.registerLoginFailure(req);
    res.status(400).json({ success: false, message: err.message });
  }
});

// API Connection Status
app.get('/api/status', (req, res) => {
  let imageProviders = null;
  try {
    imageProviders = require('./image-provider').getProviderCapabilities();
  } catch (_) { /* optional module */ }
  res.json({
    success: true,
    apiConnected: aiService.isApiConnected(),
    gitLinked: fs.existsSync(path.join(__dirname, '.git')),
    pinRequired: authService.isAuthEnabled(),
    pinIsDefault: authService.isPinDefault(),
    authEnabled: authService.isAuthEnabled(),
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
      paidFaceLock: 'optional_future_replicate'
    }
  });
});

// Image Generation Queue Status Endpoint
app.get('/api/queue-status', (req, res) => {
  res.json({
    success: true,
    queue: genQueue.getStatus()
  });
});

// =============================================
// PROTECTED ENDPOINTS (requireAuth)
// =============================================

app.use('/api', requireAuth);

// Personas (W5c) — CRUD / variants / versions / license / export
// triggerBackgroundVariants se define más abajo; el wrapper lazy lo resuelve al llamar.
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
  rootDir: __dirname
});


// Profiles CRUD (local multi-user) — crear/borrar perfiles: solo Administración
app.get('/api/profiles', (req, res) => {
  const profiles = dbService.listStudioProfilesAdmin().map((p) => ({
    ...publicProfileDTO(p),
    personaCount: dbService.countPersonasForProfile(p.id)
  }));
  res.json({
    success: true,
    profiles,
    currentProfileId: req.session.profileId || null,
    isAdmin: dbService.isAdminRole(req.session.profileRole)
  });
});

app.post('/api/profiles', requireAdmin, (req, res) => {
  try {
    const { name, pin, role } = req.body || {};
    const created = dbService.createStudioProfile({
      name,
      pin,
      role: role === 'admin' ? 'admin' : 'member'
    });
    res.json({ success: true, profile: publicProfileDTO(created) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.patch('/api/profiles/:id', (req, res) => {
  try {
    const isAdmin = dbService.isAdminRole(req.session.profileRole);
    // Members solo pueden editar su propio perfil (nombre/PIN)
    if (!isAdmin && req.session.profileId !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Solo puedes editar tu propio perfil.' });
    }
    const updated = dbService.updateStudioProfile(req.params.id, req.body || {});
    if (req.session.profileId === updated.id) {
      req.session.profileName = updated.name;
      req.session.profileRole = updated.role;
    }
    res.json({ success: true, profile: publicProfileDTO(updated) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/profiles/:id', requireAdmin, (req, res) => {
  try {
    if (req.session.profileId === req.params.id) {
      return res.status(400).json({ success: false, message: 'No puedes eliminar el perfil con el que estás conectado.' });
    }
    dbService.deleteStudioProfile(req.params.id);
    res.json({ success: true, profiles: dbService.listStudioProfilesAdmin().map(publicProfileDTO) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Invitaciones — solo Administración (crear / listar / revocar)
app.get('/api/invites', requireAdmin, (req, res) => {
  const invites = dbService.listStudioInvites().map((inv) => ({
    id: inv.id,
    code: inv.code,
    note: inv.note,
    emailHint: inv.email_hint,
    invitedBy: inv.invited_by,
    invitedByName: inv.invited_by_name || null,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
    usedAt: inv.used_at,
    usedByProfileId: inv.used_by_profile_id,
    usedByName: inv.used_by_name || null,
    revokedAt: inv.revoked_at,
    maxUses: inv.max_uses,
    useCount: inv.use_count,
    status: inviteStatus(inv)
  }));
  res.json({ success: true, invites });
});

app.post('/api/invites', requireAdmin, (req, res) => {
  try {
    const { note, emailHint, expiresInDays, maxUses } = req.body || {};
    const invite = dbService.createStudioInvite({
      invitedBy: req.session.profileId,
      note,
      emailHint,
      expiresInDays,
      maxUses
    });
    res.json({
      success: true,
      invite: {
        id: invite.id,
        code: invite.code,
        note: invite.note,
        emailHint: invite.email_hint,
        expiresAt: invite.expires_at,
        maxUses: invite.max_uses,
        useCount: invite.use_count,
        status: inviteStatus(invite)
      },
      message: 'Invitación creada. Comparte el código con la persona invitada.'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/invites/:id/revoke', requireAdmin, (req, res) => {
  try {
    const invite = dbService.revokeStudioInvite(req.params.id, req.session.profileId);
    res.json({ success: true, invite: { id: invite.id, code: invite.code, revokedAt: invite.revoked_at, status: 'revoked' } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

function inviteStatus(inv) {
  if (!inv) return 'unknown';
  if (inv.revoked_at) return 'revoked';
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return 'expired';
  const maxUses = inv.max_uses == null ? 1 : Number(inv.max_uses);
  if (Number(inv.use_count || 0) >= maxUses) return 'used';
  return 'active';
}

// Backups SQLite (solo Administración) — free path, sin cloud
app.get('/api/backups', requireAdmin, (req, res) => {
  try {
    const meta = dbService.getBackupMeta();
    const snapshots = dbService.listBackupSnapshots().map((s) => ({
      filename: s.filename,
      size: s.size,
      mtime: s.mtime
    }));
    res.json({
      success: true,
      schemaVersion: dbService.getSchemaVersion(),
      meta,
      snapshots
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/backups', requireAdmin, (req, res) => {
  try {
    const label = (req.body && req.body.label) || 'manual';
    const snap = dbService.createBackupSnapshot(label);
    res.json({
      success: true,
      message: 'Backup creado en data/backups/.',
      snapshot: {
        filename: path.basename(snap.dbPath),
        dbPath: snap.dbPath,
        schemaVersion: snap.schemaVersion,
        createdAt: snap.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/backups/restore', requireAdmin, (req, res) => {
  try {
    const filename = String((req.body && req.body.filename) || '').trim();
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nombre de archivo inválido.' });
    }
    if (!filename.endsWith('.sqlite')) {
      return res.status(400).json({ success: false, message: 'Solo se restauran archivos .sqlite.' });
    }
    const abs = path.join(DATA_DIR, 'backups', filename);
    const result = dbService.restoreBackupFromFile(abs);
    res.json({
      success: true,
      ...result,
      message: result.message || 'Backup restaurado. Reinicia el servidor (npm start).'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/backups/:filename/download', requireAdmin, (req, res) => {
  try {
    const filename = String(req.params.filename || '').trim();
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\') || !filename.endsWith('.sqlite')) {
      return res.status(400).json({ success: false, message: 'Nombre de archivo inválido.' });
    }
    const abs = path.join(DATA_DIR, 'backups', filename);
    const resolved = path.resolve(abs);
    const backupsDir = path.resolve(path.join(DATA_DIR, 'backups'));
    if (!resolved.startsWith(backupsDir + path.sep)) {
      return res.status(400).json({ success: false, message: 'Ruta no permitida.' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ success: false, message: 'Backup no encontrado.' });
    }
    res.download(resolved, filename);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Settings Endpoint — Update API Keys in .env safely via GUI (solo Administración)
app.post('/api/settings/keys', requireAdmin, (req, res) => {
  try {
    const { geminiApiKey, replicateApiToken } = req.body || {};
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    function updateEnvVar(key, val) {
      if (val === undefined || val === null) return;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
      process.env[key] = val;
    }

    if (geminiApiKey !== undefined) updateEnvVar('GEMINI_API_KEY', geminiApiKey.trim());
    if (replicateApiToken !== undefined) updateEnvVar('REPLICATE_API_TOKEN', replicateApiToken.trim());

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    res.json({
      success: true,
      message: 'Configuración de claves guardada correctamente.',
      geminiConnected: !!process.env.GEMINI_API_KEY,
      replicateConnected: !!process.env.REPLICATE_API_TOKEN
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get All Data (legacy fallback endpoint)
app.get('/api/data', (req, res) => {
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const personas = dbService.getAllPersonas(profileId);
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

app.post('/api/ads/bulk-generate', async (req, res) => {
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

// Generation History endpoints
app.delete('/api/generations/:id', (req, res) => {
  try {
    const profileId = req.session.profileId || resolveSessionProfile(req);
    const gen = dbService.getGenerationById(req.params.id);
    if (!gen) {
      return res.status(404).json({ success: false, message: 'Generación no encontrada.' });
    }
    const personaId = gen.persona_id;
    if (personaId && personaId !== 'new_persona' && personaId !== 'unknown') {
      const owned = dbService.assertPersonaOwnedBy(personaId, profileId);
      if (!owned) {
        return res.status(404).json({ success: false, message: 'Generación no encontrada.' });
      }
    } else if (!dbService.isAdminRole(req.session?.profileRole)) {
      // orphan / new_persona: solo admin
      return res.status(404).json({ success: false, message: 'Generación no encontrada.' });
    }
    dbService.deleteGeneration(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/generations', (req, res) => {
  try {
    const stats = dbService.getGenerationStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI endpoints
app.post('/api/ai/analyze-photo', (req, res) => {
  const { imagePath } = req.body;
  let safePath;
  try {
    safePath = resolveSafeAssetPath(imagePath);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.code === UNSAFE_PATH ? err.message : 'Ruta de archivo inválida.'
    });
  }
  aiService.analyzeReferencePhoto(safePath)
    .then(result => {
      res.json({ success: true, analysis: result });
    })
    .catch(err => {
      res.status(500).json({ success: false, message: err.message });
    });
});

app.post('/api/ai/expand-persona-details', async (req, res) => {
  try {
    const details = await aiService.generateScratchPersonaDetails(req.body);
    res.json({ success: true, details });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/ai/generate-scripts', (req, res) => {
  const { product, persona, count } = req.body;
  aiService.generateScripts(product, persona, count)
    .then(result => {
      res.json({ success: true, scripts: result });
    })
    .catch(err => {
      res.status(500).json({ success: false, message: err.message });
    });
});

app.post('/api/ai/generate-image', async (req, res) => {
  const { prompt, referenceLocalPath, options, framing } = req.body;
  const profileId = req.session.profileId || resolveSessionProfile(req);
  const personaId = req.body.personaId || 'new_persona';

  if (personaId !== 'new_persona' && personaId !== 'unknown') {
    const owned = dbService.assertPersonaOwnedBy(personaId, profileId);
    if (!owned) {
      return res.status(404).json({ success: false, message: 'Influencer no encontrado.' });
    }
  }

  let referenceUrl = null;
  if (referenceLocalPath && !String(referenceLocalPath).startsWith('http')) {
    try {
      const safeRef = resolveSafeAssetPath(referenceLocalPath);
      referenceUrl = await aiService.uploadToTmpFiles(safeRef);
    } catch (e) {
      if (e && e.code === UNSAFE_PATH) {
        return res.status(400).json({ success: false, message: e.message });
      }
      console.warn('Failed to upload reference photo for generation:', e);
    }
  }

  const genOptions = options || {};
  if (framing) genOptions.framing = framing;
  if (genOptions.seed == null) {
    genOptions.seed = Math.floor(Math.random() * 1000000);
  }

  aiService.generateInfluencerImage(prompt, referenceUrl, genOptions)
    .then(imagePath => {
      // Save to generation history
      try {
        dbService.saveGeneration({
          persona_id: personaId,
          prompt: req.body.prompt,
          image_path: imagePath,
          generation_type: req.body.generationType || 'portrait',
          metadata: JSON.stringify({ referenceImage: req.body.referenceImage || null })
        });
      } catch (histErr) {
        console.warn('Failed to save generation history:', histErr.message);
      }
      res.json({ success: true, imagePath });
    })
    .catch(err => {
      res.status(500).json({ success: false, message: err.message });
    });
});

// Video Pipeline generation (stub mock infrastructure ready)
app.post('/api/ai/generate-video', (req, res) => {
  const { prompt, duration } = req.body;
  console.log(`Video generation stub called with prompt: ${prompt}`);
  
  // Return a mock path for the video
  setTimeout(() => {
    res.json({
      success: true,
      videoPath: 'assets/mock_ugc_video.mp4',
      message: 'Video generado exitosamente utilizando la infraestructura pre-configurada.'
    });
  }, 3000);
});

// ZIP exporter
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

// Upload reference photo endpoint
app.post('/api/upload-reference', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });
  }

  const relativePath = `assets/references/${req.file.filename}`;
  const absolutePath = path.join(__dirname, relativePath);

  try {
    await imageValidation.assertValidImageFile(absolutePath);
  } catch (err) {
    return res.status(400).json({
      success: false,
      code: err.code || 'INVALID_IMAGE',
      message: err.message || 'El archivo no es una imagen válida.'
    });
  }

  // Sync reference image to scratch directory
  const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
  if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });
  fs.copyFileSync(absolutePath, path.join(scratchRefsDir, req.file.filename));
  console.log(`Reference image synced to scratch: ${req.file.filename}`);

  // Auto-git-backup the new reference
  runGitBackup((gitSuccess, msg) => {
    res.json({
      success: true,
      filePath: relativePath,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      gitMessage: msg
    });
  });
});

async function downloadOrResolveImage(inputUrl) {
  const MAX_BYTES = 15 * 1024 * 1024;
  const FETCH_MS = 12000;

  let parsed = assertSafeRemoteImageUrl(inputUrl);
  let targetUrl = parsed.toString();
  console.log(`Resolving reference image URL: ${targetUrl}`);

  // Use Facebook bot User-Agent for social platforms so Instagram/TikTok return static OpenGraph meta tags
  const isSocialPlatform = /instagram\.com|tiktok\.com|facebook\.com/i.test(targetUrl);
  const botUserAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchWithLimit(url, userAgent) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        redirect: 'manual',
        signal: controller.signal
      });
      // Follow a small number of redirects manually, re-validating each hop
      let current = response;
      let hops = 0;
      while ([301, 302, 303, 307, 308].includes(current.status) && hops < 3) {
        const loc = current.headers.get('location');
        if (!loc) break;
        const next = assertSafeRemoteImageUrl(new URL(loc, url).toString()).toString();
        current = await fetch(next, {
          headers: { 'User-Agent': userAgent },
          redirect: 'manual',
          signal: controller.signal
        });
        url = next;
        hops++;
      }
      return { response: current, finalUrl: url };
    } finally {
      clearTimeout(timer);
    }
  }

  let { response, finalUrl } = await fetchWithLimit(
    targetUrl,
    isSocialPlatform ? botUserAgent : browserUserAgent
  );
  targetUrl = finalUrl;

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  let contentType = response.headers.get('content-type') || '';

  // If page is HTML (e.g. Instagram/TikTok profile or web page), extract og:image or twitter:image
  if (contentType.includes('text/html')) {
    const htmlText = await response.text();
    if (Buffer.byteLength(htmlText, 'utf8') > MAX_BYTES) {
      throw new Error('Respuesta HTML demasiado grande.');
    }
    const ogMatch = htmlText.match(/<meta\s+[^>]*property=["']og:image(?::secure_url)?["']\s+[^>]*content=["']([^"']+)["']/i)
                 || htmlText.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+[^>]*property=["']og:image(?::secure_url)?["']/i);
    const twitterMatch = htmlText.match(/<meta\s+[^>]*name=["']twitter:image(?::src)?["']\s+[^>]*content=["']([^"']+)["']/i)
                      || htmlText.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+[^>]*name=["']twitter:image(?::src)?["']/i);
    // Instagram often embeds display_url / image_versions2 in inline JSON
    const displayUrlMatch = htmlText.match(/"display_url"\s*:\s*"(https:[^"]+)"/i)
                         || htmlText.match(/"thumbnail_src"\s*:\s*"(https:[^"]+)"/i)
                         || htmlText.match(/"og_image"\s*:\s*"(https:[^"]+)"/i);

    let extractedImage = (ogMatch && ogMatch[1]) || (twitterMatch && twitterMatch[1]) || (displayUrlMatch && displayUrlMatch[1]);
    if (extractedImage) {
      extractedImage = extractedImage.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      // Unescape HTML entities (e.g., &amp; -> &) which break CDN query parameters
      extractedImage = extractedImage.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      console.log(`Extracted OpenGraph/Twitter image URL from HTML page: ${extractedImage}`);

      if (extractedImage.startsWith('http')) {
        targetUrl = assertSafeRemoteImageUrl(extractedImage).toString();
      } else {
        const parsedBase = new URL(inputUrl);
        targetUrl = assertSafeRemoteImageUrl(new URL(extractedImage, parsedBase.origin).toString()).toString();
      }

      ({ response, finalUrl } = await fetchWithLimit(targetUrl, browserUserAgent));
      targetUrl = finalUrl;
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status} al descargar imagen extraída.`);
      }
      contentType = response.headers.get('content-type') || '';
    } else {
      throw new Error('La página no contiene una vista previa de imagen pública (og:image / twitter:image).');
    }
  }

  let ext = 'jpg';
  if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('webp')) ext = 'webp';

  const filename = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const relativePath = `assets/references/${filename}`;
  const absolutePath = path.join(__dirname, relativePath);

  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 15MB.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 15MB.');
  }

  try {
    await imageValidation.assertValidImageBuffer(buffer);
  } catch (err) {
    const e = new Error(err.message || 'La URL no apunta a una imagen válida.');
    e.code = err.code || 'INVALID_IMAGE';
    throw e;
  }

  fs.writeFileSync(absolutePath, buffer);

  // Sync reference image to scratch directory
  const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
  if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });
  fs.writeFileSync(path.join(scratchRefsDir, filename), buffer);

  return { relativePath, filename, buffer };
}

/**
 * Descarta archivos de un import preview (refs ref_* bajo assets/references o DATA_DIR).
 * No toca avatares por defecto ni rutas fuera de zona segura.
 */
app.post('/api/import-preview/discard', (req, res) => {
  const paths = Array.isArray(req.body?.imagePaths) ? req.body.imagePaths : [];
  const removed = [];
  const skipped = [];

  for (const rel of paths) {
    try {
      const abs = resolveSafeAssetPath(String(rel || ''));
      const base = path.basename(abs);
      if (!/^ref_/i.test(base)) {
        skipped.push(rel);
        continue;
      }
      if (/influencer_(male|female)/i.test(base) || /nano_banana/i.test(base)) {
        skipped.push(rel);
        continue;
      }
      if (fs.existsSync(abs) && fs.lstatSync(abs).isFile()) {
        fs.unlinkSync(abs);
        removed.push(rel);
      } else {
        skipped.push(rel);
      }
      const scratchCopy = path.join(SCRATCH_DIR, 'references', base);
      if (fs.existsSync(scratchCopy) && fs.lstatSync(scratchCopy).isFile()) {
        try { fs.unlinkSync(scratchCopy); } catch (_) {}
      }
    } catch (_) {
      skipped.push(rel);
    }
  }

  res.json({ success: true, removed, skipped });
});

app.post('/api/upload-reference-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'No se recibió ninguna URL.' });
  }

  try {
    const { relativePath, filename, buffer } = await downloadOrResolveImage(url);

    runGitBackup((gitSuccess, msg) => {
      res.json({
        success: true,
        filePath: relativePath,
        fileName: filename,
        originalName: 'url_download',
        size: buffer.length,
        gitSynced: gitSuccess,
        gitMessage: msg
      });
    });
  } catch (err) {
    console.error('Error downloading reference from URL:', err);
    const status = err.code === UNSAFE_URL ? 400 : 500;
    res.status(status).json({ success: false, message: `Error al descargar la imagen: ${err.message}` });
  }
});

/**
 * Asynchronously trigger background generation of 4 initial variants (2 traditional + 2 spicy)
 * using genQueue so the HTTP response returns immediately (<1s).
 */
async function triggerBackgroundVariants(persona) {
  if (!persona || !persona.id) return;

  const anchorSpecs = [
    {
      anchorType: 'front_portrait',
      title: 'Retrato de Frente',
      pose: 'Retrato de frente mirando directamente a cámara',
      clothing: persona.clothing || 'Atuendo casual cómodo',
      attitude: 'Expresión neutra y natural',
      setting: 'Estudio de fotografía minimalista',
      mode: 'anchor',
      framing: 'portrait'
    },
    {
      anchorType: 'profile_45',
      title: 'Perfil 45 Grados',
      pose: 'Retrato en ángulo de 3/4 a 45 grados de perfil',
      clothing: persona.clothing || 'Atuendo casual cómodo',
      attitude: 'Mirada en 3/4 suave',
      setting: 'Estudio de fotografía minimalista',
      mode: 'anchor',
      framing: 'portrait'
    },
    {
      anchorType: 'expression_wink',
      title: 'Expresión y Sonrisa',
      pose: 'Plano medio con sonrisa abierta y guiño de ojo espontáneo',
      clothing: persona.clothing || 'Atuendo casual cómodo',
      attitude: 'Alegre, divertida, expresiva',
      setting: 'Ambiente de luz natural',
      mode: 'anchor',
      framing: 'medium'
    },
    {
      anchorType: 'fullbody_studio',
      title: 'Cuerpo Completo',
      pose: 'Fotografía de cuerpo completo de pie en estudio',
      clothing: persona.clothing || 'Atuendo casual completo',
      attitude: 'Postura erguida y profesional',
      setting: 'Fondo de estudio neutro con luz uniforme',
      mode: 'anchor',
      framing: 'fullbody'
    }
  ];

  for (let i = 0; i < anchorSpecs.length; i++) {
    const spec = anchorSpecs[i];
    const label = `anchor_${spec.anchorType}_${persona.name || persona.id}`;

    genQueue.enqueue(label, async () => {
      const prompt = aiService.buildUnifiedMasterPrompt({
        name: persona.name || 'Influencer',
        age: persona.age || '25 años',
        gender: persona.gender || 'Female',
        ethnicity: persona.ethnicity || 'Latina',
        hair: persona.hair || 'dark brown wavy hair',
        skinTone: persona.skinTone || 'fair light',
        skinHex: persona.skinHex || '#f0d5c0',
        framing: spec.framing,
        clothing: spec.clothing,
        pose: spec.pose,
        setting: spec.setting,
        photoreal: true,
        identityLock: true
      });

      const referenceUrl = persona.image || null;
      const seed = Math.floor(Math.random() * 1000000);

      const imagePath = await aiService.generateInfluencerImage(prompt, referenceUrl, {
        photoreal: true,
        identityLock: true,
        seed,
        framing: spec.framing
      });

      if (imagePath) {
        const scored = await scoreVariantAgainstPersonaFn(consistencyScore, persona, imagePath);
        dbService.saveVariant({
          persona_id: persona.id,
          pose: spec.pose,
          clothing: spec.clothing,
          attitude: spec.attitude,
          setting: spec.setting,
          image_path: imagePath,
          consistency_distance: scored?.distance ?? null,
          consistency_grade: scored?.grade ?? null,
          consistency_anchor: scored?.consistency_anchor ?? null
        });

        dbService.saveGeneration({
          persona_id: persona.id,
          prompt,
          image_path: imagePath,
          generation_type: 'anchor_pack',
          metadata: JSON.stringify({
            ...spec,
            seed,
            consistency_distance: scored?.distance ?? null,
            consistency_grade: scored?.grade ?? null
          })
        });

        console.log(`[anchor-pack] Generated anchor ${i + 1}/4 (${spec.anchorType}) for ${persona.name}: ${imagePath}`);
      }
    }).catch(err => {
      console.warn(`[anchor-pack] Failed to generate anchor ${i + 1} for ${persona.name}:`, err.message);
    });
  }
}

_personaBg.trigger = triggerBackgroundVariants;

// Import Real Influencer (Fase 2) - supports both /api/import-influencer and /api/personas/import
app.post(['/api/import-influencer', '/api/personas/import'], upload.array('photo', 4), async (req, res) => {
  const imagePaths = [];
  const filenames = [];

  try {
    // 1. Process files upload
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const abs = path.join(__dirname, 'assets', 'references', file.filename);
        try {
          await imageValidation.assertValidImageFile(abs);
        } catch (valErr) {
          // Borrar el resto de archivos de este request que ya pasaron
          for (const f of req.files) {
            imageValidation.safeUnlink(path.join(__dirname, 'assets', 'references', f.filename));
          }
          return res.status(400).json({
            success: false,
            code: valErr.code || 'INVALID_IMAGE',
            message: valErr.message || 'El archivo no es una imagen válida.'
          });
        }
        filenames.push(file.filename);
        imagePaths.push(`assets/references/${file.filename}`);
      }
    } 
    
    // 2. Process remote image URL if provided (with robust error handling)
    if (req.body.imageUrl) {
      const url = req.body.imageUrl;
      try {
        const { relativePath, filename } = await downloadOrResolveImage(url);
        filenames.push(filename);
        imagePaths.push(relativePath);
        console.log(`Successfully downloaded remote reference image to: ${relativePath}`);
      } catch (urlErr) {
        console.warn(`Failed to fetch remote image URL ${url}, using fallback:`, urlErr.message);
      }
    }

    // 3. Fallback if no images were successfully loaded (generate unique AI portrait)
    // IMPORTANT: do NOT bias toward darker "Latina/morena" skin when we have no reference.
    let generatedWithoutReference = false;
    if (imagePaths.length === 0) {
      console.log('No reference photos or URLs could be loaded. Generating unique AI portrait with FAIR-SKIN default lock...');
      generatedWithoutReference = true;
      const isMale = req.body.gender === 'Male';
      const personaName = req.body.name || `Influencer_${Date.now().toString().slice(-4)}`;
      const ageStr = req.body.age || '25 años';
      const ethStr = req.body.ethnicity || 'Latina';

      // Fair-skin lock by default when reference missing — "Latina" alone makes models go darker
      const genPrompt = `High resolution realistic portrait of a ${ageStr} fair light-skinned ${ethStr} ${isMale ? 'male' : 'female'} influencer named ${personaName}, fair light beige porcelain-warm skin (#f0d5c0), NOT dark, NOT deep tan, NOT morena, attractive natural face, realistic skin texture with visible pores, professional portrait lighting, neutral background, 8k resolution. SKIN LOCK: fair light complexion only.`;
      try {
        const generatedImg = await aiService.generateInfluencerImage(genPrompt);
        if (generatedImg) {
          imagePaths.push(generatedImg);
          filenames.push(path.basename(generatedImg));
        }
      } catch (genErr) {
        console.warn('Failed to generate fallback portrait with AI, using avatar default:', genErr.message);
      }

      if (imagePaths.length === 0) {
        const defaultImg = isMale ? 'assets/influencer_male.png' : 'assets/influencer_female.png';
        imagePaths.push(defaultImg);
        filenames.push(path.basename(defaultImg));
      }
    }

    // 3. Optimize each image with sharp and sync to scratch
    const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
    if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });

    for (let i = 0; i < imagePaths.length; i++) {
      const imgPath = imagePaths[i];
      const filename = filenames[i];
      const fullPath = path.join(__dirname, imgPath);
      
      if (imgPath.startsWith('assets/references/')) {
        try {
          const tempPath = fullPath + '_opt.jpg';
          await sharp(fullPath)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toFile(tempPath);
          
          fs.renameSync(tempPath, fullPath);
          console.log(`Image optimized with sharp: ${imgPath}`);
        } catch (optErr) {
          // Ya validamos magic bytes arriba; si sharp falla al re-encode, no dejamos basura
          console.warn(`Failed to optimize image ${imgPath} with sharp:`, optErr.message);
          imageValidation.safeUnlink(fullPath);
          imageValidation.safeUnlink(fullPath + '_opt.jpg');
          return res.status(400).json({
            success: false,
            code: 'INVALID_IMAGE',
            message: 'No se pudo procesar la imagen. Usa JPG, PNG, WebP o GIF válido.'
          });
        }
      }

      // Sync to scratch
      try {
        fs.copyFileSync(fullPath, path.join(scratchRefsDir, filename));
      } catch (syncErr) {
        console.warn(`Failed to sync image ${filename} to scratch:`, syncErr.message);
      }
    }

    // 4. Perform analysis on multiple images
    console.log(`Analyzing imported influencer reference images:`, imagePaths);
    let analysis = await aiService.generateWithGeminiMulti(imagePaths);

    // If analysis fails or offline, use color extraction & heuristics fallback on the first image
    if (!analysis) {
      console.log('Using local heuristic analysis for imported influencer (Fallback)...');
      const primaryPath = imagePaths[0];
      // Light default skin (NOT medium tan #d2b48c / #e6c29e which caused morena drift)
      let colors = {
        hair: '#3d2314',
        skin: '#f0d5c0',
        dominant: '#e8e0d8',
        skinClass: aiService.classifySkinToneFromRgb({ r: 240, g: 213, b: 192 })
      };
      try {
        // Prefer REAL reference under assets/references; skip sampling AI-generated fallbacks when possible
        const isGeneratedFallback = /assets[\\/]+generated[\\/]+/i.test(primaryPath);
        if (!isGeneratedFallback || !generatedWithoutReference) {
          colors = await aiService.extractSpatialColorProperties(primaryPath);
        } else {
          console.warn('[import] Skipping color sample from AI-generated fallback image; using fair-skin defaults.');
        }
      } catch (ce) {
        console.warn('Spatial color extraction failed:', ce.message);
      }

      // Local heuristic classifier for hair
      let hairClass = 'Castaño Oscuro';
      const hairRgb = aiService.hexToRgb(colors.hair);
      if (hairRgb) {
        const { r, g, b } = hairRgb;
        if (r > 190 && g > 170 && b < 120) hairClass = 'Rubio';
        else if (r > 160 && g < 100 && b < 80) hairClass = 'Pelirrojo';
        else if (r < 60 && g < 60 && b < 60) hairClass = 'Negro';
        else if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 160) hairClass = 'Canoso';
      }

      const skinRgb = colors.skinRgb || aiService.hexToRgb(colors.skin);
      const skinInfo = colors.skinClass || aiService.classifySkinToneFromRgb(skinRgb);
      const skinClass = skinInfo.label || 'Piel clara / beige claro';
      const skinHex = colors.skin || '#f0d5c0';

      // Ethnicity: if skin is light, prefer "Latina de tez clara" so models don't auto-darken
      let ethnicity = req.body.ethnicity || 'Latina';
      if (skinInfo.band === 'very_light' || skinInfo.band === 'light' || skinInfo.band === 'light_warm') {
        if (/latina/i.test(ethnicity) && !/clara|fair|light/i.test(ethnicity)) {
          ethnicity = 'Latina de tez clara / Mediterránea clara';
        }
      }

      analysis = {
        identity: {
          name: req.body.name || `Influencer_${Date.now().toString().slice(-4)}`,
          gender: req.body.gender || "Female",
          apparent_age: req.body.age || "26 años",
          ethnicity_appearance: ethnicity,
          body_type: "Atlético / Proporcionado",
          persona_archetype: "Lifestyle & Bienestar"
        },
        body: {
          body_type: "Atlético / Proporcionado",
          height_appearance: "Estatura media (~1.65 m)",
          proportions: "Hombros equilibrados, cintura definida, caderas suaves y proporcionales",
          posture: "Erguida y relajada, hombros sueltos, cuello alargado",
          fitness_level: "Tono natural ligero, sin musculatura exagerada",
          shoulders: "Hombros suaves y naturales",
          waist_hip_balance: "Cintura y caderas en proporción armónica",
          limbs: "Brazos y piernas proporcionados al torso",
          hands: "Manos naturales con dedos finos",
          skin_continuity: `Mismo tono de piel (${skinClass}) en rostro, cuello, hombros y brazos`,
          visible_framing: "Plano medio con hombros y torso visibles (no solo close-up facial)"
        },
        facial_features: {
          face_shape: "ovalada",
          skin_tone: skinClass,
          skin_tone_hex: skinHex,
          skin_lock: skinInfo.lock,
          skin_avoid: skinInfo.avoid,
          skin_texture: "piel real con textura suave y poros naturales",
          eye_color: "marrón oscuro",
          eye_shape: "almendrados",
          eyebrow_style: "cejas naturales y delgadas",
          nose_shape: "recta y proporcionada",
          lip_shape: "labios proporcionados con arco definido",
          lip_color: "rosado natural",
          jawline: "suave",
          cheekbones: "pómulos definidos",
          facial_hair: "Ninguno",
          distinctive_marks: "Ninguno",
          smile_type: "sonrisa cálida y natural"
        },
        hair: {
          color: hairClass,
          color_hex: colors.hair,
          length: "medio-largo",
          texture: "ondulado natural",
          style: "suelto",
          parting: "en el medio",
          highlights: "ninguno",
          volume: "normal"
        },
        aesthetic: {
          overall_vibe: "casual chic y natural",
          fashion_style: "casual elegante",
          color_palette_dominant: colors.dominant,
          color_palette_description: "colores neutros y cálidos",
          makeup_level: "maquillaje natural ligero",
          accessories: "ninguno",
          nails: "naturales"
        },
        photography: {
          camera_lens: "cámara de smartphone",
          focal_length: "24mm",
          aperture: "f/1.8",
          lighting_type: "luz natural de día",
          lighting_direction: "frontal suave",
          color_grade: "colores naturales cálidos",
          color_temperature: "5500K",
          depth_of_field: "bokeh suave",
          background_setting: "interior de casa minimalista",
          background_blur: "ligero",
          composition: "plano medio con cara y torso visibles",
          framing: "plano medio (hombros y torso, no solo cara)",
          mood: "relajado y positivo",
          post_processing: "estilo orgánico"
        },
        clothing: {
          type: "camiseta casual",
          color: "blanco",
          material: "algodón",
          neckline: "cuello redondo",
          fit: "regular, se adapta a la silueta proporcionada",
          visible_brand_logos: "Ninguno"
        }
      };
    }

    // Prepare Persona model database columns (primary image is the first optimized image)
    const primaryImagePath = imagePaths[0];
    const personaName = req.body.name || analysis.identity.name || `Influencer_${Date.now().toString().slice(-4)}`;
    const profileId = req.session.profileId || resolveSessionProfile(req);
    const previewOnly = ['1', 'true', 'yes', 'on'].includes(
      String(req.body.previewOnly ?? req.query.previewOnly ?? '').toLowerCase()
    );
    const persona = {
      name: personaName,
      gender: req.body.gender || analysis.identity.gender || "Female",
      age: req.body.age || analysis.identity.apparent_age || "25 años",
      ethnicity: req.body.ethnicity || analysis.identity.ethnicity_appearance || "Latina",
      style: analysis.identity.persona_archetype || analysis.aesthetic.overall_vibe || "Lifestyle & UGC",
      hair: `${analysis.hair.length}, ${analysis.hair.texture}, color ${analysis.hair.color}`,
      lighting: analysis.photography.lighting_type,
      camera: analysis.photography.camera_lens,
      clothing: analysis.clothing.type,
      setting: analysis.photography.background_setting,
      image: primaryImagePath,
      imageUGC: primaryImagePath,
      handle: `@${personaName.toLowerCase().replace(/\s+/g, '')}_ugc`,
      detailedJSON: analysis,
      profile_id: profileId,
      forceCreate: true
    };

    // Generate UGC Video Scripts (works on draft payload; no DB id required)
    const scriptTopic = req.body.scriptTopic || "Video UGC Promocional";
    const videoScripts = await aiService.generateUgcVideoScripts(persona, scriptTopic);

    // 1.2 import confirm: previewOnly = analizar sin guardar ni encolar variantes
    if (previewOnly) {
      return res.json({
        success: true,
        preview: true,
        persona,
        videoScripts,
        imagePaths,
        gitSynced: false,
        message: 'Vista previa lista. Confirma para guardar en el portafolio.'
      });
    }

    // Save to SQLite (legacy / confirm-via-import path)
    const savedPersona = dbService.savePersona(persona);

    // Trigger 4 background variants asynchronously (non-blocking)
    triggerBackgroundVariants(savedPersona).catch(err => {
      console.warn('[import] Error enqueuing background variants:', err.message);
    });

    // Sync database and trigger Git auto-backup
    dbService.syncDbToWorkspace();
    runGitBackup((gitSuccess, msg) => {
      res.json({
        success: true,
        preview: false,
        persona: savedPersona,
        videoScripts,
        gitSynced: gitSuccess,
        gitMessage: msg
      });
    });

  } catch (err) {
    console.error('Error importing real influencer:', err);
    res.status(500).json({ success: false, message: `Error al importar influencer real: ${err.message}` });
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

module.exports = app;
