# Changes Summary — Worker M2 (Multi-Image Import & Background Variants)

## Files Modified

### 1. `db.js`
- Added `syncPersonasJson()` helper function to synchronize SQLite `personas` and `persona_variants` table contents into `personas.json`.
- Integrated `syncPersonasJson()` into `savePersona()`, `deletePersona()`, `toggleArchivePersona()`, `saveVariant()`, `deleteVariant()`, and `setMainVariant()`.
- Exported `syncPersonasJson` in `db.js` `module.exports`.

### 2. `server.js`
- Added `triggerBackgroundVariants(persona)` async function to enqueue 4 initial background variants (2 traditional: casual selfie + full-body studio; 2 spicy: swimsuit beach + glamour boudoir) via `genQueue.enqueue()`.
- Alias route support: updated `/api/import-influencer` to `['/api/import-influencer', '/api/personas/import']` accepting up to 4 photos via `upload.array('photo', 4)`.
- Invoked `triggerBackgroundVariants(savedPersona)` non-blockingly right after `dbService.savePersona(persona)` so HTTP import requests return immediately (<1s).

### 3. `index.html`
- Replaced basic file input in `#importInfluencerModal` with an interactive drag-and-drop container (`#importDropzone`), visual counter badge (`#importCounterBadge` "X/4 cargadas"), and dynamic thumbnail preview strip (`#importThumbnailStrip`).

### 4. `index.css`
- Added CSS classes for `.import-dropzone`, `.import-counter-badge`, `.import-thumb-card`, `.import-thumbnail-strip`, `.import-thumb-remove`, `.import-thumb-badge`, `@keyframes shimmer`, and `.shimmer-anim`.

### 5. `app.js`
- Implemented `selectedFiles` state array in `initImportModal()` to manage image selection, drag-and-drop drops, 4-photo cap enforcement, and thumbnail deletions with `URL.revokeObjectURL`.
- Updated `btnAnalyze` handler to attach up to 4 images from `selectedFiles` to `FormData`.
- Updated `btnConfirm` handler to navigate immediately to Vault tab (`navigateToTab('vault')`) while background variant generation continues.
- Enhanced `QueuePoller` to trigger `loadPersonaVariants(state.selectedPersona.id)` automatically when background queue tasks complete or progress, enabling live Vault grid updates.

### 6. `test/import-variants.test.js` (NEW)
- Created automated test suite using `node:test` covering:
  - Multi-image payload validation (accepts 1–4 images, rejects 5+ images with 400 Bad Request).
  - Fast response time (<1s) from import endpoint with non-blocking execution.
  - Background variant enqueuing (4 initial variants).
  - Dual persistence validation in SQLite (`persona_variants` table) and `personas.json` (`syncPersonasJson`).
