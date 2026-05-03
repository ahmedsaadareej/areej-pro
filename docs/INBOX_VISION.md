# 🧠 رؤية Inbox الجديد — تحليل شامل
> كُتب بناءً على قراءة كاملة للكود الحالي + محادثة أحمد
> تاريخ: 2026-05-03

---

## أولاً: المشاكل الحقيقية في الكود الحالي

### 1. مشكلة بنيوية — الكود نما بدون معمارية
- `routes/inbox.js` = **3,552 سطر** في ملف واحد — فيه inbox + marketplace + payment links + shipping + order forms + categories + products + كل حاجة
- الـ Frontend = **~8,500 سطر** موزعة على 7 ملفات لكن كلها global functions بدون namespace حقيقي
- State management = object واحد `IV3` بدون أي reactivity أو immutability
- الـ Polling كل 8 ثواني = مش real-time، وعند 20+ موظف = 20 × 8 = 2.5 request/ثانية على السيرفر

### 2. مشكلة الـ Real-time
- **الحالي:** Polling (setInterval 8s) — كل tab يعمل requests مستقلة
- **المشكلة:** مع 1000 عميل × 20 موظف = **20,000 request/دقيقة** على السيرفر
- **الحل:** Server-Sent Events (SSE) — أو WebSocket

### 3. مشكلة الـ Multi-tenant
- كل عميل = SQLite منفصلة ✅ (صح)
- لكن connections بدون pooling محكم → ممكن يفتح 1000 DB connection
- migrations = legacy + versioned = تداخل ومخاطر

### 4. مشكلة الـ Settings
- `inbox_settings` جدول واحد فيه **كل** الإعدادات (Telegram + WA + Meta + IG + CSAT + Chatbot + Away + Welcome + SLA...)
- كل إعداد جديد = ALTER TABLE = migration جديدة = خطر
- مفيش validation قوي على الـ settings

### 5. مشكلة الـ Media
- `ensure*Columns` تُستدعى في كل request = `PRAGMA table_info` في كل call
- Telegram media = lazy resolve = UX ضعيف
- WA media = download وحفظ محلي = مشكلة تخزين عند 1000 عميل

---

## ثانياً: الـ Features الموجودة حالياً (كاملة)

### 📥 Core Inbox
- [x] قائمة محادثات + فلتر (platform / status / agent / label / search / date)
- [x] فتح محادثة + تحميل رسائل + pagination (load more older)
- [x] إرسال نص / ميديا / ملف
- [x] Reply mode + Note mode (ملاحظات داخلية)
- [x] Quote/Reply على رسالة معينة
- [x] Copy message بـ double-click
- [x] Optimistic UI (الرسالة تظهر فوراً)
- [x] Mark as read تلقائي + Mark all read

### 🔔 Notifications & Sound
- [x] صوت عند رسالة جديدة (Web Audio API)
- [x] Browser Push Notifications (Service Worker)
- [x] Unread badge في الـ tab title
- [x] Unread badges لكل منصة

### 👥 Team & Assignment
- [x] تعيين محادثة لموظف
- [x] فلتر "ملكي / غير معيّن / الكل"
- [x] Auto-assign (round robin / least loaded)
- [x] Collision Detection (مين بيرد على نفس المحادثة)
- [x] Typing indicator (Telegram)

### 🏷️ Labels System
- [x] إنشاء/حذف labels بألوان
- [x] إضافة/إزالة label من محادثة
- [x] فلتر بالـ label في القائمة
- [x] Label chips على كل بطاقة
- [x] عدادات في Labels Panel

### ⏰ Snooze
- [x] تأجيل محادثة لوقت محدد
- [x] Snooze Dashboard (عرض المؤجلة)
- [x] Badge على زر الـ snooze
- [x] إيقاظ تلقائي عند حلول الوقت

