/**
 * org.js — قسم إعدادات المؤسسة (M2 T44)
 * يتضمن: بيانات الشركة + ساعات العمل
 *
 * آخر تحديث: 2026-05-04 (M2 T44)
 */

'use strict';

const SettingsOrg = (() => {

  let _container = null;

  // ─────────────────────────────────────────────────────────────
  // mount / unmount
  // ─────────────────────────────────────────────────────────────

  async function mount(container, params = {}) {
    _container = container;
    _container.innerHTML = '<div class="iv4-set-loading">جارٍ التحميل…</div>';
    try {
      const [orgRes, hoursRes] = await Promise.all([
        InboxAPI.settings.getOrg(),
        InboxAPI.settings.getHours(),
      ]);
      // InboxAPI يرجع { data, error } — نستخرج من .data
      const org   = orgRes.data?.org   || {};
      const hours = hoursRes.data?.config || {};
      const days  = hoursRes.data?.days   || [];
      _render(org, hours, days);
    } catch (err) {
      _container.innerHTML = `<div class="iv4-set-error">خطأ في التحميل: ${err.message}</div>`;
    }
  }

  function unmount() { _container = null; }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  function _render(org, hours, days) {
    if (!_container) return;

    const daysHtml = days.map(d => `
      <tr class="iv4-biz-day-row">
        <td><label>
          <input type="checkbox" class="iv4-biz-day-active" data-day="${d.day_of_week}"
            ${d.is_working ? 'checked' : ''}> ${DAY_NAMES[d.day_of_week]}
        </label></td>
        <td>
          <input type="time" class="iv4-inp iv4-biz-start" data-day="${d.day_of_week}"
            value="${d.start_time || '09:00'}" ${!d.is_working ? 'disabled' : ''}>
        </td>
        <td>
          <input type="time" class="iv4-inp iv4-biz-end" data-day="${d.day_of_week}"
            value="${d.end_time || '17:00'}" ${!d.is_working ? 'disabled' : ''}>
        </td>
      </tr>
    `).join('');

    _container.innerHTML = `
      <div class="iv4-set-section">
        <h2 class="iv4-set-section-title">🏢 بيانات المؤسسة</h2>
        <form id="iv4-org-form" class="iv4-set-form">
          <div class="iv4-set-row">
            <label class="iv4-set-label">اسم الشركة (عربي)</label>
            <input class="iv4-inp" name="company_name" value="${_esc(org.company_name||'')}">
          </div>
          <div class="iv4-set-row">
            <label class="iv4-set-label">اسم الشركة (إنجليزي)</label>
            <input class="iv4-inp" name="company_name_en" value="${_esc(org.company_name_en||'')}">
          </div>
          <div class="iv4-set-row">
            <label class="iv4-set-label">البريد الإلكتروني</label>
            <input class="iv4-inp" type="email" name="email" value="${_esc(org.email||'')}">
          </div>
          <div class="iv4-set-row">
            <label class="iv4-set-label">رقم الهاتف</label>
            <input class="iv4-inp" name="phone" value="${_esc(org.phone||'')}">
          </div>
          <div class="iv4-set-row">
            <label class="iv4-set-label">الموقع الإلكتروني</label>
            <input class="iv4-inp" name="website" value="${_esc(org.website||'')}">
          </div>
          <div class="iv4-set-row">
            <label class="iv4-set-label">العنوان</label>
            <input class="iv4-inp" name="address" value="${_esc(org.address||'')}">
          </div>
          <div class="iv4-set-actions">
            <button type="submit" class="iv4-btn iv4-btn-primary">💾 حفظ البيانات</button>
            <span class="iv4-set-msg" id="iv4-org-msg"></span>
          </div>
        </form>
      </div>

      <div class="iv4-set-section">
        <h2 class="iv4-set-section-title">⏰ ساعات العمل</h2>
        <div class="iv4-set-row iv4-set-row-inline">
          <label class="iv4-set-label">تفعيل ساعات العمل</label>
          <label class="iv4-toggle">
            <input type="checkbox" id="iv4-biz-active" ${hours.active ? 'checked' : ''}>
            <span class="iv4-toggle-slider"></span>
          </label>
        </div>
        <div class="iv4-set-row">
          <label class="iv4-set-label">المنطقة الزمنية</label>
          <input class="iv4-inp" id="iv4-biz-tz" value="${_esc(hours.timezone||'Africa/Cairo')}">
        </div>
        <table class="iv4-biz-days-table">
          <thead><tr><th>اليوم</th><th>من</th><th>إلى</th></tr></thead>
          <tbody>${daysHtml}</tbody>
        </table>
        <div class="iv4-set-actions">
          <button id="iv4-biz-save" class="iv4-btn iv4-btn-primary">💾 حفظ ساعات العمل</button>
          <span class="iv4-set-msg" id="iv4-biz-msg"></span>
        </div>
      </div>
    `;

    _bindOrg();
    _bindBizHours();
  }

  // ─────────────────────────────────────────────────────────────
  // Events — Org Form
  // ─────────────────────────────────────────────────────────────

  function _bindOrg() {
    const form = _container.querySelector('#iv4-org-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const msg = _container.querySelector('#iv4-org-msg');
      try {
        await InboxAPI.settings.updateOrg(data);
        _showMsg(msg, '✅ تم الحفظ', 'success');
      } catch (err) {
        _showMsg(msg, '❌ ' + err.message, 'error');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Events — Business Hours
  // ─────────────────────────────────────────────────────────────

  function _bindBizHours() {
    if (!_container) return;

    // تفعيل/تعطيل أزرار الوقت عند تغيير حالة اليوم
    _container.querySelectorAll('.iv4-biz-day-active').forEach(chk => {
      chk.addEventListener('change', () => {
        const day = chk.dataset.day;
        const isActive = chk.checked;
        _container.querySelectorAll(`[data-day="${day}"]`).forEach(el => {
          if (el !== chk) el.disabled = !isActive;
        });
      });
    });

    // حفظ ساعات العمل
    const saveBtn = _container.querySelector('#iv4-biz-save');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
      const msg = _container.querySelector('#iv4-biz-msg');
      const active = _container.querySelector('#iv4-biz-active')?.checked ? 1 : 0;
      const timezone = _container.querySelector('#iv4-biz-tz')?.value?.trim() || 'Africa/Cairo';

      const days = [];
      _container.querySelectorAll('.iv4-biz-day-row').forEach(row => {
        const dayChk = row.querySelector('.iv4-biz-day-active');
        const dayNum = parseInt(dayChk.dataset.day);
        days.push({
          day_of_week: dayNum,
          is_working:  dayChk.checked ? 1 : 0,
          start_time:  row.querySelector('.iv4-biz-start')?.value || '09:00',
          end_time:    row.querySelector('.iv4-biz-end')?.value   || '17:00',
        });
      });

      try {
        await InboxAPI.settings.updateHours({ active, timezone, days });
        _showMsg(msg, '✅ تم الحفظ', 'success');
      } catch (err) {
        _showMsg(msg, '❌ ' + err.message, 'error');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function _showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `iv4-set-msg iv4-set-msg-${type}`;
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  }

  return { mount, unmount };
})();

window.SettingsOrg = SettingsOrg;
