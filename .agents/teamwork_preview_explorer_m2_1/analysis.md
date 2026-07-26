# influ-JSON M2: Multi-Image Import & Background Variants Architecture Analysis

## Overview

This report presents a thorough analysis of the backend architecture of **influ-JSON** across `server.js`, `db.js`, `personas.json`, `ai-service.js`, `gen-queue.js`, `image-provider.js`, and `paths.js`. It directly addresses the four investigation objectives for **Milestone 2 (M2)**: Multi-Image Import, 4 Initial Background Variants (2 traditional + 2 spicy), Non-blocking Asynchronous Queueing via `gen-queue.js`, and Dual Persistence into SQLite and `personas.json`.

---

## 1. Current Persona Creation/Import & Storage Architecture

### Endpoints & Flow

#### A. Manual Persona Creation (`POST /api/personas`)
- **Location**: `server.js` (lines 147–169)
- **Input**: JSON payload containing fields such as `name`, `gender`, `age`, `ethnicity`, `style`, `hair`, `lighting`, `camera`, `clothing`, `setting`, `image`, `imageUGC`, `handle`, `detailedJSON`, `forceCreate`.
- **Handling**:
  1. Calls `dbService.savePersona(body)` in `db.js` (lines 448–527).
  2. If `p.id` exists and `forceCreate` is false, it updates the existing persona row and logs version history in the `versions` table.
  3. If `forceCreate` is true or `p.id` is missing, it generates a new UUID, applies fallback avatar paths (`assets/influencer_female.png` or `assets/influencer_male.png`), constructs a handle, serializes `detailedJSON`, and executes an `INSERT` into the `personas` SQLite table.
  4. Calls `dbService.syncDbToWorkspace()` to copy `data/influ.sqlite` to `WORKSPACE_DB_MIRROR` (`influ.sqlite`).
  5. Triggers `runGitBackup()` and responds with `{ success: true, personas, persona, created, gitSynced }`.

#### B. Influencer Import (`POST /api/import-influencer`)
- **Location**: `server.js` (lines 758–1027)
- **Input**: `multipart/form-data` supporting up to 4 images (`upload.array('photo', 4)`) or optional `req.body.imageUrl`.
- **Handling**:
  1. Saves uploaded files to `assets/references/ref_<timestamp>_<random>.<ext>`.
  2. If `imageUrl` is provided, downloads and saves the image to `assets/references/`.
  3. If no image is supplied, generates a fair-skin fallback AI portrait via `aiService.generateInfluencerImage()` or defaults to local assets.
  4. Optimizes uploaded images with `sharp` to a maximum 1024x1024 JPEG and copies them to `scratch/references/`.
  5. Uses `imagePaths[0]` as the primary image (`persona.image` and `persona.imageUGC`).
  6. Runs multi-modal AI analysis (`aiService.generateWithGeminiMulti(imagePaths)`) or local spatial color + heuristic fallback to generate a full `detailedJSON` structure (identity, body, facial_features, hair, aesthetic, photography, clothing).
  7. Constructs the `persona` object and calls `dbService.savePersona(persona)`.
  8. Generates UGC video scripts via `aiService.generateUgcVideoScripts(savedPersona, scriptTopic)`.
  9. Calls `dbService.syncDbToWorkspace()` and returns HTTP response `{ success: true, persona: savedPersona, videoScripts, gitSynced }`.

### Current Storage Behavior: SQLite vs. `personas.json`
- **SQLite (`data/influ.sqlite`)**: Active single source of truth used at runtime by `db.js`. Managed via `better-sqlite3`.
- **`personas.json`**: Located at the project root (`c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON\personas.json`).
  - Currently used **only** as a seed/migration source during initial startup in `db.js` (`runMigrations()` lines 206–246) when the `personas` SQLite table is empty.
  - Currently, when `POST /api/personas` or `POST /api/import-influencer` is called, **`personas.json` is not updated**.
- **M2 Gap**: To satisfy M2 requirements and project specifications, any persona creation/import or variant generation must automatically update both SQLite AND `personas.json`.

---

## 2. Triggering 4 Initial Background Variants (2 Traditional + 2 Spicy)

### Variant Definitions & Presets

Upon persona creation or import, 4 initial variants should be generated automatically to populate the persona's portrait portfolio:

1. **Traditional 1 — Casual Selfie / Lifestyle**:
   - `pose`: "Casual standing pose with natural warm smile"
   - `clothing`: "Casual stylish outfit (denim jacket / soft top)"
   - `attitude`: "Warm, friendly, accessible"
   - `setting`: "Cozy bright cafe or sunlit living room"
   - `mode`: "traditional"
   - `framing`: "portrait" (or "medium")
2. **Traditional 2 — Full-body / Studio**:
   - `pose`: "Standing full body portrait, natural posture"
   - `clothing`: "Smart casual blazer or full streetwear ensemble"
   - `attitude`: "Confident, relaxed, professional"
   - `setting`: "Modern minimal studio with soft neutral background"
   - `mode`: "traditional"
   - `framing`: "fullbody"
