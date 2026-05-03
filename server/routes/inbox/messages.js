/**
 * inbox/messages.js — Messages Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * Endpoints:
 *   POST /api/inbox/conversations/:id/messages/:msgId/transcript — تحويل voice note إلى نص (Whisper)
 *   POST /api/inbox/conversations/:id/messages  — إرسال رسالة أو ملاحظة
 *   POST /api/inbox/conversations/:id/messages/media — رفع ميديا + إرسال
 *
 * يدعم:
 *   - إرسال نص عادي (content_type = 'text')
 *   - إرسال ملاحظة داخلية (direction = 'note')
 *   - إرسال صورة / مقطع / ملف عبر media_url أو upload
 *   - channel_override: إرسال عبر منصة محددة بدلاً من الافتراضية
 *   - quoted_msg_id: رد على رسالة معينة
 *
 * الـ routes المعرّفة هنا تُضاف على router من conversations.js
 * لأن المسارات /conversations/:id/messages مشتركة
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');
const { v4: uuidv4 } = require('uuid');

// ─── Whisper Config ───────────────────────────────────────────────────────────
// يستخدم نفس الـ OPENAI_API_KEY الموجود في .env
// Genspark لا يدعم /audio/transcriptions — نستخدم OpenAI مباشرة إن توفر WHISPER_API_KEY
// وإلا نحاول عبر OPENAI_BASE_URL مع fallback لـ api.openai.com
const WHISPER_KEY  = process.env.WHISPER_API_KEY  || process.env.OPENAI_API_KEY  || '';
const WHISPER_BASE = (process.env.WHISPER_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

// ─── Multer Config (upload الميديا مؤقتاً) ───────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/inbox-media');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || '';
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    // مسموح: صور + فيديو + صوت + PDF + ملفات شائعة
    const ALLOWED = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/3gpp',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`));
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────


/**
 * إرسال SSE notification لكل موظف مذكور في النوتس (P2-4)
 * @param {object} db - tenant DB
 * @param {number} tenantId - tenant ID
 * @param {Array<number>} mentionIds - مصفوفة IDs الموظفين المذكورين
 * @param {object} noteMsg - بيانات النوتس
 * @param {object} mentionerUser - الموظف الذي كتب النوتس
 */
async function _notifyMentions(db, tenantId, mentionIds, noteMsg, mentionerUser) {
  if (!mentionIds || mentionIds.length === 0) return;

  let sseToUser;
  try {
    const streamMod = require('./stream');
    sseToUser = streamMod.sendToUser;
  } catch (_) { return; }

  const payload = {
    type:            'note:mention',
    conversation_id: noteMsg.conversation_id,
    message_id:      noteMsg.id,
    content:         noteMsg.content,
    mentioned_by: {
      id:   mentionerUser.id,
      name: mentionerUser.name || mentionerUser.username || 'موظف',
    },
  };

  // أرسل لكل موظف مذكور بشكل فردي (لا ترسل لنفسه)
  mentionIds.forEach(uid => {
    if (uid !== mentionerUser.id) {
      sseToUser(uid, 'note:mention', payload);
    }
  });

  // سجّل mention في timeline لكل موظف مذكور
  const now = Math.floor(Date.now() / 1000);
  mentionIds.forEach(uid => {
    db.run(
      `INSERT OR IGNORE INTO inbox_timeline_v4
         (conversation_id, event_type, actor_id, actor_name, meta, created_at)
       VALUES (?, 'note_mention', ?, ?, json(?), ?)`,
      [
        noteMsg.conversation_id,
        mentionerUser.id,
        mentionerUser.name || mentionerUser.username || 'موظف',
        JSON.stringify({ mentioned_user_id: uid, message_id: noteMsg.id }),
        now,
      ],
      err => { if (err) console.error('[messages] mention timeline error:', err); }
    );
  });
}

/**
 * تحديد content_type من mimetype
 */
function _mimeToContentType(mime = '') {
  if (mime.startsWith('image/'))       return 'image';
  if (mime.startsWith('video/'))       return 'video';
  if (mime.startsWith('audio/'))       return 'audio';
  return 'file';
}

/**
 * جلب إعدادات القناة للـ tenant
 */
