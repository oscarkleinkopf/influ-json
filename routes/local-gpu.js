/**
 * L4 — status del hub de inferencia local (ComfyUI + A1111/Forge).
 * Opt-in; nunca requerido para el path free.
 * Members: URLs internas enmascaradas.
 */
'use strict';

function maskBackendUrls(status) {
  if (!status || !status.backends) return status;
  const backends = {};
  for (const [key, val] of Object.entries(status.backends)) {
    if (val && typeof val === 'object') {
      const copy = { ...val };
      if (copy.url) copy.url = '[redacted]';
      backends[key] = copy;
    } else {
      backends[key] = val;
    }
  }
  return { ...status, backends };
}

function registerLocalGpuRoutes(app, deps = {}) {
  const isAdmin = typeof deps.isAdmin === 'function'
    ? deps.isAdmin
    : () => true;

  app.get('/api/local-gpu/status', async (req, res) => {
    try {
      const localGpu = require('../local-gpu');
      const imageProvider = require('../image-provider');
      let status = await localGpu.getLocalGpuStatus({ doPing: true });
      if (!isAdmin(req)) {
        status = maskBackendUrls(status);
      }
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

module.exports = { registerLocalGpuRoutes, maskBackendUrls };
