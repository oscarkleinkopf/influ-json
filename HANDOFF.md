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
| **Etapa de producto** | **Seguridad + perfiles locales** (en curso / PR). Usabilidad F1–F6 ya cerrada. |
| **Fase ROADMAP** | Hardening PIN/sesión/headers + `studio_profiles` con roster aislado |
| **Prioridad inmediata** | Merge PR seguridad; opcional: aislar también products/campaigns por perfil |
| **En pausa** | OAuth cloud, billing, multi-tenant SaaS, Replicate obligatorio |
| **Servidor** | `npm start` → `server.js`. `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido:** seguridad + perfiles de usuario.

**Hecho:**
- Rate-limit login (5 fails → lock 60s), `SESSION_SECRET`, cookies `httpOnly`/`sameSite`, security headers.
- Banner si PIN default `1234`; `/api/status` expone `pinIsDefault`.
- Tabla `studio_profiles` (PIN hasheado scrypt); perfil Admin bootstrap desde `STUDIO_PIN`.
- Soft tenancy: `personas.profile_id`; `/api/data` filtra por perfil de sesión.
- UI: selector de perfil en login, chip activo, CRUD en Ajustes, logout.
- Tests: `test/auth-profiles.test.js` — suite **27/27**.

**No tocado:** OAuth, billing, aislamiento products/campaigns, Replicate.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. `npm start` (nunca `start:minimal` para trabajo real).
3. Pedir al usuario que cambie `STUDIO_PIN` / PIN del perfil Admin.
4. Opcional: `profile_id` en products/campaigns; CSP más estricta.
5. Tests: `npm test` setea `DISABLE_GIT_BACKUP=1`.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Seguridad mínima + perfiles locales (`studio_profiles`) | *(este PR)* |
| 2026-07-28 | Cursor | Usabilidad F2–F6 + export ZIP persona | PR #5 |
| 2026-07-28 | Cursor | F1 validador `character_lock` | PR #4 |

---

## Cómo actualizar este archivo

Al terminar cualquier tarea con cambios:

1. Fila en **Log de cambios**.
2. Actualizar **Foco actual** si cambió.
3. Rellenar **Sesión reciente**.
4. Línea en log de `ROADMAP.md` si aplica.
5. `git commit` + `git push` (rama feature).

## Qué no commitear

- `.env`
- `data/` (DB activa; mirror `influ.sqlite` en raíz puede ir si se usa backup por git)
