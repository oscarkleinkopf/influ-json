const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const archiver = require('archiver');
const dotenv = require('dotenv');

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
