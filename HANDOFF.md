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
| **Rama de trabajo** | `cursor/p0-git-security-152f` |
| **Commit base** | encima de `cursor/import-confirm-152f` (#13) |
| **PR actual** | **#14** (este) — P0 git/seguridad + UX free |
| **`main` remoto al escribir esto** | aún sin pila #4–#13 |
| **Etapa de producto** | P0 datos/seguridad + UX JSON-first en esta rama |
| **Prioridad inmediata** | Merge #4→#14; smoke; **no Replicate** |
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

PRs #1–#3 son anteriores y se solapan con la pila actual. **No mezclarlos a
ciegas**: comprobar primero si su funcionalidad ya está en #4–#14; cerrar como
superseded si corresponde.

---

## Sesión reciente (Cursor, 2026-07-29)

**Pedido:** continuar implementación (sin Replicate).

**Hecho (esta rama):**
- Auto-Git **opt-in** (`ENABLE_GIT_BACKUP=1`); default off.
- `safe-paths.js`: `resolveSafeAssetPath` + anti-SSRF.
- Ownership en `DELETE /api/generations/:id` y `POST /api/ai/generate-image`.
- UX: nav móvil, Guardar JSON-first / Guardar+retrato, hex tez, checklist opcional, banner offline.
- Tests: `safe-paths.test.js`, `p0-security.test.js` (52 tests total).

**No tocado:** Replicate; desversionar `influ.sqlite` del repo (requiere OK del owner).

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

### Paso 1 — P0 datos: auto-Git debe ser opt-in

**Archivos:** `server.js`, `.env.example`, `.gitignore`, tests nuevos.

Cambios:

1. Invertir la condición de `runGitBackup`: no ejecutar Git salvo
   `ENABLE_GIT_BACKUP=1`.
2. Las mutaciones normales deben responder éxito aunque Git esté desactivado.
3. Mantener backup SQLite local desde Ajustes.
4. El botón manual de sync debe informar claramente qué hará.
5. Antes de desversionar `influ.sqlite`, `personas.json` o fotos existentes,
   confirmar con el propietario dónde conservar el backup. No hacer `git rm`
   ni reescribir historial de forma autónoma.

Criterios:

- Crear/editar/importar no ejecuta `git commit` ni `git push` por defecto.
- `npm test` no modifica el repositorio.
- Un test con `ENABLE_GIT_BACKUP` ausente verifica que `exec()` no se invoca.

### Paso 2 — P0 seguridad: paths y ownership

**Archivos:** `server.js`, `ai-service.js`, `db.js`,
`test/backup-ownership.test.js` o test dedicado.

Cambios:

1. Crear `resolveSafeAssetPath()` que acepte únicamente rutas dentro de
   `assets/references`, `assets/generated` o `DATA_DIR`.
2. `/api/ai/analyze-photo` debe rechazar `../`, rutas absolutas y archivos fuera
   de esas raíces con HTTP 400.
3. `DELETE /api/generations/:id` debe resolver la persona asociada y comprobar
   ownership antes de borrar.
4. `/api/ai/generate-image` debe validar `personaId`; permitir
   `new_persona` solo durante creación.
5. Para URLs remotas, bloquear localhost, IP privadas y `169.254.169.254`;
   aplicar timeout y límite de bytes.

Criterios:

- Miembro A no puede leer/borrar/generar contra recursos de B (404).
- `../../../etc/passwd` devuelve 400 y nunca llega a `readFileSync`.
- Tests de auth/ownership siguen verdes.

### Paso 3 — P0/P1 UX gratis

**Archivos:** `index.html`, `app.js`, `index.css`.

Orden:

1. Navegación móvil: `data-tab="personas"` → `persona-engine`; eliminar o
   remapear `products` si no existe panel real.
2. Separar **Guardar personaje** de **Guardar + generar retrato**. La opción
   JSON-only debe ser el default y funcionar offline en menos de 3 s.
3. Checklist 60s: Pollinations es opcional; copiar un pack debe permitir
   completar el happy path sin haber generado imagen.
4. Añadir `pSkinToneHex` y propagarlo al `character_lock`.
5. Añadir banner offline: “Puedes seguir copiando JSON; generación pausada”.

Criterios:

- En móvil ningún botón deja pantalla vacía.
- Crear → guardar → copiar pack funciona sin red externa.
- El validador reconoce el HEX y no muestra aviso por ausencia.
- Replicate no aparece ni se vuelve requisito.

### Paso 4 — Mantenibilidad, después de estabilizar

Sin migrar a React. Extraer gradualmente de `app.js`:

```text
import-flow.js
persona-engine.js
chatbot-packs.js
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
| 2026-07-29 | Cursor | P0 git opt-in + paths/SSRF/ownership + UX JSON-first | *(PR #14)* |
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
