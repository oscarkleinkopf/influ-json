# influ-JSON — Roadmap (cero costo primero)

## Filosofía de producto (no negociable)

**Público objetivo:** pequeños emprendedores que deben poder:

1. Crear y mantener un **roster de influencers virtuales**  
2. Generar UGC (imagen + guión + export)  
3. **Sin pagar APIs de imagen ni face-lock** hasta que la marca genere ingresos  

**Pilares free:**

| Pilar | Cómo |
|--------|------|
| Estudio local | Node + SQLite, sin suscripción |
| Generación imagen | **Pollinations** (gratis) + offline |
| Integridad de personaje | **JSON `character_lock`** copiable a chatbots gratis (ChatGPT / Gemini / Claude / Meta…) |
| Face-lock de pago (Replicate, etc.) | **Opcional y futuro** — se suma, **nunca sustituye ni rompe** el path free |

> Si una feature exige tarjeta de crédito para el caso básico, no es v1.

---

## Estado del núcleo (2026-07)

### Ya logrado (proteger)
- [x] Roster SQLite + create/import/save/archive (forceCreate 1.3)
- [x] UI refresh post-crear; contador = tarjetas visibles (1.5)
- [x] DB portable `data/influ.sqlite` (1.6)
- [x] Toasts unificados (1.4)
- [x] JSON con **cuerpo** + ficha “Cuerpo completo”
- [x] Skin lock (tez clara / hex; anti-sesgo Latina→morena)
- [x] Variantes traditional + spicy; bikini / playa
- [x] Identity prompt unificado; seed por persona
- [x] Full-body: no congelar close-up del retrato (text-first framing)
- [x] Aspect square para retratos (anti-alargamiento)
- [x] Export chatbot con **character_lock** free-tier
- [x] Abstracción `image-provider.js` (Pollinations default; Replicate hueco futuro)

### Límites honestos del free path (Pollinations)
- No hay embedding facial dedicado → spicy/cuerpo entero pueden **desviar cara** más que un InstantID  
- Rate limit 429 ocasional → reintentos + mensaje claro  
- JSON + chatbots gratis = **mejor ancla de identidad** multi-herramienta sin costo  

---

## Fase actual — Maximizar free (Pollinations + JSON)

**Meta:** sacar el máximo del path cero costo antes de tocar Replicate.

| # | Entregable | Criterio de hecho |
|---|------------|-------------------|
| F1 | `character_lock` en todo save/export | Copiar a ChatGPT free reproduce la misma persona en 3 prompts distintos |
| F2 | Documentar “flujo emprendedor gratis” en README corto | Un novato entiende: Studio + copiar JSON a chatbot |
| F3 | Variantes: rate-limit UX + cola simple (1 gen a la vez) | No spamear Pollinations; toast “espera 30s” |
| F4 | Side-by-side ancla vs última gen (gratis) | Usuario juzga consistencia sin API de scoring |
| F5 | Prompt packs free (chatbot): cuerpo entero / bikini / spicy / producto en mano | 4 plantillas que reusan `character_lock` ✅ |
| F6 | Happy path 60s en dashboard | Nuevo → guardar → 1 gen → copiar JSON |

**No hacer en esta fase:** multi-tenant, billing, OAuth, video full, requerir Gemini key.

---

## Fase siguiente — Replicate opcional (sin perder free)

**Principio:** feature flag. Default = Pollinations. Replicate solo si hay token **y** el usuario elige “mejor cara (pago)”.

| # | Entregable | Criterio de hecho |
|---|------------|-------------------|
| R0 | `IMAGE_PROVIDER=pollinations\|replicate` en `.env` | Sin token → siempre free |
| R1 | `image-provider.generateWithOptionalFaceLock` (PuLID/InstantID) | Con token: variantes pueden usar face-lock |
| R2 | UI toggle “Face-lock mejorado (pago)” off por defecto | Emprendedor free no ve costos sorpresa |
| R3 | Fallback automático a Pollinations si Replicate falla | Nunca pantalla rota |
| R4 | Métricas locales: free vs paid gens (contador SQLite) | Decidir cuándo conviene pagar |

**Regla de regresión:** todo test manual free (Daniela 3 body/skin/spicy) debe seguir pasando **con Replicate desactivado**.

---

## Semana 1 — Mecánica (cerrada en lo esencial)

| # | Tarea | Estado |
|---|--------|--------|
| 1.3 | forceCreate | ✅ |
| 1.4 | Toasts | ✅ |
| 1.5 | Contador filtrado | ✅ |
| 1.6 | DB portable | ✅ |
| 1.1 / 1.2 | QA matrix / import confirm | pendiente ligero |

---

## Semana 2+ — Loop UGC free + integridad

| # | Tarea | Estado |
|---|--------|--------|
| 2.3 | Estados 429 / offline | parcial ✅ |
| 2.4 | Side-by-side ancla | pendiente (F4) |
| 2.5–2.6 | Script + export pack | pendiente |
| JSON chatbot | character_lock | ✅ |
| Image provider stub | free-first | ✅ |

---

## Log de progreso

| Fecha | Hecho | Notas |
|-------|--------|-------|
| 2026-07-19 | 1.3–1.6, body JSON, skin lock, spicy, full-body framing | Ver commits main |
| 2026-07-20 | Filosofía cero costo; character_lock export; image-provider free-first | Replicate documentado, no implementado |
| 2026-07-20 | **F5** Packs gratis chatbot (fullbody / bikini / spicy / product) | UI en ficha + prompt console; `buildFreeChatbotPack` |

---

## Cómo usar el free path (emprendedor)

1. **Crear / importar** influencer en el Studio (local, gratis).  
2. Ajustar **tez, cuerpo, cara** en el formulario hasta que el JSON se vea bien.  
3. **Copiar export chatbot** (botón existente de pack/prompt) → pegar en ChatGPT / Gemini / Claude free.  
4. Pedir variantes: “misma persona, bikini en playa, cuerpo entero” — el modelo debe respetar `character_lock`.  
5. En Studio: generar con **Pollinations** para bocetos rápidos; aceptar límites de consistencia.  
6. Cuando la marca venda: activar **Replicate opcional** (Fase R) solo si hace falta cara perfecta.

---

## Parking lot (no ahora)

- Multi-tenant / OAuth / billing obligatorio  
- Face-lock de pago como default  
- Video pipeline completo  
- Refactor React solo por moda  

---

## Instrucciones para Grok / agentes

1. **Default = free.** No añadir dependencias de pago al happy path.  
2. Cualquier integración Replicate/Fal debe ser **opt-in** + fallback Pollinations.  
3. Mejorar siempre primero: JSON lock, prompts Pollinations, UX rate-limit, export chatbot.  
4. Leer este archivo al retomar.  
