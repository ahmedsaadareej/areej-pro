// ============================================================
// INBOX SETTINGS PAGE — JavaScript
// ============================================================

let currentInboxSettingsSection = 'integrations-channels';

function showInboxSettingsSection(section) {
  // Update sub-section in hash — pushState so back button works
  const cur = new URLSearchParams(window.location.hash.slice(1));
  const prevCh = cur.get('ch');
  cur.set('p', 'inbox-settings');
  cur.set('s', section);
  cur.delete('ch');
  // Skip hash update during init phase
  if (!window._initPhase) {
    if (prevCh) {
      history.pushState({ page: 'inbox-settings', section }, '', '#' + cur.toString());
    } else {
      history.replaceState({ page: 'inbox-settings', section }, '', '#' + cur.toString());
    }
  }

  // If moving to channels section — always reset: hide channel detail, show grid
  if (section === 'integrations-channels') {
    const grid = document.getElementById('is-channels-grid');
    if (grid) grid.style.display = 'grid';
    document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
  }
  // Hide all sections
  document.querySelectorAll('#page-inbox-settings .is-section').forEach(el => {
    el.style.display = 'none';
  });
  // Show requested section
  const el = document.getElementById('is-section-' + section);
  if (el) el.style.display = 'block';
  // Update sidebar active state
  document.querySelectorAll('#page-inbox-settings .is-nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector('#page-inbox-settings [data-section="' + section + '"]');
  if (navItem) navItem.classList.add('active');
  currentInboxSettingsSection = section;
  // Load section data
  if (section === 'automation-keywords') { loadKeywordsList(); }
  if (section === 'automation-automsg')  { typeof loadAutoMessages === 'function' && loadAutoMessages(); }
  if (section === 'content-labels') { loadLabelsListIS(); }
  if (section === 'content-templates') { loadTemplatesListIS(); }
  if (section === 'broadcast-send') { bc2LoadHistory(); }
  if (section === 'reports-analytics') { loadAdvancedAnalyticsIS && loadAdvancedAnalyticsIS(); }
  if (section === 'team-management') { typeof initInboxTeam === 'function' && initInboxTeam(); }
}

function showChannelDetail(channel) {
  // Update channel in hash — pushState so back button works
  if (!window._initPhase) {
    const cur = new URLSearchParams(window.location.hash.slice(1));
    cur.set('p', 'inbox-settings');
    cur.set('ch', channel);
    cur.delete('s');
    history.pushState({ page: 'inbox-settings', channel }, '', '#' + cur.toString());
  }

  // Hide channels grid, show detail panel
  const grid = document.getElementById('is-channels-grid');
  if (grid) grid.style.display = 'none';
  document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
  const detail = document.getElementById('is-detail-' + channel);
  if (detail) detail.style.display = 'block';
  // Populate webhook URLs + saved fields
  loadIntegrationsStatus();
  if (channel === 'whatsapp') _populateWhatsAppFields();
  if (channel === 'messenger') _populateMessengerFields();
  if (channel === 'instagram') _populateInstagramFields();
}

async function _populateMessengerFields() {
  // Set webhook URL dynamically
  const userId = JSON.parse(atob(getToken().split('.')[1])).id;
  const webhookUrl = window.location.origin + '/api/webhook/messenger/' + userId;
  const verifyToken = 'areej_' + userId + '_verify';
  const wEl = document.getElementById('is-fb-webhook-display');
  const vEl = document.getElementById('is-fb-verify-display');
  if (wEl) wEl.textContent = webhookUrl;
  if (vEl) vEl.textContent = verifyToken;
  // Load saved settings
  try {
    const d = await apiFetch('/api/system/inbox/settings');
    const s = d.settings || {};
    if (s.meta_token) { const el=document.getElementById('fb-page-token'); if(el&&!el.value) el.value=s.meta_token; }
    if (s.meta_page_id) { const el=document.getElementById('fb-page-id'); if(el&&!el.value) el.value=s.meta_page_id; }
    if (s.meta_active && s.meta_token) {
      const sm=document.getElementById('fb-status-msg');
      if(sm) sm.innerHTML='<span style="color:#16a34a;font-weight:700">✅ محفوظ ومفعّل</span>';
    }
  } catch(e) {}
}

async function _populateInstagramFields() {
  const userId = JSON.parse(atob(getToken().split('.')[1])).id;
  const webhookUrl = window.location.origin + '/api/webhook/instagram/' + userId;
  const verifyToken = 'areej_' + userId + '_verify';
  const wEl = document.getElementById('is-ig-webhook-display');
  const vEl = document.getElementById('is-ig-verify-display');
  if (wEl) wEl.textContent = webhookUrl;
  if (vEl) vEl.textContent = verifyToken;
  try {
    const d = await apiFetch('/api/system/inbox/settings');
    const s = d.settings || {};
    if (s.ig_token) { const el=document.getElementById('ig-token'); if(el&&!el.value) el.value=s.ig_token; }
    if (s.ig_account_id) { const el=document.getElementById('ig-account-id'); if(el&&!el.value) el.value=s.ig_account_id; }
    if (s.ig_active && s.ig_token) {
      const sm=document.getElementById('ig-status-msg');
      if(sm) sm.innerHTML='<span style="color:#16a34a;font-weight:700">✅ محفوظ ومفعّل</span>';
    }
  } catch(e) {}
}

async function saveMessengerSettingsNew() {
  const token = document.getElementById('fb-page-token')?.value?.trim();
  const pageId = document.getElementById('fb-page-id')?.value?.trim();
  const statusEl = document.getElementById('fb-status-msg');
  if (!token || !pageId) { if(statusEl) statusEl.innerHTML='<span style="color:#ef4444">❌ أدخل Token و Page ID</span>'; return; }
  if(statusEl) statusEl.textContent = 'جاري الحفظ...';
  const d = await apiFetch('/api/system/inbox/settings', { method:'POST', body: JSON.stringify({ meta_token: token, meta_page_id: pageId, meta_active: true }) });
  if (d.ok) {
    if(statusEl) statusEl.innerHTML='<span style="color:#16a34a;font-weight:700">✅ تم الحفظ بنجاح</span>';
    loadIntegrationsStatus();
  } else {
    if(statusEl) statusEl.innerHTML='<span style="color:#ef4444">❌ فشل الحفظ</span>';
  }
}

async function saveInstagramSettingsNew() {
  const token = document.getElementById('ig-token')?.value?.trim();
  const accountId = document.getElementById('ig-account-id')?.value?.trim();
  const statusEl = document.getElementById('ig-status-msg');
  if (!token || !accountId) { if(statusEl) statusEl.innerHTML='<span style="color:#ef4444">❌ أدخل Token و Account ID</span>'; return; }
  if(statusEl) statusEl.textContent = 'جاري الحفظ...';
  const d = await apiFetch('/api/system/inbox/settings', { method:'POST', body: JSON.stringify({ ig_token: token, ig_account_id: accountId, ig_active: true }) });
  if (d.ok) {
    if(statusEl) statusEl.innerHTML='<span style="color:#16a34a;font-weight:700">✅ تم الحفظ بنجاح</span>';
    loadIntegrationsStatus();
  } else {
    if(statusEl) statusEl.innerHTML='<span style="color:#ef4444">❌ فشل الحفظ</span>';
  }
}

async function _populateWhatsAppFields() {
  const d = await apiFetch('/api/system/inbox/settings');
  const s = d.settings || d || {};
  if (s.wa_phone_id) { const el = document.getElementById('wa-phone-id'); if (el && !el.value) el.value = s.wa_phone_id; }
  if (s.wa_account_id) { const el = document.getElementById('wa-account-id'); if (el && !el.value) el.value = s.wa_account_id; }
  if (s.wa_token) {
    const el = document.getElementById('wa-token');
    if (el && !el.value) el.value = s.wa_token;
    const statusEl = document.getElementById('wa-status-msg');
    if (statusEl && s.wa_active) statusEl.innerHTML = '<span style="color:#16a34a;font-weight:700">✅ محفوظ ومفعّل</span>';
    else if (statusEl && s.wa_token) statusEl.innerHTML = '<span style="color:#f59e0b;font-weight:700">⚠️ محفوظ — غير مفعّل بعد</span>';
  }
}

function backToChannelsGrid() {
  const grid = document.getElementById('is-channels-grid');
  if (grid) grid.style.display = 'grid';
  document.querySelectorAll('.is-channel-detail').forEach(el => el.style.display = 'none');
  // Update hash — back to channels section
  const cur = new URLSearchParams(window.location.hash.slice(1));
  cur.set('p', 'inbox-settings');
  cur.set('s', 'integrations-channels');
  cur.delete('ch');
  history.pushState({ page: 'inbox-settings', section: 'integrations-channels' }, '', '#' + cur.toString());
}

function copyInboxUrl(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent.trim();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ تم النسخ')).catch(() => _copyFallback(text));
  } else { _copyFallback(text); }
}
function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('✅ تم النسخ');
}

