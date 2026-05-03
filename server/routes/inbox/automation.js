/**
 * inbox/automation.js — Automation Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P4-1 Keywords Auto-Reply)
 *
 * Endpoints:
 *   GET    /api/inbox/automation/keywords         — قائمة قواعد الكلمات
 *   POST   /api/inbox/automation/keywords         — إنشاء قاعدة جديدة
 *   PUT    /api/inbox/automation/keywords/:id     — تعديل قاعدة
 *   DELETE /api/inbox/automation/keywords/:id     — حذف قاعدة
 *   PUT    /api/inbox/automation/keywords/:id/toggle — تفعيل/تعطيل
 *   POST   /api/inbox/automation/keywords/reorder — إعادة ترتيب (الأولوية)
 *
 *   POST   /api/inbox/automation/test             — اختبار قاعدة على نص معين
 *
 * الـ Auto-Reply Engine:
 *   module.exports.processAutoReply(db, conv, inboundText) — يُستدعى من messages.js
 *
 * منطق المطابقة:
 *   - match_type = 'exact'    : نص تطابق تام (case-insensitive)
 *   - match_type = 'contains' : النص يحتوي الكلمة المفتاحية
 *   - match_type = 'starts'   : النص يبدأ بالكلمة
 *   - match_type = 'regex'    : regular expression
 *
 * الـ Reply Types:
 *   - reply_type = 'text'     : رسالة نصية
 *   - reply_type = 'template' : قالب WA مسبق (يُرسل اسم القالب)
 *
 * جدول DB: inbox_automation_v4
 *   id, tenant_id, name, is_enabled, match_type, keywords (JSON),
 *   reply_type, reply_content, reply_delay_sec, platforms (JSON),
 *   apply_once_per_conv, priority_order, created_at, updated_at
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const { v4: uuidv4 } = require('uuid');

// ─── Helper: broadcast SSE لكل الموظفين ──────────────────────────────────────
let _broadcast = null;
function _getBroadcast() {
  if (!_broadcast) {
    try { _broadcast = require('./stream').broadcast; } catch (_) {}
  }
  return _broadcast;
}

// ─── Helper: dispatch رسالة صادرة عبر الـ channel (WhatsApp / Telegram) ────────
let _dispatchMessage = null;
function _getDispatch() {
  if (!_dispatchMessage) {
    try { _dispatchMessage = require('./messages').dispatchOutbound; } catch (_) {}
  }
  return _dispatchMessage;
}

// ─── تطبيع النص للمقارنة ─────────────────────────────────────────────────────
function _normalizeText(t) {
  return (t || '').trim().toLowerCase();
}

/**
 * تحقق إذا كان النص يطابق قاعدة معينة
 * @param {string} text - نص الرسالة الواردة
 * @param {string} matchType - exact|contains|starts|regex
 * @param {string[]} keywords - قائمة الكلمات المفتاحية
 * @returns {boolean}
 */
function _matchesRule(text, matchType, keywords) {
  const normalized = _normalizeText(text);
  if (!normalized || !Array.isArray(keywords) || keywords.length === 0) return false;

  for (const kw of keywords) {
    const k = _normalizeText(kw);
    if (!k) continue;

    if (matchType === 'exact' && normalized === k) return true;
    if (matchType === 'contains' && normalized.includes(k)) return true;
    if (matchType === 'starts' && normalized.startsWith(k)) return true;
    if (matchType === 'regex') {
      try {
        if (new RegExp(kw, 'i').test(text)) return true;
      } catch (_) {
        // regex غير صالح — تجاهل
      }
    }
  }
  return false;
}

/**
 * تحقق إذا كانت القاعدة تنطبق على المنصة الحالية
 * @param {string|null} platforms - JSON array أو null (= الكل)
 * @param {string} convPlatform - منصة المحادثة
 */
function _platformAllowed(platforms, convPlatform) {
  if (!platforms) return true;
  try {
    const arr = typeof platforms === 'string' ? JSON.parse(platforms) : platforms;
    if (!Array.isArray(arr) || arr.length === 0) return true;
    return arr.includes(convPlatform);
  } catch (_) {
    return true;
  }
}

// ─── Engine: تطبيق Auto-Reply ─────────────────────────────────────────────────

/**
 * processAutoReply — يُستدعى من messages.js بعد استقبال رسالة واردة
 * @param {Object} db      - tenant SQLite instance
 * @param {Object} conv    - بيانات المحادثة { id, platform, external_id, status }
 * @param {string} text    - نص الرسالة الواردة
 * @param {number} tenantId
 * @returns {Promise<boolean>} true لو أُرسل رد تلقائي
 */
