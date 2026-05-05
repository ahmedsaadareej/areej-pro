#!/usr/bin/env node
/**
 * run-all-migrations.js
 * يُشغّل schema migrations على كل tenant DBs
 * بيستدعي getTenantDb() مباشرة = migrations تُطبَّق تلقائياً
 * 
 * الاستخدام:
 *   node server/scripts/run-all-migrations.js
 * 
 * آخر تحديث: 2026-05-05 (P12-B1)
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const { getTenantDb } = require('../db-tenant');
const TENANTS_DIR = path.join(__dirname, '../../data/tenants');

// قائمة الـ tenant IDs من الـ .db files
const tenants = fs.readdirSync(TENANTS_DIR)
  .filter(f => f.match(/^\d+\.db$/))
  .map(f => parseInt(f.replace('.db', '')))
  .sort((a, b) => a - b);

console.log(`\n🔄 تشغيل migrations على ${tenants.length} tenant...\n`);

let ok = 0, failed = 0;
for (const id of tenants) {
  try {
    const db = getTenantDb(id);
    const row = db.prepare("SELECT MAX(version) as v FROM schema_versions").get();
    console.log(`  ✅ Tenant ${String(id).padEnd(6)} → schema v${row.v}`);
    ok++;
  } catch(e) {
    console.log(`  ❌ Tenant ${String(id).padEnd(6)} → ERROR: ${e.message}`);
    failed++;
  }
}
console.log(`\n${ok > 0 ? '✅' : '⚠️'} انتهى — ${ok} ناجح، ${failed} فشل\n`);
process.exit(failed > 0 ? 1 : 0);
