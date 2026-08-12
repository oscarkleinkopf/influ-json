/**
 * Persona card builders (UX-4) — select / campaña / portafolio dashboard.
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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
        <div class="persona-card-name">${escapeHtml(name)}</div>
        <div class="persona-card-tag">${escapeHtml(tag)}</div>
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
        <div class="persona-card-name">${escapeHtml(name)}</div>
      </div>
    `;
    return card;
  }

  /**
   * Tarjeta de portafolio (Dashboard). Markup only — el caller cablea botones.
   * @param {object} p
   * @param {{
   *   thumbSrc?: string,
   *   selected?: boolean,
   *   archived?: boolean,
   *   personaGens?: number,
   *   exportStatus?: { kind: string, label: string, summary?: string },
   *   chatbotOk?: boolean,
   *   lastPackText?: string
   * }} [opts]
   */
  function buildPortfolioCard(p, opts = {}) {
    const name = p?.name || 'Influencer';
    const style = p?.style || 'Lifestyle';
    const tag = `${p?.age || ''} • ${p?.ethnicity || p?.ethnicity_appearance || 'Latina'}`;
    const gens = Number.isFinite(opts.personaGens) ? opts.personaGens : 0;
    const exportStatus = opts.exportStatus || { kind: 'none', label: 'Sin ancla', summary: '' };
    const exportBadgeClass = exportStatus.kind === 'ready'
      ? 'badge-export-ready'
      : exportStatus.kind === 'review'
        ? 'badge-lock-review'
        : 'badge-no-anchor';
    const archived = !!opts.archived;
    const src = opts.thumbSrc || p?.image || 'assets/nano_banana_influencer.png';

    const card = document.createElement('div');
    card.className = `portfolio-card${opts.selected ? ' selected' : ''}${archived ? ' archived-style' : ''}`;
    card.innerHTML = `
      <div class="portfolio-card-img-wrapper">
        <img src="${escapeAttr(src)}" alt="${escapeAttr(name)}" loading="lazy">
        <span class="portfolio-badge badge-style">${escapeHtml(style)}</span>
        ${archived ? '<span class="portfolio-badge badge-archived">Archivado</span>' : ''}
        ${opts.chatbotOk ? '<span class="portfolio-badge badge-chatbot-ok" title="Checklist chatbot: cara + tez + pelo OK">Chatbot OK</span>' : ''}
        ${!archived ? `<button type="button" class="portfolio-badge ${exportBadgeClass}" data-export-status="${escapeAttr(exportStatus.kind)}" title="${escapeAttr(exportStatus.summary || exportStatus.label)}">${escapeHtml(exportStatus.label)}</button>` : ''}
      </div>
      <div class="portfolio-card-info">
        <div class="portfolio-card-title-row">
          <div class="portfolio-card-name">${escapeHtml(name)}</div>
          <div class="portfolio-card-gens">📸 ${gens} gen</div>
        </div>
        <div class="portfolio-card-tag">${escapeHtml(tag)}</div>
        <div class="portfolio-card-actions">
          <button type="button" class="btn btn-quick-copy-pack btn-compact" data-offline-highlight="pack" title="Copiar JSON — pack cuerpo entero (recomendado)">Copiar JSON</button>
          <button type="button" class="btn btn-secondary btn-quick-select btn-compact">Seleccionar</button>
          <div class="portfolio-pack-menu">
            <button type="button" class="btn btn-secondary btn-quick-packs" data-offline-highlight="pack" aria-haspopup="true" aria-expanded="false" title="Biblioteca de packs free para chatbot">Packs ▾</button>
            <div class="portfolio-pack-menu-list" hidden>
              <button type="button" data-portfolio-pack="fullbody">🧍 Cuerpo entero</button>
              <button type="button" data-portfolio-pack="bikini">Bikini / playa</button>
              <button type="button" data-portfolio-pack="spicy">Spicy</button>
              <button type="button" data-portfolio-pack="product">Producto en mano</button>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-quick-session btn-compact" data-offline-highlight="pack" title="Copia sesión 3 prompts + abre checklist">Probar chatbot</button>
          <button type="button" class="btn btn-secondary btn-quick-history btn-compact">Historial</button>
          <button type="button" class="btn btn-quick-archive btn-archive-quiet">${archived ? 'Desarchivar' : 'Archivar'}</button>
        </div>
        <div class="portfolio-last-pack"></div>
      </div>
    `;

    const lastPackHint = card.querySelector('.portfolio-last-pack');
    if (lastPackHint && opts.lastPackText) {
      lastPackHint.textContent = opts.lastPackText;
    }
    return card;
  }

  return {
    buildSelectPersonaCard,
    buildCampaignPersonaCard,
    buildPortfolioCard,
    escapeAttr,
    escapeHtml
  };
});
