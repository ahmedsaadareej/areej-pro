/**
 * inbox/analytics.js — Analytics & SLA Reports لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P6-1 Analytics Dashboard)
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

// ─── GET /api/inbox/analytics/volume ────────────────────────────────────────
// حجم المحادثات يومياً خلال الفترة (للرسم البياني)

router.get('/volume', (req, res) => {
  try {
    const db = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // محادثات جديدة لكل يوم
    const rows = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN platform = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp,
        SUM(CASE WHEN platform = 'telegram' THEN 1 ELSE 0 END) AS telegram,
        SUM(CASE WHEN platform = 'instagram' THEN 1 ELSE 0 END) AS instagram
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day ASC
    `).all(fromTs, toTs);

    res.json({ ok: true, period: { from: fromIso, to: toIso }, volume: rows });
  } catch (e) {
    console.error('[inbox/analytics/volume]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/hourly ─────────────────────────────────────────
// توزيع الرسائل الواردة على ساعات اليوم (لمعرفة أوقات الذروة)

router.get('/hourly', (req, res) => {
  try {
    const db = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    const rows = db.prepare(`
      SELECT
        CAST(strftime('%H', sent_at, 'unixepoch') AS INTEGER) AS hour,
        COUNT(*) AS count
      FROM inbox_messages_v4
      WHERE direction = 'in'
        AND sent_at BETWEEN ? AND ?
      GROUP BY hour
      ORDER BY hour ASC
    `).all(fromTs, toTs);

    // إملأ الساعات الفارغة بـ 0
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: 0,
    }));
    rows.forEach(r => { byHour[r.hour].count = r.count; });

    res.json({ ok: true, period: { from: fromIso, to: toIso }, hourly: byHour });
  } catch (e) {
    console.error('[inbox/analytics/hourly]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/agents/:id ─────────────────────────────────
// تفاصيل أداء موظف واحد: تطور يومي + توزيع منصات + آخر محادثات

router.get('/agents/:id', (req, res) => {
  try {
    const db       = req.db;
    const agentId  = parseInt(req.params.id, 10);
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // ─ بيانات الموظف ────────────────────────────────────────────
    const agent = db.prepare(`
      SELECT id, name, email, role FROM tenant_users WHERE id = ?
    `).get(agentId);
    if (!agent) return res.status(404).json({ ok: false, error: 'agent not found' });

    // ─ ملخص المحادثات ──────────────────────────────────────
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_convs,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_convs,
        AVG(
          CASE WHEN first_response_at IS NOT NULL
                AND first_message_at IS NOT NULL
                AND first_response_at > first_message_at
               THEN first_response_at - first_message_at END
        ) AS avg_first_response_sec,
        AVG(
          CASE WHEN resolved_at IS NOT NULL
                AND first_message_at IS NOT NULL
                AND resolved_at > first_message_at
               THEN resolved_at - first_message_at END
        ) AS avg_resolution_sec
      FROM inbox_conversations_v4
      WHERE assigned_to_id = ?
        AND created_at BETWEEN ? AND ?
    `).get(agentId, fromTs, toTs);

    // ─ عدد الرسائل الصادرة ────────────────────────────────
    const msgCount = db.prepare(`
      SELECT COUNT(*) AS n FROM inbox_messages_v4
      WHERE agent_id = ? AND direction = 'outbound'
        AND sent_at BETWEEN ? AND ?
    `).get(agentId, fromTs, toTs).n;

    // ─ تطور يومي (محادثات + مغلقة كل يوم) ────────────────────
    const daily = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM inbox_conversations_v4
      WHERE assigned_to_id = ?
        AND created_at BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day ASC
    `).all(agentId, fromTs, toTs);

    // ─ توزيع المنصات ───────────────────────────────────────────
    const platforms = db.prepare(`
      SELECT platform, COUNT(*) AS n
      FROM inbox_conversations_v4
      WHERE assigned_to_id = ?
        AND created_at BETWEEN ? AND ?
      GROUP BY platform
      ORDER BY n DESC
    `).all(agentId, fromTs, toTs);

    // ─ توزيع الأولوية ──────────────────────────────────────────
    const priorities = db.prepare(`
      SELECT priority, COUNT(*) AS n
      FROM inbox_conversations_v4
      WHERE assigned_to_id = ?
        AND created_at BETWEEN ? AND ?
      GROUP BY priority
      ORDER BY n DESC
    `).all(agentId, fromTs, toTs);

    // ─ آخر 10 محادثات ─────────────────────────────────────────────
    const recentConvs = db.prepare(`
      SELECT id, contact_name, platform, status, priority,
             first_message_at, resolved_at, created_at
      FROM inbox_conversations_v4
      WHERE assigned_to_id = ?
        AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(agentId, fromTs, toTs);

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      agent: {
        id:   agent.id,
        name: agent.name,
        role: agent.role,
      },
      summary: {
        total_convs:            summary.total_convs || 0,
        closed_convs:           summary.closed_convs || 0,
        resolution_rate:        summary.total_convs > 0
          ? Math.round((summary.closed_convs / summary.total_convs) * 100) : 0,
        messages_sent:          msgCount,
        avg_first_response_sec: summary.avg_first_response_sec
          ? Math.round(summary.avg_first_response_sec) : null,
        avg_first_response_fmt: _fmtSec(summary.avg_first_response_sec
          ? Math.round(summary.avg_first_response_sec) : null),
        avg_resolution_sec:     summary.avg_resolution_sec
          ? Math.round(summary.avg_resolution_sec) : null,
        avg_resolution_fmt:     _fmtSec(summary.avg_resolution_sec
          ? Math.round(summary.avg_resolution_sec) : null),
      },
      daily,
      platforms,
      priorities,
      recent_convs: recentConvs,
    });
  } catch (e) {
    console.error('[inbox/analytics/agents/:id]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/platforms/:platform ──────────────────────────────
// تفصيل منصة واحدة: تطور يومي + أداء الموظفين على هذه المنصة + توزيع الأولوية

router.get('/platforms/:platform', (req, res) => {
  try {
    const db       = req.db;
    const platform = req.params.platform;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // ملخص عام
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'closed'                      THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN status IN ('open','waiting','snoozed') THEN 1 ELSE 0 END) AS open_now,
        AVG(
          CASE WHEN first_response_at IS NOT NULL
                AND first_message_at  IS NOT NULL
                AND first_response_at > first_message_at
               THEN first_response_at - first_message_at END
        ) AS avg_first_response_sec,
        AVG(
          CASE WHEN resolved_at IS NOT NULL
                AND first_message_at IS NOT NULL
                AND resolved_at > first_message_at
               THEN resolved_at - first_message_at END
        ) AS avg_resolution_sec
      FROM inbox_conversations_v4
      WHERE platform = ? AND created_at BETWEEN ? AND ?
    `).get(platform, fromTs, toTs);

    // تطور يومي
    const daily = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM inbox_conversations_v4
      WHERE platform = ? AND created_at BETWEEN ? AND ?
      GROUP BY day ORDER BY day ASC
    `).all(platform, fromTs, toTs);

    // توزيع الأولوية
    const priorities = db.prepare(`
      SELECT priority, COUNT(*) AS n
      FROM inbox_conversations_v4
      WHERE platform = ? AND created_at BETWEEN ? AND ?
      GROUP BY priority ORDER BY n DESC
    `).all(platform, fromTs, toTs);

    // أداء الموظفين على هذه المنصة
    const agents = db.prepare(`
      SELECT
        c.assigned_to_id AS agent_id,
        tu.name          AS agent_name,
        COUNT(*)         AS total,
        SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM inbox_conversations_v4 c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      WHERE c.platform = ? AND c.created_at BETWEEN ? AND ?
        AND c.assigned_to_id IS NOT NULL
      GROUP BY c.assigned_to_id
      ORDER BY total DESC
      LIMIT 10
    `).all(platform, fromTs, toTs);

    res.json({
      ok: true,
      period:   { from: fromIso, to: toIso },
      platform,
      summary: {
        total:                  summary.total || 0,
        closed:                 summary.closed || 0,
        open_now:               summary.open_now || 0,
        resolution_rate:        summary.total > 0
          ? Math.round((summary.closed / summary.total) * 100) : 0,
        avg_first_response_sec: summary.avg_first_response_sec
          ? Math.round(summary.avg_first_response_sec) : null,
        avg_first_response_fmt: _fmtSec(summary.avg_first_response_sec
          ? Math.round(summary.avg_first_response_sec) : null),
        avg_resolution_sec:     summary.avg_resolution_sec
          ? Math.round(summary.avg_resolution_sec) : null,
        avg_resolution_fmt:     _fmtSec(summary.avg_resolution_sec
          ? Math.round(summary.avg_resolution_sec) : null),
      },
      daily,
      priorities,
      agents,
    });
  } catch (e) {
    console.error('[inbox/analytics/platforms/:platform]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/sla/detail ────────────────────────────────────
// تقرير SLA تفصيلي: breakdown كامل + اتجاه يومي + أسوأ/أفضل محادثات

router.get('/sla/detail', (req, res) => {
  try {
    const db = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // جلب كل المحادثات مع بيانات SLA
    const convs = db.prepare(`
      SELECT id, priority, status, platform,
             first_message_at, first_response_at, resolved_at, created_at
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
    `).all(fromTs, toTs);

    // ── تجميع يومي ──────────────────────────────────────────────────────────
    const dailyMap = {};
    for (const conv of convs) {
      const day = new Date(conv.created_at * 1000).toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { day, total: 0, met: 0, breached: 0 };
      dailyMap[day].total++;
      const sla = computeSLA(conv);
      if (sla.first_response_status === 'met')      dailyMap[day].met++;
      else if (sla.first_response_status === 'breached') dailyMap[day].breached++;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day))
      .map(d => ({
        ...d,
        compliance_pct: (d.met + d.breached) > 0
          ? Math.round((d.met / (d.met + d.breached)) * 100) : null,
      }));

    // ── أسوأ 10 محادثات (أطول وقت استجابة) ──────────────────────────────────
    const worst = db.prepare(`
      SELECT id, contact_name, platform, priority,
             (first_response_at - first_message_at) AS response_sec
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
        AND first_response_at IS NOT NULL
        AND first_message_at  IS NOT NULL
        AND first_response_at > first_message_at
      ORDER BY response_sec DESC
      LIMIT 10
    `).all(fromTs, toTs).map(r => ({
      ...r,
      response_fmt: _fmtSec(r.response_sec),
    }));

    // ── SLA بالمنصة ──────────────────────────────────────────────────────────
    const byPlatform = {};
    for (const conv of convs) {
      const p = conv.platform || 'unknown';
      if (!byPlatform[p]) byPlatform[p] = { platform: p, total: 0, met: 0, breached: 0 };
      byPlatform[p].total++;
      const sla = computeSLA(conv);
      if (sla.first_response_status === 'met')      byPlatform[p].met++;
      else if (sla.first_response_status === 'breached') byPlatform[p].breached++;
    }
    const platformSLA = Object.values(byPlatform).map(p => ({
      ...p,
      compliance_pct: (p.met + p.breached) > 0
        ? Math.round((p.met / (p.met + p.breached)) * 100) : null,
    })).sort((a, b) => b.total - a.total);

    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      daily,
      worst_response: worst,
      by_platform: platformSLA,
    });
  } catch (e) {
    console.error('[inbox/analytics/sla/detail]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/analytics/csat ──────────────────────────────────────────────
// تحليل CSAT: توزيع التقييمات + تطور يومي + تفصيل بالموظف

router.get('/csat', (req, res) => {
  try {
    const db = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);

    // ─ ملخص عام ─────────────────────────────────────────────────────────
    const summary = db.prepare(`
      SELECT
        COUNT(*)                                     AS rated,
        AVG(csat_score)                              AS avg_score,
        SUM(CASE WHEN csat_score >= 4 THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN csat_score = 3  THEN 1 ELSE 0 END) AS neutral,
        SUM(CASE WHEN csat_score <= 2 THEN 1 ELSE 0 END) AS negative
      FROM inbox_conversations_v4
      WHERE csat_score IS NOT NULL
        AND created_at BETWEEN ? AND ?
    `).get(fromTs, toTs);

    // ─ توزيع النجوم (1☓5) ────────────────────────────────────────────────
    const distribution = db.prepare(`
      SELECT csat_score AS score, COUNT(*) AS n
      FROM inbox_conversations_v4
      WHERE csat_score IS NOT NULL
        AND created_at BETWEEN ? AND ?
      GROUP BY csat_score
      ORDER BY csat_score DESC
    `).all(fromTs, toTs);

    // ─ تطور يومي ──────────────────────────────────────────────────────────
    const daily = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') AS day,
        COUNT(*)         AS rated,
        AVG(csat_score)  AS avg_score,
        SUM(CASE WHEN csat_score >= 4 THEN 1 ELSE 0 END) AS positive
      FROM inbox_conversations_v4
      WHERE csat_score IS NOT NULL
        AND created_at BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day ASC
    `).all(fromTs, toTs).map(r => ({
      day:       r.day,
      rated:     r.rated,
      avg_score: r.avg_score ? Math.round(r.avg_score * 10) / 10 : null,
      positive:  r.positive,
      positive_pct: r.rated > 0 ? Math.round((r.positive / r.rated) * 100) : 0,
    }));

    // ─ تفصيل بالموظف ─────────────────────────────────────────────────────────
    const byAgent = db.prepare(`
      SELECT
        c.assigned_to_id AS agent_id,
        tu.name          AS agent_name,
        COUNT(*)         AS rated,
        AVG(c.csat_score) AS avg_score,
        SUM(CASE WHEN c.csat_score >= 4 THEN 1 ELSE 0 END) AS positive
      FROM inbox_conversations_v4 c
      LEFT JOIN tenant_users tu ON tu.id = c.assigned_to_id
      WHERE c.csat_score IS NOT NULL
        AND c.created_at BETWEEN ? AND ?
        AND c.assigned_to_id IS NOT NULL
      GROUP BY c.assigned_to_id
      ORDER BY avg_score DESC
    `).all(fromTs, toTs).map(r => ({
      agent_id:     r.agent_id,
      agent_name:   r.agent_name || `موظف #${r.agent_id}`,
      rated:        r.rated,
      avg_score:    r.avg_score ? Math.round(r.avg_score * 10) / 10 : null,
      positive:     r.positive,
      positive_pct: r.rated > 0 ? Math.round((r.positive / r.rated) * 100) : 0,
    }));

    const rated = summary.rated || 0;
    res.json({
      ok: true,
      period: { from: fromIso, to: toIso },
      summary: {
        rated,
        avg_score:    summary.avg_score ? Math.round(summary.avg_score * 10) / 10 : null,
        positive:     summary.positive  || 0,
        neutral:      summary.neutral   || 0,
        negative:     summary.negative  || 0,
        positive_pct: rated > 0 ? Math.round(((summary.positive || 0) / rated) * 100) : null,
        negative_pct: rated > 0 ? Math.round(((summary.negative || 0) / rated) * 100) : null,
      },
      distribution,
      daily,
      by_agent: byAgent,
    });
  } catch (e) {
    console.error('[inbox/analytics/csat]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

// ─── GET /api/inbox/analytics/sentiment ──────────────────────────────────────
// P7-4: تحليل مشاعر رسائل العملاء الواردة باستخدام الذكاء الاصطناعي
//
// الاستراتيجية:
//   - نجلب آخر N رسالة واردة (inbound) من المحادثات المغلقة في الفترة
//   - نرسلها دفعة واحدة للـ AI للتصنيف (positive / neutral / negative)
//   - نحفظ النتيجة في metadata الرسالة لتجنب إعادة الحساب
//   - نُعيد ملخصاً + توزيع يومي + top negative conversations
//
// Query params:
//   ?from=YYYY-MM-DD  ?to=YYYY-MM-DD  ?limit=200 (max رسائل تُحلَّل)

router.get('/sentiment', async (req, res) => {
  try {
    const db = req.db;
    const { fromTs, toTs, fromIso, toIso } = _parseRange(req.query);
    const msgLimit = Math.min(parseInt(req.query.limit || '200', 10), 500);

    // 1) جلب الرسائل الواردة غير المحلَّلة + المحلَّلة سابقاً
    const messages = db.prepare(`
      SELECT
        m.id, m.conversation_id, m.content, m.created_at,
        m.metadata,
        c.contact_name
      FROM inbox_messages_v4 m
      JOIN inbox_conversations_v4 c ON c.id = m.conversation_id
      WHERE m.direction = 'inbound'
        AND m.content IS NOT NULL AND m.content != ''
        AND m.content_type IN ('text', 'image', 'document')
        AND m.created_at BETWEEN ? AND ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(fromTs, toTs, msgLimit);

    if (!messages.length) {
      return res.json({
        ok: true, period: { from: fromIso, to: toIso },
        summary: { total: 0, positive: 0, neutral: 0, negative: 0 },
        daily: [], top_negative: [],
      });
    }

    // 2) فصل المحلَّلة مسبقاً (تحتوي على sentiment في metadata) عن الجديدة
    const toAnalyze = [];
    const alreadyDone = [];

    for (const msg of messages) {
      let meta = {};
      try { meta = JSON.parse(msg.metadata || '{}'); } catch (_) {}
      if (meta.sentiment) {
        alreadyDone.push({ id: msg.id, conversation_id: msg.conversation_id,
          sentiment: meta.sentiment, created_at: msg.created_at });
      } else {
        toAnalyze.push(msg);
      }
    }

    // 3) تحليل الرسائل الجديدة — batch بحجم 30 رسالة لتوفير tokens
    const BATCH_SIZE = 30;
    const newResults = [];

    if (toAnalyze.length > 0) {
      let _aiModule = null;
      try { _aiModule = require('./ai'); } catch (_) {}

      // نستخدم _callAI مباشرة عبر require الـ ai module
      // لكن لأن ai.js = express router، نستدعي AI مستقلاً هنا
      const https   = require('https');
      const http    = require('http');
      const urlMod  = require('url');
      require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

      const AI_KEY   = process.env.OPENAI_API_KEY || '';
      const AI_BASE  = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

      /**
       * batch sentiment: يرسل مصفوفة نصوص ويعيد مصفوفة 'positive'|'neutral'|'negative'
       */
      async function _batchSentiment(texts) {
        if (!AI_KEY) return texts.map(() => 'neutral');

        const numbered = texts.map((t, i) => `${i + 1}. ${t.slice(0, 120)}`).join('\n');
        const body = JSON.stringify({
          model: AI_MODEL,
          messages: [
            {
              role: 'system',
              content: `صنّف مشاعر كل رسالة عميل بكلمة واحدة فقط: positive أو neutral أو negative.
أجب بـ JSON array فقط بهذا الشكل: ["positive","neutral","negative",...]
عدد العناصر يجب أن يساوي عدد الرسائل المُدخَلة.
لا تضف أي شرح أو نص خارج الـ JSON.`,
            },
            { role: 'user', content: numbered },
          ],
          max_tokens: texts.length * 10 + 20,
          temperature: 0,
        });

        return new Promise((resolve) => {
          const parsed  = urlMod.parse(`${AI_BASE}/chat/completions`);
          const isHttps = parsed.protocol === 'https:';
          const lib     = isHttps ? https : http;

          const opts = {
            hostname: parsed.hostname,
            port:     parsed.port || (isHttps ? 443 : 80),
            path:     parsed.path,
            method:   'POST',
            headers: {
              'Content-Type':   'application/json',
              'Authorization':  `Bearer ${AI_KEY}`,
              'Content-Length': Buffer.byteLength(body),
            },
            timeout: 30000,
          };

          const reqAI = lib.request(opts, aiRes => {
            let data = '';
            aiRes.on('data', c => { data += c; });
            aiRes.on('end', () => {
              try {
                const json = JSON.parse(data);
                const raw  = json.choices?.[0]?.message?.content?.trim() || '[]';
                const match = raw.match(/\[.*?\]/s);
                if (match) {
                  const arr = JSON.parse(match[0]);
                  // تطبيع وضمان الطول
                  const normalized = arr.map(s => {
                    const v = String(s).toLowerCase().trim();
                    return ['positive','neutral','negative'].includes(v) ? v : 'neutral';
                  });
                  // تأكد أن الطول مطابق
                  while (normalized.length < texts.length) normalized.push('neutral');
                  resolve(normalized.slice(0, texts.length));
                } else {
                  resolve(texts.map(() => 'neutral'));
                }
              } catch (_) {
                resolve(texts.map(() => 'neutral'));
              }
            });
          });
          reqAI.on('timeout', () => { reqAI.destroy(); resolve(texts.map(() => 'neutral')); });
          reqAI.on('error',   () => resolve(texts.map(() => 'neutral')));
          reqAI.write(body);
          reqAI.end();
        });
      }

      // تحليل على batches
      for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
        const batch  = toAnalyze.slice(i, i + BATCH_SIZE);
        const texts  = batch.map(m => m.content || '');
        const labels = await _batchSentiment(texts);

        for (let j = 0; j < batch.length; j++) {
          const msg       = batch[j];
          const sentiment = labels[j] || 'neutral';

          // حفظ في metadata لتجنب إعادة الحساب لاحقاً
          try {
            let meta = {};
            try { meta = JSON.parse(msg.metadata || '{}'); } catch (_) {}
            meta.sentiment = sentiment;
            db.prepare('UPDATE inbox_messages_v4 SET metadata = ? WHERE id = ?')
              .run(JSON.stringify(meta), msg.id);
          } catch (_) {}

          newResults.push({ id: msg.id, conversation_id: msg.conversation_id,
            sentiment, created_at: msg.created_at });
        }
      }
    }

    // 4) دمج النتائج
    const all = [...alreadyDone, ...newResults];

    // 5) ملخص عام
    let positive = 0, neutral = 0, negative = 0;
    for (const r of all) {
      if      (r.sentiment === 'positive') positive++;
      else if (r.sentiment === 'negative') negative++;
      else                                 neutral++;
    }
    const total = all.length;

    // 6) توزيع يومي
    const byDay = {};
    for (const r of all) {
      const day = new Date(r.created_at * 1000).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { day, positive: 0, neutral: 0, negative: 0, total: 0 };
      byDay[day][r.sentiment]++;
      byDay[day].total++;
    }
    const daily = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day))
      .map(d => ({
        ...d,
        positive_pct: d.total > 0 ? Math.round((d.positive / d.total) * 100) : 0,
        negative_pct: d.total > 0 ? Math.round((d.negative / d.total) * 100) : 0,
      }));

    // 7) أعلى محادثات سلبية (top_negative)
    const negByConv = {};
    for (const r of all.filter(r => r.sentiment === 'negative')) {
      negByConv[r.conversation_id] = (negByConv[r.conversation_id] || 0) + 1;
    }
    const topNegIds = Object.entries(negByConv)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const topNegConvs = topNegIds.map(convId => {
      const conv = db.prepare(`
        SELECT id, contact_name, platform, status, created_at
        FROM inbox_conversations_v4 WHERE id = ?
      `).get(convId);
      return conv ? {
        id:           conv.id,
        contact_name: conv.contact_name || 'عميل غير محدد',
        platform:     conv.platform,
        status:       conv.status,
        neg_count:    negByConv[convId],
      } : null;
    }).filter(Boolean);

    res.json({
      ok: true,
      period:  { from: fromIso, to: toIso },
      summary: {
        total,
        positive,
        neutral,
        negative,
        positive_pct: total > 0 ? Math.round((positive / total) * 100) : null,
        neutral_pct:  total > 0 ? Math.round((neutral  / total) * 100) : null,
        negative_pct: total > 0 ? Math.round((negative / total) * 100) : null,
        analyzed_new: newResults.length,
        from_cache:   alreadyDone.length,
      },
      daily,
      top_negative: topNegConvs,
    });

  } catch (e) {
    console.error('[inbox/analytics/sentiment]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
