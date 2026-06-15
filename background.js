chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-focus') {
    chrome.tabs.query({ active: true, url: 'https://www.youtube.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFocus' }, () => {
          if (chrome.runtime.lastError) { /* silent */ }
        });
      }
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ focusModeActive: false, dimLevel: 0 });
});
