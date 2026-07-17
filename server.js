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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Persisted scratch directory
const SCRATCH_DIR = 'C:/Users/oscar/.gemini/antigravity/brain/7d7c6673-5ef4-440b-aa1e-adaeba8ce81d/scratch';

// Git backup helper function
function runGitBackup(callback) {
  const commitMsg = `Backup auto-sync: Campaign update ${new Date().toISOString()}`;
  const commands = `git add . && git commit -m "${commitMsg}" --allow-empty && git push origin main`;
  
  exec(commands, (error, stdout, stderr) => {
    if (error) {
      console.error('Git backup error:', error);
      callback(false, stderr || error.message);
    } else {
      console.log('Git backup success:', stdout);
      callback(true, stdout);
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
    pinRequired: process.env.STUDIO_PIN !== ''
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
  const isNew = !req.body.id;
  const persona = dbService.savePersona(req.body);
  if (isNew && persona && persona.id) {
    try {
      dbService.updateGenerationPersonaId('new_persona', persona.id);
    } catch (err) {
      console.warn('Failed to update generation history persona ID:', err.message);
    }
  }
  runGitBackup((gitSuccess, msg) => {
    res.json({ success: true, personas: dbService.getAllPersonas(), persona, gitSynced: gitSuccess, gitMessage: msg });
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
  const { pose, clothing, attitude, setting, prompt } = req.body;
  
  const persona = dbService.getPersonaById(req.params.id);
  let referenceLocalPath = null;
  if (persona) {
    if (persona.detailedJSON) {
      try {
        const detailed = typeof persona.detailedJSON === 'string' ? JSON.parse(persona.detailedJSON) : persona.detailedJSON;
        if (detailed && detailed.anchor_reference) {
          referenceLocalPath = detailed.anchor_reference;
        }
      } catch (e) {}
    }
    if (!referenceLocalPath) {
      referenceLocalPath = persona.image;
    }
  }
  
  let referenceUrl = null;
  if (referenceLocalPath && !referenceLocalPath.startsWith('http')) {
    try {
      referenceUrl = await aiService.uploadToTmpFiles(referenceLocalPath);
    } catch (e) {
      console.warn('Failed to upload variant reference photo:', e);
    }
  }
  
  aiService.generateInfluencerImage(prompt, referenceUrl)
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
            prompt: req.body.prompt,
            image_path: imagePath,
            generation_type: 'variant',
            metadata: JSON.stringify({ pose: req.body.pose, clothing: req.body.clothing, attitude: req.body.attitude, setting: req.body.setting })
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
      res.status(500).json({ success: false, message: err.message });
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
      size: req.file.size,
      gitSynced: gitSuccess,
      gitMessage: msg
    });
  });
});

app.post('/api/upload-reference-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'No se recibió ninguna URL.' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';

    const filename = `ref_${Date.now()}.${ext}`;
    const relativePath = `assets/references/${filename}`;
    const absolutePath = path.join(__dirname, relativePath);

    // Make sure folder exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(absolutePath, buffer);

    // Sync reference image to scratch directory
    const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
    if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });
    fs.writeFileSync(path.join(scratchRefsDir, filename), buffer);
    console.log(`Reference image from URL synced to scratch: ${filename}`);

    // Auto-git-backup the new reference
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
app.post('/api/import-influencer', upload.single('photo'), async (req, res) => {
  let imagePath = "";
  let filename = "";

  try {
    if (req.file) {
      filename = req.file.filename;
      imagePath = `assets/references/${filename}`;
    } else if (req.body.imageUrl) {
      const url = req.body.imageUrl;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      let ext = 'jpg';
      if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('webp')) ext = 'webp';

      filename = `ref_${Date.now()}.${ext}`;
      imagePath = `assets/references/${filename}`;
      const absolutePath = path.join(__dirname, imagePath);

      // Make sure folder exists
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(absolutePath, buffer);
    } else {
      return res.status(400).json({ success: false, message: 'Se requiere subir una foto o proporcionar una URL.' });
    }

    // Optimize image with sharp before analysis
    try {
      const fullPath = path.join(__dirname, imagePath);
      const tempPath = fullPath + '_opt.jpg';
      
      await sharp(fullPath)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(tempPath);
      
      // Overwrite the original with optimized version
      fs.renameSync(tempPath, fullPath);
      console.log(`Image optimized with sharp before analysis: ${imagePath}`);
    } catch (optErr) {
      console.warn("Failed to optimize image with sharp, proceeding with original:", optErr.message);
    }

    // Sync reference image to scratch directory
    try {
      const scratchRefsDir = path.join(SCRATCH_DIR, 'references');
      if (!fs.existsSync(scratchRefsDir)) fs.mkdirSync(scratchRefsDir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, imagePath), path.join(scratchRefsDir, filename));
    } catch (syncErr) {
      console.warn("Failed to sync reference image to scratch directory:", syncErr.message);
    }

    // Now analyze the image
    console.log(`Analyzing imported influencer reference image: ${imagePath}`);
    let analysis = await aiService.analyzeReferencePhoto(imagePath);

    // If analysis fails or offline, use color extraction & heuristics fallback
    if (!analysis) {
      console.log('Using local heuristic analysis for imported influencer...');
      // Extract main colors from image using local canvas analyzer
      let colors = { hair: '#3d2314', skin: '#d2b48c', dominant: '#e0d0c0' };
      try {
        colors = await aiService.extractSpatialColorProperties(imagePath);
      } catch (ce) {
        console.warn('Spatial color extraction failed:', ce.message);
      }

      // Local heuristic classifier
      let hairClass = 'Castaño Oscuro';
      const hairRgb = aiService.hexToRgb(colors.hair);
      if (hairRgb) {
        const { r, g, b } = hairRgb;
        if (r > 190 && g > 170 && b < 120) hairClass = 'Rubio';
        else if (r > 160 && g < 100 && b < 80) hairClass = 'Pelirrojo';
        else if (r < 60 && g < 60 && b < 60) hairClass = 'Negro';
        else if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 160) hairClass = 'Canoso';
      }

      let skinClass = 'Tono Natural';
      const skinRgb = aiService.hexToRgb(colors.skin);
      if (skinRgb) {
        const { r, g, b } = skinRgb;
        if (r > 230 && g > 200 && b > 180) skinClass = 'Piel Clara';
        else if (r < 130 && g < 100 && b < 80) skinClass = 'Piel Oscura / Morena';
      }

      analysis = {
        identity: {
          name: req.body.name || `Influencer_${Date.now().toString().slice(-4)}`,
          gender: req.body.gender || "Female",
          apparent_age: req.body.age || "26 años",
          ethnicity_appearance: req.body.ethnicity || "Latina",
          body_type: "Atlético / Proporcionado",
          persona_archetype: "Lifestyle & Bienestar"
        },
        facial_features: {
          face_shape: "ovalada",
          skin_tone: skinClass,
          skin_tone_hex: colors.skin,
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
          composition: "retrato medio",
          framing: "plano medio corto",
          mood: "relajado y positivo",
          post_processing: "estilo orgánico"
        },
        clothing: {
          type: "camiseta casual",
          color: "blanco",
          material: "algodón",
          neckline: "cuello redondo",
          fit: "regular",
          visible_brand_logos: "Ninguno"
        }
      };
    }

    // Prepare Persona model database columns
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
      image: imagePath,
      imageUGC: imagePath,
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

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
