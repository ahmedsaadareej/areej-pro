/**
 * Inbox Webhooks — Telegram + Meta
 * Public routes (no auth) — called by external platforms
 */
const express = require('express');
const router = express.Router();
const { getTenantDb } = require('./db-tenant');
const master = require('./db-master');
const https = require('https');

// Helper: find tenant by slug or user_id
function getTenantBySlug(slug) {
  return master.prepare('SELECT * FROM users WHERE slug=?').get(slug);
}

// Helper: make HTTP/HTTPS request returning parsed JSON
function httpPost(url, payload) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const data = JSON.stringify(payload);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
      });
      req.on('error', () => resolve({}));
      req.write(data);
      req.end();
    } catch(e) { resolve({}); }
  });
}

// Helper: GET request returning parsed JSON
function httpGet(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET'
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
      });
      req.on('error', () => resolve({}));
      req.end();
    } catch(e) { resolve({}); }
  });
}

// Helper: Ensure media columns exist in inbox_messages
function ensureMediaColumns(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(inbox_messages)").all().map(c => c.name);
    if (!cols.includes('media_url'))  db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_url TEXT").run();
    if (!cols.includes('media_type')) db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_type TEXT").run();
    if (!cols.includes('file_id'))    db.prepare("ALTER TABLE inbox_messages ADD COLUMN file_id TEXT").run();
  } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
}

