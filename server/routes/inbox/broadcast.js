/**
 * inbox/broadcast.js — Broadcast V2 Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P8-4)
 *
 * Endpoints:
 *   GET    /api/inbox/broadcasts              — قائمة الـ broadcasts
 *   POST   /api/inbox/broadcasts              — إنشاء broadcast جديد
 *   GET    /api/inbox/broadcasts/:id          — تفاصيل broadcast
 *   PUT    /api/inbox/broadcasts/:id          — تعديل (draft فقط)
 *   DELETE /api/inbox/broadcasts/:id          — حذف (draft/cancelled)
 *   POST   /api/inbox/broadcasts/:id/send     — بدء الإرسال فوراً
 *   POST   /api/inbox/broadcasts/:id/cancel   — إلغاء إرسال جاري
 *   GET    /api/inbox/broadcasts/:id/recipients — قائمة المستلمين مع حالة الإرسال
 *
 * المنصات المدعومة: whatsapp_api | whatsapp | telegram
 *
 * Audience Filters:
 *   { platform?, label_id?, assigned_to?, search? }
 *   — يُرسل للمحادثات المفتوحة المطابقة للفلاتر
 */

'use strict';

const express = require('express');
const router  = express.Router();

// تأخير بين كل رسالة وأخرى (ms) — يحمي من Rate Limit
const SEND_DELAY_MS = parseInt(process.env.BROADCAST_DELAY_MS || '800', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * جلب بيانات broadcast مع فحص ملكية الـ tenant
 */
function _getBroadcast(db, id, tenantId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM inbox_broadcasts_v4 WHERE id = ? AND tenant_id = ?`,
      [id, tenantId],
      (err, row) => { if (err) return reject(err); resolve(row || null); }
    );
  });
}

/**
 * جلب إعدادات قناة واحدة
 */
function _getChanCfg(db, platform) {
  return new Promise((resolve) => {
    db.get(
      `SELECT config FROM inbox_channel_settings_v4 WHERE platform = ? AND enabled = 1`,
      [platform],
      (err, row) => {
        if (err || !row) return resolve(null);
        try { resolve(JSON.parse(row.config)); } catch { resolve(null); }
      }
    );
  });
}

/**
 * بناء قائمة المستلمين من الـ audience filter
 * يجلب المحادثات المفتوحة المطابقة
 * يُعيد [{ contact_phone, contact_name, platform }]
 */
function _buildRecipients(db, tenantId, platforms, filter) {
  return new Promise((resolve, reject) => {
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

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
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
  db.run(
    `UPDATE inbox_broadcasts_v4
     SET sent   = sent   + ?,
         failed = failed + ?
     WHERE id = ?`,
    [sentDelta, failedDelta, broadcastId],
    () => {}
  );
}

// ─── الإرسال الفعلي (في الخلفية — non-blocking) ──────────────────────────────

/**
 * يُشغَّل في الخلفية بعد الـ HTTP response
 * يمشي على المستلمين ويرسل بالتسلسل مع تأخير
 */
async function _runBroadcast(db, tenantId, broadcast) {
  const { id: bcId, message, media_url, content_type } = broadcast;

  // علّم البدء
  await new Promise(r => db.run(
    `UPDATE inbox_broadcasts_v4 SET status='sending', started_at=? WHERE id=?`,
    [Math.floor(Date.now() / 1000), bcId], r
  ));

  // جلب المستلمين
  const recipients = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inbox_broadcast_recipients_v4
       WHERE broadcast_id = ? AND status = 'pending'
       ORDER BY id ASC`,
      [bcId],
      (err, rows) => { if (err) return reject(err); resolve(rows || []); }
    );
  });

  // جلب إعدادات القنوات مرة واحدة
  const cfgCache = {};

  for (const rec of recipients) {
    // فحص لو الـ broadcast اتلغى
    const current = await new Promise(r =>
      db.get(`SELECT status FROM inbox_broadcasts_v4 WHERE id=?`, [bcId], (_, row) => r(row))
    );
    if (current?.status === 'cancelled') break;

    let errMsg = null;

    try {
      if (!cfgCache[rec.platform]) {
        cfgCache[rec.platform] = await _getChanCfg(db, rec.platform);
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
      db.run(
        `UPDATE inbox_broadcast_recipients_v4
         SET status='sent', sent_at=? WHERE id=?`,
        [Math.floor(Date.now() / 1000), rec.id],
        () => {}
      );
      _updateCounts(db, bcId, 1, 0);

    } catch (e) {
      errMsg = e.message || 'خطأ غير معروف';
      db.run(
        `UPDATE inbox_broadcast_recipients_v4
         SET status='failed', error_msg=? WHERE id=?`,
        [errMsg.slice(0, 500), rec.id],
        () => {}
      );
      _updateCounts(db, bcId, 0, 1);
    }

    // تأخير بين الرسائل
    await _sleep(SEND_DELAY_MS);
  }

  // تحديث الحالة النهائية
  const final = await new Promise(r =>
    db.get(`SELECT status FROM inbox_broadcasts_v4 WHERE id=?`, [bcId], (_, row) => r(row))
  );
  if (final?.status !== 'cancelled') {
    db.run(
      `UPDATE inbox_broadcasts_v4 SET status='done', finished_at=? WHERE id=?`,
      [Math.floor(Date.now() / 1000), bcId],
      () => {}
    );
  }
}

