# M1 — نظام الصلاحيات (Roles & Permissions)
> الحالة: ✅ مكتمل (المرحلتان 1 و 2)
> تاريخ الجلسة: 2026-05-04
> المحور: M1 من Phase 9

---

## 1. ماذا نبني؟

منظومة صلاحيات كاملة للـ Inbox تشمل:
- **5 أدوار ثابتة** (Owner / Admin / Supervisor / Agent / Read-only) لا تُحذف ولا تُعدّل
- **أدوار مخصصة** يبنيها Admin بتحديد الصلاحيات يدوياً
- **Permissions على مستوى القسم** (section-level)
- **جدول `inbox_roles` مستقل** عن `tenant_roles` (ERP)
- **`inbox_users`** جدول وسيط بين المستخدم ودوره في الـ Inbox
- **Team-level overrides** فوق الدور الأساسي
- **Migration يدوي** — Owner يعين الموظفين بشكل صريح
- دعم **موظفين Inbox-only** غير موجودين في ERP

---

## 2. لماذا هكذا؟

| القرار | السبب |
|---|---|
| `inbox_roles` منفصل | الـ Inbox يجب أن يعمل مستقلاً عن ERP (السيناريو C — D-009) |
| Section-level permissions | بسيط للمستخدم ويكفي للـ use case الحالية |
| Team-level overrides | Supervisor يحتاج يشوف فريقه فقط لا الكل |
| `inbox_users` جدول وسيط | موظف Inbox ممكن يكون مش في ERP (tenant_user_id nullable) |
| Migration يدوي | Owner هو الوحيد اللي يعرف من يستحق أي دور |

---

## 3. كيف يُبنى؟

### 3.1 — قاعدة البيانات (Migrations)

#### Migration 001 — `inbox_roles`
**الملف:** `server/migrations/inbox-v4/M1_001_inbox_roles.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_roles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  is_system    INTEGER DEFAULT 0,   -- 1 = ثابت لا يُحذف ولا يُعدّل
  permissions  TEXT NOT NULL,       -- JSON object (section keys)
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- Seed الأدوار الثابتة
INSERT INTO inbox_roles (id, name, is_system, permissions) VALUES
(1, 'Owner',      1, '{"org_settings":true,"team_manage":true,"channels":true,"inbox_settings":true,"automation":true,"reports_full":true,"reports_team":true,"reports_self":true,"export":true,"delete_account":true}'),
(2, 'Admin',      1, '{"org_settings":true,"team_manage":true,"channels":true,"inbox_settings":true,"automation":true,"reports_full":true,"reports_team":true,"reports_self":true,"export":true,"delete_account":false}'),
(3, 'Supervisor', 1, '{"org_settings":false,"team_manage":false,"channels":false,"inbox_settings":true,"automation":true,"reports_full":false,"reports_team":true,"reports_self":true,"export":false,"delete_account":false}'),
(4, 'Agent',      1, '{"org_settings":false,"team_manage":false,"channels":false,"inbox_settings":false,"automation":false,"reports_full":false,"reports_team":false,"reports_self":true,"export":false,"delete_account":false}'),
(5, 'Read-only',  1, '{"org_settings":false,"team_manage":false,"channels":false,"inbox_settings":false,"automation":false,"reports_full":false,"reports_team":false,"reports_self":false,"export":false,"delete_account":false}');
```

**الـ Permission Keys الكاملة (Section-Level):**

| Key | الوصف |
|---|---|
| `org_settings` | إعدادات المؤسسة (الاسم، اللوجو، Timezone، Business Hours) |
| `team_manage` | إدارة المستخدمين + الفرق + الأدوار + Agent Capacity |
| `channels` | القنوات + التكاملات |
| `inbox_settings` | Labels / Canned Responses / Custom Attrs / SLA / CSAT |
| `automation` | Keyword / Welcome / Auto-close / Chatbot / Webhooks |
| `reports_full` | التقارير الكاملة لكل الفريق |
| `reports_team` | تقارير فريقه فقط |
| `reports_self` | تقاريره الشخصية فقط |
| `export` | تصدير البيانات |
| `delete_account` | حذف الحساب (Owner فقط) |

---

