/**
 * Adapter Automatic1111 / Forge (API /sdapi/v1) para el hub L4.
 * Opt-in vía A1111_URL o FORGE_URL. LoRA: <lora:name:strength> en el prompt.
 */
'use strict';

const DEFAULT_TIMEOUT_MS = Number(process.env.A1111_TIMEOUT_MS || 180000);

const NAME = 'a1111';

function getBaseUrl() {
  const raw = (process.env.A1111_URL || process.env.FORGE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return raw || null;
}

function isConfigured() {
  return !!getBaseUrl();
}

async function request(pathname, { method = 'GET', body, fetchImpl, timeoutMs } = {}) {
  const base = getBaseUrl();
  if (!base) throw new Error('A1111_URL / FORGE_URL no configurada');
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) throw new Error('fetch no disponible');

  const ctrl = new AbortController();
  const ms = timeoutMs != null ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), Math.min(ms, 120000));
  try {
    const res = await fetchFn(`${base}${pathname}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{ ok: boolean, name: string, reason?: string, models?: number, url?: string }>}
 */
async function ping(fetchImpl) {
  if (!isConfigured()) {
    return { ok: false, name: NAME, reason: 'not_configured' };
  }
  try {
    const res = await request('/sdapi/v1/sd-models', { fetchImpl, timeoutMs: 5000 });
    if (!res.ok) return { ok: false, name: NAME, reason: `http_${res.status}`, url: getBaseUrl() };
    let models;
    try {
      const data = await res.json();
      models = Array.isArray(data) ? data.length : undefined;
    } catch (_) {
      models = undefined;
    }
    return { ok: true, name: NAME, models, url: getBaseUrl() };
  } catch (err) {
    return { ok: false, name: NAME, reason: err.message || 'unreachable', url: getBaseUrl() };
  }
}

function buildPromptWithLora(prompt, lora) {
  let finalPrompt = String(prompt || '');
  if (!lora?.name) return finalPrompt;
  const strength = lora.strength != null ? Number(lora.strength) : 0.85;
  const tag = `<lora:${lora.name}:${Number.isFinite(strength) ? strength : 0.85}>`;
  if (finalPrompt.includes(`<lora:${lora.name}`)) return finalPrompt;
  return `${tag} ${finalPrompt}`.trim();
}

/**
 * @returns {Promise<Buffer|null>}
 */
async function generate(opts, { fetchImpl } = {}) {
  if (!isConfigured()) return null;

  const prompt = buildPromptWithLora(opts.prompt, opts.lora || null);
  const body = {
    prompt,
    negative_prompt: opts.negative || 'blurry, low quality, deformed, watermark, text',
    width: Number(opts.width) || 1024,
    height: Number(opts.height) || 1024,
    seed: opts.seed != null ? Number(opts.seed) : -1,
    steps: opts.steps != null ? Number(opts.steps) : 28,
    cfg_scale: opts.cfg != null ? Number(opts.cfg) : 7,
    sampler_name: opts.sampler || 'Euler a'
  };

  const res = await request('/sdapi/v1/txt2img', {
    method: 'POST',
    body,
    fetchImpl,
    timeoutMs: DEFAULT_TIMEOUT_MS
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`A1111 /txt2img ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const b64 = Array.isArray(data.images) ? data.images[0] : null;
  if (!b64) return null;
  // A1111 may return raw base64 or data URL
  const raw = String(b64).replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(raw, 'base64');
}

module.exports = {
  NAME,
  getBaseUrl,
  isConfigured,
  ping,
  generate,
  buildPromptWithLora,
  request
};
