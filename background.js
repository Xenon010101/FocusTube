const FOCUS_TAB_STATE_PREFIX = 'focusTabState:';

const focusTabStateKey = tabId => `${FOCUS_TAB_STATE_PREFIX}${tabId}`;

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

// Focus state belongs to an individual tab. Session storage survives service
// worker restarts but is cleared when the browser closes, which matches a
// temporary viewing mode without leaking it into other tabs.
function saveFocusTabState(tabId, active, sendResponse) {
  const key = focusTabStateKey(tabId);
  const complete = () => sendResponse({ status: 'ok' });
  if (active) chrome.storage.session.set({ [key]: true }, complete);
  else chrome.storage.session.remove(key, complete);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId || !['getFocusState', 'setFocusState'].includes(message.action)) return;

  if (message.action === 'setFocusState') {
    saveFocusTabState(tabId, Boolean(message.active), sendResponse);
    return true;
  }

  chrome.storage.session.get(focusTabStateKey(tabId), data => {
    sendResponse({ active: Boolean(data[focusTabStateKey(tabId)]) });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  saveFocusTabState(tabId, false, () => {});
});

chrome.runtime.onInstalled.addListener(() => {
  // Do not overwrite an existing preference when the extension updates.
  chrome.storage.sync.get('dimLevel', ({ dimLevel }) => {
    if (dimLevel === undefined) chrome.storage.sync.set({ dimLevel: 0 });
  });
});
