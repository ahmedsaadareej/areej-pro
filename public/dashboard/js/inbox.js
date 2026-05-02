// ══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ══════════════════════════════════════════════════════════════
let _settingsProfile = {};

function showSettingsTab(tab) {
  ['company','brand','account'].forEach(t => {
    const sec = document.getElementById('set-section-' + t);
    const btn = document.getElementById('set-tab-' + t + '-btn');
    if (sec) sec.style.display = t === tab ? '' : 'none';
    if (btn) { btn.classList.toggle('btn-primary', t === tab); btn.classList.toggle('btn-sm', true); }
  });
}

async function loadSettingsProfile() {
  try {
    const r = await apiFetch('/api/auth/profile');
    const d = await r.json();
    if (!d.ok) return;
    const p = d.profile || {};
    _settingsProfile = p;

    // Company tab
    setVal('set-company-name',    p.company_name || p.name || '');
    setVal('set-company-name-en', p.company_name_en || '');
    setVal('set-phone',           p.phone || '');
    setVal('set-email',           p.email || '');
    setVal('set-address',         p.address || '');
    setVal('set-website',         p.website || '');
    setVal('set-tax',             p.tax_number || '');
    setVal('set-reg',             p.commercial_reg || '');
    setVal('set-invoice-notes',   p.invoice_notes || '');

    // Subdomain URLs
    const slug = p.slug;
    if (slug) {
      document.getElementById('set-staff-url').textContent = 'pro-' + slug + '.areejegypt.com';
      document.getElementById('set-owner-url').textContent = 'pro-' + slug + '.areejegypt.com/owner/';
    } else {
      document.getElementById('set-staff-url').textContent = 'لم يُحدد بعد';
      document.getElementById('set-owner-url').textContent = 'لم يُحدد بعد';
    }

    // Brand tab
    const color = p.brand_color || 'var(--brand,#1B5E30)';
    document.getElementById('set-brand-color').value = color;
    document.getElementById('set-brand-color-hex').value = color;
    document.getElementById('brand-preview-bar').style.background = color;
    if (p.logo_url) {
      document.getElementById('set-logo-url').value = p.logo_url;
      previewLogoUrl();
    }
    if (p.company_name) {
      document.getElementById('brand-preview-name').textContent = p.company_name;
    }

    // Account tab
    setVal('set-acc-name',  p.name || '');
    setVal('set-acc-email', p.email || '');

    // Subscription info
    const sub = document.getElementById('set-sub-info');
    if (sub) {
      const statusAr = { trial: 'تجريبي', active: 'نشط', expired: 'منتهي', suspended: 'موقوف' };
      const planAr   = { monthly: 'شهري', yearly: 'سنوي', lifetime: 'مدى الحياة' };
      let html = '<div style="display:flex;flex-direction:column;gap:6px">';
      html += '<div>الحالة: <strong>' + (statusAr[p.status] || p.status || '—') + '</strong></div>';
      if (p.plan) html += '<div>الخطة: <strong>' + (planAr[p.plan] || p.plan) + '</strong></div>';
      if (p.trial_ends && p.status === 'trial') {
        const d = Math.ceil((new Date(p.trial_ends) - Date.now()) / 86400000);
        html += '<div>الفترة التجريبية: <strong>' + (d > 0 ? 'تنتهي بعد ' + d + ' أيام' : 'انتهت') + '</strong></div>';
      }
      if (p.plan_ends) html += '<div>تجديد: <strong>' + p.plan_ends.slice(0,10) + '</strong></div>';
      html += '</div>';
      sub.innerHTML = html;
    }
  } catch(e) { console.error('loadSettingsProfile:', e); }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

async function saveCompanyProfile() {
  const btn = document.getElementById('btn-save-company');
  btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
    const body = {
      company_name:    document.getElementById('set-company-name').value.trim(),
      company_name_en: document.getElementById('set-company-name-en').value.trim(),
      phone:           document.getElementById('set-phone').value.trim(),
      email:           document.getElementById('set-email').value.trim(),
      address:         document.getElementById('set-address').value.trim(),
      website:         document.getElementById('set-website').value.trim(),
      tax_number:      document.getElementById('set-tax').value.trim(),
      commercial_reg:  document.getElementById('set-reg').value.trim(),
      invoice_notes:   document.getElementById('set-invoice-notes').value.trim(),
    };
    const r = await apiFetch('/api/auth/profile', { method:'PUT', body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) { showToast('✅ تم حفظ بيانات الشركة'); applyTenantBranding(); }
    else showToast('❌ ' + d.error, 4000);
  } catch(e) { showToast('❌ خطأ في الحفظ', 4000); }
  btn.disabled = false; btn.textContent = '💾 حفظ البيانات';
}

async function saveBrandSettings() {
  const btn = document.getElementById('btn-save-brand');
  btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
    const body = {
      brand_color: document.getElementById('set-brand-color').value,
      logo_url:    document.getElementById('set-logo-url').value.trim() || null,
    };
    const r = await apiFetch('/api/auth/profile', { method:'PUT', body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) { showToast('✅ تم حفظ هوية البراند'); applyTenantBranding(); }
    else showToast('❌ ' + d.error, 4000);
  } catch(e) { showToast('❌ خطأ في الحفظ', 4000); }
  btn.disabled = false; btn.textContent = '💾 حفظ هوية البراند';
}

async function saveAccountSettings() {
  const name    = document.getElementById('set-acc-name').value.trim();
  const newPass = document.getElementById('set-new-pass').value;
  const confPass= document.getElementById('set-confirm-pass').value;
  if (newPass && newPass.length < 6) return showToast('كلمة السر على الأقل 6 أحرف', 3000);
  if (newPass && newPass !== confPass) return showToast('كلمتا السر مش متطابقتين', 3000);
  try {
    const body = { name };
    if (newPass) body.password = newPass;
    const r = await apiFetch('/api/auth/profile', { method:'PUT', body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) {
      showToast('✅ تم حفظ التعديلات');
      document.getElementById('set-new-pass').value = '';
      document.getElementById('set-confirm-pass').value = '';
    } else showToast('❌ ' + d.error, 4000);
  } catch(e) { showToast('❌ خطأ في الحفظ', 4000); }
}

// Brand color live preview
function previewBrandColor() {
  const color = document.getElementById('set-brand-color').value;
  document.getElementById('set-brand-color-hex').value = color;
  document.getElementById('brand-preview-bar').style.background = color;
}
function syncColorHex() {
  const hex = document.getElementById('set-brand-color-hex').value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('set-brand-color').value = hex;
    document.getElementById('brand-preview-bar').style.background = hex;
  }
}
function setPresetColor(hex) {
  document.getElementById('set-brand-color').value = hex;
  document.getElementById('set-brand-color-hex').value = hex;
  document.getElementById('brand-preview-bar').style.background = hex;
}
function previewLogoUrl() {
  const url = document.getElementById('set-logo-url').value.trim();
  const prev = document.getElementById('logo-preview');
  const prevImg = document.getElementById('brand-preview-logo');
  if (url) {
    prev.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'">';
    prevImg.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:contain">';
  } else {
    prev.innerHTML = '🏢';
    prevImg.innerHTML = '🌿';
  }
}
async function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('logo', file);
  try {
    const r = await fetch('/api/auth/upload-logo', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('pro_token')||'') },
      body: fd
    }).then(x => x.json());
    if (r.ok) {
      document.getElementById('set-logo-url').value = r.url;
      document.getElementById('logo-preview').innerHTML = '<img src="' + r.url + '" style="width:100%;height:100%;object-fit:contain">';
      document.getElementById('brand-preview-logo').innerHTML = '<img src="' + r.url + '" style="width:100%;height:100%;object-fit:contain">';
      showToast('✅ تم رفع الشعار بنجاح');
      if (typeof loadAndApplyBranding === 'function') loadAndApplyBranding();
    } else {
      showToast('❌ ' + (r.error||'خطأ في الرفع'));
    }
  } catch(e) {
    showToast('❌ خطأ في الرفع: ' + e.message);
  }
  input.value = '';
}

// Apply branding to current session (after save)
function applyTenantBranding() {
  const color = document.getElementById('set-brand-color').value;
  const logoUrl = document.getElementById('set-logo-url').value.trim();
  const name  = document.getElementById('set-company-name').value.trim();
  document.documentElement.style.setProperty('--brand', color);
  document.documentElement.style.setProperty('--brand-btn', color);
  // Update nav logo if exists
  const navLogo = document.getElementById('nav-company-logo');
  if (navLogo && logoUrl) { navLogo.src = logoUrl; navLogo.style.display = 'inline-block'; }
  if (name) document.title = name + ' — نظام أريج';
}

// Load settings when page is opened

// unified showPage — single definition
// ════════════════════════════════════════════
// CRM
// ════════════════════════════════════════════
let crmData = [];
let editingContactId = null;

async function loadCRM() {
  const status = document.getElementById('crm-status-filter').value;
  const url = '/api/crm/contacts' + (status ? '?status=' + status : '');
  const r = await fetch(url, { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  crmData = d.data || [];
  renderCRM(crmData);
}

function filterCRM() {
  const q = (document.getElementById('crm-search').value || '').toLowerCase();
  const status = document.getElementById('crm-status-filter').value;
  let rows = crmData;
  if (status) rows = rows.filter(c => c.status === status);
  if (q) rows = rows.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.phone||'').includes(q) ||
    (c.email||'').toLowerCase().includes(q)
  );
  renderCRM(rows);
}

const STATUS_LABEL = { lead:'🟡 Lead', prospect:'🔵 Prospect', client:'🟢 عميل', vip:'⭐ VIP', inactive:'⚫ غير نشط' };
const STATUS_BG    = { lead:'#fefce8', prospect:'#eff6ff', client:'#f0fdf4', vip:'#fdf4ff', inactive:'#f3f4f6' };
const STATUS_COLOR = { lead:'#a16207', prospect:'#1d4ed8', client:'#166534', vip:'#7c3aed', inactive:'#6b7280' };
const STATUS_KEYS  = ['lead','prospect','client','vip','inactive'];

let _statusMenuOpen = null;
function toggleStatusMenu(e, contactId) {
  e.stopPropagation();
  // Close any open menu
  if (_statusMenuOpen) { _statusMenuOpen.remove(); _statusMenuOpen = null; }
  const btn = e.currentTarget;
  const menu = document.createElement('div');
  menu.style.cssText = 'position:absolute;z-index:999;background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px;min-width:130px;top:100%;right:0;margin-top:2px';
  STATUS_KEYS.forEach(s => {
    const item = document.createElement('button');
    item.style.cssText = 'display:block;width:100%;text-align:right;padding:7px 12px;border:none;background:none;font-family:Cairo,sans-serif;font-size:13px;cursor:pointer;border-radius:6px;color:#374151';
    item.textContent = STATUS_LABEL[s];
    item.onmouseenter = () => item.style.background = '#f9fafb';
    item.onmouseleave = () => item.style.background = 'none';
    item.onclick = () => { quickSetStatus(contactId, s); _statusMenuOpen.remove(); _statusMenuOpen = null; };
    menu.appendChild(item);
  });
  btn.parentElement.appendChild(menu);
  _statusMenuOpen = menu;
  document.addEventListener('click', () => { if(_statusMenuOpen){ _statusMenuOpen.remove(); _statusMenuOpen=null; } }, { once: true });
}

async function quickSetStatus(id, status) {
  const r = await fetch('/api/crm/contacts/' + id, {
    method: 'PUT', headers: hdr(),
    body: JSON.stringify({ status })
  }).then(x => x.json());
  if (r.ok) {
    // Update local data + re-render
    const c = crmData.find(x => x.id === id);
    if (c) c.status = status;
    renderCRM(crmData);
    showToast('✅ تم تغيير الحالة إلى ' + STATUS_LABEL[status]);
  } else showToast('❌ ' + (r.error||'خطأ'), 3000);
}

function renderCRM(rows) {
  const tb = document.getElementById('crm-tbody');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">لا يوجد عملاء</td></tr>'; return; }
  tb.innerHTML = rows.map(c => `
    <tr>
      <td style="cursor:pointer" onclick="openClientProfile(${c.id},'${esc(c.company_name||c.name)}')">
        <div style="font-weight:700;color:var(--brand,#1B5E30);text-decoration:underline;font-size:13px">🏢 ${esc(c.company_name||c.name)}</div>
        ${c.contact_name?'<div style="font-size:11px;color:#6b7280">👤 '+esc(c.contact_name)+'</div>':''}
      </td>
      <td>${c.phone ? `<a href="https://wa.me/2${c.phone}" target="_blank" style="color:#25D366;text-decoration:none">📱 ${c.phone}</a>` : '—'}</td>
      <td style="font-size:12px;color:#6b7280">${c.email||'—'}</td>
      <td>
        <div style="position:relative;display:inline-block">
          <button onclick="toggleStatusMenu(event,${c.id})" style="background:${STATUS_BG[c.status]||'#f0fdf4'};color:${STATUS_COLOR[c.status]||'#166534'};border:none;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:Cairo,sans-serif">
            ${STATUS_LABEL[c.status]||c.status} ▾
          </button>
        </div>
      </td>
      <td style="font-size:13px">${c.city||'—'}</td>
      <td style="font-size:12px;color:#6b7280">${c.last_note ? c.last_note.substring(0,40)+'...' : '—'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editContact(${c.id})" title="تعديل">✏️</button>
        <button class="btn btn-sm" style="background:#f0fdf4;color:var(--brand,#1B5E30);border:1px solid #bbf7d0" onclick="openPersona(${c.id},'${c.name}')" title="بيرسونا">🎯</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626" onclick="deleteContact(${c.id},'${c.name}')">🗑️</button>
      </td>
    </tr>`).join('');
}

function openAddContact() {
  editingContactId = null;
  document.getElementById('contactModalTitle').textContent = 'عميل جديد';
  ['name','company','phone','email','city','niche','notes'].forEach(f => {
    const el = document.getElementById('c-'+f); if(el) el.value = '';
  });
  ['c-address','c-governorate'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('c-status').value = 'lead';
  // init country dropdown
  const ctrySel = document.getElementById('c-country');
  if (ctrySel) {
    ctrySel.innerHTML = buildCountryOptions('EG');
    document.getElementById('c-governorate').innerHTML = buildGovernorateOptions('EG');
    document.getElementById('c-phone-code').textContent = '+20';
  }
  document.getElementById('contactModal').classList.remove('hidden');
  setTimeout(() => initClientAutocomplete('c-name', 'c-phone'), 100);
}

function editContact(id) {
  const c = crmData.find(x => x.id === id);
  if (!c) return;
  editingContactId = id;
  document.getElementById('contactModalTitle').textContent = 'تعديل: ' + c.name;
  const compEl = document.getElementById('c-company'); if(compEl) compEl.value = c.company_name || c.name || '';
  document.getElementById('c-name').value = c.contact_name || '';
  document.getElementById('c-phone').value = c.phone || '';
  document.getElementById('c-email').value = c.email || '';
  document.getElementById('c-city').value = c.city || '';
  document.getElementById('c-niche').value = c.niche || '';
  document.getElementById('c-notes').value = c.notes || '';
  document.getElementById('c-status').value = c.status || 'lead';
  const ctrySel = document.getElementById('c-country');
  if (ctrySel) {
    const country = c.country || 'EG';
    ctrySel.innerHTML = buildCountryOptions(country);
    document.getElementById('c-governorate').innerHTML = buildGovernorateOptions(country, c.governorate||'');
    document.getElementById('c-phone-code').textContent = getCountry(country).phone_code;
  } else {
    const govEl = document.getElementById('c-governorate'); if (govEl) govEl.value = c.governorate || '';
  }
  const addrEl = document.getElementById('c-address'); if (addrEl) addrEl.value = c.address || '';
  document.getElementById('contactModal').classList.remove('hidden');
}

async function saveContact() {
  const body = {
    company_name: document.getElementById('c-company')?.value.trim() || document.getElementById('c-name').value.trim(),
    name: document.getElementById('c-company')?.value.trim() || document.getElementById('c-name').value.trim(),
    contact_name: document.getElementById('c-name').value.trim() || null,
    phone: document.getElementById('c-phone').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    city: document.getElementById('c-city').value.trim(),
    country: document.getElementById('c-country')?.value || 'EG',
    phone_code: document.getElementById('c-phone-code')?.textContent || '+20',
    governorate: document.getElementById('c-governorate')?.value.trim() || null,
    address: document.getElementById('c-address')?.value.trim() || null,
    niche: document.getElementById('c-niche').value.trim(),
    status: document.getElementById('c-status').value,
    notes: document.getElementById('c-notes').value.trim()
  };
  if (!body.name) { showToast('الاسم مطلوب'); return; }
  const url = editingContactId ? '/api/crm/contacts/' + editingContactId : '/api/crm/contacts';
  const method = editingContactId ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) {
    if (d.existing_id) {
      // رقم موجود — اسأل المستخدم
      if (confirm('⚠️ ' + d.error + '\n\nهل تريد فتح بروفايل هذا العميل؟')) {
        closeModal('contactModal');
        openClientProfile(d.existing_id, d.existing_name);
      }
      return;
    }
    showToast('❌ خطأ: ' + (d.error||'?')); return;
  }
  closeModal('contactModal');
  loadCRM();
}

