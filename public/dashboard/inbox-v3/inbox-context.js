/**
 * inbox-context.js — Areej Pro Inbox v3
 * Contact Panel: بيانات العميل، فواتيره، أوردراته، Labels، Notes
 * آخر تحديث: 2026-05-02 (v2 — متوافق مع IDs في inbox.html)
 */

// ── تحديث الـ Context Panel ─────────────────────────────────

async function iv3UpdateContextPanel(conv) {
  if (!conv) return;

  // إظهار الـ header وإخفاء empty state
  const emptyEl  = document.getElementById('iv3-ctx-empty');
  const headerEl = document.getElementById('iv3-ctx-header');
  if (emptyEl)  emptyEl.style.display  = 'none';
  if (headerEl) headerEl.style.display = '';

  iv3RenderContactInfo(conv);
  iv3LoadCustomerContext(conv);
}

// ── بيانات الاتصال الأساسية ─────────────────────────────────

function iv3RenderContactInfo(conv) {
  const color    = iv3AvatarColor(conv.sender_id || conv.id);
  const initials = iv3Initials(conv.sender_name || conv.sender_id || '?');

  const avatarEl = document.getElementById('iv3-ctx-avatar');
  const nameEl   = document.getElementById('iv3-ctx-name');
  const platEl   = document.getElementById('iv3-ctx-plat');

  if (avatarEl) { avatarEl.style.background = color; avatarEl.textContent = initials; }
  if (nameEl)   nameEl.textContent = conv.sender_name || conv.sender_id || 'مجهول';

  const platNames = {
    'whatsapp-qr': '📱 واتساب QR',
    'whatsapp':    '💬 واتساب API',
    'telegram':    '✈️ تيليجرام',
    'messenger':   '💙 ماسنجر',
    'instagram':   '📸 إنستجرام',
  };
  if (platEl) platEl.textContent = platNames[conv.platform] || conv.platform || '';

  // إظهار section التفاصيل
  const detailsEl = document.getElementById('iv3-ctx-details');
  if (detailsEl) {
    const phoneEl = document.getElementById('iv3-ctx-phone');
    if (phoneEl) phoneEl.textContent = iv3ExtractPhone(conv.sender_id) || '—';
    detailsEl.style.display = '';
  }

  // إظهار الأزرار السريعة
  const actionsEl = document.getElementById('iv3-ctx-actions');
  if (actionsEl) actionsEl.style.display = '';
}

// ── سياق العميل (فواتير + أوردرات) ─────────────────────────

