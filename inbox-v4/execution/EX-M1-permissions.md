# EX-M1 — تنفيذ M1: نظام الصلاحيات
> المرجع: `inbox-v4/plans/M1-permissions.md`
> المهام: T01 → T11 (11 مهمة)
> الأولوية: 🔴 أعلى أولوية — كل المحاور تعتمد عليه
> آخر تحديث: 2026-05-04

---

## 📋 حالة المهام

| # | المهمة | النوع | الحالة |
|---|--------|-------|--------|
| T01 | Migration: `inbox_roles` | DB | ✅ |
| T02 | Migration: `inbox_users` | DB | ✅ |
| T03 | Migration: Team Role Override | DB | ✅ |
| T04 | `permissions.js` جديد | Backend | ✅ |
| T05 | `settings.js` — Roles API | Backend | ✅ |
| T06 | `settings.js` — Users API | Backend | ✅ |
| T07 | `index.js` — requirePermission على Routes | Backend | ✅ |
| T08 | `store.js` — currentUser.permissions | Frontend | ✅ |
| T09 | `app.js` — Route Guards | Frontend | ✅ |
| T10 | `settings/roles.js` — UI الأدوار | Frontend | ✅ |
| T11 | `settings/users.js` — UI المستخدمين | Frontend | ✅ |

---

## 🏗️ المرحلة الأولى — DB Migrations (T01 → T03)

> ⚠️ الـ Migrations هي الأساس — لا تنتقل لـ T04 قبل أن تتحقق من الثلاثة.

---

### ▶️ T01 — Migration: `inbox_roles`

**الملف الجديد:**
```
server/migrations/inbox-v4/M1_001_inbox_roles.js
```

**ما يفعله:**
- ينشئ جدول `inbox_roles` بالحقول: id / name / description / is_system / permissions (JSON) / created_at
- يُدرج الأدوار الخمسة الثابتة (seed):

```
id=1 Owner      | is_system=1 | كل الصلاحيات
id=2 Admin      | is_system=1 | بدون role_manage
id=3 Supervisor | is_system=1 | team + reports
id=4 Agent      | is_system=1 | conversations فقط
id=5 Read-only  | is_system=1 | قراءة فقط
```

**الصلاحيات المدعومة (مصفوفة JSON في حقل permissions):**
```
team_manage | org_settings | channels | inbox_settings |
reports_full | reports_team | reports_self | export |
conversations_all | conversations_team | broadcast
```

**تحقق قبل commit:**
```bash
node --check server/migrations/inbox-v4/M1_001_inbox_roles.js
# شغّل الـ migration ثم:
sqlite3 /path/to/db.sqlite "SELECT COUNT(*) FROM inbox_roles;"
# يجب أن يُعيد: 5
```

**⚠️ تنبيه:** `is_system=1` يعني الدور غير قابل للحذف أو التعديل — تأكد من هذا الـ constraint في الـ API لاحقاً (T05).

---

### ▶️ T02 — Migration: `inbox_users`

**الملف الجديد:**
```
server/migrations/inbox-v4/M1_002_inbox_users.js
```

**ما يفعله:**
- ينشئ جدول `inbox_users` بالحقول:
  - id / email / name / inbox_role_id / tenant_user_id (nullable) / status / created_at / updated_at
- يُضيف UNIQUE INDEX على `email`
- `tenant_user_id` nullable لأن بعض موظفي Inbox مش موظفين في ERP

**تحقق قبل commit:**
```bash
node --check server/migrations/inbox-v4/M1_002_inbox_users.js
sqlite3 /path/to/db.sqlite "PRAGMA table_info(inbox_users);"
# تأكد وجود عمود tenant_user_id + UNIQUE على email
```

---

### ▶️ T03 — Migration: Team Role Override

**الملف الجديد:**
```
server/migrations/inbox-v4/M1_003_team_role_override.js
```

**ما يفعله:**
```sql
ALTER TABLE inbox_team_members ADD COLUMN role_override TEXT DEFAULT NULL;
```

