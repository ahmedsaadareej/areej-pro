/**
 * channels.js — قسم إعدادات القنوات/التطبيقات (M2 T45)
 * يعرض: قائمة القنوات + نموذج تعديل كل قناة
 *
 * آخر تحديث: 2026-05-04 (M2 T45)
 */

'use strict';

const SettingsChannels = (() => {

  let _container = null;
  let _channels = [];

  const CHANNEL_META = {
    whatsapp_api: { label: 'WhatsApp API',    icon: '🟢', fields: ['phone_number_id','waba_id','access_token','webhook_verify_token'] },
    whatsapp_qr:  { label: 'WhatsApp QR',     icon: '📲', fields: [] },
    telegram:     { label: 'Telegram',         icon: '✈️', fields: ['bot_token','webhook_url'] },
    instagram:    { label: 'Instagram',        icon: '📷', fields: ['page_id','access_token'] },
    messenger:    { label: 'Messenger',        icon: '💬', fields: ['page_id','access_token'] },
    email:        { label: 'البريد الإلكتروني', icon: '📧', fields: ['smtp_host','smtp_port','smtp_user','smtp_pass'] },
  };

  // ─────────────────────────────────────────────────────────────
  // mount / unmount
  // ─────────────────────────────────────────────────────────────

  async function mount(container, params = {}) {
    _container = container;
    _container.innerHTML = '<div class="iv4-set-loading">جارٍ التحميل…</div>';
    try {
      const res = await InboxAPI.settings.getChannels();
      // InboxAPI يرجع { data, error } — نستخرج من .data
      const map = {};
      (res.data?.channels || []).forEach(c => { map[c.channel_type] = c; });
      _channels = Object.keys(CHANNEL_META).map(k => ({
        channel_type: k,
        is_active: map[k]?.is_active || 0,
        config: map[k]?.config || {},
      }));
      _render();
    } catch (err) {
      _container.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`;
    }
  }

  function unmount() { _container = null; }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  function _render() {
    if (!_container) return;

    const cards = _channels.map(ch => {
      const meta = CHANNEL_META[ch.channel_type];
      return `
        <div class="iv4-ch-card ${ch.is_active ? 'active' : ''}" data-ch="${ch.channel_type}">
          <div class="iv4-ch-card-header">
            <span class="iv4-ch-icon">${meta.icon}</span>
            <span class="iv4-ch-label">${meta.label}</span>
            <label class="iv4-toggle iv4-ch-toggle">
              <input type="checkbox" class="iv4-ch-active-chk" ${ch.is_active ? 'checked' : ''}>
              <span class="iv4-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-ch-fields ${ch.is_active ? '' : 'hidden'}">
            ${meta.fields.map(f => `
              <div class="iv4-set-row">
                <label class="iv4-set-label">${f}</label>
                <input class="iv4-inp" name="${f}" value="${_esc(ch.config[f]||'')}"
                  ${f.includes('token') || f.includes('pass') ? 'type="password"' : ''}>
              </div>
            `).join('')}
            <div class="iv4-set-actions">
              <button class="iv4-btn iv4-btn-primary iv4-ch-save">💾 حفظ</button>
              <button class="iv4-btn iv4-ch-test">🔌 اختبار الاتصال</button>
              <span class="iv4-set-msg iv4-ch-msg"></span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    _container.innerHTML = `
      <div class="iv4-set-section">
        <h2 class="iv4-set-section-title">📱 التطبيقات والقنوات</h2>
        <div class="iv4-ch-grid">${cards}</div>
      </div>
    `;

    _bindCards();
  }

  // ─────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────

  function _bindCards() {
    if (!_container) return;

    _container.querySelectorAll('.iv4-ch-card').forEach(card => {
      const ch = card.dataset.ch;

      // تفعيل/تعطيل
      const chk = card.querySelector('.iv4-ch-active-chk');
      chk?.addEventListener('change', async () => {
        const fields = card.querySelector('.iv4-ch-fields');
        if (chk.checked) {
          fields?.classList.remove('hidden');
          card.classList.add('active');
        } else {
          fields?.classList.add('hidden');
          card.classList.remove('active');
        }
        // حفظ الحالة فوراً
        try {
          await InboxAPI.settings.updateChannel(ch, { is_active: chk.checked ? 1 : 0 });
        } catch (err) {
          console.error('[channels toggle]', err);
        }
      });

      // حفظ الإعدادات
      card.querySelector('.iv4-ch-save')?.addEventListener('click', async () => {
        const msg = card.querySelector('.iv4-ch-msg');
        const config = {};
        card.querySelectorAll('.iv4-ch-fields [name]').forEach(inp => {
          if (inp.value) config[inp.name] = inp.value;
        });
        try {
          await InboxAPI.settings.updateChannel(ch, { config });
          _showMsg(msg, '✅ تم الحفظ', 'success');
        } catch (err) {
          _showMsg(msg, '❌ ' + err.message, 'error');
        }
      });

      // اختبار الاتصال
      card.querySelector('.iv4-ch-test')?.addEventListener('click', async () => {
        const msg = card.querySelector('.iv4-ch-msg');
        try {
          const res = await InboxAPI.settings.testChannel(ch);
          _showMsg(msg, '✅ ' + (res.message || 'الاتصال ناجح'), 'success');
        } catch (err) {
          _showMsg(msg, '❌ ' + err.message, 'error');
        }
      });
    });
  }

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

window.SettingsChannels = SettingsChannels;
