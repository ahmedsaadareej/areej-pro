/**
 * InboxAPI — كل الـ fetch calls لـ Inbox v4
 * آخر تحديث: 2026-05-03
 *
 * كل method ترجع Promise<{ data, error }>
 * لا تُطلق exceptions — الأخطاء في { error }
 *
 * الاستخدام:
 *   const { data, error } = await InboxAPI.conversations.list({ status: 'open' });
 */

const InboxAPI = (() => {

  // ─── Base Fetch ───────────────────────────────────────────────────────

  /**
   * fetch مع معالجة الأخطاء الموحدة
   * @param {string} path - المسار بدون /api
   * @param {RequestInit} options
   * @returns {Promise<{ data: any, error: string|null }>}
   */
  async function _fetch(path, options = {}) {
    try {
      const res = await fetch(`/api${path}`, {
        headers: {
          'Content-Type': 'application/json',
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
    send(convId, { content, contentType = 'text', mediaUrl, quotedMsgId, channelOverride, templateName, templateVars } = {}) {
      return _post(`/inbox/conversations/${convId}/messages`, {
        content,
        content_type: contentType,
        media_url: mediaUrl,
        quoted_msg_id: quotedMsgId,
        channel_override: channelOverride,
        template_name: templateName,
        template_vars: templateVars,
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
  };

  // ─── Labels ───────────────────────────────────────────────────────────

  const labels = {
    list() {
      return _get('/inbox/labels');
    },

    create(name, color) {
      return _post('/inbox/labels', { name, color });
    },

    delete(labelId) {
      return _delete(`/inbox/labels/${labelId}`);
    },

    addToConv(convId, labelId) {
      return _post(`/inbox/conversations/${convId}/labels`, { label_id: labelId });
    },

    removeFromConv(convId, labelId) {
      return _delete(`/inbox/conversations/${convId}/labels/${labelId}`);
    },
  };

  // ─── Team ─────────────────────────────────────────────────────────────

  const team = {
    /**
     * قائمة الموظفين
     */
    list() {
      return _get('/inbox/team');
    },

    /**
     * تحديث حالة الموظف
     */
    setStatus(status) {
      return _put('/inbox/team/status', { status });
    },

    /**
     * قائمة حالات الموظفين
     */
    statuses() {
      return _get('/inbox/team/statuses');
    },
  };

  // ─── Analytics ────────────────────────────────────────────────────────

  const analytics = {
    overview({ from, to } = {}) {
      return _get('/inbox/analytics/overview', { from, to });
    },

    agentStats({ from, to } = {}) {
      return _get('/inbox/analytics/agents', { from, to });
    },

    csatStats() {
      return _get('/inbox/csat-stats');
    },
  };

  // ─── Settings ─────────────────────────────────────────────────────────

  const settings = {
    get() {
      return _get('/inbox/settings');
    },

    update(channel, config) {
      return _put(`/inbox/settings/${channel}`, config);
    },
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
    list() {
      return _get('/inbox/broadcast/campaigns');
    },

    send({ platform, contactIds, message, templateName, templateVars } = {}) {
      return _post('/inbox/broadcast/send', {
        platform, contact_ids: contactIds,
        message, template_name: templateName, template_vars: templateVars,
      });
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

  // ─── Public API ───────────────────────────────────────────────────────
  return {
    conversations,
    messages,
    labels,
    team,
    analytics,
    settings,
    crm,
    broadcast,
    newConversation,
    // expose للـ debugging
    _fetch,
    _get,
    _post,
    _put,
    _delete,
  };
})();

window.InboxAPI = InboxAPI;
