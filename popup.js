function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const dimSlider = document.getElementById('dimSlider');
  const dimValue = document.getElementById('dimValue');

  chrome.storage.sync.get(['focusModeActive', 'dimLevel'], (data) => {
    const dim = data.dimLevel ?? 0;
    dimSlider.value = dim;
    dimValue.textContent = dim + '%';

    if (data.focusModeActive) {
      toggleBtn.textContent = '✖ Disable Focus Mode';
      toggleBtn.style.background = '#00c853';
    } else {
      toggleBtn.textContent = '🎯 Enable Focus Mode';
      toggleBtn.style.background = '#444444';
    }
  });

  toggleBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
        alert('Please open a YouTube video first');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'toggleFocus' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.focusModeActive !== undefined) {
          if (response.focusModeActive) {
            toggleBtn.textContent = '✖ Disable Focus Mode';
            toggleBtn.style.background = '#00c853';
          } else {
            toggleBtn.textContent = '🎯 Enable Focus Mode';
            toggleBtn.style.background = '#444444';
          }
        }
      });
    });
  });

  const saveDim = debounce((val) => {
    chrome.storage.sync.set({ dimLevel: val });
  }, 300);

  dimSlider.addEventListener('input', () => {
    const val = Number(dimSlider.value);
    dimValue.textContent = val + '%';
    saveDim(val);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateDim', dimLevel: val }, () => {
          if (chrome.runtime.lastError) { /* silent */ }
        });
      }
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.focusModeActive) {
      const isActive = changes.focusModeActive.newValue;
      toggleBtn.textContent = isActive ? '✖ Disable Focus Mode' : '🎯 Enable Focus Mode';
      toggleBtn.style.background = isActive ? '#00c853' : '#444444';
    }

    if (changes.dimLevel) {
      dimSlider.value = changes.dimLevel.newValue;
      dimValue.textContent = changes.dimLevel.newValue + '%';
    }
  });
});
