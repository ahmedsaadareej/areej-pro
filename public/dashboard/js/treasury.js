// ============================================================
// CLIENT PROFILE — بروفايل العميل الكامل
// ============================================================
async function openClientProfile(contact_id, contact_name) {
  let panel = document.getElementById('client-profile-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'client-profile-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(640px,100vw);height:100vh;background:#f5f7fa;z-index:9999;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:.3s';
    document.body.appendChild(panel);
  }

  // Header with loading
  panel.innerHTML =
    '<div style="background:var(--brand,#1B5E30);padding:16px 20px;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between">' +
    '<div>' +
    '<div style="color:#fff;font-size:17px;font-weight:900">👤 ' + esc(contact_name) + '</div>' +
    '<div style="color:rgba(255,255,255,.7);font-size:11px" id="cp-sub"></div>' +
    '</div>' +
    '<button onclick="document.getElementById(\'client-profile-panel\').style.transform=\'translateX(100%)\'" style="color:#fff;background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 12px;font-size:18px;cursor:pointer">✕</button>' +
    '</div>' +
    '<div style="padding:16px" id="cp-body"><div style="text-align:center;padding:40px;color:#9ca3af">جاري التحميل...</div></div>';
  panel.style.transform = 'translateX(0)';

  // Fetch all data in parallel
  const [dContact, dContactFull, dInv, dOrd, dShip] = await Promise.all([
    fetch('/api/crm/contacts/' + contact_id + '/balance', { headers: hdr() }).then(r=>r.json()).catch(()=>({})),
    fetch('/api/crm/contacts/' + contact_id, { headers: hdr() }).then(r=>r.json()).catch(()=>({})),
    apiFetch('/api/system/invoices?limit=100'),
    apiFetch('/api/system/orders?limit=100'),
    apiFetch('/api/system/shipping/shipments')
  ]);

  // دمج بيانات الـ balance مع بيانات الـ contact الكاملة
  const contact = { ...(dContactFull.data || {}), ...(dContact.contact || {}) };
  const invoices = (dInv.ok ? dInv.data : []).filter(i => i.contact_id == contact_id);
  const orders   = (dOrd.ok ? dOrd.data : []).filter(o => o.contact_id == contact_id);
  const ships    = (dShip.ok ? dShip.shipments : []).filter(s => orders.some(o => o.id == s.order_id));

  // Notes
  const dNotes = await fetch('/api/crm/contacts/' + contact_id + '/notes', { headers: hdr() }).then(r=>r.json()).catch(()=>({}));
  const notes = dNotes.ok ? dNotes.data : [];

  const balance     = contact.balance || 0;
  const totalPaid   = contact.total_paid || 0;
  const totalInv    = invoices.reduce((s,i)=>s+(i.total||0),0);
  const paidInv     = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total||0),0);
  const pendingInv  = invoices.filter(i=>i.status!=='paid'&&i.status!=='cancelled').reduce((s,i)=>s+(i.total||0),0);

  // Sub-header
  const statusLabels = { lead:'ليد', prospect:'محتمل', client:'عميل', vip:'VIP', cold:'بارد' };
  const statusColors = { lead:'#9ca3af', prospect:'#F5A623', client:'#16a34a', vip:'#7c3aed', cold:'#ef4444' };
  document.getElementById('cp-sub').textContent = (statusLabels[contact.status] || '') + (contact.city ? ' — ' + contact.city : '');

  let html = '';

  // ── Quick Actions ──
  const phone = (contact.phone || contact.whatsapp || '').replace(/^0/,'');
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
  if (phone) {
    html += '<a href="https://wa.me/2'+phone+'" target="_blank" style="background:#25D366;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:4px">📱 واتساب</a>';
    html += '<a href="tel:0'+phone+'" style="background:#3b82f6;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📞 اتصال</a>';
  }
  html += '<button onclick="showPage(\'inbox\',document.querySelector(\'[data-page=inbox]\'))" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">💬 الرسائل</button>';
  html += '<button onclick="openStatementModal('+contact_id+',\''+esc(contact_name)+'\')" style="background:#eff6ff;border:1.5px solid #bfdbfe;color:#2563eb;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📊 كشف حساب</button>';
  html += '<button onclick="openPaymentModal('+contact_id+',\''+esc(contact_name)+'\','+balance+')" style="background:'+(balance>0?'#1B5E30':'#9ca3af')+';color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">💰 تسجيل دفعة</button>';
  html += '</div>';

  // ── بيانات العميل ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">📋 بيانات العميل</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">';
  if (contact.phone || contact.whatsapp) html += '<div><span style="color:#9ca3af">📱 هاتف:</span> <strong>'+(contact.phone||contact.whatsapp)+'</strong></div>';
  if (contact.email) html += '<div><span style="color:#9ca3af">📧 إيميل:</span> <strong>'+esc(contact.email)+'</strong></div>';
  if (contact.city)  html += '<div><span style="color:#9ca3af">📍 المدينة:</span> <strong>'+esc(contact.city)+'</strong></div>';
  if (contact.source) html += '<div><span style="color:#9ca3af">🔗 المصدر:</span> <strong>'+esc(contact.source)+'</strong></div>';
  if (contact.status) {
    const sc = statusColors[contact.status]||'#9ca3af';
    html += '<div><span style="color:#9ca3af">🏷️ الحالة:</span> <span style="background:'+sc+'20;color:'+sc+';padding:2px 8px;border-radius:6px;font-weight:700">'+(statusLabels[contact.status]||contact.status)+'</span></div>';
  }
  html += '</div></div>';

  // ── حساب العميل ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">💰 حساب العميل</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">';
  html += '<div style="background:#f0fdf4;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">إجمالي المشتريات</div><div style="font-size:15px;font-weight:800;color:var(--brand,#1B5E30)">'+fmt(totalInv)+' ج</div></div>';
  html += '<div style="background:#dcfce7;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">تم الدفع</div><div style="font-size:15px;font-weight:800;color:#16a34a">'+fmt(paidInv)+' ج</div></div>';
  html += '<div style="background:'+(balance>0?'#fef9c3':'#f0fdf4')+';border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">ذمم عليه</div><div style="font-size:15px;font-weight:800;color:'+(balance>0?'#92400e':'#16a34a')+'">'+fmt(balance)+' ج</div></div>';
  html += '</div>';
  if (balance > 0) {
    html += '<div style="background:#fef3c7;border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="font-size:12px;color:#92400e;font-weight:700">⚠️ متأخر السداد: '+fmt(balance)+' ج.م</span>';
    html += '<button onclick="openPaymentModal('+contact_id+',\''+esc(contact_name)+'\','+balance+')" style="background:#1B5E30;color:#fff;border:none;padding:6px 14px;border-radius:7px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">💰 سجّل دفعة</button>';
    html += '</div>';
  }
  html += '</div>';

  // ── الفواتير ──
  const stLbl = { draft:'مسودة', sent:'مرسلة', paid:'مدفوعة', cancelled:'ملغية' };
  const stColor = { draft:'#9ca3af', sent:'#3b82f6', paid:'#16a34a', cancelled:'#ef4444' };
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">🧾 الفواتير ('+invoices.length+')</div>';
  if (!invoices.length) { html += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">لا توجد فواتير</div>'; }
  else {
    html += invoices.map(i => {
      const c = stColor[i.status]||'#9ca3af';
      const pdfLink = window.location.origin + '/api/system/invoices/'+i.id+'/pdf?_t='+getToken();
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">'
        + '<div style="flex:1;cursor:pointer" onclick="openInvoiceDetail('+i.id+')" title="فتح تفاصيل الفاتورة">'
        + '<div style="font-weight:700;font-size:12px;color:var(--brand,#1B5E30);text-decoration:underline">'+esc(i.invoice_no)+'</div>'
        + '<div style="font-size:10px;color:#9ca3af">'+(i.created_at||'').substring(0,10)+'</div></div>'
        + '<span style="background:'+c+'20;color:'+c+';padding:2px 7px;border-radius:6px;font-size:11px;font-weight:700">'+(stLbl[i.status]||i.status)+'</span>'
        + '<div style="font-weight:800;font-size:13px;color:var(--brand,#1B5E30)">'+fmt(i.total)+' ج</div>'
        + '<a href="'+pdfLink+'" target="_blank" onclick="event.stopPropagation()" style="background:#f3f4f6;color:#374151;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;text-decoration:none">📄 PDF</a>'
        + '</div>';
    }).join('');
  }
  html += '</div>';

  // ── الأوردرات ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">📦 الأوردرات ('+orders.length+')</div>';
  if (!orders.length) { html += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">لا توجد أوردرات</div>'; }
  else {
    html += orders.map(o => {
      const sc = SHIP_STATUS_COLORS || {};
      const ship = ships.find(s => s.order_id == o.id);
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">'
        + '<div style="flex:1"><div style="font-weight:700;font-size:12px">'+esc(o.order_no)+'</div>'
        + '<div style="font-size:10px;color:#9ca3af">'+(o.created_at||'').substring(0,10)+(ship?' | 🚚 '+esc(ship.waybill_no||''):'')+'</div></div>'
        + '<span class="badge '+(ORD_STATUS_CLS[o.status]||'')+'" style="font-size:11px">'+(ORD_STATUS_LABELS[o.status]||o.status)+'</span>'
        + '<div style="font-weight:800;font-size:13px;color:var(--brand,#1B5E30)">'+fmt(o.total)+' ج</div>'
        + '</div>';
    }).join('');
  }
  html += '</div>';

  // ── الشحنات ──
  if (ships.length) {
    const SLBL = { pending:'منتظر', picked:'تم الاستلام', transit:'في الطريق', out:'مع المندوب', delivered:'تم التسليم', returned:'مرتجع' };
    const SCLR = { pending:'#F5A623', delivered:'#16a34a', returned:'#ef4444', transit:'#8b5cf6', out:'#F5A623', picked:'#3b82f6' };
    html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
    html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">🚚 الشحنات ('+ships.length+')</div>';
    html += ships.map(s => {
      const c = SCLR[s.status]||'#9ca3af';
      const trackLink = 'https://pro.areejegypt.com/track/'+s.waybill_no;
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">'
        + '<div style="flex:1"><div style="font-weight:700;font-size:12px">'+esc(s.waybill_no)+'</div>'
        + '<div style="font-size:10px;color:#9ca3af">'+esc(s.company)+'</div></div>'
        + '<span style="background:'+c+'20;color:'+c+';padding:2px 7px;border-radius:6px;font-size:11px;font-weight:700">'+(SLBL[s.status]||s.status)+'</span>'
        + '<button onclick="copyText(\''+trackLink+'\')" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:4px 8px;border-radius:6px;font-family:Cairo,sans-serif;font-size:10px;font-weight:700;cursor:pointer">🔗 تتبع</button>'
        + '</div>';
    }).join('');
    html += '</div>';
  }

  // ── ملاحظات + إضافة ملاحظة ──
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">📝 سجل النشاط ('+notes.length+')</div>';
  html += '<div style="display:flex;gap:6px;margin-bottom:10px">';
  html += '<input id="cp-new-note" placeholder="أضف ملاحظة..." style="flex:1;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">';
  html += '<button onclick="addCPNote('+contact_id+')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">➕</button>';
  html += '</div>';
  if (!notes.length) { html += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:10px">لا توجد ملاحظات</div>'; }
  else {
    html += '<div style="max-height:200px;overflow-y:auto">';
    html += notes.map(n => {
      const isPayment = (n.content||n.body||'').startsWith('💰');
      const isInvoice = (n.content||n.body||'').startsWith('تم إنشاء فاتورة');
      const bg = isPayment ? '#f0fdf4' : isInvoice ? '#eff6ff' : '#f9fafb';
      return '<div style="padding:8px 10px;background:'+bg+';border-radius:8px;margin-bottom:5px">'
        + '<div style="font-size:12px;color:#374151">'+esc(n.content||n.body||'')+'</div>'
        + '<div style="font-size:10px;color:#9ca3af;margin-top:3px">'+(n.created_at||'').substring(0,16).replace('T',' ')+'</div>'
        + '</div>';
    }).join('');
    html += '</div>';
  }
  html += '</div>';

  document.getElementById('cp-body').innerHTML = html;
}

async function addCPNote(contact_id) {
  const el = document.getElementById('cp-new-note');
  const text = el.value.trim();
  if (!text) return;
  const d = await fetch('/api/crm/contacts/'+contact_id+'/notes', {
    method:'POST', headers:{...hdr(),'Content-Type':'application/json'},
    body: JSON.stringify({ content: text })
  }).then(r=>r.json());
  if (d.ok) {
    el.value = '';
    showToast('✅ تم إضافة الملاحظة');
    // reload notes
    const currentName = document.querySelector('#client-profile-panel h2')?.textContent?.replace('👤 ','') || '';
    await openClientProfile(contact_id, currentName);
  } else showToast('❌ ' + (d.error||'خطأ'));
}



// ── WALLET STATEMENT ──
async function openWalletStatement(walletId, walletName) {
  let panel = document.getElementById('wallet-stmt-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'wallet-stmt-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(680px,100vw);height:100vh;background:#f5f7fa;z-index:9999;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:.3s';
    document.body.appendChild(panel);
  }
  panel.innerHTML =
    '<div style="background:var(--brand,#1B5E30);padding:16px 20px;position:sticky;top:0;z-index:1;display:flex;flex-direction:column;gap:8px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div style="color:#fff;font-size:16px;font-weight:900">🏦 ' + esc(walletName) + '</div>' +
    '<button onclick="document.getElementById(\'wallet-stmt-panel\').style.transform=\'translateX(100%)\'" style="color:#fff;background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 12px;font-size:18px;cursor:pointer">✕</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<input type="date" id="ws-from" style="padding:5px 10px;border:none;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px">' +
    '<span style="color:rgba(255,255,255,.7);font-size:12px;align-self:center">إلى</span>' +
    '<input type="date" id="ws-to" style="padding:5px 10px;border:none;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px">' +
    '<button onclick="loadWalletStatement('+walletId+')" style="background:#F5A623;color:#fff;border:none;padding:5px 14px;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">عرض</button>' +
    '<button onclick="clearWSDates();loadWalletStatement('+walletId+')" style="background:rgba(255,255,255,.2);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px;cursor:pointer">كل الحركات</button>' +
    '<button onclick="printWalletStatement()" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px;cursor:pointer">🖨️ طباعة</button>' +
    '</div>' +
    '</div>' +
    '<div style="padding:16px" id="ws-body"><div style="text-align:center;padding:40px;color:#9ca3af">جاري التحميل...</div></div>';
  panel.style.transform = 'translateX(0)';
  await loadWalletStatement(walletId);
}

let wsWalletId = null; let wsWalletName = '';
async function loadWalletStatement(walletId) {
  wsWalletId = walletId;
  const from = document.getElementById('ws-from')?.value || '';
  const to   = document.getElementById('ws-to')?.value || '';
  let url = '/api/system/transactions?wallet_id=' + walletId + '&limit=200';
  if (from) url += '&from=' + from;
  if (to)   url += '&to=' + to;
  const [d, dw] = await Promise.all([sysGet(url), sysGet('/wallets')]);
  const wallet = (dw.data||[]).find(w => w.id == walletId);
  wsWalletName = wallet ? wallet.name : 'الخزينة';
  const txns = d.data || [];
  const el = document.getElementById('ws-body');
  if (!txns.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af">لا توجد حركات في هذه الفترة</div>'; return; }

  const totalIn  = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const totalOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  const net = totalIn - totalOut;

  let html = '';
  // Summary
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">';
  html += '<div style="background:#f0fdf4;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">إجمالي الوارد</div><div style="font-size:15px;font-weight:900;color:#16a34a">'+fmt(totalIn)+' ج.م</div></div>';
  html += '<div style="background:#fee2e2;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">إجمالي الصادر</div><div style="font-size:15px;font-weight:900;color:#ef4444">'+fmt(totalOut)+' ج.م</div></div>';
  html += '<div style="background:'+(net>=0?'#f0fdf4':'#fee2e2')+';border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:#6b7280">صافي الفترة</div><div style="font-size:15px;font-weight:900;color:'+(net>=0?'#16a34a':'#ef4444')+'">'+(net>=0?'+':'')+fmt(net)+' ج.م</div></div>';
  html += '</div>';

  // Table
  html += '<div style="background:#fff;border-radius:12px;overflow:hidden;border:1.5px solid #e5e7eb">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:#f9fafb"><th style="padding:8px 10px;text-align:right">التاريخ</th><th style="padding:8px 10px;text-align:right">البيان</th><th style="padding:8px 10px;text-align:right">النوع</th><th style="padding:8px 10px;text-align:left;color:#16a34a">وارد</th><th style="padding:8px 10px;text-align:left;color:#ef4444">صادر</th></tr></thead><tbody>';
  txns.slice().reverse().forEach(t => {
    const isIn = t.type === 'in';
    const rowBg = isIn ? '' : 'background:#fff8f8';
    html += '<tr style="border-bottom:1px solid #f3f4f6;'+rowBg+'">';
    html += '<td style="padding:8px 10px;color:#9ca3af;font-size:11px">'+(t.date||t.created_at||'').substring(0,10)+'</td>';
    html += '<td style="padding:8px 10px;font-size:12px;max-width:200px">'+esc((t.description||t.notes||'—').substring(0,60))+'</td>';
    html += '<td style="padding:8px 10px"><span style="background:'+(isIn?'#dcfce7':'#fee2e2')+';color:'+(isIn?'#16a34a':'#ef4444')+';padding:2px 7px;border-radius:6px;font-size:11px;font-weight:700">'+(isIn?'داخل':'خارج')+'</span></td>';
    html += '<td style="padding:8px 10px;text-align:left;color:#16a34a;font-weight:700">'+(isIn?fmt(t.amount):'')+'</td>';
    html += '<td style="padding:8px 10px;text-align:left;color:#ef4444;font-weight:700">'+(!isIn?fmt(t.amount):'')+'</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function clearWSDates() {
  const f = document.getElementById('ws-from'); if(f) f.value='';
  const t = document.getElementById('ws-to'); if(t) t.value='';
}

function printWalletStatement() {
  const body = document.getElementById('ws-body');
  if (!body) return;
  const from = document.getElementById('ws-from')?.value || '';
  const to   = document.getElementById('ws-to')?.value || '';
  const period = from && to ? from + ' إلى ' + to : 'كل الحركات';
  const html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
    + '<style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#1B5E30}table{width:100%;border-collapse:collapse}th{background:#1B5E30;color:#fff;padding:7px;text-align:right}td{padding:7px;border-bottom:1px solid #f3f4f6;font-size:12px}</style></head><body>'
    + '<h1>🌿 أريج أكاديمي — كشف حساب خزينة</h1>'
    + '<div>الخزينة: <strong>'+esc(wsWalletName)+'</strong> | الفترة: '+esc(period)+'</div>'
    + body.innerHTML
    + '</body></html>';
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── SHIPMENT DETAIL PANEL ──
async function openShipmentDetail(shipId, waybillNo) {
  let panel = document.getElementById('shipment-detail-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'shipment-detail-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(600px,100vw);height:100vh;background:#f5f7fa;z-index:9999;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:.3s';
    document.body.appendChild(panel);
  }
  panel.innerHTML =
    '<div style="background:var(--brand,#1B5E30);padding:16px 20px;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between">'
    + '<div style="color:#fff;font-size:16px;font-weight:900">🚚 تفاصيل الشحنة</div>'
    + '<button onclick="document.getElementById(\'shipment-detail-panel\').style.transform=\'translateX(100%)\'" style="color:#fff;background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 12px;font-size:18px;cursor:pointer">✕</button>'
    + '</div><div style="padding:16px" id="ship-detail-body"><div style="text-align:center;padding:40px;color:#9ca3af">جاري التحميل...</div></div>';
  panel.style.transform = 'translateX(0)';

  const d = await apiFetch('/api/system/shipping/shipments/' + shipId);
  if (!d.ok) { document.getElementById('ship-detail-body').innerHTML = '<div style="color:#CC2200;text-align:center;padding:20px">خطأ في التحميل</div>'; return; }
  const s = d.shipment;

  const SLBL = { pending:'منتظر', picked:'تم الاستلام', transit:'في الطريق', out:'مع المندوب', delivered:'تم التسليم', returned:'مرتجع' };
  const SCLR = { pending:'#F5A623', picked:'#3b82f6', transit:'#8b5cf6', out:'#F5A623', delivered:'#16a34a', returned:'#ef4444' };
  const sc = SCLR[s.status]||'#9ca3af';
  const trackLink = 'https://pro.areejegypt.com/track/' + s.waybill_no;

  let html = '';

  // Header
  html += '<div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">';
  html += '<div><div style="font-size:20px;font-weight:900;color:var(--brand,#1B5E30);letter-spacing:1px">' + esc(s.waybill_no||'') + '</div>';
  html += '<div style="font-size:12px;color:#6b7280;margin-top:2px">🚚 ' + esc(s.company||'') + ' | ' + (s.created_at||'').substring(0,10) + '</div></div>';
  html += '<span style="background:'+sc+'20;color:'+sc+';padding:7px 14px;border-radius:10px;font-weight:700;font-size:13px">' + (SLBL[s.status]||s.status) + '</span>';
  html += '</div>';

  // Actions
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '<button onclick="printWaybill('+shipId+')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">🖨️ طباعة البوليصة</button>';
  html += '<button onclick="copyText(\''+trackLink+'\')" style="background:#eff6ff;border:1.5px solid #bfdbfe;color:#2563eb;padding:8px 14px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">🔗 نسخ لينك التتبع</button>';
  const phone = (s.receiver_phone||'').replace(/^0/,'');
  if (phone) {
    const waMsg = encodeURIComponent('طلبك في الطريق! تتبع شحنتك: ' + trackLink + ' | رقم البوليصة: ' + s.waybill_no);
    html += '<a href="https://wa.me/2'+phone+'?text='+waMsg+'" target="_blank" style="background:#25D366;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📱 واتساب</a>';
  }
  html += '</div></div>';

  // تغيير الحالة
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">🔄 تحديث حالة الشحنة</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  ['pending','picked','transit','out','delivered','returned'].forEach(st => {
    const c = SCLR[st]||'#9ca3af';
    const isActive = s.status === st;
    html += '<button onclick="updateShipStatus('+shipId+',\''+st+'\');openShipmentDetail('+shipId+',\''+s.waybill_no+'\')" style="background:'+(isActive?c:'#f9fafb')+';color:'+(isActive?'#fff':c)+';border:1.5px solid '+c+';padding:6px 12px;border-radius:8px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">'+(SLBL[st]||st)+'</button>';
  });
  html += '</div></div>';

  // بيانات الشحنة
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">📋 بيانات الشحنة</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">';
  html += '<div><span style="color:#9ca3af">المستلم:</span> <strong>'+esc(s.receiver_name||'')+'</strong></div>';
  html += '<div><span style="color:#9ca3af">الهاتف:</span> <strong>'+esc(s.receiver_phone||'—')+'</strong></div>';
  if (s.receiver_address) html += '<div style="grid-column:1/-1"><span style="color:#9ca3af">العنوان:</span> '+esc(s.receiver_address)+'</div>';
  if (s.receiver_city) html += '<div><span style="color:#9ca3af">المدينة:</span> '+esc(s.receiver_city)+'</div>';
  html += '<div><span style="color:#9ca3af">الوزن:</span> '+(s.weight||0.5)+' kg</div>';
  if (s.cod_amount > 0) html += '<div><span style="color:#9ca3af">COD:</span> <strong style="color:#CC2200">'+fmt(s.cod_amount)+' ج.م</strong></div>';
  html += '</div></div>';

  // الأوردر المرتبط
  if (s.order_no) {
    html += '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px;margin-bottom:12px;cursor:pointer" onclick="showPage(\'orders\',document.querySelector(\'[data-page=orders]\'))">';
    html += '<div style="font-size:13px;font-weight:800;color:var(--brand,#1B5E30);margin-bottom:4px">📦 الأوردر المرتبط</div>';
    html += '<div style="font-size:13px;font-weight:700">'+esc(s.order_no)+'</div>';
    html += '<div style="font-size:12px;color:#6b7280">'+esc(s.order_client||'')+(s.order_total?' — '+fmt(s.order_total)+' ج.م':'')+'</div>';
    html += '</div>';
  }

  document.getElementById('ship-detail-body').innerHTML = html;
}

function printWaybill(shipId) {
  // Get data from current panel
  const waybillEl = document.querySelector('#shipment-detail-panel .modal, #ship-detail-body');
  // Find shipment from tbody
  const rows = document.querySelectorAll('#ship-tbody tr');
  // Use apiFetch to get full data and print
  apiFetch('/api/system/shipping/shipments/' + shipId).then(d => {
    if (!d.ok) return;
    const s = d.shipment;
    const trackLink = 'https://pro.areejegypt.com/track/' + s.waybill_no;
    const companyName = s.company;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; padding: 0; margin: 0; background: #fff; }
  .waybill { width: 100%; max-width: 400px; margin: 20px auto; border: 2px solid #1B5E30; border-radius: 12px; overflow: hidden; }
  .header { background: #1B5E30; color: #fff; padding: 14px 16px; }
  .header h1 { font-size: 16px; margin: 0; }
  .header .waybill-no { font-size: 24px; font-weight: 900; letter-spacing: 2px; margin-top: 4px; }
  .section { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
  .section:last-child { border-bottom: none; }
  .label { font-size: 10px; color: #9ca3af; margin-bottom: 2px; }
  .value { font-size: 13px; font-weight: 700; }
  .track-url { font-size: 10px; color: #2563eb; word-break: break-all; }
  .footer { background: #f9fafb; padding: 10px 16px; text-align: center; font-size: 11px; color: #6b7280; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="waybill">
  <div class="header">
    <h1>🌿 أريج أكاديمي — بوليصة شحن</h1>
    <div class="waybill-no">${esc(s.waybill_no)}</div>
    <div style="font-size:11px;opacity:.8;margin-top:4px">${companyName} | ${(s.created_at||'').substring(0,10)}</div>
  </div>
  <div class="section">
    <div class="label">المستلم</div>
    <div class="value">${esc(s.receiver_name||'')}</div>
  </div>
  <div class="section">
    <div class="label">الهاتف</div>
    <div class="value">${esc(s.receiver_phone||'—')}</div>
  </div>
  ${s.receiver_address ? `<div class="section"><div class="label">العنوان</div><div class="value">${esc(s.receiver_address)}</div></div>` : ''}
  <div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div><div class="label">الوزن</div><div class="value">${s.weight||0.5} kg</div></div>
    ${s.cod_amount > 0 ? `<div><div class="label">الدفع عند الاستلام</div><div class="value" style="color:#CC2200">${s.cod_amount} ج.م</div></div>` : ''}
  </div>
  <div class="section">
    <div class="label">لينك التتبع</div>
    <div class="track-url">${trackLink}</div>
  </div>
  <div class="footer">🚚 ${companyName} | ${(s.created_at||new Date().toISOString()).substring(0,10)}</div>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  });
}

// ── SHIPPING COMPANIES MANAGER ──
async function openShippingCompanies() {
  let panel = document.getElementById('ship-cos-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ship-cos-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(640px,100vw);height:100vh;background:#f5f7fa;z-index:9999;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:.3s';
    document.body.appendChild(panel);
  }
  panel.innerHTML =
    '<div style="background:var(--brand,#1B5E30);padding:16px 20px;position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between">'
    + '<div style="color:#fff;font-size:16px;font-weight:900">🚚 شركات الشحن</div>'
    + '<button onclick="document.getElementById(\'ship-cos-panel\').style.transform=\'translateX(100%)\'" style="color:#fff;background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 12px;font-size:18px;cursor:pointer">✕</button>'
    + '</div><div style="padding:16px" id="ship-cos-body"><div style="text-align:center;padding:40px;color:#9ca3af">جاري التحميل...</div></div>';
  panel.style.transform = 'translateX(0)';
  await loadShipCosList();
}

async function loadShipCosList() {
  const el = document.getElementById('ship-cos-body');
  const d = await apiFetch('/api/system/shipping/companies');
  const cos = d.companies || [];

  let html = '';
  // Add new company form
  html += '<div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:14px;border:1.5px solid #e5e7eb">';
  html += '<div style="font-size:13px;font-weight:800;margin-bottom:12px">➕ إضافة شركة شحن جديدة</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
  html += '<input id="co-name" placeholder="الاسم بالعربي *" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">';
  html += '<input id="co-name-en" placeholder="الاسم بالإنجليزي" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">';
  html += '</div>';
  html += '<input id="co-api-endpoint" placeholder="API Endpoint (اختياري)" style="width:100%;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;margin-bottom:8px">';
  html += '<input id="co-api-key" placeholder="API Key (اختياري)" style="width:100%;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;margin-bottom:8px">';
  html += '<input id="co-tracking-tpl" placeholder="لينك التتبع: https://example.com/track/{waybill}" style="width:100%;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;margin-bottom:10px">';
  html += '<button onclick="addShippingCompany()" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">➕ إضافة</button>';
  html += '</div>';

  // Companies list
  html += '<div style="display:flex;flex-direction:column;gap:10px">';
  cos.forEach(co => {
    html += '<div style="background:#fff;border:1.5px solid '+(co.is_default?'var(--brand,#1B5E30)':'#e5e7eb')+';border-radius:12px;padding:14px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div><div style="font-weight:800;font-size:14px">'+esc(co.name)+'</div>';
    html += '<div style="font-size:11px;color:#6b7280">'+esc(co.name_en||'')+(co.is_default?' | ⭐ افتراضي':'')+(co.active?'':' | ⚠️ غير نشط')+'</div></div>';
    html += '<div style="display:flex;gap:6px">';
    if (!co.is_default) html += '<button onclick="setDefaultShipCo('+co.id+')" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:4px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;cursor:pointer">⭐ افتراضي</button>';
    if (co.api_endpoint) html += '<button onclick="testShipCo('+co.id+')" style="background:#eff6ff;border:1.5px solid #bfdbfe;color:#2563eb;padding:4px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;cursor:pointer">🔗 اختبار</button>';
    html += '<button onclick="deleteShipCo('+co.id+')" style="background:#fee2e2;border:none;color:#ef4444;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px">🗑️</button>';
    html += '</div></div>';
    if (co.tracking_url_template) html += '<div style="font-size:10px;color:#9ca3af;word-break:break-all">🔗 '+esc(co.tracking_url_template)+'</div>';
    if (co.api_endpoint) html += '<div style="font-size:10px;color:#6b7280;margin-top:4px">🌐 API: '+esc(co.api_endpoint.substring(0,50))+'</div>';
    html += '</div>';
  });
  html += '</div>';

  el.innerHTML = html;
}

async function addShippingCompany() {
  const name = document.getElementById('co-name').value.trim();
  if (!name) { showToast('أدخل اسم الشركة'); return; }
  const d = await apiFetch('/api/system/shipping/companies', {
    method: 'POST',
    body: JSON.stringify({
      name,
      name_en: document.getElementById('co-name-en').value.trim(),
      api_endpoint: document.getElementById('co-api-endpoint').value.trim(),
      api_key: document.getElementById('co-api-key').value.trim(),
      tracking_url_template: document.getElementById('co-tracking-tpl').value.trim()
    })
  });
  if (d.ok) {
    showToast('✅ تمت الإضافة');
    await loadShipCosList();
    // Reload company dropdown in create shipment modal
    await loadShipCompaniesDropdown();
  } else showToast('❌ ' + (d.error||'خطأ'));
}

async function setDefaultShipCo(id) {
  await apiFetch('/api/system/shipping/companies/'+id, { method:'PUT', body: JSON.stringify({ is_default: true }) });
  await loadShipCosList();
}

async function deleteShipCo(id) {
  if (!confirm('حذف هذه الشركة؟')) return;
  await apiFetch('/api/system/shipping/companies/'+id, { method:'DELETE' });
  await loadShipCosList();
}

async function testShipCo(id) {
  showToast('جاري الاختبار...');
  const d = await apiFetch('/api/system/shipping/companies/'+id+'/test', { method:'POST' });
  showToast(d.ok ? '✅ ' + d.message : '❌ ' + (d.error||'خطأ'));
}

async function loadShipCompaniesDropdown() {
  const d = await apiFetch('/api/system/shipping/companies');
  const sel = document.getElementById('ship-company');
  if (!sel) return;
  const cos = d.companies || [];
  sel.innerHTML = cos.map(c => '<option value="'+esc(c.name_en||c.name)+'">🚚 '+esc(c.name)+'</option>').join('');
  if (!cos.length) sel.innerHTML = '<option value="manual">🚚 يدوي</option>';
}



// ── ACCOUNT STATEMENT ──
let stmtContactId = null;
let stmtContactName = '';
let stmtContactPhone = '';
let stmtData = null;

async function openStatementModal(contactId, contactName) {
  stmtContactId = contactId;
  stmtContactName = contactName;
  document.getElementById('stmt-client-name').textContent = '📊 كشف حساب العميل: ' + contactName;
  // Default: current month
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay  = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];
  document.getElementById('stmt-from').value = '';
  document.getElementById('stmt-to').value = '';
  document.getElementById('statementModal').classList.remove('hidden');
  await loadStatement();
}

function clearStatementDates() {
  document.getElementById('stmt-from').value = '';
  document.getElementById('stmt-to').value = '';
  loadStatement();
}

async function loadStatement() {
  const from = document.getElementById('stmt-from').value;
  const to   = document.getElementById('stmt-to').value;
  document.getElementById('stmt-body').innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">جاري التحميل...</div>';
  let url = '/api/crm/contacts/'+stmtContactId+'/statement';
  const params = [];
  if (from) params.push('from='+from);
  if (to)   params.push('to='+to);
  if (params.length) url += '?' + params.join('&');
  const d = await fetch(url, { headers: hdr() }).then(r=>r.json());
  if (!d.ok) { document.getElementById('stmt-body').innerHTML = '<div style="color:#CC2200;text-align:center;padding:20px">خطأ: '+(d.error||'?')+'</div>'; return; }
  stmtData = d;
  stmtContactPhone = (d.contact.phone||d.contact.whatsapp||'').replace(/^0/,'');
  renderStatement(d);
}

function renderStatement(d) {
  const txns = d.transactions || [];
  const s = d.summary;
  const period = d.period;

  let html = '';

  // Summary cards
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">';
  html += '<div style="background:#f0fdf4;border-radius:10px;padding:10px;text-align:center"><div style="font-size:11px;color:#6b7280">إجمالي الفواتير</div><div style="font-size:16px;font-weight:900;color:var(--brand,#1B5E30)">'+fmt(s.totalDebit)+' ج.م</div></div>';
  html += '<div style="background:#dcfce7;border-radius:10px;padding:10px;text-align:center"><div style="font-size:11px;color:#6b7280">إجمالي المدفوع</div><div style="font-size:16px;font-weight:900;color:#16a34a">'+fmt(s.totalCredit)+' ج.م</div></div>';
  html += '<div style="background:'+(s.balance>0?'#fef9c3':'#f0fdf4')+';border-radius:10px;padding:10px;text-align:center"><div style="font-size:11px;color:#6b7280">الرصيد المستحق</div><div style="font-size:16px;font-weight:900;color:'+(s.balance>0?'#92400e':'#16a34a')+'">'+fmt(s.balance)+' ج.م</div></div>';
  html += '</div>';

  if (!txns.length) {
    html += '<div style="text-align:center;padding:30px;color:#9ca3af">لا توجد حركات في هذه الفترة</div>';
    document.getElementById('stmt-body').innerHTML = html;
    return;
  }

  // Transactions table
  html += '<div style="overflow-x:auto">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:#f9fafb">';
  html += '<th style="padding:8px;text-align:right;font-weight:700;color:#6b7280">التاريخ</th>';
  html += '<th style="padding:8px;text-align:right;font-weight:700;color:#6b7280">البيان</th>';
  html += '<th style="padding:8px;text-align:right;font-weight:700;color:#6b7280">مرجع</th>';
  html += '<th style="padding:8px;text-align:left;font-weight:700;color:#ef4444">مدين (ج.م)</th>';
  html += '<th style="padding:8px;text-align:left;font-weight:700;color:#16a34a">دائن (ج.م)</th>';
  html += '<th style="padding:8px;text-align:left;font-weight:700;color:#1B5E30">الرصيد</th>';
  html += '</tr></thead><tbody>';

  txns.forEach(t => {
    const isDebit = t.debit > 0;
    const rowBg = isDebit ? 'background:#fff' : 'background:#f0fdf4';
    html += '<tr style="'+rowBg+';border-bottom:1px solid #f3f4f6">';
    html += '<td style="padding:8px;color:#9ca3af;font-size:11px">'+esc(t.date||'')+'</td>';
    html += '<td style="padding:8px;font-weight:600">'+(isDebit?'📄':'💰')+' '+esc(t.description||'')+'</td>';
    html += '<td style="padding:8px;font-size:11px;color:#6b7280">'+esc(t.ref||'')+'</td>';
    html += '<td style="padding:8px;text-align:left;color:#ef4444;font-weight:700">'+(t.debit>0?fmt(t.debit):'')+'</td>';
    html += '<td style="padding:8px;text-align:left;color:#16a34a;font-weight:700">'+(t.credit>0?fmt(t.credit):'')+'</td>';
    html += '<td style="padding:8px;text-align:left;font-weight:800;color:'+(t.balance>0?'#92400e':'#16a34a')+'">'+(t.balance>=0?'':'') + fmt(Math.abs(t.balance))+'</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  document.getElementById('stmt-body').innerHTML = html;
  document.getElementById('stmt-actions').style.display = 'flex';
}

function printStatement() {
  if (!stmtData) return;
  const d = stmtData;
  const s = d.summary;
  const from = document.getElementById('stmt-from').value;
  const to   = document.getElementById('stmt-to').value;
  const period = from && to ? from + ' إلى ' + to : 'كل التعاملات';

  let html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">';
  html += '<style>body{font-family:Arial,sans-serif;padding:20px;color:#1a1a1a;font-size:13px}'
    + 'h1{color:#1B5E30;margin-bottom:4px}'
    + '.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}'
    + '.sum-card{background:#f9fafb;border-radius:8px;padding:12px;text-align:center}'
    + '.sum-card .label{font-size:11px;color:#6b7280}'
    + '.sum-card .val{font-size:18px;font-weight:900;margin-top:4px}'
    + 'table{width:100%;border-collapse:collapse;margin-top:16px}'
    + 'th{background:#1B5E30;color:#fff;padding:8px;text-align:right;font-size:12px}'
    + 'td{padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:12px}'
    + '.debit{color:#ef4444;font-weight:700}.credit{color:#16a34a;font-weight:700}.balance{font-weight:900}'
    + '@media print{button{display:none}}'
    + '</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div><h1>🌿 أريج أكاديمي</h1><div style="color:#6b7280;font-size:12px">كشف حساب عميل</div></div>'
    + '<div style="text-align:left"><div style="font-size:12px;color:#6b7280">التاريخ: '+new Date().toLocaleDateString('ar-EG')+'</div></div>'
    + '</div>';
  html += '<div style="background:#1B5E30;color:#fff;border-radius:10px;padding:14px;margin:16px 0">'
    + '<div style="font-size:16px;font-weight:900">'+esc(stmtContactName)+'</div>'
    + '<div style="font-size:12px;opacity:.8">الفترة: '+esc(period)+'</div>'
    + '</div>';
  html += '<div class="summary">'
    + '<div class="sum-card"><div class="label">إجمالي الفواتير</div><div class="val" style="color:#1B5E30">'+fmt(s.totalDebit)+' ج.م</div></div>'
    + '<div class="sum-card"><div class="label">إجمالي المدفوع</div><div class="val" style="color:#16a34a">'+fmt(s.totalCredit)+' ج.م</div></div>'
    + '<div class="sum-card"><div class="label">الرصيد</div><div class="val" style="color:'+(s.balance>0?'#92400e':'#16a34a')+'">'+fmt(s.balance)+' ج.م</div></div>'
    + '</div>';
  html += '<table><thead><tr><th>التاريخ</th><th>البيان</th><th>مرجع</th><th style="text-align:left">مدين</th><th style="text-align:left">دائن</th><th style="text-align:left">الرصيد</th></tr></thead><tbody>';
  (d.transactions||[]).forEach(t => {
    html += '<tr>'
      + '<td>'+esc(t.date||'')+'</td>'
      + '<td>'+esc(t.description||'')+'</td>'
      + '<td>'+esc(t.ref||'')+'</td>'
      + '<td class="debit">'+( t.debit>0?fmt(t.debit):'')+'</td>'
      + '<td class="credit">'+(t.credit>0?fmt(t.credit):'')+'</td>'
      + '<td class="balance">'+fmt(Math.abs(t.balance))+'</td>'
      + '</tr>';
  });
  html += '</tbody></table></body></html>';

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

function sendStatementWA() {
  if (!stmtData || !stmtContactPhone) { showToast('لا يوجد رقم واتساب للعميل'); return; }
  const s = stmtData.summary;
  const from = document.getElementById('stmt-from').value;
  const to   = document.getElementById('stmt-to').value;
  const period = from && to ? from + ' إلى ' + to : 'كل التعاملات';
  const msg = '📋 كشف حساب\n\nالعميل: ' + stmtContactName + '\nالفترة: ' + period
    + '\n\nإجمالي الفواتير: ' + fmt(s.totalDebit) + ' ج.م'
    + '\nإجمالي المدفوع: ' + fmt(s.totalCredit) + ' ج.م'
    + '\nالرصيد المستحق: ' + fmt(s.balance) + ' ج.م'
    + (s.balance > 0 ? '\n\nيرجى سداد المبلغ المستحق في أقرب وقت ∪🙏' : '\n\nشكراً لتعاملكم الكريم 🌿');
  window.open('https://wa.me/2'+stmtContactPhone+'?text='+encodeURIComponent(msg), '_blank');
}

// ── CLIENT PAYMENT ──
async function openPaymentModal(contactId, contactName, balance) {
  document.getElementById('cp-contact-id').value = contactId;
  document.getElementById('cp-amount').value = balance > 0 ? balance.toFixed(2) : '';
  document.getElementById('cp-notes').value = '';
  document.getElementById('cp-result').innerHTML = '';
  document.getElementById('cp-modal-info').innerHTML =
    '<strong>' + esc(contactName) + '</strong><br>'
    + '<span style="font-size:12px;color:#6b7280">ذمم عليه: <strong style="color:#92400e">' + fmt(balance) + ' ج.م</strong></span>';
  // Load wallets
  const d = await apiFetch('/api/system/wallets');
  const sel = document.getElementById('cp-wallet');
  sel.innerHTML = '<option value="">— كاش افتراضي —</option>';
  (d.data||[]).filter(w => ['cash','ewallet','bank'].includes(w.type)).forEach(w => {
    sel.innerHTML += '<option value="'+w.id+'">'+esc(w.name)+'</option>';
  });
  document.getElementById('clientPaymentModal').classList.remove('hidden');
}

async function submitClientPayment() {
  const contact_id = document.getElementById('cp-contact-id').value;
  const amount = parseFloat(document.getElementById('cp-amount').value);
  const wallet_id = document.getElementById('cp-wallet').value || null;
  const payment_method = document.getElementById('cp-method').value;
  const notes = document.getElementById('cp-notes').value.trim();
  if (!amount || amount <= 0) { showToast('أدخل المبلغ'); return; }
  const d = await fetch('/api/crm/contacts/'+contact_id+'/payment', {
    method: 'POST',
    headers: { ...hdr(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, wallet_id, payment_method, notes })
  }).then(r=>r.json());
  if (d.ok) {
    document.getElementById('cp-result').innerHTML =
      '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:10px;text-align:center">'
      + '✅ تم تسجيل الدفعة<br>'
      + '<span style="font-size:12px;color:#6b7280">الرصيد الجديد: <strong>' + fmt(d.new_balance) + ' ج.م</strong></span>'
      + '</div>';
    showToast('✅ تم تسجيل الدفعة بنجاح');
    setTimeout(() => closeModal('clientPaymentModal'), 2000);
  } else {
    showToast('❌ ' + (d.error||'خطأ'));
  }
}

// ============================================================
// WhatsApp Invoice Send
// ============================================================
function sendInvWA(inv_id, inv_no, total, client_name, client_phone) {
  const phone = (client_phone || '').replace(/^0/, '');
  if (!phone) { alert('لا يوجد رقم واتساب للعميل'); return; }
  const pdfUrl = window.location.origin + '/api/system/invoices/' + inv_id + '/pdf?_t=' + getToken();
  const msg = 'السلام عليكم ' + (client_name || '') + ' 👋\n\n' +
    'تفاصيل فاتورتك:\n' +
    '🧾 رقم الفاتورة: ' + inv_no + '\n' +
    '💰 المبلغ: ' + fmt(total) + ' ج.م\n\n' +
    '📄 رابط الفاتورة:\n' + pdfUrl + '\n\n' +
    'شكراً لتعاملكم معنا 🙏';
  window.open('https://wa.me/2' + phone + '?text=' + encodeURIComponent(msg), '_blank');
}

// ============================================================
// DAILY FOLLOWUP CHECK — يشتغل لما يفتح النظام
// ============================================================
async function checkDailyFollowup() {
  try {
    const d = await sysGet('/followup/scan');
    if (!d.ok || !d.data || !d.data.length) return;
    const n = d.data.length;
    const notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;bottom:20px;left:20px;background:var(--brand,#1B5E30);color:#fff;border-radius:12px;padding:14px 18px;font-family:Cairo,sans-serif;font-size:13px;font-weight:600;z-index:99999;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);max-width:280px;direction:rtl';
    notif.innerHTML = '📱 <strong>' + n + ' عميل</strong> يحتاج متابعة اليوم<br><span style="font-size:11px;opacity:.85">اضغط للانتقال للمتابعة</span>';
    notif.onclick = function() {
      showPage('followup', document.querySelector('[onclick*=\'followup\']'));
      notif.remove();
    };
    document.body.appendChild(notif);
    setTimeout(function() { if (notif.parentNode) notif.remove(); }, 8000);
  } catch(e) {}
}

// ============================================================
// TREND CHART — آخر 6 شهور (Canvas)
// ============================================================
async function loadTrendChart() {
  const d = await sysGet('/transactions/stats/monthly');
  if (!d.ok) return;
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = d.data;
  if (!data.length) { ctx.fillStyle='#9ca3af'; ctx.font='14px Cairo'; ctx.fillText('لا توجد بيانات بعد', 20, 60); return; }
  
  const W = canvas.width, H = canvas.height;
  const pad = { top:20, right:20, bottom:40, left:60 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  
  const maxVal = Math.max(...data.map(r => Math.max(r.total_in, r.total_out)), 1);
  const months_ar = { '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو','07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر' };
  
  ctx.clearRect(0, 0, W, H);
  // grid lines
  ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W-pad.right, y); ctx.stroke();
    ctx.fillStyle='#9ca3af'; ctx.font='10px Cairo'; ctx.textAlign='right';
    ctx.fillText(fmt(maxVal*i/4), pad.left-6, y+4);
  }
  
  const barW = Math.min(chartW/data.length*0.35, 30);
  const step = chartW / data.length;
  
  data.forEach(function(r, i) {
    const x = pad.left + i*step + step/2;
    const inH = (r.total_in/maxVal)*chartH;
    const outH = (r.total_out/maxVal)*chartH;
    // in bar (green)
    ctx.fillStyle = 'var(--brand,#1B5E30)';
    ctx.fillRect(x - barW - 2, pad.top + chartH - inH, barW, inH);
    // out bar (red)
    ctx.fillStyle = '#fee2e2';
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, pad.top + chartH - outH, barW, outH);
    // label
    const month = r.month ? r.month.substring(5,7) : '';
    ctx.fillStyle = '#6b7280'; ctx.font = '10px Cairo'; ctx.textAlign = 'center';
    ctx.fillText(months_ar[month] || r.month, x + barW/2 - 2, pad.top + chartH + 16);
  });
  
  // legend
  ctx.fillStyle='var(--brand,#1B5E30)'; ctx.fillRect(pad.left, H-12, 12, 10);
  ctx.fillStyle='#6b7280'; ctx.font='10px Cairo'; ctx.textAlign='right';
  ctx.fillText('وارد', pad.left+40, H-3);
  ctx.strokeStyle='#dc2626'; ctx.strokeRect(pad.left+50, H-12, 12, 10);
  ctx.fillText('صادر', pad.left+100, H-3);
}


// ============================================================
// SHARED WALLET PICKER — modal بدل prompt()
// يُستخدم من أي مكان يحتاج اختيار خزينة
// ============================================================
let _wpmResolve = null;

async function pickWallet({ title = 'اختر الخزينة', subtitle = '', types = ['cash','ewallet','bank','shipping_co'] } = {}) {
  // Returns wallet_id (number) or null (skip) or undefined (cancel → throws)
  const dw = await sysGet('/wallets');
  const wallets = dw.ok ? dw.data.filter(w => types.includes(w.type)) : [];

  document.getElementById('wpm-title').textContent = title;
  document.getElementById('wpm-subtitle').textContent = subtitle;

  const listEl = document.getElementById('wpm-list');
  if (!wallets.length) {
    listEl.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center">لا توجد خزائن — أضف من الخزينة أولاً</p>';
  } else {
    listEl.innerHTML = wallets.map(w => {
      const icon = w.icon || (w.type==='cash'?'💵':w.type==='ewallet'?'📱':w.type==='bank'?'🏦':'💰');
      const bal  = w.balance != null ? ' <span style="font-size:11px;color:#9ca3af">(رصيد: '+fmt(w.balance)+' ج)</span>' : '';
      return '<button onclick="wpmPick('+w.id+')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;text-align:right;width:100%;font-family:Cairo,sans-serif;transition:all .15s" onmouseover="this.style.borderColor=\'var(--brand,#1B5E30)\';this.style.background=\'#f0fdf4\'" onmouseout="this.style.borderColor=\'#e5e7eb\';this.style.background=\'#fff\'">' +
        '<span style="font-size:1.4rem">' + icon + '</span>' +
        '<div style="flex:1"><div style="font-weight:700;font-size:13px">' + esc(w.name) + '</div>' + bal + '</div>' +
        '<span style="font-size:11px;color:var(--brand,#1B5E30);font-weight:700">اختر ←</span>' +
        '</button>';
    }).join('');
  }

  document.getElementById('walletPickerModal').classList.remove('hidden');

  return new Promise((resolve) => { _wpmResolve = resolve; });
}

function wpmPick(wallet_id) {
  closeModal('walletPickerModal');
  if (_wpmResolve) { _wpmResolve(wallet_id); _wpmResolve = null; }
}

function wpmSkip() {
  closeModal('walletPickerModal');
  if (_wpmResolve) { _wpmResolve(null); _wpmResolve = null; }
}

// Override closeModal to resolve as cancel (undefined) if picker was open
const _origCloseModal = closeModal;
// (closeModal already defined — we handle via wpmSkip for skip, cancel button calls closeModal directly)


// ============================================================
// WALLET DROPDOWN FILLER — shared helper
// ============================================================
async function fillWalletDropdown(selectId, types = ['cash','ewallet','bank'], label = '— لم تُقبض بعد (آجل) —') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">' + label + '</option>';
  const dw = await sysGet('/wallets');
  if (!dw.ok) return;
  const filtered = dw.data.filter(w => types.includes(w.type));
  filtered.forEach(w => {
    const icon = w.icon || (w.type==='cash'?'💵':w.type==='ewallet'?'📱':w.type==='bank'?'🏦':'💰');
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = icon + ' ' + w.name + (w.balance != null ? '  ('+fmt(w.balance)+' ج)' : '');
    sel.appendChild(opt);
  });
}


// ============================================================
// EXPENSE REPORT — تقرير المصروفات بالتصنيف
// ============================================================
async function loadExpenseReport() {
  const body = document.getElementById('exp-report-body');
  if (!body) return;
  const period   = document.getElementById('exp-period')?.value || 'month';
  const expType  = document.getElementById('exp-type')?.value || 'out';

  const periodMap = {
    month:   "date('now','start of month')",
    '3months': "date('now','-3 months')",
    year:    "date('now','start of year')",
    all:     "date('1900-01-01')"
  };

  const params = new URLSearchParams({ type: expType });
  // pass from date as rough filter (server uses it)
  const fromMap = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0,10),
    '3months': new Date(Date.now()-90*864e5).toISOString().substring(0,10),
    year: new Date().getFullYear() + '-01-01',
    all: '2000-01-01' };
  params.set('from', fromMap[period]);

  const d = await sysGet('/transactions/stats/categories?' + params);
  if (!d.ok) { body.innerHTML = '<div style="color:red;text-align:center;padding:20px">خطأ في جلب البيانات</div>'; return; }
  if (!d.data.length) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">لا توجد بيانات للفترة المختارة</div>';
    return;
  }
  const grand = d.grand_total || 1;
  const typeLabel = expType === 'out' ? 'مصروفات' : 'إيرادات';
  const typeColor = expType === 'out' ? '#dc2626' : 'var(--brand,#1B5E30)';

  body.innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:12px;color:#6b7280;font-weight:700;padding:0 4px">' +
    '<span>التصنيف</span><span>الإجمالي — النسبة</span></div>' +
    d.data.map(r => {
      const pct = grand > 0 ? Math.round(r.total / grand * 100) : 0;
      return '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<span style="font-size:13px;font-weight:600">' + esc(r.category) + ' <span style="color:#9ca3af;font-size:11px">(' + r.count + ' حركة)</span></span>' +
        '<span style="font-weight:800;color:' + typeColor + ';font-size:13px">' + fmt(r.total) + ' ج.م <span style="color:#9ca3af;font-size:11px">' + pct + '%</span></span>' +
        '</div>' +
        '<div style="height:6px;background:#f3f4f6;border-radius:10px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + typeColor + ';border-radius:10px;transition:width .4s"></div>' +
        '</div></div>';
    }).join('') +
    '<div style="border-top:2px solid #f3f4f6;padding-top:10px;margin-top:6px;display:flex;justify-content:space-between;font-size:14px;font-weight:800">' +
    '<span>إجمالي ' + typeLabel + '</span>' +
    '<span style="color:' + typeColor + '">' + fmt(grand) + ' ج.م</span></div>';
}


