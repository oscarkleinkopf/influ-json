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
| **Etapa de producto** | **Usabilidad** (perfeccionar flujo crear → JSON → chatbot). Luego **seguridad** para mercado. |
| **Fase ROADMAP** | Free path sólido; **F1 validador** ✅; pendientes UX: F4 side-by-side, F6 happy path 60s |
| **Prioridad inmediata** | F6 (60s) y F4 (side-by-side); no video full ni Replicate obligatorio |
| **En pausa** | Hardening de seguridad para lanzamiento; multi-tenant; billing |
| **Servidor** | `npm start` → `server.js` (completo). `start:minimal` = demo only |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Pedido del usuario:** ideas concretas → implementar **#3 Validador de `character_lock`**.

**Hecho en esta sesión:**
- Nuevo módulo `character-lock-validator.js` (UMD: Node + browser) con `validateCharacterLock`.
- Panel `#lockHealthPanel` en Persona Engine (score 0–100, grados Sólido/Aceptable/Débil, lista expandible).
- Toasts no bloqueantes al copiar JSON / chatbot / packs free si el lock tiene avisos.
- Tests: `test/character-lock-validator.test.js` (12 casos).
- `DISABLE_GIT_BACKUP=1` en `server.js` + `npm test` (evita que la suite ensucie `main` vía auto-sync).
- Servido en `GET /character-lock-validator.js`.

**No tocado:** F4 side-by-side, F6 onboarding 60s, Replicate, auth hardening.

---

## Próximos pasos (robot que retome)

1. `git pull` → este archivo → `ROADMAP.md`.
2. `npm start` (nunca `start:minimal` para trabajo real).
3. Priorizar: **F6** (60s en dashboard) y **F4** (side-by-side ancla vs gen).
4. No endurecer seguridad de mercado todavía salvo lo mínimo local (PIN / `.env`).
5. Tokens: `.env` local por máquina — no van en Git.
6. Tests: `npm test` ya setea `DISABLE_GIT_BACKUP=1`.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-28 | Cursor | F1 validador `character_lock` (panel salud + toasts + tests) | *(este PR)* |
| 2026-07-27 | Cursor | Alinear deps + documentar concepto (prompts/JSON/chatbot) y etapa usabilidad→seguridad | *(main)* |
| 2026-07-27 | Antigravity | `npm start`→`server.js` + modal Ajustes + 3 skills + SKILLS_MANUAL | `714ab5b` |
| 2026-07-27 | Cursor | HANDOFF + workflow sync GitHub | `b70f6d0` / `4b2abcc` |

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
