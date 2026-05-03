/**
 * InboxStore — Single Source of Truth لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * الاستخدام:
 *   InboxStore.state.conversations  ← قرأ الـ state
 *   InboxStore.set('activeConvId', 42)  ← عدّل قيمة
 *   InboxStore.on('activeConvId:change', fn)  ← استمع للتغيير
 *   InboxStore.emit('conv:new', conv)  ← أطلق حدث
 */

const InboxStore = (() => {
  // ─── الـ State الأساسي ───────────────────────────────────────────────
  const state = {
    // المحادثات
    conversations: [],          // كل المحادثات المحملة
    convTotal: 0,               // إجمالي عدد المحادثات (للـ pagination)
    convPage: 1,
    convLoading: false,

    // المحادثة الفعالة
    activeConvId: null,
    activeConv: null,           // كامل بيانات المحادثة المفتوحة

    // الرسائل
    messages: [],               // رسائل المحادثة الفعالة
    messagesLoading: false,
    messagesHasMore: true,      // لو في رسائل أقدم (load more)

    // الفلاتر
    filters: {
      status: 'open',           // open | waiting | closed | snoozed | all
      platform: null,           // telegram | whatsapp | ... | null = الكل
      labelId: null,            // null = الكل
      assignedFilter: 'all',    // all | mine | unassigned
      search: '',
      priority: null,
    },

    // الـ Labels
    labels: [],
    labelsLoading: false,

    // الفريق
    agents: [],
    agentStatuses: {},          // { agentId: 'online' | 'busy' | 'away' | 'offline' }

    // الإحصائيات
    counts: {
      open: 0,
      waiting: 0,
      snoozed: 0,
      unread: 0,
    },

    // إعدادات الرد
    replyMode: 'reply',         // reply | note
    replyChannel: null,         // null = منصة المحادثة الأصلية

    // الـ SSE
    sseConnected: false,
    sseReconnectAttempts: 0,

    // UI
    contextTab: 'contact',      // contact | invoices | orders | pay | notes
    searchOpen: false,
    bulkSelected: new Set(),    // IDs المحادثات المحددة

    // الـ current user (يُملأ عند init)
    currentUser: null,
  };

  // ─── نظام الأحداث ───────────────────────────────────────────────────
  const _listeners = {};

  /**
   * الاستماع لحدث
   * @param {string} event - اسم الحدث
   * @param {Function} fn - الـ handler
   * @returns {Function} - دالة إلغاء الاشتراك
   */
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    // يُرجع دالة لإلغاء الاشتراك
    return () => off(event, fn);
  }

  /**
   * إلغاء الاستماع لحدث
   */
  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(h => h !== fn);
  }

  /**
   * إطلاق حدث
   * @param {string} event - اسم الحدث
   * @param {*} data - البيانات المرسلة مع الحدث
   */
  function emit(event, data) {
    (_listeners[event] || []).forEach(fn => {
      try { fn(data); }
      catch (e) { console.error(`[InboxStore] خطأ في handler "${event}":`, e); }
    });
    // أطلق حدث wildcard للـ debugging
    (_listeners['*'] || []).forEach(fn => {
      try { fn(event, data); }
      catch (e) {}
    });
  }

  // ─── تعديل الـ State ─────────────────────────────────────────────────

  /**
   * تعديل قيمة واحدة في الـ state
   * @param {string} key - المفتاح
   * @param {*} value - القيمة الجديدة
   * @param {boolean} silent - لو true: لا يُطلق حدث change
   */
  function set(key, value, silent = false) {
    const old = state[key];
    state[key] = value;
    if (!silent && old !== value) {
      emit(`${key}:change`, { key, value, old });
      emit('state:change', { key, value, old });
    }
  }

  /**
   * تعديل قيم متعددة دفعة واحدة
   * @param {Object} patch - { key: value, ... }
   * @param {boolean} silent - لو true: لا يُطلق أحداث
   */
  function patch(patch, silent = false) {
    Object.entries(patch).forEach(([key, value]) => set(key, value, silent));
    if (!silent) emit('state:patched', patch);
  }

  /**
   * تعديل الفلاتر مع reset للـ pagination
   * @param {Object} filterPatch - الفلاتر الجديدة
   */
  function setFilter(filterPatch) {
    const old = { ...state.filters };
    Object.assign(state.filters, filterPatch);
    set('convPage', 1, true);
    emit('filters:change', { filters: state.filters, old });
  }

  // ─── Conversations Helpers ────────────────────────────────────────────

  /**
   * تحديث محادثة موجودة أو إضافتها في المقدمة
   * @param {Object} conv - بيانات المحادثة
   */
  function upsertConversation(conv) {
    const idx = state.conversations.findIndex(c => c.id === conv.id);
    if (idx >= 0) {
      state.conversations[idx] = { ...state.conversations[idx], ...conv };
    } else {
      state.conversations.unshift(conv);
      state.convTotal += 1;
    }
    // لو هي الفعالة → حدّث activeConv
    if (state.activeConvId === conv.id) {
      state.activeConv = { ...state.activeConv, ...conv };
      emit('activeConv:update', state.activeConv);
    }
    emit('conversations:update', state.conversations);
  }

  /**
   * حذف محادثة من القائمة
   * @param {number} convId
   */
  function removeConversation(convId) {
    state.conversations = state.conversations.filter(c => c.id !== convId);
    state.convTotal = Math.max(0, state.convTotal - 1);
    if (state.activeConvId === convId) {
      set('activeConvId', null);
      set('activeConv', null);
      set('messages', []);
    }
    emit('conversations:update', state.conversations);
  }

  /**
   * فتح محادثة (تغيير الفعالة)
   * @param {number|null} convId
   */
  function openConversation(convId) {
    if (state.activeConvId === convId) return;
    set('activeConvId', convId);
    set('activeConv', state.conversations.find(c => c.id === convId) || null);
    set('messages', []);
    set('messagesHasMore', true);
    set('replyChannel', null, true); // reset channel override
    set('bulkSelected', new Set(), true);
    emit('conv:open', convId);
  }

  // ─── Messages Helpers ─────────────────────────────────────────────────

  /**
   * إضافة رسالة جديدة (optimistic أو من SSE)
   * @param {Object} msg - الرسالة
   */
  function addMessage(msg) {
    // تجنب التكرار بالـ platform_msg_id أو id
    const exists = state.messages.some(m =>
      (msg.id && m.id === msg.id) ||
      (msg.platform_msg_id && m.platform_msg_id === msg.platform_msg_id && msg.platform_msg_id)
    );
    if (exists) {
      // حدّث الموجود (مثلاً تغيير status من pending → sent)
      state.messages = state.messages.map(m => {
        if (msg.id && m.id === msg.id) return { ...m, ...msg };
        if (msg.platform_msg_id && m.platform_msg_id === msg.platform_msg_id) return { ...m, ...msg };
        return m;
      });
    } else {
      state.messages.push(msg);
    }
    emit('messages:update', state.messages);
  }

  /**
   * إضافة رسائل قديمة في المقدمة (load more)
   * @param {Array} msgs - الرسائل الأقدم
   * @param {boolean} hasMore - هل في أقدم منها؟
   */
  function prependMessages(msgs, hasMore) {
    state.messages = [...msgs, ...state.messages];
    set('messagesHasMore', hasMore);
    emit('messages:prepend', msgs);
  }

  // ─── Counts Helpers ───────────────────────────────────────────────────

  /**
   * تحديث عدادات الـ inbox
   * @param {Object} counts
   */
  function updateCounts(counts) {
    Object.assign(state.counts, counts);
    emit('counts:update', state.counts);
  }

  // ─── Bulk Selection Helpers ───────────────────────────────────────────

  function toggleBulkSelect(convId) {
    const s = new Set(state.bulkSelected);
    if (s.has(convId)) s.delete(convId);
    else s.add(convId);
    set('bulkSelected', s);
  }

  function clearBulkSelect() {
    set('bulkSelected', new Set());
  }

  function selectAllVisible() {
    set('bulkSelected', new Set(state.conversations.map(c => c.id)));
  }

  // ─── Reset ────────────────────────────────────────────────────────────

  /**
   * reset كامل (عند logout أو تغيير tenant)
   */
  function reset() {
    patch({
      conversations: [],
      convTotal: 0,
      convPage: 1,
      convLoading: false,
      activeConvId: null,
      activeConv: null,
      messages: [],
      messagesLoading: false,
      messagesHasMore: true,
      labels: [],
      agents: [],
      agentStatuses: {},
      counts: { open: 0, waiting: 0, snoozed: 0, unread: 0 },
      replyMode: 'reply',
      replyChannel: null,
      sseConnected: false,
      sseReconnectAttempts: 0,
      contextTab: 'contact',
      searchOpen: false,
      bulkSelected: new Set(),
    }, true);
    emit('store:reset', null);
  }

  // ─── Public API ───────────────────────────────────────────────────────
  return {
    state,
    on,
    off,
    emit,
    set,
    patch,
    setFilter,
    upsertConversation,
    removeConversation,
    openConversation,
    addMessage,
    prependMessages,
    updateCounts,
    toggleBulkSelect,
    clearBulkSelect,
    selectAllVisible,
    reset,
  };
})();

// اجعله متاحاً globally
window.InboxStore = InboxStore;