// Helper: Get Telegram file URL from file_id
async function getTelegramFileUrl(token, fileId) {
  try {
    const resp = await httpGet(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (resp.ok && resp.result && resp.result.file_path) {
      return `https://api.telegram.org/file/bot${token}/${resp.result.file_path}`;
    }
  } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
  return null;
}

// Helper: Detect media from Telegram message
async function detectTelegramMedia(msg, token) {
  let mediaType = null, fileId = null, mediaUrl = null;

  if (msg.photo && msg.photo.length > 0) {
    // Take last (highest quality)
    fileId = msg.photo[msg.photo.length - 1].file_id;
    mediaType = 'image';
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    mediaType = 'audio';
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    mediaType = 'audio';
  } else if (msg.video) {
    fileId = msg.video.file_id;
    mediaType = 'video';
  } else if (msg.video_note) {
    fileId = msg.video_note.file_id;
    mediaType = 'video';
  } else if (msg.document) {
    fileId = msg.document.file_id;
    mediaType = 'file';
  } else if (msg.sticker) {
    fileId = msg.sticker.file_id;
    mediaType = 'sticker';
  }

  if (fileId && token) {
    mediaUrl = await getTelegramFileUrl(token, fileId);
  }

  return { mediaType, fileId, mediaUrl };
}

// ── TELEGRAM WEBHOOK ── 
// POST /api/webhook/telegram/:userId
router.post('/telegram/:userId', express.json(), async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (!userId || isNaN(userId)) return res.json({ ok: false });

  // ── Security: تحقق إن userId موجود فعلاً في master DB ──────────────
  const userExists = master.prepare('SELECT id FROM users WHERE id=? AND status IN (?,?,?)').get(userId, 'active', 'trial', 'grace');
  if (!userExists) return res.json({ ok: false });
  
  try {
    const db = getTenantDb(userId);
    
    // Ensure media columns exist
    ensureMediaColumns(db);
    
    const settings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (!settings || !settings.telegram_active) return res.json({ ok: false, error: 'telegram not active' });

    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg) return res.json({ ok: true }); // ignore non-message updates

    const senderId = String(msg.from.id);
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || 'مجهول';
    
    // Detect media
    const { mediaType, fileId, mediaUrl } = await detectTelegramMedia(msg, settings.telegram_token);
    
    // Content: handle all Telegram message types
    let content = msg.caption || msg.text || '';
    if (!content) {
      if (mediaType) { content = `[${mediaType}]`; }
      else if (msg.dice) { content = `🎲 ${msg.dice.emoji} — نتيجة: ${msg.dice.value}`; }
      else if (msg.location) { content = `📍 موقع: ${msg.location.latitude},${msg.location.longitude}`; }
      else if (msg.contact) { content = `👤 جهة اتصال: ${msg.contact.first_name} ${msg.contact.phone_number||''}`; }
      else if (msg.poll) { content = `📊 استطلاع: ${msg.poll.question}`; }
      else if (msg.game) { content = `🎮 لعبة: ${msg.game.title}`; }
      else if (msg.venue) { content = `🏢 مكان: ${msg.venue.title}`; }
      else if (msg.invoice) { content = `🧾 فاتورة: ${msg.invoice.title}`; }
      else { content = '[رسالة]'; }
    }
    
    // Find or create conversation
    let existingConv = db.prepare('SELECT * FROM inbox_conversations WHERE platform=? AND sender_id=?').get('telegram', senderId);
    let conv;
    let isNewConv = false;
    if (!existingConv) {
      const r = db.prepare(`INSERT INTO inbox_conversations (platform, sender_id, sender_name, last_message, last_message_at, unread_count) VALUES (?,?,?,?,datetime('now'),1)`)
        .run('telegram', senderId, senderName, content);
      conv = { id: r.lastInsertRowid };
      isNewConv = true;
    } else {
      conv = existingConv;
      db.prepare(`UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now'), unread_count=unread_count+1, sender_name=? WHERE id=?`)
        .run(content, senderName, conv.id);
    }
    // توزيع تلقائي للمحادثات الجديدة
    if (isNewConv) {
      try { require('./inbox-distributor').autoAssign(db, conv.id, 'telegram'); } catch(e) { console.error('[webhook/distribute]', e.message); }
    }

    // Save message (with media info)
    const platformMsgId = String(msg.message_id);
    db.prepare(`INSERT OR IGNORE INTO inbox_messages 
      (conversation_id, platform, direction, content, message_type, platform_msg_id, media_url, media_type, file_id) 
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(conv.id, 'telegram', 'in', content, mediaType || 'text', platformMsgId, mediaUrl || null, mediaType || null, fileId || null);

    // Add notification
    const notifContent = content.substring(0, 80);
    db.prepare(`INSERT INTO notifications (title, body, type) VALUES (?,?,?)`)
      .run('💬 رسالة تيليجرام جديدة', senderName + ': ' + notifContent, 'info');

    // Chatbot Flow
    if (settings && settings.telegram_active && settings.telegram_token) {
      try {
        const chatbotSettings = db.prepare("SELECT chatbot_active, chatbot_trigger FROM inbox_settings WHERE id=1").get();
        if (chatbotSettings && chatbotSettings.chatbot_active) {
          const msgLower = (msg.text || '').toLowerCase().trim();
          let matchedFlow = null;
          // First check start flows
          const startFlows = db.prepare("SELECT * FROM inbox_chatbot_flows WHERE is_start=1").all();
          for (const f of startFlows) {
            if (msgLower.includes(f.trigger_text.toLowerCase())) { matchedFlow = f; break; }
          }
          // Then check child flows
          if (!matchedFlow) {
            const allFlows = db.prepare("SELECT * FROM inbox_chatbot_flows WHERE is_start=0").all();
            for (const f of allFlows) {
              if (msgLower === f.trigger_text.toLowerCase() || msgLower.includes(f.trigger_text.toLowerCase())) { matchedFlow = f; break; }
            }
          }
          if (matchedFlow) {
            const children = db.prepare("SELECT * FROM inbox_chatbot_flows WHERE parent_id=?").all(matchedFlow.id);
            let reply = matchedFlow.response_text;
            if (children.length) {
              reply += '\n\n' + children.map((c, i) => (i+1) + '. ' + c.trigger_text).join('\n');
            }
            await httpPost(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, { chat_id: senderId, text: reply });
            db.prepare("INSERT INTO inbox_messages (conversation_id,platform,direction,content,message_type) VALUES (?,?,?,?,?)").run(conv.id,'telegram','out',reply,'text');
          }
        }
      } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
    }

    // Order Status Bot: detect order number pattern ORD-XXXX or just number
    if (settings && settings.telegram_active && settings.telegram_token && msg.text) {
      const orderMatch = msg.text.match(/(?:ORD-?)?(\d{4,6})/i);
      if (orderMatch) {
        try {
          const possibleOrderNo1 = 'ORD-' + orderMatch[1].padStart(4, '0');
          const possibleOrderNo2 = orderMatch[1];
          const order = db.prepare("SELECT * FROM sys_orders WHERE order_no=? OR order_no=?").get(possibleOrderNo1, possibleOrderNo2);
          if (order) {
            const STATUS_AR = { new:'جديد ✨', confirmed:'مؤكد ✅', in_production:'قيد الإنتاج 🖨️', ready:'جاهز 📦', preparing:'قيد التجهيز ⚙️', shipped:'في الطريق 🚚', delivered:'تم التسليم ✅', cancelled:'ملغي ❌', returned:'مرتجع ↩️' };
            const statusAr = STATUS_AR[order.status] || order.status;
            let replyMsg = `🌿 تفاصيل طلبك:\n\n📋 رقم الطلب: ${order.order_no}\n👤 الاسم: ${order.client_name}\n💰 الإجمالي: ${order.total} ج.م\n📊 الحالة: ${statusAr}`;
            if (order.tracking_no) {
              replyMsg += `\n🚚 رقم الشحنة: ${order.tracking_no}\n🔗 تتبع: https://pro.areejegypt.com/track/${order.tracking_no}`;
            }
            await httpPost(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, { chat_id: senderId, text: replyMsg });
            db.prepare("INSERT INTO inbox_messages (conversation_id,platform,direction,content,message_type) VALUES (?,?,?,?,?)").run(conv.id,'telegram','out',replyMsg,'text');
          }
        } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
      }
    }

    // Keyword Auto-Reply
    if (settings && settings.telegram_active && settings.telegram_token && msg.text) {
      const keywords = db.prepare("SELECT * FROM inbox_keywords WHERE active=1").all();
      const msgLower = (msg.text || '').toLowerCase().trim();
      for (const kw of keywords) {
        if (msgLower.includes(kw.keyword.toLowerCase())) {
          try {
            await httpPost(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, { chat_id: senderId, text: kw.reply });
            db.prepare("INSERT INTO inbox_messages (conversation_id,platform,direction,content,message_type) VALUES (?,?,?,?,?)").run(conv.id,'telegram','out',kw.reply,'text');
          } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
          break; // respond to first matching keyword only
        }
      }
    }

    // Auto-messages: welcome or away
    const autoSettings = db.prepare('SELECT * FROM inbox_settings WHERE id=1').get();
    if (autoSettings && settings.telegram_token) {
      const isNewConv = !existingConv;
      const now = new Date();
      const hour = now.getHours();
      const min = now.getMinutes();
      const nowMins = hour * 60 + min;

      // Welcome message (first message from new contact)
      if (isNewConv && autoSettings.welcome_active && autoSettings.welcome_message) {
        try {
          await httpPost(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, { chat_id: senderId, text: autoSettings.welcome_message });
        } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
      }

      // Away message
      if (!isNewConv && autoSettings.away_active && autoSettings.away_message) {
        const [awayStartH, awayStartM] = (autoSettings.away_start||'22:00').split(':').map(Number);
        const [awayEndH, awayEndM]   = (autoSettings.away_end||'09:00').split(':').map(Number);
        const awayStartMins = awayStartH * 60 + awayStartM;
        const awayEndMins   = awayEndH * 60 + awayEndM;
        const isAway = awayStartMins > awayEndMins
          ? (nowMins >= awayStartMins || nowMins < awayEndMins)
          : (nowMins >= awayStartMins && nowMins < awayEndMins);
        if (isAway) {
          try {
            await httpPost(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, { chat_id: senderId, text: autoSettings.away_message });
          } catch(e) { console.error('[routes-inbox-webhook.js]', e.message); }
        }
      }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('Telegram webhook error:', e.message);
    res.json({ ok: false });
  }
});

