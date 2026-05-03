/**
 * inbox/context.js — Context Panel Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P5-1 Customer Info + CRM Link)
 *
 * Endpoints:
 *   GET  /api/inbox/conversations/:id/context        — بيانات العميل الكاملة
 *   POST /api/inbox/conversations/:id/context/link   — ربط/إلغاء ربط جهة اتصال CRM
 *   GET  /api/inbox/conversations/:id/context/search — بحث في CRM contacts
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ─── Helper: جلب المحادثة مع التحقق من الصلاحية ──────────────────────────────
function _getConv(db, convId, user) {
  const conv = db.prepare(`SELECT * FROM inbox_conversations_v4 WHERE id = ?`).get(convId);
  if (!conv) return null;
  // موظف عادي: يقدر يشوف فقط لو معيّنة له أو غير معيّنة
  if (user.role !== 'owner' && user.role !== 'admin') {
    if (conv.assigned_to_id && conv.assigned_to_id !== user.id) return null;
  }
  return conv;
}

// ─── GET /conversations/:id/context ──────────────────────────────────────────
router.get('/conversations/:id/context', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    // ── بيانات العميل الأساسية ─────────────────────────────────────────
    let contact = null;
    if (conv.master_contact_id) {
      contact = db.prepare(`
        SELECT id, name, phone, email, city, governorate, address,
               company_name, contact_name, status, balance,
               total_invoiced, total_paid, source, niche,
               birthday, notes, created_at
        FROM crm_contacts WHERE id = ?
      `).get(conv.master_contact_id);
    }

    // لو ما في contact مربوط — نحاول نجيبه بالهاتف
    if (!contact && conv.sender_phone) {
      const phone = conv.sender_phone.replace(/\D/g, '');
      contact = db.prepare(`
        SELECT id, name, phone, email, city, governorate, address,
               company_name, contact_name, status, balance,
               total_invoiced, total_paid, source, niche,
               birthday, notes, created_at
        FROM crm_contacts
        WHERE replace(phone, '+', '') = ? OR phone = ?
        LIMIT 1
      `).get(phone, conv.sender_phone);
      // لو لقيناه — ربطه تلقائياً
      if (contact) {
        db.prepare(`UPDATE inbox_conversations_v4 SET master_contact_id = ? WHERE id = ?`)
          .run(contact.id, convId);
      }
    }

    // ── آخر الفواتير (5) ──────────────────────────────────────────────
    let invoices = [];
    if (contact) {
      invoices = db.prepare(`
        SELECT id, invoice_no, status, total, subtotal, discount,
               created_at, paid_at, due_date
        FROM sys_invoices
        WHERE contact_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(contact.id);
    }

    // ── آخر الطلبات (5) ───────────────────────────────────────────────
    let orders = [];
    if (contact) {
      orders = db.prepare(`
        SELECT id, order_no, status, total, shipping_co, tracking_no,
               created_at, updated_at
        FROM sys_orders
        WHERE contact_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(contact.id);
    }

    // ── آخر روابط الدفع (5) ───────────────────────────────────────────
    let payLinks = [];
    if (contact) {
      try {
        payLinks = db.prepare(`
          SELECT id, title, amount, status, created_at, expires_at
          FROM payment_links
          WHERE contact_id = ?
          ORDER BY created_at DESC LIMIT 5
        `).all(contact.id);
      } catch (_) { /* جدول payment_links قد لا يحتوي contact_id */ }
    }

    // ── إحصائيات المحادثات ────────────────────────────────────────────
    let convStats = { total: 0, open: 0, closed: 0 };
    if (contact) {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)   as open,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
        FROM inbox_conversations_v4
        WHERE master_contact_id = ?
      `).get(contact.id);
      convStats = stats || convStats;
    }

    // ── CLV (Customer Lifetime Value) ─────────────────────────────────
    const clv = contact ? (contact.total_paid || 0) : 0;

    res.json({
      ok: true,
      conv: {
        id       : conv.id,
        platform : conv.platform,
        sender   : {
          name  : conv.sender_name,
          phone : conv.sender_phone,
          id    : conv.sender_id,
          avatar: conv.sender_avatar,
        },
        master_contact_id: conv.master_contact_id,
      },
      contact,
      invoices,
      orders,
      pay_links : payLinks,
      conv_stats: convStats,
      clv,
      linked    : !!contact,
    });
  } catch (err) {
    console.error('[context] GET context:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /conversations/:id/context/link ─────────────────────────────────────
// body: { contact_id } أو { contact_id: null } لإلغاء الربط
router.post('/conversations/:id/context/link', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const { contact_id } = req.body;

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    if (contact_id !== null && contact_id !== undefined) {
      // تحقق وجود الـ contact
      const contact = db.prepare(`SELECT id, name, phone FROM crm_contacts WHERE id = ?`).get(contact_id);
      if (!contact) return res.status(404).json({ error: 'جهة الاتصال غير موجودة' });

      db.prepare(`UPDATE inbox_conversations_v4 SET master_contact_id = ? WHERE id = ?`)
        .run(contact_id, convId);

      // سجّل في timeline
      try {
        db.prepare(`
          INSERT INTO inbox_timeline_v4 (conversation_id, event_type, actor_id, actor_name, meta, created_at)
          VALUES (?, 'contact_linked', ?, ?, ?, ?)
        `).run(
          convId,
          req.user.id,
          req.user.name || req.user.username,
          JSON.stringify({ contact_id, contact_name: contact.name }),
          new Date().toISOString()
        );
      } catch (_) {}

      // SSE
      try {
        const { broadcast } = require('./stream');
        broadcast(req.user.id, 'conv_update', { id: convId, master_contact_id: contact_id });
      } catch (_) {}

      return res.json({ ok: true, linked: true, contact_id, contact_name: contact.name });
    } else {
      // إلغاء الربط
      db.prepare(`UPDATE inbox_conversations_v4 SET master_contact_id = NULL WHERE id = ?`).run(convId);

      try {
        db.prepare(`
          INSERT INTO inbox_timeline_v4 (conversation_id, event_type, actor_id, actor_name, meta, created_at)
          VALUES (?, 'contact_unlinked', ?, ?, ?, ?)
        `).run(
          convId,
          req.user.id,
          req.user.name || req.user.username,
          JSON.stringify({ prev_contact_id: conv.master_contact_id }),
          new Date().toISOString()
        );
      } catch (_) {}

      return res.json({ ok: true, linked: false });
    }
  } catch (err) {
    console.error('[context] POST link:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/context/search ────────────────────────────────────
// بحث في CRM contacts للربط اليدوي
router.get('/conversations/:id/context/search', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ ok: true, contacts: [] });

  try {
    const db    = req.db;
    const like  = `%${q}%`;
    const contacts = db.prepare(`
      SELECT id, name, phone, email, city, status,
             total_paid, total_invoiced
      FROM crm_contacts
      WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR company_name LIKE ?
      ORDER BY total_paid DESC, name ASC
      LIMIT 10
    `).all(like, like, like, like);

    res.json({ ok: true, contacts });
  } catch (err) {
    console.error('[context] search:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
