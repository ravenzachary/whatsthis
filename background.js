// What's This? - Background Service Worker
// Handles context menus, API calls, conversation state, and history

const SYSTEM_PROMPT = `You are a knowledgeable assistant embedded in a browser extension called "What's This?"
Your job is to help the user learn about content they've selected on a web page.

Be concise and informative. Use markdown formatting for readability.
Structure your response as:
- **What it is**: A clear definition or identification (1-2 sentences)
- **Why it matters**: Context and significance (1-2 sentences)
- **Key details**: The most important things to know (2-4 bullet points)
- **Learn more**: Include 1-2 relevant Wikipedia links formatted as markdown links, e.g. [Topic](https://en.wikipedia.org/wiki/Topic). Use underscores for spaces in URLs.

If the selection is ambiguous (e.g. a common word with multiple meanings, or a phrase that could refer to different things), DO NOT guess. Instead:
1. Briefly list the 2-3 most likely interpretations
2. Ask the user: "Which meaning are you interested in?" or "Could you clarify which one you mean?"
The user can respond via the follow-up input below your message.

Use the surrounding context (page title, nearby headings, URL) to disambiguate when possible.
Keep follow-up responses focused on the original topic.

IMPORTANT: Detect the language of the selected text and the page. If the content is not in English, respond in the same language as the selected text. If the page is in one language but the selection is in another (e.g. a foreign term on an English page), provide your response in the page's language but include the original term.`;

const FOLLOW_UP_SYSTEM = `You are continuing a conversation about content the user selected on a web page.
Stay focused on the original topic. Be concise. Use markdown formatting.
If the user is clarifying an ambiguous selection, provide the full structured response for their chosen interpretation.
Include relevant Wikipedia links where helpful, formatted as markdown links.`;

const IMAGE_SYSTEM_PROMPT = `You are a knowledgeable assistant embedded in a browser extension called "What's This?"
The user is pointing at a specific part of an image on a web page.

CRITICAL: If you see a RED CROSSHAIR/CIRCLE marker drawn on the image, the user is pointing at EXACTLY that spot. You MUST:
1. Look at the red crosshair marker in the image — that is precisely where the user's cursor was
2. Identify the specific object, detail, text, or element at or nearest to that marker
3. Lead your response with information about THAT SPECIFIC THING
4. Then briefly provide broader context about the full image

If cursor coordinates are provided as text (percentage from top-left), use those as a secondary reference.

For example:
- If the red crosshair is over a water bottle → lead with info about that water bottle
- If the red crosshair is on a person's tie → lead with the tie, THEN mention who's wearing it
- If the red crosshair is on text/nameplate → lead with what the text says, THEN provide context
NEVER ignore the crosshair location. The user specifically chose to point there.

Structure your response as:
- **Pointing at**: Identify the specific object/detail at the crosshair/cursor location (1-2 sentences)
- **Context**: The broader scene and why it matters (1-2 sentences)
- **Key details**: Important information about both the pointed-at object and the scene (2-4 bullet points)
- **Learn more**: Include 1-2 relevant Wikipedia links formatted as markdown links where applicable

If no cursor marker or coordinates are provided, describe the image as a whole.
If you can identify specific people, places, artworks, logos, brands, species, etc., mention them.
If the image is ambiguous or could depict multiple things, ask the user what specifically they'd like to know more about.
Use any provided context (alt text, caption, surrounding text) to inform your analysis.`;

// Conversation state — persisted in chrome.storage.session to survive service worker restarts
async function getConversation(popoverId) {
  const result = await chrome.storage.session.get(popoverId);
  return result[popoverId] || null;
}

async function setConversation(popoverId, conv) {
  await chrome.storage.session.set({ [popoverId]: conv });
}

async function deleteConversation(popoverId) {
  await chrome.storage.session.remove(popoverId);
}

// Safe message sender — suppresses "Receiving end does not exist" errors
function safeSendMessage(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// ── Badge Management ──

let activeQueries = 0;

function updateBadge(delta) {
  activeQueries = Math.max(0, activeQueries + delta);
  if (activeQueries > 0) {
    chrome.action.setBadgeText({ text: String(activeQueries) });
    chrome.action.setBadgeBackgroundColor({ color: '#7C3AED' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Context Menu Setup ──

chrome.runtime.onInstalled.addListener(async (details) => {
  // Open welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  }

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'whatsthis-text',
    title: "What's This?",
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'whatsthis-image',
    title: "What's This?",
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'whatsthis-video',
    title: "What's This? (Video Frame)",
    contexts: ['video']
  });
  chrome.contextMenus.create({
    id: 'whatsthis-element',
    title: "What's This? (Analyze Element)",
    contexts: ['page', 'frame', 'link']
  });
});

// ── Context Menu Click Handler ──

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'whatsthis-text') {
    safeSendMessage(tab.id, {
      type: 'TRIGGER_WHATSTHIS',
      queryType: 'text',
      selectionText: info.selectionText
    });
  } else if (info.menuItemId === 'whatsthis-image') {
    safeSendMessage(tab.id, {
      type: 'TRIGGER_WHATSTHIS',
      queryType: 'image',
      imageUrl: info.srcUrl
    });
  } else if (info.menuItemId === 'whatsthis-video') {
    safeSendMessage(tab.id, {
      type: 'TRIGGER_WHATSTHIS',
      queryType: 'video',
      videoUrl: info.srcUrl
    });
  } else if (info.menuItemId === 'whatsthis-element') {
    safeSendMessage(tab.id, {
      type: 'TRIGGER_WHATSTHIS',
      queryType: 'element'
    });
  }
});

