# EX-M3 — تنفيذ M3: App Shell + Navigation
> المرجع: `inbox-v4/plans/M3-navigation.md`
> المهام: T19 → T30 (12 مهمة)
> المتطلب: M1 + M5 مكتملان
> آخر تحديث: 2026-05-04

---

## 📋 حالة المهام

| # | المهمة | النوع | الحالة |
|---|--------|-------|--------|
| T19 | `server/app.js` — `/inbox*` route | Backend | ⏳ |
| T20 | `server/app.js` — `/contacts*` `/reports*` `/settings*` routes | Backend | ⏳ |
| T21 | `public/inbox-v4/index.html` — App Shell HTML | Frontend | ⏳ |
| T22 | `public/inbox-v4/shell.css` | Frontend | ⏳ |
| T23 | `public/inbox-v4/router.js` | Frontend | ⏳ |
| T24 | `public/inbox-v4/shell.js` | Frontend | ⏳ |
| T25 | `stream.js` — نقل init للـ Shell | Frontend | ⏳ |
| T26 | `pages/page-inbox.js` | Frontend | ⏳ |
| T27 | `pages/page-contacts.js` (placeholder) | Frontend | ⏳ |
| T28 | `pages/page-reports.js` | Frontend | ⏳ |
| T29 | `pages/page-settings.js` | Frontend | ⏳ |
| T30 | `dashboard/index.html` — استبدال iframe | Frontend | ⏳ |

---

## 🎯 هدف M3

بناء هيكل التطبيق الجديد: URL routing حقيقي + Sidebar عالمي + Page Modules.
بعد M3، الـ Inbox يعمل كـ SPA كاملة على `/inbox` بدل iframe داخل ERP.

---

## 🔧 المرحلة الأولى — Backend Routes (T19 + T20)

> هذه الخطوتان مستقلتان عن M1/M5 — يمكن تنفيذهما موازياً لكن الأفضل تسلسلياً.

---

### ▶️ T19 — Backend: `server/app.js` — route `/inbox*`

**الملف المعدَّل:**
```
server/app.js
```

**⚠️ خطوة إلزامية قبل الكتابة:**
```bash
grep -n "session\|userId\|user_id" server/routes/auth.js | head -20
# تأكد من اسم حقل الـ session: هل هو req.session.userId أم req.session.user ؟
```

**التعديلات — أضف قبل route `/dashboard*`:**

```javascript
app.get('/inbox*', (req, res) => {
  if (!req.session || !req.session.userId) {  // ← استبدل userId باسم الحقل الصح
    return res.redirect('/auth?redirect=' + encodeURIComponent(req.path));
  }
  res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html'));
});
```

**⚠️ تنبيه ترتيب:** Express يمشي بالترتيب — `/inbox*` يجب أن يكون قبل `/dashboard*`.

**تحقق قبل commit:**
```bash
node --check server/app.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/inbox
# يجب أن يُعيد: 200 (أو redirect لو مش logged in)
```

---

### ▶️ T20 — Backend: `server/app.js` — routes `/contacts*` `/reports*` `/settings*`

**الملف المعدَّل:**
```
server/app.js (نفس ملف T19)
```

**التعديلات — أضف بعد route `/inbox*` مباشرة:**

```javascript
app.get(['/contacts*', '/reports*', '/settings*'], (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth?redirect=' + encodeURIComponent(req.path));
  }
  res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html'));
});
```

**تحقق قبل commit:**
```bash
node --check server/app.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/reports
# يجب أن يُعيد: 200 (نفس HTML صفحة الـ inbox)
```

---

## 🎨 المرحلة الثانية — Frontend Core (T21 → T25)

> T21 → T24 تُبنى بالتسلسل. T25 يأتي بعد T24.

---

### ▶️ T21 — Frontend: `public/inbox-v4/index.html` — App Shell HTML

**الملف الجديد:**
```
public/inbox-v4/index.html
```