module.exports = router;

// ── WHATSAPP API WEBHOOK ──
// GET /api/webhook/whatsapp/:userId  ← Meta Verification
router.get('/whatsapp/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token || !challenge) {
    return res.status(400).send('Bad Request');
  }

  if (!userId || isNaN(userId)) return res.status(404).send('Not Found');
  const userExists = master.prepare('SELECT id FROM users WHERE id=? AND status IN (?,?,?)').get(userId, 'active', 'trial', 'grace');
  if (!userExists) return res.status(404).send('Not Found');

  try {
    const db = getTenantDb(userId);
    try { db.prepare('ALTER TABLE inbox_settings ADD COLUMN wa_verify_token TEXT').run(); } catch(e) {}
    const settings = db.prepare('SELECT wa_verify_token FROM inbox_settings WHERE id=1').get();
    if (!settings) return res.status(403).send('Forbidden');

    const storedToken = (settings.wa_verify_token || '').trim();
    if (storedToken && token === storedToken) {
      console.log('[WA Webhook] Verified userId=' + userId);
      return res.status(200).send(challenge);
    }
    console.warn('[WA Webhook] Token mismatch userId=' + userId + ' got=' + token + ' expected=' + storedToken);
    return res.status(403).send('Forbidden');
  } catch(e) {
    console.error('[WA Webhook GET]', e.message);
    return res.status(500).send('Error');
  }
});

