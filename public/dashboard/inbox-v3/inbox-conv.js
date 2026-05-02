/**
 * inbox-conv.js — Areej Pro Inbox v3
 * قائمة المحادثات: تحميل، فلترة، render، Bulk Actions
 * آخر تحديث: 2026-05-02
 */

// ── تحميل المحادثات من الـ API ──────────────────────────────

async function iv3LoadConvs(reset = true) {
  if (IV3.loadingConvs) return;
  IV3.loadingConvs = true;

  if (reset) {
    IV3.convPage = 1;
    IV3.convs = [];
    iv3ShowConvSkeleton();
  }

  try {
    const data = await IV3_API.getConversations({
      platform: IV3.platform,
      status:   IV3.statusFilter,
      assigned: IV3.agentFilter,
      search:   IV3.searchQuery,
      page:     IV3.convPage,
      limit:    IV3.convPageSize,
    });

    const list = data.conversations || data || [];
    IV3.convHasMore = list.length >= IV3.convPageSize;

    if (reset) {
      IV3.convs = list;
    } else {
      IV3.convs = [...IV3.convs, ...list];
    }

    iv3RenderConvs();
    iv3UpdateCount();

  } catch (e) {
    iv3ShowConvError(e.message);
  } finally {
    IV3.loadingConvs = false;
  }
}

// ── تطبيق الفلاتر المحلية وإعادة الرسم ─────────────────────

function iv3FilterConvs() {
  const q = (document.getElementById('iv3-search')?.value || '').trim().toLowerCase();
  IV3.searchQuery = q;

  // بحث محلي سريع + إعادة تحميل من الـ API
  clearTimeout(IV3._searchTimer);
  IV3._searchTimer = setTimeout(() => iv3LoadConvs(true), 400);
}

function iv3SetStatusFilter(status, btn) {
  IV3.statusFilter = status;
  document.querySelectorAll('.iv3-filt').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  iv3LoadConvs(true);
}

