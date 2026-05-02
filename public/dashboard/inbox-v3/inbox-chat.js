/**
 * inbox-chat.js — Areej Pro Inbox v3
 * Chat window: فتح محادثة، تحميل الرسائل، render
 * آخر تحديث: 2026-05-02
 */

// ── فتح محادثة ─────────────────────────────────────────────

async function iv3OpenConv(convId) {
  if (IV3.activeConvId === convId) return;
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
    const data = await IV3_API.getMessages(convId);
    IV3.messages = Array.isArray(data) ? data : (data.messages || []);
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

  if (!IV3.messages.length) {
    container.innerHTML = `<div class="iv3-msgs-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>لا توجد رسائل بعد</p>
    </div>`;
    return;
  }

  let html = '';
  let lastDate = null;

  IV3.messages.forEach((msg, i) => {
    // فاصل التاريخ
    const msgDate = iv3DateLabel(msg.created_at);
    if (msgDate !== lastDate) {
      html += `<div class="iv3-date-sep"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }

    html += iv3BuildMsgBubble(msg);
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
  const time   = iv3FormatMsgTime(msg.created_at);
  const senderName = isOut ? (IV3.me?.name || 'أنت') : (IV3.activeConv?.sender_name || '');

  let content = '';

  if (msg.media_url || msg.file_id) {
    content = iv3BuildMediaContent(msg);
  } else {
    content = `<div class="iv3-msg-text">${iv3EscHtml(msg.message || msg.content || '').replace(/\n/g, '<br>')}</div>`;
  }

  const statusIcon = isOut ? iv3MsgStatusIcon(msg.status) : '';

  return `
    <div class="iv3-msg-wrap ${isOut ? 'out' : 'in'} ${isNote ? 'note' : ''}">
      ${!isOut ? `<div class="iv3-msg-sender-name">${iv3EscHtml(senderName)}</div>` : ''}
      ${isNote ? '<div class="iv3-note-label">🔒 ملاحظة داخلية</div>' : ''}
      <div class="iv3-msg-bubble">
        ${content}
        <div class="iv3-msg-meta">
          <span class="iv3-msg-time">${time}</span>
          ${statusIcon}
        </div>
      </div>
    </div>`;
}

function iv3BuildMediaContent(msg) {
  const url = msg.media_url || `/api/system/inbox/media-proxy/${msg.id}`;
  const mimeType = msg.mime_type || '';

  if (mimeType.startsWith('image/')) {
    return `<img class="iv3-msg-img" src="${url}" onclick="iv3PreviewImg('${url}')" loading="lazy">`;
  }
  if (mimeType.startsWith('video/')) {
    return `<video class="iv3-msg-video" controls src="${url}"></video>`;
  }
  if (mimeType.startsWith('audio/')) {
    return `<audio class="iv3-msg-audio" controls src="${url}"></audio>`;
  }
  // ملف عام
  const fname = msg.file_name || 'ملف مرفق';
  return `<a class="iv3-msg-file" href="${url}" target="_blank" download>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    ${iv3EscHtml(fname)}
  </a>`;
}

function iv3MsgStatusIcon(status) {
  if (status === 'sent')      return '<span class="iv3-tick">✓</span>';
  if (status === 'delivered') return '<span class="iv3-tick">✓✓</span>';
  if (status === 'read')      return '<span class="iv3-tick read">✓✓</span>';
  if (status === 'failed')    return '<span class="iv3-tick failed">✗</span>';
  return '<span class="iv3-tick pending">○</span>';
}

// ── تحديث الـ Header ────────────────────────────────────────

function iv3UpdateChatHeader(conv) {
  const name     = document.getElementById('iv3-hdr-name');
  const avatar   = document.getElementById('iv3-hdr-avatar');
  const platEl   = document.getElementById('iv3-hdr-plat');
  const assigned = document.getElementById('iv3-hdr-assigned');
  const statusSel = document.getElementById('iv3-status-sel');

  if (name) name.textContent = conv.sender_name || conv.sender_id || 'مجهول';

  if (avatar) {
    const color = iv3AvatarColor(conv.sender_id || conv.id);
    const init  = iv3Initials(conv.sender_name || conv.sender_id || '?');
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
  if (!confirm('هل تريد حذف هذه المحادثة؟')) return;

  try {
    await fetch(`/api/system/inbox/conversations/${IV3.activeConvId}`, { method: 'DELETE' });
    IV3.convs = IV3.convs.filter(c => c.id !== IV3.activeConvId);
    IV3.activeConvId = null;
    IV3.activeConv = null;
    iv3RenderConvs();
    iv3ResetChat();
    iv3Toast('تم حذف المحادثة', 'success');
  } catch (e) {
    iv3Toast(e.message, 'error');
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
