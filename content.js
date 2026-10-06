// FocusTube content script
// Runs on every YouTube page. Detects watch pages, injects the
// dim overlay + floating button, and handles SPA navigation.

const OVERLAY_ID = 'focustube-overlay';
const BTN_ID = 'focustube-btn';
const PLAYER_SEL = '#movie_player';
const BUTTON_MARGIN = 12;

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
let savedButtonPosition = null;
let distractionTimeout;
let isObservingDistractions = false;

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

function normalizeDim(value) {
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

function startDistractionObserver() {
  if (isObservingDistractions) return;
  distractionObserver.observe(document.documentElement, { childList: true, subtree: true });
  isObservingDistractions = true;
}

function stopDistractionObserver() {
  distractionObserver.disconnect();
  isObservingDistractions = false;
  if (distractionTimeout) {
    clearTimeout(distractionTimeout);
    distractionTimeout = null;
  }
}

// -- Focus mode ------------------------------------------------------------

function enableFocusMode(dim) {
  currentDimLevel = normalizeDim(dim);
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
  startDistractionObserver();
  hideDistractions();
  savePreferences({ dimLevel: currentDimLevel });
  persistFocusState(true);
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
  stopDistractionObserver();
  persistFocusState(false);
  setBtnText('🎯 Focus');
}

function toggleFocusMode() {
  focusModeActive ? disableFocusMode() : enableFocusMode(currentDimLevel);
}

// -- Storage ---------------------------------------------------------------

// The extension can be reloaded while a tab is open, which kills the
// content script's API bridge. Guard against that so we don't spam errors.
function savePreferences(data) {
  try {
    chrome.storage.sync.set(data);
  } catch (e) {
    console.warn('FocusTube: storage unavailable', e);
  }
}

function persistFocusState(active) {
  chrome.runtime.sendMessage({ action: 'setFocusState', active }, () => {
    void chrome.runtime.lastError;
  });
}

function restoreSettings(onRestored) {
  chrome.storage.sync.get(['dimLevel', 'focusButtonPosition'], data => {
    currentDimLevel = normalizeDim(data.dimLevel);
    savedButtonPosition = data.focusButtonPosition || null;
    chrome.runtime.sendMessage({ action: 'getFocusState' }, response => {
      void chrome.runtime.lastError;
      focusModeActive = Boolean(response?.active);
      onRestored?.();
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.dimLevel) {
    currentDimLevel = normalizeDim(changes.dimLevel.newValue);
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay && focusModeActive) overlay.style.opacity = currentDimLevel / 100;
  }
  if (changes.focusButtonPosition) {
    savedButtonPosition = changes.focusButtonPosition.newValue || null;
    const btn = document.getElementById(BTN_ID);
    if (btn) applyButtonPosition(btn, savedButtonPosition);
  }
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getButtonBounds(btn) {
  const { width, height } = btn.getBoundingClientRect();
  return {
    maxLeft: Math.max(BUTTON_MARGIN, window.innerWidth - width - BUTTON_MARGIN),
    maxTop: Math.max(BUTTON_MARGIN, window.innerHeight - height - BUTTON_MARGIN)
  };
}

function applyButtonPosition(btn, position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;

  const { maxLeft, maxTop } = getButtonBounds(btn);
  const left = BUTTON_MARGIN + clamp(position.x, 0, 1) * (maxLeft - BUTTON_MARGIN);
  const top = BUTTON_MARGIN + clamp(position.y, 0, 1) * (maxTop - BUTTON_MARGIN);

  btn.style.left = `${Math.round(left)}px`;
  btn.style.top = `${Math.round(top)}px`;
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
}

function saveButtonPosition(btn) {
  const rect = btn.getBoundingClientRect();
  const { maxLeft, maxTop } = getButtonBounds(btn);
  const position = {
    x: (rect.left - BUTTON_MARGIN) / Math.max(1, maxLeft - BUTTON_MARGIN),
    y: (rect.top - BUTTON_MARGIN) / Math.max(1, maxTop - BUTTON_MARGIN)
  };
  savedButtonPosition = position;
  savePreferences({ focusButtonPosition: position });
}

function makeButtonDraggable(btn) {
  let dragStart = null;
  let dragged = false;
  let suppressClick = false;

  btn.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = btn.getBoundingClientRect();
    dragStart = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY
    };
    dragged = false;
    btn.setPointerCapture(event.pointerId);
  });

  btn.addEventListener('pointermove', event => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const moved = Math.abs(event.clientX - dragStart.startX) + Math.abs(event.clientY - dragStart.startY);
    if (moved < 4) return;

    dragged = true;
    const { maxLeft, maxTop } = getButtonBounds(btn);
    const left = clamp(event.clientX - dragStart.offsetX, BUTTON_MARGIN, maxLeft);
    const top = clamp(event.clientY - dragStart.offsetY, BUTTON_MARGIN, maxTop);
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    btn.style.cursor = 'grabbing';
  });

  const finishDrag = event => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    if (btn.hasPointerCapture(event.pointerId)) btn.releasePointerCapture(event.pointerId);
    if (dragged) {
      saveButtonPosition(btn);
      suppressClick = true;
    }
    dragStart = null;
    btn.style.cursor = 'grab';
  };

  btn.addEventListener('pointerup', finishDrag);
  btn.addEventListener('pointercancel', finishDrag);
  btn.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
}

function createFloatingButton() {
  if (!location.pathname.includes('/watch')) return;
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '🎯 Focus';
  btn.setAttribute('aria-label', 'Enable Focus Mode');
  btn.setAttribute('aria-description', 'Drag to move this button. Its position is saved automatically.');
  btn.setAttribute('aria-pressed', 'false');
  btn.style.cssText = `
    position: fixed; bottom: 24px; left: 24px; z-index: 9999;
    padding: 8px 16px; background: rgba(0,0,0,0.8); color: white;
    border: 1px solid rgba(255,255,255,0.3); border-radius: 20px;
    font-size: 13px; cursor: grab; touch-action: none; user-select: none;
    transition: background 0.3s ease;
  `;
  btn.addEventListener('mouseenter', () => (btn.style.background = 'rgba(255,255,255,0.15)'));
  btn.addEventListener('mouseleave', () => (btn.style.background = 'rgba(0,0,0,0.8)'));
  btn.addEventListener('click', toggleFocusMode);
  document.body.appendChild(btn);
  applyButtonPosition(btn, savedButtonPosition);
  makeButtonDraggable(btn);
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
    restoreSettings(() => {
      createFloatingButton();
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
      currentDimLevel = normalizeDim(msg.dimLevel);
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
