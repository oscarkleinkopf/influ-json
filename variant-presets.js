/**
 * Variant presets (UX-4 extract from app.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluVariantPresets = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

const VARIANT_PRESETS = {
  traditional: {
    poses: [
      { label: "Selfie primer plano (rostro)", value: "Selfie de primer plano de rostro (selfie portrait close-up)" },
      { label: "Plano medio-corto (selfie)", value: "Plano medio-corto de brazo extendido (candid hand-held selfie medium shot)" },
      { label: "Selfie de espejo (cuerpo entero)", value: "full body mirror selfie head to toe holding phone, entire body visible feet to head (full-body mirror selfie)" },
      { label: "Cuerpo entero (Modelando de pie)", value: "full body standing fashion model pose head to toe, camera far back, entire figure visible including feet and shoes (full-body standing pose)" },
      { label: "Cuerpo entero (caminando hacia cámara)", value: "full body walking toward camera head to toe, wide vertical shot, feet and head in frame (full-body walking)" },
      { label: "Plano medio americano (caminando)", value: "Plano medio americano caminando relajada (candid snapshot walking medium shot)" },
      { label: "Sentada (perfil)", value: "Sentada de medio lado sonriendo a la cámara (sitting profile view)" },
      { label: "Sentada en el suelo (casual)", value: "Sentada en el suelo de forma relajada y casual (candid floor seating pose)" },
      { label: "Apoyada en pared (confiada)", value: "Apoyada sutilmente en una pared con postura confiada (leaning against wall pose)" },
      { label: "Jugando con el cabello", value: "Jugando con el cabello de forma espontánea (playing with hair candid pose)" }
    ],
    attitudes: [
      { label: "Sonriente y alegre", value: "sonriendo alegremente de forma muy natural (happy approachable smile)" },
      { label: "Seria y elegante", value: "mirada fija seria y elegante de alta costura (serious high-fashion expression)" },
      { label: "Guiñando un ojo", value: "guiñando un ojo de forma juguetona e ingeniosa (playful confident wink)" },
      { label: "Pensativa / Distante", value: "pensativa mirando hacia el horizonte (thoughtful distant gaze)" },
      { label: "Risa espontánea / Divertida", value: "risa espontánea y divertida (candid laughing moment)" }
    ],
    clothing: {
      Female: [
        { label: "Ropa deportiva: Calzas y top deportivo de licra negro", value: "Ropa deportiva: Calzas y top deportivo de licra negro entallado" },
        { label: "Ropa de trabajo: Traje sastre gris con blazer entallado", value: "Ropa de trabajo: Traje sastre gris con blazer entallado y blusa blanca" },
        { label: "Sport elegante: Camisa de lino blanca con vaqueros", value: "Sport elegante: Camisa de lino blanca holgada con vaqueros claros" },
        { label: "Salida de noche: Vestido ajustado negro de satén", value: "Salida de noche: Vestido ajustado negro de satén con tirantes finos" },
        { label: "Bikini (dos piezas)", value: "Traje de baño: Bikini de dos piezas clásico (classic two-piece bikini)" },
        { label: "Trikini / cut-out", value: "Traje de baño: Trikini de una pieza con cut-outs laterales (one-piece trikini)" },
        { label: "Traje de baño completo / entero", value: "Traje de baño: Traje de baño completo de una pieza (full one-piece swimsuit)" },
        { label: "Casual cotidiano: Suéter de punto crema", value: "Casual cotidiano: Suéter de punto suave en tono crema cuello redondo" },
        { label: "Estilo playero: Vestido veraniego de lino beige", value: "Estilo playero: Vestido veraniego suelto de lino color beige" },
        { label: "Cozy / Casa: Sudadera minimalista gris oversized", value: "Cozy / Casa: Sudadera con capucha minimalista gris melange oversized" },
        { label: "Cóctel / Fiesta: Mono largo de satén verde esmeralda", value: "Cóctel / Fiesta: Mono largo de satén verde esmeralda con cinturón" },
        { label: "Estilo urbano / Streetwear: Chaqueta de cuero negra", value: "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta básica blanca" },
        { label: "Boho Chic: Blusa de encaje blanco con falda larga", value: "Boho Chic: Blusa de encaje blanco con falda larga bohemia de verano" }
      ],
      Male: [
        { label: "Ropa deportiva: Sudadera de secado rápido y joggers", value: "Ropa deportiva: Sudadera con capucha de secado rápido y joggers negros" },
        { label: "Ropa de trabajo: Traje clásico azul marino con camisa blanca", value: "Ropa de trabajo: Traje clásico azul marino con camisa blanca y corbata" },
        { label: "Sport elegante: Camisa de lino blanca y chinos beige", value: "Sport elegante: Camisa de lino blanca y pantalones chinos beige" },
        { label: "Salida de noche: Camisa de seda negra desabrochada", value: "Salida de noche: Camisa de seda negra desabrochada y pantalones oscuros" },
        { label: "Short de baño / bañador", value: "Traje de baño: Short de baño clásico (classic swim trunks)" },
        { label: "Slip de natación", value: "Traje de baño: Slip de natación deportivo (athletic swim brief)" },
        { label: "Casual cotidiano: Jersey de punto fino gris", value: "Casual cotidiano: Jersey de punto fino gris con cuello redondo" },
        { label: "Estilo playero: Camisa guayabera blanca y bermudas", value: "Estilo playero: Camisa guayabera blanca y bermudas de lino beige" },
        { label: "Cozy / Casa: Sudadera minimalista azul marino", value: "Cozy / Casa: Sudadera con capucha minimalista azul marino oversized" },
        { label: "Saco casual: Blazer beige sobre camiseta básica blanca", value: "Saco casual: Blazer beige sobre camiseta básica blanca" },
        { label: "Estilo urbano / Streetwear: Chaqueta de cuero negra", value: "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta negra con vaqueros" }
      ]
    },
    settings: [
      { label: "Cafetería (interior)", value: "Fondo de cafetería moderna iluminada de día (modern bright cafe interior)" },
      { label: "Gimnasio (neón)", value: "Gimnasio moderno con luces de neón tenues (modern dark fitness studio)" },
      { label: "Parque (naturaleza)", value: "Parque natural soleado con follaje verde desenfocado (sunny green park)" },
      { label: "Calle urbana (noche)", value: "Calle de ciudad de noche con luces bokeh desenfocadas (urban neon street night)" },
      { label: "Habitación lujosa", value: "Habitación de hotel lujosa y luminosa (luxury bright hotel room)" },
      { label: "Playa (mediodía soleado)", value: "Playa de arena blanca al mediodía, mar azul al fondo (bright tropical beach midday)" },
      { label: "Playa paradisíaca (atardecer)", value: "Playa paradisíaca de arena blanca al atardecer dorado (tropical beach sunset)" },
      { label: "Piscina exterior soleada", value: "Piscina exterior soleada con agua turquesa (sunny outdoor pool)" },
      { label: "Terraza costera (vista mar)", value: "Terraza costera con vista al mar (coastal terrace ocean view)" },
      { label: "Terraza Penthouse (vista urbana)", value: "Terraza de penthouse de lujo con vista panorámica a la ciudad (penthouse rooftop skyline view)" },
      { label: "Bosque nevado (invierno)", value: "Bosque de pinos nevado de invierno (snowy pine forest background)" }
    ]
  },
  spicy: {
    // Photoreal first: avoid “mirror CGI latex / dungeon fantasy” defaults that kill realism
    poses: [
      { label: "De pie confiada (cuerpo entero)", value: "standing full-body confident pose, natural weight on one leg, smartphone photo (realistic full body standing pose)" },
      { label: "Mirada sobre el hombro", value: "looking over the shoulder toward camera, natural seductive pose (candid over-the-shoulder smartphone photo)" },
      { label: "Recostada en cama (natural)", value: "reclining naturally on bed, relaxed body, real fabric folds (candid bedroom photo)" },
      { label: "Sentada cruzando piernas", value: "sitting crossing legs on edge of bed or chair, natural posture (realistic seated pose)" },
      { label: "Apoyada en pared (candid)", value: "leaning casually against a wall, natural body language (candid wall lean photo)" },
      { label: "Primer plano beauty realista", value: "close-up beauty portrait with natural skin texture, real pores (photoreal close-up)" }
    ],
    attitudes: [
      { label: "Seductora natural", value: "subtle seductive expression, soft confident gaze (natural alluring expression)" },
      { label: "Confianza intensa", value: "intense confident gaze at camera, slight smile (confident intense look)" },
      { label: "Coqueta / juguetona", value: "playful flirty expression, natural smile (playful flirty look)" },
      { label: "Misteriosa suave", value: "soft mysterious gaze, relaxed face (soft mysterious expression)" }
    ],
    clothing: {
      Female: [
        { label: "Lencería roja de encaje (realista)", value: "real red lace lingerie set, sheer fabric with real textile weave, natural fit on body, not plastic (photoreal red lace lingerie)" },
        { label: "Body de satén rojo", value: "fitted red satin bodysuit, soft fabric sheen (not mirror gloss), real cloth wrinkles (photoreal red satin bodysuit)" },
        { label: "Vestido rojo corto ajustado", value: "short fitted red cocktail dress, real fabric texture, natural drape (photoreal red mini dress)" },
        { label: "Catsuit negro de látex sutil", value: "black latex catsuit with subtle real latex sheen (matte-gloss mix, NOT chrome mirror, NOT CGI plastic), realistic material (photoreal black latex catsuit)" },
        { label: "Catsuit rojo de látex sutil", value: "passion red latex catsuit with subtle realistic latex sheen (NOT mirror chrome, NOT 3D render), real folds and skin contact (photoreal red latex catsuit)" },
        { label: "Corsé de cuero negro + medias", value: "black leather corset with garter belt and sheer stockings, real leather grain (photoreal leather corset set)" },
        { label: "Conjunto de seda negra", value: "black silk slip lingerie, soft natural fabric, realistic sheen (photoreal black silk lingerie)" },
        { label: "Bikini rojo clásico", value: "classic red two-piece bikini, real fabric, natural body (photoreal red bikini)" },
        { label: "Robeseductor de satén", value: "open red satin robe over lingerie, soft fabric, candid boudoir photo (photoreal satin robe)" }
      ],
      Male: [
        { label: "Torso descubierto + pantalón oscuro", value: "bare chest with realistic skin texture, dark fitted trousers, natural lighting (photoreal)" },
        { label: "Bóxers premium negros", value: "black designer boxer briefs, real cotton/satin fabric (photoreal)" },
        { label: "Cuero negro realista", value: "black leather jacket open on chest, real leather grain (photoreal)" },
        { label: "Arnés sutil + pantalón", value: "subtle dark leather harness over bare chest, fitted trousers, not costume CGI (photoreal)" }
      ]
    },
    settings: [
      { label: "Dormitorio moderno (noche suave)", value: "modern bedroom at night, warm practical lamps, real interior photo (no fantasy dungeon)" },
      { label: "Boudoir hotel (luz cálida)", value: "luxury hotel bedroom, warm practical lighting, real architecture (photoreal hotel boudoir)" },
      { label: "Penthouse nocturno (ventana ciudad)", value: "penthouse bedroom at night with city lights through window, realistic interior" },
      { label: "Sala low-key (lámpara lateral)", value: "dim modern living room with single warm side lamp, realistic shadows" },
      { label: "Baño hotel (espejo, luz suave)", value: "hotel bathroom mirror selfie lighting, soft realistic bathroom interior" },
      { label: "Terraza nocturna (ciudad bokeh)", value: "night rooftop terrace with soft city bokeh lights, real outdoor night photo" },
      { label: "Studio foto low-key (realista)", value: "simple dark photography studio with soft key light, photoreal fashion set (not sci-fi)" }
    ]
  }
};

const VARIANT_ACCESSORIES = [
  { label: 'Collar', value: 'collar delicado' },
  { label: 'Aretes', value: 'aretes dorados' },
  { label: 'Aros grandes', value: 'pendientes de aro grandes' },
  { label: 'Gargantilla', value: 'gargantilla (choker)' },
  { label: 'Gafas', value: 'gafas de moda' },
  { label: 'Gafas de sol', value: 'gafas de sol de diseño' },
  { label: 'Sombrero', value: 'sombrero de ala ancha' },
  { label: 'Reloj', value: 'reloj minimalista' }
];

const VARIANT_BATCH_OPTIONS = [1, 4];

  function getPreset(mode) {
    return VARIANT_PRESETS[mode] || VARIANT_PRESETS.traditional;
  }

  function fillSelect(selectEl, items) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    (items || []).forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      selectEl.appendChild(opt);
    });
  }

  function clothingFor(preset, gender) {
    const g = gender || 'Female';
    return (preset.clothing && (preset.clothing[g] || preset.clothing.Female)) || [];
  }

  // G2 — Looks rápidos (regex sobre opciones del modo actual)
  const LOOK_PRESETS = [
    { id: 'beach', label: '🏖️ Playa', pose: /cuerpo entero|caminando|espejo/i, attitude: /sonr|alegre|risa|natural/i, clothing: /bikini|verano|deportiv|playa|traje de baño|satén/i, setting: /playa|beach/i, accessories: ['gafas de sol de diseño'] },
    { id: 'cafe', label: '☕ Café / Oficina', pose: /sentada|medio|selfie|perfil/i, attitude: /seria|elegante|sonr|pensativa/i, clothing: /traje|oficina|blazer|casual|camisa|abrigo|seda/i, setting: /cafeter|oficina|interior|hotel/i, accessories: ['gafas de moda'] },
    { id: 'gym', label: '🏋️ Gym', pose: /cuerpo entero|espejo|caminando|de pie/i, attitude: /desafiante|empoderada|intensa|confiada|natural/i, clothing: /deportiv|leggins|gym|fitness|top|body/i, setting: /gimnasio|gym|studio/i, accessories: [] },
    { id: 'night', label: '🌃 Noche glam', pose: /apoyada|hombro|estilizada|de pie|recostada/i, attitude: /seductora|confiada|misteriosa|intensa/i, clothing: /vestido|satén|elegante|noche|corto|encaje|catsuit|corsé/i, setting: /noche|penthouse|club|calle urbana|terraza|boudoir|dormitorio/i, accessories: ['collar delicado'] },
    { id: 'studio', label: '📸 Estudio', pose: /macro|primer plano|selfie portrait|retrato|rostro/i, attitude: /seria|elegante|intensa|coquette/i, clothing: /casual|top|básic|camisa|lencería/i, setting: /estudio|studio|neón|low-key/i, accessories: [] }
  ];

  function findOptionByRegex(sel, rx) {
    if (!sel || !rx) return null;
    const opt = Array.from(sel.options).find((o) => rx.test(o.value) || rx.test(o.textContent));
    return opt ? opt.value : null;
  }

  return {
    VARIANT_PRESETS,
    VARIANT_ACCESSORIES,
    VARIANT_BATCH_OPTIONS,
    LOOK_PRESETS,
    getPreset,
    fillSelect,
    clothingFor,
    findOptionByRegex
  };
});
