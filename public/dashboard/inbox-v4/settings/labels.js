/**
 * settings/labels.js — صفحة إدارة Labels في Settings
 * آخر تحديث: 2026-05-05
 *
 * المسؤوليات:
 *  - عرض قائمة الـ Labels الحالية مع عدد المحادثات
 *  - إنشاء Label جديد (اسم + لون)
 *  - تعديل اسم/لون Label موجود (inline edit)
 *  - حذف Label (مع تأكيد لو فيه محادثات)
 *  - تحديث InboxLabels الـ global state بعد كل عملية
 */

'use strict';

const SettingsLabels = (() => {

  let _container = null;

  /** @type {Array<{id:number,name:string,color:string,conv_count:number}>} */
  let _labels = [];

  // ─── Color Presets ────────────────────────────────────────────────────────

  const COLOR_PRESETS = [
    '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB',
    '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
    '#7CB342', '#F9A825', '#FB8C00', '#E64A19', '#6D4C41',
    '#546E7A', '#1B5E30', '#B71C1C', '#F57F17', '#212121',
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Mount / Unmount ──────────────────────────────────────────────────────

  async function mount(container) {
    _container = container;
    _render();
    await _loadLabels();
  }

  function unmount() {
    _container = null;
    _labels = [];
  }

  // ─── Render Shell ─────────────────────────────────────────────────────────

  function _render() {
    if (!_container) return;

    _container.innerHTML = `
      <div class="iv4-set-labels" dir="rtl">

        <!-- Header -->
        <div class="iv4-set-section-header">
          <div>
            <h2 class="iv4-set-section-title">🏷️ Labels</h2>
            <p class="iv4-set-section-desc">صنّف المحادثات بـ Labels ملونة — مثل: استفسار، دعم فني، متابعة</p>
          </div>
        </div>

        <!-- فورم إضافة Label جديد -->
        <div class="iv4-set-card iv4-labels-add-card">
          <h3 class="iv4-set-card-title">إضافة Label جديد</h3>

          <div class="iv4-labels-add-row">
            <input
              id="sl-name-input"
              class="iv4-input iv4-labels-name-input"
              type="text"
              placeholder="اسم الـ Label (مثال: استفسار)"
              maxlength="50"
              autocomplete="off"
            />
            <div class="iv4-labels-color-wrap" title="اختر اللون">
              <input
                id="sl-color-input"
                class="iv4-color-input iv4-labels-color-input"
                type="color"
                value="#1B5E30"
              />
            </div>
            <button id="sl-add-btn" class="iv4-btn iv4-btn--primary">
              + إضافة
            </button>
          </div>

          <!-- ألوان جاهزة -->
          <div class="iv4-labels-presets">
            ${COLOR_PRESETS.map(c => `
              <button
                class="iv4-color-preset iv4-labels-preset-btn"
                data-color="${c}"
                style="background:${c}"
                title="${c}"
              ></button>
            `).join('')}
          </div>

          <div id="sl-form-error" class="iv4-label-form-error" style="display:none"></div>
        </div>

        <!-- قائمة Labels -->
        <div class="iv4-set-card">
          <h3 class="iv4-set-card-title">Labels الحالية</h3>
          <div id="sl-list" class="iv4-labels-settings-list">
            <div class="iv4-set-loading">جارٍ التحميل…</div>
          </div>
        </div>

      </div>
    `;

    _bindAddForm();
  }

  // ─── Load Labels ──────────────────────────────────────────────────────────

  async function _loadLabels() {
    const { data, error } = await InboxAPI.labels.list();
    if (error) {
      _setListHTML(`<div class="iv4-set-empty-state">❌ خطأ في التحميل: ${_esc(error)}</div>`);
      return;
    }
    _labels = data.labels || [];
    _renderList();
  }

  // ─── Render List ──────────────────────────────────────────────────────────

  function _renderList() {
    if (!_labels.length) {
      _setListHTML(`
        <div class="iv4-set-empty-state">
          <div class="iv4-set-empty-icon">🏷️</div>
          <div>لا توجد Labels بعد — أضف أول Label من الفورم أعلاه</div>
        </div>
      `);
      return;
    }

    const rows = _labels.map(l => `
      <div class="iv4-labels-row" data-label-id="${l.id}">
        <span class="iv4-label-dot iv4-labels-row-dot" style="background:${_esc(l.color)}"></span>
        <span class="iv4-labels-row-name">${_esc(l.name)}</span>
        <span class="iv4-labels-row-count">${l.conv_count || 0} محادثة</span>
        <div class="iv4-labels-row-actions">
          <button
            class="iv4-btn iv4-btn--ghost iv4-btn--sm"
            data-action="edit"
            title="تعديل"
          >✏️ تعديل</button>
          <button
            class="iv4-btn iv4-btn--ghost iv4-btn--sm iv4-btn--danger"
            data-action="delete"
            title="حذف"
          >🗑 حذف</button>
        </div>
      </div>
    `).join('');

    _setListHTML(rows);
    _bindListActions();
  }

  function _setListHTML(html) {
    const list = $('sl-list');
    if (list) list.innerHTML = html;
  }

  // ─── Bind Form ────────────────────────────────────────────────────────────

  function _bindAddForm() {
    if (!_container) return;

    // Color presets
    _container.querySelectorAll('.iv4-labels-preset-btn').forEach(btn => {
      btn.onclick = () => {
        const colorInput = $('sl-color-input');
        if (colorInput) colorInput.value = btn.dataset.color;
        // active state
        _container.querySelectorAll('.iv4-labels-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    // Add button
    const addBtn = $('sl-add-btn');
    if (addBtn) addBtn.onclick = _onAdd;

    // Enter key
    const nameInput = $('sl-name-input');
    if (nameInput) nameInput.onkeydown = e => { if (e.key === 'Enter') _onAdd(); };
  }

  async function _onAdd() {
    const nameInput  = $('sl-name-input');
    const colorInput = $('sl-color-input');
    const errorDiv   = $('sl-form-error');

    const name  = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#1B5E30';

    if (!name) {
      _showError('الاسم مطلوب');
      nameInput?.focus();
      return;
    }

    const addBtn = $('sl-add-btn');
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = '⏳ جارٍ الإضافة…'; }

    const { data, error } = await InboxAPI.labels.create(name, color);

    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '+ إضافة'; }

    if (error) {
      _showError(error.includes('exists') ? 'هذا الاسم موجود بالفعل' : error);
      return;
    }

    // إضافة محلية
    const newLabel = data.label || { id: data.id, name, color, conv_count: 0 };
    _labels.push(newLabel);
    _labels.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    // تحديث InboxLabels global
    if (typeof InboxLabels !== 'undefined') {
      InboxLabels.getLabels().push(newLabel);
    }

    if (nameInput) nameInput.value = '';
    _hideError();
    _renderList();
  }

  // ─── List Actions ─────────────────────────────────────────────────────────

  function _bindListActions() {
    const list = $('sl-list');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const row = e.target.closest('[data-label-id]');
      if (!row) return;
      const labelId = Number(row.dataset.labelId);

      if (e.target.closest('[data-action="edit"]')) {
        _enterEditMode(row, labelId);
      } else if (e.target.closest('[data-action="delete"]')) {
        await _deleteLabel(labelId, row);
      } else if (e.target.closest('[data-action="save"]')) {
        await _saveEdit(row, labelId);
      } else if (e.target.closest('[data-action="cancel"]')) {
        _renderList();
      }
    });

    list.addEventListener('keydown', (e) => {
      const editInput = e.target.closest('.iv4-labels-edit-input');
      if (!editInput) return;
      const row = e.target.closest('[data-label-id]');
      if (!row) return;
      if (e.key === 'Enter') _saveEdit(row, Number(row.dataset.labelId));
      if (e.key === 'Escape') _renderList();
    });
  }

  function _enterEditMode(row, labelId) {
    const label = _labels.find(l => l.id === labelId);
    if (!label) return;

    row.innerHTML = `
      <input
        class="iv4-input iv4-labels-edit-input"
        type="text"
        value="${_esc(label.name)}"
        maxlength="50"
        aria-label="اسم Label"
        style="flex:1; min-width:0;"
      />
      <input
        class="iv4-color-input iv4-labels-edit-color"
        type="color"
        value="${_esc(label.color)}"
        title="اللون"
      />
      <div class="iv4-labels-row-actions">
        <button class="iv4-btn iv4-btn--primary iv4-btn--sm" data-action="save">✔ حفظ</button>
        <button class="iv4-btn iv4-btn--ghost iv4-btn--sm" data-action="cancel">✕ إلغاء</button>
      </div>
    `;
    row.querySelector('.iv4-labels-edit-input').focus();
  }

  async function _saveEdit(row, labelId) {
    const nameInput  = row.querySelector('.iv4-labels-edit-input');
    const colorInput = row.querySelector('.iv4-labels-edit-color');
    const name  = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#1B5E30';

    if (!name) { nameInput?.focus(); return; }

    const saveBtn = row.querySelector('[data-action="save"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }

    const { data, error } = await InboxAPI.labels.update(labelId, name, color);

    if (error) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✔ حفظ'; }
      alert(error.includes('exists') ? 'هذا الاسم موجود بالفعل' : `خطأ: ${error}`);
      return;
    }

    // تحديث محلي
    const idx = _labels.findIndex(l => l.id === labelId);
    if (idx !== -1) {
      _labels[idx].name  = data.label.name;
      _labels[idx].color = data.label.color;
    }
    _labels.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    // تحديث InboxLabels global
    if (typeof InboxLabels !== 'undefined') {
      const gl = InboxLabels.getLabels();
      const gi = gl.findIndex(l => l.id === labelId);
      if (gi !== -1) { gl[gi].name = data.label.name; gl[gi].color = data.label.color; }
    }

    _renderList();
  }

  async function _deleteLabel(labelId, row) {
    const label = _labels.find(l => l.id === labelId);
    if (!label) return;

    const convCount = label.conv_count || 0;
    if (convCount > 0) {
      const ok = confirm(
        `هذا الـ Label مرتبط بـ ${convCount} محادثة.\nحذفه سيزيله من كل المحادثات.\n\nهل تريد المتابعة؟`
      );
      if (!ok) return;
    } else {
      const ok = confirm(`هل تريد حذف Label "${label.name}"؟`);
      if (!ok) return;
    }

    row.style.opacity = '0.4';
    row.style.pointerEvents = 'none';

    const { error } = await InboxAPI.labels.delete(labelId);
    if (error) {
      row.style.opacity = '';
      row.style.pointerEvents = '';
      alert(`خطأ في الحذف: ${error}`);
      return;
    }

    _labels = _labels.filter(l => l.id !== labelId);

    // تحديث InboxLabels global
    if (typeof InboxLabels !== 'undefined') {
      const gl = InboxLabels.getLabels();
      const gi = gl.findIndex(l => l.id === labelId);
      if (gi !== -1) gl.splice(gi, 1);
    }

    _renderList();
  }

  // ─── Error Helpers ────────────────────────────────────────────────────────

  function _showError(msg) {
    const el = $('sl-form-error');
    if (el) { el.textContent = msg; el.style.display = ''; }
  }

  function _hideError() {
    const el = $('sl-form-error');
    if (el) el.style.display = 'none';
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return { mount, unmount };

})();

window.SettingsLabels = SettingsLabels;
