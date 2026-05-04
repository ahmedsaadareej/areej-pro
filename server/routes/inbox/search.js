/**
 * inbox/search.js — Search Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * Endpoints:
 *   GET  /api/inbox/search          — Quick + Deep search
 *   GET  /api/inbox/search/suggest  — Autocomplete اقتراحات (أسماء + هواتف)
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * scope الصلاحية: موظف عادي يشوف محادثاته فقط
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

// ─── GET /search ─────────────────────────────────────────────────────────
/**
 * بحث شامل في المحادثات والرسائل
 *
 * Query params:
 *   q        {string}  — نص البحث (مطلوب, حد أدنى 2 حرف)
 *   mode     {string}  — "quick" (default) | "deep"
 *             quick: بحث في اسم العميل + رقم الهاتف + آخر رسالة
 *             deep:  كل ما سبق + نص جميع الرسائل
 *   platform {string}  — فلتر منصة اختياري
 *   status   {string}  — "open"|"closed"|"all" (default: "all")
 *   limit    {number}  — حد النتائج (default: 20, max: 50)
 *   offset   {number}  — للـ pagination (default: 0)
 */
router.get('/search', (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const mode     = req.query.mode === 'deep' ? 'deep' : 'quick';
    const platform = req.query.platform || '';
    const status   = req.query.status   || 'all';
    const limit    = Math.min(parseInt(req.query.limit)  || 20, 50);
    const offset   = Math.max(parseInt(req.query.offset) || 0, 0);

    if (q.length < 2) {
      return res.json({ results: [], total: 0, mode, q });
    }

    const db   = req.db;
    const user = req.inboxUser;
    const like = `%${q}%`;
    const { clause: scopeClause, params: scopeParams } = _scopeClause(user);

    // ─── بناء شروط المحادثة ──────────────────────────────────────────
    const convConditions = [];
    const convParams     = [];

    if (status !== 'all') {
      convConditions.push('c.status = ?');
      convParams.push(status);
    }
    if (platform) {
      convConditions.push('c.platform = ?');
      convParams.push(platform);
    }

    const convWhere = convConditions.length
      ? 'WHERE ' + convConditions.join(' AND ') + (scopeClause ? ' ' + scopeClause : '')
      : scopeClause ? 'WHERE 1=1 ' + scopeClause : '';

    // ─── Quick Search: اسم + هاتف + آخر رسالة ───────────────────────
    const quickSql = `
      SELECT
        c.id, c.platform, c.sender_name, c.sender_phone,
        c.status, c.priority, c.unread_count,
        c.last_message_text, c.last_message_at,
        c.assigned_to_id,
        tu.name AS agent_name,
        NULL   AS match_text,
        NULL   AS match_message_id,
        'conv' AS match_type
      FROM inbox_conversations_v4 c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      ${convWhere ? convWhere + ' AND' : 'WHERE'}
        (c.sender_name  LIKE ? OR
         c.sender_phone LIKE ? OR
         c.last_message_text LIKE ?)
      ORDER BY c.last_message_at DESC
      LIMIT ? OFFSET ?
    `;

    const quickCountSql = `
      SELECT COUNT(*) AS cnt
      FROM inbox_conversations_v4 c
      ${convWhere ? convWhere + ' AND' : 'WHERE'}
        (c.sender_name  LIKE ? OR
         c.sender_phone LIKE ? OR
         c.last_message_text LIKE ?)
    `;

    const quickP = [...convParams, ...scopeParams, like, like, like];

    if (mode === 'quick') {
      const rows  = db.prepare(quickSql).all([...quickP, limit, offset]);
      const total = db.prepare(quickCountSql).get(quickP)?.cnt || 0;

      return res.json({
        results: rows.map(r => _formatConvResult(r, q)),
        total,
        mode,
        q,
      });
    }

    // ─── Deep Search: كل ما سبق + نص الرسائل ───────────────────────

    // البحث في المحادثات أولاً (بدون تكرار في الرسائل)
    const convRows = db.prepare(quickSql).all([...quickP, 50, 0]);
    const matchedConvIds = new Set(convRows.map(r => r.id));

    // البحث في الرسائل
    const msgSql = `
      SELECT
        c.id, c.platform, c.sender_name, c.sender_phone,
        c.status, c.priority, c.unread_count,
        c.last_message_text, c.last_message_at,
        c.assigned_to_id,
        tu.name  AS agent_name,
        m.body   AS match_text,
        m.id     AS match_message_id,
        'message' AS match_type
      FROM inbox_messages_v4 m
      JOIN inbox_conversations_v4 c ON c.id = m.conversation_id
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      ${convWhere ? convWhere.replace('WHERE', 'WHERE m.conversation_id IS NOT NULL AND') + ' AND' : 'WHERE'}
        m.body LIKE ?
        AND m.message_type != 'note'
      ORDER BY m.created_at DESC
      LIMIT 100
    `;

    const msgParams = [...convParams, ...scopeParams, like];
    const msgRows   = db.prepare(msgSql).all(msgParams);

    // دمج النتائج: المحادثات أولاً ثم الرسائل من محادثات غير متطابقة
    const merged = [];
    const seenConvIds = new Set();

    // أضف نتائج المحادثات المباشرة
    for (const r of convRows) {
      if (seenConvIds.has(r.id)) continue;
      seenConvIds.add(r.id);
      merged.push(_formatConvResult(r, q));
    }

    // أضف نتائج الرسائل (من محادثات جديدة فقط)
    for (const r of msgRows) {
      if (seenConvIds.has(r.id)) continue;
      seenConvIds.add(r.id);
      merged.push(_formatMsgResult(r, q));
    }

    // أضف رسائل من محادثات موجودة كـ "match messages" (match إضافي)
    const extraMatches = [];
    for (const r of msgRows) {
      if (!seenConvIds.has(r.id) || !matchedConvIds.has(r.id)) continue;
      extraMatches.push(_formatMsgResult(r, q));
    }

    const allResults = [...merged, ...extraMatches];
    const paginated  = allResults.slice(offset, offset + limit);

    res.json({
      results: paginated,
      total:   allResults.length,
      mode,
      q,
    });

  } catch (err) {
    console.error('[inbox/search] error:', err.message);
    res.status(500).json({ error: 'search_error' });
  }
});

