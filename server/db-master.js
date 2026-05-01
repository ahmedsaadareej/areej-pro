/**
 * Master DB — يخزّن اليوزرز والاشتراكات والبروموكودات
 * كل عميل عنده DB منفصلة في data/tenants/{user_id}.db
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');

[DATA_DIR, TENANTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const master = new Database(path.join(DATA_DIR, 'master.db'));
master.pragma('journal_mode = WAL');
master.pragma('foreign_keys = ON');

// ── Tables ──────────────────────────────────────────────────────────────
master.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT,
    password    TEXT NOT NULL,
    role        TEXT DEFAULT 'user' CHECK(role IN ('user','admin')),
    status      TEXT DEFAULT 'trial' CHECK(status IN ('trial','active','expired','suspended')),
    plan        TEXT DEFAULT NULL CHECK(plan IN ('monthly','yearly','lifetime', NULL)),
    trial_ends  TEXT,
    plan_ends   TEXT,
    promo_used   TEXT,
    slug         TEXT UNIQUE,
    company_name TEXT,
    logo_url     TEXT,
    brand_color  TEXT DEFAULT '#1B5E30',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL CHECK(name IN ('monthly','yearly','lifetime')),
    price       INTEGER NOT NULL,
    duration_days INTEGER,
    active      INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL CHECK(type IN ('percent','fixed')),
    value       INTEGER NOT NULL,
    max_uses    INTEGER DEFAULT NULL,
    per_user    INTEGER DEFAULT 0,
    used_count  INTEGER DEFAULT 0,
    valid_from  TEXT DEFAULT (datetime('now')),
    valid_until TEXT DEFAULT NULL,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_uses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    promo_id    INTEGER REFERENCES promo_codes(id),
    user_id     INTEGER REFERENCES users(id),
    used_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    plan        TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    promo_id    INTEGER REFERENCES promo_codes(id),
    discount    INTEGER DEFAULT 0,
    method      TEXT DEFAULT 'manual',
    paymob_ref  TEXT,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    paid_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    code        TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ── Seed default plans ───────────────────────────────────────────────────
const existingPlans = master.prepare('SELECT COUNT(*) as n FROM plans').get().n;
if (existingPlans === 0) {
  const ins = master.prepare('INSERT INTO plans (name, price, duration_days) VALUES (?,?,?)');
  ins.run('monthly',  9900,  30);
  ins.run('yearly',   79900, 365);
  ins.run('lifetime', 149900, null);
  console.log('[Master DB] Default plans seeded');
}

// ── Seed admin user ──────────────────────────────────────────────────────
const adminExists = master.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (!adminExists) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('areej_admin_2026', 10);
  master.prepare(`
    INSERT INTO users (name, email, phone, password, role, status, plan)
    VALUES ('أريج Admin', 'ops@areejegypt.com', '01222784206', ?, 'admin', 'active', 'lifetime')
  `).run(hash);
  console.log('[Master DB] Admin user seeded');
}

console.log('[Master DB] Ready');
// ── Migrations ──────────────────────────────────────────────────────────
const userMigrations = [
  "ALTER TABLE users ADD COLUMN slug TEXT",
  "ALTER TABLE users ADD COLUMN company_name TEXT",
  "ALTER TABLE users ADD COLUMN logo_url TEXT",
  "ALTER TABLE users ADD COLUMN brand_color TEXT DEFAULT '#1B5E30'",
];
for (const sql of userMigrations) {
  try { master.prepare(sql).run(); } catch(e) { /* already exists */ }
}

// Create unique index on slug if not exists
try { master.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_slug ON users(slug) WHERE slug IS NOT NULL"); } catch(e) { console.error('[db-master.js]', e.message); }

module.exports = master;
