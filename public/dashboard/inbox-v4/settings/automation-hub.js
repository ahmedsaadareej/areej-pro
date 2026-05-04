/**
 * automation-hub.js — Hub للأتمتة في Settings (M2 T47)
 * يُغلّف InboxAutomation الحالي كـ Page Module
 *
 * آخر تحديث: 2026-05-04 (M2 T47)
 */

'use strict';

const SettingsAutomation = (() => {

  let _container = null;

  function mount(container, params = {}) {
    _container = container;
    _container.innerHTML = '';

    // InboxAutomation موجود من automation.js — نستدعيه مباشرة
    if (typeof InboxAutomation !== 'undefined' && typeof InboxAutomation.init === 'function') {
      // نحاكي الـ init لكن داخل الـ container المحدد
      _container.innerHTML = `<div id="iv4-automation-hub-mount" class="iv4-automation-embedded"></div>`;
      InboxAutomation.init();
    } else {
      // Fallback: رسالة حتى يُحمَّل automation.js
      _container.innerHTML = `
        <div class="iv4-set-section">
          <h2 class="iv4-set-section-title">🤖 الأتمتة</h2>
          <p class="iv4-set-hint">
            إعدادات الأتمتة متاحة من القائمة الجانبية الرئيسية للـ Inbox.
            <br>هذا القسم سيُدمج بالكامل في المرحلة القادمة.
          </p>
          <div class="iv4-automation-links">
            <a class="iv4-btn" href="#" onclick="document.querySelector('[data-section=automation]')?.click(); return false;">
              🤖 فتح الأتمتة في الـ Sidebar
            </a>
          </div>
        </div>
      `;
    }
  }

  function unmount() {
    _container = null;
  }

  return { mount, unmount };
})();

window.SettingsAutomation = SettingsAutomation;
