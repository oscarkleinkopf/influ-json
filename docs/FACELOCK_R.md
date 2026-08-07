# Fase R — Face-lock de pago (Replicate InstantID / PuLID)

**R0–R4** del [ROADMAP.md](../ROADMAP.md). Mejora opcional de consistencia facial **sin romper** el path free (JSON + Pollinations).

---

## Activación (explícita)

En `.env`:

```bash
ENABLE_PAID_FACE_LOCK=1
REPLICATE_API_TOKEN=r8_...
# Opcional — modelo InstantID / PuLID (default = bytedance/pulid:…)
# REPLICATE_FACE_MODEL=bytedance/pulid:c169c3b8f6952cf895d043d7b56830b4e9a3e9409a026004e9efbd9da42912b4
```

Alternativa R0 (compat):

```bash
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_...
```

`ENABLE_PAID_FACE_LOCK` (o `IMAGE_PROVIDER=replicate`) es **obligatorio** aunque ya tengas token — evita activar pago de casualidad (mismo patrón que L3).

Sin flag + token → `isPaidFaceLockEnabled() === false` y el Studio se comporta igual.

---

## Flujo en el Studio (R2)

1. Configura el flag + token (Ajustes puede guardar el token Replicate).
2. En **Variantes**, aparece el checkbox demoted **“Face-lock mejorado (pago · Replicate)”** — **off** por defecto.
3. Márcalo solo cuando quieras pagar por esa generación.
4. Si Replicate falla / timeout / sin cara ancla → **fallback automático a Pollinations** (R3). Nunca pantalla rota.

API:

| Campo | Dónde | Efecto |
|-------|--------|--------|
| `preferFaceLock: true` | `POST /api/personas/:id/variants` o `POST /api/ai/generate-image` | Intenta InstantID/PuLID |
| (omitido / false) | mismo | Solo path free / LoRA local / Pollinations |

---

## Modelos

| Modelo | Schema | Notas |
|--------|--------|--------|
| `bytedance/pulid:…` (default) | `main_face_image` | Buena fidelidad ID |
| `zedge/instantid:…` | `input_image` | InstantID |
| otros InstantID | `image` | Detectado por nombre |

Cambia con `REPLICATE_FACE_MODEL=owner/name:versionHash`.

---

## Métricas (R4)

Las gens exitosas con face-lock se guardan como `provider=replicate` en `gen_metrics` (prefijo de archivo `gen_facelock_*`). En Ajustes (admin) verás `free X / pago-u-otro Y`.

---

## Regla de regresión

Con face-lock **desactivado** (sin flag, o toggle off):

- Crear / importar → portafolio → Copiar JSON → chatbot free ✅
- Generar boceto Pollinations (con token) ✅
- Tests manuales Daniela body/skin/spicy ✅

El JSON `character_lock` **nunca** depende de Replicate.
