/**
 * chatbot.js — Chatbot Flows Visual Builder لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P4-2 Chatbot Flows)
 *
 * يوفر:
 *   - قائمة الـ flows مع toggle تفعيل/تعطيل
 *   - Flow Editor: إضافة/تعديل/حذف steps بطريقة tree بصرية
 *   - أنواع Steps: message / question / input / condition / action / delay
 *   - معاينة flow كشجرة
 *   - اختبار (simulate) قبل الحفظ
 *
 * API: InboxAPI.chatbot.*
 * يُهيّأ من app.js: InboxChatbot.init()
 */

/* global InboxAPI, InboxStore */

const InboxChatbot = (() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _flows      = [];
  let _editFlow   = null;   // flow قيد التعديل
  let _steps      = [];     // steps قيد التعديل (temp state)
  let _tempIdSeq  = 1;

  // ── Step Types Meta ────────────────────────────────────────────────────────
  const STEP_META = {
    message  : { icon: '💬', label: 'رسالة نصية',    color: '#3b82f6' },
    question : { icon: '❓', label: 'سؤال بخيارات',  color: '#8b5cf6' },
    input    : { icon: '✏️', label: 'إدخال حر',       color: '#06b6d4' },
    condition: { icon: '🔀', label: 'شرط تفريع',     color: '#f59e0b' },
    action   : { icon: '⚡', label: 'إجراء تلقائي',  color: '#10b981' },
    delay    : { icon: '⏱', label: 'انتظار',         color: '#6b7280' },
  };

  const ACTION_TYPES = [
    { value: 'close_conv',   label: '🔒 إغلاق المحادثة' },
    { value: 'assign_agent', label: '👤 تعيين موظف' },
    { value: 'set_priority', label: '🔴 تعيين أولوية' },
    { value: 'end_flow',     label: '🛑 إنهاء الـ Flow' },
  ];

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _bindSettingsButton();
  }

  // ── ربط زر "الـ Chatbot" في الـ settings/sidebar ──────────────────────────
  function _bindSettingsButton() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="open-chatbot"]')) {
        open();
      }
    });
  }

  // ── فتح الـ Chatbot Manager ────────────────────────────────────────────────
  async function open() {
    _removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-chatbot-overlay';
    overlay.innerHTML = `
      <div class="iv4-cb-panel">
        <div class="iv4-cb-header">
          <h2>🤖 Chatbot Flows</h2>
          <div class="iv4-cb-header-actions">
            <button class="iv4-cb-btn iv4-cb-btn--primary" id="iv4-cb-new-flow">+ Flow جديد</button>
            <button class="iv4-cb-close" id="iv4-cb-close">✕</button>
          </div>
        </div>
        <div class="iv4-cb-body" id="iv4-cb-body">
          <div class="iv4-cb-loading">جاري التحميل…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#iv4-cb-close').onclick = _removeOverlay;
    overlay.querySelector('#iv4-cb-new-flow').onclick = () => _openFlowEditor(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) _removeOverlay(); });

    await _loadFlows();
  }

  // ── جلب وعرض الـ flows ────────────────────────────────────────────────────
  async function _loadFlows() {
    const body = document.getElementById('iv4-cb-body');
    if (!body) return;
    try {
      const data = await InboxAPI.chatbot.list();
      _flows = data.flows || [];
      _renderFlowList(body);
    } catch (err) {
      body.innerHTML = `<div class="iv4-cb-error">خطأ: ${err.message}</div>`;
    }
  }

  function _renderFlowList(container) {
    if (!_flows.length) {
      container.innerHTML = `
        <div class="iv4-cb-empty">
          <div style="font-size:3rem">🤖</div>
          <p>لا يوجد Flows بعد</p>
          <p style="opacity:.6;font-size:.85rem">أنشئ Flow أول لتأتمت الردود</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="iv4-cb-flow-list">
        ${_flows.map(f => _renderFlowCard(f)).join('')}
      </div>`;

    container.querySelectorAll('.iv4-cb-flow-card').forEach(card => {
      const id = parseInt(card.dataset.id);
      card.querySelector('.iv4-cb-edit-btn').onclick  = () => _openFlowEditor(id);
      card.querySelector('.iv4-cb-del-btn').onclick   = () => _deleteFlow(id);
      card.querySelector('.iv4-cb-toggle').onchange   = e => _toggleFlow(id, e.target.checked);
    });
  }

  function _renderFlowCard(f) {
    const triggerLabels = { keyword: '🔑 كلمة مفتاحية', always: '🌐 دائماً', outside_hours: '🌙 خارج ساعات' };
    const keywords = Array.isArray(f.trigger_data) ? f.trigger_data.slice(0, 3).join('، ') : '';
    return `
      <div class="iv4-cb-flow-card" data-id="${f.id}">
        <div class="iv4-cb-flow-card-top">
          <div class="iv4-cb-flow-info">
            <div class="iv4-cb-flow-name">${_esc(f.name)}</div>
            <div class="iv4-cb-flow-meta">
              <span class="iv4-cb-trigger-badge">${triggerLabels[f.trigger_type] || f.trigger_type}</span>
              ${keywords ? `<span class="iv4-cb-keywords">${_esc(keywords)}</span>` : ''}
              <span class="iv4-cb-steps-count">${f.step_count || 0} خطوة</span>
            </div>
            ${f.description ? `<div class="iv4-cb-flow-desc">${_esc(f.description)}</div>` : ''}
          </div>
          <div class="iv4-cb-flow-actions">
            <label class="iv4-cb-toggle-wrap" title="${f.is_active ? 'تعطيل' : 'تفعيل'}">
              <input type="checkbox" class="iv4-cb-toggle" ${f.is_active ? 'checked' : ''}>
              <span class="iv4-cb-toggle-slider"></span>
            </label>
            <button class="iv4-cb-edit-btn" title="تعديل">✏️</button>
            <button class="iv4-cb-del-btn" title="حذف">🗑️</button>
          </div>
        </div>
      </div>`;
  }

  // ── فتح Flow Editor ────────────────────────────────────────────────────────
  async function _openFlowEditor(flowId) {
    _editFlow = null;
    _steps    = [];
    _tempIdSeq = 1;

    const overlay = document.getElementById('iv4-chatbot-overlay');
    if (!overlay) return;

    const body = overlay.querySelector('#iv4-cb-body');
    body.innerHTML = `<div class="iv4-cb-loading">جاري التحميل…</div>`;

    try {
      if (flowId) {
        const data = await InboxAPI.chatbot.get(flowId);
        _editFlow = data.flow;
        _steps    = (data.steps || []).map(s => ({ ...s, temp_id: `t${_tempIdSeq++}` }));
      } else {
        _editFlow = {
          id: null, name: '', description: '',
          trigger_type: 'keyword', trigger_data: [], platforms: [], is_active: false,
        };
      }
    } catch (err) {
      body.innerHTML = `<div class="iv4-cb-error">خطأ: ${err.message}</div>`;
      return;
    }

    _renderEditor(body);
  }

  // ── رسم Editor ────────────────────────────────────────────────────────────
  function _renderEditor(container) {
    const f = _editFlow;
    container.innerHTML = `
      <div class="iv4-cb-editor">

        <!-- Flow Meta -->
        <div class="iv4-cb-editor-meta">
          <div class="iv4-cb-back-row">
            <button class="iv4-cb-btn iv4-cb-btn--ghost" id="iv4-cb-back">← رجوع</button>
            <h3>${f.id ? `تعديل: ${_esc(f.name)}` : 'Flow جديد'}</h3>
          </div>

          <div class="iv4-cb-form-row">
            <label>اسم الـ Flow</label>
            <input id="iv4-cb-fname" class="iv4-cb-input" value="${_esc(f.name)}" placeholder="مثال: رد ترحيب">
          </div>
          <div class="iv4-cb-form-row">
            <label>وصف (اختياري)</label>
            <input id="iv4-cb-fdesc" class="iv4-cb-input" value="${_esc(f.description || '')}" placeholder="وصف مختصر">
          </div>
          <div class="iv4-cb-form-row">
            <label>نوع التشغيل</label>
            <select id="iv4-cb-ftrigger" class="iv4-cb-select">
              <option value="keyword"  ${f.trigger_type==='keyword'?'selected':''}>🔑 كلمة مفتاحية</option>
              <option value="always"   ${f.trigger_type==='always'?'selected':''}>🌐 أي محادثة جديدة</option>
            </select>
          </div>
          <div class="iv4-cb-form-row" id="iv4-cb-keyword-row" ${f.trigger_type!=='keyword'?'style="display:none"':''}>
            <label>الكلمات المفتاحية (افصل بفاصلة)</label>
            <input id="iv4-cb-fkeywords" class="iv4-cb-input"
              value="${_esc((Array.isArray(f.trigger_data)?f.trigger_data:[]).join(', '))}"
              placeholder="مرحبا, hi, ابدأ, start">
          </div>
        </div>

        <!-- Steps Builder -->
        <div class="iv4-cb-steps-section">
          <div class="iv4-cb-steps-header">
            <span>🔧 خطوات الـ Flow</span>
            <button class="iv4-cb-btn iv4-cb-btn--sm" id="iv4-cb-add-root-step">+ إضافة خطوة</button>
          </div>
          <div id="iv4-cb-steps-tree" class="iv4-cb-steps-tree">
            ${_renderStepsTree(null, 0)}
          </div>
        </div>

        <!-- Actions -->
        <div class="iv4-cb-editor-footer">
          <button class="iv4-cb-btn iv4-cb-btn--ghost" id="iv4-cb-test-btn">🧪 اختبار</button>
          <button class="iv4-cb-btn iv4-cb-btn--primary" id="iv4-cb-save-btn">💾 حفظ الـ Flow</button>
        </div>
      </div>

      <!-- Step Edit Modal -->
      <div id="iv4-cb-step-modal" class="iv4-cb-step-modal" style="display:none"></div>
    `;

    // Events
    container.querySelector('#iv4-cb-back').onclick = () => {
      _loadFlows().then(() => {
        const b = document.getElementById('iv4-cb-body');
        if (b) _renderFlowList(b);
      });
    };

    container.querySelector('#iv4-cb-ftrigger').onchange = e => {
      const row = document.getElementById('iv4-cb-keyword-row');
      if (row) row.style.display = e.target.value === 'keyword' ? '' : 'none';
    };

    container.querySelector('#iv4-cb-add-root-step').onclick = () => _openStepModal(null, null);
    container.querySelector('#iv4-cb-save-btn').onclick     = _saveFlow;
    container.querySelector('#iv4-cb-test-btn').onclick     = _testFlow;

    // Tree delegated events
    const tree = document.getElementById('iv4-cb-steps-tree');
    if (tree) {
      tree.addEventListener('click', e => {
        const btn = e.target.closest('[data-step-action]');
        if (!btn) return;
        const action = btn.dataset.stepAction;
        const tempId = btn.dataset.tempId;
        if (action === 'edit')       _openStepModal(null, tempId);
        if (action === 'delete')     _deleteStep(tempId);
        if (action === 'add-child')  _openStepModal(tempId, null);
      });
    }
  }

  // ── رسم شجرة الـ steps ────────────────────────────────────────────────────
  function _renderStepsTree(parentTempId, depth) {
    const children = _steps.filter(s =>
      parentTempId === null
        ? (!s.parent_temp_id && s.parent_id == null)
        : (s.parent_temp_id === parentTempId || s.parent_id === _getTempToRealId(parentTempId))
    );

    if (!children.length && depth === 0) {
      return `<div class="iv4-cb-tree-empty">لا توجد خطوات — اضغط "+ إضافة خطوة" للبدء</div>`;
    }

    return children.map(step => {
      const meta = STEP_META[step.step_type] || STEP_META.message;
      const hasChildren = _steps.some(s =>
        s.parent_temp_id === step.temp_id || s.parent_id === step.id
      );
      const childrenHtml = _renderStepsTree(step.temp_id, depth + 1);

      return `
        <div class="iv4-cb-tree-node" style="--depth:${depth}">
          <div class="iv4-cb-step-card" style="border-left-color:${meta.color}">
            <div class="iv4-cb-step-card-left">
              <span class="iv4-cb-step-icon" style="color:${meta.color}">${meta.icon}</span>
              <div class="iv4-cb-step-info">
                <span class="iv4-cb-step-type">${meta.label}</span>
                <span class="iv4-cb-step-preview">${_stepPreview(step)}</span>
              </div>
            </div>
            <div class="iv4-cb-step-btns">
              <button class="iv4-cb-step-btn" data-step-action="add-child" data-temp-id="${step.temp_id}" title="إضافة خطوة فرعية">+</button>
              <button class="iv4-cb-step-btn" data-step-action="edit"      data-temp-id="${step.temp_id}" title="تعديل">✏️</button>
              <button class="iv4-cb-step-btn iv4-cb-step-btn--del" data-step-action="delete" data-temp-id="${step.temp_id}" title="حذف">🗑</button>
            </div>
          </div>
          ${hasChildren ? `<div class="iv4-cb-tree-children">${childrenHtml}</div>` : ''}
        </div>`;
    }).join('');
  }

  function _stepPreview(step) {
    if (step.step_type === 'message' || step.step_type === 'question' || step.step_type === 'input') {
      const text = (step.content || '').slice(0, 60);
      return _esc(text || '(فارغ)') + (step.content?.length > 60 ? '…' : '');
    }
    if (step.step_type === 'condition') {
      const c = step.condition || {};
      return `إذا ${_esc(c.operator || '?')} "${_esc(c.value || '')}"`;
    }
    if (step.step_type === 'action') {
      const a = step.action_data || {};
      const t = ACTION_TYPES.find(x => x.value === a.type);
      return t ? t.label : _esc(a.type || 'غير محدد');
    }
    if (step.step_type === 'delay') {
      const sec = step.action_data?.delay_sec || 2;
      return `${sec} ثانية`;
    }
    return '';
  }

  // ── Step Modal (إضافة/تعديل step) ──────────────────────────────────────────
  function _openStepModal(parentTempId, editTempId) {
    const existing = editTempId ? _steps.find(s => s.temp_id === editTempId) : null;
    const modal = document.getElementById('iv4-cb-step-modal');
    if (!modal) return;

    const stepType = existing?.step_type || 'message';

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="iv4-cb-step-modal-box">
        <div class="iv4-cb-step-modal-header">
          <h4>${existing ? 'تعديل خطوة' : 'إضافة خطوة جديدة'}</h4>
          <button id="iv4-cb-step-modal-close">✕</button>
        </div>
        <div class="iv4-cb-step-modal-body">

          <div class="iv4-cb-form-row">
            <label>نوع الخطوة</label>
            <select id="iv4-cbm-type" class="iv4-cb-select">
              ${Object.entries(STEP_META).map(([v, m]) =>
                `<option value="${v}" ${stepType===v?'selected':''}>${m.icon} ${m.label}</option>`
              ).join('')}
            </select>
          </div>

          <div id="iv4-cbm-fields">
            ${_renderStepFields(stepType, existing)}
          </div>

        </div>
        <div class="iv4-cb-step-modal-footer">
          <button class="iv4-cb-btn iv4-cb-btn--ghost" id="iv4-cbm-cancel">إلغاء</button>
          <button class="iv4-cb-btn iv4-cb-btn--primary" id="iv4-cbm-save">حفظ الخطوة</button>
        </div>
      </div>`;

    modal.querySelector('#iv4-cb-step-modal-close').onclick = () => modal.style.display = 'none';
    modal.querySelector('#iv4-cbm-cancel').onclick          = () => modal.style.display = 'none';

    modal.querySelector('#iv4-cbm-type').onchange = e => {
      const fields = document.getElementById('iv4-cbm-fields');
      if (fields) fields.innerHTML = _renderStepFields(e.target.value, null);
      _bindOptionButtons(modal);
    };

    _bindOptionButtons(modal);

    modal.querySelector('#iv4-cbm-save').onclick = () => _saveStep(parentTempId, editTempId);
  }

  function _renderStepFields(type, existing) {
    const val = (key, def = '') => _esc(existing?.[key] ?? def);
    const aVal = (key, def = '') => _esc(existing?.action_data?.[key] ?? def);
    const cVal = (key, def = '') => _esc(existing?.condition?.[key] ?? def);

    if (type === 'message') {
      return `
        <div class="iv4-cb-form-row">
          <label>نص الرسالة</label>
          <textarea id="iv4-cbm-content" class="iv4-cb-textarea" rows="4" placeholder="اكتب نص الرسالة هنا…">${val('content')}</textarea>
        </div>`;
    }

    if (type === 'question') {
      const opts = existing?.options || [{ label: '' }];
      return `
        <div class="iv4-cb-form-row">
          <label>نص السؤال</label>
          <textarea id="iv4-cbm-content" class="iv4-cb-textarea" rows="3" placeholder="اكتب السؤال هنا…">${val('content')}</textarea>
        </div>
        <div class="iv4-cb-form-row">
          <label>الخيارات</label>
          <div id="iv4-cbm-options">
            ${opts.map((o, i) => `
              <div class="iv4-cb-opt-row" data-opt-idx="${i}">
                <input class="iv4-cb-input iv4-cbm-opt-input" value="${_esc(o.label || o)}" placeholder="خيار ${i+1}">
                <button class="iv4-cb-step-btn iv4-cb-step-btn--del iv4-cbm-del-opt" data-idx="${i}">✕</button>
              </div>`).join('')}
          </div>
          <button class="iv4-cb-btn iv4-cb-btn--sm" id="iv4-cbm-add-opt">+ إضافة خيار</button>
        </div>`;
    }

    if (type === 'input') {
      return `
        <div class="iv4-cb-form-row">
          <label>نص الطلب (يُرسَل للعميل)</label>
          <textarea id="iv4-cbm-content" class="iv4-cb-textarea" rows="3" placeholder="مثال: من فضلك اكتب اسمك…">${val('content')}</textarea>
        </div>`;
    }

    if (type === 'condition') {
      return `
        <div class="iv4-cb-form-row">
          <label>المشغّل</label>
          <select id="iv4-cbm-cond-op" class="iv4-cb-select">
            <option value="contains" ${cVal('operator')==='contains'?'selected':''}>يحتوي على</option>
            <option value="equals"   ${cVal('operator')==='equals'?'selected':''}>مساوي لـ</option>
            <option value="starts"   ${cVal('operator')==='starts'?'selected':''}>يبدأ بـ</option>
            <option value="regex"    ${cVal('operator')==='regex'?'selected':''}>Regex</option>
          </select>
        </div>
        <div class="iv4-cb-form-row">
          <label>القيمة</label>
          <input id="iv4-cbm-cond-val" class="iv4-cb-input" value="${cVal('value')}" placeholder="النص أو الرقم أو الـ regex">
        </div>`;
    }

    if (type === 'action') {
      const curType = aVal('type', 'close_conv');
      return `
        <div class="iv4-cb-form-row">
          <label>نوع الإجراء</label>
          <select id="iv4-cbm-action-type" class="iv4-cb-select">
            ${ACTION_TYPES.map(a => `<option value="${a.value}" ${curType===a.value?'selected':''}>${a.label}</option>`).join('')}
          </select>
        </div>
        <div class="iv4-cb-form-row" id="iv4-cbm-action-priority-row" ${curType!=='set_priority'?'style="display:none"':''}>
          <label>الأولوية</label>
          <select id="iv4-cbm-action-priority" class="iv4-cb-select">
            <option value="urgent" ${aVal('priority')==='urgent'?'selected':''}>🔴 عاجل</option>
            <option value="high"   ${aVal('priority')==='high'?'selected':''}>🟠 عالي</option>
            <option value="normal" ${aVal('priority')==='normal'?'selected':''}>🟡 عادي</option>
            <option value="low"    ${aVal('priority')==='low'?'selected':''}>🟢 منخفض</option>
          </select>
        </div>`;
    }

    if (type === 'delay') {
      return `
        <div class="iv4-cb-form-row">
          <label>وقت الانتظار (ثانية)</label>
          <input id="iv4-cbm-delay-sec" type="number" min="1" max="60" class="iv4-cb-input"
            value="${existing?.action_data?.delay_sec || 3}" placeholder="3">
        </div>`;
    }

    return '';
  }

  function _bindOptionButtons(modal) {
    const addOptBtn = modal.querySelector('#iv4-cbm-add-opt');
    if (addOptBtn) {
      addOptBtn.onclick = () => {
        const optsDiv = document.getElementById('iv4-cbm-options');
        if (!optsDiv) return;
        const idx = optsDiv.querySelectorAll('.iv4-opt-row, .iv4-cb-opt-row').length;
        const row = document.createElement('div');
        row.className = 'iv4-cb-opt-row';
        row.dataset.optIdx = idx;
        row.innerHTML = `
          <input class="iv4-cb-input iv4-cbm-opt-input" value="" placeholder="خيار ${idx+1}">
          <button class="iv4-cb-step-btn iv4-cb-step-btn--del iv4-cbm-del-opt" data-idx="${idx}">✕</button>`;
        optsDiv.appendChild(row);
      };
    }

    modal.addEventListener('click', e => {
      if (e.target.classList.contains('iv4-cbm-del-opt')) {
        e.target.closest('.iv4-cb-opt-row')?.remove();
      }
    }, { once: false });

    const actionTypeSelect = modal.querySelector('#iv4-cbm-action-type');
    if (actionTypeSelect) {
      actionTypeSelect.onchange = e => {
        const row = modal.querySelector('#iv4-cbm-action-priority-row');
        if (row) row.style.display = e.target.value === 'set_priority' ? '' : 'none';
      };
    }
  }

  // ── حفظ step في الـ _steps array ──────────────────────────────────────────
  function _saveStep(parentTempId, editTempId) {
    const modal   = document.getElementById('iv4-cb-step-modal');
    const typeEl  = document.getElementById('iv4-cbm-type');
    if (!typeEl) return;

    const type  = typeEl.value;
    const step = {
      temp_id      : editTempId || `t${_tempIdSeq++}`,
      step_type    : type,
      parent_temp_id: editTempId
        ? (_steps.find(s => s.temp_id === editTempId)?.parent_temp_id ?? null)
        : (parentTempId || null),
      parent_id    : editTempId
        ? (_steps.find(s => s.temp_id === editTempId)?.parent_id ?? null)
        : null,
      content      : '',
      options      : [],
      condition    : null,
      action_data  : null,
    };

    // جمع الحقول حسب النوع
    const contentEl = document.getElementById('iv4-cbm-content');
    if (contentEl) step.content = contentEl.value.trim();

    if (type === 'question') {
      const optInputs = document.querySelectorAll('.iv4-cbm-opt-input');
      step.options = Array.from(optInputs)
        .map(i => ({ label: i.value.trim() }))
        .filter(o => o.label);
    }

    if (type === 'condition') {
      const opEl = document.getElementById('iv4-cbm-cond-op');
      const vEl  = document.getElementById('iv4-cbm-cond-val');
      step.condition = { operator: opEl?.value || 'contains', value: vEl?.value || '' };
    }

    if (type === 'action') {
      const atEl = document.getElementById('iv4-cbm-action-type');
      const prEl = document.getElementById('iv4-cbm-action-priority');
      step.action_data = { type: atEl?.value || 'close_conv' };
      if (atEl?.value === 'set_priority' && prEl) step.action_data.priority = prEl.value;
    }

    if (type === 'delay') {
      const dEl = document.getElementById('iv4-cbm-delay-sec');
      step.action_data = { delay_sec: parseInt(dEl?.value || '3', 10) };
    }

    if (editTempId) {
      const idx = _steps.findIndex(s => s.temp_id === editTempId);
      if (idx >= 0) _steps[idx] = step;
    } else {
      _steps.push(step);
    }

    if (modal) modal.style.display = 'none';
    _refreshStepsTree();
  }

  function _deleteStep(tempId) {
    // حذف الـ step وكل أطفاله
    const toDelete = new Set();
    function collect(tid) {
      toDelete.add(tid);
      _steps.filter(s => s.parent_temp_id === tid).forEach(s => collect(s.temp_id));
    }
    collect(tempId);
    _steps = _steps.filter(s => !toDelete.has(s.temp_id));
    _refreshStepsTree();
  }

  function _refreshStepsTree() {
    const tree = document.getElementById('iv4-cb-steps-tree');
    if (tree) tree.innerHTML = _renderStepsTree(null, 0);
  }

  // ── حفظ الـ Flow ───────────────────────────────────────────────────────────
  async function _saveFlow() {
    const nameEl    = document.getElementById('iv4-cb-fname');
    const descEl    = document.getElementById('iv4-cb-fdesc');
    const triggerEl = document.getElementById('iv4-cb-ftrigger');
    const kwEl      = document.getElementById('iv4-cb-fkeywords');

    const name = nameEl?.value.trim();
    if (!name) { alert('اسم الـ Flow مطلوب'); return; }

    const triggerType = triggerEl?.value || 'keyword';
    const triggerData = triggerType === 'keyword'
      ? (kwEl?.value || '').split(',').map(k => k.trim()).filter(Boolean)
      : [];

    const btn = document.getElementById('iv4-cb-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ…'; }

    try {
      let savedFlow;
      if (_editFlow.id) {
        const res = await InboxAPI.chatbot.update(_editFlow.id, { name, description: descEl?.value||'', trigger_type: triggerType, trigger_data: triggerData });
        savedFlow = res.flow;
      } else {
        const res = await InboxAPI.chatbot.create({ name, description: descEl?.value||'', trigger_type: triggerType, trigger_data: triggerData });
        savedFlow = res.flow;
      }

      // حفظ الـ steps
      await InboxAPI.chatbot.saveSteps(savedFlow.id, _steps);

      _editFlow = savedFlow;
      _showToast('✅ تم حفظ الـ Flow بنجاح');

      await _loadFlows();
      const body = document.getElementById('iv4-cb-body');
      if (body) _renderFlowList(body);

    } catch (err) {
      alert('خطأ في الحفظ: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الـ Flow'; }
    }
  }

  // ── اختبار Flow ────────────────────────────────────────────────────────────
  async function _testFlow() {
    if (!_editFlow?.id) {
      alert('احفظ الـ Flow أولاً ثم اختبره');
      return;
    }
    const text = prompt('اكتب نص رسالة اختبار:');
    if (!text) return;

    try {
      const res  = await InboxAPI.chatbot.test(_editFlow.id, text);
      const sim  = res.simulation || [];
      const lines = sim.map(s => {
        if (s.type === 'end')         return '🏁 نهاية الـ Flow';
        if (s.type === 'await_input') return '⏳ ينتظر رد المستخدم…';
        if (s.type === 'error')       return `❌ ${s.message}`;
        if (s.type === 'warning')     return `⚠️ ${s.message}`;
        const meta = STEP_META[s.step_type] || {};
        return `${meta.icon || '•'} [${s.step_type}] ${s.content || ''}`;
      }).join('\n');
      alert('نتيجة الاختبار:\n\n' + lines);
    } catch (err) {
      alert('خطأ في الاختبار: ' + err.message);
    }
  }

  // ── Toggle / Delete Flow ───────────────────────────────────────────────────
  async function _toggleFlow(id, newState) {
    try {
      await InboxAPI.chatbot.toggle(id);
      _flows = _flows.map(f => f.id === id ? { ...f, is_active: newState } : f);
    } catch (err) {
      _showToast('❌ فشل التبديل: ' + err.message);
      // rollback
      const body = document.getElementById('iv4-cb-body');
      if (body) _renderFlowList(body);
    }
  }

  async function _deleteFlow(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الـ Flow؟')) return;
    try {
      await InboxAPI.chatbot.delete(id);
      _flows = _flows.filter(f => f.id !== id);
      const body = document.getElementById('iv4-cb-body');
      if (body) _renderFlowList(body);
      _showToast('🗑️ تم حذف الـ Flow');
    } catch (err) {
      _showToast('❌ فشل الحذف: ' + err.message);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _removeOverlay() {
    document.getElementById('iv4-chatbot-overlay')?.remove();
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _getTempToRealId(tempId) {
    return _steps.find(s => s.temp_id === tempId)?.id ?? null;
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'iv4-cb-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('iv4-cb-toast--show'), 10);
    setTimeout(() => { t.classList.remove('iv4-cb-toast--show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('iv4-chatbot-styles')) return;
    const style = document.createElement('style');
    style.id = 'iv4-chatbot-styles';
    style.textContent = `/* تضاف من inbox.css */`;
    document.head.appendChild(style);
  }

  return { init, open };
})();
