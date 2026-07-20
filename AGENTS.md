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

## Al retomar

1. Leer `ROADMAP.md` (fase free actual).  
2. No implementar Replicate a menos que el usuario lo pida y free esté estable.  
3. Entregables pequeños y verificables.  
