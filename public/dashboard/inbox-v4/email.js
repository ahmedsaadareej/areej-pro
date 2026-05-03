/**
 * email.js — Email Channel لـ Inbox v4 (P8-1)
 * آخر تحديث: 2026-05-03
 *
 * يتيح:
 *  - إدارة حسابات الإيميل (SMTP + IMAP + Webhook Inbound)
 *  - إنشاء / تعديل / حذف حسابات
 *  - اختبار الاتصال (SMTP / IMAP)
 *  - Poll يدوي للـ IMAP
 *  - عرض رسائل الإيميل داخل المحادثة
 *  - إرسال إيميل رد من الـ inbox
 *
 * الاستخدام:
 *   InboxEmail.init()
 *   InboxEmail.open()          ← يفتح settings panel
 *   InboxEmail.renderEmailThread(convId, containerEl)
 *   InboxEmail.sendEmailReply(convId, opts)
 */

const InboxEmail = (() => {
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────
  let _overlayEl  = null;
  let _accounts   = [];
  let _editId     = null;      // id الحساب الذي يُعدَّل حالياً
  let _loading    = false;

  // ─── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _buildOverlay();
    _bindSidebarButton();
  }

  // ─── Sidebar Button ─────────────────────────────────────────────────────────
  function _bindSidebarButton() {
    document.addEventListener('click', e => {
      if (e.target.closest('#iv4-email-btn')) open();
    });
  }

  // ─── Open / Close ────────────────────────────────────────────────────────────
  function open() {
    _overlayEl.classList.add('iv4-overlay--open');
    _loadAccounts();
  }

  function close() {
    _overlayEl.classList.remove('iv4-overlay--open');
    _editId = null;
  }

  // ─── Build Overlay ───────────────────────────────────────────────────────────
  function _buildOverlay() {
    if (_overlayEl) return;
    _overlayEl = document.createElement('div');
    _overlayEl.className = 'iv4-email-overlay iv4-overlay';
    _overlayEl.innerHTML = `
      <div class="iv4-email-panel iv4-panel">
        <div class="iv4-panel-header">
          <span class="iv4-panel-title">✉️ حسابات الإيميل</span>
          <button class="iv4-btn iv4-btn-sm iv4-btn-primary" id="iv4-email-add-btn">+ إضافة حساب</button>
          <button class="iv4-panel-close" id="iv4-email-close">✕</button>
        </div>
        <div class="iv4-email-body">
          <div id="iv4-email-accounts-list" class="iv4-email-accounts-list"></div>
          <div id="iv4-email-form-wrap" class="iv4-email-form-wrap" style="display:none"></div>
        </div>
      </div>
    `;

    _overlayEl.querySelector('#iv4-email-close').addEventListener('click', close);
    _overlayEl.querySelector('#iv4-email-add-btn').addEventListener('click', () => _openForm(null));
    _overlayEl.addEventListener('click', e => { if (e.target === _overlayEl) close(); });

    document.body.appendChild(_overlayEl);
  }

  // ─── Load Accounts ───────────────────────────────────────────────────────────
  async function _loadAccounts() {
    const list = document.getElementById('iv4-email-accounts-list');
    list.innerHTML = '<div class="iv4-loading">جارٍ التحميل...</div>';
    try {
      const data = await InboxAPI.email.listAccounts();
      _accounts = data.accounts || [];
      _renderAccountsList();
    } catch (e) {
      list.innerHTML = `<div class="iv4-error">${_esc(e.message)}</div>`;
    }
  }

  function _renderAccountsList() {
    const list = document.getElementById('iv4-email-accounts-list');
    if (!_accounts.length) {
      list.innerHTML = `<div class="iv4-email-empty">
        <div class="iv4-email-empty-icon">✉️</div>
        <p>لا يوجد حسابات إيميل مضافة</p>
        <button class="iv4-btn iv4-btn-primary" onclick="InboxEmail._openFormPublic(null)">+ إضافة حساب</button>
      </div>`;
      return;
    }

    list.innerHTML = _accounts.map(acc => `
      <div class="iv4-email-card ${acc.is_active ? '' : 'iv4-email-card--off'}" data-id="${acc.id}">
        <div class="iv4-email-card-header">
          <div class="iv4-email-card-info">
            <span class="iv4-email-card-icon">✉️</span>
            <div>
              <div class="iv4-email-card-name">${_esc(acc.name)}</div>
              <div class="iv4-email-card-addr">${_esc(acc.email)}</div>
            </div>
          </div>
          <div class="iv4-email-card-badges">
            ${acc.smtp_host ? '<span class="iv4-badge iv4-badge-blue">SMTP</span>' : ''}
            ${acc.imap_enabled ? '<span class="iv4-badge iv4-badge-green">IMAP</span>' : ''}
            ${acc.webhook_enabled ? '<span class="iv4-badge iv4-badge-purple">Webhook</span>' : ''}
          </div>
        </div>
        <div class="iv4-email-card-actions">
          <button class="iv4-btn iv4-btn-xs" onclick="InboxEmail._openFormPublic(${acc.id})">✏️ تعديل</button>
          <button class="iv4-btn iv4-btn-xs iv4-btn-green" onclick="InboxEmail._testSmtp(${acc.id})">🔌 SMTP</button>
          ${acc.imap_enabled ? `<button class="iv4-btn iv4-btn-xs iv4-btn-green" onclick="InboxEmail._testImap(${acc.id})">📥 IMAP</button>` : ''}
          ${acc.imap_enabled ? `<button class="iv4-btn iv4-btn-xs" onclick="InboxEmail._pollNow(${acc.id})">🔄 Poll</button>` : ''}
          <button class="iv4-btn iv4-btn-xs ${acc.is_active ? 'iv4-btn-warning' : 'iv4-btn-primary'}"
            onclick="InboxEmail._toggle(${acc.id})">${acc.is_active ? '⏸ تعطيل' : '▶ تفعيل'}</button>
          <button class="iv4-btn iv4-btn-xs iv4-btn-danger" onclick="InboxEmail._delete(${acc.id})">🗑</button>
        </div>
        ${acc.webhook_enabled ? `
        <div class="iv4-email-webhook-info">
          <span class="iv4-label">Webhook URL:</span>
          <code class="iv4-code-small">/api/inbox/email/webhook/${acc.webhook_token}</code>
          <button class="iv4-btn iv4-btn-xs" onclick="InboxEmail._copyWebhook('${acc.webhook_token}')">📋 نسخ</button>
          <span class="iv4-badge iv4-badge-gray">${_esc(acc.webhook_provider)}</span>
        </div>` : ''}
      </div>
    `).join('');
  }

  // ─── Form ────────────────────────────────────────────────────────────────────
  function _openForm(id) {
    _editId = id || null;
    const acc = id ? _accounts.find(a => a.id === id) : null;

    const wrap = document.getElementById('iv4-email-form-wrap');
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="iv4-email-form">
        <div class="iv4-form-header">
          <h3>${acc ? 'تعديل حساب' : 'إضافة حساب إيميل'}</h3>
        </div>

        <div class="iv4-form-section">
          <h4>🔹 معلومات الحساب</h4>
          <div class="iv4-form-row">
            <label>اسم الحساب <span class="req">*</span></label>
            <input type="text" id="ef-name" value="${_esc(acc?.name || '')}" placeholder="مثال: دعم فني أريج">
          </div>
          <div class="iv4-form-row">
            <label>عنوان الإيميل <span class="req">*</span></label>
            <input type="email" id="ef-email" value="${_esc(acc?.email || '')}" placeholder="support@areejegypt.com">
          </div>
        </div>

        <div class="iv4-form-section">
          <h4>📤 إعدادات الإرسال (SMTP)</h4>
          <div class="iv4-form-row2">
            <div>
              <label>SMTP Host</label>
              <input type="text" id="ef-smtp-host" value="${_esc(acc?.smtp_host || '')}" placeholder="smtp.gmail.com">
            </div>
            <div>
              <label>Port</label>
              <input type="number" id="ef-smtp-port" value="${acc?.smtp_port || 587}" style="width:80px">
            </div>
          </div>
          <div class="iv4-form-row">
            <label><input type="checkbox" id="ef-smtp-secure" ${acc?.smtp_secure ? 'checked' : ''}> TLS مباشر (Port 465)</label>
          </div>
          <div class="iv4-form-row2">
            <div>
              <label>SMTP User</label>
              <input type="text" id="ef-smtp-user" value="${_esc(acc?.smtp_user || '')}" placeholder="user@example.com">
            </div>
            <div>
              <label>SMTP Password</label>
              <input type="password" id="ef-smtp-pass" value="${acc ? '••••••••' : ''}" placeholder="App Password">
            </div>
          </div>
        </div>

        <div class="iv4-form-section">
          <h4>📥 استقبال عبر IMAP</h4>
          <div class="iv4-form-row">
            <label><input type="checkbox" id="ef-imap-enabled" ${acc?.imap_enabled ? 'checked' : ''} onchange="InboxEmail._toggleImapSection(this.checked)"> تفعيل استقبال IMAP</label>
          </div>
          <div id="ef-imap-section" style="display:${acc?.imap_enabled ? 'block' : 'none'}">
            <div class="iv4-form-row2">
              <div>
                <label>IMAP Host</label>
                <input type="text" id="ef-imap-host" value="${_esc(acc?.imap_host || '')}" placeholder="imap.gmail.com">
              </div>
              <div>
                <label>Port</label>
                <input type="number" id="ef-imap-port" value="${acc?.imap_port || 993}" style="width:80px">
              </div>
            </div>
            <div class="iv4-form-row">
              <label><input type="checkbox" id="ef-imap-secure" ${acc?.imap_secure !== false ? 'checked' : ''}> SSL/TLS</label>
            </div>
            <div class="iv4-form-row2">
              <div>
                <label>IMAP User</label>
                <input type="text" id="ef-imap-user" value="${_esc(acc?.imap_user || '')}" placeholder="user@example.com">
              </div>
              <div>
                <label>IMAP Password</label>
                <input type="password" id="ef-imap-pass" value="${acc ? '••••••••' : ''}" placeholder="App Password">
              </div>
            </div>
            <div class="iv4-form-row2">
              <div>
                <label>Mailbox</label>
                <input type="text" id="ef-imap-mailbox" value="${_esc(acc?.imap_mailbox || 'INBOX')}" placeholder="INBOX">
              </div>
              <div>
                <label>Poll كل (ثانية)</label>
                <input type="number" id="ef-poll-interval" value="${acc?.poll_interval || 300}" style="width:90px">
              </div>
            </div>
          </div>
        </div>

        <div class="iv4-form-section">
          <h4>🔗 استقبال عبر Webhook</h4>
          <div class="iv4-form-row">
            <label><input type="checkbox" id="ef-wh-enabled" ${acc?.webhook_enabled ? 'checked' : ''} onchange="InboxEmail._toggleWebhookSection(this.checked)"> تفعيل Webhook Inbound</label>
          </div>
          <div id="ef-wh-section" style="display:${acc?.webhook_enabled ? 'block' : 'none'}">
            <div class="iv4-form-row">
              <label>المزود</label>
              <select id="ef-wh-provider">
                <option value="sendgrid"  ${acc?.webhook_provider === 'sendgrid'  ? 'selected' : ''}>Sendgrid</option>
                <option value="mailgun"   ${acc?.webhook_provider === 'mailgun'   ? 'selected' : ''}>Mailgun</option>
                <option value="postmark"  ${acc?.webhook_provider === 'postmark'  ? 'selected' : ''}>Postmark</option>
              </select>
            </div>
            ${acc?.webhook_token ? `
            <div class="iv4-form-row">
              <label>Webhook URL (للمزود)</label>
              <div class="iv4-input-with-btn">
                <input type="text" readonly value="https://areejegypt.com/api/inbox/email/webhook/${acc.webhook_token}">
                <button class="iv4-btn iv4-btn-xs" onclick="InboxEmail._copyWebhook('${acc.webhook_token}')">📋</button>
              </div>
            </div>` : '<p class="iv4-hint">بعد الحفظ ستظهر الـ Webhook URL</p>'}
          </div>
        </div>

        <div class="iv4-form-actions">
          <button class="iv4-btn iv4-btn-primary" id="ef-save-btn">💾 حفظ</button>
          <button class="iv4-btn" id="ef-cancel-btn">إلغاء</button>
        </div>
        <div id="ef-msg" class="iv4-form-msg" style="display:none"></div>
      </div>
    `;

    wrap.querySelector('#ef-save-btn').addEventListener('click', _saveForm);
    wrap.querySelector('#ef-cancel-btn').addEventListener('click', () => {
      wrap.style.display = 'none';
      _editId = null;
    });
  }

  function _toggleImapSection(show) {
    const sec = document.getElementById('ef-imap-section');
    if (sec) sec.style.display = show ? 'block' : 'none';
  }

  function _toggleWebhookSection(show) {
    const sec = document.getElementById('ef-wh-section');
    if (sec) sec.style.display = show ? 'block' : 'none';
  }

  async function _saveForm() {
    const btn = document.getElementById('ef-save-btn');
    const msg = document.getElementById('ef-msg');

    const name       = document.getElementById('ef-name')?.value.trim();
    const email      = document.getElementById('ef-email')?.value.trim();
    if (!name || !email) return _showMsg('⚠️ الاسم والإيميل مطلوبان', 'error');

    // جمع smtp_pass وimap_pass — لو ••••••• = لا نرسلها (تبقى القديمة)
    const smtpPass = document.getElementById('ef-smtp-pass')?.value;
    const imapPass = document.getElementById('ef-imap-pass')?.value;

    const payload = {
      name, email,
      smtp_host   : document.getElementById('ef-smtp-host')?.value.trim() || null,
      smtp_port   : parseInt(document.getElementById('ef-smtp-port')?.value) || 587,
      smtp_secure : document.getElementById('ef-smtp-secure')?.checked,
      smtp_user   : document.getElementById('ef-smtp-user')?.value.trim() || null,
      imap_enabled : document.getElementById('ef-imap-enabled')?.checked,
      imap_host   : document.getElementById('ef-imap-host')?.value.trim() || null,
      imap_port   : parseInt(document.getElementById('ef-imap-port')?.value) || 993,
      imap_secure : document.getElementById('ef-imap-secure')?.checked,
      imap_user   : document.getElementById('ef-imap-user')?.value.trim() || null,
      imap_mailbox : document.getElementById('ef-imap-mailbox')?.value.trim() || 'INBOX',
      poll_interval : parseInt(document.getElementById('ef-poll-interval')?.value) || 300,
      webhook_enabled : document.getElementById('ef-wh-enabled')?.checked,
      webhook_provider: document.getElementById('ef-wh-provider')?.value || 'sendgrid'
    };

    // أضف الباسورد فقط لو ليست ••••
    if (smtpPass && !smtpPass.startsWith('•')) payload.smtp_pass = smtpPass;
    if (imapPass && !imapPass.startsWith('•')) payload.imap_pass = imapPass;

    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الحفظ...';

    try {
      if (_editId) {
        await InboxAPI.email.updateAccount(_editId, payload);
      } else {
        await InboxAPI.email.createAccount(payload);
      }
      _showMsg('✅ تم الحفظ بنجاح', 'success');
      setTimeout(() => {
        document.getElementById('iv4-email-form-wrap').style.display = 'none';
        _editId = null;
        _loadAccounts();
      }, 800);
    } catch (e) {
      _showMsg('❌ ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 حفظ';
    }
  }

  function _showMsg(text, type) {
    const el = document.getElementById('ef-msg');
    if (!el) return;
    el.textContent = text;
    el.className   = `iv4-form-msg iv4-form-msg--${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────
  async function _toggle(id) {
    try {
      await InboxAPI.email.toggleAccount(id);
      _loadAccounts();
    } catch (e) { alert(e.message); }
  }

  async function _delete(id) {
    if (!confirm('تأكيد حذف الحساب؟')) return;
    try {
      await InboxAPI.email.deleteAccount(id);
      _loadAccounts();
    } catch (e) { alert(e.message); }
  }

  async function _testSmtp(id) {
    const btn = document.querySelector(`.iv4-email-card[data-id="${id}"] .iv4-btn-green`);
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    try {
      const r = await InboxAPI.email.testSmtp(id);
      alert(r.message || '✅ SMTP OK');
    } catch (e) {
      alert('❌ SMTP Error: ' + e.message);
    } finally {
      if (btn) { btn.textContent = '🔌 SMTP'; btn.disabled = false; }
    }
  }

  async function _testImap(id) {
    try {
      const r = await InboxAPI.email.testImap(id);
      alert(r.message || '✅ IMAP OK');
    } catch (e) {
      alert('❌ IMAP Error: ' + e.message);
    }
  }

  async function _pollNow(id) {
    try {
      const r = await InboxAPI.email.pollNow(id);
      alert(`✅ تم جلب ${r.fetched} رسالة جديدة`);
      _loadAccounts();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  }

  function _copyWebhook(token) {
    const url = `https://areejegypt.com/api/inbox/email/webhook/${token}`;
    navigator.clipboard.writeText(url).then(() => alert('✅ تم نسخ الـ URL'));
  }

  // ─── Email Thread في المحادثة ───────────────────────────────────────────────
  /**
   * renderEmailThread — يعرض رسائل الإيميل داخل chat window
   * يُستدعى من chat.js عند فتح محادثة email
   */
  async function renderEmailThread(convId, containerEl) {
    try {
      const data = await InboxAPI.email.getMessages(convId);
      const messages = data.messages || [];
      if (!messages.length) {
        containerEl.innerHTML = '<div class="iv4-email-thread-empty">لا توجد رسائل إيميل</div>';
        return;
      }
      containerEl.innerHTML = messages.map(m => _renderEmailMsg(m)).join('');
    } catch (e) {
      containerEl.innerHTML = `<div class="iv4-error">${_esc(e.message)}</div>`;
    }
  }

  function _renderEmailMsg(m) {
    const isOut   = m.direction === 'outbound';
    const date    = m.created_at ? new Date(m.created_at * 1000).toLocaleString('ar-EG') : '';
    const body    = m.body_text || '';
    const hasHtml = !!m.body_html;

    return `
      <div class="iv4-email-msg ${isOut ? 'iv4-email-msg--out' : 'iv4-email-msg--in'}">
        <div class="iv4-email-msg-header">
          <div class="iv4-email-msg-from">
            ${isOut ? '📤' : '📧'}
            <strong>${_esc(m.from_name || m.from_email)}</strong>
            <span class="iv4-email-addr">&lt;${_esc(m.from_email)}&gt;</span>
            <span class="iv4-arrow">→</span>
            <span class="iv4-email-addr">${_esc(m.to_email)}</span>
          </div>
          <span class="iv4-email-msg-date">${date}</span>
        </div>
        ${m.subject ? `<div class="iv4-email-msg-subject">📌 ${_esc(m.subject)}</div>` : ''}
        <div class="iv4-email-msg-body">${_esc(body)}</div>
        ${hasHtml ? `
        <button class="iv4-btn iv4-btn-xs iv4-email-html-toggle"
          onclick="InboxEmail._toggleHtml(this, ${m.id})">🌐 عرض HTML</button>
        <div id="iv4-email-html-${m.id}" class="iv4-email-html-frame" style="display:none">
          <iframe srcdoc="${m.body_html.replace(/"/g, '&quot;')}"
            sandbox="allow-same-origin" style="width:100%;min-height:200px;border:none"></iframe>
        </div>` : ''}
        ${m.attachments && JSON.parse(m.attachments || '[]').length ? `
        <div class="iv4-email-attachments">
          📎 ${JSON.parse(m.attachments).map(a => `<span class="iv4-attachment-chip">${_esc(a.name)}</span>`).join('')}
        </div>` : ''}
      </div>
    `;
  }

  function _toggleHtml(btn, id) {
    const frame = document.getElementById(`iv4-email-html-${id}`);
    const show  = frame.style.display === 'none';
    frame.style.display = show ? 'block' : 'none';
    btn.textContent = show ? '🙈 إخفاء HTML' : '🌐 عرض HTML';
  }

  // ─── Send Reply ──────────────────────────────────────────────────────────────
  /**
   * sendEmailReply — يُرسل إيميل رد من الـ reply box
   * يُستدعى من reply.js عند الضغط إرسال في محادثة email
   */
  async function sendEmailReply(convId, opts) {
    const { body_text, subject, in_reply_to } = opts;
    return InboxAPI.email.sendMessage(convId, { body_text, subject, in_reply_to });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Public API للاستخدام من خارج الـ module ────────────────────────────────
  return {
    init,
    open,
    close,
    renderEmailThread,
    sendEmailReply,
    // exposed للـ onclick في الـ HTML
    _openFormPublic: _openForm,
    _toggle,
    _delete,
    _testSmtp,
    _testImap,
    _pollNow,
    _copyWebhook,
    _toggleImapSection,
    _toggleWebhookSection,
    _toggleHtml
  };
})();
