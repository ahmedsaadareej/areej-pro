/**
 * stream.js — SSE endpoint لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * GET  /api/inbox/stream               → text/event-stream
 * POST /api/inbox/stream/viewing        → إشعار بدء مشاهدة محادثة (Collision Detection)
 * DELETE /api/inbox/stream/viewing/:id  → إشعار إنهاء مشاهدة محادثة
 *
 * الـ client يستقبل:
 *   event: connected         — تأكيد الاتصال
 *   event: conv:new          — محادثة جديدة
 *   event: conv:update       — تحديث محادثة (status/assign/label/snooze...)
 *   event: conv:removed      — محادثة حُذفت أو خرجت من الفلتر الحالي
 *   event: message:new       — رسالة جديدة (data يحتوي conversation_id)
 *   event: counts:update     — تحديث العدادات
 *   event: agent:status      — تغيير حالة موظف
 *   event: conv:viewing      — موظف آخر فتح هذه المحادثة (Collision)
 *   event: conv:viewing:stop — موظف آخر أغلق المحادثة (نهاية Collision)
 *   event: ping              — keepalive كل 25 ثانية
 */

const express = require('express');
const router = express.Router();

// ─── SSE Manager ────────────────────────────────────────────────────────
// Map: userId → Set<{ res, tenantId }>
const _clients = new Map();

// ─── Collision Tracker ───────────────────────────────────────────────────
// Map: tenantId → Map<convId → Map<userId → agentName>>
// يتتبع من يشاهد أي محادثة الآن في كل tenant
const _viewing = new Map();

/**
 * تسجيل بدء مشاهدة موظف لمحادثة
 * @param {number} tenantId
 * @param {number} convId
 * @param {number} userId
 * @param {string} agentName
 */
function _registerViewing(tenantId, convId, userId, agentName) {
  if (!_viewing.has(tenantId)) _viewing.set(tenantId, new Map());
  const tenantMap = _viewing.get(tenantId);
  if (!tenantMap.has(convId)) tenantMap.set(convId, new Map());
  tenantMap.get(convId).set(userId, agentName);
}

/**
 * إلغاء تسجيل مشاهدة موظف لمحادثة
 * @param {number} tenantId
 * @param {number} convId
 * @param {number} userId
 */
function _unregisterViewing(tenantId, convId, userId) {
  const tenantMap = _viewing.get(tenantId);
  if (!tenantMap) return;
  const convMap = tenantMap.get(convId);
  if (!convMap) return;
  convMap.delete(userId);
  if (convMap.size === 0) tenantMap.delete(convId);
}

/**
 * جلب قائمة الموظفين الذين يشاهدون محادثة معينة (بدون المستخدم الحالي)
 * @param {number} tenantId
 * @param {number} convId
 * @param {number} excludeUserId
 * @returns {Array<{ id, name }>}
 */
function _getViewers(tenantId, convId, excludeUserId) {
  const tenantMap = _viewing.get(tenantId);
  if (!tenantMap) return [];
  const convMap = tenantMap.get(convId);
  if (!convMap) return [];
  const result = [];
  convMap.forEach((name, uid) => {
    if (uid !== excludeUserId) result.push({ id: uid, name });
  });
  return result;
}

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

// ─── Collision Detection Routes ─────────────────────────────────────────

/**
 * POST /api/inbox/stream/viewing
 * Body: { conv_id: number }
 * يُسجّل أن المستخدم الحالي فتح هذه المحادثة ويُبلّغ باقي الموظفين
 */
router.post('/stream/viewing', (req, res) => {
  const userId   = req.user.id;
  const tenantId = req.user.id;
  const agentName = req.user.name || req.user.email || `موظف #${userId}`;
  const convId   = parseInt(req.body.conv_id, 10);

  if (!convId) return res.status(400).json({ error: 'conv_id مطلوب' });

  // سجّل المشاهدة
  _registerViewing(tenantId, convId, userId, agentName);

  // أرسل لباقي الموظفين في نفس الـ tenant (بدون المرسل)
  _clients.forEach((clientSet, uid) => {
    if (uid === userId) return; // تجاهل المرسل نفسه
    clientSet.forEach(client => {
      if (client.tenantId === tenantId) {
        _send(client.res, 'conv:viewing', {
          conv_id:    convId,
          agent_id:   userId,
          agent_name: agentName,
        });
      }
    });
  });

  // ارجع قائمة من يشاهدون هذه المحادثة الآن (بدون المستخدم الحالي)
  const viewers = _getViewers(tenantId, convId, userId);
  res.json({ ok: true, viewers });
});

/**
 * DELETE /api/inbox/stream/viewing/:convId
 * يُلغي تسجيل مشاهدة المستخدم ويُبلّغ الباقين
 */
router.delete('/stream/viewing/:convId', (req, res) => {
  const userId   = req.user.id;
  const tenantId = req.user.id;
  const convId   = parseInt(req.params.convId, 10);

  if (!convId) return res.status(400).json({ error: 'convId مطلوب' });

  // ألغِ التسجيل
  _unregisterViewing(tenantId, convId, userId);

  // أبلغ باقي الموظفين
  _clients.forEach((clientSet, uid) => {
    if (uid === userId) return;
    clientSet.forEach(client => {
      if (client.tenantId === tenantId) {
        _send(client.res, 'conv:viewing:stop', {
          conv_id:  convId,
          agent_id: userId,
        });
      }
    });
  });

  res.json({ ok: true });
});

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
    // تنظيف Collision Tracker — ألغِ كل مشاهدات هذا الموظف
    _cleanupViewingForUser(tenantId, userId);
  });

  req.on('error', () => {
    clearInterval(pingTimer);
    _removeClient(userId, client);
    _cleanupViewingForUser(tenantId, userId);
  });
});

/**
 * تنظيف كل مشاهدات موظف عند قطع الاتصال
 * يُبلّغ بقية الموظفين بإنهاء الـ collision
 * @param {number} tenantId
 * @param {number} userId
 */
function _cleanupViewingForUser(tenantId, userId) {
  const tenantMap = _viewing.get(tenantId);
  if (!tenantMap) return;
  tenantMap.forEach((convMap, convId) => {
    if (!convMap.has(userId)) return;
    convMap.delete(userId);
    if (convMap.size === 0) tenantMap.delete(convId);
    // أبلغ باقي الموظفين
    _clients.forEach((clientSet, uid) => {
      if (uid === userId) return;
      clientSet.forEach(client => {
        if (client.tenantId === tenantId) {
          _send(client.res, 'conv:viewing:stop', {
            conv_id:  convId,
            agent_id: userId,
          });
        }
      });
    });
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  router,
  broadcast,
  sendToUser,
  connectionCount,
  getViewers:         _getViewers,
  registerViewing:    _registerViewing,
  unregisterViewing:  _unregisterViewing,
};
