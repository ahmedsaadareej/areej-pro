/**
 * inbox/team.js — Team Assignment Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * Endpoints:
 *   GET  /api/inbox/team/agents          — قائمة الموظفين مع حالتهم + إحصائياتهم
 *   GET  /api/inbox/team/agents/:agentId — حالة موظف واحد
 *   PUT  /api/inbox/team/agents/status   — تغيير حالة الموظف الحالي (online/busy/away/offline)
 *
 *   PUT  /api/inbox/conversations/:id/assign    — تعيين موظف لمحادثة (يدوي)
 *   POST /api/inbox/conversations/:id/transfer  — تحويل محادثة مع context وملاحظة (P2-5)
 *   POST /api/inbox/conversations/auto-assign   — auto-assign لمحادثة open غير معيّنة
 *   POST /api/inbox/conversations/auto-assign-all — تعيين كل المحادثات المفتوحة الغير معيّنة
 *
 * منطق Auto-assign:
 *   1. يُرتّب الموظفون الـ online فقط
 *   2. يُختار من عنده أقل عدد محادثات open مفتوحة
 *   3. لو تعادل → يُختار من تسجّل أخيراً (LIFO — أكثر حيوية)
 *   4. لو لا أحد online → يُسجّل في timeline ويُترك بدون تعيين
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helpers مشتركة ────────────────────────────────────────────────────────

/** الوقت الحالي بصيغة Unix timestamp */
const _now = () => Math.floor(Date.now() / 1000);

/**
 * تسجيل حدث في inbox_timeline_v4
 * @param {Object} db  - tenant DB
 * @param {number} convId
 * @param {string} eventType
 * @param {Object} actor  - { id, name }
 * @param {Object} data   - بيانات إضافية JSON
 */
