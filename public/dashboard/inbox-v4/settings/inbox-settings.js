/**
 * inbox-settings.js — إعدادات الـ Inbox (M2 T46)
 * الأقسام: Canned Responses + SLA Policies + Custom Attrs + CSAT + Appearance
 *
 * آخر تحديث: 2026-05-04 (M2 T46)
 */

'use strict';

const SettingsInbox = (() => {

  let _container = null;
  let _activeTab = 'canned';

  const TABS = [
    { id: 'canned',     label: '💬 ردود جاهزة'    },
    { id: 'sla',        label: '⏱️ سياسات SLA'     },
    { id: 'attrs',      label: '📋 حقول مخصصة'    },
    { id: 'csat',       label: '⭐ تقييم العملاء'  },
    { id: 'appearance', label: '🎨 المظهر'          },
  ];

  // ─────────────────────────────────────────────────────────────
  function mount(container, params = {}) {
    _container = container;
    _activeTab = params.tab || 'canned';
    _renderShell();
    _loadTab(_activeTab);
  }

  function unmount() { _container = null; }

  // ─────────────────────────────────────────────────────────────
  function _renderShell() {
    if (!_container) return;
    const tabs = TABS.map(t => `
      <button class="iv4-tab-btn ${t.id === _activeTab ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
      </button>
    `).join('');
    _container.innerHTML = `
      <div class="iv4-set-section">
        <h2 class="iv4-set-section-title">⚙️ إعدادات Inbox</h2>
        <div class="iv4-tabs">${tabs}</div>
        <div id="iv4-inbox-tab-content" class="iv4-set-tab-body"></div>
      </div>
    `;
    _container.querySelectorAll('.iv4-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _container.querySelectorAll('.iv4-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeTab = btn.dataset.tab;
        _loadTab(_activeTab);
      });
    });
  }

  function _tabContent() {
    return _container?.querySelector('#iv4-inbox-tab-content');
  }

  async function _loadTab(tab) {
    const el = _tabContent();
    if (!el) return;
    el.innerHTML = '<div class="iv4-set-loading">جارٍ التحميل…</div>';
    switch (tab) {
      case 'canned':     await _loadCanned(el);     break;
      case 'sla':        await _loadSLA(el);         break;
      case 'attrs':      await _loadAttrs(el);       break;
      case 'csat':       await _loadCSAT(el);        break;
      case 'appearance': await _loadAppearance(el);  break;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: Canned Responses
  // ══════════════════════════════════════════════════════════════

  async function _loadCanned(el) {
    try {
      const res = await InboxAPI.settings.getCanned();
      _renderCanned(el, res.data?.canned || []);
    } catch (err) { el.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`; }
  }

  function _renderCanned(el, items) {
    const rows = items.map(c => `
      <tr>
        <td><code class="iv4-canned-shortcut">/${_esc(c.shortcut)}</code></td>
        <td>${_esc(c.name)}</td>
        <td class="iv4-canned-preview">${_esc(c.content.slice(0,60))}${c.content.length>60?'…':''}</td>
        <td>${_esc(c.category)}</td>
        <td>
          <button class="iv4-btn-sm iv4-btn-edit" data-id="${c.id}">✏️</button>
          <button class="iv4-btn-sm iv4-btn-del iv4-btn-danger" data-id="${c.id}">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="iv4-empty">لا توجد ردود جاهزة</td></tr>';

    el.innerHTML = `
      <div class="iv4-set-toolbar">
        <button id="iv4-canned-add" class="iv4-btn iv4-btn-primary">+ إضافة رد جاهز</button>
      </div>
      <table class="iv4-set-table">
        <thead><tr><th>Shortcut</th><th>الاسم</th><th>المحتوى</th><th>الفئة</th><th></th></tr></thead>
        <tbody id="iv4-canned-body">${rows}</tbody>
      </table>
      <div id="iv4-canned-drawer" class="iv4-drawer hidden"></div>
    `;

    el.querySelector('#iv4-canned-add').addEventListener('click', () => _openCannedDrawer(el, null, items));

    el.querySelectorAll('.iv4-btn-edit').forEach(btn => {
      const item = items.find(c => c.id == btn.dataset.id);
      btn.addEventListener('click', () => _openCannedDrawer(el, item, items));
    });

    el.querySelectorAll('.iv4-btn-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('تأكيد الحذف؟')) return;
        await InboxAPI.settings.deleteCanned(btn.dataset.id);
        _loadTab('canned');
      });
    });
  }

  function _openCannedDrawer(el, item, items) {
    const drawer = el.querySelector('#iv4-canned-drawer');
    drawer.classList.remove('hidden');
    drawer.innerHTML = `
      <div class="iv4-drawer-header">
        <span>${item ? 'تعديل رد جاهز' : 'إضافة رد جاهز'}</span>
        <button class="iv4-drawer-close">✕</button>
      </div>
      <form id="iv4-canned-form" class="iv4-drawer-body">
        <div class="iv4-set-row"><label>Shortcut (بدون /)</label>
          <input class="iv4-inp" name="shortcut" value="${_esc(item?.shortcut||'')}" required placeholder="مثال: مرحبا"></div>
        <div class="iv4-set-row"><label>الاسم</label>
          <input class="iv4-inp" name="name" value="${_esc(item?.name||'')}" required></div>
        <div class="iv4-set-row"><label>المحتوى</label>
          <textarea class="iv4-inp iv4-textarea" name="content" required>${_esc(item?.content||'')}</textarea></div>
        <div class="iv4-set-row"><label>الفئة</label>
          <input class="iv4-inp" name="category" value="${_esc(item?.category||'عام')}"></div>
        <div class="iv4-set-actions">
          <button type="submit" class="iv4-btn iv4-btn-primary">💾 حفظ</button>
          <span class="iv4-set-msg" id="iv4-canned-msg"></span>
        </div>
      </form>
    `;
    drawer.querySelector('.iv4-drawer-close').addEventListener('click', () => {
      drawer.classList.add('hidden');
    });
    drawer.querySelector('#iv4-canned-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const msg = drawer.querySelector('#iv4-canned-msg');
      try {
        if (item) await InboxAPI.settings.updateCanned(item.id, data);
        else await InboxAPI.settings.createCanned(data);
        drawer.classList.add('hidden');
        _loadTab('canned');
      } catch (err) {
        _showMsg(msg, '❌ ' + (err.message || 'خطأ'), 'error');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: SLA Policies
  // ══════════════════════════════════════════════════════════════

  async function _loadSLA(el) {
    try {
      const res = await InboxAPI.settings.getSLA();
      _renderSLA(el, res.data?.policies || []);
    } catch (err) { el.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`; }
  }

  function _renderSLA(el, policies) {
    const rows = policies.map(p => `
      <tr class="${p.is_default ? 'iv4-sla-default-row' : ''}">
        <td>${_esc(p.name)} ${p.is_default ? '<span class="iv4-badge">افتراضي</span>' : ''}</td>
        <td>${p.first_response} دقيقة</td>
        <td>${p.resolution_time} دقيقة</td>
        <td>${p.business_hours ? '⏰ ساعات عمل' : '🌙 24/7'}</td>
        <td>
          ${!p.is_default ? `<button class="iv4-btn-sm iv4-sla-default" data-id="${p.id}">⭐ تعيين افتراضي</button>` : ''}
          <button class="iv4-btn-sm iv4-btn-edit" data-id="${p.id}">✏️</button>
          ${!p.is_default ? `<button class="iv4-btn-sm iv4-btn-danger" data-id="${p.id}">🗑️</button>` : ''}
        </td>
      </tr>
    `).join('');

    el.innerHTML = `
      <div class="iv4-set-toolbar">
        <button id="iv4-sla-add" class="iv4-btn iv4-btn-primary">+ إضافة سياسة SLA</button>
      </div>
      <table class="iv4-set-table">
        <thead><tr><th>الاسم</th><th>أول رد</th><th>الحل</th><th>النوع</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div id="iv4-sla-drawer" class="iv4-drawer hidden"></div>
    `;

    el.querySelector('#iv4-sla-add').addEventListener('click', () => _openSLADrawer(el, null));
    el.querySelectorAll('.iv4-btn-edit').forEach(btn => {
      const p = policies.find(x => x.id == btn.dataset.id);
      btn.addEventListener('click', () => _openSLADrawer(el, p));
    });
    el.querySelectorAll('.iv4-sla-default').forEach(btn => {
      btn.addEventListener('click', async () => {
        await InboxAPI.settings.setDefaultSLA(btn.dataset.id);
        _loadTab('sla');
      });
    });
    el.querySelectorAll('.iv4-btn-danger').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('تأكيد الحذف؟')) return;
        try {
          await InboxAPI.settings.deleteSLA(btn.dataset.id);
          _loadTab('sla');
        } catch (err) { alert(err.message); }
      });
    });
  }

  function _openSLADrawer(el, item) {
    const drawer = el.querySelector('#iv4-sla-drawer');
    drawer.classList.remove('hidden');
    drawer.innerHTML = `
      <div class="iv4-drawer-header">
        <span>${item ? 'تعديل سياسة SLA' : 'إضافة سياسة SLA'}</span>
        <button class="iv4-drawer-close">✕</button>
      </div>
      <form id="iv4-sla-form" class="iv4-drawer-body">
        <div class="iv4-set-row"><label>الاسم</label>
          <input class="iv4-inp" name="name" value="${_esc(item?.name||'')}" required></div>
        <div class="iv4-set-row"><label>أول رد (دقيقة)</label>
          <input class="iv4-inp" type="number" name="first_response" value="${item?.first_response||120}" min="1"></div>
        <div class="iv4-set-row"><label>وقت الحل (دقيقة)</label>
          <input class="iv4-inp" type="number" name="resolution_time" value="${item?.resolution_time||480}" min="1"></div>
        <div class="iv4-set-row iv4-set-row-inline"><label>ساعات عمل فقط</label>
          <input type="checkbox" name="business_hours" ${item?.business_hours ? 'checked' : ''}></div>
        <div class="iv4-set-actions">
          <button type="submit" class="iv4-btn iv4-btn-primary">💾 حفظ</button>
          <span class="iv4-set-msg" id="iv4-sla-msg"></span>
        </div>
      </form>
    `;
    drawer.querySelector('.iv4-drawer-close').addEventListener('click', () => drawer.classList.add('hidden'));
    drawer.querySelector('#iv4-sla-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        name: fd.get('name'),
        first_response: parseInt(fd.get('first_response')),
        resolution_time: parseInt(fd.get('resolution_time')),
        business_hours: fd.get('business_hours') ? 1 : 0,
      };
      const msg = drawer.querySelector('#iv4-sla-msg');
      try {
        if (item) await InboxAPI.settings.updateSLA(item.id, data);
        else await InboxAPI.settings.createSLA(data);
        drawer.classList.add('hidden');
        _loadTab('sla');
      } catch (err) { _showMsg(msg, '❌ ' + err.message, 'error'); }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: Custom Attrs
  // ══════════════════════════════════════════════════════════════

  async function _loadAttrs(el) {
    try {
      const [convRes, contactRes] = await Promise.all([
        InboxAPI.settings.getAttrs('conversation'),
        InboxAPI.settings.getAttrs('contact'),
      ]);
      _renderAttrs(el, convRes.data?.attrs || [], contactRes.data?.attrs || []);
    } catch (err) { el.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`; }
  }

  function _renderAttrs(el, convAttrs, contactAttrs) {
    const _attrRows = (attrs, type) => attrs.map(a => `
      <tr>
        <td><code>${_esc(a.key)}</code></td>
        <td>${_esc(a.label)}</td>
        <td>${a.field_type}</td>
        <td>${a.required ? '✅' : '—'}</td>
        <td>
          <button class="iv4-btn-sm iv4-attr-del iv4-btn-danger" data-id="${a.id}" data-type="${type}">🗑️</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="iv4-empty">لا توجد حقول</td></tr>`;

    el.innerHTML = `
      <div class="iv4-attrs-section">
        <h3>حقول المحادثة
          <button class="iv4-btn iv4-btn-primary iv4-attr-add" data-type="conversation">+ إضافة</button>
        </h3>
        <table class="iv4-set-table">
          <thead><tr><th>Key</th><th>التسمية</th><th>النوع</th><th>إلزامي</th><th></th></tr></thead>
          <tbody id="iv4-conv-attrs">${_attrRows(convAttrs,'conversation')}</tbody>
        </table>
      </div>
      <div class="iv4-attrs-section">
        <h3>حقول جهة الاتصال
          <button class="iv4-btn iv4-btn-primary iv4-attr-add" data-type="contact">+ إضافة</button>
        </h3>
        <table class="iv4-set-table">
          <thead><tr><th>Key</th><th>التسمية</th><th>النوع</th><th>إلزامي</th><th></th></tr></thead>
          <tbody id="iv4-contact-attrs">${_attrRows(contactAttrs,'contact')}</tbody>
        </table>
      </div>
      <div id="iv4-attr-drawer" class="iv4-drawer hidden"></div>
    `;

    el.querySelectorAll('.iv4-attr-add').forEach(btn => {
      btn.addEventListener('click', () => _openAttrDrawer(el, btn.dataset.type));
    });
    el.querySelectorAll('.iv4-attr-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('تأكيد حذف الحقل؟')) return;
        await InboxAPI.settings.deleteAttr(btn.dataset.type, btn.dataset.id);
        _loadTab('attrs');
      });
    });
  }

  function _openAttrDrawer(el, type) {
    const drawer = el.querySelector('#iv4-attr-drawer');
    drawer.classList.remove('hidden');
    drawer.innerHTML = `
      <div class="iv4-drawer-header">
        <span>إضافة حقل مخصص — ${type === 'conversation' ? 'محادثة' : 'جهة اتصال'}</span>
        <button class="iv4-drawer-close">✕</button>
      </div>
      <form id="iv4-attr-form" class="iv4-drawer-body">
        <div class="iv4-set-row"><label>المفتاح (key)</label>
          <input class="iv4-inp" name="key" required placeholder="مثال: order_id"></div>
        <div class="iv4-set-row"><label>التسمية</label>
          <input class="iv4-inp" name="label" required placeholder="مثال: رقم الطلب"></div>
        <div class="iv4-set-row"><label>النوع</label>
          <select class="iv4-inp" name="field_type">
            <option>text</option><option>number</option><option>select</option>
            <option>date</option><option>checkbox</option>
          </select>
        </div>
        <div class="iv4-set-row iv4-set-row-inline"><label>إلزامي</label>
          <input type="checkbox" name="required"></div>
        <div class="iv4-set-actions">
          <button type="submit" class="iv4-btn iv4-btn-primary">💾 إضافة</button>
          <span class="iv4-set-msg" id="iv4-attr-msg"></span>
        </div>
      </form>
    `;
    drawer.querySelector('.iv4-drawer-close').addEventListener('click', () => drawer.classList.add('hidden'));
    drawer.querySelector('#iv4-attr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        key: fd.get('key'), label: fd.get('label'),
        field_type: fd.get('field_type'), required: fd.get('required') ? 1 : 0,
      };
      const msg = drawer.querySelector('#iv4-attr-msg');
      try {
        await InboxAPI.settings.createAttr(type, data);
        drawer.classList.add('hidden');
        _loadTab('attrs');
      } catch (err) { _showMsg(msg, '❌ ' + err.message, 'error'); }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: CSAT
  // ══════════════════════════════════════════════════════════════

  async function _loadCSAT(el) {
    try {
      const res = await InboxAPI.settings.getCSAT();
      _renderCSAT(el, res.data?.csat || {});
    } catch (err) { el.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`; }
  }

  function _renderCSAT(el, csat) {
    el.innerHTML = `
      <div class="iv4-set-section">
        <form id="iv4-csat-form" class="iv4-set-form">
          <div class="iv4-set-row iv4-set-row-inline">
            <label class="iv4-set-label">تفعيل تقييم العملاء (CSAT)</label>
            <label class="iv4-toggle">
              <input type="checkbox" name="enabled" ${csat.enabled ? 'checked' : ''}>
              <span class="iv4-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-set-row"><label>إرسال التقييم</label>
            <select class="iv4-inp" name="trigger">
              <option value="on_close" ${csat.trigger==='on_close'?'selected':''}>عند إغلاق المحادثة</option>
              <option value="on_resolve" ${csat.trigger==='on_resolve'?'selected':''}>عند حل المحادثة</option>
              <option value="manual" ${csat.trigger==='manual'?'selected':''}>يدوي</option>
            </select>
          </div>
          <div class="iv4-set-row"><label>تأخير الإرسال (دقائق)</label>
            <input class="iv4-inp" type="number" name="delay_minutes" value="${csat.delay_minutes||0}" min="0">
          </div>
          <div class="iv4-set-row"><label>رسالة التقييم</label>
            <textarea class="iv4-inp iv4-textarea" name="message">${_esc(csat.message||'كيف كانت تجربتك معنا؟')}</textarea>
          </div>
          <div class="iv4-set-row"><label>مقياس التقييم</label>
            <select class="iv4-inp" name="scale">
              <option value="3" ${csat.scale==3?'selected':''}>3 نجوم</option>
              <option value="5" ${csat.scale==5?'selected':''}>5 نجوم</option>
              <option value="10" ${csat.scale==10?'selected':''}>10 نقاط</option>
            </select>
          </div>
          <div class="iv4-set-actions">
            <button type="submit" class="iv4-btn iv4-btn-primary">💾 حفظ</button>
            <span class="iv4-set-msg" id="iv4-csat-msg"></span>
          </div>
        </form>
      </div>
    `;
    el.querySelector('#iv4-csat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        enabled: fd.get('enabled') ? 1 : 0,
        trigger: fd.get('trigger'),
        delay_minutes: parseInt(fd.get('delay_minutes')),
        message: fd.get('message'),
        scale: parseInt(fd.get('scale')),
      };
      const msg = el.querySelector('#iv4-csat-msg');
      try {
        await InboxAPI.settings.updateCSAT(data);
        _showMsg(msg, '✅ تم الحفظ', 'success');
      } catch (err) { _showMsg(msg, '❌ ' + err.message, 'error'); }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: Appearance
  // ══════════════════════════════════════════════════════════════

  async function _loadAppearance(el) {
    try {
      const res = await InboxAPI.settings.getAppearance();
      _renderAppearance(el, res.data?.appearance || {});
    } catch (err) { el.innerHTML = `<div class="iv4-set-error">خطأ: ${err.message}</div>`; }
  }

  function _renderAppearance(el, ap) {
    el.innerHTML = `
      <div class="iv4-set-section">
        <form id="iv4-ap-form" class="iv4-set-form">
          <div class="iv4-set-row"><label>كثافة العرض</label>
            <select class="iv4-inp" name="density">
              <option value="comfy" ${ap.density==='comfy'?'selected':''}>مريح (Comfy)</option>
              <option value="compact" ${ap.density==='compact'?'selected':''}>مضغوط (Compact)</option>
            </select>
          </div>
          <div class="iv4-set-row"><label>حجم الخط</label>
            <input class="iv4-inp" type="number" name="font_size" value="${ap.font_size||14}" min="10" max="20">
          </div>
          <div class="iv4-set-row iv4-set-row-inline"><label>إظهار الصور الشخصية</label>
            <label class="iv4-toggle">
              <input type="checkbox" name="show_avatar" ${ap.show_avatar !== 0 ? 'checked' : ''}>
              <span class="iv4-toggle-slider"></span>
            </label>
          </div>
          <div class="iv4-set-actions">
            <button type="submit" class="iv4-btn iv4-btn-primary">💾 حفظ</button>
            <span class="iv4-set-msg" id="iv4-ap-msg"></span>
          </div>
        </form>
      </div>
    `;
    el.querySelector('#iv4-ap-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        density: fd.get('density'),
        font_size: parseInt(fd.get('font_size')),
        show_avatar: fd.get('show_avatar') ? 1 : 0,
      };
      const msg = el.querySelector('#iv4-ap-msg');
      try {
        await InboxAPI.settings.updateAppearance(data);
        _showMsg(msg, '✅ تم الحفظ', 'success');
      } catch (err) { _showMsg(msg, '❌ ' + err.message, 'error'); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function _showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `iv4-set-msg iv4-set-msg-${type}`;
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  }

  return { mount, unmount };
})();

window.SettingsInbox = SettingsInbox;
