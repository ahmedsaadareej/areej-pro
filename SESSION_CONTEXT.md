# 📌 SESSION_CONTEXT.md — مرجع تقني للجلسات القادمة
> آخر تحديث: 2026-05-02 09:30 UTC
> يُقرأ هذا الملف **قبل** PROJECT.md في أي جلسة جديدة للحصول على السياق التقني المباشر.

---

## 1️⃣ الموقف الحالي — آخر ما تم

### الملفات التي تأثرت في آخر جلستين:

| الملف | التغيير |
|---|---|
| `public/dashboard/inbox-v3/inbox-state.js` | ✅ جديد — الـ State المركزي (IV3 object) |
| `public/dashboard/inbox-v3/inbox-api.js` | ✅ جديد — كل الـ API calls |
| `public/dashboard/inbox-v3/inbox-conv.js` | ✅ جديد — قائمة المحادثات + render + فلاتر |
| `public/dashboard/inbox-v3/inbox-chat.js` | ✅ جديد — Chat window + messages + actions |
| `public/dashboard/inbox-v3/inbox-reply.js` | ✅ جديد — Reply box + templates + AI + media |
| `public/dashboard/inbox-v3/inbox-context.js` | ✅ جديد (v2) — متوافق مع IDs الحقيقية في inbox.html |
| `public/dashboard/inbox-v3/inbox-init.js` | ✅ جديد — Init + Polling + Toast + Sound |
| `public/dashboard/inbox-v3/inbox.html` | ✅ جديد — Layout كامل (375 سطر) |
| `public/dashboard/inbox-v3/inbox.css` | ✅ جديد — CSS كامل (1238 سطر) |
| `public/dashboard/index.html` | ✅ معدّل — استبدال page-inbox v2 بـ v3 + إضافة scripts/CSS |
| `public/dashboard/js/inbox.js` | ✅ معدّل — إضافة `iv3OnPageShow/Hide` في `showPage` |

### آخر commits:
```
3984636 — docs: تحديث PROJECT.md
3ac06c6 — fix: iv3OnPageShow ذكي + ربط ResetContextPanel
f3544fb — fix: inbox-context.js متوافق مع IDs الحقيقية
f181a26 — feat: ربط iv3OnPageShow/Hide مع showPage
```

---

## 2️⃣ المرحلة التالية — ابدأ منها فوراً

### الهدف: **اختبار + إصلاح الـ Inbox v3 الحي**

**المهام بالترتيب (دفعة 5 مهام):**

| # | المهمة | الملف |
|---|---|---|
| 1 | فتح `pro-test.areejegypt.com` والتحقق من تحميل الـ page-inbox بدون console errors | browser / logs |
| 2 | إصلاح أي خطأ في `inbox-conv.js` — تأكد أن `iv3LoadConvs` تعمل وترسم المحادثات | `inbox-conv.js` |
| 3 | إصلاح أي خطأ في `inbox-chat.js` — تأكد أن فتح محادثة يشغّل `iv3LoadMessages` | `inbox-chat.js` |
| 4 | إصلاح أي خطأ في `inbox-reply.js` — تأكد أن إرسال رسالة يعمل | `inbox-reply.js` |
| 5 | تحديث `SESSION_CONTEXT.md` + `PROJECT.md` بنتائج الاختبار | — |

---

## 3️⃣ ملاحظات تقنية هامة

### هيكلية الكود:
- **الـ State المركزي** هو `IV3` (object عالمي في `inbox-state.js`) — كل الملفات تقرأ منه وتكتب فيه
- **الـ API** كلها في `IV3_API` (object في `inbox-api.js`) — استخدمه دايماً، لا تكتب fetch مباشرة في ملفات أخرى
- **الـ Toast** عبر `iv3Toast(message, type)` — type: success/error/info/warning
- **الـ Modal** عبر `iv3CloseModal(id)` — تضيف HTML للـ body وتمسحه بـ id

### IDs المهمة في inbox.html:
```
iv3-conv-list      ← قائمة المحادثات (scroll container)
iv3-msgs           ← منطقة الرسائل
iv3-textarea       ← textarea الرد
iv3-reply          ← كامل box الرد (display:none في البداية)
iv3-chat-header    ← header المحادثة
iv3-hdr-name       ← اسم المحادثة في الـ header
iv3-hdr-avatar     ← avatar في الـ header
iv3-status-sel     ← select تغيير الحالة
iv3-context        ← العمود الثالث (context panel)
iv3-ctx-empty      ← empty state للـ context
iv3-ctx-header     ← header العميل في الـ context
iv3-ctx-avatar     ← avatar العميل
iv3-ctx-name       ← اسم العميل
iv3-ctx-phone      ← تليفون العميل
```

### تغييرات في showPage (inbox.js سطر ~609):
```js
if (name === 'inbox') { loadInbox(); if (typeof iv3OnPageShow === 'function') iv3OnPageShow(); }
if (name !== 'inbox' && ...) { stopInboxPolling(); if (typeof iv3OnPageHide === 'function') iv3OnPageHide(); }
```

### مشاكل محتملة تحتاج انتباه:
1. **`loadInbox()` القديم** مازال بيشتغل مع `iv3OnPageShow()` — لو في تعارض بينهم يجب تعطيل `loadInbox()` لصالح v3
2. **`/api/inbox/conversations`** — الـ endpoint الحقيقي في الـ backend هو `/api/inbox/conversations` (تم التأكد من الـ logs)
3. **Context Panel** — يحتاج `/api/customers/by-phone?phone=...` — لو الـ endpoint مش موجود سيظهر "لم يُربط بعميل" وده طبيعي
4. **الـ CSS** — ملف `inbox-v3/inbox.css` محمّل لكن لو في class مفقود ابحث فيه أولاً
5. **iv3OnPageShow flag** — `IV3._initialized` يمنع init مزدوج

---

## 4️⃣ حالة السيرفر

- ✅ **لا ضغط** — الأوامر استجابت فورياً طوال الجلسة
- ✅ **pm2** — `areej-pro` يعمل على port 3002 بدون errors في الـ logs
- ✅ **اللوج الأخير** أظهر طلبات `/api/inbox/conversations?page=1&limit=30` — يعني الـ v3 بدأ يعمل فعلاً
- ⚠️ **ملاحظة:** السيرفر AMD EPYC 4 cores / 15GB RAM — لا تشغّل builds ثقيلة وقت الذروة

---

## 🔁 بروتوكول الدفعات المتفق عليه

- **الحد الأقصى:** 5 مهام ذرية لكل جلسة
- **بين كل مهمة:** 10 ثواني انتظار
- **بعد كل ملف:** syntax check + git commit
- **نهاية كل جلسة:** تحديث هذا الملف + PROJECT.md + توقف كامل
- **عند أي ضغط على الموارد:** توقف فوري

---

_هذا الملف يُحدَّث في نهاية كل جلسة قبل أي شيء آخر._
