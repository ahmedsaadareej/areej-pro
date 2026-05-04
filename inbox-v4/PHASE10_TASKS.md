# PHASE10_TASKS.md — قائمة مهام التنفيذ الكاملة
> مستخرجة من M1 → M5 (Phase 9)
> تاريخ الكتابة: 2026-05-04
> الحالة: ✅ جاهزة للتنفيذ

---

## 📌 قواعد التنفيذ — إلزامية

قبل البدء بأي جلسة تنفيذ، اقرأ:
1. `inbox-v4/GROUND_TRUTH.md` ← الحقائق الثابتة
2. هذا الملف ← المهمة القادمة
3. ملف المحور المناسب من `inbox-v4/plans/M*.md` ← التفاصيل التقنية

**قواعد لا تُكسر:**
- Migration أولاً قبل أي كود
- `node --check <file>` بعد كل ملف JS
- `git commit` بعد كل خطوة ناجحة
- `git checkout -- <file>` عند أي فشل
- لا تمس `inbox_conversations` أو `inbox_messages` القديمة (v3)
- لا تثبت npm packages جديدة بدون موافقة أحمد
- استخدم `req.inboxUser` (لا `req.user.role`) في كل كود جديد

---

## 🗺️ خريطة التنفيذ — ترتيب المحاور

```
M1 (الصلاحيات) → M5 (Adapter) → M3 (App Shell) → M2 (Settings) → M4 (Analytics)
```

**السبب:**
- M1 أولاً: كل المحاور تعتمد على `inbox_roles` + `req.inboxUser.permissions`
- M5 ثانياً: `inboxAuthAdapter` يُكمل M1 ويوحّد الـ Auth قبل أي ملف آخر
- M3 ثالثاً: App Shell يجب أن يكون جاهزاً قبل M2 و M4 (اللي تعمل كـ Page Modules)
- M2 و M4 بعدين: يعملان داخل App Shell

---

## 🏗️ المحور الأول: M1 — نظام الصلاحيات
> المرجع التقني: `inbox-v4/plans/M1-permissions.md`
> الأولوية: 🔴 أعلى أولوية — كل المحاور تعتمد عليه

### T01 — Migration: `inbox_roles`
- **الملف:** `server/migrations/inbox-v4/M1_001_inbox_roles.js`
- **العملية:** إنشاء جدول `inbox_roles` + seed الأدوار الثابتة الخمسة
- **الأدوار:** Owner(1) / Admin(2) / Supervisor(3) / Agent(4) / Read-only(5)
- **تحقق:** `node --check` + تأكد seed وصل `SELECT COUNT(*) FROM inbox_roles` = 5
- **المرجع:** M1 § Migration 001

### T02 — Migration: `inbox_users`
- **الملف:** `server/migrations/inbox-v4/M1_002_inbox_users.js`
- **العملية:** إنشاء جدول `inbox_users` (tenant_user_id nullable)
- **تحقق:** `node --check` + تأكد UNIQUE على email
- **المرجع:** M1 § Migration 002

### T03 — Migration: Team Role Override
- **الملف:** `server/migrations/inbox-v4/M1_003_team_role_override.js`
- **العملية:** `ALTER TABLE inbox_team_members ADD COLUMN role_override TEXT DEFAULT NULL`
- **تحذير:** لا تمس جدول `inbox_teams` القديم — فقط `inbox_team_members`
- **تحقق:** `PRAGMA table_info(inbox_team_members)` تظهر `role_override`
- **المرجع:** M1 § Migration 003

### T04 — Backend: `permissions.js`
- **الملف:** `server/routes/inbox/permissions.js` ← جديد
- **العملية:** `loadInboxPermissions()` + `requirePermission(key)` middleware
- **تحقق:** `node --check server/routes/inbox/permissions.js`
- **المرجع:** M1 § permissions.js

### T05 — Backend: `settings.js` — Roles API
- **الملف:** `server/routes/inbox/settings.js` ← جديد (shell فارغ + Roles endpoints)
- **الـ Routes:**
  - `GET /inbox/settings/roles`
  - `POST /inbox/settings/roles` ← requirePermission('team_manage')
  - `PUT /inbox/settings/roles/:id` ← يرفض is_system=1
  - `DELETE /inbox/settings/roles/:id` ← يرفض لو users موجودون عليه
- **تحقق:** `node --check` + smoke test GET
- **المرجع:** M1 § settings.js (Roles)

### T06 — Backend: `settings.js` — Users API
- **الملف:** `server/routes/inbox/settings.js` ← تكملة T05
- **الـ Routes:**
  - `GET /inbox/settings/users`
  - `POST /inbox/settings/users`
  - `PUT /inbox/settings/users/:id`
  - `DELETE /inbox/settings/users/:id` ← يرفض لو آخر Owner
- **تحقق:** `node --check` + smoke test GET
- **المرجع:** M1 § settings.js (Users)

### T07 — Backend: تحديث `index.js` — إضافة requirePermission على Routes
- **الملف:** `server/routes/inbox/index.js` ← تعديل
- **العملية:** `require('./permissions')` + تطبيق `requirePermission` على:
  - `/analytics/*` ← reports_full / reports_team / reports_self
  - `/settings/roles` ← team_manage
  - `/settings/channels` ← channels
- **تحقق:** `node --check` + تأكد 401 عند طلب بدون صلاحية
- **المرجع:** M1 § تعديل index.js

### T08 — Frontend: تحديث `store.js`
- **الملف:** `public/dashboard/inbox-v4/store.js` ← تعديل
- **العملية:** إضافة `currentUser.permissions = {}` في state + دالة `InboxStore.can(key)`
- **تحقق:** افتح الـ Inbox في المتصفح — `InboxStore.state.currentUser` موجود في Console
- **المرجع:** M1 § store.js

