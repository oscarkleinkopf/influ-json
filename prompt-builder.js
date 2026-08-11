/**
 * Prompt + character_lock builders (PLAN W5b).
 * UMD: Node (tests) y navegador (app.js).
 * IP central del producto — identidad consistente sin face-lock de pago.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InfluPromptBuilder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Unwrap double-encoded detailedJSON and reject char-index corruption. */
  function parseDetailedJSON(raw) {
    let v = raw;
    let guard = 0;
    while (typeof v === 'string' && guard < 5) {
      const t = v.trim();
      if (!t) return {};
      try {
        v = JSON.parse(t);
        guard++;
      } catch (_) {
        break;
      }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const keys = Object.keys(v);
    // Reject Object.keys(string) disaster: {"0":"{","1":"\"",...}
    if (keys.length > 40 && keys.every((k) => /^\d+$/.test(k))) {
      try {
        const rejoined = keys
          .map(Number)
          .sort((a, b) => a - b)
          .map((k) => v[String(k)])
          .join('');
        return parseDetailedJSON(rejoined);
      } catch (_) {
        return {};
      }
    }
    return v;
  }

  function isRealPersonaObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (!keys.length) return false;
    if (keys.length > 40 && keys.every((k) => /^\d+$/.test(k))) return false;
    return !!(obj.identity || obj.facial_features || obj.body || obj.hair || keys.length <= 30);
  }

  /**
   * Character lock card — for free chatbots without paid face-lock APIs.
   * @param {object} base — persona detailedJSON-shaped object (mutated)
   * @param {{ nicheId?: string|null, nicheExtras?: object|null }} [opts]
   */
  function assembleCharacterLock(base, opts = {}) {
    if (!base || typeof base !== 'object') return base;
    const skinTone = base.facial_features?.skin_tone || '';
    const skinHex = base.facial_features?.skin_tone_hex || '';
    base.character_lock = {
      version: 1,
      free_tier: true,
      purpose:
        'Mantener la misma persona en chatbots gratuitos y en Pollinations sin APIs de face-lock de pago',
      niche: opts.nicheId || null,
      must_match_every_image: {
        name: base.identity?.name,
        gender: base.identity?.gender,
        age: base.identity?.apparent_age,
        ethnicity: base.identity?.ethnicity_appearance,
        face_shape: base.facial_features?.face_shape,
        eye_color: base.facial_features?.eye_color,
        eye_shape: base.facial_features?.eye_shape || null,
        eyebrows: base.facial_features?.eyebrow_style || base.facial_features?.eyebrows,
        nose: base.facial_features?.nose_shape || null,
        lips: base.facial_features?.lip_shape || base.facial_features?.lips,
        jawline: base.facial_features?.jawline || null,
        skin_tone: skinTone,
        skin_tone_hex: skinHex,
        distinctive_marks: base.facial_features?.distinctive_marks || null,
        hair_color: base.hair?.color,
        hair_color_hex: base.hair?.color_hex || null,
        hair_texture: base.hair?.texture,
        hair_length: base.hair?.length,
        body_type: base.body?.body_type || base.identity?.body_type,
        height: base.body?.height_appearance || null,
        proportions: base.body?.proportions || null,
        posture: base.body?.posture || null
      },
      may_vary_per_image: [
        'pose',
        'expression_within_character',
        'clothing',
        'setting_background',
        'camera_angle',
        'product_in_hand'
      ],
      never_do: [
        'Cambiar tono de piel o etnia aparente',
        'Cambiar forma de rostro, ojos, nariz o mandíbula',
        'Edad muy distinta',
        'Cuerpo con proporciones distintas',
        'Estilo 3D/CGI/anime si el JSON pide UGC real'
      ],
      free_chatbot_system: `Eres un generador de UGC. Debes mantener SIEMPRE la misma persona definida en character_lock.must_match_every_image. Solo puedes variar: ${['pose', 'ropa', 'fondo', 'expresión suave', 'producto'].join(', ')}. Si el usuario pide bikini, spicy o cuerpo entero, cambia ropa/pose/encuadre pero NUNCA la cara ni la tez (${skinTone}${skinHex ? ' ' + skinHex : ''}). Estilo: foto amateur de smartphone, no cine.`
    };

    const niche = opts.nicheExtras;
    if (niche?.lockExtras) {
      base.character_lock.niche = niche.lockExtras.niche || niche.id;
      base.character_lock.brand_voice = niche.lockExtras.brand_voice;
      base.character_lock.recommended_packs = niche.lockExtras.recommended_packs;
      base.niche = niche.id;
      base.brand_niche = niche.label;
    }

    delete base.generation_prompt;
    delete base.anchor_reference;
    return base;
  }

  /**
   * Shared face/body identity block used by BOTH traditional and spicy variants.
   */
  function buildIdentityLockBlock(persona, detailed, skin) {
    const f = detailed?.facial_features || {};
    const h = detailed?.hair || {};
    const b = detailed?.body || {};
    const genderWord = persona?.gender === 'Male' ? 'male' : 'female';
    const age = detailed?.identity?.apparent_age || persona?.age || '25 años';
    let ethnicity = detailed?.identity?.ethnicity_appearance || persona?.ethnicity || 'Latina';
    const blondeHair = /rubio|blonde|platino/i.test(
      `${detailed?.hair?.color || ''} ${persona?.hair || ''} ${detailed?.character_lock?.must_match_every_image?.hair_color || ''}`
    );
    // Fair + blonde inspiration: "Latina" biases models toward dark hair — use Caucasian.
    if (skin?.isLight && blondeHair && /latina/i.test(ethnicity)) {
      ethnicity = 'Caucásica / Europea de tez clara';
    } else if (skin?.isLight && /latina/i.test(ethnicity) && !/clara|fair|light|cauc/i.test(ethnicity)) {
      ethnicity = `${ethnicity} de tez clara`;
    }

    const faceBits = [
      f.face_shape && `${f.face_shape} face shape`,
      f.eye_color && `${f.eye_color} eyes`,
      f.eye_shape && `${f.eye_shape} eye shape`,
      (f.eyebrow_style || f.eyebrows) && `${f.eyebrow_style || f.eyebrows}`,
      (f.lip_shape || f.lips) && `${f.lip_shape || f.lips}`,
      f.nose_shape && `${f.nose_shape} nose`,
      f.jawline && `${f.jawline} jawline`,
      f.cheekbones && `${f.cheekbones}`,
      f.smile_type && `${f.smile_type}`,
      f.distinctive_marks &&
        f.distinctive_marks !== 'Ninguno' &&
        `marks: ${f.distinctive_marks}`
    ]
      .filter(Boolean)
      .join(', ');

    const hairBits = [h.color || '', h.texture || '', h.length || '', h.style || '']
      .filter(Boolean)
      .join(' ');
    const hairHex = h.color_hex ? ` hair hex ${h.color_hex}` : '';

    const bodyBits = [
      b.body_type || detailed?.identity?.body_type,
      b.height_appearance,
      b.proportions,
      b.posture,
      b.fitness_level
    ]
      .filter(Boolean)
      .join(', ');

    const skinClause = [
      `${skin.tone} skin`,
      skin.hex && `exact skin hex ${skin.hex}`,
      skin.lock,
      skin.avoid && `avoid: ${skin.avoid}`,
      skin.isLight && 'NOT dark, NOT deep tan, NOT morena'
    ]
      .filter(Boolean)
      .join(', ');

    return {
      age,
      ethnicity,
      genderWord,
      faceBits,
      hairBits,
      hairHex,
      bodyBits,
      skinClause,
      name: persona?.name || detailed?.identity?.name || 'Influencer'
    };
  }

  /**
   * Resolve skin for generation prompts. Never trust weak labels like "Tono Natural"
   * when DB/hex already say fair/light — that caused spicy variants to darken.
   */
  function resolveSkinForPrompt(detailedLive, persona) {
    const stored = parseDetailedJSON(persona?.detailedJSON);
    const liveF = detailedLive?.facial_features || {};
    const storedF = stored.facial_features || {};

    let tone = liveF.skin_tone || storedF.skin_tone || '';
    let hex = liveF.skin_tone_hex || storedF.skin_tone_hex || '';
    let lock = liveF.skin_lock || storedF.skin_lock || '';
    let avoid = liveF.skin_avoid || storedF.skin_avoid || '';

    if (!tone || /^tono natural$/i.test(tone.trim()) || /^natural$/i.test(tone.trim())) {
      if (storedF.skin_tone && !/^tono natural$/i.test(storedF.skin_tone)) {
        tone = storedF.skin_tone;
      }
      if (storedF.skin_tone_hex) hex = storedF.skin_tone_hex;
    }

    let band = null;
    if (hex) {
      const m = String(hex).replace('#', '');
      if (m.length === 6) {
        const r = parseInt(m.slice(0, 2), 16);
        const g = parseInt(m.slice(2, 4), 16);
        const b = parseInt(m.slice(4, 6), 16);
        const brightness = (r + g + b) / 3;
        if (brightness >= 205) band = 'very_light';
        else if (brightness >= 175) band = 'light';
        else if (brightness >= 155) band = 'light_warm';
        else if (brightness >= 130) band = 'medium_light';
        else if (brightness >= 95) band = 'medium_dark';
        else band = 'dark';
      }
    }

    const isLight =
      band === 'very_light' ||
      band === 'light' ||
      band === 'light_warm' ||
      /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory|pálid/i.test(tone);

    if (isLight && (!tone || /^tono natural$/i.test(tone))) {
      tone = 'Piel clara / beige claro';
    }
    if (isLight && !hex) hex = '#f0d5c0';
    if (isLight && !lock) lock = 'fair light beige complexion, pale warm ivory';
    if (isLight && !avoid) avoid = 'dark skin, deep tan, morena, brown skin, ebony, bronzed filter';

    return { tone, hex, lock, avoid, isLight, band };
  }

  /** Prompt from vision/analysis detailedJSON (save-as-persona / preview). */
  function buildPromptFromAnalysis(data) {
    const p = data?.photography || {};
    const i = data?.identity || {};
    const f = data?.facial_features || {};
    const h = data?.hair || {};
    const c = data?.clothing || {};
    const b = data?.body || {};

    const skinTone = f.skin_tone || 'Piel clara';
    const skinHexVal = f.skin_tone_hex || '';
    const hairHex = h.color_hex ? ` Exact hair color ${h.color_hex}.` : '';
    const bodyType = b.body_type || i.body_type || '';
    const bodyBits = [
      bodyType && `${bodyType} body`,
      b.height_appearance,
      b.proportions && `proportions: ${b.proportions}`,
      b.posture && `posture: ${b.posture}`,
      b.fitness_level,
      b.skin_continuity
    ]
      .filter(Boolean)
      .join(', ');

    const isLight = /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory/i.test(
      skinTone
    );
    let ethnicity = i.ethnicity_appearance || '';
    if (isLight && /latina/i.test(ethnicity) && !/clara|fair|light/i.test(ethnicity)) {
      ethnicity = `${ethnicity} de tez clara`;
    }
    const skinLock = f.skin_lock || (isLight ? 'fair light complexion' : '');
    const skinAvoid = f.skin_avoid || (isLight ? 'dark skin, deep tan, morena, bronzed filter' : '');
    const skinClause = [
      `${skinTone} skin`,
      skinHexVal && `exact skin hex ${skinHexVal}`,
      skinLock,
      skinAvoid && `avoid: ${skinAvoid}`
    ]
      .filter(Boolean)
      .join(', ');

    return (
      `Amateur casual UGC style photo, ${p.camera_lens || 'iPhone front camera'}, medium shot with face AND upper body visible. A ${i.apparent_age || '25'} ${ethnicity} ${i.gender || 'female'} influencer with ${h.color || ''} ${h.texture || ''} hair, ${skinClause}, ${f.eye_color || ''} eyes, ${f.eyebrow_style || ''}, ${f.lip_shape || ''}, ${f.face_shape || ''} face. ` +
      `Full-body identity: ${bodyBits || 'proportioned natural body silhouette'}. ` +
      `${hairHex} ` +
      `Wearing ${c.type || ''} in ${c.color || ''} that fits the body naturally. ` +
      `Background: ${p.background_setting || 'casual indoor room'}. ` +
      `${p.lighting_type || 'daylight from window'}, ${p.color_grade || 'natural unedited colors'}, ` +
      `raw mobile snapshot quality, natural skin texture on face neck and arms, no filters, unedited mobile photo. Same person in all shots, consistent facial AND body identity AND skin lightness, visible shoulders torso and posture. SKIN LOCK (critical): keep ${skinTone}${skinHexVal ? ' ' + skinHexVal : ''}.`
    );
  }

  /**
   * Prompt from live form fields (Persona Engine compile).
   * @param {object} fields — flat form values + optional hex/lock from detailedJSON
   */
  function buildFormPrompt(fields) {
    const f = fields || {};
    const skinTone = f.skinTone || '';
    const skinHex = f.skinHex || '';
    const ethnicity = f.ethnicity || '';
    const gender = f.gender || 'Female';

    const isLightSkin =
      /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory|pálid/i.test(skinTone) ||
      (skinHex &&
        (() => {
          const m = String(skinHex).replace('#', '');
          if (m.length !== 6) return false;
          const r = parseInt(m.slice(0, 2), 16);
          const g = parseInt(m.slice(2, 4), 16);
          const b = parseInt(m.slice(4, 6), 16);
          return (r + g + b) / 3 >= 155;
        })());
    const ethnicitySafe =
      isLightSkin && /latina/i.test(ethnicity) && !/clara|fair|light/i.test(ethnicity)
        ? `${ethnicity} de tez clara`
        : ethnicity;
    const skinClause = [
      `${skinTone} skin`,
      skinHex && `exact skin hex ${skinHex}`,
      f.skinLock || (isLightSkin ? 'fair light complexion' : ''),
      isLightSkin ? 'NOT dark skin, NOT deep tan, NOT morena, NOT bronzed filter' : '',
      f.skinAvoid && `avoid: ${f.skinAvoid}`
    ]
      .filter(Boolean)
      .join(', ');
    const hexHint = f.hairHex ? ` Exact hair color ${f.hairHex}.` : '';

    const bodyClause = [
      f.bodyType && `${f.bodyType} body build`,
      f.height && f.height,
      f.proportions && `body proportions: ${f.proportions}`,
      f.posture && `posture: ${f.posture}`,
      f.fitness && f.fitness,
      f.bodySkin && f.bodySkin
    ]
      .filter(Boolean)
      .join(', ');

    return `Amateur casual UGC style, ${f.camera || 'iPhone'}, medium shot showing face AND upper body. A ${f.age || '25'} ${ethnicitySafe} ${String(gender).toLowerCase()} influencer with ${f.hairColor || ''} ${f.hairTexture || ''} ${f.hairLength || ''} hair, ${skinClause}, ${f.eyeColor || ''} eyes, ${f.eyebrows || ''}, ${f.lips || ''}, ${f.faceShape || ''} face, ${f.smileType || ''}. Full-body identity: ${bodyClause}.${hexHint} Wearing ${f.clothing || ''} that fits the body type naturally. Background is a ${f.setting || 'neutral'}. ${f.lighting || 'natural light'}, raw photo format, unedited, shot on smartphone camera, natural skin texture on face neck and arms, realistic imperfections. Same person in all shots, consistent facial AND body identity AND skin lightness, visible shoulders torso posture and silhouette. SKIN LOCK (critical): keep the same light/dark level as ${skinTone}${skinHex ? ' ' + skinHex : ''}.`;
  }

  /** Detect shot framing from pose text. */
  function detectVariantFraming(poseText) {
    const pose = String(poseText || '');
    if (
      /full\s*body|full-body|cuerpo entero|head to toe|head-to-toe|mirror selfie|standing full|wide shot|plano entero|de pie modelando|model pose|walking toward|feet to head|shoes to/i.test(
        pose
      )
    ) {
      return 'fullbody';
    }
    if (
      /primer plano|close-up|selfie portrait|macro beauty|face only|headshot|rostro(?!.*cuerpo)/i.test(
        pose
      )
    ) {
      return 'portrait';
    }
    return 'medium';
  }

  /**
   * Full variant prompt (traditional + spicy share identity pipeline).
   * @param {{ id: object, skin: object, pose: string, attitude: string, clothing: string, setting: string, framing?: string, hairFallback?: string }} opts
   */
  function buildVariantPrompt(opts) {
    const id = opts.id || {};
    const skin = opts.skin || {};
    const pose = opts.pose || '';
    const attitude = opts.attitude || '';
    const clothing = opts.clothing || '';
    const setting = opts.setting || '';
    const framing = opts.framing || detectVariantFraming(pose);

    const isOutdoor =
      /playa|beach|parque|park|terraza|rooftop|calle|street|piscina|pool|bosque|forest/i.test(
        setting
      );
    const lightClause = isOutdoor
      ? 'natural outdoor daylight, same skin lightness as reference (no over-bronze)'
      : 'soft realistic practical lighting, same skin lightness as reference';

    const framingLead =
      framing === 'fullbody'
        ? 'FULL BODY PHOTO, vertical 3:4, subject completely visible from shoes to hair, camera stepped back 3 meters, environment around feet and head, wide shot.'
        : framing === 'portrait'
          ? 'Natural square portrait photo, face and shoulders, unstretched face.'
          : 'Medium shot photo, head to mid-thigh, square-friendly composition.';

    const framingClause =
      framing === 'fullbody'
        ? 'FRAMING LOCK: head-to-toe in frame, feet on ground, full legs torso arms head visible with margin. NOT close-up, NOT headshot, NOT waist crop.'
        : framing === 'portrait'
          ? 'FRAMING: close-medium on face and shoulders.'
          : 'FRAMING: medium shot, head to mid-thigh.';

    return [
      framingLead,
      framingClause,
      `IDENTITY LOCK (same person as ${id.name} — match face DNA even if camera is far):`,
      `A real ${id.age} ${id.ethnicity} ${id.genderWord} human influencer named ${id.name}.`,
      `Face (must match): ${id.faceBits || 'consistent facial structure'}.`,
      `Hair: ${id.hairBits || opts.hairFallback || 'consistent hair'}.${id.hairHex || ''}`,
      `Skin: ${id.skinClause}. SKIN LOCK: ${skin.tone}${skin.hex ? ' ' + skin.hex : ''}.`,
      `Body: ${id.bodyBits || 'natural proportional body'}.`,
      `Expression/attitude: ${attitude}.`,
      `Pose: ${pose}.`,
      `Wearing: ${clothing}.`,
      `Background/location: ${setting}.`,
      lightClause + '.',
      'Photorealistic amateur UGC smartphone photo, real fabric, natural skin pores, raw unedited iPhone look.',
      'PROPORTIONS: natural anatomy, correct head size relative to body, NOT elongated face, NOT stretched body.',
      framing === 'fullbody'
        ? 'CRITICAL: show the entire person head to toe — if only the face is visible the image is WRONG.'
        : 'Keep identity consistent.',
      // Do NOT say "full body" in medium/portrait Avoid: — resolveFraming used to
      // mis-read that phrase and force fullbody (dropped face-anchor; broke Spicy).
      framing === 'fullbody'
        ? 'Avoid: different person, face swap look, 3d render, CGI plastic, doll, mannequin, beauty filter, cartoon, anime, elongated face, vertical stretch, accidental close-up portrait when head-to-toe was requested.'
        : 'Avoid: different person, face swap look, 3d render, CGI plastic, doll, mannequin, beauty filter, cartoon, anime, elongated face, vertical stretch.'
    ].join(' ');
  }

  /**
   * Export text for free chatbots from an already-assembled persona JSON.
   * @param {object} personaJSON
   * @param {{ includePrompt?: boolean, promptText?: string, includeScript?: boolean, includeProduct?: boolean, scriptData?: object, productData?: object }} [opts]
   */
  function buildChatbotExportTextFromPersona(personaJSON, opts = {}) {
    const lock = personaJSON?.character_lock || {};
    const must = lock.must_match_every_image || {};
    const formattedJson = JSON.stringify(personaJSON, null, 2);
    const lockCard = JSON.stringify(lock, null, 2);
    const sections = [];

    sections.push(`Eres un generador de contenido UGC para un influencer virtual de un pequeño emprendedor (flujo CERO COSTO: sin APIs de face-lock de pago).

• Respeta la personalidad (${personaJSON?.personality?.mbti || ''}), el tono de voz ("${personaJSON?.personality?.communication_style || ''}") y evita los tabúes de la marca: [${(personaJSON?.personality?.taboos || []).join(', ')}].
• En la imagen/video, mantén las marcas distintivas únicas: ${personaJSON?.facial_features?.distinctive_marks || 'Ninguna específica'}.

REGLA DE ORO: Es SIEMPRE la misma persona. El JSON es la única fuente de verdad de identidad.

═══════════════════════════════════════════
  CHARACTER LOCK (gratis — copiar a cualquier chatbot)
═══════════════════════════════════════════
${lockCard}

RESUMEN OBLIGATORIO (no negociable en ninguna imagen):
• Nombre: ${must.name || '—'}
• Edad / género / etnia: ${must.age || '—'} · ${must.gender || '—'} · ${must.ethnicity || '—'}
• Rostro: ${must.face_shape || '—'} | ojos ${must.eye_color || '—'} | cejas ${must.eyebrows || '—'} | labios ${must.lips || '—'}
• Piel: ${must.skin_tone || '—'}${must.skin_tone_hex ? ' (' + must.skin_tone_hex + ')' : ''} — NO oscurecer ni aclarar
• Cabello: ${must.hair_color || '—'} · ${must.hair_texture || '—'} · ${must.hair_length || '—'}
• Cuerpo: ${must.body_type || '—'} · ${must.height || '—'} · ${must.proportions || '—'}

PUEDE CAMBIAR: pose, ropa (bikini/spicy/etc.), fondo, expresión suave, producto en mano.
NO PUEDE CAMBIAR: cara, tez, peinado base, proporciones corporales, edad aparente.
═══════════════════════════════════════════`);

    sections.push(`
═══════════════════════════════════════════
  IDENTIDAD VISUAL COMPLETA (JSON)
═══════════════════════════════════════════
${formattedJson}
═══════════════════════════════════════════`);

    if (opts.includeProduct && opts.productData) {
      const productData = opts.productData;
      sections.push(`
═══════════════════════════════════════════
  PRODUCTO / MARCA
═══════════════════════════════════════════
• Nombre: ${productData.name || 'Sin definir'}
• Beneficio principal: ${productData.benefit || 'Sin definir'}
• Audiencia objetivo: ${productData.audience || 'Sin definir'}
• Frustración clave: ${productData.frustration || 'Sin definir'}
═══════════════════════════════════════════`);
    }

    if (opts.includeScript && opts.scriptData) {
      const scriptData = opts.scriptData;
      sections.push(`
═══════════════════════════════════════════
  GUIÓN DE CAMPAÑA UGC (${scriptData.angle})
═══════════════════════════════════════════

[1. GANCHO / HOOK]
Diálogo: "${scriptData.hook}"
Dirección visual: ${scriptData.hookCue}

[2. DEMOSTRACIÓN / DEMO]
Diálogo: "${scriptData.demo}"
Dirección visual: ${scriptData.demoCue}

[3. EL GIRO / THE TURN]
Diálogo: "${scriptData.turn}"
Dirección visual: ${scriptData.turnCue}

[4. LLAMADO A LA ACCIÓN / CTA]
Diálogo: "${scriptData.cta}"
Dirección visual: ${scriptData.ctaCue}
═══════════════════════════════════════════`);
    }

    if (opts.includePrompt !== false) {
      const prompt = opts.promptText || '';
      sections.push(`
═══════════════════════════════════════════
  PROMPT DE GENERACIÓN DE IMAGEN
═══════════════════════════════════════════
${prompt}
═══════════════════════════════════════════`);
    }

    sections.push(`
INSTRUCCIONES PARA CHATBOTS GRATUITOS (ChatGPT / Gemini / Claude / Meta / etc.):
1. Pega este texto completo al inicio del chat (o como instrucción de sistema si el producto lo permite).
2. Cada petición de imagen debe reutilizar character_lock.must_match_every_image al pie de la letra.
3. Si pides cuerpo entero, bikini o modo spicy: cambia SOLO ropa/pose/fondo; la cara y la tez son fijas.
4. Estilo UGC: foto de celular amateur, no "cinematic 8K studio".
5. Si el modelo se desvía (otra cara u otra tez), re-pega el bloque CHARACTER LOCK y repite la petición.
6. Este flujo es deliberadamente gratis: no requiere Replicate, InstantID ni GPU de pago.`);

    return sections.join('\n');
  }

  return {
    parseDetailedJSON,
    isRealPersonaObject,
    assembleCharacterLock,
    buildIdentityLockBlock,
    resolveSkinForPrompt,
    buildPromptFromAnalysis,
    buildFormPrompt,
    detectVariantFraming,
    buildVariantPrompt,
    buildChatbotExportTextFromPersona
  };
});
