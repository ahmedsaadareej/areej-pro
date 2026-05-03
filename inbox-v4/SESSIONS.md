## جلسة 2026-05-03 22:52 UTC
- الحالة: مكتملة
- ما تم:
  - P7-4: `server/routes/inbox/analytics.js` — endpoint جديد
    - `GET /analytics/sentiment` — تحليل مشاعر رسائل العملاء الواردة
    - Batch processing: 30 رسالة/استدعاء → يوفر tokens
    - Cache ذكي: يحفظ النتيجة في `metadata` الرسالة لتجنب إعادة الحساب
    - يُعيد: summary (positive/neutral/negative + نسب) + daily trend + top 5 محادثات سلبية
  - P7-4: `public/dashboard/inbox-v4/api.js` — `InboxAPI.analytics.sentiment()`
  - P7-4: `public/dashboard/inbox-v4/analytics.js`
    - Section "🧠 تحليل المشاعر" جديد في الـ Dashboard
    - `_renderSentiment()` — KPI pills ثلاثية + شريط توزيع + SVG chart يومي مكدس + top negative list
    - `_renderSentimentChart()` — Stacked Bar SVG (🟢 إيجابي / 🟡 محايد / 🔴 سلبي)
    - النقر على محادثة سلبية يفتحها في الـ inbox مباشرة
    - `_esc()` helper مضاف للـ analytics.js
    - `sentimentRes` مضاف لـ `_loadAll()` parallel fetch
  - `inbox.css`: ~120 سطر CSS (pills + stacked bar + chart + neg list + dark mode)
- قرارات: لا جديد
- آخر commit: 2bfc107
- المهمة القادمة: **P7-5 Voice Note Transcript (Whisper)** أو **P8-2 WA Interactive Messages**

---

## جلسة 2026-05-03 22:46 UTC
- الحالة: مكتملة
- ما تم:
  - P7-3: `server/routes/inbox/ai.js` — endpoint جديد
    - `POST /conversations/:id/ai/labels` — يجلب الرسائل + labels المتاحة، يسأل AI، يُعيد مصفوفة `{ id, name, reason }`
    - فلترة آمنة: يتحقق أن كل label مقترح موجود فعلاً في قاعدة البيانات قبل الإعادة
  - P7-3: `public/dashboard/inbox-v4/api.js` — `InboxAPI.ai.suggestLabels(convId)`
  - P7-3: `public/dashboard/inbox-v4/labels.js`
    - زر "✨ اقتراح تلقائي" في footer الـ label dropdown
    - `_aiSuggestLabels()` — يطلب من API ويعرض loading state على الزر
    - `_renderAISuggestions()` — section منفصل داخل الـ dropdown يعرض الاقتراحات مع السبب + badge "AI"
    - "إضافة الكل" — يضيف labels المقترحة دفعة واحدة
    - `_showAISuggestError()` — رسالة خطأ مؤقتة تختفي تلقائياً بعد 4 ثوانٍ
  - `inbox.css`: ~90 سطر CSS (AI btn gradient + suggestions section + reason text + badge + dark mode)
- قرارات: لا جديد
- آخر commit: 21aad28
- المهمة القادمة: **P7-4 Sentiment Analysis** أو **P8-2 WA Interactive Messages (Buttons/Lists)**

---

# SESSIONS.md — يوميات جلسات Inbox v4
> أضف كل جلسة في الأعلى (الأحدث أولاً)

---

## جلسة 2026-05-03 22:40 UTC
- الحالة: مكتملة
- ما تم:
  - P7-1: `server/routes/inbox/ai.js` — backend جديد بالكامل
    - `POST /conversations/:id/ai/suggest` — اقتراح رد ذكي (tone: formal/friendly/brief)
    - `POST /conversations/:id/ai/summary` — ملخص المحادثة
    - `POST /conversations/:id/ai/translate` — ترجمة عربي/إنجليزي
    - `POST /conversations/:id/ai/improve` — تحسين النص (formal/shorter/friendlier/fix)
    - `_callAI()` — محرك OpenAI-compatible (Genspark proxy) مع timeout 30s
  - P7-1: `public/dashboard/inbox-v4/ai.js` — frontend جديد
    - زر "✨ AI" dropdown في reply toolbar — كل الأدوات في menu واحد
    - Tone Panel (ودي/رسمي/مختصر) يظهر بعد الاقتراح لإعادة التوليد
    - Summary Overlay مع نسخ النص
    - تحسين + ترجمة يكتبان في الـ textarea مباشرة
  - `api.js`: إضافة `InboxAPI.ai.*` (suggest/summary/translate/improve)
  - `index.html`: زر AI toolbar + زر "📋 ملخص" في chat header + ai.js script
  - `app.js`: `InboxAI.init()`
  - `inbox.css`: ~130 سطر CSS (كل مكونات AI + dark mode)
- قرارات: لا جديد
- آخر commit: 73a2f2f
- المهمة القادمة: **P7-2 Conversation Summary** مكتمل ضمن P7-1 — التالي: **P7-3 Auto-Label Suggestion** أو **P8-2 WA Interactive Messages**

---

