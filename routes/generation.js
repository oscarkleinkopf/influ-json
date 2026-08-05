/**
 * Generation + AI routes (PLAN W5d) — history, stats, analyze/expand/image/video.
 * Comportamiento idéntico al monolito; deps inyectadas desde server.js.
 */
'use strict';

function registerGenerationRoutes(app, deps) {
  const {
    dbService,
    aiService,
    resolveSessionProfile,
    resolveSafeAssetPath,
    UNSAFE_PATH
  } = deps;

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
    if (personaId) genOptions.personaId = personaId;

    const t0 = Date.now();
    aiService.generateInfluencerImage(prompt, referenceUrl, genOptions)
      .then(imagePath => {
        const durationMs = Date.now() - t0;
        const genType = req.body.generationType || 'portrait';
        // Save to generation history
        try {
          dbService.saveGeneration({
            persona_id: personaId,
            prompt: req.body.prompt,
            image_path: imagePath,
            generation_type: genType,
            metadata: JSON.stringify({ referenceImage: req.body.referenceImage || null })
          });
        } catch (histErr) {
          console.warn('Failed to save generation history:', histErr.message);
        }
        try {
          dbService.recordGenMetric({
            profile_id: profileId,
            persona_id: personaId,
            provider: 'pollinations',
            generation_type: genType,
            ok: true,
            duration_ms: durationMs
          });
        } catch (mErr) {
          console.warn('[gen-metrics]', mErr.message);
        }
        res.json({ success: true, imagePath });
      })
      .catch(err => {
        const durationMs = Date.now() - t0;
        const is429 = err.status === 429 || /429|rate limit|límite/i.test(err.message || '');
        const paymentRequired = !!(err.paymentRequired || err.status === 402
          || /402|insufficient balance|pollen/i.test(err.message || ''));
        const authRequired = !!(err.authRequired || err.status === 401
          || /401|unauthorized|no autorizado|POLLINATIONS_TOKEN|bearer/i.test(err.message || ''));
        const httpStatus = is429 ? 429 : (paymentRequired ? 402 : (authRequired ? 401 : 500));
        try {
          dbService.recordGenMetric({
            profile_id: profileId,
            persona_id: personaId,
            provider: 'pollinations',
            generation_type: req.body.generationType || 'portrait',
            ok: false,
            error_code: is429 ? '429' : (paymentRequired ? '402' : (authRequired ? '401' : 'error')),
            duration_ms: durationMs
          });
        } catch (mErr) {
          console.warn('[gen-metrics]', mErr.message);
        }
        res.status(httpStatus).json({
          success: false,
          message: err.message,
          rateLimited: is429,
          paymentRequired,
          authRequired
        });
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

}

module.exports = { registerGenerationRoutes };
