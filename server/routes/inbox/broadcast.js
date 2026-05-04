/**
 * inbox/broadcast.js - Broadcast V2 Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P8-4)
 *
 * Endpoints:
 *   GET    /api/inbox/broadcasts              - قائمة الـ broadcasts
 *   POST   /api/inbox/broadcasts              - إنشاء broadcast جديد
 *   GET    /api/inbox/broadcasts/:id          - تفاصيل broadcast
 *   PUT    /api/inbox/broadcasts/:id          - تعديل (draft فقط)
 *   DELETE /api/inbox/broadcasts/:id          - حذف (draft/cancelled)
 *   POST   /api/inbox/broadcasts/:id/send     - بدء الإرسال فوراً
 *   POST   /api/inbox/broadcasts/:id/cancel   - إلغاء إرسال جاري
 *   GET    /api/inbox/broadcasts/:id/recipients - قائمة المستلمين مع حالة الإرسال
 *
 * المنصات المدعومة: whatsapp_api | whatsapp | telegram
 *
 * Audience Filters:
 *   { platform?, label_id?, assigned_to?, search? }
 *   - يُرسل للمحادثات المفتوحة المطابقة للفلاتر
 */

'use strict';

const express = require('express');
const router  = express.Router();

// تأخير بين كل رسالة وأخرى (ms) - يحمي من Rate Limit
const SEND_DELAY_MS = parseInt(process.env.BROADCAST_DELAY_MS || '800', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * جلب بيانات broadcast مع فحص ملكية الـ tenant
 */
function _getBroadcast(db, id, tenantId) {
  return db.prepare(
    `SELECT * FROM inbox_broadcasts_v4 WHERE id = ? AND tenant_id = ?`
  ).get(id, tenantId) || null;
}

/**
 * جلب إعدادات قناة واحدة
 */
function _getChanCfg(db, platform) {
  const row = db.prepare(
    `SELECT config FROM inbox_channel_settings_v4 WHERE platform = ? AND enabled = 1`
  ).get(platform);
  if (!row) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}

/**
 * بناء قائمة المستلمين من الـ audience filter
 * يجلب المحادثات المفتوحة المطابقة
 * يُعيد [{ contact_phone, contact_name, platform }]
 */
function _buildRecipients(db, tenantId, platforms, filter) {
  const conditions = [`c.tenant_id = ?`, `c.status = 'open'`, `c.contact_phone IS NOT NULL`];
  const params     = [tenantId];

  // فلتر المنصات (من قائمة المنصات المختارة)
  if (platforms && platforms.length) {
    conditions.push(`c.platform IN (${platforms.map(() => '?').join(',')})`); 
    params.push(...platforms);
  }

  // فلتر Label
  if (filter.label_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM inbox_conv_labels_v4 cl
      WHERE cl.conversation_id = c.id AND cl.label_id = ?
    )`);
    params.push(filter.label_id);
  }

  // فلتر Assigned To
  if (filter.assigned_to) {
    conditions.push(`c.assigned_to_id = ?`);
    params.push(filter.assigned_to);
  }

  // فلتر بحث (اسم أو رقم)
  if (filter.search) {
    conditions.push(`(c.contact_name LIKE ? OR c.contact_phone LIKE ?)`);
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  const sql = `
    SELECT DISTINCT c.contact_phone, c.contact_name, c.platform
    FROM inbox_conversations_v4 c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.id DESC
    LIMIT 5000
  `;

  return db.prepare(sql).all(...params);
}

/**
 * إرسال رسالة واحدة عبر WhatsApp Cloud API
 */
async function _sendWAAPI(cfg, phone, message, mediaUrl, contentType) {
  let waPayload;

  if (contentType === 'image' && mediaUrl) {
    waPayload = {
      messaging_product: 'whatsapp',
      to:   phone,
      type: 'image',
      image: { link: mediaUrl, caption: message || '' },
    };
  } else {
    waPayload = {
      messaging_product: 'whatsapp',
      to:   phone,
      type: 'text',
      text: { body: message, preview_url: false },
    };
  }

  const resp = await fetch(
    `https://graph.facebook.com/v19.0/${cfg.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(waPayload),
    }
  );

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error?.message || `HTTP ${resp.status}`);
  return json?.messages?.[0]?.id || null;
}

