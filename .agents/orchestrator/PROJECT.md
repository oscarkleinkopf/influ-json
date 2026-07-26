# Project: influ-JSON Phase 3 & Usability Hardening

## Architecture
- **Stack**: Node.js, Express, better-sqlite3, vanilla frontend (`index.html` + `app.js` + `index.css`).
- **Image Generation Engine**: `image-provider.js` / `ai-service.js` using free Pollinations tier, queued via `gen-queue.js`.
- **Database / Storage**: `db.js` managing `data/influ.sqlite` with fallback to `personas.json`.
- **Import Flow**: Multi-image upload modal in frontend, API `/api/personas/import` (or create), triggering async background variant generation.
- **Queue System**: `gen-queue.js` managing job queue, single active generation, 30s cooldown handling on HTTP 429 error, dynamic status via `GET /api/queue-status`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: F3 Global Queue System & Rate Limit Handling | R1: Connect image gens to `gen-queue.js`, 429 cooldown 30s + retry, `GET /api/queue-status`, frontend `app.js` queue polling & UI notifications | none | DONE |
| 2 | M2: Multi-Image Import & Background Variants | R2: Import modal with X/4 image preview/counter, background generation of 4 variants (2 traditional + 2 spicy), SQLite/personas.json persistence, live vault update | M1 | PLANNED |
| 3 | M3: JSON Schema Validation & Personality Attributes | R3: JSON schema validation on create/import, MBTI/voice/taboos attributes in prompts & free chatbot pack export | M2 | PLANNED |

## Interface Contracts

### M1: Queue System & Endpoint API (VERIFIED - DONE)
- `genQueue.enqueue(taskFn)`: enqueues task, retries on 429 after `RATE_LIMIT_COOLDOWN_MS` (30000ms).
- `genQueue.getStatus()`: returns `{ active: boolean, pendingCount: number, isCoolingDown: boolean, cooldownRemainingMs: number, currentTaskInfo: object|null }`.
- `GET /api/queue-status`: HTTP endpoint returning `{ success: true, queue: genQueue.getStatus() }`.
- Frontend `app.js`: Periodic polling (every 1.5s via `QueuePoller`) of `/api/queue-status`, displaying user toasts ("Servidor congestionado, enfriando X seg...", "Encolado (Posición N)").

### M2: Multi-Image Upload & Background Variants
- Import Modal: accepts up to 4 image files or URLs, UI shows counter `X/4 cargadas` and image thumbnails.
- `POST /api/personas/import` or `POST /api/personas`: accepts `images` (array up to 4 base64/URLs), creates persona, returns persona immediately, enqueues 4 background jobs for 2 traditional and 2 spicy variants.
- Background Variant Task: generates variant, saves to SQLite database/`personas.json`, emits notification or updates state so vault re-renders.
- Vault updates dynamically without full browser reload.

### M3: Schema Validation & Personality Attributes
- Schema Validator: validates persona JSON object against required fields (name, age, skin, body, MBTI, tone, taboos, etc.) returning structured errors or defaults.
- Prompt Generator: incorporates MBTI, voice tone, distinctive attributes, brand taboos into image prompts & free chatbot prompt packs (`buildFreeChatbotPack`).

## Code Layout
- `server.js`: Express server & endpoints (`/api/queue-status`, `/api/personas/import`, etc.).
- `gen-queue.js`: Queue implementation with 429 rate limit cooldown.
- `ai-service.js`: Pollinations API calls & prompt construction.
- `image-provider.js`: Image provider routing.
- `db.js`: SQLite CRUD and schema management for personas and variants.
- `app.js`: Frontend logic, state management, modal handlers, polling, toast notifications.
- `index.html`: UI structure (import modal, queue status badge/toast, persona details tab).
- `index.css`: Styling for queue status and multi-image uploader.
