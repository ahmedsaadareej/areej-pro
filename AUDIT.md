# AUDIT.md — تقرير الأمان والجودة الشامل
> نقطة البداية: commit `f70d1c9` — تاريخ: 2026-05-05
> آخر تحديث: 2026-05-05

---

## ⚡ أمر بداية كل جلسة (انسخه كما هو)

```
اقرأ /home/areej/areej-pro/AUDIT.md كاملاً، ثم نفّذ أول مهمة حالتها 🔴 بالترتيب.
لكل مهمة: اختبر بعدها، غيّر حالتها لـ ✅، سجّل الـ commit hash.
لا تحذف أي سطر من هذا الملف — فقط أضف.
```

---

## 🔒 بروتوكول ثابت لكل جلسة

### قبل البدء
1. اقرأ هذا الملف كاملاً
2. حدد أول مهمة 🔴
3. تحقق: `git -C /home/areej/areej-pro status`

### بعد كل مهمة
1. شغّل الاختبار المحدد
2. غيّر 🔴 → ✅ في هذا الملف
3. سجّل commit hash
4. `pm2 reload areej-pro` إذا عدّلت backend
5. لا تنتقل للتالية قبل نجاح الاختبار

### إذا فشل اختبار
- لا تكمل
- سجّل المشكلة في خانة "ملاحظة" للمهمة
- ارجع للأمان إذا لزم: `git -C /home/areej/areej-pro stash`

---

## 📊 Dashboard — الحالة الإجمالية

| الخطورة | الإجمالي | مكتمل | متبقي |
|---------|---------|--------|-------|
| 🔴 Critical | 4 | 0 | 4 |
| 🟠 High | 7 | 0 | 7 |
| 🟡 Medium | 7 | 0 | 7 |
| 🟢 Low | 5 | 0 | 5 |
| **المجموع** | **23** | **0** | **23** |

---

## 🔴 CRITICAL — يبدأ هنا

---

### [C1] 🔴 Tenant Isolation مكسور في `GET /conversations/:id`
**الملف:** `server/routes/inbox/conversations.js`
**السطر:** ~195
**المشكلة:**
```sql
WHERE c.id = ?
-- ❌ مفيش tenant check — موظف Tenant A يقدر يشوف محادثات Tenant B
```
**الإصلاح المطلوب:**
```sql
WHERE c.id = ? AND c.tenant_id = ?
-- أو التحقق إن req.inboxUser.id يملك المحادثة
```
**الاختبار:** طلب محادثة من tenant مختلف يرجع 404
**Status:** 🔴 Pending
**Commit:** —
**ملاحظة:** —

---

### [C2] 🔴 XSS في `_linkify` — URL مش محمي في href
**الملف:** `public/dashboard/inbox-v4/chat.js`
**السطر:** ~1423
**المشكلة:**
```js
url => `<a href="${url}" target="_blank">${url}</a>`
// ❌ لو URL = "javascript:alert(1)" → XSS عند الضغط
```
**الإصلاح المطلوب:**
```js
// تحقق إن الـ URL يبدأ بـ http:// أو https:// فقط
const safeUrl = /^https?:\/\//i.test(url) ? url : '#';
url => `<a href="${safeUrl}" target="_blank" rel="noopener">${_escHtml(url)}</a>`
```
**الاختبار:** رسالة تحتوي `javascript:alert(1)` — الرابط يظهر كنص فقط
**Status:** 🔴 Pending
**Commit:** —
**ملاحظة:** —

---

### [C3] 🔴 WhatsApp Webhook — بدون X-Hub-Signature-256 Verification
**الملف:** `server/routes-inbox-webhook.js`
**السطر:** POST `/webhook/whatsapp/:userId`
**المشكلة:**
```js
router.post('/whatsapp/:userId', express.json(), async (req, res) => {
  // ❌ مفيش أي HMAC signature check — أي شخص يقدر يحقن رسائل وهمية
```
**الإصلاح المطلوب:**
```js
// قبل معالجة أي شيء:
const sig = req.headers['x-hub-signature-256'] || '';
const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return res.sendStatus(401);
}
```
**ملاحظة إضافية:** يحتاج `express.raw()` قبل JSON parse لحفظ الـ rawBody
**الاختبار:** POST بدون signature يرجع 401
**Status:** 🔴 Pending
**Commit:** —
**ملاحظة:** —