function iv3SwitchPlatform(plat, btn) {
  IV3.platform = plat;
  document.querySelectorAll('.iv3-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  iv3LoadConvs(true);
}

function iv3SetAgentFilter(val) {
  IV3.agentFilter = val;
  iv3LoadConvs(true);
}

// ── Render القائمة ──────────────────────────────────────────

function iv3RenderConvs() {
  const container = document.getElementById('iv3-conv-list');
  if (!container) return;

  // إخفاء الـ skeleton
  const sk = document.getElementById('iv3-conv-skeleton');
  if (sk) sk.style.display = 'none';

  if (!IV3.convs.length) {
    container.innerHTML = `
      <div class="iv3-conv-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>لا توجد محادثات</p>
      </div>`;
    return;
  }

  const items = IV3.convs.map(c => iv3BuildConvItem(c)).join('');
  const loadMore = IV3.convHasMore
    ? `<div class="iv3-load-more" onclick="iv3LoadMore()">تحميل المزيد...</div>`
    : '';

  container.innerHTML = items + loadMore;
}

function iv3BuildConvItem(c) {
  const isActive  = c.id === IV3.activeConvId;
  const platIcon  = iv3PlatIcon(c.platform);
  const displayName = iv3CleanSenderDisplay(c.sender_name, c.sender_id);
  const initials  = iv3Initials(displayName || '?');
  const color     = iv3AvatarColor(c.sender_id || c.id);
  const timeStr   = iv3FormatTime(c.last_message_at || c.updated_at);
  const lastMsg   = iv3EscHtml(iv3TruncText(c.last_message || '...', 45));
  const unread    = c.unread_count > 0
    ? `<span class="iv3-unread-dot">${c.unread_count > 99 ? '99+' : c.unread_count}</span>`
    : '';
  const statusCls = `iv3-status-${c.status || 'open'}`;

  // التسميات
  const labelDots = (c.labels || []).slice(0, 3).map(l =>
    `<span class="iv3-label-dot" style="background:${l.color || '#9CA3AF'}" title="${iv3EscHtml(l.name)}"></span>`
  ).join('');

  const isSelected = IV3.selectedIds.has(c.id);
  const checkHtml  = IV3.bulkMode
    ? `<div class="iv3-conv-check ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation();iv3ToggleSelect(${c.id})"></div>`
    : '';

  return `
    <div class="iv3-conv-item ${isActive ? 'active' : ''} ${statusCls} ${isSelected ? 'bulk-selected' : ''}"
         data-id="${c.id}"
         data-status="${c.status || 'open'}"
         onclick="iv3ConvItemClick(event, ${c.id})">
      ${checkHtml}
      <div class="iv3-conv-avatar" style="background:${color}">
        ${initials}
        <span class="iv3-plat-icon">${platIcon}</span>
      </div>
      <div class="iv3-conv-body">
        <div class="iv3-conv-row1">
          <span class="iv3-conv-name">${iv3EscHtml(displayName || 'مجهول')}</span>
          <span class="iv3-conv-time">${timeStr}</span>
        </div>
        <div class="iv3-conv-row2">
          <span class="iv3-conv-preview">${lastMsg}</span>
          <div class="iv3-conv-badges">
            ${labelDots}
            ${unread}
          </div>
        </div>
      </div>
    </div>`;
}

// ── تحميل المزيد (Infinite Scroll) ─────────────────────────

async function iv3LoadMore() {
  IV3.convPage++;
  await iv3LoadConvs(false);
}

// ── تحديث عداد المحادثات ───────────────────────────────────

function iv3UpdateCount() {
  const el = document.getElementById('iv3-conv-count');
  if (el) el.textContent = IV3.convs.length + (IV3.convHasMore ? '+' : '');
}

// ── تحديث محادثة واحدة في القائمة (بدون reload كامل) ────────

function iv3UpdateConvInList(updatedConv) {
  const idx = IV3.convs.findIndex(c => c.id === updatedConv.id);
  if (idx === -1) {
    IV3.convs.unshift(updatedConv); // جديدة — أضفها في الأول
  } else {
    IV3.convs[idx] = { ...IV3.convs[idx], ...updatedConv };
    // نقلها للأول لو عندها رسالة جديدة
    if (updatedConv.last_message_at) {
      const conv = IV3.convs.splice(idx, 1)[0];
      IV3.convs.unshift(conv);
    }
  }
  iv3RenderConvs();
}

// ── حالات خاصة ─────────────────────────────────────────────

function iv3ShowConvSkeleton() {
  const sk = document.getElementById('iv3-conv-skeleton');
  if (sk) sk.style.display = 'block';
  const list = document.getElementById('iv3-conv-list');
  if (list) list.innerHTML = `<div id="iv3-conv-skeleton">
    ${[1,2,3].map(() => `
      <div class="iv3-skeleton-item">
        <div class="iv3-skeleton iv3-skeleton-avatar"></div>
        <div class="iv3-skeleton-body">
          <div class="iv3-skeleton iv3-skeleton-line w70"></div>
          <div class="iv3-skeleton iv3-skeleton-line w50"></div>
        </div>
      </div>`).join('')}
  </div>`;
}

function iv3ShowConvError(msg) {
  const container = document.getElementById('iv3-conv-list');
  if (container) container.innerHTML = `
    <div class="iv3-conv-empty" style="color:#EF4444">
      <p>⚠️ ${iv3EscHtml(msg)}</p>
      <button onclick="iv3LoadConvs(true)" style="margin-top:8px;padding:6px 14px;border-radius:6px;border:1px solid #EF4444;color:#EF4444;background:transparent;cursor:pointer">إعادة المحاولة</button>
    </div>`;
}

// ── Helpers ─────────────────────────────────────────────────

function iv3PlatIcon(platform) {
  const icons = {
    'whatsapp-qr': '📱',
    'whatsapp':    '💬',
    'telegram':    '✈️',
    'messenger':   '💙',
    'instagram':   '📸',
  };
  return icons[platform] || '💬';
}

/**
 * تنظيف sender_name/sender_id للعرض — يزيل @lid / @c.us / @s.whatsapp.net
 * لو كان اسم حقيقي موجود يرجعه، وإلا يعرض رقم الهاتف أو نص افتراضي
 */
function iv3CleanSenderDisplay(name, id) {
  if (name) {
    // لو فيه @ يعني الاسم هو JID برده — نستخرج الرقم
    if (name.includes('@lid')) return id ? iv3JidToPhone(id) || 'مجهول' : 'مجهول';
    if (name.includes('@c.us') || name.includes('@s.whatsapp')) return iv3JidToPhone(name) || name.split('@')[0];
    return name; // اسم حقيقي
  }
  if (id) return iv3JidToPhone(id) || id.split('@')[0] || 'مجهول';
  return 'مجهول';
}

/** تحويل JID لرقم هاتف مقروء */
function iv3JidToPhone(jid) {
  if (!jid) return null;
  const num = jid.split('@')[0];
  if (!num || !/^\d+$/.test(num)) return null; // @lid بيكون بحروف قد تكون non-digit أحياناً
  if (num.length < 7) return null;  // رقم صغير جداً = ليس رقم هاتف
  return '+' + num;
}

function iv3Initials(name) {
  const parts = String(name).trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).trim().substring(0, 2).toUpperCase();
}

function iv3AvatarColor(seed) {
  const colors = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16'];
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) % colors.length;
  return colors[Math.abs(h) % colors.length];
}

