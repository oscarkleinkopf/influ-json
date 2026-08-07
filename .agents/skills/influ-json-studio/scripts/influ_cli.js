#!/usr/bin/env node

/**
 * influ_cli.js — CLI Helper Script for influ-json-studio Skill
 * Allows agents and users to interact programmatically with influ-JSON.
 */

const path = require('path');
const fs = require('fs');

// Ensure working directory resolves to project root
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
influ-json-studio CLI

Comandos disponibles:
  status                                 Muestra el estado de influencers, campañas y base de datos
  list-personas                          Lista todos los influencers registrados
  get-persona --id <id|nombre>           Muestra los detalles y JSON character_lock de una persona
  export-pack --id <id|nombre> --type <type>    Genera pack gratis para chatbot (fullbody|bikini|spicy|product)
  license --id <id|nombre>               Emite el certificado de Licencia Comercial IP

Ejemplos:
  node .agents/skills/influ-json-studio/scripts/influ_cli.js status
  node .agents/skills/influ-json-studio/scripts/influ_cli.js export-pack --id Diana --type fullbody
`);
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
    case 'status': {
      const personas = dbService.getAllPersonas() || [];
      const active = personas.filter(p => !p.archived);
      const stats = dbService.getGenerationStats ? dbService.getGenerationStats() : { total: 0 };
      console.log(JSON.stringify({
        success: true,
        totalPersonas: personas.length,
        activePersonas: active.length,
        totalGenerations: stats.total || 0,
        status: 'OK'
      }, null, 2));
      break;
    }

    case 'list-personas': {
      const personas = dbService.getAllPersonas() || [];
      console.log(JSON.stringify(personas.map(p => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        ethnicity: p.ethnicity,
        archived: Boolean(p.archived)
      })), null, 2));
      break;
    }

    case 'get-persona': {
      const id = params.id;
      if (!id) {
        console.error('Error: Debes especificar --id <id_o_nombre>');
        process.exit(1);
      }
      const persona = findPersona(id);
      if (!persona) {
        console.error(`Error: Persona "${id}" no encontrada.`);
        process.exit(1);
      }
      console.log(JSON.stringify(persona, null, 2));
      break;
    }

    case 'export-pack': {
      const id = params.id;
      const type = params.type || 'fullbody';
      if (!id) {
        console.error('Error: Debes especificar --id <id_o_nombre>');
        process.exit(1);
      }

      const persona = findPersona(id);
      if (!persona) {
        console.error(`Error: Persona "${id}" no encontrada.`);
        process.exit(1);
      }

      let packsApi;
      try {
        packsApi = require(path.join(path.dirname(dbServicePath), 'chatbot-packs.js'));
      } catch (err) {
        console.error('Error: no se pudo cargar chatbot-packs.js:', err.message);
        process.exit(1);
      }

      let packOutput;
      try {
        packOutput = packsApi.buildFreeChatbotPack(persona, type, { fallbackName: persona.name });
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }

      if (params.output) {
        fs.writeFileSync(params.output, packOutput, 'utf8');
        console.log(`✅ Pack guardado en: ${params.output}`);
      } else {
        console.log(packOutput);
      }
      break;
    }

    case 'license': {
      const id = params.id;
      if (!id) {
        console.error('Error: Debes especificar --id <id_o_nombre>');
        process.exit(1);
      }
      const persona = findPersona(id);
      if (!persona) {
        console.error(`Error: Persona "${id}" no encontrada.`);
        process.exit(1);
      }

      const license = {
        success: true,
        licenseId: `LIC-INFLU-${persona.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        personaId: persona.id,
        personaName: persona.name,
        commercialUsageAllowed: true,
        scope: 'GLOBAL_DIGITAL_MARKETING_UGC_ADS',
        issuedAt: new Date().toISOString()
      };

      console.log(JSON.stringify(license, null, 2));
      break;
    }

    default:
      console.error(`Comando desconocido: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
