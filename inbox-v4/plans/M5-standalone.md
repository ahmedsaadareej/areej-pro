# M5 — Standalone Architecture
> الحالة: ✅ المرحلتان مكتملتان
> تاريخ المرحلة 1: 2026-05-04
> تاريخ المرحلة 2: 2026-05-04
> المحور: M5 من Phase 9

---

## [المرحلة 1 — التحليل والتصميم المعماري]

*(المحتوى الكامل محفوظ أدناه — لا تعدّل)*

### 1. ماذا نبني؟

خطة معمارية تحوّل Inbox v4 من module مدمج في areej-pro
إلى product مستقل قابل للنزع والبيع منفرداً، مع:

- تحديد كل نقاط التبعية (dependencies) بين Inbox وبقية areej-pro
- تصميم Adapter Layer يسمح بتشغيل الـ Inbox مع أي Auth/DB system
- وضع حدود واضحة (boundaries) لكل layer
- خطة الفصل التدريجي بدون كسر الوضع الحالي

---

### 2. الوضع الراهن — خريطة التبعيات الكاملة

#### 2.1 Auth System
```
areej-pro/server/auth-middleware.js
├── يقرأ JWT من req.headers.authorization أو cookies.pro_token
├── يتحقق من users table في master.db
├── يحمّل subUser من tenant DB
└── يضع req.user (owner) + req.tenantUser (sub-user)
```
الإشكالية: الـ Inbox يعتمد على req.user.id لتحديد الـ tenant DB.

#### 2.2 Tenant DB
```
areej-pro/server/db-tenant.js
├── getTenantDb(userId) → data/tenants/{id}.db
└── نفس DB تحتوي sys_* + inbox_* tables
```

#### 2.3 context.js — التبعية الأعمق على ERP
```
GET /context/invoices → sys_invoices
GET /context/orders   → sys_orders
GET /context/crm      → crm_contacts
```

#### 2.4 خلاصة التبعيات

| التبعية | شدة الربط | الاستراتيجية |
|---|---|---|
| Auth (JWT + master.db) | عالية | Adapter Layer |
| Tenant DB (مع ERP) | متوسطة | Prefix isolation |
| context.js (ERP data) | عالية | Optional Plugin |
| iframe في ERP dashboard | عالية | مكتمل في M3 |

---

### 3. التصميم المعماري

#### req.inboxUser — الكيان الموحّد
```javascript
req.inboxUser = {
  id:            <inbox user id>,
  tenant_id:     <owner/tenant id>,
  name:          'أحمد محمد',
  email:         'ahmed@example.com',
  inbox_role_id: 3,
  permissions:   { ... },
  inbox_active:  true,
  max_concurrent: 10,
  has_erp:       true,
  erp_role_id:   2,
}
```

#### القرارات: D-042 → D-046 (موثقة في DECISIONS.md)

---

### 4. Deployment Models

- **Model A:** Integrated (الحالي) — areej-pro كامل
- **Model B:** Side-by-side — ERP + Inbox على بورتات مختلفة
- **Model C:** Fully Standalone — Inbox وحده بدون ERP

---

## [المرحلة 2 — خطة التنفيذ التقنية التفصيلية]

> Backend أولاً ثم Frontend
> كل خطوة = ملف واحد أو migration واحد
> يجب قراءة GROUND_TRUTH.md + DECISIONS.md قبل التنفيذ

---

## نظرة عامة على الخطوات

| # | الخطوة | الملف/الـ Migration | النوع |
|---|--------|---------------------|-------|
| STEP 1 | inbox-auth-adapter.js | `server/inbox-auth-adapter.js` | Backend جديد |
| STEP 2 | تحديث inbox/index.js | `server/routes/inbox/index.js` | Backend تعديل |
| STEP 3 | context.js → optional plugin | `server/routes/inbox/context.js` | Backend تعديل |
| STEP 4 | إصلاح req.user → req.inboxUser في team.js | `server/routes/inbox/team.js` | Backend تعديل |
| STEP 5 | إصلاح req.user → req.inboxUser في conversations.js | `server/routes/inbox/conversations.js` | Backend تعديل |
| STEP 6 | إصلاح req.user → req.inboxUser في بقية الملفات | ملفات متعددة (واحد واحد) | Backend تعديل |
| STEP 7 | InboxConfig في api.js | `public/dashboard/inbox-v4/api.js` | Frontend تعديل |
| STEP 8 | تحديث PHASE9_TASKS.md + DECISIONS.md + SESSIONS.md | — | توثيق |

