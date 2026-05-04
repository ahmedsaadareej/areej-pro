/**
 * seed-inbox-users.js
 * ينقل tenant_users إلى inbox_users لتفعيل نظام صلاحيات الـ Inbox
 *
 * الاستخدام:
 *   node server/scripts/seed-inbox-users.js --tenant=<id>       ← tenant واحد
 *   node server/scripts/seed-inbox-users.js --all               ← كل الـ tenants
 *   node server/scripts/seed-inbox-users.js --tenant=<id> --dry-run
 *
 * منطق التعيين:
 *   tenant_users.role_id = 1 (مدير)       → inbox_role_id = 1 (Owner)
 *   tenant_users.role_id = أي شيء آخر    → inbox_role_id = 4 (Agent) كـ default
 *
 * آخر تحديث: 2026-05-04 — Phase 11 B2
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ── إعدادات ────────────────────────────────────────────────────────────────
const TENANTS_DIR = path.join(__dirname, '../../data/tenants');

// خريطة tenant_roles → inbox_roles
// role_id=1 (مدير) يُعيَّن Owner، الباقي يُعيَّنون Agent
const ROLE_MAP = {
  1: 1, // مدير ERP → Owner في inbox
};
const DEFAULT_INBOX_ROLE = 4; // Agent

// ── تحليل الـ arguments ────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const isDry = args.includes('--dry-run');
const isAll = args.includes('--all');
const tenantArg = args.find(a => a.startsWith('--tenant='));
const tenantId  = tenantArg ? tenantArg.split('=')[1] : null;

if (!isAll && !tenantId) {
  console.error('❌ يجب تحديد --tenant=<id> أو --all');
  process.exit(1);
}

if (isDry) console.log('🔍 DRY RUN — لن يُكتب أي شيء\n');

// ── وظيفة seed لـ tenant واحد ───────────────────────────────────────────────
function seedTenant(id) {
  const dbPath = path.join(TENANTS_DIR, `${id}.db`);

  if (!fs.existsSync(dbPath)) {
    console.log(`⏭️  Tenant ${id}: DB غير موجودة — تخطي`);
    return;
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  // تحقق إن الجداول موجودة
  const tablesExist = db.prepare(
    "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name IN ('tenant_users','inbox_users','inbox_roles')"
  ).get();

  if (tablesExist.c < 3) {
    console.log(`⚠️  Tenant ${id}: جداول ناقصة (migration لسا ما اتطبق؟) — تخطي`);
    db.close();
    return;
  }

  // جلب كل tenant_users النشطين
  const tenantUsers = db.prepare(
    'SELECT id, name, email, role_id, active, inbox_active FROM tenant_users WHERE active = 1'
  ).all();

  if (tenantUsers.length === 0) {
    console.log(`ℹ️  Tenant ${id}: لا يوجد مستخدمون نشطون`);
    db.close();
    return;
  }

  console.log(`\n📋 Tenant ${id}: ${tenantUsers.length} مستخدم`);

  // تحقق إن inbox_roles مكتملة
  const rolesCount = db.prepare('SELECT COUNT(*) as c FROM inbox_roles').get();
  if (rolesCount.c === 0) {
    console.log(`❌ Tenant ${id}: inbox_roles فارغة — migration لم يُطبَّق`);
    db.close();
    return;
  }

  // إعداد الـ insert statement
  const insert = db.prepare(`
    INSERT OR IGNORE INTO inbox_users (email, name, inbox_role_id, tenant_user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
  `);

  let inserted = 0;
  let skipped  = 0;

  const txn = db.transaction(() => {
    for (const u of tenantUsers) {
      // تحديد الـ inbox role
      const inboxRoleId = ROLE_MAP[u.role_id] || DEFAULT_INBOX_ROLE;
      // حالة inbox: لو inbox_active=0 → inactive، غير ذلك → active
      const status = u.inbox_active === 0 ? 'inactive' : 'active';

      if (isDry) {
        console.log(
          `  [DRY] سيُضاف: ${u.email} | ${u.name} | tenant_role=${u.role_id} → inbox_role=${inboxRoleId} | status=${status}`
        );
        inserted++;
        return;
      }

      const result = insert.run(u.email, u.name, inboxRoleId, u.id, status);
      if (result.changes > 0) {
        console.log(`  ✅ أُضيف: ${u.email} → inbox_role=${inboxRoleId} (${status})`);
        inserted++;
      } else {
        console.log(`  ⏭️  موجود: ${u.email} — تخطي`);
        skipped++;
      }
    }
  });

  txn();

  // ملخص
  console.log(`\n  📊 Tenant ${id}: أُضيف ${inserted} | تخطي ${skipped}`);

  // تحقق نهائي
  if (!isDry) {
    const total = db.prepare('SELECT COUNT(*) as c FROM inbox_users').get();
    console.log(`  📦 إجمالي inbox_users: ${total.c}`);
  }

  db.close();
}

// ── نقطة الدخول ──────────────────────────────────────────────────────────────
if (isAll) {
  // كل الـ DBs الموجودة في مجلد tenants
  const files = fs.readdirSync(TENANTS_DIR)
    .filter(f => f.match(/^\d+\.db$/) && !f.includes('bak'))
    .map(f => f.replace('.db', ''));

  console.log(`🚀 seed لـ ${files.length} tenant(s): ${files.join(', ')}\n`);
  for (const id of files) seedTenant(id);
} else {
  seedTenant(tenantId);
}

console.log('\n✅ اكتمل seed-inbox-users');
