const API_INV = '/api/system';
const API_CRM = '/api/crm';
function getToken() { return localStorage.getItem('pro_token') || ''; }
async function apiFetch(url, opts={}) {
  const headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, opts.headers || {});
  const r = await fetch(url, Object.assign({}, opts, { headers }));
  return r.json().catch(() => ({ ok: false, error: 'parse error' }));
}

// Auth check — single source of truth
async function checkAuth() {
  const token = getToken();
  if (!token) { window.location.href = '/'; return false; }
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!d.ok) { localStorage.removeItem('pro_token'); window.location.href = '/'; return false; }

    // Show user info in topbar
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = d.user.name || '';
    // Set avatar initials
    const avatarEl = document.getElementById('nav-user-avatar');
    if (avatarEl && d.user.name) {
      const initials = d.user.name.trim().split(' ').map(w => w[0]).slice(0,2).join('');
      avatarEl.textContent = initials;
    }
    // Set topbar brand label
    const tbBrand = document.getElementById('tb-brand-label');
    if (tbBrand) tbBrand.textContent = d.user.company_name || d.user.name || 'أريج';
    const badgeEl = document.getElementById('nav-status-badge');
    if (badgeEl) {
      const statusMap = { trial: 'تجريبي', active: 'نشط', expired: 'منتهي', admin: 'أدمين' };
      const colorMap = { trial: '#F5A623', active: '#22c55e', expired: '#ef4444', admin: '#7c3aed' };
      const s = d.user.role === 'admin' ? 'admin' : d.user.status;
      badgeEl.textContent = statusMap[s] || s;
      badgeEl.style.background = colorMap[s] || 'rgba(255,255,255,.15)';
      badgeEl.style.color = '#fff';
    }

    // Trial expiry warning banner
    if (d.user.status === 'trial' && d.user.trial_ends) {
      const ends = new Date(d.user.trial_ends);
      const daysLeft = Math.ceil((ends - Date.now()) / 86400000);
      if (daysLeft <= 3) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fff3cd;border-bottom:2px solid #F5A623;padding:8px 20px;text-align:center;font-family:Cairo,sans-serif;font-size:13px;color:#856404';
        banner.innerHTML = `⚠️ الفترة التجريبية تنتهي خلال <strong>${daysLeft} أيام</strong> — <a href="/upgrade/" style="color:var(--brand,#1B5E30);font-weight:700">اشترك دلوقتي</a>`;
        document.body.insertBefore(banner, document.body.firstChild);
      }
    }
    // Permission-based nav hiding for sub-users
    if (d.user.role === 'sub_user' && d.user.permissions) {
      applyPermissionNav(d.user.permissions);
      // Store for later use
      window._userPerms = d.user.permissions;
      window._isSubUser = true;
    } else {
      window._isSubUser = false;
    }
    // Apply tenant branding
    try { await loadAndApplyBranding(); } catch(e) {}

    // If on main domain but user has a slug → redirect to subdomain
    const currentHost = window.location.hostname;
    const isMainDomain = currentHost === 'pro.areejegypt.com' || currentHost === 'localhost';
    if (isMainDomain && d.user.slug) {
      // Pass token via URL hash — subdomain picks it up on load
      const tok = getToken();
      const tenantSub = d.user.slug.startsWith('pro-') ? d.user.slug : 'pro-' + d.user.slug;
      // Preserve all hash params (p, s, ch) during subdomain redirect
      const _existingHashParams = new URLSearchParams(window.location.hash.slice(1));
      _existingHashParams.delete('t'); // remove any old token
      _existingHashParams.set('t', tok); // put new token first
      window.location.href = 'https://' + tenantSub + '.areejegypt.com/dashboard/#' + _existingHashParams.toString();
      return false;
    }

    return d.user;
  } catch(e) { window.location.href = '/'; return false; }
}

