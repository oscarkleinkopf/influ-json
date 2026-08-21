# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan activo: [PLAN-UX.md](./PLAN-UX.md) · [PLAN-NEXT.md](./PLAN-NEXT.md) · Runbook W1–W10: [PLAN.md](./PLAN.md) · Roadmap: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados en foto/referencia), y un **JSON (`character_lock`)** que se pueda pegar en **chatbots gratuitos** para seguir desarrollando esos personajes sin pagar face-lock.

**Resumen de utilidad (UI):** *Un router de workflow, no de GPUs* — eliges el job (inspirar, UGC, producto, chatbot); el sistema fija el JSON y encadena pasos free. **Camino A (default):** Copiar JSON a chatbots gratis. **Camino B:** GPU NVIDIA / LoRA, solo si lo eliges.

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
| **Rama de trabajo** | `cursor/product-on-skin-polish-9b67` |
| **Commit base** | `08d4bb0` (`main`, [#146](https://github.com/oscarkleinkopf/influ-json/pull/146) product_on_face MERGED) |
| **PR actual** | Draft polish on-skin + import marcas vs `main` (esta rama). #146 MERGED. |
| **`main` remoto** | `product_on_face` (#146) + G513R checklist (#145) + dos caminos (#144) |
| **Prioridad inmediata** | Polish Camino A beauty on-skin: pack `product` honesto + ritual import pecas soft. No LoRA/NVIDIA/#99/Replicate/video. No esperar G513R. |
| **Aparcado** | S1 tokens API ≠ PIN · Comercial [#99](https://github.com/oscarkleinkopf/influ-json/pull/99) · overlays style-LoRA / marketplace · **cierre #142** (API write 403) · pack explicit discovery UI · cleaner auto de props en marks |

### Sesión reciente (Cursor, 2026-08-21) — On-skin polish + pecas ritual soft

**Pedido:** Continua tras #146 MERGED. Pack `product` on-skin vs en mano honestidad; import ritual marcas (pecas/lunar) soft → `distinctive_marks`. No G513R / LoRA / NVIDIA / #99 / Replicate.

**Hecho:**
- Pack `product`: default en mano intacto; con shot `product_on_face` → label `Producto on-skin`, `sceneInstructionOnSkin` endurecido (NO en mano, SKU esquina), header `Modo: ON-SKIN`.
- Packs ▾: botón renombra a «Producto on-skin» + hint verde cuando chip On-skin activo; Copiar JSON fullbody sin cambios.
- Import confirm: campo «Marcas (pecas / lunar)» + aviso props (parches/tarro/makeup) no van al lock; `applyImportConfirmTraits` → `facial_features.distinctive_marks` + `must_match.distinctive_marks` (sin schema nuevo).
- Tests: ugc / chatbot-packs / import-flow. `npm run build:index`.
- Rama `cursor/product-on-skin-polish-9b67`.

**No hecho (a propósito):** auto-cleaner de props en marks; auto-seleccionar On-skin en job Producto; NVIDIA/G513R/#99.

### Sesión previa (Cursor, 2026-08-21) — Shot `product_on_face` (pack product)

**Pedido:** Sigue. Corte recomendado: shot type `product_on_face` — close-up beauty con producto EN LA PIEL + SKU en esquina. Camino A / Copiar JSON. No clonar caras. No pecas ritual. No NVIDIA/LoRA.

**Hecho:**
- `ugc-shot-composer.js`: `product_on_face` junto a `product_demo` (label «Producto en la cara», suggested pack `product`).
- Chip On-skin en ficha (`views/tabs/persona-engine.html`) + `npm run build:index`.
- Pack `product`: `sceneInstruction` en mano intacto; `sceneInstructionOnSkin` si el shot está seleccionado.
- Plantilla beauty I4: lista `shots` + hook on-skin; default sigue testimonial.
- Tests: `npm test` **512/512**. Puppeteer Studio :3000: chip On-skin, Copiar JSON fullbody sin on-skin, pack `product` con shot → on-skin / close-up / SKU en esquina. Sin Pollinations.
- Rama `cursor/product-on-face-9b67` → **#146 MERGED** (`08d4bb0`).

**No hecho (a propósito):** pecas como campo ritual (hecho en polish siguiente); auto-seleccionar el shot en job Producto; NVIDIA/G513R/#99.

### Sesión previa (Cursor, 2026-08-21) — Pasada G513R (docs + verify VM)

**Pedido:** Sigue. Default next cut: validar Camino A/B de #143+#144 **sin código de feature**. Esta VM no es el G513R.

**Hecho:**
- `main` = `ab78462` (#144 squash). Receta: `toG513rClipboardText` sigue con `LoRA: … @ 0.8` y `models/loras`.
- `npm test` 510/510; `npm run smoke` 9/9.
- GUI Camino A en Studio :3000 (Puppeteer headed): default chatbots, Copiar JSON como producto, extras NVIDIA ocultos → visibles al cambiar a GPU → ocultos al volver. Sin exigir Pollinations.
- Checklist owner: [docs/G513R_SMOKE.md](./docs/G513R_SMOKE.md) (puntero en L4).

**No hecho (a propósito):** entrenar LoRA / generar en Ragnarok (no hay NVIDIA aquí). Pack explicit discovery. S1. #99. Replicate.

### Sesión previa (Cursor, 2026-08-21) — UX dos caminos (JSON primero)

**Pedido:** Continua tras corte 1 (#142). Hacer inequívocos Camino A (chatbots / Copiar JSON, default) vs Camino B (GPU NVIDIA local, opt-in). No promover LoRA en Portafolio en modo chatbots. No Replicate. No marketplace.

**Hecho:**
- Portafolio: job router marcado **Camino A · default · sin GPU**; card **Dos caminos** (A chatbots / B NVIDIA). Default `chatbots`.
- Cómo usar / founder / `happyPathLead`: una frase — Copiar JSON es el producto; GPU NVIDIA / LoRA es segundo camino opt-in.
- `#loraAdvancedPanel` + extras G513R siguen `data-nvidia-only`; `<html data-work-mode="chatbots">` de arranque.
- Tests: `test/ux-dos-caminos.test.js` + job-router / studio-work-mode. `npm run build:index`.
- Pack library y Replicate intactos.
- Draft PR: ManagePullRequest no está en el entorno; `gh pr create --draft` → **403** `Resource not accessible by integration`. Rama en origin; el padre puede abrir el draft.

### Sesión previa (Cursor, 2026-08-21) — Cerrar #142 (no merge)

**Pedido:** Corte 1: cerrar [#142](https://github.com/oscarkleinkopf/influ-json/pull/142) **sin merge** porque lo supersede [#143](https://github.com/oscarkleinkopf/influ-json/pull/143) (ya en `main`). No reabrir. No implementar UX two-paths.

**Hecho:**
- Confirmado: #143 `MERGED` (2026-08-21T00:12:25Z, head `cursor/lora-nvidia-bridge-9b67`). #142 `OPEN` + **draft** + `CONFLICTING` (head `cursor/of-explicit-pack-9b67`).
- Local: `git checkout main` + `git pull origin main` → `298eb46`.
- Cierre: ManagePullRequest no está en este entorno (subagente; GitHub MCP en error). `gh pr comment` / `gh pr close` / REST PATCH → **403** `Resource not accessible by integration`. El PR **sigue OPEN**.
- Comentario previsto (no publicado): superseded por #143; pack OF + dual NVIDIA/chatbots + puente LoRA ya en `main`; no mergear.

**Bloqueo:** token `ghs_` de integración sin `pull_requests: write`. El padre / usuario puede cerrar #142 a mano en GitHub (Close pull request, no merge).

### Sesión previa (Cursor, 2026-08-20) — G513R LoRA+trigger (corte mínimo)

**Pedido:** Plan plataformas similares / tema LoRA — corte mínimo: línea explícita `LoRA: <token> @ 0.8` en receta G513R + guía de carpeta `models/loras` en Locally Uncensored. No tocar Chatbots/Copiar JSON. No integrar Higgsfield/Sozee/Picovix. No hacer LoRA el tema del producto.

**Hecho:**
- `production-recipe.js`: `lora_line` + `lora_file_hint` en `inference`; bloque clipboard LORA; pasos post-train (copiar `.safetensors` → picker LU + trigger en Positive); helpers `g513rLoraLine` / `g513rTriggerLabel`
- Guía [docs/lora/L4_LOCAL_GPU.md](./docs/lora/L4_LOCAL_GPU.md) sección **Dónde poner el `.safetensors` (Locally Uncensored)** — Windows `%USERPROFILE%\Documents\ComfyUI\models\loras`, Linux `~/ComfyUI/models/loras`, A1111 `models/Lora`; LU solo escanea `ComfyUI/models/` (symlink / `extra_model_paths.yaml`); YouTube Load LoRA opcional
- Punteros cortos en L2 y L5 (Kohya SDXL en G513R; Flux = Colab L1, no Flux.2 en 8 GB)
- Hint `#localGpuCompanionHint`: one-liner `models/loras`
- Tests: clipboard `LoRA:` + trigger + `models/loras`; placeholder sin trigger; paths L4
- Chatbots sigue default; Copiar JSON intacto; LoRA = capa de identidad NVIDIA, no tema del producto

### Sesión previa (Cursor, 2026-08-20) — OF + modo dual G513R

**Pedido:** Pack OF/spicy + receta Juggernaut en notebook ASUS G513R (Ollama, LM Studio, Locally Uncensored). Modo para elegir NVIDIA local vs chatbots sin GPU. En LU, Positive y Negative se ingresan por separado.

**Hecho:**
- Pack `explicit` (PPV) + 3 prompts; ZIP `packs/explicit.txt`
- LU: `buildLuSplitPrompts` + botones Copiar negativo / positivo A–C (cajas distintas)
- Modo de trabajo Portafolio + Ajustes: `chatbots` (default) vs `nvidia`
- Receta G513R (4 checkpoints; Lustify nunca default; Ragnarok = PPV)
- `lora_trigger` en export L0; captions explícitos opt-in
- QA: 5 checks (cara/tez/pelo/silueta/anatomía)
- Spec: [docs/OF_SPICY_PACK.md](./docs/OF_SPICY_PACK.md)

### Sesión previa (Cursor, 2026-08-19) — L4 companion ComfyUI

**Pedido:** Corte concreto: nota en `L4_LOCAL_GPU.md` + hint en panel GPU (Locally Uncensored como gestor Comfy, sin integrar).

**Hecho:**
- Docs L4 + enlace en L2
- `#localGpuCompanionHint` en ficha (Avanzado · GPU local)
- `updateLocalGpuCompanionHint`: off / offline / online — sin filtrar URLs internas
- Tests `test/l4-comfy-companion.test.js` + ampliación `local-gpu-hub`

### Sesión previa (Cursor, 2026-08-19) — Job router Portafolio → `main`

**Pedido:** Implementar job router (inspirar / chatbot / UGC / producto) y merge.

**Hecho:**
- Card «¿Qué quieres hacer?» en Portafolio (`views/tabs/dashboard.html`) + CSS + `runJobRouterAction` en `app.js`
- Inspirar → acciones rápidas; Chatbot → `copy-pack` fullbody; UGC → `ugc-studio`; Producto → pack producto
- `happyPathLead` alineado · `test/job-router.test.js` · `npm run build:index`

### Sesión previa (Cursor, 2026-08-19) — Tagline utilidad → `main`

**Pedido:** Usar en la plataforma la frase «router de workflow, no de GPUs» como resumen de utilidad (tras investigar Aurea); luego merge.

**Hecho:**
- Portafolio, Cómo usar, onboarding founder, `app.js`, README, `docs/index.html`
- `npm run build:index` · test `test/tagline-router-workflow.test.js`
- Rama `cursor/tagline-router-workflow-d862` → **mergeado en `main`** (`b970edb`)
- Frase: *Un router de workflow, no de GPUs: eliges el job (inspirar, UGC, producto, chatbot); el sistema fija el JSON y encadena pasos free.*

### Sesión previa (Cursor, 2026-08-18) — #139 mergeado

**Pedido:** Revisar y mergear el corte de acciones rápidas.

**Hecho:**
- [#139](https://github.com/oscarkleinkopf/influ-json/pull/139) → `main` (CI Test & smoke verde)
- Flujo guiado en Portafolio: URL / foto / a mano → analizar → JSON → editar → guardar

### Sesión previa (Cursor, 2026-08-18) — Acciones rápidas dashboard

**Pedido:** Flujo guiado Dashboard → origen → analizar → revisar JSON → editar → guardar.

**Hecho:**
- `#quickCreateCard` con `btnQuickImportUrl` / `btnQuickImportPhoto` / `btnQuickManualPersona`
- URL abre el modal y enfoca `#importUrl`; foto enfoca `#importImages`; manual abre ficha y enfoca `#pName`
- Import: modo URL vs foto, JSON a la vista, copiar o abrir en editor
- Endpoints existentes (`/api/import-influencer`, `/api/personas`)

### Sesión previa (Cursor, 2026-08-15) — Corte F → main

**Pedido:** Intentar LAN en casa ahora; NAS más potente más adelante.

**Hecho:**
- [#137](https://github.com/oscarkleinkopf/influ-json/pull/137) → `main`
- Sesiones SQLite en bind público · PIN≥6 · allowlist · límites · audit auth
- Runbook **LAN casera** en `docs/SECURITY_MARKET.md`

### Sesión previa (Cursor, 2026-08-15) — Corte F LAN casera

**Pedido:** Intentar LAN en casa ahora; NAS más potente más adelante.

**Hecho:**
- Sesiones SQLite si `HOST=0.0.0.0` (`session-store.js` + migración 12)
- PIN uniforme ≥6 + anti-trivial; allowlist Host/Origin opt-in; HSTS condicional
- Límites JSON/upload más estrictos en bind público; audit login/logout/PIN
- Runbook **LAN casera** en `docs/SECURITY_MARKET.md`

### Sesión previa (Cursor, 2026-08-15) — Polish-3 → main

**Pedido:** Polish de restos.

**Hecho:**
- [#135](https://github.com/oscarkleinkopf/influ-json/pull/135) → `main`
- Checklist sin botones duplicados · Guiones · alts ES · prefiere Copiar JSON

### Sesión previa (Cursor, 2026-08-15) — Polish-3

**Pedido:** Polish de restos (checklist, ES Scripts, voseo, alts).

**Hecho:**
- Checklist: oculta botones de paso si roster vacío
- Scripts → Guiones; Regenerar guiones; alts ES; prefiere Copiar JSON

### Sesión previa (Cursor, 2026-08-15) — Polish-2 → main

**Pedido:** Otro polish.

**Hecho:**
- [#133](https://github.com/oscarkleinkopf/influ-json/pull/133) → `main`
- Cómo usar · ES titles · settings/import a11y · CTA vacío único

### Sesión previa (Cursor, 2026-08-15) — Polish-2

**Pedido:** Otro polish.

**Hecho:**
- Cómo usar: start-studio + plantillas/brief + Licencias
- ES: Guiones / Licencias; sin voseo residual
- a11y: settings + import dialogs
- Empty roster: un solo cluster de CTAs (Portafolio)

### Sesión previa (Cursor, 2026-08-14) — Polish fino → main

**Pedido:** Polish fino.

**Hecho:**
- [#131](https://github.com/oscarkleinkopf/influ-json/pull/131) → `main`
- Declutter roster vacío · copy CTA · ¡Copiado! · ES · login a11y

### Sesión previa (Cursor, 2026-08-14) — Polish fino

**Pedido:** Polish fino.

**Hecho:**
- Dashboard: plantillas/brief ocultos si roster vacío
- Copiar JSON sin persona / fallo clipboard → toast + CTA; feedback «¡Copiado!»
- Tuteo ES (Elige); UGC título en español; `loginModal` dialog a11y

### Sesión previa (Cursor, 2026-08-14) — I4 + U1 → main

**Pedido:** Merge y continua (tras IR plantillas).

**Hecho:**
- [#128](https://github.com/oscarkleinkopf/influ-json/pull/128) I4 plantillas → `main`
- [#129](https://github.com/oscarkleinkopf/influ-json/pull/129) U1 launcher → `main` (Node 18+, abre browser, `pack:release`)
- Pages / modal estático: arranque con `start-studio` (un clic)

### Sesión previa (Cursor, 2026-08-14) — I4 → main · U1 en curso

**Pedido:** Merge y continua.

**Hecho:**
- [#128](https://github.com/oscarkleinkopf/influ-json/pull/128) I4 → `main`
- U1: launchers abren navegador + Node 18+ + `npm run pack:release` (ZIP sin secretos)

### Sesión previa (Cursor, 2026-08-14) — I4 plantillas

**Pedido:** IR plantillas (I4).

**Hecho:**
- `community-templates.js` — 4 nichos curados; validación sin `must_match`/fotos
- Dashboard: card **Plantillas de producción**
- Tests: `test/corte-i4-community-templates.test.js`
### Sesión previa (Cursor, 2026-08-14) — I2 → main

**Pedido:** Se pierden (qué producir).

**Hecho:**
- [#126](https://github.com/oscarkleinkopf/influ-json/pull/126) → `main`
- Card **Qué producir ahora**: brief → checklist + CTAs (sin IA extra)

### Sesión previa (Cursor, 2026-08-14) — Corte G → main

**Pedido:** Corte G.

**Hecho:**
- [#124](https://github.com/oscarkleinkopf/influ-json/pull/124) CI verde → mergeado a `main`
- Activación local 5/5, prueba de identidad, Lock lab A/B, recetas de producción

### Sesión previa (Cursor, 2026-08-14) — Corte E → main

**Pedido:** Continuemos con corte E.

**Hecho:**
- [#122](https://github.com/oscarkleinkopf/influ-json/pull/122) CI verde → mergeado a `main`
- Autosave borradores, CSRF recovery, must_match diff, dialogs a11y, mobile-414 smoke
- Rutas Express + banner al abrir Crear

### Sesión previa (Cursor, 2026-08-13) — CI autónomo + Corte D

**Pedido:** ¿Puedo revisar los tests en GitHub yo mismo?

**Hecho:**
- Sí — `gh pr checks` / `gh pr view` (sin esperar aviso manual)
- [#120](https://github.com/oscarkleinkopf/influ-json/pull/120) CI verde → mergeado a `main`
- [#121](https://github.com/oscarkleinkopf/influ-json/pull/121) Corte D → `main`

### Sesión previa (Cursor, 2026-08-13) — Merge #119 + Corte C

**Pedido:** Tests de #119 OK → integrar y seguir.

**Hecho:**
- [#119](https://github.com/oscarkleinkopf/influ-json/pull/119) → `main` (Corte B)
- Arranque **Corte C**: `npm run doctor`, support-bundle, restore 2 fases + `quick_check`, `start-studio.sh`/`.cmd`

### Sesión previa (Cursor, 2026-08-13) — Merge #118 + Corte B

**Pedido:** Tests de #118 pasaron → integrar y seguir.

**Hecho:**
- [#118](https://github.com/oscarkleinkopf/influ-json/pull/118) → `main` (Corte A)
- Arranque **Corte B**: SSRF IPv4-mapped + DNS resolve, CR/LF `.env`, stats scoped, sync admin, GPU URLs masked, import heavy rate-limit

### Sesión previa (Cursor, 2026-08-13) — Integrar análisis + Corte A

**Pedido:** Integrar el análisis y decidir cómo seguir.

**Hecho:**
- [#117](https://github.com/oscarkleinkopf/influ-json/pull/117) → `main` (análisis + roadmap por cortes)
- Arranque **Corte A** (P0 del análisis):
  - Batch ads: `authFetch` + `enqueue(label, jobFn)` + ownership `batch-status`
  - `brace-expansion` → 5.0.9; CI `npm audit --omit=dev --audit-level=high`
  - Gate estático `csrf-fetch-gate`; `completedCount` en `gen-queue`
  - Tests `bulk-ads` + gen-queue completedCount
- Siguiente tras A: **Corte B** (SSRF IPv4-mapped/DNS, CR/LF `.env`, scope stats/sync)

### Sesión previa (Cursor, 2026-08-13) — Análisis integral post-CSRF

**Pedido:** Revisar el proyecto y documentar ideas de funcionamiento, usabilidad y seguridad.

**Hecho:**
- `docs/ANALISIS_PROYECTO_2026-08.md` — auditoría + roadmap por cortes
- P0 encontrado: batch ads usa `fetch` sin CSRF y firma incorrecta de `genQueue.enqueue`
- P0 supply-chain: advisory high transitivo `brace-expansion@5.0.7`
- P0 red/integridad: SSRF IPv4-mapped/DNS + CR/LF en valores `.env`
- Siguiente recomendado: reparar P0 → Doctor/launcher → schema portable v1

### Sesión previa (Cursor, 2026-08-13) — Merge #115 CSRF

**Pedido:** CI verde en #115 (Test & smoke #240).

**Hecho:**
- [#115](https://github.com/oscarkleinkopf/influ-json/pull/115) → `main` (CSRF synchronizer + fixes smoke/layout-smoke)

### Sesión previa (Cursor, 2026-08-13) — CSRF mutaciones cookie

**Pedido:** Seguir con CSRF tras #113.

**Hecho:**
- `auth.csrfProtection` + token en login / status / me / redeem / change-pin
- Front `authFetch` envía `X-CSRF-Token`; Bearer/CLI exento
- Tests `sec-csrf` + helpers de sesión; docs SECURITY_MARKET
- `CSRF_PROTECTION=0` para apagar

### Sesión previa (Cursor, 2026-08-13) — Merge #113 seguridad mercado

**Pedido:** CI verde en #113.

**Hecho:**
- [#113](https://github.com/oscarkleinkopf/influ-json/pull/113) → `main` (checklist + slim status + queue auth)
- Guía: `docs/SECURITY_MARKET.md`

### Sesión previa (Cursor, 2026-08-13) — Seguridad de mercado

**Pedido:** Tras #112, checklist seguridad mercado (docs + hardening alto valor).

**Hecho:**
- [#112](https://github.com/oscarkleinkopf/influ-json/pull/112) → `main` (walkthrough import P0)
- `docs/SECURITY_MARKET.md` — threat model, checklist LAN/VPS, runbook, mapa de tests
- `/api/status` sin auth: sin `dataDir`/`dbPath`/URLs internas; flags free/face-lock OK
- `/api/queue-status` detrás de `requireAuth`
- Warn arranque: guía + TRUST_PROXY sin `COOKIE_SECURE`
- Tests `sec-market` + fix `api-queue`; links README / AGENTS / `.env.example`
- Fuera de alcance: CSRF completo, HSTS, quitar CSP `'unsafe-inline'`, #99

### Sesión previa (Cursor, 2026-08-13) — Walkthrough ritual import P0

**Pedido:** Merge #111 + walkthrough import al nivel de crear desde cero.

**Hecho:**
- [#111](https://github.com/oscarkleinkopf/influ-json/pull/111) → `main` (cierra §12 idea #6)
- Walkthrough: subir JPEG → confirmar tez/ojos/pelo → Guardar → `data-step2-focus` → Copiar JSON
- Stub Gemini/Pollinations en el script; capturas `08`–`08d`
- §12 backlog cerrado + free path «inspirados» paridad P0

### Sesión previa (Cursor, 2026-08-13) — Idea #6 README / Cómo usar

**Pedido:** Continúa con 5 y después 6.

**Hecho:**
- [#110](https://github.com/oscarkleinkopf/influ-json/pull/110) → `main` (cierra #5)
- README: hubs reales (Influencers / Producir / Negocio), Copiar JSON, Offline chip
- Cómo usar: mapa de UI + flujo Ficha → Portafolio → Copiar JSON
- Checklist Portafolio: sin «Persona Engine»
- Siguiente: walkthrough import ritual

### Sesión previa (Cursor, 2026-08-13) — Idea #5 chrome primer uso

**Pedido:** Merge y #5.

**Hecho:**
- [#109](https://github.com/oscarkleinkopf/influ-json/pull/109) → `main`
- «Más tarde» PIN: sin barra + sin toast; hint en Ajustes → Perfiles
- Offline: chip sidebar (`#offlineModeChip`); eliminada `#offlineModeBar`
- Git / Ajustes / Sync en `<details id="sidebarStudioTools">` colapsado
- Siguiente: idea #6 alinear README / Cómo usar

### Sesión previa (Cursor, 2026-08-13) — Idea #4 UX-1c ≤3 Copiar JSON

**Pedido:** Continua (tras #108).

**Hecho:**
- [#108](https://github.com/oscarkleinkopf/influ-json/pull/108) → `main`
- Solo 3 botones exactos «Copiar JSON»: header · pack primary · happy-path dashboard
- UGC → «Copiar pack producto»; Cómo usar → «Ir a Lock & Packs»; pollen → «Usar path free»
- Test estricto en `test/ux1-ia-navegacion.test.js`
- Siguiente: idea #5 silenciar chrome / #6 README

### Sesión previa (Cursor, 2026-08-13) — Idea #3 ritual inspirar desde foto

**Pedido:** Mergea #107 y seguimos.

**Hecho:**
- [#107](https://github.com/oscarkleinkopf/influ-json/pull/107) → `main`
- Modal «Inspirar desde foto»: pasos Subir → Confirmar tez/ojos/pelo → Guardar → Copiar JSON
- `applyImportConfirmTraits` escribe `must_match` en `detailedJSON.character_lock`
- Tras guardar: `setStep2Focus` + toast Copiar JSON (igual que crear desde cero)
- Walkthrough: paso `import-ritual-ui` + captura `08-import-ritual.png`
- Siguiente: idea #4 UX-1c ≤3 Copiar JSON

### Sesión previa (Cursor, 2026-08-13) — Idea #2 lock Identidad

**Pedido:** Mergea #106 y seguimos con 2.

**Hecho:**
- [#106](https://github.com/oscarkleinkopf/influ-json/pull/106) → `main`
- `suggestLatinaLightSkinFix` en validador; hint en Identidad + botón «Usar Latina de tez clara»
- Score lock inline en paso 1 (`#identityLockHealthInline`)
- Soft nudge al guardar (no bloquea)
- Siguiente: idea #3 ritual inspirar desde foto

### Sesión previa (Cursor, 2026-08-13) — Paso 2 · primer JSON

**Pedido:** Actualizar doc con ideas e implementar empezando por #1.

**Hecho:**
- [PLAN-UX.md §12](./PLAN-UX.md) backlog post-UX (6 ideas)
- Tras **Crear influencer**: `data-step2-focus=1` — oculta Biblia, pose/UGC, chips cámara, identidad detalle, panel derecho
- Banner «Primer JSON» + «Ver herramientas completas»
- Walkthrough + layout-smoke comprueban foco
- Siguiente: idea #2 lock honesto en Identidad

### Sesión previa (Cursor, 2026-08-13) — Merge #104

**Pedido:** Marca listo, mergea y veamos cómo seguimos.

**Hecho:**
- [#104](https://github.com/oscarkleinkopf/influ-json/pull/104) → `main` (CI verde)
- Happy path UI create→guardar→Copiar JSON en `main`
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-13) — Merge #103 + happy path UI

**Pedido:** Dale con merge, happy path.

**Hecho:**
- [#103](https://github.com/oscarkleinkopf/influ-json/pull/103) → `main` (UX-2 DoD)
- Validación: `npm run walkthrough` + `npm run layout-smoke` OK en Chrome
- Walkthrough ahora cubre **crear en UI → Guardar → aparece → Copiar JSON** (P0; ya no crea solo por API)
- Dismiss correcto de `#founderWelcomeModal` (antes se ocultaba un id inexistente y el modal bloqueaba Galería/Campañas)
- Capturas: `/opt/cursor/artifacts/screenshots/happy-path/` (+ `00-crear-form`, `00b-tras-guardar`)
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-13) — UX-2 DoD estricto (Avanzado único + alturas)

**Pedido:** Terminar lo pendiente de UX-2/UX-3.

**Hecho (PR #103):**
- Un solo `#personaAdvancedTools`: A/B + versiones personaje + character_lock + LoRA
- Crear Identidad ≤1800px (smoke 1712) y ≤40 controles
- Paso 2: pack/Copiar JSON arriba de la ficha (above-fold); check `persona-step-2-fit`
- UX-3 ya estaba cerrado; sin cambios comerciales

### Sesión previa (Cursor, 2026-08-13) — Merge #102 + Identidad compacta

**Pedido:** Continuar con #102 y UX.

**Hecho:**
- [#102](https://github.com/oscarkleinkopf/influ-json/pull/102) → `main`
- Paso 1 crear: oculta muro Crear + Biblia; Archivar/Eliminar solo en edición; edad/vibe y boceto en details
- `data-form-open` / `data-creating`; panel derecho y prompt compilado solo en paso 2
- layout-smoke: check `persona-create-compact`; expone `window.state`/`selectPersona` para evaluate
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-12) — Smoke visual Negocio + Persona pasos

**Pedido:** Seguir con smoke visual.

**Hecho (rama `cursor/ux-empty-persona-steps-9b67` / PR #102):**
- `layout-smoke`: dashboard + pasos 1–3 + Licensing chip + Campañas empty/precheck; report JSON; CI sube todos los PNG
- Walkthrough: capturas `01b-persona-step-*` + `07a-campaigns-empty`
- Ambos OK en Chrome headless (artifacts bajo `/opt/cursor/artifacts/screenshots/`)
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-12) — Merge #101 + empty states + UX-2 fino

**Pedido:** Mergear #101 y continuar con (1) empty states y (3) UX-2 Persona Engine.

**Hecho:**
- [#101](https://github.com/oscarkleinkopf/influ-json/pull/101) → `main`
- Campañas vacías: 1 CTA (ocultar header); sin roster → «Crear influencer»
- Historial vacío → «Ir a Copiar JSON» (paso 2)
- Identidad: must_match visible; extras en `<details>`; Avanzado se pliega al cambiar paso
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-12) — Honesty Glow Serum + walkthrough Negocio

**Pedido:** Continuar (#101).

**Hecho (rama `cursor/ux-active-persona-9b67` / PR #101):**
- Script Engine / Licensing / UGC mock: sin defaults falsos «Glow Serum Organics»; placeholders honestos
- `generateMockScripts`: producto desde form/`selectedProduct` o «tu producto» (10 ángulos)
- Walkthrough: paso Negocio — Licensing = chip; Nueva campaña pre-checkea influencer activo
- Tests UX-1d + suite 362 pass
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-12) — UX contexto activo en Guiones + Licensing

**Pedido:** Continuar el bloque de desarrollo (UX-1b).

**Hecho (rama `cursor/ux-active-persona-9b67` / PR #101):**
- Script Engine: readout sincronizado con chip/UGC
- Import: «Copiar estructura»
- Licensing: card `#licenseActive*` + pitch sin Sofia falsa; copiar/descargar exige influencer
- Campañas: pre-check del influencer del chip + hint si roster vacío
- UX-1c: CTAs unificados a «Copiar JSON» (sin chrome «(recomendado)»); Persona Engine sin Sofia placeholder
- Comercial sigue aparcado

### Sesión previa (Cursor, 2026-08-12) — Free path tests; comercial pending

**Pedido:** Dejar lo comercial pendiente; seguir desarrollo + más pruebas.

**Hecho:**
- Foco = happy path free + regresión automatizada (sin red)
- `test/free-path-regression.test.js`: checklist copy≠gen, skinny→packs, export ZIP 4 packs, gen stub
- Walkthrough: clipboard debe contener `character_lock` (falla si vacío)
- Comercial / billing / empaquetado Win / deploy Render → parking hasta más adelante

### Sesión previa (Cursor, 2026-08-12) — Merge #97 + Galería declutter

**Pedido:** Mergea #97 y sigamos con Galería / Produce declutter y walkthrough happy path.

**Hecho:**
- [#97](https://github.com/oscarkleinkopf/influ-json/pull/97) → `main`
- Galería fuera del hub Producir; entrada desde ficha (`Ver galería`)
- Empty gallery → CTA «Ir a Copiar JSON» (paso 2)
- Walkthrough happy path (capturas en `/opt/cursor/artifacts/screenshots/happy-path/`)
- Script `npm run walkthrough` → Produce = UGC+Guiones ✅; Ver galería ✅; empty→Copiar JSON

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
| 2026-08-21 | Cursor | **G513R smoke**: checklist owner + verify Camino A en VM (`docs/G513R_SMOKE.md`); sin feature | *(este PR)* |
| 2026-08-21 | Cursor | **UX dos caminos (JSON primero)**: Camino A Copiar JSON default; Camino B NVIDIA opt-in; LoRA `data-nvidia-only` | `ab78462` (#144) |
| 2026-08-21 | Cursor | **#142 superseded por #143**: OF pack + dual mode + LoRA NVIDIA ya en `main`; cierre API 403 (sigue OPEN/draft) | `298eb46` (#143) |
| 2026-08-20 | Cursor | **G513R LoRA+trigger**: línea `LoRA: token @ 0.8` + carpeta LU `models/loras`; Chatbots intacto | `298eb46` (#143) |
| 2026-08-20 | Cursor | **OF + modo dual G513R**: pack explicit; LU cajas +/- separadas; chatbots vs NVIDIA | `298eb46` (#143) |
| 2026-08-15 | Cursor | **Corte F LAN casera**: SQLite sessions, PIN≥6, allowlist, límites, audit auth | *(este PR)* |
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
