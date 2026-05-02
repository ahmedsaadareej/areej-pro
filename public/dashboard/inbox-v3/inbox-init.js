/**
 * inbox-init.js — Areej Pro Inbox v3
 * التهيئة الكاملة + Polling + Toast + Sound + Settings
 * آخر تحديث: 2026-05-02
 */

// ── Init الرئيسي ────────────────────────────────────────────

async function iv3Init() {
  // 1. تحميل بيانات المستخدم الحالي
  try {
    IV3.me = await IV3_API.getMe();
  } catch (e) {
    console.warn('[IV3] فشل تحميل بيانات المستخدم:', e.message);
  }

  // 2. تحميل الموظفين (للـ owner فقط)
  if (IV3.me?.role === 'owner' || IV3.me?.inbox_role === 'owner') {
    try {
      const data = await IV3_API.getAgents();
      IV3.agents = Array.isArray(data) ? data : (data.agents || []);
      iv3PopulateAgentFilter();
    } catch (e) {
      console.warn('[IV3] فشل تحميل الموظفين:', e.message);
    }
  }

  // 3. تحميل المحادثات
  await iv3LoadConvs(true);

  // 4. بدء الـ Polling
  iv3StartPolling();

  // 5. تحميل الـ Sound
  iv3InitSound();

  // 6. إخفاء agent filter لو مش owner
  const agentWrap = document.getElementById('iv3-agent-filter-wrap');
  if (agentWrap) {
    agentWrap.style.display = (IV3.me?.role === 'owner' || IV3.me?.inbox_role === 'owner') ? '' : 'none';
  }

  console.log('[IV3] Inbox v3 initialized ✓');
}

// ── Polling (Realtime بدون WebSocket) ──────────────────────

function iv3StartPolling() {
  if (IV3.pollTimer) clearInterval(IV3.pollTimer);
  IV3.pollTimer = setInterval(iv3PollUpdate, IV3.pollInterval);
}

function iv3StopPolling() {
  if (IV3.pollTimer) {
    clearInterval(IV3.pollTimer);
    IV3.pollTimer = null;
  }
}

async function iv3PollUpdate() {
  // تحديث قائمة المحادثات في الخلفية
  try {
    const data = await IV3_API.getConversations({
      platform: IV3.platform,
      status:   IV3.statusFilter,
      assigned: IV3.agentFilter,
      page: 1,
      limit: IV3.convPageSize,
    });

    const newList = data.conversations || data || [];

    // تحقق من رسائل جديدة
    let hasNew = false;
    newList.forEach(newConv => {
      const existing = IV3.convs.find(c => c.id === newConv.id);
      if (!existing) {
        hasNew = true;
        IV3.convs.unshift(newConv);
      } else if (existing.last_message_at !== newConv.last_message_at) {
        hasNew = true;
        Object.assign(existing, newConv);
        // نقلها للأول
        const idx = IV3.convs.indexOf(existing);
        if (idx > 0) {
          IV3.convs.splice(idx, 1);
          IV3.convs.unshift(existing);
        }
      }
    });

    if (hasNew) {
      iv3RenderConvs();
      if (IV3.soundEnabled) iv3PlayNotifSound();
      iv3UpdateUnreadBadge();
    }

    // تحديث الرسائل لو في محادثة مفتوحة
    if (IV3.activeConvId) {
      await iv3PollActiveConvMessages();
    }

  } catch (e) {
    // polling فاشل — مش مشكلة، هيحاول تاني
  }
}

async function iv3PollActiveConvMessages() {
  try {
    const data = await IV3_API.getMessages(IV3.activeConvId);
    const newMsgs = Array.isArray(data) ? data : (data.messages || []);

    // تحقق من رسائل جديدة فقط
    const lastId = IV3.messages.length ? IV3.messages[IV3.messages.length - 1].id : null;
    const hasNew = newMsgs.length > IV3.messages.length ||
      (newMsgs.length && newMsgs[newMsgs.length - 1].id !== lastId);

    if (hasNew) {
      IV3.messages = newMsgs;
      iv3RenderMessages();
    }
  } catch (e) {
    // تجاهل
  }
}

// ── Sound ───────────────────────────────────────────────────

function iv3InitSound() {
  // صوت بسيط بدون ملف خارجي (Web Audio API)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    IV3._audioCtx = ctx;
  } catch (e) {
    IV3._audioCtx = null;
  }

  // تحميل الإعداد المحفوظ
  const saved = localStorage.getItem('iv3_sound');
  IV3.soundEnabled = saved !== 'off';
  iv3UpdateSoundIcon();
}

