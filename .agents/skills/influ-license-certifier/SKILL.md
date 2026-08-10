---
name: influ-license-certifier
description: >-
  Emite y verifica Certificados de Licencia Comercial de Propiedad Intelectual (IP)
  B2B para influencers virtuales sintéticos de influ-JSON (JSON y HTML imprimible,
  hash SHA-256). Use when the user asks to issue, generate, or verify a commercial
  IP license/certificate for a virtual influencer, rent image rights to a brand/agency,
  produce printable HTML license docs, or run certifier_cli issue/verify. Expected
  output: license JSON and/or printable HTML with licenseId + SHA-256 authenticity
  hash. Self-check: certificate names the client (--client), includes scope/duration,
  and verify succeeds for the issued licenseId.
---

# influ-JSON License Certifier Skill

## Overview
Esta skill automatiza la emisión de licencias comerciales B2B para alquilar la imagen de influencers virtuales sintéticos a clientes, agencias o marcas de e-commerce. Genera documentos con respaldo de firma digital hash SHA-256 y cláusula de garantía de IA sintética (libre de derechos de imagen de seres humanos reales).

## Expected output
- JSON de licencia con `licenseId`, cliente, alcance, vigencia y hash SHA-256.
- Opcional: HTML imprimible (`--output *.html`) listo para PDF/correo al cliente.

## Self-check
1. El certificado incluye `--client` (nombre comercial) y no es genérico sin titular.
2. Existe `licenseId` y un hash de autenticidad.
3. `certifier_cli.js verify --licenseId …` confirma el documento emitido.

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
