---
name: influ-json-studio
description: >-
  Estudio local de producción UGC con influencers virtuales: roster SQLite,
  character_lock JSON y packs gratis para chatbots (ChatGPT, Gemini, Claude, Meta).
  Use when the user asks to list/create/update influencers, manage the roster,
  export a free chatbot pack, get a persona's character_lock, run influ_cli
  status/list-personas/get-persona/export-pack, or keep visual identity consistent
  without paid face-lock. Expected output: CLI status/list, character_lock JSON,
  or a copy-ready pack (.txt block). Self-check: pack/lock includes must_match_every_image
  (name, skin_tone, eyes, hair) and is not an empty character_lock.
---

# influ-JSON Studio Skill

## Overview
Esta skill permite administrar la producción local de influencers virtuales en **influ-JSON**, garantizando cero costos recurrentes. Utiliza el esquema **`character_lock`** para preservar el ADN visual (tez, ojos, pelo, silueta) y psicológico (MBTI, tono de voz, tabúes) a través de múltiples imágenes y campañas sin requerir GPUs ni APIs de pago.

## Expected output
- Roster: salida de `status` / `list-personas` / `get-persona`.
- Free path: bloque `export-pack` (fullbody | bikini | spicy | product) con `character_lock` + instrucciones para chatbot gratis.

## Self-check
1. El artefacto menciona el nombre del influencer y campos fijos (`skin_tone` / ojos / pelo).
2. `character_lock` no está vacío (`must_match_every_image` presente).
3. No se exige Replicate ni GPU de pago para el path básico.

## Utility Scripts

Utiliza la herramienta CLI en `.agents/skills/influ-json-studio/scripts/influ_cli.js`:

```bash
# Consultar el estado del roster y base de datos
node .agents/skills/influ-json-studio/scripts/influ_cli.js status

# Listar influencers registrados
node .agents/skills/influ-json-studio/scripts/influ_cli.js list-personas

# Obtener JSON character_lock completo de una persona
node .agents/skills/influ-json-studio/scripts/influ_cli.js get-persona --id Daniela

# Exportar pack gratis para chatbot (cuerpo entero, bikini, spicy o producto)
node .agents/skills/influ-json-studio/scripts/influ_cli.js export-pack --id Daniela --type fullbody

# Emitir certificado de Licencia Comercial IP
node .agents/skills/influ-json-studio/scripts/influ_cli.js license --id Daniela
```

## Workflow

### 1. Creación o Inspiración de Influencer
- Definir datos físicos clave: `ethnicity`, `skin_tone`, `eye_color`, `hair_color`, `hair_texture`, `hair_length`.
- Asegurar que la tez (`skin_tone`) sea respetada en todas las variantes (evitar sesgos de sobre-bronceado).

### 2. Exportación de Packs Gratis para Chatbots (Cero Costo)
- Usar `export-pack` para obtener el bloque compilado de `character_lock`.
- Copiar y pegar el resultado en ChatGPT free, Gemini free o Claude.
- El chatbot generará imágenes respetando la misma cara y vestuario sin necesidad de APIs pagadas.

### 3. Generación Local & Cola Anti-429 (Pollinations)
- Las imágenes generadas localmente se procesan mediante `genQueue` (cola FIFO).
- Si Pollinations responde con HTTP 429, el servidor activa un cooldown automático de 30 segundos y reintenta la petición.

## Common Mistakes
1. **No especificar framing en cuerpo entero**: Cuando la pose sea `fullbody`, anteponer la instrucción de encuadre al inicio del prompt (`FULL BODY PHOTO, head-to-toe shot`).
2. **Ignorar el color de piel**: La propiedad `skin_tone` debe preservarse tanto en fotos de día/exterior como de interior para evitar desviaciones.
3. **Promover LoRA/GPU local sobre Copiar JSON**: L2–L4 (ComfyUI/A1111) son opt-in demoted. Path free = `character_lock` → chatbot. Guía hub: `docs/lora/L4_LOCAL_GPU.md`.
