/**
 * Adapter ComfyUI para el hub L4.
 * Envuelve comfyui-client.js (L2) con el contrato ping/generate del hub.
 */
'use strict';

const comfyui = require('../comfyui-client');

const NAME = 'comfyui';

function isConfigured() {
  return comfyui.isConfigured();
}

function getBaseUrl() {
  return comfyui.getBaseUrl();
}

/**
 * @returns {Promise<{ ok: boolean, name: string, reason?: string, version?: string }>}
 */
async function ping(fetchImpl) {
  if (!isConfigured()) {
    return { ok: false, name: NAME, reason: 'not_configured' };
  }
  const result = await comfyui.ping(fetchImpl);
  return {
    ok: !!result.ok,
    name: NAME,
    reason: result.reason,
    url: getBaseUrl()
  };
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.negative]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.seed]
 * @param {{ name: string, strength?: number } | null} [opts.lora]
 * @returns {Promise<Buffer|null>}
 */
async function generate(opts, { fetchImpl } = {}) {
  if (!isConfigured()) return null;
  const lora = opts.lora || null;
  const buffer = await comfyui.generateImage({
    prompt: opts.prompt,
    negative: opts.negative,
    loraName: lora?.name || null,
    loraStrength: lora?.strength != null ? lora.strength : 0.85,
    seed: opts.seed,
    width: opts.width || 1024,
    height: opts.height || 1024,
    checkpoint: opts.checkpoint
  }, { fetchImpl });
  return buffer && buffer.length ? buffer : null;
}

module.exports = {
  NAME,
  isConfigured,
  getBaseUrl,
  ping,
  generate
};
