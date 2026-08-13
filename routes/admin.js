/**
 * Admin routes (PLAN W5e) — profiles, invites, backups, settings.
 * Comportamiento idéntico al monolito; deps inyectadas desde server.js.
 * redeem es público (antes de requireAuth); el resto va tras requireAuth.
 */
'use strict';

const path = require('path');
const fs = require('fs');

function inviteStatus(inv) {
  if (!inv) return 'unknown';
  if (inv.revoked_at) return 'revoked';
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return 'expired';
  const maxUses = inv.max_uses == null ? 1 : Number(inv.max_uses);
  if (Number(inv.use_count || 0) >= maxUses) return 'used';
  return 'active';
}

/** Canje público de invitación → perfil member aislado (sin mezclar creaciones). */
function registerInviteRedeemRoute(app, deps) {
  const { dbService, authService, publicProfileDTO } = deps;

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
      authService.establishAuthenticatedSession(req, result.profile, (err) => {
        if (err) {
          console.error('[invites/redeem] session regenerate', err);
          return res.status(500).json({ success: false, message: 'No se pudo crear la sesión.' });
        }
        res.json({
          success: true,
          message: 'Invitación aceptada. Tu espacio está vacío y aislado del resto.',
          profile: publicProfileDTO(result.profile),
          pinIsDefault: false,
          csrfToken: authService.ensureCsrfToken(req.session)
        });
      });
    } catch (err) {
      authService.registerLoginFailure(req);
      res.status(400).json({ success: false, message: err.message });
    }
  });

}

