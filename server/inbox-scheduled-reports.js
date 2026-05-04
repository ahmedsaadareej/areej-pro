/**
 * inbox-scheduled-reports.js — Scheduled Reports Engine لـ Inbox v4
 * آخر تحديث: 2026-05-04 — P11-E1
 *
 * الوظيفة:
 *   يشتغل كل ساعة (من cron-jobs.js)
 *   يفحص inbox_scheduled_reports_v4 لكل tenant
 *   يولّد CSV ويرسله عبر SMTP للمستلمين
 *
 * الدعوة:
 *   const { runScheduledReports } = require('./inbox-scheduled-reports');
 *   runScheduledReports(getTenantDb, masterDb);
 */

'use strict';

const nodemailer = require('nodemailer');

// ─── نوع التقرير → نص عربي ────────────────────────────────────────────────
const REPORT_TYPE_LABELS = {
  overview:   'نظرة عامة',
  agents:     'أداء الموظفين',
  sla:        'SLA',
  csat:       'CSAT',
  labels:     'التصنيفات',
  automation: 'الأتمتة والذكاء الاصطناعي',
  full:       'تقرير شامل',
};

// ─── SMTP Transport ───────────────────────────────────────────────────────────
function _createTransport(account) {
  return nodemailer.createTransport({
    host  : account.smtp_host,
    port  : account.smtp_port || 587,
    secure: !!account.smtp_secure,
    auth  : account.smtp_user ? { user: account.smtp_user, pass: account.smtp_pass } : undefined,
    tls   : { rejectUnauthorized: false },
  });
}

// ─── تحديد ما إذا كان التقرير مستحقاً الآن ──────────────────────────────────
/**
 * @param {object} report — صف من inbox_scheduled_reports_v4
 * @param {Date}   now    — الوقت الحالي
 * @returns {boolean}
 */
function _isDue(report, now) {
  const h    = now.getUTCHours();
  const dow  = now.getUTCDay();   // 0=الأحد
  const dom  = now.getUTCDate();
  const lastSentDate = report.last_sent
    ? new Date(report.last_sent * 1000).toISOString().slice(0, 10)
    : null;
  const todayDate = now.toISOString().slice(0, 10);

  // لا نرسل مرتين في نفس اليوم (daily)
  if (lastSentDate === todayDate) return false;

  // تحقق الساعة
  if (h !== report.send_hour) return false;

  switch (report.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      // send_day: 0=الأحد ... 6=السبت
      return dow === (report.send_day ?? 1);
    case 'monthly':
      // send_day: 1-28 (يوم من الشهر)
      return dom === (report.send_day ?? 1);
    default:
      return false;
  }
}

// ─── بناء نطاق الفترة حسب نوع التقرير ─────────────────────────────────────
function _buildRange(frequency, now) {
  const toDate   = new Date(now);
  toDate.setUTCHours(0, 0, 0, 0);

  const fromDate = new Date(toDate);
  if (frequency === 'daily')   fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  if (frequency === 'weekly')  fromDate.setUTCDate(fromDate.getUTCDate() - 7);
  if (frequency === 'monthly') fromDate.setUTCMonth(fromDate.getUTCMonth() - 1);

  const toTs   = Math.floor(toDate.getTime() / 1000) - 1;
  const fromTs = Math.floor(fromDate.getTime() / 1000);
  return {
    fromTs,
    toTs,
    fromIso: fromDate.toISOString().slice(0, 10),
    toIso  : new Date(toTs * 1000).toISOString().slice(0, 10),
  };
}

