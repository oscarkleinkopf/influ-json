// State Management
let state = {
  personas: [],
  products: [],
  campaigns: [],
  selectedPersona: null,
  /** When true, save always creates a NEW persona (never renames/updates another by id or name). */
  isCreatingNewPersona: false,
  /** Paso 2: tras crear, foco en Copiar JSON (oculta Biblia/pose/UGC secundarios). */
  step2FocusMode: false,
  selectedProduct: null,
  selectedCampaign: null,
  scripts: [],
  /** UX-3d — contador real de scripts en campañas del perfil (/api/data) */
  scriptsCount: 0,
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
  scratchExtendedTraits: null,
  /** F4 — última variante mostrada en el comparador side-by-side */
  lastComparedVariant: null,
  /** Perfil de studio activo (local multi-user) */
  currentProfile: null,
  pinIsDefault: false,
  /** Tras canjear invitación: mostrar onboarding una vez */
  justRedeemedInvite: false,
  /** Preset de nicho activo al crear (beauty|fitness|moda) */
  activeNicheId: null,
  /** ugc-creator Layer 4 — cámara iPhone activa para packs */
  ugcCameraId: 'selfie',
  /** Formato UGC activo (testimonial, lifestyle, …) */
  ugcShotTypeId: null,
  /** CSRF synchronizer (sesión cookie) — viene de login /status /me */
  csrfToken: null
};

function rememberCsrfToken(payload) {
  const token = payload && payload.csrfToken;
  if (token && typeof token === 'string') {
    state.csrfToken = token;
  }
}

const HAPPY_PATH_COPY_KEY = 'influ_happy_path_copied_v1';
const MEMBER_ONBOARD_DISMISS_PREFIX = 'influ_member_onboard_dismissed_';
const FOUNDER_ONBOARD_DISMISS_PREFIX = 'influ_founder_onboard_dismissed_';

function happyPathCopyStorageKey() {
  const id = state.currentProfile?.id;
  return id ? `${HAPPY_PATH_COPY_KEY}_${id}` : HAPPY_PATH_COPY_KEY;
}

function memberOnboardDismissKey(profileId) {
  return `${MEMBER_ONBOARD_DISMISS_PREFIX}${profileId || 'unknown'}`;
}

function founderOnboardDismissKey(profileId) {
  return `${FOUNDER_ONBOARD_DISMISS_PREFIX}${profileId || 'unknown'}`;
}

// Cookie session is the source of truth (httpOnly influ.sid).
// Clear legacy PIN copies left from older builds — never keep PIN in sessionStorage.
try { sessionStorage.removeItem('studioPin'); } catch (e) {}

// DOM Elements (NodeLists vivos vía helpers — paneles/nav pueden crecer)
function getNavItems() {
  return document.querySelectorAll('.nav-item');
}
function getTabPanels() {
  return document.querySelectorAll('.tab-panel');
}
const navItems = getNavItems();
const tabPanels = getTabPanels();
const gitIndicator = document.getElementById('gitIndicator');
const gitStatusText = document.getElementById('gitStatusText');
const btnSyncNow = document.getElementById('btnSyncNow');
const syncBanner = document.getElementById('syncBanner');
const syncBannerText = document.getElementById('syncBannerText');

// Unified authenticated fetch helper
function setOfflineBanner(visible, message) {
  const banner = document.getElementById('offlineBanner');
  const text = document.getElementById('offlineBannerText');
  if (!banner) return;
  if (message && text) text.textContent = message;
  banner.style.display = visible ? 'flex' : 'none';
}

async function refreshCsrfToken() {
  try {
    const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (me.ok) {
      const data = await me.json().catch(() => ({}));
      if (data.csrfToken) {
        state.csrfToken = data.csrfToken;
        return true;
      }
    }
  } catch (_) { /* fall through */ }
  try {
    const st = await fetch('/api/status', { credentials: 'same-origin' });
    if (st.ok) {
      const data = await st.json().catch(() => ({}));
      rememberCsrfToken(data);
      return !!state.csrfToken;
    }
  } catch (_) {}
  return false;
}

/**
 * Toast + CTA según código de error API (Corte E / U4).
 */
function notifyApiError(data, fallbackMessage) {
  const code = data?.code || data?.errorCode || null;
  const msg = data?.message || data?.error || fallbackMessage || 'Error de servidor.';
  if (code === 'CSRF') {
    toastError('Sesión desactualizada (CSRF). Recarga la sesión sin perder el borrador.', {
      actionLabel: 'Recargar sesión',
      onAction: () => {
        refreshCsrfToken().then((ok) => {
          if (ok) toastSuccess('Sesión renovada — vuelve a intentar.');
          else showLoginScreen();
        });
      },
      duration: 10000
    });
    return;
  }
  if (code === 'RATE_LIMIT' || /429/.test(String(msg))) {
    toastInfo(msg, {
      actionLabel: 'Modo offline',
      onAction: () => {
        if (typeof setStudioOfflineMode === 'function') setStudioOfflineMode(true);
      }
    });
    return;
  }
  if (data?.paymentRequired || data?.authRequired || /pollen|402|insufficient/i.test(String(msg))) {
    toastInfo(msg, {
      actionLabel: 'Copiar JSON',
      onAction: () => {
        if (typeof copyFreeChatbotPack === 'function') copyFreeChatbotPack('fullbody');
      }
    });
    return;
  }
  toastError(msg);
}

async function authFetch(url, options = {}) {
  const opts = { ...options };
  opts.headers = { ...(options.headers || {}) };
  opts.credentials = opts.credentials || 'same-origin';
  if (!(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  }
  // Cookie session (influ.sid) — no Bearer/PIN in JS storage.
  // Server still accepts Authorization: Bearer for tests/CLI.
  const method = String(opts.method || 'GET').toUpperCase();
  if (state.csrfToken && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    opts.headers['X-CSRF-Token'] = state.csrfToken;
  }

  const alreadyRetried = opts._csrfRetried === true;

  try {
    const res = await fetch(url, opts);
    setOfflineBanner(false);
    try {
      const peekCsrf = res.headers.get('x-csrf-token');
      if (peekCsrf) state.csrfToken = peekCsrf;
    } catch (_) { /* ignore */ }

    if (res.status === 403 && !alreadyRetried && method !== 'GET' && method !== 'HEAD') {
      let csrfFail = false;
      try {
        const peek = await res.clone().json();
        csrfFail = peek?.code === 'CSRF';
      } catch (_) { /* not JSON */ }
      if (csrfFail) {
        const refreshed = await refreshCsrfToken();
        if (refreshed) {
          const retryOpts = { ...opts, _csrfRetried: true, headers: { ...opts.headers } };
          if (state.csrfToken) retryOpts.headers['X-CSRF-Token'] = state.csrfToken;
          return authFetch(url, retryOpts);
        }
        notifyApiError({ code: 'CSRF', message: 'Token CSRF inválido o expirado.' });
      }
    }

    if (res.status === 401) {
      // Pollinations auth/pollen can surface as 401 — no cerrar sesión Studio.
      let pollenish = false;
      try {
        const peek = await res.clone().json();
        pollenish = !!(
          peek?.authRequired
          || peek?.paymentRequired
          || /pollen|pollinations|insufficient balance|bearer|enter\.pollinations/i.test(String(peek?.message || ''))
        );
      } catch (_) { /* body no JSON */ }
      if (!pollenish) {
        showLoginScreen();
        throw new Error('Unauthorized');
      }
    }

    return res;
  } catch (err) {
    if (err && err.message !== 'Unauthorized') {
      setOfflineBanner(
        true,
        'Sin conexión al Studio — puedes copiar JSON ya cargado; generación Pollinations pausada.'
      );
    }
    throw err;
  }
}

function setupOfflineBanner() {
  window.addEventListener('online', () => {
    if (!isStudioOfflineMode()) setOfflineBanner(false);
    else applyOfflineModeUi();
  });
  window.addEventListener('offline', () => {
    setOfflineBanner(
      true,
      'Navegador offline — puedes copiar JSON ya cargado; generación Pollinations pausada.'
    );
  });
  const syncToggles = (checked) => {
    setStudioOfflineMode(!!checked);
    const a = document.getElementById('offlineModeToggle');
    const b = document.getElementById('offlineModeToggleBar');
    if (a) a.checked = !!checked;
    if (b) b.checked = !!checked;
  };
  document.getElementById('offlineModeToggle')?.addEventListener('change', (e) => syncToggles(e.target.checked));
  document.getElementById('offlineModeToggleBar')?.addEventListener('change', (e) => syncToggles(e.target.checked));
  // W15 — 429 banner CTA → modo offline
  document.getElementById('btnRateLimitGoOffline')?.addEventListener('click', () => {
    syncToggles(true);
    toastInfo('Modo offline activo — usa Copiar JSON. La cola no cambió.');
  });
  document.getElementById('btnPollenCopyJson')?.addEventListener('click', () => {
    setPollenBanner(false);
    if (typeof copyFreeChatbotPack === 'function') copyFreeChatbotPack('fullbody');
  });
  document.getElementById('btnPollenOpenSettings')?.addEventListener('click', () => {
    setPollenBanner(false);
    openPollinationsSettings();
  });
  applyOfflineModeUi();
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !isStudioOfflineMode()) {
    setOfflineBanner(
      true,
      'Navegador offline — puedes copiar JSON ya cargado; generación Pollinations pausada.'
    );
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const initSteps = [
    { name: 'setupTabs', fn: setupTabs },
    { name: 'setupActivePersonaChip', fn: setupActivePersonaChip },
    { name: 'setupPersonaSteps', fn: setupPersonaSteps },
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
    { name: 'setupChatbotSessionUi', fn: setupChatbotSessionUi },
    { name: 'setupLockRevisions', fn: setupLockRevisions },
    { name: 'setupLockLab', fn: setupLockLab },
    { name: 'setupProductionRecipe', fn: setupProductionRecipe },
    { name: 'setupLuSplitCopyButtons', fn: setupLuSplitCopyButtons },
    { name: 'setupStudioActivation', fn: setupStudioActivation },
    { name: 'setupProductionBrief', fn: setupProductionBrief },
    { name: 'setupCommunityTemplates', fn: setupCommunityTemplates },
    { name: 'setupHappyPathChecklist', fn: setupHappyPathChecklist },
    { name: 'setupNichePresets', fn: setupNichePresets },
    { name: 'setupComoUsarGuide', fn: setupComoUsarGuide },
    { name: 'setupSideBySideComparator', fn: setupSideBySideComparator },
    { name: 'setupQaMatrix', fn: setupQaMatrix },
    { name: 'setupFacePack', fn: setupFacePack },
    { name: 'setupOfflineBanner', fn: setupOfflineBanner },
    { name: 'setupSettings', fn: setupSettings },
    { name: 'setupAccessibleDialogs', fn: setupAccessibleDialogs },
    { name: 'setupPinWizard', fn: setupPinWizard },
    { name: 'setupMemberOnboarding', fn: setupMemberOnboarding },
    { name: 'initImportModal', fn: initImportModal },
    { name: 'setupQuickCreateActions', fn: setupQuickCreateActions },
    { name: 'setupJobRouter', fn: setupJobRouter },
    { name: 'setupWorkMode', fn: setupWorkMode }
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

/** GitHub Pages / file:// no tienen Express — el PIN no puede desbloquear nada. */
function isStaticHostEnvironment() {
  const host = String(location.hostname || '');
  const proto = String(location.protocol || '');
  return proto === 'file:' || /\.github\.io$/i.test(host);
}

async function probeStudioApiStatus() {
  try {
    const res = await fetch('/api/status', { credentials: 'same-origin' });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !ct.includes('application/json')) return null;
    const data = await res.json();
    rememberCsrfToken(data);
    return data;
  } catch (_) {
    return null;
  }
}

function showStaticHostScreen() {
  const modal = document.getElementById('staticHostModal');
  if (modal) modal.style.display = 'flex';
  const login = document.getElementById('loginModal');
  if (login) login.style.display = 'none';
  const copyBtn = document.getElementById('btnStaticHostCopy');
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = '1';
    copyBtn.addEventListener('click', async () => {
      const cmd = document.getElementById('staticHostCmd')?.textContent || '';
      try {
        await navigator.clipboard.writeText(cmd.trim());
        toastSuccess('Comandos copiados. Ejecútalos en tu terminal.');
      } catch (_) {
        toastError('No se pudo copiar. Selecciona el bloque a mano.');
      }
    });
  }
}

function checkAuthAndInit() {
  if (isStaticHostEnvironment()) {
    showStaticHostScreen();
    return;
  }
  probeStudioApiStatus()
    .then(status => {
      if (!status) {
        // API caída / HTML 404 (p. ej. hosting estático mal configurado)
        showStaticHostScreen();
        return;
      }
      state.pinIsDefault = !!status.pinIsDefault;
      if (status.profile) {
        state.currentProfile = status.profile;
        updateActiveProfileChip();
      }
      if (status.pinRequired && !status.authenticated) {
        showLoginScreen();
      } else if (status.authenticated || !status.pinRequired) {
        fetchData().then(() => {
          maybeShowSetupPinWizard();
          maybeShowPinDefaultBanner();
        });
      } else {
        showLoginScreen();
      }
    });
}

function showLoginScreen() {
  const staticModal = document.getElementById('staticHostModal');
  if (staticModal) staticModal.style.display = 'none';
  const login = document.getElementById('loginModal');
  if (!login) return;
  const dialogs = typeof InfluDialogs !== 'undefined' ? InfluDialogs : null;
  if (dialogs && typeof dialogs.openDialog === 'function') {
    dialogs.openDialog(login, { display: 'flex', focusSelector: '#loginPinInput' });
  } else {
    login.style.display = 'flex';
    login.removeAttribute('aria-hidden');
  }
  loadLoginProfiles();
}

function hideLoginScreen() {
  const login = document.getElementById('loginModal');
  if (!login) return;
  const dialogs = typeof InfluDialogs !== 'undefined' ? InfluDialogs : null;
  if (dialogs && typeof dialogs.closeDialog === 'function') {
    dialogs.closeDialog(login);
  } else {
    login.style.display = 'none';
    login.setAttribute('aria-hidden', 'true');
  }
}

async function loadLoginProfiles() {
  const select = document.getElementById('loginProfileSelect');
  if (!select) return;
  try {
    const res = await fetch('/api/auth/profiles', { credentials: 'same-origin' });
    const data = await res.json();
    const harnessRe = /^(MetricsMem_|Onboard_|Member Sec|SmokeMem|SmokeMember|L5 |HelloWorld|SpeedTest|DualSync)/i;
    const profiles = (data.profiles || []).filter((p) => !harnessRe.test(String(p.name || '')));
    select.innerHTML = '<option value="">Detectar por PIN…</option>' +
      profiles.map(p => {
        const tag = (p.role === 'admin' || p.role === 'owner') ? ' (admin)' : '';
        return `<option value="${p.id}">${escapeLockHtml(p.name)}${tag}</option>`;
      }).join('');
    if (data.pinIsDefault) state.pinIsDefault = true;
  } catch (e) {
    // keep default option
  }
}

function setupLogin() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('loginPinInput').value;
    const profileId = document.getElementById('loginProfileSelect')?.value || '';
    const errEl = document.getElementById('loginErrorText');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, profileId: profileId || undefined })
      });
      const data = await res.json();

      if (data.success) {
        rememberCsrfToken(data);
        state.currentProfile = data.profile || null;
        state.pinIsDefault = !!data.pinIsDefault;
        updateActiveProfileChip();
        hideLoginScreen();
        await fetchData();
        maybeShowSetupPinWizard();
        maybeShowPinDefaultBanner();
        if (!state.pinIsDefault) {
          maybeShowMemberOnboarding();
        }
      } else {
        const msg = data.retryAfterSec
          ? (data.message || `Demasiados intentos. Espera ${data.retryAfterSec}s.`)
          : (data.message || 'PIN incorrecto.');
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        toastError(msg);
      }
    } catch (err) {
      toastError('Error de conexión al autenticar.');
    }
  });

  const showInviteBtn = document.getElementById('btnShowInviteRedeem');
  const inviteForm = document.getElementById('inviteRedeemForm');
  const backBtn = document.getElementById('btnBackToLogin');
  showInviteBtn?.addEventListener('click', () => {
    if (form) form.style.display = 'none';
    if (showInviteBtn) showInviteBtn.style.display = 'none';
    if (inviteForm) inviteForm.style.display = 'block';
  });
  backBtn?.addEventListener('click', () => {
    if (inviteForm) inviteForm.style.display = 'none';
    if (form) form.style.display = 'block';
    if (showInviteBtn) showInviteBtn.style.display = 'inline';
  });
  inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('inviteRedeemError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    const code = document.getElementById('inviteCodeInput')?.value || '';
    const name = document.getElementById('inviteNameInput')?.value || '';
    const pin = document.getElementById('invitePinInput')?.value || '';
    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, pin })
      });
      const data = await res.json();
      if (!data.success) {
        const msg = data.message || 'No se pudo activar la invitación.';
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        return toastError(msg);
      }
      rememberCsrfToken(data);
      state.currentProfile = data.profile || null;
      state.pinIsDefault = false;
      state.justRedeemedInvite = true;
      try { sessionStorage.setItem('influ_just_redeemed', '1'); } catch (e) {}
      updateActiveProfileChip();
      hideLoginScreen();
      await fetchData();
      toastSuccess(data.message || 'Espacio creado. Roster vacío y aislado.');
      maybeShowMemberOnboarding();
    } catch (err) {
      toastError('Error de conexión al canjear la invitación.');
    }
  });
}

function isCurrentUserAdmin() {
  const role = state.currentProfile?.role;
  return role === 'admin' || role === 'owner';
}

function isMemberOnboardingDismissed(profileId) {
  if (!profileId) return true;
  try {
    return localStorage.getItem(memberOnboardDismissKey(profileId)) === '1';
  } catch (e) {
    return false;
  }
}

function dismissMemberOnboarding(profileId) {
  if (!profileId) return;
  try {
    localStorage.setItem(memberOnboardDismissKey(profileId), '1');
  } catch (e) {}
  state.justRedeemedInvite = false;
  try { sessionStorage.removeItem('influ_just_redeemed'); } catch (e) {}
}

function hideMemberWelcomeModal() {
  const modal = document.getElementById('memberWelcomeModal');
  if (modal) modal.style.display = 'none';
}

function showMemberWelcomeModal() {
  const modal = document.getElementById('memberWelcomeModal');
  if (!modal) return;
  const name = state.currentProfile?.name;
  const lead = document.getElementById('memberWelcomeLead');
  if (lead && name) {
    lead.textContent = `Hola ${name}: este perfil es solo tuyo. No verás ni mezclarás creaciones de Administración u otros testers.`;
  }
  modal.style.display = 'flex';
}

function isFounderOnboardingDismissed(profileId) {
  if (!profileId) return true;
  try {
    return localStorage.getItem(founderOnboardDismissKey(profileId)) === '1';
  } catch (e) {
    return false;
  }
}

function dismissFounderOnboarding(profileId) {
  if (!profileId) return;
  try {
    localStorage.setItem(founderOnboardDismissKey(profileId), '1');
  } catch (e) {}
}

function hideFounderWelcomeModal() {
  const modal = document.getElementById('founderWelcomeModal');
  if (modal) modal.style.display = 'none';
}

function showFounderWelcomeModal() {
  const modal = document.getElementById('founderWelcomeModal');
  if (!modal) return;
  const name = state.currentProfile?.name;
  const lead = document.getElementById('founderWelcomeLead');
  if (lead) {
    const utilityLine = 'Un router de workflow, no de GPUs: eliges el job (inspirar, UGC, producto, chatbot); el sistema fija el JSON (character_lock) y encadena pasos free. El producto es Copiar JSON; GPU NVIDIA / LoRA es un segundo camino opt-in.';
    lead.textContent = name ? `${name}: ${utilityLine}` : utilityLine;
  }
  modal.style.display = 'flex';
}

/**
 * W16 — Estado listo/revisar/sin ancla (validador local). No bloquea export.
 */
function getPersonaExportReadyStatus(persona) {
  if (typeof CharacterLockValidator !== 'undefined' && CharacterLockValidator.getExportReadyStatus) {
    return CharacterLockValidator.getExportReadyStatus(persona);
  }
  // Fallback mínimo sin validador
  const hasImage = persona?.image && !/influencer_(female|male)\.png/.test(persona.image);
  return {
    kind: hasImage ? 'ready' : 'no_anchor',
    label: hasImage ? 'Listo' : 'Sin ancla',
    grade: 'ok',
    score: hasImage ? 80 : 40,
    hasRealAnchor: !!hasImage,
    lockOk: true,
    gradeLabel: '—'
  };
}

function openExportReadyFromBadge(persona, kind) {
  try {
    selectPersona(persona);
  } catch (e) {
    console.warn('selectPersona from export badge:', e);
  }
  navigateToTab('persona-engine');
  setTimeout(() => {
    if (kind === 'no_anchor') {
      // Sin ancla → checklist / sesión chatbot (anclar identidad en free chatbot)
      try {
        openChatbotSessionChecklistModal();
      } catch (_) {
        document.getElementById('lockHealthPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toastInfo('Sin ancla de imagen — puedes igual copiar el pack. Usa el checklist o importa un retrato.');
      return;
    }
    const panel = document.getElementById('lockHealthPanel');
    if (panel) {
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Abrir lista de avisos si existe
      const toggle = document.getElementById('lockHealthToggle');
      const list = document.getElementById('lockHealthList');
      if (toggle && list && list.style.display === 'none') {
        toggle.click();
      }
    }
    if (kind === 'review') {
      toastInfo('Revisa el character_lock — export / copiar pack no se bloquean.');
    } else {
      toastSuccess('Lock listo para pegar en chatbot free.');
    }
  }, 120);
}


/**
 * Founder/admin: primer arranque con roster vacío (no bloquea si ya hay personas).
 */
function maybeShowFounderOnboarding() {
  if (!isCurrentUserAdmin()) return;
  const profileId = state.currentProfile?.id;
  if (!profileId) return;
  const emptyRoster = !Array.isArray(state.personas) || state.personas.length === 0;
  if (!emptyRoster) return;
  if (isFounderOnboardingDismissed(profileId)) return;
  showFounderWelcomeModal();
}

/**
 * Muestra onboarding a members:
 * - justo tras canjear invitación, o
 * - primer login con roster vacío (si no lo descartaron).
 * Admin/founder → maybeShowFounderOnboarding().
 */
function maybeShowMemberOnboarding() {
  if (isCurrentUserAdmin()) {
    updateMemberEmptyRosterBanner();
    applyRoleBasedSettingsUi();
    maybeShowFounderOnboarding();
    return;
  }
  applyRoleBasedSettingsUi();
  updateMemberEmptyRosterBanner();

  const profileId = state.currentProfile?.id;
  if (!profileId) return;

  let justRedeemed = state.justRedeemedInvite;
  try {
    if (sessionStorage.getItem('influ_just_redeemed') === '1') justRedeemed = true;
  } catch (e) {}

  const emptyRoster = !Array.isArray(state.personas) || state.personas.length === 0;
  if (!justRedeemed && !emptyRoster) return;
  if (!justRedeemed && isMemberOnboardingDismissed(profileId)) return;

  showMemberWelcomeModal();
}

/** W14 — crear desde cero (sin forzar preset de nicho). */
function startCreateScratchFlow({ dismissFounder = false, dismissMember = false } = {}) {
  if (dismissFounder) {
    dismissFounderOnboarding(state.currentProfile?.id);
    hideFounderWelcomeModal();
  }
  if (dismissMember) {
    dismissMemberOnboarding(state.currentProfile?.id);
    hideMemberWelcomeModal();
  }
  navigateToTab('persona-engine');
  if (typeof resetPersonaFormForNew === 'function') resetPersonaFormForNew();
  else document.getElementById('cardCreateScratch')?.click();
  if (typeof setPersonaStep === 'function') setPersonaStep(1, { scroll: false });
  const focusManualName = () => {
    const el = document.getElementById('pName');
    if (!el) return;
    try {
      el.focus();
      if (typeof el.select === 'function') el.select();
    } catch (_) {}
  };
  focusManualName();
  setTimeout(focusManualName, 50);
}

function startImportFlow({ dismissFounder = false, dismissMember = false, mode = 'all' } = {}) {
  if (dismissFounder) {
    dismissFounderOnboarding(state.currentProfile?.id);
    hideFounderWelcomeModal();
  }
  if (dismissMember) {
    dismissMemberOnboarding(state.currentProfile?.id);
    hideMemberWelcomeModal();
  }
  navigateToTab('dashboard');
  setTimeout(() => {
    const ctl = window.__importModalCtl;
    if (ctl && typeof ctl.openModal === 'function') ctl.openModal({ mode });
    else document.getElementById('btnOpenImportModal')?.click();
  }, 80);
}

function startMemberCreateFlow() {
  startCreateScratchFlow({ dismissMember: true });
}

function startMemberImportFlow() {
  startImportFlow({ dismissMember: true });
}

function startFounderCreateFlow({ importFlow = false } = {}) {
  if (importFlow) startImportFlow({ dismissFounder: true });
  else startCreateScratchFlow({ dismissFounder: true });
}

function setupQuickCreateActions() {
  const openUrl = () => startImportFlow({ mode: 'url' });
  const openPhoto = () => startImportFlow({ mode: 'photo' });
  const openManual = () => {
    if (isCurrentUserAdmin()) startFounderCreateFlow({ importFlow: false });
    else startMemberCreateFlow();
  };
  document.getElementById('btnQuickImportUrl')?.addEventListener('click', openUrl);
  document.getElementById('btnQuickImportPhoto')?.addEventListener('click', openPhoto);
  document.getElementById('btnQuickManualPersona')?.addEventListener('click', openManual);
}

/** Job router — Portafolio: inspirar · chatbot · UGC · producto (free path) */
function ensureActivePersonaForJob() {
  const list = (state.personas || []).filter((p) => !isArchivedPersona(p));
  if (!state.selectedPersona && list[0]) selectPersona(list[0]);
  return state.selectedPersona;
}

function runJobRouterAction(job) {
  const j = String(job || '').trim().toLowerCase();
  if (!j) return;

  if (j === 'inspirar') {
    navigateToTab('dashboard');
    setTimeout(() => {
      document.getElementById('quickCreateCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const urlBtn = document.getElementById('btnQuickImportUrl');
      if (urlBtn) {
        try { urlBtn.focus(); } catch (_) {}
      }
    }, 80);
    return;
  }

  const persona = ensureActivePersonaForJob();
  if (!persona) {
    toastInfo('Primero inspira o crea un influencer — el job necesita un character_lock.', {
      actionLabel: 'Inspirar',
      onAction: () => runJobRouterAction('inspirar')
    });
    return;
  }

  if (j === 'chatbot') {
    runHappyPathAction('copy-pack');
  } else if (j === 'ugc') {
    runBriefAction('ugc');
  } else if (j === 'producto') {
    runBriefAction('copy_product');
  }
}

function setupJobRouter() {
  document.querySelectorAll('[data-job-router]').forEach((btn) => {
    btn.addEventListener('click', () => runJobRouterAction(btn.getAttribute('data-job-router')));
  });
}

function getWorkModeApi() {
  return (typeof InfluWorkMode !== 'undefined' && InfluWorkMode)
    || (typeof window !== 'undefined' ? window.InfluWorkMode : null)
    || null;
}

function applyCurrentWorkMode() {
  const api = getWorkModeApi();
  if (!api) return 'chatbots';
  const mode = api.getWorkMode();
  api.applyWorkModeToDocument(mode);
  return mode;
}

function setupWorkMode() {
  document.querySelectorAll('[data-work-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-work-mode-btn');
      const api = getWorkModeApi();
      const mode = api ? api.setWorkMode(id) : (id === 'nvidia' ? 'nvidia' : 'chatbots');
      if (api) api.applyWorkModeToDocument(mode);
      else {
        try {
          document.documentElement.setAttribute('data-work-mode', mode);
          document.body?.setAttribute('data-work-mode', mode);
        } catch (_) {}
      }
      if (mode === 'nvidia') {
        toastInfo('Camino B: GPU NVIDIA local. Imagen en Locally Uncensored / Comfy (Positive y Negative en cajas distintas). Texto: Ollama / LM Studio. El JSON sigue siendo el producto.');
      } else {
        toastInfo('Camino A: Copiar JSON a chatbots gratis. No se usa la GPU.');
      }
    });
  });
  applyCurrentWorkMode();
  window.genLocalGpuRequestFlags = genLocalGpuRequestFlags;
}

function genLocalGpuRequestFlags() {
  const api = getWorkModeApi();
  if (api && typeof api.genLocalGpuFlags === 'function') return api.genLocalGpuFlags();
  return { preferLocalGpu: false, forceLocalGpu: false };
}

function getLuSplitForActivePersona() {
  const packs = typeof InfluChatbotPacks !== 'undefined' ? InfluChatbotPacks : null;
  if (!packs || typeof packs.buildLuSplitPrompts !== 'function') return null;
  const json = typeof getFullPersonaJSON === 'function' ? getFullPersonaJSON() : {};
  const must = json?.character_lock?.must_match_every_image || {};
  const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
  return packs.buildLuSplitPrompts(must, {
    fallbackName: json?.identity?.name || state.selectedPersona?.name,
    triggerToken: trigger
  });
}

async function copyLuPromptPart(kind, shotId) {
  const split = getLuSplitForActivePersona();
  if (!split) {
    toastError('Módulo de packs no cargado.');
    return;
  }
  let text = '';
  let label = '';
  if (kind === 'negative') {
    text = split.negative;
    label = 'Negativo LU';
  } else {
    const shot = (split.shots || []).find((s) => s.id === String(shotId || 'A').toUpperCase());
    if (!shot) {
      toastError('Shot LU desconocido.');
      return;
    }
    text = shot.positive;
    label = `Positivo LU ${shot.id} (${shot.label})`;
  }
  try {
    await navigator.clipboard.writeText(text);
    toastSuccess(`${label} copiado — pégalo solo en esa caja de Locally Uncensored`);
  } catch (err) {
    toastError('No se pudo copiar: ' + (err.message || 'error'));
  }
}

function setupLuSplitCopyButtons() {
  document.getElementById('btnCopyLuNegative')?.addEventListener('click', (e) => {
    e.preventDefault();
    copyLuPromptPart('negative');
  });
  document.querySelectorAll('[data-lu-positive]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      copyLuPromptPart('positive', btn.getAttribute('data-lu-positive'));
    });
  });
}

function setupMemberOnboarding() {
  document.getElementById('btnCloseMemberWelcome')?.addEventListener('click', () => {
    dismissMemberOnboarding(state.currentProfile?.id);
    hideMemberWelcomeModal();
  });
  document.getElementById('btnMemberWelcomeSkip')?.addEventListener('click', () => {
    dismissMemberOnboarding(state.currentProfile?.id);
    hideMemberWelcomeModal();
  });
  document.getElementById('btnMemberWelcomeCreate')?.addEventListener('click', startMemberCreateFlow);
  document.getElementById('btnMemberWelcomeImport')?.addEventListener('click', startMemberImportFlow);
  document.getElementById('btnMemberWelcomeDashboard')?.addEventListener('click', () => {
    dismissMemberOnboarding(state.currentProfile?.id);
    hideMemberWelcomeModal();
    navigateToTab('como-usar');
  });
  // Dead buttons removed from member banner (polish-2) — optional no-ops if markup returns
  document.getElementById('btnMemberEmptyCreate')?.addEventListener('click', startMemberCreateFlow);
  document.getElementById('btnMemberEmptyImport')?.addEventListener('click', startMemberImportFlow);
  document.getElementById('btnMemberEmptyGuide')?.addEventListener('click', () => {
    navigateToTab('como-usar');
  });

  // Founder / Administración
  document.getElementById('btnCloseFounderWelcome')?.addEventListener('click', () => {
    dismissFounderOnboarding(state.currentProfile?.id);
    hideFounderWelcomeModal();
  });
  document.getElementById('btnFounderWelcomeSkip')?.addEventListener('click', () => {
    dismissFounderOnboarding(state.currentProfile?.id);
    hideFounderWelcomeModal();
  });
  document.getElementById('btnFounderWelcomeCreate')?.addEventListener('click', () => {
    startFounderCreateFlow({ importFlow: false });
  });
  document.getElementById('btnFounderWelcomeImport')?.addEventListener('click', () => {
    startFounderCreateFlow({ importFlow: true });
  });
  document.getElementById('btnFounderWelcomeGuide')?.addEventListener('click', () => {
    dismissFounderOnboarding(state.currentProfile?.id);
    hideFounderWelcomeModal();
    navigateToTab('como-usar');
  });
}

// Export helpers for tests / debugging
window.founderOnboardDismissKey = founderOnboardDismissKey;
window.maybeShowFounderOnboarding = maybeShowFounderOnboarding;

function updateMemberEmptyRosterBanner() {
  const banner = document.getElementById('memberEmptyRosterBanner');
  if (!banner) return;
  const empty = !Array.isArray(state.personas) || state.personas.length === 0;
  const show = !isCurrentUserAdmin() && empty;
  banner.style.display = show ? 'flex' : 'none';
}

/** Tabs de Ajustes: evita el muro de perfiles sin poder llegar a Claves/Studio. */
function setSettingsTab(tabId) {
  const allowed = new Set(['claves', 'perfiles', 'invites', 'studio', 'cuenta']);
  const id = allowed.has(tabId) ? tabId : 'cuenta';
  document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    const on = btn.getAttribute('data-settings-tab') === id;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const on = panel.getAttribute('data-settings-panel') === id;
    panel.classList.toggle('is-active', on);
    if (on) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  });
  try { sessionStorage.setItem('influ_settings_tab', id); } catch (e) {}
}
window.setSettingsTab = setSettingsTab;

