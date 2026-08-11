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
- DB: `data/influ.sqlite` o `DATA_DIR` — ver `paths.js`. No versionar mirrors de raíz (`influ.sqlite` / `personas.json`; W6).
- Imagen: `image-provider.js` (default `pollinations`). Face-lock pago opt-in: `ENABLE_PAID_FACE_LOCK=1` + toggle UI — ver `docs/FACELOCK_R.md`. **Ojo (2026):** Pollinations pasó a créditos «pollen» y su API moderna **exige token Bearer**; el acceso anónimo devuelve `401`/`402 "Insufficient balance"`. Sigue cero-costo con un token gratis (`POLLINATIONS_TOKEN`, grants diarios cubren `flux`) — ver `.env.example`. El fetch vive en `ai-service.js` (endpoint moderno `https://gen.pollinations.ai/image/{prompt}`).
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
| `image-provider.js` | Free vs paid face-lock (`paid-facelock.js`) + LoRA |
| `paid-facelock.js` | Replicate InstantID/PuLID opt-in (Fase R) |
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

- Arranque / tests: ver README + `package.json` (`npm start`, `npm test`, `npm run smoke`). Auth: `STUDIO_PIN` en `.env`.
- **Fotorrealismo (bocetos Pollinations):** toggle «Más fotorrealismo» en el vault (default on) → `photoQuality=high` añade `PHOTO QUALITY LOCK` y usa modelo `zimage` (~0.004 pollen) en gens sin referencia. Override: `POLLINATIONS_PHOTO_MODEL`. Path free chatbot no cambia.
- **DB mirrors (W6):** fuente de verdad = `data/influ.sqlite` (gitignore). Root `influ.sqlite` is **not tracked** — write-only when `ENABLE_LEGACY_MIRRORS=1` (`syncDbToWorkspace`); read only as one-shot migration candidate in `paths.resolveDatabasePath` if `data/` DB is missing. `personas.json` is the intentional **text** roster mirror (also gitignore by default; git backup stages only that path, never the binary). Do **not** `git add -f influ.sqlite`. Recovery on fresh clone: `npm start` → creates/migrates `data/influ.sqlite` from root mirror / scratch / empty; ZIP snapshots under `data/backups/` via Studio admin.
- **Diagnostics (runtime):** `GET /api/status` — env/config (auth, bind, `dataDir`/`dbPath`, image providers, free-path flags); úsalo al depurar PIN/setup, Pollinations vs face-lock, o paths de DB. `GET /api/queue-status` — cola de generación (`pendingCount`, cooldown 429, `currentTaskInfo`); úsalo cuando gen se atasca, tarda, o sospechas cooldown anti-429.
- **CSP** (`auth.securityHeaders`): enforce por defecto. `CSP_REPORT_ONLY=1` → solo report. `CSP_ALLOW_HTTPS_IMG=1` → reañade `https:` a `img-src` si hace falta. El front no debe `fetch` orígenes externos (`connect-src 'self'`); Pollinations es server-side. `'unsafe-inline'` en script/style sigue por el monolito (`onclick` / estilos en templates / Google Fonts).
- **Sec #3 sessions:** login / invite redeem / change-pin pasan por `auth.establishAuthenticatedSession` (rota `influ.sid`). No reinventar `req.session.authenticated = true` en esos flujos.
- **Sec #4 rate-limit:** ON por defecto en rutas pesadas (`auth.apiRateLimit('heavy'|'default')`). Apagar: `API_RATE_LIMIT=0`. Ajustar: `API_RATE_LIMIT_HEAVY_MAX` / `API_RATE_LIMIT_MAX` / `API_RATE_LIMIT_WINDOW_MS`.
- **L5 train local:** off por defecto. `ENABLE_LOCAL_LORA_TRAIN=1` materializa pack; spawn solo con `LOCAL_LORA_TRAIN_CMD` o `AI_TOOLKIT_DIR`. Guía: `docs/lora/L5_LOCAL_TRAIN.md`. No usar L5 como path free (preferir Copiar JSON / Colab L1).
- No usar `npm run start:minimal` como servidor de desarrollo del producto completo.
- **Git credentials (P0 harness):** el remote debe ser URL limpia sin secretos, p. ej. `https://github.com/oscarkleinkopf/influ-json.git`. Auth vía credential helper (`gh auth git-credential`), **nunca** `https://x-access-token:…@github.com/…` en `remote.origin.url` ni en `url.*.insteadOf` de `~/.gitconfig`. Si `git remote get-url origin` muestra un token, quitar los `insteadOf` con token (`python3 ~/.local/bin/cursor-strip-git-url-tokens.py` en esta VM) y `git remote set-url origin https://github.com/oscarkleinkopf/influ-json.git`. Validar: `git remote get-url origin` sin credencial + `git ls-remote origin` OK. El backup del studio (`ENABLE_GIT_BACKUP=1` → `git push origin main` en `runGitBackup`) depende de ese helper; no re-embeber tokens en la URL para “arreglar” el push. Cursor puede reinyectar `insteadOf` tras refresh de auth: el hook en `~/.bashrc` lo limpia al abrir shell.
