// State Management
let state = {
  personas: [],
  products: [],
  selectedPersona: null,
  selectedProduct: null,
  scripts: [],
  selectedAngleIndex: 0,
  baseFee: 150,
  selectedLicenceDays: 90
};

// Dom elements
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');
const gitIndicator = document.getElementById('gitIndicator');
const gitStatusText = document.getElementById('gitStatusText');
const btnSyncNow = document.getElementById('btnSyncNow');
const syncBanner = document.getElementById('syncBanner');
const syncBannerText = document.getElementById('syncBannerText');

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  fetchData();
  setupPersonaEngine();
  setupScriptEngine();
  setupUgcStudio();
  setupLicensing();
  
  btnSyncNow.addEventListener('click', manualGitSync);
});

// Tab Switcher Logic
function setupTabs() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      
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
    });
  });
}

// Fetch Initial Data
async function fetchData() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    
    state.personas = data.personas;
    state.products = data.products;
    
    // Set defaults
    if (state.personas.length > 0) state.selectedPersona = state.personas[0];
    if (state.products.length > 0) state.selectedProduct = state.products[0];
    
    updateDashboardStats();
    renderPersonaGrids();
    populateActiveUgcData();
    generateMockScripts();
    updateLicensingCalculator();
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

// Dashboard Update
function updateDashboardStats() {
  document.getElementById('statPersonasCount').textContent = state.personas.length;
  document.getElementById('statProductsCount').textContent = state.products.length;
  
  const personaGrid = document.getElementById('dashboardPersonaGrid');
  personaGrid.innerHTML = '';
  
  state.personas.forEach(p => {
    const card = document.createElement('div');
    card.className = `persona-card ${state.selectedPersona?.name === p.name ? 'selected' : ''}`;
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <div class="persona-card-info">
        <div class="persona-card-name">${p.name}</div>
        <div class="persona-card-tag">${p.age} • ${p.ethnicity}</div>
      </div>
    `;
    card.addEventListener('click', () => selectPersona(p));
    personaGrid.appendChild(card);
  });
}

// Select Persona
function selectPersona(persona) {
  state.selectedPersona = persona;
  updateDashboardStats();
  renderPersonaGrids();
  populateActiveUgcData();
  updateLicensingCalculator();
  
  // Update inputs in Persona Form
  document.getElementById('pName').value = persona.name;
  document.getElementById('pGender').value = persona.gender;
  document.getElementById('pAge').value = persona.age;
  document.getElementById('pEthnicity').value = persona.ethnicity;
  document.getElementById('pStyle').value = persona.style;
  document.getElementById('pHair').value = persona.hair;
  document.getElementById('pLighting').value = persona.lighting;
  document.getElementById('pCamera').value = persona.camera;
  document.getElementById('pClothing').value = persona.clothing;
  document.getElementById('pSetting').value = persona.setting;
  
  compilePromptAndJSON();
}

// Render Select grids in tabs
function renderPersonaGrids() {
  const selectGrid = document.getElementById('personaSelectGrid');
  selectGrid.innerHTML = '';
  
  state.personas.forEach(p => {
    const card = document.createElement('div');
    card.className = `persona-card ${state.selectedPersona?.name === p.name ? 'selected' : ''}`;
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <div class="persona-card-info">
        <div class="persona-card-name">${p.name}</div>
        <div class="persona-card-tag">${p.age} • ${p.ethnicity}</div>
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
    const res = await fetch('/api/sync', { method: 'POST' });
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

// Persona Engine Tab Logic
function setupPersonaEngine() {
  const formInputs = document.querySelectorAll('#personaForm input, #personaForm select');
  formInputs.forEach(input => {
    input.addEventListener('input', compilePromptAndJSON);
  });
  
  document.getElementById('btnSavePersona').addEventListener('click', savePersona);
  document.getElementById('btnCopyJSON').addEventListener('click', () => {
    const jsonArea = document.getElementById('jsonEditor');
    jsonArea.select();
    navigator.clipboard.writeText(jsonArea.value);
    alert('¡Estructura JSON copiada al portapapeles!');
  });
  
  compilePromptAndJSON();
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
  
  // Prompt builder natural language compilation
  const prompt = `${camera}, close up face shot of a ${age} ${ethnicity} ${gender.toLowerCase()} influencer. ${hair}, wearing ${clothing}. Background is a ${setting}. ${lighting}, cinematic grade, photo realism, 8k resolution.`;
  document.getElementById('promptPreview').textContent = prompt;
  
  // JSON builder compilation
  const jsonConfig = {
    identity: {
      name: name,
      gender: gender,
      age: age,
      ethnicity: ethnicity
    },
    aesthetic: {
      style_vibe: style,
      hair_details: hair,
      clothing_type: clothing
    },
    photography: {
      camera_lens: camera,
      lighting_type: lighting,
      background_setting: setting
    }
  };
  
  document.getElementById('jsonEditor').value = JSON.stringify(jsonConfig, null, 2);
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
  
  const personaData = {
    name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting
  };
  
  setGitSyncingState();
  try {
    const res = await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personaData)
    });
    const data = await res.json();
    if (data.success) {
      state.personas = data.personas;
      // Select newly saved persona
      const saved = state.personas.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (saved) state.selectedPersona = saved;
      
      updateDashboardStats();
      renderPersonaGrids();
      populateActiveUgcData();
      
      if (data.gitSynced) {
        showSyncToast(true, '¡Persona guardada y respaldada en GitHub!');
      } else {
        showSyncToast(false, 'Guardado localmente. Error en Git.');
      }
    }
  } catch (err) {
    showSyncToast(false, 'Error de servidor al guardar.');
  }
}

// Script Engine Tab Logic
function setupScriptEngine() {
  document.getElementById('btnGenerateScripts').addEventListener('click', generateScriptsAction);
  document.getElementById('btnCopyScript').addEventListener('click', () => {
    if (state.scripts.length === 0) return;
    const activeScript = state.scripts[state.selectedAngleIndex];
    const scriptText = `Ángulo: ${activeScript.angle}\n\n[GANCHO / HOOK]\n${activeScript.hook}\nCue: ${activeScript.hookCue}\n\n[DEMOSTRACIÓN / DEMO]\n${activeScript.demo}\nCue: ${activeScript.demoCue}\n\n[EL GIRO / TURN]\n${activeScript.turn}\nCue: ${activeScript.turnCue}\n\n[CTA]\n${activeScript.cta}\nCue: ${activeScript.ctaCue}`;
    navigator.clipboard.writeText(scriptText);
    alert('¡Guión publicitario copiado al portapapeles!');
  });
}

function generateScriptsAction() {
  const name = document.getElementById('prodName').value;
  const benefit = document.getElementById('prodBenefit').value;
  const audience = document.getElementById('prodAudience').value;
  const frustration = document.getElementById('prodFrustration').value;
  
  state.selectedProduct = { name, benefit, audience, frustration };
  
  // Mock API call to products save
  setGitSyncingState();
  fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.selectedProduct)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      state.products = data.products;
      document.getElementById('statProductsCount').textContent = state.products.length;
      
      generateMockScripts();
      populateActiveUgcData();
      updateLicensingCalculator();
      
      if (data.gitSynced) {
        showSyncToast(true, '¡Campaña guardada y respaldada en GitHub!');
      } else {
        showSyncToast(false, 'Guardado localmente. Fallo al subir.');
      }
    }
  });
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
}

function populateActiveUgcData() {
  const creator = state.selectedPersona || { name: "Sofia", image: "assets/influencer_female.png", imageUGC: "assets/influencer_female_serum.png", handle: "@sofia_ai_ugc" };
  const prod = state.selectedProduct || { name: "Glow Serum Organics" };
  
  document.getElementById('ugcActiveAvatar').src = creator.image;
  document.getElementById('ugcActiveName').textContent = creator.name;
  document.getElementById('ugcActiveMeta').textContent = `${creator.age} • ${creator.ethnicity}`;
  
  const prodImg = creator.gender === "Male" ? "assets/product_bottle.png" : "assets/product_serum.png";
  document.getElementById('ugcActiveProductImg').src = prodImg;
  document.getElementById('ugcActiveProduct').textContent = prod.name;
  document.getElementById('ugcActiveProductMeta').textContent = prod.benefit || "Beneficio del producto";
  
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
