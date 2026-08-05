# L3 — Trainer / inferencia LoRA de pago (Replicate, opt-in)

**Fase L / L3** del ROADMAP. Atajo de pago para quien no quiere Colab (L1) ni GPU local (L2).

**Nunca** es el path por defecto. Sin estas variables, el Studio se comporta igual (JSON + Pollinations + Colab).

---

## Activación (explícita)

En `.env`:

```bash
ENABLE_PAID_LORA=1
REPLICATE_API_TOKEN=r8_...
REPLICATE_USERNAME=tu_usuario_replicate
# Opcional — trainer (owner/name:versionHash)
# REPLICATE_LORA_TRAINER=ostris/flux-dev-lora-trainer:d995297071a44dcb72244e6c19462111649ec86a9646c32df56daa7f14801944
```

`ENABLE_PAID_LORA` es obligatorio aunque ya tengas token (evita activar pago “de casualidad”).

---

## Flujo “un clic” en el Studio

1. Genera ≥4–8 variantes coherentes del influencer (mejor 15–30).
2. Ficha → **Entrenar en Replicate (pago)** → confirma el diálogo.
3. El Studio:
   - arma el dataset (mismo pack L0),
   - lo sube a Replicate Files,
   - crea/usa un modelo destino privado,
   - lanza el training → `persona_loras.status=training`.
4. Cuando termine en Replicate → **Sincronizar estado** → `status=ready` + `replicate_model_version` en meta.
5. Las gens de esa persona intentan: ComfyUI (si hay pesos locales) → Replicate LoRA → Pollinations.

También puedes entrenar en la web de Replicate y **Vincular** `owner/model:version` a mano.

API:

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/personas/:id/lora/train` | `{ confirmPaid: true }` |
| POST | `/api/personas/:id/lora/sync` | poll training **o** `{ replicateModelVersion }` |

---

## Costos y alternativas free

| Path | Costo |
|------|--------|
| L0 export + L1 Colab | Gratis (GPU Colab) |
| L2 ComfyUI | Self-host GPU |
| L3 Replicate | Pago (train + cada imagen) |

Si el trainer pago falla o no está configurado → **fallback a Pollinations**. El JSON/`character_lock` nunca depende de Replicate.

---

## fal.ai / otros

El punto de extensión es `paid-lora.js`. fal u otros hosts pueden añadirse detrás del mismo flag sin tocar el free path. Hoy el cliente implementado es **Replicate**.
