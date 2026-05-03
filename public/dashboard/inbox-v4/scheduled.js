/**
 * scheduled.js — Scheduled Messages UI لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P4-5 Scheduled Messages)
 *
 * يوفر:
 *   - زر 🕐 في chat header لجدولة رسالة لمحادثة حالية
 *   - Panel عرض الرسائل المجدولة للمحادثة الحالية
 *   - Dashboard عام لكل الرسائل المجدولة (Pending / Sent / Failed)
 *   - إضافة / تعديل / حذف رسائل مجدولة
 *
 * API: InboxAPI.scheduled.*
 * يُهيّأ من app.js: InboxScheduled.init()
 */

/* global InboxAPI, InboxStore */

const InboxScheduled = (() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _currentConvId = null;
  let _convScheduled = [];  // رسائل المحادثة الحالية

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // عند فتح محادثة — تحديث الـ current conv
    document.addEventListener('iv4:conv-opened', e => {
      _currentConvId = e.detail?.convId || null;
      _refreshConvPanel();
    });

    // ربط الأحداث المباشرة
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="open-scheduled-dashboard"]')) openDashboard();
      if (e.target.closest('[data-action="schedule-message"]'))         openScheduleModal(null);
      if (e.target.closest('[data-action="edit-scheduled"]')) {
        const id = e.target.closest('[data-action="edit-scheduled"]').dataset.id;
        _openEditModal(parseInt(id));
      }
      if (e.target.closest('[data-action="delete-scheduled"]')) {
        const id = e.target.closest('[data-action="delete-scheduled"]').dataset.id;
        _deleteScheduled(parseInt(id));
      }
    });
  }

  // ── تحديث Panel الـ Chat ──────────────────────────────────────────────────
  async function _refreshConvPanel() {
    const panel = document.getElementById('iv4-sched-conv-panel');
    if (!panel || !_currentConvId) return;

    try {
      const data = await InboxAPI.scheduled.listConv(_currentConvId);
      _convScheduled = (data.scheduled || []).filter(s => s.status === 'pending');
      _renderConvPanel(panel);
    } catch (_) {}
  }

  function _renderConvPanel(panel) {
    if (!_convScheduled.length) {
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `
      <div class="iv4-sched-conv-list">
        <div class="iv4-sched-conv-header">
          <span>🕐 مجدولة (${_convScheduled.length})</span>
        </div>
        ${_convScheduled.map(s => `
          <div class="iv4-sched-conv-item" data-id="${s.id}">
            <div class="iv4-sched-conv-text">${_esc(s.content)}</div>
            <div class="iv4-sched-conv-meta">
              ${_fmtDateTime(s.scheduled_at)}
            </div>
            <div class="iv4-sched-conv-actions">
              <button class="iv4-sched-btn-sm" data-action="edit-scheduled" data-id="${s.id}" title="تعديل">✏️</button>
              <button class="iv4-sched-btn-sm iv4-sched-btn-del" data-action="delete-scheduled" data-id="${s.id}" title="حذف">🗑</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // ── Modal جدولة رسالة جديدة ────────────────────────────────────────────────
  function openScheduleModal(convId) {
    const targetConv = convId || _currentConvId;
    if (!targetConv) {
      alert('يجب فتح محادثة أولاً');
      return;
    }
    _openFormModal(null, targetConv);
  }

  // ── Modal تعديل رسالة مجدولة ──────────────────────────────────────────────
  async function _openEditModal(id) {
    const item = _convScheduled.find(s => s.id === id)
      || (_allScheduled || []).find(s => s.id === id);
    if (!item) return;
    _openFormModal(item, item.conversation_id);
  }

  // ── Form Modal (إضافة أو تعديل) ───────────────────────────────────────────
  function _openFormModal(existing, convId) {
    _removeModal();

    // قيمة افتراضية: الآن + ساعة
    const defaultTime = new Date(Date.now() + 3600000);
    const defaultLocal = _toLocalInput(defaultTime);

    const modal = document.createElement('div');
    modal.id = 'iv4-sched-modal';
    modal.innerHTML = `
      <div class="iv4-sched-modal-box">
        <div class="iv4-sched-modal-header">
          <h4>${existing ? '✏️ تعديل رسالة مجدولة' : '🕐 جدولة رسالة جديدة'}</h4>
          <button id="iv4-sched-modal-close">✕</button>
        </div>
        <div class="iv4-sched-modal-body">
          <div class="iv4-sched-form-row">
            <label>نص الرسالة</label>
            <textarea id="iv4-sched-content" class="iv4-sched-textarea" rows="4"
              placeholder="اكتب نص الرسالة التي ستُرسل تلقائياً…"
            >${_esc(existing?.content || '')}</textarea>
          </div>
          <div class="iv4-sched-form-row">
            <label>وقت الإرسال</label>
            <input type="datetime-local" id="iv4-sched-datetime" class="iv4-sched-input"
              value="${existing ? _toLocalInput(new Date(existing.scheduled_at * 1000)) : defaultLocal}"
              min="${_toLocalInput(new Date(Date.now() + 60000))}">
          </div>
          ${existing ? `
            <div class="iv4-sched-form-row">
              <div class="iv4-sched-status-badge iv4-sched-status--${existing.status}">
                ${_statusLabel(existing.status)}
              </div>
            </div>` : ''}
        </div>
        <div class="iv4-sched-modal-footer">
          <button class="iv4-sched-btn iv4-sched-btn--ghost" id="iv4-sched-cancel">إلغاء</button>
          <button class="iv4-sched-btn iv4-sched-btn--primary" id="iv4-sched-submit">
            ${existing ? '💾 حفظ التعديل' : '📅 جدولة الإرسال'}
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('#iv4-sched-modal-close').onclick = _removeModal;
    modal.querySelector('#iv4-sched-cancel').onclick       = _removeModal;
    modal.addEventListener('click', e => { if (e.target === modal) _removeModal(); });

    modal.querySelector('#iv4-sched-submit').onclick = async () => {
      const content  = document.getElementById('iv4-sched-content')?.value.trim();
      const dtVal    = document.getElementById('iv4-sched-datetime')?.value;
      if (!content)  { alert('نص الرسالة مطلوب'); return; }
      if (!dtVal)    { alert('وقت الإرسال مطلوب'); return; }

      const schedIso = new Date(dtVal).toISOString();
      const btn      = document.getElementById('iv4-sched-submit');
      btn.disabled   = true; btn.textContent = 'جاري الحفظ…';

      try {
        if (existing) {
          await InboxAPI.scheduled.update(existing.id, { content, scheduled_at: schedIso });
        } else {
          await InboxAPI.scheduled.create(convId, { content, scheduled_at: schedIso });
        }
        _removeModal();
        _showToast('✅ تم الجدولة بنجاح');
        await _refreshConvPanel();
        // تحديث dashboard لو مفتوح
        if (document.getElementById('iv4-sched-overlay')) await _loadDashboard();
      } catch (err) {
        alert('خطأ: ' + err.message);
        btn.disabled = false;
        btn.textContent = existing ? '💾 حفظ التعديل' : '📅 جدولة الإرسال';
      }
    };
  }

  // ── حذف رسالة مجدولة ─────────────────────────────────────────────────────
  async function _deleteScheduled(id) {
    if (!confirm('هل تريد إلغاء هذه الرسالة المجدولة؟')) return;
    try {
      await InboxAPI.scheduled.delete(id);
      _convScheduled = _convScheduled.filter(s => s.id !== id);
      const panel = document.getElementById('iv4-sched-conv-panel');
      if (panel) _renderConvPanel(panel);
      if (document.getElementById('iv4-sched-overlay')) await _loadDashboard();
      _showToast('🗑️ تم إلغاء الجدولة');
    } catch (err) {
      _showToast('❌ فشل الحذف: ' + err.message);
    }
  }

  // ── Dashboard عام ─────────────────────────────────────────────────────────
  let _allScheduled = [];
  let _dashStatus   = 'pending';

  async function openDashboard() {
    _removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-sched-overlay';
    overlay.innerHTML = `
      <div class="iv4-sched-panel">
        <div class="iv4-sched-panel-header">
          <h2>🕐 الرسائل المجدولة</h2>
          <div class="iv4-sched-panel-actions">
            <button class="iv4-sched-btn iv4-sched-btn--sm" id="iv4-sched-new-btn"
              data-action="schedule-message">+ رسالة جديدة</button>
            <button class="iv4-sched-btn iv4-sched-btn--sm iv4-sched-btn--ghost" id="iv4-sched-run-btn">▶ تشغيل الآن</button>
            <button class="iv4-sched-panel-close" id="iv4-sched-panel-close">✕</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="iv4-sched-tabs">
          <button class="iv4-sched-tab iv4-sched-tab--active" data-status="pending">⏳ قيد الانتظار</button>
          <button class="iv4-sched-tab" data-status="sent">✅ تم الإرسال</button>
          <button class="iv4-sched-tab" data-status="failed">❌ فشل</button>
        </div>

        <div class="iv4-sched-panel-body" id="iv4-sched-panel-body">
          <div class="iv4-sched-loading">جاري التحميل…</div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#iv4-sched-panel-close').onclick = _removeOverlay;
    overlay.addEventListener('click', e => { if (e.target === overlay) _removeOverlay(); });

    overlay.querySelectorAll('.iv4-sched-tab').forEach(tab => {
      tab.onclick = async () => {
        overlay.querySelectorAll('.iv4-sched-tab').forEach(t => t.classList.remove('iv4-sched-tab--active'));
        tab.classList.add('iv4-sched-tab--active');
        _dashStatus = tab.dataset.status;
        await _loadDashboard();
      };
    });

    overlay.querySelector('#iv4-sched-run-btn').onclick = async () => {
      const btn = overlay.querySelector('#iv4-sched-run-btn');
      btn.disabled = true; btn.textContent = 'جاري…';
      try {
        const res = await InboxAPI.scheduled.run();
        _showToast(`✅ تم الإرسال: ${res.sent || 0} — فشل: ${res.failed || 0}`);
        await _loadDashboard();
      } catch (err) {
        _showToast('❌ ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = '▶ تشغيل الآن';
      }
    };

    await _loadDashboard();
  }

  async function _loadDashboard() {
    const body = document.getElementById('iv4-sched-panel-body');
    if (!body) return;
    body.innerHTML = '<div class="iv4-sched-loading">جاري التحميل…</div>';
    try {
      const data = await InboxAPI.scheduled.listAll(_dashStatus);
      _allScheduled = data.scheduled || [];
      _renderDashboard(body);
    } catch (err) {
      body.innerHTML = `<div class="iv4-sched-error">خطأ: ${_esc(err.message)}</div>`;
    }
  }

  function _renderDashboard(container) {
    if (!_allScheduled.length) {
      container.innerHTML = `
        <div class="iv4-sched-empty">
          <div style="font-size:2.5rem">🕐</div>
          <p>لا توجد رسائل ${_statusLabel(_dashStatus)}</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="iv4-sched-dash-list">
        ${_allScheduled.map(s => `
          <div class="iv4-sched-dash-item" data-id="${s.id}">
            <div class="iv4-sched-dash-left">
              <div class="iv4-sched-dash-conv">
                <span class="iv4-sched-platform-badge">${_platformIcon(s.platform)}</span>
                <span class="iv4-sched-sender">${_esc(s.sender_name || s.sender_phone || 'مجهول')}</span>
              </div>
              <div class="iv4-sched-dash-content">${_esc(s.content)}</div>
            </div>
            <div class="iv4-sched-dash-right">
              <div class="iv4-sched-time">${_fmtDateTime(s.scheduled_at)}</div>
              <div class="iv4-sched-status-badge iv4-sched-status--${s.status}">${_statusLabel(s.status)}</div>
              ${s.status === 'pending' ? `
                <div class="iv4-sched-dash-btns">
                  <button class="iv4-sched-btn-sm" data-action="edit-scheduled" data-id="${s.id}" title="تعديل">✏️</button>
                  <button class="iv4-sched-btn-sm iv4-sched-btn-del" data-action="delete-scheduled" data-id="${s.id}" title="حذف">🗑</button>
                </div>` : ''}
              ${s.status === 'failed' ? `<div class="iv4-sched-error-msg" title="${_esc(s.error_msg||'')}">⚠️ ${_esc((s.error_msg||'').slice(0,40))}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _fmtDateTime(unixSec) {
    return new Date(unixSec * 1000).toLocaleString('ar-EG', {
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });
  }

  function _toLocalInput(date) {
    const pad = n => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function _statusLabel(status) {
    return { pending:'⏳ قيد الانتظار', sent:'✅ تم الإرسال', failed:'❌ فشل' }[status] || status;
  }

  function _platformIcon(platform) {
    return { whatsapp:'💬', whatsapp_api:'💬', telegram:'✈️', instagram:'📸', email:'📧' }[platform] || '💬';
  }

  function _esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _removeModal()   { document.getElementById('iv4-sched-modal')?.remove(); }
  function _removeOverlay() { document.getElementById('iv4-sched-overlay')?.remove(); }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'iv4-sched-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('iv4-sched-toast--show'), 10);
    setTimeout(() => { t.classList.remove('iv4-sched-toast--show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  return { init, openScheduleModal, openDashboard };
})();
