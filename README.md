# influ-JSON — AI UGC Production Studio

Estudio local para **crear prompts y JSON de influencers virtuales** consistentes — desde cero o inspirados en una foto — y usarlos en **chatbots gratuitos** (ChatGPT, Gemini, Claude, Meta) sin pagar APIs de imagen.

## Concepto central

1. Definir el personaje en el Studio (roster SQLite).
2. Bloquear identidad con `character_lock` en JSON.
3. Copiar packs de prompts a un chatbot free para seguir desarrollando el personaje.
4. (Opcional) Bocetos locales con Pollinations — sin tarjeta.

**Fase actual:** perfeccionar **usabilidad**. Después: **seguridad** mínima para lanzamiento al mercado. Replicate/face-lock de pago = opt-in futuro, nunca rompe el path gratis.

## Cero costo primero

- Pollinations + SQLite local (sin suscripción).
- Identidad vía JSON `character_lock`, no InstantID de pago.
- Gemini / Replicate solo si el usuario pega una clave en Ajustes.

## Inicio rápido

```bash
npm install
npm start
```

Abrir `http://localhost:3000` (PIN por defecto: `1234`, configurable en `.env`).

| Comando | Qué arranca |
|---------|-------------|
| `npm start` | **Studio completo** (`server.js` + SQLite) |
| `npm run start:minimal` | Demo offline (sin SQLite; no usar para trabajo real) |
| `npm test` | Tests de cola / import |

## Documentación

- [HANDOFF.md](./HANDOFF.md) — foco actual entre Cursor ↔ Antigravity (leer primero)
- [ROADMAP.md](./ROADMAP.md) — plan y filosofía
- [AGENTS.md](./AGENTS.md) — reglas para agentes
- [SKILLS_MANUAL.md](./SKILLS_MANUAL.md) — skills de agentes

## Flujo emprendedor (60s)

1. Crear o importar influencer → guardar.
2. Revisar/ajustar tez, cuerpo, cara hasta que el JSON se vea bien.
3. Copiar pack chatbot (`character_lock`) → pegar en ChatGPT / Gemini free.
4. Pedir variantes (“misma persona, cuerpo entero, producto en mano”).
