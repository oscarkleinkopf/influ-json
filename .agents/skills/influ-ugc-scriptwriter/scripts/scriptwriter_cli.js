#!/usr/bin/env node

/**
 * scriptwriter_cli.js — CLI Utility Script for influ-ugc-scriptwriter Skill
 * Generates High-Converting Short-Form UGC Scripts (15-25s) tailored to Virtual Influencer Persona & MBTI.
 */

const path = require('path');
const fs = require('fs');

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
influ-ugc-scriptwriter CLI

Comandos disponibles:
  generate --id <id|nombre> --product <nombre_producto> [--benefit <beneficio>] [--audience <audiencia>] [--formula <aida|pas|unboxing>] [--output <path>]

Ejemplos:
  node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id Diana --product "Glow Serum" --benefit "Piel radiante en 5 minutos" --formula aida
  node .agents/skills/influ-ugc-scriptwriter/scripts/scriptwriter_cli.js generate --id "Daniela 3" --product "Hydro Bottle" --formula pas --output ./guion_daniela.json
`);
}

function buildScript(persona, product, benefit, audience, formula) {
  const name = persona ? persona.name : 'Influencer';
  const mbti = persona && persona.mbti ? persona.mbti : 'ENFP';
  const voiceStyle = persona && persona.communication_style ? persona.communication_style : 'Cercano, dinámico y empático';

  const prodName = product || 'Producto Destacado';
  const prodBenefit = benefit || 'Resultados visibles desde el primer uso';
  const targetAudience = audience || 'Personas ocupadas que buscan calidad';

  let formulaName = 'AIDA (Atención - Interés - Deseo - Acción)';
  let scenes = [];

  if (formula === 'pas') {
    formulaName = 'PAS (Problema - Agitación - Solución)';
    scenes = [
      {
        time: '00:00 - 00:04',
        phase: '1. PROBLEMA (HOOK 4s)',
        visual: `Selfie cercano de ${name} con expresión de ligera frustración mostrando un detalle en segundo plano.`,
        voice: `¿Te pasa a ti también que ${targetAudience} siempre terminamos perdiendo tiempo con cosas que no funcionan?`,
        onScreenText: `❌ ¿Cansado de no ver resultados?`
      },
      {
        time: '00:04 - 00:09',
        phase: '2. AGITACIÓN (5s)',
        visual: `${name} negando con la cabeza en plano medio, ambiente iluminado de día.`,
        voice: `Estuve meses probando de todo y la verdad es que era súper frustrante no encontrar algo real.`,
        onScreenText: `😩 Estuve a punto de rendirme...`
      },
      {
        time: '00:09 - 00:18',
        phase: '3. SOLUCIÓN (9s)',
        visual: `${name} sonriendo sosteniendo ${prodName} hacia la cámara en plano americano.`,
        voice: `Hasta que descubrí ${prodName}. En serio, ${prodBenefit}. ¡Cambió totalmente mi rutina!`,
        onScreenText: `✨ La solución real: ${prodName}`
      },
      {
        time: '00:18 - 00:25',
        phase: '4. LLAMADO A LA ACCIÓN (7s)',
        visual: `${name} apuntando abajo sonriente con ${prodName} en mano.`,
        voice: `Consíguelo hoy con envío rápido en el botón de abajo antes de que se agote.`,
        onScreenText: `👇 Toca aquí para pedir el tuyo`
      }
    ];
  } else if (formula === 'unboxing') {
    formulaName = 'UNBOXING / TESTIMONIAL DIRECTO';
    scenes = [
      {
        time: '00:00 - 00:03',
        phase: '1. UNBOXING HOOK (3s)',
        visual: `${name} abriendo una caja de empaque elegante con entusiasmo en la mesa.`,
        voice: `¡Miren lo que me acaba de llegar! Tenía muchísimas ganas de probar esto.`,
        onScreenText: `📦 ¡Llegó mi pedido favorito!`
      },
      {
        time: '00:03 - 00:10',
        phase: '2. REACCIÓN Y TEXTURA (7s)',
        visual: `${name} sosteniendo ${prodName} cerca de la luz de ventana, mostrando los detalles.`,
        voice: `Se trata de ${prodName}. La calidad y el acabado son increíbles.`,
        onScreenText: `😍 Miren este acabado impecable`
      },
      {
        time: '00:10 - 00:18',
        phase: '3. DEMOSTRACIÓN EN VIVO (8s)',
        visual: `${name} usando ${prodName} sonriente en plano medio.`,
        voice: `Lo mejor es que ${prodBenefit}. Realmente vale cada segundo.`,
        onScreenText: `⚡ ${prodBenefit}`
      },
      {
        time: '00:18 - 00:25',
        phase: '4. RECOMENDACIÓN FINAL (7s)',
        visual: `${name} guiñando un ojo a la cámara con pulgar arriba.`,
        voice: `100% recomendado. Haz clic en el enlace para ver la oferta especial.`,
        onScreenText: `🔥 Consigue el tuyo con descuento`
      }
    ];
  } else {
    // Default AIDA
    scenes = [
      {
        time: '00:00 - 00:03',
        phase: '1. ATENCIÓN (HOOK 3s)',
        visual: `${name} mirando fijamente a la cámara con expresión alegre y gesto dinámico.`,
        voice: `¡Detén el scroll! Si buscas la mejor forma de lograr ${prodBenefit}, tienes que ver esto.`,
        onScreenText: `🚨 ¡No te saltes este video!`
      },
      {
        time: '00:03 - 00:08',
        phase: '2. INTERÉS (5s)',
        visual: `${name} caminando relajada en terraza o ambiente moderno sosteniendo el producto.`,
        voice: `Siempre me preguntan mi secreto en redes para mantenerme al 100%.`,
        onScreenText: `💡 Mi secreto diario revelado`
      },
      {
        time: '00:08 - 00:17',
        phase: '3. DESEO (9s)',
        visual: `${name} mostrando ${prodName} de cerca a la luz natural con sonrisa genuina.`,
        voice: `La respuesta es ${prodName}. Es increíble porque ${prodBenefit}.`,
        onScreenText: `✨ ${prodName}: ${prodBenefit}`
      },
      {
        time: '00:17 - 00:25',
        phase: '4. ACCIÓN (CTA 8s)',
        visual: `${name} haciendo un gesto hacia la parte inferior del video sonriente.`,
        voice: `Haz clic aquí abajo ahora mismo para aprovechar el descuento por tiempo limitado.`,
        onScreenText: `👉 Haz clic abajo para pedir con descuento`
      }
    ];
  }

  return {
    title: `Guión Publicitario UGC 15-25s — ${name}`,
    influencer: name,
    arquetipoMBTI: mbti,
    estiloComunicacion: voiceStyle,
    producto: prodName,
    beneficioClave: prodBenefit,
    formulaUtilizada: formulaName,
    duracionAproximada: '22 segundos',
    escenas: scenes
  };
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
    case 'generate': {
      const id = params.id;
      const product = params.product || 'Producto Destacado';
      const benefit = params.benefit || 'Resultados inmediatos desde el primer día';
      const audience = params.audience || 'Personas modernas';
      const formula = (params.formula || 'aida').toLowerCase();

      if (!id) {
        console.error('Error: Debes especificar --id <id_o_nombre>');
        process.exit(1);
      }

      const persona = findPersona(id);
      if (!persona) {
        console.error(`Error: Persona "${id}" no encontrada.`);
        process.exit(1);
      }

      const scriptData = buildScript(persona, product, benefit, audience, formula);

      if (params.output) {
        const outPath = path.resolve(params.output);
        fs.writeFileSync(outPath, JSON.stringify(scriptData, null, 2), 'utf8');
        console.log(`✅ Guión publicitario guardado en: ${outPath}`);
      } else {
        console.log(JSON.stringify(scriptData, null, 2));
      }
      break;
    }

    default:
      console.error(`Comando desconocido: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
