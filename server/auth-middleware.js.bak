const jwt = require('jsonwebtoken');
const master = require('./db-master');
const { getTenantDb } = require('./db-tenant');
require('dotenv').config();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.pro_token || req.query._t;
  if (!token) return res.status(401).json({ ok: false, error: 'تسجيل الدخول مطلوب' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ══ Sub-user token (tenant employee) ══
    if (payload.sub_user_id && payload.owner_id) {
      const owner = master.prepare('SELECT * FROM users WHERE id=?').get(payload.owner_id);
      if (!owner) return res.status(401).json({ ok: false, error: 'حساب الشركة غير موجود' });

      // Check owner subscription
      const now = new Date();
      let isActive = owner.status === 'active' || owner.role === 'admin';
      if (owner.status === 'trial' && owner.trial_ends) isActive = new Date(owner.trial_ends) > now;
      if (!isActive) return res.status(402).json({ ok: false, error: 'اشتراك الشركة منتهي', code: 'SUBSCRIPTION_EXPIRED' });

      // Load sub-user from tenant DB
      const tenantDb = getTenantDb(owner.id);
      const subUser = tenantDb.prepare('SELECT u.*, r.permissions, r.name as role_name FROM tenant_users u LEFT JOIN tenant_roles r ON r.id=u.role_id WHERE u.id=?').get(payload.sub_user_id);
      if (!subUser || !subUser.active) return res.status(401).json({ ok: false, error: 'الحساب معطّل' });

      // Set req.user to the OWNER (so getTenantDb works correctly throughout routes)
      req.user = owner;
      // Set req.tenantUser to the sub-user with their permissions
      req.tenantUser = { ...subUser, permissions: JSON.parse(subUser.permissions || '{}') };
      return next();
    }

    // ══ Owner / Platform admin token ══
    const user = master.prepare('SELECT * FROM users WHERE id=?').get(payload.id);
    if (!user) return res.status(401).json({ ok: false, error: 'الحساب غير موجود' });

    const now = new Date();
    let isActive = user.status === 'active' || user.role === 'admin';
    if (user.status === 'trial' && user.trial_ends) {
      isActive = new Date(user.trial_ends) > now;
      if (!isActive) {
        master.prepare("UPDATE users SET status='expired' WHERE id=?").run(user.id);
        return res.status(402).json({ ok: false, error: 'انتهت الفترة التجريبية', code: 'TRIAL_EXPIRED' });
      }
    }
    if (!isActive) return res.status(402).json({ ok: false, error: 'الاشتراك منتهي', code: 'SUBSCRIPTION_EXPIRED' });

    req.user = user;
    req.tenantUser = null; // owner has full access
    next();
  } catch(e) {
    return res.status(401).json({ ok: false, error: 'جلسة منتهية — سجّل دخولك من جديد' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
