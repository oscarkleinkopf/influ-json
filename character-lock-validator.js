/**
 * F1 — Character lock validator (local, cero costo).
 *
 * Puntúa qué tan bien un JSON de persona ancla la identidad ANTES de copiarlo
 * a un chatbot gratuito (ChatGPT / Gemini / Claude / Meta). No llama a ninguna
 * API: es un lint puro sobre el mismo JSON que se exporta.
 *
 * Módulo compartido:
 *   - Navegador: global `CharacterLockValidator` (cargar antes que app.js)
 *   - Node: `require('./character-lock-validator')` para tests (node --test)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CharacterLockValidator = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const GENERIC_NAMES = new Set([
    'influencer', 'nuevo influencer', 'sin nombre', 'untitled', 'persona', 'new influencer'
  ]);
  // Etiquetas que resolveSkinForPrompt ya trata como débiles en la generación
  const WEAK_SKIN_TONES = /^(tono natural|natural|tono medio|medium|normal)$/i;

  function isEmpty(v) {
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  }

  function isValidHex(v) {
    return typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.trim());
  }

  function hexBrightness(v) {
    if (!isValidHex(v)) return null;
    const m = v.trim().replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return (r + g + b) / 3;
  }

  function issue(level, field, message, hint) {
    return { level, field, message, hint: hint || null };
  }

  /**
   * Valida el JSON completo de persona (salida de getFullPersonaJSON o JSON importado).
   *
   * @param {object} personaJSON
   * @returns {{
   *   score: number,                       // 0–100
   *   grade: 'solid'|'ok'|'weak',
   *   gradeLabel: string,                  // 'Sólido' | 'Aceptable' | 'Débil'
   *   errors: Array<{level,field,message,hint}>,   // el lock no ancla sin esto
   *   warnings: Array<{level,field,message,hint}>, // degradan consistencia visible
   *   infos: Array<{level,field,message,hint}>,    // mejoras opcionales
   *   summary: string
   * }}
   */
  function validateCharacterLock(personaJSON) {
    const errors = [];
    const warnings = [];
    const infos = [];

    const json = (personaJSON && typeof personaJSON === 'object' && !Array.isArray(personaJSON)) ? personaJSON : {};
    const identity = json.identity || {};
    const face = json.facial_features || {};
    const hair = json.hair || {};
    const body = json.body || {};
    const personality = json.personality || {};
    const lock = (json.character_lock && typeof json.character_lock === 'object') ? json.character_lock : null;
    const must = (lock && lock.must_match_every_image) || {};

    // ── Errores: sin esto el lock no ancla identidad ──────────────────
    if (!lock) {
      errors.push(issue('error', 'character_lock',
        'El JSON no incluye bloque character_lock — un chatbot free se queda sin ancla de identidad.',
        'Regenera el JSON desde el formulario'));
    }
    if (isEmpty(identity.name) || GENERIC_NAMES.has(String(identity.name).trim().toLowerCase())) {
      errors.push(issue('error', 'identity.name',
        'Sin nombre propio el chatbot no puede mantener la misma persona entre prompts.',
        'Formulario → Nombre'));
    }
    if (isEmpty(identity.apparent_age) && isEmpty(json.age)) {
      errors.push(issue('error', 'identity.apparent_age',
        'Falta la edad aparente — el rostro puede rejuvenecer o envejecer entre imágenes.',
        'Formulario → Edad'));
    }

    // ── Tez: regresión histórica P0 (Latina clara → morena) ───────────
    const skinTone = String(face.skin_tone || must.skin_tone || '').trim();
    const skinHex = face.skin_tone_hex || must.skin_tone_hex || '';
    if (isEmpty(skinTone)) {
      warnings.push(issue('warning', 'facial_features.skin_tone',
        'Falta el tono de piel — cada generador inventará una tez distinta.',
        'Formulario → Tono de piel'));
    } else if (WEAK_SKIN_TONES.test(skinTone)) {
      warnings.push(issue('warning', 'facial_features.skin_tone',
        `«${skinTone}» es una etiqueta débil: los generadores la interpretan distinto. Mejor una tez concreta (clara, trigueña, morena…).`,
        'Formulario → Tono de piel'));
    }
    if (isEmpty(String(skinHex))) {
      warnings.push(issue('warning', 'facial_features.skin_tone_hex',
        'Sin hex exacto de tez la piel puede aclarar u oscurecer entre imágenes (bikini/spicy son las más sensibles).',
        'Importa con foto o define skin_tone_hex en el JSON'));
    } else if (!isValidHex(skinHex)) {
      warnings.push(issue('warning', 'facial_features.skin_tone_hex',
        `El hex de tez «${skinHex}» no es un color válido (#RRGGBB).`,
        'Corrige skin_tone_hex en el JSON'));
    }
    // Anti-sesgo: «Latina» a secas + tez clara → los generadores tienden a oscurecer
    const ethnicity = String(identity.ethnicity_appearance || json.ethnicity || '');
    const brightness = hexBrightness(skinHex);
    const lightSkin = (brightness !== null && brightness >= 155)
      || /clara|porcelana|fair|ivory|pálid|light/i.test(skinTone);
    if (/^latina$/i.test(ethnicity.trim()) && lightSkin && !/tez clara|clara/i.test(ethnicity)) {
      warnings.push(issue('warning', 'identity.ethnicity_appearance',
        '«Latina» a secas con tez clara: los generadores tienden a oscurecerla. Mejor «Latina de tez clara».',
        'Formulario → Etnia aparente'));
    }

    // ── Rostro ─────────────────────────────────────────────────────────
    if (isEmpty(face.face_shape) && isEmpty(must.face_shape)) {
      warnings.push(issue('warning', 'facial_features.face_shape',
        'Falta la forma de rostro — la cara puede cambiar entre prompts.',
        'Formulario → Forma de rostro'));
    }
    if (isEmpty(face.eye_color) && isEmpty(must.eye_color)) {
      warnings.push(issue('warning', 'facial_features.eye_color',
        'Falta el color de ojos — rasgo muy visible en primeros planos.',
        'Formulario → Color de ojos'));
    }
    if (isEmpty(face.eyebrow_style) && isEmpty(face.eyebrows) && isEmpty(must.eyebrows)) {
      infos.push(issue('info', 'facial_features.eyebrows',
        'Sin descripción de cejas el modelo improvisará una parte muy visible del rostro.',
        'Formulario → Cejas'));
    }
    if (isEmpty(face.lip_shape) && isEmpty(face.lips) && isEmpty(must.lips)) {
      infos.push(issue('info', 'facial_features.lips',
        'Sin descripción de labios el modelo los improvisará.',
        'Formulario → Labios'));
    }
    if (isEmpty(face.distinctive_marks) && isEmpty(must.distinctive_marks)) {
      infos.push(issue('info', 'facial_features.distinctive_marks',
        'Una marca distintiva (lunar, pecas, hoyuelos) es el ancla más fuerte que existe para un chatbot free.',
        'Formulario → Marcas distintivas'));
    }

    // ── Cabello ────────────────────────────────────────────────────────
    if (isEmpty(hair.color) && isEmpty(must.hair_color)) {
      warnings.push(issue('warning', 'hair.color',
        'Falta el color de cabello.',
        'Formulario → Color de cabello'));
    }
    if (isEmpty(hair.texture) && isEmpty(must.hair_texture)) {
      infos.push(issue('info', 'hair.texture',
        'Falta la textura del cabello (liso, ondulado, rizado).',
        'Formulario → Textura de cabello'));
    }
    if (isEmpty(hair.length) && isEmpty(must.hair_length)) {
      infos.push(issue('info', 'hair.length',
        'Falta el largo del cabello.',
        'Formulario → Largo de cabello'));
    }
    if (!isEmpty(hair.color) && isEmpty(hair.color_hex) && isEmpty(must.hair_color_hex)) {
      infos.push(issue('info', 'hair.color_hex',
        'Sin hex de cabello el tono exacto (castaño vs negro) puede variar.',
        'Define hair.color_hex en el JSON'));
    }

    // ── Cuerpo: crítico para packs fullbody / bikini / spicy ───────────
    const bodyType = body.body_type || identity.body_type || must.body_type;
    if (isEmpty(bodyType)) {
      warnings.push(issue('warning', 'body.body_type',
        'Falta el tipo de cuerpo — los packs de cuerpo entero/bikini/spicy cambiarán la silueta.',
        'Ficha → Cuerpo completo'));
    }
    if (isEmpty(body.height_appearance) && isEmpty(must.height)) {
      infos.push(issue('info', 'body.height_appearance',
        'Sin estatura aparente el cuerpo entero puede salir desproporcionado.',
        'Ficha → Cuerpo completo'));
    }
    if (isEmpty(body.proportions) && isEmpty(must.proportions)) {
      infos.push(issue('info', 'body.proportions',
        'Sin proporciones (hombros/cintura/cadera) la silueta varía entre imágenes.',
        'Ficha → Cuerpo completo'));
    }

    // ── Voz para chatbot (guiones, captions) ───────────────────────────
    if (isEmpty(personality.mbti)) {
      infos.push(issue('info', 'personality.mbti',
        'Sin MBTI el chatbot no tiene tono de voz consistente para guiones y captions.',
        'Formulario → Personalidad'));
    }

    // ── Score y grado ──────────────────────────────────────────────────
    // Verde solo si no hay nada accionable: cualquier warning ya baja a «ok».
    const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 8 - infos.length * 3);
    let grade = 'solid';
    if (errors.length > 0 || score < 60) grade = 'weak';
    else if (warnings.length > 0 || score < 85) grade = 'ok';
    const gradeLabel = grade === 'solid' ? 'Sólido' : grade === 'ok' ? 'Aceptable' : 'Débil';

    const total = errors.length + warnings.length + infos.length;
    const summary = total === 0
      ? 'Lock sólido: listo para copiar a cualquier chatbot free.'
      : `${gradeLabel} · ${errors.length} error${errors.length === 1 ? '' : 'es'}, ${warnings.length} aviso${warnings.length === 1 ? '' : 's'}, ${infos.length} sugerencia${infos.length === 1 ? '' : 's'}.`;

    return { score, grade, gradeLabel, errors, warnings, infos, summary };
  }

  return { validateCharacterLock, isValidHex, hexBrightness };
});
