/**
 * Corte G / U5 — Prueba de identidad guiada (3 prompts fijos + checklist local).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluIdentityTrial = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'influ_identity_trial_v1';

  const CHECK_KEYS = ['face', 'skin', 'hair', 'silhouette'];

  function storageKey(profileId, personaId, lockRevisionId) {
    const p = profileId || 'anon';
    const pe = personaId || 'draft';
    const rev = lockRevisionId || 'current';
    return `${PREFIX}:${p}:${pe}:${rev}`;
  }

  function emptyEvaluation() {
    return {
      face: null,
      skin: null,
      hair: null,
      silhouette: null,
      lockRevisionId: null,
      personaId: null,
      updatedAt: null,
      notes: ''
    };
  }

  function load(profileId, personaId, lockRevisionId, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return emptyEvaluation();
    try {
      const raw = store.getItem(storageKey(profileId, personaId, lockRevisionId));
      if (!raw) return emptyEvaluation();
      const parsed = JSON.parse(raw);
      const out = emptyEvaluation();
      for (const k of CHECK_KEYS) {
        out[k] = parsed[k] === true ? true : parsed[k] === false ? false : null;
      }
      out.lockRevisionId = parsed.lockRevisionId || lockRevisionId || null;
      out.personaId = parsed.personaId || personaId || null;
      out.updatedAt = parsed.updatedAt || null;
      out.notes = typeof parsed.notes === 'string' ? parsed.notes : '';
      return out;
    } catch (_) {
      return emptyEvaluation();
    }
  }

  function save(profileId, personaId, lockRevisionId, evaluation, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const payload = {
      ...emptyEvaluation(),
      ...evaluation,
      face: evaluation.face === true,
      skin: evaluation.skin === true,
      hair: evaluation.hair === true,
      silhouette: evaluation.silhouette === true,
      lockRevisionId: lockRevisionId || evaluation.lockRevisionId || null,
      personaId: personaId || evaluation.personaId || null,
      updatedAt: new Date().toISOString()
    };
    if (store) {
      try {
        store.setItem(storageKey(profileId, personaId, lockRevisionId), JSON.stringify(payload));
      } catch (_) {}
    }
    return payload;
  }

  function isPassing(evaluation) {
    if (!evaluation) return false;
    return CHECK_KEYS.every((k) => evaluation[k] === true);
  }

  function anyFail(evaluation) {
    if (!evaluation) return false;
    return CHECK_KEYS.some((k) => evaluation[k] === false);
  }

  /**
   * Bloque portable: usa chatbot-packs session check si existe; si no, fallback mínimo.
   */
  function buildTrialBlock(personaJSON, opts = {}) {
    if (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.buildChatbotSessionCheck) {
      const base = InfluChatbotPacks.buildChatbotSessionCheck(personaJSON, opts);
      return `${base}

───────────────────────────────────────────
CHECKLIST PRUEBA DE IDENTIDAD (marca en el Studio)
□ Misma cara en A / B / C
□ Misma tez
□ Mismo pelo (color / largo / textura)
□ Misma silueta / proporciones corporales
───────────────────────────────────────────
`;
    }
    const must = personaJSON?.character_lock?.must_match_every_image || {};
    const name = must.name || personaJSON?.identity?.name || opts.fallbackName || 'Influencer';
    return `PRUEBA DE IDENTIDAD — ${name}
PROMPT A — Retrato ancla (misma cara/tez)
PROMPT B — Cuerpo entero (misma silueta + cara)
PROMPT C — Con producto (cara reconocible)
Checklist: cara · tez · pelo · silueta
`;
  }

  function compareEvaluations(before, after) {
    const changes = [];
    for (const k of CHECK_KEYS) {
      const a = before?.[k] === true ? true : before?.[k] === false ? false : null;
      const b = after?.[k] === true ? true : after?.[k] === false ? false : null;
      if (a === b) continue;
      changes.push({ path: k, before: a, after: b });
    }
    return changes;
  }

  return {
    PREFIX,
    CHECK_KEYS,
    storageKey,
    emptyEvaluation,
    load,
    save,
    isPassing,
    anyFail,
    buildTrialBlock,
    compareEvaluations
  };
});
