# influ-JSON — instrucciones para Grok / agentes

## Qué es este proyecto

**influ-JSON**: estudio local de producción UGC con influencers virtuales (roster en SQLite, Persona Engine, scripts, UGC Studio, licensing).  
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
- Documento maestro: **[ROADMAP.md](./ROADMAP.md)**.

## Prioridad de trabajo

1. **Mecánica free** (Pollinations, skin/body lock, variantes, full-body)  
2. **Integridad vía JSON** (export chatbot, `character_lock`)  
3. **Usabilidad**  
4. **Seguridad mínima**  
5. **Replicate opcional** (solo cuando free esté sólido)

## Convenciones técnicas

- Servidor: `npm start` → `node server.js` (puerto 3000). En PowerShell: `npm.cmd` si hace falta.  
- Auth: `STUDIO_PIN` en `.env`. No commitear `.env`.  
- DB: `data/influ.sqlite` o `DATA_DIR` — ver `paths.js`.  
- Imagen: `image-provider.js` (default `pollinations`).  
- Tras mutar personas: refrescar `state.personas` + grids.  
- UI en español; errores honestos (429, offline).  

## Happy path a proteger

```
Crear/importar → portafolio → gen Pollinations o copiar JSON a chatbot free → export pack
```

Regresión P0: “guardé y no aparece”, o free path roto por una feature de pago.

## Archivos calientes

| Archivo | Rol |
|---------|-----|
| `server.js` | API Express |
| `db.js` | SQLite |
| `app.js` | Front + `character_lock` + export chatbot |
| `ai-service.js` | Pollinations / Gemini opcional |
| `image-provider.js` | Free vs paid face-lock (paid = stub futuro) |
| `ROADMAP.md` | Plan y filosofía |

## Sync Cursor ↔ Antigravity (GitHub)

El usuario alterna entre **Antigravity** (principal) y **Cursor**. Cada cambio debe quedar respaldado en GitHub para retomar en la otra plataforma.

**Remoto:** `https://github.com/oscarkleinkopf/influ-json` · rama `main`.

### Al retomar (cualquier plataforma)

1. `git pull origin main`
2. Leer **[HANDOFF.md](./HANDOFF.md)** — foco actual, sesión reciente, próximos pasos
3. Leer **[ROADMAP.md](./ROADMAP.md)** — fase free y criterios de hecho
4. No implementar Replicate a menos que el usuario lo pida y free esté estable

### Al terminar una tarea con cambios

1. Actualizar **HANDOFF.md** (log + foco + sesión reciente)
2. Si aplica, una línea en el log de **ROADMAP.md**
3. `git add` → `git commit` → `git push origin main`
4. Commit claro (`feat:` / `fix:` / `docs:` + por qué). **No** commitear `.env`

Tokens (`GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, etc.) viven en `.env` **local** de cada máquina; Antigravity usa los suyos tras el pull.

## Al retomar (resumen)

1. `git pull` → `HANDOFF.md` → `ROADMAP.md`  
2. Entregables pequeños y verificables.  
3. Push al cerrar cada tarea (respaldar en GitHub).  
