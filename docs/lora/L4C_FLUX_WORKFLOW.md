# L4c — Plantilla Flux + LoRA para ComfyUI

Tras entrenar en Colab (**L1**, Flux), el workflow SDXL por defecto de L2 **no** aplica bien la LoRA Flux.

Usa la plantilla API-format del repo:

```bash
# .env
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=flux1-dev.safetensors
COMFYUI_WORKFLOW_JSON=./docs/lora/comfy_workflow_flux_lora.json
```

Archivo: [`comfy_workflow_flux_lora.json`](./comfy_workflow_flux_lora.json)

## Placeholders

| Token | Uso |
|-------|-----|
| `{{PROMPT}}` | Prompt + trigger |
| `{{LORA}}` | Nombre en `models/loras` |
| `{{LORA_STRENGTH}}` | Fuerza (default 0.85) |
| `{{SEED}}` | Semilla |
| `{{WIDTH}}` / `{{HEIGHT}}` | Latent |
| `{{CHECKPOINT}}` | UNET Flux (`COMFYUI_CHECKPOINT`) |
| `{{NEGATIVE}}` | Reservado (Flux suele ignorar negative clásico) |

## Requisitos en ComfyUI

- Modelos Flux: UNET `flux1-dev.safetensors` (o variante), VAE `ae.safetensors`, DualCLIP `clip_l` + `t5xxl_…`
- Nodos: `UNETLoader`, `DualCLIPLoader`, `LoraLoaderModelOnly`, `SamplerCustomAdvanced`, etc. (ComfyUI reciente)
- LoRA `.safetensors` visible en `models/loras` (o `COMFYUI_LORAS_DIR`)

Si tu grafo Flux difiere, exporta tu workflow a **API format** desde ComfyUI y sustituye textos por los mismos `{{…}}`.

Ver también: [L2_COMFYUI.md](./L2_COMFYUI.md) · [L4_LOCAL_GPU.md](./L4_LOCAL_GPU.md)
