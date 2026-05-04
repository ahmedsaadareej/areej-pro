/**
 * inbox/contacts.js — Contacts Page Routes لـ Inbox v4
 * آخر تحديث: 2026-05-04 (P11-E2)
 *
 * Endpoints:
 *   GET    /api/inbox/contacts                  — قائمة جهات الاتصال (بحث + فلتر + pagination)
 *   GET    /api/inbox/contacts/:id              — بروفايل جهة اتصال كامل
 *   GET    /api/inbox/contacts/:id/conversations— محادثات جهة الاتصال
 *   POST   /api/inbox/contacts                  — إنشاء جهة اتصال جديدة
 *   PUT    /api/inbox/contacts/:id              — تحديث بيانات جهة اتصال
 *   DELETE /api/inbox/contacts/:id              — حذف جهة اتصال
 *   GET    /api/inbox/contacts/stats            — إحصائيات سريعة (count per status)
 *
 * ملاحظة: يستخدم crm_contacts (ERP) مع fallback آمن لو has_erp = false
 * في حالة has_erp = false → يستخدم inbox_conversations_v4 كمصدر للـ contacts
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  lead      : 'محتمل',
  prospect  : 'مهتم',
  client    : 'عميل',
  vip       : 'VIP',
  inactive  : 'غير نشط',
  cold      : 'بارد',
};

/** بناء قائمة contacts من crm_contacts (ERP mode) */
function _listFromCRM(db, { q, status, page, limit }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where    = 'WHERE 1=1';

  if (q && q.trim()) {
    where += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.company_name LIKE ?)`;
    const like = `%${q.trim()}%`;
    params.push(like, like, like, like);
  }
  if (status && status !== 'all') {
    where += ` AND c.status = ?`;
    params.push(status);
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM crm_contacts c ${where}`).get(...params)?.n || 0;

  const rows = db.prepare(`
    SELECT
      c.id, c.name, c.phone, c.email, c.status, c.city, c.governorate,
      c.company_name, c.balance, c.total_paid, c.source, c.created_at,
      COUNT(conv.id) AS conv_count,
      MAX(conv.last_message_at) AS last_conv_at
    FROM crm_contacts c
    LEFT JOIN inbox_conversations_v4 conv ON conv.master_contact_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { total, rows };
}

/** بناء قائمة contacts من inbox_conversations_v4 (Standalone mode) */
function _listFromConversations(db, { q, page, limit }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where    = `WHERE c.sender_id IS NOT NULL`;

  if (q && q.trim()) {
    where += ` AND (c.sender_name LIKE ? OR c.sender_phone LIKE ?)`;
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }

  const total = db.prepare(`
    SELECT COUNT(DISTINCT sender_id) as n
    FROM inbox_conversations_v4 c ${where}
  `).get(...params)?.n || 0;

  const rows = db.prepare(`
    SELECT
      c.sender_id         AS id,
      c.sender_name       AS name,
      c.sender_phone      AS phone,
      c.platform          AS source,
      COUNT(c.id)         AS conv_count,
      MAX(c.last_message_at) AS last_conv_at,
      NULL AS status, NULL AS email, NULL AS city, NULL AS company_name,
      0 AS balance, 0 AS total_paid
    FROM inbox_conversations_v4 c ${where}
    GROUP BY c.sender_id
    ORDER BY last_conv_at DESC NULLS LAST
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { total, rows };
}

