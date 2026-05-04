/**
 * Areej Inbox v4 — Settings Routes
 * ══════════════════════════════════
 * T05: Roles API  — GET/POST/PUT/DELETE /inbox/settings/roles
 * T06: Users API  — GET/POST/PUT/DELETE /inbox/settings/users
 *
 * الملف يُسجَّل في index.js بـ: router.use('/settings', require('./settings'))
 *
 * آخر تحديث: 2026-05-04 (M1 T05-T06)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { requirePermission } = require('./permissions');

// ══════════════════════════════════════════════════════════════
// T05 — Roles API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/roles — يُعيد كل الأدوار (system + custom)
router.get('/roles', (req, res) => {
  const db = req.db;
  try {
    const roles = db.prepare(`
      SELECT id, name, description, is_system, permissions, created_at
      FROM inbox_roles
      ORDER BY is_system DESC, id ASC
    `).all();

    // parse permissions JSON لكل دور
    const result = roles.map(r => ({
      ...r,
      permissions: _parseJSON(r.permissions, {}),
    }));

    return res.json({ roles: result });
  } catch (err) {
    console.error('[settings/roles GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/roles — إنشاء دور مخصص
router.post('/roles', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const { name, description, permissions } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }

  try {
    const permsJson = JSON.stringify(permissions || {});
    const result = db.prepare(`
      INSERT INTO inbox_roles (name, description, is_system, permissions)
      VALUES (?, ?, 0, ?)
    `).run(name.trim(), description || null, permsJson);

    const newRole = db.prepare('SELECT * FROM inbox_roles WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      role: { ...newRole, permissions: _parseJSON(newRole.permissions, {}) },
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'name_taken' });
    }
    console.error('[settings/roles POST]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/roles/:id — تعديل دور مخصص فقط
router.put('/roles/:id', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  const { name, description, permissions } = req.body;

  const existing = db.prepare('SELECT * FROM inbox_roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // is_system=1 → محمي من التعديل (D-008)
  if (existing.is_system) {
    return res.status(400).json({ error: 'cannot_edit_system_role' });
  }

  try {
    const newName  = (name || existing.name).trim();
    const newDesc  = description !== undefined ? description : existing.description;
    const newPerms = permissions !== undefined ? JSON.stringify(permissions) : existing.permissions;

    db.prepare(`
      UPDATE inbox_roles SET name = ?, description = ?, permissions = ?
      WHERE id = ?
    `).run(newName, newDesc, newPerms, id);

    const updated = db.prepare('SELECT * FROM inbox_roles WHERE id = ?').get(id);
    return res.json({ role: { ...updated, permissions: _parseJSON(updated.permissions, {}) } });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'name_taken' });
    }
    console.error('[settings/roles PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /inbox/settings/roles/:id — حذف دور مخصص فقط
router.delete('/roles/:id', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);

  const existing = db.prepare('SELECT * FROM inbox_roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // is_system=1 → محمي من الحذف
  if (existing.is_system) {
    return res.status(400).json({ error: 'cannot_delete_system_role' });
  }

  // تحقق: في موظفين على هذا الدور؟
  const usersCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM inbox_users WHERE inbox_role_id = ?'
  ).get(id);
  if (usersCount.cnt > 0) {
    return res.status(400).json({
      error: 'role_has_users',
      count: usersCount.cnt,
    });
  }

  try {
    db.prepare('DELETE FROM inbox_roles WHERE id = ?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/roles DELETE]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// T06 — Users API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/users — قائمة موظفي الـ inbox
router.get('/users', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  try {
    const users = db.prepare(`
      SELECT iu.id, iu.email, iu.name, iu.inbox_role_id, iu.tenant_user_id,
             iu.status, iu.created_at, iu.updated_at,
             ir.name AS role_name
      FROM inbox_users iu
      LEFT JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
      ORDER BY iu.created_at ASC
    `).all();

    return res.json({ users });
  } catch (err) {
    console.error('[settings/users GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/users — إضافة موظف جديد
router.post('/users', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const { email, name, inbox_role_id, tenant_user_id } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'email_and_name_required' });
  }

  const roleId = parseInt(inbox_role_id, 10) || 4; // default: Agent

  // تحقق: الدور موجود؟
  const role = db.prepare('SELECT id FROM inbox_roles WHERE id = ?').get(roleId);
  if (!role) return res.status(400).json({ error: 'invalid_role' });

  try {
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
      INSERT INTO inbox_users (email, name, inbox_role_id, tenant_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email.trim().toLowerCase(), name.trim(), roleId, tenant_user_id || null, now, now);

    const newUser = db.prepare(`
      SELECT iu.*, ir.name AS role_name
      FROM inbox_users iu
      LEFT JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
      WHERE iu.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({ user: newUser });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'email_taken' });
    }
    console.error('[settings/users POST]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/users/:id — تعديل بيانات موظف
router.put('/users/:id', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  const { name, inbox_role_id, status } = req.body;

  const existing = db.prepare('SELECT * FROM inbox_users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // لو بتغيّر الدور، تأكد الدور الجديد موجود
  if (inbox_role_id !== undefined) {
    const role = db.prepare('SELECT id FROM inbox_roles WHERE id = ?').get(parseInt(inbox_role_id, 10));
    if (!role) return res.status(400).json({ error: 'invalid_role' });
  }

  try {
    const newName   = name      !== undefined ? name.trim()               : existing.name;
    const newRole   = inbox_role_id !== undefined ? parseInt(inbox_role_id, 10) : existing.inbox_role_id;
    const newStatus = status    !== undefined ? status                    : existing.status;
    const now       = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE inbox_users SET name = ?, inbox_role_id = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newName, newRole, newStatus, now, id);

    const updated = db.prepare(`
      SELECT iu.*, ir.name AS role_name
      FROM inbox_users iu
      LEFT JOIN inbox_roles ir ON ir.id = iu.inbox_role_id
      WHERE iu.id = ?
    `).get(id);

    return res.json({ user: updated });
  } catch (err) {
    console.error('[settings/users PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /inbox/settings/users/:id — إزالة موظف
router.delete('/users/:id', requirePermission('team_manage'), (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);

  const existing = db.prepare('SELECT * FROM inbox_users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // قاعدة: لا نسمح بحذف آخر Owner (inbox_role_id=1) — D-046
  if (existing.inbox_role_id === 1) {
    const ownerCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM inbox_users WHERE inbox_role_id = 1'
    ).get();
    if (ownerCount.cnt <= 1) {
      return res.status(400).json({ error: 'last_owner' });
    }
  }

  try {
    db.prepare('DELETE FROM inbox_users WHERE id = ?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/users DELETE]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════
function _parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

module.exports = router;
