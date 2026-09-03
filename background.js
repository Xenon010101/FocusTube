chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-focus') return;

  chrome.tabs.query({ active: true, url: 'https://www.youtube.com/*' }, (tabs) => {
    if (!tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFocus' }, () => {
      // The tab may not have the content script loaded (e.g. right after
      // a reload), so ignore sendMessage failures silently.
      void chrome.runtime.lastError;
    });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ focusModeActive: false, dimLevel: 0 });
});
