## Session 2026-05-02 17:41 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - **fix**: إزالة `style="display:none"` من `page-payment-gateways` — commit 7388d2f
  - **fix**: cache-bust inbox.js — commit 4f04e8a
  - **feat**: إضافة Stripe + PayTabs + PayPal كـ gateway modules + SUPPORTED_GATEWAYS + test endpoints + description + requirements + رسالة بوابة أخرى — commit 4e118f2
  - **feat**: ربط Stripe + PayTabs + PayPal في دورة الدفع الكاملة + handlePaymentSuccess كاملة — commit 1203734
  - **fix**: logos رسمية لـ 6 بوابات + إصلاح setup_url لـ Paymob (accept.paymob.com) و InstaPay (www.instapay.eg) — commit b9cba21
  - الملفات: `server/routes/payment-gateways.js` + `server/routes/pay.js` + `server/lib/gateways/stripe.js` + `server/lib/gateways/paytabs.js` + `server/lib/gateways/paypal.js` + `public/dashboard/index.html`
- قرارات تقنية:
  - Stripe: Checkout Session → redirect → verify session_id → handlePaymentSuccess
  - PayTabs: Hosted Page → callback (server_url) + return redirect → handlePaymentSuccess
  - PayPal: Orders v2 → approve → areej_token في return_url → capture → handlePaymentSuccess
  - handlePaymentSuccess: 7 خطوات (payment_links + invoices + receivable_wallet + خزنة صافي + عمولة مصروف + CRM + inbox)
  - logos: favicon.ico لكل بوابة — fallback للـ emoji لو فشل تحميل الصورة
  - Paymob setup_url الصح: accept.paymob.com/portal2/en/login
  - InstaPay setup_url الصح: www.instapay.eg (تطبيق موبايل، مش dashboard)
- آخر Commit: `b9cba21` — fix: logos رسمية + إصلاح setup_url
- نقطة البداية القادمة: Customer Lifetime Value Badge في `inbox-context.js` — عدد الفواتير + إجمالي المدفوع يظهر تلقائياً في Context Panel

---

# 📌 SESSION_CONTEXT.md — مرجع تقني للجلسات القادمة

---

## Session 2026-05-02 17:13 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - **ACU-4**: زر "رابط دفع" في Context Panel — `inbox-context.js` + `inbox-api.js` + `index.html`
  - **ACU-5**: زر "إرسال رابط دفع" من صفحة الفواتير (جدول + detail panel) — `invoices.js`
  - **ACU-A**: ربط بوابات الدفع بالخزنة والعمولة — `payment-gateways.js` + `index.html`
    - lazy migration: wallet_id + commission_pct + commission_fixed في payment_gateways
    - modal إعدادات البوابة: dropdown الخزنة + حقلا العمولة + preview تلقائي
    - `getGatewayConfig()` helper جديد يرجع creds + wallet + commission معاً
  - **ACU-B**: `handlePaymentSuccess()` في `pay.js` — معالجة متكاملة بعد نجاح الدفع:
    - payment_links → paid + sys_invoices → paid
    - خصم receivable_wallet لو كانت الفاتورة آجلاً
    - IN صافي (مبلغ - عمولة) في خزنة البوابة
    - OUT عمولة البوابة كمصروف منفصل (category: مصروفات بوابات الدفع)
    - crm_contacts: balance -= المبلغ الكامل، total_paid += المبلغ الكامل
    - inbox: رسالة تأكيد للعميل + note داخلي للموظفين
  - **ACU-C**: conversation_id في payment_links — `inbox.js` + `inbox-context.js` + `inbox-api.js`
- قرارات تقنية:
  - العمولة = (amount × pct%) + fixed — تُسجَّل كـ OUT منفصل من خزنة البوابة
  - رصيد العميل يُخصم بالمبلغ الكامل (العمولة تتحمّلها الشركة)
  - رسالة التأكيد تُرسل فقط لو link.conversation_id موجود
  - الخطأ القديم في logs "payment-gateways GET error" كان قبل الجلسة وليس من كودنا
- آخر Commit: `e6d7c1d` — feat: ربط payment_links بـ conversation_id (ACU-C)
- نقطة البداية القادمة: Customer Lifetime Value Badge في `inbox-context.js` — "12 فاتورة / 4,500 ج.م" يظهر تلقائياً في Context Panel

---

