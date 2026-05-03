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

  sessions[userId] = { status: 'loading', qrDataUrl: null, phone: null, client: null, reconnectAttempts: 0 };

  // اكتشاف Chrome: نجرب puppeteer أولاً ثم system chromium
  const CHROME_PATH = (() => {
    try {
      const p  = require('puppeteer');
      const ep = p.executablePath();
      if (require('fs').existsSync(ep)) return ep;
    } catch(_) {}
    // الـ snap chromium binary المباشر
    const snapBin = '/snap/chromium/current/usr/lib/chromium-browser/chrome';
    if (require('fs').existsSync(snapBin)) return snapBin;
    return '/usr/bin/chromium-browser';
  })();

  // متغيرات بيئة لحل مشكلة المكتبات الناقصة في puppeteer chrome
  const chromeEnv = {
    ...process.env,
    LD_LIBRARY_PATH: [
      '/usr/lib/x86_64-linux-gnu',
      '/usr/lib',
      '/lib/x86_64-linux-gnu',
      process.env.LD_LIBRARY_PATH,
    ].filter(Boolean).join(':'),
    DISPLAY: process.env.DISPLAY || '',
  };

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `user_${userId}`, dataPath: SESSION_DIR }),
    takeoverOnConflict: true,
    takeoverTimeoutMs: 5000,
    puppeteer: {
      headless: true,
      executablePath: CHROME_PATH,
      env: chromeEnv,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        // ملاحظة: --single-process يسبّب SIGTRAP crash في بعض بيئات VPS — محذوف
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=512',
        '--window-size=1280,800',
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
    sessions[userId].reconnectAttempts = 0; // reset on success
    console.log(`[WA-QR] User ${userId}: Connected as ${phone}`);

    // لا keepalive — طلب getState() المتكرر يرفع خطر البان من واتساب
    // الـ whatsapp-web.js بيحكي الـ disconnected تلقائياً عند الانقطاع
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

  client.on('disconnected', async (reason) => {
    console.log(`[WA-QR] User ${userId}: Disconnected — ${reason}`);

    // LOGOUT = المستخدم ربط الجهاز من الهاتف يدوياً — لا نعيد المحاولة أبداً
    if (reason === 'LOGOUT') {
      if (sessions[userId]) sessions[userId].status = 'disconnected';
      return;
    }

    const attempts = (sessions[userId]?.reconnectAttempts || 0) + 1;
    // محاولة واحدة فقط بعد وقت كاف (60ث) لتجنب ضغط متكرر على واتساب
    const MAX_ATTEMPTS = 1;

    if (attempts > MAX_ATTEMPTS) {
      console.log(`[WA-QR] User ${userId}: Disconnected (${reason}) — not retrying to protect account`);
      if (sessions[userId]) sessions[userId].status = 'disconnected';
      return;
    }

    const delayMs = 60_000; // 60 ثانية قبل إعادة المحاولة
    console.log(`[WA-QR] User ${userId}: Reconnecting in 60s (reason: ${reason})...`);
    if (sessions[userId]) {
      sessions[userId].status = 'loading';
      sessions[userId].reconnectAttempts = attempts;
    }

    setTimeout(async () => {
      if (!sessions[userId] || sessions[userId].status === 'connected') return;
      try {
        try { await client.destroy(); } catch(_) {}
        await startSession(userId);
      } catch(e) {
        console.error(`[WA-QR] User ${userId}: Reconnect error:`, e.message);
        if (sessions[userId]) sessions[userId].status = 'disconnected';
      }
    }, delayMs);
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
  // وقف الـ keepalive أولاً
  s.reconnectAttempts = 99; // منع أي reconnect عند stop
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

  // استخراج رقم الهاتف من JID
  // JID formats: 201012345678@c.us | 111527868792933@lid | 201012345678@s.whatsapp.net
  const jidNumber = senderId.split('@')[0]; // رقم فقط بدون لاحقة
  const isLid     = senderId.includes('@lid'); // LID = device-linked id (not a real phone number)

  // الاسم: notifyName (اسم الواتساب الحقيقي) > pushName > رقم الهاتف > JID
  const rawName    = msg._data?.notifyName || msg._data?.pushName || msg.author || null;
  const phoneLabel = isLid ? null : `+${jidNumber}`; // @lid ما عندهوش رقم حقيقي
  const senderName = rawName || phoneLabel || jidNumber;

  // Detect message type and content
  let msgType = 'text';
  // msg.body في whatsapp-web.js بيكون undefined للستيكرز وبعض أنواع الرسائل
  // نجرب خيارات أكثر قبل الاستسلام للميديا
  let content = msg.body
    || msg._data?.body
    || msg._data?.caption
    || '';
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
  } else if (msg.type === 'vcard' || msg.type === 'multi_vcard') {
    content = `👤 جهة اتصال`;
  } else if (msg.type === 'sticker') {
    // stickers تُعامَل كصور
    msgType = 'image';
    content = '🎭 ملصق';
  } else if (msg.type === 'reaction') {
    content = msg._data?.reactionText || '❤️';
  } else {
    // أي نوع آخر — نحاول نجيب النص من كل المصادر
    content = msg.body || msg._data?.body || msg._data?.caption || msg._data?.text || `[${msg.type || 'رسالة'}]`;
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
// ── health check: تأكد أن Chrome يعمل قبل autoRestore ───────────────────────────
async function checkChromeHealth() {
  const LIB_PATH = '/usr/lib/x86_64-linux-gnu:/usr/lib:/lib/x86_64-linux-gnu';
  const env = { ...process.env, LD_LIBRARY_PATH: LIB_PATH };

  // المسارات بالأولوية: puppeteer chrome أولاً لأنه binary حقيقي
  const chromePaths = [];
  try { const ep = require('puppeteer').executablePath(); if (require('fs').existsSync(ep)) chromePaths.push(ep); } catch(_) {}
  // snap binary الحقيقي (ليس wrapper)
  const snapBin = '/snap/chromium/current/usr/lib/chromium-browser/chrome';
  if (require('fs').existsSync(snapBin)) chromePaths.push(snapBin);

  if (!chromePaths.length) {
    console.error('[WA-QR] ❌ لم يتم العثور على Chrome binary');
    return false;
  }

  const { spawnSync } = require('child_process');
  for (const p of chromePaths) {
    const r = spawnSync(p,
      ['--headless', '--no-sandbox', '--no-zygote', '--disable-gpu', '--dump-dom', 'about:blank'],
      { timeout: 20000, env, encoding: 'utf8' }
    );
    if (r.stdout && r.stdout.includes('<html>')) {
      console.log(`[WA-QR] ✅ Chrome health check OK: ${p}`);
      return true;
    }
    console.warn(`[WA-QR] ⚠️ Chrome health check failed (${p}): exit ${r.status}`);
  }
  return false;
}

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

    // تحقق من Chrome قبل بدء الاستعادة
    const chromeOk = await checkChromeHealth();
    if (!chromeOk) {
      console.error('[WA-QR] autoRestore: Chrome غير جاهز — تم إيقاف autoRestore');
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

module.exports = { startSession, getStatus, stopSession, sendMessage, autoRestoreAllSessions, checkChromeHealth };
