/**
 * inbox/context.js — Context Panel Routes لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P5-4 Internal Notes)
 *
 * Endpoints:
 *   GET  /api/inbox/conversations/:id/context              — بيانات العميل الكاملة
 *   GET  /api/inbox/conversations/:id/context/invoices     — قائمة فواتير مع pagination
 *   GET  /api/inbox/conversations/:id/context/orders       — قائمة طلبات مع pagination
 *   GET  /api/inbox/conversations/:id/context/paylinks     — روابط دفع بالهاتف أو فواتير العميل
 *   GET  /api/inbox/conversations/:id/context/clv          — إحصائيات CLV التفصيلية
 *   GET  /api/inbox/conversations/:id/context/notes        — نوتس داخلية للمحادثة
 *   POST /api/inbox/conversations/:id/context/notes        — إضافة نوت
 *   DELETE /api/inbox/conversations/:id/context/notes/:nid — حذف نوت
 *   POST /api/inbox/conversations/:id/context/invoice      — إنشاء فاتورة سريعة (Quick Action)
 *   POST /api/inbox/conversations/:id/context/paylink      — إنشاء رابط دفع سريع (Quick Action)
 *   POST /api/inbox/conversations/:id/context/link         — ربط/إلغاء ربط جهة اتصال CRM
 *   GET  /api/inbox/conversations/:id/context/search       — بحث في CRM contacts
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
               client_name, created_at, paid_at, due_date
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
               client_name, created_at, updated_at
        FROM sys_orders
        WHERE contact_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(contact.id);
    }

    // ── آخر روابط الدفع (5) — بالهاتف أو عبر فواتير العميل ───────────
    let payLinks = [];
    if (contact) {
      try {
        const phone = (contact.phone || '').replace(/\D/g, '');
        payLinks = db.prepare(`
          SELECT pl.id, pl.description as title, pl.amount, pl.status,
                 pl.client_name, pl.client_phone, pl.created_at, pl.paid_at,
                 pl.token
          FROM payment_links pl
          WHERE pl.client_phone LIKE ? OR pl.client_phone = ?
             OR pl.invoice_id IN (
               SELECT id FROM sys_invoices WHERE contact_id = ?
             )
          ORDER BY pl.created_at DESC LIMIT 5
        `).all(`%${phone}`, contact.phone, contact.id);
      } catch (_) { /* جدول payment_links لا يحتوي الـ schema المتوقع */ }
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

