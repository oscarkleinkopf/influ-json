# L1 — Entrenar LoRA gratis en Google Colab

**Fase L / L1** del ROADMAP. Consume el **pack L0** que exporta el Studio  
(`🧬 Exportar pack de entrenamiento LoRA (.zip)`).

Cero costo de producto: no hay API de pago. Solo necesitas:
- el `.zip` del Studio (dataset + captions + config),
- una cuenta Google (Colab free, GPU T4),
- opcional: token Hugging Face si usas **FLUX.1-dev** (licencia).

El resto de influ-JSON (JSON + chatbots gratis + Pollinations) **no depende** de esto.

---

## Flujo rápido (5 minutos de setup)

1. En el Studio: selecciona un influencer con **≥ 8–15 variantes** coherentes →  
   **🧬 Exportar pack de entrenamiento LoRA (.zip)**.
2. Abre el notebook:  
   [`influ_json_lora_train.ipynb`](./influ_json_lora_train.ipynb)  
   → en Colab: *File → Upload notebook* (o súbelo a Drive y ábrelo).
3. Runtime → **Change runtime type** → GPU (**T4**).
4. Ejecuta las celdas en orden (instalar → subir ZIP → entrenar → descargar `.safetensors`).
5. Guarda el `.safetensors` (y el `trigger.txt`) para L2 (ComfyUI) o un host opt-in (L3).

---

## Qué trae el pack L0

| Ruta | Uso |
|------|-----|
| `dataset/img_XX.jpg` + `img_XX.txt` | Imágenes + captions (convención kohya / ai-toolkit) |
| `config/ai-toolkit-flux.yaml` | Config de entrenamiento Flux LoRA |
| `trigger.txt` | Token a usar en prompts (`ohwx_…`) |
| `character_lock.json` | Referencia de identidad (no se usa al entrenar) |
| `README.txt` | Resumen embebido |

Captions: el **trigger + clase** (`ohwx_… woman`) capturan la cara; el resto del texto solo describe pose/ropa/fondo.

---

## Modelos base

| Modelo | Notas |
|--------|--------|
| `black-forest-labs/FLUX.1-dev` | Mejor calidad. Requiere aceptar licencia en HF + `HF_TOKEN`. |
| `black-forest-labs/FLUX.1-schnell` | Más libre / rápido. Cambia `name_or_path` en el YAML (el notebook tiene un toggle). |

En Colab free (T4) el YAML del pack ya usa `quantize: true` + `adamw8bit` + `gradient_checkpointing`.

---

## Después del entrenamiento (L2 / L3)

- **L2:** ver [L2_COMFYUI.md](./L2_COMFYUI.md) — registrar `.safetensors` en el Studio + `COMFYUI_URL`.  
  Fallback del Studio = Pollinations + `character_lock` si no hay LoRA.
- **L3:** subir pesos a Replicate/fal detrás de un flag opt-in (nunca rompe free).

---

## Consejos

- Ideal **15–30** fotos coherentes (frontal, 3/4, cuerpo, luces distintas).
- Borra del dataset las variantes donde la cara/tez se desviaron (antes o después de descomprimir).
- Si Colab se desconecta, vuelve a subir el ZIP y reanuda; guarda checkpoints (`save_every` en el YAML).
- No metas el `.safetensors` en git (pesado). Guárdalo en Drive / local.

---

## Referencias

- Pack L0: `lora-pack.js` · endpoint `GET /api/export/persona/:id/lora`
- Trainer: [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit)
- Plan: [ROADMAP.md — Fase L](../../ROADMAP.md)
