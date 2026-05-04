/**
 * Areej Inbox v4 — Permissions Middleware
 * ════════════════════════════════════════
 * يوفّر middleware-ين رئيسيين:
 *   1. loadInboxPermissions — يُحقن req.inboxUser مع permissions object
 *   2. requirePermission(key) — Factory يُعيد middleware يرفض بـ 403 لو السماحية غائبة
 *
 * آخر تحديث: 2026-05-04 (M1 T04)
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// Fallback Permissions Map
// يُستخدم عندما لا يوجد inbox_users record بعد (مرحلة انتقالية)
// يعتمد على tenant_users.role_id الموجود في ERP
// ══════════════════════════════════════════════════════════════
const ROLE_ID_FALLBACK_MAP = {
  // role_id=1 (مدير ERP) → Owner-level في inbox
  1: {
    team_manage: true, org_settings: true, channels: true,
    inbox_settings: true, reports_full: true, reports_team: true,
    reports_self: true, export: true, conversations_all: true,
    conversations_team: true, broadcast: true, role_manage: true,
  },
  // role_id=2 (محاسب) → Read-only في inbox
  2: {
    team_manage: false, org_settings: false, channels: false,
    inbox_settings: false, reports_full: true, reports_team: true,
    reports_self: true, export: false, conversations_all: false,
    conversations_team: false, broadcast: false, role_manage: false,
  },
  // role_id=3 (مبيعات) → Agent في inbox
  3: {
    team_manage: false, org_settings: false, channels: false,
    inbox_settings: false, reports_full: false, reports_team: false,
    reports_self: true, export: false, conversations_all: false,
    conversations_team: true, broadcast: false, role_manage: false,
  },
  // role_id=4 (مخزن) → Agent مقيّد
  4: {
    team_manage: false, org_settings: false, channels: false,
    inbox_settings: false, reports_full: false, reports_team: false,
    reports_self: true, export: false, conversations_all: false,
    conversations_team: true, broadcast: false, role_manage: false,
  },
};

// Fallback عام لأي role_id غير معروف → حد أدنى من الصلاحيات
const DEFAULT_PERMISSIONS = {
  team_manage: false, org_settings: false, channels: false,
  inbox_settings: false, reports_full: false, reports_team: false,
  reports_self: true, export: false, conversations_all: false,
  conversations_team: false, broadcast: false, role_manage: false,
};

// ══════════════════════════════════════════════════════════════
// Middleware 1: loadInboxPermissions
// يُضاف في server/routes/inbox/index.js بعد requireAuth وبعد req.db
// ══════════════════════════════════════════════════════════════
function loadInboxPermissions(req, res, next) {
  const db  = req.db;
  const user = req.user; // { id, name, email, role_id, ... }

  if (!user || !db) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // 1. ابحث عن inbox_users record بـ tenant_user_id
    const inboxUser = db.prepare(`
      SELECT iu.id, iu.email, iu.name, iu.inbox_role_id, iu.status,
             ir.permissions AS role_permissions, ir.name AS role_name
      FROM inbox_users iu
      JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
      WHERE iu.tenant_user_id = ?
      LIMIT 1
    `).get(user.id);

    if (inboxUser) {
      // المستخدم مسجّل في inbox_users — استخدم دوره الـ inbox
      let permissions;
      try {
        permissions = JSON.parse(inboxUser.role_permissions || '{}');
      } catch (_) {
        permissions = { ...DEFAULT_PERMISSIONS };
      }

      req.inboxUser = {
        id:            inboxUser.id,
        tenantUserId:  user.id,
        email:         inboxUser.email,
        name:          inboxUser.name,
        inbox_role_id: inboxUser.inbox_role_id,
        role_name:     inboxUser.role_name,
        permissions,
        // Plugin flags (D-043) — يُستخدم في context.js
        has_erp:     true,
        has_payment: true,
      };
    } else {
      // Fallback: المستخدم موجود في ERP لكن غير مسجّل في inbox_users بعد
      // استخدم role_id من ERP كـ fallback
      const fallbackPerms = ROLE_ID_FALLBACK_MAP[user.role_id] || DEFAULT_PERMISSIONS;

      req.inboxUser = {
        id:            null,
        tenantUserId:  user.id,
        email:         user.email || '',
        name:          user.name  || '',
        inbox_role_id: null,
        role_name:     'fallback',
        permissions:   { ...fallbackPerms },
        has_erp:     true,
        has_payment: true,
      };
    }

    return next();
  } catch (err) {
    console.error('[permissions] loadInboxPermissions error:', err.message);
    return res.status(500).json({ error: 'permissions_load_failed' });
  }
}

// ══════════════════════════════════════════════════════════════
// Middleware 2: requirePermission(key) — Factory
// الاستخدام: router.use('/settings', requirePermission('org_settings'))
// ══════════════════════════════════════════════════════════════
function requirePermission(key) {
  return function permissionGuard(req, res, next) {
    // loadInboxPermissions لازم يكون اشتغل قبله
    if (!req.inboxUser) {
      return res.status(401).json({ error: 'unauthorized', hint: 'loadInboxPermissions not applied' });
    }

    if (req.inboxUser.permissions[key] === true) {
      return next();
    }

    return res.status(403).json({
      error:    'forbidden',
      required: key,
      role:     req.inboxUser.role_name || 'unknown',
    });
  };
}

// ══════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════
module.exports = { loadInboxPermissions, requirePermission };