function _getTokenUserId() {
  try { return JSON.parse(atob(getToken().split('.')[1])).id; } catch(e) { return 'me'; }
}

async function loadIntegrationsStatus() {
  try {
    const userId = _getTokenUserId();
    // Set webhook URLs
    const tgWebhook = window.location.origin + '/api/webhook/telegram/' + userId;
    const waWebhook = window.location.origin + '/api/webhook/whatsapp/' + userId;
    const verifyToken = 'areej_' + userId + '_verify';
    document.querySelectorAll('.is-webhook-url-telegram').forEach(el => { el.textContent = tgWebhook; });
    const tgDisplay = document.getElementById('is-tg-webhook-display');
    if (tgDisplay) tgDisplay.textContent = tgWebhook;

    // waWebhook already set above
    const waDisplay = document.getElementById('is-wa-webhook-display');
    if (waDisplay) waDisplay.textContent = waWebhook;

    const waVerify = document.getElementById('is-wa-verify-token');
    if (waVerify) waVerify.textContent = 'areej_' + userId + '_verify';

    const fbWebhook = window.location.origin + '/api/webhook/messenger/' + userId;
    const fbDisplay = document.getElementById('is-fb-webhook-display');
    if (fbDisplay) fbDisplay.textContent = fbWebhook;

    const igWebhook = window.location.origin + '/api/webhook/instagram/' + userId;
    const igDisplay = document.getElementById('is-ig-webhook-display');
    if (igDisplay) igDisplay.textContent = igWebhook;

    // Load settings
    const d = await apiFetch('/api/system/inbox/settings');
    const s = d.settings || d || {};

    // Telegram status
    const tgStatus = document.getElementById('is-card-status-telegram');
    if (tgStatus) {
      if (s.telegram_token && s.telegram_active) {
        tgStatus.innerHTML = '<span style="color:#16a34a;font-weight:700">✅ مربوط</span>';
        const card = document.getElementById('is-card-telegram');
        if (card) { card.classList.add('connected'); card.querySelector('.is-channel-btn').textContent = 'إدارة'; card.querySelector('.is-channel-btn').classList.add('connected'); }
      } else {
        tgStatus.innerHTML = '<span style="color:#9ca3af">🔴 غير مربوط</span>';
      }
    }
    // Pre-fill token input (masked placeholder)
    const tgInput = document.getElementById('tg-token-input');
    if (tgInput && s.telegram_token) {
      tgInput.placeholder = s.telegram_token.substring(0, 12) + '...****';
    }
  } catch(e) { console.warn('loadIntegrationsStatus error:', e); }
}