async function iv3LoadCustomerContext(conv) {
  const phone = iv3ExtractPhone(conv.sender_id);
  if (!phone) {
    // إظهار زر "إضافة كعميل"
    const addBtn = document.getElementById('iv3-ctx-add-btn');
    if (addBtn) addBtn.style.display = '';
    return;
  }

  try {
    const res = await apiFetch(`/api/crm/contacts/by-phone?phone=${encodeURIComponent(phone)}`);
    if (!res || !res.ok || !res.contact) throw new Error('not found');

    const contact = res.contact;

    // جلب الفواتير الأخيرة للعميل
    let recentInvoices = [];
    let recentOrders   = [];
    try {
      const invData = await apiFetch(`/api/system/invoices?search=${encodeURIComponent(contact.name || '')}&limit=4`);
      recentInvoices = (invData?.data || []).filter(i => i.contact_id === contact.id).slice(0, 4);
      // تحويل الحقول للصيغة المتوقعة
      recentInvoices = recentInvoices.map(i => ({
        number: i.invoice_no,
        total: i.total,
        status: i.status
      }));
    } catch (_) {}

    iv3RenderCustomerERP({ ...contact, recent_invoices: recentInvoices, recent_orders: recentOrders });

    // إخفاء زر "إضافة" لأنه موجود
    const addBtn = document.getElementById('iv3-ctx-add-btn');
    if (addBtn) addBtn.style.display = 'none';

    // رابط البروفايل
    const profileBtn = document.getElementById('iv3-ctx-profile-btn');
    if (profileBtn) profileBtn.onclick = () => iv3CtxOpenProfile(contact.id);

  } catch (e) {
    // العميل مش موجود في CRM
    const addBtn = document.getElementById('iv3-ctx-add-btn');
    if (addBtn) addBtn.style.display = '';

    // إخفاء sections الفواتير والأوردرات
    ['iv3-ctx-balance','iv3-ctx-invoices','iv3-ctx-orders'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

function iv3RenderCustomerERP(customer) {
  // ── الرصيد ──
  const balanceEl = document.getElementById('iv3-ctx-balance');
  const balanceInner = document.getElementById('iv3-balance-inner');
  if (balanceEl && balanceInner && customer.balance !== undefined) {
    const isDebt = customer.balance > 0;
    balanceInner.innerHTML = `
      <span style="color:${isDebt ? '#EF4444' : '#10B981'}">
        ${isDebt ? '⚠️' : '✓'} الذمم: <strong>${customer.balance} ج.م</strong>
      </span>`;
    balanceEl.style.display = '';
  }

  // ── الإيميل والمدينة ──
  const emailEl = document.getElementById('iv3-ctx-email');
  const cityEl  = document.getElementById('iv3-ctx-city');
  if (emailEl) emailEl.textContent = customer.email || '—';
  if (cityEl)  cityEl.textContent  = customer.city  || '—';

  // ── الفواتير ──
  const invSection = document.getElementById('iv3-ctx-invoices');
  const invList    = document.getElementById('iv3-ctx-inv-list');
  if (invSection && invList) {
    const invoices = customer.recent_invoices || [];
    if (invoices.length) {
      invList.innerHTML = invoices.slice(0, 4).map(inv => `
        <div class="iv3-erp-row">
          <span class="iv3-erp-label">#${inv.number}</span>
          <span class="iv3-erp-val" style="color:${inv.status === 'paid' ? '#10B981' : '#EF4444'}">
            ${inv.total} ج — ${inv.status === 'paid' ? '✓' : '⏳'}
          </span>
        </div>`).join('');
      invSection.style.display = '';
    }
  }

  // ── الأوردرات ──
  const ordSection = document.getElementById('iv3-ctx-orders');
  const ordList    = document.getElementById('iv3-ctx-ord-list');
  if (ordSection && ordList) {
    const orders = customer.recent_orders || [];
    if (orders.length) {
      ordList.innerHTML = orders.slice(0, 4).map(ord => `
        <div class="iv3-erp-row">
          <span class="iv3-erp-label">#${ord.number}</span>
          <span class="iv3-erp-val">${iv3EscHtml(ord.status_label || ord.status || '')}</span>
        </div>`).join('');
      ordSection.style.display = '';
    }
  }
}

// ── Labels ──────────────────────────────────────────────────

async function iv3OpenLabels() {
  if (!IV3.activeConvId) return;

  if (!IV3.labels.length) {
    try {
      const data = await IV3_API.getLabels();
      IV3.labels = Array.isArray(data) ? data : (data.labels || []);
    } catch (e) { IV3.labels = []; }
  }

  const items = IV3.labels.length
    ? IV3.labels.map(l => `
        <div class="iv3-dropdown-item" onclick="iv3AddLabelToConv(${IV3.activeConvId},${l.id});iv3CloseModal('iv3-labels-modal')">
          <span class="iv3-label-dot" style="background:${l.color || '#9CA3AF'}"></span>
          ${iv3EscHtml(l.name)}
        </div>`).join('')
    : '<div class="iv3-dropdown-empty">لا توجد تسميات — أضف من الإعدادات</div>';

  const html = `
    <div class="iv3-modal-overlay" id="iv3-labels-modal" onclick="iv3CloseModal('iv3-labels-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:300px">
        <div class="iv3-modal-title">🏷️ إضافة تسمية</div>
        <div class="iv3-modal-body">${items}</div>
        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-labels-modal')" class="iv3-modal-cancel">إغلاق</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function iv3AddLabelToConv(convId, labelId) {
  try {
    await IV3_API.addLabel(convId, labelId);
    iv3Toast('تم إضافة التسمية ✓', 'success');
  } catch (e) {
    iv3Toast(e.message, 'error');
  }
}

async function iv3RemoveLabelFromConv(convId, labelId) {
  try {
    await IV3_API.removeLabel(convId, labelId);
    iv3Toast('تم حذف التسمية', 'success');
  } catch (e) {
    iv3Toast(e.message, 'error');
  }
}

// ── إرسال فاتورة ────────────────────────────────────────────

async function iv3SendInvoice() {
  if (!IV3.activeConvId) return;
  try {
    const data = await apiFetch('/api/system/invoices?status=pending&limit=20');
    if (!data) throw new Error('فشل تحميل الفواتير');
    const invoices = data.invoices || data || [];

    if (!invoices.length) { iv3Toast('لا توجد فواتير معلقة', 'error'); return; }

    const items = invoices.map(inv => `
      <div class="iv3-dropdown-item" onclick="iv3ConfirmSendInvoice(${inv.id})">
        <strong>فاتورة #${inv.number || inv.id}</strong>
        <span>${(inv.total || 0).toLocaleString('ar-EG')} ج — ${iv3EscHtml(inv.customer_name || '')}</span>
      </div>`).join('');

    const html = `
      <div class="iv3-modal-overlay" id="iv3-invoice-modal" onclick="iv3CloseModal('iv3-invoice-modal')">
        <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:360px">
          <div class="iv3-modal-title">📄 إرسال فاتورة</div>
          <div class="iv3-modal-body">${items}</div>
          <div class="iv3-modal-actions">
            <button onclick="iv3CloseModal('iv3-invoice-modal')" class="iv3-modal-cancel">إلغاء</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) {
    iv3Toast(e.message, 'error');
  }
}

async function iv3ConfirmSendInvoice(invoiceId) {
  iv3CloseModal('iv3-invoice-modal');
  try {
    await IV3_API.sendInvoice(IV3.activeConvId, invoiceId);
    await iv3LoadMessages(IV3.activeConvId);
    iv3Toast('تم إرسال الفاتورة ✓', 'success');
  } catch (e) {
    iv3Toast('فشل إرسال الفاتورة: ' + e.message, 'error');
  }
}

// ── Quick Action Buttons ─────────────────────────────────────

function iv3CtxOpenProfile(customerId) {
  if (customerId) {
    window.open(`/dashboard#p=crm&id=${customerId}`, '_blank');
  } else {
    iv3Toast('العميل غير مرتبط بـ CRM', 'info');
  }
}

function iv3CtxNewInvoice() {
  if (IV3.activeConv) {
    window.open(`/dashboard#p=invoices&new=1&customer=${encodeURIComponent(IV3.activeConv.sender_name || '')}`, '_blank');
  }
}

function iv3CtxNewOrder() {
  if (IV3.activeConv) {
    window.open(`/dashboard#p=orders&new=1`, '_blank');
  }
}

function iv3CtxAddContact() {
  if (!IV3.activeConv) return;
  const name  = IV3.activeConv.sender_name || '';
  const phone = iv3ExtractPhone(IV3.activeConv.sender_id) || '';
  window.open(`/dashboard#p=crm&new=1&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`, '_blank');
}

// ── Toggle Context Panel ─────────────────────────────────────

function iv3ToggleContext() {
  const panel = document.getElementById('iv3-context');
  if (!panel) return;
  panel.classList.toggle('visible');
}

// ── Reset Context Panel ──────────────────────────────────────

function iv3ResetContextPanel() {
  const emptyEl  = document.getElementById('iv3-ctx-empty');
  const headerEl = document.getElementById('iv3-ctx-header');
  if (emptyEl)  emptyEl.style.display  = '';
  if (headerEl) headerEl.style.display = 'none';

  ['iv3-ctx-details','iv3-ctx-balance','iv3-ctx-actions','iv3-ctx-invoices','iv3-ctx-orders'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ── Helpers ──────────────────────────────────────────────────

function iv3ExtractPhone(senderId) {
  if (!senderId) return null;
  const cleaned = String(senderId).replace(/@.+$/, '').replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

function iv3LinkCustomer() {
  iv3Toast('ميزة الربط بالعميل قيد التطوير', 'info');
}

function iv3ConvertLead() {
  iv3Toast('ميزة تحويل Lead قيد التطوير', 'info');
}
