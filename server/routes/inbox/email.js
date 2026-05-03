/**
 * Inbox v4 — Email Channel (P8-1)
 * آخر تحديث: 2026-05-03
 *
 * الميزات:
 *   1. SMTP  — إرسال إيميلات صادرة عبر Nodemailer
 *   2. IMAP  — polling استقبال إيميلات واردة (imap-simple)
 *   3. Webhook Inbound — Sendgrid / Mailgun / Postmark
 *
 * كل إيميل وارد → يُحوَّل إلى conversation بـ platform='email'
 * كل رد من الـ inbox → يُرسَل كإيميل عبر SMTP
 *
 * Endpoints:
 *   GET    /email/accounts              — قائمة الحسابات
 *   POST   /email/accounts              — إنشاء حساب جديد
 *   GET    /email/accounts/:id          — تفاصيل حساب
 *   PUT    /email/accounts/:id          — تعديل
 *   DELETE /email/accounts/:id          — حذف
 *   PUT    /email/accounts/:id/toggle   — تفعيل/تعطيل
 *   POST   /email/accounts/:id/test-smtp — اختبار SMTP
 *   POST   /email/accounts/:id/test-imap — اختبار IMAP
 *   POST   /email/accounts/:id/poll     — poll IMAP يدوي
 *   POST   /email/webhook/:token        — inbound webhook (Sendgrid/Mailgun/Postmark) — بدون auth
 *   GET    /email/messages/:convId      — رسائل إيميل المحادثة
 *   POST   /email/messages/:convId/send — إرسال إيميل في المحادثة
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const nodemailer   = require('nodemailer');
const crypto       = require('crypto');

// imap-simple — تُحمَّل بشكل lazy لتجنب crash لو مش موجودة
let imapSimple;
try { imapSimple = require('imap-simple'); } catch (_) {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** رقم عشوائي كـ webhook token */
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** استخراج domain من إيميل */
function emailDomain(email) {
  return (email || '').split('@')[1] || 'unknown';
}

