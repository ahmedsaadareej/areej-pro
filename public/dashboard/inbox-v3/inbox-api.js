/**
 * inbox-api.js — Areej Pro Inbox v3
 * كل الـ API calls للـ Inbox
 * آخر تحديث: 2026-05-02
 */

const IV3_API = {

  // ── المحادثات ──────────────────────────────────────────────

  async getConversations(params = {}) {
    const q = new URLSearchParams();
    if (params.platform)  q.set('platform', params.platform);
    if (params.status)    q.set('status', params.status);
    if (params.assigned)  q.set('assigned', params.assigned);
    if (params.search)    q.set('search', params.search);
    if (params.page)      q.set('page', params.page);
    if (params.limit)     q.set('limit', params.limit || 30);
    const res = await fetch(`/api/system/inbox/conversations?${q}`);
    if (!res.ok) throw new Error('فشل تحميل المحادثات');
    return res.json();
  },

  async getMessages(convId) {
    const res = await fetch(`/api/system/inbox/messages/${convId}`);
    if (!res.ok) throw new Error('فشل تحميل الرسائل');
    return res.json();
  },

  async sendMessage(convId, text, mode = 'reply') {
    const res = await fetch('/api/system/inbox/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: convId, message: text, mode })
    });
    if (!res.ok) throw new Error('فشل إرسال الرسالة');
    return res.json();
  },

  async sendMedia(convId, file) {
    const form = new FormData();
    form.append('file', file);
    form.append('conv_id', convId);
    const res = await fetch('/api/system/inbox/send-media', { method: 'POST', body: form });
    if (!res.ok) throw new Error('فشل إرسال الملف');
    return res.json();
  },

  async changeStatus(convId, status) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('فشل تغيير الحالة');
    return res.json();
  },

  async assignConv(convId, userId) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    if (!res.ok) throw new Error('فشل التعيين');
    return res.json();
  },

  // ── Labels ─────────────────────────────────────────────────

  async getLabels() {
    const res = await fetch('/api/system/inbox/labels');
    if (!res.ok) throw new Error('فشل تحميل التسميات');
    return res.json();
  },

  async addLabel(convId, labelId) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/labels/${labelId}`, { method: 'POST' });
    if (!res.ok) throw new Error('فشل إضافة التسمية');
    return res.json();
  },

  async removeLabel(convId, labelId) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/labels/${labelId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('فشل حذف التسمية');
    return res.json();
  },

  // ── Notes ──────────────────────────────────────────────────

  async getNotes(convId) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/notes`);
    if (!res.ok) throw new Error('فشل تحميل الملاحظات');
    return res.json();
  },

  async addNote(convId, text) {
    const res = await fetch(`/api/system/inbox/conversations/${convId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: text })
    });
    if (!res.ok) throw new Error('فشل إضافة الملاحظة');
    return res.json();
  },

  // ── Templates ──────────────────────────────────────────────

  async getTemplates() {
    const res = await fetch('/api/system/inbox/templates');
    if (!res.ok) throw new Error('فشل تحميل الردود الجاهزة');
    return res.json();
  },

  // ── Agents & Me ────────────────────────────────────────────

  async getMe() {
    const res = await fetch('/api/system/inbox/me');
    if (!res.ok) throw new Error('فشل تحميل بيانات المستخدم');
    return res.json();
  },

  async getAgents() {
    const res = await fetch('/api/system/inbox/agents');
    if (!res.ok) throw new Error('فشل تحميل الموظفين');
    return res.json();
  },

  // ── Unread Count ───────────────────────────────────────────

  async getUnreadCount() {
    const res = await fetch('/api/system/inbox/unread-count');
    if (!res.ok) return { count: 0 };
    return res.json();
  },

  // ── AI Reply ───────────────────────────────────────────────

  async getAISuggestions(convId) {
    const res = await fetch('/api/system/inbox/ai-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: convId })
    });
    if (!res.ok) throw new Error('فشل الـ AI');
    return res.json();
  },

  // ── Invoice ────────────────────────────────────────────────

  async sendInvoice(convId, invoiceId) {
    const res = await fetch('/api/system/inbox/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: convId, invoice_id: invoiceId })
    });
    if (!res.ok) throw new Error('فشل إرسال الفاتورة');
    return res.json();
  },

  // ── Search ─────────────────────────────────────────────────

  async search(query) {
    const res = await fetch(`/api/system/inbox/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('فشل البحث');
    return res.json();
  },

};
