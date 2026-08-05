/**
 * Fase L / L3 — Trainer + inferencia LoRA de pago (Replicate), opt-in.
 *
 * Nunca es el path por defecto. Requiere:
 *   ENABLE_PAID_LORA=1
 *   REPLICATE_API_TOKEN=...
 *   REPLICATE_USERNAME=...   (owner del modelo destino)
 *
 * Sin eso → isPaidLoraEnabled() false; Studio sigue en Pollinations / Colab / ComfyUI.
 *
 * @see docs/lora/L3_PAID.md
 * @see ROADMAP.md — Fase L / L3
 */
'use strict';

const DEFAULT_TRAINER_VERSION =
  process.env.REPLICATE_LORA_TRAINER
  || 'ostris/flux-dev-lora-trainer:d995297071a44dcb72244e6c19462111649ec86a9646c32df56daa7f14801944';

const API = 'https://api.replicate.com/v1';

function getToken() {
  return (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim() || null;
}

function getUsername() {
  return (process.env.REPLICATE_USERNAME || process.env.REPLICATE_OWNER || '').trim() || null;
}

/** Explicit opt-in — having a token alone must NOT enable paid LoRA. */
function isPaidLoraEnabled() {
  const flag = String(process.env.ENABLE_PAID_LORA || '').trim().toLowerCase();
  if (!(flag === '1' || flag === 'true' || flag === 'yes')) return false;
  return !!getToken();
}

function parseTrainerVersion(raw = DEFAULT_TRAINER_VERSION) {
  const s = String(raw).trim();
  const m = s.match(/^([^/:]+)\/([^/:]+):([a-f0-9]+)$/i);
  if (m) return { owner: m[1], name: m[2], version: m[3] };
  // owner/name only → versions path needs full hash; reject soft
  const m2 = s.match(/^([^/:]+)\/([^/:]+)$/);
  if (m2) return { owner: m2[1], name: m2[2], version: null };
  throw new Error(`REPLICATE_LORA_TRAINER inválido: ${s}`);
}

async function replicateFetch(pathname, { method = 'GET', body, fetchImpl, token } = {}) {
  const t = token || getToken();
  if (!t) throw new Error('REPLICATE_API_TOKEN no configurado');
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) throw new Error('fetch no disponible');

  const res = await fetchFn(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=0'
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.detail || data?.error || text.slice(0, 240) || `HTTP ${res.status}`;
    const err = new Error(`Replicate ${method} ${pathname}: ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Sube bytes a Replicate Files API → URL usable como input_images.
 */
async function uploadTrainingZip(buffer, filename = 'lora_dataset.zip', { fetchImpl } = {}) {
  const t = getToken();
  if (!t) throw new Error('REPLICATE_API_TOKEN no configurado');
  const fetchFn = fetchImpl || globalThis.fetch;
  const form = new FormData();
  const blob = new Blob([buffer], { type: 'application/zip' });
  form.append('content', blob, filename);

  const res = await fetchFn(`${API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Replicate /files ${res.status}`);
  }
  // Prefer urls.get (direct) then id-based
  const url = data?.urls?.get || data?.urls?.download || data?.url || null;
  if (!url) throw new Error('Replicate /files no devolvió URL');
  return { id: data.id, url, raw: data };
}

async function ensureDestinationModel({ owner, name, fetchImpl } = {}) {
  const o = owner || getUsername();
  if (!o) throw new Error('REPLICATE_USERNAME requerido para crear el modelo destino');
  const n = name || `influ-json-lora`;
  try {
    await replicateFetch(`/models/${o}/${n}`, { fetchImpl });
    return `${o}/${n}`;
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  await replicateFetch('/models', {
    method: 'POST',
    fetchImpl,
    body: {
      owner: o,
      name: n,
      visibility: 'private',
      hardware: 'gpu-t4',
      description: 'influ-JSON character LoRA (Fase L / L3 opt-in)'
    }
  });
  return `${o}/${n}`;
}

/**
 * Arranca entrenamiento LoRA en Replicate.
 * @returns training object (id, status, urls, …)
 */
async function startLoraTraining({
  inputImagesUrl,
  triggerWord,
  destination = null,
  steps = null,
  fetchImpl = null,
  modelName = null
} = {}) {
  if (!isPaidLoraEnabled()) {
    throw new Error('Paid LoRA desactivado. Pon ENABLE_PAID_LORA=1 y REPLICATE_API_TOKEN (ver docs/lora/L3_PAID.md).');
  }
  if (!inputImagesUrl) throw new Error('inputImagesUrl requerido');
  if (!triggerWord) throw new Error('triggerWord requerido');

  const dest = destination || await ensureDestinationModel({
    name: modelName || `influ-${String(triggerWord).replace(/[^a-z0-9]+/gi, '-').slice(0, 40).toLowerCase()}`,
    fetchImpl
  });

  const trainer = parseTrainerVersion();
  if (!trainer.version) {
    throw new Error('REPLICATE_LORA_TRAINER debe incluir :versionHash');
  }

  const input = {
    input_images: inputImagesUrl,
    trigger_word: triggerWord
  };
  if (steps != null) input.steps = Number(steps);

  const training = await replicateFetch(
    `/models/${trainer.owner}/${trainer.name}/versions/${trainer.version}/trainings`,
    {
      method: 'POST',
      fetchImpl,
      body: {
        destination: dest,
        input
      }
    }
  );
  return training;
}

async function getTraining(trainingId, { fetchImpl } = {}) {
  if (!trainingId) throw new Error('trainingId required');
  return replicateFetch(`/trainings/${trainingId}`, { fetchImpl });
}

/**
 * Inferencia con el modelo fine-tuned (destination:version).
 * Devuelve Buffer de imagen o null.
 */
async function runLoraPrediction({
  modelVersion,
  prompt,
  seed = null,
  fetchImpl = null,
  timeoutMs = Number(process.env.REPLICATE_PREDICTION_TIMEOUT_MS || 180000)
} = {}) {
  if (!isPaidLoraEnabled()) return null;
  if (!modelVersion || !prompt) return null;

  // modelVersion: "owner/name:hash" or "owner/name"
  let pathname;
  let body;
  if (modelVersion.includes(':')) {
    const [model, version] = modelVersion.split(':');
    pathname = `/models/${model}/versions/${version}/predictions`;
    body = { input: { prompt: String(prompt) } };
  } else {
    pathname = '/predictions';
    body = { version: modelVersion, input: { prompt: String(prompt) } };
  }
  if (seed != null) body.input.seed = Number(seed);

  let pred = await replicateFetch(pathname, { method: 'POST', body, fetchImpl });
  const start = Date.now();
  while (pred && (pred.status === 'starting' || pred.status === 'processing')) {
    if (Date.now() - start > timeoutMs) throw new Error('Replicate prediction timeout');
    await new Promise((r) => setTimeout(r, 2000));
    pred = await replicateFetch(`/predictions/${pred.id}`, { fetchImpl });
  }
  if (!pred || pred.status !== 'succeeded') {
    const errMsg = pred?.error || pred?.status || 'failed';
    throw new Error(`Replicate prediction ${errMsg}`);
  }

  const out = pred.output;
  const url = Array.isArray(out) ? out[0] : (typeof out === 'string' ? out : null);
  if (!url) return null;

  const fetchFn = fetchImpl || globalThis.fetch;
  const imgRes = await fetchFn(url);
  if (!imgRes.ok) throw new Error(`Descarga imagen Replicate ${imgRes.status}`);
  const ab = await imgRes.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Mapea estado Replicate → persona_loras.status + meta updates.
 */
function mapTrainingStatus(training) {
  const st = String(training?.status || '').toLowerCase();
  if (st === 'succeeded') return 'ready';
  if (st === 'failed' || st === 'canceled' || st === 'cancelled') return 'failed';
  if (st === 'starting' || st === 'processing') return 'training';
  return 'training';
}

function extractModelVersion(training) {
  const dest = training?.destination || null;
  const out = training?.output;

  if (typeof out === 'string' && out.includes('/')) return out;
  if (typeof out === 'string' && dest && !out.includes('/')) return `${dest}:${out}`;

  if (out && typeof out === 'object') {
    const ver = out.version || out.id || null;
    if (ver && dest && !String(ver).includes('/')) return `${dest}:${ver}`;
    if (typeof ver === 'string' && ver.includes('/')) return ver;
  }

  return null;
}

module.exports = {
  DEFAULT_TRAINER_VERSION,
  getToken,
  getUsername,
  isPaidLoraEnabled,
  parseTrainerVersion,
  replicateFetch,
  uploadTrainingZip,
  ensureDestinationModel,
  startLoraTraining,
  getTraining,
  runLoraPrediction,
  mapTrainingStatus,
  extractModelVersion
};
