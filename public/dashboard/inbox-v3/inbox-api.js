/**
 * inbox-api.js — Areej Pro Inbox v3
 * كل الـ API calls للـ Inbox
 * آخر تحديث: 2026-05-02
 * ملاحظة: كل الـ calls تمر عبر apiFetch (من core.js) لإرسال Authorization header تلقائياً
 */

const IV3_API = {

  // ── helper داخلي للـ fetch مع auth ──────────────────────────
  async _get(url) {
    if (typeof apiFetch === 'function') return apiFetch(url);
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token') || '') } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  async _post(url, body) {
    if (typeof apiFetch === 'function') return apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token') || '') },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  async _put(url, body) {
    if (typeof apiFetch === 'function') return apiFetch(url, { method: 'PUT', body: JSON.stringify(body) });
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token') || '') },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  async _delete(url) {
    if (typeof apiFetch === 'function') return apiFetch(url, { method: 'DELETE' });
    const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token') || '') } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  // ── المحادثات ──────────────────────────────────────────────

  async getConversations(params = {}) {
    const q = new URLSearchParams();
    if (params.platform)  q.set('platform', params.platform);
    if (params.status)    q.set('status', params.status);
    if (params.assigned)  q.set('assigned', params.assigned);
    if (params.search)    q.set('search', params.search);
    if (params.page)      q.set('page', params.page);
    if (params.limit)     q.set('limit', params.limit || 30);
    const data = await this._get(`/api/system/inbox/conversations?${q}`);
    if (!data && data !== 0) throw new Error('فشل تحميل المحادثات');
    return data;
  },

  async getMessages(convId) {
    const data = await this._get(`/api/system/inbox/messages/${convId}`);
    if (!data) throw new Error('فشل تحميل الرسائل');
    return data;
  },

  async sendMessage(convId, text, mode = 'reply', quoted = null) {
    const body = { conv_id: convId, message: text, mode };
    // إرفاق بيانات الاقتباس لو موجودة
    if (quoted) {
      body.quoted_msg_id  = quoted.id;
      body.quoted_content = quoted.content;
      body.quoted_sender  = quoted.sender_name;
    }
    const data = await this._post('/api/system/inbox/send', body);
    if (!data) throw new Error('فشل إرسال الرسالة');
    return data;
  },

  async sendMedia(convId, file) {
    // FormData — لا يمكن استخدام apiFetch العادية
    const form = new FormData();
    form.append('file', file);
    form.append('conv_id', convId);
    const res = await fetch('/api/system/inbox/send-media', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token') || '') },
      body: form
    });
    if (!res.ok) throw new Error('فشل إرسال الملف');
    return res.json();
  },

  async changeStatus(convId, status) {
    const data = await this._put(`/api/system/inbox/conversations/${convId}/status`, { status });
    if (!data) throw new Error('فشل تغيير الحالة');
    return data;
  },

  async assignConv(convId, userId) {
    const data = await this._post(`/api/system/inbox/conversations/${convId}/assign`, { user_id: userId });
    if (!data) throw new Error('فشل التعيين');
    return data;
  },

  // ── Labels ─────────────────────────────────────────────────

  async getLabels() {
    const data = await this._get('/api/system/inbox/labels');
    if (!data) throw new Error('فشل تحميل التسميات');
    return data;
  },

  async addLabel(convId, labelId) {
    const data = await this._post(`/api/system/inbox/conversations/${convId}/labels/${labelId}`, {});
    if (!data) throw new Error('فشل إضافة التسمية');
    return data;
  },

  async removeLabel(convId, labelId) {
    const data = await this._delete(`/api/system/inbox/conversations/${convId}/labels/${labelId}`);
    if (!data) throw new Error('فشل حذف التسمية');
    return data;
  },

  // ── Notes ──────────────────────────────────────────────────

  async getNotes(convId) {
    const data = await this._get(`/api/system/inbox/conversations/${convId}/notes`);
    if (!data) throw new Error('فشل تحميل الملاحظات');
    return data;
  },

  async addNote(convId, text) {
    const data = await this._post(`/api/system/inbox/conversations/${convId}/notes`, { content: text });
    if (!data) throw new Error('فشل إضافة الملاحظة');
    return data;
  },

  // ── Templates ──────────────────────────────────────────────

  async getTemplates() {
    const data = await this._get('/api/system/inbox/templates');
    if (!data) throw new Error('فشل تحميل الردود الجاهزة');
    return data;
  },

  // ── Agents & Me ────────────────────────────────────────────

  async getMe() {
    const data = await this._get('/api/system/inbox/me');
    if (!data) throw new Error('فشل تحميل بيانات المستخدم');
    return data;
  },

  async getAgents() {
    const data = await this._get('/api/system/inbox/agents');
    if (!data) throw new Error('فشل تحميل الموظفين');
    return data;
  },

  // ── Unread Count ───────────────────────────────────────────

  async getUnreadCount() {
    const data = await this._get('/api/system/inbox/unread-count');
    return data || { count: 0 };
  },

  // ── AI Reply ───────────────────────────────────────────────

  async getAISuggestions(convId) {
    const data = await this._post('/api/system/inbox/ai-reply', { conv_id: convId });
    if (!data) throw new Error('فشل الـ AI');
    return data;
  },

  // ── Invoice ────────────────────────────────────────────────

  async sendInvoice(convId, invoiceId) {
    const data = await this._post('/api/system/inbox/send-invoice', { conv_id: convId, invoice_id: invoiceId });
    if (!data) throw new Error('فشل إرسال الفاتورة');
    return data;
  },

  // ── Search ─────────────────────────────────────────────────

  async search(query) {
    const data = await this._get(`/api/system/inbox/search?q=${encodeURIComponent(query)}`);
    if (!data) throw new Error('فشل البحث');
    return data;
  },

  async snoozeConv(convId, minutes) {
    const data = await this._post(`/api/system/inbox/conversations/${convId}/snooze`, { minutes });
    if (!data) throw new Error('فشل الـ snooze');
    return data;
  },

  async checkSnoozeWakeup() {
    const data = await this._get('/api/system/inbox/snooze-wakeup');
    return data;
  },

  async getTimeline(convId) {
    const data = await this._get(`/api/system/inbox/conversations/${convId}/timeline`);
    return data;
  },

  async bulkAction(ids, action, payload = {}) {
    const data = await this._post('/api/system/inbox/conversations/bulk-action', { ids, action, payload });
    if (!data?.ok) throw new Error(data?.error || 'فشل التنفيذ');
    return data;
  },

  async setTypingState(convId, typing) {
    // نستخدم fetch مباشرة (fire-and-forget, لا ننتظر النتيجة)
    try {
      const token = localStorage.getItem('pro_token') || '';
      fetch('/api/system/inbox/typing-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ conv_id: convId, typing }),
        keepalive: true,
      });
    } catch(e) { /* تجاهل */ }
  },

  async getTypingAgents(convId) {
    const data = await this._get(`/api/system/inbox/conversations/${convId}/typing-agents`);
    return data?.agents || [];
  },

};
