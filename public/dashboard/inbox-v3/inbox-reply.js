/**
 * inbox-reply.js — Areej Pro Inbox v3
 * Reply box: كتابة، إرسال، ميديا، ردود جاهزة، AI، Quote/Reply
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

  // حفظ الاقتباس قبل الإرسال (وتصفيره بعد الإرسال)
  const quoted = IV3.quotedMsg ? { ...IV3.quotedMsg } : null;

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
    // بيانات الاقتباس للـ optimistic UI
    ...(quoted ? {
      quoted_content: quoted.content,
      quoted_sender: quoted.sender_name,
      quoted_direction: quoted.direction,
    } : {}),
  };
  IV3.messages.push(tmpMsg);
  iv3RenderMessages();

  // تصفير الاقتباس فوراً
  if (typeof iv3ClearQuote === 'function') iv3ClearQuote();

  // تصفير حالة الكتابة
  if (typeof iv3ClearTypingBeacon === 'function') iv3ClearTypingBeacon();

  try {
    const result = await IV3_API.sendMessage(IV3.activeConvId, text, IV3.replyMode, quoted);

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

  // Collision Detection — أرسل beacon كل 3 ثواني عند الكتابة
  iv3SendTypingBeacon(!!val.trim());
}

// ── Typing Beacon ─────────────────────────────────────────
let _iv3TypingTimer  = null;
let _iv3IsTyping     = false;

function iv3SendTypingBeacon(isTyping) {
  if (!IV3.activeConvId) return;
  // لو تغيّرت الحالة أو انتهى 3 ثواني من آخر beacon
  if (isTyping === _iv3IsTyping && _iv3TypingTimer) return;

  clearTimeout(_iv3TypingTimer);
  _iv3IsTyping = isTyping;

  IV3_API.setTypingState(IV3.activeConvId, isTyping);

  if (isTyping) {
    // تجديد beacon كل 3 ثواني لو مازال يكتب
    _iv3TypingTimer = setTimeout(() => {
      _iv3IsTyping = false;
      _iv3TypingTimer = null;
      IV3_API.setTypingState(IV3.activeConvId, false);
    }, 3000);
  } else {
    _iv3TypingTimer = null;
  }
}

function iv3ClearTypingBeacon() {
  clearTimeout(_iv3TypingTimer);
  _iv3TypingTimer = null;
  if (_iv3IsTyping && IV3.activeConvId) {
    _iv3IsTyping = false;
    IV3_API.setTypingState(IV3.activeConvId, false);
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
  iv3CloseCatalog();
  const slash = document.getElementById('iv3-slash-dropdown');
  if (slash) slash.style.display = 'none';
}

// ──────────────────────────────────────────────────────────────────────
// CATALOG — عرض سريع للمنتجات من المخزون
// ──────────────────────────────────────────────────────────────────────

let _iv3CatalogTimer = null;
let _iv3CatalogCache = null; // cache أول تحميل

async function iv3ToggleCatalog() {
  const dropdown = document.getElementById('iv3-catalog-dropdown');
  if (!dropdown) return;
  const isOpen = dropdown.style.display !== 'none';
  iv3CloseDropdowns();
  if (isOpen) return;

  dropdown.style.display = 'block';
  const searchEl = document.getElementById('iv3-catalog-search');
  if (searchEl) { searchEl.value = ''; searchEl.focus(); }
  await iv3LoadCatalog('');
}

function iv3CloseCatalog() {
  const dropdown = document.getElementById('iv3-catalog-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

async function iv3LoadCatalog(query) {
  const listEl = document.getElementById('iv3-catalog-list');
  if (!listEl) return;

  // لو بلا search وعندنا cache — استخدمه
  if (!query && _iv3CatalogCache) {
    iv3RenderCatalog(_iv3CatalogCache);
    return;
  }

  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">⏳ جاري التحميل...</div>';

  try {
    const url = query
      ? `/api/system/products?search=${encodeURIComponent(query)}&limit=20`
      : '/api/system/products?limit=20';
    const res = await apiFetch(url);
    const products = res?.data || [];
    if (!query) _iv3CatalogCache = products; // cache
    iv3RenderCatalog(products);
  } catch (e) {
    listEl.innerHTML = `<div style="padding:16px;text-align:center;color:#ef4444;font-size:12px">❌ خطأ: ${e.message}</div>`;
  }
}

function iv3RenderCatalog(products) {
  const listEl = document.getElementById('iv3-catalog-list');
  if (!listEl) return;

  if (!products.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">📦 لا توجد منتجات</div>';
    return;
  }

  listEl.innerHTML = products.map(p => {
    const price    = p.sell_price ? Number(p.sell_price).toLocaleString('ar-EG') + ' ج.م' : '—';
    const stock    = p.stock_qty  != null ? p.stock_qty : '?';
    const lowStock = p.is_low_stock;
    return `
      <div class="iv3-catalog-item" onclick="iv3InsertProduct(${JSON.stringify(p.name).replace(/'/g, '&#39;')}, '${p.sell_price || 0}')">
        <div class="iv3-catalog-item-name">${p.name}</div>
        <div class="iv3-catalog-item-meta">
          <span class="iv3-catalog-price">${price}</span>
          <span class="iv3-catalog-stock ${lowStock ? 'low' : ''}">
            ${lowStock ? '⚠️' : '📦'} ${stock} قطعة
          </span>
        </div>
      </div>`;
  }).join('');
}

function iv3InsertProduct(name, price) {
  const textarea = document.getElementById('iv3-textarea');
  if (!textarea) return;

  const priceNum = parseFloat(price);
  const priceStr = priceNum > 0 ? ` — السعر: ${priceNum.toLocaleString('ar-EG')} ج.م` : '';
  const text     = `📦 ${name}${priceStr}`;

  // أدرج بعد الكرسور أو في آخر النص
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const val   = textarea.value;
  const sep   = val && !val.endsWith('\n') ? '\n' : '';
  textarea.value = val.slice(0, start) + sep + text + val.slice(end);
  textarea.focus();
  iv3ResizeTextarea(textarea);
  iv3CloseCatalog();

  // إشعال toast بسيط
  if (typeof iv3Toast === 'function') iv3Toast('تم إدراج المنتج', 'success');
}

function iv3CatalogSearch(val) {
  clearTimeout(_iv3CatalogTimer);
  _iv3CatalogTimer = setTimeout(() => iv3LoadCatalog(val.trim()), 300); // debounce 300ms
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

// ── Voice Recording ────────────────────────────────────────

// State
let _iv3MediaRecorder = null;
let _iv3AudioChunks   = [];
let _iv3RecordTimer   = null;
let _iv3RecordSec     = 0;

async function iv3ToggleVoice() {
  if (_iv3MediaRecorder && _iv3MediaRecorder.state === 'recording') {
    _iv3MediaRecorder.stop();
    return;
  }

  if (!IV3.activeConvId) {
    iv3Toast('افتح محادثة أولاً', 'warning');
    return;
  }

  // إيقاف أي تسجيل قديم لم يُغلق نظيفاً
  if (_iv3MediaRecorder && _iv3MediaRecorder.stream) {
    _iv3MediaRecorder.stream.getTracks().forEach(t => t.stop());
    _iv3MediaRecorder = null;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    iv3Toast('فشل الوصول للميكروفون: ' + e.message, 'error');
    return;
  }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm';

  _iv3AudioChunks = [];
  _iv3MediaRecorder = new MediaRecorder(stream, { mimeType });
  _iv3MediaRecorder.stream = stream;  // نحتفظ بالـ stream لإغلاقه لاحقاً

  _iv3MediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) _iv3AudioChunks.push(e.data);
  };

  _iv3MediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    iv3StopVoiceUI();
    const blob = new Blob(_iv3AudioChunks, { type: mimeType });
    if (blob.size < 1000) { iv3Toast('التسجيل قصير جداً', 'warning'); return; }
    await iv3UploadAndSendVoice(blob, mimeType);
  };

  _iv3MediaRecorder.start(200);
  iv3StartVoiceUI();
}

function iv3StartVoiceUI() {
  const btn = document.getElementById('iv3-mic-btn');
  if (btn) {
    btn.classList.add('recording');
    btn.title = 'إيقاف التسجيل';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#EF4444"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  }
  _iv3RecordSec = 0;
  _iv3RecordTimer = setInterval(() => {
    _iv3RecordSec++;
    const m = String(Math.floor(_iv3RecordSec / 60)).padStart(2, '0');
    const s = String(_iv3RecordSec % 60).padStart(2, '0');
    const count = document.getElementById('iv3-char-count');
    if (count) count.textContent = `🔴 ${m}:${s}`;
    if (_iv3RecordSec >= 60) {
      iv3Toast('وصلت للحد الأقصى (60 ثانية)', 'warning');
      if (_iv3MediaRecorder?.state === 'recording') _iv3MediaRecorder.stop();
    }
  }, 1000);
}

function iv3StopVoiceUI() {
  clearInterval(_iv3RecordTimer);
  _iv3RecordTimer = null;
  const btn = document.getElementById('iv3-mic-btn');
  if (btn) {
    btn.classList.remove('recording');
    btn.title = 'رسالة صوتية';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  }
  const count = document.getElementById('iv3-char-count');
  if (count) count.textContent = '0';
}

async function iv3UploadAndSendVoice(blob, mimeType) {
  const btn = document.getElementById('iv3-send-btn');
  if (btn) btn.disabled = true;
  iv3Toast('جاري رفع الرسالة الصوتية...', 'info');

  try {
    const ext  = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
    await IV3_API.sendMedia(IV3.activeConvId, file);
    await iv3LoadMessages(IV3.activeConvId);
    iv3Toast('تم إرسال الرسالة الصوتية ✓', 'success');
  } catch(e) {
    iv3Toast('فشل إرسال الصوت: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Char Count ───────────────────────────────────────────────

function iv3UpdateCharCount(el) {
  const count = document.getElementById('iv3-char-count');
  if (count) count.textContent = el.value.length;
}