function applyRoleBasedSettingsUi() {
  const isAdmin = isCurrentUserAdmin();
  const keys = document.getElementById('adminKeysSettingsSection');
  const hint = document.getElementById('memberSettingsHint');
  const title = document.getElementById('settingsModalTitle');
  const heading = document.getElementById('profilesSettingsHeading');
  const lead = document.getElementById('profilesSettingsLead');
  const tabClaves = document.getElementById('settingsTabClaves');
  const tabPerfiles = document.getElementById('settingsTabPerfiles');
  const tabInvites = document.getElementById('settingsTabInvites');
  const tabStudio = document.getElementById('settingsTabStudio');
  const tabCuenta = document.getElementById('settingsTabCuenta');

  if (keys) keys.style.display = isAdmin ? 'block' : 'none';
  if (hint) hint.style.display = isAdmin ? 'none' : 'block';
  if (tabClaves) tabClaves.hidden = !isAdmin;
  if (tabInvites) tabInvites.hidden = !isAdmin;
  if (tabStudio) tabStudio.hidden = !isAdmin;
  if (tabPerfiles) tabPerfiles.hidden = false;
  if (tabCuenta) tabCuenta.hidden = false;

  if (title) title.textContent = isAdmin ? 'Ajustes' : 'Tu cuenta';
  if (heading) heading.textContent = isAdmin ? 'Perfiles de usuario (local)' : 'Tu perfil';
  if (lead) {
    lead.textContent = isAdmin
      ? 'Varios emprendedores en el mismo Studio, cada uno con su PIN y su roster. Sin nube ni OAuth. Las filas no abren otra pantalla: renombrar, cambiar PIN o eliminar.'
      : 'Cambia tu PIN o cierra sesión. Tus influencers siguen aislados en este perfil.';
  }

  let preferred = isAdmin ? 'claves' : 'cuenta';
  try {
    const saved = sessionStorage.getItem('influ_settings_tab');
    if (saved) preferred = saved;
  } catch (e) {}
  if (!isAdmin) {
    preferred = preferred === 'perfiles' ? 'perfiles' : 'cuenta';
  } else if (!['claves', 'perfiles', 'invites', 'studio', 'cuenta'].includes(preferred)) {
    preferred = 'claves';
  }
  setSettingsTab(preferred);
}

function updateActiveProfileChip() {
  const chip = document.getElementById('activeProfileChip');
  const nameEl = document.getElementById('activeProfileName');
  if (!chip || !nameEl) return;
  if (state.currentProfile?.name) {
    chip.style.display = 'flex';
    nameEl.textContent = state.currentProfile.name;
  } else {
    chip.style.display = 'none';
  }
}

function maybeShowPinDefaultBanner() {
  // Idea #5: sin barra superior — el aviso vive en Ajustes → Perfiles
  const banner = document.getElementById('pinDefaultBanner');
  if (banner) {
    banner.style.display = 'none';
    banner.hidden = true;
  }
  updatePinDefaultSettingsHint();
}

function updatePinDefaultSettingsHint() {
  const hint = document.getElementById('pinDefaultSettingsHint');
  if (!hint) return;
  const show = !!state.pinIsDefault;
  hint.classList.toggle('u-hidden', !show);
  hint.hidden = !show;
  hint.style.display = show ? 'block' : 'none';
}

function showSetupPinModal() {
  const modal = document.getElementById('setupPinModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const err = document.getElementById('setupPinError');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  document.getElementById('setupPinInput')?.focus();
  maybeShowPinDefaultBanner();
}

function hideSetupPinModal() {
  const modal = document.getElementById('setupPinModal');
  if (modal) modal.style.display = 'none';
}

/** Admin + PIN default → modal bloqueante de primer arranque. */
function maybeShowSetupPinWizard() {
  if (!state.pinIsDefault) {
    hideSetupPinModal();
    updatePinDefaultSettingsHint();
    return;
  }
  // Solo Administración debe cambiar STUDIO_PIN global; members usan su propio PIN
  const role = state.currentProfile?.role;
  const isAdmin = role === 'admin' || role === 'owner' || !state.currentProfile;
  if (!isAdmin) {
    maybeShowPinDefaultBanner();
    return;
  }
  showSetupPinModal();
}

function setupPinWizard() {
  const form = document.getElementById('setupPinForm');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  document.getElementById('btnSetupPinLater')?.addEventListener('click', () => {
    // Idea #5: sin barra + toast — PIN se cambia en Ajustes
    hideSetupPinModal();
    try { sessionStorage.setItem('influ_pin_banner_dismissed', '1'); } catch (e) {}
    maybeShowPinDefaultBanner();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('setupPinInput')?.value || '';
    const confirmPin = document.getElementById('setupPinConfirmInput')?.value || '';
    const errEl = document.getElementById('setupPinError');
    const btn = document.getElementById('btnSetupPinSubmit');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (btn) btn.disabled = true;
    try {
      const res = await authFetch('/api/setup/change-pin', {
        method: 'POST',
        body: JSON.stringify({ pin, confirmPin })
      });
      const data = await res.json();
      if (!data.success) {
        const msg = data.message || 'No se pudo guardar el PIN.';
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        toastError(msg);
        return;
      }
      rememberCsrfToken(data);
      state.pinIsDefault = !!data.pinIsDefault;
      hideSetupPinModal();
      maybeShowPinDefaultBanner();
      toastSuccess(data.message || 'PIN actualizado.');
      maybeShowFounderOnboarding();
    } catch (err) {
      const msg = err.message || 'Error de red al guardar el PIN.';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      toastError(msg);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function setupPinDefaultBanner() {
  document.getElementById('btnPinBannerDismiss')?.addEventListener('click', () => {
    try { sessionStorage.setItem('influ_pin_banner_dismissed', '1'); } catch (e) {}
    const banner = document.getElementById('pinDefaultBanner');
    if (banner) banner.style.display = 'none';
  });
  document.getElementById('btnPinBannerSettings')?.addEventListener('click', () => {
    if (state.pinIsDefault && (state.currentProfile?.role === 'admin' || state.currentProfile?.role === 'owner')) {
      showSetupPinModal();
      return;
    }
    try { sessionStorage.setItem('influ_settings_tab', 'perfiles'); } catch (e) {}
    document.getElementById('btnOpenSettings')?.click();
    setTimeout(() => setSettingsTab('perfiles'), 50);
  });
}

async function refreshProfilesSettingsList() {
  const list = document.getElementById('profilesList');
  if (!list) return;
  updatePinDefaultSettingsHint();
  try {
    const res = await authFetch('/api/profiles');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    const currentId = data.currentProfileId;
    const isAdmin = !!data.isAdmin || isCurrentUserAdmin();
    const createForm = document.getElementById('createProfileForm');
    if (createForm) createForm.style.display = isAdmin ? 'grid' : 'none';
    const pruneBar = document.getElementById('profilesPruneBar');
    if (pruneBar) pruneBar.style.display = isAdmin ? 'block' : 'none';
    // Tabs / rol: lo aplica setupSettings al abrir; aquí no reseteamos la pestaña activa.
    if (isAdmin) {
      refreshInvitesSettingsList();
      refreshBackupsSettingsList();
      refreshAuditLogSettings();
    }

    const visibleProfiles = isAdmin
      ? (data.profiles || [])
      : (data.profiles || []).filter(p => p.id === currentId);

    visibleProfiles.sort((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      const roleRank = (r) => (r === 'owner' || r === 'admin' ? 0 : 1);
      const rr = roleRank(a.role) - roleRank(b.role);
      if (rr !== 0) return rr;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    });

    const filterInput = document.getElementById('profilesListFilter');
    const q = (filterInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? visibleProfiles.filter((p) => String(p.name || '').toLowerCase().includes(q)
        || String(p.role || '').toLowerCase().includes(q))
      : visibleProfiles;

    const countEl = document.getElementById('profilesListCount');
    if (countEl) {
      countEl.textContent = q
        ? `${filtered.length} / ${visibleProfiles.length}`
        : `${visibleProfiles.length} perfil${visibleProfiles.length === 1 ? '' : 'es'}`;
    }

    const current = visibleProfiles.find((p) => p.id === currentId) || visibleProfiles[0];
    const cuentaSummary = document.getElementById('cuentaActiveProfileSummary');
    if (cuentaSummary && current) {
      cuentaSummary.innerHTML = `
        <div>
          <strong>${escapeLockHtml(current.name)}</strong>
          <span class="profile-meta">${escapeLockHtml(current.role === 'owner' ? 'admin' : current.role)} · ${current.personaCount || 0} influencers</span>
        </div>
        <div class="profile-row-actions">
          <span class="profile-current-tag">Activo</span>
          <button type="button" class="btn btn-secondary btn-sm" data-rename-profile="${current.id}" data-name="${escapeLockHtml(current.name)}">Renombrar</button>
          <button type="button" class="btn btn-secondary btn-sm" data-repin-profile="${current.id}">Cambiar PIN</button>
        </div>
      `;
    } else if (cuentaSummary) {
      cuentaSummary.innerHTML = '<p class="u-muted-12-plain">Sin perfil activo.</p>';
    }

    const renderRows = (container, profiles, { allowDelete }) => {
      if (!container) return;
      container.innerHTML = profiles.map(p => `
      <div class="profile-row ${p.id === currentId ? 'is-current' : ''}">
        <div>
          <strong>${escapeLockHtml(p.name)}</strong>
          <span class="profile-meta">${escapeLockHtml(p.role === 'owner' ? 'admin' : p.role)} · ${p.personaCount || 0} influencers</span>
        </div>
        <div class="profile-row-actions">
          ${p.id === currentId ? '<span class="profile-current-tag">Activo</span>' : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-rename-profile="${p.id}" data-name="${escapeLockHtml(p.name)}">Renombrar</button>
          <button type="button" class="btn btn-secondary btn-sm" data-repin-profile="${p.id}">Cambiar PIN</button>
          ${(allowDelete && p.id !== currentId) ? `<button type="button" class="btn btn-secondary btn-sm u-color-danger" data-delete-profile="${p.id}">Eliminar</button>` : ''}
        </div>
      </div>
    `).join('') || '<p class="u-muted-12-plain">Sin perfiles.</p>';
    };

    renderRows(list, filtered, { allowDelete: isAdmin });

    const bindProfileActions = (root) => {
      if (!root) return;
      root.querySelectorAll('[data-rename-profile]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = prompt('Nuevo nombre del perfil:', btn.getAttribute('data-name') || '');
          if (!name) return;
          const res2 = await authFetch(`/api/profiles/${btn.getAttribute('data-rename-profile')}`, {
            method: 'PATCH',
            body: JSON.stringify({ name })
          });
          const d = await res2.json();
          if (!d.success) return toastError(d.message || 'No se pudo renombrar');
          if (state.currentProfile?.id === d.profile.id) {
            state.currentProfile = d.profile;
            updateActiveProfileChip();
          }
          toastSuccess('Perfil renombrado');
          refreshProfilesSettingsList();
        });
      });
      root.querySelectorAll('[data-repin-profile]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pin = prompt('Nuevo PIN (mín. 6 caracteres):');
          if (!pin) return;
          const res2 = await authFetch(`/api/profiles/${btn.getAttribute('data-repin-profile')}`, {
            method: 'PATCH',
            body: JSON.stringify({ pin })
          });
          const d = await res2.json();
          if (!d.success) return toastError(d.message || 'No se pudo cambiar el PIN');
          toastSuccess('PIN actualizado');
        });
      });
      root.querySelectorAll('[data-delete-profile]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este perfil? Sus influencers pasarán al perfil más antiguo.')) return;
          const res2 = await authFetch(`/api/profiles/${btn.getAttribute('data-delete-profile')}`, { method: 'DELETE' });
          const d = await res2.json();
          if (!d.success) return toastError(d.message || 'No se pudo eliminar');
          toastSuccess('Perfil eliminado');
          refreshProfilesSettingsList();
        });
      });
    };

    bindProfileActions(list);
    bindProfileActions(cuentaSummary);

    if (filterInput && !filterInput.dataset.boundFilter) {
      filterInput.dataset.boundFilter = '1';
      filterInput.addEventListener('input', () => refreshProfilesSettingsList());
    }
  } catch (err) {
    list.innerHTML = `<p class="u-danger-12">${escapeLockHtml(err.message || 'Error al cargar perfiles')}</p>`;
  }
}

async function refreshInvitesSettingsList() {
  const list = document.getElementById('invitesList');
  if (!list) return;
  try {
    const res = await authFetch('/api/invites');
    if (res.status === 403) {
      list.innerHTML = '';
      return;
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    const statusLabel = {
      active: 'activa',
      used: 'usada',
      expired: 'caducada',
      revoked: 'revocada'
    };
    list.innerHTML = (data.invites || []).map(inv => `
      <div class="profile-row">
        <div>
          <strong><code>${escapeLockHtml(inv.code)}</code></strong>
          <span class="profile-meta">${statusLabel[inv.status] || inv.status}${inv.note ? ' · ' + escapeLockHtml(inv.note) : ''}${inv.usedByName ? ' · ' + escapeLockHtml(inv.usedByName) : ''}</span>
        </div>
        <div class="profile-row-actions">
          ${inv.status === 'active' ? `
            <button type="button" class="btn btn-secondary btn-sm" data-copy-invite="${escapeLockHtml(inv.code)}">Copiar</button>
            <button type="button" class="btn btn-secondary btn-sm u-color-danger" data-revoke-invite="${inv.id}" >Revocar</button>
          ` : `<span class="profile-meta">${inv.expiresAt ? 'caduca ' + escapeLockHtml(String(inv.expiresAt).slice(0, 10)) : ''}</span>`}
        </div>
      </div>
    `).join('') || '<p class="u-muted-12-plain">Aún no hay invitaciones.</p>';

    list.querySelectorAll('[data-copy-invite]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-copy-invite');
        try {
          await navigator.clipboard.writeText(code);
          toastSuccess('Código copiado');
        } catch (_) {
          toastInfo(code);
        }
      });
    });
    list.querySelectorAll('[data-revoke-invite]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Revocar esta invitación?')) return;
        const res2 = await authFetch(`/api/invites/${btn.getAttribute('data-revoke-invite')}/revoke`, { method: 'POST' });
        const d = await res2.json();
        if (!d.success) return toastError(d.message || 'No se pudo revocar');
        toastSuccess('Invitación revocada');
        refreshInvitesSettingsList();
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="u-danger-12">${escapeLockHtml(err.message || 'Error al cargar invitaciones')}</p>`;
  }
}

function formatBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

/** W7 — métricas locales (solo admin). */
async function refreshGenMetricsSettings() {
  const line = document.getElementById('genMetricsLine');
  const byProf = document.getElementById('genMetricsByProfile');
  if (!line || !isCurrentUserAdmin()) return;
  try {
    const res = await authFetch('/api/metrics/generations?sinceDays=30');
    if (res.status === 403) {
      line.textContent = '';
      if (byProf) byProf.innerHTML = '';
      return;
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    const t = data.summary?.totals || {};
    line.textContent = `${t.portraits || 0} retratos · ${t.variants || 0} variantes · ${t.fail429 || 0} fallos 429 · free ${t.providerPollinations || 0} / pago-u-otro ${t.providerOther || 0} (últimos ${data.summary?.sinceDays || 30} días)`;
    if (byProf) {
      const rows = data.summary?.byProfile || [];
      byProf.innerHTML = rows.length
        ? rows.map((r) => {
          const pid = r.profile_id || 'sin-perfil';
          const name = (state.profiles || []).find((p) => p.id === pid)?.name || pid.slice(0, 8);
          return `<div style="font-size:12px;color:var(--text-secondary);padding:6px 8px;background:rgba(0,0,0,0.25);border-radius:6px;">
            <strong style="color:#fff;">${escapeLockHtml(name)}</strong>
            — ${r.portraits || 0} retratos, ${r.variants || 0} variantes, ${r.fail_429 || 0}×429
          </div>`;
        }).join('')
        : '<p class="u-muted-12">Aún no hay generaciones registradas en gen_metrics.</p>';
    }
  } catch (err) {
    line.textContent = err.message || 'No se pudieron cargar métricas';
  }
}

const AUDIT_ACTION_LABELS = {
  'persona.archive': 'Archivar',
  'persona.unarchive': 'Desarchivar',
  'persona.delete': 'Borrar',
  'persona.export': 'Exportar persona',
  'backup.create': 'Backup',
  'studio.export': 'Export studio'
};

/** W17 — audit log (solo admin, solo lectura). */
async function refreshAuditLogSettings() {
  const list = document.getElementById('auditLogList');
  if (!list || !isCurrentUserAdmin()) return;
  list.innerHTML = '<p class="u-muted-12">Cargando…</p>';
  try {
    const res = await authFetch('/api/audit/events?limit=50');
    if (res.status === 403) {
      list.innerHTML = '<p class="u-muted-12">Solo Administración.</p>';
      return;
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    const events = Array.isArray(data.events) ? data.events : [];
    if (!events.length) {
      list.innerHTML = '<p class="u-muted-12">Aún no hay eventos. Archiva, exporta o crea un backup para ver el rastro.</p>';
      return;
    }
    list.innerHTML = events.map((ev) => {
      const when = String(ev.created_at || '').slice(0, 19).replace('T', ' ');
      const actor = escapeLockHtml(ev.actor_name || (ev.actor_profile_id || '—').toString().slice(0, 8));
      const action = escapeLockHtml(AUDIT_ACTION_LABELS[ev.action] || ev.action || '—');
      const entity = escapeLockHtml(
        ev.meta?.name || ev.entity_id || ev.entity_type || '—'
      );
      const kit = ev.meta?.kit ? ' · kit' : '';
      return `<div class="audit-log-row" style="font-size:11px;color:var(--text-secondary);padding:7px 9px;background:rgba(0,0,0,0.25);border-radius:6px;line-height:1.4;">
        <span style="color:var(--text-muted);">${escapeLockHtml(when)}</span>
        · <strong style="color:#fff;">${actor}</strong>
        · <span style="color:#a7f3d0;">${action}</span>
        · ${entity}${kit}
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<p style="font-size:12px;color:var(--danger);margin:0;">${escapeLockHtml(err.message || 'Error')}</p>`;
  }
}

async function refreshBackupsSettingsList() {
  const list = document.getElementById('backupsList');
  const metaLine = document.getElementById('backupMetaLine');
  if (!list) return;
  try {
    const res = await authFetch('/api/backups');
    if (res.status === 403) {
      list.innerHTML = '';
      return;
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    if (metaLine) {
      const keep = data.keep != null ? data.keep : 10;
      const keepHint = document.getElementById('backupKeepHint');
      if (keepHint) keepHint.textContent = String(keep);
      const last = data.meta?.last_backup_at
        ? `Último backup: ${escapeLockHtml(String(data.meta.last_backup_at))} · schema v${data.schemaVersion || '?'} · keep ${keep}`
        : `Schema v${data.schemaVersion || '?'} · keep ${keep} · aún no hay backups registrados`;
      metaLine.innerHTML = last;
    }
    list.innerHTML = (data.snapshots || []).map(s => `
      <div class="profile-row">
        <div>
          <strong style="font-size:12px;word-break:break-all;">${escapeLockHtml(s.filename)}</strong>
          <span class="profile-meta">${formatBytes(s.size)} · ${escapeLockHtml(String(s.mtime || '').slice(0, 19).replace('T', ' '))}</span>
        </div>
        <div class="profile-row-actions">
          <a class="btn btn-secondary btn-sm" href="/api/backups/${encodeURIComponent(s.filename)}/download" download="${escapeLockHtml(s.filename)}">Descargar</a>
          <button type="button" class="btn btn-secondary btn-sm u-color-danger" data-restore-backup="${escapeLockHtml(s.filename)}" >Restaurar</button>
        </div>
      </div>
    `).join('') || '<p class="u-muted-12-plain">Sin snapshots todavía.</p>';

    list.querySelectorAll('[data-restore-backup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const filename = btn.getAttribute('data-restore-backup');
        if (!confirm(`¿Programar restore de ${filename}?\nSe valida con quick_check, se crea un backup de seguridad y se aplica al reiniciar el servidor (npm start / start-studio). La DB actual no se sobrescribe hasta entonces.`)) return;
        const res2 = await authFetch('/api/backups/restore', {
          method: 'POST',
          body: JSON.stringify({ filename })
        });
        const d = await res2.json();
        if (!d.success) return toastError(d.message || 'No se pudo restaurar');
        toastSuccess(d.message || 'Restaurado. Reinicia el servidor.');
        refreshBackupsSettingsList();
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="u-danger-12">${escapeLockHtml(err.message || 'Error al cargar backups')}</p>`;
  }
}

async function logoutSession() {
  try {
    const headers = {};
    if (state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers });
  } catch (e) {}
  try { sessionStorage.removeItem('studioPin'); } catch (e) {}
  state.currentProfile = null;
  state.csrfToken = null;
  updateActiveProfileChip();
  showLoginScreen();
  toastInfo('Sesión cerrada');
}

/** Abre Ajustes y enfoca el campo POLLINATIONS_TOKEN (path boceto). Solo admin. */
function openPollinationsSettings() {
  if (!isCurrentUserAdmin()) {
    toastInfo('El token de Pollinations lo configura Administración en Ajustes. Mientras tanto: Copiar JSON — cero costo.', {
      actionLabel: 'Copiar JSON',
      onAction: () => {
        if (typeof copyFreeChatbotPack === 'function') copyFreeChatbotPack('fullbody');
      }
    });
    return;
  }
  const modal = document.getElementById('settingsModal');
  try { sessionStorage.setItem('influ_settings_tab', 'claves'); } catch (e) {}
  document.getElementById('btnOpenSettings')?.click();
  setTimeout(() => {
    setSettingsTab('claves');
    const input = document.getElementById('pollinationsTokenInput');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { input.focus(); } catch (_) {}
    } else if (modal) {
      modal.scrollTop = 0;
    }
  }, 80);
}
window.openPollinationsSettings = openPollinationsSettings;

function setupAccessibleDialogs() {
  const dialogs = getDialogsApi();
  if (!dialogs) return;
  dialogs.installGlobalHandlers(document);

  const wire = (modalId, openBtnId, closeBtnId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const openBtn = openBtnId ? document.getElementById(openBtnId) : null;
    const closeBtn = closeBtnId ? document.getElementById(closeBtnId) : null;
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        dialogs.openDialog(modal, { display: 'flex' });
      }, true);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => dialogs.closeDialog(modal), true);
    }
    // Click backdrop (modal itself as overlay)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) dialogs.closeDialog(modal);
    });
  };

  // settings has its own open handler — only enhance Escape/close via capture on close btn
  const settings = document.getElementById('settingsModal');
  if (settings) {
    settings.setAttribute('role', 'dialog');
    settings.setAttribute('aria-modal', 'true');
    document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
      dialogs.closeDialog(settings);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settings.style.display === 'flex') {
        dialogs.closeDialog(settings);
      }
    });
  }

  wire('importInfluencerModal', null, 'btnCloseImportModal');
  wire('historyModal', null, 'btnCloseHistory');
  wire('chatbotSessionModal', null, 'btnCloseChatbotSession');
}

function setupSettings() {
  const modal = document.getElementById('settingsModal');
  const btnOpen = document.getElementById('btnOpenSettings');
  const btnClose = document.getElementById('btnCloseSettings');
  const form = document.getElementById('settingsForm');
  const btnDisable = document.getElementById('btnDisableKeys');

  document.getElementById('settingsTabNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-settings-tab]');
    if (!btn || btn.hidden) return;
    const tab = btn.getAttribute('data-settings-tab');
    setSettingsTab(tab);
    if (tab === 'studio' && isCurrentUserAdmin()) {
      refreshGenMetricsSettings();
      refreshAuditLogSettings();
      refreshBackupsSettingsList();
    }
    if (tab === 'invites' && isCurrentUserAdmin()) refreshInvitesSettingsList();
    if (tab === 'perfiles') refreshProfilesSettingsList();
  });

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      applyRoleBasedSettingsUi();
      const dialogs = getDialogsApi();
      if (modal && dialogs) dialogs.openDialog(modal, { display: 'flex' });
      else if (modal) modal.style.display = 'flex';
      refreshProfilesSettingsList();
      if (isCurrentUserAdmin()) {
        refreshGenMetricsSettings();
        refreshAuditLogSettings();
        refreshSettingsKeysStatus();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      const dialogs = getDialogsApi();
      if (modal && dialogs) dialogs.closeDialog(modal);
      else if (modal) modal.style.display = 'none';
    });
  }

  const createProfileForm = document.getElementById('createProfileForm');
  if (createProfileForm) {
    createProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newProfileName')?.value || '';
      const pin = document.getElementById('newProfilePin')?.value || '';
      try {
        const res = await authFetch('/api/profiles', {
          method: 'POST',
          body: JSON.stringify({ name, pin, role: 'member' })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error');
        document.getElementById('newProfileName').value = '';
        document.getElementById('newProfilePin').value = '';
        toastSuccess(`Perfil «${data.profile.name}» creado`);
        refreshProfilesSettingsList();
      } catch (err) {
        toastError(err.message || 'No se pudo crear el perfil');
      }
    });
  }

  document.getElementById('btnLogoutSession')?.addEventListener('click', logoutSession);
  setupPinDefaultBanner();

  document.getElementById('btnPruneEmptyTestProfiles')?.addEventListener('click', async () => {
    if (!isCurrentUserAdmin()) return;
    const TEST_NAME = /^(Member Sec|MetricsMem_|Onboard_|SmokeMember|SmokeMem)/i;
    try {
      const res = await authFetch('/api/profiles');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error');
      const currentId = data.currentProfileId;
      const victims = (data.profiles || []).filter((p) =>
        p.id !== currentId
        && p.role !== 'owner'
        && p.role !== 'admin'
        && !(p.personaCount > 0)
        && TEST_NAME.test(String(p.name || ''))
      );
      if (!victims.length) {
        toastInfo('No hay perfiles de prueba vacíos para limpiar.');
        return;
      }
      if (!confirm(`¿Eliminar ${victims.length} perfiles de prueba vacíos? Sus influencers (si hubiera) pasarían al perfil más antiguo.`)) return;
      let ok = 0;
      let fail = 0;
      for (const p of victims) {
        const r = await authFetch(`/api/profiles/${p.id}`, { method: 'DELETE' });
        const d = await r.json().catch(() => ({}));
        if (d.success) ok += 1;
        else fail += 1;
      }
      toastSuccess(`Limpieza: ${ok} eliminados${fail ? `, ${fail} fallaron` : ''}.`);
      refreshProfilesSettingsList();
    } catch (err) {
      toastError(err.message || 'No se pudo limpiar perfiles');
    }
  });

  const createInviteForm = document.getElementById('createInviteForm');
  if (createInviteForm) {
    createInviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('inviteNoteInput')?.value || '';
      const expiresInDays = Number(document.getElementById('inviteDaysInput')?.value || 14);
      try {
        const res = await authFetch('/api/invites', {
          method: 'POST',
          body: JSON.stringify({ note, expiresInDays, maxUses: 1 })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error');
        document.getElementById('inviteNoteInput').value = '';
        const banner = document.getElementById('lastInviteCodeBanner');
        const codeEl = document.getElementById('lastInviteCodeValue');
        if (banner && codeEl) {
          codeEl.textContent = data.invite.code;
          banner.style.display = 'block';
        }
        toastSuccess(`Código ${data.invite.code} listo para compartir`);
        refreshInvitesSettingsList();
      } catch (err) {
        toastError(err.message || 'No se pudo crear la invitación');
      }
    });
  }
  document.getElementById('btnCopyLastInvite')?.addEventListener('click', async () => {
    const code = document.getElementById('lastInviteCodeValue')?.textContent || '';
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toastSuccess('Código copiado');
    } catch (_) {
      toastInfo(code);
    }
  });

  document.getElementById('btnCreateBackup')?.addEventListener('click', async () => {
    const label = document.getElementById('backupLabelInput')?.value || 'manual';
    try {
      const res = await authFetch('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ label })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error');
      if (document.getElementById('backupLabelInput')) document.getElementById('backupLabelInput').value = '';
      toastSuccess(`Backup ${data.snapshot?.filename || 'creado'}`);
      refreshBackupsSettingsList();
    } catch (err) {
      toastError(err.message || 'No se pudo crear el backup');
    }
  });

  document.getElementById('btnRefreshGenMetrics')?.addEventListener('click', () => {
    refreshGenMetricsSettings();
  });

  document.getElementById('btnRefreshAuditLog')?.addEventListener('click', () => {
    refreshAuditLogSettings();
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pollinationsToken = document.getElementById('pollinationsTokenInput')?.value;
      const geminiApiKey = document.getElementById('geminiKeyInput').value;
      const replicateApiToken = document.getElementById('replicateTokenInput').value;

      try {
        const body = { geminiApiKey, replicateApiToken };
        // Solo enviar Pollinations si el usuario escribió algo (no borrar token existente con campo vacío al guardar Gemini)
        if (pollinationsToken !== undefined && String(pollinationsToken).length > 0) {
          body.pollinationsToken = pollinationsToken;
        }
        const res = await authFetch('/api/settings/keys', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          toastSuccess(data.message || 'Configuración de claves guardada.');
          const pollenInput = document.getElementById('pollinationsTokenInput');
          if (pollenInput) pollenInput.value = '';
          if (modal) modal.style.display = 'none';
        } else {
          toastError(data.error || 'Error al guardar la configuración.');
        }
      } catch (err) {
        toastError('Error de red al guardar claves API.');
      }
    });
  }

  if (btnDisable) {
    btnDisable.addEventListener('click', async () => {
      document.getElementById('geminiKeyInput').value = '';
      document.getElementById('replicateTokenInput').value = '';
      // No borra POLLINATIONS_TOKEN: es free-tier / grants, no pago.
      try {
        const res = await authFetch('/api/settings/keys', {
          method: 'POST',
          body: JSON.stringify({ geminiApiKey: '', replicateApiToken: '' })
        });
        const data = await res.json();
        if (data.success) {
          toastSuccess('Restablecido a Modo 100% Gratuito (Pollinations + Offline).');
          if (modal) modal.style.display = 'none';
        }
      } catch (err) {
        toastError('Error al restablecer la configuración.');
      }
    });
  }
}

async function refreshSettingsKeysStatus() {
  const pollenInput = document.getElementById('pollinationsTokenInput');
  if (!pollenInput) return;
  try {
    const res = await authFetch('/api/settings/keys');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return;
    pollenInput.placeholder = data.pollinationsConfigured
      ? 'Token configurado (escribe uno nuevo para reemplazar)'
      : 'sk_… o pk_… (enter.pollinations.ai/keys)';
    const gemini = document.getElementById('geminiKeyInput');
    if (gemini) {
      gemini.placeholder = data.geminiConfigured
        ? 'Gemini configurado (escribe uno nuevo para reemplazar)'
        : 'AIzaSy... (Dejar en blanco para modo 100% gratis)';
    }
    const rep = document.getElementById('replicateTokenInput');
    if (rep) {
      rep.placeholder = data.replicateConfigured
        ? 'Replicate configurado (escribe uno nuevo para reemplazar)'
        : 'r8_... (vacío = sin face-lock ni L3)';
    }
  } catch (_) { /* ignore */ }
}
// Tab Switcher & Mobile Responsive Navigation Logic (UX-1a hubs)
const TAB_ALIASES = {
  personas: 'persona-engine',
  products: 'ugc-studio'
};

const TAB_TO_HUB = {
  dashboard: 'influencers',
  'persona-engine': 'influencers',
  'ugc-studio': 'produce',
  'script-engine': 'produce',
  gallery: 'produce',
  campaigns: 'business',
  licensing: 'business',
  'como-usar': null
};

function resolveStudioTab(rawTabId) {
  return TAB_ALIASES[rawTabId] || rawTabId;
}

function updateHubSubnav(tabId) {
  const hub = TAB_TO_HUB[tabId];
  const bar = document.getElementById('hubSubnav');
  if (!bar) return;
  if (!hub) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.querySelectorAll('.hub-subnav-inner').forEach((inner) => {
    const match = inner.getAttribute('data-hub') === hub;
    inner.hidden = !match;
    if (match) {
      inner.querySelectorAll('.hub-subnav-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
    }
  });
}

function syncNavActiveForTab(tabId) {
  const hub = TAB_TO_HUB[tabId];
  getNavItems().forEach((nav) => {
    const navHub = nav.getAttribute('data-nav-hub');
    const navTab = nav.getAttribute('data-tab');
    const active = hub
      ? navHub === hub
      : navTab === tabId;
    nav.classList.toggle('active', !!active);
  });
  document.querySelectorAll('.mobile-nav-item').forEach((mbItem) => {
    const mbHub = mbItem.getAttribute('data-nav-hub');
    const mbTab = resolveStudioTab(mbItem.getAttribute('data-tab'));
    const active = hub
      ? mbHub === hub
      : mbTab === tabId || mbItem.getAttribute('data-tab') === tabId;
    mbItem.classList.toggle('active', !!active);
  });
}

function switchStudioTab(rawTabId) {
  const tabId = resolveStudioTab(rawTabId);
  state.activeTab = tabId;

  syncNavActiveForTab(tabId);
  updateHubSubnav(tabId);

  getTabPanels().forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });

  closeMobileSidebar();

  if (tabId === 'campaigns') renderCampaigns();
  if (tabId === 'gallery') renderGallery();
  if (tabId === 'ugc-studio' && typeof renderBulkProductSelector === 'function') renderBulkProductSelector();
  if (tabId === 'licensing' && typeof updateLicensingCalculator === 'function') updateLicensingCalculator();
}

