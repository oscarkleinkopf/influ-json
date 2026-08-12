# influ-JSON — Roadmap (cero costo primero)

## Filosofía de producto (no negociable)

**Público objetivo:** pequeños emprendedores que deben poder:

1. Crear y mantener un **roster de influencers virtuales**  
2. Generar UGC (imagen + guión + export)  
3. **Sin pagar APIs de imagen ni face-lock** hasta que la marca genere ingresos  

**Pilares free:**

| Pilar | Cómo |
|--------|------|
| Estudio local | Node + SQLite, sin suscripción |
| Generación imagen | **Pollinations** (gratis) + offline |
| Integridad de personaje | **JSON `character_lock`** copiable a chatbots gratis (ChatGPT / Gemini / Claude / Meta…) |
| Face-lock de pago (Replicate, etc.) | **Opcional y futuro** — se suma, **nunca sustituye ni rompe** el path free |

> Si una feature exige tarjeta de crédito para el caso básico, no es v1.

---

## Estado del núcleo (2026-07)

### Ya logrado (proteger)
- [x] Roster SQLite + create/import/save/archive (forceCreate 1.3)
- [x] UI refresh post-crear; contador = tarjetas visibles (1.5)
- [x] DB portable `data/influ.sqlite` (1.6)
- [x] Toasts unificados (1.4)
- [x] JSON con **cuerpo** + ficha “Cuerpo completo”
- [x] Skin lock (tez clara / hex; anti-sesgo Latina→morena)
- [x] Variantes traditional + spicy; bikini / playa
- [x] Identity prompt unificado; seed por persona
- [x] Full-body: no congelar close-up del retrato (text-first framing)
- [x] Aspect square para retratos (anti-alargamiento)
- [x] Export chatbot con **character_lock** free-tier
- [x] Abstracción `image-provider.js` (Pollinations default; Replicate hueco futuro)

### Límites honestos del free path (Pollinations)
- No hay embedding facial dedicado → spicy/cuerpo entero pueden **desviar cara** más que un InstantID  
- Rate limit 429 ocasional → reintentos + mensaje claro  
- JSON + chatbots gratis = **mejor ancla de identidad** multi-herramienta sin costo  

---

## Etapas de producto (orden del usuario)

| Orden | Etapa | Meta |
|-------|--------|------|
| 1 | **Núcleo free** | Prompts + `character_lock` JSON → chatbots gratis (crear o inspirar) |
| 2 | **Usabilidad** | Happy path claro, F4/F6, menos fricción al exportar packs ✅ |
| 3 | **Seguridad + perfiles** ✅ | PIN/sesiones + Administración + invitaciones + onboarding member |
| 4 | Replicate / video / paid | Solo opt-in; nunca rompe free |

---

## Fase actual — Maximizar free + usabilidad (Pollinations + JSON)

**Meta:** sacar el máximo del path cero costo y pulir UX antes de seguridad de lanzamiento / Replicate.

| # | Entregable | Criterio de hecho |
|---|------------|-------------------|
| F1 | `character_lock` en todo save/export + **validador local de salud** | Copiar a ChatGPT free reproduce la misma persona en 3 prompts distintos; panel muestra score/avisos antes de copiar ✅ |
| F2 | Documentar “flujo emprendedor gratis” en README corto | Un novato entiende: Studio + copiar JSON a chatbot ✅ |
| F3 | Variantes: rate-limit UX + cola simple (1 gen a la vez) | No spamear Pollinations; toast/chip “espera Ns” + botones disabled ✅ |
| F4 | Side-by-side ancla vs última gen (gratis) | Usuario juzga consistencia sin API de scoring ✅ |
| F5 | Prompt packs free (chatbot): cuerpo entero / bikini / spicy / producto en mano | 4 plantillas que reusan `character_lock` ✅ |
| F6 | Happy path 60s en dashboard | Nuevo → guardar → 1 gen → copiar JSON ✅ |

