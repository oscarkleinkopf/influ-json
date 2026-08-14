/**
 * I4 — Plantillas comunitarias sin datos personales.
 * Solo pack / shot / cámara / guiones / reglas de realismo.
 * Nunca incluye must_match, fotos ni cara por defecto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluCommunityTemplates = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_ID = 'influ-community-template/v1';

  const REALISM_RULES_BASE = [
    'Foto de celular amateur, no beauty CGI',
    'Misma persona del character_lock en todas las tomas (cara, tez, pelo)',
    'Sin retoque de piel plástico; poros y textura naturales',
    'No cambiar etnia / tono de piel entre planos'
  ];

  /** @type {Record<string, object>} */
  const TEMPLATES = {
    beauty_skincare: {
      id: 'beauty_skincare',
      schema_id: SCHEMA_ID,
      title: 'Beauty · skincare UGC',
      niche: 'beauty',
      short: 'Espejo + producto + PAS',
      pack: { free_pack_id: 'product', notes: 'Copiar JSON product → chatbot free' },
      shot: { type: 'testimonial', camera: 'mirror', format: '9:16', duration_hint_s: 18 },
      voice: {
        tone: 'amiga que recomienda rutina',
        cta: 'Guarda este tip y pruébalo 7 días',
        formula: 'PAS'
      },
      script_hooks: [
        'Hook 0–3s: «Si tu piel se ve apagada al mediodía…»',
        'Problema: textura / deshidratación visible en selfie',
        'Agitar producto cerca de cámara (mano + etiqueta legible)',
        'CTA: rutina AM/PM en comentarios'
      ],
      realism_rules: [
        ...REALISM_RULES_BASE,
        'Luz de ventana de baño; evita flash duro',
        'Producto en mano dominante; no tapa la cara'
      ],
      brief_defaults: {
        hooksCount: 3,
        shotsCount: 2,
        wantProductPack: true,
        wantCampaign: true,
        wantLicense: false,
        wantIdentity: true,
        goal: 'ugc',
        product: 'sérum / crema (tu marca)'
      }
    },
    fitness_wellness: {
      id: 'fitness_wellness',
      schema_id: SCHEMA_ID,
      title: 'Fitness · wellness',
      niche: 'fitness',
      short: 'Rear cam candid + energía',
      pack: { free_pack_id: 'fullbody', notes: 'Cuerpo entero consistente + lock' },
      shot: { type: 'lifestyle', camera: 'rear', format: '9:16', duration_hint_s: 15 },
      voice: {
        tone: 'motivadora cercana, sin toxicidad',
        cta: 'Entrena conmigo esta semana',
        formula: 'AIDA'
      },
      script_hooks: [
        'Hook: «El truco que me sacó del abandono el lunes»',
        'Mostrar rutina corta (sin pelea de ego)',
        'Antes/después de energía (no solo físico)',
        'CTA: guarda la rutina de 10 min'
      ],
      realism_rules: [
        ...REALISM_RULES_BASE,
        'Ropa deportiva realista; sin CGI muscular',
        'Luz natural de gym/parque; handheld leve'
      ],
      brief_defaults: {
        hooksCount: 3,
        shotsCount: 3,
        wantProductPack: false,
        wantCampaign: true,
        wantLicense: false,
        wantIdentity: true,
        goal: 'awareness',
        product: 'app / challenge / suplemento (opcional)'
      }
    },
    fashion_grwm: {
      id: 'fashion_grwm',
      schema_id: SCHEMA_ID,
      title: 'Moda · GRWM / outfit',
      niche: 'moda',
      short: 'Selfie + fullbody outfit',
      pack: { free_pack_id: 'fullbody', notes: 'Outfit cambia; cara/tez/pelo fijos' },
      shot: { type: 'lifestyle', camera: 'selfie', format: '9:16', duration_hint_s: 20 },
      voice: {
        tone: 'estilo personal, sin vender agresivo',
        cta: '¿Lo usarías? Dímelo abajo',
        formula: 'Unboxing'
      },
      script_hooks: [
        'Hook: «Outfit de [ocasión] en 20 segundos»',
        'Detalle de prenda (textura / fit)',
        'Plano cuerpo entero caminando',
        'CTA: guarda el look'
      ],
      realism_rules: [
        ...REALISM_RULES_BASE,
        'may_vary: outfit / setting — never face/skin/hair',
        'Espejo o luz de ventana; sin studio fashion'
      ],
      brief_defaults: {
        hooksCount: 2,
        shotsCount: 3,
        wantProductPack: false,
        wantCampaign: true,
        wantLicense: false,
        wantIdentity: true,
        goal: 'ugc',
        product: 'prenda / marca (opcional)'
      }
    },
    food_ugc: {
      id: 'food_ugc',
      schema_id: SCHEMA_ID,
      title: 'Food · review / unboxing',
      niche: 'food',
      short: 'Overhead + reaction',
      pack: { free_pack_id: 'product', notes: 'Producto + reacción facial' },
      shot: { type: 'unboxing', camera: 'overhead', format: '9:16', duration_hint_s: 15 },
      voice: {
        tone: 'hambre honesta, humor ligero',
        cta: '¿Lo pedirías? Comenta',
        formula: 'Unboxing'
      },
      script_hooks: [
        'Hook ASMR / primer bocado en 0–2s',
        'Overhead del plato o packaging',
        'Reacción a cámara (mismo lock)',
        'CTA: tag a quien debe probarlo'
      ],
      realism_rules: [
        ...REALISM_RULES_BASE,
        'Comida real imperfecta; sin stock CGI',
        'Manos en frame OK; cara reconocible en reaction shot'
      ],
      brief_defaults: {
        hooksCount: 3,
        shotsCount: 2,
        wantProductPack: true,
        wantCampaign: true,
        wantLicense: false,
        wantIdentity: true,
        goal: 'conversion',
        product: 'plato / delivery / snack'
      }
    }
  };

  function listTemplates() {
    return Object.values(TEMPLATES).map((t) => ({
      id: t.id,
      schema_id: SCHEMA_ID,
      title: t.title,
      niche: t.niche,
      short: t.short,
      pack: t.pack?.free_pack_id || null,
      shot: t.shot?.type || null,
      camera: t.shot?.camera || null
    }));
  }

  function getTemplate(id) {
    if (!id) return null;
    return TEMPLATES[String(id)] || null;
  }

  /**
   * Rechaza payloads con identidad / must_match (plantilla comunitaria = safe share).
   */
  function validateCommunitySafe(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['JSON inválido'] };
    if (raw.schema_id && raw.schema_id !== SCHEMA_ID && raw.schema_id !== 'influ-recipe/v1') {
      errors.push(`schema_id no reconocido: ${raw.schema_id}`);
    }
    if (raw.must_match_every_image || raw.character_lock?.must_match_every_image) {
      errors.push('No se permiten must_match en plantillas comunitarias');
    }
    if (raw.identity_opt_in) {
      errors.push('Quita identity_opt_in antes de compartir');
    }
    if (raw.photos || raw.images || raw.reference_images) {
      errors.push('No se permiten fotos / referencias');
    }
    const blob = JSON.stringify(raw);
    if (/data:image\//i.test(blob)) {
      errors.push('No se permiten data URLs de imagen');
    }
    return { ok: errors.length === 0, errors };
  }

  function stripIdentity(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const clone = JSON.parse(JSON.stringify(raw));
    delete clone.must_match_every_image;
    delete clone.identity_opt_in;
    delete clone.photos;
    delete clone.images;
    delete clone.reference_images;
    delete clone.character_lock;
    delete clone.persona_ref;
    return clone;
  }

  function toClipboardText(template) {
    const safe = stripIdentity(template);
    const check = validateCommunitySafe(safe);
    if (!check.ok) throw new Error(check.errors.join('; '));
    return JSON.stringify(safe, null, 2);
  }

  /**
   * Mapea plantilla → defaults del brief I2 + recipe-ish payload.
   */
  function toBriefDefaults(template, overrides = {}) {
    const t = typeof template === 'string' ? getTemplate(template) : template;
    if (!t) return null;
    const d = t.brief_defaults || {};
    return {
      product: overrides.product != null ? overrides.product : (d.product || ''),
      brand: overrides.brand != null ? overrides.brand : '',
      hooksCount: d.hooksCount ?? 3,
      shotsCount: d.shotsCount ?? 2,
      wantProductPack: d.wantProductPack !== false,
      wantCampaign: d.wantCampaign !== false,
      wantLicense: !!d.wantLicense,
      wantIdentity: d.wantIdentity !== false,
      goal: d.goal || 'ugc'
    };
  }

  function toRecipeInput(template, overrides = {}) {
    const t = typeof template === 'string' ? getTemplate(template) : template;
    if (!t) return null;
    return {
      title: t.title,
      niche: t.niche,
      shotType: t.shot?.type || 'testimonial',
      camera: t.shot?.camera || 'selfie',
      format: t.shot?.format || '9:16',
      durationHint: t.shot?.duration_hint_s || 15,
      tone: t.voice?.tone || null,
      cta: t.voice?.cta || null,
      packId: t.pack?.free_pack_id || 'fullbody',
      notes: t.pack?.notes || null,
      product: overrides.product ? { name: overrides.product } : null
    };
  }

  function parseImport(text) {
    let raw;
    try {
      raw = typeof text === 'string' ? JSON.parse(text) : text;
    } catch (_) {
      return { ok: false, errors: ['JSON inválido'], template: null };
    }
    // Rechazar identidad en el payload original (no silenciar must_match/fotos).
    const checkRaw = validateCommunitySafe(raw);
    if (!checkRaw.ok) return { ok: false, errors: checkRaw.errors, template: null };
    const stripped = stripIdentity(raw);
    const check = validateCommunitySafe(stripped);
    if (!check.ok) return { ok: false, errors: check.errors, template: null };
    // Normalize minimal fields
    const template = {
      id: stripped.id || `imported_${Date.now()}`,
      schema_id: SCHEMA_ID,
      title: stripped.title || 'Plantilla importada',
      niche: stripped.niche || null,
      short: stripped.short || '',
      pack: stripped.pack || { free_pack_id: 'fullbody' },
      shot: stripped.shot || { type: 'testimonial', camera: 'selfie', format: '9:16' },
      voice: stripped.voice || {},
      script_hooks: Array.isArray(stripped.script_hooks) ? stripped.script_hooks : [],
      realism_rules: Array.isArray(stripped.realism_rules) ? stripped.realism_rules : [...REALISM_RULES_BASE],
      brief_defaults: stripped.brief_defaults || toBriefDefaults(stripped) || {}
    };
    return { ok: true, errors: [], template };
  }

  return {
    SCHEMA_ID,
    TEMPLATES,
    REALISM_RULES_BASE,
    listTemplates,
    getTemplate,
    validateCommunitySafe,
    stripIdentity,
    toClipboardText,
    toBriefDefaults,
    toRecipeInput,
    parseImport
  };
});
