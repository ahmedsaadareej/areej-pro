/**
 * catalog.js — WA Catalog Product Messages لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P8-3)
 *
 * يتيح إرسال:
 *  - single_product : بطاقة منتج واحد (صورة + اسم + سعر من الكتالوج)
 *  - multi_product  : قائمة منتجات موزّعة على sections
 *
 * يعمل فقط مع whatsapp_api — يُخفى الزر للمنصات الأخرى.
 *
 * الاستخدام:
 *   InboxCatalog.init()
 *   InboxCatalog.open()  ← يفتح الـ modal
 */

const InboxCatalog = (() => {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _convId      = null;   // المحادثة النشطة
  let _platform    = null;   // منصة المحادثة
  let _modalEl     = null;   // عنصر الـ modal
  let _catalogId   = '';     // WA Catalog ID المحفوظ في إعدادات القناة (يُجلب من API)
  let _type        = 'single_product';  // النوع الحالي
  let _sections    = [];     // sections للـ multi_product (قابلة للتعديل)
  let _loading     = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * escape HTML لمنع XSS في الـ innerHTML
   */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _toast(msg, type = 'error') {
    if (window.showInboxToast) window.showInboxToast(msg, type);
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  function open() {
    const state   = InboxStore.state;
    _convId       = state.activeConvId;
    _platform     = state.activeConv?.platform || '';

    if (!_convId) { _toast('لا توجد محادثة نشطة'); return; }

    // يعمل فقط مع whatsapp_api
    if (_platform !== 'whatsapp_api') {
      _toast('إرسال المنتجات يعمل فقط مع WhatsApp API', 'error');
      return;
    }

    // إعادة تهيئة state
    _type     = 'single_product';
    _sections = [{ title: 'منتجاتنا', product_items: [{ product_retailer_id: '' }] }];

    _buildModal();
    document.getElementById('iv4-modals').appendChild(_modalEl);
    _modalEl.classList.remove('hidden');
  }

  function close() {
    if (_modalEl) {
      _modalEl.remove();
      _modalEl = null;
    }
  }

  // ─── Modal Builder ────────────────────────────────────────────────────────

  function _buildModal() {
    const el = document.createElement('div');
    el.className = 'iv4-cat-overlay';
    el.id        = 'iv4-catalog-modal';
    el.innerHTML = `
      <div class="iv4-cat-modal" role="dialog" aria-modal="true" aria-label="إرسال منتج من الكتالوج">

        <!-- Header -->
        <div class="iv4-cat-header">
          <span class="iv4-cat-title">📦 إرسال منتج (Catalog)</span>
          <button class="iv4-cat-close" id="iv4-cat-close" aria-label="إغلاق">✕</button>
        </div>

        <!-- Tabs: نوع الرسالة -->
        <div class="iv4-cat-tabs">
          <button class="iv4-cat-tab active" data-type="single_product">🏷 منتج واحد</button>
          <button class="iv4-cat-tab"         data-type="multi_product">📋 قائمة منتجات</button>
        </div>

        <!-- Body -->
        <div class="iv4-cat-body" id="iv4-cat-body">
          ${_renderBody()}
        </div>

        <!-- Error toast inside modal -->
        <div class="iv4-cat-error hidden" id="iv4-cat-error"></div>

        <!-- Footer -->
        <div class="iv4-cat-footer">
          <button class="iv4-cat-cancel" id="iv4-cat-cancel">إلغاء</button>
          <button class="iv4-cat-send"   id="iv4-cat-send">
            <span id="iv4-cat-send-label">إرسال 📦</span>
          </button>
        </div>

      </div>
    `;

    _modalEl = el;
    _bindModalEvents();
  }

  /**
   * يبني محتوى الـ body حسب النوع الحالي
   */
  function _renderBody() {
    if (_type === 'single_product') return _renderSingle();
    return _renderMulti();
  }

  // ── Single Product ──────────────────────────────────────────────────────

  function _renderSingle() {
    return `
      <!-- Catalog ID (مشترك) -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Catalog ID <span class="iv4-cat-req">*</span></label>
        <input id="iv4-cat-catalog-id" class="iv4-cat-input"
               placeholder="مثال: 123456789012345"
               value="${_esc(_catalogId)}" />
        <small class="iv4-cat-hint">يمكن حفظه في إعدادات القناة ليُملأ تلقائياً</small>
      </div>

      <!-- Product Retailer ID -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Product ID (Retailer) <span class="iv4-cat-req">*</span></label>
        <input id="iv4-cat-single-pid" class="iv4-cat-input"
               placeholder="مثال: PROD-001" />
        <small class="iv4-cat-hint">الـ id الذي أضفته للمنتج في Facebook Catalog Manager</small>
      </div>

      <!-- نص مصاحب (اختياري) -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">نص مصاحب (اختياري)</label>
        <textarea id="iv4-cat-body-text" class="iv4-cat-textarea" maxlength="1024"
                  placeholder="هذا المنتج مناسب جداً لك..."></textarea>
        <div class="iv4-cat-charcount">
          <span id="iv4-cat-body-count">0</span>/1024
        </div>
      </div>

      <!-- Footer (اختياري) -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Footer (اختياري)</label>
        <input id="iv4-cat-footer-text" class="iv4-cat-input"
               maxlength="60" placeholder="أريج — ماكينات الطباعة" />
      </div>
    `;
  }

  // ── Multi Product ───────────────────────────────────────────────────────

  function _renderMulti() {
    const sectionsHtml = _sections.map((sec, si) => _renderSection(sec, si)).join('');
    return `
      <!-- Catalog ID (مشترك) -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Catalog ID <span class="iv4-cat-req">*</span></label>
        <input id="iv4-cat-catalog-id" class="iv4-cat-input"
               placeholder="مثال: 123456789012345"
               value="${_esc(_catalogId)}" />
      </div>

      <!-- Header (اختياري) -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">عنوان القائمة (اختياري)</label>
        <input id="iv4-cat-header-text" class="iv4-cat-input"
               maxlength="60" placeholder="منتجاتنا المميزة" />
      </div>

      <!-- Thumbnail Product ID -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Thumbnail Product ID <span class="iv4-cat-req">*</span></label>
        <input id="iv4-cat-thumb-pid" class="iv4-cat-input"
               placeholder="id المنتج الذي يظهر كـ thumbnail" />
        <small class="iv4-cat-hint">يُستخدم كصورة الغلاف للرسالة</small>
      </div>

      <!-- Sections -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">الأقسام (Sections)</label>
        <div id="iv4-cat-sections">${sectionsHtml}</div>
        <button class="iv4-cat-add-sec" id="iv4-cat-add-sec">+ إضافة قسم</button>
      </div>

      <!-- نص مصاحب -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">نص مصاحب (اختياري)</label>
        <textarea id="iv4-cat-body-text" class="iv4-cat-textarea" maxlength="1024"
                  placeholder="اختر من منتجاتنا..."></textarea>
        <div class="iv4-cat-charcount">
          <span id="iv4-cat-body-count">0</span>/1024
        </div>
      </div>

      <!-- Footer -->
      <div class="iv4-cat-field">
        <label class="iv4-cat-label">Footer (اختياري)</label>
        <input id="iv4-cat-footer-text" class="iv4-cat-input"
               maxlength="60" placeholder="أريج — ماكينات الطباعة" />
      </div>
    `;
  }

  /**
   * بناء HTML لـ section واحدة
   */
  function _renderSection(sec, si) {
    const itemsHtml = (sec.product_items || [])
      .map((item, ii) => _renderProductItem(item, si, ii))
      .join('');
    return `
      <div class="iv4-cat-section" data-si="${si}">
        <div class="iv4-cat-section-header">
          <input class="iv4-cat-sec-title iv4-cat-input" data-si="${si}"
                 placeholder="اسم القسم (حتى 24 حرف)" maxlength="24"
                 value="${_esc(sec.title || '')}" />
          ${_sections.length > 1
            ? `<button class="iv4-cat-remove-sec" data-si="${si}" title="حذف القسم">🗑</button>`
            : ''}
        </div>
        <div class="iv4-cat-items" id="iv4-cat-items-${si}">${itemsHtml}</div>
        <button class="iv4-cat-add-item" data-si="${si}">+ منتج</button>
      </div>
    `;
  }

  function _renderProductItem(item, si, ii) {
    return `
      <div class="iv4-cat-item" data-si="${si}" data-ii="${ii}">
        <input class="iv4-cat-item-pid iv4-cat-input" data-si="${si}" data-ii="${ii}"
               placeholder="Product ID" value="${_esc(item.product_retailer_id || '')}" />
        <button class="iv4-cat-remove-item" data-si="${si}" data-ii="${ii}" title="حذف">✕</button>
      </div>
    `;
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  function _bindModalEvents() {
    // إغلاق بالـ overlay أو زر الإغلاق أو الإلغاء
    _modalEl.addEventListener('click', e => {
      if (e.target === _modalEl
       || e.target.id === 'iv4-cat-close'
       || e.target.id === 'iv4-cat-cancel') close();
    });

    // تبديل نوع الرسالة
    _modalEl.querySelectorAll('.iv4-cat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === _type) return;
        _type = btn.dataset.type;
        _modalEl.querySelectorAll('.iv4-cat-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // احتفظ بـ catalogId المُدخَل قبل إعادة البناء
        const cidInput = _modalEl.querySelector('#iv4-cat-catalog-id');
        if (cidInput) _catalogId = cidInput.value.trim();
        _modalEl.querySelector('#iv4-cat-body').innerHTML = _renderBody();
        _bindBodyEvents();
      });
    });

    // زر الإرسال
    _modalEl.querySelector('#iv4-cat-send').addEventListener('click', _send);

    _bindBodyEvents();
  }

  /**
   * ربط events للـ body (يُستدعى كلما أُعيد بناء الـ body)
   */
  function _bindBodyEvents() {
    const body = _modalEl.querySelector('#iv4-cat-body');
    if (!body) return;

    // Char count للـ textarea
    const ta = body.querySelector('#iv4-cat-body-text');
    if (ta) {
      ta.addEventListener('input', () => {
        const cnt = body.querySelector('#iv4-cat-body-count');
        if (cnt) cnt.textContent = ta.value.length;
      });
    }

    if (_type !== 'multi_product') return;

    // زر إضافة section
    const addSecBtn = body.querySelector('#iv4-cat-add-sec');
    if (addSecBtn) {
      addSecBtn.addEventListener('click', () => {
        _syncSectionsFromDOM();
        _sections.push({ title: `قسم ${_sections.length + 1}`, product_items: [{ product_retailer_id: '' }] });
        _refreshSections();
      });
    }

    // Event delegation للـ sections container
    const sectionsEl = body.querySelector('#iv4-cat-sections');
    if (sectionsEl) {
      sectionsEl.addEventListener('click', e => {
        // حذف section
        if (e.target.classList.contains('iv4-cat-remove-sec')) {
          _syncSectionsFromDOM();
          const si = +e.target.dataset.si;
          _sections.splice(si, 1);
          _refreshSections();
        }
        // إضافة منتج داخل section
        if (e.target.classList.contains('iv4-cat-add-item')) {
          _syncSectionsFromDOM();
          const si = +e.target.dataset.si;
          if (_sections[si]) {
            // حد أقصى 30 منتج لكل section (WA limit)
            if ((_sections[si].product_items || []).length >= 30) {
              _showError('الحد الأقصى 30 منتج لكل قسم');
              return;
            }
            _sections[si].product_items.push({ product_retailer_id: '' });
            _refreshSections();
          }
        }
        // حذف منتج
        if (e.target.classList.contains('iv4-cat-remove-item')) {
          _syncSectionsFromDOM();
          const si = +e.target.dataset.si;
          const ii = +e.target.dataset.ii;
          if (_sections[si] && _sections[si].product_items.length > 1) {
            _sections[si].product_items.splice(ii, 1);
            _refreshSections();
          } else {
            _showError('كل قسم يحتاج منتج واحد على الأقل');
          }
        }
      });
    }
  }

  /**
   * قراءة قيم الـ sections من الـ DOM وحفظها في _sections
   * (قبل أي إعادة بناء لتجنب ضياع ما كتبه المستخدم)
   */
  function _syncSectionsFromDOM() {
    const body = _modalEl?.querySelector('#iv4-cat-body');
    if (!body) return;

    // catalog id
    const cidEl = body.querySelector('#iv4-cat-catalog-id');
    if (cidEl) _catalogId = cidEl.value.trim();

    // section titles
    body.querySelectorAll('.iv4-cat-sec-title').forEach(inp => {
      const si = +inp.dataset.si;
      if (_sections[si]) _sections[si].title = inp.value;
    });

    // product items
    body.querySelectorAll('.iv4-cat-item-pid').forEach(inp => {
      const si = +inp.dataset.si;
      const ii = +inp.dataset.ii;
      if (_sections[si] && _sections[si].product_items[ii]) {
        _sections[si].product_items[ii].product_retailer_id = inp.value.trim();
      }
    });
  }

  /**
   * إعادة رسم الـ sections فقط (بدون إعادة بناء الـ body بالكامل)
   */
  function _refreshSections() {
    const sectionsEl = _modalEl?.querySelector('#iv4-cat-sections');
    if (!sectionsEl) return;
    sectionsEl.innerHTML = _sections.map((sec, si) => _renderSection(sec, si)).join('');

    // إعادة ربط الـ events (delegation على الـ container)
    const body = _modalEl.querySelector('#iv4-cat-body');
    const addSecBtn = body?.querySelector('#iv4-cat-add-sec');
    if (addSecBtn) {
      addSecBtn.onclick = () => {
        _syncSectionsFromDOM();
        _sections.push({ title: `قسم ${_sections.length + 1}`, product_items: [{ product_retailer_id: '' }] });
        _refreshSections();
      };
    }
    // Event delegation على الـ sectionsEl الجديد
    sectionsEl.onclick = e => {
      if (e.target.classList.contains('iv4-cat-remove-sec')) {
        _syncSectionsFromDOM();
        _sections.splice(+e.target.dataset.si, 1);
        _refreshSections();
      }
      if (e.target.classList.contains('iv4-cat-add-item')) {
        _syncSectionsFromDOM();
        const si = +e.target.dataset.si;
        if (_sections[si]) {
          if ((_sections[si].product_items || []).length >= 30) {
            _showError('الحد الأقصى 30 منتج لكل قسم'); return;
          }
          _sections[si].product_items.push({ product_retailer_id: '' });
          _refreshSections();
        }
      }
      if (e.target.classList.contains('iv4-cat-remove-item')) {
        _syncSectionsFromDOM();
        const si = +e.target.dataset.si;
        const ii = +e.target.dataset.ii;
        if (_sections[si] && _sections[si].product_items.length > 1) {
          _sections[si].product_items.splice(ii, 1);
          _refreshSections();
        } else {
          _showError('كل قسم يحتاج منتج واحد على الأقل');
        }
      }
    };
  }

  // ─── Error Display ────────────────────────────────────────────────────────

  function _showError(msg) {
    const el = _modalEl?.querySelector('#iv4-cat-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(_showError._t);
    _showError._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  async function _send() {
    if (_loading) return;

    const body = _modalEl?.querySelector('#iv4-cat-body');
    if (!body) return;

    // ── قراءة القيم من الـ DOM ────────────────────────────────────────────
    const catalogId   = (body.querySelector('#iv4-cat-catalog-id')?.value || '').trim();
    const bodyText    = (body.querySelector('#iv4-cat-body-text')?.value   || '').trim();
    const footerText  = (body.querySelector('#iv4-cat-footer-text')?.value || '').trim();

    // ── Validation ────────────────────────────────────────────────────────
    if (!catalogId) {
      _showError('Catalog ID مطلوب'); return;
    }

    let payload = { type: _type, catalog_id: catalogId, body_text: bodyText, footer_text: footerText };

    if (_type === 'single_product') {
      const pid = (body.querySelector('#iv4-cat-single-pid')?.value || '').trim();
      if (!pid) { _showError('Product ID مطلوب'); return; }
      payload.product_retailer_id = pid;

    } else {
      // multi_product — اقرأ sections من الـ DOM أولاً
      _syncSectionsFromDOM();

      const thumbPid = (body.querySelector('#iv4-cat-thumb-pid')?.value || '').trim();
      if (!thumbPid) { _showError('Thumbnail Product ID مطلوب'); return; }

      const headerText = (body.querySelector('#iv4-cat-header-text')?.value || '').trim();

      // تحقق من sections
      for (const sec of _sections) {
        for (const item of sec.product_items) {
          if (!item.product_retailer_id.trim()) {
            _showError(`قسم "${sec.title}" يحتوي على منتج بدون ID`); return;
          }
        }
      }

      payload.thumbnail_product_retailer_id = thumbPid;
      payload.header_text                   = headerText;
      payload.sections                      = _sections;
    }

    // ── إرسال ─────────────────────────────────────────────────────────────
    _loading = true;
    const sendBtn   = _modalEl.querySelector('#iv4-cat-send');
    const sendLabel = _modalEl.querySelector('#iv4-cat-send-label');
    sendBtn.disabled   = true;
    sendLabel.textContent = 'جاري الإرسال...';

    const { data, error } = await InboxAPI.messages.sendCatalog(_convId, payload);

    _loading = false;
    sendBtn.disabled   = false;
    sendLabel.textContent = 'إرسال 📦';

    if (error) {
      _showError(error);
      return;
    }

    _toast('تم إرسال المنتج بنجاح ✅', 'success');
    close();
  }

  // ─── chat.js renderer: _renderCatalog (يُستدعى من chat.js) ───────────────
  // كل message بـ content_type='catalog' تُعرض عبر هذا الـ renderer

  function renderCatalogMessage(msg) {
    let meta = {};
    try { meta = JSON.parse(msg.metadata || '{}'); } catch (_) {}
    const cat = meta.catalog || {};

    if (cat.type === 'single_product') {
      return `
        <div class="iv4-cat-card iv4-cat-card--single">
          <div class="iv4-cat-card-icon">📦</div>
          <div class="iv4-cat-card-info">
            <div class="iv4-cat-card-type">منتج من الكتالوج</div>
            <div class="iv4-cat-card-pid">ID: <code>${_esc(cat.product_retailer_id || '')}</code></div>
            ${cat.body_text ? `<div class="iv4-cat-card-body">${_esc(cat.body_text)}</div>` : ''}
            ${cat.footer_text ? `<div class="iv4-cat-card-footer">${_esc(cat.footer_text)}</div>` : ''}
          </div>
        </div>
      `;
    }

    // multi_product
    const total = (cat.sections || []).reduce(
      (s, sec) => s + (sec.product_items?.length || 0), 0
    );
    const sectionsList = (cat.sections || []).map(sec => `
      <div class="iv4-cat-sec-preview">
        <div class="iv4-cat-sec-preview-title">${_esc(sec.title || '')}</div>
        ${(sec.product_items || []).map(p =>
          `<span class="iv4-cat-pid-chip">${_esc(p.product_retailer_id || '')}</span>`
        ).join('')}
      </div>
    `).join('');

    return `
      <div class="iv4-cat-card iv4-cat-card--multi">
        <div class="iv4-cat-card-icon">📋</div>
        <div class="iv4-cat-card-info">
          ${cat.header_text ? `<div class="iv4-cat-card-header">${_esc(cat.header_text)}</div>` : ''}
          <div class="iv4-cat-card-type">كتالوج — ${total} منتج</div>
          ${cat.body_text ? `<div class="iv4-cat-card-body">${_esc(cat.body_text)}</div>` : ''}
          <div class="iv4-cat-sections-preview">${sectionsList}</div>
          ${cat.footer_text ? `<div class="iv4-cat-card-footer">${_esc(cat.footer_text)}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ─── Visibility (يُخفى الزر إذا لم تكن المنصة whatsapp_api) ─────────────

  function _updateButtonVisibility() {
    const btn = document.getElementById('iv4-catalog-btn');
    if (!btn) return;
    const platform = InboxStore.state.activeConv?.platform || '';
    // نُظهر الزر دائماً ونخبر المستخدم عند الضغط لو المنصة مش صح
    btn.style.opacity = platform === 'whatsapp_api' ? '1' : '0.4';
    btn.title = platform === 'whatsapp_api'
      ? 'إرسال منتج من الكتالوج (WhatsApp)'
      : 'إرسال منتج (يتطلب WhatsApp API)';
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // ربط زر toolbar
    const btn = document.getElementById('iv4-catalog-btn');
    if (btn) btn.addEventListener('click', open);

    // تحديث visibility عند تغيير المحادثة
    InboxStore.on('activeConvId:change', () => _updateButtonVisibility());
    InboxStore.on('activeConv:change',   () => _updateButtonVisibility());
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return { init, open, close, renderCatalogMessage };

})();
