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
    // تحويل labelFilter لـ API params
    const lf = IV3.labelFilter || 'all';
    const apiParams = {
      platform: IV3.platform,
      status:   IV3.statusFilter,
      search:   IV3.searchQuery,
      from:     IV3.dateFrom,
      to:       IV3.dateTo,
      page:     IV3.convPage,
      limit:    IV3.convPageSize,
    };
    if (lf === 'mine')        apiParams.assigned = 'me';
    else if (lf === 'unassigned') apiParams.assigned = 'unassigned';
    else if (lf !== 'all')    apiParams.label_id = lf;  // رقم الـ label
    // agentFilter من الـ dropdown يطغى على labelFilter assigned
    if (IV3.agentFilter) apiParams.assigned = IV3.agentFilter;

    const data = await IV3_API.getConversations(apiParams);

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
  const q = (document.getElementById('iv3-search')?.value || '').trim();
  IV3.searchQuery = q;

  clearTimeout(IV3._searchTimer);
  IV3._searchTimer = setTimeout(() => iv3LoadConvs(true), 400);
}

// ── Deep Search Panel ───────────────────────────────────────────────────────────

let _iv3DeepSearchTimer = null;

function iv3OpenDeepSearch() {
  const panel = document.getElementById('iv3-deep-search-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  setTimeout(() => document.getElementById('iv3-deep-q')?.focus(), 80);
}

function iv3CloseDeepSearch() {
  const panel = document.getElementById('iv3-deep-search-panel');
  if (panel) panel.style.display = 'none';
  const results = document.getElementById('iv3-deep-results');
  if (results) results.innerHTML = '';
}

function iv3DeepSearchInput(el) {
  clearTimeout(_iv3DeepSearchTimer);
  const q = el.value.trim();
  if (q.length < 2) {
    const results = document.getElementById('iv3-deep-results');
    if (results) results.innerHTML = '<div class="iv3-deep-empty">اكتب كلمتين على الأقل...</div>';
    return;
  }
  _iv3DeepSearchTimer = setTimeout(() => iv3RunDeepSearch(q), 350);
}

async function iv3RunDeepSearch(q) {
  const results = document.getElementById('iv3-deep-results');
  const platform = document.getElementById('iv3-deep-platform')?.value || '';
  const type     = document.getElementById('iv3-deep-type')?.value     || 'all';
  if (!results) return;

  results.innerHTML = '<div class="iv3-deep-loading"><div class="iv3-spinner-sm"></div> جاري البحث...</div>';

  try {
    const data = await IV3_API.search(q, { platform, type, limit: 25 });
    if (!data.ok) throw new Error(data.error || 'فشل البحث');
    iv3RenderDeepResults(data.results, q);
  } catch(e) {
    results.innerHTML = `<div class="iv3-deep-empty" style="color:#ef4444">❌ ${iv3EscHtml(e.message)}</div>`;
  }
}

function iv3RenderDeepResults(res, q) {
  const el = document.getElementById('iv3-deep-results');
  if (!el) return;

  const msgs  = res.messages       || [];
  const convs = res.conversations   || [];
  const total = res.total           || 0;

  if (!total) {
    el.innerHTML = '<div class="iv3-deep-empty">لا توجد نتائج لـ "' + iv3EscHtml(q) + '"</div>';
    return;
  }

  // Helper: highlight الكلمة في النص
  function hl(text) {
    if (!text) return '';
    const escaped = iv3EscHtml(text);
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
    return escaped.replace(re, '<mark class="iv3-deep-hl">$1</mark>');
  }

  let html = `<div class="iv3-deep-summary">${total} نتيجة — ${msgs.length} رسالة ، ${convs.length} محادثة</div>`;

  // قسم المحادثات (اسم/ID)
  if (convs.length) {
    html += '<div class="iv3-deep-section-title">💬 محادثات</div>';
    html += convs.map(c => `
      <div class="iv3-deep-item iv3-deep-conv" onclick="iv3CloseDeepSearch();iv3OpenConv(${c.id})">
        <div class="iv3-deep-item-top">
          <span class="iv3-deep-name">${hl(c.sender_name || c.sender_id)}</span>
          <span class="iv3-deep-plat">${iv3PlatBadge(c.platform)}</span>
        </div>
        ${c.last_message ? `<div class="iv3-deep-preview">${hl(iv3TruncText(c.last_message, 80))}</div>` : ''}
      </div>`).join('');
  }

  // قسم الرسائل (محتوى)
  if (msgs.length) {
    html += '<div class="iv3-deep-section-title">📝 رسائل</div>';
    html += msgs.map(m => {
      const dir   = m.direction === 'out' ? '→ صادرة' : '← واردة';
      const time  = m.sent_at ? new Date(m.sent_at).toLocaleDateString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      return `
      <div class="iv3-deep-item iv3-deep-msg" onclick="iv3CloseDeepSearch();iv3OpenConv(${m.conversation_id})">
        <div class="iv3-deep-item-top">
          <span class="iv3-deep-name">${hl(m.sender_name || m.sender_id || '?')}</span>
          <span class="iv3-deep-meta">${iv3PlatBadge(m.platform)} ${iv3EscHtml(dir)}</span>
          <span class="iv3-deep-time">${iv3EscHtml(time)}</span>
        </div>
        <div class="iv3-deep-snippet">${hl(m.snippet || m.content || '')}</div>
      </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

function iv3SetStatusFilter(status, btn) {
  IV3.statusFilter = status;
  document.querySelectorAll('.iv3-filt').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  iv3LoadConvs(true);
}

function iv3SwitchPlatform(plat, btn) {
  IV3.platform = plat;
  // legacy tab support
  document.querySelectorAll('.iv3-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  iv3LoadConvs(true);
}

// ── Platform Dropdown (جديد) ───────────────────────────────────

const IV3_PLAT_MAP = {
  '':             { icon: '💬', label: 'الكل' },
  'whatsapp-qr':  { icon: '📱', label: 'واتساب QR' },
  'whatsapp':     { icon: '💬', label: 'واتساب API' },
  'telegram':     { icon: '✈️',  label: 'تيليجرام' },
  'messenger':    { icon: '💙', label: 'ماسنجر' },
  'instagram':    { icon: '📸', label: 'إنستجرام' },
};

function iv3TogglePlatDropdown() {
  const dd = document.getElementById('iv3-plat-dropdown');
  const btn = document.getElementById('iv3-plat-sel-btn');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('open', !isOpen);
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', iv3ClosePlatDropdown, { once: true }), 10);
  }
}

function iv3ClosePlatDropdown() {
  const dd = document.getElementById('iv3-plat-dropdown');
  const btn = document.getElementById('iv3-plat-sel-btn');
  if (dd) dd.style.display = 'none';
  if (btn) btn.classList.remove('open');
}

function iv3PickPlatform(plat, icon, label, el) {
  IV3.platform = plat;
  // تحديث الزر
  const iconEl  = document.getElementById('iv3-plat-sel-icon');
  const labelEl = document.getElementById('iv3-plat-sel-label');
  if (iconEl)  iconEl.textContent  = icon;
  if (labelEl) labelEl.textContent = label;
  // تحديث active
  document.querySelectorAll('.iv3-plat-opt').forEach(o => o.classList.remove('active'));
  if (el) el.classList.add('active');
  iv3ClosePlatDropdown();
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

  // تحديث badge المحادثات المؤجلة
  iv3UpdateSnoozeBadge();
}

function iv3BuildConvItem(c) {
  // guard — لو IV3 أو selectedIds لست جاهزين بعد
  if (!IV3 || !(IV3.selectedIds instanceof Set)) {
    if (IV3 && !IV3.selectedIds) IV3.selectedIds = new Set();
    else return '';
  }
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

  // التسميات — دوائر صغيرة جنب البادج + chips أسفل الاسم
  const convLabels = c._labels || c.labels || [];
  const labelDots = convLabels.slice(0, 3).map(l =>
    `<span class="iv3-label-dot" style="background:${l.color || '#9CA3AF'}" title="${iv3EscHtml(l.name)}"></span>`
  ).join('');
  const labelChips = convLabels.length > 0
    ? `<div class="iv3-conv-label-chips iv3-conv-label-chips-wrap">${
        convLabels.slice(0,3).map(l =>
          `<span class="iv3-label-chip" style="background:${l.color||'#1B5E30'}22;color:${l.color||'#1B5E30'};border-color:${l.color||'#1B5E30'}44">${iv3EscHtml(l.name)}</span>`
        ).join('')
      }</div>`
    : `<div class="iv3-conv-label-chips-wrap" data-conv-id="${c.id}"></div>`;

  const isSelected = IV3.selectedIds.has(c.id);
  const checkHtml  = IV3.bulkMode
    ? `<div class="iv3-conv-check ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation();iv3ToggleSelect(${c.id})"></div>`
    : '';

  return `
    <div class="iv3-conv-item ${isActive ? 'active' : ''} ${statusCls} ${isSelected ? 'bulk-selected' : ''}"
         data-id="${c.id}"
         data-conv-id="${c.id}"
         data-status="${c.status || 'open'}"
         onclick="iv3ConvItemClick(event, ${c.id})">
      ${checkHtml}
      <div class="iv3-conv-avatar" style="background:${color}">
        ${initials}
        <span class="iv3-plat-icon">${platIcon}</span>
      </div>
      <div class="iv3-conv-body">
        <div class="iv3-conv-row1">
          ${iv3PlatBadge(c.platform)}<span class="iv3-conv-name">${iv3EscHtml(displayName || 'مجهول')}</span>
          <span class="iv3-conv-time" data-ts="${c.last_message_at || c.updated_at || ''}" title="${iv3RelativeTimeFull(c.last_message_at || c.updated_at)}">${timeStr}</span>
        </div>
        <div class="iv3-conv-row2">
          <span class="iv3-conv-preview">${lastMsg}</span>
          <div class="iv3-conv-badges">
            ${labelDots}
            ${unread}
          </div>
        </div>
        ${labelChips}
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

/** Badge SVG ملون حسب المنصة */
function iv3PlatBadge(platform) {
  const map = {
    'whatsapp-qr': { cls: 'wa-qr',     svg: '<path d="M17.5 3.5A12 12 0 0 0 2.9 18.1L2 22l4-1a12 12 0 1 0 11.5-17.5zm0 16.5c-1.2.7-2.5 1-3.8 1a10 10 0 0 1-8.5-15.2l.5-.8L4.4 3l1.2.4A10 10 0 0 1 17.5 20z" fill="currentColor"/>' },
    'whatsapp':    { cls: 'wa-api',    svg: '<path d="M17.5 3.5A12 12 0 0 0 2.9 18.1L2 22l4-1a12 12 0 1 0 11.5-17.5z" fill="currentColor"/>' },
    'telegram':    { cls: 'telegram',  svg: '<path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" fill="none"/>' },
    'messenger':   { cls: 'messenger', svg: '<path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.8 1.3 5.3 3.4 7L5 22l3.9-2c1 .3 2 .4 3.1.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2z" fill="currentColor"/>' },
    'instagram':   { cls: 'instagram', svg: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none"/>' },
  };
  const p = map[platform];
  if (!p) return `<span class="iv3-plat-badge unknown" title="${platform}">?</span>`;
  return `<span class="iv3-plat-badge ${p.cls}" title="${platform}">
    <svg width="10" height="10" viewBox="0 0 24 24">${p.svg}</svg>
  </span>`;
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
  const str = String(name || '').trim();
  if (!str || str === '?' || str === 'مجهول') return '?';
  // لو رقم تليفون خذ آخر رقمين
  if (/^\+?\d+$/.test(str.replace(/\s/g,''))) {
    const digits = str.replace(/\D/g,'');
    return digits.slice(-2);
  }
  // Array.from يدعم Unicode / عربي
  const chars = Array.from(str);
  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (Array.from(parts[0])[0] + Array.from(parts[1])[0]).toUpperCase();
  }
  return (Array.from(parts[0] || str)[0] || '?').toUpperCase();
}

function iv3AvatarColor(seed) {
  const colors = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16'];
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) % colors.length;
  return colors[Math.abs(h) % colors.length];
}

// iv3FormatTime — تستخدم iv3RelativeTime من inbox-state.js
function iv3FormatTime(ts) {
  return iv3RelativeTime(ts);
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

// إرسال رسالة جماعية
async function iv3BulkMessage() {
  const ids = [...IV3.selectedIds];
  if (!ids.length) return;

  // معرفة المنصات المحددة
  const platforms = [...new Set(
    ids.map(id => IV3.convs.find(c => c.id === id)?.platform).filter(Boolean)
  )];
  const platLabel = platforms.length
    ? platforms.map(p => ({
        'telegram': '✈️ تيليجرام',
        'whatsapp-qr': '📱 واتساب QR',
        'whatsapp': '💬 واتساب API'
      }[p] || p)).join(' ، ')
    : '';

  let modal = document.getElementById('iv3-bulk-msg-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'iv3-bulk-msg-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px;width:100%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,.18)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-size:22px">📤</span>
        <div>
          <div style="font-weight:700;font-size:15px;color:#111">إرسال رسالة جماعية</div>
          <div style="font-size:12px;color:#6b7280">لـ ${ids.length} محادثة — ${iv3EscHtml(platLabel)}</div>
        </div>
        <button onclick="iv3CloseBulkMsgModal()" style="margin-right:auto;background:none;border:none;font-size:18px;color:#9ca3af;cursor:pointer">✕</button>
      </div>

      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#854d0e">
        ⚠️ <strong>تنبيه:</strong> سيتم إرسال الرسالة لجميع المحادثات المحددة. للواتساب API تأكد من وجود نافذة محادثة مفتوحة (24h).
      </div>

      <textarea id="iv3-bulk-msg-text"
        placeholder="اكتب الرسالة هنا..."
        rows="4"
        style="width:100%;box-sizing:border-box;border:1.5px solid #d1d5db;border-radius:8px;padding:10px 12px;
               font-size:14px;font-family:Cairo,sans-serif;outline:none;resize:vertical;min-height:90px"
        onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#d1d5db'"
        oninput="document.getElementById('iv3-bulk-msg-charcount').textContent=this.value.length"
      ></textarea>
      <div style="text-align:left;font-size:11px;color:#9ca3af;margin-top:3px">
        <span id="iv3-bulk-msg-charcount">0</span> حرف
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button onclick="iv3CloseBulkMsgModal()" style="padding:8px 16px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-family:Cairo,sans-serif;font-size:13px;cursor:pointer">إلغاء</button>
        <button id="iv3-bulk-msg-send-btn" onclick="iv3ConfirmBulkMessage(${ids.length})" style="padding:8px 18px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-family:Cairo,sans-serif;font-size:13px;font-weight:600;cursor:pointer">📤 إرسال لـ ${ids.length}</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('iv3-bulk-msg-text')?.focus(), 100);
}

function iv3CloseBulkMsgModal() {
  const modal = document.getElementById('iv3-bulk-msg-modal');
  if (modal) modal.style.display = 'none';
}

async function iv3ConfirmBulkMessage(count) {
  const textarea = document.getElementById('iv3-bulk-msg-text');
  const message  = textarea?.value?.trim();
  if (!message) { iv3Toast('الرسالة فارغة', 'warning'); return; }

  const ids  = [...IV3.selectedIds];
  const btn  = document.getElementById('iv3-bulk-msg-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }

  iv3CloseBulkMsgModal();
  iv3Toast(`جاري إرسال الرسالة لـ ${count} محادثة...`, 'info');

  try {
    const res = await IV3_API.bulkMessage(ids, message);
    const msg = res.failed
      ? `✅ أرسل لـ ${res.sent} ، فشل ${res.failed}`
      : `✅ تم الإرسال لـ ${res.sent} محادثة`;
    iv3Toast(msg, res.failed ? 'warning' : 'success');
  } catch(e) {
    iv3Toast('فشل الإرسال: ' + e.message, 'error');
  }

  // خروج من bulk mode
  IV3.bulkMode = false;
  IV3.selectedIds.clear();
  iv3HideBulkBar();
  iv3RenderConvs();
  const toggleBtn = document.getElementById('iv3-bulk-toggle');
  if (toggleBtn) toggleBtn.classList.remove('active');
}

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

// ══════════════════════════════════════════════════════════════════
// NEW CONVERSATION MODAL
// ══════════════════════════════════════════════════════════════════

const IV3_NEW_CONV_PLATFORMS = {
  'whatsapp-qr': { label: '📱 واتساب QR',    placeholder: 'رقم الهاتف (مثال: 201012345678)',  hint: 'رقم دولي بدون +' },
  'whatsapp':    { label: '📲 واتساب API',   placeholder: 'رقم الهاتف (مثال: 201012345678)',  hint: 'رقم دولي بدون + — يستخدم Template Message' },
  'telegram':    { label: '✈️ تيليجرام',     placeholder: 'Chat ID أو @username',              hint: 'مثال: 123456789 أو @username' },
  'instagram':   { label: '📸 إنستجرام',    placeholder: 'Instagram User ID (رقم فقط)',        hint: 'لازم المستخدم يبدأ المحادثة أولاً — فقط للـ Replies' },
  'messenger':   { label: '💬 ماسنجر',      placeholder: 'Page-Scoped User ID (PSID)',         hint: 'PSID من webhook — لازم المستخدم يبدأ المحادثة أولاً' },
};

// Smart Default: يحدد المنصة الافتراضية بناءً على ما هو مفعّل في الإعدادات
function iv3GetDefaultPlatform() {
  // يحاول يقرأ الحالة من data attributes موجودة في DOM
  const s = window._iv3Settings || {};
  if (s.wa_active && s.wa_phone_id)   return 'whatsapp';
  if (s.wa_qr_active)                  return 'whatsapp-qr';
  if (s.telegram_active)               return 'telegram';
  if (s.ig_active)                     return 'instagram';
  if (s.meta_active)                   return 'messenger';
  return 'whatsapp-qr'; // fallback
}

async function iv3OpenNewConvModal() {
  const modal = document.getElementById('iv3-new-conv-modal');
  if (!modal) return;

  // جلب الـ settings لو مش محملة (Smart Default)
  if (!window._iv3Settings) {
    try {
      const sd = await apiFetch('/api/system/inbox/settings');
      if (sd) window._iv3Settings = sd;
    } catch(e) { /* نكمل بدون */ }
  }

  // بناء أزرار المنصات
  const btns = document.getElementById('iv3-new-plat-btns');
  if (btns) {
    btns.innerHTML = Object.entries(IV3_NEW_CONV_PLATFORMS).map(([k, v]) =>
      `<button onclick="iv3SelectNewConvPlat('${k}',this)"
        style="padding:7px 14px;border:1.5px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:Cairo,sans-serif;transition:all .15s"
        data-plat="${k}">${v.label}</button>`
    ).join('');
  }

  // reset
  const recip = document.getElementById('iv3-new-recipient');
  const msg   = document.getElementById('iv3-new-message');
  const tpl   = document.getElementById('iv3-new-template');
  const tplN  = document.getElementById('iv3-new-tpl-name');
  const err   = document.getElementById('iv3-new-conv-err');
  const hint  = document.getElementById('iv3-new-plat-hint');
  if (recip) { recip.value = ''; recip.placeholder = 'اختر المنصة أولاً...'; }
  if (msg)   msg.value = '';
  if (tpl)   tpl.value = '';
  if (tplN)  tplN.value = '';
  if (err)   { err.style.display = 'none'; err.textContent = ''; }
  if (hint)  { hint.style.display = 'none'; hint.textContent = ''; }
  modal._selectedPlat = '';

  modal.style.display = 'flex';
  // Smart Default: اختار المنصة الافتراضية تلقائياً
  const defaultPlat = iv3GetDefaultPlatform();
  setTimeout(() => {
    const defaultBtn = document.querySelector(`#iv3-new-plat-btns button[data-plat="${defaultPlat}"]`);
    if (defaultBtn) defaultBtn.click();
    else document.getElementById('iv3-new-plat-btns')?.querySelector('button')?.click();
  }, 50);
}

function iv3SelectNewConvPlat(plat, btn) {
  const modal = document.getElementById('iv3-new-conv-modal');
  if (!modal) return;
  modal._selectedPlat = plat;

  // تمييز الزر المختار
  document.querySelectorAll('#iv3-new-plat-btns button').forEach(b => {
    b.style.background  = b.dataset.plat === plat ? '#1B5E30' : '#fff';
    b.style.color       = b.dataset.plat === plat ? '#fff'    : '#374151';
    b.style.borderColor = b.dataset.plat === plat ? '#1B5E30' : '#e5e7eb';
  });

  // تحديث placeholder + hint
  const info  = IV3_NEW_CONV_PLATFORMS[plat];
  const recip = document.getElementById('iv3-new-recipient');
  const hint  = document.getElementById('iv3-new-plat-hint');
  if (recip && info) recip.placeholder = info.placeholder;
  if (hint && info) {
    if (info.hint) {
      hint.textContent = '💡 ' + info.hint;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }

  // Instagram + Messenger: الرسالة الأولى لازم تكون template → نظهر تحذير
  const msgWrap = document.getElementById('iv3-new-msg-wrap');
  const tplWrap = document.getElementById('iv3-new-tpl-wrap');
  if (plat === 'instagram' || plat === 'messenger') {
    if (msgWrap) msgWrap.style.display = 'none';
    if (tplWrap) tplWrap.style.display = 'block';
  } else if (plat === 'whatsapp') {
    // WA Business API: لازم template للرسالة الأولى
    if (msgWrap) msgWrap.style.display = 'none';
    if (tplWrap) tplWrap.style.display = 'block';
  } else {
    if (msgWrap) msgWrap.style.display = 'block';
    if (tplWrap) tplWrap.style.display = 'none';
  }
}

function iv3CloseNewConvModal() {
  const modal = document.getElementById('iv3-new-conv-modal');
  if (modal) modal.style.display = 'none';
}

async function iv3SendNewConversation() {
  const modal   = document.getElementById('iv3-new-conv-modal');
  const plat    = modal?._selectedPlat;
  const recip   = document.getElementById('iv3-new-recipient')?.value.trim();
  const err     = document.getElementById('iv3-new-conv-err');
  const sendBtn = document.getElementById('iv3-new-conv-send-btn');

  // نقرأ الرسالة من المكان الصح حسب نوع المنصة
  const isTpl = (plat === 'whatsapp' || plat === 'instagram' || plat === 'messenger');
  const msg = isTpl
    ? document.getElementById('iv3-new-template')?.value.trim()
    : document.getElementById('iv3-new-message')?.value.trim();
  const tplName = isTpl ? document.getElementById('iv3-new-tpl-name')?.value.trim() : null;

  const showErr = (txt) => { if (err) { err.textContent = txt; err.style.display = 'block'; } };

  if (!plat)  return showErr('⚠️ اختر المنصة أولاً');
  if (!recip) return showErr('⚠️ أدخل رقم الهاتف أو الـ ID');
  if (!msg && !tplName) return showErr('⚠️ اكتب رسالة أو اختر Template');

  // Validation بسيط لرقم الهاتف لـ WA
  if ((plat === 'whatsapp-qr' || plat === 'whatsapp') && !/^\d{7,15}$/.test(recip.replace(/\D/g,''))) {
    return showErr('⚠️ رقم الهاتف لازم يكون أرقام فقط (7-15 رقم)');
  }

  if (err) err.style.display = 'none';
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳ جاري الإرسال...'; }

  try {
    const body = { platform: plat, recipient: recip, message: msg || '' };
    if (tplName) body.template_name = tplName;

    const res = await apiFetch('/api/system/inbox/new-conversation', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res?.ok) {
      iv3CloseNewConvModal();
      if (typeof iv3Toast === 'function') iv3Toast('✅ تم إرسال الرسالة وإنشاء المحادثة', 'success');
      await iv3LoadConvs(true);
      if (res.conversation_id && typeof iv3OpenConv === 'function') {
        setTimeout(() => iv3OpenConv(res.conversation_id), 400);
      }
    } else {
      showErr('❌ ' + (res?.error || 'فشل الإرسال'));
    }
  } catch(e) {
    showErr('❌ ' + e.message);
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'إرسال →'; }
  }
}

// إغلاق الـ modal بالضغط خارجه
document.addEventListener('click', function(e) {
  const modal = document.getElementById('iv3-new-conv-modal');
  if (modal && modal.style.display !== 'none' && e.target === modal) {
    iv3CloseNewConvModal();
  }
});

// ── Export Conversations CSV ─────────────────────────────────

function iv3ExportConvs() {
  // بناء الـ query params من الفلاتر الحالية
  const params = new URLSearchParams();
  if (IV3.platform && IV3.platform !== 'all') params.set('platform', IV3.platform);
  if (IV3.statusFilter && IV3.statusFilter !== 'all') params.set('status', IV3.statusFilter);
  if (IV3.dateFrom) params.set('from', IV3.dateFrom);
  if (IV3.dateTo)   params.set('to',   IV3.dateTo);

  const url = `/api/system/inbox/conversations/export?${params.toString()}`;
  iv3Toast('📥 جاري تحضير الملف...', 'info');

  // إنشاء رابط تنزيل مؤقت مع Bearer token
  const token = localStorage.getItem('pro_token') || sessionStorage.getItem('pro_token') || '';

  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => {
    if (!r.ok) throw new Error('فشل التصدير');
    return r.blob();
  })
  .then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    a.download = `conversations-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    iv3Toast('✅ تم تصدير المحادثات بنجاح', 'success');
  })
  .catch(e => iv3Toast('❌ ' + e.message, 'error'));
}

// ── Date Range Filter ────────────────────────────────────────

function iv3ToggleDateFilter() {
  const inputs = document.getElementById('iv3-date-inputs');
  const toggle = document.getElementById('iv3-date-toggle');
  if (!inputs) return;
  const open = inputs.style.display === 'none' || inputs.style.display === '';
  inputs.style.display = open ? 'flex' : 'none';
  toggle?.classList.toggle('active', open);
}

function iv3ApplyDateFilter() {
  const fromEl = document.getElementById('iv3-date-from');
  const toEl   = document.getElementById('iv3-date-to');
  IV3.dateFrom = fromEl?.value || '';
  IV3.dateTo   = toEl?.value   || '';

  // تحديث label الزر
  const label = document.getElementById('iv3-date-label');
  if (label) {
    if (IV3.dateFrom || IV3.dateTo) {
      const f = IV3.dateFrom || '…';
      const t = IV3.dateTo   || '…';
      label.textContent = `${f} ← ${t}`;
      document.getElementById('iv3-date-toggle')?.classList.add('active');
    } else {
      label.textContent = 'تصفية بالتاريخ';
      document.getElementById('iv3-date-toggle')?.classList.remove('active');
    }
  }

  iv3LoadConvs(true);
}

// ── Snooze Dashboard ─────────────────────────────────

async function iv3OpenSnoozePanel() {
  // أزل قديم إن وجد
  document.getElementById('iv3-snooze-panel')?.remove();

  // مؤشر تحميل
  const btn = document.getElementById('iv3-snooze-dash-btn');
  if (btn) btn.style.opacity = '0.5';

  let rows = [];
  try {
    const data = await IV3_API._get('/api/system/inbox/snoozed-list');
    rows = data.conversations || [];
  } catch(e) {
    iv3Toast('فشل تحميل المؤجلة', 'error');
    if (btn) btn.style.opacity = '';
    return;
  }
  if (btn) btn.style.opacity = '';

  const now = new Date();

  const rowsHtml = rows.length ? rows.map(c => {
    const name    = iv3EscHtml(c.sender_name || c.sender_id || 'مجهول');
    const preview = iv3EscHtml(iv3TruncText(c.last_message || '...', 50));
    const until   = new Date(c.snoozed_until);
    const diff    = Math.round((until - now) / 60000); // بالدقائق
    let timeLabel;
    if (diff <= 0)        timeLabel = '<span style="color:#EF4444">حان الإيقاظ</span>';
    else if (diff < 60)  timeLabel = `بعد ${diff} دقيقة`;
    else if (diff < 1440) timeLabel = `بعد ${Math.round(diff/60)} ساعة`;
    else                  timeLabel = `بعد ${Math.round(diff/1440)} يوم`;

    const platIcon = iv3PlatIcon(c.platform);
    return `
      <div class="iv3-snooze-row" onclick="iv3OpenConv(${c.id});iv3CloseModal('iv3-snooze-panel')">
        <div class="iv3-snooze-row-left">
          <span class="iv3-snooze-plat">${platIcon}</span>
          <div class="iv3-snooze-info">
            <div class="iv3-snooze-name">${name}</div>
            <div class="iv3-snooze-preview">${preview}</div>
          </div>
        </div>
        <div class="iv3-snooze-row-right">
          <div class="iv3-snooze-time">⏰ ${timeLabel}</div>
          <button class="iv3-snooze-cancel" title="إلغاء التأجيل"
            onclick="event.stopPropagation();iv3CancelSnooze(${c.id})">&#x2715;</button>
        </div>
      </div>`;
  }).join('') : `<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px">لا توجد محادثات مؤجلة حالياً ⏰</div>`;

  const panel = document.createElement('div');
  panel.id = 'iv3-snooze-panel';
  panel.className = 'iv3-modal-overlay';
  panel.onclick = (e) => { if (e.target === panel) panel.remove(); };
  panel.innerHTML = `
    <div class="iv3-modal" style="max-width:480px;max-height:70vh;display:flex;flex-direction:column">
      <div class="iv3-modal-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>⏰ المحادثات المؤجلة (${rows.length})</span>
        <button onclick="document.getElementById('iv3-snooze-panel').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6B7280">×</button>
      </div>
      <div style="overflow-y:auto;flex:1">
        <div id="iv3-snooze-rows">${rowsHtml}</div>
      </div>
    </div>`;

  document.body.appendChild(panel);
}

function iv3UpdateSnoozeBadge() {
  const snoozedCount = IV3.convs.filter(c => c.status === 'snoozed').length;
  const badge = document.getElementById('iv3-snooze-badge');
  if (!badge) return;
  if (snoozedCount > 0) {
    badge.textContent = snoozedCount > 9 ? '9+' : snoozedCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function iv3CancelSnooze(convId) {
  try {
    await IV3_API._post(`/api/system/inbox/conversations/${convId}/snooze`, { minutes: 0 });
    // أزل الصف من الـ panel
    const row = document.querySelector(`#iv3-snooze-rows .iv3-snooze-row[onclick*="iv3OpenConv(${convId})"]`);
    if (row) row.remove();
    // تحديث العداد
    const title = document.querySelector('#iv3-snooze-panel .iv3-modal-title span');
    if (title) {
      const remaining = document.querySelectorAll('#iv3-snooze-rows .iv3-snooze-row').length;
      title.textContent = `⏰ المحادثات المؤجلة (${remaining})`;
    }
    iv3Toast('تم إلغاء التأجيل', 'success');
    // تحديث قائمة المحادثات
    await iv3LoadConvs(true);
  } catch(e) {
    iv3Toast('فشل إلغاء التأجيل', 'error');
  }
}

// ── Mark All as Read ─────────────────────────────────

async function iv3MarkAllRead() {
  // تحقق أولاً: هل يوجد شيء غير مقروء
  const totalUnread = IV3.convs.reduce((s, c) => s + (c.unread_count || 0), 0);
  if (totalUnread === 0) {
    iv3Toast('لا يوجد رسائل غير مقروءة', 'info');
    return;
  }

  const btn = document.getElementById('iv3-mark-all-read-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  try {
    await IV3_API.markAllRead();

    // تحديث الـ state محلياً
    IV3.convs.forEach(c => { c.unread_count = 0; });
    iv3RenderConvs();
    iv3UpdateUnreadBadge();
    iv3Toast(`✅ تم قراءة ${totalUnread} رسالة`, 'success');
  } catch (e) {
    iv3Toast('فشل تحديث حالة القراءة', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

function iv3ClearDateFilter() {
  IV3.dateFrom = '';
  IV3.dateTo   = '';
  const fromEl = document.getElementById('iv3-date-from');
  const toEl   = document.getElementById('iv3-date-to');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';

  const label = document.getElementById('iv3-date-label');
  if (label) label.textContent = 'تصفية بالتاريخ';
  document.getElementById('iv3-date-toggle')?.classList.remove('active');

  // أخفِ الـ inputs وأعد التحميل
  const inputs = document.getElementById('iv3-date-inputs');
  if (inputs) inputs.style.display = 'none';
  iv3LoadConvs(true);
}

// ══════════════════════════════════════════════════════════════
// LABELS PANEL — Respond.io style folders + label chips
// ══════════════════════════════════════════════════════════════

// تحميل الـ labels وبناء الـ panel
async function iv3LoadLabelsPanel() {
  try {
    // جلب العدادات (الكل / ملكي / غير معيّن)
    const counts = await IV3_API._get('/api/system/inbox/counts');
    if (counts?.counts) {
      const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val > 0 ? val : ''; };
      el('iv3-lfc-all',        counts.counts.all);
      el('iv3-lfc-mine',       counts.counts.mine);
      el('iv3-lfc-unassigned', counts.counts.unassigned);
    }

    // جلب Labels
    const data = await IV3_API._get('/api/system/inbox/labels');
    if (data?.labels) {
      IV3.labels = data.labels;
      iv3RenderLabelsPanel(data.labels);
    }
  } catch(e) { /* تجاهل */ }
}

function iv3RenderLabelsPanel(labels) {
  const list = document.getElementById('iv3-lp-labels-list');
  if (!list) return;

  if (!labels || labels.length === 0) {
    list.innerHTML = '<div class="iv3-lp-empty">لا توجد تسميات بعد</div>';
    return;
  }

  const active = IV3.labelFilter;
  list.innerHTML = labels.map(l => `
    <div class="iv3-lp-folder${active == l.id ? ' iv3-lp-active' : ''}"
         id="iv3-lf-${l.id}"
         onclick="iv3SetLabelFilter(${l.id}, this)">
      <span class="iv3-lp-dot" style="background:${l.color || '#1B5E30'}"></span>
      <span class="iv3-lp-name">${iv3EscHtml(l.name)}</span>
      <span class="iv3-lp-count">${l.conv_count > 0 ? l.conv_count : ''}</span>
    </div>
  `).join('');
}

// تغيير الـ label filter
function iv3SetLabelFilter(filter, btn) {
  IV3.labelFilter = filter;

  // تحديث الـ active state بصرياً
  document.querySelectorAll('.iv3-lp-folder').forEach(f => f.classList.remove('iv3-lp-active'));
  if (btn) btn.classList.add('iv3-lp-active');
  else {
    const id = filter === 'all' ? 'iv3-lf-all'
             : filter === 'mine' ? 'iv3-lf-mine'
             : filter === 'unassigned' ? 'iv3-lf-unassigned'
             : `iv3-lf-${filter}`;
    document.getElementById(id)?.classList.add('iv3-lp-active');
  }

  // إعادة تحميل
  iv3LoadConvs(true);
}

// فتح Label Manager modal
function iv3OpenLabelManager() {
  const modal = document.getElementById('iv3-label-manager-modal');
  if (!modal) return;
  iv3RenderLabelManagerList();
  modal.style.display = 'flex';
}

function iv3CloseLabelManager() {
  const modal = document.getElementById('iv3-label-manager-modal');
  if (modal) modal.style.display = 'none';
}

async function iv3RenderLabelManagerList() {
  const list = document.getElementById('iv3-lm-list');
  if (!list) return;
  list.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:8px">جاري التحميل...</div>';
  try {
    const data = await IV3_API._get('/api/system/inbox/labels');
    const labels = data?.labels || [];
    if (labels.length === 0) {
      list.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:8px">لا توجد تسميات — أنشئ أولى!</div>';
      return;
    }
    list.innerHTML = labels.map(l => `
      <div class="iv3-lm-item">
        <span class="iv3-lm-dot" style="background:${l.color || '#1B5E30'}"></span>
        <input class="iv3-lm-name-input" value="${iv3EscHtml(l.name)}" data-id="${l.id}"
          onchange="iv3UpdateLabelName(${l.id}, this.value)">
        <input type="color" class="iv3-lm-color-input" value="${l.color || '#1B5E30'}" data-id="${l.id}"
          onchange="iv3UpdateLabelColor(${l.id}, this.value, this.parentElement.querySelector('.iv3-lm-dot'))">
        <button class="iv3-lm-del" onclick="iv3DeleteLabel(${l.id})" title="حذف">×</button>
      </div>
    `).join('');
  } catch(e) { list.innerHTML = '<div style="color:#ef4444;font-size:12px">خطأ في التحميل</div>'; }
}

async function iv3CreateLabel() {
  const nameEl  = document.getElementById('iv3-lm-new-name');
  const colorEl = document.getElementById('iv3-lm-new-color');
  const name    = nameEl?.value.trim();
  const color   = colorEl?.value || '#1B5E30';
  if (!name) return;
  try {
    await IV3_API._post('/api/system/inbox/labels', { name, color });
    if (nameEl) nameEl.value = '';
    iv3RenderLabelManagerList();
    iv3LoadLabelsPanel();
  } catch(e) { alert('خطأ: ' + e.message); }
}

async function iv3DeleteLabel(id) {
  if (!confirm('حذف هذه التسمية نهائياً؟')) return;
  try {
    await IV3_API._delete(`/api/system/inbox/labels/${id}`);
    iv3RenderLabelManagerList();
    iv3LoadLabelsPanel();
    if (IV3.labelFilter == id) { IV3.labelFilter = 'all'; iv3LoadConvs(true); }
  } catch(e) { alert('خطأ: ' + e.message); }
}

async function iv3UpdateLabelName(id, name) {
  // PATCH not available, use POST to recreate or PUT if added — skip for now, reload
}

async function iv3UpdateLabelColor(id, color, dotEl) {
  if (dotEl) dotEl.style.background = color;
  // update in DB via PUT if endpoint exists — for now just visual
}

// Label chips في بطاقة المحادثة
function iv3RenderLabelChips(conv) {
  if (!IV3.labels || IV3.labels.length === 0) return '';
  if (!conv._labels || conv._labels.length === 0) return '';
  return `<div class="iv3-conv-label-chips">${
    conv._labels.slice(0,3).map(l =>
      `<span class="iv3-label-chip" style="background:${l.color}22;color:${l.color};border-color:${l.color}44">${iv3EscHtml(l.name)}</span>`
    ).join('')
  }</div>`;
}

// تحميل labels للمحادثة (lazy — بعد الـ render)
async function iv3LoadConvLabels(convId) {
  try {
    const data = await IV3_API._get(`/api/system/inbox/conversations/${convId}/labels`);
    const labels = data?.labels || [];
    // تحديث الـ conv في IV3.convs
    const conv = IV3.convs.find(c => c.id === convId);
    if (conv) {
      conv._labels = labels;
      // تحديث الـ chip في الـ DOM مباشرة (بدون re-render كامل)
      const chipWrap = document.querySelector(`[data-conv-id="${convId}"] .iv3-conv-label-chips-wrap`);
      if (chipWrap) chipWrap.innerHTML = iv3RenderLabelChips(conv);
    }
  } catch(e) { /* تجاهل */ }
}

// إضافة/حذف label من الـ conversation header
async function iv3ToggleConvLabel(convId, labelId, add) {
  try {
    if (add) {
      await IV3_API._post(`/api/system/inbox/conversations/${convId}/labels/${labelId}`, {});
    } else {
      await IV3_API._delete(`/api/system/inbox/conversations/${convId}/labels/${labelId}`);
    }
    iv3LoadConvLabels(convId);
    iv3LoadLabelsPanel(); // تحديث العدادات
  } catch(e) { iv3Toast('خطأ: ' + e.message, 'error'); }
}

// ── Label Picker في Chat Header ────────────────────────────
async function iv3OpenLabels() {
  const picker = document.getElementById('iv3-label-picker');
  if (!picker) return;

  // Toggle
  if (picker.style.display !== 'none') {
    picker.style.display = 'none';
    return;
  }

  const convId = IV3.activeConvId;
  if (!convId) return;

  picker.style.display = 'block';
  const list = document.getElementById('iv3-lp-picker-list');
  if (list) list.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#9ca3af">جاري التحميل...</div>';

  try {
    // جلب labels الكل + labels هذه المحادثة
    const [allData, convData] = await Promise.all([
      IV3_API._get('/api/system/inbox/labels'),
      IV3_API._get(`/api/system/inbox/conversations/${convId}/labels`),
    ]);
    const all    = allData?.labels || [];
    const active = new Set((convData?.labels || []).map(l => l.id));

    if (!list) return;
    if (all.length === 0) {
      list.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#9ca3af">لا توجد تسميات — أنشئ من زر الإدارة</div>';
      return;
    }

    list.innerHTML = all.map(l => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;transition:background .1s"
           onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"
           onclick="iv3ToggleConvLabel(${convId},${l.id},${!active.has(l.id)});this.querySelector('.iv3-lp-check').style.display=${!active.has(l.id)?'\'block\'':'\'none\''};event.stopPropagation()">
        <span style="width:10px;height:10px;border-radius:50%;background:${l.color || '#1B5E30'};flex-shrink:0"></span>
        <span style="flex:1;font-size:12px;font-family:Cairo,sans-serif;color:#374151">${iv3EscHtml(l.name)}</span>
        <span class="iv3-lp-check" style="display:${active.has(l.id)?'block':'none'};color:#1B5E30;font-size:14px;font-weight:700">✓</span>
      </div>
    `).join('');
  } catch(e) {
    if (list) list.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#ef4444">خطأ في التحميل</div>';
  }

  // إغلاق عند الضغط خارج الـ picker
  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target) && !document.getElementById('iv3-labels-btn')?.contains(e.target)) {
        picker.style.display = 'none';
        document.removeEventListener('click', closePicker);
      }
    });
  }, 50);
}
