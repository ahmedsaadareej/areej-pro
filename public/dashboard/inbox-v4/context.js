/**
 * context.js — Context Panel لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P5-2 Order/Invoice History + CLV | P5-3 Quick Actions)
 *
 * المسؤوليات:
 *   - عرض بيانات العميل (الاسم / الهاتف / المدينة / CLV / الحالة)
 *   - ربط/إلغاء ربط جهة اتصال CRM
 *   - عرض الفواتير + الطلبات + روابط الدفع مع pagination + فلتر
 *   - CLV Dashboard تفصيلي (إحصائيات + رسم شهري)
 *   - Quick Actions: إنشاء فاتورة / رابط دفع بـ modal خفيف
 *   - تحديث تلقائي عند فتح محادثة جديدة
 *
 * يُستخدم:
 *   InboxContext.init()
 *   InboxContext.open(convId)
 *   InboxContext.close()
 */

const InboxContext = (() => {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _convId   = null;
  let _data     = null;  // آخر context مجلوب
  let _loading  = false;
  let _tab      = 'contact'; // contact | invoices | orders | pay | clv

  // Pagination + فلتر لكل tab
  const _pager = {
    invoices : { page: 1, total: 0, pages: 0, status: '', clv: null },
    orders   : { page: 1, total: 0, pages: 0, status: '' },
    pay      : { page: 1, total: 0, pages: 0 },
  };

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  function _panel()   { return $('iv4-context-panel'); }
  function _content() { return $('iv4-ctx-content');   }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('ar-EG', { minimumFractionDigits: 0 });
  }

  function _fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const STATUS_AR = {
    lead: 'ليد', prospect: 'محتمل', client: 'عميل',
    vip: '⭐ VIP', inactive: 'غير نشط', cold: 'بارد',
  };
  const ORDER_STATUS_AR = {
    new: 'جديد', processing: 'قيد التجهيز', preparing: 'تحضير',
    shipped: 'شُحن', delivered: 'تم التسليم', cancelled: 'ملغي', returned: 'مُرجَع',
  };
  const INV_STATUS_AR = {
    draft: 'مسودة', sent: 'مرسلة', paid: '✅ مدفوعة', cancelled: 'ملغاة',
  };
  const PAY_STATUS_AR = {
    active: 'نشط', paid: '✅ مدفوع', expired: 'منتهي', cancelled: 'ملغي',
  };

  // ─── API ──────────────────────────────────────────────────────────────────

  // wrapper يستخدم InboxAPI._fetch — يرجع data مباشرةً أو يرمي Exception
  async function _req(method, path, body) {
    const opts = method === 'GET' ? {} : {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    if (method !== 'GET') opts.method = method;
    const result = await InboxAPI._fetch(`/inbox${path}`, method !== 'GET' ? opts : {});
    if (result.error) throw new Error(result.error);
    return result.data;
  }

  async function _fetchContext(convId) {
    return _req('GET', `/conversations/${convId}/context`);
  }

  async function _fetchInvoices(convId, page, status) {
    const qs = `page=${page}&limit=10${status ? '&status=' + encodeURIComponent(status) : ''}`;
    return _req('GET', `/conversations/${convId}/context/invoices?${qs}`);
  }

  async function _fetchOrders(convId, page, status) {
    const qs = `page=${page}&limit=10${status ? '&status=' + encodeURIComponent(status) : ''}`;
    return _req('GET', `/conversations/${convId}/context/orders?${qs}`);
  }

  async function _fetchPayLinks(convId, page) {
    return _req('GET', `/conversations/${convId}/context/paylinks?page=${page}&limit=10`);
  }

  async function _fetchCLV(convId) {
    return _req('GET', `/conversations/${convId}/context/clv`);
  }

  async function _createInvoice(convId, amount, description) {
    return _req('POST', `/conversations/${convId}/context/invoice`, { amount, description });
  }

  async function _createPayLink(convId, amount, description) {
    return _req('POST', `/conversations/${convId}/context/paylink`, { amount, description });
  }

  async function _linkContact(convId, contactId) {
    return _req('POST', `/conversations/${convId}/context/link`, { contact_id: contactId });
  }

  async function _unlinkContact(convId) {
    return _req('POST', `/conversations/${convId}/context/link`, { contact_id: null });
  }

  async function _searchContacts(convId, q) {
    return _req('GET', `/conversations/${convId}/context/search?q=${encodeURIComponent(q)}`);
  }

  // ─── Render: Tab Bar ──────────────────────────────────────────────────────

  function _renderTabBar() {
    const tabs = [
      { id: 'contact',  icon: '👤', label: 'العميل'   },
      { id: 'invoices', icon: '📄', label: 'الفواتير' },
      { id: 'orders',   icon: '📦', label: 'الطلبات'  },
      { id: 'pay',      icon: '💳', label: 'الدفع'    },
      { id: 'clv',      icon: '📊', label: 'CLV'      },
    ];

    const container = document.querySelector('.iv4-ctx-tabs');
    if (!container) return;

    // احتفظ بزر الإغلاق
    const closeBtn = $('iv4-ctx-close');

    container.innerHTML = '';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = `iv4-ctx-tab${_tab === t.id ? ' active' : ''}`;
      btn.dataset.tab = t.id;
      btn.title = t.label;
      btn.innerHTML = `<span class="iv4-ctx-tab-icon">${t.icon}</span><span class="iv4-ctx-tab-label">${t.label}</span>`;
      btn.addEventListener('click', () => _switchTab(t.id));
      container.appendChild(btn);
    });

    if (closeBtn) container.appendChild(closeBtn);
  }

  function _switchTab(tab) {
    _tab = tab;
    document.querySelectorAll('.iv4-ctx-tab[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    // إعادة تعيين الـ page عند تغيير الـ tab
    if (_pager[tab]) _pager[tab].page = 1;
    _renderCurrentTab();
  }

  // ─── Render: Loading ──────────────────────────────────────────────────────

  function _renderLoading() {
    _content().innerHTML = `
      <div class="iv4-ctx-loading">
        <div class="iv4-ctx-spinner"></div>
        <span>جارٍ التحميل...</span>
      </div>`;
  }

  // ─── Render: Error ────────────────────────────────────────────────────────

  function _renderError(msg) {
    _content().innerHTML = `
      <div class="iv4-ctx-error">
        <span class="iv4-ctx-error-icon">⚠️</span>
        <p>${msg || 'حدث خطأ'}</p>
        <button class="iv4-btn iv4-btn-sm" onclick="InboxContext.reload()">إعادة المحاولة</button>
      </div>`;
  }

  // ─── Render: Tab Content ──────────────────────────────────────────────────

  function _renderCurrentTab() {
    if (!_data) return;
    switch (_tab) {
      case 'contact':  _renderContact();  break;
      case 'invoices': _loadInvoices();   break;
      case 'orders':   _loadOrders();     break;
      case 'pay':      _loadPayLinks();   break;
      case 'clv':      _loadCLV();        break;
    }
  }

  // ── Tab: Contact ──────────────────────────────────────────────────────────

  function _renderContact() {
    const { contact, conv, clv, conv_stats, linked } = _data;

    let html = `<div class="iv4-ctx-section">`;

    if (linked && contact) {
      // ── بيانات العميل المرتبط ──────────────────────────────────────
      const statusLabel = STATUS_AR[contact.status] || contact.status || '—';
      const clvFmt      = _fmt(clv);

      html += `
        <div class="iv4-ctx-contact-header">
          <div class="iv4-ctx-avatar">${(contact.name || '?')[0].toUpperCase()}</div>
          <div class="iv4-ctx-contact-info">
            <div class="iv4-ctx-contact-name">${_esc(contact.name)}</div>
            <div class="iv4-ctx-contact-phone">${_esc(contact.phone || '—')}</div>
          </div>
          <span class="iv4-ctx-badge iv4-ctx-badge--${contact.status || 'lead'}">${statusLabel}</span>
        </div>

        <div class="iv4-ctx-stats-row">
          <div class="iv4-ctx-stat">
            <div class="iv4-ctx-stat-val">ج.م ${clvFmt}</div>
            <div class="iv4-ctx-stat-label">CLV (المدفوع)</div>
          </div>
          <div class="iv4-ctx-stat">
            <div class="iv4-ctx-stat-val">${_fmt(contact.total_invoiced)}</div>
            <div class="iv4-ctx-stat-label">إجمالي الفواتير</div>
          </div>
          <div class="iv4-ctx-stat">
            <div class="iv4-ctx-stat-val">${conv_stats.total || 0}</div>
            <div class="iv4-ctx-stat-label">محادثات</div>
          </div>
        </div>

        <div class="iv4-ctx-fields">`;

      if (contact.email)        html += _field('البريد',     _esc(contact.email));
      if (contact.city)         html += _field('المدينة',    _esc(contact.city));
      if (contact.governorate)  html += _field('المحافظة',   _esc(contact.governorate));
      if (contact.company_name) html += _field('الشركة',     _esc(contact.company_name));
      if (contact.source)       html += _field('المصدر',     _esc(contact.source));
      if (contact.birthday)     html += _field('تاريخ الميلاد', _fmtDate(contact.birthday));
      if (contact.notes)        html += _field('ملاحظات',    `<span class="iv4-ctx-notes">${_esc(contact.notes)}</span>`);

      html += `</div>`;

      // زر إلغاء الربط + زر فتح صفحة CRM
      html += `
        <div class="iv4-ctx-actions">
          <a href="/dashboard/crm#contact-${contact.id}" target="_blank"
             class="iv4-btn iv4-btn-sm iv4-btn-ghost">🔗 فتح في CRM</a>
          <button class="iv4-btn iv4-btn-sm iv4-btn-ghost iv4-ctx-unlink-btn"
                  onclick="InboxContext._unlink()">إلغاء الربط</button>
        </div>`;

    } else {
      // ── بيانات الرسالة فقط (غير مرتبط) ───────────────────────────
      html += `
        <div class="iv4-ctx-contact-header iv4-ctx-unlinked">
          <div class="iv4-ctx-avatar iv4-ctx-avatar--gray">?</div>
          <div class="iv4-ctx-contact-info">
            <div class="iv4-ctx-contact-name">${_esc(conv.sender?.name || 'غير معروف')}</div>
            <div class="iv4-ctx-contact-phone">${_esc(conv.sender?.phone || conv.sender?.id || '—')}</div>
          </div>
          <span class="iv4-ctx-badge iv4-ctx-badge--gray">غير مرتبط</span>
        </div>
        <p class="iv4-ctx-hint">هذه المحادثة غير مرتبطة بعميل في CRM.</p>`;

      // ── Link Search ────────────────────────────────────────────────
      html += `
        <div class="iv4-ctx-link-section">
          <label class="iv4-ctx-label">ربط بعميل موجود</label>
          <div class="iv4-ctx-search-wrap">
            <input id="iv4-ctx-search-input" class="iv4-ctx-search-input"
                   type="text" placeholder="ابحث بالاسم أو الهاتف..."
                   autocomplete="off" />
            <div id="iv4-ctx-search-results" class="iv4-ctx-search-results hidden"></div>
          </div>
        </div>`;
    }

    html += `</div>`;
    _content().innerHTML = html;

    // bind search
    if (!linked) {
      _bindLinkSearch();
    }
  }

  // ── Tab: Invoices — async مع pagination + فلتر ──────────────────────────

  async function _loadInvoices() {
    const { contact } = _data;
    if (!contact) {
      _content().innerHTML = `<div class="iv4-ctx-section"><p class="iv4-ctx-hint">اربط العميل أولاً لعرض الفواتير.</p></div>`;
      return;
    }
    _content().innerHTML = `<div class="iv4-ctx-section"><div class="iv4-ctx-loading"><div class="iv4-ctx-spinner"></div></div></div>`;

    try {
      const p   = _pager.invoices;
      const res = await _fetchInvoices(_convId, p.page, p.status);
      p.total = res.total; p.pages = res.pages; p.clv = res.clv;
      _renderInvoices(res.invoices, contact);
    } catch (err) {
      _renderError(err.message);
    }
  }

  function _renderInvoices(invoices, contact) {
    const p = _pager.invoices;

    // ── فلتر أزرار ────────────────────────────────────────────────────
    const filters = [
      { v: '',           l: 'الكل' },
      { v: 'paid',       l: '✅ مدفوعة' },
      { v: 'sent',       l: 'مرسلة' },
      { v: 'draft',      l: 'مسودة' },
      { v: 'cancelled',  l: 'ملغاة' },
    ];
    let html = `<div class="iv4-ctx-section">`;

    // ── CLV mini summary ──────────────────────────────────────────────
    if (p.clv) {
      html += `
        <div class="iv4-ctx-clv-mini">
          <div class="iv4-ctx-clv-mini-item">
            <span class="iv4-ctx-clv-mini-val">ج.م ${_fmt(p.clv.total_paid)}</span>
            <span class="iv4-ctx-clv-mini-lbl">مدفوع</span>
          </div>
          <div class="iv4-ctx-clv-mini-item">
            <span class="iv4-ctx-clv-mini-val">${p.clv.invoice_count || 0}</span>
            <span class="iv4-ctx-clv-mini-lbl">فاتورة</span>
          </div>
          <div class="iv4-ctx-clv-mini-item">
            <span class="iv4-ctx-clv-mini-val">ج.م ${_fmt(p.clv.avg_order_value)}</span>
            <span class="iv4-ctx-clv-mini-lbl">متوسط</span>
          </div>
        </div>`;
    }

    // ── زر Quick Action + فلتر ────────────────────────────────────────
    html += `
      <div class="iv4-ctx-toolbar">
        <button class="iv4-btn iv4-btn-xs iv4-btn-primary" onclick="InboxContext._quickInvoice()">+ فاتورة</button>
        <div class="iv4-ctx-filter-pills">
          ${filters.map(f => `
            <button class="iv4-ctx-filter-pill${p.status === f.v ? ' active' : ''}"
                    data-status="${f.v}" onclick="InboxContext._filterInvoices('${f.v}')">${f.l}</button>
          `).join('')}
        </div>
      </div>`;

    if (!invoices || invoices.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد فواتير بهذا الفلتر.</p>`;
    } else {
      html += `<div class="iv4-ctx-list">`;
      for (const inv of invoices) {
        const statusLabel = INV_STATUS_AR[inv.status] || inv.status;
        html += `
          <div class="iv4-ctx-list-item" onclick="window.open('/dashboard/invoices/${inv.id}','_blank')" style="cursor:pointer">
            <div class="iv4-ctx-list-main">
              <span class="iv4-ctx-list-title">${_esc(inv.invoice_no || `#${inv.id}`)}</span>
              <span class="iv4-ctx-badge iv4-ctx-badge--${inv.status}">${statusLabel}</span>
            </div>
            <div class="iv4-ctx-list-meta">
              <span>ج.م ${_fmt(inv.total)}</span>
              <span>${_fmtDate(inv.created_at)}</span>
            </div>
            ${inv.due_date ? `<div class="iv4-ctx-due">الاستحقاق: ${_fmtDate(inv.due_date)}</div>` : ''}
          </div>`;
      }
      html += `</div>`;

      // ── Pagination ────────────────────────────────────────────────
      html += _renderPager('invoices', p);

      html += `<a href="/dashboard/invoices?contact=${contact.id}" target="_blank"
                  class="iv4-btn iv4-btn-sm iv4-btn-ghost iv4-ctx-more-link">عرض كل الفواتير ↗</a>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Tab: Orders — async مع pagination + فلتر ────────────────────────────

  async function _loadOrders() {
    const { contact } = _data;
    if (!contact) {
      _content().innerHTML = `<div class="iv4-ctx-section"><p class="iv4-ctx-hint">اربط العميل أولاً لعرض الطلبات.</p></div>`;
      return;
    }
    _content().innerHTML = `<div class="iv4-ctx-section"><div class="iv4-ctx-loading"><div class="iv4-ctx-spinner"></div></div></div>`;

    try {
      const p   = _pager.orders;
      const res = await _fetchOrders(_convId, p.page, p.status);
      p.total = res.total; p.pages = res.pages;
      _renderOrders(res.orders, contact);
    } catch (err) {
      _renderError(err.message);
    }
  }

  function _renderOrders(orders, contact) {
    const p = _pager.orders;

    const filters = [
      { v: '',          l: 'الكل' },
      { v: 'new',       l: 'جديد' },
      { v: 'shipped',   l: 'شُحن' },
      { v: 'delivered', l: 'تسليم' },
      { v: 'cancelled', l: 'ملغي' },
    ];

    let html = `<div class="iv4-ctx-section">`;

    html += `
      <div class="iv4-ctx-toolbar">
        <div class="iv4-ctx-filter-pills">
          ${filters.map(f => `
            <button class="iv4-ctx-filter-pill${p.status === f.v ? ' active' : ''}"
                    data-status="${f.v}" onclick="InboxContext._filterOrders('${f.v}')">${f.l}</button>
          `).join('')}
        </div>
      </div>`;

    if (!orders || orders.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد طلبات بهذا الفلتر.</p>`;
    } else {
      html += `<div class="iv4-ctx-list">`;
      for (const ord of orders) {
        const statusLabel = ORDER_STATUS_AR[ord.status] || ord.status;
        html += `
          <div class="iv4-ctx-list-item">
            <div class="iv4-ctx-list-main">
              <span class="iv4-ctx-list-title">${_esc(ord.order_no || `#${ord.id}`)}</span>
              <span class="iv4-ctx-badge iv4-ctx-badge--order-${ord.status}">${statusLabel}</span>
            </div>
            <div class="iv4-ctx-list-meta">
              <span>ج.م ${_fmt(ord.total)}</span>
              <span>${_fmtDate(ord.created_at)}</span>
            </div>
            ${ord.tracking_no ? `<div class="iv4-ctx-tracking">🚚 ${_esc(ord.tracking_no)}</div>` : ''}
          </div>`;
      }
      html += `</div>`;

      // ── Pagination ────────────────────────────────────────────────
      html += _renderPager('orders', p);

      html += `<a href="/dashboard/orders?contact=${contact.id}" target="_blank"
                  class="iv4-btn iv4-btn-sm iv4-btn-ghost iv4-ctx-more-link">عرض كل الطلبات ↗</a>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Tab: Payment Links — async مع pagination ────────────────────────────

  async function _loadPayLinks() {
    const { contact, conv } = _data;
    _content().innerHTML = `<div class="iv4-ctx-section"><div class="iv4-ctx-loading"><div class="iv4-ctx-spinner"></div></div></div>`;

    try {
      const p   = _pager.pay;
      const res = await _fetchPayLinks(_convId, p.page);
      p.total = res.total; p.pages = res.pages;
      _renderPayLinks(res.pay_links, contact);
    } catch (err) {
      _renderError(err.message);
    }
  }

  function _renderPayLinks(pay_links, contact) {
    const p = _pager.pay;

    let html = `<div class="iv4-ctx-section">`;

    // ── زر Quick Action ───────────────────────────────────────────────
    html += `
      <div class="iv4-ctx-toolbar">
        <button class="iv4-btn iv4-btn-xs iv4-btn-primary" onclick="InboxContext._quickPayLink()">+ رابط دفع</button>
      </div>`;

    if (!pay_links || pay_links.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد روابط دفع لهذا العميل.</p>`;
    } else {
      html += `<div class="iv4-ctx-list">`;
      for (const pl of pay_links) {
        const statusLabel = PAY_STATUS_AR[pl.status] || pl.status;
        const payUrl = `/pay/${pl.token}`;
        html += `
          <div class="iv4-ctx-list-item">
            <div class="iv4-ctx-list-main">
              <span class="iv4-ctx-list-title">${_esc(pl.title || `رابط #${pl.id}`)}</span>
              <span class="iv4-ctx-badge iv4-ctx-badge--pay-${pl.status}">${statusLabel}</span>
            </div>
            <div class="iv4-ctx-list-meta">
              <span>ج.م ${_fmt(pl.amount)}</span>
              <span>${_fmtDate(pl.created_at)}</span>
            </div>
            <div class="iv4-ctx-pay-actions">
              <button class="iv4-ctx-copy-btn" title="نسخ الرابط"
                      onclick="InboxContext._copyPayLink('${_esc(payUrl)}')">📋 نسخ</button>
              ${pl.status === 'active' ? `
                <button class="iv4-ctx-send-btn" title="إرسال في المحادثة"
                        onclick="InboxContext._sendPayLink('${_esc(payUrl)}', ${pl.amount})">📤 إرسال</button>
              ` : ''}
            </div>
          </div>`;
      }
      html += `</div>`;

      // ── Pagination ────────────────────────────────────────────────
      html += _renderPager('pay', p);
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Tab: CLV Dashboard ────────────────────────────────────────────────────

  async function _loadCLV() {
    const { contact } = _data;
    if (!contact) {
      _content().innerHTML = `<div class="iv4-ctx-section"><p class="iv4-ctx-hint">اربط العميل أولاً لعرض CLV.</p></div>`;
      return;
    }
    _content().innerHTML = `<div class="iv4-ctx-section"><div class="iv4-ctx-loading"><div class="iv4-ctx-spinner"></div></div></div>`;

    try {
      const res = await _fetchCLV(_convId);
      _renderCLV(res.clv);
    } catch (err) {
      _renderError(err.message);
    }
  }

  function _renderCLV(clv) {
    if (!clv) {
      _content().innerHTML = `<div class="iv4-ctx-section"><p class="iv4-ctx-hint">لا توجد بيانات CLV.</p></div>`;
      return;
    }

    const pct = clv.conversion_rate || 0;

    let html = `<div class="iv4-ctx-section">`;

    // ── بطاقات الأرقام ────────────────────────────────────────────────
    html += `
      <div class="iv4-ctx-clv-grid">
        <div class="iv4-ctx-clv-card iv4-ctx-clv-primary">
          <div class="iv4-ctx-clv-card-val">ج.م ${_fmt(clv.total_paid)}</div>
          <div class="iv4-ctx-clv-card-lbl">💰 إجمالي المدفوع (CLV)</div>
        </div>
        <div class="iv4-ctx-clv-card">
          <div class="iv4-ctx-clv-card-val">${_fmt(clv.invoice_count)}</div>
          <div class="iv4-ctx-clv-card-lbl">📄 إجمالي الفواتير</div>
        </div>
        <div class="iv4-ctx-clv-card">
          <div class="iv4-ctx-clv-card-val">ج.م ${_fmt(clv.avg_order_value)}</div>
          <div class="iv4-ctx-clv-card-lbl">📈 متوسط قيمة الطلب</div>
        </div>
        <div class="iv4-ctx-clv-card">
          <div class="iv4-ctx-clv-card-val">${pct}%</div>
          <div class="iv4-ctx-clv-card-lbl">🎯 نسبة التحويل</div>
        </div>
        <div class="iv4-ctx-clv-card">
          <div class="iv4-ctx-clv-card-val">ج.م ${_fmt(clv.pending_amount)}</div>
          <div class="iv4-ctx-clv-card-lbl">⏳ معلّق</div>
        </div>
        <div class="iv4-ctx-clv-card">
          <div class="iv4-ctx-clv-card-val">${_fmt(clv.order_count)}</div>
          <div class="iv4-ctx-clv-card-lbl">📦 إجمالي الطلبات</div>
        </div>
      </div>`;

    // ── شريط التحويل ─────────────────────────────────────────────────
    html += `
      <div class="iv4-ctx-clv-progress">
        <div class="iv4-ctx-clv-progress-label">
          <span>نسبة التحويل: ${clv.paid_count || 0} مدفوعة من ${clv.invoice_count || 0}</span>
          <span>${pct}%</span>
        </div>
        <div class="iv4-ctx-clv-progress-bar">
          <div class="iv4-ctx-clv-progress-fill" style="width:${Math.min(pct,100)}%"></div>
        </div>
      </div>`;

    // ── تواريخ أول وآخر معاملة ──────────────────────────────────────
    html += `
      <div class="iv4-ctx-clv-dates">
        <div class="iv4-ctx-clv-date-item">
          <span class="iv4-ctx-field-label">أول معاملة</span>
          <span class="iv4-ctx-field-value">${_fmtDate(clv.first_invoice_at)}</span>
        </div>
        <div class="iv4-ctx-clv-date-item">
          <span class="iv4-ctx-field-label">آخر معاملة</span>
          <span class="iv4-ctx-field-value">${_fmtDate(clv.last_invoice_at)}</span>
        </div>
      </div>`;

    // ── الرسم الشهري (mini bar chart) ───────────────────────────────
    if (clv.monthly_spend && clv.monthly_spend.length > 0) {
      const maxVal = Math.max(...clv.monthly_spend.map(m => m.amount || 0), 1);
      html += `
        <div class="iv4-ctx-clv-chart">
          <div class="iv4-ctx-clv-chart-title">الإنفاق الشهري (آخر 12 شهراً)</div>
          <div class="iv4-ctx-clv-bars">`;

      for (const m of clv.monthly_spend) {
        const h = Math.max(4, Math.round((m.amount / maxVal) * 60));
        html += `
          <div class="iv4-ctx-clv-bar-wrap" title="${m.month}: ج.م ${_fmt(m.amount)}">
            <div class="iv4-ctx-clv-bar" style="height:${h}px"></div>
            <div class="iv4-ctx-clv-bar-label">${m.month ? m.month.slice(5) : ''}</div>
          </div>`;
      }

      html += `</div></div>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Helper: Pagination Buttons ────────────────────────────────────────────

  function _renderPager(tabKey, p) {
    if (p.pages <= 1) return '';
    return `
      <div class="iv4-ctx-pager">
        <button class="iv4-ctx-pager-btn" ${p.page <= 1 ? 'disabled' : ''}
                onclick="InboxContext._page('${tabKey}', ${p.page - 1})">‹ السابق</button>
        <span class="iv4-ctx-pager-info">${p.page} / ${p.pages}</span>
        <button class="iv4-ctx-pager-btn" ${p.page >= p.pages ? 'disabled' : ''}
                onclick="InboxContext._page('${tabKey}', ${p.page + 1})">التالي ›</button>
      </div>`;
  }

  // ─── Bind Link Search ─────────────────────────────────────────────────────

  function _bindLinkSearch() {
    const input   = $('iv4-ctx-search-input');
    const results = $('iv4-ctx-search-results');
    if (!input || !results) return;

    let _debounce = null;

    input.addEventListener('input', () => {
      clearTimeout(_debounce);
      const q = input.value.trim();
      if (q.length < 2) {
        results.classList.add('hidden');
        results.innerHTML = '';
        return;
      }
      _debounce = setTimeout(async () => {
        try {
          const data = await _searchContacts(_convId, q);
          if (!data.contacts || data.contacts.length === 0) {
            results.innerHTML = `<div class="iv4-ctx-no-results">لا نتائج</div>`;
          } else {
            results.innerHTML = data.contacts.map(c => `
              <div class="iv4-ctx-result-item" data-id="${c.id}">
                <div class="iv4-ctx-result-name">${_esc(c.name)}</div>
                <div class="iv4-ctx-result-meta">${_esc(c.phone || '')} ${c.city ? '· ' + _esc(c.city) : ''}</div>
              </div>
            `).join('');

            results.querySelectorAll('.iv4-ctx-result-item').forEach(el => {
              el.addEventListener('click', () => _doLink(parseInt(el.dataset.id, 10)));
            });
          }
          results.classList.remove('hidden');
        } catch (_) {
          results.innerHTML = `<div class="iv4-ctx-no-results">خطأ في البحث</div>`;
          results.classList.remove('hidden');
        }
      }, 300);
    });

    // إغلاق عند النقر خارجاً
    document.addEventListener('click', function _outside(e) {
      if (!results.contains(e.target) && e.target !== input) {
        results.classList.add('hidden');
        document.removeEventListener('click', _outside);
      }
    });
  }

  // ─── Quick Actions ─────────────────────────────────────────────────────────

  // ── Modal مشترك ──────────────────────────────────────────────────────────
  function _openQuickModal({ title, confirmLabel, onConfirm }) {
    // إزالة modal قديم لو موجود
    const old = document.getElementById('iv4-ctx-quick-modal');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-ctx-quick-modal';
    overlay.className = 'iv4-ctx-modal-overlay';
    overlay.innerHTML = `
      <div class="iv4-ctx-modal">
        <div class="iv4-ctx-modal-header">
          <span>${title}</span>
          <button class="iv4-ctx-modal-close" onclick="document.getElementById('iv4-ctx-quick-modal')?.remove()">✕</button>
        </div>
        <div class="iv4-ctx-modal-body">
          <label class="iv4-ctx-label">المبلغ (ج.م) *</label>
          <input id="iv4-ctx-modal-amount" class="iv4-ctx-modal-input" type="number"
                 min="1" step="0.01" placeholder="مثال: 500" />
          <label class="iv4-ctx-label" style="margin-top:10px">وصف (اختياري)</label>
          <input id="iv4-ctx-modal-desc" class="iv4-ctx-modal-input" type="text"
                 placeholder="مثال: دفعة منتج X" />
        </div>
        <div class="iv4-ctx-modal-footer">
          <button class="iv4-btn iv4-btn-ghost" onclick="document.getElementById('iv4-ctx-quick-modal')?.remove()">إلغاء</button>
          <button id="iv4-ctx-modal-confirm" class="iv4-btn iv4-btn-primary">${confirmLabel}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // إغلاق بالنقر على الخلفية
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // زر التأكيد
    document.getElementById('iv4-ctx-modal-confirm').addEventListener('click', async () => {
      const amountInput = document.getElementById('iv4-ctx-modal-amount');
      const descInput   = document.getElementById('iv4-ctx-modal-desc');
      const amount = parseFloat(amountInput?.value);
      const desc   = descInput?.value?.trim() || '';

      if (!amount || amount <= 0) {
        amountInput.style.borderColor = 'red';
        amountInput.focus();
        return;
      }
      overlay.remove();
      await onConfirm(amount, desc);
    });

    // Focus تلقائي
    setTimeout(() => document.getElementById('iv4-ctx-modal-amount')?.focus(), 50);
  }

  // ── Quick Invoice ─────────────────────────────────────────────────────────
  async function _quickInvoice() {
    _openQuickModal({
      title: '📄 فاتورة سريعة',
      confirmLabel: 'إنشاء الفاتورة',
      onConfirm: async (amount, desc) => {
        try {
          const res = await _createInvoice(_convId, amount, desc);
          if (res.ok) {
            _showToast(`✅ تم إنشاء ${res.invoice.invoice_no} بمبلغ ج.م ${_fmt(amount)}`);
            // إعادة تحميل tab الفواتير
            _pager.invoices.page = 1;
            await _loadInvoices();
          } else {
            _showToast('❌ ' + (res.error || 'فشل الإنشاء'));
          }
        } catch (err) {
          _showToast('❌ ' + err.message);
        }
      },
    });
  }

  // ── Quick Pay Link ────────────────────────────────────────────────────────
  async function _quickPayLink() {
    _openQuickModal({
      title: '💳 رابط دفع سريع',
      confirmLabel: 'إنشاء الرابط',
      onConfirm: async (amount, desc) => {
        try {
          const res = await _createPayLink(_convId, amount, desc);
          if (res.ok) {
            _showToast(`✅ تم إنشاء الرابط — ج.م ${_fmt(amount)}`);
            // إعادة تحميل tab الدفع
            _pager.pay.page = 1;
            await _loadPayLinks();
          } else {
            _showToast('❌ ' + (res.error || 'فشل الإنشاء'));
          }
        } catch (err) {
          _showToast('❌ ' + err.message);
        }
      },
    });
  }

  // ── نسخ رابط الدفع ───────────────────────────────────────────────────────
  function _copyPayLink(url) {
    const full = window.location.origin + url;
    navigator.clipboard.writeText(full).then(() => {
      _showToast('📋 تم النسخ!');
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = full; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      ta.remove();
      _showToast('📋 تم النسخ!');
    });
  }

  // ── إرسال رابط الدفع في المحادثة ─────────────────────────────────────────
  function _sendPayLink(url, amount) {
    const full = window.location.origin + url;
    const text = `رابط الدفع: ${full}\nالمبلغ: ج.م ${_fmt(amount)}`;
    // نضع النص في الـ reply box إن وجد
    const textarea = document.getElementById('iv4-reply-input');
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    } else {
      _copyPayLink(url);
    }
  }

  // ── Pagination action ─────────────────────────────────────────────────────
  function _page(tabKey, newPage) {
    if (!_pager[tabKey]) return;
    _pager[tabKey].page = newPage;
    switch (tabKey) {
      case 'invoices': _loadInvoices(); break;
      case 'orders':   _loadOrders();   break;
      case 'pay':      _loadPayLinks(); break;
    }
  }

  // ── Filter actions ────────────────────────────────────────────────────────
  function _filterInvoices(status) {
    _pager.invoices.status = status;
    _pager.invoices.page   = 1;
    _loadInvoices();
  }

  function _filterOrders(status) {
    _pager.orders.status = status;
    _pager.orders.page   = 1;
    _loadOrders();
  }

  // ── Toast helper ──────────────────────────────────────────────────────────
  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'iv4-ctx-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('iv4-ctx-toast--show'), 10);
    setTimeout(() => { t.classList.remove('iv4-ctx-toast--show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function _doLink(contactId) {
    try {
      _renderLoading();
      const res = await _linkContact(_convId, contactId);
      if (res.ok) {
        await reload();
      } else {
        _renderError(res.error || 'فشل الربط');
      }
    } catch (err) {
      _renderError(err.message);
    }
  }

  async function _unlink() {
    if (!confirm('هل تريد إلغاء ربط هذا العميل من المحادثة؟')) return;
    try {
      _renderLoading();
      await _unlinkContact(_convId);
      await reload();
    } catch (err) {
      _renderError(err.message);
    }
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  async function load(convId) {
    if (_loading) return;
    _convId  = convId;
    _loading = true;
    // إعادة تعيين الـ pager عند تغيير المحادثة
    _pager.invoices = { page: 1, total: 0, pages: 0, status: '', clv: null };
    _pager.orders   = { page: 1, total: 0, pages: 0, status: '' };
    _pager.pay      = { page: 1, total: 0, pages: 0 };

    _renderLoading();
    _renderTabBar();

    try {
      _data   = await _fetchContext(convId);
      _loading = false;
      _renderCurrentTab();
    } catch (err) {
      _loading = false;
      _renderError(err.message || 'تعذّر تحميل بيانات العميل');
    }
  }

  async function reload() {
    if (!_convId) return;
    await load(_convId);
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  function open(convId) {
    const panel = _panel();
    if (!panel) return;
    panel.classList.remove('hidden');
    if (convId !== _convId || !_data) {
      load(convId);
    }
  }

  function close() {
    const panel = _panel();
    if (panel) panel.classList.add('hidden');
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // عند تغيير المحادثة النشطة — أعد تحميل الـ context
    InboxStore.on('activeConvId:change', ({ value }) => {
      if (value) {
        // فقط لو الـ panel مفتوح
        const panel = _panel();
        if (panel && !panel.classList.contains('hidden')) {
          load(value);
        } else {
          // reset data لو Panel مغلق — سيُحمَّل عند الفتح
          _convId = value;
          _data   = null;
        }
      } else {
        _convId = null;
        _data   = null;
      }
    });

    // زر الـ toggle يفتح ويحمّل
    const toggleBtn = $('iv4-ctx-toggle');
    if (toggleBtn) {
      // نستبدل الـ listener القديم في app.js بإعادة التعامل هنا
      toggleBtn.addEventListener('click', () => {
        const panel = _panel();
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
          panel.classList.remove('hidden');
          if (_convId && !_data) load(_convId);
        } else {
          panel.classList.add('hidden');
        }
      });
    }

    // Tab clicks (بعد render)
    document.querySelectorAll('.iv4-ctx-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });

    console.log('[InboxContext] ✅ جاهز');
  }

  // ─── Helper: escape HTML ──────────────────────────────────────────────────

  function _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _field(label, value) {
    return `<div class="iv4-ctx-field">
      <span class="iv4-ctx-field-label">${label}</span>
      <span class="iv4-ctx-field-value">${value}</span>
    </div>`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init, open, close, reload, load,
    _unlink,
    _quickInvoice, _quickPayLink,
    _copyPayLink, _sendPayLink,
    _filterInvoices, _filterOrders,
    _page,
  };

})();
