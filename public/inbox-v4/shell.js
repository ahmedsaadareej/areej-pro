/* ============================================================
   Inbox v4 — App Shell Controller
   يتحكم في: Auth → SSE → Router → Page Modules → Sidebar
   الترتيب: loadUserInfo → InboxStream.init → InboxRouter.init
   آخر تحديث: 2026-05-04
   ============================================================ */

const InboxShell = (() => {

  // خريطة الـ pages للـ Page Modules
  const pageModules = {
    inbox    : () => typeof PageInbox    !== 'undefined' ? PageInbox    : null,
    contacts : () => typeof PageContacts !== 'undefined' ? PageContacts : null,
    reports  : () => typeof PageReports  !== 'undefined' ? PageReports  : null,
    settings : () => typeof PageSettings !== 'undefined' ? PageSettings : null,
    // sub-pages تُعالج داخل page-inbox.js
    broadcast: () => typeof PageInbox    !== 'undefined' ? PageInbox    : null,
    scheduled: () => typeof PageInbox    !== 'undefined' ? PageInbox    : null,
    chatbot  : () => typeof PageInbox    !== 'undefined' ? PageInbox    : null,
  };

  // الـ breadcrumb labels لكل page
  const pageLabels = {
    inbox    : 'الـ Inbox',
    contacts : 'جهات الاتصال',
    reports  : 'التقارير',
    settings : 'الإعدادات',
    broadcast: 'البث الجماعي',
    scheduled: 'الرسائل المجدولة',
    chatbot  : 'Chatbot',
  };

  let currentPageKey = null;
  let currentModule  = null;

  // ── جلب بيانات المستخدم الحالي ─────────────────────────────────────────
  async function _loadUserInfo() {
    const { data, error } = await InboxAPI._get('/inbox/me');
    if (error || !data) {
      // token منتهي أو غير صالح → redirect لـ Auth
      window.location.href = '/auth?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    InboxStore.state.currentUser = {
      id          : data.id,
      name        : data.name,
      email       : data.email,
      inbox_role_id: data.inbox_role_id,
      permissions : data.permissions || {},
      has_erp     : data.has_erp,
      has_payment : data.has_payment
    };
    // اسم المستخدم في الـ topbar
    const nameEl = document.getElementById('shellUserName');
    if (nameEl) nameEl.textContent = data.name || '';
    return data;
  }

  // ── تحميل الـ Page Module المناسب ─────────────────────────────────────
  function _loadPage(page, params) {
    const content = document.getElementById('shell-content');
    if (!content) return;

    // unmount الـ page الحالية
    if (currentModule && typeof currentModule.unmount === 'function') {
      currentModule.unmount();
    }
    currentModule = null;

    // أظهر loading مؤقت
    content.innerHTML = '<div class="shell-loading"><div class="shell-spinner"></div></div>';

    const factory = pageModules[page];
    if (!factory) {
      content.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af">الصفحة "${page}" غير معرّفة</div>`;
      return;
    }
    const mod = factory();
    if (!mod) {
      content.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af">Page Module غير محمَّل (${page})</div>`;
      return;
    }

    currentModule  = mod;
    currentPageKey = page;
    content.innerHTML = '';
    // requestAnimationFrame يضمن أن الـ DOM نظيف قبل mount
    requestAnimationFrame(() => mod.mount(content, params));
  }

  // ── تحديث الـ active state في الـ sidebar ─────────────────────────────
  function _updateSidebarActive(page) {
    document.querySelectorAll('.shell-nav-item[data-page]').forEach(el => {
      const isActive = el.dataset.page === page ||
        (page === 'broadcast' && el.dataset.page === 'broadcast') ||
        (page === 'scheduled' && el.dataset.page === 'scheduled') ||
        (page === 'chatbot'   && el.dataset.page === 'chatbot');
      el.classList.toggle('active', isActive);
    });

    // breadcrumb
    const bc = document.getElementById('shellBreadcrumb');
    if (bc) bc.textContent = pageLabels[page] || '';
  }

  // ── ربط clicks الـ sidebar ────────────────────────────────────────────
  function _initSidebar() {
    document.querySelectorAll('.shell-nav-item[href]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        InboxRouter.navigate(el.getAttribute('href'));
      });
    });

    // Collapse toggle لـ أدوات الـ Inbox
    const toggle = document.getElementById('shellToolsToggle');
    const tools  = toggle?.closest('.shell-nav-tools');
    if (toggle && tools) {
      toggle.addEventListener('click', () => {
        tools.classList.toggle('collapsed');
      });
    }
  }

  // ── تهيئة حالة الموظف ─────────────────────────────────────────────────
  function _initAgentStatus() {
    const select = document.getElementById('shellAgentStatusSelect');
    const dot    = document.getElementById('shellAgentStatusDot');
    if (!select || !dot) return;

    // حدد الـ initial status (online افتراضي)
    const initialStatus = InboxStore.state.currentUser?.agentStatus || 'online';
    select.value = initialStatus;
    dot.className = 'shell-status-dot ' + initialStatus;

    select.addEventListener('change', async () => {
      const status = select.value;
      dot.className = 'shell-status-dot ' + status;
      // استخدام PUT /api/inbox/me/status
      await InboxAPI._fetch('/inbox/me/status', {
        method: 'PUT',
        body: JSON.stringify({ status })
      }).catch(() => {});
    });
  }

  // ── إخفاء روابط بدون صلاحية (D-012: Backend + Frontend double-check) ───
  function _applyPermissionGuards() {
    const can = (key) => InboxStore.can ? InboxStore.can(key) : true;

    // التقارير: تحتاج reports_self على الأقل
    if (!can('reports_self') && !can('reports_team') && !can('reports_full')) {
      document.querySelector('[data-page="reports"]')?.remove();
    }
    // الإعدادات: تحتاج org_settings أو inbox_settings
    if (!can('org_settings') && !can('inbox_settings')) {
      document.querySelector('[data-page="settings"]')?.remove();
    }
  }

  // ── مراقبة SSE connection لتحديث الـ dot ─────────────────────────────
  function _watchSseStatus() {
    const dot = document.getElementById('shellSseDot');
    if (!dot) return;

    InboxStore.on('sse:connected', () => {
      dot.className = 'shell-sse-dot';
      dot.title = 'متصل';
    });
    InboxStore.on('sse:disconnected', () => {
      dot.className = 'shell-sse-dot disconnected';
      dot.title = 'انقطع الاتصال';
    });
    InboxStore.on('sse:connecting', () => {
      dot.className = 'shell-sse-dot connecting';
      dot.title = 'جاري الاتصال...';
    });
  }

  // ── Unread Badge ───────────────────────────────────────────────────────
  function _watchUnreadBadge() {
    const badge = document.getElementById('shellUnreadBadge');
    if (!badge) return;

    function _update() {
      const count = InboxStore.state.unreadCount || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    InboxStore.on('unread:change', _update);
    _update(); // initial
  }

  // ── Logout ─────────────────────────────────────────────────────────────
  function _initLogout() {
    const btn = document.getElementById('shellLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // مسح الـ token ثم redirect
      document.cookie = 'pro_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      localStorage.removeItem('pro_token');
      window.location.href = '/auth';
    });
  }

  // ── Bottom Tab Bar للموبايل ────────────────────────────────────────────
  function _initMobileBottomBar() {
    if (window.innerWidth > 768) return;
    const bar = document.createElement('nav');
    bar.id = 'shell-bottombar';
    bar.innerHTML = `
      <a href="/inbox"    class="shell-nav-item" data-page="inbox"><span class="shell-nav-icon">📥</span><span class="shell-nav-label">Inbox</span></a>
      <a href="/contacts" class="shell-nav-item" data-page="contacts"><span class="shell-nav-icon">👥</span><span class="shell-nav-label">جهات</span></a>
      <a href="/reports"  class="shell-nav-item" data-page="reports"><span class="shell-nav-icon">📊</span><span class="shell-nav-label">تقارير</span></a>
      <a href="/settings" class="shell-nav-item" data-page="settings"><span class="shell-nav-icon">⚙️</span><span class="shell-nav-label">إعدادات</span></a>
    `;
    document.body.appendChild(bar);

    bar.querySelectorAll('.shell-nav-item[href]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        InboxRouter.navigate(el.getAttribute('href'));
      });
    });
  }

  // ── MAIN INIT ──────────────────────────────────────────────────────────
  async function init() {
    // 1. جلب بيانات المستخدم (يُعيد null لو مفيش token صالح)
    const user = await _loadUserInfo();
    if (!user) return;

    // 2. SSE (D-028: يحتاج auth أولاً)
    if (typeof InboxStream !== 'undefined' && typeof InboxStream.init === 'function') {
      InboxStream.init();
    }

    // 3. الاستماع لتغييرات الـ Route
    InboxStore.on('route:change', ({ page, params }) => {
      _loadPage(page, params);
      _updateSidebarActive(page);
    });

    // 4. ربط الـ sidebar
    _initSidebar();

    // 5. حالة الموظف
    _initAgentStatus();

    // 6. إخفاء روابط بدون صلاحية
    _applyPermissionGuards();

    // 7. SSE dot
    _watchSseStatus();

    // 8. Unread badge
    _watchUnreadBadge();

    // 9. Logout
    _initLogout();

    // 10. Mobile bottom bar
    _initMobileBottomBar();

    // 11. بدء الـ Router (يُطلق route:change للـ URL الحالي)
    InboxRouter.init();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => InboxShell.init());
