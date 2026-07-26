# Frontend Queue Integration & Rate Limit Handling Analysis Report (M1-F3)

**Project Root**: `c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON`  
**Working Directory**: `c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON\.agents\teamwork_preview_explorer_m1_2`  
**Date**: 2026-07-24  

---

## 1. Summary of Findings

1. **Image Generation UI Triggers**: Identified 5 distinct image generation triggers across `app.js` and `index.html`:
   - **Portrait Generation (Studio / Persona Creation & Edit)**: `#btnSavePersona` -> `savePersonaAction()` (`app.js:2077`).
   - **Portrait Generation (Photo Analysis Save)**: `#btnSaveAnalysisPersona` -> `saveAnalysisAsPersona()` (`app.js:3974`).
   - **Traditional Variant Generation**: `#btnGenerateVariant` in Traditional mode (`state.variantMode === 'traditional'`) -> `generateVariantAction()` (`app.js:4488`).
   - **Spicy Variant Generation**: `#btnGenerateVariant` in Spicy mode (`state.variantMode === 'spicy'`) -> `generateVariantAction()` (`app.js:4488`).
   - **UGC Mockup Generation**: `#btnGenerateUgcImage` -> `generateAIImageAction()` (`app.js:2807`).
   - **Batch Variants (M2 Integration Point)**: Multiple variant generation (2 traditional + 2 spicy) triggered during background persona creation/import.

2. **Current Handling of Async Generation & Errors**:
   - `authFetch` (`app.js:39-56`) only handles HTTP 401 (redirects to login). It lacks HTTP 429 (Rate Limit) detection and response interception.
   - Failures in `savePersonaAction` and `saveAnalysisAsPersona` catch errors silently and fall back to static assets without warning the user.
   - `generateAIImageAction` reports a static `'⚠ La API está offline'` message even on rate limits or queue delays.
   - `generateVariantAction` shows generic `'Error al generar la pose'` via `toastError`.
   - No queue position or server cooldown feedback is currently communicated to the user.

3. **Dynamic Polling Strategy for `GET /api/queue-status`**:
   - Implement `QueuePoller` in `app.js` with active polling interval (1000ms–1500ms) triggered automatically upon dispatching any generation request or when `queueLength > 0` / `rateLimitActive === true`.
   - Auto-stops polling when `queueLength === 0 && !busy && !rateLimitActive`.

4. **User Notifications & Toasts UX**:
   - Leverage existing `#syncBanner` / `.app-toast` fixed toast component (`index.html:1501`, `index.css:1084-1160`) and local status cards (`#variantGenStatus`, `#ugcGenStatusCard`).
   - Present queue state as `"Encolado (Posición N)..."` with `type-loading`.
   - Present rate limit cooldown as `"Servidor congestionado, enfriando X seg..."` with active countdown timer.
   - Smooth non-intrusive updates without DOM re-creation or screen flicker.

---

## 2. Comprehensive Breakdown of Image Generation UI Triggers