function setupTabs() {
  switchStudioTab(state.activeTab || 'dashboard');

  getNavItems().forEach((item) => {
    item.addEventListener('click', () => {
      switchStudioTab(item.getAttribute('data-tab'));
    });
  });

  document.querySelectorAll('.mobile-nav-item').forEach((mbItem) => {
    mbItem.addEventListener('click', () => {
      switchStudioTab(mbItem.getAttribute('data-tab'));
    });
  });

  document.querySelectorAll('.hub-subnav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchStudioTab(btn.getAttribute('data-tab'));
    });
  });

  // Mobile Sidebar Hamburger Toggle
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const backdrop = document.getElementById('mobileSidebarBackdrop');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.toggle('mobile-open');
      if (backdrop) backdrop.classList.toggle('active');
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
}

/** UX-1b — chip global «Trabajando con» + Copiar JSON de contexto */
function updateActivePersonaChip() {
  const nameEl = document.getElementById('activePersonaChipName');
  const copyBtn = document.getElementById('btnContextCopyJson');
  const p = state.selectedPersona;
  if (nameEl) nameEl.textContent = p?.name || 'Sin influencer';
  if (copyBtn) copyBtn.disabled = !p;
  // Mantener paneles Producir (UGC + Guiones) alineados con el chip
  try { populateActiveUgcData(); } catch (_) {}
}

function closeActivePersonaMenu() {
  const menu = document.getElementById('activePersonaMenu');
  const btn = document.getElementById('btnActivePersonaMenu');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function renderActivePersonaMenu() {
  const menu = document.getElementById('activePersonaMenu');
  if (!menu) return;
  const list = (state.personas || []).filter((p) => !isArchivedPersona(p));
  if (!list.length) {
    menu.innerHTML = '<div class="active-persona-empty">Sin influencers — crea o importa uno</div>';
    return;
  }
  const selectedId = state.selectedPersona?.id;
  menu.innerHTML = list.map((p) => {
    const active = p.id === selectedId ? ' is-active' : '';
    const safeName = String(p.name || 'Sin nombre').replace(/</g, '&lt;');
    return `<button type="button" class="active-persona-option${active}" role="option" data-persona-id="${p.id}">${safeName}</button>`;
  }).join('');
  menu.querySelectorAll('[data-persona-id]').forEach((opt) => {
    opt.addEventListener('click', () => {
      const id = opt.getAttribute('data-persona-id');
      const persona = (state.personas || []).find((x) => String(x.id) === String(id));
      if (persona) {
        selectPersona(persona);
        if (state.activeTab === 'dashboard') navigateToTab('persona-engine');
      }
      closeActivePersonaMenu();
    });
  });
}

function setupActivePersonaChip() {
  updateActivePersonaChip();
  const btn = document.getElementById('btnActivePersonaMenu');
  const menu = document.getElementById('activePersonaMenu');
  const copyBtn = document.getElementById('btnContextCopyJson');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu) return;
    const open = menu.hidden;
    if (open) {
      renderActivePersonaMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      closeActivePersonaMenu();
    }
  });

  copyBtn?.addEventListener('click', () => {
    if (!state.selectedPersona) {
      toastInfo('Elige un influencer primero (chip «Trabajando con»).', {
        actionLabel: 'Ir a Influencers',
        onAction: () => {
          navigateToTab('dashboard');
          document.getElementById('btnActivePersona')?.focus?.();
        }
      });
      return;
    }
    if (typeof copyFreeChatbotPack === 'function') copyFreeChatbotPack('fullbody');
  });

  document.addEventListener('click', (e) => {
    const chip = document.getElementById('activePersonaChip');
    if (chip && !chip.contains(e.target)) closeActivePersonaMenu();
  });
}

/** UX-2 — pasos Identidad / Lock & Packs / Variaciones */
const PERSONA_STEP_HINTS = {
  1: 'Define cara y rasgos que anclan el character_lock. Lo demás va a «Detalles».',
  2: 'Copia el pack free (Copiar JSON). Bocetos y LoRA son opcionales.',
  3: 'Variantes, face pack, QA e historial — opcionales; no bloquean el free path.'
};

const PERSONA_STEP2_FOCUS_HINT =
  'Primer JSON: copia el pack free. Biblia, poses y UGC están en «Ver herramientas completas».';

function getPersonaStep() {
  const n = Number(document.getElementById('persona-engine')?.getAttribute('data-active-step') || 1);
  return [1, 2, 3].includes(n) ? n : 1;
}

function setStep2Focus(on, { updateHint = true } = {}) {
  state.step2FocusMode = !!on;
  const root = document.getElementById('persona-engine');
  if (root) root.setAttribute('data-step2-focus', on ? '1' : '0');
  const banner = document.getElementById('personaStep2FocusBanner');
  if (banner) banner.hidden = !on;
  if (updateHint && getPersonaStep() === 2) {
    const hint = document.getElementById('personaStepHint');
    if (hint) {
      hint.textContent = on ? PERSONA_STEP2_FOCUS_HINT : (PERSONA_STEP_HINTS[2] || '');
    }
  }
}

function clearStep2Focus() {
  setStep2Focus(false);
}

function setPersonaStep(step, { scroll = true } = {}) {
  const n = Number(step);
  if (![1, 2, 3].includes(n)) return;
  const root = document.getElementById('persona-engine');
  if (!root) return;
  root.setAttribute('data-active-step', String(n));
  state.personaStep = n;
  if (!root.hasAttribute('data-step2-focus')) {
    root.setAttribute('data-step2-focus', state.step2FocusMode ? '1' : '0');
  } else {
    root.setAttribute('data-step2-focus', state.step2FocusMode ? '1' : '0');
  }

  document.querySelectorAll('.persona-step-btn').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.getAttribute('data-persona-goto')) === n);
  });

  const hint = document.getElementById('personaStepHint');
  if (hint) {
    if (n === 2 && state.step2FocusMode) hint.textContent = PERSONA_STEP2_FOCUS_HINT;
    else hint.textContent = PERSONA_STEP_HINTS[n] || '';
  }

  const prev = document.getElementById('btnPersonaStepPrev');
  const next = document.getElementById('btnPersonaStepNext');
  if (prev) prev.hidden = n <= 1;
  if (next) {
    next.hidden = n >= 3;
    if (n === 1) next.textContent = 'Siguiente: Lock & Packs →';
    else if (n === 2) next.textContent = 'Siguiente: Variaciones →';
  }

  // Paso 1: priorizar formulario; paso 2: ficha + packs
  const form = document.getElementById('personaForm');
  const sheet = document.getElementById('personaProfileSheet');
  if (n === 1 && form && state.isCreatingNewPersona) {
    form.classList.remove('u-hidden');
    form.style.display = 'flex';
    if (sheet) sheet.style.display = 'none';
  }
  if (n === 2 && sheet && state.selectedPersona && !state.isCreatingNewPersona) {
    sheet.style.display = '';
    if (form) form.style.display = 'none';
  }
  if (n === 3) {
    // Al ir a Variaciones, salir del foco primer-JSON (herramientas completas)
    if (state.step2FocusMode) setStep2Focus(false, { updateHint: false });
    const face = document.getElementById('facePackPanel');
    const qa = document.getElementById('qaMatrixPanel');
    if (face && state.selectedPersona) face.style.display = '';
    if (qa && state.selectedPersona) qa.style.display = '';
    if (typeof renderFacePack === 'function' && state.selectedPersona) {
      try { renderFacePack(); } catch (_) {}
    }
    if (typeof renderQaMatrix === 'function' && state.selectedPersona) {
      try { renderQaMatrix(); } catch (_) {}
    }
  }

  // UX-2: form abierto en paso 1 → ocultar muro Crear; creando → ocultar Archivar/Eliminar
  const formVisible = !!(form
    && !form.classList.contains('u-hidden')
    && form.style.display !== 'none'
    && getComputedStyle(form).display !== 'none');
  root.setAttribute('data-form-open', (n === 1 && (formVisible || state.isCreatingNewPersona)) ? '1' : '0');
  root.setAttribute('data-creating', state.isCreatingNewPersona ? '1' : '0');

  // UX-2: Avanzado / detalles opcionales siempre plegados al cambiar de paso
  document.querySelectorAll(
    '#persona-engine details.persona-identity-details, #personaAdvancedTools, #loraAdvancedPanel, #personaIdentityExtraTraits, #personaIdentityProfileDetails, #personaIdentityGenDetails'
  ).forEach((d) => {
    try { d.open = false; } catch (_) {}
  });
  const ab = document.getElementById('abComparatorContainer');
  const hist = document.getElementById('historyTimelineContainer');
  if (ab) {
    ab.style.display = 'none';
    ab.classList.add('u-hidden-mb-28');
  }
  if (hist) {
    hist.style.display = 'none';
    hist.classList.add('u-hidden-mb-28');
  }
  document.getElementById('btnToggleAB')?.classList.remove('active');
  document.getElementById('btnToggleHistory')?.classList.remove('active');

  if (scroll) {
    document.getElementById('personaStepper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupPersonaSteps() {
  document.querySelectorAll('[data-persona-goto]').forEach((btn) => {
    btn.addEventListener('click', () => setPersonaStep(btn.getAttribute('data-persona-goto')));
  });
  document.getElementById('btnPersonaStepPrev')?.addEventListener('click', () => {
    setPersonaStep(Math.max(1, getPersonaStep() - 1));
  });
  document.getElementById('btnPersonaStepNext')?.addEventListener('click', () => {
    setPersonaStep(Math.min(3, getPersonaStep() + 1));
  });
  document.getElementById('btnEmptyHistoryCopyJson')?.addEventListener('click', () => {
    if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: true });
    const copy = document.getElementById('btnCopyPackFullbodyPrimary') || document.getElementById('btnContextCopyJson');
    copy?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('btnStep2FocusExit')?.addEventListener('click', () => {
    clearStep2Focus();
  });
  setPersonaStep(state.personaStep || 1, { scroll: false });
}

/** Normalize archived flag (sqlite may return 0/1, true/false, or null). */
function isArchivedPersona(p) {
  return p && (p.archived === 1 || p.archived === true || p.archived === '1');
}

/** Placeholder cuando falta el archivo o el thumb es un fixture 8×8 de tests. */
const DEFAULT_PERSONA_THUMB = 'assets/influencer_female.png';
const HARNESS_PERSONA_RE = /^(SpeedTestPersona|DualSyncPersona|MetricsMem_|Onboard_|Member Sec|SmokeMember|SmokeMem|L5 Hello|HelloWorld)/i;

function isHarnessPersonaName(name) {
  return HARNESS_PERSONA_RE.test(String(name || ''));
}

function personaThumbSrc(p) {
  const img = p && p.image != null ? String(p.image).trim() : '';
  if (!img) return DEFAULT_PERSONA_THUMB;
  // Demos de harness: no cargar el JPEG 8×8 (bloque amarillo al escalar).
  if (isHarnessPersonaName(p?.name)) return DEFAULT_PERSONA_THUMB;
  return img;
}

/** onerror + thumbs minúsculos (fixtures de harness) → avatar por defecto. */
function bindPersonaThumbFallback(imgEl) {
  if (!imgEl) return;
  const applyTinyOrBroken = () => {
    if (imgEl.dataset.fallbackApplied === '1') return;
    // broken / vacío
    if (!imgEl.naturalWidth) {
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = DEFAULT_PERSONA_THUMB;
      return;
    }
    // Fixtures de import/test suelen ser 8×8; se ven amarillo/peach sólido en Resumen.
    if (imgEl.naturalWidth < 48) {
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = DEFAULT_PERSONA_THUMB;
    }
  };
  if (imgEl.dataset.thumbBound !== '1') {
    imgEl.dataset.thumbBound = '1';
    imgEl.addEventListener('error', () => {
      if (imgEl.dataset.fallbackApplied === '1') return;
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = DEFAULT_PERSONA_THUMB;
    });
    imgEl.addEventListener('load', applyTinyOrBroken);
  }
  // Si la imagen ya está en caché, `load` no vuelve a dispararse.
  if (imgEl.complete) applyTinyOrBroken();
}
window.isHarnessPersonaName = isHarnessPersonaName;
window.personaThumbSrc = personaThumbSrc;

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
  try {
    if (typeof updateActivePersonaChip === 'function') updateActivePersonaChip();
  } catch (e) {
    console.warn('updateActivePersonaChip failed:', e);
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
  if (Number.isFinite(data.scriptsCount)) state.scriptsCount = data.scriptsCount;

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
    state.scriptsCount = Number.isFinite(data.scriptsCount) ? data.scriptsCount : 0;
    if (data.profile) {
      state.currentProfile = data.profile;
      updateActiveProfileChip();
    }
    
    // Always paint lists first so a selectPersona error cannot hide the portfolio
    refreshPersonaLists();
    updateMemberEmptyRosterBanner();
    applyRoleBasedSettingsUi();
    renderHappyPathChecklist();
    try {
      if ((state.personas || []).length) {
        markStudioActivation('create');
        markStudioActivation('save');
      }
      renderStudioActivation();
      renderProductionBrief();
    } catch (_) {}

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
    maybeShowMemberOnboarding();
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
  } else if (state.portfolioFilter === 'ready') {
    filtered = filtered.filter((p) => {
      if (isArchivedPersona(p)) return false;
      return getPersonaExportReadyStatus(p).kind === 'ready';
    });
  } else if (state.portfolioFilter === 'review') {
    filtered = filtered.filter((p) => {
      if (isArchivedPersona(p)) return false;
      const k = getPersonaExportReadyStatus(p).kind;
      return k === 'review' || k === 'no_anchor';
    });
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

  // Resumen: demos de harness (thumbs 8×8 / basura) al final para no tapar el roster real.
  filtered.sort((a, b) => {
    const ha = isHarnessPersonaName(a?.name) ? 1 : 0;
    const hb = isHarnessPersonaName(b?.name) ? 1 : 0;
    if (ha !== hb) return ha - hb;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' });
  });

  return filtered;
}

function clearPortfolioSearch() {
  state.portfolioSearchQuery = '';
  const input = document.getElementById('portfolioSearch');
  if (input) input.value = '';
  updateDashboardStats();
}

/** Polish: oculta plantillas/brief hasta que haya al menos 1 influencer (happy path primero). */
function syncDashboardRosterPolish() {
  const hasRoster = Array.isArray(state.personas) && state.personas.some((p) => !isArchivedPersona(p));
  document.querySelectorAll('[data-require-roster="1"]').forEach((el) => {
    el.classList.toggle('u-hidden', !hasRoster);
    el.hidden = !hasRoster;
  });
  const act = document.getElementById('studioActivationCard');
  if (act) {
    act.classList.toggle('is-roster-empty', !hasRoster);
    const list = document.getElementById('studioActivationList');
    if (list) list.style.display = hasRoster ? '' : 'none';
  }
}

/** Feedback inline en botones canónicos de Copiar JSON (además del toast). */
function flashCopySuccessButtons() {
  const ids = ['btnCopyPackFullbodyPrimary', 'btnContextCopyJson', 'btnExportUgcChatbot'];
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.copyFlash === '1') return;
    const prev = btn.textContent;
    btn.dataset.copyFlash = '1';
    btn.classList.add('is-copied');
    btn.textContent = '¡Copiado!';
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList.remove('is-copied');
      delete btn.dataset.copyFlash;
    }, 1800);
  });
}

