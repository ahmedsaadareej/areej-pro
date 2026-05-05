# GROUND_TRUTH.md — الحقائق الثابتة للمشروع
> هذا الملف يُقرأ أولاً في كل جلسة Phase 9+
> آخر تحديث: 2026-05-05 (H1 — Zone H Sync)
> ⚠️ لا تعدّل هذا الملف إلا بموافقة صريحة من أحمد

---

## 🏗️ ما تم بناؤه فعلاً (Phase 0–12 ✅ مكتملة)

### الـ Backend — `/home/areej/areej-pro/server/routes/inbox/`
```
ai.js          ← AI Suggestions + Summary + Sentiment
analytics.js   ← تقارير كاملة (Overview, Agent, Channel, SLA, CSAT, Export, Scheduled)
automation.js  ← Keywords + Welcome/Away + Auto-close + Scheduled + Webhooks
broadcast.js   ← Broadcast V2 multi-platform
chatbot.js     ← Chatbot Flows (visual builder backend)
contacts.js    ← صفحة Contacts — إدارة جهات الاتصال (P11-E2) ✅ جديد
context.js     ← Customer Info + CRM + Orders + Payment Links + Timeline
conversations.js ← CRUD + Status + Priority + Snooze + Bulk + SLA
email.js       ← Email Channel (SMTP + IMAP)
index.js       ← Entry point + Auth middleware + loadInboxPermissions
labels.js      ← Labels CRUD + Assignment
messages.js    ← Send/Receive + Media + WA Interactive + Catalog
permissions.js ← loadInboxPermissions middleware + requirePermission ✅ جديد
search.js      ← Quick + Deep search
settings.js    ← Settings API (Roles T05 + Users T06 + Channels + Org + Canned + SLA + Attrs + CSAT) ✅ موسَّع
stream.js      ← SSE real-time endpoint (Long Polling fallback لـ Cloudflare)
team.js        ← Assignment + Status + Collision + Transfer

utils/
  business-hours.js ← مساعد حساب ساعات العمل + SLA (M2 T37) ✅ جديد
```

### الـ Frontend — `/home/areej/areej-pro/public/dashboard/inbox-v4/`
```
ai.js          ← AI UI
analytics.js   ← Analytics UI (Overview + Charts + Scheduled Reports)
api.js         ← كل الـ fetch calls (InboxAPI layer) — 762+ سطر
app.js         ← Entry point + init
automation.js  ← Automation UI
broadcast.js   ← Broadcast UI
catalog.js     ← WA Catalog UI ✅ موجود (غير موثق سابقاً)
chatbot.js     ← Chatbot Flow Builder UI
chat.js        ← Chat Window + Message Rendering + Collision
context.js     ← Context Panel (Contact + Invoices + Orders + Pay + CLV + Notes + Timeline)
conv-list.js   ← Conversations List + Filters + Bulk Actions
email.js       ← Email UI
inbox.css      ← الـ stylesheet الكامل
index.html     ← Layout (3 columns + shell) — cache-busted ?v=20260505
interactive.js ← WA Interactive Messages UI ✅ موجود (غير موثق سابقاً)
labels.js      ← Labels UI
reply.js       ← Reply + Note + @Mentions + Media (whatsapp/telegram/instagram/messenger/email)
scheduled.js   ← Scheduled Messages UI ✅ موجود (غير موثق سابقاً)
search.js      ← Search UI
store.js       ← InboxStore (Single Source of Truth)
stream.js      ← SSE receiver + Long Polling fallback
team.js        ← Team Assignment + Status + Transfer UI

settings/
  settings-page.js   ← Shell رئيسي لصفحة الإعدادات (M2 T43) ✅ جديد
  org.js             ← إعدادات المؤسسة + ساعات العمل (M2 T44) ✅ جديد
  channels.js        ← إعدادات القنوات/التطبيقات (M2 T45) ✅ جديد
  inbox-settings.js  ← Canned + SLA + Custom Attrs + CSAT + Appearance (M2 T46) ✅ جديد
  team.js            ← غلاف قسم الفريق في Settings Shell (M2 T47) ✅ جديد
  automation-hub.js  ← غلاف Automation في Settings Shell (M2 T47) ✅ جديد
  roles.js           ← Roles CRUD UI (T10) ✅ جديد
  users.js           ← Users CRUD UI (T11) ✅ جديد

components/
  (فارغ حالياً — مخصص للمكونات المشتركة مستقبلاً)
```

---

## 🗄️ قاعدة البيانات — الواقع الفعلي

### نموذج البيانات
- **نوع DB:** SQLite (WAL mode) — قرار D-001
- **كل tenant له DB منفصلة** في: `/home/areej/areej-pro/data/tenants/<id>.db`
- **المسار:** `getTenantDb(req.user.id)` → يرجع الـ DB الصحيحة
- **آخر migration:** v44

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

### الأدوار الموجودة فعلاً في النظام (ERP)
```
1 - مدير    (orders, products, suppliers)
2 - محاسب   (invoices, wallets, reports)
3 - مبيعات  (orders, products, crm, followup)
4 - مخزن    (orders, products, suppliers)
```

