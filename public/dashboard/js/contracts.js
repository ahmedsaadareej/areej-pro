// ============================================================
// TREASURY — الخزينة
// ============================================================
let walletsCache = [];
let txPage = 1;

async function loadTreasury() {
  await Promise.all([loadWalletSummary(), loadWallets(), loadTransactions()]);
  loadExpenseReport();
  setTxType('in');
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tx-date').value = today;
}

async function loadWalletSummary() {
  const d = await sysGet('/wallets/summary');
  if (!d.ok) return;
  const s = d.data;
  document.getElementById('treas-liquid').textContent = fmt(s.liquid) + ' ج.م';
  document.getElementById('treas-recv').textContent   = fmt(s.receivable) + ' ج.م';
  document.getElementById('treas-pay').textContent    = fmt(s.payable) + ' ج.م';
  document.getElementById('treas-net').textContent    = fmt(s.net) + ' ج.م';
  document.getElementById('treas-net').style.color    = s.net >= 0 ? 'var(--brand,#1B5E30)' : '#dc2626';
}

async function loadWallets() {
  const d = await sysGet('/wallets');
  if (!d.ok) return;
  walletsCache = d.data;
  // render list
  const el = document.getElementById('wallets-list');
  if (!el) return;
  if (!walletsCache.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">لا توجد خزائن</div>'; return; }
  const WALLET_ICONS = { cash:'💵', ewallet:'📲', bank:'🏦', shipping_co:'🚚', receivable:'📥', payable:'📤' };
  const WALLET_COLORS = { cash:'#16a34a', ewallet:'#8b5cf6', bank:'#2563eb', shipping_co:'#F5A623', receivable:'#3b82f6', payable:'#ef4444' };
  el.innerHTML = walletsCache.map(w => {
    const icon = w.icon || WALLET_ICONS[w.type] || '💰';
    const color = w.color || WALLET_COLORS[w.type] || '#1B5E30';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f4f6;cursor:pointer" onclick="openWalletStatement('+w.id+',\''+esc(w.name)+'\')" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<div style="width:38px;height:38px;border-radius:50%;background:'+color+'22;display:flex;align-items:center;justify-content:center;font-size:18px">'+icon+'</div>' +
    '<div><div style="font-weight:700;font-size:13px">'+esc(w.name)+'</div>' +
    '<div style="font-size:11px;color:#9ca3af">'+walletTypeLabel(w.type)+' — اضغط للتفاصيل</div></div></div>' +
    '<div style="text-align:left">' +
    '<div style="font-weight:800;font-size:15px;color:'+(w.computed_balance >= 0 ? 'var(--brand,#1B5E30)' : '#dc2626')+'">'+fmt(w.computed_balance||0)+' ج.م</div>' +
    '<button onclick="event.stopPropagation();openEditWallet('+w.id+')" style="font-size:10px;color:#9ca3af;background:none;border:none;cursor:pointer">✏️ تعديل</button>' +
    '</div></div>';
  }).join('');
  // populate selects
  const walletOpts = ['<option value="">اختر...</option>'].concat(walletsCache.map(w => '<option value="' + w.id + '">' + w.icon + ' ' + esc(w.name) + '</option>')).join('');
  ['tx-wallet','tx-wallet-to','tx-filter-wallet'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.innerHTML = id === 'tx-filter-wallet' ? '<option value="">كل الخزائن</option>' + walletsCache.map(w => '<option value="' + w.id + '">' + w.icon + ' ' + esc(w.name) + '</option>').join('') : walletOpts;
  });
}

function walletTypeLabel(type) {
  const m = { cash:'نقدي', ewallet:'محفظة إلكترونية', shipping_co:'شركة شحن', receivable:'ذمم مدينة', payable:'ذمم دائنة', bank:'بنك' };
  return m[type] || type;
}

async function loadTransactions() {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;
  const wid      = document.getElementById('tx-filter-wallet')?.value || '';
  const type     = document.getElementById('tx-filter-type')?.value || '';
  const from     = document.getElementById('tx-from')?.value || '';
  const to       = document.getElementById('tx-to')?.value || '';
  const category = document.getElementById('tx-filter-category')?.value || '';
  const params = new URLSearchParams({ limit:20, page:txPage });
  if (wid)      params.set('wallet_id', wid);
  if (type)     params.set('type', type);
  if (from)     params.set('from', from);
  if (to)       params.set('to', to);
  if (category) params.set('category', category);
  const d = await sysGet('/transactions?' + params);
  if (!d.ok) return;
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">لا توجد حركات</td></tr>'; return; }
  const typeStyle = { in:'background:#dcfce7;color:#166534', out:'background:#fee2e2;color:#dc2626', transfer:'background:#e0f2fe;color:#0369a1' };
  const typeLabel = { in:'📥 وارد', out:'📤 صادر', transfer:'🔄 تحويل' };
  tbody.innerHTML = d.data.map(t =>
    '<tr>' +
    '<td style="color:#9ca3af;font-size:12px">' + (t.date||'').substring(0,10) + '</td>' +
    '<td><span style="font-weight:600">' + esc(t.description) + '</span>' + (t.wallet_to_name ? '<br><small style="color:#9ca3af">→ ' + esc(t.wallet_to_name) + '</small>' : '') + (t.notes ? '<br><small style="color:#9ca3af">' + esc(t.notes) + '</small>' : '') + '</td>' +
    '<td>' + (t.category ? '<span style="background:#f3f4f6;border-radius:20px;padding:2px 8px;font-size:11px">' + esc(t.category) + '</span>' : '<span style="color:#d1d5db;font-size:11px">—</span>') + '</td>' +
    '<td>' + (t.wallet_icon||'') + ' ' + esc(t.wallet_name||'') + '</td>' +
    '<td><span class="badge" style="' + (typeStyle[t.type]||'') + '">' + (typeLabel[t.type]||t.type) + '</span></td>' +
    '<td style="font-weight:800;color:' + (t.type==='in'?'var(--brand,#1B5E30)':t.type==='out'?'#dc2626':'#0369a1') + '">' + (t.type==='in'?'+':t.type==='out'?'-':'') + fmt(t.amount) + ' ج.م</td>' +
    '<td><button onclick="deleteTx(' + t.id + ')" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:12px">🗑️</button></td>' +
    '</tr>'
  ).join('');
  // pagination
  const pages = d.pages || 1;
  const pgEl = document.getElementById('tx-pagination');
  if (pgEl && pages > 1) {
    pgEl.innerHTML = Array.from({length:pages},(_,i) => '<button class="btn btn-sm ' + (i+1===txPage?'btn-primary':'btn-outline') + '" onclick="txPage=' + (i+1) + ';loadTransactions()">' + (i+1) + '</button>').join('');
  } else if (pgEl) pgEl.innerHTML = '';
}

function setTxType(type) {
  document.getElementById('tx-type').value = type;
  const styles = { in:'background:#dcfce7;color:#166534', out:'background:#fee2e2;color:#dc2626', transfer:'background:#e0f2fe;color:#0369a1' };
  ['in','out','transfer'].forEach(t => {
    const btn = document.getElementById('tx-' + t + '-btn');
    if (btn) btn.style.cssText = 'flex:1;border:none;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;font-family:Cairo,sans-serif;font-size:13px;' + (t===type ? styles[t] : 'background:#f3f4f6;color:#374151');
  });
  const toWrap = document.getElementById('tx-to-wrap');
  if (toWrap) toWrap.style.display = type === 'transfer' ? 'block' : 'none';
  // hide category + notes for transfers (internal movement, no classification needed)
  const catWrap  = document.getElementById('tx-category-wrap');
  const notesWrap = document.getElementById('tx-notes-wrap');
  if (catWrap)   catWrap.style.display   = type === 'transfer' ? 'none' : 'block';
  if (notesWrap) notesWrap.style.display = type === 'transfer' ? 'none' : 'block';
  // update wallet label to reflect direction
  const walletLbl = document.getElementById('tx-wallet-label');
  if (walletLbl) {
    if (type === 'in')       walletLbl.textContent = 'إلى خزينة (تدخل فيها)';
    else if (type === 'out') walletLbl.textContent = 'من خزينة (تخرج منها)';
    else                     walletLbl.textContent = 'من خزينة';
  }
}

async function saveTx() {
  const type = document.getElementById('tx-type').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const wallet_id = document.getElementById('tx-wallet').value;
  const wallet_to_id = document.getElementById('tx-wallet-to')?.value || null;
  const description = document.getElementById('tx-desc').value.trim();
  const date = document.getElementById('tx-date').value;
  if (!amount || amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  if (!wallet_id) { alert('اختر الخزينة'); return; }
  if (!description) { alert('أدخل البيان'); return; }
  if (type === 'transfer' && !wallet_to_id) { alert('اختر الخزينة المستهدفة'); return; }
  const category = document.getElementById('tx-category')?.value || null;
  const notes    = document.getElementById('tx-notes')?.value.trim() || null;
  const d = await sysPost('/transactions', { type, amount, wallet_id, wallet_to_id, description, date, category, notes });
  if (d.ok) {
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-desc').value = '';
    if (document.getElementById('tx-category')) document.getElementById('tx-category').value = '';
    if (document.getElementById('tx-notes')) document.getElementById('tx-notes').value = '';
    await loadTreasury();
    // update dashboard if visible
    if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboard();
  } else alert('خطأ: ' + d.error);
}

async function deleteTx(id) {
  if (!confirm('حذف هذه الحركة؟')) return;
  await sysDel('/transactions/' + id);
  await loadTreasury();
}

function openAddWallet() {
  document.getElementById('wallet-id').value = '';
  document.getElementById('wallet-name').value = '';
  document.getElementById('wallet-type').value = 'cash';
  document.getElementById('wallet-icon').value = '💰';
  document.getElementById('wallet-color').value = 'var(--brand,#1B5E30)';
  document.getElementById('wallet-notes').value = '';
  document.getElementById('walletModal-title').textContent = 'خزينة جديدة';
  document.getElementById('walletModal').classList.remove('hidden');
}

function openEditWallet(id) {
  const w = walletsCache.find(x => x.id === id);
  if (!w) return;
  document.getElementById('wallet-id').value = w.id;
  document.getElementById('wallet-name').value = w.name;
  document.getElementById('wallet-type').value = w.type;
  document.getElementById('wallet-icon').value = w.icon || '💰';
  document.getElementById('wallet-color').value = w.color || 'var(--brand,#1B5E30)';
  document.getElementById('wallet-notes').value = w.notes || '';
  document.getElementById('walletModal-title').textContent = 'تعديل: ' + w.name;
  document.getElementById('walletModal').classList.remove('hidden');
}

async function saveWallet() {
  const id = document.getElementById('wallet-id').value;
  const body = {
    name:  document.getElementById('wallet-name').value.trim(),
    type:  document.getElementById('wallet-type').value,
    icon:  document.getElementById('wallet-icon').value.trim() || '💰',
    color: document.getElementById('wallet-color').value,
    notes: document.getElementById('wallet-notes').value.trim()
  };
  if (!body.name) { alert('أدخل اسم الخزينة'); return; }
  const d = id ? await sysPut('/wallets/' + id, body) : await sysPost('/wallets', body);
  if (d.ok) { closeModal('walletModal'); await loadTreasury(); }
  else alert('خطأ: ' + d.error);
}