### 🤖 Automation
- [x] Keyword Auto-Reply
- [x] Chatbot Flows (trigger/response + children)
- [x] Welcome Message (رسالة ترحيب للمحادثة الجديدة)
- [x] Away Message (رسالة الغياب بأوقات محددة)
- [x] Order Status Bot (يرد بحالة الطلب تلقائياً)

### 📊 Analytics & CSAT
- [x] إحصائيات الـ inbox (عدد محادثات / رسائل / منصات)
- [x] Auto-refresh كل 5 دقائق
- [x] CSAT (تقييم العملاء بعد إغلاق المحادثة)
- [x] رابط تقييم فريد لكل محادثة

### 👤 Context Panel (العميل)
- [x] بيانات المرسل (اسم / هاتف / منصة)
- [x] تعديل بيانات العميل inline
- [x] إضافة للـ CRM / ربط بجهة اتصال موجودة
- [x] فواتير العميل (آخر 4 + CLV)
- [x] أوردرات العميل (آخر 4)
- [x] ملاحظات داخلية على المحادثة
- [x] تاب دفع (إرسال رابط دفع)

### 💬 Reply Box
- [x] Textarea + تغيير حجم تلقائي
- [x] Channel Selector (اختيار منصة الإرسال)
- [x] تنسيق النص (Bold / Italic / Strike / Mono)
- [x] ردود جاهزة (Templates)
- [x] AI Suggestions (Genspark API)
- [x] إرفاق ميديا
- [x] Catalog (عرض المنتجات + إدراج في الرسالة)

### 📢 Broadcast
- [x] إرسال رسالة لعدة عملاء (Telegram)
- [x] تاريخ الحملات

### 🔗 Integrations
- [x] Telegram Bot (webhook)
- [x] WhatsApp QR (unofficial)
- [x] WhatsApp Business API (Meta)
- [x] Facebook Messenger (Meta Graph API)
- [x] Instagram DM (Meta Graph API)

### 🆕 New Conversation
- [x] ابتداء محادثة جديدة (WA QR / Telegram / WA API / IG / Messenger)
- [x] Template Message لـ WA API
- [x] Smart Default Platform

### 🔍 Search
- [x] بحث سريع في أسماء/آخر رسالة
- [x] Deep Search (بحث في محتوى الرسائل)

### 📋 Bulk Actions
- [x] تحديد عدة محادثات
- [x] تغيير حالة / تعيين / حذف جماعي
- [x] إرسال رسالة جماعية

### 📅 Timeline
- [x] سجل أحداث المحادثة (تغيير حالة / تعيين / snooze / ملاحظات)

---

## ثالثاً: الـ Features المقترحة للإضافة (تحليلي)

### 🔴 أولوية حرجة (لازم يكون في النظام)

#### A. Real-time حقيقي (SSE / WebSocket)
- بدل Polling → Server-Sent Events (SSE)
- كل tenant يستقبل events: رسالة جديدة / تغيير حالة / assignment
- **الأثر:** استجابة فورية + تقليل load بنسبة 90%

#### B. Inbox Permissions الكاملة
- كل موظف يشوف بس محادثاته + الـ unassigned
- Owner يشوف الكل
- Supervisor يشوف فريقه بس
- **جدول:** `inbox_agent_roles` (agent / supervisor / admin)

#### C. SLA Tracking حقيقي
- وقت الاستجابة الأول (First Response Time)
- وقت الحل (Resolution Time)
- تنبيه لو تجاوز SLA
- **بيانات:** first_response_at + resolved_at في inbox_conversations

#### D. Conversation History موحدة
- لما العميل يرسل من WA وبعدين من Telegram → نعرف إنه نفس الشخص
- Merge Conversations يدوياً
- **بيانات:** master_contact_id على inbox_conversations

### 🟠 أولوية عالية (يفرق كتير في الشغل)

#### E. Quick Replies Keyboard
- اختصارات لوحة المفاتيح (/ للـ templates، @ للـ mention موظف)
- Slash commands: `/close`, `/snooze 1h`, `/assign @name`

