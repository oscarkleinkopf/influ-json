/**
 * Corte G / I1 — Recetas de producción portables (JSON sin imágenes ni must_match sensible por defecto).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluProductionRecipe = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_ID = 'influ-recipe/v1';

  /**
   * @param {object} input
   * @param {{ includeIdentity?: boolean }} opts — por defecto NO incluye must_match (plantilla comunitaria)
   */
  function buildRecipe(input = {}, opts = {}) {
    const includeIdentity = opts.includeIdentity === true;
    const must = input.must_match_every_image || input.character_lock?.must_match_every_image || null;
    const recipe = {
      schema_id: SCHEMA_ID,
      version: 1,
      created_at: new Date().toISOString(),
      title: String(input.title || input.name || 'Receta UGC').slice(0, 120),
      persona_ref: {
        name: input.personaName || input.name || null,
        lock_revision_id: input.lockRevisionId || null,
        niche: input.niche || null
      },
      shot: {
        type: input.shotType || 'testimonial',
        camera: input.camera || 'selfie',
        format: input.format || '9:16',
        duration_hint_s: input.durationHint || 15
      },
      product: input.product
        ? {
            name: input.product.name || null,
            benefit: input.product.benefit || null,
            category: input.product.category || null
          }
        : null,
      voice: {
        tone: input.tone || 'cálido y cercano',
        mbti: input.mbti || null,
        cta: input.cta || 'Pruébalo y cuéntame en comentarios'
      },
      pack: {
        free_pack_id: input.packId || 'fullbody',
        notes: input.notes || 'Copiar JSON → chatbot free; gen local opcional'
      }
    };
    if (includeIdentity && must && typeof must === 'object') {
      recipe.identity_opt_in = {
        warning: 'Incluye rasgos must_match — no compartir como plantilla comunitaria',
        must_match_every_image: {
          skin_tone: must.skin_tone || null,
          eye_color: must.eye_color || must.eyes || null,
          hair_color: must.hair_color || null,
          hair_texture: must.hair_texture || null,
          hair_length: must.hair_length || null
        }
      };
    }
    return recipe;
  }

  function validateRecipe(recipe) {
    const errors = [];
    if (!recipe || typeof recipe !== 'object') {
      return { ok: false, errors: ['JSON inválido'] };
    }
    if (recipe.schema_id !== SCHEMA_ID) {
      errors.push(`schema_id debe ser ${SCHEMA_ID}`);
    }
    if (!recipe.title || !String(recipe.title).trim()) {
      errors.push('title requerido');
    }
    if (!recipe.shot || typeof recipe.shot !== 'object') {
      errors.push('shot requerido');
    }
    return { ok: errors.length === 0, errors };
  }

  function toClipboardText(recipe) {
    return JSON.stringify(recipe, null, 2);
  }

  function stripIdentity(recipe) {
    if (!recipe || typeof recipe !== 'object') return recipe;
    const clone = JSON.parse(JSON.stringify(recipe));
    delete clone.identity_opt_in;
    return clone;
  }

  const G513R_LORA_STRENGTH_MID = '0.8';
  const G513R_LORA_STRENGTH_RANGE = '0.7–0.9';
  const G513R_LORA_TRIGGER_PLACEHOLDER = '(ohwx_<slug> al exportar)';
  const G513R_LORA_FILE_HINT =
    'models/loras de Locally Uncensored / ComfyUI (…/ComfyUI/models/loras/<nombre>.safetensors; A1111: models/Lora)';

  function g513rTriggerLabel(triggerToken) {
    const token = String(triggerToken || '').trim();
    return token || G513R_LORA_TRIGGER_PLACEHOLDER;
  }

  function g513rLoraLine(triggerToken) {
    return `LoRA: ${g513rTriggerLabel(triggerToken)} @ ${G513R_LORA_STRENGTH_MID}`;
  }

  const G513R_CHECKPOINTS = [
    {
      id: 'juggernaut_xl_v9',
      file: 'Juggernaut-XL_v9.safetensors',
      role: 'sfw_photoreal',
      use: 'SFW / body / beauty. Default si el shot no es PPV.'
    },
    {
      id: 'realistic_vision_v6',
      file: 'Realistic_Vision_V6.0_NV_B1_fp16.safetensors',
      role: 'sd15_low_vram',
      use: 'SD 1.5 fp16 cuando la VRAM del G513R está justa.'
    },
    {
      id: 'ragnarok',
      file: 'juggernautXL_ragnarok.safetensors',
      role: 'explicit_default',
      use: 'Default para pack explicit/PPV + LoRA en Locally Uncensored / Comfy.'
    },
    {
      id: 'lustify',
      file: 'lustifyNSFWCheckpoint_zenithV9.safetensors',
      role: 'nsfw_optin',
      neverDefault: true,
      use: 'NSFW opt-in. Nunca default del Studio ni del modo chatbots.'
    }
  ];

  /**
   * Receta G513R (ASUS + NVIDIA): texto en Ollama/LM Studio; imagen en LU/Comfy.
   * Positive y Negative van en cajas separadas (Locally Uncensored).
   */
  function buildG513rRecipe(input = {}, opts = {}) {
    const trigger = String(opts.triggerToken || input.lora_trigger || input.triggerToken || '').trim() || null;
    const recipe = buildRecipe({
      ...input,
      title: input.title || `${input.personaName || input.name || 'Influencer'} · G513R local`,
      notes: input.notes || 'GPU NVIDIA local (ASUS G513R). Texto: Ollama / LM Studio. Imagen: Locally Uncensored / Comfy. Positive y Negative en cajas distintas. No sustituye Copiar JSON.',
      packId: input.packId || 'explicit'
    }, opts);
    recipe.kind = 'g513r_local';
    recipe.hardware = {
      device: 'ASUS G513R',
      gpu: 'NVIDIA',
      text: ['ollama', 'lmstudio'],
      image: ['locally_uncensored', 'comfyui']
    };
    recipe.checkpoints = G513R_CHECKPOINTS;
    recipe.inference = {
      default_explicit_checkpoint: 'juggernautXL_ragnarok.safetensors',
      default_sfw_checkpoint: 'Juggernaut-XL_v9.safetensors',
      low_vram_checkpoint: 'Realistic_Vision_V6.0_NV_B1_fp16.safetensors',
      nsfw_optin_checkpoint: 'lustifyNSFWCheckpoint_zenithV9.safetensors',
      lora_strength: G513R_LORA_STRENGTH_RANGE,
      lora_strength_mid: G513R_LORA_STRENGTH_MID,
      trigger_token: trigger,
      lora_line: g513rLoraLine(trigger),
      lora_file_hint: G513R_LORA_FILE_HINT,
      lu_split_prompts: true
    };
    recipe.steps = [
      'Lock sólido en Studio (tez hex, ojos, pelo, silueta, marcas).',
      'Modo de trabajo = GPU NVIDIA local (el default sigue siendo chatbots).',
      'Generar / curar 15–30 variantes (retrato, cuerpo, spicy/explicit).',
      'Export Pack LoRA (L0) + captions (explícitos solo si el checkbox está on).',
      'Entrenar LoRA (Colab L1 o L5 local) con el trigger de la persona.',
      'Copia el .safetensors a models/loras de Locally Uncensored / ComfyUI (el nombre del archivo es el que muestra el picker). Reinicia LU/Comfy si el picker está vacío.',
      'En LU: selecciona el LoRA en el picker; pega el trigger en Positive (caja aparte del Negative). Strength 0.8 (rango 0.7–0.9).',
      'En Locally Uncensored: elige checkpoint (Ragnarok para PPV) → pega POSITIVE en su caja y NEGATIVE en la otra. No mezclar.',
      'Texto (scripts / lock): Ollama o LM Studio uncensored. Imagen: LU / Comfy.',
      'Si no hay GPU: vuelve a modo chatbots y usa Copiar JSON.'
    ];
    return recipe;
  }

  function toG513rClipboardText(recipe) {
    const r = recipe || {};
    const inf = r.inference || {};
    const hw = r.hardware || {};
    const steps = Array.isArray(r.steps) ? r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';
    const ck = (r.checkpoints || []).map((c) => `• ${c.file} — ${c.use}`).join('\n');
    const loraLine = inf.lora_line || g513rLoraLine(inf.trigger_token);
    return `RECETA G513R — ${r.title || 'local NVIDIA'}
schema: ${r.schema_id || SCHEMA_ID}
Hardware: ${hw.device || 'ASUS G513R'} (${hw.gpu || 'NVIDIA'})
Texto: ${(hw.text || []).join(' / ') || 'Ollama / LM Studio'}
Imagen: ${(hw.image || []).join(' / ') || 'Locally Uncensored / Comfy'}
Trigger LoRA: ${g513rTriggerLabel(inf.trigger_token)}
LoRA strength: ${inf.lora_strength || G513R_LORA_STRENGTH_RANGE}

LORA (modo NVIDIA — no sustituye Copiar JSON)
• Línea: ${loraLine}
• Pon el .safetensors en models/loras de Locally Uncensored / ComfyUI
• En LU: selecciona el LoRA en el picker; el trigger va en Positive (caja aparte del Negative)
• Strength ${inf.lora_strength || G513R_LORA_STRENGTH_RANGE} (receta ${inf.lora_strength_mid || G513R_LORA_STRENGTH_MID})

CHECKPOINTS (selector de LU — no van dentro del prompt)
${ck}

LOCALLY UNCENSORED — cajas separadas
• Positive → solo el prompt positivo (shot A, B o C).
• Negative → solo el negativo (el mismo para A/B/C).
• No pegues ambos en la misma caja.

PASOS
${steps}

JSON
${JSON.stringify(r, null, 2)}
`;
  }

  return {
    SCHEMA_ID,
    G513R_CHECKPOINTS,
    G513R_LORA_STRENGTH_MID,
    G513R_LORA_STRENGTH_RANGE,
    G513R_LORA_TRIGGER_PLACEHOLDER,
    G513R_LORA_FILE_HINT,
    g513rLoraLine,
    buildRecipe,
    buildG513rRecipe,
    validateRecipe,
    toClipboardText,
    toG513rClipboardText,
    stripIdentity
  };
});
