/**
 * Face pack canónico (ugc-creator Tier 1) — 4–6 retratos de referencia
 * derivados del character_lock. El pack es salida del card; si el lock cambia,
 * regenerar (no parchear a mano).
 *
 * Path free: buildFacePackChatbotText() siempre (cero API).
 * Path opt-in: specs para Pollinations vía triggerBackgroundVariants.
 *
 * UMD: Node (tests / routes) y navegador (app.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluFacePack = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Canonical slots. `legacyTypes` map older anchor_pack metadata ids.
   */
  const FACE_PACK_SLOTS = [
    {
      id: 'front',
      legacyTypes: ['front_portrait'],
      title: 'Frontal',
      short: 'Mirada a cámara, expresión neutra',
      pose: 'Frontal portrait, looking directly at camera, neutral relaxed expression, head and shoulders',
      attitude: 'Neutral, natural, at rest',
      setting: 'Simple studio or plain soft background, even light',
      framing: 'portrait',
      clothing: 'Simple casual top, no busy patterns'
    },
    {
      id: 'three_quarter_l',
      legacyTypes: [],
      title: '¾ izquierda',
      short: 'Tres cuartos, suave sonrisa',
      pose: 'Three-quarter view turned slightly to camera-left (~45°), soft smile, face fully visible',
      attitude: 'Soft smile, approachable',
      setting: 'Simple studio or plain soft background',
      framing: 'portrait',
      clothing: 'Simple casual top'
    },
    {
      id: 'three_quarter_r',
      legacyTypes: ['profile_45'],
      title: '¾ derecha',
      short: 'Tres cuartos, neutra',
      pose: 'Three-quarter view turned slightly to camera-right (~45°), neutral expression, face fully visible',
      attitude: 'Neutral soft gaze',
      setting: 'Simple studio or plain soft background',
      framing: 'portrait',
      clothing: 'Simple casual top'
    },
    {
      id: 'profile',
      legacyTypes: [],
      title: 'Perfil',
      short: 'Perfil ~90°, pelo recogido si hace falta',
      pose: 'True side profile (~90°), hair tucked behind ear if needed so jaw and nose silhouette are clear',
      attitude: 'Calm, still',
      setting: 'Simple studio, clean silhouette light',
      framing: 'portrait',
      clothing: 'Simple casual top'
    },
    {
      id: 'laughing',
      legacyTypes: ['expression_wink'],
      title: 'Risa candid',
      short: 'Risa espontánea, ojos entrecerrados',
      pose: 'Candid laughing expression, eyes half closed, natural joy, medium close on face',
      attitude: 'Genuine laugh, candid',
      setting: 'Soft natural window light',
      framing: 'medium',
      clothing: 'Simple casual top'
    },
    {
      id: 'fullbody',
      legacyTypes: ['fullbody_studio'],
      title: 'Cuerpo entero',
      short: 'De pie, proporciones',
      pose: 'FULL BODY standing, head-to-toe visible, natural posture, feet and head in frame with margin',
      attitude: 'Relaxed upright posture',
      setting: 'Simple studio backdrop, even light, space around feet and head',
      framing: 'fullbody',
      clothing: 'Full casual outfit that fits the body type'
    }
  ];

  function listSlotIds() {
    return FACE_PACK_SLOTS.map((s) => s.id);
  }

  function getSlot(id) {
    return FACE_PACK_SLOTS.find((s) => s.id === id) || null;
  }

  function resolveSlotIdFromLegacy(anchorType) {
    if (!anchorType) return null;
    const direct = getSlot(anchorType);
    if (direct) return direct.id;
    for (const s of FACE_PACK_SLOTS) {
      if (s.legacyTypes.includes(anchorType)) return s.id;
    }
    return null;
  }

  function parseMaybeJson(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return null; }
    }
    return null;
  }

  /** Accept persona row or expanded detailedJSON. */
  function normalizePersonaJson(personaOrJson) {
    let raw = personaOrJson && typeof personaOrJson === 'object' ? { ...personaOrJson } : {};
    const nested = parseMaybeJson(raw.detailedJSON);
    if (nested && typeof nested === 'object'
      && (nested.character_lock || nested.identity || nested.facial_features)) {
      raw = {
        ...nested,
        identity: {
          ...(nested.identity || {}),
          name: (nested.identity && nested.identity.name) || raw.name
        }
      };
    }
    delete raw.detailedJSON;
    return raw;
  }

  function mustMatchBlock(json) {
    const lock = json.character_lock || {};
    return lock.must_match_every_image || {};
  }

  function lockFingerprint(json) {
    const must = mustMatchBlock(json);
    const keys = [
      'name', 'age', 'ethnicity', 'face_shape', 'eye_color', 'facial_asymmetry',
      'distinctive_marks', 'skin_tone', 'skin_tone_hex', 'hair_color', 'hair_texture',
      'hair_length', 'body_type', 'proportions'
    ];
    const slice = {};
    for (const k of keys) slice[k] = must[k] ?? null;
    return JSON.stringify(slice);
  }

  /**
   * Specs for Pollinations / genQueue (6 slots).
   * @param {object} persona — row or JSON
   */
  function buildAnchorSpecsForPersona(persona) {
    const json = normalizePersonaJson(persona);
    const must = mustMatchBlock(json);
    const clothingFallback = persona?.clothing
      || json.aesthetic?.fashion_style
      || json.clothing?.type
      || 'Simple casual outfit';

    return FACE_PACK_SLOTS.map((slot) => ({
      anchorType: slot.id,
      title: slot.title,
      pose: slot.pose,
      clothing: slot.id === 'fullbody' ? clothingFallback : (slot.clothing || clothingFallback),
      attitude: slot.attitude,
      setting: slot.setting,
      mode: 'anchor',
      framing: slot.framing,
      short: slot.short,
      // Hints for prompt builders that read skin/hair from persona row
      _lockHints: {
        name: must.name || persona?.name || json.identity?.name,
        skin_tone: must.skin_tone,
        skin_tone_hex: must.skin_tone_hex,
        facial_asymmetry: must.facial_asymmetry,
        distinctive_marks: must.distinctive_marks
      }
    }));
  }

  /**
   * Free chatbot text: lock + 6 angle briefs (Tier 0–1 without sampler latch).
   */
  function buildFacePackChatbotText(personaOrJson, opts = {}) {
    const json = normalizePersonaJson(personaOrJson);
    const lock = json.character_lock || {};
    const must = mustMatchBlock(json);
    const name = must.name || json.identity?.name || opts.fallbackName || 'Influencer';
    const fingerprint = lockFingerprint(json);

    const slotBlocks = FACE_PACK_SLOTS.map((slot, i) => {
      return `${i + 1}. ${slot.title.toUpperCase()} (${slot.id})
• ${slot.short}
• Pose: ${slot.pose}
• Actitud: ${slot.attitude}
• Encuadre: ${slot.framing}
• Fondo: ${slot.setting}
• Ropa: ${slot.clothing}
• OBLIGATORIO: misma cara/tez/asimetría/marcas del CHARACTER LOCK (no embellecer).`;
    }).join('\n\n');

    return `═══════════════════════════════════════════
FACE PACK CANÓNICO — 6 ÁNGULOS (cero costo)
Influencer: ${name}
El pack es salida del character_lock. Si el lock cambia → regenerar las 6.
Fingerprint lock: ${fingerprint.slice(0, 12)}…
═══════════════════════════════════════════

${lock.free_chatbot_system || 'Mantén la misma persona del JSON en todas las imágenes.'}

───────────────────────────────────────────
CHARACTER LOCK (byte-idéntico en las 6)
───────────────────────────────────────────
${JSON.stringify(lock, null, 2)}

RESUMEN FIJO:
• ${name} · ${must.age || ''} · ${must.ethnicity || ''}
• Asimetría: ${must.facial_asymmetry || '—'}
• Marcas: ${must.distinctive_marks || '—'}
• Piel: ${must.skin_tone || ''}${must.skin_tone_hex ? ' ' + must.skin_tone_hex : ''}
• Cabello: ${must.hair_color || ''} · ${must.hair_length || ''}

───────────────────────────────────────────
LAS 6 TOMAS (genera una imagen por bloque)
───────────────────────────────────────────
${slotBlocks}

───────────────────────────────────────────
REGLAS
───────────────────────────────────────────
1) Genera las 6 en orden; no reescribas el CHARACTER LOCK entre tomas.
2) Solo cambian ángulo / expresión / encuadre — nunca cara, tez, asimetría ni marcas.
3) Spot-check: mismo lunar, misma asimetría, misma tez entre 1 y 6.
4) Estilo: foto de celular / estudio simple — no cinematic CGI.
5) Si una toma «arregla» el rostro, re-pega el lock y regenera esa toma.
`;
  }

  /**
   * Merge API history + variants into latest image per canonical slot.
   * @param {{ history?: array, variants?: array, mainImage?: string|null }} data
   */
  function mapPackImages(data = {}) {
    const history = data.history || [];
    const bySlot = {};

    for (const h of history) {
      if (h.generation_type && h.generation_type !== 'anchor_pack') continue;
      let meta = {};
      try {
        meta = typeof h.metadata === 'string' ? JSON.parse(h.metadata) : (h.metadata || {});
      } catch (_) { meta = {}; }
      const slotId = resolveSlotIdFromLegacy(meta.anchorType) || meta.anchorType;
      if (!slotId || !getSlot(slotId)) continue;
      const prev = bySlot[slotId];
      const ts = h.created_at || h.id || 0;
      if (!prev || String(ts) >= String(prev.created_at || prev.id || 0)) {
        bySlot[slotId] = {
          slotId,
          image_path: h.image_path || null,
          title: meta.title || getSlot(slotId).title,
          anchorType: meta.anchorType || slotId,
          created_at: h.created_at || null,
          source: 'anchor_pack'
        };
      }
    }

    // Fallback: if no history, don't invent from random variants (ambiguous).
    // Only fill front from mainImage when missing.
    if (!bySlot.front && data.mainImage) {
      bySlot.front = {
        slotId: 'front',
        image_path: data.mainImage,
        title: 'Frontal',
        anchorType: 'front',
        created_at: null,
        source: 'main_image'
      };
    }

    return FACE_PACK_SLOTS.map((slot) => {
      const hit = bySlot[slot.id];
      return {
        id: slot.id,
        title: slot.title,
        short: slot.short,
        framing: slot.framing,
        image_path: hit?.image_path || null,
        source: hit?.source || null,
        created_at: hit?.created_at || null,
        filled: !!hit?.image_path
      };
    });
  }

  function summarizePack(slots) {
    const filled = (slots || []).filter((s) => s.filled).length;
    const total = FACE_PACK_SLOTS.length;
    return {
      filled,
      total,
      complete: filled >= total,
      readyForReference: filled >= 4,
      label: filled === 0 ? 'Sin bocetos' : filled >= total ? 'Pack completo' : `${filled}/${total} bocetos`
    };
  }

  return {
    FACE_PACK_SLOTS,
    listSlotIds,
    getSlot,
    resolveSlotIdFromLegacy,
    normalizePersonaJson,
    lockFingerprint,
    buildAnchorSpecsForPersona,
    buildFacePackChatbotText,
    mapPackImages,
    summarizePack
  };
});
