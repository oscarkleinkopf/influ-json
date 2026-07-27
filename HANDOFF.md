# HANDOFF — continuidad Cursor ↔ Antigravity

> **Leer esto primero** al retomar el proyecto en cualquier plataforma (Antigravity, Cursor, otro agente).
> Plan maestro de producto: [ROADMAP.md](./ROADMAP.md) · Instrucciones agentes: [AGENTS.md](./AGENTS.md)

---

## Idea que estamos siguiendo (no negociable)

**Cero costo primero.** Pequeños emprendedores crean y mantienen influencers virtuales **sin pagar** APIs de imagen ni face-lock. La identidad se ancla con **`character_lock` en JSON** (copiable a chatbots gratis). Pollinations = path default; Replicate = opt-in futuro que **nunca** rompe el free path.

Happy path a proteger:

```
Crear/importar → portafolio → gen Pollinations o copiar JSON a chatbot free → export pack
```

Regresión P0: “guardé y no aparece”, o free path roto por una feature de pago.

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Fase ROADMAP** | Maximizar free (Pollinations + JSON) — F1–F6 Completados |
| **Prioridad inmediata** | Continuar con Fase 3 (Video UGC corto 15s) / Módulos de Producción |
| **En pausa / no tocar** | Replicate obligatorio (se mantiene opt-in cero costo) |
| **Última plataforma** | Antigravity |
| **Última actualización** | 2026-07-27 |

---

## Sesión reciente

**Qué se discutió (Antigravity, 2026-07-27):**
- Confirmado: **Antigravity utiliza `server.js` (servidor completo SQLite con `/api/data`)**.
- Unificado `package.json`: `npm start` apunta a `node server.js` eliminando el riesgo de levantar por error `server-minimal.js`.
- Creadas 3 Skills Oficiales en `.agents/skills/`:
  - `influ-json-studio`: Gestión del roster y packs `character_lock`.
  - `influ-license-certifier`: Emisión de Licencias B2B en JSON y HTML visual con hash SHA-256.
  - `influ-ugc-scriptwriter`: Redacción de guiones 15-25s (AIDA, PAS, Unboxing).
- Integrado Modal Gráfico de Ajustes (`⚙️ Ajustes & Claves API`) para guardar claves opcionales de Gemini / Replicate sin romper el modo 100% gratis.

**Qué se hizo en código:**
- `package.json`: `"start": "node server.js"`.
- `server.js`: Endpoint `POST /api/settings/keys`.
- `index.html` & `app.js`: `#settingsModal` y botón de ajustes en sidebar.
- Documentación: `SKILLS_MANUAL.md` y `HANDOFF.md`.

---

## Próximos pasos sugeridos (para el robot que retome)

1. Leer `ROADMAP.md` y `SKILLS_MANUAL.md`.
2. Servidor: `npm start` o `node server.js` (puerto 3000).
3. Siguiente paso de producto: Fase 3 (Video UGC corto 15s en HTML5 Canvas/Node).

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit |
|-------|------------|---------|--------|
| 2026-07-27 | Antigravity | Unificación `npm start` -> `server.js` + Modal GUI de Ajustes + 3 Agent Skills + SKILLS_MANUAL | `714ab5b` |
| 2026-07-27 | Cursor | Workflow sync GitHub + HANDOFF para continuidad entre agentes | `4b2abcc` |

---

## Cómo actualizar este archivo (obligatorio para agentes)

Al terminar **cualquier** tarea con cambios de código:

1. Añadir una fila al **Log de cambios** (fecha, plataforma, resumen en 1 línea).
2. Actualizar **Foco actual** si cambió la prioridad.
3. Rellenar **Sesión reciente** (qué se hizo / qué no se tocó / próximo paso).
4. Si aplica: una línea en el log de `ROADMAP.md`.
5. `git commit` + `git push origin main`.

Mensaje de commit sugerido: `feat:` / `fix:` / `docs:` + qué + por qué en una frase.

---

## Qué no commitear

- `.env` (tokens)
- `data/` (DB activa local; el mirror `influ.sqlite` en raíz sí puede ir si el usuario usa backup por git)
