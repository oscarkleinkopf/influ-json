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
| **Etapa de producto** | **Backup UI + ownership API** (este PR). Admin/invites en PR hermano. |
| **Fase ROADMAP** | Cerrar multi-user local seguro antes de mercado / Replicate |
| **Prioridad inmediata** | Merge PRs hardening; onboarding member; smoke con tester real |
| **En pausa** | OAuth, SMTP, Replicate obligatorio |
| **Servidor** | `npm start` → `server.js`. `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** backup en Ajustes + ownership en APIs sensibles.

**Hecho:**
- API backups (admin): `GET/POST /api/backups`, `POST /api/backups/restore`, download.
- UI Ajustes → **Backup SQLite** (crear / listar / descargar / restaurar).
- `requireOwnedPersona` en delete/archive/variants/export/generations/license/etc.
- Bloqueo de update por ID ajeno en `POST /api/personas`.
- Gallery + import + respuestas `getAllPersonas` filtradas por perfil (cerrada fuga).
- Tests: `test/backup-ownership.test.js` — suite **32/32**.

**No tocado:** onboarding post-invite, Replicate, CSP estricta.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. Merge PRs de hardening / invites / backup.
3. Smoke: admin invita → member canjea → no ve creaciones ajenas; admin hace backup.
4. Opcional: pantalla onboarding member tras redeem.
5. Tests: `npm test` (`DISABLE_GIT_BACKUP=1`).

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Backup UI + ownership API (personas/gallery/export) | *(este PR)* |
| 2026-07-28 | Cursor | Admin + invitaciones + aislamiento products/campaigns | PR #7 |
| 2026-07-28 | Cursor | Seguridad mínima + perfiles locales | PR #6 |
| 2026-07-28 | Cursor | Usabilidad F2–F6 + export ZIP persona | PR #5 |
| 2026-07-28 | Cursor | F1 validador `character_lock` | PR #4 |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
