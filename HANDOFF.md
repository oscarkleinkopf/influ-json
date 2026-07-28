# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** prompts + JSON `character_lock` → chatbots gratis para desarrollar influencers consistentes (desde cero o inspirados). Pollinations opcional. Replicate opt-in futuro.

Happy path:

```
Crear/importar → guardar JSON → copiar pack chatbot
(+ Script Engine: pack campaña = lock + guión + producto)
```

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Etapa** | Usabilidad + seguridad mínima hechas; **2.5–2.6 pack campaña** en esta sesión |
| **Servidor** | `npm start` → `server.js`. `AUTO_GIT_BACKUP` off por defecto |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pack campaña (2.5–2.6):**
- `copyCampaignPack()` — export lean: character_lock + guión seleccionado + producto opcional (sin volcar JSON completo ni prompt imagen).
- Script Engine: botón «Copiar pack campaña → chatbot» + checkbox producto.
- UGC: mismo pack lean; export completo como secundario.
- Persistencia: al generar scripts, `POST /api/campaigns/:id/scripts` si hay campaña seleccionada; al seleccionar campaña se hidratan guiones.

**Antes en la rama:** flujo nav F6/F4, save sin Pollinations obligatorio, auth/session, AUTO_GIT_BACKUP off.

---

## Próximos pasos

1. Merge PR / `git pull` en Antigravity.
2. Probar: crear persona → Script Engine generar → Copiar pack campaña → pegar en ChatGPT.
3. Pendiente ligero: 1.1/1.2 QA import; no Replicate obligatorio.

---

## Log de cambios

| Fecha | Plataforma | Resumen | Commit / PR |
|-------|------------|---------|-------------|
| 2026-07-28 | Cursor | 2.5–2.6 pack campaña (lock+guión) + persist scripts | *(push siguiente)* |
| 2026-07-28 | Cursor | Usabilidad F4/F6 + seguridad mínima | PR #1 / `923479f` |

## Qué no commitear

- `.env`
- `data/`