// ── Keyboard Shortcut Handler ──

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'trigger-whatsthis' && tab?.id) {
    safeSendMessage(tab.id, {
      type: 'TRIGGER_WHATSTHIS',
      queryType: 'text'
    });
  }
});

// ── Message Router ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'QUERY') {
    handleQuery(message, sender.tab?.id);
  } else if (message.type === 'FOLLOW_UP') {
    handleFollowUp(message, sender.tab?.id);
  } else if (message.type === 'GET_HISTORY') {
    getHistory().then(sendResponse);
    return true;
  } else if (message.type === 'CLEAR_HISTORY') {
    clearHistory().then(sendResponse);
    return true;
  } else if (message.type === 'REQUERY') {
    handleRequery(message.popoverId, sender.tab?.id);
  } else if (message.type === 'CLEANUP_CONVERSATION') {
    deleteConversation(message.popoverId);
  } else if (message.type === 'TRACK_USAGE') {
    trackUsage(message.tokens);
  } else if (message.type === 'GET_USAGE') {
    getUsageStats().then(sendResponse);
    return true;
  }
});

// ── API Key & Settings ──

async function getSettings() {
  const result = await chrome.storage.local.get(['apiKey', 'modelPreference']);
  return {
    apiKey: result.apiKey || '',
    modelPreference: result.modelPreference || 'balanced'
  };
}

function getModelsForPreference(pref) {
  switch (pref) {
    case 'fast': return ['claude-haiku-4-5-20251001'];
    case 'deep': return ['claude-sonnet-4-6'];
    case 'balanced':
    default: return ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
  }
}

function getModelLabel(model) {
  if (model.includes('haiku')) return 'Quick Answer';
  if (model.includes('sonnet')) return 'Deeper Analysis';
  return 'Response';
}

// ── Query Handler ──

async function handleQuery(message, tabId) {
  if (!tabId) return;

  const { popoverId, queryType, selectionText, context, imageUrl, videoFrame } = message;
  const settings = await getSettings();

  if (!settings.apiKey) {
    safeSendMessage(tabId, {
      type: 'STREAM_ERROR',
      popoverId,
      error: 'No API key set. Click the extension icon to add your Anthropic API key.'
    });
    return;
  }

  // For image queries with cursor position, use Sonnet only — Haiku struggles with spatial precision
  const hasCursorOnImage = (queryType === 'image' || queryType === 'video') && context?.cursorPosition;
  const models = hasCursorOnImage
    ? ['claude-sonnet-4-6']
    : getModelsForPreference(settings.modelPreference);
  updateBadge(1);

  // Initialize conversation
  const userContent = buildUserContent(queryType, selectionText, context, imageUrl, videoFrame);
  // Store conversation — strip annotatedImage from stored context to save storage space
  const storedContext = context ? { ...context } : {};
  delete storedContext.annotatedImage;
  await setConversation(popoverId, {
    messages: [{ role: 'user', content: userContent }],
    turnCount: 1,
    queryType,
    selectionText,
    context: storedContext
  });

  // Run models sequentially
  let lastResponse = '';
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const label = getModelLabel(model);
    const isLast = i === models.length - 1;

    safeSendMessage(tabId, {
      type: 'STREAM_SECTION_START',
      popoverId,
      label,
      model
    });

    const systemPrompt = queryType === 'image' || queryType === 'video'
      ? IMAGE_SYSTEM_PROMPT
      : SYSTEM_PROMPT;

    const assistantResponse = await streamAnthropicRequest(
      settings.apiKey,
      model,
      systemPrompt,
      [{ role: 'user', content: userContent }],
      tabId,
      popoverId
    );

    if (assistantResponse) {
      lastResponse = assistantResponse;
      // Store only the last model's response in conversation for follow-ups
      const conv = await getConversation(popoverId);
      if (conv) {
        conv.messages = [
          { role: 'user', content: userContent },
          { role: 'assistant', content: assistantResponse }
        ];
        await setConversation(popoverId, conv);
      }
    }

    safeSendMessage(tabId, {
      type: 'STREAM_SECTION_END',
      popoverId,
      isLast
    });
  }

  updateBadge(-1);

  // Save to history with response summary
  saveToHistory({
    queryType,
    selectionText: typeof selectionText === 'string' ? selectionText : '',
    imageUrl,
    pageUrl: context?.pageUrl || '',
    pageTitle: context?.pageTitle || '',
    responseSummary: lastResponse ? lastResponse.substring(0, 300) : '',
    timestamp: Date.now()
  });
  trackUsage();
}

