/**
 * inbox/labels.js — Labels Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * Endpoints:
 *   GET    /api/inbox/labels                              — قائمة الـ labels
 *   POST   /api/inbox/labels                             — إنشاء label جديد
 *   PUT    /api/inbox/labels/:labelId                    — تعديل اسم/لون label
 *   DELETE /api/inbox/labels/:labelId                    — حذف label
 *   GET    /api/inbox/conversations/:id/labels           — labels المحادثة
 *   POST   /api/inbox/conversations/:id/labels           — إضافة label لمحادثة
 *   DELETE /api/inbox/conversations/:id/labels/:labelId  — إزالة label من محادثة
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * إطلاق SSE broadcast لتحديث محادثة
 */
function _broadcastConvUpdate(req, convId, patch) {
  try {
    const { broadcastToUser } = require('./stream');
    broadcastToUser(req.inboxUser.id, 'conv_update', { id: convId, ...patch });
  } catch (e) {
    console.error('[labels] broadcast error:', e.message);
  }
}

/**
 * إطلاق SSE broadcast لتحديث قائمة الـ labels (لكل المستمعين)
 */
function _broadcastLabelsUpdate(req, action, label) {
  try {
    const { broadcastToUser } = require('./stream');
    broadcastToUser(req.inboxUser.id, 'labels_update', { action, label });
  } catch (e) {
    console.error('[labels] broadcast labels_update error:', e.message);
  }
}

/**
 * تسجيل حدث في timeline المحادثة
 */
