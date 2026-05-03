/**
 * inbox/conversations.js — Conversations Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * Endpoints:
 *   GET    /api/inbox/conversations           — قائمة محادثات مع فلاتر + pagination
 *   GET    /api/inbox/conversations/:id       — محادثة واحدة
 *   PUT    /api/inbox/conversations/:id/status   — تغيير الحالة
 *   PUT    /api/inbox/conversations/:id/assign   — تعيين موظف
 *   PUT    /api/inbox/conversations/:id/snooze   — تأجيل
 *   PUT    /api/inbox/conversations/:id/priority — تغيير الأولوية
 *   PUT    /api/inbox/conversations/:id/contact  — ربط جهة اتصال
 *   POST   /api/inbox/conversations/bulk         — bulk actions
 *   GET    /api/inbox/counts                     — عدادات المجلدات
 *   POST   /api/inbox/mark-all-read              — تعليم الكل مقروء
 *   GET    /api/inbox/conversations/:id/messages — رسائل محادثة
 *   POST   /api/inbox/conversations/:id/read     — تعليم محادثة مقروءة
 *   GET    /api/inbox/labels                     — قائمة الـ labels
 *   POST   /api/inbox/labels                     — إنشاء label
 *   DELETE /api/inbox/labels/:labelId            — حذف label
 *   POST   /api/inbox/conversations/:id/labels   — إضافة label لمحادثة
 *   DELETE /api/inbox/conversations/:id/labels/:labelId — إزالة label
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * بناء شرط الصلاحية بناءً على role الموظف
 * Owner/Admin: يشوف الكل
 * موظف عادي: يشوف المعيّنة له + غير المعيّنة
 *
 * @param {Object} user - req.user
 * @returns {{ clause: string, params: Array }}
 */
function _scopeClause(user) {
  if (user.role === 'owner' || user.role === 'admin') {
    return { clause: '', params: [] };
  }
  return {
    clause: 'AND (c.assigned_to_id IS NULL OR c.assigned_to_id = ?)',
    params: [user.id],
  };
}

/**
 * بناء query المحادثات
 */
