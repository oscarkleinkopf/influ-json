# PLAN-UX — ordenar la interfaz y la operatividad

> Auditoría + plan de trabajo. **Ningún código fue modificado** al escribir este documento.
> Contexto: [ROADMAP.md](./ROADMAP.md) · [HANDOFF.md](./HANDOFF.md) · [PLAN-NEXT.md](./PLAN-NEXT.md) · [AGENTS.md](./AGENTS.md)
>
> Fecha: 2026-08-11 · Auditado sobre `main` @ `f9822ec`, Chrome headless 1440×900 y 414×896, `npm test` 285/285 ✅

---

## 1. Opinión honesta

**Lo bueno, y no es poco.** La idea central está bien elegida y es defendible: el producto no es «otro generador de imágenes», es **un formato de identidad (`character_lock`) que el usuario se lleva a cualquier chatbot gratis**. Eso sobrevive a que Pollinations cambie de precio, a que Replicate suba tarifas y a que aparezca un modelo nuevo. La disciplina de ingeniería del backend es superior a la media de un proyecto de una persona: 285 tests verdes, rutas extraídas a `routes/`, migraciones versionadas (schema v11), audit log, rate-limit, CSP endurecida, ownership por perfil, backups ZIP. `ROADMAP.md` / `HANDOFF.md` / `AGENTS.md` son mejores que los de muchos equipos.

**El problema, dicho sin rodeos.** La **superficie** del producto creció mucho más rápido que su **estructura**, y la verificación se quedó entera del lado del servidor. Cada sesión añadió una tarjeta, un botón o un banner a los mismos dos archivos (`index.html`, `app.js`), y nadie volvió a mirar la página renderizada como parte del *definition of done*. El resultado concreto:

**El layout de escritorio lleva roto desde mediados de julio y ningún test lo ve.** Un `</div>` de más en `index.html` (línea 1533) cierra antes de tiempo `<section id="persona-engine">` y `<main class="main-content">`. Como `body { display: flex }`, todo lo que viene después —el historial de generaciones y **cuatro de las ocho pestañas**— queda como hermano flex de `.app-container` y le roba el ancho. Medido en un viewport de 1440 px: `.main-content` ocupa **425 px** en vez de 1180, y la rejilla del dashboard se dibuja a **1 columna** en vez de 3. En móvil (414 px) es peor: `.main-content` conserva el `margin-left: 260px` del escritorio, su borde derecho cae en **630 px**, y lo único legible al entrar es el panel huérfano «Historial de Generaciones» —vacío— de la última persona seleccionada.

Ese bug es el síntoma, no la enfermedad. La enfermedad es que **hay 285 tests y ninguno abre la página**. `test/frontend-smoke.test.js` hace regex sobre el texto de `app.js`; nunca construye un DOM. Un solo assert de estructura (`main > .tab-panel` = 8) habría atrapado esto hace ~170 commits.

**Sobre el orden de la interfaz.** No es un problema estético: la UI es bonita y coherente. Es un problema de **jerarquía**. Hay 8 pestañas de madurez radicalmente distinta —`Galería Prompts` tiene 1 control visible y `Campañas` 1 botón, mientras `Persona Engine` mide **8294 px de alto** con **139 controles visibles** (131 de ellos botones)—. Hay **11 botones distintos que dicen alguna variante de «Copiar JSON»**, que es *la* acción del producto. Hay controles muertos conviviendo con los buenos: «Regenerar Scripts» no tiene handler aunque el endpoint existe, «Enviar Propuesta» es un `alert()`, el pipeline de vídeo es una barra de progreso simulada y la métrica «Scripts» del dashboard es `campañas × 10`. Nada de eso es grave por separado; junto, hace que el usuario no sepa qué es real.

**Sobre la operatividad.** El happy path está repartido en cuatro superficies (checklist del Resumen, guía «Cómo usar», Persona Engine, UGC Studio) y cada pestaña reelige el influencer por su cuenta, así que no hay una noción global de «con quién estoy trabajando». El emprendedor entra, ve un muro y tiene que aprender el mapa antes de copiar su primer JSON.

**Mi lectura de fondo:** hay un desequilibrio entre el esfuerzo de planificar/registrar (excelente) y el de verificar lo que se ve (inexistente). El siguiente salto de calidad no está en más features —Fases R y L ya están hechas— sino en **quitar, ordenar y poner una red de seguridad visual**.

---

## 2. Evidencia medida

