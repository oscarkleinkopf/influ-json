/**
 * Studio toast / feedback (UX-4 extract from app.js).
 * UMD: Node tests + browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluStudioToast = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_TOAST_MS = 3000;
  const DEFAULT_TOAST_MS = 4000;

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    loading: '<span class="toast-spinner" aria-hidden="true"></span>'
  };

  /**
   * @param {{ getBanner?: Function, getTextEl?: Function, getIconEl?: Function, getGitIndicator?: Function, getGitStatusText?: Function }} [deps]
   */
  function createStudioToast(deps = {}) {
    let hideTimer = null;

    function el(getter, id) {
      if (typeof getter === 'function') {
        const v = getter();
        if (v) return v;
      }
      if (typeof document === 'undefined') return null;
      return document.getElementById(id);
    }

    function showAppToast(message, opts = {}) {
      const type = opts.type || 'info';
      const banner = el(deps.getBanner, 'syncBanner');
      const textEl = el(deps.getTextEl, 'syncBannerText');
      const iconEl = el(deps.getIconEl, 'syncBannerIcon');
      if (!banner || !textEl) {
        console.warn('[toast]', type, message);
        return;
      }

      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      let actionBtn = banner.querySelector('.toast-action-btn');
      if (opts.actionLabel && typeof opts.onAction === 'function') {
        if (!actionBtn) {
          actionBtn = document.createElement('button');
          actionBtn.type = 'button';
          actionBtn.className = 'toast-action-btn btn btn-secondary btn-sm';
          actionBtn.style.cssText = 'margin-left:12px;font-size:11px;padding:4px 10px;flex-shrink:0;';
          banner.appendChild(actionBtn);
        }
        actionBtn.textContent = opts.actionLabel;
        actionBtn.style.display = 'inline-block';
        actionBtn.onclick = (e) => {
          e.preventDefault();
          opts.onAction();
          banner.classList.remove('show');
        };
      } else if (actionBtn) {
        actionBtn.style.display = 'none';
        actionBtn.onclick = null;
      }

      textEl.textContent = message || '';
      if (iconEl) iconEl.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

      banner.className = `sync-banner app-toast show type-${type}` + (type === 'error' ? ' error' : '');

      const gitIndicator = el(deps.getGitIndicator, 'gitIndicator');
      const gitStatusText = el(deps.getGitStatusText, 'gitStatusText');
      if (type === 'loading') {
        if (gitIndicator) gitIndicator.className = 'git-indicator syncing';
        if (gitStatusText) gitStatusText.textContent = 'Trabajando...';
      } else if (opts.gitOk === true) {
        if (gitIndicator) gitIndicator.className = 'git-indicator';
        if (gitStatusText) gitStatusText.textContent = 'Repositorio sincronizado';
      } else if (opts.gitOk === false) {
        if (gitIndicator) gitIndicator.className = 'git-indicator';
        if (gitStatusText) gitStatusText.textContent = 'Error de sincronización';
      } else if (type === 'success' || type === 'error') {
        if (gitIndicator) gitIndicator.className = 'git-indicator';
        if (type === 'success' && gitStatusText) gitStatusText.textContent = 'Repositorio sincronizado';
      }

      if (type === 'loading' || opts.duration === null) return;

      let ms = opts.duration != null ? opts.duration : DEFAULT_TOAST_MS;
      if (type === 'success' || type === 'error' || opts.actionLabel) {
        ms = Math.max(MIN_TOAST_MS, opts.actionLabel ? 8000 : ms);
      }
      hideTimer = setTimeout(() => {
        banner.classList.remove('show');
        hideTimer = null;
      }, ms);
    }

    function toastSuccess(message, opts = {}) {
      showAppToast(message, { ...opts, type: 'success', gitOk: opts.gitOk !== false ? (opts.gitOk ?? true) : false });
    }
    function toastError(message, opts = {}) {
      showAppToast(message, { ...opts, type: 'error', gitOk: false });
    }
    function toastInfo(message, opts = {}) {
      showAppToast(message, { ...opts, type: 'info' });
    }
    function toastLoading(message) {
      showAppToast(message, { type: 'loading', duration: null });
    }

    return {
      MIN_TOAST_MS,
      DEFAULT_TOAST_MS,
      TOAST_ICONS,
      showAppToast,
      toastSuccess,
      toastError,
      toastInfo,
      toastLoading
    };
  }

  return { createStudioToast, MIN_TOAST_MS, DEFAULT_TOAST_MS, TOAST_ICONS };
});