function _logTimeline(db, convId, eventType, actorId, actorName, data = {}) {
  try {
    db.prepare(`
      INSERT INTO inbox_timeline_v4 (conversation_id, event_type, actor_id, actor_name, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(convId, eventType, actorId, actorName, JSON.stringify(data));
  } catch (e) {
    console.error('[labels] timeline error:', e.message);
  }
}

/**
 * جلب labels محادثة كـ array
 */
function _getConvLabels(db, convId) {
  return db.prepare(`
    SELECT l.id, l.name, l.color
    FROM inbox_conversation_labels cl
    JOIN inbox_labels l ON l.id = cl.label_id
    WHERE cl.conversation_id = ?
    ORDER BY l.name
  `).all(convId);
}

// ─── Labels CRUD ─────────────────────────────────────────────────────────────

// GET /api/inbox/labels
// يُرجع كل الـ labels مع عدد المحادثات المفتوحة لكل منها
router.get('/labels', (req, res) => {
  try {
    const db   = req.db;
    const rows = db.prepare(`
      SELECT
        l.id,
        l.name,
        l.color,
        l.created_at,
        (
          SELECT COUNT(*)
          FROM inbox_conversation_labels cl
          JOIN inbox_conversations_v4 c ON c.id = cl.conversation_id
          WHERE cl.label_id = l.id AND c.status != 'closed'
        ) AS conv_count
      FROM inbox_labels l
      ORDER BY l.name
    `).all();
    res.json({ ok: true, labels: rows });
  } catch (e) {
    console.error('[inbox/labels GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/inbox/labels — إنشاء label جديد
router.post('/labels', (req, res) => {
  try {
    const db    = req.db;
    const name  = (req.body.name || '').trim();
    const color = req.body.color || '#1B5E30';

    if (!name) return res.status(400).json({ ok: false, error: 'name required' });
    if (name.length > 50) return res.status(400).json({ ok: false, error: 'name too long (max 50)' });

    // تحقق من أن اللون hex صحيح
    if (!/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
      return res.status(400).json({ ok: false, error: 'invalid color format' });
    }

    const result = db.prepare(
      'INSERT INTO inbox_labels (name, color) VALUES (?, ?)'
    ).run(name, color);

    const label = { id: result.lastInsertRowid, name, color, conv_count: 0 };
    _broadcastLabelsUpdate(req, 'created', label);

    res.json({ ok: true, label });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'label name already exists' });
    }
    console.error('[inbox/labels POST]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/inbox/labels/:labelId — تعديل اسم أو لون label
router.put('/labels/:labelId', (req, res) => {
  try {
    const db      = req.db;
    const labelId = parseInt(req.params.labelId);
    if (!labelId) return res.status(400).json({ ok: false, error: 'invalid id' });

    const existing = db.prepare('SELECT * FROM inbox_labels WHERE id = ?').get(labelId);
    if (!existing) return res.status(404).json({ ok: false, error: 'label not found' });

    const name  = req.body.name  !== undefined ? (req.body.name || '').trim()  : existing.name;
    const color = req.body.color !== undefined ? req.body.color                : existing.color;

    if (!name) return res.status(400).json({ ok: false, error: 'name required' });
    if (name.length > 50) return res.status(400).json({ ok: false, error: 'name too long (max 50)' });
    if (!/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
      return res.status(400).json({ ok: false, error: 'invalid color format' });
    }

    db.prepare('UPDATE inbox_labels SET name = ?, color = ? WHERE id = ?').run(name, color, labelId);

    const label = { id: labelId, name, color };
    _broadcastLabelsUpdate(req, 'updated', label);

    res.json({ ok: true, label });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'label name already exists' });
    }
    console.error('[inbox/labels/:id PUT]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/inbox/labels/:labelId — حذف label (يُزيله من كل المحادثات تلقائياً بـ CASCADE)
router.delete('/labels/:labelId', (req, res) => {
  try {
    const db      = req.db;
    const labelId = parseInt(req.params.labelId);
    if (!labelId) return res.status(400).json({ ok: false, error: 'invalid id' });

    const existing = db.prepare('SELECT * FROM inbox_labels WHERE id = ?').get(labelId);
    if (!existing) return res.status(404).json({ ok: false, error: 'label not found' });

    db.prepare('DELETE FROM inbox_labels WHERE id = ?').run(labelId);
    _broadcastLabelsUpdate(req, 'deleted', { id: labelId });

    res.json({ ok: true });
  } catch (e) {
    console.error('[inbox/labels/:id DELETE]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Conversation Labels ──────────────────────────────────────────────────────

// GET /api/inbox/conversations/:id/labels — labels محادثة معينة
router.get('/conversations/:id/labels', (req, res) => {
  try {
    const db     = req.db;
    const convId = parseInt(req.params.id);
    if (!convId) return res.status(400).json({ ok: false, error: 'invalid id' });

    const labels = _getConvLabels(db, convId);
    res.json({ ok: true, labels });
  } catch (e) {
    console.error('[inbox/conversations/:id/labels GET]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/inbox/conversations/:id/labels — إضافة label لمحادثة
router.post('/conversations/:id/labels', (req, res) => {
  try {
    const db      = req.db;
    const convId  = parseInt(req.params.id);
    const labelId = parseInt(req.body.label_id);
    if (!convId || !labelId) return res.status(400).json({ ok: false, error: 'invalid ids' });

    // تحقق من وجود الـ label
    const label = db.prepare('SELECT * FROM inbox_labels WHERE id = ?').get(labelId);
    if (!label) return res.status(404).json({ ok: false, error: 'label not found' });

    // INSERT OR IGNORE يتجاهل لو كان مضافاً بالفعل
    db.prepare(`
      INSERT OR IGNORE INTO inbox_conversation_labels (conversation_id, label_id)
      VALUES (?, ?)
    `).run(convId, labelId);

    // timeline log
    _logTimeline(db, convId, 'label_added',
      req.inboxUser.id, req.inboxUser.name,
      { label_id: labelId, label_name: label.name, color: label.color }
    );

    // جلب كل labels المحادثة بعد الإضافة
    const labels = _getConvLabels(db, convId);

    // SSE broadcast
    _broadcastConvUpdate(req, convId, { labels });
    _broadcastLabelsUpdate(req, 'conv_label_added', {
      conv_id: convId, label_id: labelId, label_name: label.name, color: label.color
    });

    res.json({ ok: true, labels });
  } catch (e) {
    console.error('[inbox/conversations/:id/labels POST]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/inbox/conversations/:id/labels/:labelId — إزالة label من محادثة
router.delete('/conversations/:id/labels/:labelId', (req, res) => {
  try {
    const db      = req.db;
    const convId  = parseInt(req.params.id);
    const labelId = parseInt(req.params.labelId);
    if (!convId || !labelId) return res.status(400).json({ ok: false, error: 'invalid ids' });

    const label = db.prepare('SELECT * FROM inbox_labels WHERE id = ?').get(labelId);

    db.prepare(
      'DELETE FROM inbox_conversation_labels WHERE conversation_id = ? AND label_id = ?'
    ).run(convId, labelId);

    // timeline log
    _logTimeline(db, convId, 'label_removed',
      req.inboxUser.id, req.inboxUser.name,
      { label_id: labelId, label_name: label ? label.name : '' }
    );

    // جلب labels المتبقية
    const labels = _getConvLabels(db, convId);

    // SSE broadcast
    _broadcastConvUpdate(req, convId, { labels });
    _broadcastLabelsUpdate(req, 'conv_label_removed', {
      conv_id: convId, label_id: labelId
    });

    res.json({ ok: true, labels });
  } catch (e) {
    console.error('[inbox/conversations/:id/labels/:labelId DELETE]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
