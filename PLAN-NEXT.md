# PLAN-NEXT — post W6–W10 (para bots / Cursor / Antigravity)

> Plan de implementación **después** de integrar W6 + W7–W10.
> Contexto: [HANDOFF.md](./HANDOFF.md) · Filosofía: [ROADMAP.md](./ROADMAP.md) · Runbook previo: [PLAN.md](./PLAN.md) · Reglas: [AGENTS.md](./AGENTS.md)
>
> Fecha: 2026-07-29 · Objetivo: **maximizar el moat free** (`character_lock` → chatbot gratis) y dejar el Studio listo para mercado **antes** de Replicate/video.

---

## Invariantes (igual que PLAN.md)

1. **Free path primero.** No romper:
   `Crear/importar → portafolio → copiar JSON/packs a chatbot free (o Pollinations) → export pack`.
2. **No Replicate, OAuth, billing ni video** salvo pedido explícito del owner.
3. **Un work item = una rama `cursor/<nombre>-152f` + PR draft.**
4. `npm test` verde + smoke 9/9 si tocas `server.js` / `app.js`.
5. No `git add .`. No commitear `.env`, `data/`, ni `assets/references/ref_*` de tests.
6. Cerrar sesión actualizando **HANDOFF.md** (+ línea en ROADMAP si aplica).

---

## Paso 0 — Integrar lo ya construido ✅ (2026-07-29)

Hecho en `main`. Orden que se usó:

| Orden | PR | Rama | Notas |
|------:|---:|-------|--------|
| 1 | #31 | `cursor/untrack-data-mirrors-152f` | W6 (+ historia ya limpia) |
| 2 | #27 | `cursor/gen-metrics-152f` | W7 |
| 3 | #28 | `cursor/queue-offline-ux-152f` | W8 (apila W7) |
| 4 | #29 | `cursor/safe-delete-152f` | W9 |
| 5 | #30 | `cursor/backup-rotation-152f` | W10 tip (incluye W7–W9) |

**Atajo válido:** merge solo el tip de **#30** + **#31** (W6 es independiente; si #30 no incluye W6, merge #31 primero o aparte).

**Criterio de hecho:** ✅ `main` con W6–W10 + este runbook; HANDOFF apunta aquí. Tras push: confirmar tests/smoke.

---

## Principio de producto de esta fase

El límite honesto de Pollinations (cara que se desvía) **no se arregla con más gens**.
Se mitiga con:

1. Mejor **`character_lock`** y packs copy-paste.
2. Rituales de verificación en chatbot free.
3. UX que trate la **gen local como opcional** y el JSON como el producto.

Replicate sigue en pausa hasta que `gen_metrics` + dolor real lo justifiquen.

---

## Secuencia recomendada

```
Paso 0 (merges) → W11 → W12 → W13 → W14 → W15 → W16 → W17
                                    └─ W14 y W15 pueden ir en paralelo tras W12
```

No asignar dos bots al mismo archivo caliente (`app.js`, `server.js`) a la vez.

---

## W11 — Sesión chatbot: 3 prompts de prueba + checklist ✅

**Por qué:** el emprendedor necesita *saber* si el JSON ancla bien la cara **sin** pagar face-lock.

**Rama:** `cursor/chatbot-session-check-152f` (implementado 2026-07-29)

**Archivos:** `chatbot-packs.js` (o nuevo `chatbot-session.js` UMD), `app.js`, `index.html`, tests.

**Implementación:**

1. Botón en ficha / portafolio: **“Probar en chatbot (3 prompts)”**.
2. Copia un bloque único:
   - `character_lock` compacto
   - Prompt A: retrato ancla
   - Prompt B: cuerpo entero (framing text-first)
   - Prompt C: producto en mano / nicho activo
3. Checklist UI (local, sin API): “¿Misma cara? ¿Misma tez? ¿Mismo pelo?” → guarda resultado en `localStorage` o columna ligera en SQLite (`qa_checks` opcional).
4. No requiere Pollinations ni Gemini.

**Tests:** el bloque exportado contiene `character_lock` + 3 prompts; checklist no rompe free path.

**Criterio de hecho:** un novato puede validar identidad en ChatGPT free en &lt;2 minutos desde el Studio.

---

## W12 — Historial / diff de `character_lock` ✅

**Por qué:** hoy el lock se sobrescribe; no se ve qué cambió ni si se rompió identidad.

**Rama:** `cursor/character-lock-history-152f` (implementado 2026-07-30)

**Archivos:** `db.js` + `migrations.js` (tabla `character_lock_revisions`: persona_id, profile_id, lock_json, source, health_score, created_at), hooks en save, UI ficha, `character-lock-validator.js`, routes.

**Implementación:**

1. En cada save que mute `detailedJSON.character_lock`, insertar revisión (cap N=20 por persona).
2. UI: “Versiones del character_lock” → Diff textual (must_match + meta) vs actual.
3. Acción **Restaurar** (escribe lock + nueva revisión `source=restore`).
4. Validador: toast si la revisión nueva baja el score de salud vs la anterior.

**Tests:** `test/character-lock-history.test.js` — save crea revisión; restore vuelve al JSON previo; member 404.

**Criterio de hecho:** se puede deshacer un “toqué el JSON y perdí la cara” sin backup completo.

---

## W13 — Biblioteca de packs por persona (un clic) ✅

**Por qué:** los 4 packs free existen, pero el hábito es frágil; falta “última copia” y atajos en portafolio.

