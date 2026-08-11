/**
 * UGC shot composer — cámara iPhone + formatos de toma (inspirado en ugc-creator).
 * Path free: inyecta Layer 4 (cámara) + escenario en packs chatbot sin APIs de pago.
 * UMD: Node (tests) y navegador (app.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluUgcShotComposer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAMERA_PROFILES = {
    selfie: {
      id: 'selfie',
      label: 'Selfie front',
      short: 'Brazo extendido, talking-head',
      fieldValue: 'iPhone front selfie camera, arm\'s-length, mild wide-lens distortion',
      promptBlock:
        'Shot on iPhone front selfie camera: arm\'s-length framing, subject fills the frame ' +
        'from chest up, slight upward or straight-on tilt, mild wide-angle lens distortion ' +
        '(nose/center slightly enlarged), softer front-sensor detail, visible handheld ' +
        'micro-shake, vertical 9:16.'
    },
    rear: {
      id: 'rear',
      label: 'Rear cam',
      short: '«Alguien me filmó»',
      fieldValue: 'iPhone rear main camera, candid, natural depth of field',
      promptBlock:
        'Shot on iPhone rear main camera: sharper detail, natural focal compression, ' +
        'filmed by someone a few feet away, candid framing with subject slightly ' +
        'off-center, shallow natural depth of field, vertical 9:16.'
    },
    mirror: {
      id: 'mirror',
      label: 'Mirror selfie',
      short: 'Espejo + teléfono visible',
      fieldValue: 'iPhone mirror selfie, phone visible in hand, reflection glare',
      promptBlock:
        'Mirror selfie shot on iPhone: phone visible in one hand, slight reflection ' +
        'softness and glass glare, faint smudges on the mirror, bathroom or bedroom ' +
        'context behind her, flash bloom optional, vertical 9:16.'
    },
    overhead: {
      id: 'overhead',
      label: 'Overhead',
      short: 'Flatlay / unboxing',
      fieldValue: 'iPhone overhead flatlay, top-down, hands in frame',
      promptBlock:
        'Overhead flatlay shot on iPhone: top-down view of a surface, product and props ' +
        'arranged slightly imperfectly, hands entering the frame, even soft lighting with ' +
        'mild lens distortion creeping in at the edges, vertical 9:16 or square.'
    }
  };

  const SHOT_TYPES = {
    testimonial: {
      id: 'testimonial',
      label: 'Testimonial',
      short: 'Habla a cámara con producto',
      defaultCamera: 'selfie',
      suggestedPack: 'product',
      scenarioSeed:
        'She is talking to camera holding/showing a product, natural reaction, soft front light, authentic endorsement energy.',
      weekBrief: 'testimonial, holding product, soft front light'
    },
    lifestyle: {
      id: 'lifestyle',
      label: 'Lifestyle',
      short: 'Momento candid / vibe',
      defaultCamera: 'rear',
      suggestedPack: 'fullbody',
      scenarioSeed:
        'Candid lifestyle moment: walking or sitting with coffee, relaxed easy expression, natural daylight, light on selling heavy on relatability.',
      weekBrief: 'lifestyle, morning coffee, window light'
    },
    unboxing: {
      id: 'unboxing',
      label: 'Unboxing',
      short: 'Abrir paquete / haul',
      defaultCamera: 'overhead',
      suggestedPack: 'product',
      scenarioSeed:
        'Unboxing: opening a parcel on a counter, first reaction, hands in frame, product reveal energy.',
      weekBrief: 'unboxing skincare, kitchen counter, overhead'
    },
    grwm: {
      id: 'grwm',
      label: 'GRWM',
      short: 'Get ready with me',
      defaultCamera: 'mirror',
      suggestedPack: 'fullbody',
      scenarioSeed:
        'Get-ready-with-me: mid-makeup or half-done hair, choosing an outfit, bathroom/bedroom mirror context.',
      weekBrief: 'GRWM, bathroom mirror, half-done makeup'
    },
    product_demo: {
      id: 'product_demo',
      label: 'Demo producto',
      short: 'Cómo se usa',
      defaultCamera: 'rear',
      suggestedPack: 'product',
      scenarioSeed:
        'Product demo close-up: applying or using the product, hands and face focus, before/after energy, clear how-it-works framing.',
      weekBrief: 'product demo, applying serum, close rear cam'
    },
    haul: {
      id: 'haul',
      label: 'Haul / try-on',
      short: 'Probar outfits',
      defaultCamera: 'mirror',
      suggestedPack: 'fullbody',
      scenarioSeed:
        'Haul / try-on: full-length mirror, outfit change, holding items up, multiple looks energy.',
      weekBrief: 'haul try-on, full-length mirror, outfit change'
    },
    day_in_life: {
      id: 'day_in_life',
      label: 'Day in life',
      short: 'Mini-vlog del día',
      defaultCamera: 'selfie',
      suggestedPack: 'fullbody',
      scenarioSeed:
        'Day-in-the-life beat: morning → outfit → out-and-about feel in one still (suggest continuity of the same person across a day).',
      weekBrief: 'day-in-life, morning to evening vibe, mixed phone cams'
    }
  };

  function getCamera(id) {
    return CAMERA_PROFILES[id] || null;
  }

  function getShotType(id) {
    return SHOT_TYPES[id] || null;
  }

  function listCameraIds() {
    return Object.keys(CAMERA_PROFILES);
  }

  function listShotTypeIds() {
    return Object.keys(SHOT_TYPES);
  }

  /**
   * Compose Layer 4 camera + scenario extras for packs / prompts.
   * @param {{ cameraId?: string|null, shotTypeId?: string|null }} opts
   */
  function composeShotExtras(opts = {}) {
    let cameraId = opts.cameraId || null;
    const shot = opts.shotTypeId ? SHOT_TYPES[opts.shotTypeId] : null;
    if (!cameraId && shot) cameraId = shot.defaultCamera;
    const camera = cameraId ? CAMERA_PROFILES[cameraId] : null;

    const parts = [];
    if (shot) {
      parts.push(`SHOT TYPE (${shot.label}): ${shot.scenarioSeed}`);
    }
    if (camera) {
      parts.push(`CAMERA (${camera.label}): ${camera.promptBlock}`);
    }

    return {
      cameraId: camera ? camera.id : null,
      shotTypeId: shot ? shot.id : null,
      camera,
      shot,
      cameraFieldValue: camera ? camera.fieldValue : null,
      suggestedPack: shot ? shot.suggestedPack : null,
      extraScene: parts.length ? parts.join('\n') : '',
      cameraPromptBlock: camera ? camera.promptBlock : '',
      scenarioSeed: shot ? shot.scenarioSeed : ''
    };
  }

  /**
   * Seven one-line briefs for a content-week calendar (same identity card).
   * @param {string} name
   * @param {{ cameraId?: string }} [opts]
   */
  function buildWeekBriefs(name, opts = {}) {
    const who = name || 'Influencer';
    return listShotTypeIds().map((id) => {
      const s = SHOT_TYPES[id];
      const cam = CAMERA_PROFILES[opts.cameraId || s.defaultCamera];
      return `${who}, ${s.weekBrief}  # ${s.label} · cam ${cam ? cam.label : s.defaultCamera}`;
    });
  }

  /**
   * Copy-ready week block for free chatbots (lock already pasted separately or included by caller).
   */
  function buildWeekCalendarText(name, opts = {}) {
    const lines = buildWeekBriefs(name, opts);
    return `═══════════════════════════════════════════
CALENDARIO UGC — 7 TOMAS (cero costo)
Influencer: ${name || 'Influencer'}
Misma persona en las 7: reutiliza el CHARACTER LOCK byte-idéntico.
Solo cambian escenario + cámara (Layers 2–4).
═══════════════════════════════════════════

${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

CÓMO USAR:
1) Pega el CHARACTER LOCK una vez.
2) Genera cada one-liner como una imagen aparte.
3) Spot-check: misma asimetría, mismas marcas, misma tez entre tomas.
`;
  }

  return {
    CAMERA_PROFILES,
    SHOT_TYPES,
    getCamera,
    getShotType,
    listCameraIds,
    listShotTypeIds,
    composeShotExtras,
    buildWeekBriefs,
    buildWeekCalendarText
  };
});
