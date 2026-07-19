const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const archiver = require('archiver');
const dotenv = require('dotenv');
const sharp = require('sharp');

// Load environment variables
dotenv.config();

const dbService = require('./db');
const authService = require('./auth');
const aiService = require('./ai-service');

// Initialize DB and migrate legacy JSON data if empty
dbService.runMigrations();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(authService.sessionMiddleware);

// Serve static assets with no auth required
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve main app pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
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

// Git backup helper function
function runGitBackup(callback) {
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

// Auth Login
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (authService.verifyPin(pin)) {
    req.session.authenticated = true;
    res.json({ success: true, message: 'Sesión iniciada correctamente.' });
  } else {
    res.status(401).json({ success: false, message: 'PIN incorrecto. Inténtalo de nuevo.' });
  }
});

// API Connection Status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    apiConnected: aiService.isApiConnected(),
    gitLinked: fs.existsSync(path.join(__dirname, '.git')),
    pinRequired: !!process.env.STUDIO_PIN && process.env.STUDIO_PIN.trim() !== '',
    dataDir: dbService.getDataDir ? dbService.getDataDir() : DATA_DIR,
    dbPath: dbService.getDbPath ? dbService.getDbPath() : null
  });
});

// =============================================
// PROTECTED ENDPOINTS (requireAuth)
// =============================================

app.use('/api', authService.requireAuth);

// Get All Data (legacy fallback endpoint)
app.get('/api/data', (req, res) => {
  const personas = dbService.getAllPersonas();
  const products = dbService.getAllProducts();
  const generationStats = dbService.getGenerationStats();
  res.json({ personas, products, generationStats });
});

// Personas endpoints
app.get('/api/personas', (req, res) => {
  res.json(dbService.getAllPersonas());
});

app.post('/api/personas', (req, res) => {
  const body = req.body || {};
  const forceCreate = body.forceCreate === true || body.forceCreate === 1 || body.forceCreate === 'true';
  const isNew = forceCreate || !body.id;
  const persona = dbService.savePersona(body);
  if (isNew && persona && persona.id) {
    try {
      dbService.updateGenerationPersonaId('new_persona', persona.id);
    } catch (err) {
      console.warn('Failed to update generation history persona ID:', err.message);
    }
  }
  runGitBackup((gitSuccess, msg) => {
    res.json({
      success: true,
      personas: dbService.getAllPersonas(),
      persona,
      created: isNew,
      gitSynced: gitSuccess,
      gitMessage: msg
    });
  });
});

app.delete('/api/personas/:id', (req, res) => {
  dbService.deletePersona(req.params.id);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, personas: dbService.getAllPersonas(), gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Persona Archiving
app.post('/api/personas/:id/archive', (req, res) => {
  const { archived } = req.body;
  const persona = dbService.toggleArchivePersona(req.params.id, archived ? 1 : 0);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, personas: dbService.getAllPersonas(), persona, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Persona Variants endpoints
app.get('/api/personas/:id/variants', (req, res) => {
  res.json(dbService.getVariantsForPersona(req.params.id));
});

app.post('/api/personas/:id/variants', async (req, res) => {
  const { pose, clothing, attitude, setting } = req.body;
  let { prompt } = req.body;
  
  const persona = dbService.getPersonaById(req.params.id);
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

  // Deterministic seed from persona id if client didn't send one
  let seed = req.body.seed;
  if (seed == null && persona && persona.id) {
    let h = 2166136261;
    for (let i = 0; i < persona.id.length; i++) {
      h ^= persona.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    seed = (h >>> 0) % 1000000;
  }

  const framing = req.body.framing
    || (/full\s*body|cuerpo entero|head to toe|mirror selfie|standing full/i.test(`${pose} ${prompt}`)
      ? 'fullbody'
      : (/primer plano|close-up|portrait|rostro|headshot/i.test(`${pose} ${prompt}`) ? 'portrait' : 'medium'));

  aiService.generateInfluencerImage(prompt, referenceUrl, {
    photoreal,
    identityLock,
    seed,
    framing
  })
    .then(imagePath => {
      if (imagePath) {
        const variant = dbService.saveVariant({
          persona_id: req.params.id,
          pose,
          clothing,
          attitude,
          setting,
          image_path: imagePath
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
              referenceLocalPath
            })
          });
        } catch (histErr) {
          console.warn('Failed to save variant generation history:', histErr.message);
        }
        runGitBackup((gitSuccess, msg) => {
          res.json({ success: true, variant, variants: dbService.getVariantsForPersona(req.params.id), gitSynced: gitSuccess, gitMessage: msg });
        });
      } else {
        res.status(500).json({ success: false, message: 'La generación de la pose falló.' });
      }
    })
    .catch(err => {
      const status = err.status === 429 ? 429 : 500;
      res.status(status).json({
        success: false,
        message: err.message || 'La generación de la pose falló.',
        rateLimited: /429|rate limit|límite/i.test(err.message || '')
      });
    });
});

app.delete('/api/personas/:id/variants/:variantId', (req, res) => {
  dbService.deleteVariant(req.params.variantId);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, variants: dbService.getVariantsForPersona(req.params.id), gitSynced: gitSuccess, gitMessage: msg });
  });
});

