# FIX_PLAN.md — خطة إصلاح Inbox v4
> تاريخ الإنشاء: 2026-05-06
> آخر تحديث: 2026-05-06
> الحالة: ⏳ جارية

---

## 🚀 أمر بدء الجلسة الجديدة

```
اقرأ /home/areej/areej-pro/FIX_PLAN.md وكمّل من أول مهمة ⏳ لم تكتمل.
```

---

## 📋 ملخص المشاكل المكتشفة

### مشاكل Database (Critical)
| # | المشكلة | الخطورة | الحالة |
|---|---------|---------|--------|
| DB-1 | `wa_app_secret` column ناقص من `inbox_settings` | 🔴 Critical | ✅ تم (v47) |
| DB-2 | WhatsApp API settings مش في `inbox_channel_settings_v4` (config فارغ + enabled=0) | 🔴 Critical | ✅ تم (v48) |
| DB-3 | الرسايل تبقى `status='pending'` ولا تتبعت | 🔴 Critical | ✅ تم (S1 fixes) |
| DB-4 | `_getConv()` SQL يستخدم `contact_phone` بدل `sender_phone` الصحيح | 🔴 Critical | ✅ تم |

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

### الجلسة S1: إصلاحات Database (Critical) ✅
**الهدف:** إصلاح كل مشاكل الـ Database عشان الإرسال يشتغل

| # | المهمة | الملفات | الحالة | ملاحظات |
|---|--------|---------|--------|---------|
| S1-1 | إضافة migration v47 للـ `wa_app_secret` column | `server/migrations.js` | ✅ | |
| S1-2 | Sync WhatsApp settings من `inbox_settings` لـ `inbox_channel_settings_v4` (v48) | `server/migrations.js` | ✅ | |
| S1-3 | Fix `_getConv()` + `_getChannelConfig()` SQL: better-sqlite3 sync API | `server/routes/inbox/messages.js` | ✅ | |
| S1-3b | Fix `_saveMessage()`: autoincrement بدل UUID | `server/routes/inbox/messages.js` | ✅ | |
| S1-3c | إضافة migration v49 للـ `agent_name` + `external_id` columns | `server/migrations.js` | ✅ | |
| S1-3d | Fix `_touchConv()`: `last_message_text` + `last_message_dir` | `server/routes/inbox/messages.js` | ✅ | |
| S1-4 | Test: تشغيل الـ migrations | CLI | ✅ | v47, v48, v49 applied |
| S1-5 | Test: إرسال رسالة جديدة | Browser | ✅ | رسالة id=469 اتحفظت بنجاح |
| S1-6 | Commit + Push | Git | ⏳ | |

**الـ commit message:** `fix(inbox-v4): S1 — Database + API fixes for message sending`

---

### الجلسة S2: إصلاحات UI الوظيفية ⏳
**الهدف:** تشغيل العناصر المعطّلة في الـ UI

| # | المهمة | الملفات | الحالة | ملاحظات |
|---|--------|---------|--------|---------|
| S2-1 | تفعيل Labels Section في الـ Sidebar | `public/inbox-v4/pages/page-inbox.js` | ✅ | |
| S2-2 | ربط Snooze modal بـ Header button ⏰ | `public/inbox-v4/pages/page-inbox.js` | ✅ | |
| S2-3 | ربط Priority modal بـ Header button 🔺 | `public/inbox-v4/pages/page-inbox.js` | ✅ | |
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

---

### الجلسة S4: Icon-Only Sidebars ⏳
**الهدف:** تحويل الـ sidebars لـ icon-only مع tooltips

#### S4-1: الـ Inbox Shell Sidebar (الداخلي)
**الملفات:** `/public/inbox-v4/shell.css` + `index.html`

| # | المهمة | الحالة |
|---|--------|--------|
| S4-1a | الـ sidebar يكون **دايماً icon-only** (56px بدل 220px) | ✅ |
| S4-1b | لما توقف على أي icon → يظهر **tooltip** بالاسم | ✅ |
| S4-1c | الـ icons: 📥 Inbox, 👥 جهات الاتصال, 📊 التقارير, ⚙️ الإعدادات, 📢 البث, 🕐 المجدولة, 🤖 Chatbot | ✅ |
| S4-1d | الـ status في الأسفل يبقى dot فقط + tooltip + click-cycle | ✅ |
| S4-1e | Test + Commit | ✅ | commit 107c682 |

---

#### S4-2: الـ Dashboard Sidebar الأخضر (الكبير)
**الملفات:** `/public/dashboard/css/main.css` + `index.html`

| # | المهمة | الحالة |
|---|--------|--------|
| S4-2a | لما تدوس على **سهم الـ collapse** → الـ sidebar يصغر لـ **56px icon-only** (مش يختفي) | ⏳ |
| S4-2b | في الـ collapsed mode → لما توقف على أي icon → يظهر **tooltip** بالاسم | ⏳ |
| S4-2c | لما تدوس على السهم تاني → يرجع **190px** كامل زي ما كان | ⏳ |
| S4-2d | Test + Commit | ⏳ |

**Commit messages:**
- `feat(inbox-v4): S4-1 — Icon-only shell sidebar with tooltips`
- `feat(dashboard): S4-2 — Collapsed sidebar shows icons with tooltips`


### 2026-05-06 — جلسة S1 (Database fixes)
- ✅ قراءة PROJECT.md
- ✅ فحص Inbox v4 شامل (Backend + Frontend + Database)
- ✅ اكتشاف 4 مشاكل Database + 11 مشكلة UI
- ✅ إنشاء FIX_PLAN.md
- ✅ **S1-1:** Migration v47 — إضافة `wa_app_secret` column
- ✅ **S1-2:** Migration v48 — Sync WhatsApp API settings لـ `inbox_channel_settings_v4`
- ✅ **S1-3:** Fix `_getConv()` + `_getChannelConfig()` — تحويل لـ better-sqlite3 sync API
- ✅ **S1-3b:** Fix `_saveMessage()` — استخدام autoincrement بدل UUID
- ✅ **S1-3c:** Migration v49 — إضافة `agent_name` + `external_id` columns
- ✅ **S1-3d:** Fix `_touchConv()` — `last_message_text` + `last_message_dir`
- ✅ **S1-4:** Migrations applied successfully
- ✅ **S1-5:** Test: رسالة id=469 اتحفظت بنجاح!
- ⏳ **المهمة القادمة:** S1-6 (Commit + Push)

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