async function processAutoReply(db, conv, text, tenantId) {
  if (!text || !text.trim()) return false;
  // لا نرد على محادثات مغلقة أو muted
  if (conv.status === 'closed') return false;

  // جلب القواعد الفعّالة مرتبة حسب الأولوية
  const rules = db.prepare(`
    SELECT * FROM inbox_automation_v4
    WHERE is_enabled = 1
    ORDER BY priority_order ASC, created_at ASC
  `).all();

  if (!rules || rules.length === 0) return false;

  for (const rule of rules) {
    // تحقق المنصة
    if (!_platformAllowed(rule.platforms, conv.platform)) continue;

    // تحليل الكلمات المفتاحية
    let keywords = [];
    try {
      keywords = typeof rule.keywords === 'string'
        ? JSON.parse(rule.keywords)
        : (rule.keywords || []);
    } catch (_) {
      continue;
    }

    // تحقق المطابقة
    if (!_matchesRule(text, rule.match_type, keywords)) continue;

    // تحقق apply_once_per_conv
    if (rule.apply_once_per_conv) {
      const alreadySent = db.prepare(`
        SELECT id FROM inbox_messages_v4
        WHERE conversation_id = ? AND direction = 'outbound'
          AND metadata LIKE ?
        LIMIT 1
      `).get(conv.id, `%"auto_rule_id":"${rule.id}"%`);
      if (alreadySent) continue; // تم الإرسال سابقاً لهذه المحادثة
    }

    // إنشاء رسالة صادرة تلقائية
    const msgId   = uuidv4();
    const sentAt  = new Date().toISOString();
    const delayMs = (rule.reply_delay_sec || 0) * 1000;

    const _doSend = () => {
      try {
        db.prepare(`
          INSERT INTO inbox_messages_v4
            (id, conversation_id, direction, content_type, content,
             status, sent_at, metadata, created_at)
          VALUES (?, ?, 'outbound', ?, ?, 'sent', ?, ?, ?)
        `).run(
          msgId,
          conv.id,
          rule.reply_type === 'template' ? 'template' : 'text',
          rule.reply_content,
          sentAt,
          JSON.stringify({ auto_reply: true, auto_rule_id: rule.id, rule_name: rule.name }),
          sentAt
        );

        // تحديث آخر رسالة في المحادثة
        db.prepare(`
          UPDATE inbox_conversations_v4
          SET last_message = ?, last_message_at = ?, updated_at = ?
          WHERE id = ?
        `).run(rule.reply_content, sentAt, sentAt, conv.id);

        // SSE broadcast
        const bc = _getBroadcast();
        if (bc) {
          bc(tenantId, 'message_new', {
            conversation_id: conv.id,
            message: {
              id: msgId,
              direction: 'outbound',
              content_type: rule.reply_type === 'template' ? 'template' : 'text',
              content: rule.reply_content,
              status: 'sent',
              sent_at: sentAt,
              metadata: { auto_reply: true, rule_name: rule.name },
            },
          });
          bc(tenantId, 'conv_update', { id: conv.id, last_message: rule.reply_content, last_message_at: sentAt });
        }

        // محاولة dispatch فعلية عبر الـ channel (WA / TG)
        const dispatch = _getDispatch();
        if (dispatch) {
          dispatch(db, conv, {
            content_type : rule.reply_type === 'template' ? 'template' : 'text',
            content      : rule.reply_content,
            msg_id       : msgId,
          }).catch(() => {
            // فشل الإرسال الخارجي — سنُحدّث الحالة
            db.prepare(`UPDATE inbox_messages_v4 SET status = 'failed' WHERE id = ?`).run(msgId);
          });
        }
      } catch (err) {
        console.error('[automation] processAutoReply send error:', err.message);
      }
    };

    // تطبيق التأخير لو موجود
    if (delayMs > 0) {
      setTimeout(_doSend, delayMs);
    } else {
      _doSend();
    }

    return true; // أول قاعدة تنطبق فقط
  }

  return false;
}

