# L2 — Inferencia LoRA con ComfyUI (opt-in)

**Fase L / L2** del ROADMAP. Tras entrenar en Colab (**L1**), registras el `.safetensors` en el Studio y, **si** tienes ComfyUI local, las gens de esa persona usan la LoRA.

Sin ComfyUI (o si falla) el Studio prueba L3 (Replicate, si `ENABLE_PAID_LORA=1`) y si no → **Pollinations**.

**Hub multi-backend (L4):** además de ComfyUI puedes usar Automatic1111/Forge. Ver **[L4_LOCAL_GPU.md](./L4_LOCAL_GPU.md)** (incluye companion opcional [Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored) como gestor de Comfy — el producto sigue siendo el JSON).

En Locally Uncensored el **Positive** y el **Negative** se pegan en cajas distintas. El Studio emite ambos por separado (botones «Copiar positivo / Copiar negativo» en modo GPU NVIDIA). No mezclarlos en un solo campo.

Notebook G513R (opt-in): checkpoints `Juggernaut-XL_v9`, `Realistic_Vision_V6.0_NV_B1_fp16`, `juggernautXL_ragnarok` (PPV default), `lustifyNSFWCheckpoint_zenithV9` (NSFW opt-in, nunca default). Texto local: Ollama / LM Studio.

---

## Requisitos

1. ComfyUI corriendo (GPU local), p.ej. `http://127.0.0.1:8188`
2. En `.env`:
   ```bash
   COMFYUI_URL=http://127.0.0.1:8188
   # Opcional: checkpoint por defecto del workflow SDXL
   # COMFYUI_CHECKPOINT=sd_xl_base_1.0.safetensors
   # Opcional: al registrar, copiar pesos aquí (models/loras de ComfyUI)
   # COMFYUI_LORAS_DIR=/path/to/ComfyUI/models/loras
   # Opcional: workflow custom (Flux, etc.) con placeholders
   # COMFYUI_WORKFLOW_JSON=./docs/lora/comfy_workflow_template.json
   ```
3. El archivo `.safetensors` **también** debe estar visible para ComfyUI como `lora_name` (carpeta `models/loras`). Usa `COMFYUI_LORAS_DIR` o cópialo a mano con el mismo nombre. Rutas exactas (Windows `%USERPROFILE%\Documents\ComfyUI\models\loras`, Linux `~/ComfyUI/models/loras`, A1111 `models/Lora`): **[L4 — Dónde poner el `.safetensors`](./L4_LOCAL_GPU.md#dónde-poner-el-safetensors-locally-uncensored)**. En G513R el character LoRA es **Kohya SDXL**; **Flux = Colab L1** (no Flux.2 en 8 GB).

---

## Flujo

1. Exporta pack L0 → entrena en Colab (L1) → descarga `.safetensors` + `trigger.txt`.
2. En la ficha del influencer → **Registrar LoRA** (sube el archivo + trigger).
3. Studio guarda en `DATA_DIR/loras/<personaId>/…` y marca `status=ready`.
4. Al generar variantes, `ai-service` intenta ComfyUI primero; si falla → Pollinations.

API:

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/personas/:id/lora` | Estado + ping ComfyUI |
| POST | `/api/personas/:id/lora` | multipart `weights` + `triggerToken` |
| DELETE | `/api/personas/:id/lora` | Quitar LoRA |

---

## Workflow por defecto

El cliente (`comfyui-client.js`) envía un grafo **SDXL/SD1.5** clásico (`CheckpointLoaderSimple` + `LoraLoader` + `KSampler`).

Si entrenaste **Flux** en L1, usa la plantilla del repo:

```bash
COMFYUI_WORKFLOW_JSON=./docs/lora/comfy_workflow_flux_lora.json
COMFYUI_CHECKPOINT=flux1-dev.safetensors
```

Guía: [L4C_FLUX_WORKFLOW.md](./L4C_FLUX_WORKFLOW.md). Placeholders soportados:

`{{PROMPT}}` `{{NEGATIVE}}` `{{LORA}}` `{{LORA_STRENGTH}}` `{{SEED}}` `{{WIDTH}}` `{{HEIGHT}}` `{{CHECKPOINT}}`

---

## Regresión P0

Con LoRA desactivada / sin `COMFYUI_URL`, todo el path free (JSON + Pollinations) debe comportarse igual. No hace falta GPU para usar el Studio.
