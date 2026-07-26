# M1 Test Suite & Verification Analysis Report
**Milestone**: M1 (F3 Global Queue System & Rate Limit Handling)  
**Agent**: Explorer (`teamwork_preview_explorer_m1_3`)  
**Date**: 2026-07-24  

---

## Executive Summary

This report presents a complete analysis of the test suite and verification mechanisms for Milestone 1 (F3 Global Queue System & Rate Limit Handling) of **influ-JSON**.

Key Findings:
1. **Existing Automated Tests**: The project currently has **no test runner or automated test scripts** configured in `package.json` (only `"start": "node server.js"` and `"dev": "node server.js"`), and no third-party test dependencies (like Jest or Mocha) installed. However, modern Node.js (v18+) includes a native test framework (`node:test` and `node:assert`) which allows running zero-dependency, high-speed automated unit and integration tests without adding external npm packages.
2. **`gen-queue.js` Unit Testing**: Queue FIFO serialization, queue length reporting (`getStatus()`), 429 rate limit detection (`markRateLimited()`), and 30-second cooldown handling can be deterministically unit tested by mocking job execution delays and overriding environment variables (`GEN_MIN_GAP_MS` and `GEN_429_COOLDOWN_MS`) during testing.
3. **`GET /api/queue-status` Verification**: Currently, `server.js` does not expose `GET /api/queue-status`. Implementing this endpoint to return `{ success: true, queue: genQueue.getStatus() }` will allow automated HTTP endpoint verification via native `fetch` or HTTP client tests against a local test server instance.
4. **Concurrent Request & Offline Testing**: Concurrent client requests can be tested without hitting Pollinations servers or relying on active network connections by using mock job functions and overriding `globalThis.fetch` in test hooks to return simulated HTTP 200 (image data) and HTTP 429 (Rate Limit Exceeded) responses.

---

## 1. Existing Automated Tests in the Project

### Current Project State
- **`package.json` Inspection**:
  - `scripts`: Only `"start": "node server.js"` and `"dev": "node server.js"`.
  - `dependencies`: `@google/generative-ai`, `archiver`, `better-sqlite3`, `dotenv`, `express`, `express-session`, `multer`, `sharp`, `uuid`.
  - `devDependencies`: None defined.
- **File System Inspection**:
  - No `test/` or `tests/` directory exists in the project root.
  - No existing unit or integration test files (`*.test.js` or `*.spec.js`) are present outside `node_modules/`.

### Recommended Native Test Runner Setup
To adhere to the project philosophy ("Cero costo primero", lightweight, zero external friction), we leverage **Node.js Native Test Runner (`node:test` & `node:assert`)**:
- Zero additional npm dependencies required.
- Standard execution via `node --test` command.
- Native support for async/await, test suites (`describe`/`it`), lifecycle hooks (`before`/`afterEach`), and mock timers/spies.
- Can be added to `package.json` as `"test": "node --test test/*.test.js"`.

---

## 2. Unit Testing `gen-queue.js`

### Targeted Functionality in `gen-queue.js`
- `enqueue(label, jobFn)`: Serializes execution via a Promise chain.
- `getStatus()`: Returns active state (`busy`, `queueLength`, `currentLabel`, `minGapMs`, `rateLimitCooldownMs`, `rateLimitActive`, `retryAfterSeconds`).
- `markRateLimited()`: Records `lastRateLimitedAt = Date.now()` and initiates the 30-second cooldown window.

### Test Scenarios & Test Methodology

#### Scenario A: First-In, First-Out (FIFO) Serialization
- **Goal**: Verify multiple concurrent `enqueue()` calls execute strictly in sequence.
- **Method**:
  1. Enqueue 3 asynchronous tasks with execution timers (e.g. 50ms delay each).
  2. Push execution markers into an array upon start and completion of each task.
  3. Await `Promise.all([enqueue('job1', task1), enqueue('job2', task2), enqueue('job3', task3)])`.
  4. Assert array order is `['start-job1', 'end-job1', 'start-job2', 'end-job2', 'start-job3', 'end-job3']`.

#### Scenario B: Real-time Queue Position & Status Reporting (`getStatus()`)
- **Goal**: Verify `getStatus()` accurately reports queue length, busy state, and active label during execution.
- **Method**:
  1. Set `GEN_MIN_GAP_MS=0` for test isolation.
  2. Enqueue Job 1 (long running, 100ms) and Job 2 (queued behind Job 1).
  3. While Job 1 is running, invoke `getStatus()`:
     - Assert `status.busy === true`.
     - Assert `status.currentLabel === 'job1'`.
     - Assert `status.queueLength === 1` (since Job 2 is waiting in queue).
  4. After both jobs complete:
     - Assert `status.busy === false`.
     - Assert `status.currentLabel === null`.
     - Assert `status.queueLength === 0`.

