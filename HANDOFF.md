# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados en foto/referencia), y un **JSON (`character_lock`)** que se pueda pegar en **chatbots gratuitos** para seguir desarrollando esos personajes sin pagar face-lock.

**Cero costo primero.** Pollinations = bocetos locales opcionales. Replicate = opt-in futuro que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → copiar JSON/packs a chatbot free (o gen Pollinations) → export pack / kit marca
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

---

## Estado exacto al retomar

| Campo | Valor |
|-------|--------|
| **Rama de trabajo** | `cursor/routes-personas-152f` (W5c, encima de W5b) |
| **Commit base** | `origin/cursor/extract-prompt-builder-152f` @ `6abafdd` |
| **PR actual** | W5c extract `routes/personas.js` |
| **`main` remoto** | pila #4–#16; PRs W1–W5b + PLAN abiertos |
| **Etapa de producto** | Plan W5 mantenibilidad |
| **Prioridad inmediata** | W5d import/generation routes o merge W1–W5c; **no Replicate** |
| **En pausa** | OAuth, SMTP, video, **Replicate**; desversionar mirrors (OK owner) |
| **Servidor correcto** | `npm start` → `node server.js` |
| **Última actualización** | 2026-07-29 |

### Pila #4–#16 — INTEGRADA ✅

Fast-forward de `cursor/import-cleanup-packs-152f` → `main` (`e618868` → `e354525`).
PRs #4–#16 aparecen **MERGED** en GitHub. PRs abiertos antiguos #1–#3 se solapan; cerrar como superseded.

| Orden | PR | Contenido | Estado |
|------:|---:|-----------|--------|
| 1–13 | #4–#16 | Validador → discard preview + `chatbot-packs.js` | **merged** |

---

## Sesión reciente (Cursor, 2026-07-29)

**Pedido:** Continua (W5c).

**Hecho (W5c):**
- Extraído `routes/personas.js`: CRUD, variants, consistency, versions, license, generations, export ZIP.
- `server.js` registra vía `registerPersonasRoutes` + lazy `triggerBackgroundVariants`.
- `scoreVariantAgainstPersona` compartido (export del módulo).
- Tests `routes-personas.test.js` — suite **101** + smoke **9/9**.

**Siguiente:** W5d `routes/import.js` + `routes/generation.js` o merge pila.

**No tocado:** Replicate; desversionar mirrors.

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
4. No commitear `.env`, `influ.sqlite`, `personas.json`, `data/` ni
   `assets/references/ref_*` creados por tests.
5. Si tests ensucian datos versionados:

```bash
git restore influ.sqlite personas.json
git status --short
```

No borrar `assets/references/` completo: contiene referencias versionadas.

## Plan siguiente

### Paso 0 — Integrar la pila ✅

Hecho 2026-07-29: tip → `main`, tests + smoke OK.

### Paso 1 — P0 datos: auto-Git opt-in ✅ (PR #14)

Pendiente (con OK del owner): desversionar mirrors `influ.sqlite` / `personas.json`.

### Paso 2 — P0 seguridad: paths y ownership ✅ (PR #14)

### Paso 3 — P0/P1 UX gratis ✅ (PR #14 + #15)

### Paso 4 — Mantenibilidad (siguiente)

Sin migrar a React. Extraer gradualmente de `app.js`:

```text
chatbot-packs.js   ✅ (#16)
import-flow.js     ✅ (W5a)
prompt-builder.js  ✅ (W5b)
routes/personas.js ✅ (W5c)
routes/import.js   ← siguiente (W5d)
queue-ui.js
onboarding.js
```

Y de `server.js`: rutas `personas`, `import`, `generation`, `admin`.
Un módulo por commit, con `npm test` y smoke del happy path en cada extracción.

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