---

### [C4] 🔴 Login — بدون Rate Limiting مخصص (Brute Force)
**الملف:** `server/app.js`
**المشكلة:**
```js
// Global limit: 500 req/min — كتير جداً للـ login
// مفيش rate limit خاص على /api/auth/login أو /api/auth/otp/send
```
**الإصلاح المطلوب:**
```js
// في app.js قبل routes-auth:
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 10, ... }));
app.use('/api/auth/otp/send', rateLimit({ windowMs: 60*1000, max: 3, ... }));
app.use('/api/auth/register', rateLimit({ windowMs: 60*60*1000, max: 5, ... }));
```
**الاختبار:** 11 محاولة login في 15 دقيقة → 429
**Status:** 🔴 Pending
**Commit:** —
**ملاحظة:** —

---

## 🟠 HIGH — بعد الـ Critical

---

### [H1] 🟠 Tenant Isolation ناقص في Messages endpoints
**الملف:** `server/routes/inbox/messages.js`
**السطرات:** ~166, 244, 670
**المشكلة:** GET/POST message by ID بدون tenant ownership check
**الإصلاح:** إضافة join أو subquery للتحقق من tenant
**الاختبار:** طلب message من tenant مختلف يرجع 403
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H2] 🟠 Telegram Webhook — بدون Secret Token Verification
**الملف:** `server/routes-inbox-webhook.js`
**المشكلة:** Telegram secret_token مش محقَّق
**الإصلاح:** التحقق من `X-Telegram-Bot-Api-Secret-Token` header
**الاختبار:** POST بدون header يرجع 401
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H3] 🟠 `ensureMediaColumns` بيشتغل في كل Webhook Request
**الملف:** `server/routes-inbox-webhook.js` — السطر ~55
**المشكلة:** PRAGMA query على كل رسالة واردة = overhead
**الإصلاح:** استدعاء مرة واحدة عند startup أو cache نتيجة الفحص
**الاختبار:** PRAGMA مش بتظهر في query log عند الرسائل
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H4] 🟠 Fawaterk HMAC — يكمل رغم فشل الـ Signature
**الملف:** `server/routes/pay.js`
**المشكلة:**
```js
if (!valid) console.warn(`⚠️ Fawaterk HMAC mismatch...`);
// ❌ بيكمل ويسجل الدفعة حتى لو الـ signature غلط!
```
**الإصلاح:**
```js
if (!valid) return res.status(401).json({ ok: false, error: 'invalid signature' });
```
**الاختبار:** Webhook بـ HMAC غلط يرجع 401 ومش بيسجل دفعة
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H5] 🟠 Stripe — JSON Parse قبل Signature Verify
**الملف:** `server/routes/pay.js`
**المشكلة:** الـ body بيتعمله parse قبل ما يتحقق من الـ signature
**الإصلاح:** استخدام `express.raw()` + `stripe.webhooks.constructEvent(rawBody, sig, secret)`
**الاختبار:** Stripe webhook بـ signature غلط يرجع 401
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H6] 🟠 WA QR — Sessions بتتولّد كل دقيقتين (Memory/Connection Leak)
**الملف:** `server/whatsapp-qr-service.js`
**من الـ Logs:**
```
[WA-QR] User 1: QR generated  ← كل ~2 دقيقة باستمرار
[WA-QR] User 2: QR generated  ← نفس الشيء
```
**الإصلاح:** فحص سبب إعادة توليد QR — sessions مش بتتحفظ بشكل صح
**الاختبار:** لا يظهر "QR generated" في logs بعد اتصال ناجح
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

### [H7] 🟠 Fawaterk Webhook — يلف على كل التيناتس الـ 29
**الملف:** `server/routes/pay.js`
**المشكلة:**
```js
const allUsers = master.prepare('SELECT id FROM users WHERE slug IS NOT NULL').all();
for (const u of allUsers) { ... } // ❌ O(n) على كل tenant
```
**الإصلاح:** استخدام token مخفي في الـ webhook URL يحدد الـ tenant مباشرة
**الاختبار:** Response time < 100ms حتى مع 100 tenant
**Status:** 🟠 Pending
**Commit:** —
**ملاحظة:** —

