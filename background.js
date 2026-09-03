chrome.commands.onCommand.addListener(cmd => {
  if (cmd !== 'toggle-focus') return;
  chrome.tabs.query({ active: true, url: 'https://www.youtube.com/*' }, tabs => {
    if (!tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFocus' }, () => {
      if (chrome.runtime.lastError) {}
    });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ focusModeActive: false, dimLevel: 0 });
});
