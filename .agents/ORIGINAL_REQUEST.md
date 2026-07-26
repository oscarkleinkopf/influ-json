# Original User Request

## 2026-07-24T16:37:27Z

Implementar de forma completa la Fase 3 (Cola F3 y Manejo de Rate Limits), estabilizar el Flujo de Importación de Influencers (Fase 2) con variantes en segundo plano y pulir la Usabilidad e Interfaz general de la plataforma influ-JSON.

Working directory: c:\Users\oscar\.gemini\antigravity\scratch\influ-JSON
Integrity mode: development

## Requirements

### R1. Sistema de Cola Global F3 y Control de Rate Limit (HTTP 429)
- Conectar todas las solicitudes de generación de imagen (retrato, variante tradicional, variante spicy) a `gen-queue.js`.
- Ante un error HTTP 429 de Pollinations, activar el cooldown de 30 segundos (`RATE_LIMIT_COOLDOWN_MS`) en la cola y reintentar automáticamente la petición una vez concluido la espera.
- Exponer la ruta API `GET /api/queue-status` que retorne `genQueue.getStatus()`.
- En el frontend (`app.js`), polling a la API de cola para mostrar notificaciones dinámicas al usuario ("Encolado (Posición N)", "Servidor congestionado, enfriando X seg...").

### R2. Flujo de Importación de Influencer Completo (Fase 2)
- Soportar subida multi-imagen (hasta 4 fotos) con indicador visual "X/4 cargadas" en el modal de importación (`index.html` / `app.js`).
- Tras crear exitosamente la persona desde imágenes/URL, disparar una tarea en segundo plano que genere 4 variantes iniciales (2 tradicionales + 2 spicy).
- Garantizar que las variantes generadas se persistan en SQLite / `personas.json` y se rendericen en el vault sin recargar manualmente.

### R3. Usabilidad General y Resiliencia
- Validar el esquema JSON de la persona al crearse/importarse para evitar valores `undefined` o corrupciones.
- Mantener la coherencia facial y de personalidad (MBTI, tono de voz, señas particulares y tabúes de marca) en los prompts y en la exportación de packs para chatbots gratuitos.

## Acceptance Criteria

### Resiliencia de Generación (F3 Queue)
- [ ] Solicitudes múltiples simultáneas no generan fallos no controlados ni imágenes perdidas.
- [ ] El notificador de UI informa claramente el tiempo de espera (cooldown) y estado de cola en tiempo real.

### Importación y Variantes Automáticas
- [ ] Al importar una persona, el servidor responde rápido y las 4 variantes de inicio se generan progresivamente en segundo plano.
- [ ] Las variantes aparecen automáticamente en la interfaz del vault una vez listas.