// Dashboard Update
function updateDashboardStats() {
  // F6 — refrescar checklist aunque el portafolio esté vacío
  renderHappyPathChecklist();
  syncDashboardRosterPolish();

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
    else if (state.portfolioFilter === 'ready') statLabel.textContent = 'Listos';
    else if (state.portfolioFilter === 'review') statLabel.textContent = 'A revisar';
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
      : state.portfolioFilter === 'archived' ? 'archivados'
      : state.portfolioFilter === 'ready' ? 'listos'
      : state.portfolioFilter === 'review' ? 'a revisar'
      : 'todos';
    const q = (state.portfolioSearchQuery || '').trim();
    if (q) {
      meta.textContent = `${visibleCount} visibles · filtro “${filterLabel}” · búsqueda “${q}”`;
    } else {
      meta.textContent = `${visibleCount} visibles · filtro “${filterLabel}” · ${all.length} en roster`;
    }
  }

  const prodStat = document.getElementById('statProductsCount');
  if (prodStat) prodStat.textContent = state.products.length;
  
  // Total generations count from stats state (scoped by profile via /api/data)
  const totalGens = state.generationStats?.total || 0;
  const genStat = document.getElementById('statGenerationsCount');
  if (genStat) genStat.textContent = totalGens;

  // UX-3d — scripts reales (API), nunca campañas×10 ni fallback inventado a 10
  const scriptStat = document.getElementById('statScriptsCount');
  if (scriptStat) {
    const n = Number.isFinite(state.scriptsCount) ? state.scriptsCount : 0;
    scriptStat.textContent = n;
  }
  
  const personaGrid = document.getElementById('dashboardPersonaGrid');
  if (!personaGrid) return;
  personaGrid.innerHTML = '';
  
  if (filtered.length === 0) {
    const hasSearch = !!(state.portfolioSearchQuery || '').trim();
    const hasFilter = state.portfolioFilter !== 'all';
    const trulyEmpty = !hasSearch && !hasFilter && (!Array.isArray(state.personas) || state.personas.length === 0);
    if (trulyEmpty) {
      // W14 — un panel: Crear | Importar | Cómo usar (founder y member)
      personaGrid.innerHTML = `
        <div class="empty-roster-panel" id="emptyRosterPanel">
          <h3 class="empty-roster-title">Empieza tu primer influencer</h3>
          <p class="empty-roster-lead">Crea o importa un personaje, guarda el JSON y copia el pack a un chatbot gratis. Sin tarjeta ni gen obligatoria.</p>
          <div class="empty-roster-actions">
            <button type="button" class="btn" id="btnEmptyRosterCreate">Crear</button>
            <button type="button" class="btn btn-secondary" id="btnEmptyRosterImport">Importar</button>
            <button type="button" class="btn btn-secondary" id="btnEmptyRosterGuide">Cómo usar</button>
          </div>
        </div>
      `;
      document.getElementById('btnEmptyRosterCreate')?.addEventListener('click', () => {
        if (isCurrentUserAdmin()) startFounderCreateFlow({ importFlow: false });
        else startMemberCreateFlow();
      });
      document.getElementById('btnEmptyRosterImport')?.addEventListener('click', () => {
        if (isCurrentUserAdmin()) startFounderCreateFlow({ importFlow: true });
        else startMemberImportFlow();
      });
      document.getElementById('btnEmptyRosterGuide')?.addEventListener('click', () => {
        navigateToTab('como-usar');
      });
    } else {
      personaGrid.innerHTML = `
        <div class="empty-filter-panel">
          <div class="empty-filter-panel__icon">🔍</div>
          <div class="empty-filter-panel__title">0 influencers en esta vista</div>
          <div class="empty-filter-panel__lead">
            ${hasSearch || hasFilter
              ? 'No hay coincidencias con la búsqueda o el filtro actual.'
              : 'Aún no hay influencers en el roster.'}
          </div>
          ${hasSearch || hasFilter ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btnClearPortfolioFilters">
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

    const cardApi = (typeof InfluPersonaCard !== 'undefined' ? InfluPersonaCard : window.InfluPersonaCard);
    const exportStatus = getPersonaExportReadyStatus(p);
    const card = cardApi.buildPortfolioCard(p, {
      thumbSrc: personaThumbSrc(p),
      selected: state.selectedPersona?.id === p.id,
      archived: isArchivedPersona(p),
      personaGens,
      exportStatus,
      chatbotOk: isChatbotSessionPassingForPersona(p),
      lastPackText: formatLastPackStatusText(loadLastCopiedPack(p.id), { empty: '' })
    });

    const lastPackHint = card.querySelector('.portfolio-last-pack');

    // Click on card selects influencer and navigates
    card.querySelector('.btn-quick-select').addEventListener('click', (e) => {
      e.stopPropagation();
      selectPersona(p);
      navigateToTab('persona-engine');
    });

    // W16 — badge export-ready → validador / checklist (no bloquea export)
    card.querySelector('[data-export-status]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openExportReadyFromBadge(p, e.currentTarget.getAttribute('data-export-status'));
    });

    card.querySelector('.btn-quick-copy-pack')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        selectPersona(p);
        await copyFreeChatbotPack('fullbody');
        if (lastPackHint) lastPackHint.textContent = formatLastPackStatusText(loadLastCopiedPack(p.id));
      } catch (err) {
        console.warn('quick copy pack:', err);
        toastError('No se pudo copiar el pack.');
      }
    });

    // W13 — menú Packs (fullbody / bikini / spicy / product)
    const packToggle = card.querySelector('.btn-quick-packs');
    const packList = card.querySelector('.portfolio-pack-menu-list');
    packToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = packList && !packList.hidden;
      document.querySelectorAll('.portfolio-pack-menu-list').forEach((el) => { el.hidden = true; });
      document.querySelectorAll('.btn-quick-packs').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (packList && !open) {
        packList.hidden = false;
        packToggle.setAttribute('aria-expanded', 'true');
      }
    });
    packList?.querySelectorAll('[data-portfolio-pack]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const packId = btn.getAttribute('data-portfolio-pack');
        if (packList) packList.hidden = true;
        packToggle?.setAttribute('aria-expanded', 'false');
        try {
          selectPersona(p);
          await copyFreeChatbotPack(packId);
          if (lastPackHint) lastPackHint.textContent = formatLastPackStatusText(loadLastCopiedPack(p.id));
        } catch (err) {
          console.warn('quick pack menu:', err);
          toastError('No se pudo copiar el pack.');
        }
      });
    });

    card.querySelector('.btn-quick-session')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        selectPersona(p);
        await copyChatbotSessionCheck({ openChecklist: true });
      } catch (err) {
        console.warn('quick session:', err);
        toastError('No se pudo copiar la sesión.');
      }
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

    const thumbImg = card.querySelector('.portfolio-card-img-wrapper img');
    bindPersonaThumbFallback(thumbImg);

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
  document.getElementById('btnPortfolioReady')?.classList.toggle('active', filter === 'ready');
  document.getElementById('btnPortfolioReview')?.classList.toggle('active', filter === 'review');
  document.getElementById('btnPortfolioArchived').classList.toggle('active', filter === 'archived');
  
  updateDashboardStats();
}

/**
 * F6/W14 — Happy path 60s checklist (Resumen).
 * Pasos core: crear → guardar → Copiar JSON (3/3 = listo).
 * Boceto Pollinations es opt-in aparte — no se marca por copiar JSON.
 */
function getHappyPathStatus() {
  const personas = Array.isArray(state.personas) ? state.personas : [];
  const hasAny = personas.length > 0;
  const hasActive = personas.some(p => !isArchivedPersona(p));
  const totalGens = state.generationStats?.total || 0;
  const hasVariants = Array.isArray(state.activeVariants) && state.activeVariants.length > 0;
  let copied = false;
  try { copied = localStorage.getItem(happyPathCopyStorageKey()) === '1'; } catch (e) {}

  // Gen solo con boceto real — copiar JSON no completa este paso (evita 4/4 mentiroso)
  const genDone = totalGens > 0 || hasVariants;

  return {
    create: hasAny,
    save: hasActive || hasAny,
    gen: genDone,
    copy: copied
  };
}

function markHappyPathCopied() {
  try { localStorage.setItem(happyPathCopyStorageKey(), '1'); } catch (e) {}
  try { markStudioActivation('copy'); } catch (_) {}
  renderHappyPathChecklist();
  try { renderStudioActivation(); } catch (_) {}
}

/** W14 — CTA único según estado (vacío / post-save / listo). */
function renderHappyPathNextCta() {
  const box = document.getElementById('happyPathNextCta');
  if (!box) return;
  const status = getHappyPathStatus();
  const empty = !status.create;

  if (empty) {
    // Un solo cluster de CTAs vive en #emptyRosterPanel del portafolio (polish-2).
    box.style.display = 'block';
    box.innerHTML = `
      <p class="happy-path-next-label">Siguiente paso</p>
      <p class="happy-path-next-title">Crea o importa tu primer influencer</p>
      <p class="happy-path-next-hint">Usa <strong>Crear</strong> / <strong>Importar</strong> en el Portafolio más abajo, o las acciones rápidas (URL / foto / a mano).</p>
    `;
    return;
  } else if (!status.copy) {
    box.style.display = 'block';
    const name = state.selectedPersona?.name || state.personas?.[0]?.name || 'tu influencer';
    box.innerHTML = `
      <p class="happy-path-next-label">Siguiente paso</p>
      <p class="happy-path-next-title">Copia el JSON fullbody de «${String(name).replace(/[<>&"]/g, '')}»</p>
      <p class="happy-path-next-hint">Pégalo en ChatGPT / Gemini / Claude free. Gen local no hace falta.</p>
      <div class="empty-roster-actions">
        <button type="button" class="btn btn-sm" data-happy-next="copy-pack" data-offline-highlight="pack">Copiar pack fullbody</button>
      </div>
    `;
  } else {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.querySelectorAll('[data-happy-next]').forEach((btn) => {
    btn.addEventListener('click', () => runHappyPathAction(btn.getAttribute('data-happy-next')));
  });
}

async function runHappyPathAction(action) {
  if (action === 'create') {
    if (isCurrentUserAdmin()) startFounderCreateFlow({ importFlow: false });
    else startMemberCreateFlow();
  } else if (action === 'import') {
    if (isCurrentUserAdmin()) startFounderCreateFlow({ importFlow: true });
    else startMemberImportFlow();
  } else if (action === 'guide') {
    navigateToTab('como-usar');
  } else if (action === 'save') {
    navigateToTab('persona-engine');
    setTimeout(() => {
      const form = document.getElementById('personaForm');
      if (form) form.style.display = 'block';
      document.getElementById('btnSavePersona')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  } else if (action === 'gen') {
    navigateToTab('persona-engine');
    setTimeout(() => {
      document.getElementById('variantManagerSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  } else if (action === 'copy') {
    navigateToTab('persona-engine');
    setTimeout(() => {
      const packBtn = document.getElementById('btnCopyPackFullbodyPrimary')
        || document.querySelector('[data-free-pack="fullbody"]');
      (packBtn || document.querySelector('.pack-library-card'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  } else if (action === 'copy-pack') {
    try {
      if (!state.selectedPersona && state.personas?.[0]) {
        selectPersona(state.personas[0]);
      }
      if (!state.selectedPersona && !document.getElementById('pName')?.value) {
        toastInfo('Guarda un influencer primero; luego Copiar JSON.');
        runHappyPathAction('create');
        return;
      }
      await copyFreeChatbotPack('fullbody');
    } catch (err) {
      console.warn('happy path copy-pack:', err);
      toastError('No se pudo copiar el pack.');
    }
  }
}

function renderHappyPathChecklist() {
  const list = document.getElementById('happyPathChecklist');
  const progress = document.getElementById('happyPathProgress');
  const doneMsg = document.getElementById('happyPathDoneMsg');
  if (!list) return;

  const status = getHappyPathStatus();
  // Orden visual W14: create → save → copy → gen(opcional)
  const coreSteps = ['create', 'save', 'copy'];
  const steps = [...coreSteps, 'gen'];
  let coreDone = 0;
  const rosterEmpty = !status.create;
  steps.forEach(step => {
    const li = list.querySelector(`[data-step="${step}"]`);
    if (!li) return;
    const ok = !!status[step];
    if (ok && coreSteps.includes(step)) coreDone += 1;
    li.classList.toggle('done', ok);
    const check = li.querySelector('.happy-path-check');
    if (check) check.textContent = ok ? '●' : '○';
  });
  // Polish-3: con roster vacío los CTAs viven solo en Portafolio (evita Ir a crear duplicado).
  list.querySelectorAll('.happy-path-step-actions').forEach((el) => {
    el.style.display = rosterEmpty ? 'none' : '';
  });
  // Progreso = 3 pasos core (boceto no cuenta para "listo")
  if (progress) progress.textContent = `${coreDone} / 3`;
  if (doneMsg) doneMsg.style.display = coreDone === 3 ? 'block' : 'none';
  renderHappyPathNextCta();
}

function setupHappyPathChecklist() {
  document.querySelectorAll('[data-happy-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      runHappyPathAction(btn.getAttribute('data-happy-action'));
    });
  });
  renderHappyPathChecklist();
}

/**
 * F4 — Side-by-side ancla vs última variante (imágenes, no prompts A/B).
 */
function updateSideBySideComparator(preferredVariant) {
  const box = document.getElementById('sideBySideComparator');
  const anchorImg = document.getElementById('sbsAnchorImg');
  const variantImg = document.getElementById('sbsVariantImg');
  if (!box || !anchorImg || !variantImg) return;

  const persona = state.selectedPersona;
  const variants = Array.isArray(state.activeVariants) ? state.activeVariants : [];
  const last = preferredVariant || variants[0] || state.lastComparedVariant;
  if (!persona || !last || !last.image_path) {
    box.style.display = 'none';
    state.lastComparedVariant = null;
    return;
  }

  state.lastComparedVariant = last;
  const anchorSrc = persona.image || 'assets/influencer_female.png';
  // Evitar comparar la misma imagen consigo misma
  if (anchorSrc === last.image_path && variants.length < 2) {
    box.style.display = 'none';
    return;
  }

  anchorImg.src = anchorSrc;
  variantImg.src = last.image_path;
  box.style.display = 'block';
}

function setupSideBySideComparator() {
  const hideBtn = document.getElementById('btnSbsHide');
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      const box = document.getElementById('sideBySideComparator');
      if (box) box.style.display = 'none';
    });
  }
  const setMainBtn = document.getElementById('btnSbsSetMain');
  if (setMainBtn) {
    setMainBtn.addEventListener('click', () => {
      const v = state.lastComparedVariant;
      if (v && v.image_path && typeof window.setMainVariantAction === 'function') {
        window.setMainVariantAction(v.image_path, v.id);
      } else {
        toastInfo('Genera una variante primero para poder usarla como ancla.');
      }
    });
  }
}

const QA_CHECKS_KEY_PREFIX = 'influ_qa_checks_';

function qaChecksStorageKey(personaId) {
  return `${QA_CHECKS_KEY_PREFIX}${personaId || 'none'}`;
}

function loadQaChecks(personaId) {
  const api = window.InfluQaMatrix;
  const empty = api?.emptyChecks?.() || { face: false, skin: false, hair: false, body: false, anatomy: false };
  if (!personaId) return empty;
  try {
    const raw = localStorage.getItem(qaChecksStorageKey(personaId));
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch (_) {
    return empty;
  }
}

function saveQaChecks(personaId, checks) {
  if (!personaId) return;
  try {
    localStorage.setItem(qaChecksStorageKey(personaId), JSON.stringify(checks || {}));
  } catch (_) {}
}

let _qaMatrixRenderSeq = 0;

async function renderQaMatrix() {
  const panel = document.getElementById('qaMatrixPanel');
  const slotsEl = document.getElementById('qaMatrixSlots');
  const checksEl = document.getElementById('qaMatrixChecks');
  const scoreEl = document.getElementById('qaMatrixScore');
  const api = window.InfluQaMatrix;
  if (!panel || !slotsEl || !checksEl || !api) return;

  const persona = state.selectedPersona;
  if (!persona?.id) {
    panel.style.display = 'none';
    return;
  }

  const renderSeq = ++_qaMatrixRenderSeq;
  const personaId = persona.id;
  panel.style.display = 'block';
  let generations = [];
  try {
    const res = await authFetch(`/api/personas/${personaId}/generations`);
    if (res.ok) {
      const data = await res.json();
      generations = data.generations || data || [];
    }
  } catch (_) {}

  // Evitar sobrescribir si el usuario cambió de persona o hubo otro render
  if (renderSeq !== _qaMatrixRenderSeq || state.selectedPersona?.id !== personaId) return;

  const slots = api.pickQaMatrixSlots(persona, state.activeVariants || [], generations);
  const defs = api.SLOT_DEFS;

  slotsEl.innerHTML = defs.map((def) => {
    const slot = slots[def.id];
    if (slot?.image_path) {
      return `
        <div class="qa-slot">
          <div class="qa-slot-label">${escapeLockHtml(def.label)}</div>
          <img src="${escapeLockHtml(slot.image_path)}" alt="${escapeLockHtml(def.label)}" loading="lazy">
        </div>`;
    }
    const packBtn = def.pack
      ? `<button type="button" class="btn btn-secondary btn-sm" data-qa-pack="${def.pack}" style="font-size:10px;padding:6px 8px;">Copiar pack</button>`
      : `<button type="button" class="btn btn-secondary btn-sm" data-qa-goto-gen style="font-size:10px;padding:6px 8px;">Generar variante</button>`;
    return `
      <div class="qa-slot">
        <div class="qa-slot-label">${escapeLockHtml(def.label)}</div>
        <div class="qa-slot-empty">
          <span>Sin imagen aún</span>
          ${packBtn}
        </div>
      </div>`;
  }).join('');

  const checks = loadQaChecks(persona.id);
  checksEl.innerHTML = api.CHECKS.map((c) => `
    <label class="qa-check">
      <input type="checkbox" data-qa-check="${c.id}" ${checks[c.id] ? 'checked' : ''}>
      ${escapeLockHtml(c.label)}
    </label>
  `).join('');

  const summary = api.summarizeChecks(checks);
  if (scoreEl) {
    scoreEl.textContent = `${summary.done} / ${summary.total}`;
    scoreEl.classList.toggle('is-ok', summary.allOk);
  }

  const dhashEl = document.getElementById('qaMatrixDhash');
  if (dhashEl) {
    const scored = (state.activeVariants || []).filter((v) => v && v.consistency_distance != null);
    if (!scored.length) {
      dhashEl.textContent = 'dHash —';
      dhashEl.className = 'qa-matrix-dhash';
    } else {
      const avg = scored.reduce((a, v) => a + Number(v.consistency_distance), 0) / scored.length;
      let worst = 'ok';
      for (const v of scored) {
        if (v.consistency_grade === 'bad') worst = 'bad';
        else if (v.consistency_grade === 'warn' && worst !== 'bad') worst = 'warn';
      }
      dhashEl.textContent = `dHash ~${avg.toFixed(1)} · ${scored.length} var.`;
      dhashEl.className = `qa-matrix-dhash is-${worst}`;
      dhashEl.title = 'Promedio distancia dHash vs imagen ancla (composición/color). No es face-lock.';
    }
  }

  slotsEl.querySelectorAll('[data-qa-pack]').forEach((btn) => {
    btn.addEventListener('click', () => copyFreeChatbotPack(btn.getAttribute('data-qa-pack')));
  });
  slotsEl.querySelector('[data-qa-goto-gen]')?.addEventListener('click', () => {
    document.getElementById('variantManagerSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  checksEl.querySelectorAll('[data-qa-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const next = loadQaChecks(persona.id);
      next[input.getAttribute('data-qa-check')] = !!input.checked;
      saveQaChecks(persona.id, next);
      const sum = api.summarizeChecks(next);
      if (scoreEl) {
        scoreEl.textContent = `${sum.done} / ${sum.total}`;
        scoreEl.classList.toggle('is-ok', sum.allOk);
      }
      if (sum.allOk) toastSuccess('QA OK: cara, tez y pelo base alineados');
    });
  });
}

function setupQaMatrix() {
  window.renderQaMatrix = renderQaMatrix;
  const btn = document.getElementById('btnRescoreConsistency');
  if (btn && btn.dataset.bound !== '1') {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const personaId = state.selectedPersona?.id;
      if (!personaId) return;
      btn.disabled = true;
      try {
        const res = await authFetch(`/api/personas/${personaId}/consistency/rescore`, {
          method: 'POST',
          body: JSON.stringify({ onlyMissing: false })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error al recalcular');
        state.activeVariants = data.variants || state.activeVariants;
        renderVariantVaultGrid();
        renderQaMatrix();
        const avg = data.summary?.avgDistance;
        toastSuccess(
          avg != null
            ? `dHash recalculado (promedio ${avg}). Señal de composición/color, no face-lock.`
            : 'dHash recalculado.'
        );
      } catch (err) {
        toastError(err.message || 'No se pudo recalcular dHash');
      } finally {
        btn.disabled = false;
      }
    });
  }
}

let _facePackRenderSeq = 0;

function facePackThumbUrl(imagePath) {
  if (!imagePath) return '';
  const s = String(imagePath);
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith('/') ? s : `/${s.replace(/^\.\//, '')}`;
}

async function renderFacePack() {
  const panel = document.getElementById('facePackPanel');
  const slotsEl = document.getElementById('facePackSlots');
  const statusEl = document.getElementById('facePackStatus');
  if (!panel || !slotsEl) return;

  const persona = state.selectedPersona;
  if (!persona?.id) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const renderSeq = ++_facePackRenderSeq;

  // Optimistic empty slots from client module while API loads
  const localSlots = (typeof InfluFacePack !== 'undefined' && InfluFacePack.FACE_PACK_SLOTS)
    ? InfluFacePack.FACE_PACK_SLOTS
    : [];
  if (!slotsEl.dataset.hydrated) {
    slotsEl.innerHTML = localSlots.map((s) => `
      <div class="face-pack-slot" data-slot="${s.id}" style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.2);min-height:96px;">
        <div style="aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:10px;padding:6px;text-align:center;">${s.title}</div>
      </div>`).join('');
  }

  try {
    const res = await authFetch(`/api/personas/${persona.id}/anchor-pack`);
    const data = await res.json();
    if (renderSeq !== _facePackRenderSeq || state.selectedPersona?.id !== persona.id) return;
    if (!data.success) throw new Error(data.error || 'No se pudo cargar face pack');

    const slots = data.slots || [];
    slotsEl.dataset.hydrated = '1';
    slotsEl.innerHTML = slots.map((s) => {
      const img = s.image_path
        ? `<img src="${facePackThumbUrl(s.image_path)}" alt="${s.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;object-position:top;" />`
        : `<span style="font-size:10px;color:var(--text-muted);padding:6px;text-align:center;line-height:1.3;">${s.title}<br/><span style="opacity:.7">sin boceto</span></span>`;
      return `<div class="face-pack-slot" data-slot="${s.id}" title="${s.short || s.title}" style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.2);">
        <div style="aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;">${img}</div>
        <div style="font-size:9px;padding:4px 6px;color:var(--text-secondary);text-align:center;border-top:1px solid rgba(255,255,255,0.06);">${s.title}</div>
      </div>`;
    }).join('');

    if (statusEl) {
      statusEl.textContent = data.summary?.label || '—';
      statusEl.style.color = data.summary?.complete ? '#34d399' : 'var(--text-muted)';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Error al cargar';
    console.warn('[face-pack] render:', err.message);
  }
}

async function copyFacePackText() {
  try {
    let text = '';
    if (typeof InfluFacePack !== 'undefined' && InfluFacePack.buildFacePackChatbotText) {
      text = InfluFacePack.buildFacePackChatbotText(getFullPersonaJSON(), {
        fallbackName: state.selectedPersona?.name
      });
    } else if (state.selectedPersona?.id) {
      const res = await authFetch(`/api/personas/${state.selectedPersona.id}/face-pack.txt`);
      text = await res.text();
    } else {
      throw new Error('Selecciona un influencer');
    }
    await navigator.clipboard.writeText(text);
    toastSuccess('Face pack (6 ángulos) copiado — pégalo en chatbot free');
  } catch (err) {
    console.error(err);
    toastError(err.message || 'No se pudo copiar el face pack');
  }
}

async function regenerateFacePackSketches() {
  const personaId = state.selectedPersona?.id;
  if (!personaId) {
    toastError('Selecciona un influencer');
    return;
  }
  try {
    const res = await authFetch(`/api/personas/${personaId}/face-pack/regenerate`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error al encolar');
    toastInfo(data.message || 'Bocetos en cola (Pollinations opt-in)');
    setTimeout(() => { try { renderFacePack(); } catch (_) {} }, 4000);
  } catch (err) {
    toastError(err.message || 'No se pudo encolar el face pack');
  }
}

function setupFacePack() {
  window.renderFacePack = renderFacePack;
  window.copyFacePackText = copyFacePackText;
  document.getElementById('btnCopyFacePackText')?.addEventListener('click', (e) => {
    e.preventDefault();
    copyFacePackText();
  });
  document.getElementById('btnRefreshFacePack')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderFacePack();
  });
  document.getElementById('btnRegenFacePack')?.addEventListener('click', (e) => {
    e.preventDefault();
    regenerateFacePackSketches();
  });
}

/** Alias legacy — QueuePoller / import llamaban loadPersonaVariants */
function loadPersonaVariants(personaId) {
  return loadVariantsForPersona(personaId);
}
window.loadPersonaVariants = loadPersonaVariants;

function setGenerationButtonsDisabled(disabled) {
  // JSON-first: Guardar (sin retrato) nunca se bloquea por la cola Pollinations
  // W8/W15: modo offline también bloquea gens; packs quedan resaltados
  const offline = typeof isStudioOfflineMode === 'function' && isStudioOfflineMode();
  const rateLimited = typeof isRateLimitActiveUi === 'function' && isRateLimitActiveUi();
  const locked = !!(disabled || offline);
  ['btnGenerateVariant', 'btnGenerateUgcImage', 'btnSavePersonaWithPortrait', 'btnStartBulkAdGeneration'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = locked;
    el.classList.toggle('is-queue-locked', locked);
    if (offline) el.setAttribute('title', 'Modo offline: usa Copiar JSON');
    else if (disabled) el.setAttribute('title', 'Espera a que termine la cola de generación');
    else if (rateLimited) el.setAttribute('title', '429 reciente — mejor Copiar JSON o activa Modo offline');
    else el.setAttribute('title', 'Generar boceto (opt-in · puede pedir token) — Pollinations opcional');
  });
  const highlightPacks = offline || rateLimited;
  document.querySelectorAll('[data-offline-highlight="pack"]').forEach((el) => {
    el.classList.toggle('offline-pack-highlight', highlightPacks);
  });
}

/** W15 — último estado 429 conocido (solo UI; no cambia la cola). */
let _rateLimitUiActive = false;
function isRateLimitActiveUi() {
  return !!_rateLimitUiActive;
}

function offlineModeStorageKey() {
  const pid = state.currentProfile?.id || 'default';
  return `influ_offline_mode_${pid}`;
}

function isStudioOfflineMode() {
  try {
    return localStorage.getItem(offlineModeStorageKey()) === '1';
  } catch (_) {
    return false;
  }
}

function setStudioOfflineMode(on) {
  try {
    localStorage.setItem(offlineModeStorageKey(), on ? '1' : '0');
  } catch (_) {}
  applyOfflineModeUi();
}

function applyOfflineModeUi() {
  const on = isStudioOfflineMode();
  const toggle = document.getElementById('offlineModeToggle');
  const toggleBar = document.getElementById('offlineModeToggleBar');
  const chip = document.getElementById('offlineModeChip');
  const chipText = document.getElementById('offlineModeChipText');
  if (toggle) toggle.checked = on;
  if (toggleBar) toggleBar.checked = on;
  if (chip) chip.classList.toggle('is-on', on);
  if (chipText) chipText.textContent = on ? 'Offline · on' : 'Offline';
  const banner = document.getElementById('offlineBanner');
  // Idea #5: el modo offline es chip; el banner solo para red/API caídos
  if (on) {
    if (banner && banner.dataset.source === 'mode') {
      setOfflineBanner(false);
      banner.dataset.source = '';
    }
  } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setOfflineBanner(true, 'Navegador offline — puedes copiar JSON ya cargado; generación Pollinations pausada.');
    if (banner) banner.dataset.source = 'network';
  } else if (banner && banner.dataset.source === 'mode') {
    setOfflineBanner(false);
    banner.dataset.source = '';
  }
  setGenerationButtonsDisabled(false);
  if (on) setGenerationButtonsDisabled(true);
}

function updateRateLimitBanner(q) {
  const banner = document.getElementById('rateLimitBanner');
  const text = document.getElementById('rateLimitBannerText');
  if (!banner) return;
  const isCooling = !!(q && (q.isCoolingDown || q.rateLimitActive));
  _rateLimitUiActive = isCooling;
  if (!isCooling) {
    banner.style.display = 'none';
    // Quitar highlight de packs si no estamos en offline
    if (!isStudioOfflineMode()) {
      document.querySelectorAll('[data-offline-highlight="pack"]').forEach((el) => {
        el.classList.remove('offline-pack-highlight');
      });
    }
    return;
  }
  // 429 takes priority UX; hide pollen banner while cooling
  setPollenBanner(false);
  const cooldownSec = Math.ceil((q.cooldownRemainingMs || 0) / 1000) || q.retryAfterSeconds || 30;
  if (text) {
    text.textContent = `Pollinations 429 — cola en pausa (~${cooldownSec}s). Sugerencia: Modo offline + Copiar JSON.`;
  }
  banner.style.display = 'flex';
  // W15 — enfatizar packs durante 429 (sin cambiar defaults de cola)
  document.querySelectorAll('[data-offline-highlight="pack"]').forEach((el) => {
    el.classList.add('offline-pack-highlight');
  });
}

/** Detecta 401/402 / pollen / token faltante (distinto de 429). */
function isPollenAuthError(data, err) {
  if (data && (data.paymentRequired || data.authRequired)) return true;
  const status = data?.status || err?.status;
  if (status === 401 || status === 402) return true;
  const m = String(data?.message || err?.message || '');
  return /pollen|pollinations_token|402|401|insufficient balance|no autorizado|bearer|enter\.pollinations|payment required|auth required/i.test(m);
}

function setPollenBanner(on, message) {
  const banner = document.getElementById('pollenBanner');
  const text = document.getElementById('pollenBannerText');
  if (!banner) return;
  if (!on) {
    banner.style.display = 'none';
    return;
  }
  if (text) {
    text.textContent = message
      ? String(message).slice(0, 220)
      : 'Boceto Pollinations necesita token (pollen). Path free = Copiar JSON. Opcional: Ajustes → token.';
  }
  banner.style.display = 'flex';
  document.querySelectorAll('[data-offline-highlight="pack"]').forEach((el) => {
    el.classList.add('offline-pack-highlight');
  });
}

/** Toast + CTA Copiar JSON / Ajustes cuando el boceto falla por token/pollen. */
function notifyGenerationFailure(data, err) {
  const msg = (data && data.message) || (err && err.message) || 'La generación falló.';
  if (data?.rateLimited || /429|rate limit|límite/i.test(msg)) {
    toastError(msg);
    return;
  }
  if (isPollenAuthError(data, err)) {
    setPollenBanner(true, msg);
    toastError('Boceto necesita token (pollen). El producto gratis es Copiar JSON — o pega el token en Ajustes.', {
      actionLabel: 'Copiar JSON',
      onAction: () => {
        if (typeof copyFreeChatbotPack === 'function') copyFreeChatbotPack('fullbody');
      }
    });
    return;
  }
  toastError(msg);
}

function updateQueueStatusChip(q) {
  const chip = document.getElementById('queueStatusChip');
  const text = document.getElementById('queueStatusChipText');
  updateRateLimitBanner(q);
  if (!chip || !text) return;

  const isCooling = q.isCoolingDown || q.rateLimitActive;
  const pending = q.pendingCount ?? q.queueLength ?? 0;
  const busy = !!(q.active || q.busy);
  const cooldownSec = isCooling
    ? (Math.ceil((q.cooldownRemainingMs || 0) / 1000) || q.retryAfterSeconds || 30)
    : 0;
  const pos = q.position || null;
  const total = q.totalInWave || (pending + (busy ? 1 : 0)) || null;

  if (!busy && pending === 0 && !isCooling) {
    chip.style.display = 'none';
    chip.classList.remove('cooling', 'busy');
    return;
  }

  chip.style.display = 'flex';
  chip.classList.toggle('cooling', !!isCooling);
  chip.classList.toggle('busy', !!busy && !isCooling);
  if (isCooling) {
    text.textContent = `429 — reintento en ${cooldownSec}s`;
  } else if (pos && total) {
    text.textContent = `#${pos} de ${total}${q.currentLabel ? ` · ${q.currentLabel}` : ''}`;
  } else if (pending > 0) {
    text.textContent = `Cola: ${pending + (busy ? 1 : 0)} en espera`;
  } else {
    text.textContent = q.currentLabel ? `Generando: ${q.currentLabel}` : 'Generando imagen…';
  }
}

function navigateToTab(tabId) {
  const resolved = resolveStudioTab(tabId);
  try { applyCurrentWorkMode(); } catch (_) {}
  const panel = document.getElementById(resolved);
  if (panel && panel.classList.contains('tab-panel')) {
    switchStudioTab(resolved);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const navItem = Array.from(document.querySelectorAll('.nav-item, .hub-subnav-btn, .mobile-nav-item'))
    .find(el => el.getAttribute('data-tab') === resolved || el.getAttribute('data-tab') === tabId);
  if (navItem) navItem.click();
}

function setupComoUsarGuide() {
  const openGuide = () => navigateToTab('como-usar');
  document.getElementById('btnOpenComoUsar')?.addEventListener('click', openGuide);
  document.getElementById('btnDashboardComoUsar')?.addEventListener('click', openGuide);

  document.querySelectorAll('[data-guide-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-guide-action');
      if (action === 'create') {
        navigateToTab('persona-engine');
        setTimeout(() => {
          const nicheBtn = document.querySelector('[data-niche="beauty"]');
          if (nicheBtn) nicheBtn.click();
          else document.getElementById('cardCreateScratch')?.click();
        }, 80);
      } else if (action === 'portfolio') {
        navigateToTab('dashboard');
        setTimeout(() => {
          document.getElementById('dashboardPersonaGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } else if (action === 'packs') {
        navigateToTab('persona-engine');
        setTimeout(() => {
          if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: false });
          const target = document.getElementById('btnCopyPackFullbodyPrimary')
            || document.querySelector('.pack-library-card')
            || document.querySelector('[data-free-pack="fullbody"]');
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      } else if (action === 'kit') {
        navigateToTab('persona-engine');
        setTimeout(() => {
          if (typeof exportPersonaZipPack === 'function' && (state.selectedPersona || state.personas[0])) {
            exportPersonaZipPack({ kit: true });
          } else {
            toastInfo('Crea o selecciona un influencer y pulsa «Descargar kit marca».');
            document.getElementById('btnExportBrandKitSheet')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);
      } else if (action === 'checklist') {
        navigateToTab('dashboard');
        setTimeout(() => {
          document.getElementById('happyPathCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    });
  });
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
  setInputValue('pDistinctiveMarks', f.distinctive_marks);
  setInputValue('pFacialAsymmetry', f.facial_asymmetry);
  
  if (details.personality) {
    setInputValue('pMbti', details.personality.mbti);
    setInputValue('pCommunicationStyle', details.personality.communication_style);
    if (details.personality.taboos) {
      setInputValue('pTaboos', Array.isArray(details.personality.taboos) ? details.personality.taboos.join(', ') : details.personality.taboos);
    }
  }

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
  state.activeNicheId = null;
  if (typeof setStep2Focus === 'function') setStep2Focus(false, { updateHint: false });
  setUploadedImagePath(null);

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
    btnSave.textContent = "Crear influencer";
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

  const nicheHint = document.getElementById('nichePresetHint');
  if (nicheHint) { nicheHint.style.display = 'none'; nicheHint.textContent = ''; }
  document.querySelectorAll('.niche-preset-btn').forEach(btn => btn.classList.remove('active'));

  // Clear basic inputs & suggest trendy name
  const trendyNames = ["Clara", "Sofía", "Valentina", "Martina", "Elena", "Paula", "Lucía", "Mateo", "Lucas", "Adrián", "Javier", "Thiago"];
  const randomName = trendyNames[Math.floor(Math.random() * trendyNames.length)];
  document.getElementById('pName').value = randomName;
  document.getElementById('pGender').value = 'Female';
  document.getElementById('pAge').value = '25 años';
  // Default honesto: evita warning Latina + tez clara (idea #2)
  document.getElementById('pEthnicity').value = 'Latina de tez clara';
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
  setIf('pDistinctiveMarks', 'Peca sutil en el pómulo izquierdo, pequeño lunar natural en el cuello');
  setIf('pFacialAsymmetry', 'Ojo izquierdo ~2% más pequeño, mandíbula izquierda ligeramente más suave');
  setIf('pMbti', 'ENFP - El Entusiasta Creativo');
  setIf('pCommunicationStyle', 'Cálido, cercano, usa emojis moderados y hace preguntas a la audiencia');
  setIf('pTaboos', 'No promociona fast fashion, No usa lenguaje agresivo, No habla de temas políticos controversiales');

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
    usageNotesEl.textContent = "Completa los campos de la izquierda y haz clic en «Crear influencer» para generar la biblia.";
  }

  // Scroll smoothly to form
  const editorLayout = document.querySelector('.editor-layout');
  if (editorLayout) {
    editorLayout.scrollIntoView({ behavior: 'smooth' });
  }

  // UX-2: sincronizar paso 1 + data-form-open / data-creating
  if (personaForm) {
    personaForm.classList.remove('u-hidden');
    personaForm.style.display = 'flex';
  }
  if (typeof setPersonaStep === 'function') setPersonaStep(1, { scroll: false });

  // Corte E — ofrecer borrador tras abrir el formulario (perfil ya conocido)
  try { maybeOfferPersonaDraft(); } catch (_) {}
}

// Select Persona
function selectPersona(persona) {
  if (!persona) return;
  try { applyCurrentWorkMode(); } catch (_) {}
  const prevId = state.selectedPersona?.id;
  // Selecting an existing persona always exits pure "create new" mode
  state.isCreatingNewPersona = false;
  state.selectedPersona = persona;
  // Cambiar de influencer sale del modo «primer JSON»
  if (state.step2FocusMode && prevId && persona.id && String(prevId) !== String(persona.id)) {
    setStep2Focus(false, { updateHint: false });
  }
  setUploadedImagePath(null); // Clear upload session when selecting another persona
  state.activeNicheId = null;
  try {
    let d = persona.detailedJSON;
    if (typeof d === 'string') d = JSON.parse(d);
    const raw = d?.niche || d?.character_lock?.niche || d?.brand_niche || null;
    if (raw && window.InfluNichePresets?.getNichePreset?.(raw)) state.activeNicheId = raw;
    else if (/beauty|skincare/i.test(String(raw || d?.identity?.persona_archetype || ''))) state.activeNicheId = 'beauty';
    else if (/fit|gym|wellness/i.test(String(raw || ''))) state.activeNicheId = 'fitness';
    else if (/moda|fashion|ootd/i.test(String(raw || ''))) state.activeNicheId = 'moda';
  } catch (_) {}

  const createBanner = document.getElementById('createModeBanner');
  if (createBanner) createBanner.style.display = 'none';
  
  // Reset editor title and save button text
  const editorTitle = document.getElementById('editorHeaderTitle');
  if (editorTitle) {
    editorTitle.textContent = "Configuración del Personaje";
  }
  const btnSave = document.getElementById('btnSavePersona');
  if (btnSave) {
    btnSave.textContent = "Guardar personaje";
    delete btnSave.dataset.createMode;
  }

  updateDashboardStats();
  renderPersonaGrids();
  populateActiveUgcData();
  updateLicensingCalculator();
  if (typeof updateActivePersonaChip === 'function') updateActivePersonaChip();
  if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: false });
  
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
  setInputValue(
    'pSkinToneHex',
    detailed.facial_features?.skin_tone_hex
      || detailed.character_lock?.must_match_every_image?.skin_tone_hex
      || '#f0d5c0'
  );
  setInputValue('pSkinTexture', detailed.facial_features?.skin_texture || 'Piel suave con poros y pecas muy sutiles');
  setInputValue('pEyebrows', detailed.facial_features?.eyebrows || detailed.facial_features?.eyebrow_style || 'Cejas castañas oscuras y pobladas');
  setInputValue('pLips', detailed.facial_features?.lips || (detailed.facial_features?.lip_color ? `${detailed.facial_features.lip_color} ${detailed.facial_features.lip_shape || ''}` : '') || 'Labios rosados naturales carnosos');
  setInputValue('pHairColor', detailed.hair?.color || 'Castaño oscuro natural');
  setInputValue('pHairTexture', detailed.hair?.texture || 'Ondulado natural con cuerpo');
  setInputValue('pHairLength', detailed.hair?.length || 'Largo, por debajo de los hombros');
  setInputValue('pEyeColor', detailed.facial_features?.eye_color || 'Marrón cálido con destellos miel');
  setInputValue('pFaceShape', detailed.facial_features?.face_shape || 'Ovalada con mandíbula definida');
  setInputValue('pSmileType', detailed.facial_features?.smile_type || 'Sonrisa cálida, accesible y natural');
  setInputValue('pDistinctiveMarks', detailed.facial_features?.distinctive_marks || 'Peca sutil en el pómulo izquierdo, pequeño lunar natural en el cuello');
  setInputValue('pFacialAsymmetry', detailed.facial_features?.facial_asymmetry || detailed.character_lock?.must_match_every_image?.facial_asymmetry || 'Ojo izquierdo ~2% más pequeño, mandíbula izquierda ligeramente más suave');
  setInputValue('pMbti', detailed.personality?.mbti || 'ENFP - El Entusiasta Creativo');
  setInputValue('pCommunicationStyle', detailed.personality?.communication_style || 'Cálido, cercano, usa emojis moderados y hace preguntas a la audiencia');
  const taboos = detailed.personality?.taboos;
  setInputValue('pTaboos', taboos ? (Array.isArray(taboos) ? taboos.join(', ') : taboos) : 'No promociona fast fashion, No usa lenguaje agresivo, No habla de temas políticos controversiales');
  
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
  if (typeof refreshLoraInferenceStatus === 'function') refreshLoraInferenceStatus();

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

  // Matriz QA: mostrar panel enseguida (slots se rellenan al cargar variantes/gens)
  try { renderQaMatrix(); } catch (_) {}
  try { renderFacePack(); } catch (_) {}

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
  try { refreshChatbotSessionSheetStatus(); } catch (_) {}
  try { refreshLockRevisions(); } catch (_) {}
  try { refreshLockLab(); } catch (_) {}
  try { renderStudioActivation(); } catch (_) {}
  try { refreshLastPackStatus(); } catch (_) {}
}

// Render Select grids in tabs
function renderPersonaGrids() {
  const selectGrid = document.getElementById('personaSelectGrid');
  if (!selectGrid) return;
  selectGrid.innerHTML = '';
  
  const isArchivedMode = state.personaFilter === 'archived';
  const filtered = state.personas.filter(p => isArchivedMode ? isArchivedPersona(p) : !isArchivedPersona(p));
  
  const cardApi = (typeof InfluPersonaCard !== 'undefined' ? InfluPersonaCard : window.InfluPersonaCard);
  filtered.forEach(p => {
    const card = cardApi.buildSelectPersonaCard(p, {
      selected: state.selectedPersona?.id === p.id,
      thumbSrc: personaThumbSrc(p),
      bindThumbFallback: bindPersonaThumbFallback,
      onClick: (persona) => selectPersona(persona)
    });
    selectGrid.appendChild(card);
  });
}

// ─── Unified toast / QueuePoller (UX-4 → studio-toast.js / queue-poller.js) ─
const _toastApi = (typeof InfluStudioToast !== 'undefined'
  ? InfluStudioToast
  : (typeof window !== 'undefined' ? window.InfluStudioToast : null)
).createStudioToast({
  getBanner: () => syncBanner || document.getElementById('syncBanner'),
  getTextEl: () => syncBannerText || document.getElementById('syncBannerText'),
  getIconEl: () => document.getElementById('syncBannerIcon'),
  getGitIndicator: () => gitIndicator,
  getGitStatusText: () => gitStatusText
});
const showAppToast = (...args) => _toastApi.showAppToast(...args);
const toastSuccess = (...args) => _toastApi.toastSuccess(...args);
const toastError = (...args) => _toastApi.toastError(...args);
const toastInfo = (...args) => _toastApi.toastInfo(...args);
const toastLoading = (...args) => _toastApi.toastLoading(...args);

const QueuePoller = (typeof InfluQueuePoller !== 'undefined'
  ? InfluQueuePoller
  : window.InfluQueuePoller
).createQueuePoller({
  authFetch: (...args) => authFetch(...args),
  showAppToast: (...args) => showAppToast(...args),
  setGenerationButtonsDisabled: (...args) => setGenerationButtonsDisabled(...args),
  updateQueueStatusChip: (...args) => updateQueueStatusChip(...args),
  getState: () => state,
  loadVariantsForPersona: (id) => {
    if (typeof loadVariantsForPersona === 'function') return loadVariantsForPersona(id);
  }
});
window.QueuePoller = QueuePoller;

// ─── Photo upload UI (UX extract → photo-upload-ui.js) ───────────────────────
const _photoAnalysisApi = (typeof InfluPhotoAnalysis !== 'undefined'
  ? InfluPhotoAnalysis
  : (typeof window !== 'undefined' ? window.InfluPhotoAnalysis : null));
if (!_photoAnalysisApi) console.error('[photo] photo-analysis.js no cargado');

const PhotoUploadUi = (typeof InfluPhotoUploadUi !== 'undefined'
  ? InfluPhotoUploadUi
  : window.InfluPhotoUploadUi
).createPhotoUploadUi({
  authFetch: (...args) => authFetch(...args),
  toastInfo: (...args) => toastInfo(...args),
  toastSuccess: (...args) => toastSuccess(...args),
  toastError: (...args) => toastError(...args),
  toastLoading: (...args) => toastLoading(...args),
  QueuePoller,
  setGitSyncingState: (...args) => setGitSyncingState(...args),
  getState: () => state,
  refreshPersonaLists: (...args) => refreshPersonaLists(...args),
  selectPersona: (...args) => selectPersona(...args),
  populateActiveUgcData: (...args) => populateActiveUgcData(...args),
  updateClothingDropdown: (...args) => updateClothingDropdown(...args),
  compilePromptAndJSON: (...args) => compilePromptAndJSON(...args),
  buildPromptFromAnalysis: (data) => _promptBuilder().buildPromptFromAnalysis(data),
  photoAnalysis: _photoAnalysisApi,
  applyAnalysisToFormFields: (analysis) => {
    const formApi = (typeof InfluPersonaForm !== 'undefined' ? InfluPersonaForm : window.InfluPersonaForm);
    return formApi.applyAnalysisToFormFields(analysis);
  }
});

const setupPhotoUpload = (...args) => PhotoUploadUi.setupPhotoUpload(...args);
const handlePhotoUrl = (...args) => PhotoUploadUi.handlePhotoUrl(...args);
const handlePhotoFile = (...args) => PhotoUploadUi.handlePhotoFile(...args);
const resetUploadDropzone = (...args) => PhotoUploadUi.resetUploadDropzone(...args);
const uploadToServer = (...args) => PhotoUploadUi.uploadToServer(...args);
const runPhotoAnalysis = (...args) => PhotoUploadUi.runPhotoAnalysis(...args);
const displayAnalysisResults = (...args) => PhotoUploadUi.displayAnalysisResults(...args);
const renderColorSwatches = (...args) => PhotoUploadUi.renderColorSwatches(...args);
const renderAnalysisDetailGrid = (...args) => PhotoUploadUi.renderAnalysisDetailGrid(...args);
const applyAnalysisToForm = (...args) => PhotoUploadUi.applyAnalysisToForm(...args);
const saveAnalysisAsPersona = (...args) => PhotoUploadUi.saveAnalysisAsPersona(...args);
const getAnalysisResult = () => PhotoUploadUi.getAnalysisResult();
const setAnalysisResult = (v) => PhotoUploadUi.setAnalysisResult(v);
const getUploadedImagePath = () => PhotoUploadUi.getUploadedImagePath();
const setUploadedImagePath = (v) => PhotoUploadUi.setUploadedImagePath(v);
/** Inline onclick in HTML / dropzone preview — must stay on window. */
window.resetUploadDropzone = resetUploadDropzone;

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
/** Prompt builders viven en prompt-builder.js (W5b). */
function _promptBuilder() {
  const api = typeof window !== 'undefined' ? window.InfluPromptBuilder : null;
  if (!api) throw new Error('prompt-builder.js no cargado');
  return api;
}

function parseDetailedJSON(raw) {
  return _promptBuilder().parseDetailedJSON(raw);
}

function isRealPersonaObject(obj) {
  return _promptBuilder().isRealPersonaObject(obj);
}

function getFullPersonaJSON() {
  let base = {};
  
  // 1. Start with the richest source (analysisResult or stored detailedJSON)
  // IMPORTANT: only treat as object if it's a real persona object (not a string / char-map)
  const analysisResult = getAnalysisResult();
  if (analysisResult && isRealPersonaObject(analysisResult)) {
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
  
  // 3. Overwrite with live form values (UX-4 readPersonaForm)
  const formApi = (typeof InfluPersonaForm !== 'undefined' ? InfluPersonaForm : window.InfluPersonaForm);
  const f = formApi.readPersonaForm();
  const p = state.selectedPersona || {};
  const bodyType = f.bodyType || base.body.body_type || base.identity.body_type || p.body_type || 'Atlético y proporcionado';
  const height = f.height || base.body.height_appearance || 'Estatura media (~1.65 m)';
  const proportions = f.proportions || base.body.proportions || 'Hombros equilibrados, cintura definida, caderas suaves y proporcionales';
  const posture = f.posture || base.body.posture || 'Erguida y relajada';
  const fitness = f.fitness || base.body.fitness_level || 'Tono natural ligero';
  const bodySkin = f.bodySkin || base.body.skin_continuity || 'Mismo tono de piel en rostro, cuello, hombros y brazos';
  
  base.identity.name = f.name || base.identity.name || p.name || 'Influencer';
  base.identity.gender = f.gender || base.identity.gender || p.gender || 'Female';
  base.identity.apparent_age = f.age || base.identity.apparent_age || p.age || '25 años';
  base.identity.ethnicity_appearance = f.ethnicity || base.identity.ethnicity_appearance || p.ethnicity || 'Mixta';
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
  base.facial_features.face_shape = f.faceShape || base.facial_features.face_shape || 'Ovalada';
  base.facial_features.skin_tone = f.skinTone || base.facial_features.skin_tone || 'Piel clara';
  base.facial_features.skin_texture = f.skinTexture || base.facial_features.skin_texture || 'Suave';
  {
    const hexInput = (f.skinToneHex || '').trim();
    if (hexInput) {
      const normalized = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
      if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
        base.facial_features.skin_tone_hex = normalized.toLowerCase();
      }
    } else if (!base.facial_features.skin_tone_hex) {
      // Heurística free: tez clara → hex por defecto (anti-sesgo)
      if (/clara|fair|light|porcelana|beige/i.test(base.facial_features.skin_tone || '')) {
        base.facial_features.skin_tone_hex = '#f0d5c0';
      }
    }
  }
  base.facial_features.eye_color = f.eyeColor || base.facial_features.eye_color || 'Marrón';
  
  const eyebrowsVal = f.eyebrows || base.facial_features.eyebrow_style || base.facial_features.eyebrows || 'Cejas naturales';
  base.facial_features.eyebrow_style = eyebrowsVal;
  base.facial_features.eyebrows = eyebrowsVal;

  const lipsVal = f.lips || base.facial_features.lip_shape || base.facial_features.lips || 'Labios rosados';
  base.facial_features.lip_shape = lipsVal;
  base.facial_features.lips = lipsVal;

  base.facial_features.smile_type = f.smileType || base.facial_features.smile_type || 'Natural';
  if (f.distinctiveMarks) base.facial_features.distinctive_marks = f.distinctiveMarks;
  if (f.facialAsymmetry) base.facial_features.facial_asymmetry = f.facialAsymmetry;
  
  base.hair.color = f.hairColor || base.hair.color || 'Castaño';
  base.hair.texture = f.hairTexture || base.hair.texture || 'Ondulado';
  base.hair.length = f.hairLength || base.hair.length || 'Largo';

  const hairStyleVal = f.hair || base.hair.style || base.hair.details || p.hair || '';
  base.hair.style = hairStyleVal;
  base.hair.details = hairStyleVal;
  
  base.aesthetic.overall_vibe = f.style || base.aesthetic.overall_vibe || p.style || 'Natural';

  const fashionVal = f.clothing || base.aesthetic.fashion_style || base.aesthetic.clothing_type || p.clothing || '';
  base.aesthetic.fashion_style = fashionVal;
  base.aesthetic.clothing_type = fashionVal;
  if (!base.clothing.type) base.clothing.type = fashionVal;
  
  base.photography.camera_lens = f.camera || base.photography.camera_lens || p.camera || 'iPhone';
  base.photography.lighting_type = f.lighting || base.photography.lighting_type || p.lighting || 'Luz natural';
  base.photography.background_setting = f.setting || base.photography.background_setting || p.setting || 'Fondo neutro';
  // Prefer framing that shows body, not only face
  if (!base.photography.framing || /close|cara|face only|extreme close/i.test(base.photography.framing)) {
    base.photography.framing = base.photography.framing || 'Plano medio / medio cuerpo (hombros, torso y postura visibles)';
  }
  if (!base.photography.composition) {
    base.photography.composition = 'Sujeto a medio cuerpo, identidad facial + silueta corporal consistentes';
  }
  if (!base.personality) base.personality = {};
  base.personality.mbti = f.mbti || base.personality.mbti || 'ENFP - El Entusiasta Creativo';
  base.personality.communication_style = f.communicationStyle || base.personality.communication_style || 'Cálido, cercano, usa emojis moderados y hace preguntas a la audiencia';
  
  const taboosInput = f.taboos || '';
  if (taboosInput) {
    base.personality.taboos = taboosInput.split(',').map(s => s.trim()).filter(Boolean);
  } else if (!base.personality.taboos) {
    base.personality.taboos = ['No promociona fast fashion', 'No usa lenguaje agresivo', 'No habla de temas políticos controversiales'];
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
  
  // Character lock — prompt-builder.js (W5b); niche enrich via InfluNichePresets
  let nicheExtras = null;
  try {
    const nicheApi = window.InfluNichePresets;
    nicheExtras = state.activeNicheId && nicheApi?.getNichePreset?.(state.activeNicheId);
  } catch (_) {}
  return _promptBuilder().assembleCharacterLock(base, {
    nicheId: state.activeNicheId || null,
    nicheExtras: nicheExtras || null
  });
}

function buildChatbotExportText({ includePrompt = true, includeScript = false, includeProduct = false, scriptData = null, productData = null } = {}) {
  const personaJSON = getFullPersonaJSON();
  const promptText = includePrompt
    ? (document.getElementById('promptPreview')?.textContent || '')
    : '';
  return _promptBuilder().buildChatbotExportTextFromPersona(personaJSON, {
    includePrompt,
    promptText,
    includeScript,
    includeProduct,
    scriptData,
    productData
  });
}

/** F5 — packs en chatbot-packs.js (Paso 4: extracción del monolito) */
const FREE_CHATBOT_PACKS = (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.FREE_CHATBOT_PACKS)
  ? InfluChatbotPacks.FREE_CHATBOT_PACKS
  : {};

/**
 * Build a ready-to-paste free chatbot pack (F5).
 * @param {'fullbody'|'bikini'|'spicy'|'product'} packId
 * @param {{ productData?: object, extraScene?: string }} [opts]
 */
function buildFreeChatbotPack(packId, opts = {}) {
  if (typeof InfluChatbotPacks === 'undefined' || !InfluChatbotPacks.buildFreeChatbotPack) {
    throw new Error('chatbot-packs.js no cargado');
  }
  return InfluChatbotPacks.buildFreeChatbotPack(getFullPersonaJSON(), packId, {
    productData: opts.productData || state.selectedProduct,
    extraScene: opts.extraScene,
    fallbackName: state.selectedPersona?.name,
    cameraId: opts.cameraId !== undefined ? opts.cameraId : state.ugcCameraId,
    shotTypeId: opts.shotTypeId !== undefined ? opts.shotTypeId : state.ugcShotTypeId,
    triggerToken: opts.triggerToken || (document.getElementById('loraTriggerInput')?.value || '').trim()
  });
}

/** W13 — último pack copiado por persona (localStorage) */
function lastPackStorageKey(personaId) {
  const pid = personaId || state.selectedPersona?.id || 'draft';
  const profile = state.currentProfile?.id || 'local';
  return `influ_last_pack_${profile}_${pid}`;
}

function loadLastCopiedPack(personaId) {
  try {
    const raw = localStorage.getItem(lastPackStorageKey(personaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.packId || !FREE_CHATBOT_PACKS[parsed.packId]) return null;
    return { packId: parsed.packId, copiedAt: parsed.copiedAt || null };
  } catch (_) {
    return null;
  }
}

function saveLastCopiedPack(personaId, packId) {
  if (!personaId || !FREE_CHATBOT_PACKS[packId]) return null;
  const payload = { packId, copiedAt: new Date().toISOString() };
  try {
    localStorage.setItem(lastPackStorageKey(personaId), JSON.stringify(payload));
  } catch (_) {}
  return payload;
}

function formatLastPackStatusText(record, opts = {}) {
  if (!record?.packId) {
    return opts.empty != null ? opts.empty : 'Aún no has copiado un pack de este influencer.';
  }
  const label = (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.packLabel)
    ? InfluChatbotPacks.packLabel(record.packId)
    : (FREE_CHATBOT_PACKS[record.packId]?.label || record.packId);
  const age = (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.formatRelativeCopyAge)
    ? InfluChatbotPacks.formatRelativeCopyAge(record.copiedAt)
    : null;
  return age
    ? `Último: ${label} · copiado ${age}`
    : `Último: ${label}`;
}

function refreshLastPackStatus() {
  const personaId = state.selectedPersona?.id;
  const record = personaId ? loadLastCopiedPack(personaId) : null;
  const text = personaId
    ? formatLastPackStatusText(record)
    : 'Guarda o selecciona un influencer para recordar el último pack.';
  document.querySelectorAll('[data-last-pack-status]').forEach((el) => {
    el.textContent = text;
  });
  const recopyBtn = document.getElementById('btnRecopyLastPack');
  if (recopyBtn) {
    recopyBtn.disabled = !(record && record.packId);
    recopyBtn.title = record?.packId
      ? `Volver a copiar «${FREE_CHATBOT_PACKS[record.packId]?.label || record.packId}»`
      : 'Aún no hay pack copiado';
  }
}

async function copyFreeChatbotPack(packId) {
  try {
    if (!state.selectedPersona && !document.getElementById('pName')?.value) {
      toastInfo('Selecciona o crea un influencer antes de copiar un pack.', {
        actionLabel: 'Ir a Influencers',
        onAction: () => navigateToTab('dashboard')
      });
      return;
    }
    const text = buildFreeChatbotPack(packId);
    await navigator.clipboard.writeText(text);
    const pack = FREE_CHATBOT_PACKS[packId];
    const personaId = state.selectedPersona?.id;
    if (personaId) saveLastCopiedPack(personaId, packId);
    markHappyPathCopied();
    refreshLastPackStatus();
    flashCopySuccessButtons();
    const toastOpts = {
      actionLabel: 'Volver a copiar último pack',
      onAction: () => { copyFreeChatbotPack(packId); },
      duration: 8000
    };
    toastWithLockHealth(
      `Pack gratis «${pack.label}» copiado — pégalo en ChatGPT/Gemini/Claude`,
      getFullPersonaJSON(),
      toastOpts
    );
  } catch (err) {
    console.error(err);
    toastError('No se pudo copiar el pack: ' + (err.message || 'error'), {
      actionLabel: 'Reintentar',
      onAction: () => { copyFreeChatbotPack(packId); }
    });
  }
}

async function copyLastFreeChatbotPack() {
  const personaId = state.selectedPersona?.id;
  const last = personaId ? loadLastCopiedPack(personaId) : null;
  const packId = last?.packId || 'fullbody';
  await copyFreeChatbotPack(packId);
}

/** W11 — localStorage key for chatbot session checklist */
function chatbotSessionStorageKey(personaId) {
  const pid = personaId || state.selectedPersona?.id || 'draft';
  const profile = state.currentProfile?.id || 'local';
  return `influ_chatbot_session_${profile}_${pid}`;
}

function loadChatbotSessionChecklist(personaId) {
  const empty = (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.emptySessionChecklist)
    ? InfluChatbotPacks.emptySessionChecklist()
    : { face: null, skin: null, hair: null, updatedAt: null };
  try {
    const raw = localStorage.getItem(chatbotSessionStorageKey(personaId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      face: parsed.face === true ? true : parsed.face === false ? false : null,
      skin: parsed.skin === true ? true : parsed.skin === false ? false : null,
      hair: parsed.hair === true ? true : parsed.hair === false ? false : null,
      updatedAt: parsed.updatedAt || null
    };
  } catch (_) {
    return empty;
  }
}

function saveChatbotSessionChecklist(personaId, checklist) {
  const payload = {
    face: checklist.face === true,
    skin: checklist.skin === true,
    hair: checklist.hair === true,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(chatbotSessionStorageKey(personaId), JSON.stringify(payload));
  return payload;
}

function isChatbotSessionPassingForPersona(p) {
  if (!p?.id) return false;
  const cl = loadChatbotSessionChecklist(p.id);
  if (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.isSessionChecklistPassing) {
    return InfluChatbotPacks.isSessionChecklistPassing(cl);
  }
  return cl.face === true && cl.skin === true && cl.hair === true;
}

function buildChatbotSessionCheckText() {
  if (typeof InfluChatbotPacks === 'undefined' || !InfluChatbotPacks.buildChatbotSessionCheck) {
    throw new Error('chatbot-packs.js no cargado (sesión W11)');
  }
  return InfluChatbotPacks.buildChatbotSessionCheck(getFullPersonaJSON(), {
    productData: state.selectedProduct,
    fallbackName: state.selectedPersona?.name || document.getElementById('pName')?.value,
    nicheLabel: getFullPersonaJSON()?.character_lock?.niche || ''
  });
}

function openChatbotSessionChecklistModal() {
  const modal = document.getElementById('chatbotSessionModal');
  if (!modal) return;
  const p = state.selectedPersona;
  const name = p?.name || document.getElementById('pName')?.value || 'Influencer';
  const nameEl = document.getElementById('chatbotSessionPersonaName');
  if (nameEl) nameEl.textContent = name;
  const trialApi = getIdentityTrialApi();
  const profileId = state.currentProfile?.id || 'anon';
  const revId = p?.lockRevisionId || p?.character_lock_revision_id || 'current';
  const trial = trialApi
    ? trialApi.load(profileId, p?.id, revId)
    : null;
  const cl = trial || loadChatbotSessionChecklist(p?.id);
  const face = document.getElementById('chkSessionFace');
  const skin = document.getElementById('chkSessionSkin');
  const hair = document.getElementById('chkSessionHair');
  const sil = document.getElementById('chkSessionSilhouette');
  if (face) face.checked = cl.face === true;
  if (skin) skin.checked = cl.skin === true;
  if (hair) hair.checked = cl.hair === true;
  if (sil) sil.checked = cl.silhouette === true;
  updateChatbotSessionStatusLine(cl);
  const dialogs = getDialogsApi();
  if (dialogs) dialogs.openDialog(modal, { display: 'flex' });
  else modal.style.display = 'flex';
}

function updateChatbotSessionStatusLine(cl) {
  const el = document.getElementById('chatbotSessionStatus');
  if (!el) return;
  const trialApi = getIdentityTrialApi();
  const passing = trialApi
    ? trialApi.isPassing(cl)
    : (typeof InfluChatbotPacks !== 'undefined' && InfluChatbotPacks.isSessionChecklistPassing
      ? InfluChatbotPacks.isSessionChecklistPassing(cl)
      : (cl.face && cl.skin && cl.hair));
  if (passing) {
    el.textContent = '✓ Identidad OK — character_lock listo para packs free.';
    el.style.color = '#34d399';
  } else if (trialApi?.anyFail(cl) || cl.face === false || cl.skin === false || cl.hair === false) {
    el.textContent = 'Hay fallos: re-pega el CHARACTER LOCK, ajusta tez/pelo/silueta y repite.';
    el.style.color = 'var(--danger)';
  } else {
    el.textContent = 'Marca cara / tez / pelo / silueta tras comparar A · B · C en el chatbot.';
    el.style.color = 'var(--text-muted)';
  }
}

async function copyChatbotSessionCheck({ openChecklist = true } = {}) {
  try {
    if (!state.selectedPersona && !document.getElementById('pName')?.value) {
      toastInfo('Selecciona o crea un influencer antes de la sesión chatbot.');
      return;
    }
    const trialApi = getIdentityTrialApi();
    const text = trialApi
      ? trialApi.buildTrialBlock(getFullPersonaJSON(), {
          productData: state.selectedProduct,
          fallbackName: state.selectedPersona?.name || document.getElementById('pName')?.value,
          nicheLabel: getFullPersonaJSON()?.character_lock?.niche || ''
        })
      : buildChatbotSessionCheckText();
    await navigator.clipboard.writeText(text);
    markHappyPathCopied();
    toastWithLockHealth('Prueba de identidad (3 prompts) copiada — pégala en ChatGPT/Gemini/Claude free', getFullPersonaJSON());
    if (openChecklist) openChatbotSessionChecklistModal();
  } catch (err) {
    console.error(err);
    toastError('No se pudo copiar la sesión: ' + (err.message || 'error'));
  }
}

function setupChatbotSessionUi() {
  document.getElementById('btnChatbotSessionCheck')?.addEventListener('click', () => {
    copyChatbotSessionCheck({ openChecklist: true });
  });
  document.getElementById('btnOpenChatbotChecklist')?.addEventListener('click', () => {
    if (!state.selectedPersona && !document.getElementById('pName')?.value) {
      toastInfo('Selecciona un influencer para ver el checklist.');
      return;
    }
    openChatbotSessionChecklistModal();
  });
  document.getElementById('btnCloseChatbotSession')?.addEventListener('click', () => {
    const modal = document.getElementById('chatbotSessionModal');
    const dialogs = getDialogsApi();
    if (modal && dialogs) dialogs.closeDialog(modal);
    else if (modal) modal.style.display = 'none';
  });
  document.getElementById('chatbotSessionModal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'chatbotSessionModal') {
      const dialogs = getDialogsApi();
      if (dialogs) dialogs.closeDialog(e.target);
      else e.target.style.display = 'none';
    }
  });
  document.getElementById('btnCopyIdentityTrialBlock')?.addEventListener('click', () => {
    copyChatbotSessionCheck({ openChecklist: false });
  });
  document.getElementById('btnSaveChatbotSession')?.addEventListener('click', () => {
    const p = state.selectedPersona;
    if (!p?.id) {
      toastInfo('Guarda el influencer primero para persistir el checklist.');
      return;
    }
    const checklist = {
      face: !!document.getElementById('chkSessionFace')?.checked,
      skin: !!document.getElementById('chkSessionSkin')?.checked,
      hair: !!document.getElementById('chkSessionHair')?.checked,
      silhouette: !!document.getElementById('chkSessionSilhouette')?.checked
    };
    const savedLegacy = saveChatbotSessionChecklist(p.id, checklist);
    const trialApi = getIdentityTrialApi();
    const profileId = state.currentProfile?.id || 'anon';
    const revId = p.lockRevisionId || p.character_lock_revision_id || 'current';
    const saved = trialApi
      ? trialApi.save(profileId, p.id, revId, checklist)
      : { ...savedLegacy, silhouette: checklist.silhouette };
    updateChatbotSessionStatusLine(saved);
    refreshChatbotSessionSheetStatus();
    renderPersonaGrids();
    const pass = trialApi ? trialApi.isPassing(saved) : isChatbotSessionPassingForPersona(p);
    if (pass) {
      try { markStudioActivation('identity'); } catch (_) {}
    }
    try { renderStudioActivation(); } catch (_) {}
    toastSuccess(pass
      ? `Prueba de identidad OK para «${p.name}»`
      : `Checklist guardado para «${p.name}»`);
  });
  document.getElementById('btnRecopyChatbotSession')?.addEventListener('click', () => {
    copyChatbotSessionCheck({ openChecklist: false });
  });
  ['chkSessionFace', 'chkSessionSkin', 'chkSessionHair', 'chkSessionSilhouette'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      updateChatbotSessionStatusLine({
        face: !!document.getElementById('chkSessionFace')?.checked,
        skin: !!document.getElementById('chkSessionSkin')?.checked,
        hair: !!document.getElementById('chkSessionHair')?.checked,
        silhouette: !!document.getElementById('chkSessionSilhouette')?.checked
      });
    });
  });
  refreshChatbotSessionSheetStatus();
}

function refreshChatbotSessionSheetStatus() {
  const el = document.getElementById('chatbotSessionSheetStatus');
  if (!el) return;
  const p = state.selectedPersona;
  if (!p?.id) {
    el.textContent = 'Guarda el influencer para registrar la prueba de identidad.';
    el.style.color = 'var(--text-muted)';
    return;
  }
  const trialApi = getIdentityTrialApi();
  const profileId = state.currentProfile?.id || 'anon';
  const revId = p.lockRevisionId || p.character_lock_revision_id || 'current';
  const cl = trialApi
    ? trialApi.load(profileId, p.id, revId)
    : loadChatbotSessionChecklist(p.id);
  const pass = trialApi ? trialApi.isPassing(cl) : isChatbotSessionPassingForPersona(p);
  if (pass) {
    el.textContent = '✓ Prueba de identidad OK (cara + tez + pelo + silueta).';
    el.style.color = '#34d399';
  } else if (cl.updatedAt) {
    el.textContent = `Checklist incompleto o con fallos (última: ${String(cl.updatedAt).slice(0, 19).replace('T', ' ')}).`;
    el.style.color = 'var(--text-secondary)';
  } else {
    el.textContent = 'Aún no hay prueba — copia los 3 prompts, genera en chatbot free y marca las 4 casillas.';
    el.style.color = 'var(--text-muted)';
  }
}

/**
 * 2.5–2.6 — Descarga ZIP del influencer (lock + packs + imágenes + licencia).
 * kit=true → kit marca (+ guión UGC).
 */
async function exportPersonaZipPack({ kit = false } = {}) {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    toastInfo('Selecciona o crea un influencer antes de exportar el pack.');
    return;
  }
  try {
    toastLoading(kit ? 'Empaquetando kit marca…' : 'Empaquetando ZIP…');
    const qs = kit ? '?kit=1' : '';
    const res = await authFetch(`/api/export/persona/${p.id}${qs}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    const fallback = kit
      ? `${(p.name || 'influencer').toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_brand_kit.zip`
      : `${(p.name || 'influencer').toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_pack.zip`;
    const filename = match?.[1] || fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    markHappyPathCopied();
    try { markStudioActivation('export'); } catch (_) {}
    toastSuccess(kit ? `🎁 Kit marca descargado: ${filename}` : `📦 Pack ZIP descargado: ${filename}`);
  } catch (err) {
    console.error(err);
    toastError('No se pudo exportar el ZIP: ' + (err.message || 'error'));
  }
}
window.exportPersonaZipPack = exportPersonaZipPack;
window.exportBrandKit = () => exportPersonaZipPack({ kit: true });

// Fase L / L0 — Pack de entrenamiento LoRA (dataset + captions) para Colab gratis.
async function exportLoraTrainingPack() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    toastInfo('Selecciona o crea un influencer antes de exportar el pack LoRA.');
    return;
  }
  try {
    toastLoading('Empaquetando dataset + captions para LoRA…');
    const qs = new URLSearchParams();
    const explicit = document.getElementById('chkLoraExplicitCaptions')?.checked;
    const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
    if (explicit) qs.set('explicitCaptions', '1');
    if (trigger) qs.set('triggerToken', trigger);
    const suffix = qs.toString() ? `?${qs}` : '';
    const res = await authFetch(`/api/export/persona/${p.id}/lora${suffix}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    const fallback = `${(p.name || 'influencer').toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_lora_pack.zip`;
    const filename = match?.[1] || fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastSuccess(`🧬 Pack LoRA descargado: ${filename}`);
  } catch (err) {
    console.error(err);
    toastError('No se pudo exportar el pack LoRA: ' + (err.message || 'error'));
  }
}
window.exportLoraTrainingPack = exportLoraTrainingPack;

/** R2 — mostrar toggle face-lock pago solo si el servidor tiene ENABLE_PAID_FACE_LOCK + token. */
async function refreshFaceLockOptIn() {
  const wrap = document.getElementById('faceLockOptInWrap');
  if (!wrap) return;
  try {
    const res = await fetch('/api/status');
    const status = await res.json().catch(() => ({}));
    const available = !!(status.imageProviders?.paidFaceLock?.available
      || status.imageProviders?.replicate?.available);
    wrap.style.display = available ? 'block' : 'none';
    if (!available) {
      const toggle = document.getElementById('preferFaceLockToggle');
      if (toggle) toggle.checked = false;
    }
  } catch (_) {
    wrap.style.display = 'none';
  }
}

function updateLocalGpuCompanionHint({ comfyConfigured = false, comfyOk = false } = {}) {
  const el = document.getElementById('localGpuCompanionHint');
  if (!el) return;
  const lu = '<a href="https://github.com/PurpleDoubleD/locally-uncensored" target="_blank" rel="noopener noreferrer">Locally Uncensored</a>';
  if (comfyOk) {
    el.innerHTML = 'ComfyUI detectado (online). Pon el <code class="u-fs-10">.safetensors</code> en <code class="u-fs-10">models/loras</code> y registra la LoRA abajo si quieres gen local. El path free sigue siendo <strong>Copiar JSON</strong>.';
  } else if (comfyConfigured) {
    el.innerHTML = `ComfyUI configurado pero offline. Arranca Comfy (p. ej. ${lu}) y pulsa Actualizar. Pon el <code class="u-fs-10">.safetensors</code> en <code class="u-fs-10">models/loras</code>. El producto sigue siendo el JSON.`;
  } else {
    el.innerHTML = `¿GPU local? Puedes usar ComfyUI (puerto típico <code class="u-fs-10">8188</code>) — p. ej. ${lu} como gestor. Pon el <code class="u-fs-10">.safetensors</code> en <code class="u-fs-10">models/loras</code>. El producto sigue siendo el JSON.`;
  }
}

async function refreshLocalGpuStatus() {
  const textEl = document.getElementById('localGpuStatusText');
  const chipComfy = document.getElementById('localGpuChipComfy');
  const chipA1111 = document.getElementById('localGpuChipA1111');
  if (!textEl && !chipComfy) return;

  const setChip = (el, label, ok, configured) => {
    if (!el) return;
    if (!configured) {
      el.textContent = `${label} off`;
      el.style.borderColor = 'rgba(255,255,255,0.12)';
      el.style.color = 'var(--text-muted)';
      return;
    }
    el.textContent = ok ? `${label} online` : `${label} offline`;
    el.style.borderColor = ok ? 'rgba(34,197,94,0.45)' : 'rgba(248,113,113,0.45)';
    el.style.color = ok ? 'rgb(134,239,172)' : 'rgb(252,165,165)';
  };

  try {
    const res = await authFetch('/api/local-gpu/status');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      if (textEl) textEl.textContent = 'Estado: no disponible.';
      return;
    }
    const comfy = data.backends?.comfyui || {};
    const a1111 = data.backends?.a1111 || {};
    const comfyConfigured = comfy.reason !== 'not_configured';
    const comfyOk = !!comfy.ok;
    setChip(chipComfy, 'ComfyUI', comfyOk, comfyConfigured);
    setChip(chipA1111, 'A1111/Forge', !!a1111.ok, a1111.reason !== 'not_configured');
    const active = data.active || 'ninguno';
    const prefer = data.preferLocal ? 'PREFER_LOCAL_GPU on' : 'solo con LoRA ready';
    if (textEl) {
      textEl.textContent = data.configured
        ? `Activo: ${active} · preferencia ${data.backendPreference || 'auto'} · ${prefer}`
        : 'Sin COMFYUI_URL ni A1111_URL — gens siguen por Pollinations / Copiar JSON.';
    }
    updateLocalGpuCompanionHint({ comfyConfigured, comfyOk });
  } catch (err) {
    if (textEl) textEl.textContent = 'Estado: error al consultar hub local.';
  }
}

async function refreshLoraInferenceStatus() {
  const el = document.getElementById('loraInferenceStatus');
  if (!el) return;
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    el.textContent = 'Estado: selecciona un influencer.';
    return;
  }
  try {
    const res = await authFetch(`/api/personas/${p.id}/lora`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      el.textContent = 'Estado: no disponible.';
      return;
    }
    const st = data.lora?.status || 'none';
    const trigger = data.lora?.trigger_token || '—';
    const comfy = data.comfyui?.configured
      ? (data.comfyui.reachable ? 'ComfyUI OK' : 'ComfyUI configurado (no responde)')
      : 'sin COMFYUI_URL';
    const paid = data.paidLora?.available ? 'Replicate L3 ON' : 'L3 off (gratis)';
    const localT = data.localTrain?.available
      ? (data.localTrain.canSpawn ? 'L5 spawn ON' : 'L5 materialize')
      : 'L5 off';
    el.textContent = `Estado: ${st} · trigger: ${trigger} · ${comfy} · ${paid} · ${localT}`;
    const triggerInput = document.getElementById('loraTriggerInput');
    if (triggerInput && data.lora?.trigger_token && !triggerInput.value) {
      triggerInput.value = data.lora.trigger_token;
    }
  } catch (err) {
    el.textContent = 'Estado: error al consultar.';
  }
  refreshLocalGpuStatus();
}

async function registerLoraWeights() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    toastInfo('Selecciona un influencer primero.');
    return;
  }
  const fileInput = document.getElementById('loraWeightsFile');
  const triggerInput = document.getElementById('loraTriggerInput');
  const file = fileInput?.files?.[0];
  const trigger = (triggerInput?.value || '').trim();
  if (!file) {
    toastInfo('Elige un archivo .safetensors (salida de Colab L1).');
    return;
  }
  try {
    toastLoading('Registrando LoRA…');
    const fd = new FormData();
    fd.append('weights', file);
    if (trigger) fd.append('triggerToken', trigger);
    const res = await authFetch(`/api/personas/${p.id}/lora`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess(`LoRA registrada (${data.lora?.status || 'ready'}). Copia a ComfyUI/A1111 models/loras si no usas *_LORAS_DIR.`);
    if (fileInput) fileInput.value = '';
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('No se pudo registrar LoRA: ' + (err.message || 'error'));
  }
}

async function clearLoraWeights() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) return;
  if (!confirm('¿Quitar LoRA de este influencer? (vuelve el path Pollinations)')) return;
  try {
    const res = await authFetch(`/api/personas/${p.id}/lora`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess('LoRA eliminada. Gen = Pollinations.');
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('No se pudo quitar LoRA: ' + (err.message || 'error'));
  }
}

async function trainLoraPaid() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    toastInfo('Selecciona un influencer primero.');
    return;
  }
  if (!confirm('Esto llama a Replicate (pago) y gasta crédito. ¿Continuar?\n\nSi quieres gratis, usa Colab (L1) en docs/lora/L1_COLAB.md.')) {
    return;
  }
  try {
    toastLoading('Subiendo dataset e iniciando training pago…');
    const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
    const res = await authFetch(`/api/personas/${p.id}/lora/train`, {
      method: 'POST',
      body: JSON.stringify({ confirmPaid: true, triggerToken: trigger || undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess(`Training iniciado (${data.training?.id || 'ok'}). Pulsa «Sincronizar estado» cuando termine.`);
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('Trainer pago: ' + (err.message || 'error'));
  }
}

async function trainLoraLocal() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) {
    toastInfo('Selecciona un influencer primero.');
    return;
  }
  if (!confirm(
    'Train local (L5): materializa el pack en disco y, si está configurado, lanza ai-toolkit en TU GPU.\n\n'
    + 'No es el path free (Copiar JSON / Colab L1). ¿Continuar?'
  )) {
    return;
  }
  try {
    toastLoading('Preparando dataset local (L5)…');
    const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
    const res = await authFetch(`/api/personas/${p.id}/lora/train-local`, {
      method: 'POST',
      body: JSON.stringify({ confirmLocal: true, triggerToken: trigger || undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    if (data.job?.mode === 'materialize_only') {
      toastSuccess(`Pack en disco (${data.job.imageCount || '?'} imgs). Sync o registrá .safetensors cuando entrenes.`);
    } else {
      toastSuccess(`Train local iniciado (pid ${data.job?.pid || '—'}). Pulsá «Sincronizar train local».`);
    }
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('Train local: ' + (err.message || 'error'));
  }
}

async function syncLoraLocal() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) return;
  try {
    toastLoading('Sincronizando train local…');
    const res = await authFetch(`/api/personas/${p.id}/lora/sync-local`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess(`LoRA local: ${data.lora?.status || '—'}${data.job?.weightsFound ? ' (pesos OK)' : ''}`);
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('Sync train local: ' + (err.message || 'error'));
  }
}

async function syncLoraPaid() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) return;
  try {
    toastLoading('Sincronizando training…');
    const res = await authFetch(`/api/personas/${p.id}/lora/sync`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess(`LoRA status: ${data.lora?.status || '—'}`);
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('Sync LoRA: ' + (err.message || 'error'));
  }
}

async function linkLoraPaid() {
  const p = state.selectedPersona || state.personas[0];
  if (!p?.id) return;
  const ver = (document.getElementById('loraReplicateModelInput')?.value || '').trim();
  if (!ver) {
    toastInfo('Pega owner/model:version de Replicate.');
    return;
  }
  try {
    const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
    const res = await authFetch(`/api/personas/${p.id}/lora/sync`, {
      method: 'POST',
      body: JSON.stringify({ replicateModelVersion: ver, triggerToken: trigger || undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
    toastSuccess('Modelo Replicate vinculado (status=ready).');
    await refreshLoraInferenceStatus();
  } catch (err) {
    toastError('Vincular LoRA: ' + (err.message || 'error'));
  }
}
window.refreshLoraInferenceStatus = refreshLoraInferenceStatus;
window.refreshLocalGpuStatus = refreshLocalGpuStatus;
window.refreshFaceLockOptIn = refreshFaceLockOptIn;

function applyNichePreset(nicheId) {
  const api = window.InfluNichePresets;
  if (!api?.formValuesFromNiche) {
    toastError('Presets de nicho no cargados. Recarga la página.');
    return;
  }
  const values = api.formValuesFromNiche(nicheId);
  if (!values) {
    toastError('Nicho no reconocido.');
    return;
  }
  resetPersonaFormForNew();
  state.activeNicheId = nicheId;
  const setVal = (id, val) => {
    if (val == null) return;
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  Object.entries(values).forEach(([key, val]) => {
    if (key.startsWith('_')) return;
    setVal(key, val);
  });
  // clothing / setting dropdowns
  try {
    if (values.pSetting && typeof updateSettingDropdown === 'function') {
      updateSettingDropdown(values.pSetting);
    }
    if (typeof updateClothingDropdown === 'function') updateClothingDropdown();
    const cloth = document.getElementById('pClothing');
    if (cloth && values.pClothing) {
      // try select matching option or set as custom text if input
      const opts = Array.from(cloth.options || []);
      const match = opts.find(o => o.value === values.pClothing || o.textContent.includes(values.pClothing.slice(0, 24)));
      if (match) cloth.value = match.value;
      else if (cloth.tagName === 'INPUT') cloth.value = values.pClothing;
    }
  } catch (_) {}

  compilePromptAndJSON();
  const jsonArea = document.getElementById('jsonEditor');
  if (jsonArea) jsonArea.value = JSON.stringify(getFullPersonaJSON(), null, 2);

  const hint = document.getElementById('nichePresetHint');
  const preset = api.getNichePreset(nicheId);
  if (hint && preset) {
    hint.style.display = 'block';
    hint.textContent = `Preset «${preset.label}» aplicado — ${preset.short}. Revisa tez/nombre y pulsa Crear influencer.`;
  }
  document.querySelectorAll('.niche-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-niche') === nicheId);
  });
  toastSuccess(`Nicho ${preset?.label || nicheId} listo — character_lock reforzado`);
}

function setupNichePresets() {
  document.querySelectorAll('[data-niche]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applyNichePreset(btn.getAttribute('data-niche'));
    });
  });
  window.applyNichePreset = applyNichePreset;
}

function refreshUgcComposerChips() {
  document.querySelectorAll('[data-ugc-camera]').forEach((btn) => {
    const active = btn.getAttribute('data-ugc-camera') === state.ugcCameraId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.style.background = 'rgba(52, 211, 153, 0.25)';
      btn.style.borderColor = 'rgba(52, 211, 153, 0.55)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });
  document.querySelectorAll('[data-ugc-shot]').forEach((btn) => {
    const active = btn.getAttribute('data-ugc-shot') === state.ugcShotTypeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.style.background = 'rgba(52, 211, 153, 0.25)';
      btn.style.borderColor = 'rgba(52, 211, 153, 0.55)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });
  const hint = document.getElementById('ugcShotComposerHint');
  if (!hint || typeof InfluUgcShotComposer === 'undefined') return;
  const composed = InfluUgcShotComposer.composeShotExtras({
    cameraId: state.ugcCameraId,
    shotTypeId: state.ugcShotTypeId
  });
  const bits = [];
  if (composed.shot) bits.push(`formato «${composed.shot.label}»`);
  if (composed.camera) bits.push(`cámara «${composed.camera.label}»`);
  hint.textContent = bits.length
    ? `Activo: ${bits.join(' + ')}. Se inyecta al copiar el pack (cara fija del lock).`
    : 'Elige cámara y/o formato; se inyectan al copiar el pack (sin renegociar la cara).';
}

function setUgcCamera(cameraId) {
  if (typeof InfluUgcShotComposer === 'undefined') return;
  const cam = InfluUgcShotComposer.getCamera(cameraId);
  if (!cam) return;
  state.ugcCameraId = cam.id;
  const pCam = document.getElementById('pCamera');
  if (pCam) pCam.value = cam.fieldValue;
  try { compilePromptAndJSON(); } catch (_) {}
  refreshUgcComposerChips();
  toastInfo(`Cámara UGC: ${cam.label}`);
}

function setUgcShotType(shotTypeId) {
  if (typeof InfluUgcShotComposer === 'undefined') return;
  // Toggle off if clicking the same chip
  if (state.ugcShotTypeId === shotTypeId) {
    state.ugcShotTypeId = null;
    refreshUgcComposerChips();
    toastInfo('Formato UGC quitado');
    return;
  }
  const shot = InfluUgcShotComposer.getShotType(shotTypeId);
  if (!shot) return;
  state.ugcShotTypeId = shot.id;
  if (shot.defaultCamera) setUgcCamera(shot.defaultCamera);
  else refreshUgcComposerChips();
  toastInfo(`Formato UGC: ${shot.label}`);
}

async function copyUgcWeekCalendar() {
  if (typeof InfluUgcShotComposer === 'undefined') {
    toastError('ugc-shot-composer.js no cargado');
    return;
  }
  try {
    const json = getFullPersonaJSON();
    const name = json?.identity?.name || state.selectedPersona?.name || 'Influencer';
    const lock = json?.character_lock || {};
    const n = InfluUgcShotComposer.listShotTypeIds().length;
    const week = InfluUgcShotComposer.buildWeekCalendarText(name, { cameraId: state.ugcCameraId });
    const text = `═══════════════════════════════════════════
CHARACTER LOCK (pegar una vez — byte-idéntico en las ${n} tomas)
═══════════════════════════════════════════
${JSON.stringify(lock, null, 2)}

${week}`;
    await navigator.clipboard.writeText(text);
    toastSuccess(`Semana UGC (${n} tomas) copiada — ${name}`);
  } catch (err) {
    console.error(err);
    toastError('No se pudo copiar el calendario UGC');
  }
}

function setupFreeChatbotPacks() {
  document.querySelectorAll('[data-free-pack]').forEach(btn => {
    btn.setAttribute('data-offline-highlight', 'pack');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-free-pack');
      copyFreeChatbotPack(id);
    });
  });
  document.querySelectorAll('[data-ugc-camera]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setUgcCamera(btn.getAttribute('data-ugc-camera'));
    });
  });
  document.querySelectorAll('[data-ugc-shot]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setUgcShotType(btn.getAttribute('data-ugc-shot'));
    });
  });
  document.getElementById('btnCopyUgcWeek')?.addEventListener('click', (e) => {
    e.preventDefault();
    copyUgcWeekCalendar();
  });
  refreshUgcComposerChips();
  document.getElementById('btnRecopyLastPack')?.addEventListener('click', (e) => {
    e.preventDefault();
    copyLastFreeChatbotPack();
  });
  // Cerrar menús Packs del portafolio al clic fuera
  if (!document.body.dataset.packMenusBound) {
    document.body.dataset.packMenusBound = '1';
    document.addEventListener('click', () => {
      document.querySelectorAll('.portfolio-pack-menu-list').forEach((el) => { el.hidden = true; });
      document.querySelectorAll('.btn-quick-packs').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    });
  }
  window.copyFreeChatbotPack = copyFreeChatbotPack;
  window.copyLastFreeChatbotPack = copyLastFreeChatbotPack;
  window.buildFreeChatbotPack = buildFreeChatbotPack;
  window.copyChatbotSessionCheck = copyChatbotSessionCheck;
  window.copyUgcWeekCalendar = copyUgcWeekCalendar;
  window.setUgcCamera = setUgcCamera;
  window.setUgcShotType = setUgcShotType;
  window.FREE_CHATBOT_PACKS = FREE_CHATBOT_PACKS;
  refreshLastPackStatus();
  // Actualizar “copiado hace Xs” cada 15s si hay ficha abierta
  if (!window._lastPackStatusTimer) {
    window._lastPackStatusTimer = setInterval(() => {
      try { refreshLastPackStatus(); } catch (_) {}
    }, 15000);
  }
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

/** Shared face/body identity block — prompt-builder.js (W5b). */
function buildIdentityLockBlock(persona, detailed, skin) {
  return _promptBuilder().buildIdentityLockBlock(persona, detailed, skin);
}

/** Resolve skin for generation prompts — prompt-builder.js (W5b). */
function resolveSkinForPrompt(detailedLive, persona) {
  return _promptBuilder().resolveSkinForPrompt(detailedLive, persona);
}

// Persona Engine Tab Logic
function getPersonaDraftApi() {
  return (typeof InfluPersonaDraft !== 'undefined' ? InfluPersonaDraft : null)
    || (typeof window !== 'undefined' ? window.InfluPersonaDraft : null);
}

function getDialogsApi() {
  return (typeof InfluDialogs !== 'undefined' ? InfluDialogs : null)
    || (typeof window !== 'undefined' ? window.InfluDialogs : null);
}

function getActivationApi() {
  return (typeof InfluStudioActivation !== 'undefined' ? InfluStudioActivation : null)
    || (typeof window !== 'undefined' ? window.InfluStudioActivation : null);
}

function getIdentityTrialApi() {
  return (typeof InfluIdentityTrial !== 'undefined' ? InfluIdentityTrial : null)
    || (typeof window !== 'undefined' ? window.InfluIdentityTrial : null);
}

function getLockLabApi() {
  return (typeof InfluLockLab !== 'undefined' ? InfluLockLab : null)
    || (typeof window !== 'undefined' ? window.InfluLockLab : null);
}

function getRecipeApi() {
  return (typeof InfluProductionRecipe !== 'undefined' ? InfluProductionRecipe : null)
    || (typeof window !== 'undefined' ? window.InfluProductionRecipe : null);
}

function getBriefApi() {
  return (typeof InfluProductionBrief !== 'undefined' ? InfluProductionBrief : null)
    || (typeof window !== 'undefined' ? window.InfluProductionBrief : null);
}

function getCommunityTemplatesApi() {
  return (typeof InfluCommunityTemplates !== 'undefined' ? InfluCommunityTemplates : null)
    || (typeof window !== 'undefined' ? window.InfluCommunityTemplates : null);
}

function activationProfileId() {
  return state.currentProfile?.id || 'anon';
}

function markStudioActivation(stepId) {
  const api = getActivationApi();
  if (!api) return null;
  const flags = api.mark(activationProfileId(), stepId);
  renderStudioActivation();
  return flags;
}

function liveActivationSignals() {
  const personas = Array.isArray(state.personas) ? state.personas : [];
  let copied = false;
  try { copied = localStorage.getItem(happyPathCopyStorageKey()) === '1'; } catch (_) {}
  let identityPass = false;
  const trialApi = getIdentityTrialApi();
  const p = state.selectedPersona || personas[0];
  if (trialApi && p?.id) {
    const rev = p.lockRevisionId || p.character_lock_revision_id || 'current';
    identityPass = trialApi.isPassing(trialApi.load(activationProfileId(), p.id, rev));
  } else if (p?.id) {
    identityPass = isChatbotSessionPassingForPersona(p);
  }
  const act = getActivationApi()?.load(activationProfileId()) || {};
  return {
    hasPersona: personas.length > 0,
    copiedJson: copied,
    exportedPack: !!act.export,
    identityPass: identityPass || !!act.identity
  };
}

function renderStudioActivation() {
  const api = getActivationApi();
  const label = document.getElementById('studioActivationLabel');
  const list = document.getElementById('studioActivationList');
  if (!api || (!label && !list)) return;
  const flags = api.resolve(activationProfileId(), liveActivationSignals());
  const summary = api.summarize(flags);
  if (label) label.textContent = summary.label;
  if (list) {
    list.innerHTML = summary.steps.map((s) => `
      <li style="display:flex;align-items:center;gap:8px;font-size:12px;color:${s.done ? '#a7f3d0' : 'var(--text-secondary)'};">
        <span aria-hidden="true">${s.done ? '●' : '○'}</span>
        <span>${s.label}</span>
      </li>
    `).join('');
  }
}

function setupStudioActivation() {
  document.getElementById('btnOpenIdentityTrial')?.addEventListener('click', () => {
    if (!state.selectedPersona && state.personas?.[0]) selectPersona(state.personas[0]);
    if (!state.selectedPersona) {
      toastInfo('Crea o selecciona un influencer para la prueba de identidad.');
      runHappyPathAction('create');
      return;
    }
    navigateToTab('persona-engine');
    copyChatbotSessionCheck({ openChecklist: true });
  });
  // Señales de roster
  if ((state.personas || []).length) {
    markStudioActivation('create');
    markStudioActivation('save');
  }
  renderStudioActivation();
}

function liveBriefSignals() {
  const personas = Array.isArray(state.personas) ? state.personas : [];
  const p = state.selectedPersona || personas.find((x) => !isArchivedPersona(x)) || personas[0];
  let copied = false;
  try { copied = localStorage.getItem(happyPathCopyStorageKey()) === '1'; } catch (_) {}
  let identityPass = false;
  const trialApi = getIdentityTrialApi();
  if (trialApi && p?.id) {
    const rev = p.lockRevisionId || p.character_lock_revision_id || 'current';
    identityPass = trialApi.isPassing(trialApi.load(activationProfileId(), p.id, rev));
  } else if (p?.id) {
    identityPass = isChatbotSessionPassingForPersona(p);
  }
  const act = getActivationApi()?.load(activationProfileId()) || {};
  return {
    hasPersona: personas.some((x) => !isArchivedPersona(x)) || personas.length > 0,
    personaName: p?.name || null,
    scriptsCount: Number(state.scriptsCount) || (Array.isArray(state.scripts) ? state.scripts.length : 0) || 0,
    campaignsCount: Array.isArray(state.campaigns) ? state.campaigns.length : 0,
    generationsCount: Number(state.generationStats?.total) || 0,
    copiedJson: copied || !!act.copy,
    copiedProductPack: !!act.export || copied,
    identityPass: identityPass || !!act.identity,
    hasLicense: false,
    shotsMarkedDone: false,
    campaignMarkedDone: false
  };
}

function readBriefForm() {
  return {
    product: document.getElementById('prodBriefProduct')?.value || '',
    brand: document.getElementById('prodBriefBrand')?.value || '',
    hooksCount: Number(document.getElementById('prodBriefHooks')?.value || 3),
    shotsCount: Number(document.getElementById('prodBriefShots')?.value || 2),
    wantProductPack: !!document.getElementById('prodBriefWantPack')?.checked,
    wantCampaign: !!document.getElementById('prodBriefWantCampaign')?.checked,
    wantLicense: !!document.getElementById('prodBriefWantLicense')?.checked,
    wantIdentity: !!document.getElementById('prodBriefWantIdentity')?.checked,
    goal: 'ugc'
  };
}

function fillBriefForm(brief) {
  if (!brief) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  set('prodBriefProduct', brief.product || '');
  set('prodBriefBrand', brief.brand || '');
  set('prodBriefHooks', brief.hooksCount ?? 3);
  set('prodBriefShots', brief.shotsCount ?? 2);
  setChk('prodBriefWantPack', brief.wantProductPack !== false);
  setChk('prodBriefWantCampaign', brief.wantCampaign !== false);
  setChk('prodBriefWantLicense', !!brief.wantLicense);
  setChk('prodBriefWantIdentity', brief.wantIdentity !== false);
}

function renderProductionBrief() {
  const api = getBriefApi();
  const list = document.getElementById('prodBriefChecklist');
  const summary = document.getElementById('prodBriefSummary');
  const nextBox = document.getElementById('prodBriefNextCta');
  if (!api || !list) return;

  const stored = api.load(activationProfileId());
  const live = { ...liveBriefSignals(), ...stored.overrides._live };
  // Merge manual overrides for shot/campaign/license marks
  if (stored.overrides.shotsMarkedDone) live.shotsMarkedDone = true;
  if (stored.overrides.campaignMarkedDone) live.campaignMarkedDone = true;
  if (stored.overrides.hasLicense) live.hasLicense = true;

  let checklist = api.buildChecklist(stored.brief, live);
  checklist = api.applyOverrides(checklist, stored.overrides);
  if (summary) summary.textContent = checklist.summary.label;

  const next = api.nextAction(checklist);
  if (nextBox) {
    if (next) {
      nextBox.style.display = 'block';
      nextBox.innerHTML = `
        <p class="happy-path-next-label">Siguiente paso</p>
        <p class="happy-path-next-title">${String(next.label).replace(/[<>&]/g, '')}</p>
        <p class="happy-path-next-hint">${String(next.hint || '').replace(/[<>&]/g, '')}</p>
        <div class="empty-roster-actions">
          <button type="button" class="btn btn-sm" data-brief-action="${next.action}">${next.actionLabel || 'Ir'}</button>
        </div>
      `;
      nextBox.querySelectorAll('[data-brief-action]').forEach((btn) => {
        btn.addEventListener('click', () => runBriefAction(btn.getAttribute('data-brief-action')));
      });
    } else {
      nextBox.style.display = 'block';
      nextBox.innerHTML = `
        <p class="happy-path-next-label">Listo</p>
        <p class="happy-path-next-title">Checklist completo — publica o arma otra tanda</p>
      `;
    }
  }

  list.innerHTML = checklist.tasks.map((t) => `
    <li style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid ${t.done ? 'rgba(52,211,153,0.25)' : 'var(--glass-border)'};background:${t.done ? 'rgba(52,211,153,0.08)' : 'rgba(0,0,0,0.2)'};">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0;">
        <input type="checkbox" data-brief-toggle="${t.id}" ${t.done ? 'checked' : ''} style="margin-top:2px;">
        <span style="min-width:0;">
          <strong style="display:block;font-size:13px;color:${t.done ? '#a7f3d0' : '#fff'};">${String(t.label).replace(/[<>&]/g, '')}</strong>
          <span style="font-size:11px;color:var(--text-muted);line-height:1.35;">${String(t.hint || '').replace(/[<>&]/g, '')}</span>
        </span>
      </label>
      ${t.done ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-brief-action="${t.action}" style="font-size:11px;flex-shrink:0;">${t.actionLabel || 'Ir'}</button>`}
    </li>
  `).join('');

  list.querySelectorAll('[data-brief-action]').forEach((btn) => {
    btn.addEventListener('click', () => runBriefAction(btn.getAttribute('data-brief-action')));
  });
  list.querySelectorAll('[data-brief-toggle]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-brief-toggle');
      const storedNow = api.load(activationProfileId());
      const overrides = { ...storedNow.overrides };
      overrides[id] = !!chk.checked;
      // Special live flags for tasks derived from counts
      if (id === 'vertical_shots') overrides.shotsMarkedDone = !!chk.checked;
      if (id === 'campaign') overrides.campaignMarkedDone = !!chk.checked;
      if (id === 'license') overrides.hasLicense = !!chk.checked;
      api.save(activationProfileId(), storedNow.brief, overrides);
      renderProductionBrief();
    });
  });
}

async function runBriefAction(action) {
  if (action === 'persona') {
    runHappyPathAction('create');
  } else if (action === 'scripts') {
    navigateToTab('campaigns');
    setTimeout(() => {
      document.getElementById('btnGenerateCampaignScripts')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  } else if (action === 'copy_product') {
    try {
      if (!state.selectedPersona && state.personas?.[0]) selectPersona(state.personas[0]);
      if (!state.selectedPersona) {
        toastInfo('Guarda un influencer primero.');
        runHappyPathAction('create');
        return;
      }
      navigateToTab('persona-engine');
      await copyFreeChatbotPack('product');
      try { markStudioActivation('copy'); } catch (_) {}
      renderProductionBrief();
    } catch (err) {
      toastError('No se pudo copiar el pack producto.');
    }
  } else if (action === 'ugc') {
    navigateToTab('ugc-studio');
  } else if (action === 'campaign') {
    navigateToTab('campaigns');
    setTimeout(() => {
      const empty = document.getElementById('btnEmptyCampaignCreate');
      const neu = document.getElementById('btnNewCampaign');
      (empty || neu)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  } else if (action === 'license') {
    navigateToTab('licensing');
  } else if (action === 'identity') {
    document.getElementById('btnOpenIdentityTrial')?.click();
  }
}

function setupProductionBrief() {
  const api = getBriefApi();
  if (!api) return;
  const stored = api.load(activationProfileId());
  fillBriefForm(stored.brief);
  document.getElementById('prodBriefForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const brief = readBriefForm();
    const prev = api.load(activationProfileId());
    api.save(activationProfileId(), brief, prev.overrides || {});
    renderProductionBrief();
    toastSuccess('Checklist de producción actualizado');
  });
  renderProductionBrief();
}

function setCommunityTemplateStatus(msg, ok = true) {
  const el = document.getElementById('communityTemplateStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = ok ? '#a7f3d0' : 'var(--danger)';
}

function applyCommunityTemplate(template, { copyHooks = true } = {}) {
  const tplApi = getCommunityTemplatesApi();
  const briefApi = getBriefApi();
  if (!tplApi || !template) {
    toastError('Plantilla no disponible.');
    return;
  }
  const productOverride = document.getElementById('prodBriefProduct')?.value || '';
  const briefDefaults = tplApi.toBriefDefaults(template, {
    product: productOverride || undefined,
    brand: document.getElementById('prodBriefBrand')?.value || undefined
  });
  if (briefApi && briefDefaults) {
    const prev = briefApi.load(activationProfileId());
    briefApi.save(activationProfileId(), { ...prev.brief, ...briefDefaults }, prev.overrides || {});
    fillBriefForm({ ...prev.brief, ...briefDefaults });
    renderProductionBrief();
  }
  // Shot / cámara UGC (sin tocar must_match)
  try {
    if (template.shot?.camera && typeof setUgcCamera === 'function') {
      setUgcCamera(template.shot.camera);
    } else if (template.shot?.camera) {
      state.ugcCameraId = template.shot.camera;
    }
    if (template.shot?.type && typeof setUgcShotType === 'function') {
      setUgcShotType(template.shot.type);
    } else if (template.shot?.type) {
      state.ugcShotTypeId = template.shot.type;
    }
  } catch (_) {}

  if (copyHooks && Array.isArray(template.script_hooks) && template.script_hooks.length) {
    const block = [
      `PLANTILLA: ${template.title}`,
      `Nicho: ${template.niche || '—'} · Pack: ${template.pack?.free_pack_id || '—'} · Shot: ${template.shot?.type || '—'} / ${template.shot?.camera || '—'}`,
      '',
      'HOOKS / GUIÓN',
      ...template.script_hooks.map((h, i) => `${i + 1}. ${h}`),
      '',
      'REGLAS DE REALISMO',
      ...(template.realism_rules || []).map((r) => `• ${r}`),
      '',
      'CTA: ' + (template.voice?.cta || '—')
    ].join('\n');
    navigator.clipboard.writeText(block).then(() => {
      toastSuccess(`Plantilla «${template.title}» aplicada · hooks copiados`);
    }).catch(() => {
      toastSuccess(`Plantilla «${template.title}» aplicada al brief`);
    });
  } else {
    toastSuccess(`Plantilla «${template.title}» aplicada al brief`);
  }
  setCommunityTemplateStatus(`Activa: ${template.title} (${template.shot?.type || 'shot'} · ${template.pack?.free_pack_id || 'pack'})`);
  document.getElementById('prodBriefCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderCommunityTemplates() {
  const api = getCommunityTemplatesApi();
  const grid = document.getElementById('communityTemplatesGrid');
  if (!api || !grid) return;
  const list = api.listTemplates();
  grid.innerHTML = list.map((t) => `
    <div style="padding:12px;border-radius:10px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.22);display:flex;flex-direction:column;gap:8px;">
      <div>
        <strong style="display:block;font-size:13px;color:#fff;">${String(t.title).replace(/[<>&]/g, '')}</strong>
        <span style="font-size:11px;color:var(--text-muted);">${String(t.short || '').replace(/[<>&]/g, '')}</span>
      </div>
      <p style="margin:0;font-size:10px;color:var(--text-secondary);line-height:1.35;">
        ${t.pack || '—'} · ${t.shot || '—'} / ${t.camera || '—'}
      </p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;">
        <button type="button" class="btn btn-sm" data-tpl-apply="${t.id}" style="font-size:11px;flex:1;">Aplicar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-tpl-copy="${t.id}" style="font-size:11px;" title="Copiar JSON sin identidad">JSON</button>
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('[data-tpl-apply]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = api.getTemplate(btn.getAttribute('data-tpl-apply'));
      applyCommunityTemplate(tpl);
    });
  });
  grid.querySelectorAll('[data-tpl-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tpl = api.getTemplate(btn.getAttribute('data-tpl-copy'));
      try {
        await navigator.clipboard.writeText(api.toClipboardText(tpl));
        toastSuccess('Plantilla JSON copiada (sin must_match)');
      } catch (err) {
        toastError(err.message || 'No se pudo copiar');
      }
    });
  });
}