#### Migration 002 — `inbox_users`
**الملف:** `server/migrations/inbox-v4/M1_002_inbox_users.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_user_id  INTEGER,             -- FK لـ tenant_users (nullable = inbox-only user)
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password        TEXT,                -- null لو بيتوثق عبر tenant auth
  inbox_role_id   INTEGER NOT NULL REFERENCES inbox_roles(id),
  active          INTEGER DEFAULT 1,
  max_concurrent  INTEGER DEFAULT 10,  -- Agent Capacity
  notify_telegram_id TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

**ملاحظة:** `tenant_user_id` nullable يسمح بموظفين Inbox-only مش موجودين في ERP.

---

#### Migration 003 — Team Role Override
**الملف:** `server/migrations/inbox-v4/M1_003_team_role_override.js`

```sql
-- إضافة role_override لجدول inbox_team_members الموجود
ALTER TABLE inbox_team_members
ADD COLUMN role_override TEXT DEFAULT NULL;
-- JSON: {"reports_team": true, "inbox_settings": false}
-- null = يطبق دور الموظف الأصلي بدون تعديل
```

---

### 3.2 — الـ Backend

#### الملفات المتأثرة / الجديدة

```
server/
├── migrations/inbox-v4/
│   ├── M1_001_inbox_roles.js          ← جديد
│   ├── M1_002_inbox_users.js          ← جديد
│   └── M1_003_team_role_override.js   ← جديد
├── routes/inbox/
│   ├── index.js                       ← تعديل: loadInboxUser middleware
│   ├── permissions.js                 ← جديد: helper functions
│   └── settings.js                    ← جديد: Roles + Users CRUD API
```

---

#### `server/routes/inbox/permissions.js`

```javascript
// permissions.js — Phase 9 M1
// آخر تحديث: 2026-05-04

/**
 * يحمّل inbox_user + يحسب الـ effective permissions
 * مع الأخذ بعين الاعتبار الـ team override لو وُجد
 */
async function loadInboxPermissions(db, userId, teamId = null) {
  const user = db.prepare(`
    SELECT iu.*, ir.permissions AS role_permissions, ir.name AS role_name
    FROM inbox_users iu
    JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
    WHERE iu.tenant_user_id = ? AND iu.active = 1
  `).get(userId);

  if (!user) return null;

  const base = JSON.parse(user.role_permissions);

  // Team-level override
  if (teamId) {
    const member = db.prepare(`
      SELECT role_override FROM inbox_team_members
      WHERE team_id = ? AND user_id = ?
    `).get(teamId, userId);

    if (member?.role_override) {
      const override = JSON.parse(member.role_override);
      Object.assign(base, override);  // override يعلو على الـ base
    }
  }

  return { user, permissions: base };
}

/**
 * Middleware: يتحقق من permission معين
 * الاستخدام: requirePermission('reports_full')
 */
function requirePermission(key) {
  return async (req, res, next) => {
    const result = await loadInboxPermissions(
      req.db,
      req.user.id,
      req.query.teamId || null
    );

    if (!result || !result.permissions[key]) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    req.inboxUser = result.user;
    req.inboxPermissions = result.permissions;
    next();
  };
}

module.exports = { loadInboxPermissions, requirePermission };
```

---

#### `server/routes/inbox/settings.js` — Roles + Users API

```
// Roles
GET    /inbox/settings/roles              ← قايمة الأدوار (system + custom)
POST   /inbox/settings/roles              ← إنشاء دور مخصص (team_manage فقط)
PUT    /inbox/settings/roles/:id          ← تعديل دور مخصص (is_system=0 فقط)
DELETE /inbox/settings/roles/:id          ← حذف دور مخصص (لو مفيش users عليه)

// Inbox Users
GET    /inbox/settings/users              ← قايمة موظفي الـ Inbox
POST   /inbox/settings/users              ← إضافة موظف (من ERP أو جديد)
PUT    /inbox/settings/users/:id          ← تعديل دور موظف / capacity
DELETE /inbox/settings/users/:id          ← إزالة موظف من الـ Inbox
```

**قواعد الـ Backend:**
- `DELETE /roles/:id` → يرفض لو `is_system = 1` (403)
- `DELETE /roles/:id` → يرفض لو في users بهذا الدور (400)
- `DELETE /users/:id` → يرفض لو هو آخر Owner (400)
- `PUT /roles/:id` → يرفض لو `is_system = 1` (403)

---

#### تعديل `server/routes/inbox/index.js`

```javascript
// إضافة بعد requireAuth:
const { requirePermission } = require('./permissions');

// مثال تطبيق على routes التقارير:
router.get('/analytics/overview',   requirePermission('reports_full'), ...);
router.get('/analytics/team',       requirePermission('reports_team'), ...);
router.get('/settings/roles',       requirePermission('team_manage'), ...);
router.post('/settings/roles',      requirePermission('team_manage'), ...);
router.get('/settings/channels',    requirePermission('channels'), ...);

// تصحيح الـ pattern الخاطئ الحالي في team.js:
// قبل: const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
// بعد: يستخدم req.inboxPermissions.team_manage (من requirePermission middleware)
```

---

### 3.3 — الـ Frontend

#### الملفات الجديدة / المتأثرة

```
public/dashboard/inbox-v4/
├── settings/
│   ├── roles.js          ← جديد: Roles & Permissions UI
│   └── users.js          ← جديد: Inbox Users Management UI
├── store.js              ← تعديل: إضافة currentUser.permissions
└── app.js                ← تعديل: Route Guards
```

---

#### `store.js` — إضافة permissions

```javascript
// في InboxStore.state — إضافة:
currentUser: {
  id: null,
  name: null,
  role: null,         // اسم الدور
  permissions: {}     // { org_settings: false, team_manage: true, ... }
},

