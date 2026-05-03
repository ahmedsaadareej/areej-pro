/**
 * InboxStream — SSE manager لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * يتصل بـ /api/inbox/stream ويوزّع الأحداث على InboxStore
 *
 * الاستخدام:
 *   InboxStream.connect()    ← عند فتح الـ inbox
 *   InboxStream.disconnect() ← عند الخروج من الـ inbox
 */

const InboxStream = (() => {

  let _es = null;          // EventSource instance
  let _reconnectTimer = null;
  const MAX_RECONNECT = 5;
  const RECONNECT_DELAY_MS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff

  // ─── Connect ─────────────────────────────────────────────────────────

  function connect() {
    if (_es && _es.readyState !== EventSource.CLOSED) return; // متصل بالفعل

    _es = new EventSource('/api/inbox/stream');

    // ─── open ───
    _es.addEventListener('open', () => {
      InboxStore.set('sseConnected', true);
      InboxStore.set('sseReconnectAttempts', 0);
      console.log('[InboxStream] متصل ✅');
    });

    // ─── error ───
    _es.addEventListener('error', () => {
      InboxStore.set('sseConnected', false);
      _es.close();
      _es = null;
      _scheduleReconnect();
    });

    // ─── connected (تأكيد من السيرفر) ───
    _es.addEventListener('connected', (e) => {
      const data = _parse(e.data);
      console.log('[InboxStream] server confirmed:', data);
    });

    // ─── conv:new ───
    _es.addEventListener('conv:new', (e) => {
      const conv = _parse(e.data);
      if (!conv) return;
      InboxStore.upsertConversation(conv);
      // صوت تنبيه لو الرسالة من العميل (direction: in)
      if (conv.last_message_dir === 'in') {
        InboxStore.emit('notification:new', conv);
      }
    });

    // ─── conv:update ───
    _es.addEventListener('conv:update', (e) => {
      const conv = _parse(e.data);
      if (!conv) return;
      InboxStore.upsertConversation(conv);
    });

    // ─── conv:removed ───
    _es.addEventListener('conv:removed', (e) => {
      const data = _parse(e.data);
      if (!data || !data.id) return;
      InboxStore.removeConversation(data.id);
    });

    // ─── message:new ───
    _es.addEventListener('message:new', (e) => {
      const msg = _parse(e.data);
      if (!msg) return;
      // أضف الرسالة فقط لو هي تخص المحادثة الفعالة
      if (msg.conversation_id === InboxStore.state.activeConvId) {
        InboxStore.addMessage(msg);
      }
      // حدّث preview المحادثة في القائمة دائماً
      InboxStore.upsertConversation({
        id: msg.conversation_id,
        last_message_text: msg.content,
        last_message_dir: msg.direction,
        last_message_at: msg.sent_at,
        // زيادة unread_count لو الرسالة من العميل ومش في المحادثة الفعالة
        ...(msg.direction === 'in' && msg.conversation_id !== InboxStore.state.activeConvId
          ? {} : {}), // يُحدَّث من السيرفر عبر conv:update
      });
    });

    // ─── counts:update ───
    _es.addEventListener('counts:update', (e) => {
      const counts = _parse(e.data);
      if (!counts) return;
      InboxStore.updateCounts(counts);
    });

    // ─── agent:status ───
    _es.addEventListener('agent:status', (e) => {
      const data = _parse(e.data);
      if (!data || !data.agent_id) return;
      InboxStore.state.agentStatuses[data.agent_id] = data.status;
      InboxStore.emit('agentStatuses:update', InboxStore.state.agentStatuses);
    });
  }

  // ─── Disconnect ───────────────────────────────────────────────────────

  function disconnect() {
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    if (_es) {
      _es.close();
      _es = null;
    }
    InboxStore.set('sseConnected', false);
    InboxStore.set('sseReconnectAttempts', 0);
    console.log('[InboxStream] قُطع الاتصال');
  }

  // ─── Reconnect ────────────────────────────────────────────────────────

  function _scheduleReconnect() {
    const attempts = InboxStore.state.sseReconnectAttempts;
    if (attempts >= MAX_RECONNECT) {
      console.warn('[InboxStream] تجاوز الحد الأقصى لإعادة الاتصال');
      InboxStore.emit('sse:failed', { attempts });
      return;
    }
    const delay = RECONNECT_DELAY_MS[attempts] || 16000;
    console.log(`[InboxStream] إعادة الاتصال بعد ${delay}ms (محاولة ${attempts + 1})`);
    InboxStore.set('sseReconnectAttempts', attempts + 1);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      connect();
    }, delay);
  }

  // ─── Parse helper ─────────────────────────────────────────────────────

  function _parse(str) {
    try { return JSON.parse(str); }
    catch (e) { return null; }
  }

  // ─── Visibility API — pause/resume SSE عند إخفاء الـ tab ─────────────

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // لو الاتصال انقطع وهو في الخلفية → أعد الاتصال فوراً
      if (!_es || _es.readyState === EventSource.CLOSED) {
        connect();
      }
    }
    // لما الـ tab يختفي: EventSource يكمل شغّال (SSE بيدير نفسه)
    // ما نقطعه عشان نضمن استقبال الرسائل في الخلفية
  });

  // ─── Public API ───────────────────────────────────────────────────────
  return { connect, disconnect };
})();

window.InboxStream = InboxStream;
