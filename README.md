# influ-JSON — AI UGC Production Studio

Estudio local para **crear prompts y JSON de influencers virtuales** consistentes — desde cero o inspirados en una foto — y usarlos en **chatbots gratuitos** (ChatGPT, Gemini, Claude, Meta) sin pagar APIs de imagen.

## Concepto central

1. Definir el personaje en el Studio (roster SQLite).
2. Bloquear identidad con `character_lock` en JSON.
3. Copiar packs de prompts a un chatbot free para seguir desarrollando el personaje.
4. (Opcional) Bocetos locales con Pollinations — sin tarjeta.

**Fase actual:** usabilidad del happy path. Después: seguridad mínima para mercado. Replicate/face-lock de pago = opt-in futuro, nunca rompe el path gratis.

## Cero costo primero

- Pollinations + SQLite local (sin suscripción).
- Identidad vía JSON `character_lock`, no InstantID de pago.
- Gemini / Replicate solo si el usuario pega una clave en **Ajustes & Claves API**.

## Inicio rápido

```bash
npm install
npm start
```

Abrir `http://localhost:3000` (PIN por defecto: `1234`, configurable en `.env` como `STUDIO_PIN`).

| Comando | Qué arranca |
|---------|-------------|
| `npm start` | **Studio completo** (`server.js` + SQLite) |
| `npm run start:minimal` | Demo offline (sin SQLite; **no** usar para trabajo real) |
| `npm test` | Tests (cola, import, validador, export) |

## Flujo emprendedor gratis (60 segundos)

Guía con nombres de botón reales del Studio:

1. **Resumen** → checklist «Arranque en 60 segundos» (o ve a **Persona Engine**).
2. **Crear desde Cero** *o* importa una foto de referencia.
3. Completa nombre, tez, cara y cuerpo → **Crear Influencer** / Guardar.
4. (Opcional) Genera un boceto con Pollinations (variante en el vault).
5. Copia un **pack gratis** (`Cuerpo entero` / `Bikini` / `Spicy` / `Producto en mano`) o **Copiar para Chatbot**.
6. Pégalo en ChatGPT / Gemini / Claude / Meta **free** y pide variantes: *«misma persona, cuerpo entero, producto en mano»*.
7. Cuando quieras llevarte todo: **Exportar pack completo (.zip)**.

El panel **Character lock** (Sólido / Aceptable / Débil) te avisa si falta tez hex, cuerpo, etc. **Copiar nunca se bloquea.**

### ¿Qué es `character_lock`?

Un bloque JSON con lo que **debe** repetirse en cada imagen (cara, tez, pelo, silueta) y lo que **puede** cambiar (pose, ropa, fondo, producto). Es el ancla gratis frente a face-lock de pago.

### Pollinations vs chatbot free

| Usa… | Para… |
|------|--------|
| Pollinations (en Studio) | Bocetos rápidos locales; acepta límites de consistencia y 429 ocasional |
| Pack + chatbot free | Seguir desarrollando el personaje sin tarjeta ni GPU |

Si ves **429 / espera Ns** en la barra lateral: la cola genera **1 imagen a la vez** y enfría sola. No spamees el botón.

## Datos y PIN

- DB: `data/influ.sqlite` (portable; ver `paths.js`).
- Auth local: `STUDIO_PIN` en `.env` (no lo subas a Git).
- `npm run start:minimal` **no** es producción.

## Documentación

- [HANDOFF.md](./HANDOFF.md) — foco actual entre Cursor ↔ Antigravity
- [ROADMAP.md](./ROADMAP.md) — plan y filosofía
- [AGENTS.md](./AGENTS.md) — reglas para agentes
- [SKILLS_MANUAL.md](./SKILLS_MANUAL.md) — skills de agentes
