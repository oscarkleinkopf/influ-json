/**
 * Matriz QA de consistencia (gratis): asigna ancla / cuerpo / spicy
 * a partir de variantes e historial, sin APIs de scoring.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluQaMatrix = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SLOT_DEFS = [
    { id: 'portrait', label: 'Retrato ancla', pack: null },
    { id: 'fullbody', label: 'Cuerpo entero', pack: 'fullbody' },
    { id: 'spicy', label: 'Spicy / bikini', pack: 'spicy' }
  ];

  const CHECKS = [
    { id: 'face', label: 'Misma cara' },
    { id: 'skin', label: 'Misma tez' },
    { id: 'hair', label: 'Mismo pelo base' }
  ];

  function textBlob(item) {
    if (!item || typeof item !== 'object') return '';
    return [
      item.pose,
      item.clothing,
      item.attitude,
      item.setting,
      item.prompt,
      item.generation_type,
      item.image_path,
      item.metadata
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function scoreFullbody(item) {
    const t = textBlob(item);
    let s = 0;
    if (/full\s*body|fullbody|cuerpo entero|head-to-toe|mirror selfie|standing fashion/.test(t)) s += 3;
    if (/walking|caminando|modelando/.test(t)) s += 1;
    if (/portrait|close-up|primer plano|macro|selfie de primer/.test(t)) s -= 2;
    return s;
  }

  function scoreSpicy(item) {
    const t = textBlob(item);
    let s = 0;
    if (/spicy|bikini|lingerie|lencer|trikini|sensual|encaje|night-out/.test(t)) s += 3;
    if (/playa|beach|swimsuit|traje de baño/.test(t)) s += 2;
    if (/traditional|oficina|blazer|suéter/.test(t)) s -= 1;
    return s;
  }

  function bestByScore(items, scorer, minScore = 1) {
    let best = null;
    let bestScore = minScore - 1;
    for (const item of items) {
      if (!item || !item.image_path) continue;
      const s = scorer(item);
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }
    return bestScore >= minScore ? best : null;
  }

  /**
   * @param {object} persona
   * @param {object[]} variants
   * @param {object[]} [generations]
   */
  function pickQaMatrixSlots(persona, variants = [], generations = []) {
    const pool = []
      .concat(Array.isArray(variants) ? variants : [])
      .concat(Array.isArray(generations) ? generations : []);

    const portraitPath = persona?.image || persona?.imageUGC || null;
    const fullbody = bestByScore(pool, scoreFullbody, 1);
    let spicy = bestByScore(pool, scoreSpicy, 1);

    // Evitar reutilizar la misma imagen en spicy si ya es fullbody
    if (spicy && fullbody && spicy.image_path === fullbody.image_path) {
      const alt = pool
        .filter((i) => i && i.image_path && i.image_path !== fullbody.image_path)
        .map((i) => ({ item: i, s: scoreSpicy(i) }))
        .filter((x) => x.s >= 1)
        .sort((a, b) => b.s - a.s)[0];
      spicy = alt ? alt.item : null;
    }

    return {
      portrait: portraitPath
        ? { image_path: portraitPath, source: 'anchor', label: SLOT_DEFS[0].label }
        : null,
      fullbody: fullbody
        ? { image_path: fullbody.image_path, source: 'variant', id: fullbody.id, label: SLOT_DEFS[1].label, score: scoreFullbody(fullbody) }
        : null,
      spicy: spicy
        ? { image_path: spicy.image_path, source: 'variant', id: spicy.id, label: SLOT_DEFS[2].label, score: scoreSpicy(spicy) }
        : null
    };
  }

  function emptyChecks() {
    const o = {};
    CHECKS.forEach((c) => { o[c.id] = false; });
    return o;
  }

  function summarizeChecks(checks) {
    const vals = CHECKS.map((c) => !!(checks && checks[c.id]));
    const done = vals.filter(Boolean).length;
    return {
      done,
      total: CHECKS.length,
      allOk: done === CHECKS.length,
      pct: Math.round((done / CHECKS.length) * 100)
    };
  }

  return {
    SLOT_DEFS,
    CHECKS,
    pickQaMatrixSlots,
    scoreFullbody,
    scoreSpicy,
    emptyChecks,
    summarizeChecks
  };
});
