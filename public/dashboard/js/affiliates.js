
async function loadAffiliates() {
  const d = await sysGet('/affiliates');
  if (!d.ok) return;
  affiliatesCache = d.data;
  // stats
  const el = id => document.getElementById(id);
  if(el('aff-active')) el('aff-active').textContent = d.stats.active;
  if(el('aff-sales')) el('aff-sales').textContent = fmt(d.stats.total_sales);
  if(el('aff-pending')) el('aff-pending').textContent = fmt(d.stats.pending_commission);

  const container = document.getElementById('affList');
  if (!d.data.length) { container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#9ca3af"><div style="font-size:48px;margin-bottom:12px">🤝</div><div style="font-size:16px;font-weight:700">لا يوجد موزعين بعد</div><button class="btn btn-primary" style="margin-top:16px" onclick="openAddAffiliate()">+ أضف أول موزع</button></div>'; return; }
  container.innerHTML = d.data.map(a =>
    '<div style="background:#fff;border-radius:14px;padding:18px;border:1.5px solid #e5e7eb;cursor:pointer" onclick="openAffDetail('+a.id+')">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:800">'+esc(a.name)+'</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-top:2px">'+(a.city||'')+(a.whatsapp?' · '+a.whatsapp:'')+'</div>' +
      '</div>' +
      '<span class="badge '+(a.status==='active'?'badge-client':'badge-cold')+'">'+( a.status==='active'?'نشط':'متوقف')+'</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">' +
      '<div style="background:#f9fafb;border-radius:8px;padding:8px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--brand,#1B5E30)">'+a.order_count+'</div><div style="font-size:11px;color:#9ca3af">طلب</div></div>' +
      '<div style="background:#f9fafb;border-radius:8px;padding:8px;text-align:center"><div style="font-size:14px;font-weight:800;color:var(--brand,#1B5E30)">'+fmt(a.total_sales)+'</div><div style="font-size:11px;color:#9ca3af">مبيعات</div></div>' +
      '<div style="background:'+(a.pending_commission>0?'#fef9c3':'#f9fafb')+';border-radius:8px;padding:8px;text-align:center"><div style="font-size:14px;font-weight:800;color:#F5A623">'+fmt(a.pending_commission)+'</div><div style="font-size:11px;color:#9ca3af">عمولة معلّقة</div></div>' +
    '</div>' +
    '<div style="font-size:13px;color:#6b7280">عمولة '+a.commission_pct+'% لكل طلب</div>' +
    '</div>'
  ).join('');
}

function openAddAffiliate() {
  document.getElementById('affModalTitle').textContent = 'موزع جديد';
  document.getElementById('editAffId').value = '';
  ['aff-name','aff-wa','aff-city','aff-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('aff-commission').value = '10';
  document.getElementById('affModal').classList.remove('hidden');
}

async function saveAffiliate() {
  const id = document.getElementById('editAffId').value;
  const body = {
    name: document.getElementById('aff-name').value.trim(),
    whatsapp: document.getElementById('aff-wa').value.trim()||null,
    city: document.getElementById('aff-city').value.trim()||null,
    commission_pct: +document.getElementById('aff-commission').value||10,
    notes: document.getElementById('aff-notes').value.trim()||null
  };
  if (!body.name) { alert('اسم الموزع مطلوب'); return; }
  const d = id ? await sysPut('/affiliates/'+id, body) : await sysPost('/affiliates', body);
  if (d.ok) { closeModal('affModal'); await loadAffiliates(); }
  else alert('خطأ: ' + d.error);
}

async function openAffDetail(id) {
  const d = await sysGet('/affiliates/'+id+'/orders');
  if (!d.ok) return;
  currentAff = d.affiliate;
  document.getElementById('asd-name').textContent = d.affiliate.name;
  document.getElementById('asd-comm-label').textContent = 'العمولة (' + d.affiliate.commission_pct + '%) ج.م';
  document.getElementById('asd-desc').value = '';
  document.getElementById('asd-amount').value = '';
  document.getElementById('asd-comm-val').value = '';

  const totalSales = d.data.reduce((s,o)=>s+o.amount,0);
  const totalComm = d.data.reduce((s,o)=>s+o.commission,0);
  const pending = d.data.filter(o=>o.status==='pending').reduce((s,o)=>s+o.commission,0);
  document.getElementById('asd-sales').textContent = fmt(totalSales)+' ج.م';
  document.getElementById('asd-commission').textContent = fmt(totalComm)+' ج.م';
  document.getElementById('asd-pending').textContent = fmt(pending)+' ج.م';

  const statusLabel = { pending:'معلّق', confirmed:'مؤكد', paid:'مدفوع' };
  const statusCls = { pending:'badge-cold', confirmed:'badge-prospect', paid:'badge-client' };
  const ordEl = document.getElementById('asd-orders-list');
  ordEl.innerHTML = d.data.length ? d.data.map(o =>
    '<div style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
      '<strong>'+esc(o.description)+'</strong>' +
      '<span class="badge '+(statusCls[o.status]||'')+'">'+( statusLabel[o.status]||o.status)+'</span>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;color:#9ca3af">' +
      '<span>بيع: '+fmt(o.amount)+' ج.م | عمولة: <strong style="color:#F5A623">'+fmt(o.commission)+' ج.م</strong></span>' +
      (o.status==='pending'?'<button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:none;font-size:11px" onclick="payAffOrder('+o.id+')">دفع العمولة</button>':'<span>'+formatDate(o.created_at)+'</span>') +
    '</div>' +
    '</div>'
  ).join('') : '<div style="text-align:center;padding:20px;color:#9ca3af">لا توجد طلبات بعد</div>';

  document.getElementById('affSlide').classList.remove('hidden');
}

function calcAffComm() {
  if (!currentAff) return;
  const amount = +document.getElementById('asd-amount').value||0;
  const comm = amount * currentAff.commission_pct / 100;
  document.getElementById('asd-comm-val').value = comm.toFixed(2);
}

async function saveAffOrder() {
  if (!currentAff) return;
  const desc = document.getElementById('asd-desc').value.trim();
  const amount = +document.getElementById('asd-amount').value||0;
  if (!desc) { alert('وصف الطلب مطلوب'); return; }
  const d = await sysPost('/affiliates/'+currentAff.id+'/orders', { description:desc, amount });
  if (d.ok) { await openAffDetail(currentAff.id); await loadAffiliates(); }
  else alert('خطأ: ' + d.error);
}

async function payAffOrder(id) {
  if (!confirm('تأكيد دفع عمولة هذا الطلب؟')) return;
  await fetch(API_INV+'/affiliate-orders/'+id+'/status', { method:'PUT', headers:hdr(), body:JSON.stringify({status:'paid'}), credentials:'include' });
  await openAffDetail(currentAff.id);
  await loadAffiliates();
}


// ── CONTENT CALENDAR ──
const CC_KEY = 'areej_content_v1';
let ccPosts = JSON.parse(localStorage.getItem(CC_KEY) || '[]');
let ccYear = new Date().getFullYear();
let ccMonth = new Date().getMonth(); // 0-indexed

const CC_PLATFORMS = { instagram:'📸', facebook:'👥', tiktok:'🎵', reels:'🎬', story:'📖', whatsapp:'💬' };
const CC_TYPES = { product:'🛍️', educational:'📚', testimonial:'⭐', behind:'🎬', offer:'🔥', engagement:'💬', story_telling:'📖' };
const CC_STATUS_CLS = { idea:'badge-cold', inprogress:'badge-prospect', ready:'badge-vip', published:'badge-client' };
const CC_STATUS_LABEL = { idea:'فكرة', inprogress:'قيد التجهيز', ready:'جاهز', published:'نُشر' };

function ccSave() { localStorage.setItem(CC_KEY, JSON.stringify(ccPosts)); }

function loadContentPage() {
  // populate month selector
  const sel = document.getElementById('cc-month-sel');
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  sel.innerHTML = monthNames.map((m,i) => '<option value="'+i+'" '+(i===ccMonth?'selected':'')+'>'+m+' '+ccYear+'</option>').join('');
  renderCalendar();
}

function renderCalendar() {
  const sel = document.getElementById('cc-month-sel');
  if (sel) ccMonth = +sel.value;

  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  // update stats
  const monthPosts = ccPosts.filter(p => {
    const d = new Date(p.date);
    return d.getFullYear()===ccYear && d.getMonth()===ccMonth;
  });
  document.getElementById('cc-total').textContent = monthPosts.length;
  document.getElementById('cc-idea').textContent = monthPosts.filter(p=>p.status==='idea').length;
  document.getElementById('cc-inprog').textContent = monthPosts.filter(p=>p.status==='inprogress').length;
  document.getElementById('cc-ready').textContent = monthPosts.filter(p=>p.status==='ready').length;
  document.getElementById('cc-done').textContent = monthPosts.filter(p=>p.status==='published').length;

  // weekday headers
  const wdEl = document.getElementById('cc-weekdays');
  const wdays = ['س','ح','ن','ث','ر','خ','ج'];
  wdEl.innerHTML = wdays.map(d => '<div style="text-align:center;font-size:12px;font-weight:700;color:#9ca3af;padding:4px">'+d+'</div>').join('');

  // calendar grid
  const grid = document.getElementById('cc-grid');
  const firstDay = new Date(ccYear, ccMonth, 1).getDay(); // 0=Sun
  // adjust for Sat-start: shift = (firstDay+1)%7
  const startOffset = (firstDay + 1) % 7;
  const daysInMonth = new Date(ccYear, ccMonth+1, 0).getDate();
  const today = new Date();

  let cells = '';
  for (let i=0; i<startOffset; i++) cells += '<div></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = ccYear+'-'+String(ccMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const dayPosts = ccPosts.filter(p => p.date===dateStr);
    const isToday = today.getFullYear()===ccYear && today.getMonth()===ccMonth && today.getDate()===d;
    const dotColors = { idea:'#9ca3af', inprogress:'#F5A623', ready:'#3b82f6', published:'#22c55e' };
    var bgCol = isToday ? '#f0fdf4' : '#fafafa';
    var bdCol = isToday ? 'var(--brand,#1B5E30)' : '#f3f4f6';
    var dotsHtml2 = dayPosts.map(function(p){ return '<div style="font-size:10px;background:'+(dotColors[p.status]||'#9ca3af')+';color:#fff;border-radius:4px;padding:2px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(CC_PLATFORMS[p.platform]||'')+(p.title||'').substring(0,12)+'</div>'; }).join('');
    cells += '<div onclick="openAddPostDate(\''+dateStr+'\')" style="min-height:60px;background:'+bgCol+';border-radius:8px;padding:4px 6px;cursor:pointer;border:1.5px solid '+bdCol+';transition:.15s">' +
      '<div style="font-size:13px;font-weight:'+(isToday?'800':'600')+';color:'+(isToday?'var(--brand,#1B5E30)':'#374151')+'">'+d+'</div>' +
      dotsHtml2 +
      '</div>';
  }
  grid.innerHTML = cells;

  // list view
  renderPostList(monthPosts);
}

function renderPostList(posts) {
  const el = document.getElementById('cc-list');
  if (!posts.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">لا توجد بوستات هذا الشهر — أضف أول بوست أو استخدم "خطة تلقائية"</div>'; return; }
  const sorted = [...posts].sort((a,b) => a.date.localeCompare(b.date));
  el.innerHTML = sorted.map(p =>
    '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6">' +
    '<div style="min-width:44px;text-align:center;background:#f9fafb;border-radius:8px;padding:6px">' +
      '<div style="font-size:18px">'+(CC_PLATFORMS[p.platform]||'📝')+'</div>' +
      '<div style="font-size:10px;color:#9ca3af">'+p.date.slice(5)+'</div>' +
    '</div>' +
    '<div style="flex:1">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<strong style="font-size:14px">'+esc(p.title)+'</strong>' +
        '<span class="badge '+(CC_STATUS_CLS[p.status]||'')+'">'+( CC_STATUS_LABEL[p.status]||p.status)+'</span>' +
        '<span style="font-size:12px;color:#9ca3af">'+(CC_TYPES[p.type]||'')+'</span>' +
      '</div>' +
      (p.caption ? '<div style="font-size:12px;color:#6b7280;margin-bottom:4px">'+esc(p.caption.substring(0,100))+(p.caption.length>100?'...':'')+'</div>' : '') +
      (p.notes ? '<div style="font-size:11px;color:#9ca3af">'+esc(p.notes)+'</div>' : '') +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:4px">' +
      '<button class="btn btn-sm btn-outline" onclick="openEditPost(\''+p.id+'\')">✏️</button>' +
      (p.status!=='published' ? '<button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:none;font-size:11px" onclick="markPublished(\''+p.id+'\')">✅ نشر</button>' : '') +
      '<button class="btn btn-sm" style="background:#fee2e2;color:#ef4444;border:none" onclick="deletePost(\''+p.id+'\')">🗑️</button>' +
    '</div>' +
    '</div>'
  ).join('');
}

function openAddPost() {
  document.getElementById('postModalTitle').textContent = 'بوست جديد';
  document.getElementById('editPostId').value = '';
  document.getElementById('post-date').value = '';
  document.getElementById('post-platform').value = 'instagram';
  document.getElementById('post-type').value = 'product';
  document.getElementById('post-status').value = 'idea';
  document.getElementById('post-title').value = '';
  document.getElementById('post-caption').value = '';
  document.getElementById('post-notes').value = '';
  document.getElementById('postModal').classList.remove('hidden');
}

function openAddPostDate(date) {
  openAddPost();
  document.getElementById('post-date').value = date;
}

function openEditPost(id) {
  const p = ccPosts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('postModalTitle').textContent = 'تعديل: ' + p.title;
  document.getElementById('editPostId').value = p.id;
  document.getElementById('post-date').value = p.date;
  document.getElementById('post-platform').value = p.platform;
  document.getElementById('post-type').value = p.type;
  document.getElementById('post-status').value = p.status;
  document.getElementById('post-title').value = p.title;
  document.getElementById('post-caption').value = p.caption||'';
  document.getElementById('post-notes').value = p.notes||'';
  document.getElementById('postModal').classList.remove('hidden');
}

function savePost() {
  const id = document.getElementById('editPostId').value;
  const title = document.getElementById('post-title').value.trim();
  const date = document.getElementById('post-date').value;
  if (!title||!date) { alert('العنوان والتاريخ مطلوبان'); return; }
  const p = {
    id: id || String(Date.now()),
    date, platform: document.getElementById('post-platform').value,
    type: document.getElementById('post-type').value,
    status: document.getElementById('post-status').value,
    title, caption: document.getElementById('post-caption').value.trim(),
    notes: document.getElementById('post-notes').value.trim()
  };
  if (id) { const i = ccPosts.findIndex(x=>x.id===id); if(i>=0) ccPosts[i]=p; }
  else ccPosts.push(p);
  ccSave();
  closeModal('postModal');
  renderCalendar();
}

function markPublished(id) {
  const p = ccPosts.find(x=>x.id===id);
  if (p) { p.status='published'; ccSave(); renderCalendar(); }
}

function deletePost(id) {
  if (!confirm('حذف هذا البوست؟')) return;
  ccPosts = ccPosts.filter(x=>x.id!==id);
  ccSave();
  renderCalendar();
}

function ccPrevMonth() { ccMonth--; if(ccMonth<0){ccMonth=11;ccYear--;} loadContentPage(); }
function ccNextMonth() { ccMonth++; if(ccMonth>11){ccMonth=0;ccYear++;} loadContentPage(); }

function generateAIPlan() {
  if (!confirm('سيتم إنشاء خطة محتوى تلقائية لهذا الشهر (30 بوست). متابع؟')) return;
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const daysInMonth = new Date(ccYear, ccMonth+1, 0).getDate();
  const templates = [
    { type:'product', platform:'instagram', title:'عرض منتج: هودي أوفر سايز', caption:'ملابسك بتعكس شخصيتك 🔥 هودي أوفر سايز بجودة عالية — اطلب دلوقتي!' },
    { type:'educational', platform:'facebook', title:'نصيحة: إزاي تختار خامة الطباعة', caption:'مش كل خامة بتتناسب مع كل طباعة — اعرف الفرق قبل ما تطبع 🧵' },
    { type:'testimonial', platform:'instagram', title:'تقييم عميل سعيد', caption:'ردود فعل عملاؤنا بتسعدنا جداً ❤️ شكراً لثقتكم' },
    { type:'behind', platform:'reels', title:'كواليس: شوف إزاي بنطبع', caption:'جولة سريعة جوه المصنع 🏭 — الطباعة على القماش من الصفر' },
    { type:'offer', platform:'instagram', title:'عرض خاص — خصم 15%', caption:'🔥 عرض محدود! استخدم الكود واوفر على طلبك دلوقتي' },
    { type:'engagement', platform:'facebook', title:'سؤال: إيه لونك المفضل؟', caption:'عايزين نعرف — إيه اللون اللي مش هتوقفوا عنه؟ 🎨 علقوا تحت!' },
    { type:'story_telling', platform:'reels', title:'قصة: إزاي بدأنا أريج', caption:'من فكرة صغيرة لبراند حقيقي — قصتنا مع الطباعة على الملابس ✨' },
  ];
  const platforms = ['instagram','instagram','reels','story','facebook','instagram','tiktok'];
  const postFreq = Math.ceil(daysInMonth / templates.length);
  const existing = new Set(ccPosts.filter(p=>{const d=new Date(p.date);return d.getFullYear()===ccYear&&d.getMonth()===ccMonth;}).map(p=>p.date));

  let added = 0;
  for (let d=1; d<=daysInMonth && added<templates.length; d+=postFreq) {
    const dateStr = ccYear+'-'+String(ccMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    if (existing.has(dateStr)) continue;
    const tmpl = templates[added % templates.length];
    ccPosts.push({ id:String(Date.now()+added), date:dateStr, platform:platforms[added%platforms.length], type:tmpl.type, status:'idea', title:tmpl.title, caption:tmpl.caption, notes:'#براند_ملابس #أريج_للطباعة' });
    added++;
  }
  ccSave();
  renderCalendar();
  alert('✅ تم إنشاء ' + added + ' بوست في تقويم ' + monthNames[ccMonth]);
}


// ── ROAS CALCULATOR ──
let roasRecords = JSON.parse(localStorage.getItem('areej_roas_v1')||'[]');

function calcROAS() {
  const spend = +document.getElementById('roas-input-spend').value || 0;
  const revenue = +document.getElementById('roas-input-revenue').value || 0;
  const cogs = +document.getElementById('roas-input-cogs').value || 0;
  const other = +document.getElementById('roas-input-other').value || 0;

  if (!spend || !revenue) { document.getElementById('roasResult').style.display='none'; return; }

  const roas = revenue / spend;
  const profit = revenue - spend - cogs - other;
  const margin = revenue > 0 ? (profit / revenue * 100) : 0;
  const breakeven = (cogs + other) > 0 ? ((spend + cogs + other) / spend) : 1;

  // update summary cards
  document.getElementById('roas-spend').textContent = fmt(spend);
  document.getElementById('roas-revenue').textContent = fmt(revenue);
  document.getElementById('roas-profit').textContent = fmt(profit);
  document.getElementById('roas-val').textContent = roas.toFixed(2) + '×';

  // result box
  const box = document.getElementById('roasResultBox');
  let color, label, emoji;
  if (roas >= 5) { color='#dcfce7'; label='ممتاز 🎉'; emoji='🚀'; }
  else if (roas >= 3) { color='#f0fdf4'; label='جيد جداً ✅'; emoji='✅'; }
  else if (roas >= 2) { color='#fef9c3'; label='مقبول — يحتاج تحسين ⚠️'; emoji='⚠️'; }
  else { color='#fee2e2'; label='خسارة — راجع الحملة ❌'; emoji='❌'; }

  box.style.background = color;
  document.getElementById('roasNum').textContent = emoji + ' ' + roas.toFixed(2) + '×';
  document.getElementById('roasLabel').textContent = label;
  document.getElementById('roasDetail').textContent = 'مقابل كل 1 ج.م أنفقتها، جبت ' + roas.toFixed(2) + ' ج.م';
  document.getElementById('roas-margin').textContent = margin.toFixed(1) + '%';
  document.getElementById('roas-breakeven').textContent = breakeven.toFixed(2) + '×';
  document.getElementById('roas-cpa').textContent = fmt(spend / Math.max(1, Math.round(revenue / 150)));

  document.getElementById('roasResult').style.display = 'block';
}

function saveROASRecord() {
  const spend = +document.getElementById('roas-input-spend').value;
  const revenue = +document.getElementById('roas-input-revenue').value;
  const platform = document.getElementById('roas-platform').value;
  const period = document.getElementById('roas-period').value;
  if (!spend||!revenue) return;
  const rec = { id: Date.now(), date: new Date().toLocaleDateString('ar-EG'), platform, period, spend, revenue, roas: (revenue/spend).toFixed(2) };
  roasRecords.unshift(rec);
  if (roasRecords.length > 50) roasRecords = roasRecords.slice(0,50);
  localStorage.setItem('areej_roas_v1', JSON.stringify(roasRecords));
  renderROASHistory();
  alert('✅ تم الحفظ في السجل');
}

function renderROASHistory() {
  const el = document.getElementById('roasHistory');
  if (!roasRecords.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af">لا توجد سجلات بعد</div>'; return; }
  el.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:1px solid #f3f4f6"><th style="text-align:right;padding:6px;font-size:12px;color:#9ca3af">التاريخ</th><th style="text-align:right;padding:6px;font-size:12px;color:#9ca3af">المنصة</th><th style="text-align:right;padding:6px;font-size:12px;color:#9ca3af">إنفاق</th><th style="text-align:right;padding:6px;font-size:12px;color:#9ca3af">إيراد</th><th style="text-align:right;padding:6px;font-size:12px;color:#9ca3af">ROAS</th><th></th></tr></thead>' +
    '<tbody>' + roasRecords.map(r =>
      '<tr style="border-bottom:1px solid #f9fafb">' +
      '<td style="padding:8px;font-size:12px;color:#9ca3af">'+r.date+'</td>' +
      '<td style="padding:8px;font-size:13px">'+esc(r.platform)+'</td>' +
      '<td style="padding:8px;font-weight:700">'+fmt(r.spend)+' ج.م</td>' +
      '<td style="padding:8px;font-weight:700;color:var(--brand,#1B5E30)">'+fmt(r.revenue)+' ج.م</td>' +
      '<td style="padding:8px;font-weight:800;color:'+(+r.roas>=3?'#166534':+r.roas>=2?'#854d0e':'#991b1b')+'">'+r.roas+'×</td>' +
      '<td><button onclick="deleteROASRecord('+r.id+')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px">🗑️</button></td>' +
      '</tr>'
    ).join('')+'</tbody></table>';
}

function deleteROASRecord(id) {
  roasRecords = roasRecords.filter(r => r.id !== id);
  localStorage.setItem('areej_roas_v1', JSON.stringify(roasRecords));
  renderROASHistory();
}


