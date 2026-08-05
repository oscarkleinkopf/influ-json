# influ-JSON — AI UGC Production Studio

[![Test & smoke](https://github.com/oscarkleinkopf/influ-json/actions/workflows/test.yml/badge.svg)](https://github.com/oscarkleinkopf/influ-json/actions/workflows/test.yml)

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
| `npm test` | Tests (cola, import, validador, export, auth…) |
| `npm run smoke` | Happy path API (9 checks: crear, pack, import, export, isolation) |

## Flujo emprendedor gratis (60 segundos)

Guía con nombres de botón reales del Studio:

1. **Resumen** → checklist «Arranque en 60 segundos» (o ve a **Persona Engine**).
2. **Crear desde Cero** *o* importa una foto de referencia.
3. Completa nombre, tez, cara y cuerpo → **Crear Influencer** / Guardar.
4. Copia un pack — botón **Copiar JSON (recomendado)** / packs free.
5. (Opcional) **Generar boceto (opt-in · puede pedir token)** con Pollinations — no hace falta para el flujo; sin `POLLINATIONS_TOKEN` suele fallar (401/402).
6. Pégalo en ChatGPT / Gemini / Claude / Meta **free** y pide variantes: *«misma persona, cuerpo entero, producto en mano»*.
7. Cuando quieras llevarte todo: **Exportar pack completo (.zip)**.

El panel **Character lock** (Sólido / Aceptable / Débil) te avisa si falta tez hex, cuerpo, etc. **Copiar nunca se bloquea.**

### ¿Qué es `character_lock`?

Un bloque JSON con lo que **debe** repetirse en cada imagen (cara, tez, pelo, silueta) y lo que **puede** cambiar (pose, ropa, fondo, producto). Es el ancla gratis frente a face-lock de pago.

### Pollinations vs chatbot free

| Usa… | Para… |
|------|--------|
| **Copiar JSON / packs** (recomendado) | Seguir el personaje en ChatGPT / Gemini / Claude free — sin red de imagen |
| Pollinations «Generar boceto (opt-in · puede pedir token)» | Bocetos locales opcionales; requiere token/pollen; acepta 429 |

> **Nota (2026):** Pollinations migró a créditos «pollen» y su API moderna **exige un token**; el acceso **anónimo** ya no genera imágenes (error `401` / *«Insufficient balance»*). Sigue siendo **cero costo**: crea una API key gratis en [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) y ponla como `POLLINATIONS_TOKEN` en `.env` (los grants diarios gratis cubren `flux`, sin tarjeta). El flujo recomendado —copiar JSON/packs a un chatbot free— **no** necesita esto.

**Modo offline** (barra superior del Studio): desactiva Pollinations y resalta los botones de copiar JSON. Si ves **429**, el banner sugiere activar modo offline — la cola no cambia, solo el énfasis.

Si ves **429 / espera Ns** (chip o banner ámbar): la cola genera **1 imagen a la vez** y enfría sola. No pulses generar otra vez; copia el pack.

### LoRA de personaje (opt-in, Fase L)

Consistencia más fuerte que el prompt solo — **sin romper el free path**:

1. Exporta **🧬 Pack de entrenamiento LoRA** desde la ficha (dataset + captions).
2. Entrena gratis en Colab: [docs/lora/L1_COLAB.md](./docs/lora/L1_COLAB.md) · notebook [`influ_json_lora_train.ipynb`](./docs/lora/influ_json_lora_train.ipynb).
3. Registra el `.safetensors` en la ficha (L2 ComfyUI) o usa trainer pago opt-in (L3 Replicate):  
   [docs/lora/L2_COMFYUI.md](./docs/lora/L2_COMFYUI.md) · [docs/lora/L3_PAID.md](./docs/lora/L3_PAID.md).  
   Sin ComfyUI / sin `ENABLE_PAID_LORA` → gen sigue en Pollinations.

## Datos y PIN

- DB: `data/influ.sqlite` (portable; ver `paths.js`). Los mirrors `./influ.sqlite` y `./personas.json` **no se versionan** (W6); opt-in legacy: `ENABLE_LEGACY_MIRRORS=1`.
- Auth local: `STUDIO_PIN` en `.env` (no lo subas a Git).
- Perfil **Administración**: genera códigos de invitación en Ajustes. Quien canjea («Tengo una invitación» en el login) obtiene un perfil propio; influencers/productos/campañas **no se mezclan**.
- **Backup local** (solo Administración): Ajustes → Backup SQLite → crea/restaura copias en `data/backups/` (tras restaurar, reinicia `npm start`).
- **Presets de nicho** (Persona Engine): Beauty / Fitness / Moda rellenan el formulario y refuerzan el `character_lock`.
- **Kit marca**: botón «Descargar kit marca» → ZIP con packs chatbot + guión UGC ~15s (`?kit=1`).
- **Cómo usar**: pestaña con guía visual del flujo gratis (sidebar → Cómo usar).
- **Matriz QA** (ficha del influencer): compara retrato ancla · cuerpo · spicy a ojo; checklist cara/tez/pelo (sin API de scoring).
- **Importar**: Analizar = vista previa (no guarda). Confirmar = portafolio + anclas en segundo plano. Descartar no deja huérfanos.
- **Guardar personaje** = JSON-first (sin Pollinations). **Generar boceto (opt-in · puede pedir token)** es opcional.
- **Portafolio**: botón «Copiar JSON (recomendado)» en cada tarjeta (pack cuerpo entero → chatbot free).
- Primer arranque (Administración, roster vacío): modal founder con crear / import / guía.
- Import preview descartado también limpia fotos `ref_*` temporales del disco.
- Auto-commit Git **apagado** por defecto; solo con `ENABLE_GIT_BACKUP=1`.
- `npm run start:minimal` **no** es producción.

## Documentación

- [HANDOFF.md](./HANDOFF.md) — foco actual entre Cursor ↔ Antigravity
- [ROADMAP.md](./ROADMAP.md) — plan y filosofía
- [AGENTS.md](./AGENTS.md) — reglas para agentes
- [SKILLS_MANUAL.md](./SKILLS_MANUAL.md) — skills de agentes
