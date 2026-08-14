/**
 * I2 — Brief de marca → checklist de producción (sin IA, solo tareas accionables).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluProductionBrief = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = 'influ_prod_brief_v1';
  const SCHEMA_ID = 'influ-brief-checklist/v1';

  const TASK_DEFS = {
    persona: {
      id: 'persona',
      label: 'Influencer listo (JSON guardado)',
      hint: 'Sin persona no hay pack ni campaña.',
      action: 'persona',
      actionLabel: 'Ir a Influencers'
    },
    hooks: {
      id: 'hooks',
      label: 'Hooks / guiones UGC',
      hint: 'Ganchos de 0–3 s para Reels/TikTok.',
      action: 'scripts',
      actionLabel: 'Ir a guiones'
    },
    product_pack: {
      id: 'product_pack',
      label: 'Pack producto (Copiar JSON)',
      hint: 'Bloque free con producto en mano.',
      action: 'copy_product',
      actionLabel: 'Copiar pack producto'
    },
    vertical_shots: {
      id: 'vertical_shots',
      label: 'Shots verticales 9:16',
      hint: 'Planos distintos con el mismo character_lock.',
      action: 'ugc',
      actionLabel: 'Ir a Producir'
    },
    campaign: {
      id: 'campaign',
      label: 'Campaña / brief comercial',
      hint: 'Agrupa persona + producto + scripts.',
      action: 'campaign',
      actionLabel: 'Ir a Campañas'
    },
    license: {
      id: 'license',
      label: 'Licencia comercial',
      hint: 'Certificado IP si rentás la imagen a una marca.',
      action: 'license',
      actionLabel: 'Ir a Licencias'
    },
    identity: {
      id: 'identity',
      label: 'Prueba de identidad',
      hint: '3 prompts en chatbot free · cara/tez/pelo/silueta.',
      action: 'identity',
      actionLabel: 'Abrir prueba'
    }
  };

  function storageKey(profileId) {
    return `${PREFIX}:${profileId || 'anon'}`;
  }

  function emptyBrief() {
    return {
      schema_id: SCHEMA_ID,
      product: '',
      brand: '',
      goal: 'ugc',
      hooksCount: 3,
      shotsCount: 2,
      wantProductPack: true,
      wantCampaign: true,
      wantLicense: false,
      wantIdentity: true,
      updatedAt: null
    };
  }

  function normalizeBrief(input = {}) {
    const b = { ...emptyBrief(), ...input };
    b.product = String(b.product || '').trim().slice(0, 120);
    b.brand = String(b.brand || '').trim().slice(0, 80);
    b.goal = ['ugc', 'awareness', 'conversion'].includes(b.goal) ? b.goal : 'ugc';
    b.hooksCount = Math.max(0, Math.min(10, Number(b.hooksCount) || 0));
    b.shotsCount = Math.max(0, Math.min(10, Number(b.shotsCount) || 0));
    b.wantProductPack = b.wantProductPack !== false;
    b.wantCampaign = b.wantCampaign !== false;
    b.wantLicense = !!b.wantLicense;
    b.wantIdentity = b.wantIdentity !== false;
    return b;
  }

  /**
   * @param {object} brief
   * @param {object} live — señales del Studio (personas, scripts, packs, etc.)
   */
  function buildChecklist(briefInput = {}, live = {}) {
    const brief = normalizeBrief(briefInput);
    const tasks = [];

    const push = (defId, extra = {}) => {
      const def = TASK_DEFS[defId];
      if (!def) return;
      tasks.push({
        ...def,
        ...extra,
        done: !!extra.done,
        count: extra.count != null ? extra.count : null,
        target: extra.target != null ? extra.target : null
      });
    };

    const hasPersona = !!live.hasPersona;
    push('persona', {
      done: hasPersona,
      label: hasPersona
        ? `Influencer listo${live.personaName ? `: ${live.personaName}` : ''}`
        : 'Crear o importar influencer'
    });

    if (brief.hooksCount > 0) {
      const scripts = Number(live.scriptsCount) || 0;
      push('hooks', {
        target: brief.hooksCount,
        count: scripts,
        done: scripts >= brief.hooksCount,
        label: scripts >= brief.hooksCount
          ? `${brief.hooksCount} hooks listos`
          : `${Math.max(0, brief.hooksCount - scripts)} hooks pendientes (${scripts}/${brief.hooksCount})`
      });
    }

    if (brief.wantProductPack) {
      push('product_pack', {
        done: !!live.copiedProductPack || !!live.copiedJson,
        label: live.copiedProductPack || live.copiedJson
          ? 'Pack producto / JSON copiado'
          : `Pack producto${brief.product ? ` · ${brief.product}` : ''} pendiente`
      });
    }

    if (brief.shotsCount > 0) {
      const shots = Number(live.ugcShotsCount != null ? live.ugcShotsCount : live.generationsCount) || 0;
      // Shots = intención de producción; si no hay gen, se marca manual
      push('vertical_shots', {
        target: brief.shotsCount,
        count: shots,
        done: !!live.shotsMarkedDone || shots >= brief.shotsCount,
        label: (live.shotsMarkedDone || shots >= brief.shotsCount)
          ? `${brief.shotsCount} shots verticales listos`
          : `${brief.shotsCount} shots verticales pendientes`
      });
    }

    if (brief.wantCampaign) {
      const camps = Number(live.campaignsCount) || 0;
      push('campaign', {
        done: camps > 0 || !!live.campaignMarkedDone,
        label: camps > 0 ? `Campaña creada (${camps})` : 'Campaña / brief comercial pendiente'
      });
    }

    if (brief.wantLicense) {
      push('license', {
        done: !!live.hasLicense,
        label: live.hasLicense ? 'Licencia emitida' : 'Licencia sin emitir'
      });
    }

    if (brief.wantIdentity) {
      push('identity', {
        done: !!live.identityPass,
        label: live.identityPass ? 'Prueba de identidad OK' : 'Prueba de identidad pendiente'
      });
    }

    const pending = tasks.filter((t) => !t.done).length;
    const done = tasks.length - pending;
    const titleBits = [];
    if (brief.brand) titleBits.push(brief.brand);
    if (brief.product) titleBits.push(brief.product);
    const title = titleBits.length
      ? `Producción: ${titleBits.join(' · ')}`
      : 'Qué producir ahora';

    return {
      schema_id: SCHEMA_ID,
      title,
      brief,
      tasks,
      summary: {
        done,
        total: tasks.length,
        pending,
        label: pending === 0
          ? 'Checklist completo — listo para publicar'
          : `${pending} pendiente${pending === 1 ? '' : 's'} · ${done}/${tasks.length}`
      }
    };
  }

  function load(profileId, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return { brief: emptyBrief(), overrides: {} };
    try {
      const raw = store.getItem(storageKey(profileId));
      if (!raw) return { brief: emptyBrief(), overrides: {} };
      const parsed = JSON.parse(raw);
      return {
        brief: normalizeBrief(parsed.brief || parsed),
        overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {}
      };
    } catch (_) {
      return { brief: emptyBrief(), overrides: {} };
    }
  }

  function save(profileId, brief, overrides = {}, storage = null) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const payload = {
      schema_id: SCHEMA_ID,
      brief: normalizeBrief({ ...brief, updatedAt: new Date().toISOString() }),
      overrides: overrides || {}
    };
    if (store) {
      try {
        store.setItem(storageKey(profileId), JSON.stringify(payload));
      } catch (_) {}
    }
    return payload;
  }

  function applyOverrides(checklist, overrides = {}) {
    if (!checklist || !Array.isArray(checklist.tasks)) return checklist;
    const tasks = checklist.tasks.map((t) => {
      if (overrides[t.id] === true) return { ...t, done: true };
      if (overrides[t.id] === false) return { ...t, done: false };
      return t;
    });
    const pending = tasks.filter((t) => !t.done).length;
    const done = tasks.length - pending;
    return {
      ...checklist,
      tasks,
      summary: {
        done,
        total: tasks.length,
        pending,
        label: pending === 0
          ? 'Checklist completo — listo para publicar'
          : `${pending} pendiente${pending === 1 ? '' : 's'} · ${done}/${tasks.length}`
      }
    };
  }

  function nextAction(checklist) {
    const next = (checklist?.tasks || []).find((t) => !t.done);
    return next || null;
  }

  return {
    PREFIX,
    SCHEMA_ID,
    TASK_DEFS,
    storageKey,
    emptyBrief,
    normalizeBrief,
    buildChecklist,
    applyOverrides,
    load,
    save,
    nextAction
  };
});
