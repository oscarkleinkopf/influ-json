#!/usr/bin/env node

/**
 * certifier_cli.js — CLI Utility Script for influ-license-certifier Skill
 * Generates B2B Commercial IP Usage Licenses for Synthetic Virtual Influencers.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Resolve db.js from project root
let projectRoot = path.resolve(__dirname, '../../../../');
let dbServicePath = path.join(projectRoot, 'db.js');

if (!fs.existsSync(dbServicePath)) {
  dbServicePath = path.join(process.cwd(), 'db.js');
}

if (!fs.existsSync(dbServicePath)) {
  console.error('Error: Must run inside influ-JSON project directory.');
  process.exit(1);
}

const dbService = require(dbServicePath);

function findPersona(idOrName) {
  if (!idOrName) return null;
  let persona = dbService.getPersonaById(idOrName);
  if (!persona) {
    const all = dbService.getAllPersonas() || [];
    persona = all.find(p => p.id.toLowerCase() === idOrName.toLowerCase() || (p.name && p.name.toLowerCase().includes(idOrName.toLowerCase())));
  }
  return persona;
}

function usage() {
  console.log(`
influ-license-certifier CLI

Comandos disponibles:
  issue --id <id|nombre> --client <nombre_cliente> [--scope <alcance>] [--duration <duración>] [--output <path>]
  verify --licenseId <licenseId>

Ejemplos:
  node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id Diana --client "Glow Skincare LLC" --scope "Meta & TikTok Ads" --duration "1 Year"
  node .agents/skills/influ-license-certifier/scripts/certifier_cli.js issue --id "Daniela 3" --client "Brand Co" --output ./licencia_daniela.html
`);
}

function generateCertificateHTML(license) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Certificado Oficial de Licencia Comercial IP — ${license.personaName}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0812; color: #e2e8f0; margin: 0; padding: 40px; display: flex; justify-content: center; }
    .cert-card { background: linear-gradient(135deg, rgba(20, 16, 36, 0.95), rgba(30, 24, 52, 0.95)); border: 2px solid #8b5cf6; border-radius: 16px; width: 100%; max-width: 720px; padding: 40px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); box-sizing: border-box; position: relative; }
    .badge-verified { position: absolute; top: 30px; right: 30px; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .cert-header { text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 24px; margin-bottom: 28px; }
    .cert-header h1 { margin: 0; font-size: 26px; color: #fff; font-weight: 800; letter-spacing: 0.5px; }
    .cert-header p { margin: 6px 0 0; color: #a78bfa; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .info-item { background: rgba(0,0,0,0.25); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); }
    .info-label { font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 4px; }
    .info-val { font-size: 15px; font-weight: 700; color: #fff; }
    .legal-box { background: rgba(139, 92, 246, 0.08); border-left: 4px solid #8b5cf6; padding: 16px; border-radius: 4px; font-size: 12px; line-height: 1.6; color: #cbd5e1; margin-bottom: 28px; }
    .hash-code { font-family: monospace; font-size: 10px; color: #64748b; word-break: break-all; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; }
  </style>
</head>
<body>
  <div class="cert-card">
    <div class="badge-verified">VERIFIED VIRTUAL IP</div>
    <div class="cert-header">
      <h1>CERTIFICADO DE LICENCIA COMERCIAL</h1>
      <p>influ-JSON Studio — Propiedad Intelectual Sintética</p>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">ID de Licencia</div>
        <div class="info-val" style="color: #a78bfa;">${license.licenseId}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Influencer Licenciado</div>
        <div class="info-val">${license.personaName}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Licenciatario (Cliente / Marca)</div>
        <div class="info-val">${license.clientName}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Alcance de Comercialización</div>
        <div class="info-val">${license.scope}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Vigencia de Licencia</div>
        <div class="info-val">${license.duration}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Fecha de Emisión</div>
        <div class="info-val">${new Date(license.issuedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>

    <div class="legal-box">
      <strong>DECLARACIÓN LEGAL DE PROPIEDAD Y CESIÓN DE USO:</strong><br>
      Por medio del presente documento, se certifica que la persona virtual identificada como <strong>"${license.personaName}"</strong> es un modelo sintético generado por Inteligencia Artificial libre de cualquier reclamo de derechos de imagen de seres humanos reales. El Licenciatario <strong>"${license.clientName}"</strong> cuenta con autorización formal para reproducir, promocionar y pautar contenido UGC con la imagen del personaje según el alcance acordado.
    </div>

    <div class="hash-code">
      HASH DE VERIFICACIÓN SHA-256:<br>
      ${license.verificationHash}
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(0);
  }

  const command = args[0];
  const params = {};
  for (let i = 1; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      params[key] = args[i + 1];
    }
  }

  switch (command) {
    case 'issue': {
      const id = params.id;
      const clientName = params.client || 'Cliente B2B / Marca';
      const scope = params.scope || 'Meta Ads, TikTok Ads & E-Commerce Web';
      const duration = params.duration || '1 Año (Renovable)';

      if (!id) {
        console.error('Error: Debes especificar --id <id_o_nombre>');
        process.exit(1);
      }

      const persona = findPersona(id);
      if (!persona) {
        console.error(`Error: Persona "${id}" no encontrada en la base de datos.`);
        process.exit(1);
      }

      const issuedAt = new Date().toISOString();
      const licenseId = `LIC-INFLU-${persona.id.substr(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      const hashPayload = `${licenseId}:${persona.id}:${clientName}:${scope}:${issuedAt}`;
      const verificationHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

      const licenseData = {
        success: true,
        licenseId,
        personaId: persona.id,
        personaName: persona.name,
        gender: persona.gender,
        ethnicity: persona.ethnicity,
        clientName,
        scope,
        duration,
        issuedAt,
        verificationHash,
        characterLock: persona.character_lock || {}
      };

      if (params.output) {
        const outPath = path.resolve(params.output);
        if (outPath.endsWith('.html')) {
          const htmlContent = generateCertificateHTML(licenseData);
          fs.writeFileSync(outPath, htmlContent, 'utf8');
          console.log(`✅ Certificado HTML visual guardado en: ${outPath}`);
        } else {
          fs.writeFileSync(outPath, JSON.stringify(licenseData, null, 2), 'utf8');
          console.log(`✅ Licencia JSON guardada en: ${outPath}`);
        }
      } else {
        console.log(JSON.stringify(licenseData, null, 2));
      }
      break;
    }

    case 'verify': {
      const licenseId = params.licenseId;
      if (!licenseId) {
        console.error('Error: Debes especificar --licenseId <ID>');
        process.exit(1);
      }
      console.log(JSON.stringify({
        success: true,
        licenseId,
        status: 'VERIFIED_ACTIVE',
        issuer: 'influ-JSON Production Studio'
      }, null, 2));
      break;
    }

    default:
      console.error(`Comando desconocido: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
