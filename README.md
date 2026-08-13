# influ-JSON — AI UGC Production Studio

[![Test & smoke](https://github.com/oscarkleinkopf/influ-json/actions/workflows/test.yml/badge.svg)](https://github.com/oscarkleinkopf/influ-json/actions/workflows/test.yml)

Estudio local para **crear prompts y JSON de influencers virtuales** consistentes — desde cero o inspirados en una foto — y usarlos en **chatbots gratuitos** (ChatGPT, Gemini, Claude, Meta) sin pagar APIs de imagen.

## Concepto central

1. Definir el personaje en el Studio (roster SQLite).
2. Bloquear identidad con `character_lock` en JSON.
3. Copiar packs de prompts a un chatbot free para seguir desarrollando el personaje.
4. (Opcional) Bocetos locales con Pollinations — sin tarjeta.

**Fase actual:** usabilidad del happy path + seguridad mínima. Replicate/face-lock de pago = **opt-in** (`ENABLE_PAID_FACE_LOCK`, ver `docs/FACELOCK_R.md`); nunca rompe el path gratis.

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

### GitHub Pages

Despliegue actual: rama **`main`**, carpeta **`/`** → `https://oscarkleinkopf.github.io/influ-json/`.

Esa URL **no es el Studio**. Pages solo sirve estáticos (sin Node, SQLite ni `/api/*`), así que el PIN no desbloquea nada ahí. Tras el fix de Pages, la home en `main` muestra cómo arrancar en local (`npm start` → `http://127.0.0.1:3000`).

Landing alternativa (opcional): [`docs/index.html`](./docs/index.html) — no hace falta cambiar Settings si ya publicas la raíz de `main`.

| Comando | Qué arranca |
|---------|-------------|
| `npm start` | **Studio completo** (`server.js` + SQLite) |
| `npm run build:index` | Regenera `index.html` desde `views/` (tras editar parciales; Pages usa ese archivo) |
| `npm run start:minimal` | Demo offline (sin SQLite; **no** usar para trabajo real) |
| `npm test` | Tests con `DATA_DIR` temporal (`scripts/run-tests.js`; no ensucia `data/` ni `assets/references`) |
| `npm run test:raw` | Tests contra `./data` (debug; no usar en CI habitual) |
| `npm run smoke` | Smoke con DB aislada · happy path API |
| `npm run layout-smoke` | Chrome: ancho `.main-content` ≥70% + screenshot (`artifacts/`) |
| `npm run walkthrough` | Happy path UI (crear → Guardar → Copiar JSON) |

## Flujo emprendedor gratis (60 segundos)

Nombres = **botones / hubs reales** del Studio (sidebar):

1. **Influencers** → checklist «Arranque en 60 segundos» (Portafolio) *o* subnav **Ficha / Editor**.
2. **Crear influencer** *o* **Importar referencia** / **Inspirar desde foto**.
3. Completa nombre, tez, ojos y pelo → **Crear influencer** / **Guardar personaje** (solo JSON).
4. En paso **Lock & Packs**: botón verde **Copiar JSON** (pack cuerpo entero). Variantes en **Packs ▾**.
5. (Opcional) **Generar boceto (opt-in · puede pedir token)** con Pollinations — no hace falta para el flujo; sin `POLLINATIONS_TOKEN` suele fallar (401/402).
6. Pégalo en ChatGPT / Gemini / Claude / Meta **free** y pide variantes: *«misma persona, cuerpo entero, producto en mano»*.
7. Cuando quieras llevarte todo: **Exportar pack completo (.zip)** o **Descargar kit marca**.

El panel de salud del `character_lock` (Sólido / Aceptable / Débil) avisa si falta tez hex, cuerpo, etc. **Copiar nunca se bloquea.**

### Mapa de la UI (para no perderte)

| En la UI | Qué es |
|----------|--------|
| **Influencers** | Hub: Portafolio + Ficha / Editor |
| **Producir** | Hub: UGC + Guiones |
| **Negocio** | Hub: Campañas + Licensing |
| **Copiar JSON** | Acción canónica (header chip + Lock & Packs + checklist) |
| **Offline** | Chip en el sidebar (pausa Pollinations; prioriza JSON) |
| **Studio / Git** | Ajustes y sync — colapsados en el footer del sidebar |

### ¿Qué es `character_lock`?

Un bloque JSON con lo que **debe** repetirse en cada imagen (cara, tez, pelo, silueta) y lo que **puede** cambiar (pose, ropa, fondo, producto). Es el ancla gratis frente a face-lock de pago.

### Pollinations vs chatbot free

| Usa… | Para… |
|------|--------|
| **Copiar JSON** / Packs ▾ | Seguir el personaje en ChatGPT / Gemini / Claude free — sin red de imagen |
| Pollinations «Generar boceto (opt-in · puede pedir token)» | Bocetos locales opcionales; requiere token/pollen; acepta 429 |

> **Nota (2026):** Pollinations migró a créditos «pollen» y su API moderna **exige un token**; el acceso **anónimo** ya no genera imágenes (error `401` / *«Insufficient balance»*). Sigue siendo **cero costo**: crea una API key gratis en [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) y ponla como `POLLINATIONS_TOKEN` en `.env` (los grants diarios gratis cubren `flux`, sin tarjeta). El flujo free —**Copiar JSON** a un chatbot— **no** necesita esto.

**Modo offline** (chip **Offline** en el sidebar): desactiva Pollinations y resalta los botones de copiar. Si ves **429**, el banner sugiere activar offline — la cola no cambia, solo el énfasis.

Si ves **429 / espera Ns** (chip o banner ámbar): la cola genera **1 imagen a la vez** y enfría sola. No pulses generar otra vez; usa **Copiar JSON**.

### LoRA de personaje (opt-in, Fase L)

Consistencia más fuerte que el prompt solo — **sin romper el free path**:

1. Exporta **🧬 Pack de entrenamiento LoRA** desde la ficha (dataset + captions).
2. Entrena gratis en Colab: [docs/lora/L1_COLAB.md](./docs/lora/L1_COLAB.md) · notebook [`influ_json_lora_train.ipynb`](./docs/lora/influ_json_lora_train.ipynb).
3. Registra el `.safetensors` en la ficha (L2 ComfyUI) o usa trainer pago opt-in (L3 Replicate):  
   [docs/lora/L2_COMFYUI.md](./docs/lora/L2_COMFYUI.md) · [docs/lora/L3_PAID.md](./docs/lora/L3_PAID.md).  
   Sin ComfyUI / sin `ENABLE_PAID_LORA` → gen sigue en Pollinations.

## Datos y PIN

- DB: `data/influ.sqlite` (portable; ver `paths.js`). Los mirrors `./influ.sqlite` y `./personas.json` **no se versionan** (W6); opt-in legacy: `ENABLE_LEGACY_MIRRORS=1`.
- Auth local: `STUDIO_PIN` en `.env` (no lo subas a Git). PIN por defecto → cámbialo en **Ajustes → Perfiles** (no hay barra permanente de aviso).
- Perfil **Administración**: genera códigos de invitación en Ajustes. Quien canjea («Tengo una invitación» en el login) obtiene un perfil propio; influencers/productos/campañas **no se mezclan**.
- **Backup local** (solo Administración): Ajustes → Backup SQLite → crea/restaura copias en `data/backups/` (tras restaurar, reinicia `npm start`).
- **Presets de nicho** (Ficha · Identidad): Beauty / Fitness / Moda rellenan el formulario y refuerzan el `character_lock`.
- **Kit marca**: «Descargar kit marca» → ZIP con packs chatbot + guión UGC ~15s (`?kit=1`).
- **Cómo usar**: guía visual del flujo gratis (sidebar → **? Cómo usar**).
- **Matriz QA** (paso Variaciones): compara retrato ancla · cuerpo · spicy a ojo; checklist cara/tez/pelo (sin API de scoring).
- **Inspirar desde foto**: Analizar = vista previa (no guarda). Confirmar tez/ojos/pelo → Guardar → Copiar JSON.
- **Guardar personaje** = JSON-first (sin Pollinations). **Generar boceto (opt-in · puede pedir token)** es opcional.
- Primer arranque (Administración, roster vacío): modal founder con crear / import / guía.
- Auto-commit Git **apagado** por defecto; solo con `ENABLE_GIT_BACKUP=1` (botón bajo **Studio / Git**).
- `npm run start:minimal` **no** es producción.

## Documentación

- [HANDOFF.md](./HANDOFF.md) — foco actual entre Cursor ↔ Antigravity
- [ROADMAP.md](./ROADMAP.md) — plan y filosofía
- [PLAN-UX.md](./PLAN-UX.md) — plan de usabilidad
- [AGENTS.md](./AGENTS.md) — reglas para agentes
- [docs/SECURITY_MARKET.md](./docs/SECURITY_MARKET.md) — checklist seguridad antes de LAN / VPS
- [docs/ANALISIS_PROYECTO_2026-08.md](./docs/ANALISIS_PROYECTO_2026-08.md) — auditoría actual + mejoras priorizadas
- [SKILLS_MANUAL.md](./SKILLS_MANUAL.md) — skills de agentes