**⚠️ تحذير خاص — هذا ALTER TABLE على بيانات حقيقية:**
1. خذ backup قبل التنفيذ: `cp db.sqlite db.sqlite.bak-$(date +%Y%m%d)`
2. تأكد إن `inbox_team_members` موجود أولاً: `PRAGMA table_info(inbox_team_members)`
3. لا تمس `inbox_teams` — فقط `inbox_team_members`

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "PRAGMA table_info(inbox_team_members);"
# يجب أن يظهر: role_override | TEXT | 0 | NULL | 0
```

---

## 🔧 المرحلة الثانية — Backend (T04 → T07)

> ابدأ فقط بعد أن تتحقق من نجاح T01+T02+T03 بالكامل.

---

### ▶️ T04 — Backend: `permissions.js` جديد

**الملف الجديد:**
```
server/routes/inbox/permissions.js
```

**ما يحتويه:**

```javascript
// 1. PERMISSIONS_MAP — كل role_id وصلاحياته
const PERMISSIONS_MAP = {
  1: ['team_manage','org_settings','channels','inbox_settings',
      'reports_full','export','conversations_all','broadcast','role_manage'],
  2: ['team_manage','org_settings','channels','inbox_settings',
      'reports_full','export','conversations_all','broadcast'],
  3: ['reports_team','conversations_team','inbox_settings'],
  4: ['reports_self','conversations_team'],
  5: ['reports_full']   // read-only
};

// 2. loadInboxPermissions() — Middleware
// يقرأ inbox_users + inbox_roles من req.db
// يُنشئ req.inboxUser.permissions = {} (object للبحث السريع)
// لو المستخدم غير موجود في inbox_users → 401

// 3. requirePermission(key) — Factory يُعيد Middleware
// يتحقق req.inboxUser.permissions[key] === true
// لو لأ → res.status(403).json({ error: 'forbidden', required: key })
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/permissions.js
```

---

### ▶️ T05 — Backend: `settings.js` — Roles API (shell + Roles)

**الملف الجديد:**
```
server/routes/inbox/settings.js
```

**الـ Routes في هذه الخطوة فقط (Roles):**
```
GET    /inbox/settings/roles          ← يُعيد كل الأدوار (system + custom)
POST   /inbox/settings/roles          ← requirePermission('team_manage')
PUT    /inbox/settings/roles/:id      ← يرفض is_system=1 بـ 400
DELETE /inbox/settings/roles/:id      ← يرفض لو users موجودون على الدور (400)
                                      ← يرفض is_system=1 (400)
```

**ملاحظات تقنية:**
- POST: يُدرج في inbox_roles مع is_system=0
- PUT: `if (role.is_system) return res.status(400).json({ error: 'cannot_edit_system_role' })`
- DELETE: تحقق أولاً `SELECT COUNT(*) FROM inbox_users WHERE inbox_role_id = ?`

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/settings.js
# smoke test:
curl -s http://localhost:3002/api/inbox/settings/roles \
  -H "Cookie: <session>"
# يجب أن يُعيد الأدوار الخمسة
```

---

### ▶️ T06 — Backend: `settings.js` — Users API

**الملف:** تكملة `server/routes/inbox/settings.js` (نفس ملف T05)

**الـ Routes المضافة:**
```
GET    /inbox/settings/users          ← requirePermission('team_manage')
POST   /inbox/settings/users          ← requirePermission('team_manage')
PUT    /inbox/settings/users/:id      ← requirePermission('team_manage')
DELETE /inbox/settings/users/:id      ← يرفض لو آخر Owner (400)
```

**قواعد DELETE:**
```javascript
// 1. جلب المستخدم المراد حذفه
// 2. لو inbox_role_id === 1 (Owner):
//    COUNT(users WHERE inbox_role_id=1) === 1 → 400 'last_owner'
// 3. غير كده → DELETE
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/settings.js
# اختبر: حاول حذف آخر Owner → يجب أن يُعيد 400
```

---

### ▶️ T07 — Backend: `index.js` — تفعيل requirePermission

**الملف المعدَّل:**
```
server/routes/inbox/index.js
```

**التعديلات:**
```javascript
// في أعلى الملف — إضافة:
const { loadInboxPermissions, requirePermission } = require('./permissions');

// بعد middleware getTenantDb مباشرة — إضافة:
router.use(loadInboxPermissions);  // يُنشئ req.inboxUser.permissions لكل request

// على الـ routes الحساسة:
router.use('/analytics', requirePermission('reports_self'));  // أدنى مستوى
router.use('/settings/roles', requirePermission('team_manage'));
router.use('/settings/users', requirePermission('team_manage'));
router.use('/settings/channels', requirePermission('channels'));
```

**⚠️ تنبيه ترتيب:**
- `loadInboxPermissions` يُضاف **بعد** getTenantDb (يحتاج req.db)
- `loadInboxPermissions` يُضاف **قبل** أي requirePermission

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/index.js
# اختبر: طلب /analytics بدون session → 401
# اختبر: طلب /analytics بـ agent session → 200 (له reports_self)
```

---

## 🎨 المرحلة الثالثة — Frontend (T08 → T11)

> ابدأ فقط بعد أن تتحقق من نجاح T07 (الـ API يعمل).
> ⚠️ T09/T10/T11 تعتمد على App Shell (M3) — لو M3 لم يُنفَّذ بعد، نفّذ T08 فقط الآن.

---

### ▶️ T08 — Frontend: `store.js` — إضافة currentUser.permissions

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/store.js
```

