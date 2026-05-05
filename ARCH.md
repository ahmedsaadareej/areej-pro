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
| ✅ A3 | `routes/inbox.js` (v3) — تحليل كامل + حذف 454 سطر dead code | ✅ مكتمل |
| ✅ A4 | `inbox_conversations` (v3) + `inbox_conversations_v4` — dual-write مكتمل | ✅ مكتمل |
| ✅ A5 | WA templates: migration inbox_templates → v4 مكتمل | ✅ مكتمل |

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

## ✅ [A3] — routes/inbox.js (v3) — تحليل مكتمل + خطة انتقال واضحة

**المشكلة:**
- الملف `server/routes/inbox.js` يحتوي 3552 سطر و134 route
- أُنشئ للـ inbox v3 لكن يحتوي على وظائف متعددة مختلطة

**نتائج التحليل (2026-05-05):**

### الفئة A — Dead Code (Express لا يصلها — ملفات منفصلة تأتي أولاً في routes-system.js)
| Route في inbox.js | يُخدَّم من |
|---|---|
| `/shipping/*` (11 routes) | `routes/shipping.js` (مُسجَّل قبل inbox.js) |
| `/payment-links`, `/order-forms` | `routes/sales-tools.js` (مُسجَّل قبل inbox.js) |
| `/orders/:id/to-invoice,to-production,ready` | `routes/sales-tools.js` + `routes/orders.js` |
| `/categories`, `/products/*` | `routes/shipping.js` |
| `/suppliers/:id/link-person` | `routes/orders.js` |
→ **هذه routes ميتة تماماً — لا تُنفَّذ أبداً — آمن حذفها من inbox.js**

### الفئة B — V3 Inbox Routes (معطَّلة UI-wise)
- مُسجَّلة على `/api/system/inbox/*`
- تُستدعى من `dashboard/js/inbox.js` + `dashboard/js/ui.js`
- لكن الـ UI التي تستدعيها (`inboxSettingsModal`) معطَّلة `display:none!important`
- كل inbox-v3 scripts موجودة لكن مُعلَّقة في dashboard/index.html (commented out منذ 2026-05-04)
- **الخطر: منخفض** — يمكن deprecate بعد التحقق من عدم وجود clients تستخدمها مباشرة

### الفئة C — Marketplace (ACTIVE — يجب الإبقاء عليها)
| Route | الـ Frontend |
|---|---|
| `GET /marketplace/suppliers` | `page-marketplace` في dashboard (active sidebar) |
| `POST /marketplace/quote` | `submitQuoteRequest()` في inbox.js |
| `POST /marketplace/rate` | `selectRating()` |
| `GET /marketplace/my-quotes` | `showMarketTab('my-quotes')` |
→ **هذه routes نشطة — تُستدعى من page-marketplace في الـ sidebar**
→ **لا تحذف — انقلها لملف `routes/marketplace.js` منفصل**

**خطة الانتقال التدريجية:**
1. ✅ **P1 (آمن الآن):** حذف الـ Dead Code (الفئة A) من inbox.js — لن يكسر شيئاً
2. ⏳ **P2:** نقل `/marketplace/*` لـ `routes/marketplace.js` + تسجيلها في routes-system.js
3. ⏳ **P3:** deprecate v3 inbox routes تدريجياً (بعد التحقق من صفر استخدام)
4. ⏳ **P4:** حذف inbox.js بالكامل بعد اكتمال v4 migration

**Commit:** `66dc131`

**الاختبار:**
```bash
# التحقق من Marketplace تعمل بعد الـ refactor:
curl -s http://localhost:3002/api/system/marketplace/suppliers -H "Authorization: Bearer TEST" | head -50
```

**Status:** ✅ تحليل مكتمل — خطة واضحة موثَّقة

---

## ✅ [A4] — جدولان للمحادثات — Dual-Write مكتمل

**المشكلة:**
- `inbox_conversations` (v3) و `inbox_conversations_v4` موجودان
- Webhook handler (Telegram + WA Business + WA QR) كان يكتب في v3 فقط
- inbox-v4 يقرأ من v4 فقط → الرسائل الواردة لم تظهر في inbox-v4

**التحقق من البيانات:**
- كل tenants: 0 orphan v3 conversations (الـ migration نجح سابقاً)
- v4 عنده conversations من migration فقط — الرسائل الجديدة كانت تضيع

**الإصلاح:**
- `upsertConvV4()` + `insertMsgV4()` في `routes-inbox-webhook.js`
- كل webhook (Telegram, WA Business, WA QR) يكتب في الجدولين بالتوازي
- Automation + Chatbot hooks تستخدم convV4 من dual-write مباشرة (no extra SELECT)
- لا شيء محذوف من v3 — تعايش آمن

**Commit:** `031a72c`

**الاختبار:**
```bash
# التحقق من أن رسالة واردة جديدة تظهر في v4:
sqlite3 /home/areej/areej-pro/data/tenants/2.db \
  "SELECT id,platform,sender_id,last_message_text FROM inbox_conversations_v4 ORDER BY id DESC LIMIT 5;"
```

**Status:** ✅ مكتمل — Dual-write شغاّل على كل القنوات

---

## ✅ [A5] — WA Templates — Migration مكتمل

**المشكلة:**
- v3: `inbox_templates` (name + content فقط)
- v4: `inbox_canned_responses_v4` (shortcut + name + content + category + platforms)
- Tenant 29: 3 templates في v3 وليست في v4

**الإصلاح:**
- Migration script: `server/scripts/migrate-templates-v3-to-v4.js`
- نقل 2 templates لـ Tenant 29 (Arabic slug-safe shortcut)
- wa-templates (Meta Cloud API CRUD) → لا v4 UI بعد — pending v4 feature

**Commit:** `dad1c88`

**Status:** ✅ مكتمل — inbox_canned_responses_v4 هي source of truth

---

## 📝 سجل التنفيذ

| التاريخ | المهمة | الإجراء | Commit |
|---|---|---|---|
| 2026-05-05 | A1 | context.js: meta → data (4 INSERTs في timeline) | `9b1f59a` |
| 2026-05-05 | A2 | settings.js: CHANNEL_BRIDGE + bridge GET/PUT | `83df6df` |
| 2026-05-05 | A3 | تحليل كامل + حذف 454 سطر dead code من routes/inbox.js | `66dc131` |
| 2026-05-05 | A4 | dual-write webhook → v4 (جميع القنوات) | `031a72c` |
| 2026-05-05 | A5 | migration inbox_templates → inbox_canned_responses_v4 | `dad1c88` |
