/**
 * F5 — Packs gratis para chatbots (character_lock).
 * Compartido: Node (tests / brand-kit) y navegador (app.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluChatbotPacks = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FREE_CHATBOT_PACKS = {
    fullbody: {
      id: 'fullbody',
      label: '🧍 Cuerpo entero',
      short: 'Head-to-toe, misma persona',
      sceneInstruction: `Genera UNA imagen UGC de smartphone en CUERPO ENTERO (head-to-toe):
• Cámara lejos: se ven pies y cabeza con margen de entorno
• Misma persona del CHARACTER LOCK (cara, tez, pelo, cuerpo)
• Pose natural de pie o caminando
• NO close-up, NO solo rostro, NO recorte a la cintura
• Proporciones naturales (no alargar cara ni cuerpo)
• Estilo foto amateur de celular, no cine`
    },
    bikini: {
      id: 'bikini',
      label: 'Bikini / playa',
      short: 'Bikini + playa, misma tez',
      sceneInstruction: `Genera UNA imagen UGC en la playa:
• Ropa: bikini de dos piezas (o trikini si pides otra variante)
• Fondo: playa de arena y mar, luz de día natural
• Preferible plano medio o cuerpo entero
• MISMA cara y MISMA tez del CHARACTER LOCK (no oscurecer la piel al sol)
• Cabello y cuerpo según el lock
• Estilo influencer con celular, no campaña de moda 8K`
    },
    spicy: {
      id: 'spicy',
      label: 'Spicy (realista)',
      short: 'Sensual fotoreal, no CGI',
      sceneInstruction: `Genera UNA imagen UGC sensual pero FOTOREALISTA:
• Ropa: lencería o satén elegante (NO látex espejo CGI, NO 3D)
• Ambiente: dormitorio/hotel con luz cálida real
• MISMA cara, tez y cuerpo del CHARACTER LOCK
• Piel real con poros; tela con textura real
• Evitar: muñeca, plástico, neón cyberpunk, calabozo fantasía
• Estilo foto de celular en boudoir, amateur creíble`
    },
    product: {
      id: 'product',
      label: 'Producto en mano',
      short: 'UGC con producto',
      sceneInstruction: `Genera UNA imagen UGC del influencer mostrando un producto:
• El personaje sostiene el producto cerca de la cámara (mano visible)
• Rostro reconocible según CHARACTER LOCK (misma cara y tez)
• Plano medio o selfie con producto
• Fondo interior simple (casa/baño/cocina) con luz de ventana
• Si hay datos de producto en el mensaje, úsalos; si no, usa un frasco/caja genérica de beauty
• Estilo review de TikTok/Instagram, no anuncio de TV`
    }
  };

  /**
   * @param {object} personaJSON
   * @param {string} packId
   * @param {{ productData?: object, extraScene?: string, fallbackName?: string }} [opts]
   */
  function buildFreeChatbotPack(personaJSON, packId, opts = {}) {
    const pack = FREE_CHATBOT_PACKS[packId];
    if (!pack) throw new Error('Pack desconocido: ' + packId);
    const json = personaJSON && typeof personaJSON === 'object' ? personaJSON : {};
    const lock = json.character_lock || {};
    const must = lock.must_match_every_image || {};
    const name = must.name || json.identity?.name || opts.fallbackName || 'Influencer';

    let productBlock = '';
    const prod = opts.productData;
    if (packId === 'product' && prod) {
      productBlock = `
PRODUCTO A MOSTRAR:
• Nombre: ${prod.name || 'Producto'}
• Beneficio: ${prod.benefit || '—'}
• Audiencia: ${prod.audience || '—'}
`;
    }

    const extra = opts.extraScene ? `\nDetalle extra del usuario: ${opts.extraScene}\n` : '';

    return `═══════════════════════════════════════════
PACK GRATIS PARA CHATBOT — ${pack.label}
Influencer: ${name}
Cero costo: sin Replicate / InstantID / GPU de pago
═══════════════════════════════════════════

${lock.free_chatbot_system || 'Mantén la misma persona del JSON en todas las imágenes.'}

───────────────────────────────────────────
CHARACTER LOCK (obligatorio)
───────────────────────────────────────────
${JSON.stringify(lock, null, 2)}

RESUMEN FIJO:
• ${must.name || name} · ${must.age || ''} · ${must.gender || ''} · ${must.ethnicity || ''}
• Cara: ${must.face_shape || '—'} | ojos ${must.eye_color || '—'} | ${must.eyebrows || ''}
• Piel: ${must.skin_tone || '—'}${must.skin_tone_hex ? ' ' + must.skin_tone_hex : ''} (NO cambiar)
• Cabello: ${must.hair_color || ''} · ${must.hair_texture || ''} · ${must.hair_length || ''}
• Cuerpo: ${must.body_type || ''} · ${must.height || ''} · ${must.proportions || ''}

───────────────────────────────────────────
PETICIÓN DE ESTA IMAGEN
───────────────────────────────────────────
${pack.sceneInstruction}
${productBlock}${extra}
───────────────────────────────────────────
JSON COMPLETO (referencia)
───────────────────────────────────────────
${JSON.stringify(json, null, 2)}

───────────────────────────────────────────
AL FINAL
───────────────────────────────────────────
1) Genera la imagen respetando el CHARACTER LOCK.
2) Si la cara o la tez cambian, re-aplica el lock y regenera.
3) Responde en español con una línea: "OK — pack ${pack.id} para ${name}".
`;
  }

  function listPackIds() {
    return Object.keys(FREE_CHATBOT_PACKS);
  }

  return {
    FREE_CHATBOT_PACKS,
    buildFreeChatbotPack,
    listPackIds
  };
});
