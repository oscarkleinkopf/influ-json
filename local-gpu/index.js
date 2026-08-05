/**
 * L4 — Hub de inferencia local (ComfyUI + A1111/Forge).
 * @see docs/lora/L4_LOCAL_GPU.md
 */
'use strict';

const hub = require('./hub');

module.exports = {
  ...hub,
  comfyAdapter: hub.comfy,
  a1111Adapter: hub.a1111
};
