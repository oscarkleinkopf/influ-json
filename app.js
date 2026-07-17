// State Management
let state = {
  personas: [],
  products: [],
  campaigns: [],
  selectedPersona: null,
  selectedProduct: null,
  selectedCampaign: null,
  scripts: [],
  selectedAngleIndex: 0,
  baseFee: 150,
  selectedLicenceDays: 90,
  galleryItems: [],
  activeTab: 'dashboard',
  personaFilter: 'active', // 'active' or 'archived' for select panel
  portfolioFilter: 'all', // 'all', 'active', 'archived'
  portfolioSearchQuery: '',
  activeVariants: [],
  generationHistory: [],
  historyFilter: 'all' // 'all', 'portrait', 'variant', 'ugc'
};

// Auth session token (stored in memory/sessionStorage)
let studioPin = sessionStorage.getItem('studioPin') || '';

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');
const gitIndicator = document.getElementById('gitIndicator');
const gitStatusText = document.getElementById('gitStatusText');
const btnSyncNow = document.getElementById('btnSyncNow');
const syncBanner = document.getElementById('syncBanner');
const syncBannerText = document.getElementById('syncBannerText');

// Unified authenticated fetch helper
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
  }
  if (studioPin) {
    options.headers['Authorization'] = `Bearer ${studioPin}`;
  }

  const res = await fetch(url, options);
  
  if (res.status === 401) {
    showLoginScreen();
    throw new Error('Unauthorized');
  }
  
  return res;
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  checkAuthAndInit();
  setupLogin();
  setupPersonaEngine();
  setupPhotoUpload();
  setupABComparator();
  setupVersionHistory();
  setupCampaigns();
  setupScriptEngine();
  setupUgcStudio();
  setupLicensing();
  setupGallery();
  setupVariantManager();
  initImportModal();
  
  btnSyncNow.addEventListener('click', manualGitSync);
});

// Authentication Modal Logic
function checkAuthAndInit() {
  fetch('/api/status')
    .then(res => res.json())
    .then(status => {
      if (status.pinRequired && !studioPin) {
        showLoginScreen();
      } else {
        fetchData();
      }
    });
}

function showLoginScreen() {
  document.getElementById('loginModal').style.display = 'flex';
}

function hideLoginScreen() {
  document.getElementById('loginModal').style.display = 'none';
}

function setupLogin() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('loginPinInput').value;
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      
      if (data.success) {
        studioPin = pin;
        sessionStorage.setItem('studioPin', pin);
        hideLoginScreen();
        fetchData();
      } else {
        alert('PIN incorrecto. Inténtalo de nuevo.');
      }
    } catch (err) {
      alert('Error de conexión al autenticar.');
    }
  });
}

// Tab Switcher Logic
function setupTabs() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      state.activeTab = tabId;
      
      // Update active nav class
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update active panel class
      tabPanels.forEach(panel => {
        if (panel.id === tabId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
      
      // Hook triggers for specific tabs
      if (tabId === 'campaigns') renderCampaigns();
      if (tabId === 'gallery') renderGallery();
    });
  });
}

// Fetch Initial Data
async function fetchData() {
  try {
    const res = await authFetch('/api/data');
    const data = await res.json();
    
    state.personas = data.personas;
    state.products = data.products;
    state.generationStats = data.generationStats || { total: 0 };
    
    // Set defaults
    if (state.personas.length > 0) {
      selectPersona(state.personas[0]);
    }
    if (state.products.length > 0) state.selectedProduct = state.products[0];
    
    updateDashboardStats();
    renderPersonaGrids();
    populateActiveUgcData();
    generateMockScripts();
    updateLicensingCalculator();
  } catch (err) {
    console.error('Error fetching initial data:', err);
  }
}

// Dashboard Update
function updateDashboardStats() {
  const activeCount = state.personas.filter(p => !p.archived || p.archived === 0).length;
  document.getElementById('statPersonasCount').textContent = activeCount;
  document.getElementById('statProductsCount').textContent = state.products.length;
  
  // Total generations count from stats state
  const totalGens = state.generationStats?.total || 0;
  document.getElementById('statGenerationsCount').textContent = totalGens;

  // Let's approximate scripts count or use campaigns
  let scriptsCount = 0;
  try {
    scriptsCount = state.campaigns.length * 10;
  } catch(e) {}
  document.getElementById('statScriptsCount').textContent = scriptsCount || 10;
  
  const personaGrid = document.getElementById('dashboardPersonaGrid');
  if (!personaGrid) return;
  personaGrid.innerHTML = '';
  
  // Apply search query and filters
  let filtered = [...state.personas];
  
  // Filter by active/archived state
  if (state.portfolioFilter === 'active') {
    filtered = filtered.filter(p => !p.archived || p.archived === 0);
  } else if (state.portfolioFilter === 'archived') {
    filtered = filtered.filter(p => p.archived === 1);
  }
  
  // Search query filter
  if (state.portfolioSearchQuery) {
    const q = state.portfolioSearchQuery.toLowerCase();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.style && p.style.toLowerCase().includes(q)) ||
      (p.ethnicity && p.ethnicity.toLowerCase().includes(q)) ||
      (p.gender && p.gender.toLowerCase().includes(q))
    );
  }
  
  if (filtered.length === 0) {
    personaGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px; font-size: 14px;">
        🔍 No se encontraron influencers que coincidan con la búsqueda o filtro.
      </div>
    `;
    return;
  }
  
  filtered.forEach(p => {
    // Find generation counts for this persona from stats
    let personaGens = 0;
    if (state.generationStats?.byPersona) {
      const pStat = state.generationStats.byPersona.find(s => s.persona_id === p.id);
      if (pStat) personaGens = pStat.count;
    }

    const card = document.createElement('div');
    const isSelected = state.selectedPersona?.id === p.id;
    card.className = `portfolio-card ${isSelected ? 'selected' : ''}`;
    if (p.archived === 1) card.classList.add('archived-style');

    card.innerHTML = `
      <div class="portfolio-card-img-wrapper">
        <img src="${p.image}" alt="${p.name}">
        <span class="portfolio-badge badge-style">${p.style || 'Lifestyle'}</span>
        ${p.archived === 1 ? '<span class="portfolio-badge badge-archived">Archivado</span>' : ''}
      </div>
      <div class="portfolio-card-info">
        <div class="portfolio-card-title-row">
          <div class="portfolio-card-name">${p.name}</div>
          <div class="portfolio-card-gens">📸 ${personaGens} gen</div>
        </div>
        <div class="portfolio-card-tag">${p.age} • ${p.ethnicity || p.ethnicity_appearance || 'Latina'}</div>
        <div class="portfolio-card-actions">
          <button class="btn btn-primary btn-quick-select" style="font-size: 11px; padding: 6px 10px;">Seleccionar</button>
          <button class="btn btn-secondary btn-quick-history" style="font-size: 11px; padding: 6px 10px;">Historial</button>
          <button class="btn btn-quick-archive" style="font-size: 11px; padding: 6px 10px; background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--glass-border);">${p.archived === 1 ? 'Desarchivar' : 'Archivar'}</button>
        </div>
      </div>
    `;

    // Click on card selects influencer and navigates
    card.querySelector('.btn-quick-select').addEventListener('click', (e) => {
      e.stopPropagation();
      selectPersona(p);
      navigateToTab('persona-engine');
    });

    card.querySelector('.btn-quick-history').addEventListener('click', (e) => {
      e.stopPropagation();
      selectPersona(p);
      navigateToTab('persona-engine');
      // Scroll to history and show it
      setTimeout(() => {
        const histSec = document.getElementById('generationHistorySection');
        if (histSec) {
          histSec.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    });

    card.querySelector('.btn-quick-archive').addEventListener('click', async (e) => {
      e.stopPropagation();
      // Select the persona first so the action acts on it
      state.selectedPersona = p;
      await archivePersonaAction();
    });

    // Make clicking the card select it too
    card.addEventListener('click', () => {
      selectPersona(p);
    });

    personaGrid.appendChild(card);
  });
}

function setPortfolioFilter(filter) {
  state.portfolioFilter = filter;
  
  // Toggle active class on filter buttons
  document.getElementById('btnPortfolioAll').classList.toggle('active', filter === 'all');
  document.getElementById('btnPortfolioActive').classList.toggle('active', filter === 'active');
  document.getElementById('btnPortfolioArchived').classList.toggle('active', filter === 'archived');
  
  updateDashboardStats();
}

function navigateToTab(tabId) {
  // Simulates nav item click
  const navItem = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('data-tab') === tabId);
  if (navItem) {
    navItem.click();
  }
}

function resetPersonaFormForNew() {
  state.selectedPersona = null;
  uploadedImagePath = null;

  // Change config header title
  const editorTitle = document.getElementById('editorHeaderTitle');
  if (editorTitle) {
    editorTitle.textContent = "Configuración del Personaje (Nuevo desde Cero)";
  }

  // Change save button text
  const btnSave = document.getElementById('btnSavePersona');
  if (btnSave) {
    btnSave.textContent = "Crear Influencer";
  }

  // Clear basic inputs
  document.getElementById('pName').value = '';
  document.getElementById('pGender').value = 'Female';
  document.getElementById('pAge').value = '25 años';
  document.getElementById('pEthnicity').value = 'Latina';
  document.getElementById('pStyle').value = 'Minimalista y natural';
  document.getElementById('pHair').value = 'Marrón ondulado largo';
  document.getElementById('pSetting').value = 'Sala de estar moderna y neutral';

  // Select defaults for dropdowns
  document.getElementById('pLighting').value = 'Casual daylight from bedroom window';
  document.getElementById('pCamera').value = 'iPhone 15 Pro front camera selfie';

  updateClothingDropdown();

  // Clear detailed inputs
  document.getElementById('pSkinTone').value = 'piel clara natural';
  document.getElementById('pSkinTexture').value = 'piel real con poros y textura suave';
  document.getElementById('pHairColor').value = 'marrón castaño';
  document.getElementById('pHairTexture').value = 'ondulado natural';
  document.getElementById('pHairLength').value = 'medio-largo';
  document.getElementById('pEyebrows').value = 'cejas definidas';
  document.getElementById('pEyeColor').value = 'marrón oscuro';
  document.getElementById('pLips').value = 'labios proporcionados';
  document.getElementById('pFaceShape').value = 'ovalada';
  document.getElementById('pSmileType').value = 'sonrisa cálida y natural';
  document.getElementById('pBodyType').value = 'Atlético y proporcionado';

  // Force re-compilation of prompts
  compilePromptAndJSON();
  
  // Set json editor values to default
  const jsonArea = document.getElementById('jsonEditor');
  if (jsonArea) {
    jsonArea.value = JSON.stringify(getFullPersonaJSON(), null, 2);
  }

  // Clear bible prompts fields
  document.getElementById('bibleLockPrompt').textContent = "";
  document.getElementById('biblePositivePrompt').textContent = "";
  document.getElementById('bibleMjPrompt').textContent = "";
  document.getElementById('bibleFluxPrompt').textContent = "";
  document.getElementById('bibleLeonardoPrompt').textContent = "";
  document.getElementById('bibleIdeogramPrompt').textContent = "";
  
  const grokEl = document.getElementById('bibleGrokPrompt');
  if (grokEl) grokEl.textContent = "";
  const chatgptEl = document.getElementById('bibleChatGptPrompt');
  if (chatgptEl) chatgptEl.textContent = "";
  const metaEl = document.getElementById('bibleMetaAIPrompt');
  if (metaEl) metaEl.textContent = "";
  
  document.getElementById('bibleUsageNotes').textContent = "Completa los campos de la izquierda y haz clic en 'Crear Influencer' para generar la biblia.";

  // Scroll smoothly to form
  const editorLayout = document.querySelector('.editor-layout');
  if (editorLayout) {
    editorLayout.scrollIntoView({ behavior: 'smooth' });
  }
}

// Select Persona
function selectPersona(persona) {
  state.selectedPersona = persona;
  uploadedImagePath = null; // Clear upload session when selecting another persona
  
  // Reset editor title and save button text
  const editorTitle = document.getElementById('editorHeaderTitle');
  if (editorTitle) {
    editorTitle.textContent = "Configuración del Personaje";
  }
  const btnSave = document.getElementById('btnSavePersona');
  if (btnSave) {
    btnSave.textContent = "Guardar Persona en influ-JSON";
  }

  updateDashboardStats();
  renderPersonaGrids();
  populateActiveUgcData();
  updateLicensingCalculator();
  
  // Update inputs in Persona Form
  document.getElementById('pName').value = persona.name;
  document.getElementById('pGender').value = persona.gender;
  document.getElementById('pAge').value = persona.age;
  document.getElementById('pEthnicity').value = persona.ethnicity || 'Latina';
  document.getElementById('pStyle').value = persona.style;
  document.getElementById('pHair').value = persona.hair;
  document.getElementById('pLighting').value = persona.lighting;
  document.getElementById('pCamera').value = persona.camera;
  updateClothingDropdown(persona.clothing);
  document.getElementById('pSetting').value = persona.setting;

  // Extract detailed features from detailedJSON if available
  let detailed = {};
  if (persona.detailedJSON) {
    try {
      detailed = typeof persona.detailedJSON === 'string' ? JSON.parse(persona.detailedJSON) : persona.detailedJSON;
    } catch(e) {}
  }
  
  document.getElementById('pSkinTone').value = detailed.facial_features?.skin_tone || 'Piel clara ligeramente bronceada';
  document.getElementById('pSkinTexture').value = detailed.facial_features?.skin_texture || 'Piel suave con poros y pecas muy sutiles';
  document.getElementById('pEyebrows').value = detailed.facial_features?.eyebrows || detailed.facial_features?.eyebrow_style || 'Cejas castañas oscuras y pobladas';
  document.getElementById('pLips').value = detailed.facial_features?.lips || (detailed.facial_features?.lip_color ? `${detailed.facial_features.lip_color} ${detailed.facial_features.lip_shape || ''}` : '') || 'Labios rosados naturales carnosos';
  document.getElementById('pHairColor').value = detailed.hair?.color || 'Castaño oscuro natural';
  document.getElementById('pHairTexture').value = detailed.hair?.texture || 'Ondulado natural con cuerpo';
  document.getElementById('pHairLength').value = detailed.hair?.length || 'Largo, por debajo de los hombros';
  document.getElementById('pEyeColor').value = detailed.facial_features?.eye_color || 'Marrón cálido con destellos miel';
  document.getElementById('pFaceShape').value = detailed.facial_features?.face_shape || 'Ovalada con mandíbula definida';
  document.getElementById('pSmileType').value = detailed.facial_features?.smile_type || 'Sonrisa cálida, accesible y natural';
  document.getElementById('pBodyType').value = detailed.identity?.body_type || 'Atlético y proporcionado';
  
  // Variant manager sync
  const activeNameEl = document.getElementById('activeInfluencerName');
  if (activeNameEl) activeNameEl.textContent = persona.name;
  updateVariantClothingDropdown(persona.gender);
  loadVariantsForPersona(persona.id);

  // Archive button label and styling
  const archiveBtn = document.getElementById('btnArchivePersona');
  if (archiveBtn) {
    if (persona.archived === 1) {
      archiveBtn.textContent = '📦 Desarchivar';
      archiveBtn.style.background = 'rgba(40, 167, 69, 0.15)';
      archiveBtn.style.color = '#28a745';
      archiveBtn.style.border = '1px solid rgba(40, 167, 69, 0.3)';
    } else {
      archiveBtn.textContent = '📦 Archivar';
      archiveBtn.style.background = 'rgba(255, 193, 7, 0.15)';
      archiveBtn.style.color = '#ffc107';
      archiveBtn.style.border = '1px solid rgba(255, 193, 7, 0.3)';
    }
  }

  compilePromptAndJSON();
  loadGenerationHistory(persona.id);
  loadCharacterBible("");
}

// Render Select grids in tabs
function renderPersonaGrids() {
  const selectGrid = document.getElementById('personaSelectGrid');
  if (!selectGrid) return;
  selectGrid.innerHTML = '';
  
  const isArchivedMode = state.personaFilter === 'archived';
  const filtered = state.personas.filter(p => isArchivedMode ? (p.archived === 1) : (!p.archived || p.archived === 0));
  
  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = `persona-card ${state.selectedPersona?.id === p.id ? 'selected' : ''}`;
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <div class="persona-card-info">
        <div class="persona-card-name">${p.name}</div>
        <div class="persona-card-tag">${p.age} • ${p.ethnicity || p.ethnicity_appearance}</div>
      </div>
    `;
    card.addEventListener('click', () => selectPersona(p));
    selectGrid.appendChild(card);
  });
}

