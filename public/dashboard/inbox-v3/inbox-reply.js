/**
 * inbox-reply.js — Areej Pro Inbox v3
 * Reply box: كتابة، إرسال، ميديا، ردود جاهزة، AI
 * آخر تحديث: 2026-05-02
 */

// ── إرسال الرسالة الرئيسي ───────────────────────────────────

async function iv3Send() {
  if (!IV3.activeConvId) return;

  const textarea = document.getElementById('iv3-textarea');
  const text = textarea?.value?.trim() || '';

  // إرسال ميديا لو موجودة
  if (IV3.pendingMedia) {
    await iv3SendPendingMedia();
    return;
  }

  if (!text) return;

  // إخفاء الـ text فوراً (optimistic)
  if (textarea) textarea.value = '';
  iv3ResizeTextarea(textarea);

  // إغلاق أي dropdowns مفتوحة
  iv3CloseDropdowns();

  // إضافة الرسالة مؤقتاً للـ UI (حقول متوافقة مع inbox_messages schema)
  const tmpMsg = {
    id: 'tmp_' + Date.now(),
    direction: 'out',
    content: text,      // الحقل الحقيقي في inbox_messages
    message: text,      // fallback
    is_note: IV3.replyMode === 'note',
    mode: IV3.replyMode,
    sent_at: new Date().toISOString(),    // الحقل الحقيقي
    created_at: new Date().toISOString(), // fallback
    status: 'pending',
  };
  IV3.messages.push(tmpMsg);
  iv3RenderMessages();

  try {
    const result = await IV3_API.sendMessage(IV3.activeConvId, text, IV3.replyMode);

    // استبدل الرسالة المؤقتة بالحقيقية
    const idx = IV3.messages.findIndex(m => m.id === tmpMsg.id);
    if (idx !== -1) IV3.messages[idx] = { ...tmpMsg, ...result, status: 'sent' };
    iv3RenderMessages();

    // تحديث preview في القائمة
    iv3UpdateConvInList({
      id: IV3.activeConvId,
      last_message: text,
      last_message_at: new Date().toISOString(),
    });

  } catch (e) {
    // علّم الرسالة كـ failed
    const idx = IV3.messages.findIndex(m => m.id === tmpMsg.id);
    if (idx !== -1) IV3.messages[idx].status = 'failed';
    iv3RenderMessages();
    iv3Toast('فشل الإرسال: ' + e.message, 'error');
  }
}

// ── إرسال ميديا ─────────────────────────────────────────────