### T09 — Frontend: Route Guards في `app.js`
- **الملف:** `public/dashboard/inbox-v4/app.js` ← تعديل
- **العملية:** دالة `guardRoute(permKey)` + تطبيقها على openSettings / openReports
- **تحقق:** موظف بدون صلاحية يرى رسالة "ليس لديك صلاحية"
- **المرجع:** M1 § Route Guards

### T10 — Frontend: Settings UI — صفحة الأدوار
- **الملف:** `public/dashboard/inbox-v4/settings/roles.js` ← جديد
- **العملية:** قايمة الأدوار (system مقفول + custom قابل للتعديل) + Drawer إنشاء دور
- **تحقق:** عرض الأدوار الخمسة الثابتة بدون زر تعديل عليها
- **المرجع:** M1 § UI صفحة Roles

### T11 — Frontend: Settings UI — صفحة المستخدمين
- **الملف:** `public/dashboard/inbox-v4/settings/users.js` ← جديد
- **العملية:** قايمة موظفي الـ Inbox + إضافة موظف + تعديل الدور + إزالة
- **تحقق:** إضافة موظف وتحديد دوره يظهر في القايمة
- **المرجع:** M1 § UI صفحة Users

---

## 🔌 المحور الثاني: M5 — Auth Adapter (الجزء المتعلق بـ M1)
> المرجع التقني: `inbox-v4/plans/M5-standalone.md`
> يُنفَّذ فور اكتمال M1 — هو امتداد طبيعي له

### T12 — Backend: `inbox-auth-adapter.js`
- **الملف:** `server/inbox-auth-adapter.js` ← جديد
- **العملية:** Middleware يُنشئ `req.inboxUser` من req.user + req.tenantUser
- **منطق Fallback:**
  - tenantUser موجود → يحوّل ERP role_id لـ inbox_role_id مؤقتاً
  - Owner مباشر → inbox_role_id=1 + OWNER_PERMISSIONS
  - لا يوجد → 401
- **تحقق:** `node --check server/inbox-auth-adapter.js`
- **المرجع:** M5 § STEP 1

### T13 — Backend: تحديث `inbox/index.js` — تفعيل Adapter
- **الملف:** `server/routes/inbox/index.js` ← تعديل
- **العملية:** إضافة `require('../../inbox-auth-adapter')` + `router.use(inboxAuthAdapter)` بعد getTenantDb
- **ملاحظة:** `req.db` و `req.user` يبقيان بدون تغيير
- **تحقق:** `node --check` + تأكد `req.inboxUser` موجود في أي route
- **المرجع:** M5 § STEP 2

### T14 — Backend: تحديث `context.js` — ERP Plugin Guard
- **الملف:** `server/routes/inbox/context.js` ← تعديل
- **العملية:** كل endpoint ERP-dependent يتحقق من `req.inboxUser.has_erp`
  - GET → يُعيد `[]` لو has_erp=false
  - POST/write → يُعيد 403 + `{ code: 'NO_ERP' }`
- **تحقق:** `node --check` + لا 500 عند has_erp=false
- **المرجع:** M5 § STEP 3

### T15 — Backend: تحديث `team.js` — إصلاح req.user.role
- **الملف:** `server/routes/inbox/team.js` ← تعديل
- **العملية:** استبدال كل `req.user.role === 'owner'/'admin'` بـ `req.inboxUser.permissions.team_manage`
- **تحقق:** `grep -n "req.user.role\|req.tenantUser.id" server/routes/inbox/team.js` لا نتائج
- **المرجع:** M5 § STEP 4

### T16 — Backend: تحديث `conversations.js`
- **الملف:** `server/routes/inbox/conversations.js` ← تعديل
- **العملية:** استبدال req.tenantUser.id → req.inboxUser.id في كل الـ agent references
- **تحقق:** `grep -n "req\.tenantUser" server/routes/inbox/conversations.js` لا نتائج
- **المرجع:** M5 § STEP 5

### T17 — Backend: تحديث باقي ملفات inbox/routes
- **الترتيب الإلزامي (كل ملف = commit مستقل):**
  1. `stream.js` ← `userId = req.inboxUser.id` موحّد
  2. `messages.js` ← req.tenantUser → req.inboxUser
  3. `analytics.js` ← req.tenantUser → req.inboxUser + تحديث getInboxRole()
  4. `automation.js`
  5. `broadcast.js`
  6. `chatbot.js`
  7. `email.js`
  8. `labels.js`
  9. `search.js`
  10. `ai.js`
- **تحقق بعد كل ملف:** `node --check` + `grep -n "req\.tenantUser\|req\.user\.role"` = لا نتائج
- **المرجع:** M5 § STEP 6

### T18 — Frontend: `api.js` — إضافة InboxConfig
- **الملف:** `public/dashboard/inbox-v4/api.js` ← تعديل
- **العملية:** إضافة `InboxConfig = { baseUrl, apiBase, ... }` في أعلى الملف
- **تحقق:** `InboxConfig.apiBase` يظهر صح في Console
- **المرجع:** M5 § STEP 7

---

## 🧱 المحور الثالث: M3 — App Shell + Navigation
> المرجع التقني: `inbox-v4/plans/M3-navigation.md`
> يُنفَّذ بعد M1 + M5 — يبني الهيكل الذي تعيش فيه M2 و M4

### T19 — Backend: إضافة `/inbox*` route في `server/app.js`
- **الملف:** `server/app.js` ← تعديل
- **العملية:** إضافة route قبل `/dashboard*`:
  ```javascript
  app.get('/inbox*', (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth?redirect=' + encodeURIComponent(req.path));
    }
    res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html'));
  });
  ```
