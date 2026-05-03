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
            <h3 class="iv4-an-section-title">⏱ الالتزام بـ SLA</h3>
            <div id="iv4-an-sla" class="iv4-an-sla-grid">
              <!-- تُحمَّل ديناميكياً -->
            </div>
          </section>

          <!-- ── Section 6: Agents Table ── -->
          <section class="iv4-an-section">
            <div class="iv4-an-section-header-row">
              <h3 class="iv4-an-section-title">👥 أداء الموظفين</h3>
              <button id="iv4-an-export-agents" class="iv4-an-export-btn" title="تصدير CSV">⬇ CSV</button>
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
        <div class="iv4-an-platform-row">
          <span class="iv4-an-platform-icon">${icon}</span>
          <span class="iv4-an-platform-name">${p.platform || 'غير محدد'}</span>
          <div class="iv4-an-platform-bar-wrap">
            <div class="iv4-an-platform-bar" style="width:${pct}%"></div>
          </div>
          <span class="iv4-an-platform-pct">${pct}%</span>
          <span class="iv4-an-platform-count">${_fmt(p.total_convs)}</span>
          <span class="iv4-an-platform-close">${_fmt(p.closed_convs)} ✅</span>
        </div>
      `;
    }).join('');
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
      <tr>
        <td class="iv4-an-agent-name">👤 ${a.agent_name}</td>
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
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  let _lastAgentsData = [];

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
      const [overviewRes, slaRes, agentsRes, platformsRes, volumeRes, hourlyRes] = await Promise.all([
        InboxAPI.analytics.overview({ from: _from, to: _to }),
        InboxAPI.analytics.sla({ from: _from, to: _to }),
        InboxAPI.analytics.agentStats({ from: _from, to: _to }),
        InboxAPI.analytics.platforms({ from: _from, to: _to }),
        InboxAPI.analytics.volume({ from: _from, to: _to }),
        InboxAPI.analytics.hourly({ from: _from, to: _to }),
      ]);

      // رسم كل قسم
      if (!overviewRes.error)  _renderKPI(overviewRes.data);
      if (!volumeRes.error)    _renderVolumeChart(volumeRes.data?.volume || []);
      if (!hourlyRes.error)    _renderHourly(hourlyRes.data?.hourly || []);
      if (!platformsRes.error) _renderPlatforms(platformsRes.data?.platforms || []);
      if (!slaRes.error)       _renderSLA(slaRes.data);
      if (!agentsRes.error)    _renderAgents(agentsRes.data?.agents || []);

      // لو في أخطاء — اعرض toast
      const errors = [overviewRes, slaRes, agentsRes, platformsRes, volumeRes, hourlyRes]
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

  return { open, close };

})();

window.InboxAnalytics = InboxAnalytics;