async function _getChannelConfig(db, platform) {
  return new Promise((resolve) => {
    db.get(
      `SELECT config FROM inbox_channel_settings_v4 WHERE platform = ? AND enabled = 1`,
      [platform],
      (err, row) => {
        if (err || !row) return resolve(null);
        try   { resolve(JSON.parse(row.config)); }
        catch { resolve(null); }
      }
    );
  });
}

/**
 * جلب بيانات المحادثة للتحقق + الحصول على platform + contact_phone
 */
async function _getConv(db, convId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, contact_phone, contact_name, platform, status, tenant_id
       FROM inbox_conversations_v4 WHERE id = ?`,
      [convId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

/**
 * حفظ رسالة في قاعدة البيانات
 * يرجع الرسالة المحفوظة
 */
async function _saveMessage(db, {
  convId, direction, contentType, content,
  mediaUrl, mediaFilename, mediaSize,
  quotedMsgId, agentId, agentName,
  externalId, platform, status = 'pending',
}) {
  const msgId = uuidv4();
  const now   = Math.floor(Date.now() / 1000);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO inbox_messages_v4
         (id, conversation_id, direction, content_type, content,
          media_url, media_filename, media_size,
          quoted_msg_id, agent_id, agent_name,
          external_id, platform, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msgId, convId, direction, contentType, content || '',
        mediaUrl || null, mediaFilename || null, mediaSize || null,
        quotedMsgId || null, agentId || null, agentName || null,
        externalId || null, platform || null, status, now,
      ],
      function (err) {
        if (err) return reject(err);
        resolve({
          id:             msgId,
          conversation_id: convId,
          direction,
          content_type:   contentType,
          content:        content || '',
          media_url:      mediaUrl || null,
          media_filename: mediaFilename || null,
          media_size:     mediaSize || null,
          quoted_msg_id:  quotedMsgId || null,
          agent_id:       agentId || null,
          agent_name:     agentName || null,
          external_id:    externalId || null,
          platform:       platform || null,
          status,
          created_at:     now,
        });
      }
    );
  });
}

/**
 * تحديث last_message في المحادثة وتحديث updated_at
 */
async function _touchConv(db, convId, content, contentType, status) {
  // لو المحادثة كانت waiting → نرجعها open عند الرد
  const statusUpdate = status === 'waiting'
    ? ', status = \'open\''
    : '';

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE inbox_conversations_v4
       SET last_message      = ?,
           last_message_type = ?,
           last_message_at   = ?,
           updated_at        = ?
           ${statusUpdate}
       WHERE id = ?`,
      [
        content || '',
        contentType || 'text',
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
        convId,
      ],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

/**
 * إرسال الرسالة عبر المنصة الفعلية
 * يرجع { externalId, error }
 *
 * يدعم: whatsapp_api, telegram
 * المنصات الأخرى: نحفظ بـ status='pending' وندعها للـ queue
 */
async function _dispatch(conv, msg, channelConfig, tenantDb) {
  const platform = msg.platform || conv.platform;

  try {
    // ── WhatsApp API ─────────────────────────────────────────────
    if (platform === 'whatsapp_api') {
      const cfg = channelConfig;
      if (!cfg || !cfg.access_token || !cfg.phone_number_id) {
        return { externalId: null, error: 'WhatsApp API غير مُفعَّل' };
      }

      let waPayload;

      if (msg.direction === 'note') {
        // الملاحظات لا تُرسَل للعميل
        return { externalId: null, error: null };
      }

      if (msg.content_type === 'text') {
        waPayload = {
          messaging_product: 'whatsapp',
          to:                conv.contact_phone,
          type:              'text',
          text:              { body: msg.content, preview_url: false },
        };
        // لو في quoted message — أضف context
        if (msg.quoted_msg_id) {
          waPayload.context = { message_id: msg.quoted_msg_id };
        }
      } else if (['image', 'video', 'audio', 'file'].includes(msg.content_type)) {
        const typeMap = { image: 'image', video: 'video', audio: 'audio', file: 'document' };
        const waType  = typeMap[msg.content_type] || 'document';
        waPayload = {
          messaging_product: 'whatsapp',
          to:   conv.contact_phone,
          type: waType,
          [waType]: { link: msg.media_url },
        };
        if (msg.content) {
          // caption للصور والفيديو والمستندات
          if (['image', 'video', 'document'].includes(waType)) {
            waPayload[waType].caption = msg.content;
          }
        }
      } else {
        return { externalId: null, error: `content_type '${msg.content_type}' غير مدعوم في WhatsApp API` };
      }

      const apiUrl = `https://graph.facebook.com/v19.0/${cfg.phone_number_id}/messages`;
      const resp   = await fetch(apiUrl, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${cfg.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(waPayload),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const errMsg = json?.error?.message || `HTTP ${resp.status}`;
        return { externalId: null, error: errMsg };
      }

      const externalId = json?.messages?.[0]?.id || null;
      return { externalId, error: null };
    }

    // ── Telegram ─────────────────────────────────────────────────
    if (platform === 'telegram') {
      const cfg = channelConfig;
      if (!cfg || !cfg.bot_token) {
        return { externalId: null, error: 'Telegram Bot غير مُفعَّل' };
      }

      if (msg.direction === 'note') {
        return { externalId: null, error: null };
      }

      let method, payload;
      const chatId = conv.contact_phone; // نستخدم contact_phone لتخزين chat_id

      if (msg.content_type === 'text') {
        method  = 'sendMessage';
        payload = {
          chat_id:    chatId,
          text:       msg.content,
          parse_mode: 'HTML',
        };
        if (msg.quoted_msg_id) {
          payload.reply_to_message_id = parseInt(msg.quoted_msg_id, 10) || undefined;
        }
      } else if (msg.content_type === 'image') {
        method  = 'sendPhoto';
        payload = { chat_id: chatId, photo: msg.media_url };
        if (msg.content) payload.caption = msg.content;
      } else if (msg.content_type === 'video') {
        method  = 'sendVideo';
        payload = { chat_id: chatId, video: msg.media_url };
        if (msg.content) payload.caption = msg.content;
      } else if (msg.content_type === 'audio') {
        method  = 'sendAudio';
        payload = { chat_id: chatId, audio: msg.media_url };
      } else {
        method  = 'sendDocument';
        payload = { chat_id: chatId, document: msg.media_url };
        if (msg.content) payload.caption = msg.content;
      }

      const apiUrl = `https://api.telegram.org/bot${cfg.bot_token}/${method}`;
      const resp   = await fetch(apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));
      if (!json.ok) {
        return { externalId: null, error: json.description || 'Telegram error' };
      }

      const externalId = String(json.result?.message_id || '');
      return { externalId, error: null };
    }

    // ── منصات أخرى (pending — تُرسَل لاحقاً بـ queue) ────────────
    return { externalId: null, error: null };

  } catch (e) {
    return { externalId: null, error: e.message };
  }
}

// ─── POST /conversations/:id/messages ─────────────────────────────────────────
// إرسال رسالة نصية أو ملاحظة
router.post('/conversations/:id/messages', async (req, res) => {
  const { id: convId } = req.params;
  const {
    content       = '',
    content_type  = 'text',
    direction     = 'outbound',  // outbound | note
    media_url,
    media_filename,
    quoted_msg_id,
    channel_override,
    mention_ids,               // P2-4: موظفين مذكورين في النوتس
  } = req.body;

  // ── Validation ─────────────────────────────────────────────────────────
  const isNote = direction === 'note';

  if (!isNote && !content.trim() && !media_url) {
    return res.status(400).json({ error: 'الرسالة فارغة' });
  }

  if (content.length > 4096) {
    return res.status(400).json({ error: 'الرسالة طويلة جداً (الحد 4096 حرف)' });
  }

  const VALID_TYPES = ['text', 'image', 'video', 'audio', 'file', 'template'];
  if (!VALID_TYPES.includes(content_type)) {
    return res.status(400).json({ error: `content_type غير مدعوم: ${content_type}` });
  }

  try {
    const db = req.db;

    // ── جلب المحادثة ────────────────────────────────────────────────────
    const conv = await _getConv(db, convId);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (conv.status === 'closed' && !isNote) {
      return res.status(400).json({ error: 'المحادثة مغلقة — افتحها أولاً' });
    }

    // ── تحديد المنصة ────────────────────────────────────────────────────
    const platform = channel_override || conv.platform;

    // ── جلب إعدادات القناة ──────────────────────────────────────────────
    const channelConfig = await _getChannelConfig(db, platform);

    // ── حفظ الرسالة بـ status=pending ──────────────────────────────────
    const savedMsg = await _saveMessage(db, {
      convId,
      direction:     isNote ? 'note' : 'outbound',
      contentType:   content_type,
      content:       content.trim(),
      mediaUrl:      media_url    || null,
      mediaFilename: media_filename || null,
      quotedMsgId:   quoted_msg_id  || null,
      agentId:       req.user.id,
      agentName:     req.user.name || req.user.username || 'موظف',
      platform,
      status:        isNote ? 'sent' : 'pending',
    });

    // ── SSE: أبلغ الـ clients فوراً ─────────────────────────────────────
    try {
      const { broadcast: sseBroadcast } = require('./stream');
      sseBroadcast(req.user.id, {
        type: 'message_new',
        data: { ...savedMsg, conversation_id: convId },
      });
    } catch (_) { /* stream not loaded yet */ }

    // ── تحديث المحادثة ──────────────────────────────────────────────────
    if (!isNote) {
      await _touchConv(db, convId, content.trim() || '[ميديا]', content_type, conv.status);
    }

    // ── إرسال عبر المنصة ────────────────────────────────────────────────
    if (!isNote) {
      const { externalId, error: dispatchErr } = await _dispatch(conv, savedMsg, channelConfig, db);

      if (dispatchErr) {
        // فشل الإرسال — حدّث status إلى failed
        db.run(
          `UPDATE inbox_messages_v4 SET status = 'failed', fail_reason = ? WHERE id = ?`,
          [dispatchErr, savedMsg.id]
        );
        savedMsg.status      = 'failed';
        savedMsg.fail_reason = dispatchErr;

        // SSE: أبلغ بالفشل
        try {
          const { broadcast: sseBroadcast } = require('./stream');
          sseBroadcast(req.user.id, {
            type: 'message_status',
            data: { id: savedMsg.id, conversation_id: convId, status: 'failed', fail_reason: dispatchErr },
          });
        } catch (_) {}
      } else {
        // نجح — حدّث status إلى sent + external_id
        const newStatus = externalId ? 'sent' : 'pending';
        db.run(
          `UPDATE inbox_messages_v4 SET status = ?, external_id = ? WHERE id = ?`,
          [newStatus, externalId, savedMsg.id]
        );
        savedMsg.status      = newStatus;
        savedMsg.external_id = externalId;

        // SSE: حدّث الحالة
        try {
          const { broadcast: sseBroadcast } = require('./stream');
          sseBroadcast(req.user.id, {
            type: 'message_status',
            data: { id: savedMsg.id, conversation_id: convId, status: newStatus },
          });
        } catch (_) {}
      }
    }

    // ── SLA: تسجيل أول رد صادر (P3-6) ──────────────────────────────────
    // فقط للرسائل الصادرة الحقيقية (ليس النوتس ولا المحذوفة)
    if (!isNote && savedMsg.status !== 'failed') {
      try {
        const { recordFirstResponse } = require('./conversations');
        recordFirstResponse(db, convId, savedMsg.sent_at || Math.floor(Date.now() / 1000));
      } catch (_) { /* لو conversations.js لم يتحمل بعد */ }
    }

    // ── @Mentions notification (P2-4) ─────────────────────────────────
    if (isNote && Array.isArray(mention_ids) && mention_ids.length > 0) {
      const mentionIdsInt = mention_ids
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
      await _notifyMentions(
        db,
        req.user.tenant_id,
        mentionIdsInt,
        { ...savedMsg, conversation_id: convId },
        req.user
      );
    }

    // ── SSE: تحديث المحادثة في القائمة ─────────────────────────────────
    try {
      const { broadcast: sseBroadcast } = require('./stream');
      sseBroadcast(req.user.id, {
        type: 'conv_update',
        data: { id: convId, last_message: content.trim() || '[ميديا]', last_message_type: content_type },
      });
    } catch (_) {}

    return res.json({
      success:       true,
      message:       savedMsg,
      mention_count: Array.isArray(mention_ids) ? mention_ids.length : 0,
    });

  } catch (e) {
    console.error('[messages.js] send error:', e);
    return res.status(500).json({ error: 'خطأ داخلي في الخادم' });
  }
});

// ─── POST /conversations/:id/messages/media ────────────────────────────────────
// رفع ملف + إرسال كرسالة
router.post(
  '/conversations/:id/messages/media',
  upload.single('file'),
  async (req, res) => {
    const { id: convId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'لم يُرفق أي ملف' });
    }

    // ── بناء URL للملف المرفوع ──────────────────────────────────────────
    const baseUrl  = process.env.BASE_URL || `https://${req.hostname}`;
    const mediaUrl = `${baseUrl}/uploads/inbox-media/${req.file.filename}`;
    const contentType = _mimeToContentType(req.file.mimetype);

    // ── محاكاة body الإرسال العادي ──────────────────────────────────────
    req.body.content_type   = contentType;
    req.body.media_url      = mediaUrl;
    req.body.media_filename = req.file.originalname;
    req.body.content        = req.body.caption || '';

    // أكمل عبر الـ handler نفسه باستدعاء db مباشرة
    const { content = '', quoted_msg_id, channel_override } = req.body;

    try {
      const db   = req.db;
      const conv = await _getConv(db, convId);
      if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
      if (conv.status === 'closed') return res.status(400).json({ error: 'المحادثة مغلقة' });

      const platform      = channel_override || conv.platform;
      const channelConfig = await _getChannelConfig(db, platform);

      const savedMsg = await _saveMessage(db, {
        convId,
        direction:     'outbound',
        contentType,
        content:       content.trim(),
        mediaUrl,
        mediaFilename: req.file.originalname,
        mediaSize:     req.file.size,
        quotedMsgId:   quoted_msg_id || null,
        agentId:       req.user.id,
        agentName:     req.user.name || req.user.username || 'موظف',
        platform,
        status:        'pending',
      });

      // SSE: أبلغ فوراً
      try {
        const { broadcast: sseBroadcast } = require('./stream');
        sseBroadcast(req.user.id, { type: 'message_new', data: { ...savedMsg, conversation_id: convId } });
      } catch (_) {}

      await _touchConv(db, convId, `[${contentType}]`, contentType, conv.status);

      // إرسال عبر المنصة
      const { externalId, error: dispatchErr } = await _dispatch(conv, savedMsg, channelConfig, db);

      if (dispatchErr) {
        db.run(`UPDATE inbox_messages_v4 SET status = 'failed', fail_reason = ? WHERE id = ?`, [dispatchErr, savedMsg.id]);
        savedMsg.status = 'failed';
      } else {
        const newStatus = externalId ? 'sent' : 'pending';
        db.run(`UPDATE inbox_messages_v4 SET status = ?, external_id = ? WHERE id = ?`, [newStatus, externalId, savedMsg.id]);
        savedMsg.status = newStatus;
      }

      return res.json({ success: true, message: savedMsg });

    } catch (e) {
      console.error('[messages.js] media send error:', e);
      // حذف الملف المؤقت في حالة الفشل
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: 'خطأ داخلي في الخادم' });
    }
  }
);

