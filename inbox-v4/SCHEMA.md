# SCHEMA.md — تصميم قاعدة البيانات v4
> آخر تحديث: 2026-05-05 (H3 — إضافة جداول v25-v44 الناقصة)
> آخر migration مطبّق: **v44**

---

## جداول Inbox v4 (tenant DB — كل عميل منفصل)

---

### inbox_conversations_v4

```sql
CREATE TABLE IF NOT EXISTS inbox_conversations_v4 (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  platform             TEXT NOT NULL,               -- telegram | whatsapp | whatsapp_api | instagram | messenger | email
  sender_id            TEXT NOT NULL,               -- معرّف المرسل على المنصة
  sender_name          TEXT,
  sender_phone         TEXT,
  sender_avatar        TEXT,

  status               TEXT NOT NULL DEFAULT 'open', -- open | waiting | closed | snoozed
  priority             TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | urgent

  assigned_to_id       INTEGER,                     -- FK → sys_users.id
  assigned_team_id     INTEGER,                     -- للمستقبل (Teams feature)

  master_contact_id    INTEGER,                     -- FK → sys_contacts.id (ربط بـ CRM)

  label_id             INTEGER,                     -- FK → inbox_labels.id (primary label)

  unread_count         INTEGER NOT NULL DEFAULT 0,  -- رسائل العميل غير المقروءة
  unread_agent_count   INTEGER NOT NULL DEFAULT 0,  -- رسائل الفريق غير المقروءة

  snooze_until         INTEGER,                     -- Unix timestamp

  first_message_at     INTEGER,                     -- Unix timestamp (SLA: وقت أول رسالة)
  first_response_at    INTEGER,                     -- Unix timestamp (SLA: وقت أول رد)
  last_message_at      INTEGER,                     -- Unix timestamp
  last_message_text    TEXT,                        -- preview
  last_message_dir     TEXT,                        -- in | out
  resolved_at          INTEGER,                     -- Unix timestamp

  csat_sent            INTEGER NOT NULL DEFAULT 0,
  csat_token           TEXT,
  csat_score           INTEGER,
  csat_sent_at         INTEGER,

  source_platform      TEXT,                        -- المنصة الأصلية (لو مختلفة عن platform)
  channel_override     TEXT,                        -- منصة الرد المختارة يدوياً

  metadata             TEXT,                        -- JSON للبيانات الإضافية

  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_conv_v4_status    ON inbox_conversations_v4(status);
CREATE INDEX IF NOT EXISTS idx_conv_v4_platform  ON inbox_conversations_v4(platform);
CREATE INDEX IF NOT EXISTS idx_conv_v4_assigned  ON inbox_conversations_v4(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_conv_v4_label     ON inbox_conversations_v4(label_id);
CREATE INDEX IF NOT EXISTS idx_conv_v4_snooze    ON inbox_conversations_v4(snooze_until) WHERE snooze_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_v4_last_msg  ON inbox_conversations_v4(last_message_at DESC);
```

---

### inbox_messages_v4

```sql
CREATE TABLE IF NOT EXISTS inbox_messages_v4 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES inbox_conversations_v4(id) ON DELETE CASCADE,

  platform         TEXT NOT NULL,
  direction        TEXT NOT NULL,         -- in | out | note
  content          TEXT,
  content_type     TEXT NOT NULL DEFAULT 'text', -- text | image | video | audio | file | template | interactive | sticker

  media_url        TEXT,
  media_type       TEXT,
  media_size       INTEGER,
  media_filename   TEXT,

  platform_msg_id  TEXT,                  -- معرّف الرسالة على المنصة (للـ dedup)
  quoted_msg_id    INTEGER REFERENCES inbox_messages_v4(id),  -- quote/reply

  sender_id        TEXT,                  -- من أرسل (العميل أو الموظف)
  sender_name      TEXT,
  agent_id         INTEGER,               -- FK → sys_users.id (لو الموظف هو من أرسل)

  is_read          INTEGER NOT NULL DEFAULT 0,
  delivered_at     INTEGER,
  read_at          INTEGER,
  status           TEXT NOT NULL DEFAULT 'sent', -- pending | sent | delivered | read | failed

  metadata         TEXT,                  -- JSON (WA message types, IG story_reply, etc.)

  sent_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_msg_v4_conv     ON inbox_messages_v4(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_v4_platform_id ON inbox_messages_v4(platform, platform_msg_id);
CREATE INDEX IF NOT EXISTS idx_msg_v4_unread   ON inbox_messages_v4(conversation_id, is_read) WHERE is_read = 0;
```

