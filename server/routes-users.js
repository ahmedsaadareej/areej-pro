/**
 * Tenant Users & Roles — /api/users/*
 * إدارة الموظفين والصلاحيات داخل حساب العميل
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getTenantDb } = require('./db-tenant');
const { requireAuth } = require('./auth-middleware');
require('dotenv').config();

// ============================================================
// SUB-USER LOGIN (public — no auth required)
// ============================================================
// POST /api/users/login — موظف يدخل بإيميل الشركة + إيميله + باسورده
router.post('/login', async (req, res) => {
  try {
    const master = require('./db-master');
    const { email, owner_email, password, slug } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'الإيميل وكلمة السر مطلوبين' });
    }

    // Find owner: by tenantOwner (subdomain middleware) > by slug > by owner_email
    let ownerRecord = req.tenantOwner || null;
    if (!ownerRecord && slug) {
      ownerRecord = master.prepare('SELECT * FROM users WHERE slug=?').get(slug.toLowerCase().trim());
    }
    if (!ownerRecord && owner_email) {
      ownerRecord = master.prepare('SELECT * FROM users WHERE email=?').get(owner_email.toLowerCase().trim());
    }
    if (!ownerRecord) return res.status(404).json({ ok: false, error: 'الشركة مش موجودة — تحقق من الرابط' });

    const owner = ownerRecord;
    // owner_email param is optional — don't crash if missing
    if (!owner) return res.status(404).json({ ok: false, error: 'حساب الشركة غير موجود' });

    // If the login email matches the OWNER account itself → send OTP (same as /owner-verify flow)
    if (email.toLowerCase() === owner.email.toLowerCase()) {
      const bcryptLib = require('bcryptjs');
      const pwMatch = await bcryptLib.compare(password, owner.password);
      if (!pwMatch) return res.status(401).json({ ok: false, error: 'كلمة السر غلط' });

      // Send OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60000).toISOString();
      const master2 = require('./db-master');
      master2.prepare("DELETE FROM otp_codes WHERE email=? AND used=0").run(owner.email.toLowerCase());
      master2.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?,?,?)").run(owner.email.toLowerCase(), otpCode, expires);

      try {
        const { sendOTP } = require('./email');
        await sendOTP({ email: owner.email.toLowerCase(), code: otpCode });
      } catch(emailErr) {
        console.error('OTP email error:', emailErr.message);
      }

      return res.json({ ok: true, needs_otp: true, owner_email: owner.email });
    }

    const now = new Date();
    let isActive = owner.status === 'active' || owner.role === 'admin';
    if (owner.status === 'trial' && owner.trial_ends) isActive = new Date(owner.trial_ends) > now;
    if (!isActive) return res.status(402).json({ ok: false, error: 'اشتراك الشركة منتهي' });

    const tenantDb = getTenantDb(owner.id);
    const user = tenantDb.prepare(`
      SELECT u.*, r.permissions, r.name as role_name
      FROM tenant_users u
      LEFT JOIN tenant_roles r ON r.id = u.role_id
      WHERE u.email=?
    `).get(email.toLowerCase());
    if (!user) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
    if (!user.active) return res.status(403).json({ ok: false, error: 'الحساب معطّل' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ ok: false, error: 'كلمة السر غلط' });

    tenantDb.prepare("UPDATE tenant_users SET last_login=datetime('now') WHERE id=?").run(user.id);

    const token = jwt.sign(
      { sub_user_id: user.id, owner_id: owner.id, role: 'sub_user', permissions: JSON.parse(user.permissions || '{}') },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      ok: true, token,
      user: { id: user.id, name: user.name, email: user.email, role_name: user.role_name,
              permissions: JSON.parse(user.permissions || '{}'), owner_id: owner.id, owner_name: owner.name }
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Middleware: inject tenant db + require auth for all other routes
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

// Helper: check if requester is tenant owner (always allowed) or has users permission
function requireUsersPermission(req, res, next) {
  // tenant owner = user from master DB (req.user from JWT) — always allowed
  // sub-users would have req.tenantUser set — check their permissions
  if (req.tenantUser) {
    const perms = JSON.parse(req.tenantUser.permissions || '{}');
    if (!perms.users) return res.status(403).json({ ok: false, error: 'لا تملك صلاحية إدارة المستخدمين' });
  }
  next();
}

// ============================================================
// ROLES
// ============================================================

// GET /api/users/roles — list all roles
router.get('/roles', (req, res) => {
  try {
    const db = req.db;
    const roles = db.prepare('SELECT * FROM tenant_roles ORDER BY id').all();
    res.json({ ok: true, data: roles.map(r => ({ ...r, permissions: JSON.parse(r.permissions || '{}') })) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/users/roles — create role
router.post('/roles', requireUsersPermission, (req, res) => {
  try {
    const db = req.db;
    const { name, permissions = {} } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'اسم الدور مطلوب' });
    const r = db.prepare('INSERT INTO tenant_roles (name, permissions) VALUES (?,?)').run(name.trim(), JSON.stringify(permissions));
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ ok: false, error: 'الدور موجود بالفعل' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/users/roles/:id — update role
router.put('/roles/:id', requireUsersPermission, (req, res) => {
  try {
    const db = req.db;
    const { name, permissions } = req.body;
    const existing = db.prepare('SELECT * FROM tenant_roles WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'الدور غير موجود' });
    db.prepare('UPDATE tenant_roles SET name=COALESCE(?,name), permissions=COALESCE(?,permissions) WHERE id=?')
      .run(name || null, permissions ? JSON.stringify(permissions) : null, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/users/roles/:id
router.delete('/roles/:id', requireUsersPermission, (req, res) => {
  try {
    const db = req.db;
    db.prepare('UPDATE tenant_users SET role_id=NULL WHERE role_id=?').run(req.params.id);
    db.prepare('DELETE FROM tenant_roles WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// TENANT USERS (Sub-accounts)
// ============================================================

// GET /api/users — list team members
router.get('/', (req, res) => {
  try {
    const db = req.db;
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.active, u.last_login, u.created_at,
             r.id as role_id, r.name as role_name, r.permissions
      FROM tenant_users u
      LEFT JOIN tenant_roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ ok: true, data: users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '{}') })) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/users — add team member
router.post('/', requireUsersPermission, async (req, res) => {
  try {
    const db = req.db;
    const { name, email, password, role_id } = req.body;
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ ok: false, error: 'الاسم والإيميل والباسورد مطلوبين' });
    }
    // Max 10 sub-users per tenant
    const count = db.prepare('SELECT COUNT(*) as n FROM tenant_users').get().n;
    if (count >= 10) return res.status(400).json({ ok: false, error: 'الحد الأقصى 10 مستخدمين لكل حساب' });

    const hash = await bcrypt.hash(password, 10);
    const r = db.prepare('INSERT INTO tenant_users (name, email, password, role_id) VALUES (?,?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), hash, role_id || null);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ ok: false, error: 'الإيميل مستخدم بالفعل' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/users/:id — update member
router.put('/:id', requireUsersPermission, async (req, res) => {
  try {
    const db = req.db;
    const { name, email, password, role_id, active } = req.body;
    const existing = db.prepare('SELECT * FROM tenant_users WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });

    let newHash = existing.password;
    if (password?.trim()) newHash = await bcrypt.hash(password, 10);

    db.prepare(`UPDATE tenant_users SET
      name=COALESCE(?,name), email=COALESCE(?,email),
      password=?, role_id=COALESCE(?,role_id), active=COALESCE(?,active)
      WHERE id=?`
    ).run(name||null, email||null, newHash, role_id||null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/users/:id
router.delete('/:id', requireUsersPermission, (req, res) => {
  try {
    const db = req.db;
    db.prepare('DELETE FROM tenant_users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
