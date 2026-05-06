/**
 * conv-list.js — Conversations List لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P3-4 Bulk Actions)
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
    normal: 'iv4-priority-normal',
    low:    'iv4-priority-low',
  };

  // أيقونات وتسميات الأولوية
  const PRIORITY_META = {
    urgent: { icon: '🔴', label: 'عاجل',  short: 'عاجل'  },
    high:   { icon: '🟠', label: 'عالي',  short: 'عالي'  },
    normal: { icon: '🔵', label: 'عادي',  short: 'عادي'  },
    low:    { icon: '⚪', label: 'منخفض', short: 'منخفض' },
  };

  // ─── State محلي ──────────────────────────────────────────────────────────
  let _loading      = false;   // منع الطلبات المتزامنة
  let _labelUnsub   = null;    // إلغاء الاستماع للـ label filter
  let _priorityMenu = null;    // القائمة المنسدلة للأولوية الحالية (مرجع DOM)
  let _snoozeModal  = null;    // مودال الـ Snooze الحالي (مرجع DOM)
  const _selectedIds = new Set(); // IDs المحادثات المحددة (Bulk)

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
    // FIX-007: تجاهل platform IDs كـ أسماء (أرقام طويلة أو @lid)
    function _cleanName(n) {
      if (!n) return null;
      if (/^\d{8,}(@lid)?$/.test(n.trim())) return null; // platform ID
      if (n.trim().endsWith('@lid')) return null;
      return n;
    }
    const rawName = _cleanName(conv.contact_name) || _cleanName(conv.sender_name) || conv.phone || null;
    const name = _escHtml(rawName || 'مجهول');

    // آخر رسالة
    let preview = _escHtml(conv.last_message || '');
    if (preview.length > 60) preview = preview.slice(0, 57) + '...';

    // Avatar: أول حرف من الاسم
    const initial = (rawName || '?')[0].toUpperCase();
    const avatarColor = _nameToColor(rawName || '');

    // Priority badge (لا يُعرض للـ normal)
    const pri     = conv.priority || 'normal';
    const priMeta = PRIORITY_META[pri] || PRIORITY_META.normal;
    const priBadge = pri !== 'normal'
      ? `<span class="iv4-priority-badge iv4-priority-badge--${pri}" title="أولوية: ${priMeta.label}">${priMeta.icon} ${priMeta.short}</span>`
      : '';

    // Snooze badge (لو المحادثة مؤجلة تظهر badge قابل للنقر لإلغاء التأجيل)
    const isSnoozed   = conv.status === 'snoozed' && conv.snooze_until;
    const snoozeLabel = isSnoozed ? _formatSnoozedUntil(conv.snooze_until) : '';
    const snoozeBadge = isSnoozed
      ? `<span class="iv4-snooze-badge--active" title="مؤجل حتى ${snoozeLabel} — انقر لإلغاء">⏰ ${snoozeLabel}</span>`
      : '';

      // Bulk checkbox: محدد لو الـ ID في _selectedIds
    const isSelected = _selectedIds.has(conv.id);

    return `
<div
  class="iv4-conv-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''} ${priClass} ${isSnoozed ? 'iv4-conv-snoozed' : ''} ${isSelected ? 'bulk-selected' : ''}"
  data-conv-id="${conv.id}"
  data-priority="${_escHtml(pri)}"
  role="button"
  tabindex="0"
  aria-label="محادثة مع ${name}"
>  <label class="iv4-bulk-check" title="تحديد">
    <input type="checkbox" class="iv4-conv-checkbox" data-conv-id="${conv.id}" ${isSelected ? 'checked' : ''} />
  </label>
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
      <div class="iv4-conv-bottom-badges">
        ${snoozeBadge}
        ${priBadge}
        ${unread ? `<span class="iv4-conv-badge">${conv.unread_count > 9 ? '9+' : conv.unread_count}</span>` : ''}
      </div>
    </div>
    ${conv.labels && conv.labels.length ? _renderLabels(conv.labels) : ''}
  </div>
  <button class="iv4-snooze-trigger" title="تأجيل">⏰</button>
</div>`
    .replace(/^[ \t]+/gm, '').trim();
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
      // كليك على صندوق التحديد → toggle bulk selection
      const chk = e.target.closest('.iv4-conv-checkbox');
      if (chk) {
        e.stopPropagation();
        const id = Number(chk.dataset.convId);
        if (!id) return;
        if (_selectedIds.has(id)) _selectedIds.delete(id);
        else _selectedIds.add(id);
        _syncBulkUI();
        return;
      }

      // كليك على زر Priority
      const priBtn = e.target.closest('.iv4-priority-badge');
      if (priBtn) {
        e.stopPropagation();
        const item   = priBtn.closest('.iv4-conv-item');
        const convId = Number(item?.dataset.convId);
        if (convId) _openPriorityMenu(priBtn, convId, item.dataset.priority);
        return;
      }

      // كليك على بادج الـ Snooze (إلغاء مباشر)
      const unsnoozeBtn = e.target.closest('.iv4-snooze-badge--active');
      if (unsnoozeBtn) {
        e.stopPropagation();
        const item   = unsnoozeBtn.closest('.iv4-conv-item');
        const convId = Number(item?.dataset.convId);
        if (convId) _unsnooze(convId);
        return;
      }

      // كليك على زر الـ Snooze (snooze جديد)
      const snoozeBtn = e.target.closest('.iv4-snooze-trigger');
      if (snoozeBtn) {
        e.stopPropagation();
        const item   = snoozeBtn.closest('.iv4-conv-item');
        const convId = Number(item?.dataset.convId);
        if (convId) _openSnoozeModal(convId);
        return;
      }

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

  // ─── Bulk Actions ───────────────────────────────────────────────────────────

  /**
   * مزامنة الـ Bulk Toolbar مع حالة التحديد
   * يُستدعى بعد كل تغيير في _selectedIds
   */
  function _syncBulkUI() {
    const toolbar   = document.getElementById('iv4-bulk-toolbar');
    const countEl   = document.getElementById('iv4-selected-count');
    const selectAll = document.getElementById('iv4-select-all');
    const container = $list();
    const count     = _selectedIds.size;

    if (!toolbar) return;

    toolbar.classList.toggle('hidden', count === 0);

    if (countEl) countEl.textContent = `${count} محددة`;

    // حالة صندوق تحديد الكل
    if (selectAll && container) {
      const totalVisible = container.querySelectorAll('.iv4-conv-checkbox').length;
      selectAll.checked       = count > 0 && count === totalVisible;
      selectAll.indeterminate = count > 0 && count < totalVisible;
    }

    // تحديث الـ DOM (checked state + class)
    if (container) {
      container.querySelectorAll('.iv4-conv-item').forEach(item => {
        const id  = Number(item.dataset.convId);
        const chk = item.querySelector('.iv4-conv-checkbox');
        const sel = _selectedIds.has(id);
        item.classList.toggle('bulk-selected', sel);
        if (chk) chk.checked = sel;
      });
    }
  }

  /**
   * تنفيذ Bulk action وإظهار toast وإعادة تحميل القائمة
   * @param {string} action - status | assign | priority | delete
   * @param {string} value  - قيمة الاكشن
   */
  async function _executeBulkAction(action, value) {
    const ids = [..._selectedIds];
    if (!ids.length) return;

    // تأكيد الحذف (destructive action)
    if (action === 'delete') {
      if (!confirm(`حذف ${ids.length} محادثة؟ لا يمكن التراجع`)) return;
    }

    // Optimistic: أزل من التمثيل مباشرة
    if (action === 'delete') {
      ids.forEach(id => InboxStore.removeConversation(id));
    } else if (action === 'status') {
      ids.forEach(id => {
        const c = InboxStore.state.conversations.find(x => x.id === id);
        if (c) InboxStore.upsertConversation({ ...c, status: value });
      });
      // لو الفلتر لا يشمل الحالة الجديدة → أزل
      const { filters } = InboxStore.state;
      if (filters.status !== 'all' && filters.status !== value) {
        ids.forEach(id => InboxStore.removeConversation(id));
      }
    }

    // صفّر التحديد وأغلق الـ toolbar
    _selectedIds.clear();
    _syncBulkUI();
    renderList();

    const { data, error } = await InboxAPI.conversations.bulkUpdate(ids, action, value);
    if (error) {
      console.error('[Bulk] فشل:', error);
      // أعد التحميل بعد الفشل
      fetchConversations(true);
    } else {
      _refreshCountsThrottled();
    }
  }

  /**
   * ربط أحداث الـ Bulk Toolbar (يُستدعى مرة واحدة من init)
   */
  function _bindBulkToolbar() {
    const toolbar = document.getElementById('iv4-bulk-toolbar');
    if (!toolbar) return;

    // أزرار الاكشن
    toolbar.addEventListener('click', async e => {
      const btn = e.target.closest('[data-bulk-action]');
      if (btn) {
        const action = btn.dataset.bulkAction;
        const value  = btn.dataset.bulkValue || '';
        await _executeBulkAction(action, value);
        return;
      }

      // إلغاء
      if (e.target.closest('#iv4-bulk-cancel')) {
        _selectedIds.clear();
        _syncBulkUI();
        renderList();
      }
    });

    // تحديد الكل
    const selectAllChk = document.getElementById('iv4-select-all');
    if (selectAllChk) {
      selectAllChk.addEventListener('change', () => {
        const container = $list();
        if (!container) return;
        const allIds = [...container.querySelectorAll('.iv4-conv-checkbox')]
          .map(c => Number(c.dataset.convId))
          .filter(Boolean);

        if (selectAllChk.checked) allIds.forEach(id => _selectedIds.add(id));
        else _selectedIds.clear();
        _syncBulkUI();
      });
    }
  }

  // ─── Snooze Modal ───────────────────────────────────────────────────────

  /**
   * فتح مودال الـ Snooze بخيارات جاهزة + تاريخ مخصص
   * @param {number} convId
   */
  function _openSnoozeModal(convId) {
    _closeSnoozeModal();

    // خيارات جاهزة
    const now   = new Date();
    const opts  = [
      { label: 'بعد ساعة',       ms: 3600_000 },
      { label: 'بعد 3 ساعات',    ms: 10_800_000 },
      { label: 'بعد 24 ساعة',    ms: 86_400_000 },
      { label: 'غداً صباحاً',  ms: _msUntilTomorrow9am(now) },
      { label: 'بعد أسبوع',    ms: 7 * 86_400_000 },
    ];

    // تاريخ افتراضي للحقل الحر (غداً 09:00)
    const defDate = new Date(now.getTime() + _msUntilTomorrow9am(now));
    const defStr  = _toLocalDatetimeInput(defDate);

    const modal = document.createElement('div');
    modal.className   = 'iv4-snooze-overlay';
    modal.innerHTML   = `
      <div class="iv4-snooze-modal" role="dialog" aria-modal="true" aria-label="تأجيل المحادثة">
        <div class="iv4-snooze-header">
          <span class="iv4-snooze-title">⏰ تأجيل المحادثة</span>
          <button class="iv4-icon-btn iv4-snooze-close" title="إغلاق">✕</button>
        </div>
        <div class="iv4-snooze-presets">
          ${opts.map((o, i) => `
            <button class="iv4-snooze-preset" data-ms="${o.ms}">${o.label}</button>
          `).join('')}
        </div>
        <div class="iv4-snooze-custom">
          <label class="iv4-snooze-label">تاريخ مخصص:</label>
          <input
            type="datetime-local"
            class="iv4-snooze-input"
            id="iv4-snooze-datetime"
            value="${defStr}"
          />
        </div>
        <div class="iv4-snooze-actions">
          <button class="iv4-btn iv4-snooze-confirm">تأجيل</button>
          <button class="iv4-btn iv4-btn-ghost iv4-snooze-cancel">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    _snoozeModal = modal;

    // كليك على preset → حدّث الحقل
    modal.querySelectorAll('.iv4-snooze-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const ms      = Number(btn.dataset.ms);
        const target  = new Date(Date.now() + ms);
        modal.querySelector('#iv4-snooze-datetime').value = _toLocalDatetimeInput(target);
        // active highlight
        modal.querySelectorAll('.iv4-snooze-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // تأكيد
    modal.querySelector('.iv4-snooze-confirm').addEventListener('click', async () => {
      const val = modal.querySelector('#iv4-snooze-datetime').value;
      if (!val) return;
      const until = new Date(val).toISOString();
      _closeSnoozeModal();
      await _snooze(convId, until);
    });

    // إلغاء
    modal.querySelector('.iv4-snooze-cancel').addEventListener('click', _closeSnoozeModal);
    modal.querySelector('.iv4-snooze-close').addEventListener('click',  _closeSnoozeModal);
    modal.addEventListener('click', e => { if (e.target === modal) _closeSnoozeModal(); });
  }

  /** إغلاق مودال الـ Snooze */
  function _closeSnoozeModal() {
    if (_snoozeModal) { _snoozeModal.remove(); _snoozeModal = null; }
  }

  /**
   * تنفيذ Snooze عبر API + Optimistic UI
   * @param {number} convId
   * @param {string} until  ISO string
   */
  async function _snooze(convId, until) {
    const conv = InboxStore.state.conversations.find(c => c.id === convId);
    if (!conv) return;

    // Optimistic: حدّث الـ store
    const updated = { ...conv, status: 'snoozed', snooze_until: until };
    InboxStore.upsertConversation(updated);

    // لو الفلتر الحالي لا يشمل snoozed → أزل من القائمة
    const { filters } = InboxStore.state;
    if (filters.status !== 'snoozed' && filters.status !== 'all') {
      InboxStore.removeConversation(convId);
      renderList();
    } else {
      renderList();
    }

    const { error } = await InboxAPI.conversations.snooze(convId, until);
    if (error) {
      console.error('[Snooze] فشل:', error);
      // rollback
      InboxStore.upsertConversation(conv);
      renderList();
    }
  }

  /**
   * إلغاء التأجيل (Unsnooze) عبر API
   * @param {number} convId
   */
  async function _unsnooze(convId) {
    const conv = InboxStore.state.conversations.find(c => c.id === convId);

    // Optimistic
    if (conv) {
      InboxStore.upsertConversation({ ...conv, status: 'open', snooze_until: null });
      const { filters } = InboxStore.state;
      if (filters.status === 'snoozed') {
        InboxStore.removeConversation(convId);
        renderList();
      } else {
        renderList();
      }
    }

    const { error } = await InboxAPI.conversations.unsnooze(convId);
    if (error) {
      console.error('[Unsnooze] فشل:', error);
      if (conv) { InboxStore.upsertConversation(conv); renderList(); }
    }
  }

  // ─── Snooze Helpers ──────────────────────────────────────────────────────

  /** مليثانية حتى غداً الساعة 9 صباحاً (بتوقيت المتصفح) */
  function _msUntilTomorrow9am(from) {
    const tom = new Date(from);
    tom.setDate(tom.getDate() + 1);
    tom.setHours(9, 0, 0, 0);
    return tom.getTime() - from.getTime();
  }

  /** تحويل Date لـ datetime-local value */
  function _toLocalDatetimeInput(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ─── Priority Menu (dropdown في الكارد) ───────────────────────────────────

  /**
   * فتح القائمة المنسدلة لتغيير الأولوية
   * @param {Element} anchor  - العنصر الذي يُفتح بجواره
   * @param {number}  convId
   * @param {string}  current - الأولوية الحالية
   */
  function _openPriorityMenu(anchor, convId, current) {
    // أغلق أي قائمة مفتوحة
    _closePriorityMenu();

    const menu = document.createElement('div');
    menu.className = 'iv4-priority-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'اختر الأولوية');

    const options = ['urgent', 'high', 'normal', 'low'];
    menu.innerHTML = options.map(p => {
      const m = PRIORITY_META[p];
      return `
        <button
          class="iv4-priority-option ${p === current ? 'selected' : ''}"
          data-priority="${p}"
          role="option"
          aria-selected="${p === current}"
        >
          <span class="iv4-priority-opt-icon">${m.icon}</span>
          <span>${m.label}</span>
          ${p === current ? '<span class="iv4-priority-opt-check">✓</span>' : ''}
        </button>`.trim();
    }).join('');

    // تموضع القائمة
    const rect = anchor.getBoundingClientRect();
    menu.style.position  = 'fixed';
    menu.style.top       = `${rect.bottom + 4}px`;
    menu.style.left      = `${rect.left}px`;
    menu.style.zIndex    = '1000';
    document.body.appendChild(menu);
    _priorityMenu = menu;

    // كليك على خيار
    menu.addEventListener('click', async e => {
      const btn = e.target.closest('.iv4-priority-option');
      if (!btn) return;
      const newPriority = btn.dataset.priority;
      _closePriorityMenu();
      await _setPriority(convId, newPriority);
    });

    // إغلاق عند الكليك خارجها
    setTimeout(() => {
      document.addEventListener('click', _closePriorityMenu, { once: true });
    }, 0);
  }

  /** إغلاق القائمة المنسدلة */
  function _closePriorityMenu() {
    if (_priorityMenu) {
      _priorityMenu.remove();
      _priorityMenu = null;
    }
  }

  /**
   * تغيير أولوية محادثة عبر API + تحديث UI فوراً (optimistic)
   * @param {number} convId
   * @param {string} priority
   */
  async function _setPriority(convId, priority) {
    // Optimistic: حدّث الـ store والـ DOM فوراً
    const conv = InboxStore.state.conversations.find(c => c.id === convId);
    if (conv) {
      const updated = { ...conv, priority };
      InboxStore.upsertConversation(updated);
      _updatePriorityDOM(convId, priority);
    }

    // API call
    const { error } = await InboxAPI.conversations.setPriority(convId, priority);
    if (error) {
      console.error('[Priority] فشل تغيير الأولوية:', error);
      // rollback
      if (conv) {
        InboxStore.upsertConversation(conv);
        _updatePriorityDOM(convId, conv.priority || 'normal');
      }
    }
  }

  /**
   * تحديث الـ DOM لكارد محادثة واحدة بعد تغيير الأولوية
   * @param {number} convId
   * @param {string} priority
   */
  function _updatePriorityDOM(convId, priority) {
    const container = $list();
    if (!container) return;

    const item = container.querySelector(`[data-conv-id="${convId}"]`);
    if (!item) return;

    // حدّث الـ data attribute
    item.dataset.priority = priority;

    // حدّث الـ priority class على الكارد
    Object.values(PRIORITY_CLASS).forEach(c => { if (c) item.classList.remove(c); });
    const newClass = PRIORITY_CLASS[priority];
    if (newClass) item.classList.add(newClass);

    // حدّث الـ badge
    const bottomBadges = item.querySelector('.iv4-conv-bottom-badges');
    if (!bottomBadges) return;

    const existingBadge = bottomBadges.querySelector('.iv4-priority-badge');
    if (priority !== 'normal') {
      const m = PRIORITY_META[priority] || PRIORITY_META.normal;
      const html = `<span class="iv4-priority-badge iv4-priority-badge--${priority}" title="أولوية: ${m.label}">${m.icon} ${m.short}</span>`;
      if (existingBadge) {
        existingBadge.outerHTML = html;
      } else {
        bottomBadges.insertAdjacentHTML('afterbegin', html);
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  }

  // ─── Priority Filter في الـ Sidebar ──────────────────────────────────────

  /**
   * رسم فلاتر الأولوية في الـ sidebar
   * يُستدعى من init()
   */
  function _renderPriorityFilters() {
    const container = document.getElementById('iv4-priority-filters');
    if (!container) return;

    const priorities = [
      { value: '',       icon: '📋', label: 'كل الأولويات' },
      { value: 'urgent', icon: '🔴', label: 'عاجل'  },
      { value: 'high',   icon: '🟠', label: 'عالي'  },
      { value: 'normal', icon: '🔵', label: 'عادي'  },
      { value: 'low',    icon: '⚪', label: 'منخفض' },
    ];

    container.innerHTML = priorities.map(p => `
      <button class="iv4-nav-btn ${p.value === '' ? 'active' : ''}" data-priority-filter="${p.value}">
        <span class="iv4-nav-icon">${p.icon}</span>
        <span class="iv4-nav-label">${p.label}</span>
      </button>`.trim()).join('');

    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-priority-filter]');
      if (!btn) return;

      container.querySelectorAll('[data-priority-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.priorityFilter;
      InboxStore.setFilter({ priority: val || null });
    });
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

        // P1-5 — أزل الـ unread badge فوراً (optimistic UI)
        _clearUnreadBadge(newEl, newId);
      }
    }
  }

  /**
   * P1-5 — إزالة unread badge من عنصر المحادثة فوراً
   * يُستدعى عند فتح المحادثة في القائمة
   * الـ API call الفعلي يتم في chat.js (_scheduleMarkRead)
   *
   * @param {Element} itemEl  - عنصر .iv4-conv-item
   * @param {number}  convId
   */
  function _clearUnreadBadge(itemEl, convId) {
    if (!itemEl) return;

    // أزل الـ badge من الـ DOM
    const badge = itemEl.querySelector('.iv4-conv-badge');
    if (badge) badge.remove();
    itemEl.classList.remove('unread');

    // حدّث الـ store محلياً
    const conv = InboxStore.state.conversations.find(c => c.id === convId);
    if (conv && conv.unread_count > 0) {
      InboxStore.upsertConversation({ ...conv, unread_count: 0 });
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
      // FIX-002: unix timestamp (seconds) → ms
      const ts = (typeof iso === 'number' && iso < 1e12) ? iso * 1000 : iso;
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr  = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      // S3-2: تحسين الوقت النسبي (أوضح)
      if (diffMin < 1)  return 'الآن';
      if (diffMin < 60) return `منذ ${diffMin} د`;
      if (diffHr  < 24) return `منذ ${diffHr} س`;
      if (diffDay === 1) return 'أمس';
      if (diffDay < 7)  return `منذ ${diffDay} أيام`;

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
   * تنسيق وقت الـ snooze للعرض في الـ badge
   * @param {string|number} snoozeUntil - ISO string أو Unix timestamp
   */
  function _formatSnoozedUntil(snoozeUntil) {
    if (!snoozeUntil) return '';
    try {
      // لو unix timestamp (int)
      const d = typeof snoozeUntil === 'number'
        ? new Date(snoozeUntil * 1000)
        : new Date(snoozeUntil);
      const now = new Date();
      const diffMs  = d - now;
      const diffMin = Math.round(diffMs / 60000);
      const diffHr  = Math.round(diffMs / 3600000);
      const diffDay = Math.round(diffMs / 86400000);

      if (diffMin < 0)  return 'منتهي';
      if (diffMin < 60) return `${diffMin}د`;
      if (diffHr  < 24) return `${diffHr}س`;
      if (diffDay < 7)  return `${diffDay}ي`;
      const pad = n => String(n).padStart(2, '0');
      return `${d.getDate()}/${pad(d.getMonth()+1)}`;
    } catch { return ''; }
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
    // FIX-003: ربط counts:update بالـ DOM
    InboxStore.on('counts:update', (counts) => {
      const elOpen    = document.getElementById('iv4-count-open');
      const elWaiting = document.getElementById('iv4-count-waiting');
      const elSnoozed = document.getElementById('iv4-count-snoozed');
      if (elOpen)    elOpen.textContent    = counts.open    || 0;
      if (elWaiting) elWaiting.textContent = counts.waiting || 0;
      if (elSnoozed) elSnoozed.textContent = counts.snoozed || 0;
    });

    InboxStore.on('filters:change', _onFiltersChange);
    InboxStore.on('activeConvId:change', _onActiveConvChange);
    InboxStore.on('conversations:update', () => renderList());

    // SSE events
    _bindSSEEvents();

    // Load More button
    const btn = $loadBtn();
    if (btn) btn.addEventListener('click', _onLoadMoreClick);

    // Priority filters في الـ sidebar
    _renderPriorityFilters();

    // Bulk toolbar
    _bindBulkToolbar();

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
    openSnoozeModal:  _openSnoozeModal,
    openPriorityMenu: _openPriorityMenu,
  };

})();

window.InboxConvList = InboxConvList;
