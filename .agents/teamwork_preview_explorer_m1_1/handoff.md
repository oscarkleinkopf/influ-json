# Handoff Report — M1: F3 Global Queue System & Rate Limit Handling Analysis

**Agent Role**: Explorer  
**Working Directory**: `c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON\.agents\teamwork_preview_explorer_m1_1`  
**Date**: 2026-07-24  

---

## 1. Observation

Direct code inspection of `gen-queue.js`, `server.js`, `image-provider.js`, and `ai-service.js` revealed the following exact line-level observations:

1. **`ai-service.js` Queue Wrapping (`ai-service.js:360-365`)**:
   ```javascript
   if (options.skipQueue !== true) {
     const label = options.queueLabel || options.framing || 'image';
     return genQueue.enqueue(label, () =>
       this.generateInfluencerImage(prompt, referenceUrl, { ...options, skipQueue: true })
     );
   }
   ```
   *Observation*: High-level requests pass through `genQueue.enqueue()`.

2. **Internal Sub-Fetch Retry Loops in `ai-service.js:478-500`**:
   ```javascript
   console.warn(`Pollinations img2img failed (${refErr.message}), waiting ${waitMs}ms then retry...`);
   await sleep(waitMs);
   // ...
   console.warn('Pollinations rate limited (429). Waiting 8s for final attempt...');
   await sleep(8000);
   ```
   *Observation*: Internal `sleep(4000)`, `sleep(8000)`, `sleep(2000)` retry attempts bypass the 30-second `RATE_LIMIT_COOLDOWN_MS` cooldown manager in `gen-queue.js`.

3. **`ReferenceError` Bug in `ai-service.js:542`**:
   ```javascript
   const status = getGenQueueStatusSafe();
   ```
   *Observation*: `getGenQueueStatusSafe()` is **not defined** anywhere in `ai-service.js` or in imported dependencies, causing a runtime `ReferenceError` when generation fails or triggers rate limits.

4. **Queue Mechanics & Error Catching in `gen-queue.js:89-93`**:
   ```javascript
   } catch (err) {
     if (err && (err.status === 429 || /429|rate limit|límite/i.test(err.message || ''))) {
       markRateLimited();
     }
     throw err;
   }
   ```
   *Observation*: `gen-queue.js` records rate limit timestamps via `markRateLimited()`, but immediately re-throws the error to the caller without attempting task retries after cooldown.

5. **Current `getStatus()` in `gen-queue.js:23-44`**:
   ```javascript
   function getStatus() {
     const now = Date.now();
     const since429 = lastRateLimitedAt ? now - lastRateLimitedAt : null;
     const in429Cooldown = lastRateLimitedAt && since429 < RATE_LIMIT_COOLDOWN_MS;
     const gapLeft = Math.max(0, MIN_GAP_MS - (now - lastJobFinishedAt));
     return {
       busy,
       queueLength,
       currentLabel,
       minGapMs: MIN_GAP_MS,
       rateLimitCooldownMs: RATE_LIMIT_COOLDOWN_MS,
       lastRateLimitedAt: lastRateLimitedAt || null,
       rateLimitActive: !!in429Cooldown,
       retryAfterSeconds: in429Cooldown
         ? Math.ceil((RATE_LIMIT_COOLDOWN_MS - since429) / 1000)
         : busy
           ? null
           : gapLeft > 0
             ? Math.ceil(gapLeft / 1000)
             : 0
     };
   }
   ```
   *Observation*: Returns `rateLimitActive` and `retryAfterSeconds`, but does not provide explicit `isCoolingDown` or `cooldownRemainingMs` properties.

6. **Missing Queue Endpoint in `server.js`**:
   - `server.js` defines `GET /api/status` (lines 97-117), but does **NOT** define `GET /api/queue-status`.

---

## 2. Logic Chain

