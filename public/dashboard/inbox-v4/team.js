/**
 * inbox-v4/team.js — Team Assignment UI
 * آخر تحديث: 2026-05-03
 *
 * المسؤوليات:
 *  1. عرض وتغيير حالة الموظف الحالي (online / busy / away / offline)
 *  2. عرض قائمة الموظفين في الـ header dropdown عند التعيين اليدوي
 *  3. التعيين اليدوي لمحادثة من الـ conversation header
 *  4. Auto-assign من زر في الـ conv-list أو الـ header
 *  5. Real-time تحديث حالات الموظفين عبر SSE (agent_status event)
 *
 * يعتمد على:
 *  - InboxStore (store.js)
 *  - InboxAPI   (api.js)
 *  - InboxStream (stream.js) للـ SSE events
 *
 * يُستدعى من app.js بعد تهيئة Store + API + Stream
 */

/* global InboxStore, InboxAPI */
'use strict';

const InboxTeam = (() => {

  // ─── State ─────────────────────────────────────────────────────────────

  /** قائمة الموظفين المحمّلة من الـ API */
  let _agents = [];

  /** حالة الموظف الحالي */
  let _myStatus = 'offline';

  /** هل نحن في وضع تحميل؟ */
  let _loading = false;

  // ─── Constants ─────────────────────────────────────────────────────────

  const STATUS_LABELS = {
    online:  { label: 'متاح',    color: '#22c55e', icon: '🟢' },
    busy:    { label: 'مشغول',   color: '#f59e0b', icon: '🟡' },
    away:    { label: 'بعيد',    color: '#94a3b8', icon: '⚪' },
    offline: { label: 'غير متاح', color: '#64748b', icon: '⚫' },
  };

  const STATUS_ORDER = ['online', 'busy', 'away', 'offline'];

  // ─── DOM Helpers ───────────────────────────────────────────────────────

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // ─── Init ──────────────────────────────────────────────────────────────

  /**
   * تهيئة الـ module — يُستدعى مرة واحدة من app.js
   */
  async function init() {
    _renderStatusWidget();
    await _loadAgents();
    _bindEvents();
    _listenSSE();

    // لو الموظف لم يُسجّل حالته من قبل → auto set online
    const saved = localStorage.getItem('inbox_agent_status');
    if (saved && STATUS_ORDER.includes(saved)) {
      await _setMyStatus(saved, false); // silent (لا reload)
    } else {
      await _setMyStatus('online', false);
    }
  }

  // ─── Load Agents ───────────────────────────────────────────────────────

  /**
   * تحميل قائمة الموظفين من الـ API
   */
  async function _loadAgents() {
    try {
      const data = await InboxAPI.getAgents();
      if (data.ok) {
        _agents = data.agents || [];
        InboxStore.state.agents = _agents;
        InboxStore.emit('agents_loaded', _agents);
      }
    } catch (e) {
      console.error('[team] load agents error:', e);
    }
  }

  // ─── Status Widget ─────────────────────────────────────────────────────

  /**
   * رسم widget حالة الموظف في الـ sidebar header
   */
  function _renderStatusWidget() {
    const container = $('#inbox-agent-status-widget');
    if (!container) return;

    container.innerHTML = `
      <button class="agent-status-btn" id="agentStatusBtn" title="حالتي" aria-haspopup="true" aria-expanded="false">
        <span class="agent-status-dot" id="agentStatusDot"></span>
        <span class="agent-status-label" id="agentStatusLabel">جاري التحميل...</span>
        <svg class="agent-status-chevron" viewBox="0 0 16 16" width="12" height="12">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="agent-status-dropdown hidden" id="agentStatusDropdown" role="menu">
        ${STATUS_ORDER.map(s => `
          <button class="status-option" data-status="${s}" role="menuitem">
            <span class="status-dot" style="background:${STATUS_LABELS[s].color}"></span>
            ${STATUS_LABELS[s].icon} ${STATUS_LABELS[s].label}
          </button>
        `).join('')}
      </div>
    `;

    _updateStatusWidget(_myStatus);
  }

  /**
   * تحديث الـ widget بحالة جديدة
   */
  function _updateStatusWidget(status) {
    const dot   = $('#agentStatusDot');
    const label = $('#agentStatusLabel');
    if (!dot || !label) return;

    const s = STATUS_LABELS[status] || STATUS_LABELS.offline;
    dot.style.background = s.color;
    label.textContent    = s.label;
  }

  // ─── Set My Status ─────────────────────────────────────────────────────

  /**
   * تغيير حالة الموظف الحالي
   * @param {string} status - online | busy | away | offline
   * @param {boolean} [sync=true] - هل يُرسل للـ API؟
   */
  async function _setMyStatus(status, sync = true) {
    if (!STATUS_ORDER.includes(status)) return;

    _myStatus = status;
    localStorage.setItem('inbox_agent_status', status);
    _updateStatusWidget(status);

    if (sync) {
      try {
        await InboxAPI.setAgentStatus(status);
      } catch (e) {
        console.error('[team] setMyStatus error:', e);
      }
    }
  }

  // ─── Assign Dropdown ───────────────────────────────────────────────────

  /**
   * فتح dropdown تعيين موظف لمحادثة محددة
   * يُستدعى من chat.js عند الضغط على زر التعيين
   * @param {number} convId
   * @param {HTMLElement} anchor - العنصر الذي يُفتح الـ dropdown بجانبه
   * @param {number|null} currentAgentId
   */
  function openAssignDropdown(convId, anchor, currentAgentId = null) {
    // إغلاق أي dropdown مفتوح
    _closeAllDropdowns();

    const dropdown = document.createElement('div');
    dropdown.className   = 'assign-dropdown inbox-dropdown';
    dropdown.id          = 'assignDropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'تعيين موظف');

    // Header
    dropdown.innerHTML = `
      <div class="assign-dropdown-header">
        <span>تعيين لموظف</span>
        <button class="assign-auto-btn" id="assignAutoBtn">⚡ تعيين تلقائي</button>
      </div>
      <div class="assign-search-wrap">
        <input type="text" class="assign-search" id="assignSearch" placeholder="ابحث عن موظف..." autocomplete="off">
      </div>
      <ul class="assign-list" id="assignList">
        ${_renderAgentOptions(currentAgentId)}
      </ul>
      <div class="assign-footer">
        <button class="assign-unassign-btn" id="assignUnassignBtn" ${!currentAgentId ? 'disabled' : ''}>
          ✕ إلغاء التعيين
        </button>
      </div>
    `;

    document.body.appendChild(dropdown);

    // تحديد موضع الـ dropdown
    _positionDropdown(dropdown, anchor);

    // أحداث
    $('#assignAutoBtn', dropdown).addEventListener('click', () => {
      _closeAllDropdowns();
      _autoAssignOne(convId);
    });

    $('#assignSearch', dropdown).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const list = $('#assignList', dropdown);
      list.innerHTML = _renderAgentOptions(currentAgentId, q);
      _bindAgentListClicks(list, convId);
    });

    $('#assignUnassignBtn', dropdown).addEventListener('click', () => {
      if (!currentAgentId) return;
      _closeAllDropdowns();
      _assignAgent(convId, null);
    });

    const list = $('#assignList', dropdown);
    _bindAgentListClicks(list, convId);

    // focus على البحث
    setTimeout(() => $('#assignSearch', dropdown)?.focus(), 50);

    // إغلاق عند النقر خارجه
    setTimeout(() => {
      document.addEventListener('click', _handleOutsideClick, { once: true });
    }, 10);
  }

  /**
   * بناء HTML قائمة الموظفين
   * @param {number|null} currentId
   * @param {string} [query='']
   */
  function _renderAgentOptions(currentId, query = '') {
    const filtered = query
      ? _agents.filter(a => a.name.toLowerCase().includes(query))
      : _agents;

    if (!filtered.length) {
      return '<li class="assign-no-results">لا يوجد موظفون</li>';
    }

    return filtered.map(a => {
      const s        = STATUS_LABELS[a.inbox_status] || STATUS_LABELS.offline;
      const isActive = a.id === currentId;
      return `
        <li class="assign-agent-item ${isActive ? 'active' : ''}"
            data-agent-id="${a.id}"
            role="option"
            aria-selected="${isActive}">
          <span class="assign-agent-dot" style="background:${s.color}" title="${s.label}"></span>
          <span class="assign-agent-name">${_esc(a.name)}</span>
          <span class="assign-agent-count" title="محادثات مفتوحة">${a.open_count || 0}</span>
          ${isActive ? '<span class="assign-check">✓</span>' : ''}
        </li>
      `;
    }).join('');
  }

  /**
   * ربط أحداث النقر على قائمة الموظفين
   */
  function _bindAgentListClicks(list, convId) {
    $$('.assign-agent-item', list).forEach(item => {
      item.addEventListener('click', () => {
        const agentId = parseInt(item.dataset.agentId);
        _closeAllDropdowns();
        _assignAgent(convId, agentId);
      });
    });
  }

  /**
   * تحديد موضع الـ dropdown بجانب الـ anchor
   */
  function _positionDropdown(dropdown, anchor) {
    const rect = anchor.getBoundingClientRect();
    const dW   = dropdown.offsetWidth  || 260;
    const dH   = dropdown.offsetHeight || 300;

    let top  = rect.bottom + 6;
    let left = rect.left;

    // لا يتجاوز حواف الشاشة
    if (left + dW > window.innerWidth - 8) left = window.innerWidth - dW - 8;
    if (top + dH  > window.innerHeight - 8) top  = rect.top - dH - 6;

    dropdown.style.position = 'fixed';
    dropdown.style.top      = `${top}px`;
    dropdown.style.left     = `${left}px`;
    dropdown.style.zIndex   = '9999';
  }

  // ─── Assign Actions ────────────────────────────────────────────────────

  /**
   * تعيين موظف لمحادثة
   * @param {number} convId
   * @param {number|null} agentId - null = إلغاء التعيين
   */
  async function _assignAgent(convId, agentId) {
    if (_loading) return;
    _loading = true;

    try {
      const data = await InboxAPI.assignConversation(convId, agentId);
      if (data.ok) {
        // تحديث InboxStore محلياً
        const conv = InboxStore.state.conversations.find(c => c.id === convId);
        if (conv) {
          conv.assigned_to_id = data.assigned_to_id;
          conv.agent_name     = data.agent_name || null;
        }

        InboxStore.emit('conv_assigned', {
          conv_id:  convId,
          agent_id: data.assigned_to_id,
          agent_name: data.agent_name || null,
        });

        _showToast(
          agentId
            ? `✅ تم التعيين لـ ${data.agent_name}`
            : '✅ تم إلغاء التعيين'
        );
      } else {
        _showToast(`⚠️ ${data.error || 'فشل التعيين'}`, 'error');
      }
    } catch (e) {
      console.error('[team] assignAgent error:', e);
      _showToast('⚠️ خطأ في التعيين', 'error');
    } finally {
      _loading = false;
    }
  }

  /**
   * Auto-assign محادثة واحدة
   * @param {number} convId
   */
  async function _autoAssignOne(convId) {
    if (_loading) return;
    _loading = true;

    try {
      const data = await InboxAPI.autoAssign(convId);
      if (data.ok && data.assigned) {
        InboxStore.emit('conv_assigned', {
          conv_id:  convId,
          agent_id: data.agent?.id || null,
          agent_name: data.agent?.name || null,
        });
        _showToast(`⚡ تم التعيين التلقائي لـ ${data.agent?.name}`);
      } else if (data.ok && !data.assigned) {
        _showToast('⚠️ لا يوجد موظف متاح الآن', 'warn');
      } else {
        _showToast(`⚠️ ${data.error || 'فشل التعيين التلقائي'}`, 'error');
      }
    } catch (e) {
      console.error('[team] autoAssign error:', e);
      _showToast('⚠️ خطأ في التعيين التلقائي', 'error');
    } finally {
      _loading = false;
    }
  }

  /**
   * Auto-assign لكل المحادثات المفتوحة الغير معيّنة
   * يُستدعى من زر في الـ conv-list header
   */
  async function autoAssignAll() {
    if (_loading) return;
    _loading = true;

    try {
      const data = await InboxAPI.autoAssignAll();
      if (data.ok) {
        _showToast(`⚡ تم توزيع ${data.assigned} محادثة — تخطي: ${data.skipped}`);
        // إعادة تحميل القائمة
        InboxStore.emit('reload_conversations', {});
      } else {
        _showToast(`⚠️ ${data.error || 'فشل التوزيع'}`, 'error');
      }
    } catch (e) {
      console.error('[team] autoAssignAll error:', e);
      _showToast('⚠️ خطأ في التوزيع التلقائي', 'error');
    } finally {
      _loading = false;
    }
  }

  // ─── SSE Listener ──────────────────────────────────────────────────────

  /**
   * الاستماع لأحداث SSE المتعلقة بالفريق
   */
  function _listenSSE() {
    // تحديث حالة موظف من SSE
    InboxStore.on('sse:agent_status', ({ agent_id, status }) => {
      const agent = _agents.find(a => a.id === agent_id);
      if (agent) {
        agent.inbox_status = status;
        InboxStore.emit('agents_updated', _agents);
      }
    });

    // تحديث عدد المحادثات المفتوحة بعد conv_update
    InboxStore.on('sse:conv_update', (data) => {
      if (data.assigned_to_id !== undefined) {
        // زيادة/إنقاص open_count بشكل تقريبي (سيُعاد تحميل الكامل بشكل دوري)
        _loadAgents().catch(() => {});
      }
    });
  }

  // ─── Events ────────────────────────────────────────────────────────────

  /**
   * ربط أحداث الـ DOM
   */
  function _bindEvents() {
    // زر حالة الموظف
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#agentStatusBtn');
      if (!btn) return;

      const dropdown = $('#agentStatusDropdown');
      if (!dropdown) return;

      const isOpen = !dropdown.classList.contains('hidden');
      dropdown.classList.toggle('hidden', isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));

      if (!isOpen) {
        setTimeout(() => {
          document.addEventListener('click', _handleStatusOutsideClick, { once: true });
        }, 10);
      }
    });

    // اختيار حالة من الـ dropdown
    document.addEventListener('click', (e) => {
      const option = e.target.closest('.status-option');
      if (!option) return;
      const status = option.dataset.status;
      if (status) {
        $('#agentStatusDropdown')?.classList.add('hidden');
        $('#agentStatusBtn')?.setAttribute('aria-expanded', 'false');
        _setMyStatus(status);
      }
    });
  }

  // ─── Utilities ─────────────────────────────────────────────────────────

  function _closeAllDropdowns() {
    $$('.assign-dropdown').forEach(d => d.remove());
    document.removeEventListener('click', _handleOutsideClick);
  }

  function _handleOutsideClick(e) {
    if (!e.target.closest('#assignDropdown')) {
      _closeAllDropdowns();
    }
  }

  function _handleStatusOutsideClick(e) {
    if (!e.target.closest('#agentStatusBtn') && !e.target.closest('#agentStatusDropdown')) {
      $('#agentStatusDropdown')?.classList.add('hidden');
      $('#agentStatusBtn')?.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * عرض toast notification
   * @param {string} msg
   * @param {'info'|'error'|'warn'} [type='info']
   */
  function _showToast(msg, type = 'info') {
    // استخدام الـ toast system الموجود لو كان متاحاً، وإلا console
    if (typeof window.showInboxToast === 'function') {
      window.showInboxToast(msg, type);
    } else {
      console.info(`[team toast] ${msg}`);
    }
  }

  /** Escape HTML */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  // ─── Transfer Modal (P2-5) ─────────────────────────────────────────────

  /**
   * فتح modal تحويل المحادثة لموظف آخر مع context وملاحظة
   * @param {number} convId
   * @param {number|null} currentAgentId - الموظف المعيّن حالياً (يُستثنى من القائمة)
   */
  function openTransferModal(convId, currentAgentId = null) {
    _closeTransferModal();

    const overlay = document.createElement('div');
    overlay.id        = 'iv4-transfer-overlay';
    overlay.className = 'iv4-modal-overlay';

    overlay.innerHTML = `
      <div class="iv4-modal iv4-transfer-modal" id="iv4-transfer-modal"
           role="dialog" aria-modal="true" aria-labelledby="iv4-transfer-title">
        <div class="iv4-modal-header">
          <h3 id="iv4-transfer-title">↩️ تحويل المحادثة</h3>
          <button class="iv4-modal-close" id="iv4-transfer-close" aria-label="إغلاق">×</button>
        </div>

        <div class="iv4-modal-body">
          <div class="iv4-transfer-field">
            <label class="iv4-transfer-label">تحويل إلى</label>
            <input type="text"
              id="iv4-transfer-search"
              class="iv4-transfer-input"
              placeholder="ابحث عن موظف..."
              autocomplete="off">
            <ul class="iv4-transfer-agent-list" id="iv4-transfer-agent-list">
              ${_renderTransferAgents('', currentAgentId)}
            </ul>
          </div>

          <div class="iv4-transfer-field">
            <label class="iv4-transfer-label">
              ملاحظة سياق <span class="iv4-optional">اختياري</span>
            </label>
            <textarea
              id="iv4-transfer-note"
              class="iv4-transfer-textarea"
              placeholder="تفاصيل مهمة تظهر للموظف المستلم..."
              maxlength="500"
              rows="3"></textarea>
          </div>

          <label class="iv4-transfer-checkbox-label">
            <input type="checkbox" id="iv4-transfer-context" checked>
            إدراج سياق آخر الرسائل تلقائياً
          </label>
        </div>

        <div class="iv4-modal-footer">
          <button class="iv4-btn iv4-btn--ghost" id="iv4-transfer-cancel">إلغاء</button>
          <button class="iv4-btn iv4-btn--primary" id="iv4-transfer-confirm" disabled>تحويل</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── State ──────────────────────────────────────────────────────────
    let selectedAgentId   = null;
    let selectedAgentName = '';

    const searchEl  = document.getElementById('iv4-transfer-search');
    const listEl    = document.getElementById('iv4-transfer-agent-list');
    const confirmEl = document.getElementById('iv4-transfer-confirm');
    const noteEl    = document.getElementById('iv4-transfer-note');
    const ctxEl     = document.getElementById('iv4-transfer-context');

    // ── بحث ────────────────────────────────────────────────────────────
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      listEl.innerHTML = _renderTransferAgents(q, currentAgentId);
      _bindTransferListClicks(listEl);
    });

    // ── نقر على موظف ───────────────────────────────────────────────────
    function _bindTransferListClicks(list) {
      $$('.iv4-transfer-agent-item', list).forEach(item => {
        item.addEventListener('click', () => {
          $$('.iv4-transfer-agent-item', list).forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          selectedAgentId   = parseInt(item.dataset.agentId);
          selectedAgentName = item.dataset.agentName;
          confirmEl.disabled    = false;
          confirmEl.textContent = `تحويل إلى ${_esc(selectedAgentName)}`;
        });
      });
    }

    _bindTransferListClicks(listEl);

    // ── تأكيد ───────────────────────────────────────────────────────────
    confirmEl.addEventListener('click', async () => {
      if (!selectedAgentId || confirmEl.disabled) return;
      confirmEl.disabled    = true;
      confirmEl.textContent = 'جاري...';

      try {
        const note    = noteEl.value.trim();
        const withCtx = ctxEl.checked;
        const result  = await InboxAPI.team.transfer(convId, selectedAgentId, note, withCtx);

        if (result.data?.ok) {
          _showToast(`↩️ تم التحويل إلى ${result.data.to_agent_name}`);
          // تحديث InboxStore محلياً
          const conv = InboxStore.state.conversations?.find(c => c.id === convId);
          if (conv) {
            conv.assigned_to_id = selectedAgentId;
            conv.agent_name     = selectedAgentName;
          }
          InboxStore.emit('conv_assigned', {
            conv_id:    convId,
            agent_id:   selectedAgentId,
            agent_name: selectedAgentName,
          });
          InboxStore.emit('conv:transferred', {
            conv_id:    convId,
            agent_id:   selectedAgentId,
            agent_name: selectedAgentName,
          });
          _closeTransferModal();
        } else {
          const errMsg = result.data?.error || result.error || 'فشل التحويل';
          _showToast(`⚠️ ${errMsg}`, 'error');
          confirmEl.disabled    = false;
          confirmEl.textContent = `تحويل إلى ${_esc(selectedAgentName)}`;
        }
      } catch (e) {
        _showToast('⚠️ خطأ في التحويل', 'error');
        confirmEl.disabled    = false;
        confirmEl.textContent = `تحويل إلى ${_esc(selectedAgentName)}`;
      }
    });

    // ── إغلاق ───────────────────────────────────────────────────────────
    document.getElementById('iv4-transfer-close').addEventListener('click', _closeTransferModal);
    document.getElementById('iv4-transfer-cancel').addEventListener('click', _closeTransferModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeTransferModal(); });
    document.addEventListener('keydown', _transferEscHandler);

    setTimeout(() => searchEl.focus(), 50);
  }

  /**
   * بناء HTML قائمة الموظفين في modal التحويل
   */
  function _renderTransferAgents(query = '', excludeId = null) {
    const filtered = _agents.filter(a => {
      if (a.id === excludeId) return false;  // لا تُحوّل للموظف المعيّن حالياً
      if (!query) return true;
      return (a.name || a.username || '').toLowerCase().includes(query.toLowerCase());
    });

    if (!filtered.length) {
      return '<li class="iv4-transfer-no-results">لا يوجد موظفون</li>';
    }

    return filtered.map(a => {
      const s = STATUS_LABELS[a.inbox_status] || STATUS_LABELS.offline;
      return `
        <li class="iv4-transfer-agent-item"
            data-agent-id="${a.id}"
            data-agent-name="${_esc(a.name || a.username || '')}"
            role="option">
          <span class="iv4-transfer-agent-dot" style="background:${s.color}" title="${s.label}"></span>
          <div class="iv4-transfer-agent-info">
            <span class="iv4-transfer-agent-name">${_esc(a.name || a.username || '?')}</span>
            <span class="iv4-transfer-agent-status">${s.label} · ${a.open_count || 0} محادثة</span>
          </div>
        </li>
      `;
    }).join('');
  }

  function _closeTransferModal() {
    const overlay = document.getElementById('iv4-transfer-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', _transferEscHandler);
  }

  function _transferEscHandler(e) {
    if (e.key === 'Escape') _closeTransferModal();
  }

  // ─── Public API ────────────────────────────────────────────────────────

  return {
    init,
    openAssignDropdown,
    openTransferModal,    // P2-5
    autoAssignAll,

    /** الوصول لقائمة الموظفين (للـ modules الأخرى) */
    get agents() { return _agents; },

    /** الوصول لحالة الموظف الحالي */
    get myStatus() { return _myStatus; },

    /** reload الموظفين يدوياً */
    reloadAgents: _loadAgents,
  };

})();

// تصدير للـ modules الأخرى
if (typeof module !== 'undefined') module.exports = InboxTeam;