- **تنبيه:** يُضاف قبل سطر `/dashboard*` — Express يمشي بالترتيب
- **تنبيه:** تحقق من اسم field الـ session (`userId` أو `user`) في `server/routes/auth.js` أولاً
- **تحقق:** `curl http://localhost:3002/inbox` يُعيد HTML

### T20 — Backend: إضافة `/contacts*` + `/reports*` + `/settings*` routes
- **الملف:** `server/app.js` ← تكملة T19
- **العملية:** نفس pattern T19 لـ routes الأخرى:
  ```javascript
  app.get(['/contacts*','/reports*','/settings*'], (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth?redirect=' + encodeURIComponent(req.path));
    }
    res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html'));
  });
  ```
- **تحقق:** `curl http://localhost:3002/reports` يُعيد نفس HTML

### T21 — Frontend: إنشاء `public/inbox-v4/index.html`
- **الملف:** `public/inbox-v4/index.html` ← جديد
- **العملية:** App Shell HTML — يحتوي على:
  - `<link>` لـ shell.css + inbox.css الحالي
  - `<div id="shell-root">` يضم Top Bar + Sidebar + Content Area
  - Global Sidebar: 4 أقسام رئيسية + قسم Inbox Tools collapsible + Agent Status
  - `<div id="shell-content">` = المنطقة المتغيرة
  - `<script>` tags بالترتيب: store.js → api.js → router.js → shell.js → page-*.js
- **CSS Classes:**
  - `shell-sidebar` (220px) ← ثابت
  - `shell-topbar` (48px)
  - `shell-content` (flex-1)
- **تحقق:** الصفحة تُحمَّل بدون JS errors

### T22 — Frontend: إنشاء `public/inbox-v4/shell.css`
- **الملف:** `public/inbox-v4/shell.css` ← جديد
- **Prefix:** `shell-*` حصري (D-030) — لا يتعارض مع `iv4-*`
- **المحتوى:**
  - Layout: Topbar (48px) + Sidebar (220px) + Content Area
  - Sidebar: nav items + active states + Inbox Tools collapse
  - Agent Status badge (online/busy/away/offline)
  - SSE indicator dot
  - Responsive: Tablet (56px icon-only) + Mobile (bottom tab bar)
- **تحقق:** Layout يظهر صح على 3 breakpoints

### T23 — Frontend: إنشاء `public/inbox-v4/router.js`
- **الملف:** `public/inbox-v4/router.js` ← جديد
- **العملية:** Router داخلي كامل:
  - `InboxRouter.navigate(path)` ← يستخدم `history.pushState`
  - يستمع لـ `popstate` (زر Back/Forward)
  - يقرأ `window.location.pathname` عند load
  - Route Patterns:
    - `/inbox/conv/:id` → page=inbox, params={convId}
    - `/inbox/broadcast` → page=broadcast
    - `/inbox/scheduled` → page=scheduled
    - `/inbox/chatbot` → page=chatbot
    - `/contacts/:id?` → page=contacts
    - `/reports/:section?` → page=reports
    - `/settings/:section?` → page=settings
    - `/inbox` (default) → page=inbox
  - يُطلق `route:change` event على InboxStore
- **تحقق:** `InboxRouter.navigate('/inbox/conv/1')` يغيّر URL + يُطلق event

### T24 — Frontend: إنشاء `public/inbox-v4/shell.js`
- **الملف:** `public/inbox-v4/shell.js` ← جديد
- **العملية:**
  - `InboxShell.init()` ← يُستدعى عند DOMContentLoaded
  - يجلب بيانات المستخدم من `/api/inbox/me`
  - يهيّئ SSE (يستدعي InboxStream.init() — D-023)
  - يستمع لـ `route:change` ويستدعي Page Module المناسب
  - Agent Status controls (online/busy/away)
  - Sidebar active state يتحدث مع كل route change
  - Permission Guard: يُخفي روابط Sidebar بناءً على `InboxStore.can()`
- **تحقق:** عند فتح `/inbox` → page-inbox يُحمَّل، SSE يشتغل

### T25 — Frontend: تعديل `stream.js` — نقل init للـ Shell
- **الملف:** `public/dashboard/inbox-v4/stream.js` ← تعديل
- **العملية:**
  - إضافة guard: `if (InboxStream._initialized) return;` في بداية `init()`
  - `InboxStream._initialized = false` كـ default
  - shell.js هو الوحيد اللي يستدعي `InboxStream.init()`
  - إزالة أي `auto-init` موجود فيه
- **تحقق:** SSE لا يُفتح مرتين عند التنقل بين الصفحات (D-029)

### T26 — Frontend: إنشاء `public/inbox-v4/pages/page-inbox.js`
- **الملف:** `public/inbox-v4/pages/page-inbox.js` ← جديد
- **العملية:** Page Module يحمّل الـ 3 أعمدة الحالية:
  ```javascript
  const PageInbox = {
    mount(container, params) {
      // يُحقن HTML الـ 3 أعمدة في container
      // يستدعي InboxApp.init() أو ما يعادله
      // لو params.convId → يفتح المحادثة مباشرة
    },
    unmount() {
      // cleanup إن لزم
    }
  };
  ```
- **تحقق:** `/inbox` تعرض قايمة المحادثات، `/inbox/conv/5` تفتح المحادثة

### T27 — Frontend: إنشاء `public/inbox-v4/pages/page-contacts.js`
- **الملف:** `public/inbox-v4/pages/page-contacts.js` ← جديد
- **العملية:** Placeholder بسيط (هيكل أساسي فقط — D-013 pattern):
  - Header "جهات الاتصال"
  - جدول فارغ أو رسالة "قريباً"
  - URL `/contacts/:id` تُعرض placeholder بنفس المحتوى
- **تحقق:** `/contacts` تُحمَّل بدون errors

