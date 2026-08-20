# L4 — Hub de inferencia local (ComfyUI + A1111/Forge)

**Fase L / L4** del ROADMAP. Para equipos con **GPU NVIDIA** (u otra) y un backend self-host.

El Studio puede generar bocetos / LoRA **en local** vía:

| Backend | URL típica | API |
|---------|------------|-----|
| **ComfyUI** | `http://127.0.0.1:8188` | `/prompt` + `/history` + `/view` (L2) |
| **Automatic1111 / Forge** | `http://127.0.0.1:7860` | `/sdapi/v1/txt2img` |

**No** orquesta entrenamiento en la tarjeta L4 (sigue **L1 Colab**, **L5 local** opt-in o **L3** pago). Solo inferencia.

Ver también: [L5_LOCAL_TRAIN.md](./L5_LOCAL_TRAIN.md).

Sin estas URLs el Studio se comporta igual: **Copiar JSON** + Pollinations. Fallos de GPU → fallback automático.

---

## Companion: Locally Uncensored (opcional)

Si ya tienes GPU y quieres **gestionar ComfyUI** (modelos, LoRA picker, vídeo local) sin pelearte con el grafo de nodos, [Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored) es un instalador de escritorio que suele levantar Comfy en el puerto típico (`8188`).

**No se integra en el Studio.** No sustituye `character_lock` ni Copiar JSON. Flujo:

1. Instala/arranca LU (o ComfyUI a pelo).
2. En `.env` del Studio: `COMFYUI_URL=http://127.0.0.1:8188` (u otra URL si LU usa otro puerto).
3. Exporta pack L0 / registra `.safetensors` en la ficha → L4 usa ese Comfy.
4. Si Comfy está caído, las gens caen a Pollinations. El producto sigue siendo el JSON.

AGPL-3.0: no copies código de LU aquí. Solo apunta el hub al mismo Comfy.

---

## Requisitos

1. GPU local con ComfyUI y/o A1111/Forge corriendo.
2. En `.env` (opt-in):

```bash
# Al menos una:
COMFYUI_URL=http://127.0.0.1:8188
# A1111_URL=http://127.0.0.1:7860
# FORGE_URL=http://127.0.0.1:7860   # alias de A1111_URL

# Política de selección
# LOCAL_GPU_BACKEND=auto            # auto | comfyui | a1111
# PREFER_LOCAL_GPU=1                # usar hub también SIN LoRA (bocetos locales)

# Al registrar .safetensors, copiar a models/loras del backend:
# COMFYUI_LORAS_DIR=/path/to/ComfyUI/models/loras
# A1111_LORAS_DIR=/path/to/stable-diffusion-webui/models/Lora
```

3. Para LoRA: el `.safetensors` debe ser visible al backend (`lora_name` / carpeta Lora). Usa `*_LORAS_DIR` o cópialo a mano.

---

## Flujo

```
Pack L0 → Colab L1 → .safetensors
       → Registrar LoRA en ficha (panel Avanzado)
       → Hub L4 elige ComfyUI o A1111 (healthy)
       → Gen variante usa LoRA local
       → Si falla → L3 (si ENABLE_PAID_LORA) → Pollinations
```

Con `PREFER_LOCAL_GPU=1`, las gens **sin** LoRA también intentan el hub antes de Pollinations.

---

## Notebook ASUS G513R (opt-in)

Stack local del owner: **Ollama** + **LM Studio** (texto uncensored) y **Locally Uncensored** / Comfy (imagen). El Studio no exige esta máquina: el default sigue siendo **Copiar JSON**.

En el Portafolio elige **Modo de trabajo → GPU NVIDIA local**. Sin NVIDIA, deja **Chatbots gratis**.

### Locally Uncensored: Positive y Negative separados

LU tiene **dos cajas**. No pegues el pack entero en una sola:

1. Selector de checkpoint (no va dentro del prompt).
2. **Negative** ← botón «Copiar negativo» (el mismo para shots A/B/C).
3. **Positive** ← «Copiar positivo A / B / C».

El pack `explicit` también marca los bloques con `<<<LU_NEGATIVE` / `<<<LU_POSITIVE_A` para copiar a mano.

### Checkpoints en el disco de LU

| Archivo | Uso |
|---------|-----|
| `Juggernaut-XL_v9.safetensors` | SFW / body / beauty |
| `Realistic_Vision_V6.0_NV_B1_fp16.safetensors` | SD1.5, VRAM justa |
| `juggernautXL_ragnarok.safetensors` | Default PPV / explícito + LoRA |
| `lustifyNSFWCheckpoint_zenithV9.safetensors` | NSFW opt-in, **nunca** default |

En `.env`: `COMFYUI_CHECKPOINT=juggernautXL_ragnarok.safetensors` si quieres que el hub L4 use Ragnarok (solo con modo NVIDIA / PREFER_LOCAL_GPU).

---

## API

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/local-gpu/status` | Ping Comfy + A1111, backend activo, flags |
| GET/POST/DELETE | `/api/personas/:id/lora` | Igual que L2; copia también a `A1111_LORAS_DIR` |

UI: panel **GPU local (L4)** dentro de `#loraAdvancedPanel` (demoted, debajo de Copiar JSON).

---

## Selección de backend

1. `LOCAL_GPU_BACKEND=comfyui` → solo ComfyUI.
2. `LOCAL_GPU_BACKEND=a1111` → solo A1111/Forge.
3. `auto` (default): primer **healthy** en orden ComfyUI → A1111.

LoRA en A1111: el hub añade `<lora:nombre:strength>` al prompt.

**Flux:** si entrenaste en Colab L1 (Flux), apunta `COMFYUI_WORKFLOW_JSON` a [`comfy_workflow_flux_lora.json`](./comfy_workflow_flux_lora.json) — ver [L4C_FLUX_WORKFLOW.md](./L4C_FLUX_WORKFLOW.md).

---

## Troubleshooting

| Síntoma | Qué revisar |
|---------|-------------|
| Chips offline | Backend no escucha; firewall; URL mal escrita |
| LoRA no aplica | Nombre del archivo ≠ `lora_name`; falta en `models/loras` |
| Gen cae a Pollinations | Normal si hub falla — path free intacto |
| VRAM OOM | Baja resolución / cierra otros jobs en Comfy/A1111 |
| Forge vs A1111 | Misma API; usa `A1111_URL` o `FORGE_URL` |

CORS no aplica: el Studio llama al backend desde **Node** (server-side), no desde el navegador.

---

## Regresión P0

Sin `COMFYUI_URL` / `A1111_URL` / `PREFER_LOCAL_GPU`, el path free (JSON + Pollinations) debe comportarse igual. No hace falta GPU para usar el Studio.

Ver también: [L2_COMFYUI.md](./L2_COMFYUI.md) · [L1_COLAB.md](./L1_COLAB.md) · [L3_PAID.md](./L3_PAID.md)
