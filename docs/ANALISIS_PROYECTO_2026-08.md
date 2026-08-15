# Análisis del proyecto y propuestas de mejora — 2026-08

> Auditoría sobre `main` @ `8fc83a0` (PR #116, posterior a CSRF #115).
> Alcance: funcionamiento, usabilidad, arquitectura, operación y seguridad.
> Este documento propone prioridades; **no implementa** las mejoras.

## 1. Resumen ejecutivo

influ-JSON ya tiene un núcleo útil y diferenciable: no compite solo como generador de imágenes, sino como un **formato portable de identidad** (`character_lock`) que el usuario puede llevar a chatbots gratuitos. Ese enfoque sigue siendo sólido incluso si cambia Pollinations, Gemini o cualquier otro proveedor.

El proyecto también está más maduro de lo que su interfaz monolítica sugiere:

- SQLite portable, migraciones y aislamiento por perfil.
- Crear desde cero e inspirar desde foto terminan en el mismo ritual: guardar → revisar lock → copiar JSON.
- Packs, historial de `character_lock`, export ZIP, backup/restore y auditoría.
- Pollinations, Replicate y LoRA desacoplados mediante flags y fallbacks.
- 78 archivos de tests, smoke API, smoke visual y walkthrough.
- Bind local por defecto, PIN, sesiones, rate-limit, CSP, ownership y CSRF.

La conclusión principal no es “añadir más funciones”. Es:

1. **Resolver los hallazgos P0 y cerrar higiene de release.**
2. **Hacer que instalar, diagnosticar y recuperar el Studio sea sencillo.**
3. **Convertir `character_lock` v1 en un contrato formal y portable.**
4. **Cerrar accesibilidad, borradores y recuperación de errores.**
5. Endurecer LAN/VPS solo cuando ese modo vaya a usarse realmente.

### Evaluación orientativa

No son métricas científicas; sirven para comparar áreas.

| Área | Estado | Lectura |
|------|--------|---------|
| Núcleo `character_lock` + packs | **Fuerte** | Es el moat real y ya tiene validador, historial y export |
| Happy path free | **Fuerte** | Crear/importar → guardar → Copiar JSON está cubierto |
| Generación opcional | **Buena con límites** | Cola/fallbacks existen; depende de tokens/grants externos |
| UX principal | **Buena** | Mucho mejor tras UX-0…5; quedan accesibilidad y recuperación |
| Operación / instalación | **Débil-media** | Aún exige Git + Node + terminal; soporte depende de leer docs |
| Seguridad localhost | **Buena** | Modelo local razonable y defensas activas |
| Seguridad LAN/VPS | **Media** | Falta modo operativo explícito y varias defensas de producción |
| Mantenibilidad front | **Media** | `app.js`, HTML y CSS siguen concentrando demasiada superficie |
| Calidad automatizada | **Fuerte** | Tests amplios + smoke visual; faltan gates de supply chain y algunos flujos avanzados |

---

## 2. Método y evidencia

Se revisaron, entre otros:

- Núcleo: `server.js`, `auth.js`, `db.js`, `paths.js`, `migrations.js`.
- Producto: `prompt-builder.js`, `chatbot-packs.js`, `character-lock-validator.js`, `image-provider.js`, `gen-queue.js`.
- Rutas: `routes/personas.js`, `routes/import.js`, `routes/generation.js`, `routes/admin.js`.
- Front: `app.js`, `index.html`, `index.css`, `views/`.
- Operación: `README.md`, `HANDOFF.md`, `ROADMAP.md`, `PLAN-UX.md`, `docs/SECURITY_MARKET.md`.
- Automatización: 78 archivos `test/*.test.js`, smoke API, layout smoke y CI.
- Supply chain: `npm audit --omit=dev` y árbol de la dependencia afectada.

Medidas actuales:

| Archivo | Líneas |
|---------|-------:|
| `app.js` | 7 650 |
| `index.html` | 2 737 |
| `index.css` | 5 261 |
| `server.js` | 1 082 |
| `auth.js` | 457 |

El HTML generado aún contiene aproximadamente:

- 205 botones.
- 82 inputs y 100 labels.
- 386 estilos inline.
- 14 handlers inline (`onclick`, `onchange`, etc.).
- 6 regiones `aria-live`.

Limitaciones de esta auditoría:

- No es un pentest externo.
- No valida la calidad visual real de proveedores de imagen.
- No evalúa instaladores nativos en Windows/macOS.
- Las dependencias y advisories pueden cambiar después de la fecha del documento.

---

## 3. Lo que debe protegerse

### 3.1 El producto no es Pollinations

El valor durable es:

```text
definir identidad → character_lock → copiar pack → producir en herramienta elegida
```

Pollinations es un bocetador opcional. En 2026 necesita token y créditos “pollen”; aunque existan grants gratuitos, no es una garantía controlada por influ-JSON. La promesa honesta debe distinguir:

- **Siempre local y sin API de imagen:** roster, lock, packs, scripts y exports.
- **Gratuito sujeto a tercero:** generación en Pollinations o free tiers de chatbots.
- **Pago opt-in:** Replicate / entrenamiento gestionado.

### 3.2 Fortalezas técnicas reales

- `character_lock.version = 1` ya aparece en el builder y packs.
- El validador local detecta identidad débil, tez, rostro, cabello y cuerpo.
- El historial evita perder un lock mejor al editar.
- La importación exige confirmar rasgos `must_match`.
- El free path no necesita Replicate, GPU ni tarjeta.
- Uploads validan formatos raster con `sharp`; SVG se rechaza.
- Descarga por URL revalida redirects y limita tamaño/tiempo.
- Referencias y generaciones privadas quedan detrás de sesión.
- SQLite tiene migraciones, backups, snapshot previo al restore y aislamiento de tests.
- CI ejecuta unit/integration, smoke de 9 pasos y Chrome layout smoke.

---

## 4. Hallazgos P0 — corregir antes de nuevas funciones

### P0-F1 · El lote de anuncios está roto por dos causas

**Evidencia:**

1. `app.js` usa `fetch('/api/ads/bulk-generate', { method: 'POST' })` directamente. Tras CSRF #115, esa mutación con cookie no envía `X-CSRF-Token`, por lo que devuelve `403 CSRF`.
2. `server.js` llama `genQueue.enqueue(async () => { ... })`, pero la firma real es `enqueue(label, jobFn)`. El callback queda usado como label y `jobFn` queda `undefined`; las tareas fallan al ejecutarse.
3. No hay tests del batch de anuncios ni de su ownership.

**Impacto:** una función visible puede aparentar que encola trabajo, pero no producir resultados.

**Corrección propuesta:**

- Cambiar el front a `authFetch`.
- Llamar `genQueue.enqueue(label, jobFn)`.
- Asociar cada batch a `profileId`.
- Proteger `GET /api/ads/batch-status/:batchId` por ownership.
- Calcular progreso con `completed + failed`.
- Añadir integración: crear producto/persona → iniciar batch con provider stub → completar → otro perfil obtiene 404.

**Criterio de hecho:** batch stub de 2 tareas termina `completed`, guarda 2 generaciones y no filtra datos entre perfiles.

### P0-S1 · Vulnerabilidad alta en una dependencia de producción

`npm audit --omit=dev` reporta una vulnerabilidad **high**:

```text
archiver 8.0.0
  → readdir-glob 3.0.0
    → minimatch 10.2.5
      → brace-expansion 5.0.7
```

Advisories: DoS por expansión no acotada; hay fix disponible (`brace-expansion >= 5.0.9`).

**Matiz:** no se confirmó que un usuario pueda controlar directamente el patrón vulnerable en los exports actuales. Aun así, es dependencia de producción y debe salir del baseline.

**Corrección propuesta:**

- Actualizar lockfile con la versión corregida compatible.
- Añadir `npm audit --omit=dev --audit-level=high` a CI.
- Mantener excepciones documentadas y con fecha solo si una actualización no es posible.

**Criterio de hecho:** CI falla ante cualquier advisory high/critical no aceptado explícitamente.

### P0-S2 · SSRF residual en URLs de referencia

La defensa actual bloquea IPs privadas textuales y revalida redirects, pero tiene dos huecos verificables:

- IPv4-mapped IPv6 (`[::ffff:127.0.0.1]`) no se reconoce como loopback.
- Hostnames públicos que resuelven a loopback/red privada se validan solo por nombre; no se revalida la IP DNS usada para conectar.

**Contexto:** requiere una sesión autenticada, así que el riesgo en localhost es bajo. En LAN/VPS puede permitir acceso server-side a servicios internos.

**Corrección propuesta:**

- Normalizar IPv4, IPv6 e IPv4-mapped antes de comparar rangos.
- Resolver DNS y rechazar cualquier A/AAAA privada, loopback o link-local.
- Repetir la validación en cada redirect.
- Evitar DNS rebinding fijando la IP validada en la conexión o revalidando inmediatamente antes del fetch.
- Limitar puertos remotos por defecto a 80/443.

**Criterio de hecho:** tests bloquean `::ffff:127.0.0.1`, loopback por hostname y redirect público → privado.

### P0-S3 · Valores `.env` admiten saltos de línea

`first-run.upsertEnvVar` y Ajustes → Claves interpolan valores directamente como `KEY=value`. PINs y tokens no rechazan `\r`/`\n`, por lo que un valor puede añadir líneas arbitrarias al `.env`.

Es admin-only y CSRF está activo, pero sigue siendo un fallo de integridad y agrava cualquier compromiso de sesión admin.

**Corrección propuesta:**

- Rechazar CR/LF y NUL en PINs/tokens.
- Escritura temporal + rename atómico.
- Permisos `0600` en POSIX.
- Test que confirma que un intento `valor\nOTRA_CLAVE=x` devuelve 400 y no modifica `.env`.

### P0-Q1 · El release gate no cubre todas las mutaciones del front

El test CSRF comprueba que `authFetch` adjunta el token, pero no impide que una nueva mutación use `fetch` directo. Eso permitió la regresión del batch.

**Mejora:**

- Test estático: todo `fetch('/api/...')` con método no seguro debe estar en una allowlist mínima (login, redeem, logout especial) o usar `authFetch`.
- Test de contrato que enumere rutas mutantes y compruebe: cookie sin CSRF → 403; cookie+CSRF → no 403; Bearer válido → no 401/403 CSRF.

---

## 5. Mejoras de funcionamiento

### F1 · Formalizar el contrato `influ-persona/v1`

Hoy existe `character_lock.version = 1`, pero no hay un JSON Schema central que defina todo el objeto portable ni una migración explícita entre versiones.

**Propuesta nueva:**

- `schemas/influ-persona-v1.schema.json`.
- Campos obligatorios mínimos:
  - `identity.name`
  - `character_lock.version`
  - `must_match_every_image.name`
  - tez, ojos y cabello
- `schema_id: "influ-persona/v1"` y `created_with`.
- Importador `normalize → validate → migrate`.
- Errores por campo en español; nunca descartar extensiones desconocidas.

**Beneficio:** packs interoperables, imports previsibles y evolución sin romper personajes.

**Criterio de hecho:** un pack v1 exportado en una máquina se importa en otra, valida igual y produce el mismo lock canónico.

### F2 · Añadir “Doctor del Studio” y paquete de soporte

El proyecto ya expone `/api/status`, pero el usuario todavía debe interpretar `.env`, paths, permisos, SQLite, tokens y providers.

**Propuesta nueva:**

```bash
npm run doctor
```

Debe comprobar:

- versión de Node;
- `DATA_DIR` escribible;
- `PRAGMA quick_check`;
- espacio libre;
- `.env` presente y permisos;
- PIN/configuración de bind;
- Pollinations configurado (sin mostrar token);
- provider local opcional;
- último backup;
- vulnerabilidades high/critical.

La UI podría descargar un `support-bundle.zip` **redactado** con:

- status y versiones;
- últimas líneas de log;
- schema DB;
- configuración booleana;
- nunca `.env`, tokens, prompts privados ni imágenes.

### F3 · Restore en dos fases con verificación

El restore actual crea snapshot de seguridad y copia el SQLite sobre el archivo activo, pero el handle singleton sigue abierto y se exige reiniciar.

**Riesgo:** el mensaje es correcto, pero una caída o escritura concurrente entre copia y reinicio puede producir estado confuso.

**Propuesta:**

1. Copiar snapshot a `restore-candidate.sqlite`.
2. Abrirlo read-only y ejecutar `PRAGMA quick_check`.
3. Guardar un marcador `pending-restore.json`.
4. Aplicar el swap atómico al siguiente arranque, antes de abrir la DB.
5. Conservar el snapshot `pre_restore`.

**Criterio de hecho:** restore inválido no toca la DB activa; restore válido entra en vigor tras un reinicio controlado.

### F4 · Cola durable y cancelable

`gen-queue.js` vive en memoria. Un reinicio pierde jobs, batches y cooldown; `activeAdBatches` también es global en memoria.

Para bocetos individuales esto es aceptable. Para lotes/LoRA deja de serlo.

**Propuesta:**

- Tabla `jobs` con `queued|running|done|failed|cancelled`.
- Reanudar como `failed_interrupted` tras reinicio, no ejecutar silenciosamente.
- Botón “Cancelar pendientes”.
- TTL/limpieza de resultados.
- Unificar batch ads, generación y entrenamiento bajo el mismo modelo.

### F5 · Proveniencia y confianza de rasgos

Al inspirar desde foto, conviene saber qué campo vino de:

- usuario;
- análisis Gemini;
- heurística local;
- preset;
- corrección posterior.

**Idea nueva:** guardar metadatos opcionales:

```json
{
  "trait_provenance": {
    "skin_tone": { "source": "user_confirmed", "confidence": 1 },
    "eye_color": { "source": "photo_analysis", "confidence": 0.72 }
  }
}
```

No debe ensuciar `must_match`; sirve para mostrar “confirmado” vs “estimado” y priorizar preguntas.

### F6 · Diferenciar disponibilidad de gratuidad

En status/UI, separar:

- `configured`
- `reachable`
- `has_credit_or_quota`
- `cost_mode: local | third_party_free_grant | paid`

“Disponible” no debería significar simultáneamente “módulo cargado”, “token configurado” y “puede generar ahora”.

### F7 · Corregir el contrato de finalización de cola

`queue-poller.js` consulta `q.completedCount`, pero `gen-queue.getStatus()` no devuelve ese campo. La rama que refresca variantes por contador nunca observa una finalización real.

**Alternativas:**

- Añadir un `completedCount` monotónico al status; o
- eliminar esa rama y refrescar únicamente en transición `active/pending → idle`.

**Criterio de hecho:** al terminar una generación, la variante nueva aparece una vez sin recargar ni hacer polling redundante.

---

## 6. Mejoras de usabilidad

### U1 · Instalación local de un clic

> **Estado 2026-08-14:** ✅ en `main` (#129) — `start-studio.{sh,cmd}` (Node 18+, doctor, abre navegador) + `npm run pack:release` (ZIP sin `.env`/`data`/`node_modules` + `LEEME.txt`).

Es el mayor hueco entre “producto usable” y “producto entregable”. Hoy GitHub Pages explica honestamente que hace falta clonar, instalar Node y usar terminal.

**Secuencia recomendada:**

1. `start-studio.{cmd,sh}`:
   - comprueba Node 18+;
   - instala solo si falta `node_modules`;
   - arranca;
   - abre `http://127.0.0.1:3000` (`OPEN_BROWSER=0` para desactivar).
2. ZIP de release (`npm run pack:release`) que no incluya datos ni `.env`.
3. Más adelante, instalador Windows/launcher nativo, sin convertirlo en requisito del desarrollo.

**Criterio de hecho:** una persona no técnica abre el Studio desde un ZIP con una acción y recibe un error accionable si falta Node.

### U2 · Borradores recuperables

No existe autosave del formulario de creación. Hay `localStorage` para QA, onboarding, offline y último pack, pero no para rasgos aún no guardados.

**Propuesta:**

- Borrador por perfil y modo (`crear` / `importar`).
- Debounce local; sin escribir secretos ni imágenes base64.
- Banner: “Recuperamos un borrador de hace 8 min”.
- Acciones “Continuar” / “Descartar”.
- Limpiar al guardar correctamente.

**Criterio de hecho:** recargar a mitad de una ficha no pierde nombre, tez, ojos, pelo ni cuerpo.

### U3 · Accesibilidad de modales y teclado

La mejora visual es fuerte, pero varios overlays siguen incompletos:

- `loginModal`, `settingsModal`, `historyModal`, `importInfluencerModal` y `campaignModal` no tienen contrato de diálogo completo.
- No se encontró un focus trap general ni manejo consistente de `Escape`.
- Hay 205 botones y múltiples interfaces dinámicas: solo 6 regiones `aria-live`.
- Algunos alt texts siguen en inglés o genéricos.

**Propuesta:**

- Utilidad única `openDialog/closeDialog`.
- `role="dialog"`, `aria-modal`, `aria-labelledby`.
- Guardar/restaurar foco; trap de Tab; Escape.
- Estados de cola y errores anunciados.
- Navegación de tabs con patrón ARIA.
- Test con axe-core en el layout smoke (como gate, inicialmente solo violaciones critical/serious).

### U4 · Errores con salida, no solo toast

Hay muchos toasts, pero en errores operativos el usuario necesita una siguiente acción.

Patrón recomendado:

| Error | Acción primaria |
|-------|-----------------|
| 401 Studio | Volver a iniciar sesión |
| CSRF | Recargar sesión sin perder borrador |
| 402 Pollinations | Copiar JSON / abrir Ajustes |
| 429 | Activar offline / esperar contador |
| DB no escribible | Abrir Doctor / copiar diagnóstico |
| Restore pendiente | Reiniciar Studio |

Cada error debería tener `code`, mensaje humano y CTA.

### U5 · Experimento de consistencia guiado

El validador mide completitud del JSON, no si una herramienta externa mantuvo la misma cara.

**Idea nueva:** “Prueba de identidad” reproducible:

1. Copiar un bloque con 3 prompts fijos (retrato, cuerpo entero, producto).
2. El usuario pega resultados o marca:
   - misma cara;
   - misma tez;
   - mismo pelo;
   - misma silueta.
3. Guardar evaluación local por versión del lock.
4. Comparar lock vN vs vN+1.

Esto convierte “parece consistente” en señal de producto sin pagar visión artificial.

### U6 · Vista “qué cambió” antes de sobrescribir identidad

Ya existe diff de revisiones, pero debería aparecer **antes** de guardar cuando se modifican campos `must_match`.

Ejemplo:

```text
Cambios de identidad
• Tez: claro cálido → medio oliva
• Pelo: castaño ondulado → negro liso

Esto puede cambiar la persona en futuras imágenes.
```

Acciones: “Guardar nueva identidad” o “Mantener lock anterior”.

### U7 · Smoke móvil como gate de CI

El layout smoke solo usa 1440×900. El bug histórico más costoso fue precisamente móvil, pero hoy 414×896 no está protegido.

**Propuesta:**

- Reutilizar el mismo script con viewport 414×896.
- Comprobar:
  - borde derecho de `.main-content` ≤ viewport;
  - `scrollWidth <= clientWidth`;
  - dashboard, Ficha paso 1 y CTA Copiar JSON visibles;
  - screenshot móvil como artifact.

### U8 · Recuperación automática de CSRF

`authFetch` adjunta el token, pero no tiene flujo global para un `403 CSRF` por pestaña vieja o token rotado.

**Propuesta:**

1. Ante `code=CSRF`, pedir un token fresco a `/api/auth/me` o `/api/status`.
2. Reintentar **una sola vez** la petición idempotente desde la perspectiva del cliente.
3. Si falla, conservar el borrador y mostrar “Recargar sesión”.
4. Nunca convertir silenciosamente un 403 en lista vacía.

---

## 7. Mejoras de seguridad

### S1 · Separar PIN humano de token API

El servidor acepta el PIN como `Authorization: Bearer` para CLI/tests. Es práctico, pero convierte una credencial humana estática en token API de 24 horas de facto.

**Para localhost:** riesgo aceptable.

**Antes de LAN/VPS:**

- generar tokens API aleatorios, revocables y con hash;
- scopes (`read`, `generate`, `admin`);
- mostrar el token una sola vez;
- mantener PIN solo para login browser;
- registrar creación/revocación en audit log.

### S2 · Sesiones persistentes para modo red

`express-session` usa el `MemoryStore` implícito:

- sesiones se pierden al reiniciar;
- no sirve con múltiples procesos;
- no está diseñado para producción prolongada.

**Recomendación:** mantenerlo en localhost, pero exigir store SQLite si `HOST=0.0.0.0` o documentar ese modo como no productivo. El mismo DB local puede alojar sesiones con TTL.

### S3 · Endurecer PINs de perfiles

El setup de Administración exige 6 caracteres, pero perfiles/invitaciones permiten 4.

**Propuesta:**

- mínimo uniforme de 6; recomendado 8 para bind público;
- bloquear PINs triviales (`1234`, secuencias, repetidos);
- migración no destructiva: no invalidar perfiles existentes, pedir cambio al próximo login;
- rate-limit por IP + perfil, con poda de mapas en memoria.

### S4 · Límites de recursos por modo

El parser JSON acepta 50 MB globalmente; imágenes 50 MB; LoRA 500 MB.

En localhost es tolerable. En LAN puede provocar presión de memoria/CPU antes de que `sharp` valide.

**Propuesta:**

- JSON normal: 1–2 MB.
- Upload de referencia: 15–25 MB y límite de megapíxeles.
- LoRA: endpoint separado con streaming, cuota por usuario y espacio libre mínimo.
- Timeout en operaciones caras.
- Límites más estrictos automáticos en `PUBLIC_NETWORK_MODE=1`.

### S5 · Reducir CSP `unsafe-inline`

La CSP es buena en `connect-src`, `object-src`, `base-uri` y `form-action`, pero mantiene `unsafe-inline` para script/style. El HTML aún contiene 386 estilos y 14 handlers inline.

**Ruta gradual:**

1. Eliminar handlers inline restantes.
2. Seguir moviendo estilos a clases.
3. Usar nonce para los pocos scripts inline inevitables.
4. Quitar `unsafe-inline` de `script-src`; después evaluar style.

No hace falta React.

### S6 · Secretos en disco

La UI escribe tokens en `.env`, pero no fuerza permisos `0600`, no valida saltos de línea y no escribe de forma atómica.

**Propuesta:**

- rechazar `\r`/`\n` en PINs y tokens;
- temp file + rename;
- `chmod 0600` en POSIX;
- nunca incluir valor en logs/audit/support bundle;
- botón “Borrar token” explícito;
- backup confirma que `.env` está excluido.

### S7 · Audit log de eventos de seguridad

El audit actual cubre exports, archive/delete, backups y LoRA, pero no se encontraron eventos para:

- login exitoso/fallido/lockout;
- logout;
- cambio de PIN;
- creación/revocación de invitación;
- cambio de claves;
- rechazo CSRF repetido.

Registrar solo metadatos mínimos; nunca PIN, token ni body.

### S8 · HSTS y validación de origen: solo en modo TLS

- HSTS no debe activarse en localhost HTTP.
- Si existe `PUBLIC_HTTPS_ORIGIN`, validar `Origin`/`Sec-Fetch-Site` en mutaciones como defensa adicional a CSRF.
- En ese modo: `COOKIE_SECURE=1`, `TRUST_PROXY=1`, HSTS y allowlist de host/origin.

### S9 · Gaps de aislamiento/autorización en endpoints secundarios

El núcleo de personas sí está aislado, pero quedan endpoints secundarios:

- `GET /api/stats/generations` llama `getGenerationStats()` sin `profileId`.
- `POST /api/sync` no exige `requireAdmin`; cualquier sesión puede disparar backup Git si está habilitado.
- `GET /api/local-gpu/status` devuelve URLs internas del backend a cualquier perfil autenticado.
- `/api/import-influencer` admite hasta cuatro uploads pero no usa `apiRateLimit('heavy')`.

**Corrección propuesta:**

- Stats por `req.session.profileId`.
- Sync solo Administración.
- Status GPU enmascarado para member.
- Rate-limit heavy en import y tests de aislamiento/autorización.

---

## 8. Arquitectura y mantenibilidad

### A1 · Continuar el troceado por feature, no por tipo de archivo

Ya existen módulos UMD y parciales HTML, pero `app.js` conserva 7 650 líneas y lógica de múltiples hubs.

Próximos cortes seguros:

```text
features/auth-ui.js
features/settings-ui.js
features/bulk-ads-ui.js
features/campaigns-ui.js
features/dialogs.js
```

Cada módulo debe recibir dependencias (`authFetch`, `state`, toast) en vez de depender de globals nuevos.

### A2 · Mover endpoints residuales de `server.js`

Productos, workspaces, batch ads, campañas y galería siguen en `server.js`. Extraer:

- `routes/products.js`
- `routes/campaigns.js`
- `routes/bulk-ads.js`
- `routes/gallery.js`

Esto facilita ownership, validación y tests por dominio.

### A3 · Corregir alcance de workspaces y batches

`getAllWorkspaces()` no filtra por perfil. `activeAdBatches` no guarda owner. Antes de promover esas funciones:

- añadir `profile_id`;
- migrar filas existentes a Administración;
- devolver 404 en recursos ajenos;
- añadir tests de aislamiento.

### A4 · Validación de inputs central

Muchas rutas consumen `req.body` directamente. Un esquema central por endpoint daría:

- tipos y límites previsibles;
- mensajes 400 consistentes;
- menos lógica defensiva repetida;
- documentación de API gratis.

Puede hacerse con funciones locales; no es obligatorio añadir una librería grande.

---

## 9. Ideas nuevas de producto

Estas ideas van después de cerrar P0 y operación.

### I1 · Recetas de producción portables

Una “receta” combina:

- persona + versión del lock;
- tipo de shot;
- cámara;
- producto;
- tono de voz;
- formato;
- CTA.

Exportable como JSON pequeño, sin imágenes. Permite repetir una campaña con otra persona y compartir buenas prácticas.

### I2 · Brief de marca → checklist de producción

> **Estado 2026-08-14:** ✅ `production-brief.js` + card dashboard «Qué producir ahora».

En lugar de generar más texto, transformar un brief en tareas:

```text
3 hooks pendientes
1 pack producto listo
2 shots verticales pendientes
Licencia sin emitir
```

Es más operativo que sumar otra pantalla de IA.

### I3 · “Lock lab” local

Banco de pruebas de versiones:

- lock A vs B;
- mismos 3 prompts;
- evaluación manual;
- recomendación de conservar/revertir.

Usa historial y QA existentes; no necesita API de scoring.

### I4 · Plantillas comunitarias sin datos personales

> **Estado 2026-08-14:** ✅ en `main` (#128) — `community-templates.js` + card Dashboard (aplicar / copiar JSON / import seguro).

Compartir solo:

- estructura de pack;
- shot types;
- cámara;
- guiones;
- reglas de realismo.

Nunca compartir cara, fotos o `must_match` de una persona por defecto.

### I5 · Métrica local de activación

Sin analytics externos:

- creó/importó;
- guardó;
- copió primer JSON;
- exportó pack;
- completó prueba de identidad.

Mostrar solo al usuario: “Tu Studio está listo 4/5”. Esto ayuda a mejorar onboarding sin telemetría.

---

## 10. Roadmap recomendado

### Corte A — Baseline confiable

> **Estado 2026-08-13:** ✅ en `main` (#118).

1. Reparar batch ads (CSRF + firma de cola + ownership).
2. Resolver advisory high de `brace-expansion`.
3. Gate CI para audit high/critical.
4. Gate estático contra mutaciones con `fetch` directo.
5. Test del batch.
6. Corregir `completedCount` fantasma de la cola.

### Corte B — Hardening de datos/red

> **Estado 2026-08-13:** ✅ en `main` (#119).

1. SSRF IPv4-mapped + resolución DNS segura.
2. Rechazar CR/LF en `.env`; escritura atómica/permisos.
3. Scope stats + sync admin + GPU status enmascarado.
4. Rate-limit del import.

### Corte C — Operación en otra máquina

> **Estado 2026-08-13:** ✅ en `main` (#120).

1. `npm run doctor`.
2. Support bundle redactado.
3. Restore en dos fases + `quick_check`.
4. Launcher `.cmd` / `.sh` + ZIP release.

### Corte D — Contrato portable

> **Estado 2026-08-13:** en implementación (`cursor/corte-d-persona-schema-9b67`).

1. JSON Schema `influ-persona/v1`.
2. Normalize/migrate/import.
3. Proveniencia de rasgos.
4. Test round-trip entre instalaciones.

### Corte E — UX resistente

1. Autosave de borradores. ✅ `persona-draft.js` + banner Continuar/Descartar
2. Smoke móvil en CI. ✅ `layout-smoke` pass `mobile-414` (414×896)
3. Diálogos accesibles y teclado. ✅ `studio-dialogs.js` Escape/foco/`role=dialog`
4. Recovery CSRF + errores con CTA/códigos. ✅ `authFetch` retry + `notifyApiError`
5. Diff antes de cambiar `must_match`. ✅ confirm pre-save en `savePersona`

### Corte F — Modo LAN/VPS (solo si se usa)

1. Tokens API separados del PIN. ⏳ aparcado (Bearer PIN OK en LAN casera; S1 después)
2. Store de sesión SQLite. ✅ `session-store.js` (default si `HOST=0.0.0.0`)
3. PIN mínimo uniforme. ✅ 6 + anti-trivial (`validateProfilePin`)
4. Límites de recursos. ✅ JSON/upload más estrictos en bind público
5. Origin/Host allowlist + HSTS condicional. ✅ opt-in `ALLOWED_*` / `PUBLIC_HTTPS_ORIGIN`
6. Audit de eventos de seguridad. ✅ login/logout/PIN change

### Corte G — Medir el valor

1. Prueba de identidad guiada. ✅ `identity-trial.js` + silueta + 3 prompts
2. Lock lab A/B. ✅ `lock-lab.js` + panel en avanzado
3. Métrica local de activación. ✅ `studio-activation.js` · “Tu Studio está listo X/5”
4. Recetas de producción. ✅ `production-recipe.js` · copiar JSON sin must_match

---

## 11. Qué no conviene hacer ahora

- No migrar a React para resolver tamaño de archivos.
- No convertir Google/OAuth/SaaS en requisito del Studio local.
- No añadir otro proveedor pago antes de cerrar operación y diagnóstico.
- No prometer que Pollinations o cualquier free tier será gratis para siempre.
- No construir video real mientras batch ads y recuperación aún tienen gaps.
- No usar analítica remota por defecto.
- No sustituir el juicio humano de identidad por un score automático opaco.

---

## 12. Próxima decisión recomendada

Los siguientes PRs de código deberían ser pequeños y secuenciales:

```text
1. fix batch ads + test de aislamiento
2. actualizar dependencia vulnerable + gate audit
3. hardening SSRF + env injection
4. gates CI (fetch mutante + smoke móvil)
```

Después, el mayor retorno para usuarios reales es **Doctor + launcher local**, no otra función de generación.
