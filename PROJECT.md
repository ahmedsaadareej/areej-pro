# PROJECT.md — Areej Pro
> آخر تحديث: 2026-05-03

## الحالة الحالية
- **آخر commit:** `93caab8`
- **السيرفر:** areej-server — Ubuntu 24.04 — port 3002
- **PM2:** `pm2 reload areej-pro`

---

## ✅ المنجز (هذه الجلسة)

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

### 🔴 أولوية عالية — UX / مساحة
1. Platform Tabs → Dropdown موفّر للمساحة
2. Reply Toolbar → أفقي تحت الـ textarea
3. إصلاح Avatar (دايرة ملونة صحيحة)
4. Channel Selector في Reply Box (يتذكر آخر منصة)

### 🟠 أولوية عالية — Context Panel
5. تعديل بيانات العميل inline
6. إصلاح "إضافة للـ CRM" — modal في نفس الصفحة مع prefill
7. إصلاح "بروفايل العميل" من Context Panel

### 🟡 أولوية متوسطة
8. أوردرات العميل في Context Panel (API call ناقص)
9. CLV Badge — total_paid/total_invoiced من الـ API
10. فاتورة جديدة من Inbox بـ prefill
11. تنسيق النص في Reply Box (Bold/Italic)
12. New Conversation Modal — Instagram/Meta

### 🟢 أولوية منخفضة
13. Auto-refresh cleanup عند الخروج من صفحة الـ Inbox
14. New Conversation Modal — Smart Default للمنصة

---

- اختبار Payment Gateways sandbox (محتاج credentials)
- Live Mode للتطبيق على Meta Developers (لما يتطلب)

---

## ⚠️ ملاحظات مهمة
- التطبيق `Areej Egypt App` لازال في Development Mode — الرسايل بتوصل لأن الـ subscription شغال عبر WABA مباشرة
- `wa_active=1` شرط أساسي عشان الاستقبال يشتغل
- App Secret: موجود في SECRETS.md (لا يُكتب هنا)
- كل عميل جديد: لازم يعمل نفس خطوات الربط على حسابه