// ─── New Telegram functions (for new page) ───
async function saveTelegramSettingsNew() {
  const tokenInput = document.getElementById('tg-token-input');
  if (!tokenInput) return;
  const token = tokenInput.value.trim();
  if (!token) { showToast('أدخل Bot Token'); return; }
  const d = await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ telegram_token: token, telegram_active: true })
  });
  if (d && (d.ok || d.settings || d.telegram_token !== undefined)) {
    showToast('✅ تم الحفظ');
    loadIntegrationsStatus();
  } else {
    showToast('❌ خطأ في الحفظ');
  }
}

async function setupTelegramWebhookNew() {
  const tokenInput = document.getElementById('tg-token-input');
  const statusEl = document.getElementById('is-tg-status');
  if (!tokenInput || !statusEl) return;
  const token = tokenInput.value.trim() || (tokenInput.placeholder.replace('...****',''));
  if (!token || token.length < 10) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#fee2e2';
    statusEl.innerHTML = '<span style="color:#CC2200">أدخل Bot Token أولاً</span>';
    return;
  }
  statusEl.style.display = 'block';
  statusEl.style.background = '#f3f4f6';
  statusEl.textContent = 'جاري الربط...';

  // Save first
  await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ telegram_token: token, telegram_active: true })
  });

  const userId = _getTokenUserId();
  const webhookUrl = window.location.origin + '/api/webhook/telegram/' + userId;

  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webhookUrl));
    const data = await r.json();
    if (data.ok) {
      statusEl.style.background = '#dcfce7';
      statusEl.innerHTML = '<span style="color:#16a34a">✅ تم الربط — ابعت رسالة للبوت وشوفها هنا</span>';
      loadIntegrationsStatus();
    } else {
      statusEl.style.background = '#fee2e2';
      statusEl.innerHTML = '<span style="color:#CC2200">❌ ' + (data.description || 'Error') + '</span>';
    }
  } catch(e) {
    statusEl.style.background = '#fee2e2';
    statusEl.innerHTML = '<span style="color:#CC2200">❌ خطأ في الاتصال بتيليجرام</span>';
  }
}

async function testTelegramConnectionNew() {
  const tokenInput = document.getElementById('tg-token-input');
  const statusEl = document.getElementById('is-tg-status');
  if (!tokenInput || !statusEl) return;
  const token = tokenInput.value.trim();
  if (!token) { showToast('أدخل Bot Token للاختبار'); return; }
  statusEl.style.display = 'block';
  statusEl.style.background = '#f3f4f6';
  statusEl.textContent = 'جاري الاختبار...';
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/getMe');
    const data = await r.json();
    if (data.ok) {
      statusEl.style.background = '#dcfce7';
      statusEl.innerHTML = '<span style="color:#16a34a">✅ البوت صحيح: <strong>@' + data.result.username + '</strong> — ' + data.result.first_name + '</span>';
    } else {
      statusEl.style.background = '#fee2e2';
      statusEl.innerHTML = '<span style="color:#CC2200">❌ Token غير صحيح</span>';
    }
  } catch(e) {
    statusEl.style.background = '#fee2e2';
    statusEl.innerHTML = '<span style="color:#CC2200">❌ خطأ في الاتصال</span>';
  }
}

async function saveWhatsAppSettingsNew() {
  const phoneId = document.getElementById('wa-phone-id')?.value.trim();
  const accountId = document.getElementById('wa-account-id')?.value.trim();
  const token = document.getElementById('wa-token')?.value.trim();
  const statusEl = document.getElementById('wa-status-msg');
  if (!phoneId || !token) { showToast('أدخل Phone Number ID و Access Token'); return; }
  if (statusEl) statusEl.innerHTML = '<span style="color:#6b7280">⏳ جاري الحفظ...</span>';
  const d = await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ wa_phone_id: phoneId, wa_account_id: accountId, wa_token: token })
  });
  if (d && (d.ok || d.settings)) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#16a34a;font-weight:700">✅ تم الحفظ بنجاح</span>';
    showToast('✅ تم حفظ إعدادات واتساب');
    loadIntegrationsStatus();
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444">❌ خطأ في الحفظ</span>';
    showToast('❌ خطأ في الحفظ');
  }
}

async function testWhatsAppConnection() {
  const statusEl = document.getElementById('wa-status-msg');
  const token = document.getElementById('wa-token')?.value.trim();
  const phoneId = document.getElementById('wa-phone-id')?.value.trim();
  if (!token || !phoneId) { showToast('أدخل البيانات أولاً'); return; }
  if (statusEl) statusEl.innerHTML = '<span style="color:#6b7280">⏳ جاري الاختبار...</span>';
  // Test by calling Meta API directly to get phone number info
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}?access_token=${token}`);
    const data = await resp.json();
    if (data.id || data.display_phone_number) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#16a34a;font-weight:700">✅ الاتصال ناجح — الرقم: ${data.display_phone_number || data.id}</span>`;
      showToast('✅ الاتصال بواتساب API ناجح');
    } else if (data.error) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">❌ ${data.error.message || 'خطأ في الاتصال'}</span>`;
      showToast('❌ ' + (data.error.message || 'خطأ في الاتصال'));
    }
  } catch(e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444">❌ تعذّر الاتصال — تحقق من البيانات</span>';
  }
}