function iv3FormatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'الآن';
  if (diff < 3600)  return `${Math.floor(diff/60)}د`;
  if (diff < 86400) return `${Math.floor(diff/3600)}س`;
  if (diff < 604800) return `${Math.floor(diff/86400)}ي`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function iv3TruncText(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function iv3EscHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Bulk Actions ────────────────────────────────────────────

// نقطة الدخول لضغطة على conv item
function iv3ConvItemClick(e, convId) {
  if (IV3.bulkMode) {
    iv3ToggleSelect(convId);
  } else {
    iv3OpenConv(convId);
  }
}

// تشغيل/إيقاف وضع التحديد
function iv3ToggleBulkMode() {
  IV3.bulkMode = !IV3.bulkMode;
  if (!IV3.bulkMode) {
    IV3.selectedIds.clear();
    iv3HideBulkBar();
  } else {
    iv3ShowBulkBar();
  }
  iv3RenderConvs();

  // تحديث زر التحديد في الـ sidebar
  const btn = document.getElementById('iv3-bulk-toggle');
  if (btn) btn.classList.toggle('active', IV3.bulkMode);
}

// تحديد / إلغاء تحديد محادثة
function iv3ToggleSelect(convId) {
  if (IV3.selectedIds.has(convId)) {
    IV3.selectedIds.delete(convId);
  } else {
    IV3.selectedIds.add(convId);
  }
  iv3UpdateBulkBar();
  iv3RenderConvs();
}

// تحديد الكل / إلغاء الكل
function iv3SelectAll() {
  const allSelected = IV3.convs.every(c => IV3.selectedIds.has(c.id));
  if (allSelected) {
    IV3.selectedIds.clear();
  } else {
    IV3.convs.forEach(c => IV3.selectedIds.add(c.id));
  }
  iv3UpdateBulkBar();
  iv3RenderConvs();
}

// تحديث شريط Bulk
function iv3ShowBulkBar() {
  const bar = document.getElementById('iv3-bulk-bar');
  if (bar) bar.style.display = 'flex';
  iv3UpdateBulkBar();
}

function iv3HideBulkBar() {
  const bar = document.getElementById('iv3-bulk-bar');
  if (bar) bar.style.display = 'none';
}

function iv3UpdateBulkBar() {
  const count = IV3.selectedIds.size;
  const label = document.getElementById('iv3-bulk-count');
  if (label) label.textContent = count > 0 ? `${count} محادثة` : 'لا يوجد تحديد';

  // تفعيل/تعطيل أزرار الإجراء
  const btns = document.querySelectorAll('.iv3-bulk-action-btn');
  btns.forEach(b => b.disabled = count === 0);
}

// ── تنفيذ الإجراءات الجماعية ──────────────────────────────

async function iv3BulkClose() {
  const ids = [...IV3.selectedIds];
  if (!ids.length) return;
  if (!confirm(`إغلاق ${ids.length} محادثة؟`)) return;
  await iv3RunBulkAction(ids, 'close', {}, `تم إغلاق ${ids.length} محادثة`);
}

async function iv3BulkOpen() {
  const ids = [...IV3.selectedIds];
  if (!ids.length) return;
  await iv3RunBulkAction(ids, 'open', {}, `تم فتح ${ids.length} محادثة`);
}

async function iv3BulkAssign() {
  const ids = [...IV3.selectedIds];
  if (!ids.length || !IV3.agents.length) {
    if (!IV3.agents.length) iv3Toast('لا يوجد موظفين للتعيين', 'warning');
    return;
  }

  const options = IV3.agents.map(a =>
    `<option value="${a.id}">${iv3EscHtml(a.name)}</option>`
  ).join('');

  const html = `
    <div class="iv3-modal-overlay" id="iv3-bulk-assign-modal" onclick="iv3CloseModal('iv3-bulk-assign-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()">
        <div class="iv3-modal-title">تعيين ${ids.length} محادثة</div>
        <select id="iv3-bulk-assign-sel" class="iv3-modal-select">
          <option value="">— بدون تعيين —</option>
          ${options}
        </select>
        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-bulk-assign-modal')" class="iv3-modal-cancel">إلغاء</button>
          <button onclick="iv3ConfirmBulkAssign()" class="iv3-modal-confirm">تأكيد</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function iv3ConfirmBulkAssign() {
  const sel = document.getElementById('iv3-bulk-assign-sel');
  const userId   = sel?.value ? Number(sel.value) : null;
  const agent    = IV3.agents.find(a => a.id == userId);
  const userName = agent?.name || null;
  iv3CloseModal('iv3-bulk-assign-modal');
  const ids = [...IV3.selectedIds];
  await iv3RunBulkAction(ids, 'assign', { user_id: userId, user_name: userName },
    userName ? `تم التعيين لـ ${userName}` : 'تم إلغاء التعيين');
}

async function iv3RunBulkAction(ids, action, payload, successMsg) {
  try {
    const result = await IV3_API.bulkAction(ids, action, payload);
    iv3Toast(successMsg, 'success');
    // تحديث القائمة محلياً
    ids.forEach(id => {
      const updates = {};
      if (action === 'close')    updates.status = 'closed';
      if (action === 'open')     updates.status = 'open';
      if (action === 'waiting')  updates.status = 'waiting';
      if (action === 'assign')   { updates.assigned_to_id = payload.user_id; updates.assigned_to_name = payload.user_name; }
      iv3UpdateConvInList({ id, ...updates });
    });
    // خروج من bulk mode بعد التنفيذ
    IV3.bulkMode = false;
    IV3.selectedIds.clear();
    iv3HideBulkBar();
    iv3RenderConvs();
    const btn = document.getElementById('iv3-bulk-toggle');
    if (btn) btn.classList.remove('active');
  } catch(e) {
    iv3Toast('فشل التنفيذ: ' + e.message, 'error');
  }
}
