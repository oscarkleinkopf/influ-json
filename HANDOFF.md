# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan activo: [PLAN-NEXT.md](./PLAN-NEXT.md) · Runbook W1–W10: [PLAN.md](./PLAN.md) · Roadmap: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

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
| **Rama de trabajo** | `main` (W11–W17 + integración #45) |
| **Commit base** | `196f4a3` (integración #45) |
| **PR actual** | #45 **MERGED** (fix Pollinations + L0 export LoRA + G1 chips + plan Fase L). #41–#44 cerradas *superseded* |
| **`main` remoto** | Moat free + generación estilo studio (G1) + LoRA L0 |
| **Etapa de producto** | **Fase G** (generación estilo studio, inspirada candy.ai) + **Fase L** (LoRAs) opt-in |
| **Prioridad inmediata** | G2/G3 (presets rápidos + batch 1/4 con aviso de pollen) |
| **⚠ Imagen (Pollinations)** | Pasó a créditos «pollen»: requiere `POLLINATIONS_TOKEN` (ver `.env.example`). Anónimo → 401/402 |
| **En pausa** | OAuth, SMTP, video, **Replicate** |
| **Servidor correcto** | `npm start` → `node server.js` (bind default `127.0.0.1`) |
| **Última actualización** | 2026-08-05 |

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

## Sesión reciente (Cursor, 2026-08-05)

**Contexto clave:** Pollinations migró a créditos «pollen»; el acceso anónimo dejó de generar (401/402). Ahora requiere `POLLINATIONS_TOKEN` (registro en enter.pollinations.ai/keys, key con permiso `account:usage` + saldo). El path free real del producto sigue siendo copiar `character_lock` a chatbots gratis.

**Hecho (integrado en `main` vía #45):**
- **fix Pollinations**: endpoint moderno `gen.pollinations.ai/image` + token Bearer + errores honestos + `POLLINATIONS_MODEL` (flux/dreamshaper).
- **L0** (Fase L): `GET /api/export/persona/:id/lora` + botón → ZIP dataset + captions para entrenar LoRA en Colab (`lora-pack.js`).
- **G1** (Fase G): constructor de prompt por chips (Pose/Actitud/Vestuario/Escena) + Accesorios + 🎲 Sorpréndeme.
- **plan Fase L** (L0–L3) en ROADMAP.

**En curso:** G2 (presets rápidos de look) + G3 (batch 1/4 + galería «N de M» + aviso de pollen).

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
