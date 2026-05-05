# GROUND_TRUTH.md — الحقائق الثابتة للمشروع
> هذا الملف يُقرأ أولاً في كل جلسة
> آخر تحديث: 2026-05-05 (GTS Zone H1 ✅)
> ⚠️ لا تعدّل هذا الملف إلا بموافقة صريحة من أحمد

---

## 🏗️ ما تم بناؤه فعلاً (Phase 0–12 ✅ مكتملة)

### الـ Backend — `/home/areej/areej-pro/server/routes/inbox/` (17 ملف)
```
ai.js          ← AI Suggestions + Summary + Sentiment
analytics.js   ← تقارير كاملة (Overview, Agent, Channel, SLA, CSAT, Export)
automation.js  ← Keywords + Welcome/Away + Auto-close + Scheduled + Webhooks
broadcast.js   ← Broadcast V2 multi-platform
chatbot.js     ← Chatbot Flows (visual builder backend)
contacts.js    ← Contacts Page (P11-E2) — بحث + عرض + تعديل contacts
context.js     ← Customer Info + ERP Context + Orders + Payment Links + Timeline
conversations.js ← CRUD + Status + Priority + Snooze + Bulk + SLA + new-conversation
email.js       ← Email Channel (SMTP + IMAP)
index.js       ← Entry point + Auth middleware + loadInboxPermissions
labels.js      ← Labels CRUD + Assignment
messages.js    ← Send/Receive + Media + WA Interactive + Catalog
permissions.js ← loadInboxPermissions middleware + requirePermission + inbox_roles
search.js      ← Quick + Deep search
settings.js    ← Roles API + Users API + Org + Channels + Inbox Settings + Automation Hub
stream.js      ← SSE real-time endpoint (10 event types)
team.js        ← Assignment + Status + Collision + Transfer
utils/         ← مساعدات مشتركة
```

### الـ Frontend — `/home/areej/areej-pro/public/dashboard/inbox-v4/`
```
ai.js          ← AI UI
analytics.js   ← Analytics UI
api.js         ← كل الـ fetch calls (InboxAPI layer — 762+ سطر)
app.js         ← Entry point + init + new-conv-btn modal
automation.js  ← Automation UI
broadcast.js   ← Broadcast UI
catalog.js     ← WA Catalog UI
chatbot.js     ← Chatbot Flow Builder UI
chat.js        ← Chat Window + Message Rendering + Collision
context.js     ← Context Panel (7 tabs: contact/invoices/orders/pay/clv/notes/timeline)
conv-list.js   ← Conversations List + Filters + Bulk Actions
email.js       ← Email UI
inbox.css      ← الـ stylesheet الكامل (1238+ سطر)
index.html     ← Layout (3 columns + shell) — ?v=20260505
interactive.js ← WA Interactive Messages UI
labels.js      ← Labels UI
reply.js       ← Reply + Note + @Mentions + Media (all platforms)
scheduled.js   ← Scheduled Messages UI
search.js      ← Search UI
store.js       ← InboxStore (Single Source of Truth)
stream.js      ← SSE receiver (10 event handlers)
team.js        ← Team Assignment + Status + Transfer UI
components/    ← مكونات مشتركة
settings/      ← Settings modules (8 ملفات — انظر أدناه)
```

### الـ Settings modules — `public/dashboard/inbox-v4/settings/`
```
automation-hub.js  ← Automation Hub UI
channels.js        ← Channels Settings UI
inbox-settings.js  ← Inbox Settings (Canned / SLA / Attrs / CSAT)
org.js             ← Organization Settings UI
roles.js           ← Roles Management UI
settings-page.js   ← Router: 5 tabs (org / team / channels / inbox / automation)
team.js            ← Team Settings UI
users.js           ← Users Management UI
```

### الـ Shell — `public/inbox-v4/`
```
index.html   ← Shell entry point
pages/       ← Shell pages
router.js    ← Client-side router
shell.css    ← Shell styles
shell.js     ← Shell init
```

---

## 🗄️ قاعدة البيانات — الواقع الفعلي

### نموذج البيانات
- **نوع DB:** SQLite (WAL mode) — قرار D-001
- **كل tenant له DB منفصلة** في: `/home/areej/areej-pro/data/tenants/<id>.db`
- **المسار:** `getTenantDb(req.user.id)` → يرجع الـ DB الصحيحة

### نظام المستخدمين الموجود فعلاً في tenant DB
```sql
-- tenant_users: المستخدمين
id, name, email, password, role_id, employee_id,
active, last_login, max_concurrent (=10 افتراضي),
inbox_active (=1 افتراضي), notify_telegram_id

-- tenant_roles: الأدوار (نظام permissions بـ JSON)
id, name, permissions (JSON), created_at
-- مثال permissions: {"invoices":true, "orders":true, "crm":false, ...}
```

### الأدوار الموجودة فعلاً في النظام
```
1 - مدير    (orders, products, suppliers)
2 - محاسب   (invoices, wallets, reports)
3 - مبيعات  (orders, products, crm, followup)
4 - مخزن    (orders, products, suppliers)
```

### نظام Inbox Auth (الوضع الفعلي — مُحدَّث 2026-05-05)
- `inbox_users` + `inbox_roles` جداول منفصلة في كل tenant DB
- `loadInboxPermissions` middleware مُطبَّق في `index.js` ✅
- `req.inboxUser` مُحقون بـ: `{ id, name, email, inbox_role_id, permissions, has_erp, has_payment }`
- `inbox_users` فارغة في معظم tenants → fallback mode (inbox_role_id=1 / owner)
- `inbox_roles` تحتوي على 4 أدوار افتراضية: Owner / Manager / Agent / Viewer

