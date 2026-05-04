# C1 — Console Error Audit
> جلسة: 2026-05-04 18:xx UTC
> المصدر: Browser DevTools على pro-test.areejegypt.com/inbox

---

## 🔴 Bugs مكتشفة ومُصلَّحة

### BUG-C1-01 — email.js middleware يستخدم req.inboxUser.id قبل تعريفه
- **الملف:** `server/routes/inbox/email.js` السطر 41
- **المشكلة:** `req.db = req.db || getTenantDb(req.inboxUser.id)` — req.inboxUser غير معرّف في هذه المرحلة
- **الأثر:** كل routes الـ /api/inbox/* ترجع 401 (عبر TypeError يتحول لـ auth error)
- **الحل:** استبدال `req.inboxUser.id` بـ `req.user.id` (صاحب الشركة من requireAuth)
- **الحالة:** ✅ مُصلَّح — commit مع الجلسة

### BUG-C1-02 — SSE EventSource لا يرسل Authorization header
- **الملف:** `public/dashboard/inbox-v4/stream.js` السطر 29
- **المشكلة:** `new EventSource('/api/inbox/stream')` — EventSource لا يدعم Authorization header
- **الأثر:** SSE يفشل باستمرار بـ 401 → "انقطع الاتصال" في الـ UI
- **الحل:** إضافة `?_t=TOKEN` في URL (backend يدعم req.query._t بالفعل)
- **الحالة:** ✅ مُصلَّح — stream.js يقرأ token من InboxAPI أو localStorage

### BUG-C1-03 — inbox_users فارغة لـ tenant 2 (pro-test)
- **المكان:** `data/tenants/2.db`
- **المشكلة:** inboxAuthAdapter يفشل لأن inbox_users فارغة ولا يوجد ERP owner fallback لـ platform owners
- **الأثر:** /api/inbox/me يرجع `inbox_auth_required`
- **الحل المؤقت:** seed يدوي لـ sales@areejegypt.com كـ Owner في inbox_users لـ tenant 2
- **الحل الدائم:** تعديل inboxAuthAdapter ليعتبر platform owner (req.user.role='user' من master.db) كـ inbox owner تلقائياً
- **الحالة:** ✅ مُعالَج (seed يدوي) — الحل الدائم مطلوب لاحقاً

---

## 🟡 Warnings مسجّلة (غير حرجة)

### WARN-C1-01 — [InboxReply] عناصر DOM غير موجودة
- **الملف:** `public/dashboard/inbox-v4/reply.js` السطر 539
- **المشكلة:** reply.js يحاول init قبل اكتمال DOM (race condition)
- **الأثر:** warning فقط — لا تأثير على الوظيفة
- **الحالة:** ⏳ مؤجل — يحتاج تحقق بعد إصلاح auth

---

## 🟡 Errors متبقية تحتاج اختبار بعد auth fix

بعد إصلاح BUG-C1-01 و BUG-C1-02، الـ errors التالية يجب اختبارها من جديد:
- `GET /api/inbox/labels` → 401 (سيختفي بعد auth fix)
- `GET /api/inbox/team/agents` → 401 (سيختفي بعد auth fix)
- `GET /api/inbox/counts` → 401 (سيختفي بعد auth fix)
- `GET /api/inbox/conversations` → 401 (سيختفي بعد auth fix)

---

## 📝 ملاحظات جانبية

- الـ verbose warnings عن "Password field not in form" من صفحات login/dashboard — غير متعلقة بالـ inbox
- الـ shell.js يعمل hard reload غير متوقع من `/dashboard/inbox-v4/` — يحتاج مراجعة

---

## ✅ معيار إغلاق C1

```
[ ] لا errors بـ 401 عند تحميل /inbox مع auth صحيح
[ ] SSE connection يظهر "متصل" بدلاً من "انقطع الاتصال"
[ ] reply.js warning يختفي أو يتحول لـ log
```