## جلسة 2026-05-03 22:24 UTC
- الحالة: مكتملة
- ما تم:
  - P4-5: **migration v29** — جدول `inbox_scheduled_messages_v4`
  - P4-5: `automation.js` backend:
    - `GET /api/inbox/scheduled` — كل الرسائل بحسب الحالة
    - `GET /api/inbox/conversations/:id/scheduled` — رسائل محادثة
    - `POST /api/inbox/conversations/:id/scheduled` — إنشاء
    - `PUT /api/inbox/scheduled/:id` — تعديل
    - `DELETE /api/inbox/scheduled/:id` — حذف
    - `POST /api/inbox/automation/scheduled/run` — تشغيل يدوي
    - `runScheduledMessages(db, tenantId)` — محرك الإرسال (sent/failed tracking)
  - P4-5: `scheduled.js` frontend:
    - Dashboard عام (Pending/Sent/Failed tabs)
    - Form Modal (إضافة/تعديل مع datetime-local picker)
    - زر "▶ تشغيل الآن" مع عرض sent/failed
    - Mini panel في المحادثة لعرض الرسائل المجدولة
  - `api.js`: `InboxAPI.scheduled.*` (6 methods)
  - `app.js`: `InboxScheduled.init()`
  - `index.html`: زر 📅 مجدولة في الـ sidebar
  - `inbox.css`: ~160 سطر CSS + dark mode
- قرارات: لا جديد
- آخر commit: 6ef4429
- المهمة القادمة: **Phase 4 ✅ مكتملة** — التالي: **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 22:17 UTC
- الحالة: مكتملة
- ما تم:
  - P4-4: **migration v28** — جدول `inbox_auto_close_v4`
  - P4-4: `automation.js` backend:
    - `GET/PUT /api/inbox/automation/auto-close`
    - `POST /api/inbox/automation/auto-close/run` — تشغيل يدوي
    - `runAutoClose(db, tenantId)` — محرك كامل: تحذير + إغلاق
      - overnight idle detection
      - تحتفظ بعدم تكرار التحذير بفحص آخر رسالة Bot
  - P4-4: `automation.js` frontend:
    - قسم جديد داخل نفس overlay الـ Welcome/Away
    - idle_minutes + live hint بالدقائق/ساعات/أيام
    - فلتر حالة المحادثة (open/waiting)
    - رسالة إغلاق اختيارية + تحذير قبل الإغلاق
    - زر "▶ تشغيل الآن" مع عرض النتيجة
  - `api.js`: `InboxAPI.autoClose.get/update/run`
  - `inbox.css`: ~55 سطر CSS جديد
- قرارات: لا جديد
- آخر commit: 851dc52
- المهمة القادمة: **P4-5 Scheduled Messages** — backend `automation.js` + frontend أو **P7-1 AI Suggestions**

---

## جلسة 2026-05-03 22:10 UTC
- الحالة: مكتملة
- ما تم:
  - P4-3: **migration v27** — جدول `inbox_welcome_away_v4`
  - P4-3: `automation.js` backend — `GET/PUT /api/inbox/automation/welcome-away`
    - `processWelcomeAway(db, conv, isNew, tenantId)` — محرك الترحيب/الغياب
    - `_isAwayNow(cfg)` — حساب دقيق بالـ timezone + أيام العمل + overnight support
  - P4-3: `public/dashboard/inbox-v4/automation.js` — frontend كامل
    - Toggle تفعيل/تعطيل لكل رسالة
    - اختيار أيام العمل (0–6)
    - جدول الغياب (away_start → away_end) + overnight
    - Timezone selector (8 مناطق)
    - Away Mode: schedule / always
    - معاينة حية للوضع الحالي (عمل/غياب)
  - `api.js`: `InboxAPI.welcomeAway.get/update`
  - `app.js`: `InboxAutomation.init()`
  - `index.html`: زر 🌙 ترحيب/غياب في الـ sidebar
  - `inbox.css`: ~160 سطر CSS + dark mode
  - `routes-inbox-webhook.js`: ربط WA webhook بمحرك Welcome/Away
- قرارات: لا جديد
- آخر commit: 715105d
- المهمة القادمة: **P4-4 Auto-Close** — backend `automation.js` + مهمة Cron أو **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 22:00 UTC
- الحالة: مكتملة
- ما تم:
  - P4-2: **migration v26** — 3 جداول جديدة:
    - `inbox_chatbot_flows_v4` (الـ flows)
    - `inbox_chatbot_steps_v4` (خطوات الـ flow)
    - `inbox_chatbot_sessions_v4` (جلسات المحادثات النشطة)
  - P4-2: `server/routes/inbox/chatbot.js` — backend كامل
    - CRUD flows (GET/POST/PUT/DELETE/toggle)
    - Bulk replace steps (`PUT /flows/:id/steps`)
    - Test endpoint (`POST /flows/:id/test`) — simulate
    - **محرك** `processChatbot()` للـ webhook
    - دعم step types: message / question / input / condition / action / delay
    - دعم triggers: keyword / always
  - P4-2: `public/dashboard/inbox-v4/chatbot.js` — frontend Visual Builder
    - قائمة flows مع toggle تفعيل/تعطيل
    - Flow Editor: شجرة steps بصرية (إضافة/تعديل/حذف/child steps)
    - Step Modal بحقول ديناميكية حسب النوع
    - زر اختبار (simulate) قبل الحفظ
  - `api.js`: إضافة `InboxAPI.chatbot.*` (8 methods)
  - `app.js`: تفعيل `InboxChatbot.init()`
  - `index.html`: زر 🤖 Chatbot في الـ sidebar
  - `inbox.css`: ~200 سطر CSS (كل مكونات الـ builder + dark mode)
  - `routes-inbox-webhook.js`: ربط خفيف بمحرك chatbot عند WA webhook