## Session 2026-05-02 16:27 UTC
- الحالة: جارٍ التنفيذ — ACU-1
- ما تم إنجازه: تحديث PROJECT.md + SESSION_CONTEXT.md بالقرارات المعمارية الجديدة لمنظومة الدفع
- قرارات تقنية:
  - areej-payment لا يُلمس أبداً — منطق الدفع يُعاد كتابته داخل areej-pro (Xيار B)
  - كل Tenant عنده credentials خاصة في جدول `payment_gateways` في tenant DB
  - صفحة الدفع White-Label على `{slug}.areejegypt.com/pay/{token}`
  - `tenant_profile` موجود فعلاً (company_name, logo_url, brand_color) ✅
  - `payment_links` جدول موجود فعلاً في tenant DB ✅ — سيُستخدم مباشرة
  - نوعان: رابط حر (invoice_id=NULL) + رابط فاتورة (invoice_id=X)
  - البوابات: Fawaterk + Paymob + InstaPay + قابل للتوسع
- آخر Commit: 5c18915 (آخر commit قبل هذه الجلسة)
- نقطة البداية القادمة: `server/routes/payment-gateways.js` — ACU-1: جدول payment_gateways + CRUD endpoints

---

## Session 2026-05-02 16:00 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `inbox-context.js`: `iv3ConvertToOrder()` modal كامل (name/phone/type/total/notes) + `iv3SubmitOrder()` ترسل لـ `POST /api/system/orders` + تعبيئ textarea برسالة تأكيد للعميل بعد الإنشاء + `iv3CtxNewOrder()` تستدعيها
  - `inbox.css`: CSS للـ order form (input/textarea/label)
- قرارات تقنية:
  - لا تعديل في الـ backend (ـ `POST /api/system/orders` جاهز ويقبل كل الحقول)
  - المعلومات تُملأ تلقائياً من `IV3.activeConv` (name, phone, lead_id)
  - بعد الإنشاء يُعبّأ الـ textarea برسالة تأكيد جاهزة للعميل (يمكن تعديلها قبل الإرسال)
- آخر Commit: `5c18915` — feat: تحويل لأوردر
- نقطة البداية القادمة: `inbox-context.js` + `inbox-reply.js` — Payment Link (زر في Context Panel ينشئ رابط دفع ويرسله للعميل)

---

## Session 2026-05-02 15:56 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `server/routes/inbox.js`: `POST /typing-state` (lazy migrate عمودي `typing_conv_id` + `typing_at` + تحديث) + `GET /conversations/:id/typing-agents` (يرجع الموظفين في خلال 10 ثواني)
  - `inbox-api.js`: `setTypingState()` (fire-and-forget) + `getTypingAgents()`
  - `inbox-reply.js`: `iv3SendTypingBeacon()` + `iv3ClearTypingBeacon()` — بيكون كل 3ث + تصفير عند الإرسال + `onblur`
  - `inbox-chat.js`: تصفير beacon عند تغيير المحادثة
  - `inbox-init.js`: في polling كل 8ث — `iv3CheckTypingAgents()` + `iv3UpdateTypingBanner()`
  - `inbox.css`: تصميم `.iv3-typing-banner` (خلفية صفراء تحذيرية)
  - `index.html`: `#iv3-typing-banner` + `onblur` على textarea
- قرارات تقنية:
  - Beacon timeout = 10 ثواني (صلاحية) بينما البيكون يُرسل كل 3ث — هامش أمان كافي
  - `setTypingState` يستخدم `fetch` مباشرة (fire-and-forget, لا يعطّل await)
  - الموظّف لا يرى نفسه في البانر (user_id != myId)
- آخر Commit: `17c91cb` — feat: Collision Detection
- نقطة البداية القادمة: `inbox-context.js` + ربط بـ orders module — زر "تحويل لأوردر" من المحادثة

---

## Session 2026-05-02 15:53 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `inbox-init.js`: keyboard handler (`iv3BindKeyboard`) مربوط بدورة حياة الصفحة + `iv3NavigateConv()` + `iv3ShowShortcutsHelp()` مع modal كامل
  - `inbox.css`: تصميم `<kbd>` للمساعدة
  - `index.html`: زر ؟ في header الـ inbox
- قرارات تقنية:
  - الـ listener مربوط بـ `page-inbox.classList.contains('active')` — لا يتدخل مع صفحات أخرى
  - تجاهل الضغط لو المستخدم يكتب في input/textarea/select (إلا Escape)
  - `?` يفتح modal بكل الاختصارات
- آخر Commit: `7b4fec8` — feat: Keyboard Shortcuts
- نقطة البداية القادمة: `inbox-init.js` + `inbox-chat.js` + `server/routes/inbox.js` — Collision Detection ("أحمد يرد الآن")

