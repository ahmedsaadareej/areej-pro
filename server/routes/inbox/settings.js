/**
 * Areej Inbox v4 — Settings Routes
 * ══════════════════════════════════
 * T05: Roles API         — GET/POST/PUT/DELETE /inbox/settings/roles
 * T06: Users API         — GET/POST/PUT/DELETE /inbox/settings/users
 * T37: Org + BizHours    — GET/PUT /inbox/settings/org | /business-hours
 * T38: Canned Responses  — GET/POST/PUT/DELETE + search
 * T39: Custom Attrs      — GET/POST/PUT/DELETE + reorder
 * T40: SLA Policies      — GET/POST/PUT/DELETE + set-default
 * T41: CSAT + Appearance + Channels
 *
 * الملف يُسجَّل في index.js بـ: router.use('/settings', require('./settings'))
 *
 * آخر تحديث: 2026-05-04 (M2 T37-T41)
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
// T37 — Org + Business Hours API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/org — بيانات المؤسسة
router.get('/org', (req, res) => {
  const db = req.db;
  try {
    const profile = db.prepare('SELECT * FROM tenant_profile LIMIT 1').get();
    return res.json({ org: profile || {} });
  } catch (err) {
    console.error('[settings/org GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/org — تحديث بيانات المؤسسة
router.put('/org', requirePermission('org_settings'), (req, res) => {
  const db = req.db;
  const allowed = ['company_name','company_name_en','logo_url','brand_color','address','phone','email','website'];
  const fields = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'no_fields' });
  try {
    const sets = Object.keys(fields).map(k => `${k}=?`).join(', ');
    const vals = [...Object.values(fields), new Date().toISOString()];
    db.prepare(`UPDATE tenant_profile SET ${sets}, updated_at=?`).run(...vals);
    const profile = db.prepare('SELECT * FROM tenant_profile LIMIT 1').get();
    return res.json({ ok: true, org: profile });
  } catch (err) {
    console.error('[settings/org PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// GET /inbox/settings/business-hours — ساعات العمل + الأيام
router.get('/business-hours', (req, res) => {
  const db = req.db;
  try {
    const config = db.prepare('SELECT * FROM inbox_business_hours_v4 WHERE id=1').get() || {};
    const days   = db.prepare('SELECT * FROM inbox_business_days_v4 ORDER BY day_of_week').all();
    return res.json({ config, days });
  } catch (err) {
    console.error('[settings/business-hours GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/business-hours — تحديث ساعات العمل
router.put('/business-hours', requirePermission('org_settings'), (req, res) => {
  const db = req.db;
  const { timezone, active, days } = req.body;
  try {
    // تحديث الإعدادات الرئيسية
    if (timezone !== undefined || active !== undefined) {
      const sets = [];
      const vals = [];
      if (timezone !== undefined) { sets.push('timezone=?'); vals.push(timezone); }
      if (active !== undefined)   { sets.push('active=?');   vals.push(active ? 1 : 0); }
      if (sets.length) db.prepare(`UPDATE inbox_business_hours_v4 SET ${sets.join(', ')} WHERE id=1`).run(...vals);
    }
    // تحديث الأيام لو أُرسلت
    if (Array.isArray(days)) {
      const stmt = db.prepare(
        'UPDATE inbox_business_days_v4 SET is_working=?, start_time=?, end_time=? WHERE day_of_week=?'
      );
      for (const d of days) {
        if (d.day_of_week === undefined) continue;
        stmt.run(d.is_working ? 1 : 0, d.start_time || '09:00', d.end_time || '17:00', d.day_of_week);
      }
    }
    const config = db.prepare('SELECT * FROM inbox_business_hours_v4 WHERE id=1').get();
    const daysOut = db.prepare('SELECT * FROM inbox_business_days_v4 ORDER BY day_of_week').all();
    return res.json({ ok: true, config, days: daysOut });
  } catch (err) {
    console.error('[settings/business-hours PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// T38 — Canned Responses API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/canned — كل الردود الجاهزة
router.get('/canned', (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(
      'SELECT * FROM inbox_canned_responses_v4 ORDER BY category, shortcut'
    ).all();
    return res.json({ canned: rows.map(r => ({ ...r, platforms: _parseJSON(r.platforms, []) })) });
  } catch (err) {
    console.error('[settings/canned GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// GET /inbox/settings/canned/search?q= — بحث سريع بالـ shortcut أو المحتوى
router.get('/canned/search', (req, res) => {
  const db = req.db;
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ canned: [] });
  try {
    const rows = db.prepare(
      `SELECT * FROM inbox_canned_responses_v4
       WHERE shortcut LIKE ? OR name LIKE ? OR content LIKE ?
       ORDER BY shortcut LIMIT 20`
    ).all(`%${q}%`, `%${q}%`, `%${q}%`);
    return res.json({ canned: rows.map(r => ({ ...r, platforms: _parseJSON(r.platforms, []) })) });
  } catch (err) {
    console.error('[settings/canned/search]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/canned — إنشاء رد جاهز
router.post('/canned', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { shortcut, name, content, category, platforms } = req.body;
  if (!shortcut || !name || !content) return res.status(400).json({ error: 'missing_fields' });
  try {
    const existing = db.prepare('SELECT id FROM inbox_canned_responses_v4 WHERE shortcut=?').get(shortcut);
    if (existing) return res.status(409).json({ error: 'shortcut_exists' });
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO inbox_canned_responses_v4 (shortcut, name, content, category, platforms, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(shortcut, name, content, category || 'عام', JSON.stringify(platforms || []), req.inboxUser?.id || null);
    return res.json({ ok: true, id: lastInsertRowid });
  } catch (err) {
    console.error('[settings/canned POST]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/canned/:id — تعديل رد جاهز
router.put('/canned/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { id } = req.params;
  const { shortcut, name, content, category, platforms } = req.body;
  try {
    const row = db.prepare('SELECT id FROM inbox_canned_responses_v4 WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    // تحقق من تكرار الـ shortcut (ليس لنفس الصف)
    if (shortcut) {
      const dup = db.prepare('SELECT id FROM inbox_canned_responses_v4 WHERE shortcut=? AND id!=?').get(shortcut, id);
      if (dup) return res.status(409).json({ error: 'shortcut_exists' });
    }
    db.prepare(
      `UPDATE inbox_canned_responses_v4
       SET shortcut=COALESCE(?,shortcut), name=COALESCE(?,name), content=COALESCE(?,content),
           category=COALESCE(?,category), platforms=COALESCE(?,platforms), updated_at=datetime('now')
       WHERE id=?`
    ).run(shortcut||null, name||null, content||null, category||null,
          platforms ? JSON.stringify(platforms) : null, id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/canned PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /inbox/settings/canned/:id — حذف رد جاهز
router.delete('/canned/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT id FROM inbox_canned_responses_v4 WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('DELETE FROM inbox_canned_responses_v4 WHERE id=?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/canned DELETE]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// T39 — Custom Attrs API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/attrs/:type — الحقول المخصصة
router.get('/attrs/:type', (req, res) => {
  const db = req.db;
  const { type } = req.params;
  if (!['conversation','contact'].includes(type)) return res.status(400).json({ error: 'invalid_type' });
  try {
    const rows = db.prepare(
      'SELECT * FROM inbox_custom_attrs_v4 WHERE attr_type=? ORDER BY sort_order, id'
    ).all(type);
    return res.json({ attrs: rows.map(r => ({ ...r, options: _parseJSON(r.options, []) })) });
  } catch (err) {
    console.error('[settings/attrs GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/attrs/:type — إنشاء حقل مخصص
router.post('/attrs/:type', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { type } = req.params;
  if (!['conversation','contact'].includes(type)) return res.status(400).json({ error: 'invalid_type' });
  const { key, label, field_type, options, required, sort_order } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'missing_fields' });
  try {
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO inbox_custom_attrs_v4 (attr_type, key, label, field_type, options, required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(type, key, label, field_type || 'text', JSON.stringify(options || []), required ? 1 : 0, sort_order || 0);
    return res.json({ ok: true, id: lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'key_exists' });
    console.error('[settings/attrs POST]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/attrs/:type/reorder — إعادة ترتيب الحقول
router.put('/attrs/:type/reorder', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { type } = req.params;
  const { order } = req.body; // [{id, sort_order}]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid_order' });
  try {
    const stmt = db.prepare('UPDATE inbox_custom_attrs_v4 SET sort_order=? WHERE id=? AND attr_type=?');
    for (const item of order) stmt.run(item.sort_order, item.id, type);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/attrs reorder]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/attrs/:type/:id — تعديل حقل
router.put('/attrs/:type/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { type, id } = req.params;
  const { label, field_type, options, required, sort_order } = req.body;
  try {
    const row = db.prepare('SELECT id FROM inbox_custom_attrs_v4 WHERE id=? AND attr_type=?').get(id, type);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare(
      `UPDATE inbox_custom_attrs_v4
       SET label=COALESCE(?,label), field_type=COALESCE(?,field_type),
           options=COALESCE(?,options), required=COALESCE(?,required), sort_order=COALESCE(?,sort_order)
       WHERE id=? AND attr_type=?`
    ).run(label||null, field_type||null, options ? JSON.stringify(options) : null,
          required !== undefined ? (required ? 1 : 0) : null, sort_order ?? null, id, type);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/attrs PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /inbox/settings/attrs/:type/:id — حذف حقل (CASCADE على attr_values)
router.delete('/attrs/:type/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { type, id } = req.params;
  try {
    const row = db.prepare('SELECT id FROM inbox_custom_attrs_v4 WHERE id=? AND attr_type=?').get(id, type);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('DELETE FROM inbox_custom_attrs_v4 WHERE id=?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/attrs DELETE]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// T40 — SLA Policies API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/sla — كل السياسات
router.get('/sla', (req, res) => {
  const db = req.db;
  try {
    const policies = db.prepare('SELECT * FROM inbox_sla_policies_v4 ORDER BY is_default DESC, id').all();
    return res.json({ policies });
  } catch (err) {
    console.error('[settings/sla GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/sla — إنشاء سياسة
router.post('/sla', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { name, priority, first_response, resolution_time, business_hours, escalate_agent } = req.body;
  if (!name) return res.status(400).json({ error: 'missing_name' });
  try {
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO inbox_sla_policies_v4 (name, priority, first_response, resolution_time, business_hours, escalate_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, priority || 'all', first_response || 120, resolution_time || 480,
          business_hours ? 1 : 0, escalate_agent || null);
    return res.json({ ok: true, id: lastInsertRowid });
  } catch (err) {
    console.error('[settings/sla POST]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/sla/:id/set-default — تعيين سياسة افتراضية
router.put('/sla/:id/set-default', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT id FROM inbox_sla_policies_v4 WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    // transaction: صفّر الكل ثم عيّن الجديد
    db.transaction(() => {
      db.prepare('UPDATE inbox_sla_policies_v4 SET is_default=0').run();
      db.prepare('UPDATE inbox_sla_policies_v4 SET is_default=1 WHERE id=?').run(id);
    })();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/sla set-default]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/sla/:id — تعديل سياسة
router.put('/sla/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { id } = req.params;
  const { name, priority, first_response, resolution_time, business_hours, escalate_agent } = req.body;
  try {
    const row = db.prepare('SELECT id FROM inbox_sla_policies_v4 WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare(
      `UPDATE inbox_sla_policies_v4
       SET name=COALESCE(?,name), priority=COALESCE(?,priority),
           first_response=COALESCE(?,first_response), resolution_time=COALESCE(?,resolution_time),
           business_hours=COALESCE(?,business_hours), escalate_agent=?
       WHERE id=?`
    ).run(name||null, priority||null, first_response||null, resolution_time||null,
          business_hours !== undefined ? (business_hours ? 1 : 0) : null, escalate_agent ?? null, id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/sla PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /inbox/settings/sla/:id — حذف سياسة (ترفض is_default=1)
router.delete('/sla/:id', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT * FROM inbox_sla_policies_v4 WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (row.is_default) return res.status(400).json({ error: 'cannot_delete_default' });
    db.prepare('DELETE FROM inbox_sla_policies_v4 WHERE id=?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings/sla DELETE]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════════════
// T41 — CSAT + Appearance + Channels API
// ══════════════════════════════════════════════════════════════

// GET /inbox/settings/csat
router.get('/csat', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  try {
    const row = db.prepare('SELECT * FROM inbox_csat_settings_v4 WHERE id=1').get() || {};
    return res.json({ csat: row });
  } catch (err) {
    console.error('[settings/csat GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/csat
router.put('/csat', requirePermission('inbox_settings'), (req, res) => {
  const db = req.db;
  const { enabled, trigger, delay_minutes, message, scale } = req.body;
  try {
    db.prepare(
      `UPDATE inbox_csat_settings_v4
       SET enabled=COALESCE(?,enabled), trigger=COALESCE(?,trigger),
           delay_minutes=COALESCE(?,delay_minutes), message=COALESCE(?,message), scale=COALESCE(?,scale)
       WHERE id=1`
    ).run(enabled !== undefined ? (enabled ? 1 : 0) : null, trigger||null,
          delay_minutes ?? null, message||null, scale||null);
    const row = db.prepare('SELECT * FROM inbox_csat_settings_v4 WHERE id=1').get();
    return res.json({ ok: true, csat: row });
  } catch (err) {
    console.error('[settings/csat PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// GET /inbox/settings/appearance — مفتوح لكل الموظفين
router.get('/appearance', (req, res) => {
  const db = req.db;
  try {
    const row = db.prepare('SELECT * FROM inbox_appearance_v4 WHERE id=1').get() || {};
    return res.json({ appearance: row });
  } catch (err) {
    console.error('[settings/appearance GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/appearance — مفتوح لكل الموظفين
router.put('/appearance', (req, res) => {
  const db = req.db;
  const { density, font_size, show_avatar } = req.body;
  try {
    db.prepare(
      `UPDATE inbox_appearance_v4
       SET density=COALESCE(?,density), font_size=COALESCE(?,font_size), show_avatar=COALESCE(?,show_avatar)
       WHERE id=1`
    ).run(density||null, font_size||null, show_avatar !== undefined ? (show_avatar ? 1 : 0) : null);
    const row = db.prepare('SELECT * FROM inbox_appearance_v4 WHERE id=1').get();
    return res.json({ ok: true, appearance: row });
  } catch (err) {
    console.error('[settings/appearance PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// ── Channels ─────────────────────────────────────────────────
const ALLOWED_CHANNELS = ['whatsapp_api','whatsapp_qr','telegram','instagram','messenger','email'];

// GET /inbox/settings/channels — قائمة كل القنوات
router.get('/channels', requirePermission('channels'), (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM inbox_channel_settings_v4 ORDER BY channel').all();
    return res.json({ channels: rows.map(r => ({
      channel_type: r.channel,
      is_active: r.active,
      config: _parseJSON(r.config, {}),
      updated_at: r.updated_at
    })) });
  } catch (err) {
    console.error('[settings/channels GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// GET /inbox/settings/channels/:channel — قناة محددة
router.get('/channels/:channel', requirePermission('channels'), (req, res) => {
  const db = req.db;
  const { channel } = req.params;
  if (!ALLOWED_CHANNELS.includes(channel)) return res.status(400).json({ error: 'invalid_channel' });
  try {
    const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
    if (!row) return res.json({ channel: { channel_type: channel, is_active: 0, config: {} } });
    return res.json({ channel: {
      channel_type: row.channel,
      is_active: row.active,
      config: _parseJSON(row.config, {}),
      updated_at: row.updated_at
    } });
  } catch (err) {
    console.error('[settings/channels/:channel GET]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// PUT /inbox/settings/channels/:channel — تحديث إعدادات قناة
router.put('/channels/:channel', requirePermission('channels'), (req, res) => {
  const db = req.db;
  const { channel } = req.params;
  if (!ALLOWED_CHANNELS.includes(channel)) return res.status(400).json({ error: 'invalid_channel' });
  const { is_active, config } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
    if (existing) {
      db.prepare(
        `UPDATE inbox_channel_settings_v4
         SET active=COALESCE(?,active), config=COALESCE(?,config), updated_at=unixepoch()
         WHERE channel=?`
      ).run(is_active !== undefined ? (is_active ? 1 : 0) : null,
            config !== undefined ? JSON.stringify(config) : null, channel);
    } else {
      db.prepare(
        `INSERT INTO inbox_channel_settings_v4 (channel, active, config)
         VALUES (?, ?, ?)`
      ).run(channel, is_active ? 1 : 0, JSON.stringify(config || {}));
    }
    const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
    return res.json({ ok: true, channel: {
      channel_type: row.channel,
      is_active: row.active,
      config: _parseJSON(row.config, {}),
      updated_at: row.updated_at
    } });
  } catch (err) {
    console.error('[settings/channels PUT]', err.message);
    return res.status(500).json({ error: 'db_error' });
  }
});

// POST /inbox/settings/channels/:channel/test — اختبار اتصال القناة
router.post('/channels/:channel/test', requirePermission('channels'), (req, res) => {
  const { channel } = req.params;
  if (!ALLOWED_CHANNELS.includes(channel)) return res.status(400).json({ error: 'invalid_channel' });
  // placeholder — كل قناة لها منطق اختبار مختلف
  return res.json({ ok: true, message: `اختبار ${channel} — قيد التطوير` });
});

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════
function _parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

module.exports = router;
