let focusModeActive = false;
let currentDimLevel = 0;

function createOverlay() {
  if (document.getElementById('focustube-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'focustube-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2000';
  overlay.style.background = 'black';
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.transition = 'opacity 0.4s ease';
  document.body.appendChild(overlay);
}

function waitForElement(selector, callback, maxWait = 10000) {
  const interval = setInterval(() => {
    const el = document.querySelector(selector);
    if (el) {
      clearInterval(interval);
      clearTimeout(timeout);
      callback(el);
    }
  }, 300);

  const timeout = setTimeout(() => {
    clearInterval(interval);
  }, maxWait);
}

function getVideoPlayer() {
  return document.querySelector('#movie_player');
}

function enableFocusMode(dimLevel) {
  const overlay = document.getElementById('focustube-overlay');
  if (overlay) overlay.style.opacity = dimLevel / 100;

  const player = getVideoPlayer();
  if (player) {
    player.style.zIndex = '2001';
    player.style.isolation = 'isolate';
    player.style.transform = 'translateZ(0)';
  }
  document.body.classList.add('focustube-active');

  const selectors = [
    '#masthead', '#secondary', 'ytd-comments', '#description',
    '#owner', '#below', 'ytd-playlist-panel-renderer'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) el.classList.add('focustube-hidden');
  }

  focusModeActive = true;
  try { chrome.storage.sync.set({ focusModeActive: true, dimLevel }); } catch {}
  updateFloatingButtonText('✖ Exit Focus');
}

function disableFocusMode() {
  const overlay = document.getElementById('focustube-overlay');
  if (overlay) overlay.style.opacity = '0';

  const player = getVideoPlayer();
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
  try { chrome.storage.sync.set({ focusModeActive: false }); } catch {}
  updateFloatingButtonText('🎯 Focus');
}

function toggleFocusMode() {
  if (focusModeActive) {
    disableFocusMode();
  } else {
    enableFocusMode(currentDimLevel);
  }
}

function updateFloatingButtonText(text) {
  const btn = document.getElementById('focustube-btn');
  if (btn) btn.textContent = text;
}

function createFloatingButton() {
  if (!location.pathname.includes('/watch')) return;
  if (document.getElementById('focustube-btn')) return;

  const btn = document.createElement('div');
  btn.id = 'focustube-btn';
  btn.textContent = '🎯 Focus';
  btn.style.position = 'fixed';
  btn.style.bottom = '24px';
  btn.style.left = '24px';
  btn.style.zIndex = '9999';
  btn.style.padding = '8px 16px';
  btn.style.background = 'rgba(0,0,0,0.8)';
  btn.style.color = 'white';
  btn.style.border = '1px solid rgba(255,255,255,0.3)';
  btn.style.borderRadius = '20px';
  btn.style.fontSize = '13px';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'all 0.3s ease';
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(255,255,255,0.15)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(0,0,0,0.8)';
  });
  btn.addEventListener('click', toggleFocusMode);
  document.body.appendChild(btn);
}

let navigationTimeout;

function debounceNavigation() {
  if (navigationTimeout) return;
  navigationTimeout = setTimeout(() => {
    navigationTimeout = null;
    handleNavigation();
  }, 500);
}

let lastNavCall = 0;

function handleNavigation() {
  const now = Date.now();
  if (now - lastNavCall < 600) return;
  lastNavCall = now;

  if (location.pathname.includes('/watch')) {
    createOverlay();
    createFloatingButton();
    chrome.storage.sync.get('focusModeActive', (data) => {
      if (data.focusModeActive) {
        waitForElement('#movie_player', () => {
          enableFocusMode(currentDimLevel);
        }, 8000);
      }
    });
  } else {
    disableFocusMode();
    const btn = document.getElementById('focustube-btn');
    if (btn) btn.remove();
  }
}

window.addEventListener('yt-navigate-finish', debounceNavigation);

const titleObserver = new MutationObserver(() => {
  debounceNavigation();
});
const titleEl = document.querySelector('title');
if (titleEl) {
  titleObserver.observe(titleEl, { childList: true, subtree: true });
}

handleNavigation();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'toggleFocus') {
    toggleFocusMode();
    sendResponse({ status: 'ok', focusModeActive });
  }

  if (message.action === 'updateDim') {
    currentDimLevel = message.dimLevel;
    const overlay = document.getElementById('focustube-overlay');
    if (overlay && focusModeActive) {
      overlay.style.opacity = message.dimLevel / 100;
    }
    sendResponse({ status: 'ok' });
  }

  if (message.action === 'getStatus') {
    sendResponse({ focusModeActive, dimLevel: currentDimLevel });
  }

  return true;
});