function setupCommunityTemplates() {
  const api = getCommunityTemplatesApi();
  if (!api) return;
  renderCommunityTemplates();
  document.getElementById('btnImportCommunityTemplate')?.addEventListener('click', () => {
    const text = document.getElementById('communityTemplateImportText')?.value || '';
    const parsed = api.parseImport(text);
    if (!parsed.ok) {
      setCommunityTemplateStatus(parsed.errors.join(' · '), false);
      toastError(parsed.errors[0] || 'Import inválido');
      return;
    }
    applyCommunityTemplate(parsed.template);
  });
  document.getElementById('btnClearCommunityImport')?.addEventListener('click', () => {
    const ta = document.getElementById('communityTemplateImportText');
    if (ta) ta.value = '';
    setCommunityTemplateStatus('');
  });
}

function setupProductionRecipe() {
  document.getElementById('btnCopyProductionRecipe')?.addEventListener('click', async () => {
    const api = getRecipeApi();
    if (!api) {
      toastError('Módulo de recetas no cargado.');
      return;
    }
    const p = state.selectedPersona;
    const json = typeof getFullPersonaJSON === 'function' ? getFullPersonaJSON() : {};
    const recipe = api.buildRecipe({
      title: `${p?.name || json?.identity?.name || 'Influencer'} · UGC`,
      personaName: p?.name || json?.identity?.name || null,
      lockRevisionId: p?.lockRevisionId || null,
      niche: json?.character_lock?.niche || null,
      shotType: state.ugcShotTypeId || 'testimonial',
      camera: state.ugcCameraId || 'selfie',
      format: '9:16',
      product: state.selectedProduct || null,
      tone: json?.psychology?.communication_style || 'cálido y cercano',
      mbti: json?.psychology?.mbti || null,
      cta: 'Pruébalo y cuéntame',
      packId: 'fullbody',
      character_lock: json?.character_lock
    }, { includeIdentity: false });
    const check = api.validateRecipe(recipe);
    if (!check.ok) {
      toastError(check.errors.join('; '));
      return;
    }
    try {
      await navigator.clipboard.writeText(api.toClipboardText(recipe));
      toastSuccess('Receta de producción copiada (sin must_match — segura para compartir)');
    } catch (err) {
      toastError('No se pudo copiar la receta: ' + (err.message || 'error'));
    }
  });
  document.getElementById('btnCopyG513rRecipe')?.addEventListener('click', async () => {
    const api = getRecipeApi();
    if (!api || typeof api.buildG513rRecipe !== 'function') {
      toastError('Módulo de recetas no cargado.');
      return;
    }
    const p = state.selectedPersona;
    const json = typeof getFullPersonaJSON === 'function' ? getFullPersonaJSON() : {};
    const trigger = (document.getElementById('loraTriggerInput')?.value || '').trim();
    const recipe = api.buildG513rRecipe({
      title: `${p?.name || json?.identity?.name || 'Influencer'} · G513R`,
      personaName: p?.name || json?.identity?.name || null,
      lockRevisionId: p?.lockRevisionId || null,
      niche: json?.character_lock?.niche || null,
      shotType: state.ugcShotTypeId || 'testimonial',
      camera: state.ugcCameraId || 'selfie',
      format: '9:16',
      product: state.selectedProduct || null,
      tone: json?.psychology?.communication_style || 'cálido y cercano',
      mbti: json?.psychology?.mbti || null,
      packId: 'explicit',
      lora_trigger: trigger || undefined,
      character_lock: json?.character_lock
    }, { includeIdentity: false, triggerToken: trigger });
    const text = typeof api.toG513rClipboardText === 'function'
      ? api.toG513rClipboardText(recipe)
      : api.toClipboardText(recipe);
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Receta G513R copiada — LU: Positive y Negative en cajas distintas');
    } catch (err) {
      toastError('No se pudo copiar la receta G513R: ' + (err.message || 'error'));
    }
  });
}

