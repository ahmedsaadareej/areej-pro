/* ============================================================
   Inbox v4 — Page Module: Settings
   يُفوِّض بالكامل لـ InboxSettings.mount() من settings-page.js
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageSettings = (() => {

  return {
    mount(container, params) {
      // لو InboxSettings غير محمَّل → placeholder
      if (typeof InboxSettings === 'undefined') {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #6b7280;">
            <div style="font-size: 48px">⚙️</div>
            <h2 style="color: #374151">الإعدادات</h2>
            <p>جاري تحميل الإعدادات...</p>
          </div>
        `;
        return;
      }

      // حقن container داخلي
      container.innerHTML = `<div id="iv4-settings-container" style="height:100%;overflow:auto;"></div>`;

      const section  = (params && params.section) || 'org';
      const anchorEl = document.getElementById('iv4-settings-container');

      // تفويض كامل لـ InboxSettings (settings-page.js)
      InboxSettings.mount(anchorEl, { section });
    },

    unmount() {
      if (typeof InboxSettings !== 'undefined' && InboxSettings.unmount) {
        InboxSettings.unmount();
      }
    }
  };
})();

window.PageSettings = PageSettings;
