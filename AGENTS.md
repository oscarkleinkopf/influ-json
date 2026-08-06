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
- Imagen: `image-provider.js` (default `pollinations`). **Ojo (2026):** Pollinations pasó a créditos «pollen» y su API moderna **exige token Bearer**; el acceso anónimo devuelve `401`/`402 "Insufficient balance"`. Sigue cero-costo con un token gratis (`POLLINATIONS_TOKEN`, grants diarios cubren `flux`) — ver `.env.example`. El fetch vive en `ai-service.js` (endpoint moderno `https://gen.pollinations.ai/image/{prompt}`).
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

- Arranque / tests: ver README + `package.json` (`npm start`, `npm test`, `npm run smoke`). Auth: `STUDIO_PIN` en `.env`.
- **CSP** (`auth.securityHeaders`): enforce por defecto. `CSP_REPORT_ONLY=1` → solo report. `CSP_ALLOW_HTTPS_IMG=1` → reañade `https:` a `img-src` si hace falta. El front no debe `fetch` orígenes externos (`connect-src 'self'`); Pollinations es server-side. `'unsafe-inline'` en script/style sigue por el monolito (`onclick` / estilos en templates / Google Fonts).
- No usar `npm run start:minimal` como servidor de desarrollo del producto completo.