---

### inbox_labels (يُبقى كما هو — متوافق مع v3)

```sql
-- موجود بالفعل في tenant DB
-- id, name, color, conv_count, created_at
```

---

### inbox_conversation_labels (many-to-many — جديد في v4)

```sql
CREATE TABLE IF NOT EXISTS inbox_conversation_labels (
  conversation_id  INTEGER NOT NULL REFERENCES inbox_conversations_v4(id) ON DELETE CASCADE,
  label_id         INTEGER NOT NULL REFERENCES inbox_labels(id) ON DELETE CASCADE,
  added_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (conversation_id, label_id)
);
```

---

### inbox_timeline_v4 (أحداث المحادثة)

```sql
CREATE TABLE IF NOT EXISTS inbox_timeline_v4 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES inbox_conversations_v4(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL, -- status_change | assigned | unassigned | label_added | label_removed | snoozed | unsnoozed | note | csat_sent
  actor_id         INTEGER,       -- FK → sys_users.id (من فعل الحدث)
  actor_name       TEXT,
  data             TEXT,          -- JSON (old_status, new_status, label_name, etc.)
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_timeline_v4_conv ON inbox_timeline_v4(conversation_id, created_at DESC);
```

---

### inbox_agent_status (v3 — legacy)

```sql
CREATE TABLE IF NOT EXISTS inbox_agent_status (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER UNIQUE,
  user_name   TEXT,
  status      TEXT DEFAULT 'online',
  updated_at  DATETIME DEFAULT (datetime('now'))
);
```

---

### inbox_agent_status_v4 (حالة الموظف — v4)

```sql
CREATE TABLE IF NOT EXISTS inbox_agent_status_v4 (
  agent_id   INTEGER PRIMARY KEY REFERENCES tenant_users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'offline',  -- online | busy | away | offline
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### inbox_channel_settings_v4 (بدل جدول inbox_settings الضخم)

```sql
CREATE TABLE IF NOT EXISTS inbox_channel_settings_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL UNIQUE, -- telegram | whatsapp_qr | whatsapp_api | instagram | messenger | email
  config      TEXT NOT NULL DEFAULT '{}', -- JSON
  active      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### inbox_automation_v4

```sql
CREATE TABLE IF NOT EXISTS inbox_automation_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL, -- keyword_reply | welcome | away | auto_close | chatbot_flow
  name        TEXT,
  config      TEXT NOT NULL DEFAULT '{}', -- JSON
  active      INTEGER NOT NULL DEFAULT 1,
  priority    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### inbox_users (Inbox Agents — جديد GTS Zone A)

```sql
CREATE TABLE inbox_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  inbox_role_id   INTEGER NOT NULL DEFAULT 4 REFERENCES inbox_roles(id),
  tenant_user_id  INTEGER DEFAULT NULL,           -- FK → tenant_users.id (اختياري)
  status          TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Indexes