// ─── GET /search/suggest ──────────────────────────────────────────────────
/**
 * Autocomplete: أسماء عملاء + أرقام هواتف (للـ quick search dropdown)
 *
 * Query params:
 *   q     {string} — نص البحث (حد أدنى 1 حرف)
 *   limit {number} — default 8, max 15
 */
router.get('/search/suggest', (req, res) => {
  try {
    const q     = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 8, 15);

    if (!q) return res.json({ suggestions: [] });

    const db   = req.db;
    const user = req.inboxUser;
    const like = `%${q}%`;
    const { clause: scopeClause, params: scopeParams } = _scopeClause(user);

    const sql = `
      SELECT DISTINCT
        sender_name  AS name,
        sender_phone AS phone
      FROM inbox_conversations_v4 c
      ${scopeClause ? 'WHERE 1=1 ' + scopeClause : ''}
      ${scopeClause ? 'AND' : 'WHERE'}
        (sender_name LIKE ? OR sender_phone LIKE ?)
      ORDER BY last_message_at DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all([...scopeParams, like, like, limit]);

    res.json({
      suggestions: rows.map(r => ({
        label: r.name || r.phone,
        sub:   r.name ? r.phone : '',
        value: r.name || r.phone,
      })),
    });

  } catch (err) {
    console.error('[inbox/search/suggest] error:', err.message);
    res.status(500).json({ suggestions: [] });
  }
});

// ─── Formatters ───────────────────────────────────────────────────────────

/**
 * تنسيق نتيجة من المحادثة المباشرة
 */
function _formatConvResult(row, q) {
  return {
    conv_id:         row.id,
    platform:        row.platform,
    sender_name:     row.sender_name,
    sender_phone:    row.sender_phone,
    status:          row.status,
    priority:        row.priority,
    unread_count:    row.unread_count,
    last_message:    row.last_message_text,
    last_message_at: row.last_message_at,
    agent_name:      row.agent_name,
    match_type:      'conv',
    match_text:      null,
    match_message_id: null,
    highlight:       _highlight(row.sender_name || row.last_message_text || '', q),
  };
}

/**
 * تنسيق نتيجة من رسالة
 */
function _formatMsgResult(row, q) {
  return {
    conv_id:         row.id,
    platform:        row.platform,
    sender_name:     row.sender_name,
    sender_phone:    row.sender_phone,
    status:          row.status,
    priority:        row.priority,
    unread_count:    row.unread_count,
    last_message:    row.last_message_text,
    last_message_at: row.last_message_at,
    agent_name:      row.agent_name,
    match_type:      'message',
    match_text:      row.match_text,
    match_message_id: row.match_message_id,
    highlight:       _highlight(row.match_text || '', q),
  };
}

/**
 * استخراج snippet مع إبراز النص المطابق
 * يُرجع { before, match, after } أو null
 */
function _highlight(text, q) {
  if (!text || !q) return null;
  const lower  = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx    = lower.indexOf(qLower);
  if (idx === -1) return null;

  const snipStart = Math.max(0, idx - 30);
  const snipEnd   = Math.min(text.length, idx + q.length + 30);

  return {
    before: (snipStart > 0 ? '…' : '') + text.slice(snipStart, idx),
    match:  text.slice(idx, idx + q.length),
    after:  text.slice(idx + q.length, snipEnd) + (snipEnd < text.length ? '…' : ''),
  };
}

module.exports = router;
