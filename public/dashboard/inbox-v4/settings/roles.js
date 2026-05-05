/**
 * Inbox v4 — Settings: Roles Page (T10)
 * ══════════════════════════════════════
 * يعرض قائمة الأدوار ويتيح إنشاء وتعديل وحذف الأدوار المخصصة
 * الأدوار الثابتة (is_system=1): badge "نظام" — لا تعديل ولا حذف
 *
 * API:
 *   GET    /api/inbox/settings/roles
 *   POST   /api/inbox/settings/roles
 *   PUT    /api/inbox/settings/roles/:id
 *   DELETE /api/inbox/settings/roles/:id
 *
 * آخر تحديث: 2026-05-04 (M1 T10)
 */

/* global InboxStore, InboxAPI */
const InboxSettingsRoles = (() => {
  'use strict';

  // ── Permissions المدعومة (لعرضها كـ checkboxes في form) ──────────────────
  const PERMISSIONS_META = [
    { key: 'conversations_all',  label: 'عرض كل المحادثات' },
    { key: 'conversations_team', label: 'عرض محادثات الفريق' },
    { key: 'team_manage',        label: 'إدارة الفريق والموظفين' },
    { key: 'org_settings',       label: 'إعدادات المنظومة' },
    { key: 'channels',           label: 'إدارة القنوات' },
    { key: 'inbox_settings',     label: 'إعدادات الـ Inbox' },
    { key: 'reports_full',       label: 'التقارير الكاملة' },
    { key: 'reports_team',       label: 'تقارير الفريق' },
    { key: 'reports_self',       label: 'التقارير الشخصية' },
    { key: 'export',             label: 'تصدير البيانات' },
    { key: 'broadcast',          label: 'الرسائل الجماعية' },
    { key: 'role_manage',        label: 'إدارة الأدوار' },
  ];

  let _container = null;
  let _roles      = [];

  // ── Mount / Unmount (D-027 Page Module pattern) ───────────────────────
  function mount(container) {
    _container = container;
    _render();
  }

  function unmount() {
    if (_container) _container.innerHTML = '';
    _container = null;
  }

  // ── Fetch ──────────────────────────────────────────────────────────────
  async function _load() {
    try {
      // FIX-009
      const { data } = await InboxAPI._fetch('/inbox/settings/roles');
      _roles = (data && data.roles) || [];
    } catch (_) {
      _roles = [];
    }
  }

  // ── Main Render ───────────────────────────────────────────────────────
  async function _render() {
    if (!_container) return;
    _container.innerHTML = '<div class="iv4-st-loading">جاري التحميل…</div>';
    await _load();
    _container.innerHTML = _buildHTML();
    _bindEvents();
  }

  function _buildHTML() {
    const canManage = InboxStore.can('team_manage');

    const cards = _roles.map(r => `
      <div class="iv4-role-card ${r.is_system ? 'is-system' : ''}" data-id="${r.id}">
        <div class="iv4-role-card-header">
          <span class="iv4-role-name">${_esc(r.name)}</span>
          ${r.is_system
            ? '<span class="iv4-badge iv4-badge-system">نظام</span>'
            : '<span class="iv4-badge iv4-badge-custom">مخصص</span>'}
        </div>
        ${r.description ? `<p class="iv4-role-desc">${_esc(r.description)}</p>` : ''}
        <div class="iv4-role-perms">
          ${_renderPermsSummary(r.permissions)}
        </div>
        ${!r.is_system && canManage ? `
          <div class="iv4-role-actions">
            <button class="iv4-btn iv4-btn-sm iv4-btn-outline" data-action="edit-role" data-id="${r.id}">تعديل</button>
            <button class="iv4-btn iv4-btn-sm iv4-btn-danger"   data-action="delete-role" data-id="${r.id}">حذف</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    return `
      <div class="iv4-settings-section" id="iv4-roles-section">
        <div class="iv4-settings-section-header">
          <h3>الأدوار والصلاحيات</h3>
          ${canManage ? '<button class="iv4-btn iv4-btn-primary" id="iv4-add-role-btn">+ إضافة دور</button>' : ''}
        </div>
        <p class="iv4-settings-hint">الأدوار الثابتة لا يمكن تعديلها أو حذفها. يمكنك إضافة أدوار مخصصة.</p>
        <div class="iv4-roles-grid">${cards}</div>
      </div>

      <!-- Drawer: إضافة / تعديل دور -->
      <div class="iv4-drawer-overlay" id="iv4-role-drawer-overlay" style="display:none"></div>
      <aside class="iv4-drawer" id="iv4-role-drawer" style="display:none">
        <div class="iv4-drawer-header">
          <span id="iv4-role-drawer-title">إضافة دور جديد</span>
          <button class="iv4-drawer-close" id="iv4-role-drawer-close">✕</button>
        </div>
        <div class="iv4-drawer-body">
          <form id="iv4-role-form">
            <input type="hidden" id="iv4-role-form-id" value="">
            <div class="iv4-form-field">
              <label>اسم الدور *</label>
              <input type="text" id="iv4-role-form-name" placeholder="مثال: مشرف مبيعات" maxlength="50" required>
            </div>
            <div class="iv4-form-field">
              <label>الوصف</label>
              <input type="text" id="iv4-role-form-desc" placeholder="وصف قصير للدور" maxlength="100">
            </div>
            <div class="iv4-form-field">
              <label>الصلاحيات</label>
              <div class="iv4-perms-grid">
                ${PERMISSIONS_META.map(p => `
                  <label class="iv4-perm-check">
                    <input type="checkbox" name="perm" value="${p.key}" id="iv4-perm-${p.key}">
                    <span>${p.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="iv4-form-actions">
              <button type="submit" class="iv4-btn iv4-btn-primary" id="iv4-role-form-submit">حفظ الدور</button>
              <button type="button" class="iv4-btn iv4-btn-outline" id="iv4-role-form-cancel">إلغاء</button>
            </div>
          </form>
        </div>
      </aside>
    `;
  }

  function _renderPermsSummary(perms) {
    const active = PERMISSIONS_META.filter(p => perms[p.key]);
    if (!active.length) return '<span class="iv4-role-no-perms">لا توجد صلاحيات مفعّلة</span>';
    const preview = active.slice(0, 4).map(p => `<span class="iv4-perm-pill">${p.label}</span>`).join('');
    const extra   = active.length > 4 ? `<span class="iv4-perm-pill iv4-perm-more">+${active.length - 4}</span>` : '';
    return preview + extra;
  }

  // ── Events ────────────────────────────────────────────────────────────
  function _bindEvents() {
    const c = _container;
    if (!c) return;

    // زر إضافة دور
    const addBtn = c.querySelector('#iv4-add-role-btn');
    if (addBtn) addBtn.addEventListener('click', () => _openDrawer(null));

    // إغلاق الـ Drawer
    c.querySelector('#iv4-role-drawer-close')?.addEventListener('click', _closeDrawer);
    c.querySelector('#iv4-role-drawer-overlay')?.addEventListener('click', _closeDrawer);
    c.querySelector('#iv4-role-form-cancel')?.addEventListener('click', _closeDrawer);

    // Submit form
    c.querySelector('#iv4-role-form')?.addEventListener('submit', _onSubmit);

    // تعديل / حذف من الـ cards
    c.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = parseInt(btn.dataset.id, 10);
      if (action === 'edit-role')   _openDrawer(id);
      if (action === 'delete-role') _confirmDelete(id);
    });
  }

  function _openDrawer(roleId) {
    const drawer  = _container.querySelector('#iv4-role-drawer');
    const overlay = _container.querySelector('#iv4-role-drawer-overlay');
    const title   = _container.querySelector('#iv4-role-drawer-title');
    const idInput = _container.querySelector('#iv4-role-form-id');
    const nameIn  = _container.querySelector('#iv4-role-form-name');
    const descIn  = _container.querySelector('#iv4-role-form-desc');

    // reset form
    _container.querySelector('#iv4-role-form').reset();
    idInput.value = '';
    PERMISSIONS_META.forEach(p => {
      const cb = _container.querySelector(`#iv4-perm-${p.key}`);
      if (cb) cb.checked = false;
    });

    if (roleId) {
      // تعديل دور موجود
      const role = _roles.find(r => r.id === roleId);
      if (!role) return;
      title.textContent   = `تعديل دور: ${role.name}`;
      idInput.value       = role.id;
      nameIn.value        = role.name;
      descIn.value        = role.description || '';
      PERMISSIONS_META.forEach(p => {
        const cb = _container.querySelector(`#iv4-perm-${p.key}`);
        if (cb) cb.checked = !!role.permissions[p.key];
      });
    } else {
      title.textContent = 'إضافة دور جديد';
    }

    drawer.style.display  = 'flex';
    overlay.style.display = 'block';
  }

  function _closeDrawer() {
    const drawer  = _container?.querySelector('#iv4-role-drawer');
    const overlay = _container?.querySelector('#iv4-role-drawer-overlay');
    if (drawer)  drawer.style.display  = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  async function _onSubmit(e) {
    e.preventDefault();
    const id   = _container.querySelector('#iv4-role-form-id').value;
    const name = _container.querySelector('#iv4-role-form-name').value.trim();
    const desc = _container.querySelector('#iv4-role-form-desc').value.trim();

    const permissions = {};
    PERMISSIONS_META.forEach(p => {
      const cb = _container.querySelector(`#iv4-perm-${p.key}`);
      permissions[p.key] = !!(cb && cb.checked);
    });

    const submitBtn = _container.querySelector('#iv4-role-form-submit');
    submitBtn.disabled   = true;
    submitBtn.textContent = '…جاري الحفظ';

    try {
      const path2  = id ? `/inbox/settings/roles/${id}` : '/inbox/settings/roles';
      const method = id ? 'PUT' : 'POST';
      // FIX-009
      const { data, error } = await InboxAPI._fetch(path2, { method, body: JSON.stringify({ name, description: desc, permissions }) });
      if (error) throw new Error(error);
      if (!data || !data.ok) throw new Error((data && data.error) || 'server_error');

      _closeDrawer();
      _render(); // reload
    } catch (err) {
      submitBtn.disabled   = false;
      submitBtn.textContent = 'حفظ الدور';
      _showError(err.message === 'name_taken' ? 'اسم الدور مستخدم مسبقاً' : 'حدث خطأ، حاول مجدداً');
    }
  }

  async function _confirmDelete(id) {
    const role = _roles.find(r => r.id === id);
    if (!role) return;
    if (!confirm(`هل تريد حذف دور "${role.name}"؟ لا يمكن التراجع عن هذا.`)) return;

    try {
      // FIX-009
      const { data, error } = await InboxAPI._fetch(`/inbox/settings/roles/${id}`, { method: 'DELETE' });
      if (error || (data && !data.ok)) {
        if (data && data.error === 'role_has_users') {
          _showError(`لا يمكن حذف الدور — يوجد ${data.count} موظف مرتبط به`);
        } else {
          _showError('لا يمكن حذف هذا الدور');
        }
        return;
      }
      _render();
    } catch (_) {
      _showError('حدث خطأ أثناء الحذف');
    }
  }

  function _showError(msg) {
    if (typeof window.showInboxToast === 'function') window.showInboxToast(msg, 'error');
    else alert(msg);
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { mount, unmount };
})();
