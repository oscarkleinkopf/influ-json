/**
 * Persona form reader (UX-4) — single source for form field values.
 * Used by compilePromptAndJSON / getFullPersonaJSON / savePersona.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPersonaForm = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fieldValue(doc, id, fallback = '') {
    const el = doc.getElementById(id);
    if (!el || el.value == null) return fallback;
    return String(el.value);
  }

  /**
   * Lee todos los campos del formulario de Persona Engine.
   * @param {Document} [doc]
   */
  function readPersonaForm(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || typeof d.getElementById !== 'function') {
      throw new Error('document no disponible para readPersonaForm');
    }
    const g = (id, fb = '') => fieldValue(d, id, fb);
    return {
      name: g('pName'),
      gender: g('pGender'),
      age: g('pAge'),
      ethnicity: g('pEthnicity'),
      style: g('pStyle'),
      hair: g('pHair'),
      lighting: g('pLighting'),
      camera: g('pCamera'),
      clothing: g('pClothing'),
      setting: g('pSetting'),
      skinTone: g('pSkinTone'),
      skinToneHex: g('pSkinToneHex').trim(),
      skinTexture: g('pSkinTexture'),
      hairColor: g('pHairColor'),
      hairTexture: g('pHairTexture'),
      hairLength: g('pHairLength'),
      eyebrows: g('pEyebrows'),
      eyeColor: g('pEyeColor'),
      lips: g('pLips'),
      faceShape: g('pFaceShape'),
      smileType: g('pSmileType'),
      distinctiveMarks: g('pDistinctiveMarks'),
      facialAsymmetry: g('pFacialAsymmetry'),
      bodyType: g('pBodyType', 'Atlético y proporcionado'),
      height: g('pHeight', 'Estatura media (~1.65 m)'),
      proportions: g('pProportions'),
      posture: g('pPosture'),
      fitness: g('pFitness'),
      bodySkin: g('pBodySkin'),
      mbti: g('pMbti'),
      communicationStyle: g('pCommunicationStyle'),
      taboos: g('pTaboos')
    };
  }

  /** Campos planos que van al POST /api/personas (fila SQLite). */
  function readPersonaRowFields(doc) {
    const f = readPersonaForm(doc);
    return {
      name: (f.name || '').trim(),
      gender: f.gender,
      age: f.age,
      ethnicity: f.ethnicity,
      style: f.style,
      hair: f.hair,
      lighting: f.lighting,
      camera: f.camera,
      clothing: f.clothing,
      setting: f.setting
    };
  }

  return { readPersonaForm, readPersonaRowFields, fieldValue };
});
