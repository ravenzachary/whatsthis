// What's This? - History Page

document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('historyList');
  const searchInput = document.getElementById('search');
  const clearAllBtn = document.getElementById('clearAll');

  let allHistory = [];

  // Load history
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (history) => {
    allHistory = history || [];
    renderHistory(allHistory);
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      renderHistory(allHistory);
      return;
    }
    const filtered = allHistory.filter(entry =>
      (entry.selectionText || '').toLowerCase().includes(query) ||
      (entry.pageTitle || '').toLowerCase().includes(query) ||
      (entry.pageUrl || '').toLowerCase().includes(query) ||
      (entry.responseSummary || '').toLowerCase().includes(query)
    );
    renderHistory(filtered);
  });

  // Clear all
  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Clear all query history?')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      allHistory = [];
      renderHistory([]);
    });
  });

  function renderHistory(history) {
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">?</div>
          <p>No queries found.</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.map((entry, i) => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
      }) + ' at ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit'
      });

      const typeIcon = entry.queryType === 'image' ? '🖼️' :
                        entry.queryType === 'video' ? '🎬' : '📝';

      const displayText = entry.selectionText || (entry.queryType === 'image' ? 'Image query' : 'Video query');

      return `
        <div class="history-entry">
          <div class="entry-header">
            <span class="entry-type" aria-label="${entry.queryType || 'text'} query">${typeIcon}</span>
            <span class="entry-text">${escapeHtml(displayText.substring(0, 150))}</span>
            <span class="entry-time">${timeStr}</span>
          </div>
          <div class="entry-meta">
            ${entry.pageTitle ? `<span class="entry-page" title="${escapeHtml(entry.pageUrl)}">${escapeHtml(entry.pageTitle.substring(0, 80))}</span>` : ''}
            ${entry.imageUrl ? `<img class="entry-thumb" src="${escapeHtml(entry.imageUrl)}" alt="Query image" onerror="this.style.display='none'" />` : ''}
          </div>
          ${entry.responseSummary ? `<div class="entry-response">${escapeHtml(entry.responseSummary.substring(0, 200))}${entry.responseSummary.length > 200 ? '...' : ''}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
