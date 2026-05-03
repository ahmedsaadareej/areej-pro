/**
 * inbox-v4/labels.js — Labels + Tags Management (P3-1)
 * آخر تحديث: 2026-05-03
 *
 * المسؤوليات:
 *  - InboxLabels.init()          → تهيئة + جلب labels من API
 *  - Label Manager Modal         → إنشاء / تعديل / حذف labels
 *  - Label Picker في Chat Header → إضافة / إزالة labels على محادثة مفتوحة
 *  - SSE listener                → تحديث فوري عند conv_update + labels_update
 */

'use strict';

const InboxLabels = (() => {

  // ─── الحالة الداخلية ──────────────────────────────────────────────────────

  /** @type {Array<{id:number,name:string,color:string,conv_count:number}>} */
  let _labels = [];

  /** convId المفتوح حالياً */
  let _currentConvId = null;

  /** labels المحادثة الحالية */
  let _currentConvLabels = [];

  // ─── DOM Helpers ─────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    await _loadLabels();
    _registerSSE();

    // زر فتح Label Manager (في settings أو sidebar)
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="open-label-manager"]')) {
        openLabelManager();
      }
    });
  }

  // ─── تحميل الـ Labels ─────────────────────────────────────────────────────

  async function _loadLabels() {
    const { data, error } = await InboxAPI.labels.list();
    if (error) { console.error('[labels] load error:', error); return; }
    _labels = data.labels || [];
    InboxStore.set('labels', _labels);
    _renderSidebarLabels();
  }

  // ─── Sidebar Render ───────────────────────────────────────────────────────

  function _renderSidebarLabels() {
    const container = $('iv4-labels-list');
    if (!container) return;

    if (!_labels.length) {
      container.innerHTML = '<div class="iv4-labels-empty">لا توجد labels</div>';
      return;
    }

    container.innerHTML = _labels.map(l => `
      <button
        class="iv4-label-btn iv4-nav-btn"
        data-label-id="${l.id}"
        title="${_esc(l.name)} (${l.conv_count || 0})"
      >
        <span class="iv4-label-dot" style="background:${_esc(l.color)}"></span>
        <span class="iv4-nav-label">${_esc(l.name)}</span>
        <span class="iv4-label-count">${l.conv_count || 0}</span>
      </button>
    `).join('');

    // Event delegation
    container.onclick = e => {
      const btn = e.target.closest('.iv4-label-btn');
      if (!btn) return;
      const labelId = Number(btn.dataset.labelId);
      InboxStore.emit('filter:label', labelId);
      // active state
      container.querySelectorAll('.iv4-label-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  }

  // ─── Label Manager Modal ──────────────────────────────────────────────────

  function openLabelManager() {
    _closeLabelManager();

    const modal = document.createElement('div');
    modal.id = 'iv4-label-manager';
    modal.className = 'iv4-modal-overlay';
    modal.innerHTML = `
      <div class="iv4-modal iv4-label-manager-modal" role="dialog" aria-label="إدارة Labels">
        <div class="iv4-modal-header">
          <h3 class="iv4-modal-title">🏷️ إدارة Labels</h3>
          <button class="iv4-modal-close" data-action="close-label-manager" aria-label="إغلاق">✕</button>
        </div>

        <div class="iv4-modal-body">
          <!-- فورم إضافة label جديد -->
          <div class="iv4-label-form">
            <h4 class="iv4-label-form-title">إضافة Label جديد</h4>
            <div class="iv4-label-form-row">
              <input
                id="iv4-label-name-input"
                class="iv4-input iv4-label-name-input"
                type="text"
                placeholder="اسم الـ Label..."
                maxlength="50"
              />
              <div class="iv4-color-picker-wrap">
                <input
                  id="iv4-label-color-input"
                  class="iv4-color-input"
                  type="color"
                  value="#1B5E30"
                  title="اختر لوناً"
                />
              </div>
              <button id="iv4-label-add-btn" class="iv4-btn iv4-btn--primary">
                + إضافة
              </button>
            </div>
            <div id="iv4-label-form-error" class="iv4-label-form-error" style="display:none"></div>

            <!-- ألوان جاهزة -->
            <div class="iv4-color-presets">
              ${_colorPresets().map(c => `
                <button
                  class="iv4-color-preset"
                  data-color="${c}"
                  style="background:${c}"
                  title="${c}"
                  aria-label="لون ${c}"
                ></button>
              `).join('')}
            </div>
          </div>

          <!-- قائمة الـ labels الحالية -->
          <div id="iv4-label-manager-list" class="iv4-label-manager-list">
            ${_renderManagerList()}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('[data-action="close-label-manager"]').onclick = _closeLabelManager;
    modal.addEventListener('click', e => { if (e.target === modal) _closeLabelManager(); });
    document.addEventListener('keydown', _onManagerKeydown);

    // Add button
    modal.querySelector('#iv4-label-add-btn').onclick = _onAddLabel;
    modal.querySelector('#iv4-label-name-input').onkeydown = e => {
      if (e.key === 'Enter') _onAddLabel();
    };

    // Color presets
    modal.querySelectorAll('.iv4-color-preset').forEach(btn => {
      btn.onclick = () => {
        const colorInput = $('iv4-label-color-input');
        if (colorInput) colorInput.value = btn.dataset.color;
      };
    });

    // Event delegation للقائمة
    const list = $('iv4-label-manager-list');
    if (list) {
      list.addEventListener('click', _onManagerListClick);
      list.addEventListener('keydown', _onManagerListKeydown);
    }

    // Focus
    setTimeout(() => {
      const inp = $('iv4-label-name-input');
      if (inp) inp.focus();
    }, 100);
  }

  function _closeLabelManager() {
    const existing = $('iv4-label-manager');
    if (existing) existing.remove();
    document.removeEventListener('keydown', _onManagerKeydown);
  }

  function _onManagerKeydown(e) {
    if (e.key === 'Escape') _closeLabelManager();
  }

  function _renderManagerList() {
    if (!_labels.length) {
      return '<div class="iv4-labels-empty">لا توجد labels بعد</div>';
    }
    return _labels.map(l => `
      <div class="iv4-label-manager-row" data-label-id="${l.id}">
        <span class="iv4-label-dot" style="background:${_esc(l.color)}"></span>
        <span class="iv4-label-manager-name" title="${_esc(l.name)}">${_esc(l.name)}</span>
        <span class="iv4-label-manager-count">${l.conv_count || 0} محادثة</span>
        <div class="iv4-label-manager-actions">
          <button class="iv4-btn iv4-btn--ghost iv4-btn--sm" data-action="edit-label" title="تعديل">✏️</button>
          <button class="iv4-btn iv4-btn--ghost iv4-btn--sm iv4-btn--danger" data-action="delete-label" title="حذف">🗑</button>
        </div>
      </div>
    `).join('');
  }

  function _refreshManagerList() {
    const list = $('iv4-label-manager-list');
    if (list) list.innerHTML = _renderManagerList();
  }

  async function _onAddLabel() {
    const nameInput  = $('iv4-label-name-input');
    const colorInput = $('iv4-label-color-input');
    const errorDiv   = $('iv4-label-form-error');

    const name  = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#1B5E30';

    if (!name) {
      _showFormError('الاسم مطلوب');
      nameInput?.focus();
      return;
    }

    const addBtn = $('iv4-label-add-btn');
    if (addBtn) addBtn.disabled = true;

    const { data, error } = await InboxAPI.labels.create(name, color);
    if (addBtn) addBtn.disabled = false;

    if (error) {
      _showFormError(error.includes('exists') ? 'هذا الاسم موجود بالفعل' : error);
      return;
    }

    // إضافة للقائمة المحلية
    _labels.push(data.label || { id: data.id, name, color, conv_count: 0 });
    _labels.sort((a, b) => a.name.localeCompare(b.name));
    InboxStore.set('labels', _labels);

    // تحديث UI
    if (nameInput) nameInput.value = '';
    _hideFormError();
    _refreshManagerList();
    _renderSidebarLabels();
  }

  async function _onManagerListClick(e) {
    const row = e.target.closest('[data-label-id]');
    if (!row) return;
    const labelId = Number(row.dataset.labelId);

    if (e.target.closest('[data-action="edit-label"]')) {
      _enterEditMode(row, labelId);
    } else if (e.target.closest('[data-action="delete-label"]')) {
      await _deleteLabel(labelId, row);
    }
  }

  function _onManagerListKeydown(e) {
    if (e.key === 'Enter' && e.target.closest('.iv4-label-edit-input')) {
      const row = e.target.closest('[data-label-id]');
      if (row) _saveEditLabel(row, Number(row.dataset.labelId));
    }
    if (e.key === 'Escape' && e.target.closest('.iv4-label-edit-input')) {
      _refreshManagerList();
    }
  }

  function _enterEditMode(row, labelId) {
    const label = _labels.find(l => l.id === labelId);
    if (!label) return;

    row.innerHTML = `
      <input
        class="iv4-input iv4-label-edit-input"
        type="text"
        value="${_esc(label.name)}"
        maxlength="50"
        aria-label="اسم Label"
      />
      <input
        class="iv4-color-input iv4-label-edit-color"
        type="color"
        value="${_esc(label.color)}"
        title="اللون"
      />
      <div class="iv4-label-manager-actions">
        <button class="iv4-btn iv4-btn--primary iv4-btn--sm" data-action="save-label" title="حفظ">✔</button>
        <button class="iv4-btn iv4-btn--ghost iv4-btn--sm" data-action="cancel-edit" title="إلغاء">✕</button>
      </div>
    `;

    // Save/Cancel handlers في الـ row
    row.querySelector('[data-action="save-label"]').onclick = () => _saveEditLabel(row, labelId);
    row.querySelector('[data-action="cancel-edit"]').onclick = () => _refreshManagerList();
    row.querySelector('.iv4-label-edit-input').focus();
  }

  async function _saveEditLabel(row, labelId) {
    const nameInput  = row.querySelector('.iv4-label-edit-input');
    const colorInput = row.querySelector('.iv4-label-edit-color');
    const name  = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#1B5E30';

    if (!name) { nameInput?.focus(); return; }

    const { data, error } = await InboxAPI.labels.update(labelId, name, color);
    if (error) {
      alert(error.includes('exists') ? 'هذا الاسم موجود بالفعل' : `خطأ: ${error}`);
      return;
    }

    // تحديث محلي
    const idx = _labels.findIndex(l => l.id === labelId);
    if (idx !== -1) {
      _labels[idx].name  = data.label.name;
      _labels[idx].color = data.label.color;
    }
    _labels.sort((a, b) => a.name.localeCompare(b.name));
    InboxStore.set('labels', _labels);

    _refreshManagerList();
    _renderSidebarLabels();

    // لو المحادثة المفتوحة تحتوي هذا اللابل — حدّث الـ picker
    if (_currentConvLabels.some(l => l.id === labelId)) {
      _currentConvLabels = _currentConvLabels.map(l =>
        l.id === labelId ? { ...l, name: data.label.name, color: data.label.color } : l
      );
      _renderLabelPicker();
    }
  }

  async function _deleteLabel(labelId, row) {
    const label = _labels.find(l => l.id === labelId);
    const convCount = label?.conv_count || 0;

    if (convCount > 0) {
      const confirmed = confirm(
        `هذا الـ label مرتبط بـ ${convCount} محادثة. حذفه سيزيله من كل المحادثات. هل تريد المتابعة؟`
      );
      if (!confirmed) return;
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
    InboxStore.set('labels', _labels);

    _refreshManagerList();
    _renderSidebarLabels();

    // أزل من المحادثة الحالية لو كان موجوداً
    if (_currentConvLabels.some(l => l.id === labelId)) {
      _currentConvLabels = _currentConvLabels.filter(l => l.id !== labelId);
      _renderLabelPicker();
    }
  }

  // ─── Label Picker (في Chat Header) ───────────────────────────────────────

  /**
   * يُستدعى من chat.js عند فتح محادثة
   * @param {number} convId
   * @param {Array}  convLabels - labels المحادثة من API
   */
  function openConversation(convId, convLabels) {
    _currentConvId     = convId;
    _currentConvLabels = convLabels || [];
    _renderLabelPicker();
  }

  /**
   * رسم زر الـ Label Picker في الـ chat header
   * الـ placeholder هو div#iv4-label-picker-mount
   */
  function _renderLabelPicker() {
    const mount = $('iv4-label-picker-mount');
    if (!mount) return;

    // Active labels chips
    const chips = _currentConvLabels.map(l => `
      <span class="iv4-label-chip" style="background:${_esc(l.color)}" title="${_esc(l.name)}">
        ${_esc(l.name)}
        <button
          class="iv4-label-chip-remove"
          data-action="remove-conv-label"
          data-label-id="${l.id}"
          aria-label="إزالة ${_esc(l.name)}"
        >×</button>
      </span>
    `).join('');

    mount.innerHTML = `
      <div class="iv4-label-picker">
        <div class="iv4-label-chips-wrap">
          ${chips}
          <button
            class="iv4-label-picker-btn"
            data-action="toggle-label-dropdown"
            aria-label="إضافة label"
            title="إضافة label"
          >🏷️ <span class="iv4-label-picker-btn-text">Labels</span></button>
        </div>
      </div>
    `;

    // Remove chip
    mount.querySelectorAll('[data-action="remove-conv-label"]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        _removeConvLabel(Number(btn.dataset.labelId));
      };
    });

    // Toggle dropdown
    mount.querySelector('[data-action="toggle-label-dropdown"]').onclick = e => {
      e.stopPropagation();
      _toggleLabelDropdown(e.currentTarget);
    };
  }

  function _toggleLabelDropdown(anchorBtn) {
    // أزل القديم لو موجود
    const existing = document.querySelector('.iv4-label-dropdown');
    if (existing) { existing.remove(); return; }

    const availableLabels = _labels.filter(
      l => !_currentConvLabels.some(cl => cl.id === l.id)
    );

    const dropdown = document.createElement('div');
    dropdown.className = 'iv4-label-dropdown';

    if (!availableLabels.length) {
      dropdown.innerHTML = `
        <div class="iv4-label-dropdown-empty">
          كل الـ labels مضافة بالفعل
          <br>
          <button class="iv4-btn iv4-btn--ghost iv4-btn--sm" data-action="open-label-manager" style="margin-top:6px">
            ➕ إدارة Labels
          </button>
        </div>
      `;
    } else {
      dropdown.innerHTML = `
        <div class="iv4-label-dropdown-search-wrap">
          <input
            class="iv4-input iv4-label-dropdown-search"
            type="text"
            placeholder="بحث..."
            autocomplete="off"
          />
        </div>
        <div class="iv4-label-dropdown-list">
          ${availableLabels.map(l => `
            <button
              class="iv4-label-dropdown-item"
              data-label-id="${l.id}"
              title="${_esc(l.name)}"
            >
              <span class="iv4-label-dot" style="background:${_esc(l.color)}"></span>
              <span>${_esc(l.name)}</span>
            </button>
          `).join('')}
        </div>
        <div class="iv4-label-dropdown-footer">
          <button
            class="iv4-btn iv4-btn--ai iv4-btn--sm iv4-label-ai-suggest-btn"
            data-action="ai-suggest-labels"
            title="اقتراح labels تلقائي بالذكاء الاصطناعي"
          >✨ اقتراح تلقائي</button>
          <button class="iv4-btn iv4-btn--ghost iv4-btn--sm" data-action="open-label-manager">
            ⚙️ إدارة Labels
          </button>
        </div>
      `;

      // بحث
      const searchInput = dropdown.querySelector('.iv4-label-dropdown-search');
      searchInput?.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        dropdown.querySelectorAll('.iv4-label-dropdown-item').forEach(item => {
          const name = item.textContent.trim().toLowerCase();
          item.style.display = name.includes(q) ? '' : 'none';
        });
      });
      setTimeout(() => searchInput?.focus(), 50);
    }

    // Positioning تحت الزر
    const rect = anchorBtn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top      = (rect.bottom + 4) + 'px';
    dropdown.style.left     = rect.left + 'px';
    dropdown.style.zIndex   = '9999';
    document.body.appendChild(dropdown);

    // Click on item → add label
    dropdown.querySelectorAll('.iv4-label-dropdown-item').forEach(item => {
      item.onclick = () => {
        const labelId = Number(item.dataset.labelId);
        dropdown.remove();
        _addConvLabel(labelId);
      };
    });

    // زر AI Suggest
    const aiBtn = dropdown.querySelector('[data-action="ai-suggest-labels"]');
    if (aiBtn) {
      aiBtn.onclick = (e) => {
        e.stopPropagation();
        _aiSuggestLabels(dropdown);
      };
    }

    // إغلاق عند النقر خارجه
    setTimeout(() => {
      document.addEventListener('click', _closeDropdownOnOutsideClick, { once: true });
    }, 10);
  }

  function _closeDropdownOnOutsideClick(e) {
    const dropdown = document.querySelector('.iv4-label-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      dropdown.remove();
    }
  }

  /**
   * P7-3: يطلب من الـ AI اقتراح labels مناسبة ويعرضها للمستخدم
   * @param {HTMLElement} dropdown - عنصر الـ dropdown المفتوح
   */
  async function _aiSuggestLabels(dropdown) {
    if (!_currentConvId) return;

    // عرض حالة التحميل
    const aiBtn = dropdown.querySelector('[data-action="ai-suggest-labels"]');
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.textContent = '⏳ جاري التحليل...';
    }

    const { data, error } = await InboxAPI.ai.suggestLabels(_currentConvId);

    if (aiBtn) {
      aiBtn.disabled = false;
      aiBtn.textContent = '✨ اقتراح تلقائي';
    }

    if (error) {
      _showAISuggestError(dropdown, error);
      return;
    }

    const suggestions = data?.suggestions || [];

    if (!suggestions.length) {
      _showAISuggestError(dropdown, 'لا توجد labels مناسبة أو المحادثة قصيرة جداً');
      return;
    }

    // عرض الاقتراحات في الـ dropdown
    _renderAISuggestions(dropdown, suggestions);
  }

  /**
   * رسم قائمة اقتراحات الـ AI في الـ dropdown
   */
  function _renderAISuggestions(dropdown, suggestions) {
    // إزالة أي اقتراحات قديمة
    dropdown.querySelector('.iv4-ai-suggestions-wrap')?.remove();

    // بناء section الاقتراحات
    const wrap = document.createElement('div');
    wrap.className = 'iv4-ai-suggestions-wrap';
    wrap.innerHTML = `
      <div class="iv4-ai-suggestions-header">✨ اقتراحات الذكاء الاصطناعي</div>
      ${suggestions.map(s => `
        <button
          class="iv4-label-dropdown-item iv4-ai-suggestion-item"
          data-label-id="${s.id}"
          title="${_esc(s.reason)}"
        >
          <span class="iv4-label-dot" style="background:${_esc(
            _labels.find(l => l.id === s.id)?.color || '#888'
          )}"></span>
          <span class="iv4-ai-suggestion-name">${_esc(s.name)}</span>
          <span class="iv4-ai-suggestion-reason">${_esc(s.reason)}</span>
          <span class="iv4-ai-badge">AI</span>
        </button>
      `).join('')}
      <button class="iv4-btn iv4-btn--ai iv4-btn--sm iv4-ai-apply-all-btn" data-action="ai-apply-all">
        ✅ إضافة الكل
      </button>
    `;

    // الإدراج فوق footer
    const footer = dropdown.querySelector('.iv4-label-dropdown-footer');
    if (footer) {
      dropdown.insertBefore(wrap, footer);
    } else {
      dropdown.appendChild(wrap);
    }

    // حدث النقر على اقتراح فردي
    wrap.querySelectorAll('.iv4-ai-suggestion-item').forEach(item => {
      item.onclick = () => {
        const labelId = Number(item.dataset.labelId);
        dropdown.remove();
        _addConvLabel(labelId);
      };
    });

    // حدث "إضافة الكل"
    const applyAllBtn = wrap.querySelector('[data-action="ai-apply-all"]');
    if (applyAllBtn) {
      applyAllBtn.onclick = async () => {
        dropdown.remove();
        // إضافة labels واحداً تلو الآخر (لتجنب race conditions)
        for (const s of suggestions) {
          // لا تضيف لو موجود بالفعل
          if (!_currentConvLabels.some(l => l.id === s.id)) {
            await _addConvLabel(s.id);
          }
        }
      };
    }
  }

  /**
   * عرض رسالة خطأ مؤقتة في الـ dropdown
   */
  function _showAISuggestError(dropdown, msg) {
    dropdown.querySelector('.iv4-ai-error-msg')?.remove();
    const el = document.createElement('div');
    el.className = 'iv4-ai-error-msg';
    el.textContent = msg;
    const footer = dropdown.querySelector('.iv4-label-dropdown-footer');
    if (footer) dropdown.insertBefore(el, footer);
    else dropdown.appendChild(el);
    // اختفاء تلقائي بعد 4 ثوانٍ
    setTimeout(() => el.remove(), 4000);
  }

  async function _addConvLabel(labelId) {
    if (!_currentConvId) return;

    const { data, error } = await InboxAPI.labels.addToConv(_currentConvId, labelId);
    if (error) { console.error('[labels] add error:', error); return; }

    // تحديث محلي فوري
    _currentConvLabels = data.labels || _currentConvLabels;
    _renderLabelPicker();

    // تحديث conv في الـ Store
    InboxStore.emit('conv:labels_changed', {
      convId: _currentConvId,
      labels: _currentConvLabels,
    });
  }

  async function _removeConvLabel(labelId) {
    if (!_currentConvId) return;

    const { data, error } = await InboxAPI.labels.removeFromConv(_currentConvId, labelId);
    if (error) { console.error('[labels] remove error:', error); return; }

    _currentConvLabels = data.labels || _currentConvLabels;
    _renderLabelPicker();

    InboxStore.emit('conv:labels_changed', {
      convId: _currentConvId,
      labels: _currentConvLabels,
    });
  }

  // ─── SSE Listener ─────────────────────────────────────────────────────────

  function _registerSSE() {
    // تحديث labels list عند إنشاء/تعديل/حذف
    InboxStore.on('sse:labels_update', ({ action, label }) => {
      if (action === 'created') {
        if (!_labels.some(l => l.id === label.id)) {
          _labels.push({ ...label, conv_count: 0 });
          _labels.sort((a, b) => a.name.localeCompare(b.name));
        }
      } else if (action === 'updated') {
        const idx = _labels.findIndex(l => l.id === label.id);
        if (idx !== -1) Object.assign(_labels[idx], label);
      } else if (action === 'deleted') {
        _labels = _labels.filter(l => l.id !== label.id);
      }

      InboxStore.set('labels', _labels);
      _renderSidebarLabels();

      // تحديث manager modal لو مفتوح
      if ($('iv4-label-manager')) _refreshManagerList();
    });

    // تحديث labels المحادثة الحالية
    InboxStore.on('sse:conv_update', update => {
      if (!update || !update.labels) return;
      if (update.id !== _currentConvId) return;
      _currentConvLabels = update.labels;
      _renderLabelPicker();
    });
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  function _colorPresets() {
    return [
      '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB',
      '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
      '#7CB342', '#F9A825', '#FB8C00', '#E64A19', '#6D4C41',
      '#546E7A', '#1B5E30', '#B71C1C', '#F57F17', '#212121',
    ];
  }

  function _showFormError(msg) {
    const el = $('iv4-label-form-error');
    if (el) { el.textContent = msg; el.style.display = ''; }
  }

  function _hideFormError() {
    const el = $('iv4-label-form-error');
    if (el) el.style.display = 'none';
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init,
    openConversation,
    openLabelManager,
    getLabels: () => _labels,
    getCurrentConvLabels: () => _currentConvLabels,
  };

})();
