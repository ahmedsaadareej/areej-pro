# EX-M5 — تنفيذ M5: Auth Adapter
> المرجع: `inbox-v4/plans/M5-standalone.md`
> المهام: T12 → T18 (7 مهام)
> المتطلب: M1 مكتمل بالكامل (T01–T11)
> آخر تحديث: 2026-05-04

---

## 📋 حالة المهام

| # | المهمة | النوع | الحالة |
|---|--------|-------|--------|
| T12 | `inbox-auth-adapter.js` جديد | Backend | ⏳ |
| T13 | `inbox/index.js` — تفعيل Adapter | Backend | ⏳ |
| T14 | `context.js` — ERP Plugin Guard | Backend | ⏳ |
| T15 | `team.js` — إصلاح req.user.role | Backend | ⏳ |
| T16 | `conversations.js` — req.inboxUser | Backend | ⏳ |
| T17 | باقي inbox/routes (10 ملفات) | Backend | ⏳ |
| T18 | `api.js` — InboxConfig | Frontend | ⏳ |

---

## 🎯 هدف M5

توحيد طريقة التعرف على المستخدم في كل ملفات الـ Inbox.
بعد M5، كل كود جديد يستخدم `req.inboxUser` فقط — لا `req.user.role` ولا `req.tenantUser.id`.

---

## 🔧 المرحلة الأولى — بناء وتفعيل Adapter (T12 + T13)

> هذان أهم خطوتان في M5 — نفّذهما أولاً وتحقق منهما قبل الباقي.

---

### ▶️ T12 — Backend: `inbox-auth-adapter.js` جديد

**الملف الجديد:**
```
server/inbox-auth-adapter.js
```

**منطق الـ Middleware:**

```javascript
async function inboxAuthAdapter(req, res, next) {
  const db = req.db;
  if (!db) return next();  // خارج نطاق الـ Inbox

  // 1. حاول تحميل inbox_user من DB
  const inboxUser = await db.get(
    `SELECT u.*, r.permissions FROM inbox_users u
     JOIN inbox_roles r ON u.inbox_role_id = r.id
     WHERE u.tenant_user_id = ?`,
    [req.user?.id]
  );

  if (inboxUser) {
    // مستخدم inbox حقيقي
    req.inboxUser = {
      id: inboxUser.id,
      email: inboxUser.email,
      name: inboxUser.name,
      inbox_role_id: inboxUser.inbox_role_id,
      permissions: JSON.parse(inboxUser.permissions || '{}'),
      has_erp: true,
      source: 'inbox_users'
    };
    return next();
  }

  // 2. Fallback: صاحب الشركة (Owner) مباشرة
  if (req.user?.role === 'owner' || req.user?.is_owner) {
    req.inboxUser = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      inbox_role_id: 1,  // Owner
      permissions: { /* كل الصلاحيات */ team_manage: true, org_settings: true,
        channels: true, inbox_settings: true, reports_full: true,
        export: true, conversations_all: true, broadcast: true, role_manage: true },
      has_erp: true,
      source: 'erp_owner_fallback'
    };
    return next();
  }

  // 3. لا صلاحية
  return res.status(401).json({ error: 'inbox_auth_required' });
}

module.exports = inboxAuthAdapter;
```

**تحقق قبل commit:**
```bash
node --check server/inbox-auth-adapter.js
```

---

### ▶️ T13 — Backend: `inbox/index.js` — تفعيل Adapter

**الملف المعدَّل:**
```
server/routes/inbox/index.js
```

**التعديلات:**

```javascript
// في أعلى الملف — إضافة:
const inboxAuthAdapter = require('../../inbox-auth-adapter');

// بعد middleware getTenantDb مباشرة — إضافة:
router.use(inboxAuthAdapter);

// ملاحظة: req.db و req.user يبقيان بدون تغيير
// inboxAuthAdapter يُضيف req.inboxUser فقط
```