#### Scenario C: HTTP 429 Rate Limit Cooldown & Detection
- **Goal**: Verify that when a job throws an HTTP 429 error, `markRateLimited()` is invoked, `rateLimitActive` becomes `true`, and subsequent enqueued jobs wait out the cooldown period.
- **Method**:
  1. Set `process.env.GEN_429_COOLDOWN_MS = '200'` (override 30s to 200ms for fast test execution).
  2. Enqueue Job 1 which throws an error with `err.status = 429`.
  3. Catch the expected rejection for Job 1.
  4. Call `getStatus()` immediately after Job 1 rejection:
     - Assert `status.rateLimitActive === true`.
     - Assert `status.retryAfterSeconds > 0`.
  5. Enqueue Job 2 immediately after Job 1 fails.
  6. Measure start time of Job 2: verify Job 2 start time is delayed by at least ~200ms.

---

## 3. Verifying `GET /api/queue-status` Endpoint

### Current Gap
`server.js` currently does not expose the `GET /api/queue-status` endpoint.

### Proposed Endpoint Code in `server.js`
```javascript
const genQueue = require('./gen-queue');

// F3: Global queue status endpoint for client UI polling & monitoring
app.get('/api/queue-status', (req, res) => {
  res.json({
    success: true,
    queue: genQueue.getStatus()
  });
});
```

### Automated HTTP Verification Strategy
Using `node:test` and native `fetch`:
1. In test setup (`before`), start Express app on ephemeral port (`server.listen(0)`).
2. Issue HTTP GET request to `http://localhost:<port>/api/queue-status`.
3. Validate HTTP status code `200`.
4. Validate JSON payload structure:
   ```json
   {
     "success": true,
     "queue": {
       "busy": false,
       "queueLength": 0,
       "currentLabel": null,
       "minGapMs": 10000,
       "rateLimitCooldownMs": 30000,
       "lastRateLimitedAt": null,
       "rateLimitActive": false,
       "retryAfterSeconds": 0
     }
   }
   ```
5. In test teardown (`after`), close the server instance (`server.close()`).

---

## 4. Offline & Network-Mocking Strategy for Concurrent Requests

### Principles
- **No Live Network Dependence**: Tests must run without network access, preventing 429 rate limit triggers on external Pollinations services and ensuring fast, reproducible execution (< 2 seconds total).

### Mocking Approaches

#### Approach A: Unit Level Job Function Mocking
Mock job functions return resolved Promises with synthetic image metadata or delayed rejections:
```javascript
const createMockJob = (delayMs, failStatus = null) => async () => {
  await new Promise(r => setTimeout(r, delayMs));
  if (failStatus) {
    const err = new Error(`HTTP Error ${failStatus}`);
    err.status = failStatus;
    throw err;
  }
  return { success: true, imagePath: '/scratch/mock_image.jpg' };
};
```

#### Approach B: Global `fetch` Interception for Integration Tests
Override `globalThis.fetch` in test scope to intercept outgoing Pollinations HTTP requests made by `ai-service.js`:
```javascript
const originalFetch = globalThis.fetch;

function setupMockFetch(options = {}) {
  const { simulate429Count = 0, delayMs = 10 } = options;
  let callCount = 0;

  globalThis.fetch = async (url, fetchOptions) => {
    callCount++;
    await new Promise(r => setTimeout(r, delayMs));
    if (callCount <= simulate429Count) {
      return new Response(JSON.stringify({ error: 'Rate limit' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Return mock 200 OK image response
    return new Response(Buffer.from('fake-image-bytes'), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' }
    });
  };

  return () => { globalThis.fetch = originalFetch; }; // Restore function
}
```

---

## 5. Recommended Project Directory Structure & Test Suite File

We recommend placing test files in a dedicated `test/` directory at the project root:

```
influ-JSON/
├── test/
│   ├── gen-queue.test.js     # Unit tests for gen-queue.js (FIFO, status, 429 handling)
│   └── api-queue.test.js     # Integration tests for GET /api/queue-status & image endpoints
├── gen-queue.js
├── server.js
└── package.json
```

### Proposed `package.json` Script Addition
```json
"scripts": {
  "start": "node server.js",
  "dev": "node server.js",
  "test": "node --test test/*.test.js"
}
```

---

## Summary of Verification Commands

1. Execute full automated test suite:
   ```bash
   npm test
   ```
   *Or directly:*
   ```bash
   node --test test/*.test.js
   ```

2. Manual verification of `GET /api/queue-status` endpoint when server is running:
   ```bash
   curl http://localhost:3000/api/queue-status
   ```

---
