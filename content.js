let focusModeActive = false;
let currentDimLevel = 0;

function createOverlay() {
  if (document.getElementById('focustube-overlay')) return;
  const el = document.createElement('div');
  el.id = 'focustube-overlay';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2000',
    background: '#000',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease'
  });
  document.body.appendChild(el);
}

function waitForElement(sel, cb, maxWait = 10000) {
  const iv = setInterval(() => {
    const el = document.querySelector(sel);
    if (el) {
      clearInterval(iv);
      clearTimeout(t);
      cb(el);
    }
  }, 300);
  const t = setTimeout(() => clearInterval(iv), maxWait);
}

function getPlayer() {
  return document.querySelector('#movie_player');
}

function hideDistractions() {
  ['#masthead', '#secondary', 'ytd-comments', '#description',
   '#owner', '#below', 'ytd-playlist-panel-renderer'].forEach(s => {
    const el = document.querySelector(s);
    if (el) el.classList.add('focustube-hidden');
  });
}

function showDistractions() {
  document.querySelectorAll('.focustube-hidden').forEach(el => {
    el.classList.remove('focustube-hidden');
  });
}

function enableFocusMode(dim) {
  const overlay = document.getElementById('focustube-overlay');
  if (overlay) overlay.style.opacity = dim / 100;

  const player = getPlayer();
  if (player) {
    player.style.zIndex = '2001';
    player.style.isolation = 'isolate';
    player.style.transform = 'translateZ(0)';
  }
  document.body.classList.add('focustube-active');
  hideDistractions();

  focusModeActive = true;
  try { chrome.storage.sync.set({ focusModeActive: true, dimLevel: dim }); } catch {}
  updateBtnText('✖ Exit Focus');
}

function disableFocusMode() {
  const overlay = document.getElementById('focustube-overlay');
  if (overlay) overlay.style.opacity = '0';

  const player = getPlayer();
  if (player) {
    player.style.zIndex = '';
    player.style.isolation = '';
    player.style.transform = '';
  }
  document.body.classList.remove('focustube-active');
  showDistractions();

  focusModeActive = false;
  try { chrome.storage.sync.set({ focusModeActive: false }); } catch {}
  updateBtnText('🎯 Focus');
}

function toggleFocusMode() {
  focusModeActive ? disableFocusMode() : enableFocusMode(currentDimLevel);
}

function updateBtnText(txt) {
  const btn = document.getElementById('focustube-btn');
  if (btn) btn.textContent = txt;
}

function createFloatingButton() {
  if (!location.pathname.includes('/watch') || document.getElementById('focustube-btn')) return;

  const btn = document.createElement('div');
  btn.id = 'focustube-btn';
  btn.textContent = '🎯 Focus';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    left: '24px',
    zIndex: '9999',
    padding: '8px 16px',
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '20px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  });
  btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.15)');
  btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(0,0,0,0.8)');
  btn.addEventListener('click', toggleFocusMode);
  document.body.appendChild(btn);
}

let navTimeout;
function debounceNav() {
  if (navTimeout) return;
  navTimeout = setTimeout(() => { navTimeout = null; handleNavigation(); }, 500);
}

let lastNav = 0;
function handleNavigation() {
  if (Date.now() - lastNav < 600) return;
  lastNav = Date.now();

  if (location.pathname.includes('/watch')) {
    createOverlay();
    createFloatingButton();
    chrome.storage.sync.get(['focusModeActive', 'dimLevel'], (data) => {
      if (data.focusModeActive) {
        currentDimLevel = data.dimLevel ?? 0;
        waitForElement('#movie_player', () => enableFocusMode(currentDimLevel), 8000);
      }
    });
  } else {
    disableFocusMode();
    const btn = document.getElementById('focustube-btn');
    if (btn) btn.remove();
  }
}

window.addEventListener('yt-navigate-finish', debounceNav);

const mo = new MutationObserver(debounceNav);
const titleEl = document.querySelector('title');
if (titleEl) mo.observe(titleEl, { childList: true, subtree: true });

handleNavigation();

chrome.runtime.onMessage.addListener((msg, _, respond) => {
  if (msg.action === 'toggleFocus') {
    toggleFocusMode();
    respond({ status: 'ok', focusModeActive });
  }
  if (msg.action === 'updateDim') {
    currentDimLevel = msg.dimLevel;
    const overlay = document.getElementById('focustube-overlay');
    if (overlay && focusModeActive) overlay.style.opacity = msg.dimLevel / 100;
    respond({ status: 'ok' });
  }
  if (msg.action === 'getStatus') {
    respond({ focusModeActive, dimLevel: currentDimLevel });
  }
  return true;
});
