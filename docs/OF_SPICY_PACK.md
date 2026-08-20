# OF / Spicy pack — brief para Cursor (2026-08-20)

> Pedido del owner: armar el pack explícito / PPV y dejarlo escrito en el repo para continuar en Cursor, sin gastar tokens de chat.
> Invariante: **no romper el free path**. El pack spicy ya existe; esto lo extiende. Lo NSFW es opt-in por persona/nicho, no default del Studio.

Relacionado: `chatbot-packs.js`, `variant-presets.js`, `qa-matrix.js`, `lora-pack.js`, `production-recipe.js`, `character-lock-validator.js`, `docs/lora/`.

---

## Objetivo

Permitir que un emprendedor arme **personajes consistentes** para cuentas tipo OnlyFans / PPV usando el mismo `character_lock`, más:

1. Pack **explicit / PPV** (además de spicy).
2. Receta **Juggernaut XL Ragnarok + LoRA** (GPU local / ComfyUI).
3. **Trigger token** fijo por persona para LoRA.
4. QA spicy: cara / tez / pelo **y** body / anatomía.
5. Export de **captions NSFW** listos para el dataset LoRA (L0).

---

## OF-1 — Pack `explicit` (chatbot + export ZIP)

**Archivos:** `chatbot-packs.js`, UI Packs ▾, export ZIP, tests `test/pack-library.test.js` (o nuevo `test/of-explicit-pack.test.js`).

### Comportamiento

- Nuevo tipo de pack: `explicit` (clave estable, no traducir en código).
- Label UI: **PPV / explícito** (tuteo ES).
- Reusa `normalizePersonaForPack` + el mismo `character_lock`. **Nunca** renegociar cara.
- El pack debe incluir:
  - bloque CHARACTER LOCK intacto
  - `must_match_every_image`
  - REALISMO + NEGATIVE PROMPT (ya usados en spicy)
  - framing text-first (cuerpo entero, no congelar close-up del retrato)
  - 3 prompts listos: (A) semi / lingerie, (B) nude fullbody, (C) close-up PPV
- No exigir Pollinations ni Gemini.
- Copiar nunca se bloquea si el lock está débil (igual que spicy).

### Prompt plano de referencia (Juggernaut XL Ragnarok)

El pack debe poder emitir también una versión **plana** (sin JSON) para Comfy/A1111/**Locally Uncensored**:

**Locally Uncensored:** Positive y Negative se ingresan en **cajas distintas**. El Studio copia cada campo por separado (nunca un solo bloque mezclado). Checkpoint se elige en el selector de LU, no dentro del prompt.

**Positive (plantilla — caja Positive):**
```
photorealistic, masterpiece, best quality, ultra detailed, 8k,
{identity from character_lock as comma-separated traits},
{pose/scene from variant},
detailed skin texture, natural pores, realistic lighting
```

**Negative (plantilla — caja Negative, la misma para A/B/C):**
```
ugly, deformed, extra limbs, extra fingers, mutated hands, bad anatomy,
blurry, low quality, worst quality, cartoon, anime, text, watermark,
wrong face, different person, age change, skin tone change, hair color change
```

No hardcodear una persona de ejemplo como default de producto (evitar Sofia / Glow Serum).

---

## OF-2 — Receta de producción «Juggernaut Ragnarok + LoRA»

**Archivos:** `production-recipe.js`, `docs/lora/L2_COMFYUI.md` (párrafo), UI recetas.

### Receta (texto que Cursor debe persistir)

```
1. Lock sólido en Studio (tez hex, ojos, pelo, silueta, marcas).
2. Generar / curar 15–30 variantes (retrato, cuerpo, spicy/explicit).
3. Export Pack LoRA (L0) + captions.
4. Entrenar LoRA (Colab L1 o L5 local) con trigger token de la persona.
5. Inferencia: Juggernaut XL Ragnarok + LoRA + character_lock reducido.
6. ComfyUI (L4) si PREFER_LOCAL_GPU=1; si no, fallback Pollinations / copy JSON.
```

Settings sugeridos (documentar, no imponer en UI):

| Campo | Valor orientativo |
|-------|-------------------|
| Checkpoint | Juggernaut XL Ragnarok |
| LoRA strength | 0.7–0.9 |
| Sampler | típico SDXL del user |
| ControlNet | OpenPose / Depth opcional |
| Face | LoRA > IP-Adapter; InstantID solo opt-in pago |

---

## OF-3 — Trigger token por persona

**Archivos:** schema `influ-persona` / `persona_loras` / ficha Identidad o panel LoRA.

- Campo `lora_trigger` (string corto, ej. `ohwx colorina`).
- Si vacío: derivar de slug del nombre (`ohwx_<slug>`), nunca de PII extra.
- Incluir el token en:
  - captions del pack L0
  - pack `explicit` plano
  - receta Juggernaut
- No romper personas existentes (default derivado al exportar).

---

## OF-4 — QA matrix spicy / explicit

**Archivos:** `qa-matrix.js`, UI Variaciones.

Checklist adicional (manual, sin API de scoring):

- [ ] Misma cara que el ancla
- [ ] Misma tez / hex
- [ ] Mismo pelo
- [ ] Misma silueta / body type
- [ ] Anatomía coherente (no extra limbs; spicy no cambia identidad)

dHash existente sigue siendo señal grosera (no face-lock). Tooltip honesto.

---

## OF-5 — Captions NSFW en export LoRA (L0)

**Archivos:** `lora-pack.js`.

- Opción en el ZIP: `captions/explicit/` además de las captions generalistas.
- Cada caption: `trigger, character_lock traits, scene/pose, nsfw tags de la variante`.
- Flag o checkbox **Incluir captions explícitos** (off por defecto) para no ensuciar datasets SFW.
- Free path: el ZIP sigue saliendo sin GPU y sin token.

---

## Criterios de hecho

- [x] Pack `explicit` aparece en Packs ▾ y en ZIP de persona.
- [x] El texto copiado contiene `character_lock` + 3 prompts PPV.
- [x] Receta Juggernaut / G513R visible en modo GPU NVIDIA.
- [x] `lora_trigger` se exporta en L0.
- [x] QA spicy muestra los 5 checks.
- [x] `npm test` verde + test nuevo del pack.
- [x] Free path: crear → guardar → Copiar JSON (fullbody) intacto.
- [x] Sin keys de pago, sin InstantID obligatorio.
- [x] Modo dual: chatbots (default, sin GPU) vs NVIDIA local (G513R).
- [x] Locally Uncensored: Positive y Negative en cajas / copias separadas.

## Qué no hacer

- No hacer OnlyFans el default del producto (es un pack/nicho).
- No subir datasets NSFW al repo.
- No romper presets Beauty / Fitness / Moda.
- No exigir Juggernaut instalado para usar el Studio.

## Orden de implementación sugerido

```
OF-1 pack + test → OF-3 trigger → OF-5 captions → OF-4 QA → OF-2 receta UI
```

Rama sugerida: `cursor/of-explicit-pack-20aug`
