/**
 * Presets de nicho para character_lock / crear desde cero.
 * Free path: solo rellenan el formulario + metadatos del JSON — sin APIs de pago.
 *
 * Uso Node: const { NICHE_PRESETS, applyNicheToFormValues } = require('./niche-presets');
 * Uso browser: window.InfluNichePresets
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluNichePresets = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NICHE_PRESETS = {
    beauty: {
      id: 'beauty',
      label: 'Beauty / skincare',
      short: 'Tez clara, UGC espejo, voz cercana',
      form: {
        style: 'Beauty UGC — skincare natural y glow',
        hair: 'Marrón castaño ondulado medio-largo',
        setting: 'Baño / tocador con luz de ventana suave',
        lighting: 'Soft daylight from bathroom window, flattering skin',
        camera: 'iPhone front camera mirror selfie, slight angle',
        clothing: 'Top básico blanco limpio / bata ligera de spa',
        skinTone: 'piel clara natural con glow saludable',
        skinToneHex: '#f0d5c0',
        skinTexture: 'piel real con poros suaves y luminosidad natural',
        hairColor: 'marrón castaño',
        hairTexture: 'ondulado natural',
        hairLength: 'medio-largo',
        eyebrows: 'cejas peinadas y definidas',
        eyeColor: 'marrón miel',
        lips: 'labios hidratados, proporciones naturales',
        faceShape: 'ovalada suave',
        smileType: 'sonrisa cálida de “antes/después”',
        bodyType: 'Proporcionado / soft athletic',
        height: 'Estatura media (~1.65 m)',
        proportions: 'Hombros suaves, cintura natural, silueta equilibrada',
        posture: 'Erguida frente al espejo, hombros relajados',
        fitness: 'Tono natural ligero',
        bodySkin: 'Mismo tono de piel en rostro, cuello, hombros y escote',
        distinctiveMarks: 'Peca sutil en el pómulo; lunar pequeño en la clavícula',
        mbti: 'ENFP — cercana y entusiasta',
        communicationStyle: 'Cálida, “amiga que recomienda”, emojis moderados, habla de textura y rutina',
        taboos: 'No promete milagros médicos, No shaming de piel, No ingredientes inventados'
      },
      lockExtras: {
        niche: 'beauty',
        brand_voice: 'amiga experta en rutina facial',
        recommended_packs: ['product', 'fullbody'],
        ugc_angle: 'PAS — problema de piel → producto → resultado'
      }
    },
    fitness: {
      id: 'fitness',
      label: 'Fitness / wellness',
      short: 'Energía gym, cuerpo atlético, tono motivador',
      form: {
        style: 'Fitness lifestyle — energía y disciplina amable',
        hair: 'Coleta alta / cabello recogido práctico',
        setting: 'Gimnasio doméstico o parque al amanecer',
        lighting: 'Morning outdoor light or bright gym LEDs',
        camera: 'iPhone 15 vertical UGC, handheld',
        clothing: 'Calzas y top deportivo negro entallado',
        skinTone: 'piel clara natural (no bronceado exagerado)',
        skinToneHex: '#edd0b8',
        skinTexture: 'piel real con brillo ligero de esfuerzo',
        hairColor: 'marrón oscuro',
        hairTexture: 'liso a ligeramente ondulado',
        hairLength: 'recogido / coleta media',
        eyebrows: 'cejas naturales definidas',
        eyeColor: 'marrón oscuro',
        lips: 'labios naturales sin maquillaje pesado',
        faceShape: 'ovalada atlética',
        smileType: 'sonrisa motivadora post-entreno',
        bodyType: 'Atlético proporcionado',
        height: 'Estatura media-alta aparente',
        proportions: 'Hombros definidos, cintura firme, piernas tonificadas (sin exagerar)',
        posture: 'Erguida, pecho abierto, postura de entrenadora',
        fitness: 'Tono muscular visible ligero, saludable',
        bodySkin: 'Misma tez en rostro, brazos y abdomen; textura natural',
        distinctiveMarks: 'Pequeña cicatriz discreta en la rodilla; lunar en el antebrazo',
        mbti: 'ESTP — directa y en movimiento',
        communicationStyle: 'Motivadora, frases cortas, retos de 7 días, sin toxicidad gym',
        taboos: 'No body shaming, No suplementos milagro sin evidencia, No presión extrema'
      },
      lockExtras: {
        niche: 'fitness',
        brand_voice: 'coach cercana y realista',
        recommended_packs: ['fullbody', 'product'],
        ugc_angle: 'AIDA — atención al resultado → prueba social → CTA app/producto'
      }
    },
    moda: {
      id: 'moda',
      label: 'Moda / lifestyle',
      short: 'Street chic, outfit of the day, tono aspiracional',
      form: {
        style: 'Moda lifestyle — street chic minimal',
        hair: 'Ondas suaves peinadas, look editorial ligero',
        setting: 'Calle urbana con luz de tarde / café con cristalera',
        lighting: 'Golden hour street light, soft shadows',
        camera: 'iPhone portrait mode, vertical OOTD',
        clothing: 'Blazer oversized + top básico + jeans claros',
        skinTone: 'piel clara natural con acabado satinado',
        skinToneHex: '#f2d4bc',
        skinTexture: 'piel real con maquillaje ligero “skin tint”',
        hairColor: 'castaño claro con reflejos suaves',
        hairTexture: 'ondas suaves cepilladas',
        hairLength: 'largo por debajo de los hombros',
        eyebrows: 'cejas laminadas naturales',
        eyeColor: 'verde avellana / marrón claro',
        lips: 'labios con gloss sutil',
        faceShape: 'corazón suave / ovalada',
        smileType: 'media sonrisa confiada de OOTD',
        bodyType: 'Eslingado proporcionado',
        height: 'Apariencia de piernas largas / estatura media-alta',
        proportions: 'Silueta alargada, cintura marcada con proporciones naturales',
        posture: 'Contrapposto ligero, pose de lookbook',
        fitness: 'Tono ligero de lifestyle activo',
        bodySkin: 'Continuidad de tez en cuello, hombros y brazos',
        distinctiveMarks: 'Lunar fino junto a la boca; peca en el hombro',
        mbti: 'ESFP — expresiva y visual',
        communicationStyle: 'Aspiracional pero cercana, habla de fits y “cómo combinar”',
        taboos: 'No fast fashion sin transparencia, No tallas humillantes, No copia de looks de marcas de lujo como propios'
      },
      lockExtras: {
        niche: 'moda',
        brand_voice: 'estilista amiga en stories',
        recommended_packs: ['fullbody', 'spicy'],
        ugc_angle: 'Unboxing / try-on — outfit → detalle → CTA link en bio'
      }
    }
  };

  function listNichePresets() {
    return Object.values(NICHE_PRESETS).map((p) => ({
      id: p.id,
      label: p.label,
      short: p.short
    }));
  }

  function getNichePreset(id) {
    const key = String(id || '').trim().toLowerCase();
    return NICHE_PRESETS[key] || null;
  }

  /**
   * Devuelve un mapa idDOM → valor para aplicar al formulario de crear.
   */
  function formValuesFromNiche(id) {
    const preset = getNichePreset(id);
    if (!preset) return null;
    const f = preset.form;
    return {
      pStyle: f.style,
      pHair: f.hair,
      pSetting: f.setting,
      pLighting: f.lighting,
      pCamera: f.camera,
      pClothing: f.clothing,
      pSkinTone: f.skinTone,
      pSkinToneHex: f.skinToneHex,
      pSkinTexture: f.skinTexture,
      pHairColor: f.hairColor,
      pHairTexture: f.hairTexture,
      pHairLength: f.hairLength,
      pEyebrows: f.eyebrows,
      pEyeColor: f.eyeColor,
      pLips: f.lips,
      pFaceShape: f.faceShape,
      pSmileType: f.smileType,
      pBodyType: f.bodyType,
      pHeight: f.height,
      pProportions: f.proportions,
      pPosture: f.posture,
      pFitness: f.fitness,
      pBodySkin: f.bodySkin,
      pDistinctiveMarks: f.distinctiveMarks,
      pMbti: f.mbti,
      pCommunicationStyle: f.communicationStyle,
      pTaboos: f.taboos,
      _nicheId: preset.id,
      _nicheLabel: preset.label,
      _lockExtras: preset.lockExtras
    };
  }

  return {
    NICHE_PRESETS,
    listNichePresets,
    getNichePreset,
    formValuesFromNiche
  };
});
