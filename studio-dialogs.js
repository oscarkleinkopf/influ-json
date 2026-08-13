/**
 * Corte E / U3 — openDialog / closeDialog (Escape, foco, aria-modal).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluDialogs = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const stack = [];

  function isVisible(el) {
    if (!el) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return el.getAttribute('aria-hidden') !== 'true';
  }

  function focusable(el) {
    if (!el || typeof el.querySelectorAll !== 'function') return [];
    const nodes = el.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return [...nodes].filter((n) => n.offsetParent !== null || n === document.activeElement);
  }

  function openDialog(el, opts = {}) {
    if (!el) return null;
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
    el.setAttribute('role', el.getAttribute('role') || 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.removeAttribute('aria-hidden');
    if (opts.display !== false) {
      el.style.display = opts.display || 'flex';
    }
    const entry = {
      el,
      previouslyFocused,
      onClose: typeof opts.onClose === 'function' ? opts.onClose : null
    };
    stack.push(entry);

    const focusTarget =
      (opts.focusSelector && el.querySelector(opts.focusSelector)) ||
      focusable(el)[0] ||
      el;
    try {
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    } catch (_) {}

    return entry;
  }

  function closeDialog(el) {
    if (!el) return;
    const idx = stack.map((s) => s.el).lastIndexOf(el);
    const entry = idx >= 0 ? stack.splice(idx, 1)[0] : null;
    el.setAttribute('aria-hidden', 'true');
    if (el.style && el.style.display !== 'none') el.style.display = 'none';
    if (entry?.onClose) {
      try { entry.onClose(); } catch (_) {}
    }
    const prev = entry?.previouslyFocused;
    try {
      if (prev && typeof prev.focus === 'function') prev.focus();
    } catch (_) {}
  }

  function closeTop() {
    const top = stack[stack.length - 1];
    if (!top) return false;
    closeDialog(top.el);
    return true;
  }

  function handleKeydown(e) {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (!top || !isVisible(top.el)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog(top.el);
      return;
    }

    if (e.key !== 'Tab') return;
    const nodes = focusable(top.el);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function installGlobalHandlers(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc || doc.__influDialogsBound) return;
    doc.__influDialogsBound = true;
    doc.addEventListener('keydown', handleKeydown, true);
  }

  /** Diff must_match fields for pre-save confirm (U6). */
  function diffMustMatch(beforeMust, afterMust) {
    const keys = [
      'name',
      'skin_tone',
      'skin_tone_hex',
      'eye_color',
      'hair_color',
      'hair_texture',
      'hair_length',
      'facial_asymmetry',
      'distinctive_marks',
      'ethnicity',
      'face_shape'
    ];
    const a = beforeMust && typeof beforeMust === 'object' ? beforeMust : {};
    const b = afterMust && typeof afterMust === 'object' ? afterMust : {};
    const changes = [];
    for (const k of keys) {
      const left = a[k] == null || a[k] === '' ? null : String(a[k]);
      const right = b[k] == null || b[k] === '' ? null : String(b[k]);
      if (left === right) continue;
      changes.push({ path: k, before: left, after: right });
    }
    return changes;
  }

  function formatMustMatchDiff(changes) {
    if (!changes.length) return '';
    return changes
      .map((c) => `• ${c.path}: ${c.before == null ? '∅' : c.before} → ${c.after == null ? '∅' : c.after}`)
      .join('\n');
  }

  return {
    openDialog,
    closeDialog,
    closeTop,
    installGlobalHandlers,
    focusable,
    diffMustMatch,
    formatMustMatchDiff,
    _stackForTests: stack
  };
});