---

## 🔑 نظام الـ Auth الموجود (مُحدَّث 2026-05-05 ✅)

```javascript
// في server/routes/inbox/index.js — الترتيب الفعلي:
router.use(requireAuth);          // يتحقق من الـ JWT token
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);  // يحقن الـ tenant DB
  next();
});
router.use(inboxAuthAdapter);     // يُهيّئ req.inboxUser من req.user
router.use(loadInboxPermissions); // يُحمّل permissions من inbox_roles

// req.inboxUser يحتوي على:
// { id, name, email, inbox_role_id, permissions: {...}, has_erp, has_payment }
```

### الـ role checks الموجودة حالياً في الـ backend
```javascript
// ✅ الـ pattern الصحيح المُطبَّق الآن:
const isAdmin = req.inboxUser?.permissions?.team_manage === true;
// تم تصحيح req.user.role → req.inboxUser.permissions في GTS Zone A ✅
```

---

## 📋 الـ Tables الموجودة فعلاً في tenant DB (الكاملة — v44)

### Inbox v4 Core
```
inbox_conversations_v4          inbox_messages_v4
inbox_timeline_v4               inbox_agent_status_v4
inbox_conversation_labels       inbox_channel_settings_v4
inbox_labels                    inbox_conv_notes_v4
```

### Inbox Users & Permissions (جديد — GTS Zone A)
```
inbox_users     ← Inbox-specific agents (id, email, name, inbox_role_id, tenant_user_id)
inbox_roles     ← Inbox roles مع permissions JSON (Owner/Manager/Agent/Viewer)
```

### Automation & Bots
```
inbox_automation_v4             inbox_welcome_away_v4
inbox_auto_close_v4             inbox_keywords
inbox_chatbot_flows_v4          inbox_chatbot_steps_v4
inbox_chatbot_sessions_v4
```

### Broadcast & Scheduled
```
inbox_broadcasts_v4             inbox_broadcast_recipients_v4
inbox_broadcasts                inbox_broadcast_recipients  ← v3 (لا تمس)
inbox_scheduled_messages_v4     inbox_scheduled_reports_v4
```

### Channels & Settings
```
inbox_email_accounts_v4         inbox_email_messages_v4
inbox_channel_routing           inbox_settings
inbox_appearance_v4             inbox_business_days_v4
inbox_business_hours_v4
```

### SLA & CSAT & Custom Attrs
```
inbox_sla_policies_v4           inbox_csat_settings_v4
inbox_custom_attrs_v4           inbox_attr_values_v4
inbox_contact_attrs
```

### CRM & ERP Integration
```
inbox_team_channels             inbox_team_members
inbox_teams                     inbox_work_hours
inbox_distribution_settings     inbox_drip_campaigns
```

### Webhooks & Templates
```
inbox_webhooks_v4               inbox_webhook_logs_v4
inbox_templates
```

### Misc
```
inbox_migration_log             inbox_notes  ← v3 (لا تمس)
inbox_conversations             ← v3 (لا تمس)
inbox_messages                  ← v3 (لا تمس)
inbox_agent_status              ← v3 (لا تمس)
inbox_chatbot_flows             ← v3 (لا تمس)
tenant_users                    tenant_roles
tenant_profile
```

### ⚠️ تصحيحات columns مهمة (محققة في GTS Zone B)
- `inbox_channel_settings_v4.channel` (ليس `channel_type`)
- `inbox_channel_settings_v4.active` (ليس `is_active`)
- `inbox_timeline_v4.data` (ليس `meta`) — تم إصلاح timeline endpoint ✅
- settings.js يعمل mapping: channel→channel_type، active→is_active في الـ response

---

## ⚠️ المخاطر المعروفة

| الخطر | التفاصيل | الحل |
|---|---|---|
| v3 tables | inbox_conversations / messages / agent_status / chatbot_flows موجودة معاً | لا تمس v3 tables أبداً |
| inbox_users فارغة | 8 من 10 tenants في fallback mode | I2 سيعمل seed |
| تعديل SCHEMA.md | أي تعديل يؤثر على tenant DB الحية | موافقة أحمد أولاً |
| max_concurrent | tenant_users.max_concurrent = 10 افتراضي | استخدمه — لا تُعيد بناءه |
| inbox_active | tenant_users.inbox_active = تفعيل الموظف | استخدمه — لا تُعيد بناءه |

---

## 🎯 الوضع الحالي (2026-05-05)

### ✅ مكتمل (GTS Zones A-G)
- Auth Unification: `loadInboxPermissions` مُطبَّق + `req.user.role` مُصحَّح
- Schema Audit: كل columns صحيحة + timeline bug مُصلَّح
- API Contract: كل endpoints موجودة + POST /new-conversation مُضافة
- UI Bindings: كل buttons مربوطة + new-conv modal مبني
- ERP Integration: context panel 7 tabs يعملون
- SSE: 10 events backend ↔ frontend مطابقة
- Performance: cache-busting ?v=20260505 + analytics 12ms

### 🔴 باقي للتنفيذ (GTS Zone H + I)
- H2: تحديث DECISIONS.md
- H3: تحديث SCHEMA.md
- I1: هجرة باقي 28 tenant لـ v4
- I2: inbox_users seed لكل tenant
- I3: Meta Business Verification docs
