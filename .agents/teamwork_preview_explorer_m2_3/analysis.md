# Milestone 2 (M2) — Test Suite & Verification Mechanism Analysis Report

## Executive Summary

This report defines the comprehensive automated test suite and verification mechanisms for **Milestone 2 (M2: Multi-Image Import & Background Variants)** of the `influ-JSON` project. 

The analysis focuses on verifying four critical pillars of M2:
1. **Automated Test Architecture**: Integrating `test/import-variants.test.js` using Node.js native test runner (`node --test`) and standard library modules (`node:test`, `node:assert/strict`).
2. **Multi-Image Import Payload Parsing**: Testing HTTP `multipart/form-data` parsing for up to 4 images, error handling when exceeding 4 images, and fallback mechanisms when no reference images are provided.
3. **Background Variant Generation & Dual Persistence**: Testing asynchronous enqueueing of 4 background variants (2 traditional + 2 spicy) and verifying dual persistence across SQLite (`persona_variants` table) and `personas.json`.
4. **Non-Blocking Fast Response Verification**: Verifying that `POST /api/import-influencer` responds immediately (<1000ms) while variant tasks process asynchronously in `gen-queue.js`.

---

## 1. Node Native Test Runner Setup (`test/import-variants.test.js`)

### 1.1 Test Runner Integration
The project configures native testing in `package.json`:
```json
"scripts": {
  "test": "node --test test/*.test.js"
}
```
Creating `test/import-variants.test.js` automatically integrates into `npm test` without requiring external test runners like Jest or Mocha.

### 1.2 HTTP Server Lifecycle & Test Isolation
Tests must launch an isolated HTTP server using Express `app` from `../server`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const path = require('path');

const app = require('../server');
const dbService = require('../db');
const genQueue = require('../gen-queue');
const aiService = require('../ai-service');

let server, port, baseUrl;

test.before(async () => {
  // Fast queue timing overrides for automated tests
  process.env.GEN_MIN_GAP_MS = '10';
  process.env.GEN_429_COOLDOWN_MS = '50';

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});
```

### 1.3 Offline Mocking Strategy for Fast & Deterministic Execution
To prevent network requests to Pollinations/Gemini and avoid rate limits during automated testing:
- **`aiService.generateInfluencerImage`**: Stubbed to return synthetic image paths instantly (`assets/generated/mock_variant_x.jpg`).
- **`aiService.generateWithGeminiMulti`**: Stubbed to return a valid structured persona analysis object.
- **`aiService.uploadToTmpFiles`**: Stubbed to resolve instantly.

### 1.4 Database & File Cleanup
Each test case must clean up created test personas, variants, and references in `test.afterEach` or via explicit cleanup calls:
```javascript
const createdPersonaIds = [];

