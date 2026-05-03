/**
 * inbox/chatbot.js — Chatbot Flows Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P4-2 Chatbot Flows)
 *
 * Endpoints:
 *   GET    /api/inbox/chatbot/flows              — قائمة الـ flows
 *   POST   /api/inbox/chatbot/flows              — إنشاء flow جديد
 *   GET    /api/inbox/chatbot/flows/:id          — تفاصيل flow (مع steps)
 *   PUT    /api/inbox/chatbot/flows/:id          — تعديل flow
 *   DELETE /api/inbox/chatbot/flows/:id          — حذف flow
 *   PUT    /api/inbox/chatbot/flows/:id/toggle   — تفعيل/تعطيل
 *   PUT    /api/inbox/chatbot/flows/:id/steps    — حفظ steps كاملة (bulk replace)
 *   POST   /api/inbox/chatbot/flows/:id/test     — اختبار flow (simulate)
 *
 * محرك Chatbot:
 *   module.exports.processChatbot(db, conv, inboundText, tenantId) — يُستدعى من messages.js
 *
 * أنواع الـ Steps:
 *   - message   : إرسال رسالة نصية
 *   - question  : إرسال سؤال مع خيارات (options)
 *   - condition : تحقق من شرط (contains / equals / regex) وتفريع
 *   - action    : إجراء (assign_agent / set_label / set_priority / close_conv / end_flow)
 *   - delay     : انتظار N ثانية ثم المتابعة
 *   - input     : جمع إدخال حر من المستخدم وحفظه في state
 *
 * Trigger Types:
 *   - keyword   : trigger_data = ["مرحبا", "hi", "start"]
 *   - always    : يبدأ مع أي محادثة جديدة
 *   - outside_hours: خارج ساعات العمل
 *
 * DB: inbox_chatbot_flows_v4 + inbox_chatbot_steps_v4 + inbox_chatbot_sessions_v4
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const { v4: uuidv4 } = require('uuid');

// ─── Lazy helpers ─────────────────────────────────────────────────────────────
let _broadcast = null;
function _getBroadcast() {
  if (!_broadcast) {
    try { _broadcast = require('./stream').broadcast; } catch (_) {}
  }
  return _broadcast;
}

let _dispatchMsg = null;
function _getDispatch() {
  if (!_dispatchMsg) {
    try { _dispatchMsg = require('./messages').dispatchOutbound; } catch (_) {}
  }
  return _dispatchMsg;
}

// ─── JSON safe parse ──────────────────────────────────────────────────────────
function _safeParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

// ─── Format flow row ──────────────────────────────────────────────────────────
function _fmtFlow(r) {
  if (!r) return null;
  return {
    ...r,
    trigger_data : _safeParse(r.trigger_data, []),
    platforms    : _safeParse(r.platforms, []),
    is_active    : r.is_active === 1,
  };
}

// ─── Format step row ──────────────────────────────────────────────────────────
function _fmtStep(s) {
  if (!s) return null;
  return {
    ...s,
    options     : _safeParse(s.options, []),
    condition   : _safeParse(s.condition, null),
    action_data : _safeParse(s.action_data, null),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOWS — CRUD
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/inbox/chatbot/flows
router.get('/chatbot/flows', (req, res) => {
  try {
    const rows = req.db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM inbox_chatbot_steps_v4 WHERE flow_id = f.id) AS step_count
      FROM inbox_chatbot_flows_v4 f
      WHERE f.tenant_id = ?
      ORDER BY f.updated_at DESC
    `).all(req.user.id);

    res.json({ ok: true, flows: rows.map(_fmtFlow) });
  } catch (err) {
    console.error('[chatbot] list flows:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inbox/chatbot/flows
router.post('/chatbot/flows', (req, res) => {
  try {
    const {
      name, description = '', trigger_type = 'keyword',
      trigger_data = [], platforms = [],
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'name مطلوب' });

    const stmt = req.db.prepare(`
      INSERT INTO inbox_chatbot_flows_v4
        (tenant_id, name, description, trigger_type, trigger_data, platforms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.user.id, name.trim(), description,
      trigger_type,
      JSON.stringify(Array.isArray(trigger_data) ? trigger_data : [trigger_data]),
      JSON.stringify(platforms),
    );

    const flow = _fmtFlow(req.db.prepare('SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ?').get(result.lastInsertRowid));
    res.json({ ok: true, flow });
  } catch (err) {
    console.error('[chatbot] create flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inbox/chatbot/flows/:id
router.get('/chatbot/flows/:id', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    const steps = req.db.prepare(
      'SELECT * FROM inbox_chatbot_steps_v4 WHERE flow_id = ? ORDER BY step_order ASC'
    ).all(flow.id);

    res.json({ ok: true, flow: _fmtFlow(flow), steps: steps.map(_fmtStep) });
  } catch (err) {
    console.error('[chatbot] get flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inbox/chatbot/flows/:id
router.put('/chatbot/flows/:id', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    const {
      name, description, trigger_type, trigger_data, platforms,
    } = req.body;

    req.db.prepare(`
      UPDATE inbox_chatbot_flows_v4
      SET name = ?, description = ?, trigger_type = ?, trigger_data = ?,
          platforms = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(
      name ?? flow.name,
      description ?? flow.description,
      trigger_type ?? flow.trigger_type,
      JSON.stringify(trigger_data ?? _safeParse(flow.trigger_data, [])),
      JSON.stringify(platforms ?? _safeParse(flow.platforms, [])),
      flow.id,
    );

    const updated = _fmtFlow(req.db.prepare('SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ?').get(flow.id));
    res.json({ ok: true, flow: updated });
  } catch (err) {
    console.error('[chatbot] update flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inbox/chatbot/flows/:id
router.delete('/chatbot/flows/:id', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT id FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    req.db.prepare('DELETE FROM inbox_chatbot_flows_v4 WHERE id = ?').run(flow.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[chatbot] delete flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inbox/chatbot/flows/:id/toggle
router.put('/chatbot/flows/:id/toggle', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    const newActive = flow.is_active ? 0 : 1;
    req.db.prepare(
      'UPDATE inbox_chatbot_flows_v4 SET is_active = ?, updated_at = unixepoch() WHERE id = ?'
    ).run(newActive, flow.id);

    res.json({ ok: true, is_active: newActive === 1 });
  } catch (err) {
    console.error('[chatbot] toggle flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// STEPS — Bulk Replace
// ══════════════════════════════════════════════════════════════════════════════

// PUT /api/inbox/chatbot/flows/:id/steps  (bulk replace كل steps)
router.put('/chatbot/flows/:id/steps', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    const { steps = [] } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'steps لازم يكون array' });

    const saveSteps = req.db.transaction(() => {
      // حذف القديم
      req.db.prepare('DELETE FROM inbox_chatbot_steps_v4 WHERE flow_id = ?').run(flow.id);

      const insertStep = req.db.prepare(`
        INSERT INTO inbox_chatbot_steps_v4
          (flow_id, parent_id, step_order, step_type, content, options, condition, action_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // أول مرور: حفظ بدون parent_id (نحصل على IDs الفعلية)
      const idMap = {}; // tempId → realId
      steps.forEach((s, i) => {
        const r = insertStep.run(
          flow.id,
          null, // parent_id لاحقاً
          i,
          s.step_type || 'message',
          s.content || '',
          JSON.stringify(s.options || []),
          s.condition ? JSON.stringify(s.condition) : null,
          s.action_data ? JSON.stringify(s.action_data) : null,
        );
        idMap[s.temp_id || s.id || i] = r.lastInsertRowid;
      });

      // ثاني مرور: ربط parent_id
      steps.forEach((s, i) => {
        const realId = idMap[s.temp_id || s.id || i];
        const parentKey = s.parent_temp_id ?? s.parent_id;
        if (parentKey != null && idMap[parentKey]) {
          req.db.prepare(
            'UPDATE inbox_chatbot_steps_v4 SET parent_id = ? WHERE id = ?'
          ).run(idMap[parentKey], realId);
        }
      });

      return idMap;
    });

    saveSteps();

    // تحديث updated_at للـ flow
    req.db.prepare(
      'UPDATE inbox_chatbot_flows_v4 SET updated_at = unixepoch() WHERE id = ?'
    ).run(flow.id);

    const saved = req.db.prepare(
      'SELECT * FROM inbox_chatbot_steps_v4 WHERE flow_id = ? ORDER BY step_order ASC'
    ).all(flow.id);

    res.json({ ok: true, steps: saved.map(_fmtStep) });
  } catch (err) {
    console.error('[chatbot] save steps:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST — Simulate Flow
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/inbox/chatbot/flows/:id/test
router.post('/chatbot/flows/:id/test', (req, res) => {
  try {
    const flow = req.db.prepare(
      'SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.user.id);
    if (!flow) return res.status(404).json({ error: 'Flow غير موجود' });

    const steps = req.db.prepare(
      'SELECT * FROM inbox_chatbot_steps_v4 WHERE flow_id = ? ORDER BY step_order ASC'
    ).all(flow.id).map(_fmtStep);

    const { input_text = '' } = req.body;
    const log = _simulateFlow(steps, input_text);

    res.json({ ok: true, simulation: log });
  } catch (err) {
    console.error('[chatbot] test flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE — processChatbot (يُستدعى من messages.js)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * processChatbot — يُشغَّل عند وصول رسالة واردة
 * @param {object} db        - tenant DB
 * @param {object} conv      - المحادثة الحالية
 * @param {string} text      - نص الرسالة الواردة
 * @param {number} tenantId  - معرف الـ tenant
 * @returns {boolean} - true لو الـ chatbot تعامل مع الرسالة
 */
