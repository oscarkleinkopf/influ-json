/**
 * Fase R — Face-lock de pago (Replicate InstantID / PuLID), opt-in.
 *
 * Nunca es el path por defecto. Requiere:
 *   ENABLE_PAID_FACE_LOCK=1  +  REPLICATE_API_TOKEN
 *   — o —  IMAGE_PROVIDER=replicate  +  token  (compat R0 ROADMAP)
 *
 * Sin eso → isPaidFaceLockEnabled() false; Studio sigue en Pollinations.
 *
 * @see docs/FACELOCK_R.md
 * @see ROADMAP.md — Fase R
 */
'use strict';

const DEFAULT_FACE_MODEL =
  process.env.REPLICATE_FACE_MODEL
  || 'bytedance/pulid:c169c3b8f6952cf895d043d7b56830b4e9a3e9409a026004e9efbd9da42912b4';

const API = 'https://api.replicate.com/v1';

function getToken() {
  return (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim() || null;
}

/** Explicit opt-in — token alone must NOT enable paid face-lock. */
function isPaidFaceLockEnabled() {
  if (!getToken()) return false;
  const flag = String(process.env.ENABLE_PAID_FACE_LOCK || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  // R0 compat: IMAGE_PROVIDER=replicate + token
  const provider = String(process.env.IMAGE_PROVIDER || '').toLowerCase().trim();
  return provider === 'replicate';
}

function getFaceModel() {
  return String(process.env.REPLICATE_FACE_MODEL || DEFAULT_FACE_MODEL).trim();
}

/**
 * Detect input schema from model id string.
 * @returns {'pulid'|'instantid'|'generic'}
 */
function detectFaceSchema(modelId = getFaceModel()) {
  const s = String(modelId || '').toLowerCase();
  if (s.includes('pulid')) return 'pulid';
  if (s.includes('instant')) return 'instantid';
  return 'generic';
}

function buildFaceLockInput({
  faceImageUrl,
  prompt,
  seed = null,
  width = 1024,
  height = 1024,
  negative = null,
  modelId = null
} = {}) {
  if (!faceImageUrl) throw new Error('faceImageUrl requerido para face-lock');
  const schema = detectFaceSchema(modelId || getFaceModel());
  const neg = negative
    || 'ugly, deformed, noisy, blurry, low quality, watermark, text, logo, nsfw';

  if (schema === 'pulid') {
    const input = {
      main_face_image: String(faceImageUrl),
      prompt: String(prompt || ''),
      negative_prompt: neg,
      image_width: Number(width) || 1024,
      image_height: Number(height) || 1024,
      num_samples: 1,
      identity_scale: 0.8,
      generation_mode: 'fidelity',
      mix_identities: false,
      output_format: 'jpeg',
      output_quality: 90
    };
    if (seed != null) input.seed = Number(seed);
    return input;
  }

  if (schema === 'instantid') {
    // zedge/instantid uses input_image; zsxkib often uses image
    const usesInputImage = /zedge\/instant/i.test(String(modelId || getFaceModel()));
    const input = {
      prompt: String(prompt || ''),
      negative_prompt: neg,
      width: Number(width) || 1024,
      height: Number(height) || 1024
    };
    if (usesInputImage) input.input_image = String(faceImageUrl);
    else input.image = String(faceImageUrl);
    if (seed != null) input.seed = Number(seed);
    return input;
  }

  // Generic best-effort
  const input = {
    prompt: String(prompt || ''),
    negative_prompt: neg,
    face_image: String(faceImageUrl),
    image: String(faceImageUrl),
    input_image: String(faceImageUrl),
    main_face_image: String(faceImageUrl)
  };
  if (seed != null) input.seed = Number(seed);
  return input;
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
 * Sube bytes de cara a Replicate Files API → URL usable como input.
 */
async function uploadFaceImage(buffer, filename = 'face.jpg', { fetchImpl } = {}) {
  const t = getToken();
  if (!t) throw new Error('REPLICATE_API_TOKEN no configurado');
  const fetchFn = fetchImpl || globalThis.fetch;
  const form = new FormData();
  const blob = new Blob([buffer], { type: 'image/jpeg' });
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
  const url = data?.urls?.get || data?.urls?.download || data?.url || null;
  if (!url) throw new Error('Replicate /files no devolvió URL');
  return { id: data.id, url, raw: data };
}

/**
 * Corre InstantID/PuLID en Replicate. Devuelve Buffer de imagen o null.
 */
async function runFaceLockPrediction({
  faceImageUrl,
  prompt,
  seed = null,
  width = 1024,
  height = 1024,
  negative = null,
  modelVersion = null,
  fetchImpl = null,
  timeoutMs = Number(process.env.REPLICATE_PREDICTION_TIMEOUT_MS || 180000)
} = {}) {
  if (!isPaidFaceLockEnabled()) return null;
  if (!faceImageUrl || !prompt) return null;

  const model = modelVersion || getFaceModel();
  const input = buildFaceLockInput({
    faceImageUrl,
    prompt,
    seed,
    width,
    height,
    negative,
    modelId: model
  });

  let pathname;
  let body;
  if (model.includes(':')) {
    const [ownerName, version] = model.split(':');
    pathname = `/models/${ownerName}/versions/${version}/predictions`;
    body = { input };
  } else if (model.includes('/')) {
    // owner/name without version — use models/.../predictions (latest)
    pathname = `/models/${model}/predictions`;
    body = { input };
  } else {
    pathname = '/predictions';
    body = { version: model, input };
  }

  let pred = await replicateFetch(pathname, { method: 'POST', body, fetchImpl });
  const start = Date.now();
  while (pred && (pred.status === 'starting' || pred.status === 'processing')) {
    if (Date.now() - start > timeoutMs) throw new Error('Replicate face-lock prediction timeout');
    await new Promise((r) => setTimeout(r, 2000));
    pred = await replicateFetch(`/predictions/${pred.id}`, { fetchImpl });
  }
  if (!pred || pred.status !== 'succeeded') {
    const errMsg = pred?.error || pred?.status || 'failed';
    throw new Error(`Replicate face-lock ${errMsg}`);
  }

  const out = pred.output;
  let url = null;
  if (Array.isArray(out)) {
    url = typeof out[0] === 'string' ? out[0] : (out[0]?.url || null);
  } else if (typeof out === 'string') {
    url = out;
  } else if (out && typeof out === 'object') {
    url = out.url || out.image || null;
  }
  if (!url) return null;

  const fetchFn = fetchImpl || globalThis.fetch;
  const imgRes = await fetchFn(url);
  if (!imgRes.ok) throw new Error(`Descarga imagen Replicate face-lock ${imgRes.status}`);
  const ab = await imgRes.arrayBuffer();
  return Buffer.from(ab);
}

module.exports = {
  DEFAULT_FACE_MODEL,
  getToken,
  getFaceModel,
  isPaidFaceLockEnabled,
  detectFaceSchema,
  buildFaceLockInput,
  uploadFaceImage,
  runFaceLockPrediction,
  replicateFetch
};
