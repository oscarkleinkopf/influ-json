/**
 * influ-persona/v1 — contrato portable (Corte D).
 * normalize → migrate → validate → canonicalize.
 * Sin dependencia JSON-Schema runtime: valida el contrato mínimo en español.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPersona = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_ID = 'influ-persona/v1';
  const LOCK_VERSION = 1;

  function parseMaybeJson(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function isBlank(v) {
    return v === undefined || v === null || (typeof v === 'string' && !String(v).trim());
  }

  function appCreatedWith() {
    try {
      if (typeof require === 'function') {
        const pkg = require('./package.json');
        return `${pkg.name || 'influ-json'}@${pkg.version || '0.0.0'}`;
      }
    } catch (_) {}
    return 'influ-json';
  }

  /**
   * Acepta fila SQLite, detailedJSON string, o JSON de personaje.
   * Conserva claves desconocidas.
   */
  function normalize(personaOrJson, opts = {}) {
    let raw = personaOrJson && typeof personaOrJson === 'object' ? { ...personaOrJson } : {};
    const fallbackName = opts.fallbackName || raw.name || null;

    const nested = parseMaybeJson(raw.detailedJSON);
    if (
      nested &&
      typeof nested === 'object' &&
      (nested.character_lock || nested.identity || nested.facial_features)
    ) {
      raw = {
        ...nested,
        identity: {
          ...(nested.identity || {}),
          name: (nested.identity && nested.identity.name) || fallbackName
        }
      };
    }

    const json = { ...raw };
    delete json.detailedJSON;

    if (!json.identity || typeof json.identity !== 'object') json.identity = {};
    if (fallbackName && isBlank(json.identity.name)) json.identity.name = fallbackName;

    if (!json.facial_features || typeof json.facial_features !== 'object') {
      json.facial_features = json.facial_features || {};
    }
    if (!json.hair || typeof json.hair !== 'object') json.hair = json.hair || {};
    if (!json.body || typeof json.body !== 'object') json.body = json.body || {};

    // Siempre stamp schema (migrate rellena lock)
    json.schema_id = SCHEMA_ID;
    if (isBlank(json.created_with)) {
      json.created_with = opts.createdWith || appCreatedWith();
    }

    return json;
  }

  function synthesizeMust(json, fallbackName) {
    const id = json.identity || {};
    const face = json.facial_features || {};
    const hair = json.hair || {};
    const body = json.body || {};
    const name = id.name || fallbackName || 'Influencer';
    return {
      name,
      gender: id.gender || null,
      age: id.apparent_age || id.age || null,
      ethnicity: id.ethnicity_appearance || id.ethnicity || null,
      face_shape: face.face_shape || null,
      eye_color: face.eye_color || null,
      eyebrows: face.eyebrow_style || null,
      skin_tone: face.skin_tone || null,
      skin_tone_hex: face.skin_tone_hex || null,
      hair_color: hair.color || null,
      hair_texture: hair.texture || null,
      hair_length: hair.length || null,
      body_type: body.body_type || id.body_type || null,
      height: body.height_appearance || null,
      proportions: body.proportions || null,
      facial_asymmetry: face.facial_asymmetry || null,
      distinctive_marks: face.distinctive_marks || null
    };
  }

  /**
   * Migración explícita a v1: rellena lock mínimo; no borra extensiones.
   */
  function migrate(personaJson, opts = {}) {
    const json = normalize(personaJson, opts);
    const name = json.identity?.name || opts.fallbackName || 'Influencer';

    if (!json.character_lock || typeof json.character_lock !== 'object') {
      json.character_lock = {};
    }
    const lock = json.character_lock;
    lock.version = LOCK_VERSION;
    if (lock.free_tier == null) lock.free_tier = true;
    if (isBlank(lock.purpose)) {
      lock.purpose = 'Mantener la misma persona en chatbots gratuitos sin face-lock de pago';
    }

    const must = lock.must_match_every_image && typeof lock.must_match_every_image === 'object'
      ? { ...lock.must_match_every_image }
      : {};
    const synth = synthesizeMust(json, name);
    for (const [k, v] of Object.entries(synth)) {
      if (isBlank(must[k]) && !isBlank(v)) must[k] = v;
    }
    if (isBlank(must.name)) must.name = name;
    lock.must_match_every_image = must;

    if (isBlank(lock.free_chatbot_system)) {
      const marks = must.distinctive_marks ? ` Marcas fijas: ${must.distinctive_marks}.` : '';
      const asym = must.facial_asymmetry ? ` Asimetría fija: ${must.facial_asymmetry}.` : '';
      lock.free_chatbot_system =
        `Sos ${must.name}. Misma cara, tez y pelo en todas las imágenes.${asym}${marks} No simetrices ni «arregles» el rostro.`;
    }

    if (!Array.isArray(lock.never_change) || lock.never_change.length === 0) {
      lock.never_change = [
        'Cambiar identidad / nombre',
        'Cambiar color de ojos',
        'Cambiar color o textura de cabello',
        'Cambiar tono de piel o etnia aparente',
        'Cambiar forma de rostro',
        'Borrar o mover asimetría / marcas distintivas',
        'Simetrizar o embellecer el rostro',
        'Cuerpo con proporciones distintas'
      ];
    }

    json.schema_id = SCHEMA_ID;
    json.character_lock = lock;

    // Proveniencia: marcar rasgos sintetizados si faltaba el lock
    if (!json.trait_provenance || typeof json.trait_provenance !== 'object') {
      json.trait_provenance = {};
    }
    if (!json.trait_provenance['character_lock.must_match_every_image']) {
      json.trait_provenance['character_lock.must_match_every_image'] = 'synthesized';
    }

    return json;
  }

  function fieldError(field, message) {
    return { field, message };
  }

  /**
   * Valida contrato mínimo v1. Errores en español por campo.
   * @returns {{ ok: boolean, errors: Array<{field,message}>, warnings: Array<{field,message}> }}
   */
  function validate(personaJson) {
    const errors = [];
    const warnings = [];
    const json = personaJson && typeof personaJson === 'object' ? personaJson : {};

    if (json.schema_id && json.schema_id !== SCHEMA_ID) {
      errors.push(fieldError('schema_id', `Se esperaba «${SCHEMA_ID}», llegó «${json.schema_id}».`));
    }
    if (!json.schema_id) {
      warnings.push(fieldError('schema_id', 'Falta schema_id — se añadirá al normalizar/migrar.'));
    }

    const name = json.identity?.name;
    if (isBlank(name)) {
      errors.push(fieldError('identity.name', 'El nombre es obligatorio para anclar la identidad.'));
    }

    const lock = json.character_lock;
    if (!lock || typeof lock !== 'object') {
      errors.push(fieldError('character_lock', 'Falta el bloque character_lock.'));
      return { ok: false, errors, warnings };
    }
    if (Number(lock.version) !== LOCK_VERSION) {
      errors.push(
        fieldError(
          'character_lock.version',
          `Se requiere character_lock.version = ${LOCK_VERSION}.`
        )
      );
    }

    const must = lock.must_match_every_image || {};
    const requiredMust = [
      ['name', 'must_match_every_image.name'],
      ['skin_tone', 'must_match_every_image.skin_tone'],
      ['eye_color', 'must_match_every_image.eye_color'],
      ['hair_color', 'must_match_every_image.hair_color']
    ];
    for (const [key, field] of requiredMust) {
      if (isBlank(must[key])) {
        errors.push(fieldError(field, `Falta «${key}» en must_match_every_image (ancla visual).`));
      }
    }
    if (isBlank(must.hair_texture) && isBlank(must.hair_length)) {
      warnings.push(
        fieldError(
          'must_match_every_image.hair',
          'Conviene fijar textura o largo de cabello para más consistencia.'
        )
      );
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Forma canónica comparable entre instalaciones (subset estable + lock).
   */
  function canonicalize(personaJson, opts = {}) {
    const migrated = migrate(personaJson, opts);
    const must = migrated.character_lock.must_match_every_image || {};
    return {
      schema_id: SCHEMA_ID,
      created_with: migrated.created_with || null,
      identity: {
        name: String(migrated.identity?.name || '').trim()
      },
      character_lock: {
        version: LOCK_VERSION,
        must_match_every_image: {
          name: String(must.name || '').trim(),
          skin_tone: String(must.skin_tone || '').trim(),
          skin_tone_hex: must.skin_tone_hex || null,
          eye_color: String(must.eye_color || '').trim(),
          hair_color: String(must.hair_color || '').trim(),
          hair_texture: must.hair_texture || null,
          hair_length: must.hair_length || null
        }
      }
    };
  }

  /**
   * Import: normalize → migrate → validate.
   * @returns {{ ok: boolean, persona: object, errors: Array, warnings: Array }}
   */
  function importPersona(input, opts = {}) {
    const persona = migrate(input, opts);
    const result = validate(persona);
    return {
      ok: result.ok,
      persona,
      errors: result.errors,
      warnings: result.warnings,
      canonical: canonicalize(persona, opts)
    };
  }

  return {
    SCHEMA_ID,
    LOCK_VERSION,
    normalize,
    migrate,
    validate,
    canonicalize,
    importPersona,
    appCreatedWith
  };
});
