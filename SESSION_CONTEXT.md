# 📌 SESSION_CONTEXT.md — مرجع تقني للجلسات القادمة

---

## 📋 بروتوكول بداية أي جلسة جديدة (الأمر الرسمي)

```
اقرأ فقط /home/areej/areej-pro/SESSION_CONTEXT.md
(إذا احتجت تفاصيل إضافية، اقرأ PROJECT.md لاحقاً)

قبل أي تنفيذ، أخبرني بجملة واحدة:
"المهمة القادمة هي [X] في الملف [Y]"
وانتظر موافقتي.

بعد الموافقة، نفّذ بهذا البروتوكول:
1. ملف واحد لكل مهمة — syntax check → commit → تحديث PROJECT.md
2. 10 ثوانٍ بين كل مهمة — توقف فوري عند أي ضغط على الموارد
3. حد أقصى 5 مهام تلقائية لكل جلسة
4. قبل الإغلاق، أضف في أعلى SESSION_CONTEXT.md (لا تمسح القديم) هذه الكتلة:
   ---
   ## جلسة [التاريخ والوقت UTC]
   ### وقفت عند:
   - الملف: [اسم الملف]
   - آخر تغيير: [وصف مختصر]
   ### قرارات تقنية:
   - [أي قرار أو تغيير في المنطق يجب تذكره]
   ### المهمة الأولى للجلسة القادمة:
   - [الملف + وصف المهمة بجملة واحدة]
   ---
5. أبلغني بانتهاء الجلسة وأنك جاهز لفتح جلسة جديدة
```

---

## سجل الجلسات (الأحدث في الأعلى)

---
## جلسة 2026-05-02 09:24 UTC

### وقفت عند:
- الملف: `public/dashboard/js/inbox.js`
- آخر تغيير: حذف `loadInbox()` القديم من سطر الـ inbox في `showPage` — كان يسبب polling مزدوج مع v3

### قرارات تقنية:
- `loadInbox()` (v2) كان يشتغل على `/api/system/inbox/...` + يشغّل `startInboxPolling()` القديم بالتوازي مع `iv3OnPageShow()` → تعارض مؤكد
- `iv3OnPageShow()` الآن هو المسؤول الوحيد عن init + polling عند فتح الـ inbox
- `stopInboxPolling()` (v2) و `iv3OnPageHide()` (v3) لا يتعارضان — كل واحد يوقف الـ timer الخاص بيه
- كل الـ backend endpoints موجودة وشغّالة (`/api/inbox/me`, `/api/inbox/agents`, `/api/inbox/conversations/:id/status`, إلخ)
- ترتيب الـ scripts في `index.html` صحيح (state → api → conv → chat → reply → context → init)

### المهمة الأولى للجلسة القادمة:
- اختبار حي من المتصفح على `pro-test.areejegypt.com` — فتح قسم الرسائل ومراقبة الـ console عن أي errors متبقية

---

---

## جلسة 2026-05-02 09:30 UTC

### وقفت عند:
- الملف: `public/dashboard/js/inbox.js` + `public/dashboard/inbox-v3/inbox-init.js`
- آخر تغيير: ربط `iv3OnPageShow/Hide` مع `showPage` + جعل `iv3OnPageShow` ذكياً (init مرة واحدة فقط)

### قرارات تقنية:
- `IV3._initialized` flag يمنع double init — لا تزيله
- `loadInbox()` القديم مازال يعمل بجانب `iv3OnPageShow()` — يحتمل تعارض، يجب مراجعته عند الاختبار
- الـ API endpoint المؤكد: `/api/inbox/conversations?page=1&limit=30` (ظهر في الـ logs فعلاً)
- `inbox-context.js` أُعيدت كتابته (v2) ليتوافق مع IDs الحقيقية في `inbox.html`

### المهمة الأولى للجلسة القادمة:
- **اختبار حي** — افتح `pro-test.areejegypt.com`، اذهب لقسم الرسائل، وافحص الـ browser console عن أي errors، ثم أصلح ما تجده في الملف المناسب

---

## 1️⃣ الموقف الحالي — آخر ما تم (2026-05-02)

### الملفات التي تأثرت:

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
| `public/dashboard/index.html` | ✅ معدّل — استبدال page-inbox v2 بـ v3 + scripts/CSS |
| `public/dashboard/js/inbox.js` | ✅ معدّل — إضافة `iv3OnPageShow/Hide` في `showPage` |

### آخر commits:
```
28667a1 — docs: إنشاء SESSION_CONTEXT.md
3984636 — docs: تحديث PROJECT.md
3ac06c6 — fix: iv3OnPageShow ذكي + ربط ResetContextPanel
f3544fb — fix: inbox-context.js متوافق مع IDs الحقيقية
f181a26 — feat: ربط iv3OnPageShow/Hide مع showPage
```

---

## 2️⃣ ملاحظات تقنية هامة

### هيكلية الكود:
- **الـ State المركزي** هو `IV3` (object عالمي في `inbox-state.js`) — كل الملفات تقرأ منه وتكتب فيه
- **الـ API** كلها في `IV3_API` (object في `inbox-api.js`) — لا تكتب fetch مباشرة في ملفات أخرى
- **الـ Toast** عبر `iv3Toast(message, type)` — type: success / error / info / warning
- **الـ Modal** عبر `iv3CloseModal(id)` — تضيف HTML للـ body وتحذفه بـ id

### IDs المهمة في inbox.html:
```
iv3-conv-list   ← قائمة المحادثات
iv3-msgs        ← منطقة الرسائل
iv3-textarea    ← textarea الرد
iv3-reply       ← box الرد (display:none في البداية)
iv3-chat-header ← header المحادثة
iv3-hdr-name    ← اسم المحادثة
iv3-hdr-avatar  ← avatar الـ header
iv3-status-sel  ← select تغيير الحالة
iv3-context     ← العمود الثالث (context panel)
iv3-ctx-empty   ← empty state
iv3-ctx-header  ← header العميل
iv3-ctx-avatar  ← avatar العميل
iv3-ctx-name    ← اسم العميل
iv3-ctx-phone   ← تليفون العميل
```

### مشاكل محتملة:
1. `loadInbox()` القديم + `iv3OnPageShow()` يعملان معاً — راجع التعارض عند الاختبار
2. `/api/customers/by-phone` — لو غير موجود، يظهر "لم يُربط بعميل" وده طبيعي
3. `IV3._initialized` — يمنع double init، لا تحذفه

---

## 3️⃣ حالة السيرفر

- ✅ لا ضغط — الأوامر استجابت فورياً
- ✅ pm2 `areej-pro` شغّال على port 3002 بدون errors
- ✅ الـ logs أظهرت `/api/inbox/conversations?page=1&limit=30` — v3 يعمل فعلاً
- ⚠️ AMD EPYC 4 cores / 15GB RAM — لا تشغّل builds ثقيلة وقت الذروة