/**
 * إرسال رسالة عبر Telegram Bot API
 */
async function _sendTelegram(cfg, chatId, message) {
  const botToken = cfg.bot_token || cfg.token || '';
  if (!botToken) throw new Error('Telegram bot_token غير محدد');

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `HTTP ${resp.status}`);
  return String(json.result?.message_id || '');
}

/**
 * تأخير بسيط (ms)
 */
const _sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * تحديث عدادات الـ broadcast في الداتابيز
 */
function _updateCounts(db, broadcastId, sentDelta, failedDelta) {
  db.prepare(
    `UPDATE inbox_broadcasts_v4
     SET sent   = sent   + ?,
         failed = failed + ?
     WHERE id = ?`
  ).run(sentDelta, failedDelta, broadcastId);
}

// ─── الإرسال الفعلي (في الخلفية - non-blocking) ──────────────────────────────

/**
 * يُشغَّل في الخلفية بعد الـ HTTP response
 * يمشي على المستلمين ويرسل بالتسلسل مع تأخير
 */
async function _runBroadcast(db, tenantId, broadcast) {
  const { id: bcId, message, media_url, content_type } = broadcast;

  // علّم البدء
  db.prepare(`UPDATE inbox_broadcasts_v4 SET status='sending', started_at=? WHERE id=?`)
    .run(Math.floor(Date.now() / 1000), bcId);

  // جلب المستلمين
  const recipients = db.prepare(
    `SELECT * FROM inbox_broadcast_recipients_v4
     WHERE broadcast_id = ? AND status = 'pending'
     ORDER BY id ASC`
  ).all(bcId);

  // جلب إعدادات القنوات مرة واحدة
  const cfgCache = {};

  for (const rec of recipients) {
    // فحص لو الـ broadcast اتلغى
    const current = db.prepare(`SELECT status FROM inbox_broadcasts_v4 WHERE id=?`).get(bcId);
    if (current?.status === 'cancelled') break;

    let errMsg = null;

    try {
      if (!cfgCache[rec.platform]) {
        cfgCache[rec.platform] = _getChanCfg(db, rec.platform);
      }
      const cfg = cfgCache[rec.platform];

      if (rec.platform === 'whatsapp_api') {
        if (!cfg?.access_token) throw new Error('WhatsApp API غير مُفعَّل');
        await _sendWAAPI(cfg, rec.contact_phone, message, media_url, content_type);
      } else if (rec.platform === 'telegram') {
        if (!cfg) throw new Error('Telegram غير مُفعَّل');
        await _sendTelegram(cfg, rec.contact_phone, message);
      } else if (rec.platform === 'whatsapp') {
        // WA QR: نستخدم dispatchOutbound من messages.js
        const { dispatchOutbound } = require('./messages');
        const fakeConv  = { id: null, contact_phone: rec.contact_phone, platform: 'whatsapp', tenant_id: tenantId };
        const fakeMsg   = { content_type, content: message, msg_id: null };
        const { error } = await dispatchOutbound(db, fakeConv, fakeMsg);
        if (error) throw new Error(error);
      } else {
        throw new Error(`منصة غير مدعومة: ${rec.platform}`);
      }

      // نجح الإرسال
      db.prepare(
        `UPDATE inbox_broadcast_recipients_v4
         SET status='sent', sent_at=? WHERE id=?`
      ).run(Math.floor(Date.now() / 1000), rec.id);
      _updateCounts(db, bcId, 1, 0);

    } catch (e) {
      errMsg = e.message || 'خطأ غير معروف';
      db.prepare(
        `UPDATE inbox_broadcast_recipients_v4
         SET status='failed', error_msg=? WHERE id=?`
      ).run(errMsg.slice(0, 500), rec.id);
      _updateCounts(db, bcId, 0, 1);
    }

    // تأخير بين الرسائل
    await _sleep(SEND_DELAY_MS);
  }

  // تحديث الحالة النهائية
  const final = db.prepare(`SELECT status FROM inbox_broadcasts_v4 WHERE id=?`).get(bcId);
  if (final?.status !== 'cancelled') {
    db.prepare(`UPDATE inbox_broadcasts_v4 SET status='done', finished_at=? WHERE id=?`)
      .run(Math.floor(Date.now() / 1000), bcId);
  }
}