// ─── GET /broadcasts ──────────────────────────────────────────────────────────
// قائمة broadcasts (آخر 100) مع إمكانية الفلترة
router.get('/broadcasts', async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const tenantId = req.user.id;
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

    db.all(sql, [...params, parseInt(limit, 10), offset], (err, rows) => {
      if (err) return res.status(500).json({ error: 'خطأ في جلب البيانات' });
      rows = (rows || []).map(r => ({
        ...r,
        platforms: _parseJson(r.platforms, []),
      }));
      res.json({ broadcasts: rows });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts ─────────────────────────────────────────────────────────
// إنشاء broadcast جديد (draft)
router.post('/broadcasts', async (req, res) => {
  const tenantId = req.user.id;
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

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO inbox_broadcasts_v4
           (tenant_id, name, message, media_url, content_type, platforms, audience_filter, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          tenantId, name.slice(0, 200), message,
          media_url || null, content_type,
          JSON.stringify(platforms),
          JSON.stringify(audience_filter),
          req.user.id,
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    }).then(async (newId) => {
      const bc = await _getBroadcast(db, newId, tenantId);
      return res.status(201).json({ broadcast: { ...bc, platforms } });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /broadcasts/:id ──────────────────────────────────────────────────────
router.get('/broadcasts/:id', async (req, res) => {
  try {
    const bc = await _getBroadcast(req.db, req.params.id, req.user.id);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    res.json({ broadcast: { ...bc, platforms: _parseJson(bc.platforms, []) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /broadcasts/:id ──────────────────────────────────────────────────────
// تعديل (draft فقط)
router.put('/broadcasts/:id', async (req, res) => {
  const tenantId = req.user.id;
  try {
    const db = req.db;
    const bc = await _getBroadcast(db, req.params.id, tenantId);
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

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE inbox_broadcasts_v4
         SET name=?, message=?, media_url=?, content_type=?, platforms=?, audience_filter=?
         WHERE id=?`,
        [name.slice(0, 200), message, media_url || null, content_type,
         JSON.stringify(platforms), JSON.stringify(audience_filter), bc.id],
        (err) => { if (err) return reject(err); resolve(); }
      );
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /broadcasts/:id ───────────────────────────────────────────────────
router.delete('/broadcasts/:id', async (req, res) => {
  const tenantId = req.user.id;
  try {
    const db = req.db;
    const bc = await _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['draft', 'cancelled', 'done'].includes(bc.status)) {
      return res.status(400).json({ error: 'لا يمكن حذف broadcast جاري' });
    }
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM inbox_broadcasts_v4 WHERE id=?`, [bc.id],
        (err) => { if (err) return reject(err); resolve(); });
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts/:id/send ────────────────────────────────────────────────
// بناء قائمة المستلمين + بدء الإرسال في الخلفية
router.post('/broadcasts/:id/send', async (req, res) => {
  const tenantId = req.user.id;
  try {
    const db = req.db;
    const bc = await _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['draft', 'cancelled'].includes(bc.status)) {
      return res.status(400).json({ error: `الـ broadcast بحالة "${bc.status}" — لا يمكن إعادة الإرسال` });
    }

    const platforms = _parseJson(bc.platforms, []);
    const filter    = _parseJson(bc.audience_filter, {});

    // بناء قائمة المستلمين
    const recipients = await _buildRecipients(db, tenantId, platforms, filter);
    if (!recipients.length) {
      return res.status(400).json({ error: 'لا يوجد مستلمون مطابقون للفلاتر' });
    }

    // حذف سجلات سابقة (لو كان cancelled وأعيد الإرسال)
    await new Promise(r => db.run(
      `DELETE FROM inbox_broadcast_recipients_v4 WHERE broadcast_id=?`, [bc.id], r
    ));

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
    await new Promise(r => db.run(
      `UPDATE inbox_broadcasts_v4
       SET total=?, sent=0, failed=0, status='pending'
       WHERE id=?`,
      [recipients.length, bc.id], r
    ));

    // رد فوري ثم ابدأ الإرسال في الخلفية
    res.json({ success: true, total: recipients.length });

    // الإرسال الفعلي — لا ينتظر
    _runBroadcast(db, tenantId, { ...bc, platforms }).catch(e => {
      console.error('[broadcast] run error:', e.message);
      db.run(
        `UPDATE inbox_broadcasts_v4 SET status='failed' WHERE id=?`,
        [bc.id], () => {}
      );
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /broadcasts/:id/cancel ─────────────────────────────────────────────
router.post('/broadcasts/:id/cancel', async (req, res) => {
  const tenantId = req.user.id;
  try {
    const db = req.db;
    const bc = await _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });
    if (!['pending', 'sending'].includes(bc.status)) {
      return res.status(400).json({ error: 'فقط الـ broadcasts الجارية يمكن إلغاؤها' });
    }
    await new Promise(r => db.run(
      `UPDATE inbox_broadcasts_v4 SET status='cancelled', finished_at=? WHERE id=?`,
      [Math.floor(Date.now() / 1000), bc.id], r
    ));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /broadcasts/:id/recipients ──────────────────────────────────────────
// قائمة المستلمين مع حالة الإرسال (pagination)
router.get('/broadcasts/:id/recipients', async (req, res) => {
  const tenantId = req.user.id;
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  try {
    const db = req.db;
    const bc = await _getBroadcast(db, req.params.id, tenantId);
    if (!bc) return res.status(404).json({ error: 'غير موجود' });

    const conditions = ['broadcast_id = ?'];
    const params     = [bc.id];
    if (status) { conditions.push('status = ?'); params.push(status); }

    db.all(
      `SELECT id, contact_phone, contact_name, platform, status, sent_at, error_msg
       FROM inbox_broadcast_recipients_v4
       WHERE ${conditions.join(' AND ')}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'خطأ في جلب البيانات' });
        res.json({ recipients: rows || [] });
      }
    );
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
