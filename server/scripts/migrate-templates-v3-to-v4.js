'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const TENANTS_DIR = 'path.join(__dirname, '../../data/tenants')';
const dbs = fs.readdirSync(TENANTS_DIR)
  .filter(f => f.endsWith('.db') && !f.includes('.bak') && !f.includes('.backup'))
  .map(f => path.join(TENANTS_DIR, f));

let total = 0, migrated = 0;

for (const dbPath of dbs) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  try {
    // هل الجداول موجودة؟
    const hasTmpl = db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='inbox_templates'").get().n;
    const hasCanned = db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='inbox_canned_responses_v4'").get().n;
    
    if (!hasTmpl || !hasCanned) { db.close(); continue; }
    
    const templates = db.prepare('SELECT * FROM inbox_templates').all();
    if (!templates.length) { db.close(); continue; }
    
    const tenant = path.basename(dbPath, '.db');
    console.log(`\nTenant ${tenant}: ${templates.length} templates`);
    
    for (const t of templates) {
      // نحوِّل name لـ shortcut (آمن، slug-like)
      const shortcut = t.name.trim().toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\u0600-\u06ff]/g, '')
        .slice(0, 30) || `tmpl_${t.id}`;
      
      // هل موجود بالفعل؟
      const exists = db.prepare('SELECT id FROM inbox_canned_responses_v4 WHERE shortcut=?').get(shortcut);
      if (exists) {
        console.log(`  ⏭ Skip (exists): ${t.name} → ${shortcut}`);
        continue;
      }
      
      db.prepare(`
        INSERT INTO inbox_canned_responses_v4 (shortcut, name, content, category, platforms, created_at, updated_at)
        VALUES (?,?,?,'عام','[]',datetime('now'),datetime('now'))
      `).run(shortcut, t.name, t.content);
      
      console.log(`  ✅ Migrated: "${t.name}" → shortcut: ${shortcut}`);
      migrated++;
    }
    total += templates.length;
  } catch(e) {
    console.error(`  ❌ Error in ${dbPath}:`, e.message);
  }
  db.close();
}

console.log(`\n📊 Total: ${total} templates found, ${migrated} migrated to v4`);