### T28 — Frontend: إنشاء `public/inbox-v4/pages/page-reports.js`
- **الملف:** `public/inbox-v4/pages/page-reports.js` ← جديد
- **العملية:** Page Module يحمّل `InboxAnalytics.mount()`:
  ```javascript
  const PageReports = {
    mount(container, params) {
      InboxAnalytics.mount(container, {
        section: params.section || 'overview',
        userRole: InboxStore.state.currentUser.role
      });
    },
    unmount() { InboxAnalytics.unmount(); }
  };
  ```
- **تحقق:** `/reports` تعرض نظرة عامة، `/reports/agents` تعرض قسم الموظفين

### T29 — Frontend: إنشاء `public/inbox-v4/pages/page-settings.js`
- **الملف:** `public/inbox-v4/pages/page-settings.js` ← جديد
- **العملية:** Page Module يحمّل `InboxSettings.mount()`:
  ```javascript
  const PageSettings = {
    mount(container, params) {
      InboxSettings.mount(container, { section: params.section || 'org' });
    },
    unmount() { InboxSettings.unmount(); }
  };
  ```
- **تحقق:** `/settings` → يُعيد redirect لـ `/settings/org`

### T30 — Frontend: تحديث `dashboard/index.html` — استبدال iframe
- **الملف:** `public/dashboard/index.html` ← تعديل
- **العملية:** استبدال `<iframe src="/dashboard/inbox-v4/...">` بـ:
  ```html
  <a href="/inbox" target="_blank">فتح الـ Inbox</a>
  ```
  أو redirect تلقائي: `window.location.href = '/inbox'`
- **تحقق:** الضغط على Inbox في ERP dashboard ينقل للـ `/inbox` route الجديد


---

## ⚙️ المحور الرابع: M2 — Settings (إعادة الهيكلة)
> المرجع التقني: `inbox-v4/plans/M2-settings.md`
> يُنفَّذ بعد M3 (App Shell جاهز) — Settings تعيش كـ Page Module

### T31 — Migration: `inbox_canned_responses_v4`
- **الملف:** `server/migrations/inbox-v4/M2_001_canned_responses.js`
- **الجدول:**
  ```sql
  CREATE TABLE IF NOT EXISTS inbox_canned_responses_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shortcut TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'عام',
    platforms TEXT DEFAULT '[]',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_canned_shortcut ON inbox_canned_responses_v4(shortcut);
  CREATE INDEX IF NOT EXISTS idx_canned_category ON inbox_canned_responses_v4(category);
  ```
- **تحقق:** `PRAGMA table_info(inbox_canned_responses_v4)` + UNIQUE على shortcut

### T32 — Migration: `inbox_sla_policies_v4`
- **الملف:** `server/migrations/inbox-v4/M2_002_sla_policies.js`
- **الجدول:** id / name / is_default / priority / first_response / resolution_time / business_hours / escalate_agent
- **Seed إلزامي:** policy افتراضية (is_default=1, priority='all', first_response=120, resolution_time=480)
- **تحقق:** `SELECT * FROM inbox_sla_policies_v4` تُعيد صف واحد افتراضي

### T33 — Migration: `inbox_custom_attrs_v4` + `inbox_attr_values_v4`
- **الملف:** `server/migrations/inbox-v4/M2_003_custom_attrs.js`
- **الجداول:**
  - `inbox_custom_attrs_v4`: id / attr_type('conversation'|'contact') / key / label / field_type / options(JSON) / required / sort_order
  - `inbox_attr_values_v4`: id / attr_id / entity_type / entity_id / value
  - UNIQUE INDEX على (attr_id, entity_id)
- **تحقق:** UNIQUE constraint يعمل

### T34 — Migration: `inbox_appearance_v4`
- **الملف:** `server/migrations/inbox-v4/M2_004_appearance.js`
- **الجدول:** id=1 / density('comfy'|'compact') / font_size / show_avatar
- **Seed:** `INSERT OR IGNORE INTO inbox_appearance_v4 (id) VALUES (1)`
- **تحقق:** صف واحد دايماً بـ id=1

### T35 — Migration: `inbox_business_hours_v4` + `inbox_business_days_v4`
- **الملف:** `server/migrations/inbox-v4/M2_005_business_hours.js`
- **الجداول:**
  - `inbox_business_hours_v4`: id=1 / timezone('Africa/Cairo') / active(0)
  - `inbox_business_days_v4`: day_of_week / is_working / start_time / end_time
  - Seed: 7 أيام (الأحد والسبت عطلة، الباقي 9am-5pm)
- **تنبيه:** لا تمس `inbox_work_hours` القديم
- **تحقق:** 7 صفوف في inbox_business_days_v4

### T36 — Migration: `inbox_csat_settings_v4`
- **الملف:** `server/migrations/inbox-v4/M2_006_csat_settings.js`
- **الجدول:** id=1 / enabled(0) / trigger('on_close') / delay_minutes(0) / message / scale(5)
- **Seed:** `INSERT OR IGNORE INTO inbox_csat_settings_v4 (id) VALUES (1)`
- **تحقق:** صف واحد بـ id=1

### T37 — Backend: `settings.js` — قسم المؤسسة + Business Hours
- **الملف:** `server/routes/inbox/settings.js` ← تكملة T05/T06
- **الـ Routes المضافة:**
  - `GET/PUT /inbox/settings/org` ← requirePermission('org_settings')
  - `GET/PUT /inbox/settings/business-hours` ← requirePermission('org_settings')
- **Business Hours Helper:** دالة `isBusinessHour(db, timestamp)` في `server/routes/inbox/utils/business-hours.js`
  - تُستدعى من: conversations.js (SLA) + automation.js (away trigger) + team.js (auto-away)
