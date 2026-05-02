// ── INVOICES ──
let invListTimer = null;
let crmContactsCache = [];
let sysProductsCache = [];

async function loadInvoiceStats() {
  const d = await sysGet('/invoices/stats/summary');
  if (!d.ok) return;
  const s = d.data;
  const el = id => document.getElementById(id);
  if(el('inv-total')) el('inv-total').textContent = s.total_invoices;
  if(el('inv-paid-total')) el('inv-paid-total').textContent = fmt(s.paid_total) + ' ج.م';
  if(el('inv-paid-count')) el('inv-paid-count').textContent = s.paid_count + ' فاتورة';
  if(el('inv-pend-total')) el('inv-pend-total').textContent = fmt(s.pending_total) + ' ج.م';
  if(el('inv-pend-count')) el('inv-pend-count').textContent = s.pending_count + ' فاتورة';
  if(el('inv-month')) el('inv-month').textContent = fmt(s.month_revenue) + ' ج.م';
}

async function loadInvoices() {
  const tbody = document.getElementById('invListTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">جارٍ التحميل...</td></tr>';
  const search = document.getElementById('invSearchBox')?.value || '';
  const status = document.getElementById('invStatusFilter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const d = await sysGet('/invoices?' + params);
  if (!d.ok) { tbody.innerHTML = '<tr><td colspan="6" style="color:red;text-align:center">خطأ</td></tr>'; return; }
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">لا توجد فواتير</td></tr>'; return; }
  const statusLabel = { draft:'مسودة', sent:'مرسلة', paid:'مدفوعة', cancelled:'ملغاة' };
  const statusCls = { draft:'badge-cold', sent:'badge-prospect', paid:'badge-client', cancelled:'badge-out' };
  tbody.innerHTML = d.data.map(inv =>
    '<tr style="cursor:pointer" onclick="openInvoiceDetail('+inv.id+')" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
    '<td><strong style="color:var(--brand,#1B5E30)">'+esc(inv.invoice_no)+'</strong></td>' +
    '<td>'+esc(inv.client_name)+'</td>' +
    '<td style="font-weight:700;color:var(--brand,#1B5E30)">'+fmt(inv.total)+' ج.م</td>' +
    '<td style="color:#9ca3af;font-size:12px">'+formatDate(inv.created_at)+'</td>' +
    '<td><span class="badge '+( statusCls[inv.status]||'')+'">'+( statusLabel[inv.status]||inv.status)+'</span></td>' +
    '<td onclick="event.stopPropagation()"><div style="display:flex;gap:6px">' +
    '<button class="btn btn-sm btn-primary" onclick="window.open(\''+'/api/system/invoices/'+inv.id+'/pdf?_t='+getToken()+'\',\'_blank\')">\u{1F5A8}\uFE0F PDF</button>' +

    (inv.client_phone ? '<button class="btn btn-sm" style="background:#25D366;color:#fff;border:none;font-size:12px" onclick="sendInvWA('+inv.id+',\''+esc(inv.invoice_no)+'\','+inv.total+',\''+esc(inv.client_name||'')+'\',\''+esc(inv.client_phone||'')+'\')">📱 واتساب</button>' : '') +
    (inv.status !== 'paid' && inv.status !== 'cancelled' ? '<button class="btn btn-sm btn-gold" onclick="markPaid('+inv.id+')">✅ دفع</button>' : '') +
    (inv.status !== 'paid' && inv.status !== 'cancelled' ? '<button class="btn btn-sm" style="background:#0891B2;color:#fff;border:none;font-size:12px" onclick="sendInvToPayment('+inv.id+',\''+esc(inv.invoice_no)+'\','+inv.total+',\''+esc(inv.client_name||'')+'\'\,\''+esc(inv.client_phone||'')+'\')" title="إرسال رابط دفع">💳 دفع</button>' : '') +
    (!inv.has_order && inv.status !== 'cancelled' ? '<button class="btn btn-sm" style="background:#e0f2fe;color:#0369a1;border:none;font-size:11px" onclick="convertToOrder('+inv.id+')">📋 طلب</button>' : '') +
    (inv.status === 'draft' ? '<button class="btn btn-sm btn-danger" onclick="deleteInvoice('+inv.id+')">🗑️</button>' : '') +
    '</div></td></tr>'
  ).join('');
}

function debounceInvList() { clearTimeout(invListTimer); invListTimer = setTimeout(loadInvoices, 400); }

async function openInvoiceDetail(id) {
  let panel = document.getElementById('invoice-detail-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'invoice-detail-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(640px,100vw);height:100vh;background:#f5f7fa;z-index:9999;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:.3s';
    document.body.appendChild(panel);
  }
  panel.innerHTML = '<div style="background:var(--brand,#1B5E30);padding:16px 20px;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between">'
    + '<div style="color:#fff;font-size:16px;font-weight:900">🧾 تفاصيل الفاتورة</div>'
    + '<button onclick="document.getElementById(\'invoice-detail-panel\').style.transform=\'translateX(100%)\'" style="color:#fff;background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 12px;font-size:18px;cursor:pointer">✕</button>'
    + '</div><div style="padding:16px" id="inv-detail-body"><div style="text-align:center;padding:40px;color:#9ca3af">جاري التحميل...</div></div>';
  panel.style.transform = 'translateX(0)';

  const d = await sysGet('/invoices/' + id);
  if (!d.ok) { document.getElementById('inv-detail-body').innerHTML = '<div style="color:#CC2200;text-align:center;padding:20px">خطأ في التحميل</div>'; return; }
  const inv = d.data;
  const items    = inv.items    || [];
  const payments = inv.payments || [];
  const contact  = inv.contact  || null;

  const stLabel = { draft:'مسودة', sent:'مرسلة', paid:'مدفوعة', cancelled:'ملغاة' };
  const stColor = { draft:'#9ca3af', sent:'#3b82f6', paid:'#16a34a', cancelled:'#ef4444' };
  const pmLabels = { cash:'نقدي', transfer:'تحويل بنكي', instapay:'إنستا باي', vodafone_cash:'فودافون كاش', check:'شيك' };
  const sc = stColor[inv.status]||'#9ca3af';
  const pdfUrl = window.location.origin + '/api/system/invoices/'+id+'/pdf?_t='+getToken();

  let html = '';

  // ── Header: رقم + حالة + منشئ ──
  html += '<div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">';
  html += '<div><div style="font-size:22px;font-weight:900;color:var(--brand,#1B5E30)">' + esc(inv.invoice_no) + '</div>';
  html += '<div style="font-size:11px;color:#9ca3af;margin-top:2px">📅 ' + (inv.created_at||'').substring(0,16).replace('T',' ') + '</div>';
  if (inv.created_by_name) html += '<div style="font-size:11px;color:#6b7280;margin-top:2px">👤 أنشأها: <strong>' + esc(inv.created_by_name) + '</strong></div>';
  html += '</div>';
  html += '<span style="background:'+sc+'20;color:'+sc+';padding:7px 16px;border-radius:10px;font-weight:700;font-size:14px">' + (stLabel[inv.status]||inv.status) + '</span>';
  html += '</div>';

  // Actions row
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '<a href="'+pdfUrl+'" target="_blank" style="background:var(--brand,#1B5E30);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">🖨️ PDF</a>';
  const phone = (contact?.phone || contact?.whatsapp || inv.client_phone || '').replace(/^0/,'');
  if (phone) {
    html += '<button onclick="sendInvWA('+id+',\''+esc(inv.invoice_no)+'\','+inv.total+',\''+esc(inv.client_name||'')+'\',\'0'+phone+'\')" style="background:#25D366;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">📱 واتساب</button>';
  }
  if (inv.status !== 'paid' && inv.status !== 'cancelled') {
    html += '<button onclick="markPaid('+id+')" style="background:#16a34a;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">✅ تسجيل دفع</button>';
  }
  if (inv.contact_id) {
    html += '<button onclick="openClientProfile('+inv.contact_id+',\''+esc(inv.client_name||'')+'\');" style="background:#eff6ff;border:1.5px solid #bfdbfe;color:#2563eb;padding:8px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">👤 بروفايل العميل</button>';
  }
  html += '</div></div>';

  // ── بيانات العميل ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">👤 بيانات العميل</div>';
  html += '<div style="font-size:14px;font-weight:700;color:var(--brand,#1B5E30);margin-bottom:6px">' + esc(inv.client_name||'') + '</div>';
  const clientPhone = contact?.phone || contact?.whatsapp || inv.client_phone;
  const clientEmail = contact?.email || inv.client_email;
  const clientAddr  = contact?.city ? (inv.client_address ? inv.client_address + ' — ' + contact.city : contact.city) : inv.client_address;
  if (clientPhone) html += '<div style="font-size:12px;color:#6b7280;margin-bottom:3px">📞 ' + esc(clientPhone) + '</div>';
  if (clientEmail) html += '<div style="font-size:12px;color:#6b7280;margin-bottom:3px">📧 ' + esc(clientEmail) + '</div>';
  if (clientAddr)  html += '<div style="font-size:12px;color:#6b7280;margin-bottom:3px">📍 ' + esc(clientAddr) + '</div>';
  if (inv.due_date) html += '<div style="font-size:12px;color:#F5A623;font-weight:600;margin-top:4px">⏰ تاريخ الاستحقاق: ' + inv.due_date + '</div>';
  html += '</div>';

  // ── المنتجات ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">📦 المنتجات ('+items.length+')</div>';
  if (!items.length) {
    html += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:10px">لا توجد منتجات</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:#f9fafb"><th style="padding:7px 8px;text-align:right;font-weight:700;color:#6b7280">المنتج</th><th style="padding:7px 8px;text-align:center;font-weight:700;color:#6b7280">كمية</th><th style="padding:7px 8px;text-align:left;font-weight:700;color:#6b7280">سعر الوحدة</th><th style="padding:7px 8px;text-align:left;font-weight:700;color:#6b7280">الإجمالي</th></tr></thead>';
    html += '<tbody>' + items.map(it => {
      // استخدم product_name لو مختلف عن description، غير كده description بس
      const name = (it.product_name && it.product_name !== it.description) 
        ? it.product_name 
        : (it.description || it.product_name || it.name || '—');
      return '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:8px;font-weight:600">' + esc(name) + '</td>'
        + '<td style="padding:8px;text-align:center">' + (it.qty||1) + '</td>'
        + '<td style="padding:8px;text-align:left">' + fmt(it.unit_price||it.price||0) + ' ج</td>'
        + '<td style="padding:8px;text-align:left;font-weight:700;color:var(--brand,#1B5E30)">' + fmt(it.total||0) + ' ج</td>'
        + '</tr>';
    }).join('') + '</tbody></table>';

    // Totals
    html += '<div style="margin-top:10px;border-top:1px solid #f3f4f6;padding-top:10px">';
    if ((inv.subtotal||0) !== (inv.total||0)) html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:3px"><span>المجموع</span><span>' + fmt(inv.subtotal||0) + ' ج</span></div>';
    if (inv.discount > 0) html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#16a34a;margin-bottom:3px"><span>خصم</span><span>— ' + fmt(inv.discount) + ' ج</span></div>';
    if (inv.tax > 0)      html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:3px"><span>ضريبة</span><span>+ ' + fmt(inv.tax) + ' ج</span></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:17px;font-weight:900;color:var(--brand,#1B5E30);margin-top:6px"><span>الإجمالي</span><span>' + fmt(inv.total||0) + ' ج.م</span></div>';
    html += '</div>';
  }
  html += '</div>';

  // ── سجل المدفوعات ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">💳 سجل المدفوعات</div>';
  if (!payments.length) {
    const isPaid = inv.status === 'paid';
    html += '<div style="text-align:center;padding:12px;background:'+(isPaid?'#f0fdf4':'#fef9c3')+';border-radius:8px;font-size:12px;font-weight:700;color:'+(isPaid?'#16a34a':'#92400e')+'">'+(isPaid?'✅ مدفوعة (سجل الدفع غير متاح لهذا الإصدار)':'⚠️ لم يتم السداد بعد')+'</div>';
  } else {
    payments.forEach(p => {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6">';
      html += '<div style="width:32px;height:32px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:14px">💰</div>';
      html += '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--brand,#1B5E30)">'+fmt(p.amount)+' ج.م</div>';
      html += '<div style="font-size:11px;color:#6b7280">'+esc(p.wallet_name||'خزينة')+(p.description?' — '+esc(p.description.substring(0,40)):'')+'</div></div>';
      html += '<div style="font-size:10px;color:#9ca3af">'+(p.date||p.created_at||'').substring(0,10)+'</div>';
      html += '</div>';
    });
    const totalPaid = payments.filter(p=>p.type==='in').reduce((s,p)=>s+p.amount,0);
    const remaining = (inv.total||0) - totalPaid;
    html += '<div style="margin-top:8px;display:flex;justify-content:space-between;font-size:12px;padding-top:8px;border-top:1px solid #f3f4f6">';
    html += '<span style="color:#16a34a;font-weight:700">تم الدفع: '+fmt(totalPaid)+' ج.م</span>';
    if (remaining > 0.01) html += '<span style="color:#CC2200;font-weight:700">متبقي: '+fmt(remaining)+' ج.م</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── ملاحظات ──
  if (inv.notes) {
    html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
    html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:6px">📝 ملاحظات</div>';
    html += '<div style="font-size:12px;color:#6b7280;line-height:1.7">' + esc(inv.notes) + '</div>';
    html += '</div>';
  }

  // ── حالة الدفع ──
  if (inv.status !== 'paid' && inv.status !== 'cancelled') {
    html += '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:14px;text-align:center">';
    html += '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px">⚠️ متأخر السداد — ' + fmt(inv.total||0) + ' ج.م مستحقة</div>';
    html += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">';
    html += '<button onclick="markPaid('+id+')" style="background:#1B5E30;color:#fff;border:none;padding:9px 20px;border-radius:9px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">✅ تسجيل الدفع</button>';
    const ipPhone = (contact?.phone||contact?.whatsapp||inv.client_phone||'');
    html += '<button onclick="sendInvToPayment('+id+',\''+esc(inv.invoice_no)+'\','+( inv.total||0)+',\''+esc(inv.client_name||'')+'\'\,\''+esc(ipPhone)+'\')" style="background:#0891B2;color:#fff;border:none;padding:9px 20px;border-radius:9px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">💳 إرسال رابط دفع</button>';
    html += '</div>';
    html += '</div>';
  } else if (inv.status === 'paid') {
    html += '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:12px;text-align:center;color:#16a34a;font-weight:700;font-size:14px">✅ مدفوعة' + (inv.paid_at ? ' — ' + (inv.paid_at||'').substring(0,10) : '') + '</div>';
  }

  document.getElementById('inv-detail-body').innerHTML = html;
}



async function openNewInvoice() {
  setTimeout(() => initClientAutocomplete('inv-name', 'inv-phone'), 100);
  const dc = await fetch(API_CRM + '/contacts?limit=200', { headers: hdr(), credentials: 'include' }).then(r => r.json());
  crmContactsCache = dc.ok ? dc.data : [];
  const sel = document.getElementById('inv-contact');
  sel.innerHTML = '<option value="">— عميل جديد —</option>' +
    crmContactsCache.map(c => '<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  const dp = await sysGet('/products');
  sysProductsCache = dp.ok ? dp.data : [];
  ['inv-name','inv-phone','inv-email','inv-address','inv-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inv-discount').value = '0';
  document.getElementById('inv-tax').value = '0';
  document.getElementById('invItemsContainer').innerHTML = '';
  document.getElementById('inv-wallet').value = '';
  document.getElementById('inv-payment-method').value = '';
  await fillWalletDropdown('inv-wallet', ['cash','ewallet','bank'], '— لم تُقبض بعد (آجل) —');
  addInvItem();
  updateInvTotals();
  document.getElementById('invoiceModal').classList.remove('hidden');
}

function fillClientFromCRM() {
  const sel = document.getElementById('inv-contact');
  const val = sel.value;
  if (!val) return;
  const c = crmContactsCache.find(x => String(x.id) === val);
  if (!c) return;
  document.getElementById('inv-name').value = c.name || '';
  document.getElementById('inv-phone').value = c.whatsapp || '';
  document.getElementById('inv-email').value = c.email || '';
  document.getElementById('inv-address').value = c.city || '';
}

function addInvItem() {
  const container = document.getElementById('invItemsContainer');
  const idx = container.children.length;
  const productOpts = sysProductsCache.map(p =>
    '<option value="'+p.id+'" data-price="'+p.sell_price+'">'+esc(p.name)+' ('+fmt(p.sell_price)+' ج.م)</option>'
  ).join('');
  const div = document.createElement('div');
  div.className = 'inv-item-row';
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end';
  div.innerHTML =
    '<div>' +
    (idx===0?'<label style="font-size:12px;font-weight:600;color:#9ca3af">الوصف / المنتج</label>':'')+
    '<div style="display:flex;gap:4px">'+
    '<select onchange="fillItemFromProduct(this,'+idx+')" style="width:130px;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:12px;flex-shrink:0">'+
    '<option value="">من المخزون</option>'+productOpts+
    '</select>'+
    '<input type="text" id="item-desc-'+idx+'" placeholder="وصف المنتج أو الخدمة" style="flex:1;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none">'+
    '</div></div>'+
    '<div>'+(idx===0?'<label style="font-size:12px;font-weight:600;color:#9ca3af">الكمية</label>':'')+
    '<input type="number" id="item-qty-'+idx+'" value="1" min="1" oninput="updateInvTotals()" style="width:100%;padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none"></div>'+
    '<div>'+(idx===0?'<label style="font-size:12px;font-weight:600;color:#9ca3af">سعر الوحدة (ج.م)</label>':'')+
    '<input type="number" id="item-price-'+idx+'" value="0" min="0" step="0.5" oninput="updateInvTotals()" style="width:100%;padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none"></div>'+
    '<button onclick="removeInvItem(this)" style="padding:8px;background:#fee2e2;color:#ef4444;border:none;border-radius:8px;cursor:pointer;'+(idx===0?'margin-top:18px':'')+'">\xD7</button>';
  container.appendChild(div);
}

function fillItemFromProduct(sel, idx) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt.value) return;
  const p = sysProductsCache.find(x => String(x.id) === opt.value);
  if (!p) return;
  document.getElementById('item-desc-'+idx).value = p.name;
  document.getElementById('item-price-'+idx).value = p.sell_price;
  sel.dataset.productId = p.id;
  updateInvTotals();
}

function removeInvItem(btn) { btn.closest('.inv-item-row').remove(); updateInvTotals(); }

function updateInvTotals() {
  let subtotal = 0;
  document.querySelectorAll('.inv-item-row').forEach((row, idx) => {
    const qty = +document.getElementById('item-qty-'+idx)?.value || 0;
    const price = +document.getElementById('item-price-'+idx)?.value || 0;
    subtotal += qty * price;
  });
  const discount = +document.getElementById('inv-discount')?.value || 0;
  const tax = +document.getElementById('inv-tax')?.value || 0;
  const total = subtotal - discount + tax;
  const sd = document.getElementById('inv-subtotal-disp');
  const td = document.getElementById('inv-total-disp');
  if(sd) sd.textContent = fmt(subtotal) + ' ج.م';
  if(td) td.textContent = fmt(total) + ' ج.م';
}

async function saveInvoice(status) {
  const items = [];
  let valid = true;
  document.querySelectorAll('.inv-item-row').forEach((row, idx) => {
    const desc = document.getElementById('item-desc-'+idx)?.value.trim();
    const qty = +document.getElementById('item-qty-'+idx)?.value || 0;
    const price = +document.getElementById('item-price-'+idx)?.value || 0;
    const sel = row.querySelector('select');
    const pid = sel?.dataset.productId ? +sel.dataset.productId : null;
    if (!desc) { valid = false; return; }
    items.push({ description: desc, qty, unit_price: price, product_id: pid });
  });
  if (!valid || !items.length) { alert('أدخل وصف لكل بند'); return; }
  const name = document.getElementById('inv-name').value.trim();
  if (!name) { alert('اسم العميل مطلوب'); return; }
  const walletVal = document.getElementById('inv-wallet')?.value;
  const payMethod = document.getElementById('inv-payment-method')?.value || null;
  // If wallet chosen AND status = sent → auto-mark as paid
  const finalStatus = (walletVal && status === 'sent') ? 'paid' : status;
  const body = {
    contact_id: +document.getElementById('inv-contact').value || null,
    client_name: name,
    client_phone: document.getElementById('inv-phone').value.trim() || null,
    client_email: document.getElementById('inv-email').value.trim() || null,
    client_address: document.getElementById('inv-address').value.trim() || null,
    discount: +document.getElementById('inv-discount').value || 0,
    tax: +document.getElementById('inv-tax').value || 0,
    notes: document.getElementById('inv-notes').value.trim() || null,
    due_date: document.getElementById('inv-due').value || null,
    wallet_id: walletVal ? +walletVal : null,
    payment_method: payMethod,
    status: finalStatus, items
  };
  const d = await sysPost('/invoices', body);
  if (d.ok) {
    closeModal('invoiceModal');
    await Promise.all([loadInvoiceStats(), loadInvoices()]);
    if (walletVal) await loadWalletSummary();
    window.open('/api/system/invoices/' + d.id + '/pdf?_t=' + getToken(), '_blank');
  } else alert('خطأ: ' + d.error);
}

async function convertToOrder(inv_id) {
  if (!confirm('تحويل الفاتورة لطلب شحن؟')) return;
  const d = await sysPost('/orders/from-invoice/' + inv_id, {});
  if (d.ok) {
    await Promise.all([loadInvoiceStats(), loadInvoices()]);
    if (confirm('تم إنشاء الطلب ' + d.data.order_no + ' ✅\nالانتقال لصفحة الطلبات؟')) {
      showPage('orders', document.querySelector('[onclick*="orders"]'));
    }
  } else alert('خطأ: ' + (d.error || 'فشل التحويل'));
}

async function markPaid(id) {
  // Fetch invoice details first
  const invD = await sysGet('/invoices/' + id);
  if (!invD.ok) return;
  const inv = invD.data;

  // Open payment modal instead of direct mark-paid
  await openMarkPaidModal(id, inv);
}

async function openMarkPaidModal(invId, inv) {
  // Load wallets
  const dw = await sysGet('/wallets');
  const wallets = (dw.data||[]).filter(w => ['cash','ewallet','bank'].includes(w.type));

  // Build modal dynamically
  let modal = document.getElementById('markPaidModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'markPaidModal';
    modal.className = 'overlay hidden';
    modal.onclick = (e) => { if(e.target===modal) modal.classList.add('hidden'); };
    document.body.appendChild(modal);
  }

  const pending = inv.total;
  const walletOpts = wallets.map(w => '<option value="'+w.id+'">'+esc(w.name)+'</option>').join('');

  modal.innerHTML = '<div class="modal" style="max-width:420px">' +
    '<div class="modal-title">✅ تسجيل دفعة<button onclick="document.getElementById(\'markPaidModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>' +
    '<div class="modal-body">' +
    '<div style="background:#f0fdf4;border-radius:10px;padding:12px;margin-bottom:14px">' +
    '<div style="font-weight:700;color:var(--brand,#1B5E30);font-size:14px">'+esc(inv.invoice_no)+'</div>' +
    '<div style="font-size:12px;color:#6b7280">'+esc(inv.client_name)+' — إجمالي: '+fmt(inv.total)+' ج.م</div>' +
    '</div>' +
    '<div style="margin-bottom:10px">' +
    '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">💰 المبلغ المدفوع</label>' +
    '<input type="number" id="mpaid-amount" value="'+pending+'" style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:15px;font-weight:700">' +
    '<div style="font-size:11px;color:#6b7280;margin-top:4px">يمكنك تسجيل دفعة جزئية أقل من الإجمالي</div>' +
    '</div>' +
    '<div style="margin-bottom:10px">' +
    '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">🏦 الخزينة</label>' +
    '<select id="mpaid-wallet" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px">'+walletOpts+'</select>' +
    '</div>' +
    '<div style="margin-bottom:14px">' +
    '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">💳 طريقة الدفع</label>' +
    '<select id="mpaid-method" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px">' +
    '<option value="cash">💵 نقدي</option><option value="transfer">🏦 تحويل بنكي</option><option value="instapay">📱 إنستا باي</option><option value="vodafone_cash">📲 فودافون كاش</option>' +
    '</select>' +
    '</div>' +
    '<button onclick="submitMarkPaid('+invId+','+pending+')" class="btn btn-primary" style="width:100%">✅ تأكيد الدفع</button>' +
    '<div id="mpaid-result" style="margin-top:10px"></div>' +
    '</div></div>';
  modal.classList.remove('hidden');
}

async function submitMarkPaid(invId, originalTotal) {
  const amount = parseFloat(document.getElementById('mpaid-amount').value);
  const wallet_id = document.getElementById('mpaid-wallet').value;
  const payment_method = document.getElementById('mpaid-method').value;
  if (!amount || amount <= 0) { showToast('أدخل مبلغ'); return; }
  if (!wallet_id) { showToast('اختار خزينة'); return; }

  const isPartial = amount < originalTotal;
  const newStatus = isPartial ? 'sent' : 'paid';  // partial → keep as sent

  const d = await fetch(API_INV + '/invoices/' + invId + '/status', {
    method:'PUT', headers:hdr(), credentials:'include',
    body: JSON.stringify({ status: newStatus, wallet_id, payment_method, paid_amount: amount })
  }).then(r=>r.json());

  if (d.ok) {
    document.getElementById('markPaidModal').classList.add('hidden');
    showToast(isPartial ? '✅ تم تسجيل دفعة جزئية: '+fmt(amount)+' ج.م' : '✅ تم تسجيل الدفع كاملاً');
    await Promise.all([loadInvoiceStats(), loadInvoices()]);
    await loadWalletSummary();
  } else {
    showToast('❌ ' + (d.error||'خطأ'));
  }
}

async function deleteInvoice(id) {
  if (!confirm('حذف هذه المسودة؟')) return;
  await sysDel('/invoices/' + id);
  await Promise.all([loadInvoiceStats(), loadInvoices()]);
}

// ── إرسال رابط الدفع من الفاتورة ─────────────────────────────────────────────
async function sendInvToPayment(invId, invNo, total, clientName, clientPhone) {
  if (!confirm(`إنشاء رابط دفع بقيمة ${total} ج.م لـ ${clientName}؟`)) return;

  try {
    const d = await sysPost('/payment-links', {
      invoice_id:   invId,
      amount:       total,
      client_name:  clientName  || '',
      client_phone: clientPhone || '',
      description:  'فاتورة رقم ' + invNo,
    });
    if (!d.ok) throw new Error(d.error || 'فشل إنشاء الرابط');

    const link = d.link;
    const msg  = `مرحباً يا ${clientName}😊\nتفضل سدد فاتورة رقم ${invNo} بقيمة ${total} ج.م عبر الرابط:\n${link}`;

    // فتح واتساب إذا عنده تليفون
    if (clientPhone) {
      const phone = String(clientPhone).replace(/^0/, '').replace(/\D/g, '');
      window.open('https://wa.me/2' + phone + '?text=' + encodeURIComponent(msg), '_blank');
    } else {
      // نسخ الرابط للـ clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link).catch(() => {});
      }
      alert('رابط الدفع:\n' + link + '\n\n(تم نسخه للـ Clipboard)');
    }

    showToast('✅ تم إنشاء رابط الدفع');
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
}

// ── CONTRACTS ──
let selectedTemplate = null;
const TEMPLATE_FIELDS = {
  'printing-services': [
    { id:'print_type', label:'نوع الطباعة', placeholder:'حراري / سكرين / DTF' },
    { id:'quantity', label:'الكمية (قطعة)', placeholder:'50' },
    { id:'delivery_days', label:'مدة التسليم (أيام)', placeholder:'7' },
    { id:'total_price', label:'القيمة الإجمالية (ج.م)', placeholder:'2500' }
  ],
  'brand-partnership': [
    { id:'duration', label:'مدة الشراكة (شهور)', placeholder:'12' },
    { id:'monthly_qty', label:'الحجم الشهري (قطعة)', placeholder:'200' },
    { id:'discount_pct', label:'نسبة الخصم (%)', placeholder:'10' },
    { id:'delivery_days', label:'مدة التسليم (أيام)', placeholder:'5' }
  ],
  'freelance-designer': [
    { id:'revisions', label:'عدد التعديلات المجانية', placeholder:'3' },
    { id:'duration_days', label:'مدة المشروع (يوم)', placeholder:'14' },
    { id:'total_price', label:'إجمالي المشروع (ج.م)', placeholder:'800' }
  ]
};

async function loadContractTemplates() {
  const d = await sysGet('/contracts/templates');
  if (!d.ok) return;
  const dc = await fetch(API_CRM + '/contacts?limit=200', { headers: hdr(), credentials:'include' }).then(r => r.json());
  crmContactsCache = dc.ok ? dc.data : [];
  const sel = document.getElementById('con-contact');
  sel.innerHTML = '<option value="">— أدخل يدويًا —</option>' +
    crmContactsCache.map(c => '<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');

  const container = document.getElementById('contractTemplates');
  container.innerHTML = d.templates.map(t => `
    <div class="card" style="cursor:pointer;border:2px solid transparent;transition:.2s" onclick="selectTemplate('${t.id}','${esc(t.name)}')" onmouseover="this.style.borderColor='var(--brand,#1B5E30)'" onmouseout="this.style.borderColor='transparent'">
      <div style="font-size:28px;margin-bottom:10px">${t.id==='printing-services'?'\u{1F5A8}\uFE0F':t.id==='brand-partnership'?'\u{1F91D}':'\u{1F3A8}'}</div>
      <div style="font-size:16px;font-weight:700;color:var(--brand,#1B5E30);margin-bottom:6px">${esc(t.name)}</div>
      <div style="font-size:13px;color:#6b7280">${esc(t.desc)}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:14px;width:100%">تحديد →</button>
    </div>
  `).join('');
}

function selectTemplate(id, name) {
  selectedTemplate = id;
  document.getElementById('selectedTmplName').textContent = name;
  document.getElementById('contractTemplates').classList.add('hidden');
  document.getElementById('contractForm').classList.remove('hidden');
  // حقول خاصة
  const fields = TEMPLATE_FIELDS[id] || [];
  const box = document.getElementById('conExtraFields');
  box.innerHTML = '<div class="card-label" style="margin-bottom:12px">📝 تفاصيل العقد</div>' +
    fields.map(f => '<div class="form-group"><label>'+esc(f.label)+'</label>' +
      '<input type="text" id="con-field-'+f.id+'" placeholder="'+esc(f.placeholder)+'"></div>').join('');
}

function backToTemplates() {
  selectedTemplate = null;
  document.getElementById('contractTemplates').classList.remove('hidden');
  document.getElementById('contractForm').classList.add('hidden');
}

function fillConClientFromCRM() {
  const val = document.getElementById('con-contact').value;
  if (!val) return;
  const c = crmContactsCache.find(x => String(x.id) === val);
  if (!c) return;
  document.getElementById('con-name').value = c.name || '';
  document.getElementById('con-phone').value = c.whatsapp || '';
  document.getElementById('con-email').value = c.email || '';
  document.getElementById('con-brand').value = c.company || '';
}

async function generateContractPDF() {
  const name = document.getElementById('con-name').value.trim();
  if (!name) { alert('اسم العميل مطلوب'); return; }
  const contract = {};
  const fields = TEMPLATE_FIELDS[selectedTemplate] || [];
  fields.forEach(f => {
    const val = document.getElementById('con-field-'+f.id)?.value.trim();
    if (val) contract[f.id] = val;
  });
  const body = {
    template_id: selectedTemplate,
    client: {
      name,
      brand: document.getElementById('con-brand').value.trim() || name,
      phone: document.getElementById('con-phone').value.trim() || null,
      email: document.getElementById('con-email').value.trim() || null
    },
    contract
  };
  // افتح الـ PDF في تاب جديد
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/system/contracts/generate';
  form.target = '_blank';
  const inp = document.createElement('input');
  inp.type = 'hidden'; inp.name = '_json';
  inp.value = JSON.stringify(body);
  form.appendChild(inp);
  // لازم نبعت request برأسنا بدل form
  const r = await fetch('/api/system/contracts/generate', {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify(body),
    credentials: 'include'
  });
  if (r.ok) {
    const html = await r.text();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } else alert('خطأ في توليد العقد');
}


