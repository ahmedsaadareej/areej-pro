/**
 * Inbox Routes — /api/system/inbox/*, /api/system/marketplace/*
 * Mounted via routes-system.js → router.use('/', inboxRoutes)
 *
 * ⚠️  قبل أي تعديل — اقرأ /home/areej/areej-pro/PROJECT.md أولاً
 * ⚠️  بعد أي تعديل  — حدِّث PROJECT.md فوراً
 */
'use strict';
const express     = require('express');
const router      = express.Router();
const { requireAuth } = require('../auth-middleware');
const { validate } = require('../middleware/validate');
const master      = require('../db-master');
const crypto      = require('crypto');
const multer      = require('multer');
const waQR        = require('../whatsapp-qr-service');
const path        = require('path');
const fs          = require('fs');
const https       = require('https');
const { autoAssign, getConversationScope } = require('../inbox-distributor');

// ============================================================
// INBOX TIMELINE HELPER
// ============================================================

/**
 * logTimeline(db, convId, eventType, meta)
 * يسجّل حدث في تاريخ المحادثة. يتحقّق من وجود الجدول عند أول استدعاء.
 * event_type: status_changed | assigned | unassigned | snoozed | unsnoozed | note_added | message_sent
 */
function logTimeline(db, convId, eventType, meta = {}) {
  try {
    const cols = db.prepare('PRAGMA table_info(inbox_timeline)').all().map(c => c.name);
    if (!cols.length) {
      db.prepare(`CREATE TABLE IF NOT EXISTS inbox_timeline (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        event_type      TEXT NOT NULL,
        actor_name      TEXT,
        meta            TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      )`).run();
    }
    db.prepare(
      `INSERT INTO inbox_timeline (conversation_id, event_type, actor_name, meta) VALUES (?,?,?,?)`
    ).run(convId, eventType, meta.actor || null, JSON.stringify(meta));
  } catch(e) {
    // تجاهل — لا يكسر الـ request الأصلي
    console.warn('[Timeline] log error:', e.message);
  }
}

// ============================================================
// UNIFIED INBOX
// ============================================================

// GET /api/system/inbox/conversations
// - Owner/Admin: يشوف الكل + فلتر بالموظف
// - Moظف: يشوف المعيّنة ليه + غير المعيّنة
router.get('/inbox/conversations', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const platform    = req.query.platform || '';
    const assignedTo  = req.query.assigned_to || req.query.assigned || '';
    const status      = req.query.status || '';
    const search      = (req.query.search || '').trim();
    const from        = req.query.from  || '';
    const to          = req.query.to    || '';
    const page        = Math.max(1, parseInt(req.query.page) || 1);
    const limit       = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset      = (page - 1) * limit;

    const { whereClause, params, isOwner } = getConversationScope(req);

    let conditions = [];
    let qParams = [];

    if (platform)   { conditions.push('c.platform=?');         qParams.push(platform); }
    if (status && status !== 'all') { conditions.push('c.status=?'); qParams.push(status); }
    if (assignedTo && isOwner) {
      if (assignedTo === 'unassigned') {
        conditions.push('(c.assigned_to_id IS NULL OR c.assigned_to_id=0)');
      } else {
        conditions.push('c.assigned_to_id=?'); qParams.push(parseInt(assignedTo));
      }
    }
    if (search) {
      conditions.push('(c.sender_name LIKE ? OR c.last_message LIKE ? OR c.sender_phone LIKE ?)');
      const like = '%' + search + '%';
      qParams.push(like, like, like);
    }
    if (from) { conditions.push('c.last_message_at >= ?'); qParams.push(from); }
    if (to)   { conditions.push('c.last_message_at <= ?'); qParams.push(to + ' 23:59:59'); }

    const allConditions = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    // تطبيق scope الموظف
    const scopeConditions = whereClause
      ? (allConditions ? allConditions + ' ' + whereClause : 'WHERE 1=1 ' + whereClause)
      : allConditions;

    const q = `SELECT c.*,
      (SELECT COUNT(*) FROM inbox_messages m WHERE m.conversation_id=c.id AND m.is_read=0 AND m.direction='in') as unread,
      tu.name as agent_name
      FROM inbox_conversations c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      ${scopeConditions}
      ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`;

    const rows = db.prepare(q).all(...qParams, ...params, limit, offset);
    res.json({ ok: true, conversations: rows, isOwner });
  } catch(e) { console.error('[inbox/conversations]', e.message); res.json({ ok: true, conversations: [], isOwner: false }); }
});

// GET /api/system/inbox/messages/:convId
router.get('/inbox/messages/:convId', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const msgs = db.prepare(`SELECT * FROM inbox_messages WHERE conversation_id=? ORDER BY sent_at ASC LIMIT 100`).all(req.params.convId);
    // Mark as read
    db.prepare(`UPDATE inbox_messages SET is_read=1 WHERE conversation_id=? AND direction='in'`).run(req.params.convId);
    db.prepare(`UPDATE inbox_conversations SET unread_count=0 WHERE id=?`).run(req.params.convId);
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.json({ ok: true, messages: [] }); }
});

// POST /api/system/inbox/typing — Telegram typing indicator
router.post('/inbox/typing', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { conversation_id } = req.body;
    if (!conversation_id) return res.json({ ok: false });
    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(conversation_id);
    if (!conv || conv.platform !== 'telegram') return res.json({ ok: false });
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings || !settings.telegram_token || !settings.telegram_active) return res.json({ ok: false });
    const https = require('https');
    const chatId = conv.sender_id;
    const tgUrl = `https://api.telegram.org/bot${settings.telegram_token}/sendChatAction`;
    const payload = JSON.stringify({ chat_id: chatId, action: 'typing' });
    await new Promise((resolve) => {
      const urlObj = new URL(tgUrl);
      const req2 = https.request({ hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (r) => { r.resume(); r.on('end', resolve); });
      req2.on('error', resolve);
      req2.write(payload);
      req2.end();
    });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});

// POST /api/system/inbox/send
router.post('/inbox/send', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const body = validate(req.body, {
      conversation_id: { required: true, type: 'int', min: 1, label: 'المحادثة' },
      content: { required: true, type: 'string', maxLen: 4096, noSanitize: true, label: 'الرسالة' },
    });
    const { conversation_id, content } = body;
    if (!conversation_id || !content) return res.json({ ok: false, error: 'missing fields' });
    const conv = db.prepare(`SELECT * FROM inbox_conversations WHERE id=?`).get(conversation_id);
    if (!conv) return res.json({ ok: false, error: 'conversation not found' });

    // Save outgoing message
    db.prepare(`INSERT INTO inbox_messages (conversation_id, platform, direction, content) VALUES (?,?,?,?)`).run(conversation_id, conv.platform, 'out', content);
    db.prepare(`UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now') WHERE id=?`).run(content, conversation_id);

    // Actually send via platform
    let sendResult = { sent: false, error: null };
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();

    if (conv.platform === 'telegram' && settings && settings.telegram_token && settings.telegram_active) {
      try {
        const https = require('https');
        const chatId = conv.sender_id;
        const tgUrl = `https://api.telegram.org/bot${settings.telegram_token}/sendMessage`;
        const payload = JSON.stringify({ chat_id: chatId, text: content });
        await new Promise((resolve, reject) => {
          const urlObj = new URL(tgUrl);
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          };
          const reqHttp = https.request(options, (r) => {
            let data = '';
            r.on('data', chunk => data += chunk);
            r.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.ok) { sendResult.sent = true; }
                else { sendResult.error = parsed.description || 'Telegram error'; }
              } catch(e) { sendResult.error = 'parse error'; }
              resolve();
            });
          });
          reqHttp.on('error', (e) => { sendResult.error = e.message; resolve(); });
          reqHttp.write(payload);
          reqHttp.end();
        });
      } catch(e) {
        sendResult.error = e.message;
      }
    }

    // WhatsApp QR send
    if (conv.platform === 'whatsapp-qr') {
      try {
        const waQRService = require('../whatsapp-qr-service');
        await waQRService.sendMessage(req.user.id, conv.sender_id, content);
        sendResult.sent = true;
      } catch(e) {
        sendResult.error = e.message;
      }
    }

    if (sendResult.error) {
      return res.json({ ok: false, error: 'تم الحفظ لكن فشل الإرسال: ' + sendResult.error });
    }
    res.json({ ok: true, sent: sendResult.sent });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/inbox/convert-lead/:convId
router.post('/inbox/convert-lead/:convId', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const conv = db.prepare(`SELECT * FROM inbox_conversations WHERE id=?`).get(req.params.convId);
    if (!conv) return res.json({ ok: false, error: 'not found' });
    const existing = db.prepare(`SELECT id FROM crm_contacts WHERE phone=?`).get(conv.sender_phone || conv.sender_id);
    if (existing) {
      db.prepare(`UPDATE inbox_conversations SET lead_id=? WHERE id=?`).run(existing.id, conv.id);
      return res.json({ ok: true, lead_id: existing.id, existed: true });
    }
    const r = db.prepare(`INSERT INTO crm_contacts (name, phone, status, source, created_at) VALUES (?,?,?,?,datetime('now'))`)
      .run(conv.sender_name || conv.sender_id, conv.sender_phone || '', 'lead', conv.platform);
    db.prepare(`UPDATE inbox_conversations SET lead_id=? WHERE id=?`).run(r.lastInsertRowid, conv.id);
    res.json({ ok: true, lead_id: r.lastInsertRowid, existed: false });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/test-telegram
router.get('/inbox/test-telegram', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    const token = req.query.token || settings?.telegram_token;
    if (!token) return res.json({ ok: false, error: 'no token' });
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await r.json();
    if (!data.ok) return res.json({ ok: false, error: data.description || 'Invalid token' });
    res.json({ ok: true, bot_username: data.result.username, bot_name: data.result.first_name, bot_id: data.result.id });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/settings
router.get('/inbox/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    let s = db.prepare(`SELECT * FROM inbox_settings WHERE id=1`).get();
    if (!s) { db.prepare(`INSERT OR IGNORE INTO inbox_settings (id) VALUES (1)`).run(); s = db.prepare(`SELECT * FROM inbox_settings WHERE id=1`).get(); }
    // ── Security: mask sensitive tokens for sub-users ──────────────────
    if (req.tenantUser) {
      const maskToken = (t) => t ? '••••' + String(t).slice(-4) : null;
      s = { ...s,
        telegram_token: maskToken(s?.telegram_token),
        meta_token:     maskToken(s?.meta_token),
        wa_token:       maskToken(s?.wa_token),
        ig_token:       maskToken(s?.ig_token),
      };
    }
    res.json({ ok: true, settings: s });
  } catch(e) { res.json({ ok: true, settings: {} }); }
});

// POST /api/system/inbox/settings
router.post('/inbox/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // Ensure ig columns exist
    const cols = db.prepare('PRAGMA table_info(inbox_settings)').all().map(c => c.name);
    if (!cols.includes('ig_token'))      db.prepare('ALTER TABLE inbox_settings ADD COLUMN ig_token TEXT').run();
    if (!cols.includes('ig_account_id')) db.prepare('ALTER TABLE inbox_settings ADD COLUMN ig_account_id TEXT').run();
    if (!cols.includes('ig_active'))     db.prepare('ALTER TABLE inbox_settings ADD COLUMN ig_active INTEGER DEFAULT 0').run();
    if (!cols.includes('wa_phone_id'))   db.prepare('ALTER TABLE inbox_settings ADD COLUMN wa_phone_id TEXT').run();
    if (!cols.includes('wa_account_id')) db.prepare('ALTER TABLE inbox_settings ADD COLUMN wa_account_id TEXT').run();
    if (!cols.includes('wa_token'))      db.prepare('ALTER TABLE inbox_settings ADD COLUMN wa_token TEXT').run();
    if (!cols.includes('wa_active'))     db.prepare('ALTER TABLE inbox_settings ADD COLUMN wa_active INTEGER DEFAULT 0').run();

    const b = req.body;
    // Get existing row
    const existing = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get() || {};
    // Merge fields
    const merged = {
      telegram_token:  b.telegram_token  !== undefined ? b.telegram_token  : existing.telegram_token,
      telegram_active: b.telegram_active !== undefined ? (b.telegram_active?1:0) : existing.telegram_active,
      meta_token:      b.meta_token      !== undefined ? b.meta_token      : existing.meta_token,
      meta_page_id:    b.meta_page_id    !== undefined ? b.meta_page_id    : existing.meta_page_id,
      meta_active:     b.meta_active     !== undefined ? (b.meta_active?1:0) : existing.meta_active,
      ig_token:        b.ig_token        !== undefined ? b.ig_token        : existing.ig_token,
      ig_account_id:   b.ig_account_id   !== undefined ? b.ig_account_id   : existing.ig_account_id,
      ig_active:       b.ig_active       !== undefined ? (b.ig_active?1:0)  : existing.ig_active,
      wa_phone_id:     b.wa_phone_id     !== undefined ? b.wa_phone_id     : existing.wa_phone_id,
      wa_account_id:   b.wa_account_id   !== undefined ? b.wa_account_id   : existing.wa_account_id,
      wa_token:        b.wa_token        !== undefined ? b.wa_token        : existing.wa_token,
      wa_active:       b.wa_active       !== undefined ? (b.wa_active?1:0)  : existing.wa_active,
      wa_qr_active:    b.wa_qr_active    !== undefined ? (b.wa_qr_active?1:0) : existing.wa_qr_active,
      welcome_active:  b.welcome_active  !== undefined ? (b.welcome_active?1:0) : existing.welcome_active,
      welcome_message: b.welcome_message !== undefined ? b.welcome_message : existing.welcome_message,
      away_active:     b.away_active     !== undefined ? (b.away_active?1:0) : existing.away_active,
      away_message:    b.away_message    !== undefined ? b.away_message    : existing.away_message,
    };
    db.prepare(`INSERT OR REPLACE INTO inbox_settings 
      (id, telegram_token, telegram_active, meta_token, meta_page_id, meta_active, ig_token, ig_account_id, ig_active, wa_phone_id, wa_account_id, wa_token, wa_active, wa_qr_active, welcome_active, welcome_message, away_active, away_message, updated_at)
      VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
      merged.telegram_token, merged.telegram_active, merged.meta_token, merged.meta_page_id, merged.meta_active,
      merged.ig_token, merged.ig_account_id, merged.ig_active,
      merged.wa_phone_id, merged.wa_account_id, merged.wa_token, merged.wa_active, merged.wa_qr_active,
      merged.welcome_active, merged.welcome_message, merged.away_active, merged.away_message
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/unread-count
router.get('/inbox/unread-count', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const r = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages WHERE direction='in' AND is_read=0`).get();
    res.json({ ok: true, count: r.c });
  } catch(e) { res.json({ ok: true, count: 0 }); }
});

// GET /api/system/inbox/templates
router.get('/inbox/templates', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(`SELECT * FROM inbox_templates ORDER BY id DESC`).all();
    res.json({ ok: true, templates: rows });
  } catch(e) { res.json({ ok: true, templates: [] }); }
});

// POST /api/system/inbox/templates
router.post('/inbox/templates', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, content } = req.body;
    if (!name || !content) return res.json({ ok: false, error: 'missing fields' });
    const r = db.prepare(`INSERT INTO inbox_templates (name, content) VALUES (?,?)`).run(name, content);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/system/inbox/templates/:id
