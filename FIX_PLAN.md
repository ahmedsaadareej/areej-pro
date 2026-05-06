# FIX_PLAN.md — خطة إصلاح Inbox v4
> تاريخ الإنشاء: 2026-05-06
> آخر تحديث: 2026-05-06
> الحالة: ⏳ جارية

---

## 📋 ملخص المشاكل المكتشفة

### مشاكل Database (Critical)
| # | المشكلة | الخطورة | الحالة |
|---|---------|---------|--------|
| DB-1 | `wa_app_secret` column ناقص من `inbox_settings` | 🔴 Critical | ⏳ |
| DB-2 | WhatsApp API settings مش في `inbox_channel_settings_v4` (config فارغ + enabled=0) | 🔴 Critical | ⏳ |
| DB-3 | الرسايل تبقى `status='pending'` ولا تتبعت | 🔴 Critical | ⏳ (ناتج من DB-2) |
| DB-4 | `_getConv()` SQL يستخدم `contact_phone` بدل `sender_phone` الصحيح | 🔴 Critical | ⏳ |

### مشاكل UI/UX
| # | المشكلة | الخطورة | الحالة |
|---|---------|---------|--------|
| UI-1 | Labels Section في الـ Sidebar غير ظاهرة | 🔴 High | ⏳ |
| UI-2 | الـ Snooze/Priority modals غير متصلة بالـ Header buttons | 🔴 High | ⏳ |
| UI-3 | Active Tab في Settings غير مميز بصرياً | 🟡 Medium | ⏳ |
| UI-4 | جدول ساعات العمل فارغ (بدون صفوف الأيام) | 🟡 Medium | ⏳ |
| UI-5 | Agent Status Widget فارغ | 🟡 Medium | ⏳ |
| UI-6 | Platform badge غير واضح في Conv List | 🟡 Medium | ⏳ |
| UI-7 | الوقت النسبي "1ي/2ي/3ي" غير مفهوم | 🟡 Medium | ⏳ |
| UI-8 | Retry button ناقص للرسائل pending | 🟡 Medium | ⏳ |
| UI-9 | Priority filters مكررة في Sidebar | 🟢 Low | ⏳ |
| UI-10 | Platform Filter buttons غير active | 🟢 Low | ⏳ |
| UI-11 | SSE Indicator text غير واضح | 🟢 Low | ⏳ |

---

## 🗓️ خطة الجلسات

### الجلسة S1: إصلاحات Database (Critical) ⏳
**الهدف:** إصلاح كل مشاكل الـ Database عشان الإرسال يشتغل

| # | المهمة | الملفات | الحالة | ملاحظات |
|---|--------|---------|--------|---------|
| S1-1 | إضافة migration v46 للـ `wa_app_secret` column | `server/migrations.js` | ⏳ | |
| S1-2 | Sync WhatsApp settings من `inbox_settings` لـ `inbox_channel_settings_v4` | `server/migrations.js` | ⏳ | |
| S1-3 | Fix `_getConv()` SQL: `sender_phone` بدل `contact_phone` | `server/routes/inbox/messages.js` | ⏳ | |
| S1-4 | Test: تشغيل الـ migration | CLI | ⏳ | |
| S1-5 | Test: إرسال رسالة جديدة | Browser | ⏳ | |
| S1-6 | Commit + Push | Git | ⏳ | |

**الـ commit message:** `fix(inbox-v4): S1 — Database fixes for WhatsApp sending`

---

### الجلسة S2: إصلاحات UI الوظيفية ⏳
**الهدف:** تشغيل العناصر المعطّلة في الـ UI

| # | المهمة | الملفات | الحالة | ملاحظات |
|---|--------|---------|--------|---------|
| S2-1 | تفعيل Labels Section في الـ Sidebar | `public/dashboard/inbox-v4/conv-list.js` أو `labels.js` | ⏳ | |
| S2-2 | ربط Snooze modal بـ Header button ⏰ | `public/dashboard/inbox-v4/chat.js` | ⏳ | |
| S2-3 | ربط Priority modal بـ Header button 🔺 | `public/dashboard/inbox-v4/chat.js` | ⏳ | |
| S2-4 | إصلاح Active state للـ Settings tabs | `public/inbox-v4/pages/page-settings.js` أو CSS | ⏳ | |
| S2-5 | إضافة صفوف الأيام في جدول ساعات العمل | `public/dashboard/inbox-v4/settings/org.js` | ⏳ | |
| S2-6 | تفعيل Agent Status Widget | `public/dashboard/inbox-v4/team.js` أو `app.js` | ⏳ | |
| S2-7 | Test: كل العناصر المُصلَحة | Browser | ⏳ | |
| S2-8 | Commit + Push | Git | ⏳ | |