// Git Status Sync feedback
function showSyncToast(success, message) {
  syncBanner.className = 'sync-banner' + (success ? ' show' : ' show error');
  syncBannerText.textContent = message;
  
  gitIndicator.className = 'git-indicator';
  gitStatusText.textContent = 'Repositorio sincronizado';
  
  setTimeout(() => {
    syncBanner.classList.remove('show');
  }, 4000);
}

function setGitSyncingState() {
  gitIndicator.className = 'git-indicator syncing';
  gitStatusText.textContent = 'Respaldando en GitHub...';
}

async function manualGitSync() {
  setGitSyncingState();
  try {
    const res = await authFetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showSyncToast(true, '¡Cambios respaldados en GitHub!');
    } else {
      showSyncToast(false, 'Error al sincronizar con GitHub.');
    }
  } catch (err) {
    showSyncToast(false, 'Fallo de conexión al sincronizar.');
  }
}

// ─── Shared Export Helper: assembles the richest JSON for the active persona ───
function getFullPersonaJSON() {
  let base = {};
  
  // 1. Start with the richest source (analysisResult or stored detailedJSON)
  if (typeof analysisResult !== 'undefined' && analysisResult && Object.keys(analysisResult).length > 2) {
    base = JSON.parse(JSON.stringify(analysisResult));
  } else if (state.selectedPersona && state.selectedPersona.detailedJSON) {
    try {
      const stored = typeof state.selectedPersona.detailedJSON === 'string'
        ? JSON.parse(state.selectedPersona.detailedJSON)
        : state.selectedPersona.detailedJSON;
      if (stored && Object.keys(stored).length > 2) {
        base = JSON.parse(JSON.stringify(stored));
      }
    } catch (e) {}
  }
  
  // 2. Ensure nested structures exist
  if (!base.identity) base.identity = {};
  if (!base.facial_features) base.facial_features = {};
  if (!base.hair) base.hair = {};
  if (!base.aesthetic) base.aesthetic = {};
  if (!base.photography) base.photography = {};
  
  // 3. Overwrite with live form values
  const p = state.selectedPersona || {};
  
  base.identity.name = document.getElementById('pName')?.value || base.identity.name || p.name || 'Influencer';
  base.identity.gender = document.getElementById('pGender')?.value || base.identity.gender || p.gender || 'Female';
  base.identity.apparent_age = document.getElementById('pAge')?.value || base.identity.apparent_age || p.age || '25 años';
  base.identity.ethnicity_appearance = document.getElementById('pEthnicity')?.value || base.identity.ethnicity_appearance || p.ethnicity || 'Mixta';
  base.identity.body_type = document.getElementById('pBodyType')?.value || base.identity.body_type || p.body_type || 'Atlético y proporcionado';
  
  // Advanced physical traits
  base.facial_features.face_shape = document.getElementById('pFaceShape')?.value || base.facial_features.face_shape || 'Ovalada';
  base.facial_features.skin_tone = document.getElementById('pSkinTone')?.value || base.facial_features.skin_tone || 'Piel clara';
  base.facial_features.skin_texture = document.getElementById('pSkinTexture')?.value || base.facial_features.skin_texture || 'Suave';
  base.facial_features.eye_color = document.getElementById('pEyeColor')?.value || base.facial_features.eye_color || 'Marrón';
  base.facial_features.eyebrows = document.getElementById('pEyebrows')?.value || base.facial_features.eyebrows || 'Cejas naturales';
  base.facial_features.lips = document.getElementById('pLips')?.value || base.facial_features.lips || 'Labios rosados';
  base.facial_features.smile_type = document.getElementById('pSmileType')?.value || base.facial_features.smile_type || 'Natural';
  
  base.hair.color = document.getElementById('pHairColor')?.value || base.hair.color || 'Castaño';
  base.hair.texture = document.getElementById('pHairTexture')?.value || base.hair.texture || 'Ondulado';
  base.hair.length = document.getElementById('pHairLength')?.value || base.hair.length || 'Largo';
  base.hair.details = document.getElementById('pHair')?.value || base.hair.details || p.hair || '';
  
  base.aesthetic.overall_vibe = document.getElementById('pStyle')?.value || base.aesthetic.overall_vibe || p.style || 'Natural';
  base.aesthetic.clothing_type = document.getElementById('pClothing')?.value || base.aesthetic.clothing_type || p.clothing || '';
  
  base.photography.camera_lens = document.getElementById('pCamera')?.value || base.photography.camera_lens || p.camera || 'iPhone';
  base.photography.lighting_type = document.getElementById('pLighting')?.value || base.photography.lighting_type || p.lighting || 'Luz natural';
  base.photography.background_setting = document.getElementById('pSetting')?.value || base.photography.background_setting || p.setting || 'Fondo neutro';
  
  // Clean internal metadata keys
  delete base.generation_prompt;
  delete base.anchor_reference;
  
  return base;
}

function buildChatbotExportText({ includePrompt = true, includeScript = false, includeProduct = false, scriptData = null, productData = null } = {}) {
  const personaJSON = getFullPersonaJSON();
  const formattedJson = JSON.stringify(personaJSON, null, 2);
  
  let sections = [];
  
  // Section 1: Persona identity instructions
  sections.push(`Eres un generador de contenido UGC (User Generated Content) para un influencer virtual. Utiliza la siguiente especificación de identidad visual JSON para mantener la consistencia física y de la cámara en TODA imagen generada. Cada campo describe un atributo visual específico del modelo — respétalos todos para lograr coherencia entre imágenes.

═══════════════════════════════════════════
  IDENTIDAD VISUAL DEL MODELO (JSON)
═══════════════════════════════════════════
${formattedJson}
═══════════════════════════════════════════`);
  
  // Section 2: Product context (if included)
  if (includeProduct && productData) {
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

  // Section 3: Campaign script (if included)
  if (includeScript && scriptData) {
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

  // Section 4: Image generation prompt (if included)
  if (includePrompt) {
    const prompt = document.getElementById('promptPreview')?.textContent || '';
    sections.push(`
═══════════════════════════════════════════
  PROMPT DE GENERACIÓN DE IMAGEN
═══════════════════════════════════════════
${prompt}
═══════════════════════════════════════════`);
  }

  // Final instructions
  sections.push(`
INSTRUCCIONES PARA EL CHATBOT:
• Genera imágenes que coincidan EXACTAMENTE con las características del JSON de identidad visual.
• Mantén consistencia entre cada imagen generada (mismo rostro, cabello, tono de piel).
• El estilo debe ser UGC casual y natural, como tomado por el influencer con su propio teléfono.
• NO uses vocabulario como "cinematic", "8K", "photorealistic" — el estilo debe ser amateur y real.
• Si hay un guión de campaña, genera las imágenes correspondientes a cada escena del guión.`);

  return sections.join('\n');
}

const CLOTHING_OPTIONS_BY_GENDER = {
  Female: [
    "Ropa deportiva: Calzas y top deportivo de licra negro",
    "Ropa de trabajo: Traje sastre gris con blazer entallado y blusa blanca",
    "Sport elegante: Camisa de lino blanca holgada con vaqueros claros",
    "Salida de noche: Vestido ajustado negro de satén con tirantes finos",
    "Lencería sexy: Conjunto de lencería de encaje rojo con transparencias",
    "Casual cotidiano: Suéter de punto suave en tono crema cuello redondo",
    "Estilo playero: Vestido veraniego suelto de lino color beige",
    "Cozy / Casa: Sudadera con capucha minimalista gris melange oversized",
    "Cóctel / Fiesta: Mono largo de satén verde esmeralda con cinturón",
    "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta básica blanca"
  ],
  Male: [
    "Ropa deportiva: Sudadera con capucha de secado rápido y joggers negros",
    "Ropa de trabajo: Traje clásico azul marino con camisa blanca y corbata",
    "Sport elegante: Camisa de lino blanca y pantalones chinos beige",
    "Salida de noche: Camisa de seda negra desabrochada y pantalones oscuros",
    "Lencería sexy: Bóxers ajustados premium de diseñador color negro",
    "Casual cotidiano: Jersey de punto fino gris con cuello redondo",
    "Estilo playero: Camisa guayabera blanca y bermudas de lino beige",
    "Cozy / Casa: Sudadera con capucha minimalista azul marino oversized",
    "Saco casual: Blazer beige sobre camiseta básica blanca",
    "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta negra con vaqueros"
  ]
};

function updateClothingDropdown(selectedVal = null) {
  const gender = document.getElementById('pGender').value;
  const select = document.getElementById('pClothing');
  if (!select) return;
  
  select.innerHTML = '';
  const options = CLOTHING_OPTIONS_BY_GENDER[gender] || CLOTHING_OPTIONS_BY_GENDER.Female;
  
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
  
  // If we have an existing value that is not in the predefined list, append it as custom option so it doesn't get lost
  if (selectedVal && !options.includes(selectedVal)) {
    const customOpt = document.createElement('option');
    customOpt.value = selectedVal;
    customOpt.textContent = `Personalizado: ${selectedVal}`;
    customOpt.selected = true;
    select.appendChild(customOpt);
  } else if (selectedVal) {
    select.value = selectedVal;
  }
}

// Persona Engine Tab Logic
function setupPersonaEngine() {
  const formInputs = document.querySelectorAll('#personaForm input, #personaForm select');
  formInputs.forEach(input => {
    input.addEventListener('input', compilePromptAndJSON);
  });
  
  // Update clothing select whenever gender select changes
  document.getElementById('pGender').addEventListener('change', () => {
    updateClothingDropdown();
    compilePromptAndJSON();
  });
  
  document.getElementById('btnSavePersona').addEventListener('click', savePersona);
  document.getElementById('btnDeletePersona').addEventListener('click', deletePersonaAction);

  const cardScratch = document.getElementById('cardCreateScratch');
  if (cardScratch) cardScratch.addEventListener('click', resetPersonaFormForNew);

  const cardInspiration = document.getElementById('cardCreateInspiration');
  if (cardInspiration) {
    cardInspiration.addEventListener('click', () => {
      const btnOpen = document.getElementById('btnOpenImportModal');
      if (btnOpen) btnOpen.click();
    });
  }
  
  document.getElementById('btnCopyJSON').addEventListener('click', () => {
    const jsonArea = document.getElementById('jsonEditor');
    jsonArea.select();
    navigator.clipboard.writeText(jsonArea.value);
    alert('¡Estructura JSON copiada al portapapeles!');
  });
  
  document.getElementById('btnCopyChatbotPrompt').addEventListener('click', () => {
    const exportText = buildChatbotExportText({ includePrompt: true });
    navigator.clipboard.writeText(exportText);
    alert('📋 ¡Prompt + Identidad Visual JSON copiados para tu Chatbot (ChatGPT/Gemini/Claude)!');
  });

  document.getElementById('btnSaveToGallery').addEventListener('click', async () => {
    const prompt = document.getElementById('promptPreview').textContent;
    const gender = document.getElementById('pGender').value;
    const imgPath = state.selectedPersona?.image || (gender === 'Male' ? 'assets/influencer_male.png' : 'assets/influencer_female.png');
    
    try {
      const res = await authFetch('/api/gallery', {
        method: 'POST',
        body: JSON.stringify({ prompt, imagePath: imgPath })
      });
      const data = await res.json();
      if (data.success) {
        alert('⭐ ¡Prompt y miniatura de referencia guardados en la Galería!');
        if (state.activeTab === 'gallery') renderGallery();
      }
    } catch (err) {
      alert('Error al guardar en la galería.');
    }
  });

  // Tab Switcher for right column panel
  const btnTabBible = document.getElementById('btnTabBible');
  const btnTabJson = document.getElementById('btnTabJson');
  const contentBibleTab = document.getElementById('contentBibleTab');
  const contentJsonTab = document.getElementById('contentJsonTab');

  if (btnTabBible && btnTabJson && contentBibleTab && contentJsonTab) {
    btnTabBible.addEventListener('click', () => {
      btnTabBible.classList.add('active');
      btnTabJson.classList.remove('active');
      contentBibleTab.classList.add('active');
      contentBibleTab.style.display = 'flex';
      contentJsonTab.classList.remove('active');
      contentJsonTab.style.display = 'none';
    });

    btnTabJson.addEventListener('click', () => {
      btnTabJson.classList.add('active');
      btnTabBible.classList.remove('active');
      contentJsonTab.classList.add('active');
      contentJsonTab.style.display = 'flex';
      contentBibleTab.classList.remove('active');
      contentBibleTab.style.display = 'none';
    });
  }

  // Regenerate Character Bible on scene change
  const btnRegenerateBible = document.getElementById('btnRegenerateBible');
  if (btnRegenerateBible) {
    btnRegenerateBible.addEventListener('click', () => {
      const sceneInput = document.getElementById('sceneDescriptionInput');
      const val = sceneInput ? sceneInput.value.trim() : "";
      if (state.selectedPersona) {
        loadCharacterBible(val);
      }
    });
  }

  // Copy Buttons for Character Bible fields
  setupCopyButton('btnCopyLockPrompt', 'bibleLockPrompt', 'Rasgos Bloqueados');
  setupCopyButton('btnCopyPositivePrompt', 'biblePositivePrompt', 'Prompt Positivo Unificado');
  setupCopyButton('btnCopyMjPrompt', 'bibleMjPrompt', 'Prompt de Midjourney');
  setupCopyButton('btnCopyFluxPrompt', 'bibleFluxPrompt', 'Prompt de Flux');
  setupCopyButton('btnCopyLeonardoPrompt', 'bibleLeonardoPrompt', 'Prompt de Leonardo');
  setupCopyButton('btnCopyIdeogramPrompt', 'bibleIdeogramPrompt', 'Prompt de Ideogram');
  setupCopyButton('btnCopyGrokPrompt', 'bibleGrokPrompt', 'Prompt de Grok Imagine');
  setupCopyButton('btnCopyChatGptPrompt', 'bibleChatGptPrompt', 'Prompt de ChatGPT');
  setupCopyButton('btnCopyMetaAIPrompt', 'bibleMetaAIPrompt', 'Prompt de Meta AI');
  
  // Initial populate of clothing select
  updateClothingDropdown();
  compilePromptAndJSON();
}

function setupCopyButton(btnId, targetId, label) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      const el = document.getElementById(targetId);
      if (el) {
        navigator.clipboard.writeText(el.textContent);
        showSyncToast(true, `¡${label} copiado al portapapeles!`);
      }
    });
  }
}

