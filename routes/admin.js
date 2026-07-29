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

}

function registerAdminRoutes(app, deps) {
  const {
    dbService,
    requireAdmin,
    publicProfileDTO,
    dataDir,
    rootDir = path.join(__dirname, '..')
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

  // Settings Endpoint — Update API Keys in .env safely via GUI (solo Administración)
  app.post('/api/settings/keys', requireAdmin, (req, res) => {
    try {
      const { geminiApiKey, replicateApiToken } = req.body || {};
      const envPath = path.join(rootDir, '.env');
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


}

module.exports = {
  inviteStatus,
  registerInviteRedeemRoute,
  registerAdminRoutes
};
