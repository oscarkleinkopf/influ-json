# Code Changes — Milestone 1 (M1: F3 Global Queue System & Rate Limit Handling)

## Summary of Changes

### 1. `gen-queue.js`
- **Dynamic Timing & Schema**:
  - Refactored `MIN_GAP_MS` and `RATE_LIMIT_COOLDOWN_MS` to evaluate dynamically via `getMinGapMs()` and `getCooldownMs()` to support configurable process environment settings in test and production.
  - Enhanced `genQueue.getStatus()` to return `{ active, pendingCount, isCoolingDown, cooldownRemainingMs, currentTaskInfo }` along with existing legacy status fields (`busy`, `queueLength`, `currentLabel`, `minGapMs`, `rateLimitCooldownMs`, `lastRateLimitedAt`, `rateLimitActive`, `retryAfterSeconds`).
- **Automatic Task Retry on HTTP 429**:
  - Wrapped `jobFn()` execution inside `enqueue()` with an automatic retry loop (up to 2 retries).
  - On HTTP 429 errors (`err.status === 429` or matching `/429|rate limit|límite/i`), `genQueue` calls `markRateLimited()`, waits `RATE_LIMIT_COOLDOWN_MS` (30000ms by default), and retries the job.

### 2. `ai-service.js`
- **Fixed `ReferenceError`**:
  - Defined `getGenQueueStatusSafe()` helper function at module level to safely access `genQueue.getStatus()`, eliminating runtime `ReferenceError` at line 542.
- **Removed Ad-Hoc 429 Retry Loops**:
  - Removed short inline sleep loops (`sleep(4000)`, `sleep(8000)`, `sleep(6000)`) in `fetchPollinations` error catch blocks.
  - HTTP 429 errors are now thrown directly to `genQueue`, allowing `genQueue` to manage rate-limit cooldowns and task retries cleanly.

### 3. `server.js`
- **Queue Status API Endpoint**:
  - Imported `genQueue` module.
  - Added route `GET /api/queue-status` returning `{ success: true, queue: genQueue.getStatus() }`.
- **Export App for Testing**:
  - Wrapped `app.listen()` call in `if (require.main === module)` and exported `module.exports = app` for isolated automated testing.

### 4. `app.js`
- **QueuePoller Singleton**:
  - Implemented `QueuePoller` singleton managing periodic polling (`GET /api/queue-status`) during image generation.
  - Exposed `window.QueuePoller` for global access and testing.
  - Displays dynamic notifications via `showAppToast`:
    - Cooldown: `"Servidor congestionado, enfriando X seg..."`
    - Position: `"Encolado (Posición N)"` or `"Generando imagen..."`
  - Updates card status text `#variantGenStatusText` and `#ugcGenStatusText`.
- **Trigger Integration**:
  - Connected `QueuePoller.start()` to image generation functions: `savePersonaAction`, `generateAIImageAction`, `saveAnalysisAsPersona`, `generateVariantAction`, `importInfluencerAction`.

### 5. `package.json`
- **Test Script**:
  - Added `"test": "node --test test/*.test.js"` script.

### 6. Test Suite (`test/gen-queue.test.js`, `test/api-queue.test.js`)
- **`test/gen-queue.test.js`**: Unit tests verifying status schema, FIFO task serialization, 429 rate limit cooldown tracking, and automatic task retry.
- **`test/api-queue.test.js`**: Integration tests verifying `GET /api/queue-status` HTTP 200 response and JSON payload structure.