function compilePromptAndJSON() {
  const name = document.getElementById('pName').value;
  const gender = document.getElementById('pGender').value;
  const age = document.getElementById('pAge').value;
  const ethnicity = document.getElementById('pEthnicity').value;
  const style = document.getElementById('pStyle').value;
  const hair = document.getElementById('pHair').value;
  const lighting = document.getElementById('pLighting').value;
  const camera = document.getElementById('pCamera').value;
  const clothing = document.getElementById('pClothing').value;
  const setting = document.getElementById('pSetting').value;
  
  // High-fidelity facial & body details
  const skinTone = document.getElementById('pSkinTone').value;
  const skinTexture = document.getElementById('pSkinTexture').value;
  const hairColor = document.getElementById('pHairColor').value;
  const hairTexture = document.getElementById('pHairTexture').value;
  const hairLength = document.getElementById('pHairLength').value;
  const eyebrows = document.getElementById('pEyebrows').value;
  const eyeColor = document.getElementById('pEyeColor').value;
  const lips = document.getElementById('pLips').value;
  const faceShape = document.getElementById('pFaceShape').value;
  const smileType = document.getElementById('pSmileType').value;
  const bodyType = document.getElementById('pBodyType').value;
  
  // Get hex codes from detailedJSON for color precision
  let skinHex = '', hairHex = '';
  try {
    const dj = state.selectedPersona?.detailedJSON;
    const parsed = dj ? (typeof dj === 'string' ? JSON.parse(dj) : dj) : {};
    skinHex = parsed.facial_features?.skin_tone_hex || '';
    hairHex = parsed.hair?.color_hex || '';
  } catch(e) {}
  const hexHint = (skinHex || hairHex) ? ` Exact skin color ${skinHex || 'natural'}, exact hair color ${hairHex || 'natural'}.` : '';

  // Prompt builder - UGC style with high-fidelity facial anchoring
  const prompt = `Amateur casual UGC style, ${camera}. A ${age} ${ethnicity} ${gender.toLowerCase()} influencer with ${hairColor} ${hairTexture} ${hairLength} hair, ${skinTone} skin, ${eyeColor} eyes, ${eyebrows}, ${lips}, ${faceShape} face, ${smileType}, ${bodyType} body build.${hexHint} Wearing ${clothing}. Background is a ${setting}. ${lighting}, raw photo format, unedited, shot on smartphone camera, natural skin texture, realistic imperfections. Same person in all shots, consistent facial identity.`;
  document.getElementById('promptPreview').textContent = prompt;
  
  // JSON builder compilation
  const jsonConfig = {
    identity: {
      name: name,
      gender: gender,
      age: age,
      ethnicity_appearance: ethnicity,
      body_type: bodyType
    },
    facial_features: {
      face_shape: faceShape,
      skin_tone: skinTone,
      skin_texture: skinTexture,
      eye_color: eyeColor,
      eyebrows: eyebrows,
      lips: lips,
      smile_type: smileType
    },
    hair: {
      color: hairColor,
      texture: hairTexture,
      length: hairLength,
      details: hair
    },
    aesthetic: {
      style_vibe: style,
      clothing_type: clothing
    },
    photography: {
      camera_lens: camera,
      lighting_type: lighting,
      background_setting: setting
    }
  };
  
  document.getElementById('jsonEditor').value = JSON.stringify(jsonConfig, null, 2);
  
  // Keep split A/B prompts up to date
  updateABPrompts();
}

async function savePersona() {
  const name = document.getElementById('pName').value;
  const gender = document.getElementById('pGender').value;
  const age = document.getElementById('pAge').value;
  const ethnicity = document.getElementById('pEthnicity').value;
  const style = document.getElementById('pStyle').value;
  const hair = document.getElementById('pHair').value;
  const lighting = document.getElementById('pLighting').value;
  const camera = document.getElementById('pCamera').value;
  const clothing = document.getElementById('pClothing').value;
  const setting = document.getElementById('pSetting').value;
  
  const promptText = document.getElementById('promptPreview').textContent;
  showSyncToast(true, 'Generando retrato virtual consistente con Nano Banana...');
  
  let portraitPath = null;
  try {
    const imgRes = await authFetch('/api/ai/generate-image', {
      method: 'POST',
      body: JSON.stringify({ 
        prompt: promptText, 
        referenceLocalPath: uploadedImagePath || state.selectedPersona?.image,
        personaId: state.selectedPersona?.id || 'new_persona',
        generationType: 'portrait'
      })
    });
    const imgData = await imgRes.json();
    if (imgData.success && imgData.imagePath) {
      portraitPath = imgData.imagePath;
    }
  } catch (err) {
    console.warn('Image generation failed or offline. Using reference or existing image.');
  }

  const finalImage = portraitPath || uploadedImagePath || state.selectedPersona?.image || (gender === 'Male' ? 'assets/influencer_male.png' : 'assets/nano_banana_influencer.png');
  const finalImageUGC = portraitPath || uploadedImagePath || state.selectedPersona?.imageUGC || (gender === 'Male' ? 'assets/influencer_male_bottle.png' : 'assets/nano_banana_ugc.png');

  const personaData = {
    name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting,
    image: finalImage,
    imageUGC: finalImageUGC,
    detailedJSON: getFullPersonaJSON()
  };
  
  if (state.selectedPersona?.id) {
    personaData.id = state.selectedPersona.id;
  }
  
  setGitSyncingState();
  try {
    const res = await authFetch('/api/personas', {
      method: 'POST',
      body: JSON.stringify(personaData)
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      uploadedImagePath = null; // Clear upload path after successful save
      // Select newly saved persona
      const saved = state.personas.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (saved) {
        selectPersona(saved);
      }
      
      // Refresh stats
      const dataRes = await authFetch('/api/data');
      const dataJson = await dataRes.json();
      state.generationStats = dataJson.generationStats || { total: 0 };
      updateDashboardStats();
      
      if (data.gitSynced) {
        showSyncToast(true, '¡Persona guardada y respaldada en GitHub con su retrato virtual!');
      } else {
        showSyncToast(false, 'Guardado localmente. Error en Git.');
      }
    }
  } catch (err) {
    showSyncToast(false, 'Error de servidor al guardar.');
  }
}

// A/B Comparator Logic
function setupABComparator() {
  const btn = document.getElementById('btnToggleAB');
  const abPanel = document.getElementById('abComparatorContainer');
  const standardLayout = document.querySelector('.editor-layout');
  
  btn.addEventListener('click', () => {
    if (abPanel.style.display === 'none') {
      abPanel.style.display = 'block';
      btn.classList.add('active');
      updateABPrompts();
    } else {
      abPanel.style.display = 'none';
      btn.classList.remove('active');
    }
  });

  // Watch input changes for A/B inputs
  const inputs = ['abA_setting', 'abA_clothing', 'abA_lighting', 'abB_setting', 'abB_clothing', 'abB_lighting'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', updateABPrompts);
  });
}

function updateABPrompts() {
  if (document.getElementById('abComparatorContainer').style.display === 'none') return;
  
  const camera = document.getElementById('pCamera').value;
  const age = document.getElementById('pAge').value;
  const name = document.getElementById('pName').value;
  const gender = document.getElementById('pGender').value;
  const ethnicity = document.getElementById('pEthnicity').value;
  const hair = document.getElementById('pHair').value;

  const abA_setting = document.getElementById('abA_setting').value;
  const abA_clothing = document.getElementById('abA_clothing').value;
  const abA_lighting = document.getElementById('abA_lighting').value;

  const abB_setting = document.getElementById('abB_setting').value;
  const abB_clothing = document.getElementById('abB_clothing').value;
  const abB_lighting = document.getElementById('abB_lighting').value;

  const promptA = `Amateur casual UGC style, ${camera}. A ${age} ${ethnicity} ${gender.toLowerCase()} influencer with a very natural expression, looking at camera. ${hair}, wearing ${abA_clothing}. Background is a ${abA_setting}. ${abA_lighting}, raw photo format, unedited, shot on smartphone camera, natural skin texture, realistic imperfections.`;
  const promptB = `Amateur casual UGC style, ${camera}. A ${age} ${ethnicity} ${gender.toLowerCase()} influencer with a very natural expression, looking at camera. ${hair}, wearing ${abB_clothing}. Background is a ${abB_setting}. ${abB_lighting}, raw photo format, unedited, shot on smartphone camera, natural skin texture, realistic imperfections.`;

  document.getElementById('promptPreviewA').textContent = promptA;
  document.getElementById('promptPreviewB').textContent = promptB;
}

// Version History Timeline Logic
function setupVersionHistory() {
  const btn = document.getElementById('btnToggleHistory');
  const historyPanel = document.getElementById('historyTimelineContainer');
  
  btn.addEventListener('click', async () => {
    if (historyPanel.style.display === 'none') {
      await fetchVersionsHistory();
      historyPanel.style.display = 'block';
      btn.classList.add('active');
    } else {
      historyPanel.style.display = 'none';
      btn.classList.remove('active');
    }
  });
}

async function fetchVersionsHistory() {
  if (!state.selectedPersona?.id) return;
  
  const listContainer = document.getElementById('versionTimelineList');
  listContainer.innerHTML = '<p style="color:var(--text-secondary); text-align:center;">Cargando historial...</p>';
  
  try {
    const res = await authFetch(`/api/personas/${state.selectedPersona.id}/versions`);
    const versions = await res.json();
    
    listContainer.innerHTML = '';
    if (versions.length === 0) {
      listContainer.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:12px 0;">No hay versiones anteriores de este modelo.</p>';
      return;
    }
    
    versions.forEach(v => {
      const date = new Date(v.created_at).toLocaleString();
      const div = document.createElement('div');
      div.className = 'version-timeline-item';
      div.innerHTML = `
        <div class="version-timeline-content">
          <div>
            <div class="version-timeline-meta">${date}</div>
            <div style="font-size: 13px; font-weight:600; margin-top:2px;">Cambio detectado</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="revertVersion('${v.id}')">Restaurar esta versión</button>
        </div>
      `;
      listContainer.appendChild(div);
    });
  } catch (err) {
    listContainer.innerHTML = '<p style="color:var(--text-secondary); text-align:center;">Error al cargar historial.</p>';
  }
}

async function revertVersion(versionId) {
  if (!state.selectedPersona?.id) return;
  if (!confirm('¿Estás seguro de que quieres revertir a esta versión? Perderás los cambios no guardados.')) return;
  
  try {
    const res = await authFetch(`/api/personas/${state.selectedPersona.id}/revert/${versionId}`, {
      method: 'POST'
    });
    const data = await res.json();
    
    if (data.success) {
      selectPersona(data.persona);
      await fetchVersionsHistory();
      alert('¡Versión restaurada con éxito!');
    }
  } catch (err) {
    alert('Error al restaurar la versión.');
  }
}