async function processChatbot(db, conv, text, tenantId) {
  try {
    // 1) هل في session نشطة لهذه المحادثة؟
    let session = db.prepare(`
      SELECT * FROM inbox_chatbot_sessions_v4
      WHERE conversation_id = ? AND status = 'active'
    `).get(conv.id);

    if (session) {
      // متابعة flow موجود
      return await _continueSession(db, session, conv, text, tenantId);
    }

    // 2) بحث عن flow يطابق الـ trigger
    const flows = db.prepare(`
      SELECT * FROM inbox_chatbot_flows_v4
      WHERE tenant_id = ? AND is_active = 1
      ORDER BY id ASC
    `).all(tenantId);

    for (const flow of flows) {
      const platforms = _safeParse(flow.platforms, []);
      // فلتر المنصة لو محدد
      if (platforms.length > 0 && !platforms.includes(conv.platform)) continue;

      if (_matchesTrigger(flow, text, conv)) {
        return await _startSession(db, flow, conv, text, tenantId);
      }
    }

    return false; // لم يتعامل الـ chatbot مع الرسالة
  } catch (err) {
    console.error('[chatbot] processChatbot error:', err.message);
    return false;
  }
}

// ─── هل الرسالة تطابق trigger الـ flow؟ ──────────────────────────────────────
function _matchesTrigger(flow, text, conv) {
  if (flow.trigger_type === 'always') return true;

  if (flow.trigger_type === 'keyword') {
    const keywords = _safeParse(flow.trigger_data, []);
    const normalized = (text || '').trim().toLowerCase();
    return keywords.some(k => normalized.includes((k || '').toLowerCase().trim()));
  }

  return false;
}