---

## STEP 1 — إنشاء inbox-auth-adapter.js

### الملف
`server/inbox-auth-adapter.js` ← **ملف جديد**

### الوظيفة
Middleware يُضاف في `server/routes/inbox/index.js` بعد `requireAuth`.
يُنشئ `req.inboxUser` من `req.user` + `req.tenantUser` الحاليين.
يضمن أن كل Inbox route تتعامل مع كيان موحّد بغض النظر عن Auth system.

### الكود الكامل
```javascript
// server/inbox-auth-adapter.js
// Inbox Auth Adapter — يترجم req.user/tenantUser → req.inboxUser
// آخر تحديث: 2026-05-04 (M5 Phase 9)
// ⚠️ لا تعدّل هذا الملف بدون موافقة أحمد — نقطة تكامل حرجة

'use strict';

// Permission set كامل للـ Owner
const OWNER_PERMISSIONS = {
  org_settings:  true,
  team_manage:   true,
  channels:      true,
  inbox_settings: true,
  automation:    true,
  reports_full:  true,
  reports_team:  true,
  reports_self:  true,
  export:        true,
  delete_account: true,
};

// Fallback: يحوّل ERP role_id لـ inbox_role_id مؤقت حتى M1 يُطبَّق
function mapERP2InboxRole(erpRoleId) {
  // 1=مدير → Admin(2), 2=محاسب → Supervisor(3), 3=مبيعات → Agent(4), 4=مخزن → Agent(4)
  const map = { 1: 2, 2: 3, 3: 4, 4: 4 };
  return map[erpRoleId] || 4; // default: Agent
}

// يجلب permissions من inbox_roles أو يُعيد OWNER_PERMISSIONS
function getPermissions(db, inboxRoleId) {
  if (!db || !inboxRoleId) return OWNER_PERMISSIONS;
  try {
    const role = db.prepare(
      'SELECT permissions FROM inbox_roles WHERE id = ?'
    ).get(inboxRoleId);
    if (role && role.permissions) {
      return typeof role.permissions === 'string'
        ? JSON.parse(role.permissions)
        : role.permissions;
    }
  } catch (_) {
    // inbox_roles قد لا يكون موجوداً قبل M1 migration
  }
  return OWNER_PERMISSIONS; // fallback آمن
}

// Middleware الرئيسي
function inboxAuthAdapter(req, res, next) {
  // حالة 1: tenantUser موجود (sub-user في areej-pro)
  if (req.tenantUser) {
    const inboxRoleId = req.tenantUser.inbox_role_id
      || mapERP2InboxRole(req.tenantUser.role_id);

    req.inboxUser = {
      id:             req.tenantUser.id,
      tenant_id:      req.user.id,
      name:           req.tenantUser.name   || '',
      email:          req.tenantUser.email  || '',
      inbox_role_id:  inboxRoleId,
      permissions:    getPermissions(req.db, inboxRoleId),
      inbox_active:   req.tenantUser.inbox_active !== undefined
                        ? !!req.tenantUser.inbox_active
                        : true,
      max_concurrent: req.tenantUser.max_concurrent || 10,
      has_erp:        true,
      has_payment:    true,
      erp_role_id:    req.tenantUser.role_id || null,
    };
    return next();
  }

  // حالة 2: Owner مباشر (لا tenantUser — admin panel)
  if (req.user) {
    req.inboxUser = {
      id:             req.user.id,
      tenant_id:      req.user.id,
      name:           req.user.name  || '',
      email:          req.user.email || '',
      inbox_role_id:  1, // Owner = role 1 دايماً
      permissions:    OWNER_PERMISSIONS,
      inbox_active:   true,
      max_concurrent: 999,
      has_erp:        true,
      has_payment:    true,
      erp_role_id:    null,
    };
    return next();
  }

  // حالة 3: لا يوجد user (لا يجب أن يصل هنا بعد requireAuth)
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = inboxAuthAdapter;
```

