/**
 * LoRA training pack (Fase L — L0).
 *
 * Free path: arma un dataset + captions listos para entrenar una LoRA de personaje
 * (Flux/SDXL) en Colab gratis (ai-toolkit) o self-host. NO entrena aquí ni requiere
 * GPU/token/pago — solo empaqueta lo que el Studio ya generó (anclas + variantes)
 * y deriva captions del `character_lock`.
 *
 * @see ROADMAP.md — "Fase L — LoRAs de personaje (opt-in, sin romper free)"
 */
'use strict';

const brandKit = require('./brand-kit');

function slugify(name) {
  return String(name || 'influencer')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'influencer';
}

/** Palabra de clase para el token (importa para que el modelo aprenda la identidad). */
function classWord(persona) {
  const g = String(persona.gender || '').toLowerCase();
  if (/\b(male|hombre|masculino|man|chico)\b/.test(g) && !/\b(female|mujer|femenino)\b/.test(g)) {
    return 'man';
  }
  return 'woman';
}

/** Token único y raro para no colisionar con conceptos del modelo base. */
function buildTriggerToken(persona) {
  const slug = slugify(persona.name).replace(/_/g, '');
  return `ohwx_${slug}`.slice(0, 40);
}

/** Limpia una frase de variante para caption (quita paréntesis y ruido). */
function cleanPhrase(s) {
  if (!s) return '';
  return String(s)
    .split('(')[0]
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Caption por imagen. Best-practice de LoRA de personaje: el trigger + clase capturan
 * la identidad; solo describimos lo que VARÍA (pose, ropa, escena) para no "quemar"
 * rasgos inmutables en cada caption.
 */
function buildCaption({ trigger, cls, variant }) {
  const parts = [`${trigger} ${cls}`];
  if (variant) {
    const pose = cleanPhrase(variant.pose);
    const clothing = cleanPhrase(variant.clothing);
    const attitude = cleanPhrase(variant.attitude);
    const setting = cleanPhrase(variant.setting);
    if (pose) parts.push(pose);
    if (clothing) parts.push(`wearing ${clothing}`);
    if (attitude) parts.push(attitude);
    if (setting) parts.push(setting);
  } else {
    parts.push('portrait, looking at camera, neutral background');
  }
  parts.push('photo, photorealistic');
  // dedupe conservando orden
  return [...new Set(parts.filter(Boolean))].join(', ');
}

function buildConfigYaml({ trigger, cls, steps = 2000 }) {
  return `# ai-toolkit — Flux LoRA de personaje (influ-JSON, Fase L)
# Repo: https://github.com/ostris/ai-toolkit
# Coloca este archivo junto a la carpeta "dataset/" y ejecuta el entrenamiento.
---
job: extension
config:
  name: "${trigger}_flux_lora"
  process:
    - type: sd_trainer
      training_folder: "output"
      device: cuda:0
      trigger_word: "${trigger}"
      network:
        type: lora
        linear: 16
        linear_alpha: 16
      save:
        dtype: float16
        save_every: 250
        max_step_saves_to_keep: 4
      datasets:
        - folder_path: "dataset"
          caption_ext: "txt"
          caption_dropout_rate: 0.05
          shuffle_tokens: false
          cache_latents_to_disk: true
          resolution: [512, 768, 1024]
      train:
        batch_size: 1
        steps: ${steps}
        gradient_accumulation_steps: 1
        train_unet: true
        train_text_encoder: false
        gradient_checkpointing: true
        noise_scheduler: flowmatch
        optimizer: adamw8bit
        lr: 1e-4
        dtype: bf16
      model:
        # Flux-dev requiere aceptar licencia + token HF. Alternativa libre: FLUX.1-schnell.
        name_or_path: "black-forest-labs/FLUX.1-dev"
        is_flux: true
        quantize: true
      sample:
        sampler: flowmatch
        sample_every: 250
        width: 1024
        height: 1024
        prompts:
          - "${trigger} ${cls}, portrait, soft natural light, photorealistic"
          - "${trigger} ${cls}, full body, standing, street background, photo"
        neg: ""
        seed: 42
        walk_seed: true
        guidance_scale: 4
        sample_steps: 20
meta:
  name: "${trigger}"
  version: "1.0"
`;
}

function buildReadme({ persona, trigger, cls, count }) {
  const name = persona.name || 'influencer';
  const few = count < 8;
  return `influ-JSON — PACK DE ENTRENAMIENTO LoRA (Fase L / L0)
=====================================================
Influencer: ${name}
Trigger word: ${trigger}   (clase: ${cls})
Imágenes en el dataset: ${count}
Fecha: ${new Date().toISOString()}

QUÉ ES ESTO
-----------
Un paquete listo para entrenar una LoRA de personaje (Flux/SDXL) que fije la
identidad de "${name}" de forma más fuerte que el prompt + character_lock.
Este .zip NO entrena nada ni cuesta dinero: solo reúne tus imágenes y captions.

CONTENIDO
---------
• dataset/            → imágenes (img_XX.jpg) + su caption (img_XX.txt)
• config/ai-toolkit-flux.yaml → config de entrenamiento (ai-toolkit)
• character_lock.json → referencia de identidad (no se usa al entrenar)
• trigger.txt         → el token para invocar al personaje: "${trigger}"
• README.txt          → este archivo

CÓMO ENTRENAR GRATIS (Google Colab + ai-toolkit)
------------------------------------------------
Guía + notebook del repo (Fase L / L1):
  docs/lora/L1_COLAB.md
  docs/lora/influ_json_lora_train.ipynb

Resumen:
1. Abre el notebook en Colab (File → Upload) y elige GPU T4.
2. Ejecuta las celdas: instalar ai-toolkit → subir ESTE .zip → entrenar → descargar .safetensors.
3. Flux-dev requiere token Hugging Face + aceptar la licencia.
   Alternativa libre: en el notebook pon USE_SCHNELL = True (FLUX.1-schnell).
4. Usa el trigger word "${trigger}" al inferir
   (ej: "${trigger} ${cls}, full body, en la playa").

Sin notebook (manual):
  !git clone https://github.com/ostris/ai-toolkit && cd ai-toolkit && pip install -r requirements.txt
  # Copia dataset/ + config/ aquí y: python run.py config/ai-toolkit-flux.yaml

CONSEJOS (para buena consistencia)
----------------------------------
• Ideal 15–30 imágenes coherentes de la MISMA persona (frontal, 3/4, cuerpo, distintas luces).${few ? `
• ⚠ Tienes solo ${count} imagen(es). Genera más variantes consistentes en el Studio
  y vuelve a exportar para un mejor resultado.` : ''}
• Borra del dataset cualquier imagen donde la cara/tez se haya desviado.
• Los captions describen SOLO lo que cambia (pose/ropa/fondo); la identidad la
  aprende el trigger word. No agregues rasgos de cara en los captions.

NOTA
----
Entrenar requiere GPU (por eso el paso gratis es Colab, no local). El resto de
influ-JSON (JSON + Pollinations + chatbots gratis) sigue funcionando sin esto.
`;
}

/**
 * Construye los archivos de texto del pack + el plan de dataset.
 * El caller (endpoint) resuelve rutas absolutas y agrega las imágenes al ZIP.
 *
 * @param {object} persona  persona (con detailedJSON, image, gender, name…)
 * @param {Array}  variants variantes [{ image_path, pose, clothing, attitude, setting }]
 * @param {object} [opts]   { maxImages }
 * @returns {{
 *   triggerToken: string, classWord: string, count: number,
 *   datasetItems: Array<{ srcRelPath: string, imageName: string, captionName: string, caption: string }>,
 *   textFiles: Array<{ name: string, content: string }>
 * }}
 */
function buildLoraPack(persona, variants = [], opts = {}) {
  const maxImages = Number.isFinite(opts.maxImages) ? opts.maxImages : 40;
  const trigger = buildTriggerToken(persona);
  const cls = classWord(persona);

  // Fuentes de imagen: ancla primero, luego variantes (dedup por ruta).
  const sources = [];
  const seen = new Set();
  const pushSrc = (relPath, variant) => {
    if (!relPath) return;
    const key = String(relPath);
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ relPath: key, variant: variant || null });
  };
  pushSrc(persona.image, null);
  (variants || []).forEach((v) => pushSrc(v.image_path, v));

  const datasetItems = sources.slice(0, maxImages).map((src, i) => {
    const idx = String(i + 1).padStart(2, '0');
    const extMatch = /\.([a-z0-9]{2,5})$/i.exec(src.relPath || '');
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.jpg';
    const base = `img_${idx}`;
    return {
      srcRelPath: src.relPath,
      imageName: `${base}${ext}`,
      captionName: `${base}.txt`,
      caption: buildCaption({ trigger, cls, variant: src.variant })
    };
  });

  const count = datasetItems.length;
  const { lock } = brandKit.buildBrandKitFiles(persona);

  const textFiles = [
    { name: 'README.txt', content: buildReadme({ persona, trigger, cls, count }) },
    { name: 'trigger.txt', content: `${trigger}\n\nUso: "${trigger} ${cls}, <pose/escena>"\n` },
    { name: 'config/ai-toolkit-flux.yaml', content: buildConfigYaml({ trigger, cls }) },
    { name: 'character_lock.json', content: JSON.stringify(lock, null, 2) }
  ];

  return { triggerToken: trigger, classWord: cls, count, datasetItems, textFiles };
}

module.exports = {
  buildLoraPack,
  buildTriggerToken,
  buildCaption,
  classWord,
  slugify
};
