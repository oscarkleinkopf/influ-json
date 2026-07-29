# PLAN — mejoras post-merge (para otros bots)

> Plan de implementación derivado de la revisión 2026-07-29.
> Contexto: [HANDOFF.md](./HANDOFF.md) · Filosofía: [ROADMAP.md](./ROADMAP.md) · Reglas: [AGENTS.md](./AGENTS.md)
> Estado base: `main` @ `7076a06` (pila #4–#16 mergeada; tests 59/59; smoke API 9/9).

---

## Invariantes (leer antes de tocar nada)

1. **Free path primero.** Nada de esto puede requerir API keys de pago ni romper:
   `Crear/importar → portafolio → copiar JSON/packs a chatbot free (o Pollinations) → export pack`.
2. **No Replicate, OAuth, billing ni video** salvo pedido explícito del owner.
3. **Un work item = una rama `cursor/<nombre>-152f` + PR draft.** No mezclar items en un PR.
4. **`npm test` verde antes de push** (el script ya fija `DISABLE_GIT_BACKUP=1`).
5. **Smoke del happy path** tras cada item que toque `server.js` / `app.js` (ver §W2).
6. No `git add .`. No commitear `.env`, `data/`, `influ.sqlite`, `personas.json`,
   ni `assets/references/ref_*` generados por tests. Si se ensucian los mirrors:
   `git restore influ.sqlite personas.json`.
7. Cerrar cada sesión actualizando **HANDOFF.md** (log + foco) y, si aplica, **ROADMAP.md**.

### Gotchas técnicos conocidos (ahórrate el debug)

- **`POST /api/personas` espera columnas planas + `detailedJSON`.** `name`, `gender`, `age`,
  `hair`, etc. deben ser **strings planos**; el JSON rico (identity/body/hair/lock) va en
  `detailedJSON`. Mandar `hair` como objeto rompe SQLite con 500 “Too few parameter values”.
  El shape de referencia es `personaData` en `savePersona()` de `app.js`.
- Auth para scripts: admin con header `Authorization: Bearer $STUDIO_PIN` (o cookie de
  `POST /api/auth/login`). Member: solo cookie (login con `{ pin, profileId }`).
- Import: `POST /api/import-influencer` con `FormData` (`name`, `previewOnly=1`, `photo`).
  Preview **no persiste**; confirmar = `POST /api/personas` con `forceCreate: true`.
- Los tests de import actuales usan blobs de bytes falsos (`'fake-img'`) porque mockean
  `ai-service`. Esto importa en W3.
- Limpieza tras tests manuales: borrar personas de prueba vía API, `rm assets/references/ref_*`
  solo de los archivos creados, restaurar mirrors con `git restore`.
- `ai-service.js` es quien llama a Pollinations/Gemini; la cola está en `gen-queue.js`
  (gap mínimo + cooldown 429 configurables por env).

---

## W1 — Bind localhost + wizard de primer arranque

**Por qué primero:** hoy `node server.js` escucha en todas las interfaces con PIN default
`1234` (`auth.js` `DEFAULT_PIN_FALLBACK`). Es el agujero más feo y el fix es chico.

**Rama:** `cursor/localhost-bind-setup-152f`

**Archivos:** `server.js` (listen), `auth.js`, nuevo `first-run.js` (o sección en `server.js`),
`.env.example`, `app.js` + `index.html` (modal), `test/localhost-bind.test.js`.

**Implementación:**

1. `server.js`: `const HOST = process.env.HOST || '127.0.0.1'` y `app.listen(PORT, HOST)`.
   Si `HOST` es `0.0.0.0` **y** `isPinDefault()` → log de aviso fuerte y responder
   503 con mensaje en todas las rutas hasta cambiar el PIN.
2. `first-run`: si no hay `SESSION_SECRET` en `.env`, generar uno aleatorio
   (`crypto.randomBytes(32).hex`) y **persistirlo en `.env`** (append, sin tocar otras líneas).
   Hoy se deriva del PIN — débil con PIN default (`auth.js` `getSessionSecret`).
3. Modal de primer arranque: si `GET /api/status` devuelve `pinIsDefault: true`, bloquear la
   UI con un modal que pida PIN nuevo (≥6 chars) y lo guarde vía endpoint admin
   `POST /api/setup/change-pin` (requiere sesión admin; escribe `STUDIO_PIN` en `.env` y
   actualiza el hash del perfil admin). Reusar el patrón del founder modal existente.
4. `.env.example`: documentar `HOST`, `PORT`, `STUDIO_PIN`, `SESSION_SECRET`.

**Tests nuevos:**

- Sin `HOST` → el server bindea `127.0.0.1` (comprobar `server.address().address`).
- `POST /api/setup/change-pin` rechaza PIN corto y acepta uno válido; tras cambio,
  `isPinDefault()` es false (restaurar `.env` en `t.after`).

**Criterio de hecho:** `npm test` verde; arrancar sin `.env` fuerza el modal de PIN;
`curl http://<ip-lan>:3000/api/status` no responde salvo `HOST=0.0.0.0` explícito.

**Riesgos:** el smoke y scripts asumen `127.0.0.1` — no debería romperse nada, pero verificar
que los tests que levantan server efímero usan `listen(0, '127.0.0.1')` igual que ahora.

---

## W2 — CI (GitHub Actions) + smoke en repo

**Por qué:** con el flujo Cursor ↔ Antigravity, CI es la única barrera que impide mergear
una pila rota. Además convierte el smoke ad-hoc en artefacto repetible.

**Rama:** `cursor/ci-smoke-152f`

**Archivos:** `.github/workflows/test.yml`, `test/smoke.js`, `package.json`
(`"smoke": "DISABLE_GIT_BACKUP=1 node test/smoke.js"`).

**Implementación:**

1. `test/smoke.js`: boot del server real en puerto efímero (`http.createServer(app)` +
   `listen(0, '127.0.0.1')`, patrón de los tests existentes) y ejecuta los 9 checks:
   status (provider pollinations) → login admin → create persona (payload plano +
   `detailedJSON`, ver gotcha) → aparece en `/api/data` → pack fullbody contiene
   `CHARACTER LOCK` + nombre + hex (`chatbot-packs.js`) → import `previewOnly` no persiste →
   `POST /api/import-preview/discard` → import de nuevo + confirmar → exactamente 1 persona →
   `GET /api/export/persona/:id` devuelve ZIP (magic `PK`, >100 KB) → member aislado
   (invite → redeem → login member: no ve personas admin; DELETE/export de ajena → 404).
   Cleanup: borrar las personas creadas vía API al final. Exit code ≠ 0 si algo falla.
   (La implementación de referencia ya fue validada contra `:3000` — 9/9 PASS.)
2. Workflow: `on: [pull_request, push: main]` → `node-version: [20]` →
   `npm ci` → `npm test` → `npm run smoke`. Cache de npm. Sin secrets (todo local).
3. Badge en `README.md`.

**Tests nuevos:** el propio smoke es el test. Asegurar que corre **sin** `.env` real
(el suite ya inyecta valores por defecto; `STUDIO_PIN` fallback `1234`).

**Criterio de hecho:** PR con check verde en GitHub; `npm run smoke` local pasa en limpio.

**Riesgos:** que `better-sqlite3` y `sharp` compilen en el runner — ambos tienen prebuilds
para linux x64; si falla, fijar versiones exactas en `package-lock.json` (ya existe).

---

## W3 — Validación de magic bytes en import

**Por qué:** hoy el import acepta cualquier blob con MIME declarado; si `sharp` no puede
optimizarlo, **guarda el archivo igual** (“using original”). Cualquier archivo arbitrario
puede terminar en `assets/references/`.

**Rama:** `cursor/import-image-validation-152f`

**Archivos:** `server.js` (rutas `/api/import-influencer`, `/api/upload-reference*`),
`test/import-image-validation.test.js`, **actualizar** `test/import-confirm.test.js`,
`test/import-variants.test.js`, `test/import-preview-discard.test.js`.

**Implementación:**

1. Tras `multer`, gate: `await sharp(buf).metadata()` — si lanza, responder 400
   (`'El archivo no es una imagen válida.'`) y **no** escribir a disco.
2. Rechazar también SVG por MIME sniffing (sharp no rasteriza SVG sin density; tratar
   `image/svg+xml` como inválido salvo decisión contraria).
3. **Actualizar los tests existentes** que usan `'fake-img'`: reemplazar por un JPEG real
   generado en el propio test:
   `await sharp({ create: { width: 8, height: 8, channels: 3, background: '#a86' } }).jpeg().toBuffer()`.
   Esto mantiene los mocks de `ai-service` intactos (el análisis sigue mockeado; solo el
   archivo es real).

**Tests nuevos:** bytes basura → 400 y nada nuevo en `assets/references/`; JPEG real → 200.

**Criterio de hecho:** suite completa verde (incluidos los 3 tests de import actualizados);
smoke sigue 9/9.

**Riesgos:** el smoke W2 usa blob falso — actualizarlo en este mismo PR a imagen real.

---

## W4 — Scoring de consistencia gratis (pHash/dHash)

**Por qué:** la Matriz QA es juicio manual. Un detector de drift objetivo y local es el
diferenciador del núcleo free.

**Rama:** `cursor/phash-consistency-152f`

**Archivos:** nuevo `consistency-score.js`, `server.js` (endpoint o campo en
`/api/personas/:id/variants`), `app.js` (panel ficha / matriz QA), `test/consistency-score.test.js`.

**Implementación:**

1. `consistency-score.js`: dHash 64-bit — `sharp(path).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer()`,
   bit = pixel[x] > pixel[x+1]; distancia = hamming contra el hash del ancla
   (`mainImage` de la persona). Exportar `hashImage(path)` y `hammingDistance(a, b)`.
2. Umbrales orientativos (calibrar con 3–5 personas reales y anotarlos en el módulo):
   `≤8` consistente · `9–14` revisar · `>14` drift. Guardar score en la fila de la variante
   (columna nueva vía `migrations.js`, schema v7) al generarla.
3. UI: chip de color en cada variante (verde/ámbar/rojo) + línea en la Matriz QA.
   Sin bloquear nada — es señal, no gate.
4. Extensión opcional (mismo PR solo si sale limpia): “describe y compara” — enviar la
   variante al endpoint vision gratis de Pollinations y cruzar campos contra el lock.
   Si complica el PR, dejar como W4b separada.

**Tests nuevos:** misma imagen → distancia 0; imágenes sintéticas distintas (sharp create
con colores distintos) → distancia alta; endpoint devuelve score por variante.

**Criterio de hecho:** variantes nuevas muestran chip; suite + smoke verdes.

**Riesgos:** dHash mide composición/color, **no identidad facial** — documentarlo en el
tooltip (“señal grosera, no face-lock”) para no prometer de más.

---

## W5 — Extracciones Paso 4 (mantenibilidad)

**Por qué:** `app.js` 7 166 líneas, `server.js` 2 135. Cada cambio futuro es más barato
tras extraer.

**Ramas (una por módulo, en este orden):**

1. `cursor/extract-import-flow-152f` — `app.js` → `import-flow.js` (UMD, patrón de
   `chatbot-packs.js`): preview/confirm/discard, refs temporales, drag-drop.
2. `cursor/extract-prompt-builder-152f` — `app.js` → `prompt-builder.js`: construcción del
   identity prompt y del `detailedJSON` (es la IP central; merece tests directos).
3. `cursor/routes-personas-152f` — `server.js` → `routes/personas.js`
   (CRUD + variants + versions + license).
4. `cursor/routes-import-generation-152f` — `routes/import.js` + `routes/generation.js`.
5. `cursor/routes-admin-152f` — invites/backups/settings.

**Reglas de extracción:** comportamiento idéntico (mover código, no reescribir); un commit
por módulo; `npm test` + smoke tras cada uno; el frontend carga módulos UMD con
`<script>` como ya hace `chatbot-packs.js`.

**Tests:** los existentes deben seguir verdes **sin cambios**; añadir tests unitarios del
módulo extraído solo donde no haya cobertura (prompt-builder especialmente).

**Criterio de hecho:** cada PR reduce líneas de `app.js`/`server.js` sin cambiar un solo
comportamiento observable; smoke 9/9 en cada PR.

---

## W6 — Desversionar mirrors SQLite/JSON ⛔ bloqueado

Requiere **OK explícito del owner** (está anotado en HANDOFF desde PR #14).

Cuando llegue el OK, rama `cursor/untrack-data-mirrors-152f`:

1. `git rm --cached influ.sqlite personas.json`; añadir ambos a `.gitignore`.
2. La fuente de verdad ya es `data/influ.sqlite`; quitar `syncDbToWorkspace()` /
   `syncPersonasJson()` de `db.js` o convertirlos en export bajo demanda (`/api/backups`).
3. Actualizar AGENTS.md/HANDOFF (dejan de aplicar las reglas de restore).
4. Considerar `git filter-repo` para historia — decisión del owner, no del bot.

---

## W7 — Métricas locales free vs paid (R4 adelantado, gratis)

**Por qué:** saber cuánto se usa cada tipo de generación prepara la decisión de Replicate
sin implementarlo.

**Rama:** `cursor/gen-metrics-152f`

**Archivos:** `db.js` + `migrations.js` (tabla `gen_metrics`: id, profile_id, persona_id,
provider, generation_type, ok, duration_ms, created_at), `server.js` (registrar en
generate-image y variantes), `app.js` (contador en Ajustes admin).

**Tests:** generar (mock) incrementa contador; lectura solo admin; member no ve métricas de otro.

**Criterio de hecho:** Ajustes muestra “N retratos, M variantes, K fallos 429” por perfil.

---

## W8 — UX cola: posición visible + modo offline

**Rama:** `cursor/queue-offline-ux-152f`

**Archivos:** `app.js` (chip de cola — `gen-queue.js` ya expone `pendingCount`),
banner offline existente → toggle “Modo offline” que deshabilita botones de generación
y destaca CTAs de copiar pack.

**Criterio de hecho:** con 3 gens encoladas se ve “#2 de 3”; modo offline sobrevive reload
(localStorage por perfil).

---

## W9 — Borrado seguro (delete = archive por defecto)

**Rama:** `cursor/safe-delete-152f`

**Archivos:** `app.js` (botón Eliminar → archiva + toast con “Deshacer” que desarchiva);
delete destructivo solo admin con confirmación de nombre. `server.js` ya tiene ambos
endpoints (`/archive`, `DELETE`).

**Tests:** delete UI → persona archivada, no borrada; admin puede purgar.

---

## W10 — Backups: rotación + export studio completo

**Rama:** `cursor/backup-rotation-152f`

**Archivos:** `server.js` (`/api/backups` — keep N=10 por defecto, env
`BACKUP_KEEP`), nuevo endpoint `GET /api/export/studio` (ZIP: `data/` + `assets/` +
`.env.example`, **sin `.env`**).

**Tests:** crear 12 backups → quedan 10; ZIP studio contiene DB y no contiene `.env`.

---

## Secuencia recomendada

```
W1 → W2 → W3 → W4        (seguridad + CI + núcleo; independientes entre sí salvo W2↔W3*)
W5 (5 sub-ramas)         (mantenibilidad; puede empezar tras W2 para que CI cubra las extracciones)
W7 → W8 → W9 → W10       (producto/UX; todas independientes)
W6                        (cuando el owner apruebe)
```

\* W3 debe actualizar `test/smoke.js` si W2 ya mergeó (blob falso → imagen real).

Si dos bots trabajan en paralelo: no asignar W5 y cualquier W que toque `server.js`
(`W1`, `W3`, `W7`, `W10`) al mismo tiempo — conflictos garantizados. Combinación segura:
W1+W4, W2+W8, W3+W9, W7+W10.

## Definition of done (todos los items)

- [ ] `npm test` verde, incluidos tests nuevos del item.
- [ ] Smoke 9/9 (o `npm run smoke` tras W2).
- [ ] Mirrors restaurados, working tree limpio salvo archivos del item.
- [ ] PR draft con descripción: qué, por qué, cómo se probó.
- [ ] Fila en log de HANDOFF.md + foco actualizado; línea en ROADMAP.md si es entregable.