function renderLockLabScore(containerId, side, session) {
  const el = document.getElementById(containerId);
  const api = getLockLabApi();
  if (!el || !api) return;
  const score = side === 'A' ? session.scoreA : session.scoreB;
  const keys = [
    { id: 'face', label: 'Cara' },
    { id: 'skin', label: 'Tez' },
    { id: 'hair', label: 'Pelo' },
    { id: 'silhouette', label: 'Silueta' }
  ];
  el.innerHTML = keys.map((k) => {
    const val = score?.[k.id];
    const checked = val === true ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
      <input type="checkbox" data-lock-lab-side="${side}" data-lock-lab-key="${k.id}" ${checked}> ${k.label}
    </label>`;
  }).join('');
}

async function refreshLockLab() {
  const api = getLockLabApi();
  const selA = document.getElementById('lockLabRevA');
  const selB = document.getElementById('lockLabRevB');
  const recEl = document.getElementById('lockLabRecommendation');
  if (!api || !selA || !selB) return;
  const p = state.selectedPersona;
  if (!p?.id) {
    if (recEl) recEl.textContent = 'Selecciona un influencer con revisiones de lock.';
    return;
  }
  let revisions = [];
  try {
    const res = await authFetch(`/api/personas/${p.id}/lock-revisions`);
    const data = await res.json().catch(() => ({}));
    revisions = Array.isArray(data.revisions) ? data.revisions : (Array.isArray(data) ? data : []);
  } catch (_) {
    revisions = [];
  }
  const opts = revisions.map((r) => {
    const id = r.id || r.revision_id;
    const when = r.created_at || r.createdAt || '';
    return `<option value="${id}">${String(when).slice(0, 19) || id} · ${r.source || 'save'}</option>`;
  }).join('');
  selA.innerHTML = opts || '<option value="">Sin revisiones</option>';
  selB.innerHTML = opts || '<option value="">Sin revisiones</option>';
  const session = api.load(activationProfileId(), p.id);
  if (session.revisionA && [...selA.options].some((o) => o.value === session.revisionA)) {
    selA.value = session.revisionA;
  } else if (selA.options.length > 1) {
    selA.selectedIndex = Math.min(1, selA.options.length - 1);
  }
  if (session.revisionB && [...selB.options].some((o) => o.value === session.revisionB)) {
    selB.value = session.revisionB;
  } else if (selB.options.length) {
    selB.selectedIndex = 0;
  }
  session.revisionA = selA.value || null;
  session.revisionB = selB.value || null;
  renderLockLabScore('lockLabScoreA', 'A', session);
  renderLockLabScore('lockLabScoreB', 'B', session);
  const rec = api.recommend(session);
  if (recEl) recEl.textContent = api.recommendationLabel(rec);
}

function setupLockLab() {
  document.getElementById('btnRefreshLockLab')?.addEventListener('click', () => refreshLockLab());
  document.getElementById('btnLockLabCopyPrompts')?.addEventListener('click', () => {
    copyChatbotSessionCheck({ openChecklist: false });
  });
  document.getElementById('btnLockLabSave')?.addEventListener('click', () => {
    const api = getLockLabApi();
    const p = state.selectedPersona;
    if (!api || !p?.id) {
      toastInfo('Selecciona un influencer primero.');
      return;
    }
    const session = api.load(activationProfileId(), p.id);
    session.revisionA = document.getElementById('lockLabRevA')?.value || null;
    session.revisionB = document.getElementById('lockLabRevB')?.value || null;
    session.scoreA = api.emptyScore();
    session.scoreB = api.emptyScore();
    document.querySelectorAll('[data-lock-lab-side]').forEach((input) => {
      const side = input.getAttribute('data-lock-lab-side');
      const key = input.getAttribute('data-lock-lab-key');
      if (side === 'A') session.scoreA[key] = !!input.checked;
      if (side === 'B') session.scoreB[key] = !!input.checked;
    });
    const rec = api.recommend(session);
    session.recommendation = rec;
    api.save(activationProfileId(), p.id, session);
    const recEl = document.getElementById('lockLabRecommendation');
    if (recEl) recEl.textContent = api.recommendationLabel(rec);
    toastSuccess('Evaluación Lock lab guardada (local)');
  });
  document.getElementById('lockLabPanel')?.addEventListener('change', (e) => {
    if (!e.target?.matches?.('[data-lock-lab-side]')) return;
    const api = getLockLabApi();
    const p = state.selectedPersona;
    if (!api || !p?.id) return;
    const session = api.load(activationProfileId(), p.id);
    session.scoreA = api.emptyScore();
    session.scoreB = api.emptyScore();
    document.querySelectorAll('[data-lock-lab-side]').forEach((input) => {
      const side = input.getAttribute('data-lock-lab-side');
      const key = input.getAttribute('data-lock-lab-key');
      if (side === 'A') session.scoreA[key] = !!input.checked;
      if (side === 'B') session.scoreB[key] = !!input.checked;
    });
    const rec = api.recommend(session);
    const recEl = document.getElementById('lockLabRecommendation');
    if (recEl) recEl.textContent = api.recommendationLabel(rec);
  });
}

function currentDraftProfileId() {
  return state.currentProfile?.id || state.profileId || 'anon';
}

function currentDraftMode() {
  return state.isCreatingNewPersona ? 'create' : (state.selectedPersona?.id ? 'create' : 'create');
}

function hidePersonaDraftBanner() {
  const el = document.getElementById('personaDraftBanner');
  if (el) el.style.display = 'none';
}

function showPersonaDraftBanner(draft) {
  const api = getPersonaDraftApi();
  if (!api || !draft) return;
  let el = document.getElementById('personaDraftBanner');
  const personaForm = document.getElementById('personaForm');
  if (!el && personaForm?.parentElement) {
    el = document.createElement('div');
    el.id = 'personaDraftBanner';
    el.setAttribute('role', 'status');
    el.style.cssText = 'display:none;margin:0 0 12px 0;padding:10px 14px;border-radius:10px;border:1px solid rgba(234,179,8,0.35);background:rgba(234,179,8,0.12);color:#fde68a;font-size:12px;line-height:1.4;';
    personaForm.parentElement.insertBefore(el, personaForm);
  }
  if (!el) return;
  el.style.display = 'flex';
  el.style.flexWrap = 'wrap';
  el.style.gap = '8px';
  el.style.alignItems = 'center';
  el.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = api.bannerText(draft);
  el.appendChild(text);
  const btnKeep = document.createElement('button');
  btnKeep.type = 'button';
  btnKeep.className = 'btn btn-sm';
  btnKeep.textContent = 'Continuar';
  btnKeep.addEventListener('click', () => {
    api.applyDraftToForm(draft);
    try { compilePromptAndJSON(); } catch (_) {}
    hidePersonaDraftBanner();
    toastSuccess('Borrador restaurado');
  });
  const btnDiscard = document.createElement('button');
  btnDiscard.type = 'button';
  btnDiscard.className = 'btn btn-secondary btn-sm';
  btnDiscard.textContent = 'Descartar';
  btnDiscard.addEventListener('click', () => {
    api.clearDraft(currentDraftProfileId(), draft.mode || 'create');
    hidePersonaDraftBanner();
    toastInfo('Borrador descartado');
  });
  el.appendChild(btnKeep);
  el.appendChild(btnDiscard);
}

function schedulePersonaDraftSave() {
  const api = getPersonaDraftApi();
  if (!api) return;
  if (state._personaDraftTimer) clearTimeout(state._personaDraftTimer);
  state._personaDraftTimer = setTimeout(() => {
    try {
      const formApi = (typeof InfluPersonaForm !== 'undefined' ? InfluPersonaForm : window.InfluPersonaForm);
      if (!formApi?.readPersonaForm) return;
      const form = formApi.readPersonaForm();
      if (!form?.name && !form?.skinTone && !form?.eyeColor) return;
      api.saveDraft({
        profileId: currentDraftProfileId(),
        mode: 'create',
        form
      });
    } catch (_) { /* ignore */ }
  }, 600);
}

function maybeOfferPersonaDraft() {
  const api = getPersonaDraftApi();
  if (!api) return;
  const draft = api.loadDraft(currentDraftProfileId(), 'create');
  if (!draft?.form) return;
  const hasContent = Object.values(draft.form).some((v) => String(v || '').trim());
  if (!hasContent) return;
  showPersonaDraftBanner(draft);
}

function setupPersonaEngine() {
  const formInputs = document.querySelectorAll('#personaForm input, #personaForm select');
  formInputs.forEach(input => {
    input.addEventListener('input', () => {
      compilePromptAndJSON();
      schedulePersonaDraftSave();
    });
  });
  
  // Update clothing select whenever gender select changes
  document.getElementById('pGender').addEventListener('change', () => {
    updateClothingDropdown();
    compilePromptAndJSON();
    schedulePersonaDraftSave();
  });

  // Init clothing + setting lists (includes beach / swimwear)
  updateClothingDropdown();
  updateSettingDropdown();
  
  document.getElementById('btnSavePersona')?.addEventListener('click', () => savePersona({ withPortrait: false }));
  document.getElementById('btnSavePersonaWithPortrait')?.addEventListener('click', () => savePersona({ withPortrait: true }));
  document.getElementById('btnApplyEthnicityTezClara')?.addEventListener('click', () => {
    applyLatinaTezClaraSuggestion();
  });
  document.getElementById('btnDeletePersona').addEventListener('click', deletePersonaAction);

  maybeOfferPersonaDraft();

  // Sync color picker ↔ hex text
  const hexText = document.getElementById('pSkinToneHex');
  const hexPicker = document.getElementById('pSkinToneHexPicker');
  if (hexText && hexPicker) {
    const syncPicker = () => {
      const v = (hexText.value || '').trim();
      const n = v.startsWith('#') ? v : `#${v}`;
      if (/^#[0-9a-fA-F]{6}$/.test(n)) hexPicker.value = n.toLowerCase();
    };
    hexText.addEventListener('change', syncPicker);
    hexText.addEventListener('input', syncPicker);
    hexPicker.addEventListener('input', () => {
      hexText.value = hexPicker.value;
      try { compilePromptAndJSON(); } catch (_) {}
    });
  }

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
      if (typeof setPersonaStep === 'function') setPersonaStep(3);
      const vault = document.getElementById('variantManagerSection');
      if (vault) vault.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else {
        const sceneInput = document.getElementById('sceneDescriptionInput');
        if (sceneInput) {
          sceneInput.focus();
          sceneInput.scrollIntoView({ behavior: 'smooth' });
        }
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
    // F1 — validar lo que realmente se copió (el textarea puede estar editado a mano)
    let parsed = null;
    try { parsed = JSON.parse(jsonArea.value); } catch (e) {}
    if (parsed && typeof parsed === 'object') {
      markHappyPathCopied();
      toastWithLockHealth('Estructura JSON copiada al portapapeles', parsed);
    } else {
      toastSuccess('Estructura JSON copiada al portapapeles');
    }
  });

  document.getElementById('btnCopyChatbotPrompt').addEventListener('click', () => {
    const exportText = buildChatbotExportText({ includePrompt: true });
    navigator.clipboard.writeText(exportText);
    markHappyPathCopied();
    toastWithLockHealth('📋 Prompt + JSON copiados (consola) — para pack completo usa «Copiar JSON» en la ficha', getFullPersonaJSON());
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
        toastSuccess('⭐ Prompt y miniatura guardados en la Galería', {
          actionLabel: 'Ver galería',
          onAction: () => navigateToTab('gallery')
        });
        if (state.activeTab === 'gallery') renderGallery();
      }
    } catch (err) {
      toastError('Error al guardar en la galería.');
    }
  });

  document.getElementById('btnOpenGalleryFromFicha')?.addEventListener('click', () => {
    navigateToTab('gallery');
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
        toastSuccess(`¡${label} copiado al portapapeles!`);
      }
    });
  }
}