**الـ commit message:** `fix(inbox-v4): S2 — UI functional fixes (Labels, Snooze, Priority, Settings)`

---

### الجلسة S3: تحسينات Visual ⏳
**الهدف:** تحسين المظهر والـ UX

| # | المهمة | الملفات | الحالة | ملاحظات |
|---|--------|---------|--------|---------|
| S3-1 | تحسين Platform badge في Conv List | `public/dashboard/inbox-v4/conv-list.js` + CSS | ⏳ | |
| S3-2 | تحسين الوقت النسبي (منذ يوم بدل 1ي) | `public/dashboard/inbox-v4/conv-list.js` | ⏳ | |
| S3-3 | إضافة Retry button للرسائل pending | `public/dashboard/inbox-v4/chat.js` + CSS | ⏳ | |
| S3-4 | تنظيف التكرارات في الـ Sidebar | `public/inbox-v4/pages/page-inbox.js` | ⏳ | |
| S3-5 | تحسين Active state للـ Platform filter | CSS | ⏳ | |
| S3-6 | Test: كل التحسينات | Browser | ⏳ | |
| S3-7 | Commit + Push | Git | ⏳ | |

**الـ commit message:** `style(inbox-v4): S3 — Visual improvements (Platform badges, Time, Retry button)`

---

### الجلسة S4: اختبار شامل + QA ⏳
**الهدف:** التأكد إن كل حاجة شغالة

| # | المهمة | الحالة | ملاحظات |
|---|--------|--------|---------|
| S4-1 | اختبار إرسال/استقبال WhatsApp API | ⏳ | |
| S4-2 | اختبار كل الـ Settings tabs | ⏳ | |
| S4-3 | اختبار Labels CRUD + filter | ⏳ | |
| S4-4 | اختبار Snooze + Priority | ⏳ | |
| S4-5 | اختبار Context Panel كامل | ⏳ | |
| S4-6 | اختبار Reports page | ⏳ | |
| S4-7 | اختبار Contacts page | ⏳ | |
| S4-8 | فحص Responsive (Mobile view) | ⏳ | |
| S4-9 | فحص Console errors | ⏳ | |
| S4-10 | تحديث PROJECT.md | ⏳ | |
| S4-11 | Final Commit + Push | ⏳ | |

**الـ commit message:** `chore(inbox-v4): S4 — QA complete, update PROJECT.md`

---

## 📝 سجل التنفيذ

### 2026-05-06 — بداية الجلسة
- ✅ قراءة PROJECT.md
- ✅ فحص Inbox v4 شامل (Backend + Frontend + Database)
- ✅ اكتشاف 4 مشاكل Database + 11 مشكلة UI
- ✅ إنشاء FIX_PLAN.md (هذا الملف)
- ⏳ **المهمة القادمة:** بدء S1-1

---

## ⚠️ ملاحظات مهمة

1. **لا نمسح migrations قديمة** — نضيف فوقها
2. **كل تغيير يُختبر قبل الـ commit**
3. **الـ commit messages موحدة** — `fix/style/chore(inbox-v4): S# — description`
4. **نحدّث هذا الملف بعد كل خطوة**

---

## 🔗 ملفات مرتبطة

- `/home/areej/areej-pro/PROJECT.md` — حالة المشروع العامة
- `/home/areej/areej-pro/inbox-v4/GROUND_TRUTH.md` — الحقائق الثابتة
- `/home/areej/areej-pro/inbox-v4/DECISIONS.md` — القرارات المعمارية
- `/home/areej/areej-pro/MEMORY.md` (في workspace) — ذاكرة طويلة الأمد
