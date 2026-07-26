# Frontend Multi-Image Import & Live Vault Re-rendering Analysis (M2)

## Executive Summary
This document analyzes the frontend user interface and state management in `index.html`, `app.js`, and `index.css` for **Milestone 2 (M2: Multi-Image Import & Background Variants)** in the `influ-JSON` project.
It details:
1. Current implementation of the import modal UI and input elements.
2. Complete specification for a modern drag-and-drop multi-image uploader (supporting up to 4 images), dynamic visual counter `"X/4 cargadas"`, and thumbnail preview strip with individual deletion capabilities.
3. Immediate non-blocking response handling upon persona import submission while background pose/style variants generate.
4. Live vault re-rendering strategy (integrating with `QueuePoller` and active Vault state) so newly generated background variants automatically populate the vault grid without requiring full manual page refreshes.

---

## 1. Analysis of Current Import Modal UI (`index.html` & `app.js`)

### HTML Structure (`index.html`: lines 1408–1498)
- **Modal Container**: `#importInfluencerModal` using `.history-modal-overlay` styling (`z-index: 3000`).
- **Trigger**: `#btnOpenImportModal` button on the main Dashboard header (`index.html`: line 295).
- **Step 1 (`#importStep1`)**:
  - File input: `<input type="file" id="importImages" multiple accept="image/*">`.
  - Feedback text div: `<div id="importFilesFeedback"></div>`.
  - URL input: `<input type="text" id="importUrl" placeholder="Ej: https://instagram.com/p/...">`.
  - Custom Name input: `<input type="text" id="importName">`.
  - Script Topic input: `<input type="text" id="importScriptTopic">`.
  - Action button: `#btnAnalyzeInfluencer` ("Analizar Influencer").
- **Step 2 (`#importLoading`)**:
  - Loading spinner (`.analysis-spinner`) + status message during server processing.
- **Step 3 (`#importPreview`)**:
  - `#importSuggestedName`: Editable text input for final persona name.
  - `#importSummaryText`: Visual traits breakdown (gender, age, ethnicity, face, hair, vibe).
  - `#importJsonOutput`: Readonly `<textarea>` containing the detected `detailedJSON` + Copy button (`#btnCopyImportJSON`).
  - `#importVideoPrompts`: Container rendered dynamically with generated UGC video scripts.
  - Confirm button: `#btnConfirmImport` ("Crear Persona y Guardar").

### JavaScript Controller (`app.js`: lines 5004–5256 `initImportModal`)
- Standard event handling for modal visibility (`openModal()`, `closeModal()`).
- Basic `change` event listener on `imagesInput` (`#importImages`):
  ```javascript
  imagesInput.addEventListener('change', () => {
    const count = imagesInput.files.length;
    filesFeedback.textContent = `Imágenes seleccionadas: ${count}/4 ${count > 4 ? '(se usarán las primeras 4)' : ''}`;
  });
  ```
- Submission handler on `#btnAnalyzeInfluencer`:
  - Builds `FormData` using `imagesInput.files` (limited to 4 files via `Math.min(files.length, 4)`).
  - Sends `POST /api/import-influencer`.
  - Starts `QueuePoller.start()`.
  - Updates `lastImportedPersona`, reloads persona list via `reloadPersonasFromServer()`, and populates preview elements in Step 3.
- Confirmation handler on `#btnConfirmImport`:
  - Saves updated name via `POST /api/personas`.
  - Triggers `reloadPersonasFromServer()` and `refreshPersonaLists()`.
  - Closes modal and navigates to `dashboard`.

### Current UX Limitations & Gaps
1. **No Drag & Drop Dropzone**: The input is a native file picker without a visual dropzone container supporting `dragover`, `dragleave`, or `drop` events.
2. **No Thumbnail Preview Strip**: Users cannot visually verify which photos they selected, nor can they remove individual photos before submitting.
3. **No File List Persistence in JS**: Selecting additional files in native file input overwrites the previously selected `FileList`.
4. **Blocking Persona UI Experience**: Background variant generation currently lacks a dedicated UI state in the Vault tab that indicates background progress as variants render.

---

## 2. Multi-Image Drag-and-Drop & Thumbnail Strip Specification

