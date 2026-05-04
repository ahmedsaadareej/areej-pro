/**
 * inbox-auth-adapter.js — Auth Adapter لـ Inbox v4
 * ══════════════════════════════════════════════════
 * يُوحّد طريقة التعرف على المستخدم في كل ملفات الـ Inbox.
 *
 * بعد هذا الـ Middleware، كل كود يستخدم `req.inboxUser` فقط.
 * لا `req.user.role` ولا `req.tenantUser.id`.
 *
 * الترتيب الإلزامي في inbox/index.js:
 *   requireAuth → getTenantDb (req.db) → inboxAuthAdapter → loadInboxPermissions
 *
 * آخر تحديث: 2026-05-04 (M5 T12)
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// Fallback Permissions — Owner كامل الصلاحيات
// يُستخدم فقط عند Fallback مباشر لصاحب الشركة
// ══════════════════════════════════════════════════════════════
const OWNER_PERMISSIONS = {
  team_manage:       true,
  org_settings:      true,
  channels:          true,
  inbox_settings:    true,
  reports_full:      true,
  reports_team:      true,
  reports_self:      true,
  export:            true,
  conversations_all: true,
  conversations_team: true,
  broadcast:         true,
  role_manage:       true,
};

// ══════════════════════════════════════════════════════════════
// inboxAuthAdapter — Middleware الرئيسي
// يبني req.inboxUser من ثلاثة مصادر بالأولوية:
//   1. inbox_users JOIN inbox_roles (مستخدم Inbox حقيقي)
//   2. ERP Owner fallback (صاحب الشركة بدون inbox_users record)
//   3. 401 — لا يوجد مستخدم صالح
// ══════════════════════════════════════════════════════════════
async function inboxAuthAdapter(req, res, next) {
  const db   = req.db;    // مُحقون من getTenantDb في index.js
  const user = req.user;  // مُحقون من requireAuth

  // لو req.db أو req.user غائبان → خارج نطاق الـ Inbox أو طلب غير مصرّح
  if (!db || !user) {
    return res.status(401).json({ error: 'inbox_auth_required' });
  }

  // لو req.inboxUser موجود بالفعل (من loadInboxPermissions في M1) → تجاوز
  // هذا يضمن التوافق مع الـ middleware الموجود بدون تعارض
  if (req.inboxUser) {
    return next();
  }

  try {
    // ── المصدر 1: inbox_users (مستخدم Inbox مسجّل) ───────────────────────
    const inboxUser = db.prepare(`
      SELECT iu.id, iu.email, iu.name, iu.inbox_role_id,
             ir.permissions AS role_permissions, ir.name AS role_name
      FROM inbox_users iu
      JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
      WHERE iu.tenant_user_id = ?
      LIMIT 1
    `).get(user.id);

    if (inboxUser) {
      let permissions;
      try {
        permissions = JSON.parse(inboxUser.role_permissions || '{}');
      } catch (_) {
        permissions = {};
      }

      req.inboxUser = {
        id:             inboxUser.id,
        tenantUserId:   user.id,
        email:          inboxUser.email,
        name:           inboxUser.name,
        inbox_role_id:  inboxUser.inbox_role_id,
        role_name:      inboxUser.role_name,
        permissions,
        has_erp:        true,
        has_payment:    true,
        source:         'inbox_users',
      };
      return next();
    }

    // ── المصدر 2: ERP Owner Fallback ──────────────────────────────────────
    // صاحب الشركة (is_owner أو role_id=1) مسموح له بالدخول مباشرة
    // حتى لو لم يُسجَّل في inbox_users بعد
    // صاحب الحساب: ERP tenant owner (role=owner/admin) أو Platform account owner
    // user.role من master.db يكون 'admin' للـ admins أو 'user' لأصحاب الشركات
    // user.role_id من tenant_users يكون 1 لـ Owner
    const isOwner = user.is_owner === 1
      || user.is_owner === true
      || user.role === 'owner'
      || user.role === 'admin'   // platform admin
      || user.role_id === 1
      || (!req.tenantUser);      // platform account owner مباشر (مش sub-user)

    if (isOwner) {
      req.inboxUser = {
        id:             user.id,
        tenantUserId:   user.id,
        email:          user.email || '',
        name:           user.name  || '',
        inbox_role_id:  1,
        role_name:      'owner',
        permissions:    { ...OWNER_PERMISSIONS },
        has_erp:        true,
        has_payment:    true,
        source:         'erp_owner_fallback',
      };
      return next();
    }

    // ── المصدر 3: لا صلاحية ───────────────────────────────────────────────
    return res.status(401).json({ error: 'inbox_auth_required' });

  } catch (err) {
    console.error('[inbox-auth-adapter] error:', err.message);
    return res.status(500).json({ error: 'auth_adapter_failed' });
  }
}

module.exports = inboxAuthAdapter;
