/**
 * Areej Pro — Database Migration System
 * ══════════════════════════════════════
 * كل migration ليه رقم version فريد.
 * بيشتغل مرة واحدة بس على كل DB (tenant أو master).
 * آمن للتشغيل المتكرر — بيشيك على schema_versions أولاً.
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// MASTER DB MIGRATIONS
// ══════════════════════════════════════════════════════════════
const MASTER_MIGRATIONS = [
  // v1: initial schema — already in db-master.js seed
  // أضف هنا لما تضيف columns جديدة على master DB
  // { version: 2, sql: "ALTER TABLE users ADD COLUMN new_column TEXT" },
];

// ══════════════════════════════════════════════════════════════
// TENANT DB MIGRATIONS
// ══════════════════════════════════════════════════════════════
const TENANT_MIGRATIONS = [
  // v1: initial schema — already in db-tenant.js seed

  // v2: inbox media support
  { version: 2, sqls: [
    "ALTER TABLE inbox_messages ADD COLUMN media_url TEXT",
    "ALTER TABLE inbox_messages ADD COLUMN media_type TEXT",
    "ALTER TABLE inbox_messages ADD COLUMN file_id TEXT",
  ]},

  // v3: inbox conversation management
  { version: 3, sqls: [
    "ALTER TABLE inbox_conversations ADD COLUMN assigned_to_id INTEGER",
    "ALTER TABLE inbox_conversations ADD COLUMN assigned_to_name TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN status TEXT DEFAULT 'open'",
  ]},

  // v4: inbox settings extended (welcome/away/chatbot)
  { version: 4, sqls: [
    "ALTER TABLE inbox_settings ADD COLUMN welcome_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN welcome_message TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN away_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN away_message TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN away_start TEXT DEFAULT '22:00'",
    "ALTER TABLE inbox_settings ADD COLUMN away_end TEXT DEFAULT '09:00'",
    "ALTER TABLE inbox_settings ADD COLUMN chatbot_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN chatbot_trigger TEXT",
  ]},

  // v5: inbox settings — Meta/Instagram/WhatsApp columns
  { version: 5, sqls: [
    "ALTER TABLE inbox_settings ADD COLUMN ig_token TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN ig_account_id TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN ig_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN wa_phone_id TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN wa_account_id TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN wa_token TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN wa_active INTEGER DEFAULT 0",
  ]},

  // v6: inbox SLA
  { version: 6, sqls: [
    "ALTER TABLE inbox_settings ADD COLUMN sla_minutes INTEGER DEFAULT 120",
  ]},

  // v7: inbox messages — is_read column
  { version: 7, sqls: [
    "ALTER TABLE inbox_messages ADD COLUMN is_read INTEGER DEFAULT 0",
  ]},

  // v8: CRM contacts — extra fields
  { version: 8, sqls: [
    "ALTER TABLE crm_contacts ADD COLUMN company_name TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN governorate TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN address TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN birthday TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN balance REAL DEFAULT 0",
  ]},

  // v9: inbox broadcasts — tracking columns
  { version: 9, sqls: [
    "ALTER TABLE inbox_broadcasts ADD COLUMN total_recipients INTEGER DEFAULT 0",
    "ALTER TABLE inbox_broadcasts ADD COLUMN sent_count INTEGER DEFAULT 0",
    "ALTER TABLE inbox_broadcasts ADD COLUMN failed_count INTEGER DEFAULT 0",
  ]},

  // v10: sys_orders — extra fields
  { version: 10, sqls: [
    "ALTER TABLE sys_orders ADD COLUMN contact_id INTEGER",
    "ALTER TABLE sys_orders ADD COLUMN shipping_co TEXT",
    "ALTER TABLE sys_orders ADD COLUMN tracking_no TEXT",
  ]},

  // v11: inbox notes
  { version: 11, sqls: [
    `CREATE TABLE IF NOT EXISTS inbox_notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      author_id       INTEGER,
      created_at      TEXT DEFAULT (datetime('now'))
    )`,
  ]},

  // v12: CSAT
  { version: 12, sqls: [
    "ALTER TABLE inbox_conversations ADD COLUMN csat_token TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_score INTEGER",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_comment TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_sent_at TEXT",
  ]},

  // v13: inbox conversations — archived flag
  { version: 13, sqls: [
    "ALTER TABLE inbox_conversations ADD COLUMN is_archived INTEGER DEFAULT 0",
  ]},

  // v14: sys_shipments — extended
  { version: 14, sqls: [
    "ALTER TABLE sys_orders ADD COLUMN shipment_id INTEGER",
  ]},

  // v15: sys_suppliers — extended fields for full supplier management
  { version: 15, sqls: [
    "ALTER TABLE sys_suppliers ADD COLUMN whatsapp TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN city TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN category TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN products TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN rating INTEGER DEFAULT 3",
    "ALTER TABLE sys_suppliers ADD COLUMN active INTEGER DEFAULT 1",
    "ALTER TABLE sys_suppliers ADD COLUMN company_name TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN contact_name TEXT",
  ]},

  // v16: sys_purchase_orders — purchase order management
  { version: 16, sqls: [
    `CREATE TABLE IF NOT EXISTS sys_po_seq (counter INTEGER DEFAULT 0)`,
    `INSERT OR IGNORE INTO sys_po_seq VALUES (0)`,
    `CREATE TABLE IF NOT EXISTS sys_purchase_orders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      po_no        TEXT,
      supplier_id  INTEGER REFERENCES sys_suppliers(id),
      status       TEXT DEFAULT 'draft',
      total        REAL DEFAULT 0,
      notes        TEXT,
      expected_at  TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sys_po_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id       INTEGER REFERENCES sys_purchase_orders(id) ON DELETE CASCADE,
      product_id  INTEGER REFERENCES sys_products(id),
      product_name TEXT,
      qty         REAL DEFAULT 0,
      unit_cost   REAL DEFAULT 0,
      total       REAL DEFAULT 0
    )`,
  ]},

  // v17 — Team Management System
  { version: 17, sqls: [
    // الفرق
    `CREATE TABLE IF NOT EXISTS inbox_teams (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      description  TEXT,
      supervisor_id INTEGER,
      color        TEXT DEFAULT '#1B5E30',
      active       INTEGER DEFAULT 1,
      created_at   TEXT DEFAULT (datetime('now'))
    )`,
    // أعضاء الفرق
    `CREATE TABLE IF NOT EXISTS inbox_team_members (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id          INTEGER NOT NULL REFERENCES inbox_teams(id) ON DELETE CASCADE,
      user_id          INTEGER NOT NULL,
      max_concurrent   INTEGER DEFAULT 10,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(team_id, user_id)
    )`,
    // القنوات المخصصة لكل فريق
    `CREATE TABLE IF NOT EXISTS inbox_team_channels (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id   INTEGER NOT NULL REFERENCES inbox_teams(id) ON DELETE CASCADE,
      platform  TEXT NOT NULL,
      UNIQUE(team_id, platform)
    )`,
    // إعدادات التوزيع
    `CREATE TABLE IF NOT EXISTS inbox_distribution_settings (
      id                  INTEGER PRIMARY KEY DEFAULT 1,
      method              TEXT DEFAULT 'manual',
      auto_assign_new     INTEGER DEFAULT 0,
      fallback_to_queue   INTEGER DEFAULT 1,
      max_concurrent      INTEGER DEFAULT 10,
      notify_telegram     INTEGER DEFAULT 0,
      updated_at          TEXT DEFAULT (datetime('now'))
    )`,
    `INSERT OR IGNORE INTO inbox_distribution_settings (id) VALUES (1)`,
    // توزيع القنوات على الفرق
    `CREATE TABLE IF NOT EXISTS inbox_channel_routing (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      platform  TEXT NOT NULL UNIQUE,
      team_id   INTEGER REFERENCES inbox_teams(id) ON DELETE SET NULL
    )`,
    // ساعات العمل
    `CREATE TABLE IF NOT EXISTS inbox_work_hours (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week  INTEGER NOT NULL,
      is_off       INTEGER DEFAULT 0,
      start_time   TEXT DEFAULT '09:00',
      end_time     TEXT DEFAULT '17:00'
    )`,
    // إدراج أيام الأسبوع الافتراضية (0=أحد ... 6=سبت)
    `INSERT OR IGNORE INTO inbox_work_hours (day_of_week, is_off, start_time, end_time) VALUES
      (0, 1, '09:00', '17:00'),
      (1, 0, '09:00', '17:00'),
      (2, 0, '09:00', '17:00'),
      (3, 0, '09:00', '17:00'),
      (4, 0, '09:00', '17:00'),
      (5, 0, '09:00', '17:00'),
      (6, 0, '09:00', '17:00')`,
    // رسالة خارج أوقات العمل — نضيفها لـ inbox_settings (بدون IF NOT EXISTS — better-sqlite3 مش بيدعمها)
    `ALTER TABLE inbox_settings ADD COLUMN away_message_workhours TEXT`,
    `ALTER TABLE inbox_settings ADD COLUMN work_hours_active INTEGER DEFAULT 0`,
    // إضافة حقول للمستخدمين
    `ALTER TABLE tenant_users ADD COLUMN max_concurrent INTEGER DEFAULT 10`,
    `ALTER TABLE tenant_users ADD COLUMN notify_telegram_id TEXT`,
    `ALTER TABLE tenant_users ADD COLUMN inbox_active INTEGER DEFAULT 1`,
    // inbox_agent_status — كانت بتتعمل inline في الـ route — نجيبها للـ migrations
    `CREATE TABLE IF NOT EXISTS inbox_agent_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      user_name TEXT,
      status TEXT DEFAULT 'online',
      updated_at DATETIME DEFAULT (datetime('now'))
    )`,
  ]},

  // أضف migrations جديدة هنا دايماً — لا تعدّل القديمة أبداً
];

// ══════════════════════════════════════════════════════════════
// RUNNER
// ══════════════════════════════════════════════════════════════

function ensureVersionTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
}

function getAppliedVersions(db) {
  return new Set(db.prepare('SELECT version FROM schema_versions').all().map(r => r.version));
}

function runMigrations(db, migrations, label) {
  ensureVersionTable(db);
  const applied = getAppliedVersions(db);
  let count = 0;

  for (const m of migrations) {
    if (applied.has(m.version)) continue;

    const sqls = m.sqls || (m.sql ? [m.sql] : []);
    const runMigration = db.transaction(() => {
      for (const sql of sqls) {
        try {
          db.exec(sql);
        } catch(e) {
          // Column already exists = ignore, anything else = rethrow
          if (!e.message.includes('duplicate column') && !e.message.includes('already exists')) {
            throw e;
          }
        }
      }
      db.prepare('INSERT OR IGNORE INTO schema_versions (version) VALUES (?)').run(m.version);
    });

    try {
      runMigration();
      count++;
    } catch(e) {
      console.error(`[Migrations] ❌ ${label} v${m.version} failed:`, e.message);
      throw e; // fatal — stop server startup
    }
  }

  if (count > 0) {
    console.log(`[Migrations] ✅ ${label}: applied ${count} migration(s)`);
  }
}

function runMasterMigrations(masterDb) {
  runMigrations(masterDb, MASTER_MIGRATIONS, 'master');
}

function runTenantMigrations(tenantDb, tenantId) {
  runMigrations(tenantDb, TENANT_MIGRATIONS, `tenant:${tenantId}`);
}

module.exports = { runMasterMigrations, runTenantMigrations, TENANT_MIGRATIONS };