---

## Session 2026-05-02 15:49 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `server/routes/inbox.js`: endpoint `POST /conversations/bulk-action` (close/open/waiting/assign/label)
  - `inbox-state.js`: إضافة `IV3.bulkMode` + `IV3.selectedIds`
  - `inbox-api.js`: إضافة `bulkAction()`
  - `inbox-conv.js`: checkbox في كل item + `iv3ConvItemClick` + `iv3ToggleBulkMode` + `iv3ToggleSelect` + `iv3SelectAll` + دوال التنفيذ (BulkClose/Open/Assign)
  - `index.html`: زر تحديد جماعي في sidebar + شريط `#iv3-bulk-bar` مع أزرار الإجراء
  - `inbox.css`: CSS لـ bulk bar + checkbox + selected state
- قرارات تقنية:
  - `IV3.selectedIds` هو `Set` للحصول على تحقق O(1) لدوال التحقق والحذف
  - الخروج من bulk mode يتم تلقائياً بعد تنفيذ أي إجراء
  - `bulk-action` endpoint يستخدم `logTimeline` لتسجيل كل حدث
- آخر Commit: `d4b9d94` — feat: Bulk Actions
- نقطة البداية القادمة: `inbox-init.js` + `inbox-chat.js` — Collision Detection ("أحمد يرد الآن") أو Keyboard Shortcuts

---

## Session 2026-05-02 15:44 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `server/routes/inbox.js`: `logTimeline()` helper + `GET /conversations/:id/timeline` endpoint + تسجيل تلقائي في `/status` + `/assign` + `/snooze`
  - `inbox-state.js`: إضافة `IV3.timeline[]`
  - `inbox-api.js`: إضافة `getTimeline()`
  - `inbox-chat.js`: `iv3LoadMessages()` يحمّل الرسائل + التاريخ بالتوازي + `iv3RenderMessages()` يدمجهما زمنياً + `iv3BuildTimelineEvent()` لـ render كل حدث
  - `inbox.css`: تصميم كبسول الحدث `.iv3-timeline-event`
- قرارات تقنية:
  - جدول `inbox_timeline` يُنشأ بـ lazy migration عند أول `logTimeline()` call
  - الأحداث تُعرض مدمجة بين الرسائل بترتيب زمني دقيق (sort by timestamp)
  - `logTimeline` لا تكسر الـ request لو فشلت (try/catch صامت)
  - `req.user?.name` هو مصدر اسم الفاعل
- آخر Commit: `f3579d2` — feat: Conversation Timeline
- نقطة البداية القادمة: مهام من قائمة الأولوية العالية (Bulk Actions / Collision Detection / Keyboard Shortcuts)

---

## Session 2026-05-02 15:33 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  - `server/routes/inbox.js`: إضافة `POST /snooze` (migrate column + snooze/unsnooze) + `GET /snooze-wakeup` (polling يعيد الحالة لـ open تلقائياً)
  - `inbox-api.js`: إضافة `snoozeConv()` + `checkSnoozeWakeup()`
  - `inbox-chat.js`: إضافة `iv3SnoozeConv()` + `iv3ConfirmSnooze()` + `iv3FormatSnoozeTime()`
  - `inbox-init.js`: polling يتحقق من snoozed wakeup كل 8 ثواني
  - `inbox.css`: CSS لـ snooze modal + حالة snoozed
  - `index.html`: زر تأجيل في header المحادثة
- قرارات تقنية:
  - column `snoozed_until` يُضاف بـ lazy migration عند أول snooze request
  - status `snoozed` مضاف كقيمة جديدة في inbox_conversations.status
  - الإيقاظ يحدث تلقائياً في polling كل 8 ثواني عبر `snooze-wakeup` endpoint
  - unsnooze: minutes=0 يعيد الحالة لـ open ويحذف snoozed_until
- آخر Commit: `6920703` — feat: Snooze المحادثة
- نقطة البداية القادمة: `inbox-chat.js` + `server/routes/inbox.js` — Conversation Timeline (سجل أحداث: تعيين / تغيير حالة / إغلاق)

---

