# influ-JSON — Roadmap 4 semanas (Mecánica + Usabilidad)

**Objetivo del ciclo:** que el loop principal sea aburridamente confiable  
`crear influencer → generar UGC → exportar pack`  
sin ampliar aún multi-tenant ni auth enterprise.

**Prioridad declarada:** Mecánica → Usabilidad → Seguridad (mínima al final del ciclo).  
**Fecha de inicio:** 2026-07-19  
**Horizonte:** 4 semanas (hasta ~2026-08-15)

**Estado actual (baseline):**
- [x] Roster en SQLite + CRUD personas
- [x] Import por foto/URL (persiste en analyze)
- [x] Fix refresh UI post-crear/import (`app.js` aeee817)
- [ ] Happy path de 60 segundos
- [ ] Consistencia visual medible
- [ ] Mensajes de estado honestos (offline / rate limit)
- [ ] DB path portable (sin hardcode scratch Antigravity)

---

## Principio guía

> No agregar features nuevas de “agencia completa”.  
> Endurecer el núcleo. Recortar ruido. Hacer que cada acción se vea al instante en la UI.

**Fuera de alcance estas 4 semanas:** multi-usuario, OAuth, billing, video real end-to-end, rediseño total de marca.

---

## Semana 1 — Mecánica del roster (fiabilidad)

**Meta:** crear/editar/listar/archivar personas sin sorpresas. Cero “guardé y no aparece”.

### Entregables
| # | Tarea | Criterio de hecho |
|---|--------|-------------------|
| 1.1 | Auditoría create/import/save/delete/archive | Matriz de 8 flujos manuales documentada en `docs/qa-roster.md` |
| 1.2 | Import: no depender solo del “Confirmar” para ver la persona | Tras analyze, ya está en portafolio (parcialmente hecho; validar + tests manuales) |
| 1.3 | “Crear desde cero” siempre limpia `selectedPersona` | Guardar con nombre nuevo **nunca** renombra otra por accidente ✅ |
| 1.4 | Toast/feedback unificado | Toda mutación muestra éxito/error visible ≥3s ✅ |
| 1.5 | Contador del dashboard = filas reales filtradas | `statPersonasCount` coincide con tarjetas visibles ✅ |
| 1.6 | DB path portable | `db.js` usa `path.join(__dirname, …)` o `DATA_DIR` env; quitar path hardcode al brain de Antigravity (con migración de archivo existente) |

### Definition of Done (S1)
- [ ] Crear “Test Roadmap 1”, refrescar, archivar, desarchivar, borrar — sin inconsistencias
- [ ] Importar con nombre custom → aparece en Dashboard y en Persona Engine sin F5
- [ ] Server arranca en otra carpeta/clone sin romper la DB

---

## Semana 2 — Loop UGC (el producto de verdad)

**Meta:** de una persona seleccionada a 3 piezas UGC en el menor número de clics.

### Entregables
| # | Tarea | Criterio de hecho |
|---|--------|-------------------|
| 2.1 | Botón **“Generar 3 UGC”** en ficha de persona | Un click lanza 3 generaciones (o cola) con producto default |
| 2.2 | Historial por persona siempre al día | Tras generar, la sección historial se refresca sola |
| 2.3 | Estados honestos de generación | Offline / sin API key / 429 Pollinations → mensaje claro + fallback |
| 2.4 | Preview de consistencia (v0) | Mostrar side-by-side: ancla vs última gen (aunque sea manual visual) |
| 2.5 | Script mínimo usable | Desde persona, 1 hook + body + CTA copiable sin ir a tab lejana (atajo o panel) |
| 2.6 | Export pack v0 | ZIP o carpeta: 3 imágenes + JSON persona + txt scripts |

### Definition of Done (S2)
- [ ] Con Nano Banana o Daniela 1: ≤5 clics hasta tener 3 assets + texto en disco
- [ ] Si falla la API, el usuario entiende **por qué** y qué hacer

---

## Semana 3 — Usabilidad y simplificación de superficie

**Meta:** que un usuario nuevo (o tú en 3 meses) entienda el estudio en 5 minutos.

### Entregables
| # | Tarea | Criterio de hecho |
|---|--------|-------------------|
| 3.1 | **Home = Happy path** | Dashboard muestra CTA primario: “Nuevo influencer” + “Continuar con [última]” |
| 3.2 | Agrupar tabs secundarios | Campaigns + Licensing → “Pack comercial” (o wizard al final); Galería accesible pero no competitiva |
| 3.3 | Empty states | Roster vacío / sin generaciones / sin producto: copy + botón, no grillas mudas |
| 3.4 | Buscador + filtros memorables | Query y filtro no “tragan” personas sin feedback (“0 resultados para X — limpiar”) |
| 3.5 | Onboarding de 3 pasos (modal o checklist) | 1) Crear 2) Generar UGC 3) Exportar — dismissible, no vuelve a molestar |
| 3.6 | Loading skeletons / disable double-submit | Botones de guardar/generar deshabilitados mientras corre la acción |
| 3.7 | Limpieza de copy confuso | Quitar promesas de “GPT-5.6” si no aplica; alinear labels ES |

