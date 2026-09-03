function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggleBtn');
  const slider = document.getElementById('dimSlider');
  const pct = document.getElementById('dimValue');

  chrome.storage.sync.get(['focusModeActive', 'dimLevel'], data => {
    const dim = data.dimLevel ?? 0;
    slider.value = dim;
    pct.textContent = dim + '%';
    applyBtnState(data.focusModeActive);
  });

  function applyBtnState(active) {
    btn.textContent = active ? '✖ Disable Focus Mode' : '🎯 Enable Focus Mode';
    btn.style.background = active ? '#00c853' : '#444';
  }

  btn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab?.url?.includes('youtube.com/watch')) {
        alert('Please open a YouTube video first');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'toggleFocus' }, res => {
        if (chrome.runtime.lastError || !res) return;
        applyBtnState(res.focusModeActive);
      });
    });
  });

  const saveDim = debounce(val => chrome.storage.sync.set({ dimLevel: val }), 300);

  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    pct.textContent = val + '%';
    saveDim(val);

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateDim', dimLevel: val }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.focusModeActive) applyBtnState(changes.focusModeActive.newValue);
    if (changes.dimLevel) {
      slider.value = changes.dimLevel.newValue;
      pct.textContent = changes.dimLevel.newValue + '%';
    }
  });
});