async function deleteContact(id, name) {
  if (!confirm('حذف "' + name + '"؟')) return;
  const r = await fetch('/api/crm/contacts/' + id, { method: 'DELETE', headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadCRM();
}

// ════════════════════════════════════════════
// PERSONA
// ════════════════════════════════════════════
let personaContactId = null;

async function openPersona(contactId, contactName) {
  personaContactId = contactId;
  document.getElementById('persona-modal-title').textContent = '🎯 بيرسونا: ' + contactName;
  // Load existing
  const r = await fetch('/api/crm/contacts/' + contactId + '/persona', { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  const p = d.data || {};
  // Fill fields
  document.getElementById('p-age').value = p.age || '';
  document.getElementById('p-gender').value = p.gender || '';
  document.getElementById('p-city').value = p.city || '';
  document.getElementById('p-job').value = p.job || '';
  document.getElementById('p-income').value = p.income_level || '';
  document.getElementById('p-source').value = p.source || '';
  document.getElementById('p-motivation').value = p.motivation || '';
  document.getElementById('p-budget-min').value = p.budget_min || '';
  document.getElementById('p-budget-max').value = p.budget_max || '';
  document.getElementById('p-frequency').value = p.buy_frequency || '';
  document.getElementById('p-pain').value = p.pain_points || '';
  document.getElementById('p-pref-contact').value = p.preferred_contact || '';
  document.getElementById('p-notes').value = p.notes || '';
  document.getElementById('personaModal').classList.remove('hidden');
}

async function savePersona() {
  const body = {
    age: parseInt(document.getElementById('p-age').value) || null,
    gender: document.getElementById('p-gender').value || null,
    city: document.getElementById('p-city').value.trim() || null,
    job: document.getElementById('p-job').value.trim() || null,
    income_level: document.getElementById('p-income').value || null,
    source: document.getElementById('p-source').value || null,
    motivation: document.getElementById('p-motivation').value || null,
    budget_min: parseFloat(document.getElementById('p-budget-min').value) || null,
    budget_max: parseFloat(document.getElementById('p-budget-max').value) || null,
    buy_frequency: document.getElementById('p-frequency').value || null,
    pain_points: document.getElementById('p-pain').value.trim() || null,
    preferred_contact: document.getElementById('p-pref-contact').value || null,
    notes: document.getElementById('p-notes').value.trim() || null
  };
  const r = await fetch('/api/crm/contacts/' + personaContactId + '/persona', {
    method: 'POST', headers: hdr(), body: JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('personaModal');
  // Refresh analytics if visible
  if (document.getElementById('persona-analytics-box')) loadPersonaAnalytics();
}

async function loadPersonaAnalytics() {
  const box = document.getElementById('persona-analytics-box');
  if (!box) return;
  const r = await fetch('/api/crm/persona-analytics', { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) return;
  const a = d.data;
  if (a.total === 0) {
    box.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px">📂 لم يتم ملء بيانات بيرسونا لأي عميل بعد — اضغط على أيكون 🎯 بجوار أي عميل</div>';
    return;
  }

  const barChart = (items, labelKey, valueKey, colors) => items.map((item,i) => {
    const max = Math.max(...items.map(x => x[valueKey]));
    const pct = Math.round((item[valueKey]/max)*100);
    const color = colors ? colors[i % colors.length] : 'var(--brand,#1B5E30)';
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="font-weight:600">${item[labelKey]||'غير محدد'}</span>
        <span style="color:#6b7280">${item[valueKey]} عميل</span>
      </div>
      <div style="background:#f0f0f0;border-radius:4px;height:10px">
        <div style="background:${color};height:100%;border-radius:4px;width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');

  const SOURCE_LABELS = { instagram:'📸 إنستجرام', facebook:'👥 فيسبوك', whatsapp:'💬 واتساب', referral:'🤝 توصية', tiktok:'🎵 تيك توك', ad:'📣 إعلان', other:'أخرى' };
  const FREQ_LABELS = { once:'مرة واحدة', rare:'نادراً', monthly:'شهرياً', frequent:'باستمرار' };
  const GENDER_LABELS = { male:'ذكر', female:'أنثى', other:'أخرى' };
  const INCOME_LABELS = { low:'منخفض', medium:'متوسط', high:'عالي', very_high:'عالي جداً' };

  const srcItems = a.sources.map(x => ({...x, source: SOURCE_LABELS[x.source]||x.source}));
  const freqItems = a.frequency.map(x => ({...x, buy_frequency: FREQ_LABELS[x.buy_frequency]||x.buy_frequency}));
  const genderItems = a.genders.map(x => ({...x, gender: GENDER_LABELS[x.gender]||x.gender}));
  const incomeItems = a.income.map(x => ({...x, income_level: INCOME_LABELS[x.income_level]||x.income_level}));

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Coverage -->
      <div style="grid-column:1/-1;background:#f0fdf4;border-radius:10px;padding:14px;display:flex;align-items:center;gap:16px">
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:800;color:var(--brand,#1B5E30)">${a.total}</div>
          <div style="font-size:12px;color:#6b7280">عميل ببيانات</div>
        </div>
        <div style="flex:1;background:#dcfce7;border-radius:8px;height:12px;overflow:hidden">
          <div style="background:var(--brand,#1B5E30);height:100%;width:${Math.round((a.total/a.totalContacts)*100)}%"></div>
        </div>
        <div style="text-align:center">
          <div style="font-size:18px;font-weight:700;color:#6b7280">${a.totalContacts}</div>
          <div style="font-size:12px;color:#9ca3af">إجمالي العملاء</div>
        </div>
        ${a.budget?.avg_mid ? `<div style="margin-right:auto;text-align:center"><div style="font-size:20px;font-weight:800;color:#F5A623">${a.budget.avg_mid} ج.م</div><div style="font-size:12px;color:#6b7280">متوسط الميزانية</div></div>` : ''}
      </div>

      <!-- Sources -->
      ${a.sources.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">📣 مصدر العميل</div>
        ${barChart(srcItems,'source','n',['var(--brand,#1B5E30)','#2d7a47','#4ade80','#86efac','#bbf7d0'])}
      </div>` : ''}

      <!-- Motivation -->
      ${a.motivations.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">❤️ دافع الشراء</div>
        ${barChart(a.motivations,'motivation','n',['#F5A623','#fbbf24','#fcd34d','#fde68a'])}
      </div>` : ''}

      <!-- Age -->
      ${a.ages.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">📅 الفئة العمرية</div>
        ${barChart(a.ages,'bucket','n',['#3b82f6','#60a5fa','#93c5fd','#bfdbfe'])}
      </div>` : ''}

      <!-- Cities -->
      ${a.cities.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">📍 المحافظات</div>
        ${barChart(a.cities,'city','n',['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd'])}
      </div>` : ''}

      <!-- Frequency -->
      ${freqItems.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">🔄 تكرار الشراء</div>
        ${barChart(freqItems,'buy_frequency','n',['#0891b2','#06b6d4','#67e8f9'])}
      </div>` : ''}

      <!-- Gender -->
      ${genderItems.length ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">👤 النوع</div>
        ${barChart(genderItems,'gender','n',['var(--brand,#1B5E30)','#F5A623','#6b7280'])}
      </div>` : ''}

    </div>
  `;
}

function showPage(name, btn, _skipHistory) {
  if (name === 'settings' && typeof loadSettingsProfile === 'function') {
    setTimeout(loadSettingsProfile, 50);
  }
  // Permission check for sub-users
  if (window._isSubUser && window._userPerms) {
    const reqPerm = NAV_PERM_MAP[name];
    if (reqPerm && !window._userPerms[reqPerm]) {
      showToast('✘ ليس عندك صلاحية لهذا القسم', 3000);
      return;
    }
  }
  if (!getToken()) { window.location.href = '/'; return; }

  // ── Hash-based routing ──
  if (!_skipHistory) {
    const newHash = '#p=' + name;
    const curPage = new URLSearchParams(window.location.hash.slice(1)).get('p');
    if (curPage !== name) {
      // Different page → push new history entry
      history.pushState({ page: name }, '', newHash);
    } else {
      // Same page (re-click) → replace to reset sub-state without adding entry
      history.replaceState({ page: name }, '', newHash);
    }
  } else if (_skipHistory === 'replace') {
    const newHash = '#p=' + name;
    history.replaceState({ page: name }, '', newHash);
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (!pg) { console.error('showPage: page not found: page-' + name); return; }
  pg.classList.add('active');
  if (btn) btn.classList.add('active');

  try {
    if (name === 'dashboard')  { loadDashboard(); }
    if (name === 'inventory')  { loadStats(); loadInventory(); }
    if (name === 'pricing')    { loadPricingProducts(); }
    if (name === 'invoices')   { loadInvoiceStats(); loadInvoices(); }
    if (name === 'contracts')  { loadContractTemplates(); }
    if (name === 'suppliers')  { loadSupplierStats(); loadSuppliers(); }
    if (name === 'orders')     { loadOrderStats(); loadOrders(); }
    if (name === 'followup')   { loadFollowupStats(); switchFupTab('scan'); runFollowupScan(); }
    if (name === 'roas')       { renderROASHistory(); }
    if (name === 'content')    { loadContentPage(); }
    if (name === 'affiliates') { loadAffiliates(); }
    if (name === 'treasury')  { loadTreasury(); }
    if (name === 'crm')        { loadCRM(); loadPersonaAnalytics(); }
    if (name === 'hr')         { loadHrSummary(); loadHrEmployees(); }
    if (name === 'team')       { loadTeamActivity(); loadRoles(); }
    if (name === 'library')    { renderSteps(); loadLibCalcProducts(); }
    if (name === 'shipping')    { loadShipping(); loadShipCompaniesDropdown(); }
    if (name === 'sales-tools') { loadSalesTools(); }
    if (name === 'marketplace') { loadMarketplace(); }
    if (name === 'inbox')      { loadInbox(); if (typeof iv3OnPageShow === 'function') iv3OnPageShow(); }
    if (name === 'team-settings') { initTeamSettings(); }
    if (name === 'inbox-settings') {
      loadIntegrationsStatus();
      // Always reset to main channels list when navigating to inbox-settings from sidebar
      const grid = document.getElementById('is-channels-grid');
      if (grid) grid.style.display = 'grid';
      document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
      showInboxSettingsSection('integrations-channels');
    }
    if (name !== 'inbox' && name !== 'inbox-settings') { stopInboxPolling(); if (typeof iv3OnPageHide === 'function') iv3OnPageHide(); } // الـ badge poll بيفضل شغال دايماً عبر setInterval الثابت
    // iframe pages (plan90, persona) need no loader
  } catch(e) {
    console.error('showPage error for', name, ':', e);
  }
}

async function init() {
  // ── Save initial hash BEFORE checkAuth (auth flow may clear it) ──
  const _savedInitHash = window.location.hash;
  window._initPhase = true; // Block hash rewrites during init

  const ok = await checkAuth();
  if (!ok) return;

  // Accept token from URL hash (cross-subdomain handoff)
  const hashParams = new URLSearchParams(_savedInitHash.slice(1));
  const hashToken = hashParams.get('t');
  if (hashToken) {
    localStorage.setItem('pro_token', hashToken);
    // Token consumed — keep any other params (like #p) but remove the token
    hashParams.delete('t');
    const remainingHash = hashParams.toString();
    history.replaceState({}, '', window.location.pathname + (remainingHash ? '#' + remainingHash : ''));
  }

  // ── Restore page from saved hash (use post-token-removal params) ──
  const _initParams = hashToken ? hashParams : new URLSearchParams(_savedInitHash.slice(1));
  const hashPage = _initParams.get('p');
  const startPage = hashPage || 'dashboard';
  const startBtn = document.querySelector('#sb-' + startPage) || document.querySelector('.nav-tab.active');
  showPage(startPage, startBtn, true); // _skipHistory: don't push again, hash is already correct

  // Restore inbox sub-state if refreshed on inbox-settings
  if (startPage === 'inbox-settings') {
    const _sec = _initParams.get('s');
    const _ch  = _initParams.get('ch');
    setTimeout(() => {
      window._initPhase = false; // allow hash writes from here on
      if (_ch && typeof showChannelDetail === 'function') {
        showChannelDetail(_ch);
      } else {
        const _grid = document.getElementById('is-channels-grid');
        if (_grid) _grid.style.display = 'grid';
        document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
        if (_sec && typeof showInboxSettingsSection === 'function') showInboxSettingsSection(_sec);
      }
    }, 200);
  } else {
    setTimeout(() => { window._initPhase = false; }, 300);
  }

  // ── Listen for browser back/forward ──
  window.addEventListener('popstate', function(e) {
    const pg = (e.state && e.state.page) || new URLSearchParams(window.location.hash.slice(1)).get('p') || 'dashboard';
    const btn = document.querySelector('#sb-' + pg);
    // Update sidebar active without pushing new history entry
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    showPage(pg, btn, true); // _skipHistory=true to avoid double push
    // Restore inbox sub-state if returning to inbox-settings
    if (pg === 'inbox-settings') {
      const params2 = new URLSearchParams(window.location.hash.slice(1));
      const sec = params2.get('s');
      const ch = params2.get('ch');
      setTimeout(() => {
        if (ch && typeof showChannelDetail === 'function') {
          // Restore channel detail view
          showChannelDetail(ch);
        } else {
          // Restore section (or default to channels)
          const grid = document.getElementById('is-channels-grid');
          if (grid) grid.style.display = 'grid';
          document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
          if (sec && typeof showInboxSettingsSection === 'function') showInboxSettingsSection(sec);
        }
      }, 100);
    }
  });
  // طلب إذن الـ browser notifications
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000);
  }
  // شغّل الـ badge poll من أول لحظة
  loadInboxUnreadBadge();
  // تفعيل autocomplete بعد تحميل الصفحة
  setTimeout(initAllAutocompletes, 500);
  // After short delay, check followup notifications
  setTimeout(checkDailyFollowup, 2000);
}

init();

function doLogout() {
  localStorage.removeItem('pro_token');
  localStorage.removeItem('pro_user');
  window.location.href = '/';
}

// ════════════════════════════════════════════
// HR MODULE
// ════════════════════════════════════════════
let hrEmployees = [];
let bulkAttRecords = {};

function showHrTab(tab) {
  ['emp','att','pay'].forEach(t => {
    document.getElementById('hr-section-' + t).style.display = t===tab ? '' : 'none';
    document.getElementById('hr-tab-' + t).className = t===tab ? 'btn btn-primary btn-sm' : 'btn btn-sm';
  });
  if (tab === 'att') { document.getElementById('hr-att-date').value = new Date().toISOString().slice(0,10); }
  if (tab === 'pay') { document.getElementById('hr-pay-month').value = new Date().toISOString().slice(0,7); loadPayroll(); }
}

async function loadHrSummary() {
  const r = await fetch('/api/hr/summary', { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) return;
  const a = d.data;
  document.getElementById('hr-total-emp').textContent = a.totalEmployees;
  document.getElementById('hr-today-present').textContent = a.todayPresent;
  document.getElementById('hr-today-absent').textContent = a.todayAbsent;
  const pay = a.payroll || {};
  document.getElementById('hr-month-payroll').textContent = (pay.total_payroll || 0).toLocaleString() + ' ج.م';
  document.getElementById('hr-paid-payroll').textContent = (pay.paid_amount || 0).toLocaleString() + ' ج.م';
  document.getElementById('hr-pending-payroll').textContent = (pay.pending_amount || 0).toLocaleString() + ' ج.م';
}

async function loadHrEmployees() {
  const search = document.getElementById('hr-emp-search')?.value || '';
  const r = await fetch('/api/hr/employees?search=' + encodeURIComponent(search), { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  const tb = document.getElementById('hr-emp-tbody');
  if (!d.ok) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444">خطأ في التحميل</td></tr>'; return; }
  hrEmployees = d.data;
  if (!hrEmployees.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af">لا يوجد موظفون — أضف أول</td></tr>'; return; }
  tb.innerHTML = hrEmployees.map(e => {
    const m = e.this_month || {};
    const statusBadge = e.active
      ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:11px">نشط</span>'
      : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:11px">موقف</span>';
    const accessBtn = e.system_user_id
      ? `<button class="btn btn-sm" style="background:#dbeafe;color:#1d4ed8;font-size:11px" onclick="resendCredentials(${e.id},'${e.name.replace(/'/g,"'")}')">📧 إعادة إرسال</button>
         <button class="btn btn-sm" style="background:#fef3c7;color:#92400e;font-size:11px" onclick="resetEmpPassword(${e.id},'${e.name.replace(/'/g,"'")}')">🔑 باسورد جديد</button>
         <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;font-size:11px" onclick="deactivateEmpAccess(${e.id})">⛔</button>`
      : `<button class="btn btn-sm" style="background:#f0fdf4;color:var(--brand,#1B5E30);border:1px solid #bbf7d0;font-size:11px" onclick="openActivateAccess(${e.id},'${e.name.replace(/'/g,"'")}')">🔓 تفعيل</button>`;
    const accessBadge = e.system_user_id
      ? '<span style="color:#22c55e;font-size:10px">●</span>'
      : '<span style="color:#d1d5db;font-size:10px">●</span>';
    return `<tr>
      <td><strong>${e.name}</strong><div style="font-size:11px;color:#9ca3af">${e.email||'بدون إيميل'}</div></td>
      <td><div>${e.job_title||'—'}</div><div style="font-size:11px;color:#9ca3af">${e.department||''}</div></td>
      <td style="font-weight:700;color:var(--brand,#1B5E30)">${(e.base_salary||0).toLocaleString()} ج.م</td>
      <td style="font-size:12px">🟢 ${m.days_present||0} / 🔴 ${m.days_absent||0}</td>
      <td>${accessBadge} ${accessBtn}</td>
      <td>${statusBadge}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="editEmployee(${e.id})">✏️</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626" onclick="deleteEmployee(${e.id},'${e.name.replace(/'/g,"'")}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openAddEmployee() {
  document.getElementById('emp-id').value = '';
  document.getElementById('emp-modal-title').textContent = 'موظف جديد';
  ['name','email','phone','whatsapp','job','dept','hire','salary','nid','notes'].forEach(f => {
    const el = document.getElementById('emp-' + f);
    if (el) el.value = '';
  });
  document.getElementById('emp-salary-type').value = 'monthly';
  document.getElementById('emp-role-id').value = '';
  loadRolesIntoEmpModal();
  document.getElementById('empModal').classList.remove('hidden');
}

async function loadRolesIntoEmpModal() {
  if (!teamRoles.length) await loadRoles();
  const sel = document.getElementById('emp-role-id');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— بدون دور محدد —</option>' +
    teamRoles.map(r => `<option value="${r.id}" ${cur==r.id?'selected':''}>${r.name}</option>`).join('');
}

function editEmployee(id) {
  const e = hrEmployees.find(x => x.id === id);
  if (!e) return;
  document.getElementById('emp-id').value = e.id;
  document.getElementById('emp-modal-title').textContent = 'تعديل: ' + e.name;
  document.getElementById('emp-name').value = e.name || '';
  document.getElementById('emp-email').value = e.email || '';
  document.getElementById('emp-phone').value = e.phone || '';
  loadRolesIntoEmpModal().then(() => {
    document.getElementById('emp-role-id').value = e.role_id || '';
  });
  document.getElementById('emp-job').value = e.job_title || '';
  document.getElementById('emp-dept').value = e.department || '';
  document.getElementById('emp-hire').value = e.hire_date || '';
  document.getElementById('emp-salary').value = e.base_salary || '';
  document.getElementById('emp-nid').value = e.national_id || '';
  document.getElementById('emp-notes').value = e.notes || '';
  document.getElementById('emp-salary-type').value = e.salary_type || 'monthly';
  document.getElementById('empModal').classList.remove('hidden');
}

async function saveEmployee() {
  const id = document.getElementById('emp-id').value;
  const body = {
    name: document.getElementById('emp-name').value.trim(),
    email: document.getElementById('emp-email').value.trim().toLowerCase() || null,
    phone: document.getElementById('emp-phone').value.trim() || null,
    default_role_id: parseInt(document.getElementById('emp-role-id').value) || null,
    national_id: document.getElementById('emp-nid').value.trim() || null,
    job_title: document.getElementById('emp-job').value.trim() || null,
    department: document.getElementById('emp-dept').value.trim() || null,
    hire_date: document.getElementById('emp-hire').value || null,
    base_salary: parseFloat(document.getElementById('emp-salary').value) || 0,
    salary_type: document.getElementById('emp-salary-type').value,
    notes: document.getElementById('emp-notes').value.trim() || null
  };
  if (!body.name) { alert('اسم الموظف مطلوب'); return; }
  const url = id ? '/api/hr/employees/' + id : '/api/hr/employees';
  const method = id ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('empModal');
  loadHrEmployees();
  loadHrSummary();
}

async function deleteEmployee(id, name) {
  if (!confirm('حذف الموظف "' + name + '"؟ هيتحذف كل بياناته.')) return;
  const r = await fetch('/api/hr/employees/' + id, { method: 'DELETE', headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadHrEmployees();
  loadHrSummary();
}

async function loadBulkAttendance() {
  const date = document.getElementById('hr-att-date').value;
  if (!date) { alert('اختر تاريخ'); return; }
  if (!hrEmployees.length) await loadHrEmployees();

  // Load existing for this date
  const r = await fetch('/api/hr/attendance?month=' + date.slice(0,7), { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  const existing = {};
  (d.data || []).filter(x => x.work_date === date).forEach(x => { existing[x.employee_id] = x; });

  bulkAttRecords = {};
  const tb = document.getElementById('hr-att-tbody');
  const STATUS_AR = { present:'حاضر', absent:'غائب', late:'متأخر', half:'نصف يوم', leave:'إجازة' };

  tb.innerHTML = hrEmployees.filter(e => e.active).map(e => {
    const ex = existing[e.id] || { status:'present', check_in:'', check_out:'' };
    bulkAttRecords[e.id] = { ...ex };
    return `<tr>
      <td><strong>${e.name}</strong></td><td style="font-size:12px">${e.job_title||''}</td>
      <td><select onchange="bulkAttRecords[${e.id}].status=this.value" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-family:Cairo,sans-serif">
        ${['present','absent','late','half','leave'].map(s => `<option value="${s}" ${ex.status===s?'selected':''}>${STATUS_AR[s]}</option>`).join('')}
      </select></td>
      <td><input type="time" value="${ex.check_in||'09:00'}" onchange="bulkAttRecords[${e.id}].check_in=this.value" style="padding:4px;border:1px solid #ddd;border-radius:6px"></td>
      <td><input type="time" value="${ex.check_out||'17:00'}" onchange="bulkAttRecords[${e.id}].check_out=this.value" style="padding:4px;border:1px solid #ddd;border-radius:6px"></td>
    </tr>`;
  }).join('');
}

async function saveBulkAttendance() {
  const date = document.getElementById('hr-att-date').value;
  if (!date || !Object.keys(bulkAttRecords).length) { alert('حمّل اليوم أولاً'); return; }
  const records = Object.entries(bulkAttRecords).map(([emp_id, rec]) => ({ employee_id: parseInt(emp_id), ...rec }));
  const r = await fetch('/api/hr/attendance/bulk', { method:'POST', headers: hdr(), body: JSON.stringify({ work_date: date, records }) });
  const d = await r.json().catch(() => ({}));
  if (d.ok) { alert('✅ تم حفظ الحضور لـ ' + (d.count||0) + ' موظفين'); loadHrSummary(); }
  else alert('خطأ: ' + (d.error||'?'));
}

async function calculatePayroll() {
  const month = document.getElementById('hr-pay-month').value;
  if (!month) { alert('اختر شهر'); return; }
  if (!confirm('حساب مرتبات ' + month + ' لكل الموظفين النشطين؟')) return;
  const r = await fetch('/api/hr/payroll/calculate', { method:'POST', headers: hdr(), body: JSON.stringify({ period_month: month }) });
  const d = await r.json().catch(() => ({}));
  if (d.ok) { alert('✅ تم حساب مرتبات ' + (d.data||[]).length + ' موظف'); loadPayroll(); loadHrSummary(); }
  else alert('خطأ: ' + (d.error||'?'));
}

async function loadPayroll() {
  const month = document.getElementById('hr-pay-month')?.value || new Date().toISOString().slice(0,7);
  const r = await fetch('/api/hr/payroll?month=' + month, { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  const tb = document.getElementById('hr-pay-tbody');
  if (!d.ok || !d.data.length) {
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9ca3af">لا يوجد مرتبات محسوبة لهذا الشهر</td></tr>';
    return;
  }
  tb.innerHTML = d.data.map(p => {
    const badge = p.status === 'paid'
      ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:11px">تم الصرف</span>'
      : '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px">مسودة</span>';
    const payBtn = p.status !== 'paid'
      ? `<button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="openPaySalary(${p.id},${p.net_salary},'${p.employee_name}')">💰 صرف</button>`
      : `<span style="font-size:11px;color:#6b7280">صُرف ${p.paid_at?.slice(0,10)||''}</span>`;
    return `<tr>
      <td><strong>${p.employee_name}</strong><div style="font-size:11px;color:#6b7280">${p.job_title||''}</div></td>
      <td>${(p.base_salary||0).toLocaleString()}</td>
      <td style="color:#22c55e">${(p.bonus||0).toLocaleString()}</td>
      <td style="color:#ef4444">${(p.deductions||0).toLocaleString()}</td>
      <td style="font-weight:700;color:var(--brand,#1B5E30)">${(p.net_salary||0).toLocaleString()} ج.م</td>
      <td>${p.days_worked||0}</td>
      <td>${badge}</td>
      <td>${payBtn}</td>
    </tr>`;
  }).join('');
}

let hrWallets = [];
async function openPaySalary(payrollId, netSalary, empName) {
  document.getElementById('pay-salary-payroll-id').value = payrollId;
  document.getElementById('pay-salary-amount').textContent = netSalary.toLocaleString() + ' ج.م — ' + empName;
  document.getElementById('pay-salary-notes').value = '';
  // Load wallets
  if (!hrWallets.length) {
    const r = await fetch('/api/system/wallets', { headers: hdr() });
    const d = await r.json().catch(() => ({}));
    hrWallets = (d.data || d.wallets || []);
  }
  const sel = document.getElementById('pay-salary-wallet');
  sel.innerHTML = '<option value="">— اختر خزينة —</option>' +
    hrWallets.map(w => `<option value="${w.id}">${w.name} (${(w.balance||0).toLocaleString()} ج.م)</option>`).join('');
  document.getElementById('paySalaryModal').classList.remove('hidden');
}

async function confirmPaySalary() {
  const id = document.getElementById('pay-salary-payroll-id').value;
  const wallet_id = document.getElementById('pay-salary-wallet').value;
  const notes = document.getElementById('pay-salary-notes').value.trim();
  if (!wallet_id) { alert('اختر خزينة'); return; }
  const r = await fetch('/api/hr/payroll/' + id + '/pay', { method:'POST', headers: hdr(), body: JSON.stringify({ wallet_id: parseInt(wallet_id), notes }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('paySalaryModal');
  hrWallets = []; // reset cache
  loadPayroll();
  loadHrSummary();
  alert('✅ تم صرف المرتب');
}

// ════════════════════════════════════════════
// HR SYSTEM ACCESS
// ════════════════════════════════════════════

let activateEmpId = null;
let allTenantRoles = [];

async function openActivateAccess(empId, empName) {
  activateEmpId = empId;
  // Load roles if needed
  if (!allTenantRoles.length) {
    const r = await fetch('/api/users/roles', { headers: hdr() });
    const d = await r.json().catch(() => ({}));
    allTenantRoles = d.data || [];
  }
  const roleOpts = allTenantRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  // Simple confirm dialog with role select
  document.getElementById('activate-emp-name').textContent = empName;
  document.getElementById('activate-role-select').innerHTML = '<option value="">— بدون دور —</option>' + roleOpts;
  document.getElementById('activateModal').classList.remove('hidden');
}

async function confirmActivateAccess() {
  if (!activateEmpId) return;
  const role_id = parseInt(document.getElementById('activate-role-select').value) || null;
  const r = await fetch('/api/hr/employees/' + activateEmpId + '/activate', {
    method: 'POST', headers: hdr(), body: JSON.stringify({ role_id })
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('activateModal');
  alert('✅ تم تفعيل الوصول\n✉️ تم إرسال بيانات الدخول على إيميل الموظف');
  loadHrEmployees();
  loadHrSummary();
}

async function resetEmpPassword(empId, empName) {
  if (!confirm('تغيير كلمة سر الموظف "' + empName + '"؟\nسيتم إرسال كلمة السر الجديدة على إيميله')) return;
  const r = await fetch('/api/hr/employees/' + empId + '/reset-password', { method: 'POST', headers: hdr(), body: '{}' });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  alert('✅ تم تغيير كلمة السر\n✉️ تم إرسالها على إيميل الموظف');
}

async function resendCredentials(empId, empName) {
  if (!confirm('إعادة إرسال بيانات الدخول لـ "' + empName + '"؟\nسيتم إنشاء كلمة سر جديدة وإرسالها على إيميله.')) return;
  const btn = event.target;
  btn.disabled = true; btn.textContent = '⏳';
  const r = await fetch('/api/hr/employees/' + empId + '/resend-credentials', { method:'POST', headers: hdr(), body:'{}' });
  const d = await r.json().catch(() => ({}));
  btn.disabled = false; btn.textContent = '📧 إعادة إرسال';
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  // Small toast instead of alert
  showToast('✅ تم إرسال بيانات الدخول على إيميل ' + empName);
}

async function deactivateEmpAccess(empId) {
  if (!confirm('إيقاف وصول الموظف للسيستم؟')) return;
  const r = await fetch('/api/hr/employees/' + empId + '/deactivate', { method: 'POST', headers: hdr(), body: '{}' });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadHrEmployees();
}

async function toggleTeamUserActive(userId, current) {
  const r = await fetch('/api/users/' + userId, { method: 'PUT', headers: hdr(), body: JSON.stringify({ active: current ? 0 : 1 }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadTeamActivity();
}

// ════════════════════════════════════════════
// TEAM MANAGEMENT
// ════════════════════════════════════════════
let teamRoles = [];
let teamUsers = [];

function showTeamTab(tab) {
  document.getElementById('team-section-activity').style.display = tab==='activity' ? '' : 'none';
  document.getElementById('team-section-roles').style.display = tab==='roles' ? '' : 'none';
  document.getElementById('team-tab-activity-btn').className = tab==='activity' ? 'btn btn-primary btn-sm' : 'btn btn-sm';
  document.getElementById('team-tab-roles-btn').className = tab==='roles' ? 'btn btn-primary btn-sm' : 'btn btn-sm';
}

async function loadRoles() {
  const r = await fetch('/api/users/roles', { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  teamRoles = d.data || [];
  renderRoles();
}

const PERM_LABELS = {
  invoices:'🧾 فواتير', orders:'📋 طلبات', products:'📦 مخزون', suppliers:'🛍️ موردين',
  wallets:'💰 خزينة', crm:'👥 عملاء', affiliates:'🤝 موزعين', followup:'📱 متابعة',
  hr:'👤 HR', users:'🔑 الفريق', reports:'📊 تقارير',
  pricing:'💲 التسعير', contracts:'📝 العقود', roas:'📊 ROAS',
  content:'📅 المحتوى', plan90:'🗓️ 90 يوم', settings:'⚙️ الإعدادات'
};

function renderRoles() {
  const box = document.getElementById('roles-list');
  if (!teamRoles.length) { box.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af">لا يوجد أدوار</div>'; return; }
  box.innerHTML = teamRoles.map(role => {
    const perms = typeof role.permissions === 'object' ? role.permissions : JSON.parse(role.permissions || '{}');
    const activePerms = Object.entries(perms).filter(([,v]) => v).map(([k]) => PERM_LABELS[k]||k);
    return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px">${role.name}</strong>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="editRole(${role.id})">✏️ تعديل</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626" onclick="deleteRole(${role.id},'${role.name}')">🗑️</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${activePerms.map(p => `<span style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${p}</span>`).join('')}
        ${!activePerms.length ? '<span style="color:#9ca3af;font-size:12px">لا صلاحيات</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

async function loadTeamActivity() {
  const r = await fetch('/api/hr/team-activity', { headers: hdr() });
  const d = await r.json().catch(() => ({}));
  const tb = document.getElementById('team-activity-tbody');
  const members = d.data || [];
  if (!members.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">لا يوجد موظفين بوصول السيستم — فعّل وصول من صفحة HR 👆</td></tr>';
    return;
  }
  const STATUS_AR = { present:'حاضر', absent:'غائب', late:'متأخر', half:'نصف يوم', leave:'إجازة' };
  const STATUS_COLOR = { present:'#22c55e', absent:'#ef4444', late:'#F5A623', half:'#3b82f6', leave:'#8b5cf6' };
  tb.innerHTML = members.map(m => {
    const att = m.today_attendance;
    const attBadge = att
      ? `<span style="background:${STATUS_COLOR[att.status]||'#ddd'}22;color:${STATUS_COLOR[att.status]||'#666'};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">${STATUS_AR[att.status]||att.status}</span>`
      : '<span style="color:#9ca3af;font-size:11px">لم يُسجَّل</span>';
    const loginBadge = m.last_login
      ? `<span style="font-size:12px;color:#374151">${m.last_login.slice(0,16).replace('T',' ')}</span>`
      : '<span style="font-size:11px;color:#9ca3af">لم يدخل بعد</span>';
    const activeBadge = m.active
      ? '<span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:6px;font-size:10px">✅ نشط</span>'
      : '<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:6px;font-size:10px">⛔ موقف</span>';
    return `<tr>
      <td><strong>${m.name}</strong><div style="font-size:11px;color:#9ca3af">${m.email||''}</div></td>
      <td>${m.role_name ? `<span style="background:#ede9fe;color:#5b21b6;padding:2px 6px;border-radius:6px;font-size:11px">${m.role_name}</span>` : '—'}</td>
      <td style="font-size:12px;color:#6b7280">${m.job_title||'—'}</td>
      <td>${loginBadge}</td>
      <td>${attBadge}</td>
      <td>${activeBadge}</td>
      <td style="display:flex;gap:4px">
        ${m.employee_id ? `<button class="btn btn-sm" style="background:#fef3c7;color:#92400e;font-size:11px" onclick="resetEmpPassword(${m.employee_id},'${m.name.replace(/'/g,"'")}')">🔑</button>` : ''}
        <button class="btn btn-sm" style="background:${m.active?'#fee2e2':'#dcfce7'};color:${m.active?'#dc2626':'#166534'};font-size:11px" onclick="toggleTeamUserActive(${m.id},${m.active})">${m.active?'⛔':'✅'}</button>
      </td>
    </tr>`;
  }).join('');
}

async function loadTeamUsers() { /* deprecated */ }


async function openAddTeamUser() {
  if (!teamRoles.length) await loadRoles();
  document.getElementById('team-user-id').value = '';
  document.getElementById('team-user-modal-title').textContent = 'عضو جديد';
  document.getElementById('tu-name').value = '';
  document.getElementById('tu-email').value = '';
  document.getElementById('tu-pass').value = '';
  const sel = document.getElementById('tu-role');
  sel.innerHTML = '<option value="">— بدون دور —</option>' + teamRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  document.getElementById('teamUserModal').classList.remove('hidden');
}

async function editTeamUser(id) {
  const u = teamUsers.find(x => x.id === id);
  if (!u) return;
  if (!teamRoles.length) await loadRoles();
  document.getElementById('team-user-id').value = u.id;
  document.getElementById('team-user-modal-title').textContent = 'تعديل: ' + u.name;
  document.getElementById('tu-name').value = u.name;
  document.getElementById('tu-email').value = u.email;
  document.getElementById('tu-pass').value = '';
  const sel = document.getElementById('tu-role');
  sel.innerHTML = '<option value="">— بدون دور —</option>' + teamRoles.map(r => `<option value="${r.id}" ${u.role_id===r.id?'selected':''}>${r.name}</option>`).join('');
  document.getElementById('teamUserModal').classList.remove('hidden');
}

async function saveTeamUser() {
  const id = document.getElementById('team-user-id').value;
  const body = {
    name: document.getElementById('tu-name').value.trim(),
    email: document.getElementById('tu-email').value.trim().toLowerCase(),
    password: document.getElementById('tu-pass').value || undefined,
    role_id: parseInt(document.getElementById('tu-role').value) || null
  };
  if (!body.name || !body.email) { alert('الاسم والإيميل مطلوبان'); return; }
  if (!id && !body.password) { alert('كلمة السر مطلوبة للعضو الجديد'); return; }
  const url = id ? '/api/users/' + id : '/api/users';
  const method = id ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('teamUserModal');
  loadTeamUsers();
}

async function toggleTeamUser(id, current) {
  const r = await fetch('/api/users/' + id, { method:'PUT', headers: hdr(), body: JSON.stringify({ active: !current }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadTeamUsers();
}

async function deleteTeamUser(id, name) {
  if (!confirm('حذف "' + name + '"؟')) return;
  const r = await fetch('/api/users/' + id, { method:'DELETE', headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadTeamUsers();
}

function openRoleModal(role) {
  // role = null for new, or role object for edit
  document.getElementById('role-modal-id').value = role ? role.id : '';
  document.getElementById('role-modal-title').textContent = role ? 'تعديل: ' + role.name : 'دور جديد';
  document.getElementById('role-modal-name').value = role ? role.name : '';
  const perms = role
    ? (typeof role.permissions === 'object' ? {...role.permissions} : JSON.parse(role.permissions||'{}'))
    : {};
  // Render checkboxes
  const grid = document.getElementById('role-perms-grid');
  const ICONS = {}; // icons now embedded in PERM_LABELS
  grid.innerHTML = Object.entries(PERM_LABELS).map(([k,label]) => {
    const checked = perms[k] ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px solid ${perms[k]?'var(--brand,#1B5E30)':'#e5e7eb'};border-radius:8px;cursor:pointer;transition:all .15s;background:${perms[k]?'#f0fdf4':'#fff'}" id="perm-label-${k}" onclick="togglePermLabel('${k}')">
      <input type="checkbox" id="perm-${k}" ${checked} style="accent-color:var(--brand,#1B5E30);width:16px;height:16px" onclick="event.stopPropagation();togglePermLabel('${k}',this.checked)">
      <span style="font-size:13px;font-weight:600">${label}</span>
    </label>`;
  }).join('');
  document.getElementById('roleModal').classList.remove('hidden');
}

function togglePermLabel(key, forceVal) {
  const cb = document.getElementById('perm-' + key);
  const lbl = document.getElementById('perm-label-' + key);
  if (forceVal !== undefined) cb.checked = forceVal;
  else cb.checked = !cb.checked;
  lbl.style.border = cb.checked ? '1.5px solid var(--brand,#1B5E30)' : '1.5px solid #e5e7eb';
  lbl.style.background = cb.checked ? '#f0fdf4' : '#fff';
}

function selectAllPerms(val) {
  Object.keys(PERM_LABELS).forEach(k => togglePermLabel(k, val));
}

async function saveRole() {
  const id = document.getElementById('role-modal-id').value;
  const name = document.getElementById('role-modal-name').value.trim();
  if (!name) { alert('اسم الدور مطلوب'); return; }
  const perms = {};
  Object.keys(PERM_LABELS).forEach(k => { perms[k] = document.getElementById('perm-'+k)?.checked || false; });
  const url = id ? '/api/users/roles/' + id : '/api/users/roles';
  const method = id ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify({ name, permissions: perms }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  closeModal('roleModal');
  await loadRoles();
  // Refresh role select in emp modal too
  loadRolesIntoEmpModal();
}

async function openAddRole() {
  openRoleModal(null);
}

async function editRole(id) {
  const role = teamRoles.find(r => r.id === id);
  if (!role) return;
  openRoleModal(role);
}

async function deleteRole(id, name) {
  if (!confirm('حذف الدور "' + name + '"؟')) return;
  const r = await fetch('/api/users/roles/' + id, { method:'DELETE', headers: hdr() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { alert('خطأ: ' + (d.error||'?')); return; }
  loadRoles();
}


// ============================================================
// SALES TOOLS — أدوات البيع
// ============================================================
let ofProducts = [];

async function loadSalesTools() {
  loadPayLinks();
  loadOrderForms();
}

// ── Payment Links ──
async function loadPayLinks() {
  const el = document.getElementById('pay-links-list');
  const d = await apiFetch('/api/system/payment-links');
  const links = d.links || [];
  if (!links.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">لا يوجد لينكات — اضغط “لينك جديد”</div>'; return; }
  const statusColors = { pending:'#F5A623', paid:'#16a34a', expired:'#ef4444' };
  const statusLabels = { pending:'منتظر', paid:'تم الدفع', expired:'منتهي' };
  el.innerHTML = links.map(l => {
    const color = statusColors[l.status]||'#9ca3af';
    const label = statusLabels[l.status]||l.status;
    const baseUrl = window.location.origin.replace(/pro-[^.]+\./, 'pro.');
    const link = baseUrl + '/pay/' + l.token;
    return '<div style="border:1px solid #f3f4f6;border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<div><div style="font-weight:700;font-size:13px">' + fmt(l.amount) + ' ج.م' + (l.client_name?' — '+esc(l.client_name):'') + '</div>'
      + (l.description?'<div style="font-size:11px;color:#6b7280">'+esc(l.description)+'</div>':'')
      + '</div>'
      + '<span style="background:'+color+'20;color:'+color+';padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">'+label+'</span></div>'
      + '<div style="display:flex;gap:6px;margin-top:8px">'
      + '<button onclick="copyText(\''+link+'\')" style="flex:1;background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:5px;border-radius:7px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">📋 نسخ اللينك</button>'
      + '<a href="https://wa.me/?text=' + encodeURIComponent('إليك لينك الدفع: '+link) + '" target="_blank" style="background:#25D366;color:#fff;padding:5px 10px;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none">📲</a>'
      + '</div></div>';
  }).join('');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ تم نسخ اللينك'));
}

async function openNewPayLink() {
  document.getElementById('pl-amount').value = '';
  document.getElementById('pl-name').value = '';
  document.getElementById('pl-desc').value = '';
  document.getElementById('pl-result').innerHTML = '';
  document.getElementById('newPayLinkModal').classList.remove('hidden');
  // Load invoices
  const d = await apiFetch('/api/system/invoices?limit=20');
  const sel = document.getElementById('pl-invoice');
  sel.innerHTML = '<option value="">— بدون ربط —</option>';
  (d.invoices||[]).filter(i=>i.status!=='paid').forEach(i => {
    sel.innerHTML += '<option value="'+i.id+'">فاتورة '+esc(i.invoice_no)+' — '+fmt(i.total)+' ج.م</option>';
  });
}

async function createPayLink() {
  const amount = parseFloat(document.getElementById('pl-amount').value);
  const client_name = document.getElementById('pl-name').value.trim();
  const description = document.getElementById('pl-desc').value.trim();
  const invoice_id = document.getElementById('pl-invoice').value;
  if (!amount) { showToast('أدخل المبلغ'); return; }
  const d = await apiFetch('/api/system/payment-links', {
    method: 'POST',
    body: JSON.stringify({ amount, client_name, description, invoice_id: invoice_id||null })
  });
  if (d.ok) {
    const el = document.getElementById('pl-result');
    el.innerHTML = '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px;word-break:break-all">'
      + '<div style="font-size:12px;font-weight:700;color:var(--brand,#1B5E30);margin-bottom:6px">✅ تم إنشاء اللينك!</div>'
      + '<div style="font-size:11px;color:#374151;margin-bottom:8px;word-break:break-all">'+d.link+'</div>'
      + '<div style="display:flex;gap:6px">'
      + '<button onclick="copyText(\''+d.link+'\')" style="flex:1;background:var(--brand,#1B5E30);color:#fff;border:none;padding:7px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">📋 نسخ</button>'
      + '<a href="https://wa.me/?text='+encodeURIComponent('إليك لينك الدفع: '+d.link)+'" target="_blank" style="background:#25D366;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📲 واتساب</a>'
      + '</div></div>';
    loadPayLinks();
  } else {
    showToast('❌ '+(d.error||'خطأ'));
  }
}

// ── Order Forms ──
async function loadOrderForms() {
  const el = document.getElementById('order-forms-list');
  const d = await apiFetch('/api/system/order-forms');
  const forms = d.forms || [];
  if (!forms.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">لا يوجد فورمات — اضغط “فورم جديد”</div>'; return; }
  el.innerHTML = forms.map(f => {
    const baseUrl = window.location.origin.replace(/pro-[^.]+\./, 'pro.');
    const link = baseUrl + '/order-form/' + f.token;
    return '<div style="border:1px solid #f3f4f6;border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<div><div style="font-weight:700;font-size:13px">' + esc(f.title) + '</div>'
      + '<div style="font-size:11px;color:#6b7280">' + (f.submissions_count||0) + ' طلب واصل</div>'
      + '</div>'
      + '<button onclick="deleteOrderForm('+f.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px">🗑️</button></div>'
      + '<div style="display:flex;gap:6px">'
      + '<button onclick="copyText(\''+link+'\')" style="flex:1;background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:5px;border-radius:7px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">📋 نسخ اللينك</button>'
      + '<a href="https://wa.me/?text='+encodeURIComponent('املأ طلبك هنا: '+link)+'" target="_blank" style="background:#25D366;color:#fff;padding:5px 10px;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none">📲</a>'
      + '</div></div>';
  }).join('');
}

function openNewOrderForm() {
  ofProducts = [];
  document.getElementById('of-title').value = '';
  document.getElementById('of-result').innerHTML = '';
  document.getElementById('of-products-list').innerHTML = '';
  document.getElementById('newOrderFormModal').classList.remove('hidden');
}

function addFormProduct() {
  const idx = ofProducts.length;
  ofProducts.push({ name:'', price:'' });
  const el = document.getElementById('of-products-list');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;align-items:center';
  div.innerHTML = '<input placeholder="اسم المنتج" id="ofp-name-'+idx+'" style="flex:2;padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">'
    + '<input type="number" placeholder="سعر" id="ofp-price-'+idx+'" style="flex:1;padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px">'
    + '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ef4444;cursor:pointer">✖</button>';
  el.appendChild(div);
}

async function createOrderForm() {
  const title = document.getElementById('of-title').value.trim();
  if (!title) { showToast('أدخل عنوان الفورم'); return; }
  // Collect products from DOM
  const prods = [];
  document.querySelectorAll('[id^=ofp-name-]').forEach(el => {
    const idx = el.id.split('-').pop();
    const name = el.value.trim();
    const price = document.getElementById('ofp-price-'+idx)?.value;
    if (name) prods.push({ name, price: price ? parseFloat(price) : null });
  });
  const d = await apiFetch('/api/system/order-forms', {
    method: 'POST',
    body: JSON.stringify({ title, products: prods })
  });
  if (d.ok) {
    const el = document.getElementById('of-result');
    el.innerHTML = '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--brand,#1B5E30);margin-bottom:6px">✅ تم إنشاء الفورم!</div>'
      + '<div style="font-size:11px;color:#374151;margin-bottom:8px;word-break:break-all">'+d.link+'</div>'
      + '<div style="display:flex;gap:6px">'
      + '<button onclick="copyText(\''+d.link+'\')" style="flex:1;background:var(--brand,#1B5E30);color:#fff;border:none;padding:7px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">📋 نسخ</button>'
      + '<a href="https://wa.me/?text='+encodeURIComponent('املأ طلبك هنا: '+d.link)+'" target="_blank" style="background:#25D366;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📲 واتساب</a>'
      + '</div></div>';
    loadOrderForms();
  } else {
    showToast('❌ '+(d.error||'خطأ'));
  }
}

async function deleteOrderForm(id) {
  if (!confirm('حذف الفورم؟')) return;
  await apiFetch('/api/system/order-forms/'+id, { method:'DELETE' });
  loadOrderForms();
}

// ============================================================
// MARKETPLACE — سوق الموردين
// ============================================================
let marketSuppliersCache = [];

function showMarketTab(tab, btn) {
  document.querySelectorAll('.mkt-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelectorAll('.mkt-tab').forEach((b,i) => { if((i===0&&tab==='browse')||(i===1&&tab==='my-quotes')) b.classList.add('active'); });
  document.getElementById('mkt-browse').style.display = tab === 'browse' ? 'block' : 'none';
  document.getElementById('mkt-my-quotes').style.display = tab === 'my-quotes' ? 'block' : 'none';
  if (tab === 'my-quotes') loadMyQuotes();
}

async function loadMarketplace() {
  await loadMarketplaceSuppliers();
}

async function loadMarketplaceSuppliers() {
  const grid = document.getElementById('mkt-suppliers-grid');
  const region = document.getElementById('mkt-filter-region').value;
  const product = document.getElementById('mkt-filter-product').value;
  const search = document.getElementById('mkt-search').value;
  let url = '/api/system/marketplace/suppliers?';
  if (region) url += 'region=' + encodeURIComponent(region) + '&';
  if (product) url += 'product=' + encodeURIComponent(product) + '&';
  if (search) url += 'search=' + encodeURIComponent(search) + '&';
  const d = await apiFetch(url);
  marketSuppliersCache = d.suppliers || [];
  if (!marketSuppliersCache.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af">لا يوجد موردين بهذه المعايير</div>';
    return;
  }
  grid.innerHTML = marketSuppliersCache.map(s => {
    const stars = renderStars(s.rating);
    const prods = (s.products||'').split(',').map(p => '<span style="background:#f0fdf4;color:var(--brand,#1B5E30);padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600">' + p.trim() + '</span>').join(' ');
    return '<div class="sup-market-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      + '<h4 style="font-size:14px;font-weight:800;color:var(--brand,#1B5E30);flex:1">' + esc(s.name) + '</h4>'
      + '<div style="text-align:left;flex-shrink:0">'
      + '<div style="font-size:13px;color:#F5A623">' + stars + '</div>'
      + (s.rating_count > 0 ? '<div style="font-size:10px;color:#9ca3af;text-align:center">' + s.rating_count + ' تقييم</div>' : '')
      + '</div></div>'
      + '<div style="font-size:12px;color:#6b7280">' + esc(s.description||'') + '</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap">' + prods + '</div>'
      + '<div style="display:flex;gap:12px;font-size:12px;color:#6b7280">'
      + '<span>📍 ' + esc(s.regions||'') + '</span>'
      + (s.price_range ? '<span>💰 ' + esc(s.price_range) + '</span>' : '')
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:4px">'
      + '<button onclick="openQuoteModal(' + s.id + ')" style="flex:1;background:var(--brand,#1B5E30);border:none;color:#fff;padding:8px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">💰 طلب عرض سعر</button>'
      + '<a href="https://wa.me/2' + s.phone + '?text=' + encodeURIComponent('أهلاً، أنا مشترك في أريج أكاديمي وعايز أعرف أسعاركم على ' + s.products) + '" target="_blank" style="background:#25D366;border:none;color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;display:flex;align-items:center">📲</a>'
      + '<button onclick="openRateModal(' + s.id + ',\'' + esc(s.name) + '\')" style="background:#f9fafb;border:1.5px solid #e5e7eb;color:#6b7280;padding:8px 10px;border-radius:8px;font-size:12px;cursor:pointer">⭐</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function renderStars(rating) {
  const r = Math.round(rating * 2) / 2;
  let s = '';
  for (let i = 1; i <= 5; i++) {
    if (r >= i) s += '★';
    else if (r >= i - 0.5) s += '½';
    else s += '☆';
  }
  return s + (rating > 0 ? ' ' + rating.toFixed(1) : ' جديد');
}

function openQuoteModal(supplierId) {
  const s = marketSuppliersCache.find(x => x.id === supplierId);
  if (!s) return;
  document.getElementById('quote-supplier-id').value = supplierId;
  document.getElementById('quote-supplier-info').innerHTML =
    '<div style="font-weight:700;color:var(--brand,#1B5E30)">' + esc(s.name) + '</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:2px">' + esc(s.products) + ' | ' + esc(s.regions) + '</div>';
  document.getElementById('quote-product').value = '';
  document.getElementById('quote-qty').value = '';
  document.getElementById('quote-specs').value = '';
  document.getElementById('quote-message').value = '';
  document.getElementById('quoteModal').classList.remove('hidden');
}

async function submitQuoteRequest() {
  const supplier_id = parseInt(document.getElementById('quote-supplier-id').value);
  const product_type = document.getElementById('quote-product').value.trim();
  const quantity = document.getElementById('quote-qty').value;
  const specs = document.getElementById('quote-specs').value.trim();
  const message = document.getElementById('quote-message').value.trim();
  if (!product_type) { showToast('أدخل نوع المنتج'); return; }
  const d = await apiFetch('/api/system/marketplace/quote', {
    method: 'POST',
    body: JSON.stringify({ supplier_id, product_type, quantity, specs, message })
  });
  if (d.ok) {
    closeModal('quoteModal');
    showToast('✅ تم إرسال طلب عرض السعر!');
    showMarketTab('my-quotes');
    loadMyQuotes();
  } else {
    showToast('❌ ' + (d.error||'خطأ'));
  }
}

async function loadMyQuotes() {
  const el = document.getElementById('mkt-quotes-list');
  const d = await apiFetch('/api/system/marketplace/my-quotes');
  const quotes = d.quotes || [];
  if (!quotes.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">لم تطلب عروض أسعار بعد — اضغط "تصفح الموردين" وطلب عرض سعر</div>';
    return;
  }
  const statusColors = { new:'#F5A623', contacted:'#3b82f6', deal:'#16a34a', cancelled:'#ef4444' };
  const statusLabels = { new:'جديد', contacted:'تم التواصل', deal:'اتفاق', cancelled:'ملغي' };
  el.innerHTML = quotes.map(q => {
    const color = statusColors[q.status] || '#9ca3af';
    const label = statusLabels[q.status] || q.status;
    return '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<div style="font-weight:700;font-size:13px">' + esc(q.supplier_name) + '</div>'
      + '<span style="background:' + color + '20;color:' + color + ';padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700">' + label + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#374151;margin-bottom:4px">' + esc(q.product_type) + (q.quantity ? ' — ' + q.quantity + ' قطعة' : '') + '</div>'
      + (q.specs ? '<div style="font-size:11px;color:#6b7280">' + esc(q.specs) + '</div>' : '')
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">'
      + '<div style="font-size:10px;color:#9ca3af">' + (q.created_at ? new Date(q.created_at).toLocaleDateString('ar-EG') : '') + '</div>'
      + '<a href="https://wa.me/2' + q.supplier_phone + '" target="_blank" style="background:#25D366;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">📲 واتساب المورد</a>'
      + '</div></div>';
  }).join('');
}

let rateModalSuppId = null;
function openRateModal(suppId, suppName) {
  rateModalSuppId = suppId;
  let html = '<div style="text-align:center;padding:20px">'
    + '<div style="font-size:14px;font-weight:700;margin-bottom:12px">⭐ قيّم ' + esc(suppName) + '</div>'
    + '<div style="display:flex;justify-content:center;gap:8px;margin-bottom:12px">';
  for (let i = 1; i <= 5; i++) {
    html += '<button onclick="selectRating(' + i + ')" id="star-' + i + '" style="font-size:28px;background:none;border:none;cursor:pointer">☆</button>';
  }
  html += '</div>'
    + '<textarea id="rate-comment" rows="2" placeholder="رأيك في المورد..." style="width:100%;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;margin-bottom:10px"></textarea>'
    + '<button onclick="submitRating()" class="btn btn-primary" style="width:100%">إرسال التقييم</button>'
    + '</div>';
  // Use a simple alert-style modal
  let m = document.getElementById('rateModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'rateModal';
    m.className = 'overlay hidden';
    m.onclick = (e) => { if (e.target === m) m.classList.add('hidden'); };
    m.innerHTML = '<div class="modal" style="max-width:360px"><div class="modal-body" id="rate-modal-body"></div></div>';
    document.body.appendChild(m);
  }
  document.getElementById('rate-modal-body').innerHTML = html;
  m.classList.remove('hidden');
}

let selectedRating = 0;
function selectRating(r) {
  selectedRating = r;
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById('star-' + i);
    if (btn) btn.textContent = i <= r ? '★' : '☆';
  }
}

async function submitRating() {
  if (!selectedRating) { showToast('اختار عدد النجوم'); return; }
  const comment = document.getElementById('rate-comment').value.trim();
  const d = await apiFetch('/api/system/marketplace/rate', {
    method: 'POST',
    body: JSON.stringify({ supplier_id: rateModalSuppId, rating: selectedRating, comment })
  });
  if (d.ok) {
    document.getElementById('rateModal').classList.add('hidden');
    showToast('✅ شكراً — تم إرسال التقييم');
    loadMarketplaceSuppliers();
  }
}


// ============================================================
// INBOX PHASE 2: LABELS + NOTES + KEYWORDS
// ============================================================

// ── Keywords ──
let keywordsCache = [];
async function loadKeywordsList() {
  const d = await apiFetch('/api/system/inbox/keywords');
  keywordsCache = d.keywords || [];
  const el = document.getElementById('keywords-list');
  if (!el) return;
  if (!keywordsCache.length) { el.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:10px">لا توجد كلمات — أضف أول</div>'; return; }
  el.innerHTML = keywordsCache.map(k =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px">'
    +'<div><strong>"'+esc(k.keyword)+'"</strong> → <span style="color:#6b7280">'+esc(k.reply.substring(0,40))+'</span></div>'
    +'<div style="display:flex;gap:4px">'
    +'<button onclick="toggleKeyword('+k.id+','+(k.active?0:1)+')" style="font-size:10px;padding:2px 6px;border-radius:4px;border:none;cursor:pointer;background:'+(k.active?'#dcfce7':'#fee2e2')+';color:'+(k.active?'#16a34a':'#ef4444')+'">'+( k.active?'نشط':'موقوف')+'</button>'
    +'<button onclick="deleteKeyword('+k.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">🗑️</button>'
    +'</div></div>'
  ).join('');
}
async function addKeyword() {
  const word = document.getElementById('new-kw-word')?.value.trim();
  const reply = document.getElementById('new-kw-reply')?.value.trim();
  if (!word || !reply) { showToast('أدخل الكلمة والرد'); return; }
  const d = await apiFetch('/api/system/inbox/keywords', { method:'POST', body:JSON.stringify({keyword:word,reply}) });
  if (d.ok) { document.getElementById('new-kw-word').value=''; document.getElementById('new-kw-reply').value=''; showToast('✅ تمت الإضافة'); loadKeywordsList(); }
  else showToast('❌ '+(d.error||'خطأ'));
}
async function toggleKeyword(id, active) { await apiFetch('/api/system/inbox/keywords/'+id,{method:'PUT',body:JSON.stringify({active})}); loadKeywordsList(); }
async function deleteKeyword(id) { if(!confirm('حذف؟')) return; await apiFetch('/api/system/inbox/keywords/'+id,{method:'DELETE'}); loadKeywordsList(); }

// ── Labels ──
let labelsCache = [];
async function loadLabelsList() {
  const d = await apiFetch('/api/system/inbox/labels');
  labelsCache = d.labels || [];
  const el = document.getElementById('labels-list');
  if (!el) return;
  if (!labelsCache.length) { el.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:10px">لا توجد تسميات</div>'; return; }
  el.innerHTML = labelsCache.map(l =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f3f4f6">'
    +'<div style="display:flex;align-items:center;gap:6px">'
    +'<span style="width:12px;height:12px;border-radius:50%;background:'+l.color+';display:inline-block"></span>'
    +'<span style="font-size:12px;font-weight:600">'+esc(l.name)+'</span></div>'
    +'<button onclick="deleteLabel('+l.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">🗑️</button>'
    +'</div>'
  ).join('');
}
async function addLabel() {
  const name = document.getElementById('new-label-name')?.value.trim();
  const color = document.getElementById('new-label-color')?.value || '#1B5E30';
  if (!name) { showToast('أدخل اسم التسمية'); return; }
  const d = await apiFetch('/api/system/inbox/labels',{method:'POST',body:JSON.stringify({name,color})});
  if (d.ok) { document.getElementById('new-label-name').value=''; showToast('✅ تمت الإضافة'); loadLabelsList(); }
  else showToast('❌ '+(d.error||'خطأ'));
}
async function deleteLabel(id) { if(!confirm('حذف؟')) return; await apiFetch('/api/system/inbox/labels/'+id,{method:'DELETE'}); loadLabelsList(); }

async function openConvLabels() {
  if (!inboxCurrentConv) return;
  const [dl, dconv] = await Promise.all([
    apiFetch('/api/system/inbox/labels'),
    apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/labels')
  ]);
  const allLabels = dl.labels||[];
  const convLabels = (dconv.labels||[]).map(l=>l.id);
  let modal = document.getElementById('convLabelsModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id='convLabelsModal'; modal.className='overlay hidden';
    modal.onclick=(e)=>{if(e.target===modal)modal.classList.add('hidden');};
    document.body.appendChild(modal);
  }
  modal.innerHTML = '<div class="modal" style="max-width:360px"><div class="modal-title">🏷️ تسميات المحادثة<button onclick="document.getElementById(\'convLabelsModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
    +'<div class="modal-body">'+(allLabels.length?allLabels.map(l=>
      '<label style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;cursor:pointer">'
      +'<input type="checkbox" '+(convLabels.includes(l.id)?'checked':'')+' onchange="toggleConvLabel('+inboxCurrentConv.id+','+l.id+',this.checked)" style="width:16px;height:16px">'
      +'<span style="width:12px;height:12px;border-radius:50%;background:'+l.color+'"></span>'
      +'<span style="font-size:13px;font-weight:600">'+esc(l.name)+'</span></label>'
    ).join(''):'<div style="color:#9ca3af;font-size:12px;text-align:center;padding:16px">لا توجد تسميات — أضف من الإعدادات</div>')+'</div></div>';
  modal.classList.remove('hidden');
}
async function toggleConvLabel(convId, labelId, add) {
  const url = '/api/system/inbox/conversations/'+convId+'/labels/'+labelId;
  await apiFetch(url, { method: add?'POST':'DELETE' });
}

async function openConvNotes() {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/notes');
  const notes = d.notes||[];
  let modal = document.getElementById('convNotesModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id='convNotesModal'; modal.className='overlay hidden';
    modal.onclick=(e)=>{if(e.target===modal)modal.classList.add('hidden');};
    document.body.appendChild(modal);
  }
  modal.innerHTML = '<div class="modal" style="max-width:420px"><div class="modal-title">📌 ملاحظات داخلية<button onclick="document.getElementById(\'convNotesModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
    +'<div class="modal-body">'
    +(notes.map(n=>'<div style="background:#fef9c3;border-radius:8px;padding:10px;margin-bottom:8px">'
      +'<div style="font-size:12px;color:#374151">'+esc(n.content)+'</div>'
      +'<div style="font-size:10px;color:#9ca3af;margin-top:3px">'+(n.author_name||'أدمين')+' — '+(n.created_at||'').substring(0,16).replace('T',' ')+'</div>'
      +'</div>').join(''))
    +'<div style="margin-top:8px"><textarea id="new-conv-note" rows="2" placeholder="ملاحظة داخلية — لن يراها العميل..." style="width:100%;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;resize:vertical"></textarea>'
    +'<button onclick="addConvNote()" class="btn btn-primary" style="width:100%;margin-top:6px;font-size:12px">➕ إضافة ملاحظة</button></div>'
    +'</div></div>';
  modal.classList.remove('hidden');
}
async function addConvNote() {
  const content = document.getElementById('new-conv-note')?.value.trim();
  if (!content || !inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/notes',{method:'POST',body:JSON.stringify({content})});
  if (d.ok) { showToast('✅ تمت الإضافة'); openConvNotes(); }
  else showToast('❌ '+(d.error||'خطأ'));
}

// ── Conversation Status ──
async function changeConvStatus(status) {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/status', { method:'PUT', body:JSON.stringify({status}) });
  if (d.ok) {
    inboxCurrentConv.status = status;
    showToast(status==='closed'?'☑️ محادثة مغلقة':status==='waiting'?'⏳ في الانتظار':'🟢 مفتوحة');
    loadInboxConversations();
  }
}

// ── Assignment ──
let agentsCache = [];
async function openAssignModal() {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/agents');
  agentsCache = d.agents || [];
  let modal = document.getElementById('assignModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id='assignModal'; modal.className='overlay hidden';
    modal.onclick=(e)=>{if(e.target===modal)modal.classList.add('hidden');};
    document.body.appendChild(modal);
  }
  modal.innerHTML = '<div class="modal" style="max-width:340px"><div class="modal-title">👥 تعيين محادثة<button onclick="document.getElementById(\'assignModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
    +'<div class="modal-body">'
    +agentsCache.map(a =>
      '<div onclick="assignConv('+a.id+',\''+esc(a.name)+'\')" style="padding:10px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:8px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
      '<div style="width:30px;height:30px;border-radius:50%;background:var(--brand,#1B5E30)22;display:flex;align-items:center;justify-content:center;font-size:14px">'+(a.is_owner?'👑':'👤')+'</div>' +
      '<div><div style="font-size:13px;font-weight:600">'+esc(a.name)+'</div><div style="font-size:11px;color:#9ca3af">'+(a.is_owner?'مالك':'موظف')+'</div></div>' +
      '</div>'
    ).join('')
    +'<div onclick="assignConv(null,\'\')" style="padding:10px;cursor:pointer;color:#ef4444;font-size:12px;text-align:center">إلغاء التعيين</div>'
    +'</div></div>';
  modal.classList.remove('hidden');
}
async function assignConv(userId, userName) {
  if (!inboxCurrentConv) return;
  document.getElementById('assignModal').classList.add('hidden');
  const d = await apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/assign', { method:'POST', body:JSON.stringify({user_id:userId,user_name:userName}) });
  if (d.ok) {
    showToast(userId ? '✅ تم التعيين لـ '+userName : '✅ إلغاء التعيين');
    const badge = document.getElementById('conv-assigned-badge');
    if (badge) { badge.style.display = userId ? 'block' : 'none'; badge.textContent = userId ? '👥 معين لـ '+userName : ''; }
  }
}

// ── CSAT ──
async function sendCSATRequest() {
  if (!inboxCurrentConv) return;
  const conv = inboxCurrentConv;
  const phone = conv.sender_phone || conv.sender_id;
  const settings = await apiFetch('/api/system/inbox/settings');
  if (!settings.settings?.telegram_token && !phone) { showToast('لا يوجد طريقة إرسال'); return; }
  const crypto_token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  // Save token to conversation
  await apiFetch('/api/system/inbox/conversations/'+conv.id+'/csat-token', { method:'POST', body:JSON.stringify({token:crypto_token}) });
  const csatUrl = window.location.origin + '/csat/' + crypto_token;
  const msg = 'شكراً لتواصلك! 🌿\n\nنفتخر برأيك. كيف كانت تجربتك معنا؟\n\nتقييمك يخصص خدمتنا لك: ' + csatUrl;
  const ta = document.getElementById('inbox-reply-text');
  if (ta) ta.value = msg;
  showToast('✅ تم وضع رسالة التقييم — اضغط إرسال');
}

// ── Message Search Modal ──
function openInboxSearch() {
  let modal = document.getElementById('inboxSearchModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id='inboxSearchModal'; modal.className='overlay hidden';
    modal.onclick=(e)=>{if(e.target===modal)modal.classList.add('hidden');};
    modal.innerHTML = '<div class="modal" style="max-width:520px">'
      +'<div class="modal-title">🔍 بحث في الرسائل<button onclick="document.getElementById(\'inboxSearchModal\').classList.add(\'hidden\')" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:auto">✕</button></div>'
      +'<div class="modal-body">'
      +'<div style="display:flex;gap:8px;margin-bottom:12px"><input id="inbox-search-q" placeholder="ابحث في نص الرسائل..." style="flex:1;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px" onkeydown="if(event.key===\'Enter\')doInboxSearch()">'
      +'<button onclick="doInboxSearch()" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">بحث</button></div>'
      +'<div id="inbox-search-results" style="max-height:300px;overflow-y:auto"></div>'
      +'</div></div>';
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('inbox-search-q')?.focus(), 100);
}

async function doInboxSearch() {
  const q = document.getElementById('inbox-search-q')?.value.trim();
  if (!q) return;
  const d = await apiFetch('/api/system/inbox/search?q='+encodeURIComponent(q));
  const el = document.getElementById('inbox-search-results');
  if (!el) return;
  const results = d.results || {};
  const msgs = results.messages || [];
  const convs = results.conversations || [];
  if (!msgs.length && !convs.length) { el.innerHTML='<div style="text-align:center;padding:20px;color:#9ca3af">لا توجد نتائج</div>'; return; }
  let html = '';
  if (convs.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:6px">محادثات</div>';
    html += convs.map(c =>
      '<div onclick="selectConvFromSearch('+c.id+')" style="padding:8px;cursor:pointer;border-radius:8px;border:1px solid #f3f4f6;margin-bottom:4px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
      '<div style="font-weight:600;font-size:12px">'+esc(c.sender_name||c.sender_id)+'</div>' +
      '<div style="font-size:11px;color:#9ca3af">'+esc(c.platform)+'</div></div>'
    ).join('');
  }
  if (msgs.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#9ca3af;margin:8px 0 6px">رسائل ('+msgs.length+')</div>';
    html += msgs.map(m =>
      '<div onclick="selectConvFromSearch('+m.conversation_id+')" style="padding:8px;cursor:pointer;border-radius:8px;border:1px solid #f3f4f6;margin-bottom:4px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">' +
      '<div style="font-size:11px;font-weight:600">'+esc(m.sender_name||'')+'</div>' +
      '<div style="font-size:12px;color:#374151">'+esc((m.content||'').substring(0,60))+'</div>' +
      '<div style="font-size:10px;color:#9ca3af">'+(m.sent_at||'').substring(0,16).replace('T',' ')+'</div></div>'
    ).join('');
  }
  el.innerHTML = html;
}

function selectConvFromSearch(convId) {
  document.getElementById('inboxSearchModal')?.classList.add('hidden');
  // Switch to all platform tab and open conversation
  switchInboxPlatform('', document.querySelector('.inbox-ptab'));
  openConversation(convId);
}

// show labels/notes buttons when conversation opens
function showInboxConvButtons(show) {
  ['inbox-labels-btn','inbox-notes-btn'].forEach(id => {
    const el = document.getElementById(id); if(el) el.style.display = show ? 'block' : 'none';
  });
}

// ============================================================
// INBOX MEDIA SUPPORT
// ============================================================
let inboxPendingMedia = null;

function handleInboxFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  inboxPendingMedia = file;
  // Show preview
  const preview = document.getElementById('inbox-media-preview');
  const nameEl = document.getElementById('inbox-media-name');
  const sizeEl = document.getElementById('inbox-media-size');
  const iconEl = document.getElementById('inbox-media-icon');
  const imgWrap = document.getElementById('inbox-img-preview-wrap');
  const imgEl = document.getElementById('inbox-img-preview');
  if (preview) preview.style.display = 'block';
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = (file.size / 1024).toFixed(0) + ' KB';
  // Icon
  const icons = { image:'🖼️', video:'🎬', audio:'🎵', pdf:'📄', default:'📎' };
  const typeKey = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.name.endsWith('.pdf') ? 'pdf' : 'default';
  if (iconEl) iconEl.textContent = icons[typeKey];
  // Image preview
  if (typeKey === 'image' && imgWrap && imgEl) {
    imgWrap.style.display = 'block';
    const reader = new FileReader();
    reader.onload = e => { imgEl.src = e.target.result; };
    reader.readAsDataURL(file);
  } else if (imgWrap) {
    imgWrap.style.display = 'none';
  }
}

function cancelMediaUpload() {
  inboxPendingMedia = null;
  const preview = document.getElementById('inbox-media-preview');
  if (preview) preview.style.display = 'none';
  const imgWrap = document.getElementById('inbox-img-preview-wrap');
  if (imgWrap) imgWrap.style.display = 'none';
}

async function uploadInboxMedia(file) {
  const progress = document.getElementById('inbox-upload-progress');
  const bar = document.getElementById('inbox-upload-bar');
  if (progress) progress.style.display = 'block';
  const formData = new FormData();
  formData.append('file', file);
  // Simulate progress
  let pct = 0;
  const timer = setInterval(() => { pct = Math.min(pct+15, 85); if(bar) bar.style.width=pct+'%'; }, 200);
  try {
    const r = await fetch('/api/system/inbox/upload-media', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    const d = await r.json();
    clearInterval(timer);
    if (bar) bar.style.width = '100%';
    setTimeout(() => { if(progress) progress.style.display='none'; if(bar) bar.style.width='0%'; }, 500);
    return d;
  } catch(e) {
    clearInterval(timer);
    if (progress) progress.style.display = 'none';
    return { ok: false, error: e.message };
  }
}

// Render media in messages
function renderMediaMessage(m) {
  const isOut = m.direction === 'out';
  const cls = isOut ? 'msg-out' : 'msg-in';
  const t = m.sent_at ? new Date(m.sent_at).toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) : '';
  const time = '<div style="font-size:9px;opacity:.6;margin-top:3px;text-align:'+(isOut?'left':'right')+'">'+t+'</div>';
  
  // Determine media URL: prefer media_url, fall back to platform_msg_id if it looks like a URL
  const mediaType = m.media_type || m.message_type;
  let mediaUrl = m.media_url || (m.platform_msg_id && (m.platform_msg_id.startsWith('http') || m.platform_msg_id.startsWith('/')) ? m.platform_msg_id : null);
  
  // If file_id exists: always use proxy URL (never expires) — include token for new-tab access
  if (m.file_id && (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio' || mediaType === 'voice' || mediaType === 'file' || mediaType === 'document' || mediaType === 'sticker')) {
    mediaUrl = '/api/system/inbox/media-proxy/' + m.id + '?_t=' + encodeURIComponent(getToken());
  }
  // If no URL but has file_id: render placeholder with resolve button
  const hasFileId = m.file_id && !mediaUrl;
  
  // === IMAGE ===
  if (mediaType === 'image') {
    if (mediaUrl) {
      return '<div class="'+cls+'" style="padding:4px">'+
        '<img src="'+mediaUrl+'" style="max-width:220px;max-height:200px;border-radius:10px;object-fit:cover;display:block;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)" '+
        'onclick="openLightbox(\''+mediaUrl.replace(/'/g,"\\'")+'\')" loading="lazy" onerror="this.style.display=\'none\'">'+
        (m.content && m.content !== '[مرفق]' && m.content !== '[image]' ? '<div style="font-size:12px;margin-top:4px;color:#374151">'+esc(m.content)+'</div>' : '')+
        time+'</div>';
    }
  }
  
  // === AUDIO / VOICE ===
  if (mediaType === 'audio' || mediaType === 'voice') {
    if (mediaUrl) {
      return '<div class="'+cls+'" style="min-width:200px">'+
        '<div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:8px;padding:8px">'+
        '<span style="font-size:18px">🎙️</span>'+
        '<audio controls src="'+mediaUrl+'" style="flex:1;height:32px;max-width:200px"></audio>'+
        '</div>'+
        (m.content && m.content !== '[مرفق]' && m.content !== '[audio]' && m.content !== '[voice]' ? '<div style="font-size:11px;margin-top:3px;color:#6b7280">'+esc(m.content)+'</div>' : '')+
        time+'</div>';
    }
  }
  
  // === VIDEO ===
  if (mediaType === 'video') {
    if (mediaUrl) {
      return '<div class="'+cls+'" style="padding:4px">'+
        '<video controls src="'+mediaUrl+'" style="max-width:220px;max-height:200px;border-radius:10px;display:block;box-shadow:0 2px 8px rgba(0,0,0,.15)" preload="metadata"></video>'+
        (m.content && m.content !== '[مرفق]' && m.content !== '[video]' ? '<div style="font-size:12px;margin-top:4px">'+esc(m.content)+'</div>' : '')+
        time+'</div>';
    }
  }
  
  // === STICKER ===
  if (mediaType === 'sticker') {
    if (mediaUrl) {
      return '<div class="'+cls+'" style="padding:4px">'+
        '<img src="'+mediaUrl+'" style="width:120px;height:120px;object-fit:contain" loading="lazy">'+
        time+'</div>';
    }
    return '<div class="'+cls+'">🎭 ملصق'+time+'</div>';
  }
  
  // === FILE / DOCUMENT ===
  if (mediaType === 'file' || mediaType === 'document') {
    if (mediaUrl) {
      const isProxy = mediaUrl.includes('/media-proxy/');
      // For proxy URLs, get ext from original content; for direct URLs use path
      const extSrc = isProxy ? (m.content || '') : mediaUrl;
      const ext = (extSrc.split('.').pop() || '').toUpperCase().split('?')[0].substring(0,4);
      const fileIcons = {'PDF':'📄','DOC':'📝','DOCX':'📝','XLS':'📊','XLSX':'📊','ZIP':'🗜️','RAR':'🗜️'};
      const fileIcon = fileIcons[ext] || '📎';
      const fileName = (m.content && !m.content.startsWith('[')) ? m.content : ('ملف' + (ext ? '.' + ext.toLowerCase() : ''));
      // For proxy links: intercept click — fetch first, show error toast if too_big
      const clickHandler = isProxy
        ? 'onclick="openProxyFile(event,\'' + mediaUrl.replace(/'/g,"\\'") + '\')" '
        : '';
      return '<div class="'+cls+'">'+
        '<a href="'+mediaUrl+'" target="_blank" '+clickHandler+'style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit;background:rgba(0,0,0,.04);border-radius:8px;padding:8px">'+
        '<span style="font-size:24px">'+fileIcon+'</span>'+
        '<div><div style="font-size:12px;font-weight:600;color:#374151">'+esc(fileName)+'</div>'+
        '<div style="font-size:10px;color:#6b7280">'+(ext||'FILE')+' • اضغط للمعاينة / التحميل</div></div>'+
        '</a>'+time+'</div>';
    }
  }
  
  // === Media with file_id but no URL (old messages) ===
  if (hasFileId && (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio' || mediaType === 'file' || mediaType === 'document')) {
    const typeLabel = mediaType === 'image' ? '🖼️ صورة' : mediaType === 'video' ? '🎥 فيديو' : mediaType === 'audio' ? '🎙️ صوت' : '📎 ملف';
    return '<div class="'+cls+'">' +
      '<div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:8px;padding:8px;cursor:pointer" onclick="resolveAndShowMedia('+m.id+',this)" title="اضغط لتحميل الميديا">' +
      '<span style="font-size:18px">'+typeLabel.split('  ')[0]+'</span>' +
      '<div><div style="font-size:12px;font-weight:600;color:#374151">'+typeLabel+'</div>'+
      '<div style="font-size:10px;color:#6b7280">اضغط لعرض</div></div>'+
      '</div>'+
      (m.content && m.content !== '[مرفق]' && !m.content.startsWith('[') ? '<div style="font-size:11px;margin-top:3px;color:#6b7280">'+esc(m.content)+'</div>' : '')+
      time+'</div>';
  }

  // === Default TEXT ===
  const contentText = m.content || '';
  return '<div class="'+cls+'"><span style="white-space:pre-wrap">'+esc(contentText)+'</span>'+time+'</div>';
}

// Open proxy file — check for errors (too big) before opening new tab
async function openProxyFile(e, url) {
  e.preventDefault();
  // Quick HEAD check
  try {
    const resp = await fetch(url, { method: 'HEAD', headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (resp.status === 413) {
      showToast('⚠️ الملف أكبر من 20MB — حد Telegram Bot API\nيمكن للمرسل إرساله كرابط خارجي بدلاً من ملف مرفق');
      return;
    }
    if (resp.status === 200) {
      window.open(url, '_blank');
      return;
    }
    // Fallback: try to read JSON error
    const text = await (await fetch(url)).text();
    try {
      const d = JSON.parse(text);
      if (d.too_big) {
        showToast('⚠️ الملف أكبر من 20MB — حد Telegram Bot API');
        return;
      }
    } catch(ignored) {}
    window.open(url, '_blank');
  } catch(e) {
    window.open(url, '_blank');
  }
}

async function resolveAndShowMedia(msgId, container) {
  container.innerHTML = '<span style="font-size:11px;color:#6b7280">جاري التحميل...</span>';
  const d = await apiFetch('/api/system/inbox/resolve-media/' + msgId);
  if (d.ok && d.media_url) {
    // Reload the conversation to show resolved media
    if (inboxCurrentConv) openConversation(inboxCurrentConv.id);
  } else {
    container.innerHTML = '<span style="font-size:11px;color:#ef4444">❌ تعذّر التحميل</span>';
  }
}

// Lightbox viewer for images
function openLightbox(url) {
  let lb = document.getElementById('inbox-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'inbox-lightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out';
    lb.onclick = () => lb.style.display='none';
    const img = document.createElement('img');
    img.id = 'inbox-lightbox-img';
    img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5);cursor:default';
    img.onclick = e => e.stopPropagation();
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:rgba(255,255,255,.2);border:none;color:#fff;font-size:20px;width:36px;height:36px;border-radius:50%;cursor:pointer';
    closeBtn.onclick = () => lb.style.display='none';
    const downloadBtn = document.createElement('a');
    downloadBtn.id = 'inbox-lightbox-dl';
    downloadBtn.textContent = '⬇️ تحميل';
    downloadBtn.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.2);color:#fff;padding:8px 20px;border-radius:20px;text-decoration:none;font-size:13px';
    downloadBtn.target = '_blank';
    lb.appendChild(closeBtn);
    lb.appendChild(img);
    lb.appendChild(downloadBtn);
    document.body.appendChild(lb);
  }
  document.getElementById('inbox-lightbox-img').src = url;
  document.getElementById('inbox-lightbox-dl').href = url;
  lb.style.display = 'flex';
}

// ============================================================
// INBOX CONTACT INFO PANEL
// ============================================================
let icpCurrentContactId = null;
let icpCurrentConvId = null;
let icpLastInvoiceId = null;

async function loadContactInfoPanel(conv) {
  const emptyEl = document.getElementById('icp-empty');
  const headerEl = document.getElementById('icp-header');
  if (!conv) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (headerEl) headerEl.style.display = 'none';
    ['icp-details','icp-actions','icp-orders','icp-balance'].forEach(id => {
      const el = document.getElementById(id); if(el) el.style.display='none';
    });
    return;
  }
  // Show header, hide empty
  if (emptyEl) emptyEl.style.display = 'none';
  if (headerEl) headerEl.style.display = 'block';
  icpCurrentConvId = conv.id;
  const platIcons = { telegram:'✈', whatsapp:'📱', messenger:'💬', instagram:'📷' };
  const platNames = { telegram:'تيليجرام', whatsapp:'واتساب', messenger:'ماسنجر', instagram:'إنستجرام' };
  // Avatar initials
  const nameText = conv.sender_name || conv.sender_id || '—';
  document.getElementById('icp-name').textContent = nameText;
  const avatarEl = document.getElementById('icp-avatar');
  if (avatarEl) {
    const initials = nameText.trim().split(' ').map(w=>w[0]).slice(0,2).join('');
    avatarEl.textContent = initials || nameText[0] || '?';
  }
  const platEl = document.getElementById('icp-platform');
  if (platEl) platEl.textContent = (platNames[conv.platform]||conv.platform||'');

  // Look up in CRM by phone
  const phone = conv.sender_phone || conv.sender_id;
  let contact = null;
  if (phone) {
    const d = await fetch('/api/crm/contacts/by-phone?phone='+encodeURIComponent(phone), { headers: hdr() }).then(r=>r.json()).catch(()=>({}));
    if (d.ok && d.contact) contact = d.contact;
  }
  icpCurrentContactId = contact ? contact.id : null;

  const detailsEl = document.getElementById('icp-details');
  const actionsEl = document.getElementById('icp-actions');
  const ordersEl  = document.getElementById('icp-orders');
  const balanceEl = document.getElementById('icp-balance');
  const addBtn     = document.getElementById('icp-btn-add');
  const catalogBtn  = document.getElementById('icp-btn-catalog');

  if (contact) {
    if (catalogBtn) catalogBtn.style.display = 'block';
    detailsEl.style.display = 'block';
    actionsEl.style.display = 'block';
    if (addBtn) addBtn.style.display = 'none';
    const _setIcp = (id, val) => { const v=document.getElementById(id+'-val'); if(v) v.textContent=val||'—'; };
    _setIcp('icp-phone', contact.phone);
    _setIcp('icp-email', contact.email);
    _setIcp('icp-city',  contact.city ? contact.city+(contact.governorate?' — '+contact.governorate:'') : '');
    const sc = { lead:'#9ca3af', prospect:'#F5A623', client:'#16a34a', vip:'#7c3aed' }[contact.status]||'#9ca3af';
    const sl = { lead:'Lead', prospect:'محتمل', client:'عميل', vip:'VIP' }[contact.status]||contact.status;
    document.getElementById('icp-crm-badges').innerHTML = '<span style="background:'+sc+'20;color:'+sc+';padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">'+sl+'</span>';

    // Load orders
    const dOrd = await apiFetch('/api/system/orders?limit=50');
    const orders = (dOrd.data||[]).filter(o=>o.contact_id==contact.id).slice(0,3);
    if (orders.length) {
      ordersEl.style.display = 'block';
      document.getElementById('icp-orders-list').innerHTML = orders.map(o => {
        const sc2 = { new:'#F5A623', preparing:'#F5A623', shipped:'#8b5cf6', delivered:'#16a34a', cancelled:'#ef4444' }[o.status]||'#9ca3af';
        const stLbl = (typeof ORD_STATUS_LABELS!=='undefined'?ORD_STATUS_LABELS:{})[o.status]||o.status;
        return `<div class="icp-v2-order-item">
          <span class="icp-v2-order-no">${esc(o.order_no)}</span>
          <span class="icp-v2-order-status" style="color:${sc2}">${esc(stLbl)}</span>
          <span style="font-size:10px;color:#9ca3af">${fmt(o.total)} ج.م</span>
        </div>`;
      }).join('');
    }

    // Load balance + last invoice
    const dBal = await fetch('/api/crm/contacts/'+contact.id+'/balance', { headers: hdr() }).then(r=>r.json()).catch(()=>({}));
    if (dBal.ok && dBal.contact) {
      const bal = dBal.contact.balance || 0;
      if (bal > 0) {
        balanceEl.style.display = 'block';
        document.getElementById('icp-balance-content').innerHTML =
          '<div style="background:#fef9c3;border-radius:8px;padding:8px;text-align:center">'
          +'<div style="font-size:10px;color:#92400e">ذمم عليه</div>'
          +'<div style="font-size:16px;font-weight:900;color:#92400e">'+fmt(bal)+' ج.م</div>'
          +'<button onclick="openPaymentModal('+contact.id+',\''+esc(contact.company_name||contact.name||'')+'\','+bal+')" style="background:#1B5E30;color:#fff;border:none;padding:5px 12px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer;margin-top:4px">💰 سجّل دفعة</button>'
          +'</div>';
      }
    }

    // Find last invoice
    const dInv = await apiFetch('/api/system/invoices?limit=10');
    const lastInv = (dInv.invoices||dInv.data||[]).filter(i=>i.contact_id==contact.id)[0];
    icpLastInvoiceId = lastInv ? lastInv.id : null;

  } else {
    // Not in CRM
    detailsEl.style.display = 'block';
    actionsEl.style.display = 'block';
    if (addBtn) addBtn.style.display = 'block';
    const _setIcp2 = (id, val) => { const v=document.getElementById(id+'-val'); if(v) v.textContent=val||'—'; };
    _setIcp2('icp-phone', phone);
    _setIcp2('icp-email', '');
    _setIcp2('icp-city',  '');
    document.getElementById('icp-crm-badges').innerHTML = '<span style="background:#fee2e2;color:#ef4444;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">غير مسجّل</span>';
    icpLastInvoiceId = null;
  }
}

function icpOpenProfile() {
  if (!icpCurrentContactId) return;
  const name = document.getElementById('icp-name').textContent;
  openClientProfile(icpCurrentContactId, name);
}

function icpNewInvoice() {
  showPage('invoices', document.querySelector('[data-page=invoices]'));
  setTimeout(() => openNewInvoice(), 300);
}

function icpNewOrder() {
  showPage('orders', document.querySelector('[data-page=orders]'));
  setTimeout(() => openNewOrder(), 300);
}

async function icpSendLastInvoice() {
  // Upgraded: show invoice selection modal instead of just putting link in text box
  if (!inboxCurrentConv) return showToast('اختار محادثة أولاً');
  
  let invoices = [];
  // Try to get invoices for this contact first
  if (icpCurrentContactId) {
    const d = await apiFetch('/api/system/invoices?limit=20');
    const all = d.invoices || d.data || [];
    invoices = all.filter(inv => inv.contact_id == icpCurrentContactId).slice(0, 8);
  }
  // Fallback: get recent invoices
  if (!invoices.length) {
    const d = await apiFetch('/api/system/invoices?limit=8');
    invoices = d.invoices || d.data || [];
  }
  if (!invoices.length) return showToast('لا توجد فواتير متاحة');
  
  // Remove any existing modal
  const existing = document.getElementById('inv-select-modal');
  if (existing) existing.remove();
  
  const statusBadge = (s) => s === 'paid' ? '<span style="color:#16a34a;font-size:10px">✅ مدفوعة</span>' :
                               s === 'partial' ? '<span style="color:#d97706;font-size:10px">🔶 جزئية</span>' :
                               '<span style="color:#9ca3af;font-size:10px">⏳ غير مدفوعة</span>';
  
  const modal = document.createElement('div');
  modal.id = 'inv-select-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:20px;width:380px;max-width:95vw;direction:rtl;font-family:Cairo,sans-serif;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:15px;font-weight:800;color:#111827">📄 إرسال فاتورة</div>
        <button onclick="closeInvoiceModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6b7280;line-height:1">✕</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px">اختار الفاتورة التي تريد إرسالها</div>
      ${invoices.map(inv => `
        <div onclick="sendSelectedInvoice(${inv.id})" 
          style="padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:.15s"
          onmouseenter="this.style.borderColor='#1B5E30';this.style.background='#f0fdf4'" 
          onmouseleave="this.style.borderColor='#e5e7eb';this.style.background='#fff'">
          <div>
            <div style="font-weight:700;font-size:13px;color:#111827">${inv.invoice_no || 'INV-' + inv.id}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${inv.client_name || inv.contact_name || ''}</div>
          </div>
          <div style="text-align:left">
            <div style="font-weight:700;font-size:13px;color:#1B5E30">${inv.total || 0} ج.م</div>
            <div style="margin-top:2px">${statusBadge(inv.status)}</div>
          </div>
        </div>
      `).join('')}
      <button onclick="closeInvoiceModal()" style="width:100%;padding:9px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-family:Cairo,sans-serif;cursor:pointer;font-size:13px;margin-top:4px;color:#6b7280">إلغاء</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeInvoiceModal() {
  const modal = document.getElementById('inv-select-modal');
  if (modal) modal.remove();
}

async function sendSelectedInvoice(invoiceId) {
  closeInvoiceModal();
  if (!inboxCurrentConv) return;
  showToast('⏳ جاري الإرسال...');
  const d = await apiFetch('/api/system/inbox/send-invoice', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: inboxCurrentConv.id, invoice_id: invoiceId })
  });
  if (d.ok) {
    showToast('✅ تم إرسال الفاتورة');
    openConversation(inboxCurrentConv.id);
    loadInboxConversations();
  } else {
    showToast('❌ ' + (d.error || 'خطأ في الإرسال'));
  }
}

async function icpSendCatalog() {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/catalog/send', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: inboxCurrentConv.id })
  });
  if (d.ok) showToast('✅ تم إرسال الكتالوج ('+d.products_sent+' منتج)');
  else showToast('❌ '+(d.error||'خطأ'));
}

function icpAddContact() {
  const name = document.getElementById('icp-name').textContent;
  const phone = inboxCurrentConv?.sender_phone || inboxCurrentConv?.sender_id || '';
  openAddContact();
  setTimeout(() => {
    const compEl = document.getElementById('c-company'); if(compEl) compEl.value = name;
    const phoneEl = document.getElementById('c-phone'); if(phoneEl) phoneEl.value = phone;
  }, 200);
}

// ============================================================
// UNIFIED INBOX
// ============================================================
let inboxCurrentConv = null;
let inboxCurrentPlatform = '';
let inboxConversationsCache = [];

// state لـ inbox scope
let inboxIsOwner = false;
let inboxAgentFilter = ''; // '' = all, 'unassigned' = غير معيّنة, '123' = user_id

async function loadInbox() {
  // نجيب معلومات المستخدم الحالي في الـ Inbox
  const me = await apiFetch('/api/system/inbox/me');
  if (me.ok) {
    inboxIsOwner = me.isOwner;
    renderInboxOwnerControls(me);
  }
  await loadInboxConversations();
  await loadInboxUnreadBadge();
  loadTemplatesList();
  loadSlashCommandTemplates();
  startInboxPolling();
}

function renderInboxOwnerControls(me) {
  const el = document.getElementById('inbox-owner-controls');
  if (!el) return;
  if (!me.isOwner && !me.canSeeAll) {
    // موظف عادي — يشوف محادثاته + Queue
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button onclick="inboxSetAgentFilter('')" id="inf-btn-mine" class="inf-filter-btn inf-filter-active" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1.5px solid var(--brand,#1B5E30);background:var(--brand,#1B5E30);color:#fff;cursor:pointer;font-family:Cairo,sans-serif">📬 محادثاتي (${me.myConvs})</button>
        <button onclick="inboxSetAgentFilter('unassigned')" id="inf-btn-queue" class="inf-filter-btn" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;color:#6b7280;cursor:pointer;font-family:Cairo,sans-serif">📥 Queue (${me.unassigned})</button>
      </div>`;
    return;
  }
  // Owner / يشوف الكل — فلتر بالموظف
  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <button onclick="inboxSetAgentFilter('')" class="inf-filter-btn inf-filter-active" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1.5px solid var(--brand,#1B5E30);background:var(--brand,#1B5E30);color:#fff;cursor:pointer;font-family:Cairo,sans-serif">📬 الكل</button>
      <button onclick="inboxSetAgentFilter('unassigned')" class="inf-filter-btn" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;color:#6b7280;cursor:pointer;font-family:Cairo,sans-serif">❔ غير معيّنة (${me.unassigned})</button>
      <select id="inbox-agent-filter-sel" onchange="inboxSetAgentFilter(this.value)" style="font-size:11px;padding:3px 8px;border-radius:8px;border:1.5px solid #e5e7eb;font-family:Cairo,sans-serif;color:#374151;cursor:pointer">
        <option value="">👤 كل الموظفين</option>
      </select>
    </div>`;
  // نحمل الموظفين
  apiFetch('/api/system/inbox/agents').then(d => {
    const sel = document.getElementById('inbox-agent-filter-sel');
    if (!sel || !d.ok) return;
    d.agents.forEach(a => {
      if (a.is_owner) return;
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = (a.agent_status === 'online' ? '🟢 ' : '⚪ ') + a.name + ' (' + (a.active_convs||0) + ')';
      sel.appendChild(opt);
    });
  });
}

function inboxSetAgentFilter(val) {
  inboxAgentFilter = val;
  // تحديث الأزرار
  document.querySelectorAll('.inf-filter-btn').forEach(b => {
    b.classList.remove('inf-filter-active');
    b.style.background = '#fff';
    b.style.color = '#6b7280';
    b.style.borderColor = '#e5e7eb';
  });
  const sel = document.getElementById('inbox-agent-filter-sel');
  if (sel) sel.value = typeof val === 'string' && val !== 'unassigned' ? val : '';
  loadInboxConversations();
}

async function loadInboxConversations() {
  const plat = inboxCurrentPlatform;
  let url = '/api/system/inbox/conversations?limit=100';
  if (plat) url += '&platform=' + plat;
  if (inboxAgentFilter) url += '&assigned_to=' + inboxAgentFilter;
  const d = await apiFetch(url);
  inboxIsOwner = d.isOwner;
  inboxConversationsCache = d.conversations || [];
  renderInboxConvList(inboxConversationsCache);
}

function renderInboxConvList(convs) {
  const el = document.getElementById('inbox-conv-list');
  // تحديث العداد
  const countEl = document.getElementById('inbox-v2-count');
  if (countEl) countEl.textContent = convs.length;

  if (!convs.length) {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:12px">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin:0 auto 10px;display:block"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${inboxCurrentPlatform ? 'لا توجد رسائل من هذه المنصة' : 'لا توجد رسائل — اربط منصة من الإعدادات'}
    </div>`;
    return;
  }

  const platDotClass = { telegram:'tg', whatsapp:'wa', 'whatsapp-qr':'waqr', messenger:'fb', instagram:'ig' };
  const platEmoji    = { telegram:'✈️', whatsapp:'💬', 'whatsapp-qr':'📱', messenger:'💙', instagram:'📸' };
  const platLabel    = { telegram:'تيليجرام', whatsapp:'واتساب', 'whatsapp-qr':'واتساب QR', messenger:'ماسنجر', instagram:'إنستجرام' };
  const avatarColors = ['#1B5E30','#0369a1','#7c3aed','#b45309','#be123c','#0f766e','#0891b2','#047857'];

  el.innerHTML = convs.map(c => {
    const nameText = c.sender_name || c.sender_id || '؟';
    const initials  = nameText.trim().split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase() || '؟';
    const avatarBg  = avatarColors[nameText.charCodeAt(0) % avatarColors.length];
    const platClass = platDotClass[c.platform] || 'other';
    const platEm    = platEmoji[c.platform] || '💬';
    const time      = c.last_message_at ? timeAgo(c.last_message_at) : '';
    const isActive  = inboxCurrentConv && inboxCurrentConv.id === c.id;
    const isUnread  = c.unread > 0;
    const status    = c.status || 'open';
    const lastMsg   = (c.last_message || '').substring(0, 60);

    const unreadBadge = isUnread
      ? `<span class="conv-v2-unread">${c.unread}</span>` : '';
    const statusDot = `<span class="conv-v2-status ${status}"></span>`;

    // agent badge (owner only)
    const agentMeta = inboxIsOwner
      ? (c.agent_name
          ? `<span style="font-size:9.5px;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:6px;font-weight:700">👤 ${esc(c.agent_name)}</span>`
          : `<span style="font-size:9.5px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:6px;font-weight:700">❔ غير معيّن</span>`)
      : '';

    return `<div class="conv-v2-item${isActive?' selected':''}${isUnread?' unread':''}" onclick="openConversation(${c.id})">
      <div class="conv-v2-avatar" style="background:${avatarBg}">
        ${initials}
        <span class="plat-dot ${platClass}">${platEm.substring(0,1)}</span>
      </div>
      <div class="conv-v2-body">
        <div class="conv-v2-row1">
          <span class="conv-v2-name">${esc(nameText)}</span>
          <span class="conv-v2-time">${time}</span>
        </div>
        <div class="conv-v2-row2">
          <span class="conv-v2-preview">${esc(lastMsg)}</span>
          <div class="conv-v2-badges">${statusDot}${unreadBadge}</div>
        </div>
        ${agentMeta ? `<div class="conv-v2-meta">${agentMeta}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// فلتر الحالة الحالية
let _inboxStatusFilter = '';

function setInboxFilter(status, btn) {
  _inboxStatusFilter = status;
  document.querySelectorAll('.inbox-v2-filt').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filterInboxConversations();
}

function filterInboxConversations() {
  const q = (document.getElementById('inbox-search')?.value || '').toLowerCase();
  const statusFilter = _inboxStatusFilter ||
    document.getElementById('inbox-status-filter')?.value || '';
  let filtered = q
    ? inboxConversationsCache.filter(c =>
        (c.sender_name||'').toLowerCase().includes(q) ||
        (c.last_message||'').toLowerCase().includes(q)
      )
    : inboxConversationsCache;
  if (statusFilter) filtered = filtered.filter(c => (c.status||'open') === statusFilter);
  renderInboxConvList(filtered);
}

async function openConversation(convId) {
  const conv = inboxConversationsCache.find(c => c.id === convId);
  inboxCurrentConv = conv;
  // Show reply box
  const replyBox = document.getElementById('inbox-reply-box');
  if (replyBox) replyBox.style.display = conv ? 'block' : 'none';
  // Warm up mic in background (avoids 1-2s delay when user first presses record)
  if (conv && !cachedMicStream) {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => { cachedMicStream = s; })
      .catch(() => {}); // silent fail — no permission prompt yet
  }
  // Load contact panel
  loadContactInfoPanel(conv);
  // Show action buttons
  showInboxConvButtons(true);
  // Update conversation status select
  const statusSel = document.getElementById('conv-status-select');
  if (statusSel && conv) { statusSel.style.display='block'; statusSel.value = conv.status||'open'; }
  const assignBtn = document.getElementById('inbox-assign-btn');
  if (assignBtn && conv) assignBtn.style.display = 'block';
  const csatBtn = document.getElementById('inbox-csat-btn');
  if (csatBtn && conv) csatBtn.style.display = 'block';
  // Show assigned badge
  const badge = document.getElementById('conv-assigned-badge');
  if (badge && conv?.assigned_to_name) { badge.style.display='block'; badge.textContent='👥 معين لـ '+conv.assigned_to_name; }
  else if (badge) badge.style.display='none';
  // Highlight active
  renderInboxConvList(inboxConversationsCache);
  // Update header
  const platNames = { telegram:'تيليجرام', whatsapp:'واتساب', 'whatsapp-qr':'واتساب QR', messenger:'ماسنجر', instagram:'إنسجرام' };
  const platClasses = { telegram:'tg', whatsapp:'wa', 'whatsapp-qr':'waqr', messenger:'fb', instagram:'ig' };
  document.getElementById('inbox-chat-name').textContent = conv ? (conv.sender_name || conv.sender_id) : '';
  // تحديث الـ platform pill بالكلاس الصحيح
  const platEl = document.getElementById('inbox-chat-platform');
  if (platEl) {
    platEl.textContent = conv ? (platNames[conv.platform] || conv.platform) : '';
    platEl.className = 'chat-hdr-plat ' + (platClasses[conv?.platform] || '');
    platEl.style.display = conv ? 'inline-flex' : 'none';
  }
  // تحديث الـ avatar بالإنشيالز
  const hdrAvatar = document.getElementById('inbox-chat-avatar');
  if (hdrAvatar && conv) {
    const nm = conv.sender_name || conv.sender_id || '؟';
    const initials = nm.trim().split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase() || '؟';
    const avatarColors = ['#1B5E30','#0369a1','#7c3aed','#b45309','#be123c','#0f766e'];
    hdrAvatar.style.background = avatarColors[nm.charCodeAt(0) % avatarColors.length];
    hdrAvatar.textContent = initials;
  }
  const leadBtn = document.getElementById('inbox-lead-btn');
  const invBtn = document.getElementById('inbox-inv-btn');
  if (leadBtn) leadBtn.style.display = conv && !conv.lead_id ? 'block' : 'none';
  if (invBtn) invBtn.style.display = conv ? 'block' : 'none';
  // Load messages
  const msgsEl = document.getElementById('inbox-messages');
  msgsEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px">جاري التحميل...</div>';
  const d = await apiFetch('/api/system/inbox/messages/' + convId);
  const msgs = d.messages || [];
  if (!msgs.length) {
    msgsEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:60px">لا توجد رسائل</div>';
    return;
  }
  msgsEl.innerHTML = msgs.map(m => renderMediaMessage(m)).join('');
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function sendInboxReply() {
  if (!inboxCurrentConv) return;
  const ta = document.getElementById('inbox-reply-text');
  const text = ta.value.trim();

  // لو فيه media pending — ابعته أول
  if (inboxPendingMedia) {
    const file = inboxPendingMedia;
    inboxPendingMedia = null;
    cancelMediaUpload();
    const uploaded = await uploadInboxMedia(file);
    if (!uploaded.ok) { showToast('❌ خطأ في رفع الملف: ' + (uploaded.error||'?')); return; }
    const d = await apiFetch('/api/system/inbox/send-media', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: inboxCurrentConv.id,
        media_url: uploaded.url,
        media_type: uploaded.media_type,
        caption: text || null,
        original_name: file.name
      })
    });
    if (d.ok) {
      ta.value = '';
      openConversation(inboxCurrentConv.id);
      loadInboxConversations();
    } else showToast('❌ ' + (d.error||'?'));
    return;
  }

  if (!text) return;
  ta.value = '';
  const d = await apiFetch('/api/system/inbox/send', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: inboxCurrentConv.id, content: text })
  });
  if (d.ok) {
    openConversation(inboxCurrentConv.id);
    loadInboxConversations();
  } else {
    showToast('❌ ' + (d.error||'?'));
  }
}

async function convertToLead() {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/convert-lead/' + inboxCurrentConv.id, { method: 'POST' });
  if (d.ok) {
    const msg = d.existed ? '✅ العميل موجود بالفعل — تم ربط المحادثة' : '✅ تم إضافة كـ Lead في CRM';
    showToast(msg);
    document.getElementById('inbox-lead-btn').style.display = 'none';
    inboxCurrentConv.lead_id = d.lead_id;
    loadInboxConversations();
  }
}

function sendInvoiceLink() {
  // Delegate to the full invoice selection modal
  icpSendLastInvoice();
}

function showSettingsTab(tab, btn) {
  document.querySelectorAll('.stab').forEach(b => {
    b.style.background = '#fff';
    b.style.color = '#6b7280';
    b.style.borderColor = '#e5e7eb';
  });
  if (btn) {
    btn.style.background = 'var(--brand,#1B5E30)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--brand,#1B5E30)';
  }
  const allTabs = ['telegram','whatsapp','meta','templates','automsg','analytics','sla','drip','revenue','broadcast','chatbot','keywords','labels','automation','queue','adv-analytics'];
  allTabs.forEach(t => {
    const el = document.getElementById('stab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'templates') renderModalTemplates();
  if (tab === 'automsg') loadAutoMessages();
  if (tab === 'labels') loadLabelsList();
  if (tab === 'keywords') loadKeywordsList();
  if (tab === 'broadcast') loadBroadcasts();
  if (tab === 'analytics') loadInboxAnalytics();
  if (tab === 'sla') loadSLAData();
  if (tab === 'drip') loadDripCampaigns();
  if (tab === 'revenue') loadRevenueData();
  if (tab === 'automation') loadAutomationRules();
  if (tab === 'queue') loadQueueTab();
  if (tab === 'adv-analytics') loadAdvancedAnalytics();
  if (tab === 'chatbot') loadChatbotFlows();
}

async function loadAutoMessages() {
  const d = await apiFetch('/api/system/inbox/auto-messages');
  const s = d.settings || {};
  const welcomeActive = document.getElementById('auto-welcome-active');
  const welcomeMsg    = document.getElementById('auto-welcome-msg');
  const awayActive    = document.getElementById('auto-away-active');
  const awayMsg       = document.getElementById('auto-away-msg');
  const awayStart     = document.getElementById('auto-away-start');
  const awayEnd       = document.getElementById('auto-away-end');
  if (welcomeActive) welcomeActive.checked = !!s.welcome_active;
  if (welcomeMsg)    welcomeMsg.value = s.welcome_message || '';
  if (awayActive)    awayActive.checked = !!s.away_active;
  if (awayMsg)       awayMsg.value = s.away_message || '';
  if (awayStart)     awayStart.value = s.away_start || '22:00';
  if (awayEnd)       awayEnd.value = s.away_end || '09:00';
}

// ── Broadcast ──
async function loadBroadcasts() {
  const d = await apiFetch('/api/system/inbox/broadcasts');
  const el = document.getElementById('broadcasts-list');
  if (!el) return;
  const broadcasts = d.broadcasts||[];
  if (!broadcasts.length) { el.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:10px">لا توجد حملات</div>'; return; }
  el.innerHTML = broadcasts.map(b => {
    const sc = { draft:'#9ca3af', sent:'#16a34a', failed:'#ef4444' }[b.status]||'#9ca3af';
    return '<div style="border:1px solid #f3f4f6;border-radius:8px;padding:8px;margin-bottom:6px">'
      +'<div style="display:flex;justify-content:space-between;font-size:12px">'
      +'<span style="font-weight:700">'+esc(b.title||'')+'</span>'
      +'<span style="color:'+sc+'">'+(b.status==='sent'?b.sent_count+' أرسلت':b.status)+'</span>'
      +'</div>'
      +(b.status==='draft'?'<button onclick="sendBroadcastNow('+b.id+')" style="background:#1B5E30;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer;margin-top:4px">📢 إرسال</button>':'')
      +'</div>';
  }).join('');
}

async function sendBroadcast() {
  const title = document.getElementById('bc-title')?.value.trim();
  const message = document.getElementById('bc-message')?.value.trim();
  if (!title || !message) { showToast('أدخل العنوان والرسالة'); return; }
  const res = document.getElementById('bc-result');
  if (res) res.textContent = 'جاري الإرسال...';
  // Create then send
  const d1 = await apiFetch('/api/system/inbox/broadcasts', { method:'POST', body:JSON.stringify({name:title,message,platform:'telegram'}) });
  if (!d1.ok) { if(res) res.textContent='❌ '+(d1.error||'خطأ'); return; }
  const d2 = await apiFetch('/api/system/inbox/broadcasts/'+d1.id+'/send', { method:'POST' });
  if (d2.ok) {
    if (res) res.innerHTML = '<span style="color:#16a34a">✅ تم الإرسال | أرسلت: '+d2.sent+' | فشل: '+d2.failed+'</span>';
    document.getElementById('bc-title').value='';
    document.getElementById('bc-message').value='';
    loadBroadcasts();
  } else {
    if (res) res.innerHTML='<span style="color:#CC2200">❌ '+(d2.error||'خطأ')+'</span>';
  }
}

async function sendBroadcastNow(id) {
  const d = await apiFetch('/api/system/inbox/broadcasts/'+id+'/send', { method:'POST' });
  if (d.ok) { showToast('✅ تم الإرسال: '+d.sent); loadBroadcasts(); bc2LoadHistory(); }
  else showToast('❌ '+(d.error||'خطأ'));
}

// ── Broadcast v2 (is-section-broadcast-send) ──
let bc2ContactsLoaded = false;

function bc2ToggleContacts(val) {
  const el = document.getElementById('bc2-contacts-list');
  if (!el) return;
  if (val === 'select') {
    el.style.display = 'block';
    if (!bc2ContactsLoaded) bc2LoadContacts();
  } else {
    el.style.display = 'none';
  }
}

async function bc2LoadContacts() {
  const el = document.getElementById('bc2-contacts-list');
  if (!el) return;
  const d = await apiFetch('/api/system/inbox/conversations?platform=telegram&limit=200');
  const convs = d.conversations || d.data || [];
  bc2ContactsLoaded = true;
  if (!convs.length) { el.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:8px">لا توجد محادثات تيليجرام</div>'; return; }
  el.innerHTML = convs.map(c =>
    `<label style="display:flex;align-items:center;gap:8px;padding:5px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
      <input type="checkbox" class="bc2-contact-cb" value="${c.id}">
      <span style="font-size:12px">${esc(c.sender_name||c.contact_name||'مجهول')} <span style="color:#9ca3af">${esc(c.sender_id||'')}</span></span>
    </label>`
  ).join('');
}

async function bc2SendTest() {
  const msg = document.getElementById('bc2-message')?.value.trim();
  const chatId = document.getElementById('bc2-test-id')?.value.trim();
  const res = document.getElementById('bc2-result');
  if (!msg) { showToast('اكتب الرسالة أولاً'); return; }
  if (!chatId) { showToast('أدخل Telegram Chat ID للاختبار'); return; }
  if (res) res.innerHTML = '<span style="color:#6b7280">جاري الإرسال التجريبي...</span>';
  const d = await apiFetch('/api/system/inbox/broadcast/test', {
    method:'POST',
    body: JSON.stringify({ chat_id: chatId, message: msg })
  });
  if (d.ok) {
    if (res) res.innerHTML = '<span style="color:#16a34a">✅ تم إرسال الرسالة التجريبية بنجاح!</span>';
  } else {
    if (res) res.innerHTML = '<span style="color:#CC2200">❌ '+ esc(d.error||'خطأ في الإرسال') +'</span>';
  }
}

async function bc2SendAll() {
  const msg = document.getElementById('bc2-message')?.value.trim();
  const platform = document.getElementById('bc2-platform')?.value || 'telegram';
  const res = document.getElementById('bc2-result');
  if (!msg) { showToast('اكتب الرسالة أولاً'); return; }
  // Check recipient mode
  const recipMode = document.querySelector('input[name="bc2-recipients"]:checked')?.value || 'all';
  let contact_ids = null;
  if (recipMode === 'select') {
    contact_ids = [...document.querySelectorAll('.bc2-contact-cb:checked')].map(cb => parseInt(cb.value));
    if (!contact_ids.length) { showToast('اختر مستلماً على الأقل'); return; }
  }
  if (!confirm(`هتبعت broadcast لـ ${recipMode==='all'?'كل المحادثات النشطة':contact_ids.length+' جهة اتصال'}. مؤكد؟`)) return;
  if (res) res.innerHTML = '<span style="color:#6b7280">⏳ جاري الإرسال... (قد يستغرق بضع ثواني)</span>';
  const body = { platform, message: msg };
  if (contact_ids) body.contact_ids = contact_ids;
  const d = await apiFetch('/api/system/inbox/broadcast/send', {
    method:'POST',
    body: JSON.stringify(body)
  });
  if (d.ok) {
    if (res) res.innerHTML = `<span style="color:#16a34a">✅ تم الإرسال! | أُرسل: ${d.sent} | فشل: ${d.failed} | الإجمالي: ${d.total}</span>`;
    document.getElementById('bc2-message').value = '';
    document.getElementById('bc2-charcount').textContent = '0';
    bc2LoadHistory();
  } else {
    if (res) res.innerHTML = '<span style="color:#CC2200">❌ '+ esc(d.error||'فشل الإرسال') +'</span>';
  }
}

async function bc2LoadHistory() {
  const tbody = document.getElementById('bc2-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:#9ca3af">جاري التحميل...</td></tr>';
  const d = await apiFetch('/api/system/inbox/broadcasts');
  const rows = d.broadcasts || d.campaigns || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#9ca3af">لا توجد حملات بعد</td></tr>';
    return;
  }
  const statusColors = { pending:'#9ca3af', sending:'#f59e0b', done:'#16a34a', sent:'#16a34a', failed:'#ef4444', draft:'#9ca3af' };
  const statusLabels = { pending:'معلّق', sending:'يُرسَل...', done:'تم', sent:'تم', failed:'فشل', draft:'مسودة' };
  tbody.innerHTML = rows.map(b => {
    const dateStr = b.created_at ? b.created_at.substring(0,10) : '';
    const st = b.status||'draft';
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 8px;font-size:11px;color:#6b7280">${esc(dateStr)}</td>
      <td style="padding:6px 8px;font-size:11px">${esc(b.platform||'telegram')}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center">${b.total_recipients||'-'}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center;color:#16a34a;font-weight:700">${b.sent_count||0}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center;color:#ef4444;font-weight:700">${b.failed_count||0}</td>
      <td style="padding:6px 8px;font-size:11px">
        <span style="background:${statusColors[st]||'#9ca3af'}22;color:${statusColors[st]||'#9ca3af'};padding:2px 7px;border-radius:20px;font-weight:700;font-size:10px">${statusLabels[st]||st}</span>
        ${(st==='draft')?`<button onclick="sendBroadcastNow(${b.id})" style="margin-right:4px;background:#1B5E30;color:#fff;border:none;padding:2px 8px;border-radius:6px;font-family:Cairo,sans-serif;font-size:10px;cursor:pointer">📢 إرسال</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

// ── Chatbot ──
let chatbotFlowsCache = [];
async function loadChatbotFlows() {
  const d = await apiFetch('/api/system/inbox/chatbot');
  chatbotFlowsCache = d.flows || [];
  const activeEl = document.getElementById('chatbot-active');
  if (activeEl) activeEl.checked = !!d.active;
  const el = document.getElementById('chatbot-flows-list');
  if (!el) return;
  if (!chatbotFlowsCache.length) { el.innerHTML='<div style="color:#9ca3af;font-size:12px;text-align:center;padding:10px">لا توجد خطوات — أضف أول خطوة</div>'; return; }
  el.innerHTML = chatbotFlowsCache.map(f =>
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-bottom:6px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:12px">'
    +(f.is_start?'<span style="background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">بداية</span> ':'')
    +'<strong>"'+esc(f.trigger_text)+'"</strong> → '+esc(f.response_text.substring(0,40))+'</div>'
    +'<button onclick="deleteChatbotFlow('+f.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">🗑️</button>'
    +'</div></div>'
  ).join('');
}

async function addChatbotFlow() {
  const trigger = document.getElementById('cf-trigger')?.value.trim();
  const response = document.getElementById('cf-response')?.value.trim();
  const isStart = document.getElementById('cf-is-start')?.checked;
  if (!trigger || !response) { showToast('أدخل النص والرد'); return; }
  const d = await apiFetch('/api/system/inbox/chatbot/flow', { method:'POST', body:JSON.stringify({trigger_text:trigger,response_text:response,is_start:isStart}) });
  if (d.ok) {
    document.getElementById('cf-trigger').value='';
    document.getElementById('cf-response').value='';
    if (document.getElementById('cf-is-start')) document.getElementById('cf-is-start').checked=false;
    showToast('✅ تمت الإضافة');
    loadChatbotFlows();
  } else showToast('❌ '+(d.error||'خطأ'));
}

async function deleteChatbotFlow(id) { if(!confirm('حذف؟')) return; await apiFetch('/api/system/inbox/chatbot/flow/'+id,{method:'DELETE'}); loadChatbotFlows(); }

// ── AI Smart Reply ──
async function getAISuggestions() {
  if (!inboxCurrentConv) return;
  const aiBtn = document.getElementById('ai-reply-btn');
  const aiDrop = document.getElementById('ai-suggestions-dropdown');
  const aiList = document.getElementById('ai-suggestions-list');
  if (!aiDrop || !aiList) return;

  // Toggle
  if (aiDrop.style.display === 'block') { aiDrop.style.display='none'; return; }
  aiDrop.style.display = 'block';
  aiList.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">🤖 جاري التفكير...</div>';

  // Get last message
  const msgs = document.querySelectorAll('#inbox-messages .msg-in');
  const lastMsg = msgs.length ? msgs[msgs.length-1].childNodes[0]?.textContent?.trim() || '' : '';

  const d = await apiFetch('/api/system/inbox/ai-reply', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: inboxCurrentConv.id, last_message: lastMsg })
  });

  if (d.ok && d.suggestions?.length) {
    aiList.innerHTML = d.suggestions.map((s, i) =>
      '<div onclick="useAISuggestion(\'' + s.replace(/'/g,"\\'") + '\')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;line-height:1.5" onmouseover="this.style.background=\'#f0f9ff\'" onmouseout="this.style.background=\'\'">' +
      '<span style="background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:4px;font-size:10px;margin-left:4px">' + (i+1) + '</span>' + s + '</div>'
    ).join('');
  } else {
    aiList.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">لم يتمكن اللحظة من اقتراح رد</div>';
  }

  // Close on outside click
  setTimeout(() => {
    const closeAI = (e) => {
      if (!aiDrop.contains(e.target) && e.target !== aiBtn) { aiDrop.style.display='none'; document.removeEventListener('click',closeAI); }
    };
    document.addEventListener('click', closeAI);
  }, 100);
}

function useAISuggestion(text) {
  const ta = document.getElementById('inbox-reply-text');
  if (ta) ta.value = text;
  document.getElementById('ai-suggestions-dropdown').style.display = 'none';
  ta?.focus();
}

// ── Drip Campaigns ──
let dripCampaignsCache = [];
let dripSteps = [];

async function loadDripCampaigns() {
  const d = await apiFetch('/api/system/inbox/drip');
  dripCampaignsCache = d.campaigns || [];
  const el = document.getElementById('drip-list');
  if (!el) return;
  if (!dripCampaignsCache.length) { el.innerHTML='<div style="font-size:12px;color:#9ca3af;text-align:center;padding:10px">لا توجد حملات — أضف أول</div>'; return; }
  el.innerHTML = dripCampaignsCache.map(c => {
    let steps = []; try { steps = JSON.parse(c.steps||'[]'); } catch(e){}
    return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
      +'<div><div style="font-weight:700;font-size:12px">'+esc(c.name)+'</div>'
      +'<div style="font-size:11px;color:#9ca3af">'+(c.trigger||'')+' | '+steps.length+' خطوات</div></div>'
      +'<div style="display:flex;gap:4px">'
      +'<button onclick="toggleDrip('+c.id+','+(c.active?0:1)+')" style="font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;background:'+(c.active?'#dcfce7':'#fee2e2')+';color:'+(c.active?'#16a34a':'#ef4444')+'">'+( c.active?'نشط':'موقوف')+'</button>'
      +'<button onclick="deleteDrip('+c.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">🗑️</button>'
      +'</div></div></div>';
  }).join('');
}

function addDripStep() {
  const i = dripSteps.length;
  dripSteps.push({ delay_minutes:0, message:'' });
  const el = document.getElementById('drip-steps-list');
  if (!el) return;
  const div = document.createElement('div');
  div.style.cssText='background:#fff;border:1px solid #e5e7eb;border-radius:7px;padding:8px;margin-bottom:6px';
  div.innerHTML='<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">'
    +'<span style="font-size:11px;color:#6b7280">بعد</span>'
    +'<input type="number" id="drip-delay-'+i+'" value="0" min="0" style="width:60px;padding:4px;border:1.5px solid #e5e7eb;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px">'
    +'<span style="font-size:11px;color:#6b7280">دقيقة</span>'
    +'<button onclick="this.closest(\'div\').parentElement.remove()" style="background:none;border:none;color:#ef4444;cursor:pointer;margin-right:auto">✕</button>'
    +'</div>'
    +'<textarea id="drip-msg-'+i+'" rows="2" placeholder="نص الرسالة..." style="width:100%;padding:5px;border:1.5px solid #e5e7eb;border-radius:6px;font-family:Cairo,sans-serif;font-size:12px;resize:vertical"></textarea>';
  el.appendChild(div);
}

async function saveDripCampaign() {
  const name = document.getElementById('drip-name')?.value.trim();
  if (!name) { showToast('أدخل اسم الحملة'); return; }
  const steps = [];
  let i = 0;
  while (document.getElementById('drip-delay-'+i)) {
    const delay = parseInt(document.getElementById('drip-delay-'+i)?.value)||0;
    const msg = document.getElementById('drip-msg-'+i)?.value.trim();
    if (msg) steps.push({ delay_minutes: delay, message: msg });
    i++;
  }
  if (!steps.length) { showToast('أضف خطوة واحدة على الأقل'); return; }
  const d = await apiFetch('/api/system/inbox/drip', { method:'POST', body:JSON.stringify({name,trigger:'new_contact',steps}) });
  if (d.ok) { showToast('✅ تمت الإضافة'); document.getElementById('drip-name').value=''; document.getElementById('drip-steps-list').innerHTML=''; dripSteps=[]; loadDripCampaigns(); }
  else showToast('❌ '+(d.error||'خطأ'));
}
async function toggleDrip(id,active) { await apiFetch('/api/system/inbox/drip/'+id,{method:'PUT',body:JSON.stringify({active})}); loadDripCampaigns(); }
async function deleteDrip(id) { if(!confirm('حذف؟')) return; await apiFetch('/api/system/inbox/drip/'+id,{method:'DELETE'}); loadDripCampaigns(); }

// ── Revenue Attribution ──
async function loadRevenueData() {
  const d = await apiFetch('/api/system/inbox/revenue');
  const totalEl = document.getElementById('revenue-total');
  if (totalEl) totalEl.textContent = fmt(d.total||0);
  const el = document.getElementById('revenue-list');
  if (!el) return;
  const revenue = d.revenue || [];
  if (!revenue.length) { el.innerHTML='<div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px">لا توجد بيانات — ستظهر عندما تربط محادثات بعملاء وفواتير مدفوعة</div>'; return; }
  el.innerHTML = revenue.map(r =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6">'
    +'<div><div style="font-size:12px;font-weight:700">'+esc(r.sender_name||r.id)+'</div>'
    +'<div style="font-size:10px;color:#9ca3af">'+r.invoice_count+' فاتورة</div></div>'
    +'<div style="font-weight:900;color:var(--brand,#1B5E30);font-size:14px">'+fmt(r.total_revenue)+' ج.م</div>'
    +'</div>'
  ).join('');
}

// ── SLA ──
async function loadSLAData() {
  const d = await apiFetch('/api/system/inbox/sla');
  const slaMinEl = document.getElementById('sla-minutes');
  if (slaMinEl && d.ok) slaMinEl.value = d.sla_minutes || 120;
  const el = document.getElementById('sla-breached-list');
  if (!el) return;
  const breached = d.breached || [];
  if (!breached.length) { el.innerHTML='<div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px">✅ لا توجد محادثات تجاوزت الوقت المحدد</div>'; return; }
  el.innerHTML = breached.map(c =>
    '<div style="padding:8px;border:1px solid #fee2e2;border-radius:8px;margin-bottom:6px;background:#fff5f5">'
    +'<div style="display:flex;justify-content:space-between">'
    +'<div style="font-weight:700;font-size:12px">'+esc(c.sender_name||c.sender_id)+'</div>'
    +'<span style="color:#ef4444;font-size:11px;font-weight:700">⏱ '+Math.round(c.minutes_waiting)+' دقيقة</span>'
    +'</div>'
    +'<div style="font-size:11px;color:#6b7280">'+(c.last_message||'').substring(0,50)+'</div>'
    +'<button onclick="openConversation('+c.id+')" style="background:#ef4444;color:#fff;border:none;padding:3px 8px;border-radius:5px;font-family:Cairo,sans-serif;font-size:10px;font-weight:700;cursor:pointer;margin-top:4px">رد الآن</button>'
    +'</div>'
  ).join('');
}
async function saveSLASettings() {
  const minutes = document.getElementById('sla-minutes')?.value;
  const d = await apiFetch('/api/system/inbox/sla/settings', { method:'POST', body:JSON.stringify({sla_minutes:parseInt(minutes)||120}) });
  if (d.ok) showToast('✅ تم حفظ إعدادات SLA');
  else showToast('❌ '+(d.error||'خطأ'));
}

// ── Analytics ──
async function loadInboxAnalytics() {
  const from = document.getElementById('analytics-from')?.value || '';
  const to   = document.getElementById('analytics-to')?.value || '';
  let url = '/api/system/inbox/analytics';
  if (from || to) url += '?from='+from+'&to='+to;
  const d = await apiFetch(url);
  if (!d.ok) return;
  const a = d.analytics;
  const cardsEl = document.getElementById('analytics-cards');
  const platEl  = document.getElementById('analytics-platforms');
  const dailyEl = document.getElementById('analytics-daily');
  if (cardsEl) {
    cardsEl.innerHTML = [
      { label:'💬 المحادثات', val: a.total_conversations, color:'#1B5E30' },
      { label:'📥 وارد', val: a.incoming, color:'#3b82f6' },
      { label:'📤 صادر', val: a.outgoing, color:'#F5A623' },
    ].map(c =>
      '<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-size:11px;color:#9ca3af">'+c.label+'</div>'
      +'<div style="font-size:20px;font-weight:900;color:'+c.color+'">'+c.val+'</div>'
      +'</div>'
    ).join('');
  }
  if (platEl && a.by_platform?.length) {
    platEl.innerHTML = '<div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:6px">توزيع المنصات</div>'
      + a.by_platform.map(p =>
        '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0">'
        +'<span>'+esc(p.platform||'')+'</span><span style="font-weight:700">'+p.c+'</span></div>'
      ).join('');
  }
  if (dailyEl && a.daily_last_7_days?.length) {
    const max = Math.max(...a.daily_last_7_days.map(d=>d.c), 1);
    dailyEl.innerHTML = '<div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:6px">آخر 7 أيام</div>'
      +'<div style="display:flex;gap:4px;align-items:flex-end;height:60px">'
      +a.daily_last_7_days.map(d =>
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">'
        +'<div style="background:var(--brand,#1B5E30);border-radius:3px 3px 0 0;width:100%;height:'+Math.round((d.c/max)*50)+'px" title="'+d.day+': '+d.c+'"></div>'
        +'<div style="font-size:9px;color:#9ca3af">'+d.day.slice(5)+'</div>'
        +'</div>'
      ).join('')+'</div>';
  }
}

async function saveChatbotSettings() {
  const active = document.getElementById('chatbot-active')?.checked;
  await apiFetch('/api/system/inbox/chatbot/settings', { method:'POST', body:JSON.stringify({active}) });
  showToast(active ? '✅ الـ Chatbot مفعّل' : '🔕 الـ Chatbot موقوف');
}

async function saveAutoMessages() {
  const d = await apiFetch('/api/system/inbox/auto-messages', {
    method: 'POST',
    body: JSON.stringify({
      welcome_active: document.getElementById('auto-welcome-active')?.checked,
      welcome_message: document.getElementById('auto-welcome-msg')?.value.trim(),
      away_active: document.getElementById('auto-away-active')?.checked,
      away_message: document.getElementById('auto-away-msg')?.value.trim(),
      away_start: document.getElementById('auto-away-start')?.value,
      away_end: document.getElementById('auto-away-end')?.value
    })
  });
  if (d.ok) showToast('✅ تم حفظ الردود التلقائية');
  else showToast('❌ ' + (d.error||'خطأ'));
}

function switchInboxPlatform(plat, btn) {
  inboxCurrentPlatform = plat;
  inboxCurrentConv = null;
  // دعم الـ classes الجديدة والقديمة
  document.querySelectorAll('.inbox-ptab,.inbox-v2-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadInboxConversations();
}

// ── INBOX SOUND + BADGE ──
let _lastInboxCount = 0;
let _inboxSoundEnabled = localStorage.getItem('areej_inbox_sound') !== 'off';

function toggleInboxSound() {
  _inboxSoundEnabled = !_inboxSoundEnabled;
  localStorage.setItem('areej_inbox_sound', _inboxSoundEnabled ? 'on' : 'off');
  const btn = document.getElementById('sound-toggle-btn');
  if (btn) btn.textContent = _inboxSoundEnabled ? '🔔' : '🔕';
  btn.title = _inboxSoundEnabled ? 'صوت مفعّل — اضغط للإيقاف' : 'صوت موقوف — اضغط للتشغيل';
  showToast(_inboxSoundEnabled ? '🔔 التنبيه الصوتي شغّال' : '🔕 التنبيه الصوتي موقوف');
}

function playInboxSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // صوت نبضة لطيف زي WhatsApp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    // نبضة ثانية بعد 0.15 ثانية
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1100, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.25, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.35);
    }, 150);
  } catch(e) {}
}

async function loadInboxUnreadBadge() {
  const d = await apiFetch('/api/system/inbox/unread-count').catch(()=>({count:0}));
  if (!d || typeof d.count === 'undefined') return;
  const count = d.count || 0;

  // تحديث الـ badge بالعدد التراكمي
  const badge = document.getElementById('inbox-nav-badge');
  if (badge) {
    if (count > 0) {
      badge.style.display = 'inline';
      badge.textContent = count;
      badge.style.animation = count > _lastInboxCount ? 'pulse 0.4s ease' : 'none';
    } else {
      badge.style.display = 'none';
    }
  }

  // رسائل جديدة
  if (count > _lastInboxCount) {
    const newCount = count - _lastInboxCount;
    // تنبيه صوتي
    if (_inboxSoundEnabled) playInboxSound();
    // Browser notification
    try {
      if (Notification.permission === 'granted') {
        new Notification('💬 ' + newCount + ' رسالة جديدة', {
          body: 'وصلتك رسائل جديدة في الصندوق — اضغط للتحقق',
          icon: '/favicon.ico',
          badge: '/favicon.ico'
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch(e) {}
  }

  _lastInboxCount = count;

  // تحديث زرار الصوت
  const btn = document.getElementById('sound-toggle-btn');
  if (btn) {
    btn.textContent = _inboxSoundEnabled ? '🔔' : '🔕';
    btn.title = _inboxSoundEnabled ? 'صوت مفعّل — اضغط للإيقاف' : 'صوت موقوف — اضغط للتشغيل';
  }
}

// Templates
let templatesCache = [];
async function loadTemplatesList() {
  const d = await apiFetch('/api/system/inbox/templates');
  templatesCache = d.templates || [];
  renderTemplatesDropdown();
  renderModalTemplates();
}

function renderTemplatesDropdown() {
  const el = document.getElementById('templates-list');
  if (!el) return;
  if (!templatesCache.length) { el.innerHTML = '<div style="padding:10px;font-size:11px;color:#9ca3af">لا توجد قوالب</div>'; return; }
  el.innerHTML = templatesCache.map(t =>
    '<div onclick="useTemplate(' + JSON.stringify(t.content).replace(/"/g,"'") + ')" style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f3f4f6" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
    + '<div style="font-weight:600">' + esc(t.name) + '</div>'
    + '<div style="color:#6b7280;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.content.substring(0,50)) + '</div></div>'
  ).join('');
}

function useTemplate(content) {
  document.getElementById('inbox-reply-text').value = content;
  document.getElementById('templates-dropdown').style.display = 'none';
  document.getElementById('inbox-reply-text').focus();
}

function toggleTemplates() {
  const dd = document.getElementById('templates-dropdown');
  const aiDd = document.getElementById('ai-suggestions-dropdown');
  const isOpen = dd.style.display !== 'none';
  // Close AI first
  if (aiDd) aiDd.style.display = 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadTemplatesList();
}

function renderModalTemplates() {
  const el = document.getElementById('modal-templates-list');
  if (!el) return;
  el.innerHTML = templatesCache.map(t =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px">'
    + '<div><strong>' + esc(t.name) + '</strong>: ' + esc(t.content.substring(0,50)) + '</div></div>'
  ).join('') || '<div style="font-size:12px;color:#9ca3af">لا توجد قوالب — أضف من الأسفل</div>';
}

async function addTemplate() {
  const name = document.getElementById('new-tpl-name').value.trim();
  const content = document.getElementById('new-tpl-content').value.trim();
  if (!name || !content) { showToast('أدخل اسم ونص'); return; }
  const d = await apiFetch('/api/system/inbox/templates', { method:'POST', body: JSON.stringify({name,content}) });
  if (d.ok) {
    showToast('✅ أضيف القالب');
    document.getElementById('new-tpl-name').value = '';
    document.getElementById('new-tpl-content').value = '';
    loadTemplatesList();
  }
}

// Inbox Settings
async function showInboxSettings() {
  // Navigate to the full inbox-settings page
  sbShowPage('inbox-settings', document.getElementById('sb-inbox-settings'));
}

async function _legacyShowInboxSettings() {
  document.getElementById('inboxSettingsModal').classList.remove('hidden');
  const d = await apiFetch('/api/system/inbox/settings');
  const s = d.settings || {};
  document.getElementById('tg-token').value = s.telegram_token || '';
  document.getElementById('tg-active').checked = !!s.telegram_active;
  // Show webhook URL
  const userId = JSON.parse(atob(getToken().split('.')[1])).id;
  const webhookUrl = window.location.origin.replace('dashboard', '') + '/api/webhook/telegram/' + userId;
  document.getElementById('tg-webhook-url').innerHTML = '🔗 Webhook URL:<br><code style="font-size:10px">' + webhookUrl + '</code>';
  await loadTemplatesList();
  renderModalTemplates();
}

async function saveInboxSettings() {
  const token = document.getElementById('tg-token').value.trim();
  const active = document.getElementById('tg-active').checked;
  await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ telegram_token: token, telegram_active: active })
  });
}

async function setupTelegramWebhook() {
  const token = document.getElementById('tg-token').value.trim();
  const statusEl = document.getElementById('tg-status');
  if (!token) { statusEl.innerHTML = '<span style="color:#CC2200">أدخل Bot Token</span>'; return; }
  statusEl.textContent = 'جاري الربط...';

  // فعّل تلقائياً + حفظ
  document.getElementById('tg-active').checked = true;
  await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ telegram_token: token, telegram_active: true })
  });

  // Webhook URL — دايماً على الدومين الرئيسي عشان يوصل تيليجرام
  const userId = JSON.parse(atob(getToken().split('.')[1])).id;
  const webhookUrl = window.location.origin + '/api/webhook/telegram/' + userId;

  // عرض الـ URL
  const urlEl = document.getElementById('tg-webhook-url');
  if (urlEl) urlEl.innerHTML = '🔗 Webhook URL:<br><code style="font-size:10px">' + webhookUrl + '</code>';

  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webhookUrl));
    const data = await r.json();
    if (data.ok) {
      statusEl.innerHTML = '<span style="color:#16a34a">✅ تم الربط — ابعت رسالة للبوت وشوفها هنا</span>';
    } else {
      statusEl.innerHTML = '<span style="color:#CC2200">❌ ' + (data.description||'Error') + '</span>';
    }
  } catch(e) {
    statusEl.innerHTML = '<span style="color:#CC2200">❌ خطأ في الاتصال بتيليجرام</span>';
  }
}