function compilePromptAndJSON() {
  const formApi = (typeof InfluPersonaForm !== 'undefined' ? InfluPersonaForm : window.InfluPersonaForm);
  const f = formApi.readPersonaForm();
  const name = f.name;
  const gender = f.gender;
  const age = f.age;
  const ethnicity = f.ethnicity;
  const style = f.style;
  const hair = f.hair;
  const lighting = f.lighting;
  const camera = f.camera;
  const clothing = f.clothing;
  const setting = f.setting;
  
  // High-fidelity facial & body details
  const skinTone = f.skinTone;
  const skinTexture = f.skinTexture;
  const hairColor = f.hairColor;
  const hairTexture = f.hairTexture;
  const hairLength = f.hairLength;
  const eyebrows = f.eyebrows;
  const eyeColor = f.eyeColor;
  const lips = f.lips;
  const faceShape = f.faceShape;
  const smileType = f.smileType;
  const bodyType = f.bodyType || 'Atlético y proporcionado';
  const height = f.height || 'Estatura media';
  const proportions = f.proportions || '';
  const posture = f.posture || '';
  const fitness = f.fitness || '';
  const bodySkin = f.bodySkin || '';
  
  // Get hex codes from detailedJSON for color precision
  let skinHex = '', hairHex = '', skinLock = '', skinAvoid = '';
  try {
    const parsed = parseDetailedJSON(state.selectedPersona?.detailedJSON);
    skinHex = parsed.facial_features?.skin_tone_hex || '';
    hairHex = parsed.hair?.color_hex || '';
    skinLock = parsed.facial_features?.skin_lock || '';
    skinAvoid = parsed.facial_features?.skin_avoid || '';
  } catch(e) {}

  const prompt = _promptBuilder().buildFormPrompt({
    name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting,
    skinTone, skinTexture, hairColor, hairTexture, hairLength, eyebrows, eyeColor,
    lips, faceShape, smileType, bodyType, height, proportions, posture, fitness, bodySkin,
    skinHex, hairHex, skinLock, skinAvoid
  });
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

  // F1 — salud del character_lock (valida exactamente el JSON que se copiará)
  renderLockHealth(jsonConfig);
  refreshIdentityLockHints(jsonConfig);
}

/**
 * Idea #2 — aviso Latina + tez clara en Identidad (antes de guardar/copiar).
 */
function refreshIdentityLockHints(personaJSON) {
  const hint = document.getElementById('identityLockHint');
  const hintText = document.getElementById('identityLockHintText');
  const inline = document.getElementById('identityLockHealthInline');
  const ethEl = document.getElementById('pEthnicity');
  const skinEl = document.getElementById('pSkinTone');
  const hexEl = document.getElementById('pSkinToneHex');

  let fix = null;
  if (typeof CharacterLockValidator !== 'undefined' && CharacterLockValidator.suggestLatinaLightSkinFix) {
    const eth = ethEl?.value || personaJSON?.identity?.ethnicity_appearance || '';
    const tone = skinEl?.value || personaJSON?.facial_features?.skin_tone || '';
    const hex = hexEl?.value || personaJSON?.facial_features?.skin_tone_hex || '';
    fix = CharacterLockValidator.suggestLatinaLightSkinFix(eth, tone, hex);
  }
  if (hint && hintText) {
    if (fix) {
      hint.hidden = false;
      hintText.textContent = fix.message;
    } else {
      hint.hidden = true;
      hintText.textContent = '';
    }
  }

  if (inline && typeof CharacterLockValidator !== 'undefined') {
    let v = null;
    try {
      v = CharacterLockValidator.validateCharacterLock(personaJSON || getFullPersonaJSON());
    } catch (_) { v = null; }
    if (v) {
      inline.hidden = false;
      inline.className = `lock-health-inline lock-${v.grade}`;
      inline.textContent = `Lock ${v.gradeLabel} · ${v.score}%`;
      inline.title = v.summary || '';
    } else {
      inline.hidden = true;
      inline.textContent = '';
    }
  }
}

function applyLatinaTezClaraSuggestion() {
  const ethEl = document.getElementById('pEthnicity');
  const suggested = (typeof CharacterLockValidator !== 'undefined' && CharacterLockValidator.LATINA_TEZ_CLARA)
    || 'Latina de tez clara';
  if (ethEl) {
    ethEl.value = suggested;
    ethEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  try { compilePromptAndJSON(); } catch (_) {}
  toastSuccess('Origen actualizado a «Latina de tez clara» — mejor ancla free.');
}

/**
 * F1 — Panel de salud del character_lock (validador local, gratis).
 * Se refresca en cada compilePromptAndJSON para reflejar el formulario en vivo.
 */
function renderLockHealth(personaJSON) {
  const panel = document.getElementById('lockHealthPanel');
  if (!panel || typeof CharacterLockValidator === 'undefined') return;
  let v;
  try {
    v = CharacterLockValidator.validateCharacterLock(personaJSON);
  } catch (e) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const issues = [...v.errors, ...v.warnings, ...v.infos];
  const countLabel = issues.length === 0
    ? 'sin avisos'
    : `${issues.length} aviso${issues.length === 1 ? '' : 's'}`;
  panel.innerHTML = `
    <button type="button" class="lock-health-head lock-${v.grade}" id="lockHealthToggle" aria-expanded="false">
      <span class="lock-health-title"><span class="lock-health-dot">●</span> Character lock: <strong>${v.gradeLabel}</strong> · ${v.score}%</span>
      <span class="lock-health-count">${countLabel}${issues.length ? ' <span class="lock-health-caret">▾</span>' : ''}</span>
    </button>
    ${issues.length ? `<ul class="lock-health-list" id="lockHealthList" style="display:none;">${issues.map(i => `
      <li class="lock-issue lock-issue-${i.level}">
        <span class="lock-issue-badge">${i.level === 'error' ? '✕' : i.level === 'warning' ? '!' : 'i'}</span>
        <span class="lock-issue-text">${escapeLockHtml(i.message)}${i.hint ? ` <em>${escapeLockHtml(i.hint)}</em>` : ''}</span>
      </li>`).join('')}</ul>` : ''}
  `;
  const toggle = document.getElementById('lockHealthToggle');
  const list = document.getElementById('lockHealthList');
  if (toggle && list) {
    toggle.addEventListener('click', () => {
      const open = list.style.display !== 'none';
      list.style.display = open ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.classList.toggle('open', !open);
    });
  }
}

function escapeLockHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * W12 — Historial de character_lock (revisiones locales, cap 20).
 */
function setupLockRevisions() {
  document.getElementById('btnRefreshLockRevisions')?.addEventListener('click', () => {
    refreshLockRevisions({ force: true });
  });
  const list = document.getElementById('lockRevisionsList');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('[data-lock-rev-action]');
      if (!btn) return;
      const revId = btn.getAttribute('data-rev-id');
      const action = btn.getAttribute('data-lock-rev-action');
      if (!revId || !action) return;
      if (action === 'diff') {
        await showLockRevisionDiff(revId);
      } else if (action === 'restore') {
        await restoreLockRevision(revId);
      }
    });
  }
}

function formatLockRevisionWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return String(iso).slice(0, 19);
  }
}

async function refreshLockRevisions(opts = {}) {
  const panel = document.getElementById('lockRevisionsPanel');
  const list = document.getElementById('lockRevisionsList');
  const diffEl = document.getElementById('lockRevisionDiff');
  if (!panel || !list) return;

  const personaId = state.selectedPersona?.id;
  if (!personaId) {
    panel.style.display = 'none';
    list.innerHTML = '';
    if (diffEl) {
      diffEl.style.display = 'none';
      diffEl.textContent = '';
    }
    return;
  }

  panel.style.display = 'block';
  if (!opts.force && list.dataset.personaId === personaId && list.childElementCount) {
    return;
  }
  list.dataset.personaId = personaId;
  list.innerHTML = '<div class="lock-revisions-empty">Cargando versiones…</div>';
  if (diffEl) {
    diffEl.style.display = 'none';
    diffEl.textContent = '';
  }

  try {
    const res = await authFetch(`/api/personas/${personaId}/lock-revisions`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      list.innerHTML = `<div class="lock-revisions-empty">${escapeLockHtml(data.message || 'No se pudo cargar el historial.')}</div>`;
      return;
    }
    const revisions = Array.isArray(data.revisions) ? data.revisions : [];
    if (!revisions.length) {
      list.innerHTML = '<div class="lock-revisions-empty">Aún no hay versiones. Guarda el influencer para anclar el primer lock.</div>';
      return;
    }
    list.innerHTML = revisions.map((r, idx) => {
      const score = r.health_score != null ? `${r.health_score}%` : '—';
      const source = escapeLockHtml(r.source || 'save');
      const when = escapeLockHtml(formatLockRevisionWhen(r.created_at));
      const latest = idx === 0 ? ' <span class="lock-rev-badge">actual</span>' : '';
      return `
        <div class="lock-rev-row" data-rev-id="${escapeLockHtml(r.id)}">
          <div class="lock-rev-meta">
            <span class="lock-rev-when">${when}</span>
            <span class="lock-rev-source">${source}${latest}</span>
            <span class="lock-rev-score">salud ${escapeLockHtml(score)}</span>
          </div>
          <div class="lock-rev-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-lock-rev-action="diff" data-rev-id="${escapeLockHtml(r.id)}">Diff</button>
            <button type="button" class="btn btn-secondary btn-sm" data-lock-rev-action="restore" data-rev-id="${escapeLockHtml(r.id)}" ${idx === 0 ? 'disabled title="Ya es la versión actual"' : ''}>Restaurar</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div class="lock-revisions-empty">${escapeLockHtml(err.message || 'Error de red')}</div>`;
  }
}

function formatLockDiffText(diff) {
  if (!diff || !Array.isArray(diff.changes) || !diff.changes.length) {
    return 'Sin diferencias vs el lock actual.';
  }
  return diff.changes.map((c) => {
    const before = c.before == null ? '∅' : (typeof c.before === 'string' ? c.before : JSON.stringify(c.before));
    const after = c.after == null ? '∅' : (typeof c.after === 'string' ? c.after : JSON.stringify(c.after));
    return `• ${c.path}\n  revisión: ${before}\n  actual:   ${after}`;
  }).join('\n\n');
}

async function showLockRevisionDiff(revId) {
  const personaId = state.selectedPersona?.id;
  const diffEl = document.getElementById('lockRevisionDiff');
  if (!personaId || !diffEl) return;
  diffEl.style.display = 'block';
  diffEl.textContent = 'Comparando…';
  try {
    const res = await authFetch(`/api/personas/${personaId}/lock-revisions/${revId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      diffEl.textContent = data.message || 'No se pudo obtener el diff.';
      return;
    }
    const header = `Diff revisión → lock actual (${(data.diff?.changes || []).length} cambio(s))\n\n`;
    diffEl.textContent = header + formatLockDiffText(data.diff);
  } catch (err) {
    diffEl.textContent = err.message || 'Error de red';
  }
}

async function restoreLockRevision(revId) {
  const personaId = state.selectedPersona?.id;
  if (!personaId) return;
  const ok = window.confirm(
    '¿Restaurar esta versión del character_lock?\n\nSe sobrescribe el lock actual y se guarda una nueva revisión. El resto de la ficha no se borra.'
  );
  if (!ok) return;
  try {
    toastLoading('Restaurando character_lock…');
    const res = await authFetch(`/api/personas/${personaId}/lock-revisions/${revId}/restore`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      toastError(data.message || 'No se pudo restaurar.');
      return;
    }
    if (Array.isArray(data.personas)) state.personas = data.personas;
    const saved = data.persona || state.personas.find((p) => p.id === personaId);
    if (saved) {
      try { selectPersona(saved); } catch (e) { console.warn(e); }
    }
    toastSuccess('character_lock restaurado. Revisa salud y packs free.');
    await refreshLockRevisions({ force: true });
  } catch (err) {
    toastError(err.message || 'Error al restaurar.');
  }
}

/**
 * F1 — Copiar nunca se bloquea (happy path free primero), pero si el lock
 * tiene errores/avisos el toast lo dice con el problema más grave.
 */
function toastWithLockHealth(successMessage, personaJSON, toastOpts = {}) {
  if (typeof CharacterLockValidator === 'undefined') {
    toastSuccess(successMessage, toastOpts);
    return;
  }
  try {
    const v = CharacterLockValidator.validateCharacterLock(personaJSON);
    const top = v.errors[0] || v.warnings[0];
    if (!top) {
      toastSuccess(successMessage, toastOpts);
      return;
    }
    toastInfo(`${successMessage} — ojo, lock ${v.gradeLabel.toLowerCase()} (${v.score}%): ${top.message}`, toastOpts);
  } catch (e) {
    toastSuccess(successMessage, toastOpts);
  }
}

async function savePersona(opts = {}) {
  const withPortrait = opts === true || opts?.withPortrait === true;
  const formApi = (typeof InfluPersonaForm !== 'undefined' ? InfluPersonaForm : window.InfluPersonaForm);
  const { name, gender, age, ethnicity, style, hair, lighting, camera, clothing, setting } = formApi.readPersonaRowFields();
  if (!name) {
    toastError('Indica un nombre para el influencer antes de guardar.');
    return;
  }

  // Create mode is sticky until selectPersona / successful create selects the new one
  const creatingNew = state.isCreatingNewPersona === true || !state.selectedPersona?.id;

  // Corte E / U6 — diff must_match antes de sobrescribir identidad
  if (!creatingNew && state.selectedPersona?.id && !opts._skipMustMatchConfirm) {
    try {
      const dialogs = getDialogsApi();
      let prevMust = {};
      const stored = parseDetailedJSON(state.selectedPersona.detailedJSON);
      if (stored?.character_lock?.must_match_every_image) {
        prevMust = stored.character_lock.must_match_every_image;
      }
      const nextJson = getFullPersonaJSON();
      const nextMust = nextJson?.character_lock?.must_match_every_image || {};
      const changes = dialogs
        ? dialogs.diffMustMatch(prevMust, nextMust)
        : [];
      if (changes.length) {
        const text = dialogs.formatMustMatchDiff(changes);
        const ok = window.confirm(
          `Cambios de identidad (must_match):\n\n${text}\n\nEsto puede cambiar la persona en futuras imágenes.\n\n¿Guardar nueva identidad?`
        );
        if (!ok) {
          toastInfo('Guardado cancelado — se mantiene el lock anterior.');
          return;
        }
      }
    } catch (_) { /* no bloquear save si falla el diff */ }
  }

  // Idea #2 — soft nudge (no bloquea): Latina + tez clara sin corrección
  if (typeof CharacterLockValidator !== 'undefined' && CharacterLockValidator.suggestLatinaLightSkinFix) {
    const tone = document.getElementById('pSkinTone')?.value || '';
    const hex = document.getElementById('pSkinToneHex')?.value || '';
    const fix = CharacterLockValidator.suggestLatinaLightSkinFix(ethnicity || document.getElementById('pEthnicity')?.value || '', tone, hex);
    if (fix && !state._latinaTezNudgeShown) {
      state._latinaTezNudgeShown = true;
      toastInfo(`${fix.message} Puedes pulsar «Usar Latina de tez clara» en Identidad.`, {
        actionLabel: 'Usar sugerencia',
        onAction: () => applyLatinaTezClaraSuggestion(),
        duration: 9000
      });
    }
  }

  const promptText = document.getElementById('promptPreview').textContent;
  const influencerName = name || 'Influencer';
  toastLoading(creatingNew
    ? (withPortrait
      ? `Creando "${influencerName}" + retrato Pollinations...`
      : `Guardando influencer "${influencerName}" (solo JSON)...`)
    : (withPortrait
      ? `Guardando y generando retrato de ${influencerName}...`
      : `Guardando "${influencerName}"...`));
  
  let portraitPath = null;
  // JSON-first: Pollinations solo si el usuario pide retrato
  if (withPortrait) {
    try {
      QueuePoller.start();
      const imgRes = await authFetch('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText,
          // Never borrow another persona's face when creating new
          referenceLocalPath: getUploadedImagePath() || (creatingNew ? null : state.selectedPersona?.image),
          personaId: creatingNew ? 'new_persona' : (state.selectedPersona?.id || 'new_persona'),
          generationType: 'portrait'
        })
      });
      const imgData = await imgRes.json();
      if (imgData.success && imgData.imagePath) {
        portraitPath = imgData.imagePath;
      } else if (imgData && !imgData.success) {
        notifyGenerationFailure(imgData);
      }
    } catch (err) {
      console.warn('Image generation failed or offline. Using reference or existing image.');
      notifyGenerationFailure(null, err);
    }
  }

  const finalImage = portraitPath
    || getUploadedImagePath()
    || (creatingNew ? null : state.selectedPersona?.image)
    || (gender === 'Male' ? 'assets/influencer_male.png' : 'assets/nano_banana_influencer.png');
  const finalImageUGC = portraitPath
    || getUploadedImagePath()
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
      setUploadedImagePath(null);
      state.isCreatingNewPersona = false;
      try {
        const draftApi = getPersonaDraftApi();
        draftApi?.clearDraft(currentDraftProfileId(), 'create');
        hidePersonaDraftBanner();
      } catch (_) {}

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
      
      // W14 — tras primer save: CTA único = copiar pack (no generar imagen)
      if (creatingNew) {
        if (typeof setStep2Focus === 'function') setStep2Focus(true, { updateHint: false });
        if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: false });
        toastSuccess(`«${name}» guardado. Siguiente: Copiar JSON — pack fullbody, sin gen.`, {
          actionLabel: 'Copiar JSON',
          onAction: () => {
            copyFreeChatbotPack('fullbody');
          },
          duration: 10000,
          gitOk: true
        });
      } else {
        toastSuccess(withPortrait
          ? `¡Persona "${name}" guardada${portraitPath ? ' con retrato' : ''}!`
          : `¡Persona "${name}" guardada!`);
      }
      if (data.lockRevision?.created || data.lockRevision?.healthDropped) {
        try { await refreshLockRevisions({ force: true }); } catch (_) {}
      }
      if (data.lockRevision?.healthDropped) {
        const prev = data.lockRevision.previousHealthScore;
        const next = data.lockRevision.healthScore;
        toastInfo(
          `Ojo: el character_lock bajó de salud (${prev ?? '?'}% → ${next ?? '?'}%). Revisa «Versiones del character_lock» si perdiste cara/tez/pelo.`
        );
      }
      renderHappyPathChecklist();
      try {
        markStudioActivation('create');
        markStudioActivation('save');
        renderStudioActivation();
        refreshLockLab();
      } catch (_) {}
    } else {
      notifyApiError(data, data.message || 'No se pudo guardar la persona.');
    }
  } catch (err) {
    toastError('Error de servidor al guardar.');
  }
}

window.savePersona = savePersona;

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
    prodSelect.innerHTML = (state.products || []).length
      ? state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
      : '<option value="">Sin productos — crea uno en Guiones</option>';
    
    const personaList = document.getElementById('cPersonaChecklist');
    const roster = (state.personas || []).filter((p) => !isArchivedPersona(p));
    const activeId = state.selectedPersona?.id;
    if (!roster.length) {
      personaList.innerHTML = '<p class="u-fs-11-sec u-mb-0">Sin influencers — elige o crea uno en el chip del header.</p>';
    } else {
      personaList.innerHTML = roster.map(p => `
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
        <input type="checkbox" name="personaCheck" value="${p.id}"${String(p.id) === String(activeId) ? ' checked' : ''}>
        <span>${p.name}</span>
      </label>
    `).join('');
    }
    
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

  // UX-3a — cablear Regenerar Scripts → gen (Gemini o mock) + POST /api/campaigns/:id/scripts
  document.getElementById('btnGenerateCampaignScripts')?.addEventListener('click', () => {
    generateCampaignScriptsAction();
  });
}

/** UX-3a — genera 10 scripts para la campaña seleccionada y los persiste. */
async function generateCampaignScriptsAction() {
  const campaign = state.selectedCampaign;
  if (!campaign) {
    toastInfo('Selecciona una campaña primero.');
    return;
  }
  const btn = document.getElementById('btnGenerateCampaignScripts');
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generando scripts…';
  }

  const product = campaign.product || state.selectedProduct || {
    name: campaign.name || 'Producto',
    benefit: '',
    audience: '',
    frustration: ''
  };
  const persona = (campaign.personas && campaign.personas[0]) || state.selectedPersona || null;

  let scripts = null;
  try {
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    if (statusData.apiConnected && persona) {
      const aiRes = await authFetch('/api/ai/generate-scripts', {
        method: 'POST',
        body: JSON.stringify({ product, persona, count: 10 })
      });
      const aiData = await aiRes.json();
      if (aiData.success && Array.isArray(aiData.scripts) && aiData.scripts.length) {
        scripts = aiData.scripts;
      }
    }
  } catch (err) {
    console.warn('Campaign script AI gen failed, using offline templates:', err);
  }

  if (!scripts) {
    // Offline templates (same shape as generateMockScripts)
    const prevProduct = state.selectedProduct;
    const prevPersona = state.selectedPersona;
    state.selectedProduct = product;
    if (persona) state.selectedPersona = persona;
    generateMockScripts();
    scripts = state.scripts.slice();
    state.selectedProduct = prevProduct;
    state.selectedPersona = prevPersona;
  }

  try {
    const res = await authFetch(`/api/campaigns/${campaign.id}/scripts`, {
      method: 'POST',
      body: JSON.stringify({ scripts })
    });
    const data = await res.json();
    if (!data.success) {
      toastError(data.message || 'No se pudieron guardar los scripts.');
      return;
    }
    state.scripts = data.scripts || scripts;
    // Refresh count from truth after save (avoid double-count on regenerate)
    try {
      const dataRes = await authFetch('/api/data');
      const boot = await dataRes.json();
      if (Number.isFinite(boot.scriptsCount)) state.scriptsCount = boot.scriptsCount;
      updateDashboardStats();
    } catch (_) {}
    if (campaign) campaign.scripts = state.scripts;
    toastSuccess(`✍️ ${state.scripts.length} scripts guardados en la campaña.`);
  } catch (err) {
    toastError('Error de red al guardar scripts de campaña.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || '✍️ Regenerar guiones';
    }
  }
}

async function renderCampaigns() {
  const listGrid = document.getElementById('campaignListGrid');
  listGrid.innerHTML = '<p class="u-color-secondary">Cargando campañas...</p>';
  
  try {
    const res = await authFetch('/api/campaigns');
    const campaigns = await res.json();
    state.campaigns = campaigns;
    
    listGrid.innerHTML = '';
    const btnNewCampaign = document.getElementById('btnNewCampaign');
    if (campaigns.length === 0) {
      // UX-3f: un solo CTA (ocultar el del header); happy path si no hay roster
      if (btnNewCampaign) btnNewCampaign.hidden = true;
      const roster = (state.personas || []).filter((p) => !isArchivedPersona(p));
      const hasRoster = roster.length > 0;
      listGrid.innerHTML = `
        <div class="empty-roster-panel" style="padding: 8px 0;">
          <p class="empty-roster-lead u-mb-12">${
            hasRoster
              ? 'Aún no hay campañas. Agrupa influencers + producto y exporta un ZIP comercial.'
              : 'Sin influencers todavía. Crea uno, copia el JSON, y después arma campañas.'
          }</p>
          <div class="empty-roster-actions">
            ${hasRoster
              ? '<button type="button" class="btn btn-sm" id="btnEmptyCampaignCreate">+ Nueva Campaña</button>'
              : '<button type="button" class="btn btn-sm" id="btnEmptyCampaignCreatePersona">Crear influencer</button>'}
          </div>
        </div>`;
      document.getElementById('btnEmptyCampaignCreate')?.addEventListener('click', () => {
        if (btnNewCampaign) {
          btnNewCampaign.hidden = false;
          btnNewCampaign.click();
        }
      });
      document.getElementById('btnEmptyCampaignCreatePersona')?.addEventListener('click', () => {
        if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
        if (typeof setPersonaStep === 'function') setPersonaStep(1, { scroll: true });
        if (typeof startCreateScratchFlow === 'function') {
          try { startCreateScratchFlow(); } catch (_) {}
        }
      });
      return;
    }
    if (btnNewCampaign) btnNewCampaign.hidden = false;
    
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
    listGrid.innerHTML = '<p class="u-color-secondary">Error al recuperar listado de campañas.</p>';
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
    const cardApi = (typeof InfluPersonaCard !== 'undefined' ? InfluPersonaCard : window.InfluPersonaCard);
    c.personas.forEach(p => {
      personasGrid.appendChild(cardApi.buildCampaignPersonaCard(p));
    });
  } else {
    personasGrid.innerHTML = '<p class="text-muted-sm">Sin influencers asignados.</p>';
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
          toastSuccess('Guiones generados con Gemini.');
          document.getElementById('btnGenerateScripts').textContent = 'Generar 10 guiones (plantillas locales / Gemini opt-in)';
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
    document.getElementById('btnGenerateScripts').textContent = 'Generar 10 guiones (plantillas locales / Gemini opt-in)';
    toastSuccess(data.gitSynced
      ? 'Producto guardado. Guiones locales listos (backup git OK).'
      : 'Producto guardado. Guiones locales listos.');
  }
}

function generateMockScripts() {
  const fromForm = {
    name: document.getElementById('prodName')?.value?.trim() || '',
    benefit: document.getElementById('prodBenefit')?.value?.trim() || '',
    audience: document.getElementById('prodAudience')?.value?.trim() || '',
    frustration: document.getElementById('prodFrustration')?.value?.trim() || ''
  };
  const prod = state.selectedProduct || {
    name: fromForm.name || 'tu producto',
    benefit: fromForm.benefit || 'beneficio clave',
    audience: fromForm.audience || 'tu audiencia',
    frustration: fromForm.frustration || 'una frustración real'
  };
  
  const creator = state.selectedPersona?.name || 'tu influencer';
  
  // 10 distinct marketing angles (local templates; Gemini opt-in when API connected)
  // Nota: strings con ${prod.name} se interpolan abajo vía replaceAll.
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
      cta: "Compra inteligente. Consigue ${prod.name} tocando el botón."
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

  // Interpolar placeholders ${prod.*} / ${creator} (templates en comillas dobles)
  const fill = (s) => String(s || '')
    .replace(/\$\{prod\.name\}/g, prod.name)
    .replace(/\$\{prod\.benefit\}/g, prod.benefit)
    .replace(/\$\{prod\.audience\}/g, prod.audience)
    .replace(/\$\{prod\.frustration\}/g, prod.frustration)
    .replace(/\$\{creator\}/g, creator);
  state.scripts = state.scripts.map((sc) => {
    const out = {};
    for (const [k, v] of Object.entries(sc)) out[k] = fill(v);
    return out;
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

  // Free path: el CTA verde debe COPIAR el pack (no solo navegar a la ficha).
  document.getElementById('btnExportUgcChatbot').addEventListener('click', async () => {
    if (!state.selectedPersona && !document.getElementById('pName')?.value) {
      toastInfo('Elige un influencer (chip del header o Influencers) antes de copiar el pack UGC.', {
        actionLabel: 'Ir a Influencers',
        onAction: () => navigateToTab('persona-engine')
      });
      return;
    }
    try {
      await copyFreeChatbotPack('product');
    } catch (err) {
      console.warn('UGC Copiar JSON:', err);
      toastError('No se pudo copiar el pack.');
    }
  });

  // Download Master JSON Pack
  const btnDownloadJson = document.getElementById('btnDownloadJsonPack');
  if (btnDownloadJson) {
    btnDownloadJson.addEventListener('click', () => {
      const personaJSON = getFullPersonaJSON();
      const filename = `${(personaJSON.identity?.name || personaJSON.name || 'influencer').toLowerCase().replace(/\s+/g, '_')}_master_pack.json`;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(personaJSON, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      markHappyPathCopied();
      if (typeof toastSuccess === 'function') {
        toastSuccess(`📥 Pack JSON descargado: ${filename}`);
      }
    });
  }

  const wireExportZip = (btnId, opts = {}) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => exportPersonaZipPack(opts));
  };
  wireExportZip('btnExportPersonaZip');
  wireExportZip('btnExportPersonaZipSheet');
  wireExportZip('btnExportBrandKit', { kit: true });
  wireExportZip('btnExportBrandKitSheet', { kit: true });

  const btnLoraSheet = document.getElementById('btnExportLoraPackSheet');
  if (btnLoraSheet) btnLoraSheet.addEventListener('click', () => exportLoraTrainingPack());
  const btnRegisterLora = document.getElementById('btnRegisterLora');
  if (btnRegisterLora) btnRegisterLora.addEventListener('click', () => registerLoraWeights());
  const btnClearLora = document.getElementById('btnClearLora');
  if (btnClearLora) btnClearLora.addEventListener('click', () => clearLoraWeights());
  const btnTrainLoraPaid = document.getElementById('btnTrainLoraPaid');
  if (btnTrainLoraPaid) btnTrainLoraPaid.addEventListener('click', () => trainLoraPaid());
  const btnSyncLoraPaid = document.getElementById('btnSyncLoraPaid');
  if (btnSyncLoraPaid) btnSyncLoraPaid.addEventListener('click', () => syncLoraPaid());
  const btnLinkLoraPaid = document.getElementById('btnLinkLoraPaid');
  if (btnLinkLoraPaid) btnLinkLoraPaid.addEventListener('click', () => linkLoraPaid());
  const btnTrainLoraLocal = document.getElementById('btnTrainLoraLocal');
  if (btnTrainLoraLocal) btnTrainLoraLocal.addEventListener('click', () => trainLoraLocal());
  const btnSyncLoraLocal = document.getElementById('btnSyncLoraLocal');
  if (btnSyncLoraLocal) btnSyncLoraLocal.addEventListener('click', () => syncLoraLocal());
  const btnRefreshLocalGpu = document.getElementById('btnRefreshLocalGpu');
  if (btnRefreshLocalGpu) btnRefreshLocalGpu.addEventListener('click', () => refreshLocalGpuStatus());
  refreshLoraInferenceStatus();
  refreshFaceLockOptIn();

  // Commercial License Generator Action
  const btnLicense = document.getElementById('btnGenerateCommercialLicense');
  if (btnLicense) {
    btnLicense.addEventListener('click', async () => {
      const p = state.selectedPersona || state.personas[0];
      if (!p) return toastError('Seleccione un influencer primero.');

      try {
        const res = await fetch(`/api/personas/${p.id}/commercial-license`);
        const data = await res.json();
        if (data.success) {
          const lic = data.license;
          const licText = `══════════════════════════════════════════════════════════
  CERTIFICADO DE LICENCIA COMERCIAL Y PROPIEDAD INTELECTUAL
  VERIFIED VIRTUAL INFLUENCER COMMERCIAL LICENSE
══════════════════════════════════════════════════════════

• ID Licencia: ${lic.licenseId}
• Fecha de Emisión: ${new Date(lic.issuedAt).toLocaleDateString()}
• Influencer Virtual: ${lic.personaName} (${lic.ethnicity}, ${lic.age})
• Titular de Derechos: ${lic.rightsHolder}
• Estado de IP: VERIFIED_VIRTUAL_INFLUENCER_IP
• Semilla Maestra DNA: ${lic.masterSeed}

PLATAFORMAS COMPATIBLES:
• ${lic.platformsCompliant.join('\n• ')}

CUMPLIMIENTO NORMATIVO:
• ${lic.disclosureRequired}

Este certificado avala que los derechos comerciales de explotación de imagen, nombre y contenido del Influencer Virtual pertenecen al titular autorizado sin reclamos de terceros.
══════════════════════════════════════════════════════════`;
          navigator.clipboard.writeText(licText);
          if (typeof toastSuccess === 'function') {
            toastSuccess(`📄 Certificado de Licencia Comercial ${lic.licenseId} copiado al portapapeles`);
          }
        }
      } catch (e) {
        if (typeof toastError === 'function') toastError('Error emitiendo licencia comercial: ' + e.message);
      }
    });
  }
  
  // Commercial UGC Presets
  document.querySelectorAll('.ugc-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetType = e.currentTarget.getAttribute('data-preset');
      applyUgcCommercialPreset(presetType);
    });
  });

  // Render Creative Ad Action
  const btnAd = document.getElementById('btnRenderAdCreative');
  if (btnAd) {
    btnAd.addEventListener('click', () => {
      const format = document.getElementById('adFormatSelect')?.value || '1:1';
      const hookText = document.getElementById('adHookSelect')?.value || '';
      const p = state.selectedPersona || state.personas[0];
      const prod = state.selectedProduct || { name: 'Producto' };

      const promptText = window.aiService.buildUnifiedMasterPrompt({
        name: p ? p.name : 'Influencer',
        age: p ? p.age : '25 años',
        gender: p ? p.gender : 'Female',
        ethnicity: p ? p.ethnicity : 'Latina',
        clothing: 'atuendo publicitario elegante',
        setting: 'estudio comercial iluminado',
        product: prod.name,
        framing: format === '9:16' ? 'fullbody' : 'medium'
      }) + `. AD HOOK TEXT: "${hookText}". COMMERCIAL AD CREATIVE FOR ${format.toUpperCase()}.`;

      const promptPreviewEl = document.getElementById('promptPreview');
      if (promptPreviewEl) promptPreviewEl.textContent = promptText;

      const captionEl = document.getElementById('ugcPostCaption');
      if (captionEl) captionEl.value = `🎯 ANUNCIO ${format} — ${prod.name}\n\n"${hookText}"\n\n👉 ¡Consíguelo hoy con envío rápido! #ad #dropshipping #${prod.name.toLowerCase().replace(/\s+/g, '')}`;

      generateAIImageAction();
      if (typeof toastSuccess === 'function') {
        toastSuccess(`🎨 Anuncio publicitario ${format} compilado y enviado a generación`);
      }
    });
  }

  // Video Pipeline Simulation Action
  document.getElementById('btnGenerateUgcVideo').addEventListener('click', startVideoPipelineSimulation);

  // Bulk Batch Ad Generation Pipeline Action
  const btnStartBulk = document.getElementById('btnStartBulkAdGeneration');
  if (btnStartBulk) {
    btnStartBulk.addEventListener('click', async () => {
      const p = state.selectedPersona || state.personas[0];
      if (!p) return toastError('Seleccione un influencer primero.');

      const checkedBoxes = document.querySelectorAll('.bulk-prod-checkbox:checked');
      const selectedProductIds = Array.from(checkedBoxes).map(cb => cb.value);

      if (selectedProductIds.length === 0) {
        return toastError('Seleccione al menos 1 producto del catálogo.');
      }

      try {
        btnStartBulk.disabled = true;
        btnStartBulk.innerHTML = '⏳ Encolando lote...';

        const res = await authFetch('/api/ads/bulk-generate', {
          method: 'POST',
          body: JSON.stringify({ personaId: p.id, productIds: selectedProductIds })
        });
        const data = await res.json();

        if (data.success) {
          if (typeof toastSuccess === 'function') toastSuccess(`🚀 Lote ${data.batchId} encolado: ${data.totalTasks} anuncios en proceso`);
          startBulkAdBatchPolling(data.batchId);
        } else {
          if (typeof toastError === 'function') toastError('Error al iniciar lote: ' + data.error);
          btnStartBulk.disabled = false;
          btnStartBulk.innerHTML = '⚡ Generar Lote de Anuncios (10 por producto)';
        }
      } catch (err) {
        if (typeof toastError === 'function') toastError('Error de servidor: ' + err.message);
        btnStartBulk.disabled = false;
        btnStartBulk.innerHTML = '⚡ Generar Lote de Anuncios (10 por producto)';
      }
    });
  }

  // Populate product selector checkboxes
  renderBulkProductSelector();
}

function renderBulkProductSelector() {
  const container = document.getElementById('bulkProductSelectorContainer');
  if (!container) return;

  const products = state.products || [];
  if (products.length === 0) {
    container.innerHTML = `<span class="u-fs-11-muted">No hay productos en el catálogo. Agregue productos en el tab de Catálogo.</span>`;
    return;
  }

  container.innerHTML = products.map(p => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer;">
      <input type="checkbox" class="bulk-prod-checkbox" value="${p.id}" checked />
      <span>📦 <strong>${p.name}</strong> — ${p.benefit || 'Producto e-commerce'}</span>
    </label>
  `).join('');
}

let activeBulkPollingInterval = null;

function startBulkAdBatchPolling(batchId) {
  const card = document.getElementById('bulkBatchProgressCard');
  const progressText = document.getElementById('bulkBatchProgressText');
  const progressBar = document.getElementById('bulkBatchProgressBar');
  const gallery = document.getElementById('bulkBatchGallery');
  const downloadBtn = document.getElementById('btnDownloadBulkBatchZip');

  if (card) card.style.display = 'block';
  if (gallery) gallery.innerHTML = '';

  const renderedImageIds = new Set();

  if (activeBulkPollingInterval) clearInterval(activeBulkPollingInterval);

  activeBulkPollingInterval = setInterval(async () => {
    try {
      const res = await authFetch(`/api/ads/batch-status/${batchId}`);
      const data = await res.json();
      if (!data.success) return;

      const b = data.batch;
      const done = (b.completed || 0) + (b.failed || 0);
      const pct = b.total ? Math.round((done / b.total) * 100) : 0;

      if (progressText) {
        const failHint = b.failed ? ` · ${b.failed} fallidos` : '';
        progressText.textContent = `${done} / ${b.total} (${pct}%)${failHint}`;
      }
      if (progressBar) progressBar.style.width = `${pct}%`;

      // Render new images as they complete
      b.images.forEach(img => {
        if (!renderedImageIds.has(img.id)) {
          renderedImageIds.add(img.id);
          const itemEl = document.createElement('div');
          itemEl.style.cssText = 'background: rgba(0,0,0,0.4); border-radius: 6px; overflow: hidden; border: 1px solid var(--glass-border); padding: 4px;';
          itemEl.innerHTML = `
            <img src="${img.imagePath}" style="width: 100%; aspect-ratio: ${img.format === '9:16' ? '9/16' : '1/1'}; object-fit: cover; border-radius: 4px;" />
            <div style="font-size: 9px; margin-top: 4px; color: var(--text-muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${img.format} | ${img.productName}
            </div>
          `;
          gallery.appendChild(itemEl);
        }
      });

      if (b.status === 'completed' || b.completed + b.failed >= b.total) {
        clearInterval(activeBulkPollingInterval);
        const btnStartBulk = document.getElementById('btnStartBulkAdGeneration');
        if (btnStartBulk) {
          btnStartBulk.disabled = false;
          btnStartBulk.innerHTML = '⚡ Generar Lote de Anuncios (10 por producto)';
        }
        if (downloadBtn) {
          downloadBtn.style.display = 'flex';
          downloadBtn.onclick = () => {
            if (typeof toastSuccess === 'function') toastSuccess(`📥 Lote completo de ${b.completed} anuncios listo.`);
          };
        }
        if (typeof toastSuccess === 'function') toastSuccess(`🎉 ¡Lote completo! Se generaron ${b.completed} anuncios exitosamente.`);
      }
    } catch (e) {
      console.warn('Error polling batch status:', e);
    }
  }, 2500);
}

function applyUgcCommercialPreset(presetType) {
  const p = state.selectedPersona || state.personas[0];
  const prod = state.selectedProduct || { name: 'Producto Estrella' };

  let captionText = '';
  let customSetting = '';
  let customClothing = '';
  let customPose = '';

  if (presetType === 'skincare') {
    captionText = `✨ Mi rutina infaltable de mañana con ${prod.name}. ¡Piel luminosa en 5 minutos sin usar filtros! 🧴💖 #skincare #skinroutine #glowup`;
    customSetting = 'baño luminoso con espejo o tocador elegante';
    customClothing = 'albornoz blanco cómodo de spa o top de seda';
    customPose = 'sosteniendo frasco de suero facial sonriendo frente al espejo';
  } else if (presetType === 'fitness') {
    captionText = `💪 Día de pierna y energía al máximo. El atuendo y la disciplina nunca fallan con ${prod.name} 👟🔥 #gymrat #fitness #athleisure`;
    customSetting = 'espejo de gimnasio moderno con luces tenue';
    customClothing = 'conjunto deportivo elegante athleisure';
    customPose = 'pose de espejo sosteniendo botella de entrenamiento';
  } else if (presetType === 'tech') {
    captionText = `💻 Organizando mi semana de producción con ${prod.name}. La productividad cuando usas la herramienta adecuada es otro nivel 🚀 #tech #productivity #desksetups`;
    customSetting = 'escritorio minimalista moderno con laptop y café';
    customClothing = 'blazer casual elegante ejecutiva';
    customPose = 'sosteniendo smartphone o audífonos de trabajo en escritorio';
  } else if (presetType === 'wellness') {
    captionText = `🌿 Empezando el día con energía natural y mi smoothie con ${prod.name}. ¡Salud por los buenos hábitos! 🍹✨ #wellness #healthy #smoothie`;
    customSetting = 'cocina moderna iluminada por luz natural de mañana';
    customClothing = 'ropa casual cómoda de hogar';
    customPose = 'sosteniendo vaso de cristal con smoothie fresco';
  }

  const captionEl = document.getElementById('ugcPostCaption');
  if (captionEl) {
    captionEl.value = captionText;
    if (typeof updateUgcMockupCaption === 'function') updateUgcMockupCaption();
  }

  const promptPreviewEl = document.getElementById('promptPreview');
  if (promptPreviewEl && window.aiService && p) {
    const promptText = window.aiService.buildUnifiedMasterPrompt({
      name: p.name,
      age: p.age || '25 años',
      gender: p.gender || 'Female',
      ethnicity: p.ethnicity || 'Latina',
      hair: p.hair || 'dark brown wavy hair',
      skinTone: p.skinTone || 'fair light',
      skinHex: p.skinHex || '#f0d5c0',
      setting: customSetting,
      clothing: customClothing,
      pose: customPose,
      product: prod.name
    });
    promptPreviewEl.textContent = promptText;
  }
  if (typeof toastSuccess === 'function') {
    toastSuccess(`✨ Plantilla ${presetType.toUpperCase()} cargada en el Studio`);
  }
}

async function generateAIImageAction() {
  const prompt = document.getElementById('promptPreview').textContent;
  const statusCard = document.getElementById('ugcGenStatusCard');
  const statusText = document.getElementById('ugcGenStatusText');
  
  statusCard.style.display = 'flex';
  statusText.textContent = 'Invocando generador de imágenes Imagen 3...';
  
  try {
    QueuePoller.start();
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
  // UX-3c — demo local sin Veo/Runway; no inventa un render real
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
      toastInfo('Demo de timeline lista — no hay pipeline de vídeo real (Veo/Runway en pausa). Usa Copiar JSON o el pack UGC.');
    }
  }, 150);
}

