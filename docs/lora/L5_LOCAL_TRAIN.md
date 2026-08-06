# L5 — Train LoRA local (GPU propia, opt-in)

**Fase L / L5** del ROADMAP. Para quien ya tiene **GPU NVIDIA** + [ai-toolkit](https://github.com/ostris/ai-toolkit) (u otro trainer) instalado.

El Studio es un **orquestador**: materializa el pack L0 a disco y, si configurás un comando, lanza el proceso. **No** embebe el trainer ni lo pone en el path free.

Sin `ENABLE_LOCAL_LORA_TRAIN=1` el Studio se comporta igual: **Copiar JSON** + Colab L1 + Pollinations. L4 sigue siendo solo inferencia.

---

## Cuándo usar L5 vs L1 vs L3

| Camino | Costo | GPU | Ideal para |
|--------|-------|-----|------------|
| **L1 Colab** | Gratis (cuota Colab) | Cloud T4 | Emprendedor sin tarjeta local |
| **L5 local** | Tu electricidad / GPU | Local | Equipo con RTX ya montada |
| **L3 Replicate** | Pago | Cloud | Un clic, opt-in `ENABLE_PAID_LORA` |

Regla: si no tenés GPU local, **preferí L1**. L5 nunca reemplaza Copiar JSON.

---

## Requisitos

1. Opt-in en `.env`:

```bash
ENABLE_LOCAL_LORA_TRAIN=1

# Opción A — plantilla de comando (placeholders: {workDir} {config} {personaId} {trigger})
# LOCAL_LORA_TRAIN_CMD=python run.py {config}

# Opción B — directorio de ai-toolkit (cwd + `python run.py {config}`)
# AI_TOOLKIT_DIR=/path/to/ai-toolkit
# LOCAL_LORA_PYTHON=python   # opcional

# Tras éxito, mismos dirs que L2/L4 para que Comfy/A1111 vean los pesos:
# COMFYUI_LORAS_DIR=/path/to/ComfyUI/models/loras
# A1111_LORAS_DIR=/path/to/stable-diffusion-webui/models/Lora
```

2. Persona con **≥4 imágenes** coherentes en el vault (ancla + variantes). Ideal 15–30.

3. Si solo activás el flag **sin** `LOCAL_LORA_TRAIN_CMD` / `AI_TOOLKIT_DIR`, el endpoint **materializa** el pack (`status=dataset_ready`) y vos corrés el trainer a mano.

---

## Flujo

```
Pack L0 (mismo dataset que Colab)
  → POST /lora/train-local  (confirmLocal:true)
  → DATA_DIR/loras/<personaId>/train_jobs/<stamp>/
       dataset/ + config/ai-toolkit-flux.yaml (rutas absolutas)
  → spawn (si CMD/toolkit)  OR  materialize_only
  → POST /lora/sync-local
  → .safetensors → DATA_DIR/loras/<id>/ (+ copia a *_LORAS_DIR)
  → status=ready → gen vía hub L4 / Comfy
```

UI: panel **L5 · Train local** dentro de `#loraAdvancedPanel` (debajo de Copiar JSON).

---

## API

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/personas/:id/lora/train-local` | Body `{ confirmLocal: true, materializeOnly?: bool, triggerToken? }` |
| POST | `/api/personas/:id/lora/sync-local` | Poll proceso / buscar pesos / promover |
| GET | `/api/personas/:id/lora` | Incluye `localTrain: { available, canSpawn }` |

Estados `persona_loras`: `dataset_ready` → `training` → `ready` \| `failed`.

---

## Troubleshooting

| Síntoma | Qué mirar |
|---------|-----------|
| 400 «Train local desactivado» | `ENABLE_LOCAL_LORA_TRAIN=1` |
| 400 «confirmLocal» | Enviar `confirmLocal: true` |
| `materialize_only` siempre | Falta `AI_TOOLKIT_DIR` o `LOCAL_LORA_TRAIN_CMD` |
| `failed` sin pesos | Revisá `output/` del job; log_tail en `training_meta` |
| Gen sigue en Pollinations | Registrá/sync hasta `ready` + Comfy/A1111 healthy (L4) |

---

## Regresión P0

Con L5 off o fallando: crear → portafolio → **Copiar JSON** → Pollinations debe seguir igual. No exigir GPU ni trainer para el happy path free.
