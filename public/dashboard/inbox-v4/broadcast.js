/**
 * broadcast.js — Broadcast V2 لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P8-4)
 *
 * يتيح:
 *  - إنشاء رسالة جماعية (draft) مع اختيار المنصات + الفلاتر
 *  - عرض قائمة الـ broadcasts السابقة مع التقدم الحي
 *  - بدء الإرسال / إلغاؤه
 *  - استعراض نتائج الإرسال (sent/failed/pending)
 *
 * الاستخدام:
 *   InboxBroadcast.init()
 *   InboxBroadcast.open()  ← يفتح الـ overlay
 */

const InboxBroadcast = (() => {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _overlayEl   = null;
  let _view        = 'list';    // 'list' | 'compose' | 'detail'
  let _broadcasts  = [];
  let _activeBc    = null;      // broadcast مفتوح في الـ detail
  let _loading     = false;
  let _pollTimer   = null;      // polling الـ broadcasts الجارية
  let _labels      = [];        // labels متاحة للفلتر

  const PLATFORMS = [
    { value: 'whatsapp_api', label: 'WhatsApp API',  icon: '🟢' },
    { value: 'whatsapp',     label: 'WhatsApp QR',   icon: '📱' },
    { value: 'telegram',     label: 'Telegram',       icon: '✈️' },
  ];

  const STATUS_LABELS = {
    draft:     { text: 'مسودة',   cls: 'iv4-bc-badge--draft'     },
    pending:   { text: 'قيد الإرسال', cls: 'iv4-bc-badge--pending' },
    sending:   { text: 'جاري الإرسال', cls: 'iv4-bc-badge--sending' },
    done:      { text: 'مكتمل',   cls: 'iv4-bc-badge--done'      },
    cancelled: { text: 'ملغى',    cls: 'iv4-bc-badge--cancelled'  },
    failed:    { text: 'فشل',     cls: 'iv4-bc-badge--failed'     },
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _toast(msg, type = 'info') {
    if (window.showInboxToast) window.showInboxToast(msg, type);
  }

  function _fmt(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('ar-EG', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function _progress(bc) {
    if (!bc.total) return 0;
    return Math.round(((bc.sent + bc.failed) / bc.total) * 100);
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  async function open() {
    _view = 'list';
    _buildOverlay();
    document.body.appendChild(_overlayEl);
    await _loadList();
    await _loadLabels();
    _startPoll();
  }

  function close() {
    _stopPoll();
    if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }
  }

  // ─── Overlay Shell ────────────────────────────────────────────────────────

  function _buildOverlay() {
    const el = document.createElement('div');
    el.className = 'iv4-bc-overlay';
    el.id        = 'iv4-broadcast-overlay';
    el.innerHTML = `
      <div class="iv4-bc-panel">
        <div class="iv4-bc-panel-header">
          <div class="iv4-bc-panel-title">
            <button class="iv4-bc-back hidden" id="iv4-bc-back">←</button>
            <span id="iv4-bc-panel-title-text">📢 الرسائل الجماعية</span>
          </div>
          <button class="iv4-bc-close" id="iv4-bc-close">✕</button>
        </div>
        <div class="iv4-bc-panel-body" id="iv4-bc-panel-body">
          ${_renderLoading()}
        </div>
      </div>
    `;
    _overlayEl = el;

    el.addEventListener('click', e => {
      if (e.target === el) close();
    });
    el.querySelector('#iv4-bc-close').addEventListener('click', close);
    el.querySelector('#iv4-bc-back').addEventListener('click', () => {
      _showView('list');
      _loadList();
    });
  }

  function _showView(v) {
    _view = v;
    const back  = _overlayEl?.querySelector('#iv4-bc-back');
    const title = _overlayEl?.querySelector('#iv4-bc-panel-title-text');
    if (!back || !title) return;

    if (v === 'list') {
      back.classList.add('hidden');
      title.textContent = '📢 الرسائل الجماعية';
    } else if (v === 'compose') {
      back.classList.remove('hidden');
      title.textContent = '✏️ رسالة جديدة';
    } else if (v === 'detail') {
      back.classList.remove('hidden');
      title.textContent = `📊 ${_esc(_activeBc?.name || '')}`;
    }
  }

  function _setBody(html) {
    const body = _overlayEl?.querySelector('#iv4-bc-panel-body');
    if (body) body.innerHTML = html;
  }

  function _renderLoading() {
    return `<div class="iv4-bc-loader">جاري التحميل...</div>`;
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────────────

  async function _loadList() {
    if (!_overlayEl) return;
    _setBody(_renderLoading());
    const { data, error } = await InboxAPI.broadcast.list();
    if (error) { _setBody(`<div class="iv4-bc-error">${_esc(error)}</div>`); return; }
    _broadcasts = data.broadcasts || [];
    _setBody(_renderList());
    _bindListEvents();
    _showView('list');
  }

  function _renderList() {
    const rows = _broadcasts.length
      ? _broadcasts.map(bc => _renderBcRow(bc)).join('')
      : `<div class="iv4-bc-empty">لا توجد رسائل جماعية بعد</div>`;

    return `
      <div class="iv4-bc-list-header">
        <button class="iv4-bc-new-btn" id="iv4-bc-new-btn">+ رسالة جديدة</button>
      </div>
      <div class="iv4-bc-list">${rows}</div>
    `;
  }

  function _renderBcRow(bc) {
    const status  = STATUS_LABELS[bc.status] || { text: bc.status, cls: '' };
    const pct     = _progress(bc);
    const isLive  = ['pending', 'sending'].includes(bc.status);
    const platIcons = (bc.platforms || []).map(p => {
      const pl = PLATFORMS.find(x => x.value === p);
      return pl ? `<span title="${pl.label}">${pl.icon}</span>` : '';
    }).join('');

    return `
      <div class="iv4-bc-row" data-id="${bc.id}">
        <div class="iv4-bc-row-top">
          <div class="iv4-bc-row-name">${_esc(bc.name)}</div>
          <span class="iv4-bc-badge ${status.cls}">${status.text}</span>
        </div>
        <div class="iv4-bc-row-meta">
          <span class="iv4-bc-row-plats">${platIcons}</span>
          <span class="iv4-bc-row-msg">${_esc(bc.message_preview || '')}…</span>
        </div>
        ${isLive ? `
          <div class="iv4-bc-progress-wrap">
            <div class="iv4-bc-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="iv4-bc-progress-label">${bc.sent}/${bc.total} أُرسلت (${pct}%)</div>
        ` : (bc.total ? `
          <div class="iv4-bc-row-stats">
            ✅ ${bc.sent} &nbsp; ❌ ${bc.failed} &nbsp; / ${bc.total}
          </div>
        ` : '')}
        <div class="iv4-bc-row-date">${_fmt(bc.created_at)}</div>
        <div class="iv4-bc-row-actions">
          ${bc.status === 'draft' ? `<button class="iv4-bc-btn-send" data-id="${bc.id}">▶ إرسال</button>` : ''}
          ${isLive ? `<button class="iv4-bc-btn-cancel" data-id="${bc.id}">⛔ إيقاف</button>` : ''}
          ${['draft','cancelled','done','failed'].includes(bc.status)
            ? `<button class="iv4-bc-btn-delete" data-id="${bc.id}">🗑</button>` : ''}
          <button class="iv4-bc-btn-detail" data-id="${bc.id}">📊 التفاصيل</button>
        </div>
      </div>
    `;
  }

  function _bindListEvents() {
    const body = _overlayEl?.querySelector('#iv4-bc-panel-body');
    if (!body) return;

    body.querySelector('#iv4-bc-new-btn')?.addEventListener('click', () => {
      _showView('compose');
      _setBody(_renderCompose());
      _bindComposeEvents();
    });

    body.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if (!id) return;

      if (e.target.classList.contains('iv4-bc-btn-send')) {
        await _sendBroadcast(id);
      }
      if (e.target.classList.contains('iv4-bc-btn-cancel')) {
        await _cancelBroadcast(id);
      }
      if (e.target.classList.contains('iv4-bc-btn-delete')) {
        await _deleteBroadcast(id);
      }
      if (e.target.classList.contains('iv4-bc-btn-detail')) {
        await _openDetail(id);
      }
    });
  }

  // ─── COMPOSE VIEW ─────────────────────────────────────────────────────────

  function _renderCompose() {
    const platCheckboxes = PLATFORMS.map(p => `
      <label class="iv4-bc-check-label">
        <input type="checkbox" class="iv4-bc-plat-check" value="${p.value}" />
        ${p.icon} ${p.label}
      </label>
    `).join('');

    const labelOptions = _labels.map(l =>
      `<option value="${l.id}">${_esc(l.name)}</option>`
    ).join('');

    return `
      <div class="iv4-bc-compose">

        <div class="iv4-bc-field">
          <label class="iv4-bc-label">اسم الحملة</label>
          <input id="iv4-bc-name" class="iv4-bc-input"
                 placeholder="مثال: عرض رمضان 2026" maxlength="200" />
        </div>

        <div class="iv4-bc-field">
          <label class="iv4-bc-label">المنصات <span class="iv4-bc-req">*</span></label>
          <div class="iv4-bc-plat-checks">${platCheckboxes}</div>
        </div>

        <div class="iv4-bc-field">
          <label class="iv4-bc-label">نص الرسالة <span class="iv4-bc-req">*</span></label>
          <textarea id="iv4-bc-message" class="iv4-bc-textarea"
                    maxlength="4096" rows="5"
                    placeholder="اكتب رسالتك هنا..."></textarea>
          <div class="iv4-bc-charcount">
            <span id="iv4-bc-msg-count">0</span>/4096
          </div>
        </div>

        <div class="iv4-bc-field">
          <label class="iv4-bc-label">صورة مرفقة (اختياري)</label>
          <input id="iv4-bc-media" class="iv4-bc-input" placeholder="رابط صورة https://..." />
          <small class="iv4-bc-hint">يعمل مع WhatsApp API فقط</small>
        </div>

        <details class="iv4-bc-filter-details">
          <summary class="iv4-bc-filter-summary">🎯 فلاتر الجمهور (اختياري)</summary>
          <div class="iv4-bc-filter-body">

            <div class="iv4-bc-field">
              <label class="iv4-bc-label">Label</label>
              <select id="iv4-bc-label" class="iv4-bc-select">
                <option value="">كل العملاء</option>
                ${labelOptions}
              </select>
            </div>

            <div class="iv4-bc-field">
              <label class="iv4-bc-label">بحث (اسم أو رقم)</label>
              <input id="iv4-bc-search" class="iv4-bc-input" placeholder="0100..." />
            </div>

          </div>
        </details>

        <div class="iv4-bc-compose-footer">
          <div id="iv4-bc-compose-error" class="iv4-bc-compose-error hidden"></div>
          <button class="iv4-bc-save-draft" id="iv4-bc-save-draft">💾 حفظ كمسودة</button>
          <button class="iv4-bc-send-now"   id="iv4-bc-send-now">▶ إرسال الآن</button>
        </div>
      </div>
    `;
  }

  function _bindComposeEvents() {
    const body = _overlayEl?.querySelector('#iv4-bc-panel-body');
    if (!body) return;

    // char count
    const ta = body.querySelector('#iv4-bc-message');
    ta?.addEventListener('input', () => {
      const cnt = body.querySelector('#iv4-bc-msg-count');
      if (cnt) cnt.textContent = ta.value.length;
    });

    body.querySelector('#iv4-bc-save-draft')?.addEventListener('click', () => _createBroadcast(false));
    body.querySelector('#iv4-bc-send-now')?.addEventListener('click',   () => _createBroadcast(true));
  }

  function _getComposeData() {
    const body = _overlayEl?.querySelector('#iv4-bc-panel-body');
    if (!body) return null;

    const name     = body.querySelector('#iv4-bc-name')?.value.trim()    || 'رسالة جماعية';
    const message  = body.querySelector('#iv4-bc-message')?.value.trim() || '';
    const mediaUrl = body.querySelector('#iv4-bc-media')?.value.trim()   || null;
    const labelId  = body.querySelector('#iv4-bc-label')?.value          || null;
    const search   = body.querySelector('#iv4-bc-search')?.value.trim()  || null;

    const platforms = [...body.querySelectorAll('.iv4-bc-plat-check:checked')]
      .map(cb => cb.value);

    const audience_filter = {};
    if (labelId) audience_filter.label_id   = labelId;
    if (search)  audience_filter.search      = search;

    return { name, message, media_url: mediaUrl, content_type: mediaUrl ? 'image' : 'text', platforms, audience_filter };
  }

  function _showComposeError(msg) {
    const el = _overlayEl?.querySelector('#iv4-bc-compose-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(_showComposeError._t);
    _showComposeError._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  async function _createBroadcast(sendNow) {
    if (_loading) return;
    const data = _getComposeData();
    if (!data) return;

    if (!data.message) { _showComposeError('نص الرسالة مطلوب'); return; }
    if (!data.platforms.length) { _showComposeError('اختر منصة واحدة على الأقل'); return; }

    _loading = true;
    const btn = _overlayEl?.querySelector(sendNow ? '#iv4-bc-send-now' : '#iv4-bc-save-draft');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const { data: res, error } = await InboxAPI.broadcast.create(data);
    if (error) {
      _loading = false;
      if (btn) { btn.disabled = false; btn.textContent = sendNow ? '▶ إرسال الآن' : '💾 حفظ كمسودة'; }
      _showComposeError(error);
      return;
    }

    const bcId = res.broadcast.id;

    if (sendNow) {
      const { error: sendErr } = await InboxAPI.broadcast.send(bcId);
      if (sendErr) {
        _loading = false;
        _showComposeError(sendErr);
        if (btn) { btn.disabled = false; btn.textContent = '▶ إرسال الآن'; }
        return;
      }
      _toast('بدأ الإرسال ✅', 'success');
    } else {
      _toast('تم حفظ المسودة ✅', 'success');
    }

    _loading = false;
    _showView('list');
    await _loadList();
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────────────────────

  async function _openDetail(id) {
    _setBody(_renderLoading());
    const { data, error } = await InboxAPI.broadcast.get(id);
    if (error) { _setBody(`<div class="iv4-bc-error">${_esc(error)}</div>`); return; }
    _activeBc = { ...data.broadcast, platforms: data.broadcast.platforms };
    _showView('detail');
    await _renderDetail();
  }

  async function _renderDetail() {
    if (!_activeBc) return;
    const bc       = _activeBc;
    const status   = STATUS_LABELS[bc.status] || { text: bc.status, cls: '' };
    const pct      = _progress(bc);
    const isLive   = ['pending', 'sending'].includes(bc.status);

    // جلب أول 50 مستلم
    const { data: rData } = await InboxAPI.broadcast.recipients(bc.id, { limit: 50 });
    const recipients = rData?.recipients || [];

    const recRows = recipients.map(r => `
      <tr class="iv4-bc-rec-${r.status}">
        <td>${_esc(r.contact_name || r.contact_phone)}</td>
        <td>${_esc(r.contact_phone)}</td>
        <td>${_esc(PLATFORMS.find(p => p.value === r.platform)?.label || r.platform)}</td>
        <td><span class="iv4-bc-badge ${STATUS_LABELS[r.status]?.cls || ''}">${STATUS_LABELS[r.status]?.text || r.status}</span></td>
        <td>${r.sent_at ? _fmt(r.sent_at) : (r.error_msg ? `<span class="iv4-bc-err-tip" title="${_esc(r.error_msg)}">⚠ خطأ</span>` : '—')}</td>
      </tr>
    `).join('');

    _setBody(`
      <div class="iv4-bc-detail">

        <!-- KPI cards -->
        <div class="iv4-bc-kpi-row">
          <div class="iv4-bc-kpi">
            <div class="iv4-bc-kpi-val">${bc.total}</div>
            <div class="iv4-bc-kpi-lbl">إجمالي</div>
          </div>
          <div class="iv4-bc-kpi iv4-bc-kpi--sent">
            <div class="iv4-bc-kpi-val">${bc.sent}</div>
            <div class="iv4-bc-kpi-lbl">أُرسلت ✅</div>
          </div>
          <div class="iv4-bc-kpi iv4-bc-kpi--fail">
            <div class="iv4-bc-kpi-val">${bc.failed}</div>
            <div class="iv4-bc-kpi-lbl">فشلت ❌</div>
          </div>
          <div class="iv4-bc-kpi">
            <div class="iv4-bc-kpi-val">${bc.total - bc.sent - bc.failed}</div>
            <div class="iv4-bc-kpi-lbl">متبقية ⏳</div>
          </div>
        </div>

        <!-- Progress bar -->
        ${bc.total ? `
          <div class="iv4-bc-progress-wrap iv4-bc-progress-lg">
            <div class="iv4-bc-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="iv4-bc-progress-label">${pct}% مكتمل</div>
        ` : ''}

        <!-- Status + Actions -->
        <div class="iv4-bc-detail-actions">
          <span class="iv4-bc-badge ${status.cls}">${status.text}</span>
          ${bc.status === 'draft' ? `<button class="iv4-bc-btn-send iv4-bc-action-btn" data-id="${bc.id}">▶ إرسال الآن</button>` : ''}
          ${isLive ? `<button class="iv4-bc-btn-cancel iv4-bc-action-btn" data-id="${bc.id}">⛔ إيقاف</button>` : ''}
          ${['done','cancelled','failed'].includes(bc.status)
            ? `<button class="iv4-bc-btn-delete iv4-bc-action-btn" data-id="${bc.id}">🗑 حذف</button>` : ''}
          ${['done','cancelled','failed'].includes(bc.status)
            ? `<button class="iv4-bc-btn-export iv4-bc-action-btn" data-id="${bc.id}">⬇ تصدير CSV</button>` : ''}
        </div>

        <!-- Recipients Table -->
        <div class="iv4-bc-rec-wrap">
          <div class="iv4-bc-rec-title">المستلمون (أول 50)</div>
          <div class="iv4-bc-rec-table-wrap">
            <table class="iv4-bc-rec-table">
              <thead>
                <tr><th>الاسم</th><th>الرقم</th><th>المنصة</th><th>الحالة</th><th>وقت الإرسال</th></tr>
              </thead>
              <tbody>${recRows || '<tr><td colspan="5" class="iv4-bc-empty">لا يوجد مستلمون</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    _bindDetailEvents();
  }

  function _bindDetailEvents() {
    const body = _overlayEl?.querySelector('#iv4-bc-panel-body');
    if (!body) return;

    body.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if (!id) return;
      if (e.target.classList.contains('iv4-bc-btn-send'))   { await _sendBroadcast(id);   await _openDetail(id); }
      if (e.target.classList.contains('iv4-bc-btn-cancel')) { await _cancelBroadcast(id); await _openDetail(id); }
      if (e.target.classList.contains('iv4-bc-btn-delete')) { await _deleteBroadcast(id); _showView('list'); await _loadList(); }
      if (e.target.classList.contains('iv4-bc-btn-export')) { _exportCSV(id); }
    });
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function _sendBroadcast(id) {
    const { data, error } = await InboxAPI.broadcast.send(id);
    if (error) { _toast(error, 'error'); return; }
    _toast(`بدأ الإرسال — ${data.total} مستلم ✅`, 'success');
    await _loadList();
  }

  async function _cancelBroadcast(id) {
    const { error } = await InboxAPI.broadcast.cancel(id);
    if (error) { _toast(error, 'error'); return; }
    _toast('تم إيقاف الإرسال', 'info');
    await _loadList();
  }

  async function _deleteBroadcast(id) {
    if (!confirm('تأكيد الحذف؟')) return;
    const { error } = await InboxAPI.broadcast.delete(id);
    if (error) { _toast(error, 'error'); return; }
    _toast('تم الحذف ✅');
    await _loadList();
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  async function _exportCSV(id) {
    // جلب كل المستلمين (max 5000)
    const { data, error } = await InboxAPI.broadcast.recipients(id, { limit: 5000 });
    if (error) { _toast(error, 'error'); return; }

    const rows = data.recipients || [];
    const BOM  = '\uFEFF';
    const header = ['الاسم', 'الرقم', 'المنصة', 'الحالة', 'وقت الإرسال', 'الخطأ'];
    const lines  = [header.join(',')];

    rows.forEach(r => {
      lines.push([
        `"${(r.contact_name || '').replace(/"/g, '""')}"`,
        `"${r.contact_phone}"`,
        `"${r.platform}"`,
        `"${STATUS_LABELS[r.status]?.text || r.status}"`,
        `"${r.sent_at ? new Date(r.sent_at * 1000).toLocaleString('ar-EG') : ''}"`,
        `"${(r.error_msg || '').replace(/"/g, '""')}"`,
      ].join(','));
    });

    const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `broadcast-${id}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
    _toast('تم تصدير CSV ✅', 'success');
  }

  // ─── Labels Loader ────────────────────────────────────────────────────────

  async function _loadLabels() {
    const { data } = await InboxAPI.labels.list();
    _labels = data?.labels || [];
  }

  // ─── Polling الـ broadcasts الجارية ──────────────────────────────────────

  function _startPoll() {
    _stopPoll();
    _pollTimer = setInterval(async () => {
      const hasLive = _broadcasts.some(b => ['pending', 'sending'].includes(b.status));
      if (!hasLive) return;

      if (_view === 'list') {
        const { data } = await InboxAPI.broadcast.list();
        if (!data) return;
        _broadcasts = data.broadcasts || [];
        _setBody(_renderList());
        _bindListEvents();
      } else if (_view === 'detail' && _activeBc) {
        const isLive = ['pending', 'sending'].includes(_activeBc.status);
        if (!isLive) return;
        const { data } = await InboxAPI.broadcast.get(_activeBc.id);
        if (!data) return;
        _activeBc = { ...data.broadcast, platforms: data.broadcast.platforms };
        await _renderDetail();
      }
    }, 4000); // poll كل 4 ثوانٍ
  }

  function _stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // ربط زر الـ sidebar
    const btn = document.getElementById('iv4-broadcast-btn');
    if (btn) btn.addEventListener('click', open);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return { init, open, close };

})();
