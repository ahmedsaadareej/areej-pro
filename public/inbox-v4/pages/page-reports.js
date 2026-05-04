/* ============================================================
   Inbox v4 — Page Module: Reports
   يُغلّف InboxAnalytics.mount() كـ Page Module معياري
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageReports = (() => {

  return {
    mount(container, params) {
      // لو InboxAnalytics غير محمَّل → placeholder مع retry
      if (typeof InboxAnalytics === 'undefined') {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #6b7280;">
            <div style="font-size: 48px">📊</div>
            <h2 style="color: #374151">التقارير</h2>
            <p>جاري تحميل نظام التقارير...</p>
          </div>
        `;
        return;
      }

      // حقن container داخلي
      container.innerHTML = `<div id="iv4-analytics-container" style="height:100%;overflow:auto;"></div>`;

      const section     = (params && params.section) || 'overview';
      const anchorEl    = document.getElementById('iv4-analytics-container');

      // استخدام mount() الرسمي (D-031)
      InboxAnalytics.mount(anchorEl, { section });
    },

    unmount() {
      if (typeof InboxAnalytics !== 'undefined' && InboxAnalytics.unmount) {
        InboxAnalytics.unmount();
      }
    }
  };
})();

window.PageReports = PageReports;
