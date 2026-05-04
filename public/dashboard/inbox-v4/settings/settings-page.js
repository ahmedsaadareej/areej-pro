/**
 * settings-page.js — Shell رئيسي لصفحة الإعدادات (M2 T43)
 * يُعرض كـ Page Module من page-settings.js
 * الأقسام: org / team / channels / inbox / automation
 *
 * آخر تحديث: 2026-05-04 (M2 T43)
 */

'use strict';

const InboxSettings = (() => {

  // تعريف الأقسام مع الصلاحية المطلوبة
  const SECTIONS = [
    { id: 'org',        label: 'المؤسسة',       icon: '🏢', perm: 'org_settings'   },
    { id: 'team',       label: 'الفريق',         icon: '👥', perm: 'team_manage'    },
    { id: 'channels',   label: 'التطبيقات',      icon: '📱', perm: 'channels'       },
    { id: 'inbox',      label: 'إعدادات Inbox',  icon: '⚙️',  perm: 'inbox_settings' },
    { id: 'automation', label: 'الأتمتة',        icon: '🤖', perm: null             },
  ];

  let _container = null;
  let _activeSection = null;

  // ─────────────────────────────────────────────────────────────
  // mount / unmount
  // ─────────────────────────────────────────────────────────────

  function mount(container, params = {}) {
    _container = container;
    _container.innerHTML = _buildShell();
    _bindNav();
    const section = params.section || 'org';
    _loadSection(section);
  }

  function unmount() {
    if (_activeSection && typeof _activeSection.unmount === 'function') {
      _activeSection.unmount();
    }
    _container = null;
    _activeSection = null;
  }

  // ─────────────────────────────────────────────────────────────
  // HTML Shell
  // ─────────────────────────────────────────────────────────────

  function _buildShell() {
    const navItems = SECTIONS
      .filter(s => !s.perm || InboxStore.can(s.perm))
      .map(s => `
        <li class="iv4-set-nav-item" data-section="${s.id}">
          <span class="iv4-set-nav-icon">${s.icon}</span>
          <span class="iv4-set-nav-label">${s.label}</span>
        </li>
      `).join('');

    return `
      <div class="iv4-set-shell" dir="rtl">
        <nav class="iv4-set-nav">
          <ul class="iv4-set-nav-list">${navItems}</ul>
        </nav>
        <div class="iv4-set-content" id="iv4-settings-content">
          <div class="iv4-set-loading">جارٍ التحميل…</div>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────

  function _bindNav() {
    if (!_container) return;
    _container.querySelectorAll('.iv4-set-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        const sec = el.dataset.section;
        // تحديث الـ active state
        _container.querySelectorAll('.iv4-set-nav-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        _loadSection(sec);
      });
    });
  }

  function _loadSection(sectionId) {
    const sec = SECTIONS.find(s => s.id === sectionId);
    if (!sec) return;

    // فحص الصلاحيات
    if (sec.perm && !InboxStore.can(sec.perm)) {
      _setContent('<div class="iv4-set-no-perm">🔒 ليس لديك صلاحية لعرض هذا القسم</div>');
      return;
    }

    // تحديد الـ active في الـ nav
    if (_container) {
      _container.querySelectorAll('.iv4-set-nav-item').forEach(e => {
        e.classList.toggle('active', e.dataset.section === sectionId);
      });
    }

    // unmount القسم السابق
    if (_activeSection && typeof _activeSection.unmount === 'function') {
      _activeSection.unmount();
    }

    const contentEl = document.getElementById('iv4-settings-content');
    if (!contentEl) return;
    contentEl.innerHTML = '<div class="iv4-set-loading">جارٍ التحميل…</div>';

    // تحميل الـ module المناسب
    switch (sectionId) {
      case 'org':        _mountModule(SettingsOrg,        contentEl); break;
      case 'team':       _mountModule(SettingsTeam,       contentEl); break;
      case 'channels':   _mountModule(SettingsChannels,   contentEl); break;
      case 'inbox':      _mountModule(SettingsInbox,      contentEl); break;
      case 'automation': _mountModule(SettingsAutomation, contentEl); break;
      default:
        contentEl.innerHTML = '<div class="iv4-set-no-perm">القسم غير موجود</div>';
    }
  }

  function _mountModule(mod, contentEl) {
    if (!mod) {
      contentEl.innerHTML = '<div class="iv4-set-loading">Module لم يُحمَّل بعد</div>';
      return;
    }
    _activeSection = mod;
    contentEl.innerHTML = '';
    mod.mount(contentEl, {});
  }

  function _setContent(html) {
    const contentEl = document.getElementById('iv4-settings-content');
    if (contentEl) contentEl.innerHTML = html;
  }

  return { mount, unmount };
})();

window.InboxSettings = InboxSettings;
