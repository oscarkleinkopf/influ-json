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
    const persona = req.persona;
    const actorId = req.session?.profileId || profileId;
    try {
      dbService.recordAuditEvent({
        profile_id: persona?.profile_id || profileId,
        actor_profile_id: actorId,
        action: 'persona.delete',
        entity_type: 'persona',
        entity_id: req.params.id,
        meta: { name: persona?.name || null }
      });
    } catch (_) {}
    dbService.deletePersona(req.params.id);
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, personas: dbService.getAllPersonas(profileId), gitSynced: gitSuccess, gitMessage: msg });
    });
  });

  // Persona Archiving
  app.post('/api/personas/:id/archive', requireOwnedPersona, (req, res) => {
    const profileId = req.profileId;
    const { archived } = req.body;
    const willArchive = !!archived;
    const persona = dbService.toggleArchivePersona(req.params.id, willArchive ? 1 : 0);
    try {
      dbService.recordAuditEvent({
        profile_id: persona?.profile_id || profileId,
        actor_profile_id: req.session?.profileId || profileId,
        action: willArchive ? 'persona.archive' : 'persona.unarchive',
        entity_type: 'persona',
        entity_id: req.params.id,
        meta: { name: persona?.name || null, archived: willArchive ? 1 : 0 }
      });
    } catch (_) {}
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
    const preferFaceLock = req.body.preferFaceLock === true;
    aiService.generateInfluencerImage(prompt, referenceUrl, {
      photoreal,
      identityLock,
      seed,
      framing,
      personaId: persona.id,
      preferFaceLock,
      referenceLocalPath,
      faceImagePath: referenceLocalPath
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
                preferFaceLock,
                consistency_distance: scored?.distance ?? null,
                consistency_grade: scored?.grade ?? null
              })
            });
          } catch (histErr) {
            console.warn('Failed to save variant generation history:', histErr.message);
          }
          try {
            const imageProvider = require('../image-provider');
            dbService.recordGenMetric({
              profile_id: profileId,
              persona_id: req.params.id,
              provider: imageProvider.inferProviderFromImagePath(imagePath),
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
        const is429 = err.status === 429 || /429|rate limit|límite/i.test(err.message || '');
        const paymentRequired = !!(err.paymentRequired || err.status === 402
          || /402|insufficient balance|pollen/i.test(err.message || ''));
        const authRequired = !!(err.authRequired || err.status === 401
          || /401|unauthorized|no autorizado|POLLINATIONS_TOKEN|bearer/i.test(err.message || ''));
        const httpStatus = is429 ? 429 : (paymentRequired || authRequired ? 402 : 500);
        try {
          dbService.recordGenMetric({
            profile_id: profileId,
            persona_id: req.params.id,
            provider: 'pollinations',
            generation_type: 'variant',
            ok: false,
            error_code: is429 ? '429' : (paymentRequired ? '402' : (authRequired ? '401' : 'error')),
            duration_ms: durationMs
          });
        } catch (_) {}
        res.status(httpStatus).json({
          success: false,
          message: err.message || 'La generación de la pose falló.',
          rateLimited: is429,
          paymentRequired,
          authRequired
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

      try {
        dbService.recordAuditEvent({
          profile_id: persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.export',
          entity_type: 'persona',
          entity_id: persona.id,
          meta: { name: persona.name || null, kit: asKit }
        });
      } catch (_) {}

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


  /**
   * Fase L / L0 — Pack de entrenamiento LoRA (dataset + captions).
   * Free path: no entrena ni requiere GPU/token/pago; solo empaqueta imágenes del
   * vault (ancla + variantes) con captions derivados del `character_lock` para
   * entrenar una LoRA de personaje en Colab gratis / self-host.
   */
  app.get('/api/export/persona/:id/lora', requireOwnedPersona, (req, res) => {
    try {
      const persona = req.persona;
      const loraPack = require('../lora-pack');
      const variants = dbService.getVariantsForPersona(persona.id) || [];
      const pack = loraPack.buildLoraPack(persona, variants);

      try {
        dbService.recordAuditEvent({
          profile_id: persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.export_lora_pack',
          entity_type: 'persona',
          entity_id: persona.id,
          meta: { name: persona.name || null, images: pack.count, trigger: pack.triggerToken }
        });
      } catch (_) {}

      const safeName = String(persona.name || 'influencer')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'influencer';

      res.attachment(`${safeName}_lora_pack.zip`);

      const archive = createZipArchive({ zlib: { level: 9 } });
      archive.on('error', (err) => {
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
      });
      archive.pipe(res);

      // Archivos de texto (README, config, character_lock, trigger)
      pack.textFiles.forEach((f) => archive.append(f.content, { name: f.name }));

      // Dataset: imagen + caption con el mismo basename (convención kohya/ai-toolkit)
      pack.datasetItems.forEach((item) => {
        const abs = path.isAbsolute(item.srcRelPath)
          ? item.srcRelPath
          : path.join(rootDir, item.srcRelPath);
        if (fs.existsSync(abs)) {
          archive.file(abs, { name: `dataset/${item.imageName}` });
          archive.append(`${item.caption}\n`, { name: `dataset/${item.captionName}` });
        }
      });

      archive.finalize();
    } catch (err) {
      console.error('[export/persona/lora-pack]', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || 'Error al exportar pack LoRA.' });
      }
    }
  });

  /**
   * Fase L / L2 — Estado LoRA de la persona (opt-in ComfyUI).
   * Sin pesos / sin COMFYUI_URL → status none; gen sigue por Pollinations.
   */
  app.get('/api/personas/:id/lora', requireOwnedPersona, async (req, res) => {
    try {
      const imageProvider = require('../image-provider');
      const comfyui = require('../comfyui-client');
      const row = dbService.getPersonaLora(req.persona.id);
      let comfy = { configured: comfyui.isConfigured(), reachable: false };
      if (comfy.configured) {
        const ping = await comfyui.ping();
        comfy.reachable = !!ping.ok;
        comfy.reason = ping.reason || null;
      }
      const caps = imageProvider.getProviderCapabilities();
      res.json({
        success: true,
        lora: row || {
          persona_id: req.persona.id,
          status: 'none',
          trigger_token: null,
          base_model: null,
          weights_path: null
        },
        comfyui: comfy,
        paidLora: caps.paidLora,
        localTrain: caps.localTrain,
        capabilities: caps.lora
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * Fase L / L3 — Entrenar LoRA en Replicate (pago, opt-in).
   * Body JSON: { confirmPaid: true, steps?, destination?, triggerToken? }
   * Requiere ENABLE_PAID_LORA=1 + token. Empaqueta dataset del vault → Files API → training.
   */
  app.post('/api/personas/:id/lora/train', requireOwnedPersona, async (req, res) => {
    try {
      const paidLora = require('../paid-lora');
      const loraPack = require('../lora-pack');
      if (!paidLora.isPaidLoraEnabled()) {
        return res.status(400).json({
          success: false,
          message: 'Trainer pago desactivado. Configura ENABLE_PAID_LORA=1, REPLICATE_API_TOKEN y REPLICATE_USERNAME (docs/lora/L3_PAID.md). El path gratis (Colab L1) sigue disponible.'
        });
      }
      const body = req.body || {};
      if (body.confirmPaid !== true && body.confirmPaid !== 'true' && body.confirmPaid !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Confirma el costo: envía confirmPaid:true. Esto gasta crédito en Replicate.'
        });
      }

      const persona = req.persona;
      const variants = dbService.getVariantsForPersona(persona.id) || [];
      const pack = loraPack.buildLoraPack(persona, variants);
      if (pack.count < 4) {
        return res.status(400).json({
          success: false,
          message: `Se recomiendan ≥4–8 imágenes coherentes (tienes ${pack.count}). Genera más variantes o usa Colab (L1) gratis.`
        });
      }

      const zipBuf = await loraPack.buildDatasetZipBuffer(pack, {
        createZipArchive,
        rootDir
      });
      const uploaded = await paidLora.uploadTrainingZip(zipBuf, `${pack.triggerToken}_dataset.zip`);
      const trigger = (body.triggerToken || body.trigger_token || pack.triggerToken || '').trim();
      const training = await paidLora.startLoraTraining({
        inputImagesUrl: uploaded.url,
        triggerWord: trigger,
        destination: body.destination || null,
        steps: body.steps != null ? Number(body.steps) : null,
        modelName: body.modelName || `influ-${String(persona.id).slice(0, 8)}`
      });

      const existing = dbService.getPersonaLora(persona.id);
      let meta = {};
      try {
        if (existing?.training_meta) meta = JSON.parse(existing.training_meta);
      } catch (_) {}
      meta.provider = 'replicate';
      meta.training_id = training.id;
      meta.training_status = training.status;
      meta.destination = training.destination || body.destination || null;
      meta.dataset_url = uploaded.url;
      meta.dataset_file_id = uploaded.id;
      meta.started_at = new Date().toISOString();

      const row = dbService.upsertPersonaLora({
        personaId: persona.id,
        triggerToken: trigger,
        baseModel: body.baseModel || 'flux-dev',
        weightsPath: existing?.weights_path || null,
        status: 'training',
        trainingMeta: meta
      });

      try {
        dbService.recordAuditEvent({
          profile_id: persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.lora_train_paid',
          entity_type: 'persona',
          entity_id: persona.id,
          meta: { training_id: training.id, trigger }
        });
      } catch (_) {}

      res.json({
        success: true,
        lora: row,
        training: {
          id: training.id,
          status: training.status,
          urls: training.urls || null
        },
        warning: 'Esto es un servicio de pago externo. El path free (JSON + Colab + Pollinations) no depende de este paso.'
      });
    } catch (err) {
      console.error('[personas/lora/train]', err);
      res.status(500).json({ success: false, message: err.message || 'Error al iniciar entrenamiento pago' });
    }
  });

  /**
   * Sincroniza estado del training Replicate → persona_loras.
   * También acepta link manual: { replicateModelVersion: "owner/name:hash" }.
   */
  app.post('/api/personas/:id/lora/sync', requireOwnedPersona, async (req, res) => {
    try {
      const paidLora = require('../paid-lora');
      const body = req.body || {};
      const existing = dbService.getPersonaLora(req.persona.id);
      let meta = {};
      try {
        if (existing?.training_meta) meta = JSON.parse(existing.training_meta);
      } catch (_) {}

      // Manual link (después de entrenar en la web de Replicate)
      const manual = (body.replicateModelVersion || body.replicate_model_version || '').trim();
      if (manual) {
        meta.provider = meta.provider || 'replicate';
        meta.replicate_model_version = manual;
        const row = dbService.upsertPersonaLora({
          personaId: req.persona.id,
          triggerToken: body.triggerToken || existing?.trigger_token || null,
          baseModel: existing?.base_model || 'flux-dev',
          weightsPath: existing?.weights_path || null,
          status: 'ready',
          trainingMeta: meta
        });
        return res.json({ success: true, lora: row, linked: true });
      }

      const trainingId = body.trainingId || meta.training_id;
      if (!trainingId) {
        return res.status(400).json({
          success: false,
          message: 'No hay training_id. Inicia /lora/train o pasa replicateModelVersion para vincular un modelo ya entrenado.'
        });
      }
      if (!paidLora.getToken()) {
        return res.status(400).json({ success: false, message: 'REPLICATE_API_TOKEN requerido para sincronizar.' });
      }

      const training = await paidLora.getTraining(trainingId);
      const status = paidLora.mapTrainingStatus(training);
      meta.training_id = trainingId;
      meta.training_status = training.status;
      meta.last_sync_at = new Date().toISOString();
      if (training.error) meta.training_error = training.error;

      const modelVer = paidLora.extractModelVersion(training);
      if (modelVer) meta.replicate_model_version = modelVer;
      if (training.destination) meta.destination = training.destination;

      const row = dbService.upsertPersonaLora({
        personaId: req.persona.id,
        triggerToken: existing?.trigger_token || null,
        baseModel: existing?.base_model || 'flux-dev',
        weightsPath: existing?.weights_path || null,
        status,
        trainingMeta: meta
      });

      res.json({
        success: true,
        lora: row,
        training: {
          id: training.id,
          status: training.status,
          output: training.output || null,
          error: training.error || null
        }
      });
    } catch (err) {
      console.error('[personas/lora/sync]', err);
      res.status(500).json({ success: false, message: err.message || 'Error al sincronizar LoRA' });
    }
  });

  /**
   * Fase L / L5 — Entrenar LoRA en GPU local (opt-in).
   * Body JSON: { confirmLocal: true, materializeOnly?: bool, triggerToken?, steps? }
   * Requiere ENABLE_LOCAL_LORA_TRAIN=1. Materializa pack L0 a DATA_DIR/loras/<id>/train_jobs/.
   * Si hay LOCAL_LORA_TRAIN_CMD o AI_TOOLKIT_DIR → spawn; si no o materializeOnly → dataset_ready.
   */
  app.post('/api/personas/:id/lora/train-local', requireOwnedPersona, async (req, res) => {
    try {
      const localTrain = require('../local-train');
      const loraPack = require('../lora-pack');
      if (!localTrain.isLocalTrainEnabled()) {
        return res.status(400).json({
          success: false,
          message: 'Train local desactivado. Configura ENABLE_LOCAL_LORA_TRAIN=1 (docs/lora/L5_LOCAL_TRAIN.md). Preferí Colab L1 si no tenés GPU.'
        });
      }
      const body = req.body || {};
      if (body.confirmLocal !== true && body.confirmLocal !== 'true' && body.confirmLocal !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Confirma: envía confirmLocal:true. Esto usa tu GPU / proceso local (no es el path free JSON).'
        });
      }

      const persona = req.persona;
      const variants = dbService.getVariantsForPersona(persona.id) || [];
      const pack = loraPack.buildLoraPack(persona, variants);
      if (pack.count < 4) {
        return res.status(400).json({
          success: false,
          message: `Se recomiendan ≥4–8 imágenes coherentes (tienes ${pack.count}). Genera más variantes o usa Colab (L1) gratis.`
        });
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const workDir = path.join(localTrain.personaTrainRoot(persona.id), stamp);
      const materialized = localTrain.materializePack(pack, { rootDir, workDir });

      const trigger = (body.triggerToken || body.trigger_token || pack.triggerToken || '').trim();
      const existing = dbService.getPersonaLora(persona.id);
      let meta = {};
      try {
        if (existing?.training_meta) meta = JSON.parse(existing.training_meta);
      } catch (_) {}
      meta.provider = 'local';
      meta.work_dir = materialized.workDir;
      meta.config_abs = materialized.configAbs;
      meta.output_abs = materialized.outputAbs;
      meta.dataset_images = materialized.imageCount;
      meta.started_at = new Date().toISOString();

      const materializeOnly = body.materializeOnly === true
        || body.materializeOnly === 'true'
        || body.materializeOnly === 1
        || !localTrain.canSpawnTrainer();

      if (materializeOnly) {
        meta.mode = 'materialize_only';
        meta.hint = 'Ejecutá ai-toolkit a mano sobre configAbs, luego sync-local o registrá el .safetensors (L2).';
        const row = dbService.upsertPersonaLora({
          personaId: persona.id,
          triggerToken: trigger,
          baseModel: body.baseModel || 'flux-dev',
          weightsPath: existing?.weights_path || null,
          status: 'dataset_ready',
          trainingMeta: meta
        });
        try {
          dbService.recordAuditEvent({
            profile_id: persona?.profile_id || req.profileId,
            actor_profile_id: req.session?.profileId || req.profileId,
            action: 'persona.lora_train_local_materialize',
            entity_type: 'persona',
            entity_id: persona.id,
            meta: { work_dir: workDir, images: materialized.imageCount }
          });
        } catch (_) {}
        return res.json({
          success: true,
          lora: row,
          job: {
            mode: 'materialize_only',
            workDir: materialized.workDir,
            configAbs: materialized.configAbs,
            imageCount: materialized.imageCount
          },
          warning: 'Pack materializado. Sin spawn (falta CMD/AI_TOOLKIT_DIR o pediste materializeOnly). Colab L1 sigue siendo el path free con GPU en la nube.'
        });
      }

      const started = localTrain.startTrainProcess({
        personaId: persona.id,
        workDir: materialized.workDir,
        configAbs: materialized.configAbs,
        triggerToken: trigger
      });
      meta.mode = 'spawn';
      meta.pid = started.pid;
      meta.command = started.commandPreview;

      const row = dbService.upsertPersonaLora({
        personaId: persona.id,
        triggerToken: trigger,
        baseModel: body.baseModel || 'flux-dev',
        weightsPath: existing?.weights_path || null,
        status: 'training',
        trainingMeta: meta
      });

      try {
        dbService.recordAuditEvent({
          profile_id: persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.lora_train_local',
          entity_type: 'persona',
          entity_id: persona.id,
          meta: { pid: started.pid, work_dir: workDir }
        });
      } catch (_) {}

      res.json({
        success: true,
        lora: row,
        job: {
          mode: 'spawn',
          pid: started.pid,
          workDir: started.workDir,
          command: started.commandPreview
        },
        warning: 'Entrenamiento local iniciado. Pulsá «Sincronizar train local» cuando termine. El path free (JSON + Pollinations) no depende de esto.'
      });
    } catch (err) {
      console.error('[personas/lora/train-local]', err);
      res.status(500).json({ success: false, message: err.message || 'Error al iniciar train local' });
    }
  });

  /**
   * Sincroniza job local → persona_loras (ready/failed/training).
   * Si el proceso terminó OK y hay .safetensors en output/, los promueve a DATA_DIR/loras/.
   */
  app.post('/api/personas/:id/lora/sync-local', requireOwnedPersona, (req, res) => {
    try {
      const localTrain = require('../local-train');
      if (!localTrain.isLocalTrainEnabled()) {
        return res.status(400).json({
          success: false,
          message: 'Train local desactivado (ENABLE_LOCAL_LORA_TRAIN=1).'
        });
      }
      const existing = dbService.getPersonaLora(req.persona.id);
      let meta = {};
      try {
        if (existing?.training_meta) meta = JSON.parse(existing.training_meta);
      } catch (_) {}

      const outputAbs = meta.output_abs || null;
      const poll = localTrain.pollTrainJob(req.persona.id, { outputAbs });
      // Si no hay job en memoria pero hay work_dir materializado, buscar pesos ahí
      if (!poll.weightsAbs && meta.output_abs) {
        const found = localTrain.findLatestWeights(meta.output_abs);
        if (found) poll.weightsAbs = found;
      }
      if (!poll.workDir && meta.work_dir) poll.workDir = meta.work_dir;

      let status = localTrain.mapLocalTrainStatus(poll);
      // Materialize-only: si el usuario dejó pesos en output a mano → ready
      if (existing?.status === 'dataset_ready' && poll.weightsAbs) {
        status = 'ready';
      } else if (
        (existing?.status === 'dataset_ready' || meta.mode === 'materialize_only')
        && !poll.running
        && poll.exitCode == null
        && !poll.weightsAbs
      ) {
        status = 'dataset_ready';
      }

      meta.last_sync_at = new Date().toISOString();
      meta.local_exit_code = poll.exitCode;
      meta.local_running = poll.running;
      if (poll.logTail?.length) meta.log_tail = poll.logTail;

      let weightsPath = existing?.weights_path || null;
      if (status === 'ready' && poll.weightsAbs) {
        const promoted = localTrain.promoteWeights(
          req.persona.id,
          poll.weightsAbs,
          { destName: `${existing?.trigger_token || 'persona'}_flux_lora.safetensors` }
        );
        weightsPath = promoted.weightsRel;
        meta.comfy_lora_name = promoted.destName;
        meta.weights_src = poll.weightsAbs;
      }
      if (status === 'failed' && poll.exitCode != null && poll.exitCode !== 0) {
        meta.training_error = `Proceso local salió con código ${poll.exitCode}`;
      }
      if (status === 'failed' && poll.exitCode === 0 && !poll.weightsAbs) {
        meta.training_error = 'Proceso OK pero no se encontró .safetensors en output/';
      }

      const row = dbService.upsertPersonaLora({
        personaId: req.persona.id,
        triggerToken: existing?.trigger_token || null,
        baseModel: existing?.base_model || 'flux-dev',
        weightsPath,
        status,
        trainingMeta: meta
      });

      res.json({
        success: true,
        lora: row,
        job: {
          running: poll.running,
          exitCode: poll.exitCode,
          pid: poll.pid,
          workDir: poll.workDir,
          weightsFound: !!poll.weightsAbs
        }
      });
    } catch (err) {
      console.error('[personas/lora/sync-local]', err);
      res.status(500).json({ success: false, message: err.message || 'Error al sincronizar train local' });
    }
  });

  /**
   * Registrar pesos LoRA (.safetensors) para inferencia ComfyUI.
   * multipart field `weights` O JSON { triggerToken, baseModel, comfyLoraName, copyOnly }.
   * Si solo metadata sin archivo y ya hay weights_path, actualiza trigger/status.
   */
  app.post('/api/personas/:id/lora', requireOwnedPersona, (req, res, next) => {
    const uploadMw = deps.uploadLora;
    if (!uploadMw) return next();
    // Solo aplicar multer si Content-Type es multipart; JSON puro actualiza metadata
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('multipart/form-data')) return next();
    uploadMw.single('weights')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Upload inválido' });
      }
      next();
    });
  }, (req, res) => {
    try {
      const { DATA_DIR, ensureDir } = require('../paths');
      const persona = req.persona;
      const body = req.body || {};
      const triggerToken = (body.triggerToken || body.trigger_token || '').trim() || null;
      const baseModel = (body.baseModel || body.base_model || '').trim() || null;
      const comfyLoraName = (body.comfyLoraName || body.comfy_lora_name || '').trim() || null;
      const statusIn = (body.status || '').trim();

      const personaLoraDir = path.join(DATA_DIR, 'loras', persona.id);
      ensureDir(personaLoraDir);

      let weightsRel = null;
      let storedName = null;

      if (req.file && req.file.path) {
        const orig = req.file.originalname || 'persona.safetensors';
        const safe = String(orig).replace(/[^a-zA-Z0-9._-]/g, '_');
        const destName = safe.toLowerCase().endsWith('.safetensors') ? safe : `${safe}.safetensors`;
        const destAbs = path.join(personaLoraDir, destName);
        fs.renameSync(req.file.path, destAbs);
        weightsRel = path.join('loras', persona.id, destName).replace(/\\/g, '/');
        storedName = destName;

        // Copia opcional al directorio models/loras de ComfyUI y/o A1111/Forge
        const comfyLorasDir = (process.env.COMFYUI_LORAS_DIR || '').trim();
        if (comfyLorasDir) {
          ensureDir(comfyLorasDir);
          fs.copyFileSync(destAbs, path.join(comfyLorasDir, destName));
        }
        const a1111LorasDir = (process.env.A1111_LORAS_DIR || process.env.FORGE_LORAS_DIR || '').trim();
        if (a1111LorasDir) {
          ensureDir(a1111LorasDir);
          fs.copyFileSync(destAbs, path.join(a1111LorasDir, destName));
        }
      }

      const existing = dbService.getPersonaLora(persona.id);
      if (!weightsRel && !existing?.weights_path && statusIn !== 'none') {
        return res.status(400).json({
          success: false,
          message: 'Sube un archivo .safetensors (campo multipart `weights`) o registra pesos existentes.'
        });
      }

      const meta = {};
      try {
        if (existing?.training_meta) {
          Object.assign(meta, JSON.parse(existing.training_meta));
        }
      } catch (_) {}
      if (comfyLoraName) meta.comfy_lora_name = comfyLoraName;
      else if (storedName) meta.comfy_lora_name = storedName;
      if (body.loraStrength != null) meta.lora_strength = Number(body.loraStrength);

      const nextStatus = statusIn
        || (weightsRel || existing?.weights_path ? 'ready' : 'none');

      const row = dbService.upsertPersonaLora({
        personaId: persona.id,
        triggerToken: triggerToken || existing?.trigger_token || null,
        baseModel: baseModel || existing?.base_model || null,
        weightsPath: weightsRel || existing?.weights_path || null,
        status: nextStatus,
        trainingMeta: meta
      });

      try {
        dbService.recordAuditEvent({
          profile_id: persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.lora_register',
          entity_type: 'persona',
          entity_id: persona.id,
          meta: { status: row.status, weights_path: row.weights_path }
        });
      } catch (_) {}

      res.json({ success: true, lora: row });
    } catch (err) {
      console.error('[personas/lora POST]', err);
      res.status(500).json({ success: false, message: err.message || 'Error al registrar LoRA' });
    }
  });

  app.delete('/api/personas/:id/lora', requireOwnedPersona, (req, res) => {
    try {
      const { DATA_DIR } = require('../paths');
      const existing = dbService.getPersonaLora(req.persona.id);
      if (existing?.weights_path) {
        const abs = path.isAbsolute(existing.weights_path)
          ? existing.weights_path
          : path.join(DATA_DIR, existing.weights_path);
        try {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (_) {}
      }
      dbService.clearPersonaLora(req.persona.id);
      try {
        dbService.recordAuditEvent({
          profile_id: req.persona?.profile_id || req.profileId,
          actor_profile_id: req.session?.profileId || req.profileId,
          action: 'persona.lora_clear',
          entity_type: 'persona',
          entity_id: req.persona.id
        });
      } catch (_) {}
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });


  return { scoreVariantAgainstPersona: scoreVariant };
}

module.exports = {
  registerPersonasRoutes,
  scoreVariantAgainstPersona
};
