/**
 * Corte G / I3 — Lock lab local: lock A vs B con mismos prompts + evaluación manual.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluLockLab = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'influ_lock_lab_v1';

  function storageKey(profileId, personaId) {
    return `${PREFIX}:${profileId || 'anon'}:${personaId || 'draft'}`;
  }

  function emptyScore() {
    return { face: null, skin: null, hair: null, silhouette: null };
  }

  function emptySession() {
    return {
      revisionA: null,
      revisionB: null,
      scoreA: emptyScore(),
      scoreB: emptyScore(),
      recommendation: null,
      updatedAt: null
    };
  }

  function load(profileId, personaId, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return emptySession();
    try {
      const raw = store.getItem(storageKey(profileId, personaId));
      if (!raw) return emptySession();
      const parsed = JSON.parse(raw);
      return {
        ...emptySession(),
        ...parsed,
        scoreA: { ...emptyScore(), ...(parsed.scoreA || {}) },
        scoreB: { ...emptyScore(), ...(parsed.scoreB || {}) }
      };
    } catch (_) {
      return emptySession();
    }
  }

  function save(profileId, personaId, session, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const payload = {
      ...emptySession(),
      ...session,
      updatedAt: new Date().toISOString()
    };
    if (store) {
      try {
        store.setItem(storageKey(profileId, personaId), JSON.stringify(payload));
      } catch (_) {}
    }
    return payload;
  }

  function scoreTotal(score) {
    if (!score) return 0;
    return ['face', 'skin', 'hair', 'silhouette'].reduce((n, k) => n + (score[k] === true ? 1 : 0), 0);
  }

  /**
   * @returns {'keep_a'|'keep_b'|'tie'|'incomplete'}
   */
  function recommend(session) {
    const a = scoreTotal(session?.scoreA);
    const b = scoreTotal(session?.scoreB);
    const aDone = ['face', 'skin', 'hair', 'silhouette'].every(
      (k) => session?.scoreA?.[k] === true || session?.scoreA?.[k] === false
    );
    const bDone = ['face', 'skin', 'hair', 'silhouette'].every(
      (k) => session?.scoreB?.[k] === true || session?.scoreB?.[k] === false
    );
    if (!aDone || !bDone) return 'incomplete';
    if (a > b) return 'keep_a';
    if (b > a) return 'keep_b';
    return 'tie';
  }

  function recommendationLabel(rec) {
    switch (rec) {
      case 'keep_a': return 'Conservar lock A (mejor puntuación)';
      case 'keep_b': return 'Preferir lock B / restaurar B';
      case 'tie': return 'Empate — elige por gusto o vuelve a probar';
      default: return 'Completa las 4 marcas en A y B';
    }
  }

  return {
    PREFIX,
    storageKey,
    emptyScore,
    emptySession,
    load,
    save,
    scoreTotal,
    recommend,
    recommendationLabel
  };
});
