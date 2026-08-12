/**
 * Persona card builders (UX-4) — un constructor para grids de selección / campaña.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPersonaCard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /**
   * Tarjeta compacta (Persona Engine select grid).
   * @param {object} p
   * @param {{ selected?: boolean, thumbSrc?: string, onClick?: Function, bindThumbFallback?: Function }} [opts]
   */
  function buildSelectPersonaCard(p, opts = {}) {
    const name = p?.name || 'Sin nombre';
    const tag = [p?.age, p?.ethnicity || p?.ethnicity_appearance].filter(Boolean).join(' • ');
    const src = opts.thumbSrc || p?.image || 'assets/nano_banana_influencer.png';
    const card = document.createElement('div');
    card.className = `persona-card${opts.selected ? ' selected' : ''}`;
    card.innerHTML = `
      <img src="${escapeAttr(src)}" alt="${escapeAttr(name)}" loading="lazy">
      <div class="persona-card-info">
        <div class="persona-card-name">${escapeAttr(name)}</div>
        <div class="persona-card-tag">${escapeAttr(tag)}</div>
      </div>
    `;
    const img = card.querySelector('img');
    if (img && typeof opts.bindThumbFallback === 'function') {
      opts.bindThumbFallback(img);
    }
    if (typeof opts.onClick === 'function') {
      card.addEventListener('click', () => opts.onClick(p));
    }
    return card;
  }

  /**
   * Tarjeta asignada en detalle de campaña.
   */
  function buildCampaignPersonaCard(p) {
    const name = p?.name || 'Sin nombre';
    const src = p?.image || 'assets/nano_banana_influencer.png';
    const card = document.createElement('div');
    card.className = 'persona-card persona-card--compact';
    card.innerHTML = `
      <img src="${escapeAttr(src)}" alt="${escapeAttr(name)}">
      <div class="persona-card-info">
        <div class="persona-card-name">${escapeAttr(name)}</div>
      </div>
    `;
    return card;
  }

  return { buildSelectPersonaCard, buildCampaignPersonaCard, escapeAttr };
});
