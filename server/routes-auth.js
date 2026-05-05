const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const master = require('./db-master');
const { sendWelcome, sendOTP } = require('./email');
require('dotenv').config();

const multer = require('multer');
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = require('path').join(__dirname, '../public/uploads/logos');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = require('path').extname(file.originalname) || '.png';
    cb(null, 'logo-' + Date.now() + ext);
  }
});
// M5: MIME type validation — يمنع SVG بـ JS وملفات خطرة
const ALLOWED_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`نوع الملف غير مسموح: ${file.mimetype} — المسموح: jpg/png/gif/webp`));
  },
});

function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ── Register ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, promo_code, slug, company_name } = req.body;
    if (!name?.trim() || !email?.trim() || !password?.trim())
      return res.status(400).json({ ok: false, error: 'الاسم والإيميل وكلمة السر مطلوبين' });

    // Validate + clean slug — always stored with pro- prefix
    const rawSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/--+/g,'-').replace(/^-|-$/g,'').replace(/^pro-/,'') : null;
    const cleanSlug = rawSlug ? 'pro-' + rawSlug : null;
    if (cleanSlug) {
      if (cleanSlug.length < 3) return res.status(400).json({ ok: false, error: 'اسم الـ subdomain قصير جداً (3 أحرف على الأقل)' });
      const reserved = ['www','api','admin','app','mail','pro','dev','test','staging'];
      if (reserved.includes(cleanSlug)) return res.status(400).json({ ok: false, error: 'هذا الاسم محجوز — اختر اسماً آخر' });
      const slugExists = master.prepare('SELECT id FROM users WHERE slug=?').get(cleanSlug);
      if (slugExists) return res.status(409).json({ ok: false, error: 'اسم الـ subdomain ده مأخوذ — جرب اسم تاني' });
    }

    const existing = master.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ ok: false, error: 'الإيميل ده مسجّل بالفعل' });

    // Validate promo code if provided
    let promoRow = null;
    if (promo_code) {
      promoRow = master.prepare(`
        SELECT * FROM promo_codes
        WHERE code=? AND active=1
        AND (valid_until IS NULL OR valid_until > datetime('now'))
        AND (max_uses IS NULL OR used_count < max_uses)
      `).get(promo_code.toUpperCase().trim());
      if (!promoRow) return res.status(400).json({ ok: false, error: 'البروموكود غير صالح أو انتهى' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const trial_ends = new Date(Date.now() + (+process.env.TRIAL_DAYS || 14) * 86400000).toISOString();

    const result = master.prepare(`
      INSERT INTO users (name, email, phone, password, status, trial_ends, promo_used, slug, company_name)
      VALUES (?, ?, ?, ?, 'trial', ?, ?, ?, ?)
    `).run(name.trim(), email.toLowerCase().trim(), phone?.trim() || null, hash, trial_ends, promoRow?.code || null, cleanSlug || null, company_name?.trim() || null);

    // Increment promo usage
    if (promoRow) {
      master.prepare('UPDATE promo_codes SET used_count=used_count+1 WHERE id=?').run(promoRow.id);
      master.prepare('INSERT INTO promo_uses (promo_id, user_id) VALUES (?,?)').run(promoRow.id, result.lastInsertRowid);
    }

    const user = master.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);

    // Send welcome email (non-blocking)
    sendWelcome({ name: user.name, email: user.email, trial_ends }).catch(console.error);

    const token = makeToken(user);
    res.json({ ok: true, token, slug: user.slug, user: { id: user.id, name: user.name, email: user.email, status: user.status, trial_ends: user.trial_ends } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Login with password ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'بيانات ناقصة' });

    const user = master.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ ok: false, error: 'الإيميل أو كلمة السر غلط' });

    if (user.status === 'suspended')
      return res.status(403).json({ ok: false, error: 'الحساب موقوف. تواصل مع الدعم' });

    const token = makeToken(user);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role||'user', status: user.status, plan: user.plan, trial_ends: user.trial_ends, plan_ends: user.plan_ends } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Owner 2FA: Step 1 — verify password only, then send OTP ────────────────