**⚠️ تحذير بالغ الأهمية:**
- الـ Adapter يُضاف **بعد** getTenantDb (يحتاج req.db)
- الـ Adapter يُضاف **قبل** loadInboxPermissions (لأن loadInboxPermissions يحتاج req.inboxUser)
- الترتيب الصح: getTenantDb → inboxAuthAdapter → loadInboxPermissions

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/index.js
# اختبر: أي route → req.inboxUser موجود ومملوء
# اختبر: طلب بدون session → 401 من inboxAuthAdapter
```

---

## 🔧 المرحلة الثانية — تحديث الـ Routes (T14 → T17)

> كل ملف = commit مستقل. لا تجمع ملفين في commit واحد.

---

### ▶️ T14 — Backend: `context.js` — ERP Plugin Guard

**الملف المعدَّل:**
```
server/routes/inbox/context.js
```

**التعديلات:**
- كل endpoint يعتمد على ERP (customers, orders, invoices...):
  - GET: لو `req.inboxUser.has_erp === false` → أعد `[]` أو `{}`
  - POST/PUT/DELETE: لو `req.inboxUser.has_erp === false` → أعد `403 + { code: 'NO_ERP' }`

**الشكل:**
```javascript
// في بداية كل ERP-dependent endpoint:
if (!req.inboxUser.has_erp) {
  if (req.method === 'GET') return res.json([]);
  return res.status(403).json({ error: 'erp_not_available', code: 'NO_ERP' });
}
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/context.js
# اختبر: has_erp=false + GET → [] (لا 500)
# اختبر: has_erp=false + POST → 403 NO_ERP
```

---

### ▶️ T15 — Backend: `team.js` — إصلاح req.user.role

**الملف المعدَّل:**
```
server/routes/inbox/team.js
```

**التعديلات:**
- استبدال كل `req.user.role === 'owner'` أو `req.user.role === 'admin'` بـ:
  ```javascript
  req.inboxUser.permissions.team_manage
  ```
- استبدال كل `req.tenantUser.id` بـ:
  ```javascript
  req.inboxUser.id
  ```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/team.js
grep -n "req\.user\.role\|req\.tenantUser\.id" server/routes/inbox/team.js
# يجب أن لا تكون هناك نتائج
```

---

### ▶️ T16 — Backend: `conversations.js` — req.inboxUser

**الملف المعدَّل:**
```
server/routes/inbox/conversations.js
```

**التعديلات:**
- كل `req.tenantUser.id` → `req.inboxUser.id`
- كل `req.tenantUser` references → `req.inboxUser`

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/conversations.js
grep -n "req\.tenantUser" server/routes/inbox/conversations.js
# يجب أن لا تكون هناك نتائج
```

---

### ▶️ T17 — Backend: باقي ملفات inbox/routes

**⚠️ قاعدة صارمة: كل ملف = commit مستقل.**

الترتيب الإلزامي:

**1. `stream.js` (أولاً — SSE حساس)**
```bash
node --check server/routes/inbox/stream.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/stream.js
# لا نتائج → commit
```

**2. `messages.js`**
```bash
node --check server/routes/inbox/messages.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/messages.js
# لا نتائج → commit
```

**3. `analytics.js`** (تأكد من تحديث `getInboxRole()` لتستخدم `req.inboxUser.inbox_role_id`)
```bash
node --check server/routes/inbox/analytics.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/analytics.js
# لا نتائج → commit
```

**4. `automation.js`** → commit
**5. `broadcast.js`** → commit
**6. `chatbot.js`** → commit
**7. `email.js`** → commit
**8. `labels.js`** → commit
**9. `search.js`** → commit
**10. `ai.js`** → commit

**بعد كل ملف:**
```bash
node --check server/routes/inbox/<filename>.js
grep -n "req\.tenantUser\|req\.user\.role" server/routes/inbox/<filename>.js
# إذا أعاد نتائج → راجع المنطق قبل commit
```

---

## 🎨 المرحلة الثالثة — Frontend (T18)

---

### ▶️ T18 — Frontend: `api.js` — إضافة InboxConfig

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/api.js
```

**التعديلات — في أعلى الملف:**

```javascript
const InboxConfig = {
  baseUrl: window.location.origin,
  apiBase: '/api/inbox',
  wsBase: window.location.origin.replace(/^http/, 'ws'),
  version: 'v4'
};
```

**السبب:** هذا يُمهّد لـ M5 Standalone — الـ Inbox سيحتاج baseUrl مخصص عندما يعمل كـ standalone app بدون ERP.

**تحقق قبل commit:**
```bash
# افتح الـ Inbox في المتصفح:
InboxConfig.apiBase  // يجب أن يُعيد: '/api/inbox'
```

---

## ✅ معيار إغلاق M5

قبل الانتقال لـ M3، تأكد من كل ما يلي:

- [ ] `node --check server/inbox-auth-adapter.js` ✅
- [ ] `req.inboxUser` موجود في كل request للـ Inbox
- [ ] طلب بدون session → 401 من inboxAuthAdapter
- [ ] `grep -rn "req\.tenantUser\|req\.user\.role" server/routes/inbox/` = لا نتائج
- [ ] `node --check` نجح على كل الـ 10 ملفات في T17
- [ ] `InboxConfig.apiBase` يعمل في Console
- [ ] git log يظهر commit لكل ملف منفصل في T17

---

## 🔗 الخطوة التالية بعد M5

**→ انتقل إلى:** `inbox-v4/execution/EX-M3-shell.md`
