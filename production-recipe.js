/**
 * Corte G / I1 — Recetas de producción portables (JSON sin imágenes ni must_match sensible por defecto).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluProductionRecipe = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_ID = 'influ-recipe/v1';

  /**
   * @param {object} input
   * @param {{ includeIdentity?: boolean }} opts — por defecto NO incluye must_match (plantilla comunitaria)
   */
  function buildRecipe(input = {}, opts = {}) {
    const includeIdentity = opts.includeIdentity === true;
    const must = input.must_match_every_image || input.character_lock?.must_match_every_image || null;
    const recipe = {
      schema_id: SCHEMA_ID,
      version: 1,
      created_at: new Date().toISOString(),
      title: String(input.title || input.name || 'Receta UGC').slice(0, 120),
      persona_ref: {
        name: input.personaName || input.name || null,
        lock_revision_id: input.lockRevisionId || null,
        niche: input.niche || null
      },
      shot: {
        type: input.shotType || 'testimonial',
        camera: input.camera || 'selfie',
        format: input.format || '9:16',
        duration_hint_s: input.durationHint || 15
      },
      product: input.product
        ? {
            name: input.product.name || null,
            benefit: input.product.benefit || null,
            category: input.product.category || null
          }
        : null,
      voice: {
        tone: input.tone || 'cálido y cercano',
        mbti: input.mbti || null,
        cta: input.cta || 'Pruébalo y cuéntame en comentarios'
      },
      pack: {
        free_pack_id: input.packId || 'fullbody',
        notes: input.notes || 'Copiar JSON → chatbot free; gen local opcional'
      }
    };
    if (includeIdentity && must && typeof must === 'object') {
      recipe.identity_opt_in = {
        warning: 'Incluye rasgos must_match — no compartir como plantilla comunitaria',
        must_match_every_image: {
          skin_tone: must.skin_tone || null,
          eye_color: must.eye_color || must.eyes || null,
          hair_color: must.hair_color || null,
          hair_texture: must.hair_texture || null,
          hair_length: must.hair_length || null
        }
      };
    }
    return recipe;
  }

  function validateRecipe(recipe) {
    const errors = [];
    if (!recipe || typeof recipe !== 'object') {
      return { ok: false, errors: ['JSON inválido'] };
    }
    if (recipe.schema_id !== SCHEMA_ID) {
      errors.push(`schema_id debe ser ${SCHEMA_ID}`);
    }
    if (!recipe.title || !String(recipe.title).trim()) {
      errors.push('title requerido');
    }
    if (!recipe.shot || typeof recipe.shot !== 'object') {
      errors.push('shot requerido');
    }
    return { ok: errors.length === 0, errors };
  }

  function toClipboardText(recipe) {
    return JSON.stringify(recipe, null, 2);
  }

  function stripIdentity(recipe) {
    if (!recipe || typeof recipe !== 'object') return recipe;
    const clone = JSON.parse(JSON.stringify(recipe));
    delete clone.identity_opt_in;
    return clone;
  }

  return {
    SCHEMA_ID,
    buildRecipe,
    validateRecipe,
    toClipboardText,
    stripIdentity
  };
});
