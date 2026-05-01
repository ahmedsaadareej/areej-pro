// ── DASHBOARD HOMEPAGE ──

function openQuickExpense() {
  document.getElementById('quickExpenseModal').classList.remove('hidden');
  // Load wallets into select
  sysGet('/wallets').then(d => {
    if (!d.ok) return;
    const sel = document.getElementById('qe-wallet');
    sel.innerHTML = '<option value="">— اختار خزينة —</option>';
    (d.data||d.wallets||[]).forEach(w => {
      sel.innerHTML += '<option value="'+w.id+'">'+esc(w.name)+'</option>';
    });
  });
}

async function saveQuickExpense() {
  const amount = parseFloat(document.getElementById('qe-amount').value);
  const note = document.getElementById('qe-note').value.trim();
  const wallet_id = document.getElementById('qe-wallet').value;
  if (!amount || amount <= 0) { showToast('أدخل مبلغ صحيح'); return; }
  if (!wallet_id) { showToast('اختار خزينة'); return; }
  const r = await apiFetch('/api/system/transactions', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: parseInt(wallet_id), type: 'out', amount, description: note || 'مصروف سريع', category: 'مصاريف ثابتة' })
  });
  if (r.ok) {
    showToast('✅ تم تسجيل المصروف');
    closeModal('quickExpenseModal');
    document.getElementById('qe-amount').value = '';
    document.getElementById('qe-note').value = '';
    loadDashboard();
  } else {
    showToast('❌ خطأ: ' + (r.error||'?'));
  }
}

function openGoalModal() {
  const current = localStorage.getItem('areej_goal') || '';
  document.getElementById('goal-amount').value = current;
  document.getElementById('goalModal').classList.remove('hidden');
}

function saveGoal() {
  const val = parseFloat(document.getElementById('goal-amount').value);
  if (!val || val <= 0) { showToast('أدخل هدف صحيح'); return; }
  localStorage.setItem('areej_goal', val);
  closeModal('goalModal');
  updateGoalTracker(val, null);
  showToast('✅ تم حفظ الهدف');
}

function updateGoalTracker(goal, revenue) {
  if (!goal) goal = parseFloat(localStorage.getItem('areej_goal')) || 0;
  const g = document.getElementById('dash-goal-target');
  const c = document.getElementById('dash-goal-current');
  const bar = document.getElementById('dash-goal-bar');
  const note = document.getElementById('dash-goal-note');
  if (!goal) {
    if (g) g.textContent = 'هدف: غير محدد';
    if (note) note.textContent = 'اضغط تعديل لتحديد هدف الشهر';
    return;
  }
  const rev = revenue !== null ? revenue : 0;
  const pct = Math.min(100, Math.round((rev / goal) * 100));
  const remaining = Math.max(0, goal - rev);
  if (g) g.textContent = 'هدف: ' + fmt(goal) + ' ج.م';
  if (c) c.textContent = fmt(rev) + ' ج.م';
  if (bar) bar.style.width = pct + '%';
  if (note) {
    if (pct >= 100) note.textContent = '🎉 أنت وصلت هدفك!';
    else note.textContent = 'باقي ' + fmt(remaining) + ' ج.م (' + pct + '%)';
  }
}

async function loadActivityFeed() {
  const el = document.getElementById('dash-activity-feed');
  if (!el) return;
  const [orders, invoices] = await Promise.all([
    sysGet('/orders?limit=5'),
    sysGet('/invoices?limit=5')
  ]);
  const items = [];
  if (orders.ok) {
    (orders.data||[]).slice(0,3).forEach(o => {
      items.push({ icon:'📦', text:'أوردر جديد — ' + esc(o.client_name||'عميل'), time: o.created_at, color:'#F5A623' });
    });
  }
  if (invoices.ok) {
    (invoices.invoices||[]).slice(0,3).forEach(inv => {
      if (inv.status === 'paid') {
        items.push({ icon:'✅', text:'فاتورة مدفوعة — ' + fmt(inv.total) + ' ج.م', time: inv.created_at, color:'#16a34a' });
      }
    });
  }
  items.sort((a,b) => new Date(b.time) - new Date(a.time));
  if (!items.length) {
    el.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">لا يوجد نشاط حديث</div>';
    return;
  }
  el.innerHTML = items.slice(0,6).map(item => {
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:'+item.color+'20;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">'+item.icon+'</div>'
      + '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:#1a1a1a">'+item.text+'</div>'
      + '<div style="font-size:10px;color:#9ca3af">'+timeAgo(item.time)+'</div></div></div>';
  }).join('');
}

// ── DASHBOARD ──
const ORD_STATUS_MINI = { new:'جديد', preparing:'تجهيز', shipped:'شحن', delivered:'تسليم', cancelled:'ملغي', returned:'مرتجع' };
const ORD_CLS_MINI = { new:'badge-prospect', preparing:'badge-cold', shipped:'badge-vip', delivered:'badge-client', cancelled:'badge-out', returned:'badge-cold' };