- قرارات: لا جديد
- آخر commit: 560ba36
- المهمة القادمة: **P4-3 Welcome + Away Messages** — backend `automation.js` أو **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 21:56 UTC
- الحالة: مكتملة
- ما تم:
  - P6-4: `server/routes/inbox/analytics.js` — `GET /analytics/csat`
    - ملخص + distribution نجوم + daily trend + by_agent
  - P6-4: `analytics.js` — section CSAT كامل (KPI + star bars + daily + agent table)
  - P6-6: `_exportFullExcel()` — CSV بـ BOM (Excel-friendly)
    - زر "📅 Excel كامل" يصدّر الموظفين + CSAT + توزيع النجوم
  - `api.js`: analytics.csat()
  - `inbox.css`: star bars + export-group + export-btn--primary
- قرارات: لا جديد
- آخر commit: 14ae51e
- المهمة القادمة: **Phase 6 ✅ مكتملة** — التالي: **P4-2 Chatbot Flows** أو **P7-1 AI Suggestions**

---

## جلسة 2026-05-03 21:52 UTC
- الحالة: مكتملة
- ما تم:
  - P6-3: `server/routes/inbox/analytics.js` — `GET /analytics/platforms/:platform`
    - ملخص + تطور يومي + توزيع أولوية + أداء موظفين على المنصة
  - P6-3: `analytics.js` — `_openPlatformDetail()` modal مع drill-down
  - P6-5: `server/routes/inbox/analytics.js` — `GET /analytics/sla/detail`
    - التزام يومي + SLA بالمنصة + أسوأ 10 محادثات
  - P6-5: `analytics.js` — `_openSLADetail()` modal + زر "🔍 تفصيل" داخل section SLA
  - `api.js`: analytics.platformDetail() + analytics.slaDetail()
  - `inbox.css`: hover + detail hint
- قرارات: لا جديد
- آخر commit: c16cc9f
- المهمة القادمة: **P6-4 CSAT Analytics** أو **P6-6 Export PDF/Excel** أو **P4-2 Chatbot Flows**

---

## جلسة 2026-05-03 21:48 UTC
- الحالة: مكتملة
- ما تم:
  - P6-2: `server/routes/inbox/analytics.js` — endpoint جديد
    - `GET /analytics/agents/:id`: تفاصيل موظف واحد (تطور + منصات + أولوية + آخر 10 محادثات)
  - P6-2: `public/dashboard/inbox-v4/analytics.js` — `_openAgentDetail()` modal
    - KPI row + mini bar chart يومي + two-col منصات/أولوية + جدول آخر محادثات
    - النقر على اسم الموظف في الجدول يفتح drill-down modal
  - `api.js`: analytics.agentDetail(agentId, { from, to })
  - `inbox.css`: ~110 سطر CSS (modal + KPI + bars + status badges + dark mode)
- قرارات: لا جديد
- آخر commit: ff88979
- المهمة القادمة: **P6-3 Platform Breakdown** أو **P6-5 SLA Reports**

---

## جلسة 2026-05-03 21:41 UTC
- الحالة: مكتملة
- ما تم:
  - P6-1: `server/routes/inbox/analytics.js` — أضاف endpointين جديدين
    - `GET /analytics/volume`: حجم المحادثات يومياً (إجمالي + مغلقة + توزيع منصات)
    - `GET /analytics/hourly`: توزيع الرسائل الواردة على 24 ساعة
  - P6-1: `public/dashboard/inbox-v4/analytics.js` — جديد بالكامل
    - Overlay Dashboard مستقل فوق اللّينبوكس
    - KPI Cards: إجمالي / معدل إغلاق / وقت أول رد / وقت إغلاق / رسائل
    - Volume Chart: SVG bar chart يومي مع tooltip
    - Hourly Heatmap: 24 خلية بألوان حرارية (cold→hot)
    - Platforms: progress bars بنسب المنصات
    - SLA: ملخص نسبة الالتزام + تفصيل حسب الأولوية
    - Agents Table: أداء الموظفين مع export CSV
    - Date Range: presets 7d/30d/90d + custom picker
  - `api.js`: أضاف analytics.sla / platforms / volume / hourly
  - `index.html`: زر 📊 الإحصاءات في الـ sidebar + analytics.js script
  - `app.js`: ربط زر الإحصائات بـ InboxAnalytics.open()
  - `inbox.css`: ~200 سطر CSS كامل (overlay + dark mode)
- قرارات: لا جديد
- آخر commit: 0d49909
- المهمة القادمة: **P6-2 Agent Performance Reports** أو **P4-2 Chatbot Flows**

---

## جلسة 2026-05-03 21:33 UTC
- الحالة: مكتملة
- ما تم:
  - P5-5: `server/routes/inbox/context.js` — endpoint جديد
    - `GET /conversations/:id/timeline`: جلب أحداث المحادثة (max 100، cursor-based pagination)
    - يدعم: assigned / unassigned / transferred / label_added|removed / note_mention / crm_linked|unlinked / invoice_created / paylink_created / status_changed / snoozed / unsnoozed / priority_set
  - P5-5: `public/dashboard/inbox-v4/context.js` — تب "⏱ التاريخ" جديد
    - `TIMELINE_META`: خريطة icon + label + color لكل event type
    - `_loadTimeline(append)`: جلب مع cursor-based load more
    - `_renderTimelineList()`: HTML مع خط رأسي يربط الأحداث
    - `_renderTimelineEvent()`: بطاقة حدث مع dot ملون + actor + وصف + تاريخ
    - `_tlEventDesc()`: نص وصفي عربي لكل نوع حدث
    - Reset `_timeline` عند فتح محادثة جديدة
  - P5-5: `inbox.css` — ~80 سطر CSS (timeline dots + vertical line + tag chips + dark mode)
