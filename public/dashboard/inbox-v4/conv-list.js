/**
 * conv-list.js — Conversations List لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * المسؤوليات:
 *   - جلب المحادثات من backend وعرضها
 *   - تحديث real-time عبر SSE events
 *   - Load More (pagination)
 *   - عرض الـ counts في الـ sidebar
 */

const InboxConvList = (() => {
  'use strict';

  // ─── DOM Refs ────────────────────────────────────────────────────────────
  const $list      = () => document.getElementById('iv4-conv-list');
  const $skeleton  = () => document.getElementById('iv4-skeleton');
  const $loadMore  = () => document.getElementById('iv4-load-more');
  const $loadBtn   = () => document.getElementById('iv4-load-more-btn');
  const $labelsList = () => document.getElementById('iv4-labels-list');

  // ─── Platform Icons ──────────────────────────────────────────────────────
  const PLATFORM_ICON = {
    whatsapp:   '🟢',
    telegram:   '🔵',
    instagram:  '🟣',
    messenger:  '🔷',
    web:        '🌐',
  };

  const PRIORITY_CLASS = {
    urgent: 'iv4-priority-urgent',
    high:   'iv4-priority-high',
    normal: '',
    low:    'iv4-priority-low',
  };

  // ─── State محلي ──────────────────────────────────────────────────────────
  let _loading   = false;   // منع الطلبات المتزامنة
  let _labelUnsub = null;   // إلغاء الاستماع للـ label filter

  // ─── الدالة الرئيسية: جلب المحادثات ─────────────────────────────────────

  /**
   * جلب قائمة المحادثات من الـ backend وتحديث الـ store
   * @param {boolean} reset - true = صفحة أولى (عند تغيير فلتر)
   */
  async function fetchConversations(reset = false) {
    if (_loading) return;
    _loading = true;

    // لو reset: اصفّر القائمة واعرض الـ skeleton
    if (reset) {
      InboxStore.patch({ conversations: [], convTotal: 0, convPage: 1 }, true);
      _showSkeleton(true);
    }

    InboxStore.set('convLoading', true);

    const { filters, convPage } = InboxStore.state;
    const page = reset ? 1 : convPage;

    const { data, error } = await InboxAPI.conversations.list({
      status:         filters.status,
      platform:       filters.platform,
      labelId:        filters.labelId,
      assignedFilter: filters.assignedFilter,
      search:         filters.search,
      priority:       filters.priority,
      page,
      limit: 30,
    });

    _showSkeleton(false);
    InboxStore.set('convLoading', false);
    _loading = false;

    if (error) {
      _showError(error);
      return;
    }

    // data = { conversations: [...], total: N }
    const convs  = data.conversations || [];
    const total  = data.total         || 0;

    if (reset) {
      // استبدل الكل
      InboxStore.patch({
        conversations: convs,
        convTotal:     total,
        convPage:      1,
      }, true);
    } else {
      // أضف للموجود (Load More)
      InboxStore.patch({
        conversations: [...InboxStore.state.conversations, ...convs],
        convPage:      page,
      }, true);
    }

    // أخطر الـ store بالتحديث
    InboxStore.emit('conversations:update', InboxStore.state.conversations);

    // هل في المزيد؟
    const hasMore = InboxStore.state.conversations.length < total;
    _toggleLoadMore(hasMore);

    // رسم الـ list
    renderList();
  }

  // ─── رسم القائمة ─────────────────────────────────────────────────────────

  /**
   * رسم كامل قائمة المحادثات
   */
  function renderList() {
    const container = $list();
    if (!container) return;

    const { conversations, activeConvId } = InboxStore.state;

    // احتفظ بالـ skeleton للحذف
    const skeleton = container.querySelector('#iv4-skeleton');

    // ابنِ الـ HTML دفعة واحدة (أسرع من تعديل DOM element بعد element)
    const html = conversations.length === 0
      ? `<div class="iv4-empty-list">لا توجد محادثات</div>`
      : conversations.map(conv => _renderConvItem(conv, conv.id === activeConvId)).join('');

    // استبدل كل محتوى القائمة ما عدا الـ skeleton
    // (الـ skeleton يتحكم فيه _showSkeleton منفصلاً)
    let listEl = container.querySelector('.iv4-conv-items');
    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'iv4-conv-items';
      container.appendChild(listEl);
    }
    listEl.innerHTML = html;

    // Event delegation — كليك على أي محادثة
    _bindListEvents(listEl);
  }

  /**
   * رسم عنصر محادثة واحدة
   * @param {Object} conv
   * @param {boolean} isActive
   * @returns {string} HTML
   */
  function _renderConvItem(conv, isActive) {
    const platform = conv.platform || 'web';
    const icon     = PLATFORM_ICON[platform] || '💬';
    const priClass = PRIORITY_CLASS[conv.priority] || '';
    const unread   = conv.unread_count > 0;
    const time     = _formatTime(conv.last_message_at || conv.updated_at);

    // اسم العميل
    const name = _escHtml(conv.contact_name || conv.sender_name || conv.phone || 'مجهول');

    // آخر رسالة
    let preview = _escHtml(conv.last_message || '');
    if (preview.length > 60) preview = preview.slice(0, 57) + '...';

    // Avatar: أول حرف من الاسم
    const initial = (conv.contact_name || conv.sender_name || '?')[0].toUpperCase();
    const avatarColor = _nameToColor(conv.contact_name || conv.sender_name || '');

    return `
<div
  class="iv4-conv-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''} ${priClass}"
  data-conv-id="${conv.id}"
  role="button"
  tabindex="0"
  aria-label="محادثة مع ${name}"
>
  <div class="iv4-conv-avatar" style="background:${avatarColor}">
    ${initial}
    <span class="iv4-conv-platform">${icon}</span>
  </div>
  <div class="iv4-conv-body">
    <div class="iv4-conv-top">
      <span class="iv4-conv-name">${name}</span>
      <span class="iv4-conv-time">${time}</span>
    </div>
    <div class="iv4-conv-bottom">
      <span class="iv4-conv-preview">${preview}</span>
      ${unread ? `<span class="iv4-conv-badge">${conv.unread_count > 9 ? '9+' : conv.unread_count}</span>` : ''}
    </div>
    ${conv.labels && conv.labels.length ? _renderLabels(conv.labels) : ''}
  </div>
</div>`.trim();
  }

  /**
   * رسم الـ labels tags
   */
  function _renderLabels(labels) {
    const tags = labels.slice(0, 3).map(l =>
      `<span class="iv4-label-tag" style="background:${_escHtml(l.color || '#888')}">${_escHtml(l.name)}</span>`
    ).join('');
    return `<div class="iv4-conv-labels">${tags}</div>`;
  }

  // ─── Event Delegation ────────────────────────────────────────────────────

  /**
   * ربط أحداث الكليك على القائمة
   */
  function _bindListEvents(listEl) {
    // نزيل الـ listener القديم بالاستبدال
    const newListEl = listEl.cloneNode(false);
    newListEl.innerHTML = listEl.innerHTML;
    listEl.replaceWith(newListEl);

    newListEl.addEventListener('click', e => {
      const item = e.target.closest('.iv4-conv-item');
      if (!item) return;
      const convId = Number(item.dataset.convId);
      if (!convId) return;
      InboxStore.openConversation(convId);
    });

    newListEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('.iv4-conv-item');
        if (!item) return;
        const convId = Number(item.dataset.convId);
        if (convId) InboxStore.openConversation(convId);
      }
    });
  }

  // ─── تحديث عنصر واحد (بدون re-render كامل) ──────────────────────────────

  /**
   * تحديث عنصر واحد في القائمة بدون إعادة رسم الكل
   * @param {Object} conv
   */
  function _updateSingleItem(conv) {
    const container = $list();
    if (!container) return;

    const existing = container.querySelector(`[data-conv-id="${conv.id}"]`);
    if (!existing) {
      // محادثة جديدة: أعد رسم الكل (ستظهر في المقدمة)
      renderList();
      return;
    }

    // عدّل الـ classes والـ badge فقط (تحسين الأداء)
    const isActive = InboxStore.state.activeConvId === conv.id;
    const unread   = conv.unread_count > 0;

    existing.classList.toggle('active', isActive);
    existing.classList.toggle('unread', unread);

    // تحديث preview
    const previewEl = existing.querySelector('.iv4-conv-preview');
    if (previewEl && conv.last_message !== undefined) {
      let preview = _escHtml(conv.last_message || '');
      if (preview.length > 60) preview = preview.slice(0, 57) + '...';
      previewEl.textContent = conv.last_message || '';
    }

    // تحديث الـ badge
    const badgeEl = existing.querySelector('.iv4-conv-badge');
    if (unread) {
      if (badgeEl) {
        badgeEl.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
      } else {
        const bottomEl = existing.querySelector('.iv4-conv-bottom');
        if (bottomEl) {
          const badge = document.createElement('span');
          badge.className = 'iv4-conv-badge';
          badge.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
          bottomEl.appendChild(badge);
        }
      }
    } else if (badgeEl) {
      badgeEl.remove();
    }

    // تحديث الـ time
    const timeEl = existing.querySelector('.iv4-conv-time');
    if (timeEl && conv.last_message_at) {
      timeEl.textContent = _formatTime(conv.last_message_at);
    }

    // حرّك المحادثة للأعلى لو تحدّثت
    const itemsEl = container.querySelector('.iv4-conv-items');
    if (itemsEl && existing.parentElement === itemsEl && itemsEl.firstElementChild !== existing) {
      itemsEl.prepend(existing);
    }
  }

  // ─── Labels في الـ Sidebar ───────────────────────────────────────────────

  /**
   * جلب الـ labels وعرضها في الـ sidebar
   */
  async function fetchAndRenderLabels() {
    InboxStore.set('labelsLoading', true);
    const { data, error } = await InboxAPI.labels.list();
    InboxStore.set('labelsLoading', false);

    if (error || !data) return;

    const labels = data.labels || data || [];
    InboxStore.set('labels', labels);
    _renderSidebarLabels(labels);
  }

  /**
   * رسم الـ labels في الـ sidebar
   */
  function _renderSidebarLabels(labels) {
    const container = $labelsList();
    if (!container) return;

    if (!labels.length) {
      container.innerHTML = '<div class="iv4-labels-empty">لا توجد labels</div>';
      return;
    }

    container.innerHTML = labels.map(l => `
<button
  class="iv4-label-btn iv4-nav-btn"
  data-label-id="${l.id}"
  title="${_escHtml(l.name)}"
>
  <span class="iv4-label-dot" style="background:${_escHtml(l.color || '#888')}"></span>
  <span class="iv4-nav-label">${_escHtml(l.name)}</span>
</button>`.trim()).join('');

    // Event delegation للـ labels
    container.addEventListener('click', e => {
      const btn = e.target.closest('.iv4-label-btn');
      if (!btn) return;

      const labelId = Number(btn.dataset.labelId);
      const current = InboxStore.state.filters.labelId;

      // toggle
      if (current === labelId) {
        // إلغاء الفلتر
        container.querySelectorAll('.iv4-label-btn').forEach(b => b.classList.remove('active'));
        InboxStore.setFilter({ labelId: null });
      } else {
        container.querySelectorAll('.iv4-label-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        InboxStore.setFilter({ labelId });
      }
    }, { once: false });
  }

  // ─── Counts ──────────────────────────────────────────────────────────────

  /**
   * جلب العدادات وتحديث الـ store
   */
  async function fetchCounts() {
    const { data } = await InboxAPI.conversations.counts();
    if (data) InboxStore.updateCounts(data);
  }

  // ─── SSE Event Handlers ──────────────────────────────────────────────────

  /**
   * تسجيل handlers للـ SSE events
   */
  function _bindSSEEvents() {
    // رسالة جديدة أو تحديث محادثة
    InboxStore.on('sse:conv_update', conv => {
      InboxStore.upsertConversation(conv);
      _updateSingleItem(conv);
      _refreshCountsThrottled();
    });

    // محادثة جديدة
    InboxStore.on('sse:conv_new', conv => {
      // تحقق إن الفلتر الحالي يشملها
      const { filters } = InboxStore.state;
      const matchesStatus   = filters.status === 'all' || filters.status === conv.status;
      const matchesPlatform = !filters.platform || filters.platform === conv.platform;

      if (matchesStatus && matchesPlatform) {
        InboxStore.upsertConversation(conv);
        renderList();
      }
      _refreshCountsThrottled();
    });

    // إغلاق أو حذف محادثة
    InboxStore.on('sse:conv_closed', ({ conv_id }) => {
      const { filters } = InboxStore.state;
      if (filters.status !== 'closed' && filters.status !== 'all') {
        InboxStore.removeConversation(conv_id);
        renderList();
      }
      _refreshCountsThrottled();
    });

    // رسالة جديدة (تحديث preview + unread)
    InboxStore.on('sse:message_new', ({ conv_id, message }) => {
      const conv = InboxStore.state.conversations.find(c => c.id === conv_id);
      if (!conv) return;
      const updated = {
        ...conv,
        last_message:    message.content,
        last_message_at: message.created_at,
        unread_count:    conv_id !== InboxStore.state.activeConvId
          ? (conv.unread_count || 0) + 1
          : 0,
      };
      InboxStore.upsertConversation(updated);
      _updateSingleItem(updated);
    });
  }

  // ─── Throttled Counts Refresh ─────────────────────────────────────────────
  let _countsTimer = null;
  function _refreshCountsThrottled() {
    if (_countsTimer) return;
    _countsTimer = setTimeout(() => {
      _countsTimer = null;
      fetchCounts();
    }, 2000); // بعد 2 ثانية من آخر حدث
  }

  // ─── Active Conv Highlight ────────────────────────────────────────────────

  /**
   * تحديث الـ active class في القائمة عند تغيير المحادثة الفعالة
   */
  function _onActiveConvChange({ value: newId, old: oldId }) {
    const container = $list();
    if (!container) return;

    if (oldId) {
      const oldEl = container.querySelector(`[data-conv-id="${oldId}"]`);
      if (oldEl) oldEl.classList.remove('active');
    }
    if (newId) {
      const newEl = container.querySelector(`[data-conv-id="${newId}"]`);
      if (newEl) {
        newEl.classList.add('active');
        // اضمن أن المحادثة مرئية
        newEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  // ─── Load More ───────────────────────────────────────────────────────────

  function _toggleLoadMore(show) {
    const el = $loadMore();
    if (!el) return;
    el.classList.toggle('hidden', !show);
  }

  function _onLoadMoreClick() {
    const nextPage = InboxStore.state.convPage + 1;
    InboxStore.set('convPage', nextPage, true);
    fetchConversations(false);
  }

  // ─── Filters Change ──────────────────────────────────────────────────────

  function _onFiltersChange() {
    fetchConversations(true);
  }

  // ─── Skeleton & Error ────────────────────────────────────────────────────

  function _showSkeleton(show) {
    const sk = document.getElementById('iv4-skeleton');
    if (sk) sk.style.display = show ? '' : 'none';
  }

  function _showError(msg) {
    const listEl = $list();
    if (!listEl) return;
    let items = listEl.querySelector('.iv4-conv-items');
    if (!items) {
      items = document.createElement('div');
      items.className = 'iv4-conv-items';
      listEl.appendChild(items);
    }
    items.innerHTML = `<div class="iv4-list-error">⚠️ خطأ في التحميل: ${_escHtml(msg)}</div>`;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * تنسيق الوقت بشكل مختصر
   */
  function _formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr  = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1)  return 'الآن';
      if (diffMin < 60) return `${diffMin}د`;
      if (diffHr  < 24) return `${diffHr}س`;
      if (diffDay < 7)  return `${diffDay}ي`;

      // نفس السنة: اعرض يوم/شهر
      if (d.getFullYear() === now.getFullYear()) {
        return `${d.getDate()}/${d.getMonth() + 1}`;
      }
      return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
    } catch {
      return '';
    }
  }

  /**
   * لون من الاسم (consistent للـ avatars)
   */
  function _nameToColor(name) {
    const COLORS = [
      '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
      '#f97316','#22c55e','#ef4444','#6366f1',
    ];
    if (!name) return COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  /**
   * escape HTML
   */
  function _escHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  /**
   * تهيئة الـ Conversations List
   * يُستدعى مرة واحدة من app.js
   */
  function init() {
    // ربط الأحداث
    InboxStore.on('filters:change', _onFiltersChange);
    InboxStore.on('activeConvId:change', _onActiveConvChange);
    InboxStore.on('conversations:update', () => renderList());

    // SSE events
    _bindSSEEvents();

    // Load More button
    const btn = $loadBtn();
    if (btn) btn.addEventListener('click', _onLoadMoreClick);

    // جلب البيانات الأولية
    fetchConversations(true);
    fetchAndRenderLabels();
    fetchCounts();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    fetchConversations,
    fetchCounts,
    renderList,
  };

})();

window.InboxConvList = InboxConvList;
