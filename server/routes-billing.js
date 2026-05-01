const express = require('express');
const router = express.Router();
const master = require('./db-master');
const { requireAuth, requireAdmin } = require('./auth-middleware');
const { sendSubscriptionConfirm } = require('./email');
require('dotenv').config();

// ── Plans ─────────────────────────────────────────────────────────────────
router.get('/plans', (req, res) => {
  const plans = master.prepare('SELECT * FROM plans WHERE active=1').all();
  res.json({ ok: true, data: plans });
});

// ── Promo code validation ─────────────────────────────────────────────────
router.post('/promo/validate', requireAuth, (req, res) => {
  const { code, plan } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: 'الكود مطلوب' });

  const promo = master.prepare(`
    SELECT * FROM promo_codes
    WHERE code=? AND active=1
    AND (valid_until IS NULL OR valid_until > datetime('now'))
    AND (max_uses IS NULL OR used_count < max_uses)
  `).get(code.toUpperCase().trim());

  if (!promo) return res.status(400).json({ ok: false, error: 'الكود غير صالح أو انتهى' });

  // Check per_user limit
  if (promo.per_user) {
    const used = master.prepare('SELECT COUNT(*) as n FROM promo_uses WHERE promo_id=? AND user_id=?').get(promo.id, req.user.id);
    if (used.n > 0) return res.status(400).json({ ok: false, error: 'استخدمت الكود ده قبل كده' });
  }

  // Calculate discount
  const planRow = master.prepare('SELECT * FROM plans WHERE name=?').get(plan);
  if (!planRow) return res.status(400).json({ ok: false, error: 'الخطة غير صحيحة' });

  let discount = 0;
  if (promo.type === 'percent') discount = Math.round(planRow.price * promo.value / 100);
  else discount = Math.min(promo.value, planRow.price);

  const final_price = planRow.price - discount;

  res.json({ ok: true, promo: { id: promo.id, code: promo.code, type: promo.type, value: promo.value }, discount, final_price, original_price: planRow.price });
});

