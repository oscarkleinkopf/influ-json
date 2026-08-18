/**
 * Import flow (PLAN W5a) — preview / confirm / discard + helpers de archivos.
 * UMD: Node (tests) y navegador (app.js).
 * La lógica de red/UI recibe deps inyectadas para no acoplar al monolito.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluImportFlow = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_IMPORT_PHOTOS = 4;

  function filterImageFiles(fileList) {
    return Array.from(fileList || []).filter((f) => f && String(f.type || '').startsWith('image/'));
  }

  /**
   * Fusiona archivos nuevos respetando el tope de 4.
   * @returns {{ files: File[], truncated: boolean, availableSlots: number }}
   */
  function mergeSelectedFiles(selected, incoming, max = MAX_IMPORT_PHOTOS) {
    const current = Array.isArray(selected) ? selected.slice() : [];
    const next = filterImageFiles(incoming);
    const availableSlots = Math.max(0, max - current.length);
    if (availableSlots <= 0) {
      return { files: current, truncated: next.length > 0, availableSlots: 0, added: 0 };
    }
    const slice = next.slice(0, availableSlots);
    return {
      files: current.concat(slice),
      truncated: next.length > availableSlots,
      availableSlots,
      added: slice.length
    };
  }

  /**
   * FormData para POST /api/import-influencer (preview por defecto).
   */
  function buildAnalyzeFormData(opts = {}) {
    const formData = typeof FormData !== 'undefined' ? new FormData() : null;
    if (!formData) {
      throw new Error('FormData no disponible en este entorno');
    }
    const files = Array.isArray(opts.files) ? opts.files.slice(0, MAX_IMPORT_PHOTOS) : [];
    files.forEach((file) => formData.append('photo', file));
    if (opts.imageUrl) formData.append('imageUrl', String(opts.imageUrl).trim());
    if (opts.name) formData.append('name', String(opts.name).trim());
    if (opts.scriptTopic) formData.append('scriptTopic', String(opts.scriptTopic).trim());
    const previewOnly = opts.previewOnly === false ? '0' : '1';
    formData.append('previewOnly', previewOnly);
    return formData;
  }

  /**
   * Normaliza la respuesta de analyze (preview).
   */
  function normalizeImportPreview(data) {
    const persona = data && data.persona ? { ...data.persona } : null;
    const isPreview = data?.preview !== false;
    let imagePaths = Array.isArray(data?.imagePaths) ? data.imagePaths.slice() : [];
    if (!imagePaths.length && persona?.image) {
      imagePaths = [persona.image];
    }
    if (isPreview && persona) {
      delete persona.id;
    }
    return {
      persona,
      isPreview,
      imagePaths,
      videoScripts: Array.isArray(data?.videoScripts) ? data.videoScripts : []
    };
  }

  /**
   * Payload para POST /api/personas al confirmar import.
   */
  function buildConfirmPersonaPayload(persona, finalName) {
    if (!persona || typeof persona !== 'object') {
      throw new Error('No hay persona de preview para confirmar.');
    }
    const name = String(finalName || persona.name || '').trim();
    if (!name) throw new Error('Indica un nombre para el influencer.');
    const payload = { ...persona };
    delete payload.id;
    payload.name = name;
    payload.handle = `@${name.toLowerCase().replace(/\s+/g, '')}_ugc`;
    payload.forceCreate = true;
    // Columnas planas: si hair llegó como objeto del análisis, no romper SQLite
    if (payload.hair && typeof payload.hair === 'object') {
      payload.detailedJSON = payload.detailedJSON || { hair: payload.hair };
      payload.hair = [payload.hair.length, payload.hair.texture, payload.hair.color]
        .filter(Boolean)
        .join(', ');
    }
    return payload;
  }

  function collectDiscardPaths(imagePaths, persona) {
    const paths = Array.isArray(imagePaths) ? imagePaths.filter(Boolean) : [];
    if (!paths.length && persona?.image) paths.push(persona.image);
    return paths.slice();
  }

  function buildSummaryHtml(persona) {
    const d = (persona && persona.detailedJSON) || {};
    const id = d.identity || {};
    const face = d.facial_features || {};
    const hair = d.hair || {};
    const aesthetic = d.aesthetic || {};
    return `
            <strong>Género/Edad:</strong> ${id.gender || persona?.gender || '—'} (${id.apparent_age || persona?.age || '—'})<br>
            <strong>Etnia:</strong> ${id.ethnicity_appearance || persona?.ethnicity || '—'}<br>
            <strong>Rostro:</strong> ${face.face_shape || 'ovalada'} (${face.skin_tone || 'tono natural'}) con ${face.skin_texture || 'textura natural'}<br>
            <strong>Cabello:</strong> ${hair.length || 'medio'}, ${hair.texture || 'natural'}, color ${hair.color || 'castaño'}<br>
            <strong>Estilo:</strong> ${aesthetic.overall_vibe || persona?.style || '—'}
          `;
  }

  /** Traits from analysis (detailedJSON preferred). */
  function getImportPreviewTraits(persona) {
    const d =
      persona && typeof persona.detailedJSON === 'object' && persona.detailedJSON
        ? persona.detailedJSON
        : persona && typeof persona === 'object'
          ? persona
          : {};
    const identity = d.identity && typeof d.identity === 'object' ? d.identity : {};
    const facial = d.facial_features && typeof d.facial_features === 'object' ? d.facial_features : {};
    const hair = d.hair && typeof d.hair === 'object' ? d.hair : {};
    const skin = String(facial.skin_tone || identity.ethnicity_appearance || persona?.ethnicity || '').trim();
    const eyes = String(facial.eyes || facial.eye_color || '').trim();
    const hairBits = [hair.color, hair.length, hair.style || hair.texture]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    return {
      skin: skin || '—',
      eyes: eyes || '—',
      hair: hairBits.length ? hairBits.join(', ') : '—',
      ethnicity: String(identity.ethnicity_appearance || persona?.ethnicity || '').trim()
    };
  }

  function readImportConfirmTraits(els) {
    return {
      skin: String(els?.skin?.value || '').trim(),
      eyes: String(els?.eyes?.value || '').trim(),
      hair: String(els?.hair?.value || '').trim(),
      ethnicity: String(els?.ethnicity?.value || '').trim()
    };
  }

  function fillImportConfirmInputs(els, persona) {
    if (!els) return;
    const traits = getImportPreviewTraits(persona);
    if (els.skin) els.skin.value = traits.skin === '—' ? '' : traits.skin;
    if (els.eyes) els.eyes.value = traits.eyes === '—' ? '' : traits.eyes;
    if (els.hair) els.hair.value = traits.hair === '—' ? '' : traits.hair;
    if (els.ethnicity) {
      const eth = traits.ethnicity || (traits.skin !== '—' ? traits.skin : '');
      els.ethnicity.value = eth || '';
    }
  }

  /**
   * Destaca URL vs foto en el modal (acciones rápidas del dashboard).
   * @param {ParentNode|null} root
   * @param {'url'|'photo'|'all'} mode
   */
  function applyImportOriginMode(root, mode) {
    const m = mode === 'url' || mode === 'photo' ? mode : 'all';
    if (!root || typeof root.querySelectorAll !== 'function') return m;
    root.querySelectorAll('[data-import-origin]').forEach((el) => {
      const origin = el.getAttribute('data-import-origin');
      const highlight = m === 'all' || origin === m;
      el.classList.toggle('is-origin-focus', highlight && m !== 'all');
      el.classList.toggle('is-origin-muted', m !== 'all' && origin !== m);
    });
    return m;
  }

  /**
   * Enfoca el origen pedido: campo URL o selector de archivo.
   * @param {'url'|'photo'|'all'} mode
   * @param {{ urlInput?: { focus?: Function }, imagesInput?: { focus?: Function }, dropzone?: { focus?: Function } }} els
   * @returns {'url'|'photo'|null}
   */
  function focusImportOrigin(mode, els = {}) {
    const tryFocus = (el) => {
      if (!el || typeof el.focus !== 'function') return false;
      try {
        el.focus();
        return true;
      } catch (_) {
        return false;
      }
    };
    const tryBlur = (el) => {
      if (!el || typeof el.blur !== 'function') return;
      try { el.blur(); } catch (_) {}
    };
    if (mode === 'url') {
      tryBlur(els.imagesInput);
      tryBlur(els.dropzone);
      return tryFocus(els.urlInput) ? 'url' : null;
    }
    if (mode === 'photo') {
      tryBlur(els.urlInput);
      // El file input nativo a menudo ignora focus(); el dropzone es el selector visible.
      tryFocus(els.dropzone);
      tryFocus(els.imagesInput);
      return (els.imagesInput || els.dropzone) ? 'photo' : null;
    }
    return null;
  }

  /**
   * Fusiona JSON editado en el textarea de revisión con la persona de preview.
   */
  function mergeEditedJsonIntoPersona(persona, jsonText) {
    if (!persona || typeof persona !== 'object') {
      throw new Error('No hay análisis para fusionar.');
    }
    const raw = String(jsonText || '').trim();
    if (!raw) return { ...persona };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      const err = new Error('El JSON no es válido. Corrígelo o descarta los cambios.');
      err.code = 'IMPORT_JSON_INVALID';
      throw err;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const err = new Error('El JSON debe ser un objeto.');
      err.code = 'IMPORT_JSON_INVALID';
      throw err;
    }
    return { ...persona, detailedJSON: parsed };
  }

  /**
   * Merge user-confirmed tez/ojos/pelo into detailedJSON + character_lock
   * before POST /api/personas.
   */
  function applyImportConfirmTraits(persona, traits) {
    if (!persona || typeof persona !== 'object') return persona;
    const t = traits && typeof traits === 'object' ? traits : {};
    const skin = String(t.skin || '').trim();
    const eyes = String(t.eyes || '').trim();
    const hairText = String(t.hair || '').trim();
    const ethnicity = String(t.ethnicity || '').trim();

    const next = { ...persona };
    const d = {
      ...(persona.detailedJSON && typeof persona.detailedJSON === 'object' ? persona.detailedJSON : {})
    };
    d.facial_features = {
      ...(d.facial_features && typeof d.facial_features === 'object' ? d.facial_features : {})
    };
    d.hair = { ...(d.hair && typeof d.hair === 'object' ? d.hair : {}) };
    d.identity = { ...(d.identity && typeof d.identity === 'object' ? d.identity : {}) };

    if (skin) d.facial_features.skin_tone = skin;
    if (eyes) {
      d.facial_features.eye_color = eyes;
      d.facial_features.eyes = eyes;
    }
    if (ethnicity) {
      d.identity.ethnicity_appearance = ethnicity;
      next.ethnicity = ethnicity;
    } else if (skin && !String(d.identity.ethnicity_appearance || next.ethnicity || '').trim()) {
      d.identity.ethnicity_appearance = skin;
      next.ethnicity = skin;
    }

    if (hairText) {
      const parts = hairText.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        d.hair.color = parts[0];
        d.hair.length = parts[1];
        d.hair.style = parts.slice(2).join(', ');
      } else if (parts.length === 2) {
        d.hair.color = parts[0];
        d.hair.style = parts[1];
      } else {
        d.hair.color = hairText;
      }
      next.hair = [d.hair.length, d.hair.texture, d.hair.color].filter(Boolean).join(', ') || hairText;
    }

    const lock = {
      ...(d.character_lock && typeof d.character_lock === 'object' ? d.character_lock : {})
    };
    const must = {
      ...(lock.must_match_every_image && typeof lock.must_match_every_image === 'object'
        ? lock.must_match_every_image
        : {})
    };
    if (next.name) must.name = String(next.name).trim();
    if (skin) must.skin_tone = skin;
    if (eyes) must.eyes = eyes;
    if (hairText) must.hair = hairText;
    if (Object.keys(must).length) {
      lock.must_match_every_image = must;
      d.character_lock = lock;
      next.character_lock = lock;
    }

    next.detailedJSON = d;
    return next;
  }

  function setImportRitualStep(root, step) {
    if (!root || !root.querySelectorAll) return;
    const n = Number(step) || 1;
    root.querySelectorAll('[data-import-ritual]').forEach((el) => {
      const s = Number(el.getAttribute('data-import-ritual'));
      el.classList.toggle('is-active', s === n);
      el.classList.toggle('is-done', s < n);
    });
  }

  function showImportPanel(el, show, displayMode) {
    if (!el) return;
    const mode = displayMode || 'block';
    el.classList.toggle('u-hidden', !show);
    el.style.display = show ? mode : 'none';
  }

  /**
   * Inicializa el modal de import en el DOM.
   * @param {object} deps — authFetch, toasts, reloadPersonasFromServer, etc.
   */
  function initImportModal(deps = {}) {
    const authFetch = deps.authFetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const toastInfo = deps.toastInfo || (() => {});
    const toastSuccess = deps.toastSuccess || (() => {});
    const toastError = deps.toastError || (() => {});
    const toastLoading = deps.toastLoading || (() => {});
    const reloadPersonasFromServer = deps.reloadPersonasFromServer || (async () => {});
    const refreshPersonaLists = deps.refreshPersonaLists || (() => {});
    const navigateToTab = deps.navigateToTab || (() => {});
    const selectPersona = deps.selectPersona || (() => {});
    const loadPersonaVariants = deps.loadPersonaVariants || (() => {});
    const getState = deps.getState || (() => ({}));
    const QueuePoller = deps.QueuePoller || { start() {} };
    const setStep2Focus = deps.setStep2Focus || (() => {});
    const setPersonaStep = deps.setPersonaStep || (() => {});
    const copyFreeChatbotPack = deps.copyFreeChatbotPack || (() => {});
    const applyAnalysisToFormFields = deps.applyAnalysisToFormFields || (() => ({}));
    const resetPersonaFormForNew = deps.resetPersonaFormForNew || (() => {});
    const setImportRitualStepFn = deps.setImportRitualStep || setImportRitualStep;

    const modal = document.getElementById('importInfluencerModal');
    const btnOpen = document.getElementById('btnOpenImportModal');
    const btnClose = document.getElementById('btnCloseImportModal');
    const btnCancelStep1 = document.getElementById('btnCancelImportStep1');
    const btnCancelPreview = document.getElementById('btnCancelImportPreview');
    const btnAnalyze = document.getElementById('btnAnalyzeInfluencer');
    const btnConfirm = document.getElementById('btnConfirmImport');

    const step1 = document.getElementById('importStep1');
    const loading = document.getElementById('importLoading');
    const preview = document.getElementById('importPreview');
    const ritualSteps = document.getElementById('importRitualSteps');

    const imagesInput = document.getElementById('importImages');
    const dropzone = document.getElementById('importDropzone');
    const counterBadge = document.getElementById('importCounterBadge');
    const thumbnailStrip = document.getElementById('importThumbnailStrip');

    const urlInput = document.getElementById('importUrl');
    const nameInput = document.getElementById('importName');
    const scriptTopicInput = document.getElementById('importScriptTopic');
    const suggestedNameInput = document.getElementById('importSuggestedName');
    const summaryText = document.getElementById('importSummaryText');
    const videoPromptsContainer = document.getElementById('importVideoPrompts');
    const filesFeedback = document.getElementById('importFilesFeedback');
    const confirmEls = {
      skin: document.getElementById('importConfirmSkin'),
      eyes: document.getElementById('importConfirmEyes'),
      hair: document.getElementById('importConfirmHair'),
      ethnicity: document.getElementById('importConfirmEthnicity')
    };

    let selectedFiles = [];
    let lastImportedPersona = null;
    let importIsPreview = false;
    let lastImportImagePaths = [];

    if (!modal || !authFetch) return { openModal() {}, closeModal() {} };

    function updateImportUI() {
      if (!thumbnailStrip || !counterBadge) return;
      thumbnailStrip.innerHTML = '';

      const count = selectedFiles.length;
      counterBadge.textContent = `${count}/4 cargadas`;
      counterBadge.classList.remove('has-files', 'full');
      if (count > 0 && count < 4) counterBadge.classList.add('has-files');
      if (count >= 4) counterBadge.classList.add('full');

      selectedFiles.forEach((file, idx) => {
        const card = document.createElement('div');
        card.className = 'import-thumb-card';
        const imgUrl = URL.createObjectURL(file);

        card.innerHTML = `
        <img src="${imgUrl}" alt="Foto ${idx + 1}">
        ${idx === 0 ? '<span class="import-thumb-badge">Principal</span>' : ''}
        <button type="button" class="import-thumb-remove" title="Eliminar foto">&times;</button>
      `;

        card.querySelector('.import-thumb-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          URL.revokeObjectURL(imgUrl);
          selectedFiles.splice(idx, 1);
          updateImportUI();
        });

        thumbnailStrip.appendChild(card);
      });
    }

    function handleAddFiles(fileList) {
      const merged = mergeSelectedFiles(selectedFiles, fileList, MAX_IMPORT_PHOTOS);
      if (filterImageFiles(fileList).length === 0) return;
      if (merged.availableSlots <= 0 && merged.added === 0) {
        toastInfo('Se ha alcanzado el límite máximo de 4 fotos.');
        return;
      }
      if (merged.truncated) {
        toastInfo(`Máximo 4 fotos. Se agregaron las primeras ${merged.added} fotos.`);
      }
      selectedFiles = merged.files;
      updateImportUI();
    }

    if (dropzone && imagesInput) {
      dropzone.addEventListener('click', () => imagesInput.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          imagesInput.click();
        }
      });
      imagesInput.addEventListener('click', (e) => e.stopPropagation());

      ['dragenter', 'dragover'].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          handleAddFiles(e.dataTransfer.files);
        }
      });

      imagesInput.addEventListener('change', () => {
        if (imagesInput.files && imagesInput.files.length > 0) {
          handleAddFiles(imagesInput.files);
          imagesInput.value = '';
        }
      });
    }

    function openModal(opts = {}) {
      const mode = applyImportOriginMode(modal, opts.mode || 'all');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      showImportPanel(step1, true);
      showImportPanel(loading, false, 'flex');
      showImportPanel(preview, false);
      setImportRitualStepFn(ritualSteps || modal, 1);

      selectedFiles = [];
      updateImportUI();

      if (imagesInput) imagesInput.value = '';
      if (urlInput) urlInput.value = '';
      if (nameInput) nameInput.value = '';
      if (scriptTopicInput) scriptTopicInput.value = '';
      if (suggestedNameInput) suggestedNameInput.value = '';
      if (summaryText) summaryText.innerHTML = '';
      if (videoPromptsContainer) videoPromptsContainer.innerHTML = '';
      fillImportConfirmInputs(confirmEls, null);
      if (confirmEls.skin) confirmEls.skin.value = '';
      if (confirmEls.eyes) confirmEls.eyes.value = '';
      if (confirmEls.hair) confirmEls.hair.value = '';
      if (confirmEls.ethnicity) confirmEls.ethnicity.value = '';

      const importJsonEl = document.getElementById('importJsonOutput');
      if (importJsonEl) importJsonEl.value = '';

      if (filesFeedback) {
        filesFeedback.style.display = 'none';
        filesFeedback.textContent = '';
      }
      lastImportedPersona = null;
      importIsPreview = false;
      lastImportImagePaths = [];
      const confirmHint = document.getElementById('importConfirmHint');
      if (confirmHint) confirmHint.style.display = 'none';

      const title = document.getElementById('importInfluencerTitle');
      if (title) {
        title.textContent =
          mode === 'url' ? '🔗 Inspirar desde URL' : mode === 'photo' ? '📷 Inspirar desde foto' : '📥 Inspirar desde foto';
      }
      const scheduleOriginFocus = () => focusImportOrigin(mode, { urlInput, imagesInput, dropzone });
      scheduleOriginFocus();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(scheduleOriginFocus, 0));
      } else {
        setTimeout(scheduleOriginFocus, 0);
      }
    }

    function closeModal() {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }

    function personaFromPreviewUi() {
      if (!lastImportedPersona) return null;
      const jsonEl = document.getElementById('importJsonOutput');
      const withJson = mergeEditedJsonIntoPersona(lastImportedPersona, jsonEl ? jsonEl.value : '');
      const confirmedTraits = readImportConfirmTraits(confirmEls);
      return applyImportConfirmTraits(withJson, confirmedTraits);
    }

    async function discardImportPreview() {
      const pathsToClean = collectDiscardPaths(lastImportImagePaths, lastImportedPersona);

      if (lastImportedPersona?.id && !importIsPreview) {
        try {
          await authFetch(`/api/personas/${lastImportedPersona.id}`, { method: 'DELETE' });
          await reloadPersonasFromServer();
          refreshPersonaLists();
          toastInfo('Borrador de importación descartado.');
        } catch (err) {
          console.warn('discardImportPreview delete failed:', err);
        }
      } else if (importIsPreview) {
        if (pathsToClean.length) {
          try {
            await authFetch('/api/import-preview/discard', {
              method: 'POST',
              body: JSON.stringify({ imagePaths: pathsToClean })
            });
          } catch (err) {
            console.warn('discardImportPreview file cleanup failed:', err);
          }
        }
        toastInfo('Vista previa descartada. No se guardó nada en el portafolio.');
      }
      lastImportedPersona = null;
      importIsPreview = false;
      lastImportImagePaths = [];
      closeModal();
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (preview && preview.style.display !== 'none') discardImportPreview();
        else closeModal();
      });
    }
    if (btnCancelStep1) btnCancelStep1.addEventListener('click', closeModal);
    if (btnCancelPreview) btnCancelPreview.addEventListener('click', discardImportPreview);

    const btnCopyImportJSON = document.getElementById('btnCopyImportJSON');
    if (btnCopyImportJSON) {
      btnCopyImportJSON.addEventListener('click', () => {
        const importJsonOutput = document.getElementById('importJsonOutput');
        if (importJsonOutput && importJsonOutput.value) {
          navigator.clipboard.writeText(importJsonOutput.value);
          toastSuccess('Estructura JSON copiada al portapapeles');
        }
      });
    }

    const btnOpenImportInEditor = document.getElementById('btnOpenImportInEditor');
    if (btnOpenImportInEditor) {
      btnOpenImportInEditor.addEventListener('click', () => {
        if (!lastImportedPersona) {
          toastInfo('Analiza primero una URL o una foto.');
          return;
        }
        let merged;
        try {
          merged = personaFromPreviewUi();
        } catch (err) {
          toastError(err.message || 'JSON inválido.');
          return;
        }
        const finalName = suggestedNameInput
          ? suggestedNameInput.value.trim()
          : merged.name;
        if (finalName) merged.name = finalName;
        if (merged.detailedJSON?.identity) {
          merged.detailedJSON.identity = {
            ...merged.detailedJSON.identity,
            name: finalName || merged.detailedJSON.identity.name
          };
        }
        closeModal();
        navigateToTab('persona-engine');
        try { resetPersonaFormForNew(); } catch (_) {}
        try { applyAnalysisToFormFields(merged.detailedJSON || merged); } catch (_) {}
        const nameField = typeof document !== 'undefined' ? document.getElementById('pName') : null;
        if (nameField && finalName) nameField.value = finalName;
        try { setPersonaStep(1, { scroll: false }); } catch (_) {}
        toastInfo('JSON cargado en el editor. Revisa y pulsa Guardar personaje.');
      });
    }

    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', async () => {
        const imageUrl = urlInput ? urlInput.value.trim() : '';
        const customName = nameInput ? nameInput.value.trim() : '';
        const scriptTopic = scriptTopicInput ? scriptTopicInput.value.trim() : '';

        if (selectedFiles.length === 0 && !imageUrl) {
          toastInfo('Selecciona al menos una foto o una URL de referencia.');
          return;
        }

        showImportPanel(step1, false);
        showImportPanel(loading, true, 'flex');
        showImportPanel(preview, false);
        setImportRitualStepFn(ritualSteps || modal, 1);
        toastLoading(
          customName
            ? `Analizando "${customName}" (sin guardar aún)...`
            : 'Analizando referencia (sin guardar aún)...'
        );

        const formData = buildAnalyzeFormData({
          files: selectedFiles,
          imageUrl,
          name: customName,
          scriptTopic,
          previewOnly: true
        });

        try {
          const response = await authFetch('/api/import-influencer', {
            method: 'POST',
            body: formData
          });

          const data = await response.json();
          if (!data.success) {
            throw new Error(data.message || 'Error desconocido al analizar.');
          }

          const normalized = normalizeImportPreview(data);
          lastImportedPersona = normalized.persona;
          importIsPreview = normalized.isPreview;
          lastImportImagePaths = normalized.imagePaths;
          toastSuccess(
            `Análisis listo: ${lastImportedPersona?.name || 'influencer'}. Revisa el JSON, corrige tez / ojos / pelo y guarda.`
          );

          showImportPanel(loading, false, 'flex');
          showImportPanel(preview, true);
          setImportRitualStepFn(ritualSteps || modal, 2);

          const confirmHint = document.getElementById('importConfirmHint');
          if (confirmHint) {
            confirmHint.style.display = 'block';
            confirmHint.textContent =
              'Aún no está en el portafolio. Revisa el JSON, corrige tez / ojos / pelo y luego guarda o ábrelo en el editor.';
          }

          if (suggestedNameInput) suggestedNameInput.value = lastImportedPersona?.name || '';
          fillImportConfirmInputs(confirmEls, lastImportedPersona);

          if (summaryText) {
            summaryText.innerHTML = buildSummaryHtml(lastImportedPersona);
          }

          const healthEl = document.getElementById('importLockHealth');
          const g = typeof globalThis !== 'undefined' ? globalThis : {};
          const lockApi = g.InfluCharacterLockValidator || g.CharacterLockValidator;
          if (healthEl && lockApi?.validateCharacterLock) {
            try {
              const report = lockApi.validateCharacterLock(
                lastImportedPersona.detailedJSON || lastImportedPersona
              );
              healthEl.style.display = 'block';
              healthEl.textContent = `Salud character_lock: ${report.score ?? '—'}/100 (${report.gradeLabel || report.grade || '—'})`;
              healthEl.classList.toggle('is-weak', (report.score ?? 0) < 60 || report.grade === 'weak');
            } catch (_) {
              healthEl.style.display = 'none';
            }
          }

          const importJsonEl = document.getElementById('importJsonOutput');
          if (importJsonEl) {
            importJsonEl.value = JSON.stringify(lastImportedPersona.detailedJSON || {}, null, 2);
          }

          if (videoPromptsContainer) {
            videoPromptsContainer.innerHTML = '';
            if (normalized.videoScripts.length > 0) {
              normalized.videoScripts.forEach((s, idx) => {
                const card = document.createElement('div');
                card.className = 'glass-card';
                card.style.padding = '12px';
                card.style.background = 'rgba(255,255,255,0.01)';
                card.style.border = '1px solid rgba(255,255,255,0.05)';
                card.style.borderRadius = '8px';
                card.style.marginBottom = '10px';

                const firstScenePrompt =
                  s.scenes && s.scenes[0] ? s.scenes[0].visual_prompt : 'Sin prompt visual';
                card.innerHTML = `
              <h4 style="font-size: 12px; color: #fff; margin-bottom: 6px; font-weight: 700;">🎬 ${s.title || `Guion ${idx + 1}`}</h4>
              <p style="font-size: 11px; margin-bottom: 6px; color: var(--text-secondary); line-height: 1.4;">
                <strong>Audio:</strong> "${s.hook} ${s.body} ${s.cta}"
              </p>
              <div class="prompt-console" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2);">
                <span style="font-size: 8px; color: var(--accent-primary); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Prompt de Video Consistent</span>
                <div style="font-size: 10px; color: #ccc; max-height: 60px; overflow-y: auto; font-family: var(--font-mono);">${firstScenePrompt}</div>
              </div>
            `;
                videoPromptsContainer.appendChild(card);
              });
            } else {
              videoPromptsContainer.innerHTML =
                '<p style="font-size: 11px; color: var(--text-secondary);">No se generaron guiones de video.</p>';
            }
          }
        } catch (err) {
          console.error('Import analysis failed:', err);
          toastError(`Error al analizar influencer: ${err.message}`);
          showImportPanel(loading, false, 'flex');
          showImportPanel(step1, true);
          setImportRitualStepFn(ritualSteps || modal, 1);
        }
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        if (!lastImportedPersona) return;

        const finalName = suggestedNameInput
          ? suggestedNameInput.value.trim()
          : lastImportedPersona.name;
        let payload;
        try {
          const merged = personaFromPreviewUi();
          payload = buildConfirmPersonaPayload(merged, finalName);
        } catch (err) {
          toastInfo(err.message || 'Indica un nombre para el influencer.');
          return;
        }

        const confirmBtn = btnConfirm;
        confirmBtn.disabled = true;
        setImportRitualStepFn(ritualSteps || modal, 3);
        try {
          toastLoading(`Guardando "${payload.name}" en el portafolio...`);
          QueuePoller.start();

          const saveRes = await authFetch('/api/personas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const saveJson = await saveRes.json();
          if (!saveJson.success) {
            throw new Error(saveJson.message || 'No se pudo guardar la persona.');
          }
          const state = getState();
          if (Array.isArray(saveJson.personas) && state) state.personas = saveJson.personas;
          if (saveJson.persona) lastImportedPersona = saveJson.persona;
          importIsPreview = false;
          lastImportImagePaths = [];

          if (state) state.selectedPersona = lastImportedPersona;

          await reloadPersonasFromServer({
            id: lastImportedPersona?.id,
            name: payload.name
          });
          refreshPersonaLists();

          closeModal();

          navigateToTab('persona-engine');
          if (lastImportedPersona) {
            selectPersona(lastImportedPersona);
            if (lastImportedPersona.id) loadPersonaVariants(lastImportedPersona.id);
          }
          // Mismo handoff que Crear desde cero: foco paso 2 + Copiar JSON
          try {
            setStep2Focus(true, { updateHint: false });
          } catch (_) {}
          try {
            setPersonaStep(2, { scroll: false });
          } catch (_) {}
          toastSuccess(
            `«${payload.name}» guardado desde foto. Siguiente: Copiar JSON — pack fullbody, sin gen.`,
            {
              actionLabel: 'Copiar JSON',
              onAction: () => {
                try {
                  copyFreeChatbotPack('fullbody');
                } catch (_) {}
              },
              duration: 10000,
              gitOk: true
            }
          );
        } catch (err) {
          console.error('Failed to confirm and save persona:', err);
          toastError(`Error al confirmar la creación: ${err.message}`);
          setImportRitualStepFn(ritualSteps || modal, 2);
        } finally {
          confirmBtn.disabled = false;
        }
      });
    }

    return { openModal, closeModal, discardImportPreview };
  }

  return {
    MAX_IMPORT_PHOTOS,
    filterImageFiles,
    mergeSelectedFiles,
    buildAnalyzeFormData,
    normalizeImportPreview,
    buildConfirmPersonaPayload,
    collectDiscardPaths,
    buildSummaryHtml,
    getImportPreviewTraits,
    readImportConfirmTraits,
    fillImportConfirmInputs,
    applyImportConfirmTraits,
    applyImportOriginMode,
    focusImportOrigin,
    mergeEditedJsonIntoPersona,
    setImportRitualStep,
    initImportModal
  };
});