- **تحقق:** `node --check` + GET /settings/org يُعيد بيانات tenant_profile

### T38 — Backend: `settings.js` — Canned Responses API
- **الـ Routes:**
  - `GET /inbox/settings/canned` ← كل الموظفين
  - `GET /inbox/settings/canned/search?q=` ← بحث سريع للـ reply box
  - `POST/PUT/DELETE /inbox/settings/canned/:id` ← requirePermission('inbox_settings')
- **تحقق:** search?q=/ يُعيد الردود اللي تبدأ بـ "/"

### T39 — Backend: `settings.js` — Custom Attributes API
- **الـ Routes:**
  - `GET/POST/PUT/DELETE /inbox/settings/attrs/:type` (type = conversation | contact)
  - `PUT /inbox/settings/attrs/:type/reorder` ← تحديث sort_order
- **تحقق:** `node --check` + GET /attrs/conversation يُعيد []

### T40 — Backend: `settings.js` — SLA Policies API
- **الـ Routes:**
  - `GET/POST/PUT/DELETE /inbox/settings/sla/:id`
  - `PUT /inbox/settings/sla/:id/set-default`
- **قواعد Backend:**
  - DELETE يرفض لو is_default=1 (400)
  - set-default يُحدث is_default=0 للكل ثم is_default=1 للمختار
- **تحقق:** `node --check` + محاولة حذف الـ default policy تُعيد 400

### T41 — Backend: `settings.js` — CSAT + Appearance + Channels APIs
- **الـ Routes:**
  - `GET/PUT /inbox/settings/csat` ← requirePermission('inbox_settings')
  - `GET/PUT /inbox/settings/appearance` ← مفتوح لكل الموظفين
  - `GET/PUT/POST /inbox/settings/channels/:channel` ← requirePermission('channels')
  - `POST /inbox/settings/channels/:channel/test`
- **Channels المسموحة:** whatsapp_api / whatsapp_qr / telegram / instagram / messenger / email
- **تحقق:** `node --check` + GET /appearance يُعيد density=comfy

### T42 — Backend: `settings.js` — InboxAPI إضافة settings namespace
- **الملف:** `public/dashboard/inbox-v4/api.js` ← تعديل
- **العملية:** إضافة `InboxAPI.settings = { getOrg, updateOrg, getHours, updateHours, getCanned, searchCanned, createCanned, updateCanned, deleteCanned, getAttrs, createAttr, updateAttr, deleteAttr, reorderAttrs, getSLA, createSLA, updateSLA, deleteSLA, setDefaultSLA, getCSAT, updateCSAT, getAppearance, updateAppearance, getChannels, getChannel, updateChannel, testChannel }`
- **تحقق:** `node --check` + `InboxAPI.settings.getAppearance` موجود في Console

### T43 — Frontend: `settings/settings-page.js` — Shell الرئيسي
- **الملف:** `public/dashboard/inbox-v4/settings/settings-page.js` ← جديد
- **العملية:**
  - `InboxSettings.mount(container, {section})` + `InboxSettings.unmount()`
  - Sidebar داخلي: 5 أقسام (المؤسسة / الفريق / التطبيقات / الـ Inbox / الأتمتة)
  - يُخفي أقسام بناءً على `InboxStore.can()`
  - يستدعي sub-modules: org.js / channels.js / inbox-settings.js / automation-hub.js
  - قسم الفريق ← يستدعي roles.js + users.js من M1
- **تحقق:** `/settings` يعرض Sidebar الـ 5 أقسام

### T44 — Frontend: `settings/org.js`
- **الملف:** `public/dashboard/inbox-v4/settings/org.js` ← جديد
- **المحتوى:**
  - نموذج بيانات المؤسسة (الاسم / اللوجو / الـ timezone)
  - Business Hours: تفعيل/تعطيل + إعداد أوقات كل يوم + timezone picker
- **تحقق:** حفظ بيانات المؤسسة يُحدّث tenant_profile

### T45 — Frontend: `settings/channels.js`
- **الملف:** `public/dashboard/inbox-v4/settings/channels.js` ← جديد
- **المحتوى:**
  - شبكة كروت القنوات (WhatsApp / Telegram / Instagram / Email...)
  - كل كرت: حالة الاتصال + زر تعديل → Modal إعدادات القناة
  - زر Test Connection لكل قناة
- **تحقق:** تعديل Telegram token وحفظه يُحدَّث في inbox_channel_settings_v4

### T46 — Frontend: `settings/inbox-settings.js`
- **الملف:** `public/dashboard/inbox-v4/settings/inbox-settings.js` ← جديد
- **المحتوى (4 sub-sections بـ tabs):**
  - **Labels:** إدارة Labels (نقل من overlay قديم)
  - **Canned Responses:** قايمة + إضافة + shortcut + category
  - **Custom Attrs:** conversation attrs + contact attrs (نوعان منفصلان)
  - **SLA:** قايمة السياسات + إنشاء + تعديل + تعيين default
  - **CSAT:** تفعيل + رسالة + scale + trigger
  - **Appearance:** density + font size
- **تحقق:** إضافة canned response بـ shortcut `/test` تظهر في القايمة

### T47 — Frontend: `settings/automation-hub.js`
- **الملف:** `public/dashboard/inbox-v4/settings/automation-hub.js` ← جديد
- **المحتوى:**
  - روابط للـ features الموجودة (Automation / Webhooks / Welcome/Away)
  - تفتحها كـ modals أو panels موجودة بالفعل (لا إعادة بناء)
  - زر "فتح Chatbot Builder" → `InboxRouter.navigate('/inbox/chatbot')`
- **تحقق:** الروابط تفتح الـ features الصح

