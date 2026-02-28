// What's This? - Content Script
// Handles selection capture, Shadow DOM popover, streaming display, follow-ups

(() => {
  // Track active popovers
  const activePopovers = new Map();
  let popoverCounter = 0;

  // ── Track Right-Clicked Element ──

  let lastRightClickedElement = null;
  let lastCursorPosition = null; // { x: %, y: % } relative to the image
  document.addEventListener('contextmenu', (e) => {
    lastRightClickedElement = e.target;
    lastCursorPosition = getCursorPositionOnElement(e, e.target);
  }, true);

  function getCursorPositionOnElement(event, el) {
    // Walk up to find the actual image/media element
    let target = el;
    for (let i = 0; i < 4 && target; i++) {
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.tagName === 'CANVAS') break;
      target = target.parentElement;
    }
    if (!target || (target.tagName !== 'IMG' && target.tagName !== 'VIDEO' && target.tagName !== 'CANVAS')) {
      // Try computing from bounding rect of whatever we found
      target = el;
    }
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((event.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((event.clientY - rect.top) / rect.height * 100).toFixed(1);
    return { x: parseFloat(x), y: parseFloat(y), element: target.tagName };
  }

  // ── Single-key Trigger (F2) ──

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      const selection = window.getSelection();
      const selectedText = selection?.toString()?.trim();
      if (selectedText) {
        handleTrigger({ queryType: 'text', selectionText: selectedText });
      }
    }
  });

  // ── Hover Dwell Trigger (Images/Videos) ──

  let hoverTimer = null;
  let hoverIndicator = null;
  let hoverTarget = null;

  function createHoverIndicator(x, y) {
    removeHoverIndicator();
    hoverIndicator = document.createElement('div');
    hoverIndicator.style.cssText = `
      all: initial;
      position: fixed;
      left: ${x - 18}px;
      top: ${y - 18}px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid rgba(124, 58, 237, 0.6);
      pointer-events: none;
      z-index: 2147483646;
      animation: wt-dwell-pulse 1.5s ease-out forwards;
    `;
    // Inject keyframes if not present
    if (!document.getElementById('wt-dwell-styles')) {
      const style = document.createElement('style');
      style.id = 'wt-dwell-styles';
      style.textContent = `
        @keyframes wt-dwell-pulse {
          0% { transform: scale(1); opacity: 1; border-color: rgba(124, 58, 237, 0.3); }
          80% { transform: scale(0.6); opacity: 1; border-color: rgba(124, 58, 237, 0.8); }
          100% { transform: scale(0.4); opacity: 0.9; border-color: rgba(124, 58, 237, 1); }
        }
        @keyframes wt-selection-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(hoverIndicator);
  }

  function removeHoverIndicator() {
    if (hoverIndicator) {
      hoverIndicator.remove();
      hoverIndicator = null;
    }
    if (selectionIndicator) {
      selectionIndicator.remove();
      selectionIndicator = null;
    }
  }

  function clearHoverTimer() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    removeHoverIndicator();
    hoverTarget = null;
  }

  function isMediaElement(el) {
    if (!el) return null;
    // Walk up to 3 parents looking for images/videos — fast tag checks first
    let current = el;
    for (let i = 0; i < 4 && current; i++) {
      const tag = current.tagName;
      if (tag === 'IMG' && (current.src || current.dataset?.src)) return { type: 'img', el: current };
      if (tag === 'VIDEO') return { type: 'video', el: current };
      if (tag === 'PICTURE') return { type: 'picture', el: current };
      // Only check background-image on sizeable divs/spans (skip getComputedStyle on small elements)
      if ((tag === 'DIV' || tag === 'SPAN' || tag === 'SECTION' || tag === 'A' || tag === 'FIGURE') &&
          current.offsetWidth > 80 && current.offsetHeight > 80) {
        const bg = current.style.backgroundImage || '';
        if (bg && bg !== 'none' && bg.includes('url(')) {
          return { type: 'bg', el: current };
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  document.addEventListener('mouseover', (e) => {
    // Don't trigger if hovering over our own popover
    if (e.target.id?.startsWith('wt-')) return;
    const media = isMediaElement(e.target);
    if (media) {
      hoverTarget = media;
    }
  }, { passive: true });

  // Throttled mousemove for hover dwell — runs at most every 100ms
  let lastMoveTime = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMoveTime < 100) return; // Throttle to 10fps
    lastMoveTime = now;

    // If in an input or over our popover, ignore
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      clearHoverTimer();
      return;
    }
    if (e.target.id?.startsWith('wt-')) {
      clearHoverTimer();
      return;
    }

    // Reset timer on any movement
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
      removeHoverIndicator();
    }

    const media = isMediaElement(e.target);
    if (!media) {
      hoverTarget = null;
      return;
    }
    hoverTarget = media;

    // Start dwell timer
    const mx = e.clientX;
    const my = e.clientY;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (!hoverTarget) return;
      removeHoverIndicator();
      lastRightClickedElement = hoverTarget.el;
      // Compute cursor position on the element for the hover trigger
      const rect = hoverTarget.el.getBoundingClientRect();
      if (rect.width && rect.height) {
        lastCursorPosition = {
          x: parseFloat(((mx - rect.left) / rect.width * 100).toFixed(1)),
          y: parseFloat(((my - rect.top) / rect.height * 100).toFixed(1)),
          element: hoverTarget.el.tagName
        };
        showCursorFlash(mx, my);
      }
      handleTrigger({ queryType: 'element' });
      hoverTarget = null;
    }, 1500);

    createHoverIndicator(mx, my);
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    const media = isMediaElement(e.target);
    if (media) {
      clearHoverTimer();
    }
  });

  // ── Text Selection Dwell Trigger ──

  let selectionTimer = null;
  let selectionIndicator = null;

  function createSelectionIndicator() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width) return;

    removeHoverIndicator(); // also removes selectionIndicator
    selectionIndicator = document.createElement('div');
    selectionIndicator.style.cssText = `
      all: initial;
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 4}px;
      height: 3px;
      width: 0%;
      max-width: ${Math.min(rect.width, 200)}px;
      background: linear-gradient(90deg, #7C3AED, #A855F7);
      border-radius: 2px;
      pointer-events: none;
      z-index: 2147483646;
      animation: wt-selection-bar 1s ease-out forwards;
    `;
    // Ensure keyframes exist
    if (!document.getElementById('wt-dwell-styles')) {
      const style = document.createElement('style');
      style.id = 'wt-dwell-styles';
      style.textContent = `
        @keyframes wt-selection-bar { 0% { width: 0%; } 100% { width: 100%; } }
        @keyframes wt-dwell-pulse {
          0% { transform: scale(1); opacity: 1; border-color: rgba(124, 58, 237, 0.3); }
          80% { transform: scale(0.6); opacity: 1; border-color: rgba(124, 58, 237, 0.8); }
          100% { transform: scale(0.4); opacity: 0.9; border-color: rgba(124, 58, 237, 1); }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(selectionIndicator);
  }

  function clearSelectionTimer() {
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
    if (selectionIndicator) {
      selectionIndicator.remove();
      selectionIndicator = null;
    }
  }

  document.addEventListener('mouseup', (e) => {
    // Don't trigger in inputs or on our popovers
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.target.id?.startsWith('wt-')) return;

    clearSelectionTimer();

    // Check if there's a text selection
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString()?.trim();
      if (!text || text.length < 2) return;

      createSelectionIndicator();
      selectionTimer = setTimeout(() => {
        selectionTimer = null;
        if (selectionIndicator) {
          selectionIndicator.remove();
          selectionIndicator = null;
        }
        // Verify selection still exists
        const currentText = window.getSelection()?.toString()?.trim();
        if (currentText && currentText.length >= 2) {
          handleTrigger({ queryType: 'text', selectionText: currentText });
        }
      }, 1000);
    }, 50);
  });

  // Cancel selection timer if user clicks elsewhere or starts a new selection
  document.addEventListener('mousedown', () => {
    clearSelectionTimer();
  });

  // ── Message Listener ──

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'TRIGGER_WHATSTHIS':
        handleTrigger(message);
        break;
      case 'STREAM_SECTION_START':
        handleSectionStart(message);
        break;
      case 'STREAM_CHUNK':
        handleChunk(message);
        break;
      case 'STREAM_SECTION_END':
        handleSectionEnd(message);
        break;
      case 'STREAM_ERROR':
        handleError(message);
        break;
    }
  });

  // ── Trigger Handler ──

  async function handleTrigger(message) {
    const { queryType, selectionText: menuSelectionText, imageUrl, videoUrl } = message;

    if (queryType === 'text') {
      const selection = window.getSelection();
      const selectedText = menuSelectionText || selection?.toString()?.trim();
      if (!selectedText) return;

      const context = extractTextContext(selection);
      const rect = selection?.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null;

      const popoverId = createPopover(rect, selectedText);
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'text',
        selectionText: selectedText,
        context
      });
    } else if (queryType === 'image') {
      const context = extractImageContext(imageUrl);
      if (lastCursorPosition) {
        context.cursorPosition = lastCursorPosition;
        // Try to annotate the image with a visual crosshair marker
        const annotated = await annotateImageWithCursor(imageUrl, lastCursorPosition.x, lastCursorPosition.y);
        if (annotated) {
          context.annotatedImage = annotated;
        }
      }
      const popoverId = createPopover(null, '[Image]', imageUrl);
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'image',
        imageUrl,
        context
      });
    } else if (queryType === 'video') {
      const videoFrame = captureVideoFrame(videoUrl);
      const context = { pageTitle: document.title, pageUrl: location.href };
      if (lastCursorPosition) {
        context.cursorPosition = lastCursorPosition;
      }
      const popoverId = createPopover(null, '[Video Frame]');
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'video',
        videoFrame,
        context
      });
    } else if (queryType === 'element') {
      handleElementQuery();
    }
  }

  // ── Smart Element Detection ──

  async function handleElementQuery() {
    if (!lastRightClickedElement) return;
    const el = lastRightClickedElement;

    // Strategy 1: Find an image (img, picture, background-image, data-src, etc.)
    const imageResult = findNearestImage(el);
    if (imageResult) {
      const context = extractImageContext(imageResult.url);
      context.detectionMethod = imageResult.method;
      if (lastCursorPosition) {
        context.cursorPosition = lastCursorPosition;
        // Try to annotate the image with a visual crosshair marker
        const annotated = await annotateImageWithCursor(imageResult.url, lastCursorPosition.x, lastCursorPosition.y);
        if (annotated) {
          context.annotatedImage = annotated;
        }
      }
      const popoverId = createPopover(null, '[Image]', imageResult.url);
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'image',
        imageUrl: imageResult.url,
        context
      });
      return;
    }

    // Strategy 2: Find a video element
    const videoResult = findNearestVideo(el);
    if (videoResult) {
      const context = { pageTitle: document.title, pageUrl: location.href };
      const popoverId = createPopover(null, '[Video Frame]');
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'video',
        videoFrame: videoResult.frame,
        context
      });
      return;
    }

    // Strategy 3: Fall back to text content of the element
    const text = el.textContent?.trim()?.substring(0, 500);
    if (text) {
      const context = {
        pageTitle: document.title,
        pageUrl: location.href,
        surroundingText: text
      };
      const popoverId = createPopover(null, text.substring(0, 100));
      chrome.runtime.sendMessage({
        type: 'QUERY',
        popoverId,
        queryType: 'text',
        selectionText: text.substring(0, 200),
        context
      });
    }
  }

  function findNearestImage(el) {
    // Search the element itself and up to 3 levels of parents
    const candidates = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 4 && parent; i++) {
      candidates.push(parent);
      parent = parent.parentElement;
    }

    for (const candidate of candidates) {
      // Check: Is it an <img>?
      if (candidate.tagName === 'IMG' && candidate.src) {
        return { url: candidate.currentSrc || candidate.src, method: 'img' };
      }

      // Check: <img> with data-src (lazy loading)
      if (candidate.tagName === 'IMG') {
        const lazySrc = candidate.dataset?.src || candidate.dataset?.lazySrc ||
          candidate.dataset?.original || candidate.getAttribute('data-srcset')?.split(' ')[0];
        if (lazySrc) return { url: lazySrc, method: 'lazy-img' };
      }

      // Check: Contains an <img> child
      const img = candidate.querySelector('img[src], img[data-src]');
      if (img) {
        const url = img.currentSrc || img.src || img.dataset?.src || img.dataset?.lazySrc || img.dataset?.original;
        if (url) return { url, method: 'child-img' };
      }

      // Check: <picture> > <source> + <img>
      const picture = candidate.tagName === 'PICTURE' ? candidate : candidate.querySelector('picture');
      if (picture) {
        const pImg = picture.querySelector('img');
        if (pImg) {
          const url = pImg.currentSrc || pImg.src;
          if (url) return { url, method: 'picture' };
        }
      }

      // Check: <figure> containing image
      const figure = candidate.tagName === 'FIGURE' ? candidate : candidate.querySelector('figure');
      if (figure) {
        const fImg = figure.querySelector('img');
        if (fImg) {
          const url = fImg.currentSrc || fImg.src || fImg.dataset?.src;
          if (url) return { url, method: 'figure' };
        }
      }

      // Check: CSS background-image — try inline style first (cheap), fall back to computed only for sizeable elements
      let bgImage = candidate.style.backgroundImage;
      if ((!bgImage || bgImage === 'none') && candidate.offsetWidth > 100 && candidate.offsetHeight > 100) {
        bgImage = window.getComputedStyle(candidate).backgroundImage;
      }
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
        if (match && match[1] && !match[1].includes('gradient') && !match[1].startsWith('data:image/svg')) {
          return { url: match[1], method: 'background-image' };
        }
      }

      // Check: <source> inside <video> poster
      if (candidate.tagName === 'VIDEO' && candidate.poster) {
        return { url: candidate.poster, method: 'video-poster' };
      }

      // Check: srcset attribute on the element itself
      if (candidate.srcset) {
        const firstSrc = candidate.srcset.split(',')[0]?.trim()?.split(' ')[0];
        if (firstSrc) return { url: firstSrc, method: 'srcset' };
      }

      // Check: Common news site patterns — data attributes
      const dataAttrs = ['data-src-medium', 'data-src-large', 'data-src-small',
        'data-hi-res-src', 'data-image', 'data-img-url', 'data-bg',
        'data-src-full', 'data-lazy', 'data-url'];
      for (const attr of dataAttrs) {
        const val = candidate.getAttribute(attr);
        if (val && (val.startsWith('http') || val.startsWith('/'))) {
          const url = val.startsWith('/') ? location.origin + val : val;
          return { url, method: `attr:${attr}` };
        }
      }
    }

    // Last resort: search wider area (siblings)
    const parentEl = el.parentElement;
    if (parentEl) {
      const siblingImg = parentEl.querySelector('img[src], img[data-src]');
      if (siblingImg) {
        const url = siblingImg.currentSrc || siblingImg.src || siblingImg.dataset?.src;
        if (url) return { url, method: 'sibling-img' };
      }
    }

    return null;
  }

  function findNearestVideo(el) {
    const candidates = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      candidates.push(parent);
      parent = parent.parentElement;
    }

    for (const candidate of candidates) {
      // Direct <video> element
      const video = candidate.tagName === 'VIDEO' ? candidate : candidate.querySelector('video');
      if (video) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || video.clientWidth || 640;
          canvas.height = video.videoHeight || video.clientHeight || 360;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL('image/png').split(',')[1];
          if (frame) return { frame, method: 'video' };
        } catch {
          // Cross-origin video — can't capture frame
        }
      }
    }
    return null;
  }

  // ── Context Extraction ──

  function extractTextContext(selection) {
    const context = {
      pageTitle: document.title,
      pageUrl: location.href
    };

    if (!selection || selection.rangeCount === 0) return context;

    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentEl = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

      // Get surrounding paragraph text
      const paragraph = parentEl?.closest('p, div, li, td, span, article, section');
      if (paragraph) {
        const text = paragraph.textContent?.trim();
        if (text && text.length > 0) {
          context.surroundingText = text.substring(0, 500);
        }
      }

      // Get nearest heading
      let el = parentEl;
      while (el && el !== document.body) {
        const heading = el.querySelector?.('h1, h2, h3, h4, h5, h6')
          || el.previousElementSibling?.matches?.('h1, h2, h3, h4, h5, h6') && el.previousElementSibling;
        if (heading) {
          context.nearestHeading = heading.textContent?.trim()?.substring(0, 200);
          break;
        }
        el = el.parentElement;
      }

      // Fallback: find any heading above
      if (!context.nearestHeading) {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (let i = allHeadings.length - 1; i >= 0; i--) {
          const h = allHeadings[i];
          if (range.compareBoundaryPoints(Range.START_TO_START, createRangeForElement(h)) > 0) {
            context.nearestHeading = h.textContent?.trim()?.substring(0, 200);
            break;
          }
        }
      }
    } catch {}

    return context;
  }

  function createRangeForElement(el) {
    const r = document.createRange();
    r.selectNode(el);
    return r;
  }

  function extractImageContext(imageUrl) {
    const context = {
      pageTitle: document.title,
      pageUrl: location.href
    };

    // Find the image element — match by src, currentSrc, data-src, or partial URL
    const images = document.querySelectorAll('img');
    let matchedImg = null;
    for (const img of images) {
      if (img.src === imageUrl || img.currentSrc === imageUrl ||
          img.dataset?.src === imageUrl || img.dataset?.lazySrc === imageUrl ||
          img.dataset?.original === imageUrl) {
        matchedImg = img;
        break;
      }
    }

    // Fallback: partial URL match (some sites transform URLs)
    if (!matchedImg && imageUrl) {
      const urlPath = imageUrl.split('?')[0].split('/').pop();
      if (urlPath) {
        for (const img of images) {
          if ((img.src || img.currentSrc || '').includes(urlPath)) {
            matchedImg = img;
            break;
          }
        }
      }
    }

    if (matchedImg) {
      context.altText = matchedImg.alt || '';
      context.title = matchedImg.title || '';

      // Look for figcaption
      const figure = matchedImg.closest('figure');
      if (figure) {
        const caption = figure.querySelector('figcaption');
        if (caption) context.caption = caption.textContent?.trim()?.substring(0, 300);
      }

      // Get nearby text
      const parent = matchedImg.closest('article, section, div');
      if (parent) {
        const text = parent.textContent?.trim();
        if (text && text.length > 0) {
          context.nearbyText = text.substring(0, 300);
        }
      }
    }

    // Also check the right-clicked element and its parents for context
    if (lastRightClickedElement && !context.nearbyText) {
      const el = lastRightClickedElement.closest('article, section, figure, div');
      if (el) {
        const text = el.textContent?.trim();
        if (text) context.nearbyText = text.substring(0, 300);
      }
    }

    return context;
  }

  // ── Annotate Image with Cursor Marker ──
  // Draws a bright red crosshair on the image at the cursor position
  // so the model can visually see where the user is pointing.
  function annotateImageWithCursor(imageUrl, cursorX, cursorY) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timeout = setTimeout(() => {
        // Timeout — fall back to no annotation
        resolve(null);
      }, 3000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');

          // Draw original image
          ctx.drawImage(img, 0, 0);

          // Calculate cursor position in pixels
          const cx = (cursorX / 100) * w;
          const cy = (cursorY / 100) * h;

          // Draw crosshair — large enough to be visible on any size image
          const size = Math.max(20, Math.min(w, h) * 0.04);
          const lineWidth = Math.max(3, size * 0.15);

          // Outer ring (dark outline for contrast)
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.lineWidth = lineWidth + 2;
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
          ctx.stroke();

          // Inner ring (bright red)
          ctx.strokeStyle = '#FF0000';
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
          ctx.stroke();

          // Crosshair lines
          ctx.strokeStyle = '#FF0000';
          ctx.lineWidth = lineWidth;

          // Horizontal line
          ctx.beginPath();
          ctx.moveTo(cx - size * 1.5, cy);
          ctx.lineTo(cx - size * 0.4, cy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx + size * 0.4, cy);
          ctx.lineTo(cx + size * 1.5, cy);
          ctx.stroke();

          // Vertical line
          ctx.beginPath();
          ctx.moveTo(cx, cy - size * 1.5);
          ctx.lineTo(cx, cy - size * 0.4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy + size * 0.4);
          ctx.lineTo(cx, cy + size * 1.5);
          ctx.stroke();

          // Center dot
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(cx, cy, lineWidth, 0, Math.PI * 2);
          ctx.fill();

          // Convert to base64 — use JPEG for smaller size
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        } catch {
          // Canvas tainted by CORS or other error
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      img.src = imageUrl;
    });
  }

  // Show a brief flash at cursor position to confirm detection
  function showCursorFlash(x, y) {
    const flash = document.createElement('div');
    flash.style.cssText = `
      all: initial;
      position: fixed;
      left: ${x - 12}px;
      top: ${y - 12}px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid #FF0000;
      pointer-events: none;
      z-index: 2147483647;
      opacity: 1;
      transition: opacity 0.5s, transform 0.5s;
      transform: scale(1);
    `;
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
      flash.style.transform = 'scale(2)';
    });
    setTimeout(() => flash.remove(), 600);
  }

  function captureVideoFrame(videoUrl) {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (video.src === videoUrl || video.currentSrc === videoUrl || video.querySelector(`source[src="${videoUrl}"]`)) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || video.clientWidth;
          canvas.height = video.videoHeight || video.clientHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/png').split(',')[1];
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  // ── Popover Creation ──

  function createPopover(anchorRect, queryText, imageUrl) {
    const popoverId = `wt-${++popoverCounter}-${Date.now()}`;

    // Create host element
    const host = document.createElement('div');
    host.id = popoverId;
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
    document.body.appendChild(host);

    // Shadow DOM (closed for isolation)
    const shadow = host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getPopoverCSS();
    shadow.appendChild(style);

    // Build popover
    const popover = document.createElement('div');
    popover.className = 'wt-popover';
    popover.innerHTML = `
      <div class="wt-header">
        <div class="wt-drag-handle">
          <span class="wt-logo">?</span>
          <span class="wt-title">What's This?</span>
        </div>
        <button class="wt-close" aria-label="Close">&times;</button>
      </div>
      <div class="wt-query-bar">
        ${imageUrl ? `<img class="wt-query-image" src="${escapeAttr(imageUrl)}" alt="Query image"/>` : ''}
        <span class="wt-query-text">${escapeHtml(queryText?.substring(0, 100) || '')}</span>
      </div>
      <div class="wt-content">
        <div class="wt-loading">
          <div class="wt-typing"><span></span><span></span><span></span></div>
          <span>Thinking...</span>
        </div>
      </div>
      <div class="wt-actions" style="display: none;">
        <button class="wt-action-btn wt-copy" title="Copy response" aria-label="Copy response to clipboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
        <button class="wt-action-btn wt-tts" title="Read aloud" aria-label="Read response aloud">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
          Read
        </button>
        <button class="wt-action-btn wt-share" title="Share response" aria-label="Share response">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share
        </button>
        <button class="wt-action-btn wt-requery" title="Re-query with different model" aria-label="Re-query with a different AI model">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          Re-query
        </button>
      </div>
      <div class="wt-follow-up" style="display: none;">
        <div class="wt-input-row">
          <input type="text" class="wt-input" placeholder="Ask a follow-up question..." maxlength="500" />
          <button class="wt-send">Send</button>
        </div>
        <div class="wt-turn-count"></div>
      </div>
    `;
    shadow.appendChild(popover);

    // Position
    positionPopover(host, anchorRect);

    // Drag support
    setupDrag(host, popover.querySelector('.wt-drag-handle'), shadow);

    // Close button
    popover.querySelector('.wt-close').addEventListener('click', () => {
      destroyPopover(popoverId);
    });

    // Open links in small popup windows instead of new tabs
    popover.querySelector('.wt-content').addEventListener('click', (e) => {
      const link = e.target.closest('a.wt-link');
      if (link && link.href) {
        e.preventDefault();
        e.stopPropagation();
        const width = 700;
        const height = 600;
        const left = Math.round((screen.width - width) / 2);
        const top = Math.round((screen.height - height) / 2);
        window.open(link.href, '_blank',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );
      }
    });

    // Action buttons
    popover.querySelector('.wt-copy').addEventListener('click', () => {
      const content = popover.querySelector('.wt-content');
      const text = content.innerText || content.textContent;
      const btn = popover.querySelector('.wt-copy');
      const orig = btn.innerHTML;
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<span style="color:#059669">Copied!</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }).catch(() => {
        btn.innerHTML = '<span style="color:#dc2626">Failed</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      });
    });

    let ttsUtterance = null;
    const ttsBtn = popover.querySelector('.wt-tts');
    if (!window.speechSynthesis) {
      ttsBtn.style.display = 'none'; // Hide if TTS unavailable
    }
    ttsBtn.addEventListener('click', () => {
      if (!window.speechSynthesis) return;
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        ttsUtterance = null;
        ttsBtn.classList.remove('wt-active');
        return;
      }
      const content = popover.querySelector('.wt-content');
      const text = content.innerText || content.textContent;
      ttsUtterance = new SpeechSynthesisUtterance(text);
      ttsUtterance.rate = 1.1;
      ttsUtterance.onend = () => { ttsBtn.classList.remove('wt-active'); };
      ttsUtterance.onerror = () => { ttsBtn.classList.remove('wt-active'); };
      ttsBtn.classList.add('wt-active');
      speechSynthesis.speak(ttsUtterance);
    });

    popover.querySelector('.wt-share').addEventListener('click', () => {
      const content = popover.querySelector('.wt-content');
      const text = content.innerText || content.textContent;
      const queryEl = popover.querySelector('.wt-query-text');
      const query = queryEl ? queryEl.textContent : '';
      const shareText = `What's This? — "${query}"\n\n${text}\n\nSource: ${location.href}`;
      if (navigator.share) {
        navigator.share({ title: "What's This?", text: shareText, url: location.href });
      } else {
        navigator.clipboard.writeText(shareText).then(() => {
          const btn = popover.querySelector('.wt-share');
          const orig = btn.innerHTML;
          btn.innerHTML = '<span style="color:#059669">Copied to clipboard!</span>';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        });
      }
    });

    popover.querySelector('.wt-requery').addEventListener('click', () => {
      // Clear content and re-trigger with opposite model preference
      const content = popover.querySelector('.wt-content');
      content.innerHTML = '<div class="wt-loading"><div class="wt-typing"><span></span><span></span><span></span></div><span>Re-querying with different model...</span></div>';
      const actions = popover.querySelector('.wt-actions');
      if (actions) actions.style.display = 'none';
      const followUp = popover.querySelector('.wt-follow-up');
      if (followUp) followUp.style.display = 'none';
      chrome.runtime.sendMessage({ type: 'REQUERY', popoverId });
    });

    // Follow-up input
    const input = popover.querySelector('.wt-input');
    const sendBtn = popover.querySelector('.wt-send');
    const sendFollowUp = () => {
      const question = input.value.trim();
      if (!question) return;
      appendUserMessage(popoverId, question);
      input.value = '';
      chrome.runtime.sendMessage({
        type: 'FOLLOW_UP',
        popoverId,
        question
      });
    };
    sendBtn.addEventListener('click', sendFollowUp);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFollowUp();
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    // Focus trap — keep Tab/Shift+Tab within the popover
    popover.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = popover.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (shadow.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (shadow.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Close on Escape — store handler for cleanup
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        destroyPopover(popoverId);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Store popover reference (including escape handler for cleanup)
    activePopovers.set(popoverId, { host, shadow, popover, currentSection: null, escHandler });

    return popoverId;
  }

  function positionPopover(host, anchorRect) {
    const popoverWidth = 400;
    const popoverMaxHeight = 480;
    const margin = 12;

    let left, top;

    if (anchorRect) {
      // Position below selection
      left = anchorRect.left + (anchorRect.width / 2) - (popoverWidth / 2);
      top = anchorRect.bottom + margin;

      // Ensure within viewport
      if (top + popoverMaxHeight > window.innerHeight) {
        top = anchorRect.top - popoverMaxHeight - margin;
      }
      if (top < margin) top = margin;
      if (left < margin) left = margin;
      if (left + popoverWidth > window.innerWidth - margin) {
        left = window.innerWidth - popoverWidth - margin;
      }
    } else {
      // Center in viewport
      left = (window.innerWidth - popoverWidth) / 2;
      top = Math.max(margin, (window.innerHeight - popoverMaxHeight) / 2);
    }

    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  function setupDrag(host, handle, shadow) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(host.style.left) || 0;
      startTop = parseInt(host.style.top) || 0;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Clamp to keep at least 80px visible on screen
      const minVisible = 80;
      const newLeft = Math.max(-400 + minVisible, Math.min(window.innerWidth - minVisible, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - minVisible, startTop + dy));
      host.style.left = `${newLeft}px`;
      host.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.style.cursor = '';
      }
    });
  }

  // ── Popover Destruction ──

  function destroyPopover(popoverId) {
    const state = activePopovers.get(popoverId);
    if (!state) return;
    // Stop any active TTS
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    // Clean up escape key listener
    if (state.escHandler) {
      document.removeEventListener('keydown', state.escHandler);
    }
    state.host.remove();
    activePopovers.delete(popoverId);
    chrome.runtime.sendMessage({ type: 'CLEANUP_CONVERSATION', popoverId });
  }

  // ── Stream Handlers ──

  function handleSectionStart({ popoverId, label }) {
    const state = activePopovers.get(popoverId);
    if (!state) return;

    const content = state.shadow.querySelector('.wt-content');

    // Remove loading indicator
    const loading = content.querySelector('.wt-loading');
    if (loading) loading.remove();

    // Create section
    const section = document.createElement('div');
    section.className = 'wt-section';

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'wt-section-label';
    sectionLabel.textContent = label;
    section.appendChild(sectionLabel);

    const sectionContent = document.createElement('div');
    sectionContent.className = 'wt-section-content wt-markdown';
    section.appendChild(sectionContent);

    content.appendChild(section);
    state.currentSection = sectionContent;

    // Show spinner in section
    const spinner = document.createElement('div');
    spinner.className = 'wt-inline-spinner';
    sectionContent.appendChild(spinner);
  }

  function handleChunk({ popoverId, text }) {
    const state = activePopovers.get(popoverId);
    if (!state || !state.currentSection) return;

    // Remove inline spinner on first chunk
    const spinner = state.currentSection.querySelector('.wt-inline-spinner');
    if (spinner) spinner.remove();

    // Track raw text for markdown rendering
    if (!state.currentSection._rawText) state.currentSection._rawText = '';
    state.currentSection._rawText += text;

    // Re-render markdown
    state.currentSection.innerHTML = renderMarkdown(state.currentSection._rawText);

    // Auto-scroll
    const content = state.shadow.querySelector('.wt-content');
    content.scrollTop = content.scrollHeight;
  }

  function handleSectionEnd({ popoverId, isLast }) {
    const state = activePopovers.get(popoverId);
    if (!state) return;

    // Remove any remaining spinner
    if (state.currentSection) {
      const spinner = state.currentSection.querySelector('.wt-inline-spinner');
      if (spinner) spinner.remove();
    }

    state.currentSection = null;

    // Show action buttons and follow-up input after all sections complete
    if (isLast) {
      const actions = state.shadow.querySelector('.wt-actions');
      if (actions) actions.style.display = 'flex';
      const followUp = state.shadow.querySelector('.wt-follow-up');
      if (followUp) {
        followUp.style.display = 'block';
        const input = followUp.querySelector('.wt-input');
        input?.focus();
      }
    }
  }

  function handleError({ popoverId, error, retryable }) {
    const state = activePopovers.get(popoverId);
    if (!state) return;

    const content = state.shadow.querySelector('.wt-content');

    // Remove loading
    const loading = content.querySelector('.wt-loading');
    if (loading) loading.remove();

    // Remove any inline spinner
    if (state.currentSection) {
      const spinner = state.currentSection.querySelector('.wt-inline-spinner');
      if (spinner) spinner.remove();
    }

    const errorEl = document.createElement('div');
    errorEl.className = 'wt-error';
    errorEl.textContent = error;

    if (retryable) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'wt-retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => {
        errorEl.remove();
        content.innerHTML = '<div class="wt-loading"><div class="wt-typing"><span></span><span></span><span></span></div><span>Retrying...</span></div>';
        chrome.runtime.sendMessage({ type: 'REQUERY', popoverId });
      });
      errorEl.appendChild(retryBtn);
    }

    content.appendChild(errorEl);
  }

  // ── Follow-up Display ──

  function appendUserMessage(popoverId, question) {
    const state = activePopovers.get(popoverId);
    if (!state) return;

    const content = state.shadow.querySelector('.wt-content');

    // Add user message bubble
    const msgEl = document.createElement('div');
    msgEl.className = 'wt-user-message';
    msgEl.textContent = question;
    content.appendChild(msgEl);

    // Add loading
    const loading = document.createElement('div');
    loading.className = 'wt-loading';
    loading.innerHTML = '<div class="wt-typing"><span></span><span></span><span></span></div><span>Thinking...</span>';
    content.appendChild(loading);

    content.scrollTop = content.scrollHeight;
  }

  // ── Markdown Renderer ──

  function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="wt-inline-code">$1</code>');

    // Markdown links [text](url) — handles URLs with parentheses (e.g. Wikipedia)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]*?(?:\([^\s)]*\))*[^\s)]*)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="wt-link">$1</a>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>(\n|$))+/g, '<ul>$&</ul>');

    // Line breaks (double newline = paragraph)
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    // Don't wrap block elements in paragraphs
    html = html.replace(/<p>(<(?:h[234]|ul|pre|div))/g, '$1');
    html = html.replace(/(<\/(?:h[234]|ul|pre|div)>)<\/p>/g, '$1');

    return html;
  }

  // ── Utilities ──

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Popover CSS ──

  function getPopoverCSS() {
    return `
      :host {
        all: initial;
      }

      .wt-popover {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        width: 400px;
        max-height: 480px;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: wt-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        color: #1a1a2e;
        font-size: 13px;
        line-height: 1.5;
      }

      @keyframes wt-slide-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* Header */
      .wt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: linear-gradient(135deg, #7C3AED, #A855F7);
        color: white;
        flex-shrink: 0;
      }

      .wt-drag-handle {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: grab;
        flex: 1;
        user-select: none;
      }

      .wt-drag-handle:active {
        cursor: grabbing;
      }

      .wt-logo {
        width: 22px;
        height: 22px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        font-family: Georgia, serif;
      }

      .wt-title {
        font-weight: 600;
        font-size: 13px;
        letter-spacing: -0.01em;
      }

      .wt-close {
        background: rgba(255, 255, 255, 0.15);
        border: none;
        color: white;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }

      .wt-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Query bar */
      .wt-query-bar {
        padding: 6px 12px;
        background: #f8f7ff;
        border-bottom: 1px solid #e9e5f5;
        font-size: 12px;
        color: #6b5b95;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .wt-query-image {
        width: 32px;
        height: 32px;
        object-fit: cover;
        border-radius: 5px;
      }

      .wt-query-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-style: italic;
      }

      /* Content area */
      .wt-content {
        flex: 1;
        overflow-y: auto;
        padding: 10px 12px;
        min-height: 60px;
        max-height: 340px;
        scroll-behavior: smooth;
      }

      .wt-content::-webkit-scrollbar {
        width: 6px;
      }

      .wt-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .wt-content::-webkit-scrollbar-thumb {
        background: #d1c4e9;
        border-radius: 3px;
      }

      /* Loading */
      .wt-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #9b8ec4;
        font-size: 12px;
        padding: 4px 0;
      }

      /* Typing indicator (bouncing dots) */
      .wt-typing {
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 4px 0;
      }

      .wt-typing span {
        width: 7px;
        height: 7px;
        background: #7C3AED;
        border-radius: 50%;
        animation: wt-bounce 1.2s ease-in-out infinite;
      }

      .wt-typing span:nth-child(2) { animation-delay: 0.15s; }
      .wt-typing span:nth-child(3) { animation-delay: 0.3s; }

      @keyframes wt-bounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-6px); opacity: 1; }
      }

      .wt-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #e9e5f5;
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: wt-spin 0.7s linear infinite;
        flex-shrink: 0;
      }

      .wt-inline-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #e9e5f5;
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: wt-spin 0.7s linear infinite;
        display: inline-block;
        margin: 4px 0;
      }

      /* Action buttons */
      .wt-actions {
        display: flex;
        gap: 4px;
        padding: 6px 12px;
        border-top: 1px solid #e9e5f5;
        background: #faf9ff;
      }

      .wt-action-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        border: 1px solid #d1c4e9;
        border-radius: 8px;
        background: white;
        color: #6b5b95;
        font-size: 11px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }

      .wt-action-btn:hover {
        border-color: #7C3AED;
        color: #7C3AED;
        background: #f5f3ff;
      }

      .wt-action-btn.wt-active {
        background: #7C3AED;
        color: white;
        border-color: #7C3AED;
      }

      .wt-action-btn svg {
        flex-shrink: 0;
      }

      @keyframes wt-spin {
        to { transform: rotate(360deg); }
      }

      /* Sections */
      .wt-section {
        margin-bottom: 10px;
      }

      .wt-section:last-child {
        margin-bottom: 0;
      }

      .wt-section-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #7C3AED;
        margin-bottom: 5px;
        padding-bottom: 4px;
        border-bottom: 2px solid #ede9fe;
      }

      .wt-section + .wt-section {
        padding-top: 8px;
        border-top: 1px solid #f0ecf9;
      }

      .wt-section + .wt-section .wt-section-label {
        border-bottom: none;
        padding-bottom: 4px;
      }

      /* Markdown content */
      .wt-markdown p {
        margin: 0 0 6px 0;
      }

      .wt-markdown p:last-child {
        margin-bottom: 0;
      }

      .wt-markdown strong {
        color: #2d2250;
        font-weight: 600;
      }

      .wt-markdown em {
        color: #6b5b95;
      }

      .wt-markdown h2, .wt-markdown h3, .wt-markdown h4 {
        margin: 8px 0 4px 0;
        color: #2d2250;
        font-weight: 600;
      }

      .wt-markdown h2 { font-size: 14px; }
      .wt-markdown h3 { font-size: 13px; }
      .wt-markdown h4 { font-size: 13px; }

      .wt-markdown ul {
        margin: 4px 0;
        padding-left: 18px;
      }

      .wt-markdown li {
        margin-bottom: 2px;
      }

      .wt-markdown pre {
        background: #f5f3ff;
        border: 1px solid #e9e5f5;
        border-radius: 6px;
        padding: 8px 10px;
        overflow-x: auto;
        font-size: 11px;
        margin: 6px 0;
      }

      .wt-markdown code {
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
        font-size: 12px;
      }

      .wt-inline-code {
        background: #f0ecf9;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 12px;
      }

      /* Links */
      .wt-link {
        color: #7C3AED;
        text-decoration: none;
        border-bottom: 1px solid rgba(124, 58, 237, 0.3);
        transition: border-color 0.15s;
        cursor: pointer;
      }

      .wt-link:hover {
        border-bottom-color: #7C3AED;
      }

      /* Error */
      .wt-error {
        color: #dc2626;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
      }

      .wt-retry-btn {
        display: inline-block;
        margin-top: 8px;
        padding: 5px 14px;
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.15s;
      }

      .wt-retry-btn:hover {
        opacity: 0.85;
      }

      /* User message */
      .wt-user-message {
        background: linear-gradient(135deg, #7C3AED, #A855F7);
        color: white;
        padding: 6px 10px;
        border-radius: 10px 10px 3px 10px;
        margin: 8px 0 6px auto;
        max-width: 85%;
        width: fit-content;
        font-size: 12px;
      }

      /* Follow-up */
      .wt-follow-up {
        padding: 8px 12px;
        border-top: 1px solid #e9e5f5;
        background: #faf9ff;
        flex-shrink: 0;
      }

      .wt-input-row {
        display: flex;
        gap: 6px;
      }

      .wt-input {
        flex: 1;
        padding: 6px 10px;
        border: 1.5px solid #d1c4e9;
        border-radius: 8px;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
        background: white;
        color: #1a1a2e;
      }

      .wt-input:focus {
        border-color: #7C3AED;
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
      }

      .wt-input::placeholder {
        color: #b4a7d6;
      }

      .wt-send {
        padding: 6px 12px;
        background: linear-gradient(135deg, #7C3AED, #A855F7);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.15s;
        white-space: nowrap;
      }

      .wt-send:hover {
        opacity: 0.9;
      }

      .wt-turn-count {
        font-size: 10px;
        color: #b4a7d6;
        margin-top: 4px;
        text-align: center;
      }

      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        .wt-popover {
          background: #1e1b2e;
          color: #e0daf0;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06);
        }

        .wt-query-bar {
          background: #252040;
          border-color: #352e54;
          color: #b4a7d6;
        }

        .wt-content::-webkit-scrollbar-thumb {
          background: #4a3d6e;
        }

        .wt-section-label {
          border-color: #352e54;
        }

        .wt-section + .wt-section {
          border-color: #2d2550;
        }

        .wt-markdown strong {
          color: #ddd6f3;
        }

        .wt-markdown em {
          color: #b4a7d6;
        }

        .wt-markdown h2, .wt-markdown h3, .wt-markdown h4 {
          color: #ddd6f3;
        }

        .wt-markdown pre {
          background: #252040;
          border-color: #352e54;
        }

        .wt-inline-code {
          background: #2d2550;
        }

        .wt-link {
          color: #A855F7;
          border-bottom-color: rgba(168, 85, 247, 0.3);
        }

        .wt-link:hover {
          border-bottom-color: #A855F7;
        }

        .wt-error {
          background: #2d1b1b;
          border-color: #5c2020;
        }

        .wt-actions {
          background: #1a1730;
          border-color: #352e54;
        }

        .wt-action-btn {
          background: #252040;
          border-color: #4a3d6e;
          color: #b4a7d6;
        }

        .wt-action-btn:hover {
          background: #2d2550;
          border-color: #A855F7;
          color: #A855F7;
        }

        .wt-follow-up {
          background: #1a1730;
          border-color: #352e54;
        }

        .wt-input {
          background: #252040;
          border-color: #4a3d6e;
          color: #e0daf0;
        }

        .wt-input:focus {
          border-color: #A855F7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }

        .wt-input::placeholder {
          color: #6b5b95;
        }

        .wt-loading {
          color: #7c6faa;
        }
      }
    `;
  }
})();
