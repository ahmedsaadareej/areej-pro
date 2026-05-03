/**
 * reply.js — Reply Box لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * المسؤوليات:
 *   - إرسال رسالة نصية للمحادثة الفعالة
 *   - إرسال ملاحظة داخلية (mode = note)
 *   - رفع ميديا (صورة / فيديو / ملف) + إرسالها
 *   - أزرار formatting بسيطة (bold / italic / strikethrough / mono)
 *   - عرض preview للميديا قبل الإرسال
 *   - quoted message (الرد على رسالة محددة)
 *   - منع الإرسال المزدوج (lock أثناء الإرسال)
 *   - Ctrl+Enter أو Enter للإرسال (Shift+Enter = سطر جديد)
 */

const InboxReply = (() => {
  'use strict';

  // ─── DOM Refs ────────────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelector(sel);

  // ─── State محلي ─────────────────────────────────────────────────────────
  let _sending     = false;   // lock: يمنع الإرسال المزدوج
  let _pendingFile = null;    // { file, url (object URL), contentType }
  let _quotedMsg   = null;    // { id, content, sender } — الرسالة المقتبسة

  // ─── Helpers UI ──────────────────────────────────────────────────────────

  function _toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `iv4-toast ${type}`;
    el.textContent = msg;
    $('iv4-toasts').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /**
   * تفعيل / تعطيل زر الإرسال بناءً على المحتوى
   */
  function _updateSendBtn() {
    const btn     = $('iv4-send-btn');
    const textarea = $('iv4-reply-textarea');
    if (!btn) return;

    const hasText  = textarea && textarea.value.trim().length > 0;
    const hasMedia = !!_pendingFile;
    btn.disabled   = _sending || (!hasText && !hasMedia);
    btn.classList.toggle('active', hasText || hasMedia);
  }

  /**
   * عرض quota العدد (بالعكس لمنصة WA: 4096 حرف)
   */
  function _updateCharCount() {
    const textarea = $('iv4-reply-textarea');
    const counter  = $('iv4-char-count');
    if (!textarea || !counter) return;

    const len = textarea.value.length;
    counter.textContent = len > 0 ? len : '';
    counter.classList.toggle('warn', len > 3800);
    counter.classList.toggle('error', len > 4096);
  }

  // ─── Media Preview ───────────────────────────────────────────────────────

  /**
   * عرض preview للملف المختار
   */
  function _showMediaPreview(file) {
    const existing = $('iv4-media-preview');
    if (existing) existing.remove();

    const mime        = file.type || '';
    const isImage     = mime.startsWith('image/');
    const isVideo     = mime.startsWith('video/');
    const isAudio     = mime.startsWith('audio/');
    const objectUrl   = URL.createObjectURL(file);

    _pendingFile = {
      file,
      url:         objectUrl,
      contentType: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file',
    };

    const preview = document.createElement('div');
    preview.id    = 'iv4-media-preview';
    preview.className = 'iv4-media-preview';

    if (isImage) {
      const img = document.createElement('img');
      img.src   = objectUrl;
      img.className = 'iv4-preview-img';
      preview.appendChild(img);
    } else if (isVideo) {
      const vid = document.createElement('video');
      vid.src   = objectUrl;
      vid.controls = true;
      vid.className = 'iv4-preview-video';
      preview.appendChild(vid);
    } else {
      const icon = document.createElement('div');
      icon.className = 'iv4-preview-file';
      icon.innerHTML = `<span class="iv4-preview-file-icon">${isAudio ? '🎵' : '📄'}</span>
                        <span class="iv4-preview-file-name">${file.name}</span>
                        <span class="iv4-preview-file-size">${_formatSize(file.size)}</span>`;
      preview.appendChild(icon);
    }

    // زر إزالة
    const rmBtn = document.createElement('button');
    rmBtn.className = 'iv4-preview-remove';
    rmBtn.title     = 'إزالة الملف';
    rmBtn.textContent = '✕';
    rmBtn.addEventListener('click', _clearMedia);
    preview.appendChild(rmBtn);

    // أضف قبل الـ toolbar
    const replyBox = $('iv4-reply-box');
    const toolbar  = replyBox ? replyBox.querySelector('.iv4-reply-toolbar') : null;
    if (toolbar) {
      replyBox.insertBefore(preview, toolbar);
    }

    _updateSendBtn();
  }

  /**
   * إزالة الميديا المختارة
   */
  function _clearMedia() {
    if (_pendingFile?.url) URL.revokeObjectURL(_pendingFile.url);
    _pendingFile = null;
    const preview = $('iv4-media-preview');
    if (preview) preview.remove();
    // إعادة تعيين file input
    const fileInput = $('iv4-file-input');
    if (fileInput) fileInput.value = '';
    _updateSendBtn();
  }

  /**
   * تنسيق حجم الملف
   */
  function _formatSize(bytes) {
    if (bytes < 1024)            return `${bytes} B`;
    if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── Quoted Message ──────────────────────────────────────────────────────

  /**
   * يُستدعى من chat.js عند الضغط على "رد" على رسالة
   * @param {{ id, content, sender, direction }} msg
   */
  function quoteMessage(msg) {
    _quotedMsg = msg;

    // إزالة quote قديمة إن وُجدت
    const old = $('iv4-quoted-preview');
    if (old) old.remove();

    const div      = document.createElement('div');
    div.id         = 'iv4-quoted-preview';
    div.className  = 'iv4-quoted-preview';
    div.innerHTML  = `
      <div class="iv4-quoted-bar"></div>
      <div class="iv4-quoted-body">
        <span class="iv4-quoted-sender">${_esc(msg.agent_name || msg.contact_name || 'رسالة')}</span>
        <span class="iv4-quoted-text">${_esc(_truncate(msg.content || '[ميديا]', 80))}</span>
      </div>
      <button class="iv4-quoted-cancel" id="iv4-quoted-cancel" title="إلغاء الاقتباس">✕</button>
    `;

    $('iv4-quoted-cancel', div.id);  // workaround — نحتاج event listener
    div.querySelector('.iv4-quoted-cancel')?.addEventListener('click', _clearQuote);

    const replyBox = $('iv4-reply-box');
    const tabs     = replyBox?.querySelector('.iv4-reply-tabs');
    if (tabs && replyBox) {
      replyBox.insertBefore(div, tabs.nextSibling);
    }

    // focus على الـ textarea
    $('iv4-reply-textarea')?.focus();
  }

  /**
   * إلغاء الاقتباس
   */
  function _clearQuote() {
    _quotedMsg = null;
    const el = $('iv4-quoted-preview');
    if (el) el.remove();
  }

  // ─── Formatting Buttons ──────────────────────────────────────────────────

  /**
   * تطبيق formatting على النص المحدد في الـ textarea
   * WA format: *bold* _italic_ ~strike~ ```mono```
   */
  function _applyFormat(fmt) {
    const ta = $('iv4-reply-textarea');
    if (!ta) return;

    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = ta.value.slice(start, end);

    const map = {
      bold:   ['*', '*'],
      italic: ['_', '_'],
      strike: ['~', '~'],
      mono:   ['```', '```'],
    };

    const [open, close] = map[fmt] || ['', ''];
    if (!open) return;

    const newText = `${ta.value.slice(0, start)}${open}${sel}${close}${ta.value.slice(end)}`;
    ta.value      = newText;
    ta.focus();
    ta.setSelectionRange(start + open.length, end + open.length);
    _updateCharCount();
    _updateSendBtn();
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  /**
   * الإرسال الرئيسي
   */
  async function _send() {
    if (_sending) return;

    const convId   = InboxStore.state.activeConvId;
    if (!convId) return _toast('لا توجد محادثة مفتوحة', 'error');

    const textarea  = $('iv4-reply-textarea');
    const content   = textarea?.value?.trim() || '';
    const mode      = InboxStore.state.replyMode || 'reply';  // reply | note
    const channel   = InboxStore.state.replyChannel || null;  // override

    if (!content && !_pendingFile) return;

    _sending = true;
    _updateSendBtn();

    try {
      let result;

      if (_pendingFile) {
        // ── إرسال ميديا ──────────────────────────────────────────────
        const formData = new FormData();
        formData.append('file', _pendingFile.file);
        if (content) formData.append('caption', content);
        if (_quotedMsg?.id) formData.append('quoted_msg_id', _quotedMsg.id);
        if (channel) formData.append('channel_override', channel);

        const res = await fetch(`/api/inbox/conversations/${convId}/messages/media`, {
          method: 'POST',
          body:   formData,
          // لا Content-Type — browser يضبطه تلقائياً مع boundary
        });
        result = await res.json().catch(() => ({ error: 'فشل في قراءة الاستجابة' }));

      } else {
        // ── إرسال نص ─────────────────────────────────────────────────
        const body = {
          content,
          content_type: 'text',
          direction:    mode === 'note' ? 'note' : 'outbound',
        };
        if (_quotedMsg?.id)  body.quoted_msg_id    = _quotedMsg.id;
        if (channel)         body.channel_override = channel;

        const { data, error } = await InboxAPI.messages.send(convId, {
          content,
          contentType:     'text',
          quotedMsgId:     _quotedMsg?.id || null,
          channelOverride: channel,
          direction:       body.direction,
        });
        result = error ? { error } : data;
      }

      if (result?.error) {
        _toast(`فشل الإرسال: ${result.error}`, 'error');
        return;
      }

      // ── نجاح — مسح الـ input ─────────────────────────────────────────
      if (textarea) textarea.value = '';
      _clearMedia();
      _clearQuote();
      _updateCharCount();

      // لو الرسالة status = failed → أظهر toast تحذيري (لكن لا نفشل العملية)
      if (result?.message?.status === 'failed') {
        _toast(`تم الحفظ، لكن فشل الإرسال: ${result.message.fail_reason || ''}`, 'warning');
      }

    } finally {
      _sending = false;
      _updateSendBtn();
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    const textarea   = $('iv4-reply-textarea');
    const sendBtn    = $('iv4-send-btn');
    const attachBtn  = $('iv4-attach-btn');
    const fileInput  = $('iv4-file-input');

    if (!textarea || !sendBtn) {
      console.warn('[InboxReply] عناصر DOM غير موجودة');
      return;
    }

    // ── Textarea events ───────────────────────────────────────────────────
    textarea.addEventListener('input', () => {
      _updateCharCount();
      _updateSendBtn();
      _autoGrow(textarea);
    });

    // Ctrl+Enter أو Enter للإرسال (Shift+Enter = سطر جديد)
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Enter مباشر (بدون shift) = إرسال
        e.preventDefault();
        _send();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        _send();
      }
    });

    // ── Send Button ───────────────────────────────────────────────────────
    sendBtn.addEventListener('click', _send);

    // ── Attach Button ─────────────────────────────────────────────────────
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          return _toast('حجم الملف تجاوز 20 MB', 'error');
        }
        _showMediaPreview(file);
      });
    }

    // ── Drag & Drop على الـ reply box ─────────────────────────────────────
    const replyBox = $('iv4-reply-box');
    if (replyBox) {
      replyBox.addEventListener('dragover', e => {
        e.preventDefault();
        replyBox.classList.add('drag-over');
      });
      replyBox.addEventListener('dragleave', () => {
        replyBox.classList.remove('drag-over');
      });
      replyBox.addEventListener('drop', e => {
        e.preventDefault();
        replyBox.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          return _toast('حجم الملف تجاوز 20 MB', 'error');
        }
        _showMediaPreview(file);
      });
    }

    // ── Formatting Buttons ────────────────────────────────────────────────
    document.querySelectorAll('.iv4-fmt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _applyFormat(btn.dataset.fmt);
      });
    });

    // ── Reply Mode (استماع للتبديل بين Reply / Note) ───────────────────────
    InboxStore.on('replyMode:change', ({ value }) => {
      _clearMedia();
      _clearQuote();
      if (textarea) {
        textarea.value = '';
        textarea.placeholder = value === 'note' ? 'اكتب ملاحظة داخلية...' : 'اكتب رسالتك...';
        textarea.style.background = value === 'note' ? '#fffbeb' : '';
      }
      _updateSendBtn();
      _updateCharCount();
    });

    // ── لما يُغلق المحادثة — مسح كل شيء ──────────────────────────────────
    InboxStore.on('activeConvId:change', () => {
      if (textarea) textarea.value = '';
      _clearMedia();
      _clearQuote();
      _updateSendBtn();
      _updateCharCount();
    });

    // ── Quote Event من chat.js ────────────────────────────────────────────
    InboxStore.on('reply:quote', ({ msg }) => {
      quoteMessage(msg);
    });

    // ── char count container (أضفها للـ toolbar لو مش موجودة) ─────────────
    _ensureCharCount();

    // إبدأ بالحالة الصحيحة
    _updateSendBtn();
    _updateCharCount();

    console.log('[InboxReply] ✅ جاهز');
  }

  // ─── Utils ───────────────────────────────────────────────────────────────

  /**
   * Auto-grow للـ textarea حتى 8 أسطر
   */
  function _autoGrow(ta) {
    ta.style.height = 'auto';
    const maxH = parseInt(getComputedStyle(ta).lineHeight || '20', 10) * 8;
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  }

  /**
   * escape HTML
   */
  function _esc(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * قطع النص مع "..."
   */
  function _truncate(str, max = 80) {
    if (!str || str.length <= max) return str;
    return str.slice(0, max) + '…';
  }

  /**
   * أضف عداد الأحرف في الـ toolbar لو مش موجود
   */
  function _ensureCharCount() {
    if ($('iv4-char-count')) return;
    const toolbar = $$('.iv4-reply-toolbar .iv4-toolbar-right');
    if (!toolbar) return;
    const span = document.createElement('span');
    span.id = 'iv4-char-count';
    span.className = 'iv4-char-count';
    toolbar.insertBefore(span, toolbar.firstChild);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    quoteMessage,
    clearQuote: _clearQuote,
    clearMedia: _clearMedia,
  };

})();

window.InboxReply = InboxReply;
