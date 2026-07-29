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
| R0 | `IMAGE_PROVIDER=pollinations\|replicate` en `.env` | Sin token → siempre free |
| R1 | `image-provider.generateWithOptionalFaceLock` (PuLID/InstantID) | Con token: variantes pueden usar face-lock |
| R2 | UI toggle “Face-lock mejorado (pago)” off por defecto | Emprendedor free no ve costos sorpresa |
| R3 | Fallback automático a Pollinations si Replicate falla | Nunca pantalla rota |
| R4 | Métricas locales: free vs paid gens (contador SQLite) | Decidir cuándo conviene pagar |

**Regla de regresión:** todo test manual free (Daniela 3 body/skin/spicy) debe seguir pasando **con Replicate desactivado**.

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
| 2026-07-29 | **PLAN-NEXT.md** | W11–W17 moat free + Paso 0 merges W6–W10; Replicate con señal |
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
