const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PERSONAS_FILE = path.join(__dirname, 'personas.json');
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Persisted scratch directory in appData conversation directory
const SCRATCH_DIR = 'C:/Users/oscar/.gemini/antigravity/brain/7d7c6673-5ef4-440b-aa1e-adaeba8ce81d/scratch';
const SCRATCH_PERSONAS_FILE = path.join(SCRATCH_DIR, 'personas.json');
const SCRATCH_PRODUCTS_FILE = path.join(SCRATCH_DIR, 'products.json');

// Ensure scratch directory exists
if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

// Initialize default data if files don't exist
const defaultPersonas = [
  {
    name: "Sofia",
    gender: "Female",
    age: "25 años",
    ethnicity: "Latina",
    style: "Minimalista y natural",
    hair: "Marrón ondulado largo",
    lighting: "Warm morning sunlight streaming through window",
    camera: "DSLR portrait photograph, 35mm lens",
    clothing: "Suéter de punto color crema",
    setting: "Sala de estar moderna y neutral",
    image: "assets/influencer_female.png",
    imageUGC: "assets/influencer_female_serum.png",
    handle: "@sofia_ai_ugc"
  },
  {
    name: "Lucas",
    gender: "Male",
    age: "28 años",
    ethnicity: "Europeo / Atlético",
    style: "Deportivo y tecnológico",
    hair: "Corto oscuro peinado",
    lighting: "Clean modern studio lighting, soft shadows",
    camera: "DSLR headshot, 50mm lens",
    clothing: "Camiseta deportiva negra",
    setting: "Gimnasio interior moderno con luces tenues",
    image: "assets/influencer_male.png",
    imageUGC: "assets/influencer_male_bottle.png",
    handle: "@lucas_fit_tech"
  }
];

const defaultProducts = [
  {
    name: "Glow Serum Organics",
    benefit: "Piel brillante y profundamente hidratada en 5 minutos",
    audience: "Jóvenes ocupadas con piel seca y opaca",
    frustration: "No tener tiempo para rutinas coreanas de 10 pasos",
    image: "assets/product_serum.png"
  },
  {
    name: "HydraFlask Matte",
    benefit: "Mantiene el agua fría por 24 horas con estilo minimalista",
    audience: "Entusiastas del fitness y profesionales ocupados",
    frustration: "Botellas que gotean o no mantienen la temperatura",
    image: "assets/product_bottle.png"
  }
];

function readJSONFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

function writeJSONFile(filePath, data) {
  try {
    // Write to the main workspace file path
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Auto-sync replica to scratch directory
    if (filePath === PERSONAS_FILE) {
      fs.writeFileSync(SCRATCH_PERSONAS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Synced personas.json to scratch directory: ${SCRATCH_PERSONAS_FILE}`);
    } else if (filePath === PRODUCTS_FILE) {
      fs.writeFileSync(SCRATCH_PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Synced products.json to scratch directory: ${SCRATCH_PRODUCTS_FILE}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    return false;
  }
}

// Git backup helper function
function runGitBackup(callback) {
  const commitMsg = `Backup auto-sync: Campaign update ${new Date().toISOString()}`;
  const commands = `git add . && git commit -m "${commitMsg}" && git push origin main`;
  
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

// Endpoints
app.get('/api/data', (req, res) => {
  const personas = readJSONFile(PERSONAS_FILE, defaultPersonas);
  const products = readJSONFile(PRODUCTS_FILE, defaultProducts);
  res.json({ personas, products });
});

app.post('/api/personas', (req, res) => {
  const newPersona = req.body;
  const personas = readJSONFile(PERSONAS_FILE, defaultPersonas);
  
  // Update if exists by name, else append
  const idx = personas.findIndex(p => p.name.toLowerCase() === newPersona.name.toLowerCase());
  if (idx !== -1) {
    personas[idx] = { ...personas[idx], ...newPersona };
  } else {
    // Assign a default image fallback for demo
    newPersona.image = newPersona.gender === "Male" ? "assets/influencer_male.png" : "assets/influencer_female.png";
    newPersona.imageUGC = newPersona.gender === "Male" ? "assets/influencer_male_bottle.png" : "assets/influencer_female_serum.png";
    newPersona.handle = `@${newPersona.name.toLowerCase()}_ai_ugc`;
    personas.push(newPersona);
  }
  
  const success = writeJSONFile(PERSONAS_FILE, personas);
  if (success) {
    // Trigger auto-git-backup in the background
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, personas, gitSynced: gitSuccess, gitMessage: msg });
    });
  } else {
    res.status(500).json({ success: false, message: "Error al guardar la persona" });
  }
});

app.post('/api/products', (req, res) => {
  const newProduct = req.body;
  const products = readJSONFile(PRODUCTS_FILE, defaultProducts);
  
  const idx = products.findIndex(p => p.name.toLowerCase() === newProduct.name.toLowerCase());
  if (idx !== -1) {
    products[idx] = { ...products[idx], ...newProduct };
  } else {
    newProduct.image = products.length % 2 === 0 ? "assets/product_serum.png" : "assets/product_bottle.png";
    products.push(newProduct);
  }
  
  const success = writeJSONFile(PRODUCTS_FILE, products);
  if (success) {
    runGitBackup((gitSuccess, msg) => {
      res.json({ success: true, products, gitSynced: gitSuccess, gitMessage: msg });
    });
  } else {
    res.status(500).json({ success: false, message: "Error al guardar el producto" });
  }
});

app.post('/api/sync', (req, res) => {
  runGitBackup((gitSuccess, msg) => {
    if (gitSuccess) {
      res.json({ success: true, message: "Sincronización exitosa con GitHub", gitMessage: msg });
    } else {
      res.status(500).json({ success: false, message: "Error al sincronizar con GitHub", gitMessage: msg });
    }
  });
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

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
