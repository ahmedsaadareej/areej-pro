/**
 * InboxAPI — كل الـ fetch calls لـ Inbox v4
 * آخر تحديث: 2026-05-04 (M5 T18 — InboxConfig object)
 *
 * كل method ترجع Promise<{ data, error }>
 * لا تُطلق exceptions — الأخطاء في { error }
 *
 * الاستخدام:
 *   const { data, error } = await InboxAPI.conversations.list({ status: 'open' });
 */

/**
 * InboxConfig — إعدادات الـ Inbox (D-044)
 * يمنع hardcoded URLs ويُمهّد لـ Standalone deployment مستقبلاً
 * \u062aعديل baseUrl فقط عند نشر مستقل عن ERP
 */
const InboxConfig = {
  baseUrl:  window.location.origin,
  apiBase:  '/api/inbox',
  authBase: '/api/auth',
  wsBase:   window.location.origin.replace(/^http/, 'ws'),
  version:  'v4',
};

const InboxAPI = (() => {

  // ─── Base Fetch ───────────────────────────────────────────────────────

  /**
   * fetch مع معالجة الأخطاء الموحدة
   * @param {string} path - المسار بدون /api
   * @param {RequestInit} options
   * @returns {Promise<{ data: any, error: string|null }>}
   */
  /** جلب الـ Bearer token من localStorage أو parent window */
  function _getToken() {
    try {
      return localStorage.getItem('pro_token') ||
             (window.parent !== window && window.parent.localStorage.getItem('pro_token')) ||
             '';
    } catch (_) { return ''; }
  }

  async function _fetch(path, options = {}) {
    try {
      const token = _getToken();
      const res = await fetch(`/api${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
          ...(options.headers || {}),
        },
        ...options,
      });

      // لو الـ response مش JSON (مثلاً 502)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { data: null, error: `HTTP ${res.status}` };
      }

      const json = await res.json();

      if (!res.ok) {
        return { data: null, error: json.error || json.message || `HTTP ${res.status}` };
      }

      return { data: json, error: null };
    } catch (e) {
      return { data: null, error: e.message || 'Network error' };
    }
  }

  function _get(path, params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') q.set(k, v);
    });
    const qs = q.toString();
    return _fetch(qs ? `${path}?${qs}` : path);
  }

  function _post(path, body = {}) {
    return _fetch(path, { method: 'POST', body: JSON.stringify(body) });
  }

  function _put(path, body = {}) {
    return _fetch(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  function _delete(path) {
    return _fetch(path, { method: 'DELETE' });
  }

  // ─── Conversations ────────────────────────────────────────────────────

  const conversations = {
    /**
     * قائمة المحادثات مع فلاتر
     */
    list({ status, platform, labelId, assignedFilter, search, priority, page = 1, limit = 30 } = {}) {
      return _get('/inbox/conversations', {
        status, platform, label_id: labelId,
        assigned_filter: assignedFilter,
        search, priority, page, limit,
      });
    },

    /**
     * بيانات محادثة واحدة
     */
    get(convId) {
      return _get(`/inbox/conversations/${convId}`);
    },

    /**
     * تغيير حالة محادثة
     */
    setStatus(convId, status) {
      return _put(`/inbox/conversations/${convId}/status`, { status });
    },

    /**
     * تعيين موظف للمحادثة
     */
    assign(convId, agentId) {
      return _put(`/inbox/conversations/${convId}/assign`, { agent_id: agentId });
    },

    /**
     * تأجيل (snooze)
     */
    snooze(convId, until) {
      return _put(`/inbox/conversations/${convId}/snooze`, { snooze_until: until });
    },

    /**
     * إلغاء التأجيل
     */
    unsnooze(convId) {
      return _put(`/inbox/conversations/${convId}/snooze`, { snooze_until: null });
    },

    /**
     * تغيير الأولوية
     */
    setPriority(convId, priority) {
      return _put(`/inbox/conversations/${convId}/priority`, { priority });
    },

    /**
     * ربط بجهة اتصال في CRM
     */
    linkContact(convId, contactId) {
      return _put(`/inbox/conversations/${convId}/contact`, { contact_id: contactId });
    },

    /**
     * bulk actions
     */
    bulkUpdate(ids, action, value) {
      return _post('/inbox/conversations/bulk', { ids, action, value });
    },

    /**
     * عدادات (open/waiting/snoozed/unread)
     */
    counts() {
      return _get('/inbox/counts');
    },

    /**
     * تعليم الكل مقروء
     */
    markAllRead() {
      return _post('/inbox/mark-all-read');
    },
  };

  // ─── Messages ─────────────────────────────────────────────────────────

  const messages = {
    /**
     * رسائل محادثة مع pagination
     */
    list(convId, { before, limit = 40 } = {}) {
      return _get(`/inbox/conversations/${convId}/messages`, { before, limit });
    },

    /**
     * إرسال رسالة
     */
    send(convId, { content, contentType = 'text', mediaUrl, quotedMsgId, channelOverride, templateName, templateVars, direction, mentionIds } = {}) {
      return _post(`/inbox/conversations/${convId}/messages`, {
        content,
        content_type:     contentType,
        media_url:        mediaUrl,
        quoted_msg_id:    quotedMsgId,
        channel_override: channelOverride,
        template_name:    templateName,
        template_vars:    templateVars,
        ...(direction   ? { direction }               : {}),
        ...(mentionIds  ? { mention_ids: mentionIds } : {}),  // P2-4
      });
    },

    /**
     * إرسال ملاحظة داخلية
     */
    sendNote(convId, content) {
      return _post(`/inbox/conversations/${convId}/messages`, {
        content,
        content_type: 'text',
        direction: 'note',
      });
    },

    /**
     * تعليم المحادثة مقروءة
     */
    markRead(convId) {
      return _post(`/inbox/conversations/${convId}/read`);
    },

    /**
     * تحويل voice note إلى نص عبر Whisper
     * يُعيد { transcript, cached }
     */
    transcript(convId, msgId) {
      return _post(`/inbox/conversations/${convId}/messages/${msgId}/transcript`, {});
    },

    /**
     * إرسال WA Interactive Message (Buttons أو List)
     * @param {string|number} convId
     * @param {object} opts - { type, header?, body, footer?, buttons[], sections[], button_label? }
     */
    sendInteractive(convId, opts) {
      return _post(`/inbox/conversations/${convId}/messages/interactive`, opts);
    },

    /**
     * إرسال WA Catalog Product Message (P8-3)
     * @param {string|number} convId
     * @param {object} opts - { type, catalog_id, product_retailer_id?, sections?, body_text?, footer_text?, header_text?, thumbnail_product_retailer_id? }
     */
    sendCatalog(convId, opts) {
      return _post(`/inbox/conversations/${convId}/messages/catalog`, opts);
    },
  };

  // ─── Labels ───────────────────────────────────────────────────────────

  const labels = {
    list() {
      return _get('/inbox/labels');
    },

    create(name, color) {
      return _post('/inbox/labels', { name, color });
    },

    // P3-1: تعديل اسم أو لون label
    update(labelId, name, color) {
      return _put(`/inbox/labels/${labelId}`, { name, color });
    },

    delete(labelId) {
      return _delete(`/inbox/labels/${labelId}`);
    },

    // P3-1: جلب labels محادثة معينة
    getConvLabels(convId) {
      return _get(`/inbox/conversations/${convId}/labels`);
    },

    addToConv(convId, labelId) {
      return _post(`/inbox/conversations/${convId}/labels`, { label_id: labelId });
    },

    removeFromConv(convId, labelId) {
      return _delete(`/inbox/conversations/${convId}/labels/${labelId}`);
    },
  };

  // ─── Team (P2-1) ──────────────────────────────────────────────────────

  const team = {
    /**
     * قائمة الموظفين مع حالتهم + إحصائياتهم
     */
    list() {
      return _get('/inbox/team/agents');
    },

    /**
     * تحديث حالة الموظف الحالي
     * @param {string} status - online | busy | away | offline
     */
    setStatus(status) {
      return _put('/inbox/team/agents/status', { status });
    },

    /**
     * بيانات موظف واحد
     */
    getAgent(agentId) {
      return _get(`/inbox/team/agents/${agentId}`);
    },

    /**
     * auto-assign محادثة واحدة
     */
    autoAssign(convId) {
      return _post('/inbox/conversations/auto-assign', { conversation_id: convId });
    },

    /**
     * auto-assign لكل المحادثات المفتوحة الغير معيّنة
     */
    autoAssignAll() {
      return _post('/inbox/conversations/auto-assign-all');
    },

    /**
     * بث typing indicator عبر SSE (P2-2)
     * @param {number} convId
     * @param {boolean} [typing=true]
     */
    sendTyping(convId, typing = true) {
      return _post(`/inbox/conversations/${convId}/typing`, { typing });
    },

    /**
     * تحويل محادثة لموظف آخر مع context وملاحظة (P2-5)
     * @param {number} convId
     * @param {number} toAgentId - الموظف المستلم
     * @param {string} [note=''] - ملاحظة سياق اختيارية
     * @param {boolean} [includeContext=true] - إدراج آخر 3 رسائل
     */
    transfer(convId, toAgentId, note = '', includeContext = true) {
      return _post(`/inbox/conversations/${convId}/transfer`, {
        to_agent_id:     toAgentId,
        note:            note,
        include_context: includeContext,
      });
    },
  };

  // ─── Stream / Collision (P2-3) ───────────────────────────────────────────

  const stream = {
    /**
     * إخبار السيرفر بأننا فتحنا هذه المحادثة (بداية الـ Collision Detection)
     * يرجع قائمة الموظفين المتواجدين الآن (viewers)
     * @param {number} convId
     */
    startViewing(convId) {
      return _post('/inbox/stream/viewing', { conv_id: convId });
    },

    /**
     * إخبار السيرفر بأننا أغلقنا هذه المحادثة
     * @param {number} convId
     */
    stopViewing(convId) {
      return _delete(`/inbox/stream/viewing/${convId}`);
    },
  };

  // ─── Analytics ────────────────────────────────────────────────────────

  const analytics = {
    overview({ from, to } = {}) {
      return _get('/inbox/analytics/overview', { from, to });
    },
    sla({ from, to } = {}) {
      return _get('/inbox/analytics/sla', { from, to });
    },
    agentStats({ from, to } = {}) {
      return _get('/inbox/analytics/agents', { from, to });
    },
    platforms({ from, to } = {}) {
      return _get('/inbox/analytics/platforms', { from, to });
    },
    volume({ from, to } = {}) {
      return _get('/inbox/analytics/volume', { from, to });
    },
    hourly({ from, to } = {}) {
      return _get('/inbox/analytics/hourly', { from, to });
    },
    agentDetail(agentId, { from, to } = {}) {
      return _get(`/inbox/analytics/agents/${agentId}`, { from, to });
    },
    platformDetail(platform, { from, to } = {}) {
      return _get(`/inbox/analytics/platforms/${platform}`, { from, to });
    },
    slaDetail({ from, to } = {}) {
      return _get('/inbox/analytics/sla/detail', { from, to });
    },
    csat({ from, to } = {}) {
      return _get('/inbox/analytics/csat', { from, to });
    },
    /** P7-4: تحليل مشاعر رسائل العملاء */
    sentiment({ from, to, limit } = {}) {
      return _get('/inbox/analytics/sentiment', { from, to, limit });
    },
    csatStats() {
      return _get('/inbox/csat-stats');
    },
    /** P11-E3: تصدير تقرير شامل — format='json'|'html' */
    exportReport({ from, to, format = 'json' } = {}) {
      return _get('/inbox/analytics/export', { from, to, format });
    },
    /** P11-E3: بناء رابط HTML مباشر للطباعة */
    exportPdfUrl({ from, to } = {}) {
      const base = window.location.origin;
      const token = _getToken ? _getToken() : '';
      const params = new URLSearchParams({ from, to, format: 'html', _t: token });
      return `${base}/api/inbox/analytics/export?${params}`;
    },
  };

  // ─── Settings ─────────────────────────────────────────────────────────

  // ─ M2 Settings namespace ──────────────────────────────────────────
const settings = {
    // --- Legacy (backward compat) ---
    get:    ()           => _get('/inbox/settings'),
    update: (ch, data)  => _put(`/inbox/settings/${ch}`, data),

    // --- Org ---
    getOrg:    ()       => _get('/inbox/settings/org'),
    updateOrg: (data)   => _put('/inbox/settings/org', data),

    // --- Business Hours ---
    getHours:    ()     => _get('/inbox/settings/business-hours'),
    updateHours: (data) => _put('/inbox/settings/business-hours', data),

    // --- Canned Responses ---
    getCanned:    ()       => _get('/inbox/settings/canned'),
    searchCanned: (q)      => _get('/inbox/settings/canned/search', { q }),
    createCanned: (data)   => _post('/inbox/settings/canned', data),
    updateCanned: (id, d)  => _put(`/inbox/settings/canned/${id}`, d),
    deleteCanned: (id)     => _delete(`/inbox/settings/canned/${id}`),

    // --- Custom Attrs ---
    getAttrs:     (type)       => _get(`/inbox/settings/attrs/${type}`),
    createAttr:   (type, data) => _post(`/inbox/settings/attrs/${type}`, data),
    updateAttr:   (type, id, d)=> _put(`/inbox/settings/attrs/${type}/${id}`, d),
    deleteAttr:   (type, id)   => _delete(`/inbox/settings/attrs/${type}/${id}`),
    reorderAttrs: (type, ord)  => _put(`/inbox/settings/attrs/${type}/reorder`, { order: ord }),

    // --- SLA ---
    getSLA:       ()     => _get('/inbox/settings/sla'),
    createSLA:    (data) => _post('/inbox/settings/sla', data),
    updateSLA:    (id,d) => _put(`/inbox/settings/sla/${id}`, d),
    deleteSLA:    (id)   => _delete(`/inbox/settings/sla/${id}`),
    setDefaultSLA:(id)   => _put(`/inbox/settings/sla/${id}/set-default`),

    // --- CSAT ---
    getCSAT:    ()     => _get('/inbox/settings/csat'),
    updateCSAT: (data) => _put('/inbox/settings/csat', data),

    // --- Appearance ---
    getAppearance:    ()     => _get('/inbox/settings/appearance'),
    updateAppearance: (data) => _put('/inbox/settings/appearance', data),

    // --- Channels ---
    getChannels:   ()          => _get('/inbox/settings/channels'),
    getChannel:    (ch)        => _get(`/inbox/settings/channels/${ch}`),
    updateChannel: (ch, data)  => _put(`/inbox/settings/channels/${ch}`, data),
    testChannel:   (ch)        => _post(`/inbox/settings/channels/${ch}/test`),
  };

  // ─── Contacts Page (P11-E2) ──────────────────────────────────────────────

  const contacts = {
    list  : (p = {}) => _get('/inbox/contacts', p),
    stats : ()       => _get('/inbox/contacts/stats'),
    get   : (id)     => _get(`/inbox/contacts/${id}`),
    convs : (id, p)  => _get(`/inbox/contacts/${id}/conversations`, p),
    create: (data)   => _post('/inbox/contacts', data),
    update: (id, d)  => _put(`/inbox/contacts/${id}`, d),
    remove: (id)     => _delete(`/inbox/contacts/${id}`),
  };

  // ─── CRM & ERP (للـ Context Panel) ───────────────────────────────────

  const crm = {
    /**
     * بحث بالهاتف/الاسم في CRM
     */
    search(q) {
      return _get('/crm/contacts/search', { q });
    },

    /**
     * بيانات جهة اتصال + فواتير + أوردرات + CLV
     */
    getByPhone(phone) {
      return _get('/crm/contacts/by-phone', { phone });
    },

    /**
     * إضافة جهة اتصال جديدة
     */
    create(data) {
      return _post('/crm/contacts', data);
    },

    /**
     * تحديث جهة اتصال
     */
    update(contactId, data) {
      return _put(`/crm/contacts/${contactId}`, data);
    },
  };

  // ─── Broadcast ────────────────────────────────────────────────────────

  const broadcast = {
    /** قائمة الـ broadcasts */
    list({ status, page = 1, limit = 20 } = {}) {
      return _get('/inbox/broadcasts', { status, page, limit });
    },
    /** إنشاء broadcast جديد (draft) */
    create(opts) {
      return _post('/inbox/broadcasts', opts);
    },
    /** تفاصيل broadcast */
    get(id) {
      return _get(`/inbox/broadcasts/${id}`);
    },
    /** تعديل broadcast (مسودة فقط) */
    update(id, opts) {
      return _put(`/inbox/broadcasts/${id}`, opts);
    },
    /** حذف broadcast */
    delete(id) {
      return _delete(`/inbox/broadcasts/${id}`);
    },
    /** بدء الإرسال */
    send(id) {
      return _post(`/inbox/broadcasts/${id}/send`, {});
    },
    /** إلغاء الإرسال */
    cancel(id) {
      return _post(`/inbox/broadcasts/${id}/cancel`, {});
    },
    /** قائمة المستلمين مع حالة الإرسال */
    recipients(id, { status, page = 1, limit = 50 } = {}) {
      return _get(`/inbox/broadcasts/${id}/recipients`, { status, page, limit });
    },
  };

  // ─── Search ──────────────────────────────────────────────────────────────

  const search = {
    /**
     * بحث في المحادثات والرسائل
     * @param {Object} opts - { q, mode, status, platform, limit, offset }
     */
    search({ q, mode = 'quick', status = 'all', platform = '', limit = 20, offset = 0 } = {}) {
      return _get('/inbox/search', { q, mode, status, platform, limit, offset });
    },

    /**
     * اقتراحات autocomplete للبحث السريع
     * @param {string} q
     * @param {number} limit
     */
    suggest(q, limit = 8) {
      return _get('/inbox/search/suggest', { q, limit });
    },
  };

  // ─── Context Panel ──────────────────────────────────────────────────────

  const context = {
    /** بيانات العميل الكاملة (overview) */
    get(convId) {
      return _get(`/inbox/conversations/${convId}/context`);
    },
    /** قائمة الفواتير مع pagination */
    invoices(convId, { page = 1, limit = 20, status = '' } = {}) {
      return _get(`/inbox/conversations/${convId}/context/invoices`, { page, limit, status });
    },
    /** قائمة الطلبات مع pagination */
    orders(convId, { page = 1, limit = 20, status = '' } = {}) {
      return _get(`/inbox/conversations/${convId}/context/orders`, { page, limit, status });
    },
    /** روابط الدفع */
    paylinks(convId, { page = 1, limit = 20 } = {}) {
      return _get(`/inbox/conversations/${convId}/context/paylinks`, { page, limit });
    },
    /** تقرير CLV تفصيلي */
    clv(convId) {
      return _get(`/inbox/conversations/${convId}/context/clv`);
    },
    /** ربط/إلغاء ربط جهة اتصال CRM */
    link(convId, contactId) {
      return _post(`/inbox/conversations/${convId}/context/link`, { contact_id: contactId ?? null });
    },
    /** بحث في CRM contacts */
    search(convId, q) {
      return _get(`/inbox/conversations/${convId}/context/search`, { q });
    },
    /** إنشاء فاتورة سريعة (Quick Action) */
    createInvoice(convId, { amount, description, notes } = {}) {
      return _post(`/inbox/conversations/${convId}/context/invoice`, { amount, description, notes });
    },
    /** إنشاء رابط دفع سريع (Quick Action) */
    createPaylink(convId, { amount, description } = {}) {
      return _post(`/inbox/conversations/${convId}/context/paylink`, { amount, description });
    },
    /** جلب نوتس داخلية (P5-4) */
    getNotes(convId) {
      return _get(`/inbox/conversations/${convId}/context/notes`);
    },
    /** إضافة نوتة داخلية */
    addNote(convId, body) {
      return _post(`/inbox/conversations/${convId}/context/notes`, { body });
    },
    /** حذف نوتة */
    deleteNote(convId, noteId) {
      return _delete(`/inbox/conversations/${convId}/context/notes/${noteId}`);
    },
  };

  // ─── New Conversation ─────────────────────────────────────────────────

  const newConversation = {
    create({ platform, phone, name, message, templateName, templateVars, channelOverride } = {}) {
      return _post('/inbox/new-conversation', {
        platform, phone, name, message,
        template_name: templateName,
        template_vars: templateVars,
        channel_override: channelOverride,
      });
    },
  };



  // ─── Welcome + Away (P4-3) ────────────────────────────────────────────
  const welcomeAway = {
    get    : ()     => _get('/inbox/automation/welcome-away'),
    update : (data) => _put('/inbox/automation/welcome-away', data),
  };



  // ─── Scheduled Messages (P4-5) ────────────────────────────────────────────
  const scheduled = {
    listAll    : (status = 'pending') => _get(`/inbox/scheduled?status=${status}`),
    listConv   : (convId)             => _get(`/inbox/conversations/${convId}/scheduled`),
    create     : (convId, data)       => _post(`/inbox/conversations/${convId}/scheduled`, data),
    update     : (id, data)           => _put(`/inbox/scheduled/${id}`, data),
    delete     : (id)                 => _delete(`/inbox/scheduled/${id}`),
    run        : ()                   => _post('/inbox/automation/scheduled/run', {}),
  };

  // ─── Webhook Triggers (P8-5) ──────────────────────────────────────────
  const webhooks = {
    events : ()          => _get('/inbox/automation/webhook-events'),
    list   : ()          => _get('/inbox/automation/webhooks'),
    create : (data)      => _post('/inbox/automation/webhooks', data),
    update : (id, data)  => _put(`/inbox/automation/webhooks/${id}`, data),
    delete : (id)        => _delete(`/inbox/automation/webhooks/${id}`),
    toggle : (id)        => _put(`/inbox/automation/webhooks/${id}/toggle`, {}),
    test   : (id)        => _post(`/inbox/automation/webhooks/${id}/test`, {}),
    logs   : (id, limit) => _get(`/inbox/automation/webhooks/${id}/logs${limit ? `?limit=${limit}` : ''}`),
  };

  // ─── Auto-Close (P4-4) ────────────────────────────────────────────────
  const autoClose = {
    get    : ()     => _get('/inbox/automation/auto-close'),
    update : (data) => _put('/inbox/automation/auto-close', data),
    run    : ()     => _post('/inbox/automation/auto-close/run', {}),
  };

  // ─── Chatbot Flows (P4-2) ──────────────────────────────────────────────
  const chatbot = {
    list       : ()          => _get('/inbox/chatbot/flows'),
    get        : (id)        => _get(`/inbox/chatbot/flows/${id}`),
    create     : (data)      => _post('/inbox/chatbot/flows', data),
    update     : (id, data)  => _put(`/inbox/chatbot/flows/${id}`, data),
    delete     : (id)        => _delete(`/inbox/chatbot/flows/${id}`),
    toggle     : (id)        => _put(`/inbox/chatbot/flows/${id}/toggle`, {}),
    saveSteps  : (id, steps) => _put(`/inbox/chatbot/flows/${id}/steps`, { steps }),
    test       : (id, text)  => _post(`/inbox/chatbot/flows/${id}/test`, { input_text: text }),
  };

  // ─── AI Features (P7-1, P7-3) ──────────────────────────────────────────────────
  const ai = {
    /** اقتراح رد ذكي — tone: 'formal'|'friendly'|'brief' */
    suggest      : (convId, tone = 'friendly')           => _post(`/inbox/conversations/${convId}/ai/suggest`,   { tone }),
    /** ملخص المحادثة */
    summary      : (convId)                              => _post(`/inbox/conversations/${convId}/ai/summary`,   {}),
    /** ترجمة نص — targetLang: 'ar'|'en' */
    translate    : (convId, text, targetLang = 'ar')     => _post(`/inbox/conversations/${convId}/ai/translate`, { text, targetLang }),
    /** تحسين نص — goal: 'formal'|'shorter'|'friendlier'|'fix' */
    improve      : (convId, text, goal = 'formal')       => _post(`/inbox/conversations/${convId}/ai/improve`,   { text, goal }),
    /** P7-3: اقتراح labels مناسبة للمحادثة */
    suggestLabels: (convId)                              => _post(`/inbox/conversations/${convId}/ai/labels`,    {}),
  };

  // P8-1: Email Channel
  const email = {
    listAccounts   : ()              => _get('/inbox/email/accounts'),
    createAccount  : (data)          => _post('/inbox/email/accounts', data),
    getAccount     : (id)            => _get(`/inbox/email/accounts/${id}`),
    updateAccount  : (id, data)      => _put(`/inbox/email/accounts/${id}`, data),
    deleteAccount  : (id)            => _delete(`/inbox/email/accounts/${id}`),
    toggleAccount  : (id)            => _put(`/inbox/email/accounts/${id}/toggle`, {}),
    testSmtp       : (id)            => _post(`/inbox/email/accounts/${id}/test-smtp`, {}),
    testImap       : (id)            => _post(`/inbox/email/accounts/${id}/test-imap`, {}),
    pollNow        : (id)            => _post(`/inbox/email/accounts/${id}/poll`, {}),
    getMessages    : (convId)        => _get(`/inbox/email/messages/${convId}`),
    sendMessage    : (convId, data)  => _post(`/inbox/email/messages/${convId}/send`, data),
  };

  // ─── Public API ───────────────────────────────────────────────────────
  return {
    conversations,
    messages,
    labels,
    team,
    stream,
    // shortcuts مباشرة لأكثر استخداماً في team.js
    getAgents:      () => team.list(),
    setAgentStatus: (s) => team.setStatus(s),
    assignConversation: (convId, agentId) => conversations.assign(convId, agentId),
    autoAssign:     (convId) => team.autoAssign(convId),
    autoAssignAll:  () => team.autoAssignAll(),
    analytics,
    settings,
    contacts,
    crm,
    broadcast,
    search,
    newConversation,
    context,
    chatbot,
    ai,
    welcomeAway,
    autoClose,
    scheduled,
    webhooks,
    email,
    // expose للـ debugging
    _fetch,
    _get,
    _post,
    _put,
    _delete,
    _getToken,  // مطلوب لـ stream.js لإرسال token في SSE URL
  };
})();

window.InboxAPI = InboxAPI;
