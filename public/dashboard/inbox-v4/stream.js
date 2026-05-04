/**
 * InboxStream — SSE manager لـ Inbox v4
 * آخر تحديث: 2026-05-04
 *
 * الأحداث المدعومة:
 *   conv:new | conv:update | conv:removed | message:new
 *   counts:update | agent:status | conv:viewing | conv:viewing:stop
 *   note:mention (P2-4) | ping
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

  let _sseOpenTimer = null; // timeout لكشف Cloudflare buffering

  function connect() {
    if (_es && _es.readyState !== EventSource.CLOSED) return; // متصل بالفعل

    // EventSource لا يدعم Authorization header → نمرر الـ token في URL
    const _sseToken = InboxAPI._getToken ? InboxAPI._getToken() : (localStorage.getItem('pro_token') || '');
    _es = new EventSource('/api/inbox/stream' + (_sseToken ? '?_t=' + encodeURIComponent(_sseToken) : ''));

    // timeout: لو SSE لم يُفتح خلال 10s → Cloudflare يُبافِر → انتقل لـ Long Polling
    if (_sseOpenTimer) clearTimeout(_sseOpenTimer);
    _sseOpenTimer = setTimeout(() => {
      if (_es && _es.readyState === EventSource.CONNECTING) {
        console.warn('[InboxStream] SSE timeout (Cloudflare?) → Long Polling');
        _es.close();
        _es = null;
        InboxStore.set('sseReconnectAttempts', MAX_RECONNECT); // ابدأ fallback مباشرة
        InboxStore.emit('sse:failed', { reason: 'timeout' });
      }
    }, 10000);

    // ─── open ───
    _es.addEventListener('open', () => {
      if (_sseOpenTimer) { clearTimeout(_sseOpenTimer); _sseOpenTimer = null; }
      InboxStore.set('sseConnected', true);
      InboxStore.set('sseReconnectAttempts', 0);
      InboxStore.emit('sse:connected');
      console.log('[InboxStream] متصل ✅');
    });

    // ─── error ───
    _es.addEventListener('error', () => {
      if (_sseOpenTimer) { clearTimeout(_sseOpenTimer); _sseOpenTimer = null; }
      InboxStore.set('sseConnected', false);
      InboxStore.emit('sse:disconnected');
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

    // ─── conv:viewing (موظف آخر فتح هذه المحادثة — Collision Detection) ───
    _es.addEventListener('conv:viewing', (e) => {
      const data = _parse(e.data);
      if (!data || !data.conv_id) return;
      // أضف المشاهد للقائمة المحلية
      if (!InboxStore.state.convViewers) InboxStore.state.convViewers = {};
      if (!InboxStore.state.convViewers[data.conv_id]) {
        InboxStore.state.convViewers[data.conv_id] = {};
      }
      InboxStore.state.convViewers[data.conv_id][data.agent_id] = data.agent_name;
      InboxStore.emit('conv:viewing', data);
    });

    // ─── conv:viewing:stop (موظف أغلق المحادثة) ───
    _es.addEventListener('conv:viewing:stop', (e) => {
      const data = _parse(e.data);
      if (!data || !data.conv_id) return;
      // احذف المشاهد من القائمة
      if (InboxStore.state.convViewers && InboxStore.state.convViewers[data.conv_id]) {
        delete InboxStore.state.convViewers[data.conv_id][data.agent_id];
        if (Object.keys(InboxStore.state.convViewers[data.conv_id]).length === 0) {
          delete InboxStore.state.convViewers[data.conv_id];
        }
      }
      InboxStore.emit('conv:viewing:stop', data);
    });

    // ─── conv:transferred (تحويل محادثة لك — P2-5) ───
    _es.addEventListener('conv:transferred', (e) => {
      const data = _parse(e.data);
      if (!data || !data.conversation_id) return;

      // أبلغ InboxStore
      InboxStore.emit('conv:transferred', data);

      // عرض toast تنبيه: محادثة جديدة حُوّلت إليك
      _showTransferToast(data);
    });

    // ─── note:mention (تم ذكرك في نوتس — P2-4) ───
    _es.addEventListener('note:mention', (e) => {
      const data = _parse(e.data);
      if (!data) return;

      // أبلغ InboxStore ليرفع الـ toast + يفتح المحادثة
      InboxStore.emit('note:mention', data);

      // تنبيه toast مباشر إن كان InboxApp متاح
      if (typeof InboxApp !== 'undefined' && InboxApp.showMentionToast) {
        InboxApp.showMentionToast(data);
      } else {
        // fallback: toast بسيط
        _showMentionToast(data);
      }
    });

    // ─── conv:note_added (نوتة داخلية جديدة — P5-4) ───
    _es.addEventListener('conv:note_added', (e) => {
      const data = _parse(e.data);
      if (!data) return;
      InboxStore.emit('sse:conv:note_added', data);
    });

    // ─── conv:note_deleted (حذف نوتة — P5-4) ───
    _es.addEventListener('conv:note_deleted', (e) => {
      const data = _parse(e.data);
      if (!data) return;
      InboxStore.emit('sse:conv:note_deleted', data);
    });

    // ─── labels_update (تحديث labels — P3-1) ───
    _es.addEventListener('labels_update', (e) => {
      const data = _parse(e.data);
      if (!data) return;
      // أبلغ InboxLabels مباشرة
      InboxStore.emit('sse:labels_update', data);
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

  // ─── Mention Toast (P2-4) ───────────────────────────────────────────

  /**
   * عرض toast تنبيه بسيط عند ذكر الموظف في نوتس
   * @param {{ mentioned_by: {name}, conversation_id, content }} data
   */
  function _showMentionToast(data) {
    const container = document.getElementById('iv4-toasts');
    if (!container) return;

    const mentioner = data.mentioned_by?.name || 'موظف';
    const preview   = (data.content || '').slice(0, 60);
    const convId    = data.conversation_id;

    const el = document.createElement('div');
    el.className = 'iv4-toast iv4-toast--mention';
    el.innerHTML = `
      <div class="iv4-toast-mention-header">
        <span class="iv4-toast-mention-icon">🔔</span>
        <span class="iv4-toast-mention-title">ذكرك <strong>${_escHtml(mentioner)}</strong></span>
      </div>
      <div class="iv4-toast-mention-body">${_escHtml(preview)}</div>
    `;

    // انتقل للمحادثة عند النقر
    if (convId) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        InboxStore.set('activeConvId', convId);
        el.remove();
      });
    }

    container.appendChild(el);
    // أزل بعد 5 ثوانٍ
    setTimeout(() => el.remove(), 5000);
  }

  function _escHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * عرض toast تنبيه عند استلام محادثة محُوّلة (P2-5)
   * @param {{ contact_name, from_agent_name, transferred_by, note, conversation_id }} data
   */
  function _showTransferToast(data) {
    const container = document.getElementById('iv4-toasts');
    if (!container) return;

    const contact    = data.contact_name    || 'عميل';
    const fromAgent  = data.from_agent_name || 'موظف';
    const by         = data.transferred_by  || 'موظف';
    const convId     = data.conversation_id;

    const el = document.createElement('div');
    el.className = 'iv4-toast iv4-toast--transfer';
    el.innerHTML = `
      <div class="iv4-toast-transfer-header">
        <span class="iv4-toast-transfer-icon">↩️</span>
        <span class="iv4-toast-transfer-title">محادثة جديدة: <strong>${_escHtml(contact)}</strong></span>
      </div>
      <div class="iv4-toast-transfer-body">محولة من ${_escHtml(fromAgent)} • ${_escHtml(by)}</div>
      ${data.note ? `<div class="iv4-toast-transfer-note">${_escHtml(data.note.slice(0, 60))}</div>` : ''}
    `;

    if (convId) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        InboxStore.set('activeConvId', convId);
        el.remove();
      });
    }

    container.appendChild(el);
    setTimeout(() => el.remove(), 6000);
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

  // ─── Long Polling Fallback (Cloudflare يُبافِر SSE) ─────────────────────
  // يُفعَّل تلقائياً عندما SSE يفشل بعد MAX_RECONNECT محاولات
  let _pollActive = false;
  let _pollTimer  = null;
  let _pollSince  = Date.now();

  function _startPoll() {
    if (_pollActive) return;
    _pollActive = true;
    InboxStore.set('sseConnected', true); // أظهر للـ UI أن هناك اتصال
    InboxStore.emit('sse:connected');
    console.log('[InboxStream] SSE فشل — تحوَّل لـ Long Polling ⇄');
    _doPoll();
  }

  function _stopPoll() {
    _pollActive = false;
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  }

  async function _doPoll() {
    if (!_pollActive) return;
    const token = InboxAPI._getToken ? InboxAPI._getToken() : (localStorage.getItem('pro_token') || '');
    try {
      const res = await fetch('/api/inbox/poll?since=' + _pollSince, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const json = await res.json();
        _pollSince = json.t || Date.now();
        (json.events || []).forEach(ev => _dispatchPollEvent(ev.event, ev.data));
      }
    } catch (e) {
      // شبكة منقطعة — retry بعد 3 ثواني
    }
    if (_pollActive) _pollTimer = setTimeout(_doPoll, 1000);
  }

  // توزيع الـ events الواردة من Long Poll بنفس طريقة SSE handlers
  function _dispatchPollEvent(event, data) {
    if (!data) return;
    if (event === 'conv:new' || event === 'conv:update') {
      InboxStore.upsertConversation(data);
    } else if (event === 'conv:removed') {
      InboxStore.removeConversation(data.id);
    } else if (event === 'message:new') {
      if (data.conversation_id === InboxStore.state.activeConvId) InboxStore.addMessage(data);
      InboxStore.upsertConversation({
        id: data.conversation_id,
        last_message_text: data.content,
        last_message_dir:  data.direction,
        last_message_at:   data.sent_at
      });
    } else if (event === 'counts:update') {
      InboxStore.updateCounts(data);
    } else {
      InboxStore.emit('sse:' + event, data);
    }
  }

  // عند فشل SSE نهائياً → ابدأ Long Polling
  InboxStore.on('sse:failed', () => _startPoll());

  // ─── init() — يُستدعى من InboxShell.init() (D-028 + D-029) ─────────────
  let _initialized = false;

  function init() {
    if (_initialized) return;  // D-029: منع double-init
    _initialized = true;
    connect();
  }

  // ─── Public API ───────────────────────────────────────────────────────
  return { connect, disconnect, init };
})();

window.InboxStream = InboxStream;
