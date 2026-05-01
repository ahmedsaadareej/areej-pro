/**
 * team-settings.js — إدارة المستخدمين + فريق الرد
 * Owner/Admin فقط
 */

// ── State ────────────────────────────────────────────────────────────────────
let tsUsers = [], tsRoles = [], tsTeams = [];
let tsEditingUser = null, tsEditingRole = null, tsEditingTeam = null;

// ── Init ─────────────────────────────────────────────────────────────────────
// إدارة المستخدمين (صفحة مستقلة)
async function initTeamSettings() {
  await Promise.all([tsLoadUsers(), tsLoadRoles()]);
  tsShowTab('users');
}

// فريق الرد (داخل إعدادات الرسائل)
async function initInboxTeam() {
  await tsLoadTeams();
  itShowTab('it-teams');
}

function itShowTab(tab) {
  document.querySelectorAll('.it-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('it-tab-active', active);
    if (active) { b.style.background='var(--brand,#1B5E30)'; b.style.color='#fff'; b.style.borderColor='var(--brand,#1B5E30)'; }
    else { b.style.background=''; b.style.color=''; b.style.borderColor=''; }
  });
  document.querySelectorAll('.it-section').forEach(s => {
    s.style.display = s.dataset.tab === tab ? '' : 'none';
  });
  if (tab === 'it-teams')        itRenderTeams();
  if (tab === 'it-distribution') tsLoadDistribution();
  if (tab === 'it-workhours')    tsLoadWorkHours();
  if (tab === 'it-reports')      tsLoadReports();
}

function itRenderTeams() {
  const el = document.getElementById('it-teams-list');
  if (!el) return;
  if (!tsTeams.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af">لا توجد فرق — اضغط "+ إضافة فريق"</div>';
    return;
  }
  el.innerHTML = tsTeams.map(t => `
    <div class="card" style="margin-bottom:8px;padding:12px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:12px;height:12px;border-radius:50%;background:${t.color||'#1B5E30'};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${esc(t.name)}</div>
        ${t.description ? '<div style="font-size:11px;color:#6b7280">' + esc(t.description) + '</div>' : ''}
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">${t.member_count||0} عضو</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="tsOpenTeamModal(${t.id})" class="btn btn-sm" style="padding:4px 10px;font-size:11px">تعديل</button>
        <button onclick="tsDeleteTeam(${t.id},'${esc(t.name)}')" class="btn btn-sm" style="padding:4px 10px;font-size:11px;color:#ef4444;border-color:#fecaca">حذف</button>
      </div>
    </div>`).join('');
}

// ── Tab Navigation (إدارة المستخدمين) ───────────────────────────────────────
function tsShowTab(tab) {
  document.querySelectorAll('.ts-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('ts-tab-active', active);
    if (active) { b.style.background='var(--brand,#1B5E30)'; b.style.color='#fff'; b.style.borderColor='var(--brand,#1B5E30)'; }
    else { b.style.background=''; b.style.color=''; b.style.borderColor=''; }
  });
  document.querySelectorAll('.ts-section').forEach(s => {
    s.style.display = s.dataset.tab === tab ? '' : 'none';
  });
  if (tab === 'users') tsRenderUsers();
  if (tab === 'roles') tsRenderRoles();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — المستخدمون
// ══════════════════════════════════════════════════════════════════════════════
async function tsLoadUsers() {
  const d = await apiFetch('/api/system/team/users');
  if (d.ok) tsUsers = d.users;
}

