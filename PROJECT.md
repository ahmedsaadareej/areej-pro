# PROJECT.md — Areej Pro
> آخر تحديث: 2026-05-06

## الحالة الحالية
- **آخر commit:** `6cff12d`
- **السيرفر:** areej-server — Ubuntu 24.04 — port 3002
- **PM2:** `pm2 reload areej-pro`

---

## ✅ المنجز (هذه الجلسة)

### FIX_PLAN S1-S5 — مكتمل (2026-05-06)
- **S1:** Database fixes (migrations v47-v49, better-sqlite3 sync API) ✅
- **S2:** UI functional fixes (Labels, Snooze, Priority, Settings API .data pattern) ✅
- **S3:** Visual improvements (Platform badge, Retry button, Platform filter) ✅
- **S4:** Icon-only sidebars with tooltips ✅
- **S5:** Compact chat header (100px → 48px) ✅

**الخطة الكاملة:** `/home/areej/areej-pro/FIX_PLAN.md`

### Labels System — مكتمل (2026-05-05)
- **Settings → Labels:** صفحة إدارة Labels كاملة (CRUD + ألوان) ✅
- **migration v45:** `inbox_labels` في كل tenant ✅
- **Sidebar filter:** فلتر بالـ Label في الـ Inbox ✅
- **Label Picker:** إضافة/إزالة labels من داخل المحادثة ✅
- **Label Chips:** chips ملونة على كل محادثة في القائمة ✅

### إصلاح Ground Truth Sync (2026-05-05)
- **Schema Mismatch** — settings.js: تصحيح `channel_type`→`channel` و `is_active`→`active` ✅
- **Context Panel** — زر بيانات العميل يظهر/يختفي عند فتح/إغلاق المحادثة ✅
- **Header Buttons** — زر ⏰ Snooze + 🔺 Priority مربوطان بالـ modals ✅
- **Sidebar Nav** — أزرار Chatbot/Webhooks/Welcome/Email تنتقل لـ Settings ✅

---


### WhatsApp Business API — مكتمل بالكامل
- **Webhook GET** `/api/webhook/whatsapp/:userId` — Meta Verification ✅
- **Webhook POST** `/api/webhook/whatsapp/:userId` — استقبال الرسايل ✅
- **إرسال** من الـ Inbox للعميل عبر Graph API ✅
- **wa_verify_token** يتحفظ تلقائياً مع الإعدادات ✅
- **Webhook subscription** على `messages` مفعّل عبر Graph API ✅
- **تعليمات الربط** في الـ Settings UI محدّثة ومفصّلة للحالتين ✅

### إعدادات حساب pro-test (userId=2)
- Phone Number ID: `307947889061101`
- WABA ID: `302562432936844`
- App ID: `1965741480781531`
- Webhook URL: `https://pro.areejegypt.com/api/webhook/whatsapp/2`
- Verify Token: `areej_2_verify`
- wa_active: `1`

---

## ✅ المنجز (جلسات سابقة)

| # | الميزة | Commit |
|---|--------|--------|
| FEAT-1 | Browser Push Notifications + sw-inbox.js | eab6336 |
| FEAT-2 | Mark All as Read | be2796f |
| FEAT-3 | Relative Time "منذ X دقيقة" | cb1e79e |
| FEAT-4 | Copy message on double-click | bfce41e |
| FEAT-6 | AI Suggestions via Genspark API | ceb26d0 |
| QUAL-1 | Snooze Dashboard + cancel snooze | 137430f |
| QUAL-1b | Snooze Badge | 3546570 |
| QUAL-4 | Auto-refresh analytics | 353fff6 |
| QUAL-2 | CSAT full implementation | c71537e |
| — | Cache-bust JS/CSS v=1777798076 | 3aaf667 |
| — | WhatsApp settings UI — تعليمات واضحة | 27cb845 |
| — | WhatsApp Webhook endpoints | 7d48264 |
| — | WhatsApp إرسال واستقبال كامل | 93caab8 |

