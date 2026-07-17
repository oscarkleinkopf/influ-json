const { GoogleGenAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  try {
    // In SDK version 0.1.1+, the SDK supports both direct apiKey or setting environment variable
    // We will initialize it properly
    const { GoogleGenAI } = require('@google/generative-ai');
    // Note: The standard package is "@google/generative-ai".
    // Let's verify how it's initialized.
    // In Google's official @google/generative-ai SDK:
    // const { GoogleGenAI } = require("@google/generative-ai"); // wait, actually it is:
    // const { GoogleGenerativeAI } = require("@google/generative-ai");
    // const genAI = new GoogleGenerativeAI(apiKey);
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    ai = new GoogleGenerativeAI(apiKey);
    console.log('Gemini API initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Gemini API client:', err);
  }
} else {
  console.log('No GEMINI_API_KEY found in .env. Running in Offline/Prompt-Copy mode.');
}

module.exports = {
  isApiConnected() {
    return ai !== null;
  },

  async analyzeReferencePhoto(imagePath) {
    if (!ai) {
      console.log('Offline mode: Using Canvas color matching & heuristic mock analysis.');
      return null; // triggers local frontend fallback
    }

    try {
      const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const absolutePath = path.resolve(imagePath);
      const imgData = fs.readFileSync(absolutePath);
      
      const filePart = {
        inlineData: {
          data: Buffer.from(imgData).toString('base64'),
          mimeType: 'image/jpeg' // adjust if png, etc., flash can infer or we use wildcard
        }
      };

      const prompt = `
        Analyze this reference photo of a person for an AI UGC Influencer model template. 
        You MUST respond ONLY with a single JSON object matching this exact structure:
        {
          "identity": {
            "name": "A suitable name based on face",
            "gender": "Femenino" or "Masculino" or "No binario / Andrógino",
            "apparent_age": "e.g. 22-28 años",
            "ethnicity_appearance": "e.g. Latina / Mediterránea",
            "body_type": "e.g. Atlético / Proporcionado",
            "persona_archetype": "e.g. Lifestyle & Bienestar"
          },
          "facial_features": {
            "face_shape": "Description",
            "skin_tone": "Description",
            "skin_tone_hex": "approximate skin hex color code like #d2b48c",
            "skin_texture": "Description",
            "eye_color": "Description",
            "eye_shape": "Description",
            "eyebrow_style": "Description",
            "nose_shape": "Description",
            "lip_shape": "Description",
            "lip_color": "Description",
            "jawline": "Description",
            "cheekbones": "Description",
            "facial_hair": "Description or Ninguno",
            "distinctive_marks": "Description or Ninguno",
            "smile_type": "Description"
          },
          "hair": {
            "color": "Description",
            "color_hex": "approximate hair hex color code like #3d2314",
            "length": "Description",
            "texture": "Description",
            "style": "Description",
            "parting": "Description",
            "highlights": "Description",
            "volume": "Description"
          },
          "aesthetic": {
            "overall_vibe": "Description",
            "fashion_style": "Description",
            "color_palette_dominant": "dominant hex color like #e0d0c0",
            "color_palette_description": "Description",
            "makeup_level": "Description",
            "accessories": "Description",
            "nails": "Description"
          },
          "photography": {
            "camera_lens": "e.g. iPhone 15 Pro front camera selfie",
            "focal_length": "e.g. 24mm (equivalente en celular)",
            "aperture": "e.g. f/1.9 (cámara frontal de celular)",
            "lighting_type": "e.g. Luz natural de ventana casual",
            "lighting_direction": "Description",
            "color_grade": "Description",
            "color_temperature": "e.g. 5500-6000K",
            "depth_of_field": "Description",
            "background_setting": "Description",
            "background_blur": "Description",
            "composition": "Description",
            "framing": "Description",
            "mood": "Description",
            "post_processing": "Description"
          },
          "clothing": {
            "type": "Description of clothing worn in photo",
            "color": "Color of clothing in photo",
            "material": "Material of clothing in photo",
            "neckline": "Neckline shape",
            "fit": "Fit shape",
            "visible_brand_logos": "Ninguno"
          }
        }
        Do not output any markdown code blocks, preambles, or additional text. Output pure valid JSON only.
      `;

      const result = await model.generateContent([prompt, filePart]);
      const text = result.response.text().trim();
      
      // Clean possible markdown code fence wrapper (```json ... ```)
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      console.error('Gemini Vision analysis error:', err);
      return null; // trigger fallback
    }
  },

  async generateScripts(product, persona, count = 10) {
    if (!ai) {
      console.log('Offline mode: Using pre-baked template scripts.');
      return null;
    }

    try {
      const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `
        Genera ${count} variaciones de guiones de anuncios publicitarios UGC (User Generated Content) cortos (15-25 segundos) en español.
        El producto es: "${product.name}" con beneficio principal: "${product.benefit}".
        La audiencia es: "${product.audience}" con la frustración: "${product.frustration}".
        La creadora/influencer es: "${persona.name}" (${persona.gender}, ${persona.age}, estilo: ${persona.style}).
        
        Cada guión debe contener exactamente 4 partes estructuradas:
        1. Gancho (Hook): Captar la atención en los primeros 3 segundos.
        2. Demostración (Demo): Mostrar el producto en uso de forma creíble.
        3. Giro (Turn): El motivo por el cual es mejor que otros o la solución a su dolor.
        4. CTA: Llamado a la acción suave y amigable.
        
        Cada parte debe incluir un texto hablado y una indicación visual/dirección (visual cue) en español.

        Responde ÚNICAMENTE con un array en formato JSON puro. Cada elemento debe ser un objeto con esta estructura exacta:
        {
          "angle": "Nombre del Ángulo (ej. El Escéptico, Antes y Después, Hacks de Belleza)",
          "hook": "Línea hablada del gancho",
          "hookCue": "Indicación de acción visual del gancho",
          "demo": "Línea hablada de la demostración",
          "demoCue": "Indicación de acción visual de la demostración",
          "turn": "Línea hablada del giro de solución",
          "turnCue": "Indicación de acción visual del giro",
          "cta": "Línea hablada del CTA",
          "ctaCue": "Indicación de acción visual del CTA"
        }
        
        No devuelvas bloques de código markdown, solo el array JSON válido.
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      console.error('Gemini Script generation error:', err);
      return null;
    }
  },

  async generateInfluencerImage(prompt, referenceUrl = null) {
    if (!ai) {
      console.log('Using Pollinations.ai free keyless generator for virtual portrait...');
      try {
        let url = `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}?width=768&height=768&model=flux&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 100000)}`;
        if (referenceUrl) {
          url += `&image=${encodeURIComponent(referenceUrl)}&strength=0.65`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Pollinations HTTP error: ${res.status}`);
        
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const filename = `gen_flux_${Date.now()}.jpg`;
        const relativePath = `assets/generated/${filename}`;
        const absolutePath = path.join(__dirname, relativePath);

        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(absolutePath, buffer);
        
        // Sync to scratch directory
        const SCRATCH_DIR = 'C:/Users/oscar/.gemini/antigravity/brain/7d7c6673-5ef4-440b-aa1e-adaeba8ce81d/scratch';
        const scratchGenDir = path.join(SCRATCH_DIR, 'assets', 'generated');
        if (!fs.existsSync(scratchGenDir)) fs.mkdirSync(scratchGenDir, { recursive: true });
        fs.writeFileSync(path.join(scratchGenDir, filename), buffer);

        console.log(`Pollinations Image generated and saved to: ${relativePath}`);
        return relativePath;
      } catch (err) {
        console.error('Pollinations generation error:', err);
        return null;
      }
    }

    try {
      // In Gemini API, Image generation uses the 'imagen-3.0-generate-002' model (or latest Imagen model)
      // Check if Imagen API is supported on the client
      const model = ai.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
      const result = await model.generateImages({
        prompt: prompt,
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1'
      });

      if (result.generatedImages && result.generatedImages.length > 0) {
        const base64Data = result.generatedImages[0].image.imageBytes;
        const filename = `gen_${Date.now()}.jpg`;
        const relativePath = `assets/generated/${filename}`;
        const absolutePath = path.join(__dirname, relativePath);

        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(absolutePath, Buffer.from(base64Data, 'base64'));
        
        // Sync to scratch directory
        const SCRATCH_DIR = 'C:/Users/oscar/.gemini/antigravity/brain/7d7c6673-5ef4-440b-aa1e-adaeba8ce81d/scratch';
        const scratchGenDir = path.join(SCRATCH_DIR, 'assets', 'generated');
        if (!fs.existsSync(scratchGenDir)) fs.mkdirSync(scratchGenDir, { recursive: true });
        fs.writeFileSync(path.join(scratchGenDir, filename), Buffer.from(base64Data, 'base64'));

        console.log(`AI Image generated and saved to: ${relativePath}`);
        return relativePath;
      }
      return null;
    } catch (err) {
      console.error('Gemini Image generation (Imagen) error:', err);
      return null;
    }
  },

  async uploadToTmpFiles(localPath) {
    try {
      const absolutePath = path.resolve(localPath);
      if (!fs.existsSync(absolutePath)) {
        console.warn(`File does not exist: ${absolutePath}`);
        return null;
      }

      // Check if it is a directory
      if (fs.lstatSync(absolutePath).isDirectory()) {
        console.warn(`Path is a directory, cannot upload: ${absolutePath}`);
        return null;
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      const fileBlob = new Blob([fileBuffer], { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', fileBlob, path.basename(absolutePath));

      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error(`tmpfiles.org API responded with status ${res.status}`);
      const data = await res.json();
      if (data && data.data && data.data.url) {
        const directUrl = data.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
        console.log(`Uploaded local image ${localPath} to tmpfiles.org successfully: ${directUrl}`);
        return directUrl;
      }
      return null;
    } catch (e) {
      console.error('Error uploading local image to tmpfiles.org:', e);
      return null;
    }
  },

  async generateDetailedCharacterPrompt(persona, sceneDescription = "", options = {}) {
    const detailed = typeof persona.detailedJSON === 'string' 
        ? JSON.parse(persona.detailedJSON) 
        : (persona.detailedJSON || {});

    const charName = persona.name || detailed.identity?.name || "Influencer";
    const gender = persona.gender || detailed.identity?.gender || "Female";
    const age = persona.age || detailed.identity?.apparent_age || "25 años";
    const ethnicity = persona.ethnicity || detailed.identity?.ethnicity_appearance || "Latina";

    // === Extracción profunda del detailedJSON ===
    const f = detailed.facial_features || {};
    const h = detailed.hair || {};
    const a = detailed.aesthetic || {};
    const p = detailed.photography || {};
    const c = detailed.clothing || {};

    const faceShape     = f.face_shape || "ovalada";
    const skinTone      = f.skin_tone || "tono natural";
    const skinTexture   = f.skin_texture || "piel real con poros visibles y textura natural";
    const eyeColor      = f.eye_color || "marrón oscuro";
    const eyeShape      = f.eye_shape || "almendrados";
    const eyebrows      = f.eyebrow_style || "cejas naturales y definidas";
    const nose          = f.nose_shape || "nariz recta y proporcionada";
    const lips          = f.lip_shape || "labios medianos con arco de cupido definido";
    const jawline       = f.jawline || "mandíbula suave y definida";
    const smileType     = f.smile_type || "sonrisa cálida y natural";

    const hairColor     = h.color || "castaño oscuro";
    const hairLength    = h.length || "medio-largo";
    const hairTexture   = h.texture || "ondulado natural";
    const hairStyle     = h.style || "suelto con movimiento";

    const overallVibe   = a.overall_vibe || "natural y accesible";
    const fashionStyle  = a.fashion_style || "casual chic";
    const makeupLevel   = a.makeup_level || "maquillaje natural y ligero";

    const camera        = p.camera_lens || persona.camera || "smartphone camera";
    const lighting      = p.lighting_type || persona.lighting || "luz natural suave";
    const colorGrade    = p.color_grade || "tono cálido natural";
    const depthOfField  = p.depth_of_field || "bokeh suave";

    const bodyType      = detailed.identity?.body_type || persona.body_type || "atlético / proporcionado";

    // Referencia para --cref (Midjourney). SOLO se incluye si viene explícitamente en options.referenceUrl
    const referenceUrl = options.referenceUrl || "";

    // === Escena ===
    const scene = sceneDescription && sceneDescription.trim() !== "" 
        ? sceneDescription.trim() 
        : "en un entorno natural y luminoso, mirada directa a cámara, expresión auténtica y relajada";

    // ============================================================
    // MODO ONLINE (Gemini)
    // ============================================================
    if (ai) {
        try {
            const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const systemPrompt = `Eres un experto en prompt engineering para modelos de difusión (Flux, Midjourney, Leonardo, Ideogram). 
Tu tarea es crear una "Character Bible" de alta calidad para mantener consistencia de personaje.

Debes responder ÚNICAMENTE con un JSON válido con esta estructura exacta:

{
  "character_name": "string",
  "positive_prompt": "Prompt muy detallado y optimizado combinando rasgos fijos del personaje + escena",
  "negative_prompt": "Negative prompt fuerte y específico",
  "character_lock_section": "Descripción técnica y detallada de los rasgos que NO deben cambiar (cara, ojos, cabello, piel, etc.)",
  "model_recommendations": {
    "midjourney": "Prompt optimizado + parámetros (usar --cref si viene una URL de referencia en la entrada, si no omitirlo)",
    "flux": "Prompt en lenguaje natural optimizado para Flux",
    "leonardo": "Prompt optimizado para Leonardo + instrucciones de Character Reference",
    "ideogram": "Prompt optimizado para Ideogram Character Reference"
  },
  "usage_notes": "Consejos prácticos de consistencia"
}

Reglas importantes:
- El character_lock_section debe ser muy específico y técnico.
- El positive_prompt debe ser rico en detalles de piel, cabello, ojos y fotografía.
- Adapta ligeramente el prompt según la escena proporcionada.
- No agregues explicaciones fuera del JSON.`;

            const userPrompt = `
Nombre del personaje: ${charName}
Edad: ${age}
Género: ${gender}
Etnia: ${ethnicity}
Rasgos faciales: ${faceShape} face, ${skinTone} skin with ${skinTexture}, ${eyeColor} ${eyeShape} eyes, ${eyebrows}, ${lips}, ${jawline}, ${smileType}
Cabello: ${hairLength}, ${hairTexture}, ${hairColor}, ${hairStyle}
Cuerpo: ${bodyType}
Estética: ${overallVibe}, ${fashionStyle}, ${makeupLevel}
Fotografía: ${camera}, ${lighting}, ${colorGrade}, ${depthOfField}
Referencia URL de imagen proporcionada: "${referenceUrl}"

Escena deseada: ${scene}

Genera ahora la Character Bible siguiendo estrictamente la estructura JSON indicada.
`;

            const result = await model.generateContent([systemPrompt, userPrompt]);
            const text = result.response.text().trim();
            const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            
            return JSON.parse(cleanJson);

        } catch (err) {
            console.warn('Gemini generation failed, falling back to offline compiler.', err);
        }
    }

    // ============================================================
    // MODO OFFLINE (Compilador local altamente optimizado)
    // ============================================================

    // --- Character Lock (Estructura técnica muy descriptiva) ---
    const characterLock = `IDENTIDAD ANCLA: ${charName}, ${age}, de rasgos ${ethnicity}.
RASGOS FACIALES FIJOS: Rostro de forma ${faceShape} con mandíbula ${jawline}. Ojos ${eyeShape} de color ${eyeColor}, enmarcados por ${eyebrows}. Nariz ${nose} y labios ${lips}. Sonrisa de tipo ${smileType}.
TEZ Y PIEL: Piel de tono ${skinTone} con textura de ${skinTexture}.
CABELLO: Cabello largo ${hairLength}, de textura ${hairTexture}, color ${hairColor}, peinado de forma ${hairStyle}.
COMPLEXIÓN: Cuerpo de contextura ${bodyType}.
ESTILO VISUAL: Estética general ${overallVibe}, vistiendo estilo ${fashionStyle} con nivel de maquillaje ${makeupLevel}.`;

    // --- Positive Prompt (Estructurado por secciones lógicas) ---
    const positivePrompt = `A high-fidelity candid snapshot of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer. She has a distinct ${faceShape} face with a defined ${jawline} jawline, ${eyeColor} ${eyeShape} eyes, ${eyebrows}, and ${lips}. Her hair is styled ${hairStyle}, showing ${hairLength} ${hairTexture} ${hairColor} locks. Her skin is characterized by a realistic ${skinTone} tone, featuring natural micro-textures, subtle pores, and a detailed ${skinTexture}. She is ${scene}. Shot on ${camera}, lit by ${lighting}, raw and unedited style, featuring a ${depthOfField} and natural ${colorGrade} color grading, captures authentic skin texture, realistic imperfections, cinematic realism.`;

    // --- Negative Prompt (Robusto y depurado) ---
    const negativePrompt = "3d render, computer graphics, airbrushed, plastic skin, overly smooth face, face tuning, fake skin texture, cartoon, illustration, drawing, painting, vector art, anime, doll-like, fake reflections, extra limbs, mutated hands, fusioned fingers, extra fingers, text, watermark, logo, signature, low-resolution, blurry face, distorted background, cloned face, duplicate person";

    // --- Midjourney (Limpio y modular, sin --cref a menos que esté en options) ---
    const mjCref = referenceUrl ? ` --cref ${referenceUrl} --cw 100` : "";
    const midjourneyPrompt = `A raw photograph of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer, ${faceShape} face shape, ${eyeColor} eyes, ${hairLength} ${hairTexture} ${hairColor} hair, detailed ${skinTone} skin with natural textures. She is ${scene}. Captured on ${camera}, ${lighting}, candid UGC style, photorealistic --ar 4:5${mjCref} --style raw --v 6.0`;

    // --- Flux (Enfoque lenguaje natural, detalles microscópicos de piel y luz) ---
    const fluxPrompt = `A real, raw, and unedited mobile phone photograph of ${charName}, a ${age}-year-old ${ethnicity} ${gender.toLowerCase()} influencer. She has a beautifully defined ${faceShape} face, striking ${eyeColor} eyes, and ${hairLength} ${hairTexture} ${hairColor} hair. Her skin is a natural ${skinTone} tone, showcasing realistic pores, tiny blemishes, and an un-airbrushed ${skinTexture}. She is ${scene}. The photo is captured candidly on a ${camera} under ${lighting}, featuring natural shadows, realistic ${colorGrade} colors, and authentic textures.`;

    // --- Leonardo (Estructurado para máxima fidelidad) ---
    const leonardoPrompt = `A photorealistic and highly detailed portrait of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer with a ${faceShape} face, ${eyeColor} eyes, and ${hairLength} ${hairColor} hair. She is ${scene}. Natural lighting, detailed skin texture with visible pores, professional camera settings, consistent character design, cinematic realism. (Optimized for Leonardo Character Reference)`;

    // --- Ideogram (Estilo directo y fotográfico) ---
    const ideogramPrompt = `A candid UGC smartphone snapshot of ${charName}, a ${age} years old ${ethnicity} ${gender.toLowerCase()} with a ${faceShape} face shape, ${eyeColor} eyes, and ${hairLength} ${hairTexture} ${hairColor} hair. She is ${scene}. Soft ${lighting}, natural skin textures, unedited, realistic.`;

    // --- Usage Notes (Consejos prácticos, interactivos y accionables) ---
    const usageNotes = `**Guía Profesional de Consistencia de Personaje (Character Consistency):**

1. **Midjourney (--cref)**:
   - Para anclar el personaje, añade manualmente el parámetro \`--cref <URL>\` al final de tu prompt, usando la URL de la imagen de referencia principal (Portrait).
   - Configura el peso de referencia con \`--cw 100\` para copiar el rostro y la vestimenta/cabello. Usa \`--cw 0\` si deseas cambiar la ropa completamente manteniendo únicamente las facciones del rostro.
   - Acompaña siempre tus prompts de Midjourney con \`--style raw\` para evitar el sobre-embellecimiento por defecto.

2. **Flux.1**:
   - Flux.1 no requiere parámetros especiales de referencia nativa, pero responde excepcionalmente bien al lenguaje natural.
   - Ancla los primeros tokens del prompt con la descripción exacta del rostro y la piel (ej. "A raw photograph of [Nombre] with natural pores and skin texture") y luego describe la escena.

3. **Leonardo.ai**:
   - Activa el panel lateral de "Image Guidance".
   - Selecciona "Character Reference" y sube la imagen base del personaje.
   - Ajusta la fuerza ("Strength") a un valor entre 0.85 y 1.0 para fijar los rasgos de manera estricta.

4. **Ideogram**:
   - Utiliza la funcionalidad "Character Reference" integrada en la interfaz y sube tu retrato de referencia original.
   - Describe la pose y la escena de manera clara sin repetir excesivamente los rasgos físicos en el prompt para evitar saturación del motor.`;

    return {
        character_name: charName,
        positive_prompt: positivePrompt.replace(/\s+/g, ' ').trim(),
        negative_prompt: negativePrompt,
        character_lock_section: characterLock.trim(),
        model_recommendations: {
            midjourney: midjourneyPrompt.replace(/\s+/g, ' ').trim(),
            flux: fluxPrompt.replace(/\s+/g, ' ').trim(),
            leonardo: leonardoPrompt.replace(/\s+/g, ' ').trim(),
            ideogram: ideogramPrompt.replace(/\s+/g, ' ').trim()
        },
        usage_notes: usageNotes
    };
  }
};
