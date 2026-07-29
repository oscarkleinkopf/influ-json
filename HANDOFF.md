# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados en foto/referencia), y un **JSON (`character_lock`)** que se pueda pegar en **chatbots gratuitos** para seguir desarrollando esos personajes sin pagar face-lock.

**Cero costo primero.** Pollinations = bocetos locales opcionales. Replicate = opt-in futuro que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → copiar JSON/packs a chatbot free (o gen Pollinations) → export pack / kit marca
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Etapa de producto** | **1.2 Import confirm** (este PR) — Semana 1 cerrada |
| **Fase ROADMAP** | Free path completo; merge pila PRs |
| **Prioridad inmediata** | Merge #4→#13; smoke con tester; **no Replicate** |
| **En pausa** | OAuth, SMTP, Replicate |
| **Servidor** | `npm start` → `server.js` |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-29 |

---

## Sesión reciente (Cursor, 2026-07-29)

**Pedido:** terminar lo último del plan, sin Replicate.

**Hecho:**
- **1.2 Import confirm:** `previewOnly=1` analiza sin guardar; Descartar no deja huérfanos; Confirmar → `POST /api/personas` + anclas en background.
- Hint en UI + salud `character_lock` en preview.
- Tests `test/import-confirm.test.js`.

**No tocado:** Replicate.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. Merge pila PRs (#4…#13) en orden.
3. Smoke: import → preview → descartar (no aparece) / confirmar (sí + variantes).
4. Replicate **solo** si el usuario lo pide.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-29 | Cursor | 1.2 Import confirm (preview sin persistir) | *(este PR)* |
| 2026-07-29 | Cursor | Matriz QA consistencia + banner 429 | PR #12 |
| 2026-07-28 | Cursor | Guía gráfica «Cómo usar» (hero + 4 pasos) | PR #11 |
| 2026-07-28 | Cursor | Presets nicho + kit marca ZIP | PR #10 |
| 2026-07-28 | Cursor | Onboarding member + Ajustes por rol | PR #9 |
| 2026-07-28 | Cursor | Backup UI + ownership API | PR #8 |
| 2026-07-28 | Cursor | Admin + invitaciones | PR #7 |

---

## Cómo actualizar este archivo

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual**.
3. Rellenar **Sesión reciente**.
