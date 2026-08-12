const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const {
  DATA_DIR,
  DB_PATH,
  WORKSPACE_DB_MIRROR,
  resolveDatabasePath,
  ensureDataLayout,
  ensureDir
} = require('./paths');
const { runMigrations, getSchemaVersion } = require('./migrations');

// Portable DB: ./data/influ.sqlite (or DATA_DIR) — migrates from legacy paths once
ensureDataLayout();
const ACTIVE_DB_PATH = resolveDatabasePath();
const db = new Database(ACTIVE_DB_PATH);
// SQLite FK checks are off by default — required for ON DELETE CASCADE to fire.
db.pragma('foreign_keys = ON');
console.log(`[db] Opened SQLite at ${ACTIVE_DB_PATH}`);

/**
 * Legacy root mirrors (W6): OFF by default.
 * Opt-in only: ENABLE_LEGACY_MIRRORS=1 writes ./influ.sqlite and ./personas.json.
 * Source of truth is always data/influ.sqlite (or DATA_DIR).
 */
function legacyMirrorsEnabled() {
  return process.env.ENABLE_LEGACY_MIRRORS === '1';
}

/**
 * Mirror active DB to project-root influ.sqlite (legacy; disabled unless ENABLE_LEGACY_MIRRORS=1).
 */
function syncDbToWorkspace() {
  if (!legacyMirrorsEnabled()) return;
  if (process.env.SKIP_DB_MIRROR === '1') return;
  try {
    fs.copyFileSync(ACTIVE_DB_PATH, WORKSPACE_DB_MIRROR);
    console.log(`Synced database to workspace: ${WORKSPACE_DB_MIRROR}`);
  } catch (err) {
    console.error('Failed to sync DB to workspace:', err);
  }
}

function getDbPath() {
  return ACTIVE_DB_PATH;
}

function getDataDir() {
  return DATA_DIR;
}

/**
 * Normalize detailedJSON: unwrap double-encoded strings and char-index corruption.
 * Always returns a plain object (never a string).
 */
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

  // Detect accidental string→object via Object.keys / stringify of a string
  const keys = Object.keys(v);
  if (keys.length > 40 && keys.every(k => /^\d+$/.test(k))) {
    try {
      const rejoined = keys
        .map(Number)
        .sort((a, b) => a - b)
        .map(k => v[String(k)])
        .join('');
      return parseDetailedJSON(rejoined);
    } catch (_) {
      return {};
    }
  }
  return v;
}

/** Serialize for SQLite TEXT column — never double-stringify. */
function serializeDetailedJSON(raw) {
  const obj = parseDetailedJSON(raw == null ? {} : raw);
  return JSON.stringify(obj);
}

/** Attach parsed detailedJSON object on persona rows (keeps string in detailedJSON_raw if needed). */
function hydratePersona(row) {
  if (!row) return row;
  const parsed = parseDetailedJSON(row.detailedJSON);
  return { ...row, detailedJSON: parsed };
}

// Formal migrations (schema_migrations) — ver migrations.js
const migrationResult = runMigrations(db);
console.log(`[db] Schema version ${migrationResult.currentVersion}` +
  (migrationResult.applied.length ? ` (applied: ${migrationResult.applied.join(', ')})` : ''));

syncDbToWorkspace();

const authCrypto = require('./auth');

/** admin = sistema; owner = legacy (tratado como admin). */
function isAdminRole(role) {
  return role === 'admin' || role === 'owner';
}

function normalizeProfileRole(role) {
  if (role === 'admin' || role === 'owner') return 'admin';
  return 'member';
}

function normalizeInviteCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

/**
 * Perfiles creados por npm test / smoke — no deben aparecer en el login.
 * El emprendedor elige uno, pone 1234 y ve «PIN incorrecto».
 */
const HARNESS_STUDIO_PROFILE_RE =
  /^(MetricsMem_|Onboard_|Member Sec|SmokeMem|SmokeMember|L5 |HelloWorld|SpeedTest|DualSync)/i;

function isHarnessStudioProfileName(name) {
  return HARNESS_STUDIO_PROFILE_RE.test(String(name || '').trim());
}

/**
 * Asegura al menos un perfil local (Administración) con el PIN de .env / 1234.
 * Backfill personas.profile_id huérfanas al perfil por defecto.
 */
function ensureDefaultStudioProfile() {
  const { v4: uuidv4 } = require('uuid');
  let count = 0;
  try {
    count = db.prepare('SELECT COUNT(*) AS c FROM studio_profiles').get().c;
  } catch (_) {
    return null;
  }

  let defaultId = null;
  if (count === 0) {
    const id = uuidv4();
    const pin = authCrypto.getConfiguredPin() || authCrypto.DEFAULT_PIN_FALLBACK;
    const { salt, hash } = authCrypto.hashPin(pin);
    db.prepare(`
      INSERT INTO studio_profiles (id, name, pin_hash, pin_salt, role, active)
      VALUES (?, ?, ?, ?, 'admin', 1)
    `).run(id, 'Administración', hash, salt);
    defaultId = id;
    console.log('[db] Created default studio profile «Administración» (admin)');
  } else {
    const row = db.prepare(`
      SELECT id FROM studio_profiles
      WHERE active = 1 AND role IN ('admin', 'owner')
      ORDER BY created_at ASC LIMIT 1
    `).get() || db.prepare(`SELECT id FROM studio_profiles WHERE active = 1 ORDER BY created_at ASC LIMIT 1`).get();
    defaultId = row?.id || null;
    // Promote legacy owner → admin label for clarity (role stays compatible)
    try {
      db.prepare(`UPDATE studio_profiles SET role = 'admin' WHERE role = 'owner'`).run();
      db.prepare(`UPDATE studio_profiles SET name = 'Administración' WHERE name = 'Admin' AND role = 'admin'`).run();
    } catch (_) {}
  }

  if (defaultId) {
    db.prepare(`UPDATE personas SET profile_id = ? WHERE profile_id IS NULL OR profile_id = ''`).run(defaultId);
    try {
      db.prepare(`UPDATE products SET profile_id = ? WHERE profile_id IS NULL OR profile_id = ''`).run(defaultId);
      db.prepare(`UPDATE campaigns SET profile_id = ? WHERE profile_id IS NULL OR profile_id = ''`).run(defaultId);
      db.prepare(`UPDATE prompt_gallery SET profile_id = ? WHERE profile_id IS NULL OR profile_id = ''`).run(defaultId);
    } catch (e) {
      console.warn('[db] profile backfill products/campaigns:', e.message);
    }
  }
  return defaultId;
}

ensureDefaultStudioProfile();

/**
 * Build personas + variants payload for backup/export (does not write to disk).
 */
function buildPersonasExportPayload() {
  const personas = db.prepare('SELECT * FROM personas WHERE archived = 0 ORDER BY created_at DESC').all().map(hydratePersona);
  return personas.map(p => {
    const variants = db.prepare(`
      SELECT id, persona_id, pose, clothing, attitude, setting, image_path, created_at,
             consistency_distance, consistency_grade, consistency_anchor
      FROM persona_variants WHERE persona_id = ? ORDER BY created_at DESC
    `).all(p.id);
    return { ...p, variants };
  });
}

/**
 * Dual persistence to root personas.json — legacy; OFF unless ENABLE_LEGACY_MIRRORS=1.
 * Prefer snapshot under data/backups/ via createBackupSnapshot / export studio.
 */
function syncPersonasJson() {
  if (!legacyMirrorsEnabled()) return;
  const jsonPath = path.join(__dirname, 'personas.json');
  try {
    const personasWithVariants = buildPersonasExportPayload();
    fs.writeFileSync(jsonPath, JSON.stringify(personasWithVariants, null, 2), 'utf8');
    console.log(`[db] Synchronized ${personasWithVariants.length} persona(s) with variants to personas.json`);
  } catch (err) {
    console.error('[db] Failed to sync personas.json:', err.message);
  }
}

