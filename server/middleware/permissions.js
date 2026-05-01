/**
 * Permission Middleware — Areej Pro
 * ════════════════════════════════════════════════════
 * يتحقق من صلاحيات الـ sub-users (موظفين التنانت)
 * الـ owner نفسه له full access دايماً
 *
 * استخدام:
 *   const { requirePerm } = require('../middleware/permissions');
 *   router.post('/invoices', requireAuth, requirePerm('invoices.create'), handler);
 *
 * الصلاحيات المعرّفة:
 *   invoices.view / invoices.create / invoices.delete
 *   orders.view / orders.create / orders.edit / orders.delete
 *   products.view / products.create / products.edit / products.delete
 *   treasury.view / treasury.create
 *   crm.view / crm.create
 *   hr.view / hr.manage
 *   inbox.view / inbox.send
 *   reports.view
 *   settings.manage
 */
'use strict';

/**
 * requirePerm(permission) — Express middleware
 * الـ owner (req.tenantUser === null) له full access
 * الـ sub-user يحتاج الـ permission صريح في req.tenantUser.permissions
 */
function requirePerm(permission) {
  return (req, res, next) => {
    // الـ owner له full access
    if (!req.tenantUser) return next();

    const perms = req.tenantUser.permissions || {};

    // تحقق من الـ permission المطلوب
    if (perms[permission] === true) return next();

    // تحقق من الـ wildcard (مثلاً invoices.* يشمل invoices.create)
    const [module] = permission.split('.');
    if (perms[`${module}.*`] === true) return next();

    // full_access يشمل كل شيء
    if (perms['full_access'] === true) return next();

    return res.status(403).json({
      ok: false,
      error: 'غير مصرح لك بهذا الإجراء',
      required_permission: permission,
    });
  };
}

/**
 * hasPerm(req, permission) — helper function (non-middleware)
 * للاستخدام داخل الـ route handler مباشرة
 */
function hasPerm(req, permission) {
  if (!req.tenantUser) return true; // owner
  const perms = req.tenantUser.permissions || {};
  const [module] = permission.split('.');
  return perms[permission] === true ||
         perms[`${module}.*`] === true ||
         perms['full_access'] === true;
}

module.exports = { requirePerm, hasPerm };
