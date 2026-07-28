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
| **Etapa de producto** | **Onboarding member** cerrado (este PR). Multi-user local usable para demos. |
| **Fase ROADMAP** | Seguridad + perfiles ✅ → siguiente: smoke tester real / merge PRs |
| **Prioridad inmediata** | Merge PRs #7/#8/#9; invite real; luego Replicate solo si se pide |
| **En pausa** | OAuth, SMTP, Replicate obligatorio, CSP estricta |
| **Servidor** | `npm start` → `server.js`. `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** continuar con el resto (onboarding member + Ajustes simplificados).

**Hecho:**
- Modal bienvenida post-invitación / roster vacío (CTA → crear o checklist Resumen).
- Banner vacío en happy-path para members.
- Ajustes: members no ven claves API / invites / backups; solo su perfil + logout.
- `/api/settings/keys` solo Administración (403 member).
- Happy-path «copiado» keyed por `profileId`.
- Tests: `test/member-onboarding.test.js` — suite **34/34**.

**No tocado:** Replicate, CSP, email SMTP.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. Merge PRs multi-user (invites / backup / onboarding).
3. Smoke manual: admin invita → member canjea → onboarding → crea 1 persona → no ve roster admin.
4. Solo si el usuario lo pide: Replicate opt-in (R0–R3).
5. Tests: `npm test` (`DISABLE_GIT_BACKUP=1`).

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Onboarding member + Ajustes por rol | *(este PR)* |
| 2026-07-28 | Cursor | Backup UI + ownership API | PR #8 |
| 2026-07-28 | Cursor | Admin + invitaciones + aislamiento | PR #7 |
| 2026-07-28 | Cursor | Seguridad mínima + perfiles locales | PR #6 |
| 2026-07-28 | Cursor | Usabilidad F2–F6 + export ZIP | PR #5 |
| 2026-07-28 | Cursor | F1 validador `character_lock` | PR #4 |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
