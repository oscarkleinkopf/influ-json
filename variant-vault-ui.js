/**
 * Variant Vault / chips UI (UX detalles extract from app.js).
 * Factory with injected deps — Pollinations free path + character_lock identity.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluVariantVaultUi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} deps
   * @param {Function} deps.getState
   * @param {Function} deps.authFetch
   * @param {Function} [deps.toastSuccess]
   * @param {Function} [deps.toastError]
   * @param {Function} [deps.toastInfo]
   * @param {Function} [deps.toastLoading]
   * @param {{ start: Function }} [deps.QueuePoller]
   * @param {Function} [deps.getFullPersonaJSON]
   * @param {Function} [deps.resolveSkinForPrompt]
   * @param {Function} [deps.buildIdentityLockBlock]
   * @param {Function} [deps._promptBuilder]
   * @param {Function} [deps.personaSeed]
   * @param {Function} [deps.notifyGenerationFailure]
   * @param {Function} [deps.setGitSyncingState]
   * @param {Function} [deps.renderPersonaGrids]
   * @param {Function} [deps.populateActiveUgcData]
   * @param {Function} [deps.updateSideBySideComparator]
   * @param {Function} [deps.renderQaMatrix]
   * @param {Function} [deps.renderFacePack]
   * @param {Function} [deps.renderHappyPathChecklist]
   * @param {Function} [deps.openHistoryModal]
   * @param {Function} [deps.updateDashboardStats]
   * @param {Function} [deps.loadGenerationHistory]
   * @param {Function} [deps.refreshFaceLockOptIn]
   * @param {Function} [deps.copyFreeChatbotPack]
   * @param {object} [deps.variantPresetsApi] InfluVariantPresets
   * @param {Document} [deps.document]
   * @param {Window} [deps.window]
   */
  function createVariantVaultUi(deps) {
    if (!deps || typeof deps.getState !== 'function') {
      throw new Error('createVariantVaultUi: getState requerido');
    }
    if (typeof deps.authFetch !== 'function') {
      throw new Error('createVariantVaultUi: authFetch requerido');
    }

    const doc = deps.document || (typeof document !== 'undefined' ? document : null);
    const win = deps.window || (typeof window !== 'undefined' ? window : null);

    const presetsApi = deps.variantPresetsApi
      || (typeof InfluVariantPresets !== 'undefined' ? InfluVariantPresets : null)
      || (win && win.InfluVariantPresets)
      || null;

    const VARIANT_PRESETS = presetsApi?.VARIANT_PRESETS || {};
    const VARIANT_ACCESSORIES = presetsApi?.VARIANT_ACCESSORIES || [];
    const LOOK_PRESETS = presetsApi?.LOOK_PRESETS || [];
    const VARIANT_BATCH_OPTIONS = presetsApi?.VARIANT_BATCH_OPTIONS || [1, 4];
    const findOptionByRegex = presetsApi?.findOptionByRegex || ((sel, rx) => {
      if (!sel || !rx) return null;
      const opt = Array.from(sel.options).find((o) => rx.test(o.value) || rx.test(o.textContent));
      return opt ? opt.value : null;
    });
    const fillSelect = presetsApi?.fillSelect || ((el, items) => {
      if (!el) return;
      el.innerHTML = '';
      (items || []).forEach((item) => {
        const opt = doc.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        el.appendChild(opt);
      });
    });
    const clothingFor = presetsApi?.clothingFor || ((preset, gender) =>
      (preset.clothing && (preset.clothing[gender] || preset.clothing.Female)) || []);

    function state() {
      return deps.getState();
    }

    function el(id) {
      return doc ? doc.getElementById(id) : null;
    }

    function toastSuccess(...args) {
      if (typeof deps.toastSuccess === 'function') deps.toastSuccess(...args);
    }
    function toastError(...args) {
      if (typeof deps.toastError === 'function') deps.toastError(...args);
    }
    function toastInfo(...args) {
      if (typeof deps.toastInfo === 'function') deps.toastInfo(...args);
    }
    function toastLoading(...args) {
      if (typeof deps.toastLoading === 'function') deps.toastLoading(...args);
    }

    function setVariantMode(mode) {
      const s = state();
      s.variantMode = mode;

      const btnTrad = el('btnModeTraditional');
      const btnSpicy = el('btnModeSpicy');

      if (btnTrad) btnTrad.classList.toggle('active', mode === 'traditional');
      if (btnSpicy) btnSpicy.classList.toggle('active', mode === 'spicy');

      const layout = doc && doc.querySelector('.variant-vault-layout');
      if (layout) {
        layout.classList.toggle('spicy-theme', mode === 'spicy');
      }

      const builder = el('variantPromptBuilder');
      if (builder) builder.classList.toggle('variant-mode-spicy', mode === 'spicy');

      populateVariantDropdowns();
    }

    function populateVariantDropdowns() {
      const s = state();
      const mode = s.variantMode || 'traditional';
      const preset = VARIANT_PRESETS[mode] || VARIANT_PRESETS.traditional;
      const p = s.selectedPersona;
      const gender = p ? p.gender : (el('pGender')?.value || 'Female');

      const clothList = clothingFor(preset, gender);
      fillSelect(el('vPose'), preset?.poses);
      fillSelect(el('vAttitude'), preset?.attitudes);
      fillSelect(el('vClothing'), clothList);
      fillSelect(el('vSetting'), preset?.settings);

      renderVariantChips();
      renderLookPresets();
      renderBatchChips();
    }

    function renderVariantChips() {
      const groups = [
        ['vPose', 'chipsPose'],
        ['vAttitude', 'chipsAttitude'],
        ['vClothing', 'chipsClothing'],
        ['vSetting', 'chipsSetting']
      ];
      groups.forEach(([selId, contId]) => {
        const sel = el(selId);
        const cont = el(contId);
        if (!sel || !cont) return;
        cont.innerHTML = '';
        Array.from(sel.options).forEach((opt) => {
          const chip = doc.createElement('button');
          chip.type = 'button';
          chip.className = 'pb-chip' + (opt.value === sel.value ? ' active' : '');
          chip.textContent = opt.textContent;
          chip.title = opt.value;
          chip.addEventListener('click', () => {
            sel.value = opt.value;
            cont.querySelectorAll('.pb-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
          });
          cont.appendChild(chip);
        });
      });
      renderAccessoryChips();
    }

    function renderAccessoryChips() {
      const cont = el('chipsAccessories');
      if (!cont) return;
      const s = state();
      if (!Array.isArray(s.variantAccessories)) s.variantAccessories = [];
      cont.innerHTML = '';
      VARIANT_ACCESSORIES.forEach((a) => {
        const chip = doc.createElement('button');
        chip.type = 'button';
        const on = s.variantAccessories.includes(a.value);
        chip.className = 'pb-chip' + (on ? ' active' : '');
        chip.textContent = a.label;
        chip.addEventListener('click', () => {
          const i = s.variantAccessories.indexOf(a.value);
          if (i >= 0) s.variantAccessories.splice(i, 1);
          else s.variantAccessories.push(a.value);
          chip.classList.toggle('active');
        });
        cont.appendChild(chip);
      });
    }

    function randomizeVariantChips() {
      const s = state();
      ['vPose', 'vAttitude', 'vClothing', 'vSetting'].forEach((id) => {
        const sel = el(id);
        if (sel && sel.options.length) {
          sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
        }
      });
      const shuffled = [...VARIANT_ACCESSORIES].sort(() => Math.random() - 0.5);
      const n = Math.floor(Math.random() * 3);
      s.variantAccessories = shuffled.slice(0, n).map((a) => a.value);
      renderVariantChips();
      toastInfo('🎲 Combinación aleatoria lista — pulsa Generar');
    }

    function applyLookPreset(preset) {
      const s = state();
      const set = (id, rx) => {
        const sel = el(id);
        if (!sel) return;
        const v = findOptionByRegex(sel, rx);
        if (v != null) sel.value = v;
      };
      set('vPose', preset.pose);
      set('vAttitude', preset.attitude);
      set('vClothing', preset.clothing);
      set('vSetting', preset.setting);
      s.variantAccessories = Array.isArray(preset.accessories) ? [...preset.accessories] : [];
      renderVariantChips();
      toastInfo(`${preset.label} aplicado — ajusta o pulsa Generar`);
    }

    function renderLookPresets() {
      const cont = el('chipsLookPresets');
      if (!cont) return;
      cont.innerHTML = '';
      LOOK_PRESETS.forEach((p) => {
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = 'pb-chip';
        chip.textContent = p.label;
        chip.addEventListener('click', () => applyLookPreset(p));
        cont.appendChild(chip);
      });
    }

    function updateBatchHint() {
      const hintEl = el('batchPollenHint');
      if (!hintEl) return;
      const n = state().variantBatch || 1;
      const cost = (n * 0.002).toFixed(3);
      hintEl.textContent = n > 1
        ? `Generará ${n} imágenes (1 a la vez). Con token de Pollinations consume ~${cost} pollen (flux). El path gratis del producto es copiar el JSON al chatbot.`
        : 'Genera 1 imagen. Con token de Pollinations consume ~0.002 pollen (flux).';
    }

    function renderBatchChips() {
      const cont = el('chipsBatch');
      if (!cont) return;
      const s = state();
      if (!s.variantBatch) s.variantBatch = 1;
      cont.innerHTML = '';
      VARIANT_BATCH_OPTIONS.forEach((n) => {
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = 'pb-chip' + (s.variantBatch === n ? ' active' : '');
        chip.textContent = String(n);
        chip.addEventListener('click', () => {
          s.variantBatch = n;
          renderBatchChips();
        });
        cont.appendChild(chip);
      });
      updateBatchHint();
    }

    function updateVariantClothingDropdown(/* gender */) {
      populateVariantDropdowns();
    }

    async function loadVariantsForPersona(personaId) {
      const grid = el('variantGalleryGrid');
      if (!grid) return;
      grid.innerHTML = '<div class="u-muted-13">Cargando variaciones...</div>';

      try {
        const res = await deps.authFetch(`/api/personas/${personaId}/variants`);
        const s = state();
        s.activeVariants = await res.json();
        const missing = (s.activeVariants || []).some((v) => v && v.consistency_distance == null && v.image_path);
        if (missing) {
          try {
            const scoreRes = await deps.authFetch(`/api/personas/${personaId}/consistency/rescore`, {
              method: 'POST',
              body: JSON.stringify({ onlyMissing: true })
            });
            const scoreData = await scoreRes.json();
            if (scoreData.success && Array.isArray(scoreData.variants)) {
              s.activeVariants = scoreData.variants;
            }
          } catch (_) { /* non-blocking */ }
        }
        renderVariantVaultGrid();
        if (typeof deps.renderQaMatrix === 'function') deps.renderQaMatrix();
        try {
          if (typeof deps.renderFacePack === 'function') deps.renderFacePack();
        } catch (_) {}
      } catch (err) {
        grid.innerHTML = '<div class="u-error-13">Error al cargar poses.</div>';
        if (typeof deps.renderQaMatrix === 'function') deps.renderQaMatrix();
        try {
          if (typeof deps.renderFacePack === 'function') deps.renderFacePack();
        } catch (_) {}
      }
    }

    function consistencyChipHtml(v) {
      const grade = v?.consistency_grade;
      const dist = v?.consistency_distance;
      if (dist == null && !grade) return '';
      const tone = grade === 'ok' ? 'ok' : grade === 'warn' ? 'warn' : grade === 'bad' ? 'bad' : 'muted';
      const label = grade === 'ok' ? 'OK' : grade === 'warn' ? 'Revisar' : grade === 'bad' ? 'Drift' : '—';
      const title = `dHash vs ancla: distancia ${dist ?? '—'}. Señal de composición/color — no es face-lock.`;
      return `<span class="variant-consistency-chip is-${tone}" title="${title}">${label}${dist != null ? ` · ${dist}` : ''}</span>`;
    }

    function renderVariantVaultGrid() {
      const grid = el('variantGalleryGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const s = state();
      const variants = Array.isArray(s.activeVariants) ? s.activeVariants : [];

      if (variants.length === 0) {
        grid.innerHTML = `
      <div class="vault-empty-offline">
        <p class="vault-empty-offline__title">Sin gens — igual puedes exportar packs</p>
        <p class="vault-empty-offline__lead">
          Copia JSON / packs a un chatbot free. «Generar boceto» es opcional e inestable (Pollinations).
        </p>
        <div class="vault-empty-offline__actions">
          <button type="button" class="btn btn-sm" data-offline-highlight="pack" id="btnVaultEmptyCopyPack">Copiar JSON</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btnVaultEmptyGenBoceto">Generar boceto (opt-in · puede pedir token)</button>
        </div>
      </div>
    `;
        el('btnVaultEmptyCopyPack')?.addEventListener('click', () => {
          if (typeof deps.copyFreeChatbotPack === 'function') deps.copyFreeChatbotPack('fullbody');
        });
        el('btnVaultEmptyGenBoceto')?.addEventListener('click', () => {
          el('btnGenerateVariant')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        if (typeof deps.updateSideBySideComparator === 'function') deps.updateSideBySideComparator(null);
        if (typeof deps.renderQaMatrix === 'function') deps.renderQaMatrix();
        return;
      }

      if (typeof deps.updateSideBySideComparator === 'function') {
        deps.updateSideBySideComparator(variants[0]);
      }
      if (typeof deps.renderQaMatrix === 'function') deps.renderQaMatrix();

      variants.forEach((v) => {
        const card = doc.createElement('div');
        card.className = 'variant-card';
        card.innerHTML = `
      <img class="variant-card__img" src="${v.image_path}" title="Haz clic para ver la imagen en tamaño grande">
      ${consistencyChipHtml(v)}
      <div class="variant-zoom-icon" aria-hidden="true">🔍</div>
      <div class="variant-hover-actions">
        <div class="variant-hover-actions__pose">
          ${(v.pose || '').split('(')[0]}
        </div>
        <div class="variant-hover-actions__btns">
          <button type="button" class="btn btn-sm btn-primary variant-card__btn" onclick="event.stopPropagation(); setMainVariantAction('${v.image_path}', '${v.id}')">⭐ Perfil</button>
          <button type="button" class="btn btn-sm btn-secondary variant-card__btn variant-card__btn--danger" onclick="event.stopPropagation(); deleteVariantAction('${v.id}')">🗑️ Borrar</button>
        </div>
      </div>
    `;

        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;

          const promptDetails = `Pose: ${v.pose || 'N/A'}\nVestuario: ${v.clothing || 'N/A'}\nActitud: ${v.attitude || 'N/A'}\nEntorno: ${v.setting || 'N/A'}\ndHash: ${v.consistency_distance ?? '—'} (${v.consistency_grade || 'sin score'})`;

          if (typeof deps.openHistoryModal === 'function') {
            deps.openHistoryModal({
              id: v.id,
              image_path: v.image_path,
              generation_type: 'variant',
              created_at: v.created_at || new Date().toISOString(),
              prompt: promptDetails
            });
          }
        });

        grid.appendChild(card);
      });
    }

    async function setMainVariantAction(imagePath, variantId) {
      const s = state();
      if (!s.selectedPersona) return;
      if (typeof deps.setGitSyncingState === 'function') deps.setGitSyncingState();
      try {
        const idPart = variantId || 'set-main';
        const res = await deps.authFetch(`/api/personas/${s.selectedPersona.id}/variants/${idPart}/set-main`, {
          method: 'POST',
          body: JSON.stringify({ imagePath })
        });
        const data = await res.json();
        if (data.success) {
          s.personas = data.personas;
          s.selectedPersona = s.personas.find((p) => p.id === s.selectedPersona.id);
          if (typeof deps.renderPersonaGrids === 'function') deps.renderPersonaGrids();
          if (typeof deps.populateActiveUgcData === 'function') deps.populateActiveUgcData();
          if (typeof deps.updateSideBySideComparator === 'function') {
            deps.updateSideBySideComparator(s.lastComparedVariant);
          }
          toastSuccess('¡Retrato principal actualizado!');
        } else {
          toastError(data.message || 'Error al actualizar retrato.');
        }
      } catch (e) {
        toastError('Error al actualizar retrato.');
      }
    }

    async function deleteVariantAction(variantId) {
      const s = state();
      if (!s.selectedPersona) return;
      if (typeof confirm === 'function' && !confirm('¿Estás seguro de que deseas eliminar esta pose/variación?')) return;

      if (typeof deps.setGitSyncingState === 'function') deps.setGitSyncingState();
      try {
        const res = await deps.authFetch(`/api/personas/${s.selectedPersona.id}/variants/${variantId}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          s.activeVariants = data.variants;
          renderVariantVaultGrid();
          toastSuccess('Pose eliminada correctamente.');
        }
      } catch (e) {
        toastError('Error al eliminar pose.');
      }
    }

    async function generateVariantAction() {
      const s = state();
      const p = s.selectedPersona;
      if (!p) {
        toastInfo('Selecciona un influencer primero.');
        return;
      }

      const batch = Math.max(1, Math.min(s.variantBatch || 1, 4));
      if (batch > 1) {
        const cost = (batch * 0.002).toFixed(3);
        if (typeof confirm === 'function' && !confirm(`Vas a generar ${batch} imágenes (1 a la vez). Con token de Pollinations consume ~${cost} pollen. ¿Continuar?`)) {
          return;
        }
      }

      let ok = 0;
      for (let i = 0; i < batch; i++) {
        const success = await generateOneVariant(p, i, batch);
        if (!success) break;
        ok++;
      }
      if (batch > 1 && ok > 0) {
        toastSuccess(`Lote listo: ${ok}/${batch} imágenes generadas para ${p.name}.`);
      }
    }

    async function generateOneVariant(p, index, total) {
      const s = state();
      const pose = el('vPose').value;
      const attitude = el('vAttitude').value;
      const clothingBase = el('vClothing').value;
      const accessories = (s.variantAccessories || []).join(', ');
      const clothing = accessories ? `${clothingBase}, con ${accessories}` : clothingBase;
      const setting = el('vSetting').value;
      const mode = s.variantMode || 'traditional';

      const statusCard = el('variantGenStatus');
      const statusText = el('variantGenStatusText');
      const counter = total > 1 ? ` (${index + 1} de ${total})` : '';
      if (statusCard) {
        statusCard.style.display = 'flex';
        statusCard.classList.add('loading-pulse');
      }
      if (statusText) {
        statusText.textContent = `Renderizando ${mode === 'spicy' ? 'spicy' : 'pose'} de ${p.name}${counter}...`;
      }
      toastLoading(`Generando variante${counter} de ${p.name} — misma cara que el retrato principal...`);

      const detailed = typeof deps.getFullPersonaJSON === 'function' ? deps.getFullPersonaJSON() : {};
      const skin = typeof deps.resolveSkinForPrompt === 'function'
        ? deps.resolveSkinForPrompt(detailed, p)
        : {};
      const id = typeof deps.buildIdentityLockBlock === 'function'
        ? deps.buildIdentityLockBlock(p, detailed, skin)
        : '';
      const promptBuilder = typeof deps._promptBuilder === 'function' ? deps._promptBuilder() : null;
      const framing = promptBuilder?.detectVariantFraming
        ? promptBuilder.detectVariantFraming(pose)
        : 'portrait';
      const variantPrompt = promptBuilder?.buildVariantPrompt
        ? promptBuilder.buildVariantPrompt({
          id,
          skin,
          pose,
          attitude,
          clothing,
          setting,
          framing,
          hairFallback: p.hair
        })
        : '';

      try {
        if (deps.QueuePoller && typeof deps.QueuePoller.start === 'function') {
          deps.QueuePoller.start();
        }
        const seedFn = deps.personaSeed;
        const res = await deps.authFetch(`/api/personas/${p.id}/variants`, {
          method: 'POST',
          body: JSON.stringify({
            pose,
            attitude,
            clothing,
            setting,
            prompt: variantPrompt,
            photoreal: true,
            identityLock: true,
            framing,
            mode,
            seed: typeof seedFn === 'function' ? seedFn(p.id) + index : index,
            preferFaceLock: !!(el('preferFaceLockToggle')?.checked)
          })
        });
        const data = await res.json();
        if (data.success) {
          s.activeVariants = data.variants;
          renderVariantVaultGrid();
          if (typeof deps.updateSideBySideComparator === 'function') {
            deps.updateSideBySideComparator(data.variant || data.variants?.[0]);
          }
          if (typeof deps.renderHappyPathChecklist === 'function') deps.renderHappyPathChecklist();
          if (statusText) {
            statusText.textContent = framing === 'fullbody'
              ? `✓ Cuerpo entero generado${counter}!`
              : `✓ Pose agregada${counter}!`;
          }
          if (total === 1) {
            toastSuccess(framing === 'fullbody'
              ? `Cuerpo entero de ${p.name} listo`
              : `Variante lista — cara anclada a ${p.name}`);
          }
          if (statusCard) statusCard.classList.remove('loading-pulse');
          if (index + 1 >= total && statusCard) {
            setTimeout(() => { statusCard.style.display = 'none'; }, 3000);
          }
          return true;
        }
        if (statusText) statusText.textContent = 'Error al generar la pose.';
        if (typeof deps.notifyGenerationFailure === 'function') deps.notifyGenerationFailure(data);
        if (statusCard) statusCard.classList.remove('loading-pulse');
        return false;
      } catch (err) {
        if (statusText) statusText.textContent = 'La generación falló o el servidor está offline.';
        if (typeof deps.notifyGenerationFailure === 'function') deps.notifyGenerationFailure(null, err);
        if (statusCard) statusCard.classList.remove('loading-pulse');
        if (statusCard) setTimeout(() => { statusCard.style.display = 'none'; }, 4000);
        return false;
      }
    }

    /**
     * Bind generate + randomize (vault/chips). Archive / portfolio filters stay in app.js.
     */
    function setupVariantManager() {
      if (typeof deps.refreshFaceLockOptIn === 'function') deps.refreshFaceLockOptIn();

      const btnGen = el('btnGenerateVariant');
      if (btnGen) {
        btnGen.addEventListener('click', async () => {
          await generateVariantAction();
          try {
            const dataRes = await deps.authFetch('/api/data');
            const data = await dataRes.json();
            const s = state();
            s.generationStats = data.generationStats || { total: 0 };
            if (typeof deps.updateDashboardStats === 'function') deps.updateDashboardStats();
            if (s.selectedPersona && typeof deps.loadGenerationHistory === 'function') {
              deps.loadGenerationHistory(s.selectedPersona.id);
            }
          } catch (_) { /* non-blocking refresh */ }
        });
      }

      const btnRandomize = el('btnRandomizeVariant');
      if (btnRandomize) btnRandomize.addEventListener('click', randomizeVariantChips);
    }

    function bindWindowGlobals(target) {
      const w = target || win;
      if (!w) return;
      w.setVariantMode = setVariantMode;
      w.randomizeVariantChips = randomizeVariantChips;
      w.setMainVariantAction = setMainVariantAction;
      w.deleteVariantAction = deleteVariantAction;
    }

    return {
      setVariantMode,
      populateVariantDropdowns,
      renderVariantChips,
      renderAccessoryChips,
      randomizeVariantChips,
      applyLookPreset,
      renderLookPresets,
      updateBatchHint,
      renderBatchChips,
      updateVariantClothingDropdown,
      loadVariantsForPersona,
      consistencyChipHtml,
      renderVariantVaultGrid,
      setMainVariantAction,
      deleteVariantAction,
      generateVariantAction,
      generateOneVariant,
      setupVariantManager,
      bindWindowGlobals,
      VARIANT_PRESETS,
      VARIANT_ACCESSORIES,
      LOOK_PRESETS,
      VARIANT_BATCH_OPTIONS
    };
  }

  return { createVariantVaultUi };
});