function registerAdminRoutes(app, deps) {
  const {
    dbService,
    requireAdmin,
    publicProfileDTO,
    dataDir,
    rootDir = path.join(__dirname, '..'),
    createZipArchive = null
  } = deps;

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


  // Backups SQLite (solo Administración) — free path, sin cloud
  app.get('/api/backups', requireAdmin, (req, res) => {
    try {
      const meta = dbService.getBackupMeta();
      const keep = typeof dbService.getBackupKeepLimit === 'function'
        ? dbService.getBackupKeepLimit()
        : 10;
      const snapshots = dbService.listBackupSnapshots().map((s) => ({
        filename: s.filename,
        size: s.size,
        mtime: s.mtime
      }));
      res.json({
        success: true,
        schemaVersion: dbService.getSchemaVersion(),
        keep,
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
      try {
        dbService.recordAuditEvent({
          profile_id: req.session?.profileId || null,
          actor_profile_id: req.session?.profileId || null,
          action: 'backup.create',
          entity_type: 'backup',
          entity_id: path.basename(snap.dbPath),
          meta: { label, schemaVersion: snap.schemaVersion }
        });
      } catch (_) {}
      res.json({
        success: true,
        message: 'Backup creado en data/backups/.',
        snapshot: {
          filename: path.basename(snap.dbPath),
          dbPath: snap.dbPath,
          schemaVersion: snap.schemaVersion,
          createdAt: snap.createdAt,
          rotation: snap.rotation || null
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
      const abs = path.join(dataDir, 'backups', filename);
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
      const abs = path.join(dataDir, 'backups', filename);
      const resolved = path.resolve(abs);
      const backupsDir = path.resolve(path.join(dataDir, 'backups'));
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

  /**
   * W10 — Export studio completo (ZIP): data/ + assets/ + .env.example.
   * Nunca incluye `.env` (secretos). Solo Administración.
   */
  app.get('/api/export/studio', requireAdmin, (req, res) => {
    if (typeof createZipArchive !== 'function') {
      return res.status(500).json({ success: false, message: 'ZIP no disponible en este proceso.' });
    }
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.attachment(`influ_studio_export_${stamp}.zip`);

      const archive = createZipArchive({ zlib: { level: 9 } });
      archive.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: err.message });
        }
      });
      archive.pipe(res);

      const skipEnv = (entry) => {
        const base = path.basename(entry.name || '');
        if (base === '.env') return false;
        return entry;
      };

      if (dataDir && fs.existsSync(dataDir)) {
        archive.directory(dataDir, 'data', skipEnv);
      }

      const assetsDir = path.join(rootDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        archive.directory(assetsDir, 'assets', skipEnv);
      }

      const envExample = path.join(rootDir, '.env.example');
      if (fs.existsSync(envExample)) {
        archive.file(envExample, { name: '.env.example' });
      }

      archive.append(
        [
          'influ-JSON — export studio (cero costo)',
          '',
          'Contiene: data/ (SQLite + backups), assets/, .env.example',
          'NO contiene: .env (secretos). Copia .env.example → .env y ajusta PIN/claves.',
          'Tras restaurar data/, reinicia: npm start',
          ''
        ].join('\n'),
        { name: 'README_EXPORT.txt' }
      );

      try {
        dbService.recordAuditEvent({
          profile_id: req.session?.profileId || null,
          actor_profile_id: req.session?.profileId || null,
          action: 'studio.export',
          entity_type: 'studio',
          entity_id: `influ_studio_export_${stamp}.zip`,
          meta: { stamp }
        });
      } catch (_) {}

      archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  });

  // Settings Endpoint — Update API Keys in .env safely via GUI (solo Administración)
  app.post('/api/settings/keys', requireAdmin, (req, res) => {
    try {
      const firstRun = require('../first-run');
      const { geminiApiKey, replicateApiToken, pollinationsToken } = req.body || {};

      if (pollinationsToken !== undefined) {
        firstRun.upsertEnvVar('POLLINATIONS_TOKEN', String(pollinationsToken).trim());
      }
      if (geminiApiKey !== undefined) {
        firstRun.upsertEnvVar('GEMINI_API_KEY', String(geminiApiKey).trim());
      }
      if (replicateApiToken !== undefined) {
        firstRun.upsertEnvVar('REPLICATE_API_TOKEN', String(replicateApiToken).trim());
      }

      const pollenOn = !!(process.env.POLLINATIONS_TOKEN || process.env.POLLINATIONS_API_TOKEN || '').trim();
      res.json({
        success: true,
        message: 'Configuración de claves guardada correctamente.',
        pollinationsConnected: pollenOn,
        geminiConnected: !!process.env.GEMINI_API_KEY,
        replicateConnected: !!process.env.REPLICATE_API_TOKEN
      });
    } catch (err) {
      const status = err.code === 'ENV_VALUE_UNSAFE' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message, code: err.code || undefined });
    }
  });

  /** Estado enmascarado de claves (no devuelve secretos). */
  app.get('/api/settings/keys', requireAdmin, (req, res) => {
    try {
      const pollen = (process.env.POLLINATIONS_TOKEN || process.env.POLLINATIONS_API_TOKEN || '').trim();
      const gemini = (process.env.GEMINI_API_KEY || '').trim();
      const replicate = (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim();
      res.json({
        success: true,
        pollinationsConfigured: !!pollen,
        geminiConfigured: !!gemini,
        replicateConfigured: !!replicate
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * W7 — métricas locales de generación (solo Administración).
   * Member → 403. Query: ?sinceDays=30&profileId= (opcional).
   */
  app.get('/api/metrics/generations', requireAdmin, (req, res) => {
    try {
      const sinceDays = Number(req.query.sinceDays || 30);
      const profileId = req.query.profileId ? String(req.query.profileId) : null;
      const summary = dbService.getGenMetricsSummary({ profileId, sinceDays });
      res.json({
        success: true,
        freeTier: { imageGen: 'pollinations', note: 'provider_other = Replicate face-lock / LoRA pago (opt-in)' },
        summary
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * W17 — audit log local (solo Administración). Member → 403.
   * Query: ?limit=50
   */
  app.get('/api/audit/events', requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit || 50);
      const events = dbService.listAuditEvents({ limit });
      res.json({ success: true, events, limit: Math.max(1, Math.min(200, limit || 50)) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });


}

module.exports = {
  inviteStatus,
  registerInviteRedeemRoute,
  registerAdminRoutes
};