### A. UI / CSS Design (`index.css`)
Custom CSS classes for the dropzone container, counter pill, thumbnail strip, and individual thumbnail cards:

```css
/* Drag and Drop Import Dropzone */
.import-dropzone {
  border: 2px dashed var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: 24px 16px;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;
}

.import-dropzone:hover,
.import-dropzone.dragover {
  border-color: var(--accent-primary);
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.15);
}

.import-dropzone-icon {
  font-size: 28px;
  margin-bottom: 8px;
  display: block;
}

/* Counter Badge */
.import-counter-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
}

.import-counter-badge.has-files {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
}

.import-counter-badge.full {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}

/* Thumbnail Strip */
.import-thumbnail-strip {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
  align-items: center;
}

.import-thumb-card {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  background: #000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  transition: transform 0.2s ease;
}

.import-thumb-card:hover {
  transform: scale(1.04);
}

.import-thumb-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.import-thumb-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(220, 53, 69, 0.9);
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 1;
  box-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.import-thumb-remove:hover {
  background: #dc3545;
  transform: scale(1.1);
}

.import-thumb-badge {
  position: absolute;
  bottom: 3px;
  left: 3px;
  background: rgba(99, 102, 241, 0.85);
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
}
```

### B. HTML Markup Update (`index.html`)
Replace lines 1417–1423 in `index.html` with:

```html
<div style="margin-bottom: 18px;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <label style="font-weight: 600; font-size: 12px; margin: 0;">📷 Fotos de Referencia (Máximo 4)</label>
    <span class="import-counter-badge" id="importCounterBadge">0/4 cargadas</span>
  </div>
  
  <div class="import-dropzone" id="importDropzone">
    <input type="file" id="importImages" multiple accept="image/*" style="display: none;">
    <span class="import-dropzone-icon">📥</span>
    <p style="font-size: 13px; font-weight: 600; color: #fff; margin: 0 0 4px 0;">Arrastra fotos aquí o haz clic para buscar</p>
    <p style="font-size: 11px; color: var(--text-muted); margin: 0;">Sube de 1 a 4 fotos de rostro (JPG, PNG, WEBP)</p>
  </div>

  <!-- Dynamic Thumbnail Preview Strip -->
  <div class="import-thumbnail-strip" id="importThumbnailStrip"></div>
</div>
```

### C. JavaScript State & Drag/Drop Handler (`app.js`)
Inside `initImportModal()`:

```javascript
let selectedFiles = []; // Array of File objects (max 4)

function updateImportUI() {
  const strip = document.getElementById('importThumbnailStrip');
  const badge = document.getElementById('importCounterBadge');
  if (!strip || !badge) return;

  strip.innerHTML = '';
  const count = selectedFiles.length;
  badge.textContent = `${count}/4 cargadas`;

  // Update badge classes
  badge.classList.remove('has-files', 'full');
  if (count > 0 && count < 4) badge.classList.add('has-files');
  if (count >= 4) badge.classList.add('full');

  // Render Thumbnails
  selectedFiles.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = 'import-thumb-card';

    const imgUrl = URL.createObjectURL(file);
    card.innerHTML = `
      <img src="${imgUrl}" alt="Preview ${index + 1}">
      ${index === 0 ? '<span class="import-thumb-badge">Principal</span>' : ''}
      <button type="button" class="import-thumb-remove" data-index="${index}" title="Eliminar foto">&times;</button>
    `;

    card.querySelector('.import-thumb-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(imgUrl);
      selectedFiles.splice(index, 1);
      updateImportUI();
    });

    strip.appendChild(card);
  });
}

function handleAddFiles(files) {
  const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) return;

  const total = selectedFiles.length + newFiles.length;
  if (total > 4) {
    toastInfo('Se permite un máximo de 4 imágenes. Se agregaron las primeras disponibles.');
  }

  const spaceLeft = 4 - selectedFiles.length;
  if (spaceLeft > 0) {
    selectedFiles.push(...newFiles.slice(0, spaceLeft));
    updateImportUI();
  }
}

// Drag & Drop Listeners on #importDropzone
const dropzone = document.getElementById('importDropzone');
if (dropzone && imagesInput) {
  dropzone.addEventListener('click', () => imagesInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files) {
      handleAddFiles(dt.files);
    }
  });

  imagesInput.addEventListener('change', () => {
    if (imagesInput.files) {
      handleAddFiles(imagesInput.files);
      imagesInput.value = ''; // Reset input to allow re-selection
    }
  });
}
```

