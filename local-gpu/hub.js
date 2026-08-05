/**
 * Hub L4 — inferencia local (ComfyUI + A1111/Forge).
 * Opt-in. Sin URLs o backends caídos → null (caller cae a Pollinations).
 *
 * Env:
 *   COMFYUI_URL, A1111_URL | FORGE_URL
 *   LOCAL_GPU_BACKEND=auto|comfyui|a1111
 *   PREFER_LOCAL_GPU=1  → usar hub también sin LoRA
 */
'use strict';

const comfy = require('./comfyui-adapter');
const a1111 = require('./a1111-adapter');

const BACKENDS = Object.freeze({
  COMFYUI: 'comfyui',
  A1111: 'a1111',
  AUTO: 'auto'
});

function isPreferLocalGpu() {
  const v = String(process.env.PREFER_LOCAL_GPU || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function getBackendPreference() {
  const raw = String(process.env.LOCAL_GPU_BACKEND || BACKENDS.AUTO).toLowerCase().trim();
  if (raw === BACKENDS.COMFYUI || raw === BACKENDS.A1111) return raw;
  return BACKENDS.AUTO;
}

function isConfigured() {
  return comfy.isConfigured() || a1111.isConfigured();
}

function adapterFor(name) {
  if (name === BACKENDS.COMFYUI) return comfy;
  if (name === BACKENDS.A1111) return a1111;
  return null;
}

/**
 * Orden de preferencia en auto: ComfyUI → A1111.
 * Con LOCAL_GPU_BACKEND fijo, solo ese (si configurado).
 */
function candidateOrder() {
  const pref = getBackendPreference();
  if (pref === BACKENDS.COMFYUI) return [comfy];
  if (pref === BACKENDS.A1111) return [a1111];
  const list = [];
  if (comfy.isConfigured()) list.push(comfy);
  if (a1111.isConfigured()) list.push(a1111);
  return list;
}

/**
 * Elige el primer backend healthy. Sin ping (ping=false) elige el primero configurado.
 * @returns {Promise<{ name: string, adapter: object } | null>}
 */
async function resolveBackend({ fetchImpl, doPing = true } = {}) {
  const candidates = candidateOrder().filter((a) => a.isConfigured());
  if (!candidates.length) return null;

  if (!doPing) {
    return { name: candidates[0].NAME, adapter: candidates[0] };
  }

  for (const adapter of candidates) {
    const result = await adapter.ping(fetchImpl);
    if (result.ok) return { name: adapter.NAME, adapter };
  }
  return null;
}

/**
 * Estado agregado para API / UI.
 */
async function getLocalGpuStatus({ fetchImpl, doPing = true } = {}) {
  const preferLocal = isPreferLocalGpu();
  const backendPref = getBackendPreference();
  const comfyConfigured = comfy.isConfigured();
  const a1111Configured = a1111.isConfigured();

  let comfyStatus = { ok: false, name: comfy.NAME, reason: comfyConfigured ? 'not_pinged' : 'not_configured', url: comfy.getBaseUrl() };
  let a1111Status = { ok: false, name: a1111.NAME, reason: a1111Configured ? 'not_pinged' : 'not_configured', url: a1111.getBaseUrl() };

  if (doPing) {
    if (comfyConfigured) comfyStatus = await comfy.ping(fetchImpl);
    if (a1111Configured) a1111Status = await a1111.ping(fetchImpl);
  }

  let active = null;
  if (backendPref === BACKENDS.COMFYUI && comfyStatus.ok) active = BACKENDS.COMFYUI;
  else if (backendPref === BACKENDS.A1111 && a1111Status.ok) active = BACKENDS.A1111;
  else if (backendPref === BACKENDS.AUTO) {
    if (comfyStatus.ok) active = BACKENDS.COMFYUI;
    else if (a1111Status.ok) active = BACKENDS.A1111;
  }

  return {
    configured: isConfigured(),
    preferLocal,
    backendPreference: backendPref,
    active,
    backends: {
      comfyui: comfyStatus,
      a1111: a1111Status
    },
    notes: 'Opt-in L4. Sin backends → Pollinations / Copiar JSON. Ver docs/lora/L4_LOCAL_GPU.md'
  };
}

/**
 * Genera imagen local. Devuelve { buffer, backend } o null.
 * Si ping falla en todos, intenta generate de todos modos (optimistic)
 * para no bloquear mocks / pings falsos negativos.
 */
async function generateLocalImage(opts = {}, { fetchImpl, doPing = true } = {}) {
  const candidates = candidateOrder().filter((a) => a.isConfigured());
  if (!candidates.length) return null;

  let ordered = candidates;
  if (doPing) {
    const healthy = [];
    const rest = [];
    for (const adapter of candidates) {
      try {
        const result = await adapter.ping(fetchImpl);
        if (result.ok) healthy.push(adapter);
        else rest.push(adapter);
      } catch (_) {
        rest.push(adapter);
      }
    }
    ordered = healthy.length ? healthy.concat(rest) : rest;
  }

  for (const adapter of ordered) {
    try {
      const buffer = await adapter.generate(opts, { fetchImpl });
      if (buffer && buffer.length) {
        return { buffer, backend: adapter.NAME };
      }
    } catch (err) {
      console.warn(`[local-gpu] ${adapter.NAME} generate failed:`, err.message);
    }
  }
  return null;
}

module.exports = {
  BACKENDS,
  isPreferLocalGpu,
  getBackendPreference,
  isConfigured,
  resolveBackend,
  getLocalGpuStatus,
  generateLocalImage,
  comfy,
  a1111
};
