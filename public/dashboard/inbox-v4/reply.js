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
 *   - @Mentions في النوتس: autocomplete + تمييز بصري (P2-4)
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

  // ─── @Mention State (P2-4) ────────────────────────────────────────────
  let _mentionQuery      = null;   // النص بعد @ (null = مش في mention mode)
  let _mentionStart      = -1;    // موقع @ في الـ textarea
  let _mentionDropdown   = null;  // عنصر القائمة المنسدلة
  let _mentionResults    = [];    // الموظفين المُفلترين
  let _mentionCursor     = -1;    // العنصر المُحدد في القائمة

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

    // ── استخراج الـ mentions قبل الإرسال (P2-4) ─────────────────────────
    const mentions = (mode === 'note' && content)
      ? _extractMentions(content)
      : [];

    _hideMentionDropdown();

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

      } else if ((InboxStore.state.activeConv?.platform === 'email') && mode !== 'note') {
        // P8-1: إرسال إيميل رد عبر SMTP
        if (typeof InboxEmail !== 'undefined') {
          const { data, error } = await InboxEmail.sendEmailReply(convId, { body_text: content });
          result = error ? { error } : (data || {});
        } else {
          result = { error: 'InboxEmail module not loaded' };
        }
      } else {
        // ── إرسال نص ─────────────────────────────────────────────────
        const { data, error } = await InboxAPI.messages.send(convId, {
          content,
          contentType:     'text',
          quotedMsgId:     _quotedMsg?.id || null,
          channelOverride: channel,
          direction:       mode === 'note' ? 'note' : 'outbound',
          // أرسل الـ mentions مع النوتس (P2-4)
          mentionIds:      mentions.map(a => a.id),
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

  // ─── @Mention Autocomplete (P2-4) ─────────────────────────────────────────

  /**
   * تحليل موقع المؤشر في الـ textarea لكشف إن كنّا داخل @mention
   * يُعيد { active: bool, query: string, start: number }
   */
  function _parseMentionContext(ta) {
    const pos  = ta.selectionStart;
    const text = ta.value.slice(0, pos);
    // ابحث عن آخر @ في السطر الحالي (لا مسافة بعده حتى المؤشر)
    const match = text.match(/@(\w*)$/);
    if (!match) return { active: false };
    return {
      active: true,
      query:  match[1],               // النص بعد @
      start:  pos - match[0].length,  // موقع @ في النص الكامل
    };
  }

  /**
   * عرض قائمة الـ @mention
   * @param {string} query - البحث الحالي
   * @param {number} mentionStart - موقع @ في الـ textarea
   */
  function _showMentionDropdown(query, mentionStart) {
    const agents = InboxStore.state.agents || [];
    // فلتر بالاسم أو username
    const filtered = agents.filter(a => {
      const name = (a.name || a.username || '').toLowerCase();
      return name.startsWith(query.toLowerCase());
    }).slice(0, 6);  // حد أقصى 6 نتائج

    _mentionResults = filtered;
    _mentionCursor  = filtered.length > 0 ? 0 : -1;

    if (filtered.length === 0) {
      _hideMentionDropdown();
      return;
    }

    // أنشئ الـ dropdown لو مش موجود
    if (!_mentionDropdown) {
      _mentionDropdown = document.createElement('div');
      _mentionDropdown.id        = 'iv4-mention-dropdown';
      _mentionDropdown.className = 'iv4-mention-dropdown';
      _mentionDropdown.setAttribute('role', 'listbox');
      document.body.appendChild(_mentionDropdown);
    }

    _renderMentionItems();
    _positionMentionDropdown();
    _mentionStart = mentionStart;
  }

  /**
   * رسم عناصر القائمة
   */
  function _renderMentionItems() {
    if (!_mentionDropdown) return;
    _mentionDropdown.innerHTML = _mentionResults.map((a, i) => {
      const name   = _esc(a.name || a.username || '?');
      const status = a.status || 'offline';
      const colors = { online: '#22c55e', busy: '#f59e0b', away: '#94a3b8', offline: '#64748b' };
      const color  = colors[status] || colors.offline;
      return `
        <div class="iv4-mention-item ${i === _mentionCursor ? 'active' : ''}"
             role="option"
             data-idx="${i}"
             data-name="${_esc(a.name || a.username || '')}"
             data-id="${a.id}">
          <span class="iv4-mention-dot" style="background:${color}"></span>
          <span class="iv4-mention-name">${name}</span>
        </div>
      `;
    }).join('');

    // ربط أحداث النقر
    _mentionDropdown.querySelectorAll('.iv4-mention-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();  // لا نفقد focus على الـ textarea
        const idx = parseInt(el.dataset.idx, 10);
        _insertMention(idx);
      });
    });
  }

  /**
   * تحديد موقع القائمة بالنسبة للـ textarea (فوق أو تحت)
   */
  function _positionMentionDropdown() {
    if (!_mentionDropdown) return;
    const ta   = $('iv4-reply-textarea');
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    const ddH  = 220;  // الارتفاع التقريبي للـ dropdown
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove  = spaceBelow < ddH + 8;

    _mentionDropdown.style.left   = `${rect.left}px`;
    _mentionDropdown.style.width  = `${Math.min(rect.width, 280)}px`;

    if (showAbove) {
      _mentionDropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      _mentionDropdown.style.top    = 'auto';
    } else {
      _mentionDropdown.style.top    = `${rect.bottom + 4}px`;
      _mentionDropdown.style.bottom = 'auto';
    }

    _mentionDropdown.classList.remove('hidden');
  }

  /**
   * إخفاء القائمة + reset الـ state
   */
  function _hideMentionDropdown() {
    if (_mentionDropdown) {
      _mentionDropdown.innerHTML = '';
      _mentionDropdown.classList.add('hidden');
    }
    _mentionQuery   = null;
    _mentionStart   = -1;
    _mentionResults = [];
    _mentionCursor  = -1;
  }

  /**
   * إدراج اسم الموظف في الـ textarea بدلاً من @query
   * @param {number} idx - فهرس الموظف في _mentionResults
   */
  function _insertMention(idx) {
    const agent = _mentionResults[idx];
    if (!agent) return;

    const ta   = $('iv4-reply-textarea');
    if (!ta) return;

    const name       = agent.name || agent.username || '';
    const cursorPos  = ta.selectionStart;
    const before     = ta.value.slice(0, _mentionStart);
    const after      = ta.value.slice(cursorPos);
    const mention    = `@${name} `;

    ta.value = before + mention + after;
    const newPos = _mentionStart + mention.length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();

    _hideMentionDropdown();
    _updateSendBtn();
    _updateCharCount();
  }

  /**
   * التحكم في القائمة بلوحة المفاتيح (↑ ↓ Enter Escape)
   * يُعيد true إذا عالج الحدث (منع الإرسال)
   */
  function _handleMentionKeydown(e) {
    if (!_mentionDropdown || _mentionDropdown.classList.contains('hidden')) return false;
    if (_mentionResults.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _mentionCursor = (_mentionCursor + 1) % _mentionResults.length;
      _renderMentionItems();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _mentionCursor = (_mentionCursor - 1 + _mentionResults.length) % _mentionResults.length;
      _renderMentionItems();
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (_mentionCursor >= 0) _insertMention(_mentionCursor);
      return true;
    }
    if (e.key === 'Escape') {
      _hideMentionDropdown();
      return true;
    }
    return false;
  }

  /**
   * استخراج @Mentions من نص الرسالة
   * يُعيد مصفوفة أسماء الموظفين المذكورين (بدون @)
   */
  function _extractMentions(text) {
    const matches = text.match(/@(\w+)/g) || [];
    const names   = matches.map(m => m.slice(1).toLowerCase());
    const agents  = InboxStore.state.agents || [];
    // تقاطع مع الموظفين الفعليين + إزالة التكرار
    const found   = new Map();
    agents.forEach(a => {
      const name = (a.name || a.username || '').toLowerCase();
      if (names.includes(name)) found.set(a.id, a);
    });
    return [...found.values()];
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

    // ── Typing Indicator (P2-2) ──────────────────────────────────────────
    let _typingActive  = false;
    let _typingTimeout = null;

    function _sendTypingStart() {
      const convId = InboxStore.state.activeConvId;
      if (!convId || _typingActive) return;
      _typingActive = true;
      InboxAPI.team.sendTyping(convId, true).catch(() => {});
    }

    function _sendTypingStop() {
      const convId = InboxStore.state.activeConvId;
      _typingActive = false;
      clearTimeout(_typingTimeout);
      if (!convId) return;
      InboxAPI.team.sendTyping(convId, false).catch(() => {});
    }

    // ── Textarea events ───────────────────────────────────────────────────
    textarea.addEventListener('input', () => {
      _updateCharCount();
      _updateSendBtn();
      _autoGrow(textarea);

      // أرسل typing:start واحدة فقط لكل جلسة كتابة
      _sendTypingStart();
      // أوقف تلقائياً بعد 3.5 ث بلا كتابة
      clearTimeout(_typingTimeout);
      _typingTimeout = setTimeout(_sendTypingStop, 3500);

      // ── @Mention detection (P2-4) ─────────────────────────────
      // يعمل فقط في mode=note
      const mode = InboxStore.state.replyMode || 'reply';
      if (mode === 'note') {
        const { active, query, start } = _parseMentionContext(textarea);
        if (active) {
          _mentionQuery = query;
          _showMentionDropdown(query, start);
        } else {
          _hideMentionDropdown();
        }
      } else {
        _hideMentionDropdown();
      }
    });

    // ── Scroll/resize → إعادة تموضع القائمة ──────────────────────
    textarea.addEventListener('scroll', () => {
      if (_mentionDropdown && !_mentionDropdown.classList.contains('hidden')) {
        _positionMentionDropdown();
      }
    });

    // Ctrl+Enter أو Enter للإرسال (Shift+Enter = سطر جديد)
    textarea.addEventListener('keydown', e => {
      // @Mention يأخذ الأولوية على ↑↓ Enter Escape
      if (_handleMentionKeydown(e)) return;

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

    // أخفِ القائمة لو الـ textarea فقد الـ focus
    textarea.addEventListener('blur', () => {
      // تأخير 150ms لإتاحة نقر على عنصر في القائمة قبل الإخفاء
      setTimeout(_hideMentionDropdown, 150);
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
      _hideMentionDropdown();
      if (textarea) {
        textarea.value = '';
        textarea.placeholder = value === 'note'
          ? 'اكتب ملاحظة داخلية... (اكتب @ لذكر موظف)'
          : 'اكتب رسالتك...';
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
      _hideMentionDropdown();
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
    clearQuote:             _clearQuote,
    clearMedia:             _clearMedia,
    hideMentionDropdown:    _hideMentionDropdown,
    extractMentions:        _extractMentions,   // للاختبار
  };

})();

window.InboxReply = InboxReply;
