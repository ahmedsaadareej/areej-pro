/**
 * analytics.js — Analytics Overview Dashboard لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P6-1 Analytics Dashboard)
 *
 * الوظائف:
 *  - نافذة Dashboard مستقلة تفتح كـ overlay فوق الـ Inbox
 *  - 4 أقسام: Overview Cards | Volume Chart | Platforms | Agents Table
 *  - Date Range picker: 7d / 30d / 90d / custom
 *  - تحديث تلقائي عند تغيير النطاق
 *  - زر Export CSV للجداول
 *
 * الاستخدام:
 *   InboxAnalytics.open()   — فتح الـ dashboard
 *   InboxAnalytics.close()  — إغلاق
 */

const InboxAnalytics = (() => {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _from = null;   // YYYY-MM-DD
  let _to   = null;   // YYYY-MM-DD
  let _preset = '30'; // 7 | 30 | 90 | custom
  let _loading = false;

  // FIX-006b: _setLoading stub للـ page mode (لا يوجد loading bar في page mode)
  function _setLoading(state) {
    const bar = document.getElementById('iv4-an-loading');
    if (bar) bar.classList.toggle('hidden', !state);
    _loading = !!state;
  }
  let _overlay = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** اليوم بصيغة YYYY-MM-DD */
  function _today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** تاريخ قبل N يوم */
  function _daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /** تعيين النطاق حسب الـ preset */
  function _applyPreset(preset) {
    _preset = preset;
    _to     = _today();
    _from   = _daysAgo(parseInt(preset, 10) - 1);
  }

  /** تنسيق ثوانٍ إلى نص عربي مختصر */
  function _fmtSec(sec) {
    if (sec == null || sec <= 0) return '—';
    if (sec < 60)   return `${sec}ث`;
    if (sec < 3600) return `${Math.round(sec / 60)}د`;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${h}س ${m}د` : `${h}س`;
  }

  /** HTML escape آمن */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** تنسيق رقم مع فاصلة آلاف */
  function _fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('ar-EG');
  }

  /** أيقونة المنصة */
  const PLATFORM_ICON = {
    whatsapp:  '🟢',
    telegram:  '🔵',
    instagram: '🟣',
    messenger: '🔷',
    email:     '📧',
  };

  /** لون الـ progress bar */
  function _ratePct(n) {
    if (n == null) return 0;
    return Math.min(100, Math.max(0, n));
  }

  // ─── DOM Builder ──────────────────────────────────────────────────────────

  function _buildOverlay() {
    // احذف القديم لو موجود
    const old = document.getElementById('iv4-analytics-overlay');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = 'iv4-analytics-overlay';
    el.className = 'iv4-an-overlay';
    el.innerHTML = `
      <div class="iv4-an-modal">

        <!-- Header -->
        <div class="iv4-an-header">
          <div class="iv4-an-title">
            <span class="iv4-an-icon">📊</span>
            <span>لوحة الإحصاءات</span>
          </div>

          <!-- Date Range Picker -->
          <div class="iv4-an-range">
            <button class="iv4-an-preset active" data-preset="7">7 أيام</button>
            <button class="iv4-an-preset" data-preset="30">30 يوم</button>
            <button class="iv4-an-preset" data-preset="90">90 يوم</button>
            <span class="iv4-an-range-sep">أو:</span>
            <input type="date" id="iv4-an-from" class="iv4-an-date-input" />
            <span>→</span>
            <input type="date" id="iv4-an-to"   class="iv4-an-date-input" />
            <button id="iv4-an-apply-range" class="iv4-an-apply-btn">تطبيق</button>
          </div>

          <button id="iv4-an-close" class="iv4-an-close-btn" title="إغلاق">✕</button>
        </div>

        <!-- Loading Bar -->
        <div class="iv4-an-loading-bar hidden" id="iv4-an-loading"></div>

        <!-- Body -->
        <div class="iv4-an-body" id="iv4-an-body">

          <!-- ── Section 1: KPI Cards ── -->
          <section class="iv4-an-section">
            <h3 class="iv4-an-section-title">📈 نظرة عامة</h3>
            <div class="iv4-an-kpi-grid" id="iv4-an-kpi-grid">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 2: Volume Chart ── -->
          <section class="iv4-an-section">
            <h3 class="iv4-an-section-title">📅 حجم المحادثات يومياً</h3>
            <div class="iv4-an-chart-wrap">
              <canvas id="iv4-an-volume-chart" class="iv4-an-canvas"></canvas>
            </div>
          </section>

          <!-- ── Section 3: Hourly Heatmap ── -->
          <section class="iv4-an-section iv4-an-section--half">
            <h3 class="iv4-an-section-title">🕐 أوقات الذروة (رسائل واردة/ساعة)</h3>
            <div id="iv4-an-hourly" class="iv4-an-hourly">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 4: Platforms ── -->
          <section class="iv4-an-section iv4-an-section--half">
            <h3 class="iv4-an-section-title">📡 توزيع المنصات</h3>
            <div id="iv4-an-platforms" class="iv4-an-platforms">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 5: SLA Overview ── -->
          <section class="iv4-an-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">⏱ الالتزام بـ SLA</h3>
              <button id="iv4-an-sla-detail-btn" class="iv4-an-export-btn" title="تقرير SLA التفصيلي">🔍 تفصيل</button>
            </div>
            <div id="iv4-an-sla" class="iv4-an-sla-grid">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 6: CSAT ── -->
          <section class="iv4-an-section" id="iv4-an-csat-section">
            <h3 class="iv4-an-section-title">⭐ رضا العملاء (CSAT)</h3>
            <div id="iv4-an-csat" class="iv4-an-csat-wrap">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 7: Sentiment Analysis (P7-4) ── -->
          <section class="iv4-an-section" id="iv4-an-sentiment-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">🧠 تحليل المشاعر</h3>
              <span class="iv4-an-sentiment-hint" id="iv4-an-sentiment-hint"></span>
            </div>
            <div id="iv4-an-sentiment" class="iv4-an-sentiment-wrap">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 7: Agents Table ── -->
          <section class="iv4-an-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">👥 أداء الموظفين</h3>
              <div class="iv4-an-export-group">
                <button id="iv4-an-export-agents" class="iv4-an-export-btn" title="تصدير بيانات الموظفين">⬇ موظفين</button>
                <button id="iv4-an-export-full" class="iv4-an-export-btn" title="تصدير التقرير كاملاً بصيغة CSV">📅 CSV كامل</button>
                <button id="iv4-an-export-pdf" class="iv4-an-export-btn iv4-an-export-btn--primary" title="تصدير التقرير كـ PDF">🖨️ تصدير PDF</button>
              </div>
            </div>
            <div class="iv4-an-table-wrap">
              <table class="iv4-an-table" id="iv4-an-agents-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>محادثات</th>
                    <th>مغلقة</th>
                    <th>معدل الإغلاق</th>
                    <th>رسائل أُرسلت</th>
                    <th>وقت أول رد</th>
                    <th>وقت الإغلاق</th>
                  </tr>
                </thead>
                <tbody id="iv4-an-agents-body">
                  <tr><td colspan="7" class="iv4-an-empty">جارٍ التحميل...</td></tr>
                </tbody>
              </table>
            </div>
          </section>

        </div><!-- /body -->
      </div>
    `;

    document.body.appendChild(el);
    _overlay = el;
    return el;
  }

  // ─── KPI Cards ────────────────────────────────────────────────────────────

  function _renderKPI(data) {
    const grid = document.getElementById('iv4-an-kpi-grid');
    if (!grid || !data) return;

    const t = data.totals;
    const a = data.averages;

    const cards = [
      {
        icon: '💬', label: 'إجمالي المحادثات',
        value: _fmt(t.conversations), sub: `مفتوحة الآن: ${_fmt(t.open_now)}`,
        color: '#3b82f6',
      },
      {
        icon: '✅', label: 'معدل الإغلاق',
        value: `${t.resolution_rate}%`,
        sub: `${_fmt(t.closed)} مغلقة من ${_fmt(t.conversations)}`,
        color: t.resolution_rate >= 70 ? '#10b981' : '#f59e0b',
        bar: t.resolution_rate,
      },
      {
        icon: '⚡', label: 'متوسط أول رد',
        value: _fmtSec(a.first_response_sec),
        sub: 'وقت الاستجابة الأولى',
        color: '#8b5cf6',
      },
      {
        icon: '🔒', label: 'متوسط وقت الإغلاق',
        value: _fmtSec(a.resolution_sec),
        sub: 'من أول رسالة حتى الإغلاق',
        color: '#06b6d4',
      },
      {
        icon: '📥', label: 'رسائل واردة',
        value: _fmt(t.messages_inbound),
        sub: `صادرة: ${_fmt(t.messages_outbound)}`,
        color: '#64748b',
      },
    ];

    grid.innerHTML = cards.map(c => `
      <div class="iv4-an-kpi-card">
        <div class="iv4-an-kpi-icon" style="color:${c.color}">${c.icon}</div>
        <div class="iv4-an-kpi-info">
          <div class="iv4-an-kpi-value" style="color:${c.color}">${c.value}</div>
          <div class="iv4-an-kpi-label">${c.label}</div>
          <div class="iv4-an-kpi-sub">${c.sub}</div>
          ${c.bar != null ? `
            <div class="iv4-an-kpi-bar-wrap">
              <div class="iv4-an-kpi-bar" style="width:${_ratePct(c.bar)}%;background:${c.color}"></div>
            </div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // ─── Volume Chart (بدون مكتبة خارجية — SVG يدوي) ─────────────────────────

  function _renderVolumeChart(volumeData) {
    const canvas = document.getElementById('iv4-an-volume-chart');
    if (!canvas || !volumeData || !volumeData.length) return;

    // نرسم SVG بار تشارت بسيط
    const W = canvas.offsetWidth || 700;
    const H = 180;
    const PL = 40, PR = 20, PT = 20, PB = 40;
    const innerW = W - PL - PR;
    const innerH = H - PT - PB;

    const maxVal = Math.max(...volumeData.map(d => d.total), 1);
    const barW   = Math.max(4, Math.floor(innerW / volumeData.length) - 2);
    const step   = innerW / volumeData.length;

    // اختر تسميات X (max 10)
    const labelStep = Math.ceil(volumeData.length / 10);

    const bars = volumeData.map((d, i) => {
      const x  = PL + i * step + (step - barW) / 2;
      const bh = Math.round((d.total / maxVal) * innerH);
      const y  = PT + innerH - bh;
      const label = (i % labelStep === 0) ? d.day.slice(5) : '';
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${bh}"
              rx="2" fill="#3b82f6" opacity="0.85"
              class="iv4-an-bar" data-day="${d.day}" data-val="${d.total}" />
        ${label ? `<text x="${x + barW/2}" y="${PT + innerH + 18}"
              text-anchor="middle" class="iv4-an-chart-label">${label}</text>` : ''}
      `;
    }).join('');

    // خطوط Y المرجعية
    const yLines = [0, 0.25, 0.5, 0.75, 1].map(frac => {
      const val = Math.round(maxVal * frac);
      const y   = PT + innerH - Math.round(frac * innerH);
      return `
        <line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}"
              class="iv4-an-grid-line" />
        <text x="${PL - 6}" y="${y + 4}"
              text-anchor="end" class="iv4-an-chart-label">${val}</text>
      `;
    }).join('');

    canvas.innerHTML = `
      <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           class="iv4-an-svg">
        ${yLines}
        ${bars}
      </svg>
    `;

    // Tooltip بسيط
    canvas.querySelectorAll('.iv4-an-bar').forEach(bar => {
      bar.addEventListener('mouseenter', e => {
        _showChartTooltip(e, `${bar.dataset.day}: ${bar.dataset.val} محادثة`);
      });
      bar.addEventListener('mouseleave', _hideChartTooltip);
    });
  }

  // ─── Hourly Heatmap ───────────────────────────────────────────────────────

  function _renderHourly(hourlyData) {
    const el = document.getElementById('iv4-an-hourly');
    if (!el || !hourlyData) return;

    const maxCount = Math.max(...hourlyData.map(h => h.count), 1);

    el.innerHTML = `
      <div class="iv4-an-hourly-grid">
        ${hourlyData.map(h => {
          const pct   = Math.round((h.count / maxCount) * 100);
          const label = `${String(h.hour).padStart(2, '0')}:00`;
          const cls   = pct > 75 ? 'hot' : pct > 40 ? 'warm' : pct > 10 ? 'cool' : 'cold';
          return `
            <div class="iv4-an-hour-cell iv4-an-hour--${cls}"
                 title="${label} — ${h.count} رسالة">
              <span class="iv4-an-hour-label">${label}</span>
              <span class="iv4-an-hour-count">${h.count}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ─── Platforms Section ────────────────────────────────────────────────────

  function _renderPlatforms(platformsData) {
    const el = document.getElementById('iv4-an-platforms');
    if (!el || !platformsData) return;

    const total = platformsData.reduce((s, p) => s + p.total_convs, 0) || 1;

    if (!platformsData.length) {
      el.innerHTML = '<p class="iv4-an-empty">لا توجد بيانات في هذه الفترة</p>';
      return;
    }

    el.innerHTML = platformsData.map(p => {
      const pct  = Math.round((p.total_convs / total) * 100);
      const icon = PLATFORM_ICON[p.platform] || '📱';
      return `
        <div class="iv4-an-platform-row iv4-an-platform-clickable"
             data-platform="${p.platform}" style="cursor:pointer">
          <span class="iv4-an-platform-icon">${icon}</span>
          <span class="iv4-an-platform-name">${p.platform || 'غير محدد'}</span>
          <div class="iv4-an-platform-bar-wrap">
            <div class="iv4-an-platform-bar" style="width:${pct}%"></div>
          </div>
          <span class="iv4-an-platform-pct">${pct}%</span>
          <span class="iv4-an-platform-count">${_fmt(p.total_convs)}</span>
          <span class="iv4-an-platform-close">${_fmt(p.closed_convs)} ✅</span>
          <span class="iv4-an-platform-detail-hint">»</span>
        </div>
      `;
    }).join('');

    // النقر على منصة → drill-down
    el.querySelectorAll('.iv4-an-platform-clickable').forEach(row => {
      row.addEventListener('click', () => {
        if (row.dataset.platform) _openPlatformDetail(row.dataset.platform);
      });
    });
  }

  // ─── SLA Section ──────────────────────────────────────────────────────────

  function _renderSLA(slaData) {
    const el = document.getElementById('iv4-an-sla');
    if (!el || !slaData) return;

    const s = slaData.summary;
    if (!s) { el.innerHTML = '<p class="iv4-an-empty">لا توجد بيانات SLA</p>'; return; }

    const frPct  = s.first_response_met_pct;
    const resPct = s.resolution_met_pct;
    const frColor  = frPct  >= 80 ? '#10b981' : frPct  >= 60 ? '#f59e0b' : '#ef4444';
    const resColor = resPct >= 80 ? '#10b981' : resPct >= 60 ? '#f59e0b' : '#ef4444';

    // SLA by priority
    const byPriorityHTML = Object.entries(slaData.by_priority || {}).map(([p, d]) => {
      const met = d.met + d.breached > 0
        ? Math.round((d.met / (d.met + d.breached)) * 100) : null;
      const color = met == null ? '#94a3b8' : met >= 80 ? '#10b981' : met >= 60 ? '#f59e0b' : '#ef4444';
      const PRIO_LABELS = { urgent: '🔴 عاجل', high: '🟠 عالي', normal: '🟡 عادي', low: '🔵 منخفض' };
      return `
        <div class="iv4-an-sla-row">
          <span class="iv4-an-sla-prio">${PRIO_LABELS[p] || p}</span>
          <div class="iv4-an-sla-bar-wrap">
            <div class="iv4-an-sla-bar" style="width:${_ratePct(met)}%;background:${color}"></div>
          </div>
          <span class="iv4-an-sla-val" style="color:${color}">${met != null ? met + '%' : '—'}</span>
          <span class="iv4-an-sla-thresh">الحد: ${d.threshold_fmt}</span>
          <span class="iv4-an-sla-counts">${d.met} ✅ / ${d.breached} ❌ / ${d.pending} ⏳</span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="iv4-an-sla-summary">
        <div class="iv4-an-sla-card">
          <div class="iv4-an-sla-label">أول رد</div>
          <div class="iv4-an-sla-pct" style="color:${frColor}">
            ${frPct != null ? frPct + '%' : '—'}
          </div>
          <div class="iv4-an-sla-bar-wrap">
            <div class="iv4-an-sla-bar" style="width:${_ratePct(frPct)}%;background:${frColor}"></div>
          </div>
          <div class="iv4-an-sla-avg">متوسط: ${s.avg_first_response_fmt || '—'}</div>
        </div>
        <div class="iv4-an-sla-card">
          <div class="iv4-an-sla-label">إغلاق</div>
          <div class="iv4-an-sla-pct" style="color:${resColor}">
            ${resPct != null ? resPct + '%' : '—'}
          </div>
          <div class="iv4-an-sla-bar-wrap">
            <div class="iv4-an-sla-bar" style="width:${_ratePct(resPct)}%;background:${resColor}"></div>
          </div>
          <div class="iv4-an-sla-avg">متوسط: ${s.avg_resolution_fmt || '—'}</div>
        </div>
      </div>
      ${byPriorityHTML ? `<div class="iv4-an-sla-by-prio">${byPriorityHTML}</div>` : ''}
    `;
  }

  // ─── Agents Table ─────────────────────────────────────────────────────────

  function _renderAgents(agentsData) {
    const tbody = document.getElementById('iv4-an-agents-body');
    if (!tbody) return;

    if (!agentsData || !agentsData.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="iv4-an-empty">لا توجد بيانات في هذه الفترة</td></tr>';
      return;
    }

    // احفظ للـ CSV export
    _lastAgentsData = agentsData;

    tbody.innerHTML = agentsData.map(a => `
      <tr data-agent-id="${a.agent_id}" data-agent-name="${a.agent_name}" class="iv4-an-agent-row">
        <td class="iv4-an-agent-name iv4-an-agent-link">👤 ${a.agent_name}</td>
        <td>${_fmt(a.total_convs)}</td>
        <td>${_fmt(a.closed_convs)}</td>
        <td>
          <div class="iv4-an-mini-bar-wrap">
            <div class="iv4-an-mini-bar"
                 style="width:${_ratePct(a.resolution_rate)}%;
                        background:${a.resolution_rate >= 70 ? '#10b981' : '#f59e0b'}">
            </div>
            <span>${a.resolution_rate}%</span>
          </div>
        </td>
        <td>${_fmt(a.messages_sent)}</td>
        <td>${a.avg_first_response_fmt || '—'}</td>
        <td>${a.avg_resolution_fmt || '—'}</td>
      </tr>
    `).join('');

    // نقرة على اسم الموظف → drill-down
    tbody.querySelectorAll('.iv4-an-agent-row').forEach(row => {
      row.querySelector('.iv4-an-agent-link').addEventListener('click', () => {
        _openAgentDetail(
          parseInt(row.dataset.agentId, 10),
          row.dataset.agentName
        );
      });
    });
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  // ─── Agent Detail Modal ───────────────────────────────────────────────────

  async function _openAgentDetail(agentId, agentName) {
    const existing = document.getElementById('iv4-an-agent-detail');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'iv4-an-agent-detail';
    modal.className = 'iv4-an-agent-detail-wrap';
    modal.innerHTML = `
      <div class="iv4-an-agent-detail-modal">
        <div class="iv4-an-ad-header">
          <span class="iv4-an-ad-title">👤 ${agentName}</span>
          <button class="iv4-an-ad-close" id="iv4-an-ad-close">✕</button>
        </div>
        <div class="iv4-an-ad-loading" id="iv4-an-ad-body">جارٍ تحميل بيانات الموظف...</div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#iv4-an-ad-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const { data, error } = await InboxAPI.analytics.agentDetail(agentId, { from: _from, to: _to });
    const body = document.getElementById('iv4-an-ad-body');
    if (!body) return;

    if (error || !data) {
      body.innerHTML = `<p class="iv4-an-empty">خطأ: ${error || 'فشل التحميل'}</p>`;
      return;
    }

    const s = data.summary;
    const PRIO_LABELS    = { urgent: '🔴 عاجل', high: '🟠 عالي', normal: '🟡 عادي', low: '🔵 منخفض' };
    const PLATFORM_ICON2 = { whatsapp: '🟢', telegram: '🔵', instagram: '🟣', messenger: '🔷' };
    const STATUS_LABELS  = { open: 'مفتوحة', closed: 'مغلقة', waiting: 'انتظار', snoozed: 'مؤجلة' };

    const totalPlatforms = data.platforms.reduce((a, p) => a + p.n, 0) || 1;
    const maxDaily = Math.max(...(data.daily.map(d => d.total)), 1);
    const dailyBars = data.daily.map(d => {
      const h = Math.max(4, Math.round((d.total / maxDaily) * 60));
      return `<div class="iv4-an-ad-bar" style="height:${h}px"
                   title="${d.day}: ${d.total} محادثة"></div>`;
    }).join('');

    const recentRows = (data.recent_convs || []).map(c => `
      <tr>
        <td>${c.contact_name || '—'}</td>
        <td>${PLATFORM_ICON2[c.platform] || '📱'} ${c.platform || ''}</td>
        <td><span class="iv4-an-ad-status iv4-an-ad-status--${c.status}">${STATUS_LABELS[c.status] || c.status}</span></td>
        <td>${PRIO_LABELS[c.priority] || c.priority || '—'}</td>
      </tr>
    `).join('');

    body.className = 'iv4-an-ad-body-loaded';
    body.innerHTML = `
      <div class="iv4-an-ad-kpi-row">
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val">${_fmt(s.total_convs)}</div>
          <div class="iv4-an-ad-kpi-lbl">محادثات</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val"
               style="color:${s.resolution_rate >= 70 ? '#10b981' : '#f59e0b'}">${s.resolution_rate}%</div>
          <div class="iv4-an-ad-kpi-lbl">إغلاق</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val">${_fmt(s.messages_sent)}</div>
          <div class="iv4-an-ad-kpi-lbl">رسائل</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:#8b5cf6">${s.avg_first_response_fmt || '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">أول رد</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:#06b6d4">${s.avg_resolution_fmt || '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">وقت إغلاق</div>
        </div>
      </div>

      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">📈 تطور يومي</div>
        ${data.daily.length ? `
          <div class="iv4-an-ad-bars">${dailyBars}</div>
          <div class="iv4-an-ad-bars-labels">
            <span>${data.daily[0]?.day?.slice(5) || ''}</span>
            <span>${data.daily[Math.floor(data.daily.length / 2)]?.day?.slice(5) || ''}</span>
            <span>${data.daily[data.daily.length - 1]?.day?.slice(5) || ''}</span>
          </div>` :
          '<p class="iv4-an-empty">لا توجد بيانات</p>'}
      </div>

      <div class="iv4-an-ad-two-col">
        <div class="iv4-an-ad-section">
          <div class="iv4-an-ad-section-title">📡 المنصات</div>
          ${data.platforms.map(p => `
            <div class="iv4-an-ad-plat-row">
              <span>${PLATFORM_ICON2[p.platform] || '📱'} ${p.platform || 'غير محدد'}</span>
              <div class="iv4-an-platform-bar-wrap" style="flex:1;margin:0 8px">
                <div class="iv4-an-platform-bar"
                     style="width:${Math.round((p.n / totalPlatforms) * 100)}%"></div>
              </div>
              <span>${p.n}</span>
            </div>`).join('') || '<p class="iv4-an-empty">—</p>'}
        </div>
        <div class="iv4-an-ad-section">
          <div class="iv4-an-ad-section-title">⚡ الأولوية</div>
          ${data.priorities.map(p => `
            <div class="iv4-an-ad-plat-row">
              <span>${PRIO_LABELS[p.priority] || p.priority}</span>
              <span style="margin-right:auto;font-weight:700">${p.n}</span>
            </div>`).join('') || '<p class="iv4-an-empty">—</p>'}
        </div>
      </div>

      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">💬 آخر المحادثات</div>
        ${recentRows ? `
          <div class="iv4-an-table-wrap">
            <table class="iv4-an-table">
              <thead><tr><th>العميل</th><th>المنصة</th><th>الحالة</th><th>الأولوية</th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>` :
          '<p class="iv4-an-empty">لا توجد محادثات</p>'}
      </div>
    `;
  }


  // ─── Platform Detail Modal ────────────────────────────────────────────────

  async function _openPlatformDetail(platform) {
    const existing = document.getElementById('iv4-an-plat-detail');
    if (existing) existing.remove();

    const PLATFORM_ICON2 = { whatsapp: '🟢', telegram: '🔵', instagram: '🟣', messenger: '🔷' };
    const icon = PLATFORM_ICON2[platform] || '📱';

    const modal = document.createElement('div');
    modal.id = 'iv4-an-plat-detail';
    modal.className = 'iv4-an-agent-detail-wrap';
    modal.innerHTML = `
      <div class="iv4-an-agent-detail-modal">
        <div class="iv4-an-ad-header">
          <span class="iv4-an-ad-title">${icon} ${platform}</span>
          <button class="iv4-an-ad-close" id="iv4-an-pd-close">✕</button>
        </div>
        <div class="iv4-an-ad-loading" id="iv4-an-pd-body">جارٍ تحميل بيانات المنصة...</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#iv4-an-pd-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const { data, error } = await InboxAPI.analytics.platformDetail(platform, { from: _from, to: _to });
    const body = document.getElementById('iv4-an-pd-body');
    if (!body) return;

    if (error || !data) {
      body.innerHTML = `<p class="iv4-an-empty">خطأ: ${error || 'فشل التحميل'}</p>`;
      return;
    }

    const s = data.summary;
    const PRIO_LABELS = { urgent: '🔴 عاجل', high: '🟠 عالي', normal: '🟡 عادي', low: '🔵 منخفض' };

    // mini bar chart
    const maxDaily  = Math.max(...(data.daily.map(d => d.total)), 1);
    const dailyBars = data.daily.map(d => {
      const h = Math.max(4, Math.round((d.total / maxDaily) * 60));
      return `<div class="iv4-an-ad-bar" style="height:${h}px"
                   title="${d.day}: ${d.total} محادثة"></div>`;
    }).join('');

    // جدول أداء الموظفين على هذه المنصة
    const agentRows = (data.agents || []).map(a => `
      <tr>
        <td>👤 ${a.agent_name || 'غير معيّن'}</td>
        <td>${a.total}</td>
        <td>${a.closed}</td>
        <td>${a.total > 0 ? Math.round((a.closed / a.total) * 100) : 0}%</td>
      </tr>
    `).join('');

    body.className = 'iv4-an-ad-body-loaded';
    body.innerHTML = `
      <!-- KPI -->
      <div class="iv4-an-ad-kpi-row">
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val">${_fmt(s.total)}</div>
          <div class="iv4-an-ad-kpi-lbl">إجمالي</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val">${_fmt(s.open_now)}</div>
          <div class="iv4-an-ad-kpi-lbl">مفتوحة الآن</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val"
               style="color:${s.resolution_rate >= 70 ? '#10b981' : '#f59e0b'}">${s.resolution_rate}%</div>
          <div class="iv4-an-ad-kpi-lbl">معدل الإغلاق</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:#8b5cf6">${s.avg_first_response_fmt || '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">أول رد</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:#06b6d4">${s.avg_resolution_fmt || '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">وقت الإغلاق</div>
        </div>
      </div>

      <!-- Daily Trend -->
      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">📈 تطور يومي</div>
        ${data.daily.length ? `
          <div class="iv4-an-ad-bars">${dailyBars}</div>
          <div class="iv4-an-ad-bars-labels">
            <span>${data.daily[0]?.day?.slice(5) || ''}</span>
            <span>${data.daily[Math.floor(data.daily.length/2)]?.day?.slice(5) || ''}</span>
            <span>${data.daily[data.daily.length-1]?.day?.slice(5) || ''}</span>
          </div>` : '<p class="iv4-an-empty">لا توجد بيانات</p>'}
      </div>

      <!-- Priority + Agents -->
      <div class="iv4-an-ad-two-col">
        <div class="iv4-an-ad-section">
          <div class="iv4-an-ad-section-title">⚡ توزيع الأولوية</div>
          ${data.priorities.map(p => `
            <div class="iv4-an-ad-plat-row">
              <span>${PRIO_LABELS[p.priority] || p.priority || 'غير محدد'}</span>
              <span style="margin-right:auto;font-weight:700">${p.n}</span>
            </div>`).join('') || '<p class="iv4-an-empty">—</p>'}
        </div>
        <div class="iv4-an-ad-section">
          <div class="iv4-an-ad-section-title">👥 أداء الموظفين</div>
          ${agentRows ? `
            <div class="iv4-an-table-wrap">
              <table class="iv4-an-table">
                <thead><tr><th>الموظف</th><th>كل</th><th>مغلق</th><th>%</th></tr></thead>
                <tbody>${agentRows}</tbody>
              </table>
            </div>` : '<p class="iv4-an-empty">—</p>'}
        </div>
      </div>
    `;
  }

  // ─── SLA Detail Modal ─────────────────────────────────────────────────────

  async function _openSLADetail() {
    const existing = document.getElementById('iv4-an-sla-detail');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'iv4-an-sla-detail';
    modal.className = 'iv4-an-agent-detail-wrap';
    modal.innerHTML = `
      <div class="iv4-an-agent-detail-modal" style="max-width:740px">
        <div class="iv4-an-ad-header">
          <span class="iv4-an-ad-title">⏱ تقرير SLA التفصيلي</span>
          <button class="iv4-an-ad-close" id="iv4-an-sd-close">✕</button>
        </div>
        <div class="iv4-an-ad-loading" id="iv4-an-sd-body">جارٍ تحميل بيانات SLA...</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#iv4-an-sd-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const { data, error } = await InboxAPI.analytics.slaDetail({ from: _from, to: _to });
    const body = document.getElementById('iv4-an-sd-body');
    if (!body) return;

    if (error || !data) {
      body.innerHTML = `<p class="iv4-an-empty">خطأ: ${error || 'فشل التحميل'}</p>`;
      return;
    }

    // Daily compliance chart
    const maxTotal  = Math.max(...(data.daily.map(d => d.total)), 1);
    const dailyBars = data.daily.map(d => {
      const h     = Math.max(4, Math.round((d.total / maxTotal) * 60));
      const color = d.compliance_pct == null ? '#94a3b8'
                  : d.compliance_pct >= 80 ? '#10b981'
                  : d.compliance_pct >= 60 ? '#f59e0b' : '#ef4444';
      return `<div class="iv4-an-ad-bar" style="height:${h}px;background:${color}"
                   title="${d.day}: ${d.compliance_pct != null ? d.compliance_pct + '% التزام' : 'بلا بيانات'} — ${d.total} محادثة"></div>`;
    }).join('');

    // جدول SLA بالمنصة
    const PLATFORM_ICON2 = { whatsapp: '🟢', telegram: '🔵', instagram: '🟣', messenger: '🔷' };
    const platRows = (data.by_platform || []).map(p => {
      const color = p.compliance_pct == null ? '#64748b'
                  : p.compliance_pct >= 80 ? '#10b981'
                  : p.compliance_pct >= 60 ? '#f59e0b' : '#ef4444';
      return `
        <tr>
          <td>${PLATFORM_ICON2[p.platform] || '📱'} ${p.platform}</td>
          <td>${p.total}</td>
          <td style="color:#10b981">${p.met}</td>
          <td style="color:#ef4444">${p.breached}</td>
          <td style="font-weight:700;color:${color}">${p.compliance_pct != null ? p.compliance_pct + '%' : '—'}</td>
        </tr>`;
    }).join('');

    // أسوأ محادثات (أطول وقت استجابة)
    const worstRows = (data.worst_response || []).map(w => `
      <tr>
        <td>${w.contact_name || '—'}</td>
        <td>${PLATFORM_ICON2[w.platform] || '📱'} ${w.platform || ''}</td>
        <td style="color:#ef4444;font-weight:700">${w.response_fmt}</td>
        <td>${w.priority || '—'}</td>
      </tr>`).join('');

    body.className = 'iv4-an-ad-body-loaded';
    body.innerHTML = `
      <!-- Daily SLA Trend -->
      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">📅 الالتزام اليومي (أخضر≥80% / أصفر≥60% / أحمر&lt;60%)</div>
        ${data.daily.length ? `
          <div class="iv4-an-ad-bars">${dailyBars}</div>
          <div class="iv4-an-ad-bars-labels">
            <span>${data.daily[0]?.day?.slice(5) || ''}</span>
            <span>${data.daily[Math.floor(data.daily.length/2)]?.day?.slice(5) || ''}</span>
            <span>${data.daily[data.daily.length-1]?.day?.slice(5) || ''}</span>
          </div>` : '<p class="iv4-an-empty">لا توجد بيانات</p>'}
      </div>

      <!-- SLA by Platform -->
      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">📡 SLA بالمنصة</div>
        ${platRows ? `
          <div class="iv4-an-table-wrap">
            <table class="iv4-an-table">
              <thead><tr><th>المنصة</th><th>إجمالي</th><th>✅ ملتزم</th><th>❌ متجاوز</th><th>النسبة</th></tr></thead>
              <tbody>${platRows}</tbody>
            </table>
          </div>` : '<p class="iv4-an-empty">لا توجد بيانات</p>'}
      </div>

      <!-- Worst Response Times -->
      <div class="iv4-an-ad-section">
        <div class="iv4-an-ad-section-title">🐢 أطول أوقات استجابة (أسوأ 10)</div>
        ${worstRows ? `
          <div class="iv4-an-table-wrap">
            <table class="iv4-an-table">
              <thead><tr><th>العميل</th><th>المنصة</th><th>وقت الاستجابة</th><th>الأولوية</th></tr></thead>
              <tbody>${worstRows}</tbody>
            </table>
          </div>` : '<p class="iv4-an-empty">لا توجد بيانات</p>'}
      </div>
    `;
  }


  // ─── CSAT Section ─────────────────────────────────────────────────────────

  let _lastCSATData = null;

  function _renderCSAT(csatData) {
    const el = document.getElementById('iv4-an-csat');
    if (!el || !csatData) return;

    _lastCSATData = csatData;
    const s = csatData.summary;

    if (!s || !s.rated) {
      el.innerHTML = '<p class="iv4-an-empty">لا توجد تقييمات في هذه الفترة</p>';
      return;
    }

    // توزيع النجوم
    const allScores = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    (csatData.distribution || []).forEach(d => { allScores[d.score] = d.n; });
    const maxScore = Math.max(...Object.values(allScores), 1);

    const starBars = [5, 4, 3, 2, 1].map(star => {
      const n    = allScores[star] || 0;
      const pct  = Math.round((n / maxScore) * 100);
      const color = star >= 4 ? '#10b981' : star === 3 ? '#f59e0b' : '#ef4444';
      const stars = '⭐'.repeat(star);
      return `
        <div class="iv4-an-csat-bar-row">
          <span class="iv4-an-csat-star-lbl">${stars}</span>
          <div class="iv4-an-csat-bar-wrap">
            <div class="iv4-an-csat-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="iv4-an-csat-bar-n">${n}</span>
        </div>`;
    }).join('');

    // تطور يومي (mini bars ملونة بـ avg_score)
    const maxRated = Math.max(...(csatData.daily.map(d => d.rated)), 1);
    const dailyBars = csatData.daily.map(d => {
      const h     = Math.max(4, Math.round((d.rated / maxRated) * 48));
      const color = d.avg_score >= 4 ? '#10b981'
                  : d.avg_score >= 3 ? '#f59e0b' : '#ef4444';
      return `<div class="iv4-an-ad-bar" style="height:${h}px;background:${color}"
                   title="${d.day}: متوسط ${d.avg_score || '—'} — ${d.rated} تقييم"></div>`;
    }).join('');

    // جدول CSAT بالموظف
    const agentRows = (csatData.by_agent || []).map(a => {
      const stars = Math.round(a.avg_score || 0);
      const color = a.avg_score >= 4 ? '#10b981'
                  : a.avg_score >= 3 ? '#f59e0b' : '#ef4444';
      return `
        <tr>
          <td>👤 ${a.agent_name}</td>
          <td style="font-weight:700;color:${color}">${a.avg_score || '—'} ${'⭐'.repeat(stars)}</td>
          <td>${a.rated}</td>
          <td style="color:#10b981">${a.positive_pct}%</td>
        </tr>`;
    }).join('');

    const posColor = s.positive_pct >= 75 ? '#10b981' : s.positive_pct >= 50 ? '#f59e0b' : '#ef4444';
    const avgColor = s.avg_score  >= 4   ? '#10b981' : s.avg_score  >= 3   ? '#f59e0b' : '#ef4444';

    el.innerHTML = `
      <!-- Summary KPIs -->
      <div class="iv4-an-csat-kpis">
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:${avgColor}">${s.avg_score || '—'} ⭐</div>
          <div class="iv4-an-ad-kpi-lbl">متوسط التقييم</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val">${_fmt(s.rated)}</div>
          <div class="iv4-an-ad-kpi-lbl">إجمالي التقييمات</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:${posColor}">${s.positive_pct != null ? s.positive_pct + '%' : '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">إيجابية (4-5⭐)</div>
        </div>
        <div class="iv4-an-ad-kpi">
          <div class="iv4-an-ad-kpi-val" style="color:#ef4444">${s.negative_pct != null ? s.negative_pct + '%' : '—'}</div>
          <div class="iv4-an-ad-kpi-lbl">سلبية (1-2⭐)</div>
        </div>
      </div>

      <!-- Star Distribution + Daily Trend -->
      <div class="iv4-an-csat-split">
        <div class="iv4-an-csat-stars">
          <div class="iv4-an-ad-section-title" style="margin-bottom:8px">توزيع التقييمات</div>
          ${starBars}
        </div>

        <div class="iv4-an-csat-trend">
          <div class="iv4-an-ad-section-title" style="margin-bottom:8px">📅 تطور يومي</div>
          ${csatData.daily.length ? `
            <div class="iv4-an-ad-bars" style="height:56px">${dailyBars}</div>
            <div class="iv4-an-ad-bars-labels">
              <span>${csatData.daily[0]?.day?.slice(5) || ''}</span>
              <span>${csatData.daily[csatData.daily.length - 1]?.day?.slice(5) || ''}</span>
            </div>` :
            '<p class="iv4-an-empty">لا توجد بيانات</p>'}
        </div>
      </div>

      <!-- By Agent Table -->
      ${agentRows ? `
        <div class="iv4-an-ad-section-title" style="margin-top:4px">تقييمات الموظفين</div>
        <div class="iv4-an-table-wrap">
          <table class="iv4-an-table">
            <thead><tr><th>الموظف</th><th>التقييم</th><th>عدد</th><th>إيجابية</th></tr></thead>
            <tbody>${agentRows}</tbody>
          </table>
        </div>` : ''}
    `;
  }

  // ─── Export Full Excel (multi-sheet CSV) ──────────────────────────────────

  function _exportFullExcel() {
    // نصدّر 3 sheets كـ CSV منفصلة في ملف واحد مضغوط بـ section headers
    const BOM = '﻿';
    const sections = [];

    // Sheet 1: Overview KPIs — من آخر load
    sections.push('=== نظرة عامة ===');
    sections.push(`الفترة,${_from} → ${_to}`);
    sections.push('');

    // Sheet 2: Agents
    if (_lastAgentsData.length) {
      sections.push('=== أداء الموظفين ===');
      sections.push('الموظف,محادثات,مغلقة,معدل الإغلاق%,رسائل,أول رد(ث),وقت الإغلاق(ث)');
      _lastAgentsData.forEach(a => {
        sections.push([
          a.agent_name, a.total_convs, a.closed_convs,
          a.resolution_rate, a.messages_sent,
          a.avg_first_response_sec || '',
          a.avg_resolution_sec || '',
        ].join(','));
      });
      sections.push('');
    }

    // Sheet 3: CSAT by Agent
    if (_lastCSATData && _lastCSATData.by_agent && _lastCSATData.by_agent.length) {
      sections.push('=== تقييمات CSAT ===');
      sections.push(`إجمالي التقييمات,${_lastCSATData.summary.rated}`);
      sections.push(`متوسط التقييم,${_lastCSATData.summary.avg_score || '—'}`);
      sections.push(`إيجابية%,${_lastCSATData.summary.positive_pct || 0}%`);
      sections.push('');
      sections.push('الموظف,متوسط التقييم,عدد التقييمات,إيجابية%');
      _lastCSATData.by_agent.forEach(a => {
        sections.push([a.agent_name, a.avg_score || '', a.rated, a.positive_pct + '%'].join(','));
      });
      sections.push('');
    }

    // Sheet 4: CSAT Distribution
    if (_lastCSATData && _lastCSATData.distribution && _lastCSATData.distribution.length) {
      sections.push('=== توزيع النجوم ===');
      sections.push('التقييم,العدد');
      _lastCSATData.distribution.forEach(d => {
        sections.push(`${d.score} نجوم,${d.n}`);
      });
    }

    const blob = new Blob(
      [BOM + sections.join('\n')],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `inbox-report-${_from}-${_to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── P11-E3: Export PDF ────────────────────────────────────────────────────────────
  // يفتح tab جديد بـ HTML جاهز للطباعة
  async function _exportPDF() {
    const btn = document.getElementById('iv4-an-export-pdf');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري…'; }

    try {
      const url = InboxAPI.analytics.exportPdfUrl({ from: _from, to: _to });
      const win = window.open(url, '_blank');
      if (!win) {
        // لو popup محجوب → حمل مباشر
        const { data, error } = await InboxAPI.analytics.exportReport({ from: _from, to: _to, format: 'json' });
        if (error || !data) throw new Error(error || 'failed');
        _showPDFPreview(data);
      }
    } catch (e) {
      console.error('[PDF export]', e);
      _showToast('خطأ في تصدير PDF', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🖨️ تصدير PDF'; }
    }
  }

  /** fallback: تفتح نافذة معاينة عند منع popups */
  function _showPDFPreview(data) {
    const existing = document.getElementById('iv4-pdf-overlay');
    if (existing) existing.remove();

    const fmtSec = (s) => {
      if (!s) return '—';
      if (s < 60) return s + 'ث';
      if (s < 3600) return Math.round(s / 60) + 'د';
      const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
      return m > 0 ? `${h}س ${m}د` : `${h}س`;
    };

    const ov = data.overview || {};
    const overlay = document.createElement('div');
    overlay.id = 'iv4-pdf-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:720px;width:95%;max-height:90vh;overflow-y:auto;padding:24px;direction:rtl;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="font-size:18px;color:#1a1a2e">📄 تقرير Inbox — ${data.period?.from} إلى ${data.period?.to}</h2>
          <div style="display:flex;gap:8px;">
            <button onclick="window.print()" style="background:#6c5ce7;color:#fff;border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px">🖨️ طباعة</button>
            <button onclick="document.getElementById('iv4-pdf-overlay').remove()" style="background:#f3f4f6;border:1px solid #e5e7eb;padding:7px 12px;border-radius:6px;cursor:pointer;">✕</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
          ${[
            [ov.conversations, 'محادثات', ''],
            [(ov.resolution_rate || 0) + '%', 'نسبة الإغلاق', '#10b981'],
            [ov.avg_first_response_fmt || '—', 'متوسط أول رد', '#3b82f6'],
            [ov.avg_resolution_fmt || '—', 'متوسط الحل', ''],
            [ov.open_now, 'مفتوحة', '#f97316'],
            [ov.closed, 'مغلقة', ''],
            [ov.messages_inbound, 'رسائل واردة', '#3b82f6'],
            [ov.messages_outbound, 'رسائل صادرة', ''],
          ].map(([v, l, c]) =>
            `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:20px;font-weight:700;color:${c || '#111'}">${v ?? 0}</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${l}</div>
            </div>`
          ).join('')}
        </div>
        ${(data.agents || []).length ? `
          <div style="margin-bottom:20px;">
            <div style="font-weight:700;color:#6c5ce7;border-bottom:2px solid #ede9fc;padding-bottom:6px;margin-bottom:10px;">أداء الموظفين</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#f3f4f6;">${['الموظف','محادثات','مغلقة','نسبة الإغلاق','متوسط رد','CSAT'].map(h => `<th style="padding:7px 10px;text-align:right;color:#374151;font-size:11px;">${h}</th>`).join('')}</tr></thead>
              <tbody>${(data.agents || []).map(a =>
                `<tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:7px 10px;">${a.name}</td>
                  <td style="padding:7px 10px;">${a.total_convs}</td>
                  <td style="padding:7px 10px;">${a.closed_convs}</td>
                  <td style="padding:7px 10px;">${a.resolution_rate}%</td>
                  <td style="padding:7px 10px;">${a.avg_resp_fmt || '—'}</td>
                  <td style="padding:7px 10px;">${a.avg_csat != null ? a.avg_csat + '/5' : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
        ${(data.platforms || []).length ? `
          <div>
            <div style="font-weight:700;color:#6c5ce7;border-bottom:2px solid #ede9fc;padding-bottom:6px;margin-bottom:10px;">توزيع المنصات</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#f3f4f6;">${['المنصة','محادثات','النسبة'].map(h => `<th style="padding:7px 10px;text-align:right;">${h}</th>`).join('')}</tr></thead>
              <tbody>${(data.platforms || []).map(p =>
                `<tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:7px 10px;">${p.platform}</td>
                  <td style="padding:7px 10px;">${p.n}</td>
                  <td style="padding:7px 10px;">${ov.conversations > 0 ? Math.round((p.n / ov.conversations) * 100) : 0}%</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
        <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:11px;color:#9ca3af;text-align:center;">
          تم التوليد بواسطة Inbox v4 — أريج
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  function _showToast(msg, type = 'info') {
    // متشابك مع toast الموجود — نستخدم iv4-an-toast لو كان موجوداً
    const existing = document.querySelector('.iv4-an-toast');
    const el = existing || document.createElement('div');
    el.className = `iv4-an-toast iv4-an-toast-${type}`;
    el.textContent = msg;
    if (!existing) document.body.appendChild(el);
    setTimeout(() => el.remove?.(), 3000);
  }


  let _lastAgentsData = [];

  // ─── P7-4: Sentiment Analysis ─────────────────────────────────────────────

  /**
   * رسم قسم تحليل المشاعر
   * @param {Object} data - البيانات من /analytics/sentiment
   */
  function _renderSentiment(data) {
    const wrap = document.getElementById('iv4-an-sentiment');
    const hint = document.getElementById('iv4-an-sentiment-hint');
    if (!wrap) return;

    if (!data || !data.summary) {
      wrap.innerHTML = '<div class="iv4-an-empty">لا توجد بيانات كافية</div>';
      return;
    }

    const s = data.summary;
    const daily = data.daily || [];
    const topNeg = data.top_negative || [];

    // hint: عدد الرسائل المحلَّلة
    if (hint) {
      hint.textContent = s.total > 0
        ? `${s.total} رسالة محلَّلة (${s.analyzed_new || 0} جديدة / ${s.from_cache || 0} من الكاش)`
        : '';
    }

    if (s.total === 0) {
      wrap.innerHTML = '<div class="iv4-an-empty">لا توجد رسائل في هذه الفترة</div>';
      return;
    }

    const posP = s.positive_pct ?? 0;
    const neuP = s.neutral_pct  ?? 0;
    const negP = s.negative_pct ?? 0;

    // رسم SVG bar chart اليومي (مشاعر مكدسة)
    const svgChart = _renderSentimentChart(daily);

    wrap.innerHTML = `
      <!-- KPI Row -->
      <div class="iv4-an-sentiment-kpi">
        <div class="iv4-an-sentiment-pill iv4-sentiment--positive">
          <span class="iv4-sentiment-emoji">😊</span>
          <span class="iv4-sentiment-label">إيجابي</span>
          <span class="iv4-sentiment-pct">${posP}%</span>
          <span class="iv4-sentiment-count">${s.positive}</span>
        </div>
        <div class="iv4-an-sentiment-pill iv4-sentiment--neutral">
          <span class="iv4-sentiment-emoji">😐</span>
          <span class="iv4-sentiment-label">محايد</span>
          <span class="iv4-sentiment-pct">${neuP}%</span>
          <span class="iv4-sentiment-count">${s.neutral}</span>
        </div>
        <div class="iv4-an-sentiment-pill iv4-sentiment--negative">
          <span class="iv4-sentiment-emoji">😞</span>
          <span class="iv4-sentiment-label">سلبي</span>
          <span class="iv4-sentiment-pct">${negP}%</span>
          <span class="iv4-sentiment-count">${s.negative}</span>
        </div>
      </div>

      <!-- شريط التوزيع الكلي -->
      <div class="iv4-an-sentiment-bar-wrap" title="إيجابي ${posP}% / محايد ${neuP}% / سلبي ${negP}%">
        <div class="iv4-an-sentiment-bar">
          ${posP > 0 ? `<div class="iv4-sentiment-seg iv4-sentiment-seg--pos" style="width:${posP}%"></div>` : ''}
          ${neuP > 0 ? `<div class="iv4-sentiment-seg iv4-sentiment-seg--neu" style="width:${neuP}%"></div>` : ''}
          ${negP > 0 ? `<div class="iv4-sentiment-seg iv4-sentiment-seg--neg" style="width:${negP}%"></div>` : ''}
        </div>
      </div>

      <!-- Chart يومي -->
      ${daily.length > 1 ? `
        <div class="iv4-an-sentiment-chart-wrap">
          <div class="iv4-an-chart-title">توزيع المشاعر يومياً</div>
          ${svgChart}
        </div>
      ` : ''}

      <!-- Top Negative Conversations -->
      ${topNeg.length ? `
        <div class="iv4-an-sentiment-neg-section">
          <div class="iv4-an-chart-title">⚠️ أكثر محادثات سلبية</div>
          <div class="iv4-an-sentiment-neg-list">
            ${topNeg.map(c => `
              <div class="iv4-an-sentiment-neg-row" data-conv-id="${c.id}">
                <span class="iv4-an-sentiment-neg-name">${_esc(c.contact_name)}</span>
                <span class="iv4-an-platform-badge">${PLATFORM_ICON[c.platform] || '💬'} ${c.platform}</span>
                <span class="iv4-an-sentiment-neg-count">🔴 ${c.neg_count} رسالة سلبية</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // النقر على محادثة سلبية → فتحها في الـ inbox
    wrap.querySelectorAll('.iv4-an-sentiment-neg-row[data-conv-id]').forEach(row => {
      row.style.cursor = 'pointer';
      row.onclick = () => {
        const convId = row.dataset.convId;
        if (convId && window.InboxStore) {
          window.InboxAnalytics.close();
          InboxStore.emit('open:conversation', convId);
        }
      };
    });
  }

  /**
   * SVG Stacked Bar Chart للمشاعر اليومية
   */
  function _renderSentimentChart(daily) {
    if (!daily.length) return '';

    const W = 600, H = 100, padL = 0, padR = 0, barGap = 2;
    const barW = Math.max(4, Math.floor((W - padL - padR) / daily.length) - barGap);

    const bars = daily.map((d, i) => {
      const x    = padL + i * (barW + barGap);
      const tot  = d.total || 1;
      const posH = Math.round((d.positive / tot) * H);
      const neuH = Math.round((d.neutral  / tot) * H);
      const negH = H - posH - neuH;

      // من أسفل: negative → neutral → positive
      const yNeg = H - negH;
      const yNeu = yNeg - neuH;
      const yPos = yNeu - posH;

      const tipText = `${d.day}\n😊 ${d.positive} / 😐 ${d.neutral} / 😞 ${d.negative}`;

      return `
        <g class="iv4-sentiment-bar-group" title="${tipText}">
          ${negH > 0 ? `<rect x="${x}" y="${yNeg}" width="${barW}" height="${negH}" fill="#ef4444" rx="1"/>` : ''}
          ${neuH > 0 ? `<rect x="${x}" y="${yNeu}" width="${barW}" height="${neuH}" fill="#f59e0b" rx="1"/>` : ''}
          ${posH > 0 ? `<rect x="${x}" y="${yPos}" width="${barW}" height="${posH}" fill="#22c55e" rx="1"/>` : ''}
        </g>
      `;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="iv4-an-sentiment-svg" preserveAspectRatio="none">
      ${bars}
    </svg>`;
  }

  function _exportAgentsCSV() {
    if (!_lastAgentsData.length) return;
    const header = 'الموظف,محادثات,مغلقة,معدل الإغلاق%,رسائل أُرسلت,وقت أول رد,وقت الإغلاق';
    const rows = _lastAgentsData.map(a =>
      [a.agent_name, a.total_convs, a.closed_convs,
       a.resolution_rate, a.messages_sent,
       a.avg_first_response_sec || '',
       a.avg_resolution_sec || ''].join(',')
    );
    const blob = new Blob(['\ufeff' + header + '\n' + rows.join('\n')],
      { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inbox-agents-${_from}-${_to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Tooltip ─────────────────────────────────────────────────────────────

  let _tooltipEl = null;

  function _showChartTooltip(e, text) {
    if (!_tooltipEl) {
      _tooltipEl = document.createElement('div');
      _tooltipEl.className = 'iv4-an-tooltip';
      document.body.appendChild(_tooltipEl);
    }
    _tooltipEl.textContent = text;
    _tooltipEl.style.display = 'block';
    _tooltipEl.style.left = (e.pageX + 10) + 'px';
    _tooltipEl.style.top  = (e.pageY - 28) + 'px';
  }

  function _hideChartTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  // ─── Load All Data ────────────────────────────────────────────────────────

  async function _loadAll() {
    if (_loading) return;
    _loading = true;

    const loadBar = document.getElementById('iv4-an-loading');
    if (loadBar) loadBar.classList.remove('hidden');

    try {
      // نجلب كل الـ endpoints بالتوازي
      const [overviewRes, slaRes, agentsRes, platformsRes, volumeRes, hourlyRes, csatRes, sentimentRes] = await Promise.all([
        InboxAPI.analytics.overview({ from: _from, to: _to }),
        InboxAPI.analytics.sla({ from: _from, to: _to }),
        InboxAPI.analytics.agentStats({ from: _from, to: _to }),
        InboxAPI.analytics.platforms({ from: _from, to: _to }),
        InboxAPI.analytics.volume({ from: _from, to: _to }),
        InboxAPI.analytics.hourly({ from: _from, to: _to }),
        InboxAPI.analytics.csat({ from: _from, to: _to }),
        InboxAPI.analytics.sentiment({ from: _from, to: _to }),
      ]);

      // رسم كل قسم
      if (!overviewRes.error)   _renderKPI(overviewRes.data);
      if (!volumeRes.error)     _renderVolumeChart(volumeRes.data?.volume || []);
      if (!hourlyRes.error)     _renderHourly(hourlyRes.data?.hourly || []);
      if (!platformsRes.error)  _renderPlatforms(platformsRes.data?.platforms || []);
      if (!slaRes.error)        _renderSLA(slaRes.data);
      if (!csatRes.error)       _renderCSAT(csatRes.data);
      if (!agentsRes.error)     _renderAgents(agentsRes.data?.agents || []);
      if (!sentimentRes.error)  _renderSentiment(sentimentRes.data);

      // لو في أخطاء — اعرض toast
      const errors = [overviewRes, slaRes, agentsRes, platformsRes, volumeRes, hourlyRes, csatRes, sentimentRes]
        .filter(r => r.error).map(r => r.error);
      if (errors.length && window.showInboxToast) {
        window.showInboxToast('خطأ في تحميل بعض البيانات: ' + errors[0], 'error');
      }

    } catch (e) {
      console.error('[InboxAnalytics]', e);
    } finally {
      _loading = false;
      if (loadBar) loadBar.classList.add('hidden');
    }
  }

  // ─── Range Preset Buttons ─────────────────────────────────────────────────

  function _bindRangeButtons() {
    // Preset buttons
    _overlay.querySelectorAll('.iv4-an-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        _overlay.querySelectorAll('.iv4-an-preset')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _applyPreset(btn.dataset.preset);
        // حدّث date inputs
        const fromInput = document.getElementById('iv4-an-from');
        const toInput   = document.getElementById('iv4-an-to');
        if (fromInput) fromInput.value = _from;
        if (toInput)   toInput.value   = _to;
        _loadAll();
      });
    });

    // Custom range apply
    const applyBtn = document.getElementById('iv4-an-apply-range');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const from = document.getElementById('iv4-an-from').value;
        const to   = document.getElementById('iv4-an-to').value;
        if (from && to && from <= to) {
          _from   = from;
          _to     = to;
          _preset = 'custom';
          _overlay.querySelectorAll('.iv4-an-preset')
            .forEach(b => b.classList.remove('active'));
          _loadAll();
        } else if (window.showInboxToast) {
          window.showInboxToast('تحقق من التاريخ: من ← إلى', 'error');
        }
      });
    }

    // Close button
    const closeBtn = document.getElementById('iv4-an-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    // Export CSV
    const exportBtn = document.getElementById('iv4-an-export-agents');
    if (exportBtn) {
      exportBtn.addEventListener('click', _exportAgentsCSV);
    }

    // زر SLA Detail
    const slaDetailBtn = document.getElementById('iv4-an-sla-detail-btn');
    if (slaDetailBtn) {
      slaDetailBtn.addEventListener('click', _openSLADetail);
    }

    // زر Export Full CSV
    const exportFullBtn = document.getElementById('iv4-an-export-full');
    if (exportFullBtn) {
      exportFullBtn.addEventListener('click', _exportFullExcel);
    }

    // زر Export PDF (P11-E3)
    const exportPdfBtn = document.getElementById('iv4-an-export-pdf');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', _exportPDF);
    }

    // إغلاق بالنقر على الـ overlay خارج الـ modal
    _overlay.addEventListener('click', e => {
      if (e.target === _overlay) close();
    });

    // Escape key
    document.addEventListener('keydown', _onKeyDown);
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape') close();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  function open() {
    // ضبط النطاق الافتراضي
    if (!_from || !_to) _applyPreset(_preset);

    // بناء الـ overlay
    _buildOverlay();

    // ضبط date inputs
    const fromInput = document.getElementById('iv4-an-from');
    const toInput   = document.getElementById('iv4-an-to');
    if (fromInput) fromInput.value = _from;
    if (toInput)   toInput.value   = _to;

    // ربط الأحداث
    _bindRangeButtons();

    // جلب البيانات
    _loadAll();

    // منع scroll الـ body
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
    if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _onKeyDown);
  }

  // ─── M4 T58: Page Module API (mount/unmount) ────────────────────────────
  // يُستخدم من shell.js عبر route /reports
  // يُغلّف الـ overlay الحالي داخل container خارجي
  // آخر تحديث: 2026-05-04

  let _pageContainer = null;
  let _liveInterval  = null;

  /**
   * mount — يفتح Analytics كـ full-page داخل container المُمرَّر
   * @param {HTMLElement} container
   * @param {Object}      params     - { section: 'overview'|'labels'|'automation'|'scheduled' }
   */
  function mount(container, params) {
    _pageContainer = container;
    const section  = (params && params.section) || 'overview';

    // T62: Permission-Aware — نقرأ الدور من InboxStore
    const roleId  = window.InboxStore?.state?.currentUser?.inbox_role_id;
    const roleMap = { 1: 'owner', 2: 'admin', 3: 'supervisor', 4: 'agent', 5: 'readonly' };
    const roleStr = roleMap[roleId] || 'agent';
    const canExport    = window.InboxStore?.can ? InboxStore.can('export')    : true;
    const canScheduled = ['owner', 'admin'].includes(roleStr);

    // بناء الـ page shell
    container.innerHTML = `
      <div class="iv4-an-page">

        <!-- Live Status Bar (T61) -->
        <div class="iv4-an-live-bar" id="iv4-an-live-bar">
          <span class="iv4-an-live-dot"></span>
          <span id="iv4-an-live-open">—</span> مفتوحة &nbsp;|
          &nbsp;<span id="iv4-an-live-agents">—</span> موظف أونلاين
        </div>

        <!-- Nav tabs -->
        <nav class="iv4-an-page-nav" id="iv4-an-page-nav">
          <button class="iv4-an-tab ${section==='overview'   ?'active':''}" data-section="overview"   >📈 نظرة عامة</button>
          <button class="iv4-an-tab ${section==='agents'     ?'active':''}" data-section="agents"     >👥 الموظفون</button>
          <button class="iv4-an-tab ${section==='labels'     ?'active':''}" data-section="labels"     >🏷 التصنيفات</button>
          <button class="iv4-an-tab ${section==='automation' ?'active':''}" data-section="automation" >🤖 الأتمتة والـ AI</button>
          <button class="iv4-an-tab ${section==='sla'        ?'active':''}" data-section="sla"        >⏱ SLA</button>
          <button class="iv4-an-tab ${section==='csat'       ?'active':''}" data-section="csat"       >⭐ CSAT</button>
          ${canScheduled
            ? `<button class="iv4-an-tab ${section==='scheduled'?'active':''}" data-section="scheduled">📅 مجدول</button>`
            : ''}
        </nav>

        <!-- Date Range -->
        <div class="iv4-an-range iv4-an-page-range">
          <button class="iv4-an-preset active" data-preset="7">7 أيام</button>
          <button class="iv4-an-preset" data-preset="30">30 يوم</button>
          <button class="iv4-an-preset" data-preset="90">90 يوم</button>
          <input type="date" id="iv4-an-from" class="iv4-an-date-input" />
          <span>→</span>
          <input type="date" id="iv4-an-to"   class="iv4-an-date-input" />
          <button id="iv4-an-apply-range" class="iv4-an-apply-btn">تطبيق</button>
          ${canExport ? `
            <button id="iv4-an-export-full" class="iv4-an-export-btn">⬇ CSV</button>
            <button id="iv4-an-export-pdf" class="iv4-an-export-btn iv4-an-export-btn--primary">🖨️ PDF</button>
          ` : ''}
        </div>

        <!-- Loading bar -->
        <div class="iv4-an-loading-bar hidden" id="iv4-an-loading"></div>

        <!-- Content area -->
        <div class="iv4-an-page-content" id="iv4-an-body"></div>

      </div>
    `;

    // ضبط النطاق الافتراضي
    if (!_from || !_to) _applyPreset('30');
    const fromInput = container.querySelector('#iv4-an-from');
    const toInput   = container.querySelector('#iv4-an-to');
    if (fromInput) fromInput.value = _from;
    if (toInput)   toInput.value   = _to;

    // T62: Agent → وجّه مباشرة لصفحته
    let activeSection = section;
    if (roleStr === 'agent') {
      const selfId = window.InboxStore?.state?.currentUser?.id;
      if (selfId) activeSection = 'agents';
    }

    // ربط tabs
    container.querySelectorAll('.iv4-an-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.iv4-an-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _loadPageSection(btn.dataset.section, roleStr);
      });
    });

    // ربط date range
    _bindPageRange(container, roleStr);

    // T61: Live Status Bar
    _startLiveBar();

    // تحميل القسم الأول
    _loadPageSection(activeSection, roleStr);
  }

  /**
   * unmount — تنظيف عند مغادرة صفحة Analytics
   */
  function unmount() {
    if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }
    _pageContainer = null;
  }

  // ─── Page Section Loader ─────────────────────────────────────────────────

  function _loadPageSection(section, roleStr) {
    const body = document.getElementById('iv4-an-body');
    if (!body) return;
    body.innerHTML = '<div class="iv4-an-page-loading">جارٍ التحميل...</div>';

    const selfId = window.InboxStore?.state?.currentUser?.id;

    switch (section) {
      case 'overview':
        _loadAll_page();       break;
      case 'agents':
        // T62: agent يرى نفسه فقط
        if (roleStr === 'agent' && selfId) {
          _loadAgentDetail_page(selfId);
        } else {
          _loadAgents_page();
        }
        break;
      case 'labels':
        _loadLabels_page();    break;
      case 'automation':
        _loadAutomation_page(); break;
      case 'sla':
        _loadSLA_page();       break;
      case 'csat':
        _loadCSAT_page();      break;
      case 'scheduled':
        _loadScheduled_page(); break;
      default:
        _loadAll_page();
    }
  }

  // تحميل overview (نفس الـ _loadAll الحالي ولكن داخل iv4-an-body)
  function _loadAll_page() {
    if (!_from || !_to) _applyPreset('30');
    _setLoading(true);
    // FIX-006: استخدام InboxAPI._get بدل fetch() الخام (كان بيفشل 401)
    Promise.all([
      InboxAPI._get(`/inbox/analytics/overview?from=${_from}&to=${_to}`).then(r => r.data || r),
      InboxAPI._get(`/inbox/analytics/volume?from=${_from}&to=${_to}`).then(r => r.data || r),
      InboxAPI._get(`/inbox/analytics/hourly?from=${_from}&to=${_to}`).then(r => r.data || r),
      InboxAPI._get(`/inbox/analytics/platforms?from=${_from}&to=${_to}`).then(r => r.data || r),
    ]).then(([ov, vol, hr, plat]) => {
      _setLoading(false);
      const body = document.getElementById('iv4-an-body');
      if (!body) return;
      body.innerHTML = `
        <section class="iv4-an-section">
          <h3 class="iv4-an-section-title">📈 نظرة عامة</h3>
          <div class="iv4-an-kpi-grid" id="iv4-an-kpi-grid"></div>
        </section>
        <section class="iv4-an-section">
          <h3 class="iv4-an-section-title">📅 حجم المحادثات يومياً</h3>
          <div class="iv4-an-chart-wrap"><canvas id="iv4-an-volume-chart" class="iv4-an-canvas"></canvas></div>
        </section>
        <section class="iv4-an-section iv4-an-section--half">
          <h3 class="iv4-an-section-title">🕐 أوقات الذروة</h3>
          <div id="iv4-an-hourly" class="iv4-an-hourly"></div>
        </section>
        <section class="iv4-an-section iv4-an-section--half">
          <h3 class="iv4-an-section-title">📡 توزيع المنصات</h3>
          <div id="iv4-an-platforms" class="iv4-an-platforms"></div>
        </section>
      `;
      if (ov.ok)   _renderKPI(ov);
      if (vol.ok)  _renderVolumeChart(vol.volume || []);
      if (hr.ok)   _renderHourly(hr.hourly || []);
      if (plat.ok) _renderPlatforms(plat.platforms || []);
    }).catch((err) => {
      _setLoading(false);
      const body = document.getElementById('iv4-an-body');
      if (body) body.innerHTML = '<div class="iv4-an-empty" style="color:#ef4444;padding:32px">❌ حدث خطأ أثناء تحميل التقارير</div>';
    });
  }

  // تحميل قسم الموظفين
  function _loadAgents_page() {
    InboxAPI._get(`/inbox/analytics/agents?from=${_from}&to=${_to}`)
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;
        if (!data.ok) {
          body.innerHTML = '<div class="iv4-an-empty">ليس لديك صلاحية لعرض هذا التقرير</div>';
          return;
        }
        _lastAgentsData = data.agents || [];
        body.innerHTML = `
          <section class="iv4-an-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">👥 أداء الموظفين</h3>
              <button id="iv4-an-export-agents" class="iv4-an-export-btn">⬇ تصدير CSV</button>
            </div>
            <div class="iv4-an-table-wrap">
              <table class="iv4-an-table">
                <thead><tr>
                  <th>الموظف</th><th>محادثات</th><th>مغلقة</th>
                  <th>معدل الإغلاق</th><th>رسائل أُرسلت</th>
                  <th>وقت أول رد</th><th>وقت الإغلاق</th>
                </tr></thead>
                <tbody id="iv4-an-agents-body"></tbody>
              </table>
            </div>
          </section>
        `;
        _renderAgents(data);
        document.getElementById('iv4-an-export-agents')
          ?.addEventListener('click', _exportAgentsCSV);
      })
      .catch(() => {
        const body = document.getElementById('iv4-an-body');
        if (body) body.innerHTML = '<div class="iv4-an-empty">خطأ في تحميل البيانات</div>';
      });
  }

  function _loadAgentDetail_page(agentId) {
    // تحميل تفاصيل موظف واحد (للـ agent role)
    InboxAPI._get(`/inbox/analytics/agents/${agentId}?from=${_from}&to=${_to}`)
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;
        if (!data.ok) {
          body.innerHTML = '<div class="iv4-an-empty">لا توجد بيانات كافية</div>';
          return;
        }
        body.innerHTML = `<section class="iv4-an-section" id="iv4-an-agent-detail"></section>`;
        _renderAgentDetail(data);
      })
      .catch(() => {});
  }

  // ─── T59: قسم Labels ──────────────────────────────────────────────────────
  // آخر تحديث: 2026-05-04

  function _loadLabels_page() {
    InboxAPI._get(`/inbox/analytics/labels?from=${_from}&to=${_to}`)
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;
        if (!data.ok || !data.labels) {
          body.innerHTML = '<div class="iv4-an-empty">لا توجد بيانات تصنيفات</div>';
          return;
        }
        const labels = data.labels;
        const maxCount = Math.max(...labels.map(l => l.conv_count || 0), 1);

        const rows = labels.map(l => `
          <tr>
            <td>
              <span class="iv4-an-label-dot" style="background:${_esc(l.color || '#888')}"></span>
              ${_esc(l.name)}
            </td>
            <td>${_fmt(l.conv_count)}</td>
            <td>
              <div class="iv4-an-bar-wrap">
                <div class="iv4-an-bar-fill" style="width:${Math.round((l.conv_count/maxCount)*100)}%;background:${_esc(l.color||'#6366f1')}"></div>
              </div>
            </td>
            <td>${l.avg_resolution_min != null ? Math.round(l.avg_resolution_min) + ' د' : '—'}</td>
          </tr>
        `).join('');

        body.innerHTML = `
          <section class="iv4-an-section">
            <h3 class="iv4-an-section-title">🏷 تحليل التصنيفات</h3>
            ${labels.length === 0
              ? '<div class="iv4-an-empty">لم يُستخدم أي تصنيف في هذه الفترة</div>'
              : `<div class="iv4-an-table-wrap">
                   <table class="iv4-an-table">
                     <thead><tr>
                       <th>التصنيف</th>
                       <th>عدد المحادثات</th>
                       <th>النسبة</th>
                       <th>متوسط وقت الحل</th>
                     </tr></thead>
                     <tbody>${rows}</tbody>
                   </table>
                 </div>`
            }
          </section>
        `;
      })
      .catch(() => {
        const body = document.getElementById('iv4-an-body');
        if (body) body.innerHTML = '<div class="iv4-an-empty">خطأ في تحميل التصنيفات</div>';
      });
  }

  // ─── T60: قسم AI & Automation ────────────────────────────────────────────
  // آخر تحديث: 2026-05-04

  function _loadAutomation_page() {
    Promise.all([
      InboxAPI._get(`/inbox/analytics/automation?from=${_from}&to=${_to}`).then(r => r.data || r),
      InboxAPI._get(`/inbox/analytics/sentiment?from=${_from}&to=${_to}`).then(r => r.data || r).catch(() => null),
    ]).then(([auto, sentiment]) => {
      const body = document.getElementById('iv4-an-body');
      if (!body) return;

      const kws = (auto.keyword_stats || []).map(k => `
        <tr><td>${_esc(k.keyword)}</td><td>${_fmt(k.trigger_count)}</td></tr>
      `).join('');

      body.innerHTML = `
        <section class="iv4-an-section">
          <h3 class="iv4-an-section-title">🤖 الأتمتة والـ AI</h3>
          <div class="iv4-an-kpi-grid">
            <div class="iv4-an-kpi-card">
              <div class="iv4-an-kpi-val">${_fmt(auto.chatbot_only)}</div>
              <div class="iv4-an-kpi-label">أُغلقت بالـ Chatbot</div>
            </div>
            <div class="iv4-an-kpi-card">
              <div class="iv4-an-kpi-val">${_fmt(auto.auto_closed)}</div>
              <div class="iv4-an-kpi-label">أُغلقت تلقائياً</div>
            </div>
            <div class="iv4-an-kpi-card">
              <div class="iv4-an-kpi-val">${_fmt(auto.ai_suggested)}</div>
              <div class="iv4-an-kpi-label">اقتراحات AI استُخدمت</div>
            </div>
            <div class="iv4-an-kpi-card">
              <div class="iv4-an-kpi-val">${auto.chatbot_completion_rate || 0}%</div>
              <div class="iv4-an-kpi-label">معدل إنجاز الـ Chatbot</div>
            </div>
          </div>
        </section>

        ${kws ? `
          <section class="iv4-an-section">
            <h3 class="iv4-an-section-title">🔑 الكلمات المفتاحية الأكثر تشغيلاً</h3>
            <div class="iv4-an-table-wrap">
              <table class="iv4-an-table">
                <thead><tr><th>الكلمة</th><th>مرات التشغيل</th></tr></thead>
                <tbody>${kws}</tbody>
              </table>
            </div>
          </section>` : ''}

        <!-- T60: Sentiment هنا (D-037) -->
        <section class="iv4-an-section" id="iv4-an-sentiment-section">
          <div class="iv4-an-section-header-row">
            <h3 class="iv4-an-section-title">🧠 تحليل المشاعر</h3>
            <span class="iv4-an-sentiment-hint" id="iv4-an-sentiment-hint"></span>
          </div>
          <div id="iv4-an-sentiment" class="iv4-an-sentiment-wrap"></div>
        </section>
      `;

      // رسم Sentiment (ينتقل لهنا حسب D-037)
      if (sentiment) _renderSentiment(sentiment);
    })
    .catch(() => {
      const body = document.getElementById('iv4-an-body');
      if (body) body.innerHTML = '<div class="iv4-an-empty">خطأ في تحميل بيانات الأتمتة</div>';
    });
  }

  // SLA page
  function _loadSLA_page() {
    InboxAPI._get(`/inbox/analytics/sla?from=${_from}&to=${_to}`)
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;
        body.innerHTML = `
          <section class="iv4-an-section">
            <h3 class="iv4-an-section-title">⏱ الالتزام بـ SLA</h3>
            <div id="iv4-an-sla" class="iv4-an-sla-grid"></div>
          </section>`;
        if (data.ok) _renderSLA(data);
      }).catch(() => {});
  }

  // CSAT page
  function _loadCSAT_page() {
    InboxAPI._get(`/inbox/analytics/csat?from=${_from}&to=${_to}`)
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;
        body.innerHTML = `
          <section class="iv4-an-section" id="iv4-an-csat-section">
            <h3 class="iv4-an-section-title">⭐ رضا العملاء (CSAT)</h3>
            <div id="iv4-an-csat" class="iv4-an-csat-wrap"></div>
          </section>`;
        if (data.ok) _renderCSAT(data);
      }).catch(() => {});
  }

  // ─── T63: قسم Scheduled Reports ─────────────────────────────────────────
  // مرئي لـ Owner / Admin فقط — Email delivery مؤجل Phase 10+ (D-034)
  // آخر تحديث: 2026-05-04

  function _loadScheduled_page() {
    InboxAPI._get('/inbox/analytics/scheduled')
      .then(r => r.data || r)
      .then(data => {
        const body = document.getElementById('iv4-an-body');
        if (!body) return;

        if (!data.ok) {
          body.innerHTML = '<div class="iv4-an-empty">هذا القسم للمدراء فقط</div>';
          return;
        }

        const reports = data.reports || [];
        const TYPE_LABEL = {
          overview:'نظرة عامة', agents:'الموظفون', sla:'SLA',
          csat:'CSAT', labels:'التصنيفات', automation:'الأتمتة', full:'شامل',
        };
        const FREQ_LABEL = { daily:'يومي', weekly:'أسبوعي', monthly:'شهري' };

        const rows = reports.map(r => `
          <tr>
            <td>${_esc(r.name)}</td>
            <td>${TYPE_LABEL[r.report_type] || r.report_type}</td>
            <td>${FREQ_LABEL[r.frequency]  || r.frequency}</td>
            <td>${r.send_hour}:00</td>
            <td>${(r.recipients || []).join(', ')}</td>
            <td>
              <span class="iv4-an-status-badge ${r.active ? 'active' : 'inactive'}">
                ${r.active ? '✅ مفعّل' : '⏸ موقوف'}
              </span>
            </td>
            <td>
              <button class="iv4-an-del-btn" data-id="${r.id}" title="حذف">🗑</button>
              <button class="iv4-an-toggle-btn" data-id="${r.id}" data-active="${r.active}"
                title="${r.active ? 'إيقاف' : 'تفعيل'}">
                ${r.active ? '⏸' : '▶'}
              </button>
            </td>
          </tr>
        `).join('');

        body.innerHTML = `
          <section class="iv4-an-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">📅 التقارير المجدولة</h3>
              <button id="iv4-an-new-report-btn" class="iv4-an-export-btn iv4-an-export-btn--primary">
                + تقرير جديد
              </button>
            </div>
            <p class="iv4-an-note">⚠️ إرسال البريد الإلكتروني قيد التطوير — سيُفعَّل قريباً</p>
            ${ reports.length === 0
              ? '<div class="iv4-an-empty">لا توجد تقارير مجدولة بعد</div>'
              : `<div class="iv4-an-table-wrap">
                   <table class="iv4-an-table">
                     <thead><tr>
                       <th>الاسم</th><th>النوع</th><th>التكرار</th>
                       <th>الوقت</th><th>المستلمون</th><th>الحالة</th><th>إجراءات</th>
                     </tr></thead>
                     <tbody>${rows}</tbody>
                   </table>
                 </div>`
            }
          </section>

          <!-- Modal إنشاء تقرير -->
          <div class="iv4-an-modal-backdrop hidden" id="iv4-an-sched-modal">
            <div class="iv4-an-modal-box">
              <h3>📅 تقرير جديد</h3>
              <label>الاسم
                <input id="iv4-sched-name" class="iv4-an-input" placeholder="مثال: تقرير أسبوعي" />
              </label>
              <label>نوع البيانات
                <select id="iv4-sched-type" class="iv4-an-input">
                  <option value="overview">نظرة عامة</option>
                  <option value="agents">الموظفون</option>
                  <option value="sla">SLA</option>
                  <option value="csat">CSAT</option>
                  <option value="labels">التصنيفات</option>
                  <option value="automation">الأتمتة</option>
                  <option value="full">شامل</option>
                </select>
              </label>
              <label>التكرار
                <select id="iv4-sched-freq" class="iv4-an-input">
                  <option value="daily">يومي</option>
                  <option value="weekly">أسبوعي</option>
                  <option value="monthly">شهري</option>
                </select>
              </label>
              <label>وقت الإرسال (ساعة)
                <input id="iv4-sched-hour" type="number" min="0" max="23" value="8" class="iv4-an-input" />
              </label>
              <label>المستلمون (بريد إلكتروني، مفصول بفاصلة)
                <input id="iv4-sched-recip" class="iv4-an-input" placeholder="ahmed@example.com, ali@example.com" />
              </label>
              <div class="iv4-an-modal-actions">
                <button id="iv4-sched-save" class="iv4-an-export-btn iv4-an-export-btn--primary">حفظ</button>
                <button id="iv4-sched-cancel" class="iv4-an-export-btn">إلغاء</button>
              </div>
            </div>
          </div>
        `;

        // ربط أحداث الجدول
        body.querySelectorAll('.iv4-an-del-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            if (!confirm('حذف هذا التقرير؟')) return;
            InboxAPI._fetch(`/inbox/analytics/scheduled/${btn.dataset.id}`, { method: 'DELETE' })
              .then(r => r.data || r)
              .then(d => { if (d.ok) _loadScheduled_page(); });
          });
        });

        body.querySelectorAll('.iv4-an-toggle-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const newActive = btn.dataset.active === '1' ? 0 : 1;
            InboxAPI._fetch(`/inbox/analytics/scheduled/${btn.dataset.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: newActive }),
            }).then(r => r.data || r).then(d => { if (d.ok) _loadScheduled_page(); });
          });
        });

        // modal إنشاء
        document.getElementById('iv4-an-new-report-btn')
          ?.addEventListener('click', () => {
            document.getElementById('iv4-an-sched-modal')?.classList.remove('hidden');
          });
        document.getElementById('iv4-sched-cancel')
          ?.addEventListener('click', () => {
            document.getElementById('iv4-an-sched-modal')?.classList.add('hidden');
          });
        document.getElementById('iv4-sched-save')
          ?.addEventListener('click', () => {
            const name    = document.getElementById('iv4-sched-name')?.value.trim();
            const type    = document.getElementById('iv4-sched-type')?.value;
            const freq    = document.getElementById('iv4-sched-freq')?.value;
            const hour    = parseInt(document.getElementById('iv4-sched-hour')?.value || '8', 10);
            const recipRaw = document.getElementById('iv4-sched-recip')?.value || '';
            const recips  = recipRaw.split(',').map(s => s.trim()).filter(Boolean);

            if (!name || recips.length === 0) {
              alert('الاسم والمستلمون مطلوبان');
              return;
            }

            InboxAPI._fetch('/inbox/analytics/scheduled', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name, report_type: type, frequency: freq,
                send_hour: hour, recipients: recips, format: 'csv',
              }),
            })
              .then(r => r.data || r)
              .then(d => {
                if (d.ok) {
                  document.getElementById('iv4-an-sched-modal')?.classList.add('hidden');
                  _loadScheduled_page();
                } else {
                  alert(d.error || 'خطأ في الحفظ');
                }
              });
          });
      })
      .catch(() => {
        const body = document.getElementById('iv4-an-body');
        if (body) body.innerHTML = '<div class="iv4-an-empty">خطأ في تحميل التقارير المجدولة</div>';
      });
  }

  // ─── T61: Live Status Bar ────────────────────────────────────────────────
  // Polling كل 30 ثانية (D-033) — لا SSE جديد
  // آخر تدديث: 2026-05-04

  function _startLiveBar() {
    if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }

    const refresh = () => {
      InboxAPI._get('/inbox/analytics/overview?live=1')
        .then(r => r.data || r)
        .then(data => {
          const openEl   = document.getElementById('iv4-an-live-open');
          const agentsEl = document.getElementById('iv4-an-live-agents');
          if (openEl   && data.open_now   != null) openEl.textContent   = data.open_now;
          if (agentsEl && data.agents_online != null) agentsEl.textContent = data.agents_online;
        })
        .catch(() => {});
    };

    refresh(); // استدعاء فوري
    _liveInterval = setInterval(refresh, 30000); // كل 30 ثانية (D-033)
  }

  // ─── Page Range Binding ──────────────────────────────────────────────────

  function _bindPageRange(container, roleStr) {
    container.querySelectorAll('.iv4-an-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.iv4-an-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _applyPreset(btn.dataset.preset);
        const fi = container.querySelector('#iv4-an-from');
        const ti = container.querySelector('#iv4-an-to');
        if (fi) fi.value = _from;
        if (ti) ti.value = _to;
        // أعد تحميل القسم النشط
        const active = container.querySelector('.iv4-an-tab.active');
        if (active) _loadPageSection(active.dataset.section, roleStr);
      });
    });

    container.querySelector('#iv4-an-apply-range')
      ?.addEventListener('click', () => {
        const from = container.querySelector('#iv4-an-from')?.value;
        const to   = container.querySelector('#iv4-an-to')?.value;
        if (from && to && from <= to) {
          _from = from; _to = to; _preset = 'custom';
          container.querySelectorAll('.iv4-an-preset').forEach(b => b.classList.remove('active'));
          const active = container.querySelector('.iv4-an-tab.active');
          if (active) _loadPageSection(active.dataset.section, roleStr);
        }
      });

    container.querySelector('#iv4-an-export-full')
      ?.addEventListener('click', _exportFullExcel);
    container.querySelector('#iv4-an-export-pdf')
      ?.addEventListener('click', _exportPDF);
  }

  return { open, close, mount, unmount };

})();

window.InboxAnalytics = InboxAnalytics;