// ── Follow-up Handler ──

async function handleFollowUp(message, tabId) {
  if (!tabId) return;

  const { popoverId, question } = message;
  const settings = await getSettings();
  const conv = await getConversation(popoverId);

  if (!conv) {
    safeSendMessage(tabId, {
      type: 'STREAM_ERROR',
      popoverId,
      error: 'Conversation expired. Please start a new query.'
    });
    return;
  }

  if (conv.turnCount >= 5) {
    safeSendMessage(tabId, {
      type: 'STREAM_ERROR',
      popoverId,
      error: 'Maximum follow-up limit reached (5 turns). Please start a new query.'
    });
    return;
  }

  // Add user message
  conv.messages.push({ role: 'user', content: question });
  conv.turnCount++;

  // Use the deeper model for follow-ups
  const model = settings.modelPreference === 'fast'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-6';

  safeSendMessage(tabId, {
    type: 'STREAM_SECTION_START',
    popoverId,
    label: `Follow-up (${conv.turnCount - 1}/4)`,
    model
  });

  const assistantResponse = await streamAnthropicRequest(
    settings.apiKey,
    model,
    FOLLOW_UP_SYSTEM,
    conv.messages,
    tabId,
    popoverId
  );

  if (assistantResponse) {
    conv.messages.push({ role: 'assistant', content: assistantResponse });
  }

  await setConversation(popoverId, conv);

  safeSendMessage(tabId, {
    type: 'STREAM_SECTION_END',
    popoverId,
    isLast: true
  });
}

// ── Build User Content ──

function buildUserContent(queryType, selectionText, context, imageUrl, videoFrame) {
  if (queryType === 'image') {
    const parts = [];

    // If we have an annotated image (with crosshair drawn on it), use that as the primary image
    if (context?.annotatedImage) {
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: context.annotatedImage }
      });
    } else {
      parts.push({
        type: 'image',
        source: { type: 'url', url: imageUrl }
      });
    }

    let textContext = 'The user is pointing at this image on a web page.';
    if (context?.annotatedImage && context?.cursorPosition) {
      const cx = context.cursorPosition.x;
      const cy = context.cursorPosition.y;
      const hPos = cx < 25 ? 'far left' : cx < 40 ? 'left-center' : cx < 60 ? 'center' : cx < 75 ? 'right-center' : 'far right';
      const vPos = cy < 25 ? 'top' : cy < 40 ? 'upper-middle' : cy < 60 ? 'middle' : cy < 75 ? 'lower-middle' : 'bottom';
      textContext += `\n\nA RED CROSSHAIR has been drawn on the image at the user's cursor position (${vPos}-${hPos}, ${cx}% from left, ${cy}% from top). Look for that red circle/crosshair marker — the user wants to know about the specific object or detail AT that marked spot. Lead with that object.`;
    } else if (context?.cursorPosition) {
      const cx = context.cursorPosition.x;
      const cy = context.cursorPosition.y;
      const hPos = cx < 25 ? 'far left' : cx < 40 ? 'left-center' : cx < 60 ? 'center' : cx < 75 ? 'right-center' : 'far right';
      const vPos = cy < 25 ? 'top' : cy < 40 ? 'upper-middle' : cy < 60 ? 'middle' : cy < 75 ? 'lower-middle' : 'bottom';
      textContext += `\n\nCRITICAL — CURSOR POSITION: The user's cursor is pointing at the ${vPos}-${hPos} area of the image (${cx}% from left, ${cy}% from top). Look at EXACTLY that spot in the image. What specific object, text, item, or detail is located there? That is what the user wants to know about. Start your response by identifying that specific thing.`;
    }
    if (context?.altText) textContext += `\nAlt text: ${context.altText}`;
    if (context?.caption) textContext += `\nCaption: ${context.caption}`;
    if (context?.nearbyText) textContext += `\nNearby text: ${context.nearbyText}`;
    if (context?.pageTitle) textContext += `\nPage: ${context.pageTitle}`;
    parts.push({ type: 'text', text: textContext });
    return parts;
  }

  if (queryType === 'video') {
    const parts = [];
    if (videoFrame) {
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: videoFrame }
      });
    }
    let textContext = 'The user is pointing at a video on a web page and wants to know about the current frame.';
    if (context?.cursorPosition) {
      textContext += `\nThe user's cursor is at approximately ${context.cursorPosition.x}% from the left and ${context.cursorPosition.y}% from the top of the frame.`;
    }
    if (context?.pageTitle) textContext += `\nPage: ${context.pageTitle}`;
    if (context?.pageUrl) textContext += `\nURL: ${context.pageUrl}`;
    parts.push({ type: 'text', text: textContext });
    return parts;
  }

  // Text query
  let text = `Selected text: "${selectionText}"`;
  if (context?.surroundingText) text += `\n\nSurrounding context: ${context.surroundingText}`;
  if (context?.nearestHeading) text += `\nSection heading: ${context.nearestHeading}`;
  if (context?.pageTitle) text += `\nPage title: ${context.pageTitle}`;
  if (context?.pageUrl) text += `\nPage URL: ${context.pageUrl}`;
  return text;
}

