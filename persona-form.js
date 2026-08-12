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

  function setField(doc, id, val) {
    const el = doc.getElementById(id);
    if (el && val != null) el.value = val;
  }

  /**
   * Escribe analysisResult → campos del formulario.
   * @returns {{ clothingHint: string }}
   */
  function applyAnalysisToFormFields(analysis, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !analysis) return { clothingHint: '' };

    const i = analysis.identity || {};
    const f = analysis.facial_features || {};
    const h = analysis.hair || {};
    const a = analysis.aesthetic || {};
    const p = analysis.photography || {};
    const c = analysis.clothing || {};
    const b = analysis.body || {};

    const genderVal = (i.gender || '').toLowerCase().includes('masc') ? 'Male' : 'Female';
    setField(d, 'pName', i.name || 'Nuevo Influencer');
    setField(d, 'pGender', genderVal);
    setField(d, 'pAge', i.apparent_age || '25 años');
    setField(d, 'pEthnicity', i.ethnicity_appearance || 'Mixta');
    setField(d, 'pStyle', a.overall_vibe || 'Natural');
    setField(d, 'pHair', `${h.texture || 'ondulado'} ${h.length || 'largo'}`);
    setField(d, 'pSetting', p.background_setting || 'Fondo neutro');
    setField(d, 'pSkinTone', f.skin_tone || 'Piel clara');
    setField(d, 'pSkinTexture', f.skin_texture || 'Piel suave con poros naturales');
    setField(d, 'pEyebrows', f.eyebrow_style || 'Cejas naturales');
    setField(
      d,
      'pLips',
      f.lips || (f.lip_color ? `${f.lip_color} ${f.lip_shape || ''}`.trim() : '') || 'Labios rosados naturales'
    );
    setField(d, 'pHairColor', h.color || 'Castaño');
    setField(d, 'pHairTexture', h.texture || 'Ondulado');
    setField(d, 'pHairLength', h.length || 'Largo');
    setField(d, 'pEyeColor', f.eye_color || 'Marrón');
    setField(d, 'pFaceShape', f.face_shape || 'Ovalada');
    setField(d, 'pSmileType', f.smile_type || 'Natural');
    setField(d, 'pBodyType', b.body_type || i.body_type || 'Atlético y proporcionado');
    setField(d, 'pHeight', b.height_appearance || 'Estatura media (~1.65 m)');
    setField(d, 'pProportions', b.proportions || 'Hombros equilibrados, cintura definida, caderas suaves');
    setField(d, 'pPosture', b.posture || 'Erguida y relajada');
    setField(d, 'pFitness', b.fitness_level || 'Tono natural ligero');
    setField(d, 'pBodySkin', b.skin_continuity || 'Mismo tono de piel en rostro, cuello y brazos');

    return {
      clothingHint: `${c.type || ''} en ${c.color || ''}`
    };
  }

  return { readPersonaForm, readPersonaRowFields, fieldValue, applyAnalysisToFormFields, setField };
});