// Campaigns Tab Logic
function setupCampaigns() {
  const modal = document.getElementById('campaignModal');
  const btnNew = document.getElementById('btnNewCampaign');
  const btnCancel = document.getElementById('btnCancelCampaign');
  const form = document.getElementById('campaignForm');
  
  btnNew.addEventListener('click', () => {
    // Populate select lists
    const prodSelect = document.getElementById('cProductSelect');
    prodSelect.innerHTML = state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    const personaList = document.getElementById('cPersonaChecklist');
    personaList.innerHTML = state.personas.map(p => `
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
        <input type="checkbox" name="personaCheck" value="${p.id}">
        <span>${p.name}</span>
      </label>
    `).join('');
    
    modal.style.display = 'flex';
  });
  
  btnCancel.addEventListener('click', () => modal.style.display = 'none');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cName').value;
    const client = document.getElementById('cClient').value;
    const budget = parseFloat(document.getElementById('cBudget').value);
    const productId = document.getElementById('cProductSelect').value;
    const status = document.getElementById('cStatusSelect').value;
    
    const checkboxes = document.querySelectorAll('input[name="personaCheck"]:checked');
    const personaIds = Array.from(checkboxes).map(cb => cb.value);
    
    const campaignData = {
      campaign: { name, client_name: client, budget, product_id: productId, status },
      personaIds
    };
    
    setGitSyncingState();
    try {
      const res = await authFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaignData)
      });
      const data = await res.json();
      
      if (data.success) {
        state.campaigns = data.campaigns;
        modal.style.display = 'none';
        renderCampaigns();
        showSyncToast(true, 'Campaña creada y guardada en GitHub!');
      }
    } catch (err) {
      alert('Error de red al guardar campaña.');
    }
  });

  document.getElementById('btnDeleteCampaign').addEventListener('click', async () => {
    if (!state.selectedCampaign) return;
    if (!confirm('¿Estás seguro de que quieres borrar esta campaña?')) return;

    try {
      const res = await authFetch(`/api/campaigns/${state.selectedCampaign.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        state.campaigns = data.campaigns;
        state.selectedCampaign = null;
        document.getElementById('campaignDetailCard').style.display = 'none';
        renderCampaigns();
        showSyncToast(true, 'Campaña eliminada correctamente.');
      }
    } catch (err) {
      alert('Error al borrar la campaña.');
    }
  });
}

async function renderCampaigns() {
  const listGrid = document.getElementById('campaignListGrid');
  listGrid.innerHTML = '<p style="color:var(--text-secondary);">Cargando campañas...</p>';
  
  try {
    const res = await authFetch('/api/campaigns');
    const campaigns = await res.json();
    state.campaigns = campaigns;
    
    listGrid.innerHTML = '';
    if (campaigns.length === 0) {
      listGrid.innerHTML = '<p style="color:var(--text-secondary); padding: 12px 0;">No hay campañas registradas todavía.</p>';
      return;
    }
    
    campaigns.forEach(c => {
      const card = document.createElement('div');
      card.className = `campaign-card ${state.selectedCampaign?.id === c.id ? 'active-campaign' : ''}`;
      card.innerHTML = `
        <div class="campaign-card-info">
          <h3>${c.name}</h3>
          <p>Cliente: ${c.client_name} · Presupuesto: $${c.budget.toFixed(2)}</p>
        </div>
        <span class="badge">${c.status}</span>
      `;
      card.addEventListener('click', () => selectCampaign(c));
      listGrid.appendChild(card);
    });
  } catch (err) {
    listGrid.innerHTML = '<p style="color:var(--text-secondary);">Error al recuperar listado de campañas.</p>';
  }
}

function selectCampaign(c) {
  state.selectedCampaign = c;
  renderCampaigns();
  
  // Show Details Card
  const card = document.getElementById('campaignDetailCard');
  card.style.display = 'block';
  
  document.getElementById('cdName').textContent = c.name;
  document.getElementById('cdStatus').textContent = c.status;
  document.getElementById('cdStatus').className = `badge ${c.status}`;
  document.getElementById('cdClient').textContent = c.client_name;
  document.getElementById('cdBudget').textContent = `$${c.budget.toFixed(2)}`;
  document.getElementById('cdProduct').textContent = c.product ? c.product.name : 'Ninguno';
  
  // Render assigned personas
  const personasGrid = document.getElementById('cdPersonaGrid');
  personasGrid.innerHTML = '';
  if (c.personas && c.personas.length > 0) {
    c.personas.forEach(p => {
      const item = document.createElement('div');
      item.className = 'persona-card';
      item.innerHTML = `
        <img src="${p.image}" alt="${p.name}" style="height:90px;">
        <div class="persona-card-info" style="padding:6px 8px;">
          <div class="persona-card-name" style="font-size:12px;">${p.name}</div>
        </div>
      `;
      personasGrid.appendChild(item);
    });
  } else {
    personasGrid.innerHTML = '<p style="font-size:11px; color:var(--text-muted);">Sin influencers asignados.</p>';
  }

  // Setup ZIP Export link
  const exportBtn = document.getElementById('btnExportZip');
  exportBtn.href = `/api/export/campaign/${c.id}`;
}

// Script Engine Tab Logic
function setupScriptEngine() {
  document.getElementById('btnGenerateScripts').addEventListener('click', generateScriptsAction);
  
  // Plain text copy (script only)
  document.getElementById('btnCopyScript').addEventListener('click', () => {
    if (state.scripts.length === 0) return;
    const activeScript = state.scripts[state.selectedAngleIndex];
    const scriptText = `Ángulo: ${activeScript.angle}\n\n[GANCHO / HOOK]\n${activeScript.hook}\nCue: ${activeScript.hookCue}\n\n[DEMOSTRACIÓN / DEMO]\n${activeScript.demo}\nCue: ${activeScript.demoCue}\n\n[EL GIRO / TURN]\n${activeScript.turn}\nCue: ${activeScript.turnCue}\n\n[CTA]\n${activeScript.cta}\nCue: ${activeScript.ctaCue}`;
    navigator.clipboard.writeText(scriptText);
    alert('¡Guión publicitario copiado al portapapeles!');
  });
  
  // Full chatbot export (script + persona JSON + product + prompt)
  document.getElementById('btnExportScriptChatbot').addEventListener('click', () => {
    if (state.scripts.length === 0) {
      alert('Primero genera los scripts de campaña.');
      return;
    }
    const activeScript = state.scripts[state.selectedAngleIndex];
    const product = state.selectedProduct || {
      name: document.getElementById('prodName')?.value || '',
      benefit: document.getElementById('prodBenefit')?.value || '',
      audience: document.getElementById('prodAudience')?.value || '',
      frustration: document.getElementById('prodFrustration')?.value || ''
    };
    
    const exportText = buildChatbotExportText({
      includePrompt: true,
      includeScript: true,
      includeProduct: true,
      scriptData: activeScript,
      productData: product
    });
    
    navigator.clipboard.writeText(exportText);
    alert('📋 ¡Guión + Identidad Visual JSON + Producto copiados para tu Chatbot!');
  });
}

async function generateScriptsAction() {
  const name = document.getElementById('prodName').value;
  const benefit = document.getElementById('prodBenefit').value;
  const audience = document.getElementById('prodAudience').value;
  const frustration = document.getElementById('prodFrustration').value;
  
  state.selectedProduct = { name, benefit, audience, frustration };
  
  // Save product to database
  setGitSyncingState();
  const res = await authFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(state.selectedProduct)
  });
  const data = await res.json();
  
  if (data.success) {
    state.products = data.products;
    document.getElementById('statProductsCount').textContent = state.products.length;
    
    // Check if Gemini API is available for script generation
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    
    if (statusData.apiConnected && state.selectedPersona) {
      document.getElementById('btnGenerateScripts').textContent = '🤖 Generando scripts con Gemini...';
      try {
        const aiRes = await authFetch('/api/ai/generate-scripts', {
          method: 'POST',
          body: JSON.stringify({
            product: state.selectedProduct,
            persona: state.selectedPersona,
            count: 10
          })
        });
        const aiData = await aiRes.json();
        if (aiData.success && aiData.scripts) {
          state.scripts = aiData.scripts;
          renderScriptsUI();
          populateActiveUgcData();
          updateLicensingCalculator();
          showSyncToast(true, 'Scripts generados por Gemini con éxito!');
          document.getElementById('btnGenerateScripts').textContent = 'Generar 10 Variaciones de Scripts (Conectar AI)';
          return;
        }
      } catch (err) {
        console.warn('Gemini script gen failed, falling back to local simulation.');
      }
    }
    
    // Fallback to local offline template simulation
    generateMockScripts();
    populateActiveUgcData();
    updateLicensingCalculator();
    document.getElementById('btnGenerateScripts').textContent = 'Generar 10 Variaciones de Scripts ( offline fallback )';
    
    if (data.gitSynced) {
      showSyncToast(true, '¡Campaña guardada y respaldada en GitHub!');
    } else {
      showSyncToast(false, 'Guardado localmente. Fallo al subir.');
    }
  }
}

function generateMockScripts() {
  const prod = state.selectedProduct || {
    name: "Glow Serum Organics",
    benefit: "Piel brillante y profundamente hidratada en 5 minutos",
    audience: "Jóvenes ocupadas con piel seca y opaca",
    frustration: "No tener tiempo para rutinas coreanas de 10 pasos"
  };
  
  const creator = state.selectedPersona?.name || "Sofia";
  
  // 10 distinct marketing angles matching GPT-5.6 guidelines
  state.scripts = [
    {
      angle: "El Escéptico (Skeptic Hook)",
      hook: "Estaba 100% segura de que este producto era puro marketing de TikTok.",
      hookCue: "Muestra cara de incredulidad, sosteniendo el producto frente a la cámara en plano medio.",
      demo: "Pero me apliqué solo tres gotas de ${prod.name} antes de maquillarme y mira el brillo.",
      demoCue: "Acercamiento rápido a la mejilla, aplicando el serum suavemente con los dedos.",
      turn: "Literalmente se absorbe en segundos y no deja sensación grasosa.",
      turnCue: "Sonríe, tocándose la mejilla para mostrar la textura suave.",
      cta: "Si tienes piel opaca y eres floja para rutinas largas, consíguelo ahora."
    },
    {
      angle: "Antes y Después (Before / After)",
      hook: "Mi piel solía verse apagada y sin vida todas las mañanas.",
      hookCue: "Muestra una foto o clip inicial con expresión cansada, sin maquillaje.",
      demo: "Hasta que empecé a usar ${prod.name}. Solo toma 5 minutos y no necesito 10 pasos.",
      demoCue: "Transición fluida a una toma radiante y con luz cálida de mañana.",
      turn: "Miren la diferencia de hidratación, es como tomar 3 litros de agua.",
      turnCue: "Muestra el frasco y sonríe directamente a la cámara.",
      cta: "Dale click abajo y consiéntete con este glow natural hoy."
    },
    {
      angle: "Ahorro de Tiempo (Time Saved)",
      hook: "Olvídate de la rutina coreana de 10 pasos. Nadie tiene tiempo para eso.",
      hookCue: "Mueve la cabeza en negación con frustración divertida, sosteniendo el frasco.",
      demo: "Con ${prod.name} obtengo el mismo brillo e hidratación profunda en 5 minutos.",
      demoCue: "Aplica una gota del serum en la mano y la esparce rápidamente.",
      turn: "Un solo paso y mi piel se siente hidratada todo el santo día.",
      turnCue: "Señala su rostro radiante con asombro.",
      cta: "Simplifica tu vida. Toca abajo y ordena el tuyo ahora."
    },
    {
      angle: "Valor / Calidad (Price Shock)",
      hook: "Gasté más de $150 en cremas caras que solo me causaron brotes.",
      hookCue: "Muestra un gesto de arrepentimiento, luego levanta el producto con orgullo.",
      demo: "Este frasco de ${prod.name} cuesta una fracción y hace el triple de trabajo.",
      demoCue: "Muestra la botella de vidrio y el gotero premium de cerca.",
      turn: "Piel brillante, ingredientes orgánicos y sin arruinar mi cuenta de banco.",
      turnCue: "Aplica en la piel mostrando la absorción instantánea.",
      cta: "Compra inteligente. Consigue tu Glow Serum tocando el botón."
    },
    {
      angle: "El Hack Secreto (Secret Hack)",
      hook: "El secreto de las influencers para un maquillaje jugoso no es la base.",
      hookCue: "Habla en tono confidencial, acercándose un poco al micrófono/cámara.",
      demo: "Es preparar la piel con ${prod.name} justo antes de empezar.",
      demoCue: "Muestra la aplicación del serum y cómo se funde con la piel.",
      turn: "Evita que la base se cuartee y te da ese acabado de cristal.",
      turnCue: "Muestra el maquillaje final impecable bajo luz natural.",
      cta: "Prueba este hack. Haz clic en el enlace para ordenar."
    },
    {
      angle: "Estética y Vibra (Aesthetic/Vibe)",
      hook: "Esta es mi rutina de mañana obligatoria para empezar el día con buena energía.",
      hookCue: "Toma de mañana, luz suave, sirviendo café, luego toma el producto.",
      demo: "Unas gotas de ${prod.name} y mi piel despierta al instante.",
      demoCue: "Movimientos lentos y estéticos, aplicando el producto con calma.",
      turn: "Huele a spa y se siente como un abrazo para mi cara.",
      turnCue: "Cierra los ojos disfrutando de la textura refrescante.",
      cta: "Empieza a brillar desde temprano. Ordena tu botella aquí."
    },
    {
      angle: "Unboxing / ASMR Touch",
      hook: "Escucha esto... el empaque más satisfactorio que verás hoy.",
      hookCue: "Sonido de desempacar la caja de cartón reciclado cerca del micrófono.",
      demo: "Este es el nuevo ${prod.name}. Vidrio pesado premium y gotero de precisión.",
      demoCue: "Sonidos de gotero succionando y soltando el líquido dorado.",
      turn: "Se siente ultra fresco e hidrata tu piel sin químicos dañinos.",
      turnCue: "Aplica en el dorso de la mano para mostrar el brillo húmedo.",
      cta: "Siente el cambio en tu piel. Consíguelo en su tienda oficial abajo."
    },
    {
      angle: "Guía de Uso (How to Use)",
      hook: "Si estás usando tu serum con la piel seca, lo estás haciendo mal.",
      hookCue: "Muestra el dedo índice levantado con gesto de corrección amigable.",
      demo: "Humedece un poco tu rostro y luego aplica 3 gotas de ${prod.name}.",
      demoCue: "Muestra el rostro ligeramente húmedo, aplicando el producto uniformemente.",
      turn: "Esto sella el agua y duplica la hidratación por el resto del día.",
      turnCue: "Muestra el resultado jugoso en la mejilla.",
      cta: "Haz la prueba hoy mismo. Consigue el tuyo en el enlace."
    },
    {
      angle: "Frustración Relatable (Rant Hook)",
      hook: "Estoy harta de los productos que prometen hidratar y te dejan la cara grasosa.",
      hookCue: "Expresión ligeramente molesta pero divertida de cara a la cámara.",
      demo: "Por eso amo ${prod.name}. Es agua pura, pero concentrada para dar brillo.",
      demoCue: "Presiona el gotero mostrando la textura fluida y ligera del serum.",
      turn: "Es el único que me da brillo real sin hacerme parecer un sartén con aceite.",
      turnCue: "Sonríe de lado y muestra su piel perfectamente balanceada.",
      cta: "Si odias la grasa pero buscas brillo, toca abajo y ordénalo."
    },
    {
      angle: "Enfoque de Solución (Solution Focus)",
      hook: "Consigue la piel radiante de tus sueños en solo 5 minutos.",
      hookCue: "Chasquido de dedos rápido hacia la cámara, mostrando el producto.",
      demo: "${prod.name} es la solución definitiva para combatir la piel opaca y reseca.",
      demoCue: "Muestra cómo el producto penetra en la piel dejándola húmeda y luminosa.",
      turn: "Ingredientes botánicos puros que sanan tu barrera de la piel al instante.",
      turnCue: "Sostiene el producto junto a su rostro resplandeciente.",
      cta: "La solución está a un clic. Consigue el tuyo hoy con envío gratis."
    }
  ];
  
  // Interpolate templates
  state.scripts = state.scripts.map(s => {
    return {
      angle: s.angle,
      hook: s.hook.replace(/\${prod.name}/g, prod.name).replace(/\${creator}/g, creator),
      hookCue: s.hookCue,
      demo: s.demo.replace(/\${prod.name}/g, prod.name).replace(/\${creator}/g, creator),
      demoCue: s.demoCue,
      turn: s.turn.replace(/\${prod.name}/g, prod.name).replace(/\${creator}/g, creator),
      turnCue: s.turnCue,
      cta: s.cta.replace(/\${prod.name}/g, prod.name).replace(/\${creator}/g, creator),
      ctaCue: s.ctaCue || "Llamado a la acción claro frente a cámara."
    };
  });
  
  renderScriptsUI();
}

function renderScriptsUI() {
  const tabList = document.getElementById('scriptTabList');
  tabList.innerHTML = '';
  
  state.scripts.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = `script-tab-btn ${state.selectedAngleIndex === idx ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="angle-name">${s.angle}</span>
      <span class="angle-hook">${s.hook}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedAngleIndex = idx;
      renderScriptsUI();
      updateActiveScriptView();
    });
    tabList.appendChild(btn);
  });
  
  updateActiveScriptView();
}