3. **Spicy 1 — Swimsuit / Beach**:
   - `pose`: "Relaxed beach or poolside pose, sunlight highlights"
   - `clothing`: "Stylish summer swimsuit / bikini"
   - `attitude`: "Alluring, confident, sun-kissed"
   - `setting`: "Tropical beach or luxury pool deck with warm daylight"
   - `mode`: "spicy"
   - `framing`: "medium" (or "fullbody")
4. **Spicy 2 — Glamour / Boudoir**:
   - `pose`: "Glamour portrait pose on plush couch or accent chair"
   - `clothing`: "Elegantly styled satin slip dress or evening glamour outfit"
   - `attitude`: "Seductive, sophisticated, atmospheric"
   - `setting`: "Luxury hotel room with warm low-key ambient lighting"
   - `mode`: "spicy"
   - `framing`: "portrait" (or "medium")

### Triggering Mechanism

In `server.js`, immediately after `savedPersona` is created in `POST /api/personas` or `POST /api/import-influencer`:
1. Extract `personaId = savedPersona.id`.
2. Launch an asynchronous worker function `triggerInitialVariants(savedPersona)` **without using `await`**.
3. Return the HTTP response `{ success: true, persona: savedPersona, ... }` immediately.
4. The background worker iterates through the 4 variant specs and passes each job to `genQueue.enqueue()`.

### Face DNA & Reference Consistency

To prevent face drift between modes (traditional vs. spicy):
- Always use `persona.image` (or `detailedJSON.anchor_reference`) as the face anchor reference.
- Set `options.identityLock = true` and `options.photoreal = true`.
- Pass a deterministic persona seed derived from `persona.id` (e.g. hash of UUID) to maintain facial feature consistency across calls.

---

## 3. Enqueuing Background Tasks via `gen-queue.js` (Non-Blocking HTTP Response)

### How `gen-queue.js` Works
- **Location**: `gen-queue.js`
- **Mechanism**: Manages a global Promise chain (`chain = chain.then(...)`) for sequential image generation.
- **Key Parameters**:
  - `GEN_MIN_GAP_MS` (default 10,000ms / 10s): Enforces minimum gap between consecutive generations to prevent Pollinations HTTP 429 rate limits.
  - `GEN_429_COOLDOWN_MS` (default 30,000ms / 30s): Cools down queue when HTTP 429 is encountered.
  - Retries: Automatically retries up to 2 times on HTTP 429 errors.
  - Status Tracking: `getStatus()` provides `active`, `pendingCount`, `isCoolingDown`, `retryAfterSeconds`, `currentTaskInfo`.

### Non-Blocking Async Pattern

When creating or importing a persona, the HTTP response MUST NOT wait for variant image generation:

```javascript
// Inside POST /api/import-influencer or POST /api/personas:
const savedPersona = dbService.savePersona(persona);

// Trigger background variant generation (FIRE-AND-FORGET / NON-BLOCKING)
triggerBackgroundVariants(savedPersona).catch(err => {
  console.error(`[background-variants] Error in variant queue for persona ${savedPersona.id}:`, err);
});

// Immediately return HTTP 200 response to client
res.json({
  success: true,
  persona: savedPersona,
  gitSynced: gitSuccess
});
```

Where `triggerBackgroundVariants` is defined as:

```javascript
async function triggerBackgroundVariants(persona) {
  const variantSpecs = [
    { pose: 'Casual smiling', clothing: 'Casual denim & top', attitude: 'Friendly', setting: 'Cozy cafe', mode: 'traditional', framing: 'portrait' },
    { pose: 'Standing full body', clothing: 'Smart blazer', attitude: 'Confident', setting: 'Minimal studio', mode: 'traditional', framing: 'fullbody' },
    { pose: 'Beach pose', clothing: 'Summer swimsuit', attitude: 'Sun-kissed', setting: 'Tropical beach', mode: 'spicy', framing: 'medium' },
    { pose: 'Glamour portrait', clothing: 'Satin slip dress', attitude: 'Seductive', setting: 'Luxury hotel', mode: 'spicy', framing: 'portrait' }
  ];

  for (let i = 0; i < variantSpecs.length; i++) {
    const spec = variantSpecs[i];
    const label = `variant_${spec.mode}_${i + 1}_${persona.name}`;
    
    // Enqueue onto global promise chain
    genQueue.enqueue(label, async () => {
      // 1. Construct prompt using persona detailedJSON & skin lock
      const prompt = buildVariantPrompt(persona, spec);
      
      // 2. Resolve anchor image reference URL
      const referenceUrl = await resolveAnchorUrl(persona);
      
      // 3. Generate image via aiService
      const imagePath = await aiService.generateInfluencerImage(prompt, referenceUrl, {
        photoreal: true,
        identityLock: true,
        seed: derivePersonaSeed(persona.id) + i,
        framing: spec.framing
      });

      if (imagePath) {
        // 4. Save variant to SQLite DB and sync personas.json
        const variant = dbService.saveVariant({
          persona_id: persona.id,
          pose: spec.pose,
          clothing: spec.clothing,
          attitude: spec.attitude,
          setting: spec.setting,
          image_path: imagePath
        });
        dbService.saveGeneration({
          persona_id: persona.id,
          prompt,
          image_path: imagePath,
          generation_type: 'variant',
          metadata: JSON.stringify(spec)
        });
        dbService.syncPersonasJson(); // Dual persistence sync
        console.log(`[background-variants] Generated variant ${i+1}/4 for ${persona.name}: ${imagePath}`);
      }
    }).catch(err => {
      console.warn(`[background-variants] Failed to generate variant ${i+1} for ${persona.name}:`, err.message);
    });
  }
}
```

