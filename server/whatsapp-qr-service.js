/**
 * WhatsApp QR Service — whatsapp-web.js based
 * Manages one WA session per tenant user
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Store active clients per userId
const sessions = {}; // userId -> { client, status, qrDataUrl, phone, listeners }

const SESSION_DIR = path.join(__dirname, '../data/wa-sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

/**
 * Start a WA session for a user
 * status: 'loading' | 'qr' | 'connected' | 'disconnected' | 'error'
 */
async function startSession(userId) {
  // If already running and connected, do nothing
  if (sessions[userId] && sessions[userId].status === 'connected') {
    return { ok: true, status: 'connected', phone: sessions[userId].phone };
  }

  // If loading/qr already in progress
  if (sessions[userId] && ['loading', 'qr'].includes(sessions[userId].status)) {
    return { ok: true, status: sessions[userId].status };
  }

  // Destroy old session if exists
  if (sessions[userId]) {
    try { await sessions[userId].client.destroy(); } catch(e) { console.error('[whatsapp-qr-service.js]', e.message); }
  }

  sessions[userId] = { status: 'loading', qrDataUrl: null, phone: null, client: null };

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `user_${userId}`,
      dataPath: SESSION_DIR
    }),
    puppeteer: {
      headless: true,
      executablePath: (() => {
        // Prefer puppeteer bundled Chrome; fallback to system chromium
        try {
          const p = require('puppeteer');
          const ep = p.executablePath();
          if (require('fs').existsSync(ep)) return ep;
        } catch(_) {}
        return '/usr/bin/chromium-browser';
      })(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // removed accelerated
        // removed no-first-run
        // removed no-zygote
        '--disable-gpu',
        // removed single-process
      ]
    }
  });

  sessions[userId].client = client;

  client.on('qr', async (qr) => {
    try {
      const dataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 1 });
      sessions[userId].status = 'qr';
      sessions[userId].qrDataUrl = dataUrl;
      console.log(`[WA-QR] User ${userId}: QR generated`);
    } catch(e) {
      console.error('[WA-QR] QR generate error:', e.message);
    }
  });

  // Helper to mark as connected
  function markConnected() {
    if (sessions[userId]?.status === 'connected') return; // already set
    const info = client.info;
    const phone = info?.wid?.user ? '+' + info.wid.user : 'متصل';
    sessions[userId].status = 'connected';
    sessions[userId].phone = phone;
    sessions[userId].qrDataUrl = null;
    console.log(`[WA-QR] User ${userId}: Connected as ${phone}`);
  }

  client.on('ready', markConnected);

  // Fallback: loading_screen at 99%+ also means connected
  client.on('loading_screen', (percent, message) => {
    if (percent >= 99) {
      console.log(`[WA-QR] User ${userId}: loading_screen ${percent}% — treating as connected`);
      setTimeout(markConnected, 2000); // small delay for client.info to populate
    }
  });

  client.on('authenticated', () => {
    sessions[userId].status = 'loading';
    console.log(`[WA-QR] User ${userId}: Authenticated`);
  });

  client.on('auth_failure', () => {
    sessions[userId].status = 'error';
    console.log(`[WA-QR] User ${userId}: Auth failure`);
  });

  client.on('disconnected', (reason) => {
    sessions[userId].status = 'disconnected';
    console.log(`[WA-QR] User ${userId}: Disconnected — ${reason}`);
  });

  client.on('message', async (msg) => {
    // Forward incoming WA messages to the inbox
    try {
      await handleIncomingMessage(userId, msg);
    } catch(e) {
      console.error('[WA-QR] Message handle error:', e.message);
    }
  });

  // Initialize (non-blocking)
  client.initialize().catch(e => {
    sessions[userId].status = 'error';
    console.error(`[WA-QR] Init error for user ${userId}:`, e.message);
  });

  return { ok: true, status: 'loading' };
}

/**
 * Get session status
 */
function getStatus(userId) {
  const s = sessions[userId];
  if (!s) return { status: 'stopped', qr: null, phone: null };
  return { status: s.status, qr: s.qrDataUrl, phone: s.phone };
}

/**
 * Stop a session
 */
async function stopSession(userId) {
  const s = sessions[userId];
  if (!s) return;
  try { await s.client.destroy(); } catch(e) { console.error('[whatsapp-qr-service.js]', e.message); }
  delete sessions[userId];
}

/**
 * Send a message via WA QR session
 */
async function sendMessage(userId, to, message) {
  const s = sessions[userId];
  if (!s || s.status !== 'connected') throw new Error('WA غير متصل');
  // If already has @, use as-is; else normalize to @c.us
  const chatId = to.includes('@') ? to : to.replace(/\D/g, '') + '@c.us';
  const result = await s.client.sendMessage(chatId, message);
  console.log(`[WA-QR] Sent to ${chatId}: OK`);
  return result;
}

/**
 * Handle incoming WA message → save to inbox DB
 */