function tsRenderUsers() {
  const el = document.getElementById('ts-users-list');
  if (!el) return;
  if (!tsUsers.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af">لا يوجد موظفون بعد — اضغط "+ إضافة موظف"</div>`;
    return;
  }
  el.innerHTML = tsUsers.map(u => `
    <div class="ts-row" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f3f4f6">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--brand,#1B5E30);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">
        ${(u.name||'?')[0]}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${u.name}</div>
        <div style="font-size:12px;color:#6b7280">${u.email}</div>
      </div>
      <div style="flex:1;min-width:0">
        <span style="font-size:12px;background:#f0fdf4;color:#166534;padding:2px 8px;border-radius:12px">${u.role_name || 'بدون دور'}</span>
        ${u.team_name ? `<span style="font-size:12px;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:12px;margin-right:4px">${u.team_name}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${u.agent_status==='online'?'#22c55e':'#d1d5db'};display:inline-block"></span>
        <span style="font-size:12px;color:#6b7280">${u.agent_status==='online'?'متصل':'غير متصل'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;padding:2px 8px;border-radius:12px;background:${u.active?'#f0fdf4':'#fef2f2'};color:${u.active?'#166534':'#991b1b'}">${u.active?'نشط':'موقوف'}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="tsOpenUserModal(${u.id})" class="btn btn-sm" style="font-size:11px">✏️ تعديل</button>
        <button onclick="tsDeleteUser(${u.id},'${u.name}')" class="btn btn-sm" style="font-size:11px;background:#fff;color:#ef4444;border-color:#fca5a5">🗑️</button>
      </div>
    </div>
  `).join('');
}

function tsOpenUserModal(userId = null) {
  tsEditingUser = userId ? tsUsers.find(u => u.id === userId) : null;
  const u = tsEditingUser;
  document.getElementById('ts-user-modal-title').textContent = u ? 'تعديل موظف' : 'إضافة موظف جديد';
  document.getElementById('ts-user-name').value = u?.name || '';
  document.getElementById('ts-user-email').value = u?.email || '';
  document.getElementById('ts-user-password').value = '';
  document.getElementById('ts-user-password').placeholder = u ? '• اتركه فارغاً لعدم التغيير' : 'كلمة المرور *';
  document.getElementById('ts-user-max').value = u?.max_concurrent ?? 10;
  document.getElementById('ts-user-telegram').value = u?.notify_telegram_id || '';
  document.getElementById('ts-user-active').checked = u ? !!u.active : true;
  document.getElementById('ts-user-inbox').checked = u ? !!u.inbox_active : true;

  // نملأ الأدوار
  const roleSelect = document.getElementById('ts-user-role');
  roleSelect.innerHTML = `<option value="">بدون دور</option>` +
    tsRoles.map(r => `<option value="${r.id}" ${u?.role_id==r.id?'selected':''}>${r.name}</option>`).join('');

  document.getElementById('ts-user-modal').style.display = 'flex';
}

function tsCloseUserModal() {
  document.getElementById('ts-user-modal').style.display = 'none';
  tsEditingUser = null;
}

async function tsSaveUser() {
  const name = document.getElementById('ts-user-name').value.trim();
  const email = document.getElementById('ts-user-email').value.trim();
  const password = document.getElementById('ts-user-password').value;
  const role_id = document.getElementById('ts-user-role').value || null;
  const max_concurrent = +document.getElementById('ts-user-max').value || 10;
  const notify_telegram_id = document.getElementById('ts-user-telegram').value.trim() || null;
  const active = document.getElementById('ts-user-active').checked ? 1 : 0;
  const inbox_active = document.getElementById('ts-user-inbox').checked ? 1 : 0;

  if (!name || !email) return alert('الاسم والإيميل مطلوبان');
  if (!tsEditingUser && !password) return alert('كلمة المرور مطلوبة للموظف الجديد');

  const body = { name, email, role_id, max_concurrent, notify_telegram_id, active, inbox_active };
  if (password) body.password = password;

  const url = tsEditingUser ? `/api/system/team/users/${tsEditingUser.id}` : '/api/system/team/users';
  const method = tsEditingUser ? 'PUT' : 'POST';
  const d = await apiFetch(url, { method, body: JSON.stringify(body) });
  if (!d.ok) return alert(d.error || 'حدث خطأ');

  tsCloseUserModal();
  await tsLoadUsers();
  tsRenderUsers();
}

async function tsDeleteUser(id, name) {
  if (!confirm(`حذف الموظف "${name}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
  const d = await apiFetch(`/api/system/team/users/${id}`, { method: 'DELETE' });
  if (!d.ok) return alert(d.error || 'حدث خطأ');
  await tsLoadUsers();
  tsRenderUsers();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — الأدوار والصلاحيات
// ══════════════════════════════════════════════════════════════════════════════
const TS_PERMISSIONS = [
  { key: 'products',     label: '📦 المنتجات' },
  { key: 'invoices',     label: '🧾 الفواتير' },
  { key: 'orders',       label: '📋 الأوردرات' },
  { key: 'crm',          label: '👥 CRM' },
  { key: 'treasury',     label: '💰 الخزينة' },
  { key: 'wallets',      label: '👛 المحافظ' },
  { key: 'hr',           label: '🧑‍💼 HR' },
  { key: 'affiliates',   label: '🤝 التسويق' },
  { key: 'followup',     label: '📞 المتابعة' },
  { key: 'suppliers',    label: '🏭 الموردين' },
  { key: 'inbox',        label: '📨 الإنباكس' },
  { key: 'reports',      label: '📊 التقارير' },
  { key: 'users',        label: '👤 إدارة المستخدمين' },
  { key: 'team_settings',label: '⚙️ إعدادات الفريق' },
  { key: 'shipping',     label: '🚚 الشحن' },
];

async function tsLoadRoles() {
  const d = await apiFetch('/api/system/team/roles');
  if (d.ok) tsRoles = d.roles;
}

function tsRenderRoles() {
  const el = document.getElementById('ts-roles-list');
  if (!el) return;
  el.innerHTML = tsRoles.map(r => `
    <div class="ts-role-card" style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <span style="font-weight:700;font-size:15px">${r.name}</span>
          <span style="font-size:12px;color:#6b7280;margin-right:8px">${r.user_count} موظف</span>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="tsOpenRoleModal(${r.id})" class="btn btn-sm" style="font-size:11px">✏️ تعديل</button>
          <button onclick="tsDeleteRole(${r.id},'${r.name}')" class="btn btn-sm" style="font-size:11px;background:#fff;color:#ef4444;border-color:#fca5a5">🗑️</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${TS_PERMISSIONS.map(p => `
          <span style="font-size:11px;padding:3px 8px;border-radius:8px;background:${r.permissions[p.key]?'#f0fdf4':'#f9fafb'};color:${r.permissions[p.key]?'#166534':'#9ca3af'};border:1px solid ${r.permissions[p.key]?'#bbf7d0':'#e5e7eb'}">
            ${r.permissions[p.key]?'✅':'—'} ${p.label}
          </span>
        `).join('')}
      </div>
    </div>
  `).join('') || `<div style="text-align:center;padding:40px;color:#9ca3af">لا توجد أدوار — اضغط "+ إضافة دور"</div>`;
}

function tsOpenRoleModal(roleId = null) {
  tsEditingRole = roleId ? tsRoles.find(r => r.id === roleId) : null;
  const r = tsEditingRole;
  document.getElementById('ts-role-modal-title').textContent = r ? 'تعديل الدور' : 'إضافة دور جديد';
  document.getElementById('ts-role-name').value = r?.name || '';

  const permsEl = document.getElementById('ts-role-permissions');
  permsEl.innerHTML = TS_PERMISSIONS.map(p => `
    <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer">
      <input type="checkbox" name="perm_${p.key}" ${r?.permissions[p.key] ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--brand,#1B5E30)">
      <span style="font-size:13px">${p.label}</span>
    </label>
  `).join('');

  document.getElementById('ts-role-modal').style.display = 'flex';
}

function tsCloseRoleModal() {
  document.getElementById('ts-role-modal').style.display = 'none';
  tsEditingRole = null;
}

async function tsSaveRole() {
  const name = document.getElementById('ts-role-name').value.trim();
  if (!name) return alert('اسم الدور مطلوب');

  const permissions = {};
  TS_PERMISSIONS.forEach(p => {
    permissions[p.key] = document.querySelector(`input[name="perm_${p.key}"]`)?.checked || false;
  });

  const url = tsEditingRole ? `/api/system/team/roles/${tsEditingRole.id}` : '/api/system/team/roles';
  const method = tsEditingRole ? 'PUT' : 'POST';
  const d = await apiFetch(url, { method, body: JSON.stringify({ name, permissions }) });
  if (!d.ok) return alert(d.error || 'حدث خطأ');

  tsCloseRoleModal();
  await tsLoadRoles();
  tsRenderRoles();
}

async function tsDeleteRole(id, name) {
  if (!confirm(`حذف الدور "${name}"؟`)) return;
  const d = await apiFetch(`/api/system/team/roles/${id}`, { method: 'DELETE' });
  if (!d.ok) return alert(d.error || 'حدث خطأ');
  await tsLoadRoles();
  tsRenderRoles();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — الفرق
// ══════════════════════════════════════════════════════════════════════════════
async function tsLoadTeams() {
  const d = await apiFetch('/api/system/team/teams');
  if (d.ok) tsTeams = d.teams;
}

function tsRenderTeams() {
  const el = document.getElementById('ts-teams-list');
  if (!el) return;
  if (!tsTeams.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af">لا توجد فرق — اضغط "+ إضافة فريق"</div>`;
    return;
  }
  el.innerHTML = tsTeams.map(t => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:10px;height:10px;border-radius:50%;background:${t.color||'#1B5E30'}"></div>
          <span style="font-weight:700;font-size:15px">${t.name}</span>
          <span style="font-size:12px;color:#6b7280">${t.description||''}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="tsOpenTeamModal(${t.id})" class="btn btn-sm" style="font-size:11px">✏️ تعديل</button>
          <button onclick="tsDeleteTeam(${t.id},'${t.name}')" class="btn btn-sm" style="font-size:11px;background:#fff;color:#ef4444;border-color:#fca5a5">🗑️</button>
        </div>
      </div>
      <div style="display:flex;gap:16px;font-size:12px;color:#6b7280;margin-bottom:10px">
        <span>👤 المشرف: <strong>${t.supervisor_name||'غير محدد'}</strong></span>
        <span>👥 الأعضاء: <strong>${t.member_count}</strong></span>
        <span>🟢 متصل: <strong>${t.online_count}</strong></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${t.channels.map(ch => `<span style="font-size:11px;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:8px">${ch}</span>`).join('')}
        ${t.members.map(m => `
          <span style="font-size:11px;background:#f9fafb;color:#374151;padding:2px 8px;border-radius:8px;display:inline-flex;align-items:center;gap:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:${m.agent_status==='online'?'#22c55e':'#d1d5db'}"></span>
            ${m.name}
          </span>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function tsOpenTeamModal(teamId = null) {
  tsEditingTeam = teamId ? tsTeams.find(t => t.id === teamId) : null;
  const t = tsEditingTeam;
  document.getElementById('ts-team-modal-title').textContent = t ? 'تعديل الفريق' : 'إضافة فريق جديد';
  document.getElementById('ts-team-name').value = t?.name || '';
  document.getElementById('ts-team-desc').value = t?.description || '';
  document.getElementById('ts-team-color').value = t?.color || '#1B5E30';

  // Supervisor
  const supSelect = document.getElementById('ts-team-supervisor');
  supSelect.innerHTML = `<option value="">بدون مشرف</option>` +
    tsUsers.map(u => `<option value="${u.id}" ${t?.supervisor_id==u.id?'selected':''}>${u.name}</option>`).join('');

  // Members checkboxes
  const membersEl = document.getElementById('ts-team-members');
  const memberIds = (t?.members||[]).map(m => m.id);
  membersEl.innerHTML = tsUsers.map(u => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer">
      <input type="checkbox" name="tm_${u.id}" ${memberIds.includes(u.id)?'checked':''} style="width:15px;height:15px;accent-color:var(--brand,#1B5E30)">
      <span style="font-size:13px">${u.name}</span>
      <span style="font-size:11px;color:#6b7280">${u.role_name||''}</span>
    </label>
  `).join('');

  // Channels
  const allChannels = ['telegram','whatsapp','meta','instagram'];
  const chanEl = document.getElementById('ts-team-channels');
  const activeCh = t?.channels || [];
  chanEl.innerHTML = allChannels.map(ch => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer">
      <input type="checkbox" name="tch_${ch}" ${activeCh.includes(ch)?'checked':''} style="width:15px;height:15px;accent-color:var(--brand,#1B5E30)">
      <span style="font-size:13px">${{telegram:'📨 تيليجرام',whatsapp:'📲 واتساب',meta:'💦 ماسنجر',instagram:'📸 إنستجرام'}[ch]}</span>
    </label>
  `).join('');

  document.getElementById('ts-team-modal').style.display = 'flex';
}

function tsCloseTeamModal() {
  document.getElementById('ts-team-modal').style.display = 'none';
  tsEditingTeam = null;
}

async function tsSaveTeam() {
  const name = document.getElementById('ts-team-name').value.trim();
  if (!name) return alert('اسم الفريق مطلوب');

  const members = tsUsers
    .filter(u => document.querySelector(`input[name="tm_${u.id}"]`)?.checked)
    .map(u => ({ user_id: u.id, max_concurrent: 10 }));

  const channels = ['telegram','whatsapp','meta','instagram']
    .filter(ch => document.querySelector(`input[name="tch_${ch}"]`)?.checked);

  const body = {
    name,
    description: document.getElementById('ts-team-desc').value.trim() || null,
    color: document.getElementById('ts-team-color').value,
    supervisor_id: document.getElementById('ts-team-supervisor').value || null,
    members, channels
  };

  const url = tsEditingTeam ? `/api/system/team/teams/${tsEditingTeam.id}` : '/api/system/team/teams';
  const method = tsEditingTeam ? 'PUT' : 'POST';
  const d = await apiFetch(url, { method, body: JSON.stringify(body) });
  if (!d.ok) return alert(d.error || 'حدث خطأ');

  tsCloseTeamModal();
  await tsLoadTeams();
  tsRenderTeams();
}

async function tsDeleteTeam(id, name) {
  if (!confirm(`حذف الفريق "${name}"؟`)) return;
  const d = await apiFetch(`/api/system/team/teams/${id}`, { method: 'DELETE' });
  if (!d.ok) return alert(d.error || 'حدث خطأ');
  await tsLoadTeams();
  tsRenderTeams();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — التوزيع
// ══════════════════════════════════════════════════════════════════════════════
async function tsLoadDistribution() {
  const d = await apiFetch('/api/system/team/distribution');
  if (!d.ok) return;
  const s = d.settings;
  document.getElementById('ts-dist-method').value = s.method || 'manual';
  document.getElementById('ts-dist-auto').checked = !!s.auto_assign_new;
  document.getElementById('ts-dist-fallback').checked = !!s.fallback_to_queue;
  document.getElementById('ts-dist-max').value = s.max_concurrent || 10;
  document.getElementById('ts-dist-notify').checked = !!s.notify_telegram;

  // Channel routing
  const routingEl = document.getElementById('ts-channel-routing');
  const teamOptions = `<option value="">الكل (بدون تخصيص)</option>` +
    tsTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  const platforms = [
    { key: 'telegram', label: '📨 تيليجرام' },
    { key: 'whatsapp', label: '📲 واتساب' },
    { key: 'meta',     label: '💦 ماسنجر' },
    { key: 'instagram',label: '📸 إنستجرام' },
  ];

  routingEl.innerHTML = platforms.map(p => {
    const current = d.routing.find(r => r.platform === p.key);
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6">
        <span style="font-size:14px;width:120px">${p.label}</span>
        <select id="ts-route-${p.key}" style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-family:Cairo,sans-serif;font-size:13px">
          ${teamOptions}
        </select>
      </div>
    `;
  }).join('');

  // تعيين القيم الحالية
  d.routing.forEach(r => {
    const sel = document.getElementById(`ts-route-${r.platform}`);
    if (sel) sel.value = r.team_id || '';
  });
}

async function tsSaveDistribution() {
  const routing = ['telegram','whatsapp','meta','instagram'].map(p => ({
    platform: p,
    team_id: document.getElementById(`ts-route-${p}`)?.value || null
  }));

  const body = {
    method:            document.getElementById('ts-dist-method').value,
    auto_assign_new:   document.getElementById('ts-dist-auto').checked,
    fallback_to_queue: document.getElementById('ts-dist-fallback').checked,
    max_concurrent:    +document.getElementById('ts-dist-max').value || 10,
    notify_telegram:   document.getElementById('ts-dist-notify').checked,
    routing
  };

  const d = await apiFetch('/api/system/team/distribution', { method: 'POST', body: JSON.stringify(body) });
  if (d.ok) {
    const btn = document.getElementById('ts-save-dist-btn');
    if (btn) { btn.textContent = '✅ تم الحفظ'; setTimeout(() => btn.textContent = '💾 حفظ إعدادات التوزيع', 2000); }
  } else alert(d.error || 'حدث خطأ');
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — ساعات العمل
// ══════════════════════════════════════════════════════════════════════════════
const TS_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

async function tsLoadWorkHours() {
  const d = await apiFetch('/api/system/team/work-hours');
  if (!d.ok) return;
  document.getElementById('ts-wh-active').checked = !!d.settings?.work_hours_active;
  document.getElementById('ts-wh-away').value = d.settings?.away_message_workhours || '';

  const el = document.getElementById('ts-work-hours-rows');
  el.innerHTML = d.hours.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6" data-day="${h.day_of_week}">
      <span style="width:60px;font-size:14px;font-weight:600">${TS_DAYS[h.day_of_week]}</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">
        <input type="checkbox" id="ts-wh-off-${h.day_of_week}" ${h.is_off?'checked':''} style="width:15px;height:15px">
        إجازة
      </label>
      <input type="time" id="ts-wh-start-${h.day_of_week}" value="${h.start_time||'09:00'}"
        style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-family:Cairo,sans-serif;font-size:13px">
      <span style="color:#6b7280">→</span>
      <input type="time" id="ts-wh-end-${h.day_of_week}" value="${h.end_time||'17:00'}"
        style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-family:Cairo,sans-serif;font-size:13px">
    </div>
  `).join('');
}

async function tsSaveWorkHours() {
  const hours = [0,1,2,3,4,5,6].map(day => ({
    day_of_week: day,
    is_off:      document.getElementById(`ts-wh-off-${day}`)?.checked ? 1 : 0,
    start_time:  document.getElementById(`ts-wh-start-${day}`)?.value || '09:00',
    end_time:    document.getElementById(`ts-wh-end-${day}`)?.value || '17:00',
  }));

  const body = {
    hours,
    work_hours_active:    document.getElementById('ts-wh-active').checked,
    away_message_workhours: document.getElementById('ts-wh-away').value.trim() || null,
  };

  const d = await apiFetch('/api/system/team/work-hours', { method: 'POST', body: JSON.stringify(body) });
  if (d.ok) {
    const btn = document.getElementById('ts-save-wh-btn');
    if (btn) { btn.textContent = '✅ تم الحفظ'; setTimeout(() => btn.textContent = '💾 حفظ ساعات العمل', 2000); }
  } else alert(d.error || 'حدث خطأ');
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6 — التقارير
// ══════════════════════════════════════════════════════════════════════════════
async function tsLoadReports(period = 'today') {
  document.querySelectorAll('.ts-report-period').forEach(b => {
    b.classList.toggle('ts-tab-active', b.dataset.period === period);
  });

  const d = await apiFetch(`/api/system/team/reports?period=${period}`);
  if (!d.ok) return;

  // Totals
  const t = d.totals || {};
  document.getElementById('ts-report-total').textContent    = t.total_conversations || 0;
  document.getElementById('ts-report-open').textContent     = t.open_conversations || 0;
  document.getElementById('ts-report-unassigned').textContent = t.unassigned || 0;
  document.getElementById('ts-report-csat').textContent    = t.avg_csat ? t.avg_csat.toFixed(1) + ' ⭐' : '—';

  // Agent table
  const el = document.getElementById('ts-report-table');
  el.innerHTML = d.agentStats.map(a => `
    <tr>
      <td style="padding:10px 12px;font-weight:600">${a.name}</td>
      <td style="padding:10px 12px;text-align:center">
        <span style="width:8px;height:8px;border-radius:50%;background:${a.agent_status==='online'?'#22c55e':'#d1d5db'};display:inline-block;margin-left:4px"></span>
        ${a.agent_status==='online'?'متصل':'غير متصل'}
      </td>
      <td style="padding:10px 12px;text-align:center">${a.total_conversations||0}</td>
      <td style="padding:10px 12px;text-align:center">${a.total_messages_sent||0}</td>
      <td style="padding:10px 12px;text-align:center">${a.avg_response_min ? Math.round(a.avg_response_min) + ' د' : '—'}</td>
      <td style="padding:10px 12px;text-align:center">${a.avg_csat ? a.avg_csat.toFixed(1) + ' ⭐' : '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">لا توجد بيانات</td></tr>`;
}