// POST /api/webhook/whatsapp/:userId  ← Incoming Messages
router.post('/whatsapp/:userId', express.json(), async (req, res) => {
  res.status(200).send('OK'); // رد فوري لـ Meta
  const userId = parseInt(req.params.userId);
  const body = req.body;
  console.log('[WA Webhook POST] userId=' + userId + ' body=' + JSON.stringify(body));
  if (!body || body.object !== 'whatsapp_business_account') {
    console.log('[WA Webhook POST] ignored — object=' + (body && body.object));
    return;
  }

  if (!userId || isNaN(userId)) return;
  const userExists = master.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!userExists) return;

  try {
    const db = getTenantDb(userId);
    ensureMediaColumns(db);
    const settings = db.prepare('SELECT wa_active, wa_phone_id, wa_token FROM inbox_settings WHERE id=1').get();
    if (!settings || !settings.wa_active) return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const val = change.value || {};
        for (const msg of (val.messages || [])) {
          const senderId   = msg.from;
          const senderName = (val.contacts || []).find(c => c.wa_id === senderId)?.profile?.name || senderId;
          const msgId      = msg.id;
          const ts         = parseInt(msg.timestamp) || Math.floor(Date.now()/1000);

          let content = '';
          let mediaType = null;

          if (msg.type === 'text') {
            content = msg.text?.body || '';
          } else if (['image','audio','video','document','sticker'].includes(msg.type)) {
            const mediaObj = msg[msg.type] || {};
            mediaType = msg.type;
            content   = mediaObj.caption || ('[' + msg.type + ']');
          } else if (msg.type === 'location') {
            content = '📍 موقع: ' + msg.location?.latitude + ', ' + msg.location?.longitude;
          } else {
            content = '[' + msg.type + ']';
          }

          // Upsert conversation
          let conv = db.prepare('SELECT id FROM inbox_conversations WHERE platform=? AND sender_id=?').get('whatsapp', senderId);
          if (!conv) {
            db.prepare("INSERT INTO inbox_conversations (platform, sender_id, sender_name, unread_count, last_message, last_message_at, created_at, status) VALUES ('whatsapp', ?, ?, 1, ?, datetime('now'), datetime('now'), 'open')").run(senderId, senderName, content);
            conv = db.prepare('SELECT id FROM inbox_conversations WHERE platform=? AND sender_id=?').get('whatsapp', senderId);
          } else {
            db.prepare("UPDATE inbox_conversations SET unread_count=unread_count+1, last_message=?, last_message_at=datetime('now'), sender_name=? WHERE id=?").run(content, senderName, conv.id);
          }

          // Insert message — avoid duplicates by platform_msg_id
          const exists = db.prepare('SELECT id FROM inbox_messages WHERE platform_msg_id=?').get(msgId);
          if (!exists) {
            db.prepare("INSERT INTO inbox_messages (conversation_id, platform, direction, content, media_type, is_read, platform_msg_id, sent_at) VALUES (?, 'whatsapp', 'in', ?, ?, 0, ?, datetime(?, 'unixepoch'))").run(conv.id, content, mediaType, msgId, ts);
          }
          console.log('[WA Webhook POST] saved msg convId=' + (conv && conv.id) + ' from=' + senderId + ' content=' + content);
        }
      }
    }
  } catch(e) {
    console.error('[WA Webhook POST]', e.message);
  }
});