| Trigger Action | UI Button Element | JS Handler Function | API Endpoint & Payload | Target UI Feedback Card |
|---|---|---|---|---|
| **Save Persona Portrait** | `#btnSavePersona` (`index.html:723`) | `savePersonaAction()` (`app.js:2050-2100`) | `POST /api/ai/generate-image`<br>`{ prompt, referenceLocalPath, personaId, generationType: 'portrait' }` | Toast: `toastLoading('Generando retrato...')` |
| **Save Photo Analysis Portrait** | `#btnSaveAnalysisPersona` (`index.html:743`) | `saveAnalysisAsPersona()` (`app.js:3964-3984`) | `POST /api/ai/generate-image`<br>`{ prompt, referenceLocalPath }` | Toast: `toastLoading('Generando retrato...')` |
| **Traditional Variant** | `#btnGenerateVariant` (`index.html:984`) with `#btnModeTraditional` active (`app.js:4216`) | `generateVariantAction()` (`app.js:4412-4520`) | `POST /api/personas/:id/variants`<br>`{ pose, attitude, clothing, setting, prompt, photoreal: true, identityLock: true, framing, mode: 'traditional', seed }` | Card: `#variantGenStatus`<br>Text: `#variantGenStatusText`<br>Toast: `toastLoading(...)` |
| **Spicy Variant** | `#btnGenerateVariant` (`index.html:984`) with `#btnModeSpicy` active (`app.js:4217`) | `generateVariantAction()` (`app.js:4412-4520`) | `POST /api/personas/:id/variants`<br>`{ ..., mode: 'spicy', ... }` | Card: `#variantGenStatus`<br>Text: `#variantGenStatusText`<br>Toast: `toastLoading(...)` |
| **UGC Image Generation** | `#btnGenerateUgcImage` (`index.html:1135`) | `generateAIImageAction()` (`app.js:2792-2834`) | `POST /api/ai/generate-image`<br>`{ prompt, personaId, generationType: 'ugc' }` | Card: `#ugcGenStatusCard`<br>Text: `#ugcGenStatusText` |
| **Batch Variants (M2 pipeline)** | Auto-triggered after `#btnConfirmImport` (`index.html:1493`) / creation | `importInfluencerAction()` (`app.js:5041`) & multi-variant generation | `POST /api/import-influencer`<br>Followed by background variant requests | Import modal status & toast loading |

---

## 3. Analysis of Current Async Handling & Error Responses

### 3.1 `authFetch` Behavior (`app.js:39-56`)
```javascript
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
  }
  if (studioPin) {
    options.headers['Authorization'] = `Bearer ${studioPin}`;
  }

  const res = await fetch(url, options);
  
  if (res.status === 401) {
    showLoginScreen();
    throw new Error('Unauthorized');
  }
  
  return res;
}
```
**Deficiencies Identified**:
- No handling for `res.status === 429` (Too Many Requests).
- No extraction of `Retry-After` header.
- Does not expose queue status returned in error JSON responses.

### 3.2 Error Handling per Action

1. **`savePersonaAction` (`app.js:2076-2093`)**:
   ```javascript
   try {
     const imgRes = await authFetch('/api/ai/generate-image', { ... });
     const imgData = await imgRes.json();
     if (imgData.success && imgData.imagePath) {
       portraitPath = imgData.imagePath;
     }
   } catch (err) {
     console.warn('Image generation failed or offline. Using reference or existing image.');
   }
   ```
   *Issue*: Catches silently. If Pollinations rate limits (429), persona is saved with default fallback image without telling the user why image generation failed.

2. **`generateAIImageAction` (`app.js:2807-2833`)**:
   ```javascript
   if (data.success && data.imagePath) { ... }
   else {
     statusText.textContent = '⚠ La API está offline. Copia el prompt para generarlo gratis.';
   }
   ```
   *Issue*: Misleadingly claims "API está offline" even when the server is just rate-limited or queued.

3. **`generateVariantAction` (`app.js:4503-4519`)**:
   ```javascript
   if (data.success) { ... }
   else {
     statusText.textContent = 'Error al generar la pose.';
     toastError(data.message || 'Error al generar la pose.');
   }
   ```
   *Issue*: Shows a destructive error toast when a job is enqueued or delayed due to global rate limiting.

---

## 4. Design Proposal: Dynamic Queue Polling (`GET /api/queue-status`)

### 4.1 Backend Response Contract (`GET /api/queue-status`)
Provided by `gen-queue.js` (`getStatus()`):
```json
{
  "busy": true,
  "queueLength": 2,
  "currentLabel": "generate-variant-persona_123",
  "minGapMs": 10000,
  "rateLimitCooldownMs": 30000,
  "lastRateLimitedAt": 1784500000000,
  "rateLimitActive": true,
  "retryAfterSeconds": 24
}
```