CREATE UNIQUE INDEX idx_inbox_users_email ON inbox_users(email);
CREATE INDEX idx_inbox_users_tenant_user ON inbox_users(tenant_user_id) WHERE tenant_user_id IS NOT NULL;
CREATE INDEX idx_inbox_users_role ON inbox_users(inbox_role_id);
```

⚠️ ملاحظة: inbox_users فارغة في معظم tenants → النظام يعمل بـ fallback mode (owner permissions)

---

### inbox_roles (Inbox Permissions — جديد GTS Zone A)

```sql
CREATE TABLE inbox_roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  permissions TEXT    NOT NULL DEFAULT '{}',      -- JSON: {"team_manage":true, "bulk_action":true, ...}
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
-- الأدوار الافتراضية المسيدة (is_system=1):
-- 1: Owner    → كل permissions = true
-- 2: Manager  → team_manage + bulk + settings
-- 3: Agent    → reply + assign_self + notes
-- 4: Viewer   → read-only (default)
```

---

## ملاحظات التوافق

- `inbox_conversations_v4` منفصلة عن `inbox_conversations` الحالية (v3) — يعملان معاً
- Migration strategy: بناء الجداول الجديدة أولاً + قراءة v4 في الكود الجديد بينما v3 لا يتغير
- لما v4 يكتمل → migration script ينقل البيانات من v3 → v4 ثم يُحذف v3
- `master_contact_id` يُملأ تدريجياً (nullable) — لا يُكسر الـ existing data

---

## Migration Files المخططة

| # | الملف | الجداول |
|---|-------|---------|
| 001 | `001_init_conversations_v4.sql` | inbox_conversations_v4 |
| 002 | `002_init_messages_v4.sql` | inbox_messages_v4 |
| 003 | `003_init_timeline_v4.sql` | inbox_timeline_v4 |
| 004 | `004_init_agent_status.sql` | inbox_agent_status |
| 005 | `005_init_conv_labels.sql` | inbox_conversation_labels |
| 006 | `006_init_channel_settings_v4.sql` | inbox_channel_settings_v4 |
| 007 | `007_init_automation_v4.sql` | inbox_automation_v4 |

> ⚠️ ملاحظة: الـ migrations الفعلية موجودة في `server/migrations.js` (inline) — ليس ملفات منفصلة
> آخر version: **44**

---

## جداول Settings & Configuration (v25-v44)

---

### inbox_canned_responses_v4

```sql
CREATE TABLE inbox_canned_responses_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shortcut    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'عام',
  platforms   TEXT DEFAULT '[]',       -- JSON array of platforms
  created_by  INTEGER,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_canned_shortcut ON inbox_canned_responses_v4(shortcut);
CREATE INDEX idx_canned_category ON inbox_canned_responses_v4(category);
```

---

### inbox_sla_policies_v4

```sql
CREATE TABLE inbox_sla_policies_v4 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  is_default       INTEGER NOT NULL DEFAULT 0,
  priority         TEXT DEFAULT 'all',   -- all | low | normal | high | urgent
  first_response   INTEGER NOT NULL DEFAULT 120,   -- minutes
  resolution_time  INTEGER NOT NULL DEFAULT 480,   -- minutes
  business_hours   INTEGER NOT NULL DEFAULT 0,     -- 0=calendar, 1=business hours only
  escalate_agent   INTEGER DEFAULT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);
```

---

### inbox_custom_attrs_v4

```sql
CREATE TABLE inbox_custom_attrs_v4 (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_type  TEXT NOT NULL CHECK(attr_type IN ('conversation','contact')),
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',  -- text | number | date | boolean | list
  options    TEXT DEFAULT '[]',             -- JSON array (for list type)
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_custom_attrs_key ON inbox_custom_attrs_v4(attr_type, key);
```

---

### inbox_attr_values_v4

```sql
CREATE TABLE inbox_attr_values_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_id     INTEGER NOT NULL REFERENCES inbox_custom_attrs_v4(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('conversation','contact')),
  entity_id   INTEGER NOT NULL,
  value       TEXT,
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_attr_values_unique ON inbox_attr_values_v4(attr_id, entity_id);
```

---

### inbox_appearance_v4 (singleton — id=1)

```sql
CREATE TABLE inbox_appearance_v4 (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  density     TEXT DEFAULT 'comfy' CHECK(density IN ('comfy','compact')),
  font_size   INTEGER DEFAULT 14,
  show_avatar INTEGER DEFAULT 1
);
```

---

### inbox_business_hours_v4 (singleton — id=1)

```sql
CREATE TABLE inbox_business_hours_v4 (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  timezone TEXT DEFAULT 'Africa/Cairo',
  active   INTEGER DEFAULT 0    -- 0=disabled, 1=enabled
);
```

---

### inbox_business_days_v4 (7 rows — day_of_week 0-6)

```sql
CREATE TABLE inbox_business_days_v4 (
  day_of_week INTEGER PRIMARY KEY,  -- 0=Sunday ... 6=Saturday
  is_working  INTEGER DEFAULT 1,
  start_time  TEXT DEFAULT '09:00',
  end_time    TEXT DEFAULT '17:00'
);
```

---

### inbox_csat_settings_v4 (singleton — id=1)

```sql
CREATE TABLE inbox_csat_settings_v4 (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  enabled       INTEGER DEFAULT 0,
  trigger       TEXT DEFAULT 'on_close' CHECK(trigger IN ('on_close','on_resolve','manual')),
  delay_minutes INTEGER DEFAULT 0,
  message       TEXT DEFAULT 'كيف كانت تجربتك معنا؟',
  scale         INTEGER DEFAULT 5 CHECK(scale IN (3, 5, 10))
);
```

---

### inbox_scheduled_reports_v4

```sql
CREATE TABLE inbox_scheduled_reports_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK(report_type IN ('overview','agents','sla','csat','labels','automation','full')),
  frequency   TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
  send_hour   INTEGER NOT NULL DEFAULT 8 CHECK(send_hour BETWEEN 0 AND 23),
  send_day    INTEGER CHECK(send_day BETWEEN 0 AND 6),  -- NULL for daily
  recipients  TEXT NOT NULL,   -- JSON array of emails
  format      TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','pdf')),
  active      INTEGER NOT NULL DEFAULT 1,
  last_sent   INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by  INTEGER
);
CREATE INDEX idx_scheduled_reports_active ON inbox_scheduled_reports_v4(active, send_hour);
```

---

### inbox_channel_routing (routing platform → team)

```sql
CREATE TABLE inbox_channel_routing (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  platform  TEXT NOT NULL UNIQUE,
  team_id   INTEGER REFERENCES inbox_teams(id) ON DELETE SET NULL
);
```

---

### inbox_team_channels (platforms per team)

```sql
CREATE TABLE inbox_team_channels (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id   INTEGER NOT NULL REFERENCES inbox_teams(id) ON DELETE CASCADE,
  platform  TEXT NOT NULL,
  UNIQUE(team_id, platform)
);
```

---

### inbox_drip_campaigns

```sql
CREATE TABLE inbox_drip_campaigns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  trigger    TEXT DEFAULT 'new_contact',  -- new_contact | manual
  steps      TEXT,   -- JSON array: [{delay_minutes, message}]
  active     INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