// ─── بدء session جديدة ────────────────────────────────────────────────────────
async function _startSession(db, flow, conv, text, tenantId) {
  const steps = db.prepare(
    'SELECT * FROM inbox_chatbot_steps_v4 WHERE flow_id = ? ORDER BY step_order ASC'
  ).all(flow.id).map(_fmtStep);

  if (!steps.length) return false;

  // أول step بدون parent = نقطة البداية
  const firstStep = steps.find(s => !s.parent_id) || steps[0];

  // إنشاء session
  const sessionResult = db.prepare(`
    INSERT INTO inbox_chatbot_sessions_v4
      (tenant_id, conversation_id, flow_id, current_step_id, state, status)
    VALUES (?, ?, ?, ?, '{}', 'active')
  `).run(tenantId, conv.id, flow.id, firstStep.id);

  const sessionId = sessionResult.lastInsertRowid;

  // تنفيذ الـ step الأول
  await _executeStep(db, sessionId, firstStep, steps, conv, text, tenantId);
  return true;
}

// ─── متابعة session موجودة ────────────────────────────────────────────────────
async function _continueSession(db, session, conv, text, tenantId) {
  const flow = db.prepare('SELECT * FROM inbox_chatbot_flows_v4 WHERE id = ?').get(session.flow_id);
  if (!flow) {
    // flow محذوف — أنهِ الـ session
    db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(session.id);
    return false;
  }

  const steps = db.prepare(
    'SELECT * FROM inbox_chatbot_steps_v4 WHERE flow_id = ? ORDER BY step_order ASC'
  ).all(flow.id).map(_fmtStep);

  const currentStep = steps.find(s => s.id === session.current_step_id);
  if (!currentStep) {
    db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(session.id);
    return false;
  }

  // إذا كان الـ step الحالي question/input → نعالج الرد
  if (currentStep.step_type === 'question' || currentStep.step_type === 'input') {
    const nextStep = _resolveNextStep(steps, currentStep, text, session);
    if (!nextStep) {
      // نهاية الـ flow
      db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(session.id);
      return true; // تعاملنا مع الرسالة
    }
    await _executeStep(db, session.id, nextStep, steps, conv, text, tenantId);
    return true;
  }

  return false;
}