## Session 2026-05-02 15:29 UTC
- الحالة: تم الإكمال
- ما تم إنجازه: ميزة Quote/Reply كاملة
  - `inbox-state.js`: إضافة `quotedMsg` للـ IV3 state
  - `inbox-chat.js`: دالة `iv3QuoteMsg()` + `iv3ShowQuotePreview()` + `iv3ClearQuote()` + hover action button على كل bubble + عرض quote block داخل الـ bubble لو كانت الرسالة مقتبسة
  - `inbox-reply.js`: ربط الاقتباس بالإرسال في `iv3Send()` + تصفير الاقتباس بعد الإرسال
  - `inbox-api.js`: تحديث `sendMessage()` ليقبل `quoted` payload (quoted_msg_id + quoted_content + quoted_sender)
  - `inbox.css`: CSS لـ quote preview في reply box + quote block داخل الـ bubble + hover actions
  - `index.html`: إضافة `#iv3-quote-preview` داخل reply box
- قرارات تقنية:
  - الاقتباس يُخزّن في `IV3.quotedMsg` (client-side state) ويُرسل في `quoted_msg_id + quoted_content + quoted_sender` للـ backend
  - الـ backend لم يتغيّر (send endpoint يستقبل الحقول الإضافية بدون كسر) — لو أحمد أراد حفظ الاقتباس في الـ DB يحتاج migrate لـ `inbox_messages`
  - الـ notes مستثناة من الاقتباس (لا تُقتبس)
- آخر Commit: `bbe54f7` — feat: Quote/Reply على رسالة محددة
- نقطة البداية القادمة: `inbox-chat.js` + `server/routes/inbox.js` — Snooze المحادثة (زر Snooze + وقت + رجوع تلقائي)

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
## Session 2026-05-02 14:11 UTC
- الحالة: تم الإكمال
- ما تم إنجازه:
  1. `saveAutoMessages()` — إضافة inline status feedback في `is-automsg-status` + try/catch (`inbox.js`)
  2. `loadAdvancedAnalyticsIS()` — دالة جديدة في `inbox-settings.js` تجلب بيانات التحليلات الحقيقية وتعرض cards + platform breakdown
  3. اختبار حي: `page-inbox-settings` يفتح صح، modal القديم مخفي، IDs موجودة، analytics تحمّل ✅
- قرارات تقنية:
  - `loadAdvancedAnalytics()` في `ui.js` تكتب في IDs مختلفة — الحل: alias منفصل `loadAdvancedAnalyticsIS()` يكتب في `adv-analytics-container-is`
  - `saveAutoMessages()` تعمل على IDs بدون prefix — وده الكانوني الآن بعد توحيد جلسة 14:04
- آخر Commit: 77353f1
- نقطة البداية القادمة: `inbox-settings.js` + `index.html` — استكمال sections الفارغة (integrations-ai، chatbot) أو ربط WhatsApp QR

---

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

---

## Session 2026-05-02 16:40 UTC
- الحالة: تم الإكمال — ACU-1 + ACU-2 + ACU-3
- ما تم إنجازه:
  - `server/routes/payment-gateways.js`: CRUD كامل + AES-256-GCM encryption + test endpoint
  - `server/routes-system.js`: تسجيل payment-gateways route
  - `public/dashboard/index.html`: صفحة `page-payment-gateways` كاملة (sidebar + HTML + JS)
  - `public/dashboard/js/core.js`: إضافة 'payment-gateways' في NAV_PERM_MAP
  - `public/dashboard/js/inbox.js`: ربط pgwLoad() بـ sbShowPage
  - `server/lib/gateways/fawaterk.js`: Fawaterk module بـ dynamic credentials
  - `server/lib/gateways/paymob.js`: Paymob module بـ dynamic credentials
  - `server/lib/gateways/instapay.js`: InstaPay module
  - `server/routes/pay.js`: /api/pay/* (link + initiate + status + webhooks)
  - `server/app.js`: تسجيل /api/pay route
  - `public/pay/index.html`: صفحة دفع White-Label كاملة
- قرارات تقنية:
  - Token format: `{slug}.{linkToken}` (الـ slug يُستخرج من أول نقطة)
  - Credentials مشفّرة بـ AES-256-GCM في payment_gateways table
  - lazy migration لأعمدة payment_links (invoice_ref, gateway, gateway_method, updated_at)
  - areej-payment لم يُلمس — الكود مُعاد كتابته داخل areej-pro
  - الصفحة تأخذ brand_color + logo_url + company_name من tenant_profile
- آخر Commit: 74e6b06 — fix sidebar (بوابات الدفع في الإعدادات العامة)
- نقطة البداية القادمة: `inbox-context.js` — ACU-4: زر "رابط دفع" في Inbox (حر أو بمبلغ) يُنشئ token ويرسله للعميل في المحادثة
