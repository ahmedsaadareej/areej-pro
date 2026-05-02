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
## Session 2026-05-02 14:04 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  1. إزالة `showInboxSettings()` من `inbox-init.js` — كانت تطغى على الدالة الشغالة في `inbox.js`
  2. إخفاء `inboxSettingsModal` القديم بـ `display:none!important` — كان يظهر فوق الـ inbox
  3. توحيد IDs في صفحة إعدادات الرسائل — `is-auto-welcome-*` أصبحت `auto-welcome-*`، الـ legacy IDs أُضيف لها prefix `_lgcy_`، وربط `loadAutoMessages()` بفتح الـ section
- قرارات تقنية:
  - الـ modal القديم (`inboxSettingsModal`) يُبقى في الـ DOM مخفياً (لا يُحذف) لأن `_legacyShowInboxSettings` و `showSettingsTab` لا يزالان يرجعان إليه
  - المرجع الوحيد للإعدادات هو `page-inbox-settings` عبر `sbShowPage('inbox-settings',...)`
  - IDs الـ auto-messages الكانونية: `auto-welcome-active`, `auto-welcome-msg`, `auto-away-active`, `auto-away-start`, `auto-away-end`, `auto-away-msg`
- آخر Commit: 6b2adb4 — fix: unify auto-messages IDs
- نقطة البداية القادمة: `index.html` + `inbox-settings.js` — إضافة away message fields للـ section (start/end time + status feedback) أو الانتقال لإصلاح section التحليلات

---

---
## جلسة 2026-05-02 11:43 UTC — bug fixes بعد التقييم

### وقفت عند:
- الملف: تم إصلاح 4 bugs في `inbox-api.js`, `inbox-chat.js`, `inbox-reply.js`, `inbox.html`

### Bug Fixes منجزة:
1. **`addNote` كانت ترسل `{note}` والـ API يتوقع `{content}`** → إصلاح في inbox-api.js
2. **`media_type` أولوية غلط** → `msg.media_type || msg.mime_type` (كان معكوس)
3. **Voice Recording stream leak** → حفظ stream reference + cleanup قبل أي تسجيل جديد
4. **`inbox.html` منفصل عن `index.html`** → inbox.html الآن يُحدَّث تلقائياً من index.html

### ملاحظات تقنية:
- `getMessages` يعمل mark-as-read تلقائياً في الـ server → `iv3ClearUnread` محلي (optimistic) صح
- Polling 8 ثواني مقبول مع 2 مستخدمين حاليًا — يُراجع عند توسع Tenant
- المرجع دائماً: `index.html` للـ HTML، وملفات `inbox-v3/` للـ JS/CSS

### الخطوة التالية:
- ربط WhatsApp QR (يحتاج أحمد) أو بدء مرحلة جديدة حسب الأولوية

---

---
## جلسة 2026-05-02 11:33 UTC

### وقفت عند:
- الملف: `public/dashboard/inbox-v3/inbox-reply.js` (Voice Recording) + `index.html` (Notes section)
- آخر تغيير: Notes Panel كامل + Voice Recording كامل + اختبار حي ناجح

### قرارات تقنية:
- `inbox.html` و `index.html` ملفان منفصلان — أي تعديل على `inbox.html` لازم ينعكس يدوياً على `index.html` (الـ page-inbox الحقيقي)
- Voice Recording يستخدم `MediaRecorder` API مباشرة في المتصفح — codec يُختار تلقائياً (webm/ogg)
- الحد الأقصى للتسجيل: 60 ثانية — بعدها يوقف تلقائياً
- Voice upload عبر `POST /api/system/inbox/upload-voice` (multer) ثم `sendMedia`
- Notes: GET/POST/DELETE على `/api/system/inbox/conversations/:id/notes` — كلها موجودة
- Notes section أُضيف في `index.html` لأنه الملف الفعلي (مش inbox.html)
- `iv3LoadNotes` تُستدعى تلقائياً من `iv3UpdateContextPanel` لما تتفتح محادثة
- CSS للـ Notes و Voice recording في `inbox.css`

### المهمة الأولى للجلسة القادمة:
- ربط WhatsApp QR بـ pro-test (يحتاج أحمد يمسح الـ QR) — أو الانتقال لتطوير مرحلة جديدة في المشروع (CRM / Orders / إلخ)

---

---
## جلسة 2026-05-02 11:21 UTC

### وقفت عند:
- الملف: `public/dashboard/inbox-v3/inbox-reply.js` + `inbox-v3/inbox.html`
- آخر تغيير: إضافة `iv3ToggleVoice` stub + `iv3UpdateCharCount` + ربط char count بالـ textarea

### قرارات تقنية:
- كل IDs في `inbox.html` متطابقة مع ما تستخدمه ملفات JS — لا يوجد تعارض
- `iv3ToggleVoice` كانت مستدعاة في HTML لكن غير معرّفة — تم إضافة stub (voice recording قيد التطوير)
- `iv3UpdateCharCount` أُضيفت وربطت بـ oninput في textarea
- الاختبار الحي (Chromium headless): UI يظهر صح، 3 panels، لا errors جديدة في الـ console
- Functions المفقودة الوحيدة كانت `iv3ToggleVoice` — باقي الـ 19 function كلها موجودة

### المهمة الأولى للجلسة القادمة:
- تحسين UI الـ inbox (spacing + empty state alignment) أو ربط WhatsApp QR (يحتاج أحمد) أو الانتقال لمرحلة تانية في المشروع

---

---
## جلسة 2026-05-02 10:07 UTC

### وقفت عند:
- الملف: `public/dashboard/inbox-v3/inbox-reply.js` (آخر ملف في الجلسة)
- آخر تغيير: إصلاح 3 ملفات v3 (context + chat + reply) + cache-busting

### قرارات تقنية:
- `/api/customers/by-phone` غير موجود — الصح هو `/api/crm/contacts/by-phone` (بيرجع `{ok, contact}`)
- `/api/invoices` غير موجود في route عام — الصح `/api/system/invoices` (عبر routes-system)
- `inbox_messages` حقوله: `content` (مش `message`)، `sent_at` (مش `created_at`)، `media_type` (مش `mime_type`)
- `inbox_templates` حقوله: `name` (مش `title`)، `content`
- `DELETE /api/system/inbox/conversations/:id` غير موجود — تم تحويل زر الحذف ليعمل `status=closed` بدلاً
- الـ optimistic message في inbox-reply.js يجب أن يستخدم `content` و`sent_at` ليتوافق مع `iv3BuildMsgBubble`
- Chromium headless مثبّت على السيرفر وشغّال، يُشغَّل يدوياً بـ: `/usr/bin/chromium-browser --headless=new --no-sandbox --disable-gpu --remote-debugging-port=18800 --remote-debugging-address=127.0.0.1 --disable-dev-shm-usage &`

### المهمة الأولى للجلسة القادمة:
- ربط WhatsApp QR بـ pro-test (يحتاج أحمد يمسح الـ QR) — ثم اختبار إرسال/استقبال رسالة حقيقية في inbox v3

---

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
