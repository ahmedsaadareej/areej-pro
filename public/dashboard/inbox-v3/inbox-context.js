/**
 * inbox-context.js — Areej Pro Inbox v3
 * Contact Panel: بيانات العميل، فواتيره، أوردراته، Labels، Notes، تحويل لأوردر
 * آخر تحديث: 2026-05-02
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
  iv3LoadNotes(conv.id);

  // فتح تاب contact تلقائياً إذا لم يكن فيه تاب مفتوح مسبقاً
  const flyout = document.getElementById('iv3-ctx-flyout');
  if (flyout && !flyout.classList.contains('open')) {
    iv3CtxToggleTab('contact');
  } else if (flyout && flyout.classList.contains('open') && _iv3ActiveTab) {
    // تحديث الـ sections الظاهرة للتاب الحالي
    iv3CtxToggleTab(_iv3ActiveTab);
    setTimeout(() => iv3CtxToggleTab(_iv3ActiveTab), 10); // reopen
  }
}

// ── بيانات الاتصال الأساسية ─────────────────────────────────

function iv3RenderContactInfo(conv) {
  const cleanName = (typeof iv3CleanSenderDisplay === 'function')
    ? iv3CleanSenderDisplay(conv.sender_name, conv.sender_id)
    : (conv.sender_name || conv.sender_id || 'مجهول');
  const color    = iv3AvatarColor(conv.sender_id || conv.id);
  const initials = iv3Initials(cleanName || '?');

  const avatarEl = document.getElementById('iv3-ctx-avatar');
  const nameEl   = document.getElementById('iv3-ctx-name');
  const platEl   = document.getElementById('iv3-ctx-plat');

  if (avatarEl) { avatarEl.style.background = color; avatarEl.textContent = initials; }
  if (nameEl)   nameEl.textContent = cleanName || 'مجهول';

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

  // iv3-ctx-actions لم يعد يُستخدم (تم دمج الإجراءات في كل section)
}

// ── سياق العميل (فواتير + أوردرات) ─────────────────────────

async function iv3LoadCustomerContext(conv) {
  const phone = iv3ExtractPhone(conv.sender_id);
  // للـ @lid نحاول البحث بالاسم لو موجود
  const cleanName = (typeof iv3CleanSenderDisplay === 'function')
    ? iv3CleanSenderDisplay(conv.sender_name, conv.sender_id)
    : (conv.sender_name || '');

  if (!phone && !cleanName) {
    const addBtn = document.getElementById('iv3-ctx-add-btn');
    if (addBtn) addBtn.style.display = '';
    return;
  }

  try {
    const queryParam = phone
      ? `phone=${encodeURIComponent(phone)}`
      : `phone=${encodeURIComponent(cleanName)}`; // fallback — API بيدعم بحث بالاسم عبر LIKE
    const res = await apiFetch(`/api/crm/contacts/by-phone?${queryParam}`);
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
        id:     i.id,
        number: i.invoice_no,
        total:  i.total,
        status: i.status
      }));
    } catch (_) {}

    // حفظ contact id في IV3 لاستخدامه في Catalog → إضافة للفاتورة
    IV3._ctxContactId = contact.id || null;
    IV3._ctxRecentInvoices = recentInvoices;

    iv3RenderCustomerERP({ ...contact, invoice_count: contact.invoice_count || 0, recent_invoices: recentInvoices, recent_orders: recentOrders });

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
    ['iv3-ctx-clv','iv3-ctx-balance','iv3-ctx-invoices','iv3-ctx-orders'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

function iv3RenderCustomerERP(customer) {
  // ── CLV Badge — عدد الفواتير + إجمالي المدفوع ──
  const clvEl = document.getElementById('iv3-ctx-clv');
  if (clvEl) {
    const invCount   = customer.invoice_count  || 0;
    const totalPaid  = customer.total_paid     || 0;
    const totalInv   = customer.total_invoiced || 0;
    if (invCount > 0 || totalPaid > 0) {
      clvEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-bottom:8px">
          <span style="font-size:20px">🏆</span>
          <div style="flex:1">
            <div style="font-size:11px;color:#166534;font-weight:700;margin-bottom:2px">قيمة العميل الكاملة</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <span style="font-size:12px;color:#15803d;font-weight:700">${invCount} فاتورة</span>
              <span style="font-size:12px;color:#166534">|  مدفوع: <strong>${Number(totalPaid).toLocaleString('ar-EG')} ج.م</strong></span>
              ${totalInv > totalPaid ? `<span style="font-size:11px;color:#6b7280">(إجمالي: ${Number(totalInv).toLocaleString('ar-EG')} ج.م)</span>` : ''}
            </div>
          </div>
        </div>`;
      clvEl.style.display = '';
    } else {
      clvEl.style.display = 'none';
    }
  }

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
  // استدعاء نموذج الأوردر بمعلومات المحادثة الحالية
  iv3ConvertToOrder();
}

// ── تحويل لأوردر ───────────────────────────────────────────────────

function iv3ConvertToOrder() {
  if (!IV3.activeConv) return;

  const conv     = IV3.activeConv;
  const name     = conv.sender_name || '';
  const phone    = iv3ExtractPhone(conv.sender_id) || '';
  const contactId = conv.lead_id || '';

  const orderTypes = [
    { value: 'stock',      label: 'مخزون (جاهز)' },
    { value: 'production', label: 'طباعة (تصنيع)' },
    { value: 'external',   label: 'خارجي' },
  ];
  const typeOpts = orderTypes.map(t =>
    `<option value="${t.value}">${iv3EscHtml(t.label)}</option>`
  ).join('');

  const html = `
    <div class="iv3-modal-overlay" id="iv3-order-modal" onclick="iv3CloseModal('iv3-order-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:400px">
        <div class="iv3-modal-title">🛎️ تحويل لأوردر</div>

        <div class="iv3-order-form">
          <div class="iv3-order-field">
            <label>اسم العميل <span style="color:#EF4444">*</span></label>
            <input type="text" id="iv3-ord-name" value="${iv3EscHtml(name)}"
              placeholder="اسم العميل" class="iv3-modal-input">
          </div>
          <div class="iv3-order-field">
            <label>رقم التليفون</label>
            <input type="text" id="iv3-ord-phone" value="${iv3EscHtml(phone)}"
              placeholder="01xxxxxxxxx" class="iv3-modal-input">
          </div>
          <div class="iv3-order-field">
            <label>نوع الطلب</label>
            <select id="iv3-ord-type" class="iv3-modal-select">${typeOpts}</select>
          </div>
          <div class="iv3-order-field">
            <label>الإجمالي (ج.م)</label>
            <input type="number" id="iv3-ord-total" value="0" min="0" step="0.5"
              class="iv3-modal-input" placeholder="0">
          </div>
          <div class="iv3-order-field">
            <label>ملاحظات</label>
            <textarea id="iv3-ord-notes" class="iv3-modal-textarea" rows="2"
              placeholder="تفاصيل إضافية..."></textarea>
          </div>
        </div>

        <div id="iv3-order-error" style="color:#EF4444;font-size:12px;display:none;margin-top:6px"></div>

        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-order-modal')" class="iv3-modal-cancel">إلغاء</button>
          <button onclick="iv3SubmitOrder(${contactId || 'null'})" class="iv3-modal-confirm" id="iv3-order-submit-btn">✅ إنشاء الطلب</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

async function iv3SubmitOrder(contactId) {
  const nameEl  = document.getElementById('iv3-ord-name');
  const phoneEl = document.getElementById('iv3-ord-phone');
  const typeEl  = document.getElementById('iv3-ord-type');
  const totalEl = document.getElementById('iv3-ord-total');
  const notesEl = document.getElementById('iv3-ord-notes');
  const errEl   = document.getElementById('iv3-order-error');
  const btn     = document.getElementById('iv3-order-submit-btn');

  const name  = nameEl?.value?.trim();
  const phone = phoneEl?.value?.trim();
  const type  = typeEl?.value || 'stock';
  const total = parseFloat(totalEl?.value) || 0;
  const notes = notesEl?.value?.trim();

  if (!name) {
    if (errEl) { errEl.textContent = 'اسم العميل مطلوب'; errEl.style.display = ''; }
    if (nameEl) nameEl.focus();
    return;
  }

  if (btn) btn.disabled = true;
  if (errEl) errEl.style.display = 'none';

  try {
    const payload = {
      client_name:  name,
      client_phone: phone || null,
      order_type:   type,
      total,
      notes: notes || `تحويل من محادثة ${IV3.activeConv?.platform || ''} — ${IV3.activeConv?.sender_name || ''}`,
    };
    if (contactId) payload.contact_id = contactId;

    const result = await apiFetch('/api/system/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!result?.ok) throw new Error(result?.error || 'فشل إنشاء الطلب');

    iv3CloseModal('iv3-order-modal');
    const orderNo = result.order_no || result.id || '';
    iv3Toast(`✅ تم إنشاء طلب ${orderNo ? '#'+orderNo : ''} بنجاح`, 'success');

    // إرسال رسالة تأكيد للعميل في المحادثة
    if (IV3.activeConvId && orderNo) {
      const confirmText = `شكراً يا ${iv3EscHtml(name)}، تم تسجيل طلبك برقم ${orderNo} بنجاح. سنتواصل معك قريباً.`;
      const textarea = document.getElementById('iv3-textarea');
      if (textarea) {
        textarea.value = confirmText;
        if (typeof iv3ResizeTextarea === 'function') iv3ResizeTextarea(textarea);
        textarea.focus();
      }
    }

  } catch(e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = ''; }
    if (btn) btn.disabled = false;
  }
}

// ── Payment Link ───────────────────────────────────────────────────────────────────────

function iv3CreatePayLink() {
  if (!IV3.activeConv) return;

  const conv  = IV3.activeConv;
  const name  = conv.sender_name || '';
  const phone = iv3ExtractPhone(conv.sender_id) || '';

  const html = `
    <div class="iv3-modal-overlay" id="iv3-paylink-modal" onclick="iv3CloseModal('iv3-paylink-modal')">
      <div class="iv3-modal" onclick="event.stopPropagation()" style="max-width:390px">
        <div class="iv3-modal-title">💳 إنشاء رابط دفع</div>

        <div class="iv3-order-form">
          <div class="iv3-order-field">
            <label>اسم العميل</label>
            <input type="text" id="iv3-pl-name" value="${iv3EscHtml(name)}"
              placeholder="اسم العميل" class="iv3-modal-input">
          </div>
          <div class="iv3-order-field">
            <label>رقم التليفون</label>
            <input type="text" id="iv3-pl-phone" value="${iv3EscHtml(phone)}"
              placeholder="01xxxxxxxxx" class="iv3-modal-input">
          </div>
          <div class="iv3-order-field">
            <label>المبلغ (ج.م) <span style="color:#EF4444">*</span></label>
            <input type="number" id="iv3-pl-amount" value="" min="1" step="0.5"
              class="iv3-modal-input" placeholder="مثل: 500">
          </div>
          <div class="iv3-order-field">
            <label>وصف الدفعة (اختياري)</label>
            <input type="text" id="iv3-pl-desc"
              class="iv3-modal-input" placeholder="مثل: دفعة مقدم طباعة">
          </div>
        </div>

        <div id="iv3-paylink-error" style="color:#EF4444;font-size:12px;display:none;margin-top:6px"></div>

        <div class="iv3-modal-actions">
          <button onclick="iv3CloseModal('iv3-paylink-modal')" class="iv3-modal-cancel">إلغاء</button>
          <button onclick="iv3SubmitPayLink()" class="iv3-modal-confirm" id="iv3-paylink-submit-btn">💸 إنشاء و إرسال</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  // focus على حقل المبلغ
  setTimeout(() => document.getElementById('iv3-pl-amount')?.focus(), 50);
}

async function iv3SubmitPayLink() {
  const nameEl   = document.getElementById('iv3-pl-name');
  const phoneEl  = document.getElementById('iv3-pl-phone');
  const amountEl = document.getElementById('iv3-pl-amount');
  const descEl   = document.getElementById('iv3-pl-desc');
  const errEl    = document.getElementById('iv3-paylink-error');
  const btn      = document.getElementById('iv3-paylink-submit-btn');

  const name   = nameEl?.value?.trim();
  const phone  = phoneEl?.value?.trim();
  const amount = parseFloat(amountEl?.value);
  const desc   = descEl?.value?.trim();

  // validation
  if (!amount || amount <= 0) {
    if (errEl) { errEl.textContent = 'المبلغ مطلوب (أكبر من صفر)'; errEl.style.display = ''; }
    amountEl?.focus();
    return;
  }

  if (btn) btn.disabled = true;
  if (errEl) errEl.style.display = 'none';

  try {
    // 1. إنشاء رابط الدفع عبر API
    const result = await IV3_API.createPaymentLink({
      amount,
      description:     desc  || `دفعة من محادثة ${IV3.activeConv?.platform || ''} — ${IV3.activeConv?.sender_name || ''}`,
      client_name:     name  || '',
      client_phone:    phone || '',
      conversation_id: IV3.activeConvId || null,
    });

    iv3CloseModal('iv3-paylink-modal');

    // 2. تعبئة التكست برسالة جاهزة في reply box (للتعديل قبل الإرسال إذا أراد)
    const payText = `مرحباً يا ${name || 'عميلنا'}😊
تفضل اتم الدفعة عبر الرابط التالي:
${result.link}`;

    const textarea = document.getElementById('iv3-textarea');
    if (textarea) {
      textarea.value = payText;
      if (typeof iv3ResizeTextarea === 'function') iv3ResizeTextarea(textarea);
      textarea.focus();
    }

    iv3Toast(`✅ تم إنشاء رابط الدفع — انسخ الرسالة وأرسلها`, 'success');

  } catch(e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = ''; }
    if (btn) btn.disabled = false;
  }
}

function iv3CtxAddContact() {
  if (!IV3.activeConv) return;
  const name  = IV3.activeConv.sender_name || '';
  const phone = iv3ExtractPhone(IV3.activeConv.sender_id) || '';
  window.open(`/dashboard#p=crm&new=1&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`, '_blank');
}

// ── Toggle Context Panel ─────────────────────────────────────

// ── Icon Sidebar Tab System ────────────────────────────────────

const IV3_CTX_TABS = {
  contact:  { title: '👤 بيانات العميل',  sections: ['iv3-ctx-header','iv3-ctx-details','iv3-ctx-clv','iv3-ctx-balance'] },
  invoices: { title: '📄 الفواتير',        sections: ['iv3-ctx-header','iv3-ctx-clv','iv3-ctx-invoices'] },
  orders:   { title: '📦 الأوردرات',        sections: ['iv3-ctx-header','iv3-ctx-orders'] },
  pay:      { title: '💳 الدفع والفواتير', sections: ['iv3-ctx-header','iv3-ctx-balance','iv3-ctx-pay'] },
  notes:    { title: '📌 ملاحظات',         sections: ['iv3-ctx-header','iv3-ctx-notes'] },
};

let _iv3ActiveTab = null;

function iv3CtxToggleTab(tab) {
  const flyout = document.getElementById('iv3-ctx-flyout');
  if (!flyout) return;

  // لو نفس التاب — أغلق الـ flyout
  if (_iv3ActiveTab === tab && flyout.classList.contains('open')) {
    flyout.classList.remove('open');
    _iv3ActiveTab = null;
    document.querySelectorAll('.iv3-ctx-icon-btn').forEach(b => b.classList.remove('active'));
    return;
  }

  _iv3ActiveTab = tab;

  // تمييز الزر النشط
  document.querySelectorAll('.iv3-ctx-icon-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`iv3-ctx-btn-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  // تحديث عنوان الـ flyout
  const headerEl = flyout.querySelector('.iv3-ctx-flyout-header span');
  if (headerEl) headerEl.textContent = IV3_CTX_TABS[tab]?.title || '';

  // إظهار/إخفاء الـ sections
  const allSections = ['iv3-ctx-empty','iv3-ctx-header','iv3-ctx-details','iv3-ctx-clv',
    'iv3-ctx-balance','iv3-ctx-actions','iv3-ctx-invoices','iv3-ctx-orders','iv3-ctx-notes','iv3-ctx-pay'];
  const tabSections = IV3_CTX_TABS[tab]?.sections || [];

  allSections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // empty: أخف دائماً عند فتح تاب
    if (id === 'iv3-ctx-empty') { el.style.display = 'none'; return; }
    el.style.display = tabSections.includes(id) ? '' : 'none';
  });

  flyout.classList.add('open');
}

function iv3CtxCloseFlyout() {
  const flyout = document.getElementById('iv3-ctx-flyout');
  if (flyout) flyout.classList.remove('open');
  _iv3ActiveTab = null;
  document.querySelectorAll('.iv3-ctx-icon-btn').forEach(b => b.classList.remove('active'));
}

function iv3ToggleContext() {
  // legacy toggle — بيفتح/يغلق تاب contact
  iv3CtxToggleTab('contact');
}

// ── Reset Context Panel ──────────────────────────────────────

function iv3ResetContextPanel() {
  // إغلاق الـ flyout وإعادة تعيين الحالة
  iv3CtxCloseFlyout();

  const emptyEl  = document.getElementById('iv3-ctx-empty');
  const headerEl = document.getElementById('iv3-ctx-header');
  if (emptyEl)  emptyEl.style.display  = '';
  if (headerEl) headerEl.style.display = 'none';

  ['iv3-ctx-details','iv3-ctx-clv','iv3-ctx-balance','iv3-ctx-actions','iv3-ctx-invoices','iv3-ctx-orders','iv3-ctx-notes','iv3-ctx-pay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ── Helpers ──────────────────────────────────────────────────

function iv3ExtractPhone(senderId) {
  if (!senderId) return null;
  if (String(senderId).includes('@lid')) return null; // LID ليس رقم هاتف
  const cleaned = String(senderId).replace(/@.+$/, '').replace(/\D/g, '');
  // رقم مصري عادةً 11-12 رقم (01xxxxxxxxx أو 201xxxxxxxxx) أو دولي 10-15
  if (cleaned.length < 8 || cleaned.length > 15) return null;
  return '+' + cleaned;
}

function iv3LinkCustomer() {
  iv3Toast('ميزة الربط بالعميل قيد التطوير', 'info');
}

function iv3ConvertLead() {
  iv3Toast('ميزة تحويل Lead قيد التطوير', 'info');
}

// ── Notes Panel ──────────────────────────────────────────────

async function iv3LoadNotes(convId) {
  const section = document.getElementById('iv3-ctx-notes');
  const list    = document.getElementById('iv3-ctx-notes-list');
  if (!section || !list) return;

  section.style.display = '';
  list.innerHTML = `<div style="color:#9CA3AF;font-size:12px;padding:4px 0">جاري التحميل...</div>`;

  try {
    const data = await IV3_API.getNotes(convId);
    const notes = Array.isArray(data) ? data : (data.notes || []);

    if (!notes.length) {
      list.innerHTML = `<div class="iv3-dropdown-empty" style="font-size:12px;padding:6px 0">لا توجد ملاحظات بعد</div>`;
      return;
    }

    list.innerHTML = notes.map(n => `
      <div class="iv3-note-item" id="iv3-note-${n.id}">
        <button class="iv3-note-delete" onclick="iv3DeleteNote(${n.id})" title="حذف">✕</button>
        <div class="iv3-note-content">${iv3EscHtml(n.content)}</div>
        <div class="iv3-note-meta">
          ${iv3EscHtml(n.author_name || 'مجهول')} · ${iv3FormatTime(n.created_at)}
        </div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = `<div style="color:#EF4444;font-size:12px">⚠️ فشل تحميل الملاحظات</div>`;
  }
}

function iv3ShowAddNote() {
  const form = document.getElementById('iv3-note-form');
  const input = document.getElementById('iv3-note-input');
  if (form) form.style.display = '';
  if (input) { input.value = ''; input.focus(); }
}

function iv3HideAddNote() {
  const form = document.getElementById('iv3-note-form');
  if (form) form.style.display = 'none';
}

async function iv3SubmitNote() {
  if (!IV3.activeConvId) return;

  const input = document.getElementById('iv3-note-input');
  const text  = input?.value?.trim();
  if (!text) return;

  const btn = document.querySelector('#iv3-note-form .iv3-modal-confirm');
  if (btn) btn.disabled = true;

  try {
    await IV3_API.addNote(IV3.activeConvId, text);
    iv3HideAddNote();
    await iv3LoadNotes(IV3.activeConvId);
    iv3Toast('تم حفظ الملاحظة ✓', 'success');
  } catch(e) {
    iv3Toast('فشل حفظ الملاحظة: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function iv3DeleteNote(noteId) {
  if (!IV3.activeConvId) return;
  if (!confirm('حذف الملاحظة؟')) return;

  try {
    await apiFetch(`/api/system/inbox/conversations/${IV3.activeConvId}/notes/${noteId}`, { method: 'DELETE' });
    document.getElementById(`iv3-note-${noteId}`)?.remove();
    iv3Toast('تم حذف الملاحظة', 'success');

    // لو القائمة فاضية بعد الحذف
    const list = document.getElementById('iv3-ctx-notes-list');
    if (list && !list.querySelector('.iv3-note-item')) {
      list.innerHTML = `<div class="iv3-dropdown-empty" style="font-size:12px;padding:6px 0">لا توجد ملاحظات بعد</div>`;
    }
  } catch(e) {
    iv3Toast('فشل الحذف: ' + e.message, 'error');
  }
}