### نظام Inbox Roles (جديد — مستقل عن ERP)
```sql
-- inbox_roles: أدوار الـ inbox (مستقلة عن tenant_roles)
id, name, description, is_system(0/1), permissions (JSON), created_at
-- 4 أدوار افتراضية مبنية في النظام (is_system=1)

-- inbox_users: مستخدمو الـ inbox
id, email, name, inbox_role_id (→inbox_roles), tenant_user_id (→tenant_users),
status (active/inactive), created_at, updated_at
-- inbox_users فارغة في معظم tenants → fallback mode
```

### ⚠️ ملاحظة نظام الـ Permissions
- `tenant_roles.permissions` تغطي **ERP modules** فقط
- `inbox_roles.permissions` تغطي **Inbox modules** فقط
- النظامان مستقلان — `permissions.js` middleware يقرأ من inbox_roles
- في حالة fallback (inbox_users فارغة): الكل يأخذ full permissions

---

## 🔑 نظام الـ Auth الموجود

```javascript
// في server/routes/inbox/index.js
router.use(requireAuth);  // يتحقق من الـ session
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);  // يحقن الـ tenant DB
  next();
});
router.use(loadInboxPermissions);  // يحقن req.inboxUser مع permissions

// req.user: { id, name, email, role_id, ... }  (من ERP auth)
// req.inboxUser: { id, name, email, inbox_role_id, permissions: {...} }
//   → إذا inbox_users فارغة: req.inboxUser.permissions = full access
```

---

## 📋 الـ Tables الموجودة فعلاً في tenant DB (Inbox-related — v44)

### Core Tables
```
inbox_conversations_v4      inbox_messages_v4
inbox_timeline_v4           inbox_agent_status_v4
inbox_conversation_labels   inbox_channel_settings_v4
inbox_labels                inbox_migration_log
```

### Automation & Messaging
```
inbox_automation_v4         inbox_keywords
inbox_welcome_away_v4       inbox_auto_close_v4
inbox_scheduled_messages_v4 inbox_drip_campaigns
inbox_templates
```

### Team & Routing
```
inbox_team_members          inbox_teams
inbox_team_channels         inbox_channel_routing
inbox_distribution_settings inbox_work_hours
```

### Chatbot
```
inbox_chatbot_flows_v4      inbox_chatbot_steps_v4
inbox_chatbot_sessions_v4
```

### Broadcast
```
inbox_broadcasts_v4         inbox_broadcast_recipients_v4
```

### Email
```
inbox_email_accounts_v4     inbox_email_messages_v4
```

### Permissions & Users (Inbox-native)
```
inbox_roles                 inbox_users
```

### Settings & Configuration
```
inbox_settings              inbox_appearance_v4
inbox_business_hours_v4     inbox_business_days_v4
inbox_canned_responses_v4   inbox_sla_policies_v4
inbox_custom_attrs_v4       inbox_attr_values_v4
inbox_csat_settings_v4
```

### Analytics
```
inbox_scheduled_reports_v4
inbox_conv_notes_v4
```

### Webhooks
```
inbox_webhooks_v4           inbox_webhook_logs_v4
```

### Contact Attrs (Legacy/Custom)
```
inbox_contact_attrs
```

### Legacy v3 Tables (لا تمسّها)
```
inbox_conversations         inbox_messages
inbox_broadcasts            inbox_broadcast_recipients
inbox_chatbot_flows         inbox_notes
inbox_agent_status
```

### ERP/CRM Tables (مرجع فقط)
```
tenant_users    tenant_roles    tenant_profile
crm_contacts    crm_contact_tags  crm_notes  crm_personas  crm_tags
hr_attendance   hr_employees    hr_payroll
payment_links   notifications   persons
order_forms     order_form_submissions
```

---

## ⚠️ تصحيحات مهمة (Column Names الفعلية)

| الجدول | Column الصحيح | Column الخاطئ (قديم) |
|--------|--------------|---------------------|
| inbox_channel_settings_v4 | `channel` | `channel_type` |
| inbox_channel_settings_v4 | `active` | `is_active` |
| inbox_timeline_v4 | لا يوجد `meta` | ~~`meta`~~ (حُذف في fix) |

> settings.js يعمل mapping عند الـ response: channel→channel_type، active→is_active (للتوافق مع frontend)

---

## ⚠️ المخاطر المعروفة

| الخطر | التفاصيل | الحل |
|---|---|---|
| v3 tables موجودة | inbox_conversations + inbox_messages v3 لا تزال موجودة | لا تمسّها |
| inbox_users فارغة | 8 من 10 tenants في fallback mode | I2 تعالجه |
| max_concurrent موجود | tenant_users.max_concurrent = Agent Capacity | استخدمه لا تُعيد بناؤه |
| inbox_active موجود | tenant_users.inbox_active = تفعيل الموظف | استخدمه لا تُعيد بناؤه |

---

## 🎯 ما Phase 9+ تفعله

✅ تعديل backend + frontend
✅ إضافة migrations
✅ توثيق القرارات في DECISIONS.md
✅ تحديث هذا الملف بعد كل تغيير جوهري

❌ لا تحذف migrations قديمة
❌ لا تعدل v3 tables
❌ لا تكسر tenant_roles/tenant_users
