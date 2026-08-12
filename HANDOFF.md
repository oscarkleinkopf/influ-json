# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan activo: [PLAN-UX.md](./PLAN-UX.md) · [PLAN-NEXT.md](./PLAN-NEXT.md) · Runbook W1–W10: [PLAN.md](./PLAN.md) · Roadmap: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados en foto/referencia), y un **JSON (`character_lock`)** que se pueda pegar en **chatbots gratuitos** para seguir desarrollando esos personajes sin pagar face-lock.

**Cero costo primero.** Pollinations = bocetos locales opcionales. Replicate face-lock = opt-in (`ENABLE_PAID_FACE_LOCK`, `docs/FACELOCK_R.md`) que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → copiar JSON/packs a chatbot free (o gen Pollinations) → export pack / kit marca
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

---

## Estado exacto al retomar

| Campo | Valor |
|-------|--------|
| **Rama de trabajo** | `cursor/produce-gallery-declutter-9b67` |
| **Commit base** | `main` @ #97 |
| **PR actual** | Produce declutter + walkthrough happy path |
| **`main` remoto** | + UGC Copiar JSON #97 |
| **Prioridad inmediata** | Merge declutter → uso real |

### Sesión reciente (Cursor, 2026-08-12) — Merge #97 + Galería declutter

**Pedido:** Mergea #97 y sigamos con Galería / Produce declutter y walkthrough happy path.