/** بناء اسم contact من إيميل */
function emailToName(email, displayName) {
  if (displayName && displayName.trim()) return displayName.trim();
  return email.split('@')[0].replace(/[._+-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** تنظيف HTML → نص عادي بسيط */
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** إنشاء أو جلب conversation خاص بـ email thread */
function getOrCreateEmailConv(db, tenantId, accountId, opts) {
  const {
    fromEmail, fromName, subject, threadId, messageId
  } = opts;

  // البحث بـ thread أولاً
  if (threadId) {
    const existing = db.prepare(
      `SELECT * FROM inbox_conversations_v4 WHERE tenant_id=? AND email_thread_id=? LIMIT 1`
    ).get(tenantId, threadId);
    if (existing) return { conv: existing, isNew: false };
  }

  // البحث بـ contact (نفس الإيميل) في محادثة مفتوحة
  const byContact = db.prepare(`
    SELECT c.* FROM inbox_conversations_v4 c
    JOIN inbox_contacts_v4 ct ON ct.id = c.contact_id
    WHERE c.tenant_id=? AND c.platform='email' AND ct.phone=? AND c.status='open'
    LIMIT 1
  `).get(tenantId, fromEmail);
  if (byContact) return { conv: byContact, isNew: false };

  // إنشاء contact لو مش موجود
  let contact = db.prepare(
    `SELECT * FROM inbox_contacts_v4 WHERE tenant_id=? AND phone=? LIMIT 1`
  ).get(tenantId, fromEmail);

  if (!contact) {
    const info = db.prepare(`
      INSERT INTO inbox_contacts_v4 (tenant_id, name, phone, platform, created_at)
      VALUES (?, ?, ?, 'email', unixepoch())
    `).run(tenantId, emailToName(fromEmail, fromName), fromEmail);
    contact = { id: info.lastInsertRowid, name: emailToName(fromEmail, fromName), phone: fromEmail };
  }

  // إنشاء conversation جديدة
  const convInfo = db.prepare(`
    INSERT INTO inbox_conversations_v4
      (tenant_id, contact_id, platform, status, email_account_id, email_subject, email_thread_id, created_at, updated_at)
    VALUES (?, ?, 'email', 'open', ?, ?, ?, unixepoch(), unixepoch())
  `).run(tenantId, contact.id, accountId, subject || '(بدون موضوع)', threadId || messageId || null);

  const conv = db.prepare(`SELECT * FROM inbox_conversations_v4 WHERE id=?`).get(convInfo.lastInsertRowid);
  return { conv, isNew: true };
}

/** تسجيل رسالة إيميل في DB */
function saveEmailMessage(db, tenantId, convId, accountId, msgData) {
  const info = db.prepare(`
    INSERT INTO inbox_email_messages_v4
      (tenant_id, conversation_id, account_id, message_id, in_reply_to, references_header,
       direction, from_email, from_name, to_email, subject, body_text, body_html,
       attachments, headers, uid, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
  `).run(
    tenantId, convId, accountId,
    msgData.messageId || null,
    msgData.inReplyTo || null,
    msgData.references || null,
    msgData.direction || 'inbound',
    msgData.fromEmail, msgData.fromName || null,
    msgData.toEmail,
    msgData.subject || null,
    msgData.bodyText || null,
    msgData.bodyHtml || null,
    JSON.stringify(msgData.attachments || []),
    JSON.stringify(msgData.headers || {}),
    msgData.uid || null
  );

  // تحديث updated_at للـ conversation
  db.prepare(`UPDATE inbox_conversations_v4 SET updated_at=unixepoch() WHERE id=?`).run(convId);

  // تسجيل كـ inbox_message_v4 عادي للـ inbox UI
  const bodyForInbox = msgData.bodyText || htmlToText(msgData.bodyHtml) || msgData.subject || '';
  db.prepare(`
    INSERT INTO inbox_messages_v4
      (tenant_id, conversation_id, direction, content_type, content, sender_type,
       platform, is_read, created_at)
    VALUES (?, ?, ?, 'email', ?, ?, 'email', 0, unixepoch())
  `).run(
    tenantId, convId,
    msgData.direction || 'inbound',
    bodyForInbox.slice(0, 5000),
    msgData.direction === 'outbound' ? 'agent' : 'customer'
  );

  return info.lastInsertRowid;
}

// ─── SSE broadcast (lazy) ────────────────────────────────────────────────────
function sseBroadcast(tenantId, event, data) {
  try {
    const { broadcast } = require('./stream');
    broadcast(tenantId, event, data);
  } catch (_) {}
}

// ─── Routes: Email Accounts ──────────────────────────────────────────────────

/** GET /email/accounts — قائمة الحسابات */
router.get('/email/accounts', (req, res) => {
  const tenantId = req.user.id;
  const accounts = req.db.prepare(`
    SELECT id, name, email, smtp_host, smtp_port, smtp_secure, smtp_user,
           imap_enabled, imap_host, imap_port, imap_secure, imap_user, imap_mailbox,
           webhook_enabled, webhook_token, webhook_provider,
           is_active, poll_interval, created_at, updated_at
    FROM inbox_email_accounts_v4
    WHERE tenant_id=?
    ORDER BY created_at DESC
  `).all(tenantId);
  res.json({ accounts });
});

/** POST /email/accounts — إنشاء حساب جديد */
router.post('/email/accounts', (req, res) => {
  const tenantId = req.user.id;
  const {
    name, email,
    smtp_host, smtp_port = 587, smtp_secure = false, smtp_user, smtp_pass,
    imap_enabled = false, imap_host, imap_port = 993, imap_secure = true,
    imap_user, imap_pass, imap_mailbox = 'INBOX',
    webhook_enabled = false, webhook_provider = 'sendgrid',
    poll_interval = 300
  } = req.body;

  if (!name || !email) return res.status(400).json({ error: 'name و email مطلوبان' });

  const webhookToken = generateToken();

  const info = req.db.prepare(`
    INSERT INTO inbox_email_accounts_v4
      (tenant_id, name, email,
       smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
       imap_enabled, imap_host, imap_port, imap_secure, imap_user, imap_pass, imap_mailbox,
       webhook_enabled, webhook_token, webhook_provider,
       is_active, poll_interval)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
  `).run(
    tenantId, name, email,
    smtp_host || null, smtp_port, smtp_secure ? 1 : 0, smtp_user || null, smtp_pass || null,
    imap_enabled ? 1 : 0, imap_host || null, imap_port, imap_secure ? 1 : 0,
    imap_user || null, imap_pass || null, imap_mailbox,
    webhook_enabled ? 1 : 0, webhookToken, webhook_provider,
    poll_interval
  );

  const account = req.db.prepare(`SELECT * FROM inbox_email_accounts_v4 WHERE id=?`).get(info.lastInsertRowid);
  res.json({ account });
});

/** GET /email/accounts/:id — تفاصيل حساب */
router.get('/email/accounts/:id', (req, res) => {
  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
  res.json({ account });
});

/** PUT /email/accounts/:id — تعديل */
router.put('/email/accounts/:id', (req, res) => {
  const tenantId = req.user.id;
  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, tenantId);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  const fields = [
    'name','email',
    'smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass',
    'imap_enabled','imap_host','imap_port','imap_secure','imap_user','imap_pass','imap_mailbox',
    'webhook_enabled','webhook_provider','poll_interval'
  ];

  const updates = [];
  const values  = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f}=?`);
      let val = req.body[f];
      if (f === 'smtp_secure' || f === 'imap_enabled' || f === 'imap_secure' || f === 'webhook_enabled') {
        val = val ? 1 : 0;
      }
      values.push(val);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'لا يوجد بيانات للتعديل' });
  updates.push('updated_at=unixepoch()');
  values.push(req.params.id, tenantId);

  req.db.prepare(
    `UPDATE inbox_email_accounts_v4 SET ${updates.join(',')} WHERE id=? AND tenant_id=?`
  ).run(...values);

  const updated = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=?`
  ).get(req.params.id);
  res.json({ account: updated });
});