- قرارات: لا جديد
- آخر commit: 58ace35
- المهمة القادمة: **P4-2 Chatbot Flows** — `settings.js` + backend أو **P6-1 Analytics Dashboard**

---

## جلسة 2026-05-03 21:27 UTC
- الحالة: مكتملة
- ما تم:
  - P5-4: `inbox_conv_notes_v4` migration جديد (v25)
  - P5-4: `server/routes/inbox/context.js` — 3 endpoints
    - `GET /conversations/:id/context/notes`: جلب كل النوتس (الأحدث أولاً)
    - `POST /conversations/:id/context/notes`: إضافة نوتة + SSE broadcast
    - `DELETE /conversations/:id/context/notes/:nid`: حذف بصلاحية (author أو admin)
  - P5-4: `public/dashboard/inbox-v4/context.js` — تب "📝 نوتس" جديد
    - `_loadNotes()` + `_renderNotesList()` + `_renderNoteItem()`
    - `_submitNote()` مع Optimistic UI + `_deleteNote()` مع rollback
    - SSE listeners: `conv:note_added` + `conv:note_deleted`
    - Reset `_notes` عند فتح محادثة جديدة
  - P5-4: `api.js` — إضافة `getNotes` + `addNote` + `deleteNote`
  - P5-4: `stream.js` — إضافة listeners: `conv:note_added` + `conv:note_deleted`
  - P5-4: `inbox.css` — ~100 سطر CSS (نوتة بطاقة + composer + dark mode)
- قرارات: لا جديد
- آخر commit: 8ccfcd8
- المهمة القادمة: **P5-5 Conversation Timeline** — `context.js`

---

## جلسة 2026-05-03 21:21 UTC
- الحالة: مكتملة
- ما تم:
  - P5-2: `public/dashboard/inbox-v4/context.js` — تحسين كامل للـ tabs
    - Pagination على Invoices + Orders + PayLinks (10 عناصر/صفحة)
    - فلتر حالة على الفواتير (الكل/مدفوعة/مرسلة/مسودة/ملغاة) + الطلبات
    - CLV Mini Summary أعلى tab الفواتير (مدفوع + عدد + متوسط)
    - تب CLV كامل: grid بطاقات 6 إحصائيات + progress bar التحويل + رسم شهري mini bar chart
  - P5-3: Quick Actions مكتمل
    - زر "+ فاتورة" في tab الفواتير → modal بسيط (مبلغ + وصف) → API → reload + toast
    - زر "+ رابط دفع" في tab الدفع → modal → API → reload + toast
    - زر "📋 نسخ" لكل رابط دفع نشط → clipboard copy
    - زر "📤 إرسال" لكل رابط دفع نشط → يُدرج النص في reply box
  - `inbox.css`: ~210 سطر CSS جديد
    - toolbar + filter pills + clv-mini + pager + pay-actions
    - CLV grid + progress bar + bar chart
    - Quick Action modal + overlay + toast
    - dark mode كامل
- قرارات: لا جديد
- آخر commit: 9cfe934
- المهمة القادمة: **P5-4 Internal Notes** — `context.js` أو **P5-5 Conversation Timeline** — `context.js`

---

## جلسة 2026-05-03 21:01 UTC
- الحالة: مكتملة
- ما تم:
  - P5-1: `server/routes/inbox/context.js` — جديد — 3 endpoints
    - `GET /conversations/:id/context`: بيانات العميل + فواتير + طلبات + روابط دفع + CLV
    - ربط تلقائي بالهاتف لو كان العميل غير مربوط
    - `POST /conversations/:id/context/link`: ربط/إلغاء ربط CRM + timeline log + SSE
    - `GET /conversations/:id/context/search`: بحث في crm_contacts (10 نتائج)
  - P5-1: `public/dashboard/inbox-v4/context.js` — frontend كامل
    - تب Contact: avatar + بيانات + CLV stats row + fields + بحث CRM + فتح صفحة CRM
    - تب Invoices: آخر 5 فواتير مع الحالة + رابط صفحة الفواتير
    - تب Orders: آخر 5 طلبات + tracking_no + رابط صفحة الطلبات
    - تب Pay: روابط الدفع
    - Auto-reload عند فتح محادثة جديدة
    - بحث autocomplete للربط اليدوي
  - `server/routes/inbox/index.js`: تسجيل context route
  - `index.html`: تفعيل context.js
  - `app.js`: `InboxContext.init()`
  - `inbox.css`: ~180 سطر CSS (كل مكونات البانل + dark mode)
- قرارات: لا جديد
- آخر commit: 3bd636f
- المهمة القادمة: **P5-2 Order/Invoice History + CLV** — `context.js` + backend أو **P5-3 Quick Actions**

---

## جلسة 2026-05-03 20:56 UTC
- الحالة: مكتملة
- ما تم:
  - P4-1: `server/routes/inbox/automation.js` — جديد بالكامل
    - 6 Endpoints: GET/POST/PUT/DELETE keywords + toggle + reorder
    - POST `/automation/test`: اختبار قاعدة على نص بدون إرسال
    - `processAutoReply(db, conv, text, tenantId)`: المحرك المركزي — يُستدعى من webhook عند استقبال رسالة واردة
    - 4 أنماط مطابقة: exact / contains / starts / regex
    - دعم تأخير `reply_delay_sec` + `apply_once_per_conv` + تصفية حسب المنصة `platforms`
    - SSE broadcast عند كل رد تلقائي
    - أولوية `priority_order` + `reorder` endpoint
  - `server/routes/inbox/index.js`: تفعيل automation route
  - `server/routes/inbox/messages.js`: تصدير `dispatchOutbound` لاستخدام automation.js
