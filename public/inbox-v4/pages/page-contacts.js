/* ============================================================
   Inbox v4 — Page Module: Contacts (P11-E2)
   جدول جهات الاتصال + بحث + فلتر + بروفايل + إنشاء/تعديل
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageContacts = (() => {

  // ─── State ───────────────────────────────────────────────────────────────
  let _container  = null;
  let _state      = {
    contacts  : [],
    total     : 0,
    pages     : 1,
    page      : 1,
    limit     : 30,
    q         : '',
    status    : 'all',
    loading   : false,
    stats     : null,
    // بروفايل
    profileId : null,
    profile   : null,
    profileConvs: [],
    profileLoading: false,
    // form
    formMode  : null, // 'create' | 'edit'
    formData  : {},
    formError : '',
    saving    : false,
  };
  let _searchTimer = null;

  const STATUS_COLORS = {
    lead     : '#6b7280',
    prospect : '#3b82f6',
    client   : '#10b981',
    vip      : '#f59e0b',
    inactive : '#9ca3af',
    cold     : '#ef4444',
  };
  const STATUS_LABELS = {
    all      : 'الكل',
    lead     : 'محتمل',
    prospect : 'مهتم',
    client   : 'عميل',
    vip      : 'VIP',
    inactive : 'غير نشط',
    cold     : 'بارد',
  };
  const PLATFORM_ICONS = {
    whatsapp : '💬',
    telegram : '✈️',
    email    : '📧',
    web      : '🌐',
    manual   : '👤',
    inbox    : '📥',
  };

  // ─── API ─────────────────────────────────────────────────────────────────
  const api = () => window.InboxAPI?.contacts;

  async function _loadStats() {
    const { data } = await api().stats();
    if (data) {
      _state.stats = data;
      _renderStats();
    }
  }

  async function _loadContacts(page = 1) {
    _state.loading = true;
    _state.page    = page;
    _renderList();

    const { data, error } = await api().list({
      q     : _state.q,
      status: _state.status,
      page  : _state.page,
      limit : _state.limit,
    });

    _state.loading = false;
    if (error) { _showToast('خطأ في جلب جهات الاتصال', 'error'); return; }

    _state.contacts = data.data  || [];
    _state.total    = data.total || 0;
    _state.pages    = data.pages || 1;
    _renderList();
    _renderPagination();
  }

  async function _loadProfile(id) {
    _state.profileId      = id;
    _state.profileLoading = true;
    _state.profileConvs   = [];
    _renderProfile();

    const [profRes, convsRes] = await Promise.all([
      api().get(id),
      api().convs(id),
    ]);

    _state.profileLoading = false;
    if (profRes.data)   _state.profile      = profRes.data.contact;
    if (convsRes.data)  _state.profileConvs = convsRes.data.data || [];
    _renderProfile();
  }

  async function _saveContact() {
    if (_state.saving) return;
    const d = _state.formData;
    if (!d.name || !d.name.trim()) {
      _state.formError = 'الاسم مطلوب';
      _renderForm();
      return;
    }
    _state.saving    = true;
    _state.formError = '';
    _renderForm();

    let res;
    if (_state.formMode === 'create') {
      res = await api().create(d);
    } else {
      res = await api().update(_state.formMode, d);
    }

    _state.saving = false;
    if (res.error) {
      _state.formError = res.error === 'phone_exists'
        ? 'هذا الهاتف مسجل مسبقاً'
        : res.error;
      _renderForm();
      return;
    }

    _closeForm();
    _showToast(_state.formMode === 'create' ? 'تم إضافة جهة الاتصال ✅' : 'تم التحديث ✅', 'success');
    _loadContacts(_state.page);
    _loadStats();
  }

  async function _deleteContact(id, name) {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟\nسيُفك ربطها من جميع المحادثات.`)) return;
    const { error } = await api().remove(id);
    if (error) { _showToast('خطأ في الحذف', 'error'); return; }
    _showToast('تم الحذف ✅', 'success');
    if (_state.profileId === id) _closeProfile();
    _loadContacts(_state.page);
    _loadStats();
  }

  // ─── Render Helpers ───────────────────────────────────────────────────────
  function _q(sel) { return _container?.querySelector(sel); }
  function _qa(sel) { return _container?.querySelectorAll(sel) || []; }

  function _showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `ct-toast ct-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function _fmtDate(ts) {
    if (!ts) return '—';
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function _fmtCurrency(n) {
    if (!n) return '٠';
    return Number(n).toLocaleString('ar-EG') + ' ج.م';
  }

  function _statusBadge(status) {
    if (!status) return '';
    const label = STATUS_LABELS[status] || status;
    const color = STATUS_COLORS[status] || '#6b7280';
    return `<span class="ct-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${label}</span>`;
  }

  // ─── Render: الهيكل الكامل ───────────────────────────────────────────────
  function _renderShell() {
    _container.innerHTML = `
      <div class="ct-root" dir="rtl">

        <!-- Header -->
        <div class="ct-header">
          <div class="ct-header-start">
            <h1 class="ct-title">👥 جهات الاتصال</h1>
            <div class="ct-stats-bar" id="ct-stats-bar">
              <span class="ct-stats-item ct-stats-loading">جاري التحميل...</span>
            </div>
          </div>
          <div class="ct-header-end">
            <button class="ct-btn ct-btn-primary" id="ct-btn-add">+ إضافة جهة اتصال</button>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="ct-toolbar">
          <div class="ct-search-wrap">
            <span class="ct-search-icon">🔍</span>
            <input
              class="ct-search"
              id="ct-search"
              type="text"
              placeholder="بحث بالاسم أو الهاتف أو الإيميل..."
              value="${_state.q}"
              autocomplete="off"
            />
            <button class="ct-search-clear ${_state.q ? '' : 'hidden'}" id="ct-search-clear">✕</button>
          </div>
          <div class="ct-status-filters" id="ct-status-filters">
            ${Object.entries(STATUS_LABELS).map(([k, v]) => `
              <button class="ct-filter-btn ${_state.status === k ? 'active' : ''}" data-status="${k}">${v}</button>
            `).join('')}
          </div>
        </div>

        <!-- Body -->
        <div class="ct-body">
          <!-- القائمة -->
          <div class="ct-list-wrap">
            <div class="ct-list" id="ct-list"></div>
            <div class="ct-pagination" id="ct-pagination"></div>
          </div>

          <!-- البروفايل -->
          <div class="ct-profile-wrap ${_state.profileId ? 'open' : ''}" id="ct-profile-wrap">
            <div class="ct-profile" id="ct-profile"></div>
          </div>
        </div>

        <!-- Form Overlay -->
        <div class="ct-overlay ${_state.formMode ? '' : 'hidden'}" id="ct-overlay">
          <div class="ct-form-card" id="ct-form-card"></div>
        </div>

      </div>
    `;

    _bindEvents();
    _renderList();
    _renderStats();
  }

  // ─── Render: Stats Bar ────────────────────────────────────────────────────
  function _renderStats() {
    const el = _q('#ct-stats-bar');
    if (!el) return;
    if (!_state.stats) {
      el.innerHTML = '<span class="ct-stats-loading">...</span>';
      return;
    }
    const s = _state.stats;
    if (s.mode === 'conversations') {
      el.innerHTML = `<span class="ct-stats-item">${s.total} جهة اتصال</span>`;
      return;
    }
    const byStatus = s.byStatus || [];
    el.innerHTML = `
      <span class="ct-stats-item"><strong>${s.total}</strong> إجمالي</span>
      ${s.linked ? `<span class="ct-stats-item ct-stats-sep">·</span><span class="ct-stats-item"><strong>${s.linked}</strong> مرتبطة بمحادثات</span>` : ''}
      ${byStatus.slice(0, 4).map(r =>
        `<span class="ct-stats-item ct-stats-sep">·</span>
         <span class="ct-stats-item" style="color:${STATUS_COLORS[r.status] || '#6b7280'}">
           ${STATUS_LABELS[r.status] || r.status}: <strong>${r.count}</strong>
         </span>`
      ).join('')}
    `;
  }

  // ─── Render: القائمة ─────────────────────────────────────────────────────
  function _renderList() {
    const el = _q('#ct-list');
    if (!el) return;

    if (_state.loading) {
      el.innerHTML = `
        <div class="ct-loading-state">
          <div class="ct-spinner"></div>
          <span>جاري التحميل...</span>
        </div>`;
      return;
    }

    if (!_state.contacts.length) {
      el.innerHTML = `
        <div class="ct-empty-state">
          <div class="ct-empty-icon">👥</div>
          <div class="ct-empty-title">${_state.q ? 'لا نتائج للبحث' : 'لا توجد جهات اتصال'}</div>
          <div class="ct-empty-sub">${_state.q ? 'جرّب كلمات بحث مختلفة' : 'اضغط "+ إضافة جهة اتصال" لإضافة أول جهة'}</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <table class="ct-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الهاتف</th>
            <th>الإيميل</th>
            <th>الحالة</th>
            <th>المحادثات</th>
            <th>آخر تواصل</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${_state.contacts.map(c => `
            <tr class="ct-row ${_state.profileId == c.id ? 'active' : ''}" data-id="${c.id}" data-name="${_esc(c.name)}">
              <td class="ct-cell-name">
                <div class="ct-avatar">${(c.name || '?').charAt(0)}</div>
                <div class="ct-name-col">
                  <div class="ct-name">${_esc(c.name)}</div>
                  ${c.company_name ? `<div class="ct-company">${_esc(c.company_name)}</div>` : ''}
                </div>
              </td>
              <td class="ct-cell-phone">${c.phone ? `<a href="tel:${_esc(c.phone)}" onclick="event.stopPropagation()">${_esc(c.phone)}</a>` : '—'}</td>
              <td class="ct-cell-email">${c.email ? `<a href="mailto:${_esc(c.email)}" onclick="event.stopPropagation()">${_esc(c.email)}</a>` : '—'}</td>
              <td>${_statusBadge(c.status)}</td>
              <td class="ct-cell-center">${c.conv_count > 0 ? `<span class="ct-conv-count">${c.conv_count}</span>` : '—'}</td>
              <td class="ct-cell-date">${_fmtDate(c.last_conv_at || c.created_at)}</td>
              <td class="ct-cell-actions" onclick="event.stopPropagation()">
                <button class="ct-row-btn ct-btn-edit" data-id="${c.id}" title="تعديل">✏️</button>
                <button class="ct-row-btn ct-btn-del" data-id="${c.id}" data-name="${_esc(c.name)}" title="حذف">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // row clicks → بروفايل
    el.querySelectorAll('.ct-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.id);
        if (_state.profileId === id) {
          _closeProfile();
        } else {
          _loadProfile(id);
        }
      });
    });

    // edit buttons
    el.querySelectorAll('.ct-btn-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const { data } = await api().get(id);
        if (data?.contact) _openForm('edit', id, data.contact);
      });
    });

    // delete buttons
    el.querySelectorAll('.ct-btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        _deleteContact(parseInt(btn.dataset.id), btn.dataset.name);
      });
    });
  }

  // ─── Render: Pagination ──────────────────────────────────────────────────
  function _renderPagination() {
    const el = _q('#ct-pagination');
    if (!el) return;
    if (_state.pages <= 1) { el.innerHTML = ''; return; }

    const btns = [];
    for (let i = 1; i <= _state.pages; i++) {
      btns.push(`<button class="ct-page-btn ${i === _state.page ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }
    el.innerHTML = `
      <button class="ct-page-btn ct-page-prev" ${_state.page <= 1 ? 'disabled' : ''} data-page="${_state.page - 1}">‹ السابق</button>
      ${btns.join('')}
      <button class="ct-page-btn ct-page-next" ${_state.page >= _state.pages ? 'disabled' : ''} data-page="${_state.page + 1}">التالي ›</button>
    `;
    el.querySelectorAll('.ct-page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => _loadContacts(parseInt(btn.dataset.page)));
    });
  }

  // ─── Render: بروفايل جهة الاتصال ─────────────────────────────────────────
  function _renderProfile() {
    const wrap = _q('#ct-profile-wrap');
    const el   = _q('#ct-profile');
    if (!wrap || !el) return;

    if (!_state.profileId) {
      wrap.classList.remove('open');
      el.innerHTML = '';
      return;
    }

    wrap.classList.add('open');

    if (_state.profileLoading) {
      el.innerHTML = `<div class="ct-profile-loading"><div class="ct-spinner"></div></div>`;
      return;
    }

    const c = _state.profile;
    if (!c) {
      el.innerHTML = `<div class="ct-profile-error">لم يُعثر على البيانات</div>`;
      return;
    }

    el.innerHTML = `
      <div class="ct-profile-inner">
        <!-- Header -->
        <div class="ct-profile-head">
          <div class="ct-profile-avatar">${(c.name || '?').charAt(0)}</div>
          <div class="ct-profile-info">
            <div class="ct-profile-name">${_esc(c.name)}</div>
            ${c.company_name ? `<div class="ct-profile-company">${_esc(c.company_name)}</div>` : ''}
            ${_statusBadge(c.status)}
          </div>
          <button class="ct-profile-close" id="ct-profile-close">✕</button>
        </div>

        <!-- بيانات الاتصال -->
        <div class="ct-profile-section">
          <div class="ct-profile-section-title">بيانات الاتصال</div>
          <div class="ct-profile-fields">
            ${c.phone ? `
              <div class="ct-field">
                <span class="ct-field-label">📞 الهاتف</span>
                <a class="ct-field-value" href="tel:${_esc(c.phone)}">${_esc(c.phone)}</a>
              </div>` : ''}
            ${c.email ? `
              <div class="ct-field">
                <span class="ct-field-label">📧 الإيميل</span>
                <a class="ct-field-value" href="mailto:${_esc(c.email)}">${_esc(c.email)}</a>
              </div>` : ''}
            ${(c.city || c.governorate) ? `
              <div class="ct-field">
                <span class="ct-field-label">📍 المنطقة</span>
                <span class="ct-field-value">${[c.city, c.governorate].filter(Boolean).join('، ')}</span>
              </div>` : ''}
            ${c.source ? `
              <div class="ct-field">
                <span class="ct-field-label">المصدر</span>
                <span class="ct-field-value">${PLATFORM_ICONS[c.source] || '📌'} ${c.source}</span>
              </div>` : ''}
            <div class="ct-field">
              <span class="ct-field-label">📅 تاريخ الإضافة</span>
              <span class="ct-field-value">${_fmtDate(c.created_at)}</span>
            </div>
          </div>
        </div>

        ${(c.balance != null || c.total_paid != null || c.total_invoiced != null) ? `
        <!-- الحساب المالي -->
        <div class="ct-profile-section">
          <div class="ct-profile-section-title">الحساب المالي</div>
          <div class="ct-profile-kpis">
            <div class="ct-kpi">
              <div class="ct-kpi-val">${_fmtCurrency(c.total_invoiced || c.total_paid)}</div>
              <div class="ct-kpi-label">إجمالي الفواتير</div>
            </div>
            <div class="ct-kpi">
              <div class="ct-kpi-val">${_fmtCurrency(c.total_paid)}</div>
              <div class="ct-kpi-label">المدفوع</div>
            </div>
            <div class="ct-kpi ${(c.balance || 0) > 0 ? 'ct-kpi-danger' : ''}">
              <div class="ct-kpi-val">${_fmtCurrency(c.balance)}</div>
              <div class="ct-kpi-label">الرصيد</div>
            </div>
          </div>
          ${c.invoices_count != null ? `
            <div class="ct-profile-meta">
              ${c.invoices_count} فاتورة · ${c.orders_count || 0} طلب
            </div>` : ''}
        </div>` : ''}

        ${c.notes ? `
        <!-- الملاحظات -->
        <div class="ct-profile-section">
          <div class="ct-profile-section-title">ملاحظات</div>
          <div class="ct-profile-notes">${_esc(c.notes)}</div>
        </div>` : ''}

        <!-- المحادثات -->
        <div class="ct-profile-section">
          <div class="ct-profile-section-title">المحادثات (${_state.profileConvs.length})</div>
          ${_state.profileConvs.length === 0
            ? '<div class="ct-profile-empty">لا توجد محادثات مرتبطة</div>'
            : `<div class="ct-conv-list">
              ${_state.profileConvs.map(conv => `
                <div class="ct-conv-item" data-convid="${conv.id}" role="button">
                  <div class="ct-conv-platform">${PLATFORM_ICONS[conv.platform] || '💬'}</div>
                  <div class="ct-conv-meta">
                    <div class="ct-conv-last">${_esc(conv.last_message_text || '—').substring(0, 60)}</div>
                    <div class="ct-conv-date">${_fmtDate(conv.last_message_at || conv.created_at)}</div>
                  </div>
                  <span class="ct-conv-status-dot ct-status-${conv.status}"></span>
                </div>
              `).join('')}
            </div>`
          }
        </div>

        <!-- أزرار الإجراء -->
        <div class="ct-profile-actions">
          <button class="ct-btn ct-btn-secondary ct-profile-edit-btn" data-id="${c.id}">✏️ تعديل</button>
          <button class="ct-btn ct-btn-danger ct-profile-del-btn" data-id="${c.id}" data-name="${_esc(c.name)}">🗑️ حذف</button>
        </div>
      </div>
    `;

    // ربط البروفايل
    _q('#ct-profile-close')?.addEventListener('click', _closeProfile);

    _q('.ct-profile-edit-btn')?.addEventListener('click', async () => {
      const { data } = await api().get(c.id);
      if (data?.contact) _openForm('edit', c.id, data.contact);
    });

    _q('.ct-profile-del-btn')?.addEventListener('click', () => {
      _deleteContact(c.id, c.name);
    });

    // فتح المحادثة عند الضغط
    el.querySelectorAll('.ct-conv-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.dataset.convid;
        if (convId && window.InboxRouter) {
          InboxRouter.navigate(`/inbox/conv/${convId}`);
        }
      });
    });
  }

  function _closeProfile() {
    _state.profileId      = null;
    _state.profile        = null;
    _state.profileConvs   = [];
    _state.profileLoading = false;
    _renderProfile();
    // إزالة active من الجدول
    _qa('.ct-row.active').forEach(r => r.classList.remove('active'));
  }

  // ─── Render: Form (إنشاء / تعديل) ────────────────────────────────────────
  function _openForm(mode, id, prefill = {}) {
    _state.formMode  = mode === 'edit' ? id : 'create';
    _state.formData  = { ...prefill };
    _state.formError = '';
    _renderForm();
  }

  function _closeForm() {
    _state.formMode = null;
    _state.formData = {};
    _state.formError = '';
    const overlay = _q('#ct-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function _renderForm() {
    const overlay  = _q('#ct-overlay');
    const formCard = _q('#ct-form-card');
    if (!overlay || !formCard) return;

    if (!_state.formMode) {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');

    const isEdit = _state.formMode !== 'create';
    const d      = _state.formData;

    formCard.innerHTML = `
      <div class="ct-form-header">
        <h2>${isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال جديدة'}</h2>
        <button class="ct-form-close" id="ct-form-close-btn">✕</button>
      </div>

      ${_state.formError ? `<div class="ct-form-error">⚠️ ${_esc(_state.formError)}</div>` : ''}

      <div class="ct-form-body">
        <div class="ct-form-row">
          <div class="ct-form-group ct-form-group-required">
            <label>الاسم *</label>
            <input type="text" name="name" value="${_esc(d.name || '')}" placeholder="اسم جهة الاتصال" />
          </div>
          <div class="ct-form-group">
            <label>اسم الشركة</label>
            <input type="text" name="company_name" value="${_esc(d.company_name || '')}" placeholder="اختياري" />
          </div>
        </div>
        <div class="ct-form-row">
          <div class="ct-form-group">
            <label>الهاتف</label>
            <input type="tel" name="phone" value="${_esc(d.phone || '')}" placeholder="01xxxxxxxxx" />
          </div>
          <div class="ct-form-group">
            <label>البريد الإلكتروني</label>
            <input type="email" name="email" value="${_esc(d.email || '')}" placeholder="example@mail.com" />
          </div>
        </div>
        <div class="ct-form-row">
          <div class="ct-form-group">
            <label>الحالة</label>
            <select name="status">
              ${['lead','prospect','client','vip','inactive','cold'].map(s =>
                `<option value="${s}" ${d.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
              ).join('')}
            </select>
          </div>
          <div class="ct-form-group">
            <label>المصدر</label>
            <input type="text" name="source" value="${_esc(d.source || '')}" placeholder="inbox / whatsapp / ..." />
          </div>
        </div>
        <div class="ct-form-row">
          <div class="ct-form-group">
            <label>المدينة</label>
            <input type="text" name="city" value="${_esc(d.city || '')}" placeholder="القاهرة" />
          </div>
          <div class="ct-form-group">
            <label>المحافظة</label>
            <input type="text" name="governorate" value="${_esc(d.governorate || '')}" placeholder="القاهرة" />
          </div>
        </div>
        <div class="ct-form-group ct-form-group-full">
          <label>ملاحظات</label>
          <textarea name="notes" rows="3" placeholder="ملاحظات اختيارية...">${_esc(d.notes || '')}</textarea>
        </div>
      </div>

      <div class="ct-form-footer">
        <button class="ct-btn ct-btn-secondary" id="ct-form-cancel-btn">إلغاء</button>
        <button class="ct-btn ct-btn-primary ${_state.saving ? 'ct-btn-loading' : ''}" id="ct-form-save-btn">
          ${_state.saving ? 'جاري الحفظ...' : (isEdit ? 'حفظ التعديلات' : 'إضافة')}
        </button>
      </div>
    `;

    // ربط الأحداث
    _q('#ct-form-close-btn')?.addEventListener('click', _closeForm);
    _q('#ct-form-cancel-btn')?.addEventListener('click', _closeForm);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeForm(); });

    // تحديث formData عند الكتابة
    formCard.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('input', () => {
        _state.formData[input.name] = input.value;
      });
    });

    _q('#ct-form-save-btn')?.addEventListener('click', _saveContact);
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  function _bindEvents() {
    // بحث
    const searchInput = _q('#ct-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        _state.q = searchInput.value;
        const clearBtn = _q('#ct-search-clear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !_state.q);
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => _loadContacts(1), 400);
      });
    }

    _q('#ct-search-clear')?.addEventListener('click', () => {
      _state.q = '';
      if (searchInput) searchInput.value = '';
      _q('#ct-search-clear')?.classList.add('hidden');
      _loadContacts(1);
    });

    // فلاتر الحالة
    _q('#ct-status-filters')?.addEventListener('click', e => {
      const btn = e.target.closest('.ct-filter-btn');
      if (!btn) return;
      _state.status = btn.dataset.status;
      _qa('.ct-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      _loadContacts(1);
    });

    // إضافة جديد
    _q('#ct-btn-add')?.addEventListener('click', () => _openForm('create', null));
  }

  // ─── Escape helper ───────────────────────────────────────────────────────
  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    mount(container, params) {
      _container = container;
      // reset state
      _state = { ..._state, contacts: [], total: 0, pages: 1, page: 1,
        q: '', status: 'all', loading: false, stats: null,
        profileId: null, profile: null, profileConvs: [], profileLoading: false,
        formMode: null, formData: {}, formError: '', saving: false };

      _renderShell();

      // فتح بروفايل مباشر لو في contactId
      if (params?.contactId) {
        _loadProfile(parseInt(params.contactId));
      }

      // تحميل البيانات
      Promise.all([_loadStats(), _loadContacts(1)]);
    },

    unmount() {
      clearTimeout(_searchTimer);
      _container = null;
    }
  };

})();

window.PageContacts = PageContacts;
