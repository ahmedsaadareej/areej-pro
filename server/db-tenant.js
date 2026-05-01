/**
 * Tenant DB — db منفصلة لكل عميل
 * كل عميل بياناته معزولة تماماً
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { runTenantMigrations } = require('./migrations');

const TENANTS_DIR = path.join(__dirname, '../data/tenants');
const cache = new Map(); // connection cache per user

function getTenantDb(userId) {
  if (cache.has(userId)) return cache.get(userId);

  const dbPath = path.join(TENANTS_DIR, `${userId}.db`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Schema (نفس السيستم الحالي تماماً) ─────────────────────────────
  db.exec(`
    -- المخزون
    CREATE TABLE IF NOT EXISTS sys_products (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      sku          TEXT,
      category     TEXT,
      unit         TEXT DEFAULT 'قطعة',
      cost_price   REAL DEFAULT 0,
      sell_price   REAL DEFAULT 0,
      stock_qty    REAL DEFAULT 0,
      low_stock_at REAL DEFAULT 5,
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_stock_moves (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES sys_products(id) ON DELETE CASCADE,
      type       TEXT CHECK(type IN ('in','out','adjust','return')),
      qty        REAL NOT NULL,
      note       TEXT,
      ref_type   TEXT,
      ref_id     INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- تسلسل الأرقام
    CREATE TABLE IF NOT EXISTS sys_invoice_seq (counter INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sys_po_seq     (counter INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sys_order_seq  (counter INTEGER DEFAULT 0);

    -- الفواتير
    CREATE TABLE IF NOT EXISTS sys_invoices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no   TEXT UNIQUE,
      client_name  TEXT,
      client_phone TEXT,
      client_email TEXT,
      contact_id   INTEGER,
      product_id   INTEGER,
      status       TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','cancelled')),
      total        REAL DEFAULT 0,
      notes        TEXT,
      wallet_id    INTEGER,
      payment_method TEXT,
      paid_at      TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_invoice_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES sys_invoices(id) ON DELETE CASCADE,
      name       TEXT,
      qty        REAL DEFAULT 1,
      price      REAL DEFAULT 0,
      total      REAL DEFAULT 0
    );

    -- الموردين
    CREATE TABLE IF NOT EXISTS sys_suppliers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT,
      email      TEXT,
      address    TEXT,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_purchase_orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      po_no          TEXT UNIQUE,
      supplier_id    INTEGER REFERENCES sys_suppliers(id),
      supplier_name  TEXT,
      status         TEXT DEFAULT 'pending' CHECK(status IN ('pending','received','cancelled')),
      total          REAL DEFAULT 0,
      notes          TEXT,
      wallet_id      INTEGER,
      payment_method TEXT,
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_purchase_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id       INTEGER REFERENCES sys_purchase_orders(id) ON DELETE CASCADE,
      product_id  INTEGER,
      product_name TEXT,
      qty         REAL DEFAULT 1,
      cost        REAL DEFAULT 0,
      total       REAL DEFAULT 0
    );

    -- الأوردرات
    CREATE TABLE IF NOT EXISTS sys_orders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no     TEXT UNIQUE,
      invoice_id   INTEGER REFERENCES sys_invoices(id),
      contact_id   INTEGER,
      client_name  TEXT,
      client_phone TEXT,
      status       TEXT DEFAULT 'new' CHECK(status IN ('new','processing','preparing','shipped','delivered','cancelled','returned')),
      shipping_co  TEXT,
      tracking_no  TEXT,
      notes        TEXT,
      total        REAL DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_order_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER REFERENCES sys_orders(id) ON DELETE CASCADE,
      status     TEXT,
      note       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- المتابعة
    CREATE TABLE IF NOT EXISTS sys_followup_rules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      trigger_type     TEXT CHECK(trigger_type IN ('after_order','no_order','birthday')),
      trigger_days     INTEGER DEFAULT 7,
      message_template TEXT,
      active           INTEGER DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_followup_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id    INTEGER REFERENCES sys_followup_rules(id),
      contact_id INTEGER,
      order_id   INTEGER REFERENCES sys_orders(id) ON DELETE SET NULL,
      sent_at    TEXT DEFAULT (datetime('now')),
      channel    TEXT DEFAULT 'whatsapp',
      status     TEXT DEFAULT 'sent'
    );

    -- الموزعين
    CREATE TABLE IF NOT EXISTS sys_affiliates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      phone           TEXT,
      whatsapp        TEXT,
      email           TEXT,
      code            TEXT UNIQUE,
      commission_rate REAL DEFAULT 10,
      notes           TEXT,
      active          INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_affiliate_orders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id      INTEGER REFERENCES sys_affiliates(id) ON DELETE CASCADE,
      order_id          INTEGER REFERENCES sys_orders(id) ON DELETE SET NULL,
      order_total       REAL DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      status            TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid')),
      description       TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    -- الخزينة
    CREATE TABLE IF NOT EXISTS sys_wallets (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      type    TEXT DEFAULT 'cash' CHECK(type IN ('cash','ewallet','bank','shipping_co','receivable','payable')),
      balance REAL DEFAULT 0,
      notes   TEXT,
      active  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sys_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id    INTEGER REFERENCES sys_wallets(id),
      wallet_to_id INTEGER REFERENCES sys_wallets(id),
      type         TEXT CHECK(type IN ('in','out','transfer')),
      amount       REAL NOT NULL,
      category     TEXT,
      notes        TEXT,
      ref_type     TEXT,
      ref_id       INTEGER,
      description  TEXT,
      date         TEXT DEFAULT (datetime('now','localtime')),
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- CRM
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT,
      email      TEXT,
      niche      TEXT,
      city       TEXT,
      source     TEXT DEFAULT 'manual',
      status     TEXT DEFAULT 'lead' CHECK(status IN ('lead','prospect','client','vip','inactive','cold')),
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crm_tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1'
    );

    CREATE TABLE IF NOT EXISTS crm_contact_tags (
      contact_id INTEGER REFERENCES crm_contacts(id) ON DELETE CASCADE,
      tag_id     INTEGER REFERENCES crm_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS crm_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER REFERENCES crm_contacts(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ════════════════════════════════════════
    -- MULTI-USER: موظفين وصلاحيات
    -- ════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS tenant_users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL UNIQUE,
      password       TEXT NOT NULL,
      password_plain TEXT,
      role_id        INTEGER REFERENCES tenant_roles(id) ON DELETE SET NULL,
      employee_id    INTEGER,
      active         INTEGER DEFAULT 1,
      last_login     TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ════════════════════════════════════════
    -- HR MODULE
    -- ════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS hr_employees (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      email           TEXT,
      phone           TEXT,
      national_id     TEXT,
      job_title       TEXT,
      department      TEXT,
      hire_date       TEXT,
      base_salary     REAL DEFAULT 0,
      salary_type     TEXT DEFAULT 'monthly' CHECK(salary_type IN ('monthly','daily','hourly')),
      active          INTEGER DEFAULT 1,
      system_user_id  INTEGER REFERENCES tenant_users(id) ON DELETE SET NULL,
      default_role_id INTEGER REFERENCES tenant_roles(id) ON DELETE SET NULL,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hr_attendance (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  INTEGER REFERENCES hr_employees(id) ON DELETE CASCADE,
      work_date    TEXT NOT NULL,
      check_in     TEXT,
      check_out    TEXT,
      status       TEXT DEFAULT 'present' CHECK(status IN ('present','absent','late','half','leave')),
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS hr_payroll (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id     INTEGER REFERENCES hr_employees(id) ON DELETE CASCADE,
      period_month    TEXT NOT NULL,
      base_salary     REAL DEFAULT 0,
      bonus           REAL DEFAULT 0,
      deductions      REAL DEFAULT 0,
      net_salary      REAL DEFAULT 0,
      days_worked     INTEGER DEFAULT 0,
      days_absent     INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'draft' CHECK(status IN ('draft','paid')),
      wallet_id       INTEGER REFERENCES sys_wallets(id),
      transaction_id  INTEGER,
      paid_at         TEXT,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, period_month)
    );

    CREATE TABLE IF NOT EXISTS crm_personas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id      INTEGER UNIQUE REFERENCES crm_contacts(id) ON DELETE CASCADE,
      age             INTEGER,
      gender          TEXT CHECK(gender IN ('male','female','other')),
      city            TEXT,
      job             TEXT,
      income_level    TEXT CHECK(income_level IN ('low','medium','high','very_high')),
      source          TEXT,
      motivation      TEXT,
      budget_min      REAL,
      budget_max      REAL,
      buy_frequency   TEXT CHECK(buy_frequency IN ('once','rare','monthly','frequent')),
      pain_points     TEXT,
      preferred_contact TEXT,
      notes           TEXT,
      updated_at      TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed sequences
  const seqs = ['sys_invoice_seq','sys_po_seq','sys_order_seq'];
  seqs.forEach(t => {
    const n = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n;
    if (n === 0) db.prepare(`INSERT INTO ${t} VALUES (0)`).run();
  });

  // Seed default wallets
  const wCount = db.prepare('SELECT COUNT(*) as n FROM sys_wallets').get().n;
  if (wCount === 0) {
    const ins = db.prepare('INSERT INTO sys_wallets (name,type) VALUES (?,?)');
    ins.run('كاش في الإيد','cash');
    ins.run('فودافون كاش','ewallet');
    ins.run('إنستا باي','ewallet');
    ins.run('شركات الشحن','shipping_co');
    ins.run('عملاء آجل','receivable');
    ins.run('مديونية موردين','payable');
  }

  // Seed default followup rules
  const fCount = db.prepare('SELECT COUNT(*) as n FROM sys_followup_rules').get().n;
  if (fCount === 0) {
    const ins = db.prepare('INSERT INTO sys_followup_rules (name,trigger_type,trigger_days,message_template) VALUES (?,?,?,?)');
    ins.run('متابعة بعد الشراء','after_order',3,'أهلاً {name}، نتمنى إنك بتستخدم منتجك. في أي استفسار إحنا موجودين 😊');
    ins.run('عميل غير نشط','no_order',30,'وحشتنا {name}! عندنا عروض جديدة تناسبك 🔥');
    ins.run('متابعة بعد أسبوع','after_order',7,'{name} عامل إيه مع المنتج؟ شاركنا رأيك واحصل على خصم 10% في أوردرك الجاي');
  }

  // Seed default roles
  const rCount = db.prepare('SELECT COUNT(*) as n FROM tenant_roles').get().n;
  if (rCount === 0) {
    const ins = db.prepare('INSERT INTO tenant_roles (name, permissions) VALUES (?,?)');
    ins.run('مدير', JSON.stringify({
      invoices:true, orders:true, products:true, suppliers:true,
      wallets:true, crm:true, affiliates:true, followup:true,
      hr:true, users:true, reports:true
    }));
    ins.run('محاسب', JSON.stringify({
      invoices:true, wallets:true, orders:false, products:false,
      suppliers:false, crm:false, affiliates:false, followup:false,
      hr:false, users:false, reports:true
    }));
    ins.run('مبيعات', JSON.stringify({
      invoices:false, wallets:false, orders:true, products:true,
      suppliers:false, crm:true, affiliates:false, followup:true,
      hr:false, users:false, reports:false
    }));
    ins.run('مخزن', JSON.stringify({
      invoices:false, wallets:false, orders:true, products:true,
      suppliers:true, crm:false, affiliates:false, followup:false,
      hr:false, users:false, reports:false
    }));
  }

  db.exec(`
    -- ════════════════════════════════════════
    -- UNIFIED INBOX
    -- ════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS inbox_conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      platform    TEXT NOT NULL,  -- telegram, whatsapp, messenger, instagram
      sender_id   TEXT NOT NULL,  -- platform-specific sender id
      sender_name TEXT,
      sender_phone TEXT,
      last_message TEXT,
      last_message_at TEXT,
      unread_count INTEGER DEFAULT 0,
      lead_id     INTEGER REFERENCES crm_contacts(id) ON DELETE SET NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      platform        TEXT NOT NULL,
      direction       TEXT NOT NULL,  -- in / out
      content         TEXT,
      message_type    TEXT DEFAULT 'text',  -- text / image / audio / file
      platform_msg_id TEXT,
      sent_at         TEXT DEFAULT (datetime('now')),
      is_read         INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inbox_settings (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      telegram_token  TEXT,
      telegram_active INTEGER DEFAULT 0,
      wa_qr_active    INTEGER DEFAULT 0,
      wa_api_token    TEXT,
      wa_api_active   INTEGER DEFAULT 0,
      meta_token      TEXT,
      meta_page_id    TEXT,
      meta_active     INTEGER DEFAULT 0,
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_drip_campaigns (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      trigger  TEXT DEFAULT 'new_contact',
      steps    TEXT,  -- JSON array: [{delay_minutes, message}]
      active   INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_contact_attrs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      attr_key        TEXT NOT NULL,
      attr_value      TEXT,
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE (conversation_id, attr_key)
    );

    CREATE TABLE IF NOT EXISTS inbox_broadcasts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      title             TEXT,
      message           TEXT NOT NULL,
      platform          TEXT DEFAULT 'telegram',
      audience          TEXT DEFAULT '"all"',
      status            TEXT DEFAULT 'draft',
      total_recipients  INTEGER DEFAULT 0,
      sent_count        INTEGER DEFAULT 0,
      failed_count      INTEGER DEFAULT 0,
      scheduled_at      TEXT,
      sent_at           TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_broadcast_recipients (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      broadcast_id INTEGER NOT NULL,
      contact_name TEXT,
      contact_phone TEXT,
      platform_id  TEXT,
      status       TEXT DEFAULT 'pending',
      error_msg    TEXT,
      sent_at      TEXT,
      FOREIGN KEY (broadcast_id) REFERENCES inbox_broadcasts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inbox_chatbot_flows (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_text   TEXT NOT NULL,
      response_text  TEXT NOT NULL,
      is_start       INTEGER DEFAULT 0,
      parent_id      INTEGER REFERENCES inbox_chatbot_flows(id) ON DELETE CASCADE,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_labels (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT DEFAULT '#1B5E30',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_conversation_labels (
      conversation_id INTEGER REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      label_id        INTEGER REFERENCES inbox_labels(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS inbox_notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      author_id       INTEGER,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_keywords (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword    TEXT NOT NULL,
      reply      TEXT NOT NULL,
      active     INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_templates (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      content   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ════════ PRODUCT CATEGORIES ════════
    CREATE TABLE IF NOT EXISTS product_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ════════ SHIPPING ════════
    CREATE TABLE IF NOT EXISTS sys_shipments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id         INTEGER REFERENCES sys_orders(id) ON DELETE SET NULL,
      company          TEXT NOT NULL,
      waybill_no       TEXT UNIQUE,
      receiver_name    TEXT,
      receiver_phone   TEXT,
      receiver_address TEXT,
      receiver_city    TEXT,
      weight           REAL DEFAULT 0.5,
      cod_amount       REAL DEFAULT 0,
      notes            TEXT,
      status           TEXT DEFAULT 'pending',
      updated_at       TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    -- ════════════════════════════════════════
    -- PERSONS — جدول موحد للعملاء والموردين
    -- ════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS persons (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name      TEXT NOT NULL,   -- اسم الشركة أو الاسم الكامل (إجباري)
      name              TEXT,            -- اسم جهة الاتصال (اختياري)
      phone             TEXT,
      phone_code        TEXT DEFAULT '+20',
      email             TEXT,
      country           TEXT DEFAULT 'EG',
      governorate       TEXT,
      city              TEXT,
      address           TEXT,
      roles             TEXT DEFAULT 'client',
      status            TEXT DEFAULT 'lead',
      source            TEXT DEFAULT 'manual',
      niche             TEXT,
      notes             TEXT,
      client_balance    REAL DEFAULT 0,
      supplier_balance  REAL DEFAULT 0,
      total_invoiced    REAL DEFAULT 0,
      total_paid        REAL DEFAULT 0,
      supplier_products TEXT,
      supplier_category TEXT,
      supplier_rating   REAL DEFAULT 0,
      legacy_contact_id  INTEGER,
      legacy_supplier_id INTEGER,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_phone ON persons(phone) WHERE phone IS NOT NULL;

    CREATE TABLE IF NOT EXISTS shipping_companies (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL,
      name_en               TEXT,
      logo_url              TEXT,
      api_endpoint          TEXT,
      api_key               TEXT,
      api_secret            TEXT,
      tracking_url_template TEXT,  -- e.g. https://bosta.co/tracking/{waybill}
      webhook_secret        TEXT,
      is_default            INTEGER DEFAULT 0,
      active                INTEGER DEFAULT 1,
      notes                 TEXT,
      created_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipping_settings (
      id               INTEGER PRIMARY KEY DEFAULT 1,
      bosta_api_key    TEXT,
      aramex_api_key   TEXT,
      jnt_api_key      TEXT,
      default_company  TEXT DEFAULT 'bosta',
      sender_name      TEXT,
      sender_phone     TEXT,
      sender_address   TEXT,
      updated_at       TEXT
    );

    -- ════════ PAYMENT LINKS + ORDER FORMS ════════
    CREATE TABLE IF NOT EXISTS payment_links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id  INTEGER REFERENCES sys_invoices(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      amount      REAL NOT NULL,
      client_name TEXT,
      client_phone TEXT,
      description TEXT,
      status      TEXT DEFAULT 'pending',  -- pending / paid / expired
      paid_at     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_forms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token       TEXT UNIQUE NOT NULL,
      title       TEXT NOT NULL,
      products    TEXT,  -- JSON array of products
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_form_submissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id     INTEGER REFERENCES order_forms(id) ON DELETE CASCADE,
      order_id    INTEGER,
      client_name TEXT,
      client_phone TEXT,
      client_address TEXT,
      items       TEXT,  -- JSON
      notes       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      body       TEXT,
      type       TEXT DEFAULT 'info',
      is_read    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_profile (
      id           INTEGER PRIMARY KEY DEFAULT 1,
      company_name TEXT,
      company_name_en TEXT,
      slug         TEXT,
      logo_url     TEXT,
      brand_color  TEXT DEFAULT '#1B5E30',
      address      TEXT,
      phone        TEXT,
      email        TEXT,
      website      TEXT,
      tax_number   TEXT,
      commercial_reg TEXT,
      invoice_notes  TEXT,
      updated_at   TEXT DEFAULT (datetime('now'))
    )
  `);
  // Seed profile row if empty
  const hasProfile = db.prepare('SELECT id FROM tenant_profile WHERE id=1').get();
  if (!hasProfile) db.prepare("INSERT INTO tenant_profile (id) VALUES (1)").run();

  // ── Migrations: add new columns safely
  // sys_invoices extra columns
  const invItemsMigrations = [
    "ALTER TABLE sys_invoice_items ADD COLUMN description TEXT",
    "ALTER TABLE sys_invoice_items ADD COLUMN unit_price REAL DEFAULT 0",
    "ALTER TABLE sys_invoice_items ADD COLUMN product_id INTEGER",
  ];
  for (const sql of invItemsMigrations) {
    try { db.prepare(sql).run(); } catch(e) { /* already exists */ }
  }

  const invMigrations = [
    "ALTER TABLE sys_invoices ADD COLUMN subtotal REAL DEFAULT 0",
    "ALTER TABLE sys_invoices ADD COLUMN discount REAL DEFAULT 0",
    "ALTER TABLE sys_invoices ADD COLUMN tax REAL DEFAULT 0",
    "ALTER TABLE sys_invoices ADD COLUMN client_address TEXT",
    "ALTER TABLE sys_invoices ADD COLUMN due_date TEXT",
  ];
  for (const sql of invMigrations) {
    try { db.prepare(sql).run(); } catch(e) { /* already exists */ }
  }
  const migrations = [
    "ALTER TABLE tenant_users ADD COLUMN password_plain TEXT",
    "ALTER TABLE hr_employees ADD COLUMN email TEXT",
    "ALTER TABLE hr_employees ADD COLUMN system_user_id INTEGER",
    "ALTER TABLE hr_employees ADD COLUMN default_role_id INTEGER",
    // sys_stock_moves missing columns
    "ALTER TABLE sys_stock_moves ADD COLUMN unit_cost REAL DEFAULT 0",
    "ALTER TABLE sys_stock_moves ADD COLUMN notes TEXT",
    // sys_orders: order type + production fields
    "ALTER TABLE sys_orders ADD COLUMN order_type TEXT DEFAULT 'stock'",
    "ALTER TABLE sys_orders ADD COLUMN production_notes TEXT",
    "ALTER TABLE sys_orders ADD COLUMN production_supplier TEXT",
    "ALTER TABLE sys_orders ADD COLUMN production_due_date TEXT",
    "ALTER TABLE sys_orders ADD COLUMN client_address TEXT",
    "ALTER TABLE sys_orders ADD COLUMN client_email TEXT",
    // sys_invoices: track who created the invoice
    "ALTER TABLE sys_invoices ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE sys_invoices ADD COLUMN created_by_name TEXT",
    // sys_products: image
    "ALTER TABLE sys_products ADD COLUMN image_url TEXT",
    // crm_contacts: رصيد الذمم
    "ALTER TABLE crm_contacts ADD COLUMN balance REAL DEFAULT 0",
    // unique index on phone
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(phone) WHERE phone IS NOT NULL",
    "ALTER TABLE crm_contacts ADD COLUMN total_invoiced REAL DEFAULT 0",
    "ALTER TABLE crm_contacts ADD COLUMN total_paid REAL DEFAULT 0",
    "ALTER TABLE crm_contacts ADD COLUMN address TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN governorate TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN company_name TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN contact_name TEXT",
    "ALTER TABLE crm_contacts ADD COLUMN country TEXT DEFAULT 'EG'",
    "ALTER TABLE crm_contacts ADD COLUMN phone_code TEXT DEFAULT '+20'",
    // sys_suppliers: extra fields
    "ALTER TABLE sys_suppliers ADD COLUMN address TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN governorate TEXT",
    "ALTER TABLE sys_suppliers ADD COLUMN country TEXT DEFAULT 'EG'",
    "ALTER TABLE sys_suppliers ADD COLUMN phone_code TEXT DEFAULT '+20'",
    "ALTER TABLE sys_suppliers ADD COLUMN person_id INTEGER",
    // inbox: broadcasts + chatbot settings
    "ALTER TABLE inbox_settings ADD COLUMN chatbot_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN chatbot_trigger TEXT DEFAULT 'مرحبا'",
    // inbox: extra columns
    "ALTER TABLE inbox_conversations ADD COLUMN assigned_to_id INTEGER",
    "ALTER TABLE inbox_conversations ADD COLUMN assigned_to_name TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN status TEXT DEFAULT 'open'",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_token TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_rating INTEGER",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_comment TEXT",
    "ALTER TABLE inbox_conversations ADD COLUMN csat_at TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN sla_minutes INTEGER DEFAULT 120",
    // inbox: auto-messages
    "ALTER TABLE inbox_settings ADD COLUMN welcome_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN welcome_message TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN away_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN away_message TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN away_start TEXT DEFAULT '22:00'",
    "ALTER TABLE inbox_settings ADD COLUMN away_end TEXT DEFAULT '09:00'",
    // inbox tables
    "ALTER TABLE inbox_settings ADD COLUMN wa_qr_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN wa_api_token TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN wa_api_active INTEGER DEFAULT 0",
    "ALTER TABLE inbox_settings ADD COLUMN meta_token TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN meta_page_id TEXT",
    "ALTER TABLE inbox_settings ADD COLUMN meta_active INTEGER DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { db.prepare(sql).run(); } catch(e) { /* column already exists — ignore */ }
  }

  // Seed default shipping companies
  try {
    const existingCos = db.prepare('SELECT COUNT(*) as c FROM shipping_companies').get().c;
    if (existingCos === 0) {
      const seedCos = [
        { name:'بوسطة', name_en:'Bosta', tracking_url_template:'https://bosta.co/tracking/{waybill}', api_endpoint:'https://app.bosta.co/api/v0', is_default:1 },
        { name:'Aramex', name_en:'Aramex', tracking_url_template:'https://www.aramex.com/track/results?ShipmentNumber={waybill}', api_endpoint:'https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc', is_default:0 },
        { name:'J&T Express', name_en:'J&T', tracking_url_template:'https://www.jtexpress.eg/track?billcodes={waybill}', api_endpoint:'', is_default:0 },
        { name:'Mylerz', name_en:'Mylerz', tracking_url_template:'https://app.mylerz.com/track/{waybill}', api_endpoint:'https://api.mylerz.com/v1', is_default:0 },
      ];
      const insComp = db.prepare('INSERT INTO shipping_companies (name,name_en,tracking_url_template,api_endpoint,is_default) VALUES (?,?,?,?,?)');
      seedCos.forEach(c => insComp.run(c.name,c.name_en,c.tracking_url_template,c.api_endpoint,c.is_default));
    }
  } catch(e) { console.error('[db-tenant.js]', e.message); }

  cache.set(userId, db);
  // ── New versioned migration system ────────────────────────────────
  // بيشتغل بالتوازي مع الـ legacy migrations فوق — مفيشش تعارض
  try { runTenantMigrations(db, userId); } catch(e) { console.error('[DB] Migration error tenant', userId, e.message); }

  return db;
}

module.exports = { getTenantDb };

