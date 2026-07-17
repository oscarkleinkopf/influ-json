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

  async generateWithGeminiMulti(imagePaths, options = {}) {
    if (!ai) {
      console.log('Offline mode: Using Canvas color matching & heuristic mock analysis (Multi).');
      return null; // triggers local frontend fallback
    }

    try {
      const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      // Build image parts for all imagePaths
      const imageParts = imagePaths.map(img => {
        const absolutePath = path.resolve(img);
        const imgData = fs.readFileSync(absolutePath);
        return {
          inlineData: {
            data: Buffer.from(imgData).toString('base64'),
            mimeType: 'image/jpeg'
          }
        };
      });

      const prompt = `
        You are an expert AI Prompt Engineer and visual content director.
        Analyze all of the provided reference photos of the SAME person/influencer.
        Combine information from these different angles, expressions, lighting conditions, and outfits to establish a single, highly consistent visual identity sheet.
        
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

      const result = await model.generateContent([prompt, ...imageParts]);
      const text = result.response.text().trim();
      
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      console.error('Gemini Vision multi-analysis error:', err);
      return null;
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

    const charName   = persona.name || detailed.identity?.name || "Influencer";
    const gender     = persona.gender || detailed.identity?.gender || "Female";
    const age        = persona.age || detailed.identity?.apparent_age || "25 años";
    const ethnicity  = persona.ethnicity || detailed.identity?.ethnicity_appearance || "Latina";

    const f = detailed.facial_features || {};
    const h = detailed.hair || {};
    const a = detailed.aesthetic || {};
    const p = detailed.photography || {};

    // === Rasgos faciales ===
    const faceShape   = f.face_shape || "ovalada";
    const skinTone    = f.skin_tone || "tono natural";
    const skinTexture = f.skin_texture || "piel real con poros visibles y textura natural";
    const eyeColor    = f.eye_color || "marrón oscuro";
    const eyeShape    = f.eye_shape || "almendrados";
    const eyebrows    = f.eyebrow_style || "cejas naturales y definidas";
    const lips        = f.lip_shape || "labios medianos con arco definido";
    const jawline     = f.jawline || "mandíbula suave y definida";
    const smileType   = f.smile_type || "sonrisa cálida y natural";

    // === Cabello ===
    const hairColor   = h.color || "castaño oscuro";
    const hairLength  = h.length || "medio-largo";
    const hairTexture = h.texture || "ondulado natural";
    const hairStyle   = h.style || "suelto con movimiento natural";

    // === Estética y fotografía ===
    const overallVibe   = a.overall_vibe || "natural y accesible";
    const fashionStyle  = a.fashion_style || "casual chic";
    const makeupLevel   = a.makeup_level || "maquillaje natural y ligero";

    const camera        = p.camera_lens || "smartphone camera";
    const lighting      = p.lighting_type || "luz natural suave";
    const colorGrade    = p.color_grade || "tono cálido natural";
    const depthOfField  = p.depth_of_field || "bokeh suave";

    const bodyType = detailed.identity?.body_type || "atlético / proporcionado";

    const referenceUrl = options.referenceUrl || "";
    const scene = (sceneDescription && sceneDescription.trim() !== "") 
        ? sceneDescription.trim() 
        : "en un entorno luminoso y natural, mirada directa a cámara, expresión auténtica";

    // ============================================================
    // MODO ONLINE (Gemini)
    // ============================================================
    if (ai) {
        try {
            const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const systemPrompt = `Eres un experto en prompt engineering especializado en personajes hiperrealistas para UGC.
Crea una Character Bible de alta calidad enfocándose especialmente en realismo de piel, textura natural y consistencia facial.

Responde ÚNICAMENTE con un JSON válido siguiendo esta estructura exacta:
{
  "character_name": "string",
  "positive_prompt": "Prompt detallado con énfasis en realismo de piel",
  "negative_prompt": "Negative prompt fuerte",
  "character_lock_section": "Descripción técnica y detallada de rasgos fijos",
  "model_recommendations": {
    "midjourney": "string",
    "flux": "string",
    "leonardo": "string",
    "ideogram": "string"
  },
  "usage_notes": "string"
}`;

            const userPrompt = `Información del personaje:
Nombre: ${charName} | Edad: ${age} | Género: ${gender} | Etnia: ${ethnicity}
Cara: ${faceShape}
Piel: ${skinTone} con ${skinTexture}
Ojos: ${eyeColor} (${eyeShape}) | Cejas: ${eyebrows}
Labios: ${lips} | Mandíbula: ${jawline}
Cabello: ${hairLength} ${hairTexture} ${hairColor}, estilo ${hairStyle}
Cuerpo: ${bodyType}
Estética: ${overallVibe}, ${fashionStyle}, ${makeupLevel}
Fotografía: ${camera}, ${lighting}, ${colorGrade}, ${depthOfField}

Escena deseada: ${scene}

Genera la Character Bible con fuerte énfasis en realismo de piel y textura natural.`;

            const result = await model.generateContent([systemPrompt, userPrompt]);
            const text = result.response.text().trim();
            const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            return JSON.parse(cleanJson);

        } catch (err) {
            console.warn('Gemini falló, usando modo offline avanzado.', err);
        }
    }

    // ============================================================
    // MODO OFFLINE (Versión mejorada con énfasis en piel)
    // ============================================================

    // --- Character Lock (más detallado) ---
    const characterLock = `${charName} is a ${age} ${ethnicity} ${gender.toLowerCase()} with a ${faceShape} face. 
Key features: ${skinTone} skin with visible natural pores, subtle skin texture and ${skinTexture}. 
Eyes: ${eyeColor}, ${eyeShape} shape, with ${eyebrows}. 
Lips: ${lips}. Jawline: ${jawline}. 
Hair: ${hairLength}, ${hairTexture}, ${hairColor} with ${hairStyle} style. 
Body: ${bodyType}. Overall aesthetic: ${overallVibe}, ${fashionStyle} style with ${makeupLevel}.`;

    // --- Positive Prompt (enfocado en realismo de piel) ---
    const positivePrompt = `Raw unedited UGC smartphone photograph of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer. 
She has a ${faceShape} face with ${skinTone} skin showing natural pores, subtle skin texture, fine details and ${skinTexture}. 
Her eyes are ${eyeColor} with ${eyeShape} shape, ${eyebrows}, and she has ${lips}. 
Hair is ${hairLength}, ${hairTexture}, ${hairColor} with ${hairStyle}. 
She is ${scene}. 
Captured with ${camera}, ${lighting}, ${colorGrade} color grade, ${depthOfField}, realistic skin texture, natural imperfections, authentic candid moment, high detail, unedited smartphone quality.`;

    // --- Negative Prompt (mejorado) ---
    const negativePrompt = "plastic skin, airbrushed, overly smooth skin, waxy texture, heavy makeup, beauty filter, instagram filter, cartoon, 3d render, illustration, anime, deformed face, bad anatomy, extra fingers, blurry, low resolution, watermark, text, logo, duplicate, artificial skin, perfect skin, mannequin look";

    // --- Midjourney ---
    const mjCref = referenceUrl ? ` --cref ${referenceUrl} --cw 100` : "";
    const midjourneyPrompt = `${charName}, ${age} ${ethnicity} ${gender.toLowerCase()}, ${faceShape} face, ${skinTone} skin with natural pores and realistic texture. She is ${scene}. Natural lighting, candid UGC style, realistic skin details --ar 4:5${mjCref} --style raw --v 6.0`;

    // --- Flux (enfoque fuerte en piel) ---
    const fluxPrompt = `Raw unedited mobile phone photograph of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer. 
She has ${skinTone} skin with visible natural pores, subtle skin texture and realistic details. 
${faceShape} face, ${eyeColor} eyes, ${hairLength} ${hairTexture} ${hairColor} hair. 
She is ${scene}. Shot on ${camera} with ${lighting}, natural skin, authentic amateur quality, high fidelity, realistic texture.`;

    // --- Leonardo ---
    const leonardoPrompt = `Photorealistic character portrait of ${charName}, ${age} ${ethnicity} ${gender.toLowerCase()} with ${faceShape} face and ${skinTone} skin showing natural pores and realistic texture. She is ${scene}. Natural lighting, high detail skin, authentic look. Use with Leonardo Character Reference at high strength.`;

    // --- Ideogram ---
    const ideogramPrompt = `Realistic UGC smartphone photo of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} with ${faceShape} face, ${skinTone} skin with natural texture and pores. She is ${scene}. Natural light, candid moment, shot on smartphone, realistic skin details.`;

    // --- Usage Notes ---
    const usageNotes = `**Consejos para Mejor Consistencia y Realismo:**

1. **Midjourney**: Usa una URL pública de referencia + \`--cw 100\` para máxima fidelidad de rostro y piel. Si quieres cambiar solo la ropa, reduce \`--cw\` a 50-70.

2. **Flux**: Es excelente con realismo de piel. Mantén palabras como "raw unedited mobile phone photograph", "visible natural pores" y "realistic skin texture".

3. **Leonardo / Ideogram**: Activa Character Reference y sube la imagen del personaje. En Leonardo pon el peso entre 0.85 y 1.0 para mejor preservación de textura de piel.

4. **General**: Para máxima consistencia de piel y rostro, usa siempre la misma imagen de referencia cuando sea posible.`;

    return {
        character_name: charName,
        positive_prompt: positivePrompt.replace(/\s+/g, ' ').trim(),
        negative_prompt: negativePrompt,
        character_lock_section: characterLock.replace(/\s+/g, ' ').trim(),
        model_recommendations: {
            midjourney: midjourneyPrompt.replace(/\s+/g, ' ').trim(),
            flux: fluxPrompt.replace(/\s+/g, ' ').trim(),
            leonardo: leonardoPrompt.replace(/\s+/g, ' ').trim(),
            ideogram: ideogramPrompt.replace(/\s+/g, ' ').trim()
        },
        usage_notes: usageNotes
    };
  },

  async generateUgcVideoScripts(persona, scriptTopic = "Video UGC") {
    const detailed = typeof persona.detailedJSON === 'string' 
        ? JSON.parse(persona.detailedJSON) 
        : (persona.detailedJSON || {});

    const charName   = persona.name || detailed.identity?.name || "Influencer";
    const gender     = persona.gender || detailed.identity?.gender || "Female";
    const age        = persona.age || detailed.identity?.apparent_age || "25 años";
    const ethnicity  = persona.ethnicity || detailed.identity?.ethnicity_appearance || "Latina";

    const f = detailed.facial_features || {};
    const h = detailed.hair || {};
    const a = detailed.aesthetic || {};

    const faceShape   = f.face_shape || "ovalada";
    const skinTone    = f.skin_tone || "tono natural";
    const skinTexture = f.skin_texture || "piel real con poros visibles";
    const hairColor   = h.color || "castaño oscuro";
    const hairLength  = h.length || "medio-largo";
    const hairTexture = h.texture || "ondulado natural";
    const hairStyle   = h.style || "suelto con movimiento";
    const overallVibe   = a.overall_vibe || "natural y accesible";

    // ============================================================
    // MODO ONLINE (Gemini)
    // ============================================================
    if (ai) {
        try {
            const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const systemPrompt = `Eres un guionista y director creativo experto en videos UGC (Contenido Generado por el Usuario) de alta conversión y consistencia de personaje en IA.
Tu objetivo es generar 3 propuestas de guiones UGC para promocionar un producto/tema.

Responde ÚNICAMENTE con un JSON válido que sea un arreglo de 3 objetos de guion, siguiendo esta estructura exacta:
[
  {
    "title": "Gancho de Problema / Solución",
    "hook": "Línea inicial de audio para captar atención",
    "body": "Cuerpo del guion de voz en off",
    "cta": "Llamado a la acción de audio final",
    "scenes": [
      {
        "dialogue": "Voz en off o acción a realizar en esta escena",
        "visual_prompt": "Prompt visual detallado para generador de video (como Runway Gen-3 o Luma Dream Machine) describiendo al personaje (nombre, rasgos clave: cabello, cara, tez, vestimenta casual) sosteniendo/usando el producto en un plano de video específico y movimiento de cámara natural."
      }
    ]
  }
]`;

            const userPrompt = `Información del personaje:
Nombre: ${charName} | Edad: ${age} | Género: ${gender} | Etnia: ${ethnicity}
Rasgos físicos clave: rostro ${faceShape}, piel ${skinTone} con ${skinTexture}, cabello ${hairLength} ${hairTexture} ${hairColor} con estilo ${hairStyle}.
Estética general: ${overallVibe}

Producto / Tema a promocionar: ${scriptTopic}

Genera los 3 guiones UGC profesionales. La respuesta debe ser puramente JSON válido, sin preámbulos ni bloques de markdown.`;

            const result = await model.generateContent([systemPrompt, userPrompt]);
            const text = result.response.text().trim();
            const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            return JSON.parse(cleanJson);
        } catch (err) {
            console.warn('Gemini falló al generar guiones de video, usando modo offline.', err);
        }
    }

    // ============================================================
    // MODO OFFLINE: Compilador local avanzado de plantillas
    // ============================================================
    const pronounCaps = gender.toLowerCase() === "male" ? "Él" : "Ella";
    const possessive = gender.toLowerCase() === "male" ? "su" : "su";

    return [
      {
        title: "Guion 1: Gancho de Problema / Solución (UGC)",
        hook: `¿Te ha pasado que buscas algo realmente efectivo para ${scriptTopic} y nada funciona?`,
        body: `Llevo semanas probando de todo y por fin encontré la solución. Esto cambia por completo las reglas del juego y los resultados son inmediatos.`,
        cta: `Si quieres ver el cambio real, haz clic abajo y pruébalo hoy mismo. ¡No te vas a arrepentir!`,
        scenes: [
          {
            dialogue: `¿Te ha pasado que buscas algo realmente efectivo para ${scriptTopic} y nada funciona?`,
            visual_prompt: `A close-up video of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer with a ${faceShape} face shape and ${hairLength} ${hairTexture} ${hairColor} hair. ${pronounCaps} has a frustrated expression, looking directly at the camera, holding a product related to ${scriptTopic} in ${possessive} hand, soft natural lighting, realistic skin texture, slow camera pan, raw UGC style.`
          },
          {
            dialogue: `Llevo semanas probando de todo y por fin encontré la solución. Esto cambia por completo las reglas del juego y los resultados son inmediatos.`,
            visual_prompt: `Medium shot of ${charName}, showing ${possessive} ${faceShape} face with a satisfied smile. ${pronounCaps} is demonstrating how to apply/use the ${scriptTopic} product, showing details of the bottle. Warm daylight, shallow depth of field, natural skin texture, cinematic motion.`
          },
          {
            dialogue: `Si quieres ver el cambio real, haz clic abajo y pruébalo hoy mismo. ¡No te vas a arrepentir!`,
            visual_prompt: `A bright, friendly close-up of ${charName} smiling warmly, pointing down towards the call to action, holding the ${scriptTopic} product next to ${possessive} face. Natural pores, soft bokeh background, steady smartphone footage, realistic UGC look.`
          }
        ]
      },
      {
        title: "Guion 2: Unboxing y Primeras Impresiones",
        hook: `¡Por fin me llegó esto! El unboxing que todos estaban esperando para ${scriptTopic}.`,
        body: `Miren este empaque tan premium. El olor y la textura son increíbles. Se siente súper ligero en la piel y se absorbe al instante.`,
        cta: `Déjame un comentario si quieres que haga una reseña de uso completo en los próximos días.`,
        scenes: [
          {
            dialogue: `¡Por fin me llegó esto! El unboxing que todos estaban esperando para ${scriptTopic}.`,
            visual_prompt: `A video of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer, unboxing a beautiful package on a table. ${pronounCaps} is smiling excitedly, ${possessive} ${hairLength} ${hairColor} hair falling gently over ${possessive} shoulders. Dynamic camera movement, shallow depth of field.`
          },
          {
            dialogue: `Miren este empaque tan premium. El olor y la textura son increíbles. Se siente súper ligero en la piel y se absorbe al instante.`,
            visual_prompt: `Extreme close-up on ${charName}'s hands carefully opening the box to reveal the premium ${scriptTopic} container. The camera pulls back slightly to show ${possessive} happy face and glowing ${skinTone} skin under bright window light.`
          },
          {
            dialogue: `Déjame un comentario si quieres que haga una reseña de uso completo en los próximos días.`,
            visual_prompt: `Medium shot of ${charName} holding the product bottle close to the lens, waving friendly at the camera. ${pronounCaps} has a warm, inviting expression, detailed skin texture, raw home video style.`
          }
        ]
      },
      {
        title: "Guion 3: Reseña de Estilo de Vida (Lifestyle)",
        hook: `Esta es mi rutina diaria secreta y el ingrediente clave para ${scriptTopic}.`,
        body: `Mucha gente me pregunta cómo mantengo esta consistencia. El secreto es simple: usar esto todas las mañanas sin falta. Es práctico, rápido y efectivo.`,
        cta: `Si quieres simplificar tu rutina, te dejo el enlace directo aquí mismo. ¡Pruébalo!`,
        scenes: [
          {
            dialogue: `Esta es mi rutina diaria secreta y el ingrediente clave para ${scriptTopic}.`,
            visual_prompt: `A lifestyle video of ${charName} in a cozy, bright room. ${pronounCaps} has ${hairLength} ${hairTexture} ${hairColor} hair in a casual style, wearing comfortable clothes. The camera follows ${possessive} movements as ${pronounCaps} walks towards the bathroom mirror.`
          },
          {
            dialogue: `Mucha gente me pregunta cómo mantengo esta consistencia. El secreto es simple: usar esto todas las mañanas sin falta. Es práctico, rápido y efectivo.`,
            visual_prompt: `Close-up shot of ${charName}'s face in the mirror as ${pronounCaps} applies the ${scriptTopic} product. ${possessive} skin looks natural with visible pores, showcasing realistic texture. Warm bathroom light, soft reflection, professional camera movement.`
          },
          {
            dialogue: `Si quieres simplificar tu rutina, te dejo el enlace directo aquí mismo. ¡Pruébalo!`,
            visual_prompt: `Medium shot of ${charName} sitting on a bed or sofa, smiling sincerely into the camera, gesturing towards the screen. The room is filled with soft natural light, creating a friendly and authentic UGC atmosphere.`
          }
        ]
      }
    ];
  }
};