**No hacer en esta fase:** multi-tenant, billing, OAuth, video full, requerir Gemini key.

---

## Fase siguiente — Replicate opcional (sin perder free)

**Principio:** feature flag. Default = Pollinations. Replicate solo si hay token **y** el usuario elige “mejor cara (pago)”.

| # | Entregable | Criterio de hecho |
|---|------------|-------------------|
| R0 | `IMAGE_PROVIDER=pollinations\|replicate` en `.env` | Sin token → siempre free | ✅ |
| R1 | `image-provider.generateWithOptionalFaceLock` (PuLID/InstantID) | Con token: variantes pueden usar face-lock | ✅ |
| R2 | UI toggle “Face-lock mejorado (pago)” off por defecto | Emprendedor free no ve costos sorpresa | ✅ |
| R3 | Fallback automático a Pollinations si Replicate falla | Nunca pantalla rota | ✅ |
| R4 | Métricas locales: free vs paid gens (contador SQLite) | Decidir cuándo conviene pagar | ✅ |

**Activación:** `ENABLE_PAID_FACE_LOCK=1` + `REPLICATE_API_TOKEN` (token solo no basta). Guía: [`docs/FACELOCK_R.md`](./docs/FACELOCK_R.md).

**Regla de regresión:** todo test manual free (Daniela 3 body/skin/spicy) debe seguir pasando **con Replicate desactivado**.

---

## Fase L — LoRAs de personaje (opt-in, sin romper free)

**Idea:** subir la consistencia de identidad de "suave" (prompt + `character_lock`) a "dura" (un modelo entrenado que fija cara/estilo). Es el **tier avanzado** por encima de Pollinations/Replicate. **Nunca** reemplaza el path free: feature flag + fallback a `character_lock`/Pollinations, igual que la Fase R.

**Lo que ya juega a favor:** el vault `persona_variants` + `character_lock` ya produce el **dataset** (imágenes coherentes) y los **captions** de entrenamiento. `image-provider.js` es el punto de extensión (`PROVIDERS.lora`), y `gen-queue.js` sirve para trabajos largos.

**Pipeline (5 etapas):** dataset (15–30 imgs curadas del vault) → caption (trigger token + rasgos del `character_lock`) → entrenar (Flux/SDXL LoRA vía `ai-toolkit`/kohya) → hospedar pesos (`DATA_DIR/loras/<personaId>/*.safetensors`) → inferir aplicando la LoRA.

| # | Entregable | Criterio de hecho |
|---|------------|-------------------|
| L0 | **Training pack export** (zip: dataset + captions desde `character_lock`) ✅ | Cero costo, sin GPU; desde una persona con variantes se baja un `.zip` listo para entrenar |
| L1 | **Notebook Colab gratis** (`ai-toolkit` Flux LoRA) ✅ | Consume el pack de L0 y devuelve `.safetensors`; documentado paso a paso (`docs/lora/`) |
| L2 | **Inferencia local (ComfyUI opcional)** ✅ | Aplica la LoRA con fallback automático a Pollinations si no hay pesos/GPU |
| L3 | **Proveedor pago opt-in** (Replicate/fal LoRA trainer) ✅ | Entrenar + inferir "un clic" detrás de `ENABLE_PAID_LORA=1`; nunca rompe free |
| L4 | **Hub inferencia local (ComfyUI + A1111/Forge)** ✅ | Detectar backends, gens con/sin LoRA (`PREFER_LOCAL_GPU`); sin train; fallback Pollinations |
| L4c | **Plantilla Flux Comfy** ✅ | `docs/lora/comfy_workflow_flux_lora.json` + `L4C_FLUX_WORKFLOW.md` |
| L5 | **Train local (orquestador)** ✅ | `ENABLE_LOCAL_LORA_TRAIN`; materializa pack L0 + spawn opt-in (`AI_TOOLKIT_DIR` / `LOCAL_LORA_TRAIN_CMD`); nunca rompe free |

