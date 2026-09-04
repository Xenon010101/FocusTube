// FocusTube popup. Thin UI: a toggle button and a dim slider.

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function isYouTubeWatchPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.youtube.com' && parsed.pathname === '/watch';
  } catch {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggleBtn');
  const slider = document.getElementById('dimSlider');
  const pct = document.getElementById('dimValue');

  // The popup closes when the user clicks elsewhere, so we read state
  // fresh on every open.
  chrome.storage.sync.get('dimLevel', (data) => {
    const dim = data.dimLevel ?? 0;
    slider.value = dim;
    pct.textContent = dim + '%';

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return renderButton(false);
      chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (res) => {
        void chrome.runtime.lastError;
        renderButton(Boolean(res?.focusModeActive));
      });
    });
  });

  function renderButton(active) {
    btn.textContent = active ? '✖ Disable Focus Mode' : 'Enable Focus Mode';
    btn.style.background = active ? '#00c853' : '#444';
  }

  btn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!isYouTubeWatchPage(tab?.url)) {
        alert('Please open a YouTube video first');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'toggleFocus' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        renderButton(res.focusModeActive);
      });
    });
  });

  // Persist live in the content script for instant feedback, but only
  // write to storage once the user pauses — avoids hitting Chrome's
  // per-minute write quota while dragging.
  const saveDim = debounce((val) => chrome.storage.sync.set({ dimLevel: val }), 300);

  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    pct.textContent = val + '%';
    saveDim(val);

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: 'updateDim', dimLevel: val }, () => {
        void chrome.runtime.lastError;
      });
    });
  });

  // Dim level is shared as a preference across tabs. Focus state itself is
  // intentionally tab-local, so it is always read from the active tab above.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.dimLevel) {
      slider.value = changes.dimLevel.newValue;
      pct.textContent = changes.dimLevel.newValue + '%';
    }
  });
});
