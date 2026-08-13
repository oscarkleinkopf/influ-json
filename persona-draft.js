/**
 * Corte E / U2 — borradores locales del formulario de persona (sin secretos ni base64).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPersonaDraft = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_PREFIX = 'influ_persona_draft_v1';

  function storageKey(profileId, mode) {
    const pid = profileId || 'anon';
    const m = mode === 'import' ? 'import' : 'create';
    return `${STORAGE_PREFIX}:${pid}:${m}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function minutesAgo(iso) {
    try {
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return null;
      return Math.max(0, Math.round((Date.now() - t) / 60000));
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {{ profileId?: string, mode?: string, form?: object, meta?: object }} draft
   */
  function saveDraft(draft, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store || !draft || typeof draft !== 'object') return false;
    const form = draft.form && typeof draft.form === 'object' ? draft.form : null;
    if (!form) return false;
    // Never persist huge blobs / data URLs
    const safeForm = {};
    for (const [k, v] of Object.entries(form)) {
      if (v == null) {
        safeForm[k] = v;
        continue;
      }
      const s = String(v);
      if (s.startsWith('data:') || s.length > 2000) continue;
      safeForm[k] = s;
    }
    if (!Object.keys(safeForm).some((k) => String(safeForm[k] || '').trim())) return false;

    const payload = {
      version: 1,
      savedAt: nowIso(),
      mode: draft.mode === 'import' ? 'import' : 'create',
      profileId: draft.profileId || null,
      form: safeForm,
      meta: draft.meta && typeof draft.meta === 'object' ? draft.meta : {}
    };
    try {
      store.setItem(storageKey(payload.profileId, payload.mode), JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadDraft(profileId, mode, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return null;
    try {
      const raw = store.getItem(storageKey(profileId, mode));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.form) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function clearDraft(profileId, mode, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return;
    try {
      store.removeItem(storageKey(profileId, mode));
    } catch (_) {}
  }

  function clearAllForProfile(profileId, storage = null) {
    clearDraft(profileId, 'create', storage);
    clearDraft(profileId, 'import', storage);
  }

  /** Map form keys from readPersonaForm → input ids */
  const FORM_TO_ID = {
    name: 'pName',
    gender: 'pGender',
    age: 'pAge',
    ethnicity: 'pEthnicity',
    style: 'pStyle',
    hair: 'pHair',
    lighting: 'pLighting',
    camera: 'pCamera',
    clothing: 'pClothing',
    setting: 'pSetting',
    skinTone: 'pSkinTone',
    skinToneHex: 'pSkinToneHex',
    skinTexture: 'pSkinTexture',
    hairColor: 'pHairColor',
    hairTexture: 'pHairTexture',
    hairLength: 'pHairLength',
    eyebrows: 'pEyebrows',
    eyeColor: 'pEyeColor',
    lips: 'pLips',
    faceShape: 'pFaceShape',
    facialAsymmetry: 'pFacialAsymmetry',
    distinctiveMarks: 'pDistinctiveMarks',
    bodyType: 'pBodyType',
    height: 'pHeight',
    proportions: 'pProportions',
    posture: 'pPosture',
    fitness: 'pFitness',
    bodySkin: 'pBodySkin'
  };

  function applyDraftToForm(draft, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !draft?.form) return false;
    let applied = 0;
    for (const [key, id] of Object.entries(FORM_TO_ID)) {
      if (draft.form[key] == null) continue;
      const el = d.getElementById(id);
      if (!el) continue;
      el.value = String(draft.form[key]);
      applied += 1;
    }
    return applied > 0;
  }

  function bannerText(draft) {
    const mins = minutesAgo(draft?.savedAt);
    const ago = mins == null ? '' : mins < 1 ? 'hace menos de 1 min' : `hace ${mins} min`;
    return `Recuperamos un borrador ${ago}`.trim();
  }

  return {
    STORAGE_PREFIX,
    storageKey,
    saveDraft,
    loadDraft,
    clearDraft,
    clearAllForProfile,
    applyDraftToForm,
    bannerText,
    minutesAgo,
    FORM_TO_ID
  };
});
