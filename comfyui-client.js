/**
 * Cliente mínimo ComfyUI (Fase L / L2).
 * Opt-in vía COMFYUI_URL. Si no hay URL o falla la cola → el caller cae a Pollinations.
 *
 * API ComfyUI: POST /prompt → poll /history/{id} → GET /view
 */
'use strict';

const DEFAULT_TIMEOUT_MS = Number(process.env.COMFYUI_TIMEOUT_MS || 180000);
const DEFAULT_POLL_MS = Number(process.env.COMFYUI_POLL_MS || 1500);

function getBaseUrl() {
  const raw = (process.env.COMFYUI_URL || '').trim().replace(/\/+$/, '');
  return raw || null;
}

function isConfigured() {
  return !!getBaseUrl();
}

/**
 * Workflow SDXL/SD1.5 clásico con LoraLoader.
 * Para Flux u otros grafos: apunta COMFYUI_WORKFLOW_JSON a un JSON con placeholders
 * {{PROMPT}}, {{NEGATIVE}}, {{LORA}}, {{LORA_STRENGTH}}, {{SEED}}, {{WIDTH}}, {{HEIGHT}}, {{CHECKPOINT}}.
 */
function buildDefaultLoraWorkflow({
  prompt,
  negative = 'blurry, low quality, deformed, watermark, text',
  loraName,
  loraStrength = 0.85,
  seed = Math.floor(Math.random() * 1e9),
  width = 1024,
  height = 1024,
  checkpoint = process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors'
}) {
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: Number(seed) || 0,
        steps: 28,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['10', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0]
      }
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint }
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: Number(width) || 1024, height: Number(height) || 1024, batch_size: 1 }
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: String(prompt || ''), clip: ['10', 1] }
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: String(negative || ''), clip: ['10', 1] }
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] }
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'influ_json_lora', images: ['8', 0] }
    },
    '10': {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: loraName,
        strength_model: Number(loraStrength) || 0.85,
        strength_clip: Number(loraStrength) || 0.85,
        model: ['4', 0],
        clip: ['4', 1]
      }
    }
  };
}

function applyWorkflowTemplate(templateObj, vars) {
  let raw = JSON.stringify(templateObj);
  for (const [k, v] of Object.entries(vars)) {
    const token = `{{${k}}}`;
    raw = raw.split(token).join(String(v));
  }
  return JSON.parse(raw);
}

function loadCustomWorkflowTemplate() {
  const p = (process.env.COMFYUI_WORKFLOW_JSON || '').trim();
  if (!p) return null;
  const fs = require('fs');
  const path = require('path');
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    throw new Error(`COMFYUI_WORKFLOW_JSON no encontrado: ${abs}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function buildWorkflow(opts) {
  const custom = loadCustomWorkflowTemplate();
  if (custom) {
    return applyWorkflowTemplate(custom, {
      PROMPT: opts.prompt || '',
      NEGATIVE: opts.negative || 'blurry, low quality, deformed, watermark, text',
      LORA: opts.loraName || '',
      LORA_STRENGTH: opts.loraStrength != null ? opts.loraStrength : 0.85,
      SEED: opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9),
      WIDTH: opts.width || 1024,
      HEIGHT: opts.height || 1024,
      CHECKPOINT: opts.checkpoint || process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors'
    });
  }
  return buildDefaultLoraWorkflow(opts);
}

async function request(pathname, { method = 'GET', body, fetchImpl, timeoutMs } = {}) {
  const base = getBaseUrl();
  if (!base) throw new Error('COMFYUI_URL no configurada');
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) throw new Error('fetch no disponible');

  const ctrl = new AbortController();
  const ms = timeoutMs != null ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), Math.min(ms, 60000));
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

async function ping(fetchImpl) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const res = await request('/system_stats', { fetchImpl, timeoutMs: 5000 });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || 'unreachable' };
  }
}

async function queuePrompt(workflow, { clientId = 'influ-json', fetchImpl } = {}) {
  const res = await request('/prompt', {
    method: 'POST',
    body: { prompt: workflow, client_id: clientId },
    fetchImpl
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`ComfyUI /prompt ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data.prompt_id) throw new Error('ComfyUI no devolvió prompt_id');
  return data.prompt_id;
}

function extractImagesFromHistory(historyEntry) {
  const outputs = historyEntry?.outputs || {};
  const images = [];
  for (const nodeId of Object.keys(outputs)) {
    const imgs = outputs[nodeId]?.images || [];
    for (const img of imgs) {
      if (img?.filename) images.push(img);
    }
  }
  return images;
}

async function waitForOutput(promptId, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = DEFAULT_POLL_MS } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(`/history/${promptId}`, { fetchImpl, timeoutMs: 15000 });
    if (res.ok) {
      const data = await res.json();
      const entry = data[promptId];
      if (entry) {
        const images = extractImagesFromHistory(entry);
        if (images.length) return images;
        if (entry.status?.status_str === 'error' || entry.status?.completed === false) {
          throw new Error('ComfyUI job failed');
        }
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`ComfyUI timeout after ${timeoutMs}ms`);
}

async function fetchImageBuffer(imageMeta, { fetchImpl } = {}) {
  const q = new URLSearchParams({
    filename: imageMeta.filename,
    subfolder: imageMeta.subfolder || '',
    type: imageMeta.type || 'output'
  });
  const res = await request(`/view?${q.toString()}`, { fetchImpl, timeoutMs: 60000 });
  if (!res.ok) throw new Error(`ComfyUI /view ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Genera una imagen con LoRA vía ComfyUI y devuelve Buffer.
 */
async function generateLoraImage(opts, { fetchImpl } = {}) {
  const workflow = buildWorkflow(opts);
  const promptId = await queuePrompt(workflow, { fetchImpl });
  const images = await waitForOutput(promptId, { fetchImpl });
  return fetchImageBuffer(images[0], { fetchImpl });
}

module.exports = {
  getBaseUrl,
  isConfigured,
  ping,
  buildDefaultLoraWorkflow,
  buildWorkflow,
  queuePrompt,
  waitForOutput,
  fetchImageBuffer,
  generateLoraImage,
  applyWorkflowTemplate
};