// ── Create payment request (manual payment) ───────────────────────────────
router.post('/pay', requireAuth, async (req, res) => {
  try {
    const { plan, promo_code } = req.body;
    const planRow = master.prepare('SELECT * FROM plans WHERE name=? AND active=1').get(plan);
    if (!planRow) return res.status(400).json({ ok: false, error: 'الخطة غير موجودة' });

    let promoRow = null, discount = 0, promoId = null;
    if (promo_code) {
      promoRow = master.prepare(`
        SELECT * FROM promo_codes WHERE code=? AND active=1
        AND (valid_until IS NULL OR valid_until > datetime('now'))
        AND (max_uses IS NULL OR used_count < max_uses)
      `).get(promo_code.toUpperCase().trim());

      if (!promoRow) return res.status(400).json({ ok: false, error: 'البروموكود غير صالح' });

      if (promoRow.per_user) {
        const used = master.prepare('SELECT COUNT(*) as n FROM promo_uses WHERE promo_id=? AND user_id=?').get(promoRow.id, req.user.id);
        if (used.n > 0) return res.status(400).json({ ok: false, error: 'استخدمت الكود ده قبل كده' });
      }

      promoId = promoRow.id;
      if (promoRow.type === 'percent') discount = Math.round(planRow.price * promoRow.value / 100);
      else discount = Math.min(promoRow.value, planRow.price);
    }

    const final_amount = planRow.price - discount;

    // Create pending payment
    const result = master.prepare(`
      INSERT INTO payments (user_id, plan, amount, promo_id, discount, method, status)
      VALUES (?, ?, ?, ?, ?, 'manual', 'pending')
    `).run(req.user.id, plan, final_amount, promoId, discount);

    const paymentId = result.lastInsertRowid;

    // Return payment instructions (manual Paymob wallet)
    res.json({
      ok: true,
      payment_id: paymentId,
      amount: final_amount,
      amount_display: (final_amount / 100).toFixed(0),
      plan,
      discount,
      instructions: {
        method: 'واتساب / فودافون كاش',
        phone: '01222784206',
        message: `أهلاً، عايز أشترك في نظام أريج (${plan}) — رقم الطلب #${paymentId}`,
        whatsapp_url: `https://wa.me/201222784206?text=${encodeURIComponent(`أهلاً، عايز أشترك في نظام أريج خطة ${plan === 'monthly' ? 'الشهري' : plan === 'yearly' ? 'السنوي' : 'مدى الحياة'} — رقم الطلب #${paymentId} — المبلغ: ${(final_amount/100).toFixed(0)} ج.م`)}`
      }
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: confirm payment ────────────────────────────────────────────────
router.post('/admin/confirm-payment/:id', requireAdmin, async (req, res) => {
  try {
    const payment = master.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
    if (!payment) return res.status(404).json({ ok: false, error: 'الدفع غير موجود' });
    if (payment.status === 'paid') return res.status(400).json({ ok: false, error: 'متأكّد بالفعل' });

    const now = new Date();
    let plan_ends = null;
    if (payment.plan === 'monthly') {
      plan_ends = new Date(now.getTime() + 30 * 86400000).toISOString();
    } else if (payment.plan === 'yearly') {
      plan_ends = new Date(now.getTime() + 365 * 86400000).toISOString();
    }
    // lifetime = null

    // Update payment
    master.prepare("UPDATE payments SET status='paid', paid_at=datetime('now') WHERE id=?").run(payment.id);

    // Update user
    master.prepare(`
      UPDATE users SET status='active', plan=?, plan_ends=?, trial_ends=NULL WHERE id=?
    `).run(payment.plan, plan_ends, payment.user_id);

    // Increment promo usage
    if (payment.promo_id) {
      master.prepare('UPDATE promo_codes SET used_count=used_count+1 WHERE id=?').run(payment.promo_id);
      const alreadyUsed = master.prepare('SELECT id FROM promo_uses WHERE promo_id=? AND user_id=?').get(payment.promo_id, payment.user_id);
      if (!alreadyUsed) master.prepare('INSERT INTO promo_uses (promo_id, user_id) VALUES (?,?)').run(payment.promo_id, payment.user_id);
    }

    const user = master.prepare('SELECT * FROM users WHERE id=?').get(payment.user_id);
    sendSubscriptionConfirm({ name: user.name, email: user.email, plan: payment.plan, amount: payment.amount, ends_at: plan_ends }).catch(console.error);

    res.json({ ok: true, message: 'تم تأكيد الدفع وتفعيل الاشتراك' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: pending payments ───────────────────────────────────────────────
router.get('/admin/payments', requireAdmin, (req, res) => {
  const { status = 'pending' } = req.query;
  const payments = master.prepare(`
    SELECT p.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
           pc.code as promo_code
    FROM payments p
    JOIN users u ON u.id=p.user_id
    LEFT JOIN promo_codes pc ON pc.id=p.promo_id
    WHERE p.status=?
    ORDER BY p.created_at DESC
  `).all(status);
  res.json({ ok: true, data: payments });
});

// ── Admin: promo codes CRUD ───────────────────────────────────────────────
router.get('/admin/promos', requireAdmin, (req, res) => {
  const promos = master.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
  res.json({ ok: true, data: promos });
});

router.post('/admin/promos', requireAdmin, (req, res) => {
  const { code, type, value, max_uses, per_user, valid_until } = req.body;
  if (!code || !type || !value) return res.status(400).json({ ok: false, error: 'بيانات ناقصة' });

  try {
    const result = master.prepare(`
      INSERT INTO promo_codes (code, type, value, max_uses, per_user, valid_until)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase().trim(), type, +value, max_uses || null, per_user ? 1 : 0, valid_until || null);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ ok: false, error: 'الكود موجود بالفعل' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put('/admin/promos/:id', requireAdmin, (req, res) => {
  const { active } = req.body;
  master.prepare('UPDATE promo_codes SET active=? WHERE id=?').run(active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── Admin: users list ─────────────────────────────────────────────────────
router.get('/admin/users', requireAdmin, (req, res) => {
  const { status, search } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND status=?'; params.push(status); }
  if (search) { where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; const s='%'+search+'%'; params.push(s,s,s); }

  const users = master.prepare(`SELECT id,name,email,phone,status,plan,trial_ends,plan_ends,created_at FROM users ${where} ORDER BY created_at DESC`).all(...params);
  res.json({ ok: true, data: users });
});

router.put('/admin/users/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['trial','active','expired','suspended'];
  if (!valid.includes(status)) return res.status(400).json({ ok: false, error: 'status غير صحيح' });
  master.prepare('UPDATE users SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

// ── Admin: extend subscription ────────────────────────────────────────────
router.post('/admin/users/:id/extend', requireAdmin, (req, res) => {
  const { plan, days } = req.body;
  const user = master.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });

  let plan_ends = null;
  if (plan === 'lifetime') {
    plan_ends = null;
  } else {
    const base = user.plan_ends && new Date(user.plan_ends) > new Date() ? new Date(user.plan_ends) : new Date();
    plan_ends = new Date(base.getTime() + (days || (plan === 'monthly' ? 30 : 365)) * 86400000).toISOString();
  }

  master.prepare("UPDATE users SET status='active', plan=?, plan_ends=? WHERE id=?").run(plan || user.plan, plan_ends, req.params.id);
  res.json({ ok: true, plan_ends });
});

// ── Admin: stats ──────────────────────────────────────────────────────────
router.get('/admin/stats', requireAdmin, (req, res) => {
  const total = master.prepare("SELECT COUNT(*) as n FROM users WHERE role='user'").get().n;
  const trial = master.prepare("SELECT COUNT(*) as n FROM users WHERE status='trial'").get().n;
  const active = master.prepare("SELECT COUNT(*) as n FROM users WHERE status='active'").get().n;
  const expired = master.prepare("SELECT COUNT(*) as n FROM users WHERE status='expired'").get().n;
  const revenue = master.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE status='paid'").get().n;
  const pending_payments = master.prepare("SELECT COUNT(*) as n FROM payments WHERE status='pending'").get().n;

  res.json({ ok: true, data: { total, trial, active, expired, revenue, pending_payments } });
});


// ── Admin: edit user info ─────────────────────────────────────────────────
router.put('/admin/users/:id', requireAdmin, (req, res) => {
  const { name, email, phone, plan, status, slug, company_name } = req.body;
  const u = master.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
  master.prepare(`UPDATE users SET
    name=COALESCE(?,name), email=COALESCE(?,email), phone=COALESCE(?,phone),
    plan=COALESCE(?,plan), status=COALESCE(?,status),
    slug=COALESCE(?,slug), company_name=COALESCE(?,company_name)
    WHERE id=?`).run(name||null, email||null, phone||null, plan||null, status||null, slug||null, company_name||null, req.params.id);
  res.json({ ok: true });
});

// ── Admin: delete user ────────────────────────────────────────────────────
router.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const u = master.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
  if (u.role === 'admin') return res.status(403).json({ ok: false, error: 'لا يمكن حذف الأدمن' });
  master.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  // Clean up tenant DB
  const fs = require('fs');
  const dbPath = require('path').join(__dirname, '../data/tenants/' + u.id + '.db');
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch(e) { console.error('[routes-billing.js]', e.message); }
  res.json({ ok: true });
});

// ── Admin: users with subscription days remaining ─────────────────────────
router.get('/admin/users/detail', requireAdmin, (req, res) => {
  const { status, search } = req.query;
  let where = "WHERE role='user'";
  const params = [];
  if (status && status !== 'all') { where += ' AND status=?'; params.push(status); }
  if (search) { where += ' AND (name LIKE ? OR email LIKE ? OR slug LIKE ?)'; const s='%'+search+'%'; params.push(s,s,s); }
  const users = master.prepare(`SELECT id,name,email,phone,status,plan,trial_ends,plan_ends,slug,company_name,created_at FROM users ${where} ORDER BY created_at DESC`).all(...params);
  const now = Date.now();
  const enriched = users.map(u => {
    let days_left = null;
    const end = u.status === 'trial' ? u.trial_ends : u.plan_ends;
    if (end) days_left = Math.ceil((new Date(end).getTime() - now) / 86400000);
    if (u.plan === 'lifetime') days_left = 999999;
    return { ...u, days_left };
  });
  res.json({ ok: true, data: enriched });
});


// ── Admin: create account manually ───────────────────────────────────────
router.post('/admin/create-account', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, company_name, slug, days, plan } = req.body;
    if (!name || !email || !password) return res.status(400).json({ ok: false, error: 'الاسم والإيميل وكلمة السر مطلوبين' });

    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    require('dotenv').config();

    // Check email unique
    const existing = master.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ ok: false, error: 'الإيميل ده موجود بالفعل' });

    // Arabic to slug transliteration
    function arabicToSlug(text) {
      const map = {'ا':'a','أ':'a','إ':'a','آ':'a','ء':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'a','ة':'a',' ':'-'};
      return text.toLowerCase().split('').map(ch => map[ch]!==undefined?map[ch]:/[a-z0-9]/.test(ch)?ch:/[A-Z]/.test(ch)?ch.toLowerCase():'-').join('').replace(/--+/g,'-').replace(/^-|-$/g,'').substring(0,20)||'co';
    }

    // Clean + prefix slug
    let rawSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/--+/g,'-').replace(/^-|-$/g,'').replace(/^pro-/,'') : null;
    if (!rawSlug) {
      // Auto-generate from company name (with Arabic transliteration) or email
      rawSlug = arabicToSlug(company_name || email.split('@')[0]);
    }
    if (!rawSlug || rawSlug.length < 2) rawSlug = 'co' + Date.now().toString().slice(-4);
    // Ensure unique
    let finalSlug = 'pro-' + rawSlug;
    let suffix = 2;
    while (master.prepare('SELECT id FROM users WHERE slug=?').get(finalSlug)) {
      finalSlug = 'pro-' + rawSlug + '-' + suffix++;
    }

    // Calculate trial_ends
    const daysNum = parseInt(days) || 14;
    const trial_ends = new Date(Date.now() + daysNum * 86400000).toISOString();
    const hash = bcrypt.hashSync(password, 10);

    const result = master.prepare(`
      INSERT INTO users (name, email, password, status, trial_ends, slug, company_name, role)
      VALUES (?, ?, ?, 'trial', ?, ?, ?, 'user')
    `).run(name.trim(), email.toLowerCase().trim(), hash, trial_ends, finalSlug, company_name || name);

    const userId = result.lastInsertRowid;

    // Init tenant DB
    const { getTenantDb } = require('./db-tenant');
    getTenantDb(userId);

    const loginUrl = 'https://' + finalSlug + '.areejegypt.com/';

    // Send welcome email with credentials
    try {
      const { sendAdminCreatedAccount } = require('./email');
      await sendAdminCreatedAccount({ name, email: email.toLowerCase().trim(), password, slug: finalSlug, days: daysNum, login_url: loginUrl });
    } catch(emailErr) {
      console.error('Welcome email error:', emailErr.message);
    }

    res.json({
      ok: true,
      user: { id: userId, name, email, slug: finalSlug, trial_ends, days: daysNum },
      subdomain: 'https://' + finalSlug + '.areejegypt.com',
      login_url: loginUrl,
      email_sent: true
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ── Admin: system health ──────────────────────────────────────────────────
router.get('/admin/health', requireAdmin, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const backupDir = '/home/work/areej-backups/daily';
  const logFile  = '/home/work/areej-backups/logs/backup.log';

  // List backups
  let backups = [];
  try {
    backups = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.tar.gz'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { name: f, size_kb: Math.round(stat.size/1024), created: stat.mtime };
      })
      .sort((a,b) => new Date(b.created) - new Date(a.created));
  } catch(e) { console.error('[routes-billing.js]', e.message); }

  // Last backup log lines
  let lastLog = '';
  try {
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    lastLog = lines.slice(-8).join('\n');
  } catch(e) { console.error('[routes-billing.js]', e.message); }

  // Disk usage
  const { execSync } = require('child_process');
  let disk = {};
  try {
    const out = execSync("df -h / | tail -1").toString().trim().split(/\s+/);
    disk = { total: out[1], used: out[2], free: out[3], pct: out[4] };
  } catch(e) { console.error('[routes-billing.js]', e.message); }

  // Memory
  const mem = process.memoryUsage();

  res.json({
    ok: true,
    server: { uptime_seconds: Math.floor(process.uptime()), memory_mb: Math.round(mem.rss/1024/1024) },
    disk,
    backups_count: backups.length,
    latest_backup: backups[0] || null,
    backups,
    last_log: lastLog
  });
});

// ── Admin: trigger manual backup ─────────────────────────────────────────
router.post('/admin/backup-now', requireAdmin, (req, res) => {
  const { exec } = require('child_process');
  exec('/home/work/areej-backups/backup.sh', { timeout: 60000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ ok: false, error: err.message, stderr });
    res.json({ ok: true, output: stdout });
  });
});

module.exports = router;

// ============================================================
// ADMIN — Send Notification
// ============================================================
router.post('/admin/notify', requireAdmin, (req, res) => {
  const masterDb = master;
  const { title, body, type='info', user_id } = req.body;
  if (!title || !body) return res.json({ ok:false, error:'title and body required' });
  try {
    let users;
    if (user_id) {
      users = masterDb.prepare(`SELECT id FROM users WHERE id=?`).all(user_id);
    } else {
      users = masterDb.prepare(`SELECT id FROM users WHERE status != 'deleted'`).all();
    }
    const { getTenantDb } = require('./db-tenant');
    let count = 0;
    for (const u of users) {
      try {
        const tdb = getTenantDb(u.id);
        tdb.prepare(`INSERT INTO notifications (title, body, type, is_read, created_at) VALUES (?,?,?,0,datetime('now'))`).run(title, body, type);
        count++;
      } catch(e) { console.error('[routes-billing.js]', e.message); }
    }
    res.json({ ok:true, sent: count });
  } catch(e) {
    res.json({ ok:false, error: e.message });
  }
});

// ============================================================
// ADMIN — Per-tenant backup + password management
// ============================================================

// POST /api/billing/admin/backup-tenant/:id
router.post('/admin/backup-tenant/:id', requireAdmin, (req, res) => {
  const masterDb = master;
  try {
    const user = masterDb.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.json({ ok: false, error: 'user not found' });
    const { execSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const srcDb = path.join(__dirname, '../data/tenants/'+user.id+'.db');
    if (!fs.existsSync(srcDb)) return res.json({ ok: false, error: 'tenant DB not found' });
    const backupDir = '/home/work/areej-backups/tenants';
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const destDb = path.join(backupDir, user.id+'_'+ts+'.db');
    fs.copyFileSync(srcDb, destDb);
    res.json({ ok: true, backup_path: destDb, size_kb: Math.round(fs.statSync(destDb).size/1024) });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/billing/admin/reset-password/:id — تغيير الباسورد وإرسال email
router.post('/admin/reset-password/:id', requireAdmin, async (req, res) => {
  const masterDb = master;
  try {
    const user = masterDb.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.json({ ok: false, error: 'user not found' });
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const newPassword = crypto.randomBytes(6).toString('hex'); // 12 chars
    const hash = await bcrypt.hash(newPassword, 10);
    masterDb.prepare('UPDATE users SET password=? WHERE id=?').run(hash, user.id);
    // Send email
    const { sendMail } = require('./email');
    const slug = user.slug || '';
    const loginUrl = 'https://' + slug + '.areejegypt.com/';
    await sendMail({
      to: user.email,
      subject: '🔑 بيانات الدخول الجديدة — أريج أكاديمي',
      html: `
        <div dir="rtl" style="font-family:Arial;max-width:500px;margin:0 auto">
          <h2 style="color:#1B5E30">🌿 أريج أكاديمي</h2>
          <p>مرحباً <strong>${user.name}</strong>،</p>
          <p>تم تغيير كلمة المرور الخاصة بحسابك.</p>
          <div style="background:#f0fdf4;border-radius:10px;padding:16px;margin:16px 0">
            <p><strong>📧 الإيميل:</strong> ${user.email}</p>
            <p><strong>🔑 كلمة المرور الجديدة:</strong> <code style="font-size:16px;background:#fff;padding:4px 8px;border-radius:4px">${newPassword}</code></p>
            <p><strong>🔗 رابط الدخول:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          </div>
          <p style="color:#6b7280;font-size:12px">يُنصح بتغيير كلمة المرور بعد تسجيل الدخول.</p>
        </div>
      `
    });
    res.json({ ok: true, email_sent: true, new_password: newPassword });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/billing/admin/resend-credentials/:id — إعادة إرسال بيانات الدخول (باسورد جديد)
router.post('/admin/resend-credentials/:id', requireAdmin, async (req, res) => {
  try {
    const user = master.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.json({ ok: false, error: 'user not found' });
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    // توليد باسورد جديد
    const newPassword = crypto.randomBytes(5).toString('hex'); // 10 chars readable
    const hash = await bcrypt.hash(newPassword, 10);
    master.prepare('UPDATE users SET password=? WHERE id=?').run(hash, user.id);
    const slug = user.slug || '';
    const loginUrl = 'https://' + slug + '.areejegypt.com/';
    const { sendMail } = require('./email');
    await sendMail({
      to: user.email,
      subject: '🔑 بيانات دخول حسابك — أريج أكاديمي',
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:#1B5E30;padding:20px;border-radius:12px 12px 0 0;text-align:center">
            <h2 style="color:#fff;margin:0">🌿 أريج أكاديمي</h2>
          </div>
          <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
            <p>مرحباً <strong>${user.name}</strong>،</p>
            <p>إليك بيانات الدخول لحسابك:</p>
            <div style="background:#fff;border:2px solid #1B5E30;border-radius:10px;padding:16px;margin:16px 0">
              <p style="margin:6px 0"><strong>📧 الإيميل:</strong> <code>${user.email}</code></p>
              <p style="margin:6px 0"><strong>🔑 كلمة المرور:</strong> <code style="font-size:18px;color:#1B5E30;background:#f0fdf4;padding:4px 8px;border-radius:4px">${newPassword}</code></p>
              <p style="margin:6px 0"><strong>🔗 رابط الدخول:</strong><br>
                <a href="${loginUrl}" style="color:#1B5E30;font-weight:700">${loginUrl}</a>
              </p>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px">
              يُنصح بتغيير كلمة المرور بعد تسجيل الدخول لأول مرة.<br>
              إذا لم تطلب هذا البريد، يرجى تجاهله.
            </p>
          </div>
        </div>
      `
    });
    res.json({ ok: true, email_sent: true, new_password: newPassword });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/billing/admin/export-tenant/:id — تصدير بيانات العميل
router.get('/admin/export-tenant/:id', requireAdmin, (req, res) => {
  const masterDb = master;
  try {
    const user = masterDb.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.json({ ok: false, error: 'not found' });
    const { getTenantDb } = require('./db-tenant');
    const db = getTenantDb(user.id);
    const contacts = db.prepare('SELECT * FROM crm_contacts').all();
    const invoices = db.prepare('SELECT * FROM sys_invoices').all();
    const orders   = db.prepare('SELECT * FROM sys_orders').all();
    const products = db.prepare('SELECT * FROM sys_products').all();
    const transactions = db.prepare('SELECT * FROM sys_transactions').all();
    const exportData = {
      exported_at: new Date().toISOString(),
      user: { name: user.name, email: user.email, company: user.company_name },
      contacts, invoices, orders, products, transactions
    };
    res.setHeader('Content-Disposition', 'attachment; filename="export_'+user.id+'_'+Date.now()+'.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(exportData, null, 2));
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