function updateActiveScriptView() {
  if (state.scripts.length === 0) return;
  const script = state.scripts[state.selectedAngleIndex];
  
  document.getElementById('activeScriptAngle').textContent = script.angle;
  
  const contentBox = document.getElementById('activeScriptContent');
  contentBox.innerHTML = `
    <div class="script-section">
      <div class="section-label">1. El Gancho (Hook)</div>
      <div class="section-text">"${script.hook}"</div>
      <div class="section-cue">🎬 Visual: ${script.hookCue}</div>
    </div>
    <div class="script-section">
      <div class="section-label demo">2. Demostración (Demo)</div>
      <div class="section-text">"${script.demo}"</div>
      <div class="section-cue">🎬 Visual: ${script.demoCue}</div>
    </div>
    <div class="script-section">
      <div class="section-label turn">3. El Giro (The Turn)</div>
      <div class="section-text">"${script.turn}"</div>
      <div class="section-cue">🎬 Visual: ${script.turnCue}</div>
    </div>
    <div class="script-section">
      <div class="section-label cta">4. Llamado a la Acción (CTA)</div>
      <div class="section-text">"${script.cta}"</div>
      <div class="section-cue">🎬 Visual: ${script.ctaCue}</div>
    </div>
  `;
  
  // Sync to UGC studio caption text
  const captionText = `"${script.hook}" ${script.demo} ${script.turn} ${script.cta}`;
  document.getElementById('ugcPostCaption').value = captionText;
  updateUgcMockupCaption();
}

// UGC Studio Tab Logic
function setupUgcStudio() {
  document.getElementById('toggleNYLaw').addEventListener('change', updateUgcMockupCompliance);
  document.getElementById('toggleFTC').addEventListener('change', updateUgcMockupCompliance);
  document.getElementById('ugcPostCaption').addEventListener('input', updateUgcMockupCaption);
  
  // Generate Image AI Action
  document.getElementById('btnGenerateUgcImage').addEventListener('click', generateAIImageAction);

  // Export active bundle for chatbot
  document.getElementById('btnExportUgcChatbot').addEventListener('click', () => {
    const activeScript = state.scripts.length > 0 ? state.scripts[state.selectedAngleIndex] : null;
    const product = state.selectedProduct || {
      name: document.getElementById('prodName')?.value || '',
      benefit: document.getElementById('prodBenefit')?.value || '',
      audience: document.getElementById('prodAudience')?.value || '',
      frustration: document.getElementById('prodFrustration')?.value || ''
    };
    
    const exportText = buildChatbotExportText({
      includePrompt: true,
      includeScript: !!activeScript,
      includeProduct: true,
      scriptData: activeScript,
      productData: product
    });
    
    navigator.clipboard.writeText(exportText);
    alert('📋 ¡Pack Completo (Guión + Identidad Visual JSON + Producto + Prompt) copiado para tu Chatbot!');
  });
  
  // Video Pipeline Simulation Action
  document.getElementById('btnGenerateUgcVideo').addEventListener('click', startVideoPipelineSimulation);
}

async function generateAIImageAction() {
  const prompt = document.getElementById('promptPreview').textContent;
  const statusCard = document.getElementById('ugcGenStatusCard');
  const statusText = document.getElementById('ugcGenStatusText');
  
  statusCard.style.display = 'flex';
  statusText.textContent = 'Invocando generador de imágenes Imagen 3...';
  
  try {
    const bodyPayload = { prompt };
    if (state.selectedPersona) {
      bodyPayload.personaId = state.selectedPersona.id;
      bodyPayload.generationType = 'ugc';
    }
    
    const res = await authFetch('/api/ai/generate-image', {
      method: 'POST',
      body: JSON.stringify(bodyPayload)
    });
    const data = await res.json();
    
    if (data.success && data.imagePath) {
      document.getElementById('mockupImage').src = data.imagePath;
      statusText.textContent = '✓ Imagen generada y cargada en mockup!';
      setTimeout(() => statusCard.style.display = 'none', 3000);
      
      // Refresh stats & load history
      const dataRes = await authFetch('/api/data');
      const dataJson = await dataRes.json();
      state.generationStats = dataJson.generationStats || { total: 0 };
      updateDashboardStats();
      if (state.selectedPersona) {
        loadGenerationHistory(state.selectedPersona.id);
      }
    } else {
      statusText.textContent = '⚠ La API está offline. Copia el prompt para generarlo gratis.';
      setTimeout(() => statusCard.style.display = 'none', 5000);
    }
  } catch (err) {
    statusText.textContent = '⚠ Error en la generación. Copia el prompt.';
    setTimeout(() => statusCard.style.display = 'none', 5000);
  }
}

function startVideoPipelineSimulation() {
  const timelinePanel = document.getElementById('videoTimelinePreview');
  const progressText = document.getElementById('videoTimelineProgress');
  const progressBar = document.getElementById('videoProgressBar');
  const steps = ['vtStep1', 'vtStep2', 'vtStep3', 'vtStep4'];
  
  timelinePanel.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  steps.forEach(s => document.getElementById(s).style.color = 'var(--text-muted)');
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
    
    if (progress >= 25) document.getElementById('vtStep1').style.color = 'var(--accent-primary)';
    if (progress >= 50) document.getElementById('vtStep2').style.color = 'var(--accent-secondary)';
    if (progress >= 75) document.getElementById('vtStep3').style.color = '#f59e0b';
    if (progress >= 100) {
      document.getElementById('vtStep4').style.color = 'var(--success)';
      clearInterval(interval);
      alert('🎥 Renderizado del video UGC finalizado. Timeline del clip listo para entrega.');
    }
  }, 150);
}

function populateActiveUgcData() {
  const creator = state.selectedPersona || { name: "Sofia", image: "assets/influencer_female.png", imageUGC: "assets/influencer_female_serum.png", handle: "@sofia_ai_ugc" };
  const prod = state.selectedProduct || { name: "Glow Serum Organics" };
  
  document.getElementById('ugcActiveAvatar').src = creator.image;
  document.getElementById('ugcActiveName').textContent = creator.name;
  document.getElementById('ugcActiveMeta').textContent = `${creator.age} • ${creator.ethnicity || creator.ethnicity_appearance}`;
  
  const prodImg = creator.gender === 'Male' ? 'assets/product_bottle.png' : 'assets/product_serum.png';
  document.getElementById('ugcActiveProductImg').src = prodImg;
  document.getElementById('ugcActiveProduct').textContent = prod.name;
  document.getElementById('cdProduct').textContent = prod.name;
  document.getElementById('ugcActiveProductMeta').textContent = prod.benefit || "Piel brillante en 5 minutos";
  
  // Mockup elements
  document.getElementById('mockupImage').src = creator.imageUGC || "assets/influencer_female_serum.png";
  document.getElementById('mockupAvatar').src = creator.image;
  document.getElementById('mockupHandle').textContent = creator.handle || `@${creator.name.toLowerCase()}_ai_ugc`;
  
  updateActiveScriptView();
}

function updateUgcMockupCaption() {
  const capVal = document.getElementById('ugcPostCaption').value;
  document.getElementById('mockupCaptionText').textContent = capVal;
}

function updateUgcMockupCompliance() {
  const nyWatermark = document.getElementById('nyWatermark');
  const ftcTags = document.getElementById('ftcTags');
  
  const showNY = document.getElementById('toggleNYLaw').checked;
  const showFTC = document.getElementById('toggleFTC').checked;
  
  if (showNY) {
    nyWatermark.classList.add('active');
  } else {
    nyWatermark.classList.remove('active');
  }
  
  if (showFTC) {
    ftcTags.style.display = 'inline-block';
  } else {
    ftcTags.style.display = 'none';
  }
}

// Licensing Tab Logic
function setupLicensing() {
  document.getElementById('baseFeeInput').addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.baseFee = val;
      updateLicensingCalculator();
    }
  });
  
  document.getElementById('pitchLicenceSelect').addEventListener('change', (e) => {
    state.selectedLicenceDays = e.target.value;
    updateLicensingCalculator();
  });
  
  document.getElementById('btnCopyProposal').addEventListener('click', copyLicensingProposal);
}

function updateLicensingCalculator() {
  const base = state.baseFee;
  
  // Calculate additions
  const add30 = base * 0.5;
  const add90 = base * 1.0;
  const addYear = base * 2.0;
  const addPerpetual = base * 3.0;
  
  document.getElementById('price30').textContent = `+ $${add30.toFixed(2)}`;
  document.getElementById('price90').textContent = `+ $${add90.toFixed(2)}`;
  document.getElementById('priceYear').textContent = `+ $${addYear.toFixed(2)}`;
  document.getElementById('pricePerpetual').textContent = `+ $${addPerpetual.toFixed(2)}`;
  
  // Update invoice panel
  const creator = state.selectedPersona || { name: "Sofia" };
  const prod = state.selectedProduct || { name: "Glow Serum Organics" };
  
  document.getElementById('pitchClientName').textContent = `Propuesta para ${prod.name}`;
  document.getElementById('pitchInfluName').textContent = `${creator.name} - Modelo Virtual AI`;
  document.getElementById('pitchBaseFeeVal').textContent = `$${base.toFixed(2)}`;
  
  let addSelected = 0;
  const licenceSelect = document.getElementById('pitchLicenceSelect');
  const selVal = licenceSelect.value;
  
  if (selVal === '30') addSelected = add30;
  else if (selVal === '90') addSelected = add90;
  else if (selVal === '365') addSelected = addYear;
  else if (selVal === 'infinite') addSelected = addPerpetual;
  
  document.getElementById('pitchLicenceFeeVal').textContent = `$${addSelected.toFixed(2)}`;
  
  const total = base + addSelected;
  document.getElementById('pitchTotalVal').textContent = `$${total.toFixed(2)}`;
}

function copyLicensingProposal() {
  const creator = state.selectedPersona || { name: "Sofia" };
  const prod = state.selectedProduct || { name: "Glow Serum Organics" };
  const base = state.baseFee;
  
  const licenceSelect = document.getElementById('pitchLicenceSelect');
  const selectedText = licenceSelect.options[licenceSelect.selectedIndex].text;
  const totalText = document.getElementById('pitchTotalVal').textContent;
  
  const activeScript = state.scripts[state.selectedAngleIndex] || { angle: "El Escéptico" };
  
  const proposal = `================================================
PROPUESTA COMERCIAL - AI UGC CAMPAIGN
================================================
Cliente: ${prod.name}
Creador Virtual: ${creator.name}
Ángulo del Anuncio: ${activeScript.angle}

DESGLOSE DE SERVICIOS:
1. Creación de Activo UGC Sintético: $${base.toFixed(2)} USD
   - Persona consistente definible por JSON
   - Prep. de guión optimizado por GPT-5.6
   
2. Licencia de Derechos de Uso Comercial:
   - Tipo: ${selectedText}
   - Costo: ${document.getElementById('pitchLicenceFeeVal').textContent} USD

3. Entrega y Redacción (10 variaciones de scripts): Incluido

INVERSIÓN TOTAL: ${totalText} USD
================================================
*Nota: Cumplimiento ético de divulgación sintética incluido de acuerdo con la ley de junio de 2026.
`;

  navigator.clipboard.writeText(proposal);
  alert('¡Propuesta formateada copiada al portapapeles!');
}

// Prompt Gallery Logic
function setupGallery() {
  // Watch search input
  const searchInput = document.getElementById('gallerySearchInput');
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = state.galleryItems.filter(item => item.prompt.toLowerCase().includes(val));
    renderGalleryGrid(filtered);
  });
}

async function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '<p style="color:var(--text-secondary);">Cargando galería...</p>';
  
  try {
    const res = await authFetch('/api/gallery');
    state.galleryItems = await res.json();
    renderGalleryGrid(state.galleryItems);
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--text-secondary);">Error al recuperar la galería.</p>';
  }
}

function renderGalleryGrid(items) {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  
  if (items.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-secondary); grid-column:1/-1; text-align:center; padding:24px 0;">No hay prompts guardados que coincidan.</p>';
    return;
  }
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <img src="${item.image_path || 'assets/influencer_female_serum.png'}" class="gallery-card-img" alt="Gallery preview">
      <div class="gallery-card-content">
        <p class="gallery-card-prompt">${item.prompt}</p>
        <button class="btn btn-sm btn-secondary" style="width: 100%;" onclick="loadPromptFromGallery('${item.prompt.replace(/'/g, "\\'")}')">Cargar prompt</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function loadPromptFromGallery(prompt) {
  // Pre-load prompt into prompt preview box
  document.getElementById('promptPreview').textContent = prompt;
  
  // Switch to Persona Engine tab
  const tabItem = document.querySelector('[data-tab="persona-engine"]');
  tabItem.click();
  
  alert('¡Prompt cargado en el Persona Engine! Puedes copiarlo o aplicarle cambios.');
}

window.loadPromptFromGallery = loadPromptFromGallery;
window.revertVersion = revertVersion;

// =============================================
// PHOTO UPLOAD & AI ANALYSIS MODULE
// =============================================

let analysisResult = null; // stores the last generated detailed JSON
let uploadedImagePath = null;

function setupPhotoUpload() {
  const dropzone = document.getElementById('uploadDropzone');
  if (!dropzone) return;
  const fileInput = document.getElementById('photoFileInput');
  const btnLoadPhotoUrl = document.getElementById('btnLoadPhotoUrl');
  const photoUrlInput = document.getElementById('photoUrlInput');

  // Click to open file picker
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-change-photo')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handlePhotoFile(e.target.files[0]);
  });

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handlePhotoFile(e.dataTransfer.files[0]);
  });

  // Load photo from URL
  if (btnLoadPhotoUrl && photoUrlInput) {
    btnLoadPhotoUrl.addEventListener('click', async () => {
      const url = photoUrlInput.value.trim();
      if (!url) {
        alert('Por favor introduce un link de imagen.');
        return;
      }
      await handlePhotoUrl(url);
    });

    // Support enter key on input
    photoUrlInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const url = photoUrlInput.value.trim();
        if (!url) {
          alert('Por favor introduce un link de imagen.');
          return;
        }
        await handlePhotoUrl(url);
      }
    });
  }

  // Action buttons
  document.getElementById('btnCopyAnalysisJSON').addEventListener('click', () => {
    const output = document.getElementById('analysisJsonOutput').textContent;
    navigator.clipboard.writeText(output);
    alert('¡JSON detallado copiado al portapapeles!');
  });

  document.getElementById('btnApplyAnalysis').addEventListener('click', applyAnalysisToForm);
  document.getElementById('btnSaveAnalysisPersona').addEventListener('click', saveAnalysisAsPersona);
}