**الهيكل الأساسي:**

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inbox — أريج</title>
  <link rel="stylesheet" href="/dashboard/inbox-v4/inbox.css">
  <link rel="stylesheet" href="/inbox-v4/shell.css">
</head>
<body>
  <div id="shell-root">
    <header id="shell-topbar" class="shell-topbar">
      <!-- Logo + Breadcrumb + Agent Status + User Menu -->
    </header>
    <div class="shell-body">
      <nav id="shell-sidebar" class="shell-sidebar">
        <!-- Global Nav Items -->
        <div class="shell-nav-main">
          <a href="/inbox" class="shell-nav-item" data-page="inbox">📥 الـ Inbox</a>
          <a href="/contacts" class="shell-nav-item" data-page="contacts">👥 جهات الاتصال</a>
          <a href="/reports" class="shell-nav-item" data-page="reports">📊 التقارير</a>
          <a href="/settings" class="shell-nav-item" data-page="settings">⚙️ الإعدادات</a>
        </div>
        <!-- Inbox Tools (collapsible) -->
        <div class="shell-nav-tools">
          <button class="shell-nav-collapse-toggle">أدوات الـ Inbox ▾</button>
          <div class="shell-nav-tools-items">
            <a href="/inbox/broadcast" data-page="broadcast">📢 البث</a>
            <a href="/inbox/scheduled" data-page="scheduled">🕐 مجدولة</a>
            <a href="/inbox/chatbot" data-page="chatbot">🤖 Chatbot</a>
          </div>
        </div>
        <!-- Agent Status -->
        <div class="shell-agent-status">
          <span class="shell-status-dot" id="agentStatusDot"></span>
          <select id="agentStatusSelect">
            <option value="online">متاح</option>
            <option value="busy">مشغول</option>
            <option value="away">غائب</option>
            <option value="offline">غير متاح</option>
          </select>
          <span class="shell-sse-dot" id="sseDot" title="SSE"></span>
        </div>
      </nav>
      <main id="shell-content" class="shell-content">
        <!-- Page Modules تُحقن هنا -->
        <div id="shell-loading">جاري التحميل...</div>
      </main>
    </div>
  </div>

  <!-- Scripts — الترتيب إلزامي -->
  <script src="/dashboard/inbox-v4/store.js"></script>
  <script src="/dashboard/inbox-v4/api.js"></script>
  <script src="/inbox-v4/router.js"></script>
  <script src="/inbox-v4/shell.js"></script>
  <!-- Page Modules -->
  <script src="/inbox-v4/pages/page-inbox.js"></script>
  <script src="/inbox-v4/pages/page-contacts.js"></script>
  <script src="/inbox-v4/pages/page-reports.js"></script>
  <script src="/inbox-v4/pages/page-settings.js"></script>
  <!-- Inbox App Scripts (الملفات الموجودة) -->
  <script src="/dashboard/inbox-v4/app.js"></script>
