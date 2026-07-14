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
        let url = `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}?width=512&height=512&model=flux&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
        if (referenceUrl) {
          url += `&image=${encodeURIComponent(referenceUrl)}`;
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
  }
};
