/**
 * Modo de trabajo del Studio: chatbots gratis (default) vs GPU NVIDIA local.
 * Compartido: Node (tests) y navegador (app.js).
 *
 * Invariante: el default NUNCA exige tarjeta NVIDIA. El path free sigue siendo
 * Copiar JSON → ChatGPT / Gemini / Claude. El modo nvidia es opt-in (G513R,
 * Ollama / LM Studio + Locally Uncensored / Comfy).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluWorkMode = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'influ_work_mode';
  const CHATBOTS = 'chatbots';
  const NVIDIA = 'nvidia';

  const MODES = {
    chatbots: {
      id: CHATBOTS,
      label: 'Chatbots gratis (sin GPU)',
      short: 'Copiar JSON → ChatGPT / Gemini / Claude. No hace falta NVIDIA.',
      preferLocalGpu: false
    },
    nvidia: {
      id: NVIDIA,
      label: 'GPU NVIDIA local',
      short: 'Ollama + LM Studio (texto) · Locally Uncensored / Comfy (imagen).',
      preferLocalGpu: true
    }
  };

  function getStore(storage) {
    if (storage) return storage;
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (_) {}
    return null;
  }

  function normalize(id) {
    return String(id || '').trim().toLowerCase() === NVIDIA ? NVIDIA : CHATBOTS;
  }

  function getWorkMode(storage) {
    const store = getStore(storage);
    if (!store || typeof store.getItem !== 'function') return CHATBOTS;
    try {
      return normalize(store.getItem(STORAGE_KEY));
    } catch (_) {
      return CHATBOTS;
    }
  }

  function setWorkMode(id, storage) {
    const mode = normalize(id);
    const store = getStore(storage);
    if (store && typeof store.setItem === 'function') {
      try { store.setItem(STORAGE_KEY, mode); } catch (_) {}
    }
    return mode;
  }

  function isNvidia(storage) {
    return getWorkMode(storage) === NVIDIA;
  }

  function isChatbots(storage) {
    return getWorkMode(storage) !== NVIDIA;
  }

  /**
   * Flags para /api generate y variantes.
   * chatbots → no intentar hub local aunque PREFER_LOCAL_GPU=1 en .env
   * nvidia  → forceLocalGpu (Comfy/LU) aunque el env no tenga PREFER_LOCAL_GPU
   */
  function genLocalGpuFlags(storage) {
    const nvidia = isNvidia(storage);
    return {
      preferLocalGpu: nvidia,
      forceLocalGpu: nvidia
    };
  }

  function applyWorkModeToDocument(mode, doc) {
    const resolved = normalize(mode);
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return resolved;
    const rootEl = d.documentElement;
    if (rootEl) {
      if (rootEl.setAttribute) rootEl.setAttribute('data-work-mode', resolved);
      if (rootEl.classList) {
        rootEl.classList.toggle('work-mode-nvidia', resolved === NVIDIA);
        rootEl.classList.toggle('work-mode-chatbots', resolved !== NVIDIA);
      }
    }
    if (d.body) {
      if (d.body.setAttribute) d.body.setAttribute('data-work-mode', resolved);
      if (d.body.classList) {
        d.body.classList.toggle('work-mode-nvidia', resolved === NVIDIA);
        d.body.classList.toggle('work-mode-chatbots', resolved !== NVIDIA);
      }
    }
    const buttons = d.querySelectorAll ? d.querySelectorAll('[data-work-mode-btn]') : [];
    buttons.forEach((btn) => {
      const id = btn.getAttribute('data-work-mode-btn');
      const on = id === resolved;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const status = d.getElementById ? d.getElementById('workModeStatus') : null;
    if (status) {
      status.textContent = resolved === NVIDIA
        ? 'Modo GPU NVIDIA: imagen en Locally Uncensored / Comfy; texto en Ollama / LM Studio. El JSON sigue siendo el producto.'
        : 'Modo chatbots: Copiar JSON a ChatGPT / Gemini / Claude. No se usa la GPU.';
    }
    return resolved;
  }

  function listModes() {
    return [MODES.chatbots, MODES.nvidia];
  }

  return {
    STORAGE_KEY,
    CHATBOTS,
    NVIDIA,
    MODES,
    normalize,
    getWorkMode,
    setWorkMode,
    isNvidia,
    isChatbots,
    genLocalGpuFlags,
    applyWorkModeToDocument,
    listModes
  };
});