// ─── GET /broadcasts ──────────────────────────────────────────────────────────
// قائمة broadcasts (آخر 100) مع إمكانية الفلترة
router.get('/broadcasts', async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const tenantId = req.inboxUser.id;
  const offset   = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  try {
    const db = req.db;
    const conditions = ['tenant_id = ?'];
    const params     = [tenantId];

    if (status) { conditions.push('status = ?'); params.push(status); }

    const sql = `
      SELECT id, name, status, platforms, total, sent, failed,
             content_type, scheduled_at, started_at, finished_at, created_at,
             substr(message, 1, 100) AS message_preview
      FROM inbox_broadcasts_v4
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...params, parseInt(limit, 10), offset)
      .map(r => ({ ...r, platforms: _parseJson(r.platforms, []) }));
    res.json({ broadcasts: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts ─────────────────────────────────────────────────────────
// إنشاء broadcast جديد (draft)
router.post('/broadcasts', async (req, res) => {
  const tenantId = req.inboxUser.id;
  const {
    name            = 'رسالة جماعية',
    message         = '',
    media_url       = null,
    content_type    = 'text',
    platforms       = [],
    audience_filter = {},
  } = req.body;

  if (!message.trim()) return res.status(400).json({ error: 'نص الرسالة مطلوب' });
  if (!platforms.length) return res.status(400).json({ error: 'اختر منصة واحدة على الأقل' });

  const ALLOWED_PLATFORMS = ['whatsapp_api', 'whatsapp', 'telegram'];
  const badPlatform = platforms.find(p => !ALLOWED_PLATFORMS.includes(p));
  if (badPlatform) return res.status(400).json({ error: `منصة غير مدعومة: ${badPlatform}` });

  try {
    const db = req.db;

    const insert = db.prepare(
      `INSERT INTO inbox_broadcasts_v4
         (tenant_id, name, message, media_url, content_type, platforms, audience_filter, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).run(
      tenantId, name.slice(0, 200), message,
      media_url || null, content_type,
      JSON.stringify(platforms),
      JSON.stringify(audience_filter),
      req.inboxUser.id,
    );
    const bc = _getBroadcast(db, insert.lastInsertRowid, tenantId);
    return res.status(201).json({ broadcast: { ...bc, platforms } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /broadcasts/:id ──────────────────────────────────────────────────────
router.get('/broadcasts/:id', async (req, res) => {
  try {
    const bc = _getBroadcast(req.db, req.params.id, req.inboxUser.id);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    res.json({ broadcast: { ...bc, platforms: _parseJson(bc.platforms, []) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /broadcasts/:id ──────────────────────────────────────────────────────
// تعديل (draft فقط)
router.put('/broadcasts/:id', async (req, res) => {
  const tenantId = req.inboxUser.id;
  try {
    const db = req.db;
    const bc = _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (bc.status !== 'draft') return res.status(400).json({ error: 'لا يمكن تعديل broadcast بعد البدء' });

    const {
      name            = bc.name,
      message         = bc.message,
      media_url       = bc.media_url,
      content_type    = bc.content_type,
      platforms       = _parseJson(bc.platforms, []),
      audience_filter = _parseJson(bc.audience_filter, {}),
    } = req.body;

    db.prepare(
      `UPDATE inbox_broadcasts_v4
       SET name=?, message=?, media_url=?, content_type=?, platforms=?, audience_filter=?
       WHERE id=?`
    ).run(name.slice(0, 200), message, media_url || null, content_type,
          JSON.stringify(platforms), JSON.stringify(audience_filter), bc.id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /broadcasts/:id ───────────────────────────────────────────────────
router.delete('/broadcasts/:id', async (req, res) => {
  const tenantId = req.inboxUser.id;
  try {
    const db = req.db;
    const bc = _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['draft', 'cancelled', 'done'].includes(bc.status)) {
      return res.status(400).json({ error: 'لا يمكن حذف broadcast جاري' });
    }
    db.prepare(`DELETE FROM inbox_broadcasts_v4 WHERE id=?`).run(bc.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts/:id/send ────────────────────────────────────────────────
// بناء قائمة المستلمين + بدء الإرسال في الخلفية
router.post('/broadcasts/:id/send', async (req, res) => {
  const tenantId = req.inboxUser.id;
  try {
    const db = req.db;
    const bc = _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['draft', 'cancelled'].includes(bc.status)) {
      return res.status(400).json({ error: `الـ broadcast بحالة "${bc.status}" - لا يمكن إعادة الإرسال` });
    }

    const platforms = _parseJson(bc.platforms, []);
    const filter    = _parseJson(bc.audience_filter, {});

    // بناء قائمة المستلمين
    const recipients = await _buildRecipients(db, tenantId, platforms, filter);
    if (!recipients.length) {
      return res.status(400).json({ error: 'لا يوجد مستلمون مطابقون للفلاتر' });
    }

    // حذف سجلات سابقة (لو كان cancelled وأعيد الإرسال)
    db.prepare(`DELETE FROM inbox_broadcast_recipients_v4 WHERE broadcast_id=?`).run(bc.id);

    // إدراج المستلمين الجدد
    const stmt = db.prepare(
      `INSERT INTO inbox_broadcast_recipients_v4
         (broadcast_id, tenant_id, contact_phone, contact_name, platform, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    );
    const insertMany = db.transaction(() => {
      for (const r of recipients) {
        stmt.run(bc.id, tenantId, r.contact_phone, r.contact_name || '', r.platform);
      }
    });
    insertMany();

    // تحديث الـ total
    db.prepare(`UPDATE inbox_broadcasts_v4 SET total=?, sent=0, failed=0, status='pending' WHERE id=?`)
      .run(recipients.length, bc.id);

    // رد فوري ثم ابدأ الإرسال في الخلفية
    res.json({ success: true, total: recipients.length });

    // الإرسال الفعلي - لا ينتظر
    _runBroadcast(db, tenantId, { ...bc, platforms }).catch(e => {
      console.error('[broadcast] run error:', e.message);
      db.prepare(`UPDATE inbox_broadcasts_v4 SET status='failed' WHERE id=?`).run(bc.id);
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts/:id/cancel ─────────────────────────────────────────────
router.post('/broadcasts/:id/cancel', async (req, res) => {
  const tenantId = req.inboxUser.id;
  try {
    const db = req.db;
    const bc = _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['pending', 'sending'].includes(bc.status)) {
      return res.status(400).json({ error: 'فقط الـ broadcasts الجارية يمكن إلغاؤها' });
    }
    db.prepare(`UPDATE inbox_broadcasts_v4 SET status='cancelled', finished_at=? WHERE id=?`)
      .run(Math.floor(Date.now() / 1000), bc.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /broadcasts/:id/recipients ──────────────────────────────────────────
// قائمة المستلمين مع حالة الإرسال (pagination)
router.get('/broadcasts/:id/recipients', async (req, res) => {
  const tenantId = req.inboxUser.id;
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  try {
    const db = req.db;
    const bc = _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });

    const conditions = ['broadcast_id = ?'];
    const params     = [bc.id];
    if (status) { conditions.push('status = ?'); params.push(status); }

    const rows = db.prepare(
      `SELECT id, contact_phone, contact_name, platform, status, sent_at, error_msg
       FROM inbox_broadcast_recipients_v4
       WHERE ${conditions.join(' AND ')}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit, 10), offset);
    res.json({ recipients: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Utility ──────────────────────────────────────────────────────────────────

function _parseJson(str, fallback) {
  if (typeof str !== 'string') return str ?? fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
module.exports.broadcastRouter = router;