---

## 3. Immediate Non-Blocking Response Architecture

When importing a persona, the system analyzes the reference image(s) and creates the main Persona record in SQLite. For background variant generation (poses, outfits, expressions):

1. **Backend Queue Integration**:
   - `/api/import-influencer` processes analysis and returns initial persona details, video scripts, and queues 3-4 initial pose jobs into `gen-queue.js`.
2. **Immediate UI Confirmation**:
   - The user clicks `#btnConfirmImport`.
   - The frontend updates local state (`state.personas`, `state.selectedPersona`).
   - The import modal closes immediately.
   - The app navigates to the **Vault Tab** (`navigateToTab('vault')`).
   - Toast feedback is displayed: `"Persona importada con éxito. Se están generando poses adicionales en segundo plano..."`.
3. **Non-Blocking User Experience**:
   - The user does not wait in the modal while 4 image variants render (which can take 20–40s on standard Pollinations runs).
   - All tabs (Dashboard, UGC Studio, Vault, Character Lock) remain fully interactive.

---

## 4. Live Vault Re-rendering Strategy

### Current Vault Architecture (`app.js`)
- `loadPersonaVariants(personaId)` fetches `/api/personas/${personaId}/variants` and stores them in `state.activeVariants`.
- `renderVariantVaultGrid()` populates `#variantGalleryGrid`.
- `QueuePoller` object (lines 968–1041) polls `/api/queue-status` every 1500ms when jobs are active.

### Live Vault Updates Implementation (Polling Integration)

1. **State Tracking in QueuePoller**:
   - `QueuePoller` tracks `lastCompletedCount`.
   - When `data.queue.completedCount` increments (or `data.queue.lastFinishedJob` changes):
     - Check if `state.selectedPersona` exists and user is currently viewing the Vault tab (`activeTab === 'vault'`).
     - Automatically execute `loadPersonaVariants(state.selectedPersona.id)` to fetch the newly generated variant images.
     - Call `renderVariantVaultGrid()`.
     - Toast notification: `"✨ ¡Nueva pose generada para ${state.selectedPersona.name}!"`.

2. **Placeholder Shimmer Cards in `#variantGalleryGrid`**:
   - When variants are queued for `state.selectedPersona`, render temporary shimmer placeholder cards in `#variantGalleryGrid`:
   ```javascript
   function renderVariantVaultPlaceholders(pendingCount = 4) {
     const grid = document.getElementById('variantGalleryGrid');
     if (!grid) return;
     
     // Append N pulsing placeholder cards
     for (let i = 0; i < pendingCount; i++) {
       const placeholder = document.createElement('div');
       placeholder.className = 'variant-card variant-placeholder-card';
       placeholder.innerHTML = `
         <div class="shimmer-box" style="width: 100%; aspect-ratio: 1; border-radius: var(--border-radius-md); background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
         <div style="padding: 8px; text-align: center;">
           <span style="font-size: 10px; color: var(--accent-primary); font-weight: 600;">⚡ Generando pose...</span>
         </div>
       `;
       grid.appendChild(placeholder);
     }
   }
   ```

3. **Keyframes for Shimmer Effect in `index.css`**:
   ```css
   @keyframes shimmer {
     0% { background-position: -200% 0; }
     100% { background-position: 200% 0; }
   }
   ```

---

## Conclusion & Recommendations for Implementation

1. **`index.html`**: Replace raw `#importImages` input with `#importDropzone` and `#importThumbnailStrip`.
2. **`index.css`**: Add `.import-dropzone`, `.import-counter-badge`, `.import-thumb-card`, `.import-thumbnail-strip`, and `@keyframes shimmer`.
3. **`app.js`**: Implement `selectedFiles` state array, drag & drop handlers, thumbnail renderer, non-blocking submit flow, and `QueuePoller` auto-reload hook for `#variantGalleryGrid`.