| Medida | Valor | Cómo se obtuvo |
|--------|-------|----------------|
| `index.html` / `app.js` / `index.css` | 2 490 / 8 543 / 3 849 líneas (185 / 363 / 78 KB) | `wc -l` |
| Atributos `style="` inline en `index.html` | **708** | ripgrep |
| Etiquetas desbalanceadas en `index.html` | **4** (desde ~2026-07-17, ~170 commits) | parser de pila propio + `git show` por commit |
| Pestañas dentro de `<main>` | **4 de 8** (`script-engine`, `ugc-studio`, `licensing`, `gallery` cuelgan de `<body>`) | `document.querySelector('.main-content').children` |
| Ancho útil en escritorio 1440 px | **425 px** (29 %) → 1180 px tras reparar el DOM en memoria | `getBoundingClientRect()` |
| Rejilla del dashboard | 1 columna → 3 columnas tras reparar | `getComputedStyle().gridTemplateColumns` |
| Borde derecho de `.main-content` en móvil 414 px | **630 px** (216 px fuera de pantalla) | falta `margin-left: 0` en `@media (max-width: 768px)` |
| Alto de `persona-engine` | **8 294 px**; 193 controles, 139 visibles (131 botones) | render headless |
| `persona-engine` con el formulario abierto | 131 visibles: 96 botones + 35 campos | render headless |
| Alto/controles del resto | `gallery` 1 control · `campaigns` 1 botón visible · `licensing` 4 · `script-engine` 17 | render headless |
| Botones «Copiar JSON» distintos | **11** con 4 redacciones | inventario de `index.html` |
| `getElementById` / `innerHTML =` / `addEventListener` en `app.js` | 690 / 94 / 192 | ripgrep |
| Funciones colgadas de `window.` | ~40 | ripgrep |
| Llamadas al toast marcado `@deprecated` | 24 | ripgrep |
| `npm test` | **285/285 ✅** en 56 s… escribiendo en `data/influ.sqlite` real | ejecución + inspección de la DB |
| Residuo dejado por los tests en la DB de trabajo | `SpeedTestPersona`, `DualSyncPersona_…` + 3 perfiles | `select … from personas` tras `npm test` |
| PRs draft abiertos sin mergear | 6 (#72, #76, #77, #78, #79, #80) | `gh pr list` |

Controles muertos o simulados detectados: `#btnGenerateCampaignScripts` (sin handler; `POST /api/campaigns/:id/scripts` sí existe), «Enviar Propuesta» (`onclick="alert(...)"`), «Renderizar Video UGC» (`startVideoPipelineSimulation`, temporizador falso), stat «Scripts» (`campaigns.length * 10`).

---

## 3. Principios del plan

1. **Primero que se vea bien, después que haya más.** Ninguna feature nueva hasta cerrar el bloque UX-0.
2. **Quitar antes que añadir.** Cada pestaña, botón o panel que no tenga un trabajo claro se fusiona o se borra.
3. **Una acción principal por pantalla.** «Copiar JSON» es *la* acción; el resto se subordina.
4. **Honestidad de UI** (ya está en el ADN del proyecto): si algo es simulado, se etiqueta o se va.
5. **Sin React, sin rewrite.** El monolito se ordena partiéndolo en piezas servidas, como ya se hizo con `routes/` y los UMD.
6. **Red de seguridad antes de refactorizar.** No se toca la estructura de `index.html` sin un test que valide la estructura.
7. **Nada rompe el path gratis** (`Crear/importar → portafolio → copiar JSON → export pack`).

---

## 4. Bloque UX-0 — Estructura rota (P0, antes que nada)

### UX-0a · Cerrar el `</div>` sobrante y devolver las 4 pestañas a `<main>`

- **Qué:** eliminar el `</div>` de más alrededor de `index.html:1533` (cierre del `#variantManagerSection`) para que `<section id="persona-engine">` y `<main>` se cierren donde toca; verificar que quedan 0 desbalances.
- **Riesgo:** bajo en lógica, alto en apariencia — al recuperar 755 px de ancho, todas las rejillas pasan a 2–3 columnas y hay que revisar tarjetas que hoy están «cómodas» en columna estrecha.
- **Criterio de hecho:** `main > .tab-panel` = 8; `.main-content` ≈ 1180 px en 1440; rejilla del dashboard a 3 columnas; ninguna pestaña se dibuja pegada al borde superior.

### UX-0b · Arreglar el desplazamiento móvil

- **Qué:** en `@media (max-width: 768px)`, `.main-content` debe resetear `margin-left: 0` (hoy hereda `var(--sidebar-width)` = 260 px) y usar `width: 100%` en lugar de `100vw` (evita el scroll horizontal por la barra de scroll).
- **Criterio de hecho:** en 414 px el borde derecho de `.main-content` = 414; sin scroll horizontal; el logo del header no se corta.

### UX-0c · Sacar `#offlineModeBar` del flujo flex de `<body>`

- **Qué:** la barra de modo offline es `position: sticky` y, siendo hija de `<body>` (que es `display: flex`), se come 304 px de ancho de forma permanente. Debe ser `fixed` bajo el header o vivir dentro de `.main-content`.
- **Criterio de hecho:** con modo offline activo, el ancho de `.main-content` no cambia.

### UX-0d · Red de seguridad: test de estructura del DOM

- **Qué:** ampliar `test/frontend-smoke.test.js` (o crear `test/html-structure.test.js`) con dos asserts baratos y sin dependencias nuevas:
  1. parser de pila sobre `index.html` → 0 etiquetas desbalanceadas;
  2. cada `data-tab` de la navegación tiene una `section.tab-panel` **hija de `<main>`** con ese `id`.
- **Opcional (CI):** GitHub Actions ya trae Chrome; un job que renderice `/` y compruebe `main.getBoundingClientRect().width > 0.7 * viewport` cierra la categoría entera de fallos.
- **Criterio de hecho:** el test falla si se reintroduce a mano el `</div>` sobrante.

---

## 5. Bloque UX-1 — Arquitectura de información

### UX-1a · De 8 pestañas a 4 + ayuda

| Hoy | Propuesta | Razón |
|-----|-----------|-------|
| Resumen · Persona Engine | **Influencers** (portafolio → ficha → editor) | El portafolio y el selector de personas son la misma cosa en dos sitios |
| UGC Studio · Script Engine · Galería Prompts | **Producir** (imagen, guion, variantes; la galería pasa a panel lateral) | Las tres operan sobre «el influencer activo + un producto» |
| Campañas · Licensing & Pitch | **Negocio** | 1 y 4 controles visibles respectivamente; no justifican pestaña propia |
| Cómo usar | Botón **?** en el header + primer arranque | Es ayuda, no un destino |

La navegación móvil debería reflejar exactamente estas 4 entradas (hoy muestra 4 elementos con **etiquetas distintas** a las del sidebar: «Influencers»/«Studio» vs «Persona Engine»/«UGC Studio»).

- **Criterio de hecho:** sidebar y bottom-nav tienen los mismos ítems y los mismos nombres; ninguna pestaña queda con menos de 5 controles útiles.

### UX-1b · Influencer activo como contexto global

- **Qué:** un chip persistente en el header («Trabajando con: **Valentina Ríos** ▾») que fije el influencer para todas las pestañas, en vez de que UGC Studio, Script Engine y Campañas tengan cada una su propio selector. En `app.js` ya existe `state.selectedPersona`; falta exponerlo y que los selectores locales lean de ahí.
- **Criterio de hecho:** cambiar de influencer en el chip actualiza ficha, packs, variantes y UGC sin volver a elegirlo.

### UX-1c · Un solo «Copiar JSON»

- **Qué:** una acción primaria en la cabecera de la ficha + **un** menú «Packs ▾» (cuerpo entero / bikini / spicy / producto / face pack / semana UGC). Los otros 9 botones o desaparecen o navegan al canónico. Vocabulario único: «Copiar JSON» para el pack recomendado, «Copiar prompt» para el prompt compilado, «Copiar estructura» para el JSON crudo del editor.
- **Criterio de hecho:** buscando «Copiar JSON» en `index.html` aparecen ≤ 3 elementos y ninguno duplica destino.

---

## 6. Bloque UX-2 — Partir el Persona Engine

8 294 px y 139 controles visibles en una sola pestaña es la mayor fuente de fricción del producto. Propuesta: **tres pasos** dentro de «Influencers», no tres pestañas nuevas.

| Paso | Contiene | Regla |
|------|----------|-------|
| **1 · Identidad** | Crear desde cero / Importar foto / presets de nicho; formulario reducido a lo que alimenta `must_match_every_image` (nombre, tez + hex, ojos, pelo, cuerpo, asimetría) | Lo demás va a «Detalles avanzados» plegado |
| **2 · Lock & Packs** | Panel de salud del `character_lock`, ficha, packs, export ZIP / kit marca, checklist chatbot | Es el paso que vende el producto: debe caber en una pantalla |
| **3 · Variaciones** | Repositorio de poses, chips de cámara/shot, face pack, matriz QA, comparador, historial | Todo esto es opcional y hoy compite con el paso 2 |

Lo avanzado —LoRA (L2/L5), face-lock de pago, comparador A/B, historial de versiones, editor JSON crudo— se agrupa en un único bloque **«Avanzado»** plegado por defecto, en lugar de estar repartido en `<details>` y paneles sueltos.

- **Criterio de hecho:** el paso 1 cabe en ≤ 2 pantallas (≈1800 px); crear y copiar el primer JSON no exige tocar el paso 3; ningún paso supera los 40 controles visibles.

---

## 7. Bloque UX-3 — Operatividad y honestidad

| # | Ítem | Acción |
|---|------|--------|
| UX-3a | «Regenerar Scripts» (`#btnGenerateCampaignScripts`) | Cablear a `POST /api/campaigns/:id/scripts` (el endpoint existe) o quitar el botón |
| UX-3b | «Enviar Propuesta» (`alert()`) | Convertir en «Copiar propuesta» / «Descargar PDF» o quitar |
| UX-3c | Vídeo UGC simulado | Etiquetar «Demo — sin pipeline real» o esconder tras flag, como se hizo con LoRA/face-lock |
| UX-3d | Stat «Scripts» = `campañas × 10` | Contar scripts reales o quitar la tarjeta |
| UX-3e | Productos: el dashboard muestra 0 con productos en otro perfil | Revisar el scope por perfil en el contador |
| UX-3f | Estados vacíos (`gallery`, `campaigns`, historial) | Uno y solo un CTA por estado vacío, apuntando al happy path |
| UX-3g | Modal de Ajustes = scroll largo (claves → métricas → audit → perfiles → invitaciones → backup) | **Redo en curso** (`cursor/settings-tabs-ux-9b67`) — draft #72 cerrado; reimplementado sobre `views/_foot.html` |
| UX-3h | Toast `showSyncToast` marcado `@deprecated` con 24 usos | Migrar a `showAppToast` y borrar |

---

## 8. Bloque UX-4 — Mantenibilidad mínima (sin React)

**Estado (2026-08-12):** cerrado en lo esencial (#92 + restos #93). Detalles de cierre en rama `ux-detalles-cierre`: más CSS, photo/vault UI modules, uploads aislados, layout-smoke Chrome.

1. **Partir `index.html` en parciales** ✅ `views/` + `compose-index.js`
2. **Extraer `style=` inline** ✅ utilidades `.u-*` (sigue habiendo oneshots; no bloquea)
3. **Trocear `app.js`** ✅ + `photo-upload-ui.js` + `variant-vault-ui.js`
4. **Un único constructor de tarjeta** ✅
5. **Un solo lector del formulario** ✅

---

## 9. Bloque UX-5 — Harness

**Estado (2026-08-12):** en curso — aislamiento DB + DoD.

- **Aislar la DB en tests.** ✅ + uploads a `DATA_DIR/references` (`INFLU_TEST_UPLOADS`).
- **Cerrar los 6 PRs draft abiertos.** ✅ Cerrados #72 + #76–#80. **Backlog:** no reintegrar en masa; #72 (Ajustes tabs) y fixes gen solo si el owner pide repro en `main`.
- **Definition of done** ✅ + automatizado: `npm run layout-smoke` (Chrome width + screenshot en CI).

---

## 10. Orden sugerido

```
UX-0d (test de estructura)  →  UX-0a/0b/0c (bugs de layout)  →  UX-5 (DB aislada + cerrar drafts)
   →  UX-3 (honestidad y botones muertos, barato y visible)
   →  UX-1 (fusionar pestañas + influencer activo + un solo Copiar JSON)
   →  UX-2 (partir Persona Engine en 3 pasos)
   →  UX-4 (parciales HTML, CSS, trocear app.js)
```

UX-0 y UX-5 son de bajo riesgo y alto retorno, y conviene hacerlos antes de cualquier reordenación: mover secciones sobre un HTML desbalanceado es pedir problemas. UX-4 va al final a propósito: partir archivos es más seguro cuando la IA (arquitectura de información) ya está decidida, porque los parciales se recortan según la estructura final y no según la actual.

**Un work item = una rama + un PR**, como marca `PLAN-NEXT.md`, y nunca dos ítems tocando `app.js` a la vez.

---

## 11. Qué NO hacer

- **No migrar a React.** Ya está en el parking lot del ROADMAP y sigue siendo la decisión correcta: el problema es de estructura y verificación, no de framework.
- **No rediseñar la estética.** El tema oscuro con glass-cards funciona; lo que falta es jerarquía.
- **No añadir features de pago** mientras el layout base esté roto.
- **No borrar pestañas sin mover su contenido**: `Licensing` y `Campañas` tienen poco control visible pero endpoints y skills reales detrás.
- **No tocar el path gratis.** Cualquier reordenación debe seguir permitiendo: crear → guardar → copiar JSON → pegar en chatbot, sin token ni tarjeta.