async function loadDashboard() {
  // Set welcome message
  const nameEl = document.getElementById('dash-welcome-name');
  const dateEl = document.getElementById('dash-welcome-date');
  if (nameEl) {
    const storedName = localStorage.getItem('areej_company') || localStorage.getItem('areej_user_name') || '';
    nameEl.textContent = storedName;
  }
  if (dateEl) {
    const now = new Date();
    const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    dateEl.textContent = days[now.getDay()] + ' — ' + now.toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'});
  }

  // Also fetch treasury summary in parallel
  const [d, dt] = await Promise.all([sysGet('/dashboard'), sysGet('/wallets/summary')]);
  if (!d.ok) return;
  // Treasury mini widget
  if (dt.ok) {
    const ts = dt.data;
    const el = id => document.getElementById(id);
    if (el('dash-treas-liquid')) el('dash-treas-liquid').textContent = fmt(ts.liquid) + ' ج';
    if (el('dash-treas-recv'))   el('dash-treas-recv').textContent   = fmt(ts.receivable) + ' ج';
    if (el('dash-treas-net'))    el('dash-treas-net').textContent    = fmt(ts.net) + ' ج';
  }
  // Load trend chart + activity feed
  setTimeout(loadTrendChart, 300);
  setTimeout(loadActivityFeed, 100);
  const data = d.data;
  const el = id => document.getElementById(id);

  // KPI cards
  if (el('dash-today-rev')) el('dash-today-rev').textContent = fmt(data.invoices.month_revenue);
  if (el('dash-month-rev')) el('dash-month-rev').textContent = fmt(data.invoices.month_revenue) + ' ج';
  el('dash-new-orders').textContent = data.orders.new_orders;
  el('dash-clients').textContent = data.crm.clients;
  el('dash-low-stock').textContent = data.inventory.low_stock;

  // Onboarding banner — show if system is empty
  const isEmpty = data.invoices.total === 0 && data.orders.total === 0 && data.crm.clients === 0 && data.inventory.total === 0;
  const onbEl = el('dash-onboarding');
  if (onbEl) onbEl.style.display = isEmpty ? 'block' : 'none';

  // Goal tracker
  updateGoalTracker(null, data.invoices.month_revenue);

  // Hidden elements — safe guard
  if (el('dash-stock-val')) el('dash-stock-val').textContent = fmt(data.inventory.stock_value);
  if (el('dash-aff')) el('dash-aff').textContent = data.affiliates.active;
  if (el('dash-aff-comm')) el('dash-aff-comm').textContent = fmt(data.affiliates.pending_comm) + ' ج.م';
  if (el('dash-shipped')) el('dash-shipped').textContent = data.orders.shipped;
  if (el('dash-followup')) el('dash-followup').textContent = data.followup_needed;

  // Recent orders
  const roEl = el('dash-recent-orders');
  roEl.innerHTML = data.recent_orders.length ? data.recent_orders.map(o =>
    '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px">' +
    '<div style="flex:1"><strong>'+esc(o.order_no)+'</strong><br><span style="color:#9ca3af;font-size:11px">'+esc(o.client_name)+'</span></div>' +
    '<div style="font-weight:700;color:var(--brand,#1B5E30)">'+fmt(o.total)+' ج.م</div>' +
    '<span class="badge '+(ORD_CLS_MINI[o.status]||'')+'">'+( ORD_STATUS_MINI[o.status]||o.status)+'</span>' +
    '</div>'
  ).join('') : '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">لا توجد طلبات بعد</div>';

  // Top clients
  const tcEl = el('dash-top-clients');
  tcEl.innerHTML = data.top_clients.length ? data.top_clients.map((c,i) =>
    '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;cursor:pointer" onclick="openClientProfile('+c.id+',\''+esc(c.name)+'\')">'+
    '<div style="width:24px;height:24px;border-radius:50%;background:var(--brand,#1B5E30);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">'+(i+1)+'</div>' +
    '<div style="flex:1"><strong>'+esc(c.name)+'</strong><br><span style="color:#9ca3af;font-size:11px">'+c.order_count+' طلب ← اضغط للبروفايل</span></div>' +
    '<div style="font-weight:700;color:#F5A623">'+fmt(c.total_spent)+' ج.م</div>' +
    '</div>'
  ).join('') : '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">لا توجد بيانات بعد</div>';

  // Low stock
  const lsBox = el('dash-low-stock-box');
  const lsList = el('dash-low-stock-list');
  if (!data.low_stock.length) { lsBox.style.display='none'; }
  else {
    lsBox.style.display='block';
    lsList.innerHTML = data.low_stock.map(p =>
      '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #fef2f2;font-size:13px">' +
      '<div style="flex:1">'+esc(p.name)+'</div>' +
      '<div style="color:#ef4444;font-weight:700">'+p.stock_qty+' / '+p.low_stock_at+' متبقي</div>' +
      '<button class="btn btn-sm" style="background:#fee2e2;color:#ef4444;border:none;font-size:11px" onclick="showPage(\'suppliers\',document.querySelector(\'[onclick*=suppliers]\'))">+ طلب شراء</button>' +
      '</div>'
    ).join('');
  }
}


// ── AFFILIATES ──
let affiliatesCache = [];
let currentAff = null;