function _buildConvQuery(db, user, filters, page, limit) {
  const {
    status, platform, label_id, assigned_filter,
    search, priority,
  } = filters;

  const { clause: scopeClause, params: scopeParams } = _scopeClause(user);

  const conditions = [];
  const qParams    = [];
  const joinParams = [];

  // فلتر label → JOIN
  let labelJoin = '';
  if (label_id) {
    labelJoin = 'JOIN inbox_conversation_labels cl ON cl.conversation_id = c.id AND cl.label_id = ?';
    joinParams.push(parseInt(label_id));
  }

  if (status && status !== 'all') {
    conditions.push('c.status = ?');
    qParams.push(status);
  }
  if (platform) {
    conditions.push('c.platform = ?');
    qParams.push(platform);
  }
  if (priority) {
    conditions.push('c.priority = ?');
    qParams.push(priority);
  }

  // assigned_filter: لـ owner/admin فقط
  if ((user.role === 'owner' || user.role === 'admin') && assigned_filter) {
    if (assigned_filter === 'mine') {
      conditions.push('c.assigned_to_id = ?');
      qParams.push(user.id);
    } else if (assigned_filter === 'unassigned') {
      conditions.push('(c.assigned_to_id IS NULL OR c.assigned_to_id = 0)');
    }
  }

  if (search) {
    const like = '%' + search + '%';
    conditions.push('(c.sender_name LIKE ? OR c.last_message_text LIKE ? OR c.sender_phone LIKE ?)');
    qParams.push(like, like, like);
  }

  const whereStr = conditions.length
    ? 'WHERE ' + conditions.join(' AND ') + ' ' + scopeClause
    : scopeClause ? 'WHERE 1=1 ' + scopeClause : '';

  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      c.*,
      tu.name  AS agent_name,
      (
        SELECT json_group_array(json_object(
          'id', l.id, 'name', l.name, 'color', l.color
        ))
        FROM inbox_conversation_labels icl
        JOIN inbox_labels l ON l.id = icl.label_id
        WHERE icl.conversation_id = c.id
      ) AS labels_json
    FROM inbox_conversations_v4 c
    ${labelJoin}
    LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
    ${whereStr}
    ORDER BY c.last_message_at DESC
    LIMIT ? OFFSET ?
  `;

  const allParams = [...joinParams, ...qParams, ...scopeParams, limit, offset];
  const rows = db.prepare(sql).all(...allParams);

  // parse labels_json
  rows.forEach(row => {
    try {
      row.labels = row.labels_json ? JSON.parse(row.labels_json) : [];
    } catch { row.labels = []; }
    delete row.labels_json;
  });

  // count
  const countSql = `
    SELECT COUNT(*) as total
    FROM inbox_conversations_v4 c
    ${labelJoin}
    ${whereStr}
  `;
  const countParams = [...joinParams, ...qParams, ...scopeParams];
  const { total } = db.prepare(countSql).get(...countParams);

  return { rows, total };
}

// ─── GET /api/inbox/conversations ────────────────────────────────────────────

router.get('/conversations', (req, res) => {
  try {
    const db      = req.db;
    const user    = req.user;
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(Math.max(1, parseInt(req.query.limit) || 30), 100);

    const filters = {
      status:          req.query.status          || 'open',
      platform:        req.query.platform        || '',
      label_id:        req.query.label_id        || '',
      assigned_filter: req.query.assigned_filter || 'all',
      search:          (req.query.search || '').trim(),
      priority:        req.query.priority        || '',
    };

    const { rows, total } = _buildConvQuery(db, user, filters, page, limit);

    res.json({ ok: true, conversations: rows, total, page, limit });
  } catch (e) {
    console.error('[inbox/conversations GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/conversations/:id ────────────────────────────────────────

router.get('/conversations/:id', (req, res) => {
  try {
    const db   = req.db;
    const id   = parseInt(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const conv = db.prepare(`
      SELECT c.*,
        tu.name AS agent_name,
        (
          SELECT json_group_array(json_object('id', l.id, 'name', l.name, 'color', l.color))
          FROM inbox_conversation_labels icl
          JOIN inbox_labels l ON l.id = icl.label_id
          WHERE icl.conversation_id = c.id
        ) AS labels_json
      FROM inbox_conversations_v4 c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      WHERE c.id = ?
    `).get(id);

    if (!conv) return res.status(404).json({ ok: false, error: 'not found' });

    try { conv.labels = conv.labels_json ? JSON.parse(conv.labels_json) : []; } catch { conv.labels = []; }
    delete conv.labels_json;

    res.json({ ok: true, conversation: conv });
  } catch (e) {
    console.error('[inbox/conversations/:id GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/conversations/:id/status ─────────────────────────────────

router.put('/conversations/:id/status', (req, res) => {
  try {
    const db     = req.db;
    const id     = parseInt(req.params.id);
    const status = req.body.status;

    const VALID = ['open', 'waiting', 'closed', 'snoozed', 'all'];
    if (!id || !status || !VALID.includes(status)) {
      return res.status(400).json({ ok: false, error: 'invalid status' });
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE inbox_conversations_v4
      SET status = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      status === 'closed' ? now : null,
      now,
      id
    );

    // إطلاق SSE event للموجودين
    _broadcastConvUpdate(req, id, { status });

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/status PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/conversations/:id/assign ─────────────────────────────────

router.put('/conversations/:id/assign', (req, res) => {
  try {
    const db      = req.db;
    const id      = parseInt(req.params.id);
    const agentId = req.body.agent_id ? parseInt(req.body.agent_id) : null;
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE inbox_conversations_v4
      SET assigned_to_id = ?, updated_at = ?
      WHERE id = ?
    `).run(agentId, now, id);

    _broadcastConvUpdate(req, id, { assigned_to_id: agentId });

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/assign PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/conversations/:id/snooze ─────────────────────────────────