// ─── GET /api/inbox/contacts — قائمة جهات الاتصال ────────────────────────────
router.get('/contacts', (req, res) => {
  try {
    const db      = req.db;
    const q       = (req.query.q || '').trim();
    const status  = req.query.status || 'all';
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 30);
    const hasErp  = req.inboxUser?.has_erp !== false;

    let result;
    let mode;

    // تحقق وجود crm_contacts table
    const hasCrm = hasErp && db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='crm_contacts'
    `).get();

    if (hasCrm) {
      result = _listFromCRM(db, { q, status, page, limit });
      mode   = 'crm';
    } else {
      result = _listFromConversations(db, { q, page, limit });
      mode   = 'conversations';
    }

    res.json({
      ok   : true,
      mode,
      page,
      limit,
      total: result.total,
      pages: Math.ceil(result.total / limit),
      data : result.rows,
    });
  } catch (e) {
    console.error('[contacts] list error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/contacts/stats — إحصائيات سريعة ────────────────────────
router.get('/contacts/stats', (req, res) => {
  try {
    const db     = req.db;
    const hasErp = req.inboxUser?.has_erp !== false;
    const hasCrm = hasErp && db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='crm_contacts'
    `).get();

    if (!hasCrm) {
      const total = db.prepare(`SELECT COUNT(DISTINCT sender_id) as n FROM inbox_conversations_v4`).get()?.n || 0;
      return res.json({ ok: true, mode: 'conversations', total, byStatus: [] });
    }

    const total    = db.prepare(`SELECT COUNT(*) as n FROM crm_contacts`).get()?.n || 0;
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM crm_contacts GROUP BY status ORDER BY count DESC
    `).all();

    // إحصائية المحادثات المرتبطة
    const linked = db.prepare(`
      SELECT COUNT(DISTINCT master_contact_id) as n
      FROM inbox_conversations_v4
      WHERE master_contact_id IS NOT NULL
    `).get()?.n || 0;

    res.json({ ok: true, mode: 'crm', total, linked, byStatus });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/contacts/:id — بروفايل كامل ─────────────────────────────
router.get('/contacts/:id', (req, res) => {
  try {
    const db     = req.db;
    const id     = parseInt(req.params.id);
    const hasErp = req.inboxUser?.has_erp !== false;
    const hasCrm = hasErp && db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='crm_contacts'
    `).get();

    if (!hasCrm) {
      // Standalone: ابنِ بروفايل من المحادثات
      const conv = db.prepare(`
        SELECT sender_id, sender_name, sender_phone, sender_avatar, platform
        FROM inbox_conversations_v4 WHERE sender_id = ? LIMIT 1
      `).get(String(id));
      if (!conv) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({
        ok: true,
        mode: 'conversations',
        contact: {
          id        : conv.sender_id,
          name      : conv.sender_name,
          phone     : conv.sender_phone,
          avatar    : conv.sender_avatar,
          source    : conv.platform,
          status    : null,
        }
      });
    }

    const contact = db.prepare(`SELECT * FROM crm_contacts WHERE id = ?`).get(id);
    if (!contact) return res.status(404).json({ ok: false, error: 'not_found' });

    // عدد الفواتير والطلبات لو جداولها موجودة
    let invoices_count = 0, orders_count = 0, total_invoiced = contact.total_invoiced || 0;
    try {
      invoices_count = db.prepare(`SELECT COUNT(*) as n FROM invoices WHERE contact_id=?`).get(id)?.n || 0;
    } catch (_) {}
    try {
      orders_count = db.prepare(`SELECT COUNT(*) as n FROM sys_orders WHERE contact_id=?`).get(id)?.n || 0;
    } catch (_) {}

    res.json({
      ok: true,
      mode: 'crm',
      contact: {
        ...contact,
        status_label   : STATUS_LABELS[contact.status] || contact.status,
        invoices_count,
        orders_count,
        total_invoiced,
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /api/inbox/contacts/:id/conversations — محادثات جهة الاتصال ─────────
router.get('/contacts/:id/conversations', (req, res) => {
  try {
    const db    = req.db;
    const id    = parseInt(req.params.id);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const convs = db.prepare(`
      SELECT
        c.id, c.platform, c.sender_name, c.sender_phone, c.status, c.priority,
        c.last_message_text, c.last_message_at, c.unread_count,
        c.assigned_to_id, c.created_at,
        t.name AS agent_name
      FROM inbox_conversations_v4 c
      LEFT JOIN inbox_users iu ON iu.id = c.assigned_to_id
      LEFT JOIN tenant_users t ON t.id = iu.tenant_user_id
      WHERE c.master_contact_id = ?
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT ?
    `).all(id, limit);

    res.json({ ok: true, data: convs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /api/inbox/contacts — إنشاء جهة اتصال جديدة ───────────────────────
router.post('/contacts', (req, res) => {
  try {
    const db     = req.db;
    const hasErp = req.inboxUser?.has_erp !== false;
    const hasCrm = hasErp && db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='crm_contacts'
    `).get();

    if (!hasCrm) {
      return res.status(403).json({ ok: false, error: 'crm_not_available' });
    }

    const { name, phone, email, status, city, governorate, company_name, notes, source } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'name_required' });
    }

    // تحقق من تكرار الهاتف
    if (phone) {
      const existing = db.prepare(`SELECT id FROM crm_contacts WHERE phone = ?`).get(phone.trim());
      if (existing) {
        return res.status(409).json({ ok: false, error: 'phone_exists', existing_id: existing.id });
      }
    }

    const result = db.prepare(`
      INSERT INTO crm_contacts (name, phone, email, status, city, governorate, company_name, notes, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      name.trim(),
      phone?.trim()        || null,
      email?.trim()        || null,
      status               || 'lead',
      city?.trim()         || null,
      governorate?.trim()  || null,
      company_name?.trim() || null,
      notes?.trim()        || null,
      source               || 'inbox',
    );

    const contact = db.prepare(`SELECT * FROM crm_contacts WHERE id = ?`).get(result.lastInsertRowid);
    res.json({ ok: true, contact });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PUT /api/inbox/contacts/:id — تحديث جهة اتصال ─────────────────────────
router.put('/contacts/:id', (req, res) => {
  try {
    const db  = req.db;
    const id  = parseInt(req.params.id);

    const existing = db.prepare(`SELECT id FROM crm_contacts WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

    const { name, phone, email, status, city, governorate, company_name, notes, address } = req.body;

    db.prepare(`
      UPDATE crm_contacts
      SET name=COALESCE(?,name), phone=COALESCE(?,phone), email=COALESCE(?,email),
          status=COALESCE(?,status), city=COALESCE(?,city), governorate=COALESCE(?,governorate),
          company_name=COALESCE(?,company_name), notes=COALESCE(?,notes), address=COALESCE(?,address),
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      name        ?? null,
      phone       ?? null,
      email       ?? null,
      status      ?? null,
      city        ?? null,
      governorate ?? null,
      company_name ?? null,
      notes       ?? null,
      address     ?? null,
      id
    );

    const updated = db.prepare(`SELECT * FROM crm_contacts WHERE id = ?`).get(id);
    res.json({ ok: true, contact: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── DELETE /api/inbox/contacts/:id — حذف جهة اتصال ─────────────────────────
router.delete('/contacts/:id', (req, res) => {
  try {
    const db = req.db;
    const id = parseInt(req.params.id);

    // تحقق وجود
    const existing = db.prepare(`SELECT id FROM crm_contacts WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

    // فك الربط من المحادثات أولاً بدل الحذف الكامل
    db.prepare(`
      UPDATE inbox_conversations_v4 SET master_contact_id = NULL WHERE master_contact_id = ?
    `).run(id);

    db.prepare(`DELETE FROM crm_contacts WHERE id = ?`).run(id);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
