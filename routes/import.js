/**
 * Import + reference upload routes (PLAN W5d).
 * upload, discard preview, URL fetch, import-influencer, background anchors.
 * Comportamiento idéntico al monolito; deps inyectadas desde server.js.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

function registerImportRoutes(app, deps) {
  const {
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
    scoreVariantAgainstPersona,
    scratchDir,
    rootDir = path.join(__dirname, '..'),
    apiRateLimit = (_bucket) => (_req, _res, next) => next()
  } = deps;

  // Upload reference photo endpoint
  app.post('/api/upload-reference', apiRateLimit('heavy'), upload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });
    }

    const relativePath = `assets/references/${req.file.filename}`;
    const absolutePath = path.join(rootDir, relativePath);

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
    const scratchRefsDir = path.join(scratchDir, 'references');
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
    const absolutePath = path.join(rootDir, relativePath);

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
    const scratchRefsDir = path.join(scratchDir, 'references');
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
        const scratchCopy = path.join(scratchDir, 'references', base);
        if (fs.existsSync(scratchCopy) && fs.lstatSync(scratchCopy).isFile()) {
          try { fs.unlinkSync(scratchCopy); } catch (_) {}
        }
      } catch (_) {
        skipped.push(rel);
      }
    }

    res.json({ success: true, removed, skipped });
  });

  app.post('/api/upload-reference-url', apiRateLimit('heavy'), async (req, res) => {
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

    let facePackApi = null;
    try { facePackApi = require('../face-pack'); } catch (_) { facePackApi = null; }

    const anchorSpecs = facePackApi
      ? facePackApi.buildAnchorSpecsForPersona(persona)
      : [
          {
            anchorType: 'front',
            title: 'Frontal',
            pose: 'Frontal portrait, looking directly at camera',
            clothing: persona.clothing || 'Atuendo casual cómodo',
            attitude: 'Expresión neutra y natural',
            setting: 'Estudio de fotografía minimalista',
            mode: 'anchor',
            framing: 'portrait'
          }
        ];

    for (let i = 0; i < anchorSpecs.length; i++) {
      const spec = anchorSpecs[i];
      const label = `anchor_${spec.anchorType}_${persona.name || persona.id}`;

      genQueue.enqueue(label, async () => {
        const hints = spec._lockHints || {};
        const prompt = aiService.buildUnifiedMasterPrompt({
          name: hints.name || persona.name || 'Influencer',
          age: persona.age || '25 años',
          gender: persona.gender || 'Female',
          ethnicity: persona.ethnicity || 'Latina',
          hair: persona.hair || 'dark brown wavy hair',
          skinTone: hints.skin_tone || persona.skinTone || 'fair light',
          skinHex: hints.skin_tone_hex || persona.skinHex || '#f0d5c0',
          framing: spec.framing,
          clothing: spec.clothing,
          pose: spec.pose,
          setting: spec.setting,
          photoreal: true,
          identityLock: true,
          facialAsymmetry: hints.facial_asymmetry || null,
          distinctiveMarks: hints.distinctive_marks || null
        });

        const referenceUrl = persona.image || null;
        const seed = Math.floor(Math.random() * 1000000);

        const imagePath = await aiService.generateInfluencerImage(prompt, referenceUrl, {
          photoreal: true,
          identityLock: true,
          seed,
          framing: spec.framing,
          personaId: persona.id
        });

        if (imagePath) {
          const scored = await scoreVariantAgainstPersona(consistencyScore, persona, imagePath);
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
              anchorType: spec.anchorType,
              title: spec.title,
              pose: spec.pose,
              clothing: spec.clothing,
              attitude: spec.attitude,
              setting: spec.setting,
              mode: spec.mode,
              framing: spec.framing,
              short: spec.short,
              seed,
              consistency_distance: scored?.distance ?? null,
              consistency_grade: scored?.grade ?? null
            })
          });

          console.log(`[face-pack] Generated ${i + 1}/${anchorSpecs.length} (${spec.anchorType}) for ${persona.name}: ${imagePath}`);
        }
      }).catch(err => {
        console.warn(`[face-pack] Failed slot ${i + 1} (${spec.anchorType}) for ${persona.name}:`, err.message);
      });
    }
  }


  // Import Real Influencer (Fase 2) - supports both /api/import-influencer and /api/personas/import
  app.post(['/api/import-influencer', '/api/personas/import'], upload.array('photo', 4), async (req, res) => {
    const imagePaths = [];
    const filenames = [];

    try {
      // 1. Process files upload
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const abs = path.join(rootDir, 'assets', 'references', file.filename);
          try {
            await imageValidation.assertValidImageFile(abs);
          } catch (valErr) {
            // Borrar el resto de archivos de este request que ya pasaron
            for (const f of req.files) {
              imageValidation.safeUnlink(path.join(rootDir, 'assets', 'references', f.filename));
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
      const scratchRefsDir = path.join(scratchDir, 'references');
      if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });

      for (let i = 0; i < imagePaths.length; i++) {
        const imgPath = imagePaths[i];
        const filename = filenames[i];
        const fullPath = path.join(rootDir, imgPath);
      
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


  return { triggerBackgroundVariants, downloadOrResolveImage };
}

module.exports = { registerImportRoutes };