// ──────────────────────────────────────────────────────────────
// WhatsApp API — Tab switcher
// ──────────────────────────────────────────────────────────────
function waShowTab(tab) {
  const tabs = ['settings', 'templates', 'analytics'];
  tabs.forEach(t => {
    const panel = document.getElementById('wa-tab-' + t);
    const btn   = document.getElementById('wa-tab-btn-' + t);
    if (!panel || !btn) return;
    const active = (t === tab);
    panel.style.display = active ? 'block' : 'none';
    btn.style.borderBottomColor = active ? '#1B5E30' : 'transparent';
    btn.style.color = active ? '#1B5E30' : '#6b7280';
    btn.style.fontWeight = active ? '800' : '700';
  });
  if (tab === 'templates') waLoadTemplates();
  if (tab === 'analytics') waLoadAnalytics();
}

// ──────────────────────────────────────────────────────────────
// WhatsApp Analytics Dashboard
// ──────────────────────────────────────────────────────────────
const WA_TIER_LABELS = {
  TIER_50:          { label: 'Tier 1', limit: '1,000 محادثة/يوم',  color: '#6b7280' },
  TIER_250:         { label: 'Tier 2', limit: '10,000 محادثة/يوم', color: '#0369a1' },
  TIER_1K:          { label: 'Tier 3', limit: '100,000 محادثة/يوم', color: '#166534' },
  UNLIMITED:        { label: 'Unlimited', limit: 'غير محدود', color: '#7c3aed' },
  TIER_NOT_STARTED: { label: 'لم يبدأ بعد', limit: 'حدّد ترتيب الجودة أولاً', color: '#92400e' },
};

const WA_QUALITY_COLORS = {
  GREEN:  { label: 'جيدة ✅', color: '#166534', bg: '#dcfce7' },
  YELLOW: { label: 'متوسطة ⚠️', color: '#854d0e', bg: '#fef9c3' },
  RED:    { label: 'ضعيفة ❌', color: '#991b1b', bg: '#fee2e2' },
};

// Meta conv type cost estimates (USD) for Egypt market
const WA_COST_USD = {
  MARKETING: 0.0219,
  UTILITY:   0.0042,
  AUTHENTICATION: 0.0315,
  SERVICE:   0.0,
};

async function waLoadAnalytics() {
  const cardsEl     = document.getElementById('wa-analytics-cards');
  const statusEl    = document.getElementById('wa-analytics-status');
  const breakEl     = document.getElementById('wa-analytics-breakdown');
  const breakRows   = document.getElementById('wa-analytics-breakdown-rows');
  const costEl      = document.getElementById('wa-analytics-cost');
  const costVal     = document.getElementById('wa-analytics-cost-val');
  const localEl     = document.getElementById('wa-analytics-local');
  if (!cardsEl) return;

  cardsEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:30px 0;grid-column:span 2">⏳ جاري التحميل...</div>';
  if (statusEl) statusEl.style.display = 'none';
  if (breakEl) breakEl.style.display = 'none';
  if (costEl) costEl.style.display = 'none';

  const d = await apiFetch('/api/system/inbox/wa-analytics');
  if (!d.ok) {
    cardsEl.innerHTML = '<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px 0;grid-column:span 2">❌ ' + (d.error || 'تعذّر التحميل') + '</div>';
    return;
  }

  const { phoneInfo = {}, convData = {}, localStats = {} } = d;

  // ── KPI cards
  const tier    = WA_TIER_LABELS[phoneInfo.messaging_limit_tier] || { label: 'غير معروف', limit: '—', color: '#6b7280' };
  const quality = WA_QUALITY_COLORS[phoneInfo.quality_rating] || { label: phoneInfo.quality_rating || '—', color: '#6b7280', bg: '#f3f4f6' };

  function kpiCard(icon, title, value, sub, bgColor) {
    return `<div style="background:${bgColor||'#f9fafb'};border:1.5px solid #e5e7eb;border-radius:9px;padding:12px">
      <div style="font-size:18px;margin-bottom:4px">${icon}</div>
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:2px">${title}</div>
      <div style="font-size:18px;font-weight:900;color:#111827;line-height:1.2">${value}</div>
      ${sub ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
    </div>`;
  }

  cardsEl.innerHTML = [
    kpiCard('📱', 'رقم الهاتف', phoneInfo.display_phone_number || '—', phoneInfo.name_status || ''),
    kpiCard('📈', 'Messaging Tier', tier.label, tier.limit, '#f0fdf4'),
    kpiCard('⭐', 'جودة الرقم', quality.label, 'بناءً على Meta', quality.bg),
    kpiCard('💬', 'محادثات واتساب (كل)', localStats.total_conversations ?? '—', 'منذ البداية'),
    kpiCard('🟢', 'محادثات مفتوحة', localStats.open_conversations ?? '—', 'حالياً'),
    kpiCard('👥', 'عملاء هذا الشهر', localStats.unique_senders_month ?? '—', 'آخر 30 يوم', '#eff6ff'),
    kpiCard('✉️', 'رسائل اليوم', localStats.today_messages ?? '—', ''),
    kpiCard('🕒', 'متوسط وقت الرد', localStats.avg_first_response_min != null ? localStats.avg_first_response_min + ' دقيقة' : '—', 'First Response Time'),
  ].join('');

  // ── Breakdown from Meta
  const data = convData.data?.data || [];
  if (data.length && breakEl && breakRows) {
    const totals = {};
    data.forEach(row => {
      const key = row.conversation_type || 'OTHER';
      totals[key] = (totals[key] || 0) + (row.conversation || 0);
    });
    const typeColors = { MARKETING: '#7c3aed', UTILITY: '#0369a1', AUTHENTICATION: '#065f46', SERVICE: '#166534', OTHER: '#6b7280' };
    breakRows.innerHTML = Object.entries(totals).map(([type, count]) => {
      const color = typeColors[type] || '#6b7280';
      const cost  = (WA_COST_USD[type] || 0) * count;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f9fafb;border-radius:7px;font-size:11px">
        <span style="font-weight:700;color:${color}">${type}</span>
        <span style="font-weight:800;color:#111827">${count.toLocaleString()} محادثة</span>
        <span style="color:#6b7280">~$${cost.toFixed(2)}</span>
      </div>`;
    }).join('');
    breakEl.style.display = 'block';

    // total cost
    const totalCost = Object.entries(totals).reduce((acc, [type, count]) => acc + (WA_COST_USD[type] || 0) * count, 0);
    if (costEl && costVal) {
      costVal.textContent = `~$${totalCost.toFixed(2)} USD`;
      costEl.style.display = 'block';
    }
  } else if (breakEl) {
    // No Meta conv data — show local breakdown
    if (localEl) {
      localEl.innerHTML = [
        `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:7px;padding:9px"><div style="font-size:10px;color:#6b7280">رسائل الأسبوع</div><div style="font-size:17px;font-weight:900;color:#111827">${localStats.week_messages ?? '—'}</div></div>`,
        `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:7px;padding:9px"><div style="font-size:10px;color:#6b7280">رسائل الشهر</div><div style="font-size:17px;font-weight:900;color:#111827">${localStats.month_messages ?? '—'}</div></div>`,
      ].join('');
    }
  }

  // ── Local stats section always
  if (localEl && breakEl?.style.display !== 'block') {
    localEl.innerHTML = [
      `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:7px;padding:9px"><div style="font-size:10px;color:#6b7280">رسائل الأسبوع</div><div style="font-size:17px;font-weight:900;color:#0369a1">${localStats.week_messages ?? '—'}</div></div>`,
      `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:7px;padding:9px"><div style="font-size:10px;color:#6b7280">رسائل الشهر</div><div style="font-size:17px;font-weight:900;color:#0369a1">${localStats.month_messages ?? '—'}</div></div>`,
    ].join('');
  }
}