// دالة مساعدة:
InboxStore.can = function(key) {
  return !!this.state.currentUser?.permissions?.[key];
};
```

---

#### Route Guards في `app.js`

```javascript
function guardRoute(permKey, fallbackUrl = '/inbox') {
  if (!InboxStore.can(permKey)) {
    InboxStore.navigate(fallbackUrl);
    InboxStore.showToast('ليس لديك صلاحية للوصول لهذا القسم', 'error');
    return false;
  }
  return true;
}

// مثال استخدام:
function openSettings() {
  // Settings تحتاج على الأقل واحدة من الصلاحيات
  const hasAnySettings = ['org_settings','team_manage','channels','inbox_settings','automation']
    .some(k => InboxStore.can(k));
  if (!hasAnySettings) return guardRoute('org_settings'); // يعرض الـ error
  // ... open settings
}

function openReports() {
  if (!InboxStore.can('reports_self')) return guardRoute('reports_self');
  // ...
}
```

---

#### UI — Settings → الفريق → الأدوار

```
صفحة Roles (Settings > الفريق > الأدوار):
┌─────────────────────────────────────────────────────┐
│  الأدوار                              [+ دور جديد]  │
├─────────────────────────────────────────────────────┤
│  🔒 Owner       — نظام — لا يمكن تعديله             │
│  🔒 Admin       — نظام — لا يمكن تعديله             │
│  🔒 Supervisor  — نظام — لا يمكن تعديله             │
│  🔒 Agent       — نظام — لا يمكن تعديله             │
│  🔒 Read-only   — نظام — لا يمكن تعديله             │
│  ✏️  [دور مخصص]  — [تعديل] [حذف]                    │
└─────────────────────────────────────────────────────┘

نموذج دور مخصص (Drawer):
┌─────────────────────────┐
│  اسم الدور: [_______]   │
├─────────────────────────┤
│  الصلاحيات:             │
│  ☑/☐ إعدادات المؤسسة    │
│  ☑/☐ إدارة الفريق       │
│  ☑/☐ القنوات            │
│  ☑/☐ إعدادات Inbox      │
│  ☑/☐ الأتمتة            │
│  ☑/☐ التقارير الكاملة   │
│  ☑/☐ تقارير الفريق      │
│  ☑/☐ تقاريري فقط        │
│  ☑/☐ تصدير البيانات     │
│  ☑/☐ حذف الحساب         │
│          [حفظ]          │
└─────────────────────────┘
```

---

## 4. ما الذي يمكن أن يفشل؟ (Edge Cases + مخاطر)

| الخطر | السيناريو | الحل |
|---|---|---|
| **حذف آخر Owner** | Owner يحذف نفسه = لا أحد يدير الحساب | Backend: `COUNT(inbox_users WHERE inbox_role_id=1) > 1` شرط قبل الحذف |
| **حذف دور مستخدَم** | Admin يحذف دور مخصص وفيه موظفين عليه | Backend: `COUNT(inbox_users WHERE inbox_role_id=?) > 0` → 400 |
| **tenant_user_id = null** | موظف Inbox-only بدون ERP | Auth middleware يدعم inbox_users مستقلاً في هذه الحالة |
| **team override conflict** | Override يضيف permission مش في الدور الأصلي | مسموح — Override صريح يعلو على الدور (مقصود بالتصميم) |
| **is_system = 1 تعديل** | تعديل الأدوار الثابتة | Backend: `if (role.is_system) return 403` |
| **role_id قديم في req.user** | الكود القديم يبحث عن `.role` | permissions.js يستخدم `tenant_user_id` مباشرة — لا يعتمد على `.role` string |

---

## 5. كيف يتكامل مع المحاور الأخرى؟

| المحور | نقطة التلامس |
|---|---|
| **M2 — Settings** | صفحة "الفريق → الأدوار + المستخدمين" موجودة داخل هيكل Settings |
| **M3 — Navigation** | Sidebar يُخفي أقسام بناءً على `InboxStore.can()` |
| **M4 — Analytics** | كل API تقارير تستخدم `requirePermission('reports_full'/'reports_team'/'reports_self')` |
| **M5 — Standalone** | `inbox_roles` + `inbox_users` منفصلان = جاهزان للفصل فوراً |

---

## ✅ Checklist إغلاق M1

- [x] ماذا نبني؟ — منظومة صلاحيات: أدوار ثابتة + مخصصة + team overrides
- [x] لماذا هكذا؟ — منفصلة عن ERP، section-level، قابلة للفصل (M5)
- [x] كيف يُبنى؟ — 3 migrations + permissions.js + settings.js + Frontend guards
- [x] ما الذي يمكن أن يفشل؟ — 6 edge cases موثقة مع حلولها
- [x] كيف يتكامل مع الباقي؟ — M2/M3/M4/M5 كل واحد محدد نقطة تلامسه