- قرارات: لا جديد
- آخر commit: f46c564
- المهمة القادمة: **P4-2 Chatbot Flows** — `settings.js` + backend أو **P5-1 Customer Info + CRM Link** — `context.js`

---

## جلسة 2026-05-03 20:51 UTC
- الحالة: مكتملة
- ما تم:
  - P3-6: `server/routes/inbox/conversations.js` — SLA helpers
    - `SLA_THRESHOLDS_SEC`: حدود الوقت حسب الأولوية (urgent 15د / high 1س / normal 4س / low 24س)
    - `_computeSLA(conv)`: حساب first_response_status + resolution_status + نسب الوقت المستهلك
    - `recordFirstResponse(db, convId, sentAt)`: تسجيل أول رد صادر (no-op لو محدد مسبقاً)
    - `GET /conversations/:id/sla`: SLA لمحادثة واحدة
    - `POST /conversations/:id/sla/backfill`: إعادة حساب من الرسائل الفعلية
    - `module.exports`: تصدير `recordFirstResponse` + `computeSLA` + `SLA_THRESHOLDS_SEC`
  - P3-6: `server/routes/inbox/messages.js` — hook SLA تلقائي
    - `recordFirstResponse` يُستدعى بعد نجاح إرسال أي رسالة صادرة (outbound غير failed)
  - P3-6: `server/routes/inbox/analytics.js` — جديد بالكامل
    - `GET /analytics/overview`: أرقام عامة (inbox health)
    - `GET /analytics/sla`: نسب الالتزام + متوسطات + توزيع حسب الأولوية
    - `GET /analytics/agents`: أداء الموظفين (ردود + وقت استجابة + إغلاق + CSAT)
    - `GET /analytics/platforms`: توزيع المحادثات على المنصات
  - `server/routes/inbox/index.js`: تسجيل analytics route على `/analytics`
- قرارات: لا جديد
- آخر commit: fc082db
- المهمة القادمة: **P4-1 Keywords Auto-Reply** — backend `server/routes/inbox/automation.js`

---

## جلسة 2026-05-03 20:43 UTC
- الحالة: مكتملة
- ما تم:
  - P3-5: `server/routes/inbox/search.js` — backend كامل
    - `GET /search`: بحث quick (اسم + هاتف + آخر رسالة) + deep (كل نص الرسائل)
    - `GET /search/suggest`: autocomplete أسماء وأرقام العملاء
    - `_highlight()`: تشغيل snippet مع تمييز النص المطابق
    - scope check للصلاحيات (owner/admin يشوف الكل — موظف عادي = محادثاته فقط)
  - P3-5: `public/dashboard/inbox-v4/search.js` — frontend كامل
    - Quick Search: إدخال debounce 300ms + suggest dropdown مع تنقل (لوحة مفاتيح + ماوس)
    - Deep Search: overlay كامل مع فلاتر (mode/status/platform) + تمييز النص + load more
    - Ctrl+F → يفتح deep overlay
    - بادج badge "في رسالة" للنتائج من نص الرسائل
    - فتح المحادثة مباشرة عند النقر على النتيجة
  - `api.js`: إضافة `InboxAPI.search.search()` + `InboxAPI.search.suggest()`
  - `server/routes/inbox/index.js`: تسجيل search route
  - `index.html`: إضافة `search.js` + زر بحث متقدم + trigger داخل شريط البحث
  - `app.js`: تهيئة InboxSearch.init() + ربط أزرار البحث المتقدم
  - `inbox.css`: تصميم كامل (suggest dropdown + deep overlay + result items + dark mode)
  - Smoke test: HTTP 200 health ✔️ + routes 401 ✔️
- قرارات: لا جديد
- آخر commit: 73e5969
- المهمة القادمة: **P3-6 SLA Tracking** — backend `conversations.js` + `analytics.js`

---

## جلسة 2026-05-03 20:39 UTC
- الحالة: مكتملة
- ما تم:
  - P3-4: `public/dashboard/inbox-v4/conv-list.js` — Bulk Actions UI كامل
    - `_selectedIds` Set لتتبع التحديد
    - `_syncBulkUI`: مزامنة toolbar + checked state + bulk-selected class
    - `_executeBulkAction`: Optimistic UI + API call + rollback + confirm للحذف
    - `_bindBulkToolbar`: ربط أحداث الـ toolbar + صندوق تحديد الكل
    - صندوق تحديد على كل كارد (hover → ظاهر)
    - أكشن جاهزة: إغلاق / إعادة فتح / حذف
  - `public/dashboard/inbox-v4/index.html`: إضافة `#iv4-bulk-toolbar` بأزرار الاكشن
  - `public/dashboard/inbox-v4/inbox.css`: ~70 سطر CSS (toolbar + bulk-check + bulk-selected + dark mode)
- قرارات: لا جديد
- آخر commit: 017c9b9
- المهمة القادمة: **P3-5 Search (Quick + Deep)** — `search.js` + backend

---

## جلسة 2026-05-03 20:35 UTC
- الحالة: مكتملة
- ما تم:
  - P3-3: `public/dashboard/inbox-v4/conv-list.js` — Snooze UI كامل
    - `_openSnoozeModal`: modal ب 5 خيارات جاهزة (ساعة / 3س / 24س / غداً 9صباحاً / أسبوع) + datetime-local
    - `_closeSnoozeModal`, `_snooze`, `_unsnooze`: optimistic UI + rollback
    - `_formatSnoozedUntil`: تنسيق الوقت للـ badge
    - `_msUntilTomorrow9am` + `_toLocalDatetimeInput`: helpers
    - `.iv4-snooze-trigger`: زر hover على كل كارد
    - `.iv4-snooze-badge--active`: badge قابل للنقر لإلغاء التأجيل
    - `.iv4-conv-snoozed`: شفافية خفيفة للكارد المؤجل
  - `public/dashboard/inbox-v4/inbox.css`: ~110 سطر CSS جديد (Snooze modal + badges + dark mode)
