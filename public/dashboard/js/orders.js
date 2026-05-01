// ── FOLLOW-UP ENGINE ──
let fupCurrentTab = 'scan';
let fupRulesCache = [];
let fupScanData = [];

function switchFupTab(tab) {
  fupCurrentTab = tab;
  ['scan','rules','logs'].forEach(t => {
    document.getElementById('fupTab'+t.charAt(0).toUpperCase()+t.slice(1)+'Content').classList.toggle('hidden', t !== tab);
    document.getElementById('fupTab'+t.charAt(0).toUpperCase()+t.slice(1)).className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'rules') loadFollowupRules();
  if (tab === 'logs') loadFollowupLogs();
}

async function loadFollowupStats() {
  const d = await sysGet('/followup/rules');
  if (!d.ok) return;
  fupRulesCache = d.data;
  document.getElementById('fup-active-rules').textContent = d.data.filter(r => r.active).length;
  // count sent
  const logs = await sysGet('/followup/logs?limit=500');
  if (logs.ok) {
    const sent = logs.stats?.find(s => s.status==='sent')?.n || 0;
    document.getElementById('fup-sent-count').textContent = sent;
  }
}

async function runFollowupScan() {
  const btn = document.querySelector('#page-followup .btn-primary:last-of-type');
  if (btn) { btn.textContent = '⏳ جارٍ الفحص...'; btn.disabled = true; }
  const d = await sysGet('/followup/scan');
  if (btn) { btn.textContent = '🔄 فحص الآن'; btn.disabled = false; }
  if (!d.ok) return;
  fupScanData = d.data;
  document.getElementById('fup-pending-count').textContent = d.count;

  const container = document.getElementById('fupScanResults');
  if (!d.data.length) {
    container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:16px;font-weight:700">كل عملاؤك تم التواصل معهم</div><div style="font-size:13px;margin-top:4px">لا يوجد أحد يحتاج متابعة حالياً</div></div>';
    return;
  }

  const triggerLabel = { no_order_days:'غائب منذ فترة', delivered_days:'تسليم حديث', shipped_days:'شحن معلّق' };
  container.innerHTML = '<table><thead><tr><th>القاعدة</th><th>العميل</th><th>الواتساب</th><th>الرسالة</th><th>إجراء</th></tr></thead>' +
    '<tbody>' + d.data.map((item, i) =>
      '<tr>' +
      '<td><span class="badge badge-prospect">'+(triggerLabel[item.trigger]||item.trigger)+'</span><br><small style="color:#9ca3af">'+esc(item.rule_name)+'</small></td>' +
      '<td><strong>'+esc(item.contact_name||'—')+'</strong>'+(item.order_no?'<br><small style="color:#9ca3af">'+esc(item.order_no)+'</small>':'')+'</td>' +
      '<td>'+(item.wa_phone?'<span style="color:#25D366;font-weight:700">'+esc(item.wa_phone)+'</span>':'<span style="color:#ef4444">لا يوجد</span>')+'</td>' +
      '<td style="max-width:200px;font-size:12px;color:#374151;white-space:pre-wrap">'+esc(item.message.substring(0,80))+'...</td>' +
      '<td><div style="display:flex;flex-direction:column;gap:4px">' +
      (item.wa_phone ?
        '<a href="https://wa.me/2'+item.wa_phone.replace(/^0/,'')+'?text='+encodeURIComponent(item.message)+'" target="_blank" onclick="markSent('+i+')" class="btn btn-sm" style="background:#25D366;color:#fff;text-decoration:none;text-align:center">📱 إرسال</a>' :
        '<span style="color:#9ca3af;font-size:12px">لا يوجد رقم</span>') +
      '<button class="btn btn-sm btn-outline" onclick="markSentManual('+i+')" style="font-size:11px">تم الإرسال</button>' +
      '</div></td>' +
      '</tr>'
    ).join('') + '</tbody></table>';
}

async function markSent(i) {
  const item = fupScanData[i];
  if (!item) return;
  await sysPost('/followup/mark-sent', {
    rule_id: item.rule_id, contact_id: item.contact_id||null,
    order_id: item.order_id||null, wa_phone: item.wa_phone,
    message: item.message, status: 'sent'
  });
  await loadFollowupStats();
}

async function markSentManual(i) {
  const item = fupScanData[i];
  if (!item) return;
  await sysPost('/followup/mark-sent', {
    rule_id: item.rule_id, contact_id: item.contact_id||null,
    order_id: item.order_id||null, wa_phone: item.wa_phone,
    message: item.message, status: 'sent'
  });
  fupScanData.splice(i, 1);
  document.getElementById('fup-pending-count').textContent = fupScanData.length;
  await runFollowupScan();
}

async function loadFollowupRules() {
  const d = await sysGet('/followup/rules');
  if (!d.ok) return;
  fupRulesCache = d.data;
  const container = document.getElementById('fupRulesList');
  const triggerLabel = { no_order_days:'عميل غائب منذ X يوم', delivered_days:'بعد التسليم بـ X أيام', shipped_days:'شحن بدون تحديث X أيام' };
  container.innerHTML = d.data.map(rule =>
    '<div style="background:#fff;border-radius:12px;padding:16px;border:1.5px solid '+(rule.active?'#bbf7d0':'#e5e7eb')+';display:flex;align-items:flex-start;gap:12px">' +
    '<div style="flex:1">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
    '<strong>'+esc(rule.name)+'</strong>' +
    '<span class="badge '+(rule.active?'badge-client':'badge-cold')+'">'+( rule.active?'نشط':'متوقف')+'</span>' +
    '</div>' +
    '<div style="font-size:13px;color:#6b7280;margin-bottom:8px">'+(triggerLabel[rule.trigger]||rule.trigger)+' | '+rule.days+' أيام</div>' +
    '<div style="font-size:12px;background:#f9fafb;border-radius:8px;padding:8px;color:#374151;white-space:pre-wrap">'+esc(rule.template)+'</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px">' +
    '<button class="btn btn-sm btn-outline" onclick="openEditRule('+rule.id+')">✏️</button>' +
    '<button class="btn btn-sm" style="background:'+(rule.active?'#fef9c3':'#dcfce7')+';color:'+(rule.active?'#854d0e':'#166534')+';border:none" onclick="toggleRule('+rule.id+','+(rule.active?0:1)+')">'+(rule.active?'إيقاف':'تفعيل')+'</button>' +
    '<button class="btn btn-sm" style="background:#fee2e2;color:#ef4444;border:none" onclick="deleteRule('+rule.id+')">🗑️</button>' +
    '</div>' +
    '</div>'
  ).join('') || '<div style="text-align:center;padding:40px;color:#9ca3af">لا توجد قواعد — أضف أول قاعدة</div>';
}

function openAddRule() {
  document.getElementById('ruleModalTitle').textContent = 'قاعدة متابعة جديدة';
  document.getElementById('editRuleId').value = '';
  document.getElementById('rule-name').value = '';
  document.getElementById('rule-trigger').value = 'delivered_days';
  document.getElementById('rule-days').value = '3';
  document.getElementById('rule-template').value = '';
  document.getElementById('ruleModal').classList.remove('hidden');
}

function openEditRule(id) {
  const rule = fupRulesCache.find(r => r.id === id);
  if (!rule) return;
  document.getElementById('ruleModalTitle').textContent = 'تعديل: ' + rule.name;
  document.getElementById('editRuleId').value = rule.id;
  document.getElementById('rule-name').value = rule.name;
  document.getElementById('rule-trigger').value = rule.trigger;
  document.getElementById('rule-days').value = rule.days;
  document.getElementById('rule-template').value = rule.template;
  document.getElementById('ruleModal').classList.remove('hidden');
}

async function saveRule() {
  const id = document.getElementById('editRuleId').value;
  const body = {
    name: document.getElementById('rule-name').value.trim(),
    trigger: document.getElementById('rule-trigger').value,
    days: +document.getElementById('rule-days').value || 3,
    template: document.getElementById('rule-template').value.trim()
  };
  if (!body.name || !body.template) { alert('اسم ونص الرسالة مطلوبان'); return; }
  const d = id ? await sysPut('/followup/rules/'+id, body) : await sysPost('/followup/rules', body);
  if (d.ok) { closeModal('ruleModal'); await Promise.all([loadFollowupStats(), loadFollowupRules()]); }
  else alert('خطأ: ' + d.error);
}

async function toggleRule(id, active) {
  await sysPut('/followup/rules/'+id, { active });
  await Promise.all([loadFollowupStats(), loadFollowupRules()]);
}

async function deleteRule(id) {
  if (!confirm('حذف هذه القاعدة؟')) return;
  await fetch(API_INV+'/followup/rules/'+id, { method:'DELETE', headers:hdr(), credentials:'include' });
  await Promise.all([loadFollowupStats(), loadFollowupRules()]);
}

async function loadFollowupLogs() {
  const d = await sysGet('/followup/logs?limit=100');
  if (!d.ok) return;
  const tbody = document.getElementById('fupLogsTbody');
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">لا توجد سجلات</td></tr>'; return; }
  tbody.innerHTML = d.data.map(l =>
    '<tr>' +
    '<td style="font-size:12px;color:#9ca3af">'+formatDate(l.created_at)+'</td>' +
    '<td>'+esc(l.rule_name||'—')+'</td>' +
    '<td>'+esc(l.contact_id ? ('ID '+l.contact_id) : '—')+'</td>' +
    '<td style="color:#25D366;font-size:13px">'+esc(l.wa_phone||'—')+'</td>' +
    '<td><span class="badge '+(l.status==='sent'?'badge-client':'badge-cold')+'">'+l.status+'</span></td>' +
    '</tr>'
  ).join('');
}


// ── ORDERS ──
let ordSearchTimer = null;
let currentOrder = null;
let invoicesCache = [];
const ORD_STATUS_LABELS = { new:'جديد', preparing:'قيد التجهيز', shipped:'مع المندوب', delivered:'تم التسليم', cancelled:'ملغي', returned:'مرتجع' };
const ORD_STATUS_CLS = { new:'badge-prospect', preparing:'badge-cold', shipped:'badge-vip', delivered:'badge-client', cancelled:'badge-out', returned:'badge-cold' };

async function loadOrderStats() {
  const d = await sysGet('/orders/stats/summary');
  if (!d.ok) return;
  const s = d.data;
  const el = id => document.getElementById(id);
  if(el('ost-new')) el('ost-new').textContent = s.new||0;
  if(el('ost-preparing')) el('ost-preparing').textContent = s.preparing||0;
  if(el('ost-shipped')) el('ost-shipped').textContent = s.shipped||0;
  if(el('ost-delivered')) el('ost-delivered').textContent = s.delivered||0;
  if(el('ost-revenue')) el('ost-revenue').textContent = fmt(s.total_revenue||0);
}

async function loadOrders() {
  const tbody = document.getElementById('ordTbody');
  if (!tbody) return;
  const search = document.getElementById('ordSearch')?.value || '';
  const status = document.getElementById('ordStatusFilter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const d = await sysGet('/orders?' + params);
  if (!d.ok) return;
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">لا توجد طلبات</td></tr>'; return; }
  tbody.innerHTML = d.data.map(o => {
    const phone2 = (o.client_phone||'').replace(/^0/,'');
    return '<tr>' +
    '<td><strong>'+esc(o.order_no)+'</strong>'+(o.invoice_no ? '<br><small style="color:#9ca3af">'+esc(o.invoice_no)+'</small>' : '')+'</td>'+
    '<td>'+esc(o.client_name)+(o.client_phone ? '<br><small style="color:#9ca3af">'+esc(o.client_phone)+'</small>' : '')+'</td>'+
    '<td style="font-weight:700;color:var(--brand,#1B5E30)">'+fmt(o.total)+' ج.م</td>'+
    '<td style="color:#9ca3af;font-size:12px">'+formatDate(o.created_at)+'</td>'+
    '<td><span class="badge '+(ORD_STATUS_CLS[o.status]||'')+'">'+( ORD_STATUS_LABELS[o.status]||o.status)+'</span></td>'+
    '<td><div style="display:flex;gap:6px">'+
    '<button class="btn btn-sm btn-primary" onclick="openOrderDetail('+o.id+')">عرض</button>'+
    (phone2 ? '<a href="https://wa.me/2'+phone2+'" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;text-decoration:none">📱</a>' : '')+

    (o.status === 'delivered' ? '<button class="btn btn-sm" style="background:#fef3c7;color:#92400e;border:none;font-size:11px" onclick="linkToAffiliate('+o.id+',\''+esc(o.order_no)+'\','+o.total+')">🤝 موزع</button>' : '')+    '</div></td>'+
    '</tr>';
  }).join('');
}
async function linkToAffiliate(order_id, order_no, total) {
  const d = await sysGet('/affiliates');
  if (!d.ok || !d.data.length) {
    alert('لا يوجد موزعون — أضف موزعاً أولاً');
    showPage('affiliates', document.querySelector('[onclick*="affiliates"]'));
    return;
  }
  const opts = d.data.map(function(a){ return a.id + ': ' + a.name + ' (' + a.commission_pct + '%)'; }).join('\n');
  const choice = prompt('اختر رقم ID الموزع:\n' + opts);
  if (!choice) return;
  const aff_id = parseInt(choice);
  const aff = d.data.find(function(a){ return a.id === aff_id; });
  if (!aff) { alert('ID غير موجود'); return; }
  const commission = +(total * aff.commission_pct / 100).toFixed(2);
  const r = await sysPost('/affiliates/' + aff_id + '/orders', { order_id: order_id, order_total: total, commission_amount: commission });
  if (r.ok) alert('تم ربط الطلب ' + order_no + ' بـ ' + aff.name + '\nعمولة: ' + commission + ' ج.م ✅');
  else alert('خطأ: ' + (r.error || 'فشل الربط'));
}

function debounceOrders() { clearTimeout(ordSearchTimer); ordSearchTimer = setTimeout(loadOrders, 400); }

async function openNewOrder() {
  // init autocomplete every time modal opens
  setTimeout(() => initClientAutocomplete('ord-name', 'ord-phone'), 100);
  // reset fields
  ['ord-name','ord-phone','ord-notes','ord-address','ord-prod-supplier','ord-prod-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const totalEl = document.getElementById('ord-total'); if (totalEl) totalEl.value = '';
  const dueEl = document.getElementById('ord-prod-due'); if (dueEl) dueEl.value = '';
  const podFields = document.getElementById('ord-pod-fields'); if (podFields) podFields.style.display = 'none';
  document.getElementById('ord-type').value = 'stock';
  // Reset type buttons
  document.querySelectorAll('.ord-type-btn').forEach((b,i) => {
    if (i===0) { b.style.background='var(--brand,#1B5E30)'; b.style.color='#fff'; b.style.borderColor='var(--brand,#1B5E30)'; }
    else { b.style.background='#fff'; b.style.color='#6b7280'; b.style.borderColor='#e5e7eb'; }
  });
  document.getElementById('orderModal').classList.remove('hidden');
}

function fillOrderFromInvoice() {
  const val = document.getElementById('ord-invoice').value;
  if (!val) return;
  const inv = invoicesCache.find(x => String(x.id) === val);
  if (!inv) return;
  document.getElementById('ord-name').value = inv.client_name || '';
  document.getElementById('ord-phone').value = inv.client_phone || '';
  document.getElementById('ord-total').value = inv.total || '';
}

// ============================================================
// CLIENT AUTOCOMPLETE
// ============================================================
let _acTimer = null;
let _acActive = null; // { nameId, phoneId, cityId, contactIdField }

function initClientAutocomplete(nameInputId, phoneInputId, opts={}) {
  const nameEl = document.getElementById(nameInputId);
  const phoneEl = document.getElementById(phoneInputId);
  if (!nameEl || !phoneEl) return;

  // Create dropdown container
  const dropId = 'ac-drop-' + nameInputId;
  let drop = document.getElementById(dropId);
  if (!drop) {
    drop = document.createElement('div');
    drop.id = dropId;
    drop.style.cssText = 'position:absolute;background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:20000;max-height:220px;overflow-y:auto;min-width:280px;display:none';
    nameEl.parentElement.style.position = 'relative';
    nameEl.parentElement.appendChild(drop);
  }

  function showDrop(contacts) {
    if (!contacts.length) { drop.style.display = 'none'; return; }
    drop.style.display = 'block';
    const STATUS_COLORS2 = { lead:'#9ca3af', prospect:'#F5A623', client:'#16a34a', vip:'#7c3aed' };
    drop.innerHTML = contacts.map(c => {
      const sc = STATUS_COLORS2[c.status]||'#9ca3af';
      const cJson = encodeURIComponent(JSON.stringify(c));
      return '<div onclick="pickClientAC(this,\''+dropId+'\',\''+nameInputId+'\',\''+phoneInputId+'\')" data-c="'+cJson+'" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:center" onmouseover="this.style.background=\'#f9fafb\';" onmouseout="this.style.background=\'\';">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:'+sc+'20;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">👤</div>' +
        '<div style="flex:1"><div style="font-weight:700;font-size:13px">'+esc(c.name)+'</div>' +
        '<div style="font-size:11px;color:#9ca3af">'+(c.phone||'')+(c.city?' | '+c.city:'')+'</div></div>' +
        '<span style="font-size:10px;color:'+sc+';font-weight:700">'+( c.status||'')+'</span></div>';
    }).join('');
  }

  async function doSearch(q) {
    if (q.length < 2) { drop.style.display = 'none'; return; }
    const d = await fetch('/api/crm/contacts/search?q='+encodeURIComponent(q), { headers: hdr() }).then(r=>r.json()).catch(()=>({contacts:[]}));
    showDrop(d.contacts || []);
  }

  nameEl.addEventListener('input', () => {
    clearTimeout(_acTimer);
    _acTimer = setTimeout(() => doSearch(nameEl.value.trim()), 250);
  });
  phoneEl.addEventListener('input', () => {
    clearTimeout(_acTimer);
    _acTimer = setTimeout(() => doSearch(phoneEl.value.trim()), 250);
  });
  phoneEl.addEventListener('blur', async () => {
    const phone = phoneEl.value.trim();
    if (phone.length >= 8) {
      const d = await fetch('/api/crm/contacts/by-phone?phone='+encodeURIComponent(phone), { headers: hdr() }).then(r=>r.json()).catch(()=>({}));
      if (d.ok && d.contact) {
        showToast('👤 ' + d.contact.name + ' — عميل موجود');
        selectClientFromData(d.contact, nameInputId, phoneInputId, opts);
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!nameEl.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
  });
}

function pickClientAC(el, dropId, nameInputId, phoneInputId) {
  try {
    const contact = JSON.parse(decodeURIComponent(el.dataset.c));
    selectClientAC(dropId, contact, nameInputId, phoneInputId);
  } catch(e) {}
}

function selectClientAC(dropId, contact, nameInputId, phoneInputId) {
  document.getElementById(dropId).style.display = 'none';
  const nameEl = document.getElementById(nameInputId);
  const phoneEl = document.getElementById(phoneInputId);
  if (nameEl) nameEl.value = contact.name || '';
  if (phoneEl) phoneEl.value = contact.phone || '';

  // بناء العنوان الكامل: عنوان + مدينة + محافظة
  const fullAddress = [contact.address, contact.city, contact.governorate].filter(Boolean).join(', ');

  // فورم الطلب
  const ordAddr = document.getElementById('ord-address'); if (ordAddr && fullAddress) ordAddr.value = fullAddress;
  // فورم الفاتورة
  const invAddr = document.getElementById('inv-address'); if (invAddr && fullAddress) invAddr.value = fullAddress;
  const invEmail = document.getElementById('inv-email'); if (invEmail && contact.email) invEmail.value = contact.email;
  // فورم الشحن (ship-address)
  const shipAddr = document.getElementById('ship-address'); if (shipAddr && fullAddress) shipAddr.value = fullAddress;
  const shipPhone = document.getElementById('ship-phone'); if (shipPhone && contact.phone) shipPhone.value = contact.phone;
  const shipName = document.getElementById('ship-name'); if (shipName && contact.name) shipName.value = contact.name;

  // Store contact_id
  ['inv-contact','ord-contact-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = contact.id; });
  showToast('✅ تم اختيار العميل: ' + contact.name);
}

function selectClientFromData(contact, nameInputId, phoneInputId, opts) {
  const nameEl = document.getElementById(nameInputId);
  const phoneEl = document.getElementById(phoneInputId);
  if (nameEl) nameEl.value = contact.name || '';
  if (phoneEl) phoneEl.value = contact.phone || '';
}

// Init autocomplete on all main forms
function initAllAutocompletes() {
  // Invoices modal
  initClientAutocomplete('inv-name', 'inv-phone');
  // Orders modal
  initClientAutocomplete('ord-name', 'ord-phone');
  // CRM modal
  initClientAutocomplete('c-name', 'c-phone');
}

function selectOrderType(type, btn) {
  document.querySelectorAll('.ord-type-btn').forEach(b => {
    b.style.background = '#fff'; b.style.color = '#6b7280'; b.style.borderColor = '#e5e7eb';
  });
  btn.style.background = 'var(--brand,#1B5E30)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--brand,#1B5E30)';
  document.getElementById('ord-type').value = type;
  const podFields = document.getElementById('ord-pod-fields');
  if (podFields) podFields.style.display = (type === 'pod_own' || type === 'pod_client') ? 'block' : 'none';
}

async function saveOrder() {
  const name = document.getElementById('ord-name').value.trim();
  if (!name) { showToast('اسم العميل مطلوب'); return; }
  const order_type = document.getElementById('ord-type').value || 'stock';
  const isPOD = order_type !== 'stock';
  const d = await sysPost('/orders', {
    client_name: name,
    client_phone: document.getElementById('ord-phone').value.trim() || null,
    client_address: document.getElementById('ord-address')?.value.trim() || null,
    total: +document.getElementById('ord-total').value || 0,
    notes: document.getElementById('ord-notes').value.trim() || null,
    order_type,
    production_supplier: isPOD ? (document.getElementById('ord-prod-supplier')?.value.trim()||null) : null,
    production_due_date: isPOD ? (document.getElementById('ord-prod-due')?.value||null) : null,
    production_notes: isPOD ? (document.getElementById('ord-prod-notes')?.value.trim()||null) : null
  });
  if (d.ok) { closeModal('orderModal'); await Promise.all([loadOrderStats(), loadOrders()]); }
  else showToast('خطأ: ' + (d.error||'?'));
}

async function openOrderDetail(id) {
  const d = await sysGet('/orders/'+id);
  if (!d.ok) return;
  currentOrder = d.data;
  renderOrderDetail(d.data);
  document.getElementById('orderSlide').classList.remove('hidden');
}

function renderOrderDetail(o) {
  // Header
  document.getElementById('osd-no').textContent = o.order_no;
  const badge = document.getElementById('osd-badge');
  badge.textContent = ORD_STATUS_LABELS[o.status]||o.status;
  badge.className = 'badge '+(ORD_STATUS_CLS[o.status]||'');
  document.getElementById('osd-client').textContent = o.client_name;
  document.getElementById('osd-total').textContent = fmt(o.total)+' ج.م';
  // hidden
  document.getElementById('osd-shipping-co').value = o.shipping_co||'';
  document.getElementById('osd-tracking').value = o.tracking_no||'';
  document.getElementById('osd-note').value = '';

  const phone = (o.client_phone||'').replace(/^0/,'');

  // Quick Actions
  const actEl = document.getElementById('osd-actions');
  let actHtml = '';
  if (phone) actHtml += '<a href="https://wa.me/2'+phone+'" target="_blank" style="background:#25D366;color:#fff;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📱 واتساب</a>';
  if (o.contact_id) actHtml += '<button onclick="openClientProfile('+o.contact_id+',\''+esc(o.client_name||'')+'\');" style="background:#eff6ff;border:1.5px solid #bfdbfe;color:#2563eb;padding:7px 12px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">👤 بروفايل العميل</button>';
  document.getElementById('osd-wa-link').href = phone ? 'https://wa.me/2'+phone : '#';
  if (actEl) actEl.innerHTML = actHtml || '';

  // ── Workflow Buttons ──
  const wfEl = document.getElementById('osd-workflow');
  if (wfEl) {
    let wfHtml = '';
    const isPOD = o.order_type === 'pod_own' || o.order_type === 'pod_client';
    const orderTypeBadge = { stock:'📦 من المخزون', pod_own:'🖨️ طباعة — خامتنا', pod_client:'🖨️ طباعة — خامة العميل' }[o.order_type||'stock'] || '📦';
    wfHtml += '<div style="background:#f9fafb;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">'+orderTypeBadge+'</div>';

    // لو ما في فاتورة بعد → زرار حوّل لفاتورة
    if (!o.invoice_id && !['delivered','cancelled','returned'].includes(o.status)) {
      wfHtml += '<button onclick="openOrderToInvoice()" style="width:100%;background:#1B5E30;color:#fff;border:none;padding:10px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">🧾 تحويل لفاتورة</button>';
    } else if (o.invoice_id) {
      wfHtml += '<div style="background:#f0fdf4;border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center">'
        + '<span style="font-size:12px;font-weight:700;color:#16a34a">✅ فاتورة موجودة</span>'
        + '<button onclick="openInvoiceDetail('+o.invoice_id+')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:4px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">🧾 عرض الفاتورة</button>'
        + '</div>';
    }

    // POD → زرار إرسال للإنتاج
    if (isPOD && ['new','confirmed'].includes(o.status)) {
      wfHtml += '<button onclick="sendToProduction()" style="width:100%;background:#F5A623;color:#fff;border:none;padding:10px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">🖨️ إرسال للإنتاج</button>';
    }
    if (isPOD && o.status === 'in_production') {
      wfHtml += '<button onclick="markOrderReady()" style="width:100%;background:#8b5cf6;color:#fff;border:none;padding:10px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">✅ الإنتاج جاهز</button>';
    }

    // زرار الشحن — يظهر في كل الحالات إلا التسليم والإلغاء
    if (!['delivered','cancelled','returned','shipped'].includes(o.status)) {
      const hasShipment = o.tracking_no; // لو عنده بوليصة — بدّل الزرار
      if (hasShipment) {
        wfHtml += '<div style="background:#e0f2fe;border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center">'
          + '<span style="font-size:12px;font-weight:700;color:#0369a1">🚚 شحنة موجودة: '+esc(o.tracking_no||'')+'</span>'
          + '<button onclick="openCreateShipment()" style="background:#0369a1;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">شحنة جديدة</button>'
          + '</div>';
      } else {
        wfHtml += '<button onclick="openCreateShipment()" style="width:100%;background:#0ea5e9;color:#fff;border:none;padding:10px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">🚚 إنشاء شحنة + إرسال واتساب</button>';
      }
    }

    wfEl.innerHTML = wfHtml;
  }

  // ── Status Buttons ──
  const stBtnsEl = document.getElementById('osd-status-btns');
  if (stBtnsEl) {
    const allStatuses = [
      { key:'new', label:'🆕 جديد', bg:'#dbeafe', color:'#1e40af' },
      { key:'confirmed', label:'✔️ مؤكد', bg:'#e0f2fe', color:'#0369a1' },
      { key:'in_production', label:'🖨️ إنتاج', bg:'#fef3c7', color:'#92400e' },
      { key:'ready', label:'📦 جاهز', bg:'#f3e8ff', color:'#7c3aed' },
      { key:'preparing', label:'⚙️ تجهيز', bg:'#fef9c3', color:'#854d0e' },
      { key:'shipped', label:'🚚 شحن', bg:'#fce7f3', color:'#9d174d' },
      { key:'delivered', label:'✅ تسليم', bg:'#dcfce7', color:'#166534' },
      { key:'cancelled', label:'❌ إلغاء', bg:'#fee2e2', color:'#991b1b' },
      { key:'returned', label:'↩️ مرتجع', bg:'#fee2e2', color:'#991b1b' },
    ];
    stBtnsEl.innerHTML = allStatuses.map(s =>
      '<button class="btn btn-sm" style="background:'+s.bg+';color:'+s.color+';border:none;'+(o.status===s.key?'outline:2px solid '+s.color+';':'')+'" onclick="changeStatus(\''+s.key+'\')">'+s.label+'</button>'
    ).join('');
  }

  // ── Shipment Info ──
  const shipSec = document.getElementById('osd-ship-section');
  const shipInfo = document.getElementById('osd-ship-info');
  if (o.tracking_no && shipSec) {
    shipSec.style.display = 'block';
    const trackLink = 'https://pro.areejegypt.com/track/' + o.tracking_no;
    shipInfo.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<div><div style="font-weight:700;font-size:13px;color:var(--brand,#1B5E30)">'+esc(o.tracking_no)+'</div>'
      + '<div style="font-size:11px;color:#6b7280">'+esc(o.shipping_co||'شحن')+'</div></div>'
      + '<div style="display:flex;gap:6px">'
      + '<button onclick="copyText(\''+trackLink+'\')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:5px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">🔗 تتبع</button>'
      + (phone?'<a href="https://wa.me/2'+phone+'?text='+encodeURIComponent('طلبك في الطريق! تتبع: '+trackLink)+'" target="_blank" style="background:#25D366;color:#fff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">📱</a>':'')
      + '</div></div>';
  } else if (shipSec) { shipSec.style.display = 'none'; }

  // ── Production Info ──
  const prodSec = document.getElementById('osd-prod-section');
  const prodInfo = document.getElementById('osd-prod-info');
  if ((o.order_type === 'pod_own' || o.order_type === 'pod_client') && prodSec) {
    prodSec.style.display = 'block';
    let ph = '';
    if (o.production_supplier) ph += '<div style="font-size:12px;margin-bottom:4px">🏭 المطبعة: <strong>'+esc(o.production_supplier)+'</strong></div>';
    if (o.production_due_date) ph += '<div style="font-size:12px;margin-bottom:4px">📅 موعد الجاهزية: <strong>'+esc(o.production_due_date)+'</strong></div>';
    if (o.production_notes) ph += '<div style="font-size:12px;color:#6b7280">'+esc(o.production_notes)+'</div>';
    if (!ph) ph = '<div style="font-size:12px;color:#9ca3af">لا توجد تفاصيل إنتاج بعد</div>';
    if (prodInfo) prodInfo.innerHTML = ph;
  } else if (prodSec) { prodSec.style.display = 'none'; }

  // ── Logs ──
  const logs = o.logs||[];
  document.getElementById('osd-logs').innerHTML = logs.length
    ? logs.map(l =>
        '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px">'
        +'<span style="color:#9ca3af;min-width:80px;flex-shrink:0;font-size:10px">'+formatDate(l.created_at)+'</span>'
        +'<span style="font-weight:600;color:var(--brand,#1B5E30)">'+(ORD_STATUS_LABELS[l.status]||l.status)+'</span>'
        +(l.note ? '<span style="color:#6b7280">— '+esc(l.note)+'</span>' : '')
        +'</div>').join('')
    : '<div style="color:#9ca3af;font-size:12px">لا توجد حركات</div>';
}

// ── Order to Invoice Modal ──
async function openOrderToInvoice() {
  if (!currentOrder) return;
  const o = currentOrder;
  // جيب منتجات المخزون
  const dp = await sysGet('/products');
  const products = dp.ok ? dp.data : [];

  let modal = document.getElementById('orderToInvModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'orderToInvModal';
    modal.className = 'overlay hidden';
    modal.onclick = (e) => { if(e.target===modal) modal.classList.add('hidden'); };
    document.body.appendChild(modal);
  }

  const prodOpts = products.map(p => '<option value="'+p.id+'" data-cost="'+p.cost_price+'" data-sell="'+p.sell_price+'">'+esc(p.name)+' ('+p.stock_qty+' '+esc(p.unit||'قطعة')+') — '+fmt(p.sell_price)+' ج</option>').join('');

  modal.innerHTML = '<div class="modal" style="max-width:500px"><div class="modal-title">🧾 تحويل لفاتورة<button onclick="document.getElementById(\'orderToInvModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
    + '<div class="modal-body">'
    + '<div style="background:#f0fdf4;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px"><strong>'+esc(o.order_no)+'</strong> — '+esc(o.client_name)+'</div>'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:8px">📦 المنتجات</div>'
    + '<div id="otinv-items"></div>'
    + '<button onclick="addOTInvItem(\''+esc(prodOpts)+'\')" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:7px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:12px;width:100%">➕ إضافة منتج</button>'
    + '<div style="margin-bottom:10px">'
    + '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">💳 خزينة الدفع (اختياري — اتركه فارغ إذا كان آجل)</label>'
    + '<select id="otinv-wallet" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px"><option value="">— آجل (ذمم) —</option></select>'
    + '</div>'
    + '<button onclick="submitOrderToInvoice('+o.id+')" class="btn btn-primary" style="width:100%">✅ إنشاء الفاتورة</button>'
    + '<div id="otinv-result" style="margin-top:10px"></div>'
    + '</div></div>';

  modal.classList.remove('hidden');

  // Load wallets
  const dw = await sysGet('/wallets');
  const wSel = document.getElementById('otinv-wallet');
  (dw.data||[]).filter(w=>['cash','ewallet','bank'].includes(w.type)).forEach(w => {
    wSel.innerHTML += '<option value="'+w.id+'">'+esc(w.name)+'</option>';
  });

  // Add first item by default
  addOTInvItem(prodOpts);
}

let otInvItemCount = 0;
function addOTInvItem(prodOpts) {
  const i = otInvItemCount++;
  const el = document.getElementById('otinv-items');
  if (!el) return;
  const div = document.createElement('div');
  div.id = 'otinv-item-'+i;
  div.style.cssText = 'background:#f9fafb;border-radius:8px;padding:10px;margin-bottom:8px';
  div.innerHTML = '<div style="display:flex;gap:6px;margin-bottom:6px">'
    + '<select id="otinv-prod-'+i+'" onchange="otinvFillPrice('+i+')" style="flex:2;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px"><option value="">— اختر منتج أو اكتب —</option>'+prodOpts+'</select>'
    + '<input id="otinv-desc-'+i+'" placeholder="وصف (إذا لم تختر منتج)" style="flex:2;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">'
    + '<button onclick="document.getElementById(\'otinv-item-'+i+'\').remove()" style="background:#fee2e2;border:none;color:#ef4444;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px">✕</button>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<input type="number" id="otinv-qty-'+i+'" placeholder="كمية" value="1" min="1" oninput="otinvCalcTotal('+i+')" style="flex:1;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">'
    + '<input type="number" id="otinv-price-'+i+'" placeholder="سعر الوحدة" oninput="otinvCalcTotal('+i+')" style="flex:1;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">'
    + '<div style="flex:1;padding:6px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;font-weight:700;color:var(--brand,#1B5E30)" id="otinv-total-'+i+'">0 ج</div>'
    + '</div>';
  el.appendChild(div);
}

function otinvFillPrice(i) {
  const sel = document.getElementById('otinv-prod-'+i);
  const opt = sel?.options[sel.selectedIndex];
  if (opt?.dataset.sell) {
    document.getElementById('otinv-price-'+i).value = opt.dataset.sell;
    otinvCalcTotal(i);
  }
}
function otinvCalcTotal(i) {
  const qty = parseFloat(document.getElementById('otinv-qty-'+i)?.value)||0;
  const price = parseFloat(document.getElementById('otinv-price-'+i)?.value)||0;
  const el = document.getElementById('otinv-total-'+i);
  if (el) el.textContent = fmt(qty*price)+' ج';
}

async function submitOrderToInvoice(ordId) {
  // Collect items
  const items = [];
  document.querySelectorAll('[id^=otinv-item-]').forEach(div => {
    const idx = div.id.split('-').pop();
    const prodSel = document.getElementById('otinv-prod-'+idx);
    const prodId = prodSel?.value || null;
    const desc = document.getElementById('otinv-desc-'+idx)?.value.trim() || prodSel?.options[prodSel.selectedIndex]?.textContent?.split('(')[0]?.trim() || 'منتج';
    const qty = parseFloat(document.getElementById('otinv-qty-'+idx)?.value)||1;
    const price = parseFloat(document.getElementById('otinv-price-'+idx)?.value)||0;
    if (qty > 0 && price > 0) items.push({ product_id: prodId||null, description: desc, qty, unit_price: price });
  });
  if (!items.length) { showToast('أضف منتجاً على الأقل'); return; }
  const wallet_id = document.getElementById('otinv-wallet')?.value || null;

  const d = await apiFetch('/api/system/orders/'+ordId+'/to-invoice', {
    method: 'POST',
    body: JSON.stringify({ items, wallet_id })
  });

  if (d.ok) {
    document.getElementById('orderToInvModal').classList.add('hidden');
    showToast('✅ تم إنشاء الفاتورة: '+d.invoice_no);
    await openOrderDetail(ordId);
  } else {
    document.getElementById('otinv-result').innerHTML = '<div style="color:#CC2200;font-size:12px">❌ '+(d.error||'خطأ')+'</div>';
  }
}

async function sendToProduction() {
  if (!currentOrder) return;
  let modal = document.getElementById('prodModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prodModal';
    modal.className = 'overlay hidden';
    modal.onclick = (e) => { if(e.target===modal) modal.classList.add('hidden'); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = '<div class="modal" style="max-width:400px"><div class="modal-title">🖨️ إرسال للإنتاج<button onclick="document.getElementById(\'prodModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
    + '<div class="modal-body">'
    + '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">🏭 اسم المطبعة/المورد</label>'
    + '<input id="prod-supplier" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px"></div>'
    + '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">📅 موعد الجاهزية</label>'
    + '<input type="date" id="prod-due" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px"></div>'
    + '<div style="margin-bottom:14px"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">📝 مواصفات الإنتاج</label>'
    + '<textarea id="prod-notes" rows="3" placeholder="لون، خامة، تصميم، مقاسات..." style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;resize:vertical"></textarea></div>'
    + '<button onclick="submitToProduction('+currentOrder.id+')" class="btn btn-primary" style="width:100%">🖨️ إرسال للإنتاج</button>'
    + '</div></div>';
  modal.classList.remove('hidden');
}

async function submitToProduction(ordId) {
  const d = await apiFetch('/api/system/orders/'+ordId+'/to-production', {
    method: 'POST',
    body: JSON.stringify({
      production_supplier: document.getElementById('prod-supplier').value.trim(),
      production_due_date: document.getElementById('prod-due').value,
      production_notes: document.getElementById('prod-notes').value.trim()
    })
  });
  if (d.ok) {
    document.getElementById('prodModal').classList.add('hidden');
    showToast('✅ تم الإرسال للإنتاج');
    await openOrderDetail(ordId);
  } else showToast('❌ '+(d.error||'خطأ'));
}

async function markOrderReady() {
  if (!currentOrder) return;
  const d = await apiFetch('/api/system/orders/'+currentOrder.id+'/ready', { method: 'POST' });
  if (d.ok) { showToast('✅ الإنتاج جاهز'); await openOrderDetail(currentOrder.id); }
  else showToast('❌ '+(d.error||'خطأ'));
}



async function changeStatus(status) {
  if (!currentOrder) return;
  const note = document.getElementById('osd-note').value.trim();
  const shipping_co = document.getElementById('osd-shipping-co').value.trim();
  const tracking_no = document.getElementById('osd-tracking').value.trim();
  const body = { status };
  if (note) body.note = note;
  if (shipping_co) body.shipping_co = shipping_co;
  if (tracking_no) body.tracking_no = tracking_no;
  const d = await fetch(API_INV+'/orders/'+currentOrder.id+'/status', {
    method:'PUT', headers:hdr(), body:JSON.stringify(body), credentials:'include'
  }).then(r => r.json());
  if (d.ok) { await Promise.all([loadOrderStats(), loadOrders()]); await openOrderDetail(currentOrder.id); }
  else alert('خطأ: ' + d.error);
}


// ── SUPPLIERS ──
let supSearchTimer = null;
let suppliersCache = [];
let currentSupTab = 'suppliers';

function switchSupTab(tab) {
  currentSupTab = tab;
  const isSup = tab === 'suppliers';
  document.getElementById('supTabSupContent').classList.toggle('hidden', !isSup);
  document.getElementById('supTabPOContent').classList.toggle('hidden', isSup);
  document.getElementById('supTabSup').className = isSup ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  document.getElementById('supTabPO').className = isSup ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm';
  if (isSup) loadSuppliers(); else loadPOs();
}

async function loadSupplierStats() {
  const d = await sysGet('/suppliers/stats/summary');
  if (!d.ok) return;
  const s = d.data;
  const el = id => document.getElementById(id);
  if (el('sup-total')) el('sup-total').textContent = s.total_suppliers;
  if (el('sup-spent')) el('sup-spent').textContent = fmt(s.total_spent) + ' ج.م';
  if (el('sup-pending')) el('sup-pending').textContent = s.pending_po;
  if (el('sup-po-total')) el('sup-po-total').textContent = s.total_po;
}

async function loadSuppliers() {
  const tbody = document.getElementById('supTbody');
  if (!tbody) return;
  const search = document.getElementById('supSearch')?.value || '';
  const cat = document.getElementById('supCatFilter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (cat) params.set('category', cat);
  const d = await sysGet('/suppliers?' + params);
  if (!d.ok) return;
  suppliersCache = d.data;
  // update category filter
  const catSel = document.getElementById('supCatFilter');
  if (catSel && d.categories) {
    const prev = catSel.value;
    catSel.innerHTML = '<option value="">كل الفئات</option>' +
      d.categories.map(c => '<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
    catSel.value = prev;
  }
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">لا يوجد موردين — <button class="btn btn-sm btn-primary" onclick="openAddSupplier()">إضافة أول مورد</button></td></tr>'; return; }
  const stars = n => '⭐'.repeat(n) + '☆'.repeat(5-n);
  tbody.innerHTML = d.data.map(s =>
    '<tr>' +
    '<td><strong>'+esc(s.name)+'</strong>'+(s.whatsapp?'<br><a href="https://wa.me/2'+s.whatsapp+'" target="_blank" style="font-size:12px;color:#25D366">📱 واتساب</a>':'')+'</td>' +
    '<td>'+esc(s.category||'—')+'</td>' +
    '<td style="font-size:16px">'+stars(s.rating||3)+'</td>' +
    '<td style="font-weight:700;color:var(--brand,#1B5E30)">'+fmt(s.total_purchased)+' ج.م</td>' +
    '<td>'+s.po_count+' أمر</td>' +
    '<td><div style="display:flex;gap:6px">'+
    '<button class="btn btn-sm btn-outline" onclick="openEditSupplier('+s.id+')">✏️</button>'+
    '<button class="btn btn-sm btn-primary" onclick="openNewPOForSup('+s.id+')">+ أمر شراء</button>'+
    '</div></td>' +
    '</tr>'
  ).join('');
}

function debounceSuppliers() {
  clearTimeout(supSearchTimer);
  supSearchTimer = setTimeout(loadSuppliers, 400);
}

let supRating = 3;
function setRating(v) {
  supRating = v;
  document.getElementById('sup-rating').value = v;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.style.opacity = +b.dataset.v <= v ? '1' : '0.3';
    b.style.transform = +b.dataset.v <= v ? 'scale(1.2)' : 'scale(1)';
  });
}

function toggleSupAsClient(cb) {
  document.getElementById('sup-as-client-info').style.display = cb.checked ? 'block' : 'none';
}

function initSupplierCountry(countryCode, govVal) {
  const ctry = document.getElementById('sup-country');
  if (ctry) {
    ctry.innerHTML = buildCountryOptions(countryCode||'EG');
    document.getElementById('sup-governorate').innerHTML = buildGovernorateOptions(countryCode||'EG', govVal||'');
    document.getElementById('sup-phone-code').textContent = getCountry(countryCode||'EG').phone_code;
  }
}

function openAddSupplier() {
  document.getElementById('supModalTitle').textContent = 'إضافة مورد';
  document.getElementById('editSupId').value = '';
  document.getElementById('sup-person-id').value = '';
  ['sup-name','sup-cat','sup-wa','sup-phone','sup-email','sup-city','sup-address','sup-notes'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const cb = document.getElementById('sup-is-also-client');
  if (cb) { cb.checked = false; document.getElementById('sup-as-client-info').style.display='none'; }
  setRating(3);
  initSupplierCountry('EG', '');
  setTimeout(() => initClientAutocomplete('sup-name', 'sup-phone'), 100);
  document.getElementById('supplierModal').classList.remove('hidden');
}

function openEditSupplier(id) {
  const s = suppliersCache.find(x => x.id === id);
  if (!s) return;
  document.getElementById('supModalTitle').textContent = 'تعديل: ' + s.name;
  document.getElementById('editSupId').value = s.id;
  document.getElementById('sup-person-id').value = s.person_id || '';
  document.getElementById('sup-name').value = s.name || '';
  document.getElementById('sup-cat').value = s.category || '';
  document.getElementById('sup-wa').value = s.products || s.whatsapp || '';
  document.getElementById('sup-phone').value = s.phone || '';
  document.getElementById('sup-email').value = s.email || '';
  document.getElementById('sup-city').value = s.city || '';
  const addrEl = document.getElementById('sup-address'); if(addrEl) addrEl.value = s.address||'';
  document.getElementById('sup-notes').value = s.notes || '';
  setRating(s.rating || 3);
  initSupplierCountry(s.country||'EG', s.governorate||'');
  // check if also client
  const cb = document.getElementById('sup-is-also-client');
  if (cb) { cb.checked = !!s.person_id; document.getElementById('sup-as-client-info').style.display = s.person_id?'block':'none'; }
  document.getElementById('supplierModal').classList.remove('hidden');
}

async function saveSupplier() {
  const id = document.getElementById('editSupId').value;
  const body = {
    company_name: document.getElementById('sup-name').value.trim(),
    name: document.getElementById('sup-name').value.trim(),
    category: document.getElementById('sup-cat').value.trim() || null,
    products: document.getElementById('sup-wa').value.trim() || null,
    phone: document.getElementById('sup-phone').value.trim() || null,
    email: document.getElementById('sup-email').value.trim() || null,
    city: document.getElementById('sup-city').value.trim() || null,
    address: document.getElementById('sup-address')?.value.trim() || null,
    governorate: document.getElementById('sup-governorate')?.value || null,
    country: document.getElementById('sup-country')?.value || 'EG',
    phone_code: document.getElementById('sup-phone-code')?.textContent || '+20',
    notes: document.getElementById('sup-notes').value.trim() || null,
    rating: supRating
  };
  if (!body.name) { showToast('اسم المورد مطلوب'); return; }
  const d = id ? await sysPut('/suppliers/'+id, body) : await sysPost('/suppliers', body);
  if (!d.ok) { showToast('❌ ' + (d.error||'خطأ')); return; }

  // لو عميل ومورد — سجّل في persons
  const isAlsoClient = document.getElementById('sup-is-also-client')?.checked;
  if (isAlsoClient) {
    const country = document.getElementById('sup-country')?.value || 'EG';
    const phoneCode = document.getElementById('sup-phone-code')?.textContent || '+20';
    const pRes = await apiFetch('/api/persons', {
      method: 'POST',
      body: JSON.stringify({
        name: body.name, phone: body.phone, phone_code: phoneCode,
        email: body.email, country, governorate: document.getElementById('sup-governorate')?.value||'',
        city: body.city, address: document.getElementById('sup-address')?.value||'',
        roles: 'both', status: 'client',
        supplier_products: body.products, supplier_category: body.category,
        source: 'manual'
      })
    });
    if (pRes.ok) {
      // احفظ person_id في المورد
      const supId = d.id || id;
      if (supId) await sysPost('/suppliers/'+supId+'/link-person', { person_id: pRes.id });
      showToast('✅ تم تسجيله كعميل ومورد');
    } else if (pRes.existing_id) {
      const supId = d.id || id;
      if (supId) await sysPost('/suppliers/'+supId+'/link-person', { person_id: pRes.existing_id });
      showToast('✅ تم ربطه بالعميل الموجود');
    }
  }

  closeModal('supplierModal');
  await Promise.all([loadSupplierStats(), loadSuppliers()]);
}

// ── PURCHASE ORDERS ──
async function loadPOs() {
  const tbody = document.getElementById('poTbody');
  if (!tbody) return;
  const status = document.getElementById('poStatusFilter')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const d = await sysGet('/purchase-orders?' + params);
  if (!d.ok) return;
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">لا توجد أوامر</td></tr>'; return; }
  const stLabel = { pending:'معلقة', received:'مستلمة', cancelled:'ملغاة' };
  const stCls = { pending:'badge-low', received:'badge-ok', cancelled:'badge-out' };
  tbody.innerHTML = d.data.map(po =>
    '<tr>' +
    '<td><strong>'+esc(po.po_no)+'</strong></td>' +
    '<td>'+esc(po.supplier_name)+'</td>' +
    '<td style="font-weight:700;color:var(--brand,#1B5E30)">'+fmt(po.total)+' ج.م</td>' +
    '<td style="color:#9ca3af;font-size:12px">'+formatDate(po.created_at)+'</td>' +
    '<td><span class="badge '+(stCls[po.status]||'')+'">'+( stLabel[po.status]||po.status)+'</span></td>' +
    '<td><div style="display:flex;gap:6px">'+
    (po.status==='pending'?'<button class="btn btn-sm btn-gold" onclick="receivePO('+po.id+')">✅ استلام</button>':'')+
    (po.status==='pending'?'<button class="btn btn-sm btn-danger" onclick="cancelPO('+po.id+')">❌</button>':'')+
    '</div></td>' +
    '</tr>'
  ).join('');
}

let poItemIdx = 0;
function addPOItem() {
  const container = document.getElementById('poItemsContainer');
  const idx = poItemIdx++;
  const productOpts = sysProductsCache.map(p =>
    '<option value="'+p.id+'" data-cost="'+p.cost_price+'">'+esc(p.name)+'</option>'
  ).join('');
  const div = document.createElement('div');
  div.className = 'inv-item-row';
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end';
  div.innerHTML =
    '<div><div style="display:flex;gap:4px">'+
    '<select onchange="fillPOItemProduct(this,'+idx+')" style="width:130px;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:12px;flex-shrink:0">'+
    '<option value="">من المخزون</option>'+productOpts+
    '</select>'+
    '<input type="text" id="poi-desc-'+idx+'" placeholder="اسم الصنف / الخامة" style="flex:1;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none">'+
    '</div></div>'+
    '<div><input type="number" id="poi-qty-'+idx+'" value="1" min="1" oninput="updatePOTotal()" style="width:100%;padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none" placeholder="كمية"></div>'+
    '<div><input type="number" id="poi-cost-'+idx+'" value="0" min="0" step="0.5" oninput="updatePOTotal()" style="width:100%;padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:\'Cairo\',sans-serif;font-size:13px;outline:none" placeholder="تكلفة ج.م"></div>'+
    '<button onclick="removeInvItem(this)" style="padding:8px;background:#fee2e2;color:#ef4444;border:none;border-radius:8px;cursor:pointer">\xD7</button>';
  container.appendChild(div);
}

function fillPOItemProduct(sel, idx) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt.value) return;
  const p = sysProductsCache.find(x => String(x.id) === opt.value);
  if (!p) return;
  document.getElementById('poi-desc-'+idx).value = p.name;
  document.getElementById('poi-cost-'+idx).value = p.cost_price;
  sel.dataset.productId = p.id;
  updatePOTotal();
}

function updatePOTotal() {
  let total = 0;
  document.querySelectorAll('#poItemsContainer .inv-item-row').forEach((row, i) => {
    const qty = +document.getElementById('poi-qty-'+(poItemIdx - document.querySelectorAll('#poItemsContainer .inv-item-row').length + i))?.value || 0;
    const cost = +document.getElementById('poi-cost-'+(poItemIdx - document.querySelectorAll('#poItemsContainer .inv-item-row').length + i))?.value || 0;
    total += qty * cost;
  });
  const el = document.getElementById('po-total-disp');
  if (el) el.textContent = fmt(total) + ' ج.م';
}

async function openNewPO() {
  // load products if not cached
  if (!sysProductsCache.length) { const dp = await sysGet('/products'); sysProductsCache = dp.ok ? dp.data : []; }
  // fill suppliers dropdown
  const sel = document.getElementById('po-supplier');
  sel.innerHTML = '<option value="">— اختر —</option>' +
    suppliersCache.map(s => '<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');
  document.getElementById('poItemsContainer').innerHTML = '';
  poItemIdx = 0;
  addPOItem();
  document.getElementById('po-notes').value = '';
  document.getElementById('po-date').value = '';
  document.getElementById('po-wallet').value = '';
  document.getElementById('po-payment-method').value = '';
  await fillWalletDropdown('po-wallet', ['cash','ewallet','bank'], '— آجل (لم يُدفع بعد) —');
  document.getElementById('poModal').classList.remove('hidden');
}

function openNewPOForSup(sid) {
  openNewPO().then(() => {
    document.getElementById('po-supplier').value = sid;
  });
}

async function savePO() {
  const items = [];
  let base = poItemIdx - document.querySelectorAll('#poItemsContainer .inv-item-row').length;
  document.querySelectorAll('#poItemsContainer .inv-item-row').forEach((row, i) => {
    const idx = base + i;
    const desc = document.getElementById('poi-desc-'+idx)?.value.trim();
    const qty = +document.getElementById('poi-qty-'+idx)?.value || 0;
    const cost = +document.getElementById('poi-cost-'+idx)?.value || 0;
    const sel = row.querySelector('select');
    const pid = sel?.dataset.productId ? +sel.dataset.productId : null;
    if (desc) items.push({ description: desc, qty, unit_cost: cost, product_id: pid });
  });
  if (!items.length) { alert('أدخل صنف واحد على الأقل'); return; }
  const body = {
    supplier_id: +document.getElementById('po-supplier').value || null,
    expected_date: document.getElementById('po-date').value || null,
    notes: document.getElementById('po-notes').value.trim() || null,
    items
  };
  const poWalletVal = document.getElementById('po-wallet')?.value;
  const poPayMethod = document.getElementById('po-payment-method')?.value || null;
  body.wallet_id = poWalletVal ? +poWalletVal : null;
  body.payment_method = poPayMethod;
  const d = await sysPost('/purchase-orders', body);
  if (d.ok) {
    closeModal('poModal');
    await Promise.all([loadSupplierStats(), loadPOs()]);
    if (poWalletVal) await loadWalletSummary();
  } else alert('خطأ: ' + d.error);
}

async function receivePO(id) {
  if (!confirm('تأكيد استلام الأمر كاملاً؟\nسيتم إضافة الكميات للمخزون أوتوماتيكاً')) return;
  // wallet_id was set at PO creation — server uses it automatically
  const d = await fetch(API_INV + '/purchase-orders/'+id+'/receive', {
    method:'PUT', headers:hdr(), body:JSON.stringify({}), credentials:'include'
  }).then(r => r.json());
  if (d.ok) {
    await Promise.all([loadSupplierStats(), loadPOs(), loadStats(), loadInventory()]);
    await loadWalletSummary();
    alert('✅ تم الاستلام وتحديث المخزون');
  } else alert('خطأ: ' + d.error);
}

async function cancelPO(id) {
  if (!confirm('إلغاء هذا الأمر؟')) return;
  await fetch(API_INV + '/purchase-orders/'+id+'/cancel', { method:'PUT', headers:hdr(), credentials:'include' });
  await Promise.all([loadSupplierStats(), loadPOs()]);
}