</body>
</html>
```

**تحقق قبل commit:**
```bash
# افتح http://localhost:3002/inbox في المتصفح
# يجب: الصفحة تُحمَّل بدون 404 errors في Console
```

---

### ▶️ T22 — Frontend: `public/inbox-v4/shell.css`

**الملف الجديد:**
```
public/inbox-v4/shell.css
```

**Prefix حصري:** `shell-*` (D-030) — لا تعارض مع `iv4-*`

**ما يتضمنه:**

```css
/* === Layout === */
#shell-root { display: flex; flex-direction: column; height: 100vh; }
.shell-topbar { height: 48px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.shell-body { display: flex; flex: 1; overflow: hidden; }
.shell-sidebar { width: 220px; background: #f9fafb; border-inline-end: 1px solid #e5e7eb; overflow-y: auto; }
.shell-content { flex: 1; overflow-y: auto; background: #fff; }

/* === Nav Items === */
.shell-nav-item { display: flex; align-items: center; padding: 10px 16px; text-decoration: none; color: #374151; border-radius: 6px; margin: 2px 8px; }
.shell-nav-item:hover { background: #f3f4f6; }
.shell-nav-item.active { background: #eff6ff; color: #2563eb; font-weight: 600; }

/* === Agent Status === */
.shell-status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.shell-status-dot.online { background: #22c55e; }
.shell-status-dot.busy { background: #ef4444; }
.shell-status-dot.away { background: #f59e0b; }
.shell-status-dot.offline { background: #9ca3af; }

/* === SSE Indicator === */
.shell-sse-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.shell-sse-dot.disconnected { background: #ef4444; }

/* === Responsive === */
/* Tablet (768px–1024px): sidebar icon-only */
@media (max-width: 1024px) {
  .shell-sidebar { width: 56px; }
  .shell-nav-item span.label { display: none; }
}
/* Mobile (<768px): bottom tab bar */
@media (max-width: 768px) {
  .shell-sidebar { display: none; }
  .shell-content { padding-bottom: 60px; }
  /* shell-bottombar يُضاف من shell.js */
}
```

**تحقق قبل commit:**
```bash
# تحقق بصرياً في 3 أحجام: Desktop + Tablet + Mobile
# لا CSS errors في Console
```

---

### ▶️ T23 — Frontend: `public/inbox-v4/router.js`

**الملف الجديد:**
```
public/inbox-v4/router.js
```

**ما يحتويه:**

```javascript
const InboxRouter = {
  routes: [
    { pattern: /^\/inbox\/conv\/(\d+)$/, page: 'inbox', params: m => ({ convId: m[1] }) },
    { pattern: /^\/inbox\/broadcast$/, page: 'broadcast', params: () => ({}) },
    { pattern: /^\/inbox\/scheduled$/, page: 'scheduled', params: () => ({}) },
    { pattern: /^\/inbox\/chatbot$/, page: 'chatbot', params: () => ({}) },
    { pattern: /^\/contacts\/(\d+)?$/, page: 'contacts', params: m => ({ contactId: m[1] }) },
    { pattern: /^\/reports\/?([\w-]+)?$/, page: 'reports', params: m => ({ section: m[1] }) },
    { pattern: /^\/settings\/?([\w-]+)?$/, page: 'settings', params: m => ({ section: m[1] }) },
    { pattern: /^\/inbox\/?$/, page: 'inbox', params: () => ({}) },
  ],

  navigate(path) {
    history.pushState({}, '', path);
    this._dispatch(path);
  },

  _dispatch(path) {
    for (const route of this.routes) {
      const m = path.match(route.pattern);
      if (m) {
        InboxStore.emit('route:change', {
          page: route.page,
          params: route.params(m)
        });
        return;
      }
    }
    // Default: inbox
    InboxStore.emit('route:change', { page: 'inbox', params: {} });
  },

  init() {
    window.addEventListener('popstate', () => {
      this._dispatch(window.location.pathname);
    });
    // Dispatch الـ route الحالي عند load
    this._dispatch(window.location.pathname);
  }
};
```

**تحقق قبل commit:**
```bash
# في Console:
InboxRouter.navigate('/inbox/conv/1')
# URL يتغير + route:change يُطلق
InboxRouter.navigate('/reports/agents')
# URL يتغير + page=reports, params={section:'agents'}
```

---

### ▶️ T24 — Frontend: `public/inbox-v4/shell.js`

**الملف الجديد:**
```
public/inbox-v4/shell.js
```

**ما يحتويه:**

```javascript
const InboxShell = {
  pageModules: {
    inbox: () => PageInbox,
    contacts: () => PageContacts,
    reports: () => PageReports,
    settings: () => PageSettings,
    broadcast: () => PageInbox,   // يُحمَّل داخل page-inbox
    scheduled: () => PageInbox,
    chatbot: () => PageInbox,
  },

  currentPage: null,

  async init() {
    // 1. جلب بيانات المستخدم
    const me = await InboxAPI.get('/inbox/me');
    InboxStore.state.currentUser = {
      ...me,
      permissions: me.permissions || {}
    };

    // 2. تهيئة SSE
    InboxStream.init();

    // 3. الاستماع لتغييرات الـ Route
    InboxStore.on('route:change', ({ page, params }) => {
      this._loadPage(page, params);
      this._updateSidebarActive(page);
    });

    // 4. تهيئة Sidebar clicks
    this._initSidebar();

    // 5. تهيئة Agent Status
    this._initAgentStatus();

    // 6. إخفاء روابط بدون صلاحية
    this._applyPermissionGuards();

    // 7. بدء الـ Router
    InboxRouter.init();
  },

  _loadPage(page, params) {
    const content = document.getElementById('shell-content');
    if (this.currentPage && this.currentPage.unmount) {
      this.currentPage.unmount();
    }
    content.innerHTML = '';
    const mod = this.pageModules[page];
    if (!mod) return;
    this.currentPage = mod();
    this.currentPage.mount(content, params);
  },

  _updateSidebarActive(page) {
    document.querySelectorAll('.shell-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  _initSidebar() {
    document.querySelectorAll('.shell-nav-item[href]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        InboxRouter.navigate(el.getAttribute('href'));
      });
    });
  },

  _initAgentStatus() {
    const select = document.getElementById('agentStatusSelect');
    const dot = document.getElementById('agentStatusDot');
    if (!select) return;
    select.addEventListener('change', async () => {
      const status = select.value;
      await InboxAPI.post('/inbox/me/status', { status });
      dot.className = 'shell-status-dot ' + status;
    });
  },

  _applyPermissionGuards() {
    // إخفاء روابط Reports لو لا يملك أي صلاحية reports
    if (!InboxStore.can('reports_self') && !InboxStore.can('reports_team') && !InboxStore.can('reports_full')) {
      document.querySelector('[data-page="reports"]')?.remove();
    }
    // إخفاء Settings لو لا يملك أي صلاحية settings
    if (!InboxStore.can('org_settings') && !InboxStore.can('inbox_settings')) {
      document.querySelector('[data-page="settings"]')?.remove();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => InboxShell.init());
```

**تحقق قبل commit:**
```bash
# افتح http://localhost:3002/inbox
# يجب: sidebar يظهر، SSE يشتغل، لا JS errors في Console
```

---

### ▶️ T25 — Frontend: `stream.js` — نقل init للـ Shell

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/stream.js
```

**التعديلات:**

```javascript
// في بداية InboxStream object — إضافة:
_initialized: false,

// في بداية دالة init() — إضافة:
init() {
  if (this._initialized) return;  // ← منع double-init
  this._initialized = true;
  // ... باقي الكود الحالي ...
},

// حذف أي auto-init في أسفل الملف مثل:
// InboxStream.init();          ← احذف
// document.addEventListener('DOMContentLoaded', ...) ← احذف
```

**تحقق قبل commit:**
```bash
node --check public/dashboard/inbox-v4/stream.js
# افتح الـ Inbox + تنقل بين الصفحات:
# SSE لا يُفتح مرتين (تحقق من Network tab في DevTools)
```

---

## 🎨 المرحلة الثالثة — Page Modules (T26 → T30)

---

### ▶️ T26 — Frontend: `pages/page-inbox.js`

**الملف الجديد:**
```
public/inbox-v4/pages/page-inbox.js
```

**ما يحتويه:**

```javascript
const PageInbox = {
  mount(container, params) {
    // 1. حقن HTML الـ 3 أعمدة في container
    container.innerHTML = `
      <div class="iv4-layout">
        <div id="iv4-sidebar">...</div>
        <div id="iv4-conv-list">...</div>
        <div id="iv4-conv-view">...</div>
      </div>
    `;
    // 2. تهيئة الـ App
    InboxApp.init(container);
    // 3. لو فيه convId → افتح المحادثة مباشرة
    if (params.convId) {
      InboxApp.openConversation(params.convId);
    }
  },
  unmount() {
    InboxApp.destroy?.();
  }
};
```

**ملاحظة:** الـ HTML الداخلي يُنقل من `dashboard/inbox-v4/index.html` الحالي.

**تحقق قبل commit:**
```bash
# /inbox → قايمة المحادثات تظهر
# /inbox/conv/1 → المحادثة 1 تُفتح مباشرة
```

---

### ▶️ T27 — Frontend: `pages/page-contacts.js` (placeholder)

**الملف الجديد:**
```
public/inbox-v4/pages/page-contacts.js
```

**ما يحتويه (placeholder بسيط):**

```javascript
const PageContacts = {
  mount(container, params) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <h2>👥 جهات الاتصال</h2>
        <p style="color: #6b7280;">هذا القسم قيد التطوير — سيكون متاحاً قريباً</p>
      </div>
    `;
  },
  unmount() {}
};
```

**تحقق قبل commit:**
```bash
# /contacts → صفحة placeholder تظهر بدون errors
```

---

### ▶️ T28 — Frontend: `pages/page-reports.js`

**الملف الجديد:**
```
public/inbox-v4/pages/page-reports.js
```

**ما يحتويه:**

```javascript
const PageReports = {
  mount(container, params) {
    InboxAnalytics.mount(container, {
      section: params.section || 'overview',
      userRole: InboxStore.state.currentUser.inbox_role_id
    });
  },
  unmount() {
    InboxAnalytics.unmount?.();
  }
};
```

**تحقق قبل commit:**
```bash
# /reports → نظرة عامة Analytics تظهر
# /reports/agents → قسم الموظفين يظهر
```

---

### ▶️ T29 — Frontend: `pages/page-settings.js`

**الملف الجديد:**
```
public/inbox-v4/pages/page-settings.js
```

**ما يحتويه:**

```javascript
const PageSettings = {
  mount(container, params) {
    // redirect من /settings → /settings/org
    if (!params.section) {
      InboxRouter.navigate('/settings/org');
      return;
    }
    InboxSettings.mount(container, { section: params.section });
  },
  unmount() {
    InboxSettings.unmount?.();
  }
};
```

**تحقق قبل commit:**
```bash
# /settings → redirect تلقائي لـ /settings/org
# /settings/channels → قسم القنوات يظهر
```

---

### ▶️ T30 — Frontend: `dashboard/index.html` — استبدال iframe

**الملف المعدَّل:**
```
public/dashboard/index.html
```

**البحث عن:**
```html
<iframe src="/dashboard/inbox-v4/...
```
أو أي `<a href>` للـ Inbox القديم.

**الاستبدال بـ:**
```html
<a href="/inbox" class="nav-item" onclick="window.location.href='/inbox'; return false;">
  📥 الـ Inbox
</a>
```

**أو لو كان يفتح تلقائياً:**
```javascript
// في الـ dashboard JS:
if (currentSection === 'inbox') {
  window.location.href = '/inbox';
}
```

**تحقق قبل commit:**
```bash
# افتح ERP dashboard → اضغط على Inbox
# يجب: الانتقال لـ http://localhost:3002/inbox
```

---

## ✅ معيار إغلاق M3

قبل الانتقال لـ M2، تأكد من كل ما يلي:

- [ ] `curl http://localhost:3002/inbox` يُعيد HTML (200)
- [ ] `curl http://localhost:3002/reports` يُعيد نفس HTML (200)
- [ ] `curl http://localhost:3002/settings` يُعيد نفس HTML (200)
- [ ] الـ Inbox يُحمَّل على `/inbox` بدون JS errors
- [ ] SSE يشتغل مرة واحدة فقط (Network tab)
- [ ] `/inbox/conv/5` يفتح المحادثة مباشرة
- [ ] `/reports` يعرض قسم Analytics
- [ ] الضغط على Inbox في ERP dashboard ينقل لـ `/inbox`
- [ ] git log يظهر commit لكل خطوة منفصلة

---

## 🔗 الخطوة التالية بعد M3

**→ انتقل إلى:** `inbox-v4/execution/EX-M2-settings.md`
