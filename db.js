const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const WORKSPACE_DB_PATH = path.join(__dirname, 'influ.sqlite');
const SCRATCH_DIR = 'C:/Users/oscar/.gemini/antigravity/brain/7d7c6673-5ef4-440b-aa1e-adaeba8ce81d/scratch';
const SCRATCH_DB_PATH = path.join(SCRATCH_DIR, 'influ.sqlite');

// Ensure scratch directory exists
if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

// Open DB in scratch directory for persistence
const db = new Database(SCRATCH_DB_PATH);

// Helper to sync DB back to workspace so git can track it
function syncDbToWorkspace() {
  try {
    fs.copyFileSync(SCRATCH_DB_PATH, WORKSPACE_DB_PATH);
    console.log(`Synced database to workspace: ${WORKSPACE_DB_PATH}`);
  } catch (err) {
    console.error('Failed to sync DB to workspace:', err);
  }
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT,
    age TEXT,
    ethnicity TEXT,
    style TEXT,
    hair TEXT,
    lighting TEXT,
    camera TEXT,
    clothing TEXT,
    setting TEXT,
    image TEXT,
    imageUGC TEXT,
    handle TEXT,
    detailedJSON TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    benefit TEXT,
    audience TEXT,
    frustration TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_id TEXT,
    status TEXT DEFAULT 'draft', -- draft, active, completed
    budget REAL DEFAULT 0,
    client_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS campaign_personas (
    campaign_id TEXT,
    persona_id TEXT,
    PRIMARY KEY(campaign_id, persona_id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    angle TEXT,
    hook TEXT,
    hookCue TEXT,
    demo TEXT,
    demoCue TEXT,
    turn TEXT,
    turnCue TEXT,
    cta TEXT,
    ctaCue TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prompt_gallery (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    persona_id TEXT,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    full_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE CASCADE
  );
`);

syncDbToWorkspace();

// Data migration helper (migrates from personas.json and products.json if DB is empty)
function runMigrations() {
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
  syncDbToWorkspace();
}

module.exports = {
  db,
  syncDbToWorkspace,
  runMigrations,
  
  // Personas CRUD
  getAllPersonas() {
    return db.prepare('SELECT * FROM personas ORDER BY created_at DESC').all();
  },
  
  getPersonaById(id) {
    return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  },

  getPersonaByName(name) {
    return db.prepare('SELECT * FROM personas WHERE LOWER(name) = LOWER(?)').get(name);
  },
  
  savePersona(p) {
    const { v4: uuidv4 } = require('uuid');
    const existing = db.prepare('SELECT * FROM personas WHERE id = ? OR LOWER(name) = LOWER(?)').get(p.id || '', p.name);
    
    if (existing) {
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

      // Update
      db.prepare(`
        UPDATE personas
        SET name = ?, gender = ?, age = ?, ethnicity = ?, style = ?, hair = ?, lighting = ?, camera = ?, clothing = ?, setting = ?, image = ?, imageUGC = ?, handle = ?, detailedJSON = ?
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
        JSON.stringify(p.detailedJSON || {}),
        existing.id
      );
      syncDbToWorkspace();
      return this.getPersonaById(existing.id);
    } else {
      const id = p.id || uuidv4();
      db.prepare(`
        INSERT INTO personas (id, name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting, image, imageUGC, handle, detailedJSON)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
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
        p.image || (p.gender === 'Male' ? 'assets/influencer_male.png' : 'assets/influencer_female.png'),
        p.imageUGC || (p.gender === 'Male' ? 'assets/influencer_male_bottle.png' : 'assets/influencer_female_serum.png'),
        p.handle || `@${p.name.toLowerCase()}_ai_ugc`,
        JSON.stringify(p.detailedJSON || {})
      );
      syncDbToWorkspace();
      return this.getPersonaById(id);
    }
  },

  getVersionsForPersona(personaId) {
    return db.prepare('SELECT * FROM versions WHERE persona_id = ? ORDER BY created_at DESC').all();
  },

  revertPersonaVersion(personaId, versionId) {
    const version = db.prepare('SELECT * FROM versions WHERE id = ? AND persona_id = ?').get(versionId, personaId);
    if (!version) return null;
    const oldData = JSON.parse(version.full_json);
    return this.savePersona(oldData);
  },

  // Products CRUD
  getAllProducts() {
    return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  },

  getProductById(id) {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  },

  getProductByName(name) {
    return db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(name);
  },

  saveProduct(p) {
    const { v4: uuidv4 } = require('uuid');
    const existing = db.prepare('SELECT * FROM products WHERE id = ? OR LOWER(name) = LOWER(?)').get(p.id || '', p.name);
    if (existing) {
      db.prepare(`
        UPDATE products
        SET name = ?, benefit = ?, audience = ?, frustration = ?, image = ?
        WHERE id = ?
      `).run(
        p.name,
        p.benefit,
        p.audience,
        p.frustration,
        p.image || existing.image,
        existing.id
      );
      syncDbToWorkspace();
      return this.getProductById(existing.id);
    } else {
      const id = p.id || uuidv4();
      db.prepare(`
        INSERT INTO products (id, name, benefit, audience, frustration, image)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        p.name,
        p.benefit,
        p.audience,
        p.frustration,
        p.image || 'assets/product_serum.png'
      );
      syncDbToWorkspace();
      return this.getProductById(id);
    }
  },

  // Campaigns CRUD
  getAllCampaigns() {
    const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    return campaigns.map(c => {
      c.personas = db.prepare(`
        SELECT p.* FROM personas p
        JOIN campaign_personas cp ON p.id = cp.persona_id
        WHERE cp.campaign_id = ?
      `).all(c.id);
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
    `).all(c.id);
    c.product = db.prepare('SELECT * FROM products WHERE id = ?').get(c.product_id);
    c.scripts = db.prepare('SELECT * FROM scripts WHERE campaign_id = ?').all(c.id);
    return c;
  },

  saveCampaign(c, personaIds = []) {
    const { v4: uuidv4 } = require('uuid');
    const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(c.id || '');
    const id = c.id || uuidv4();

    if (existing) {
      db.prepare(`
        UPDATE campaigns
        SET name = ?, product_id = ?, status = ?, budget = ?, client_name = ?
        WHERE id = ?
      `).run(
        c.name,
        c.product_id,
        c.status || 'draft',
        c.budget || 0,
        c.client_name,
        id
      );
    } else {
      db.prepare(`
        INSERT INTO campaigns (id, name, product_id, status, budget, client_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        c.name,
        c.product_id,
        c.status || 'draft',
        c.budget || 0,
        c.client_name
      );
    }

    // Update campaign personas
    db.prepare('DELETE FROM campaign_personas WHERE campaign_id = ?').run(id);
    const insertCP = db.prepare('INSERT INTO campaign_personas (campaign_id, persona_id) VALUES (?, ?)');
    db.transaction(() => {
      personaIds.forEach(pId => {
        insertCP.run(id, pId);
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

  // Gallery CRUD
  saveToGallery(prompt, imagePath) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare('INSERT INTO prompt_gallery (id, prompt, image_path) VALUES (?, ?, ?)')
      .run(id, prompt, imagePath);
    syncDbToWorkspace();
    return { id, prompt, image_path: imagePath };
  },

  getGalleryItems() {
    return db.prepare('SELECT * FROM prompt_gallery ORDER BY created_at DESC').all();
  }
};