**Hecho:**
- [#97](https://github.com/oscarkleinkopf/influ-json/pull/97) → `main`
- Galería fuera del hub Producir; entrada desde ficha (`Ver galería`)
- Empty gallery → CTA «Ir a Copiar JSON» (paso 2)
- Walkthrough happy path (capturas)

### Sesión previa (Cursor, 2026-08-12) — Merge #96 + UGC Copiar JSON

**Pedido:** Mergea #96 y sigamos.

**Hecho:**
- [#96](https://github.com/oscarkleinkopf/influ-json/pull/96) → `main` (Ajustes con pestañas / redo #72)
- UGC `#btnExportUgcChatbot`: ahora **copia** pack `product` (antes solo navegaba a la ficha)
- Empty state sin demo «Sofia»; vídeo DEMO en `<details>`

### Sesión previa (Cursor, 2026-08-12) — Merge #95 + Ajustes tabs

**Pedido:** Mergea #95 y sigamos.

**Hecho:**
- [#95](https://github.com/oscarkleinkopf/influ-json/pull/95) → `main` (detalles: modules, uploads, layout-smoke)
- Redo draft #72: modal Ajustes con pestañas Claves / Perfiles / Invitaciones / Studio / Cuenta (`views/_foot.html` + `setSettingsTab` + filtro/prune perfiles)
- Test `test/settings-tabs.test.js`

### Sesión previa (Cursor, 2026-08-12) — Cierre detalles no esenciales

**Pedido:** Terminemos todos esos detalles antes de continuar con el resto.

**Hecho:**
- `photo-upload-ui.js` + `variant-vault-ui.js` (DOM fuera de `app.js`)
- Más `style=` → utilidades CSS
- Uploads de test → `DATA_DIR/references` (`getReferencesUploadDir` + `INFLU_TEST_UPLOADS`)
- `npm run layout-smoke` (Chrome: ancho `.main-content` ≥70% + screenshot artifact en CI)
- Drafts #72 / #76–#80: **backlog explícito** — no reintegrar en masa; reabrir solo con repro en `main`

### Sesión previa (Cursor, 2026-08-12) — Merges #94 + #93

**Pedido:** Continua con eso (merge UX-5 y UX-4 restos).

**Merges:**
- [#94](https://github.com/oscarkleinkopf/influ-json/pull/94) UX-5 → `main` (CI verde)
- [#93](https://github.com/oscarkleinkopf/influ-json/pull/93) UX-4 restos → `main` (rebase + fix tests founder/happy-path; 336 pass)

**Siguiente:** tras merge de detalles, pulido free path / lo que diga el owner.

### Sesión previa (Cursor, 2026-08-12) — UX-5 harness

**Pedido:** Sigamos con UX-5.

**Hecho:**
- `scripts/run-tests.js` + `scripts/run-smoke.js` — `DATA_DIR` temporal, `INFLU_SKIP_DB_MIGRATE=1`, `STUDIO_PIN=1234`
- `paths.js`: flag `INFLU_SKIP_DB_MIGRATE` (tests no copian `influ.sqlite` de raíz)
- `npm test` → runner aislado; escape `npm run test:raw`
- Tests `test/ux5-data-dir-isolation.test.js` (334 pass; `data/influ.sqlite` del workspace intacto)
- PLAN-NEXT DoD: captura de pestaña afectada + nota DB aislada
- Cerrados drafts stale #72, #76–#80 (comentarios UX-5)

### Sesión previa (Cursor, 2026-08-12) — UX-4 restos

**Pedido:** Terminemos esos restos de UX-4.

**Hecho:**
- `photo-analysis.js` — motor de colores + `generateDetailedJSON` + `ANALYSIS_FIELD_OPTIONS` fuera de `app.js`
- `buildPortfolioCard` en `persona-card.js` (tercer constructor unificado)
- `LOOK_PRESETS` / `findOptionByRegex` → `variant-presets.js`
- Vault variantes: clases `.variant-card*`, `.vault-empty-offline*` (sin hover JS)
- ~144 `style=` → utilidades (`.u-option-card`, `.u-header-row`, …) en views
- Tests ampliados en `test/ux4-modules.test.js`

### Sesión previa (Cursor, 2026-08-12) — Merges a main

**Pedido:** Anda haciendo merge a GitHub.

**Merges:**
- [#92](https://github.com/oscarkleinkopf/influ-json/pull/92) UX-4 → `main` (CI verde tras fix safe-delete toast test)
- [#84](https://github.com/oscarkleinkopf/influ-json/pull/84) PLAN-UX docs → `main`

**Siguiente:** UX-5 (aislar `DATA_DIR` en tests) o seguir quitando `style=` / trocear upload UI.

### Sesión reciente (Cursor, 2026-08-12) — UX-4 continuación II

**Pedido:** Continúa (UX-4).

**Hecho:**
- `variant-presets.js` (presets spicy/traditional fuera de `app.js`; ~1.1k líneas menos)
- `applyAnalysisToFormFields` en `persona-form.js`
- ~179 `style=` → utilidades CSS (`.u-hidden`, `.u-flex-between`, …); `.filter-btn-active`
- Tests ampliados en `test/ux4-modules.test.js`

### Sesión previa (Cursor, 2026-08-12) — UX-4 módulos

**Hecho:** toast / queue / form / card UMD + CSS btn-compact.

### Sesión previa (Cursor, 2026-08-11) — Merge + UX-4 parciales

**Pedido:** Merge y continuar siguiente paso.

**Merges:** #91 Pages → #90 PIN → #89 UX-2 → `main`.

**UX-4 (parciales):**
- `views/_head.html` + `views/tabs/*.html` + `views/_foot.html`
- `views/compose-index.js` · `server.js` sirve `composeIndexHtml()`
- `npm run build:index` regenera `index.html` (Pages)
- Tests: `test/ux4-html-partials.test.js`

### Sesión previa — UX-2 / Pages / PIN

Ya en `main`.

### Sesión previa (Cursor, 2026-08-11) — Free Path consolidar

**Pedido:** Mantener Free Path primero; usabilidad sencilla; sin links/botones falsos.

**Hecho:**
- Cherry-pick UX-0 + UX-3 sobre `main` (face pack)
- UGC: **Copiar JSON** primero (verde); boceto secundario; ZIP/kit/ads en `<details>`
- Script Engine / Licensing / import: sin claims GPT-5.6; guiones = plantillas locales / Gemini opt-in
- Consola: sin fila duplicada de packs (`data-free-pack` solo en ficha)
- Toasts: sin «Campaña… GitHub» falso tras guiones; sin `alert()` runtime
- Tests: `test/ux-free-path-consolidar.test.js` (+ UX-0/UX-3)
- **PR #87** merged a `main`

### Sesión previa (Cursor, 2026-08-11) — UX-3 honestidad UI

**Pedido:** Continuar con UX-3 del plan (operatividad / honestidad).

**Hecho:**
- **3a** `#btnGenerateCampaignScripts` → `generateCampaignScriptsAction` (Gemini o mock + `POST /api/campaigns/:id/scripts`)
- **3b** «Enviar Propuesta» `alert()` → «Descargar propuesta (.txt)»
- **3c** Vídeo UGC etiquetado DEMO; toast honesto (sin pipeline real)
- **3d** Stat Scripts = `scriptsCount` real vía `/api/data` (nada de `campañas×10` ni `|| 10`)
- **3e** `getGenerationStats(profileId)` scoped; productos ya lo estaban
- **3f** Empty states campañas/galería con CTA
- **3h** Eliminado `showSyncToast` (23 call sites → `toastSuccess`/`toastError`)
- **3g** #72 sigue CONFLICTING — no mergeado aquí
- Tests: `test/ux3-honestidad.test.js`

### Sesión previa (Cursor, 2026-08-11) — UX-0 layout + estructura

**Pedido:** Implementar UX-0 del PLAN-UX (partir: bug de layout + test).

**Hecho:**
- **UX-0a:** eliminado `</div>` sobrante tras `#variantManagerSection` que cerraba `<main>`/`#persona-engine` antes de tiempo (4 pestañas + historial salían a `<body>` flex)
- **UX-0b:** `@media (max-width:768px)` → `.main-content { margin-left:0; width:100% }`
- **UX-0c:** `#offlineModeBar` de `sticky` → `fixed` (ya no roba ancho al flex de `body`)
- **UX-0d:** `test/html-structure.test.js` (balance de tags + tabs bajo `<main>` + historial dentro de persona-engine)
- Cache-bust `index.css?v=1.3.3`

### Sesión reciente (Cursor, 2026-08-11) — face pack canónico

**Pedido:** Continuar ugc-creator → Tier 1 face pack (6 ángulos).

**Hecho:**
- `face-pack.js`: slots front / ¾ L / ¾ R / profile / laughing / fullbody
- Texto free `buildFacePackChatbotText` + UI «Copiar face pack (JSON)»
- Bocetos Pollinations via `triggerBackgroundVariants` (6 slots) + `POST .../face-pack/regenerate`
- `GET /anchor-pack` ahora devuelve `slots` + `summary` (legacy `anchors` intacto)
- Tests: `test/face-pack.test.js`

### Sesión previa (Cursor, 2026-08-11) — cámara + shot types

**Pedido:** Merge #81 y continuar con chips cámara + formatos UGC.

**Hecho:**
- #81 merged a `main` (`ad62ad5`)
- `ugc-shot-composer.js`: 4 cams (selfie/rear/mirror/overhead) + 7 shot types
- UI chips en card «Copiar JSON» + «Semana UGC (7 tomas)»
- Packs inyectan SHOT TYPE + CAMERA sin renegociar cara
- Tests: `test/ugc-camera-shot-types.test.js`

### Sesión previa (Cursor, 2026-08-11) — ugc-creator: asimetría + realism

**Pedido:** Revisar [0xAnni/ugc-creator](https://github.com/0xAnni/ugc-creator) e implementar quick wins (1)+(2).

**Hecho:**
- Campo `facial_asymmetry` en ficha + `must_match_every_image` + packs / export / variantes
- Marcas reforzadas (`keep visible`, never_do anti-beautify)
- Bloques **REALISMO (Layer 5)** + **NEGATIVE PROMPT** en packs free y export chatbot
- Validador: info si falta asimetría; «Sin marcas» también sugiere ancla
- Tests: `test/ugc-anchors-asymmetry.test.js`

**No tocar path free:** sigue sin Replicate; solo fortalece JSON/packs.

---

### Sesión previa — Spicy hotel+látex aún derivaba a playa

**Pedido:** Tras #74, Colorina 2.5 spicy látex sigue en playa (cara OK).

**Hallazgo:** gens 01:35–01:50 corrían con server viejo (arranque 00:11, sin #74). Output = playa+bikini pese a prompt hotel. Tras reinicio+#74 base: látex+hotel OK; refuerzo INDOOR SETTING LOCK + OUTFIT LOCK látex + strength medium más baja si indoor.

### Sesión reciente (Cursor, 2026-08-11) — Spicy látex salía en playa

**Pedido:** Colorina 2.5 spicy látex rojo → imagen en playa (había gen playa antes).

**Causa:** `ai-service` detectaba playa con `/mar/` suelto; coincidía dentro de **smartphone** (siempre en prompts de variante) y forzaba `SETTING LOCK` tropical beach.

**Hecho:** `promptImpliesBeachSetting` con word boundaries + no pisar `Background/location` indoor. Test `beach-mar-false-positive.test.js`.

### Sesión reciente (Cursor, 2026-08-10) — Resumen images 404 → DATA_DIR fallback

**Pedido:** En Resumen hay varias imágenes que no cargan.

**Causa:** `/assets/references|generated` solo miraba `assets/`; ~55 thumbnails existían solo en `data/references|generated` (mirror dual-write / limpieza de tests).

**Hecho:** `express.static` fallback a `DATA_DIR`; `persona-image.js` sustituye thumbs &lt;2KB (bloque amarillo) por avatar en `/api/data`; client `img.complete` + demos harness al final. Tests `asset-data-dir-fallback` + `persona-image-display`.

### Sesión reciente (Cursor, 2026-08-10) — Batch merge harness PRs

**Pedido:** Mergear todo lo pendiente (#64–#70).

**Hecho:** MERGED → `main`: #66 FK, #68 front smoke, #69 skills, #70 diagnostics, #64 W11 docs, #65 git creds (además de #71 ya en main). **#67 cerrado** (superseded por #71 — no reintroducir stage de `influ.sqlite`).

### Sesión reciente (Cursor, 2026-08-10) — Root influ.sqlite mirror policy

**Pedido:** `/better-harness` — ¿se lee el mirror binario? ¿untrack?

**Hallazgo:** ya untracked+gitignore (W6). Runtime write-only (`ENABLE_LEGACY_MIRRORS`); read solo migración one-shot en `paths.resolveDatabasePath`. **No** se ejecutó `git rm --cached` (nada tracked).

**Hecho:** `git-backup.js` stagea solo `personas.json` (texto); nunca `influ.sqlite`. Docs recovery en AGENTS.md.
### Sesión reciente (Cursor, 2026-08-10) — FK CASCADE delete

**Pedido:** `/better-harness` — `db.pragma('foreign_keys = ON')` + test cascade.

**Hecho:**
- `db.js`: pragma tras `new Database`
- `test/delete-cascade.test.js`: unit + DELETE `/api/personas/:id` limpian versions / persona_variants / generation_history / campaign_personas

### Sesión reciente (Cursor, 2026-08-10) — Front smoke P0

**Pedido:** `/better-harness` — smoke node:test del front (serve `/` + `app.js` + wiring save→aparecer).

**Hecho:** `test/frontend-smoke.test.js` (incluido en `npm test` vía `test/*.test.js`).
| **Última actualización** | 2026-08-08 |

### Sesión reciente (Cursor, 2026-08-08) — Walkthrough #3 W11 (móvil)

**Pedido:** Seguir con walkthrough **3** (sesión chatbot); **2** Daniela después en computador.

**Veredicto W11:** ✅ sin fricción P0. Código y tests OK.

| Qué | Estado |
|-----|--------|
| Botón «Probar en chatbot (3 prompts)» (ficha + portafolio) | Cableado |
| Bloque A/B/C + `character_lock` (usa `normalizePersonaForPack`) | OK |
| Modal checklist cara / tez / pelo | OK |
| Persistencia checklist | Solo `localStorage` (no sincroniza móvil ↔ PC) — esperado |
| Fix código | Ninguno |

**Cola walkthroughs:**
1. Happy path free — ✅ (→ fix #63)
2. **Daniela body/skin/spicy** — ⏸ aparcado (usuario pide PC)
3. W11 sesión chatbot — ✅ cerrado


### Sesión reciente (Cursor, 2026-08-10) — Harness git credentials

**Pedido:** `/better-harness` — token embebido en URL efectiva del remote.

**Hecho (local VM, no en el repo):**
- Quitados `url.*.insteadOf` con `x-access-token` de `~/.gitconfig` (+ `managedauthrewritescope`).
- `git remote set-url origin https://github.com/oscarkleinkopf/influ-json.git`
- Credential helper: `gh auth git-credential`
- Validado: `git remote get-url origin` limpio · `git ls-remote origin` OK · `git push --dry-run` OK (path de `runGitBackup`)

**Usuario:** token expuesto **revocado/rotado** (2026-08-10). PC Antigravity alineado a `origin/main` (`27e2c6c`) con remote limpio + Credential Manager.


### Sesión reciente (Cursor, 2026-08-10) — Skills activation triggers

**Pedido:** `/better-harness` — Use when / Expected output / Self-check en los 3 SKILL.md.

**Hecho:** descripciones ampliadas; workflows intactos; `test/skills-activation.test.js` (routing por paráfrasis).

### Sesión reciente (Cursor, 2026-08-07) — Walkthrough emprendedor

**Pedido:** Opción 1 — usar el Studio como emprendedor y anotar fricción.

**Hallazgos:**
- Happy path API create → list OK.
- **P0:** `buildFreeChatbotPack` / CLI `export-pack` pegaban `character_lock: {}` si recibían la fila SQLite (lock vive en `detailedJSON`).
- PIN wizard bloqueante en primer arranque (fricción; se añadió «Más tarde — solo localhost»).

**Fix:** `normalizePersonaForPack` + CLI usa `chatbot-packs`; skip PIN opcional.

### Sesión reciente (Cursor, 2026-08-07) — Merge #61 Fase R

**Pedido:** Mergear #61 (Fase R). L4 plan re-pedido: ya estaba en `main` (#54) — sin gaps.

**Hecho:** Merge #61 → `main` (conflictos HANDOFF/ROADMAP resueltos).

### Sesión reciente (Cursor, 2026-08-06) — Pulido free

**Pedido:** Seguir con pulido (no HostGator; T63 Dropdeep era confusión).

**Hecho:**
- Cómo usar «Copiar JSON» scrollea a `#btnCopyPackFullbodyPrimary` (ya no al ZIP kit)
- Consola: «Copiar prompt + JSON» (distinto del pack fullbody)
- Checklist 3/3 core (crear→guardar→copiar); gen no se marca al copiar
- Members: pollen Ajustes → toast honesto + CTA Copiar JSON
- Vocabulario: «Copiar JSON» en founder/lead/primary

**Siguiente:** done (#62 merged).

### Sesión reciente (Cursor, 2026-08-06) — Fase R #1–#5 (R0–R4)

**Pedido:** Seguir con #1 a #5 → interpretado como **Fase R** (R0–R4), no Sec #1–#5 (ya en main).

**Hecho:**
- R0: `ENABLE_PAID_FACE_LOCK=1` + token (o `IMAGE_PROVIDER=replicate` + token)
- R1: `paid-facelock.js` + `generateWithOptionalFaceLock` (PuLID/InstantID)
- R2: checkbox demoted “Face-lock mejorado” off por defecto (solo si available)
- R3: fallback automático a Pollinations
- R4: `provider=replicate` en `gen_metrics` vía `inferProviderFromImagePath`
- Docs: `docs/FACELOCK_R.md`

**Siguiente:** **MERGED** → `main`.

### Pila #4–#16 — INTEGRADA ✅

Fast-forward de `cursor/import-cleanup-packs-152f` → `main` (`e618868` → `e354525`).
PRs #4–#16 aparecen **MERGED** en GitHub. PRs abiertos antiguos #1–#3 se solapan; cerrar como superseded.

| Orden | PR | Contenido | Estado |
|------:|---:|-----------|--------|
| 1–13 | #4–#16 | Validador → discard preview + `chatbot-packs.js` | **merged** |

### Pila W6 + W7–W10 — INTEGRADA ✅ (Paso 0)

| Orden | PR | Contenido | Estado |
|------:|---:|-----------|--------|
| 1 | #31 | W6 untrack mirrors + filter-repo | **merged → main** |
| 2–5 | #27–#30 | W7 metrics → W10 backup ZIP | **merged → main** |
| docs | #32 | PLAN-NEXT W11–W17 | **merged → main** |

### Pila W12–W17 — INTEGRADA ✅ (2026-07-30)

FF `cursor/merge-w12-w17-152f` → `main` (`2dd4fc5` → `cbdae55`). PRs #34–#40 **MERGED**.

| Orden | PR | Contenido | Estado |
|------:|---:|-----------|--------|
| 1–6 | #34–#39 | W12 historial → W17 audit | **merged** (vía tip #40) |
| tip | #40 | Stack integración W12–W17 | **merged → main** |

---

## Sesión reciente (Cursor, 2026-08-06) — Sec #5 + UX free

**Pedido:** Cerrar seguridad mínima (1) + volver a UX free (2).

**Hecho:**
- **#60** UX free **MERGED** → `main` (`8f4f973`).
- **#58** Sec #4 rate-limit **MERGED** → `main`.
- **#59** Sec #5 Permissions-Policy + COOP/CORP **MERGED** → `main` (`ebe15b9`).
- UX free (integrado): primary fullbody, pollen dual CTA, auth→402, sin logout por pollen.

**Siguiente:** Fase R (pausa) u otra fricción free si aparece.
## Sesión reciente (Cursor, 2026-08-06) — Sec #4

**Pedido:** Rate limit.

**Hecho (rama `cursor/sec4-api-rate-limit-173f`):**
- `auth.apiRateLimit` / `checkApiRateLimit` — sliding window por IP+perfil.
- Buckets: `heavy` (40/min default) en generate-image, analyze-photo, upload-reference(-url), generate-video, ads/bulk-generate; `default` (120/min) en expand/scripts.
- Env: `API_RATE_LIMIT`, `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_HEAVY_MAX`, `API_RATE_LIMIT_MAX`.
- Tests: `test/sec4-api-rate-limit.test.js`.

## Sesión reciente (Cursor, 2026-08-06) — Sec #3

**Pedido:** Más seguridad.

**Hecho (rama `cursor/sec3-session-regenerate-173f`):**
- `auth.establishAuthenticatedSession` — `session.regenerate` + save antes de marcar auth.
- Login (`POST /api/auth/login`), invite redeem, setup change-pin.
- Cookie pre-login deja de autenticar; Bearer/CLI intacto.
- Tests: `test/sec3-session-regenerate.test.js`.

**Integrado antes:** **#56** L5 → `main` (`170a1b8`).

## Sesión reciente (Cursor, 2026-08-06) — L5

**Pedido:** L5 train local.

**Hecho (rama `cursor/l5-local-lora-train-173f`):**
- `local-train.js`: materializa pack L0 a `DATA_DIR/loras/<id>/train_jobs/`; spawn opt-in vía `LOCAL_LORA_TRAIN_CMD` / `AI_TOOLKIT_DIR`.
- Flag `ENABLE_LOCAL_LORA_TRAIN=1` (sin flag = off; AI_TOOLKIT_DIR solo no activa).
- Rutas: `POST …/lora/train-local`, `POST …/lora/sync-local`.
- UI demoted en `#loraAdvancedPanel` (L5).
- Docs: `docs/lora/L5_LOCAL_TRAIN.md` · tests `test/local-train.test.js`.
- Path free intacto (JSON + Colab L1 + Pollinations).

**Integrado:** **#56** L5 train local → `main` (`170a1b8`). Siguiente: más seguridad / Fase R (pausa).

**Integrado antes:** **#55** Sec CSP → `main`.

## Sesión reciente (Cursor, 2026-08-06)

**Pedido:** Seguir con CSP.

**Hecho (rama `cursor/sec-csp-harden-173f`):**
- CSP endurecida en `auth.buildContentSecurityPolicy` / `securityHeaders`.
- `connect-src 'self'` (sin `https:` — Pollinations es server-side).
- `img-src` sin wildcard `https:` (assets locales + `data:`/`blob:`).
- Añadidos `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`.
- Escape: `CSP_REPORT_ONLY=1`, `CSP_ALLOW_HTTPS_IMG=1`.
- Tests: `test/csp.test.js`.
- Deuda conocida: `'unsafe-inline'` en script/style (onclick/onerror + templates + Google Fonts).

**Integrado:** **#55** Sec CSP → `main` (`854cc81`). Siguiente: L5 (pausa) / más seguridad.

## Sesión reciente (Cursor, 2026-08-05)

**Contexto clave:** Pollinations migró a créditos «pollen»; el acceso anónimo dejó de generar (401/402). Ahora requiere `POLLINATIONS_TOKEN` (registro en enter.pollinations.ai/keys, key con permiso `account:usage` + saldo). El path free real del producto sigue siendo copiar `character_lock` a chatbots gratis.

**Hecho (integrado en `main`):**
- **#45** — fix Pollinations + L0 export LoRA + G1 chips + plan Fase L.
- **#46** — G2 looks rápidos + G3 batch 1/4.
- **#47** — L1 notebook Colab.
- **#48** — L2 ComfyUI + `persona_loras` + fallback Pollinations.
- **#49** — L3 Replicate trainer opt-in (`ENABLE_PAID_LORA`).
- **#50** — HANDOFF post-L3.
- **#51** — UX free: pollen/401 CTA + demote LoRA.
- **#52** — Sec: public-bind + auth-off → 503.
- **#53** — Sec #2: assets gate + cookie-first + TRUST_PROXY.
- **#54** — L4 hub GPU local (ComfyUI + A1111/Forge).
- **UX #2** — `POLLINATIONS_TOKEN` en Ajustes (admin).
- **L4c** — plantilla Flux Comfy (`comfy_workflow_flux_lora.json`).
- #41–#44 cerradas *superseded* (contenido vía #45).

**En curso:** — (todo lo anterior en `main`). Smoke 9/9 OK.

**Happy path validado (2026-08-05, live API):**

| Paso | Resultado |
|------|-----------|
| Login admin | PASS |
| Boceto Pollinations (token en `.env`) | PASS → JPEG en `assets/generated/` |
| Crear → aparece en portafolio | PASS |
| Copiar pack chatbot (`character_lock` + hex) | PASS |
| Export ZIP | PASS (~1.4MB) |
| `npm run smoke` | **9/9** |

Nota: si hay cola de anchors de fondo ocupada, el boceto puede esperar; el path free (JSON) no depende de Pollinations.

## Sesión reciente (Cursor, 2026-07-30)

**Pedido:** Mergear stack W12–W17 a `main`.

**Hecho:**
- FF-merge #40 → `main` (`cbdae55`).
- GitHub marcó #34–#40 como MERGED.
- Schema v9 lock revisions + v10 audit_events en producción local tip.

**Siguiente:** Validar happy path en uso real (crear → Copiar JSON → chatbot free). Seguridad mínima solo si entra un segundo usuario. Replicate en pausa.

**No tocado:** Replicate.

---

## Protocolo de arranque para otro agente

```bash
git status --short
git fetch origin main
git pull origin main
npm test
```

Antes de probar:

1. Confirmar que `npm test` incluye `DISABLE_GIT_BACKUP=1` (cinturón).
2. Auto-Git es **opt-in** (`ENABLE_GIT_BACKUP=1`). No activar en tests.
3. No usar `git add .`; stagear archivos explícitos.
4. No commitear `.env`, `data/`, ni `assets/references/ref_*` creados por tests.
   `influ.sqlite` / `personas.json` en raíz están **gitignore** (W6) — no hace falta `git restore`.
5. Fuente de verdad: `data/influ.sqlite`. Mirrors raíz solo con `ENABLE_LEGACY_MIRRORS=1`.

No borrar `assets/references/` completo: contiene referencias versionadas.

## Plan siguiente

### Paso 0 — Integrar la pila ✅

Hecho 2026-07-29: tip → `main`, tests + smoke OK.

### Paso 1 — P0 datos: auto-Git opt-in ✅ (PR #14) + W6 mirrors ✅

W6: desversionados `influ.sqlite` / `personas.json` (OK owner). Historial `filter-repo` opcional.

### Paso 2 — P0 seguridad: paths y ownership ✅ (PR #14)

### Paso 3 — P0/P1 UX gratis ✅ (PR #14 + #15)

### Paso 4 — Mantenibilidad (siguiente)

Sin migrar a React. Extraer gradualmente de `app.js`:

```text
chatbot-packs.js   ✅ (#16)
import-flow.js     ✅ (W5a)
prompt-builder.js  ✅ (W5b)
routes/personas.js ✅ (W5c)
routes/import.js + generation.js ✅ (W5d)
routes/admin.js    ✅ (W5e) — W5 extracciones completas
```

Extracciones W5 de `server.js` ✅. Producto W6–W11 ✅ en `main`. W12 en PR. **Siguiente:** [PLAN-NEXT.md](./PLAN-NEXT.md) W13–W17.

## Smoke manual obligatorio (post-merge — resultado)

| Paso | Esperado | Observado 2026-07-29 |
|------|----------|----------------------|
| 1 Crear → Guardar → portafolio | aparece sin recargar | PASS (API `/api/data`) |
| 2 Copiar pack fullbody | contiene `character_lock` | PASS |
| 3 Import preview | no en portafolio | PASS |
| 4 Descartar | sigue sin aparecer | PASS |
| 5 Confirmar import | una sola persona | PASS |
| 6 Gen variante / 429 | cola + banner | cubierto por tests unitarios; no forzado en smoke live |
| 7 Matriz QA | slots + checks | cubierto por `qa-matrix.test.js` |
| 8 Member isolation | no ve/borra admin | PASS |
| 9 Export ZIP | JSON + packs | PASS (`zipBytes` ~1.4MB) |

## Qué NO hacer

- No implementar Replicate, Fal, billing, OAuth ni video completo.
- No hacer que Gemini/Pollinations sean obligatorios para guardar o exportar.
- No reemplazar SQLite por una plataforma cloud en esta etapa.
- No introducir React solo para “ordenar” el monolito.
- No exponer el puerto 3000 a Internet sin endurecer auth (PIN default aún activo en este entorno).

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-08-11 | Cursor | **fix(ux-0)**: HTML nesting + móvil margin + offline bar fixed + test estructura | *(este PR)* |
| 2026-08-10 | Cursor | **fix**: Resumen thumbs — fallback static `DATA_DIR` para references/generated | *(este PR)* |
| 2026-08-05 | Cursor | **Happy path live**: create→JSON pack→export + boceto pollen; smoke 9/9 | *(docs)* |
| 2026-08-05 | Cursor | **UX #2** + **L4c** Flux template | *(este PR)* |
| 2026-08-05 | Cursor | Merge #53 Sec #2 + #54 L4 → `main` | *(main)* |
| 2026-08-05 | Cursor | **L4**: hub GPU local ComfyUI + A1111/Forge | *(PR #54)* |
| 2026-08-05 | Cursor | **Sec #2**: assets gate + cookie-first + TRUST_PROXY/XFF | *(PR #53)* |
| 2026-08-05 | Cursor | **L1**: notebook Colab + guía para entrenar LoRA desde pack L0 | *(este commit)* |
| 2026-08-05 | Cursor | **G2+G3** looks rápidos + batch 1/4 → `main` | `b00da9d` (#46) |
| 2026-08-05 | Cursor | **Integración #45**: fix Pollinations + L0 export LoRA + G1 chips + plan Fase L → `main` | `196f4a3` |
| 2026-08-04 | Cursor | **fix**: Pollinations pasó a créditos «pollen» (402 anónimo). Endpoint `/p/`→`/prompt/`, soporte `POLLINATIONS_TOKEN`/referrer + error honesto | *(este commit)* |
| 2026-07-30 | Cursor | Merge stack W12–W17 → main (#34–#40) | `cbdae55` |
| 2026-07-30 | Cursor | W17 audit log local (admin, v10) | *(PR W17)* |
| 2026-07-30 | Cursor | W16 badges Listo / Revisar / Sin ancla | PR #38 |
| 2026-07-30 | Cursor | W15 offline-first | PR #37 |
| 2026-07-30 | Cursor | W15 offline-first (copy recomendado, 429→offline) | PR #37 |
| 2026-07-30 | Cursor | W14 happy-path CTA | PR #36 |
| 2026-07-30 | Cursor | W13 biblioteca Packs | PR #35 |
| 2026-07-30 | Cursor | W12 historial character_lock | PR #34 |
| 2026-07-29 | Cursor | W11 sesión chatbot 3 prompts + checklist | *(PR W11)* |
| 2026-07-29 | Cursor | Paso 0: W6 + W7–W10 + PLAN-NEXT → main | *(main)* |
| 2026-07-29 | Cursor | PLAN-NEXT W11–W17 (moat free post W6–W10) | *(PR #32)* |
| 2026-07-29 | Cursor | W6 desversionar mirrors + filter-repo | *(PR #31)* |
| 2026-07-29 | Cursor | W7–W10 producto (metrics→queue→safe-delete→backup ZIP) | *(PRs #27–#30)* |
| 2026-07-29 | Cursor | Merge W1–W5e → main | *(main)* |
| 2026-07-29 | Cursor | W5e extract routes/admin.js | *(PR W5e)* |
| 2026-07-29 | Cursor | W5d extract routes/import + generation | *(PR W5d)* |
| 2026-07-29 | Cursor | W5c extract routes/personas.js | *(PR W5c)* |
| 2026-07-29 | Cursor | W5b extract prompt-builder.js (UMD) | *(PR W5b)* |
| 2026-07-29 | Cursor | W5a extract import-flow.js (UMD) | *(PR W5a)* |
| 2026-07-29 | Cursor | W4 dHash consistencia ancla↔variante (gratis) | *(PR W4)* |
| 2026-07-29 | Cursor | W3 magic bytes — validación imagen en import/upload | *(PR W3)* |
| 2026-07-29 | Cursor | W2 CI GitHub Actions + `npm run smoke` (9 checks) | *(PR W2)* |
| 2026-07-29 | Cursor | W1 bind localhost + wizard PIN / SESSION_SECRET | PR #18 |
| 2026-07-29 | Cursor | Merge pila #4–#16 → main + smoke 9/9 + tests 59/59 | `e354525` (main) |
| 2026-07-29 | Cursor | Discard import preview + extract chatbot-packs | PR #16 |
| 2026-07-29 | Cursor | Onboarding founder + Copiar pack portafolio | PR #15 |
| 2026-07-29 | Cursor | P0 git opt-in + paths/SSRF/ownership + UX JSON-first | PR #14 |
| 2026-07-29 | Cursor | 1.2 Import confirm (preview sin persistir) | PR #13 |
| 2026-07-29 | Cursor | Matriz QA consistencia + banner 429 | PR #12 |
| 2026-07-28 | Cursor | Guía gráfica «Cómo usar» (hero + 4 pasos) | PR #11 |
| 2026-07-28 | Cursor | Presets nicho + kit marca ZIP | PR #10 |
| 2026-07-28 | Cursor | Onboarding member + Ajustes por rol | PR #9 |
| 2026-07-28 | Cursor | Backup UI + ownership API | PR #8 |
| 2026-07-28 | Cursor | Admin + invitaciones | PR #7 |

---

## Cómo actualizar este archivo

1. Fila en **Log de cambios**.
2. Actualizar **Estado exacto / Foco**.
3. Rellenar **Sesión reciente**.