function iv3PlayNotifSound() {
  if (!IV3.soundEnabled || !IV3._audioCtx) return;
  try {
    const ctx = IV3._audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { /* تجاهل */ }
}

function iv3ToggleSound() {
  IV3.soundEnabled = !IV3.soundEnabled;
  localStorage.setItem('iv3_sound', IV3.soundEnabled ? 'on' : 'off');
  iv3UpdateSoundIcon();
  iv3Toast(IV3.soundEnabled ? '🔔 الصوت مفعّل' : '🔕 الصوت مكتوم', 'info');
}

function iv3UpdateSoundIcon() {
  const btn = document.getElementById('iv3-sound-btn');
  if (!btn) return;
  btn.title = IV3.soundEnabled ? 'إيقاف الصوت' : 'تفعيل الصوت';
  btn.style.opacity = IV3.soundEnabled ? '1' : '0.4';
}

// ── Unread Badge ────────────────────────────────────────────

function iv3UpdateUnreadBadge() {
  const total = IV3.convs.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const badge = document.getElementById('iv3-badge-total');
  if (badge) {
    badge.textContent = total > 99 ? '99+' : total;
    badge.style.display = total > 0 ? '' : 'none';
  }

  // تحديث badges المنصات
  const platCounts = {};
  IV3.convs.forEach(c => {
    if (c.unread_count > 0) {
      platCounts[c.platform] = (platCounts[c.platform] || 0) + c.unread_count;
    }
  });

  const platBadgeMap = {
    'whatsapp-qr': 'iv3-badge-waqr',
    'whatsapp':    'iv3-badge-wa',
    'telegram':    'iv3-badge-tg',
  };
  Object.entries(platBadgeMap).forEach(([plat, badgeId]) => {
    const el = document.getElementById(badgeId);
    if (!el) return;
    const count = platCounts[plat] || 0;
    el.textContent = count > 99 ? '99+' : count;
    el.style.display = count > 0 ? '' : 'none';
  });

  // Tab title
  if (total > 0) {
    document.title = `(${total}) Areej Pro`;
  } else {
    document.title = 'Areej Pro';
  }
}

// ── Agent Filter ────────────────────────────────────────────

function iv3PopulateAgentFilter() {
  const sel = document.getElementById('iv3-agent-filter');
  if (!sel) return;

  const opts = IV3.agents.map(a =>
    `<option value="${a.id}">${iv3EscHtml(a.name)}</option>`
  ).join('');

  sel.innerHTML = `
    <option value="">الكل — جميع الموظفين</option>
    <option value="unassigned">❔ غير معيّنة</option>
    ${opts}`;
}

// ── Inbox Settings ───────────────────────────────────────────
// showInboxSettings() مُعرَّفة في inbox.js — لا نُعيد تعريفها هنا
// لتجنب override يطغى على الدالة الشغالة (sbShowPage → page-inbox-settings)

// ── Toast Notifications ──────────────────────────────────────

function iv3Toast(message, type = 'info') {
  // إنشاء container لو مش موجود
  let container = document.getElementById('iv3-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'iv3-toast-container';
    container.style.cssText = `
      position:fixed; bottom:20px; left:20px; z-index:99999;
      display:flex; flex-direction:column; gap:8px; pointer-events:none;`;
    document.body.appendChild(container);
  }

  const colors = {
    success: '#10B981',
    error:   '#EF4444',
    info:    '#3B82F6',
    warning: '#F59E0B',
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${colors[type] || colors.info};
    color:#fff; padding:10px 16px; border-radius:8px;
    font-size:13px; font-family:inherit;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
    pointer-events:auto; cursor:pointer;
    animation:iv3ToastIn 0.2s ease;
    max-width:280px; word-break:break-word;
    direction:rtl; text-align:right;`;
  toast.textContent = message;
  toast.onclick = () => toast.remove();

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── CSS animation للـ Toast ──────────────────────────────────
(function () {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes iv3ToastIn {
      from { opacity:0; transform:translateY(8px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .iv3-spinner {
      width:32px; height:32px; border:3px solid #E5E7EB;
      border-top-color:#3B82F6; border-radius:50%;
      animation:iv3Spin 0.7s linear infinite; margin:auto;
    }
    .iv3-spinner-sm {
      display:inline-block; width:14px; height:14px;
      border:2px solid #E5E7EB; border-top-color:#3B82F6;
      border-radius:50%; animation:iv3Spin 0.7s linear infinite;
      vertical-align:middle; margin-left:6px;
    }
    @keyframes iv3Spin { to { transform:rotate(360deg); } }
    .iv3-msgs-loading { display:flex; align-items:center; justify-content:center; height:200px; }
    .iv3-retry-btn { margin-top:12px; padding:6px 16px; border-radius:6px; border:1px solid #3B82F6; color:#3B82F6; background:transparent; cursor:pointer; }
  `;
  document.head.appendChild(style);
})();

// ── الدخول على الـ Inbox ─────────────────────────────────────

// تشغيل تلقائي لما الـ page-inbox يظهر
document.addEventListener('DOMContentLoaded', () => {
  // إذا كانت الصفحة الحالية هي الـ inbox، شغّل الـ init
  const page = document.getElementById('page-inbox');
  if (page && !page.classList.contains('hidden')) {
    iv3Init();
  }
});

// يُستدعى من نظام التنقل بين الصفحات
function iv3OnPageShow() {
  if (!IV3._initialized) {
    IV3._initialized = true;
    iv3Init();
  } else {
    // الـ page تظهر مجدداً — فقط أعد تشغيل الـ polling
    if (!IV3.pollTimer) iv3StartPolling();
    // لو فيه محادثة مفتوحة، حدّث الرسائل
    if (IV3.activeConvId) iv3PollActiveConvMessages();
  }
}

function iv3OnPageHide() {
  iv3StopPolling();
}
