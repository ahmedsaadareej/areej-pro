/**
 * inbox-init.js — Areej Pro Inbox v3
 * التهيئة الكاملة + Polling + Toast + Sound + Push Notifications + Settings
 * آخر تحديث: 2026-05-03
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

  // 3. تحميل المحادثات + Labels Panel
  await Promise.all([
    iv3LoadConvs(true),
    iv3LoadLabelsPanel(),
  ]);

  // 4. بدء الـ Polling
  iv3StartPolling();

  // 4b. بدء Relative Time Ticker (FEAT-3)
  iv3StartRelativeTimeTicker();

  // 5. تحميل الـ Sound
  iv3InitSound();

  // 6. تهيئة Push Notifications
  iv3InitPushNotifications();

  // 7. استقبال رسائل من الـ Service Worker
  iv3BindServiceWorkerMessages();

  // 8. إخفاء agent filter لو مش owner
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

  // BUG-4: تقليل الـ polling لما التبويب مخفي (من 8s إلى 30s)
  if (!IV3._visibilityListenerAdded) {
    IV3._visibilityListenerAdded = true;
    document.addEventListener('visibilitychange', () => {
      if (!IV3.pollTimer) return;
      clearInterval(IV3.pollTimer);
      const interval = document.hidden ? 30000 : IV3.pollInterval;
      IV3.pollTimer = setInterval(iv3PollUpdate, interval);
    });
  }
}

function iv3StopPolling() {
  if (IV3.pollTimer) {
    clearInterval(IV3.pollTimer);
    IV3.pollTimer = null;
  }
}

async function iv3PollUpdate() {
  // تحقق من محادثات Snooze التي حان وقت إيقاظها
  try {
    const wakeResult = await IV3_API.checkSnoozeWakeup();
    if (wakeResult?.woken?.length) {
      wakeResult.woken.forEach(wokenId => {
        const conv = IV3.convs.find(c => c.id === wokenId);
        if (conv) {
          conv.status = 'open';
          iv3UpdateConvInList({ id: wokenId, status: 'open' });
        }
      });
      iv3Toast(`⏰ ${wakeResult.woken.length} محادثة عادت من التأجيل`, 'info');
    }
  } catch(e) { /* تجاهل */ }

  // تحديث قائمة المحادثات في الخلفية
  try {
    const data = await IV3_API.getConversations({
      platform: IV3.platform,
      status:   IV3.statusFilter,
      assigned: IV3.agentFilter,
      from:     IV3.dateFrom  || undefined,
      to:       IV3.dateTo    || undefined,
      search:   IV3.searchQuery || undefined,
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
      // Browser Push Notification عند رسالة جديدة والتبويب مخفي
      if (IV3._pushEnabled && document.hidden) {
        const newestConv = newList.find(c => {
          const ex = IV3.convs.find(x => x.id === c.id);
          return !ex || (ex && ex.unread_count > 0);
        });
        if (newestConv) {
          const preview = newestConv.last_message || 'رسالة جديدة';
          iv3SendBrowserNotification(newestConv, preview);
        }
      }
    }

    // تحديث الرسائل لو في محادثة مفتوحة
    if (IV3.activeConvId) {
      await iv3PollActiveConvMessages();
      // Collision Detection — التحقق من الموظفين الذين يكتبون
      iv3CheckTypingAgents();
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

  // resume AudioContext عند أول تفاعل — مطلوب في Chrome/Safari
  const resumeOnce = () => {
    if (IV3._audioCtx && IV3._audioCtx.state === 'suspended') {
      IV3._audioCtx.resume().catch(() => {});
    }
    document.removeEventListener('click', resumeOnce);
    document.removeEventListener('keydown', resumeOnce);
  };
  document.addEventListener('click', resumeOnce);
  document.addEventListener('keydown', resumeOnce);

  // تحميل الإعداد المحفوظ
  const saved = localStorage.getItem('iv3_sound');
  IV3.soundEnabled = saved !== 'off';
  iv3UpdateSoundIcon();
}

function iv3PlayNotifSound() {
  if (!IV3.soundEnabled || !IV3._audioCtx) return;
  try {
    const ctx = IV3._audioCtx;
    // resume لو suspended (قد يحدث بعد idle طويل)
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // نغمة أولى (bing)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.value = 880;
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // نغمة ثانية بعد 180ms (bing bing)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 1100;
    gain2.gain.setValueAtTime(0, now + 0.18);
    gain2.gain.linearRampToValueAtTime(0.18, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.55);
  } catch (e) { /* تجاهل */ }
}

function iv3ToggleSound() {
  IV3.soundEnabled = !IV3.soundEnabled;
  localStorage.setItem('iv3_sound', IV3.soundEnabled ? 'on' : 'off');
  iv3UpdateSoundIcon();
  iv3Toast(IV3.soundEnabled ? '🔔 الصوت مفعّل' : '🔕 الصوت مكتوم', 'info');
  // تشغيل صوت تجريبي عند التفعيل فقط
  if (IV3.soundEnabled) iv3PlayNotifSound();
}

// SVG لأيقونة الصوت المفعّل
const _IV3_SOUND_ON_SVG = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
// SVG لأيقونة الصوت المكتوم
const _IV3_SOUND_OFF_SVG = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;

function iv3UpdateSoundIcon() {
  const btn = document.getElementById('iv3-sound-btn');
  if (!btn) return;
  const on = IV3.soundEnabled;
  btn.title = on ? 'إيقاف الصوت' : 'تفعيل الصوت';
  btn.style.opacity = on ? '1' : '0.5';
  const icon = btn.querySelector('svg');
  if (icon) icon.innerHTML = on ? _IV3_SOUND_ON_SVG : _IV3_SOUND_OFF_SVG;
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

// ── Keyboard Shortcuts ───────────────────────────────────────
// يُفعَّل فقط لما صفحة الـ inbox نشطة
// الاختصارات:
//   Tab / J / ↓  → المحادثة التالية
//   Shift+Tab / K / ↑ → المحادثة السابقة
//   R             → فوكس على textarea الرد
//   E             → إغلاق المحادثة الحالية
//   A             → فتح نافذة التعيين
//   N             → ملاحظة داخلية (note mode)
//   Escape        → إغلاق modals / خروج من bulk mode

(function iv3BindKeyboard() {
  document.addEventListener('keydown', function iv3KeyHandler(e) {
    // تجاهل لو مش في صفحة الـ inbox
    const page = document.getElementById('page-inbox');
    if (!page || !page.classList.contains('active')) return;

    // تجاهل لو المستخدم يكتب في input/textarea/select
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = (tag === 'input' || tag === 'textarea' || tag === 'select')
      && document.activeElement?.id !== 'iv3-search';

    // Escape يعمل دائماً حتى في وضع الكتابة
    if (e.key === 'Escape') {
      // 1. إغلاق أي modal مفتوح
      const modals = document.querySelectorAll('.iv3-modal-overlay');
      if (modals.length) {
        modals[modals.length - 1].remove();
        return;
      }
      // 2. خروج من bulk mode
      if (IV3.bulkMode && typeof iv3ToggleBulkMode === 'function') {
        iv3ToggleBulkMode();
        return;
      }
      // 3. مسح الاقتباس
      if (IV3.quotedMsg && typeof iv3ClearQuote === 'function') {
        iv3ClearQuote();
        return;
      }
      // 4. إغلاق dropdowns
      if (typeof iv3CloseDropdowns === 'function') iv3CloseDropdowns();
      return;
    }

    // باقي الـ shortcuts تعمل فقط لما مش في وضع كتابة
    if (isTyping) return;

    switch (e.key) {
      // ── التنقل بين المحادثات ─────────────────────────────
      case 'Tab':
      case 'j':
      case 'J':
      case 'ArrowDown': {
        e.preventDefault();
        if (e.shiftKey && e.key === 'Tab') {
          iv3NavigateConv(-1);
        } else {
          iv3NavigateConv(1);
        }
        break;
      }
      case 'k':
      case 'K':
      case 'ArrowUp': {
        e.preventDefault();
        iv3NavigateConv(-1);
        break;
      }

      // ── إجراءات المحادثة الحالية ─────────────────────────
      case 'r':
      case 'R': {
        if (!IV3.activeConvId) break;
        e.preventDefault();
        const ta = document.getElementById('iv3-textarea');
        if (ta) {
          // تأكد الـ reply box ظاهر
          const replyBox = document.getElementById('iv3-reply');
          if (replyBox) replyBox.style.display = '';
          if (typeof iv3SetReplyMode === 'function') iv3SetReplyMode('reply');
          ta.focus();
          iv3Toast('R — وضع الرد', 'info');
        }
        break;
      }

      case 'n':
      case 'N': {
        if (!IV3.activeConvId) break;
        e.preventDefault();
        const ta = document.getElementById('iv3-textarea');
        if (ta) {
          const replyBox = document.getElementById('iv3-reply');
          if (replyBox) replyBox.style.display = '';
          if (typeof iv3SetReplyMode === 'function') iv3SetReplyMode('note');
          ta.focus();
          iv3Toast('N — ملاحظة داخلية', 'info');
        }
        break;
      }

      case 'e':
      case 'E': {
        if (!IV3.activeConvId) break;
        e.preventDefault();
        if (typeof iv3ChangeStatus === 'function') {
          iv3ChangeStatus('closed');
          iv3Toast('E — تم إغلاق المحادثة', 'success');
        }
        break;
      }

      case 'a':
      case 'A': {
        if (!IV3.activeConvId) break;
        e.preventDefault();
        if (typeof iv3AssignConv === 'function') iv3AssignConv();
        break;
      }

      case 's':
      case 'S': {
        if (!IV3.activeConvId) break;
        e.preventDefault();
        if (typeof iv3SnoozeConv === 'function') iv3SnoozeConv();
        break;
      }

      case '?': {
        e.preventDefault();
        iv3ShowShortcutsHelp();
        break;
      }
    }
  });
})();

// ── التنقل بين المحادثات ─────────────────────────────────────

function iv3NavigateConv(dir) {
  if (!IV3.convs.length) return;

  const currentIdx = IV3.convs.findIndex(c => c.id === IV3.activeConvId);
  let nextIdx;

  if (currentIdx === -1) {
    nextIdx = dir > 0 ? 0 : IV3.convs.length - 1;
  } else {
    nextIdx = currentIdx + dir;
    if (nextIdx < 0) nextIdx = IV3.convs.length - 1;
    if (nextIdx >= IV3.convs.length) nextIdx = 0;
  }

  const nextConv = IV3.convs[nextIdx];
  if (!nextConv) return;

  if (typeof iv3OpenConv === 'function') iv3OpenConv(nextConv.id);

  // Scroll للـ item المحدد في القائمة
  requestAnimationFrame(() => {
    const el = document.querySelector(`.iv3-conv-item[data-id="${nextConv.id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ── لوحة مساعدة الـ Shortcuts ────────────────────────────────

function iv3ShowShortcutsHelp() {
  if (document.getElementById('iv3-shortcuts-modal')) return; // مفتوحة مسبقاً

  const shortcuts = [
    { key: 'Tab / J / ↓',      desc: 'المحادثة التالية' },
    { key: 'Shift+Tab / K / ↑', desc: 'المحادثة السابقة' },
    { key: 'R',                 desc: 'فتح صندوق الرد' },
    { key: 'N',                 desc: 'ملاحظة داخلية' },
    { key: 'E',                 desc: 'إغلاق المحادثة' },
    { key: 'A',                 desc: 'تعيين لموظف' },
    { key: 'S',                 desc: 'تأجيل (Snooze)' },
    { key: 'Esc',               desc: 'إغلاق / إلغاء' },
    { key: '?',                 desc: 'عرض هذه المساعدة' },
  ];

  const rows = shortcuts.map(s => `
    <div class="iv3-shortcut-row">
      <kbd class="iv3-shortcut-kbd">${iv3EscHtml(s.key)}</kbd>
      <span>${iv3EscHtml(s.desc)}</span>
    </div>`).join('');

  const html = `
    <div class="iv3-modal-overlay" id="iv3-shortcuts-modal" onclick="iv3CloseModal('iv3-shortcuts-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:360px">
        <div class="iv3-modal-title">⌨️ اختصارات لوحة المفاتيح</div>
        <div class="iv3-shortcuts-list">${rows}</div>
        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-shortcuts-modal')" class="iv3-modal-confirm">حسناً</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

// ── Push Notifications ─────────────────────────────────────────

/**
 * iv3InitPushNotifications
 * تسجيل Service Worker + طلب إذن الإشعارات
 * يعمل بهدوء — لا يزعج المستخدم إذا رفض
 */
async function iv3InitPushNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.log('[IV3-Push] المتصفح لا يدعم الإشعارات');
    return;
  }

  // تسجيل الـ Service Worker
  try {
    const reg = await navigator.serviceWorker.register('/dashboard/sw-inbox.js', {
      scope: '/dashboard/'
    });
    IV3._swRegistration = reg;
    console.log('[IV3-Push] Service Worker مسجّل ✓');
  } catch (e) {
    console.warn('[IV3-Push] فشل تسجيل Service Worker:', e.message);
    return;
  }

  // تحقق من إذن الإشعارات الحالي
  const permission = Notification.permission;
  if (permission === 'granted') {
    iv3EnablePushReceiver();
  } else if (permission === 'default') {
    // اطلب الإذن بعد أول تفاعل من المستخدم (لا نسألها فوراً)
    if (!IV3._pushPermissionAsked) {
      IV3._pushPermissionAsked = true;
      iv3ShowPushPrompt();
    }
  }
  // إذا 'denied' → لا نفعل شيئاً
}

/**
 * iv3ShowPushPrompt
 * شريط صغير أسفل الـ inbox يسأل المستخدم تفعيل الإشعارات
 */
function iv3ShowPushPrompt() {
  // لا تعرضه أكثر من مرة في الجلسة
  if (localStorage.getItem('iv3_push_dismissed') === 'yes') return;

  const bar = document.createElement('div');
  bar.id = 'iv3-push-prompt';
  bar.style.cssText = `
    position:fixed; bottom:0; left:0; right:0; z-index:99998;
    background:#1B5E30; color:#fff;
    padding:10px 20px; display:flex; align-items:center;
    justify-content:space-between; gap:12px;
    font-size:13px; font-family:inherit; direction:rtl;
    box-shadow:0 -2px 12px rgba(0,0,0,0.2);
    animation:iv3ToastIn 0.3s ease;`;

  bar.innerHTML = `
    <span>🔔 فعّل الإشعارات لتلقّي تنبيهات فورية حتى عندما تكون في تبويب آخر</span>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button id="iv3-push-yes" style="
        background:#fff; color:#1B5E30; border:none;
        padding:6px 14px; border-radius:6px; cursor:pointer;
        font-size:13px; font-weight:600;">
        تفعيل
      </button>
      <button id="iv3-push-no" style="
        background:transparent; color:rgba(255,255,255,0.8);
        border:1px solid rgba(255,255,255,0.4);
        padding:6px 10px; border-radius:6px; cursor:pointer;
        font-size:12px;">
        لاحقاً
      </button>
    </div>`;

  document.body.appendChild(bar);

  document.getElementById('iv3-push-yes')?.addEventListener('click', async () => {
    bar.remove();
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      iv3EnablePushReceiver();
      iv3Toast('🔔 تم تفعيل الإشعارات بنجاح', 'success');
    } else {
      iv3Toast('لم يتم منح إذن الإشعارات', 'warning');
    }
  });

  document.getElementById('iv3-push-no')?.addEventListener('click', () => {
    bar.remove();
    localStorage.setItem('iv3_push_dismissed', 'yes');
  });

  // يختفي تلقائياً بعد 15 ثانية
  setTimeout(() => { if (bar.parentNode) bar.remove(); }, 15000);
}

/**
 * iv3EnablePushReceiver
 * بعد منح الإذن — نُفعّل استقبال الإشعارات
 * نحن لا نستخدم Web Push (يحتاج VAPID + backend)
 * بدلاً من ذلك: نستخدم Service Worker postMessage عند وجود رسائل جديدة
 */
function iv3EnablePushReceiver() {
  IV3._pushEnabled = true;
  console.log('[IV3-Push] استقبال الإشعارات مفعّل ✓');
}

/**
 * iv3SendBrowserNotification
 * إرسال إشعار للمتصفح مباشرة (Notification API — بدون Push Server)
 * يعمل حتى لو التبويب في الخلفية ولكن المتصفح مفتوح
 */
function iv3SendBrowserNotification(conv, msgPreview) {
  if (!IV3._pushEnabled) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return; // فقط لما التبويب مخفي

  const platformEmoji = {
    'whatsapp-qr': '🟢',
    'whatsapp':    '🟢',
    'telegram':    '✈️',
    'facebook':    '🔵',
    'instagram':   '📸',
  };
  const emoji = platformEmoji[conv.platform] || '💬';
  const name  = conv.sender_name || conv.sender_id || 'عميل';

  // استخدام Service Worker notification (أفضل دعماً)
  if (IV3._swRegistration) {
    IV3._swRegistration.showNotification(`${emoji} ${name}`, {
      body:      msgPreview || 'رسالة جديدة',
      icon:      '/dashboard/assets/logo-192.png',
      badge:     '/dashboard/assets/logo-72.png',
      tag:       `inbox-conv-${conv.id}`,
      renotify:  true,
      data:      { convId: conv.id, url: '/dashboard/' },
      actions: [
        { action: 'open',    title: '📂 فتح' },
        { action: 'dismiss', title: '✕ تجاهل' },
      ],
      dir:  'rtl',
      lang: 'ar',
    }).catch(() => {
      // fallback: Notification API المباشر
      new Notification(`${emoji} ${name}`, {
        body: msgPreview || 'رسالة جديدة',
        icon: '/dashboard/assets/logo-192.png',
        tag:  `inbox-conv-${conv.id}`,
      });
    });
  } else {
    // fallback: Notification API مباشر
    const n = new Notification(`${emoji} ${name}`, {
      body: msgPreview || 'رسالة جديدة',
      icon: '/dashboard/assets/logo-192.png',
      tag:  `inbox-conv-${conv.id}`,
      dir:  'rtl',
    });
    n.onclick = () => {
      window.focus();
      if (typeof iv3OpenConv === 'function') iv3OpenConv(conv.id);
      n.close();
    };
  }
}

/**
 * iv3BindServiceWorkerMessages
 * استقبال رسائل من sw-inbox.js (مثل: فتح محادثة عند الضغط على الإشعار)
 */
function iv3BindServiceWorkerMessages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'IV3_OPEN_CONV' && event.data.convId) {
      window.focus();
      if (typeof iv3OpenConv === 'function') {
        iv3OpenConv(event.data.convId);
      }
    }
  });
}

// ── Collision Detection ──────────────────────────────────────

async function iv3CheckTypingAgents() {
  if (!IV3.activeConvId) return;
  try {
    const agents = await IV3_API.getTypingAgents(IV3.activeConvId);
    iv3UpdateTypingBanner(agents);
  } catch(e) { /* تجاهل */ }
}

function iv3UpdateTypingBanner(agents) {
  const banner = document.getElementById('iv3-typing-banner');
  if (!banner) return;

  if (!agents || !agents.length) {
    banner.style.display = 'none';
    return;
  }

  const names = agents.join(' و ');
  const verb  = agents.length === 1 ? 'يرد' : 'يردون';
  banner.textContent = `⚠️ ${names} ${verb} على هذه المحادثة الآن`;
  banner.style.display = 'flex';
}