### التحقق بعد الكتابة
```bash
node --check server/inbox-auth-adapter.js
```

### الـ Rollback
```bash
rm server/inbox-auth-adapter.js
```

---

## STEP 2 — تحديث inbox/index.js لاستدعاء الـ Adapter

### الملف
`server/routes/inbox/index.js` ← **تعديل**

### ما يتغير
إضافة سطرين فقط:
1. `require` للـ adapter في الأعلى
2. `router.use(inboxAuthAdapter)` بعد سطر `req.db = getTenantDb(req.user.id)`

### الكود المستهدف (الجزء المعدَّل فقط)
```javascript
// في أعلى الملف — أضف بعد require statements الموجودة:
const inboxAuthAdapter = require('../../inbox-auth-adapter');

// في الـ middleware chain — بعد سطر getTenantDb:
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});
// أضف مباشرة هنا:
router.use(inboxAuthAdapter);
```

### ملاحظة مهمة
- `req.db` يبقى كما هو — الـ adapter لا يتدخل فيه
- `req.user` يبقى متاحاً — الـ adapter لا يحذفه، فقط يُضيف `req.inboxUser`
- هذا backward-compatible: الكود القديم يستمر يعمل حتى يُهاجَر تدريجياً

### التحقق بعد التعديل
```bash
node --check server/routes/inbox/index.js
# ثم smoke check:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/inbox/conversations \
  -H "Cookie: pro_token=TEST" || echo "server not running"
```

### الـ Rollback
```bash
git checkout -- server/routes/inbox/index.js
```

---

## STEP 3 — context.js → Optional ERP Plugin

### الملف
`server/routes/inbox/context.js` ← **تعديل**

### الوظيفة
تحويل كل endpoint يعتمد على ERP (sys_invoices, sys_orders, crm_contacts)
ليتحقق من `req.inboxUser.has_erp` قبل تنفيذ الـ query.
لو `has_erp=false` → يُعيد `[]` أو `{}` بدون error 500.

### النمط الموحّد لكل endpoint ERP-dependent

**قبل (الكود الحالي):**
```javascript
router.get('/conversations/:id/context/invoices', requireAuth, async (req, res) => {
  try {
    const invoices = req.db.prepare(
      'SELECT * FROM sys_invoices WHERE contact_phone = ?'
    ).all(contact.phone);
    res.json(invoices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**بعد (النمط الجديد):**
```javascript
router.get('/conversations/:id/context/invoices', requireAuth, async (req, res) => {
  // ERP Plugin Check — D-043
  if (!req.inboxUser || !req.inboxUser.has_erp) {
    return res.json([]);
  }
  try {
    const invoices = req.db.prepare(
      'SELECT * FROM sys_invoices WHERE contact_phone = ?'
    ).all(contact.phone);
    res.json(invoices);
  } catch (e) {
    // graceful degradation — D-045
    return res.json([]);
  }
});
```

### الـ Endpoints التي تحتاج التعديل في context.js

| الـ Endpoint | الجدول ERP | الفعل |
|---|---|---|
| GET /context/invoices | sys_invoices | أضف has_erp check + try/catch يُعيد [] |
| GET /context/orders | sys_orders | أضف has_erp check + try/catch يُعيد [] |
| GET /context/crm | crm_contacts | أضف has_erp check + try/catch يُعيد [] |
| POST /context/invoice | sys_invoices | أضف has_erp check + يُعيد 403 لو false |
| GET /context/payment-link | /api/pay | أضف has_payment check + يُعيد [] |

### Helper function تُضاف في أعلى context.js
```javascript
// في أعلى context.js — بعد requires
function requireERP(req, res) {
  if (!req.inboxUser || !req.inboxUser.has_erp) {
    res.json(Array.isArray(arguments[2]) ? arguments[2] : []);
    return false;
  }
  return true;
}
// الاستخدام: if (!requireERP(req, res)) return;
```

### ملاحظة
- GET endpoints تُعيد `[]` (لا تكسر الـ UI)
- POST/write endpoints تُعيد `{ error: 'ERP not available', code: 'NO_ERP' }` مع status 403
- Frontend context.js يتعامل مع الـ 403 بإخفاء الأقسام (لا popup خطأ)

### التحقق بعد التعديل
```bash
node --check server/routes/inbox/context.js
```

### الـ Rollback
```bash
git checkout -- server/routes/inbox/context.js
```

---

## STEP 4 — team.js: إصلاح req.user.role → req.inboxUser.permissions

### الملف
`server/routes/inbox/team.js` ← **تعديل**

### المشكلة (من GROUND_TRUTH.md)
```javascript
// الكود الحالي الخاطئ في team.js:
const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
// ⚠️ req.user.role غير موجود — الموجود هو role_id
```

### الحل — النمط الموحّد لـ Permission Check

**استبدل كل permission checks في team.js بهذا النمط:**
```javascript
// بدل: const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
// استخدم:
const canManageTeam = req.inboxUser && req.inboxUser.permissions &&
  (req.inboxUser.permissions.team_manage || req.inboxUser.inbox_role_id <= 2);