async function handlePhotoUrl(url) {
  // Show spinner
  const statusCard = document.getElementById('analysisStatusCard');
  statusCard.style.display = 'flex';
  document.getElementById('analysisSpinner').style.display = 'block';
  document.getElementById('analysisStatusTitle').textContent = 'Descargando imagen de referencia...';
  document.getElementById('analysisStatusMsg').textContent = 'Conectando con la URL del perfil/imagen proporcionada.';

  // Disable button/input
  const btnLoad = document.getElementById('btnLoadPhotoUrl');
  if (btnLoad) btnLoad.disabled = true;

  try {
    const res = await authFetch('/api/upload-reference-url', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Error al descargar la imagen.');
    }
    
    uploadedImagePath = data.filePath;
    
    // Show preview in dropzone
    const dropzone = document.getElementById('uploadDropzone');
    dropzone.classList.add('has-image');
    dropzone.innerHTML = `
      <img src="${data.filePath}" alt="Reference Photo" class="upload-preview-img">
      <div class="upload-preview-overlay">
        <div class="upload-preview-info">
          <div class="upload-preview-name">Imagen desde URL</div>
          <div class="upload-preview-meta">${(data.size / 1024).toFixed(0)} KB · ${data.fileName}</div>
        </div>
        <button class="btn-change-photo" onclick="resetUploadDropzone()">Cambiar foto</button>
      </div>
    `;

    const photoUrlInput = document.getElementById('photoUrlInput');
    if (photoUrlInput) photoUrlInput.value = '';
    
    // Start analysis
    await runPhotoAnalysis(data.filePath);
  } catch (err) {
    document.getElementById('analysisSpinner').style.display = 'none';
    document.getElementById('analysisStatusTitle').textContent = '⚠ Error de Descarga';
    document.getElementById('analysisStatusMsg').textContent = err.message || 'No se pudo descargar la imagen. Asegúrate de que el enlace sea público y directo.';
  } finally {
    if (btnLoad) btnLoad.disabled = false;
  }
}

async function handlePhotoFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Por favor selecciona un archivo de imagen válido.');
    return;
  }

  // Show preview in dropzone
  const dropzone = document.getElementById('uploadDropzone');
  const reader = new FileReader();

  reader.onload = async (e) => {
    const imgDataUrl = e.target.result;

    // Replace dropzone content with preview
    dropzone.classList.add('has-image');
    dropzone.innerHTML = `
      <img src="${imgDataUrl}" alt="Reference Photo" class="upload-preview-img">
      <div class="upload-preview-overlay">
        <div class="upload-preview-info">
          <div class="upload-preview-name">${file.name}</div>
          <div class="upload-preview-meta">${(file.size / 1024).toFixed(0)} KB · ${file.type}</div>
        </div>
        <button class="btn-change-photo" onclick="resetUploadDropzone()">Cambiar foto</button>
      </div>
    `;

    // Upload to server
    await uploadToServer(file);

    // Start analysis
    await runPhotoAnalysis(imgDataUrl);
  };

  reader.readAsDataURL(file);
}

function resetUploadDropzone() {
  const dropzone = document.getElementById('uploadDropzone');
  dropzone.classList.remove('has-image');
  dropzone.innerHTML = `
    <input type="file" id="photoFileInput" accept="image/*" style="display:none;">
    <div class="upload-icon-circle">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </div>
    <div class="upload-text-main">Arrastra tu foto aquí</div>
    <div class="upload-text-sub">o haz <span>click para seleccionar</span> · JPG, PNG, WebP · max 10MB</div>
  `;

  // Re-attach file input listener
  const newFileInput = document.getElementById('photoFileInput');
  newFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handlePhotoFile(e.target.files[0]);
  });

  // Re-attach click handler
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-change-photo')) return;
    newFileInput.click();
  });

  // Hide analysis panels
  document.getElementById('analysisStatusCard').style.display = 'none';
  document.getElementById('colorSwatchesContainer').style.display = 'none';
  document.getElementById('analysisDetailGrid').style.display = 'none';
  document.getElementById('analysisJsonSection').style.display = 'none';
  document.getElementById('analysisActions').style.display = 'none';
}

async function uploadToServer(file) {
  const formData = new FormData();
  formData.append('photo', file);

  try {
    setGitSyncingState();
    const res = await authFetch('/api/upload-reference', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      uploadedImagePath = data.filePath;
      if (data.gitSynced) {
        showSyncToast(true, '¡Foto subida y respaldada en GitHub!');
      } else {
        showSyncToast(false, 'Foto guardada localmente. Error en Git.');
      }
    }
  } catch (err) {
    console.error('Upload error:', err);
  }
}

async function runPhotoAnalysis(imageDataUrl) {
  // Show spinner
  const statusCard = document.getElementById('analysisStatusCard');
  statusCard.style.display = 'flex';
  document.getElementById('analysisSpinner').style.display = 'block';
  document.getElementById('analysisStatusTitle').textContent = 'Analizando imagen...';
  document.getElementById('analysisStatusMsg').textContent = 'Extrayendo paleta de colores, composición fotográfica y rasgos faciales.';

  // Extract dominant colors from canvas
  const colors = await extractDominantColors(imageDataUrl);

  // Check if Gemini Vision API is connected
  const statusRes = await fetch('/api/status');
  const statusData = await statusRes.json();
  
  if (statusData.apiConnected && uploadedImagePath) {
    document.getElementById('analysisStatusTitle').textContent = '🤖 Analizando con Gemini Vision...';
    try {
      const aiRes = await authFetch('/api/ai/analyze-photo', {
        method: 'POST',
        body: JSON.stringify({ imagePath: uploadedImagePath })
      });
      const aiData = await aiRes.json();
      if (aiData.success && aiData.analysis) {
        analysisResult = aiData.analysis;
        displayAnalysisResults(colors);
        showSyncToast(true, 'Análisis de foto completado con Gemini Vision API!');
        return;
      }
    } catch (err) {
      console.warn('Gemini vision analysis failed, falling back to local simulation.');
    }
  }

  // Fallback simulation mode
  await new Promise(resolve => setTimeout(resolve, 1800));
  analysisResult = await generateDetailedJSON(imageDataUrl, colors);
  displayAnalysisResults(colors);
}

function displayAnalysisResults(colors) {
  // Update status card to done
  document.getElementById('analysisSpinner').style.display = 'none';
  document.getElementById('analysisStatusTitle').textContent = '✓ Análisis completado';
  document.getElementById('analysisStatusMsg').textContent = `Se generaron ${Object.values(analysisResult).reduce((sum, cat) => sum + (typeof cat === 'object' && !Array.isArray(cat) ? Object.keys(cat).length : 0), 0)} campos detallados en 6 categorías.`;

  // Show color swatches
  renderColorSwatches(colors);

  // Show editable detail grid
  renderAnalysisDetailGrid(analysisResult);

  // Show JSON output
  const jsonSection = document.getElementById('analysisJsonSection');
  jsonSection.style.display = 'block';
  document.getElementById('analysisJsonOutput').textContent = JSON.stringify(analysisResult, null, 2);

  // Show action buttons
  document.getElementById('analysisActions').style.display = 'flex';
}

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
  const brightness = (c.r + c.g + c.b) / 3;
  if (brightness > 210) return 'Tez muy clara / porcelana';
  if (brightness > 185) return 'Tez clara / beige o arena dorada';
  if (brightness > 140) {
    if (c.r - c.b > 25) return 'Tez morena clara / oliva cálida';
    return 'Tez media neutra';
  }
  if (brightness > 90) return 'Tez bronceada media / canela';
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

