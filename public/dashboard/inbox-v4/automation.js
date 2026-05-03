/**
 * automation.js — Welcome + Away Messages UI لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P8-5 Webhook Triggers)
 *
 * يوفر:
 *   - Overlay لإعداد رسالة الترحيب (Welcome) عند بدء محادثة جديدة
 *   - Overlay لإعداد رسالة الغياب (Away) مع جدول ساعات العمل
 *   - اختيار أيام العمل (Sat–Fri)
 *   - اختيار Timezone
 *   - Away Mode: schedule (حسب الجدول) أو always (دائماً)
 *
 * API: InboxAPI.welcomeAway.*
 * يُهيّأ من app.js: InboxAutomation.init()
 */

/* global InboxAPI */

const InboxAutomation = (() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const TIMEZONES = [
    { value: 'Africa/Cairo',       label: 'القاهرة (UTC+2/+3)' },
    { value: 'Asia/Riyadh',        label: 'الرياض (UTC+3)' },
    { value: 'Asia/Dubai',         label: 'دبي (UTC+4)' },
    { value: 'Asia/Kuwait',        label: 'الكويت (UTC+3)' },
    { value: 'Africa/Casablanca',  label: 'الدار البيضاء (UTC+1)' },
    { value: 'Europe/London',      label: 'لندن (UTC+0/+1)' },
    { value: 'America/New_York',   label: 'نيويورك (UTC-5/-4)' },
    { value: 'UTC',                label: 'UTC' },
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  let _settings   = null;
  let _acSettings = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="open-welcome-away"]')) open();
    });
  }

  // ── فتح الـ Overlay ────────────────────────────────────────────────────────
  async function open() {
    _removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-automation-overlay';
    overlay.innerHTML = `
      <div class="iv4-auto-panel">
        <div class="iv4-auto-header">
          <h2>⚙️ رسائل الترحيب والغياب</h2>
          <button class="iv4-auto-close" id="iv4-auto-close">✕</button>
        </div>
        <div class="iv4-auto-body" id="iv4-auto-body">
          <div class="iv4-auto-loading">جاري التحميل…</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#iv4-auto-close').onclick = _removeOverlay;
    overlay.addEventListener('click', e => { if (e.target === overlay) _removeOverlay(); });

    await _loadAndRender();
  }

  // ── جلب البيانات وعرضها ─────────────────────────────────────────────────
  async function _loadAndRender() {
    const body = document.getElementById('iv4-auto-body');
    if (!body) return;
    try {
      const [waData, acData] = await Promise.all([
        InboxAPI.welcomeAway.get(),
        InboxAPI.autoClose.get(),
      ]);
      _settings   = waData.settings || {};
      _acSettings = acData.settings || {};
      _render(body);
    } catch (err) {
      body.innerHTML = `<div class="iv4-auto-error">خطأ: ${_esc(err.message)}</div>`;
    }
  }

  // ── رسم الـ UI ────────────────────────────────────────────────────────────
  function _render(container) {
    const s  = _settings;
    const ac = _acSettings || {};
    const workDays = Array.isArray(s.work_days) ? s.work_days : [1,2,3,4,5];

    container.innerHTML = _buildHTML(s, ac);
    _bindEvents(container);
    _updateStatusPreview();
    _bindAutoCloseEvents(container);
  }

  function _buildHTML(s, ac) {
    return `
      <div class="iv4-auto-sections">

        <!-- ══ Welcome Message ══ -->
        <section class="iv4-auto-section">
          <div class="iv4-auto-section-header">
            <div class="iv4-auto-section-title">
              <span>👋</span>
              <div>
                <strong>رسالة الترحيب</strong>
                <p>تُرسَل تلقائياً عند بدء أي محادثة جديدة</p>
              </div>
            </div>
            <label class="iv4-auto-toggle-wrap">
              <input type="checkbox" id="iv4-auto-welcome-active" ${s.welcome_active ? 'checked' : ''}>
              <span class="iv4-auto-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-auto-section-body" id="iv4-welcome-body" ${!s.welcome_active ? 'style="display:none"' : ''}>
            <div class="iv4-auto-form-row">
              <label>نص رسالة الترحيب</label>
              <textarea id="iv4-auto-welcome-msg" class="iv4-auto-textarea" rows="4"
                placeholder="مثال: مرحباً بك! سعداء بتواصلك معنا 😊 سيرد عليك أحد موظفينا قريباً."
              >${_esc(s.welcome_message || '')}</textarea>
              <div class="iv4-auto-hint">
                يمكنك استخدام: <code>{name}</code> لاسم العميل، <code>{platform}</code> للمنصة
              </div>
            </div>
          </div>
        </section>

        <!-- ══ Away Message ══ -->
        <section class="iv4-auto-section">
          <div class="iv4-auto-section-header">
            <div class="iv4-auto-section-title">
              <span>🌙</span>
              <div>
                <strong>رسالة الغياب</strong>
                <p>تُرسَل خارج ساعات العمل</p>
              </div>
            </div>
            <label class="iv4-auto-toggle-wrap">
              <input type="checkbox" id="iv4-auto-away-active" ${s.away_active ? 'checked' : ''}>
              <span class="iv4-auto-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-auto-section-body" id="iv4-away-body" ${!s.away_active ? 'style="display:none"' : ''}>

            <div class="iv4-auto-form-row">
              <label>نص رسالة الغياب</label>
              <textarea id="iv4-auto-away-msg" class="iv4-auto-textarea" rows="4"
                placeholder="مثال: شكراً لتواصلك 🙏 ساعات عملنا من 9 صباحاً حتى 10 مساءً. سيتم الرد عليك خلال ساعات العمل."
              >${_esc(s.away_message || '')}</textarea>
            </div>

            <div class="iv4-auto-form-row">
              <label>وضع الغياب</label>
              <div class="iv4-auto-radio-group">
                <label class="iv4-auto-radio">
                  <input type="radio" name="away-mode" value="schedule" ${s.away_mode !== 'always' ? 'checked' : ''}>
                  <span>📅 حسب الجدول (أيام + وقت)</span>
                </label>
                <label class="iv4-auto-radio">
                  <input type="radio" name="away-mode" value="always" ${s.away_mode === 'always' ? 'checked' : ''}>
                  <span>🔕 دائماً في وضع الغياب</span>
                </label>
              </div>
            </div>

            <div id="iv4-schedule-section" ${s.away_mode === 'always' ? 'style="display:none"' : ''}>

              <!-- أيام العمل -->
              <div class="iv4-auto-form-row">
                <label>أيام العمل</label>
                <div class="iv4-auto-days">
                  ${DAY_LABELS.map((d, i) => `
                    <label class="iv4-auto-day ${workDays.includes(i) ? 'iv4-auto-day--active' : ''}">
                      <input type="checkbox" name="work-day" value="${i}" ${workDays.includes(i) ? 'checked' : ''}>
                      <span>${d}</span>
                    </label>`).join('')}
                </div>
              </div>

              <!-- ساعات العمل -->
              <div class="iv4-auto-hours-row">
                <div class="iv4-auto-form-row">
                  <label>بداية الغياب</label>
                  <input type="time" id="iv4-auto-away-start" class="iv4-auto-input"
                    value="${_esc(s.away_start || '22:00')}">
                </div>
                <div class="iv4-auto-hours-sep">→</div>
                <div class="iv4-auto-form-row">
                  <label>نهاية الغياب</label>
                  <input type="time" id="iv4-auto-away-end" class="iv4-auto-input"
                    value="${_esc(s.away_end || '09:00')}">
                </div>
              </div>
              <div class="iv4-auto-hint">مثال: 22:00 → 09:00 يعني الغياب من 10م حتى 9ص</div>

              <!-- Timezone -->
              <div class="iv4-auto-form-row">
                <label>المنطقة الزمنية</label>
                <select id="iv4-auto-tz" class="iv4-auto-select">
                  ${TIMEZONES.map(tz =>
                    `<option value="${tz.value}" ${s.timezone === tz.value ? 'selected' : ''}>${_esc(tz.label)}</option>`
                  ).join('')}
                </select>
              </div>

              <!-- معاينة الوضع الحالي -->
              <div class="iv4-auto-status-preview" id="iv4-auto-status-preview">
                <span class="iv4-auto-status-dot" id="iv4-auto-status-dot"></span>
                <span id="iv4-auto-status-text">جاري التحقق…</span>
              </div>

            </div>
          </div>
        </section>


        <!-- ══ Auto-Close ══ -->
        <section class="iv4-auto-section">
          <div class="iv4-auto-section-header">
            <div class="iv4-auto-section-title">
              <span>🔒</span>
              <div>
                <strong>الإغلاق التلقائي</strong>
                <p>إغلاق المحادثات الخاملة بعد مدة محددة</p>
              </div>
            </div>
            <label class="iv4-auto-toggle-wrap">
              <input type="checkbox" id="iv4-ac-enabled" ${ac.enabled ? 'checked' : ''}>
              <span class="iv4-auto-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-auto-section-body" id="iv4-ac-body" ${!ac.enabled ? 'style="display:none"' : ''}>

            <!-- وقت الخمول -->
            <div class="iv4-auto-form-row">
              <label>إغلاق المحادثة بعد خمول</label>
              <div class="iv4-ac-duration-row">
                <input type="number" id="iv4-ac-idle" class="iv4-auto-input iv4-ac-num-input"
                  min="30" max="43200" value="${ac.idle_minutes || 1440}" placeholder="1440">
                <span class="iv4-ac-unit">دقيقة</span>
                <span class="iv4-ac-hint-inline" id="iv4-ac-idle-hint">${_minutesToHuman(ac.idle_minutes || 1440)}</span>
              </div>
            </div>

            <!-- حالات المحادثة المستهدفة -->
            <div class="iv4-auto-form-row">
              <label>تطبيق على المحادثات بحالة</label>
              <div class="iv4-ac-checks">
                <label class="iv4-ac-check">
                  <input type="checkbox" name="ac-status" value="open" ${(ac.status_filter||[]).includes('open')?'checked':''}>
                  <span>🟢 مفتوحة</span>
                </label>
                <label class="iv4-ac-check">
                  <input type="checkbox" name="ac-status" value="waiting" ${(ac.status_filter||[]).includes('waiting')?'checked':''}>
                  <span>🟡 في الانتظار</span>
                </label>
              </div>
            </div>

            <!-- رسالة الإغلاق -->
            <div class="iv4-auto-form-row">
              <label>
                <input type="checkbox" id="iv4-ac-send-close" ${ac.send_close_msg ? 'checked' : ''}>
                إرسال رسالة عند الإغلاق (اختياري)
              </label>
              <textarea id="iv4-ac-close-msg" class="iv4-auto-textarea" rows="2"
                ${!ac.send_close_msg ? 'style="display:none"' : ''}
                placeholder="مثال: تم إغلاق المحادثة بسبب عدم النشاط. يمكنك التواصل معنا في أي وقت 😊"
              >${_esc(ac.close_message || '')}</textarea>
            </div>

            <!-- تحذير قبل الإغلاق -->
            <div class="iv4-auto-form-row">
              <label>
                <input type="checkbox" id="iv4-ac-send-warn" ${ac.send_warning ? 'checked' : ''}>
                إرسال تحذير قبل الإغلاق
              </label>
            </div>
            <div id="iv4-ac-warn-body" ${!ac.send_warning ? 'style="display:none"' : ''}>
              <div class="iv4-auto-form-row">
                <label>إرسال التحذير قبل الإغلاق بـ</label>
                <div class="iv4-ac-duration-row">
                  <input type="number" id="iv4-ac-warn-min" class="iv4-auto-input iv4-ac-num-input"
                    min="5" max="1440" value="${ac.warning_minutes || 60}" placeholder="60">
                  <span class="iv4-ac-unit">دقيقة</span>
                  <span class="iv4-ac-hint-inline" id="iv4-ac-warn-hint">${_minutesToHuman(ac.warning_minutes || 60)}</span>
                </div>
              </div>
              <div class="iv4-auto-form-row">
                <label>نص رسالة التحذير</label>
                <textarea id="iv4-ac-warn-msg" class="iv4-auto-textarea" rows="2"
                  placeholder="مثال: سيتم إغلاق محادثتك خلال ساعة لعدم النشاط. هل تحتاج مساعدة؟"
                >${_esc(ac.warning_message || '')}</textarea>
              </div>
            </div>

            <!-- Run Manual -->
            <div class="iv4-ac-run-row">
              <button class="iv4-auto-btn iv4-ac-run-btn" id="iv4-ac-run-now">▶ تشغيل الآن</button>
              <span class="iv4-ac-run-result" id="iv4-ac-run-result"></span>
            </div>

          </div>
        </section>

      </div>

      <!-- Footer -->
      <div class="iv4-auto-footer">
        <div class="iv4-auto-footer-info" id="iv4-auto-last-saved">
          ${s.updated_at ? `آخر حفظ: ${new Date(s.updated_at * 1000).toLocaleString('ar-EG')}` : ''}
        </div>
        <button class="iv4-auto-btn iv4-auto-btn--primary" id="iv4-auto-save">💾 حفظ الإعدادات</button>
      </div>
    `;
  }

  // ── ربط الأحداث ───────────────────────────────────────────────────────────
  function _bindEvents(container) {
    // Toggle Welcome
    const welcomeToggle = container.querySelector('#iv4-auto-welcome-active');
    if (welcomeToggle) {
      welcomeToggle.onchange = e => {
        const body = document.getElementById('iv4-welcome-body');
        if (body) body.style.display = e.target.checked ? '' : 'none';
      };
    }

    // Toggle Away
    const awayToggle = container.querySelector('#iv4-auto-away-active');
    if (awayToggle) {
      awayToggle.onchange = e => {
        const body = document.getElementById('iv4-away-body');
        if (body) body.style.display = e.target.checked ? '' : 'none';
      };
    }

    // Away Mode radios
    container.querySelectorAll('input[name="away-mode"]').forEach(r => {
      r.onchange = e => {
        const schedSection = document.getElementById('iv4-schedule-section');
        if (schedSection) schedSection.style.display = e.target.value === 'always' ? 'none' : '';
        _updateStatusPreview();
      };
    });

    // Work day checkboxes — تحديث الـ active class
    container.querySelectorAll('input[name="work-day"]').forEach(cb => {
      cb.onchange = () => {
        const label = cb.closest('.iv4-auto-day');
        if (label) label.classList.toggle('iv4-auto-day--active', cb.checked);
        _updateStatusPreview();
      };
    });

    // Time inputs
    ['iv4-auto-away-start', 'iv4-auto-away-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onchange = _updateStatusPreview;
    });

    // Save
    const saveBtn = container.querySelector('#iv4-auto-save');
    if (saveBtn) saveBtn.onclick = () => _saveAll();
  }

  // ── معاينة الحالة الحالية ─────────────────────────────────────────────────
  function _updateStatusPreview() {
    const dot  = document.getElementById('iv4-auto-status-dot');
    const text = document.getElementById('iv4-auto-status-text');
    if (!dot || !text) return;

    const modeEl = document.querySelector('input[name="away-mode"]:checked');
    if (!modeEl) return;

    if (modeEl.value === 'always') {
      dot.style.background  = '#f59e0b';
      text.textContent      = '🌙 دائماً في وضع الغياب';
      return;
    }

    // حساب الوضع الحالي محلياً
    const now = new Date();
    const h   = now.getHours();
    const m   = now.getMinutes();
    const cur = h * 60 + m;
    const day = now.getDay();

    const checkedDays = Array.from(document.querySelectorAll('input[name="work-day"]:checked'))
      .map(x => parseInt(x.value));

    const startEl = document.getElementById('iv4-auto-away-start');
    const endEl   = document.getElementById('iv4-auto-away-end');
    const startVal = (startEl?.value || '22:00').split(':').map(Number);
    const endVal   = (endEl?.value   || '09:00').split(':').map(Number);
    const startMin = startVal[0] * 60 + startVal[1];
    const endMin   = endVal[0]   * 60 + endVal[1];

    const inAwayTime = startMin > endMin
      ? (cur >= startMin || cur < endMin)
      : (cur >= startMin && cur < endMin);

    const isWorkDay = checkedDays.includes(day);
    const isAway    = !isWorkDay || inAwayTime;

    dot.style.background  = isAway ? '#f59e0b' : '#10b981';
    text.textContent      = isAway
      ? '🌙 الوضع الحالي: غياب (سترسل رسالة الغياب)'
      : '✅ الوضع الحالي: عمل (لن ترسل رسالة الغياب)';
  }

  // ── حفظ الإعدادات ─────────────────────────────────────────────────────────
  async function _save() {
    const btn = document.getElementById('iv4-auto-save');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ…'; }

    try {
      const welcomeActive = document.getElementById('iv4-auto-welcome-active')?.checked || false;
      const welcomeMsg    = document.getElementById('iv4-auto-welcome-msg')?.value.trim() || '';
      const awayActive    = document.getElementById('iv4-auto-away-active')?.checked   || false;
      const awayMsg       = document.getElementById('iv4-auto-away-msg')?.value.trim()  || '';
      const awayStart     = document.getElementById('iv4-auto-away-start')?.value       || '22:00';
      const awayEnd       = document.getElementById('iv4-auto-away-end')?.value         || '09:00';
      const timezone      = document.getElementById('iv4-auto-tz')?.value               || 'Africa/Cairo';
      const awayMode      = document.querySelector('input[name="away-mode"]:checked')?.value || 'schedule';

      const workDays = Array.from(document.querySelectorAll('input[name="work-day"]:checked'))
        .map(x => parseInt(x.value));

      const data = await InboxAPI.welcomeAway.update({
        welcome_active  : welcomeActive,
        welcome_message : welcomeMsg,
        away_active     : awayActive,
        away_message    : awayMsg,
        away_start      : awayStart,
        away_end        : awayEnd,
        timezone,
        work_days       : workDays,
        away_mode       : awayMode,
      });

      _settings = data.settings || _settings;
      _showToast('✅ تم حفظ الإعدادات بنجاح');

      // تحديث "آخر حفظ"
      const info = document.getElementById('iv4-auto-last-saved');
      if (info && _settings.updated_at) {
        info.textContent = `آخر حفظ: ${new Date(_settings.updated_at * 1000).toLocaleString('ar-EG')}`;
      }

    } catch (err) {
      _showToast('❌ خطأ في الحفظ: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الإعدادات'; }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _removeOverlay() {
    document.getElementById('iv4-automation-overlay')?.remove();
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'iv4-auto-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('iv4-auto-toast--show'), 10);
    setTimeout(() => { t.classList.remove('iv4-auto-toast--show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ── _minutesToHuman — تحويل الدقائق لنص مقروء ─────────────────────────────
  function _minutesToHuman(min) {
    min = parseInt(min) || 0;
    if (min < 60)   return `${min} دقيقة`;
    if (min < 1440) return `${(min/60).toFixed(min%60===0?0:1)} ساعة`;
    return `${(min/1440).toFixed(min%1440===0?0:1)} يوم`;
  }

  // ── _bindAutoCloseEvents ──────────────────────────────────────────────
  function _bindAutoCloseEvents(container) {
    // Toggle enabled
    const enabledCb = container.querySelector('#iv4-ac-enabled');
    if (enabledCb) {
      enabledCb.onchange = e => {
        const body = document.getElementById('iv4-ac-body');
        if (body) body.style.display = e.target.checked ? '' : 'none';
      };
    }

    // Toggle send close message
    const sendCloseCb = container.querySelector('#iv4-ac-send-close');
    if (sendCloseCb) {
      sendCloseCb.onchange = e => {
        const msg = document.getElementById('iv4-ac-close-msg');
        if (msg) msg.style.display = e.target.checked ? '' : 'none';
      };
    }

    // Toggle warning
    const sendWarnCb = container.querySelector('#iv4-ac-send-warn');
    if (sendWarnCb) {
      sendWarnCb.onchange = e => {
        const body = document.getElementById('iv4-ac-warn-body');
        if (body) body.style.display = e.target.checked ? '' : 'none';
      };
    }

    // Live hint for idle minutes
    const idleInput = container.querySelector('#iv4-ac-idle');
    if (idleInput) {
      idleInput.oninput = () => {
        const hint = document.getElementById('iv4-ac-idle-hint');
        if (hint) hint.textContent = _minutesToHuman(idleInput.value);
      };
    }

    // Live hint for warning minutes
    const warnInput = container.querySelector('#iv4-ac-warn-min');
    if (warnInput) {
      warnInput.oninput = () => {
        const hint = document.getElementById('iv4-ac-warn-hint');
        if (hint) hint.textContent = _minutesToHuman(warnInput.value);
      };
    }

    // Run now
    const runBtn = container.querySelector('#iv4-ac-run-now');
    if (runBtn) {
      runBtn.onclick = async () => {
        runBtn.disabled = true;
        runBtn.textContent = 'جاري التشغيل…';
        const result = document.getElementById('iv4-ac-run-result');
        try {
          const data = await InboxAPI.autoClose.run();
          if (result) result.textContent = `✅ تم تحذير ${data.warned || 0} وإغلاق ${data.closed || 0} محادثة`;
        } catch (err) {
          if (result) result.textContent = '❌ ' + err.message;
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = '▶ تشغيل الآن';
        }
      };
    }
  }

  // ── تحديث _save ليشمل auto-close ─────────────────────────────────
  // (تم تعديل _save بال monkey-patch أدناه)
  const _saveOriginal = _save;
  async function _saveAll() {
    // حفظ Welcome/Away
    await _saveOriginal();
    // حفظ Auto-Close
    try {
      const acEnabled    = document.getElementById('iv4-ac-enabled')?.checked    || false;
      const acIdle       = parseInt(document.getElementById('iv4-ac-idle')?.value)    || 1440;
      const acStatuses   = Array.from(document.querySelectorAll('input[name="ac-status"]:checked')).map(x => x.value);
      const acSendClose  = document.getElementById('iv4-ac-send-close')?.checked  || false;
      const acCloseMsg   = document.getElementById('iv4-ac-close-msg')?.value.trim()  || '';
      const acSendWarn   = document.getElementById('iv4-ac-send-warn')?.checked   || false;
      const acWarnMin    = parseInt(document.getElementById('iv4-ac-warn-min')?.value) || 60;
      const acWarnMsg    = document.getElementById('iv4-ac-warn-msg')?.value.trim()    || '';

      await InboxAPI.autoClose.update({
        enabled        : acEnabled,
        idle_minutes   : acIdle,
        status_filter  : acStatuses.length ? acStatuses : ['open'],
        send_close_msg : acSendClose,
        close_message  : acCloseMsg,
        send_warning   : acSendWarn,
        warning_minutes: acWarnMin,
        warning_message: acWarnMsg,
      });
    } catch (err) {
      _showToast('❌ خطأ في حفظ Auto-Close: ' + err.message);
    }
  }

  return { init, open };
})();


// ══════════════════════════════════════════════════════════════════════════════
// P8-5 InboxWebhooks — إدارة Webhook Triggers
// ══════════════════════════════════════════════════════════════════════════════

/* global InboxAPI */

const InboxWebhooks = (() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let _webhooks  = [];
  let _events    = [];
  let _editId    = null; // null = إضافة جديدة

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="open-webhooks"]')) open();
    });
  }

  // ── فتح الـ Panel ───────────────────────────────────────────────────────
  async function open() {
    _removePanel();

    const panel = document.createElement('div');
    panel.id = 'iv4-wh-panel';
    panel.innerHTML = `
      <div class="iv4-wh-overlay">
        <div class="iv4-wh-container">
          <div class="iv4-wh-header">
            <h2>⚡ Webhook Triggers</h2>
            <button class="iv4-wh-close" id="iv4-wh-close">✕</button>
          </div>
          <div class="iv4-wh-body" id="iv4-wh-body">
            <div class="iv4-wh-loading">جاري التحميل…</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#iv4-wh-close').onclick = _removePanel;
    panel.querySelector('.iv4-wh-overlay').addEventListener('click', e => {
      if (e.target.classList.contains('iv4-wh-overlay')) _removePanel();
    });

    await _loadAndRender();
  }

  // ── جلب + عرض ──────────────────────────────────────────────────────────
  async function _loadAndRender() {
    const body = document.getElementById('iv4-wh-body');
    if (!body) return;
    try {
      const [whData, evData] = await Promise.all([
        InboxAPI.webhooks.list(),
        InboxAPI.webhooks.events(),
      ]);
      _webhooks = whData.webhooks  || [];
      _events   = evData.events    || [];
      _renderList(body);
    } catch (err) {
      body.innerHTML = `<div class="iv4-wh-error">خطأ: ${_esc(err.message)}</div>`;
    }
  }

  // ── عرض القائمة ──────────────────────────────────────────────────────
  function _renderList(container) {
    container.innerHTML = `
      <div class="iv4-wh-list-header">
        <p class="iv4-wh-desc">
          اربط النظام بأنظمتك الخارجية — سيرسل Areej Inbox طلب HTTP POST للـ URL المحدد عند كل حدث
        </p>
        <button class="iv4-wh-btn iv4-wh-btn--primary" id="iv4-wh-add-btn">➕ إضافة Webhook</button>
      </div>

      ${_webhooks.length === 0
        ? '<div class="iv4-wh-empty">لا توجد webhooks حتى الآن. أضف واحداً للبدء ️</div>'
        : `<div class="iv4-wh-cards">${_webhooks.map(_buildCard).join('')}</div>`
      }
    `;

    // أحداث
    container.querySelector('#iv4-wh-add-btn').onclick = () => _openForm(null);

    container.querySelectorAll('.iv4-wh-card-edit').forEach(btn => {
      btn.onclick = () => _openForm(btn.dataset.id);
    });
    container.querySelectorAll('.iv4-wh-card-delete').forEach(btn => {
      btn.onclick = () => _delete(btn.dataset.id);
    });
    container.querySelectorAll('.iv4-wh-card-toggle').forEach(btn => {
      btn.onclick = () => _toggle(btn.dataset.id);
    });
    container.querySelectorAll('.iv4-wh-card-test').forEach(btn => {
      btn.onclick = () => _testWebhook(btn.dataset.id);
    });
    container.querySelectorAll('.iv4-wh-card-logs').forEach(btn => {
      btn.onclick = () => _openLogs(btn.dataset.id);
    });
  }

  // ── بناء بطاقة webhook ───────────────────────────────────────────────────
  function _buildCard(wh) {
    const statusClass = wh.is_active ? 'iv4-wh-status--on' : 'iv4-wh-status--off';
    const statusLabel = wh.is_active ? 'فعّال' : 'معطّل';
    const lastTrig    = wh.last_triggered_at_iso
      ? new Date(wh.last_triggered_at_iso).toLocaleString('ar-EG')
      : 'لم يُشغّل بعد';
    const events      = (wh.events || []).length > 0
      ? wh.events.join(' · ')
      : 'كل الأحداث';
    const lastStatus  = wh.last_status
      ? (wh.last_status === 'ok'
          ? '<span class="iv4-wh-ok">✅ OK</span>'
          : `<span class="iv4-wh-fail">❌ ${_esc(wh.last_status)}</span>`)
      : '';

    return `
      <div class="iv4-wh-card ${wh.is_active ? '' : 'iv4-wh-card--off'}" data-id="${wh.id}">
        <div class="iv4-wh-card-top">
          <div class="iv4-wh-card-info">
            <div class="iv4-wh-card-name">${_esc(wh.name)}</div>
            <div class="iv4-wh-card-url" title="${_esc(wh.url)}">${_esc(_truncateUrl(wh.url))}</div>
            <div class="iv4-wh-card-events">️أحداث: ${_esc(events)}</div>
          </div>
          <div class="iv4-wh-card-meta">
            <span class="iv4-wh-status ${statusClass}">${statusLabel}</span>
            ${lastStatus}
          </div>
        </div>
        <div class="iv4-wh-card-bottom">
          <span class="iv4-wh-card-trig">آخر تشغيل: ${_esc(lastTrig)}</span>
          <div class="iv4-wh-card-actions">
            <button class="iv4-wh-btn iv4-wh-btn--sm iv4-wh-card-test"   data-id="${wh.id}">️اختبار</button>
            <button class="iv4-wh-btn iv4-wh-btn--sm iv4-wh-card-logs"   data-id="${wh.id}">📜 سجل</button>
            <button class="iv4-wh-btn iv4-wh-btn--sm iv4-wh-card-toggle" data-id="${wh.id}">${wh.is_active ? '⏸ إيقاف' : '▶ تفعيل'}</button>
            <button class="iv4-wh-btn iv4-wh-btn--sm iv4-wh-card-edit"   data-id="${wh.id}">✏️ تعديل</button>
            <button class="iv4-wh-btn iv4-wh-btn--sm iv4-wh-btn--danger iv4-wh-card-delete" data-id="${wh.id}">🗑️</button>
          </div>
        </div>
      </div>`;
  }

  // ── فورم إضافة / تعديل ─────────────────────────────────────────────────
  function _openForm(id) {
    _editId     = id || null;
    const body  = document.getElementById('iv4-wh-body');
    if (!body) return;

    const wh = id ? _webhooks.find(w => String(w.id) === String(id)) : null;
    const checkedEvents = wh ? (wh.events || []) : [];

    body.innerHTML = `
      <div class="iv4-wh-form">
        <h3>${wh ? 'تعديل Webhook' : 'Webhook جديد'}</h3>

        <div class="iv4-wh-form-row">
          <label>الاسم</label>
          <input type="text" id="iv4-wh-name" class="iv4-wh-input"
            placeholder="مثال: Zapier CRM Sync"
            value="${_esc(wh?.name || '')}">
        </div>

        <div class="iv4-wh-form-row">
          <label>URL (HTTPS)</label>
          <input type="url" id="iv4-wh-url" class="iv4-wh-input"
            placeholder="https://hooks.zapier.com/..."
            value="${_esc(wh?.url || '')}">
        </div>

        <div class="iv4-wh-form-row">
          <label>Secret (اختياري) — HMAC-SHA256</label>
          <input type="text" id="iv4-wh-secret" class="iv4-wh-input"
            placeholder="اتركه فارغاً إذا لم تحتاج تحقق التوقيع"
            value="${_esc(wh?.secret || '')}">
          <div class="iv4-wh-hint">سيصلك header: <code>X-Areej-Signature: sha256=...</code></div>
        </div>

        <div class="iv4-wh-form-row">
          <label>الأحداث</label>
          <div class="iv4-wh-events-grid" id="iv4-wh-events-grid">
            ${_events.map(ev => `
              <label class="iv4-wh-ev-label">
                <input type="checkbox" class="iv4-wh-ev-cb" value="${_esc(ev.key)}"
                  ${checkedEvents.includes(ev.key) ? 'checked' : ''}>
                <span>${_esc(ev.label)}</span>
                <small class="iv4-wh-ev-key">${_esc(ev.key)}</small>
              </label>`).join('')}
          </div>
          <button class="iv4-wh-btn iv4-wh-btn--xs" id="iv4-wh-ev-all">تحديد الكل</button>
          <button class="iv4-wh-btn iv4-wh-btn--xs" id="iv4-wh-ev-none">إلغاء الكل</button>
        </div>

        <div class="iv4-wh-form-row">
          <label>عدد المحاولات عند الفشل</label>
          <input type="number" id="iv4-wh-retry" class="iv4-wh-input iv4-wh-input--sm"
            min="1" max="10" value="${wh?.retry_count || 3}">
          <div class="iv4-wh-hint">exponential backoff: 1s, 2s, 4s, 8s…</div>
        </div>

        <div class="iv4-wh-form-footer">
          <button class="iv4-wh-btn" id="iv4-wh-back">← رجوع</button>
          <button class="iv4-wh-btn iv4-wh-btn--primary" id="iv4-wh-save">💾 حفظ</button>
        </div>
        <div class="iv4-wh-form-error" id="iv4-wh-form-error" style="display:none"></div>
      </div>`;

    // أحداث
    body.querySelector('#iv4-wh-back').onclick = () => _loadAndRender();
    body.querySelector('#iv4-wh-save').onclick = () => _save();
    body.querySelector('#iv4-wh-ev-all').onclick  = () =>
      body.querySelectorAll('.iv4-wh-ev-cb').forEach(cb => { cb.checked = true; });
    body.querySelector('#iv4-wh-ev-none').onclick = () =>
      body.querySelectorAll('.iv4-wh-ev-cb').forEach(cb => { cb.checked = false; });
  }

  // ── حفظ ─────────────────────────────────────────────────────────────────
  async function _save() {
    const name        = document.getElementById('iv4-wh-name')?.value.trim();
    const url         = document.getElementById('iv4-wh-url')?.value.trim();
    const secret      = document.getElementById('iv4-wh-secret')?.value.trim();
    const retry_count = parseInt(document.getElementById('iv4-wh-retry')?.value) || 3;
    const events      = Array.from(document.querySelectorAll('.iv4-wh-ev-cb:checked')).map(cb => cb.value);

    const errEl = document.getElementById('iv4-wh-form-error');
    const _showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
    const _hideErr = ()  => { if (errEl) errEl.style.display = 'none'; };

    if (!name)             return _showErr('الاسم مطلوب');
    if (!url)              return _showErr('URL مطلوب');
    if (events.length === 0) return _showErr('اختر حدثاً واحداً على الأقل');
    _hideErr();

    const saveBtn = document.getElementById('iv4-wh-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'جاري الحفظ…'; }

    try {
      const data = { name, url, secret: secret || null, events, retry_count };
      if (_editId) {
        await InboxAPI.webhooks.update(_editId, data);
      } else {
        await InboxAPI.webhooks.create(data);
      }
      _showToast(_editId ? '✅ تم تحديث الـ webhook' : '✅ تم إنشاء الـ webhook');
      await _loadAndRender();
    } catch (err) {
      _showErr('خطأ: ' + err.message);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ'; }
    }
  }

  // ── حذف ──────────────────────────────────────────────────────────────
  async function _delete(id) {
    const wh = _webhooks.find(w => String(w.id) === String(id));
    if (!wh) return;
    if (!confirm(`حذف webhook «${wh.name}» نهائياً؟`)) return;
    try {
      await InboxAPI.webhooks.delete(id);
      _showToast('🗑️ تم الحذف');
      await _loadAndRender();
    } catch (err) {
      _showToast('❌ خطأ: ' + err.message);
    }
  }

  // ── toggle ────────────────────────────────────────────────────────────
  async function _toggle(id) {
    try {
      const data = await InboxAPI.webhooks.toggle(id);
      const wh   = _webhooks.find(w => String(w.id) === String(id));
      if (wh) wh.is_active = data.is_active;
      const body = document.getElementById('iv4-wh-body');
      if (body) _renderList(body);
    } catch (err) {
      _showToast('❌ ' + err.message);
    }
  }

  // ── اختبار الـ webhook ─────────────────────────────────────────────────
  async function _testWebhook(id) {
    const wh = _webhooks.find(w => String(w.id) === String(id));
    if (!wh) return;

    _showToast(`📬 جاري إرسال ping لـ ${_truncateUrl(wh.url)}…`);
    try {
      const res = await InboxAPI.webhooks.test(id);
      if (res.ok) {
        _showToast(`✅ Ping نجح — HTTP ${res.status_code}`);
      } else {
        _showToast(`❌ فشل — ${res.error || 'HTTP ' + res.status_code}`);
      }
    } catch (err) {
      _showToast('❌ ' + err.message);
    }
  }

  // ── سجل المحاولات ───────────────────────────────────────────────────
  async function _openLogs(id) {
    const wh   = _webhooks.find(w => String(w.id) === String(id));
    const body = document.getElementById('iv4-wh-body');
    if (!body) return;

    body.innerHTML = `<div class="iv4-wh-loading">جاري جلب السجل…</div>`;
    try {
      const data = await InboxAPI.webhooks.logs(id, 30);
      const logs = data.logs || [];

      body.innerHTML = `
        <div class="iv4-wh-logs-header">
          <h3>📜 سجل المحاولات — ${_esc(wh?.name || id)}</h3>
          <button class="iv4-wh-btn" id="iv4-wh-logs-back">← رجوع</button>
        </div>
        ${logs.length === 0
          ? '<div class="iv4-wh-empty">لا توجد محاولات بعد</div>'
          : `<table class="iv4-wh-logs-table">
              <thead><tr><th>وقت</th><th>حدث</th><th>محاولة</th><th>كود</th><th>حالة</th></tr></thead>
              <tbody>
                ${logs.map(l => `
                  <tr class="${l.success ? '' : 'iv4-wh-log-fail'}">
                    <td>${new Date(l.fired_at * 1000).toLocaleString('ar-EG')}</td>
                    <td><code>${_esc(l.event)}</code></td>
                    <td>${l.attempt}</td>
                    <td>${l.status_code || '-'}</td>
                    <td>${l.success ? '✅' : '❌ ' + _esc(l.error_msg || '')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`
        }`;

      body.querySelector('#iv4-wh-logs-back').onclick = () => _loadAndRender();
    } catch (err) {
      body.innerHTML = `<div class="iv4-wh-error">خطأ: ${_esc(err.message)}</div>`;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function _removePanel() {
    document.getElementById('iv4-wh-panel')?.remove();
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _truncateUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const path = u.pathname.length > 20 ? u.pathname.slice(0,18) + '…' : u.pathname;
      return u.hostname + path;
    } catch (_) {
      return url.length > 40 ? url.slice(0,38) + '…' : url;
    }
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className   = 'iv4-auto-toast'; // نفس CSS الـ automation overlay
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('iv4-auto-toast--show'), 10);
    setTimeout(() => { t.classList.remove('iv4-auto-toast--show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  return { init, open };
})();
