/**
 * Personas routes (PLAN W5c) — CRUD + variants + versions + license + export.
 * Comportamiento idéntico al monolito; deps inyectadas desde server.js.
 */
'use strict';

const path = require('path');
const fs = require('fs');


/** dHash ancla↔variante (gratis). No bloquea si falla. Usado por variantes y anchors. */
async function scoreVariantAgainstPersona(consistencyScore, persona, imagePath) {
  const anchor = persona?.image || null;
  if (!anchor || !imagePath) return null;
  if (String(anchor) === String(imagePath)) {
    return { distance: 0, grade: 'ok', consistency_anchor: anchor };
  }
  try {
    const score = await consistencyScore.scoreAgainstAnchor(anchor, imagePath);
    return {
      distance: score.distance,
      grade: score.grade,
      consistency_anchor: anchor
    };
  } catch (err) {
    console.warn('[consistency] score skipped:', err.message);
    return null;
  }
}

/**
 * @param {import('express').Express} app
 * @param {object} deps
 */
function registerPersonasRoutes(app, deps) {
  const {
    dbService,
    aiService,
    consistencyScore,
    requireOwnedPersona,
    resolveSessionProfile,
    runGitBackup,
    triggerBackgroundVariants,
    createZipArchive,
    rootDir = path.join(__dirname, '..')
  } = deps;

  const scoreVariant = (persona, imagePath) =>
    scoreVariantAgainstPersona(consistencyScore, persona, imagePath);

  // Personas endpoints
  app.get('/api/personas', (req, res) => {
    const profileId = req.session.profileId || resolveSessionProfile(req);
    res.json(dbService.getAllPersonas(profileId));
  });

  app.post('/api/personas', (req, res) => {
    const body = req.body || {};
    const forceCreate = body.forceCreate === true || body.forceCreate === 1 || body.forceCreate === 'true';
    const isNew = forceCreate || !body.id;
    const profileId = req.session.profileId || resolveSessionProfile(req);

    // Update: no permitir reescribir personas de otro perfil
    if (!isNew && body.id) {
      const owned = dbService.assertPersonaOwnedBy(body.id, profileId);
      if (!owned) {
        return res.status(404).json({ success: false, message: 'Influencer no encontrado.' });
      }
    }

    const persona = dbService.savePersona({ ...body, profile_id: profileId });
    const lockRevision = persona?.lockRevision || null;
    if (persona && persona.lockRevision) delete persona.lockRevision;
    if (isNew && persona && persona.id) {
      try {
        dbService.updateGenerationPersonaId('new_persona', persona.id);
      } catch (err) {
        console.warn('Failed to update generation history persona ID:', err.message);
      }
      triggerBackgroundVariants(persona).catch(err => {
        console.warn('[personas] Error triggering background variants:', err.message);
      });
    }
    runGitBackup((gitSuccess, msg) => {
      res.json({
        success: true,
        personas: dbService.getAllPersonas(profileId),
        persona,
        created: isNew,
        lockRevision,
        gitSynced: gitSuccess,
        gitMessage: msg
      });
    });
  });

  app.delete('/api/personas/:id', requireOwnedPersona, (req, res) => {
    const profileId = req.profileId;
    dbService.deletePersona(req.params.id);
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, personas: dbService.getAllPersonas(profileId), gitSynced: gitSuccess, gitMessage: msg });
    });
  });

  // Persona Archiving
  app.post('/api/personas/:id/archive', requireOwnedPersona, (req, res) => {
    const profileId = req.profileId;
    const { archived } = req.body;
    const persona = dbService.toggleArchivePersona(req.params.id, archived ? 1 : 0);
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, personas: dbService.getAllPersonas(profileId), persona, gitSynced: gitSuccess, gitMessage: msg });
    });
  });

  // W12 — Historial character_lock
  app.get('/api/personas/:id/lock-revisions', requireOwnedPersona, (req, res) => {
    try {
      const profileId = req.profileId;
      const revisions = dbService.listCharacterLockRevisions(req.params.id, profileId);
      if (revisions === null) {
        return res.status(404).json({ success: false, message: 'Influencer no encontrado.' });
      }
      res.json({ success: true, revisions });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/personas/:id/lock-revisions/:revId', requireOwnedPersona, (req, res) => {
    try {
      const profileId = req.profileId;
      const rev = dbService.getCharacterLockRevision(req.params.id, req.params.revId, profileId);
      if (!rev) {
        return res.status(404).json({ success: false, message: 'Revisión no encontrada.' });
      }
      const currentLock = dbService.extractCharacterLock(req.persona.detailedJSON);
      let diff = null;
      try {
        const CharacterLockValidator = require('../character-lock-validator');
        diff = CharacterLockValidator.diffCharacterLocks(rev.lock, currentLock);
      } catch (_) {}
      res.json({ success: true, revision: rev, currentLock, diff });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/personas/:id/lock-revisions/:revId/restore', requireOwnedPersona, (req, res) => {
    try {
      const profileId = req.profileId;
      const persona = dbService.restoreCharacterLockRevision(req.params.id, req.params.revId, profileId);
      if (!persona) {
        return res.status(404).json({ success: false, message: 'No se pudo restaurar la revisión.' });
      }
      runGitBackup((gitSuccess, msg) => {
        res.json({
          success: true,
          persona,
          personas: dbService.getAllPersonas(profileId),
          lockRevision: persona.lockRevision || null,
          gitSynced: gitSuccess,
          gitMessage: msg
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Persona Variants endpoints
  app.get('/api/personas/:id/variants', requireOwnedPersona, (req, res) => {
    res.json(dbService.getVariantsForPersona(req.params.id));
  });

  /**
   * Recalcula dHash ancla↔variante (gratis, local). Señal de composición/color, no face-lock.
   */
  app.post('/api/personas/:id/consistency/rescore', requireOwnedPersona, async (req, res) => {
    try {
      const persona = req.persona;
      const anchor = persona.image || null;
      if (!anchor) {
        return res.status(400).json({
          success: false,
          message: 'La persona no tiene imagen ancla para comparar.'
        });
      }
      const variants = dbService.getVariantsForPersona(persona.id) || [];
      const onlyMissing = req.body?.onlyMissing === true;
      const updated = [];
      for (const v of variants) {
        if (onlyMissing && v.consistency_distance != null) {
          updated.push(v);
          continue;
        }
        if (!v.image_path) continue;
        try {
          const score = await consistencyScore.scoreAgainstAnchor(anchor, v.image_path);
          const row = dbService.updateVariantConsistency(v.id, {
            distance: score.distance,
            grade: score.grade,
            anchor
          });
          updated.push(row);
        } catch (err) {
          console.warn(`[consistency] rescore failed for ${v.id}:`, err.message);
          updated.push(v);
        }
      }
      const summary = consistencyScore.summarizeScores(updated);
      res.json({
        success: true,
        variants: updated,
        summary,
        note: 'Señal grosera de composición/color — no es face-lock.'
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/personas/:id/consistency/summary', requireOwnedPersona, (req, res) => {
    const variants = dbService.getVariantsForPersona(req.params.id) || [];
    res.json({
      success: true,
      summary: consistencyScore.summarizeScores(variants),
      note: 'Señal grosera de composición/color — no es face-lock.'
    });
  });

  // Persona Anchor Pack endpoint (4 official face anchor reference photos)
  app.get('/api/personas/:id/anchor-pack', requireOwnedPersona, (req, res) => {
    try {
      const persona = req.persona;
      const variants = dbService.getVariantsForPersona(req.params.id) || [];
      const history = dbService.getGenerationsForPersona(req.params.id) || [];

      const anchors = history.filter(h => h.generation_type === 'anchor_pack');

      res.json({
        success: true,
        personaId: req.params.id,
        personaName: persona ? persona.name : 'Influencer',
        mainImage: persona ? persona.image : null,
        anchors: anchors.length > 0 ? anchors : variants.slice(0, 4)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/personas/:id/variants', requireOwnedPersona, async (req, res) => {
    const { pose, clothing, attitude, setting } = req.body;
    let { prompt } = req.body;
  
    const persona = req.persona;
    // ALWAYS prefer main portrait as face DNA (same for traditional + spicy)
    // Do not use a previous spicy/variant image as anchor or faces diverge.
    let referenceLocalPath = (persona && persona.image) ? persona.image : null;
    if (persona && persona.detailedJSON) {
      try {
        let d = persona.detailedJSON;
        if (typeof d === 'string') d = JSON.parse(d);
        if (typeof d === 'string') d = JSON.parse(d);
        if (!referenceLocalPath && d && d.anchor_reference) {
          referenceLocalPath = d.anchor_reference;
        }
        // Server-side skin lock reinforcement
        const f = (d && d.facial_features) || {};
        const skinHex = f.skin_tone_hex;
        const skinTone = f.skin_tone || '';
        if (prompt && (skinHex || /clara|fair|porcelana|beige claro/i.test(skinTone))) {
          const skinInfo = aiService.classifySkinToneFromRgb(aiService.hexToRgb(skinHex || '#f0d5c0'));
          if (!/SKIN LOCK/i.test(prompt)) {
            prompt += `. ${aiService.buildSkinLockFragment(skinTone || skinInfo.label, skinHex || '#f0d5c0', skinInfo)}`;
          }
        }
      } catch (e) {}
    }
  
    let referenceUrl = null;
    if (referenceLocalPath && !referenceLocalPath.startsWith('http')) {
      try {
        referenceUrl = await aiService.uploadToTmpFiles(referenceLocalPath);
        console.log(`[variant] Face anchor: ${referenceLocalPath}`);
      } catch (e) {
        console.warn('Failed to upload variant reference photo:', e);
      }
    }
  
    const photoreal = req.body.photoreal === true
      || req.body.mode === 'spicy'
      || req.body.mode === 'traditional'
      || /latex|látex|catsuit|vinyl|PHOTOREALISM|IDENTITY LOCK/i.test(prompt || '');
    const identityLock = req.body.identityLock === true || /IDENTITY LOCK/i.test(prompt || '');

    // Dynamic seed per generation request to prevent Pollinations cache duplication
    let seed = req.body.seed;
    if (seed == null) {
      seed = Math.floor(Math.random() * 1000000);
    }

    const framing = req.body.framing
      || (/full\s*body|full-body|cuerpo entero|cuerpo completo|de cuerpo entero|de cuerpo completo|bikini completo|head to toe|mirror selfie|standing full/i.test(`${pose} ${prompt}`)
        ? 'fullbody'
        : (/primer plano|close-up|portrait|rostro|headshot/i.test(`${pose} ${prompt}`) ? 'portrait' : 'medium'));

    const t0 = Date.now();
    const profileId = req.profileId || req.session?.profileId;
    aiService.generateInfluencerImage(prompt, referenceUrl, {
      photoreal,
      identityLock,
      seed,
      framing
    })
      .then(async (imagePath) => {
        const durationMs = Date.now() - t0;
        if (imagePath) {
          const scored = await scoreVariant(persona, imagePath);
          const variant = dbService.saveVariant({
            persona_id: req.params.id,
            pose,
            clothing,
            attitude,
            setting,
            image_path: imagePath,
            consistency_distance: scored?.distance ?? null,
            consistency_grade: scored?.grade ?? null,
            consistency_anchor: scored?.consistency_anchor ?? null
          });
          // Save to generation history
          try {
            dbService.saveGeneration({
              persona_id: req.params.id,
              prompt,
              image_path: imagePath,
              generation_type: 'variant',
              metadata: JSON.stringify({
                pose: req.body.pose,
                clothing: req.body.clothing,
                attitude: req.body.attitude,
                setting: req.body.setting,
                mode: req.body.mode || null,
                photoreal,
                identityLock,
                seed,
                framing,
                referenceLocalPath,
                consistency_distance: scored?.distance ?? null,
                consistency_grade: scored?.grade ?? null
              })
            });
          } catch (histErr) {
            console.warn('Failed to save variant generation history:', histErr.message);
          }
          try {
            dbService.recordGenMetric({
              profile_id: profileId,
              persona_id: req.params.id,
              provider: 'pollinations',
              generation_type: 'variant',
              ok: true,
              duration_ms: durationMs
            });
          } catch (mErr) {
            console.warn('[gen-metrics]', mErr.message);
          }
          runGitBackup((gitSuccess, msg) => {
            res.json({ success: true, variant, variants: dbService.getVariantsForPersona(req.params.id), gitSynced: gitSuccess, gitMessage: msg });
          });
        } else {
          try {
            dbService.recordGenMetric({
              profile_id: profileId,
              persona_id: req.params.id,
              provider: 'pollinations',
              generation_type: 'variant',
              ok: false,
              error_code: 'empty',
              duration_ms: durationMs
            });
          } catch (_) {}
          res.status(500).json({ success: false, message: 'La generación de la pose falló.' });
        }
      })
      .catch(err => {
        const durationMs = Date.now() - t0;
        const status = err.status === 429 ? 429 : 500;
        const is429 = status === 429 || /429|rate limit|límite/i.test(err.message || '');
        try {
          dbService.recordGenMetric({
            profile_id: profileId,
            persona_id: req.params.id,
            provider: 'pollinations',
            generation_type: 'variant',
            ok: false,
            error_code: is429 ? '429' : 'error',
            duration_ms: durationMs
          });
        } catch (_) {}
        res.status(status).json({
          success: false,
          message: err.message || 'La generación de la pose falló.',
          rateLimited: is429
        });
      });
  });

  app.delete('/api/personas/:id/variants/:variantId', requireOwnedPersona, (req, res) => {
    dbService.deleteVariant(req.params.variantId);
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, variants: dbService.getVariantsForPersona(req.params.id), gitSynced: gitSuccess, gitMessage: msg });
    });
  });

  app.post('/api/personas/:id/variants/:variantId/set-main', requireOwnedPersona, (req, res) => {
    const profileId = req.profileId;
    const { imagePath } = req.body;
    const persona = dbService.setMainVariant(req.params.id, imagePath);
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, personas: dbService.getAllPersonas(profileId), persona, gitSynced: gitSuccess, gitMessage: msg });
    });
  });

  // Generate Character Bible
  app.post('/api/personas/:id/character-bible', requireOwnedPersona, async (req, res) => {
    const { sceneDescription, options = {} } = req.body;
    const persona = req.persona;

    // Use referenceUrl only if explicitly provided in options
    const referenceUrl = options.referenceUrl || "";

    try {
      const characterBible = await aiService.generateDetailedCharacterPrompt(
        persona,
        sceneDescription,
        { ...options, referenceUrl }
      );
      res.json({ success: true, characterBible });
    } catch (err) {
      console.error('Error generating character bible:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Persona Versions & Revert
  app.get('/api/personas/:id/versions', requireOwnedPersona, (req, res) => {
    res.json(dbService.getVersionsForPersona(req.params.id));
  });

  app.post('/api/personas/:id/revert/:versionId', requireOwnedPersona, (req, res) => {
    const reverted = dbService.revertPersonaVersion(req.params.id, req.params.versionId);
    if (reverted) {
      runGitBackup((gitSuccess, msg) => {
        res.json({ success: true, persona: reverted, gitSynced: gitSuccess, gitMessage: msg });
      });
    } else {
      res.status(404).json({ success: false, message: 'Versión no encontrada.' });
    }
  });


  // Commercial License & Intellectual Property Compliance (Idea 4)
  app.get('/api/personas/:id/commercial-license', requireOwnedPersona, (req, res) => {
    try {
      const persona = req.persona;

      const license = {
        licenseId: `LIC-INFLU-${persona.id.substring(0, 8).toUpperCase()}`,
        issuedAt: new Date().toISOString(),
        personaName: persona.name,
        ethnicity: persona.ethnicity || 'Latina',
        age: persona.age || '25 años',
        status: 'VERIFIED_VIRTUAL_INFLUENCER_IP',
        rightsHolder: req.query.brand || 'Dropshipping Master Brand LLC',
        platformsCompliant: ['Meta Business Manager', 'TikTok Shop', 'Instagram Ads', 'YouTube Shorts'],
        disclosureRequired: 'Synthetic Interpreter Disclosure (NY State Compliant)',
        masterSeed: Array.from(String(persona.id)).reduce((a, b) => a + b.charCodeAt(0), 0)
      };

      res.json({ success: true, license });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // Generation History endpoints
  app.get('/api/personas/:id/generations', requireOwnedPersona, (req, res) => {
    try {
      const generations = dbService.getGenerationsForPersona(req.params.id);
      res.json({ success: true, generations });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  /**
   * 2.5–2.6 — Export pack ZIP por persona (character_lock + packs free + imágenes + licencia).
   * ?kit=1 → kit marca (+ guión UGC 15s + COMO_USAR_KIT). Free path.
   */
  app.get('/api/export/persona/:id', requireOwnedPersona, (req, res) => {
    try {
      const persona = req.persona;
      const brandKit = require('../brand-kit');
      const asKit = String(req.query.kit || '') === '1' || String(req.query.kit || '').toLowerCase() === 'true';

      const safeName = String(persona.name || 'influencer')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'influencer';

      res.attachment(asKit ? `${safeName}_brand_kit.zip` : `${safeName}_influ_pack.zip`);

      const archive = createZipArchive({ zlib: { level: 9 } });
      archive.on('error', (err) => {
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
      });
      archive.pipe(res);

      const { files, lock } = brandKit.buildBrandKitFiles(persona);

      if (asKit) {
        files.forEach((f) => archive.append(f.content, { name: f.name }));
      } else {
        files.forEach((f) => {
          if (f.name === 'guion_ugc_15s.txt') return;
          if (f.name === 'COMO_USAR_KIT.txt') {
            archive.append(f.content.replace('KIT MARCA (cero costo)', 'pack exportado (cero costo)'), { name: 'README.txt' });
            return;
          }
          archive.append(f.content, { name: f.name });
        });
      }

      // Images
      const addImageIfExists = (relPath, zipName) => {
        if (!relPath) return;
        const abs = path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath);
        if (fs.existsSync(abs)) {
          archive.file(abs, { name: `imagenes/${zipName}` });
        }
      };
      addImageIfExists(persona.image, `ancla_${path.basename(persona.image || 'main.jpg')}`);
      addImageIfExists(persona.imageUGC, `ugc_${path.basename(persona.imageUGC || 'ugc.jpg')}`);

      const variants = dbService.getVariantsForPersona(persona.id) || [];
      variants.slice(0, 24).forEach((v, i) => {
        addImageIfExists(v.image_path, `variante_${String(i + 1).padStart(2, '0')}_${path.basename(v.image_path || 'v.jpg')}`);
      });

      const license = {
        licenseId: `LIC-INFLU-${String(persona.id).substring(0, 8).toUpperCase()}`,
        issuedAt: new Date().toISOString(),
        personaName: persona.name,
        ethnicity: persona.ethnicity || 'Latina',
        age: persona.age || '25 años',
        status: 'VERIFIED_VIRTUAL_INFLUENCER_IP',
        rightsHolder: req.query.brand || 'Dropshipping Master Brand LLC',
        platformsCompliant: ['Meta Business Manager', 'TikTok Shop', 'Instagram Ads', 'YouTube Shorts'],
        disclosureRequired: 'Synthetic Interpreter Disclosure (NY State Compliant)',
        characterLockVersion: lock?.version || 1
      };
      archive.append(JSON.stringify(license, null, 2), { name: 'licencia.json' });

      archive.finalize();
    } catch (err) {
      console.error('[export/persona]', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || 'Error al exportar pack.' });
      }
    }
  });


  return { scoreVariantAgainstPersona: scoreVariant };
}

module.exports = {
  registerPersonasRoutes,
  scoreVariantAgainstPersona
};