---

## 📋 المهام القادمة (متفق عليها — 2026-05-03)

### ✅ مكتملة
1. ~~Platform Tabs → Dropdown موفّر للمساحة~~ ✅
2. ~~Reply Toolbar → أفقي تحت الـ textarea~~ ✅
3. ~~إصلاح Avatar (دايرة ملونة صحيحة)~~ ✅
4. ~~Channel Selector في Reply Box (يتذكر آخر منصة)~~ ✅
5. ~~تعديل بيانات العميل inline~~ ✅
6. ~~إصلاح "إضافة للـ CRM" — modal في نفس الصفحة مع prefill~~ ✅
7. ~~إصلاح "بروفايل العميل" من Context Panel~~ ✅
8. ~~أوردرات العميل في Context Panel~~ ✅
9. ~~CLV Badge — total_paid/total_invoiced~~ ✅
10. ~~فاتورة جديدة من Inbox بـ prefill~~ ✅
11. ~~تنسيق النص في Reply Box (Bold/Italic/Strike/Mono)~~ ✅
12. ~~New Conversation Modal — Instagram/Meta/WA API + Smart Default~~ ✅

### ✅ Labels System — مكتمل
15. ~~**[A] Backend:** `label_id` filter في `GET /conversations`~~ ✅
16. ~~**[B] Frontend:** Labels Panel في col 1 + Label Chips~~ ✅
17. ~~**[C] UX:** Label Manager + Settings page~~ ✅

### 🟢 أولوية منخفضة
13. ~~Auto-refresh cleanup عند الخروج من صفحة الـ Inbox~~ ✅ (موجود — analytics.unmount)
14. ~~New Conversation Modal — Smart Default للمنصة~~ ✅ (modal كامل + smart default)

---

- اختبار Payment Gateways sandbox (محتاج credentials)
- Live Mode للتطبيق على Meta Developers (لما يتطلب)

---

## ⚠️ ملاحظات مهمة
- التطبيق `Areej Egypt App` لازال في Development Mode — الرسايل بتوصل لأن الـ subscription شغال عبر WABA مباشرة
- `wa_active=1` شرط أساسي عشان الاستقبال يشتغل
- App Secret: موجود في SECRETS.md (لا يُكتب هنا)
- كل عميل جديد: لازم يعمل نفس خطوات الربط على حسابه

---

## 🚧 المهام القادمة — S4: Icon-Only Sidebars

### S4-1: الـ Inbox Shell Sidebar (الداخلي)
**الملفات:** `/public/inbox-v4/shell.css` + `index.html`

| # | المطلوب |
|---|---------|
| 1 | الـ sidebar يكون **دايماً icon-only** (56px بدل 220px) |
| 2 | لما توقف على أي icon → يظهر **tooltip** بالاسم |
| 3 | الـ icons: 📥 Inbox, 👥 جهات الاتصال, 📊 التقارير, ⚙️ الإعدادات, 📢 البث, 🕐 المجدولة, 🤖 Chatbot |
| 4 | الـ status في الأسفل يبقى dot فقط |

---

### S4-2: الـ Dashboard Sidebar الأخضر (الكبير)
**الملفات:** `/public/dashboard/css/main.css` + `index.html`

| # | المطلوب |
|---|---------|
| 1 | لما تدوس على **سهم الـ collapse** → الـ sidebar يصغر لـ **56px icon-only** (مش يختفي) |
| 2 | في الـ collapsed mode → لما توقف على أي icon → يظهر **tooltip** بالاسم |
| 3 | لما تدوس على السهم تاني → يرجع **190px** كامل زي ما كان |

---

### 📌 للبدء في الجلسة القادمة:
```
اقرأ /home/areej/areej-pro/PROJECT.md وابدأ من S4-1 (Inbox Shell Sidebar)
```
