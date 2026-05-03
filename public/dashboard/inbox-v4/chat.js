/**
 * chat.js — Chat Window + Message Rendering لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * المسؤوليات:
 *   - عرض رسائل المحادثة الفعالة
 *   - تحميل الرسائل القديمة (Load More / infinite scroll)
 *   - رسم أنواع المحتوى: text | image | video | audio | file | sticker | template | note
 *   - عرض حالة كل رسالة (pending | sent | delivered | read | failed)
 *   - تحديث real-time عبر SSE events
 *   - Read tracking عند فتح المحادثة
 *   - عرض Header المحادثة (اسم + platform + status)
 */

const InboxChat = (() => {
  'use strict';

  // ─── DOM Refs ────────────────────────────────────────────────────────────
  const $panel       = () => document.getElementById('iv4-chat-panel');
  const $header      = () => document.getElementById('iv4-chat-header');
  const $messages    = () => document.getElementById('iv4-messages');
  const $loadMoreBtn = () => document.getElementById('iv4-msg-load-more');
  const $emptyState  = () => document.getElementById('iv4-chat-empty');
  const $typing      = () => document.getElementById('iv4-typing-indicator');

  // ─── Platform Config ──────────────────────────────────────────────────────
  const PLATFORM_LABEL = {
    whatsapp:      'واتساب',
    whatsapp_api:  'واتساب API',
    telegram:      'تيليجرام',
    instagram:     'إنستجرام',
    messenger:     'ماسنجر',
    email:         'إيميل',
    web:           'ويب',
  };

  const PLATFORM_ICON = {
    whatsapp:     '🟢',
    whatsapp_api: '🟢',
    telegram:     '🔵',
    instagram:    '🟣',
    messenger:    '🔷',
    email:        '📧',
    web:          '🌐',
  };

  const STATUS_PRIORITY = {
    open:     1,
    waiting:  2,
    snoozed:  3,
    closed:   4,
  };

  const STATUS_LABEL = {
    open:    'مفتوحة',
    waiting: 'انتظار',
    snoozed: 'مؤجلة',
    closed:  'مغلقة',
  };

  // ─── State محلي ──────────────────────────────────────────────────────────
  let _loadingMessages = false;
  let _scrollLocked    = false;  // منع auto-scroll لما المستخدم يتصفح فوق
  let _prevScrollTop   = 0;
  let _readTimer       = null;
  let _intersectObs    = null;   // IntersectionObserver للـ load more

  // ─── Init ─────────────────────────────────────────────────────────────────

  /**
   * تهيئة الـ Chat Panel — يُستدعى مرة واحدة من app.js
   */
  function init() {
    // استمع لفتح محادثة جديدة
    InboxStore.on('conv:open', _onConvOpen);

    // استمع لتحديثات الرسائل
    InboxStore.on('messages:update', _onMessagesUpdate);
    InboxStore.on('messages:prepend', _onMessagesPrepend);

    // استمع لتحديثات المحادثة الفعالة
    InboxStore.on('activeConv:update', _onActiveConvUpdate);

    // SSE events
    _bindSSEEvents();

    // عرض الـ empty state في البداية
    _showEmpty(true);
  }

  // ─── فتح محادثة ──────────────────────────────────────────────────────────

  /**
   * عند فتح محادثة جديدة
   * @param {number} convId
   */
  async function _onConvOpen(convId) {
    if (!convId) {
      _showEmpty(true);
      return;
    }

    _showEmpty(false);
    _clearMessages();
    _showSkeleton(true);

    // جلب الرسائل
    await fetchMessages(convId, true);

    // تعليم مقروءة بعد ثانية
    _scheduleMarkRead(convId);

    // رسم الـ header
    _renderHeader();
  }

  // ─── جلب الرسائل ─────────────────────────────────────────────────────────

  /**
   * جلب رسائل المحادثة
   * @param {number} convId
   * @param {boolean} reset - true = رسائل جديدة من الأحدث
   */
  async function fetchMessages(convId, reset = false) {
    if (_loadingMessages) return;
    _loadingMessages = true;

    InboxStore.set('messagesLoading', true);

    // آخر رسالة في القائمة = نقطة البداية لـ load older
    const oldest = reset ? null : (InboxStore.state.messages[0] || null);
    const beforeId = oldest ? oldest.id : null;

    const { data, error } = await InboxAPI.conversations.messages(convId, {
      limit: 30,
      before_id: beforeId,
    });

    _showSkeleton(false);
    InboxStore.set('messagesLoading', false);
    _loadingMessages = false;

    if (error) {
      _showError(error);
      return;
    }

    const msgs     = data.messages || [];
    const hasMore  = data.has_more || false;

    if (reset) {
      // استبدل الكل
      InboxStore.patch({ messages: msgs }, true);
      InboxStore.set('messagesHasMore', hasMore);
      InboxStore.emit('messages:update', msgs);
    } else {
      // أضف أقدم للأعلى
      InboxStore.prependMessages(msgs, hasMore);
    }
  }

  // ─── رسم الرسائل ─────────────────────────────────────────────────────────

  /**
   * رسم كل الرسائل (عند التحميل الكامل)
   */
  function _onMessagesUpdate(messages) {
    const container = $messages();
    if (!container) return;

    // احفظ الـ scroll position قبل الرسم
    const wasAtBottom = _isAtBottom(container);

    // ابنِ الـ HTML دفعة واحدة
    const html = messages.length
      ? _buildMessagesHTML(messages)
      : '';

    container.innerHTML = html;

    // ربط الأحداث
    _bindMessageEvents(container);

    // تفعيل الـ observer للـ load more
    _setupLoadMoreObserver();

    // scroll للأسفل إذا كنا في الأسفل أصلاً (أو تحميل جديد)
    if (wasAtBottom || InboxStore.state.messages.length <= 30) {
      _scrollToBottom(container, 'instant');
    }
  }

  /**
   * عند إضافة رسائل قديمة في الأعلى
   * @param {Array} newMsgs - الرسائل المضافة للأعلى
   */
  function _onMessagesPrepend(newMsgs) {
    const container = $messages();
    if (!container) return;

    // احفظ الـ scroll height قبل الإضافة
    const prevHeight = container.scrollHeight;
    const prevScroll = container.scrollTop;

    // أضف في الأعلى
    const fragment = document.createDocumentFragment();
    const wrapper  = document.createElement('div');
    wrapper.innerHTML = _buildMessagesHTML(newMsgs);
    while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
    container.prepend(fragment);

    // ثبّت الـ scroll (منع القفز للأعلى)
    const newHeight = container.scrollHeight;
    container.scrollTop = prevScroll + (newHeight - prevHeight);

    // ربط الأحداث على الرسائل الجديدة
    _bindMessageEvents(container);

    // تحديث زر Load More
    _toggleLoadMore(InboxStore.state.messagesHasMore);
  }

  /**
   * بناء HTML لمجموعة رسائل مع date dividers
   * @param {Array} messages
   * @returns {string} HTML
   */
  function _buildMessagesHTML(messages) {
    const parts = [];
    let lastDate = null;

    messages.forEach(msg => {
      const date = _msgDate(msg.sent_at || msg.created_at);

      // Date Divider إذا تغيّر اليوم
      if (date !== lastDate) {
        parts.push(`<div class="iv4-date-divider"><span>${_escHtml(date)}</span></div>`);
        lastDate = date;
      }

      parts.push(_renderMessage(msg));
    });

    return parts.join('');
  }

  /**
   * رسم رسالة واحدة
   * @param {Object} msg
   * @returns {string} HTML
   */
  function _renderMessage(msg) {
    const dir      = msg.direction; // in | out | note
    const isIn     = dir === 'in';
    const isOut    = dir === 'out';
    const isNote   = dir === 'note';
    const msgClass = `iv4-msg iv4-msg--${dir}`;

    const time    = _formatTime(msg.sent_at || msg.created_at);
    const status  = isOut ? _renderStatus(msg.status) : '';
    const sender  = isIn  ? `<div class="iv4-msg-sender">${_escHtml(msg.sender_name || '')}</div>` : '';
    const content = _renderContent(msg);

    // Quoted message
    const quote = msg.quoted_msg_id ? _renderQuote(msg) : '';

    // Note indicator
    const noteTag = isNote ? '<span class="iv4-note-tag">📝 ملاحظة داخلية</span>' : '';

    return `
<div class="${msgClass}" data-msg-id="${msg.id}" data-direction="${dir}">
  <div class="iv4-msg-bubble">
    ${noteTag}
    ${sender}
    ${quote}
    ${content}
    <div class="iv4-msg-meta">
      <span class="iv4-msg-time">${time}</span>
      ${status}
    </div>
  </div>
</div>`.trim();
  }

  // ─── رسم أنواع المحتوى ────────────────────────────────────────────────────

  /**
   * رسم محتوى الرسالة بناءً على النوع
   * @param {Object} msg
   * @returns {string} HTML
   */
  function _renderContent(msg) {
    const type = msg.content_type || 'text';

    switch (type) {
      case 'text':
        return _renderText(msg);
      case 'image':
        return _renderImage(msg);
      case 'video':
        return _renderVideo(msg);
      case 'audio':
        return _renderAudio(msg);
      case 'file':
        return _renderFile(msg);
      case 'sticker':
        return _renderSticker(msg);
      case 'template':
        return _renderTemplate(msg);
      case 'interactive':
        return _renderInteractive(msg);
      default:
        return _renderText(msg);
    }
  }

  /** رسالة نصية */
  function _renderText(msg) {
    const text = _linkify(_escHtml(msg.content || ''));
    return `<div class="iv4-msg-text">${text}</div>`;
  }

  /** صورة */
  function _renderImage(msg) {
    const url     = _escHtml(msg.media_url || '');
    const caption = msg.content ? `<div class="iv4-msg-caption">${_escHtml(msg.content)}</div>` : '';
    if (!url) return _renderText(msg);
    return `
<div class="iv4-msg-media">
  <img
    src="${url}"
    alt="صورة"
    class="iv4-msg-img"
    loading="lazy"
    data-lightbox-src="${url}"
  />
  ${caption}
</div>`.trim();
  }

  /** فيديو */
  function _renderVideo(msg) {
    const url     = _escHtml(msg.media_url || '');
    const caption = msg.content ? `<div class="iv4-msg-caption">${_escHtml(msg.content)}</div>` : '';
    if (!url) return _renderText(msg);
    return `
<div class="iv4-msg-media">
  <video class="iv4-msg-video" controls preload="metadata">
    <source src="${url}" type="${_escHtml(msg.media_type || 'video/mp4')}">
    المتصفح لا يدعم الفيديو
  </video>
  ${caption}
</div>`.trim();
  }

  /** صوت / voice note */
  function _renderAudio(msg) {
    const url = _escHtml(msg.media_url || '');
    if (!url) return _renderText(msg);
    return `
<div class="iv4-msg-audio">
  <button class="iv4-audio-play-btn" data-audio-url="${url}" aria-label="تشغيل">
    <span class="iv4-audio-icon">▶</span>
  </button>
  <div class="iv4-audio-progress">
    <div class="iv4-audio-bar"></div>
  </div>
  <span class="iv4-audio-duration">--:--</span>
  <audio class="iv4-audio-el" preload="none" src="${url}"></audio>
</div>`.trim();
  }

  /** ملف */
  function _renderFile(msg) {
    const url      = _escHtml(msg.media_url || '');
    const filename = _escHtml(msg.media_filename || msg.content || 'ملف');
    const size     = msg.media_size ? _formatSize(msg.media_size) : '';
    if (!url) return _renderText(msg);
    return `
<div class="iv4-msg-file">
  <a href="${url}" download="${filename}" class="iv4-file-link" target="_blank" rel="noopener">
    <span class="iv4-file-icon">📎</span>
    <div class="iv4-file-info">
      <span class="iv4-file-name">${filename}</span>
      ${size ? `<span class="iv4-file-size">${size}</span>` : ''}
    </div>
  </a>
</div>`.trim();
  }

  /** ستيكر */
  function _renderSticker(msg) {
    const url = _escHtml(msg.media_url || '');
    if (!url) return '<div class="iv4-msg-text">🔲 ستيكر</div>';
    return `<img src="${url}" alt="ستيكر" class="iv4-msg-sticker" loading="lazy" />`;
  }

  /** Template (WA) */
  function _renderTemplate(msg) {
    let meta = {};
    try { meta = JSON.parse(msg.metadata || '{}'); } catch {}

    const templateName = meta.template_name || '';
    const bodyText     = msg.content || '';

    return `
<div class="iv4-msg-template">
  ${templateName ? `<div class="iv4-template-tag">📋 قالب: ${_escHtml(templateName)}</div>` : ''}
  <div class="iv4-msg-text">${_escHtml(bodyText)}</div>
</div>`.trim();
  }

  /** Interactive (WA buttons / list) */
  function _renderInteractive(msg) {
    let meta = {};
    try { meta = JSON.parse(msg.metadata || '{}'); } catch {}

    const bodyText = meta.body?.text || msg.content || '';
    const buttons  = meta.action?.buttons || [];
    const rows     = meta.action?.sections?.flatMap(s => s.rows || []) || [];

    const btnHTML = buttons.map(b =>
      `<div class="iv4-interactive-btn">${_escHtml(b.reply?.title || b.title || '')}</div>`
    ).join('');

    const rowHTML = rows.map(r =>
      `<div class="iv4-interactive-row">
        <strong>${_escHtml(r.title || '')}</strong>
        ${r.description ? `<span>${_escHtml(r.description)}</span>` : ''}
      </div>`
    ).join('');

    return `
<div class="iv4-msg-interactive">
  <div class="iv4-msg-text">${_escHtml(bodyText)}</div>
  ${btnHTML ? `<div class="iv4-interactive-btns">${btnHTML}</div>` : ''}
  ${rowHTML ? `<div class="iv4-interactive-rows">${rowHTML}</div>` : ''}
</div>`.trim();
  }

  // ─── Quoted Message ───────────────────────────────────────────────────────

  /**
   * رسم الرسالة المقتبسة
   * @param {Object} msg - الرسالة الحالية
   * @returns {string} HTML
   */
  function _renderQuote(msg) {
    // نبحث عن الرسالة المقتبسة في الـ state
    const quoted = InboxStore.state.messages.find(m => m.id === msg.quoted_msg_id);

    if (!quoted) {
      return `<div class="iv4-msg-quote iv4-msg-quote--unknown">رسالة مقتبسة</div>`;
    }

    const previewText = quoted.content
      ? _escHtml(quoted.content.slice(0, 80))
      : (quoted.content_type === 'image' ? '🖼 صورة' : '📎 ملف');

    return `
<div class="iv4-msg-quote" data-quoted-id="${quoted.id}">
  <span class="iv4-quote-sender">${_escHtml(quoted.sender_name || 'رسالة مقتبسة')}</span>
  <span class="iv4-quote-text">${previewText}</span>
</div>`.trim();
  }

  // ─── Message Status ───────────────────────────────────────────────────────

  /**
   * رسم علامة حالة الرسالة (tick marks)
   * @param {string} status
   * @returns {string} HTML
   */
  function _renderStatus(status) {
    const icons = {
      pending:   '<span class="iv4-status-icon iv4-status--pending" title="جاري الإرسال">🕐</span>',
      sent:      '<span class="iv4-status-icon iv4-status--sent" title="مُرسلة">✓</span>',
      delivered: '<span class="iv4-status-icon iv4-status--delivered" title="مُستلمة">✓✓</span>',
      read:      '<span class="iv4-status-icon iv4-status--read" title="مقروءة">✓✓</span>',
      failed:    '<span class="iv4-status-icon iv4-status--failed" title="فشل الإرسال">⚠</span>',
    };
    return icons[status] || '';
  }

  // ─── تحديث رسالة واحدة (status change) ──────────────────────────────────

  /**
   * تحديث حالة رسالة واحدة بدون إعادة رسم الكل
   * @param {Object} msg - بيانات الرسالة المحدّثة
   */
  function _updateMessageStatus(msg) {
    const container = $messages();
    if (!container) return;

    const el = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (!el) return;

    const statusEl = el.querySelector('.iv4-status-icon');
    const newStatus = _renderStatus(msg.status);

    if (statusEl) {
      statusEl.outerHTML = newStatus;
    } else {
      const metaEl = el.querySelector('.iv4-msg-meta');
      if (metaEl) metaEl.insertAdjacentHTML('beforeend', newStatus);
    }
  }

  // ─── Header ───────────────────────────────────────────────────────────────

  /**
   * رسم header المحادثة
   */
  function _renderHeader() {
    const header = $header();
    if (!header) return;

    const conv = InboxStore.state.activeConv;
    if (!conv) {
      header.innerHTML = '';
      return;
    }

    const platform     = conv.platform || 'web';
    const icon         = PLATFORM_ICON[platform]  || '💬';
    const platformName = PLATFORM_LABEL[platform] || platform;
    const name         = _escHtml(conv.contact_name || conv.sender_name || conv.phone || 'مجهول');
    const status       = conv.status || 'open';
    const statusLabel  = STATUS_LABEL[status] || status;
    const phone        = conv.sender_phone ? `<span class="iv4-header-phone">${_escHtml(conv.sender_phone)}</span>` : '';
    const assigned     = conv.assigned_to_name
      ? `<span class="iv4-header-assigned">👤 ${_escHtml(conv.assigned_to_name)}</span>`
      : '<span class="iv4-header-assigned iv4-header-unassigned">غير معيّن</span>';

    header.innerHTML = `
<div class="iv4-header-main">
  <div class="iv4-header-avatar" style="background:${_nameToColor(conv.contact_name || conv.sender_name || '')}">
    ${(conv.contact_name || conv.sender_name || '?')[0].toUpperCase()}
    <span class="iv4-header-platform-icon">${icon}</span>
  </div>
  <div class="iv4-header-info">
    <div class="iv4-header-name-row">
      <span class="iv4-header-name">${name}</span>
      <span class="iv4-header-status iv4-status-badge iv4-status-badge--${status}">${statusLabel}</span>
    </div>
    <div class="iv4-header-sub">
      <span class="iv4-header-platform">${icon} ${platformName}</span>
      ${phone}
      ${assigned}
    </div>
  </div>
</div>
<div class="iv4-header-actions">
  <button class="iv4-header-btn" id="iv4-btn-resolve" title="إغلاق المحادثة" ${status === 'closed' ? 'disabled' : ''}>
    ${status === 'closed' ? '✅ مغلقة' : '✅ إغلاق'}
  </button>
  <button class="iv4-header-btn iv4-header-btn--secondary" id="iv4-btn-reopen" title="إعادة فتح" ${status !== 'closed' ? 'hidden' : ''}>
    🔄 إعادة فتح
  </button>
</div>`.trim();

    // ربط أزرار الـ header
    _bindHeaderActions(header, conv);
  }

  /**
   * ربط أحداث الـ header
   */
  function _bindHeaderActions(header, conv) {
    const resolveBtn = header.querySelector('#iv4-btn-resolve');
    const reopenBtn  = header.querySelector('#iv4-btn-reopen');

    if (resolveBtn) {
      resolveBtn.addEventListener('click', async () => {
        resolveBtn.disabled = true;
        const { error } = await InboxAPI.conversations.updateStatus(conv.id, 'closed');
        if (error) {
          resolveBtn.disabled = false;
          console.error('[InboxChat] خطأ في إغلاق المحادثة:', error);
        }
        // الـ SSE سيُحدّث الـ store والـ UI تلقائياً
      });
    }

    if (reopenBtn) {
      reopenBtn.addEventListener('click', async () => {
        reopenBtn.disabled = true;
        const { error } = await InboxAPI.conversations.updateStatus(conv.id, 'open');
        if (error) {
          reopenBtn.disabled = false;
          console.error('[InboxChat] خطأ في إعادة فتح المحادثة:', error);
        }
      });
    }
  }

  /**
   * تحديث الـ header عند تغيير بيانات المحادثة
   */
  function _onActiveConvUpdate(conv) {
    if (!conv || conv.id !== InboxStore.state.activeConvId) return;
    _renderHeader();
  }

  // ─── SSE Events ───────────────────────────────────────────────────────────

  /**
   * تسجيل handlers للـ SSE events
   */
  function _bindSSEEvents() {
    // رسالة جديدة في المحادثة الفعالة
    InboxStore.on('sse:message_new', ({ conv_id, message }) => {
      if (conv_id !== InboxStore.state.activeConvId) return;

      InboxStore.addMessage(message);

      // ارسم الرسالة الجديدة مباشرة (بدون re-render كامل)
      _appendMessage(message);

      // علّم مقروءة (المستخدم يشاهد المحادثة الآن)
      _scheduleMarkRead(conv_id);
    });

    // تحديث حالة رسالة (delivered / read)
    InboxStore.on('sse:message_status', ({ message }) => {
      if (!message || !InboxStore.state.messages.find(m => m.id === message.id)) return;
      InboxStore.addMessage(message); // upsert في الـ store
      _updateMessageStatus(message);
    });

    // تحديث بيانات المحادثة (assignment / status / etc.)
    InboxStore.on('sse:conv_update', conv => {
      if (conv.id !== InboxStore.state.activeConvId) return;
      _renderHeader();
    });
  }

  // ─── Append رسالة جديدة ────────────────────────────────────────────────────

  /**
   * إضافة رسالة واحدة في الأسفل بدون re-render كامل
   * @param {Object} msg
   */
  function _appendMessage(msg) {
    const container = $messages();
    if (!container) return;

    const wasAtBottom = _isAtBottom(container);

    // Date divider إذا لزم
    const date      = _msgDate(msg.sent_at || msg.created_at);
    const lastDiv   = container.querySelector('.iv4-date-divider:last-of-type');
    const lastDate  = lastDiv ? lastDiv.textContent.trim() : null;

    if (date !== lastDate) {
      container.insertAdjacentHTML('beforeend',
        `<div class="iv4-date-divider"><span>${_escHtml(date)}</span></div>`
      );
    }

    container.insertAdjacentHTML('beforeend', _renderMessage(msg));

    // ربط أحداث الرسالة الجديدة
    const newEl = container.lastElementChild;
    if (newEl) _bindMessageEvents(newEl);

    // scroll للأسفل لو كنا فيه
    if (wasAtBottom) _scrollToBottom(container);
  }

  // ─── Load More Observer ───────────────────────────────────────────────────

  /**
   * إعداد IntersectionObserver لتحميل الرسائل القديمة
   * يُفعّل عند وصول المستخدم لأعلى القائمة
   */
  function _setupLoadMoreObserver() {
    // حذف الـ observer القديم
    if (_intersectObs) {
      _intersectObs.disconnect();
      _intersectObs = null;
    }

    if (!InboxStore.state.messagesHasMore) {
      _toggleLoadMore(false);
      return;
    }

    _toggleLoadMore(true);

    // الهدف: أول رسالة في الـ container
    const container = $messages();
    if (!container) return;

    const sentinel = document.createElement('div');
    sentinel.id = 'iv4-msg-sentinel';
    sentinel.style.height = '1px';
    container.prepend(sentinel);

    _intersectObs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && InboxStore.state.messagesHasMore) {
        const convId = InboxStore.state.activeConvId;
        if (convId) fetchMessages(convId, false);
      }
    }, { root: container, threshold: 0.1 });

    _intersectObs.observe(sentinel);
  }

  /**
   * تبديل ظهور زر Load More
   */
  function _toggleLoadMore(show) {
    const btn = $loadMoreBtn();
    if (btn) btn.classList.toggle('hidden', !show);
  }

  // ─── Read Tracking ────────────────────────────────────────────────────────

  /**
   * جدولة تعليم المحادثة مقروءة بعد تأخير قصير
   * @param {number} convId
   */
  function _scheduleMarkRead(convId) {
    if (_readTimer) clearTimeout(_readTimer);
    _readTimer = setTimeout(async () => {
      _readTimer = null;
      if (InboxStore.state.activeConvId !== convId) return;

      const { error } = await InboxAPI.conversations.markRead(convId);
      if (!error) {
        // حدّث الـ store محلياً
        const conv = InboxStore.state.conversations.find(c => c.id === convId);
        if (conv) {
          InboxStore.upsertConversation({ ...conv, unread_count: 0 });
        }
      }
    }, 1200); // بعد 1.2 ثانية من فتح المحادثة
  }

  // ─── Scroll Helpers ───────────────────────────────────────────────────────

  /**
   * Scroll للأسفل
   * @param {Element} container
   * @param {'smooth'|'instant'} behavior
   */
  function _scrollToBottom(container, behavior = 'smooth') {
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }

  /**
   * هل نحن في أسفل الـ container؟
   * @param {Element} container
   * @returns {boolean}
   */
  function _isAtBottom(container) {
    if (!container) return true;
    const threshold = 80; // px من الأسفل = "في الأسفل"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }

  // ─── Event Binding ────────────────────────────────────────────────────────

  /**
   * ربط أحداث الرسائل (lightbox / audio player / quote click)
   * @param {Element} container - الـ container أو الـ element الجديد
   */
  function _bindMessageEvents(container) {
    // Lightbox للصور
    container.querySelectorAll('[data-lightbox-src]').forEach(img => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => _openLightbox(img.dataset.lightboxSrc));
    });

    // Audio player
    container.querySelectorAll('.iv4-audio-play-btn').forEach(btn => {
      const audioEl = btn.closest('.iv4-msg-audio')?.querySelector('.iv4-audio-el');
      if (!audioEl) return;
      btn.addEventListener('click', () => _toggleAudio(btn, audioEl));
    });

    // Quote click — scroll للرسالة المقتبسة
    container.querySelectorAll('.iv4-msg-quote[data-quoted-id]').forEach(q => {
      q.style.cursor = 'pointer';
      q.addEventListener('click', () => _scrollToMessage(q.dataset.quotedId));
    });
  }

  // ─── Lightbox ─────────────────────────────────────────────────────────────

  /**
   * فتح lightbox بسيط للصور
   * @param {string} src
   */
  function _openLightbox(src) {
    // أزل أي lightbox قديم
    document.getElementById('iv4-lightbox')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-lightbox';
    overlay.className = 'iv4-lightbox-overlay';
    overlay.innerHTML = `
<div class="iv4-lightbox-inner">
  <button class="iv4-lightbox-close" aria-label="إغلاق">✕</button>
  <img src="${_escHtml(src)}" class="iv4-lightbox-img" alt="معاينة الصورة" />
</div>`.trim();

    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.classList.contains('iv4-lightbox-close')) {
        overlay.remove();
      }
    });

    // إغلاق بـ Escape
    const onKey = e => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }

  // ─── Audio Player ─────────────────────────────────────────────────────────

  /**
   * تشغيل / إيقاف الصوت
   * @param {Element} btn
   * @param {HTMLAudioElement} audioEl
   */
  function _toggleAudio(btn, audioEl) {
    const icon = btn.querySelector('.iv4-audio-icon');
    const durationEl = btn.closest('.iv4-msg-audio')?.querySelector('.iv4-audio-duration');
    const barEl      = btn.closest('.iv4-msg-audio')?.querySelector('.iv4-audio-bar');

    if (audioEl.paused) {
      // أوقف أي صوت آخر
      document.querySelectorAll('.iv4-audio-el').forEach(a => {
        if (a !== audioEl && !a.paused) {
          a.pause();
          const otherBtn = a.closest('.iv4-msg-audio')?.querySelector('.iv4-audio-icon');
          if (otherBtn) otherBtn.textContent = '▶';
        }
      });

      audioEl.play().catch(() => {});
      if (icon) icon.textContent = '⏸';

      // تحديث الـ progress
      audioEl.ontimeupdate = () => {
        const pct = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
        if (barEl) barEl.style.width = `${pct}%`;
        if (durationEl) durationEl.textContent = _formatAudioTime(audioEl.currentTime);
      };

      audioEl.onended = () => {
        if (icon) icon.textContent = '▶';
        if (barEl) barEl.style.width = '0%';
        if (durationEl) durationEl.textContent = '00:00';
      };

      // اعرض مدة الصوت
      audioEl.onloadedmetadata = () => {
        if (durationEl && audioEl.duration) {
          durationEl.textContent = _formatAudioTime(audioEl.duration);
        }
      };
    } else {
      audioEl.pause();
      if (icon) icon.textContent = '▶';
    }
  }

  // ─── Scroll To Message ────────────────────────────────────────────────────

  /**
   * الـ scroll لرسالة معينة وتمييزها
   * @param {string|number} msgId
   */
  function _scrollToMessage(msgId) {
    const container = $messages();
    if (!container) return;
    const el = container.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('iv4-msg--highlight');
    setTimeout(() => el.classList.remove('iv4-msg--highlight'), 1500);
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────

  function _showEmpty(show) {
    const panel   = $panel();
    const empty   = $emptyState();
    const msgs    = $messages();
    const header  = $header();

    if (empty)  empty.classList.toggle('hidden', !show);
    if (msgs)   msgs.classList.toggle('hidden', show);
    if (header) header.classList.toggle('hidden', show);
  }

  function _clearMessages() {
    const container = $messages();
    if (container) container.innerHTML = '';
  }

  function _showSkeleton(show) {
    const container = $messages();
    if (!container) return;

    const existing = container.querySelector('.iv4-msg-skeleton');
    if (show && !existing) {
      // 5 skeleton bubbles
      container.innerHTML = Array(5).fill(0).map((_, i) => `
<div class="iv4-msg-skeleton iv4-msg ${i % 2 === 0 ? 'iv4-msg--in' : 'iv4-msg--out'}">
  <div class="iv4-skeleton-bubble"></div>
</div>`.trim()).join('');
    } else if (!show && existing) {
      container.querySelectorAll('.iv4-msg-skeleton').forEach(el => el.remove());
    }
  }

  function _showError(msg) {
    const container = $messages();
    if (!container) return;
    container.innerHTML = `<div class="iv4-chat-error">⚠️ خطأ: ${_escHtml(msg)}</div>`;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** تنسيق وقت الرسالة */
  function _formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(typeof iso === 'number' ? iso * 1000 : iso);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    } catch { return ''; }
  }

  /** تنسيق تاريخ الرسالة للـ divider */
  function _msgDate(iso) {
    if (!iso) return '';
    try {
      const d   = new Date(typeof iso === 'number' ? iso * 1000 : iso);
      const now = new Date();
      const diffDay = Math.floor((now - d) / 86400000);

      if (diffDay === 0) return 'اليوم';
      if (diffDay === 1) return 'أمس';
      if (diffDay < 7)  return d.toLocaleDateString('ar-EG', { weekday: 'long' });

      return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return ''; }
  }

  /** تنسيق وقت الصوت (seconds → mm:ss) */
  function _formatAudioTime(secs) {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** تنسيق حجم الملف */
  function _formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** تحويل URLs في النص لروابط قابلة للنقر */
  function _linkify(text) {
    return text.replace(
      /https?:\/\/[^\s<>"]+/g,
      url => `<a href="${url}" target="_blank" rel="noopener" class="iv4-msg-link">${url}</a>`
    );
  }

  /** لون من الاسم */
  function _nameToColor(name) {
    const COLORS = [
      '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
      '#f97316','#22c55e','#ef4444','#6366f1',
    ];
    if (!name) return COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  /** escape HTML */
  function _escHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    fetchMessages,
    renderHeader: _renderHeader,
    appendMessage: _appendMessage,
    scrollToBottom: (behavior) => _scrollToBottom($messages(), behavior),
  };

})();

window.InboxChat = InboxChat;
