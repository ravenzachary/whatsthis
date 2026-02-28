// What's This? - Popup Settings

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleKeyBtn = document.getElementById('toggleKey');
  const modelPrefSelect = document.getElementById('modelPref');
  const saveBtn = document.getElementById('save');
  const testKeyBtn = document.getElementById('testKey');
  const statusEl = document.getElementById('status');
  const historyLink = document.getElementById('historyLink');

  // Detect platform for keyboard shortcut display
  const isMac = navigator.userAgentData?.platform === 'macOS'
    || /Mac/.test(navigator.userAgent);
  const modEl = document.getElementById('modSymbol');
  if (modEl) modEl.textContent = isMac ? '⌘' : 'Ctrl';

  // Load usage stats
  chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (stats) => {
    if (stats) {
      document.getElementById('queriesToday').textContent = stats.queriesToday || 0;
      document.getElementById('totalQueries').textContent = stats.totalQueries || 0;
    }
  });

  // Load saved settings
  chrome.storage.local.get(['apiKey', 'modelPreference'], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.modelPreference) {
      modelPrefSelect.value = result.modelPreference;
    }
  });

  // Toggle API key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁';
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const modelPreference = modelPrefSelect.value;

    if (!apiKey) {
      showStatus('Please enter an API key.', 'error');
      return;
    }

    chrome.storage.local.set({ apiKey, modelPreference }, () => {
      showStatus('Settings saved!', 'success');
    });
  });

  // Test API key
  testKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please enter an API key first.', 'error');
      return;
    }
    if (!apiKey.startsWith('sk-ant-')) {
      showStatus('Key should start with "sk-ant-".', 'error');
      return;
    }
    testKeyBtn.disabled = true;
    testKeyBtn.textContent = 'Testing...';
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }]
        })
      });
      if (resp.ok) {
        showStatus('API key is valid!', 'success');
      } else if (resp.status === 401) {
        showStatus('Invalid API key.', 'error');
      } else if (resp.status === 429) {
        showStatus('Key valid but rate limited. Try later.', 'error');
      } else {
        showStatus(`API error (${resp.status}). Check your key.`, 'error');
      }
    } catch (err) {
      showStatus('Network error. Check your connection.', 'error');
    }
    testKeyBtn.disabled = false;
    testKeyBtn.textContent = 'Test Key';
  });

  // History link
  historyLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 2500);
  }
});