- قرارات: لا جديد
- آخر commit: 5dc61ba
- المهمة القادمة: **P3-4 Bulk Actions** — `conv-list.js`

---

## جلسة 2026-05-03 20:31 UTC
- الحالة: مكتملة
- ما تم:
  - P3-2: `public/dashboard/inbox-v4/conv-list.js` — Priority UI كامل
    - `PRIORITY_META` map: icon + label لكل مستوى (urgent/high/normal/low)
    - `_renderConvItem`: badge ملون يظهر في `.iv4-conv-bottom-badges` (normal مخفي)
    - `data-priority` attribute على كل كارد للتتبع السريع
    - `_openPriorityMenu`: dropdown مُتموضع fixed عند الكليك على الـ badge
    - `_closePriorityMenu`: إغلاق عند الكليك خارجها (once listener)
    - `_setPriority`: Optimistic UI + API call + rollback عند الفشل
    - `_updatePriorityDOM`: تحديث badge + border الكارد بدون re-render كامل
    - `_renderPriorityFilters`: قسم فلتر في الـ sidebar (الكل/عاجل/عالي/عادي/منخفض)
  - `public/dashboard/inbox-v4/index.html`: إضافة `#iv4-priority-filters` في الـ sidebar
  - `public/dashboard/inbox-v4/inbox.css`: ~120 سطر CSS جديد
    - `.iv4-priority-badge` + 4 variants (urgent/high/normal/low)
    - `.iv4-conv-item.iv4-priority-*` border-right ملون
    - `.iv4-priority-menu` + `.iv4-priority-option` + `.iv4-priority-opt-check`
    - `@keyframes iv4-fade-in` للـ dropdown
    - Dark mode كامل
- قرارات: لا جديد
- آخر commit: 4c58034
- المهمة القادمة: **P3-3 Snooze** — `conv-list.js` + backend `conversations.js`

---

## جلسة 2026-05-03 20:22 UTC
- الحالة: مكتملة
- ما تم:
  - P3-1: `server/routes/inbox/labels.js` — backend كامل منفصل
    - GET/POST/PUT/DELETE `/labels` مع SSE broadcast `labels_update`
    - GET/POST/DELETE `/conversations/:id/labels` مع timeline log + SSE `conv_update`
    - نقل الـ labels endpoints من `conversations.js` لـ `labels.js`
  - P3-1: `public/dashboard/inbox-v4/labels.js` — frontend كامل
    - `InboxLabels.init()` + `openConversation(convId, labels)`
    - Label Manager Modal: إنشاء / تعديل / حذف labels مع 20 لون جاهز
    - Label Picker في Chat Header: chips + dropdown + بحث
    - SSE listener: `labels_update` + `conv_update` → تحديث فوري
  - `api.js`: إضافة `labels.update()` + `labels.getConvLabels()`
  - `app.js`: تفعيل `InboxLabels.init()`
  - `chat.js`: إضافة `iv4-label-picker-mount` + استدعاء `InboxLabels.openConversation`
  - `stream.js`: استقبال `labels_update` من SSE
  - `inbox.css`: أكثر من 200 سطر CSS لـ label picker + manager + chips + dropdown
- قرارات: لا جديد
- آخر commit: be1d659
- المهمة القادمة: **P3-2 Priority (Low/Normal/High/Urgent)** — `conv-list.js` + backend `conversations.js`

---

## جلسة 2026-05-03 19:38 UTC
- الحالة: مكتملة
- ما تم:
  - P2-4: `reply.js` — @Mentions autocomplete في النوتس
    - `_parseMentionContext` كشف @ مع تحليل query + start position
    - `_showMentionDropdown` فلتر الموظفين + عرض dropdown متموضع fixed
    - تحكم بلوحة المفاتيح (↑↓ Enter Tab Escape)
    - `_extractMentions` تقاطع مع InboxStore.state.agents
    - `messages.js` backend: `_notifyMentions` + SSE `note:mention` لكل موظف مذكور + timeline log
    - `stream.js` frontend: استقبال `note:mention` + toast مخصص قابل للنقر
    - `api.js`: إضافة `mentionIds` لـ `messages.send`
    - `inbox.css`: `.iv4-mention-dropdown` + `.iv4-toast--mention`
  - P2-5: `team.js` + backend `team.js` — Conversation Transfer
    - backend: `POST /conversations/:id/transfer` — تحديث assigned_to + نوتس داخلي + context آخر 3 رسائل + timeline + SSE broadcast
    - `team.js` frontend: `openTransferModal` — modal مع بحث + ملاحظة + checkbox context
    - `api.js`: إضافة `team.transfer()`
    - `stream.js` frontend: استقبال `conv:transferred` + toast مخصص
    - `chat.js`: زر "تحويل" في الـ header مربوط بـ `openTransferModal`
    - `inbox.css`: modal styling + `.iv4-toast--transfer` + `.iv4-btn`
- قرارات: لا جديد
- آخر commit: 5509280
- المهمة القادمة: **P3-1 Labels + Tags** — `labels.js` + backend `labels.js`

---

