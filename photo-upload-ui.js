/**
 * Photo upload & AI analysis UI (UX extract from app.js).
 * UMD: Node (tests) y navegador (InfluPhotoUploadUi).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPhotoUploadUi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {{
   *   authFetch: Function,
   *   toastInfo: Function,
   *   toastSuccess: Function,
   *   toastError: Function,
   *   toastLoading: Function,
   *   QueuePoller: { start: Function },
   *   setGitSyncingState: Function,
   *   getState: Function,
   *   refreshPersonaLists: Function,
   *   selectPersona: Function,
   *   populateActiveUgcData: Function,
   *   updateClothingDropdown: Function,
   *   compilePromptAndJSON: Function,
   *   buildPromptFromAnalysis: Function,
   *   photoAnalysis: {
   *     extractDominantColors: Function,
   *     generateDetailedJSON: Function,
   *     ANALYSIS_FIELD_OPTIONS: Object
   *   },
   *   applyAnalysisToFormFields: Function,
   *   fetchStatus?: Function
   * }} deps
   */
  function createPhotoUploadUi(deps) {
    if (!deps || typeof deps.authFetch !== 'function') {
      throw new Error('createPhotoUploadUi: authFetch requerido');
    }

    let analysisResult = null;
    let uploadedImagePath = null;

    const photoAnalysis = deps.photoAnalysis || null;
    const ANALYSIS_FIELD_OPTIONS = (photoAnalysis && photoAnalysis.ANALYSIS_FIELD_OPTIONS) || {};

    function extractDominantColors(...args) {
      if (!photoAnalysis || typeof photoAnalysis.extractDominantColors !== 'function') {
        throw new Error('InfluPhotoAnalysis.extractDominantColors no disponible');
      }
      return photoAnalysis.extractDominantColors(...args);
    }

    function generateDetailedJSON(imageDataUrl, colors) {
      if (!photoAnalysis || typeof photoAnalysis.generateDetailedJSON !== 'function') {
        throw new Error('InfluPhotoAnalysis.generateDetailedJSON no disponible');
      }
      return photoAnalysis.generateDetailedJSON(imageDataUrl, colors, {
        anchorReference: uploadedImagePath || null
      });
    }

    function buildPromptFromAnalysis(data) {
      return deps.buildPromptFromAnalysis(data);
    }

    function setupPhotoUpload() {
      const dropzone = document.getElementById('uploadDropzone');
      if (!dropzone) return;
      const fileInput = document.getElementById('photoFileInput');
      const btnLoadPhotoUrl = document.getElementById('btnLoadPhotoUrl');
      const photoUrlInput = document.getElementById('photoUrlInput');

      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('.btn-change-photo')) return;
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handlePhotoFile(e.target.files[0]);
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handlePhotoFile(e.dataTransfer.files[0]);
      });

      if (btnLoadPhotoUrl && photoUrlInput) {
        btnLoadPhotoUrl.addEventListener('click', async () => {
          const url = photoUrlInput.value.trim();
          if (!url) {
            deps.toastInfo('Por favor introduce un link de imagen.');
            return;
          }
          await handlePhotoUrl(url);
        });

        photoUrlInput.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const url = photoUrlInput.value.trim();
            if (!url) {
              deps.toastInfo('Por favor introduce un link de imagen.');
              return;
            }
            await handlePhotoUrl(url);
          }
        });
      }

      document.getElementById('btnCopyAnalysisJSON').addEventListener('click', () => {
        const output = document.getElementById('analysisJsonOutput').textContent;
        navigator.clipboard.writeText(output);
        deps.toastSuccess('JSON detallado copiado al portapapeles');
      });

      document.getElementById('btnApplyAnalysis').addEventListener('click', applyAnalysisToForm);
      document.getElementById('btnSaveAnalysisPersona').addEventListener('click', saveAnalysisAsPersona);
    }

    async function handlePhotoUrl(url) {
      const statusCard = document.getElementById('analysisStatusCard');
      statusCard.style.display = 'flex';
      document.getElementById('analysisSpinner').style.display = 'block';
      document.getElementById('analysisStatusTitle').textContent = 'Descargando imagen de referencia...';
      document.getElementById('analysisStatusMsg').textContent =
        'Conectando con la URL del perfil/imagen proporcionada.';

      const btnLoad = document.getElementById('btnLoadPhotoUrl');
      if (btnLoad) btnLoad.disabled = true;

      try {
        const res = await deps.authFetch('/api/upload-reference-url', {
          method: 'POST',
          body: JSON.stringify({ url })
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || 'Error al descargar la imagen.');
        }

        uploadedImagePath = data.filePath;

        const dropzone = document.getElementById('uploadDropzone');
        dropzone.classList.add('has-image');
        dropzone.innerHTML = `
      <img src="${data.filePath}" alt="Reference Photo" class="upload-preview-img">
      <div class="upload-preview-overlay">
        <div class="upload-preview-info">
          <div class="upload-preview-name">Imagen desde URL</div>
          <div class="upload-preview-meta">${(data.size / 1024).toFixed(0)} KB · ${data.fileName}</div>
        </div>
        <button class="btn-change-photo" onclick="resetUploadDropzone()">Cambiar foto</button>
      </div>
    `;

        const photoUrlInput = document.getElementById('photoUrlInput');
        if (photoUrlInput) photoUrlInput.value = '';

        await runPhotoAnalysis(data.filePath);
      } catch (err) {
        document.getElementById('analysisSpinner').style.display = 'none';
        document.getElementById('analysisStatusTitle').textContent = '⚠ Error de Descarga';
        document.getElementById('analysisStatusMsg').textContent =
          err.message ||
          'No se pudo descargar la imagen. Asegúrate de que el enlace sea público y directo.';
      } finally {
        if (btnLoad) btnLoad.disabled = false;
      }
    }

    async function handlePhotoFile(file) {
      if (!file.type.startsWith('image/')) {
        deps.toastInfo('Selecciona un archivo de imagen válido.');
        return;
      }

      const dropzone = document.getElementById('uploadDropzone');
      const reader = new FileReader();

      reader.onload = async (e) => {
        const imgDataUrl = e.target.result;

        dropzone.classList.add('has-image');
        dropzone.innerHTML = `
      <img src="${imgDataUrl}" alt="Reference Photo" class="upload-preview-img">
      <div class="upload-preview-overlay">
        <div class="upload-preview-info">
          <div class="upload-preview-name">${file.name}</div>
          <div class="upload-preview-meta">${(file.size / 1024).toFixed(0)} KB · ${file.type}</div>
        </div>
        <button class="btn-change-photo" onclick="resetUploadDropzone()">Cambiar foto</button>
      </div>
    `;

        await uploadToServer(file);
        await runPhotoAnalysis(imgDataUrl);
      };

      reader.readAsDataURL(file);
    }

    function resetUploadDropzone() {
      const dropzone = document.getElementById('uploadDropzone');
      dropzone.classList.remove('has-image');
      dropzone.innerHTML = `
    <input type="file" id="photoFileInput" accept="image/*" style="display:none;">
    <div class="upload-icon-circle">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </div>
    <div class="upload-text-main">Arrastra tu foto aquí</div>
    <div class="upload-text-sub">o haz <span>click para seleccionar</span> · JPG, PNG, WebP · max 10MB</div>
  `;

      const newFileInput = document.getElementById('photoFileInput');
      newFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handlePhotoFile(e.target.files[0]);
      });

      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('.btn-change-photo')) return;
        newFileInput.click();
      });

      document.getElementById('analysisStatusCard').style.display = 'none';
      document.getElementById('colorSwatchesContainer').style.display = 'none';
      document.getElementById('analysisDetailGrid').style.display = 'none';
      document.getElementById('analysisJsonSection').style.display = 'none';
      document.getElementById('analysisActions').style.display = 'none';
    }

    async function uploadToServer(file) {
      const formData = new FormData();
      formData.append('photo', file);

      try {
        deps.setGitSyncingState();
        const res = await deps.authFetch('/api/upload-reference', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          uploadedImagePath = data.filePath;
          if (data.gitSynced) {
            deps.toastSuccess('¡Foto subida y respaldada en GitHub!');
          } else {
            deps.toastError('Foto guardada localmente. Error en Git.');
          }
        }
      } catch (err) {
        console.error('Upload error:', err);
      }
    }

    async function runPhotoAnalysis(imageDataUrl) {
      const statusCard = document.getElementById('analysisStatusCard');
      statusCard.style.display = 'flex';
      document.getElementById('analysisSpinner').style.display = 'block';
      document.getElementById('analysisStatusTitle').textContent = 'Analizando imagen...';
      document.getElementById('analysisStatusMsg').textContent =
        'Extrayendo paleta de colores, composición fotográfica y rasgos faciales.';

      const colors = await extractDominantColors(imageDataUrl);

      const fetchStatus =
        typeof deps.fetchStatus === 'function'
          ? deps.fetchStatus
          : (url) => fetch(url);
      const statusRes = await fetchStatus('/api/status');
      const statusData = await statusRes.json();

      if (statusData.apiConnected && uploadedImagePath) {
        document.getElementById('analysisStatusTitle').textContent = '🤖 Analizando con Gemini Vision...';
        try {
          const aiRes = await deps.authFetch('/api/ai/analyze-photo', {
            method: 'POST',
            body: JSON.stringify({ imagePath: uploadedImagePath })
          });
          const aiData = await aiRes.json();
          if (aiData.success && aiData.analysis) {
            analysisResult = aiData.analysis;
            displayAnalysisResults(colors);
            deps.toastSuccess('Análisis de foto completado con Gemini Vision API!');
            return;
          }
        } catch (err) {
          console.warn('Gemini vision analysis failed, falling back to local simulation.');
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1800));
      analysisResult = await generateDetailedJSON(imageDataUrl, colors);
      displayAnalysisResults(colors);
    }

    function displayAnalysisResults(colors) {
      document.getElementById('analysisSpinner').style.display = 'none';
      document.getElementById('analysisStatusTitle').textContent = '✓ Análisis completado';
      document.getElementById('analysisStatusMsg').textContent = `Se generaron ${Object.values(
        analysisResult
      ).reduce(
        (sum, cat) =>
          sum + (typeof cat === 'object' && !Array.isArray(cat) ? Object.keys(cat).length : 0),
        0
      )} campos detallados en 6 categorías.`;

      renderColorSwatches(colors);
      renderAnalysisDetailGrid(analysisResult);

      const jsonSection = document.getElementById('analysisJsonSection');
      jsonSection.style.display = 'block';
      document.getElementById('analysisJsonOutput').textContent = JSON.stringify(analysisResult, null, 2);

      document.getElementById('analysisActions').style.display = 'flex';
    }

    function renderColorSwatches(colors) {
      const container = document.getElementById('colorSwatchesContainer');
      container.style.display = 'block';
      const swatchesEl = document.getElementById('colorSwatches');
      swatchesEl.innerHTML = '';

      const labels = ['Dominante', 'Piel', 'Cabello', 'Fondo', 'Ropa', 'Acento', 'Sombra', 'Brillo'];
      colors.forEach((c, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'color-swatch-col';
        wrapper.innerHTML = `
      <div class="color-swatch analysis-reveal delay-${Math.min(i + 1, 8)}" style="background-color: ${c.hex};" title="${c.hex}"></div>
      <div class="color-swatch-label">${labels[i] || ''}</div>
    `;
        swatchesEl.appendChild(wrapper);
      });
    }

    function renderAnalysisDetailGrid(data) {
      const grid = document.getElementById('analysisDetailGrid');
      grid.style.display = 'grid';
      grid.innerHTML = '';

      const categories = [
        { key: 'identity', label: '👤 Identidad', cssClass: 'identity' },
        { key: 'facial_features', label: '🧬 Rasgos Faciales', cssClass: 'facial' },
        { key: 'hair', label: '💇 Cabello', cssClass: 'hair-cat' },
        { key: 'aesthetic', label: '✨ Estética', cssClass: 'aesthetic' },
        { key: 'photography', label: '📷 Fotografía', cssClass: 'photo' },
        { key: 'clothing', label: '👗 Vestimenta', cssClass: 'clothing-cat' }
      ];

      let delayIdx = 0;
      categories.forEach((cat) => {
        const section = data[cat.key];
        if (!section || typeof section !== 'object') return;

        const header = document.createElement('div');
        header.className = `analysis-category ${cat.cssClass} analysis-reveal delay-${Math.min(
          ++delayIdx,
          8
        )}`;
        header.textContent = cat.label;
        grid.appendChild(header);

        Object.entries(section).forEach(([fieldKey, fieldVal]) => {
          if (fieldVal === null) return;
          const field = document.createElement('div');
          const isLong = String(fieldVal).length > 50;
          field.className = `analysis-field ${isLong ? 'full-width' : ''} analysis-reveal delay-${Math.min(
            (++delayIdx % 8) + 1,
            8
          )}`;

          const labelText = fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

          const options = ANALYSIS_FIELD_OPTIONS[cat.key]?.[fieldKey];
          let inputHtml = '';

          if (options) {
            const valLower = String(fieldVal).toLowerCase();
            const lowerOptions = options.map((o) => o.toLowerCase());

            let selectedIndex = lowerOptions.findIndex(
              (o) => o === valLower || valLower.includes(o) || o.includes(valLower)
            );
            let optionsList = [...options];

            if (selectedIndex === -1) {
              optionsList.unshift(fieldVal);
              selectedIndex = 0;
            }

            inputHtml = `
          <select data-category="${cat.key}" data-field="${fieldKey}" class="analysis-editable-input">
            ${optionsList
              .map(
                (opt, idx) => `
              <option value="${opt}" ${idx === selectedIndex ? 'selected' : ''}>${opt}</option>
            `
              )
              .join('')}
          </select>
        `;
          } else {
            inputHtml = `
          <input type="text" value="${String(fieldVal).replace(/"/g, '&quot;')}" data-category="${cat.key}" data-field="${fieldKey}" class="analysis-editable-input">
        `;
          }

          field.innerHTML = `
        <span class="analysis-field-label">${labelText}</span>
        ${inputHtml}
      `;
          grid.appendChild(field);
        });
      });

      grid.querySelectorAll('.analysis-editable-input').forEach((input) => {
        const updateHandler = () => {
          const cat = input.dataset.category;
          const field = input.dataset.field;
          if (analysisResult[cat]) {
            analysisResult[cat][field] = input.value;
          }
          analysisResult.generation_prompt = buildPromptFromAnalysis(analysisResult);
          document.getElementById('analysisJsonOutput').textContent = JSON.stringify(
            analysisResult,
            null,
            2
          );
        };
        input.addEventListener('input', updateHandler);
        input.addEventListener('change', updateHandler);
      });

      analysisResult.generation_prompt = buildPromptFromAnalysis(analysisResult);
      document.getElementById('analysisJsonOutput').textContent = JSON.stringify(analysisResult, null, 2);
    }

    function applyAnalysisToForm() {
      if (!analysisResult) return;
      const { clothingHint } = deps.applyAnalysisToFormFields(analysisResult);
      deps.updateClothingDropdown(clothingHint || '');
      deps.compilePromptAndJSON();
      deps.toastSuccess('Datos del análisis aplicados al formulario (incluye cuerpo)');
    }

    async function saveAnalysisAsPersona() {
      if (!analysisResult) return;

      const name =
        (analysisResult && analysisResult.identity && analysisResult.identity.name) || 'Influencer';
      deps.toastLoading(`Generando retrato virtual consistente con ${name}...`);

      const promptText = buildPromptFromAnalysis(analysisResult);
      let portraitPath = uploadedImagePath;

      try {
        deps.QueuePoller.start();
        const imgRes = await deps.authFetch('/api/ai/generate-image', {
          method: 'POST',
          body: JSON.stringify({ prompt: promptText, referenceLocalPath: uploadedImagePath })
        });
        const imgData = await imgRes.json();
        if (imgData.success && imgData.imagePath) {
          portraitPath = imgData.imagePath;
        }
      } catch (err) {
        console.warn('Image generation failed or offline. Using reference photo as fallback.');
      }

      const i = analysisResult.identity || {};
      const f = analysisResult.facial_features || {};
      const h = analysisResult.hair || {};
      const a = analysisResult.aesthetic || {};
      const p = analysisResult.photography || {};
      const c = analysisResult.clothing || {};

      const personaData = {
        name: i.name || 'Nuevo Influencer',
        gender: (i.gender || '').toLowerCase().includes('masc') ? 'Male' : 'Female',
        age: i.apparent_age || '25 años',
        ethnicity: i.ethnicity_appearance || 'Mixta',
        style: a.overall_vibe || 'Natural',
        hair: `${h.color || ''}, ${h.texture || ''}, ${h.length || ''}`,
        lighting: p.lighting_type || 'Luz natural',
        camera: p.camera_lens || 'DSLR portrait photograph, 50mm lens',
        clothing: `${c.type || ''} en ${c.color || ''}`,
        setting: p.background_setting || 'Fondo neutro',
        detailedJSON: analysisResult,
        image: portraitPath || 'assets/influencer_female.png',
        imageUGC: portraitPath || 'assets/influencer_female_serum.png'
      };

      deps.setGitSyncingState();
      try {
        const res = await deps.authFetch('/api/personas', {
          method: 'POST',
          body: JSON.stringify(personaData)
        });
        const data = await res.json();
        if (data.success) {
          const state = deps.getState();
          state.personas = Array.isArray(data.personas) ? data.personas : state.personas;
          uploadedImagePath = null;
          const saved =
            data.persona ||
            state.personas.find(
              (p) => p.name && p.name.toLowerCase() === personaData.name.toLowerCase()
            );
          deps.refreshPersonaLists();
          if (saved) {
            try {
              deps.selectPersona(saved);
            } catch (e) {
              console.warn(e);
              deps.refreshPersonaLists();
            }
          }

          try {
            deps.populateActiveUgcData();
          } catch (e) {
            console.warn(e);
          }
          applyAnalysisToForm();

          const galleryPrompt = buildPromptFromAnalysis(analysisResult);
          const imgPath =
            uploadedImagePath ||
            (personaData.gender === 'Male'
              ? 'assets/influencer_male.png'
              : 'assets/influencer_female.png');
          try {
            await deps.authFetch('/api/gallery', {
              method: 'POST',
              body: JSON.stringify({ prompt: galleryPrompt, imagePath: imgPath })
            });
          } catch (galleryErr) {
            console.error('Failed to auto-save to gallery:', galleryErr);
          }

          if (data.gitSynced) {
            deps.toastSuccess('¡Persona del análisis guardada y respaldada en GitHub!');
          } else {
            deps.toastError('Guardada localmente. Error en Git.');
          }
        }
      } catch (err) {
        deps.toastError('Error de servidor al guardar persona.');
      }
    }

    return {
      setupPhotoUpload,
      handlePhotoUrl,
      handlePhotoFile,
      resetUploadDropzone,
      uploadToServer,
      runPhotoAnalysis,
      displayAnalysisResults,
      renderColorSwatches,
      renderAnalysisDetailGrid,
      applyAnalysisToForm,
      saveAnalysisAsPersona,
      getAnalysisResult: () => analysisResult,
      setAnalysisResult: (v) => {
        analysisResult = v;
      },
      getUploadedImagePath: () => uploadedImagePath,
      setUploadedImagePath: (v) => {
        uploadedImagePath = v;
      }
    };
  }

  return { createPhotoUploadUi };
});
