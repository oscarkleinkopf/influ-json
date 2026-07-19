const { GoogleGenAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { DATA_DIR, ensureDir } = require('./paths');

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
        CRITICAL: Match the real skin lightness from the photo. If the person is fair/light-skinned, set skin_tone and skin_tone_hex accordingly — do NOT darken or assume "Latina = morena".
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
          "body": {
            "body_type": "e.g. Curvilíneo / reloj de arena, Atlético, Esbelto",
            "height_appearance": "e.g. Estatura media ~1.65m",
            "proportions": "shoulders, waist, hips relationship",
            "posture": "how they hold shoulders/neck/spine",
            "fitness_level": "muscle tone level",
            "shoulders": "shoulder width/shape",
            "waist_hip_balance": "waist vs hips",
            "limbs": "arm/leg proportions",
            "hands": "hand appearance",
            "skin_continuity": "skin tone continuity face→neck→arms",
            "visible_framing": "prefer medium shot with torso visible"
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
            "composition": "Prefer medium shot with face + upper body, not face-only crop",
            "framing": "e.g. Plano medio mostrando hombros y torso",
            "mood": "Description",
            "post_processing": "Description"
          },
          "clothing": {
            "type": "Description of clothing worn in photo",
            "color": "Color of clothing in photo",
            "material": "Material of clothing in photo",
            "neckline": "Neckline shape",
            "fit": "How clothing fits THIS body type",
            "visible_brand_logos": "Ninguno"
          }
        }
        IMPORTANT: Infer FULL BODY attributes (silhouette, height, proportions, posture) even from a selfie — do not leave body empty or face-only.
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
          "body": {
            "body_type": "silhouette type",
            "height_appearance": "apparent height",
            "proportions": "shoulders/waist/hips",
            "posture": "posture description",
            "fitness_level": "tone level",
            "shoulders": "shoulder description",
            "waist_hip_balance": "waist vs hips",
            "limbs": "arm/leg proportions",
            "hands": "hand appearance",
            "skin_continuity": "skin tone face to body",
            "visible_framing": "medium shot with torso preferred"
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
            "composition": "medium shot face + upper body",
            "framing": "Plano medio con torso visible",
            "mood": "Description",
            "post_processing": "Description"
          },
          "clothing": {
            "type": "Description of clothing worn in photo",
            "color": "Color of clothing in photo",
            "material": "Material of clothing in photo",
            "neckline": "Neckline shape",
            "fit": "How clothing fits THIS body",
            "visible_brand_logos": "Ninguno"
          }
        }
        IMPORTANT: Infer FULL BODY attributes across photos (silhouette, height, proportions, posture) — not face-only.
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
    // Reinforce skin lock if prompt already mentions light skin / hex, to fight model drift
    let finalPrompt = prompt || '';
    const hexMatch = finalPrompt.match(/#([a-fA-F0-9]{6})/);
    if (hexMatch) {
      const rgb = this.hexToRgb(`#${hexMatch[1]}`);
      const skinInfo = this.classifySkinToneFromRgb(rgb);
      if (skinInfo.band === 'very_light' || skinInfo.band === 'light' || skinInfo.band === 'light_warm') {
        finalPrompt += `. ${this.buildSkinLockFragment(skinInfo.label, `#${hexMatch[1]}`, skinInfo)}`;
      }
    } else if (/clara|fair|porcelain|beige claro|porcelana|light skin/i.test(finalPrompt)
            && !/NOT dark|no dark|avoid.*morena/i.test(finalPrompt)) {
      finalPrompt += '. SKIN LOCK: fair light complexion only, NOT dark, NOT deep tan, NOT morena.';
    }

    if (!ai) {
      console.log('Using Pollinations.ai free keyless generator for virtual portrait...');

      const fetchPollinations = async (refUrl) => {
        let url = `https://image.pollinations.ai/p/${encodeURIComponent(finalPrompt)}?width=768&height=768&model=flux&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 100000)}`;
        if (refUrl) {
          // Higher strength to keep reference skin tone
          url += `&image=${encodeURIComponent(refUrl)}&strength=0.72`;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`Pollinations HTTP error: ${res.status}`);
          return res;
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      };

      try {
        let res;
        if (referenceUrl) {
          try {
            res = await fetchPollinations(referenceUrl);
          } catch (refErr) {
            console.warn(`Pollinations image-to-image failed (${refErr.message}), falling back to text prompt generation...`);
            res = await fetchPollinations(null);
          }
        } else {
          res = await fetchPollinations(null);
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const filename = `gen_flux_${Date.now()}.jpg`;
        const relativePath = `assets/generated/${filename}`;
        const absolutePath = path.join(__dirname, relativePath);

        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(absolutePath, buffer);

        // Mirror into portable DATA_DIR (not Antigravity brain path)
        const scratchGenDir = path.join(DATA_DIR, 'generated');
        ensureDir(scratchGenDir);
        fs.writeFileSync(path.join(scratchGenDir, filename), buffer);

        console.log(`Pollinations Image generated and saved to: ${relativePath}`);
        return relativePath;
      } catch (err) {
        console.error('Pollinations generation error:', err);
        return null;
      }
    }

    try {
      const model = ai.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
      const result = await model.generateImages({
        prompt: finalPrompt,
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

        // Mirror into portable DATA_DIR (not Antigravity brain path)
        const scratchGenDir = path.join(DATA_DIR, 'generated');
        ensureDir(scratchGenDir);
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
      if (!localPath || localPath.includes('influencer_female.png') || localPath.includes('influencer_male.png')) {
        return null;
      }
      const absolutePath = path.resolve(localPath);
      if (!fs.existsSync(absolutePath) || fs.lstatSync(absolutePath).isDirectory()) {
        return null;
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      const fileBlob = new Blob([fileBuffer], { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', fileBlob, path.basename(absolutePath));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`tmpfiles.org API responded with status ${res.status}`);
      const data = await res.json();
      if (data && data.data && data.data.url) {
        const directUrl = data.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
        console.log(`Uploaded local image ${localPath} to tmpfiles.org successfully: ${directUrl}`);
        return directUrl;
      }
      return null;
    } catch (e) {
      console.warn('Skipping tmpfiles.org upload (fallback to prompt-only generation):', e.message);
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

    const body = detailed.body || {};
    const bodyType = body.body_type || detailed.identity?.body_type || "atlético / proporcionado";
    const heightApp = body.height_appearance || "estatura media";
    const proportions = body.proportions || "proporciones armónicas hombros-cintura-cadera";
    const posture = body.posture || "postura erguida y relajada";
    const fitness = body.fitness_level || "tono natural ligero";
    const bodySkin = body.skin_continuity || "mismo tono de piel en rostro, cuello y brazos";

    const referenceUrl = options.referenceUrl || "";
    const scene = (sceneDescription && sceneDescription.trim() !== "") 
        ? sceneDescription.trim() 
        : "en un entorno luminoso y natural, mirada directa a cámara, expresión auténtica, plano medio con hombros y torso visibles";

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
    "ideogram": "string",
    "grok_imagine": "string",
    "chatgpt": "string",
    "meta_ai": "string"
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
CUERPO COMPLETO (obligatorio, no solo rostro):
- Complexión: ${bodyType}
- Estatura: ${heightApp}
- Proporciones: ${proportions}
- Postura: ${posture}
- Fitness: ${fitness}
- Piel corporal: ${bodySkin}
Estética: ${overallVibe}, ${fashionStyle}, ${makeupLevel}
Fotografía: ${camera}, ${lighting}, ${colorGrade}, ${depthOfField}

Escena deseada: ${scene}

Genera la Character Bible con fuerte énfasis en: (1) realismo de piel, (2) identidad facial, (3) silueta y cuerpo consistentes en plano medio.`;

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
    const characterLock = `${charName} is a ${age} ${ethnicity} ${gender.toLowerCase()} with a ${faceShape} face AND a consistent full-body silhouette. 
Key facial features: ${skinTone} skin with visible natural pores, subtle skin texture and ${skinTexture}. 
Eyes: ${eyeColor}, ${eyeShape} shape, with ${eyebrows}. 
Lips: ${lips}. Jawline: ${jawline}. 
Hair: ${hairLength}, ${hairTexture}, ${hairColor} with ${hairStyle} style. 
FULL BODY LOCK: ${bodyType}; height ${heightApp}; proportions ${proportions}; posture ${posture}; fitness ${fitness}; ${bodySkin}. 
Overall aesthetic: ${overallVibe}, ${fashionStyle} style with ${makeupLevel}. Never face-only — keep shoulders, torso and posture consistent.`;

    // --- Positive Prompt (cara + cuerpo) ---
    const positivePrompt = `Raw unedited UGC smartphone photograph of ${charName}, a ${age} ${ethnicity} ${gender.toLowerCase()} influencer, medium shot showing face and upper body. 
She has a ${faceShape} face with ${skinTone} skin showing natural pores, subtle skin texture, fine details and ${skinTexture}. 
Her eyes are ${eyeColor} with ${eyeShape} shape, ${eyebrows}, and she has ${lips}. 
Hair is ${hairLength}, ${hairTexture}, ${hairColor} with ${hairStyle}. 
Body: ${bodyType}, ${heightApp}, ${proportions}, ${posture}, ${fitness}. ${bodySkin}. 
She is ${scene}. 
Captured with ${camera}, ${lighting}, ${colorGrade} color grade, ${depthOfField}, realistic skin texture on face neck and arms, natural imperfections, authentic candid moment, high detail, unedited smartphone quality, consistent facial AND body identity.`;

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
            ideogram: ideogramPrompt.replace(/\s+/g, ' ').trim(),
            grok_imagine: `Raw amateur smartphone photo of ${charName}, ${age} ${ethnicity} ${gender.toLowerCase()} influencer. ${faceShape} face, ${skinTone} skin with visible natural pores and real texture. She is ${scene}. Realistic camera lighting, candid capture.`.replace(/\s+/g, ' ').trim(),
            chatgpt: `Actúa como ${charName}, una creadora de contenido e influencer de ${age} años, de apariencia ${ethnicity}. Su personalidad es ${overallVibe}. Escribe en primera persona, manteniendo un tono muy natural, conversacional y directo para sus publicaciones y guiones de video.`.replace(/\s+/g, ' ').trim(),
            meta_ai: `Realistic candid photo of ${charName}, ${age} ${ethnicity} ${gender.toLowerCase()} influencer, ${faceShape} face, ${skinTone} skin, natural pores, looking at camera. ${scene}. Bright daylight, high definition.`.replace(/\s+/g, ' ').trim()
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
  },

  hexToRgb(hex) {
    if (!hex) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  },

  rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  },

  /**
   * Classify skin from RGB. Used to avoid "Latina → morena" bias when skin is actually fair.
   */
  classifySkinToneFromRgb(rgb) {
    if (!rgb) {
      return {
        label: 'Piel clara / beige claro',
        lock: 'fair light beige skin, light complexion',
        avoid: 'dark skin, deep tan, brown skin, morena, ebony',
        band: 'light'
      };
    }
    const { r, g, b } = rgb;
    const brightness = (r + g + b) / 3;
    const warmth = r - b;

    // Fair / light first (was previously misclassified as "Tono Natural" → generators drift darker)
    if (brightness >= 205) {
      return {
        label: 'Piel muy clara / porcelana',
        lock: 'very fair porcelain light skin, pale beige-pink undertone',
        avoid: 'dark skin, tan skin, brown skin, morena, deep bronze',
        band: 'very_light'
      };
    }
    if (brightness >= 175) {
      return {
        label: 'Piel clara / beige claro',
        lock: 'fair light skin, light beige complexion, pale warm ivory',
        avoid: 'dark skin, deep tan, morena, brown skin, ebony',
        band: 'light'
      };
    }
    if (brightness >= 155) {
      return {
        label: 'Piel clara cálida / arena clara',
        lock: 'light warm fair skin, light golden beige (still fair, not dark)',
        avoid: 'dark brown skin, deep morena, ebony',
        band: 'light_warm'
      };
    }
    if (brightness >= 130) {
      if (warmth > 30) {
        return {
          label: 'Piel media cálida / oliva clara',
          lock: 'light-medium warm olive skin',
          avoid: 'very dark skin, ebony',
          band: 'medium_light'
        };
      }
      return {
        label: 'Piel media neutra',
        lock: 'medium neutral skin tone',
        avoid: 'unnatural orange skin',
        band: 'medium'
      };
    }
    if (brightness >= 95) {
      return {
        label: 'Piel morena media / canela',
        lock: 'medium brown / cinnamon skin tone',
        avoid: 'pale porcelain skin if inconsistent with reference',
        band: 'medium_dark'
      };
    }
    return {
      label: 'Piel morena oscura / profunda',
      lock: 'deep brown / dark skin tone',
      avoid: 'pale skin, whitewashed skin',
      band: 'dark'
    };
  },

  /**
   * Real spatial sampling with sharp (was a stub returning fixed #e6c29e tan — caused dark drift).
   * Prefers skin-like pixels in the face center region.
   */
  async extractSpatialColorProperties(imagePath) {
    const sharp = require('sharp');
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(__dirname, imagePath);

    const fallback = {
      hair: '#3d2314',
      skin: '#f0d5c0', // light default, NOT medium tan
      dominant: '#e8e0d8',
      skinClass: this.classifySkinToneFromRgb({ r: 240, g: 213, b: 192 })
    };

    try {
      if (!fs.existsSync(absolutePath)) {
        console.warn('[colors] Image not found for extraction:', absolutePath);
        return fallback;
      }

      const size = 120;
      const { data, info } = await sharp(absolutePath)
        .rotate() // respect EXIF
        .resize(size, size, { fit: 'cover', position: 'attention' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const w = info.width;
      const h = info.height;
      const channels = info.channels || 3;

      const sampleRegion = (x1, y1, x2, y2, skinOnly = false) => {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        const xs = Math.floor((x1 / 100) * w);
        const xe = Math.floor((x2 / 100) * w);
        const ys = Math.floor((y1 / 100) * h);
        const ye = Math.floor((y2 / 100) * h);
        for (let y = ys; y < ye; y++) {
          for (let x = xs; x < xe; x++) {
            const i = (y * w + x) * channels;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (skinOnly) {
              // Heuristic: skin-like (warm, not too green, not pure black/white)
              const bright = (r + g + b) / 3;
              if (r < 60 || bright > 245) continue;
              if (r <= g + 2) continue; // skin usually R > G
              if (g <= b - 15) continue; // avoid cool/blue shadows
              if (r - b < 8) continue;
            }
            rSum += r; gSum += g; bSum += b; count++;
          }
        }
        if (count === 0) return null;
        return {
          r: Math.round(rSum / count),
          g: Math.round(gSum / count),
          b: Math.round(bSum / count)
        };
      };

      // Face/cheek zones (multiple windows); prefer skin-filtered samples
      const skinZones = [
        sampleRegion(38, 32, 62, 58, true),
        sampleRegion(42, 40, 58, 62, true),
        sampleRegion(35, 28, 65, 50, true)
      ].filter(Boolean);

      let skinRgb = null;
      if (skinZones.length) {
        skinRgb = {
          r: Math.round(skinZones.reduce((s, z) => s + z.r, 0) / skinZones.length),
          g: Math.round(skinZones.reduce((s, z) => s + z.g, 0) / skinZones.length),
          b: Math.round(skinZones.reduce((s, z) => s + z.b, 0) / skinZones.length)
        };
      } else {
        // Fallback: unfiltered center average
        skinRgb = sampleRegion(40, 35, 60, 55, false) || { r: 240, g: 213, b: 192 };
      }

      const leftHair = sampleRegion(10, 15, 28, 45, false);
      const rightHair = sampleRegion(72, 15, 90, 45, false);
      const topHair = sampleRegion(35, 5, 65, 22, false);
      const hairSamples = [leftHair, rightHair, topHair].filter(Boolean);
      let hairRgb = { r: 61, g: 35, b: 20 };
      if (hairSamples.length) {
        hairRgb = {
          r: Math.round(hairSamples.reduce((s, z) => s + z.r, 0) / hairSamples.length),
          g: Math.round(hairSamples.reduce((s, z) => s + z.g, 0) / hairSamples.length),
          b: Math.round(hairSamples.reduce((s, z) => s + z.b, 0) / hairSamples.length)
        };
      }

      const tl = sampleRegion(0, 0, 18, 18, false);
      const tr = sampleRegion(82, 0, 100, 18, false);
      const domSamples = [tl, tr, skinRgb].filter(Boolean);
      const dominantRgb = {
        r: Math.round(domSamples.reduce((s, z) => s + z.r, 0) / domSamples.length),
        g: Math.round(domSamples.reduce((s, z) => s + z.g, 0) / domSamples.length),
        b: Math.round(domSamples.reduce((s, z) => s + z.b, 0) / domSamples.length)
      };

      const skinClass = this.classifySkinToneFromRgb(skinRgb);
      const result = {
        hair: this.rgbToHex(hairRgb.r, hairRgb.g, hairRgb.b),
        skin: this.rgbToHex(skinRgb.r, skinRgb.g, skinRgb.b),
        dominant: this.rgbToHex(dominantRgb.r, dominantRgb.g, dominantRgb.b),
        skinClass,
        skinRgb,
        hairRgb
      };
      console.log(`[colors] Extracted from ${path.basename(absolutePath)}: skin=${result.skin} (${skinClass.label}), hair=${result.hair}`);
      return result;
    } catch (err) {
      console.warn('[colors] extractSpatialColorProperties failed:', err.message);
      return fallback;
    }
  },

  /** Build prompt fragment that locks skin tone (prevents Latina→morena drift). */
  buildSkinLockFragment(skinToneLabel, skinHex, skinClass) {
    const cls = skinClass || this.classifySkinToneFromRgb(this.hexToRgb(skinHex));
    const label = skinToneLabel || cls.label;
    const hexPart = skinHex ? ` exact skin hex ${skinHex}` : '';
    const lock = cls.lock || 'natural realistic skin';
    const avoid = cls.avoid || 'unnatural skin color';
    return `SKIN LOCK (critical): ${label}${hexPart}. ${lock}. Match reference skin lightness exactly. Avoid: ${avoid}, orange self-tanner cast, over-bronzed filter.`;
  },

  async generateScratchPersonaDetails(params = {}) {
    const { name = 'Influencer', gender = 'Female', age = '25 años', ethnicity = 'Latina', style = 'Natural' } = params;

    if (ai) {
      try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `Eres un diseñador experto de personajes e influencers virtuales hiperrealistas.
Dado este personaje básico:
- Nombre: ${name}
- Género: ${gender}
- Edad: ${age}
- Etnia/Origen: ${ethnicity}
- Estilo/Vibe general: ${style}

Genera rasgos físicos detallados de CARA Y CUERPO COMPLETO (silueta, estatura, proporciones, postura), realistas y coherentes en formato JSON.
Responde ÚNICAMENTE con un JSON válido usando esta estructura exacta sin markdown extra:
{
  "facial_features": {
    "skin_tone": "string",
    "skin_texture": "string",
    "face_shape": "string",
    "eye_color": "string",
    "eye_shape": "string",
    "eyebrow_style": "string",
    "lip_shape": "string",
    "jawline": "string",
    "smile_type": "string"
  },
  "body": {
    "body_type": "string",
    "height_appearance": "string",
    "proportions": "string",
    "posture": "string",
    "fitness_level": "string",
    "shoulders": "string",
    "waist_hip_balance": "string",
    "skin_continuity": "string"
  },
  "hair": {
    "color": "string",
    "texture": "string",
    "length": "string",
    "style": "string"
  },
  "aesthetic": {
    "overall_vibe": "string",
    "fashion_style": "string",
    "makeup_level": "string"
  },
  "photography": {
    "camera_lens": "string",
    "lighting_type": "string",
    "color_grade": "string",
    "depth_of_field": "string",
    "framing": "Plano medio con torso visible"
  }
}`;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.warn('Online scratch details generation failed, using offline fallback:', err.message);
      }
    }

    return this.getOfflineScratchDetails(gender, ethnicity, style);
  },

  getOfflineScratchDetails(gender = 'Female', ethnicity = 'Latina', style = 'Natural') {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const isMale = String(gender).toLowerCase() === 'male';

    const skinTones = ['Piel clara dorada', 'Tez morena cálida', 'Piel trigueña luminosa', 'Piel oliva suave', 'Piel canela radiante'];
    const skinTextures = ['Piel suave con poros reales y pecas sutiles', 'Textura natural hiperrealista sin retoques', 'Piel fresca luminosa con micro-textura real'];
    const faceShapes = ['Ovalada con pómulos marcados', 'Corazón con mentón suave', 'Cuadrada con mandíbula estructurada', 'Ovalada estilizada'];
    const eyeColors = ['Marrón cálido con destellos miel', 'Avellana profundo', 'Verde oliva místico', 'Marrón oscuro expresivo'];
    const eyeShapes = ['Almendrados y grandes', 'Ojos felinos definidos', 'Ojos profundos y expresivos'];
    const eyebrows = ['Cejas pobladas y definidas', 'Cejas arqueadas naturales', 'Cejas rectas y bien cuidadas'];
    const lips = isMale 
      ? ['Labios definidos de grosor medio', 'Labios naturales simétricos'] 
      : ['Labios carnosos con arco de cupido definido', 'Labios rosados naturales carnosos', 'Labios de volumen medio bien definidos'];

    const hairColors = ['Castaño oscuro brillante', 'Marrón chocolate', 'Rubio miel natural', 'Negro azabache con brillo', 'Castaño claro dorado'];
    const hairTextures = ['Ondulado natural con cuerpo', 'Liso sedoso', 'Rizado suave definido', 'Ligeramente despeinado con textura'];
    const hairLengths = isMale 
      ? ['Corto a los lados con volumen arriba', 'Corte texturizado de longitud media', 'Corto estilo degradado moderno'] 
      : ['Largo por debajo de los hombros', 'Corte bob medio elegante', 'Largo en capas con movimiento'];
    const hairStyles = isMale
      ? ['Peinado hacia atrás relajado', 'Estilo desenfadado natural']
      : ['Partido al medio suelto', 'Ondas playeras sueltas', 'Suelto sobre un hombro'];

    const bodyTypes = isMale
      ? ['Atlético proporcionado', 'Delgado y alto', 'Fit con hombros marcados', 'Complexión media natural']
      : ['Atlético y proporcionado', 'Esbelto con curvas suaves', 'Curvilíneo / reloj de arena', 'Complexión media natural'];
    const heights = isMale
      ? ['Estatura media-alta (~1.78 m)', 'Estatura media (~1.75 m)', 'Aparente alto (~1.82 m)']
      : ['Estatura media (~1.65 m)', 'Estatura media-alta (~1.70 m)', 'Aparente petite-media (~1.60 m)'];

    return {
      facial_features: {
        skin_tone: pick(skinTones),
        skin_texture: pick(skinTextures),
        face_shape: pick(faceShapes),
        eye_color: pick(eyeColors),
        eye_shape: pick(eyeShapes),
        eyebrow_style: pick(eyebrows),
        lip_shape: pick(lips),
        jawline: isMale ? 'Mandíbula firme y estructurada' : 'Mandíbula suave y definida',
        smile_type: 'Sonrisa cálida, auténtica y natural'
      },
      body: {
        body_type: pick(bodyTypes),
        height_appearance: pick(heights),
        proportions: isMale
          ? 'Hombros más anchos que la cintura, torso en V suave, piernas largas'
          : 'Hombros equilibrados, cintura definida, caderas suaves y proporcionales',
        posture: 'Erguida y relajada, hombros sueltos, cuello alargado',
        fitness_level: isMale ? 'Tono atlético ligero, sin volumen exagerado' : 'Tono natural ligero, sin musculatura exagerada',
        shoulders: isMale ? 'Hombros firmes y naturales' : 'Hombros suaves y naturales',
        waist_hip_balance: isMale ? 'Cintura más estrecha que hombros' : 'Cintura y caderas en proporción armónica',
        limbs: 'Brazos y piernas proporcionados al torso',
        hands: 'Manos naturales',
        skin_continuity: 'Mismo tono de piel en rostro, cuello, hombros y brazos',
        visible_framing: 'Plano medio con hombros y torso visibles'
      },
      hair: {
        color: pick(hairColors),
        texture: pick(hairTextures),
        length: pick(hairLengths),
        style: pick(hairStyles)
      },
      aesthetic: {
        overall_vibe: `${style} & auténtico`,
        fashion_style: isMale ? 'Casual moderno atemporal' : 'Casual chic atemporal',
        makeup_level: isMale ? 'Sin maquillaje, piel al natural' : 'Maquillaje natural estilo "no-makeup look"'
      },
      photography: {
        camera_lens: 'iPhone 15 Pro portrait mode (85mm focal)',
        lighting_type: 'Luz de ventana suave y difusa',
        color_grade: 'Tonos cálidos y cinematográficos',
        depth_of_field: 'Desenfoque suave de fondo (bokeh)',
        framing: 'Plano medio con torso visible'
      }
    };
  }
};