// ─── GET /automation/keywords ─────────────────────────────────────────────────
router.get('/automation/keywords', (req, res) => {
  try {
    const rows = req.db.prepare(`
      SELECT * FROM inbox_automation_v4
      ORDER BY priority_order ASC, created_at ASC
    `).all();

    // parse JSON fields
    const rules = rows.map(r => ({
      ...r,
      keywords  : _safeParse(r.keywords, []),
      platforms : _safeParse(r.platforms, []),
      is_enabled: r.is_enabled === 1,
      apply_once_per_conv: r.apply_once_per_conv === 1,
    }));

    res.json({ ok: true, rules });
  } catch (err) {
    console.error('[automation] GET keywords:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /automation/keywords ────────────────────────────────────────────────
router.post('/automation/keywords', (req, res) => {
  const { name, match_type, keywords, reply_type, reply_content,
          reply_delay_sec, platforms, apply_once_per_conv } = req.body;

  if (!name || !name.trim())
    return res.status(400).json({ error: 'name مطلوب' });
  if (!['exact', 'contains', 'starts', 'regex'].includes(match_type))
    return res.status(400).json({ error: 'match_type غير صالح' });
  if (!Array.isArray(keywords) || keywords.length === 0)
    return res.status(400).json({ error: 'keywords مطلوبة' });
  if (!['text', 'template'].includes(reply_type))
    return res.status(400).json({ error: 'reply_type غير صالح' });
  if (!reply_content || !reply_content.trim())
    return res.status(400).json({ error: 'reply_content مطلوب' });

  try {
    // حساب آخر priority_order
    const last = req.db.prepare(`
      SELECT MAX(priority_order) AS mo FROM inbox_automation_v4
    `).get();
    const nextOrder = (last?.mo ?? 0) + 1;

    const id  = uuidv4();
    const now = new Date().toISOString();

    req.db.prepare(`
      INSERT INTO inbox_automation_v4
        (id, name, is_enabled, match_type, keywords, reply_type,
         reply_content, reply_delay_sec, platforms, apply_once_per_conv,
         priority_order, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name.trim(), match_type,
      JSON.stringify(keywords),
      reply_type, reply_content.trim(),
      reply_delay_sec ?? 0,
      JSON.stringify(platforms || []),
      apply_once_per_conv ? 1 : 0,
      nextOrder, now, now
    );

    const rule = req.db.prepare(`SELECT * FROM inbox_automation_v4 WHERE id = ?`).get(id);
    res.json({ ok: true, rule: _formatRule(rule) });
  } catch (err) {
    console.error('[automation] POST keywords:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /automation/keywords/:id ─────────────────────────────────────────────
router.put('/automation/keywords/:id', (req, res) => {
  const { id } = req.params;
  const existing = req.db.prepare(`SELECT id FROM inbox_automation_v4 WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'قاعدة غير موجودة' });

  const allowed = ['name', 'match_type', 'keywords', 'reply_type',
                   'reply_content', 'reply_delay_sec', 'platforms',
                   'apply_once_per_conv', 'is_enabled'];
  const sets   = [];
  const params = [];

  for (const key of allowed) {
    if (!(key in req.body)) continue;
    let val = req.body[key];

    if (key === 'keywords' || key === 'platforms') {
      val = JSON.stringify(val);
    } else if (key === 'is_enabled' || key === 'apply_once_per_conv') {
      val = val ? 1 : 0;
    }
    sets.push(`${key} = ?`);
    params.push(val);
  }

  if (sets.length === 0)
    return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  try {
    req.db.prepare(`UPDATE inbox_automation_v4 SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const rule = req.db.prepare(`SELECT * FROM inbox_automation_v4 WHERE id = ?`).get(id);
    res.json({ ok: true, rule: _formatRule(rule) });
  } catch (err) {
    console.error('[automation] PUT keywords:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /automation/keywords/:id ──────────────────────────────────────────
router.delete('/automation/keywords/:id', (req, res) => {
  const { id } = req.params;
  const existing = req.db.prepare(`SELECT id FROM inbox_automation_v4 WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'قاعدة غير موجودة' });

  try {
    req.db.prepare(`DELETE FROM inbox_automation_v4 WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[automation] DELETE keywords:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /automation/keywords/:id/toggle ──────────────────────────────────────
router.put('/automation/keywords/:id/toggle', (req, res) => {
  const { id } = req.params;
  const rule = req.db.prepare(`SELECT id, is_enabled FROM inbox_automation_v4 WHERE id = ?`).get(id);
  if (!rule) return res.status(404).json({ error: 'قاعدة غير موجودة' });

  try {
    const newState = rule.is_enabled ? 0 : 1;
    req.db.prepare(`
      UPDATE inbox_automation_v4 SET is_enabled = ?, updated_at = ? WHERE id = ?
    `).run(newState, new Date().toISOString(), id);
    res.json({ ok: true, is_enabled: newState === 1 });
  } catch (err) {
    console.error('[automation] toggle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /automation/keywords/reorder ────────────────────────────────────────
// body: { order: ['id1', 'id2', ...] }
router.post('/automation/keywords/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0)
    return res.status(400).json({ error: 'order مطلوب' });

  try {
    const now = new Date().toISOString();
    const stmt = req.db.prepare(`
      UPDATE inbox_automation_v4 SET priority_order = ?, updated_at = ? WHERE id = ?
    `);
    const update = req.db.transaction(() => {
      order.forEach((id, idx) => stmt.run(idx + 1, now, id));
    });
    update();
    res.json({ ok: true });
  } catch (err) {
    console.error('[automation] reorder:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /automation/test ────────────────────────────────────────────────────
// اختبار قاعدة على نص معين بدون إرسال
router.post('/automation/test', (req, res) => {
  const { text, rule_id } = req.body;
  if (!text) return res.status(400).json({ error: 'text مطلوب' });

  try {
    let rules;
    if (rule_id) {
      const r = req.db.prepare(`SELECT * FROM inbox_automation_v4 WHERE id = ?`).get(rule_id);
      rules = r ? [r] : [];
    } else {
      rules = req.db.prepare(`
        SELECT * FROM inbox_automation_v4 WHERE is_enabled = 1
        ORDER BY priority_order ASC
      `).all();
    }

    const matches = [];
    for (const rule of rules) {
      const keywords = _safeParse(rule.keywords, []);
      if (_matchesRule(text, rule.match_type, keywords)) {
        matches.push({
          id          : rule.id,
          name        : rule.name,
          match_type  : rule.match_type,
          reply_content: rule.reply_content,
          would_trigger: true,
        });
        break; // أول قاعدة فقط تنطبق (كما في المحرك)
      }
    }

    res.json({
      ok         : true,
      text,
      matched    : matches.length > 0,
      match      : matches[0] || null,
      total_rules: rules.length,
    });
  } catch (err) {
    console.error('[automation] test:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _safeParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

function _formatRule(r) {
  if (!r) return null;
  return {
    ...r,
    keywords            : _safeParse(r.keywords, []),
    platforms           : _safeParse(r.platforms, []),
    is_enabled          : r.is_enabled === 1,
    apply_once_per_conv : r.apply_once_per_conv === 1,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// P4-3 Welcome + Away Messages
// ══════════════════════════════════════════════════════════════════════════════

/**
 * _ensureWelcomeAway — تأكد وجود صف الـ tenant أو أنشئ واحداً افتراضياً
 */
function _ensureWelcomeAway(db, tenantId) {
  db.prepare(`
    INSERT OR IGNORE INTO inbox_welcome_away_v4 (tenant_id)
    VALUES (?)
  `).run(tenantId);
  return db.prepare('SELECT * FROM inbox_welcome_away_v4 WHERE tenant_id = ?').get(tenantId);
}

function _fmtWA(r) {
  if (!r) return null;
  return {
    ...r,
    welcome_active : r.welcome_active === 1,
    away_active    : r.away_active    === 1,
    work_days      : _safeParse(r.work_days, [1,2,3,4,5]),
  };
}

// GET /api/inbox/automation/welcome-away
router.get('/automation/welcome-away', (req, res) => {
  try {
    const row = _ensureWelcomeAway(req.db, req.user.id);
    res.json({ ok: true, settings: _fmtWA(row) });
  } catch (err) {
    console.error('[automation] get welcome-away:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inbox/automation/welcome-away
router.put('/automation/welcome-away', (req, res) => {
  try {
    _ensureWelcomeAway(req.db, req.user.id);

    const {
      welcome_active, welcome_message,
      away_active, away_message,
      away_start, away_end,
      timezone, work_days, away_mode,
    } = req.body;

    const sets   = [];
    const params = [];

    if (welcome_active  !== undefined) { sets.push('welcome_active = ?');  params.push(welcome_active  ? 1 : 0); }
    if (welcome_message !== undefined) { sets.push('welcome_message = ?'); params.push(welcome_message ?? ''); }
    if (away_active     !== undefined) { sets.push('away_active = ?');     params.push(away_active     ? 1 : 0); }
    if (away_message    !== undefined) { sets.push('away_message = ?');    params.push(away_message    ?? ''); }
    if (away_start      !== undefined) { sets.push('away_start = ?');      params.push(away_start      ?? '22:00'); }
    if (away_end        !== undefined) { sets.push('away_end = ?');        params.push(away_end        ?? '09:00'); }
    if (timezone        !== undefined) { sets.push('timezone = ?');        params.push(timezone        ?? 'Africa/Cairo'); }
    if (work_days       !== undefined) { sets.push('work_days = ?');       params.push(JSON.stringify(work_days)); }
    if (away_mode       !== undefined) { sets.push('away_mode = ?');       params.push(away_mode       ?? 'schedule'); }

    if (!sets.length) return res.json({ ok: true, changed: false });

    sets.push('updated_at = unixepoch()');
    params.push(req.user.id);

    req.db.prepare(`
      UPDATE inbox_welcome_away_v4
      SET ${sets.join(', ')}
      WHERE tenant_id = ?
    `).run(...params);

    const updated = _fmtWA(req.db.prepare('SELECT * FROM inbox_welcome_away_v4 WHERE tenant_id = ?').get(req.user.id));
    res.json({ ok: true, settings: updated });
  } catch (err) {
    console.error('[automation] put welcome-away:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * processWelcomeAway — يُشغَّل عند بدء محادثة جديدة (isNew=true) أو رسالة واردة
 * @param {object}  db
 * @param {object}  conv      — محادثة inbox_conversations_v4
 * @param {boolean} isNew     — true لو المحادثة أُنشئت للتو → يفعّل Welcome
 * @param {number}  tenantId
 * @returns {boolean} true لو أرسل رداً
 */
async function processWelcomeAway(db, conv, isNew, tenantId) {
  try {
    const cfg = db.prepare('SELECT * FROM inbox_welcome_away_v4 WHERE tenant_id = ?').get(tenantId);
    if (!cfg) return false;

    const dispatch = _getDispatch();
    if (!dispatch) return false;

    // ── Welcome
    if (isNew && cfg.welcome_active && cfg.welcome_message) {
      await dispatch(db, conv, {
        id           : require('crypto').randomUUID(),
        direction    : 'outbound',
        message_type : 'text',
        content      : cfg.welcome_message,
        sender_name  : 'Bot',
        sent_at      : Date.now(),
      });
      return true;
    }

    // ── Away
    if (!isNew && cfg.away_active && cfg.away_message) {
      if (_isAwayNow(cfg)) {
        await dispatch(db, conv, {
          id           : require('crypto').randomUUID(),
          direction    : 'outbound',
          message_type : 'text',
          content      : cfg.away_message,
          sender_name  : 'Bot',
          sent_at      : Date.now(),
        });
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('[automation] processWelcomeAway:', err.message);
    return false;
  }
}

/**
 * _isAwayNow — تحقق إذا كان الوقت الحالي خارج ساعات العمل
 */
function _isAwayNow(cfg) {
  try {
    const tz       = cfg.timezone || 'Africa/Cairo';
    const workDays = _safeParse(cfg.work_days, [1,2,3,4,5]);
    const mode     = cfg.away_mode || 'schedule';

    if (mode === 'always') return true;

    const now      = new Date();
    const localStr = now.toLocaleString('en-US', {
      timeZone: tz, hour12: false,
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
    // تنسيق: "Mon, 14:30" أو "Mon 14:30"
    const cleaned  = localStr.replace(',', '');
    const parts    = cleaned.trim().split(/\s+/);
    const dayName  = parts[0];
    const timePart = parts[1] || '00:00';
    const [curH, curM] = timePart.split(':').map(Number);
    const curMins  = curH * 60 + curM;

    const DAY_MAP  = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const dayNum   = DAY_MAP[dayName] ?? now.getDay();

    const isWorkDay = workDays.includes(dayNum);

    const [startH, startM] = (cfg.away_start || '22:00').split(':').map(Number);
    const [endH,   endM  ] = (cfg.away_end   || '09:00').split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins   = endH   * 60 + endM;

    // overnight: away_start > away_end مثل 22:00 → 09:00
    const isInAwayTime = startMins > endMins
      ? (curMins >= startMins || curMins < endMins)
      : (curMins >= startMins && curMins < endMins);

    return !isWorkDay || isInAwayTime;
  } catch (_) {
    return false;
  }
}


module.exports                    = router;
module.exports.processAutoReply   = processAutoReply;
module.exports.processWelcomeAway = processWelcomeAway;
