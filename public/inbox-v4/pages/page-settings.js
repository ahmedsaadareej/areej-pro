/* ============================================================
   Inbox v4 — Page Module: Settings
   يُغلّف InboxSettings (roles.js + users.js) كـ Page Module
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageSettings = (() => {

  // الأقسام المتاحة + العناوين
  const sections = {
    org       : 'إعدادات المنظمة',
    channels  : 'القنوات',
    team      : 'الفريق',
    roles     : 'الأدوار والصلاحيات',
    users     : 'الموظفين',
    automation: 'الأتمتة',
    sla       : 'SLA',
    canned    : 'الردود السريعة',
    hours     : 'ساعات العمل',
  };

  function _renderNav(container, activeSection) {
    const nav = container.querySelector('.iv4-settings-nav');
    if (!nav) return;
    nav.querySelectorAll('[data-section]').forEach(el => {
      el.classList.toggle('active', el.dataset.section === activeSection);
    });
  }

  function _loadSection(contentEl, section) {
    contentEl.innerHTML = '<div class="shell-loading"><div class="shell-spinner"></div></div>';

    setTimeout(() => {
      switch (section) {
        case 'roles':
          if (typeof InboxRoles !== 'undefined' && InboxRoles.init) {
            contentEl.innerHTML = '<div id="iv4-roles-root"></div>';
            InboxRoles.init(document.getElementById('iv4-roles-root'));
          } else {
            contentEl.innerHTML = `<div style="padding:24px;color:#6b7280">نظام الأدوار قيد التحميل...</div>`;
          }
          break;

        case 'users':
          if (typeof InboxUsers !== 'undefined' && InboxUsers.init) {
            contentEl.innerHTML = '<div id="iv4-users-root"></div>';
            InboxUsers.init(document.getElementById('iv4-users-root'));
          } else {
            contentEl.innerHTML = `<div style="padding:24px;color:#6b7280">إدارة الموظفين قيد التحميل...</div>`;
          }
          break;

        default: {
          const label = sections[section] || section;
          contentEl.innerHTML = `
            <div style="padding:40px;text-align:center;color:#6b7280">
              <div style="font-size:36px">⚙️</div>
              <h3 style="color:#374151;margin:12px 0 8px">${label}</h3>
              <p style="font-size:13px">هذا القسم سيكون متاحاً قريباً</p>
            </div>
          `;
        }
      }
    }, 50);
  }

  return {
    mount(container, params) {
      // Default section = roles
      const section = (params && params.section) || 'roles';

      container.innerHTML = `
        <div class="iv4-settings-layout">
          <nav class="iv4-settings-nav">
            ${Object.entries(sections).map(([key, label]) => `
              <a href="/settings/${key}" class="iv4-settings-nav-item${key === section ? ' active' : ''}" data-section="${key}">
                ${label}
              </a>
            `).join('')}
          </nav>
          <div class="iv4-settings-content" id="iv4SettingsContent"></div>
        </div>
      `;

      // CSS مضمّن مؤقت لـ layout (سيُنقل لـ inbox.css في Phase 10)
      if (!document.getElementById('iv4-settings-style')) {
        const style = document.createElement('style');
        style.id = 'iv4-settings-style';
        style.textContent = `
          .iv4-settings-layout { display: flex; height: 100%; overflow: hidden; }
          .iv4-settings-nav {
            width: 200px; flex-shrink: 0; border-inline-end: 1px solid #e5e7eb;
            overflow-y: auto; padding: 12px 0; background: #f9fafb;
          }
          .iv4-settings-nav-item {
            display: block; padding: 9px 16px; text-decoration: none;
            color: #374151; font-size: 13.5px; transition: background 0.15s;
          }
          .iv4-settings-nav-item:hover { background: #f3f4f6; }
          .iv4-settings-nav-item.active { background: #eff6ff; color: #2563eb; font-weight: 600; }
          .iv4-settings-content { flex: 1; overflow-y: auto; padding: 24px; }
          @media (prefers-color-scheme: dark) {
            .iv4-settings-nav { background: #1f2937; border-color: #374151; }
            .iv4-settings-nav-item { color: #d1d5db; }
            .iv4-settings-nav-item:hover { background: #374151; }
            .iv4-settings-nav-item.active { background: #1e3a5f; color: #60a5fa; }
          }
        `;
        document.head.appendChild(style);
      }

      // ربط nav links
      container.querySelectorAll('.iv4-settings-nav-item[data-section]').forEach(el => {
        el.addEventListener('click', e => {
          e.preventDefault();
          const sec = el.dataset.section;
          InboxRouter.navigate('/settings/' + sec);
          _renderNav(container, sec);
          _loadSection(document.getElementById('iv4SettingsContent'), sec);
        });
      });

      // تحميل القسم الأول
      _loadSection(document.getElementById('iv4SettingsContent'), section);
    },

    unmount() {
      // تنظيف style مؤقت
      document.getElementById('iv4-settings-style')?.remove();
    }
  };
})();

window.PageSettings = PageSettings;
