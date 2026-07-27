# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar el proyecto en cualquier plataforma (Antigravity, Cursor, otro agente).
> Plan maestro de producto: [ROADMAP.md](./ROADMAP.md) · Instrucciones agentes: [AGENTS.md](./AGENTS.md)

---

## Idea que estamos siguiendo (no negociable)

**Cero costo primero.** Pequeños emprendedores crean y mantienen influencers virtuales **sin pagar** APIs de imagen ni face-lock. La identidad se ancla con **`character_lock` en JSON** (copiable a chatbots gratis). Pollinations = path default; Replicate = opt-in futuro que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → gen Pollinations o copiar JSON a chatbot free → export pack
```

Regresión P0: “guardé y no aparece”, o free path roto por una feature de pago.

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Fase ROADMAP** | Maximizar free (Pollinations + JSON) — ver F1–F6 en ROADMAP |
| **Prioridad inmediata** | Unificar entry point (`npm start` → `server.js`), alinear `package.json` con lock, cablear tests |
| **En pausa / no tocar** | Replicate implementado, multi-tenant, billing, refactor React |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-27 |

---

## Sesión reciente

**Qué se discutió (Cursor, 2026-07-27):**
- Revisión general del proyecto: producto sólido, deuda en dual-server (`server-minimal.js` vs `server.js`) y `package.json` desincronizado.
- Usuario trabaja principalmente en **Antigravity**; quiere que cada cambio quede en **GitHub** con documentación para que el otro agente entienda el hilo.

**Qué se hizo en código:** (esta sesión) — se creó este `HANDOFF.md` y se actualizó `AGENTS.md` con reglas de sync.

**Qué NO se tocó:** código de app, servidor, UI.

---

## Próximos pasos sugeridos (para el robot que retome)

1. Leer `ROADMAP.md` (fase F1–F6) y esta sección de foco.
2. Si vas a correr el Studio: usar `npm run start:full` o unificar `npm start` → `server.js` (hoy `npm start` apunta a `server-minimal.js`, versión reducida).
3. Pendientes ROADMAP de alto valor: **F4** side-by-side ancla vs última gen, **F6** happy path 60s en dashboard.
4. Tokens (Gemini, Replicate): van en `.env` local de cada máquina — **no** se suben a Git.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-27 | Cursor | Workflow sync GitHub + HANDOFF para continuidad entre agentes | *(este commit)* |

---

## Cómo actualizar este archivo (obligatorio para agentes)

Al terminar **cualquier** tarea con cambios de código:

1. Añadir una fila al **Log de cambios** (fecha, plataforma, resumen en 1 línea).
2. Actualizar **Foco actual** si cambió la prioridad.
3. Rellenar **Sesión reciente** (qué se hizo / qué no se tocó / próximo paso).
4. Si aplica: una línea en el log de `ROADMAP.md`.
5. `git commit` + `git push origin main`.

Mensaje de commit sugerido: `feat:` / `fix:` / `docs:` + qué + por qué en una frase.

---

## Qué no commitear

- `.env` (tokens)
- `data/` (DB activa local; el mirror `influ.sqlite` en raíz sí puede ir si el usuario usa backup por git)