app.post('/api/personas/:id/variants/:variantId/set-main', (req, res) => {
  const { imagePath } = req.body;
  const persona = dbService.setMainVariant(req.params.id, imagePath);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, personas: dbService.getAllPersonas(), persona, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Generate Character Bible
app.post('/api/personas/:id/character-bible', async (req, res) => {
  const { sceneDescription, options = {} } = req.body;
  const persona = dbService.getPersonaById(req.params.id);
  if (!persona) {
    return res.status(404).json({ success: false, message: 'Influencer no encontrado.' });
  }

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
app.get('/api/personas/:id/versions', (req, res) => {
  res.json(dbService.getVersionsForPersona(req.params.id));
});

app.post('/api/personas/:id/revert/:versionId', (req, res) => {
  const reverted = dbService.revertPersonaVersion(req.params.id, req.params.versionId);
  if (reverted) {
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, persona: reverted, gitSynced: gitSuccess, gitMessage: msg });
    });
  } else {
    res.status(404).json({ success: false, message: 'Versión no encontrada.' });
  }
});

// Products endpoints
app.get('/api/products', (req, res) => {
  res.json(dbService.getAllProducts());
});

app.post('/api/products', (req, res) => {
  const product = dbService.saveProduct(req.body);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, products: dbService.getAllProducts(), product, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Campaigns endpoints
app.get('/api/campaigns', (req, res) => {
  res.json(dbService.getAllCampaigns());
});

app.get('/api/campaigns/:id', (req, res) => {
  const c = dbService.getCampaignById(req.params.id);
  if (c) {
    res.json(c);
  } else {
    res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }
});

app.post('/api/campaigns', (req, res) => {
  const { campaign, personaIds } = req.body;
  const c = dbService.saveCampaign(campaign, personaIds);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, campaign: c, campaigns: dbService.getAllCampaigns(), gitSynced: gitSuccess, gitMessage: msg });
  });
});

app.delete('/api/campaigns/:id', (req, res) => {
  dbService.deleteCampaign(req.params.id);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, campaigns: dbService.getAllCampaigns(), gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Scripts endpoints
app.post('/api/campaigns/:id/scripts', (req, res) => {
  const saved = dbService.saveScripts(req.params.id, req.body.scripts);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, scripts: saved, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Gallery endpoints
app.get('/api/gallery', (req, res) => {
  res.json(dbService.getGalleryItems());
});

app.post('/api/gallery', (req, res) => {
  const { prompt, imagePath } = req.body;
  const item = dbService.saveToGallery(prompt, imagePath);
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, item, gitSynced: gitSuccess, gitMessage: msg });
  });
});

// Generation History endpoints
app.get('/api/personas/:id/generations', (req, res) => {
  try {
    const generations = dbService.getGenerationsForPersona(req.params.id);
    res.json({ success: true, generations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/generations/:id', (req, res) => {
  try {
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
  aiService.analyzeReferencePhoto(imagePath)
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
  const { prompt, referenceLocalPath } = req.body;
  
  let referenceUrl = null;
  if (referenceLocalPath && !referenceLocalPath.startsWith('http')) {
    try {
      referenceUrl = await aiService.uploadToTmpFiles(referenceLocalPath);
    } catch (e) {
      console.warn('Failed to upload reference photo for generation:', e);
    }
  }

  aiService.generateInfluencerImage(prompt, referenceUrl)
    .then(imagePath => {
      // Save to generation history
      try {
        dbService.saveGeneration({
          persona_id: req.body.personaId || 'unknown',
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
  const c = dbService.getCampaignById(req.params.id);
  if (!c) {
    return res.status(404).json({ success: false, message: 'Campaña no encontrada.' });
  }

  res.attachment(`campana_${c.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_export.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
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

// Upload reference photo endpoint
app.post('/api/upload-reference', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });
  }

  const relativePath = `assets/references/${req.file.filename}`;
  const absolutePath = path.join(__dirname, relativePath);

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
  let targetUrl = inputUrl;
  console.log(`Resolving reference image URL: ${targetUrl}`);

  // Use Facebook bot User-Agent for social platforms so Instagram/TikTok return static OpenGraph meta tags
  const isSocialPlatform = targetUrl.includes('instagram.com') || targetUrl.includes('tiktok.com') || targetUrl.includes('facebook.com');
  const botUserAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  let response = await fetch(targetUrl, {
    headers: {
      'User-Agent': isSocialPlatform ? botUserAgent : browserUserAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  let contentType = response.headers.get('content-type') || '';

  // If page is HTML (e.g. Instagram/TikTok profile or web page), extract og:image or twitter:image
  if (contentType.includes('text/html')) {
    const htmlText = await response.text();
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
        targetUrl = extractedImage;
      } else {
        const parsedBase = new URL(inputUrl);
        targetUrl = new URL(extractedImage, parsedBase.origin).toString();
      }

      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': browserUserAgent
        }
      });
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

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(absolutePath, buffer);

  // Sync reference image to scratch directory
  const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
  if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });
  fs.writeFileSync(path.join(scratchRefsDir, filename), buffer);

  return { relativePath, filename, buffer };
}

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
    res.status(500).json({ success: false, message: `Error al descargar la imagen: ${err.message}` });
  }
});

// Import Real Influencer (Fase 2)
app.post('/api/import-influencer', upload.array('photo', 4), async (req, res) => {
  const imagePaths = [];
  const filenames = [];

  try {
    // 1. Process files upload
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
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
          console.warn(`Failed to optimize image ${imgPath} with sharp, using original:`, optErr.message);
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
      detailedJSON: analysis
    };

    // Save to SQLite
    const savedPersona = dbService.savePersona(persona);

    // Generate UGC Video Scripts
    const scriptTopic = req.body.scriptTopic || "Video UGC Promocional";
    const videoScripts = await aiService.generateUgcVideoScripts(savedPersona, scriptTopic);

    // Sync database and trigger Git auto-backup
    dbService.syncDbToWorkspace();
    runGitBackup((gitSuccess, msg) => {
      res.json({
        success: true,
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

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