router.put('/conversations/:id/snooze', (req, res) => {
  try {
    const db          = req.db;
    const id          = parseInt(req.params.id);
    const snoozeUntil = req.body.snooze_until
      ? Math.floor(new Date(req.body.snooze_until).getTime() / 1000)
      : null;
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const now    = Math.floor(Date.now() / 1000);
    const status = snoozeUntil ? 'snoozed' : 'open';

    db.prepare(`
      UPDATE inbox_conversations_v4
      SET snooze_until = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(snoozeUntil, status, now, id);

    _broadcastConvUpdate(req, id, { snooze_until: snoozeUntil, status });

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/snooze PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/conversations/:id/priority ───────────────────────────────

router.put('/conversations/:id/priority', (req, res) => {
  try {
    const db       = req.db;
    const id       = parseInt(req.params.id);
    const priority = req.body.priority;

    const VALID = ['low', 'normal', 'high', 'urgent'];
    if (!id || !priority || !VALID.includes(priority)) {
      return res.status(400).json({ ok: false, error: 'invalid priority' });
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE inbox_conversations_v4 SET priority = ?, updated_at = ? WHERE id = ?
    `).run(priority, now, id);

    _broadcastConvUpdate(req, id, { priority });

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/priority PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/conversations/:id/contact ────────────────────────────────

router.put('/conversations/:id/contact', (req, res) => {
  try {
    const db        = req.db;
    const id        = parseInt(req.params.id);
    const contactId = req.body.contact_id ? parseInt(req.body.contact_id) : null;
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE inbox_conversations_v4 SET master_contact_id = ?, updated_at = ? WHERE id = ?
    `).run(contactId, now, id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/contact PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /api/inbox/conversations/bulk ──────────────────────────────────────

router.post('/conversations/bulk', (req, res) => {
  try {
    const db     = req.db;
    const { ids, action, value } = req.body;

    if (!Array.isArray(ids) || !ids.length || !action) {
      return res.status(400).json({ ok: false, error: 'missing fields' });
    }

    // تحقق من صحة الـ IDs
    const safeIds = ids.map(id => parseInt(id)).filter(Boolean);
    if (!safeIds.length) return res.status(400).json({ ok: false, error: 'no valid ids' });

    const placeholders = safeIds.map(() => '?').join(',');
    const now = Math.floor(Date.now() / 1000);

    const VALID_ACTIONS = ['status', 'assign', 'priority', 'delete'];
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid action' });
    }

    // تنفيذ الـ bulk update داخل transaction
    const doUpdate = db.transaction(() => {
      if (action === 'status') {
        db.prepare(`UPDATE inbox_conversations_v4 SET status = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(value, now, ...safeIds);
      } else if (action === 'assign') {
        db.prepare(`UPDATE inbox_conversations_v4 SET assigned_to_id = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(value ? parseInt(value) : null, now, ...safeIds);
      } else if (action === 'priority') {
        db.prepare(`UPDATE inbox_conversations_v4 SET priority = ?, updated_at = ? WHERE id IN (${placeholders})`)
          .run(value, now, ...safeIds);
      } else if (action === 'delete') {
        db.prepare(`DELETE FROM inbox_conversations_v4 WHERE id IN (${placeholders})`)
          .run(...safeIds);
      }
    });

    doUpdate();

    // broadcast SSE
    safeIds.forEach(id => _broadcastConvUpdate(req, id, { [action]: value }));

    res.json({ ok: true, affected: safeIds.length });
  } catch (e) {
    console.error('[inbox/conversations/bulk POST]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/counts ────────────────────────────────────────────────────

router.get('/counts', (req, res) => {
  try {
    const db   = req.db;
    const user = req.user;
    const { clause: scopeClause, params: scopeParams } = _scopeClause(user);

    const scopeWhere = scopeClause ? 'AND ' + scopeClause.replace(/^AND /, '') : '';

    const open = db.prepare(
      `SELECT COUNT(*) as n FROM inbox_conversations_v4 c WHERE c.status = 'open' ${scopeWhere}`
    ).get(...scopeParams).n;

    const waiting = db.prepare(
      `SELECT COUNT(*) as n FROM inbox_conversations_v4 c WHERE c.status = 'waiting' ${scopeWhere}`
    ).get(...scopeParams).n;

    const snoozed = db.prepare(
      `SELECT COUNT(*) as n FROM inbox_conversations_v4 c WHERE c.status = 'snoozed' ${scopeWhere}`
    ).get(...scopeParams).n;

    const unread = db.prepare(
      `SELECT SUM(c.unread_count) as n FROM inbox_conversations_v4 c WHERE c.status != 'closed' ${scopeWhere}`
    ).get(...scopeParams).n || 0;

    res.json({ ok: true, open, waiting, snoozed, unread });
  } catch (e) {
    console.error('[inbox/counts GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /api/inbox/mark-all-read ───────────────────────────────────────────

router.post('/mark-all-read', (req, res) => {
  try {
    const db  = req.db;
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE inbox_conversations_v4 SET unread_count = 0, updated_at = ?
      WHERE status != 'closed'
    `).run(now);

    db.prepare(`
      UPDATE inbox_messages_v4 SET is_read = 1
      WHERE direction = 'in' AND is_read = 0
    `).run();

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/mark-all-read POST]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/conversations/:id/messages ────────────────────────────────

router.get('/conversations/:id/messages', (req, res) => {
  try {
    const db     = req.db;
    const id     = parseInt(req.params.id);
    const before = req.query.before ? parseInt(req.query.before) : null;
    const limit  = Math.min(Math.max(1, parseInt(req.query.limit) || 40), 100);

    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    let msgs;
    if (before) {
      msgs = db.prepare(`
        SELECT * FROM inbox_messages_v4
        WHERE conversation_id = ? AND id < ?
        ORDER BY id DESC LIMIT ?
      `).all(id, before, limit).reverse();
    } else {
      msgs = db.prepare(`
        SELECT * FROM inbox_messages_v4
        WHERE conversation_id = ?
        ORDER BY id DESC LIMIT ?
      `).all(id, limit).reverse();

      // تعليم مقروء عند أول تحميل
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`UPDATE inbox_messages_v4 SET is_read = 1 WHERE conversation_id = ? AND direction = 'in'`).run(id);
      db.prepare(`UPDATE inbox_conversations_v4 SET unread_count = 0, updated_at = ? WHERE id = ?`).run(now, id);
    }

    const hasMore = msgs.length > 0
      ? (db.prepare(`SELECT COUNT(*) as n FROM inbox_messages_v4 WHERE conversation_id = ? AND id < ?`)
           .get(id, msgs[0].id).n > 0)
      : false;

    res.json({ ok: true, messages: msgs, has_more: hasMore });
  } catch (e) {
    console.error('[inbox/conversations/:id/messages GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /api/inbox/conversations/:id/read ──────────────────────────────────

router.post('/conversations/:id/read', (req, res) => {
  try {
    const db  = req.db;
    const id  = parseInt(req.params.id);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`UPDATE inbox_messages_v4 SET is_read = 1 WHERE conversation_id = ? AND direction = 'in'`).run(id);
    db.prepare(`UPDATE inbox_conversations_v4 SET unread_count = 0, updated_at = ? WHERE id = ?`).run(now, id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/conversations/:id/read POST]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── SSE Broadcast Helper ─────────────────────────────────────────────────────
// ملاحظة: Labels endpoints انتقلت لـ server/routes/inbox/labels.js (P3-1)

/**
 * إطلاق SSE event لتحديث محادثة لكل المستمعين في الـ tenant
 * @param {Object} req
 * @param {number} convId
 * @param {Object} patch - البيانات المحدّثة
 */
function _broadcastConvUpdate(req, convId, patch) {
  try {
    const { broadcast } = require('./stream');
    if (!broadcast) return;

    const conv = req.db.prepare(`
      SELECT * FROM inbox_conversations_v4 WHERE id = ?
    `).get(convId);

    if (conv) {
      // broadcast(tenantId, event, data)
      broadcast(req.user.id, 'conv_update', {
        conv_id: convId,
        conv:    { ...conv, ...patch },
      });
    }
  } catch (e) {
    console.warn('[SSE broadcast] skipped:', e.message);
  }
}

module.exports = router;
