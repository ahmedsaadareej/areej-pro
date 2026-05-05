# GROUND_TRUTH.md — الحقائق الثابتة للمشروع
> هذا الملف يُقرأ أولاً في كل جلسة Phase 9
> آخر تحديث: 2026-05-04
> ⚠️ لا تعدّل هذا الملف إلا بموافقة صريحة من أحمد

---

## 🏗️ ما تم بناؤه فعلاً (Phase 0–8 ✅ مكتملة)

### الـ Backend — `/home/areej/areej-pro/server/routes/inbox/`
```
ai.js          ← AI Suggestions + Summary + Sentiment
analytics.js   ← تقارير كاملة (Overview, Agent, Channel, SLA, CSAT, Export)
automation.js  ← Keywords + Welcome/Away + Auto-close + Scheduled + Webhooks
broadcast.js   ← Broadcast V2 multi-platform
chatbot.js     ← Chatbot Flows (visual builder backend)
context.js     ← Customer Info + CRM + Orders + Payment Links
conversations.js ← CRUD + Status + Priority + Snooze + Bulk + SLA
email.js       ← Email Channel (SMTP + IMAP)
index.js       ← Entry point + Auth middleware
labels.js      ← Labels CRUD + Assignment
messages.js    ← Send/Receive + Media + WA Interactive + Catalog
search.js      ← Quick + Deep search
stream.js      ← SSE real-time endpoint
team.js        ← Assignment + Status + Collision + Transfer
```

### الـ Frontend — `/home/areej/areej-pro/public/dashboard/inbox-v4/`
```
ai.js          ← AI UI
analytics.js   ← Analytics UI
api.js         ← كل الـ fetch calls (InboxAPI layer)
app.js         ← Entry point + init
automation.js  ← Automation UI
broadcast.js   ← Broadcast UI
catalog.js     ← WA Catalog UI
chatbot.js     ← Chatbot Flow Builder UI
chat.js        ← Chat Window + Message Rendering + Collision
context.js     ← Context Panel (Customer + Orders + Notes + Timeline)
conv-list.js   ← Conversations List + Filters + Bulk Actions
email.js       ← Email UI
inbox.css      ← الـ stylesheet الكامل
index.html     ← Layout (3 columns + shell)
interactive.js ← WA Interactive Messages UI
labels.js      ← Labels UI
reply.js       ← Reply + Note + @Mentions + Media
scheduled.js   ← Scheduled Messages UI
search.js      ← Search UI
store.js       ← InboxStore (Single Source of Truth)
stream.js      ← SSE receiver
team.js        ← Team Assignment + Status + Transfer UI
components/    ← مكونات مشتركة
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

### ⚠️ ملاحظة مهمة للـ Phase 9
نظام الـ permissions الحالي في `tenant_roles` يغطي **ERP modules** فقط (invoices, orders, crm...).
الـ Inbox permissions **غير موجودة فيه الآن**.
M1 (نظام الصلاحيات) سيضيف inbox permissions لهذا النظام — **لا يستبدله**.

---

## 🔑 نظام الـ Auth الموجود

```javascript
// في server/routes/inbox/index.js
router.use(requireAuth);  // يتحقق من الـ session
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);  // يحقن الـ tenant DB
  next();
});

// req.user يحتوي على: { id, name, email, role_id, ... }
```

### الـ role checks الموجودة حالياً في الـ backend
```javascript
// في team.js — مثال على الـ pattern الحالي:
const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
// ⚠️ هذا pattern خاطئ — req.user.role غير موجود، الموجود هو role_id
// M1 سيصحح هذا
```

---

## 📋 الـ Tables الموجودة فعلاً في tenant DB (inbox-related)

```
inbox_conversations_v4      inbox_messages_v4
inbox_timeline_v4           inbox_agent_status_v4
inbox_conversation_labels   inbox_channel_settings_v4
inbox_automation_v4         inbox_labels
inbox_chatbot_flows_v4      inbox_chatbot_steps_v4
inbox_chatbot_sessions_v4   inbox_broadcasts_v4
inbox_broadcast_recipients_v4  inbox_scheduled_messages_v4
inbox_webhooks_v4           inbox_webhook_logs_v4
inbox_email_accounts_v4     inbox_email_messages_v4
inbox_conv_notes_v4         inbox_contact_attrs
inbox_welcome_away_v4       inbox_auto_close_v4
inbox_distribution_settings inbox_team_members
inbox_teams                 inbox_work_hours
inbox_keywords              inbox_templates
tenant_users                tenant_roles
tenant_profile
```

### ⚠️ تصحيح: inbox_channel_settings_v4
- اسم الـ column الفعلي في DB: `channel` (ليس `channel_type`)
- اسم الـ column الفعلي في DB: `active` (ليس `is_active`)
- الـ backend في settings.js يعمل mapping عند الـ response: channel→channel_type، active→is_active
- لا تعدل الـ migration — عدّل الـ query فقط

---

## ⚠️ المخاطر المعروفة التي يجب تجنبها في Phase 9

| الخطر | التفاصيل | الحل |
|---|---|---|
| تعارض مع tenant_roles | نظام Permissions موجود لكن بدون inbox | إضافة inbox keys — لا استبدال |
| req.user.role غير صحيح | الكود الحالي يبحث عن .role لكن الحقل هو role_id | M1 يصحح + يوحّد الـ pattern |
| max_concurrent موجود | tenant_users.max_concurrent = Agent Capacity جاهز | M1 يستخدمه — لا يُعيد بناؤه |
| inbox_active موجود | tenant_users.inbox_active = تفعيل الموظف في الـ inbox | M1 يستخدمه |
| جداول v3 + v4 موجودة معاً | inbox_conversations + inbox_conversations_v4 كلاهما موجود | لا تمس v3 tables |
| تعديل SCHEMA.md | أي تعديل يؤثر على tenant DB الحية | موافقة أحمد أولاً |

---

## 🎯 ما Phase 9 تفعله فقط

✅ تحليل + تخطيط معماري
✅ كتابة خطط تنفيذية تفصيلية في `inbox-v4/plans/`
✅ توثيق القرارات في `DECISIONS.md`

❌ لا كتابة كود
❌ لا تعديل على ملفات المشروع الحالية
❌ لا تشغيل migrations