### Definition of Done (S3)
- [ ] Persona no técnica completa el loop sin instrucciones orales
- [ ] Sidebar no se siente como 7 productos distintos

---

## Semana 4 — Consistencia visual + seguridad mínima + cierre

**Meta:** el roster se ve “misma persona”; el proyecto no se dispara en el pie con secretos/DB.

### Entregables
| # | Tarea | Criterio de hecho |
|---|--------|-------------------|
| 4.1 | Character lock reforzado | Prompt builder siempre inyecta traits + hex + ref path de forma determinista |
| 4.2 | Variantes ligadas a ancla | Nueva pose usa siempre `image` principal como reference |
| 4.3 | Checklist “¿se parece?” (UX) | Antes de marcar UGC como “listo”, checkbox humano o nota en ficha |
| 4.4 | Seguridad mínima (no enterprise) | Token fuera de `git remote`; rotar PAT si estuvo en URL; `.env.example` sin secretos; no commitear `.env` |
| 4.5 | Backup DB explícito | Botón o script `npm run backup-db` → copia timestamped de `influ.sqlite` |
| 4.6 | README de operador | Cómo arrancar, PIN, API keys, happy path, límites offline |
| 4.7 | Review de deuda consciente | Lista “no hacer aún” (multi-tenant, OAuth, video pipeline) en este mismo archivo |

### Definition of Done (S4)
- [ ] 5 generaciones seguidas de la misma persona se reconocen como la misma (criterio humano)
- [ ] Repo limpio de secretos; backup de DB documentado
- [ ] Decisión go/no-go: ¿abrir a un beta tester externo?

---

## Métricas semanales (simples, no vanity)

| Métrica | Cómo medir | Target fin de ciclo |
|---------|------------|---------------------|
| Tiempo a primer UGC | Cronómetro desde “Nuevo influencer” | ≤ 10 min |
| Fallos “no aparece en lista” | Incidentes / semana | 0 |
| Generaciones fallidas sin mensaje | Contar en uso real | 0 |
| Clics a pack exportable | Contar en demo | ≤ 8 |

---

## Orden de implementación sugerido (si solo hay 1–2 sesiones/semana)

1. **S1.6** DB portable (evita pérdida de datos al mover carpetas)  
2. **S1.3–1.4** create limpio + toasts  
3. **S2.1 + S2.3** Generar 3 UGC + estados honestos  
4. **S2.6** Export pack  
5. **S3.1 + S3.2** Home y menos tabs  
6. **S4.1–4.4** Consistencia + secretos  

---

## No hacer (parking lot)

- Multi-tenant / roles / OAuth Google  
- Marketplace de influencers  
- Video full pipeline con editor  
- Rediseño visual total (glassmorphism ok por ahora)  
- Integración Instagram API real de posting  
- Refactor a React/Vue solo por moda (solo si el monólito `app.js` bloquea S2–S3; preferir módulos JS graduales)

---

## Cómo usar este roadmap con Grok

- En el repo: este archivo `ROADMAP.md` + reglas en `AGENTS.md` y `.grok/rules/roadmap.md`.  
- En la app Grok: tarea semanal de check-in (lunes) que lee este roadmap y reporta progreso.  
- Al empezar sesión: decir *“seguimos el ROADMAP semana N”* o *“implementa 1.6 del roadmap”*.

### Log de progreso (actualizar aquí)

| Fecha | Semana | Hecho | Notas |
|-------|--------|-------|-------|
| 2026-07-19 | 0 | Fix refresh post-import/create | commit `aeee817` |
| 2026-07-19 | 1 | **1.3** Crear desde cero = forceCreate (no rename) | `isCreatingNewPersona` + db INSERT only without id; banner en UI |
| 2026-07-19 | 1 | **1.4** Toast unificado ≥3s | `showAppToast` / success·error·info·loading; alerts de mutación → toast |
| 2026-07-19 | 1 | **1.5** Contador = tarjetas visibles | `getFilteredPortfolioPersonas()`; meta de portafolio + empty clear |
|  | 2 |  |  |
|  | 3 |  |  |
|  | 4 |  |  |