---

## 🟡 MEDIUM

---

### [M1] 🟡 CSP معطّل في Helmet
**الملف:** `server/app.js` — السطر ~27
**المشكلة:** `contentSecurityPolicy: false` = لا حماية من XSS
**الإصلاح:** تفعيل CSP تدريجياً مع whitelist للـ inline scripts المستخدمة
**Status:** 🟡 Pending
**Commit:** —

### [M2] 🟡 `inbox_conversations` (v3) + `inbox_conversations_v4` — جدولين شغالين
**المشكلة:** v3 routes لسه شغالة — data inconsistency محتملة
**الإصلاح:** deprecate v3 routes أو sync بينهم
**Status:** 🟡 Pending
**Commit:** —

### [M3] 🟡 Payment Links — مفيش Expiry Check فعلي
**الملف:** `server/routes/pay.js`
**الإصلاح:** إضافة `expires_at` column + check في كل request
**Status:** 🟡 Pending
**Commit:** —

### [M4] 🟡 Missing Indexes على جداول قديمة
**الجداول:**
- `inbox_conversations` — مفيش composite index (platform, sender_id)
- `crm_contacts` — index على phone فقط، مفيش على name
- `sys_invoices` — مفيش index على contact_id أو status
- `sys_orders` — مفيش index على status أو client_phone
**الإصلاح:** migration يضيف الـ indexes
**Status:** 🟡 Pending
**Commit:** —

### [M5] 🟡 Logo Upload — MIME Type غير محقَّق حقيقياً
**الملف:** `server/routes-auth.js`
**المشكلة:** Multer بيستخدم extension — SVG بـ JS يقدر يتحمّل
**الإصلاح:** التحقق من magic bytes أو استخدام `file-type` package
**Status:** 🟡 Pending
**Commit:** —

### [M6] 🟡 `db.run` (async) مخلوط مع `db.prepare().run()` (sync) في messages.js
**المشكلة:** Race conditions محتملة عند رسائل متزامنة
**الإصلاح:** توحيد الـ API — إما كل sync أو كل async
**Status:** 🟡 Pending
**Commit:** —

### [M7] 🟡 WA Webhook — Console.log يطبع محتوى الرسائل
**الملف:** `server/routes-inbox-webhook.js`
**المشكلة:** Privacy — كل رسائل العملاء في logs بالكامل
**الإصلاح:** طباعة metadata فقط (sender_id, conv_id) بدون content
**Status:** 🟡 Pending
**Commit:** —

---

## 🟢 LOW

---

### [L1] 🟢 JWT Expiry — 30 يوم طويلة جداً
**الإصلاح:** تقليل لـ 7 أيام مع refresh token
**Status:** 🟢 Pending

### [L2] 🟢 Auto-refresh cleanup عند الخروج من Inbox
**المشكلة:** Polling timers مش بتتوقف عند الخروج من الصفحة
**Status:** 🟢 Pending

### [L3] 🟢 Poll endpoint يشتغل في 3 tabs مختلفة
**من الـ logs:** `GET /api/inbox/poll` بيجي 3 مرات متتالية في نفس اللحظة
**المشكلة:** كل tab بيعمل poll منفصل = triple load
**Status:** 🟢 Pending

### [L4] 🟢 Health endpoint — يكشف memory و uptime للعالم
**الملف:** `server/app.js`
**الإصلاح:** حماية بـ IP whitelist أو secret header
**Status:** 🟢 Pending

### [L5] 🟢 HR Search — `where` بناء string (آمن حالياً لكن fragile)
**الملف:** `server/routes-hr.js` — السطر ~31
**الإصلاح:** refactor لـ query builder أكثر أماناً
**Status:** 🟢 Pending

---

## 📝 سجل التنفيذ

| التاريخ | المهمة | الإجراء | Commit | المنفّذ |
|---------|--------|---------|--------|---------|
| — | — | — | — | — |

---

## 🗓️ الجلسات

| الجلسة | التاريخ | المهام المنجزة | آخر commit |
|--------|---------|---------------|-----------|
| S0 — Discovery | 2026-05-05 | Audit كامل (23 مشكلة) | f70d1c9 |
| S1 — | — | — | — |