#### F. Conversation Tags (غير Labels)
- Labels = تنظيم (Sales / Support / Complaint)
- Tags = وصف سريع (#urgent #vip #followup)
- فرق واضح في الـ UX

#### G. WhatsApp Flows / Interactive Messages
- أزرار تفاعلية في WA Business API (Quick Reply Buttons / List Messages)
- بدل template نصي فقط

#### H. Agent Availability Status
- كل موظف يختار: Online / Busy / Away / Offline
- يؤثر على الـ auto-assign
- يظهر في قائمة الفريق

#### I. Conversation Priority
- Low / Normal / High / Urgent
- يتحكم في ترتيب القائمة
- لون مختلف لكل priority

#### J. Internal @Mentions
- في الـ notes الداخلية: @اسم_الموظف
- الموظف يستقبل إشعار
- مهم جداً للـ team coordination

#### K. Saved Replies بـ variables
- Template فيه متغيرات: {اسم_العميل}, {رقم_الطلب}
- تتملى تلقائياً من بيانات المحادثة

#### L. Conversation Transfer مع context
- تحويل محادثة من موظف لآخر مع نقل الـ notes
- إشعار للموظف المستقبِل

### 🟡 أولوية متوسطة (يضيف قيمة)

#### M. Inbox Reports Dashboard
- تقرير لكل موظف: عدد المحادثات / متوسط وقت الاستجابة / تقييمات CSAT
- تقرير المنصات: أكتر منصة رسائل
- تقرير الأوقات: ساعات الذروة
- export PDF/Excel

#### N. WhatsApp Business Catalog Integration
- ربط كتالوج WA مع كتالوج المنتجات
- إرسال منتج كـ WA Product Message

#### O. Auto-Close Conversations
- لو ما فيش رد من العميل خلال X ساعة → تُغلق تلقائياً
- رسالة "تم إغلاق المحادثة" تُرسل للعميل

#### P. Conversation Inbox Folders (مخصصة)
- الموظف يعمل folders خاصة به
- بيجمع فيها محادثات بمعايير محددة

#### Q. Email Channel Integration
- استقبال/إرسال emails من داخل الـ inbox
- كـ platform إضافي جنب WA و TG

#### R. AI Smart Features
- تلخيص المحادثة الطويلة بضغطة
- اقتراح category/label تلقائياً
- كشف sentiment (إيجابي / سلبي / محايد)
- ترجمة فورية للرسائل

#### S. Voice Notes Player المحسّن
- Waveform visualizer
- سرعة تشغيل (0.75x / 1x / 1.5x / 2x)
- Transcript تلقائي (Whisper API)

#### T. Bulk Import Contacts
- رفع CSV → إنشاء محادثات جماعية
- مع deduplication

### 🟢 أولوية منخفضة (nice to have)

#### U. Video/Voice Calls (WebRTC)
- مكالمة مباشرة من داخل الـ inbox
- بدون مغادرة التطبيق

#### V. Screen Share / Co-browsing
- للدعم الفني

#### W. Customer Portal
- العميل يتابع محادثاته من رابط خاص

#### X. Zapier / Make Integration
- Webhook triggers عند أي حدث

#### Y. Dark Mode كامل

---

## رابعاً: التقنية الموصى بها للبناء الجديد

### Backend
```
Node.js + Express (نفس الحالي)
├── SQLite (better-sqlite3) — يكفي حتى 1000 عميل مع WAL
│   └── مستقبلاً: PostgreSQL لو احتجنا cross-tenant queries
├── Server-Sent Events (SSE) — بدل Polling
│   └── endpoint: GET /api/system/inbox/stream (text/event-stream)
├── ملفات Routes منفصلة (inbox خالص منفصل عن كل حاجة)
│   ├── routes/inbox/conversations.js
│   ├── routes/inbox/messages.js
│   ├── routes/inbox/settings.js
│   ├── routes/inbox/team.js
│   ├── routes/inbox/automation.js
│   └── routes/inbox/analytics.js
└── Connection Pool للـ SQLite (max 1 write + N reads per tenant)
```

### Frontend
```
Vanilla JS (نفس الحالي — بدون framework)
├── لكن بـ Module Pattern حقيقي (IIFE / ES Modules)
├── State management واضح (InboxStore object مع events)
├── SSE receiver بدل polling
└── Component functions (buildConvItem, buildMessage, etc.)
```

### Real-time Strategy
```
SSE (Server-Sent Events) — الأنسب لسببين:
1. بسيط جداً: res.setHeader('Content-Type', 'text/event-stream')
2. HTTP/1.1 فقط — مش محتاج WebSocket library
3. يشتغل خلف Nginx/Caddy بدون config إضافي
4. للـ write operations: HTTP POST عادي (SSE = receive only)
```

---

## خامساً: معمارية الـ Database الجديدة

### inbox_conversations (محسّنة)
```sql
id, tenant_id*, platform, sender_id, sender_name, sender_phone,
status (open/waiting/closed/snoozed),
priority (low/normal/high/urgent),
assigned_to_id, assigned_team_id,
master_contact_id,          -- ربط بـ CRM
first_message_at,
first_response_at,          -- SLA
last_message_at,
resolved_at,                -- SLA
unread_count, unread_agent_count,
snooze_until,
source_platform,            -- المنصة الأصلية
channel_override,           -- المنصة المستخدمة للرد
created_at, updated_at
```

### inbox_messages (محسّنة)
```sql
id, conversation_id,
platform, direction (in/out/note),
content, content_type (text/image/video/audio/file/template/interactive),
media_url, media_type, media_size,
platform_msg_id,
quoted_msg_id,              -- FK لنفس الجدول
sender_id, sender_name,
is_read, delivered_at, read_at,
status (pending/sent/delivered/read/failed),
metadata,                   -- JSON للبيانات الإضافية
sent_at, created_at
```

### inbox_settings (مقسّمة)
```sql
-- بدل جدول واحد ضخم:
inbox_channel_settings (id, channel, config JSON, active, updated_at)
inbox_automation_settings (id, type, config JSON, active)
inbox_notification_settings (id, user_id, config JSON)
```

---

## سادساً: خطة البناء (Task Breakdown)

### Phase 0 — الأساس (قبل أي ميزة)
```
P0-1: إنشاء مجلد inbox-v4/ + ملفات الـ scaffold
P0-2: بناء InboxStore (state management)
P0-3: بناء InboxAPI layer
P0-4: بناء SSE endpoint في backend
P0-5: بناء SSE receiver في frontend
P0-6: بناء layout الأساسي (3 columns)
P0-7: migrations جديدة (inbox tables v4)
```

### Phase 1 — Core Messaging
```
P1-1: Conversations List + Real-time updates
P1-2: Chat Window + Message Rendering
P1-3: Send Text + Media
P1-4: Reply Mode + Note Mode
P1-5: Read/Unread tracking
```

### Phase 2 — Team
```
P2-1: Assignment + Auto-assign
P2-2: Agent Status (Online/Busy/Away)
P2-3: Collision Detection
P2-4: @Mentions in Notes
P2-5: Conversation Transfer
```

### Phase 3 — Conversations Management
```
P3-1: Labels + Tags
P3-2: Priority
P3-3: Snooze
P3-4: Bulk Actions
P3-5: Search (Quick + Deep)
P3-6: SLA Tracking
```

### Phase 4 — Automation
```
P4-1: Keywords Auto-Reply
P4-2: Chatbot Flows (visual builder)
P4-3: Welcome + Away Messages
P4-4: Auto-Close
P4-5: Scheduled Messages
```

### Phase 5 — Context Panel
```
P5-1: Customer Info + CRM Link
P5-2: Order/Invoice History + CLV
P5-3: Quick Actions (New Invoice / Payment Link)
P5-4: Internal Notes
P5-5: Conversation Timeline
```

### Phase 6 — Analytics
```
P6-1: Overview Dashboard
P6-2: Agent Performance Reports
P6-3: Platform Breakdown
P6-4: CSAT Analytics
P6-5: SLA Reports
P6-6: Export PDF/Excel
```

### Phase 7 — AI Features
```
P7-1: AI Suggestions (محسّنة)
P7-2: Conversation Summary
P7-3: Auto-Label Suggestion
P7-4: Sentiment Analysis
P7-5: Voice Note Transcript (Whisper)
```

### Phase 8 — Advanced Integrations
```
P8-1: Email Channel
P8-2: WA Interactive Messages (Buttons/Lists)
P8-3: WA Catalog Products
P8-4: Broadcast V2 (multi-platform)
P8-5: Webhook Triggers
```

---

## سابعاً: ملفات المشروع المقترحة

```
/home/areej/areej-pro/
├── server/
│   └── routes/
│       └── inbox/                    ← مجلد جديد
│           ├── index.js              ← entry point
│           ├── conversations.js      ← CRUD + filters
│           ├── messages.js           ← send + receive + media
│           ├── stream.js             ← SSE endpoint
│           ├── team.js               ← agents + assignment + status
│           ├── automation.js         ← keywords + chatbot + away
│           ├── labels.js             ← labels CRUD
│           ├── analytics.js          ← stats + CSAT + SLA
│           ├── broadcast.js          ← campaigns
│           └── settings.js           ← channel settings
│
└── public/dashboard/inbox-v4/        ← مجلد جديد (موازي لـ v3)
    ├── index.html                    ← layout الأساسي
    ├── inbox.css                     ← styles
    ├── store.js                      ← InboxStore (state)
    ├── api.js                        ← InboxAPI (all fetch calls)
    ├── stream.js                     ← SSE manager
    ├── conv-list.js                  ← قائمة المحادثات
    ├── chat.js                       ← نافذة المحادثة
    ├── reply.js                      ← صندوق الرد
    ├── context.js                    ← Context Panel
    ├── team.js                       ← Team panel
    ├── labels.js                     ← Labels panel
    ├── search.js                     ← Search
    ├── analytics.js                  ← Analytics panel
    ├── settings.js                   ← Settings page
    └── components/                   ← مكونات مشتركة
        ├── toast.js
        ├── modal.js
        ├── avatar.js
        └── media-player.js
```

---

## ثامناً: ملفات إدارة المشروع المقترحة

```
/home/areej/areej-pro/inbox-v4/
├── PROJECT.md          ← خريطة المشروع + حالة كل phase
├── TASKS.md            ← قائمة المهام التفصيلية + الحالة
├── SESSIONS.md         ← يوميات العمل (ما عُمل في كل جلسة)
├── DECISIONS.md        ← القرارات المعمارية + سببها
├── SECRETS.md          ← كل الـ tokens والـ credentials (مش في git)
└── SCHEMA.md           ← تصميم قاعدة البيانات الكاملة
```

---

## تاسعاً: قواعد العمل للمشروع الجديد

1. **مهمة = ملف واحد أو مجموعة ملفات محددة** — مفيش تعديل خارج النطاق
2. **كل phase تنتهي بـ smoke test** قبل الانتقال للتالية
3. **الـ v3 يكمل شغّال** حتى v4 تكتمل بالكامل
4. **SSE connection = 1 per browser tab** — مش per user
5. **كل جدول جديد = migration file منفصل** مرقّم (001, 002...)
6. **الـ inline migrations (ALTER TABLE في routes)** = ممنوعة في v4
7. **كل API endpoint = validation + error handling صريح**
8. **مفيش global variables** — كل حاجة في InboxStore أو InboxAPI

---

*هذا الملف مرجع الرؤية الكاملة — يُقرأ قبل أي جلسة عمل على inbox-v4*
