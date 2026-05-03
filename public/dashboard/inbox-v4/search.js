/**
 * inbox-v4/search.js — Search UI (Quick + Deep)
 * آخر تحديث: 2026-05-03
 *
 * يوفر:
 *   - Quick Search: debounce 300ms + suggest dropdown (autocomplete)
 *   - Deep Search:  overlay كامل مع نتائج مقسّمة (محادثات + رسائل)
 *   - تمييز النص المطابق في النتائج
 *   - فتح المحادثة مباشرة من النتيجة
 *
 * يعتمد على:
 *   InboxAPI.search.*  — API calls
 *   InboxStore         — state
 *   InboxConvList.openConversation — للانتقال
 *
 * الـ DOM المستهدف (موجود في index.html):
 *   #iv4-search-btn, #iv4-search-bar, #iv4-search-input, #iv4-search-close
 *
 * يُضيف ديناميكياً:
 *   #iv4-suggest-dropdown   — dropdown اقتراحات تحت الـ search bar
 *   #iv4-deep-search-overlay — overlay البحث العميق
 */

'use strict';

const InboxSearch = (() => {

  // ─── State ───────────────────────────────────────────────────────────────
  let _debounceTimer   = null;
  let _suggestTimer    = null;
  let _lastQuery       = '';
  let _suggestActive   = false;
  let _overlay         = null;
  let _suggestEl       = null;

  const DEBOUNCE_MS    = 300;
  const SUGGEST_MS     = 200;
  const MIN_Q          = 2;   // حد أدنى للـ quick search
  const DEEP_MIN_Q     = 2;   // حد أدنى للـ deep search

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _buildSuggestDropdown();
    _buildDeepOverlay();
    _bindEvents();
  }

  // ─── DOM Builders ─────────────────────────────────────────────────────────

  function _buildSuggestDropdown() {
    _suggestEl = document.createElement('div');
    _suggestEl.id        = 'iv4-suggest-dropdown';
    _suggestEl.className = 'iv4-suggest-dropdown hidden';
    _suggestEl.setAttribute('role', 'listbox');

    const bar = document.getElementById('iv4-search-bar');
    if (bar) bar.appendChild(_suggestEl);
  }

  function _buildDeepOverlay() {
    _overlay = document.createElement('div');
    _overlay.id        = 'iv4-deep-search-overlay';
    _overlay.className = 'iv4-deep-overlay hidden';
    _overlay.innerHTML = `
      <div class="iv4-deep-panel" role="dialog" aria-label="بحث متقدم">

        <!-- Header -->
        <div class="iv4-deep-header">
          <div class="iv4-deep-search-row">
            <span class="iv4-deep-icon">🔍</span>
            <input
              type="text"
              id="iv4-deep-input"
              class="iv4-deep-input"
              placeholder="ابحث في كل المحادثات والرسائل..."
              autocomplete="off"
              spellcheck="false"
            />
            <button id="iv4-deep-close" class="iv4-icon-btn iv4-deep-close-btn" title="إغلاق">✕</button>
          </div>

          <!-- Filters -->
          <div class="iv4-deep-filters">
            <div class="iv4-deep-filter-group">
              <label>النوع</label>
              <div class="iv4-deep-tabs" id="iv4-deep-mode-tabs">
                <button class="iv4-deep-tab active" data-mode="quick">سريع</button>
                <button class="iv4-deep-tab" data-mode="deep">في الرسائل</button>
              </div>
            </div>
            <div class="iv4-deep-filter-group">
              <label>الحالة</label>
              <select id="iv4-deep-status" class="iv4-deep-select">
                <option value="all">الكل</option>
                <option value="open">مفتوحة</option>
                <option value="closed">مغلقة</option>
              </select>
            </div>
            <div class="iv4-deep-filter-group">
              <label>المنصة</label>
              <select id="iv4-deep-platform" class="iv4-deep-select">
                <option value="">الكل</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div class="iv4-deep-body" id="iv4-deep-body">
          <div class="iv4-deep-empty" id="iv4-deep-empty">
            <span class="iv4-deep-empty-icon">🔍</span>
            <p>ابدأ الكتابة للبحث</p>
          </div>
          <div class="iv4-deep-loading hidden" id="iv4-deep-loading">
            <div class="iv4-spinner"></div>
            <span>جاري البحث...</span>
          </div>
          <div class="iv4-deep-results hidden" id="iv4-deep-results">
            <div class="iv4-deep-count" id="iv4-deep-count"></div>
            <div class="iv4-deep-list" id="iv4-deep-list"></div>
            <button class="iv4-deep-load-more hidden" id="iv4-deep-load-more">
              تحميل المزيد
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(_overlay);
  }

  // ─── Event Bindings ────────────────────────────────────────────────────────

  function _bindEvents() {
    const searchInput = document.getElementById('iv4-search-input');
    const searchClose = document.getElementById('iv4-search-close');

    if (!searchInput) return;

    // Quick search input → debounce + suggest
    searchInput.addEventListener('input', _onQuickInput);
    searchInput.addEventListener('keydown', _onQuickKeydown);
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= MIN_Q) _fetchSuggestions(searchInput.value.trim());
    });

    // إغلاق الـ suggest عند النقر خارجه
    document.addEventListener('click', e => {
      if (!e.target.closest('#iv4-search-bar')) _hideSuggest();
    });

    // زر البحث المتقدم (نقر طويل أو Ctrl+F)
    const searchBtn = document.getElementById('iv4-search-btn');
    if (searchBtn) {
      let _pressTimer = null;
      searchBtn.addEventListener('mousedown', () => {
        _pressTimer = setTimeout(() => openDeepSearch(), 500);
      });
      searchBtn.addEventListener('mouseup', () => clearTimeout(_pressTimer));
      searchBtn.addEventListener('mouseleave', () => clearTimeout(_pressTimer));
    }

    // Ctrl+F / Cmd+F → فتح deep search
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openDeepSearch(document.getElementById('iv4-search-input')?.value || '');
      }
    });

    // Deep overlay events
    _overlay.querySelector('#iv4-deep-close').addEventListener('click', closeDeepSearch);
    _overlay.addEventListener('click', e => {
      if (e.target === _overlay) closeDeepSearch();
    });

    const deepInput = _overlay.querySelector('#iv4-deep-input');
    deepInput.addEventListener('input', _onDeepInput);
    deepInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDeepSearch();
    });

    // Mode tabs
    _overlay.querySelectorAll('.iv4-deep-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _overlay.querySelectorAll('.iv4-deep-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _triggerDeepSearch();
      });
    });

    // Filter changes
    ['iv4-deep-status', 'iv4-deep-platform'].forEach(id => {
      _overlay.querySelector('#' + id)?.addEventListener('change', _triggerDeepSearch);
    });

    // Load more
    _overlay.querySelector('#iv4-deep-load-more').addEventListener('click', _loadMoreDeep);
  }

  // ─── Quick Search ─────────────────────────────────────────────────────────

  function _onQuickInput(e) {
    const q = e.target.value.trim();

    clearTimeout(_debounceTimer);
    clearTimeout(_suggestTimer);

    if (q.length < MIN_Q) {
      _hideSuggest();
      InboxStore.setFilter({ search: '' });
      return;
    }

    // تحديث قائمة المحادثات
    _debounceTimer = setTimeout(() => {
      InboxStore.setFilter({ search: q });
    }, DEBOUNCE_MS);

    // اقتراحات autocomplete
    _suggestTimer = setTimeout(() => {
      _fetchSuggestions(q);
    }, SUGGEST_MS);
  }

  function _onQuickKeydown(e) {
    if (!_suggestActive) return;

    const items = _suggestEl.querySelectorAll('.iv4-suggest-item');
    const active = _suggestEl.querySelector('.iv4-suggest-item.active');
    let idx = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      items.forEach(i => i.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      items.forEach(i => i.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    } else if (e.key === 'Enter') {
      if (active) {
        e.preventDefault();
        const val = active.dataset.value;
        document.getElementById('iv4-search-input').value = val;
        InboxStore.setFilter({ search: val });
        _hideSuggest();
      }
    } else if (e.key === 'Escape') {
      _hideSuggest();
    }
  }

  async function _fetchSuggestions(q) {
    try {
      const data = await InboxAPI.search.suggest(q, 8);
      _renderSuggestions(q, data.suggestions || []);
    } catch (_) {
      _hideSuggest();
    }
  }

  function _renderSuggestions(q, suggestions) {
    if (!suggestions.length) {
      _hideSuggest();
      return;
    }

    _suggestEl.innerHTML = '';
    suggestions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'iv4-suggest-item';
      item.setAttribute('role', 'option');
      item.dataset.value = s.value;

      const highlightedLabel = _highlightText(s.label, q);
      item.innerHTML = `
        <span class="iv4-suggest-icon">👤</span>
        <span class="iv4-suggest-label">${highlightedLabel}</span>
        ${s.sub ? `<span class="iv4-suggest-sub">${_escapeHtml(s.sub)}</span>` : ''}
      `;

      item.addEventListener('mousedown', e => {
        e.preventDefault(); // منع blur
        document.getElementById('iv4-search-input').value = s.value;
        InboxStore.setFilter({ search: s.value });
        _hideSuggest();
      });

      _suggestEl.appendChild(item);
    });

    _suggestEl.classList.remove('hidden');
    _suggestActive = true;
  }

  function _hideSuggest() {
    _suggestEl?.classList.add('hidden');
    _suggestEl?.querySelectorAll('.iv4-suggest-item').forEach(i => i.classList.remove('active'));
    _suggestActive = false;
  }

  // ─── Deep Search ──────────────────────────────────────────────────────────

  let _deepOffset   = 0;
  let _deepTotal    = 0;
  let _deepQuery    = '';
  let _deepTimer    = null;

  function openDeepSearch(initialQ = '') {
    _overlay.classList.remove('hidden');
    const deepInput = document.getElementById('iv4-deep-input');
    if (deepInput) {
      deepInput.value = initialQ || document.getElementById('iv4-search-input')?.value || '';
      deepInput.focus();
      deepInput.select();
    }
    if (initialQ || deepInput?.value) _triggerDeepSearch();
  }

  function closeDeepSearch() {
    _overlay.classList.add('hidden');
    _deepOffset = 0;
    _deepTotal  = 0;
    _deepQuery  = '';
    document.getElementById('iv4-deep-list').innerHTML = '';
    document.getElementById('iv4-deep-results').classList.add('hidden');
    document.getElementById('iv4-deep-empty').classList.remove('hidden');
  }

  function _onDeepInput() {
    clearTimeout(_deepTimer);
    _deepTimer = setTimeout(_triggerDeepSearch, DEBOUNCE_MS);
  }

  function _triggerDeepSearch() {
    _deepOffset = 0;
    document.getElementById('iv4-deep-list').innerHTML = '';
    _runDeepSearch(false);
  }

  async function _runDeepSearch(append = false) {
    const q        = (document.getElementById('iv4-deep-input')?.value || '').trim();
    const mode     = _overlay.querySelector('.iv4-deep-tab.active')?.dataset.mode || 'quick';
    const status   = document.getElementById('iv4-deep-status')?.value || 'all';
    const platform = document.getElementById('iv4-deep-platform')?.value || '';

    if (q.length < DEEP_MIN_Q) {
      document.getElementById('iv4-deep-empty').classList.remove('hidden');
      document.getElementById('iv4-deep-loading').classList.add('hidden');
      document.getElementById('iv4-deep-results').classList.add('hidden');
      return;
    }

    _deepQuery = q;

    const emptyEl   = document.getElementById('iv4-deep-empty');
    const loadingEl = document.getElementById('iv4-deep-loading');
    const resultsEl = document.getElementById('iv4-deep-results');

    if (!append) {
      emptyEl.classList.add('hidden');
      loadingEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
    } else {
      loadingEl.classList.remove('hidden');
    }

    try {
      const data = await InboxAPI.search.search({
        q, mode, status, platform,
        limit: 20,
        offset: _deepOffset,
      });

      loadingEl.classList.add('hidden');

      const results = data.results || [];
      _deepTotal    = data.total || 0;

      if (!append && results.length === 0) {
        emptyEl.innerHTML = `
          <span class="iv4-deep-empty-icon">🔍</span>
          <p>لا توجد نتائج لـ "<strong>${_escapeHtml(q)}</strong>"</p>
        `;
        emptyEl.classList.remove('hidden');
        return;
      }

      resultsEl.classList.remove('hidden');

      // العداد
      const countEl = document.getElementById('iv4-deep-count');
      countEl.textContent = `${_deepTotal} نتيجة لـ "${q}"`;

      // الرسم
      _renderDeepResults(results, q, append);

      // Load more
      _deepOffset += results.length;
      const loadMoreBtn = document.getElementById('iv4-deep-load-more');
      if (_deepOffset < _deepTotal) {
        loadMoreBtn.classList.remove('hidden');
        loadMoreBtn.textContent = `تحميل المزيد (${_deepTotal - _deepOffset} متبقية)`;
      } else {
        loadMoreBtn.classList.add('hidden');
      }

    } catch (err) {
      loadingEl.classList.add('hidden');
      console.error('[InboxSearch] deep error:', err);
    }
  }

  function _loadMoreDeep() {
    _runDeepSearch(true);
  }

  function _renderDeepResults(results, q, append) {
    const list = document.getElementById('iv4-deep-list');
    if (!append) list.innerHTML = '';

    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'iv4-deep-result-item';
      item.dataset.convId = r.conv_id;

      const platform  = _platformIcon(r.platform);
      const timeAgo   = _formatTime(r.last_message_at);
      const matchBadge = r.match_type === 'message'
        ? `<span class="iv4-deep-match-badge">في رسالة</span>`
        : '';

      // بناء الـ snippet
      let snippet = '';
      if (r.highlight) {
        snippet = `
          <span class="iv4-deep-snippet">
            ${_escapeHtml(r.highlight.before)}<mark>${_escapeHtml(r.highlight.match)}</mark>${_escapeHtml(r.highlight.after)}
          </span>
        `;
      } else {
        snippet = `<span class="iv4-deep-snippet">${_escapeHtml((r.last_message || '').slice(0, 80))}</span>`;
      }

      item.innerHTML = `
        <div class="iv4-deep-result-header">
          <span class="iv4-deep-platform">${platform}</span>
          <span class="iv4-deep-sender">${_highlightText(_escapeHtml(r.sender_name || r.sender_phone || 'مجهول'), q)}</span>
          ${matchBadge}
          <span class="iv4-deep-time">${timeAgo}</span>
        </div>
        <div class="iv4-deep-result-body">${snippet}</div>
        ${r.agent_name ? `<div class="iv4-deep-assigned">موظف: ${_escapeHtml(r.agent_name)}</div>` : ''}
      `;

      item.addEventListener('click', () => {
        _openConvFromSearch(r.conv_id, r.match_message_id);
      });

      list.appendChild(item);
    });
  }

  function _openConvFromSearch(convId, messageId) {
    closeDeepSearch();

    // إغلاق الـ quick search overlay
    const searchClose = document.getElementById('iv4-search-close');
    if (searchClose) searchClose.click();

    // فتح المحادثة
    if (typeof InboxConvList !== 'undefined' && InboxConvList.openConversation) {
      InboxConvList.openConversation(convId, messageId);
    } else {
      // fallback: emit event
      InboxStore.emit('open_conversation', { convId, messageId });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * إبراز النص المطابق بـ <mark>
   */
  function _highlightText(text, q) {
    if (!text || !q) return text;
    const escaped = _escapeRegex(q);
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _platformIcon(platform) {
    const icons = {
      whatsapp: '💬',
      telegram: '✈️',
      email:    '📧',
    };
    return icons[platform] || '💬';
  }

  function _formatTime(ts) {
    if (!ts) return '';
    const d    = new Date(ts * 1000);
    const now  = new Date();
    const diff = (now - d) / 1000;

    if (diff < 60)     return 'الآن';
    if (diff < 3600)   return `${Math.floor(diff / 60)}د`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}س`;
    return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { init, openDeepSearch, closeDeepSearch };

})();
