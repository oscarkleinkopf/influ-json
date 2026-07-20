// State Management
let state = {
  personas: [],
  products: [],
  campaigns: [],
  selectedPersona: null,
  /** When true, save always creates a NEW persona (never renames/updates another by id or name). */
  isCreatingNewPersona: false,
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
  historyFilter: 'all', // 'all', 'portrait', 'variant', 'ugc'
  scratchExtendedTraits: null
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
  const initSteps = [
    { name: 'setupTabs', fn: setupTabs },
    { name: 'checkAuthAndInit', fn: checkAuthAndInit },
    { name: 'setupLogin', fn: setupLogin },
    { name: 'setupPersonaEngine', fn: setupPersonaEngine },
    { name: 'setupPhotoUpload', fn: setupPhotoUpload },
    { name: 'setupABComparator', fn: setupABComparator },
    { name: 'setupVersionHistory', fn: setupVersionHistory },
    { name: 'setupCampaigns', fn: setupCampaigns },
    { name: 'setupScriptEngine', fn: setupScriptEngine },
    { name: 'setupUgcStudio', fn: setupUgcStudio },
    { name: 'setupLicensing', fn: setupLicensing },
    { name: 'setupGallery', fn: setupGallery },
    { name: 'setupVariantManager', fn: setupVariantManager },
    { name: 'setupFreeChatbotPacks', fn: setupFreeChatbotPacks },
    { name: 'initImportModal', fn: initImportModal }
  ];

  initSteps.forEach(step => {
    try {
      step.fn();
    } catch (err) {
      console.error(`Error in initialization step [${step.name}]:`, err);
    }
  });
  
  const syncBtn = document.getElementById('btnSyncNow');
  if (syncBtn) {
    syncBtn.addEventListener('click', manualGitSync);
  }
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
        toastError('PIN incorrecto. Inténtalo de nuevo.');
      }
    } catch (err) {
      toastError('Error de conexión al autenticar.');
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

/** Normalize archived flag (sqlite may return 0/1, true/false, or null). */
function isArchivedPersona(p) {
  return p && (p.archived === 1 || p.archived === true || p.archived === '1');
}

/** Always re-render portfolio + select grids from current state.personas. */
function refreshPersonaLists() {
  try {
    updateDashboardStats();
  } catch (e) {
    console.warn('updateDashboardStats failed:', e);
  }
  try {
    renderPersonaGrids();
  } catch (e) {
    console.warn('renderPersonaGrids failed:', e);
  }
}

/**
 * Reload personas/products/stats from the server and refresh UI.
 * @param {{ id?: string, name?: string }|null} selectTarget - persona to select after load
 */
async function reloadPersonasFromServer(selectTarget = null) {
  const res = await authFetch('/api/data');
  const data = await res.json();
  state.personas = Array.isArray(data.personas) ? data.personas : [];
  state.products = Array.isArray(data.products) ? data.products : state.products;
  state.generationStats = data.generationStats || { total: 0 };

  refreshPersonaLists();

  let toSelect = null;
  if (selectTarget) {
    toSelect = state.personas.find(p =>
      (selectTarget.id && p.id === selectTarget.id) ||
      (selectTarget.name && p.name && p.name.toLowerCase() === String(selectTarget.name).toLowerCase())
    );
  }
  if (!toSelect && state.selectedPersona?.id) {
    toSelect = state.personas.find(p => p.id === state.selectedPersona.id) || null;
  }

  if (toSelect) {
    try {
      selectPersona(toSelect);
    } catch (e) {
      console.warn('selectPersona failed after reload:', e);
      refreshPersonaLists();
    }
  }

  return state.personas;
}

// Fetch Initial Data
async function fetchData() {
  try {
    const res = await authFetch('/api/data');
    const data = await res.json();
    
    state.personas = Array.isArray(data.personas) ? data.personas : [];
    state.products = Array.isArray(data.products) ? data.products : [];
    state.generationStats = data.generationStats || { total: 0 };
    
    // Always paint lists first so a selectPersona error cannot hide the portfolio
    refreshPersonaLists();

    if (state.personas.length > 0) {
      try {
        selectPersona(state.personas[0]);
      } catch (e) {
        console.warn('Initial selectPersona failed:', e);
        refreshPersonaLists();
      }
    }
    if (state.products.length > 0) state.selectedProduct = state.products[0];
    
    try { populateActiveUgcData(); } catch (e) { console.warn(e); }
    try { generateMockScripts(); } catch (e) { console.warn(e); }
    try { updateLicensingCalculator(); } catch (e) { console.warn(e); }
  } catch (err) {
    console.error('Error fetching initial data:', err);
  }
}

/**
 * Portfolio filter used by dashboard grid AND the Influencers stat (ROADMAP 1.5).
 * Count of cards rendered must always equal this array's length.
 */
function getFilteredPortfolioPersonas() {
  let filtered = Array.isArray(state.personas) ? [...state.personas] : [];

  if (state.portfolioFilter === 'active') {
    filtered = filtered.filter(p => !isArchivedPersona(p));
  } else if (state.portfolioFilter === 'archived') {
    filtered = filtered.filter(p => isArchivedPersona(p));
  }

  const q = (state.portfolioSearchQuery || '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(p => {
      const hay = [
        p.name,
        p.style,
        p.ethnicity,
        p.ethnicity_appearance,
        p.gender,
        p.handle,
        p.age
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  return filtered;
}

function clearPortfolioSearch() {
  state.portfolioSearchQuery = '';
  const input = document.getElementById('portfolioSearch');
  if (input) input.value = '';
  updateDashboardStats();
}

// Dashboard Update
function updateDashboardStats() {
  const all = Array.isArray(state.personas) ? state.personas : [];
  const activeTotal = all.filter(p => !isArchivedPersona(p)).length;
  const archivedTotal = all.filter(p => isArchivedPersona(p)).length;
  const filtered = getFilteredPortfolioPersonas();
  const visibleCount = filtered.length;

  // 1.5: big number = cards currently visible (filter + search), not a silent total
  const statEl = document.getElementById('statPersonasCount');
  if (statEl) statEl.textContent = visibleCount;

  const statLabel = document.getElementById('statPersonasLabel');
  if (statLabel) {
    if (state.portfolioFilter === 'archived') statLabel.textContent = 'Archivados';
    else if (state.portfolioFilter === 'active') statLabel.textContent = 'Activos';
    else statLabel.textContent = 'Influencers';
  }

  const statHint = document.getElementById('statPersonasHint');
  if (statHint) {
    const hasSearch = !!(state.portfolioSearchQuery || '').trim();
    if (hasSearch || state.portfolioFilter !== 'all') {
      statHint.textContent = `${activeTotal} activos · ${all.length} total`;
    } else {
      statHint.textContent = `${activeTotal} activos · ${archivedTotal} archivados`;
    }
  }

  const meta = document.getElementById('portfolioResultMeta');
  if (meta) {
    const filterLabel = state.portfolioFilter === 'active' ? 'activos'
      : state.portfolioFilter === 'archived' ? 'archivados' : 'todos';
    const q = (state.portfolioSearchQuery || '').trim();
    if (q) {
      meta.textContent = `${visibleCount} visibles · filtro “${filterLabel}” · búsqueda “${q}”`;
    } else {
      meta.textContent = `${visibleCount} visibles · filtro “${filterLabel}” · ${all.length} en roster`;
    }
  }

  const prodStat = document.getElementById('statProductsCount');
  if (prodStat) prodStat.textContent = state.products.length;
  
  // Total generations count from stats state
  const totalGens = state.generationStats?.total || 0;
  const genStat = document.getElementById('statGenerationsCount');
  if (genStat) genStat.textContent = totalGens;

  // Let's approximate scripts count or use campaigns
  let scriptsCount = 0;
  try {
    scriptsCount = state.campaigns.length * 10;
  } catch(e) {}
  const scriptStat = document.getElementById('statScriptsCount');
  if (scriptStat) scriptStat.textContent = scriptsCount || 10;
  
  const personaGrid = document.getElementById('dashboardPersonaGrid');
  if (!personaGrid) return;
  personaGrid.innerHTML = '';
  
  if (filtered.length === 0) {
    const hasSearch = !!(state.portfolioSearchQuery || '').trim();
    const hasFilter = state.portfolioFilter !== 'all';
    personaGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px 20px; font-size: 14px;">
        <div style="font-size: 28px; margin-bottom: 10px;">🔍</div>
        <div style="margin-bottom: 8px; color: #fff; font-weight: 600;">0 influencers en esta vista</div>
        <div style="margin-bottom: 16px; font-size: 13px;">
          ${hasSearch || hasFilter
            ? 'No hay coincidencias con la búsqueda o el filtro actual.'
            : 'Aún no hay influencers en el roster.'}
        </div>
        ${hasSearch || hasFilter ? `
          <button type="button" class="btn btn-secondary btn-sm" id="btnClearPortfolioFilters" style="margin: 0 4px;">
            Limpiar búsqueda y ver todos
          </button>
        ` : ''}
      </div>
    `;
    const clearBtn = document.getElementById('btnClearPortfolioFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.portfolioFilter = 'all';
        const bAll = document.getElementById('btnPortfolioAll');
        const bAct = document.getElementById('btnPortfolioActive');
        const bArc = document.getElementById('btnPortfolioArchived');
        if (bAll) bAll.classList.add('active');
        if (bAct) bAct.classList.remove('active');
        if (bArc) bArc.classList.remove('active');
        clearPortfolioSearch();
      });
    }
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
    if (isArchivedPersona(p)) card.classList.add('archived-style');

    card.innerHTML = `
      <div class="portfolio-card-img-wrapper">
        <img src="${p.image || 'assets/influencer_female.png'}" alt="${p.name || 'Influencer'}" onerror="this.src='assets/influencer_female.png'">
        <span class="portfolio-badge badge-style">${p.style || 'Lifestyle'}</span>
        ${isArchivedPersona(p) ? '<span class="portfolio-badge badge-archived">Archivado</span>' : ''}
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
          <button class="btn btn-quick-archive" style="font-size: 11px; padding: 6px 10px; background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--glass-border);">${isArchivedPersona(p) ? 'Desarchivar' : 'Archivar'}</button>
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

function applyGeneratedTraitsToForm(details) {
  if (!details) return;
  const f = details.facial_features || {};
  const h = details.hair || {};
  const a = details.aesthetic || {};
  const p = details.photography || {};
  const b = details.body || {};

  const setInputValue = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  setInputValue('pSkinTone', f.skin_tone);
  setInputValue('pSkinTexture', f.skin_texture);
  setInputValue('pFaceShape', f.face_shape);
  setInputValue('pEyeColor', f.eye_color);
  setInputValue('pEyebrows', f.eyebrow_style);
  setInputValue('pLips', f.lip_shape);
  setInputValue('pSmileType', f.smile_type);

  setInputValue('pHairColor', h.color);
  setInputValue('pHairTexture', h.texture);
  setInputValue('pHairLength', h.length);
  setInputValue('pHair', h.style);

  setInputValue('pStyle', a.overall_vibe);
  setInputValue('pClothing', a.fashion_style);
  setInputValue('pCamera', p.camera_lens);
  setInputValue('pLighting', p.lighting_type);

  // Full body traits
  setInputValue('pBodyType', b.body_type);
  setInputValue('pHeight', b.height_appearance);
  setInputValue('pProportions', b.proportions || b.waist_hip_balance);
  setInputValue('pPosture', b.posture);
  setInputValue('pFitness', b.fitness_level);
  setInputValue('pBodySkin', b.skin_continuity);

  state.scratchExtendedTraits = {
    eye_shape: f.eye_shape || '',
    jawline: f.jawline || '',
    makeup_level: a.makeup_level || '',
    color_grade: p.color_grade || '',
    depth_of_field: p.depth_of_field || '',
    body_type: b.body_type || '',
    proportions: b.proportions || '',
    height_appearance: b.height_appearance || ''
  };

  compilePromptAndJSON();
  toastSuccess('Rasgos de cara y cuerpo aplicados al formulario');
}

function resetPersonaFormForNew() {
  // Explicit create mode: save must INSERT a new row, never UPDATE another persona
  state.isCreatingNewPersona = true;
  state.selectedPersona = null;
  state.scratchExtendedTraits = null;
  uploadedImagePath = null;

  // Clear selection highlight on portfolio / select grids
  try { refreshPersonaLists(); } catch (e) { /* grids may not be ready */ }

  // Ensure we are on Persona Engine so the form is visible
  if (state.activeTab !== 'persona-engine') {
    navigateToTab('persona-engine');
  }

  // Toggle visibility
  const profileSheet = document.getElementById('personaProfileSheet');
  const personaForm = document.getElementById('personaForm');
  if (profileSheet && personaForm) {
    profileSheet.style.display = 'none';
    personaForm.style.display = 'flex';
  }

  // Change config header title
  const editorTitle = document.getElementById('editorHeaderTitle');
  if (editorTitle) {
    editorTitle.textContent = "Configuración del Personaje (Nuevo desde Cero)";
  }

  // Change save button text
  const btnSave = document.getElementById('btnSavePersona');
  if (btnSave) {
    btnSave.textContent = "Crear Influencer";
    btnSave.dataset.createMode = '1';
  }

  // Banner so the user knows this will not overwrite an existing influencer
  let createBanner = document.getElementById('createModeBanner');
  if (!createBanner) {
    createBanner = document.createElement('div');
    createBanner.id = 'createModeBanner';
    createBanner.style.cssText = 'margin:0 0 16px 0;padding:10px 14px;border-radius:10px;border:1px solid rgba(99,102,241,0.35);background:rgba(99,102,241,0.12);color:#c7d2fe;font-size:12px;line-height:1.4;';
    if (personaForm && personaForm.parentElement) {
      personaForm.parentElement.insertBefore(createBanner, personaForm);
    } else if (personaForm) {
      personaForm.prepend(createBanner);
    }
  }
  createBanner.style.display = 'block';
  createBanner.textContent = '✨ Modo crear nuevo: al guardar se creará un influencer aparte. No se renombrará ni sobrescribirá ninguno existente.';

  // Clear basic inputs & suggest trendy name
  const trendyNames = ["Clara", "Sofía", "Valentina", "Martina", "Elena", "Paula", "Lucía", "Mateo", "Lucas", "Adrián", "Javier", "Thiago"];
  const randomName = trendyNames[Math.floor(Math.random() * trendyNames.length)];
  document.getElementById('pName').value = randomName;
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
  updateSettingDropdown('Sala de estar moderna y neutral');

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
  const setIf = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setIf('pHeight', 'Estatura media (~1.65 m)');
  setIf('pProportions', 'Hombros equilibrados, cintura definida, caderas suaves y proporcionales');
  setIf('pPosture', 'Erguida y relajada, hombros sueltos, cuello alargado');
  setIf('pFitness', 'Tono natural ligero, sin musculatura exagerada');
  setIf('pBodySkin', 'Mismo tono de piel que el rostro en cuello, hombros y brazos; textura natural continua');

  // Force re-compilation of prompts
  compilePromptAndJSON();
  
  // Set json editor values to default
  const jsonArea = document.getElementById('jsonEditor');
  if (jsonArea) {
    jsonArea.value = JSON.stringify(getFullPersonaJSON(), null, 2);
  }

  // Clear bible prompts fields safely
  const clearElText = (id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  };
  clearElText('bibleLockPrompt');
  clearElText('biblePositivePrompt');
  clearElText('bibleMjPrompt');
  clearElText('bibleFluxPrompt');
  clearElText('bibleLeonardoPrompt');
  clearElText('bibleIdeogramPrompt');
  clearElText('bibleGrokPrompt');
  clearElText('bibleChatGptPrompt');
  clearElText('bibleMetaAIPrompt');
  
  const usageNotesEl = document.getElementById('bibleUsageNotes');
  if (usageNotesEl) {
    usageNotesEl.textContent = "Completa los campos de la izquierda y haz clic en 'Crear Influencer' para generar la biblia.";
  }

  // Scroll smoothly to form
  const editorLayout = document.querySelector('.editor-layout');
  if (editorLayout) {
    editorLayout.scrollIntoView({ behavior: 'smooth' });
  }
}

// Select Persona
function selectPersona(persona) {
  if (!persona) return;
  // Selecting an existing persona always exits pure "create new" mode
  state.isCreatingNewPersona = false;
  state.selectedPersona = persona;
  uploadedImagePath = null; // Clear upload session when selecting another persona

  const createBanner = document.getElementById('createModeBanner');
  if (createBanner) createBanner.style.display = 'none';
  
  // Reset editor title and save button text
  const editorTitle = document.getElementById('editorHeaderTitle');
  if (editorTitle) {
    editorTitle.textContent = "Configuración del Personaje";
  }
  const btnSave = document.getElementById('btnSavePersona');
  if (btnSave) {
    btnSave.textContent = "Guardar Persona en influ-JSON";
    delete btnSave.dataset.createMode;
  }

  updateDashboardStats();
  renderPersonaGrids();
  populateActiveUgcData();
  updateLicensingCalculator();
  
  // Update inputs in Persona Form (safe for missing nodes / non-matching <select> values)
  const setInputValue = (id, val) => {
    const el = document.getElementById(id);
    if (!el || val == null) return;
    if (el.tagName === 'SELECT') {
      const str = String(val);
      const hasOption = Array.from(el.options).some(o => o.value === str);
      if (!hasOption && str) {
        const opt = document.createElement('option');
        opt.value = str;
        opt.textContent = str;
        el.appendChild(opt);
      }
      el.value = str;
    } else {
      el.value = val;
    }
  };
  setInputValue('pName', persona.name);
  setInputValue('pGender', persona.gender);
  setInputValue('pAge', persona.age);
  setInputValue('pEthnicity', persona.ethnicity || 'Latina');
  setInputValue('pStyle', persona.style);
  setInputValue('pHair', persona.hair);
  setInputValue('pLighting', persona.lighting);
  setInputValue('pCamera', persona.camera);
  updateClothingDropdown(persona.clothing);
  updateSettingDropdown(persona.setting);
  setInputValue('pSetting', persona.setting);

  // Extract detailed features from detailedJSON if available (unwrap double-encoding)
  let detailed = {};
  if (persona.detailedJSON) {
    try {
      detailed = parseDetailedJSON(persona.detailedJSON);
    } catch(e) {}
  }
  
  setInputValue('pSkinTone', detailed.facial_features?.skin_tone || 'Piel clara ligeramente bronceada');
  setInputValue('pSkinTexture', detailed.facial_features?.skin_texture || 'Piel suave con poros y pecas muy sutiles');
  setInputValue('pEyebrows', detailed.facial_features?.eyebrows || detailed.facial_features?.eyebrow_style || 'Cejas castañas oscuras y pobladas');
  setInputValue('pLips', detailed.facial_features?.lips || (detailed.facial_features?.lip_color ? `${detailed.facial_features.lip_color} ${detailed.facial_features.lip_shape || ''}` : '') || 'Labios rosados naturales carnosos');
  setInputValue('pHairColor', detailed.hair?.color || 'Castaño oscuro natural');
  setInputValue('pHairTexture', detailed.hair?.texture || 'Ondulado natural con cuerpo');
  setInputValue('pHairLength', detailed.hair?.length || 'Largo, por debajo de los hombros');
  setInputValue('pEyeColor', detailed.facial_features?.eye_color || 'Marrón cálido con destellos miel');
  setInputValue('pFaceShape', detailed.facial_features?.face_shape || 'Ovalada con mandíbula definida');
  setInputValue('pSmileType', detailed.facial_features?.smile_type || 'Sonrisa cálida, accesible y natural');
  setInputValue('pBodyType', detailed.body?.body_type || detailed.identity?.body_type || 'Atlético y proporcionado');
  setInputValue('pHeight', detailed.body?.height_appearance || 'Estatura media (~1.65 m)');
  setInputValue('pProportions', detailed.body?.proportions || 'Hombros equilibrados, cintura definida, caderas suaves y proporcionales');
  setInputValue('pPosture', detailed.body?.posture || 'Erguida y relajada, hombros sueltos, cuello alargado');
  setInputValue('pFitness', detailed.body?.fitness_level || 'Tono natural ligero, sin musculatura exagerada');
  setInputValue('pBodySkin', detailed.body?.skin_continuity || 'Mismo tono de piel que el rostro en cuello, hombros y brazos; textura natural continua');
  
  // Variant manager sync
  const activeNameEl = document.getElementById('activeInfluencerName');
  if (activeNameEl) activeNameEl.textContent = persona.name;
  updateVariantClothingDropdown(persona.gender);
  loadVariantsForPersona(persona.id);

  // Archive button label and styling
  const archiveBtn = document.getElementById('btnArchivePersona');
  if (archiveBtn) {
    if (isArchivedPersona(persona)) {
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

  try { compilePromptAndJSON(); } catch (e) { console.warn('compilePromptAndJSON:', e); }

  // Populate and show Editorial Profile Sheet
  const profileSheet = document.getElementById('personaProfileSheet');
  const personaForm = document.getElementById('personaForm');
  if (profileSheet && personaForm) {
    profileSheet.style.display = 'block';
    personaForm.style.display = 'none';
  }
  
  if (editorTitle) {
    editorTitle.textContent = "Ficha de Influencer";
  }

  const sheetImg = document.getElementById('sheetProfileImg');
  if (sheetImg) {
    sheetImg.src = persona.image || (persona.gender === 'Male' ? 'assets/influencer_male.png' : 'assets/nano_banana_influencer.png');
  }

  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text ?? ''; };
  setText('sheetName', persona.name);
  setText('sheetHandle', persona.handle || `@${(persona.name || 'influencer').toLowerCase().replace(/\s+/g, '')}_ugc`);
  setText('sheetGenderBadge', persona.gender === 'Male' ? 'Masculino' : 'Femenino');
  setText('sheetAgeBadge', persona.age);
  setText('sheetEthnicityBadge', persona.ethnicity || 'Latina');
  
  const sheetArchivedBadge = document.getElementById('sheetArchivedBadge');
  if (sheetArchivedBadge) {
    sheetArchivedBadge.style.display = isArchivedPersona(persona) ? 'inline-block' : 'none';
  }

  const getVal = (id) => document.getElementById(id)?.value || '';
  // Prefer live form values; fall back to detailedJSON.body / identity (detailed already parsed above)
  const body = detailed.body || {};

  setText('sheetSkinTone', getVal('pSkinTone') || detailed.facial_features?.skin_tone || '—');
  setText('sheetSkinTexture', getVal('pSkinTexture') || detailed.facial_features?.skin_texture || '—');
  setText('sheetEyes', `${getVal('pEyeColor') || detailed.facial_features?.eye_color || '—'} / ${getVal('pEyebrows') || detailed.facial_features?.eyebrow_style || '—'}`);
  setText('sheetHairDetails', `${getVal('pHairColor') || detailed.hair?.color || '—'} (${getVal('pHairTexture') || detailed.hair?.texture || '—'}, ${getVal('pHairLength') || detailed.hair?.length || '—'})`);
  setText('sheetStyle', persona.style || getVal('pStyle') || detailed.aesthetic?.overall_vibe || '—');
  setText('sheetCamera', getVal('pCamera') || detailed.photography?.camera_lens || '—');
  setText('sheetLighting', getVal('pLighting') || detailed.photography?.lighting_type || '—');
  setText('sheetSetting', persona.setting || getVal('pSetting') || detailed.photography?.background_setting || '—');

  // Body block in ficha (was missing — only face fields were shown)
  setText('sheetBodyType', getVal('pBodyType') || body.body_type || detailed.identity?.body_type || '—');
  setText('sheetHeight', getVal('pHeight') || body.height_appearance || '—');
  setText('sheetProportions', getVal('pProportions') || body.proportions || body.waist_hip_balance || '—');
  setText('sheetPosture', getVal('pPosture') || body.posture || '—');
  setText('sheetFitness', getVal('pFitness') || body.fitness_level || '—');
  setText('sheetBodySkin', getVal('pBodySkin') || body.skin_continuity || '—');
  setText('sheetBodyFraming', body.visible_framing || detailed.photography?.framing || 'Plano medio con torso visible');
  
  const promptText = document.getElementById('promptPreview')?.textContent || '';
  setText('sheetPromptPreview', promptText);

  // Update profile sheet archive button text/state
  const sheetArchiveBtn = document.getElementById('btnSheetArchive');
  if (sheetArchiveBtn) {
    if (isArchivedPersona(persona)) {
      sheetArchiveBtn.textContent = '📦 Desarchivar';
      sheetArchiveBtn.style.background = 'rgba(40, 167, 69, 0.1)';
      sheetArchiveBtn.style.color = '#28a745';
      sheetArchiveBtn.style.borderColor = 'rgba(40, 167, 69, 0.2)';
    } else {
      sheetArchiveBtn.textContent = '📦 Archivar';
      sheetArchiveBtn.style.background = 'rgba(255, 193, 7, 0.1)';
      sheetArchiveBtn.style.color = '#ffc107';
      sheetArchiveBtn.style.borderColor = 'rgba(255, 193, 7, 0.2)';
    }
  }

  if (persona.id) {
    loadGenerationHistory(persona.id);
    loadCharacterBible("");
  }
}

// Render Select grids in tabs
function renderPersonaGrids() {
  const selectGrid = document.getElementById('personaSelectGrid');
  if (!selectGrid) return;
  selectGrid.innerHTML = '';
  
  const isArchivedMode = state.personaFilter === 'archived';
  const filtered = state.personas.filter(p => isArchivedMode ? isArchivedPersona(p) : !isArchivedPersona(p));
  
  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = `persona-card ${state.selectedPersona?.id === p.id ? 'selected' : ''}`;
    card.innerHTML = `
      <img src="${p.image || 'assets/influencer_female.png'}" alt="${p.name || 'Influencer'}" onerror="this.src='assets/influencer_female.png'">
      <div class="persona-card-info">
        <div class="persona-card-name">${p.name || 'Sin nombre'}</div>
        <div class="persona-card-tag">${p.age || ''} • ${p.ethnicity || p.ethnicity_appearance || ''}</div>
      </div>
    `;
    card.addEventListener('click', () => selectPersona(p));
    selectGrid.appendChild(card);
  });
}

// ─── Unified toast / feedback (ROADMAP 1.4) ─────────────────────────────
// Every mutation should call showAppToast / toastSuccess / toastError.
// Success & error stay visible at least MIN_TOAST_MS (3s).
const MIN_TOAST_MS = 3000;
const DEFAULT_TOAST_MS = 4000;
let _toastHideTimer = null;
let _toastShownAt = 0;

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  loading: '<span class="toast-spinner" aria-hidden="true"></span>'
};

/**
 * Unified app feedback toast.
 * @param {string} message
 * @param {{ type?: 'success'|'error'|'info'|'loading', duration?: number|null, gitOk?: boolean }} [opts]
 *   duration: ms to auto-hide; null = stay until next toast (loading). success/error forced ≥ MIN_TOAST_MS.
 *   gitOk: optional sidebar git indicator update (true=ok, false=error, omit=no change except loading)
 */
function showAppToast(message, opts = {}) {
  const type = opts.type || 'info';
  const banner = syncBanner || document.getElementById('syncBanner');
  const textEl = syncBannerText || document.getElementById('syncBannerText');
  const iconEl = document.getElementById('syncBannerIcon');
  if (!banner || !textEl) {
    console.warn('[toast]', type, message);
    return;
  }

  if (_toastHideTimer) {
    clearTimeout(_toastHideTimer);
    _toastHideTimer = null;
  }

  textEl.textContent = message || '';
  if (iconEl) iconEl.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

  banner.className = `sync-banner app-toast show type-${type}` + (type === 'error' ? ' error' : '');
  _toastShownAt = Date.now();

  // Sidebar git chip
  if (type === 'loading') {
    if (gitIndicator) gitIndicator.className = 'git-indicator syncing';
    if (gitStatusText) gitStatusText.textContent = 'Trabajando...';
  } else if (opts.gitOk === true) {
    if (gitIndicator) gitIndicator.className = 'git-indicator';
    if (gitStatusText) gitStatusText.textContent = 'Repositorio sincronizado';
  } else if (opts.gitOk === false) {
    if (gitIndicator) gitIndicator.className = 'git-indicator';
    if (gitStatusText) gitStatusText.textContent = 'Error de sincronización';
  } else if (type === 'success' || type === 'error') {
    if (gitIndicator) gitIndicator.className = 'git-indicator';
    if (type === 'success' && gitStatusText) gitStatusText.textContent = 'Repositorio sincronizado';
  }

  // Auto-hide: loading stays; success/error at least MIN_TOAST_MS
  if (type === 'loading' || opts.duration === null) return;

  let ms = opts.duration != null ? opts.duration : DEFAULT_TOAST_MS;
  if (type === 'success' || type === 'error') {
    ms = Math.max(MIN_TOAST_MS, ms);
  }
  _toastHideTimer = setTimeout(() => {
    banner.classList.remove('show');
    _toastHideTimer = null;
  }, ms);
}

function toastSuccess(message, opts = {}) {
  showAppToast(message, { ...opts, type: 'success', gitOk: opts.gitOk !== false ? (opts.gitOk ?? true) : false });
}
function toastError(message, opts = {}) {
  showAppToast(message, { ...opts, type: 'error', gitOk: false });
}
function toastInfo(message, opts = {}) {
  showAppToast(message, { ...opts, type: 'info' });
}
function toastLoading(message) {
  showAppToast(message, { type: 'loading', duration: null });
}

/** @deprecated use toastSuccess / toastError — kept for call sites */
function showSyncToast(success, message) {
  if (success) toastSuccess(message, { gitOk: true });
  else toastError(message, { gitOk: false });
}

function setGitSyncingState(message) {
  if (gitIndicator) gitIndicator.className = 'git-indicator syncing';
  if (gitStatusText) gitStatusText.textContent = 'Respaldando en GitHub...';
  toastLoading(message || 'Respaldando en GitHub...');
}

async function manualGitSync() {
  setGitSyncingState('Sincronizando con GitHub...');
  try {
    const res = await authFetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      toastSuccess('¡Cambios respaldados en GitHub!');
    } else {
      toastError('Error al sincronizar con GitHub.');
    }
  } catch (err) {
    toastError('Fallo de conexión al sincronizar.');
  }
}

// ─── Shared Export Helper: assembles the richest JSON for the active persona ───
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
  if (keys.length > 40 && keys.every(k => /^\d+$/.test(k))) {
    try {
      const rejoined = keys.map(Number).sort((a, b) => a - b).map(k => v[String(k)]).join('');
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
  if (keys.length > 40 && keys.every(k => /^\d+$/.test(k))) return false;
  // Prefer structures with identity / facial / body
  return !!(obj.identity || obj.facial_features || obj.body || obj.hair || keys.length <= 30);
}

function getFullPersonaJSON() {
  let base = {};
  
  // 1. Start with the richest source (analysisResult or stored detailedJSON)
  // IMPORTANT: only treat as object if it's a real persona object (not a string / char-map)
  if (typeof analysisResult !== 'undefined' && analysisResult && isRealPersonaObject(analysisResult)) {
    base = JSON.parse(JSON.stringify(analysisResult));
  } else if (state.selectedPersona && state.selectedPersona.detailedJSON) {
    try {
      const stored = parseDetailedJSON(state.selectedPersona.detailedJSON);
      if (isRealPersonaObject(stored)) {
        base = JSON.parse(JSON.stringify(stored));
      }
    } catch (e) {}
  }
  
  // 2. Ensure nested structures exist (face + full body)
  if (!base.identity) base.identity = {};
  if (!base.facial_features) base.facial_features = {};
  if (!base.hair) base.hair = {};
  if (!base.aesthetic) base.aesthetic = {};
  if (!base.photography) base.photography = {};
  if (!base.body) base.body = {};
  if (!base.clothing) base.clothing = {};
  
  // 3. Overwrite with live form values
  const p = state.selectedPersona || {};
  const bodyType = document.getElementById('pBodyType')?.value || base.body.body_type || base.identity.body_type || p.body_type || 'Atlético y proporcionado';
  const height = document.getElementById('pHeight')?.value || base.body.height_appearance || 'Estatura media (~1.65 m)';
  const proportions = document.getElementById('pProportions')?.value || base.body.proportions || 'Hombros equilibrados, cintura definida, caderas suaves y proporcionales';
  const posture = document.getElementById('pPosture')?.value || base.body.posture || 'Erguida y relajada';
  const fitness = document.getElementById('pFitness')?.value || base.body.fitness_level || 'Tono natural ligero';
  const bodySkin = document.getElementById('pBodySkin')?.value || base.body.skin_continuity || 'Mismo tono de piel en rostro, cuello, hombros y brazos';
  
  base.identity.name = document.getElementById('pName')?.value || base.identity.name || p.name || 'Influencer';
  base.identity.gender = document.getElementById('pGender')?.value || base.identity.gender || p.gender || 'Female';
  base.identity.apparent_age = document.getElementById('pAge')?.value || base.identity.apparent_age || p.age || '25 años';
  base.identity.ethnicity_appearance = document.getElementById('pEthnicity')?.value || base.identity.ethnicity_appearance || p.ethnicity || 'Mixta';
  base.identity.body_type = bodyType;
  
  // Body block — first-class, not a single face-adjacent field
  base.body = {
    ...base.body,
    body_type: bodyType,
    height_appearance: height,
    proportions,
    posture,
    fitness_level: fitness,
    shoulders: base.body.shoulders || 'Hombros suaves y naturales',
    waist_hip_balance: base.body.waist_hip_balance || proportions,
    limbs: base.body.limbs || 'Brazos y piernas proporcionados al torso',
    hands: base.body.hands || 'Manos naturales',
    skin_continuity: bodySkin,
    visible_framing: base.body.visible_framing || 'Cuerpo visible en plano medio / medio cuerpo (no solo close-up de cara)'
  };
  
  // Advanced physical traits with canonical key alignment
  base.facial_features.face_shape = document.getElementById('pFaceShape')?.value || base.facial_features.face_shape || 'Ovalada';
  base.facial_features.skin_tone = document.getElementById('pSkinTone')?.value || base.facial_features.skin_tone || 'Piel clara';
  base.facial_features.skin_texture = document.getElementById('pSkinTexture')?.value || base.facial_features.skin_texture || 'Suave';
  base.facial_features.eye_color = document.getElementById('pEyeColor')?.value || base.facial_features.eye_color || 'Marrón';
  
  const eyebrowsVal = document.getElementById('pEyebrows')?.value || base.facial_features.eyebrow_style || base.facial_features.eyebrows || 'Cejas naturales';
  base.facial_features.eyebrow_style = eyebrowsVal;
  base.facial_features.eyebrows = eyebrowsVal;

  const lipsVal = document.getElementById('pLips')?.value || base.facial_features.lip_shape || base.facial_features.lips || 'Labios rosados';
  base.facial_features.lip_shape = lipsVal;
  base.facial_features.lips = lipsVal;

  base.facial_features.smile_type = document.getElementById('pSmileType')?.value || base.facial_features.smile_type || 'Natural';
  const marks = document.getElementById('pDistinctiveMarks')?.value;
  if (marks) base.facial_features.distinctive_marks = marks;
  
  base.hair.color = document.getElementById('pHairColor')?.value || base.hair.color || 'Castaño';
  base.hair.texture = document.getElementById('pHairTexture')?.value || base.hair.texture || 'Ondulado';
  base.hair.length = document.getElementById('pHairLength')?.value || base.hair.length || 'Largo';

  const hairStyleVal = document.getElementById('pHair')?.value || base.hair.style || base.hair.details || p.hair || '';
  base.hair.style = hairStyleVal;
  base.hair.details = hairStyleVal;
  
  base.aesthetic.overall_vibe = document.getElementById('pStyle')?.value || base.aesthetic.overall_vibe || p.style || 'Natural';

  const fashionVal = document.getElementById('pClothing')?.value || base.aesthetic.fashion_style || base.aesthetic.clothing_type || p.clothing || '';
  base.aesthetic.fashion_style = fashionVal;
  base.aesthetic.clothing_type = fashionVal;
  if (!base.clothing.type) base.clothing.type = fashionVal;
  
  base.photography.camera_lens = document.getElementById('pCamera')?.value || base.photography.camera_lens || p.camera || 'iPhone';
  base.photography.lighting_type = document.getElementById('pLighting')?.value || base.photography.lighting_type || p.lighting || 'Luz natural';
  base.photography.background_setting = document.getElementById('pSetting')?.value || base.photography.background_setting || p.setting || 'Fondo neutro';
  // Prefer framing that shows body, not only face
  if (!base.photography.framing || /close|cara|face only|extreme close/i.test(base.photography.framing)) {
    base.photography.framing = base.photography.framing || 'Plano medio / medio cuerpo (hombros, torso y postura visibles)';
  }
  if (!base.photography.composition) {
    base.photography.composition = 'Sujeto a medio cuerpo, identidad facial + silueta corporal consistentes';
  }

  // Merge extended secondary traits if present
  if (state.scratchExtendedTraits) {
    if (state.scratchExtendedTraits.eye_shape) base.facial_features.eye_shape = state.scratchExtendedTraits.eye_shape;
    if (state.scratchExtendedTraits.jawline) base.facial_features.jawline = state.scratchExtendedTraits.jawline;
    if (state.scratchExtendedTraits.makeup_level) base.aesthetic.makeup_level = state.scratchExtendedTraits.makeup_level;
    if (state.scratchExtendedTraits.color_grade) base.photography.color_grade = state.scratchExtendedTraits.color_grade;
    if (state.scratchExtendedTraits.depth_of_field) base.photography.depth_of_field = state.scratchExtendedTraits.depth_of_field;
    if (state.scratchExtendedTraits.body_type) {
      base.body.body_type = state.scratchExtendedTraits.body_type;
      base.identity.body_type = state.scratchExtendedTraits.body_type;
    }
    if (state.scratchExtendedTraits.proportions) base.body.proportions = state.scratchExtendedTraits.proportions;
    if (state.scratchExtendedTraits.height_appearance) base.body.height_appearance = state.scratchExtendedTraits.height_appearance;
  }
  
  // Character lock card — for free chatbots (ChatGPT/Gemini/Claude/Meta) without paid face-lock APIs
  const skinTone = base.facial_features.skin_tone || '';
  const skinHex = base.facial_features.skin_tone_hex || '';
  base.character_lock = {
    version: 1,
    free_tier: true,
    purpose: 'Mantener la misma persona en chatbots gratuitos y en Pollinations sin APIs de face-lock de pago',
    must_match_every_image: {
      name: base.identity.name,
      gender: base.identity.gender,
      age: base.identity.apparent_age,
      ethnicity: base.identity.ethnicity_appearance,
      face_shape: base.facial_features.face_shape,
      eye_color: base.facial_features.eye_color,
      eye_shape: base.facial_features.eye_shape || null,
      eyebrows: base.facial_features.eyebrow_style || base.facial_features.eyebrows,
      nose: base.facial_features.nose_shape || null,
      lips: base.facial_features.lip_shape || base.facial_features.lips,
      jawline: base.facial_features.jawline || null,
      skin_tone: skinTone,
      skin_tone_hex: skinHex,
      hair_color: base.hair.color,
      hair_color_hex: base.hair.color_hex || null,
      hair_texture: base.hair.texture,
      hair_length: base.hair.length,
      body_type: base.body?.body_type || base.identity.body_type,
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

  // Clean internal metadata keys (keep character_lock)
  delete base.generation_prompt;
  delete base.anchor_reference;
  
  return base;
}

function buildChatbotExportText({ includePrompt = true, includeScript = false, includeProduct = false, scriptData = null, productData = null } = {}) {
  const personaJSON = getFullPersonaJSON();
  const lock = personaJSON.character_lock || {};
  const must = lock.must_match_every_image || {};
  const formattedJson = JSON.stringify(personaJSON, null, 2);
  const lockCard = JSON.stringify(lock, null, 2);
  
  let sections = [];
  
  // Section 0: Free-tier character integrity (optimized for ChatGPT / Gemini / Claude / Meta free)
  sections.push(`Eres un generador de contenido UGC para un influencer virtual de un pequeño emprendedor (flujo CERO COSTO: sin APIs de face-lock de pago).

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

  // Section 1: Full visual identity JSON
  sections.push(`
═══════════════════════════════════════════
  IDENTIDAD VISUAL COMPLETA (JSON)
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

  // Final instructions — free chatbot oriented
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

/** F5 — Free chatbot prompt packs (reuse character_lock, zero cost) */
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
 * Build a ready-to-paste free chatbot pack (F5).
 * @param {'fullbody'|'bikini'|'spicy'|'product'} packId
 * @param {{ productData?: object, extraScene?: string }} [opts]
 */
function buildFreeChatbotPack(packId, opts = {}) {
  const pack = FREE_CHATBOT_PACKS[packId];
  if (!pack) throw new Error('Pack desconocido: ' + packId);

  const personaJSON = getFullPersonaJSON();
  const lock = personaJSON.character_lock || {};
  const must = lock.must_match_every_image || {};
  const name = must.name || personaJSON.identity?.name || state.selectedPersona?.name || 'Influencer';

  let productBlock = '';
  const prod = opts.productData || state.selectedProduct;
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
${JSON.stringify(personaJSON, null, 2)}

───────────────────────────────────────────
AL FINAL
───────────────────────────────────────────
1) Genera la imagen respetando el CHARACTER LOCK.
2) Si la cara o la tez cambian, re-aplica el lock y regenera.
3) Responde en español con una línea: "OK — pack ${pack.id} para ${name}".
`;
}

async function copyFreeChatbotPack(packId) {
  try {
    if (!state.selectedPersona && !document.getElementById('pName')?.value) {
      toastInfo('Selecciona o crea un influencer antes de copiar un pack.');
      return;
    }
    const text = buildFreeChatbotPack(packId);
    await navigator.clipboard.writeText(text);
    const pack = FREE_CHATBOT_PACKS[packId];
    toastSuccess(`Pack gratis «${pack.label}» copiado — pégalo en ChatGPT/Gemini/Claude`);
  } catch (err) {
    console.error(err);
    toastError('No se pudo copiar el pack: ' + (err.message || 'error'));
  }
}

function setupFreeChatbotPacks() {
  document.querySelectorAll('[data-free-pack]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-free-pack');
      copyFreeChatbotPack(id);
    });
  });
  window.copyFreeChatbotPack = copyFreeChatbotPack;
  window.buildFreeChatbotPack = buildFreeChatbotPack;
  window.FREE_CHATBOT_PACKS = FREE_CHATBOT_PACKS;
}

const CLOTHING_OPTIONS_BY_GENDER = {
  Female: [
    "Catsuit de látex: Catsuit ajustado de látex negro de alto brillo de cuerpo entero (shiny black latex catsuit)",
    "Catsuit de látex: Catsuit de látex rojo pasión entallado de alto brillo (shiny passion red latex catsuit)",
    "Catsuit de látex: Catsuit de látex morado neón estilo futurista (shiny neon purple latex catsuit)",
    "Ropa deportiva: Calzas y top deportivo de licra negro entallado",
    "Ropa de trabajo: Traje sastre gris con blazer entallado y blusa blanca",
    "Sport elegante: Camisa de lino blanca holgada con vaqueros claros",
    "Salida de noche: Vestido ajustado negro de satén con tirantes finos",
    "Alta costura: Vestido de gala brillante de noche con hendidura alta",
    "Lencería sexy: Conjunto de lencería de encaje rojo con transparencias",
    "Traje de baño: Bikini de dos piezas clásico (classic two-piece bikini)",
    "Traje de baño: Trikini / cut-out de una pieza (one-piece trikini with side cut-outs)",
    "Traje de baño: Traje de baño completo / entero (modest full one-piece swimsuit)",
    "Casual cotidiano: Suéter de punto suave en tono crema cuello redondo",
    "Estilo playero: Vestido veraniego suelto de lino color beige",
    "Cozy / Casa: Sudadera con capucha minimalista gris melange oversized",
    "Cóctel / Fiesta: Mono largo de satén verde esmeralda con cinturón",
    "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta básica blanca",
    "Cyberpunk / Futuristic: Bodysuit de neopreno con apliques metálicos y luces neón",
    "Boho Chic: Blusa de encaje blanco con falda larga bohemia de verano"
  ],
  Male: [
    "Traje táctico / Latex Biker: Mono de cuero y vinilo negro entallado estructurado (black vinyl leather biker suit)",
    "Ropa deportiva: Sudadera con capucha de secado rápido y joggers negros",
    "Ropa de trabajo: Traje clásico azul marino con camisa blanca y corbata",
    "Sport elegante: Camisa de lino blanca y pantalones chinos beige",
    "Salida de noche: Camisa de seda negra desabrochada y pantalones oscuros",
    "Lencería sexy: Bóxers ajustados premium de diseñador color negro",
    "Fitness / Atleta: Sin camiseta, torso trabajado con pantalones deportivos negros",
    "Traje de baño: Short de baño / bañador clásico (classic swim trunks)",
    "Traje de baño: Slip de natación deportivo (athletic swim brief)",
    "Casual cotidiano: Jersey de punto fino gris con cuello redondo",
    "Estilo playero: Camisa guayabera blanca y bermudas de lino beige",
    "Cozy / Casa: Sudadera con capucha minimalista azul marino oversized",
    "Saco casual: Blazer beige sobre camiseta básica blanca",
    "Estilo urbano / Streetwear: Chaqueta de cuero negra sobre camiseta negra con vaqueros",
    "Techwear / Cyberpunk: Chaqueta impermeable oscura con arneses y straps estilo futurista"
  ]
};

/** Common locations for persona form (includes beach). */
const SETTING_OPTIONS = [
  "Sala de estar moderna y neutral",
  "Playa de arena blanca al mediodía, mar azul al fondo (bright tropical beach midday)",
  "Playa al atardecer dorado con olas suaves (golden hour beach sunset)",
  "Piscina exterior soleada con agua turquesa (sunny outdoor pool)",
  "Terraza costera con vista al mar (coastal terrace ocean view)",
  "Cafetería moderna iluminada de día",
  "Parque natural soleado con follaje verde",
  "Calle urbana de día con bokeh suave",
  "Habitación de hotel luminosa y minimalista",
  "Gimnasio moderno con luz natural",
  "Cocina moderna con luz de ventana"
];

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

function updateSettingDropdown(selectedVal = null) {
  const select = document.getElementById('pSetting');
  if (!select || select.tagName !== 'SELECT') return;

  const previous = selectedVal || select.value;
  select.innerHTML = '';
  SETTING_OPTIONS.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
  if (previous && !SETTING_OPTIONS.includes(previous)) {
    const customOpt = document.createElement('option');
    customOpt.value = previous;
    customOpt.textContent = `Personalizado: ${previous}`;
    customOpt.selected = true;
    select.appendChild(customOpt);
  } else if (previous) {
    select.value = previous;
  }
}

/**
 * Stable numeric seed from persona id — same face base across traditional/spicy.
 */
function personaSeed(personaId) {
  const s = String(personaId || 'default');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000000;
}

/**
 * Shared face/body identity block used by BOTH traditional and spicy variants.
 * Outfit/pose/scene change; face DNA stays identical.
 */
function buildIdentityLockBlock(persona, detailed, skin) {
  const f = detailed.facial_features || {};
  const h = detailed.hair || {};
  const b = detailed.body || {};
  const genderWord = persona.gender === 'Male' ? 'male' : 'female';
  const age = detailed.identity?.apparent_age || persona.age || '25 años';
  let ethnicity = detailed.identity?.ethnicity_appearance || persona.ethnicity || 'Latina';
  if (skin.isLight && /latina/i.test(ethnicity) && !/clara|fair|light/i.test(ethnicity)) {
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
    f.distinctive_marks && f.distinctive_marks !== 'Ninguno' && `marks: ${f.distinctive_marks}`
  ].filter(Boolean).join(', ');

  const hairBits = [
    h.color || '',
    h.texture || '',
    h.length || '',
    h.style || ''
  ].filter(Boolean).join(' ');
  const hairHex = h.color_hex ? ` hair hex ${h.color_hex}` : '';

  const bodyBits = [
    b.body_type || detailed.identity?.body_type,
    b.height_appearance,
    b.proportions,
    b.posture,
    b.fitness_level
  ].filter(Boolean).join(', ');

  const skinClause = [
    `${skin.tone} skin`,
    skin.hex && `exact skin hex ${skin.hex}`,
    skin.lock,
    skin.avoid && `avoid: ${skin.avoid}`,
    skin.isLight && 'NOT dark, NOT deep tan, NOT morena'
  ].filter(Boolean).join(', ');

  return {
    age,
    ethnicity,
    genderWord,
    faceBits,
    hairBits,
    hairHex,
    bodyBits,
    skinClause,
    name: persona.name || detailed.identity?.name || 'Influencer'
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

  // Weak/legacy labels → prefer stored clara if available
  if (!tone || /^tono natural$/i.test(tone.trim()) || /^natural$/i.test(tone.trim())) {
    if (storedF.skin_tone && !/^tono natural$/i.test(storedF.skin_tone)) {
      tone = storedF.skin_tone;
    }
    if (storedF.skin_tone_hex) hex = storedF.skin_tone_hex;
  }

  // Classify from hex if we have it
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

  const isLight = band === 'very_light' || band === 'light' || band === 'light_warm'
    || /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory|pálid/i.test(tone);

  if (isLight && (!tone || /^tono natural$/i.test(tone))) {
    tone = 'Piel clara / beige claro';
  }
  if (isLight && !hex) hex = '#f0d5c0';
  if (isLight && !lock) lock = 'fair light beige complexion, pale warm ivory';
  if (isLight && !avoid) avoid = 'dark skin, deep tan, morena, brown skin, ebony, bronzed filter';

  return { tone, hex, lock, avoid, isLight, band };
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

  // Init clothing + setting lists (includes beach / swimwear)
  updateClothingDropdown();
  updateSettingDropdown();
  
  document.getElementById('btnSavePersona').addEventListener('click', savePersona);
  document.getElementById('btnDeletePersona').addEventListener('click', deletePersonaAction);

  const btnGenTraits = document.getElementById('btnGenerateTraits');
  if (btnGenTraits) {
    btnGenTraits.addEventListener('click', async () => {
      const name = document.getElementById('pName')?.value || 'Influencer';
      const gender = document.getElementById('pGender')?.value || 'Female';
      const age = document.getElementById('pAge')?.value || '25 años';
      const ethnicity = document.getElementById('pEthnicity')?.value || 'Latina';
      const style = document.getElementById('pStyle')?.value || 'Natural';

      btnGenTraits.disabled = true;
      btnGenTraits.textContent = '⏳ Generando...';

      try {
        const res = await authFetch('/api/ai/expand-persona-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, gender, age, ethnicity, style })
        });
        const data = await res.json();
        if (data.success && data.details) {
          applyGeneratedTraitsToForm(data.details);
        } else {
          toastError('No se pudieron generar rasgos únicos: ' + (data.message || 'Error desconocido'));
        }
      } catch (err) {
        console.error('Error in expand-persona-details:', err);
        toastError('Error al generar rasgos únicos: ' + err.message);
      } finally {
        btnGenTraits.disabled = false;
        btnGenTraits.textContent = '🎲 Generar Rasgos Únicos';
      }
    });
  }

  const cardScratch = document.getElementById('cardCreateScratch');
  if (cardScratch) cardScratch.addEventListener('click', resetPersonaFormForNew);

  const cardInspiration = document.getElementById('cardCreateInspiration');
  if (cardInspiration) {
    cardInspiration.addEventListener('click', () => {
      const btnOpen = document.getElementById('btnOpenImportModal');
      if (btnOpen) btnOpen.click();
    });
  }

  // Profile Sheet toggle buttons
  const btnSheetDelete = document.getElementById('btnSheetDelete');
  if (btnSheetDelete) {
    btnSheetDelete.addEventListener('click', () => {
      const btnDelete = document.getElementById('btnDeletePersona');
      if (btnDelete) btnDelete.click();
    });
  }

  const btnCancelEditPersona = document.getElementById('btnCancelEditPersona');
  if (btnCancelEditPersona) {
    btnCancelEditPersona.addEventListener('click', () => {
      const profileSheet = document.getElementById('personaProfileSheet');
      const personaForm = document.getElementById('personaForm');
      if (profileSheet && personaForm) {
        personaForm.style.display = 'none';
        profileSheet.style.display = 'block';
      }
      
      const editorTitle = document.getElementById('editorHeaderTitle');
      if (editorTitle) editorTitle.textContent = "Ficha de Influencer";
    });
  }

  const btnSheetPose = document.getElementById('btnSheetPose');
  if (btnSheetPose) {
    btnSheetPose.addEventListener('click', () => {
      const sceneInput = document.getElementById('sceneDescriptionInput');
      if (sceneInput) {
        sceneInput.focus();
        sceneInput.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  const btnSheetUgc = document.getElementById('btnSheetUgc');
  if (btnSheetUgc) {
    btnSheetUgc.addEventListener('click', () => {
      navigateToTab('ugc-studio');
    });
  }

  const btnSheetArchive = document.getElementById('btnSheetArchive');
  if (btnSheetArchive) {
    btnSheetArchive.addEventListener('click', () => {
      const btnArchive = document.getElementById('btnArchivePersona');
      if (btnArchive) btnArchive.click();
    });
  }

  const btnCopySheetPrompt = document.getElementById('btnCopySheetPrompt');
  if (btnCopySheetPrompt) {
    btnCopySheetPrompt.addEventListener('click', () => {
      const sheetPromptPreview = document.getElementById('sheetPromptPreview');
      if (sheetPromptPreview) {
        navigator.clipboard.writeText(sheetPromptPreview.textContent);
        toastSuccess('📋 Prompt copiado al portapapeles');
      }
    });
  }
  
  document.getElementById('btnCopyJSON').addEventListener('click', () => {
    const jsonArea = document.getElementById('jsonEditor');
    jsonArea.select();
    navigator.clipboard.writeText(jsonArea.value);
    toastSuccess('Estructura JSON copiada al portapapeles');
  });
  
  document.getElementById('btnCopyChatbotPrompt').addEventListener('click', () => {
    const exportText = buildChatbotExportText({ includePrompt: true });
    navigator.clipboard.writeText(exportText);
    toastSuccess('📋 Prompt + JSON copiados para tu chatbot');
  });

  setupFreeChatbotPacks();

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
        toastSuccess('⭐ Prompt y miniatura guardados en la Galería');
        if (state.activeTab === 'gallery') renderGallery();
      }
    } catch (err) {
      toastError('Error al guardar en la galería.');
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
  const bodyType = document.getElementById('pBodyType')?.value || 'Atlético y proporcionado';
  const height = document.getElementById('pHeight')?.value || 'Estatura media';
  const proportions = document.getElementById('pProportions')?.value || '';
  const posture = document.getElementById('pPosture')?.value || '';
  const fitness = document.getElementById('pFitness')?.value || '';
  const bodySkin = document.getElementById('pBodySkin')?.value || '';
  
  // Get hex codes from detailedJSON for color precision
  let skinHex = '', hairHex = '', skinLock = '', skinAvoid = '';
  try {
    const parsed = parseDetailedJSON(state.selectedPersona?.detailedJSON);
    skinHex = parsed.facial_features?.skin_tone_hex || '';
    hairHex = parsed.hair?.color_hex || '';
    skinLock = parsed.facial_features?.skin_lock || '';
    skinAvoid = parsed.facial_features?.skin_avoid || '';
  } catch(e) {}

  // Strong skin lock — "Latina" alone makes generators darken skin; lock lightness + hex
  const isLightSkin = /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory|pálid/i.test(skinTone)
    || (skinHex && (() => {
      const m = skinHex.replace('#', '');
      if (m.length !== 6) return false;
      const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
      return (r + g + b) / 3 >= 155;
    })());
  const ethnicitySafe = isLightSkin && /latina/i.test(ethnicity) && !/clara|fair|light/i.test(ethnicity)
    ? `${ethnicity} de tez clara`
    : ethnicity;
  const skinClause = [
    `${skinTone} skin`,
    skinHex && `exact skin hex ${skinHex}`,
    skinLock || (isLightSkin ? 'fair light complexion' : ''),
    isLightSkin ? 'NOT dark skin, NOT deep tan, NOT morena, NOT bronzed filter' : '',
    skinAvoid && `avoid: ${skinAvoid}`
  ].filter(Boolean).join(', ');
  const hexHint = hairHex ? ` Exact hair color ${hairHex}.` : '';

  // Prompt: face + FULL BODY (silueta, postura, proporciones) — not face-only
  const bodyClause = [
    bodyType && `${bodyType} body build`,
    height && height,
    proportions && `body proportions: ${proportions}`,
    posture && `posture: ${posture}`,
    fitness && fitness,
    bodySkin && bodySkin
  ].filter(Boolean).join(', ');

  const prompt = `Amateur casual UGC style, ${camera}, medium shot showing face AND upper body. A ${age} ${ethnicitySafe} ${gender.toLowerCase()} influencer with ${hairColor} ${hairTexture} ${hairLength} hair, ${skinClause}, ${eyeColor} eyes, ${eyebrows}, ${lips}, ${faceShape} face, ${smileType}. Full-body identity: ${bodyClause}.${hexHint} Wearing ${clothing} that fits the body type naturally. Background is a ${setting}. ${lighting}, raw photo format, unedited, shot on smartphone camera, natural skin texture on face neck and arms, realistic imperfections. Same person in all shots, consistent facial AND body identity AND skin lightness, visible shoulders torso posture and silhouette. SKIN LOCK (critical): keep the same light/dark level as ${skinTone}${skinHex ? ' ' + skinHex : ''}.`;
  document.getElementById('promptPreview').textContent = prompt;
  
  // JSON: prefer full getFullPersonaJSON (includes body block); fallback compact
  let jsonConfig;
  try {
    jsonConfig = getFullPersonaJSON();
  } catch (e) {
    jsonConfig = {
      identity: {
        name, gender, age, ethnicity_appearance: ethnicity, body_type: bodyType
      },
      body: {
        body_type: bodyType,
        height_appearance: height,
        proportions,
        posture,
        fitness_level: fitness,
        skin_continuity: bodySkin,
        visible_framing: 'Plano medio con cuerpo visible'
      },
      facial_features: {
        face_shape: faceShape,
        skin_tone: skinTone,
        skin_texture: skinTexture,
        eye_color: eyeColor,
        eyebrows,
        lips,
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
        background_setting: setting,
        framing: 'Plano medio / medio cuerpo'
      }
    };
  }
  
  document.getElementById('jsonEditor').value = JSON.stringify(jsonConfig, null, 2);
  
  // Keep split A/B prompts up to date
  updateABPrompts();
}

async function savePersona() {
  const name = (document.getElementById('pName').value || '').trim();
  if (!name) {
    showSyncToast(false, 'Indica un nombre para el influencer antes de guardar.');
    return;
  }

  const gender = document.getElementById('pGender').value;
  const age = document.getElementById('pAge').value;
  const ethnicity = document.getElementById('pEthnicity').value;
  const style = document.getElementById('pStyle').value;
  const hair = document.getElementById('pHair').value;
  const lighting = document.getElementById('pLighting').value;
  const camera = document.getElementById('pCamera').value;
  const clothing = document.getElementById('pClothing').value;
  const setting = document.getElementById('pSetting').value;

  // Create mode is sticky until selectPersona / successful create selects the new one
  const creatingNew = state.isCreatingNewPersona === true || !state.selectedPersona?.id;
  
  const promptText = document.getElementById('promptPreview').textContent;
  const influencerName = name || 'Influencer';
  toastLoading(creatingNew
    ? `Creando influencer nuevo: ${influencerName}...`
    : `Generando retrato virtual consistente con ${influencerName}...`);
  
  let portraitPath = null;
  try {
    const imgRes = await authFetch('/api/ai/generate-image', {
      method: 'POST',
      body: JSON.stringify({ 
        prompt: promptText, 
        // Never borrow another persona's face when creating new
        referenceLocalPath: uploadedImagePath || (creatingNew ? null : state.selectedPersona?.image),
        personaId: creatingNew ? 'new_persona' : (state.selectedPersona?.id || 'new_persona'),
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

  const finalImage = portraitPath
    || uploadedImagePath
    || (creatingNew ? null : state.selectedPersona?.image)
    || (gender === 'Male' ? 'assets/influencer_male.png' : 'assets/nano_banana_influencer.png');
  const finalImageUGC = portraitPath
    || uploadedImagePath
    || (creatingNew ? null : state.selectedPersona?.imageUGC)
    || (gender === 'Male' ? 'assets/influencer_male_bottle.png' : 'assets/nano_banana_ugc.png');

  const personaData = {
    name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting,
    image: finalImage,
    imageUGC: finalImageUGC,
    detailedJSON: getFullPersonaJSON()
  };

  // Critical: only attach id when UPDATING an existing selection (not create mode)
  if (creatingNew) {
    personaData.forceCreate = true;
    // Explicitly omit id so server always INSERTs
  } else if (state.selectedPersona?.id) {
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
      state.personas = Array.isArray(data.personas) ? data.personas : state.personas;
      uploadedImagePath = null;
      state.isCreatingNewPersona = false;

      const createBanner = document.getElementById('createModeBanner');
      if (createBanner) createBanner.style.display = 'none';

      // Prefer server-returned persona (id), then exact id match
      const saved = data.persona
        || (data.persona?.id && state.personas.find(p => p.id === data.persona.id))
        || state.personas.find(p => p.name && p.name.toLowerCase() === name.toLowerCase());

      refreshPersonaLists();
      if (saved) {
        try {
          selectPersona(saved);
        } catch (e) {
          console.warn('selectPersona after save failed:', e);
          refreshPersonaLists();
        }
      }

      try {
        const dataRes = await authFetch('/api/data');
        const dataJson = await dataRes.json();
        state.personas = Array.isArray(dataJson.personas) ? dataJson.personas : state.personas;
        state.generationStats = dataJson.generationStats || { total: 0 };
        refreshPersonaLists();
        if (saved?.id) {
          const again = state.personas.find(p => p.id === saved.id);
          if (again) {
            state.selectedPersona = again;
            state.isCreatingNewPersona = false;
          }
        }
      } catch (e) {
        console.warn('Post-save /api/data refresh failed:', e);
      }
      
      if (data.gitSynced) {
        showSyncToast(true, creatingNew
          ? `¡Influencer "${name}" creado como ficha nueva!`
          : '¡Persona guardada y respaldada en GitHub con su retrato virtual!');
      } else {
        showSyncToast(false, creatingNew
          ? `Influencer "${name}" creado localmente. Error en Git.`
          : 'Guardado localmente. Error en Git.');
      }
    } else {
      showSyncToast(false, data.message || 'No se pudo guardar la persona.');
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
      toastSuccess('¡Versión restaurada con éxito!');
    } else {
      toastError('No se pudo restaurar la versión.');
    }
  } catch (err) {
    toastError('Error al restaurar la versión.');
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
        toastSuccess('Campaña creada y guardada');
      } else {
        toastError('No se pudo crear la campaña.');
      }
    } catch (err) {
      toastError('Error de red al guardar campaña.');
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
        toastSuccess('Campaña eliminada correctamente.');
      } else {
        toastError('No se pudo eliminar la campaña.');
      }
    } catch (err) {
      toastError('Error al borrar la campaña.');
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
    toastSuccess('Guión publicitario copiado al portapapeles');
  });
  
  // Full chatbot export (script + persona JSON + product + prompt)
  document.getElementById('btnExportScriptChatbot').addEventListener('click', () => {
    if (state.scripts.length === 0) {
      toastInfo('Primero genera los scripts de campaña.');
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
    toastSuccess('📋 Guión + JSON + producto copiados para tu chatbot');
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
    toastSuccess('📋 Pack completo copiado para tu chatbot');
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
      toastSuccess('🎥 Renderizado UGC finalizado. Timeline listo para entrega.');
    }
  }, 150);
}

function populateActiveUgcData() {
  const creator = state.selectedPersona || { name: "Sofia", image: "assets/influencer_female.png", imageUGC: "assets/influencer_female_serum.png", handle: "@sofia_ai_ugc" };
  const prod = state.selectedProduct || { name: "Glow Serum Organics" };
  const setSrc = (id, src) => { const el = document.getElementById(id); if (el) el.src = src; };
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  
  setSrc('ugcActiveAvatar', creator.image || 'assets/influencer_female.png');
  setText('ugcActiveName', creator.name || 'Influencer');
  setText('ugcActiveMeta', `${creator.age || ''} • ${creator.ethnicity || creator.ethnicity_appearance || ''}`);
  
  const prodImg = creator.gender === 'Male' ? 'assets/product_bottle.png' : 'assets/product_serum.png';
  setSrc('ugcActiveProductImg', prodImg);
  setText('ugcActiveProduct', prod.name);
  setText('cdProduct', prod.name);
  setText('ugcActiveProductMeta', prod.benefit || "Piel brillante en 5 minutos");
  
  // Mockup elements
  setSrc('mockupImage', creator.imageUGC || "assets/influencer_female_serum.png");
  setSrc('mockupAvatar', creator.image || 'assets/influencer_female.png');
  setText('mockupHandle', creator.handle || `@${(creator.name || 'influencer').toLowerCase()}_ai_ugc`);
  
  try { updateActiveScriptView(); } catch (e) { console.warn(e); }
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
  toastSuccess('Propuesta formateada copiada al portapapeles');
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
  
  toastSuccess('Prompt cargado en el Persona Engine');
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
        toastInfo('Por favor introduce un link de imagen.');
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
          toastInfo('Por favor introduce un link de imagen.');
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
    toastSuccess('JSON detallado copiado al portapapeles');
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
    toastInfo('Selecciona un archivo de imagen válido.');
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
  const b = data.body || {};

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
  ].filter(Boolean).join(', ');

  const isLight = /clara|porcelana|fair|beige claro|arena clara|porcelain|light|ivory/i.test(skinTone);
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
  ].filter(Boolean).join(', ');

  return `Amateur casual UGC style photo, ${p.camera_lens || 'iPhone front camera'}, medium shot with face AND upper body visible. A ${i.apparent_age || '25'} ${ethnicity} ${i.gender || 'female'} influencer with ${h.color || ''} ${h.texture || ''} hair, ${skinClause}, ${f.eye_color || ''} eyes, ${f.eyebrow_style || ''}, ${f.lip_shape || ''}, ${f.face_shape || ''} face. ` +
    `Full-body identity: ${bodyBits || 'proportioned natural body silhouette'}. ` +
    `${hairHex} ` +
    `Wearing ${c.type || ''} in ${c.color || ''} that fits the body naturally. ` +
    `Background: ${p.background_setting || 'casual indoor room'}. ` +
    `${p.lighting_type || 'daylight from window'}, ${p.color_grade || 'natural unedited colors'}, ` +
    `raw mobile snapshot quality, natural skin texture on face neck and arms, no filters, unedited mobile photo. Same person in all shots, consistent facial AND body identity AND skin lightness, visible shoulders torso and posture. SKIN LOCK (critical): keep ${skinTone}${skinHexVal ? ' ' + skinHexVal : ''}.`;
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
  const b = analysisResult.body || {};
  document.getElementById('pBodyType').value = b.body_type || i.body_type || 'Atlético y proporcionado';
  const setIf = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  setIf('pHeight', b.height_appearance || 'Estatura media (~1.65 m)');
  setIf('pProportions', b.proportions || 'Hombros equilibrados, cintura definida, caderas suaves');
  setIf('pPosture', b.posture || 'Erguida y relajada');
  setIf('pFitness', b.fitness_level || 'Tono natural ligero');
  setIf('pBodySkin', b.skin_continuity || 'Mismo tono de piel en rostro, cuello y brazos');

  compilePromptAndJSON();
  toastSuccess('Datos del análisis aplicados al formulario (incluye cuerpo)');
}

async function saveAnalysisAsPersona() {
  if (!analysisResult) return;

  const name = (analysisResult && analysisResult.identity && analysisResult.identity.name) || 'Influencer';
  toastLoading(`Generando retrato virtual consistente con ${name}...`);
  
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
      state.personas = Array.isArray(data.personas) ? data.personas : state.personas;
      uploadedImagePath = null; // Clear upload path after successful save
      const saved = data.persona
        || state.personas.find(p => p.name && p.name.toLowerCase() === personaData.name.toLowerCase());
      refreshPersonaLists();
      if (saved) {
        try { selectPersona(saved); } catch (e) { console.warn(e); refreshPersonaLists(); }
      }

      try { populateActiveUgcData(); } catch (e) { console.warn(e); }
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
    toastInfo('Primero selecciona un influencer guardado para eliminarlo.');
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

// ─── Influencer Variants (Poses, Wardrobe, Attitude) Manager & Spicy Mode ───

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

window.setVariantMode = function(mode) {
  state.variantMode = mode;

  const btnTrad = document.getElementById('btnModeTraditional');
  const btnSpicy = document.getElementById('btnModeSpicy');

  if (btnTrad) btnTrad.classList.toggle('active', mode === 'traditional');
  if (btnSpicy) btnSpicy.classList.toggle('active', mode === 'spicy');

  populateVariantDropdowns();
};

function populateVariantDropdowns() {
  const mode = state.variantMode || 'traditional';
  const preset = VARIANT_PRESETS[mode] || VARIANT_PRESETS.traditional;
  const p = state.selectedPersona;
  const gender = p ? p.gender : (document.getElementById('pGender')?.value || 'Female');

  // 1. Poses
  const poseSelect = document.getElementById('vPose');
  if (poseSelect) {
    poseSelect.innerHTML = '';
    preset.poses.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      poseSelect.appendChild(opt);
    });
  }

  // 2. Attitudes
  const attSelect = document.getElementById('vAttitude');
  if (attSelect) {
    attSelect.innerHTML = '';
    preset.attitudes.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      attSelect.appendChild(opt);
    });
  }

  // 3. Clothing
  const clothSelect = document.getElementById('vClothing');
  if (clothSelect) {
    clothSelect.innerHTML = '';
    const clothList = preset.clothing[gender] || preset.clothing.Female;
    clothList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      clothSelect.appendChild(opt);
    });
  }

  // 4. Settings
  const setSelect = document.getElementById('vSetting');
  if (setSelect) {
    setSelect.innerHTML = '';
    preset.settings.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      setSelect.appendChild(opt);
    });
  }
}

function updateVariantClothingDropdown(gender) {
  populateVariantDropdowns();
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
    card.style = 'position: relative; border-radius: var(--border-radius-md); overflow: hidden; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer;';
    card.innerHTML = `
      <img src="${v.image_path}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" title="Haz clic para ver la imagen en tamaño grande">
      <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; opacity: 0; transition: opacity 0.2s ease;" class="variant-zoom-icon">🔍</div>
      <div style="padding: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); position: absolute; bottom: 0; left: 0; right: 0; transform: translateY(100%); transition: transform 0.2s ease;" class="variant-hover-actions">
        <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${(v.pose || '').split('(')[0]}
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-sm btn-primary" style="flex: 1; font-size: 9px; padding: 4px 6px;" onclick="event.stopPropagation(); setMainVariantAction('${v.image_path}')">⭐ Perfil</button>
          <button type="button" class="btn btn-sm btn-secondary" style="flex: 1; font-size: 9px; padding: 4px 6px; background: rgba(220,53,69,0.3); color:#ff6b6b;" onclick="event.stopPropagation(); deleteVariantAction('${v.id}')">🗑️ Borrar</button>
        </div>
      </div>
    `;
    
    // Setup mouse hover styles in JS
    card.addEventListener('mouseenter', () => {
      card.querySelector('.variant-hover-actions').style.transform = 'translateY(0)';
      card.querySelector('.variant-zoom-icon').style.opacity = '1';
      card.style.transform = 'scale(1.02)';
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    });
    card.addEventListener('mouseleave', () => {
      card.querySelector('.variant-hover-actions').style.transform = 'translateY(100%)';
      card.querySelector('.variant-zoom-icon').style.opacity = '0';
      card.style.transform = 'none';
      card.style.boxShadow = 'none';
    });

    // Click to view enlarged image in history modal
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      
      const promptDetails = `Pose: ${v.pose || 'N/A'}\nVestuario: ${v.clothing || 'N/A'}\nActitud: ${v.attitude || 'N/A'}\nEntorno: ${v.setting || 'N/A'}`;
      
      openHistoryModal({
        id: v.id,
        image_path: v.image_path,
        generation_type: 'variant',
        created_at: v.created_at || new Date().toISOString(),
        prompt: promptDetails
      });
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
    toastInfo('Selecciona un influencer primero.');
    return;
  }
  
  const pose = document.getElementById('vPose').value;
  const attitude = document.getElementById('vAttitude').value;
  const clothing = document.getElementById('vClothing').value;
  const setting = document.getElementById('vSetting').value;
  const mode = state.variantMode || 'traditional';
  
  const statusCard = document.getElementById('variantGenStatus');
  const statusText = document.getElementById('variantGenStatusText');
  statusCard.style.display = 'flex';
  statusText.textContent = `Renderizando ${mode === 'spicy' ? 'spicy' : 'pose'} de ${p.name} (misma identidad)...`;
  toastLoading(`Generando variante de ${p.name} — misma cara que el retrato principal...`);
  
  // SAME identity pipeline for traditional + spicy (only pose/clothes/scene change)
  const detailed = getFullPersonaJSON();
  const skin = resolveSkinForPrompt(detailed, p);
  const id = buildIdentityLockBlock(p, detailed, skin);

  // Detect shot type — portrait reference + high img2img strength freezes close-up crop
  const poseText = `${pose}`;
  let framing = 'medium';
  if (/full\s*body|full-body|cuerpo entero|head to toe|head-to-toe|mirror selfie|standing full|wide shot|plano entero|de pie modelando|model pose|walking toward|feet to head|shoes to/i.test(poseText)) {
    framing = 'fullbody';
  } else if (/primer plano|close-up|selfie portrait|macro beauty|face only|headshot|rostro(?!.*cuerpo)/i.test(poseText)) {
    framing = 'portrait';
  }

  const isOutdoor = /playa|beach|parque|park|terraza|rooftop|calle|street|piscina|pool|bosque|forest/i.test(setting);
  const lightClause = isOutdoor
    ? 'natural outdoor daylight, same skin lightness as reference (no over-bronze)'
    : 'soft realistic practical lighting, same skin lightness as reference';

  // Full body: FRAMING FIRST (models ignore trailing framing after long identity blocks)
  const framingLead = framing === 'fullbody'
    ? 'FULL BODY PHOTO, vertical 3:4, subject completely visible from shoes to hair, camera stepped back 3 meters, environment around feet and head, wide shot.'
    : framing === 'portrait'
      ? 'Natural square portrait photo, face and shoulders, unstretched face.'
      : 'Medium shot photo, head to mid-thigh, square-friendly composition.';

  const framingClause = framing === 'fullbody'
    ? 'FRAMING LOCK: head-to-toe in frame, feet on ground, full legs torso arms head visible with margin. NOT close-up, NOT headshot, NOT waist crop.'
    : framing === 'portrait'
      ? 'FRAMING: close-medium on face and shoulders.'
      : 'FRAMING: medium shot, head to mid-thigh.';

  // For fullbody we lean on detailed face TEXT (no portrait img2img) so composition can open up
  const variantPrompt = [
    framingLead,
    framingClause,
    `IDENTITY LOCK (same person as ${id.name} — match face DNA even if camera is far):`,
    `A real ${id.age} ${id.ethnicity} ${id.genderWord} human influencer named ${id.name}.`,
    `Face (must match): ${id.faceBits || 'consistent facial structure'}.`,
    `Hair: ${id.hairBits || p.hair || 'consistent hair'}.${id.hairHex}`,
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
    'Avoid: different person, face swap look, 3d render, CGI plastic, doll, mannequin, beauty filter, cartoon, anime, elongated face, vertical stretch, accidental close-up portrait when full body requested.'
  ].join(' ');
  
  try {
    const res = await authFetch(`/api/personas/${p.id}/variants`, {
      method: 'POST',
      body: JSON.stringify({
        pose,
        attitude,
        clothing,
        setting,
        prompt: variantPrompt,
        photoreal: true,
        identityLock: true,
        framing,
        mode,
        seed: personaSeed(p.id)
      })
    });
    const data = await res.json();
    if (data.success) {
      state.activeVariants = data.variants;
      renderVariantVaultGrid();
      statusText.textContent = framing === 'fullbody'
        ? '✓ Cuerpo entero generado!'
        : '✓ Pose agregada (misma identidad)!';
      toastSuccess(framing === 'fullbody'
        ? `Cuerpo entero de ${p.name} listo`
        : `Variante lista — cara anclada a ${p.name}`);
      setTimeout(() => statusCard.style.display = 'none', 3000);
    } else {
      statusText.textContent = 'Error al generar la pose.';
      toastError(data.message || 'Error al generar la pose.');
    }
  } catch (err) {
    statusText.textContent = 'La generación falló o el servidor está offline.';
    toastError(err.message || 'La generación falló o el servidor está offline.');
    setTimeout(() => statusCard.style.display = 'none', 4000);
  }
}

async function archivePersonaAction() {
  const p = state.selectedPersona;
  if (!p) return;
  
  const isArchiving = !isArchivedPersona(p);
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

let currentModalList = [];
let currentModalIndex = 0;

function getFilteredGenerationHistory() {
  const filter = state.historyFilter || 'all';
  if (filter === 'all') return state.generationHistory || [];
  return (state.generationHistory || []).filter(g => g.generation_type === filter);
}

function openHistoryModal(gen, list = null) {
  const modal = document.getElementById('historyModal');
  if (!modal) return;

  if (list && Array.isArray(list) && list.length > 0) {
    currentModalList = list;
  } else {
    const historyList = getFilteredGenerationHistory();
    if (historyList.some(item => (item.id && gen.id && item.id === gen.id) || item.image_path === gen.image_path)) {
      currentModalList = historyList;
    } else if (state.activeVariants.some(item => (item.id && gen.id && item.id === gen.id) || item.image_path === gen.image_path)) {
      currentModalList = state.activeVariants;
    } else {
      currentModalList = [gen];
    }
  }

  const idx = currentModalList.findIndex(item => (item.id && gen.id && item.id === gen.id) || item.image_path === gen.image_path);
  currentModalIndex = idx >= 0 ? idx : 0;

  renderCurrentModalItem();
  modal.style.display = 'flex';
}

function renderCurrentModalItem() {
  if (!currentModalList || currentModalList.length === 0) return;

  if (currentModalIndex < 0) currentModalIndex = currentModalList.length - 1;
  if (currentModalIndex >= currentModalList.length) currentModalIndex = 0;

  const item = currentModalList[currentModalIndex];
  const modal = document.getElementById('historyModal');
  const img = document.getElementById('historyModalImage');
  const typeBadge = document.getElementById('historyModalType');
  const dateEl = document.getElementById('historyModalDate');
  const promptEl = document.getElementById('historyModalPrompt');
  const deleteBtn = document.getElementById('historyModalDelete');
  const btnPrev = document.getElementById('btnHistoryPrev');
  const btnNext = document.getElementById('btnHistoryNext');

  if (!modal || !item) return;

  img.src = item.image_path;

  let typeLabel = 'Retrato Principal';
  const genType = item.generation_type || (item.pose ? 'variant' : 'portrait');
  if (genType === 'variant') typeLabel = 'Pose / Variante';
  if (genType === 'ugc') typeLabel = 'UGC Producto';

  typeBadge.textContent = typeLabel;
  typeBadge.className = `history-type-badge ${genType === 'variant' ? 'badge-variant' : genType === 'ugc' ? 'badge-ugc' : 'badge-style'}`;

  const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : 'Reciente';

  const promptText = item.prompt || (item.pose ? `Pose: ${item.pose}\nVestuario: ${item.clothing || 'N/A'}\nActitud: ${item.attitude || 'N/A'}\nEntorno: ${item.setting || 'N/A'}` : 'Sin prompt detallado.');

  const counterStr = currentModalList.length > 1 ? ` (${currentModalIndex + 1} de ${currentModalList.length})` : '';
  dateEl.textContent = `Generado el: ${dateStr}${counterStr}`;
  promptEl.textContent = promptText;

  if (btnPrev) btnPrev.style.display = currentModalList.length > 1 ? 'flex' : 'none';
  if (btnNext) btnNext.style.display = currentModalList.length > 1 ? 'flex' : 'none';

  // Clone delete button to strip old event listeners
  if (deleteBtn) {
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

    newDeleteBtn.addEventListener('click', () => {
      if (item.pose) {
        deleteVariantAction(item.id);
      } else {
        deleteGenerationAction(item.id);
      }
    });
  }
}

window.navigateHistoryModal = function(direction) {
  currentModalIndex += direction;
  renderCurrentModalItem();
};

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.style.display = 'none';
}

// Global Keyboard Navigation Listener for Modal Carousel
window.addEventListener('keydown', (e) => {
  const modal = document.getElementById('historyModal');
  if (!modal || modal.style.display === 'none') return;

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    window.navigateHistoryModal(-1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    window.navigateHistoryModal(1);
  } else if (e.key === 'Escape') {
    closeHistoryModal();
  }
});

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
      
      const setElText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text || "";
      };
      
      setElText('bibleLockPrompt', b.character_lock_section);
      setElText('biblePositivePrompt', b.positive_prompt);
      
      const recs = b.model_recommendations || {};
      setElText('bibleMjPrompt', recs.midjourney);
      setElText('bibleFluxPrompt', recs.flux);
      setElText('bibleLeonardoPrompt', recs.leonardo);
      setElText('bibleIdeogramPrompt', recs.ideogram);
      setElText('bibleGrokPrompt', recs.grok_imagine);
      setElText('bibleChatGptPrompt', recs.chatgpt);
      setElText('bibleMetaAIPrompt', recs.meta_ai);
      setElText('bibleUsageNotes', b.usage_notes);
    } else {
      console.warn("Failed to load character bible details:", data ? data.message : "No data");
      toastError(`Error al generar biblia: ${data ? data.message : "Respuesta de servidor inválida"}`);
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
    
    // Clear inputs safely
    if (imagesInput) imagesInput.value = '';
    if (urlInput) urlInput.value = '';
    if (nameInput) nameInput.value = '';
    if (scriptTopicInput) scriptTopicInput.value = '';
    if (suggestedNameInput) suggestedNameInput.value = '';
    if (summaryText) summaryText.innerHTML = '';
    if (videoPromptsContainer) videoPromptsContainer.innerHTML = '';
    
    const importJsonEl = document.getElementById('importJsonOutput');
    if (importJsonEl) {
      importJsonEl.value = '';
    }

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

  const btnCopyImportJSON = document.getElementById('btnCopyImportJSON');
  if (btnCopyImportJSON) {
    btnCopyImportJSON.addEventListener('click', () => {
      const importJsonOutput = document.getElementById('importJsonOutput');
      if (importJsonOutput && importJsonOutput.value) {
        navigator.clipboard.writeText(importJsonOutput.value);
        toastSuccess('Estructura JSON copiada al portapapeles');
      }
    });
  }

  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const files = imagesInput.files;
      const imageUrl = urlInput.value.trim();
      const customName = nameInput.value.trim();
      const scriptTopic = scriptTopicInput.value.trim();

      if (files.length === 0 && !imageUrl) {
        toastInfo('Selecciona al menos una foto o una URL de referencia.');
        return;
      }

      // Transition to loading step
      step1.style.display = 'none';
      loading.style.display = 'flex';
      preview.style.display = 'none';
      toastLoading(customName ? `Analizando e importando "${customName}"...` : 'Analizando referencia e importando influencer...');

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
        toastSuccess(`Análisis listo: ${lastImportedPersona?.name || 'influencer'}. Revisa y confirma.`);

        // Persona is already persisted on analyze — refresh lists so it appears immediately
        try {
          state.personas = await reloadPersonasFromServer({
            id: lastImportedPersona?.id,
            name: lastImportedPersona?.name
          });
        } catch (refreshErr) {
          console.warn('Could not refresh persona list after import analyze:', refreshErr);
        }

        // Transition to preview step
        loading.style.display = 'none';
        preview.style.display = 'block';

        // Render suggested name
        suggestedNameInput.value = lastImportedPersona.name;

        // Render visual analysis summary
        const d = lastImportedPersona.detailedJSON || {};
        if (summaryText) {
          summaryText.innerHTML = `
            <strong>Género/Edad:</strong> ${d.identity?.gender || lastImportedPersona.gender} (${d.identity?.apparent_age || lastImportedPersona.age})<br>
            <strong>Etnia:</strong> ${d.identity?.ethnicity_appearance || lastImportedPersona.ethnicity}<br>
            <strong>Rostro:</strong> ${d.facial_features?.face_shape || 'ovalada'} (${d.facial_features?.skin_tone || 'tono natural'}) con ${d.facial_features?.skin_texture || 'textura natural'}<br>
            <strong>Cabello:</strong> ${d.hair?.length || 'medio'}, ${d.hair?.texture || 'natural'}, color ${d.hair?.color || 'castaño'}<br>
            <strong>Estilo:</strong> ${d.aesthetic?.overall_vibe || lastImportedPersona.style}
          `;
        }

        // Render JSON preview
        const importJsonEl = document.getElementById('importJsonOutput');
        if (importJsonEl) {
          importJsonEl.value = JSON.stringify(lastImportedPersona.detailedJSON || {}, null, 2);
        }

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
        toastError(`Error al analizar influencer: ${err.message}`);
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
        toastInfo('Indica un nombre para el influencer.');
        return;
      }

      try {
        // Always persist final name/handle on confirm (covers rename and first-time visibility)
        lastImportedPersona.name = finalName;
        lastImportedPersona.handle = `@${finalName.toLowerCase().replace(/\s+/g, '')}_ugc`;

        const saveRes = await authFetch('/api/personas', {
          method: 'POST',
          body: JSON.stringify(lastImportedPersona)
        });
        const saveJson = await saveRes.json();
        if (saveJson.success) {
          state.personas = Array.isArray(saveJson.personas) ? saveJson.personas : state.personas;
          if (saveJson.persona) lastImportedPersona = saveJson.persona;
        }

        // Force full UI refresh so the new influencer is visible in portfolio + select grid
        await reloadPersonasFromServer({
          id: lastImportedPersona?.id,
          name: finalName
        });
        refreshPersonaLists();

        toastSuccess(`¡Influencer "${finalName}" importado y creado con éxito!`);
        closeModal();
        navigateToTab('dashboard');

      } catch (err) {
        console.error('Failed to confirm and save persona:', err);
        toastError(`Error al confirmar la creación: ${err.message}`);
      }
    });
  }
}

window.closeHistoryModal = closeHistoryModal;
window.setPortfolioFilter = setPortfolioFilter;
window.clearPortfolioSearch = clearPortfolioSearch;
window.getFilteredPortfolioPersonas = getFilteredPortfolioPersonas;
window.setHistoryFilter = setHistoryFilter;
window.loadCharacterBible = loadCharacterBible;
window.initImportModal = initImportModal;

