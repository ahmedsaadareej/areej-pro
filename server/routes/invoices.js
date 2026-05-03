'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
const { validate, assertId } = require('../middleware/validate');
const { requirePerm } = require('../middleware/permissions');
// ============================================================
// INVOICES
// ============================================================

function nextInvoiceNo(db) {
  db.prepare('UPDATE sys_invoice_seq SET counter=counter+1').run();
  const row = db.prepare('SELECT counter as seq FROM sys_invoice_seq').get();
  const n = row.seq;
  return 'INV-' + String(n).padStart(4, '0');
}

// GET /api/system/invoices
router.get('/invoices', (req, res) => {
    const db = req.db;
    try {
    const { status, search, page = 1, limit = 30 } = req.query;
    let where = 'WHERE 1=1'; const params = [];
    if (status) { where += ' AND i.status=?'; params.push(status); }
    if (search) {
      where += ' AND (i.invoice_no LIKE ? OR i.client_name LIKE ?)';
      const s = '%'+search+'%'; params.push(s, s);
    }
    const offset = (parseInt(page)-1) * parseInt(limit);
    const total = db.prepare('SELECT COUNT(*) as n FROM sys_invoices i ' + where).get(...params).n;
    const rows = db.prepare(`
      SELECT i.*, c.name as crm_name,
        CASE WHEN EXISTS(SELECT 1 FROM sys_orders o WHERE o.invoice_id=i.id) THEN 1 ELSE 0 END as has_order
      FROM sys_invoices i
      LEFT JOIN crm_contacts c ON c.id=i.contact_id
      ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ ok: true, data: rows, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/system/invoices/:id
router.get('/invoices/:id', (req, res) => {
  const db = req.db;
  try {
    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ ok: false, error: 'Not found' });

    // Items with product name
    const items = db.prepare(`
      SELECT ii.*, p.name as product_name
      FROM sys_invoice_items ii
      LEFT JOIN sys_products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ? ORDER BY ii.id
    `).all(inv.id);

    // Payment transactions linked to this invoice
    const payments = db.prepare(`
      SELECT t.*, w.name as wallet_name
      FROM sys_transactions t
      LEFT JOIN sys_wallets w ON w.id = t.wallet_id
      WHERE t.ref_type = 'invoice' AND t.ref_id = ?
      ORDER BY t.created_at ASC
    `).all(inv.id);

    // CRM contact info
    let contact = null;
    if (inv.contact_id) {
      contact = db.prepare('SELECT id, name, phone, email, city FROM crm_contacts WHERE id=?').get(inv.contact_id);
    }

    res.json({ ok: true, data: { ...inv, items, payments, contact } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/invoices
router.post('/invoices', requirePerm('invoices.create'), (req, res) => {
    const db = req.db;
    try {
    // ── Validation ──────────────────────────────────────────
    const body = validate(req.body, {
      client_name:  { required: true, type: 'string', maxLen: 200, label: 'اسم العميل' },
      client_phone: { type: 'string', maxLen: 30 },
      client_email: { type: 'string', maxLen: 200 },
      discount:     { type: 'number', min: 0 },
      tax:          { type: 'number', min: 0 },
      status:       { enum: ['draft','pending','paid','cancelled'] },
    });
    const { contact_id, client_name, client_phone, client_email, client_address,
            items = [], notes, discount = body.discount ?? 0, tax = body.tax ?? 0,
            due_date, status = body.status ?? 'draft',
            wallet_id = null, payment_method = null } = { ...req.body, ...body };
    if (!items.length) return res.status(400).json({ ok: false, error: 'لازم يكون فيه منتج واحد على الأقل' });
    if (items.length > 100) return res.status(400).json({ ok: false, error: 'عدد المنتجات كبير جداً' });

    const invoice_no = nextInvoiceNo(db);
    const subtotal = items.reduce((s, it) => s + (+it.qty * +it.unit_price), 0);
    const total = subtotal - +discount + +tax;
    // If wallet provided → auto-mark as paid
    const finalStatus = (wallet_id && status !== 'draft') ? 'paid' : status;

    const invId = db.transaction(() => {
      // من قام بإنشاء الفاتورة
      const creatorId   = req.tenantUser ? req.tenantUser.id   : req.user.id;
      const creatorName = req.tenantUser ? req.tenantUser.name : req.user.name;

      const ins = db.prepare(`
        INSERT INTO sys_invoices (invoice_no, contact_id, client_name, client_phone, client_email,
          client_address, status, notes, subtotal, discount, tax, total, due_date,
          paid_at, created_by_id, created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(invoice_no, contact_id||null, client_name.trim(), client_phone||null, client_email||null,
             client_address||null, finalStatus, notes||null, subtotal, +discount, +tax, total, due_date||null,
             (finalStatus === 'paid' ? new Date().toISOString().replace('T',' ').split('.')[0] : null),
             creatorId, creatorName||'');

      const insItem = db.prepare(`
        INSERT INTO sys_invoice_items (invoice_id, product_id, description, qty, unit_price, total)
        VALUES (?,?,?,?,?,?)
      `);
      for (const it of items) {
        const itTotal = +it.qty * +it.unit_price;
        insItem.run(ins.lastInsertRowid, it.product_id||null, it.description, +it.qty, +it.unit_price, itTotal);
        // خصم من المخزون لو المنتج موجود
        if (it.product_id) {
          const prod = db.prepare('SELECT * FROM sys_products WHERE id=?').get(it.product_id);
          if (prod) {
            const newQty = Math.max(0, prod.stock_qty - +it.qty);
            db.prepare("UPDATE sys_products SET stock_qty=? WHERE id=?").run(newQty, it.product_id);
            db.prepare(`INSERT INTO sys_stock_moves (product_id, type, qty, unit_cost, ref_type, ref_id, notes)
              VALUES (?,?,?,?,'invoice',?,'فاتورة ' || ?)`).run(it.product_id, 'out', +it.qty, +it.unit_price, ins.lastInsertRowid, invoice_no);
          }
        }
      }

      // سجّل في CRM لو فيه contact
      if (contact_id) {
        db.prepare("UPDATE crm_contacts SET updated_at=datetime('now') WHERE id=?").run(contact_id);
        db.prepare("INSERT INTO crm_notes (contact_id, content) VALUES (?,?)").run(
          contact_id, 'تم إنشاء فاتورة ' + invoice_no + ' بقيمة ' + total.toFixed(2) + ' ج.م'
        );
        // upgrade CRM if paid immediately
        if (finalStatus === 'paid') {
          db.prepare("UPDATE crm_contacts SET status='client' WHERE id=? AND status IN ('lead','prospect')").run(contact_id);
        }
      }

      // سجّل حركة في الخزينة لو فيه wallet
      if (wallet_id && finalStatus === 'paid') {
        const wlt = db.prepare('SELECT * FROM sys_wallets WHERE id=?').get(wallet_id);
        if (wlt) {
          db.prepare(`INSERT INTO sys_transactions (wallet_id, type, amount, description, ref_type, ref_id, date)
            VALUES (?,?,?,?,?,?,date('now'))`)
            .run(wallet_id, 'in', total, 'قبض فاتورة ' + invoice_no + (payment_method ? ' — ' + payment_method : ''), 'invoice', ins.lastInsertRowid);
          db.prepare("UPDATE sys_wallets SET balance=balance+? WHERE id=?").run(total, wallet_id);
          // تحديث CRM: مدفوع
          if (contact_id) {
            db.prepare("UPDATE crm_contacts SET total_paid=COALESCE(total_paid,0)+?, balance=COALESCE(balance,0)-? WHERE id=?").run(total, total, contact_id);
          }
        }
      } else if (!wallet_id && finalStatus !== 'draft' && contact_id) {
        // بدون خزينة = آجل → تسجيل ذمم على العميل
        try {
          db.prepare("UPDATE crm_contacts SET balance=COALESCE(balance,0)+?, total_invoiced=COALESCE(total_invoiced,0)+? WHERE id=?").run(total, total, contact_id);
          // تسجيل في خزينة ذمم مدينة
          const receivableWallet = db.prepare("SELECT id FROM sys_wallets WHERE type='receivable' LIMIT 1").get();
          if (receivableWallet) {
            db.prepare(`INSERT INTO sys_transactions (wallet_id, type, amount, description, ref_type, ref_id, date) VALUES (?,?,?,?,?,?,date('now'))`)
              .run(receivableWallet.id, 'in', total, 'فاتورة آجل: ' + invoice_no + ' — ' + client_name, 'invoice', ins.lastInsertRowid);
            db.prepare("UPDATE sys_wallets SET balance=balance+? WHERE id=?").run(total, receivableWallet.id);
          }
        } catch(e) { console.error('[invoices.js]', e.message); }
      }

      return ins.lastInsertRowid;
    })();

    // Auto-update CRM status
    try {
      const clientName = req.body.client_name;
      if (clientName) {
        const contact = db.prepare("SELECT id, status FROM crm_contacts WHERE name LIKE ?").get('%' + clientName + '%');
        if (contact) {
          const nextStatus = { lead: 'prospect', prospect: 'client', client: 'client', vip: 'vip', inactive: 'inactive' };
          const newStatus = nextStatus[contact.status] || contact.status;
          if (newStatus !== contact.status) {
            db.prepare("UPDATE crm_contacts SET status=?, updated_at=datetime('now') WHERE id=?").run(newStatus, contact.id);
          }
        }
      }
    } catch(crmErr) { /* non-critical */ }

    res.json({ ok: true, id: invId, invoice_no });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/invoices/:id/add-item — إضافة منتج لفاتورة موجودة
router.post('/invoices/:id/add-item', (req, res) => {
  const db = req.db;
  try {
    const invoiceId = parseInt(req.params.id);
    const { product_id, description, qty = 1, unit_price } = req.body;
    if (!description) return res.json({ ok: false, error: 'description مطلوب' });

    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(invoiceId);
    if (!inv) return res.json({ ok: false, error: 'الفاتورة غير موجودة' });
    if (inv.status === 'paid' || inv.status === 'cancelled')
      return res.json({ ok: false, error: `لا يمكن تعديل فاتورة بحالة ${inv.status}` });

    const priceNum = parseFloat(unit_price) || 0;
    const qtyNum   = parseInt(qty)          || 1;
    const total    = qtyNum * priceNum;

    db.transaction(() => {
      db.prepare(`INSERT INTO sys_invoice_items (invoice_id, product_id, description, qty, unit_price, total)
        VALUES (?,?,?,?,?,?)`).run(invoiceId, product_id||null, description, qtyNum, priceNum, total);

      // تحديث totals الفاتورة
      const items   = db.prepare('SELECT * FROM sys_invoice_items WHERE invoice_id=?').all(invoiceId);
      const subtotal = items.reduce((s, i) => s + (+i.total), 0);
      const newTotal = subtotal - (+inv.discount||0) + (+inv.tax||0);
      db.prepare('UPDATE sys_invoices SET subtotal=?, total=? WHERE id=?').run(subtotal, newTotal, invoiceId);
    })();

    return res.json({ ok: true, invoice_id: invoiceId, item_total: total });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// PUT /api/system/invoices/:id/status
router.put('/invoices/:id/status', (req, res) => {
  const db = req.db;
  try {
    const { status, wallet_id, payment_method, paid_amount } = req.body;
    const validStatuses = ['draft','sent','paid','cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ ok: false, error: 'حالة غير صحيحة' });
    const patch = status === 'paid' ? ", paid_at=datetime('now')" : '';
    db.prepare(`UPDATE sys_invoices SET status=?${patch} WHERE id=?`).run(status, req.params.id);
    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.json({ ok: false, error: 'not found' });

    const amount = parseFloat(paid_amount) || inv.total;

    if (status === 'paid' || (wallet_id && amount > 0)) {
      // سجّل في الخزينة بالمبلغ الفعلي
      if (wallet_id) {
        const desc = 'استلام دفع: ' + inv.invoice_no + (inv.client_name ? ' — ' + inv.client_name : '') + (payment_method ? ' (' + payment_method + ')' : '');
        db.prepare(`INSERT INTO sys_transactions (date,type,amount,wallet_id,description,ref_type,ref_id,category) VALUES (date('now'),'in',?,?,?,'invoice',?,?)`)  
          .run(amount, parseInt(wallet_id), desc, inv.id, 'مبيعات');
        db.prepare('UPDATE sys_wallets SET balance=balance+? WHERE id=?').run(amount, parseInt(wallet_id));

        // لو كانت ذمم → اخصم من خزينة الذمم
        const recvWallet = db.prepare("SELECT id FROM sys_wallets WHERE type='receivable' LIMIT 1").get();
        if (recvWallet) {
          db.prepare(`INSERT INTO sys_transactions (date,type,amount,wallet_id,description,ref_type,ref_id) VALUES (date('now'),'out',?,?,?,'invoice',?)`)
            .run(amount, recvWallet.id, 'تحصيل ذمم: ' + inv.invoice_no + ' — ' + (inv.client_name||''), inv.id);
          db.prepare('UPDATE sys_wallets SET balance=balance-? WHERE id=?').run(amount, recvWallet.id);
        }

        // تحديث رصيد CRM
        if (inv.contact_id) {
          db.prepare('UPDATE crm_contacts SET balance=MAX(0,COALESCE(balance,0)-?), total_paid=COALESCE(total_paid,0)+? WHERE id=?')
            .run(amount, amount, inv.contact_id);
        }
      }

      if (status === 'paid' && inv.contact_id) {
        db.prepare("INSERT INTO crm_notes (contact_id, content) VALUES (?,?)").run(
          inv.contact_id, '✅ دفع فاتورة ' + inv.invoice_no + ' — ' + fmt_server(amount) + ' ج.م' + (payment_method ? ' (' + payment_method + ')' : '')
        );
        db.prepare("UPDATE crm_contacts SET status='client' WHERE id=? AND status IN ('lead','prospect')").run(inv.contact_id);
      }
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

function fmt_server(n) { return (+n||0).toFixed(2).replace(/\.00$/, ''); }

// DELETE /api/system/invoices/:id  (draft only)
router.delete('/invoices/:id', requirePerm('invoices.delete'), (req, res) => {
    const db = req.db;
    try {
    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ ok: false, error: 'Not found' });
    if (inv.status !== 'draft') return res.status(400).json({ ok: false, error: 'يمكن حذف المسودات فقط' });
    db.prepare('DELETE FROM sys_invoices WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/system/invoices/:id/pdf — HTML للطباعة
router.get('/invoices/:id/pdf', (req, res) => {
    const db = req.db;
    try {
    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ ok: false, error: 'Not found' });
    const items = db.prepare('SELECT * FROM sys_invoice_items WHERE invoice_id=? ORDER BY id').all(inv.id);
    // Get tenant profile from master DB
    const master = require('./db-master');
    const owner = master.prepare('SELECT name, company_name, logo_url, brand_color, phone, email FROM users WHERE id=?').get(req.user.id);
    const profile = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get() || {};
    const tenantProfile = {
      company_name:   profile.company_name || owner?.company_name || owner?.name || 'شركتك',
      company_name_en: profile.company_name_en || '',
      logo_url:       profile.logo_url || owner?.logo_url || null,
      brand_color:    profile.brand_color || owner?.brand_color || '#1B5E30',
      phone:          profile.phone || owner?.phone || '',
      email:          profile.email || owner?.email || '',
      address:        profile.address || '',
      website:        profile.website || '',
      tax_number:     profile.tax_number || '',
      commercial_reg: profile.commercial_reg || '',
      invoice_notes:  profile.invoice_notes || '',
    };
    const html = generateInvoiceHTML(inv, items, tenantProfile);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/system/invoices/stats
router.get('/invoices/stats/summary', (req, res) => {
    const db = req.db;
    try {
    const total_invoices = db.prepare('SELECT COUNT(*) as n FROM sys_invoices').get().n;
    const paid = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(total),0) as s FROM sys_invoices WHERE status='paid'").get();
    const pending = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(total),0) as s FROM sys_invoices WHERE status IN ('draft','sent')").get();
    const month_revenue = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM sys_invoices WHERE status='paid' AND paid_at >= datetime('now','start of month')").get().s;
    res.json({ ok: true, data: { total_invoices, paid_count: paid.n, paid_total: paid.s, pending_count: pending.n, pending_total: pending.s, month_revenue } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

function generateInvoiceHTML(inv, items, profile={}) {
  const statusLabel = { draft:'مسودة', sent:'أُرسلت', paid:'مدفوعة', cancelled:'ملغية' };
  const statusColor = { draft:'#6b7280', sent:'#3b82f6', paid:'#16a34a', cancelled:'#ef4444' };
  const rows = items.map(it => `
    <tr>
      <td>${esc(it.description)}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:left">${fmt(it.unit_price)} ج.م</td>
      <td style="text-align:left;font-weight:700">${fmt(it.total)} ج.م</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورة ${esc(inv.invoice_no)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--brand:${profile.brand_color||'#1B5E30'}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#fff;color:#1a1a1a;padding:32px;max-width:700px;margin:auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid var(--brand,#1B5E30)}
.brand h1{font-size:24px;font-weight:800;color:var(--brand,#1B5E30)}
.brand p{font-size:12px;color:#6b7280;margin-top:2px}
.inv-meta{text-align:left}
.inv-no{font-size:22px;font-weight:800;color:var(--brand,#1B5E30)}
.inv-date{font-size:12px;color:#6b7280;margin-top:4px}
.status-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;background:${statusColor[inv.status]||'#6b7280'};margin-top:6px}
.section-title{font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.client-box{background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:24px}
.client-name{font-size:18px;font-weight:700;margin-bottom:4px}
.client-info{font-size:13px;color:#6b7280}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:var(--brand,#1B5E30);color:#fff;padding:10px 12px;font-size:13px;text-align:right}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid #f3f4f6}
tr:last-child td{border-bottom:none}
.totals{margin-right:auto;width:260px}
.total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
.total-row.grand{font-size:18px;font-weight:800;color:var(--brand,#1B5E30);border-top:2px solid var(--brand,#1B5E30);padding-top:10px;margin-top:4px}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af}
.notes-box{background:#fffbeb;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#78350f}
@media print{body{padding:16px}.no-print{display:none}}
</style>
</head>
<body>
<div class="no-print" style="margin-bottom:20px;display:flex;gap:10px">
  <button onclick="window.print()" style="padding:8px 20px;background:#1B5E30;color:#fff;border:none;border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer">🖨️ طباعة / حفظ PDF</button>
  <button onclick="window.close()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;cursor:pointer">إغلاق</button>
</div>

<div class="header">
  <div class="brand">
    ${profile.logo_url ? '<img src="'+profile.logo_url+'" style="height:52px;max-width:140px;object-fit:contain;margin-bottom:8px;display:block" onerror="this.style.display=\'none\'">' : ''}
    <h1 style="color:${profile.brand_color||'#1B5E30'}">${esc(profile.company_name)}</h1>
    <p style="font-size:12px;color:#6b7280;margin-top:3px">
      ${profile.phone ? profile.phone : ''}${profile.phone && profile.email ? ' | ' : ''}${profile.email ? profile.email : ''}
    </p>
    ${profile.address ? '<p style="font-size:11px;color:#9ca3af;margin-top:2px">'+esc(profile.address)+'</p>' : ''}
    ${profile.tax_number ? '<p style="font-size:11px;color:#9ca3af">الرقم الضريبي: '+esc(profile.tax_number)+'</p>' : ''}
    ${profile.commercial_reg ? '<p style="font-size:11px;color:#9ca3af">السجل التجاري: '+esc(profile.commercial_reg)+'</p>' : ''}
  </div>
  <div class="inv-meta">
    <div class="inv-no">${esc(inv.invoice_no)}</div>
    <div class="inv-date">التاريخ: ${fmt_date(inv.created_at)}</div>
    ${inv.due_date ? '<div class="inv-date">الاستحقاق: '+fmt_date(inv.due_date)+'</div>' : ''}
    <div class="status-badge">${statusLabel[inv.status]||inv.status}</div>
  </div>
</div>

<div class="section-title">بيانات العميل</div>
<div class="client-box">
  <div class="client-name">${esc(inv.client_name)}</div>
  <div class="client-info">
    ${inv.client_phone ? '📱 '+esc(inv.client_phone)+'<br>' : ''}
    ${inv.client_email ? '✉️ '+esc(inv.client_email)+'<br>' : ''}
    ${inv.client_address ? '📍 '+esc(inv.client_address) : ''}
  </div>
</div>

<div class="section-title">بنود الفاتورة</div>
<table>
  <thead><tr><th>الوصف</th><th style="text-align:center">الكمية</th><th style="text-align:left">سعر الوحدة</th><th style="text-align:left">الإجمالي</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <div class="total-row"><span>المجموع الفرعي</span><span>${fmt(inv.subtotal)} ج.م</span></div>
  ${inv.discount > 0 ? '<div class="total-row" style="color:#ef4444"><span>خصم</span><span>-'+fmt(inv.discount)+' ج.م</span></div>' : ''}
  ${inv.tax > 0 ? '<div class="total-row"><span>ضريبة</span><span>'+fmt(inv.tax)+' ج.م</span></div>' : ''}
  <div class="total-row grand"><span>الإجمالي</span><span>${fmt(inv.total)} ج.م</span></div>
</div>

${inv.notes ? '<div class="notes-box" style="margin-top:16px"><strong>ملاحظات:</strong> '+esc(inv.notes)+'</div>' : ''}

<div class="footer">
  شكراً لتعاملكم معنا — ${esc(profile.company_name)}<br>
  ${profile.website ? '<span>'+esc(profile.website)+'</span><br>' : ''}
  ${profile.invoice_notes ? '<span style="color:#d97706">'+esc(profile.invoice_notes)+'</span><br>' : ''}
  ${fmt_date(inv.created_at)}
</div>
</body></html>`;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { return (+n||0).toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmt_date(s) { if(!s) return '—'; try { return new Date(s).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }); } catch(e) { return s; } }


module.exports = router;
