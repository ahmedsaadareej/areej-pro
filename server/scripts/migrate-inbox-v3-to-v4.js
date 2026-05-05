#!/usr/bin/env node
/**
 * migrate-inbox-v3-to-v4.js
 * هجرة بيانات Inbox من v3 (inbox_conversations + inbox_messages)
 * إلى v4 (inbox_conversations_v4 + inbox_messages_v4)
 *
 * الاستخدام:
 *   node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --dry-run
 *   node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --execute
 *
 * القواعد:
 *   - لا تُحذف جداول v3
 *   - أي خطأ → rollback كامل
 *   - يسجل كل migration في inbox_migration_log
 *   - INSERT OR IGNORE = آمن لو اتشغل مرتين
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const Database = require('better-sqlite3');

// ── مسارات ──────────────────────────────────────────────────────────────────
const TENANTS_DIR = path.join(__dirname, '../../data/tenants');

// ── تحليل الـ args ───────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const tenantId = (args.find(a => a.startsWith('--tenant=')) || '').replace('--tenant=', '');
const dryRun   = args.includes('--dry-run');
const execute  = args.includes('--execute');
const all      = args.includes('--all');

function usage() {
  console.log(`
الاستخدام:
  node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --dry-run
  node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --execute
  node server/scripts/migrate-inbox-v3-to-v4.js --all --dry-run
`);
  process.exit(1);
}

if (!dryRun && !execute) usage();
if (!all && !tenantId)   usage();

// ── فتح DB ───────────────────────────────────────────────────────────────────
function openDb(id) {
  const dbPath = path.join(TENANTS_DIR, `${id}.db`);
  if (!fs.existsSync(dbPath)) throw new Error(`DB غير موجودة: ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// ── تحويل timestamp: نص → unix ───────────────────────────────────────────────
function toUnix(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

// ── إنشاء جدول migration_log لو مش موجود ────────────────────────────────────
function ensureMigrationLog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbox_migration_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   TEXT NOT NULL,
      migrated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      conv_count  INTEGER NOT NULL DEFAULT 0,
      msg_count   INTEGER NOT NULL DEFAULT 0,
      mode        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      error_msg   TEXT
    );
  `);
}

// ── التحقق من جاهزية الـ DB ──────────────────────────────────────────────────
function checkReadiness(db, id) {
  const errors = [];

  // v3 tables موجودة؟
  const v3Conv = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_conversations'`).get();
  const v3Msgs = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_messages'`).get();
  if (!v3Conv) errors.push('❌ جدول inbox_conversations غير موجود');
  if (!v3Msgs) errors.push('❌ جدول inbox_messages غير موجود');

  // v4 tables موجودة؟
  const v4Conv = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_conversations_v4'`).get();
  const v4Msgs = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_messages_v4'`).get();
  if (!v4Conv) errors.push('❌ جدول inbox_conversations_v4 غير موجود — شغّل migrations أولاً');
  if (!v4Msgs) errors.push('❌ جدول inbox_messages_v4 غير موجود — شغّل migrations أولاً');

  return errors;
}

// ── دالة الهجرة الرئيسية لـ tenant واحد ─────────────────────────────────────
function migrateTenant(id, mode) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 Tenant ${id} | Mode: ${mode.toUpperCase()}`);
  console.log('='.repeat(60));

  let db;
  try {
    db = openDb(id);
  } catch (e) {
    console.log(`⏭️  تخطي Tenant ${id}: ${e.message}`);
    return { skipped: true, reason: e.message };
  }

  ensureMigrationLog(db);

  // تحقق جاهزية
  const errors = checkReadiness(db, id);
  if (errors.length) {
    errors.forEach(e => console.log(e));
    console.log(`⏭️  تخطي Tenant ${id}: جداول ناقصة`);
    return { skipped: true, reason: errors.join('; ') };
  }

  // إحصاء v3
  const v3ConvCount = db.prepare('SELECT COUNT(*) as n FROM inbox_conversations').get().n;
  const v3MsgCount  = db.prepare('SELECT COUNT(*) as n FROM inbox_messages').get().n;

  // محادثات مهاجرة مسبقاً؟
  const alreadyMigrated = db.prepare(`
    SELECT COUNT(*) as n FROM inbox_migration_log WHERE tenant_id=? AND status='ok'
  `).get(String(id)).n;

  // عدد v4 الحاليين
  const v4ConvCount = db.prepare('SELECT COUNT(*) as n FROM inbox_conversations_v4').get().n;
  const v4MsgCount  = db.prepare('SELECT COUNT(*) as n FROM inbox_messages_v4').get().n;

  console.log(`📊 v3:  ${v3ConvCount} محادثة، ${v3MsgCount} رسالة`);
  console.log(`📊 v4:  ${v4ConvCount} محادثة، ${v4MsgCount} رسالة (موجودة)`);
  if (alreadyMigrated) {
    console.log(`⚠️  تحذير: هجرة سابقة ناجحة موجودة (${alreadyMigrated} مرة)`);
  }

  if (v3ConvCount === 0) {
    console.log(`✅ Tenant ${id}: لا توجد بيانات v3 للهجرة`);
    return { convCount: 0, msgCount: 0 };
  }

  // ── حساب التوقعات
  const newConvs = db.prepare(`
    SELECT COUNT(*) as n FROM inbox_conversations c
    WHERE NOT EXISTS (
      SELECT 1 FROM inbox_conversations_v4 v
      WHERE v.id = c.id
    )
  `).get().n;

  const newMsgs = db.prepare(`
    SELECT COUNT(*) as n FROM inbox_messages m
    WHERE NOT EXISTS (
      SELECT 1 FROM inbox_messages_v4 v
      WHERE v.id = m.id
    )
  `).get().n;

  console.log(`\n🔮 Dry-Run توقع:`);
  console.log(`   ✦ ${newConvs} محادثة جديدة ستُنقل`);
  console.log(`   ✦ ${newMsgs} رسالة جديدة ستُنقل`);

  if (mode === 'dry-run') {
    console.log(`\n✅ Dry-Run ناجح — شغّل مع --execute لتطبيق الهجرة`);
    return { dryRun: true, convCount: newConvs, msgCount: newMsgs };
  }

  // ── تنفيذ الهجرة الفعلية ─────────────────────────────────────────────────
  console.log(`\n🚀 بدء الهجرة...`);

  // سجّل بداية العملية
  const logId = db.prepare(`
    INSERT INTO inbox_migration_log (tenant_id, conv_count, msg_count, mode, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(String(id), newConvs, newMsgs, mode).lastInsertRowid;

  let migratedConvs = 0;
  let migratedMsgs  = 0;

  try {
    // تنفيذ داخل transaction
    db.transaction(() => {

      // 1. هجرة المحادثات
      const v3Convs = db.prepare(`
        SELECT
          id, platform, sender_id, sender_name, sender_phone,
          status, unread_count, lead_id,
          assigned_to_id,
          created_at, last_message_at,
          last_message,
          csat_token, csat_rating, csat_comment, csat_at
        FROM inbox_conversations
        ORDER BY id ASC
      `).all();

      const insertConv = db.prepare(`
        INSERT OR IGNORE INTO inbox_conversations_v4 (
          id, platform, sender_id, sender_name, sender_phone,
          status, priority, assigned_to_id, master_contact_id,
          unread_count, unread_agent_count,
          last_message_at, last_message_text, last_message_dir,
          csat_token, csat_score,
          created_at, updated_at
        ) VALUES (
          @id, @platform, @sender_id, @sender_name, @sender_phone,
          @status, 'normal', @assigned_to_id, @master_contact_id,
          @unread_count, 0,
          @last_message_at, @last_message_text, 'in',
          @csat_token, @csat_score,
          @created_at, @updated_at
        )
      `);

      for (const c of v3Convs) {
        const result = insertConv.run({
          id:               c.id,
          platform:         c.platform,
          sender_id:        c.sender_id,
          sender_name:      c.sender_name || null,
          sender_phone:     c.sender_phone || null,
          status:           c.status || 'open',
          assigned_to_id:   c.assigned_to_id || null,
          master_contact_id: c.lead_id || null,
          unread_count:     c.unread_count || 0,
          last_message_at:  toUnix(c.last_message_at),
          last_message_text: c.last_message || null,
          csat_token:       c.csat_token || null,
          csat_score:       c.csat_rating || null,
          created_at:       toUnix(c.created_at) || Math.floor(Date.now() / 1000),
          updated_at:       toUnix(c.last_message_at) || Math.floor(Date.now() / 1000),
        });
        if (result.changes > 0) migratedConvs++;
      }

      console.log(`   ✅ محادثات: ${migratedConvs}/${v3Convs.length} مهاجرة`);

      // 2. هجرة الرسائل
      // تحقق من الـ columns الموجودة فعلياً (بعض الـ tenants القديمة ليس لديها media_id)
      const msgCols = db.prepare("PRAGMA table_info(inbox_messages)").all().map(r => r.name);
      const hasMediaId  = msgCols.includes('media_id');
      const mediaIdSql  = hasMediaId ? ', media_id' : '';

      const v3Msgs = db.prepare(`
        SELECT
          id, conversation_id, platform, direction,
          content, message_type,
          media_url, media_type, file_id${mediaIdSql},
          platform_msg_id, sent_at, is_read
        FROM inbox_messages
        ORDER BY id ASC
      `).all();

      const insertMsg = db.prepare(`
        INSERT OR IGNORE INTO inbox_messages_v4 (
          id, conversation_id, platform, direction,
          content, content_type,
          media_url, media_type,
          platform_msg_id,
          is_read, status,
          sent_at, created_at
        ) VALUES (
          @id, @conversation_id, @platform, @direction,
          @content, @content_type,
          @media_url, @media_type,
          @platform_msg_id,
          @is_read, 'sent',
          @sent_at, @sent_at
        )
      `);

      // تعيين content_type من message_type القديم
      function mapContentType(msgType) {
        const map = {
          'text':  'text',
          'image': 'image',
          'audio': 'audio',
          'file':  'file',
          'video': 'video',
          'sticker': 'sticker',
          'template': 'template',
          'interactive': 'interactive',
        };
        return map[msgType] || 'text';
      }

      // حصر الـ conversation_ids الموجودة في v4 فقط (للتحقق من FK)
      const validConvIds = new Set(
        db.prepare('SELECT id FROM inbox_conversations_v4').all().map(r => r.id)
      );

      let skippedMsgs = 0;
      for (const m of v3Msgs) {
        // تخطي الرسائل التي conversation_id غير موجود في v4
        if (!validConvIds.has(m.conversation_id)) {
          skippedMsgs++;
          continue;
        }

        // تعيين direction: v3 يستخدم 'in'/'out' — v4 يستخدم 'inbound'/'outbound'
        let direction = m.direction;
        if (direction === 'in')  direction = 'inbound';
        if (direction === 'out') direction = 'outbound';

        const result = insertMsg.run({
          id:              m.id,
          conversation_id: m.conversation_id,
          platform:        m.platform,
          direction:       direction,
          content:         m.content || null,
          content_type:    mapContentType(m.message_type),
          media_url:       m.media_url || null,
          media_type:      m.media_type || null,
          platform_msg_id: m.platform_msg_id || null,
          is_read:         m.is_read || 0,
          sent_at:         toUnix(m.sent_at) || Math.floor(Date.now() / 1000),
        });
        if (result.changes > 0) migratedMsgs++;
      }

      if (skippedMsgs > 0) {
        console.log(`   ⚠️  رسائل متخطاة (conversation_id غير موجود): ${skippedMsgs}`);
      }
      console.log(`   ✅ رسائل: ${migratedMsgs}/${v3Msgs.length} مهاجرة`);

      // 3. تحديث first_message_at لكل محادثة
      db.prepare(`
        UPDATE inbox_conversations_v4
        SET first_message_at = (
          SELECT MIN(sent_at) FROM inbox_messages_v4
          WHERE conversation_id = inbox_conversations_v4.id
        )
        WHERE id IN (SELECT DISTINCT conversation_id FROM inbox_messages_v4)
          AND first_message_at IS NULL
      `).run();
      console.log(`   ✅ تحديث first_message_at`);

    })(); // نهاية transaction

    // تحديث سجل الهجرة
    db.prepare(`
      UPDATE inbox_migration_log
      SET status='ok', conv_count=?, msg_count=?
      WHERE id=?
    `).run(migratedConvs, migratedMsgs, logId);

    console.log(`\n🎉 Tenant ${id}: هجرة ناجحة!`);
    console.log(`   📦 محادثات: ${migratedConvs}`);
    console.log(`   💬 رسائل:   ${migratedMsgs}`);

    return { convCount: migratedConvs, msgCount: migratedMsgs };

  } catch (err) {
    // rollback تلقائي من better-sqlite3 عند throw
    db.prepare(`
      UPDATE inbox_migration_log
      SET status='error', error_msg=?
      WHERE id=?
    `).run(err.message, logId);

    console.error(`\n❌ خطأ في Tenant ${id}: ${err.message}`);
    throw err;
  } finally {
    db.close();
  }
}

// ── تنفيذ ────────────────────────────────────────────────────────────────────
async function main() {
  const mode = dryRun ? 'dry-run' : 'execute';

  console.log(`\n🚀 Inbox v3 → v4 Migration`);
  console.log(`   Mode: ${mode.toUpperCase()}`);
  console.log(`   التاريخ: ${new Date().toISOString()}`);

  if (all) {
    // هجرة كل الـ tenants
    const files = fs.readdirSync(TENANTS_DIR)
      .filter(f => f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal') && !f.includes('.bak'))
      .map(f => f.replace('.db', ''));

    console.log(`\n📋 ${files.length} tenant(s) موجودة`);

    let totalConvs = 0, totalMsgs = 0, skipped = 0;
    for (const id of files) {
      try {
        const res = migrateTenant(id, mode);
        if (res.skipped) { skipped++; continue; }
        totalConvs += res.convCount || 0;
        totalMsgs  += res.msgCount  || 0;
      } catch (e) {
        console.error(`❌ فشل Tenant ${id} — متابعة...`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 الملخص النهائي:`);
    console.log(`   ✦ Tenants: ${files.length - skipped} ناجح، ${skipped} متخطي`);
    console.log(`   ✦ محادثات: ${totalConvs}`);
    console.log(`   ✦ رسائل:   ${totalMsgs}`);

  } else {
    migrateTenant(tenantId, mode);
  }

  console.log(`\n✅ اكتمل`);
}

main().catch(err => {
  console.error('خطأ فادح:', err.message);
  process.exit(1);
});
