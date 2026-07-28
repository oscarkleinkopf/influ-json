/**
 * Brand kit — packs chatbot + guión UGC 15s (free path).
 * Usado por /api/export/persona/:id?kit=1
 */
const nichePresets = require('./niche-presets');

const PACK_SCENES = {
  fullbody: {
    title: 'Cuerpo entero',
    scene: `Genera UNA imagen UGC de smartphone en CUERPO ENTERO (head-to-toe):
• Se ven pies y cabeza con margen de entorno
• Misma persona del CHARACTER LOCK (cara, tez, pelo, cuerpo)
• Pose natural de pie o caminando
• NO close-up, NO solo rostro
• Estilo foto amateur de celular, no cine`
  },
  bikini: {
    title: 'Bikini / playa',
    scene: `Genera UNA imagen UGC en la playa:
• Bikini de dos piezas
• Playa de día, luz natural
• Plano medio o cuerpo entero
• MISMA cara y MISMA tez del CHARACTER LOCK (no oscurecer al sol)`
  },
  spicy: {
    title: 'Spicy (realista)',
    scene: `Genera UNA imagen sensual fotorealista (lencería / night-out):
• Misma cara, tez y cuerpo del CHARACTER LOCK
• No CGI, no anime, no cara distinta
• Luz de habitación / flash suave de celular`
  },
  product: {
    title: 'Producto en mano',
    scene: `Genera UNA imagen UGC con producto en la mano:
• Rostro reconocible según CHARACTER LOCK
• Producto visible en primer plano relativo
• Estilo review / unboxing de stories`
  }
};

function parseDetailed(persona) {
  let detailed = persona.detailedJSON || {};
  if (typeof detailed === 'string') {
    try { detailed = JSON.parse(detailed); } catch (_) { detailed = {}; }
  }
  if (!detailed || typeof detailed !== 'object') detailed = {};
  return detailed;
}

function ensureCharacterLock(persona, detailed) {
  if (detailed.character_lock && typeof detailed.character_lock === 'object') {
    return detailed.character_lock;
  }
  return {
    version: 1,
    free_tier: true,
    purpose: 'Mantener la misma persona en chatbots gratuitos sin face-lock de pago',
    must_match_every_image: {
      name: persona.name,
      gender: persona.gender,
      age: persona.age,
      ethnicity: persona.ethnicity,
      skin_tone: detailed.facial_features?.skin_tone || null,
      skin_tone_hex: detailed.facial_features?.skin_tone_hex || null,
      face_shape: detailed.facial_features?.face_shape || null,
      eye_color: detailed.facial_features?.eye_color || null,
      hair_color: detailed.hair?.color || persona.hair || null,
      body_type: detailed.body?.body_type || null
    },
    may_vary_per_image: ['pose', 'clothing', 'setting_background', 'product_in_hand'],
    never_do: [
      'Cambiar tono de piel o etnia aparente',
      'Cambiar forma de rostro',
      'Cuerpo con proporciones distintas'
    ]
  };
}

function detectNiche(detailed) {
  const fromLock = detailed.character_lock?.niche || detailed.niche || detailed.brand_niche;
  if (fromLock && nichePresets.getNichePreset(fromLock)) return fromLock;
  const style = String(detailed.identity?.persona_archetype || detailed.aesthetic?.overall_vibe || '').toLowerCase();
  if (/beauty|skincare|glow|piel|serum/.test(style)) return 'beauty';
  if (/fit|gym|wellness|sport|entreno/.test(style)) return 'fitness';
  if (/moda|fashion|ootd|street|chic/.test(style)) return 'moda';
  return null;
}

function buildPackText(persona, lock, packId) {
  const pack = PACK_SCENES[packId];
  if (!pack) return null;
  return `PACK GRATIS PARA CHATBOT — ${pack.title} (${packId})
Influencer: ${persona.name}
Cero costo: sin Replicate / InstantID

═══════════════════════════════════════════
CHARACTER LOCK
═══════════════════════════════════════════
${JSON.stringify(lock, null, 2)}

═══════════════════════════════════════════
PETICIÓN DE ESTA IMAGEN
═══════════════════════════════════════════
${pack.scene}

INSTRUCCIONES:
1) Pega este texto en ChatGPT / Gemini / Claude / Meta free.
2) Genera la imagen respetando character_lock.
3) Si la cara o tez cambian, re-pega el lock y regenera.
`;
}

/**
 * Guión UGC ~15–20s (PAS) adaptado al MBTI / nicho — texto plano para el kit.
 */
