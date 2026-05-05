/**
 * app.js — Inbox v4 Entry Point
 * آخر تحديث: 2026-05-05 (D1 — new-conv-btn binding)
 *
 * يُشغَّل آخر script في index.html بعد تحميل:
 *   store.js → api.js → stream.js → [conv-list.js → chat.js → ...] → app.js
 *
 * المسؤوليات:
 *   1. init الـ SSE connection
 *   2. ربط الـ UI events الأساسية (nav buttons, platform filter, search)
 *   3. الاستماع للـ store events وتحديث الـ UI
 */

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const toast = (msg, type = 'info') => {
    const el = document.createElement('div');
    el.className = `iv4-toast ${type}`;
    el.textContent = msg;
    $('iv4-toasts').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  };

  // ─── SSE Status UI ───────────────────────────────────────────────────────
  InboxStore.on('sseConnected:change', ({ value }) => {
    const dot   = $('iv4-sse-dot');
    const label = $('iv4-sse-label');
    if (!dot) return;
    if (value) {
      dot.className   = 'iv4-sse-dot connected';
      label.textContent = 'متصل';
    } else {
      dot.className   = 'iv4-sse-dot disconnected';
      label.textContent = 'غير متصل';
    }
  });

  InboxStore.on('sseReconnectAttempts:change', ({ value }) => {
    if (value === 0) return;
    const dot   = $('iv4-sse-dot');
    const label = $('iv4-sse-label');
    if (!dot) return;
    dot.className     = 'iv4-sse-dot connecting';
    label.textContent = `إعادة اتصال (${value})...`;
  });

  InboxStore.on('sse:failed', () => {
    toast('انقطع الاتصال — يرجى تحديث الصفحة', 'error');
  });

  // ─── Status Nav ──────────────────────────────────────────────────────────
  document.querySelectorAll('#iv4-status-nav .iv4-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#iv4-status-nav .iv4-nav-btn')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      InboxStore.setFilter({ status: filter });
      $('iv4-col-title').textContent = btn.querySelector('.iv4-nav-label').textContent;
    });
  });

  // ─── Assign Filter ───────────────────────────────────────────────────────
  document.querySelectorAll('.iv4-assign-nav .iv4-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.iv4-assign-nav .iv4-nav-btn')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      InboxStore.setFilter({ assignedFilter: btn.dataset.assign });
    });
  });

  // ─── Platform Filter ─────────────────────────────────────────────────────
  document.querySelectorAll('.iv4-plat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.iv4-plat-btn')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      InboxStore.setFilter({ platform: btn.dataset.platform || null });
    });
  });

  // ─── Search ──────────────────────────────────────────────────────────────
  $('iv4-search-btn').addEventListener('click', () => {
    InboxStore.set('searchOpen', true);
    $('iv4-search-bar').classList.remove('hidden');
    $('iv4-search-input').focus();
  });

  $('iv4-search-close').addEventListener('click', () => {
    InboxStore.set('searchOpen', false);
    $('iv4-search-bar').classList.add('hidden');
    $('iv4-search-input').value = '';
    InboxStore.setFilter({ search: '' });
  });

  // فتح Deep Search من الأزرار المخصصة
  if ($('iv4-deep-search-btn')) {
    $('iv4-deep-search-btn').addEventListener('click', () => {
      if (typeof InboxSearch !== 'undefined') InboxSearch.openDeepSearch();
    });
  }
  if ($('iv4-search-deep-trigger')) {
    $('iv4-search-deep-trigger').addEventListener('click', () => {
      if (typeof InboxSearch !== 'undefined') InboxSearch.openDeepSearch();
    });
  }

  // Quick search — الإدخال تتحكم فيه search.js بعد init()
  // احتفظنا بالفال back من setFilter لو search.js لم يكن محملاً
  let _searchDebounce = null;
  $('iv4-search-input').addEventListener('input', e => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      // search.js يتحكم في هذا بعد init — الفال لو search.js لم يكن محملاً
      if (typeof InboxSearch === 'undefined') {
        InboxStore.setFilter({ search: e.target.value.trim() });
      }
    }, 350);
  });

  // ─── Context Panel Toggle ─────────────────────────────────────────────────
  $('iv4-ctx-toggle').addEventListener('click', () => {
    const panel = $('iv4-context-panel');
    panel.classList.toggle('hidden');
  });

  $('iv4-ctx-close').addEventListener('click', () => {
    $('iv4-context-panel').classList.add('hidden');
  });

  // Context Tabs
  document.querySelectorAll('.iv4-ctx-tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.iv4-ctx-tab[data-tab]')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      InboxStore.set('contextTab', btn.dataset.tab);
    });
  });

  // ─── Reply Mode Tabs ─────────────────────────────────────────────────────
  document.querySelectorAll('.iv4-reply-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.iv4-reply-tab')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      InboxStore.set('replyMode', btn.dataset.mode);
      const textarea = $('iv4-reply-textarea');
      textarea.placeholder = btn.dataset.mode === 'note'
        ? 'اكتب ملاحظة داخلية...'
        : 'اكتب رسالتك...';
      textarea.style.background = btn.dataset.mode === 'note'
        ? '#fffbeb' : '';
    });
  });

  // Channel Select
  $('iv4-channel-select').addEventListener('change', e => {
    InboxStore.set('replyChannel', e.target.value || null);
  });

  // ─── Counts Update ───────────────────────────────────────────────────────
  InboxStore.on('counts:update', counts => {
    const map = {
      open:    'iv4-count-open',
      waiting: 'iv4-count-waiting',
      snoozed: 'iv4-count-snoozed',
    };
    Object.entries(map).forEach(([key, id]) => {
      const el = $(id);
      if (!el) return;
      const n = counts[key] || 0;
      el.textContent = n > 0 ? n : '';
    });
  });

  // ─── Active Conv UI (show/hide chat area) ────────────────────────────────
  // show/hide chat area يتولاها chat.js عبر _showEmpty() و _onConvOpen()

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Escape: إغلاق البحث
    if (e.key === 'Escape' && InboxStore.state.searchOpen) {
      $('iv4-search-close').click();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────────
  // ─── Route Guards (M1 T09) ───────────────────────────────────────────────
  /**
   * يتحقق من صلاحية قبل فتح أي section
   * @param {string} permKey - مفتاح الصلاحية
   * @param {string} [msg]   - رسالة خطأ مخصصة
   * @returns {boolean}
   */
  function guardRoute(permKey, msg) {
    if (!InboxStore.can(permKey)) {
      const errorMsg = msg || 'ليس لديك صلاحية للوصول لهذا القسم';
      if (typeof toast === 'function') toast(errorMsg, 'error');
      else if (typeof window.showInboxToast === 'function') window.showInboxToast(errorMsg, 'error');
      return false;
    }
    return true;
  }

  /**
   * تحميل بيانات المستخدم الحالي وصلاحياته في InboxStore
   * يُستدعى مرة واحدة عند init
   */
  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/user/me');
      if (!res.ok) return;
      const data = await res.json();
      // data قد يحتوي على: id, name, email, inbox_role_id, role_name, permissions
      if (data && data.id) {
        InboxStore.set('currentUser', {
          id:            data.id,
          name:          data.name          || '',
          email:         data.email         || '',
          role_name:     data.role_name     || '',
          inbox_role_id: data.inbox_role_id || null,
          permissions:   data.permissions   || {},
        });
      }
    } catch (_) {
      // silent — يُطبق الـ DEFAULT_PERMISSIONS في الـ backend
    }
  }

  function init() {
    // تحميل بيانات المستخدم وصلاحياته (M1 T09)
    loadCurrentUser();

    // اتصل بـ SSE
    InboxStream.connect();

    // Phase 1 — Conversations List + Chat Window
    InboxConvList.init();
    InboxChat.init();  // P1-2 ✅
    InboxReply.init(); // P1-3 ✅

    // Phase 2 — Team Assignment
    InboxTeam.init();  // P2-1 ✅

    // Phase 3 — Labels + Tags
    if (typeof InboxLabels !== 'undefined') InboxLabels.init();  // P3-1 ✅

    // Phase 5 — Context Panel
    if (typeof InboxContext !== 'undefined') InboxContext.init(); // P5-1 ✅

    // Phase 6 — Analytics Dashboard
    if (typeof InboxAnalytics !== 'undefined') {
      const analyticsBtn = $('iv4-analytics-btn');
      if (analyticsBtn) {
        analyticsBtn.addEventListener('click', () => {
          if (!guardRoute('reports_self', 'ليس لديك صلاحية لعرض التقارير')) return;
          InboxAnalytics.open();
        });
      }
    }

    // Phase 4-2 — Chatbot Flows
    if (typeof InboxChatbot    !== 'undefined') InboxChatbot.init();    // P4-2 ✅

    // Phase 4-3 — Welcome + Away Messages
    if (typeof InboxAutomation  !== 'undefined') InboxAutomation.init();  // P4-3 ✅

    // Phase 4-5 — Scheduled Messages
    if (typeof InboxScheduled   !== 'undefined') InboxScheduled.init();   // P4-5 ✅

    // Phase 7-1 — AI Features
    if (typeof InboxAI          !== 'undefined') InboxAI.init();           // P7-1 ✅

    // Phase 8-2 — WA Interactive Messages
    if (typeof InboxInteractive !== 'undefined') InboxInteractive.init();  // P8-2 ✅

    // Phase 8-3 — WA Catalog Products
    if (typeof InboxCatalog !== 'undefined') InboxCatalog.init();           // P8-3 ✅

    // Phase 8-4 — Broadcast V2
    if (typeof InboxBroadcast !== 'undefined') InboxBroadcast.init();       // P8-4 ✅

    // Phase 8-5 — Webhook Triggers
    if (typeof InboxWebhooks  !== 'undefined') InboxWebhooks.init();        // P8-5 ✅

    // Phase 8-1 — Email Channel
    if (typeof InboxEmail !== 'undefined') InboxEmail.init();               // P8-1 ✅

    // ─── New Conversation Button (D1) ──────────────────────────────────
    const newConvBtn = $('iv4-new-conv-btn');
    if (newConvBtn) {
      newConvBtn.addEventListener('click', () => {
        _openNewConvModal();
      });
    }

    // expose showInboxToast + guardRoute globally (for modules)
    window.showInboxToast = toast;
    window.inboxGuard = guardRoute;

    console.log('[Inbox v4] ✅ جاهز');
  }

  // ─── New Conversation Modal ────────────────────────────────────────
  function _openNewConvModal() {
    // أزل أي modal سابق
    const existing = document.getElementById('iv4-new-conv-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-new-conv-modal';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999',
      'display:flex;align-items:center;justify-content:center',
    ].join(';');

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:420px;max-width:95vw;direction:rtl">
        <h3 style="margin:0 0 16px;font-size:17px">&#x2709;&#xFE0F; محادثة جديدة</h3>
        <div style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">المنصة</label>
          <select id="iv4-nc-platform" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px">
            <option value="whatsapp_api">WhatsApp API</option>
            <option value="whatsapp_qr">WhatsApp QR</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Messenger</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">رقم الهاتف / ID</label>
          <input id="iv4-nc-phone" type="text" placeholder="مثال: 201012345678" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box">
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">الاسم (اختياري)</label>
          <input id="iv4-nc-name" type="text" placeholder="اسم العميل" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box">
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">رسالة أولى (اختيارية)</label>
          <textarea id="iv4-nc-message" rows="3" placeholder="كتب رسالتك هنا..." style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="iv4-nc-cancel" style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:14px">إلغاء</button>
          <button id="iv4-nc-submit" style="padding:8px 16px;border:none;border-radius:8px;background:#1B5E30;color:#fff;cursor:pointer;font-size:14px;font-weight:600">إنشاء</button>
        </div>
        <div id="iv4-nc-error" style="color:red;font-size:13px;margin-top:8px;display:none"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // close on overlay click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('iv4-nc-cancel').addEventListener('click', () => overlay.remove());

    // submit
    document.getElementById('iv4-nc-submit').addEventListener('click', async () => {
      const platform = document.getElementById('iv4-nc-platform').value;
      const phone    = document.getElementById('iv4-nc-phone').value.trim();
      const name     = document.getElementById('iv4-nc-name').value.trim();
      const message  = document.getElementById('iv4-nc-message').value.trim();
      const errEl    = document.getElementById('iv4-nc-error');
      const submitBtn = document.getElementById('iv4-nc-submit');

      if (!phone) {
        errEl.textContent = 'رقم الهاتف / ID مطلوب';
        errEl.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري...';
      errEl.style.display = 'none';

      const { data, error } = await InboxAPI.newConversation.create({
        platform, phone, name, message: message || undefined
      });

      if (error) {
        errEl.textContent = error.message || 'حدث خطأ — حاول مرة أخرى';
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'إنشاء';
        return;
      }

      overlay.remove();
      toast(data.created ? '✅ تم إنشاء المحادثة' : 'المحادثة موجودة بالفعل', 'success');

      // افتح المحادثة الجديدة تلقائياً
      if (data.conversation && data.conversation.id) {
        InboxStore.upsertConversation(data.conversation);
        InboxStore.setActive(data.conversation.id);
      }
    });
  }

  // expose init للاستخدام من page-inbox.js
  window.InboxApp = { init, loadCurrentUser };

})();