// ─── POST /conversations/:id/messages/:msgId/transcript ─────────────────────
// يحوّل voice note إلى نص عبر Whisper API
// - يحفظ النتيجة في metadata الرسالة لتجنب إعادة الحساب
// - يرجع { transcript, cached } — cached=true لو كان محفوظاً مسبقاً
router.post('/conversations/:id/messages/:msgId/transcript', async (req, res) => {
  const { id: convId, msgId } = req.params;

  try {
    const db = req.db;

    // ── جلب الرسالة ──────────────────────────────────────────────────────
    const msg = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, content_type, media_url, metadata FROM inbox_messages_v4
         WHERE id = ? AND conversation_id = ?`,
        [msgId, convId],
        (err, row) => { if (err) return reject(err); resolve(row || null); }
      );
    });

    if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    if (msg.content_type !== 'audio') {
      return res.status(400).json({ error: 'الرسالة ليست voice note' });
    }
    if (!msg.media_url) return res.status(400).json({ error: 'لا يوجد ملف صوتي' });

    // ── فحص cache في metadata ────────────────────────────────────────────
    let meta = {};
    try { meta = JSON.parse(msg.metadata || '{}'); } catch (_) {}

    if (meta.transcript) {
      return res.json({ transcript: meta.transcript, cached: true });
    }

    if (!WHISPER_KEY) {
      return res.status(503).json({ error: 'WHISPER_API_KEY غير محدد في .env' });
    }

    // ── تحميل ملف الصوت مؤقتاً ───────────────────────────────────────────
    const tmpPath = path.join(UPLOAD_DIR, `whisper_${uuidv4()}.tmp`);
    await _downloadFile(msg.media_url, tmpPath);

    // ── إرسال لـ Whisper API ──────────────────────────────────────────────
    let transcript;
    try {
      transcript = await _callWhisper(tmpPath, msg.media_url);
    } finally {
      // حذف الملف المؤقت دائماً
      fs.unlink(tmpPath, () => {});
    }

    // ── حفظ في metadata ──────────────────────────────────────────────────
    meta.transcript = transcript;
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE inbox_messages_v4 SET metadata = ? WHERE id = ?`,
        [JSON.stringify(meta), msgId],
        (err) => { if (err) return reject(err); resolve(); }
      );
    });

    return res.json({ transcript, cached: false });

  } catch (e) {
    console.error('[messages.js] transcript error:', e.message);
    return res.status(500).json({ error: e.message || 'خطأ داخلي في الخادم' });
  }
});

