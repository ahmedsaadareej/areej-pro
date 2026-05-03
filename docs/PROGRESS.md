# 📋 PROGRESS.md — Areej Pro Inbox Development
> آخر تحديث: 2026-05-01 23:45 UTC

---

## ✅ المرحلة 1: Inbox v2 — الهيكل الأساسي (مكتمل)

### ما اتعمل:
- [x] **CSS جديد كامل** → `/public/dashboard/css/inbox-v2.css` (1006 سطر)
  - Grid layout 3 أعمدة (list 280px + chat fluid + contact 260px)
  - Platform tabs مع badges
  - Conversation items v2 (avatar + plat-dot + unread + status)
  - Chat header مع platform pill
  - Reply box متكامل (templates + AI + attach + voice + send)
  - Contact panel v2 (sections + quick actions)
- [x] **HTML جديد كامل** → `index.html` (inbox section استُبدل بالكامل)
  - Platform tabs: الكل / تيليجرام / واتساب / واتساب QR / ماسنجر / إنستجرام
  - 3-column layout
  - Contact panel مع quick actions (بروفايل / فاتورة / طلب / آخر PDF)
- [x] **JS محدَّث** → `inbox.js`
  - `renderInboxConvList` → استخدام الـ classes الجديدة
  - `setInboxFilter` + `filterInboxConversations` مع حالة منفصلة
  - `switchInboxPlatform` → دعم الـ classes الجديدة والقديمة
  - Contact panel → setIcp helper للعناصر الجديدة
  - Chat header → avatar بالإنشيالز + platform pill بالكلاس الصح

---

## ✅ المرحلة 2: Inbox Permissions UI (مكتمل)

### ما اتعمل:
- [x] **تاب جديد "🔐 الصلاحيات"** في team-management section
- [x] **جدول صلاحيات تفاعلي** — كل موظف صف، كل صلاحية checkbox
  - Inbox نشط ✓
  - عرض الكل ✓
  - تعيين ✓
  - حذف ✓
  - تصدير ✓
  - أدمن Inbox ✓
  - حد المحادثات (input رقمي)
- [x] **Presets سريعة** → موظف عادي / مشرف / مدير
- [x] **Backend endpoint جديد**: `POST /api/system/inbox/user-perms`
  - تعديل أي صلاحية على الهواء بدون reload
  - حفظ `inbox_active`, `max_concurrent`, أي `inbox.*` permission
- [x] **GET /api/system/inbox/agents** → يرجّع `perms` object لكل agent

---

## 🔜 المرحلة 3: التالي

### الأولوية القادمة:
1. **Send Invoice/PDF من داخل المحادثة** — زر "آخر PDF" يبعت الـ PDF في الشات مباشرةً
2. **Conversation Notes** — ملاحظات داخلية على كل محادثة (مش بتتبعت للعميل)
3. **Quick Reply Labels** — وسم المحادثات بـ labels ملوّنة
4. **Inbox Analytics Dashboard** — لوحة إحصائيات مباشرة
5. **Mobile-responsive** للـ inbox

---

## 🗂️ الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `public/dashboard/css/inbox-v2.css` | ملف جديد كامل |
| `public/dashboard/index.html` | استبدال inbox section + إضافة permissions tab |
| `public/dashboard/js/inbox.js` | تحديث render functions + contact panel |
| `public/dashboard/js/team-settings.js` | إضافة Inbox Permissions UI كامل |
| `server/routes/inbox.js` | إضافة POST /inbox/user-perms + تحديث GET /inbox/agents |

---

## 🔑 نقاط مهمة للاستمرارية

- الـ inbox v2 layout يعتمد على `inbox-v2-wrap` > `inbox-v2-body` > 3 columns
- الـ permissions endpoint يتحقق من `isOwner` — الموظفين مش يقدروا يغيروا صلاحياتهم
- الـ `ipLoadUsers()` بتتستدعى تلقائياً عند فتح تاب `it-permissions`
- الـ `itShowTab` اتعمل override بـ wrapper function لإضافة الـ permissions logic
