/* ============================================================
   Inbox v4 — Page Module: Reports
   يُغلّف InboxAnalytics.open() كـ Page Module
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageReports = (() => {
  return {
    mount(container, params) {
      // لو InboxAnalytics غير محمَّل → placeholder
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

      // حقن container مناسب
      container.innerHTML = `<div id="iv4-analytics-container" style="height:100%;overflow:auto;"></div>`;

      // تمرير section لو موجود
      const section = (params && params.section) || 'overview';
      const userRoleId = InboxStore.state?.currentUser?.inbox_role_id;

      // InboxAnalytics.open() يعرض الـ overlay في الـ DOM الحالي
      // في Phase 10 يُحوَّل لـ mount/unmount كامل (D-031)
      InboxAnalytics.open({
        container: document.getElementById('iv4-analytics-container'),
        section,
        userRoleId
      });
    },

    unmount() {
      if (typeof InboxAnalytics !== 'undefined' && InboxAnalytics.close) {
        InboxAnalytics.close();
      }
    }
  };
})();

window.PageReports = PageReports;
