# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados en foto/referencia), y un **JSON (`character_lock`)** que se pueda pegar en **chatbots gratuitos** para seguir desarrollando esos personajes sin pagar face-lock.

**Cero costo primero.** Pollinations = bocetos locales opcionales. Replicate = opt-in futuro que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → copiar JSON/packs a chatbot free (o gen Pollinations) → export pack
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Etapa de producto** | **Usabilidad** (perfeccionar flujo crear → JSON → chatbot). Luego **seguridad** para mercado. |
| **Fase ROADMAP** | Free path sólido; **F4 side-by-side ✅**; pendiente UX: F6 happy path 60s |
| **Prioridad inmediata** | UX del loop prompts/JSON/chatbot; no video full ni Replicate obligatorio |
| **En pausa** | Hardening de seguridad para lanzamiento; multi-tenant; billing |
| **Servidor** | `npm start` → `server.js` (completo). `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Hecho:** F4 completado. La UI del comparador side-by-side ya existía en `index.html` (`#sideBySideComparator`) pero **ningún JS la mostraba**. Se cableó `updateSideBySideComparator()` en `app.js`: al cargar/generar/borrar variantes o cambiar el retrato principal, muestra la **Foto Ancla Oficial** vs la **Última Variante Generada** (la más reciente por `created_at`). Cero costo: el usuario juzga consistencia del `character_lock` sin API de scoring. Se oculta si no hay variantes.

**Verificado:** `npm test` 8/8; prueba manual con "Daniela 3.2" (14 variantes) mostrando ambas imágenes sin romperse.

## Sesión reciente (Cursor, 2026-07-27)

**Confirmado por usuario:** en Resumen ve portafolio + creaciones → Antigravity ya usaba el Studio completo (`/api/data` + SQLite).

**Pedido del usuario:**
- Reparar dual-server / deps para evitar problemas futuros.
- Concepto central = prompts consistentes + JSON para chatbots gratis.
- Esta etapa = **usabilidad**; después = **seguridad** para mercado.

**Hecho en esta sesión:**
- `package.json`: deps alineadas al lock (`better-sqlite3`, `express-session`, `archiver`, Express 4…); `npm start` → `server.js`; `npm test` cableado; `start:minimal` explícito.
- `server-minimal.js`: aviso DEMO ONLY en cabecera.
- README / AGENTS / HANDOFF / ROADMAP: concepto + prioridades usabilidad → seguridad.

**No tocado:** UI de producto, auth/PIN, auto git-push del servidor.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. `npm start` (nunca `start:minimal` para trabajo real).
3. Priorizar usabilidad del happy path: F6 (60s en dashboard), F4 (side-by-side ancla vs gen), claridad del export chatbot.
4. No endurecer seguridad de mercado todavía salvo lo mínimo local (PIN / `.env`).
5. Tokens: `.env` local por máquina — no van en Git.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | **F4**: cablear comparador side-by-side ancla vs última variante (`updateSideBySideComparator`) | *(este commit)* |
| 2026-07-27 | Cursor | Alinear deps + documentar concepto (prompts/JSON/chatbot) y etapa usabilidad→seguridad | *(este commit)* |
| 2026-07-27 | Antigravity | `npm start`→`server.js` + modal Ajustes + 3 skills + SKILLS_MANUAL | `714ab5b` |
| 2026-07-27 | Cursor | HANDOFF + workflow sync GitHub | `b70f6d0` / `4b2abcc` |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
4. Línea en log de `ROADMAP.md` si aplica.
5. `git commit` + `git push origin main`.

## Qué no commitear

- `.env`
- `data/` (DB activa; mirror `influ.sqlite` en raíz puede ir si se usa backup por git)
