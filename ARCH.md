# ARCH.md — تقرير المشاكل المعمارية (Inbox v4 + Settings)
> تاريخ الإنشاء: 2026-05-05
> آخر تحديث: 2026-05-05

---

## ⚡ أمر بداية كل جلسة

```
اقرأ /home/areej/areej-pro/ARCH.md كاملاً، ثم نفّذ أول مهمة حالتها 🔴 بالترتيب.
بعد كل مهمة: اختبر، غيّر الحالة لـ ✅، سجّل commit hash.
لا تحذف أي سطر.
```

---

## 📊 Dashboard

| الأولوية | المشكلة | الحالة |
|---|---|---|
| 🔴 A1 | `inbox_timeline_v4` — column `meta` بدل `data` في 4 INSERTs | ✅ مكتمل |
| 🔴 A2 | Settings Channels — يكتب في v4 table، الإرسال يقرأ من `inbox_settings` القديم | ✅ مكتمل |
| 🟠 A3 | `routes/inbox.js` (v3) — 3552 سطر، 134 route، لا يزال شغّالاً بجانب v4 | 🟠 تحليل مطلوب |
| 🟡 A4 | `inbox_conversations` (v3) + `inbox_conversations_v4` — جدولان | 🟡 Pending |
| 🟡 A5 | WA templates: v3 endpoint + v4 frontend — غير متزامنين | 🟡 Pending |

---

## ✅ [A1] — inbox_timeline_v4 column mismatch

**المشكلة:**
- Migration v20 أنشأ جدول `inbox_timeline_v4` بـ column اسمه `data`
- كود `context.js` كان يكتب في `meta` (column غير موجود)
- الـ SELECT كان يقرأ `data` (صح) — لكن الكتابة تفشل بصمت أو ترمي error

**الملفات المتأثرة:**
- `server/routes/inbox/context.js` — 4 INSERTs: contact_linked, contact_unlinked, invoice_created, paylink_created

**الإصلاح:** تغيير `meta` → `data` في الـ 4 مواضع

**Commit:** `9b1f59a`

**الاختبار:**
```bash
# بعد إصلاح: ربط جهة اتصال أو إنشاء فاتورة من Inbox → timeline تُسجَّل
sqlite3 /home/areej/areej-pro/data/tenants/2.db \
  "SELECT * FROM inbox_timeline_v4 ORDER BY id DESC LIMIT 5;"
```

---

## ✅ [A2] — Settings Channels Bridge

**المشكلة:**
- `GET/PUT /api/inbox/settings/channels/:channel` كانت تقرأ/تكتب في `inbox_channel_settings_v4` (config JSON)
- الإرسال الفعلي (messages.js, routes/inbox.js) يقرأ من `inbox_settings` (wa_token, wa_phone_id, telegram_token, ...)
- النتيجة: حفظ إعدادات WA من channels UI → لا يؤثر على الإرسال

**جدولان مختلفان:**
| الجدول | يستخدمه | Columns |
|---|---|---|
| `inbox_settings` | الإرسال + الاستقبال | wa_token, wa_phone_id, wa_account_id, wa_active, telegram_token, ... |
| `inbox_channel_settings_v4` | Settings UI | channel, active, config (JSON) |

**الإصلاح:**
- `CHANNEL_BRIDGE`: mapping لكل قناة (read/write/active_col) من/إلى `inbox_settings`
- GET يقرأ config حقيقي من `inbox_settings`
- PUT يكتب في `inbox_settings` + يزامن `active` في v4
- email: بلا bridge — يبقى في v4 فقط

**Commit:** `83df6df`

**ملاحظة للمستقبل:**
- أي قناة جديدة تُضاف لـ `CHANNEL_BRIDGE` في `settings.js`
- لا تمس `inbox_settings` schema — أضف column بـ ALTER TABLE فقط إذا لزم

---

## 🟠 [A3] — routes/inbox.js (v3) — تحليل مطلوب قبل deprecation

**المشكلة:**
- الملف `server/routes/inbox.js` يحتوي 3552 سطر و134 route
- أُنشئ للـ inbox v3 لكن يحتوي على وظائف متعددة مختلطة:

| الوظيفة | في v4 بديل؟ |
|---|---|
| `/api/inbox/conversations` (v3) | ✅ `routes/inbox/conversations.js` |
| `/api/inbox/settings` (v3 GET/PUT) | ✅ `routes/inbox/settings.js` (بعد A2) |
| `/api/inbox/send` | ✅ `routes/inbox/messages.js` |
| `/api/inbox/templates` (WA canned) | ⚠️ جزئياً في v4 |
| `/api/marketplace/*` | ❌ لا يوجد v4 بديل |
| `/api/payment-links` (v3) | ⚠️ هل v4 messaging يستخدمه؟ |
| `/api/order-forms/*` | ❌ لا يوجد v4 بديل |
| `/api/shipping/*` | ❌ لا يوجد v4 بديل |
| WA webhook/send handlers | ⚠️ موجود في routes-inbox-webhook.js أيضاً |

**الخطر:** حذف inbox.js قد يكسر marketplace, order-forms, shipping

**الخطوة التالية:**
1. تدقيق كل `/api/inbox/*` endpoint — هل الـ frontend v4 لا يزال يستدعيه؟
2. تدقيق كل `/api/marketplace/*` و `/api/payment-links` — هل لها v4 بديل؟
3. إنشاء خطة انتقال تدريجية — deprecate v3 inbox routes فقط، مش كل الملف

**Status:** 🟠 تحليل مطلوب — لا تحذف أو تعطّل قبل التحقق

---

## 🟡 [A4] — جدولان للمحادثات

**المشكلة:**
- `inbox_conversations` (v3) و `inbox_conversations_v4` موجودان
- بعض routes قديمة تقرأ من v3
- migration موجود (migrate-inbox-v3-to-v4.js) لكن مش كل tenants مهاجرين

**الخطوة التالية:** تحقق من أي tenants لم يُهاجَروا بعد وأيهم مهاجرون

**Status:** 🟡 Pending — يأتي بعد A3

---

## 🟡 [A5] — WA Templates غير متزامنة

**المشكلة:**
- v3: `/api/inbox/templates` (CRUD في جدول قديم)
- v4: canned responses في `inbox_canned_responses_v4`
- بعض tenants عندهم templates في الجدولين

**Status:** 🟡 Pending

---

## 📝 سجل التنفيذ

| التاريخ | المهمة | الإجراء | Commit |
|---|---|---|---|
| 2026-05-05 | A1 | context.js: meta → data (4 INSERTs في timeline) | `9b1f59a` |
| 2026-05-05 | A2 | settings.js: CHANNEL_BRIDGE + bridge GET/PUT | `83df6df` |