Because `triggerBackgroundVariants` enqueues each function call into `genQueue.enqueue()`, all 4 variants execute sequentially with 10s gaps between calls without blocking the HTTP response or overwhelming Pollinations.

---

## 4. Dual Persistence Architecture: SQLite & `personas.json`

### SQLite Schema (`db.js`)

1. **`personas` Table**:
   - Stores core persona profile (`id`, `name`, `gender`, `age`, `ethnicity`, `style`, `hair`, `lighting`, `camera`, `clothing`, `setting`, `image`, `imageUGC`, `handle`, `detailedJSON`, `archived`, `created_at`).
2. **`persona_variants` Table**:
   - Stores generated variants linked by `persona_id`:
     `id` (PRIMARY KEY), `persona_id` (FOREIGN KEY), `pose`, `clothing`, `attitude`, `setting`, `image_path`, `created_at`.
3. **`generation_history` Table**:
   - Tracks image generation logs:
     `id`, `persona_id`, `prompt`, `image_path`, `generation_type`, `metadata`, `created_at`.

### Updating `personas.json` Synchronization

To implement M2 compliance, `db.js` must implement a `syncPersonasJson()` helper that keeps `personas.json` updated with full persona data and their nested `variants` array.

#### Proposed `syncPersonasJson()` Implementation:

```javascript
function syncPersonasJson() {
  const jsonPath = path.join(__dirname, 'personas.json');
  try {
    const personas = db.prepare('SELECT * FROM personas WHERE archived = 0 ORDER BY created_at DESC').all().map(hydratePersona);
    const personasWithVariants = personas.map(p => {
      const variants = db.prepare('SELECT id, pose, clothing, attitude, setting, image_path, created_at FROM persona_variants WHERE persona_id = ? ORDER BY created_at DESC').all(p.id);
      return {
        ...p,
        variants
      };
    });
    fs.writeFileSync(jsonPath, JSON.stringify(personasWithVariants, null, 2), 'utf8');
    console.log(`[db] Synchronized ${personasWithVariants.length} persona(s) with variants to personas.json`);
  } catch (err) {
    console.error('[db] Failed to sync personas.json:', err.message);
  }
}
```

#### Sync Hooks Required:
- After `savePersona(p)` in `db.js`.
- After `saveVariant(v)` in `db.js`.
- After `deleteVariant(id)` in `db.js`.
- After `deletePersona(id)` in `db.js`.
- After `setMainVariant(personaId, imagePath)` in `db.js`.

---

## Architectural Summary Matrix

| Requirement | Current State | Proposed M2 Architecture |
|---|---|---|
| **Image Input & Storage** | Multipart file upload in `POST /api/import-influencer` saved to `assets/references/`, optimized via `sharp`, stored in SQLite `personas` table. `personas.json` only read on initial DB seed. | Keep optimized file pipeline; add `syncPersonasJson()` call on write so `personas.json` reflects SQLite changes in real time. |
| **Initial Variants Trigger** | Manual trigger via `POST /api/personas/:id/variants`. | Automatic trigger of 4 initial variants (2 traditional + 2 spicy) upon creation/import via non-blocking async background worker. |
| **Queue Execution** | `gen-queue.js` exists with gap/cooldown logic, but endpoints `await` variant generation when invoked manually. | Call `genQueue.enqueue()` inside un-awaited background worker to return HTTP 200 instantly while queue runs tasks sequentially in background. |
| **Persistence & Vault** | Variants saved to `persona_variants` table in SQLite (`db.js`). | Dual persistence: save to SQLite `persona_variants` table AND write nested `variants` array to `personas.json`. Vault fetches `/api/personas/:id/variants` or polls queue status. |

---

## Verification & Testing Plan

1. **Verify non-blocking HTTP response**:
   - Send `POST /api/import-influencer` with reference photo.
   - Assert response completes in < 5 seconds with `{ success: true, persona: {...} }`.
2. **Verify background queueing**:
   - Inspect console logs for `[gen-queue] START "variant_..."` messages appearing sequentially after HTTP response has returned.
   - Call `GET /api/status` (or queue status helper) and verify `pendingCount` / `currentTaskInfo`.
3. **Verify SQLite & `personas.json` persistence**:
   - Inspect SQLite database using `SELECT * FROM persona_variants WHERE persona_id = ?`.
   - Inspect `personas.json` file and verify the created persona object contains a populated `variants` array with 4 variant objects.
4. **Verify vault rendering**:
   - Call `GET /api/personas/:id/variants` and verify 4 variant objects returned with valid `image_path` references.
