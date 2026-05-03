/**
 * automation.js — Welcome + Away Messages UI لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P4-3 Welcome + Away Messages)
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
  let _settings = null;

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
      const data = await InboxAPI.welcomeAway.get();
      _settings  = data.settings || {};
      _render(body);
    } catch (err) {
      body.innerHTML = `<div class="iv4-auto-error">خطأ: ${_esc(err.message)}</div>`;
    }
  }

  // ── رسم الـ UI ────────────────────────────────────────────────────────────
  function _render(container) {
    const s = _settings;
    const workDays = Array.isArray(s.work_days) ? s.work_days : [1,2,3,4,5];

    container.innerHTML = `
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

      </div>

      <!-- Footer -->
      <div class="iv4-auto-footer">
        <div class="iv4-auto-footer-info" id="iv4-auto-last-saved">
          ${s.updated_at ? `آخر حفظ: ${new Date(s.updated_at * 1000).toLocaleString('ar-EG')}` : ''}
        </div>
        <button class="iv4-auto-btn iv4-auto-btn--primary" id="iv4-auto-save">💾 حفظ الإعدادات</button>
      </div>
    `;

    _bindEvents(container);
    _updateStatusPreview();
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
    if (saveBtn) saveBtn.onclick = _save;
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

  return { init, open };
})();