router.post('/owner-verify', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'بيانات ناقصة' });

    const user = master.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ ok: false, error: 'الإيميل أو كلمة السر غلط' });
    if (user.status === 'suspended')
      return res.status(403).json({ ok: false, error: 'الحساب موقوف' });

    // Admin-created accounts (role='user', no_otp flag) → direct login without OTP
    if (user.no_otp || user.role !== 'admin') {
      const token = makeToken(user);
      return res.json({ ok: true, direct: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role||'user', status: user.status, plan: user.plan, slug: user.slug } });
    }

    // Send OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000).toISOString();
    master.prepare("DELETE FROM otp_codes WHERE email=? AND used=0").run(email.toLowerCase().trim());
    master.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?,?,?)").run(email.toLowerCase().trim(), code, expires);

    // Send email
    try {
      const { sendOTP } = require('./email');
      await sendOTP({ email: email.toLowerCase().trim(), code });
    } catch(emailErr) {
      console.error('OTP email error:', emailErr.message);
    }

    res.json({ ok: true, message: 'تم إرسال كود التحقق على إيميلك' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Owner 2FA: resend OTP ───────────────────────────────────────
router.post('/owner-otp/send', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, error: 'الإيميل مطلوب' });
    const user = master.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ ok: false, error: 'حساب غير موجود' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000).toISOString();
    master.prepare("DELETE FROM otp_codes WHERE email=? AND used=0").run(email.toLowerCase().trim());
    master.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?,?,?)").run(email.toLowerCase().trim(), code, expires);
    try { const { sendOTP } = require('./email'); await sendOTP({ email: email.toLowerCase().trim(), code }); } catch(e) { console.error('[routes-auth.js]', e.message); }
    res.json({ ok: true, message: 'تم إرسال كود جديد' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Owner 2FA: Step 2 — verify OTP and issue token ─────────────────
router.post('/owner-otp/verify', (req, res) => {
  try {
    const { email, code } = req.body;
    const row = master.prepare(`
      SELECT * FROM otp_codes
      WHERE email=? AND code=? AND used=0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(email?.toLowerCase().trim(), code?.trim());
    if (!row) return res.status(400).json({ ok: false, error: 'كود غلط أو انتهت صلاحيته' });
    master.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);
    const user = master.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ ok: false, error: 'حساب غير موجود' });
    const token = makeToken(user);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, status: user.status, plan: user.plan, trial_ends: user.trial_ends, plan_ends: user.plan_ends } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── OTP Login (email) ─────────────────────────────────────────────────────
router.post('/otp/send', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, error: 'الإيميل مطلوب' });

    const user = master.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ ok: false, error: 'مش لاقيين حساب بالإيميل ده' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60000).toISOString();

    master.prepare("DELETE FROM otp_codes WHERE email=? AND used=0").run(email.toLowerCase().trim());
    master.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?,?,?)").run(email.toLowerCase().trim(), code, expires);

    await sendOTP({ email: email.toLowerCase().trim(), code });
    res.json({ ok: true, message: 'تم إرسال الكود على إيميلك' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/otp/verify', (req, res) => {
  try {
    const { email, code } = req.body;
    const row = master.prepare(`
      SELECT * FROM otp_codes
      WHERE email=? AND code=? AND used=0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(email?.toLowerCase().trim(), code?.trim());

    if (!row) return res.status(400).json({ ok: false, error: 'الكود غلط أو انتهت صلاحيته' });

    master.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);
    const user = master.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
    const token = makeToken(user);
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, status: user.status, plan: user.plan, trial_ends: user.trial_ends } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Slug availability check ──────────────────────────────────────────────
router.get('/slug-check/:slug', (req, res) => {
  try {
    const rawInput = req.params.slug.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/--+/g,'-').replace(/^-|-$/g,'').replace(/^pro-/,'');
    const fullSlug = 'pro-' + rawInput;
    if (rawInput.length < 3) return res.json({ ok: false, available: false, error: '3 أحرف على الأقل', slug: rawInput });
    const reserved = ['www','api','admin','app','mail','pro','dev','test','staging'];
    if (reserved.includes(rawInput)) return res.json({ ok: false, available: false, error: 'هذا الاسم محجوز', slug: rawInput });
    const exists = master.prepare('SELECT id FROM users WHERE slug=?').get(fullSlug);
    res.json({ ok: true, available: !exists, slug: rawInput, fullSlug });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Tenant info (public — for subdomain login page) ──────────────────────
router.get('/tenant/:slug', (req, res) => {
  try {
    const owner = master.prepare('SELECT id, name, company_name, logo_url, brand_color FROM users WHERE slug=?').get(req.params.slug.toLowerCase());
    if (!owner) return res.status(404).json({ ok: false, error: 'شركة غير موجودة' });
    res.json({ ok: true, tenant: { name: owner.company_name || owner.name, logo_url: owner.logo_url, brand_color: owner.brand_color || '#1B5E30' } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Me ────────────────────────────────────────────────────────────────────
router.get('/me', require('./auth-middleware').requireAuth, (req, res) => {
  const u = req.user;
  const su = req.tenantUser; // sub-user if logged in as sub-user

  if (su) {
    // Sub-user: return sub-user identity + permissions
    const db = require('./db-tenant').getTenantDb(u.id);
    const role = su.role_id ? db.prepare('SELECT permissions FROM tenant_roles WHERE id=?').get(su.role_id) : null;
    const perms = role ? (typeof role.permissions === 'string' ? JSON.parse(role.permissions||'{}') : role.permissions||{}) : {};
    const roleName = su.role_id ? (db.prepare('SELECT name FROM tenant_roles WHERE id=?').get(su.role_id)?.name||'') : '';
    return res.json({ ok: true, user: {
      id: su.id, name: su.name, email: su.email,
      role: 'sub_user', role_name: roleName,
      permissions: perms,
      owner_id: u.id, owner_name: u.name, owner_email: u.email,
      status: u.status, plan: u.plan
    }});
  }

  // Fetch fresh slug from DB (not in JWT payload)
  const freshUser = master.prepare('SELECT slug, company_name FROM users WHERE id=?').get(u.id);
  res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, plan: u.plan, trial_ends: u.trial_ends, plan_ends: u.plan_ends, role: u.role || 'owner', slug: freshUser?.slug || null, company_name: freshUser?.company_name || null } });
});

router.post('/upload-logo', require('./auth-middleware').requireAuth, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'لم يتم اختيار ملف' });
    const url = '/uploads/logos/' + req.file.filename;
    const db = req.db;
    if (db) db.prepare("INSERT INTO tenant_profile(key,value) VALUES('logo_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(url);
    const masterDb = require('./db-master');
    masterDb.prepare("UPDATE users SET logo_url=? WHERE id=?").run(url, req.user.id);
    res.json({ ok: true, url });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;

// ── Tenant Profile (get + update) ─────────────────────────────────────────
const { requireAuth } = require('./auth-middleware');
const { getTenantDb } = require('./db-tenant');

router.get('/profile', requireAuth, (req, res) => {
  try {
    const db = getTenantDb(req.user.id);
    const profile = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get();
    // Also get slug + company info from master
    const u = master.prepare('SELECT name, company_name, slug, logo_url, brand_color FROM users WHERE id=?').get(req.user.id);
    res.json({ ok: true, profile: { ...profile, ...u } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/profile', requireAuth, (req, res) => {
  try {
    const { company_name, company_name_en, address, phone, email, website,
            tax_number, commercial_reg, invoice_notes, logo_url, brand_color } = req.body;
    const db = getTenantDb(req.user.id);

    // Update tenant_profile
    db.prepare(`UPDATE tenant_profile SET
      company_name=COALESCE(?,company_name), company_name_en=COALESCE(?,company_name_en),
      address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email),
      website=COALESCE(?,website), tax_number=COALESCE(?,tax_number),
      commercial_reg=COALESCE(?,commercial_reg), invoice_notes=COALESCE(?,invoice_notes),
      logo_url=COALESCE(?,logo_url), brand_color=COALESCE(?,brand_color),
      updated_at=datetime('now') WHERE id=1
    `).run(company_name||null, company_name_en||null, address||null, phone||null,
           email||null, website||null, tax_number||null, commercial_reg||null,
           invoice_notes||null, logo_url||null, brand_color||null);

    // Sync logo + brand_color + company_name to master users table too
    // Handle name + password change
    const { name, password: newPassword } = req.body;
    if (name) master.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(), req.user.id);
    if (newPassword && newPassword.length >= 6) {
      const hash = bcrypt.hashSync(newPassword, 10);
      master.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.user.id);
    }

    master.prepare(`UPDATE users SET
      company_name=COALESCE(?,company_name),
      logo_url=COALESCE(?,logo_url),
      brand_color=COALESCE(?,brand_color)
      WHERE id=?
    `).run(company_name||null, logo_url||null, brand_color||null, req.user.id);

    res.json({ ok: true, message: 'تم حفظ بيانات الشركة' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});