// ─── GET /conversations/:id/context/invoices ─────────────────────────────────
// جلب كل فواتير العميل مع pagination
router.get('/conversations/:id/context/invoices', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status || null; // فلتر اختياري: paid|draft|sent|cancelled

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (!conv.master_contact_id) return res.json({ ok: true, invoices: [], total: 0, pages: 0 });

    const where  = status ? 'WHERE contact_id = ? AND status = ?' : 'WHERE contact_id = ?';
    const params = status ? [conv.master_contact_id, status] : [conv.master_contact_id];

    const total = db.prepare(`SELECT COUNT(*) as n FROM sys_invoices ${where}`).get(...params).n;

    const invoices = db.prepare(`
      SELECT id, invoice_no, status, total, subtotal, discount, tax,
             client_name, client_phone, notes, payment_method,
             created_at, paid_at, due_date
      FROM sys_invoices ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // ── CLV سريع بالأرقام ────────────────────────────────────────────
    const clv = db.prepare(`
      SELECT
        COUNT(*)                                              as invoice_count,
        COALESCE(SUM(total), 0)                               as total_invoiced,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) as total_paid,
        COALESCE(AVG(CASE WHEN status='paid' THEN total END), 0)        as avg_order_value,
        MIN(created_at)                                       as first_invoice_at,
        MAX(created_at)                                       as last_invoice_at
      FROM sys_invoices WHERE contact_id = ?
    `).get(conv.master_contact_id);

    res.json({ ok: true, invoices, total, pages: Math.ceil(total / limit), page, clv });
  } catch (err) {
    console.error('[context] GET invoices:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/context/orders ────────────────────────────────────
// جلب كل طلبات العميل مع pagination
router.get('/conversations/:id/context/orders', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status || null;

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (!conv.master_contact_id) return res.json({ ok: true, orders: [], total: 0, pages: 0 });

    const where  = status ? 'WHERE contact_id = ? AND status = ?' : 'WHERE contact_id = ?';
    const params = status ? [conv.master_contact_id, status] : [conv.master_contact_id];

    const total = db.prepare(`SELECT COUNT(*) as n FROM sys_orders ${where}`).get(...params).n;

    const orders = db.prepare(`
      SELECT id, order_no, status, total, shipping_co, tracking_no,
             client_name, client_phone, notes, order_type,
             created_at, updated_at
      FROM sys_orders ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ ok: true, orders, total, pages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error('[context] GET orders:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/context/paylinks ─────────────────────────────────
// روابط الدفع المرتبطة بهاتف العميل أو فواتيره
router.get('/conversations/:id/context/paylinks', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const offset = (page - 1) * limit;

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    // محاولة الجلب بالهاتف (سواء مرتبط CRM أو لا)
    const phone = (conv.sender_phone || '').replace(/\D/g, '');
    let contactId = conv.master_contact_id || null;

    let payLinks = [];
    let total = 0;

    try {
      const whereClause = contactId
        ? `WHERE (pl.client_phone LIKE ? OR pl.client_phone = ?)
              OR pl.invoice_id IN (SELECT id FROM sys_invoices WHERE contact_id = ?)`
        : `WHERE pl.client_phone LIKE ? OR pl.client_phone = ?`;

      const params = contactId
        ? [`%${phone}`, conv.sender_phone, contactId]
        : [`%${phone}`, conv.sender_phone];

      total = db.prepare(`SELECT COUNT(*) as n FROM payment_links pl ${whereClause}`).
        get(...params).n;

      payLinks = db.prepare(`
        SELECT pl.id, pl.description as title, pl.amount, pl.status,
               pl.client_name, pl.client_phone, pl.created_at, pl.paid_at,
               pl.token
        FROM payment_links pl
        ${whereClause}
        ORDER BY pl.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);
    } catch (_) { /* جدول غير موجود أو schema مختلف */ }

    res.json({ ok: true, pay_links: payLinks, total, pages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error('[context] GET paylinks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/context/clv ──────────────────────────────────────
// تقرير CLV تفصيلي للعميل
router.get('/conversations/:id/context/clv', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (!conv.master_contact_id) return res.json({ ok: true, clv: null });

    const cid = conv.master_contact_id;

    // إحصائيات الفواتير
    const invStats = db.prepare(`
      SELECT
        COUNT(*)                                                          as invoice_count,
        COALESCE(SUM(total), 0)                                           as total_invoiced,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0)   as total_paid,
        COALESCE(SUM(CASE WHEN status='draft' OR status='sent' THEN total ELSE 0 END), 0) as pending_amount,
        COALESCE(AVG(CASE WHEN status='paid' THEN total END), 0)          as avg_order_value,
        COUNT(CASE WHEN status='paid' THEN 1 END)                         as paid_count,
        COUNT(CASE WHEN status='cancelled' THEN 1 END)                    as cancelled_count,
        MIN(created_at)                                                   as first_invoice_at,
        MAX(created_at)                                                   as last_invoice_at
      FROM sys_invoices WHERE contact_id = ?
    `).get(cid);

    // إحصائيات الطلبات
    const ordStats = db.prepare(`
      SELECT
        COUNT(*)                                                           as order_count,
        COALESCE(SUM(total), 0)                                            as total_orders_value,
        COUNT(CASE WHEN status='delivered' THEN 1 END)                     as delivered_count,
        COUNT(CASE WHEN status='cancelled' OR status='returned' THEN 1 END) as cancelled_count
      FROM sys_orders WHERE contact_id = ?
    `).get(cid);

    // توزيع الإنفاق بالشهر (آخر 12 شهر)
    const monthlySpend = db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        SUM(total) as amount
      FROM sys_invoices
      WHERE contact_id = ? AND status = 'paid'
        AND created_at >= date('now', '-12 months')
      GROUP BY month ORDER BY month ASC
    `).all(cid);

    res.json({
      ok: true,
      clv: {
        ...invStats,
        ...ordStats,
        monthly_spend: monthlySpend,
        // نسبة التحويل: مدفوع من إجمالي
        conversion_rate: invStats.invoice_count
          ? Math.round((invStats.paid_count / invStats.invoice_count) * 100)
          : 0,
      },
    });
  } catch (err) {
    console.error('[context] GET clv:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /conversations/:id/context/invoice ─────────────────────────────────
// إنشاء فاتورة سريعة من الـ Inbox مباشرة (P5-3 Quick Action)
router.post('/conversations/:id/context/invoice', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const { amount, description, notes } = req.body;
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'amount مطلوب وصحيح' });
  }

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    // جلب بيانات العميل (CRM أو sender)
    let clientName  = conv.sender_name  || 'عميل';
    let clientPhone = conv.sender_phone || '';
    let contactId   = conv.master_contact_id || null;

    if (contactId) {
      const c = db.prepare('SELECT name, phone FROM crm_contacts WHERE id = ?').get(contactId);
      if (c) { clientName = c.name; clientPhone = c.phone; }
    }

    // توليد رقم الفاتورة
    const lastInv = db.prepare(`SELECT invoice_no FROM sys_invoices ORDER BY id DESC LIMIT 1`).get();
    let nextNo = 1;
    if (lastInv?.invoice_no) {
      const m = lastInv.invoice_no.match(/(\d+)$/);
      if (m) nextNo = parseInt(m[1], 10) + 1;
    }
    const invoiceNo = `INV-${String(nextNo).padStart(4, '0')}`;

    const now = new Date().toISOString();
    const totalAmt = parseFloat(amount);

    const info = db.prepare(`
      INSERT INTO sys_invoices
        (invoice_no, contact_id, client_name, client_phone,
         status, total, subtotal, discount, tax, notes,
         created_by_id, created_by_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, 0, 0, ?, ?, ?, ?, ?)
    `).run(
      invoiceNo, contactId, clientName, clientPhone,
      totalAmt, totalAmt,
      description || notes || null,
      req.user.id, req.user.name || req.user.username,
      now, now
    );

    const newInvoiceId = info.lastInsertRowid;

    // timeline log
    try {
      db.prepare(`
        INSERT INTO inbox_timeline_v4
          (conversation_id, event_type, actor_id, actor_name, meta, created_at)
        VALUES (?, 'invoice_created', ?, ?, ?, ?)
      `).run(
        convId, req.user.id, req.user.name || req.user.username,
        JSON.stringify({ invoice_id: newInvoiceId, invoice_no: invoiceNo, amount: totalAmt }),
        now
      );
    } catch (_) {}

    // SSE broadcast
    try {
      const { broadcast } = require('./stream');
      broadcast(req.user.id, 'conv_update', {
        id: convId,
        _quick_action: { type: 'invoice_created', invoice_no: invoiceNo, amount: totalAmt },
      });
    } catch (_) {}

    res.json({
      ok: true,
      invoice: { id: newInvoiceId, invoice_no: invoiceNo, amount: totalAmt, status: 'draft' },
      url: `/dashboard/invoices/${newInvoiceId}`,
    });
  } catch (err) {
    console.error('[context] POST invoice:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /conversations/:id/context/paylink ─────────────────────────────────
// إنشاء رابط دفع سريع من الـ Inbox (P5-3 Quick Action)
router.post('/conversations/:id/context/paylink', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const { amount, description } = req.body;
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'amount مطلوب وصحيح' });
  }

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    let clientName  = conv.sender_name  || 'عميل';
    let clientPhone = conv.sender_phone || '';

    if (conv.master_contact_id) {
      const c = db.prepare('SELECT name, phone FROM crm_contacts WHERE id = ?').get(conv.master_contact_id);
      if (c) { clientName = c.name; clientPhone = c.phone; }
    }

    // توليد token فريد
    const crypto = require('crypto');
    const token  = crypto.randomBytes(15).toString('base64url');
    const now    = new Date().toISOString();
    const totalAmt = parseFloat(amount);

    const info = db.prepare(`
      INSERT INTO payment_links
        (token, amount, client_name, client_phone, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(token, totalAmt, clientName, clientPhone, description || null, now);

    const newLinkId = info.lastInsertRowid;

    // timeline log
    try {
      db.prepare(`
        INSERT INTO inbox_timeline_v4
          (conversation_id, event_type, actor_id, actor_name, meta, created_at)
        VALUES (?, 'paylink_created', ?, ?, ?, ?)
      `).run(
        convId, req.user.id, req.user.name || req.user.username,
        JSON.stringify({ link_id: newLinkId, amount: totalAmt, token }),
        now
      );
    } catch (_) {}

    // SSE broadcast
    try {
      const { broadcast } = require('./stream');
      broadcast(req.user.id, 'conv_update', {
        id: convId,
        _quick_action: { type: 'paylink_created', amount: totalAmt },
      });
    } catch (_) {}

    // رابط الدفع الفعلي — يُبنى من domain الخاص بالـ tenant
    const payUrl = `/pay/${token}`;

    res.json({
      ok: true,
      link: { id: newLinkId, token, amount: totalAmt, status: 'active' },
      url: payUrl,
    });
  } catch (err) {
    console.error('[context] POST paylink:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/timeline ——————————————————————————————————
// سجل أحداث المحادثة — مرتب زمنياً (الأحدث أولاً) — max 100 حدث
router.get('/conversations/:id/timeline', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  try {
    const db   = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const limit  = Math.min(parseInt(req.query.limit  || 50, 10), 100);
    const before = parseInt(req.query.before || 0,  10); // cursor: id < before

    // نجلب من كلا الجدولين: timeline + messages notes
    let rows = db.prepare(`
      SELECT
        'timeline'       AS src,
        id,
        event_type       AS type,
        actor_id,
        actor_name,
        COALESCE(data, meta, '{}') AS payload,
        created_at
      FROM inbox_timeline_v4
      WHERE conversation_id = ?
        ${before ? 'AND id < ?' : ''}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...(before ? [convId, before, limit] : [convId, limit]));

    // فك JSON payload لكل حدث
    rows = rows.map(r => {
      let p = {};
      try { p = JSON.parse(r.payload || '{}'); } catch (_) {}
      return {
        id:         r.id,
        src:        r.src,
        type:       r.type,
        actor_id:   r.actor_id,
        actor_name: r.actor_name,
        payload:    p,
        created_at: r.created_at,
      };
    });

    res.json({
      ok:      true,
      events:  rows,
      hasMore: rows.length === limit,
    });
  } catch (err) {
    console.error('[context] GET timeline:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id/context/notes ——————————————————————————————————
// جلب كل النوتس الداخلية لمحادثة — الأحدث أولاً
router.get('/conversations/:id/context/notes', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  try {
    const db = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const notes = db.prepare(`
      SELECT id, author_id, author_name, body, created_at
      FROM inbox_conv_notes_v4
      WHERE conversation_id = ?
      ORDER BY created_at DESC
    `).all(convId);

    res.json({ ok: true, notes });
  } catch (err) {
    console.error('[context] GET notes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /conversations/:id/context/notes ———————————————————————————
router.post('/conversations/:id/context/notes', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  if (isNaN(convId)) return res.status(400).json({ error: 'id غير صالح' });

  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'النوتة فارغة' });
  if (body.length > 2000) return res.status(400).json({ error: 'النوتة أطول من 2000 حرف' });

  try {
    const db = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const authorName = req.user.name || req.user.username || 'موظف';
    const result = db.prepare(`
      INSERT INTO inbox_conv_notes_v4 (conversation_id, author_id, author_name, body)
      VALUES (?, ?, ?, ?)
    `).run(convId, req.user.id, authorName, body);

    const note = db.prepare(`
      SELECT id, author_id, author_name, body, created_at
      FROM inbox_conv_notes_v4 WHERE id = ?
    `).get(result.lastInsertRowid);

    // SSE broadcast — إشعار باقي الموظفين بنوتة جديدة
    try {
      const { broadcast } = require('./stream');
      broadcast(req.user.id, 'conv:note_added', { convId, note });
    } catch (_) {}

    res.json({ ok: true, note });
  } catch (err) {
    console.error('[context] POST notes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /conversations/:id/context/notes/:nid ——————————————————
// الحذف متاح للكاتب فقط أو admin/owner
router.delete('/conversations/:id/context/notes/:nid', (req, res) => {
  const convId = parseInt(req.params.id, 10);
  const noteId = parseInt(req.params.nid, 10);
  if (isNaN(convId) || isNaN(noteId)) return res.status(400).json({ error: 'id غير صالح' });

  try {
    const db = req.db;
    const conv = _getConv(db, convId, req.user);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const note = db.prepare('SELECT * FROM inbox_conv_notes_v4 WHERE id = ? AND conversation_id = ?')
      .get(noteId, convId);
    if (!note) return res.status(404).json({ error: 'النوتة غير موجودة' });

    // موظف عادي: يحذف نوتاته فقط
    const isOwner = req.user.role === 'owner' || req.user.role === 'admin';
    if (!isOwner && note.author_id !== req.user.id) {
      return res.status(403).json({ error: 'ليس لديك صلاحية حذف هذه النوتة' });
    }

    db.prepare('DELETE FROM inbox_conv_notes_v4 WHERE id = ?').run(noteId);

    // SSE broadcast
    try {
      const { broadcast } = require('./stream');
      broadcast(req.user.id, 'conv:note_deleted', { convId, noteId });
    } catch (_) {}

    res.json({ ok: true });
  } catch (err) {
    console.error('[context] DELETE notes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