## جلسة 2026-05-03 18:50 UTC
- الحالة: مكتملة
- ما تم:
  - P2-3: `server/routes/inbox/stream.js` — Collision Detection backend
    - `_viewing` Map: tenantId → convId → userId → agentName
    - POST /stream/viewing: تسجيل بدء مشاهدة + broadcast `conv:viewing` لباقي الموظفين + إرجاع viewers
    - DELETE /stream/viewing/:convId: إلغاء مشاهدة + broadcast `conv:viewing:stop`
    - `_cleanupViewingForUser` عند قطع SSE connection تلقائياً
  - P2-3: `public/dashboard/inbox-v4/stream.js` — استقبال `conv:viewing` و `conv:viewing:stop`
    - حفظ في `InboxStore.state.convViewers`
    - emit لـ InboxStore
  - P2-3: `public/dashboard/inbox-v4/api.js` — `InboxAPI.stream.startViewing()` + `stopViewing()`
  - P2-3: `public/dashboard/inbox-v4/chat.js` — Collision UI
    - `_currentViewingConvId` لتتبع المحادثة الفعالة
    - `_onConvOpen`: stopViewing للسابقة + startViewing للجديدة
    - `_showCollisionBanner` / `_hideCollisionBanner` / `_addCollisionViewer` / `_removeCollisionViewer`
    - Banner يظهر بين header و messages بتحذير أصفر مع animation
    - `beforeunload` → sendBeacon لضمان إرسال stopViewing عند إغلاق الـ tab
  - `inbox.css`: `.iv4-collision-banner` + animation slide-in/out + dark mode
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: cec54e2
- المهمة القادمة: **P2-4** @Mentions في الـ Notes — `reply.js`

---

## جلسة 2026-05-03 18:45 UTC
- الحالة: مكتملة
- ما تم:
  - P2-2: `chat.js` — زر تعيين الموظف في الـ chat header
    - يفتح assign dropdown من InboxTeam.openAssignDropdown
    - يعرض dot ملوّنة بحالة الموظف المعيّن (online/busy/away/offline)
    - يستمع لـ `conv_assigned` event ويُعيد رسم الـ header
  - P2-2: `chat.js` — Typing Indicator
    - `_showTypingIndicator()` يعرض bar متحرك في أسفل الـ messages
    - يستمع لـ SSE event `agent_typing` ويعرض اسم الموظف
    - auto-hide بعد 4 ثوانٍ إن لم يأتِ `typing:false`
  - P2-2: `server/routes/inbox/team.js` — POST /conversations/:id/typing
    - broadcast عبر SSE بدون كتابة DB (fire-and-forget)
  - P2-2: `reply.js` — إرسال typing events
    - `_sendTypingStart()` مرة واحدة عند البدء بالكتابة
    - `_sendTypingStop()` تلقائياً بعد 3.5 ث بلا كتابة
  - P2-2: `api.js` — team.sendTyping(convId, typing)
  - CSS: `.iv4-typing-bar` + `.iv4-header-assign-btn` + `.iv4-agent-status-dot`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: b9d5118
- المهمة القادمة: **P2-3** Collision Detection (`chat.js` + SSE)

---

## جلسة 2026-05-03 17:39 UTC
- الحالة: مكتملة
- ما تم:
  - P2-1: `server/routes/inbox/team.js` — backend Team Assignment
    - GET /team/agents — قائمة الموظفين + حالتهم + open_count
    - GET /team/agents/:id — بيانات موظف واحد
    - PUT /team/agents/status — تغيير حالة الموظف (online/busy/away/offline) + UPSERT
    - PUT /conversations/:id/assign — تعيين يدوي + scope check
    - POST /conversations/auto-assign — اختيار أفضل موظف (online → أقل محادثات → LIFO)
    - POST /conversations/auto-assign-all — توزيع كل المحادثات المفتوحة
    - timeline logging لكل تعيين + SSE broadcast
  - P2-1: `public/dashboard/inbox-v4/team.js` — frontend Team
    - Agent Status Widget في sidebar (بدون تلوث الأخرين)
    - Assign Dropdown (بحث + حالة كل موظف + open_count)
    - Auto-assign button (single + all)
    - SSE listener لتحديث حالات الموظفين
    - localStorage حفظ حالة الموظف بين الجلسات
  - تحديث `api.js`: team shortcuts مباشرة (getAgents, setAgentStatus, assignConversation, autoAssign, autoAssignAll)
  - تفعيل team route في `server/routes/inbox/index.js`
  - إضافة team.js لـ `index.html` + تهيئة في `app.js`
  - CSS كامل (status widget + assign dropdown) في `inbox.css`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: e74b705
- المهمة القادمة: **P2-2** Agent Status كامل (تحسين UX + عرض حالات الموظفين في الهيدر + typing indicator) — `team.js`

---

## جلسة 2026-05-03 17:34 UTC
- الحالة: مكتملة
- ما تم:
  - P1-4: `chat.js` — زر رد ↩ على كل رسالة (hover)
    - يُطلق `reply:quote` event → reply.js يعالجه
    - الاتجاه: وارد = يمين / صادر = يسار
    - معالجة direction: inbound/outbound + in/out (backward compat)
    - Note tag مُحسَّن مع styling مميز للـ bubble
  - P1-5: `conv-list.js` — إزالة unread badge فوراً عند فتح المحادثة
    - `_clearUnreadBadge()` — optimistic UI (لا ينتظر الـ API)
    - تحديث InboxStore محلياً + إزالة DOM badge
    - animation fade-out للـ badge
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 2661366
- المهمة القادمة: **Phase 1 مكتملة** — التالي: **P2-1** Team Assignment + Auto-assign (`team.js` + backend `team.js`)

---