**Rama:** `cursor/pack-library-152f` (implementado 2026-07-30)

**Archivos:** `chatbot-packs.js`, `app.js`, `index.html`, `index.css`.

**Implementación:**

1. En tarjeta de portafolio: menú **Packs ▾** → fullbody / bikini / spicy / product.
2. Tras copiar: toast con “Volver a copiar último pack” (`influ_last_pack_${profile}_${personaId}`).
3. En ficha + panel prompt: status “Último: … · copiado hace Xs” + botón recopy.
4. Export ZIP: sin cambios de servidor (sigue enviando los 4 packs).

**Tests:** `test/pack-library.test.js` — 4 packs con `character_lock`; UI sin APIs de pago.

**Criterio de hecho:** desde portafolio se copia cualquier pack free en un clic sin abrir la ficha completa.

---

## W14 — Happy path 60s: un solo CTA post-login ✅

**Por qué:** founder/member ven demasiadas puertas (tabs, gen, settings) antes del primer pack.

**Rama:** `cursor/happy-path-cta-152f` (implementado 2026-07-30)

**Archivos:** `app.js`, `index.html`, `index.css`, onboarding existente.

**Implementación:**

1. Roster vacío: panel **Crear** | **Importar** | Cómo usar (founder + member).
2. Tras primer save: toast CTA **Copiar pack fullbody** (+ `#happyPathNextCta`).
3. Gen Pollinations → “Boceto local opcional” (secondary).
4. Checklist reordenado: copy antes que gen; member modal con Importar.

**Tests:** `test/happy-path-cta.test.js`; smoke copy-pack sin Gemini/gen.

**Criterio de hecho:** primer influencer → pack en clipboard sin pasar por generación.

---

## W15 — Offline-first en la UI (gen = opcional)

**Por qué:** W8 añade modo offline; falta que el producto *hable* offline-first por defecto.

**Rama:** `cursor/offline-first-copy-152f`

**Dependencia:** merge W8 (#28) antes o incluir cherry-pick mínimo del toggle.

**Archivos:** `app.js`, `index.html`, copy en Cómo usar / README corto.

**Implementación:**

1. Labels: “Generar boceto (gratis, inestable)” vs “Copiar JSON (recomendado)”.
2. Si hay 429 reciente: auto-sugerir modo offline + highlight packs (reusar W8).
3. Empty states de Vault/variantes: “Sin gens — igual puedes exportar packs”.
4. No cambiar defaults de cola; solo copy + énfasis visual.

**Tests:** strings/CTAs presentes; toggle offline sigue en localStorage.

**Criterio de hecho:** un usuario sin red de imagen entiende que el Studio sigue siendo útil.

---

## W16 — Portafolio: estados “listo para export”

**Por qué:** no se ve quién tiene lock sano, pack listo, o ancla faltante.

**Rama:** `cursor/portfolio-export-ready-152f`

**Archivos:** `app.js`, `character-lock-validator.js`, `index.css`.

**Implementación:**

1. Badge en tarjeta: **Listo** (lock OK + name) / **Revisar lock** / **Sin ancla** (si aplica).
2. Filtro portafolio: listos / a revisar.
3. Click en badge → panel validador o W11 checklist.
4. No bloquear export; solo señalizar.

**Tests:** badge deriva del validador local; personas archivadas no aparecen en “listos” por defecto.

**Criterio de hecho:** el founder ve de un vistazo qué influencers puede mandar a chatbot hoy.

---

## W17 — Seguridad mínima de mercado: audit log local

**Por qué:** antes de vender el Studio a un equipo chico, hace falta rastro de quién archivó/borró/exportó.

**Rama:** `cursor/audit-log-152f`

**Archivos:** `db.js` + migration, hooks en archive/delete/export/backup, UI Ajustes admin.

**Implementación:**

1. Tabla `audit_events`: id, profile_id, actor_profile_id, action, entity_type, entity_id, meta_json, created_at.
2. Acciones: `persona.archive`, `persona.delete`, `persona.export`, `backup.create`, `studio.export`.
3. UI admin: últimas 50 filas, solo lectura.
4. Member no ve el log global.

**Tests:** archive escribe evento; member 403 al listar; export persona registra actor.

**Criterio de hecho:** un admin puede responder “quién borró a X” sin abrir SQLite a mano.

---

## Explicitamente fuera de alcance (esta fase)

| Tema | Por qué no ahora |
|------|------------------|
| Replicate / InstantID / PuLID | Solo tras dolor medible + W7 en main |
| Video / lipsync | Fuera del núcleo prompts+JSON |
| OAuth / SMTP / multi-tenant cloud | Rompe “local + cero costo” |
| React rewrite | No ordena el producto; frena entregas |
| `git filter-repo` adicional | Ya hecho en W6 |

---

## Definition of done (cada Wi)

- [ ] `npm test` verde (+ tests del item).
- [ ] Smoke 9/9 si toca servidor o happy path.
- [ ] PR draft: qué / por qué / cómo se probó / free path intacto.
- [ ] HANDOFF actualizado (foco + log).
- [ ] Sin `.env` ni `data/` en el commit.

---

## Señal para abrir fase Replicate (después)

Abrir R0–R4 del ROADMAP **solo si** se cumplen las tres:

1. W7 métricas en uso real (≥1 semana de Studio).
2. Checklist W11 muestra fallos de cara recurrentes en spicy/fullbody.
3. Owner pide explícitamente face-lock de pago.

Hasta entonces: perfeccionar JSON, packs y ritual chatbot.
