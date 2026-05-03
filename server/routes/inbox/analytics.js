/**
 * inbox/analytics.js — Analytics & SLA Reports لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P3-6 SLA Tracking)
 *
 * Endpoints:
 *   GET /api/inbox/analytics/sla          — SLA overview (نسبة الالتزام + متوسطات)
 *   GET /api/inbox/analytics/agents        — أداء الموظفين (ردود + وقت استجابة + إغلاق)
 *   GET /api/inbox/analytics/platforms     — توزيع المحادثات على المنصات
 *   GET /api/inbox/analytics/overview      — أرقام عامة (inbox health)
 *
 * Query params مشتركة:
 *   ?from=YYYY-MM-DD  — بداية الفترة (افتراضي: آخر 30 يوم)
 *   ?to=YYYY-MM-DD    — نهاية الفترة
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { computeSLA, SLA_THRESHOLDS_SEC } = require('./conversations');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * تحويل تاريخ YYYY-MM-DD إلى Unix timestamp (بداية اليوم UTC)
 */
function _dateToTs(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
}

/**
 * استخراج نطاق الزمن من query params
 * @returns {{ fromTs: number, toTs: number, fromIso: string, toIso: string }}
 */
function _parseRange(query) {
  const toDate   = query.to   || new Date().toISOString().slice(0, 10);
  const fromDate = query.from || (() => {
    const d = new Date(toDate);
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  return {
    fromTs:  _dateToTs(fromDate),
    toTs:    _dateToTs(toDate) + 86400 - 1,  // نهاية اليوم
    fromIso: fromDate,
    toIso:   toDate,
  };
}

/**
 * حساب متوسط مصفوفة أرقام (تجاهل null)
 */
function _avg(arr) {
  const valid = arr.filter(v => v != null && v > 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/**
 * تنسيق ثوانٍ إلى نص مقروء
 * مثال: 3660 → "1س 1د"
 */
function _fmtSec(sec) {
  if (sec == null) return null;
  if (sec < 60)   return `${sec}ث`;
  if (sec < 3600) return `${Math.round(sec / 60)}د`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}س ${m}د` : `${h}س`;
}

// ─── GET /api/inbox/analytics/overview ───────────────────────────────────────

router.get('/overview', (req, res) => {
  try {
    const db             = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // إجماليات المحادثات في الفترة
    const total = db.prepare(`
      SELECT COUNT(*) as n FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
    `).get(fromTs, toTs).n;

    const closed = db.prepare(`
      SELECT COUNT(*) as n FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ? AND status = 'closed'
    `).get(fromTs, toTs).n;

    const open = db.prepare(`
      SELECT COUNT(*) as n FROM inbox_conversations_v4
      WHERE status IN ('open', 'waiting', 'snoozed')
    `).get().n;

    // متوسط وقت الاستجابة الأول
    const avgFirstResponse = db.prepare(`
      SELECT AVG(first_response_at - first_message_at) as avg_sec
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
        AND first_response_at IS NOT NULL
        AND first_message_at  IS NOT NULL
        AND first_response_at > first_message_at
    `).get(fromTs, toTs).avg_sec;

    // متوسط وقت الإغلاق
    const avgResolution = db.prepare(`
      SELECT AVG(resolved_at - first_message_at) as avg_sec
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
        AND resolved_at IS NOT NULL
        AND first_message_at IS NOT NULL
        AND resolved_at > first_message_at
    `).get(fromTs, toTs).avg_sec;

    // إجمالي الرسائل المرسلة (صادرة) في الفترة
    const totalOutbound = db.prepare(`
      SELECT COUNT(*) as n FROM inbox_messages_v4
      WHERE direction = 'outbound'
        AND sent_at BETWEEN ? AND ?
    `).get(fromTs, toTs).n;

    // إجمالي الرسائل الواردة في الفترة
    const totalInbound = db.prepare(`
      SELECT COUNT(*) as n FROM inbox_messages_v4
      WHERE direction = 'in'
        AND sent_at BETWEEN ? AND ?
    `).get(fromTs, toTs).n;

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      totals: {
        conversations:     total,
        closed,
        open_now:          open,
        resolution_rate:   total > 0 ? Math.round((closed / total) * 100) : 0,
        messages_inbound:  totalInbound,
        messages_outbound: totalOutbound,
      },
      averages: {
        first_response_sec:    avgFirstResponse ? Math.round(avgFirstResponse) : null,
        first_response_fmt:    _fmtSec(avgFirstResponse ? Math.round(avgFirstResponse) : null),
        resolution_sec:        avgResolution ? Math.round(avgResolution) : null,
        resolution_fmt:        _fmtSec(avgResolution ? Math.round(avgResolution) : null),
      },
    });
  } catch (e) {
    console.error('[inbox/analytics/overview]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/sla ────────────────────────────────────────────

router.get('/sla', (req, res) => {
  try {
    const db             = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // جلب المحادثات في الفترة مع بيانات SLA
    const convs = db.prepare(`
      SELECT id, priority, status,
             first_message_at, first_response_at, resolved_at
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
    `).all(fromTs, toTs);

    // ── حساب SLA لكل محادثة ──────────────────────────────────────────────
    const stats = {
      total: convs.length,
      first_response: { met: 0, breached: 0, pending: 0 },
      resolution:     { met: 0, breached: 0, pending: 0 },
      by_priority:    {},
    };

    const responseTimes  = [];
    const resolutionTimes = [];

    for (const conv of convs) {
      const sla = computeSLA(conv);

      // عدّادات first_response
      stats.first_response[sla.first_response_status]++;

      // عدّادات resolution
      stats.resolution[sla.resolution_status]++;

      // أوقات للمتوسط
      if (sla.first_response_sec != null) responseTimes.push(sla.first_response_sec);
      if (sla.resolution_sec     != null) resolutionTimes.push(sla.resolution_sec);

      // تجميع حسب الأولوية
      const p = conv.priority || 'normal';
      if (!stats.by_priority[p]) {
        stats.by_priority[p] = {
          total: 0, met: 0, breached: 0, pending: 0,
          threshold_sec: SLA_THRESHOLDS_SEC[p],
          threshold_fmt: _fmtSec(SLA_THRESHOLDS_SEC[p]),
        };
      }
      stats.by_priority[p].total++;
      stats.by_priority[p][sla.first_response_status]++;
    }

    // ── نسب الالتزام ──────────────────────────────────────────────────────
    const responded = stats.first_response.met + stats.first_response.breached;
    const resolved  = stats.resolution.met + stats.resolution.breached;

    const avgFirstResponse = _avg(responseTimes);
    const avgResolution    = _avg(resolutionTimes);

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      summary: {
        total_conversations:    stats.total,
        first_response_met_pct: responded > 0
          ? Math.round((stats.first_response.met / responded) * 100) : null,
        resolution_met_pct:     resolved > 0
          ? Math.round((stats.resolution.met / resolved) * 100) : null,
        avg_first_response_sec: avgFirstResponse,
        avg_first_response_fmt: _fmtSec(avgFirstResponse),
        avg_resolution_sec:     avgResolution,
        avg_resolution_fmt:     _fmtSec(avgResolution),
      },
      first_response: stats.first_response,
      resolution:     stats.resolution,
      by_priority:    stats.by_priority,
    });
  } catch (e) {
    console.error('[inbox/analytics/sla]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/agents ─────────────────────────────────────────

router.get('/agents', (req, res) => {
  try {
    const db             = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // مجموع المحادثات + المغلقة + المتوسطات لكل موظف
    const agentStats = db.prepare(`
      SELECT
        c.assigned_to_id            AS agent_id,
        tu.name                     AS agent_name,
        COUNT(*)                    AS total_convs,
        SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) AS closed_convs,
        AVG(
          CASE WHEN c.first_response_at IS NOT NULL
                AND c.first_message_at IS NOT NULL
                AND c.first_response_at > c.first_message_at
               THEN c.first_response_at - c.first_message_at
          END
        ) AS avg_first_response_sec,
        AVG(
          CASE WHEN c.resolved_at IS NOT NULL
                AND c.first_message_at IS NOT NULL
                AND c.resolved_at > c.first_message_at
               THEN c.resolved_at - c.first_message_at
          END
        ) AS avg_resolution_sec,
        COUNT(CASE WHEN c.csat_score IS NOT NULL THEN 1 END) AS csat_count,
        AVG(c.csat_score) AS avg_csat
      FROM inbox_conversations_v4 c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      WHERE c.created_at BETWEEN ? AND ?
        AND c.assigned_to_id IS NOT NULL
      GROUP BY c.assigned_to_id
      ORDER BY total_convs DESC
    `).all(fromTs, toTs);

    // عدد الرسائل الصادرة لكل موظف في الفترة
    const msgCounts = db.prepare(`
      SELECT agent_id, COUNT(*) as msg_count
      FROM inbox_messages_v4
      WHERE direction = 'outbound'
        AND sent_at BETWEEN ? AND ?
        AND agent_id IS NOT NULL
      GROUP BY agent_id
    `).all(fromTs, toTs);
    const msgMap = Object.fromEntries(msgCounts.map(r => [r.agent_id, r.msg_count]));

    const agents = agentStats.map(row => ({
      agent_id:               row.agent_id,
      agent_name:             row.agent_name || `موظف #${row.agent_id}`,
      total_convs:            row.total_convs,
      closed_convs:           row.closed_convs,
      resolution_rate:        row.total_convs > 0
        ? Math.round((row.closed_convs / row.total_convs) * 100) : 0,
      messages_sent:          msgMap[row.agent_id] || 0,
      avg_first_response_sec: row.avg_first_response_sec ? Math.round(row.avg_first_response_sec) : null,
      avg_first_response_fmt: _fmtSec(row.avg_first_response_sec ? Math.round(row.avg_first_response_sec) : null),
      avg_resolution_sec:     row.avg_resolution_sec ? Math.round(row.avg_resolution_sec) : null,
      avg_resolution_fmt:     _fmtSec(row.avg_resolution_sec ? Math.round(row.avg_resolution_sec) : null),
      csat_count:             row.csat_count || 0,
      avg_csat:               row.avg_csat   ? Math.round(row.avg_csat * 10) / 10 : null,
    }));

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      agents,
    });
  } catch (e) {
    console.error('[inbox/analytics/agents]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/platforms ──────────────────────────────────────

router.get('/platforms', (req, res) => {
  try {
    const db             = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    const rows = db.prepare(`
      SELECT
        platform,
        COUNT(*) AS total_convs,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_convs,
        SUM(CASE WHEN status IN ('open','waiting','snoozed') THEN 1 ELSE 0 END) AS open_convs,
        AVG(
          CASE WHEN first_response_at IS NOT NULL
                AND first_message_at IS NOT NULL
                AND first_response_at > first_message_at
               THEN first_response_at - first_message_at
          END
        ) AS avg_first_response_sec
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
      GROUP BY platform
      ORDER BY total_convs DESC
    `).all(fromTs, toTs);

    const platforms = rows.map(row => ({
      platform:               row.platform,
      total_convs:            row.total_convs,
      closed_convs:           row.closed_convs,
      open_convs:             row.open_convs,
      resolution_rate:        row.total_convs > 0
        ? Math.round((row.closed_convs / row.total_convs) * 100) : 0,
      avg_first_response_sec: row.avg_first_response_sec ? Math.round(row.avg_first_response_sec) : null,
      avg_first_response_fmt: _fmtSec(row.avg_first_response_sec ? Math.round(row.avg_first_response_sec) : null),
    }));

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      platforms,
    });
  } catch (e) {
    console.error('[inbox/analytics/platforms]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