// ─── تنفيذ step ───────────────────────────────────────────────────────────────
async function _executeStep(db, sessionId, step, allSteps, conv, inboundText, tenantId) {
  const dispatch = _getDispatch();
  const broadcast = _getBroadcast();

  // تحديث current_step_id
  db.prepare(
    'UPDATE inbox_chatbot_sessions_v4 SET current_step_id = ?, updated_at = unixepoch() WHERE id = ?'
  ).run(step.id, sessionId);

  switch (step.step_type) {
    case 'message': {
      if (step.content && dispatch) {
        await dispatch(db, conv, {
          id           : uuidv4(),
          direction    : 'outbound',
          message_type : 'text',
          content      : step.content,
          sender_name  : 'Bot',
          sent_at      : Date.now(),
        });
        if (broadcast) broadcast(tenantId, 'chatbot_sent', { conv_id: conv.id, content: step.content });
      }
      // الانتقال التلقائي للـ step التالي
      const next = _autoNextStep(allSteps, step);
      if (next) {
        // تأخير قصير إذا step.action_data.delay
        const delayMs = step.action_data?.delay_sec ? step.action_data.delay_sec * 1000 : 300;
        await _sleep(delayMs);
        await _executeStep(db, sessionId, next, allSteps, conv, inboundText, tenantId);
      } else {
        db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(sessionId);
      }
      break;
    }

    case 'question': {
      // إرسال السؤال مع الخيارات
      const opts = step.options || [];
      let msgText = step.content || '';
      if (opts.length) {
        msgText += '\n' + opts.map((o, i) => `${i + 1}. ${o.label || o}`).join('\n');
      }
      if (dispatch) {
        await dispatch(db, conv, {
          id           : uuidv4(),
          direction    : 'outbound',
          message_type : 'text',
          content      : msgText,
          sender_name  : 'Bot',
          sent_at      : Date.now(),
        });
      }
      // نبقى في هذا الـ step وننتظر رد المستخدم
      break;
    }

    case 'input': {
      if (step.content && dispatch) {
        await dispatch(db, conv, {
          id           : uuidv4(),
          direction    : 'outbound',
          message_type : 'text',
          content      : step.content,
          sender_name  : 'Bot',
          sent_at      : Date.now(),
        });
      }
      // ننتظر رد المستخدم
      break;
    }

    case 'condition': {
      const next = _resolveNextStep(allSteps, step, inboundText, null);
      if (next) {
        await _executeStep(db, sessionId, next, allSteps, conv, inboundText, tenantId);
      } else {
        db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(sessionId);
      }
      break;
    }

    case 'action': {
      const actionData = step.action_data || {};
      await _executeAction(db, conv, actionData, tenantId);
      // الانتقال للـ step التالي
      const next = _autoNextStep(allSteps, step);
      if (next) {
        await _executeStep(db, sessionId, next, allSteps, conv, inboundText, tenantId);
      } else {
        db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(sessionId);
      }
      break;
    }

    case 'delay': {
      const delaySec = step.action_data?.delay_sec || 2;
      await _sleep(delaySec * 1000);
      const next = _autoNextStep(allSteps, step);
      if (next) {
        await _executeStep(db, sessionId, next, allSteps, conv, inboundText, tenantId);
      } else {
        db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(sessionId);
      }
      break;
    }

    default:
      db.prepare("UPDATE inbox_chatbot_sessions_v4 SET status='ended' WHERE id=?").run(sessionId);
  }
}

// ─── الـ step التالي التلقائي (أول child بدون condition) ──────────────────────
function _autoNextStep(allSteps, currentStep) {
  // أطفال الـ step الحالي مرتبين
  const children = allSteps.filter(s => s.parent_id === currentStep.id);
  if (!children.length) return null;
  // أول child بدون condition
  return children.find(s => !s.condition) || children[0];
}

