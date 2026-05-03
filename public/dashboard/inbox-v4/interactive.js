/**
 * interactive.js — WA Interactive Messages Builder (P8-2)
 * آخر تحديث: 2026-05-03
 *
 * يتيح بناء وإرسال:
 *   - Button Message  : حتى 3 أزرار رد سريع
 *   - List Message    : قائمة بـ sections وrows (حتى 10 عناصر)
 *
 * يعمل فقط على محادثات whatsapp_api
 * يُفعَّل من زر #iv4-interactive-btn في الـ toolbar
 */

'use strict';

const InboxInteractive = (() => {

  // ─── State ────────────────────────────────────────────────────────────────
  let _overlay  = null;
  let _sending  = false;

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    const btn = document.getElementById('iv4-interactive-btn');
    if (!btn) return;
    btn.addEventListener('click', _openModal);
  }

  // ─── Modal Open ───────────────────────────────────────────────────────────
  function _openModal() {
    const convId = InboxStore.state.activeConvId;
    if (!convId) return;

    // تحقق من المنصة — يعمل فقط مع whatsapp_api
    const conv = InboxStore.state.conversations?.find(c => String(c.id) === String(convId));
    if (conv && conv.platform !== 'whatsapp_api') {
      alert('الرسائل التفاعلية تعمل فقط مع WhatsApp API');
      return;
    }

    if (_overlay) _overlay.remove();

    _overlay = document.createElement('div');
    _overlay.className = 'iv4-interactive-overlay';
    _overlay.innerHTML = _buildModalHTML();
    document.body.appendChild(_overlay);

    _bindModalEvents();
  }

  // ─── HTML ─────────────────────────────────────────────────────────────────
  function _buildModalHTML() {
    return `
<div class="iv4-interactive-modal" id="iv4-int-modal">
  <div class="iv4-int-header">
    <span>⚡ رسالة تفاعلية</span>
    <button class="iv4-int-close" id="iv4-int-close">✕</button>
  </div>

  <div class="iv4-int-body">
    <!-- نوع الرسالة -->
    <div class="iv4-int-row">
      <label class="iv4-int-label">النوع</label>
      <div class="iv4-int-type-tabs">
        <button class="iv4-int-tab iv4-int-tab--active" data-tab="button">أزرار</button>
        <button class="iv4-int-tab" data-tab="list">قائمة</button>
      </div>
    </div>

    <!-- Header اختياري -->
    <div class="iv4-int-row">
      <label class="iv4-int-label">عنوان (اختياري)</label>
      <input type="text" id="iv4-int-header" class="iv4-int-input" placeholder="نص عنوان الرسالة" maxlength="60">
    </div>

    <!-- Body إلزامي -->
    <div class="iv4-int-row">
      <label class="iv4-int-label">نص الرسالة <span class="iv4-int-req">*</span></label>
      <textarea id="iv4-int-body" class="iv4-int-textarea" placeholder="اكتب نص الرسالة هنا..." maxlength="1024" rows="3"></textarea>
      <span class="iv4-int-charcount" id="iv4-int-body-count">0 / 1024</span>
    </div>

    <!-- Footer اختياري -->
    <div class="iv4-int-row">
      <label class="iv4-int-label">ذيل (اختياري)</label>
      <input type="text" id="iv4-int-footer" class="iv4-int-input" placeholder="نص صغير أسفل الرسالة" maxlength="60">
    </div>

    <!-- قسم الأزرار -->
    <div id="iv4-int-buttons-section" class="iv4-int-section">
      <div class="iv4-int-section-header">
        <span>الأزرار (1–3)</span>
        <button class="iv4-int-add-btn" id="iv4-int-add-button">+ إضافة زر</button>
      </div>
      <div id="iv4-int-buttons-list" class="iv4-int-items-list">
        <!-- أضف زراً تلقائياً -->
      </div>
    </div>

    <!-- قسم القائمة -->
    <div id="iv4-int-list-section" class="iv4-int-section" style="display:none">
      <div class="iv4-int-row">
        <label class="iv4-int-label">نص زر القائمة</label>
        <input type="text" id="iv4-int-list-btn-label" class="iv4-int-input" value="اختر" maxlength="20">
      </div>
      <div class="iv4-int-section-header">
        <span>العناصر (1–10)</span>
        <button class="iv4-int-add-btn" id="iv4-int-add-row">+ إضافة عنصر</button>
      </div>
      <div id="iv4-int-rows-list" class="iv4-int-items-list">
        <!-- عناصر القائمة -->
      </div>
    </div>
  </div>

  <div class="iv4-int-footer-bar">
    <button class="iv4-int-cancel" id="iv4-int-cancel">إلغاء</button>
    <button class="iv4-int-send" id="iv4-int-send">⚡ إرسال</button>
  </div>
</div>`;
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  function _bindModalEvents() {
    const modal = document.getElementById('iv4-int-modal');
    if (!modal) return;

    // إغلاق
    document.getElementById('iv4-int-close').addEventListener('click', _close);
    document.getElementById('iv4-int-cancel').addEventListener('click', _close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) _close(); });

    // tabs
    modal.querySelectorAll('.iv4-int-tab').forEach(tab => {
      tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });

    // char count
    const bodyEl = document.getElementById('iv4-int-body');
    const countEl = document.getElementById('iv4-int-body-count');
    bodyEl.addEventListener('input', () => {
      countEl.textContent = `${bodyEl.value.length} / 1024`;
    });

    // إضافة زر
    document.getElementById('iv4-int-add-button').addEventListener('click', () => {
      const list = document.getElementById('iv4-int-buttons-list');
      if (list.children.length >= 3) return;
      _appendButtonItem(list);
    });

    // إضافة عنصر قائمة
    document.getElementById('iv4-int-add-row').addEventListener('click', () => {
      const list = document.getElementById('iv4-int-rows-list');
      const total = list.querySelectorAll('.iv4-int-item').length;
      if (total >= 10) return;
      _appendRowItem(list);
    });

    // إرسال
    document.getElementById('iv4-int-send').addEventListener('click', _send);

    // زر افتراضي أول
    _appendButtonItem(document.getElementById('iv4-int-buttons-list'));
  }

  function _switchTab(tab) {
    document.querySelectorAll('.iv4-int-tab').forEach(t =>
      t.classList.toggle('iv4-int-tab--active', t.dataset.tab === tab)
    );
    document.getElementById('iv4-int-buttons-section').style.display = tab === 'button' ? '' : 'none';
    document.getElementById('iv4-int-list-section').style.display    = tab === 'list'   ? '' : 'none';
  }

  // ─── Button Item ──────────────────────────────────────────────────────────
  function _appendButtonItem(container) {
    const idx  = container.children.length + 1;
    const item = document.createElement('div');
    item.className = 'iv4-int-item';
    item.innerHTML = `
      <input type="text" class="iv4-int-input iv4-int-item-title"
             placeholder="نص الزر ${idx}" maxlength="20">
      <button class="iv4-int-remove">✕</button>`;
    container.appendChild(item);
    item.querySelector('.iv4-int-remove').addEventListener('click', () => {
      item.remove();
      _renumberItems(container, 'نص الزر');
    });
    item.querySelector('input').focus();
  }

  // ─── List Row Item ────────────────────────────────────────────────────────
  function _appendRowItem(container) {
    const idx  = container.querySelectorAll('.iv4-int-item').length + 1;
    const item = document.createElement('div');
    item.className = 'iv4-int-item iv4-int-item--row';
    item.innerHTML = `
      <input type="text" class="iv4-int-input iv4-int-item-title"
             placeholder="عنوان العنصر ${idx}" maxlength="24">
      <input type="text" class="iv4-int-input iv4-int-item-desc"
             placeholder="وصف اختياري" maxlength="72">
      <button class="iv4-int-remove">✕</button>`;
    container.appendChild(item);
    item.querySelector('.iv4-int-remove').addEventListener('click', () => {
      item.remove();
      _renumberItems(container, 'عنوان العنصر');
    });
    item.querySelector('input').focus();
  }

  function _renumberItems(container, label) {
    container.querySelectorAll('.iv4-int-item-title').forEach((inp, i) => {
      inp.placeholder = `${label} ${i + 1}`;
    });
  }

  // ─── Send ─────────────────────────────────────────────────────────────────
  async function _send() {
    if (_sending) return;

    const convId = InboxStore.state.activeConvId;
    if (!convId) return;

    const activeTab = document.querySelector('.iv4-int-tab--active')?.dataset?.tab || 'button';
    const bodyText  = (document.getElementById('iv4-int-body')?.value || '').trim();
    const headerTxt = (document.getElementById('iv4-int-header')?.value || '').trim();
    const footerTxt = (document.getElementById('iv4-int-footer')?.value || '').trim();

    if (!bodyText) {
      document.getElementById('iv4-int-body').focus();
      return;
    }

    let payload = {
      type:   activeTab,
      body:   bodyText,
      ...(headerTxt ? { header: { type: 'text', text: headerTxt } } : {}),
      ...(footerTxt ? { footer: footerTxt } : {}),
    };

    if (activeTab === 'button') {
      const buttons = [];
      document.querySelectorAll('#iv4-int-buttons-list .iv4-int-item').forEach((item, i) => {
        const title = item.querySelector('.iv4-int-item-title')?.value?.trim();
        if (title) buttons.push({ id: `btn_${i + 1}`, title });
      });
      if (!buttons.length) return;
      payload.buttons = buttons;

    } else {
      // list — نجمعها في section واحدة
      const rows = [];
      document.querySelectorAll('#iv4-int-rows-list .iv4-int-item').forEach((item, i) => {
        const title = item.querySelector('.iv4-int-item-title')?.value?.trim();
        const desc  = item.querySelector('.iv4-int-item-desc')?.value?.trim();
        if (title) rows.push({ id: `row_${i + 1}`, title, ...(desc ? { description: desc } : {}) });
      });
      if (!rows.length) return;
      const btnLabel = (document.getElementById('iv4-int-list-btn-label')?.value || 'اختر').trim();
      payload.sections   = [{ title: '', rows }];
      payload.button_label = btnLabel;
    }

    // حالة Loading
    const sendBtn = document.getElementById('iv4-int-send');
    _sending = true;
    sendBtn.disabled    = true;
    sendBtn.textContent = '⏳ جاري الإرسال...';

    try {
      const res = await InboxAPI.messages.sendInteractive(convId, payload);
      if (res?.success) {
        _close();
        // أضف الرسالة المُرسَلة للـ store + SSE يتولى بقية التحديث
        if (res.message) {
          InboxStore.state.messages.push(res.message);
          if (typeof InboxChat !== 'undefined') InboxChat.appendMessages([res.message]);
        }
      } else {
        throw new Error(res?.error || 'فشل الإرسال');
      }
    } catch (e) {
      sendBtn.textContent = '⚡ إرسال';
      sendBtn.disabled    = false;
      _showError(e.message || 'خطأ في الإرسال');
    } finally {
      _sending = false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _close() {
    _overlay?.remove();
    _overlay = null;
    _sending = false;
  }

  function _showError(msg) {
    let err = document.getElementById('iv4-int-error');
    if (!err) {
      err = document.createElement('div');
      err.id = 'iv4-int-error';
      err.className = 'iv4-int-error';
      document.querySelector('.iv4-int-footer-bar')?.insertAdjacentElement('beforebegin', err);
    }
    err.textContent = '⚠️ ' + msg;
    setTimeout(() => err?.remove(), 5000);
  }

  return { init };
})();