**Modelo de datos propuesto:** tabla `persona_loras` (`persona_id`, `trigger_token`, `base_model`, `weights_path/url`, `status`, `training_meta`) con estados `none|dataset_ready|training|ready|failed`.

**Provider:** `image-provider.generateWithLora({ personaId, prompt })` que usa la LoRA si `status=ready`, si no `return null` → fallback (mismo patrón que `generateWithOptionalFaceLock`). Hub L4: `local-gpu/` + `generateWithLocalGpu` cuando `PREFER_LOCAL_GPU=1`.

**Cómputo (free-first):** Colab free (T4) para entrenar → self-host ComfyUI/A1111 o Replicate/fal para inferir. Investigar si Pollinations BYOP / `/account/my-models` sirve para servir la LoRA propia.

**Riesgos:** chicken-and-egg de consistencia (curar dataset desde anclas fuertes antes de entrenar); requiere GPU (por eso L1 = Colab, no local); IP/licensing (registrar la LoRA como activo en el certificador); ToS de contenido en modo spicy.

**Regla de regresión:** con LoRA desactivada, todo el path free (JSON + Pollinations) sigue igual. L0 debe funcionar sin token, sin GPU y sin pago.

**Arranque:** L0–L5 ✅ (L5 = orquestador train local opt-in; free path = JSON + Colab L1 + Pollinations).

---

## Semana 1 — Mecánica (cerrada en lo esencial)

| # | Tarea | Estado |
|---|--------|--------|
| 1.3 | forceCreate | ✅ |
| 1.4 | Toasts | ✅ |
| 1.5 | Contador filtrado | ✅ |
| 1.6 | DB portable | ✅ |
| 1.1 | QA matrix (retrato/cuerpo/spicy + checklist) | ✅ (panel ficha + `qa-matrix.js`) |
| 1.2 | import confirm | ✅ (`previewOnly` → confirmar / descartar) |

---

## Semana 2+ — Loop UGC free + integridad

| # | Tarea | Estado |
|---|--------|--------|
| 2.3 | Estados 429 / offline | ✅ (chip + banner sticky + disable gens) |
| 2.4 | Side-by-side ancla | ✅ (F4) |
| 2.5–2.6 | Script + export pack | ✅ ZIP persona (`/api/export/persona/:id`) |
| JSON chatbot | character_lock | ✅ |
| Image provider stub | free-first | ✅ |

---

## Log de progreso

