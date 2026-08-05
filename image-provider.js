/**
 * Image generation provider abstraction.
 *
 * Product rule (influ-JSON):
 * - Default path is FREE for small entrepreneurs (Pollinations + offline).
 * - Optional paid face-lock (e.g. Replicate InstantID/PuLID) is additive —
 *   never remove or break the free path when enabling it later.
 * - Optional LoRA via ComfyUI (Fase L / L2) — same rule: return null → fallback.
 *
 * @see ROADMAP.md — "Cero costo primero" + Fase L
 */

const path = require('path');
const fs = require('fs');
const comfyui = require('./comfyui-client');
const { DATA_DIR, ensureDir } = require('./paths');

const PROVIDERS = {
  /** Free / default — current production path */
  POLLINATIONS: 'pollinations',
  /** Optional paid face-lock — not required; opt-in via env */
  REPLICATE: 'replicate',
  /** Future self-host */
  COMFYUI: 'comfyui'
};

const LORA_STATUSES = Object.freeze({
  NONE: 'none',
  DATASET_READY: 'dataset_ready',
  TRAINING: 'training',
  READY: 'ready',
  FAILED: 'failed'
});

function getActiveProvider() {
  const raw = (process.env.IMAGE_PROVIDER || PROVIDERS.POLLINATIONS).toLowerCase().trim();
  if (raw === PROVIDERS.REPLICATE || raw === PROVIDERS.COMFYUI) return raw;
  return PROVIDERS.POLLINATIONS;
}

/** True only when user explicitly configured a paid face-lock provider + credentials. */
function isPaidFaceLockEnabled() {
  if (getActiveProvider() !== PROVIDERS.REPLICATE) return false;
  return !!(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY);
}

function isComfyUiConfigured() {
  return comfyui.isConfigured();
}

/**
 * Capability flags for UI /status and agents.
 * Free tier must always report pollinations available without keys.
 */
function getProviderCapabilities() {
  const active = getActiveProvider();
  const comfyConfigured = isComfyUiConfigured();
  return {
    active,
    freePathAlwaysOn: true,
    pollinations: {
      available: true,
      cost: 'free',
      faceLock: 'soft', // text + optional img2img, not dedicated face embed
      notes: 'Default for zero-cost entrepreneurs'
    },
    replicate: {
      available: isPaidFaceLockEnabled(),
      cost: 'paid_per_image',
      faceLock: 'hard', // InstantID / PuLID when wired
      configured: !!(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY),
      notes: 'Optional upgrade; never required. See ROADMAP.'
    },
    comfyui: {
      available: comfyConfigured,
      cost: 'self_host_gpu',
      faceLock: 'hard',
      configured: comfyConfigured,
      url: comfyConfigured ? comfyui.getBaseUrl() : null,
      notes: 'L2 opt-in: LoRA inference when persona_loras.status=ready'
    },
    lora: {
      available: comfyConfigured,
      cost: 'self_host_gpu',
      notes: 'Per-persona LoRA; fallback automático a Pollinations si no ready / sin ComfyUI'
    }
  };
}

/**
 * Placeholder for future Replicate InstantID/PuLID call.
 * Must throw or return null so callers fall back to Pollinations.
 * DO NOT implement paid path until free Pollinations path is solid.
 */
async function generateWithOptionalFaceLock(/* { prompt, faceImagePath, options } */) {
  if (!isPaidFaceLockEnabled()) {
    return null; // signal: use free path
  }
  // Future: call Replicate and return relative image path
  console.warn('[image-provider] Replicate face-lock not implemented yet — falling back to free Pollinations path.');
  return null;
}

/**
 * Resolve absolute weights path for a persona_loras row.
 */
function resolveLoraWeightsAbs(row) {
  if (!row?.weights_path) return null;
  const p = String(row.weights_path);
  if (path.isAbsolute(p)) return p;
  return path.join(DATA_DIR, p);
}

function parseTrainingMeta(row) {
  if (!row?.training_meta) return {};
  try {
    return typeof row.training_meta === 'string'
      ? JSON.parse(row.training_meta)
      : (row.training_meta || {});
  } catch (_) {
    return {};
  }
}

/**
 * L2 — Inferencia LoRA vía ComfyUI.
 * Returns relative image path on success, or null to signal fallback to Pollinations.
 *
 * @param {{ personaId: string, prompt: string, options?: object, loraRow?: object, dbService?: object, fetchImpl?: Function }} args
 */
async function generateWithLora({
  personaId,
  prompt,
  options = {},
  loraRow = null,
  dbService = null,
  fetchImpl = null
} = {}) {
  if (!personaId) return null;
  if (!isComfyUiConfigured()) return null;

  let row = loraRow;
  if (!row) {
    try {
      const db = dbService || require('./db');
      if (typeof db.getPersonaLora === 'function') {
        row = db.getPersonaLora(personaId);
      }
    } catch (_) {
      row = null;
    }
  }
  if (!row || row.status !== LORA_STATUSES.READY) return null;

  const weightsAbs = resolveLoraWeightsAbs(row);
  if (!weightsAbs || !fs.existsSync(weightsAbs)) {
    console.warn(`[image-provider] LoRA ready pero falta archivo: ${weightsAbs || '(sin path)'}`);
    return null;
  }

  const meta = parseTrainingMeta(row);
  const loraName = meta.comfy_lora_name
    || meta.comfyLoraName
    || path.basename(weightsAbs);

  // Prefijo trigger en el prompt si aún no está
  let finalPrompt = String(prompt || '');
  const trigger = (row.trigger_token || meta.trigger_token || '').trim();
  if (trigger && !finalPrompt.includes(trigger)) {
    finalPrompt = `${trigger} ${finalPrompt}`.trim();
  }

  try {
    const buffer = await comfyui.generateLoraImage({
      prompt: finalPrompt,
      negative: options.negative || meta.negative || undefined,
      loraName,
      loraStrength: options.loraStrength != null
        ? options.loraStrength
        : (meta.lora_strength != null ? meta.lora_strength : 0.85),
      seed: options.seed,
      width: options.width || 1024,
      height: options.height || 1024,
      checkpoint: options.checkpoint
        || meta.checkpoint
        || row.base_model
        || process.env.COMFYUI_CHECKPOINT
        || 'sd_xl_base_1.0.safetensors'
    }, { fetchImpl });

    if (!buffer || !buffer.length) return null;

    const filename = `gen_lora_${Date.now()}.jpg`;
    const relativePath = `assets/generated/${filename}`;
    const absolutePath = path.join(__dirname, relativePath);
    ensureDir(path.dirname(absolutePath));
    fs.writeFileSync(absolutePath, buffer);

    const scratchGenDir = path.join(DATA_DIR, 'generated');
    ensureDir(scratchGenDir);
    fs.writeFileSync(path.join(scratchGenDir, filename), buffer);

    console.log(`[image-provider] LoRA image via ComfyUI → ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.warn('[image-provider] ComfyUI LoRA failed, will fall back to Pollinations:', err.message);
    return null;
  }
}

module.exports = {
  PROVIDERS,
  LORA_STATUSES,
  getActiveProvider,
  isPaidFaceLockEnabled,
  isComfyUiConfigured,
  getProviderCapabilities,
  generateWithOptionalFaceLock,
  generateWithLora,
  resolveLoraWeightsAbs,
  parseTrainingMeta
};
