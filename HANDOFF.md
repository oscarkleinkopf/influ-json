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
| **Etapa de producto** | **Usabilidad** casi cerrada (F1–F6 + export pack). Siguiente: **seguridad** para mercado. |
| **Fase ROADMAP** | F1–F6 + 2.5–2.6 export ZIP ✅ en esta sesión |
| **Prioridad inmediata** | Merge PRs usabilidad; luego hardening PIN/sesiones/headers |
| **En pausa** | Multi-tenant; billing; Replicate obligatorio |
| **Servidor** | `npm start` → `server.js` (completo). `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** implementar los 5 pendientes de usabilidad (F6, F4, F3, export pack, F2).

**Hecho:**
- **F6** Checklist «Arranque en 60 segundos» en Resumen (`#happyPathCard`).
- **F4** Side-by-side ancla vs última gen (`#sideBySideComparator` + set-as-main); fix URL `set-main`.
- **F3** Chip de cola + disable de botones gen durante busy/429; mensajes countdown.
- **2.5–2.6** `GET /api/export/persona/:id` ZIP (lock + packs + imágenes + licencia).
- **F2** README flujo emprendedor con nombres de botón reales.
- Tests export + suite verde con `DISABLE_GIT_BACKUP=1`.

**No tocado:** seguridad de mercado, Replicate real.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. `npm start` (nunca `start:minimal` para trabajo real).
3. Etapa **seguridad**: rate-limit login, PIN default banner, headers, session secret desde `.env`.
4. Tokens: `.env` local — no van en Git.
5. Tests: `npm test` setea `DISABLE_GIT_BACKUP=1`.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Usabilidad F2–F6 + export ZIP persona | *(este PR)* |
| 2026-07-28 | Cursor | F1 validador `character_lock` (panel salud + toasts + tests) | PR #4 |
| 2026-07-27 | Cursor | Alinear deps + documentar concepto | *(main)* |
| 2026-07-27 | Antigravity | `npm start`→`server.js` + modal Ajustes + 3 skills | `714ab5b` |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
4. Línea en log de `ROADMAP.md` si aplica.
5. `git commit` + `git push` (rama feature o `main` según workflow).

## Qué no commitear

- `.env`
- `data/` (DB activa; mirror `influ.sqlite` en raíz puede ir si se usa backup por git)
