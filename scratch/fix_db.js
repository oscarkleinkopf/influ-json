const db = require('../db');

try {
  // Update female personas to use the generated Nano Banana portrait asset
  const result = db.db.prepare(`
    UPDATE personas 
    SET image = 'assets/nano_banana_influencer.png', 
        imageUGC = 'assets/nano_banana_ugc.png' 
    WHERE LOWER(gender) = 'female' 
       OR LOWER(name) LIKE '%colorina%' 
       OR LOWER(name) LIKE '%sofia%'
  `).run();
  
  db.syncDbToWorkspace();
  console.log(`Updated ${result.changes} personas successfully.`);
} catch (err) {
  console.error('Error fixing DB:', err);
}
process.exit(0);