router.delete('/inbox/templates/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_templates WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// PUT /api/system/inbox/templates/:id
router.put('/inbox/templates/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, content } = req.body;
    if (!name || !content) return res.json({ ok: false, error: 'missing fields' });
    db.prepare('UPDATE inbox_templates SET name=?, content=? WHERE id=?').run(name, content, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// MARKETPLACE — سوق الموردين
// ============================================================
// [moved to header]: const masterForMarket = require('../db-master');

// GET /api/system/marketplace/suppliers
router.get('/marketplace/suppliers', requireAuth, (req, res) => {
  try {
    const { region, product, search, page = 1 } = req.query;
    let q = `SELECT * FROM marketplace_suppliers WHERE status='approved'`;
    const params = [];
    if (region) { q += ` AND regions LIKE ?`; params.push('%' + region + '%'); }
    if (product) { q += ` AND products LIKE ?`; params.push('%' + product + '%'); }
    if (search) { q += ` AND (name LIKE ? OR description LIKE ? OR products LIKE ?)`; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
    q += ` ORDER BY rating DESC, id ASC LIMIT 20 OFFSET ?`;
    params.push((parseInt(page)-1)*20);
    const rows = master.prepare(q).all(...params);
    const total = master.prepare(`SELECT COUNT(*) as c FROM marketplace_suppliers WHERE status='approved'`).get().c;
    res.json({ ok: true, suppliers: rows, total });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/marketplace/quote
router.post('/marketplace/quote', requireAuth, (req, res) => {
  try {
    const { supplier_id, product_type, quantity, specs, message } = req.body;
    if (!supplier_id || !product_type) return res.json({ ok: false, error: 'missing fields' });
    const supplier = master.prepare('SELECT * FROM marketplace_suppliers WHERE id=? AND status=?').get(supplier_id, 'approved');
    if (!supplier) return res.json({ ok: false, error: 'supplier not found' });
    const user = req.user;
    const r = master.prepare(`INSERT INTO marketplace_quotes (supplier_id, client_user_id, client_name, client_phone, product_type, quantity, specs, message) VALUES (?,?,?,?,?,?,?,?)`)
      .run(supplier_id, user.id, user.name, user.phone||'', product_type, quantity||0, specs||'', message||'');
    res.json({ ok: true, quote_id: r.lastInsertRowid, supplier_phone: supplier.phone, supplier_name: supplier.name });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/marketplace/rate
router.post('/marketplace/rate', requireAuth, (req, res) => {
  try {
    const { supplier_id, rating, comment } = req.body;
    if (!supplier_id || !rating) return res.json({ ok: false, error: 'missing fields' });
    const existing = master.prepare('SELECT id FROM marketplace_ratings WHERE supplier_id=? AND user_id=?').get(supplier_id, req.user.id);
    if (existing) {
      master.prepare('UPDATE marketplace_ratings SET rating=?, comment=? WHERE id=?').run(rating, comment||'', existing.id);
    } else {
      master.prepare('INSERT INTO marketplace_ratings (supplier_id, user_id, rating, comment) VALUES (?,?,?,?)').run(supplier_id, req.user.id, rating, comment||'');
    }
    // تحديث متوسط التقييم
    const avg = master.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM marketplace_ratings WHERE supplier_id=?').get(supplier_id);
    master.prepare('UPDATE marketplace_suppliers SET rating=?, rating_count=? WHERE id=?').run(avg.avg||0, avg.cnt||0, supplier_id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/marketplace/my-quotes
router.get('/marketplace/my-quotes', requireAuth, (req, res) => {
  try {
    const quotes = master.prepare(`SELECT q.*, s.name as supplier_name, s.phone as supplier_phone FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id WHERE q.client_user_id=? ORDER BY q.created_at DESC LIMIT 20`).all(req.user.id);
    res.json({ ok: true, quotes });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── ADMIN: marketplace management ──
router.get('/marketplace/admin/suppliers', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const rows = master.prepare('SELECT * FROM marketplace_suppliers ORDER BY created_at DESC').all();
    res.json({ ok: true, suppliers: rows });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/marketplace/admin/approve/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    master.prepare('UPDATE marketplace_suppliers SET status=? WHERE id=?').run(req.body.status || 'approved', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/marketplace/admin/add', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const { name, phone, products, regions, price_range, description, commission_rate } = req.body;
    if (!name || !phone || !products) return res.json({ ok: false, error: 'missing fields' });
    const r = master.prepare('INSERT INTO marketplace_suppliers (name,phone,products,regions,price_range,description,commission_rate,status) VALUES (?,?,?,?,?,?,?,?)').run(name,phone,products,regions||'',price_range||'',description||'',commission_rate||3,'approved');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/marketplace/admin/suppliers/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    master.prepare('DELETE FROM marketplace_suppliers WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.get('/marketplace/admin/quotes', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const rows = master.prepare('SELECT q.*, s.name as supplier_name, s.commission_rate FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id ORDER BY q.created_at DESC LIMIT 50').all();
    const total_deals = master.prepare('SELECT SUM(deal_amount) as t FROM marketplace_quotes WHERE deal_amount > 0').get().t || 0;
    const total_commission = master.prepare('SELECT SUM(commission_amount) as t FROM marketplace_quotes WHERE commission_amount > 0').get().t || 0;
    res.json({ ok: true, quotes: rows, total_deals, total_commission });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.put('/marketplace/admin/quotes/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const { status, deal_amount } = req.body;
    const q = master.prepare('SELECT * FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id WHERE q.id=?').get(req.params.id);
    if (!q) return res.json({ ok: false, error: 'not found' });
    const commission = deal_amount ? (deal_amount * (q.commission_rate / 100)) : 0;
    master.prepare('UPDATE marketplace_quotes SET status=?, deal_amount=?, commission_amount=? WHERE id=?').run(status || q.status, deal_amount || q.deal_amount, commission, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// PAYMENT LINKS — لينك دفع للزبون
// ============================================================
// [moved to header]: const crypto = require('crypto');

// POST /api/system/payment-links — إنشاء لينك دفع
router.post('/payment-links', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { invoice_id, amount, client_name, client_phone, description, conversation_id } = req.body;
    if (!amount) return res.json({ ok: false, error: 'amount required' });

    // lazy migration لإضافة conversation_id لو ما كانتش
    try {
      const cols = db.prepare('PRAGMA table_info(payment_links)').all().map(c => c.name);
      if (!cols.includes('conversation_id')) {
        db.prepare('ALTER TABLE payment_links ADD COLUMN conversation_id INTEGER DEFAULT NULL').run();
      }
    } catch {}

    const token = crypto.randomBytes(16).toString('hex');
    const r = db.prepare(`INSERT INTO payment_links (invoice_id, token, amount, client_name, client_phone, description, conversation_id) VALUES (?,?,?,?,?,?,?)`)
      .run(invoice_id || null, token, parseFloat(amount), client_name||'', client_phone||'', description||'', conversation_id || null);
    const baseUrl = process.env.APP_BASE_URL || 'https://pro.areejegypt.com';
    const link = `${baseUrl}/pay/${token}`;
    res.json({ ok: true, id: r.lastInsertRowid, token, link });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/payment-links — قائمة اللينكات
router.get('/payment-links', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(`SELECT pl.*, i.invoice_no FROM payment_links pl LEFT JOIN sys_invoices i ON i.id=pl.invoice_id ORDER BY pl.created_at DESC LIMIT 30`).all();
    res.json({ ok: true, links: rows });
  } catch(e) { res.json({ ok: true, links: [] }); }
});

// ============================================================
// ORDER FORMS — فورم الطلب
// ============================================================

// POST /api/system/order-forms — إنشاء فورم
router.post('/order-forms', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { title, products } = req.body;
    if (!title) return res.json({ ok: false, error: 'title required' });
    const token = crypto.randomBytes(12).toString('hex');
    const r = db.prepare(`INSERT INTO order_forms (token, title, products) VALUES (?,?,?)`)
      .run(token, title, JSON.stringify(products || []));
    const baseUrl = process.env.APP_BASE_URL || 'https://pro.areejegypt.com';
    const link = `${baseUrl}/order-form/${token}`;
    res.json({ ok: true, id: r.lastInsertRowid, token, link });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/order-forms
router.get('/order-forms', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const forms = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM order_form_submissions s WHERE s.form_id=f.id) as submissions_count FROM order_forms f ORDER BY f.created_at DESC`).all();
    res.json({ ok: true, forms });
  } catch(e) { res.json({ ok: true, forms: [] }); }
});

// GET /api/system/order-forms/:token/submissions
router.get('/order-forms/:token/submissions', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const form = db.prepare('SELECT * FROM order_forms WHERE token=?').get(req.params.token);
    if (!form) return res.json({ ok: false, error: 'not found' });
    const subs = db.prepare('SELECT * FROM order_form_submissions WHERE form_id=? ORDER BY created_at DESC').all(form.id);
    res.json({ ok: true, form, submissions: subs });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/system/order-forms/:id
router.delete('/order-forms/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM order_forms WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// SHIPPING — الشحن المتكامل
// ============================================================

// GET /api/system/shipping/settings
router.get('/shipping/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    let s = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get();
    if (!s) {
      db.prepare('INSERT OR IGNORE INTO shipping_settings (id) VALUES (1)').run();
      s = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get();
    }
    res.json({ ok: true, settings: s || {} });
  } catch(e) { res.json({ ok: true, settings: {} }); }
});

// POST /api/system/shipping/settings
router.post('/shipping/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { bosta_api_key, aramex_api_key, jnt_api_key, default_company, sender_name, sender_phone, sender_address } = req.body;
    db.prepare(`INSERT OR REPLACE INTO shipping_settings (id, bosta_api_key, aramex_api_key, jnt_api_key, default_company, sender_name, sender_phone, sender_address, updated_at)
      VALUES (1,?,?,?,?,?,?,?,datetime('now'))`).run(bosta_api_key||'', aramex_api_key||'', jnt_api_key||'', default_company||'bosta', sender_name||'', sender_phone||'', sender_address||'');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/shipping/create — إنشاء شحنة
router.post('/shipping/create', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { order_id, company, receiver_name, receiver_phone, receiver_address, receiver_city, weight, cod_amount, notes } = req.body;
    if (!order_id || !receiver_phone) return res.json({ ok: false, error: 'order_id and receiver_phone required' });
    const order = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(order_id);
    if (!order) return res.json({ ok: false, error: 'order not found' });
    const settings = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get() || {};
    const shippingCo = company || settings.default_company || 'manual';

    // Generate waybill number
    const waybillNo = shippingCo.toUpperCase().substring(0,3) + '-' + Date.now().toString().slice(-8);

    // Save shipment
    const r = db.prepare(`INSERT INTO sys_shipments (order_id, company, waybill_no, receiver_name, receiver_phone, receiver_address, receiver_city, weight, cod_amount, notes, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`).run(order_id, shippingCo, waybillNo, receiver_name||order.client_name, receiver_phone||order.client_phone, receiver_address||order.client_address||'', receiver_city||'', weight||0.5, cod_amount||0, notes||'');

    // Update order with tracking
    db.prepare('UPDATE sys_orders SET shipping_co=?, tracking_no=? WHERE id=?').run(shippingCo, waybillNo, order_id);

    // Add order log
    db.prepare('INSERT INTO sys_order_logs (order_id, status, note) VALUES (?,?,?)').run(order_id, 'shipped', 'تم إنشاء شحنة ' + shippingCo + ' — ' + waybillNo);

    const trackingLink = `https://pro.areejegypt.com/track/${waybillNo}`;
    const waMsg = `مرحباً ${receiver_name||order.client_name} 👋\nطلبك رقم ${order.order_no} في الطريق إليك!\nرقم الشحنة: ${waybillNo}\nتتبع الشحنة: ${trackingLink}\nشركة الشحن: ${shippingCo}`;

    res.json({ ok: true, shipment_id: r.lastInsertRowid, waybill_no: waybillNo, tracking_link: trackingLink, wa_message: waMsg });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/shipping/shipments
router.get('/shipping/shipments', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(`SELECT s.*, o.order_no, o.client_name FROM sys_shipments s LEFT JOIN sys_orders o ON o.id=s.order_id ORDER BY s.created_at DESC LIMIT 30`).all();
    const stats = db.prepare(`SELECT status, COUNT(*) as c FROM sys_shipments GROUP BY status`).all();
    res.json({ ok: true, shipments: rows, stats });
  } catch(e) { res.json({ ok: true, shipments: [], stats: [] }); }
});

// PUT /api/system/shipping/shipments/:id/status
router.put('/shipping/shipments/:id/status', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { status, notes } = req.body;
    db.prepare('UPDATE sys_shipments SET status=?, notes=?, updated_at=datetime(\'now\') WHERE id=?').run(status, notes||'', req.params.id);
    // Update order status too
    const ship = db.prepare('SELECT * FROM sys_shipments WHERE id=?').get(req.params.id);
    if (ship) {
      const ordStatus = status === 'delivered' ? 'delivered' : status === 'returned' ? 'returned' : 'shipped';
      db.prepare('UPDATE sys_orders SET status=? WHERE id=?').run(ordStatus, ship.order_id);
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// PRODUCT CATEGORIES
// ============================================================
router.get('/categories', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM product_categories ORDER BY name').all();
    res.json({ ok: true, categories: rows });
  } catch(e) { res.json({ ok: true, categories: [] }); }
});

router.post('/categories', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name } = req.body;
    if (!name) return res.json({ ok: false, error: 'name required' });
    const r = db.prepare('INSERT INTO product_categories (name) VALUES (?)').run(name.trim());
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.json({ ok: false, error: 'الفئة موجودة بالفعل' });
    res.json({ ok: false, error: e.message });
  }
});

router.delete('/categories/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM product_categories WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/products/check-name?name=xxx
router.get('/products/check-name', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, exclude_id } = req.query;
    if (!name) return res.json({ ok: true, exists: false });
    let q = 'SELECT id FROM sys_products WHERE LOWER(name)=LOWER(?)';
    const params = [name.trim()];
    if (exclude_id) { q += ' AND id != ?'; params.push(parseInt(exclude_id)); }
    const row = db.prepare(q).get(...params);
    res.json({ ok: true, exists: !!row });
  } catch(e) { res.json({ ok: true, exists: false }); }
});

// ============================================================
// PRODUCT IMAGE UPLOAD
// ============================================================
// [moved to header]: const multer_prod = require('multer');
// [moved to header]: const path_prod = require('path');
const prodImgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads/products');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'prod-' + Date.now() + ext);
  }
});
const prodUpload = multer({ storage: prodImgStorage, limits: { fileSize: 3 * 1024 * 1024 } });

router.post('/products/:id/image', requireAuth, prodUpload.single('image'), (req, res) => {
  const db = req.db;
  try {
    if (!req.file) return res.json({ ok: false, error: 'no file' });
    const url = '/uploads/products/' + req.file.filename;
    db.prepare('UPDATE sys_products SET image_url=? WHERE id=?').run(url, req.params.id);
    res.json({ ok: true, url });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// SHIPPING COMPANIES — شركات الشحن
// ============================================================

// GET /api/system/shipping/companies
router.get('/shipping/companies', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM shipping_companies ORDER BY is_default DESC, name ASC').all();
    res.json({ ok: true, companies: rows });
  } catch(e) { res.json({ ok: true, companies: [] }); }
});

// POST /api/system/shipping/companies
router.post('/shipping/companies', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, name_en, logo_url, api_endpoint, api_key, api_secret, tracking_url_template, webhook_secret, is_default, notes } = req.body;
    if (!name) return res.json({ ok: false, error: 'name required' });
    if (is_default) db.prepare('UPDATE shipping_companies SET is_default=0').run();
    const r = db.prepare(`INSERT INTO shipping_companies (name,name_en,logo_url,api_endpoint,api_key,api_secret,tracking_url_template,webhook_secret,is_default,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name,name_en||'',logo_url||'',api_endpoint||'',api_key||'',api_secret||'',
      tracking_url_template||'',webhook_secret||'',is_default?1:0,notes||'');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// PUT /api/system/shipping/companies/:id
router.put('/shipping/companies/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, name_en, logo_url, api_endpoint, api_key, api_secret, tracking_url_template, webhook_secret, is_default, notes, active } = req.body;
    if (is_default) db.prepare('UPDATE shipping_companies SET is_default=0').run();
    db.prepare(`UPDATE shipping_companies SET name=COALESCE(?,name), name_en=COALESCE(?,name_en),
      api_endpoint=COALESCE(?,api_endpoint), api_key=COALESCE(?,api_key), api_secret=COALESCE(?,api_secret),
      tracking_url_template=COALESCE(?,tracking_url_template), webhook_secret=COALESCE(?,webhook_secret),
      is_default=COALESCE(?,is_default), notes=COALESCE(?,notes), active=COALESCE(?,active)
      WHERE id=?`).run(name||null,name_en||null,api_endpoint||null,api_key||null,api_secret||null,
      tracking_url_template||null,webhook_secret||null,is_default!=null?is_default?1:0:null,
      notes||null,active!=null?active?1:0:null,req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/system/shipping/companies/:id
router.delete('/shipping/companies/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM shipping_companies WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/shipping/companies/:id/test — اختبار الـ API
router.post('/shipping/companies/:id/test', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const co = db.prepare('SELECT * FROM shipping_companies WHERE id=?').get(req.params.id);
    if (!co) return res.json({ ok: false, error: 'not found' });
    if (!co.api_endpoint || !co.api_key) return res.json({ ok: false, error: 'API endpoint/key not configured' });
    const https = require('https');
    const http = require('http');
    const url = new URL(co.api_endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    await new Promise((resolve) => {
      const req2 = mod.request({ hostname: url.hostname, path: url.pathname, method: 'GET',
        headers: { 'Authorization': 'Bearer ' + co.api_key, 'Content-Type': 'application/json' }
      }, (r) => { resolve(r.statusCode); });
      req2.on('error', () => resolve(null));
      req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
      req2.end();
    });
    res.json({ ok: true, message: 'تم الاتصال بنجاح' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/shipping/shipments/:id
router.get('/shipping/shipments/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const s = db.prepare(`SELECT s.*, o.order_no, o.client_name as order_client, o.total as order_total,
      o.status as order_status FROM sys_shipments s LEFT JOIN sys_orders o ON o.id=s.order_id WHERE s.id=?`).get(req.params.id);
    if (!s) return res.json({ ok: false, error: 'not found' });
    res.json({ ok: true, shipment: s });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// ORDER → INVOICE
// ============================================================
router.post('/orders/:id/to-invoice', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'الطلب غير موجود' });
    if (ord.invoice_id) {
      const inv = db.prepare('SELECT invoice_no FROM sys_invoices WHERE id=?').get(ord.invoice_id);
      return res.json({ ok: true, invoice_id: ord.invoice_id, invoice_no: inv?.invoice_no, already_exists: true });
    }

    const { wallet_id, payment_method, items } = req.body;
    const invoice_no = nextInvoiceNo(db);

    // حساب الإجمالي من items أو من الأوردر
    let invoiceItems = items || [];
    const subtotal = invoiceItems.length
      ? invoiceItems.reduce((s, it) => s + (+it.qty * +it.unit_price), 0)
      : (ord.total || 0);
    const total = subtotal;

    const creatorId   = req.tenantUser ? req.tenantUser.id   : req.user.id;
    const creatorName = req.tenantUser ? req.tenantUser.name : req.user.name;

    const invId = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO sys_invoices (invoice_no, contact_id, client_name, client_phone, client_email, client_address,
          status, notes, subtotal, discount, tax, total, created_by_id, created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)
      `).run(invoice_no, ord.contact_id||null, ord.client_name, ord.client_phone||null,
             ord.client_email||null, ord.client_address||null,
             wallet_id ? 'paid' : 'sent',
             ord.notes||null, subtotal, total, creatorId, creatorName||'');

      const invInserted = ins.lastInsertRowid;

      // إضافة الـ items
      if (invoiceItems.length) {
        const insItem = db.prepare('INSERT INTO sys_invoice_items (invoice_id,description,qty,unit_price,total,product_id) VALUES (?,?,?,?,?,?)');
        invoiceItems.forEach(it => {
          const itTotal = +it.qty * +it.unit_price;
          insItem.run(invInserted, it.description||it.name||'', +it.qty, +it.unit_price, itTotal, it.product_id||null);
          // خصم من المخزون (إلا لو POD من خامة العميل)
          if (it.product_id && ord.order_type !== 'pod_client') {
            const prod = db.prepare('SELECT * FROM sys_products WHERE id=?').get(it.product_id);
            if (prod) {
              const newQty = Math.max(0, prod.stock_qty - +it.qty);
              db.prepare('UPDATE sys_products SET stock_qty=? WHERE id=?').run(newQty, it.product_id);
              db.prepare(`INSERT INTO sys_stock_moves (product_id,type,qty,unit_cost,ref_type,ref_id,notes) VALUES (?,'out',?,?,'invoice',?,?)`)
                .run(it.product_id, +it.qty, +it.unit_price, invInserted, 'فاتورة '+invoice_no);
            }
          }
        });
      }

      // ربط الأوردر بالفاتورة
      db.prepare('UPDATE sys_orders SET invoice_id=?, status=?, updated_at=datetime(\'now\') WHERE id=?').run(invInserted, 'preparing', ord.id);
      db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'preparing', 'تم تحويله لفاتورة: '+invoice_no);

      // دفع إلى خزينة
      if (wallet_id) {
        db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,description,ref_type,ref_id,date) VALUES (?,?,?,?,?,?,date('now'))`)
          .run(parseInt(wallet_id), 'in', total, 'فاتورة: '+invoice_no+' — '+ord.client_name, 'invoice', invInserted);
        db.prepare('UPDATE sys_wallets SET balance=balance+? WHERE id=?').run(total, parseInt(wallet_id));
        db.prepare('UPDATE sys_invoices SET paid_at=datetime(\'now\') WHERE id=?').run(invInserted);
      }

      // CRM note
      if (ord.contact_id) {
        db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(ord.contact_id, 'فاتورة من أوردر: '+invoice_no+' — '+total+' ج.م');
      }

      return invInserted;
    })();

    res.json({ ok: true, invoice_id: invId, invoice_no });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/orders/:id/to-production
router.post('/orders/:id/to-production', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { production_notes, production_supplier, production_due_date } = req.body;
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'not found' });
    db.prepare(`UPDATE sys_orders SET status='in_production', production_notes=COALESCE(?,production_notes),
      production_supplier=COALESCE(?,production_supplier), production_due_date=COALESCE(?,production_due_date),
      updated_at=datetime('now') WHERE id=?`).run(production_notes||null, production_supplier||null, production_due_date||null, ord.id);
    db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'in_production', 'تم إرساله للإنتاج'+(production_supplier?' — '+production_supplier:''));
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/orders/:id/ready
router.post('/orders/:id/ready', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'not found' });
    db.prepare("UPDATE sys_orders SET status='ready', updated_at=datetime('now') WHERE id=?").run(ord.id);
    db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'ready', 'جاهز للشحن');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/suppliers/:id/link-person
router.post('/suppliers/:id/link-person', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { person_id } = req.body;
    db.prepare('UPDATE sys_suppliers SET person_id=? WHERE id=?').run(person_id, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX MEDIA UPLOAD
// ============================================================
const inboxMediaStorage = require('multer').diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id || 'shared';
    const dir = require('path').join(__dirname, '../../public/uploads/inbox', String(userId));
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = require('path').extname(file.originalname);
    cb(null, 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext);
  }
});
const inboxUpload = require('multer')({
  storage: inboxMediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    // ── Security: block dangerous extensions ──────────────────────────────
    const BLOCKED_EXT = /\.(php|php3|php4|php5|phtml|asp|aspx|jsp|jspx|cgi|py|rb|sh|bash|exe|dll|bat|cmd|com|vbs|wsf|htaccess|htpasswd)$/i;
    if (BLOCKED_EXT.test(file.originalname)) {
      return cb(new Error('نوع الملف غير مسموح لأسباب أمنية'));
    }
    // ── Allowed media + document types ────────────────────────────────────
    const ALLOWED_EXT = /\.(jpg|jpeg|png|gif|webp|mp4|mp3|ogg|wav|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv|m4a|aac|flac|mov|avi|mkv|3gp|svg|heic|opus|amr)$/i;
    const ALLOWED_MIME = /^(image\/|video\/|audio\/|application\/(pdf|msword|vnd\.openxmlformats|zip|x-rar|vnd\.ms-|x-zip|octet-stream)|text\/plain)/i;
    if (ALLOWED_EXT.test(file.originalname) || ALLOWED_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح'));
    }
  }
});

// POST /api/system/inbox/upload-media
router.post('/inbox/upload-media', requireAuth, inboxUpload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: 'no file or invalid type' });
  const userId = req.user?.id || 'shared';
    const url = '/uploads/inbox/' + userId + '/' + req.file.filename;
  const mimeType = req.file.mimetype;
  const mediaType = mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('video/') ? 'video'
    : mimeType.startsWith('audio/') ? 'audio'
    : 'file';
  res.json({ ok: true, url, media_type: mediaType, original_name: req.file.originalname, size: req.file.size });
});


// GET /api/system/inbox/resolve-media/:msgId — جلب URL لرسالة ميديا قديمة
router.get('/inbox/resolve-media/:msgId', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const msg = db.prepare('SELECT * FROM inbox_messages WHERE id=?').get(req.params.msgId);
    if (!msg) return res.json({ ok: false, error: 'not found' });
    if (msg.media_url) return res.json({ ok: true, media_url: msg.media_url });
    if (!msg.file_id) return res.json({ ok: false, error: 'no file_id' });
    
    // Get Telegram token
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings || !settings.telegram_token) return res.json({ ok: false, error: 'no token' });
    
    // Call Telegram getFile
    const https = require('https');
    const fileData = await new Promise((resolve) => {
      const reqH = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${settings.telegram_token}/getFile?file_id=${msg.file_id}`,
        method: 'GET'
      }, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
      });
      reqH.on('error', () => resolve({}));
      reqH.end();
    });
    
    if (fileData.ok && fileData.result && fileData.result.file_path) {
      const mediaUrl = `https://api.telegram.org/file/bot${settings.telegram_token}/${fileData.result.file_path}`;
      // Update DB
      db.prepare('UPDATE inbox_messages SET media_url=? WHERE id=?').run(mediaUrl, msg.id);
      return res.json({ ok: true, media_url: mediaUrl });
    }
    
    res.json({ ok: false, error: 'could not resolve file path' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/media-proxy/:msgId — Proxy Telegram media (avoids expired URLs)
router.get('/inbox/media-proxy/:msgId', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const msg = db.prepare('SELECT * FROM inbox_messages WHERE id=?').get(req.params.msgId);
    if (!msg) return res.status(404).send('not found');
    if (!msg.file_id) return res.status(404).send('no file_id');

    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings || !settings.telegram_token) return res.status(500).send('no token');

    const https = require('https');

    // Step 1: getFile to get fresh file_path
    const fileData = await new Promise((resolve) => {
      const reqH = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${settings.telegram_token}/getFile?file_id=${msg.file_id}`,
        method: 'GET'
      }, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
      });
      reqH.on('error', () => resolve({}));
      reqH.end();
    });

    if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
      const errMsg = fileData.description || 'could not get file path';
      if (errMsg.includes('too big')) {
        return res.status(413).json({ ok: false, error: 'الملف أكبر من 20MB — حد Telegram Bot API', too_big: true });
      }
      return res.status(500).send(errMsg);
    }

    const filePath = fileData.result.file_path;
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
      ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', webm: 'audio/webm',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      zip: 'application/zip', rar: 'application/x-rar-compressed' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const originalName = msg.content && !msg.content.startsWith('[') ? msg.content : ('file.' + ext);

    // Step 2: Stream file from Telegram to client
    const tgReq = https.request({
      hostname: 'api.telegram.org',
      path: '/file/bot' + settings.telegram_token + '/' + filePath,
      method: 'GET'
    }, (tgRes) => {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline; filename="' + originalName + '"');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      tgRes.pipe(res);
    });
    tgReq.on('error', (e) => res.status(500).send(e.message));
    tgReq.end();

  } catch(e) { res.status(500).send(e.message); }
});

// POST /api/system/inbox/send-media — إرسال media في محادثة
router.post('/inbox/send-media', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { conversation_id, media_url, media_type, caption, original_name } = req.body;
    if (!conversation_id || !media_url) return res.json({ ok: false, error: 'missing fields' });
    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(conversation_id);
    if (!conv) return res.json({ ok: false, error: 'conversation not found' });
    const content = caption || original_name || '[مرفق]';
    
    // Ensure media columns exist
    try {
      const cols = db.prepare("PRAGMA table_info(inbox_messages)").all().map(c => c.name);
      if (!cols.includes('media_url'))  db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_url TEXT").run();
      if (!cols.includes('media_type')) db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_type TEXT").run();
      if (!cols.includes('file_id'))    db.prepare("ALTER TABLE inbox_messages ADD COLUMN file_id TEXT").run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    
    db.prepare('INSERT INTO inbox_messages (conversation_id, platform, direction, content, message_type, platform_msg_id, media_url, media_type) VALUES (?,?,?,?,?,?,?,?)')
      .run(conversation_id, conv.platform, 'out', content, media_type || 'file', media_url, media_url, media_type || 'file');
    db.prepare("UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now') WHERE id=?").run(content, conversation_id);
    
    // Actually send via platform API
    let sendResult = { sent: false, error: null };
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    
    if (conv.platform === 'telegram' && settings && settings.telegram_token && settings.telegram_active) {
      try {
        const path = require('path');
        const fs = require('fs');
        const https = require('https');
        const chatId = conv.sender_id;
        
        // Determine local file path from URL
        let localFilePath = null;
        if (media_url.startsWith('/uploads/')) {
          localFilePath = path.join(__dirname, '../../public', media_url);
        }
        
        // Choose correct Telegram method based on media_type
        let tgMethod = 'sendDocument';
        let tgField = 'document';
        if (media_type === 'image') { tgMethod = 'sendPhoto'; tgField = 'photo'; }
        else if (media_type === 'audio') { tgMethod = 'sendAudio'; tgField = 'audio'; tgField = 'voice'; tgMethod = 'sendVoice'; }
        else if (media_type === 'video') { tgMethod = 'sendVideo'; tgField = 'video'; }
        
        // Override for voice/audio - use sendVoice for .ogg/.webm, sendAudio for .mp3
        if (media_type === 'audio') {
          const ext = path.extname(media_url || '').toLowerCase();
          if (['.ogg', '.webm', '.m4a'].includes(ext)) {
            tgMethod = 'sendVoice'; tgField = 'voice';
          } else {
            tgMethod = 'sendAudio'; tgField = 'audio';
          }
        }
        
        if (localFilePath && fs.existsSync(localFilePath)) {
          // Send as multipart/form-data with actual file
          const fileBuffer = fs.readFileSync(localFilePath);
          const fileName = path.basename(localFilePath);
          const boundary = '----TelegramBoundary' + Date.now();
          
          // Build multipart body (MUST use CRLF \r\n for HTTP multipart)
          const CRLF = '\r\n';
          let bodyParts = [];
          // chat_id field
          bodyParts.push(Buffer.from('--' + boundary + CRLF + 'Content-Disposition: form-data; name="chat_id"' + CRLF + CRLF + chatId + CRLF));
          // caption field
          if (caption) {
            bodyParts.push(Buffer.from('--' + boundary + CRLF + 'Content-Disposition: form-data; name="caption"' + CRLF + CRLF + caption + CRLF));
          }
          // file field
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.pdf': 'application/pdf', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
          const ext2 = path.extname(fileName).toLowerCase();
          const mime = mimeMap[ext2] || 'application/octet-stream';
          bodyParts.push(Buffer.from('--' + boundary + CRLF + 'Content-Disposition: form-data; name="' + tgField + '"; filename="' + fileName + '"' + CRLF + 'Content-Type: ' + mime + CRLF + CRLF));
          bodyParts.push(fileBuffer);
          bodyParts.push(Buffer.from(CRLF + '--' + boundary + '--' + CRLF));
          
          const body = Buffer.concat(bodyParts);
          
          await new Promise((resolve) => {
            const options = {
              hostname: 'api.telegram.org',
              path: `/bot${settings.telegram_token}/${tgMethod}`,
              method: 'POST',
              headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
              }
            };
            const reqHttp = https.request(options, (r) => {
              let data = '';
              r.on('data', chunk => data += chunk);
              r.on('end', () => {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.ok) { sendResult.sent = true; }
                  else { sendResult.error = parsed.description || 'Telegram error'; console.log('[TG send-media error]', parsed); }
                } catch(e) { sendResult.error = 'parse error'; }
                resolve();
              });
            });
            reqHttp.on('error', (e) => { sendResult.error = e.message; resolve(); });
            reqHttp.write(body);
            reqHttp.end();
          });
        } else {
          // Fallback: try by URL (only works if publicly accessible)
          let absoluteUrl = media_url;
          if (media_url.startsWith('/')) {
            absoluteUrl = `https://pro.areejegypt.com${media_url}`;
          }
          const tgPayload = JSON.stringify({ chat_id: chatId, [tgField]: absoluteUrl, ...(caption ? { caption } : {}) });
          await new Promise((resolve) => {
            const options = {
              hostname: 'api.telegram.org',
              path: `/bot${settings.telegram_token}/${tgMethod}`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(tgPayload) }
            };
            const reqHttp = https.request(options, (r) => {
              let data = '';
              r.on('data', chunk => data += chunk);
              r.on('end', () => {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.ok) { sendResult.sent = true; }
                  else { sendResult.error = parsed.description || 'Telegram error'; }
                } catch(e) { sendResult.error = 'parse error'; }
                resolve();
              });
            });
            reqHttp.on('error', (e) => { sendResult.error = e.message; resolve(); });
            reqHttp.write(tgPayload);
            reqHttp.end();
          });
        }
      } catch(e) {
        sendResult.error = e.message;
        console.error('[send-media error]', e);
      }
    }
    
    res.json({ ok: true, sent: sendResult.sent, note: sendResult.error || null });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX AUTO-MESSAGES (Welcome + Away)
// ============================================================
router.get('/inbox/auto-messages', requireAuth, (req, res) => {
  const db = req.db;
  try {
    let s = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!s) { db.prepare('INSERT OR IGNORE INTO inbox_settings (id) VALUES (1)').run(); s = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get(); }
    res.json({ ok: true, settings: {
      welcome_active: s.welcome_active || 0,
      welcome_message: s.welcome_message || '',
      away_active: s.away_active || 0,
      away_message: s.away_message || '',
      away_start: s.away_start || '22:00',
      away_end: s.away_end || '09:00'
    }});
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/inbox/auto-messages', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { welcome_active, welcome_message, away_active, away_message, away_start, away_end } = req.body;
    db.prepare('INSERT OR IGNORE INTO inbox_settings (id) VALUES (1)').run();
    db.prepare(`UPDATE inbox_settings SET welcome_active=?, welcome_message=?, away_active=?, away_message=?, away_start=?, away_end=? WHERE id=1`)
      .run(welcome_active?1:0, welcome_message||'', away_active?1:0, away_message||'', away_start||'22:00', away_end||'09:00');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX LABELS
// ============================================================
router.get('/inbox/labels', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM inbox_labels ORDER BY name').all();
    res.json({ ok: true, labels: rows });
  } catch(e) { res.json({ ok: true, labels: [] }); }
});
router.post('/inbox/labels', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, color } = req.body;
    if (!name) return res.json({ ok: false, error: 'name required' });
    const r = db.prepare('INSERT INTO inbox_labels (name, color) VALUES (?,?)').run(name, color||'#1B5E30');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
router.delete('/inbox/labels/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_labels WHERE id=?').run(req.params.id);
    db.prepare('DELETE FROM inbox_conversation_labels WHERE label_id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
// GET/POST labels on conversation
router.get('/inbox/conversations/:id/labels', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT l.* FROM inbox_labels l JOIN inbox_conversation_labels cl ON cl.label_id=l.id WHERE cl.conversation_id=?').all(req.params.id);
    res.json({ ok: true, labels: rows });
  } catch(e) { res.json({ ok: true, labels: [] }); }
});
router.post('/inbox/conversations/:id/labels/:labelId', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('INSERT OR IGNORE INTO inbox_conversation_labels (conversation_id, label_id) VALUES (?,?)').run(req.params.id, req.params.labelId);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
router.delete('/inbox/conversations/:id/labels/:labelId', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_conversation_labels WHERE conversation_id=? AND label_id=?').run(req.params.id, req.params.labelId);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX INTERNAL NOTES
// ============================================================
router.get('/inbox/conversations/:id/notes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const notes = db.prepare('SELECT n.*, u.name as author_name FROM inbox_notes n LEFT JOIN tenant_users u ON u.id=n.author_id WHERE n.conversation_id=? ORDER BY n.created_at DESC').all(req.params.id);
    res.json({ ok: true, notes });
  } catch(e) { res.json({ ok: true, notes: [] }); }
});
router.post('/inbox/conversations/:id/notes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { content } = req.body;
    if (!content) return res.json({ ok: false, error: 'content required' });
    const authorId = req.tenantUser ? req.tenantUser.id : req.user.id;
    const r = db.prepare('INSERT INTO inbox_notes (conversation_id, content, author_id) VALUES (?,?,?)').run(req.params.id, content, authorId);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX ASSIGNMENT
// ============================================================
router.post('/inbox/conversations/:id/assign', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { user_id, user_name } = req.body;
    db.prepare('UPDATE inbox_conversations SET assigned_to_id=?, assigned_to_name=? WHERE id=?').run(user_id||null, user_name||null, req.params.id);
    // تسجيل الحدث
    const actor = req.user?.name || req.user?.email || null;
    const eventType = user_id ? 'assigned' : 'unassigned';
    logTimeline(db, req.params.id, eventType, { actor, to_name: user_name || null });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX KEYWORD AUTO-REPLY
// ============================================================
router.get('/inbox/keywords', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM inbox_keywords ORDER BY keyword').all();
    res.json({ ok: true, keywords: rows });
  } catch(e) { res.json({ ok: true, keywords: [] }); }
});
router.post('/inbox/keywords', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { keyword, reply, active } = req.body;
    if (!keyword || !reply) return res.json({ ok: false, error: 'keyword and reply required' });
    const r = db.prepare('INSERT INTO inbox_keywords (keyword, reply, active) VALUES (?,?,?)').run(keyword.trim(), reply, active!==false?1:0);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
router.put('/inbox/keywords/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { keyword, reply, active } = req.body;
    db.prepare('UPDATE inbox_keywords SET keyword=COALESCE(?,keyword), reply=COALESCE(?,reply), active=COALESCE(?,active) WHERE id=?').run(keyword||null, reply||null, active!=null?active?1:0:null, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
router.delete('/inbox/keywords/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_keywords WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX BROADCAST (Phase 2 — Full Implementation)
// ============================================================

// Helper: send one Telegram message
async function _tgSend(token, chatId, text) {
  const https = require('https');
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req2 = https.request(opts, (r2) => {
      let data = '';
      r2.on('data', c => data += c);
      r2.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ ok: false, error: 'parse error' }); }
      });
    });
    req2.on('error', (e) => resolve({ ok: false, error: e.message }));
    req2.write(payload);
    req2.end();
  });
}

// GET /inbox/broadcasts — list (supports both `broadcasts` and `campaigns` keys)
router.get('/inbox/broadcasts', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // Ensure new columns exist
    try {
      const cols = db.prepare('PRAGMA table_info(inbox_broadcasts)').all().map(c => c.name);
      if (!cols.includes('total_recipients')) db.prepare('ALTER TABLE inbox_broadcasts ADD COLUMN total_recipients INTEGER DEFAULT 0').run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    const rows = db.prepare('SELECT * FROM inbox_broadcasts ORDER BY created_at DESC LIMIT 50').all();
    res.json({ ok: true, broadcasts: rows, campaigns: rows });
  } catch(e) { res.json({ ok: true, broadcasts: [], campaigns: [] }); }
});