// inbox_role_id: 1=Owner, 2=Admin → يملكان team_manage دائماً
```

### الـ Patterns التي تُبحث وتُستبدل في team.js

| الكود القديم | الكود الجديد |
|---|---|
| `req.user.role === 'owner'` | `req.inboxUser.inbox_role_id === 1` |
| `req.user.role === 'admin'` | `req.inboxUser.inbox_role_id <= 2` |
| `req.user.role === 'owner' \|\| req.user.role === 'admin'` | `req.inboxUser.permissions.team_manage` |
| `req.tenantUser.id` | `req.inboxUser.id` |
| `req.user.id` (كـ tenant identifier) | `req.inboxUser.tenant_id` |

### ملاحظة مهمة
- لا تستبدل `req.db` — يبقى كما هو
- لا تستبدل `req.user.id` في `getTenantDb(req.user.id)` — موجود في index.js فقط
- فقط الـ role checks + user identity تتغير

### التحقق بعد التعديل
```bash
node --check server/routes/inbox/team.js
# تحقق يدوي: grep -n "req.user.role\|req.tenantUser.id" server/routes/inbox/team.js
# النتيجة المتوقعة: لا نتائج
```

### الـ Rollback
```bash
git checkout -- server/routes/inbox/team.js
```

---

## STEP 5 — conversations.js: استبدال req.user → req.inboxUser

### الملف
`server/routes/inbox/conversations.js` ← **تعديل**

### ما يتغير
conversations.js هو أكبر ملف في الـ Inbox routes.
التغييرات محدودة في:
1. كل مكان يستخدم `req.tenantUser.id` كـ agent identifier → `req.inboxUser.id`
2. كل permission check يستخدم `req.user.role` → `req.inboxUser.permissions`
3. كل مكان يستخدم `req.user.id` كـ tenant_id → `req.inboxUser.tenant_id`

### الـ Patterns التي تُبحث وتُستبدل

| الكود القديم | الكود الجديد |
|---|---|
| `req.tenantUser.id` | `req.inboxUser.id` |
| `req.tenantUser.name` | `req.inboxUser.name` |
| `req.tenantUser.role_id` | `req.inboxUser.inbox_role_id` |
| `req.user.role === 'owner'` | `req.inboxUser.inbox_role_id === 1` |
| `req.user.role === 'admin'` | `req.inboxUser.inbox_role_id <= 2` |

### Bulk Actions Permission Check
```javascript
// قبل:
if (req.tenantUser.role_id > 2) return res.status(403).json({ error: 'Not allowed' });