test.afterEach(() => {
  while (createdPersonaIds.length > 0) {
    const id = createdPersonaIds.pop();
    try {
      dbService.deletePersona(id);
    } catch (_) {}
  }
});
```

---

## 2. Multi-Image Import Payload Parsing Verification

### 2.1 Multipart Payload Requirements
The endpoint `POST /api/import-influencer` uses Multer:
```javascript
upload.array('photo', 4)
```
It accepts:
- Multipart file attachments under the field key `'photo'` (1 to 4 files).
- Text fields: `name`, `gender`, `age`, `ethnicity`, `scriptTopic`, `imageUrl`.

### 2.2 Constructing Test Payloads with Node `FormData` & `Blob`
In Node.js 18+, native `FormData` and `Blob` are globally available:
```javascript
function createMockImageBlob(filename = 'test.jpg') {
  // Minimal valid JPEG binary buffer
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);
  return new Blob([jpegHeader], { type: 'image/jpeg' });
}
```

### 2.3 Required Multi-Image Test Cases

#### Test Case 2.1: Valid Multi-Image Upload (4 Photos)
- **Input**: `FormData` with 4 attached image blobs under field `'photo'`.
- **Expected Outcome**:
  - HTTP Status: `200 OK`
  - Response JSON: `{ success: true, persona: { id, name, image, ... } }`
  - Primary reference image (`persona.image`) is set to the first optimized reference (`assets/references/ref_...`).
  - Persona correctly saved in SQLite database.

#### Test Case 2.2: Limit Enforcement Exceeded (5 Photos)
- **Input**: `FormData` with 5 attached image blobs under field `'photo'`.
- **Expected Outcome**:
  - Multer catches limit breach and triggers error handler in `server.js` (line 1050).
  - HTTP Status: `400 Bad Request`
  - Response JSON: `{ success: false, message: 'Has excedido el límite máximo de fotos (máximo 4 fotos).' }`
  - No persona is created in DB.

#### Test Case 2.3: Zero Images Fallback Generation
- **Input**: `FormData` with no attached photos and empty `imageUrl`.
- **Expected Outcome**:
  - HTTP Status: `200 OK`
  - Server invokes fallback image generation or avatar fallback (`assets/influencer_female.png`).
  - Response contains created persona with fallback image path.

---

## 3. Background Variant Generation & Dual Persistence Verification

### 3.1 Variant Generation Specification
When a persona is imported or created, 4 initial background variants must be queued:
- **2 Traditional Variants**:
  1. `pose: "casual lifestyle"`, `clothing: "casual outfit"`, `setting: "home living room"`, `mode: "traditional"`
  2. `pose: "coffeeshop portrait"`, `clothing: "smart casual outfit"`, `setting: "café window"`, `mode: "traditional"`
- **2 Spicy Variants**:
  3. `pose: "sunlit beach"`, `clothing: "bikini / swimwear"`, `setting: "tropical ocean background"`, `mode: "spicy"`
  4. `pose: "fitness studio"`, `clothing: "activewear / catsuit"`, `setting: "modern gym"`, `mode: "spicy"`

### 3.2 Verification Flow & Async Queue Completion Helper
Because variant generation is queued in `gen-queue.js`, tests must wait for queue processing before asserting DB and JSON file states:

```javascript
async function waitForQueueCompletion(maxWaitMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = genQueue.getStatus();
    if (!status.active && status.pendingCount === 0) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`Queue did not complete within ${maxWaitMs}ms`);
}
```

### 3.3 Verifying SQLite Persistence (`persona_variants` Table)
Query variants using `dbService.getVariantsForPersona(persona.id)`:
- Assert `variants.length === 4`.
- Assert 2 variants have traditional parameters and 2 variants have spicy parameters.
- Assert each variant object contains `id`, `persona_id`, `pose`, `clothing`, `setting`, `image_path`, and `created_at`.

### 3.4 Verifying `personas.json` Dual Persistence
Read `personas.json` at project root:
- Parse `personas.json` array.
- Locate the persona by `id`.
- Assert persona exists in `personas.json`.
- Assert `targetPersona.variants` is an array of length 4 matching the SQLite records.

---

## 4. Instant Response & Asynchronous Queue Timing Verification

### 4.1 Requirement Rationale
Generating 4 AI images synchronously during HTTP request handling takes 10 to 40+ seconds, causing HTTP connection timeouts and freezing the web studio UI. The `/api/import-influencer` endpoint MUST perform initial reference processing, create the persona record, queue the 4 background variants, and return immediately (<1000ms).

### 4.2 Response Time & Non-Blocking Queue Assertions
In `test/import-variants.test.js`:

```javascript
test('POST /api/import-influencer responds immediately (<1000ms) while queuing background variants', async (t) => {
  const formData = new FormData();
  formData.append('name', 'FastResponse Test Persona');
  formData.append('gender', 'Female');
  formData.append('photo', createMockImageBlob('photo1.jpg'), 'photo1.jpg');

  const startTime = Date.now();
  const res = await fetch(`${baseUrl}/api/import-influencer`, {
    method: 'POST',
    body: formData
  });
  const duration = Date.now() - startTime;
  const data = await res.json();

  // 1. Verify HTTP status and immediate response timing
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(duration < 1000, `Endpoint took ${duration}ms, expected < 1000ms`);
  createdPersonaIds.push(data.persona.id);

  // 2. Verify queue has background tasks active or pending immediately after response
  const queueStatus = genQueue.getStatus();
  assert.ok(queueStatus.active || queueStatus.pendingCount > 0, 'Background queue should have active/pending tasks immediately after import response');

  // 3. Wait for background queue completion
  await waitForQueueCompletion();

  // 4. Verify variants were persisted after queue drain
  const variants = dbService.getVariantsForPersona(data.persona.id);
  assert.equal(variants.length, 4);
});
```

---

## 5. Blueprint: Complete Test Suite Code (`test/import-variants.test.js`)

Below is the complete reference implementation structure for `test/import-variants.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const path = require('path');

const app = require('../server');
const dbService = require('../db');
const genQueue = require('../gen-queue');
const aiService = require('../ai-service');

let server, port, baseUrl;
const createdPersonaIds = [];

// Helper to construct mock image blobs for FormData
function createMockImageBlob(filename = 'test.jpg') {
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);
  return new Blob([jpegHeader], { type: 'image/jpeg' });
}

// Queue completion helper
async function waitForQueueCompletion(maxWaitMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = genQueue.getStatus();
    if (!status.active && status.pendingCount === 0) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`Queue did not complete within ${maxWaitMs}ms`);
}

// Preserve original functions for restoration after tests
const origGenerateImage = aiService.generateInfluencerImage;
const origGenerateMulti = aiService.generateWithGeminiMulti;