async function handleIncomingMessage(userId, msg) {
  if (msg.fromMe) return; // ignore outgoing

  const { getTenantDb } = require('./db-tenant');
  const db = getTenantDb(userId);

  // Ensure media columns exist
  try {
    const cols = db.prepare("PRAGMA table_info(inbox_messages)").all().map(c => c.name);
    if (!cols.includes('media_url'))  db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_url TEXT").run();
    if (!cols.includes('media_type')) db.prepare("ALTER TABLE inbox_messages ADD COLUMN media_type TEXT").run();
    if (!cols.includes('file_id'))    db.prepare("ALTER TABLE inbox_messages ADD COLUMN file_id TEXT").run();
  } catch(e) { console.error('[whatsapp-qr-service.js]', e.message); }

  const senderId = msg.from; // Keep full JID (@c.us or @lid)
  const senderName = msg._data?.notifyName || msg._data?.pushName || msg.author || senderId;

  // Detect message type and content
  let msgType = 'text';
  let content = msg.body || '';
  let mediaUrl = null;
  let mediaType = null;

  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (media) {
        // Save media to disk
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '../public/uploads/inbox');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
        const filename = `wa-${Date.now()}-${Math.random().toString(36).substring(2,7)}.${ext}`;
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, Buffer.from(media.data, 'base64'));
        mediaUrl = `/uploads/inbox/${filename}`;

        // Determine type
        if (media.mimetype.startsWith('image/')) { mediaType = 'image'; msgType = 'image'; content = msg.body || '[صورة]'; }
        else if (media.mimetype.startsWith('video/')) { mediaType = 'video'; msgType = 'video'; content = msg.body || '[فيديو]'; }
        else if (media.mimetype.startsWith('audio/') || media.mimetype === 'audio/ogg; codecs=opus') {
          mediaType = 'audio'; msgType = 'audio'; content = msg.body || '[رسالة صوتية]';
        }
        else { mediaType = 'file'; msgType = 'file'; content = msg.body || media.filename || '[ملف]'; }
      }
    } catch(e) {
      console.error('[WA-QR] Media download error:', e.message);
      content = msg.body || '[مرفق]';
      msgType = 'file';
    }
  } else if (msg.type === 'location') {
    content = `📍 موقع: ${msg.location?.latitude},${msg.location?.longitude}`;
  } else if (msg.type === 'vcard') {
    content = `👤 جهة اتصال`;
  } else {
    content = msg.body || '[رسالة]';
  }

  const displayContent = content || (mediaType ? `[${mediaType}]` : '[رسالة]');

  // Find or create conversation
  let conv = db.prepare('SELECT * FROM inbox_conversations WHERE platform=? AND sender_id=?').get('whatsapp-qr', senderId);
  if (!conv) {
    const r = db.prepare(`INSERT INTO inbox_conversations (platform, sender_id, sender_name, last_message, last_message_at, unread_count) VALUES (?,?,?,?,datetime('now'),1)`)
      .run('whatsapp-qr', senderId, senderName, displayContent);
    conv = { id: r.lastInsertRowid };
  } else {
    db.prepare(`UPDATE inbox_conversations SET last_message=?, last_message_at=datetime('now'), unread_count=unread_count+1, sender_name=? WHERE id=?`)
      .run(displayContent, senderName, conv.id);
  }

  db.prepare(`INSERT OR IGNORE INTO inbox_messages (conversation_id, platform, direction, content, message_type, platform_msg_id, media_url, media_type) VALUES (?,?,?,?,?,?,?,?)`)
    .run(conv.id, 'whatsapp-qr', 'in', displayContent, msgType, msg.id._serialized, mediaUrl, mediaType);

  db.prepare(`INSERT INTO notifications (title, body, type) VALUES (?,?,?)`)
    .run('💬 واتساب QR — رسالة جديدة', senderName + ': ' + displayContent.substring(0, 80), 'info');
}

/**
 * Auto-restore WA QR sessions on server startup
 * Called from app.js after server starts
 * Restores sessions for all users who have saved session data
 */
async function autoRestoreAllSessions() {
  try {
    const { getTenantDb } = require('./db-tenant');
    const masterDb = require('./db-master');

    // Get all users with wa_qr_active=1 OR who have a saved session directory
    let users = [];
    try {
      users = masterDb.prepare('SELECT id FROM users WHERE status IN (?,?,?)').all('active','trial','admin');
    } catch(e) {
      console.error('[WA-QR] autoRestore: failed to query users:', e.message);
      return;
    }

    for (const user of users) {
      try {
        // Check if session directory exists for this user
        const sessionDir = require('path').join(SESSION_DIR, `session-user_${user.id}`);
        const fs = require('fs');
        if (!fs.existsSync(sessionDir)) continue;

        // Check if wa_qr_active is set in tenant settings
        let shouldRestore = false;
        try {
          const db = getTenantDb(user.id);
          const settings = db.prepare('SELECT wa_qr_active FROM inbox_settings WHERE id=1').get();
          shouldRestore = settings && settings.wa_qr_active;
        } catch(e) { shouldRestore = true; } // if no settings, restore anyway (session dir exists)

        if (!shouldRestore) continue;

        console.log(`[WA-QR] autoRestore: Starting session for user ${user.id}...`);
        // Start with delay to avoid overwhelming the server
        await new Promise(r => setTimeout(r, (users.indexOf(user) * 5000) + 2000));
        startSession(user.id).then(r => {
          console.log(`[WA-QR] autoRestore: user ${user.id} result:`, r.status);
        }).catch(e => {
          console.error(`[WA-QR] autoRestore: user ${user.id} error:`, e.message);
        });
      } catch(e) {
        console.error(`[WA-QR] autoRestore user ${user.id}:`, e.message);
      }
    }
  } catch(e) {
    console.error('[WA-QR] autoRestore failed:', e.message);
  }
}

module.exports = { startSession, getStatus, stopSession, sendMessage, autoRestoreAllSessions };
