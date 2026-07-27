---
name: influ-license-certifier
description: >-
  Emite y verifica Certificados de Licencia Comercial de Propiedad Intelectual (IP) B2B
  para influencers virtuales sintéticos de influ-JSON. Genera certificados en JSON y HTML imprimible con hash SHA-256.
---

# influ-JSON License Certifier Skill

## Overview
Esta skill automatiza la emisión de licencias comerciales B2B para alquilar la imagen de influencers virtuales sintéticos a clientes, agencias o marcas de e-commerce. Genera documentos con respaldo de firma digital hash SHA-256 y cláusula de garantía de IA sintética (libre de derechos de imagen de seres humanos reales).

## Utility Scripts

Utiliza la herramienta CLI en `.agents/skills/influ-license-certifier/scripts/certifier_cli.js`:

```bash
# Emitir licencia en JSON
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id Diana --client "Glow Skincare LLC" --scope "Meta & TikTok Ads" --duration "1 Year"

# Emitir certificado HTML visual imprimible
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id "Daniela 3" --client "Brand Co" --output ./licencia_daniela.html

# Verificar autenticidad de una licencia
node .agents/skills/influ-license-certifier/scripts/certifier_cli.js verify --licenseId LIC-INFLU-363384E0-LX89Z
```

## Workflow

### 1. Ingesta de Datos del Cliente B2B
- Requerir el nombre comercial de la marca/cliente (`--client`), alcance publicitario (`--scope`) y tiempo de vigencia (`--duration`).

### 2. Generación del Hash de Autenticidad SHA-256
- La CLI genera una firma única basada en `licenseId:personaId:clientName:scope:issuedAt`.

### 3. Emisión del Certificado Visual u Homologación JSON
- Si se pasa `--output archivo.html`, compila un documento HTML visual elegante con bordes y tipografía ejecutiva listo para guardar en PDF o imprimir.

## Common Mistakes
1. **Omitir el nombre del cliente**: Especificar siempre `--client "Nombre de la Empresa"` para personalizar las cláusulas legales de la licencia.
2. **Ignorar el formato de salida**: Si deseas una versión visual para enviar al cliente por correo, especifica la extensión `.html` en `--output`.