// GET /inbox/broadcast/history
router.get('/inbox/broadcast/history', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM inbox_broadcasts ORDER BY created_at DESC LIMIT 50').all();
    res.json({ ok: true, history: rows });
  } catch(e) { res.json({ ok: true, history: [] }); }
});

// POST /inbox/broadcasts — create campaign
router.post('/inbox/broadcasts', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { title: rawTitle, name: rawName, message, platform, audience, recipients, scheduled_at } = req.body;
    const title = rawTitle || rawName || 'حملة جديدة';
    if (!message) return res.json({ ok: false, error: 'message required' });
    // Ensure columns
    try {
      const cols = db.prepare('PRAGMA table_info(inbox_broadcasts)').all().map(c => c.name);
      if (!cols.includes('total_recipients')) db.prepare('ALTER TABLE inbox_broadcasts ADD COLUMN total_recipients INTEGER DEFAULT 0').run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    const r = db.prepare('INSERT INTO inbox_broadcasts (title, message, platform, audience, status, scheduled_at) VALUES (?,?,?,?,?,?)')
      .run(title, message, platform||'telegram', JSON.stringify(recipients||audience||'all'), 'draft', scheduled_at||null);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /inbox/broadcast/send — unified send endpoint
router.post('/inbox/broadcast/send', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { platform, message, contact_ids, recipients, schedule_at } = req.body;
    if (!message) return res.json({ ok: false, error: 'message required' });
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings?.telegram_token) return res.json({ ok: false, error: 'تيليجرام غير مفعّل — اضبط الإعدادات أولاً' });
    // Ensure columns
    try {
      const cols = db.prepare('PRAGMA table_info(inbox_broadcasts)').all().map(c => c.name);
      if (!cols.includes('total_recipients')) db.prepare('ALTER TABLE inbox_broadcasts ADD COLUMN total_recipients INTEGER DEFAULT 0').run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    // Create campaign record
    const bRes = db.prepare(
      'INSERT INTO inbox_broadcasts (title, message, platform, audience, status) VALUES (?,?,?,?,?)'
    ).run('حملة ' + new Date().toLocaleDateString('ar-EG'), message, platform||'telegram', 'all', 'sending');
    const broadcastId = bRes.lastInsertRowid;
    // Get conversations
    let convs;
    if (contact_ids && Array.isArray(contact_ids) && contact_ids.length > 0) {
      convs = db.prepare(
        `SELECT * FROM inbox_conversations WHERE platform='telegram' AND id IN (${contact_ids.map(()=>'?').join(',')})`
      ).all(...contact_ids);
    } else {
      convs = db.prepare("SELECT DISTINCT sender_id, sender_name, id FROM inbox_conversations WHERE platform='telegram'").all();
    }
    const total = convs.length;
    db.prepare('UPDATE inbox_broadcasts SET total_recipients=? WHERE id=?').run(total, broadcastId);
    let sent = 0, failed = 0;
    for (const conv of convs) {
      // Insert recipient record
      let recId;
      try {
        const rr = db.prepare(
          'INSERT INTO inbox_broadcast_recipients (broadcast_id, contact_name, platform_id, status) VALUES (?,?,?,?)'
        ).run(broadcastId, conv.sender_name || conv.id, conv.sender_id, 'pending');
        recId = rr.lastInsertRowid;
      } catch(e) { console.error('[inbox.js]', e.message); }
      try {
        const tgResp = await _tgSend(settings.telegram_token, conv.sender_id, message);
        if (tgResp.ok) {
          sent++;
          if (recId) db.prepare("UPDATE inbox_broadcast_recipients SET status='sent', sent_at=datetime('now') WHERE id=?").run(recId);
          // Log in inbox_messages if conversation exists
          try {
            db.prepare(
              'INSERT INTO inbox_messages (conversation_id, platform, direction, content, message_type) VALUES (?,?,?,?,?)'
            ).run(conv.id, 'telegram', 'out', message, 'text');
          } catch(e) { console.error('[inbox.js]', e.message); }
        } else {
          failed++;
          if (recId) db.prepare('UPDATE inbox_broadcast_recipients SET status=?, error_msg=? WHERE id=?').run('failed', JSON.stringify(tgResp.description||tgResp.error), recId);
        }
      } catch(e) {
        failed++;
        if (recId) db.prepare('UPDATE inbox_broadcast_recipients SET status=?, error_msg=? WHERE id=?').run('failed', e.message, recId);
      }
      // Rate-limit: 100ms between messages
      await new Promise(r => setTimeout(r, 100));
    }
    db.prepare("UPDATE inbox_broadcasts SET status='done', sent_count=?, failed_count=?, sent_at=datetime('now') WHERE id="+broadcastId).run(sent, failed);
    res.json({ ok: true, sent, failed, total, broadcast_id: broadcastId });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /inbox/broadcast/test — send test message to a single chat_id
router.post('/inbox/broadcast/test', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { chat_id, message } = req.body;
    if (!chat_id || !message) return res.json({ ok: false, error: 'chat_id and message required' });
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings?.telegram_token) return res.json({ ok: false, error: 'تيليجرام غير مفعّل' });
    const resp = await _tgSend(settings.telegram_token, chat_id, '[TEST] ' + message);
    res.json({ ok: resp.ok, tg_response: resp });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /inbox/broadcasts/:id/send — send existing campaign by ID
router.post('/inbox/broadcasts/:id/send', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    // Ensure columns
    try {
      const cols = db.prepare('PRAGMA table_info(inbox_broadcasts)').all().map(c => c.name);
      if (!cols.includes('total_recipients')) db.prepare('ALTER TABLE inbox_broadcasts ADD COLUMN total_recipients INTEGER DEFAULT 0').run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    const broadcast = db.prepare('SELECT * FROM inbox_broadcasts WHERE id=?').get(req.params.id);
    if (!broadcast) return res.json({ ok: false, error: 'not found' });
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings?.telegram_token) return res.json({ ok: false, error: 'تيليجرام غير مفعّل' });
    let conversations = db.prepare("SELECT DISTINCT sender_id, sender_name, id FROM inbox_conversations WHERE platform='telegram'").all();
    if (broadcast.audience && broadcast.audience !== 'all' && broadcast.audience !== '"all"') {
      try {
        const aud = JSON.parse(broadcast.audience);
        if (Array.isArray(aud)) conversations = conversations.filter(c => aud.includes(c.id));
      } catch(e) { console.error('[inbox.js]', e.message); }
    }
    db.prepare('UPDATE inbox_broadcasts SET status=?, total_recipients=? WHERE id=?').run('sending', conversations.length, broadcast.id);
    let sent = 0, failed = 0;
    for (const conv of conversations) {
      try {
        const resp = await _tgSend(settings.telegram_token, conv.sender_id, broadcast.message);
        if (resp.ok) sent++; else failed++;
      } catch(e) { failed++; }
      await new Promise(r => setTimeout(r, 100));
    }
    db.prepare("UPDATE inbox_broadcasts SET status='sent', sent_count=?, failed_count=?, sent_at=datetime('now') WHERE id=?").run(sent, failed, broadcast.id);
    res.json({ ok: true, sent, failed, total: conversations.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX CHATBOT
// ============================================================
router.get('/inbox/chatbot', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const flows = db.prepare('SELECT * FROM inbox_chatbot_flows ORDER BY id').all();
    const settings = db.prepare('SELECT chatbot_active, chatbot_trigger FROM inbox_settings WHERE id=1').get();
    res.json({ ok: true, flows, active: settings?.chatbot_active||0, trigger: settings?.chatbot_trigger||'' });
  } catch(e) { res.json({ ok: true, flows: [], active: 0, trigger: '' }); }
});

router.post('/inbox/chatbot/flow', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { trigger_text, response_text, is_start, parent_id } = req.body;
    const r = db.prepare('INSERT INTO inbox_chatbot_flows (trigger_text, response_text, is_start, parent_id) VALUES (?,?,?,?)')
      .run(trigger_text||'', response_text||'', is_start?1:0, parent_id||null);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/inbox/chatbot/flow/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_chatbot_flows WHERE id=? OR parent_id=?').run(req.params.id, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/inbox/chatbot/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { active, trigger } = req.body;
    db.prepare('INSERT OR IGNORE INTO inbox_settings (id) VALUES (1)').run();
    db.prepare('UPDATE inbox_settings SET chatbot_active=?, chatbot_trigger=? WHERE id=1').run(active?1:0, trigger||'');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX ANALYTICS
// ============================================================
router.get('/inbox/analytics', requireAuth, (req, res) => {
  const db = req.db;
  if (!db) return res.json({ ok: false, error: 'no tenant db' });
  try {
    const { from, to } = req.query;
    let where = "WHERE 1=1";
    if (from) where += ` AND date(created_at) >= '${from}'`;
    if (to)   where += ` AND date(created_at) <= '${to}'`;

    const totalConvs    = db.prepare(`SELECT COUNT(*) as c FROM inbox_conversations ${where}`).get().c;
    const totalMessages = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages ${where}`).get().c;
    const inMessages    = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages ${where} AND direction='in'`).get().c;
    const outMessages   = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages ${where} AND direction='out'`).get().c;
    const byPlatform    = db.prepare(`SELECT platform, COUNT(*) as c FROM inbox_conversations ${where} GROUP BY platform`).all();
    const newContacts   = db.prepare(`SELECT COUNT(*) as c FROM inbox_conversations ${where} AND lead_id IS NOT NULL`).get().c;
    // Daily messages last 7 days
    const daily = db.prepare(`SELECT date(sent_at) as day, COUNT(*) as c FROM inbox_messages WHERE date(sent_at) >= date('now','-7 days') GROUP BY day ORDER BY day ASC`).all();

    res.json({ ok: true, analytics: {
      total_conversations: totalConvs,
      total_messages: totalMessages,
      incoming: inMessages,
      outgoing: outMessages,
      by_platform: byPlatform,
      converted_to_lead: newContacts,
      daily_last_7_days: daily
    }});
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX AUTOMATION RULES (Phase 3)
// ============================================================
router.get('/inbox/automation-rules', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // Ensure table exists
    db.prepare(`CREATE TABLE IF NOT EXISTS inbox_automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      condition_type TEXT,
      condition_value TEXT,
      condition_field TEXT DEFAULT 'message',
      platform TEXT DEFAULT 'all',
      action_type TEXT,
      action_value TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    )`).run();
    const rules = db.prepare('SELECT * FROM inbox_automation_rules ORDER BY priority DESC, id ASC').all();
    res.json({ ok: true, rules });
  } catch(e) { res.json({ ok: true, rules: [] }); }
});

router.post('/inbox/automation-rules', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS inbox_automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      condition_type TEXT,
      condition_value TEXT,
      condition_field TEXT DEFAULT 'message',
      platform TEXT DEFAULT 'all',
      action_type TEXT,
      action_value TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    )`).run();
    const { name, condition_type, condition_value, condition_field, platform, action_type, action_value, priority } = req.body;
    if (!name || !action_type) return res.json({ ok: false, error: 'name and action_type required' });
    const r = db.prepare(`INSERT INTO inbox_automation_rules 
      (name, active, priority, condition_type, condition_value, condition_field, platform, action_type, action_value)
      VALUES (?,1,?,?,?,?,?,?,?)`)
      .run(name, priority||0, condition_type||'contains', condition_value||'', condition_field||'message', platform||'all', action_type, action_value||'');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.put('/inbox/automation-rules/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { active, name, condition_type, condition_value, condition_field, platform, action_type, action_value, priority } = req.body;
    if (active !== undefined) {
      db.prepare('UPDATE inbox_automation_rules SET active=? WHERE id=?').run(active?1:0, req.params.id);
    } else {
      db.prepare(`UPDATE inbox_automation_rules SET name=?, condition_type=?, condition_value=?, condition_field=?, platform=?, action_type=?, action_value=?, priority=? WHERE id=?`)
        .run(name, condition_type, condition_value, condition_field||'message', platform||'all', action_type, action_value, priority||0, req.params.id);
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/inbox/automation-rules/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_automation_rules WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX TEMPLATES WITH VARIABLES (Phase 3b)
// ============================================================
router.post('/inbox/templates/render', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { template_id, conversation_id } = req.body;
    const tmpl = db.prepare('SELECT * FROM inbox_templates WHERE id=?').get(template_id);
    if (!tmpl) return res.json({ ok: false, error: 'template not found' });
    let text = tmpl.content;
    // Get context for variable substitution
    const profile = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get() || {};
    const conv = conversation_id ? db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(conversation_id) : null;
    const vars = {
      customer_name: conv?.sender_name || 'عزيزي العميل',
      company_name: profile.company_name || 'أريج',
      agent_name: 'فريق خدمة العملاء',
      order_no: '',
      invoice_no: ''
    };
    // If conv has lead_id, try to get order info
    if (conv?.lead_id) {
      try {
        const lastOrder = db.prepare('SELECT * FROM sys_orders WHERE contact_id=? ORDER BY id DESC LIMIT 1').get(conv.lead_id);
        if (lastOrder) vars.order_no = lastOrder.order_no;
        const lastInv = db.prepare('SELECT * FROM sys_invoices WHERE contact_id=? ORDER BY id DESC LIMIT 1').get(conv.lead_id);
        if (lastInv) vars.invoice_no = lastInv.invoice_no;
      } catch(e) { console.error('[inbox.js]', e.message); }
    }
    // Replace variables
    Object.keys(vars).forEach(k => {
      text = text.replace(new RegExp('{{\\s*' + k + '\\s*}}', 'gi'), vars[k]);
    });
    res.json({ ok: true, text });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX AGENT STATUS (Phase 5)
// ============================================================
router.get('/inbox/agent-status', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS inbox_agent_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      status TEXT DEFAULT 'online',
      updated_at DATETIME DEFAULT (datetime('now'))
    )`).run();
    const statuses = db.prepare('SELECT * FROM inbox_agent_status ORDER BY updated_at DESC').all();
    res.json({ ok: true, statuses });
  } catch(e) { res.json({ ok: true, statuses: [] }); }
});

router.post('/inbox/agent-status', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS inbox_agent_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      status TEXT DEFAULT 'online',
      updated_at DATETIME DEFAULT (datetime('now'))
    )`).run();
    const { status } = req.body; // online | away | busy | offline
    const userId = req.user.id;
    const userName = req.user.name || req.user.email;
    const existing = db.prepare('SELECT id FROM inbox_agent_status WHERE user_id=?').get(userId);
    if (existing) {
      db.prepare("UPDATE inbox_agent_status SET status=?, updated_at=datetime('now') WHERE user_id=?").run(status||'online', userId);
    } else {
      db.prepare('INSERT INTO inbox_agent_status (user_id, user_name, status) VALUES (?,?,?)').run(userId, userName, status||'online');
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// COLLISION DETECTION (Typing State)
// ============================================================

// POST /api/system/inbox/typing-state
// body: { conv_id, typing: true|false }
// يُحدّث حالة "يكتب" للموظّف الحالي على محادثة محددة
router.post('/inbox/typing-state', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // lazy migrate — إضافة العمودين لو مش موجودين
    const cols = db.prepare('PRAGMA table_info(inbox_agent_status)').all().map(c => c.name);
    if (!cols.includes('typing_conv_id')) {
      db.prepare('ALTER TABLE inbox_agent_status ADD COLUMN typing_conv_id INTEGER').run();
    }
    if (!cols.includes('typing_at')) {
      db.prepare('ALTER TABLE inbox_agent_status ADD COLUMN typing_at TEXT').run();
    }

    const { conv_id, typing } = req.body;
    const userId   = req.user.id;
    const userName = req.user.name || req.user.email;
    const now      = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM inbox_agent_status WHERE user_id=?').get(userId);
    if (existing) {
      db.prepare(`UPDATE inbox_agent_status
        SET typing_conv_id=?, typing_at=?, updated_at=datetime('now')
        WHERE user_id=?`
      ).run(typing ? (conv_id || null) : null, typing ? now : null, userId);
    } else {
      db.prepare(`INSERT INTO inbox_agent_status (user_id, user_name, typing_conv_id, typing_at)
        VALUES (?,?,?,?)`
      ).run(userId, userName, typing ? (conv_id || null) : null, typing ? now : null);
    }

    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/conversations/:id/typing-agents
// يُرجع الموظّفين الذين يكتبون في هذه المحادثة (تجاهل المستخدم الحالي + القديمة > 10 ثواني)
router.get('/inbox/conversations/:id/typing-agents', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const cols = db.prepare('PRAGMA table_info(inbox_agent_status)').all().map(c => c.name);
    if (!cols.includes('typing_conv_id')) return res.json({ ok: true, agents: [] });

    const convId  = parseInt(req.params.id, 10);
    const myId    = req.user.id;
    // نتجاهل النفس + نشاطات قديمة > 10 ثواني (heartbeat timeout)
    const cutoff  = new Date(Date.now() - 10000).toISOString();
    const agents  = db.prepare(`
      SELECT user_name FROM inbox_agent_status
      WHERE typing_conv_id=?
        AND user_id != ?
        AND typing_at IS NOT NULL
        AND typing_at >= ?
    `).all(convId, myId, cutoff);

    res.json({ ok: true, agents: agents.map(a => a.user_name) });
  } catch(e) { res.json({ ok: true, agents: [] }); }
});

// ============================================================
// INBOX QUEUE (Phase 5b)
// ============================================================
router.get('/inbox/queue', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // Conversations that are open and unassigned
    const queued = db.prepare(`
      SELECT c.*, 
        ROUND((julianday('now') - julianday(c.last_message_at)) * 24 * 60) as wait_minutes
      FROM inbox_conversations c
      WHERE (c.status = 'open' OR c.status IS NULL)
      AND (c.assigned_to_id IS NULL OR c.assigned_to_id = 0)
      ORDER BY c.last_message_at ASC
      LIMIT 50
    `).all();
    res.json({ ok: true, queue: queued });
  } catch(e) { res.json({ ok: true, queue: [] }); }
});

// ============================================================
// INBOX ANALYTICS ENHANCED (Phase 6)
// ============================================================
router.get('/inbox/analytics/advanced', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Total conversations
    const totalConvs = db.prepare(`SELECT COUNT(*) as c FROM inbox_conversations WHERE last_message_at >= datetime('now', '-${days} days')`).get()?.c || 0;
    
    // By platform
    const byPlatform = db.prepare(`SELECT platform, COUNT(*) as count FROM inbox_conversations WHERE last_message_at >= datetime('now', '-${days} days') GROUP BY platform`).all();
    
    // Average response time (minutes)
    const avgResponseTime = db.prepare(`
      SELECT AVG(diff_minutes) as avg_mins FROM (
        SELECT m_in.conversation_id,
          MIN(ROUND((julianday(m_out.sent_at) - julianday(m_in.sent_at)) * 24 * 60)) as diff_minutes
        FROM inbox_messages m_in
        JOIN inbox_messages m_out ON m_out.conversation_id = m_in.conversation_id
          AND m_out.direction = 'out'
          AND m_out.sent_at > m_in.sent_at
        WHERE m_in.direction = 'in'
          AND m_in.sent_at >= datetime('now', '-${days} days')
        GROUP BY m_in.id
      )
    `).get()?.avg_mins || 0;
    
    // Messages count
    const totalMessages = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages WHERE sent_at >= datetime('now', '-${days} days')`).get()?.c || 0;
    const inMessages = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages WHERE direction='in' AND sent_at >= datetime('now', '-${days} days')`).get()?.c || 0;
    const outMessages = db.prepare(`SELECT COUNT(*) as c FROM inbox_messages WHERE direction='out' AND sent_at >= datetime('now', '-${days} days')`).get()?.c || 0;
    
    // Daily trend
    const dailyTrend = db.prepare(`
      SELECT DATE(last_message_at) as date, COUNT(*) as conversations
      FROM inbox_conversations
      WHERE last_message_at >= datetime('now', '-${days} days')
      GROUP BY DATE(last_message_at)
      ORDER BY date ASC
    `).all();
    
    // Top keywords from messages
    const recentMessages = db.prepare(`SELECT content FROM inbox_messages WHERE direction='in' AND sent_at >= datetime('now', '-${days} days') LIMIT 500`).all();
    const wordFreq = {};
    const stopWords = new Set(['في','من','على','إلى','عن','هل','أنا','ما','لا','نعم','ان','التي','الذي','هذا','هذه','مع']);
    recentMessages.forEach(m => {
      if (!m.content) return;
      m.content.split(/\s+/).forEach(w => {
        const word = w.replace(/[^\u0600-\u06FF]/g, '').trim();
        if (word.length > 2 && !stopWords.has(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
    });
    const topKeywords = Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([word,count])=>({word,count}));
    
    // Open vs closed
    const statusBreakdown = db.prepare(`SELECT COALESCE(status,'open') as status, COUNT(*) as count FROM inbox_conversations GROUP BY COALESCE(status,'open')`).all();

    // Top customers by message count
    const topCustomers = db.prepare(`
      SELECT c.sender_name, c.platform, c.sender_phone,
             COUNT(m.id) as msg_count
      FROM inbox_conversations c
      JOIN inbox_messages m ON m.conversation_id = c.id
      WHERE m.sent_at >= datetime('now', '-${days} days')
        AND m.direction = 'in'
      GROUP BY c.id
      ORDER BY msg_count DESC
      LIMIT 5
    `).all();

    // Resolution rate (closed / total)
    const closedCount = statusBreakdown.find(s => s.status === 'closed')?.count || 0;
    const totalAll    = statusBreakdown.reduce((s, r) => s + r.count, 0);
    const resolutionRate = totalAll > 0 ? Math.round((closedCount / totalAll) * 100) : 0;
    
    res.json({ ok: true, analytics: {
      period_days: days,
      total_conversations: totalConvs,
      total_messages: totalMessages,
      incoming_messages: inMessages,
      outgoing_messages: outMessages,
      avg_response_minutes: Math.round(avgResponseTime),
      resolution_rate: resolutionRate,
      by_platform: byPlatform,
      daily_trend: dailyTrend,
      top_keywords: topKeywords,
      status_breakdown: statusBreakdown,
      top_customers: topCustomers
    }});
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX CONTACT NOTES (Internal - Phase 4)
// ============================================================
router.get('/inbox/conversations/:id/notes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const notes = db.prepare('SELECT * FROM inbox_notes WHERE conversation_id=? ORDER BY created_at DESC').all(req.params.id);
    res.json({ ok: true, notes });
  } catch(e) { res.json({ ok: true, notes: [] }); }
});

router.post('/inbox/conversations/:id/notes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { content } = req.body;
    if (!content) return res.json({ ok: false, error: 'content required' });
    // Ensure table has user columns
    try {
      const cols = db.prepare('PRAGMA table_info(inbox_notes)').all().map(c=>c.name);
      if (!cols.includes('user_name')) db.prepare('ALTER TABLE inbox_notes ADD COLUMN user_name TEXT').run();
    } catch(e) { console.error('[inbox.js]', e.message); }
    const r = db.prepare("INSERT INTO inbox_notes (conversation_id, content, user_name, created_at) VALUES (?,?,?,datetime('now'))")
      .run(req.params.id, content, req.user?.name || req.user?.email || 'أنت');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/inbox/conversations/:id/notes/:noteId', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_notes WHERE id=? AND conversation_id=?').run(req.params.noteId, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// INBOX VOICE NOTE UPLOAD (Phase 1d)
// ============================================================
router.post('/inbox/upload-voice', requireAuth, (req, res) => {
  // Handled by multer inboxUpload - same as upload-media but forced audio type
  inboxUpload.single('audio')(req, res, (err) => {
    if (err || !req.file) return res.json({ ok: false, error: err?.message || 'no file' });
    const userId = req.user?.id || 'shared';
    const url = '/uploads/inbox/' + userId + '/' + req.file.filename;
    res.json({ ok: true, url, media_type: 'audio', original_name: req.file.originalname });
  });
});

// ============================================================
// INBOX CONVERSATION STATUS + SEARCH
// ============================================================

// PUT /api/system/inbox/conversations/:id/status
router.put('/inbox/conversations/:id/status', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { status } = req.body; // open | closed | waiting
    if (!['open','closed','waiting'].includes(status)) return res.json({ ok:false, error:'invalid status' });
    db.prepare('UPDATE inbox_conversations SET status=? WHERE id=?').run(status, req.params.id);
    // تسجيل الحدث في التاريخ
    const actor = req.user?.name || req.user?.email || null;
    logTimeline(db, req.params.id, 'status_changed', { actor, status });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/inbox/conversations/:id/snooze
// body: { minutes: 30 | 60 | 180 | 1440 | 0 }  — 0 = إلغاء snooze
router.post('/inbox/conversations/:id/snooze', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // migrate: إضافة عمود snoozed_until لو مش موجود
    const cols = db.prepare('PRAGMA table_info(inbox_conversations)').all().map(c => c.name);
    if (!cols.includes('snoozed_until')) {
      db.prepare('ALTER TABLE inbox_conversations ADD COLUMN snoozed_until TEXT').run();
    }

    const { minutes } = req.body;
    const mins = parseInt(minutes, 10);

    const actor = req.user?.name || req.user?.email || null;

    if (mins === 0) {
      // إلغاء snooze — أعِد الحالة لـ open
      db.prepare('UPDATE inbox_conversations SET snoozed_until=NULL, status=? WHERE id=?')
        .run('open', req.params.id);
      logTimeline(db, req.params.id, 'unsnoozed', { actor });
      return res.json({ ok: true, action: 'unsnooze' });
    }

    if (isNaN(mins) || mins < 1 || mins > 10080) {
      return res.json({ ok: false, error: 'قيمة الوقت غير صالحة' });
    }

    // احسب وقت الإيقاظ
    const wakeAt = new Date(Date.now() + mins * 60 * 1000).toISOString();

    db.prepare('UPDATE inbox_conversations SET snoozed_until=?, status=? WHERE id=?')
      .run(wakeAt, 'snoozed', req.params.id);

    logTimeline(db, req.params.id, 'snoozed', { actor, minutes: mins, until: wakeAt });
    res.json({ ok: true, action: 'snoozed', snoozed_until: wakeAt });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/conversations/:id/timeline
router.get('/inbox/conversations/:id/timeline', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const cols = db.prepare('PRAGMA table_info(inbox_timeline)').all().map(c => c.name);
    if (!cols.length) return res.json({ ok: true, events: [] }); // الجدول ما اتنشأش
    const events = db.prepare(
      `SELECT * FROM inbox_timeline WHERE conversation_id=? ORDER BY created_at ASC`
    ).all(req.params.id);
    // parse meta JSON
    events.forEach(e => {
      try { e.meta = JSON.parse(e.meta || '{}'); } catch { e.meta = {}; }
    });
    res.json({ ok: true, events });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/snooze-wakeup
// يُستدعى من polling لإيقاظ المحادثات التي انتهى وقت snooze-ها
router.get('/inbox/snooze-wakeup', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const cols = db.prepare('PRAGMA table_info(inbox_conversations)').all().map(c => c.name);
    if (!cols.includes('snoozed_until')) return res.json({ ok: true, woken: [] });

    const now = new Date().toISOString();
    const due = db.prepare(`
      SELECT id FROM inbox_conversations
      WHERE status='snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?
    `).all(now);

    if (due.length) {
      const ids = due.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE inbox_conversations SET status='open', snoozed_until=NULL WHERE id IN (${placeholders})`)
        .run(...ids);
    }

    res.json({ ok: true, woken: due.map(r => r.id) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/inbox/conversations/bulk-action
// body: { ids: [1,2,3], action: 'close'|'open'|'waiting'|'assign'|'label', payload: {} }
router.post('/inbox/conversations/bulk-action', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { ids, action, payload = {} } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: false, error: 'لا توجد IDs' });
    const safeIds = ids.map(Number).filter(n => n > 0);
    if (!safeIds.length) return res.json({ ok: false, error: 'IDs غير صالحة' });
    const ph = safeIds.map(() => '?').join(',');
    const actor = req.user?.name || req.user?.email || null;

    switch (action) {
      case 'close':
      case 'open':
      case 'waiting': {
        const status = action === 'close' ? 'closed' : action;
        db.prepare(`UPDATE inbox_conversations SET status=? WHERE id IN (${ph})`).run(status, ...safeIds);
        safeIds.forEach(id => logTimeline(db, id, 'status_changed', { actor, status }));
        break;
      }
      case 'assign': {
        const { user_id, user_name } = payload;
        db.prepare(`UPDATE inbox_conversations SET assigned_to_id=?, assigned_to_name=? WHERE id IN (${ph})`)
          .run(user_id || null, user_name || null, ...safeIds);
        const evtType = user_id ? 'assigned' : 'unassigned';
        safeIds.forEach(id => logTimeline(db, id, evtType, { actor, to_name: user_name || null }));
        break;
      }
      case 'label': {
        const { label_id } = payload;
        if (!label_id) return res.json({ ok: false, error: 'لا يوجد label_id' });
        // إضافة التسمية لكل محادثة لو ما كانتش موجودة
        const addLabel = db.prepare(
          `INSERT OR IGNORE INTO inbox_conversation_labels (conversation_id, label_id) VALUES (?,?)`
        );
        safeIds.forEach(id => {
          try { addLabel.run(id, label_id); } catch(e) { /* تجاهل */ }
        });
        break;
      }
      default:
        return res.json({ ok: false, error: 'فعل غير مدعوم' });
    }

    res.json({ ok: true, affected: safeIds.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/inbox/conversations/bulk-message
// body: { ids: [1,2,3], message: 'نص الرسالة' }
router.post('/inbox/conversations/bulk-message', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { ids, message } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: false, error: 'لا توجد IDs' });
    if (!message || !message.trim()) return res.json({ ok: false, error: 'الرسالة فارغة' });

    const safeIds  = ids.map(Number).filter(n => n > 0);
    const content  = message.trim();
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    const results  = { sent: 0, failed: 0, errors: [] };

    for (const convId of safeIds) {
      const conv = db.prepare('SELECT id, sender_id, platform FROM inbox_conversations WHERE id=?').get(convId);
      if (!conv) { results.failed++; results.errors.push(`conv ${convId}: غير موجود`); continue; }

      // حفظ في DB
      db.prepare(`INSERT INTO inbox_messages (conversation_id, platform, direction, content, sent_at) VALUES (?,?,?,?,datetime('now'))`)
        .run(convId, conv.platform, 'out', content);
      db.prepare(`UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now') WHERE id=?`)
        .run(content, convId);

      // إرسال حسب المنصة
      let sent = false;
      try {
        if (conv.platform === 'telegram' && settings?.telegram_token && settings?.telegram_active) {
          const https = require('https');
          const payload = JSON.stringify({ chat_id: conv.sender_id, text: content });
          await new Promise((resolve) => {
            const options = {
              hostname: 'api.telegram.org',
              path: `/bot${settings.telegram_token}/sendMessage`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            };
            const r = require('https').request(options, (res2) => { res2.resume(); sent = true; resolve(); });
            r.on('error', () => resolve());
            r.write(payload); r.end();
          });
        } else if (conv.platform === 'whatsapp-qr') {
          const waQRService = require('../whatsapp-qr-service');
          await waQRService.sendMessage(req.user.id, conv.sender_id, content);
          sent = true;
        } else if (conv.platform === 'whatsapp') {
          // WhatsApp API — رسائل نصية عادية (24h window مطلوبة)
          const { wa_token, wa_phone_id } = getWaCredentials(db);
          if (wa_token && wa_phone_id) {
            const r = await fetch(`https://graph.facebook.com/v19.0/${wa_phone_id}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa_token}` },
              body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.sender_id, type: 'text', text: { body: content } })
            });
            const d = await r.json();
            if (!d.error) sent = true;
            else results.errors.push(`conv ${convId}: ${d.error.message}`);
          }
        }
        if (sent) results.sent++;
        else results.failed++;
      } catch(e) {
        results.failed++;
        results.errors.push(`conv ${convId}: ${e.message}`);
      }

      // تأخير بسيط لتجنب الحظر (rate-limit)
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({ ok: true, sent: results.sent, failed: results.failed, errors: results.errors });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/inbox/search?q=xxx&platform=&type=all|messages|convs&limit=20
router.get('/inbox/search', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const q        = (req.query.q || '').trim();
    const platform = (req.query.platform || '').trim();
    const type     = req.query.type || 'all';            // 'all' | 'messages' | 'convs'
    const limit    = Math.min(parseInt(req.query.limit) || 20, 50);

    if (q.length < 2) return res.json({ ok: true, results: { messages: [], conversations: [], total: 0 } });

    const like    = '%' + q + '%';
    const platCnd = platform ? ' AND c.platform = ?' : '';
    const platArg = platform ? [platform] : [];

    // ── helper: استخراج snippet محيط بالكلمة (80 حرف يسار + 80 يمين)
    function snippet(text, keyword) {
      if (!text) return '';
      const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx === -1) return text.slice(0, 120);
      const start = Math.max(0, idx - 60);
      const end   = Math.min(text.length, idx + keyword.length + 60);
      const pre   = start > 0 ? '…' : '';
      const suf   = end < text.length ? '…' : '';
      return pre + text.slice(start, end) + suf;
    }

    let messages = [];
    let convs    = [];

    // ── بحث في محتوى الرسائل
    if (type === 'all' || type === 'messages') {
      const rows = db.prepare(`
        SELECT m.id, m.conversation_id, m.direction, m.content, m.sent_at,
               m.media_type, m.is_note,
               c.sender_name, c.sender_id, c.platform, c.status
        FROM inbox_messages m
        JOIN inbox_conversations c ON c.id = m.conversation_id
        WHERE m.content LIKE ? AND m.is_note = 0 ${platCnd}
        ORDER BY m.sent_at DESC
        LIMIT ?
      `).all(like, ...platArg, limit);

      messages = rows.map(r => ({
        ...r,
        snippet: snippet(r.content, q),
      }));
    }

    // ── بحث في أسماء المحادثات + sender_id
    if (type === 'all' || type === 'convs') {
      const cWhere = platform ? ' AND platform = ?' : '';
      const cArgs  = platform ? [like, like, platform] : [like, like];
      convs = db.prepare(`
        SELECT id, sender_name, sender_id, platform, status, last_message, last_message_at,
               unread_count, assigned_to_name
        FROM inbox_conversations
        WHERE (sender_name LIKE ? OR sender_id LIKE ?) ${cWhere}
        ORDER BY last_message_at DESC
        LIMIT ?
      `).all(...cArgs, Math.min(limit, 15));
    }

    res.json({
      ok: true,
      results: {
        messages,
        conversations: convs,
        total: messages.length + convs.length,
        query: q,
      }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// SLA: GET /api/system/inbox/sla
router.get('/inbox/sla', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get() || {};
    const slaMinutes = settings.sla_minutes || 120;
    // Conversations open more than SLA minutes without reply
    const breached = db.prepare(`
      SELECT c.*, 
        ROUND((julianday('now') - julianday(c.last_message_at)) * 24 * 60) as minutes_waiting
      FROM inbox_conversations c
      WHERE c.status = 'open'
      AND c.last_message_at < datetime('now', '-' || ? || ' minutes')
      AND NOT EXISTS (
        SELECT 1 FROM inbox_messages m 
        WHERE m.conversation_id = c.id AND m.direction = 'out'
        AND m.sent_at > c.last_message_at
      )
      ORDER BY c.last_message_at ASC
      LIMIT 20
    `).all(slaMinutes);
    res.json({ ok:true, sla_minutes: slaMinutes, breached, count: breached.length });
  } catch(e) { res.json({ ok:false, error: e.message }); }
});

router.post('/inbox/sla/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { sla_minutes } = req.body;
    db.prepare('INSERT OR IGNORE INTO inbox_settings (id) VALUES (1)').run();
    try { db.prepare('ALTER TABLE inbox_settings ADD COLUMN sla_minutes INTEGER DEFAULT 120').run(); } catch(e) { console.error('[inbox.js]', e.message); }
    db.prepare('UPDATE inbox_settings SET sla_minutes=? WHERE id=1').run(parseInt(sla_minutes)||120);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// CSAT: POST /api/public/inbox/csat/:token
// (handled in routes-public.js)

// Assignment: GET available agents
router.get('/inbox/agents', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const agents = db.prepare(`
      SELECT u.id, u.name, u.email, u.inbox_active, u.max_concurrent, u.permissions, u.active,
             s.status as agent_status,
             COUNT(c.id) as active_convs
      FROM tenant_users u
      LEFT JOIN inbox_agent_status s ON s.user_id = u.id
      LEFT JOIN inbox_conversations c ON c.assigned_to_id = u.id
        AND (c.status='open' OR c.status IS NULL)
      WHERE u.active=1
      GROUP BY u.id
    `).all();
    const isOwner = !req.tenantUser;
    // إضافة perms object لكل agent
    const agentsWithPerms = agents.map(a => {
      let perms = {};
      try { perms = JSON.parse(a.permissions || '{}'); } catch(e) {}
      return { ...a, perms };
    });
    res.json({
      ok: true,
      isOwner,
      currentUserId: req.tenantUser?.id || null,
      agents: [
        { id: req.user.id, name: req.user.name, email: req.user.email, is_owner: true, agent_status: 'online', active_convs: 0, perms: {} },
        ...agentsWithPerms
      ]
    });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// POST /api/system/inbox/user-perms — تعديل صلاحيات/إعدادات موظف في الـ Inbox
router.post('/inbox/user-perms', requireAuth, (req, res) => {
  const db = req.db;
  const isOwner = !req.tenantUser;
  if (!isOwner) return res.json({ ok: false, error: 'غير مصرح' });

  const { user_id, perm, value } = req.body;
  if (!user_id || !perm) return res.json({ ok: false, error: 'بيانات ناقصة' });

  try {
    const user = db.prepare('SELECT id, permissions, active, inbox_active, max_concurrent FROM tenant_users WHERE id=?').get(user_id);
    if (!user) return res.json({ ok: false, error: 'مستخدم غير موجود' });

    // حقول خاصة غير JSON
    if (perm === 'inbox_active') {
      db.prepare('UPDATE tenant_users SET inbox_active=? WHERE id=?').run(value ? 1 : 0, user_id);
      return res.json({ ok: true });
    }
    if (perm === 'max_concurrent') {
      // محاولة تحديث عمود max_concurrent لو كان موجود
      try {
        db.prepare('ALTER TABLE tenant_users ADD COLUMN max_concurrent INTEGER DEFAULT 10').run();
      } catch(e) { /* column already exists */ }
      db.prepare('UPDATE tenant_users SET max_concurrent=? WHERE id=?').run(parseInt(value)||10, user_id);
      return res.json({ ok: true });
    }

    // صلاحيات JSON
    const ALLOWED_PERMS = ['inbox.view_all','inbox.assign','inbox.delete','inbox.export','inbox.admin','full_access'];
    if (!ALLOWED_PERMS.includes(perm)) return res.json({ ok: false, error: 'صلاحية غير معروفة' });

    let perms = {};
    try { perms = JSON.parse(user.permissions || '{}'); } catch(e) { perms = {}; }
    if (value) perms[perm] = true;
    else delete perms[perm];
    db.prepare('UPDATE tenant_users SET permissions=? WHERE id=?').run(JSON.stringify(perms), user_id);
    return res.json({ ok: true, perms });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// GET /api/system/inbox/me — معلومات المستخدم الحالي في الـ Inbox
router.get('/inbox/me', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const isOwner = !req.tenantUser;
    const userId  = req.tenantUser?.id || null;
    const perms   = req.tenantUser ? JSON.parse(req.tenantUser.permissions || '{}') : {};
    const canSeeAll = isOwner || perms['inbox.view_all'] || perms['full_access'];

    // عدد المحادثات المعيّنة للمستخدم الحالي
    let myConvs = 0;
    if (userId) {
      myConvs = db.prepare(`SELECT COUNT(*) as c FROM inbox_conversations WHERE assigned_to_id=? AND (status='open' OR status IS NULL)`).get(userId)?.c || 0;
    }

    // عدد غير المعيّنة
    const unassigned = db.prepare(`SELECT COUNT(*) as c FROM inbox_conversations WHERE (assigned_to_id IS NULL OR assigned_to_id=0) AND (status='open' OR status IS NULL)`).get()?.c || 0;

    res.json({ ok: true, isOwner, canSeeAll, userId, myConvs, unassigned });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/inbox/conversations/:id/csat-token
router.post('/inbox/conversations/:id/csat-token', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { token } = req.body;
    db.prepare('UPDATE inbox_conversations SET csat_token=? WHERE id=?').run(token, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ============================================================
// DRIP CAMPAIGNS
// ============================================================
router.get('/inbox/drip', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const campaigns = db.prepare('SELECT * FROM inbox_drip_campaigns ORDER BY created_at DESC').all();
    res.json({ ok:true, campaigns });
  } catch(e) { res.json({ ok:true, campaigns:[] }); }
});

router.post('/inbox/drip', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, trigger, steps } = req.body; // trigger: 'new_contact'|'after_purchase'|'custom'
    if (!name || !steps?.length) return res.json({ ok:false, error:'name and steps required' });
    const r = db.prepare('INSERT INTO inbox_drip_campaigns (name, trigger, steps, active) VALUES (?,?,?,1)')
      .run(name, trigger||'new_contact', JSON.stringify(steps));
    res.json({ ok:true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

router.put('/inbox/drip/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { active } = req.body;
    db.prepare('UPDATE inbox_drip_campaigns SET active=? WHERE id=?').run(active?1:0, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

router.delete('/inbox/drip/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_drip_campaigns WHERE id=?').run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// Trigger drip manually for a conversation
router.post('/inbox/drip/:id/trigger/:convId', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const campaign = db.prepare('SELECT * FROM inbox_drip_campaigns WHERE id=?').get(req.params.id);
    if (!campaign || !campaign.active) return res.json({ ok:false, error:'campaign not found or inactive' });
    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(req.params.convId);
    if (!conv) return res.json({ ok:false, error:'conversation not found' });
    const steps = JSON.parse(campaign.steps || '[]');
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    let sent = 0;
    for (const step of steps) {
      // step: { delay_minutes, message }
      const delayMs = (step.delay_minutes || 0) * 60 * 1000;
      setTimeout(async () => {
        if (settings?.telegram_token && conv.platform === 'telegram') {
          try {
            const https = require('https');
            const payload = JSON.stringify({ chat_id: conv.sender_id, text: step.message });
            const req2 = https.request({ hostname:'api.telegram.org', path:'/bot'+settings.telegram_token+'/sendMessage', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} }, ()=>{});
            req2.write(payload); req2.end();
            db.prepare("INSERT INTO inbox_messages (conversation_id,platform,direction,content,message_type) VALUES (?,?,?,?,?)").run(conv.id,'telegram','out',step.message,'text');
          } catch(e) { console.error('[inbox.js]', e.message); }
        }
      }, delayMs);
      sent++;
    }
    res.json({ ok:true, steps_queued: sent });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ============================================================
// WHATSAPP CATALOG (Products showcase)
// ============================================================
router.get('/inbox/catalog', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const products = db.prepare('SELECT * FROM sys_products WHERE stock_qty > 0 ORDER BY name LIMIT 50').all();
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get() || {};
    res.json({ ok:true, products, catalog_active: settings.catalog_active||0 });
  } catch(e) { res.json({ ok:true, products:[], catalog_active:0 }); }
});

router.post('/inbox/catalog/send', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { conversation_id, product_ids } = req.body;
    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(conversation_id);
    if (!conv) return res.json({ ok:false, error:'conversation not found' });
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings?.telegram_token) return res.json({ ok:false, error:'telegram not configured' });
    const products = product_ids
      ? db.prepare(`SELECT * FROM sys_products WHERE id IN (${product_ids.map(()=>'?').join(',')}) AND stock_qty > 0`).all(...product_ids)
      : db.prepare('SELECT * FROM sys_products WHERE stock_qty > 0 LIMIT 10').all();
    if (!products.length) return res.json({ ok:false, error:'no products found' });
    // Build catalog message
    let msg = '🛍️ كتالوج منتجاتنا:\n\n';
    products.forEach((p, i) => {
      msg += `${i+1}. ${p.name}\n`;
      if (p.sell_price) msg += `   💰 السعر: ${p.sell_price} ج.م\n`;
      if (p.stock_qty) msg += `   📦 متاح: ${p.stock_qty} ${p.unit||'قطعة'}\n`;
      msg += '\n';
    });
    msg += 'للطلب: ابعت رقم المنتج أو تواصل معنا 🌿';
    const https = require('https');
    const payload = JSON.stringify({ chat_id: conv.sender_id, text: msg });
    const req2 = https.request({ hostname:'api.telegram.org', path:'/bot'+settings.telegram_token+'/sendMessage', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} }, ()=>{});
    req2.write(payload); req2.end();
    db.prepare("INSERT INTO inbox_messages (conversation_id,platform,direction,content,message_type) VALUES (?,?,?,?,?)").run(conversation_id,'telegram','out',msg,'text');
    res.json({ ok:true, products_sent: products.length });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ============================================================
// CUSTOM CONTACT ATTRIBUTES
// ============================================================
router.get('/inbox/conversations/:id/attributes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const attrs = db.prepare('SELECT * FROM inbox_contact_attrs WHERE conversation_id=?').all(req.params.id);
    res.json({ ok:true, attributes: attrs });
  } catch(e) { res.json({ ok:true, attributes:[] }); }
});

router.post('/inbox/conversations/:id/attributes', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { key, value } = req.body;
    if (!key) return res.json({ ok:false, error:'key required' });
    db.prepare('INSERT OR REPLACE INTO inbox_contact_attrs (conversation_id, attr_key, attr_value, updated_at) VALUES (?,?,?,datetime(\'now\'))').run(req.params.id, key, value||'');
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ============================================================
// REVENUE ATTRIBUTION
// ============================================================
router.get('/inbox/revenue', requireAuth, (req, res) => {
  const db = req.db;
  try {
    // Link conversations to invoices via CRM contact
    const revenue = db.prepare(`
      SELECT c.id, c.sender_name, c.platform,
        COUNT(DISTINCT i.id) as invoice_count,
        COALESCE(SUM(i.total), 0) as total_revenue
      FROM inbox_conversations c
      JOIN crm_contacts cc ON cc.phone LIKE '%' || REPLACE(c.sender_phone, '0', '') || '%'
      JOIN sys_invoices i ON i.contact_id = cc.id AND i.status = 'paid'
      GROUP BY c.id
      ORDER BY total_revenue DESC LIMIT 20
    `).all();
    const totalFromInbox = revenue.reduce((s,r)=>s+r.total_revenue, 0);
    res.json({ ok:true, revenue, total: totalFromInbox });
  } catch(e) { res.json({ ok:true, revenue:[], total:0 }); }
});

// ============================================================
// AI SMART REPLY
// ============================================================
router.post('/inbox/ai-reply', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { conversation_id, last_message } = req.body;
    if (!last_message) return res.json({ ok:false, error:'last_message required' });
    // Get conversation context
    const msgs = db.prepare('SELECT * FROM inbox_messages WHERE conversation_id=? ORDER BY sent_at DESC LIMIT 5').all(conversation_id||0);
    const context = msgs.reverse().map(m => (m.direction==='in'?'عميل: ':'أنت: ') + m.content).join('\n');
    // Get business context
    const profile = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get() || {};
    const products = db.prepare('SELECT name, sell_price FROM sys_products WHERE stock_qty > 0 LIMIT 10').all();
    const productList = products.map(p => p.name + ' - ' + p.sell_price + ' ج.م').join('، ');
    // Build AI prompt
    const systemPrompt = `أنت مساعد خدمة عملاء لشركة "${profile.company_name||'أريج للملابس'}" المتخصصة في ملابس وتيشيرتات مطبوعة في مصر.
منتجاتنا: ${productList || 'تيشيرتات، هوديات، ملابس مطبوعة'}
أسلوبك: ودود، محترف، مختصر. اكتب بالعربية.
السياق: ${context}`;
    const userMsg = `رسالة العميل: "${last_message}"\nاكتب 3 ردود مقترحة مختصرة (كل رد في سطر) مناسبة للرد على هذه الرسالة:`;
    // Call AI (using available model)
    const { execSync } = require('child_process');
    let suggestions = [];
    try {
      const result = execSync(`gsk ai "${userMsg.replace(/"/g,"'")} System: ${systemPrompt.replace(/"/g,"'").substring(0,200)}"`, 
        { timeout: 15000, encoding: 'utf8', maxBuffer: 1024*1024 });
      const lines = result.trim().split('\n').filter(l => l.trim().length > 5).slice(0,3);
      suggestions = lines.map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
    } catch(e) {
      // Fallback suggestions based on message keywords
      const msg = last_message.toLowerCase();
      if (msg.includes('سعر') || msg.includes('بكم')) {
        suggestions = ['أسعارنا تبدأ من 80 ج.م للتيشيرت المطبوع. تفضل موقعنا أو أخبرني بالمنتج 🌿', 'السعر يتوقف على الكمية والطباعة. كم قطعة تحتاج؟', 'سنرسل لك قائمة الأسعار الكاملة الآن 📋'];
      } else if (msg.includes('توصيل') || msg.includes('شحن')) {
        suggestions = ['الشحن لجميع المحافظات 3-5 أيام 🚚', 'التوصيل متاح لكل مصر. تكلفة الشحن تبدأ من 45 ج.م', 'نشحن لعنوانك خلال 3-5 أيام عمل بعد التأكيد ✅'];
      } else if (msg.includes('مرحبا') || msg.includes('هاي') || msg.includes('السلام')) {
        suggestions = ['أهلاً وسهلاً! كيف يمكنني مساعدتك اليوم؟ 🌿', 'مرحباً! يسعدنا خدمتك. ماذا تحتاج؟', 'أهلاً! نحن هنا للمساعدة 😊'];
      } else {
        suggestions = ['شكراً لتواصلك! سنرد عليك في أقرب وقت 🌿', 'وصلت رسالتك. هل يمكنك توضيح طلبك أكثر؟', 'سنساعدك بكل سرور! ما الذي تحتاجه؟'];
      }
    }
    res.json({ ok:true, suggestions: suggestions.slice(0,3) });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ============================================================
// INBOX SEND INVOICE — إرسال فاتورة عبر التيليجرام
// ============================================================
router.post('/inbox/send-invoice', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { conversation_id, invoice_id } = req.body;
    if (!conversation_id || !invoice_id) return res.json({ ok: false, error: 'missing fields' });

    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(conversation_id);
    if (!conv) return res.json({ ok: false, error: 'conversation not found' });

    const invoice = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(invoice_id);
    if (!invoice) return res.json({ ok: false, error: 'invoice not found' });

    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();

    if (conv.platform === 'telegram' && settings && settings.telegram_token) {
      const https = require('https');
      const chatId = conv.sender_id;
      const token = settings.telegram_token;

      const statusLabel = invoice.status === 'paid' ? '\u2705 \u0645\u062f\u0641\u0648\u0639\u0629' :
                          invoice.status === 'partial' ? '\u{1F536} \u0645\u062f\u0641\u0648\u0639\u0629 \u062c\u0632\u0626\u064a\u0627\u064b' : '\u23F3 \u063a\u064a\u0631 \u0645\u062f\u0641\u0648\u0639\u0629';
      const invDate = (invoice.created_at || '').toString().split('T')[0] || '';
      const invNo = invoice.invoice_no || ('INV-' + invoice.id);
      const msg = `\u{1F9FE} \u0641\u0627\u062a\u0648\u0631\u0629 \u0631\u0642\u0645: ${invNo}\n\u{1F4B0} \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a: ${invoice.total || 0} \u062c.\u0645\n\u{1F4C5} \u0627\u0644\u062a\u0627\u0631\u064a\u062e: ${invDate}\n${statusLabel}`;

      // Send text message with invoice details
      const textPayload = JSON.stringify({ chat_id: chatId, text: msg });
      await new Promise((resolve) => {
        const opts = {
          hostname: 'api.telegram.org',
          path: `/bot${token}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(textPayload) }
        };
        const r = https.request(opts, (resp) => {
          let data = ''; resp.on('data', c => data += c); resp.on('end', () => resolve(data));
        });
        r.on('error', () => resolve(null)); r.write(textPayload); r.end();
      });

      // Ensure media columns exist
      try {
        const cols = db.prepare("PRAGMA table_info(inbox_messages)").all().map(c => c.name);
        if (!cols.includes('media_url'))  db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_url TEXT").run();
        if (!cols.includes('media_type')) db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_type TEXT").run();
      } catch(e) { console.error('[inbox.js]', e.message); }

      // Save to messages DB
      db.prepare('INSERT INTO inbox_messages (conversation_id, platform, direction, content, message_type) VALUES (?,?,?,?,?)')
        .run(conversation_id, conv.platform, 'out', msg, 'text');
      db.prepare("UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now') WHERE id=?")
        .run('\u{1F9FE} \u0641\u0627\u062a\u0648\u0631\u0629 ' + invNo, conversation_id);

      return res.json({ ok: true, message: 'تم إرسال تفاصيل الفاتورة' });
    }

    return res.json({ ok: false, error: 'المنصة لا تدعم الإرسال بعد' });
  } catch(e) {
    console.error('[send-invoice error]', e);
    res.json({ ok: false, error: e.message });
  }
});

// ═══ WhatsApp QR Routes ═══
// waQR loaded at top of file

// POST /api/system/inbox/whatsapp-qr/start
router.post('/inbox/whatsapp-qr/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = req.db;
    // Mark wa_qr_active=1 so auto-restore picks it up on next restart
    try {
      db.prepare('UPDATE inbox_settings SET wa_qr_active=1 WHERE id=1').run();
      if (db.prepare('SELECT COUNT(*) as c FROM inbox_settings').get().c === 0) {
        db.prepare('INSERT INTO inbox_settings (id, wa_qr_active) VALUES (1,1)').run();
      }
    } catch(e) { console.error('[inbox.js]', e.message); }
    const result = await waQR.startSession(userId);
    res.json(result);
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// GET /api/system/inbox/whatsapp-qr/status
router.get('/inbox/whatsapp-qr/status', requireAuth, (req, res) => {
  const status = waQR.getStatus(req.user.id);
  res.json({ ok: true, ...status });
});

// POST /api/system/inbox/whatsapp-qr/stop
router.post('/inbox/whatsapp-qr/stop', requireAuth, async (req, res) => {
  try {
    await waQR.stopSession(req.user.id);
    // Mark inactive so auto-restore skips it
    try { req.db.prepare('UPDATE inbox_settings SET wa_qr_active=0 WHERE id=1').run(); } catch(e) { console.error('[inbox.js]', e.message); }
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});



// POST /api/system/inbox/new-conversation
// بدء محادثة جديدة مع رقم/ID غير مسجل على أي منصة
router.post('/inbox/new-conversation', requireAuth, async (req, res) => {
  const db  = req.db;
  const { platform, recipient, message } = req.body || {};

  if (!platform || !recipient || !message) {
    return res.json({ ok: false, error: 'تأكد من platform + recipient + message' });
  }

  try {
    // إرسال الرسالة حسب المنصة
    let senderId = recipient.trim();

    if (platform === 'whatsapp-qr') {
      // تحويل الرقم لـ JID
      const chatId = senderId.includes('@') ? senderId : senderId.replace(/\D/g,'') + '@c.us';
      await waQR.sendMessage(req.user.id, chatId, message);
      senderId = chatId;

    } else if (platform === 'telegram') {
      const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
      if (!settings?.telegram_token) return res.json({ ok: false, error: 'تيليجرام غير مفعّل' });
      const tgPayload = JSON.stringify({ chat_id: senderId, text: message });
      await new Promise((resolve, reject) => {
        const https = require('https');
        const req2 = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${settings.telegram_token}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(tgPayload) }
        }, r => { r.resume(); resolve(); });
        req2.on('error', reject);
        req2.end(tgPayload);
      });

    } else {
      return res.json({ ok: false, error: `المنصة ${platform} لا تدعم بدء محادثة جديدة` });
    }

    // إنشاء أو تحديث المحادثة في الـ DB
    let conv = db.prepare('SELECT * FROM inbox_conversations WHERE platform=? AND sender_id=?').get(platform, senderId);
    if (!conv) {
      const r = db.prepare(
        'INSERT INTO inbox_conversations (platform, sender_id, sender_name, last_message, last_message_at, status, unread_count) VALUES (?,?,?,?,datetime(\'now\'),\'open\',0)'
      ).run(platform, senderId, senderId, message);
      conv = { id: r.lastInsertRowid };
    } else {
      db.prepare('UPDATE inbox_conversations SET last_message=?, last_message_at=datetime(\'now\') WHERE id=?').run(message, conv.id);
    }

    // حفظ الرسالة الصادرة
    db.prepare(
      'INSERT INTO inbox_messages (conversation_id, platform, direction, content, message_type, sent_at) VALUES (?,?,?,?,?,datetime(\'now\'))'
    ).run(conv.id, platform, 'out', message, 'text');

    res.json({ ok: true, conversation_id: conv.id });

  } catch(e) {
    console.error('[new-conversation]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// WhatsApp API — Template Manager (proxy to Meta Graph API)
// ──────────────────────────────────────────────────────────────────────────

function getWaCredentials(db) {
  const row = db.prepare('SELECT wa_token, wa_account_id, wa_phone_id FROM inbox_settings WHERE id=1').get();
  return row || {};
}

// GET /api/system/inbox/wa-templates — list templates from Meta
router.get('/inbox/wa-templates', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { wa_token, wa_account_id } = getWaCredentials(db);
    if (!wa_token || !wa_account_id) return res.json({ ok: false, error: 'wa_token و wa_account_id غير مضبوطَين — احفظ الإعدادات أولاً' });
    const url = `https://graph.facebook.com/v19.0/${wa_account_id}/message_templates?limit=50&access_token=${wa_token}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.json({ ok: false, error: data.error.message });
    return res.json({ ok: true, templates: data.data || [] });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// POST /api/system/inbox/wa-templates — create new template
router.post('/inbox/wa-templates', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { wa_token, wa_account_id } = getWaCredentials(db);
    if (!wa_token || !wa_account_id) return res.json({ ok: false, error: 'wa_token و wa_account_id غير مضبوطَين' });
    const { name, language, category, body_text } = req.body;
    if (!name || !language || !category || !body_text) return res.json({ ok: false, error: 'name + language + category + body_text مطلوبة' });
    // Validate name: lowercase + underscores only
    if (!/^[a-z0-9_]+$/.test(name)) return res.json({ ok: false, error: 'الاسم: حروف إنجليزية صغيرة + أرقام + _ فقط' });
    const payload = {
      name,
      language,
      category,
      components: [
        { type: 'BODY', text: body_text }
      ]
    };
    const r = await fetch(`https://graph.facebook.com/v19.0/${wa_account_id}/message_templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa_token}` },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.error) return res.json({ ok: false, error: data.error.message });
    return res.json({ ok: true, template: data });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// DELETE /api/system/inbox/wa-templates/:name — delete template by name
router.delete('/inbox/wa-templates/:name', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { wa_token, wa_account_id } = getWaCredentials(db);
    if (!wa_token || !wa_account_id) return res.json({ ok: false, error: 'wa_token و wa_account_id غير مضبوطَين' });
    const { name } = req.params;
    const r = await fetch(`https://graph.facebook.com/v19.0/${wa_account_id}/message_templates?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${wa_token}` }
    });
    const data = await r.json();
    if (data.error) return res.json({ ok: false, error: data.error.message });
    return res.json({ ok: true });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// POST /api/system/inbox/wa-send-template — إرسال WhatsApp Template Message لمحادثة
router.post('/inbox/wa-send-template', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { wa_token, wa_phone_id } = getWaCredentials(db);
    if (!wa_token || !wa_phone_id) return res.json({ ok: false, error: 'wa_token و wa_phone_id غير مضبوطَين' });

    const { conversation_id, template_name, language_code, components } = req.body;
    if (!conversation_id || !template_name) return res.json({ ok: false, error: 'conversation_id + template_name مطلوبان' });

    // جلب رقم المرسل من المحادثة
    const conv = db.prepare('SELECT sender_id, platform FROM inbox_conversations WHERE id=?').get(conversation_id);
    if (!conv) return res.json({ ok: false, error: 'المحادثة غير موجودة' });
    if (conv.platform !== 'whatsapp') return res.json({ ok: false, error: 'هذه الميزة متاحة فقط لمحادثات WhatsApp API' });

    const payload = {
      messaging_product: 'whatsapp',
      to: conv.sender_id,
      type: 'template',
      template: {
        name: template_name,
        language: { code: language_code || 'ar' },
        ...(components && components.length ? { components } : {})
      }
    };

    const r = await fetch(`https://graph.facebook.com/v19.0/${wa_phone_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa_token}` },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.error) return res.json({ ok: false, error: data.error.message });

    // حفظ الرسالة في inbox_messages
    const wamId = data.messages?.[0]?.id || null;
    const msgText = `[Template: ${template_name}]`;
    db.prepare(`INSERT INTO inbox_messages (conversation_id, direction, content, sent_at, status) VALUES (?,?,?,datetime('now'),?)`)
      .run(conversation_id, 'out', msgText, 'sent');
    db.prepare(`UPDATE inbox_conversations SET last_message_at=datetime('now'), last_message=? WHERE id=?`)
      .run(msgText, conversation_id);

    return res.json({ ok: true, wam_id: wamId });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// GET /api/system/inbox/wa-analytics — fetch analytics from Meta + local DB stats
router.get('/inbox/wa-analytics', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { wa_token, wa_account_id, wa_phone_id } = getWaCredentials(db);
    if (!wa_token || !wa_account_id) return res.json({ ok: false, error: 'wa_token و wa_account_id غير مضبوطَين — احفظ الإعدادات أولاً' });

    // ── 1. Meta: phone number info (quality rating + messaging_limit_tier)
    let phoneInfo = {};
    try {
      if (wa_phone_id) {
        const r = await fetch(`https://graph.facebook.com/v19.0/${wa_phone_id}?fields=display_phone_number,quality_rating,messaging_limit_tier,name_status&access_token=${wa_token}`);
        phoneInfo = await r.json();
      }
    } catch(e) { /* non-fatal */ }

    // ── 2. Meta: conversation analytics (last 30 days)
    let convData = {};
    try {
      const end   = Math.floor(Date.now() / 1000);
      const start = end - (30 * 24 * 3600);
      const url   = `https://graph.facebook.com/v19.0/${wa_account_id}/conversation_analytics?start=${start}&end=${end}&granularity=DAILY&dimensions=["conversation_type","conversation_direction"]&access_token=${wa_token}`;
      const r = await fetch(url);
      convData = await r.json();
    } catch(e) { /* non-fatal */ }

    // ── 3. Local DB stats
    const localStats = {};
    try {
      localStats.total_conversations = db.prepare("SELECT COUNT(*) as c FROM inbox_conversations WHERE platform='whatsapp'").get()?.c || 0;
      localStats.open_conversations   = db.prepare("SELECT COUNT(*) as c FROM inbox_conversations WHERE platform='whatsapp' AND status='open'").get()?.c || 0;
      localStats.today_messages       = db.prepare("SELECT COUNT(*) as c FROM inbox_messages m JOIN inbox_conversations c ON m.conversation_id=c.id WHERE c.platform='whatsapp' AND date(m.sent_at)=date('now')").get()?.c || 0;
      localStats.week_messages        = db.prepare("SELECT COUNT(*) as c FROM inbox_messages m JOIN inbox_conversations c ON m.conversation_id=c.id WHERE c.platform='whatsapp' AND m.sent_at >= datetime('now','-7 days')").get()?.c || 0;
      localStats.month_messages       = db.prepare("SELECT COUNT(*) as c FROM inbox_messages m JOIN inbox_conversations c ON m.conversation_id=c.id WHERE c.platform='whatsapp' AND m.sent_at >= datetime('now','-30 days')").get()?.c || 0;
      localStats.unique_senders_month = db.prepare("SELECT COUNT(DISTINCT sender_id) as c FROM inbox_conversations WHERE platform='whatsapp' AND last_message_at >= datetime('now','-30 days')").get()?.c || 0;
      // avg first response time (minutes) - out msg after first in msg per conv
      const frt = db.prepare(`
        SELECT AVG((julianday(o.sent_at) - julianday(i.sent_at)) * 1440) as avg_min
        FROM inbox_messages i
        JOIN (
          SELECT conversation_id, MIN(sent_at) as sent_at FROM inbox_messages WHERE direction='out' GROUP BY conversation_id
        ) o ON i.conversation_id = o.conversation_id
        JOIN inbox_conversations c ON c.id = i.conversation_id
        WHERE i.direction='in' AND c.platform='whatsapp'
          AND (julianday(o.sent_at) - julianday(i.sent_at)) * 1440 BETWEEN 0 AND 1440
      `).get();
      localStats.avg_first_response_min = frt?.avg_min ? Math.round(frt.avg_min) : null;
    } catch(e) { /* non-fatal */ }

    return res.json({ ok: true, phoneInfo, convData, localStats });
  } catch(e) {
    return res.json({ ok: false, error: e.message });
  }
});

// ── Export Conversations as CSV ────────────────────────────────────────────
router.get('/inbox/conversations/export', requireAuth, (req, res) => {
  try {
    const db = req.db;
    const { platform, status, from, to } = req.query;

    let where = [];
    let params = [];

    if (platform && platform !== 'all') {
      where.push('c.platform = ?');
      params.push(platform);
    }
    if (status && status !== 'all') {
      where.push('c.status = ?');
      params.push(status);
    }
    if (from) {
      where.push('c.last_message_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('c.last_message_at <= ?');
      params.push(to + ' 23:59:59');
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const convs = db.prepare(`
      SELECT
        c.id,
        c.platform,
        c.sender_name,
        c.sender_phone,
        c.status,
        c.assigned_to_name,
        c.unread_count,
        c.last_message,
        c.last_message_at,
        c.created_at,
        (
          SELECT COUNT(*) FROM inbox_messages m
          WHERE m.conversation_id = c.id
        ) AS total_messages,
        (
          SELECT COUNT(*) FROM inbox_messages m
          WHERE m.conversation_id = c.id AND m.direction = 'in'
        ) AS inbound_messages,
        (
          SELECT COUNT(*) FROM inbox_messages m
          WHERE m.conversation_id = c.id AND m.direction = 'out'
        ) AS outbound_messages
      FROM inbox_conversations c
      ${whereClause}
      ORDER BY c.last_message_at DESC
      LIMIT 5000
    `).all(...params);

    // بناء CSV
    const escCSV = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const headers = [
      'ID', 'المنصة', 'اسم العميل', 'رقم الهاتف', 'الحالة',
      'الموظف المسؤول', 'رسائل غير مقروءة',
      'آخر رسالة', 'تاريخ آخر رسالة', 'تاريخ الإنشاء',
      'إجمالي الرسائل', 'رسائل واردة', 'رسائل صادرة'
    ];

    const rows = convs.map(c => [
      c.id, c.platform, c.sender_name, c.sender_phone, c.status,
      c.assigned_to_name, c.unread_count,
      c.last_message, c.last_message_at, c.created_at,
      c.total_messages, c.inbound_messages, c.outbound_messages
    ].map(escCSV).join(','));

    // BOM لدعم Excel العربي
    const bom = '\uFEFF';
    const csv = bom + headers.join(',') + '\n' + rows.join('\n');

    const filename = `conversations-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
