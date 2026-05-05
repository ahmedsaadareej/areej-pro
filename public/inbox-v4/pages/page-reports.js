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

      // FIX-006c: حقن container داخلي + querySelector بدل getElementById
      container.innerHTML = `<div id="iv4-analytics-container" style="height:100%;overflow:auto;"></div>`;

      const section  = (params && params.section) || 'overview';
      // querySelector بدل getElementById لضمان البحث داخل container فقط
      const anchorEl = container.querySelector('#iv4-analytics-container');

      if (!anchorEl) {
        container.innerHTML = '<div style="padding:40px;color:red">خطأ: container التقارير غير موجود</div>';
        return;
      }

      // requestAnimationFrame يضمن أن الـ DOM جاهز
      requestAnimationFrame(() => InboxAnalytics.mount(anchorEl, { section }));
    },

    unmount() {
      if (typeof InboxAnalytics !== 'undefined' && InboxAnalytics.unmount) {
        InboxAnalytics.unmount();
      }
    }
  };
})();

window.PageReports = PageReports;
