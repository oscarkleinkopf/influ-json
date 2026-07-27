---
name: influ-ugc-scriptwriter
description: >-
  Redacta guiones publicitarios de alta conversión (15s a 25s) para TikTok Ads, Reels y Shorts.
  Aplica fórmulas AIDA, PAS y Unboxing adaptando el tono de voz al MBTI del influencer virtual de influ-JSON.
---

# influ-JSON UGC Scriptwriter Skill

## Overview
Esta skill automatiza la creación de guiones de video corto (9:16) optimizados para pauta digital en TikTok Ads, Meta Reels y YouTube Shorts. Desglosa cada guión segundo a segundo en 3 columnas clave: **👁️ Visual/Encuadre del Avatar**, **🗣️ Voz en Off/Diálogo** y **📝 Subtítulos/Texto en Pantalla**.

## Utility Scripts

Utiliza la herramienta CLI en `.agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js`:

```bash
# Generar guión con fórmula AIDA (Atención - Interés - Deseo - Acción)
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id Diana --product "Glow Serum Organics" --benefit "Piel radiante en 5 minutos" --formula aida

# Generar guión con fórmula PAS (Problema - Agitación - Solución)
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id "Daniela 3" --product "Hydro Bottle" --benefit "Agua fría 24h" --formula pas

# Exportar guión directamente a archivo JSON
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id Diana --product "Glow Serum" --output ./guion_diana.json
```

## Workflow

### 1. Definición de Parámetros Comerciales
- Especificar el nombre del producto (`--product`), beneficio principal (`--benefit`) y audiencia objetivo (`--audience`).

### 2. Selección de Fórmula Publicitaria
- **AIDA**: Ideal para lanzamientos directos y conciencia de marca.
- **PAS**: Excelente para productos que resuelven una frustración directa del usuario.
- **UNBOXING**: Ideal para e-commerce, productos físicos y cosmética.

### 3. Personalización Psicológica (MBTI)
- La skill ajusta la energía y el lenguaje según la personalidad guardada del personaje en SQLite (ej: ENFP = entusiasta y cercano; INTJ = analítico y directo).

## Common Mistakes
1. **Guiones demasiado largos**: Mantener la duración entre 15 y 25 segundos para maximizar la retención de audiencia en TikTok Ads.
2. **Ignorar el Gancho Visual (0-3s)**: Asegurar que los primeros 3 segundos incluyan un texto de alto impacto en pantalla.
