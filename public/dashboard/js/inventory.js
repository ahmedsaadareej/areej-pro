// ── INVENTORY ──
let invSearchTimer = null;
let currentProduct = null;
let allCategories = new Set();

// init() defined at end of file

async function loadStats() {
  const d = await sysGet('/stats');
  if (!d.ok) return;
  const s = d.data;
  document.getElementById('s-total').textContent = s.total_products;
  document.getElementById('s-value').textContent = fmt(s.stock_value) + ' ج.م';
  document.getElementById('s-revenue').textContent = fmt(s.potential_revenue) + ' ج.م';
  document.getElementById('s-profit').textContent = fmt(s.estimated_profit) + ' ج.م';
  document.getElementById('s-low').textContent = s.low_stock;

  // Categories
  const catSel = document.getElementById('invCatFilter');
  const prev = catSel.value;
  catSel.innerHTML = '<option value="">كل الفئات</option>';
  s.categories.forEach(c => {
    if (c.category) {
      catSel.innerHTML += '<option value="'+esc(c.category)+'">'+esc(c.category)+' ('+c.n+')</option>';
    }
  });
  if (prev) catSel.value = prev;
}

async function loadInventory() {
  const tbody = document.getElementById('invTbody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#9ca3af">جارٍ التحميل...</td></tr>';
  const search = document.getElementById('invSearch').value;
  const cat = document.getElementById('invCatFilter').value;
  const low = document.getElementById('lowStockOnly').checked ? '1' : '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (cat) params.set('category', cat);
  if (low) params.set('low_stock', '1');

  const d = await sysGet('/products?' + params);
  if (!d.ok) { tbody.innerHTML = '<tr><td colspan="8" style="color:red;text-align:center;padding:20px">خطأ</td></tr>'; return; }
  if (!d.data.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af">لا توجد منتجات</td></tr>'; return; }

  tbody.innerHTML = d.data.map(p => {
    const badge = p.stock_qty === 0
      ? '<span class="badge badge-out">نفد</span>'
      : p.is_low_stock ? '<span class="badge badge-low">منخفض</span>'
      : '<span class="badge badge-ok">متاح</span>';
    return `<tr style="cursor:pointer" onclick="openProductDetail(${p.id})">
      <td><strong>${esc(p.name)}</strong>${p.sku ? '<br><small style="color:#9ca3af">'+esc(p.sku)+'</small>' : ''}</td>
      <td>${esc(p.category||'—')}</td>
      <td><strong>${p.stock_qty}</strong> ${esc(p.unit)}</td>
      <td>${fmt(p.cost_price)} ج.م</td>
      <td>${fmt(p.sell_price)} ج.م</td>
      <td>${fmt(p.stock_value)} ج.م</td>
      <td>${badge}</td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-outline" onclick="openMoveForId(${p.id},'${esc(p.name)}')">📦 تحديث</button>
        <button class="btn btn-sm btn-primary" onclick="openProductDetail(${p.id})">عرض</button>
      </div></td>
    </tr>`;
  }).join('');
}

function debounceInv() {
  clearTimeout(invSearchTimer);
  invSearchTimer = setTimeout(loadInventory, 400);
}

// ── PRODUCT CATEGORIES ──
let categoriesCache = [];

async function loadCategoriesIntoSelect(selectedVal) {
  const d = await apiFetch('/api/system/categories');
  categoriesCache = d.categories || [];
  const sel = document.getElementById('fp-category');
  if (!sel) return;
  const current = selectedVal || sel.value;
  sel.innerHTML = '<option value="">— بدون فئة —</option>'
    + categoriesCache.map(c => '<option value="'+esc(c.name)+'"'+(c.name===current?' selected':'')+'>'+esc(c.name)+'</option>').join('');
}

async function openCategoriesManager() {
  document.getElementById('categoriesModal').classList.remove('hidden');
  await renderCategoriesList();
}

async function renderCategoriesList() {
  const d = await apiFetch('/api/system/categories');
  categoriesCache = d.categories || [];
  const el = document.getElementById('categories-list');
  if (!categoriesCache.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">لا توجد فئات — أضف أول فئة</div>'; return; }
  el.innerHTML = categoriesCache.map(c =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6">'
    + '<span style="font-size:13px;font-weight:600">🏷️ '+esc(c.name)+'</span>'
    + '<button onclick="deleteCategory('+c.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">🗑️</button>'
    + '</div>'
  ).join('');
  // Refresh dropdown in product modal
  await loadCategoriesIntoSelect();
}

async function addCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) return;
  const d = await apiFetch('/api/system/categories', { method:'POST', body: JSON.stringify({ name }) });
  if (d.ok) {
    document.getElementById('new-cat-name').value = '';
    await renderCategoriesList();
    showToast('✅ أضيفت الفئة: ' + name);
  } else {
    showToast('❌ ' + (d.error||'خطأ'));
  }
}

async function deleteCategory(id) {
  if (!confirm('حذف الفئة؟')) return;
  await apiFetch('/api/system/categories/'+id, { method:'DELETE' });
  await renderCategoriesList();
}

function generateSKU() {
  const name = document.getElementById('fp-name').value.trim();
  const category = document.getElementById('fp-category').value.trim();
  const prefix = (category || name).substring(0,3).toUpperCase().replace(/\s/g,'') || 'PRD';
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  const ts = Date.now().toString().slice(-3);
  document.getElementById('fp-sku').value = prefix + '-' + num;
}

async function checkProductName(name, excludeId) {
  const params = '?name=' + encodeURIComponent(name) + (excludeId ? '&exclude_id='+excludeId : '');
  const d = await apiFetch('/api/system/products/check-name' + params);
  return d.exists;
}

// ── ADD / EDIT PRODUCT ──
async function openAddProduct() {
  document.getElementById('productModalTitle').textContent = 'إضافة منتج جديد';
  document.getElementById('editProductId').value = '';
  ['fp-name','fp-sku','fp-notes'].forEach(id => document.getElementById(id).value = '');
  ['fp-cost','fp-sell','fp-low'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fp-qty').value = '0';
  document.getElementById('fp-unit').value = 'قطعة';
  await loadCategoriesIntoSelect('');
  document.getElementById('productModal').classList.remove('hidden');
  // Auto-generate SKU on name input
  const nameEl = document.getElementById('fp-name');
  nameEl.oninput = function() {
    if (!document.getElementById('fp-sku').value) generateSKU();
  };
}

async function openEditProduct() {
  if (!currentProduct) return;
  const p = currentProduct;
  document.getElementById('productModalTitle').textContent = 'تعديل: ' + p.name;
  document.getElementById('editProductId').value = p.id;
  document.getElementById('fp-name').value = p.name || '';
  document.getElementById('fp-sku').value = p.sku || '';
  await loadCategoriesIntoSelect(p.category || '');
  document.getElementById('fp-unit').value = p.unit || 'قطعة';
  document.getElementById('fp-cost').value = p.cost_price || '';
  document.getElementById('fp-sell').value = p.sell_price || '';
  document.getElementById('fp-qty').value = p.stock_qty || 0;
  document.getElementById('fp-low').value = p.low_stock_at || 5;
  document.getElementById('fp-notes').value = p.notes || '';
  document.getElementById('productModal').classList.remove('hidden');
}

async function saveProduct() {
  const id = document.getElementById('editProductId').value;
  const body = {
    name: document.getElementById('fp-name').value.trim(),
    sku: document.getElementById('fp-sku').value.trim() || null,
    category: document.getElementById('fp-category').value.trim() || null,
    unit: document.getElementById('fp-unit').value,
    cost_price: +document.getElementById('fp-cost').value || 0,
    sell_price: +document.getElementById('fp-sell').value || 0,
    stock_qty: +document.getElementById('fp-qty').value || 0,
    low_stock_at: +document.getElementById('fp-low').value || 5,
    notes: document.getElementById('fp-notes').value.trim() || null
  };
  if (!body.name) { showToast('اسم المنتج مطلوب'); return; }

  // تحقق من عدم تكرار الاسم
  const nameExists = await checkProductName(body.name, id || null);
  if (nameExists) {
    showToast('❌ منتج بنفس الاسم موجود بالفعل — اختار اسماً مختلفاً');
    document.getElementById('fp-name').focus();
    return;
  }

  // لو ما فيش SKU — ولّد تلقائياً
  if (!body.sku) {
    const prefix = (body.category || body.name).substring(0,3).toUpperCase().replace(/\s/g,'') || 'PRD';
    body.sku = prefix + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  }

  const d = id
    ? await sysPut('/products/' + id, body)
    : await sysPost('/products', body);

  if (d.ok) {
    closeModal('productModal');
    await Promise.all([loadStats(), loadInventory()]);
    if (id) await openProductDetail(+id);
  } else showToast('❌ خطأ: ' + (d.error||'?'));
}

// ── PRODUCT DETAIL ──
async function openProductDetail(id) {
  const d = await sysGet('/products/' + id);
  if (!d.ok) return;
  currentProduct = d.data;
  renderProductDetail(d.data);
  document.getElementById('productSlide').classList.remove('hidden');
}

function renderProductDetail(p) {
  // Image
  const imgEl = document.getElementById('dp-img');
  if (imgEl) {
    if (p.image_url) {
      imgEl.src = p.image_url;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }
  }

  document.getElementById('dp-name').textContent = p.name;
  document.getElementById('dp-qty').textContent  = p.stock_qty + ' ' + (p.unit||'');
  document.getElementById('dp-cost').textContent = fmt(p.cost_price) + ' ج.م';
  document.getElementById('dp-sell').textContent = fmt(p.sell_price) + ' ج.م';
  document.getElementById('dp-value').textContent = fmt(p.stock_qty * p.cost_price) + ' ج.م';
  document.getElementById('dp-sku').textContent  = p.sku || '—';
  document.getElementById('dp-cat').textContent  = p.category || '—';
  document.getElementById('dp-unit').textContent = p.unit || '—';
  document.getElementById('dp-low').textContent  = p.low_stock_at + ' ' + (p.unit||'');
  document.getElementById('dp-notes').textContent = p.notes || '—';

  // Moves with invoice links
  const typeIcons = { in:'📥', out:'📤', adjust:'🔧', return:'↩️' };
  const typeLabels = { in:'إضافة', out:'صرف', adjust:'تعديل', return:'مرتجع' };
  const typeColors = { in:'#16a34a', out:'#ef4444', adjust:'#F5A623', return:'#8b5cf6' };
  const moves = p.moves || [];

  const movesEl = document.getElementById('dp-moves');
  if (!moves.length) {
    movesEl.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:16px">لا توجد حركات مخزون</div>';
    return;
  }

  movesEl.innerHTML = moves.map(m => {
    const icon  = typeIcons[m.type]  || '📌';
    const label = typeLabels[m.type] || m.type;
    const color = typeColors[m.type] || '#9ca3af';
    const sign  = m.type === 'in' || m.type === 'return' ? '+' : '-';

    // Reference: invoice or PO link
    let refHtml = '';
    if (m.ref_type === 'invoice' && m.invoice_no) {
      const invId = m.ref_id;
      refHtml = '<span onclick="openInvoiceDetail('+invId+')" style="cursor:pointer;color:#2563eb;font-size:10px;text-decoration:underline">🧾 '+esc(m.invoice_no)+'</span>';
    } else if (m.ref_type === 'po' && m.po_no) {
      refHtml = '<span style="color:#6b7280;font-size:10px">📋 '+esc(m.po_no)+'</span>';
    } else if (m.notes) {
      refHtml = '<span style="color:#9ca3af;font-size:10px">'+esc(m.notes.substring(0,30))+'</span>';
    }

    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">'
      + '<div style="width:30px;height:30px;border-radius:50%;background:'+color+'20;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">'+icon+'</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="font-size:12px;font-weight:700;color:'+color+'">'+sign+(m.qty||0)+' '+esc(p.unit||'')+' — '+label+'</span>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-top:2px">'+refHtml
      + (m.unit_cost ? '<span style="color:#9ca3af;font-size:10px">| '+fmt(m.unit_cost)+' ج/وحدة</span>' : '')
      + '</div>'
      + '</div>'
      + '<div style="font-size:10px;color:#9ca3af;flex-shrink:0">'+(m.created_at||'').substring(0,10)+'</div>'
      + '</div>';
  }).join('');
}

// ── PRODUCT IMAGE ──
async function uploadProductImage(input) {
  if (!currentProduct || !input.files[0]) return;
  const formData = new FormData();
  formData.append('image', input.files[0]);
  showToast('جاري رفع الصورة...');
  const r = await fetch('/api/system/products/'+currentProduct.id+'/image', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body: formData
  }).then(r=>r.json());
  if (r.ok) {
    showToast('✅ تم رفع الصورة');
    const img = document.getElementById('dp-img');
    if (img) { img.src = r.url + '?t=' + Date.now(); img.style.display = 'block'; }
    currentProduct.image_url = r.url;
  } else {
    showToast('❌ ' + (r.error||'خطأ في الرفع'));
  }
}

// ── STOCK MOVE ──
function openMoveModal() {
  if (!currentProduct) return;
  document.getElementById('moveProductName').textContent = currentProduct.name;
  document.getElementById('moveProductId').value = currentProduct.id;
  document.getElementById('move-type').value = 'in';
  document.getElementById('move-qty').value = '';
  document.getElementById('move-cost').value = '';
  document.getElementById('move-notes').value = '';
  document.getElementById('moveModal').classList.remove('hidden');
}

function openMoveForId(id, name) {
  currentProduct = { id, name };
  openMoveModal();
}

async function saveMove() {
  const pid = document.getElementById('moveProductId').value;
  const qty = +document.getElementById('move-qty').value;
  if (!qty || qty <= 0) { alert('أدخل كمية صحيحة'); return; }
  const body = {
    type: document.getElementById('move-type').value,
    qty,
    unit_cost: +document.getElementById('move-cost').value || undefined,
    notes: document.getElementById('move-notes').value.trim() || undefined
  };
  const d = await sysPost('/products/' + pid + '/move', body);
  if (d.ok) {
    closeModal('moveModal');
    await Promise.all([loadStats(), loadInventory()]);
    await openProductDetail(+pid);
  } else alert('خطأ: ' + d.error);
}

async function deleteProduct() {
  if (!currentProduct) return;
  if (!confirm('حذف ' + currentProduct.name + ' نهائياً؟')) return;
  await sysDel('/products/' + currentProduct.id);
  document.getElementById('productSlide').classList.add('hidden');
  await Promise.all([loadStats(), loadInventory()]);
}

// ── PRICING ──
async function loadPricingProducts() {
  const d = await sysGet('/products');
  if (!d.ok) return;
  const sel = document.getElementById('pricingProduct');
  sel.innerHTML = '<option value="">— أدخل التكلفة يدوياً —</option>';
  d.data.forEach(p => {
    sel.innerHTML += '<option value="'+p.id+'" data-cost="'+p.cost_price+'">'+esc(p.name)+' ('+fmt(p.cost_price)+' ج.م)</option>';
  });
}

function loadProductCost() {
  const sel = document.getElementById('pricingProduct');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cost) {
    document.getElementById('pCost').value = opt.dataset.cost;
    calcPricing();
  }
}

function calcPricing() {
  const cost = +document.getElementById('pCost').value || 0;
  const print = +document.getElementById('pPrint').value || 0;
  const ship = +document.getElementById('pShipping').value || 0;
  const fixed = +document.getElementById('pFixed').value || 0;
  const margin = +document.getElementById('pMargin').value / 100;

  const total_cost = cost + print + ship + fixed;
  if (total_cost <= 0) { document.getElementById('calcResult').classList.add('hidden'); return; }

  const sell_price = total_cost / (1 - margin);
  const profit = sell_price - total_cost;

  document.getElementById('calcResult').classList.remove('hidden');
  document.getElementById('r-cost').textContent = fmt(total_cost) + ' ج.م';
  document.getElementById('r-margin').textContent = (+document.getElementById('pMargin').value) + '%';
  document.getElementById('r-profit').textContent = fmt(profit) + ' ج.م';
  document.getElementById('r-price').textContent = fmt(Math.ceil(sell_price / 5) * 5) + ' ج.م';
}