### 4.2 Frontend Polling Architecture (`app.js`)

Add a singleton queue poller state to `app.js`:

```javascript
// State additions in app.js
const queueState = {
  pollingIntervalId: null,
  activeJobsCount: 0,
  lastStatus: null
};

function startQueuePolling() {
  if (queueState.pollingIntervalId) return;
  
  // Initial immediate fetch
  pollQueueStatus();
  
  queueState.pollingIntervalId = setInterval(pollQueueStatus, 1200);
}

function stopQueuePolling() {
  if (queueState.pollingIntervalId) {
    clearInterval(queueState.pollingIntervalId);
    queueState.pollingIntervalId = null;
  }
}

async function pollQueueStatus() {
  try {
    const res = await authFetch('/api/queue-status');
    if (!res.ok) return;
    const status = await res.json();
    queueState.lastStatus = status;
    
    updateQueueUI(status);
    
    // Auto-stop condition: no active queue & no rate-limit cooldown & no local active jobs
    if (!status.busy && status.queueLength === 0 && !status.rateLimitActive && queueState.activeJobsCount <= 0) {
      stopQueuePolling();
    }
  } catch (err) {
    console.warn('[queue-poller] Error fetching status:', err);
  }
}
```

---

## 5. UI/UX Notification Strategy

### 5.1 Presentation Rules

1. **Queue Position Toast ("Encolado (Posición N)")**:
   - When `status.queueLength > 0`, display loading toast:
     ```javascript
     const pos = status.queueLength;
     toastLoading(`Encolado (Posición ${pos}) — procesando solicitudes...`);
     ```
   - Sync text to local action status card (`#variantGenStatusText` or `#ugcGenStatusText`):
     `"Encolado en posición ${pos}..."`

2. **Server Cooldown / Rate Limit Toast ("Servidor congestionado, enfriando X seg...")**:
   - When `status.rateLimitActive === true` or an HTTP 429 response is intercepted:
     ```javascript
     const sec = status.retryAfterSeconds || 30;
     toastInfo(`Servidor congestionado, enfriando ${sec} seg...`, { duration: 2000 });
     ```
   - Local status cards display:
     `"⏸️ Cooldown por límite de tasa (${sec}s)..."`

3. **Job Completion & Transition**:
   - When generation completes successfully:
     `toastSuccess('✓ Variante generada con éxito!');`
   - Local status card hides gracefully after 3 seconds.

4. **`authFetch` HTTP 429 Interceptor Integration**:
   Modify `authFetch` in `app.js` to automatically trigger rate-limit notifications:
   ```javascript
   if (res.status === 429) {
     const data = await res.clone().json().catch(() => ({}));
     const retrySec = data.retryAfterSeconds || 30;
     toastInfo(`Servidor congestionado, enfriando ${retrySec} seg...`);
     startQueuePolling();
   }
   ```

### 5.2 Style and CSS Compatibility (`index.css`)
Existing toast styles in `index.css:1084-1160` already support `.type-loading` (dark slate blur with spinner) and `.type-info` (indigo blur). No intrusive modal dialogs are necessary.

---

## 6. Proposed Code Changes for Implementer

1. **`app.js` Modifications**:
   - Update `authFetch()` to handle HTTP 429.
   - Add `startQueuePolling()`, `stopQueuePolling()`, `pollQueueStatus()`, and `updateQueueUI(status)`.
   - Track `queueState.activeJobsCount++` in `savePersonaAction`, `generateAIImageAction`, and `generateVariantAction`, decrementing in `finally` blocks.
   - Update local status cards (`variantGenStatusText`, `ugcGenStatusText`) dynamically during generation.

2. **`index.html` Modifications**:
   - Ensure `#variantGenStatus` and `#ugcGenStatusCard` status cards have clear accessibility attributes and standard spinner classes.

3. **`index.css` Modifications**:
   - Add pulse animation style `.cooldown-pulse` if needed for cooldown state indicator.
