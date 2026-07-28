# influ-JSON — instrucciones para agentes

## Qué es este proyecto

Estudio local para generar **prompts + JSON** de influencers virtuales consistentes (desde cero o inspirados), anclar identidad con **`character_lock`**, y usar ese JSON en **chatbots gratuitos**. UGC Studio, scripts y licensing son **secundarios** alrededor de ese núcleo.

Stack: Node/Express, better-sqlite3, front monolítico (`index.html` + `app.js` + `index.css`).

## Al retomar (obligatorio)

1. `git pull` (rama activa o `main` tras merge).
2. Leer **[HANDOFF.md](./HANDOFF.md)** primero.
3. Leer **[ROADMAP.md](./ROADMAP.md)** y, si hace falta contexto humano, **[README.md](./README.md)**.
4. No implementar Replicate a menos que el usuario lo pida.

## Filosofía (no negociable)

**Cero costo primero.** Sin tarjeta en el path básico.

| Siempre free | Opcional futuro (nunca rompe free) |
|--------------|-------------------------------------|
| Pollinations + offline | Replicate InstantID/PuLID |
| JSON `character_lock` → chatbots gratis | ComfyUI self-host |
| Studio local + SQLite | Cualquier proveedor de pago |

## Prioridad de trabajo (orden del usuario)

1. Prompts + JSON consistentes → chatbot free  
2. **Usabilidad / estabilizar free path** (etapa reciente)  
3. Seguridad para mercado (mínima ya en PR; endurecer después)  
4. Replicate / video / pago — solo cuando free + UX estén sólidos  

## Convenciones técnicas

- **`npm start` → `node server.js`** (puerto 3000). `npm run start:minimal` = demo — no producción.
- Auth: `STUDIO_PIN` / `SESSION_SECRET` en `.env` (ver `.env.example`). No commitear `.env`.
- Auto git backup del servidor: **off** salvo `AUTO_GIT_BACKUP=1`.
- DB: `data/influ.sqlite` — ver `paths.js`.
- Imagen: `image-provider.js` (default Pollinations; Replicate = stub).
- Tras mutar personas: refrescar `state.personas` + grids.
- UI en español; errores honestos (429, offline, 401).
- Tests: `npm test`.

## Happy path a proteger

```
Crear/importar → guardar JSON → copiar pack chatbot
(+ opcional: variante F4, pack campaña Script Engine)
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

## Archivos calientes

| Archivo | Rol |
|---------|-----|
| `server.js` | API Express (producción) |
| `server-minimal.js` | Demo offline only |
| `db.js` | SQLite |
| `app.js` | Front + `character_lock` + packs + import |
| `ai-service.js` | Pollinations / Gemini opcional |
| `image-provider.js` | Free vs paid stub |
| `HANDOFF.md` | Foco entre plataformas |
| `README.md` | Entrada + checklist |
| `ROADMAP.md` | Plan |

## Sync GitHub (obligatorio al terminar)

Remoto: `https://github.com/oscarkleinkopf/influ-json`

1. Actualizar `HANDOFF.md` (log + foco + sesión)  
2. Si aplica, log en `ROADMAP.md`  
3. `git add` → `git commit` → `git push`  
4. Prefijos: `feat:` / `fix:` / `docs:` — **nunca** `.env`
