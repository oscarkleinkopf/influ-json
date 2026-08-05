/**
 * Image generation provider abstraction.
 *
 * Product rule (influ-JSON):
 * - Default path is FREE for small entrepreneurs (Pollinations + offline).
 * - Optional paid face-lock (e.g. Replicate InstantID/PuLID) is additive —
 *   never remove or break the free path when enabling it later.
 * - Optional LoRA via local GPU hub (L4: ComfyUI/A1111) or Replicate (L3) — return null → fallback.
 *
 * @see ROADMAP.md — "Cero costo primero" + Fase L
 */

const path = require('path');
const fs = require('fs');
const comfyui = require('./comfyui-client');
const paidLora = require('./paid-lora');
const localGpu = require('./local-gpu');
const { DATA_DIR, ensureDir } = require('./paths');

const PROVIDERS = {
  /** Free / default — current production path */
  POLLINATIONS: 'pollinations',
  /** Optional paid face-lock — not required; opt-in via env */
  REPLICATE: 'replicate',
  /** Self-host / local GPU (L2/L4) */
  COMFYUI: 'comfyui',
  LOCAL: 'local'
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
  if (raw === PROVIDERS.REPLICATE || raw === PROVIDERS.COMFYUI || raw === PROVIDERS.LOCAL) {
    return raw;
  }
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

function isLocalGpuConfigured() {
  return localGpu.isConfigured();
}

function isPreferLocalGpu() {
  return localGpu.isPreferLocalGpu();
}

/**
 * Capability flags for UI /status and agents.
 * Free tier must always report pollinations available without keys.
 */
function getProviderCapabilities() {
  const active = getActiveProvider();
  const comfyConfigured = isComfyUiConfigured();
  const a1111Configured = localGpu.a1111.isConfigured();
  const localConfigured = isLocalGpuConfigured();
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
      notes: 'L2/L4: ComfyUI backend in local GPU hub'
    },
    localGpu: {
      available: localConfigured,
      cost: 'self_host_gpu',
      configured: localConfigured,
      preferLocal: isPreferLocalGpu(),
      backendPreference: localGpu.getBackendPreference(),
      comfyui: comfyConfigured,
      a1111: a1111Configured,
      notes: 'L4 hub: ComfyUI + A1111/Forge; PREFER_LOCAL_GPU=1 for gens without LoRA'
    },
    lora: {
      available: localConfigured || paidLoraOn,
      cost: localConfigured ? 'self_host_gpu' : (paidLoraOn ? 'paid_per_train_and_image' : 'free_colab_path'),
      paidTrainer: paidLoraOn,
      notes: 'L4 local hub y/o L3 Replicate; fallback automático a Pollinations'
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
  const trigger = (row?.trigger_token || meta?.trigger_token || '').trim();
  if (trigger && !finalPrompt.includes(trigger)) {
    finalPrompt = `${trigger} ${finalPrompt}`.trim();
  }
  return finalPrompt;
}

function resolveLoraForHub(row, options = {}) {
  if (!row || row.status !== LORA_STATUSES.READY) return null;
  const weightsAbs = resolveLoraWeightsAbs(row);
  if (!weightsAbs || !fs.existsSync(weightsAbs)) return null;
  const meta = parseTrainingMeta(row);
  const name = meta.comfy_lora_name
    || meta.comfyLoraName
    || meta.a1111_lora_name
    || meta.a1111LoraName
    || path.basename(weightsAbs);
  const strength = options.loraStrength != null
    ? options.loraStrength
    : (meta.lora_strength != null ? meta.lora_strength : 0.85);
  return { name, strength, meta, weightsAbs };
}

/**
 * L4 — intenta hub local (ComfyUI / A1111) con o sin LoRA.
 * @returns {Promise<string|null>} relative path or null
 */
async function tryLocalGpuHub({
  prompt,
  options = {},
  loraRow = null,
  requireLora = false,
  fetchImpl = null
} = {}) {
  if (!isLocalGpuConfigured()) return null;

  const loraInfo = loraRow ? resolveLoraForHub(loraRow, options) : null;
  if (requireLora && !loraInfo) return null;

  const meta = loraInfo?.meta || parseTrainingMeta(loraRow);
  const finalPrompt = loraRow
    ? withTriggerPrompt(prompt, loraRow, meta)
    : String(prompt || '');

  const result = await localGpu.generateLocalImage({
    prompt: finalPrompt,
    negative: options.negative || meta.negative || undefined,
    seed: options.seed,
    width: options.width || 1024,
    height: options.height || 1024,
    checkpoint: options.checkpoint
      || meta.checkpoint
      || loraRow?.base_model
      || process.env.COMFYUI_CHECKPOINT
      || undefined,
    lora: loraInfo ? { name: loraInfo.name, strength: loraInfo.strength } : null
  }, { fetchImpl, doPing: options.skipLocalPing !== true });

  if (!result?.buffer?.length) return null;
  const prefix = loraInfo
    ? (result.backend === 'a1111' ? 'gen_lora_a1111' : 'gen_lora')
    : (result.backend === 'a1111' ? 'gen_local_a1111' : 'gen_local');
  const relativePath = saveGeneratedBuffer(result.buffer, prefix);
  console.log(`[image-provider] Local GPU (${result.backend}) → ${relativePath}`);
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
 * L4 — boceto local sin LoRA cuando PREFER_LOCAL_GPU=1.
 */
async function generateWithLocalGpu({
  prompt,
  options = {},
  fetchImpl = null
} = {}) {
  if (!isPreferLocalGpu() && options.forceLocalGpu !== true) return null;
  try {
    return await tryLocalGpuHub({
      prompt,
      options,
      loraRow: null,
      requireLora: false,
      fetchImpl
    });
  } catch (err) {
    console.warn('[image-provider] Local GPU (no LoRA) failed:', err.message);
    return null;
  }
}

/**
 * L2/L3/L4 — Inferencia LoRA (hub local ComfyUI/A1111 y/o Replicate pago).
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
    const local = await tryLocalGpuHub({
      prompt,
      options,
      loraRow: row,
      requireLora: true,
      fetchImpl
    });
    if (local) return local;
  } catch (err) {
    console.warn('[image-provider] Local GPU LoRA failed:', err.message);
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
  isLocalGpuConfigured,
  isPreferLocalGpu,
  getProviderCapabilities,
  generateWithOptionalFaceLock,
  generateWithLora,
  generateWithLocalGpu,
  tryLocalGpuHub,
  resolveLoraWeightsAbs,
  parseTrainingMeta
};
