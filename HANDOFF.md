# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar (Antigravity, Cursor, otro agente).
> Plan: [ROADMAP.md](./ROADMAP.md) · Agentes: [AGENTS.md](./AGENTS.md) · README: [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** herramientas para **crear prompts** que generen influencers **consistentes** (desde cero o inspirados), y un **JSON (`character_lock`)** pegable en **chatbots gratuitos** para seguir desarrollando el personaje sin face-lock de pago.

**Cero costo primero.** Pollinations = bocetos opcionales. Replicate = opt-in futuro.

Happy path:

```
Crear/importar → guardar JSON → copiar pack a chatbot free → (opcional) boceto + side-by-side
```

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Etapa** | Fase 1 usabilidad **cerrada en esta rama**; Fase 2 seguridad **implementada** (revisar en PR) |
| **Servidor** | `npm start` → `server.js`. Auto-git **off** salvo `AUTO_GIT_BACKUP=1` |
| **Última plataforma** | Cursor Cloud |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Hecho — Usabilidad:**
- Nav: «Flujo principal» (Resumen + Crear/JSON) vs «Producción» (Campañas, Script, UGC, Licensing, Galería).
- Dashboard F6: 3 pasos + CTAs crear/importar; empty state con botones.
- Guardar JSON **sin** exigir Pollinations (checkbox opcional); toast «siguiente: copiar pack».
- Export primario: botón pack cuerpo entero + packs F5.
- F4: `#sideBySideComparator` cableado (ancla vs última variante).
- Mobile nav: `dashboard` / `persona-engine` / `ugc-studio` / `campaigns`.
- A/B prompts demovido a «Herramientas avanzadas».

**Hecho — Seguridad:**
- `SESSION_SECRET`, cookies `sameSite`, rate-limit login, logout.
- `AUTO_GIT_BACKUP` off por defecto.
- Uploads: MIME allowlist, 15MB.
- `.env.example` actualizado.

---

## Próximos pasos

1. `git pull` de esta rama / merge a main.
2. Probar happy path local: crear → guardar (sin boceto) → copiar pack.
3. Ajustes UX finos si hace falta; no Replicate obligatorio.

---

## Log de cambios

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | Fase usabilidad (flujo/F4/F6) + seguridad mínima | *(este PR)* |
| 2026-07-27 | Cursor/Antigravity | HANDOFF, npm start→server.js, skills | varios |

## Qué no commitear

- `.env`
- `data/`