function populateActiveUgcData() {
  const hasPersona = !!state.selectedPersona;
  const creator = state.selectedPersona || {};
  const prod = state.selectedProduct || null;
  const setSrc = (id, src) => { const el = document.getElementById(id); if (el) el.src = src; };
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  if (!hasPersona) {
    setSrc('ugcActiveAvatar', 'assets/influencer_female.png');
    setText('ugcActiveName', 'Sin influencer');
    setText('ugcActiveMeta', 'Elige uno en el chip del header o en Influencers');
    setSrc('scriptActiveAvatar', 'assets/influencer_female.png');
    setText('scriptActivePersonaName', 'Sin influencer');
    setText('scriptActivePersonaMeta', 'Elige uno en el chip del header o en Influencers');
    setSrc('licenseActiveAvatar', 'assets/influencer_female.png');
    setText('licenseActivePersonaName', 'Sin influencer');
    setText('licenseActivePersonaMeta', 'Elige uno en el chip del header o en Influencers');
  } else {
    setSrc('ugcActiveAvatar', creator.image || 'assets/influencer_female.png');
    setText('ugcActiveName', creator.name || 'Influencer');
    setText('ugcActiveMeta', `${creator.age || ''} • ${creator.ethnicity || creator.ethnicity_appearance || ''}`);
    setSrc('scriptActiveAvatar', creator.image || 'assets/influencer_female.png');
    setText('scriptActivePersonaName', creator.name || 'Influencer');
    setText(
      'scriptActivePersonaMeta',
      `${creator.age || ''} • ${creator.ethnicity || creator.ethnicity_appearance || ''}`.replace(/^\s•\s*$/, '').trim() || 'Contexto del chip del header'
    );
    setSrc('licenseActiveAvatar', creator.image || 'assets/influencer_female.png');
    setText('licenseActivePersonaName', creator.name || 'Influencer');
    setText(
      'licenseActivePersonaMeta',
      `${creator.age || ''} • ${creator.ethnicity || creator.ethnicity_appearance || ''}`.replace(/^\s•\s*$/, '').trim() || 'Contexto del chip del header'
    );
  }

  const prodImg = creator.gender === 'Male' ? 'assets/product_bottle.png' : 'assets/product_serum.png';
  setSrc('ugcActiveProductImg', prodImg);
  setText('ugcActiveProduct', prod?.name || 'Sin producto');
  setText('cdProduct', prod?.name || '—');
  setText('ugcActiveProductMeta', prod?.benefit || (prod ? 'Producto activo' : 'Añade un producto en Guiones o elige plantilla'));

  // Mockup: sin persona no fingimos un UGC demo
  if (!hasPersona) {
    setSrc('mockupImage', 'assets/influencer_female.png');
    setSrc('mockupAvatar', 'assets/influencer_female.png');
    setText('mockupHandle', '@elige_influencer');
  } else {
    setSrc('mockupImage', creator.imageUGC || creator.image || 'assets/influencer_female_serum.png');
    setSrc('mockupAvatar', creator.image || 'assets/influencer_female.png');
    setText('mockupHandle', creator.handle || `@${(creator.name || 'influencer').toLowerCase().replace(/\s+/g, '_')}_ai_ugc`);
  }

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
  // UX-3b — sin alert stub; descarga la misma propuesta como .txt
  document.getElementById('btnDownloadProposal')?.addEventListener('click', downloadLicensingProposal);
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
  
  // Update invoice panel — sin Sofia falsa; sin influencer = mensaje honesto
  const creator = state.selectedPersona;
  const prod = state.selectedProduct;
  const creatorLabel = creator?.name
    ? `${creator.name} — Modelo Virtual AI`
    : 'Sin influencer — elige uno en el chip';
  const clientLabel = prod?.name || 'Sin producto — elige uno o usa Guiones';
  
  document.getElementById('pitchClientName').textContent = `Propuesta para ${clientLabel}`;
  document.getElementById('pitchInfluName').textContent = creatorLabel;
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

function buildLicensingProposalText() {
  const creator = state.selectedPersona;
  const prod = state.selectedProduct;
  const creatorName = creator?.name || null;
  const prodName = prod?.name || null;
  const base = state.baseFee;
  
  const licenceSelect = document.getElementById('pitchLicenceSelect');
  const selectedText = licenceSelect.options[licenceSelect.selectedIndex].text;
  const totalText = document.getElementById('pitchTotalVal').textContent;
  
  const activeScript = state.scripts[state.selectedAngleIndex] || { angle: "El Escéptico" };
  
  return `================================================
PROPUESTA COMERCIAL - AI UGC CAMPAIGN
================================================
Cliente: ${prodName || '(sin producto seleccionado)'}
Creador Virtual: ${creatorName || '(sin influencer — elige uno en el chip)'}
Ángulo del Anuncio: ${activeScript.angle}

DESGLOSE DE SERVICIOS:
1. Creación de Activo UGC Sintético: $${base.toFixed(2)} USD
   - Persona consistente definible por JSON
   - Prep. de guión UGC (plantillas locales / Gemini opt-in)
   
2. Licencia de Derechos de Uso Comercial:
   - Tipo: ${selectedText}
   - Costo: ${document.getElementById('pitchLicenceFeeVal').textContent} USD

3. Entrega y Redacción (10 variaciones de scripts): Incluido

INVERSIÓN TOTAL: ${totalText} USD
================================================
*Nota: Cumplimiento ético de divulgación sintética incluido de acuerdo con la ley de junio de 2026.
`;
}

function copyLicensingProposal() {
  if (!state.selectedPersona) {
    toastInfo('Elige un influencer en el chip del header antes de copiar la propuesta.', {
      actionLabel: 'Ir a Influencers',
      onAction: () => navigateToTab('dashboard')
    });
    return;
  }
  navigator.clipboard.writeText(buildLicensingProposalText());
  toastSuccess('Propuesta formateada copiada al portapapeles');
}

/** UX-3b — descarga .txt en lugar del alert stub «Enviar Propuesta». */
function downloadLicensingProposal() {
  if (!state.selectedPersona) {
    toastInfo('Elige un influencer en el chip del header antes de descargar la propuesta.', {
      actionLabel: 'Ir a Influencers',
      onAction: () => navigateToTab('dashboard')
    });
    return;
  }
  const text = buildLicensingProposalText();
  const creator = state.selectedPersona?.name || 'influencer';
  const safe = String(creator).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'propuesta';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `propuesta_${safe}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toastSuccess('Propuesta descargada (.txt)');
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
  grid.innerHTML = '<p class="u-color-secondary">Cargando galería...</p>';
  
  try {
    const res = await authFetch('/api/gallery');
    state.galleryItems = await res.json();
    renderGalleryGrid(state.galleryItems);
  } catch (err) {
    grid.innerHTML = '<p class="u-color-secondary">Error al recuperar la galería.</p>';
  }
}

function renderGalleryGrid(items) {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  
  if (items.length === 0) {
    const q = (document.getElementById('gallerySearchInput')?.value || '').trim();
    grid.innerHTML = `
      <div class="empty-roster-panel" style="grid-column:1/-1;">
        <p class="empty-roster-lead u-mb-12" >
          ${q
            ? 'Ningún prompt coincide con la búsqueda.'
            : 'La galería es un scrapbook opcional. El happy path es Copiar JSON (paso Lock &amp; Packs) y pegarlo en un chatbot free.'}
        </p>
        <div class="empty-roster-actions">
          ${q
            ? '<button type="button" class="btn btn-secondary btn-sm" id="btnEmptyGalleryClear">Limpiar búsqueda</button>'
            : '<button type="button" class="btn btn-sm" id="btnEmptyGalleryCopyJson">Ir a Copiar JSON</button>'}
        </div>
      </div>`;
    document.getElementById('btnEmptyGalleryClear')?.addEventListener('click', () => {
      const input = document.getElementById('gallerySearchInput');
      if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
    });
    document.getElementById('btnEmptyGalleryCopyJson')?.addEventListener('click', () => {
      navigateToTab('persona-engine');
      setTimeout(() => {
        if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: true });
        const target = document.getElementById('btnCopyPackFullbodyPrimary');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.focus?.();
        }
      }, 80);
    });
    return;
  }
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <img src="${item.image_path || 'assets/influencer_female_serum.png'}" class="gallery-card-img" alt="Vista previa de galería">
      <div class="gallery-card-content">
        <p class="gallery-card-prompt">${item.prompt}</p>
        <button class="btn btn-sm btn-secondary u-w-full"  onclick="loadPromptFromGallery('${item.prompt.replace(/'/g, "\\'")}')">Cargar prompt</button>
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
  
  toastSuccess('Prompt cargado en Ficha / Editor');
}

window.loadPromptFromGallery = loadPromptFromGallery;
window.revertVersion = revertVersion;

// =============================================
// PHOTO UPLOAD & AI ANALYSIS — photo-upload-ui.js (InfluPhotoUploadUi)
// Thin wrappers + window.resetUploadDropzone wired near QueuePoller above.
// =============================================

async function deletePersonaAction() {
  if (!state.selectedPersona || !state.selectedPersona.id) {
    toastInfo('Primero selecciona un influencer guardado para eliminarlo.');
    return;
  }

  const persona = state.selectedPersona;
  const name = persona.name || 'Influencer';
  const id = persona.id;
  const isAdmin = isCurrentUserAdmin();

  // W9 — por defecto archiva (recuperable). Admin puede purgar con confirmación de nombre.
  let hardDelete = false;
  if (isAdmin) {
    const choice = window.prompt(
      `«${name}»\n\nEnter = archivar (recomendado, reversible).\nEscribe el nombre exacto para BORRAR permanente:\n`,
      ''
    );
    if (choice === null) return; // cancel
    hardDelete = String(choice).trim() === String(name).trim() && String(choice).trim().length > 0;
    if (String(choice).trim() && !hardDelete) {
      toastError('Nombre no coincide — no se borró. Usa Enter vacío para archivar.');
      return;
    }
  } else if (!confirm(`¿Archivar a «${name}»?\n\nNo se borra del todo: puedes desarchivar después. (Borrado permanente solo Administración.)`)) {
    return;
  }

  if (hardDelete) {
    if (!confirm(`⚠️ BORRADO PERMANENTE de «${name}». No hay deshacer. ¿Continuar?`)) return;
    setGitSyncingState();
    try {
      const res = await authFetch(`/api/personas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error');
      state.personas = data.personas || [];
      state.selectedPersona = state.personas.length > 0 ? state.personas[0] : null;
      updateDashboardStats();
      renderPersonaGrids();
      populateActiveUgcData();
      if (state.selectedPersona) selectPersona(state.selectedPersona);
      else {
        document.getElementById('pName').value = '';
        document.getElementById('pAge').value = '';
        document.getElementById('pStyle').value = '';
        document.getElementById('pSetting').value = '';
        updateClothingDropdown('');
      }
      toastSuccess(`«${name}» eliminado permanentemente`);
    } catch (err) {
      toastError(err.message || 'Error al eliminar');
    }
    return;
  }

  // Soft delete = archive
  try {
    const res = await authFetch(`/api/personas/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archived: true })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Error');
    state.personas = data.personas || state.personas;
    const archived = (state.personas || []).find((p) => p.id === id) || { ...persona, archived: 1 };
    state.selectedPersona = archived;
    updateDashboardStats();
    renderPersonaGrids();
    populateActiveUgcData();
    selectPersona(archived);
    toastSuccess(`«${name}» archivado`, {
      duration: 8000,
      actionLabel: 'Deshacer',
      onAction: async () => {
        try {
          const undo = await authFetch(`/api/personas/${id}/archive`, {
            method: 'POST',
            body: JSON.stringify({ archived: false })
          });
          const undoData = await undo.json();
          if (!undoData.success) throw new Error(undoData.message || 'Error');
          state.personas = undoData.personas || state.personas;
          const restored = (state.personas || []).find((p) => p.id === id);
          if (restored) {
            state.selectedPersona = restored;
            selectPersona(restored);
          }
          updateDashboardStats();
          renderPersonaGrids();
          toastSuccess(`«${name}» restaurado`);
        } catch (e) {
          toastError(e.message || 'No se pudo desarchivar');
        }
      }
    });
  } catch (err) {
    toastError(err.message || 'Error al archivar');
  }
}

// ─── Influencer Variants (UX → variant-vault-ui.js + variant-presets.js) ───
const _variantPresetsApi = (typeof InfluVariantPresets !== 'undefined'
  ? InfluVariantPresets
  : (typeof window !== 'undefined' ? window.InfluVariantPresets : null));
if (!_variantPresetsApi) console.error('[variants] variant-presets.js no cargado');

const _variantVaultUiApi = (typeof InfluVariantVaultUi !== 'undefined'
  ? InfluVariantVaultUi
  : (typeof window !== 'undefined' ? window.InfluVariantVaultUi : null));
if (!_variantVaultUiApi || typeof _variantVaultUiApi.createVariantVaultUi !== 'function') {
  console.error('[variants] variant-vault-ui.js no cargado');
}

const _variantVaultUi = _variantVaultUiApi.createVariantVaultUi({
  getState: () => state,
  authFetch: (...args) => authFetch(...args),
  toastSuccess: (...args) => toastSuccess(...args),
  toastError: (...args) => toastError(...args),
  toastInfo: (...args) => toastInfo(...args),
  toastLoading: (...args) => toastLoading(...args),
  QueuePoller,
  getFullPersonaJSON: (...args) => getFullPersonaJSON(...args),
  resolveSkinForPrompt: (...args) => resolveSkinForPrompt(...args),
  buildIdentityLockBlock: (...args) => buildIdentityLockBlock(...args),
  _promptBuilder: () => _promptBuilder(),
  personaSeed: (...args) => personaSeed(...args),
  notifyGenerationFailure: (...args) => notifyGenerationFailure(...args),
  setGitSyncingState: (...args) => setGitSyncingState(...args),
  renderPersonaGrids: (...args) => renderPersonaGrids(...args),
  populateActiveUgcData: (...args) => populateActiveUgcData(...args),
  updateSideBySideComparator: (...args) => updateSideBySideComparator(...args),
  renderQaMatrix: (...args) => renderQaMatrix(...args),
  renderFacePack: (...args) => renderFacePack(...args),
  renderHappyPathChecklist: (...args) => renderHappyPathChecklist(...args),
  openHistoryModal: (...args) => openHistoryModal(...args),
  updateDashboardStats: (...args) => updateDashboardStats(...args),
  loadGenerationHistory: (...args) => loadGenerationHistory(...args),
  refreshFaceLockOptIn: (...args) => refreshFaceLockOptIn(...args),
  copyFreeChatbotPack: (...args) => copyFreeChatbotPack(...args),
  variantPresetsApi: _variantPresetsApi,
  document,
  window
});

_variantVaultUi.bindWindowGlobals(window);

function populateVariantDropdowns(...args) { return _variantVaultUi.populateVariantDropdowns(...args); }
function renderVariantChips(...args) { return _variantVaultUi.renderVariantChips(...args); }
function renderAccessoryChips(...args) { return _variantVaultUi.renderAccessoryChips(...args); }
function randomizeVariantChips(...args) { return _variantVaultUi.randomizeVariantChips(...args); }
function applyLookPreset(...args) { return _variantVaultUi.applyLookPreset(...args); }
function renderLookPresets(...args) { return _variantVaultUi.renderLookPresets(...args); }
function updateBatchHint(...args) { return _variantVaultUi.updateBatchHint(...args); }
function renderBatchChips(...args) { return _variantVaultUi.renderBatchChips(...args); }
function updateVariantClothingDropdown(...args) { return _variantVaultUi.updateVariantClothingDropdown(...args); }
function loadVariantsForPersona(...args) { return _variantVaultUi.loadVariantsForPersona(...args); }
function consistencyChipHtml(...args) { return _variantVaultUi.consistencyChipHtml(...args); }
function renderVariantVaultGrid(...args) { return _variantVaultUi.renderVariantVaultGrid(...args); }
async function generateVariantAction(...args) { return _variantVaultUi.generateVariantAction(...args); }
async function generateOneVariant(...args) { return _variantVaultUi.generateOneVariant(...args); }
async function deleteVariantAction(...args) { return _variantVaultUi.deleteVariantAction(...args); }

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
      toastSuccess(isArchiving ? 'Influencer archivada.' : 'Influencer desarchivada.');
    }
  } catch (err) {
    toastError('Error al cambiar estado de archivo.');
  }
}

function setupVariantManager() {
  // generate + randomize + face-lock refresh → variant-vault-ui.js
  _variantVaultUi.setupVariantManager();

  document.getElementById('btnArchivePersona').addEventListener('click', archivePersonaAction);

  // Set up Active / Archived filter buttons (persona CRUD / portfolio — stay in app)
  const btnActive = document.getElementById('btnFilterActive');
  const btnArchived = document.getElementById('btnFilterArchived');
  
  btnActive.addEventListener('click', () => {
    state.personaFilter = 'active';
    btnActive.classList.add('filter-btn-active');
    btnArchived.classList.remove('filter-btn-active');
    renderPersonaGrids();
  });
  
  btnArchived.addEventListener('click', () => {
    state.personaFilter = 'archived';
    btnArchived.classList.add('filter-btn-active');
    btnActive.classList.remove('filter-btn-active');
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
      <img src="${gen.image_path || DEFAULT_PERSONA_THUMB}" alt="Imagen de generación" class="history-card-img" loading="lazy">
      <div class="history-card-overlay">
        <span class="history-type-badge ${typeClass}">${typeLabel}</span>
        <div class="history-card-meta">
          <div class="history-card-date">${dateStr}</div>
          <div class="history-card-prompt">${gen.prompt || 'Sin prompt'}</div>
        </div>
      </div>
    `;

    bindPersonaThumbFallback(card.querySelector('img'));
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

  img.dataset.fallbackApplied = '';
  img.src = item.image_path || DEFAULT_PERSONA_THUMB;
  bindPersonaThumbFallback(img);

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

      toastSuccess('Imagen eliminada del historial.');
    }
  } catch (e) {
    toastError('Error al eliminar del historial.');
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
  // click-away del import: lo maneja initImportModal (discard limpio)
});

// ============================================================
// IMPORT INFLUENCER MODAL (Fase 2) — lógica en import-flow.js (W5a)
// ============================================================
function initImportModal() {
  const api = window.InfluImportFlow;
  if (!api || typeof api.initImportModal !== 'function') {
    console.error('[import] InfluImportFlow no cargó — revisa import-flow.js');
    return;
  }
  const formApi = window.InfluPersonaForm;
  window.__importModalCtl = api.initImportModal({
    authFetch,
    toastInfo,
    toastSuccess,
    toastError,
    toastLoading,
    reloadPersonasFromServer,
    refreshPersonaLists,
    navigateToTab,
    selectPersona,
    loadPersonaVariants:
      typeof loadPersonaVariants === 'function' ? loadPersonaVariants : loadVariantsForPersona,
    getState: () => state,
    QueuePoller,
    setStep2Focus,
    setPersonaStep,
    copyFreeChatbotPack,
    applyAnalysisToFormFields: (analysis) => {
      if (formApi && typeof formApi.applyAnalysisToFormFields === 'function') {
        return formApi.applyAnalysisToFormFields(analysis);
      }
      return {};
    },
    resetPersonaFormForNew:
      typeof resetPersonaFormForNew === 'function' ? resetPersonaFormForNew : () => {}
  });
}

window.closeHistoryModal = closeHistoryModal;
window.setPortfolioFilter = setPortfolioFilter;
window.clearPortfolioSearch = clearPortfolioSearch;
window.getFilteredPortfolioPersonas = getFilteredPortfolioPersonas;
window.setHistoryFilter = setHistoryFilter;
window.loadCharacterBible = loadCharacterBible;
window.initImportModal = initImportModal;

// Exponer para smoke/walkthrough (page.evaluate) — let state no está en window
window.state = state;
window.selectPersona = selectPersona;
window.setPersonaStep = setPersonaStep;
window.setStep2Focus = setStep2Focus;
window.clearStep2Focus = clearStep2Focus;
window.navigateToTab = navigateToTab;
window.populateActiveUgcData = populateActiveUgcData;
window.updateActivePersonaChip = updateActivePersonaChip;
window.renderCampaigns = renderCampaigns;
window.startCreateScratchFlow = startCreateScratchFlow;
window.startImportFlow = startImportFlow;
window.setupQuickCreateActions = setupQuickCreateActions;
window.setupJobRouter = setupJobRouter;
window.runJobRouterAction = runJobRouterAction;
window.resetPersonaFormForNew = resetPersonaFormForNew;