test.before(async () => {
  process.env.GEN_MIN_GAP_MS = '10';
  process.env.GEN_429_COOLDOWN_MS = '50';

  // Mock AI generation for fast offline tests
  let genCounter = 0;
  aiService.generateInfluencerImage = async (prompt, refUrl, options) => {
    genCounter++;
    return `assets/generated/mock_variant_${genCounter}.jpg`;
  };

  aiService.generateWithGeminiMulti = async (imagePaths) => {
    return {
      identity: { name: 'Test Persona', gender: 'Female', apparent_age: '25 años', ethnicity_appearance: 'Latina' },
      body: { body_type: 'Atlético' },
      facial_features: { skin_tone: 'Piel clara', skin_tone_hex: '#f0d5c0' },
      hair: { color: 'Castaño Oscuro', length: 'largo', texture: 'ondulado' },
      aesthetic: { overall_vibe: 'casual chic' },
      photography: { camera_lens: '24mm', lighting_type: 'luz natural', background_setting: 'studio' },
      clothing: { type: 'camiseta' }
    };
  };

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  // Restore original services
  aiService.generateInfluencerImage = origGenerateImage;
  aiService.generateWithGeminiMulti = origGenerateMulti;

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.afterEach(() => {
  while (createdPersonaIds.length > 0) {
    const id = createdPersonaIds.pop();
    try {
      dbService.deletePersona(id);
    } catch (_) {}
  }
});

test('1. Multi-image import: parses up to 4 images payload correctly', async () => {
  const formData = new FormData();
  formData.append('name', 'MultiImage 4 Photo Persona');
  formData.append('gender', 'Female');
  formData.append('photo', createMockImageBlob('photo1.jpg'), 'photo1.jpg');
  formData.append('photo', createMockImageBlob('photo2.jpg'), 'photo2.jpg');
  formData.append('photo', createMockImageBlob('photo3.jpg'), 'photo3.jpg');
  formData.append('photo', createMockImageBlob('photo4.jpg'), 'photo4.jpg');

  const res = await fetch(`${baseUrl}/api/import-influencer`, { method: 'POST', body: formData });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.persona && data.persona.id);
  createdPersonaIds.push(data.persona.id);

  assert.equal(data.persona.name, 'MultiImage 4 Photo Persona');
  assert.ok(data.persona.image.startsWith('assets/references/'));
});

test('2. Multi-image import: rejects payloads exceeding 4 images with 400 Bad Request', async () => {
  const formData = new FormData();
  formData.append('name', 'OverLimit Persona');
  for (let i = 1; i <= 5; i++) {
    formData.append('photo', createMockImageBlob(`photo${i}.jpg`), `photo${i}.jpg`);
  }

  const res = await fetch(`${baseUrl}/api/import-influencer`, { method: 'POST', body: formData });
  const data = await res.json();

  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.match(data.message, /máximo 4 fotos/i);
});

test('3. Instant HTTP response (<1000ms) and background variant queuing', async () => {
  const formData = new FormData();
  formData.append('name', 'Async Fast Response Persona');
  formData.append('photo', createMockImageBlob('photo1.jpg'), 'photo1.jpg');

  const start = Date.now();
  const res = await fetch(`${baseUrl}/api/import-influencer`, { method: 'POST', body: formData });
  const duration = Date.now() - start;
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(duration < 1000, `Endpoint took ${duration}ms, expected < 1000ms`);
  createdPersonaIds.push(data.persona.id);

  // Queue should be active/pending immediately after response
  const qStatus = genQueue.getStatus();
  assert.ok(qStatus.active || qStatus.pendingCount > 0);

  // Wait for queue processing
  await waitForQueueCompletion();
});

test('4. Dual persistence: background variants saved in SQLite and personas.json', async () => {
  const formData = new FormData();
  formData.append('name', 'Dual Persistence Persona');
  formData.append('photo', createMockImageBlob('photo1.jpg'), 'photo1.jpg');

  const res = await fetch(`${baseUrl}/api/import-influencer`, { method: 'POST', body: formData });
  const data = await res.json();
  const personaId = data.persona.id;
  createdPersonaIds.push(personaId);

  await waitForQueueCompletion();

  // 1. Verify SQLite
  const sqliteVariants = dbService.getVariantsForPersona(personaId);
  assert.equal(sqliteVariants.length, 4);

  // 2. Verify personas.json
  const jsonPath = path.join(__dirname, '../personas.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const personas = JSON.parse(raw);
    const pInJson = personas.find((p) => p.id === personaId);
    assert.ok(pInJson, 'Persona should exist in personas.json');
    assert.ok(Array.isArray(pInJson.variants), 'variants should be an array in personas.json');
    assert.equal(pInJson.variants.length, 4, 'personas.json should contain 4 variants');
  }
});
```

---

## 6. Verification Summary Checklist for Implementers

| Area | Verification Mechanism | Target File | Expected Result |
|---|---|---|---|
| **Test Runner** | `npm test` (`node --test`) | `test/import-variants.test.js` | All test cases pass cleanly without external dependencies. |
| **Payload Parsing** | `upload.array('photo', 4)` | `server.js` (`POST /api/import-influencer`) | Accepts 1–4 photos; rejects 5 photos with 400 Bad Request. |
| **Response Latency** | `Date.now()` timer in HTTP test | `server.js` (`POST /api/import-influencer`) | HTTP response returned in <1000ms. |
| **Background Queue** | `genQueue.enqueue()` | `gen-queue.js` | 4 variant jobs (2 traditional + 2 spicy) queued sequentially. |
| **SQLite Persistence** | `dbService.getVariantsForPersona(id)` | `db.js` (`persona_variants` table) | 4 variant rows inserted with pose/clothing/setting/image_path. |
| **`personas.json` Sync** | `fs.readFileSync('personas.json')` | `personas.json` | `personas.json` updated with persona object & 4 nested variants. |

