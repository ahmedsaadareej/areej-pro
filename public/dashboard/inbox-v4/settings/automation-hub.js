/**
 * automation-hub.js — Hub للأتمتة في Settings (M2 T47)
 * FIX-005: عرض واجهة مباشرة بدل استدعاء InboxAutomation.init() الخاطئ
 * آخر تحديث: 2026-05-05
 */

'use strict';

const SettingsAutomation = (() => {

  let _container = null;

  function mount(container, params = {}) {
    _container = container;
    _container.innerHTML = '';

    // FIX-005: عرض بطاقات الأتمتة مباشرة بدل InboxAutomation.init()
    _container.innerHTML = `
      <div class="iv4-set-section" style="padding: 24px;">
        <h2 class="iv4-set-section-title" style="margin-bottom:8px">🤖 الأتمتة</h2>
        <p class="iv4-set-hint" style="margin-bottom:24px;color:#6b7280">إعداد الردود التلقائية، رسائل الغياب، وإغلاق المحادثات</p>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">

          <!-- بطاقة Welcome/Away -->
          <div class="iv4-automation-card" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:20px;">
            <div style="font-size:28px;margin-bottom:8px">👋</div>
            <h3 style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px">رسالة الترحيب والغياب</h3>
            <p style="font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.5">
              رسالة تُرسل تلقائياً عند بدء محادثة جديدة، أو عند الغياب خارج ساعات العمل.
            </p>
            <button onclick="if(typeof InboxAutomation!=='undefined') InboxAutomation.open()"
              style="background:#2563eb;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:600;cursor:pointer;width:100%">
              ⚙️ إعداد رسالة الترحيب / الغياب
            </button>
          </div>

          <!-- بطاقة Webhooks -->
          <div class="iv4-automation-card" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:20px;">
            <div style="font-size:28px;margin-bottom:8px">🔗</div>
            <h3 style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px">Webhooks</h3>
            <p style="font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.5">
              أرسل إشعارات تلقائية لأنظمة خارجية عند وقوع أحداث محددة في الـ Inbox.
            </p>
            <button id="iv4-open-webhooks-btn"
              style="background:#7c3aed;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:600;cursor:pointer;width:100%">
              ⚙️ إدارة Webhooks
            </button>
          </div>

        </div>
      </div>
    `;

    // ربط زر Webhooks
    const whBtn = document.getElementById('iv4-open-webhooks-btn');
    if (whBtn) {
      whBtn.addEventListener('click', () => {
        // InboxWebhooks موجود كـ module ثانٍ في automation.js
        if (typeof InboxWebhooks !== 'undefined' && typeof InboxWebhooks.open === 'function') {
          InboxWebhooks.open();
        } else if (typeof InboxAutomation !== 'undefined' && typeof InboxAutomation.open === 'function') {
          InboxAutomation.open();
        }
      });
    }
  }

  function unmount() {
    _container = null;
  }

  return { mount, unmount };
})();

window.SettingsAutomation = SettingsAutomation;