**التعديلات:**

```javascript
// في InboxStore.state — إضافة:
currentUser: {
  id: null,
  name: '',
  role: '',
  inbox_role_id: null,
  permissions: {}   // ← جديد: { team_manage: true, reports_full: true, ... }
},

// دالة جديدة في InboxStore:
can(permissionKey) {
  return this.state.currentUser.permissions[permissionKey] === true;
},
```

**تحقق قبل commit:**
```bash
# افتح الـ Inbox في المتصفح:
InboxStore.state.currentUser  // يجب أن يُعيد object بـ permissions
InboxStore.can('team_manage') // يُعيد true/false حسب الدور
```

---

### ▶️ T09 — Frontend: `app.js` — Route Guards

**⚠️ متطلب:** M3 App Shell (T23/T24) يجب أن يكون جاهزاً أولاً.
**لو M3 لم يُنفَّذ بعد → احذف هذه الخطوة وعُد إليها بعد M3.**

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/app.js
```

**التعديلات:**

```javascript
// دالة جديدة:
function guardRoute(permKey, fallbackMsg = 'ليس لديك صلاحية') {
  if (!InboxStore.can(permKey)) {
    showToast(fallbackMsg, 'error');
    return false;
  }
  return true;
}

// تطبيقها على:
// openSettings() → if (!guardRoute('org_settings')) return;
// openReports()  → if (!guardRoute('reports_self')) return;
```

**تحقق قبل commit:**
```bash
# موظف بدور Agent يضغط على Settings:
# يجب أن يرى: رسالة "ليس لديك صلاحية" ولا يُفتح Settings
```

---

### ▶️ T10 — Frontend: `settings/roles.js` — صفحة الأدوار

**⚠️ متطلب:** T43 (settings-page.js من M2) يجب أن يكون جاهزاً أولاً.
**لو M2 لم يُنفَّذ بعد → احذف هذه الخطوة وعُد إليها مع M2.**

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/roles.js
```

**ما يعرضه:**
- قايمة الأدوار (5 ثابتة + أي أدوار مخصصة)
- الأدوار الثابتة: badge "نظام" + لا توجد أزرار تعديل/حذف
- الأدوار المخصصة: زر تعديل + حذف
- زر "إضافة دور" → Drawer:
  - اسم الدور
  - اختيار الصلاحيات (checkboxes)
  - حفظ → POST /settings/roles

**تحقق قبل commit:**
```bash
# الأدوار الخمسة الثابتة تظهر بدون زر تعديل
# زر "إضافة دور" يفتح Drawer
# حفظ دور جديد يظهره في القايمة
```

---

### ▶️ T11 — Frontend: `settings/users.js` — صفحة المستخدمين

**⚠️ متطلب:** T43 (settings-page.js من M2) يجب أن يكون جاهزاً أولاً.

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/users.js
```

**ما يعرضه:**
- جدول موظفي الـ Inbox: الاسم / البريد / الدور / الحالة / تاريخ الإضافة
- زر "إضافة موظف" → Drawer:
  - البريد الإلكتروني
  - الاسم
  - اختيار الدور (dropdown يجلب من GET /settings/roles)
  - حفظ → POST /settings/users
- زر تعديل لكل موظف → تغيير الدور
- زر إزالة → DELETE (مع confirmation dialog)
  - لو كان آخر Owner → رسالة خطأ واضحة

**تحقق قبل commit:**
```bash
# إضافة موظف جديد → يظهر في الجدول
# محاولة إزالة آخر Owner → رسالة "لا يمكن إزالة آخر مالك"
```

---

## ✅ معيار إغلاق M1

قبل الانتقال لـ M5، تأكد من كل ما يلي:

- [ ] `SELECT COUNT(*) FROM inbox_roles` = 5
- [ ] `SELECT COUNT(*) FROM inbox_users` جاهز للإدخال
- [ ] `PRAGMA table_info(inbox_team_members)` يظهر `role_override`
- [ ] `node --check server/routes/inbox/permissions.js` ✅
- [ ] `node --check server/routes/inbox/settings.js` ✅
- [ ] `node --check server/routes/inbox/index.js` ✅
- [ ] طلب `/settings/roles` بـ Agent → 403
- [ ] `InboxStore.can('team_manage')` يعمل في Console
- [ ] git log يظهر commit لكل خطوة منفصلة

---

## 🔗 الخطوة التالية بعد M1

**→ انتقل إلى:** `inbox-v4/execution/EX-M5-adapter.md`