async function generateDetailedJSON(imageDataUrl, colors) {
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
    anchor_reference: uploadedImagePath || null,
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

function renderAnalysisDetailGrid(data) {
  const grid = document.getElementById('analysisDetailGrid');
  grid.style.display = 'grid';
  grid.innerHTML = '';

  const categories = [
    { key: 'identity', label: '👤 Identidad', cssClass: 'identity' },
    { key: 'facial_features', label: '🧬 Rasgos Faciales', cssClass: 'facial' },
    { key: 'hair', label: '💇 Cabello', cssClass: 'hair-cat' },
    { key: 'aesthetic', label: '✨ Estética', cssClass: 'aesthetic' },
    { key: 'photography', label: '📷 Fotografía', cssClass: 'photo' },
    { key: 'clothing', label: '👗 Vestimenta', cssClass: 'clothing-cat' }
  ];

  let delayIdx = 0;
  categories.forEach(cat => {
    const section = data[cat.key];
    if (!section || typeof section !== 'object') return;

    // Category header
    const header = document.createElement('div');
    header.className = `analysis-category ${cat.cssClass} analysis-reveal delay-${Math.min(++delayIdx, 8)}`;
    header.textContent = cat.label;
    grid.appendChild(header);

    // Fields
    Object.entries(section).forEach(([fieldKey, fieldVal]) => {
      if (fieldVal === null) return;
      const field = document.createElement('div');
      const isLong = String(fieldVal).length > 50;
      field.className = `analysis-field ${isLong ? 'full-width' : ''} analysis-reveal delay-${Math.min(++delayIdx % 8 + 1, 8)}`;

      const labelText = fieldKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      // Check if there are options defined for this field
      const options = ANALYSIS_FIELD_OPTIONS[cat.key]?.[fieldKey];
      let inputHtml = '';

      if (options) {
        const valLower = String(fieldVal).toLowerCase();
        const lowerOptions = options.map(o => o.toLowerCase());
        
        let selectedIndex = lowerOptions.findIndex(o => o === valLower || valLower.includes(o) || o.includes(valLower));
        let optionsList = [...options];
        
        if (selectedIndex === -1) {
          optionsList.unshift(fieldVal);
          selectedIndex = 0;
        }

        inputHtml = `
          <select data-category="${cat.key}" data-field="${fieldKey}" class="analysis-editable-input">
            ${optionsList.map((opt, idx) => `
              <option value="${opt}" ${idx === selectedIndex ? 'selected' : ''}>${opt}</option>
            `).join('')}
          </select>
        `;
      } else {
        inputHtml = `
          <input type="text" value="${String(fieldVal).replace(/"/g, '&quot;')}" data-category="${cat.key}" data-field="${fieldKey}" class="analysis-editable-input">
        `;
      }

      field.innerHTML = `
        <span class="analysis-field-label">${labelText}</span>
        ${inputHtml}
      `;
      grid.appendChild(field);
    });
  });

  // Listen for edits to update the JSON output in real time
  grid.querySelectorAll('.analysis-editable-input').forEach(input => {
    const updateHandler = () => {
      const cat = input.dataset.category;
      const field = input.dataset.field;
      if (analysisResult[cat]) {
        analysisResult[cat][field] = input.value;
      }
      // Rebuild prompt
      analysisResult.generation_prompt = buildPromptFromAnalysis(analysisResult);
      document.getElementById('analysisJsonOutput').textContent = JSON.stringify(analysisResult, null, 2);
    };
    input.addEventListener('input', updateHandler);
    input.addEventListener('change', updateHandler);
  });

  // Build initial prompt
  analysisResult.generation_prompt = buildPromptFromAnalysis(analysisResult);
  document.getElementById('analysisJsonOutput').textContent = JSON.stringify(analysisResult, null, 2);
}

function buildPromptFromAnalysis(data) {
  const p = data.photography || {};
  const i = data.identity || {};
  const f = data.facial_features || {};
  const h = data.hair || {};
  const c = data.clothing || {};
  const a = data.aesthetic || {};

  const skinHex = f.skin_tone_hex ? ` Exact skin color ${f.skin_tone_hex}.` : '';
  const hairHex = h.color_hex ? ` Exact hair color ${h.color_hex}.` : '';

  return `Amateur casual UGC style photo, ${p.camera_lens || 'iPhone front camera selfie'}. A ${i.apparent_age || '25'} ${i.ethnicity_appearance || ''} ${i.gender || 'female'} influencer with ${h.color || ''} ${h.texture || ''} hair, ${f.skin_tone || ''} skin, ${f.eye_color || ''} eyes, ${f.eyebrow_style || ''}, ${f.lip_shape || ''}, ${f.face_shape || ''} face. ` +
    `${skinHex}${hairHex} ` +
    `Wearing ${c.type || ''} in ${c.color || ''}. ` +
    `Background: ${p.background_setting || 'casual indoor room'}. ` +
    `${p.lighting_type || 'daylight from window'}, ${p.color_grade || 'natural unedited colors'}, ` +
    `raw mobile snapshot quality, natural skin texture with realistic details, no filters, unedited mobile photo. Same person in all shots, consistent facial identity.`;
}

function applyAnalysisToForm() {
  if (!analysisResult) return;

  const i = analysisResult.identity || {};
  const f = analysisResult.facial_features || {};
  const h = analysisResult.hair || {};
  const a = analysisResult.aesthetic || {};
  const p = analysisResult.photography || {};
  const c = analysisResult.clothing || {};

  const genderVal = (i.gender || '').toLowerCase().includes('masc') ? 'Male' : 'Female';
  document.getElementById('pName').value = i.name || 'Nuevo Influencer';
  document.getElementById('pGender').value = genderVal;
  document.getElementById('pAge').value = i.apparent_age || '25 años';
  document.getElementById('pEthnicity').value = i.ethnicity_appearance || 'Mixta';
  document.getElementById('pStyle').value = a.overall_vibe || 'Natural';
  document.getElementById('pHair').value = `${h.texture || 'ondulado'} ${h.length || 'largo'}`;
  updateClothingDropdown(`${c.type || ''} en ${c.color || ''}`);
  document.getElementById('pSetting').value = p.background_setting || 'Fondo neutro';

  // Populating advanced details
  document.getElementById('pSkinTone').value = f.skin_tone || 'Piel clara';
  document.getElementById('pSkinTexture').value = f.skin_texture || 'Piel suave con poros naturales';
  document.getElementById('pEyebrows').value = f.eyebrow_style || 'Cejas naturales';
  document.getElementById('pLips').value = f.lips || (f.lip_color ? `${f.lip_color} ${f.lip_shape || ''}` : '') || 'Labios rosados naturales';
  document.getElementById('pHairColor').value = h.color || 'Castaño';
  document.getElementById('pHairTexture').value = h.texture || 'Ondulado';
  document.getElementById('pHairLength').value = h.length || 'Largo';
  document.getElementById('pEyeColor').value = f.eye_color || 'Marrón';
  document.getElementById('pFaceShape').value = f.face_shape || 'Ovalada';
  document.getElementById('pSmileType').value = f.smile_type || 'Natural';
  document.getElementById('pBodyType').value = i.body_type || 'Atlético y proporcionado';

  compilePromptAndJSON();
  showSyncToast(true, '¡Datos del análisis aplicados al formulario!');
}

async function saveAnalysisAsPersona() {
  if (!analysisResult) return;

  showSyncToast(true, 'Generando retrato virtual consistente con Nano Banana...');
  
  const promptText = buildPromptFromAnalysis(analysisResult);
  let portraitPath = uploadedImagePath;
  
  try {
    const imgRes = await authFetch('/api/ai/generate-image', {
      method: 'POST',
      body: JSON.stringify({ prompt: promptText, referenceLocalPath: uploadedImagePath })
    });
    const imgData = await imgRes.json();
    if (imgData.success && imgData.imagePath) {
      portraitPath = imgData.imagePath;
    }
  } catch (err) {
    console.warn('Image generation failed or offline. Using reference photo as fallback.');
  }

  const i = analysisResult.identity || {};
  const f = analysisResult.facial_features || {};
  const h = analysisResult.hair || {};
  const a = analysisResult.aesthetic || {};
  const p = analysisResult.photography || {};
  const c = analysisResult.clothing || {};

  const personaData = {
    name: i.name || 'Nuevo Influencer',
    gender: (i.gender || '').toLowerCase().includes('masc') ? 'Male' : 'Female',
    age: i.apparent_age || '25 años',
    ethnicity: i.ethnicity_appearance || 'Mixta',
    style: a.overall_vibe || 'Natural',
    hair: `${h.color || ''}, ${h.texture || ''}, ${h.length || ''}`,
    lighting: p.lighting_type || 'Luz natural',
    camera: p.camera_lens || 'DSLR portrait photograph, 50mm lens',
    clothing: `${c.type || ''} en ${c.color || ''}`,
    setting: p.background_setting || 'Fondo neutro',
    detailedJSON: analysisResult,
    image: portraitPath || 'assets/influencer_female.png',
    imageUGC: portraitPath || 'assets/influencer_female_serum.png'
  };

  setGitSyncingState();
  try {
    const res = await authFetch('/api/personas', {
      method: 'POST',
      body: JSON.stringify(personaData)
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      uploadedImagePath = null; // Clear upload path after successful save
      const saved = state.personas.find(p => p.name.toLowerCase() === personaData.name.toLowerCase());
      if (saved) state.selectedPersona = saved;

      updateDashboardStats();
      renderPersonaGrids();
      populateActiveUgcData();
      applyAnalysisToForm();

      // Automatically save prompt to gallery
      const promptText = buildPromptFromAnalysis(analysisResult);
      const imgPath = uploadedImagePath || (personaData.gender === 'Male' ? 'assets/influencer_male.png' : 'assets/influencer_female.png');
      try {
        await authFetch('/api/gallery', {
          method: 'POST',
          body: JSON.stringify({ prompt: promptText, imagePath: imgPath })
        });
      } catch (galleryErr) {
        console.error('Failed to auto-save to gallery:', galleryErr);
      }

      if (data.gitSynced) {
        showSyncToast(true, '¡Persona del análisis guardada y respaldada en GitHub!');
      } else {
        showSyncToast(false, 'Guardada localmente. Error en Git.');
      }
    }
  } catch (err) {
    showSyncToast(false, 'Error de servidor al guardar persona.');
  }
}

async function deletePersonaAction() {
  if (!state.selectedPersona || !state.selectedPersona.id) {
    alert('Primero selecciona un influencer guardado para poder eliminarlo.');
    return;
  }
  
  if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al influencer "${state.selectedPersona.name}"? Esta acción no se puede deshacer.`)) {
    return;
  }
  
  setGitSyncingState();
  try {
    const res = await authFetch(`/api/personas/${state.selectedPersona.id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      // Select the first persona if available
      state.selectedPersona = state.personas.length > 0 ? state.personas[0] : null;
      
      updateDashboardStats();
      renderPersonaGrids();
      populateActiveUgcData();
      
      if (state.selectedPersona) {
        selectPersona(state.selectedPersona);
      } else {
        // Clear form
        document.getElementById('pName').value = '';
        document.getElementById('pAge').value = '';
        document.getElementById('pStyle').value = '';
        document.getElementById('pSetting').value = '';
        updateClothingDropdown('');
      }
      
      if (data.gitSynced) {
        showSyncToast(true, '¡Influencer eliminado y cambios respaldados en GitHub!');
      } else {
        showSyncToast(false, 'Eliminado localmente. Error en Git.');
      }
    }
  } catch (err) {
    showSyncToast(false, 'Error de servidor al eliminar.');
  }
}

// ─── Influencer Variants (Poses, Wardrobe, Attitude) Manager ───

function updateVariantClothingDropdown(gender) {
  const select = document.getElementById('vClothing');
  if (!select) return;
  
  select.innerHTML = '';
  const options = CLOTHING_OPTIONS_BY_GENDER[gender] || CLOTHING_OPTIONS_BY_GENDER.Female;
  
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
}

async function loadVariantsForPersona(personaId) {
  const grid = document.getElementById('variantGalleryGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px;">Cargando variaciones...</div>';
  
  try {
    const res = await authFetch(`/api/personas/${personaId}/variants`);
    state.activeVariants = await res.json();
    renderVariantVaultGrid();
  } catch (err) {
    grid.innerHTML = '<div style="color: #ff6b6b; font-size: 13px;">Error al cargar poses.</div>';
  }
}

function renderVariantVaultGrid() {
  const grid = document.getElementById('variantGalleryGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  if (state.activeVariants.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; border: 1px dashed var(--glass-border); border-radius: var(--border-radius-md); background: rgba(0,0,0,0.1);">
        <p style="color: var(--text-muted); font-size: 13px; margin: 0;">No hay poses o variaciones creadas para este influencer aún.</p>
        <p style="color: var(--text-secondary); font-size: 11px; margin-top: 6px;">¡Selecciona una pose y vestuario a la izquierda y presiona Generar!</p>
      </div>
    `;
    return;
  }
  
  state.activeVariants.forEach(v => {
    const card = document.createElement('div');
    card.className = 'variant-card';
    card.style = 'position: relative; border-radius: var(--border-radius-md); overflow: hidden; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); transition: transform 0.2s ease, box-shadow 0.2s ease;';
    card.innerHTML = `
      <img src="${v.image_path}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;">
      <div style="padding: 10px; background: rgba(0,0,0,0.7); position: absolute; bottom: 0; left: 0; right: 0; transform: translateY(100%); transition: transform 0.2s ease;" class="variant-hover-actions">
        <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${v.pose.split('(')[0]}
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-sm btn-primary" style="flex: 1; font-size: 9px; padding: 4px 6px;" onclick="setMainVariantAction('${v.image_path}')">⭐ Perfil</button>
          <button class="btn btn-sm btn-secondary" style="flex: 1; font-size: 9px; padding: 4px 6px; background: rgba(220,53,69,0.3); color:#ff6b6b;" onclick="deleteVariantAction('${v.id}')">🗑️ Borrar</button>
        </div>
      </div>
    `;
    
    // Setup mouse hover styles in JS
    card.addEventListener('mouseenter', () => {
      card.querySelector('.variant-hover-actions').style.transform = 'translateY(0)';
      card.style.transform = 'scale(1.02)';
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    });
    card.addEventListener('mouseleave', () => {
      card.querySelector('.variant-hover-actions').style.transform = 'translateY(100%)';
      card.style.transform = 'none';
      card.style.boxShadow = 'none';
    });
    
    grid.appendChild(card);
  });
}

// Attach these to window so inline onclick handlers work
window.setMainVariantAction = async function(imagePath) {
  if (!state.selectedPersona) return;
  setGitSyncingState();
  try {
    const res = await authFetch(`/api/personas/${state.selectedPersona.id}/variants/set-main/set-main`, {
      method: 'POST',
      body: JSON.stringify({ imagePath })
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      state.selectedPersona = state.personas.find(p => p.id === state.selectedPersona.id);
      renderPersonaGrids();
      populateActiveUgcData();
      showSyncToast(true, '¡Retrato principal actualizado!');
    }
  } catch (e) {
    showSyncToast(false, 'Error al actualizar retrato.');
  }
};

window.deleteVariantAction = async function(variantId) {
  if (!state.selectedPersona) return;
  if (!confirm('¿Estás seguro de que deseas eliminar esta pose/variación?')) return;
  
  setGitSyncingState();
  try {
    const res = await authFetch(`/api/personas/${state.selectedPersona.id}/variants/${variantId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      state.activeVariants = data.variants;
      renderVariantVaultGrid();
      showSyncToast(true, 'Pose eliminada correctamente.');
    }
  } catch (e) {
    showSyncToast(false, 'Error al eliminar pose.');
  }
};

async function generateVariantAction() {
  const p = state.selectedPersona;
  if (!p) {
    alert('Selecciona un influencer primero.');
    return;
  }
  
  const pose = document.getElementById('vPose').value;
  const attitude = document.getElementById('vAttitude').value;
  const clothing = document.getElementById('vClothing').value;
  const setting = document.getElementById('vSetting').value;
  
  const statusCard = document.getElementById('variantGenStatus');
  const statusText = document.getElementById('variantGenStatusText');
  statusCard.style.display = 'flex';
  statusText.textContent = 'Renderizando pose virtual con Nano Banana / Flux...';
  
  // Compile the dynamic prompt based on influencer visual identity + pose properties
  const detailed = getFullPersonaJSON();
  const genderWord = p.gender === 'Male' ? 'Masculino' : 'Femenino';
  const age = detailed.identity?.apparent_age || p.age || '25 años';
  const ethnicity = detailed.identity?.ethnicity_appearance || p.ethnicity || 'Latina';
  const hair = detailed.hair ? `${detailed.hair.color || ''} ${detailed.hair.texture || ''} ${detailed.hair.length || ''}` : p.hair;
  const skinTone = detailed.facial_features?.skin_tone || '';
  const eyeColor = detailed.facial_features?.eye_color || '';
  const faceShape = detailed.facial_features?.face_shape || '';
  const skinHex = detailed.facial_features?.skin_tone_hex ? ` Exact skin color ${detailed.facial_features.skin_tone_hex}.` : '';
  const hairHex = detailed.hair?.color_hex ? ` Exact hair color ${detailed.hair.color_hex}.` : '';
  
  const variantPrompt = `Amateur casual UGC style, ${pose}. A ${age} ${ethnicity} ${genderWord.toLowerCase()} influencer ${attitude}. ${hair} hair, ${skinTone} skin, ${eyeColor} eyes, ${faceShape} face.${skinHex}${hairHex} Wearing ${clothing}. Background is ${setting}. Natural indoor light, raw photo format, shot on mobile camera, same person consistent facial identity, realistic skin texture.`;
  
  try {
    const res = await authFetch(`/api/personas/${p.id}/variants`, {
      method: 'POST',
      body: JSON.stringify({ pose, attitude, clothing, setting, prompt: variantPrompt })
    });
    const data = await res.json();
    if (data.success) {
      state.activeVariants = data.variants;
      renderVariantVaultGrid();
      statusText.textContent = '✓ Pose agregada exitosamente!';
      setTimeout(() => statusCard.style.display = 'none', 3000);
    } else {
      statusText.textContent = 'Error al generar la pose.';
    }
  } catch (err) {
    statusText.textContent = 'La generación falló o el servidor está offline.';
    setTimeout(() => statusCard.style.display = 'none', 4000);
  }
}

async function archivePersonaAction() {
  const p = state.selectedPersona;
  if (!p) return;
  
  const isArchiving = p.archived !== 1;
  const confirmMsg = isArchiving 
    ? `¿Estás seguro de que deseas archivar a "${p.name}"? Se ocultará del panel principal de campañas.`
    : `¿Deseas desarchivar a "${p.name}" y regresarla a la lista de activos?`;
    
  if (!confirm(confirmMsg)) return;
  
  setGitSyncingState();
  try {
    const res = await authFetch(`/api/personas/${p.id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archived: isArchiving })
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      state.selectedPersona = state.personas.find(pers => pers.id === p.id);
      
      // Update gallery view filters
      renderPersonaGrids();
      selectPersona(state.selectedPersona);
      showSyncToast(true, isArchiving ? 'Influencer archivada.' : 'Influencer desarchivada.');
    }
  } catch (err) {
    showSyncToast(false, 'Error al cambiar estado de archivo.');
  }
}

function setupVariantManager() {
  document.getElementById('btnGenerateVariant').addEventListener('click', async () => {
    await generateVariantAction();
    // Refresh stats & history when a variant is generated
    const dataRes = await authFetch('/api/data');
    const data = await dataRes.json();
    state.generationStats = data.generationStats || { total: 0 };
    updateDashboardStats();
    if (state.selectedPersona) {
      loadGenerationHistory(state.selectedPersona.id);
    }
  });
  
  document.getElementById('btnArchivePersona').addEventListener('click', archivePersonaAction);
  
  // Set up Active / Archived filter buttons
  const btnActive = document.getElementById('btnFilterActive');
  const btnArchived = document.getElementById('btnFilterArchived');
  
  btnActive.addEventListener('click', () => {
    state.personaFilter = 'active';
    btnActive.style.background = 'var(--accent-primary)';
    btnActive.style.color = '#fff';
    btnArchived.style.background = 'transparent';
    btnArchived.style.color = 'var(--text-secondary)';
    renderPersonaGrids();
  });
  
  btnArchived.addEventListener('click', () => {
    state.personaFilter = 'archived';
    btnArchived.style.background = 'var(--accent-primary)';
    btnArchived.style.color = '#fff';
    btnActive.style.background = 'transparent';
    btnActive.style.color = 'var(--text-secondary)';
    renderPersonaGrids();
  });

  // Portfolio search input listener
  const portfolioSearchInput = document.getElementById('portfolioSearch');
  if (portfolioSearchInput) {
    portfolioSearchInput.addEventListener('input', (e) => {
      state.portfolioSearchQuery = e.target.value;
      updateDashboardStats();
    });
  }
}

// Visual Generation History Implementation
async function loadGenerationHistory(personaId) {
  const historySection = document.getElementById('generationHistorySection');
  const historyGrid = document.getElementById('generationHistoryGrid');
  const historyName = document.getElementById('historyInfluencerName');
  const emptyMsg = document.getElementById('historyEmptyMsg');

  if (!historySection || !historyGrid) return;

  historyName.textContent = state.selectedPersona?.name || '';
  historySection.style.display = 'block';
  historyGrid.innerHTML = '';
  emptyMsg.style.display = 'none';

  try {
    const res = await authFetch(`/api/personas/${personaId}/generations`);
    const data = await res.json();
    if (data.success) {
      state.generationHistory = data.generations;
      renderGenerationHistory();
    }
  } catch (err) {
    console.error('Error loading generation history:', err);
  }
}

function renderGenerationHistory() {
  const historyGrid = document.getElementById('generationHistoryGrid');
  const emptyMsg = document.getElementById('historyEmptyMsg');
  if (!historyGrid) return;

  historyGrid.innerHTML = '';

  let filtered = [...state.generationHistory];
  if (state.historyFilter !== 'all') {
    filtered = filtered.filter(g => g.generation_type === state.historyFilter);
  }

  if (filtered.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  filtered.forEach(gen => {
    const card = document.createElement('div');
    card.className = 'history-card';
    
    // Format timestamp nicely
    const dateStr = new Date(gen.created_at).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Badge styling matching type
    let typeClass = 'badge-style';
    let typeLabel = 'Retrato';
    if (gen.generation_type === 'variant') {
      typeClass = 'badge-variant';
      typeLabel = 'Variante';
    } else if (gen.generation_type === 'ugc') {
      typeClass = 'badge-ugc';
      typeLabel = 'UGC Post';
    }

    card.innerHTML = `
      <img src="${gen.image_path}" alt="Generation image" class="history-card-img">
      <div class="history-card-overlay">
        <span class="history-type-badge ${typeClass}">${typeLabel}</span>
        <div class="history-card-meta">
          <div class="history-card-date">${dateStr}</div>
          <div class="history-card-prompt">${gen.prompt || 'Sin prompt'}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openHistoryModal(gen));
    historyGrid.appendChild(card);
  });
}

function setHistoryFilter(filter) {
  state.historyFilter = filter;
  
  // Toggle active class on filter buttons
  document.getElementById('btnHistAll').classList.toggle('active', filter === 'all');
  document.getElementById('btnHistPortrait').classList.toggle('active', filter === 'portrait');
  document.getElementById('btnHistVariant').classList.toggle('active', filter === 'variant');
  document.getElementById('btnHistUgc').classList.toggle('active', filter === 'ugc');
  
  renderGenerationHistory();
}

function openHistoryModal(gen) {
  const modal = document.getElementById('historyModal');
  const img = document.getElementById('historyModalImage');
  const typeBadge = document.getElementById('historyModalType');
  const dateEl = document.getElementById('historyModalDate');
  const promptEl = document.getElementById('historyModalPrompt');
  const deleteBtn = document.getElementById('historyModalDelete');

  if (!modal) return;

  img.src = gen.image_path;
  
  let typeLabel = 'Retrato Principal';
  if (gen.generation_type === 'variant') typeLabel = 'Pose / Variante';
  if (gen.generation_type === 'ugc') typeLabel = 'UGC Producto';
  
  typeBadge.textContent = typeLabel;
  typeBadge.className = `history-type-badge ${gen.generation_type === 'variant' ? 'badge-variant' : gen.generation_type === 'ugc' ? 'badge-ugc' : 'badge-style'}`;

  const dateStr = new Date(gen.created_at).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  dateEl.textContent = `Generado el: ${dateStr}`;
  promptEl.textContent = gen.prompt || 'Sin prompt detallado.';

  // Clone delete button to strip old event listeners
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

  newDeleteBtn.addEventListener('click', () => {
    deleteGenerationAction(gen.id);
  });

  modal.style.display = 'flex';
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.style.display = 'none';
}

async function deleteGenerationAction(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta imagen de tu historial?')) return;
  
  try {
    const res = await authFetch(`/api/generations/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeHistoryModal();
      
      // Update generation history list
      state.generationHistory = state.generationHistory.filter(g => g.id !== id);
      renderGenerationHistory();
      
      // Update stats and dashboard
      const dataRes = await authFetch('/api/data');
      const dataJson = await dataRes.json();
      state.generationStats = dataJson.generationStats || { total: 0 };
      updateDashboardStats();

      showSyncToast(true, 'Imagen eliminada del historial.');
    }
  } catch (e) {
    showSyncToast(false, 'Error al eliminar del historial.');
  }
}

async function loadCharacterBible(sceneDescription = "") {
  const persona = state.selectedPersona;
  if (!persona) return;

  const sceneInput = document.getElementById('sceneDescriptionInput');
  const crefInput = document.getElementById('bibleCrefUrlInput');

  if (sceneDescription === "") {
    if (sceneInput) sceneInput.value = "";
    if (crefInput) crefInput.value = "";
  }

  const referenceUrl = crefInput ? crefInput.value.trim() : "";

  const spinner = document.getElementById('bibleLoadingSpinner');
  if (spinner) spinner.style.display = 'flex';

  try {
    const res = await authFetch(`/api/personas/${persona.id}/character-bible`, {
      method: 'POST',
      body: JSON.stringify({ 
        sceneDescription,
        options: { referenceUrl }
      })
    });
    const data = await res.json();
    if (data.success && data.characterBible) {
      const b = data.characterBible;
      
      document.getElementById('bibleLockPrompt').textContent = b.character_lock_section || "";
      document.getElementById('biblePositivePrompt').textContent = b.positive_prompt || "";
      
      const recs = b.model_recommendations || {};
      document.getElementById('bibleMjPrompt').textContent = recs.midjourney || "";
      document.getElementById('bibleFluxPrompt').textContent = recs.flux || "";
      document.getElementById('bibleLeonardoPrompt').textContent = recs.leonardo || "";
      document.getElementById('bibleIdeogramPrompt').textContent = recs.ideogram || "";
      
      // Populate Grok, ChatGPT, and Meta AI
      const grokEl = document.getElementById('bibleGrokPrompt');
      if (grokEl) grokEl.textContent = recs.grok_imagine || "";
      const chatgptEl = document.getElementById('bibleChatGptPrompt');
      if (chatgptEl) chatgptEl.textContent = recs.chatgpt || "";
      const metaEl = document.getElementById('bibleMetaAIPrompt');
      if (metaEl) metaEl.textContent = recs.meta_ai || "";
      
      document.getElementById('bibleUsageNotes').textContent = b.usage_notes || "";
    } else {
      console.warn("Failed to load character bible details:", data.message);
    }
  } catch (err) {
    console.error("Error loading character bible:", err);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

// Global modal click-away
window.addEventListener('click', (e) => {
  const modal = document.getElementById('historyModal');
  if (e.target === modal) {
    closeHistoryModal();
  }
  const importModal = document.getElementById('importInfluencerModal');
  if (e.target === importModal) {
    importModal.style.display = 'none';
  }
});

// ============================================================
// IMPORT INFLUENCER MODAL (Fase 2)
// ============================================================
function initImportModal() {
  const modal = document.getElementById('importInfluencerModal');
  const btnOpen = document.getElementById('btnOpenImportModal');
  const btnClose = document.getElementById('btnCloseImportModal');
  const btnCancelStep1 = document.getElementById('btnCancelImportStep1');
  const btnCancelPreview = document.getElementById('btnCancelImportPreview');
  const btnAnalyze = document.getElementById('btnAnalyzeInfluencer');
  const btnConfirm = document.getElementById('btnConfirmImport');

  const step1 = document.getElementById('importStep1');
  const loading = document.getElementById('importLoading');
  const preview = document.getElementById('importPreview');

  const imagesInput = document.getElementById('importImages');
  const urlInput = document.getElementById('importUrl');
  const nameInput = document.getElementById('importName');
  const scriptTopicInput = document.getElementById('importScriptTopic');
  const suggestedNameInput = document.getElementById('importSuggestedName');
  const summaryText = document.getElementById('importSummaryText');
  const videoPromptsContainer = document.getElementById('importVideoPrompts');
  const filesFeedback = document.getElementById('importFilesFeedback');

  let lastImportedPersona = null;

  if (!modal) return;

  if (imagesInput && filesFeedback) {
    imagesInput.addEventListener('change', () => {
      const count = imagesInput.files.length;
      if (count > 0) {
        filesFeedback.textContent = `Imágenes seleccionadas: ${count}/4 ${count > 4 ? '(se usarán las primeras 4)' : ''}`;
        filesFeedback.style.display = 'block';
      } else {
        filesFeedback.style.display = 'none';
        filesFeedback.textContent = '';
      }
    });
  }

  function openModal() {
    modal.style.display = 'flex';
    step1.style.display = 'block';
    loading.style.display = 'none';
    preview.style.display = 'none';
    
    // Clear inputs
    imagesInput.value = '';
    urlInput.value = '';
    nameInput.value = '';
    scriptTopicInput.value = '';
    suggestedNameInput.value = '';
    summaryText.innerHTML = '';
    videoPromptsContainer.innerHTML = '';
    if (filesFeedback) {
      filesFeedback.style.display = 'none';
      filesFeedback.textContent = '';
    }
    lastImportedPersona = null;
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancelStep1) btnCancelStep1.addEventListener('click', closeModal);
  if (btnCancelPreview) btnCancelPreview.addEventListener('click', closeModal);

  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const files = imagesInput.files;
      const imageUrl = urlInput.value.trim();
      const customName = nameInput.value.trim();
      const scriptTopic = scriptTopicInput.value.trim();

      if (files.length === 0 && !imageUrl) {
        alert('Por favor, selecciona al menos una foto o proporciona una URL de referencia.');
        return;
      }

      // Transition to loading step
      step1.style.display = 'none';
      loading.style.display = 'flex';
      preview.style.display = 'none';

      const formData = new FormData();
      if (files.length > 0) {
        const maxFiles = Math.min(files.length, 4);
        for (let i = 0; i < maxFiles; i++) {
          formData.append('photo', files[i]);
        }
      }
      if (imageUrl) {
        formData.append('imageUrl', imageUrl);
      }
      if (customName) {
        formData.append('name', customName);
      }
      if (scriptTopic) {
        formData.append('scriptTopic', scriptTopic);
      }

      try {
        const response = await authFetch('/api/import-influencer', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Error desconocido al analizar.');
        }

        lastImportedPersona = data.persona;

        // Transition to preview step
        loading.style.display = 'none';
        preview.style.display = 'block';

        // Render suggested name
        suggestedNameInput.value = lastImportedPersona.name;

        // Render visual analysis summary
        const d = lastImportedPersona.detailedJSON || {};
        summaryText.innerHTML = `
          <strong>Género/Edad:</strong> ${d.identity?.gender || lastImportedPersona.gender} (${d.identity?.apparent_age || lastImportedPersona.age})<br>
          <strong>Etnia:</strong> ${d.identity?.ethnicity_appearance || lastImportedPersona.ethnicity}<br>
          <strong>Rostro:</strong> ${d.facial_features?.face_shape || 'ovalada'} (${d.facial_features?.skin_tone || 'tono natural'}) con ${d.facial_features?.skin_texture || 'textura natural'}<br>
          <strong>Cabello:</strong> ${d.hair?.length || 'medio'}, ${d.hair?.texture || 'natural'}, color ${d.hair?.color || 'castaño'}<br>
          <strong>Estilo:</strong> ${d.aesthetic?.overall_vibe || lastImportedPersona.style}
        `;

        // Render video scripts list
        videoPromptsContainer.innerHTML = '';
        if (data.videoScripts && data.videoScripts.length > 0) {
          data.videoScripts.forEach((s, idx) => {
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.padding = '12px';
            card.style.background = 'rgba(255,255,255,0.01)';
            card.style.border = '1px solid rgba(255,255,255,0.05)';
            card.style.borderRadius = '8px';
            card.style.marginBottom = '10px';

            const firstScenePrompt = s.scenes && s.scenes[0] ? s.scenes[0].visual_prompt : 'Sin prompt visual';
            card.innerHTML = `
              <h4 style="font-size: 12px; color: #fff; margin-bottom: 6px; font-weight: 700;">🎬 ${s.title || `Guion ${idx + 1}`}</h4>
              <p style="font-size: 11px; margin-bottom: 6px; color: var(--text-secondary); line-height: 1.4;">
                <strong>Audio:</strong> "${s.hook} ${s.body} ${s.cta}"
              </p>
              <div class="prompt-console" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2);">
                <span style="font-size: 8px; color: var(--accent-primary); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Prompt de Video Consistent</span>
                <div style="font-size: 10px; color: #ccc; max-height: 60px; overflow-y: auto; font-family: var(--font-mono);">${firstScenePrompt}</div>
              </div>
            `;
            videoPromptsContainer.appendChild(card);
          });
        } else {
          videoPromptsContainer.innerHTML = '<p style="font-size: 11px; color: var(--text-secondary);">No se generaron guiones de video.</p>';
        }

      } catch (err) {
        console.error('Import analysis failed:', err);
        alert(`Error al analizar influencer: ${err.message}`);
        // Return to step 1
        loading.style.display = 'none';
        step1.style.display = 'block';
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      if (!lastImportedPersona) return;

      const finalName = suggestedNameInput.value.trim();
      if (!finalName) {
        alert('Por favor, indica un nombre para el influencer.');
        return;
      }

      try {
        // If the user modified the suggested name, save it back to update
        if (finalName !== lastImportedPersona.name) {
          lastImportedPersona.name = finalName;
          lastImportedPersona.handle = `@${finalName.toLowerCase().replace(/\s+/g, '')}_ugc`;
          
          const saveRes = await authFetch('/api/personas', {
            method: 'POST',
            body: JSON.stringify(lastImportedPersona)
          });
          const saveJson = await saveRes.json();
          if (saveJson.success) {
            state.personas = saveJson.personas;
          }
        }

        alert(`¡Influencer "${finalName}" importado y creado con éxito!`);
        closeModal();

        // Refresh all lists and stats
        const res = await authFetch('/api/data');
        const data = await res.json();
        
        state.personas = data.personas;
        state.products = data.products;
        state.generationStats = data.generationStats || { total: 0 };
        
        // Select the newly created persona
        const found = state.personas.find(p => p.id === lastImportedPersona.id || p.name === finalName);
        if (found) {
          selectPersona(found);
        } else if (state.personas.length > 0) {
          selectPersona(state.personas[0]);
        }

      } catch (err) {
        console.error('Failed to confirm and save persona:', err);
        alert(`Error al confirmar la creación: ${err.message}`);
      }
    });
  }
}

window.closeHistoryModal = closeHistoryModal;
window.setPortfolioFilter = setPortfolioFilter;
window.setHistoryFilter = setHistoryFilter;
window.loadCharacterBible = loadCharacterBible;
window.initImportModal = initImportModal;

