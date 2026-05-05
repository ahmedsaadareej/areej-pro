/* ============================================================
   Inbox v4 — Page Module: Inbox
   يُحمَّل من InboxShell عند /inbox أو /inbox/conv/:id
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageInbox = (() => {

  let _mounted = false;

  // ── New Conversation Modal ──────────────────────────────────────────────
  function _openNewConvModal() {
    // نتحقق من الـ active channels لتحديد الـ Smart Default
    const _getDefaultPlatform = () => {
      if (typeof InboxStore !== 'undefined' && InboxStore.state) {
        const ch = InboxStore.state.activeChannel;
        if (ch) return ch;
      }
      return 'whatsapp_api';
    };

    // إنشاء الـ modal
    const existing = document.getElementById('iv4-new-conv-modal');
    if (existing) existing.remove();

    const defPlatform = _getDefaultPlatform();

    const overlay = document.createElement('div');
    overlay.id = 'iv4-new-conv-modal';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;
      display:flex;align-items:center;justify-content:center;
      font-family:Cairo,sans-serif;direction:rtl;
    `;

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 24px;width:420px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;font-size:17px;font-weight:700;color:#111">✏️ محادثة جديدة</h3>
          <button id="iv4-ncm-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;line-height:1">✕</button>
        </div>

        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المنصة</label>
        <select id="iv4-ncm-platform" style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;margin-bottom:14px;color:#111">
          <option value="whatsapp_api" ${defPlatform==='whatsapp_api'?'selected':''}>واتساب API</option>
          <option value="whatsapp_qr"  ${defPlatform==='whatsapp_qr'?'selected':''}>واتساب QR</option>
          <option value="telegram"     ${defPlatform==='telegram'?'selected':''}>تيليجرام</option>
        </select>

        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم الهاتف / المعرّف</label>
        <input id="iv4-ncm-phone" type="text" placeholder="مثال: 201012345678" style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;margin-bottom:14px;box-sizing:border-box">

        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الاسم (اختياري)</label>
        <input id="iv4-ncm-name" type="text" placeholder="اسم العميل" style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;margin-bottom:14px;box-sizing:border-box">

        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رسالة أولى (اختياري)</label>
        <textarea id="iv4-ncm-msg" rows="2" placeholder="مرحباً..." style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;margin-bottom:20px;resize:vertical;box-sizing:border-box"></textarea>

        <div style="display:flex;gap:10px;">
          <button id="iv4-ncm-submit" style="flex:1;background:#2563eb;color:#fff;border:none;padding:11px;border-radius:8px;font-family:Cairo,sans-serif;font-size:14px;font-weight:700;cursor:pointer">إنشاء المحادثة</button>
          <button id="iv4-ncm-cancel" style="padding:11px 18px;border:1.5px solid #e5e7eb;background:#f9fafb;border-radius:8px;font-family:Cairo,sans-serif;font-size:14px;cursor:pointer;color:#374151">إلغاء</button>
        </div>

        <div id="iv4-ncm-status" style="margin-top:10px;font-size:12px;text-align:center;color:#6b7280;min-height:18px"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const _close = () => overlay.remove();
    document.getElementById('iv4-ncm-close').onclick = _close;
    document.getElementById('iv4-ncm-cancel').onclick = _close;
    overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

    // Focus phone input
    setTimeout(() => document.getElementById('iv4-ncm-phone')?.focus(), 50);

    // Submit
    document.getElementById('iv4-ncm-submit').onclick = async () => {
      const platform = document.getElementById('iv4-ncm-platform').value;
      const phone    = document.getElementById('iv4-ncm-phone').value.trim().replace(/\s+/g, '');
      const name     = document.getElementById('iv4-ncm-name').value.trim();
      const message  = document.getElementById('iv4-ncm-msg').value.trim();
      const status   = document.getElementById('iv4-ncm-status');

      if (!phone) { status.style.color = '#ef4444'; status.textContent = '⚠️ أدخل رقم الهاتف أو المعرّف'; return; }

      status.style.color = '#6b7280';
      status.textContent = 'جاري الإنشاء...';
      document.getElementById('iv4-ncm-submit').disabled = true;

      try {
        const res = await fetch('/api/inbox/new-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ platform, phone, name: name || phone, message: message || undefined })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'فشل الإنشاء');

        _close();
        // افتح المحادثة الجديدة
        if (typeof InboxChat !== 'undefined' && InboxChat.openConversation) {
          InboxChat.openConversation(data.conversation.id);
        }
        if (typeof InboxConvList !== 'undefined' && InboxConvList.fetchConversations) {
          InboxConvList.fetchConversations();
        }
      } catch (err) {
        status.style.color = '#ef4444';
        status.textContent = '❌ ' + err.message;
        document.getElementById('iv4-ncm-submit').disabled = false;
      }
    };

    // Enter key على phone input → submit
    document.getElementById('iv4-ncm-phone').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('iv4-ncm-submit').click();
    });
  }

  return {
    mount(container, params) {
      _mounted = true;

      // حقن الـ HTML الكامل لـ Inbox (3-column layout + كل الـ IDs)
      container.innerHTML = `<div id="iv4-app" class="iv4-root">
        <!-- ── Col 1: Sidebar (Labels + Filters) ── -->
            <aside id="iv4-sidebar" class="iv4-sidebar">
        
              <!-- Logo / Brand -->
              <div class="iv4-sidebar-brand">
                <span class="iv4-brand-icon">💬</span>
                <span class="iv4-brand-text">Inbox</span>
              </div>
        
              <!-- Status Filters -->
              <nav class="iv4-status-nav" id="iv4-status-nav">
                <button class="iv4-nav-btn active" data-filter="open">
                  <span class="iv4-nav-icon">📥</span>
                  <span class="iv4-nav-label">مفتوحة</span>
                  <span class="iv4-nav-count" id="iv4-count-open">0</span>
                </button>
                <button class="iv4-nav-btn" data-filter="waiting">
                  <span class="iv4-nav-icon">⏳</span>
                  <span class="iv4-nav-label">انتظار</span>
                  <span class="iv4-nav-count" id="iv4-count-waiting">0</span>
                </button>
                <button class="iv4-nav-btn" data-filter="snoozed">
                  <span class="iv4-nav-icon">⏰</span>
                  <span class="iv4-nav-label">مؤجلة</span>
                  <span class="iv4-nav-count" id="iv4-count-snoozed">0</span>
                </button>
                <button class="iv4-nav-btn" data-filter="closed">
                  <span class="iv4-nav-icon">✅</span>
                  <span class="iv4-nav-label">مغلقة</span>
                  <span class="iv4-nav-count"></span>
                </button>
                <button class="iv4-nav-btn" data-filter="all">
                  <span class="iv4-nav-icon">📋</span>
                  <span class="iv4-nav-label">الكل</span>
                  <span class="iv4-nav-count"></span>
                </button>
              </nav>
        
              <!-- Divider -->
              <div class="iv4-sidebar-divider"></div>
        
              <!-- Assignment Filters -->
              <nav class="iv4-assign-nav">
                <button class="iv4-nav-btn active" data-assign="all">
                  <span class="iv4-nav-icon">👥</span>
                  <span class="iv4-nav-label">الكل</span>
                </button>
                <button class="iv4-nav-btn" data-assign="mine">
                  <span class="iv4-nav-icon">👤</span>
                  <span class="iv4-nav-label">ملكي</span>
                </button>
                <button class="iv4-nav-btn" data-assign="unassigned">
                  <span class="iv4-nav-icon">❓</span>
                  <span class="iv4-nav-label">غير معيّن</span>
                </button>
              </nav>
        
              <!-- Divider -->
              <div class="iv4-sidebar-divider"></div>
        
              <!-- Priority Filters -->
              <div class="iv4-priority-section">
                <div class="iv4-section-header">
                  <span>الأولوية</span>
                </div>
                <div id="iv4-priority-filters" class="iv4-priority-filters">
                  <!-- تُحمّل ديناميكياً -->
                </div>
              </div>
        
              <!-- Divider -->
              <div class="iv4-sidebar-divider"></div>
        
              <!-- Labels -->
              <div class="iv4-labels-section">
                <div class="iv4-section-header">
                  <span>Labels</span>
                  <button id="iv4-add-label-btn" class="iv4-icon-btn" title="إنشاء label جديدة">+</button>
                </div>
                <div id="iv4-labels-list" class="iv4-labels-list">
                  <!-- تُحمَّل ديناميكياً -->
                </div>
              </div>
        
              <!-- Analytics Button -->
              <div class="iv4-sidebar-divider"></div>
              <button id="iv4-analytics-btn" class="iv4-nav-btn iv4-analytics-nav-btn" title="لوحة الإحصاءات">
                <span class="iv4-nav-icon">📊</span>
                <span class="iv4-nav-label">الإحصاءات</span>
              </button>
        
              <!-- Settings Shortcut -->
              <button class="iv4-nav-btn" data-action="open-settings" title="الإعدادات">
                <span class="iv4-nav-icon">⚙️</span>
                <span class="iv4-nav-label">الإعدادات</span>
              </button>
        
              <!-- Spacer -->
              <div class="iv4-sidebar-spacer"></div>
        
              <!-- Agent Status Widget (P2-1) -->
              <div id="inbox-agent-status-widget"></div>
        
              <!-- SSE Status Indicator -->
              <div class="iv4-sse-indicator" id="iv4-sse-indicator" title="حالة الاتصال">
                <span class="iv4-sse-dot" id="iv4-sse-dot"></span>
                <span class="iv4-sse-label" id="iv4-sse-label">جارٍ الاتصال...</span>
              </div>
        
            </aside>
        
            <!-- ── Col 2: Conversations List ── -->
            <section id="iv4-conv-col" class="iv4-conv-col">
        
              <!-- Header: Search + New + Bulk -->
              <div class="iv4-conv-header">
                <div class="iv4-conv-header-top">
                  <h2 class="iv4-col-title" id="iv4-col-title">مفتوحة</h2>
                  <div class="iv4-conv-header-actions">
                    <button id="iv4-search-btn" class="iv4-icon-btn" title="بحث">🔍</button>
                    <button id="iv4-new-conv-btn" class="iv4-icon-btn" title="محادثة جديدة">✏️</button>
                  </div>
                </div>
        
                <!-- Search Bar (مخفي افتراضياً) -->
                <div id="iv4-search-bar" class="iv4-search-bar hidden">
                  <input
                    type="text"
                    id="iv4-search-input"
                    class="iv4-search-input"
                    placeholder="ابحث في المحادثات..."
                    autocomplete="off"
                  />
                  <button id="iv4-search-close" class="iv4-icon-btn">✕</button>
                </div>
        
                <!-- Bulk Toolbar (يظهر عند تحديد محادثات) -->
                <div id="iv4-bulk-toolbar" class="iv4-bulk-toolbar hidden">
                  <label class="iv4-bulk-select-all">
                    <input type="checkbox" id="iv4-select-all" />
                    <span id="iv4-selected-count">0</span>
                  </label>
                  <div class="iv4-bulk-actions">
                    <button class="iv4-bulk-btn" data-bulk-action="status" data-bulk-value="closed" title="إغلاق">✅ إغلاق</button>
                    <button class="iv4-bulk-btn" data-bulk-action="status" data-bulk-value="open"   title="إعادة فتح">📥 فتح</button>
                    <button class="iv4-bulk-btn iv4-bulk-btn--danger" data-bulk-action="delete" title="حذف">🗑 حذف</button>
                  </div>
                  <button id="iv4-bulk-cancel" class="iv4-icon-btn" title="إلغاء">✕</button>
                </div>
        
                <!-- Platform Filter -->
                <div class="iv4-platform-filter" id="iv4-platform-filter">
                  <button class="iv4-plat-btn active" data-platform="">الكل</button>
                  <button class="iv4-plat-btn" data-platform="whatsapp">WA</button>
                  <button class="iv4-plat-btn" data-platform="telegram">TG</button>
                  <button class="iv4-plat-btn" data-platform="instagram">IG</button>
                  <button class="iv4-plat-btn" data-platform="messenger">FB</button>
                </div>
              </div>
        
              <!-- Conversations List -->
              <div id="iv4-conv-list" class="iv4-conv-list">
                <!-- skeleton loading -->
                <div class="iv4-skeleton-list" id="iv4-skeleton">
                  <div class="iv4-skeleton-item"></div>
                  <div class="iv4-skeleton-item"></div>
                  <div class="iv4-skeleton-item"></div>
                  <div class="iv4-skeleton-item"></div>
                  <div class="iv4-skeleton-item"></div>
                </div>
              </div>
        
              <!-- Load More -->
              <div id="iv4-load-more" class="iv4-load-more hidden">
                <button id="iv4-load-more-btn">تحميل المزيد</button>
              </div>
        
            </section>
        
            <!-- ── Col 3: Chat + Context Panel ── -->
            <main id="iv4-chat-col" class="iv4-chat-col">
        
              <!-- Empty State (لما ما في محادثة مفتوحة) -->
              <div id="iv4-empty-state" class="iv4-empty-state">
                <div class="iv4-empty-icon">💬</div>
                <p class="iv4-empty-text">اختر محادثة للبدء</p>
              </div>
        
              <!-- Chat Area (مخفي حتى تُفتح محادثة) -->
              <div id="iv4-chat-area" class="iv4-chat-area hidden">
        
                <!-- Chat Header -->
                <div class="iv4-chat-header" id="iv4-chat-header">
                  <div class="iv4-chat-header-avatar" id="iv4-chat-avatar"></div>
                  <div class="iv4-chat-header-info">
                    <div class="iv4-chat-sender-name" id="iv4-chat-sender-name">—</div>
                    <div class="iv4-chat-meta" id="iv4-chat-meta">—</div>
                  </div>
                  <div class="iv4-chat-header-actions">
                    <button id="iv4-assign-btn"   class="iv4-icon-btn" title="تعيين">👤</button>
                    <button id="iv4-snooze-btn"   class="iv4-icon-btn" title="تأجيل">⏰</button>
                    <button id="iv4-priority-btn" class="iv4-icon-btn" title="الأولوية">🔺</button>
                    <button id="iv4-ai-summary-btn" class="iv4-icon-btn" title="ملخص AI">📋</button>
                    <button id="iv4-close-btn"    class="iv4-action-btn iv4-btn-close">إغلاق</button>
                  </div>
                </div>
        
                <!-- Messages Area -->
                <div id="iv4-messages" class="iv4-messages">
                  <!-- sentinel للـ IntersectionObserver (يُضاف ديناميكياً) -->
                  <button id="iv4-msg-load-more" class="iv4-load-older hidden">رسائل أقدم ▲</button>
                  <!-- الرسائل تُحمَّل ديناميكياً هنا -->
                </div>
        
                <!-- Reply Box -->
                <div id="iv4-reply-box" class="iv4-reply-box">
                  <!-- Mode Tabs: Reply / Note -->
                  <div class="iv4-reply-tabs">
                    <button class="iv4-reply-tab active" data-mode="reply">رد</button>
                    <button class="iv4-reply-tab" data-mode="note">ملاحظة داخلية</button>
                  </div>
        
                  <!-- Textarea -->
                  <textarea
                    id="iv4-reply-textarea"
                    class="iv4-reply-textarea"
                    placeholder="اكتب رسالتك..."
                    rows="3"
                  ></textarea>
        
                  <!-- Toolbar -->
                  <div class="iv4-reply-toolbar">
                    <div class="iv4-toolbar-left">
                      <button class="iv4-fmt-btn" data-fmt="bold"      title="Bold">𝐁</button>
                      <button class="iv4-fmt-btn" data-fmt="italic"    title="Italic">𝐼</button>
                      <button class="iv4-fmt-btn" data-fmt="strike"    title="Strike">S̶</button>
                      <button class="iv4-fmt-btn" data-fmt="mono"      title="Mono">⌥</button>
                      <span class="iv4-toolbar-sep"></span>
                      <button id="iv4-attach-btn"  class="iv4-icon-btn" title="إرفاق">📎</button>
                      <button id="iv4-catalog-btn" class="iv4-icon-btn" title="منتجات">📦</button>
                      <button id="iv4-ai-toolbar-btn" class="iv4-icon-btn iv4-ai-toolbar-btn" title="أدوات AI">✨ AI</button>
                      <button id="iv4-interactive-btn" class="iv4-icon-btn" title="رسالة تفاعلية (WA)">&#x26A1; أزرار</button>
                    </div>
                    <div class="iv4-toolbar-right">
                      <select id="iv4-channel-select" class="iv4-channel-select" title="منصة الإرسال">
                        <option value="">افتراضي</option>
                        <option value="telegram">Telegram</option>
                        <option value="whatsapp">WhatsApp QR</option>
                        <option value="whatsapp_api">WhatsApp API</option>
                        <option value="instagram">Instagram</option>
                        <option value="messenger">Messenger</option>
                      </select>
                      <button id="iv4-send-btn" class="iv4-send-btn">إرسال</button>
                    </div>
                  </div>
        
                  <!-- Hidden file input -->
                  <input type="file" id="iv4-file-input" class="hidden" multiple />
                </div>
        
              </div><!-- /iv4-chat-area -->
        
            </main>
        
            <!-- ── Context Panel (flyout من اليمين) ── -->
            <aside id="iv4-context-panel" class="iv4-context-panel hidden">
        
              <!-- Context Tabs -->
              <div class="iv4-ctx-tabs">
                <button class="iv4-ctx-tab active" data-tab="contact">👤</button>
                <button class="iv4-ctx-tab" data-tab="invoices">📄</button>
                <button class="iv4-ctx-tab" data-tab="orders">📦</button>
                <button class="iv4-ctx-tab" data-tab="pay">💳</button>
                <button class="iv4-ctx-tab" data-tab="notes">📝</button>
                <!-- زر إغلاق الـ panel -->
                <button id="iv4-ctx-close" class="iv4-ctx-close">✕</button>
              </div>
        
              <!-- Tab Content -->
              <div id="iv4-ctx-content" class="iv4-ctx-content">
                <!-- تُحمَّل ديناميكياً بـ context.js -->
              </div>
        
            </aside>
        
            <!-- زر فتح Context Panel (يظهر فوق الـ chat) -->
            <button id="iv4-ctx-toggle" class="iv4-ctx-toggle hidden" title="بيانات العميل">👤</button>
      </div>`;

      // تهيئة الـ Inbox App الكاملة
      if (typeof window._inboxAppInitialized === 'undefined') {
        window._inboxAppInitialized = false;
      }

      // تهيئة كاملة عبر InboxApp.init() (app.js)
      if (typeof InboxApp !== 'undefined') {
        InboxApp.init();
      } else {
        // fallback لو app.js ما اتحملش
        if (typeof InboxStream    !== 'undefined') InboxStream.connect();
        if (typeof InboxConvList  !== 'undefined') InboxConvList.init();
        if (typeof InboxChat      !== 'undefined') InboxChat.init();
        if (typeof InboxReply     !== 'undefined') InboxReply.init();
        if (typeof InboxTeam      !== 'undefined') InboxTeam.init();
        if (typeof InboxLabels    !== 'undefined') InboxLabels.init();
        if (typeof InboxContext   !== 'undefined') InboxContext.init();
        if (typeof InboxAI        !== 'undefined') InboxAI.init();
        if (typeof InboxBroadcast !== 'undefined') InboxBroadcast.init();
        if (typeof InboxInteractive !== 'undefined') InboxInteractive.init();
        if (typeof InboxCatalog   !== 'undefined') InboxCatalog.init();
      }

      // ربط أزرار الـ sidebar
      document.addEventListener('click', function _sidebarSettingsNav(e) {
        const action = e.target.closest('[data-action]')?.dataset?.action;
        if (!action) return;
        if (action === 'open-settings') {
          e.preventDefault();
          e.stopPropagation();
          if (typeof InboxRouter !== 'undefined') InboxRouter.navigate('/settings');
        }
      });

      // ── New Conversation Modal ──────────────────────────────────────────────
      const newConvBtn = document.getElementById('iv4-new-conv-btn');
      if (newConvBtn && !newConvBtn.dataset.bound) {
        newConvBtn.dataset.bound = '1';
        newConvBtn.addEventListener('click', () => _openNewConvModal());
      }

      // لو فيه convId في الـ params → افتح المحادثة مباشرة (Deep Link)
      if (params && params.convId) {
        // تأخير بسيط حتى تنتهي الـ init
        setTimeout(() => {
          if (typeof InboxChat !== 'undefined' && InboxChat.openConversation) {
            InboxChat.openConversation(parseInt(params.convId, 10));
          } else {
            InboxStore.set('activeConvId', parseInt(params.convId, 10));
          }
        }, 100);
      }

      _mounted = true;
      // FIX-004c: أعلم shell.js إن الـ Inbox جاهز
      document.dispatchEvent(new CustomEvent('inbox:mounted'));
    },

    unmount() {
      _mounted = false;
      // تنظيف أي intervals أو listeners لو احتجنا (مستقبلاً)
    }
  };
})();

window.PageInbox = PageInbox;
