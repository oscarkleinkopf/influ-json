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

    function openModal() {
      modal.style.display = 'flex';
      if (step1) step1.style.display = 'block';
      if (loading) loading.style.display = 'none';
      if (preview) preview.style.display = 'none';

      selectedFiles = [];
      updateImportUI();

      if (imagesInput) imagesInput.value = '';
      if (urlInput) urlInput.value = '';
      if (nameInput) nameInput.value = '';
      if (scriptTopicInput) scriptTopicInput.value = '';
      if (suggestedNameInput) suggestedNameInput.value = '';
      if (summaryText) summaryText.innerHTML = '';
      if (videoPromptsContainer) videoPromptsContainer.innerHTML = '';

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
    }

    function closeModal() {
      modal.style.display = 'none';
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

    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', async () => {
        const imageUrl = urlInput ? urlInput.value.trim() : '';
        const customName = nameInput ? nameInput.value.trim() : '';
        const scriptTopic = scriptTopicInput ? scriptTopicInput.value.trim() : '';

        if (selectedFiles.length === 0 && !imageUrl) {
          toastInfo('Selecciona al menos una foto o una URL de referencia.');
          return;
        }

        if (step1) step1.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (preview) preview.style.display = 'none';
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
            `Análisis listo: ${lastImportedPersona?.name || 'influencer'}. Revisa y confirma para guardar.`
          );

          if (loading) loading.style.display = 'none';
          if (preview) preview.style.display = 'block';

          const confirmHint = document.getElementById('importConfirmHint');
          if (confirmHint) {
            confirmHint.style.display = 'block';
            confirmHint.textContent =
              'Aún no está en tu portafolio. Revisa el JSON y pulsa «Crear Persona y Guardar», o Descartar.';
          }

          if (suggestedNameInput) suggestedNameInput.value = lastImportedPersona?.name || '';

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
          if (loading) loading.style.display = 'none';
          if (step1) step1.style.display = 'block';
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
          payload = buildConfirmPersonaPayload(lastImportedPersona, finalName);
        } catch (err) {
          toastInfo(err.message || 'Indica un nombre para el influencer.');
          return;
        }

        const confirmBtn = btnConfirm;
        confirmBtn.disabled = true;
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

          toastSuccess(
            `¡Influencer "${payload.name}" importado! Aparece en portafolio; poses ancla en segundo plano…`
          );
          closeModal();

          navigateToTab('persona-engine');
          if (lastImportedPersona) {
            selectPersona(lastImportedPersona);
            if (lastImportedPersona.id) loadPersonaVariants(lastImportedPersona.id);
          }
        } catch (err) {
          console.error('Failed to confirm and save persona:', err);
          toastError(`Error al confirmar la creación: ${err.message}`);
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
    initImportModal
  };
});
