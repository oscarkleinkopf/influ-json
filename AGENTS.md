# influ-JSON — instrucciones para Grok / agentes

## Qué es este proyecto

**influ-JSON**: estudio local de producción UGC con influencers virtuales (roster en SQLite, Persona Engine, scripts, UGC Studio, licensing).  
Stack: Node/Express, better-sqlite3, front monolítico (`index.html` + `app.js` + `index.css`).

## Prioridad de producto (no negociar sin Oscar)

1. **Mecánica** (fiabilidad del loop)  
2. **Usabilidad** (happy path claro)  
3. **Seguridad** (mínima; enterprise después)

Documento maestro: **[ROADMAP.md](./ROADMAP.md)** — roadmap de 4 semanas.  
Al implementar features o proponer cambios, alinear con la semana activa del roadmap. No ampliar multi-tenant, OAuth ni video pipeline salvo petición explícita.

## Convenciones técnicas

- Servidor: `npm start` → `node server.js` (puerto 3000). En PowerShell usar `npm.cmd` si la policy bloquea scripts.
- Auth: PIN vía `STUDIO_PIN` en `.env` (default en código si vacío). No commitear `.env`.
- DB: portable en `data/influ.sqlite` (o `DATA_DIR` en `.env`). Migración automática desde legacy. Mirror a `./influ.sqlite` para git backup. Ver `paths.js`.
- Tras mutar personas: **siempre** refrescar `state.personas` + `refreshPersonaLists()` / grids del dashboard.
- UI en español; mensajes de error honestos (offline, rate limit, sin API key).
- Commits: mensajes claros en inglés o español, enfocados en el “por qué”.

## Happy path a proteger

```
Crear/importar influencer → aparece en portafolio → generar UGC → ver historial → exportar pack
```

Cualquier cambio que rompa “aparece en portafolio al instante” es regresión P0.

## Archivos calientes

| Archivo | Rol |
|---------|-----|
| `server.js` | API Express, import, static |
| `db.js` | SQLite schema + CRUD |
| `app.js` | Todo el front state/UI |
| `ai-service.js` | Gemini / Pollinations / offline |
| `auth.js` | PIN + session |
| `ROADMAP.md` | Plan 4 semanas |

## Al retomar trabajo

1. Leer `ROADMAP.md` (log de progreso + semana actual).  
2. No empezar features del parking lot.  
3. Preferir entregables pequeños con criterio de hecho verificable.