/** DELETE /email/accounts/:id — حذف */
router.delete('/email/accounts/:id', (req, res) => {
  const info = req.db.prepare(
    `DELETE FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'الحساب غير موجود' });
  res.json({ ok: true });
});

/** PUT /email/accounts/:id/toggle — تفعيل/تعطيل */
router.put('/email/accounts/:id/toggle', (req, res) => {
  const tenantId = req.user.id;
  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, tenantId);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  const newActive = account.is_active ? 0 : 1;
  req.db.prepare(
    `UPDATE inbox_email_accounts_v4 SET is_active=?, updated_at=unixepoch() WHERE id=?`
  ).run(newActive, req.params.id);

  res.json({ ok: true, is_active: !!newActive });
});

// ─── Test Endpoints ───────────────────────────────────────────────────────────

/** POST /email/accounts/:id/test-smtp — اختبار اتصال SMTP */
router.post('/email/accounts/:id/test-smtp', async (req, res) => {
  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (!account.smtp_host) return res.status(400).json({ error: 'لم يتم ضبط SMTP' });

  try {
    const transport = _createTransport(account);
    await transport.verify();
    res.json({ ok: true, message: '✅ SMTP connection successful' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** POST /email/accounts/:id/test-imap — اختبار اتصال IMAP */
router.post('/email/accounts/:id/test-imap', async (req, res) => {
  if (!imapSimple) return res.status(400).json({ error: 'imap-simple غير مثبت' });

  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (!account.imap_host) return res.status(400).json({ error: 'لم يتم ضبط IMAP' });

  try {
    const config = _buildImapConfig(account);
    const connection = await imapSimple.connect(config);
    await connection.openBox(account.imap_mailbox || 'INBOX');
    connection.end();
    res.json({ ok: true, message: '✅ IMAP connection successful' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** POST /email/accounts/:id/poll — poll يدوي */
router.post('/email/accounts/:id/poll', async (req, res) => {
  const tenantId = req.user.id;
  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=?`
  ).get(req.params.id, tenantId);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (!account.imap_enabled || !account.imap_host) {
    return res.status(400).json({ error: 'IMAP غير مفعّل' });
  }

  try {
    const result = await pollImapAccount(req.db, tenantId, account);
    res.json({ ok: true, fetched: result.fetched, errors: result.errors });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Webhook Inbound (بدون auth — token في الـ URL) ─────────────────────────

/**
 * POST /email/webhook/:token
 * يقبل inbound emails من Sendgrid / Mailgun / Postmark
 * لا يحتاج requireAuth — الـ token هو المصادقة
 */
router.post('/email/webhook/:token', express.json({ limit: '5mb' }), express.urlencoded({ extended: true, limit: '5mb' }), async (req, res) => {
  const { token } = req.params;

  // البحث عن الحساب بالـ token — في كل الـ tenants
  const { getTenantDb } = require('../../db-tenant');
  const { getMasterDb }  = require('../../db-master') || {};

  // نحتاج نعرف الـ tenant من الـ token — بنبحث في كل DBs
  // نستخدم الـ master DB للحصول على قائمة التيننتس
  let tenantId, account, db;
  try {
    const masterDb = require('../../db-master');
    const tenants = masterDb.prepare('SELECT id FROM users').all();
    for (const t of tenants) {
      const tdb = getTenantDb(t.id);
      const acc = tdb.prepare(
        `SELECT * FROM inbox_email_accounts_v4 WHERE webhook_token=? AND webhook_enabled=1 AND is_active=1 LIMIT 1`
      ).get(token);
      if (acc) {
        tenantId = t.id;
        account  = acc;
        db       = tdb;
        break;
      }
    }
  } catch (e) {
    return res.status(500).json({ error: 'DB error' });
  }

  if (!account) return res.status(404).json({ error: 'Invalid token' });

  try {
    const parsed = _parseWebhookPayload(account.webhook_provider, req.body);
    if (!parsed) return res.status(400).json({ error: 'Cannot parse payload' });

    const threadId = _extractThreadId(parsed.references, parsed.inReplyTo, parsed.messageId);
    const { conv, isNew } = getOrCreateEmailConv(db, tenantId, account.id, {
      fromEmail: parsed.fromEmail,
      fromName : parsed.fromName,
      subject  : parsed.subject,
      threadId,
      messageId: parsed.messageId
    });

    saveEmailMessage(db, tenantId, conv.id, account.id, {
      ...parsed,
      direction: 'inbound'
    });

    // SSE لتحديث الـ inbox فوراً
    sseBroadcast(tenantId, 'new_message', {
      conversation_id: conv.id,
      platform       : 'email',
      isNew
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Email Webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Email Messages ───────────────────────────────────────────────────────────

/** GET /email/messages/:convId — رسائل الإيميل في المحادثة */
router.get('/email/messages/:convId', (req, res) => {
  const tenantId = req.user.id;
  const conv = req.db.prepare(
    `SELECT * FROM inbox_conversations_v4 WHERE id=? AND tenant_id=? AND platform='email'`
  ).get(req.params.convId, tenantId);
  if (!conv) return res.status(404).json({ error: 'محادثة غير موجودة أو ليست email' });

  const messages = req.db.prepare(`
    SELECT em.*, ea.name as account_name, ea.email as account_email
    FROM inbox_email_messages_v4 em
    LEFT JOIN inbox_email_accounts_v4 ea ON ea.id = em.account_id
    WHERE em.conversation_id=? AND em.tenant_id=?
    ORDER BY em.created_at ASC
  `).all(req.params.convId, tenantId);

  res.json({ messages });
});

/** POST /email/messages/:convId/send — إرسال إيميل في المحادثة */
router.post('/email/messages/:convId/send', async (req, res) => {
  const tenantId = req.user.id;
  const conv = req.db.prepare(
    `SELECT c.*, ct.phone as contact_email, ct.name as contact_name
     FROM inbox_conversations_v4 c
     JOIN inbox_contacts_v4 ct ON ct.id = c.contact_id
     WHERE c.id=? AND c.tenant_id=? AND c.platform='email'`
  ).get(req.params.convId, tenantId);
  if (!conv) return res.status(404).json({ error: 'محادثة غير موجودة' });

  const { subject, body_text, body_html, in_reply_to } = req.body;
  if (!body_text && !body_html) return res.status(400).json({ error: 'body مطلوب' });

  // الحساب المرتبط بالمحادثة
  const accountId = conv.email_account_id;
  if (!accountId) return res.status(400).json({ error: 'لا يوجد حساب إيميل مرتبط بهذه المحادثة' });

  const account = req.db.prepare(
    `SELECT * FROM inbox_email_accounts_v4 WHERE id=? AND tenant_id=? AND is_active=1`
  ).get(accountId, tenantId);
  if (!account) return res.status(400).json({ error: 'الحساب غير موجود أو معطل' });
  if (!account.smtp_host) return res.status(400).json({ error: 'لم يتم ضبط SMTP للحساب' });

  const toEmail = conv.contact_email;
  const finalSubject = subject || conv.email_subject || '(بدون موضوع)';
  const messageId    = `<${crypto.randomBytes(12).toString('hex')}@${emailDomain(account.email)}>`;

  try {
    const transport = _createTransport(account);
    const mailOpts = {
      from       : `"${account.name}" <${account.email}>`,
      to         : toEmail,
      subject    : finalSubject,
      text       : body_text || htmlToText(body_html),
      html       : body_html || undefined,
      messageId,
      inReplyTo  : in_reply_to || conv.email_thread_id || undefined,
      references : in_reply_to || conv.email_thread_id || undefined
    };

    await transport.sendMail(mailOpts);

    // تحديث thread_id لو أول رسالة
    if (!conv.email_thread_id) {
      req.db.prepare(
        `UPDATE inbox_conversations_v4 SET email_thread_id=? WHERE id=?`
      ).run(messageId, conv.id);
    }

    // حفظ الرسالة
    saveEmailMessage(req.db, tenantId, conv.id, accountId, {
      messageId,
      inReplyTo  : mailOpts.inReplyTo || null,
      direction  : 'outbound',
      fromEmail  : account.email,
      fromName   : account.name,
      toEmail,
      subject    : finalSubject,
      bodyText   : body_text || htmlToText(body_html),
      bodyHtml   : body_html || null
    });

    // SSE
    sseBroadcast(tenantId, 'message_sent', {
      conversation_id: conv.id,
      platform       : 'email'
    });

    res.json({ ok: true, messageId });
  } catch (err) {
    console.error('[Email Send]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── SMTP Helper ─────────────────────────────────────────────────────────────

function _createTransport(account) {
  return nodemailer.createTransport({
    host  : account.smtp_host,
    port  : account.smtp_port || 587,
    secure: !!account.smtp_secure, // true = TLS مباشر (465)، false = STARTTLS
    auth  : account.smtp_user ? {
      user: account.smtp_user,
      pass: account.smtp_pass
    } : undefined,
    tls: { rejectUnauthorized: false } // للـ self-signed certs
  });
}

// ─── IMAP Helper ─────────────────────────────────────────────────────────────

function _buildImapConfig(account) {
  return {
    imap: {
      user     : account.imap_user,
      password : account.imap_pass,
      host     : account.imap_host,
      port     : account.imap_port || 993,
      tls      : !!account.imap_secure,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000
    }
  };
}

/**
 * pollImapAccount — يستقبل الإيميلات الجديدة من IMAP
 * @returns {{ fetched: number, errors: string[] }}
 */
async function pollImapAccount(db, tenantId, account) {
  if (!imapSimple) throw new Error('imap-simple غير مثبت');

  const config     = _buildImapConfig(account);
  const connection = await imapSimple.connect(config);
  await connection.openBox(account.imap_mailbox || 'INBOX');

  // جلب الرسائل الجديدة (UID > imap_last_uid)
  const lastUid = account.imap_last_uid || 0;
  const searchCriteria = lastUid > 0 ? [['UID', `${lastUid + 1}:*`]] : ['UNSEEN'];

  const fetchOpts = {
    bodies : ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)', 'TEXT', ''],
    struct : true,
    markSeen: false
  };

  const messages = await connection.search(searchCriteria, fetchOpts);
  connection.end();

  let fetched = 0;
  const errors = [];
  let maxUid = lastUid;

  for (const msg of messages) {
    try {
      const uid = msg.attributes.uid;
      if (uid) maxUid = Math.max(maxUid, uid);

      // استخراج الـ headers
      const headerPart = msg.parts.find(p => p.which.startsWith('HEADER'));
      const headers    = headerPart ? imapSimple.getParts(msg.attributes.struct) && _parseHeaders(headerPart.body) : {};

      // استخراج الـ body
      const textPart = msg.parts.find(p => p.which === 'TEXT');
      const bodyRaw  = textPart ? textPart.body : '';

      const fromRaw  = headers.from || '';
      const { email: fromEmail, name: fromName } = _parseEmailAddress(fromRaw);
      const subject  = (Array.isArray(headers.subject) ? headers.subject[0] : headers.subject) || '';
      const msgId    = (Array.isArray(headers['message-id']) ? headers['message-id'][0] : headers['message-id']) || '';
      const inReplyTo = (Array.isArray(headers['in-reply-to']) ? headers['in-reply-to'][0] : headers['in-reply-to']) || '';
      const refs      = (Array.isArray(headers.references) ? headers.references[0] : headers.references) || '';
      const toRaw    = headers.to || '';
      const { email: toEmail } = _parseEmailAddress(toRaw);

      // التحقق من عدم التكرار
      if (msgId) {
        const exists = db.prepare(
          `SELECT id FROM inbox_email_messages_v4 WHERE message_id=? AND tenant_id=? LIMIT 1`
        ).get(msgId.trim(), tenantId);
        if (exists) continue;
      }

      const threadId = _extractThreadId(refs, inReplyTo, msgId);
      const { conv, isNew } = getOrCreateEmailConv(db, tenantId, account.id, {
        fromEmail, fromName,
        subject: subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim(),
        threadId,
        messageId: msgId.trim()
      });

      saveEmailMessage(db, tenantId, conv.id, account.id, {
        messageId  : msgId.trim() || null,
        inReplyTo  : inReplyTo.trim() || null,
        references : refs.trim() || null,
        direction  : 'inbound',
        fromEmail, fromName,
        toEmail    : toEmail || account.email,
        subject,
        bodyText   : bodyRaw.slice(0, 10000),
        uid
      });

      sseBroadcast(tenantId, 'new_message', { conversation_id: conv.id, platform: 'email', isNew });
      fetched++;
    } catch (e) {
      errors.push(e.message);
    }
  }

  // تحديث آخر UID
  if (maxUid > lastUid) {
    db.prepare(
      `UPDATE inbox_email_accounts_v4 SET imap_last_uid=? WHERE id=?`
    ).run(maxUid, account.id);
  }

  return { fetched, errors };
}

// ─── Parse Helpers ────────────────────────────────────────────────────────────

/** تحليل headers الـ IMAP */
function _parseHeaders(raw) {
  if (!raw || typeof raw !== 'object') return {};
  // imap-simple يُعيد الـ headers كـ object بالفعل
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    result[k.toLowerCase()] = v;
  }
  return result;
}

/** استخراج إيميل واسم من "Name <email>" */
function _parseEmailAddress(raw) {
  if (!raw) return { email: '', name: '' };
  const match = raw.match(/^(.+?)\s*<([^>]+)>/);
  if (match) return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2].trim().toLowerCase() };
  const emailMatch = raw.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
  return { email: emailMatch ? emailMatch[0].toLowerCase() : raw.trim().toLowerCase(), name: '' };
}

/** استخراج thread ID من headers */
function _extractThreadId(references, inReplyTo, messageId) {
  // الـ thread ID = أول message-id في سلسلة الـ references
  if (references) {
    const first = references.trim().split(/\s+/)[0];
    if (first && first.includes('@')) return first.replace(/^<|>$/g, '');
  }
  if (inReplyTo) return inReplyTo.trim().replace(/^<|>$/g, '');
  if (messageId) return messageId.trim().replace(/^<|>$/g, '');
  return null;
}

/** تحليل webhook payload حسب المزود */
function _parseWebhookPayload(provider, body) {
  try {
    switch (provider) {
      case 'sendgrid': {
        // Sendgrid Inbound Parse Webhook
        const from    = body.from || '';
        const { email: fromEmail, name: fromName } = _parseEmailAddress(from);
        return {
          fromEmail, fromName,
          toEmail    : body.to || '',
          subject    : body.subject || '',
          bodyText   : body.text || '',
          bodyHtml   : body.html || '',
          messageId  : body['message-id'] || body.headers?.match(/Message-ID:\s*<([^>]+)>/i)?.[1] || '',
          inReplyTo  : body['in-reply-to'] || '',
          references : body.references || '',
          headers    : { raw: body.headers || '' },
          attachments: _parseSendgridAttachments(body)
        };
      }

      case 'mailgun': {
        // Mailgun Inbound Routes
        const { email: fromEmail, name: fromName } = _parseEmailAddress(body.sender || body.from || '');
        return {
          fromEmail, fromName,
          toEmail    : body.recipient || body.To || '',
          subject    : body.subject || body.Subject || '',
          bodyText   : body['body-plain'] || body.stripped_text || '',
          bodyHtml   : body['body-html'] || body.stripped_html || '',
          messageId  : body['Message-Id'] || '',
          inReplyTo  : body['In-Reply-To'] || '',
          references : body.References || '',
          headers    : {},
          attachments: []
        };
      }

      case 'postmark': {
        // Postmark Inbound Webhook
        const { email: fromEmail, name: fromName } = _parseEmailAddress(body.From || '');
        return {
          fromEmail, fromName,
          toEmail    : body.To || '',
          subject    : body.Subject || '',
          bodyText   : body.TextBody || '',
          bodyHtml   : body.HtmlBody || '',
          messageId  : body.MessageID || '',
          inReplyTo  : body.Headers?.find(h => h.Name === 'In-Reply-To')?.Value || '',
          references : body.Headers?.find(h => h.Name === 'References')?.Value || '',
          headers    : {},
          attachments: (body.Attachments || []).map(a => ({
            name       : a.Name,
            contentType: a.ContentType,
            size       : a.ContentLength
          }))
        };
      }

      default:
        return null;
    }
  } catch (e) {
    console.error('[Email Webhook Parse]', e.message);
    return null;
  }
}

/** استخراج مرفقات Sendgrid */
function _parseSendgridAttachments(body) {
  const count = parseInt(body.attachments || '0', 10);
  const result = [];
  for (let i = 1; i <= count; i++) {
    const name = body[`attachment-info`] ? JSON.parse(body['attachment-info'])[`attachment${i}`]?.filename : `attachment${i}`;
    result.push({ name: name || `attachment${i}` });
  }
  return result;
}

// ─── IMAP Polling Job ─────────────────────────────────────────────────────────

/**
 * runEmailPolling — يُشغَّل دورياً من الـ cron أو app startup
 * يجلب الإيميلات الجديدة لكل حساب IMAP مفعّل
 */
async function runEmailPolling(db, tenantId) {
  const accounts = db.prepare(`
    SELECT * FROM inbox_email_accounts_v4
    WHERE tenant_id=? AND imap_enabled=1 AND is_active=1
    AND imap_host IS NOT NULL
  `).all(tenantId);

  let total = 0;
  for (const account of accounts) {
    try {
      const { fetched } = await pollImapAccount(db, tenantId, account);
      total += fetched;
    } catch (e) {
      console.error(`[IMAP Poll] account ${account.id}:`, e.message);
    }
  }
  return total;
}

module.exports              = router;
module.exports.runEmailPolling = runEmailPolling;
module.exports.pollImapAccount = pollImapAccount;
