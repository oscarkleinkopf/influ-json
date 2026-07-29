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
| **Rama de trabajo** | `cursor/import-cleanup-packs-152f` |
| **Commit base** | encima de `cursor/founder-portfolio-ux-152f` (#15) |
| **PR actual** | **#16** — discard preview refs + extract `chatbot-packs.js` |
| **`main` remoto al escribir esto** | aún sin pila #4–#15 |
| **Etapa de producto** | Paso 4 empezado (packs) + higiene import |
| **Prioridad inmediata** | Merge #4→#16; smoke; **no Replicate** |
| **En pausa** | OAuth, SMTP, video completo y **Replicate** |
| **Servidor correcto** | `npm start` → `node server.js` |
| **Última actualización** | 2026-07-29 |

### Pila de PRs vigente

Las ramas se construyeron una sobre otra. Integrar en este orden para que cada
PR reduzca su diff al avanzar `main`:

| Orden | PR | Contenido |
|------:|---:|-----------|
| 1 | #4 | Validador local `character_lock` |
| 2 | #5 | Usabilidad F2–F6 + export ZIP |
| 3 | #6 | Seguridad mínima + perfiles |
| 4 | #7 | Administración + invitaciones |
| 5 | #8 | Backup SQLite + ownership |
| 6 | #9 | Onboarding member |
| 7 | #10 | Presets de nicho + kit marca |
| 8 | #11 | Guía gráfica «Cómo usar» |
| 9 | #12 | Matriz QA + banner 429 |
| 10 | #13 | Import confirm sin persistir preview |
| 11 | #14 | P0 auto-Git opt-in + paths/SSRF/ownership + UX JSON-first |
| 12 | #15 | Onboarding founder + Copiar pack en portafolio |
| 13 | #16 | Discard refs de import preview + `chatbot-packs.js` |

PRs #1–#3 son anteriores y se solapan con la pila actual. **No mezclarlos a
ciegas**: comprobar primero si su funcionalidad ya está en #4–#14; cerrar como
superseded si corresponde.

---

## Sesión reciente (Cursor, 2026-07-29)

**Pedido:** continuar (sin Replicate).

**Hecho (esta rama #16):**
- `POST /api/import-preview/discard` borra `ref_*` del preview al Descartar.
- Extracción Paso 4: `chatbot-packs.js` (UMD) + tests.
- Frontend usa `InfluChatbotPacks` al copiar packs.

**Antes:** #15 founder/portafolio · #14 P0 seguridad/JSON-first.

**No tocado:** Replicate; desversionar mirrors SQLite (requiere OK del owner).

---

## Protocolo de arranque para otro agente

Ejecutar en este orden:

```bash
git status --short
git fetch origin main
git pull origin cursor/import-confirm-152f
npm test
```

Antes de probar:

1. Confirmar que `npm test` incluye `DISABLE_GIT_BACKUP=1` (cinturón).
2. Auto-Git ya es **opt-in** (`ENABLE_GIT_BACKUP=1`). No actives eso en tests.
3. No usar `git add .`; stagear archivos explícitos.
4. No commitear `.env`, `influ.sqlite`, `personas.json`, `data/` ni
   `assets/references/ref_*` creados por tests.
5. Si tests ensucian datos versionados, restaurar solo esos archivos:

```bash
git restore influ.sqlite personas.json
git status --short
```

No borrar `assets/references/` completo: contiene referencias versionadas.

## Plan siguiente, con implementación y criterios

### Paso 0 — Integrar la pila

1. Revisar CI/diff de #4.
2. Merge #4; refrescar #5 contra `main`; ejecutar `npm test`.
3. Repetir hasta #13.
4. Al final ejecutar el smoke manual descrito abajo.

No añadir features durante este paso. Resolver conflictos preservando siempre:
`character_lock`, ownership por perfil, Pollinations opcional y refresh del
roster tras cada mutación.

### Paso 1 — P0 datos: auto-Git opt-in ✅ (PR #14)

Hecho: `runGitBackup` solo con `ENABLE_GIT_BACKUP=1`; tests en
`safe-paths.test.js`. Pendiente (con OK del owner): desversionar mirrors
`influ.sqlite` / `personas.json` del repo.

### Paso 2 — P0 seguridad: paths y ownership ✅ (PR #14)

Hecho: `safe-paths.js`, analyze-photo 400, ownership generations/generate-image,
SSRF en download URL + redirects. Tests `p0-security.test.js`.

### Paso 3 — P0/P1 UX gratis ✅ (PR #14 + #15)

Hecho: nav móvil, Guardar JSON-first / Guardar+retrato, checklist opcional,
`pSkinToneHex` + picker, banner offline, onboarding founder admin, «Copiar pack»
en tarjeta de portafolio, CTA Importar en checklist 60s.

### Paso 4 — Mantenibilidad (en curso)

Sin migrar a React. Extraer gradualmente de `app.js`:

```text
chatbot-packs.js   ✅ (#16)
import-flow.js     siguiente
persona-engine.js
queue-ui.js
onboarding.js
```

Y de `server.js`: rutas `personas`, `import`, `generation`, `admin`.
Un módulo por commit, con `npm test` y smoke del happy path en cada extracción.

## Smoke manual obligatorio tras integrar

Usar un perfil member y uno admin:

1. Crear desde cero → Guardar → aparece en portafolio sin recargar.
2. Copiar pack fullbody → contiene `character_lock`.
3. Importar foto → Analizar → preview no aparece todavía en portafolio.
4. Descartar → sigue sin aparecer.
5. Repetir import → Confirmar → aparece una sola persona y se cargan variantes.
6. Generar una variante → cola bloquea doble clic; si hay 429, muestra banner y
   reintenta sola.
7. Matriz QA → retrato/cuerpo/spicy; checks persisten al reabrir ficha.
8. Perfil member no ve personas, productos ni campañas del admin.
9. Export persona y kit marca → ZIP abre y contiene JSON + packs.

Registrar resultado exacto: paso, esperado, observado y captura/log si falla.

## Qué NO hacer

- No implementar Replicate, Fal, billing, OAuth ni video completo.
- No hacer que Gemini/Pollinations sean obligatorios para guardar o exportar.
- No reemplazar SQLite por una plataforma cloud en esta etapa.
- No introducir React solo para “ordenar” el monolito.
- No exponer el puerto 3000 a Internet hasta completar Paso 2.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-29 | Cursor | Discard import preview + extract chatbot-packs | *(PR #16)* |
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
2. Actualizar **Foco actual**.
3. Rellenar **Sesión reciente**.
