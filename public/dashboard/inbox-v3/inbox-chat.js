/**
 * inbox-chat.js — Areej Pro Inbox v3
 * Chat window: فتح محادثة، تحميل الرسائل، render، Quote/Reply
 * آخر تحديث: 2026-05-02
 */

// ── فتح محادثة ─────────────────────────────────────────────

async function iv3OpenConv(convId) {
  if (IV3.activeConvId === convId) return;

  // صفّر beacon الكتابة للمحادثة السابقة
  if (typeof iv3ClearTypingBeacon === 'function') iv3ClearTypingBeacon();

  IV3.activeConvId = convId;

  // تحديد العنصر النشط في القائمة
  document.querySelectorAll('.iv3-conv-item').forEach(el => {
    el.classList.toggle('active', +el.dataset.id === convId);
  });

  // إظهار الـ chat panel (موبايل)
  document.getElementById('iv3-chat')?.classList.add('visible');

  // إظهار Reply box
  const reply = document.getElementById('iv3-reply');
  if (reply) reply.style.display = '';

  // إظهار Header actions
  const actions = document.getElementById('iv3-hdr-actions');
  if (actions) actions.style.display = '';

  // تحميل الرسائل
  await iv3LoadMessages(convId);

  // تحديث الـ header بتفاصيل المحادثة
  const conv = IV3.convs.find(c => c.id === convId);
  if (conv) {
    IV3.activeConv = conv;
    iv3UpdateChatHeader(conv);
    iv3UpdateContextPanel(conv);
  }

  // صفّر الـ unread
  iv3ClearUnread(convId);
}

// ── تحميل الرسائل ──────────────────────────────────────────

async function iv3LoadMessages(convId) {
  IV3.loadingMsgs = true;
  const msgsEl = document.getElementById('iv3-msgs');
  if (msgsEl) msgsEl.innerHTML = `<div class="iv3-msgs-loading">
    <div class="iv3-spinner"></div>
  </div>`;

  try {
    // تحميل الرسائل والتاريخ بالتوازي
    const [msgData, timelineData] = await Promise.all([
      IV3_API.getMessages(convId),
      IV3_API.getTimeline(convId).catch(() => ({ events: [] })),
    ]);
    IV3.messages  = Array.isArray(msgData) ? msgData : (msgData.messages || []);
    IV3.timeline  = timelineData?.events || [];
    iv3RenderMessages();
  } catch (e) {
    if (msgsEl) msgsEl.innerHTML = `
      <div class="iv3-msgs-empty">
        <p style="color:#EF4444">⚠️ ${iv3EscHtml(e.message)}</p>
        <button onclick="iv3LoadMessages(${convId})" class="iv3-retry-btn">إعادة المحاولة</button>
      </div>`;
  } finally {
    IV3.loadingMsgs = false;
  }
}

// ── Render الرسائل ─────────────────────────────────────────

