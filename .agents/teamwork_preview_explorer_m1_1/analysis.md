# Analysis Report: Backend Image Generation & Queue Handling (M1 / F3)

**Project Root**: `c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON`  
**Working Directory**: `c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON\.agents\teamwork_preview_explorer_m1_1`  
**Date**: 2026-07-24  

---

## Executive Summary

This report presents a complete code-level analysis of the image generation pipeline and queue management in `influ-JSON`. The investigation examined `gen-queue.js`, `server.js`, `image-provider.js`, and `ai-service.js`.

**Key Findings:**
1. **Request Routing**: All high-level image generation requests (portraits, traditional variants, spicy variants, and fallback import portraits) pass through `aiService.generateInfluencerImage()`, which wraps job functions using `genQueue.enqueue()`. However, **internal retry loops inside `ai-service.js` bypass queue-managed cooldown periods** by making direct ad-hoc HTTP sub-fetches after short `sleep()` delays (4s/8s/2s).
2. **Current Queue Behavior**: `gen-queue.js` serializes tasks sequentially using a Promise chain and enforces a 10s gap (`MIN_GAP_MS`) and a 30s cooldown (`RATE_LIMIT_COOLDOWN_MS`) after HTTP 429 rate limit responses.
3. **Critical Bugs Identified**:
   - **`ReferenceError` in `ai-service.js` (Line 542)**: When Pollinations fails or returns 429, `ai-service.js` attempts to call `getGenQueueStatusSafe()`, which is **undefined**, causing server crashes/unhandled rejections instead of clean error formatting.
   - **No Task Retry in `gen-queue.js`**: `gen-queue.js` catches 429 errors, updates `lastRateLimitedAt`, and re-throws the error immediately. It does not perform task retries after waiting for the 30-second cooldown window.
   - **Missing Queue Status API Endpoint**: `server.js` does not expose `GET /api/queue-status`.
   - **Incomplete Status Contract**: `genQueue.getStatus()` lacks explicit fields `isCoolingDown` and `cooldownRemainingMs`.

---

## Detailed Findings

### 1. Image Generation Routing & Queue Bypass Analysis

#### Entry Points & Routing Map
- **Portrait Generation (`POST /api/ai/generate-image`)**:
  - `server.js:477-508`: Receives `{ prompt, referenceLocalPath, personaId, generationType }`.
  - Calls `aiService.generateInfluencerImage(prompt, referenceUrl)` (`server.js:489`).
- **Variants (Traditional & Spicy) (`POST /api/personas/:id/variants`)**:
  - `server.js:183-298`: Shared endpoint for traditional (`mode: 'traditional'`) and spicy (`mode: 'spicy'`) variants.
  - Formats options (`photoreal`, `identityLock`, `seed`, `framing`) and calls `aiService.generateInfluencerImage(prompt, referenceUrl, options)` (`server.js:244`).
- **Import Influencer Fallback (`POST /api/import-influencer`)**:
  - `server.js:776-797`: Generates a fallback portrait if no reference photo/URL is provided.
  - Calls `aiService.generateInfluencerImage(genPrompt)` (`server.js:789`).

#### Queue Routing Mechanism (`ai-service.js:360-365`)
```javascript
if (options.skipQueue !== true) {
  const label = options.queueLabel || options.framing || 'image';
  return genQueue.enqueue(label, () =>
    this.generateInfluencerImage(prompt, referenceUrl, { ...options, skipQueue: true })
  );
}
```

#### Queue Bypass & Sub-Fetch Analysis
- **Top-Level Calls**: All top-level calls from `server.js` enter `genQueue.enqueue()` because `options.skipQueue` is undefined.
- **Internal Sub-Fetch Bypass in `ai-service.js:474-501`**:
  - Inside the queued job execution (where `skipQueue: true`), `ai-service.js` invokes `fetchPollinations(referenceUrl)`.
  - If `fetchPollinations` receives HTTP 429 or fails, `ai-service.js` catches the error and executes recursive sub-fetches:
    - Waits 4,000ms, then retries `fetchPollinations(referenceUrl, 0.70)`.
    - If 429 recurs, waits 8,000ms, then retries `fetchPollinations(referenceUrl, 0.65)`.
    - If that fails, waits 2,000ms, then attempts text-only `fetchPollinations(null)`.
  - **Impact**: These internal retries occur inside the single running job. They ignore the required 30,000ms `RATE_LIMIT_COOLDOWN_MS` cooldown window and issue rapid successive HTTP requests directly to Pollinations.

---

### 2. Current Handling of Tasks, Errors, and HTTP 429 Rate Limits in `gen-queue.js`

#### `gen-queue.js` State & Implementation (`gen-queue.js:8-18`)
- `MIN_GAP_MS` = 10,000ms (10 seconds between jobs).
- `RATE_LIMIT_COOLDOWN_MS` = 30,000ms (30 seconds after 429).
- Internal state variables: `chain`, `busy`, `lastJobStartedAt`, `lastJobFinishedAt`, `lastRateLimitedAt`, `queueLength`, `currentLabel`.

#### Execution Flow & 429 Detection (`gen-queue.js:59-105`)
1. Increments `queueLength`.
2. Waits for previous `chain` promise resolution.
3. Checks if currently in 429 cooldown:
   `if (lastRateLimitedAt) { const left = RATE_LIMIT_COOLDOWN_MS - (Date.now() - lastRateLimitedAt); if (left > 0) await sleep(left); }`
4. Checks if minimum gap has elapsed:
   `const sinceFinish = Date.now() - lastJobFinishedAt; if (lastJobFinishedAt && sinceFinish < MIN_GAP_MS) await sleep(MIN_GAP_MS - sinceFinish);`