// بعد:
if (!req.inboxUser.permissions.inbox_settings && req.inboxUser.inbox_role_id > 2) {
  return res.status(403).json({ error: 'Not allowed' });
}
```

### التحقق بعد التعديل
```bash
node --check server/routes/inbox/conversations.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/conversations.js
# النتيجة المتوقعة: لا نتائج
```

### الـ Rollback
```bash
git checkout -- server/routes/inbox/conversations.js
```

---

## STEP 6 — بقية ملفات inbox/routes: استبدال req.user → req.inboxUser

### الملفات المستهدفة (كل ملف في خطوة منفصلة)

| الملف | الـ Patterns الموجودة | الأولوية |
|---|---|---|
| `analytics.js` | req.tenantUser.id, req.user.role | عالية |
| `broadcast.js` | req.tenantUser.id | متوسطة |
| `automation.js` | req.tenantUser.id, permission checks | متوسطة |
| `chatbot.js` | req.tenantUser.id | متوسطة |
| `labels.js` | req.tenantUser.id | منخفضة |
| `messages.js` | req.tenantUser.id, req.tenantUser.name | عالية |
| `search.js` | req.tenantUser.id | منخفضة |
| `ai.js` | req.tenantUser.id | منخفضة |
| `email.js` | req.tenantUser.id | متوسطة |
| `stream.js` | req.user.id, req.tenantUser.id | عالية |

### النمط الموحّد للاستبدال في كل ملف

```
req.tenantUser.id   → req.inboxUser.id
req.tenantUser.name → req.inboxUser.name
req.user.id (كـ tenant) → req.inboxUser.tenant_id
req.user.role checks → req.inboxUser.permissions checks
req.tenantUser.role_id → req.inboxUser.inbox_role_id
```

### ملاحظة خاصة لـ stream.js
stream.js يستخدم user identity لتمييز SSE connections.
**قبل:**
```javascript
const userId = req.tenantUser ? req.tenantUser.id : req.user.id;
```
**بعد:**
```javascript
const userId = req.inboxUser.id; // موحّد — لا تفرقة بعد الآن
```

### ملاحظة خاصة لـ analytics.js
analytics.js فيه `getInboxRole(req)` helper (D-039).
**بعد STEP 6:**
```javascript
// قبل:
function getInboxRole(req) {
  if (req.inboxUser && req.inboxUser.inbox_role) return req.inboxUser.inbox_role;
  return req.user && req.user.role_id <= 2 ? 'admin' : 'agent';
}

// بعد — أبسط:
function getInboxRole(req) {
  const roleId = req.inboxUser.inbox_role_id;
  if (roleId === 1 || roleId === 2) return 'admin';
  if (roleId === 3) return 'supervisor';
  return 'agent';
}
```

### التحقق بعد كل ملف
```bash
# استبدل FILENAME بالملف الحالي
node --check server/routes/inbox/FILENAME.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/FILENAME.js
# git commit بعد كل ملف
git add server/routes/inbox/FILENAME.js && git commit -m "M5: migrate FILENAME.js to req.inboxUser"
```

### ترتيب التنفيذ المقترح
```
1. stream.js      (حساس — SSE connections)
2. messages.js    (كثير الاستخدام)
3. analytics.js   (فيه getInboxRole)
4. automation.js
5. broadcast.js
6. chatbot.js
7. email.js
8. labels.js
9. search.js
10. ai.js
```

---

## STEP 7 — Frontend: InboxConfig في api.js

### الملف
`public/dashboard/inbox-v4/api.js` ← **تعديل**

### الوظيفة
إضافة `InboxConfig` object في أعلى api.js يمركز كل URLs.
يمنع hardcoded strings التي تعيق Standalone deployment (D-044).

### الكود المضاف في أعلى api.js (بعد أول تعليق)
```javascript
// ─── InboxConfig — Standalone-ready URL config (D-044) ───────────────────────
// في areej-pro: هذه القيم الافتراضية تعمل بدون تغيير
// في Standalone: عدّل هذه القيم فقط لتوجيه الـ App للـ backend الصح
const InboxConfig = Object.freeze({
  apiBase:  '/api/inbox',       // base لكل Inbox API calls
  authBase: '/api/auth',        // base لـ login/logout
  wsBase:   '/api/inbox/stream', // SSE endpoint
  version:  'v4',
});
// ─────────────────────────────────────────────────────────────────────────────
```

### الـ API calls التي تُحدَّث في api.js

**النمط العام:**
```javascript
// قبل (hardcoded):
const res = await fetch('/api/inbox/conversations', { ... });

