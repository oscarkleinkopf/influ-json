/**
 * L4 — status del hub de inferencia local (ComfyUI + A1111/Forge).
 * Opt-in; nunca requerido para el path free.
 */
'use strict';

function registerLocalGpuRoutes(app) {
  app.get('/api/local-gpu/status', async (req, res) => {
    try {
      const localGpu = require('../local-gpu');
      const imageProvider = require('../image-provider');
      const status = await localGpu.getLocalGpuStatus({ doPing: true });
      const caps = imageProvider.getProviderCapabilities();
      res.json({
        success: true,
        ...status,
        capabilities: caps.localGpu || null,
        lora: caps.lora || null
      });
    } catch (err) {
      console.error('[local-gpu/status]', err);
      res.status(500).json({
        success: false,
        message: err.message || 'No se pudo consultar el hub GPU local'
      });
    }
  });
}

module.exports = { registerLocalGpuRoutes };
