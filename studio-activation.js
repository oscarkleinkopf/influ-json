/**
 * Corte G / I5 — métrica local de activación (sin telemetría externa).
 * Pasos: crear → guardar → copiar JSON → exportar pack → prueba de identidad.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluStudioActivation = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'influ_activation_v1';

  const STEPS = [
    { id: 'create', label: 'Crear o importar' },
    { id: 'save', label: 'Guardar influencer' },
    { id: 'copy', label: 'Copiar JSON' },
    { id: 'export', label: 'Exportar pack' },
    { id: 'identity', label: 'Prueba de identidad' }
  ];

  function storageKey(profileId) {
    return `${PREFIX}:${profileId || 'anon'}`;
  }

  function emptyFlags() {
    return {
      create: false,
      save: false,
      copy: false,
      export: false,
      identity: false,
      updatedAt: null
    };
  }

  function load(profileId, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return emptyFlags();
    try {
      const raw = store.getItem(storageKey(profileId));
      if (!raw) return emptyFlags();
      const parsed = JSON.parse(raw);
      const out = emptyFlags();
      for (const s of STEPS) {
        out[s.id] = !!parsed[s.id];
      }
      out.updatedAt = parsed.updatedAt || null;
      return out;
    } catch (_) {
      return emptyFlags();
    }
  }

  function save(profileId, flags, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return flags;
    const payload = {
      ...emptyFlags(),
      ...flags,
      updatedAt: new Date().toISOString()
    };
    try {
      store.setItem(storageKey(profileId), JSON.stringify(payload));
    } catch (_) { /* quota */ }
    return payload;
  }

  function mark(profileId, stepId, storage = null) {
    if (!STEPS.some((s) => s.id === stepId)) return load(profileId, storage);
    const flags = load(profileId, storage);
    if (flags[stepId]) return flags;
    flags[stepId] = true;
    return save(profileId, flags, storage);
  }

  /**
   * Merge flags with live roster signals (create/save from personas).
   */
  function resolve(profileId, live = {}, storage = null) {
    const flags = load(profileId, storage);
    const merged = {
      create: !!(flags.create || live.hasPersona),
      save: !!(flags.save || live.hasPersona),
      copy: !!(flags.copy || live.copiedJson),
      export: !!(flags.export || live.exportedPack),
      identity: !!(flags.identity || live.identityPass),
      updatedAt: flags.updatedAt
    };
    return merged;
  }

  function summarize(flags) {
    const done = STEPS.filter((s) => !!flags[s.id]).length;
    const total = STEPS.length;
    return {
      done,
      total,
      ready: done >= total,
      label: done >= total
        ? 'Tu Studio está listo 5/5'
        : `Tu Studio está listo ${done}/${total}`,
      steps: STEPS.map((s) => ({ ...s, done: !!flags[s.id] }))
    };
  }

  return {
    PREFIX,
    STEPS,
    storageKey,
    emptyFlags,
    load,
    save,
    mark,
    resolve,
    summarize
  };
});