## جلسة 2026-05-03 17:22 UTC
- الحالة: مكتملة
- ما تم:
  - P1-3: `server/routes/inbox/messages.js` — backend إرسال الرسائل
    - POST /conversations/:id/messages (نص + ملاحظة داخلية)
    - POST /conversations/:id/messages/media (رفع ملف + إرسال)
    - dispatch لـ whatsapp_api + telegram
    - SSE broadcast عند كل إرسال (message_new + message_status + conv_update)
    - multer upload (max 20MB) داخل uploads/inbox-media/
  - P1-3: `public/dashboard/inbox-v4/reply.js` — frontend reply box
    - إرسال نص (Enter أو Ctrl+Enter)
    - إرسال ميديا + drag & drop
    - preview الميديا قبل الإرسال
    - quoted message (رد على رسالة محددة)
    - formatting buttons (bold/italic/strike/mono)
    - char count + auto-grow textarea
    - lock منع الإرسال المزدوج
  - تسجيل messages route في `server/routes/inbox/index.js`
  - تفعيل reply.js في `index.html` + `app.js`
  - إضافة CSS: media preview + quoted preview + char count + drag-over
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 548fdbd
- المهمة القادمة: **P1-4** — Reply Mode + Note Mode (`reply.js` — تفعيل الـ note UI) + P1-5 Read/Unread tracking

---

## جلسة 2026-05-03 17:15 UTC
- الحالة: مكتملة
- ما تم:
  - P1-2: `public/dashboard/inbox-v4/chat.js` — Chat Window كامل
    - عرض الرسائل مع Date Dividers
    - 8 أنواع محتوى: text | image | video | audio | file | sticker | template | interactive
    - Chat Header مع أزرار إغلاق / إعادة فتح
    - حالة الرسائل: pending | sent | delivered | read | failed
    - Quoted messages + scroll-to-message
    - Lightbox للصور
    - Audio player بسيط
    - Load More عبر IntersectionObserver
    - Read tracking (تعليم مقروءة بعد 1.2ث)
    - SSE real-time (message_new | message_status | conv_update)
  - تفعيل `chat.js` في `index.html` + `app.js`
  - تحديث الـ messages area في `index.html`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 73bc7af
- المهمة القادمة: **P1-3** — Send Text + Media (`reply.js` + backend `messages.js`)

---

## جلسة 2026-05-03 17:07 UTC
- الحالة: مكتملة
- ما تم:
  - P1-1: `public/dashboard/inbox-v4/conv-list.js` — عرض قائمة المحادثات + real-time updates + load more + labels
  - `server/routes/inbox/conversations.js` — routes كاملة (list/get/status/assign/snooze/priority/bulk/counts/mark-all-read/messages/read/labels)
  - تفعيل `conv-list.js` في `index.html` + `app.js`
  - تسجيل conversations route في `server/routes/inbox/index.js`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: a135415
- المهمة القادمة: **P1-2** — Chat Window + Message Rendering (`public/dashboard/inbox-v4/chat.js`)

---

## جلسة 2026-05-03 17:00 UTC
- الحالة: مكتملة
- ما تم:
  - P0-7: migrations v18–v24 في `server/migrations.js`
  - 7 جداول جديدة: `inbox_conversations_v4`, `inbox_messages_v4`, `inbox_timeline_v4`, `inbox_agent_status_v4`, `inbox_conversation_labels`, `inbox_channel_settings_v4`, `inbox_automation_v4`
  - تطبّقت تلقائياً عند reload على كل tenant DBs
  - تحقق: `schema_versions` يُظهر v18–v24 بتوقيت 17:01:22
- قرارات: `inbox_agent_status_v4` سُمّيت بـ `_v4` تفادياً لـ collision مع `inbox_agent_status` (v17)
- آخر commit: 9997c28
- المهمة القادمة: **P1-1** — Conversations List (`public/dashboard/inbox-v4/conv-list.js`) — قراءة + عرض المحادثات من backend + تحديث real-time عبر SSE

---

## جلسة 2026-05-03 16:45 UTC
- الحالة: مكتملة
- ما تم:
  - P0-2: `public/dashboard/inbox-v4/store.js` — InboxStore كامل (state + events + helpers)
  - P0-3: `public/dashboard/inbox-v4/api.js` — InboxAPI كامل (conversations + messages + labels + team + analytics + crm + broadcast)
  - P0-4: `server/routes/inbox/stream.js` — SSE backend (broadcast + sendToUser + keepalive ping)
  - P0-5: `public/dashboard/inbox-v4/stream.js` — SSE frontend (connect + reconnect + visibility API)
  - P0-6: `public/dashboard/inbox-v4/index.html` + `inbox.css` + `app.js` — Layout 3 أعمدة + CSS كامل + init
  - `server/routes/inbox/index.js` — entry point مسجّل في app.js على `/api/inbox`
  - smoke test: HTTP 401 على `/api/inbox/stream` = route شغّال + auth يعمل ✅
- قرارات: لا جديد
- آخر commit: d603671
- المهمة القادمة: **P0-7** — Migrations (7 ملفات SQL في `server/migrations/inbox-v4/`)

## جلسة 2026-05-03 16:41 UTC
- الحالة: مكتملة (P0-1)
- ما تم: إنشاء scaffold — مجلد `inbox-v4/` + الملفات الأربعة (TASKS + SESSIONS + DECISIONS + SCHEMA)
- قرارات: لا قرارات جديدة — الرؤية متفق عليها في INBOX_VISION.md
- آخر commit: bd7b101
- المهمة القادمة: P0-2 — بناء InboxStore في `public/dashboard/inbox-v4/store.js`
