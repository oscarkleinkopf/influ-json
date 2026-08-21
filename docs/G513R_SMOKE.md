# Pasada de uso real — ASUS G513R

Checklist corto para el **owner** en el notebook (Ollama / LM Studio / Locally Uncensored). Esta Cloud VM **no** es el G513R: no entrenes LoRA ni generes en Ragnarok desde un agente.

Base en `main`: squash [#144](https://github.com/oscarkleinkopf/influ-json/pull/144) (`ab78462`) encima de [#143](https://github.com/oscarkleinkopf/influ-json/pull/143). Detalle técnico: [L4_LOCAL_GPU.md](./lora/L4_LOCAL_GPU.md).

Anota fricciones. **No implementes** nada salvo P0: «guardé y no aparece» o Copiar JSON roto.

---

## 1. Sync y abrir Studio

```bash
git checkout main
git pull origin main
npm start
```

Abre `http://127.0.0.1:3000` e inicia sesión.

## 2. Camino A (default) — sin GPU

1. Portafolio: kicker **Camino A · default · sin GPU**; card **Dos caminos** con A activo.
2. Receta G513R, split LU y panel LoRA **no** se ven (solo en modo NVIDIA).
3. Crear o abrir una persona → **guardar** → debe aparecer en el portafolio.
4. **Copiar JSON** (pack **cuerpo entero** / fullbody) → pegar en ChatGPT / Gemini / Claude **gratis**.
5. No hace falta Pollinations ni NVIDIA.

## 3. Cambiar a GPU NVIDIA local

En **Dos caminos** elige **Camino B · GPU NVIDIA local**. Deben aparecer: receta G513R, cajas LU Positive/Negative, panel LoRA.

## 4. Receta G513R

**Copiar receta G513R**. En el texto pegado comprueba:

- línea `LoRA: <trigger> @ 0.8` (o el placeholder `ohwx_<slug>` si aún no hay trigger)
- carpeta `models/loras`

## 5. Locally Uncensored

- **Positive** y **Negative** son cajas distintas (botones Copiar negativo / positivo A–C). No pegues ambos en la misma.
- Checkpoint PPV: **Ragnarok** (`juggernautXL_ragnarok.safetensors`).
- **Lustify no es default** (solo NSFW opt-in).

## 6. Drop LoRA

1. Copia el `.safetensors` a `%USERPROFILE%\Documents\ComfyUI\models\loras`.
2. Ábrelo en el picker de LU (el nombre del archivo es el que lista).
3. Si el picker está vacío: **reinicia** LU o Comfy.

## 7. Volver a Camino A

Elige otra vez **Chatbots gratis**. Los extras NVIDIA se ocultan. Copiar JSON sigue siendo el producto.