async function iv3SendPendingMedia() {
  if (!IV3.pendingMedia || !IV3.activeConvId) return;

  const btn = document.getElementById('iv3-send-btn');
  if (btn) btn.disabled = true;

  try {
    await IV3_API.sendMedia(IV3.activeConvId, IV3.pendingMedia.file);
    iv3CancelMedia();
    await iv3LoadMessages(IV3.activeConvId);
    iv3Toast('تم إرسال الملف', 'success');
  } catch (e) {
    iv3Toast('فشل إرسال الملف: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Reply mode (رد / ملاحظة داخلية) ────────────────────────

function iv3SetReplyMode(mode) {
  IV3.replyMode = mode;
  const replyEl = document.getElementById('iv3-reply');
  const tabReply = document.getElementById('iv3-tab-reply');
  const tabNote  = document.getElementById('iv3-tab-note');
  const textarea = document.getElementById('iv3-textarea');

  document.querySelectorAll('.iv3-reply-tab').forEach(t => t.classList.remove('active'));

  if (mode === 'note') {
    replyEl?.classList.add('note-mode');
    tabNote?.classList.add('active');
    if (textarea) textarea.placeholder = 'اكتب ملاحظة داخلية... (لن تُرسل للعميل)';
  } else {
    replyEl?.classList.remove('note-mode');
    tabReply?.classList.add('active');
    if (textarea) textarea.placeholder = 'اكتب ردك... (/ للردود الجاهزة)';
  }
}

// ── Keyboard Handlers ───────────────────────────────────────

function iv3TextareaKeydown(e) {
  // Enter = إرسال، Shift+Enter = سطر جديد
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    iv3Send();
    return;
  }

  // / = فتح الـ templates
  if (e.key === '/' && !document.getElementById('iv3-textarea').value) {
    setTimeout(() => iv3ShowTemplatesDropdown(), 10);
  }

  // Escape = إغلاق dropdowns
  if (e.key === 'Escape') iv3CloseDropdowns();
}

function iv3TextareaInput(el) {
  iv3ResizeTextarea(el);

  // slash command
  const val = el.value;
  if (val.startsWith('/') && val.length > 1) {
    iv3FilterTemplates(val.slice(1));
  } else if (!val.startsWith('/')) {
    iv3CloseTemplatesDropdown();
  }
}

function iv3ResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ── Templates (ردود جاهزة) ──────────────────────────────────

async function iv3ToggleTemplates() {
  if (IV3.tmplDropdownOpen) {
    iv3CloseTemplatesDropdown();
  } else {
    await iv3ShowTemplatesDropdown();
  }
}

async function iv3ShowTemplatesDropdown() {
  const dropdown = document.getElementById('iv3-tmpl-dropdown');
  if (!dropdown) return;

  dropdown.style.display = 'block';
  IV3.tmplDropdownOpen = true;

  // تحميل لو مش موجودة
  if (!IV3.templates.length) {
    try {
      const data = await IV3_API.getTemplates();
      IV3.templates = Array.isArray(data) ? data : (data.templates || []);
    } catch (e) {
      IV3.templates = [];
    }
  }

  iv3RenderTemplates(IV3.templates);
}

function iv3FilterTemplates(query) {
  const q = query.toLowerCase();
  const filtered = IV3.templates.filter(t =>
    (t.name || t.title || '').toLowerCase().includes(q) ||
    (t.content || '').toLowerCase().includes(q)
  );

  const dropdown = document.getElementById('iv3-tmpl-dropdown');
  if (dropdown) dropdown.style.display = 'block';
  IV3.tmplDropdownOpen = true;

  iv3RenderTemplates(filtered);
}

function iv3RenderTemplates(templates) {
  const list = document.getElementById('iv3-tmpl-list');
  if (!list) return;

  if (!templates.length) {
    list.innerHTML = `<div class="iv3-dropdown-empty">لا توجد ردود جاهزة</div>`;
    return;
  }

  list.innerHTML = templates.map(t => `
    <div class="iv3-dropdown-item" onclick="iv3UseTemplate(${t.id})">
      <div class="iv3-tmpl-title">${iv3EscHtml(t.name || t.title || 'بدون عنوان')}</div>
      <div class="iv3-tmpl-preview">${iv3EscHtml(iv3TruncText(t.content || '', 60))}</div>
    </div>`).join('');
}

function iv3UseTemplate(id) {
  const tmpl = IV3.templates.find(t => t.id === id);
  if (!tmpl) return;

  const textarea = document.getElementById('iv3-textarea');
  if (textarea) {
    textarea.value = tmpl.content || '';
    iv3ResizeTextarea(textarea);
    textarea.focus();
  }

  iv3CloseTemplatesDropdown();
}

function iv3CloseTemplatesDropdown() {
  const dropdown = document.getElementById('iv3-tmpl-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  IV3.tmplDropdownOpen = false;
}

// ── AI Suggestions ──────────────────────────────────────────

async function iv3GetAISuggestions() {
  if (!IV3.activeConvId) return;

  if (IV3.aiDropdownOpen) {
    iv3CloseAIDropdown();
    return;
  }

  const dropdown = document.getElementById('iv3-ai-dropdown');
  const list = document.getElementById('iv3-ai-list');
  if (!dropdown || !list) return;

  dropdown.style.display = 'block';
  IV3.aiDropdownOpen = true;
  list.innerHTML = `<div class="iv3-dropdown-loading"><div class="iv3-spinner-sm"></div> جاري التحليل...</div>`;

  try {
    const data = await IV3_API.getAISuggestions(IV3.activeConvId);
    const suggestions = data.suggestions || [];

    if (!suggestions.length) {
      list.innerHTML = `<div class="iv3-dropdown-empty">لا توجد اقتراحات</div>`;
      return;
    }

    list.innerHTML = suggestions.map((s, i) => `
      <div class="iv3-dropdown-item ai-item" onclick="iv3UseAISuggestion(${i})">
        <div class="iv3-ai-text">${iv3EscHtml(s)}</div>
      </div>`).join('');

    // store suggestions
    IV3._aiSuggestions = suggestions;

  } catch (e) {
    list.innerHTML = `<div class="iv3-dropdown-empty" style="color:#EF4444">⚠️ ${iv3EscHtml(e.message)}</div>`;
  }
}

function iv3UseAISuggestion(idx) {
  const text = (IV3._aiSuggestions || [])[idx];
  if (!text) return;

  const textarea = document.getElementById('iv3-textarea');
  if (textarea) {
    textarea.value = text;
    iv3ResizeTextarea(textarea);
    textarea.focus();
  }

  iv3CloseAIDropdown();
}

function iv3CloseAIDropdown() {
  const dropdown = document.getElementById('iv3-ai-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  IV3.aiDropdownOpen = false;
}

// ── ملف مرفق ────────────────────────────────────────────────

function iv3FileSelected(input) {
  const file = input.files?.[0];
  if (!file) return;

  const maxSize = 20 * 1024 * 1024; // 20 MB
  if (file.size > maxSize) {
    iv3Toast('حجم الملف أكبر من 20 MB', 'error');
    input.value = '';
    return;
  }

  IV3.pendingMedia = {
    file,
    name: file.name,
    size: iv3FormatFileSize(file.size),
    type: file.type,
    url: URL.createObjectURL(file),
  };

  iv3ShowMediaPreview();
}

function iv3ShowMediaPreview() {
  const preview = document.getElementById('iv3-media-preview');
  const img     = document.getElementById('iv3-media-img');
  const icon    = document.getElementById('iv3-media-icon');
  const name    = document.getElementById('iv3-media-name');
  const size    = document.getElementById('iv3-media-size');

  if (!preview || !IV3.pendingMedia) return;

  preview.style.display = 'flex';

  if (IV3.pendingMedia.type.startsWith('image/')) {
    if (img) { img.src = IV3.pendingMedia.url; img.style.display = 'block'; }
    if (icon) icon.style.display = 'none';
  } else {
    if (img) img.style.display = 'none';
    if (icon) icon.textContent = iv3FileIcon(IV3.pendingMedia.type);
  }

  if (name) name.textContent = IV3.pendingMedia.name;
  if (size) size.textContent = IV3.pendingMedia.size;
}

function iv3CancelMedia() {
  IV3.pendingMedia = null;
  const preview = document.getElementById('iv3-media-preview');
  if (preview) preview.style.display = 'none';
  const input = document.getElementById('iv3-file-input');
  if (input) input.value = '';
}

// ── Slash Command Dropdown في الـ Textarea ───────────────────

function iv3HandleSlashDropdown(el) {
  const dropdown = document.getElementById('iv3-slash-dropdown');
  if (!dropdown) return;

  const val = el.value;
  if (val === '/' || (val.startsWith('/') && val.length > 1)) {
    const q = val.slice(1);
    const filtered = IV3.templates.filter(t =>
      !q || (t.title || '').toLowerCase().includes(q.toLowerCase())
    );

    if (filtered.length) {
      dropdown.style.display = 'block';
      dropdown.innerHTML = filtered.slice(0, 5).map(t => `
        <div class="iv3-slash-item" onclick="iv3UseTemplate(${t.id})">
          <strong>/${iv3EscHtml(t.name || t.title || '')}</strong>
          <span>${iv3EscHtml(iv3TruncText(t.content || '', 40))}</span>
        </div>`).join('');
    } else {
      dropdown.style.display = 'none';
    }
  } else {
    dropdown.style.display = 'none';
  }
}

// ── Helpers ─────────────────────────────────────────────────

function iv3CloseDropdowns() {
  iv3CloseTemplatesDropdown();
  iv3CloseAIDropdown();
  const slash = document.getElementById('iv3-slash-dropdown');
  if (slash) slash.style.display = 'none';
}

function iv3FormatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function iv3FileIcon(mimeType) {
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf'))      return '📄';
  if (mimeType.includes('word'))     return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  return '📎';
}

// ── Voice Recording (قيد التطوير) ───────────────────────────

function iv3ToggleVoice() {
  iv3Toast('الرسائل الصوتية قيد التطوير', 'info');
}

// ── Char Count ───────────────────────────────────────────────

function iv3UpdateCharCount(el) {
  const count = document.getElementById('iv3-char-count');
  if (count) count.textContent = el.value.length;
}
