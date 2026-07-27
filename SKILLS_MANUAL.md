# 📚 Manual de Uso — Skills Oficiales de influ-JSON

Este manual documenta el uso práctico de las **Skills de Agente AI** integradas en el proyecto **influ-JSON**. Estas skills permiten interactuar con el estudio de producción de influencers virtuales tanto de forma conversacional con el agente de IA como a través de la terminal mediante scripts CLI.

---

## 📂 Ubicación de las Skills en el Proyecto

Todas las skills se encuentran instaladas localmente en el repositorio y sincronizadas con GitHub:
- `.agents/skills/influ-json-studio/`
- `.agents/skills/influ-license-certifier/`
- `.agents/skills/influ-ugc-scriptwriter/`

---

## 1. 🤖 Skill `influ-json-studio`

### ¿Qué hace?
Administra la producción local de influencers virtuales, la garantía de consistencia visual vía `character_lock` en JSON y la exportación de packs de prompts listos para usar en chatbots gratuitos (ChatGPT, Gemini, Claude, Meta AI) a costo cero.

### Comandos de Terminal (CLI):
```bash
# 1. Consultar el estado general del roster y base de datos SQLite
node .agents/skills/influ-json-studio/scripts/influ_cli.js status

# 2. Listar todos los influencers virtuales registrados
node .agents/skills/influ-json-studio/scripts/influ_cli.js list-personas

# 3. Obtener el JSON character_lock completo de una persona (por ID o Nombre)
node .agents/skills/influ-json-studio/scripts/influ_cli.js get-persona --id Diana

# 4. Exportar un pack gratis para chatbot (fullbody | bikini | spicy | product)
node .agents/skills/influ-json-studio/scripts/influ_cli.js export-pack --id Diana --type fullbody

# 5. Guardar el pack directamente en un archivo de texto
node .agents/skills/influ-json-studio/scripts/influ_cli.js export-pack --id "Daniela 3" --type bikini --output ./pack_bikini.txt
```

---

## 2. 📜 Skill `influ-license-certifier`

### ¿Qué hace?
Emite y verifica **Certificados de Licencia Comercial de Propiedad Intelectual (IP) B2B** para clientes o marcas que alquilan influencers virtuales. Garantiza que el personaje es 100% sintético e incluye firma digital con hash SHA-256.

### Comandos de Terminal (CLI):
```bash
# 1. Emitir certificado en formato JSON para integraciones API
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id Diana --client "Glow Skincare LLC" --scope "Meta & TikTok Ads" --duration "1 Year"

# 2. Emitir certificado HTML visual imprimible listo para enviar al cliente
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id Diana --client "Glow Skincare LLC" --output ./licencia_diana.html

# 3. Verificar la validez de un certificado por ID de Licencia
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js verify --licenseId LIC-INFLU-47FA915D-MS3B9ZSN
```

---

## 3. 🎬 Skill `influ-ugc-scriptwriter`

### ¿Qué hace?
Redacta guiones publicitarios de alta conversión (15s a 25s) para TikTok Ads, Meta Reels y YouTube Shorts. Desglosa cada guión segundo a segundo en 3 columnas: **Visual/Encuadre**, **Voz en Off/Diálogo Hablado** y **Subtítulos/Texto en Pantalla**, adaptando el lenguaje al arquetipo MBTI del influencer.

### Comandos de Terminal (CLI):
```bash
# 1. Generar guión con fórmula AIDA (Atención - Interés - Deseo - Acción)
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id Diana --product "Glow Serum Organics" --benefit "Piel radiante en 5 minutos" --formula aida

# 2. Generar guión con fórmula PAS (Problema - Agitación - Solución)
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id "Daniela 3" --product "Hydro Bottle" --benefit "Agua fría por 24h" --formula pas

# 3. Generar guión con fórmula Unboxing / Testimonial Directo
node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id Diana --product "Headphones Pro" --formula unboxing --output ./guion_headphones.json
```

---

## 💡 Cómo pedirle al Agente de IA que use estas Skills en el Chat

Puedes pedirle tareas al agente en lenguaje natural y utilizará automáticamente estas skills:

- *"Exporta el pack de cuerpo entero para Diana para usar en ChatGPT free."*
- *"Emite un certificado de licencia comercial para Daniela 3 para la empresa Glow Skincare LLC."*
- *"Escribe un guión publicitario de TikTok Ads con fórmula PAS para Diana promocionando un Serum Facial."*
