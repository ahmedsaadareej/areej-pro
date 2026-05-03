/**
 * app.js — Inbox v4 Entry Point
 * آخر تحديث: 2026-05-03
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

  let _searchDebounce = null;
  $('iv4-search-input').addEventListener('input', e => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      InboxStore.setFilter({ search: e.target.value.trim() });
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
  InboxStore.on('activeConvId:change', ({ value }) => {
    if (value) {
      $('iv4-empty-state').classList.add('hidden');
      $('iv4-chat-area').classList.remove('hidden');
      $('iv4-ctx-toggle').classList.remove('hidden');
    } else {
      $('iv4-empty-state').classList.remove('hidden');
      $('iv4-chat-area').classList.add('hidden');
      $('iv4-ctx-toggle').classList.add('hidden');
      $('iv4-context-panel').classList.add('hidden');
    }
  });

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Escape: إغلاق البحث
    if (e.key === 'Escape' && InboxStore.state.searchOpen) {
      $('iv4-search-close').click();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    // اتصل بـ SSE
    InboxStream.connect();

    // Phase 1 — Conversations List + Chat Window
    InboxConvList.init();
    InboxChat.init();  // P1-2 ✅

    console.log('[Inbox v4] ✅ جاهز');
  }

  // شغّل بعد تحميل الـ DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
