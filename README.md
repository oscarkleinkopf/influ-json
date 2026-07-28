# influ-JSON

Estudio local para crear **prompts + JSON** de influencers virtuales consistentes (desde cero o inspirados en foto), anclar la identidad con **`character_lock`**, y pegar ese pack en **chatbots gratuitos** (ChatGPT, Gemini, Claude, Meta) para seguir desarrollando el personaje **sin pagar** face-lock.

Pollinations = bocetos opcionales en el Studio. Replicate = opt-in futuro (aún **no** implementado).

---

## Para bots / agentes (leer en este orden)

1. **[HANDOFF.md](./HANDOFF.md)** — foco de la sesión, qué se hizo, próximo paso (**leer primero al retomar**).
2. **[AGENTS.md](./AGENTS.md)** — reglas operativas (free path, sync GitHub, convenciones).
3. **[ROADMAP.md](./ROADMAP.md)** — filosofía, entregables F1–F6 / seguridad / Replicate.
4. **[SKILLS_MANUAL.md](./SKILLS_MANUAL.md)** — skills CLI (studio, license, scriptwriter).

Tras `git pull`, no inventar el producto: el núcleo es **JSON → chatbot gratis**, no una “agencia UGC” completa.

---

## Estado del desarrollo (2026-07-28)

| Área | Estado |
|------|--------|
| Flujo Crear → JSON → chatbot (F6) | Hecho (rama PR) |
| Side-by-side ancla vs gen (F4) | Hecho |
| Packs F5 (fullbody / bikini / spicy / product) | Hecho |
| Pack campaña lean (lock + guión + producto) 2.5–2.6 | Hecho |
| Seguridad mínima (SESSION_SECRET, rate-limit, logout, AUTO_GIT_BACKUP off) | Hecho |
| Import confirm / QA 1.1–1.2 | Hecho (rama PR) |
| Replicate InstantID/PuLID | **No** implementado (stub en `image-provider.js`) |

**Rama de trabajo reciente:** `cursor/usabilidad-seguridad-b0f8` · **PR:** https://github.com/oscarkleinkopf/influ-json/pull/1

---

## Inicio rápido

```bash
git pull
npm install
npm start
```

Abrir `http://localhost:3000`. PIN por defecto local: `1234` (configurable con `STUDIO_PIN` en `.env`; ver `.env.example`).

| Comando | Qué arranca |
|---------|-------------|
| `npm start` | **Studio completo** — `server.js` + SQLite |
| `npm run start:minimal` | Demo offline **sin** SQLite — no usar para trabajo real |
| `npm test` | Tests de cola / import |

---

## Happy path (60s)

1. **Resumen** → Crear desde cero **o** Importar / inspirar.
2. Ajustar tez / cuerpo / cara → **Guardar JSON / character_lock** (boceto Pollinations **opcional**, desmarcado por defecto).
3. **Copiar pack** (cuerpo entero u otro F5) → pegar en ChatGPT / Gemini free.
4. (Opcional) Generar variante → comparar ancla vs última gen (F4).
5. (Opcional) Script Engine → generar guiones → **Copiar pack campaña** (lock + guión + producto).

---

## Checklist de regresión free

Usar antes de merge o tras cambios grandes:

1. Login con PIN.
2. Crear desde cero → guardar **sin** boceto → aparece en portafolio.
3. Copiar pack F5 «cuerpo entero».
4. Generar una variante → ver comparador F4 (ancla vs última).
5. Script Engine → generar → Copiar pack campaña.
6. Confirmar que **no** hay auto-push git (salvo `AUTO_GIT_BACKUP=1` en `.env`).

Regresión P0: “guardé y no aparece”, o free path roto por una feature de pago.

---

## Reglas anti-regresión

- El path básico **nunca** exige `REPLICATE_API_TOKEN` ni tarjeta.
- `AUTO_GIT_BACKUP` está **off** por defecto (no `git add . && push` desde el servidor).
- No commitear `.env` ni `data/`.
- Cada tarea con cambios: actualizar `HANDOFF.md` → commit → **push a GitHub**.

---

## Stack

Node / Express, better-sqlite3, front monolítico (`index.html` + `app.js` + `index.css`). Imagen: Pollinations vía `ai-service.js` / `image-provider.js`.
