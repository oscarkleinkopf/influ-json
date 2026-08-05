/**
 * Image generation provider abstraction.
 *
 * Product rule (influ-JSON):
 * - Default path is FREE for small entrepreneurs (Pollinations + offline).
 * - Optional paid face-lock (e.g. Replicate InstantID/PuLID) is additive —
 *   never remove or break the free path when enabling it later.
 * - Optional LoRA via ComfyUI (L2) or Replicate (L3) — return null → fallback.
 *
 * @see ROADMAP.md — "Cero costo primero" + Fase L
 */

const path = require('path');
const fs = require('fs');
const comfyui = require('./comfyui-client');
const paidLora = require('./paid-lora');
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
  const paidLoraOn = paidLora.isPaidLoraEnabled();
  return {
    active,
    freePathAlwaysOn: true,
    pollinations: {
      available: true,
      cost: 'free',
      faceLock: 'soft',
      notes: 'Default for zero-cost entrepreneurs'
    },
    replicate: {
      available: isPaidFaceLockEnabled(),
      cost: 'paid_per_image',
      faceLock: 'hard',
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
      available: comfyConfigured || paidLoraOn,
      cost: comfyConfigured ? 'self_host_gpu' : (paidLoraOn ? 'paid_per_train_and_image' : 'free_colab_path'),
      paidTrainer: paidLoraOn,
      notes: 'L2 ComfyUI y/o L3 Replicate; fallback automático a Pollinations'
    },
    paidLora: {
      available: paidLoraOn,
      configured: paidLoraOn,
      username: paidLora.getUsername(),
      notes: 'ENABLE_PAID_LORA=1 + REPLICATE_API_TOKEN — nunca requerido'
    }
  };
}

/**
 * Placeholder for future Replicate InstantID/PuLID call.
 * Must throw or return null so callers fall back to Pollinations.
 */
async function generateWithOptionalFaceLock(/* { prompt, faceImagePath, options } */) {
  if (!isPaidFaceLockEnabled()) {
    return null;
  }
  console.warn('[image-provider] Replicate face-lock not implemented yet — falling back to free Pollinations path.');
  return null;
}

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

function saveGeneratedBuffer(buffer, prefix = 'gen_lora') {
  const filename = `${prefix}_${Date.now()}.jpg`;
  const relativePath = `assets/generated/${filename}`;
  const absolutePath = path.join(__dirname, relativePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, buffer);
  const scratchGenDir = path.join(DATA_DIR, 'generated');
  ensureDir(scratchGenDir);
  fs.writeFileSync(path.join(scratchGenDir, filename), buffer);
  return relativePath;
}

function withTriggerPrompt(prompt, row, meta) {
  let finalPrompt = String(prompt || '');
  const trigger = (row.trigger_token || meta.trigger_token || '').trim();
  if (trigger && !finalPrompt.includes(trigger)) {
    finalPrompt = `${trigger} ${finalPrompt}`.trim();
  }
  return finalPrompt;
}

async function tryComfyUiLora(row, prompt, options, fetchImpl) {
  if (!isComfyUiConfigured()) return null;
  const weightsAbs = resolveLoraWeightsAbs(row);
  if (!weightsAbs || !fs.existsSync(weightsAbs)) return null;

  const meta = parseTrainingMeta(row);
  const loraName = meta.comfy_lora_name
    || meta.comfyLoraName
    || path.basename(weightsAbs);
  const finalPrompt = withTriggerPrompt(prompt, row, meta);

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
  const relativePath = saveGeneratedBuffer(buffer, 'gen_lora');
  console.log(`[image-provider] LoRA image via ComfyUI → ${relativePath}`);
  return relativePath;
}

async function tryPaidLora(row, prompt, options, fetchImpl) {
  if (!paidLora.isPaidLoraEnabled()) return null;
  const meta = parseTrainingMeta(row);
  const modelVersion = meta.replicate_model_version
    || meta.replicateModelVersion
    || meta.model_version
    || null;
  if (!modelVersion) return null;

  const finalPrompt = withTriggerPrompt(prompt, row, meta);
  const buffer = await paidLora.runLoraPrediction({
    modelVersion,
    prompt: finalPrompt,
    seed: options.seed,
    fetchImpl
  });
  if (!buffer || !buffer.length) return null;
  const relativePath = saveGeneratedBuffer(buffer, 'gen_lora_paid');
  console.log(`[image-provider] LoRA image via Replicate → ${relativePath}`);
  return relativePath;
}

/**
 * L2/L3 — Inferencia LoRA (ComfyUI local y/o Replicate pago).
 * Returns relative image path on success, or null → Pollinations.
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

  try {
    const local = await tryComfyUiLora(row, prompt, options, fetchImpl);
    if (local) return local;
  } catch (err) {
    console.warn('[image-provider] ComfyUI LoRA failed:', err.message);
  }

  try {
    const paid = await tryPaidLora(row, prompt, options, fetchImpl);
    if (paid) return paid;
  } catch (err) {
    console.warn('[image-provider] Replicate LoRA failed, will fall back to Pollinations:', err.message);
  }

  return null;
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