### T48 — Frontend: ربط Canned Responses بـ Reply Box
- **الملف:** `public/dashboard/inbox-v4/reply.js` ← تعديل
- **العملية:**
  - عند كتابة "/" في reply box → يستدعي `InboxAPI.settings.searchCanned(query)`
  - Dropdown يعرض النتائج
  - النقر على نتيجة → يُدرج content في reply box
- **تحقق:** كتابة "/hello" يعرض الردود الجاهزة المناسبة

### T49 — Frontend: ربط Custom Attrs بـ Context Panel
- **الملف:** `public/dashboard/inbox-v4/context.js` ← تعديل
- **العملية:**
  - يجلب `inbox_custom_attrs_v4` (conversation + contact)
  - يعرضها في Context Panel مع قيمها من `inbox_attr_values_v4`
  - Save → يُحدَّث القيم عبر API
- **تحقق:** custom attr من نوع 'conversation' يظهر في Context Panel

### T50 — Frontend: ربط Business Hours بـ SLA + Away
- **الملفات:** `conversations.js` (backend) + `automation.js` (backend) ← تعديل
- **العملية:**
  - conversations.js: `getSlaPolicy(db, priority)` يتحقق من `isBusinessHour()` قبل حساب breach
  - automation.js: away message trigger يستخدم `isBusinessHour()` بدل away_start/away_end القديم
- **تحقق:** خارج أوقات العمل → رسالة الغياب تُرسل تلقائياً


---

## 📊 المحور الخامس: M4 — Analytics (التقارير)
> المرجع التقني: `inbox-v4/plans/M4-analytics.md`
> يُنفَّذ بعد M3 (App Shell) + M1 (Permissions) — Analytics تعيش كـ Page Module

### T51 — Migration: `inbox_scheduled_reports_v4`
- **الملف:** `server/migrations/inbox-v4/M4_001_scheduled_reports.js`
- **الجدول:**
  ```sql
  CREATE TABLE IF NOT EXISTS inbox_scheduled_reports_v4 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK(report_type IN ('overview','agents','sla','csat','labels','automation','full')),
    frequency   TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
    send_hour   INTEGER NOT NULL DEFAULT 8 CHECK(send_hour BETWEEN 0 AND 23),
    send_day    INTEGER CHECK(send_day BETWEEN 0 AND 6),
    recipients  TEXT NOT NULL,
    format      TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','pdf')),
    active      INTEGER NOT NULL DEFAULT 1,
    last_sent   INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_by  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active
    ON inbox_scheduled_reports_v4(active, send_hour);
  ```
- **تحقق:** `node --check` + `PRAGMA table_info(inbox_scheduled_reports_v4)`