// ─── حل الـ step التالي بناءً على رد المستخدم ─────────────────────────────────
function _resolveNextStep(allSteps, currentStep, userText, session) {
  const children = allSteps.filter(s => s.parent_id === currentStep.id);
  if (!children.length) return null;

  const normalized = (userText || '').trim().toLowerCase();

  // إذا كان question — طابق على رقم الخيار أو نصه
  if (currentStep.step_type === 'question') {
    const opts = currentStep.options || [];
    const numChoice = parseInt(normalized, 10);

    if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= opts.length) {
      const chosenLabel = (opts[numChoice - 1]?.label || opts[numChoice - 1] || '').toLowerCase();
      const matched = children.find(c => {
        if (!c.condition) return false;
        const cv = (c.condition.value || '').toLowerCase();
        return cv === String(numChoice) || cv === chosenLabel;
      });
      return matched || children.find(s => !s.condition) || null;
    }

    // مطابقة نصية
    const matched = children.find(c => {
      if (!c.condition) return false;
      const cv = (c.condition.value || '').toLowerCase();
      return normalized.includes(cv) || cv.includes(normalized);
    });
    return matched || children.find(s => !s.condition) || null;
  }

  // condition step — تقييم
  if (currentStep.step_type === 'condition') {
    for (const child of children) {
      if (!child.condition) continue;
      if (_evalCondition(child.condition, userText)) return child;
    }
    return children.find(s => !s.condition) || null;
  }

  // input — أول child
  return children[0] || null;
}

// ─── تقييم condition ──────────────────────────────────────────────────────────
function _evalCondition(cond, text) {
  if (!cond || !text) return false;
  const normalized = text.trim().toLowerCase();
  const value = (cond.value || '').toLowerCase();

  switch (cond.operator) {
    case 'contains': return normalized.includes(value);
    case 'equals':   return normalized === value;
    case 'starts':   return normalized.startsWith(value);
    case 'regex':    try { return new RegExp(cond.value, 'i').test(text); } catch (_) { return false; }
    default: return false;
  }
}

// ─── تنفيذ action ─────────────────────────────────────────────────────────────
async function _executeAction(db, conv, actionData, tenantId) {
  const { type } = actionData;
  try {
    if (type === 'close_conv') {
      db.prepare("UPDATE inbox_conversations_v4 SET status='closed', updated_at=unixepoch() WHERE id=?").run(conv.id);
      const broadcast = _getBroadcast();
      if (broadcast) broadcast(tenantId, 'conv_update', { id: conv.id, status: 'closed' });
    }

    if (type === 'set_priority' && actionData.priority) {
      db.prepare('UPDATE inbox_conversations_v4 SET priority=?, updated_at=unixepoch() WHERE id=?')
        .run(actionData.priority, conv.id);
    }

    if (type === 'assign_agent' && actionData.agent_id) {
      db.prepare('UPDATE inbox_conversations_v4 SET assigned_to=?, updated_at=unixepoch() WHERE id=?')
        .run(actionData.agent_id, conv.id);
    }

    if (type === 'end_flow') {
      // لا شيء — سيتم إنهاء الـ session في _executeStep
    }
  } catch (err) {
    console.error('[chatbot] executeAction error:', err.message);
  }
}

// ─── Simulate (للـ test endpoint) ─────────────────────────────────────────────
function _simulateFlow(steps, inputText) {
  const log = [];
  const root = steps.find(s => !s.parent_id) || steps[0];
  if (!root) return [{ type: 'error', message: 'لا يوجد steps' }];

  function visit(step, depth = 0) {
    if (depth > 20) { log.push({ type: 'warning', message: 'تجاوز عمق التشعب الأقصى' }); return; }
    log.push({
      step_id   : step.id,
      step_type : step.step_type,
      content   : step.content,
      options   : step.options,
    });
    if (step.step_type === 'question' || step.step_type === 'input') {
      log.push({ type: 'await_input', message: 'ينتظر رد المستخدم' });
      return;
    }
    const children = steps.filter(s => s.parent_id === step.id);
    if (children.length === 0) {
      log.push({ type: 'end', message: 'نهاية الـ Flow' });
    } else {
      children.forEach(c => visit(c, depth + 1));
    }
  }

  visit(root);
  return log;
}

// ─── Helper: sleep ────────────────────────────────────────────────────────────
function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.min(ms, 5000)));
}

// ══════════════════════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════════════════════

module.exports                   = router;
module.exports.processChatbot    = processChatbot;
