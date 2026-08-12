/**
 * Photo analysis engine (UX-4 extract from app.js).
 * Pure color extraction + offline detailed JSON + field options.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPhotoAnalysis = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

function extractDominantColors(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
      const colorBuckets = {};

      for (let i = 0; i < imageData.length; i += 16) {
        const r = Math.round(imageData[i] / 32) * 32;
        const g = Math.round(imageData[i + 1] / 32) * 32;
        const b = Math.round(imageData[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        colorBuckets[key] = (colorBuckets[key] || 0) + 1;
      }

      const sorted = Object.entries(colorBuckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key]) => {
          const [r, g, b] = key.split(',').map(Number);
          return { r, g, b, hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}` };
        });

      resolve(sorted);
    };
    img.src = imageDataUrl;
  });
}

function renderColorSwatches(colors) {
  const container = document.getElementById('colorSwatchesContainer');
  container.style.display = 'block';
  const swatchesEl = document.getElementById('colorSwatches');
  swatchesEl.innerHTML = '';

  const labels = ['Dominante', 'Piel', 'Cabello', 'Fondo', 'Ropa', 'Acento', 'Sombra', 'Brillo'];
  colors.forEach((c, i) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.innerHTML = `
      <div class="color-swatch analysis-reveal delay-${Math.min(i + 1, 8)}" style="background-color: ${c.hex};" title="${c.hex}"></div>
      <div class="color-swatch-label">${labels[i] || ''}</div>
    `;
    swatchesEl.appendChild(wrapper);
  });
}

function classifySkinTone(colors) {
  if (colors.length < 2) return 'Tono medio cálido';
  const skin = colors[1];
  const brightness = (skin.r + skin.g + skin.b) / 3;
  if (brightness > 200) return 'Claro / porcelana';
  if (brightness > 170) return 'Claro cálido / beige rosado';
  if (brightness > 140) return 'Medio cálido / arena dorada';
  if (brightness > 110) return 'Medio oliva / canela';
  if (brightness > 80) return 'Moreno cálido / bronce';
  return 'Oscuro profundo / ébano';
}

function classifyHairColor(colors) {
  if (colors.length < 3) return 'Castaño medio';
  const hair = colors[2];
  const brightness = (hair.r + hair.g + hair.b) / 3;
  if (brightness > 190) return 'Rubio dorado claro';
  if (brightness > 150) return 'Castaño claro con reflejos miel';
  if (brightness > 100) return 'Castaño medio natural';
  if (brightness > 60) return 'Castaño oscuro chocolate';
  return 'Negro azabache profundo';
}

function classifyLighting(colors) {
  if (colors.length < 1) return 'Luz natural difusa';
  const dom = colors[0];
  const warmth = dom.r - dom.b;
  if (warmth > 40) return 'Luz cálida dorada, posiblemente hora dorada o ventana lateral';
  if (warmth > 15) return 'Luz natural cálida, suave y difusa desde ventana';
  if (warmth > -10) return 'Luz neutra de estudio, softbox frontal con relleno lateral';
  return 'Luz fría azulada, probablemente exterior nublado o flash directo';
}

function classifyBackground(colors) {
  if (colors.length < 4) return 'Fondo neutro desenfocado';
  const bg = colors[3];
  const brightness = (bg.r + bg.g + bg.b) / 3;
  if (brightness > 200) return 'Fondo blanco limpio / high-key';
  if (brightness > 150) return 'Fondo claro neutro, posiblemente pared beige o gris claro';
  if (brightness > 80) return 'Fondo medio, interior con profundidad de campo';
  return 'Fondo oscuro dramático / low-key';
}

function extractSpatialColorProperties(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const w = 100;
      const h = 100;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      
      const pixels = ctx.getImageData(0, 0, w, h).data;
      
      // Helper to get average RGB in a bounding box (percentages)
      function getAverageRGB(x1, y1, x2, y2) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        const startX = Math.floor(x1 * w / 100);
        const endX = Math.floor(x2 * w / 100);
        const startY = Math.floor(y1 * h / 100);
        const endY = Math.floor(y2 * h / 100);
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * w + x) * 4;
            rSum += pixels[idx];
            gSum += pixels[idx + 1];
            bSum += pixels[idx + 2];
            count++;
          }
        }
        if (count === 0) return { r: 128, g: 128, b: 128, hex: '#808080' };
        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        return { r, g, b, hex };
      }
      
      // 1. Face/Skin zone: Center of the image
      const skinColor = getAverageRGB(40, 35, 60, 55);
      
      // 2. Hair zone: Sides of the head (left & right) and top of the head
      const leftHair = getAverageRGB(15, 25, 30, 50);
      const rightHair = getAverageRGB(70, 25, 85, 50);
      const topHair = getAverageRGB(35, 10, 65, 22);
      
      // Average the hair samples
      const hairR = Math.round((leftHair.r + rightHair.r + topHair.r) / 3);
      const hairG = Math.round((leftHair.g + rightHair.g + topHair.g) / 3);
      const hairB = Math.round((leftHair.b + rightHair.b + topHair.b) / 3);
      const hairColor = {
        r: hairR,
        g: hairG,
        b: hairB,
        hex: `#${hairR.toString(16).padStart(2, '0')}${hairG.toString(16).padStart(2, '0')}${hairB.toString(16).padStart(2, '0')}`
      };
      
      // 3. Background zone: Top corners
      const tlBg = getAverageRGB(0, 0, 15, 15);
      const trBg = getAverageRGB(85, 0, 100, 15);
      const bgR = Math.round((tlBg.r + trBg.r) / 2);
      const bgG = Math.round((tlBg.g + trBg.g) / 2);
      const bgB = Math.round((tlBg.b + trBg.b) / 2);
      const bgColor = {
        r: bgR,
        g: bgG,
        b: bgB,
        hex: `#${bgR.toString(16).padStart(2, '0')}${bgG.toString(16).padStart(2, '0')}${bgB.toString(16).padStart(2, '0')}`
      };
      
      resolve({ skinColor, hairColor, bgColor });
    };
    img.src = imageDataUrl;
  });
}

function classifySkinToneColor(c) {
  // Aligned with server-side bands — prefer "clara" before medium to avoid morena drift
  const brightness = (c.r + c.g + c.b) / 3;
  const warmth = c.r - c.b;
  if (brightness >= 205) return 'Tez muy clara / porcelana';
  if (brightness >= 175) return 'Tez clara / beige claro';
  if (brightness >= 155) return 'Tez clara cálida / arena clara';
  if (brightness >= 130) {
    if (warmth > 30) return 'Tez media cálida / oliva clara';
    return 'Tez media neutra';
  }
  if (brightness >= 90) return 'Tez bronceada media / canela';
  return 'Tez morena oscura / ébano';
}

function classifyHairColorRGB(c) {
  const brightness = (c.r + c.g + c.b) / 3;
  // Blonde: high green and red, lower blue (yellow shade)
  if (brightness > 125 && c.r > 130 && c.g > 110 && c.b < 120) {
    if (c.r - c.b > 45) return 'Rubio dorado cálido';
    return 'Rubio ceniza';
  }
  // Redhead: high red, lower green and blue
  if (c.r > 110 && c.r - c.g > 20 && c.g - c.b > 5) {
    return 'Pelirrojo cobrizo natural';
  }
  // Grey/White: very balanced, high brightness
  if (brightness > 150 && Math.abs(c.r - c.g) < 12 && Math.abs(c.g - c.b) < 12) {
    return 'Gris plateado / canoso';
  }
  // Brown categories
  if (brightness > 90) return 'Castaño claro';
  if (brightness > 45) return 'Castaño oscuro chocolate';
  return 'Negro azabache';
}

async function generateDetailedJSON(imageDataUrl, colors, opts) {
  opts = opts || {};
  // Extract spatial color properties (skin, hair, background)
  let spatial = {
    skinColor: { r: 200, g: 170, b: 150, hex: '#c8aa96' },
    hairColor: { r: 74, g: 55, b: 40, hex: '#4a3728' },
    bgColor: { r: 160, g: 160, b: 160, hex: '#a0a0a0' }
  };
  try {
    spatial = await extractSpatialColorProperties(imageDataUrl);
  } catch (e) {
    console.warn("Failed to extract spatial color properties, using dominants:", e);
  }

  const skinTone = classifySkinToneColor(spatial.skinColor);
  const hairColor = classifyHairColorRGB(spatial.hairColor);
  const lightingType = classifyLighting(colors);
  const backgroundDesc = classifyBackground(colors);

  const skinHex = spatial.skinColor.hex;
  const hairHex = spatial.hairColor.hex;
  const dominantHex = colors[0]?.hex || '#a08070';

  return {
    identity: {
      name: "Nuevo Influencer",
      gender: "Femenino",
      apparent_age: "22-28 años",
      ethnicity_appearance: skinTone.includes('oliva') || skinTone.includes('arena') ? 'Latina / Mediterránea' : skinTone.includes('porcelana') ? 'Caucásica / Nórdica' : skinTone.includes('bronce') || skinTone.includes('ébano') ? 'Afrodescendiente / Mixta' : 'Mixta / Universal',
      body_type: "Atlético / Proporcionado",
      persona_archetype: "Lifestyle & Bienestar"
    },
    facial_features: {
      face_shape: "Ovalada con ángulos suaves",
      skin_tone: skinTone,
      skin_tone_hex: skinHex,
      skin_texture: "Piel suave y uniforme con poros y pecas muy sutiles",
      eye_color: "Marrón cálido con destellos ámbar",
      eye_shape: "Almendrados, ligeramente rasgados",
      eyebrow_style: `Cejas pobladas naturales que armonizan con tono ${hairColor}`,
      nose_shape: "Nariz recta proporcionada con punta ligeramente redondeada",
      lip_shape: "Labios medianos con arco de cupido definido",
      lip_color: "Rosa natural con tono cálido melocotón",
      jawline: "Mandíbula suave y femenina con mentón redondeado",
      cheekbones: "Pómulos moderadamente altos con rubor natural",
      facial_hair: "Ninguno",
      distinctive_marks: "Sin marcas distintivas visibles",
      smile_type: "Sonrisa cálida y accesible, dientes alineados"
    },
    hair: {
      color: hairColor,
      color_hex: hairHex,
      length: "Largo, por debajo de los hombros",
      texture: "Ondulado natural con cuerpo y movimiento orgánico",
      style: "Suelto y sin esfuerzo, con raya al centro ligeramente descentrada",
      parting: "Centro o ligeramente lateral izquierdo",
      highlights: "Reflejos naturales por el sol en las puntas",
      volume: "Volumen medio con cuerpo saludable"
    },
    aesthetic: {
      overall_vibe: "Natural, fresca, accesible y aspiracional",
      fashion_style: "Casual chic con piezas de calidad minimalista",
      color_palette_dominant: dominantHex,
      color_palette_description: `Paleta cálida centrada en ${dominantHex}, armonizando con tonos tierra y neutros suaves`,
      makeup_level: "Maquillaje mínimo o 'no-makeup makeup': base ligera, rubor, máscara, gloss natural",
      accessories: "Aretes pequeños dorados, posible collar delicado, reloj minimalista",
      nails: "Uñas naturales cortas con tono nude o transparente"
    },
    photography: {
      camera_lens: "iPhone 15 Pro front camera selfie",
      focal_length: "24mm (equivalente en celular)",
      aperture: "f/1.9 (cámara frontal de celular)",
      lighting_type: lightingType,
      lighting_direction: "Luz natural frontal-lateral directa",
      color_grade: "Aspecto natural sin filtros, balance de blancos automático de celular",
      color_temperature: "5500-6000K (luz natural de día)",
      depth_of_field: "Profundidad de campo típica de celular, fondo ligeramente legible",
      background_setting: backgroundDesc,
      background_blur: "Desenfoque natural de lente de celular (sin bokeh exagerado)",
      composition: "Sujeto centrado en plano de autorretrato (selfie)",
      framing: "Plano medio-corto (selfie de brazo extendido), crop 4:5 para Instagram",
      mood: "Casual, espontáneo, cotidiano y auténtico",
      post_processing: "Foto RAW móvil sin filtros, aspecto amateur natural"
    },
    clothing: {
      type: "Top de tejido suave o blusa casual elegante",
      color: "Tonos neutros cálidos: crema, beige, blanco roto, terracota suave",
      material: "Algodón orgánico, lino o punto fino",
      neckline: "Cuello redondo o V abierto casual",
      fit: "Semi-ajustado, silueta relajada y halagadora",
      visible_brand_logos: "Ninguno (estética clean sin branding visible)"
    },
    anchor_reference: opts.anchorReference || null,
    generation_prompt: ""
  };
}

const ANALYSIS_FIELD_OPTIONS = {
  identity: {
    gender: ["Femenino", "Masculino", "No binario / Andrógino"],
    apparent_age: ["18-22 años", "22-28 años", "28-35 años", "35-45 años", "45+ años"],
    ethnicity_appearance: ["Latina / Mediterránea", "Caucásica / Nórdica", "Afrodescendiente / Mixta", "Asiática / Oriental", "Mixta / Universal"],
    body_type: ["Atlético / Proporcionado", "Esbelto / Delgado", "Curvilíneo / Reloj de arena", "Musculoso / Fit", "Plus size / Curvy"],
    persona_archetype: ["Lifestyle & Bienestar", "Fitness & Nutrición", "Moda & Belleza", "Tecnología & Gadgets", "Negocios & Finanzas", "Viajes & Aventura"]
  },
  facial_features: {
    face_shape: ["Ovalada con ángulos suaves", "Redonda y accesible", "Cuadrada con mandíbula marcada", "Corazón / Triángulo invertido", "Alargada / Rectangular"],
    skin_tone: ["Claro / porcelana", "Claro cálido / beige rosado", "Medio cálido / arena dorada", "Medio oliva / canela", "Moreno cálido / bronce", "Oscuro profundo / ébano"],
    skin_texture: [
      "Piel suave y uniforme, acabado semi-mate con luminosidad natural",
      "Textura mate impecable, sin poros visibles",
      "Acabado dewy / jugoso ultra hidratado",
      "Textura natural con sutiles imperfecciones realistas"
    ],
    eye_color: ["Marrón cálido con destellos ámbar", "Marrón oscuro profundo", "Verde oliva / avellana", "Azul cristalino / grisáceo", "Miel / ámbar claro"],
    eye_shape: ["Almendrados, ligeramente rasgados", "Grandes y redondos", "Encapotados / Hooded", "Caídos / Downturned", "Rasgados / Monolid"],
    eyebrow_style: [
      "Cejas naturales pobladas con arco suave, sin exceso de maquillaje",
      "Cejas definidas y depiladas con arco marcado",
      "Cejas delgadas y estilizadas",
      "Cejas laminadas / bushy modernas"
    ],
    nose_shape: ["Nariz recta proporcionada con punta ligeramente redondeada", "Nariz respingada con puente delgado", "Nariz ancha / chata con personalidad", "Nariz aguileña / fuerte perfilada"],
    lip_shape: ["Labios medianos con arco de cupido definido", "Labios carnosos y simétricos", "Labio superior delgado, inferior más grueso", "Labios finos y estilizados"],
    lip_color: ["Rosa natural con tono cálido melocotón", "Nude rosado mate", "Rojo clásico satinado", "Brillo transparente natural", "Tono ciruela / malva natural"],
    jawline: ["Mandíbula suave y femenina con mentón redondeado", "Mandíbula definida y angular", "Mentón prominente / barbilla fuerte", "Línea de mandíbula sutil y difusa"],
    cheekbones: ["Pómulos moderadamente altos con rubor natural", "Pómulos muy esculpidos e iluminados", "Mejillas redondeadas y juveniles", "Pómulos sutiles y planos"],
    facial_hair: ["Ninguno", "Barba de 3 días bien recortada", "Barba completa y arreglada", "Bigote estilizado"],
    distinctive_marks: ["Sin marcas distintivas visibles", "Pecas sutiles en mejillas y nariz", "Lunar característico cerca del ojo", "Lunar cerca del labio"],
    smile_type: ["Sonrisa cálida y accesible, dientes alineados", "Sonrisa sutil de labios cerrados", "Expresión seria / neutral de alta costura", "Sonrisa amplia y expresiva mostrando dientes"]
  },
  hair: {
    color: [
      "Castaño medio natural",
      "Castaño oscuro chocolate",
      "Rubio dorado claro",
      "Castaño claro con reflejos miel",
      "Negro azabache profundo",
      "Pelirrojo cobrizo / naranja natural",
      "Rubio platino / cenizo"
    ],
    length: ["Medio-largo, por debajo de los hombros", "Corto estilo pixie", "Bob clásico a la barrailla", "Largo por la cintura", "Rapado / rapado lateral"],
    texture: ["Ondulado natural con movimiento orgánico", "Liso sedoso impecable", "Rizado con bucles definidos (tipo afro/kinky)", "Ligeramente ondulado / despeinado de playa"],
    style: ["Suelto y sin esfuerzo, con raya al centro ligeramente descentrada", "Recogido en moño alto desenfadado (messy bun)", "Media cola elegante", "Cola de caballo alta y pulida", "Trenzas estilizadas"],
    parting: ["Centro o ligeramente lateral izquierdo", "Raya lateral profunda a la derecha", "Raya lateral profunda a la izquierda", "Sin raya definida, peinado hacia atrás"],
    highlights: ["Reflejos naturales por el sol en las puntas", "Balayage sutil en tonos miel", "Luces completas (babylights)", "Sin reflejos, color entero sólido"],
    volume: ["Volumen medio con cuerpo saludable", "Volumen alto, cabello denso y con rebote", "Volumen bajo, cabello fino y lacio"]
  },
  aesthetic: {
    overall_vibe: ["Natural, fresca, accesible y aspiracional", "Glow urbano, moderno y fashionista", "Minimalista, nórdico y limpio", "Cozy, otoñal y hogareño", "Atlético, enérgico y motivador", "Premium, lujoso y sofisticado"],
    fashion_style: ["Casual chic con piezas de calidad minimalista", "Athleisure deportivo y cómodo", "Estilo boho chic relajado", "Business casual moderno", "Streetwear vanguardista con capas"],
    makeup_level: [
      "Maquillaje mínimo o 'no-makeup makeup': base ligera, rubor, máscara, gloss natural",
      "Sin maquillaje, cara lavada limpia",
      "Maquillaje de noche: delineado marcado y labios intensos",
      "Maquillaje de estudio: piel mate perfecta y contorno suave"
    ],
    accessories: ["Aretes pequeños dorados, posible collar delicado, reloj minimalista", "Gafas de sol de diseño, pendientes de aro", "Sin accesorios", "Sombrero de ala ancha, anillos apilados", "Auriculares inalámbricos modernos"],
    nails: ["Uñas naturales cortas con tono nude o transparente", "Manicura francesa clásica", "Uñas rojas intensas almendradas", "Uñas oscuras / negras cortas", "Sin pintar, uñas cortas y limpias"]
  },
  photography: {
    camera_lens: [
      "iPhone 15 Pro front camera selfie",
      "Amateur smartphone mirror selfie, camera lens visible",
      "Candid hand-held smartphone snapshot",
      "Close-up raw portrait shot on iPhone 15",
      "iPhone/Smartphone portrait mode photo",
      "Casual snapchat-style photo"
    ],
    focal_length: ["50mm", "85mm", "35mm", "24mm", "105mm"],
    aperture: ["f/1.8 - f/2.8 (bokeh suave)", "f/1.4 (bokeh ultra cremoso, fondo muy desenfocado)", "f/4.0 (mayor nitidez del fondo)", "f/8.0 (todo enfocado)"],
    lighting_type: [
      "Luz natural cálida, suave y difusa desde ventana",
      "Luz cálida dorada, posiblemente hora dorada o ventana lateral",
      "Luz neutra de estudio, softbox frontal con relleno lateral",
      "Luz fría azulada, probablemente exterior nublado o flash directo",
      "Luz de estudio tipo anillo (ring light) con reflejo circular en ojos",
      "Moody cinematic lighting con fuerte contraste y sombras marcadas",
      "Luz natural difusa"
    ],
    lighting_direction: ["Lateral 45° con relleno suave frontal", "Contraluz (backlight) con halo de luz en cabello", "Luz cenital suave (cenital)", "Luz frontal directa y plana", "Luz lateral dramática (rembrandt)"],
    color_grade: [
      "Tono cálido dorado con sombras suaves desaturadas",
      "Tono frío y limpio con blancos puros",
      "Filtro vintage analógico con tonos mate y grano sutil",
      "Colores vibrantes y saturados con alto contraste",
      "Cinematográfico desaturado con verdes azulados en sombras"
    ],
    color_temperature: ["5200-5800K (luz de día cálida)", "6000-6500K (luz fría / nublado)", "3200-4000K (luz cálida interior tungsteno)", "5500K (flash neutro)"],
    depth_of_field: ["Bokeh pronunciado, sujeto nítido, fondo desenfocado f/2.0", "Profundidad de campo completa, sujeto y fondo enfocados", "Fondo sutilmente desenfocado, plano medio legible"],
    background_setting: [
      "Fondo claro neutro, posiblemente pared beige o gris claro",
      "Fondo blanco limpio / high-key",
      "Fondo oscuro dramático / low-key",
      "Fondo medio, interior con profundidad de campo",
      "Fondo neutro desenfocado",
      "Sala de estar moderna y minimalista con plantas de interior",
      "Cocina de concepto abierto iluminada, con encimera de mármol",
      "Exterior urbano desenfocado (calles de la ciudad con luces)",
      "Fondo de naturaleza / follaje verde desenfocado (parque)"
    ],
    background_blur: ["Desenfoque gaussiano medio-alto (bokeh circular)", "Sin desenfoque, fondo nítido", "Desenfoque extremo (bokeh pictórico)"],
    composition: ["Regla de tercios, sujeto ligeramente descentrado a la izquierda", "Sujeto perfectamente centrado (simétrico)", "Primer plano encuadrado de cerca (close-up)", "Plano medio americano"],
    framing: ["Plano medio-corto (pecho hacia arriba), crop 4:5 para Instagram", "Primer plano facial (headshot)", "Plano medio-largo (cintura para arriba)", "Plano general de cuerpo completo"],
    mood: ["Cálido, íntimo, accesible y aspiracional", "Profesional, serio, corporativo", "Misterioso, sofisticado, melancólico", "Aventurero, enérgico, libre"],
    post_processing: ["Ligero retoque de piel, realce de ojos, grano de película sutil", "Procesado digital limpio sin grano", "Estilo vintage Kodak Portra con grano medio", "Sin postprocesado visible"]
  },
  clothing: {
    type: [
      "Top de tejido suave o blusa casual elegante",
      "Suéter de punto cuello de tortuga",
      "Camiseta básica de algodón de alta calidad",
      "Camisa de lino holgada",
      "Sudadera con capucha minimalista (hoodie)",
      "Blazer casual bien estructurado"
    ],
    color: ["Tonos neutros cálidos: crema, beige, blanco roto, terracota suave", "Negro absoluto minimalista", "Blanco óptico limpio", "Gris melange suave", "Verde oliva / verde bosque apagado", "Azul marino clásico"],
    material: ["Algodón orgánico, lino o punto fino", "Lana de punto grueso o cachemira", "Mezclilla o lona lavada", "Seda o satén sutil", "Tejido sintético deportivo"],
    neckline: ["Cuello redondo o V abierto casual", "Cuello de tortuga / mock neck", "Cuello camisero ligeramente desabrochado", "Escote barco elegante"],
    fit: ["Semi-ajustado, silueta relajada y halagadora", "Ajustado / fit", "Oversized / silueta holgada moderna"],
    visible_brand_logos: ["Ninguno (estética clean sin branding visible)", "Logotipo pequeño y discreto en el pecho", "Estampado gráfico frontal completo"]
  }
};

  return {
    extractDominantColors,
    extractSpatialColorProperties,
    classifySkinTone,
    classifyHairColor,
    classifyLighting,
    classifyBackground,
    classifySkinToneColor,
    classifyHairColorRGB,
    generateDetailedJSON,
    ANALYSIS_FIELD_OPTIONS
  };
});