5. Marks `busy = true`, sets `currentLabel`, records `lastJobStartedAt`.
6. Executes `await jobFn()`.
7. **Error Catch**:
   ```javascript
   catch (err) {
     if (err && (err.status === 429 || /429|rate limit|límite/i.test(err.message || ''))) {
       markRateLimited();
     }
     throw err;
   }
   ```
8. **Finally**: Resets `busy = false`, `currentLabel = null`, updates `lastJobFinishedAt`.

#### Identified Weaknesses
1. **Immediate Task Rejection (No Queue-Level Retries)**: `gen-queue.js` does not retry jobs upon failure. When 429 occurs, it calls `markRateLimited()` and re-throws `err` immediately to `server.js`.
2. **Undefined Function Bug in `ai-service.js:542`**:
   - Line 542 of `ai-service.js`: `const status = getGenQueueStatusSafe();`
   - `getGenQueueStatusSafe` is **not defined** anywhere in `ai-service.js` or imported modules.
   - When Pollinations returns 429 or throws an error, line 542 triggers `ReferenceError: getGenQueueStatusSafe is not defined`, crashing the endpoint promise before proper error response formatting can occur.
3. **Queue Length Decrement Timing (`gen-queue.js:62`)**:
   - `queueLength` is decremented as soon as the task starts (`queueLength = Math.max(0, queueLength - 1)`). Consequently, `queueLength` counts only waiting items in queue, excluding the active running task.

---

### 3. Management of `RATE_LIMIT_COOLDOWN_MS`, Retry Logic & Cooldown Status Updating

#### Cooldown Duration Management
- Standard cooldown duration: `RATE_LIMIT_COOLDOWN_MS` = 30,000ms (30 seconds).
- Trigger: HTTP status 429 from Pollinations.

#### Retry Strategy Requirements
- **Remove Ad-hoc Sub-Retries**: Remove the 4s/8s/2s inline `sleep()` retries in `ai-service.js:478-500`.
- **Queue-Level Cooldown & Retry**:
  - When Pollinations returns 429, `genQueue.markRateLimited()` is recorded (`lastRateLimitedAt = Date.now()`).
  - If a task retry policy is enabled (e.g. 1 retry per task), the queue must delay the retry attempt by full `RATE_LIMIT_COOLDOWN_MS` (30s) or defer it until `isCoolingDown` becomes `false`.

#### Queue Status Data Model Updates
`genQueue.getStatus()` currently returns (`gen-queue.js:23-44`):
```javascript
{
  busy,
  queueLength,
  currentLabel,
  minGapMs: MIN_GAP_MS,
  rateLimitCooldownMs: RATE_LIMIT_COOLDOWN_MS,
  lastRateLimitedAt: lastRateLimitedAt || null,
  rateLimitActive: !!in429Cooldown,
  retryAfterSeconds: in429Cooldown ? Math.ceil(...) : ...
}
```

To support frontend requirements and status indicators, `genQueue.getStatus()` should be updated to explicitly include:
- `isCoolingDown`: `Boolean(lastRateLimitedAt && (Date.now() - lastRateLimitedAt < RATE_LIMIT_COOLDOWN_MS))`
- `cooldownRemainingMs`: `Math.max(0, RATE_LIMIT_COOLDOWN_MS - (Date.now() - lastRateLimitedAt))`

---

### 4. `genQueue.getStatus()` Structure & `GET /api/queue-status` Specification

#### Current `genQueue.getStatus()` Output Object
```json
{
  "busy": false,
  "queueLength": 0,
  "currentLabel": null,
  "minGapMs": 10000,
  "rateLimitCooldownMs": 30000,
  "lastRateLimitedAt": null,
  "rateLimitActive": false,
  "retryAfterSeconds": 0
}
```

#### Endpoint Gap Analysis
- `server.js` currently defines `GET /api/status` (lines 97-117), which provides Gemini connection state, DB path, and `imageProvider` capabilities.
- **`GET /api/queue-status` is completely missing from `server.js`**.

#### `GET /api/queue-status` Proposed Specification
- **Route**: `GET /api/queue-status`
- **Auth**: Protected via `authService.requireAuth` (or public if required for state polling).
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "status": {
    "busy": false,
    "queueLength": 0,
    "currentLabel": null,
    "isCoolingDown": false,
    "cooldownRemainingMs": 0,
    "minGapMs": 10000,
    "rateLimitCooldownMs": 30000,
    "lastRateLimitedAt": null,
    "rateLimitActive": false,
    "retryAfterSeconds": 0
  }
}
```

---

## Actionable Recommendations for Implementation Agent (M1)

1. **Fix `ReferenceError` in `ai-service.js`**:
   - Replace `const status = getGenQueueStatusSafe();` at `ai-service.js:542` with `const status = genQueue.getStatus();`.
2. **Expose `GET /api/queue-status` in `server.js`**:
   - Add endpoint returning `{ success: true, status: genQueue.getStatus() }`.
3. **Update `genQueue.getStatus()` Schema**:
   - Add `isCoolingDown` and `cooldownRemainingMs` to returned object in `gen-queue.js`.
4. **Refactor Internal Retries in `ai-service.js`**:
   - Remove ad-hoc short `sleep(4000)`/`sleep(8000)` retries inside `fetchPollinations` catch blocks. Allow 429 errors to trigger 30s cooldown properly.
5. **Implement Queue Task Retry Logic**:
   - Enhance `gen-queue.js` or task wrapper to handle 429 retries with full 30s cooldown wait.
