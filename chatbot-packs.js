/**
 * F5 — Packs gratis para chatbots (character_lock).
 * Compartido: Node (tests / brand-kit) y navegador (app.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluChatbotPacks = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FREE_CHATBOT_PACKS = {
    fullbody: {
      id: 'fullbody',
      label: '🧍 Cuerpo entero',
      short: 'Head-to-toe, misma persona',
      sceneInstruction: `Genera UNA imagen UGC de smartphone en CUERPO ENTERO (head-to-toe):
• Cámara lejos: se ven pies y cabeza con margen de entorno
• Misma persona del CHARACTER LOCK (cara, tez, pelo, cuerpo)
• Pose natural de pie o caminando
• NO close-up, NO solo rostro, NO recorte a la cintura
• Proporciones naturales (no alargar cara ni cuerpo)
• Estilo foto amateur de celular, no cine`
    },
    bikini: {
      id: 'bikini',
      label: 'Bikini / playa',
      short: 'Bikini + playa, misma tez',
      sceneInstruction: `Genera UNA imagen UGC en la playa:
• Ropa: bikini de dos piezas (o trikini si pides otra variante)
• Fondo: playa de arena y mar, luz de día natural
• Preferible plano medio o cuerpo entero
• MISMA cara y MISMA tez del CHARACTER LOCK (no oscurecer la piel al sol)
• Cabello y cuerpo según el lock
• Estilo influencer con celular, no campaña de moda 8K`
    },
    spicy: {
      id: 'spicy',
      label: 'Spicy (realista)',
      short: 'Sensual fotoreal, no CGI',
      sceneInstruction: `Genera UNA imagen UGC sensual pero FOTOREALISTA:
• Ropa: lencería o satén elegante (NO látex espejo CGI, NO 3D)
• Ambiente: dormitorio/hotel con luz cálida real
• MISMA cara, tez y cuerpo del CHARACTER LOCK
• Piel real con poros; tela con textura real
• Evitar: muñeca, plástico, neón cyberpunk, calabozo fantasía
• Estilo foto de celular en boudoir, amateur creíble`
    },
    product: {
      id: 'product',
      label: 'Producto en mano',
      short: 'UGC con producto',
      sceneInstruction: `Genera UNA imagen UGC del influencer mostrando un producto:
• El personaje sostiene el producto cerca de la cámara (mano visible)
• Rostro reconocible según CHARACTER LOCK (misma cara y tez)
• Plano medio o selfie con producto
• Fondo interior simple (casa/baño/cocina) con luz de ventana
• Si hay datos de producto en el mensaje, úsalos; si no, usa un frasco/caja genérica de beauty
• Estilo review de TikTok/Instagram, no anuncio de TV`
    },
    explicit: {
      id: 'explicit',
      label: 'PPV / explícito',
      short: 'Opt-in · misma cara, no default',
      nsfw: true,
      sceneInstruction: `Genera UNA imagen UGC explícita / PPV FOTOREALISTA (opt-in):
• MISMA persona del CHARACTER LOCK (cara, tez, pelo, silueta). NUNCA renegocies la cara.
• Framing text-first: cuerpo entero (head-to-toe) o el plano del prompt A/B/C — no congelar el close-up del retrato ancla
• Piel real con poros; luz de habitación / flash de celular
• Estilo foto amateur PPV, no cine 8K, no CGI, no anime
• NO cambiar edad, etnia, tez ni pelo

Usa UNO de estos tres prompts (no mezcles A+B+C en la misma imagen):

PROMPT A — SEMI / LINGERIE
Lingerie o satén, cuerpo entero, dormitorio/hotel con luz cálida real. Sensual, ropa interior visible, no nude completo.

PROMPT B — NUDE FULLBODY
Desnudo artístico fotoreal, cuerpo entero head-to-toe, misma silueta del lock. Habitación real, no estudio de moda.

PROMPT C — CLOSE-UP PPV
Close-up íntimo PPV. Si el rostro entra en cuadro, ES el del CHARACTER LOCK (misma cara, tez, pelo).`
    }
  };

  const SFW_PACK_IDS = ['fullbody', 'bikini', 'spicy', 'product'];

  /**
   * Acepta fila SQLite ({ detailedJSON }) o JSON de personaje ya expandido.
   * Si falta character_lock, sintetiza uno mínimo desde identity/facial/hair/body
   * para que Copiar JSON / CLI nunca peguen `{}` vacío.
   */
  function parseMaybeJson(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return null; }
    }
    return null;
  }

  const REALISM_ANCHORS_ES =
    'Realismo (imperfecciones a propósito): poros visibles y brillo leve en zona T, baby hairs y mechones sueltos, ' +
    'textura sutil bajo los ojos, tono de piel irregular con rojez leve en nariz, textura real de tela con pliegues, ' +
    'un poco de clutter en el borde del cuadro, un highlight ligeramente quemado, grain suave de celular, ' +
    'uñas con cutículas naturales, joyas con peso metálico real.';

  const REALISM_ANCHORS_BLOCK =
    'Realism: visible skin pores and slight T-zone shine, fine flyaway and baby hairs at the hairline, ' +
    'faint under-eye texture and natural shadow, slightly uneven skin tone with mild redness around the nose, ' +
    'real fabric texture with small wrinkles and strap indentation, a little environmental clutter at the frame edge, ' +
    'one slightly blown highlight and uneven natural fill light, mild sensor grain and real-lens softness with a touch of motion blur, ' +
    'natural cuticles and slightly worn nails, jewelry that hangs and catches light with real metal weight.';

  const STANDARD_NEGATIVE_PROMPT =
    'plastic skin, airbrushed, poreless, waxy, perfectly symmetric face, beauty filter, smoothed skin, ' +
    'doll-like, CGI sheen, over-saturated, HDR glow, extra fingers, deformed hands, mangled jewelry, ' +
    'warped background, text artifacts, watermark, over-whitened teeth, uncanny eyes, glossy mannequin look, ' +
    '3d render, cartoon, anime, different person, face swap';

  const FLAT_COMFY_NEGATIVE =
    'ugly, deformed, extra limbs, extra fingers, mutated hands, bad anatomy, ' +
    'blurry, low quality, worst quality, cartoon, anime, text, watermark, ' +
    'wrong face, different person, age change, skin tone change, hair color change, ' +
    STANDARD_NEGATIVE_PROMPT;

  function lockTraitsCsv(must, name) {
    const m = must || {};
    const parts = [
      m.name || name,
      m.age,
      m.gender,
      m.ethnicity,
      m.skin_tone,
      m.skin_tone_hex,
      m.eye_color ? `${m.eye_color} eyes` : null,
      m.eyebrows,
      m.hair_color ? `${m.hair_color} hair` : null,
      m.hair_texture,
      m.hair_length,
      m.body_type,
      m.height,
      m.proportions,
      m.facial_asymmetry,
      isMeaningfulMarks(m.distinctive_marks) ? m.distinctive_marks : null
    ];
    return parts.filter((p) => p != null && String(p).trim()).map((p) => String(p).trim()).join(', ');
  }

  /**
   * Prompt plano para ComfyUI / A1111 / Locally Uncensored (G513R).
   * No sustituye el pack chatbot; es complemento cuando el modo NVIDIA está on.
   */
  function buildFlatComfyPrompt(must, opts = {}) {
    const name = (must && must.name) || opts.fallbackName || 'Influencer';
    const trigger = String(opts.triggerToken || '').trim();
    const scene = opts.scene || 'full body, natural pose, photorealistic smartphone photo';
    const identity = lockTraitsCsv(must, name);
    const triggerBit = trigger ? `${trigger}, ` : '';
    const positive =
      `photorealistic, masterpiece, best quality, ultra detailed, 8k, ${triggerBit}${identity}, ${scene}, ` +
      'detailed skin texture, natural pores, realistic lighting';
    return {
      positive: positive.replace(/\s+/g, ' ').trim(),
      negative: FLAT_COMFY_NEGATIVE,
      checkpointHint: opts.checkpointHint || 'juggernautXL_ragnarok.safetensors'
    };
  }

  const LU_SHOTS = [
    { id: 'A', label: 'semi / lingerie', scene: 'lingerie, full body, warm bedroom light, photorealistic smartphone photo' },
    { id: 'B', label: 'nude fullbody', scene: 'nude full body head-to-toe, same silhouette, real bedroom, photorealistic smartphone photo' },
    { id: 'C', label: 'close-up PPV', scene: 'intimate PPV close-up, same face if visible, photorealistic smartphone photo' }
  ];

  /**
   * Locally Uncensored (y Comfy/A1111) usa DOS cajas: Positive y Negative.
   * Devuelve strings limpios (sin etiquetas) listos para pegar cada uno en su campo.
   */
  function buildLuSplitPrompts(must, opts = {}) {
    const name = (must && must.name) || opts.fallbackName || 'Influencer';
    const triggerToken = String(opts.triggerToken || '').trim();
    const shots = LU_SHOTS.map((shot) => {
      const built = buildFlatComfyPrompt(must, {
        ...opts,
        fallbackName: name,
        scene: shot.scene
      });
      return {
        id: shot.id,
        label: shot.label,
        scene: shot.scene,
        positive: built.positive,
        negative: built.negative
      };
    });
    return {
      negative: shots[0] ? shots[0].negative : FLAT_COMFY_NEGATIVE,
      shots,
      triggerToken: triggerToken || null,
      checkpointHint: opts.checkpointHint || 'juggernautXL_ragnarok.safetensors',
      sfwCheckpoint: 'Juggernaut-XL_v9.safetensors',
      lowVramCheckpoint: 'Realistic_Vision_V6.0_NV_B1_fp16.safetensors',
      nsfwOptInCheckpoint: 'lustifyNSFWCheckpoint_zenithV9.safetensors',
      note: 'Locally Uncensored: pega Positive y Negative en cajas distintas. El checkpoint se elige en el selector de LU, no dentro del prompt.'
    };
  }

  function formatFlatComfySection(must, name, opts = {}) {
    const split = buildLuSplitPrompts(must, { ...opts, fallbackName: name });
    const trigger = split.triggerToken;
    const shotBlocks = split.shots.map((s) => `
▼ CAJA POSITIVE — shot ${s.id} (${s.label})
Copia SOLO el texto entre las marcas (sin las marcas) → pégalo en Positive de LU.

<<<LU_POSITIVE_${s.id}
${s.positive}
LU_POSITIVE_${s.id}>>>`).join('\n');
    return `───────────────────────────────────────────
LOCALLY UNCENSORED — cajas SEPARADAS (G513R)
───────────────────────────────────────────
En Locally Uncensored el Positive y el Negative son DOS campos.
NO pegues ambos en la misma caja. NO incluyas las etiquetas ni las marcas <<< >>>.
ComfyUI / A1111: mismo criterio (positive vs negative separados).

Checkpoint (selector de LU, no va en el prompt):
• PPV / explícito (default): ${split.checkpointHint}
• SFW / body / beauty: ${split.sfwCheckpoint}
• VRAM justa (SD1.5 fp16): ${split.lowVramCheckpoint}
• Lustify zenith: ${split.nsfwOptInCheckpoint} — NSFW opt-in, NUNCA default
${trigger ? `LoRA trigger (va DENTRO del Positive, no en Negative): ${trigger}\n` : ''}
▼ CAJA NEGATIVE (la misma para A, B y C)
Copia SOLO el texto entre las marcas → pégalo en Negative de LU.

<<<LU_NEGATIVE
${split.negative}
LU_NEGATIVE>>>
${shotBlocks}`;
  }

  function isMeaningfulMarks(v) {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false;
    return !/^(ninguno|ninguna|n\/a|na|sin marcas|sin marcas distintivas|sin marcas distintivas visibles|none)$/i.test(s);
  }

  function formatLockSummary(must, name) {
    const marks = isMeaningfulMarks(must.distinctive_marks) ? must.distinctive_marks : '—';
    const asym = must.facial_asymmetry || '—';
    return `RESUMEN FIJO:
• ${must.name || name} · ${must.age || ''} · ${must.gender || ''} · ${must.ethnicity || ''}
• Cara: ${must.face_shape || '—'} | ojos ${must.eye_color || '—'} | ${must.eyebrows || ''}
• Asimetría (fija): ${asym}
• Marcas (siempre visibles): ${marks}
• Piel: ${must.skin_tone || '—'}${must.skin_tone_hex ? ' ' + must.skin_tone_hex : ''} (NO cambiar)
• Cabello: ${must.hair_color || ''} · ${must.hair_texture || ''} · ${must.hair_length || ''}
• Cuerpo: ${must.body_type || ''} · ${must.height || ''} · ${must.proportions || ''}`;
  }

  function formatRealismNegativeSections() {
    return `───────────────────────────────────────────
REALISMO (imperfecciones — Layer 5)
───────────────────────────────────────────
${REALISM_ANCHORS_ES}

${REALISM_ANCHORS_BLOCK}

───────────────────────────────────────────
NEGATIVE PROMPT (si el modelo lo acepta)
───────────────────────────────────────────
${STANDARD_NEGATIVE_PROMPT}`;
  }

  function synthesizeCharacterLock(json, fallbackName) {
    const id = json.identity || {};
    const face = json.facial_features || {};
    const hair = json.hair || {};
    const body = json.body || {};
    const name = id.name || fallbackName || 'Influencer';
    const marks = face.distinctive_marks || null;
    const asymmetry = face.facial_asymmetry || null;
    const marksHint = isMeaningfulMarks(marks) ? ` Marcas fijas: ${marks}.` : '';
    const asymHint = asymmetry ? ` Asimetría fija: ${asymmetry}.` : '';
    return {
      version: 1,
      free_tier: true,
      purpose: 'Mantener la misma persona en chatbots gratuitos sin face-lock de pago',
      free_chatbot_system: `Sos ${name}. Misma cara, tez y pelo en todas las imágenes.${asymHint}${marksHint} No simetrices ni «arregles» el rostro.`,
      must_match_every_image: {
        name,
        gender: id.gender || null,
        age: id.apparent_age || id.age || null,
        ethnicity: id.ethnicity_appearance || id.ethnicity || null,
        skin_tone: face.skin_tone || null,
        skin_tone_hex: face.skin_tone_hex || null,
        face_shape: face.face_shape || null,
        eye_color: face.eye_color || null,
        eyebrows: face.eyebrow_style || face.eyebrows || null,
        lips: face.lip_shape || face.lips || null,
        jawline: face.jawline || null,
        facial_asymmetry: asymmetry,
        distinctive_marks: marks,
        hair_color: hair.color || null,
        hair_texture: hair.texture || null,
        hair_length: hair.length || null,
        body_type: body.body_type || id.body_type || null,
        height: body.height_appearance || body.height || null,
        proportions: body.proportions || null
      },
      may_vary_per_image: ['pose', 'clothing', 'setting_background', 'product_in_hand'],
      never_do: [
        'Cambiar tono de piel o etnia aparente',
        'Cambiar forma de rostro',
        'Borrar o mover asimetría / marcas distintivas',
        'Simetrizar o embellecer el rostro',
        'Cuerpo con proporciones distintas'
      ]
    };
  }

  /**
   * @param {object} personaOrJson — fila persona o detailedJSON
   * @param {{ fallbackName?: string }} [opts]
   * @returns {object} JSON de personaje con character_lock usable + schema_id influ-persona/v1
   */
  function normalizePersonaForPack(personaOrJson, opts = {}) {
    // Corte D: preferir contrato portable si el módulo está disponible (Node / UMD).
    try {
      let InfluPersona = null;
      if (typeof require === 'function') {
        try { InfluPersona = require('./influ-persona'); } catch (_) {}
      }
      if (!InfluPersona && typeof globalThis !== 'undefined') {
        InfluPersona = globalThis.InfluPersona || null;
      }
      if (InfluPersona && typeof InfluPersona.migrate === 'function') {
        return InfluPersona.migrate(personaOrJson, opts);
      }
    } catch (_) { /* fall through legacy */ }

    let raw = personaOrJson && typeof personaOrJson === 'object' ? { ...personaOrJson } : {};
    const fallbackName = opts.fallbackName || raw.name || null;

    const nested = parseMaybeJson(raw.detailedJSON);
    if (nested && typeof nested === 'object'
      && (nested.character_lock || nested.identity || nested.facial_features)) {
      raw = {
        ...nested,
        identity: {
          ...(nested.identity || {}),
          name: (nested.identity && nested.identity.name) || fallbackName
        }
      };
      if (fallbackName && raw.identity && !raw.identity.name) {
        raw.identity.name = fallbackName;
      }
    }

    const json = { ...raw };
    delete json.detailedJSON;
    const lock = json.character_lock;
    const must = lock && typeof lock === 'object' ? lock.must_match_every_image : null;
    const mustEmpty = !lock || typeof lock !== 'object'
      || !must
      || (typeof must === 'object' && !Object.keys(must).length);
    if (mustEmpty) {
      json.character_lock = synthesizeCharacterLock(json, fallbackName);
    }
    json.schema_id = json.schema_id || 'influ-persona/v1';
    return json;
  }

  /**
   * @param {object} personaJSON
   * @param {string} packId
   * @param {{ productData?: object, extraScene?: string, fallbackName?: string, cameraId?: string, shotTypeId?: string }} [opts]
   */
  function buildFreeChatbotPack(personaJSON, packId, opts = {}) {
    const pack = FREE_CHATBOT_PACKS[packId];
    if (!pack) throw new Error('Pack desconocido: ' + packId);
    const json = normalizePersonaForPack(personaJSON, opts);
    const lock = json.character_lock || {};
    const must = lock.must_match_every_image || {};
    const name = must.name || json.identity?.name || opts.fallbackName || 'Influencer';

    let productBlock = '';
    const prod = opts.productData;
    if (packId === 'product' && prod) {
      productBlock = `
PRODUCTO A MOSTRAR:
• Nombre: ${prod.name || 'Producto'}
• Beneficio: ${prod.benefit || '—'}
• Audiencia: ${prod.audience || '—'}
`;
    }

    let shotExtras = '';
    let cameraLabel = '';
    let shotLabel = '';
    try {
      const composer =
        (typeof InfluUgcShotComposer !== 'undefined' && InfluUgcShotComposer) ||
        (typeof require === 'function' ? require('./ugc-shot-composer') : null);
      if (composer && (opts.cameraId || opts.shotTypeId)) {
        const composed = composer.composeShotExtras({
          cameraId: opts.cameraId || null,
          shotTypeId: opts.shotTypeId || null
        });
        if (composed.extraScene) shotExtras = `\n${composed.extraScene}\n`;
        if (composed.camera) cameraLabel = composed.camera.label;
        if (composed.shot) shotLabel = composed.shot.label;
      }
    } catch (_) { /* composer optional */ }

    const extra = opts.extraScene ? `\nDetalle extra del usuario: ${opts.extraScene}\n` : '';
    const shotMeta = (cameraLabel || shotLabel)
      ? `\nCámara/formato: ${[shotLabel, cameraLabel].filter(Boolean).join(' · ')}\n`
      : '';
    const triggerToken = String(opts.triggerToken || '').trim();
    const flatBlock = packId === 'explicit'
      ? `\n${formatFlatComfySection(must, name, { triggerToken, checkpointHint: 'juggernautXL_ragnarok.safetensors' })}\n`
      : '';

    return `═══════════════════════════════════════════
PACK GRATIS PARA CHATBOT — ${pack.label}
Influencer: ${name}
Cero costo: sin Replicate / InstantID / GPU de pago${shotMeta}═══════════════════════════════════════════

${lock.free_chatbot_system || 'Mantén la misma persona del JSON en todas las imágenes.'}

───────────────────────────────────────────
CHARACTER LOCK (obligatorio)
───────────────────────────────────────────
${JSON.stringify(lock, null, 2)}

${formatLockSummary(must, name)}

───────────────────────────────────────────
PETICIÓN DE ESTA IMAGEN
───────────────────────────────────────────
${pack.sceneInstruction}
${productBlock}${shotExtras}${extra}${flatBlock}
${formatRealismNegativeSections()}

───────────────────────────────────────────
JSON COMPLETO (referencia)
───────────────────────────────────────────
${JSON.stringify(json, null, 2)}

───────────────────────────────────────────
AL FINAL
───────────────────────────────────────────
1) Genera la imagen respetando el CHARACTER LOCK (asimetría + marcas incluidas).
2) Aplica el bloque REALISMO; si el modelo acepta negativo, úsalo.
3) Si hay CAMERA / SHOT TYPE, respétalos (Layer 4 / escenario) sin renegociar la cara.
4) Si la cara, tez o marcas cambian, re-pega el lock y regenera.
5) Responde en español con una línea: "OK — pack ${pack.id} para ${name}".
`;
  }

  /**
   * W11 — Bloque único para validar identity en chatbot free (3 prompts).
   * @param {object} personaJSON
   * @param {{ productData?: object, fallbackName?: string, nicheLabel?: string }} [opts]
   */
  function buildChatbotSessionCheck(personaJSON, opts = {}) {
    const json = normalizePersonaForPack(personaJSON, opts);
    const lock = json.character_lock || {};
    const must = lock.must_match_every_image || {};
    const name = must.name || json.identity?.name || opts.fallbackName || 'Influencer';
    const niche = lock.niche || opts.nicheLabel || '';
    const compactLock = {
      version: lock.version || 1,
      free_tier: true,
      niche: niche || undefined,
      must_match_every_image: must,
      may_vary_per_image: lock.may_vary_per_image || ['pose', 'outfit', 'setting', 'lighting'],
      free_chatbot_system: lock.free_chatbot_system || 'Mantén la misma persona del JSON en todas las imágenes.'
    };

    let productHint = 'un frasco/caja genérica de beauty';
    const prod = opts.productData;
    if (prod && (prod.name || prod.benefit)) {
      productHint = `${prod.name || 'Producto'}${prod.benefit ? ` (${prod.benefit})` : ''}`;
    }

    const promptA = `PROMPT A — RETRATO ANCLA
Genera UNA imagen UGC selfie / primer plano de rostro:
• MISMA cara, ojos, cejas y tez del CHARACTER LOCK
• Encaje de cabeza y hombros; luz natural de ventana
• Cabello según el lock (${must.hair_color || 'color'} · ${must.hair_length || 'largo'})
• Estilo foto de celular amateur, no beauty CGI
• NO cambiar identidad`;

    const promptB = `PROMPT B — CUERPO ENTERO
${FREE_CHATBOT_PACKS.fullbody.sceneInstruction}`;

    const promptC = `PROMPT C — PRODUCTO / NICHO${niche ? ` (${niche})` : ''}
Genera UNA imagen UGC del influencer mostrando producto:
• Sostiene ${productHint} cerca de la cámara (mano visible)
• Rostro reconocible según CHARACTER LOCK (misma cara y tez)
• Plano medio o selfie con producto
• Fondo interior simple; luz de ventana
• Estilo review TikTok/Reels — no anuncio de TV`;

    return `═══════════════════════════════════════════
SESIÓN DE PRUEBA — 3 PROMPTS (cero costo)
Influencer: ${name}
Pega TODO este bloque en ChatGPT / Gemini / Claude / Meta (gratis).
Objetivo: comprobar si el character_lock ancla cara + tez + pelo + asimetría/marcas.
═══════════════════════════════════════════

${compactLock.free_chatbot_system}

───────────────────────────────────────────
CHARACTER LOCK (compacto — obligatorio)
───────────────────────────────────────────
${JSON.stringify(compactLock, null, 2)}

${formatLockSummary(must, name)}

${formatRealismNegativeSections()}

───────────────────────────────────────────
CÓMO USAR
───────────────────────────────────────────
1) Genera PROMPT A, luego B, luego C (una imagen cada uno).
2) No reescribas el CHARACTER LOCK entre prompts.
3) Conserva asimetría y marcas en las 3 tomas.
4) Vuelve al Studio y marca el checklist: ¿misma cara? ¿misma tez? ¿mismo pelo?

───────────────────────────────────────────
${promptA}

───────────────────────────────────────────
${promptB}

───────────────────────────────────────────
${promptC}

───────────────────────────────────────────
AL FINAL
───────────────────────────────────────────
Responde en español: "OK — sesión 3 prompts para ${name}".
Si cara/tez/pelo/marcas cambian entre A/B/C, dilo explícitamente.
`;
  }

  const SESSION_CHECK_KEYS = ['face', 'skin', 'hair'];

  function emptySessionChecklist() {
    return { face: null, skin: null, hair: null, updatedAt: null };
  }

  /** @returns {boolean} true si las 3 marcas son true */
  function isSessionChecklistPassing(checklist) {
    if (!checklist || typeof checklist !== 'object') return false;
    return SESSION_CHECK_KEYS.every((k) => checklist[k] === true);
  }

  function listPackIds() {
    return Object.keys(FREE_CHATBOT_PACKS);
  }

  /** Packs SFW del happy path (sin PPV). El job router y Copiar JSON default usan estos. */
  function listSfwPackIds() {
    return SFW_PACK_IDS.slice();
  }

  /**
   * W13 — Edad relativa de una copia ("hace 12s", "hace 3m").
   * @param {string|number|Date|null} copiedAt
   * @param {number} [nowMs]
   */
  function formatRelativeCopyAge(copiedAt, nowMs = Date.now()) {
    if (copiedAt == null || copiedAt === '') return null;
    const t = typeof copiedAt === 'number' ? copiedAt : Date.parse(copiedAt);
    if (!Number.isFinite(t)) return null;
    const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
    if (sec < 60) return `hace ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `hace ${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `hace ${hr}h`;
    const days = Math.floor(hr / 24);
    return `hace ${days}d`;
  }

  /** @returns {string|null} etiqueta corta del pack o null */
  function packLabel(packId) {
    const p = FREE_CHATBOT_PACKS[packId];
    return p ? p.label : null;
  }

  return {
    FREE_CHATBOT_PACKS,
    normalizePersonaForPack,
    synthesizeCharacterLock,
    buildFreeChatbotPack,
    buildChatbotSessionCheck,
    SESSION_CHECK_KEYS,
    emptySessionChecklist,
    isSessionChecklistPassing,
    listPackIds,
    listSfwPackIds,
    formatRelativeCopyAge,
    packLabel,
    REALISM_ANCHORS_BLOCK,
    REALISM_ANCHORS_ES,
    STANDARD_NEGATIVE_PROMPT,
    FLAT_COMFY_NEGATIVE,
    LU_SHOTS,
    lockTraitsCsv,
    buildFlatComfyPrompt,
    buildLuSplitPrompts,
    formatFlatComfySection,
    isMeaningfulMarks
  };
});
