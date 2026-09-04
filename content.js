// FocusTube content script
// Runs on every YouTube page. Detects watch pages, injects the
// dim overlay + floating button, and handles SPA navigation.

const OVERLAY_ID = 'focustube-overlay';
const BTN_ID = 'focustube-btn';
const PLAYER_SEL = '#movie_player';

// Distraction elements we hide when focus mode is on.
const DISTRACTIONS = [
  '#masthead',                    // top nav bar
  '#secondary',                   // recommendations sidebar
  '#related',                     // related videos (older layouts)
  'ytd-watch-flexy #secondary',   // modern recommendations sidebar
  'ytd-comments',                 // comments section
  '#comments',                    // older comments container
  '#description',                 // video description
  '#owner',                       // channel bar
  '#below',                       // like/share/action row
  'ytd-playlist-panel-renderer'   // playlist sidebar
];

let focusModeActive = false;
let currentDimLevel = 0;
let distractionTimeout;

// -- DOM helpers -----------------------------------------------------------

// Make sure the full-screen overlay exists exactly once.
function ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: #000; opacity: 0; pointer-events: none;
    transition: opacity 0.4s ease;
  `;
  document.body.appendChild(overlay);
}

// Poll for an element that YouTube may render asynchronously
// (the player especially). Gives up after maxWait ms.
function waitFor(selector, onFound, maxWait = 10000) {
  const poll = setInterval(() => {
    const el = document.querySelector(selector);
    if (el) {
      clearInterval(poll);
      clearTimeout(failTimer);
      onFound(el);
    }
  }, 300);

  const failTimer = setTimeout(() => clearInterval(poll), maxWait);
}

const getPlayer = () => document.querySelector(PLAYER_SEL);

function normaliseDim(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function hideDistractions() {
  if (!focusModeActive) return;
  DISTRACTIONS.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.classList.add('focustube-hidden');
  });
}

// YouTube frequently replaces page sections after navigation. Re-apply the
// hidden state once its render burst settles, rather than losing focus mode.
const distractionObserver = new MutationObserver(() => {
  if (!focusModeActive || distractionTimeout) return;
  distractionTimeout = setTimeout(() => {
    distractionTimeout = null;
    hideDistractions();
  }, 100);
});

distractionObserver.observe(document.documentElement, { childList: true, subtree: true });

// -- Focus mode ------------------------------------------------------------

function enableFocusMode(dim) {
  currentDimLevel = normaliseDim(dim);
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.opacity = currentDimLevel / 100;

  // Lift the player above the overlay. YouTube nests the player in
  // stacking contexts that ignore plain z-index, so we also force
  // its own compositing layer.
  const player = getPlayer();
  if (player) {
    player.style.zIndex = '2001';
    player.style.isolation = 'isolate';
    player.style.transform = 'translateZ(0)';
  }
  document.body.classList.add('focustube-active');

  focusModeActive = true;
  hideDistractions();
  persist({ dimLevel: currentDimLevel });
  setBtnText('✖ Exit Focus');
}

function disableFocusMode() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.opacity = '0';

  const player = getPlayer();
  if (player) {
    player.style.zIndex = '';
    player.style.isolation = '';
    player.style.transform = '';
  }
  document.body.classList.remove('focustube-active');

  document.querySelectorAll('.focustube-hidden').forEach(el => {
    el.classList.remove('focustube-hidden');
  });

  focusModeActive = false;
  setBtnText('🎯 Focus');
}

function toggleFocusMode() {
  focusModeActive ? disableFocusMode() : enableFocusMode(currentDimLevel);
}

// -- Storage ---------------------------------------------------------------

// The extension can be reloaded while a tab is open, which kills the
// content script's API bridge. Guard against that so we don't spam errors.
function persist(data) {
  try {
    chrome.storage.sync.set(data);
  } catch (e) {
    console.warn('FocusTube: storage unavailable', e);
  }
}

function restoreSettings(onRestored) {
  chrome.storage.sync.get('dimLevel', data => {
    currentDimLevel = normaliseDim(data.dimLevel);
    onRestored?.();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.dimLevel) return;
  currentDimLevel = normaliseDim(changes.dimLevel.newValue);
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay && focusModeActive) overlay.style.opacity = currentDimLevel / 100;
});

// -- Floating button -------------------------------------------------------

function setBtnText(txt) {
  const btn = document.getElementById(BTN_ID);
  if (btn) {
    btn.textContent = txt;
    btn.setAttribute('aria-pressed', String(focusModeActive));
    btn.setAttribute('aria-label', focusModeActive ? 'Disable Focus Mode' : 'Enable Focus Mode');
  }
}

function createFloatingButton() {
  if (!location.pathname.includes('/watch')) return;
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '🎯 Focus';
  btn.setAttribute('aria-label', 'Enable Focus Mode');
  btn.setAttribute('aria-pressed', 'false');
  btn.style.cssText = `
    position: fixed; bottom: 24px; left: 24px; z-index: 9999;
    padding: 8px 16px; background: rgba(0,0,0,0.8); color: white;
    border: 1px solid rgba(255,255,255,0.3); border-radius: 20px;
    font-size: 13px; cursor: pointer; transition: all 0.3s ease;
  `;
  btn.addEventListener('mouseenter', () => (btn.style.background = 'rgba(255,255,255,0.15)'));
  btn.addEventListener('mouseleave', () => (btn.style.background = 'rgba(0,0,0,0.8)'));
  btn.addEventListener('click', toggleFocusMode);
  document.body.appendChild(btn);
}

// -- SPA navigation --------------------------------------------------------
// YouTube swaps pages without a reload. Both the custom event and the
// title observer fire a debounced navigation handler, and the handler
// itself has a cooldown so everything settles first.

let navTimeout;
let lastNavFire = 0;

function debounceNav() {
  if (navTimeout) return;
  navTimeout = setTimeout(() => {
    navTimeout = null;
    handleNavigation();
  }, 500);
}

function handleNavigation() {
  // Cooldown guard in case multiple events fire in quick succession.
  if (Date.now() - lastNavFire < 600) return;
  lastNavFire = Date.now();

  if (location.pathname.includes('/watch')) {
    ensureOverlay();
    createFloatingButton();
    restoreSettings(() => {
      // A previously scheduled callback may fire after the user leaves the
      // watch page. Never restore focus mode onto a different YouTube view.
      if (!focusModeActive || !location.pathname.includes('/watch')) return;
      waitFor(PLAYER_SEL, () => {
        if (focusModeActive && location.pathname.includes('/watch')) {
          enableFocusMode(currentDimLevel);
        }
      }, 8000);
    });
  } else {
    // Left a watch page — clean everything up.
    disableFocusMode();
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
  }
}

window.addEventListener('yt-navigate-finish', debounceNav);

const titleObserver = new MutationObserver(debounceNav);
const titleEl = document.querySelector('title');
if (titleEl) titleObserver.observe(titleEl, { childList: true, subtree: true });

// Kick things off for the initial load.
handleNavigation();

// -- Message handling ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  switch (msg.action) {
    case 'toggleFocus':
      toggleFocusMode();
      respond({ status: 'ok', focusModeActive });
      break;
    case 'updateDim':
      currentDimLevel = normaliseDim(msg.dimLevel);
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay && focusModeActive) overlay.style.opacity = currentDimLevel / 100;
      respond({ status: 'ok' });
      break;
    case 'getStatus':
      respond({ focusModeActive, dimLevel: currentDimLevel });
      break;
  }
  return true; // keep the channel open for async responses
});