1. **Routing Analysis**:
   - From Observation 1, `POST /api/ai/generate-image` (`server.js:477`), `POST /api/personas/:id/variants` (`server.js:183`), and fallback portrait gen in `POST /api/import-influencer` (`server.js:776`) all invoke `aiService.generateInfluencerImage()`.
   - Since initial calls omit `options.skipQueue`, they trigger `genQueue.enqueue()`. Thus, top-level API requests do not bypass `gen-queue.js`.
   - However, from Observation 2, once inside `aiService.generateInfluencerImage()`, failed HTTP requests trigger internal ad-hoc retries with short sleep intervals (4s, 8s, 2s). Because these retries occur within the active queue job function, they execute direct HTTP fetches while ignoring the global 30-second cooldown window.

2. **Error & 429 Handling Analysis**:
   - From Observation 4, when Pollinations returns HTTP 429, `genQueue.markRateLimited()` sets `lastRateLimitedAt = Date.now()`.
   - `gen-queue.js` enforces cooldown on *subsequent* enqueued jobs (`gen-queue.js:65-71`), but does *not* retry the failed job itself.
   - From Observation 3, when a job fails in `ai-service.js`, the catch block attempts to invoke `getGenQueueStatusSafe()`. Because `getGenQueueStatusSafe()` is undefined, JS execution throws a `ReferenceError`, bypassing clean status calculation and error response generation.

3. **Rate Limit Cooldown & Status Requirements**:
   - From Observation 5, `getStatus()` exposes raw timing metrics and boolean flags, but lacks standard properties `isCoolingDown` and `cooldownRemainingMs`.
   - Standardizing `isCoolingDown: Boolean(lastRateLimitedAt && (now - lastRateLimitedAt < RATE_LIMIT_COOLDOWN_MS))` and `cooldownRemainingMs: Math.max(0, RATE_LIMIT_COOLDOWN_MS - (now - lastRateLimitedAt))` resolves ambiguity for client-side state managers.

4. **Queue Status Endpoint Requirement**:
   - From Observation 6, `server.js` lacks an endpoint serving queue status. Creating `GET /api/queue-status` returning `{ success: true, status: genQueue.getStatus() }` is required for frontend monitoring.

---

## 3. Caveats

- **External Provider Dynamics**: Pollinations behavior (e.g. rate limit thresholds and headers) can fluctuate externally. Analysis is based on local HTTP error handling code (HTTP 429 status checks).
- **Read-Only Investigation**: No backend code changes were executed during this investigation, per Explorer agent identity constraints.
- **Frontend Integration**: Frontend `app.js` currently polls `/api/status` but does not yet call `/api/queue-status` or render `cooldownRemainingMs`.

---

## 4. Conclusion

The backend image generation queue infrastructure (`gen-queue.js`) provides solid fundamental serialization and gap management (`MIN_GAP_MS` = 10s, `RATE_LIMIT_COOLDOWN_MS` = 30s). However, four actionable defects must be addressed in Milestone 1 implementation:

1. Fix `ReferenceError` at `ai-service.js:542` (`getGenQueueStatusSafe()` -> `genQueue.getStatus()`).
2. Implement `GET /api/queue-status` endpoint in `server.js`.
3. Standardize `genQueue.getStatus()` to expose `isCoolingDown` and `cooldownRemainingMs`.
4. Refactor `ai-service.js` internal retries so 429 errors trigger 30-second queue-managed cooldowns instead of inline short sleep retries.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify `ReferenceError` Bug**:
   - Inspect `ai-service.js` line 542: `grep -n "getGenQueueStatusSafe" ai-service.js`.
   - Confirm it is not declared anywhere in `ai-service.js` or `gen-queue.js`.

2. **Verify Missing Endpoint**:
   - Inspect `server.js`: `grep -n "queue-status" server.js`.
   - Confirm zero occurrences.

3. **Verify Internal Retry Sub-Fetches**:
   - Inspect `ai-service.js` lines 474–501.
   - Observe `sleep(4000)`, `sleep(8000)`, `sleep(2000)` retries inside `fetchPollinations` catch block.

4. **Verify `getStatus()` Schema**:
   - Inspect `gen-queue.js` lines 23–44.
   - Confirm missing `isCoolingDown` and `cooldownRemainingMs` keys.