// ─── توليد CSV ────────────────────────────────────────────────────────────────
function _generateCSV(rows, headers) {
  const bom   = '\uFEFF'; // BOM للعربية في Excel
  const hLine = headers.join(',');
  const lines = rows.map(row =>
    headers.map(h => {
      const val = row[h] ?? '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );
  return bom + [hLine, ...lines].join('\r\n');
}

// ─── جلب بيانات التقرير ───────────────────────────────────────────────────────

function _fetchOverview(db, range) {
  const { fromTs, toTs } = range;

  const total  = db.prepare(`SELECT COUNT(*) n FROM inbox_conversations_v4 WHERE created_at BETWEEN ? AND ?`).get(fromTs, toTs).n;
  const closed = db.prepare(`SELECT COUNT(*) n FROM inbox_conversations_v4 WHERE created_at BETWEEN ? AND ? AND status='closed'`).get(fromTs, toTs).n;
  const open   = db.prepare(`SELECT COUNT(*) n FROM inbox_conversations_v4 WHERE status IN ('open','waiting','snoozed')`).get().n;
  const avgFR  = db.prepare(`SELECT AVG(first_response_at - first_message_at) a FROM inbox_conversations_v4 WHERE created_at BETWEEN ? AND ? AND first_response_at IS NOT NULL AND first_message_at IS NOT NULL AND first_response_at > first_message_at`).get(fromTs, toTs).a;
  const avgRes = db.prepare(`SELECT AVG(resolved_at - first_message_at) a FROM inbox_conversations_v4 WHERE created_at BETWEEN ? AND ? AND resolved_at IS NOT NULL AND first_message_at IS NOT NULL AND resolved_at > first_message_at`).get(fromTs, toTs).a;

  const headers = ['المقياس', 'القيمة'];
  const rows = [
    { 'المقياس': 'إجمالي المحادثات',       'القيمة': total },
    { 'المقياس': 'المحادثات المغلقة',      'القيمة': closed },
    { 'المقياس': 'المحادثات المفتوحة الآن','القيمة': open },
    { 'المقياس': 'معدل الحل (%)',           'القيمة': total > 0 ? Math.round((closed / total) * 100) : 0 },
    { 'المقياس': 'متوسط أول رد (دقيقة)',   'القيمة': avgFR  ? Math.round(avgFR / 60)  : '-' },
    { 'المقياس': 'متوسط وقت الحل (دقيقة)', 'القيمة': avgRes ? Math.round(avgRes / 60) : '-' },
  ];
  return { headers, rows };
}

function _fetchAgents(db, range) {
  const { fromTs, toTs } = range;
  const agents = db.prepare(`
    SELECT
      ia.name,
      ia.email,
      COUNT(DISTINCT c.id)                          AS total_conversations,
      COUNT(DISTINCT CASE WHEN c.status='closed' THEN c.id END) AS closed_conversations,
      AVG(CASE WHEN c.first_response_at IS NOT NULL AND c.first_message_at IS NOT NULL
               THEN c.first_response_at - c.first_message_at END) AS avg_first_response_sec
    FROM inbox_users ia
    LEFT JOIN inbox_conversations_v4 c
      ON c.assigned_to = ia.id AND c.created_at BETWEEN ? AND ?
    GROUP BY ia.id
    ORDER BY closed_conversations DESC
  `).all(fromTs, toTs);

  const headers = ['الموظف', 'البريد الإلكتروني', 'إجمالي المحادثات', 'المغلقة', 'متوسط أول رد (د)'];
  const rows = agents.map(a => ({
    'الموظف'              : a.name || '-',
    'البريد الإلكتروني'    : a.email || '-',
    'إجمالي المحادثات'     : a.total_conversations,
    'المغلقة'              : a.closed_conversations,
    'متوسط أول رد (د)'    : a.avg_first_response_sec ? Math.round(a.avg_first_response_sec / 60) : '-',
  }));
  return { headers, rows };
}

function _fetchSLA(db, range) {
  const { fromTs, toTs } = range;
  const rows_raw = db.prepare(`
    SELECT priority,
           COUNT(*) total,
           SUM(CASE WHEN first_response_at IS NOT NULL AND (first_response_at - first_message_at) <= 300  THEN 1 ELSE 0 END) fr_met,
           SUM(CASE WHEN resolved_at IS NOT NULL       AND (resolved_at - first_message_at)       <= 3600 THEN 1 ELSE 0 END) res_met
    FROM inbox_conversations_v4
    WHERE created_at BETWEEN ? AND ?
    GROUP BY priority
  `).all(fromTs, toTs);

  const headers = ['الأولوية', 'إجمالي', 'أول رد ملتزم', 'حل ملتزم', 'التزام أول رد (%)'];
  const rows = rows_raw.map(r => ({
    'الأولوية'           : r.priority || 'normal',
    'إجمالي'             : r.total,
    'أول رد ملتزم'       : r.fr_met,
    'حل ملتزم'           : r.res_met,
    'التزام أول رد (%)' : r.total > 0 ? Math.round((r.fr_met / r.total) * 100) : 0,
  }));
  return { headers, rows };
}

function _fetchCSAT(db, range) {
  const { fromTs, toTs } = range;

  // تحقق من وجود جدول CSAT
  const hasTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_csat_responses_v4'`).get();
  if (!hasTable) return { headers: ['ملاحظة'], rows: [{ 'ملاحظة': 'جدول CSAT غير موجود بعد' }] };

  const rows_raw = db.prepare(`
    SELECT rating, COUNT(*) n FROM inbox_csat_responses_v4
    WHERE created_at BETWEEN ? AND ?
    GROUP BY rating ORDER BY rating
  `).all(fromTs, toTs);

  const total = rows_raw.reduce((s, r) => s + r.n, 0);
  const sum   = rows_raw.reduce((s, r) => s + (r.rating * r.n), 0);

  const headers = ['التقييم', 'العدد', 'النسبة (%)'];
  const rows = rows_raw.map(r => ({
    'التقييم'   : r.rating,
    'العدد'     : r.n,
    'النسبة (%)': total > 0 ? Math.round((r.n / total) * 100) : 0,
  }));
  if (total > 0) {
    rows.push({ 'التقييم': 'المتوسط', 'العدد': total, 'النسبة (%)': (sum / total).toFixed(2) });
  }
  return { headers, rows };
}

function _fetchLabels(db, range) {
  const { fromTs, toTs } = range;
  const labels = db.prepare(`
    SELECT l.name,
           COUNT(DISTINCT cl.conversation_id) n
    FROM inbox_labels_v4 l
    LEFT JOIN inbox_conversation_labels_v4 cl ON cl.label_id = l.id
    LEFT JOIN inbox_conversations_v4 c ON c.id = cl.conversation_id
      AND c.created_at BETWEEN ? AND ?
    GROUP BY l.id
    ORDER BY n DESC
  `).all(fromTs, toTs);

  const headers = ['التصنيف', 'عدد المحادثات'];
  const rows = labels.map(l => ({ 'التصنيف': l.name, 'عدد المحادثات': l.n }));
  return { headers, rows };
}

function _fetchAutomation(db, range) {
  const { fromTs, toTs } = range;

  const chatbot = db.prepare(`SELECT COUNT(*) n FROM inbox_conversations_v4 WHERE chatbot_active=1 AND created_at BETWEEN ? AND ?`).get(fromTs, toTs).n;
  const ai      = db.prepare(`SELECT COUNT(*) n FROM inbox_messages_v4 WHERE ai_generated=1 AND sent_at BETWEEN ? AND ?`).get(fromTs, toTs).n;

  const headers = ['المقياس', 'القيمة'];
  const rows = [
    { 'المقياس': 'محادثات الـ Chatbot',      'القيمة': chatbot },
    { 'المقياس': 'ردود الـ AI المُولَّدة',  'القيمة': ai },
  ];
  return { headers, rows };
}

/**
 * جمع أقسام "full" (كل الأنواع في ملف واحد مُقسَّم بفواصل)
 */
function _fetchFull(db, range) {
  const sections = ['overview', 'agents', 'sla', 'csat', 'labels', 'automation'];
  const parts = [];
  for (const s of sections) {
    const { headers, rows } = _fetchSection(db, s, range);
    parts.push(`=== ${REPORT_TYPE_LABELS[s]} ===`);
    parts.push(headers.join(','));
    for (const row of rows) parts.push(headers.map(h => row[h] ?? '').join(','));
    parts.push('');
  }
  return { raw: '\uFEFF' + parts.join('\r\n') };
}

function _fetchSection(db, type, range) {
  switch (type) {
    case 'overview':   return _fetchOverview(db, range);
    case 'agents':     return _fetchAgents(db, range);
    case 'sla':        return _fetchSLA(db, range);
    case 'csat':       return _fetchCSAT(db, range);
    case 'labels':     return _fetchLabels(db, range);
    case 'automation': return _fetchAutomation(db, range);
    default:           return { headers: [], rows: [] };
  }
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────

/**
 * runScheduledReports — تشغيل دورة الإرسال
 * @param {Function} getTenantDb — (userId) => db
 * @param {object}   masterDb    — قاعدة بيانات رئيسية لجلب قائمة الـ tenants
 */
async function runScheduledReports(getTenantDb, masterDb) {
  const now = new Date();
  console.log('[ScheduledReports] بدء الفحص:', now.toISOString());

  // جلب كل الـ tenants النشطين
  let tenants;
  try {
    tenants = masterDb.prepare(
      `SELECT id, name FROM users WHERE status IN ('active', 'trial')`
    ).all();
  } catch (e) {
    console.error('[ScheduledReports] فشل جلب الـ tenants:', e.message);
    return;
  }

  for (const tenant of tenants) {
    try {
      await _processTenant(tenant, getTenantDb, now);
    } catch (e) {
      console.error(`[ScheduledReports] خطأ في tenant ${tenant.id}:`, e.message);
    }
  }

  console.log('[ScheduledReports] انتهى الفحص');
}

async function _processTenant(tenant, getTenantDb, now) {
  const db = getTenantDb(tenant.id);

  // جلب التقارير النشطة
  let reports;
  try {
    reports = db.prepare(
      `SELECT * FROM inbox_scheduled_reports_v4 WHERE active = 1`
    ).all();
  } catch (e) {
    // الجدول غير موجود بعد على هذا الـ tenant (migrations لم تصله)
    return;
  }

  if (!reports.length) return;

  // جلب حساب SMTP الأول لهذا الـ tenant
  let smtpAccount;
  try {
    smtpAccount = db.prepare(
      `SELECT * FROM inbox_email_accounts_v4 WHERE smtp_host IS NOT NULL LIMIT 1`
    ).get();
  } catch (e) {
    smtpAccount = null;
  }

  for (const report of reports) {
    if (!_isDue(report, now)) continue;

    console.log(`[ScheduledReports] إرسال تقرير "${report.name}" (tenant ${tenant.id})`);
    try {
      await _sendReport(db, tenant, report, smtpAccount, now);
      // تحديث last_sent
      db.prepare(
        `UPDATE inbox_scheduled_reports_v4 SET last_sent = ? WHERE id = ?`
      ).run(Math.floor(now.getTime() / 1000), report.id);
      console.log(`[ScheduledReports] ✅ تم إرسال "${report.name}"`);
    } catch (e) {
      console.error(`[ScheduledReports] ❌ فشل إرسال "${report.name}":`, e.message);
    }
  }
}

async function _sendReport(db, tenant, report, smtpAccount, now) {
  const range = _buildRange(report.frequency, now);

  // توليد CSV
  let csvContent;
  if (report.report_type === 'full') {
    const { raw } = _fetchFull(db, range);
    csvContent = raw;
  } else {
    const { headers, rows } = _fetchSection(db, report.report_type, range);
    csvContent = _generateCSV(rows, headers);
  }

  // قائمة المستلمين
  const recipients = (report.recipients || '').split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients.length) {
    console.warn(`[ScheduledReports] "${report.name}": لا يوجد مستلمون`);
    return;
  }

  // اسم الملف
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `areej-report-${report.report_type}-${dateStr}.csv`;

  // قالب البريد
  const periodLabel = report.frequency === 'daily'   ? 'اليومي'
                    : report.frequency === 'weekly'  ? 'الأسبوعي'
                    : 'الشهري';
  const typeLabel   = REPORT_TYPE_LABELS[report.report_type] || report.report_type;

  const subject = `📊 تقرير أريج ${periodLabel} — ${typeLabel} (${dateStr})`;
  const html = `
<div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
  <div style="background:#1B5E30;padding:20px;border-radius:8px;text-align:center;margin-bottom:20px">
    <h2 style="color:#fff;margin:0;font-size:20px">📊 تقرير ${typeLabel} ${periodLabel}</h2>
    <p style="color:#a7f3d0;margin:8px 0 0;font-size:13px">الفترة: ${range.fromIso} → ${range.toIso}</p>
  </div>
  <p style="font-size:15px;color:#374151">
    مرفق بهذا البريد تقرير <strong>${typeLabel}</strong> ${periodLabel} لنظام أريج.
  </p>
  <p style="font-size:13px;color:#6b7280">
    افتح الملف المرفق (${filename}) باستخدام Excel أو Google Sheets.
  </p>
  <p style="font-size:12px;color:#9ca3af;margin-top:24px;text-align:center">
    نظام أريج — areejegypt.com
  </p>
</div>`;

  // إرسال
  if (smtpAccount && smtpAccount.smtp_host) {
    const transport = _createTransport(smtpAccount);
    await transport.sendMail({
      from   : smtpAccount.smtp_user || `noreply@areejegypt.com`,
      to     : recipients.join(', '),
      subject,
      html,
      attachments: [{ filename, content: Buffer.from(csvContent, 'utf8'), contentType: 'text/csv; charset=utf-8' }],
    });
  } else {
    // fallback — log only (no SMTP configured)
    console.warn(`[ScheduledReports] tenant ${tenant.id}: لا يوجد SMTP — التقرير جاهز لكن لم يُرسل`);
    console.log(`[ScheduledReports] CSV preview (${csvContent.length} bytes):`, csvContent.slice(0, 200));
  }
}

module.exports = { runScheduledReports };