// ──────────────────────────────────────────────────────────────
// WhatsApp Template Manager
// ──────────────────────────────────────────────────────────────
const WA_TPL_STATUS_COLORS = {
  APPROVED:  { bg: '#dcfce7', color: '#166534', label: '✅ معتمد' },
  PENDING:   { bg: '#fef9c3', color: '#854d0e', label: '⏳ قيد المراجعة' },
  REJECTED:  { bg: '#fee2e2', color: '#991b1b', label: '❌ مرفوض' },
  PAUSED:    { bg: '#f3f4f6', color: '#374151', label: '⏸ موقوف' },
  DISABLED:  { bg: '#f3f4f6', color: '#9ca3af', label: '⚫ معطل' },
};

async function waLoadTemplates() {
  const listEl   = document.getElementById('wa-tpl-list');
  const statusEl = document.getElementById('wa-tpl-status');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px 0">⏳ جاري التحميل...</div>';
  if (statusEl) { statusEl.style.display = 'none'; }

  const d = await apiFetch('/api/system/inbox/wa-templates');
  if (!d.ok) {
    listEl.innerHTML = '<div style="text-align:center;color:#ef4444;font-size:12px;padding:16px 0">❌ ' + (d.error || 'تعذّر التحميل') + '</div>';
    return;
  }
  const templates = d.templates || [];
  if (!templates.length) {
    listEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px 0">مفيش templates لسه — اضغط "➕ Template جديد" لإنشاء أول</div>';
    return;
  }
  listEl.innerHTML = templates.map(t => {
    const sc = WA_TPL_STATUS_COLORS[t.status] || { bg: '#f3f4f6', color: '#374151', label: t.status };
    const body = (t.components || []).find(c => c.type === 'BODY')?.text || '';
    return `
      <div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:9px;padding:10px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:800;color:#111827;font-family:monospace">${t.name}</span>
            <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${sc.bg};color:${sc.color}">${sc.label}</span>
            <span style="padding:2px 8px;border-radius:20px;font-size:10px;background:#f3f4f6;color:#6b7280">${t.language}</span>
            <span style="padding:2px 8px;border-radius:20px;font-size:10px;background:#eff6ff;color:#1d4ed8">${t.category}</span>
          </div>
          ${body ? `<div style="font-size:11px;color:#4b5563;line-height:1.5;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${body}</div>` : ''}
        </div>
        <button onclick="waDeleteTemplate('${t.name}')" style="flex-shrink:0;background:#fee2e2;border:none;color:#ef4444;border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer;font-family:Cairo,sans-serif" title="حذف">🗑</button>
      </div>`;
  }).join('');
}

function waOpenNewTemplate() {
  const formEl  = document.getElementById('wa-tpl-form');
  const titleEl = document.getElementById('wa-tpl-form-title');
  const editId  = document.getElementById('wa-tpl-edit-id');
  if (!formEl) return;
  document.getElementById('wa-tpl-name').value = '';
  document.getElementById('wa-tpl-lang').value = 'ar';
  document.getElementById('wa-tpl-category').value = 'UTILITY';
  document.getElementById('wa-tpl-body').value = '';
  document.getElementById('wa-tpl-preview').textContent = '';
  if (editId) editId.value = '';
  if (titleEl) titleEl.textContent = '➕ Template جديد';
  formEl.style.display = 'block';
  formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function waCloseTemplateForm() {
  const formEl = document.getElementById('wa-tpl-form');
  if (formEl) formEl.style.display = 'none';
}

// live preview
function waUpdatePreview() {
  const body    = document.getElementById('wa-tpl-body')?.value || '';
  const preview = document.getElementById('wa-tpl-preview');
  if (preview) preview.textContent = body || 'النص هيظهر هنا...';
}

async function waSaveTemplate() {
  const name      = document.getElementById('wa-tpl-name')?.value.trim();
  const language  = document.getElementById('wa-tpl-lang')?.value;
  const category  = document.getElementById('wa-tpl-category')?.value;
  const body_text = document.getElementById('wa-tpl-body')?.value.trim();
  const statusEl  = document.getElementById('wa-tpl-status');

  if (!name || !body_text) { iv3Toast('أدخل الاسم ونص الرسالة', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(name)) { iv3Toast('الاسم: حروف إنجليزية صغيرة + أرقام + _ فقط', 'error'); return; }

  if (statusEl) { statusEl.style.display = 'block'; statusEl.style.background = '#f3f4f6'; statusEl.style.color = '#374151'; statusEl.textContent = '⏳ جاري الإرسال لـ Meta...'; }

  const d = await apiFetch('/api/system/inbox/wa-templates', {
    method: 'POST',
    body: JSON.stringify({ name, language, category, body_text })
  });

  if (d.ok) {
    if (statusEl) { statusEl.style.background = '#dcfce7'; statusEl.style.color = '#166534'; statusEl.textContent = '✅ تم الإرسال — سيظهر حالته "⏳ قيد المراجعة" حتى تعتمد Meta'; }
    iv3Toast('✅ تم الإرسال لـ Meta');
    waCloseTemplateForm();
    setTimeout(waLoadTemplates, 1500);
  } else {
    if (statusEl) { statusEl.style.background = '#fee2e2'; statusEl.style.color = '#991b1b'; statusEl.textContent = '❌ ' + (d.error || 'خطأ في الإرسال'); }
    iv3Toast('❌ ' + (d.error || 'خطأ'), 'error');
  }
}

async function waDeleteTemplate(name) {
  if (!confirm('حذف template "' + name + '"؟ لا يمكن التراجع.')) return;
  const d = await apiFetch('/api/system/inbox/wa-templates/' + encodeURIComponent(name), { method: 'DELETE' });
  if (d.ok) { iv3Toast('✅ تم الحذف'); waLoadTemplates(); }
  else iv3Toast('❌ ' + (d.error || 'خطأ في الحذف'), 'error');
}

// WhatsApp API scenario toggle
function waSetScenario(scenario) {
  const blockExisting = document.getElementById('wa-block-existing');
  const blockNew = document.getElementById('wa-block-new');
  const btnExisting = document.getElementById('wa-scenario-existing');
  const btnNew = document.getElementById('wa-scenario-new');
  if (!blockExisting || !blockNew) return;
  if (scenario === 'existing') {
    blockExisting.style.display = 'block';
    blockNew.style.display = 'none';
    if (btnExisting) { btnExisting.style.background='#1B5E30'; btnExisting.style.color='#fff'; btnExisting.style.borderColor='#1B5E30'; }
    if (btnNew) { btnNew.style.background='#f9fafb'; btnNew.style.color='#374151'; btnNew.style.borderColor='#e5e7eb'; }
  } else {
    blockExisting.style.display = 'none';
    blockNew.style.display = 'block';
    if (btnNew) { btnNew.style.background='#1B5E30'; btnNew.style.color='#fff'; btnNew.style.borderColor='#1B5E30'; }
    if (btnExisting) { btnExisting.style.background='#f9fafb'; btnExisting.style.color='#374151'; btnExisting.style.borderColor='#e5e7eb'; }
  }
}

// WhatsApp QR functions
async function startWhatsAppQR() {
  const statusEl = document.getElementById('wa-qr-status');
  const msgEl = document.getElementById('wa-qr-msg');
  const startBtn = document.getElementById('wa-qr-start-btn');
  const stopBtn = document.getElementById('wa-qr-stop-btn');
  if (startBtn) startBtn.disabled = true;
  if (msgEl) msgEl.textContent = '⏳ جاري تشغيل الخدمة...';
  const d = await apiFetch('/api/system/inbox/whatsapp-qr/start', { method: 'POST', body: JSON.stringify({}) });
  if (d && d.ok) {
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';
    if (statusEl) statusEl.innerHTML = '<div style="font-size:13px;font-weight:700;color:#f59e0b">⏳ في انتظار مسح QR Code...</div><div style="font-size:11px;color:#6b7280;margin-top:4px">يتجدد كل 20 ثانية</div>';
    if (msgEl) msgEl.textContent = '';
    pollWhatsAppQR();
  } else {
    if (startBtn) startBtn.disabled = false;
    if (msgEl) msgEl.textContent = '❌ ' + (d?.error || 'خطأ في التشغيل — تأكد من الخادم');
  }
}

async function stopWhatsAppQR() {
  await apiFetch('/api/system/inbox/whatsapp-qr/stop', { method: 'POST', body: JSON.stringify({}) });
  document.getElementById('wa-qr-start-btn').style.display = '';
  document.getElementById('wa-qr-start-btn').disabled = false;
  document.getElementById('wa-qr-stop-btn').style.display = 'none';
  document.getElementById('wa-qr-code-container').style.display = 'none';
  document.getElementById('wa-qr-status').innerHTML = '<div style="font-size:32px;margin-bottom:8px">📱</div><div style="font-size:13px;font-weight:700;color:#374151">تم الإيقاف</div>';
  document.getElementById('wa-qr-msg').textContent = '';
}

let waQRPollTimer = null;
async function pollWhatsAppQR() {
  if (waQRPollTimer) clearTimeout(waQRPollTimer);
  const d = await apiFetch('/api/system/inbox/whatsapp-qr/status');
  const statusEl = document.getElementById('wa-qr-status');
  const container = document.getElementById('wa-qr-code-container');
  const msgEl = document.getElementById('wa-qr-msg');
  if (!statusEl) return;
  if (d && d.status === 'connected') {
    statusEl.innerHTML = '<div style="font-size:32px;margin-bottom:8px">✅</div><div style="font-size:13px;font-weight:700;color:#16a34a">متصل بنجاح!</div><div style="font-size:11px;color:#6b7280;margin-top:4px">رقم: ' + (d.phone || '') + '</div>';
    if (container) container.style.display = 'none';
    if (msgEl) msgEl.textContent = '';
    loadIntegrationsStatus();
    return; // stop polling
  } else if (d && d.qr) {
    if (container) {
      container.style.display = 'block';
      container.innerHTML = '<img src="' + d.qr + '" style="width:200px;height:200px;border-radius:8px;border:2px solid #e5e7eb" alt="QR Code"><div style="font-size:11px;color:#6b7280;margin-top:6px">افتح واتساب → الأجهزة المرتبطة → ربط جهاز → امسح</div>';
    }
    statusEl.innerHTML = '<div style="font-size:12px;font-weight:700;color:#f59e0b">⏳ في انتظار المسح...</div>';
    if (msgEl) msgEl.textContent = 'يتجدد كل 15 ثانية';
  } else if (d && d.status === 'loading') {
    statusEl.innerHTML = '<div style="font-size:12px;color:#6b7280">⏳ جاري التحميل...</div>';
  }
  // Poll again after 5 seconds
  waQRPollTimer = setTimeout(pollWhatsAppQR, 5000);
}

async function saveMessengerSettingsNew() {
  const token = document.getElementById('fb-page-token')?.value.trim();
  const pageId = document.getElementById('fb-page-id')?.value.trim();
  if (!token || !pageId) { showToast('أدخل Token و Page ID'); return; }
  const d = await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ fb_page_token: token, fb_page_id: pageId })
  });
  showToast((d && (d.ok || d.settings)) ? '✅ تم الحفظ' : '❌ خطأ في الحفظ');
}

async function saveInstagramSettingsNew() {
  const token = document.getElementById('ig-token')?.value.trim();
  const accountId = document.getElementById('ig-account-id')?.value.trim();
  if (!token || !accountId) { showToast('أدخل Token و Account ID'); return; }
  const d = await apiFetch('/api/system/inbox/settings', {
    method: 'POST',
    body: JSON.stringify({ ig_token: token, ig_account_id: accountId })
  });
  showToast((d && (d.ok || d.settings)) ? '✅ تم الحفظ' : '❌ خطأ في الحفظ');
}

async function loadLabelsListIS() {
  const d = await apiFetch('/api/system/inbox/labels');
  const labels = d.labels || [];
  const el = document.getElementById('labels-list-is');
  if (!el) return;
  if (!labels.length) { el.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:10px">لا توجد تسميات</div>'; return; }
  el.innerHTML = labels.map(l =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f3f4f6">'
    +'<div style="display:flex;align-items:center;gap:6px">'
    +'<span style="width:12px;height:12px;border-radius:50%;background:'+l.color+';display:inline-block"></span>'
    +'<span style="font-size:12px;font-weight:600">'+esc(l.name)+'</span></div>'
    +'<button onclick="deleteLabel('+l.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">🗑️</button>'
    +'</div>'
  ).join('');
}

async function addLabelFromSettings() {
  const name = document.getElementById('is-new-label-name')?.value.trim();
  const color = document.getElementById('is-new-label-color')?.value || '#1B5E30';
  if (!name) { showToast('أدخل اسم التسمية'); return; }
  const d = await apiFetch('/api/system/inbox/labels', {method:'POST', body:JSON.stringify({name, color})});
  if (d.ok) { document.getElementById('is-new-label-name').value = ''; showToast('✅ تمت الإضافة'); loadLabelsListIS(); loadLabelsList(); }
  else showToast('❌ '+(d.error||'خطأ'));
}

async function loadTemplatesListIS() {
  await loadTemplatesList(); // refreshes templatesCache
  const templates = templatesCache || [];
  const el = document.getElementById('templates-list-is');
  if (!el) return;
  if (!templates.length) {
    el.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px">لا توجد ردود جاهزة — أضف أول رد من الأسفل</div>';
    return;
  }
  el.innerHTML = templates.map(t =>
    '<div style="border-bottom:1px solid #f3f4f6;padding:10px 0;display:flex;justify-content:space-between;align-items:start;gap:8px">'
    + '<div style="flex:1;min-width:0">'
    +   '<div style="font-size:13px;font-weight:700;color:#111827">' + esc(t.name||'') + '</div>'
    +   '<div style="font-size:12px;color:#6b7280;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.content||'') + '</div>'
    + '</div>'
    + '<button onclick="deleteTemplateIS(' + t.id + ')" style="flex-shrink:0;background:#fee2e2;border:none;color:#ef4444;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:Cairo,sans-serif">حذف</button>'
    + '</div>'
  ).join('');
}

async function deleteTemplateIS(id) {
  if (!confirm('حذف هذا الرد الجاهز؟')) return;
  const d = await apiFetch('/api/system/inbox/templates/' + id, { method: 'DELETE' });
  if (d.ok) { showToast('✅ تم الحذف'); loadTemplatesListIS(); }
  else showToast('❌ فشل الحذف');
}

async function addTemplateIS() {
  const name = document.getElementById('is-tpl-name').value.trim();
  const content = document.getElementById('is-tpl-content').value.trim();
  if (!name || !content) { showToast('❌ أدخل اسماً ونصاً'); return; }
  const d = await apiFetch('/api/system/inbox/templates', { method:'POST', body: JSON.stringify({name, content}) });
  if (d.ok) {
    showToast('✅ تم الإضافة');
    document.getElementById('is-tpl-name').value = '';
    document.getElementById('is-tpl-content').value = '';
    loadTemplatesListIS();
  } else showToast('❌ فشل الإضافة');
}

// ============================================================
// Auto-poll: رسائل جديدة كل 5 ثواني لو الـ inbox مفتوح
let inboxPollInterval = null;

function startInboxPolling() {
  stopInboxPolling();
  inboxPollInterval = setInterval(async () => {
    // تحديث قائمة المحادثات
    await loadInboxConversations();
    // لو في محادثة مفتوحة — حدّث الرسائل تلقائياً
    if (inboxCurrentConv) {
      const convId = inboxCurrentConv.id;
      const d = await apiFetch('/api/system/inbox/messages/' + convId);
      const msgs = d.messages || [];
      const msgsEl = document.getElementById('inbox-messages');
      if (!msgsEl || !msgs.length) return;
      // شوف لو في رسائل جديدة
      const currentCount = msgsEl.querySelectorAll('.msg-in,.msg-out').length;
      if (msgs.length !== currentCount) {
        // اتحدثت — أعد الرسم
        const platNames = { telegram:'تيليجرام', whatsapp:'واتساب', messenger:'ماسنجر', instagram:'إنستجرام' };
        const wasAtBottom = msgsEl.scrollHeight - msgsEl.scrollTop <= msgsEl.clientHeight + 50;
        msgsEl.innerHTML = msgs.map(m => renderMediaMessage(m)).join('');
        if (wasAtBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    }
    // تحديث badge
    await loadInboxUnreadBadge();
  }, 5000); // كل 5 ثواني
}

function stopInboxPolling() {
  if (inboxPollInterval) { clearInterval(inboxPollInterval); inboxPollInterval = null; }
}

// Global badge poll — كل 10 ثواني بغض النظر عن الصفحة
setInterval(loadInboxUnreadBadge, 10000);

// ============================================================
// VOICE RECORDING (Phase 1d)

// ── Analytics Section (page-inbox-settings) ─────────────────
async function loadAdvancedAnalyticsIS() {
  const container = document.getElementById('adv-analytics-container-is');
  if (!container) return;

  container.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px">جاري التحميل...</div>';

  try {
    const d = await apiFetch('/api/system/inbox/analytics/advanced?days=30');
    if (!d.ok) throw new Error(d.error || 'خطأ');
    const a = d.analytics || {};

    const cards = [
      { label: 'إجمالي المحادثات', value: a.total_conversations || 0, icon: '💬', color: '#1B5E30' },
      { label: 'الرسائل الواردة',  value: a.incoming_messages  || 0, icon: '📥', color: '#0369a1' },
      { label: 'الرسائل الصادرة',  value: a.outgoing_messages  || 0, icon: '📤', color: '#7c3aed' },
      { label: 'متوسط وقت الرد',   value: (a.avg_response_minutes || 0) + ' دق', icon: '⏱️', color: '#b45309' },
    ];

    const cardsHtml = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">` +
      cards.map(c =>
        `<div class="is-card" style="text-align:center;padding:14px">
          <div style="font-size:22px;margin-bottom:4px">${c.icon}</div>
          <div style="font-size:20px;font-weight:900;color:${c.color}">${c.value}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${c.label}</div>
        </div>`
      ).join('') + `</div>`;

    let platHtml = '';
    if (a.by_platform && a.by_platform.length) {
      const total = a.total_conversations || 1;
      const platColors = { telegram: '#0088cc', whatsapp: '#25D366', 'whatsapp-qr': '#25D366', messenger: '#0099ff', instagram: '#E1306C' };
      platHtml = `<div class="is-card">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px">📊 حسب المنصة</div>` +
        a.by_platform.map(p => {
          const pct = Math.round((p.count / total) * 100);
          const clr = platColors[p.platform] || '#6b7280';
          return `<div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span>${p.platform}</span><span style="color:${clr};font-weight:700">${p.count} (${pct}%)</span>
            </div>
            <div style="background:#f3f4f6;border-radius:4px;height:6px">
              <div style="background:${clr};width:${pct}%;height:6px;border-radius:4px"></div>
            </div>
          </div>`;
        }).join('') + `</div>`;
    }

    container.innerHTML = cardsHtml + platHtml;
  } catch (e) {
    container.innerHTML = `<div style="color:#ef4444;font-size:12px;text-align:center;padding:20px">⚠️ ${e.message}</div>`;
  }
}