### T52 — Migration: DB Indexes للأداء
- **الملف:** `server/migrations/inbox-v4/M4_002_analytics_indexes.js`
- **الـ Indexes (D-040):**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_conv_created_at  ON inbox_conversations_v4(created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_assigned     ON inbox_conversations_v4(assigned_to_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_status_date  ON inbox_conversations_v4(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_msg_conv_id       ON inbox_messages_v4(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_labels_conv  ON inbox_conversation_labels(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conv_labels_label ON inbox_conversation_labels(label_id);
  ```
- **تحقق:** `EXPLAIN QUERY PLAN SELECT COUNT(*) FROM inbox_conversations_v4 WHERE created_at > ?` يظهر "USING INDEX"

### T53 — Backend: Permission Helper في `analytics.js`
- **الملف:** `server/routes/inbox/analytics.js` ← تعديل
- **العملية:** إضافة دوال في أعلى الملف:
  - `getInboxRole(req)` ← يعيد role string مبني على req.inboxUser (D-039)
  - `requireAnalyticsAccess(req, res, next)` ← middleware يمرّر كل الأدوار
  - `getTeamFilter(req)` ← Supervisor يُعيد team_id، غيره null
- **ملاحظة:** يستخدم `req.inboxUser.inbox_role_id` (لا `req.user.role`)
- **تحقق:** `node --check server/routes/inbox/analytics.js`

### T54 — Backend: Endpoint `/analytics/labels`
- **الملف:** `server/routes/inbox/analytics.js` ← إضافة
- **الـ Query الأساسي:** JOIN بين inbox_labels + inbox_conversation_labels + inbox_conversations_v4
- **يُعيد:** قايمة labels مع conv_count + avg_resolution_min + trend يومي لأكثر 5 labels
- **Permission:** owner | admin | supervisor فقط (agent + readonly → 403)
- **تحقق:** `GET /analytics/labels?from=...&to=...` يُعيد JSON صح

### T55 — Backend: Endpoint `/analytics/automation`
- **الملف:** `server/routes/inbox/analytics.js` ← إضافة
- **يُعيد:**
  - chatbot_only: محادثات ended_by='bot'
  - auto_closed: close_reason='auto_close'
  - keyword_stats: كل keyword + عدد triggers
  - ai_suggested: رسائل بـ metadata.ai_suggested=true
- **try/catch لكل query** ← graceful degradation (D-045 pattern)
- **تحقق:** الـ endpoint يُعيد 0s لو الجداول فارغة — لا 500

### T56 — Backend: Permission Filtering على الـ Endpoints الحالية
- **الملف:** `server/routes/inbox/analytics.js` ← تعديل
- **العملية:** لكل endpoint حالي:
  - `/overview`, `/volume`, `/hourly` ← مفتوح (كل الأدوار)
  - `/agents` ← owner/admin/supervisor (supervisor يُفلتر بـ team_id)
  - `/agents/:id` ← agent يرى نفسه فقط (يتحقق req.params.id === req.inboxUser.id)
  - `/platforms`, `/sla`, `/csat`, `/sentiment` ← owner/admin/supervisor
- **تحقق:** Agent لا يقدر يطلب `/analytics/agents` ← 403

### T57 — Backend: Scheduled Reports CRUD API
- **الملف:** `server/routes/inbox/analytics.js` ← إضافة
- **الـ Routes:**
  - `GET /analytics/scheduled` ← owner/admin فقط
  - `POST /analytics/scheduled` ← owner/admin فقط
  - `PUT /analytics/scheduled/:id`
  - `DELETE /analytics/scheduled/:id`
- **ملاحظة:** التنفيذ الفعلي للإرسال (email delivery) = مؤجل لـ Phase 10+ (D-034)
- **تحقق:** `node --check` + CRUD يعمل على inbox_scheduled_reports_v4

### T58 — Frontend: تحويل `analytics.js` لـ Page Module
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← تعديل
- **العملية:**
  - تغليف الكود الحالي في `InboxAnalytics = { mount(container, params), unmount() }`
  - حذف overlay CSS القديم (`iv4-an-overlay`) — يُستبدل بـ full-page container
  - يقبل `params.section` ليفتح القسم المناسب مباشرة
  - يقبل `params.userRole` لـ permission-aware rendering
  - CSS prefix `iv4-an-*` يبقى كما هو (D-041)
- **تحقق:** `InboxAnalytics.mount(document.getElementById('shell-content'), {section:'overview'})` يعمل

### T59 — Frontend: إضافة قسم Labels في Analytics
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← إضافة
- **المحتوى:**
  - Horizontal Bar Chart: أكثر 10 labels استخداماً
  - جدول: label / عدد المحادثات / % من الكل / متوسط وقت الحل
  - Trend chart للأكثر 5 labels
- **يستدعي:** `InboxAPI.analytics.getLabels(from, to)`
- **تحقق:** القسم يظهر في `/reports/labels`

### T60 — Frontend: إضافة قسم AI & Automation في Analytics
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← إضافة
- **المحتوى:**
  - KPI Cards: chatbot-only % + auto-closed % + keyword hits + AI-suggested رسائل
  - Sentiment Analysis ينتقل من Overview لهنا (D-037)
  - Keyword Stats table
  - Top Negative Conversations (قابلة للنقر → تفتح المحادثة)
- **يستدعي:** `InboxAPI.analytics.getAutomation(from, to)` + `InboxAPI.analytics.getSentiment(from, to)`
- **تحقق:** القسم يظهر في `/reports/automation`

### T61 — Frontend: إضافة Live Status Bar
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← إضافة
- **العملية:** Live Status في أعلى Overview section:
  - `setInterval` كل 30 ثانية (D-033 — لا SSE جديد)
  - يستدعي `/analytics/overview?live=true`
  - يعرض: محادثات مفتوحة الآن + موظفين Online
- **تحقق:** الأرقام تتحدث كل 30 ثانية بدون reload

### T62 — Frontend: Permission-Aware Rendering في Analytics
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← إضافة
- **العملية:**
  - Agent: يرى نفسه فقط — يُوجَّه مباشرة لـ `/reports/agents/:myId`
  - Supervisor: يرى فريقه — يُمرَّر team_id في كل query
  - Read-only: يرى كل شيء بدون export button
  - أزرار Export: `InboxStore.can('export')` قبل العرض
- **تحقق:** Agent لا يرى قسم "الموظفين" الكامل — فقط أداؤه الشخصي

### T63 — Frontend: إضافة قسم Scheduled Reports في Analytics
- **الملف:** `public/dashboard/inbox-v4/analytics.js` ← إضافة
- **المحتوى:**
  - مرئي لـ Owner / Admin فقط
  - جدول التقارير المجدولة + زر إنشاء + تعطيل + حذف
  - نموذج إنشاء: الاسم / نوع البيانات / التكرار / الوقت / المستلمون
- **ملاحظة:** Email delivery مؤجل — الـ UI جاهز لكن الإرسال يُكتمل في Phase 10+
- **تحقق:** إنشاء تقرير مجدول يحفظ في inbox_scheduled_reports_v4

---

## 📋 ملخص جميع المهام — جدول مرجعي سريع

| # | المهمة | المحور | النوع | الأولوية |
|---|--------|--------|-------|----------|
| T01 | Migration: inbox_roles | M1 | DB | 🔴 |
| T02 | Migration: inbox_users | M1 | DB | 🔴 |
| T03 | Migration: Team Role Override | M1 | DB | 🔴 |
| T04 | permissions.js | M1 | Backend | 🔴 |
| T05 | settings.js — Roles API | M1 | Backend | 🔴 |
| T06 | settings.js — Users API | M1 | Backend | 🔴 |
| T07 | index.js — requirePermission | M1 | Backend | 🔴 |
| T08 | store.js — currentUser.permissions | M1 | Frontend | 🔴 |
| T09 | app.js — Route Guards | M1 | Frontend | 🟡 |
| T10 | settings/roles.js UI | M1 | Frontend | 🟡 |
| T11 | settings/users.js UI | M1 | Frontend | 🟡 |
| T12 | inbox-auth-adapter.js | M5 | Backend | 🔴 |
| T13 | index.js — تفعيل Adapter | M5 | Backend | 🔴 |
| T14 | context.js — ERP Plugin Guard | M5 | Backend | 🟡 |
| T15 | team.js — إصلاح req.user.role | M5 | Backend | 🔴 |
| T16 | conversations.js — req.inboxUser | M5 | Backend | 🔴 |
| T17 | باقي inbox/routes (10 ملفات) | M5 | Backend | 🟡 |
| T18 | api.js — InboxConfig | M5 | Frontend | 🟡 |
| T19 | app.js — /inbox* route | M3 | Backend | 🔴 |
| T20 | app.js — /contacts* /reports* /settings* | M3 | Backend | 🔴 |
| T21 | public/inbox-v4/index.html | M3 | Frontend | 🔴 |
| T22 | shell.css | M3 | Frontend | 🔴 |
| T23 | router.js | M3 | Frontend | 🔴 |
| T24 | shell.js | M3 | Frontend | 🔴 |
| T25 | stream.js — نقل init للـ Shell | M3 | Frontend | 🔴 |
| T26 | page-inbox.js | M3 | Frontend | 🔴 |
| T27 | page-contacts.js (placeholder) | M3 | Frontend | 🟢 |
| T28 | page-reports.js | M3 | Frontend | 🟡 |
| T29 | page-settings.js | M3 | Frontend | 🟡 |
| T30 | dashboard/index.html — استبدال iframe | M3 | Frontend | 🟡 |
| T31 | Migration: inbox_canned_responses_v4 | M2 | DB | 🟡 |
| T32 | Migration: inbox_sla_policies_v4 | M2 | DB | 🟡 |
| T33 | Migration: inbox_custom_attrs_v4 | M2 | DB | 🟡 |
| T34 | Migration: inbox_appearance_v4 | M2 | DB | 🟢 |
| T35 | Migration: inbox_business_hours_v4 | M2 | DB | 🟡 |
| T36 | Migration: inbox_csat_settings_v4 | M2 | DB | 🟡 |
| T37 | settings.js — Org + Business Hours | M2 | Backend | 🟡 |
| T38 | settings.js — Canned Responses | M2 | Backend | 🟡 |
| T39 | settings.js — Custom Attrs | M2 | Backend | 🟡 |
| T40 | settings.js — SLA Policies | M2 | Backend | 🟡 |
| T41 | settings.js — CSAT + Appearance + Channels | M2 | Backend | 🟡 |
| T42 | api.js — settings namespace | M2 | Frontend | 🟡 |
| T43 | settings/settings-page.js | M2 | Frontend | 🟡 |
| T44 | settings/org.js | M2 | Frontend | 🟡 |
| T45 | settings/channels.js | M2 | Frontend | 🟡 |
| T46 | settings/inbox-settings.js | M2 | Frontend | 🟡 |
| T47 | settings/automation-hub.js | M2 | Frontend | 🟢 |
| T48 | reply.js — Canned Responses trigger | M2 | Frontend | 🟡 |
| T49 | context.js — Custom Attrs display | M2 | Frontend | 🟡 |
| T50 | Business Hours ربط SLA + Away | M2 | Backend | 🟡 |
| T51 | Migration: inbox_scheduled_reports_v4 | M4 | DB | 🟡 |
| T52 | Migration: Analytics DB Indexes | M4 | DB | 🔴 |
| T53 | analytics.js — Permission Helper | M4 | Backend | 🔴 |
| T54 | analytics.js — /labels endpoint | M4 | Backend | 🟡 |
| T55 | analytics.js — /automation endpoint | M4 | Backend | 🟡 |
| T56 | analytics.js — Permission Filtering | M4 | Backend | 🔴 |
| T57 | analytics.js — Scheduled Reports CRUD | M4 | Backend | 🟢 |
| T58 | analytics.js — تحويل لـ Page Module | M4 | Frontend | 🔴 |
| T59 | analytics.js — قسم Labels | M4 | Frontend | 🟡 |
| T60 | analytics.js — قسم AI & Automation | M4 | Frontend | 🟡 |
| T61 | analytics.js — Live Status Bar | M4 | Frontend | 🟡 |
| T62 | analytics.js — Permission-Aware Rendering | M4 | Frontend | 🔴 |
| T63 | analytics.js — Scheduled Reports UI | M4 | Frontend | 🟢 |

**الأولوية:** 🔴 حرج | 🟡 مهم | 🟢 ثانوي

---

## 🔗 Dependencies (الترتيب الإلزامي)

```
T01→T02→T03 (Migrations M1) ← أول شيء
T04→T05→T06→T07 (Backend M1) ← بعد Migrations
T12→T13 (M5 Adapter) ← بعد T04
T15→T16→T17 (M5 Routes) ← بعد T13
T19→T20 (Backend M3) ← مستقل — يمكن موازياً مع M1
T21→T22→T23→T24 (Frontend Shell) ← بعد T19/T20
T25→T26 (SSE + page-inbox) ← بعد T24
T08→T09→T10→T11 (Frontend M1) ← بعد T24 (Shell جاهز)
T31→T36 (Migrations M2) ← بعد T01-T03
T37→T41 (Backend M2) ← بعد T36 + T13
T42→T49 (Frontend M2) ← بعد T43 (settings-page.js)
T51→T52 (Migrations M4) ← بعد T01-T03
T53→T57 (Backend M4) ← بعد T52 + T13
T58→T63 (Frontend M4) ← بعد T24 (Shell جاهز)
```

---

## 🚨 تحذيرات خاصة — لا تنساها

1. **T03 (Team Role Override):** ALTER TABLE على جدول حالي — خطر على بيانات production — تأكد من backup
2. **T13 (Adapter في index.js):** لو الـ adapter أُضيف في مكان خاطئ → كل الـ Inbox يتوقف
3. **T17 (stream.js أولاً):** SSE يؤثر على كل الـ real-time — اختبره فور التعديل
4. **T19/T20 (App Shell routes):** تأكد من اسم session field قبل الكتابة (`userId` مش `user`)
5. **T32 (SLA Migration):** الـ seed الافتراضي إلزامي — بدونه getSlaPolicy() ستفشل
6. **T52 (Analytics Indexes):** شغّله على production DB الحالية مباشرة — لن يكسر البيانات

---

> آخر تحديث: 2026-05-04
> إجمالي المهام: 63 مهمة موزعة على M1/M5/M3/M2/M4
> الجاهزية: ✅ جاهز للتنفيذ في Phase 10
