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
| **Etapa de producto** | **Admin + invitaciones + aislamiento** (este PR). Seguridad/perfiles base ya hecha. |
| **Fase ROADMAP** | Soft multi-user local: Administración invita testers; creaciones no se mezclan |
| **Prioridad inmediata** | Merge PR admin-invites; opcional backup UI / CSP; luego mercado/seguridad dura |
| **En pausa** | OAuth cloud, billing, email SMTP obligatorio, Replicate obligatorio |
| **Servidor** | `npm start` → `server.js`. `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** perfil de administración que envíe invitaciones; que no se mezclen las creaciones.

**Hecho:**
- Perfil por defecto renombrado a **Administración** (`role=admin`; `owner` legacy → admin).
- Tabla `studio_invites` (migración 6): códigos `INFLU-XXXX-XXXX`, caducidad, revoke, max_uses.
- API admin: `GET/POST /api/invites`, `POST /api/invites/:id/revoke` (`requireAdmin`).
- Canje público: `POST /api/invites/redeem` → perfil `member` con roster vacío + login.
- Aislamiento: personas **y** products/campaigns filtrados por `profile_id` en `/api/data`, `/api/products`, `/api/campaigns`.
- UI: Ajustes → Invitaciones (solo admin); login → «Tengo una invitación».
- Migraciones formales (`migrations.js`) + `db-repository.js` thin adapter.
- Tests invitaciones + aislamiento en `test/auth-profiles.test.js`.

**No tocado:** SMTP/email real, OAuth, Replicate.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. `npm start` (nunca `start:minimal` para trabajo real).
3. Pedir al usuario que cambie `STUDIO_PIN` / PIN de Administración.
4. Opcional: UI backup/restore snapshots; CSP más estricta.
5. Tests: `npm test` setea `DISABLE_GIT_BACKUP=1`.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Admin + invitaciones + aislamiento products/campaigns | *(este PR)* |
| 2026-07-28 | Cursor | Seguridad mínima + perfiles locales (`studio_profiles`) | PR #6 |
| 2026-07-28 | Cursor | Usabilidad F2–F6 + export ZIP persona | PR #5 |
| 2026-07-28 | Cursor | F1 validador `character_lock` | PR #4 |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