/**
 * تحميل ملف من URL إلى مسار مؤقت
 */
function _downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(fileUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;
    const file     = fs.createWriteStream(destPath);

    const doRequest = (url) => {
      protocol.get(url, (response) => {
        // دعم الـ redirect
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          file.close();
          return doRequest(response.headers.location);
        }
        if (response.statusCode !== 200) {
          file.close();
          return reject(new Error(`فشل تحميل الملف: HTTP ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
      }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    };

    doRequest(fileUrl);
  });
}

/**
 * استدعاء Whisper API بـ multipart/form-data
 * @param {string} filePath - المسار المحلي للملف
 * @param {string} originalUrl - URL الأصلي لاستنتاج الامتداد
 * @returns {Promise<string>} النص المستخرج
 */
function _callWhisper(filePath, originalUrl) {
  return new Promise((resolve, reject) => {
    // اكتشاف امتداد الملف من الـ URL
    const ext = path.extname(new URL(originalUrl).pathname).toLowerCase() || '.ogg';
    const filename = `audio${ext}`;

    const fileBuffer  = fs.readFileSync(filePath);
    const boundary    = `----WhisperBoundary${Date.now()}`;

    // بناء multipart body يدوياً
    const CRLF   = '\r\n';
    let bodyParts = [];

    // حقل model
    bodyParts.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}${WHISPER_MODEL}${CRLF}`)
    );

    // حقل language (عربي كـ hint مع fallback)
    bodyParts.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}ar${CRLF}`)
    );

    // حقل الملف
    const mimeType = _extToMime(ext);
    bodyParts.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`)
    );
    bodyParts.push(fileBuffer);
    bodyParts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

    const body = Buffer.concat(bodyParts);

    const parsed  = new URL(`${WHISPER_BASE}/audio/transcriptions`);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${WHISPER_KEY}`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const lib = parsed.protocol === 'https:' ? https : http;
    const reqW = lib.request(options, (resp) => {
      let data = '';
      resp.on('data', (c) => { data += c; });
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.text) return resolve(json.text.trim());
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          reject(new Error('استجابة غير متوقعة من Whisper: ' + data.slice(0, 200)));
        } catch (_) {
          reject(new Error('فشل تحليل استجابة Whisper: ' + data.slice(0, 200)));
        }
      });
    });

    reqW.on('error', reject);
    // timeout 60 ثانية
    reqW.setTimeout(60000, () => { reqW.destroy(); reject(new Error('Whisper API timeout')); });
    reqW.write(body);
    reqW.end();
  });
}

/**
 * تحويل امتداد ملف صوتي إلى MIME type
 */
function _extToMime(ext) {
  const MAP = {
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg',
    '.mp4': 'audio/mp4', '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm',
  };
  return MAP[ext] || 'audio/ogg';
}

module.exports = router;

/**
 * dispatchOutbound — يُستخدمه automation.js لإرسال الرد (تجنب circular require)
 * @param {Object} db       - tenant DB
 * @param {Object} conv     - بيانات المحادثة
 * @param {Object} msg      - { content_type, content, msg_id }
 * @returns {Promise}
 */
async function dispatchOutbound(db, conv, msg) {
  const channelConfig = await _getChannelConfig(db, conv.platform);
  return _dispatch(conv, { ...msg, platform: conv.platform }, channelConfig, db);
}

module.exports.dispatchOutbound = dispatchOutbound;