function buildUgcScript15s(persona, detailed, nicheId) {
  const name = persona.name || 'Influencer';
  const niche = nichePresets.getNichePreset(nicheId);
  const productHint = niche
    ? (nicheId === 'beauty' ? 'tu sérum / rutina' : nicheId === 'fitness' ? 'tu app / shaker / banda' : 'tu pieza / outfit')
    : 'tu producto';
  const mbti = detailed.personality?.mbti || niche?.form?.mbti || 'ENFP';
  const voice = detailed.personality?.communication_style || niche?.form?.communicationStyle || 'cercana y natural';
  const angle = niche?.lockExtras?.ugc_angle || 'PAS — problema → agitación → solución';

  return `GUIÓN UGC ~15–20s — ${name}
Nicho: ${niche ? niche.label : 'general'}
Fórmula: ${angle}
Voz (MBTI): ${mbti}
Tono: ${voice}
Producto (placeholder): ${productHint}

[0–3s HOOK]
Diálogo: "Pará el scroll — esto me cambió la rutina con ${productHint}."
Visual: Close-up cara (CHARACTER LOCK) + gesto a cámara. Texto en pantalla: "Antes vs ahora".

[3–10s DEMO]
Diálogo: "Mirá: lo uso así, sin filtro raro. Misma cara, mismo glow — prueba real."
Visual: Plano medio / producto en mano. Mostrar 1–2 pasos. Mantener tez y cara del lock.

[10–15s TURN]
Diálogo: "Si te pasa lo mismo que a mí, esto es lo que estaba buscando."
Visual: Reacción auténtica + detalle del producto.

[15–20s CTA]
Diálogo: "Link en bio — te dejo el que yo uso. Contame si lo probás."
Visual: Producto + cara reconocible. Sticker CTA / URL.

NOTAS DE PRODUCCIÓN (gratis):
• Pegá character_lock.json en el chatbot antes de generar frames.
• Usa packs/product.txt o packs/fullbody.txt del kit.
• Si la cara se desvía, re-pega el CHARACTER LOCK.
`;
}

function buildKitReadme(persona, nicheId) {
  const niche = nichePresets.getNichePreset(nicheId);
  return `influ-JSON — KIT MARCA (cero costo)
=====================================
Influencer: ${persona.name}
Nicho: ${niche ? niche.label : 'general'}
Fecha: ${new Date().toISOString()}

Qué incluye
-----------
• persona.json          → ficha completa
• character_lock.json   → ancla de identidad (gratis)
• packs/*.txt           → 4 packs listos para chatbot free
• guion_ugc_15s.txt     → guión PAS/AIDA ~15–20s
• COMO_USAR_KIT.txt     → este archivo
• imagenes/             → ancla + variantes (si hay)
• licencia.json         → certificado comercial básico

Flujo emprendedor (60s)
-----------------------
1. Abrí character_lock.json o packs/fullbody.txt
2. Pegalo en ChatGPT / Gemini / Claude free
3. Pedí 3 imágenes: retrato, cuerpo entero, producto en mano
4. Grabá el guión de guion_ugc_15s.txt en Reels/TikTok
5. Si la cara cambia → re-pegá el CHARACTER LOCK

Sin tarjeta. Sin Replicate obligatorio.
`;
}

/**
 * Archivos de texto del kit (sin imágenes).
 * @returns {{ files: Array<{name:string, content:string}>, lock: object, nicheId: string|null }}
 */
function buildBrandKitFiles(persona) {
  const detailed = parseDetailed(persona);
  const lock = ensureCharacterLock(persona, detailed);
  const nicheId = detectNiche(detailed) || lock.niche || null;
  if (nicheId && !lock.niche) {
    lock.niche = nicheId;
    const preset = nichePresets.getNichePreset(nicheId);
    if (preset?.lockExtras) {
      lock.brand_voice = preset.lockExtras.brand_voice;
      lock.recommended_packs = preset.lockExtras.recommended_packs;
    }
  }

  const files = [
    { name: 'persona.json', content: JSON.stringify({ ...persona, detailedJSON: detailed, character_lock: lock }, null, 2) },
    { name: 'character_lock.json', content: JSON.stringify(lock, null, 2) },
    { name: 'COMO_USAR_KIT.txt', content: buildKitReadme(persona, nicheId) },
    { name: 'guion_ugc_15s.txt', content: buildUgcScript15s(persona, detailed, nicheId) }
  ];

  Object.keys(PACK_SCENES).forEach((packId) => {
    files.push({
      name: `packs/${packId}.txt`,
      content: buildPackText(persona, lock, packId)
    });
  });

  return { files, lock, nicheId, detailed };
}

module.exports = {
  PACK_SCENES,
  buildBrandKitFiles,
  buildUgcScript15s,
  buildPackText,
  ensureCharacterLock,
  detectNiche
};
