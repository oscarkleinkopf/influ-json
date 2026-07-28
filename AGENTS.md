# influ-JSON — instrucciones para Grok / agentes

## Qué es este proyecto

**influ-JSON**: estudio local para generar **prompts + JSON** de influencers virtuales consistentes (desde cero o inspirados), anclar identidad con **`character_lock`**, y usar ese JSON en **chatbots gratuitos** para seguir desarrollando el personaje. UGC Studio, scripts y licensing rodean ese núcleo.

Stack: Node/Express, better-sqlite3, front monolítico (`index.html` + `app.js` + `index.css`).

## Filosofía de producto (crítica)

**Cero costo primero.** Pequeños emprendedores deben poder crear y mantener influencers **sin pagar** APIs de imagen ni face-lock hasta hacer crecer la marca.

| Siempre free | Opcional futuro (no romper free) |
|--------------|----------------------------------|
| Pollinations + offline | Replicate InstantID/PuLID |
| JSON `character_lock` → chatbots gratis | ComfyUI self-host |
| Studio local + SQLite | Cualquier proveedor de pago |

- **No** hagas que el path básico requiera `REPLICATE_API_TOKEN` o tarjeta.
- Si implementas face-lock de pago: flag opt-in + fallback a Pollinations.
- Documento maestro: **[ROADMAP.md](./ROADMAP.md)**. Continuidad: **[HANDOFF.md](./HANDOFF.md)**.

## Prioridad de trabajo (orden del usuario)

1. **Prompts + JSON consistentes** (crear / inspirar → `character_lock` → chatbot free)
2. **Usabilidad** (esta etapa — happy path claro, menos fricción)
3. **Seguridad mínima** (siguiente etapa — endurecer antes de mercado)
4. Replicate / video / features de pago (solo cuando free + UX estén sólidos)

## Convenciones técnicas

- Servidor: **`npm start` → `node server.js`** (puerto 3000). `npm run start:minimal` es demo offline — **no** es producción.
- Auth: `STUDIO_PIN` en `.env`. No commitear `.env`.
- DB: `data/influ.sqlite` o `DATA_DIR` — ver `paths.js`.
- Imagen: `image-provider.js` (default `pollinations`).
- Tras mutar personas: refrescar `state.personas` + grids.
- UI en español; errores honestos (429, offline).
- Tests: `npm test` → `node --test test/*.test.js`.

## Happy path a proteger

```
Crear/importar → portafolio → gen Pollinations o copiar JSON a chatbot free → export pack
```

Regresión P0: “guardé y no aparece”, o free path roto por una feature de pago.

## Archivos calientes

| Archivo | Rol |
|---------|-----|
| `server.js` | API Express (producción) |
| `server-minimal.js` | Solo demo offline (`npm run start:minimal`) |
| `db.js` | SQLite |
| `app.js` | Front + `character_lock` + export chatbot |
| `ai-service.js` | Pollinations / Gemini opcional |
| `image-provider.js` | Free vs paid face-lock (paid = stub futuro) |
| `HANDOFF.md` | Foco entre plataformas |
| `ROADMAP.md` | Plan y filosofía |

## Sync Cursor ↔ Antigravity (GitHub)

El usuario alterna entre **Antigravity** (principal) y **Cursor**. Cada cambio debe quedar respaldado en GitHub.

**Remoto:** `https://github.com/oscarkleinkopf/influ-json` · rama `main`.

### Al retomar

1. `git pull origin main`
2. Leer **[HANDOFF.md](./HANDOFF.md)**
3. Leer **[ROADMAP.md](./ROADMAP.md)**
4. No implementar Replicate a menos que el usuario lo pida

### Al terminar una tarea

1. Actualizar **HANDOFF.md** (log + foco + sesión)
2. Si aplica, línea en log de **ROADMAP.md**
3. `git add` → `git commit` → `git push origin main`
4. Commit claro (`feat:` / `fix:` / `docs:`). **No** commitear `.env`

## Cursor Cloud specific instructions

Servicio único: la app Express de `server.js` (puerto 3000). Comandos estándar (ver `package.json` / README): `npm start` (producción/dev real), `npm test` (tests), `npm run dev` (watch). El path libre funciona sin claves; `GEMINI_API_KEY`/`REPLICATE_API_TOKEN` son opcionales y **no** deben requerirse.

Gotchas no obvios:
- **`.env` no es obligatorio.** Sin `.env` la auth usa `STUDIO_PIN=1234` por defecto y corre en modo Offline/Prompt-Copy. Para dev local puedes `cp .env.example .env`.
- **Login:** endpoint real es `POST /api/auth/login` con body `{"pin":"1234"}`. Endpoints API también aceptan header `Authorization: Bearer 1234`.
- **La app escribe en el repo.** El feature de git-backup/sync (`runGitBackup` / `syncDbToWorkspace` en `server.js`) hace `git add/commit` sobre el workspace y puede dejar un `.git/index.lock` colgado tras arrancar el server o llamar `/api/sync`. Si ves `Unable to create '.git/index.lock'` sin proceso git activo, es seguro `rm -f .git/index.lock`.
- **Los tests mutan el árbol de trabajo.** `npm test` modifica `influ.sqlite` y `personas.json` y crea imágenes mock en `assets/references/`. Crear personas genera archivos en `assets/generated/`. Restaura con `git checkout -- influ.sqlite personas.json` y borra los assets generados antes de commitear.
- DB real vive en `data/influ.sqlite` (via `DATA_DIR`); `influ.sqlite` en la raíz es solo un mirror para backup por git.