function iv3RenderMessages() {
  const container = document.getElementById('iv3-msgs');
  if (!container) return;

  if (!IV3.messages.length && !(IV3.timeline || []).length) {
    container.innerHTML = `<div class="iv3-msgs-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>لا توجد رسائل بعد</p>
    </div>`;
    return;
  }

  // دمج الرسائل + أحداث التاريخ وترتيبهم زمنياً
  const msgItems = IV3.messages.map(m => ({
    _kind: 'msg',
    _ts: new Date(m.sent_at || m.created_at || 0).getTime(),
    data: m,
  }));
  const tlItems = (IV3.timeline || []).map(e => ({
    _kind: 'event',
    _ts: new Date(e.created_at || 0).getTime(),
    data: e,
  }));
  const combined = [...msgItems, ...tlItems].sort((a, b) => a._ts - b._ts);

  let html = '';
  let lastDate = null;

  combined.forEach(item => {
    const dateTs = item._kind === 'msg'
      ? (item.data.sent_at || item.data.created_at)
      : item.data.created_at;
    const msgDate = iv3DateLabel(dateTs);
    if (msgDate !== lastDate) {
      html += `<div class="iv3-date-sep"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }

    if (item._kind === 'msg') {
      html += iv3BuildMsgBubble(item.data);
    } else {
      html += iv3BuildTimelineEvent(item.data);
    }
  });

  container.innerHTML = html;

  // اسكرول للآخر
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function iv3BuildMsgBubble(msg) {
  const isOut  = msg.direction === 'out';
  const isNote = msg.is_note || msg.mode === 'note';
  const time   = iv3FormatMsgTime(msg.sent_at || msg.created_at);
  const senderName = isOut ? (IV3.me?.name || 'أنت') : (IV3.activeConv?.sender_name || '');

  let content = '';

  // بناء قسم الاقتباس لو هذه الرسالة تحتوي على quote
  let quoteHtml = '';
  if (msg.quoted_content) {
    const qSender = msg.quoted_sender || (msg.quoted_direction === 'out' ? (IV3.me?.name || 'أنت') : (IV3.activeConv?.sender_name || ''));
    quoteHtml = `<div class="iv3-quote-block">
      <div class="iv3-quote-sender">${iv3EscHtml(qSender)}</div>
      <div class="iv3-quote-text">${iv3EscHtml(iv3TruncText(msg.quoted_content, 80))}</div>
    </div>`;
  }

  const isMedia = msg.media_url || msg.file_id ||
    ['image','video','audio','file'].includes(msg.message_type);
  if (isMedia) {
    content = iv3BuildMediaContent(msg);
  } else {
    content = `<div class="iv3-msg-text">${iv3EscHtml(msg.content || msg.message || '').replace(/\n/g, '<br>')}</div>`;
  }

  const statusIcon = isOut ? iv3MsgStatusIcon(msg.status) : '';

  // زر الرد السريع (يظهر عند hover)
  const msgIdSafe = String(msg.id).replace(/[^a-zA-Z0-9_]/g, '_');
  const replyBtnHtml = isNote ? '' : `
    <div class="iv3-msg-actions">
      <button class="iv3-msg-action-btn" onclick="iv3QuoteMsg('${msgIdSafe}')" title="رد على هذه الرسالة"
        data-msg-id="${iv3EscHtml(String(msg.id))}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
        </svg>
      </button>
    </div>`;

  return `
    <div class="iv3-msg-wrap ${isOut ? 'out' : 'in'} ${isNote ? 'note' : ''}" id="iv3-msg-${msgIdSafe}">
      ${!isOut ? `<div class="iv3-msg-sender-name">${iv3EscHtml(senderName)}</div>` : ''}
      ${isNote ? '<div class="iv3-note-label">🔒 ملاحظة داخلية</div>' : ''}
      ${replyBtnHtml}
      <div class="iv3-msg-bubble">
        ${quoteHtml}
        ${content}
        <div class="iv3-msg-meta">
          <span class="iv3-msg-time">${time}</span>
          ${statusIcon}
        </div>
      </div>
    </div>`;
}

// ── Timeline Event Bubble ───────────────────────────────────

function iv3BuildTimelineEvent(event) {
  const meta  = event.meta || {};
  const actor = iv3EscHtml(meta.actor || event.actor_name || 'النظام');
  const time  = iv3FormatMsgTime(event.created_at);

  let icon = 'ℹ️';
  let text = '';

  switch (event.event_type) {
    case 'status_changed': {
      const labels = { open: 'مفتوحة', closed: 'مغلقة', waiting: 'انتظار' };
      const statusLabel = labels[meta.status] || meta.status || '';
      icon = meta.status === 'closed' ? '✅' : meta.status === 'waiting' ? '⏳' : '🟢';
      text = `قام <b>${actor}</b> بتغيير الحالة إلى “${iv3EscHtml(statusLabel)}”`;
      break;
    }
    case 'assigned': {
      const toName = iv3EscHtml(meta.to_name || '');
      icon = '👤';
      text = `عيّن <b>${actor}</b> المحادثة لـ <b>${toName}</b>`;
      break;
    }
    case 'unassigned': {
      icon = '👤';
      text = `ألغى <b>${actor}</b> تعيين المحادثة`;
      break;
    }
    case 'snoozed': {
      icon = '⏰';
      const untilLabel = meta.until ? iv3FormatSnoozeTime(meta.until) : '';
      text = `أجّل <b>${actor}</b> المحادثة` + (untilLabel ? ` حتى ${iv3EscHtml(untilLabel)}` : '');
      break;
    }
    case 'unsnoozed': {
      icon = '⏰';
      text = `عادت المحادثة من التأجيل`;
      break;
    }
    case 'note_added': {
      icon = '🔒';
      text = `أضاف <b>${actor}</b> ملاحظة داخلية`;
      break;
    }
    default:
      text = iv3EscHtml(event.event_type || '');
  }

  return `
    <div class="iv3-timeline-event">
      <span class="iv3-tl-icon">${icon}</span>
      <span class="iv3-tl-text">${text}</span>
      <span class="iv3-tl-time">${time}</span>
    </div>`;
}

function iv3BuildMediaContent(msg) {
  const url      = msg.media_url;
  const rawType  = (msg.media_type || msg.mime_type || '').toLowerCase();
  const text     = msg.content || msg.message || '';

  // لو ما فيش URL حقيقي — عرض النص فقط
  if (!url) {
    return `<div class="iv3-msg-text">${iv3EscHtml(text || '[مرفق]').replace(/\n/g, '<br>')}</div>`;
  }

  // نورمل الـ type: 'image' أو 'image/jpeg' → 'image'
  const kind = rawType.split('/')[0]; // 'image','video','audio','application','text'

  if (kind === 'image' || rawType === 'image') {
    const caption = text && text !== '[\u0635\u0648\u0631\u0629]' ? `<div class="iv3-msg-caption">${iv3EscHtml(text)}</div>` : '';
    return `<img class="iv3-msg-img" src="${url}" onclick="iv3PreviewImg('${url}')" loading="lazy">${caption}`;
  }
  if (kind === 'video' || rawType === 'video') {
    const caption = text && text !== '[\u0641\u064a\u062f\u064a\u0648]' ? `<div class="iv3-msg-caption">${iv3EscHtml(text)}</div>` : '';
    return `<video class="iv3-msg-video" controls src="${url}"></video>${caption}`;
  }
  if (kind === 'audio' || rawType === 'audio') {
    return `<audio class="iv3-msg-audio" controls src="${url}"></audio>`;
  }

  // ملف عام (PDF, ZIP, إلخ)
  const ext   = url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'FILE';
  const fname = msg.file_name || text || ('\u0645\u0644\u0641 ' + ext);
  const icon  = ext === 'PDF' ? '📕' : ext === 'ZIP' || ext === 'RAR' ? '🗄️' : '📎';
  return `<a class="iv3-msg-file" href="${url}" target="_blank" download>
    <span style="font-size:20px;margin-left:8px">${icon}</span>
    <span>
      <div style="font-weight:700;font-size:13px">${iv3EscHtml(fname)}</div>
      <div style="font-size:11px;color:#6b7280">${ext} — اضغط للتحميل</div>
    </span>
  </a>`;
}

function iv3MsgStatusIcon(status) {
  if (status === 'sent')      return '<span class="iv3-tick">✓</span>';
  if (status === 'delivered') return '<span class="iv3-tick">✓✓</span>';
  if (status === 'read')      return '<span class="iv3-tick read">✓✓</span>';
  if (status === 'failed')    return '<span class="iv3-tick failed">✗</span>';
  return '<span class="iv3-tick pending">○</span>';
}

// ── Quote / Reply ──────────────────────────────────────────

function iv3QuoteMsg(msgId) {
  // البحث عن الرسالة في IV3.messages
  // msgId قد يكون string مع underscore بدل حرف خاص
  const msg = IV3.messages.find(m => String(m.id) === msgId || String(m.id).replace(/[^a-zA-Z0-9_]/g, '_') === msgId);
  if (!msg) return;

  // لا نقتبس notes
  if (msg.is_note || msg.mode === 'note') return;

  // تخزين الاقتباس في الـ state
  IV3.quotedMsg = {
    id: msg.id,
    content: msg.content || msg.message || '',
    sender_name: msg.direction === 'out'
      ? (IV3.me?.name || 'أنت')
      : (IV3.activeConv?.sender_name || ''),
    direction: msg.direction,
  };

  // تحديث الـ preview في الـ reply box
  iv3ShowQuotePreview();

  // فوكس على الـ textarea
  const textarea = document.getElementById('iv3-textarea');
  if (textarea) textarea.focus();
}

function iv3ShowQuotePreview() {
  const preview = document.getElementById('iv3-quote-preview');
  if (!preview || !IV3.quotedMsg) return;

  const senderEl = preview.querySelector('.iv3-quote-preview-sender');
  const textEl   = preview.querySelector('.iv3-quote-preview-text');

  if (senderEl) senderEl.textContent = IV3.quotedMsg.sender_name;
  if (textEl)   textEl.textContent   = iv3TruncText(IV3.quotedMsg.content, 100);

  preview.style.display = 'flex';

  // scroll للـ textarea
  const replyBox = document.getElementById('iv3-reply');
  if (replyBox) replyBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function iv3ClearQuote() {
  IV3.quotedMsg = null;
  const preview = document.getElementById('iv3-quote-preview');
  if (preview) preview.style.display = 'none';
}

// ── تحديث الـ Header ────────────────────────────────────────

function iv3UpdateChatHeader(conv) {
  const name     = document.getElementById('iv3-hdr-name');
  const avatar   = document.getElementById('iv3-hdr-avatar');
  const platEl   = document.getElementById('iv3-hdr-plat');
  const assigned = document.getElementById('iv3-hdr-assigned');
  const statusSel = document.getElementById('iv3-status-sel');

  const displayName = (typeof iv3CleanSenderDisplay === 'function')
    ? iv3CleanSenderDisplay(conv.sender_name, conv.sender_id)
    : (conv.sender_name || conv.sender_id || 'مجهول');
  if (name) name.textContent = displayName || 'مجهول';

  if (avatar) {
    const color = iv3AvatarColor(conv.sender_id || conv.id);
    const init  = iv3Initials(displayName || '?');
    avatar.style.background = color;
    avatar.textContent = init;
  }

  if (platEl) {
    const platNames = {
      'whatsapp-qr': '📱 واتساب QR',
      'whatsapp':    '💬 واتساب API',
      'telegram':    '✈️ تيليجرام',
      'messenger':   '💙 ماسنجر',
      'instagram':   '📸 إنستجرام',
    };
    platEl.textContent = platNames[conv.platform] || conv.platform || '';
    platEl.style.display = conv.platform ? '' : 'none';
  }

  if (assigned) {
    const agentName = conv.assigned_to_name || conv.assigned_to_id;
    if (agentName) {
      assigned.textContent = `👤 ${agentName}`;
      assigned.style.display = '';
    } else {
      assigned.style.display = 'none';
    }
  }

  if (statusSel) {
    statusSel.value = conv.status || 'open';
    statusSel.className = `iv3-status-sel ${conv.status || 'open'}`;
    statusSel.style.display = '';
  }
}

// ── تغيير حالة المحادثة ─────────────────────────────────────

async function iv3ChangeStatus(newStatus) {
  if (!IV3.activeConvId) return;
  try {
    await IV3_API.changeStatus(IV3.activeConvId, newStatus);
    if (IV3.activeConv) IV3.activeConv.status = newStatus;

    // تحديث في القائمة
    iv3UpdateConvInList({ id: IV3.activeConvId, status: newStatus });

    // تحديث الـ selector class
    const sel = document.getElementById('iv3-status-sel');
    if (sel) sel.className = `iv3-status-sel ${newStatus}`;

    iv3Toast(`تم تغيير الحالة إلى: ${iv3StatusLabel(newStatus)}`, 'success');
  } catch (e) {
    iv3Toast(e.message, 'error');
  }
}

// ── تعيين لموظف ────────────────────────────────────────────

async function iv3AssignConv() {
  if (!IV3.activeConvId || !IV3.agents.length) return;

  // بناء قائمة الموظفين
  const options = IV3.agents.map(a =>
    `<option value="${a.id}">${iv3EscHtml(a.name)}</option>`
  ).join('');

  const html = `
    <div class="iv3-modal-overlay" id="iv3-assign-modal" onclick="iv3CloseModal('iv3-assign-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()">
        <div class="iv3-modal-title">تعيين لموظف</div>
        <select id="iv3-assign-select" class="iv3-modal-select">
          <option value="">— بدون تعيين —</option>
          ${options}
        </select>
        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-assign-modal')" class="iv3-modal-cancel">إلغاء</button>
          <button onclick="iv3ConfirmAssign()" class="iv3-modal-confirm">تأكيد</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

async function iv3ConfirmAssign() {
  const sel = document.getElementById('iv3-assign-select');
  const userId = sel?.value || null;
  try {
    await IV3_API.assignConv(IV3.activeConvId, userId);
    const agent = IV3.agents.find(a => a.id == userId);
    const name = agent?.name || null;

    if (IV3.activeConv) IV3.activeConv.assigned_to_id = userId;
    iv3UpdateConvInList({ id: IV3.activeConvId, assigned_to_name: name, assigned_to_id: userId });

    const assigned = document.getElementById('iv3-hdr-assigned');
    if (assigned) {
      assigned.textContent = name ? `👤 ${name}` : '';
      assigned.style.display = name ? '' : 'none';
    }

    iv3Toast(name ? `تم التعيين لـ ${name}` : 'تم إلغاء التعيين', 'success');
  } catch (e) {
    iv3Toast(e.message, 'error');
  }
  iv3CloseModal('iv3-assign-modal');
}

// ── حذف محادثة ─────────────────────────────────────────────

async function iv3DeleteConv() {
  if (!IV3.activeConvId) return;
  if (!confirm('هل تريد إغلاق هذه المحادثة؟')) return;

  try {
    // نغلق المحادثة بدل حذفها (endpoint الحذف غير موجود)
    await IV3_API.changeStatus(IV3.activeConvId, 'closed');
    if (IV3.activeConv) IV3.activeConv.status = 'closed';
    iv3UpdateConvInList({ id: IV3.activeConvId, status: 'closed' });
    iv3Toast('تم إغلاق المحادثة', 'success');
  } catch (e) {
    iv3Toast('فشل الإغلاق: ' + e.message, 'error');
  }
}

// ── إعادة الـ Chat للحالة الأولى ───────────────────────────

function iv3ResetChat() {
  // إعادة Context Panel
  if (typeof iv3ResetContextPanel === 'function') iv3ResetContextPanel();

  const reply = document.getElementById('iv3-reply');
  if (reply) reply.style.display = 'none';

  const actions = document.getElementById('iv3-hdr-actions');
  if (actions) actions.style.display = 'none';

  const statusSel = document.getElementById('iv3-status-sel');
  if (statusSel) statusSel.style.display = 'none';

  const name = document.getElementById('iv3-hdr-name');
  if (name) name.textContent = 'اختار محادثة';

  const msgsEl = document.getElementById('iv3-msgs');
  if (msgsEl) msgsEl.innerHTML = `
    <div class="iv3-msgs-empty" id="iv3-msgs-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <h3>اختار محادثة</h3>
      <p>اضغط على أي محادثة من القائمة على اليمين</p>
    </div>`;
}

// ── رجوع (موبايل) ───────────────────────────────────────────

function iv3BackToList() {
  document.getElementById('iv3-chat')?.classList.remove('visible');
  IV3.activeConvId = null;
}

// ── صفّر الـ Unread ─────────────────────────────────────────

function iv3ClearUnread(convId) {
  const conv = IV3.convs.find(c => c.id === convId);
  if (conv) conv.unread_count = 0;
  const item = document.querySelector(`.iv3-conv-item[data-id="${convId}"] .iv3-unread-dot`);
  if (item) item.remove();
}

// ── معاينة صورة ────────────────────────────────────────────

function iv3PreviewImg(url) {
  const html = `
    <div class="iv3-modal-overlay" id="iv3-img-modal" onclick="iv3CloseModal('iv3-img-modal')" style="z-index:9999;background:rgba(0,0,0,0.85)">
      <img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain">
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ── Helpers ─────────────────────────────────────────────────

function iv3DateLabel(ts) {
  if (!ts) return '';
  // sent_at هو الحقل الفعلي في inbox_messages
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function iv3FormatMsgTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function iv3StatusLabel(status) {
  const labels = { open: 'مفتوحة', waiting: 'انتظار', closed: 'مغلقة' };
  return labels[status] || status;
}

function iv3CloseModal(id) {
  document.getElementById(id)?.remove();
}

// ── Snooze ──────────────────────────────────────────────────

function iv3SnoozeConv() {
  if (!IV3.activeConvId) return;

  const options = [
    { label: 'في 30 دقيقة', mins: 30 },
    { label: 'في ساعة',     mins: 60 },
    { label: 'في 3 ساعات',  mins: 180 },
    { label: 'غداً',        mins: 1440 },
    { label: 'بعد أسبوع',   mins: 10080 },
  ];

  const btns = options.map(o =>
    `<button class="iv3-snooze-opt" onclick="iv3ConfirmSnooze(${o.mins})">${iv3EscHtml(o.label)}</button>`
  ).join('');

  const html = `
    <div class="iv3-modal-overlay" id="iv3-snooze-modal" onclick="iv3CloseModal('iv3-snooze-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:320px">
        <div class="iv3-modal-title">⏰ تأجيل المحادثة</div>
        <p style="font-size:12px;color:#6B7280;margin:0 0 12px">
          ستختفي المحادثة مؤقتاً وتعود تلقائياً بعد المدة المختارة
        </p>
        <div class="iv3-snooze-opts">${btns}</div>
        <div class="iv3-modal-actions" style="margin-top:12px">
          <button onclick="iv3CloseModal('iv3-snooze-modal')" class="iv3-modal-cancel">إلغاء</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

async function iv3ConfirmSnooze(minutes) {
  iv3CloseModal('iv3-snooze-modal');
  if (!IV3.activeConvId) return;

  try {
    const result = await IV3_API.snoozeConv(IV3.activeConvId, minutes);
    if (!result.ok) throw new Error(result.error || 'خطأ غير متوقع');

    // تحديث الحالة في الـ state
    if (IV3.activeConv) IV3.activeConv.status = 'snoozed';
    iv3UpdateConvInList({ id: IV3.activeConvId, status: 'snoozed' });

    // تحديث الـ selector
    const sel = document.getElementById('iv3-status-sel');
    if (sel) {
      // أضف option snoozed لو مش موجودة
      if (!sel.querySelector('option[value="snoozed"]')) {
        const opt = document.createElement('option');
        opt.value = 'snoozed';
        opt.textContent = '⏰ مؤجلة';
        sel.appendChild(opt);
      }
      sel.value = 'snoozed';
      sel.className = 'iv3-status-sel snoozed';
    }

    if (result.snoozed_until) {
      const wakeLabel = iv3FormatSnoozeTime(result.snoozed_until);
      iv3Toast(`⏰ تم التأجيل حتى ${wakeLabel}`, 'info');
    } else {
      iv3Toast('تم تأجيل المحادثة', 'info');
    }
  } catch (e) {
    iv3Toast('فشل التأجيل: ' + e.message, 'error');
  }
}

function iv3FormatSnoozeTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMin = Math.round((d - now) / 60000);
  if (diffMin < 60)   return `${diffMin} دقيقة`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)} ساعة`;
  return d.toLocaleDateString('ar-EG', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}
