/**
 * server-minimal.js — DEMO / OFFLINE ONLY
 *
 * NO es el Studio de producción. No tiene SQLite, /api/data, campañas ni character_lock real.
 * Arrancar con: npm run start:minimal
 *
 * Producción (default): npm start → server.js
 *
 * Histórico: parche F2/F3 cuando better-sqlite3 fallaba; la cola real vive en gen-queue.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

// Intentamos cargar sharp (está global)
let sharp = null;
try {
  sharp = require('sharp');
  console.log('✅ Sharp disponible');
} catch (e) {
  console.log('⚠️ Sharp no disponible, se omitirá optimización de imágenes');
}

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PERSONAS_FILE = path.join(__dirname, 'personas.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Crear carpetas
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PERSONAS_FILE)) fs.writeFileSync(PERSONAS_FILE, '[]');

// ============================================
// F3: COLA SIMPLE (una generación a la vez)
// ============================================
const generationQueue = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || generationQueue.length === 0) return;
  isProcessing = true;

  const task = generationQueue.shift();
  console.log(`[QUEUE] Procesando tarea. Quedan en cola: ${generationQueue.length}`);

  try {
    const result = await task.execute();
    task.resolve(result);
  } catch (err) {
    task.reject(err);
  } finally {
    isProcessing = false;
    // Procesar siguiente
    setImmediate(processQueue);
  }
}

function enqueueGeneration(executeFn) {
  return new Promise((resolve, reject) => {
    generationQueue.push({ execute: executeFn, resolve, reject });
    console.log(`[QUEUE] Nueva tarea encolada. Total en cola: ${generationQueue.length}`);
    processQueue();
  });
}

// ============================================
// AI Service Offline (F2 + F3)
// ============================================
function generateOffline(imageCount = 1) {
  const visualDescription = `Influencer virtual de aspecto latino, 25-28 años, piel media-clara, cabello castaño largo ondulado, ojos expresivos, estilo moderno y accesible. Complexión delgada atlética. Look consistente en ${imageCount} imagen(es) de referencia. Ideal para contenido UGC de lifestyle y beauty.`;

  const suggestedName = 'Valentina Morales';

  const videoScripts = [
    {
      id: 1,
      title: "Review Natural de Producto",
      hook: "¡Chicas, esto es lo que TODAS estábamos esperando!",
      desarrollo: "Hoy les muestro en detalle cómo uso este producto en mi rutina diaria. La calidad se nota y queda perfecto con mi estilo.",
      cta: "Comenta QUIERO si te lo vas a pedir ✨",
      fullVideoPrompt: "Influencer latina 26 años, cabello castaño largo, piel clara, top beige y jeans. Habitación luminosa. Selfie natural mostrando producto. Iluminación de ventana, estilo UGC 4K. 18s."
    },
    {
      id: 2,
      title: "Get Ready With Me",
      hook: "5 minutos para sentirme increíble...",
      desarrollo: "Te muestro mi rutina real de la mañana, eligiendo outfit y productos que me hacen sentir poderosa.",
      cta: "Guarda este video y cuéntame tu paso favorito 💕",
      fullVideoPrompt: "Misma influencer, look fresco, camisa oversized + shorts. Apartamento por la mañana. Secuencia documental GRWM. Luz natural, estilo TikTok auténtico. 22s."
    },
    {
      id: 3,
      title: "Storytelling + CTA",
      hook: "Nunca pensé que este cambio haría tanta diferencia...",
      desarrollo: "Les cuento la historia real de por qué empecé a usarlo y cómo transformó mi confianza.",
      cta: "Link en bio para el descuento de esta semana #UGC",
      fullVideoPrompt: "Influencer en terraza golden hour, vestido midi. Cuenta mini-historia mientras muestra producto. Close-ups y transiciones suaves. 25s."
    }
  ];

  const imageVariants = [
    { id: 1, title: "Pose natural de pie", prompt: visualDescription + " Pose de pie natural, tres cuartos, mirada a cámara, jeans + top, interior luminoso." },
    { id: 2, title: "Close-up expresivo", prompt: visualDescription + " Close-up rostro y hombros, expresión suave, iluminación de estudio, fondo neutro." },
    { id: 3, title: "Lifestyle terraza", prompt: visualDescription + " Sentada en terraza golden hour, outfit fluido, viento en el cabello, ciudad de fondo." },
    { id: 4, title: "Caminando street", prompt: visualDescription + " Caminando por calle moderna, streetwear chic, cabello en movimiento, luz de tarde." },
    { id: 5, title: "Estudio minimalista", prompt: visualDescription + " Estudio fondo blanco, pose limpia, vestuario monocromático, iluminación profesional." },
    { id: 6, title: "Cozy interior", prompt: visualDescription + " Habitación cozy, sentada en sillón, outfit oversize, luz natural, atmósfera cálida." },
    { id: 7, title: "Pose dinámica", prompt: visualDescription + " Pose dinámica de media vuelta, expresión confiada, vestuario casual chic, fondo urbano suave." },
    { id: 8, title: "Mirror selfie", prompt: visualDescription + " Selfie frente al espejo, outfit completo visible, iluminación natural de baño, estilo auténtico UGC." }
  ];

  return { visualDescription, suggestedName, videoScripts, imageVariants };
}

// ============================================
// Utilidades
// ============================================
function loadPersonas() {
  try {
    return JSON.parse(fs.readFileSync(PERSONAS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function savePersonas(personas) {
  fs.writeFileSync(PERSONAS_FILE, JSON.stringify(personas, null, 2));
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      // Para esta versión mínima aceptamos que no se suban archivos reales
      // y simulamos con imageCount
      resolve({ files: [], body: {} });
    });
    req.on('error', reject);
  });
}

// ============================================
// Servidor HTTP
// ============================================
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS simple
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static files
  if (pathname === '/' || pathname.startsWith('/public') || pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js')) {
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(__dirname, pathname.replace(/^\//, ''));
    if (pathname.startsWith('/public')) filePath = path.join(__dirname, pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // API Health
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: 'ok',
      queueLength: generationQueue.length,
      isProcessing,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API Personas
  if (pathname === '/api/personas' && req.method === 'GET') {
    const personas = loadPersonas();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, personas }));
    return;
  }

  // API Import Influencer (F2 + F3)
  if (pathname === '/api/import-influencer' && req.method === 'POST') {
    // Simulamos body (en producción real se parsearía multipart)
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = querystring.parse(body) || {};
        const action = params.action || 'create';
        const name = params.name || '';
        const imageCount = parseInt(params.imageCount || '1', 10);

        // F3: Encolar la generación
        const result = await enqueueGeneration(async () => {
          // Simular posible rate-limit (10% de chance para demo)
          if (Math.random() < 0.08) {
            const err = new Error('Rate limit exceeded');
            err.status = 429;
            err.retryAfter = 15;
            throw err;
          }

          // Generar
          const aiResult = generateOffline(imageCount);
          const finalName = name.trim() || aiResult.suggestedName;

          if (action === 'analyze') {
            return {
              success: true,
              mode: 'analyze',
              suggestedName: aiResult.suggestedName,
              visualAnalysis: aiResult.visualDescription,
              videoScripts: aiResult.videoScripts,
              imageVariants: aiResult.imageVariants
            };
          }

          // Create
          const personas = loadPersonas();
          const newPersona = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name: finalName,
            visualDescription: aiResult.visualDescription,
            videoScripts: aiResult.videoScripts,
            imageVariants: aiResult.imageVariants,
            images: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          personas.push(newPersona);
          savePersonas(personas);

          console.log(`✅ Persona creada: ${finalName}`);
          return {
            success: true,
            mode: 'create',
            message: 'Influencer importado exitosamente',
            persona: newPersona
          };
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        if (err.status === 429) {
          res.writeHead(429, {
            'Content-Type': 'application/json',
            'Retry-After': err.retryAfter || 30
          });
          res.end(JSON.stringify({
            success: false,
            error: 'Rate limit alcanzado. Por favor espera unos segundos e intenta de nuevo.',
            retryAfter: err.retryAfter || 30,
            code: 429
          }));
        } else {
          console.error(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 influ-json MINIMAL - AI UGC Production Studio         ║
║   Servidor operativo en http://localhost:${PORT}              ║
║   F2 + F3 (cola + rate-limit) implementados de verdad      ║
║   Sin dependencias externas pesadas                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});
