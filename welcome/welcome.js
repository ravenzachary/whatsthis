// What's This? — Welcome Page

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleKeyBtn = document.getElementById('toggleKey');
  const nextStep1Btn = document.getElementById('nextStep1');
  const nextStep2Btn = document.getElementById('nextStep2');
  const tryItBtn = document.getElementById('tryIt');

  // Detect platform for keyboard shortcut display
  const isMac = navigator.userAgentData?.platform === 'macOS'
    || /Mac/.test(navigator.userAgent);
  document.getElementById('modKey').textContent = isMac ? 'Cmd' : 'Ctrl';

  // Load existing API key if set
  chrome.storage.local.get(['apiKey', 'modelPreference'], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
      nextStep1Btn.disabled = false;
    }
    if (result.modelPreference) {
      const radio = document.querySelector(`input[name="mode"][value="${result.modelPreference}"]`);
      if (radio) radio.checked = true;
    }
  });

  // Enable continue when key is entered
  apiKeyInput.addEventListener('input', () => {
    const val = apiKeyInput.value.trim();
    nextStep1Btn.disabled = !val || !val.startsWith('sk-ant-');
    if (val && !val.startsWith('sk-ant-') && val.length > 5) {
      nextStep1Btn.textContent = 'Key should start with sk-ant-...';
    } else {
      nextStep1Btn.textContent = 'Continue';
    }
  });

  // Toggle key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁';
  });

  // Step 1 -> 2
  nextStep1Btn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) return;

    // Test the key
    nextStep1Btn.textContent = 'Verifying key...';
    nextStep1Btn.disabled = true;

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
          messages: [{ role: 'user', content: 'Say ok' }]
        })
      });

      if (!resp.ok && resp.status === 401) {
        nextStep1Btn.textContent = 'Invalid key — please check and retry';
        nextStep1Btn.disabled = false;
        return;
      }
    } catch {
      // Network error — save anyway, they can test later
    }

    // Save key
    chrome.storage.local.set({ apiKey });

    // Advance to step 2
    goToStep(2);
  });

  // Step 2 -> 3
  nextStep2Btn.addEventListener('click', () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    chrome.storage.local.set({ modelPreference: mode });
    goToStep(3);
  });

  // Mode card visual selection
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // "Try it now" button
  tryItBtn.addEventListener('click', () => {
    // Select the button text to demonstrate the extension
    const range = document.createRange();
    range.selectNodeContents(tryItBtn);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  function goToStep(step) {
    // Update step dots
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById(`step${i}dot`);
      const content = document.getElementById(`step${i}`);
      dot.classList.remove('active', 'done');
      content.classList.remove('active');

      if (i < step) {
        dot.classList.add('done');
        dot.textContent = '✓';
      } else if (i === step) {
        dot.classList.add('active');
      }

      if (i === step) {
        content.classList.add('active');
      }
    }

    // Update step lines
    const lines = document.querySelectorAll('.step-line');
    lines.forEach((line, idx) => {
      line.classList.toggle('done', idx < step - 1);
    });
  }
});