// ── Streaming API Call ──

async function streamAnthropicRequest(apiKey, model, systemPrompt, messages, tabId, popoverId) {
  let fullResponse = '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg = `API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorBody);
        errorMsg = parsed.error?.message || errorMsg;
      } catch {}

      let retryable = false;
      if (response.status === 401) errorMsg = 'Invalid API key. Please check your key in the extension settings.';
      if (response.status === 429) { errorMsg = 'Rate limited. Please wait a moment and try again.'; retryable = true; }
      if (response.status === 529) { errorMsg = 'Anthropic API is overloaded. Please try again shortly.'; retryable = true; }
      if (response.status >= 500 && response.status !== 529) { retryable = true; }

      safeSendMessage(tabId, { type: 'STREAM_ERROR', popoverId, error: errorMsg, retryable });
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullResponse += event.delta.text;
              safeSendMessage(tabId, {
                type: 'STREAM_CHUNK',
                popoverId,
                text: event.delta.text
              });
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    safeSendMessage(tabId, {
      type: 'STREAM_ERROR',
      popoverId,
      error: `Network error: ${err.message}`
    });
    return null;
  }

  return fullResponse;
}

// ── History Management ──

async function saveToHistory(entry) {
  const result = await chrome.storage.local.get('history');
  const history = result.history || [];
  history.unshift(entry);
  // Keep last 100 entries
  if (history.length > 100) history.length = 100;
  await chrome.storage.local.set({ history });
}

async function getHistory() {
  const result = await chrome.storage.local.get('history');
  return result.history || [];
}

async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
  return true;
}

// ── Re-query Handler ──

async function handleRequery(popoverId, tabId) {
  if (!tabId) return;
  const conv = await getConversation(popoverId);
  if (!conv || !conv.messages.length) {
    safeSendMessage(tabId, { type: 'STREAM_ERROR', popoverId, error: 'No query to re-run.' });
    return;
  }

  const settings = await getSettings();
  // Flip the model: if they were on balanced/fast, use deep; if deep, use fast
  const model = settings.modelPreference === 'deep'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-6';
  const label = settings.modelPreference === 'deep' ? 'Quick Answer (Haiku)' : 'Deep Analysis (Sonnet)';

  const systemPrompt = conv.queryType === 'image' || conv.queryType === 'video'
    ? IMAGE_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const userContent = conv.messages[0].content;

  safeSendMessage(tabId, { type: 'STREAM_SECTION_START', popoverId, label, model });

  const response = await streamAnthropicRequest(
    settings.apiKey, model, systemPrompt, [{ role: 'user', content: userContent }], tabId, popoverId
  );

  if (response) {
    conv.messages = [{ role: 'user', content: userContent }, { role: 'assistant', content: response }];
    conv.turnCount = 1;
    await setConversation(popoverId, conv);
  }

  safeSendMessage(tabId, { type: 'STREAM_SECTION_END', popoverId, isLast: true });

  // Track usage
  await trackUsage();
}

// ── Usage Tracking ──

async function trackUsage() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get('usage');
  const usage = result.usage || { date: today, queries: 0, totalQueries: 0 };
  if (usage.date !== today) {
    usage.date = today;
    usage.queries = 0;
  }
  usage.queries++;
  usage.totalQueries = (usage.totalQueries || 0) + 1;
  await chrome.storage.local.set({ usage });
}

async function getUsageStats() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get('usage');
  const usage = result.usage || { date: today, queries: 0, totalQueries: 0 };
  if (usage.date !== today) {
    return { queriesToday: 0, totalQueries: usage.totalQueries || 0 };
  }
  return { queriesToday: usage.queries, totalQueries: usage.totalQueries || 0 };
}
