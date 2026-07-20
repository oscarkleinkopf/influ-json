/**
 * Image generation provider abstraction.
 *
 * Product rule (influ-JSON):
 * - Default path is FREE for small entrepreneurs (Pollinations + offline).
 * - Optional paid face-lock (e.g. Replicate InstantID/PuLID) is additive —
 *   never remove or break the free path when enabling it later.
 *
 * @see ROADMAP.md — "Cero costo primero" + "Replicate (opcional, sin romper free)"
 */

const PROVIDERS = {
  /** Free / default — current production path */
  POLLINATIONS: 'pollinations',
  /** Optional paid face-lock — not required; opt-in via env */
  REPLICATE: 'replicate',
  /** Future self-host */
  COMFYUI: 'comfyui'
};

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

/**
 * Capability flags for UI /status and agents.
 * Free tier must always report pollinations available without keys.
 */
function getProviderCapabilities() {
  const active = getActiveProvider();
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
      available: active === PROVIDERS.COMFYUI && !!(process.env.COMFYUI_URL),
      cost: 'self_host_gpu',
      faceLock: 'hard',
      notes: 'Future self-host path'
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

module.exports = {
  PROVIDERS,
  getActiveProvider,
  isPaidFaceLockEnabled,
  getProviderCapabilities,
  generateWithOptionalFaceLock
};
