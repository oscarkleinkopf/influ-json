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
| **Etapa de producto** | **Guía «Cómo usar» gráfica** (este PR) + presets/kit en la pila |
| **Fase ROADMAP** | Free path entendible visualmente para testers invitados |
| **Prioridad inmediata** | Merge PRs; smoke con tester real |
| **En pausa** | OAuth, SMTP, Replicate obligatorio |
| **Servidor** | `npm start` → `server.js` |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** generar un «Cómo usar» de alta calidad gráfica.

**Hecho:**
- Nueva pestaña **Cómo usar** con hero full-bleed (`assets/guides/como-usar-hero.png`).
- Flujo visual en 4 pasos + regla de oro + CTAs a crear / packs / kit / checklist.
- Entrada desde sidebar, Resumen y onboarding member («Ver checklist» → guía).
- CSS con motion (fade-up + ken burns suave).

**No tocado:** Replicate, CSP.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. Merge pila multi-user + este PR.
3. Smoke: preset Beauty → crear → kit marca → pegar pack en chatbot free.
4. Solo si el usuario lo pide: Replicate opt-in.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Guía gráfica «Cómo usar» (hero + 4 pasos) | *(este PR)* |
| 2026-07-28 | Cursor | Presets nicho + kit marca ZIP | PR #10 |
| 2026-07-28 | Cursor | Onboarding member + Ajustes por rol | PR #9 |
| 2026-07-28 | Cursor | Backup UI + ownership API | PR #8 |
| 2026-07-28 | Cursor | Admin + invitaciones | PR #7 |

---

## Cómo actualizar este archivo

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual**.
3. Rellenar **Sesión reciente**.
