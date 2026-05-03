/**
 * context.js — Context Panel لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P5-1 Customer Info + CRM Link)
 *
 * المسؤوليات:
 *   - عرض بيانات العميل (الاسم / الهاتف / المدينة / CLV / الحالة)
 *   - ربط/إلغاء ربط جهة اتصال CRM
 *   - عرض آخر الفواتير + الطلبات + روابط الدفع (tabs)
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
  let _tab      = 'contact'; // contact | invoices | orders | pay

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
      case 'contact':  _renderContact(); break;
      case 'invoices': _renderInvoices(); break;
      case 'orders':   _renderOrders();   break;
      case 'pay':      _renderPayLinks(); break;
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

  // ── Tab: Invoices ─────────────────────────────────────────────────────────

  function _renderInvoices() {
    const { invoices, contact } = _data;

    let html = `<div class="iv4-ctx-section">`;

    if (!contact) {
      html += `<p class="iv4-ctx-hint">اربط العميل أولاً لعرض الفواتير.</p>`;
    } else if (!invoices || invoices.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد فواتير مسجّلة لهذا العميل.</p>`;
    } else {
      html += `<div class="iv4-ctx-list">`;
      for (const inv of invoices) {
        const statusLabel = INV_STATUS_AR[inv.status] || inv.status;
        html += `
          <div class="iv4-ctx-list-item">
            <div class="iv4-ctx-list-main">
              <span class="iv4-ctx-list-title">${_esc(inv.invoice_no || `#${inv.id}`)}</span>
              <span class="iv4-ctx-badge iv4-ctx-badge--${inv.status}">${statusLabel}</span>
            </div>
            <div class="iv4-ctx-list-meta">
              <span>ج.م ${_fmt(inv.total)}</span>
              <span>${_fmtDate(inv.created_at)}</span>
            </div>
          </div>`;
      }
      html += `</div>`;
      html += `<a href="/dashboard/invoices?contact=${contact.id}" target="_blank"
                  class="iv4-btn iv4-btn-sm iv4-btn-ghost iv4-ctx-more-link">
                  عرض كل الفواتير ↗
               </a>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Tab: Orders ───────────────────────────────────────────────────────────

  function _renderOrders() {
    const { orders, contact } = _data;

    let html = `<div class="iv4-ctx-section">`;

    if (!contact) {
      html += `<p class="iv4-ctx-hint">اربط العميل أولاً لعرض الطلبات.</p>`;
    } else if (!orders || orders.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد طلبات مسجّلة لهذا العميل.</p>`;
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
      html += `<a href="/dashboard/orders?contact=${contact.id}" target="_blank"
                  class="iv4-btn iv4-btn-sm iv4-btn-ghost iv4-ctx-more-link">
                  عرض كل الطلبات ↗
               </a>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
  }

  // ── Tab: Payment Links ────────────────────────────────────────────────────

  function _renderPayLinks() {
    const { pay_links, contact } = _data;

    let html = `<div class="iv4-ctx-section">`;

    if (!contact) {
      html += `<p class="iv4-ctx-hint">اربط العميل أولاً لعرض روابط الدفع.</p>`;
    } else if (!pay_links || pay_links.length === 0) {
      html += `<p class="iv4-ctx-hint">لا توجد روابط دفع لهذا العميل.</p>`;
    } else {
      html += `<div class="iv4-ctx-list">`;
      for (const pl of pay_links) {
        const statusLabel = PAY_STATUS_AR[pl.status] || pl.status;
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
          </div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    _content().innerHTML = html;
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

  return { init, open, close, reload, load, _unlink };

})();
