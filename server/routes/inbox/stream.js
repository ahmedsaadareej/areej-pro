/**
 * stream.js — SSE endpoint لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * GET /api/inbox/stream  → text/event-stream
 *
 * الـ client يستقبل:
 *   event: connected       — تأكيد الاتصال
 *   event: conv:new        — محادثة جديدة
 *   event: conv:update     — تحديث محادثة (status/assign/label/snooze...)
 *   event: conv:removed    — محادثة حُذفت أو خرجت من الفلتر الحالي
 *   event: message:new     — رسالة جديدة (data يحتوي conversation_id)
 *   event: counts:update   — تحديث العدادات
 *   event: agent:status    — تغيير حالة موظف
 *   event: ping            — keepalive كل 25 ثانية
 */

const express = require('express');
const router = express.Router();

// ─── SSE Manager ────────────────────────────────────────────────────────
// Map: userId → Set<{ res, tenantId }>
const _clients = new Map();

/**
 * إضافة client جديد
 */
function _addClient(userId, tenantId, res) {
  if (!_clients.has(userId)) _clients.set(userId, new Set());
  const client = { res, tenantId };
  _clients.get(userId).add(client);
  return client;
}

/**
 * إزالة client
 */
function _removeClient(userId, client) {
  const set = _clients.get(userId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) _clients.delete(userId);
}

/**
 * إرسال event لـ client واحد
 */
function _send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    // الـ client أغلق الاتصال — سيتم تنظيفه عبر close/error events
  }
}

// ─── Public: إرسال event لـ tenant معين (يُستدعى من routes أخرى) ─────────

/**
 * إرسال event لكل clients في tenant معين
 * @param {number} tenantId
 * @param {string} event
 * @param {Object} data
 */
function broadcast(tenantId, event, data) {
  _clients.forEach((clientSet, userId) => {
    clientSet.forEach(client => {
      if (client.tenantId === tenantId) {
        _send(client.res, event, data);
      }
    });
  });
}

/**
 * إرسال event لموظف معين فقط
 * @param {number} userId
 * @param {string} event
 * @param {Object} data
 */
function sendToUser(userId, event, data) {
  const clientSet = _clients.get(userId);
  if (!clientSet) return;
  clientSet.forEach(client => _send(client.res, event, data));
}

/**
 * عدد الـ connections الحالية (للـ monitoring)
 */
function connectionCount() {
  let count = 0;
  _clients.forEach(set => { count += set.size; });
  return count;
}

// ─── SSE Route ───────────────────────────────────────────────────────────

router.get('/stream', (req, res) => {
  // ─── Headers ───
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // لـ Nginx/Caddy
  res.flushHeaders();

  const userId   = req.user.id;
  const tenantId = req.user.id; // في multi-tenant: كل user = tenant منفصل

  const client = _addClient(userId, tenantId, res);

  // ─── أرسل تأكيد الاتصال ───
  _send(res, 'connected', {
    userId,
    time: Date.now(),
    msg: 'SSE connected',
  });

  // ─── Keepalive ping كل 25 ثانية ───
  // (Nginx/Caddy بيقطع الاتصال بعد 60 ثانية من الـ silence)
  const pingTimer = setInterval(() => {
    try {
      res.write(': ping\n\n'); // comment في SSE — لا يُطلق event في الـ client
    } catch (e) {
      clearInterval(pingTimer);
    }
  }, 25000);

  // ─── تنظيف عند إغلاق الاتصال ───
  req.on('close', () => {
    clearInterval(pingTimer);
    _removeClient(userId, client);
  });

  req.on('error', () => {
    clearInterval(pingTimer);
    _removeClient(userId, client);
  });
});

// ─── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  router,
  broadcast,
  sendToUser,
  connectionCount,
};
