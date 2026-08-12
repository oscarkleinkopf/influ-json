/**
 * Queue poller (UX-4 extract) — factory with injected deps.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluQueuePoller = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {{
   *   authFetch: Function,
   *   showAppToast: Function,
   *   setGenerationButtonsDisabled: Function,
   *   updateQueueStatusChip: Function,
   *   getState: Function,
   *   loadVariantsForPersona?: Function
   * }} deps
   */
  function createQueuePoller(deps) {
    const poller = {
      intervalId: null,
      isPolling: false,
      lastCompletedCount: -1,

      start(intervalMs = 1500) {
        if (this.isPolling) return;
        this.isPolling = true;
        this.check();
        this.intervalId = setInterval(() => this.check(), intervalMs);
      },

      stop() {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        this.isPolling = false;
      },

      async check() {
        try {
          const res = await deps.authFetch('/api/queue-status');
          if (!res.ok) return;
          const data = await res.json();
          if (!data.success || !data.queue) return;

          const q = data.queue;
          this.updateUI(q);

          const state = typeof deps.getState === 'function' ? deps.getState() : null;
          const loadVariants = deps.loadVariantsForPersona;
          if (state?.selectedPersona && state.activeTab === 'persona-engine' && typeof loadVariants === 'function') {
            const completed = q.completedCount || 0;
            if (completed !== this.lastCompletedCount || q.active) {
              this.lastCompletedCount = completed;
              loadVariants(state.selectedPersona.id);
            }
          }

          const isCooling = q.isCoolingDown || q.rateLimitActive;
          const pending = q.pendingCount ?? q.queueLength ?? 0;
          if (!q.active && pending === 0 && !isCooling) {
            deps.setGenerationButtonsDisabled(false);
            deps.updateQueueStatusChip(q);
            if (state?.selectedPersona && state.activeTab === 'persona-engine' && typeof loadVariants === 'function') {
              loadVariants(state.selectedPersona.id);
            }
            this.stop();
          }
        } catch (_) {
          // Ignore polling fetch errors silently
        }
      },

      updateUI(q) {
        const isCooling = q.isCoolingDown || q.rateLimitActive;
        const cooldownSec = isCooling
          ? (Math.ceil((q.cooldownRemainingMs || 0) / 1000) || q.retryAfterSeconds || 30)
          : 0;
        const pendingCount = q.pendingCount ?? q.queueLength ?? 0;
        const totalInQueue = pendingCount + (q.active ? 1 : 0);
        const locked = !!(q.active || pendingCount > 0 || isCooling);

        deps.setGenerationButtonsDisabled(locked);
        deps.updateQueueStatusChip(q);

        let statusText = '';
        let toastType = 'loading';

        if (isCooling) {
          statusText = `Rate limit 429 — reintentando en ${cooldownSec}s…`;
          toastType = 'info';
        } else if (q.active || pendingCount > 0) {
          const pos = q.position;
          const total = q.totalInWave || totalInQueue;
          if (pos && total) {
            statusText = `#${pos} de ${total}${q.currentLabel ? ` · ${q.currentLabel}` : ''}`;
          } else if (pendingCount > 0) {
            statusText = `Cola ocupada · posición ${totalInQueue} (1 gen a la vez)`;
          } else {
            statusText = q.currentLabel ? `Generando: ${q.currentLabel}` : 'Generando imagen…';
          }
          toastType = 'loading';
        }

        if (statusText) {
          deps.showAppToast(statusText, { type: toastType, duration: null });
          if (typeof document !== 'undefined') {
            const variantText = document.getElementById('variantGenStatusText');
            if (variantText && variantText.offsetParent !== null) {
              variantText.textContent = statusText;
            }
            const ugcText = document.getElementById('ugcGenStatusText');
            if (ugcText && ugcText.offsetParent !== null) {
              ugcText.textContent = statusText;
            }
          }
        } else {
          deps.setGenerationButtonsDisabled(false);
        }
      }
    };
    return poller;
  }

  return { createQueuePoller };
});