function _addTimeline(db, convId, eventType, actor, data = {}) {
  try {
    db.prepare(`
      INSERT INTO inbox_timeline_v4 (conversation_id, event_type, actor_id, actor_name, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(convId, eventType, actor?.id || null, actor?.name || null, JSON.stringify(data), _now());
  } catch (e) {
    // timeline فشل لا يوقف العملية الأصلية
    console.error('[team] timeline error:', e.message);
  }
}

/**
 * بث تحديث محادثة عبر SSE
 * @param {Object} req
 * @param {number} convId
 * @param {Object} patch - التغييرات
 */
function _broadcastConvUpdate(req, convId, patch) {
  try {
    const { broadcastToUser } = require('./stream');
    broadcastToUser(req.inboxUser.id, 'conv_update', { id: convId, ...patch });
  } catch (e) {
    console.error('[team] broadcast error:', e.message);
  }
}

/**
 * جلب إحصائيات المحادثات المفتوحة لكل موظف
 * @param {Object} db
 * @returns {Map<number, number>} agentId → عدد محادثات open
 */
function _getAgentOpenCounts(db) {
  const rows = db.prepare(`
    SELECT assigned_to_id AS agent_id, COUNT(*) AS cnt
    FROM inbox_conversations_v4
    WHERE status = 'open' AND assigned_to_id IS NOT NULL
    GROUP BY assigned_to_id
  `).all();

  const map = new Map();
  for (const r of rows) map.set(r.agent_id, r.cnt);
  return map;
}

/**
 * اختيار أفضل موظف للـ auto-assign
 * @param {Object} db
 * @returns {{ id: number, name: string } | null}
 */
function _pickBestAgent(db) {
  // الموظفون الـ online فقط
  const onlineAgents = db.prepare(`
    SELECT tu.id, tu.name, COALESCE(ias.status, 'offline') AS inbox_status,
           COALESCE(ias.updated_at, 0) AS status_updated_at
    FROM tenant_users tu
    LEFT JOIN inbox_agent_status_v4 ias ON ias.agent_id = tu.id
    WHERE tu.active = 1
      AND COALESCE(ias.status, 'offline') = 'online'
    ORDER BY ias.updated_at DESC
  `).all();

  if (!onlineAgents.length) return null;

  const openCounts = _getAgentOpenCounts(db);

  // ترتيب: أقل عدد محادثات أولاً — لو تعادل → الأحدث تسجيلاً (status_updated_at DESC)
  onlineAgents.sort((a, b) => {
    const ca = openCounts.get(a.id) || 0;
    const cb = openCounts.get(b.id) || 0;
    if (ca !== cb) return ca - cb;
    return b.status_updated_at - a.status_updated_at; // LIFO
  });

  return onlineAgents[0];
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/inbox/team/agents
 * قائمة كل الموظفين مع حالتهم + عدد محادثاتهم المفتوحة
 * متاح لـ owner/admin فقط
 */
router.get('/team/agents', (req, res) => {
  try {
    const db = req.db;

    const agents = db.prepare(`
      SELECT
        tu.id,
        tu.name,
        tu.email,
        COALESCE(ias.status, 'offline')     AS inbox_status,
        COALESCE(ias.updated_at, 0)          AS status_updated_at,
        COUNT(c.id)                          AS open_count
      FROM tenant_users tu
      LEFT JOIN inbox_agent_status_v4 ias ON ias.agent_id = tu.id
      LEFT JOIN inbox_conversations_v4 c
        ON c.assigned_to_id = tu.id AND c.status = 'open'
      WHERE tu.active = 1
      GROUP BY tu.id
      ORDER BY
        CASE COALESCE(ias.status,'offline')
          WHEN 'online'  THEN 1
          WHEN 'busy'    THEN 2
          WHEN 'away'    THEN 3
          ELSE 4
        END,
        tu.name ASC
    `).all();

    return res.json({ ok: true, agents });
  } catch (e) {
    console.error('[team] GET /team/agents error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/inbox/team/agents/:agentId
 * حالة موظف واحد
 */
router.get('/team/agents/:agentId', (req, res) => {
  try {
    const db      = req.db;
    const agentId = parseInt(req.params.agentId);

    if (isNaN(agentId)) return res.status(400).json({ ok: false, error: 'agentId غير صالح' });

    const agent = db.prepare(`
      SELECT
        tu.id, tu.name, tu.email,
        COALESCE(ias.status, 'offline')  AS inbox_status,
        COALESCE(ias.updated_at, 0)       AS status_updated_at
      FROM tenant_users tu
      LEFT JOIN inbox_agent_status_v4 ias ON ias.agent_id = tu.id
      WHERE tu.id = ? AND tu.active = 1
    `).get(agentId);

    if (!agent) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });

    const openCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM inbox_conversations_v4 WHERE assigned_to_id = ? AND status = 'open'`
    ).get(agentId))?.n || 0;

    return res.json({ ok: true, agent: { ...agent, open_count: openCount } });
  } catch (e) {
    console.error('[team] GET /team/agents/:id error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * PUT /api/inbox/team/agents/status
 * الموظف يغيّر حالته (online / busy / away / offline)
 * Body: { status: 'online' | 'busy' | 'away' | 'offline' }
 */
router.put('/team/agents/status', (req, res) => {
  try {
    const db     = req.db;
    const userId = req.inboxUser.id;
    const { status } = req.body;

    const valid = ['online', 'busy', 'away', 'offline'];
    if (!valid.includes(status)) {
      return res.status(400).json({ ok: false, error: `status يجب أن يكون: ${valid.join(' | ')}` });
    }

    const now = _now();

    // UPSERT — إدراج أو تحديث
    db.prepare(`
      INSERT INTO inbox_agent_status_v4 (agent_id, status, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    `).run(userId, status, now);

    // بث التحديث لكل المتصلين بالـ SSE
    try {
      const { broadcastToUser } = require('./stream');
      broadcastToUser(req.inboxUser.id, 'agent_status', { agent_id: userId, status });
    } catch (_) {}

    return res.json({ ok: true, status });
  } catch (e) {
    console.error('[team] PUT /team/agents/status error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * PUT /api/inbox/conversations/:id/assign
 * تعيين موظف لمحادثة يدوياً
 * Body: { agent_id: number | null }  (null = إلغاء التعيين)
 * متاح للجميع (مع scope check — موظف عادي يعيّن لنفسه فقط)
 */
router.put('/conversations/:id/assign', (req, res) => {
  try {
    const db  = req.db;
    const id  = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'id غير صالح' });

    const agentId = req.body.agent_id != null ? parseInt(req.body.agent_id) : null;
    const isAdmin = !!(req.inboxUser && req.inboxUser.permissions.team_manage);

    // موظف عادي يعيّن لنفسه فقط أو يُلغي تعيينه
    if (!isAdmin && agentId !== null && agentId !== req.inboxUser.id) {
      return res.status(403).json({ ok: false, error: 'لا يمكنك التعيين لموظف آخر' });
    }

    // التحقق من وجود المحادثة
    const conv = db.prepare(`SELECT id, assigned_to_id FROM inbox_conversations_v4 WHERE id = ?`).get(id);
    if (!conv) return res.status(404).json({ ok: false, error: 'المحادثة غير موجودة' });

    // التحقق من وجود الموظف (لو مش null)
    if (agentId !== null) {
      const agent = db.prepare(`SELECT id, name FROM tenant_users WHERE id = ? AND active = 1`).get(agentId);
      if (!agent) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    }

    const now = _now();
    db.prepare(`UPDATE inbox_conversations_v4 SET assigned_to_id = ?, updated_at = ? WHERE id = ?`)
      .run(agentId, now, id);

    // جلب اسم الموظف للتوثيق
    const agentName = agentId
      ? db.prepare(`SELECT name FROM tenant_users WHERE id = ?`).get(agentId)?.name
      : null;

    // تسجيل في التايملاين
    _addTimeline(db, id, agentId ? 'assigned' : 'unassigned', req.inboxUser, {
      agent_id: agentId,
      agent_name: agentName,
      prev_agent_id: conv.assigned_to_id,
    });

    // بث التحديث
    _broadcastConvUpdate(req, id, {
      assigned_to_id: agentId,
      agent_name: agentName || null,
    });

    return res.json({ ok: true, assigned_to_id: agentId, agent_name: agentName || null });
  } catch (e) {
    console.error('[team] PUT /conversations/:id/assign error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/inbox/conversations/auto-assign
 * Auto-assign محادثة واحدة غير معيّنة
 * Body: { conversation_id: number }
 */
router.post('/conversations/auto-assign', (req, res) => {
  try {
    const db     = req.db;
    const convId = parseInt(req.body.conversation_id);
    if (isNaN(convId)) return res.status(400).json({ ok: false, error: 'conversation_id غير صالح' });

    const conv = db.prepare(`SELECT id, assigned_to_id, status FROM inbox_conversations_v4 WHERE id = ?`).get(convId);
    if (!conv) return res.status(404).json({ ok: false, error: 'المحادثة غير موجودة' });

    // اختيار أفضل موظف
    const agent = _pickBestAgent(db);

    if (!agent) {
      // لا أحد online — يُسجّل محاولة في التايملاين
      _addTimeline(db, convId, 'assigned', req.inboxUser, {
        auto: true,
        failed: true,
        reason: 'no_online_agents',
      });
      return res.json({ ok: true, assigned: false, reason: 'no_online_agents' });
    }

    const now = _now();
    db.prepare(`UPDATE inbox_conversations_v4 SET assigned_to_id = ?, updated_at = ? WHERE id = ?`)
      .run(agent.id, now, convId);

    _addTimeline(db, convId, 'assigned', req.inboxUser, {
      auto: true,
      agent_id: agent.id,
      agent_name: agent.name,
    });

    _broadcastConvUpdate(req, convId, {
      assigned_to_id: agent.id,
      agent_name: agent.name,
    });

    return res.json({ ok: true, assigned: true, agent: { id: agent.id, name: agent.name } });
  } catch (e) {
    console.error('[team] POST /conversations/auto-assign error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/inbox/conversations/auto-assign-all
 * تعيين كل المحادثات المفتوحة الغير معيّنة للموظفين الـ online
 * متاح لـ owner/admin فقط
 */
router.post('/conversations/auto-assign-all', (req, res) => {
  try {
    const db   = req.db;
    const user = req.inboxUser;

    if (!user?.permissions?.team_manage) {
      return res.status(403).json({ ok: false, error: 'للمشرفين فقط' });
    }

    // كل المحادثات المفتوحة غير المعيّنة مرتّبة من الأقدم للأحدث
    const unassigned = db.prepare(`
      SELECT id FROM inbox_conversations_v4
      WHERE status = 'open' AND (assigned_to_id IS NULL OR assigned_to_id = 0)
      ORDER BY last_message_at ASC
    `).all();

    if (!unassigned.length) {
      return res.json({ ok: true, assigned: 0, skipped: 0, reason: 'none_unassigned' });
    }

    const now = _now();
    let assigned = 0;
    let skipped  = 0;

    // نُعيّن واحدة واحدة — كل مرة نختار أفضل موظف (يتغير مع كل تعيين)
    for (const conv of unassigned) {
      const agent = _pickBestAgent(db);
      if (!agent) { skipped++; continue; }

      db.prepare(`UPDATE inbox_conversations_v4 SET assigned_to_id = ?, updated_at = ? WHERE id = ?`)
        .run(agent.id, now, conv.id);

      _addTimeline(db, conv.id, 'assigned', user, {
        auto: true,
        bulk: true,
        agent_id: agent.id,
        agent_name: agent.name,
      });

      _broadcastConvUpdate(req, conv.id, {
        assigned_to_id: agent.id,
        agent_name: agent.name,
      });

      assigned++;
    }

    return res.json({ ok: true, assigned, skipped });
  } catch (e) {
    console.error('[team] POST /conversations/auto-assign-all error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/inbox/conversations/:id/typing
 * بث typing indicator عبر SSE للمحادثة المحددة
 * Body: { typing: boolean }
 * منخفض التكلفة — لا يحتاج كتابة DB
 */
router.post('/conversations/:id/typing', (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'id غير صالح' });

    const typing = req.body.typing !== false; // default: true

    // بث لكل المتصلين بالـ SSE
    try {
      const { broadcastToUser } = require('./stream');
      broadcastToUser(req.inboxUser.id, 'agent_typing', {
        conv_id:    id,
        agent_id:   req.inboxUser.id,
        agent_name: req.inboxUser.name || 'موظف',
        typing,
      });
    } catch (_) {}

    return res.json({ ok: true });
  } catch (e) {
    console.error('[team] POST /typing error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/inbox/conversations/:id/transfer
 * تحويل محادثة لموظف آخر مع سياق وملاحظة داخلية اختيارية (P2-5)
 * Body: {
 *   to_agent_id: number,          — الموظف المستلم
 *   note: string (optional),      — ملاحظة سياق تظهر للموظف المستلم
 *   include_context: boolean      — إدراج ملخص آخر 3 رسائل في الملاحظة (default: true)
 * }
 * متاح للمدير والإداري فقط (لأن التحويل يغيّر التعيين)
 */
router.post('/conversations/:id/transfer', (req, res) => {
  try {
    const db  = req.db;
    const id  = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'id غير صالح' });

    const toAgentId      = parseInt(req.body.to_agent_id);
    if (isNaN(toAgentId)) return res.status(400).json({ ok: false, error: 'to_agent_id مطلوب' });

    const contextNote    = (req.body.note || '').trim().slice(0, 500);
    const includeContext = req.body.include_context !== false; // default true

    // فقط admin / owner
    const isAdmin = !!(req.inboxUser && req.inboxUser.permissions.team_manage);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: 'صلاحية المدير / الإداري فقط' });
    }

    // التحقق من وجود المحادثة
    const conv = db.prepare(
      `SELECT id, assigned_to_id, contact_name, platform FROM inbox_conversations_v4 WHERE id = ?`
    ).get(id);
    if (!conv) return res.status(404).json({ ok: false, error: 'المحادثة غير موجودة' });
    if (conv.assigned_to_id === toAgentId) {
      return res.status(400).json({ ok: false, error: 'المحادثة معيّنة لهذا الموظف بالفعل' });
    }

    // التحقق من وجود الموظف المستلم
    const toAgent = db.prepare(
      `SELECT id, name FROM tenant_users WHERE id = ? AND active = 1`
    ).get(toAgentId);
    if (!toAgent) return res.status(404).json({ ok: false, error: 'الموظف المستلم غير موجود' });

    const fromAgentName = conv.assigned_to_id
      ? db.prepare(`SELECT name FROM tenant_users WHERE id = ?`).get(conv.assigned_to_id)?.name || 'موظف'
      : 'لا أحد';

    const now = _now();

    // ── 1: تحديث assigned_to_id ──────────────────────────────────────────────
    db.prepare(
      `UPDATE inbox_conversations_v4 SET assigned_to_id = ?, updated_at = ? WHERE id = ?`
    ).run(toAgentId, now, id);

    // ── 2: بناء نص النوتس الداخلية ──────────────────────────────────
    let noteContent = `⬅️ تحويل من **${fromAgentName}** إلى **${toAgent.name}**`;
    if (contextNote) noteContent += `\nملاحظة: ${contextNote}`;

    // أجمل آخر 3 رسائل للسياق
    if (includeContext) {
      const lastMsgs = db.prepare(
        `SELECT direction, content, content_type, agent_name, created_at
         FROM inbox_messages_v4
         WHERE conversation_id = ? AND direction != 'note'
         ORDER BY created_at DESC LIMIT 3`
      ).all(id);

      if (lastMsgs.length > 0) {
        noteContent += '\n\n📝 سياق آخر ' + lastMsgs.length + ' رسائل:';
        [...lastMsgs].reverse().forEach(m => {
          const who  = m.direction === 'outbound' ? (m.agent_name || 'موظف') : 'العميل';
          const text = m.content_type === 'text'
            ? (m.content || '').slice(0, 80)
            : `[ملف ${m.content_type}]`;
          noteContent += `\n• ${who}: ${text}`;
        });
      }
    }

    // ── 3: حفظ النوتس كرسالة ─────────────────────────────────────────
    const { v4: uuidv4 } = require('uuid');
    const noteId = uuidv4();
    db.prepare(
      `INSERT INTO inbox_messages_v4
         (id, conversation_id, direction, content_type, content,
          agent_id, agent_name, status, created_at)
       VALUES (?, ?, 'note', 'text', ?, ?, ?, 'sent', ?)`
    ).run(
      noteId, id, noteContent,
      req.inboxUser.id,
      req.inboxUser.name || 'موظف',
      now
    );

    // ── 4: timeline event ─────────────────────────────────────────────────────
    _addTimeline(db, id, 'transferred', req.inboxUser, {
      from_agent_id:   conv.assigned_to_id,
      from_agent_name: fromAgentName,
      to_agent_id:     toAgentId,
      to_agent_name:   toAgent.name,
      note:            contextNote || null,
    });

    // ── 5: SSE broadcast ──────────────────────────────────────────────────
    try {
      const { broadcast: sseBroadcast, sendToUser } = require('./stream');
      // إبلغ كل المتصلين بتحديث التعيين
      _broadcastConvUpdate(req, id, {
        assigned_to_id: toAgentId,
        agent_name:     toAgent.name,
      });
      // إبلغ الموظف المستلم بحدث مخصص
      sendToUser(toAgentId, 'conv:transferred', {
        conversation_id: id,
        contact_name:    conv.contact_name,
        from_agent_name: fromAgentName,
        transferred_by:  req.inboxUser.name || 'موظف',
        note:            contextNote || null,
      });
      // بث النوتس في SSE لكل المتصلين
      sseBroadcast(req.inboxUser.tenantUserId, 'message:new', {
        ...{
          id:              noteId,
          conversation_id: id,
          direction:       'note',
          content_type:    'text',
          content:         noteContent,
          agent_id:        req.inboxUser.id,
          agent_name:      req.inboxUser.name || 'موظف',
          status:          'sent',
          created_at:      now,
        },
      });
    } catch (_) {}

    return res.json({
      ok:           true,
      to_agent_id:  toAgentId,
      to_agent_name: toAgent.name,
      note_id:      noteId,
    });

  } catch (e) {
    console.error('[team] POST /transfer error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