### inbox_migration_log (سجل هجرة v3→v4)

```sql
CREATE TABLE inbox_migration_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  migrated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  conv_count  INTEGER NOT NULL DEFAULT 0,
  msg_count   INTEGER NOT NULL DEFAULT 0,
  mode        TEXT NOT NULL,   -- dry-run | execute
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed
  error_msg   TEXT
);
CREATE INDEX idx_migration_log_tenant ON inbox_migration_log(tenant_id, migrated_at);
```

---

### inbox_settings (legacy singleton — v3 + v4 columns)

```sql
-- جدول قديم يُعدَّل بـ ALTER TABLE في كل migration
-- كل الـ config الحساسة (tokens) مخزنة هنا حتى يكتمل inbox_channel_settings_v4
CREATE TABLE inbox_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  -- Telegram
  telegram_token  TEXT,
  telegram_active INTEGER DEFAULT 0,
  -- WhatsApp QR
  wa_qr_active    INTEGER DEFAULT 0,
  -- WhatsApp Business API
  wa_phone_id     TEXT,
  wa_account_id   TEXT,
  wa_token        TEXT,
  wa_active       INTEGER DEFAULT 0,
  -- WhatsApp API (legacy)
  wa_api_token    TEXT,
  wa_api_active   INTEGER DEFAULT 0,
  -- Meta (Facebook/Messenger)
  meta_token      TEXT,
  meta_page_id    TEXT,
  meta_active     INTEGER DEFAULT 0,
  -- Instagram
  ig_token        TEXT,
  ig_account_id   TEXT,
  ig_active       INTEGER DEFAULT 0,
  -- Chatbot
  chatbot_active  INTEGER DEFAULT 0,
  chatbot_trigger TEXT DEFAULT 'مرحبا',
  -- SLA
  sla_minutes     INTEGER DEFAULT 120,
  -- Welcome/Away
  welcome_active  INTEGER DEFAULT 0,
  welcome_message TEXT,
  away_active     INTEGER DEFAULT 0,
  away_message    TEXT,
  away_start      TEXT DEFAULT '22:00',
  away_end        TEXT DEFAULT '09:00',
  away_message_workhours TEXT,
  -- Work Hours
  work_hours_active INTEGER DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

⚠️ ملاحظة: settings.js يقرأ من `inbox_settings` لكن يعرض البيانات كـ `channel_settings` مموحَّدة في الـ response