// بعد (config-driven):
const res = await fetch(`${InboxConfig.apiBase}/conversations`, { ... });
```

### الـ Endpoints ذات الأولوية العالية للتحديث

| الـ Endpoint الحالي | بعد التحديث |
|---|---|
| `/api/inbox/conversations` | `${InboxConfig.apiBase}/conversations` |
| `/api/inbox/stream` | `${InboxConfig.wsBase}` |
| `/api/inbox/messages` | `${InboxConfig.apiBase}/messages` |
| `/api/auth/logout` | `${InboxConfig.authBase}/logout` |

### ملاحظة
- لا تغيّر كل الـ endpoints دفعة واحدة في خطوة واحدة
- ابدأ بـ InboxConfig object فقط في STEP 7
- التحديث التدريجي للـ endpoints = Phase 10 task

### التحقق بعد التعديل
```bash
# لا يوجد node --check للـ frontend JS
# تحقق يدوي:
grep -n "InboxConfig" public/dashboard/inbox-v4/api.js
# النتيجة المتوقعة: السطور الجديدة فقط
```

### الـ Rollback
```bash
git checkout -- public/dashboard/inbox-v4/api.js
```

---

## STEP 8 — تحديث ملفات التوثيق

### الملفات
1. `inbox-v4/PHASE9_TASKS.md` — علّم M5 بـ ✅
2. `inbox-v4/DECISIONS.md` — لا قرارات جديدة (D-042→D-046 موجودة)
3. `inbox-v4/SESSIONS.md` — أضف في الأعلى

### ما يُضاف في SESSIONS.md
```markdown
## جلسة 2026-05-04 — المحور M5: Standalone Architecture (المرحلة 2)
- الحالة: مكتملة
- ما تم: خطة تنفيذ تقنية كاملة (8 خطوات) لفصل Inbox عن areej-pro
  - STEP 1: inbox-auth-adapter.js (ملف جديد)
  - STEP 2: تحديث inbox/index.js
  - STEP 3: context.js → optional ERP plugin
  - STEP 4-6: هجرة team.js + conversations.js + بقية الملفات لـ req.inboxUser
  - STEP 7: InboxConfig في api.js
- قرارات جديدة: لا (D-042→D-046 موثقة من المرحلة 1)
- المحور القادم: Phase 9 مكتملة ✅ → جلسة مراجعة شاملة (Phase 10 تمهيد)
```

---

## ملخص M5 — المرحلة 2

### ما تم تخطيطه
- **8 خطوات تنفيذية** واضحة ومرتبة
- كل خطوة = ملف واحد + تحقق + rollback
- Backend كامل قبل Frontend
- Backward-compatible: الكود القديم يستمر حتى الهجرة الكاملة

### الخلاصة المعمارية
> بعد تنفيذ STEP 1-7، يكون الـ Inbox:
> - يعمل بـ `req.inboxUser` موحّد
> - context.js يتعامل gracefully مع غياب ERP
> - Frontend جاهز لـ Standalone deployment بتغيير InboxConfig فقط

### ترتيب التنفيذ في Phase 10
```
STEP 1 → STEP 2 (معاً في جلسة واحدة — خطوتان صغيرتان)
STEP 3 → جلسة مستقلة
STEP 4 → STEP 5 → جلسة مستقلة لكل منهما
STEP 6 → ملف واحد لكل جلسة (10 جلسات)
STEP 7 → جلسة مستقلة
```

---

## الأسئلة الخمسة — معيار الجودة

1. **ماذا نبني؟**
   Adapter Layer يحوّل Inbox من module مدمج إلى Standalone-ready product

2. **لماذا هكذا؟**
   الفصل التدريجي يحمي 8 phases من العمل — لا rewrite كامل

3. **كيف يُبنى؟**
   8 خطوات تفصيلية — كل خطوة ملف واحد + تحقق + rollback (موثق أعلاه)

4. **ما الذي يمكن أن يفشل؟**
   - req.inboxUser undefined لو adapter لم يُضاف → D-042 يضمن middleware قبل كل route
   - context.js يُعيد 500 في standalone → D-045 يضمن try/catch
   - SSE disconnect لو stream.js يستخدم req.user بعد الهجرة → STEP 6 يعالجها

5. **كيف يتكامل مع الباقي؟**
   - M1: inbox_role_id + permissions مصدرها inbox_roles
   - M2: org settings تُقرأ من inbox_org_settings لا ERP profile
   - M3: /inbox route المستقلة = نقطة دخول Standalone
   - M4: analytics مستقل بالفعل — لا تغييرات

---

> آخر تحديث: 2026-05-04 (M5 — المرحلتان مكتملتان)