// Seed helper: importa personas.json / products.json si la DB está vacía
function migrateJsonSeedData() {
  const { v4: uuidv4 } = require('uuid');

  const checkPersonas = db.prepare('SELECT COUNT(*) as count FROM personas').get();
  if (checkPersonas.count === 0) {
    const jsonPath = path.join(__dirname, 'personas.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const personas = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const insert = db.prepare(`
          INSERT INTO personas (id, name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting, image, imageUGC, handle, detailedJSON)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
          personas.forEach(p => {
            const id = uuidv4();
            insert.run(
              id,
              p.name,
              p.gender,
              p.age,
              p.ethnicity || p.ethnicity_appearance || 'Mixta',
              p.style,
              p.hair,
              p.lighting,
              p.camera,
              p.clothing,
              p.setting,
              p.image,
              p.imageUGC,
              p.handle,
              JSON.stringify(p.detailedJSON || {})
            );
          });
        })();
        console.log('Migrated personas.json into SQLite DB successfully.');
      } catch (err) {
        console.error('Failed migrating personas.json:', err);
      }
    }
  }

  const checkProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (checkProducts.count === 0) {
    const jsonPath = path.join(__dirname, 'products.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const products = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const insert = db.prepare(`
          INSERT INTO products (id, name, benefit, audience, frustration, image)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
          products.forEach(p => {
            const id = uuidv4();
            insert.run(
              id,
              p.name,
              p.benefit,
              p.audience,
              p.frustration,
              p.image
            );
          });
        })();
        console.log('Migrated products.json into SQLite DB successfully.');
      } catch (err) {
        console.error('Failed migrating products.json:', err);
      }
    }
  }
  
  // Ensure "Nano Banana" influencer is always in the database
  const checkNano = db.prepare("SELECT COUNT(*) as count FROM personas WHERE name = 'Nano Banana'").get();
  if (checkNano.count === 0) {
    const id = uuidv4();
    const nanoBananaDetailedJSON = {
      identity: {
        name: "Nano Banana",
        gender: "Femenino",
        apparent_age: "24 años",
        ethnicity_appearance: "Latina / Mediterránea",
        body_type: "Atlético / Proporcionado",
        persona_archetype: "Lifestyle & Bienestar"
      },
      facial_features: {
        face_shape: "Ovalada con ángulos suaves",
        skin_tone: "Medio cálido / arena dorada",
        skin_tone_hex: "#d3a682",
        skin_texture: "Piel suave y uniforme, acabado semi-mate con luminosidad natural",
        eye_color: "Marrón cálido con destellos ámbar",
        eye_shape: "Almendrados, ligeramente rasgados",
        eyebrow_style: "Cejas naturales pobladas con arco suave, sin exceso de maquillaje",
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
        color: "Castaño medio natural",
        color_hex: "#4a3728",
        length: "Medio-largo, por debajo de los hombros",
        texture: "Ondulado natural con movimiento orgánico",
        style: "Suelto y sin esfuerzo, con raya al centro ligeramente descentrada",
        parting: "Centro o ligeramente lateral izquierdo",
        highlights: "Reflejos naturales por el sol en las puntas",
        volume: "Volumen medio con cuerpo saludable"
      },
      aesthetic: {
        overall_vibe: "Natural, fresca, accesible y aspiracional",
        fashion_style: "Casual chic con piezas de calidad minimalista",
        color_palette_dominant: "#a08070",
        color_palette_description: "Paleta cálida centrada en tonos tierra y neutros suaves",
        makeup_level: "Maquillaje mínimo o 'no-makeup makeup': base ligera, rubor, máscara, gloss natural",
        accessories: "Aretes pequeños dorados, posible collar delicado, reloj minimalista",
        nails: "Uñas naturales cortas con tono nude o transparente"
      },
      photography: {
        camera_lens: "iPhone 15 Pro front camera selfie",
        focal_length: "24mm (equivalente en celular)",
        aperture: "f/1.9 (cámara frontal de celular)",
        lighting_type: "Luz natural cálida, suave y difusa desde ventana",
        lighting_direction: "Luz natural frontal-lateral directa",
        color_grade: "Aspecto natural sin filtros, balance de blancos automático de celular",
        color_temperature: "5500-6000K (luz natural de día)",
        depth_of_field: "Profundidad de campo típica de celular, fondo ligeramente legible",
        background_setting: "Sala de estar moderna y minimalista con plantas de interior",
        background_blur: "Desenfoque natural de lente de celular (sin bokeh exagerado)",
        composition: "Sujeto centrado en plano de autorretrato (selfie)",
        framing: "Plano medio-corto (selfie de brazo extendido), crop 4:5 para Instagram",
        mood: "Casual, espontáneo, cotidiano y auténtico",
        post_processing: "Foto RAW móvil sin filtros, aspecto amateur natural"
      },
      clothing: {
        type: "Top de tejido suave o blusa casual elegante",
        color: "Verde claro",
        material: "Algodón orgánico, lino o punto fino",
        neckline: "Cuello redondo o V abierto casual",
        fit: "Semi-ajustado, silueta relajada y halagadora",
        visible_brand_logos: "Ninguno (estética clean sin branding visible)"
      },
      anchor_reference: "assets/nano_banana_influencer.png",
      generation_prompt: "Amateur casual UGC style, iPhone 15 Pro front camera selfie. A 24 años Latina / Mediterránea Femenino influencer with a very natural expression, looking at camera. Castaño medio natural, Ondulado natural con movimiento orgánico, Medio-largo, por debajo de los hombros, wearing Top de tejido suave o blusa casual elegante en Verde claro. Background is a Sala de estar moderna y minimalista con plantas de interior. Luz natural cálida, suave y difusa desde ventana, raw photo format, unedited, shot on smartphone camera, natural skin texture, realistic imperfections."
    };

    db.prepare(`
      INSERT INTO personas (id, name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting, image, imageUGC, handle, detailedJSON)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      "Nano Banana",
      "Female",
      "24 años",
      "Latina / Mediterránea",
      "Natural, fresca, accesible y aspiracional",
      "Castaño medio natural, Ondulado natural con movimiento orgánico, Medio-largo, por debajo de los hombros",
      "Luz natural cálida, suave y difusa desde ventana",
      "iPhone 15 Pro front camera selfie",
      "Top de tejido suave o blusa casual elegante en Verde claro",
      "Sala de estar moderna y minimalista con plantas de interior",
      "assets/nano_banana_influencer.png",
      "assets/nano_banana_ugc.png",
      "@nano_banana_ai",
      JSON.stringify(nanoBananaDetailedJSON)
    );
    console.log("Successfully seeded Nano Banana influencer into database.");
  }

  // Repair double-encoded detailedJSON + ensure body section exists when missing
  try {
    const rows = db.prepare('SELECT id, name, detailedJSON FROM personas').all();
    const update = db.prepare('UPDATE personas SET detailedJSON = ? WHERE id = ?');
    let repaired = 0;
    for (const row of rows) {
      const raw = row.detailedJSON;
      const needsUnwrap = typeof raw === 'string' && raw.trim().startsWith('"');
      const parsed = parseDetailedJSON(raw);
      if (!parsed || Object.keys(parsed).length === 0) continue;

      // Ensure body block from identity.body_type if absent
      if (!parsed.body || typeof parsed.body !== 'object') {
        parsed.body = {
          body_type: parsed.identity?.body_type || 'Atlético / Proporcionado',
          height_appearance: 'Estatura media aparente',
          proportions: 'Silueta proporcionada, hombros equilibrados, cintura natural',
          posture: 'Postura erguida y relajada',
          fitness_level: 'Tono natural ligero, sin musculatura exagerada',
          shoulders: 'Hombros suaves y naturales',
          waist_hip_balance: 'Cintura y caderas en proporción armónica',
          limbs: 'Brazos y piernas proporcionados al torso',
          hands: 'Manos naturales con dedos finos',
          skin_continuity: 'Mismo tono de piel en rostro, cuello, hombros y brazos',
          visible_framing: 'Cuerpo visible en plano medio / medio cuerpo, no solo close-up facial'
        };
        if (parsed.identity) parsed.identity.body_type = parsed.body.body_type;
      }

      const next = serializeDetailedJSON(parsed);
      if (next !== raw || needsUnwrap) {
        update.run(next, row.id);
        repaired++;
      }
    }
    if (repaired > 0) {
      console.log(`[db] Normalized detailedJSON (body + encoding) for ${repaired} persona(s).`);
    }
  } catch (repairErr) {
    console.warn('[db] detailedJSON repair skipped:', repairErr.message);
  }

  syncDbToWorkspace();
}

migrateJsonSeedData();

module.exports = {
  db,
  syncDbToWorkspace,
  syncPersonasJson,
  buildPersonasExportPayload,
  legacyMirrorsEnabled,
  migrateJsonSeedData,
  /** Alias: las migraciones ya corren al cargar el módulo. */
  runMigrations() {
    return migrationResult;
  },
  getDbPath,
  getDataDir,
  DATA_DIR,
  DB_PATH: ACTIVE_DB_PATH,
  isAdminRole,
  normalizeInviteCode,
  
  // Personas CRUD
  getAllPersonas(profileId = null) {
    if (profileId) {
      return db.prepare('SELECT * FROM personas WHERE profile_id = ? ORDER BY created_at DESC').all(profileId).map(hydratePersona);
    }
    return db.prepare('SELECT * FROM personas ORDER BY created_at DESC').all().map(hydratePersona);
  },
  
  getPersonaById(id) {
    return hydratePersona(db.prepare('SELECT * FROM personas WHERE id = ?').get(id));
  },

  /**
   * Fail-closed: sin profileId → null (no filtrar existencia ajena ni abrir todo el roster).
   * Usar siempre con el profileId de sesión en rutas API.
   */
  assertPersonaOwnedBy(personaId, profileId) {
    if (!personaId || !profileId) return null;
    const row = hydratePersona(
      db.prepare('SELECT * FROM personas WHERE id = ? AND profile_id = ?').get(personaId, profileId)
    );
    return row || null;
  },

  assertProductOwnedBy(productId, profileId) {
    if (!productId || !profileId) return null;
    const row = this.getProductById(productId);
    if (!row) return null;
    if (row.profile_id && row.profile_id !== profileId) return null;
    // Legacy sin profile_id: solo el perfil default/admin puede tocarlos vía backfill; denegar members.
    if (!row.profile_id) return null;
    return row;
  },

  assertCampaignOwnedBy(campaignId, profileId) {
    if (!campaignId || !profileId) return null;
    const row = this.getCampaignById(campaignId);
    if (!row) return null;
    if (row.profile_id && row.profile_id !== profileId) return null;
    if (!row.profile_id) return null;
    return row;
  },

  /**
   * ¿Puede este perfil leer un asset privado (references/generated)?
   * Deny si la ruta está ligada a otro profile_id. Allow si es propia, huérfana o no indexada.
   * @param {string} mountKind 'references' | 'generated'
   * @param {string} urlPath path Express bajo el mount (p.ej. /gen_abc.png)
   * @param {string} profileId
   */
  assertAssetReadableByProfile(mountKind, urlPath, profileId) {
    if (!profileId) return false;
    const kind = String(mountKind || '').replace(/[^a-z]/gi, '');
    if (kind !== 'references' && kind !== 'generated') return false;
    const base = String(urlPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (!base || base.includes('..')) return false;
    const candidates = [
      `assets/${kind}/${base}`,
      `${kind}/${base}`,
      `./assets/${kind}/${base}`
    ];

    const otherOwns = db.prepare(`
      SELECT 1 AS x WHERE EXISTS (
        SELECT 1 FROM personas
        WHERE profile_id IS NOT NULL AND profile_id != ?
          AND (image IN (${candidates.map(() => '?').join(',')})
            OR imageUGC IN (${candidates.map(() => '?').join(',')}))
      ) OR EXISTS (
        SELECT 1 FROM products
        WHERE profile_id IS NOT NULL AND profile_id != ?
          AND image IN (${candidates.map(() => '?').join(',')})
      ) OR EXISTS (
        SELECT 1 FROM prompt_gallery
        WHERE profile_id IS NOT NULL AND profile_id != ?
          AND image_path IN (${candidates.map(() => '?').join(',')})
      ) OR EXISTS (
        SELECT 1 FROM persona_variants v
        JOIN personas p ON p.id = v.persona_id
        WHERE p.profile_id IS NOT NULL AND p.profile_id != ?
          AND v.image_path IN (${candidates.map(() => '?').join(',')})
      ) OR EXISTS (
        SELECT 1 FROM generation_history g
        JOIN personas p ON p.id = g.persona_id
        WHERE p.profile_id IS NOT NULL AND p.profile_id != ?
          AND g.image_path IN (${candidates.map(() => '?').join(',')})
      )
    `).get(
      profileId, ...candidates, ...candidates,
      profileId, ...candidates,
      profileId, ...candidates,
      profileId, ...candidates,
      profileId, ...candidates
    );
    return !otherOwns;
  },

  getPersonaByName(name) {
    return hydratePersona(db.prepare('SELECT * FROM personas WHERE LOWER(name) = LOWER(?)').get(name));
  },

  parseDetailedJSON,
  serializeDetailedJSON,
  ensureDefaultStudioProfile,
  
  savePersona(p) {
    const { v4: uuidv4 } = require('uuid');
    // forceCreate: always INSERT a new row (used by "Crear desde cero").
    // Never match/update by name alone — that caused accidental renames of other influencers.
    const forceCreate = p.forceCreate === true || p.forceCreate === 1 || p.forceCreate === 'true';
    const hasId = p.id && String(p.id).trim() !== '';
    const profileId = p.profile_id || p.profileId || ensureDefaultStudioProfile();

    let existing = null;
    if (!forceCreate && hasId) {
      existing = db.prepare('SELECT * FROM personas WHERE id = ?').get(p.id);
    }

    if (existing) {
      // Defensa en profundidad: no reescribir / reasignar personas de otro perfil
      if (existing.profile_id && existing.profile_id !== profileId) {
        const err = new Error('Influencer no encontrado.');
        err.code = 'PROFILE_FORBIDDEN';
        throw err;
      }
      // Save version history before update
      const versionId = uuidv4();
      db.prepare(`
        INSERT INTO versions (id, persona_id, field_changed, old_value, new_value, full_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        existing.id,
        'update',
        JSON.stringify(existing),
        JSON.stringify(p),
        JSON.stringify(existing)
      );

      // Update only the row with this id (name change is intentional rename of THIS persona)
      // Keep original profile_id unless explicitly reassigned
      const keepProfile = existing.profile_id || profileId;
      db.prepare(`
        UPDATE personas
        SET name = ?, gender = ?, age = ?, ethnicity = ?, style = ?, hair = ?, lighting = ?, camera = ?, clothing = ?, setting = ?, image = ?, imageUGC = ?, handle = ?, detailedJSON = ?, profile_id = ?
        WHERE id = ?
      `).run(
        p.name,
        p.gender,
        p.age,
        p.ethnicity,
        p.style,
        p.hair,
        p.lighting,
        p.camera,
        p.clothing,
        p.setting,
        p.image || existing.image,
        p.imageUGC || existing.imageUGC,
        p.handle || existing.handle,
        serializeDetailedJSON(p.detailedJSON),
        keepProfile,
        existing.id
      );
      syncDbToWorkspace();
      syncPersonasJson();
      const updated = this.getPersonaById(existing.id);
      const lockRev = this.recordCharacterLockRevisionIfChanged(updated, 'save');
      if (lockRev) updated.lockRevision = lockRev;
      return updated;
    }

    // INSERT new persona (forceCreate, missing id, or unknown id)
    const id = forceCreate || !hasId ? uuidv4() : p.id;
    const safeName = (p.name && String(p.name).trim()) || `Influencer_${Date.now().toString().slice(-4)}`;
    const handleBase = safeName.toLowerCase().replace(/\s+/g, '');
    db.prepare(`
      INSERT INTO personas (id, name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting, image, imageUGC, handle, detailedJSON, profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      safeName,
      p.gender,
      p.age,
      p.ethnicity,
      p.style,
      p.hair,
      p.lighting,
      p.camera,
      p.clothing,
      p.setting,
      p.image || (p.gender === 'Male' ? 'assets/influencer_male.png' : 'assets/influencer_female.png'),
      p.imageUGC || (p.gender === 'Male' ? 'assets/influencer_male_bottle.png' : 'assets/influencer_female_serum.png'),
      p.handle || `@${handleBase}_ai_ugc`,
      serializeDetailedJSON(p.detailedJSON),
      profileId
    );
    syncDbToWorkspace();
    syncPersonasJson();
    const created = this.getPersonaById(id);
    const lockRev = this.recordCharacterLockRevisionIfChanged(created, 'create');
    if (lockRev) created.lockRevision = lockRev;
    return created;
  },

  /**
   * W12 — Extrae character_lock de detailedJSON (objeto o string).
   */
  extractCharacterLock(detailedJSON) {
    const d = parseDetailedJSON(detailedJSON);
    const lock = d && d.character_lock;
    return lock && typeof lock === 'object' ? lock : null;
  },

  /**
   * W12 — Guarda revisión si el lock cambió. Cap 20 por persona.
   * @returns {null|{ id, created, healthScore, previousHealthScore, healthDropped, grade }}
   */
  recordCharacterLockRevisionIfChanged(persona, source = 'save') {
    if (!persona?.id) return null;
    const lock = this.extractCharacterLock(persona.detailedJSON);
    if (!lock) return null;

    const lockJson = JSON.stringify(lock);
    const latest = db.prepare(`
      SELECT id, lock_json, health_score FROM character_lock_revisions
      WHERE persona_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(persona.id);

    if (latest && latest.lock_json === lockJson) {
      return {
        id: latest.id,
        created: false,
        healthScore: latest.health_score,
        previousHealthScore: latest.health_score,
        healthDropped: false,
        grade: null
      };
    }

    let healthScore = null;
    let grade = null;
    try {
      const CharacterLockValidator = require('./character-lock-validator');
      const personaJSON = typeof persona.detailedJSON === 'object'
        ? persona.detailedJSON
        : parseDetailedJSON(persona.detailedJSON);
      const v = CharacterLockValidator.validateCharacterLock(personaJSON || { character_lock: lock });
      healthScore = v.score;
      grade = v.grade;
    } catch (_) {}

    const prevScore = latest ? latest.health_score : null;
    let healthDropped = false;
    if (prevScore != null && healthScore != null) {
      try {
        const CharacterLockValidator = require('./character-lock-validator');
        let prevGrade = null;
        try {
          const prevLock = JSON.parse(latest.lock_json);
          const prevV = CharacterLockValidator.validateCharacterLock({ character_lock: prevLock });
          prevGrade = prevV.grade;
        } catch (_) {}
        healthDropped = CharacterLockValidator.didLockHealthDrop(prevScore, healthScore, prevGrade, grade);
      } catch (_) {
        healthDropped = healthScore <= prevScore - 8;
      }
    }

    const { v4: uuidv4 } = require('uuid');
    const revId = uuidv4();
    db.prepare(`
      INSERT INTO character_lock_revisions (id, persona_id, profile_id, lock_json, source, health_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      revId,
      persona.id,
      persona.profile_id || null,
      lockJson,
      String(source || 'save').slice(0, 40),
      healthScore
    );

    // Cap N=20 (más nuevas primero)
    const old = db.prepare(`
      SELECT id FROM character_lock_revisions
      WHERE persona_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT -1 OFFSET 20
    `).all(persona.id);
    if (old.length) {
      const del = db.prepare('DELETE FROM character_lock_revisions WHERE id = ?');
      for (const row of old) del.run(row.id);
    }

    return {
      id: revId,
      created: true,
      healthScore,
      previousHealthScore: prevScore,
      healthDropped,
      grade
    };
  },

  listCharacterLockRevisions(personaId, profileId = null) {
    if (profileId) {
      const owned = this.assertPersonaOwnedBy(personaId, profileId);
      if (!owned) return null;
    }
    return db.prepare(`
      SELECT id, persona_id, profile_id, source, health_score, created_at, lock_json
      FROM character_lock_revisions
      WHERE persona_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 20
    `).all(personaId).map((r) => {
      let lock = null;
      try { lock = JSON.parse(r.lock_json); } catch (_) {}
      return {
        id: r.id,
        persona_id: r.persona_id,
        profile_id: r.profile_id,
        source: r.source,
        health_score: r.health_score,
        created_at: r.created_at,
        lock
      };
    });
  },

  getCharacterLockRevision(personaId, revisionId, profileId = null) {
    if (profileId) {
      const owned = this.assertPersonaOwnedBy(personaId, profileId);
      if (!owned) return null;
    }
    const r = db.prepare(`
      SELECT id, persona_id, profile_id, source, health_score, created_at, lock_json
      FROM character_lock_revisions
      WHERE id = ? AND persona_id = ?
    `).get(revisionId, personaId);
    if (!r) return null;
    let lock = null;
    try { lock = JSON.parse(r.lock_json); } catch (_) {}
    return {
      id: r.id,
      persona_id: r.persona_id,
      profile_id: r.profile_id,
      source: r.source,
      health_score: r.health_score,
      created_at: r.created_at,
      lock
    };
  },

  /**
   * Restaura character_lock en detailedJSON y guarda (crea revisión source=restore).
   */
  restoreCharacterLockRevision(personaId, revisionId, profileId = null) {
    const owned = profileId ? this.assertPersonaOwnedBy(personaId, profileId) : this.getPersonaById(personaId);
    if (!owned) return null;
    const rev = this.getCharacterLockRevision(personaId, revisionId, profileId);
    if (!rev || !rev.lock) return null;

    const detailed = parseDetailedJSON(owned.detailedJSON) || {};
    detailed.character_lock = rev.lock;
    // Sync must_match fields into face/hair/body when present (best-effort)
    const must = rev.lock.must_match_every_image || {};
    if (must.skin_tone || must.skin_tone_hex) {
      detailed.facial_features = detailed.facial_features || {};
      if (must.skin_tone) detailed.facial_features.skin_tone = must.skin_tone;
      if (must.skin_tone_hex) detailed.facial_features.skin_tone_hex = must.skin_tone_hex;
      if (must.eye_color) detailed.facial_features.eye_color = must.eye_color;
    }
    if (must.hair_color || must.hair_texture || must.hair_length) {
      detailed.hair = detailed.hair || {};
      if (must.hair_color) detailed.hair.color = must.hair_color;
      if (must.hair_texture) detailed.hair.texture = must.hair_texture;
      if (must.hair_length) detailed.hair.length = must.hair_length;
    }

    const saved = this.savePersona({
      ...owned,
      id: personaId,
      detailedJSON: detailed,
      profile_id: owned.profile_id || profileId,
      forceCreate: false
    });
    if (saved?.lockRevision?.id && saved.lockRevision.created) {
      try {
        db.prepare(`UPDATE character_lock_revisions SET source = 'restore' WHERE id = ?`).run(saved.lockRevision.id);
        saved.lockRevision.source = 'restore';
      } catch (_) {}
    }
    return saved;
  },

  getVersionsForPersona(personaId) {
    return db.prepare('SELECT * FROM versions WHERE persona_id = ? ORDER BY created_at DESC').all(personaId);
  },

  revertPersonaVersion(personaId, versionId) {
    const version = db.prepare('SELECT * FROM versions WHERE id = ? AND persona_id = ?').get(versionId, personaId);
    if (!version) return null;
    const oldData = JSON.parse(version.full_json);
    return this.savePersona(oldData);
  },

  // Products CRUD (scoped by profile_id)
  getAllProducts(profileId = null) {
    if (profileId) {
      return db.prepare('SELECT * FROM products WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
    }
    return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  },

  getProductById(id) {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  },

  getProductByName(name, profileId = null) {
    if (profileId) {
      return db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?) AND profile_id = ?').get(name, profileId);
    }
    return db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(name);
  },

  saveProduct(p) {
    const { v4: uuidv4 } = require('uuid');
    const profileId = p.profile_id || p.profileId || ensureDefaultStudioProfile();
    const existing = p.id
      ? db.prepare('SELECT * FROM products WHERE id = ?').get(p.id)
      : db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?) AND profile_id = ?').get(p.name, profileId);
    if (existing) {
      if (existing.profile_id && existing.profile_id !== profileId) {
        const err = new Error('Producto no encontrado.');
        err.code = 'PROFILE_FORBIDDEN';
        throw err;
      }
      const keepProfile = existing.profile_id || profileId;
      db.prepare(`
        UPDATE products
        SET name = ?, benefit = ?, audience = ?, frustration = ?, image = ?, profile_id = ?
        WHERE id = ?
      `).run(
        p.name,
        p.benefit,
        p.audience,
        p.frustration,
        p.image || existing.image,
        keepProfile,
        existing.id
      );
      syncDbToWorkspace();
      return this.getProductById(existing.id);
    } else {
      const id = p.id || uuidv4();
      db.prepare(`
        INSERT INTO products (id, name, benefit, audience, frustration, image, profile_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        p.name,
        p.benefit,
        p.audience,
        p.frustration,
        p.image || 'assets/product_serum.png',
        profileId
      );
      syncDbToWorkspace();
      return this.getProductById(id);
    }
  },

  bulkImportProducts(productsArray = [], profileId = null) {
    const imported = [];
    const pid = profileId || ensureDefaultStudioProfile();
    for (const p of productsArray) {
      if (p && (p.name || p.Title || p.title)) {
        const saved = this.saveProduct({
          name: p.name || p.Title || p.title,
          benefit: p.benefit || p.description || p.Description || 'Alta calidad y resultados comprobados',
          audience: p.audience || p.Target || 'Emprendedores y consumidores modernos',
          frustration: p.frustration || p.Problem || 'Productos genéricos sin garantía',
          image: p.image || p.image_url || 'assets/product_serum.png',
          profile_id: pid
        });
        imported.push(saved);
      }
    }
    return imported;
  },

  // Campaigns CRUD (scoped by profile_id)
  getAllCampaigns(profileId = null) {
    const campaigns = profileId
      ? db.prepare('SELECT * FROM campaigns WHERE profile_id = ? ORDER BY created_at DESC').all(profileId)
      : db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    return campaigns.map(c => {
      c.personas = db.prepare(`
        SELECT p.* FROM personas p
        JOIN campaign_personas cp ON p.id = cp.persona_id
        WHERE cp.campaign_id = ?
      `).all(c.id).map(hydratePersona);
      c.product = db.prepare('SELECT * FROM products WHERE id = ?').get(c.product_id);
      return c;
    });
  },

  getCampaignById(id) {
    const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!c) return null;
    c.personas = db.prepare(`
      SELECT p.* FROM personas p
      JOIN campaign_personas cp ON p.id = cp.persona_id
      WHERE cp.campaign_id = ?
    `).all(c.id).map(hydratePersona);
    c.product = db.prepare('SELECT * FROM products WHERE id = ?').get(c.product_id);
    c.scripts = db.prepare('SELECT * FROM scripts WHERE campaign_id = ?').all(c.id);
    return c;
  },

  saveCampaign(c, personaIds = []) {
    const { v4: uuidv4 } = require('uuid');
    const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(c.id || '');
    const id = c.id || uuidv4();
    const profileId = c.profile_id || c.profileId || existing?.profile_id || ensureDefaultStudioProfile();

    if (existing) {
      if (existing.profile_id && existing.profile_id !== profileId) {
        const err = new Error('Campaña no encontrada.');
        err.code = 'PROFILE_FORBIDDEN';
        throw err;
      }
    }

    const keepProfile = existing?.profile_id || profileId;
    if (c.product_id) {
      const prod = this.assertProductOwnedBy(c.product_id, keepProfile);
      if (!prod) {
        const err = new Error('Producto no encontrado.');
        err.code = 'PROFILE_FORBIDDEN';
        throw err;
      }
    }

    if (existing) {
      db.prepare(`
        UPDATE campaigns
        SET name = ?, product_id = ?, status = ?, budget = ?, client_name = ?, profile_id = ?
        WHERE id = ?
      `).run(
        c.name,
        c.product_id,
        c.status || 'draft',
        c.budget || 0,
        c.client_name,
        keepProfile,
        id
      );
    } else {
      db.prepare(`
        INSERT INTO campaigns (id, name, product_id, status, budget, client_name, profile_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        c.name,
        c.product_id,
        c.status || 'draft',
        c.budget || 0,
        c.client_name,
        keepProfile
      );
    }

    // Update campaign personas — solo personas del mismo perfil
    db.prepare('DELETE FROM campaign_personas WHERE campaign_id = ?').run(id);
    const insertCP = db.prepare('INSERT INTO campaign_personas (campaign_id, persona_id) VALUES (?, ?)');
    db.transaction(() => {
      (personaIds || []).forEach((pId) => {
        if (!pId) return;
        const owned = this.assertPersonaOwnedBy(pId, keepProfile);
        if (owned) insertCP.run(id, pId);
      });
    })();

    syncDbToWorkspace();
    return this.getCampaignById(id);
  },

  deleteCampaign(id) {
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    syncDbToWorkspace();
    return true;
  },

  // Scripts CRUD
  saveScripts(campaignId, scriptsList) {
    const { v4: uuidv4 } = require('uuid');
    db.prepare('DELETE FROM scripts WHERE campaign_id = ?').run(campaignId);
    
    const insert = db.prepare(`
      INSERT INTO scripts (id, campaign_id, angle, hook, hookCue, demo, demoCue, turn, turnCue, cta, ctaCue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      scriptsList.forEach(s => {
        insert.run(
          uuidv4(),
          campaignId,
          s.angle,
          s.hook,
          s.hookCue,
          s.demo,
          s.demoCue,
          s.turn,
          s.turnCue,
          s.cta,
          s.ctaCue
        );
      });
    })();

    syncDbToWorkspace();
    return db.prepare('SELECT * FROM scripts WHERE campaign_id = ?').all(campaignId);
  },

  // Gallery CRUD (scoped by profile_id)
  saveToGallery(prompt, imagePath, profileId = null) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const pid = profileId || ensureDefaultStudioProfile();
    try {
      db.prepare('INSERT INTO prompt_gallery (id, prompt, image_path, profile_id) VALUES (?, ?, ?, ?)')
        .run(id, prompt, imagePath, pid);
    } catch (_) {
      db.prepare('INSERT INTO prompt_gallery (id, prompt, image_path) VALUES (?, ?, ?)')
        .run(id, prompt, imagePath);
    }
    syncDbToWorkspace();
    return { id, prompt, image_path: imagePath, profile_id: pid };
  },

  getGalleryItems(profileId = null) {
    if (profileId) {
      return db.prepare('SELECT * FROM prompt_gallery WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
    }
    return db.prepare('SELECT * FROM prompt_gallery ORDER BY created_at DESC').all();
  },

  deletePersona(id) {
    db.prepare('DELETE FROM personas WHERE id = ?').run(id);
    syncDbToWorkspace();
    syncPersonasJson();
    return true;
  },

  toggleArchivePersona(id, archived) {
    db.prepare('UPDATE personas SET archived = ? WHERE id = ?').run(archived, id);
    syncDbToWorkspace();
    syncPersonasJson();
    return this.getPersonaById(id);
  },

  getVariantsForPersona(personaId) {
    return db.prepare('SELECT * FROM persona_variants WHERE persona_id = ? ORDER BY created_at DESC').all(personaId);
  },

  saveVariant(v) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare(`
      INSERT INTO persona_variants (
        id, persona_id, pose, clothing, attitude, setting, image_path,
        consistency_distance, consistency_grade, consistency_anchor
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      v.persona_id,
      v.pose,
      v.clothing,
      v.attitude,
      v.setting,
      v.image_path,
      v.consistency_distance != null ? Number(v.consistency_distance) : null,
      v.consistency_grade || null,
      v.consistency_anchor || null
    );
    syncDbToWorkspace();
    syncPersonasJson();
    return db.prepare('SELECT * FROM persona_variants WHERE id = ?').get(id);
  },

  updateVariantConsistency(id, { distance, grade, anchor } = {}) {
    db.prepare(`
      UPDATE persona_variants
      SET consistency_distance = ?, consistency_grade = ?, consistency_anchor = ?
      WHERE id = ?
    `).run(
      distance != null ? Number(distance) : null,
      grade || null,
      anchor || null,
      id
    );
    syncDbToWorkspace();
    syncPersonasJson();
    return db.prepare('SELECT * FROM persona_variants WHERE id = ?').get(id);
  },

  deleteVariant(id) {
    db.prepare('DELETE FROM persona_variants WHERE id = ?').run(id);
    syncDbToWorkspace();
    syncPersonasJson();
    return true;
  },

  /** Fase L — fila LoRA por persona (null si no existe). */
  getPersonaLora(personaId) {
    if (!personaId) return null;
    try {
      return db.prepare('SELECT * FROM persona_loras WHERE persona_id = ?').get(personaId) || null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Upsert LoRA metadata. status: none|dataset_ready|training|ready|failed
   */
  upsertPersonaLora({
    personaId,
    triggerToken = null,
    baseModel = null,
    weightsPath = null,
    status = 'none',
    trainingMeta = null
  } = {}) {
    if (!personaId) throw new Error('personaId required');
    const { v4: uuidv4 } = require('uuid');
    const existing = this.getPersonaLora(personaId);
    const id = existing?.id || `pl_${uuidv4().slice(0, 12)}`;
    let metaJson = null;
    if (trainingMeta != null) {
      metaJson = typeof trainingMeta === 'string' ? trainingMeta : JSON.stringify(trainingMeta);
    } else if (existing?.training_meta) {
      metaJson = existing.training_meta;
    }
    const trigger = triggerToken != null ? triggerToken : (existing?.trigger_token || null);
    const base = baseModel != null ? baseModel : (existing?.base_model || null);
    const weights = weightsPath != null ? weightsPath : (existing?.weights_path || null);
    const st = status || existing?.status || 'none';

    db.prepare(`
      INSERT INTO persona_loras (
        id, persona_id, trigger_token, base_model, weights_path, status, training_meta, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(persona_id) DO UPDATE SET
        trigger_token = excluded.trigger_token,
        base_model = excluded.base_model,
        weights_path = excluded.weights_path,
        status = excluded.status,
        training_meta = excluded.training_meta,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, personaId, trigger, base, weights, st, metaJson);

    syncDbToWorkspace();
    return this.getPersonaLora(personaId);
  },

  clearPersonaLora(personaId) {
    if (!personaId) return false;
    db.prepare('DELETE FROM persona_loras WHERE persona_id = ?').run(personaId);
    syncDbToWorkspace();
    return true;
  },

  setMainVariant(personaId, imagePath) {
    db.prepare('UPDATE personas SET image = ?, imageUGC = ? WHERE id = ?').run(imagePath, imagePath, personaId);
    syncDbToWorkspace();
    syncPersonasJson();
    return this.getPersonaById(personaId);
  },

  saveGeneration(gen) {
    const id = gen.id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`INSERT INTO generation_history (id, persona_id, prompt, image_path, generation_type, metadata) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, gen.persona_id, gen.prompt || '', gen.image_path, gen.generation_type || 'portrait', gen.metadata || '{}');
    syncDbToWorkspace();
    return id;
  },

  getGenerationsForPersona(personaId) {
    return db.prepare('SELECT * FROM generation_history WHERE persona_id = ? ORDER BY created_at DESC').all(personaId);
  },

  getGenerationById(id) {
    if (!id) return null;
    return db.prepare('SELECT * FROM generation_history WHERE id = ?').get(id) || null;
  },

  deleteGeneration(id) {
    db.prepare('DELETE FROM generation_history WHERE id = ?').run(id);
    syncDbToWorkspace();
  },

  updateGenerationPersonaId(oldId, newId) {
    db.prepare('UPDATE generation_history SET persona_id = ? WHERE persona_id = ?').run(newId, oldId);
    syncDbToWorkspace();
  },

  getGenerationStats(profileId = null) {
    // UX-3e — contar solo gens de personas del perfil activo (antes era global y mentía el dashboard)
    if (profileId) {
      const total = db.prepare(`
        SELECT COUNT(*) as count FROM generation_history g
        INNER JOIN personas p ON p.id = g.persona_id
        WHERE p.profile_id = ?
      `).get(profileId);
      const byType = db.prepare(`
        SELECT g.generation_type, COUNT(*) as count FROM generation_history g
        INNER JOIN personas p ON p.id = g.persona_id
        WHERE p.profile_id = ?
        GROUP BY g.generation_type
      `).all(profileId);
      const byPersona = db.prepare(`
        SELECT g.persona_id, COUNT(*) as count FROM generation_history g
        INNER JOIN personas p ON p.id = g.persona_id
        WHERE p.profile_id = ?
        GROUP BY g.persona_id
        ORDER BY count DESC
      `).all(profileId);
      return { total: total.count, byType, byPersona };
    }
    const total = db.prepare('SELECT COUNT(*) as count FROM generation_history').get();
    const byType = db.prepare('SELECT generation_type, COUNT(*) as count FROM generation_history GROUP BY generation_type').all();
    const byPersona = db.prepare('SELECT persona_id, COUNT(*) as count FROM generation_history GROUP BY persona_id ORDER BY count DESC').all();
    return { total: total.count, byType, byPersona };
  },

  /** UX-3d — scripts reales guardados en campañas del perfil (no campañas×10). */
  countScriptsForProfile(profileId = null) {
    if (profileId) {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM scripts s
        INNER JOIN campaigns c ON c.id = s.campaign_id
        WHERE c.profile_id = ?
      `).get(profileId);
      return row?.count || 0;
    }
    const row = db.prepare('SELECT COUNT(*) as count FROM scripts').get();
    return row?.count || 0;
  },

  /**
   * W7 — métrica local free vs paid (sin Replicate aún: provider=pollinations).
   * @param {{ profile_id?: string, persona_id?: string, provider?: string, generation_type?: string, ok?: boolean, error_code?: string, duration_ms?: number }} row
   */
  recordGenMetric(row = {}) {
    const { v4: uuidv4 } = require('uuid');
    const id = row.id || `gm_${uuidv4().slice(0, 12)}`;
    const ok = row.ok === false || row.ok === 0 ? 0 : 1;
    db.prepare(`
      INSERT INTO gen_metrics (id, profile_id, persona_id, provider, generation_type, ok, error_code, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      row.profile_id || null,
      row.persona_id || null,
      row.provider || 'pollinations',
      row.generation_type || 'portrait',
      ok,
      row.error_code || null,
      row.duration_ms != null ? Number(row.duration_ms) : null
    );
    return id;
  },

  /**
   * W17 — audit log local (best-effort; no debe romper la operación).
   * @param {{ profile_id?: string, actor_profile_id?: string, action: string, entity_type?: string, entity_id?: string, meta?: object }} row
   */
  recordAuditEvent(row = {}) {
    try {
      if (!row.action) return null;
      const { v4: uuidv4 } = require('uuid');
      const id = row.id || `ae_${uuidv4().slice(0, 12)}`;
      let metaJson = null;
      if (row.meta != null) {
        metaJson = typeof row.meta === 'string' ? row.meta : JSON.stringify(row.meta);
      }
      db.prepare(`
        INSERT INTO audit_events (id, profile_id, actor_profile_id, action, entity_type, entity_id, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        row.profile_id || null,
        row.actor_profile_id || null,
        String(row.action).slice(0, 80),
        row.entity_type ? String(row.entity_type).slice(0, 40) : null,
        row.entity_id != null ? String(row.entity_id).slice(0, 120) : null,
        metaJson
      );
      return id;
    } catch (err) {
      console.warn('[audit] record failed:', err.message);
      return null;
    }
  },

  /**
   * W17 — últimas N filas (solo admin en la ruta).
   * @param {{ limit?: number }} [opts]
   */
  listAuditEvents({ limit = 50 } = {}) {
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const rows = db.prepare(`
      SELECT id, profile_id, actor_profile_id, action, entity_type, entity_id, meta_json, created_at
      FROM audit_events
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(lim);

    // Enrich actor names (best-effort)
    const nameById = new Map();
    try {
      db.prepare('SELECT id, name FROM studio_profiles').all().forEach((p) => {
        nameById.set(p.id, p.name);
      });
    } catch (_) {}

    return rows.map((r) => {
      let meta = null;
      if (r.meta_json) {
        try { meta = JSON.parse(r.meta_json); } catch (_) { meta = r.meta_json; }
      }
      return {
        id: r.id,
        profile_id: r.profile_id,
        actor_profile_id: r.actor_profile_id,
        actor_name: nameById.get(r.actor_profile_id) || null,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        meta,
        created_at: r.created_at
      };
    });
  },

  /**
   * Resumen de gen_metrics. Admin: todos los perfiles o filtro.
   * Member: solo su profile_id.
   */
  getGenMetricsSummary({ profileId = null, sinceDays = 30 } = {}) {
    const days = Math.max(1, Math.min(365, Number(sinceDays) || 30));
    const params = [];
    let where = `created_at >= datetime('now', ?)`;
    params.push(`-${days} days`);
    if (profileId) {
      where += ' AND profile_id = ?';
      params.push(profileId);
    }

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN ok = 0 AND (error_code = '429' OR error_code LIKE '%429%') THEN 1 ELSE 0 END) AS fail_429,
        SUM(CASE WHEN generation_type IN ('portrait', 'anchor_pack') AND ok = 1 THEN 1 ELSE 0 END) AS portraits,
        SUM(CASE WHEN generation_type = 'variant' AND ok = 1 THEN 1 ELSE 0 END) AS variants,
        SUM(CASE WHEN provider = 'pollinations' THEN 1 ELSE 0 END) AS provider_pollinations,
        SUM(CASE WHEN provider != 'pollinations' THEN 1 ELSE 0 END) AS provider_other
      FROM gen_metrics
      WHERE ${where}
    `).get(...params);

    const byType = db.prepare(`
      SELECT generation_type, COUNT(*) AS count,
        SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fail_count
      FROM gen_metrics
      WHERE ${where}
      GROUP BY generation_type
      ORDER BY count DESC
    `).all(...params);

    const byProfile = db.prepare(`
      SELECT profile_id,
        COUNT(*) AS total,
        SUM(CASE WHEN generation_type IN ('portrait', 'anchor_pack') AND ok = 1 THEN 1 ELSE 0 END) AS portraits,
        SUM(CASE WHEN generation_type = 'variant' AND ok = 1 THEN 1 ELSE 0 END) AS variants,
        SUM(CASE WHEN ok = 0 AND (error_code = '429' OR error_code LIKE '%429%') THEN 1 ELSE 0 END) AS fail_429
      FROM gen_metrics
      WHERE ${where}
      GROUP BY profile_id
      ORDER BY total DESC
    `).all(...params);

    return {
      sinceDays: days,
      totals: {
        total: totals?.total || 0,
        ok: totals?.ok_count || 0,
        fail: totals?.fail_count || 0,
        fail429: totals?.fail_429 || 0,
        portraits: totals?.portraits || 0,
        variants: totals?.variants || 0,
        providerPollinations: totals?.provider_pollinations || 0,
        providerOther: totals?.provider_other || 0
      },
      byType,
      byProfile
    };
  },

  getAllWorkspaces() {
    return db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all();
  },

  createWorkspace(w) {
    const { v4: uuidv4 } = require('uuid');
    const id = w.id || `ws_${Date.now()}`;
    db.prepare(`INSERT INTO workspaces (id, name, brand_niche) VALUES (?, ?, ?)`).run(id, w.name, w.brand_niche || 'General');
    syncDbToWorkspace();
    return this.getAllWorkspaces();
  },

  // ─── Studio profiles (local multi-user, free) ─────────────────
  listStudioProfilesPublic({ forLogin = false } = {}) {
    const rows = db.prepare(`
      SELECT id, name, role, active, created_at, last_login_at,
             google_sub, google_email, auth_provider, pin_salt
      FROM studio_profiles
      WHERE active = 1
      ORDER BY created_at ASC
    `).all();
    if (!forLogin) return rows;
    return rows.filter((p) => {
      if (isHarnessStudioProfileName(p.name)) return false;
      // Login PIN: ocultar perfiles solo-Google (no tienen PIN usable)
      if (p.pin_salt === 'google-oauth-only' || (p.auth_provider === 'google' && !p.pin_salt)) return false;
      return true;
    });
  },

  listStudioProfilesAdmin() {
    return this.listStudioProfilesPublic();
  },

  isHarnessStudioProfileName,

  getStudioProfileById(id) {
    return db.prepare('SELECT * FROM studio_profiles WHERE id = ?').get(id);
  },

  findStudioProfileByPin(pin) {
    const rows = db.prepare('SELECT * FROM studio_profiles WHERE active = 1').all();
    for (const row of rows) {
      if (row.pin_salt === 'google-oauth-only') continue;
      if (authCrypto.verifyPinHash(pin, row.pin_salt, row.pin_hash)) return row;
    }
    return null;
  },

  findStudioProfileByGoogleSub(sub) {
    if (!sub) return null;
    return db.prepare(
      'SELECT * FROM studio_profiles WHERE google_sub = ? AND active = 1'
    ).get(String(sub));
  },

  /**
   * Crea o reutiliza perfil member aislado para una cuenta Google.
   * PIN sentinel no usable — el login es solo vía OAuth.
   */
  findOrCreateStudioProfileFromGoogle({ sub, email, name }) {
    const { v4: uuidv4 } = require('uuid');
    const cleanSub = String(sub || '').trim();
    if (!cleanSub) throw new Error('google_sub requerido');
    const existing = this.findStudioProfileByGoogleSub(cleanSub);
    if (existing) return existing;

    let baseName = String(name || '').trim() || (email ? String(email).split('@')[0] : '') || 'Usuario Google';
    baseName = baseName.slice(0, 80);
    let cleanName = baseName;
    let n = 2;
    while (db.prepare('SELECT id FROM studio_profiles WHERE LOWER(name) = LOWER(?)').get(cleanName)) {
      cleanName = `${baseName} (${n})`;
      n += 1;
      if (n > 50) throw new Error('No se pudo asignar nombre de perfil único.');
    }

    const id = uuidv4();
    const salt = 'google-oauth-only';
    const hash = authCrypto.hashPin(require('crypto').randomBytes(24).toString('hex')).hash;
    db.prepare(`
      INSERT INTO studio_profiles
        (id, name, pin_hash, pin_salt, role, active, google_sub, google_email, auth_provider)
      VALUES (?, ?, ?, ?, 'member', 1, ?, ?, 'google')
    `).run(
      id,
      cleanName,
      hash,
      salt,
      cleanSub,
      email ? String(email).trim().toLowerCase() : null
    );
    syncDbToWorkspace();
    return this.getStudioProfileById(id);
  },

  touchStudioProfileLogin(id) {
    db.prepare('UPDATE studio_profiles SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  },

  createStudioProfile({ name, pin, role = 'member' }) {
    const { v4: uuidv4 } = require('uuid');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('El nombre del perfil es obligatorio.');
    if (!pin || String(pin).trim().length < 4) throw new Error('El PIN debe tener al menos 4 caracteres.');
    const exists = db.prepare('SELECT id FROM studio_profiles WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (exists) throw new Error('Ya existe un perfil con ese nombre.');
    const { salt, hash } = authCrypto.hashPin(pin);
    const id = uuidv4();
    const normalizedRole = normalizeProfileRole(role);
    db.prepare(`
      INSERT INTO studio_profiles (id, name, pin_hash, pin_salt, role, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(id, cleanName, hash, salt, normalizedRole);
    syncDbToWorkspace();
    return this.getStudioProfileById(id);
  },

  updateStudioProfile(id, { name, pin, active } = {}) {
    const row = this.getStudioProfileById(id);
    if (!row) throw new Error('Perfil no encontrado.');
    const nextName = name != null ? String(name).trim() : row.name;
    if (!nextName) throw new Error('El nombre del perfil es obligatorio.');
    if (name != null) {
      const clash = db.prepare('SELECT id FROM studio_profiles WHERE LOWER(name) = LOWER(?) AND id != ?').get(nextName, id);
      if (clash) throw new Error('Ya existe un perfil con ese nombre.');
    }
    let hash = row.pin_hash;
    let salt = row.pin_salt;
    if (pin != null && String(pin).trim() !== '') {
      if (String(pin).trim().length < 4) throw new Error('El PIN debe tener al menos 4 caracteres.');
      const h = authCrypto.hashPin(pin);
      hash = h.hash;
      salt = h.salt;
    }
    const nextActive = active === undefined ? row.active : (active ? 1 : 0);
    db.prepare(`
      UPDATE studio_profiles SET name = ?, pin_hash = ?, pin_salt = ?, active = ? WHERE id = ?
    `).run(nextName, hash, salt, nextActive, id);
    syncDbToWorkspace();
    return this.getStudioProfileById(id);
  },

  deleteStudioProfile(id) {
    const row = this.getStudioProfileById(id);
    if (!row) throw new Error('Perfil no encontrado.');
    if (isAdminRole(row.role)) {
      const admins = db.prepare(`
        SELECT COUNT(*) AS c FROM studio_profiles
        WHERE role IN ('admin', 'owner') AND active = 1
      `).get().c;
      if (admins <= 1) {
        throw new Error('No puedes eliminar el último perfil de Administración.');
      }
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM studio_profiles WHERE active = 1`).get().c;
    if (total <= 1) throw new Error('Debe quedar al menos un perfil activo.');
    const fallback = db.prepare(`
      SELECT id FROM studio_profiles WHERE id != ? AND active = 1 ORDER BY created_at ASC LIMIT 1
    `).get(id);
    if (fallback) {
      db.prepare(`UPDATE personas SET profile_id = ? WHERE profile_id = ?`).run(fallback.id, id);
      db.prepare(`UPDATE products SET profile_id = ? WHERE profile_id = ?`).run(fallback.id, id);
      db.prepare(`UPDATE campaigns SET profile_id = ? WHERE profile_id = ?`).run(fallback.id, id);
      db.prepare(`UPDATE prompt_gallery SET profile_id = ? WHERE profile_id = ?`).run(fallback.id, id);
    }
    try {
      db.prepare(`UPDATE studio_invites SET used_by_profile_id = NULL WHERE used_by_profile_id = ?`).run(id);
      db.prepare(`UPDATE studio_invites SET invited_by = NULL WHERE invited_by = ?`).run(id);
    } catch (_) { /* tabla ausente en DBs muy viejas */ }
    db.prepare('DELETE FROM studio_profiles WHERE id = ?').run(id);
    syncDbToWorkspace();
    return true;
  },

  countPersonasForProfile(profileId) {
    return db.prepare('SELECT COUNT(*) AS c FROM personas WHERE profile_id = ?').get(profileId).c;
  },

  // ─── Invitaciones (admin → testers aislados) ───────────────────
  generateInviteCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    const bytes = require('crypto').randomBytes(8);
    for (let i = 0; i < 8; i++) suffix += alphabet[bytes[i] % alphabet.length];
    return `INFLU-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
  },

  listStudioInvites() {
    return db.prepare(`
      SELECT i.*,
        inv.name AS invited_by_name,
        used.name AS used_by_name
      FROM studio_invites i
      LEFT JOIN studio_profiles inv ON inv.id = i.invited_by
      LEFT JOIN studio_profiles used ON used.id = i.used_by_profile_id
      ORDER BY i.created_at DESC
    `).all();
  },

  getStudioInviteById(id) {
    return db.prepare('SELECT * FROM studio_invites WHERE id = ?').get(id);
  },

  getStudioInviteByCode(code) {
    const clean = normalizeInviteCode(code);
    if (!clean) return null;
    return db.prepare('SELECT * FROM studio_invites WHERE UPPER(code) = ?').get(clean);
  },

  createStudioInvite({ invitedBy, note = '', emailHint = '', expiresInDays = 14, maxUses = 1 } = {}) {
    const { v4: uuidv4 } = require('uuid');
    if (!invitedBy) throw new Error('invitedBy es obligatorio.');
    const inviter = this.getStudioProfileById(invitedBy);
    if (!inviter || !isAdminRole(inviter.role)) {
      throw new Error('Solo Administración puede crear invitaciones.');
    }
    const days = Math.max(1, Math.min(365, Number(expiresInDays) || 14));
    const uses = Math.max(1, Math.min(50, Number(maxUses) || 1));
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    let code = this.generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = db.prepare('SELECT id FROM studio_invites WHERE code = ?').get(code);
      if (!clash) break;
      code = this.generateInviteCode();
    }
    const id = uuidv4();
    db.prepare(`
      INSERT INTO studio_invites (
        id, code, note, email_hint, invited_by, expires_at, max_uses, use_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      code,
      String(note || '').trim().slice(0, 200) || null,
      String(emailHint || '').trim().slice(0, 120) || null,
      invitedBy,
      expires,
      uses
    );
    syncDbToWorkspace();
    return this.getStudioInviteById(id);
  },

  revokeStudioInvite(id, actorProfileId) {
    const invite = this.getStudioInviteById(id);
    if (!invite) throw new Error('Invitación no encontrada.');
    if (invite.revoked_at) throw new Error('La invitación ya estaba revocada.');
    const actor = this.getStudioProfileById(actorProfileId);
    if (!actor || !isAdminRole(actor.role)) {
      throw new Error('Solo Administración puede revocar invitaciones.');
    }
    db.prepare(`UPDATE studio_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    syncDbToWorkspace();
    return this.getStudioInviteById(id);
  },

  /**
   * Canjea código → nuevo perfil member con roster vacío (creaciones no se mezclan).
   */
  redeemStudioInvite({ code, name, pin }) {
    const invite = this.getStudioInviteByCode(code);
    if (!invite) throw new Error('Código de invitación no válido.');
    if (invite.revoked_at) throw new Error('Esta invitación fue revocada.');
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error('Esta invitación ha caducado.');
    }
    const maxUses = invite.max_uses == null ? 1 : Number(invite.max_uses);
    const useCount = Number(invite.use_count || 0);
    if (useCount >= maxUses) throw new Error('Esta invitación ya fue usada.');

    const profile = this.createStudioProfile({ name, pin, role: 'member' });
    db.prepare(`
      UPDATE studio_invites
      SET use_count = use_count + 1,
          used_at = CURRENT_TIMESTAMP,
          used_by_profile_id = ?
      WHERE id = ?
    `).run(profile.id, invite.id);
    syncDbToWorkspace();
    return {
      profile,
      invite: this.getStudioInviteById(invite.id)
    };
  },

  getSchemaVersion() {
    return getSchemaVersion(db);
  },

  listMigrations() {
    return db.prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id ASC').all();
  },

  getBackupMeta() {
    try {
      return db.prepare('SELECT * FROM backup_meta WHERE id = 1').get() || null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Límite de snapshots a conservar (W10). Env BACKUP_KEEP, default 10, mínimo 1.
   */
  getBackupKeepLimit() {
    const raw = parseInt(String(process.env.BACKUP_KEEP || '10'), 10);
    if (!Number.isFinite(raw) || raw < 1) return 10;
    return raw;
  },

  /**
   * Borra los .sqlite más antiguos (y su *_personas.json) dejando solo `keep` más recientes.
   */
  pruneBackupSnapshots(keep = null) {
    const limit = keep == null ? this.getBackupKeepLimit() : Math.max(1, parseInt(keep, 10) || 1);
    const snaps = this.listBackupSnapshots(); // newest first
    const toRemove = snaps.slice(limit);
    let pruned = 0;
    for (const s of toRemove) {
      try {
        if (fs.existsSync(s.path)) fs.unlinkSync(s.path);
        pruned += 1;
      } catch (_) {}
      const twin = s.path.replace(/\.sqlite$/i, '_personas.json');
      try {
        if (fs.existsSync(twin)) fs.unlinkSync(twin);
      } catch (_) {}
    }
    return { keep: limit, totalBefore: snaps.length, pruned, remaining: Math.min(snaps.length, limit) };
  },

  /**
   * Copia data/influ.sqlite a data/backups/ y escribe un export JSON de personas
   * desde SQLite (W6 — sin mirror de raíz). Tras crear, rota según BACKUP_KEEP (W10).
   */
  createBackupSnapshot(label = '') {
    const backupsDir = ensureDir(path.join(DATA_DIR, 'backups'));
    // hrtime evita colisiones de mtime/ISO en ráfagas (tests / restore)
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}_${String(process.hrtime.bigint()).slice(-8)}`;
    const safeLabel = String(label || 'manual').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const base = `influ_${stamp}_${safeLabel}`;
    const destDb = path.join(backupsDir, `${base}.sqlite`);
    const destJson = path.join(backupsDir, `${base}_personas.json`);

    // Checkpoint WAL so the copy is consistent
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    fs.copyFileSync(ACTIVE_DB_PATH, destDb);

    try {
      fs.writeFileSync(destJson, JSON.stringify(buildPersonasExportPayload(), null, 2), 'utf8');
    } catch (err) {
      console.warn('[db] Backup personas JSON skip:', err.message);
    }

    try {
      db.prepare(`
        UPDATE backup_meta SET last_backup_at = CURRENT_TIMESTAMP, last_backup_path = ? WHERE id = 1
      `).run(destDb);
    } catch (_) {}

    // Evitar colisiones de mtime en rotación rápida (tests / ráfagas)
    try {
      const now = Date.now();
      fs.utimesSync(destDb, now / 1000, now / 1000);
    } catch (_) {}

    const rotation = this.pruneBackupSnapshots();

    syncDbToWorkspace();
    return {
      ok: true,
      dbPath: destDb,
      personasJsonPath: fs.existsSync(destJson) ? destJson : null,
      schemaVersion: getSchemaVersion(db),
      createdAt: new Date().toISOString(),
      rotation
    };
  },

  listBackupSnapshots() {
    const backupsDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupsDir)) return [];
    return fs.readdirSync(backupsDir)
      .filter((f) => f.endsWith('.sqlite'))
      .map((f) => {
        const abs = path.join(backupsDir, f);
        const st = fs.statSync(abs);
        return { filename: f, path: abs, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => {
        if (a.mtime !== b.mtime) return a.mtime < b.mtime ? 1 : -1;
        return a.filename < b.filename ? 1 : -1; // ISO+hrtime: más nuevo al inicio
      });
  },

  /**
   * Restaura desde un .sqlite bajo data/backups/ (o path absoluto permitido).
   * Cierra el handle actual no es trivial con better-sqlite3 singleton —
   * copiamos encima tras checkpoint y el proceso debe reiniciar el proceso.
   */
  restoreBackupFromFile(absPath) {
    const resolved = path.resolve(absPath);
    const backupsDir = path.resolve(path.join(DATA_DIR, 'backups'));
    if (!resolved.startsWith(backupsDir + path.sep) && resolved !== ACTIVE_DB_PATH) {
      throw new Error('Solo se pueden restaurar snapshots desde data/backups/.');
    }
    if (!fs.existsSync(resolved)) throw new Error('Archivo de backup no encontrado.');

    // Safety snapshot first
    const safety = this.createBackupSnapshot('pre_restore');
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    fs.copyFileSync(resolved, ACTIVE_DB_PATH);
    syncDbToWorkspace();
    return {
      ok: true,
      restoredFrom: resolved,
      safetyBackup: safety.dbPath,
      restartRequired: true,
      message: 'Backup restaurado. Reinicia el servidor (npm start) para recargar SQLite.'
    };
  }
};
