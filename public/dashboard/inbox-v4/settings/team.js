/**
 * team.js — قسم إعدادات الفريق في Settings Shell (M2 T47)
 * يُغلّف InboxSettingsRoles + InboxSettingsUsers الحاليين
 *
 * آخر تحديث: 2026-05-04 (M2 T47)
 */

'use strict';

const SettingsTeam = (() => {

  let _container = null;
  let _activeTab = 'roles';

  const TABS = [
    { id: 'roles', label: '🎭 الأدوار'   },
    { id: 'users', label: '👤 الموظفون'  },
  ];

  function mount(container, params = {}) {
    _container = container;
    _activeTab = params.tab || 'roles';
    _render();
  }

  function unmount() { _container = null; }

  function _render() {
    if (!_container) return;
    const tabs = TABS.map(t => `
      <button class="iv4-tab-btn ${t.id === _activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
    `).join('');

    _container.innerHTML = `
      <div class="iv4-set-section">
        <h2 class="iv4-set-section-title">👥 إعدادات الفريق</h2>
        <div class="iv4-tabs">${tabs}</div>
        <div id="iv4-team-tab-content"></div>
      </div>
    `;

    _container.querySelectorAll('.iv4-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _container.querySelectorAll('.iv4-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeTab = btn.dataset.tab;
        _loadTab(_activeTab);
      });
    });

    _loadTab(_activeTab);
  }

  function _loadTab(tab) {
    const el = _container?.querySelector('#iv4-team-tab-content');
    if (!el) return;
    el.innerHTML = '';
    if (tab === 'roles' && typeof InboxSettingsRoles !== 'undefined') {
      InboxSettingsRoles.mount(el, {});
    } else if (tab === 'users' && typeof InboxSettingsUsers !== 'undefined') {
      InboxSettingsUsers.mount(el, {});
    } else {
      el.innerHTML = '<div class="iv4-set-loading">Module لم يُحمَّل بعد</div>';
    }
  }

  return { mount, unmount };
})();

window.SettingsTeam = SettingsTeam;