async function loadAndApplyBranding() {
  try {
    const r = await apiFetch('/api/auth/profile');
    const d = await r.json();
    if (!d.ok) return;
    const p = d.profile || {};

    // Brand color — from tenant_profile first, then master users table
    const color = p.brand_color || '#1B5E30';
    document.documentElement.style.setProperty('--brand', color);
    document.documentElement.style.setProperty('--brand-rgb', hexToRGB(color));
    document.documentElement.style.setProperty('--brand-light', hexToRGBA(color, 0.1));

    // Nav logo — try logo_url from profile then master
    const logoUrl = p.logo_url || null;
    const navLogo = document.getElementById('nav-company-logo');
    if (navLogo) {
      if (logoUrl) {
        navLogo.src = logoUrl;
        navLogo.style.display = 'inline-block';
        navLogo.onerror = () => { navLogo.style.display = 'none'; };
      } else {
        navLogo.style.display = 'none';
      }
    }

    // Nav brand name
    const navName = document.getElementById('nav-brand-name');
    if (navName) {
      const cname = p.company_name || p.name || '';
      navName.innerHTML = cname
        ? cname + ' <small style="font-size:10px;opacity:.6">| أريج</small>'
        : 'نظام أريج';
    }

    // Page title
    const cname = p.company_name || p.name || 'نظام أريج';
    document.title = cname + ' — نظام أريج';
    localStorage.setItem('areej_company', p.company_name || p.name || '');

  } catch(e) { console.warn('Branding load failed:', e); }
}

function hexToRGB(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}
function hexToRGBA(hex, a) {
  const [r,g,b] = [hex.slice(1,3),hex.slice(3,5),hex.slice(5,7)].map(x=>parseInt(x,16));
  return 'rgba('+r+','+g+','+b+','+a+')';
}

// ── Nav tab permission filter ──────────────────────────────
const NAV_PERM_MAP = {
  // tab data-page → required permission key (null = always visible to owner)
  'dashboard':  null,
  'invoices':   'invoices',
  'orders':     'orders',
  'crm':        'crm',
  'inventory':  'products',
  'suppliers':  'suppliers',
  'treasury':   'wallets',
  'followup':   'followup',
  'affiliates': 'affiliates',
  'pricing':    'pricing',
  'contracts':  'contracts',
  'roas':       'roas',
  'content':    'content',
  'plan90':     'plan90',
  'shipping':    null,
  'sales-tools': null,
  'marketplace': null,
  'inbox':      null,
  'library':    null,
  'hr':         'hr',
  'team':         'users',
  'team-settings': null,
  'settings':     'settings',
  'inbox-settings': null,
};

function applyPermissionNav(perms) {
  // Hide nav tabs the sub-user has no access to
  document.querySelectorAll('[data-page]').forEach(btn => {
    const page = btn.getAttribute('data-page');
    const reqPerm = NAV_PERM_MAP[page];
    if (reqPerm && !perms[reqPerm]) {
      btn.style.display = 'none';
    }
  });
  // Permissions stored globally — showPage checks them directly
  window._userPerms = perms;
  window._isSubUser = true;
}

function showToast(msg, duration=3000) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--brand,#1B5E30);color:#fff;padding:10px 20px;border-radius:10px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}

function hdr() { return { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + getToken() }; }
async function sysGet(path) {
  const r = await fetch(API_INV + path, { headers: hdr(), credentials:'include' });
  return r.json();
}
async function sysPost(path, body) {
  const r = await fetch(API_INV + path, { method:'POST', headers: hdr(), body: JSON.stringify(body), credentials:'include' });
  return r.json();
}
async function sysPut(path, body) {
  const r = await fetch(API_INV + path, { method:'PUT', headers: hdr(), body: JSON.stringify(body), credentials:'include' });
  return r.json();
}
async function sysDel(path) {
  const r = await fetch(API_INV + path, { method:'DELETE', headers: hdr(), credentials:'include' });
  return r.json();
}

// ── PAGES (placeholder — unified showPage defined at end of file) ──