| Fecha | Hecho | Notas |
|-------|--------|-------|
| 2026-08-12 | **UX-4** módulos JS + CSS | toast/queue/form/card UMD; `readPersonaForm`; btn-compact |
| 2026-08-11 | **UX-4** parciales HTML | `views/` + `composeIndexHtml`; `npm run build:index` |
| 2026-08-11 | **UX-2** Persona Engine 3 pasos | Identidad / Lock&Packs / Variaciones; Avanzado plegado |
| 2026-08-11 | **GitHub Pages** estático honesto | Modal en raíz `main` `/`; Pages ≠ Studio (`npm start`) |
| 2026-08-11 | **UX-1** IA navegación (#88) | Hubs Influencers/Producir/Negocio; chip global; ≤3 Copiar JSON |
| 2026-08-11 | **Free Path consolidar** (#87) | Copiar JSON primero; sin GPT-5.6/Meta Ads live; dedupe packs; toasts honestos |
| 2026-08-11 | **UX-3** honestidad UI | Scripts campaña cableados; stats reales; vídeo DEMO; sin alert/showSyncToast |
| 2026-08-11 | **UX-0** layout: nesting HTML + móvil + offline bar + test estructura | `</div>` sobrante; `test/html-structure.test.js` |
| 2026-08-11 | **ugc face pack** 6 ángulos + texto free | `face-pack.js`; regenerate opt-in Pollinations |
| 2026-08-11 | **ugc camera/shots** chips + 7 formatos + semana | `ugc-shot-composer.js`; packs Layer 4 |
| 2026-08-11 | **ugc-creator anchors** asimetría + realism/negative packs | `facial_asymmetry`; Layer 5 + negative en free packs |
| 2026-08-10 | **Mirror policy** backup sin binario influ.sqlite | git-backup → personas.json only |
| 2026-08-10 | **FK CASCADE** foreign_keys ON + test delete | pragma + delete-cascade.test.js |
| 2026-08-10 | **Front smoke P0** serve index/app.js + save→appear | `test/frontend-smoke.test.js` en npm test |
| 2026-08-08 | **Walkthrough W11** sesión chatbot (cerrado) | Sin P0; Daniela (#2) aparcado hasta PC |
| 2026-08-10 | **Harness git creds** remote limpio + helper | Sin `x-access-token` en URL; `gh auth git-credential` |
| 2026-08-10 | **Skills activation** Use when + expected output | 3 SKILL.md + skills-activation.test.js |
| 2026-08-07 | **Pack resilience** + PIN skip localhost | `normalizePersonaForPack`; CLI export-pack; wizard «Más tarde» |
| 2026-08-06 | **UX free** JSON primary + pollen→Ajustes | Fullbody CTA; banner dual; authFetch pollen-safe; gen auth→402 |
| 2026-08-06 | **Sec #5** Permissions-Policy + COOP/CORP | Headers en `securityHeaders` tras CSP |
| 2026-08-06 | **Sec #4** API abuse rate-limit | Sliding window heavy/default; `auth.apiRateLimit`; generate/upload/analyze |
| 2026-08-06 | **Fase R R0–R4** face-lock Replicate opt-in | `ENABLE_PAID_FACE_LOCK`; InstantID/PuLID; UI toggle off; fallback Pollinations; métricas |
| 2026-08-06 | **Pulido free** guide/checklist/vocab | Cómo usar → JSON primary; 3/3 core; member pollen honesto; prompt≠pack |
| 2026-08-06 | **Sec #3** session regenerate (anti-fixation) | Login + invite redeem + change-pin; `establishAuthenticatedSession` |
| 2026-08-06 | **L5 train local** orquestador opt-in | `ENABLE_LOCAL_LORA_TRAIN`; materialize + spawn; `docs/lora/L5_LOCAL_TRAIN.md` |
| 2026-08-06 | **Sec CSP** endurecer Content-Security-Policy | `connect-src 'self'`; sin `https:` img; `object-src`/`base-uri`/`form-action`; `CSP_REPORT_ONLY` |
| 2026-08-05 | **UX #2** Pollinations token en Ajustes | Campo + GET/POST `/api/settings/keys` |
| 2026-08-05 | **L4c** plantilla Flux Comfy | `comfy_workflow_flux_lora.json` |
| 2026-08-05 | **Merge #53+#54** Sec #2 + L4 → main | Integración |
| 2026-08-05 | **L4 hub GPU local** | ComfyUI + A1111/Forge; `local-gpu/`; `PREFER_LOCAL_GPU`; docs L4 |
| 2026-08-05 | **Sec #2** assets + cookie-first + XFF | Gate refs/generated; sin PIN en sessionStorage; `TRUST_PROXY` || 2026-08-05 | **Sec #1** public-bind + auth-off → 503 | `shouldBlockPublicInsecureAuth` → #52 |
| 2026-08-05 | **UX free #1** pollen/401 + demote LoRA | Banner + CTA Copiar JSON; LoRA en `<details>` → #51 |
| 2026-08-05 | **L3 trainer pago opt-in** | `ENABLE_PAID_LORA` + Replicate train/sync/infer; fallback Pollinations |
| 2026-08-05 | **L2 ComfyUI + fallback** | `persona_loras` v11; `generateWithLora` → Pollinations si no ready |
| 2026-08-05 | **L1 notebook Colab** | `docs/lora/` — guía + `.ipynb` que consume pack L0 |
| 2026-08-05 | **G2+G3** looks rápidos + batch 1/4 | PR #46 → `main` |
| 2026-08-05 | **Plan Fase L (LoRAs)** + **L0** export pack | L0–L3 en ROADMAP; L0 ✅ vía #45 |
| 2026-07-30 | **Merge stack W12–W17 → main** | FF #40 `cbdae55`; #34–#40 MERGED |
| 2026-07-30 | **W17 audit log** | schema v10; hooks archive/delete/export/backup; Ajustes admin |
| 2026-07-30 | **W16 export-ready** | Badges Listo/Revisar/Sin ancla + filtros portafolio |
| 2026-07-30 | **W15 offline-first** | Copy recomendado vs boceto — PR #37 |
| 2026-07-30 | **W14 happy-path CTA** | PR #36 |
| 2026-07-30 | **W13 pack library** | PR #35 |
| 2026-07-30 | **W12 historial lock** | PR #34 |
| 2026-07-29 | **W11 sesión chatbot** | 3 prompts + checklist localStorage; badge Chatbot OK |
| 2026-07-29 | **Paso 0 merge W6 + W7–W10 + PLAN-NEXT → main** | Conflictos resueltos; tests+smoke |
| 2026-07-29 | **PLAN-NEXT.md** | W11–W17 moat free; Replicate con señal |
| 2026-07-29 | **W6 filter-repo historia** | Purgados `influ.sqlite`/`personas.json` de todos los commits; force-push |
| 2026-07-29 | **W6 untrack mirrors** | `git rm --cached` + gitignore; sync opt-in `ENABLE_LEGACY_MIRRORS`; backup export desde SQLite |
| 2026-07-29 | **W10 backup rotation + export studio** | `BACKUP_KEEP` default 10; `GET /api/export/studio` sin `.env` |
| 2026-07-29 | **W9 borrado seguro** | Eliminar → archive + toast Deshacer; purge admin con nombre |
| 2026-07-29 | **W8 cola + offline** | `#N de M` en wave; modo offline localStorage |
| 2026-07-29 | **W7 gen_metrics** | schema v8; hooks gen; Ajustes admin |
| 2026-07-29 | **Merge W1–W5e + PLAN → main** | FF tip + W1 + PLAN; tests 118 + smoke 9/9 |
| 2026-07-29 | **W5e routes/admin.js** | profiles/invites/backups/settings; server.js ~799; tests 110 + smoke 9/9; W5 ✅ |
| 2026-07-29 | **W5d import+generation routes** | `routes/import.js` + `routes/generation.js`; server.js ~1064; tests 106 + smoke 9/9 |
| 2026-07-29 | **W5c routes/personas.js** | CRUD+variants+license+export; server.js −~420; tests 101 + smoke 9/9 |
| 2026-07-29 | **W5b prompt-builder.js** | UMD identity/skin/prompts/character_lock; app.js −~380; tests 96 + smoke 9/9 |
| 2026-07-29 | **W5a import-flow.js** | UMD + deps inyectadas; app.js −~376 líneas; tests 80 + smoke |
| 2026-07-29 | **W4 dHash consistencia** | `consistency-score.js`; chips UI; schema v7; tests 68 + smoke |
| 2026-07-29 | **W3 magic bytes import** | `image-validation.js`; 400 + borrar basura; JPEG real en tests/smoke; 63+smoke |
| 2026-07-29 | **W2 CI + smoke en repo** | `test/smoke.js` 9/9; workflow Actions; `npm run smoke` |
| 2026-07-29 | **W1 bind localhost + setup PIN** | `HOST` default 127.0.0.1; wizard; SESSION_SECRET; 503 si público+PIN default |
| 2026-07-29 | **Pila #4–#16 en `main` + smoke** | FF tip→main; tests 59; smoke API 9/9; free path OK |
| 2026-07-29 | **Import discard + chatbot-packs.js** | Limpia refs preview; packs F5 extraídos del monolito |
| 2026-07-29 | **Founder onboarding + pack en portafolio** | Modal admin roster vacío; Copiar pack fullbody en tarjeta; CTA import |
| 2026-07-29 | **P0 git/seguridad + UX JSON-first** | `ENABLE_GIT_BACKUP` opt-in; safe-paths; ownership gens; guardar sin Pollinations |
| 2026-07-29 | **1.2 Import confirm** | Analizar sin guardar; Descartar limpio; Confirmar → roster + anclas |
| 2026-07-29 | **Matriz QA + banner 429** | Slots ancla/cuerpo/spicy + checks; banner sticky rate-limit; tests |
| 2026-07-28 | **Guía Cómo usar gráfica** | Tab hero + 4 pasos + CTAs; asset `assets/guides/como-usar-hero.png` |
| 2026-07-28 | **Presets nicho + kit marca** | beauty/fitness/moda; `?kit=1` ZIP + guión 15s; tests 37 |
| 2026-07-28 | **Onboarding member** | Modal post-invite; Ajustes por rol; keys solo admin; tests 34 |
| 2026-07-28 | **Backup UI + ownership** | `/api/backups`; `requireOwnedPersona`; gallery/import scoped; tests 32 |
| 2026-07-28 | **Admin + invitaciones** | `studio_invites`, redeem → member aislado; products/campaigns por perfil |
| 2026-07-28 | **Seguridad + perfiles locales** | Rate-limit login, headers, SESSION_SECRET, `studio_profiles`, roster por `profile_id` |
| 2026-07-28 | **F2–F6 + export ZIP** usabilidad | Checklist 60s, SBS F4, cola UX F3, README, `/api/export/persona/:id` |
| 2026-07-28 | **F1** Validador local `character_lock` (panel salud + toasts al copiar) | `character-lock-validator.js`; tests; `DISABLE_GIT_BACKUP` en suite |
| 2026-07-27 | Unificar arranque + alinear `package.json` al lock; docs concepto prompts/JSON | `npm start`→`server.js`; etapa = usabilidad → seguridad |
| 2026-07-19 | 1.3–1.6, body JSON, skin lock, spicy, full-body framing | Ver commits main |
| 2026-07-20 | Filosofía cero costo; character_lock export; image-provider free-first | Replicate documentado, no implementado |
| 2026-07-20 | **F5** Packs gratis chatbot (fullbody / bikini / spicy / product) | UI en ficha + prompt console; `buildFreeChatbotPack` |

---

## Cómo usar el free path (emprendedor)

1. **Crear / importar** influencer en el Studio (local, gratis).  
2. Ajustar **tez, cuerpo, cara** en el formulario hasta que el JSON se vea bien.  
3. **Copiar export chatbot** (botón existente de pack/prompt) → pegar en ChatGPT / Gemini / Claude free.  
4. Pedir variantes: “misma persona, bikini en playa, cuerpo entero” — el modelo debe respetar `character_lock`.  
5. En Studio: generar con **Pollinations** para bocetos rápidos; aceptar límites de consistencia.  
6. Cuando la marca venda: activar **Replicate opcional** (Fase R) solo si hace falta cara perfecta.

---

## Parking lot (no ahora)

- Multi-tenant / OAuth / billing obligatorio  
- Face-lock de pago como default  
- Video pipeline completo  
- Refactor React solo por moda  

---

## Instrucciones para Grok / agentes

1. **Default = free.** No añadir dependencias de pago al happy path.  
2. Cualquier integración Replicate/Fal debe ser **opt-in** + fallback Pollinations.  
3. Mejorar siempre primero: JSON lock, prompts Pollinations, UX rate-limit, export chatbot.  
4. Leer este archivo al retomar.  
