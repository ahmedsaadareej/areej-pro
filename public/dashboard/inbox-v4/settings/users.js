/**
 * Inbox v4 — Settings: Users Page (T11)
 * ══════════════════════════════════════
 * يعرض جدول موظفي الـ Inbox ويتيح إضافة / تعديل / إزالة الموظفين
 *
 * API:
 *   GET    /api/inbox/settings/users
 *   POST   /api/inbox/settings/users
 *   PUT    /api/inbox/settings/users/:id
 *   DELETE /api/inbox/settings/users/:id
 *   GET    /api/inbox/settings/roles  (لملء dropdown الأدوار)
 *
 * آخر تحديث: 2026-05-04 (M1 T11)
 */

/* global InboxStore */
const InboxSettingsUsers = (() => {
  'use strict';

  let _container = null;
  let _users     = [];
  let _roles     = [];

  // ── Mount / Unmount ───────────────────────────────────────────────────
  function mount(container) {
    _container = container;
    _render();
  }

  function unmount() {
    if (_container) _container.innerHTML = '';
    _container = null;
  }

  // ── Fetch ──────────────────────────────────────────────────────────────
  async function _loadAll() {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        // FIX-009
        InboxAPI._fetch('/inbox/settings/users').then(r=>({ok:true,...(r.data||{})})),
        InboxAPI._fetch('/inbox/settings/roles').then(r=>({ok:true,...(r.data||{})})),
      ]);
      const ud = await usersRes.json();
      const rd = await rolesRes.json();
      _users = ud.users || [];
      _roles = rd.roles || [];
    } catch (_) {
      _users = [];
      _roles = [];
    }
  }

  // ── Main Render ───────────────────────────────────────────────────────
  async function _render() {
    if (!_container) return;
    _container.innerHTML = '<div class="iv4-st-loading">جاري التحميل…</div>';
    await _loadAll();
    _container.innerHTML = _buildHTML();
    _bindEvents();
  }

  function _buildHTML() {
    const canManage = InboxStore.can('team_manage');

    const rows = _users.map(u => `
      <tr class="iv4-users-row" data-id="${u.id}">
        <td>
          <div class="iv4-user-cell">
            <div class="iv4-user-avatar">${_initials(u.name)}</div>
            <div>
              <div class="iv4-user-name">${_esc(u.name)}</div>
              <div class="iv4-user-email">${_esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="iv4-badge iv4-badge-role">${_esc(u.role_name || '—')}</span></td>
        <td>
          <span class="iv4-status-dot ${u.status === 'active' ? 'active' : 'inactive'}"></span>
          ${u.status === 'active' ? 'نشط' : 'غير نشط'}
        </td>
        <td>${_formatDate(u.created_at)}</td>
        ${canManage ? `
        <td class="iv4-users-actions">
          <button class="iv4-btn iv4-btn-sm iv4-btn-outline" data-action="edit-user"   data-id="${u.id}">تعديل</button>
          <button class="iv4-btn iv4-btn-sm iv4-btn-danger"  data-action="delete-user" data-id="${u.id}">إزالة</button>
        </td>` : '<td></td>'}
      </tr>
    `).join('');

    const rolesOptions = _roles.map(r =>
      `<option value="${r.id}">${_esc(r.name)}</option>`
    ).join('');

    return `
      <div class="iv4-settings-section" id="iv4-users-section">
        <div class="iv4-settings-section-header">
          <h3>موظفو الـ Inbox</h3>
          ${canManage ? '<button class="iv4-btn iv4-btn-primary" id="iv4-add-user-btn">+ إضافة موظف</button>' : ''}
        </div>
        <p class="iv4-settings-hint">موظفو الـ Inbox يمكنهم الوصول للمحادثات حسب دورهم.</p>

        ${_users.length === 0
          ? '<div class="iv4-empty-state">لا يوجد موظفون حتى الآن</div>'
          : `<div class="iv4-table-wrap">
              <table class="iv4-users-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>الدور</th>
                    <th>الحالة</th>
                    <th>تاريخ الإضافة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Drawer: إضافة / تعديل موظف -->
      <div class="iv4-drawer-overlay" id="iv4-user-drawer-overlay" style="display:none"></div>
      <aside class="iv4-drawer" id="iv4-user-drawer" style="display:none">
        <div class="iv4-drawer-header">
          <span id="iv4-user-drawer-title">إضافة موظف جديد</span>
          <button class="iv4-drawer-close" id="iv4-user-drawer-close">✕</button>
        </div>
        <div class="iv4-drawer-body">
          <form id="iv4-user-form">
            <input type="hidden" id="iv4-user-form-id" value="">

            <div class="iv4-form-field">
              <label>البريد الإلكتروني *</label>
              <input type="email" id="iv4-user-form-email" placeholder="email@example.com" required>
            </div>
            <div class="iv4-form-field">
              <label>الاسم *</label>
              <input type="text" id="iv4-user-form-name" placeholder="اسم الموظف" required>
            </div>
            <div class="iv4-form-field">
              <label>الدور *</label>
              <select id="iv4-user-form-role">
                ${rolesOptions}
              </select>
            </div>
            <div class="iv4-form-field" id="iv4-user-status-field" style="display:none">
              <label>الحالة</label>
              <select id="iv4-user-form-status">
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
              </select>
            </div>

            <div class="iv4-form-actions">
              <button type="submit" class="iv4-btn iv4-btn-primary" id="iv4-user-form-submit">حفظ</button>
              <button type="button" class="iv4-btn iv4-btn-outline" id="iv4-user-form-cancel">إلغاء</button>
            </div>
          </form>
        </div>
      </aside>
    `;
  }

  // ── Events ────────────────────────────────────────────────────────────
  function _bindEvents() {
    const c = _container;
    if (!c) return;

    c.querySelector('#iv4-add-user-btn')?.addEventListener('click', () => _openDrawer(null));
    c.querySelector('#iv4-user-drawer-close')?.addEventListener('click', _closeDrawer);
    c.querySelector('#iv4-user-drawer-overlay')?.addEventListener('click', _closeDrawer);
    c.querySelector('#iv4-user-form-cancel')?.addEventListener('click', _closeDrawer);
    c.querySelector('#iv4-user-form')?.addEventListener('submit', _onSubmit);

    c.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = parseInt(btn.dataset.id, 10);
      if (action === 'edit-user')   _openDrawer(id);
      if (action === 'delete-user') _confirmDelete(id);
    });
  }

  function _openDrawer(userId) {
    const drawer  = _container.querySelector('#iv4-user-drawer');
    const overlay = _container.querySelector('#iv4-user-drawer-overlay');
    const title   = _container.querySelector('#iv4-user-drawer-title');
    const idInput = _container.querySelector('#iv4-user-form-id');
    const emailIn = _container.querySelector('#iv4-user-form-email');
    const nameIn  = _container.querySelector('#iv4-user-form-name');
    const roleIn  = _container.querySelector('#iv4-user-form-role');
    const statusF = _container.querySelector('#iv4-user-status-field');
    const statusIn = _container.querySelector('#iv4-user-form-status');

    _container.querySelector('#iv4-user-form').reset();
    idInput.value = '';
    statusF.style.display = 'none';
    emailIn.disabled = false;

    if (userId) {
      const user = _users.find(u => u.id === userId);
      if (!user) return;
      title.textContent     = `تعديل موظف: ${user.name}`;
      idInput.value         = user.id;
      emailIn.value         = user.email;
      emailIn.disabled      = true; // لا يمكن تغيير الإيميل
      nameIn.value          = user.name;
      roleIn.value          = user.inbox_role_id;
      statusF.style.display = 'block';
      statusIn.value        = user.status;
    } else {
      title.textContent = 'إضافة موظف جديد';
    }

    drawer.style.display  = 'flex';
    overlay.style.display = 'block';
  }

  function _closeDrawer() {
    const drawer  = _container?.querySelector('#iv4-user-drawer');
    const overlay = _container?.querySelector('#iv4-user-drawer-overlay');
    if (drawer)  drawer.style.display  = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  async function _onSubmit(e) {
    e.preventDefault();
    const id     = _container.querySelector('#iv4-user-form-id').value;
    const email  = _container.querySelector('#iv4-user-form-email').value.trim();
    const name   = _container.querySelector('#iv4-user-form-name').value.trim();
    const roleId = parseInt(_container.querySelector('#iv4-user-form-role').value, 10);
    const status = _container.querySelector('#iv4-user-form-status')?.value || 'active';

    const submitBtn = _container.querySelector('#iv4-user-form-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = '…جاري الحفظ';

    try {
      const path2  = id ? `/inbox/settings/users/${id}` : '/inbox/settings/users';
      const method = id ? 'PUT' : 'POST';
      const body   = id
        ? { name, inbox_role_id: roleId, status }
        : { email, name, inbox_role_id: roleId };

      // FIX-009
      const { data, error } = await InboxAPI._fetch(path2, { method, body: JSON.stringify(body) });
      if (error) throw new Error(error);
      if (!data || !data.ok) throw new Error((data && data.error) || 'server_error');

      _closeDrawer();
      _render();
    } catch (err) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'حفظ';
      const msgs = {
        email_taken:           'البريد الإلكتروني مستخدم مسبقاً',
        invalid_role:          'الدور المحدد غير صحيح',
        email_and_name_required: 'البريد والاسم مطلوبان',
      };
      _showError(msgs[err.message] || 'حدث خطأ، حاول مجدداً');
    }
  }

  async function _confirmDelete(id) {
    const user = _users.find(u => u.id === id);
    if (!user) return;
    if (!confirm(`هل تريد إزالة "${user.name}" من الـ Inbox؟`)) return;

    try {
      // FIX-009
      const { data, error } = await InboxAPI._fetch(`/inbox/settings/users/${id}`, { method: 'DELETE' });
      if (error || (data && !data.ok)) {
        if (data && data.error === 'last_owner') {
          _showError('لا يمكن إزالة آخر مالك (Owner) — أضف مالكاً آخر أولاً');
        } else {
          _showError('لا يمكن إزالة هذا الموظف');
        }
        return;
      }
      _render();
    } catch (_) {
      _showError('حدث خطأ أثناء الإزالة');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function _initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  function _formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
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
