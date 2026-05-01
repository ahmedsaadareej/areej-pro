'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
const master  = require('../db-master');
const { validate, assertId } = require('../middleware/validate');
const { requirePerm } = require('../middleware/permissions');
// ============================================================
// ORDER TRACKING
// ============================================================

function nextOrderNo(db) {
  db.prepare('UPDATE sys_order_seq SET counter=counter+1').run();
  const row = db.prepare('SELECT counter as seq FROM sys_order_seq').get();
  return 'ORD-' + String(row.seq).padStart(4,'0');
}

const STATUS_LABELS = {
  new:           'جديد',
  confirmed:     'مؤكد',
  in_production: 'قيد الإنتاج',
  ready:         'جاهز للشحن',
  processing:    'قيد المعالجة',
  preparing:     'قيد التجهيز',
  shipped:       'مع المندوب',
  delivered:     'تم التسليم',
  cancelled:     'ملغي',
  returned:      'مرتجع'
};

const ORDER_TYPE_LABELS = {
  stock:      'من المخزون',
  pod_own:    'طباعة — خامتك',
  pod_client: 'طباعة — خامة العميل'
};

// GET /api/system/orders
router.get('/orders', (req, res) => {
    const db = req.db;
    try {
    const { status, search, page=1, limit=50 } = req.query;
    let where = 'WHERE 1=1'; const params = [];
    if (status) { where += ' AND o.status=?'; params.push(status); }
    if (search) {
      where += ' AND (o.order_no LIKE ? OR o.client_name LIKE ? OR o.client_phone LIKE ?)';
      const q='%'+search+'%'; params.push(q,q,q);
    }
    const offset = (parseInt(page)-1)*parseInt(limit);
    const total = db.prepare('SELECT COUNT(*) as n FROM sys_orders o '+where).get(...params).n;
    const rows = db.prepare(`
      SELECT o.*, i.invoice_no
      FROM sys_orders o
      LEFT JOIN sys_invoices i ON i.id=o.invoice_id
      ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    // stats
    const stats = {};
    Object.keys(STATUS_LABELS).forEach(s => {
      stats[s] = db.prepare('SELECT COUNT(*) as n FROM sys_orders WHERE status=?').get(s).n;
    });
    res.json({ ok:true, data:rows, total, stats });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/orders/:id
router.get('/orders/:id', (req, res) => {
    const db = req.db;
    try {
    const o = db.prepare('SELECT o.*, i.invoice_no FROM sys_orders o LEFT JOIN sys_invoices i ON i.id=o.invoice_id WHERE o.id=?').get(req.params.id);
    if (!o) return res.status(404).json({ ok:false, error:'Not found' });
    const logs = db.prepare('SELECT * FROM sys_order_logs WHERE order_id=? ORDER BY created_at DESC').all(o.id);
    res.json({ ok:true, data:{ ...o, logs } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/orders/:id/public — بدون token لصفحة حالة الطلب
router.get('/orders/:id/public', (req, res) => {
    const db = req.db;
    try {
    const o = db.prepare('SELECT id,order_no,client_name,status,shipping_co,tracking_no,created_at,updated_at,total FROM sys_orders WHERE id=?').get(req.params.id);
    if (!o) return res.status(404).json({ ok:false, error:'Not found' });
    const logs = db.prepare('SELECT status,note,created_at FROM sys_order_logs WHERE order_id=? ORDER BY created_at ASC').all(o.id);
    res.json({ ok:true, data:{ ...o, logs, status_label: STATUS_LABELS[o.status]||o.status } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/orders — إنشاء يدوياً أو من فاتورة
router.post('/orders', (req, res) => {
    const db = req.db;
    try {
    // ── Validation ──
    const body = validate(req.body, {
      client_name:  { required: true, type: 'string', maxLen: 200, label: 'اسم العميل' },
      client_phone: { type: 'string', maxLen: 30 },
      total:        { type: 'number', min: 0 },
      order_type:   { enum: ['stock','production','external'] },
    });
    const { invoice_id, contact_id, client_name, client_phone, client_address, client_email,
            notes, total=0, shipping_co, tracking_no,
            order_type='stock', production_notes, production_supplier, production_due_date } = { ...req.body, ...body };
    if (!client_name?.trim()) return res.status(400).json({ ok:false, error:'اسم العميل مطلوب' });

    let invData = {};
    if (invoice_id) {
      const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(+invoice_id);
      if (inv) invData = { contact_id: inv.contact_id, client_name: inv.client_name, client_phone: inv.client_phone, total: inv.total };
    }

    const order_no = nextOrderNo(db);
    const ordId = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO sys_orders (order_no,invoice_id,contact_id,client_name,client_phone,client_address,client_email,notes,total,shipping_co,tracking_no,order_type,production_notes,production_supplier,production_due_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        order_no, invoice_id||null,
        contact_id || invData.contact_id || null,
        client_name?.trim() || invData.client_name,
        client_phone || invData.client_phone || null,
        client_address||null, client_email||null,
        notes||null, total || invData.total || 0,
        shipping_co||null, tracking_no||null,
        order_type, production_notes||null, production_supplier||null, production_due_date||null
      );
      // لوغ أولي
      db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ins.lastInsertRowid, 'new', 'تم إنشاء الطلب');
      // حدّث CRM
      const cid = contact_id || invData.contact_id;
      if (cid) {
        db.prepare("UPDATE crm_contacts SET updated_at=datetime('now') WHERE id=?").run(cid);
        db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(cid, 'طلب جديد: '+order_no);
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

    res.json({ ok:true, id:ordId, order_no });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/orders/:id/status
router.put('/orders/:id/status', (req, res) => {
    const db = req.db;
    try {
    const { status, note, shipping_co, tracking_no } = req.body;
    if (!STATUS_LABELS[status]) return res.status(400).json({ ok:false, error:'حالة غير صحيحة' });
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.status(404).json({ ok:false, error:'Not found' });

    db.transaction(() => {
      let sql = "UPDATE sys_orders SET status=?, updated_at=datetime('now')";
      const params = [status];
      if (shipping_co) { sql += ', shipping_co=?'; params.push(shipping_co); }
      if (tracking_no) { sql += ', tracking_no=?'; params.push(tracking_no); }
      sql += ' WHERE id=?'; params.push(ord.id);
      db.prepare(sql).run(...params);

      db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, status, note || STATUS_LABELS[status]);

      // حدّث CRM عند التسليم
      if (ord.contact_id) {
        db.prepare("UPDATE crm_contacts SET updated_at=datetime('now') WHERE id=?").run(ord.contact_id);
        if (status === 'delivered') {
          db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(ord.contact_id, '✅ تسليم طلب '+ord.order_no);
          db.prepare("UPDATE crm_contacts SET status='client' WHERE id=? AND status IN ('lead','prospect')").run(ord.contact_id);
        }
        if (status === 'returned') {
          db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(ord.contact_id, '⚠️ مرتجع طلب '+ord.order_no);
        }
      }
    })();
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/orders/from-invoice/:inv_id — تحويل فاتورة → طلب
router.post('/orders/from-invoice/:inv_id', (req, res) => {
    const db = req.db;
    try {
    const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(req.params.inv_id);
    if (!inv) return res.status(404).json({ ok:false, error:'Not found' });
    // لو فيه طلب بالفعل
    const existing = db.prepare('SELECT id FROM sys_orders WHERE invoice_id=?').get(inv.id);
    if (existing) return res.json({ ok:true, id:existing.id, already_exists:true });

    const order_no = nextOrderNo(db);
    const ordId = db.transaction(() => {
      const ins = db.prepare(`INSERT INTO sys_orders (order_no,invoice_id,contact_id,client_name,client_phone,total) VALUES (?,?,?,?,?,?)`).
        run(order_no, inv.id, inv.contact_id||null, inv.client_name, inv.client_phone||null, inv.total);
      db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ins.lastInsertRowid,'new','محوّل من فاتورة '+inv.invoice_no);
      if (inv.contact_id) db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(inv.contact_id, 'طلب جديد: '+order_no);
      return ins.lastInsertRowid;
    })();
    res.json({ ok:true, id:ordId, order_no });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/orders/stats/summary
router.get('/orders/stats/summary', (req, res) => {
    const db = req.db;
    try {
    const stats = {};
    Object.keys(STATUS_LABELS).forEach(s => { stats[s] = db.prepare('SELECT COUNT(*) as n FROM sys_orders WHERE status=?').get(s).n; });
    const total_revenue = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM sys_orders WHERE status='delivered'").get().s;
    const month_orders = db.prepare("SELECT COUNT(*) as n FROM sys_orders WHERE created_at >= datetime('now','start of month')").get().n;
    res.json({ ok:true, data:{ ...stats, total_revenue, month_orders } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ============================================================
// SUPPLIERS
// ============================================================

function nextPONo(db) {
  db.prepare('UPDATE sys_po_seq SET counter=counter+1').run();
  const row = db.prepare('SELECT counter as seq FROM sys_po_seq').get();
  return 'PO-' + String(row.seq).padStart(4, '0');
}

// GET /api/system/suppliers
router.get('/suppliers', (req, res) => {
    const db = req.db;
    try {
    const { search, category } = req.query;
    let where = 'WHERE 1=1'; const params = [];
    if (search) { where += ' AND (s.name LIKE ? OR s.phone LIKE ?)'; const q='%'+search+'%'; params.push(q,q); }
    if (category) { where += ' AND s.category=?'; params.push(category); }
    const rows = db.prepare(`
      SELECT s.*,
        COUNT(DISTINCT po.id) as po_count,
        COALESCE(SUM(po.total),0) as total_purchased
      FROM sys_suppliers s
      LEFT JOIN sys_purchase_orders po ON po.supplier_id=s.id AND po.status != 'cancelled'
      ${where}
      GROUP BY s.id ORDER BY s.name
    `).all(...params);
    const cats = db.prepare('SELECT DISTINCT category FROM sys_suppliers WHERE category IS NOT NULL ORDER BY category').all().map(r=>r.category);
    res.json({ ok: true, data: rows, categories: cats });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/suppliers/:id
router.get('/suppliers/:id', (req, res) => {
    const db = req.db;
    try {
    const s = db.prepare('SELECT * FROM sys_suppliers WHERE id=?').get(req.params.id);
    if (!s) return res.status(404).json({ ok:false, error:'Not found' });
    const orders = db.prepare(`SELECT * FROM sys_purchase_orders WHERE supplier_id=? ORDER BY created_at DESC LIMIT 20`).all(s.id);
    res.json({ ok:true, data: { ...s, orders } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/suppliers
router.post('/suppliers', (req, res) => {
  const db = req.db;
  try {
    const { name, company_name, phone, whatsapp, email, city, governorate, address, country, phone_code, category, products, notes, rating=3 } = req.body;
    const displayName = company_name || name;
    if (!displayName?.trim()) return res.status(400).json({ ok:false, error:'اسم المورد مطلوب' });
    const r = db.prepare(`INSERT INTO sys_suppliers (name,phone,whatsapp,email,city,governorate,address,country,phone_code,category,products,notes,rating) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(displayName.trim(), phone||null, whatsapp||null, email||null, city||null, governorate||null, address||null, country||'EG', phone_code||'+20', category||null, products||null, notes||null, +rating||3);
    res.json({ ok:true, id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/suppliers/:id
router.put('/suppliers/:id', (req, res) => {
  const db = req.db;
  try {
    const { name, company_name, phone, whatsapp, email, city, governorate, address, country, phone_code, category, products, notes, rating, active } = req.body;
    const displayName = company_name || name;
    db.prepare(`UPDATE sys_suppliers SET name=COALESCE(?,name),phone=COALESCE(?,phone),whatsapp=COALESCE(?,whatsapp),
      email=COALESCE(?,email),city=COALESCE(?,city),governorate=COALESCE(?,governorate),address=COALESCE(?,address),
      country=COALESCE(?,country),phone_code=COALESCE(?,phone_code),category=COALESCE(?,category),
      products=COALESCE(?,products),notes=COALESCE(?,notes),rating=COALESCE(?,rating),active=COALESCE(?,active) WHERE id=?`)
      .run(displayName||null,phone||null,whatsapp||null,email||null,city||null,governorate||null,address||null,
        country||null,phone_code||null,category||null,products||null,notes||null,rating?+rating:null,
        active===false?0:active===true?1:null, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// DELETE /api/system/suppliers/:id
router.delete('/suppliers/:id', (req, res) => {
    const db = req.db;
    try {
    db.prepare('DELETE FROM sys_suppliers WHERE id=?').run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── PURCHASE ORDERS ──

// GET /api/system/purchase-orders
router.get('/purchase-orders', (req, res) => {
    const db = req.db;
    try {
    const { supplier_id, status } = req.query;
    let where = 'WHERE 1=1'; const params = [];
    if (supplier_id) { where += ' AND po.supplier_id=?'; params.push(+supplier_id); }
    if (status) { where += ' AND po.status=?'; params.push(status); }
    const rows = db.prepare(`
      SELECT po.*, s.name as supplier_name_crm
      FROM sys_purchase_orders po
      LEFT JOIN sys_suppliers s ON s.id=po.supplier_id
      ${where} ORDER BY po.created_at DESC LIMIT 100
    `).all(...params);
    res.json({ ok:true, data:rows });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/purchase-orders
router.post('/purchase-orders', (req, res) => {
    const db = req.db;
    try {
    const { supplier_id, items=[], notes, expected_date, wallet_id=null, payment_method=null } = req.body;
    if (!items.length) return res.status(400).json({ ok:false, error:'لازم فيه صنف واحد' });
    const sup = supplier_id ? db.prepare('SELECT * FROM sys_suppliers WHERE id=?').get(+supplier_id) : null;
    const supplier_name = sup?.name || 'غير محدد';
    const po_no = nextPONo(db);
    const total = items.reduce((s,it) => s + (+it.qty * +it.unit_cost), 0);

    const poId = db.transaction(() => {
      const ins = db.prepare(`INSERT INTO sys_purchase_orders (po_no,supplier_id,supplier_name,total,notes,expected_date,wallet_id,payment_method) VALUES (?,?,?,?,?,?,?,?)`)
        .run(po_no, supplier_id||null, supplier_name, total, notes||null, expected_date||null, wallet_id||null, payment_method||null);
      const insItem = db.prepare(`INSERT INTO sys_purchase_items (po_id,product_id,description,qty,unit_cost,total) VALUES (?,?,?,?,?,?)`);
      for (const it of items) {
        insItem.run(ins.lastInsertRowid, it.product_id||null, it.description, +it.qty, +it.unit_cost, +it.qty * +it.unit_cost);
      }
      // لو تم تحديد خزينة دفع → سجّل مصروف
      if (wallet_id && total > 0) {
        db.prepare(`INSERT INTO sys_transactions (date,type,amount,wallet_id,description,ref_type,ref_id)
          VALUES (date('now'),'out',?,?,?,'po',?)`)
          .run(total, wallet_id, 'دفع مورد: '+supplier_name+' — '+po_no+(payment_method?' ('+payment_method+')':''), ins.lastInsertRowid);
        db.prepare("UPDATE sys_wallets SET balance=balance-? WHERE id=?").run(total, wallet_id);
      }
      return ins.lastInsertRowid;
    })();
    res.json({ ok:true, id:poId, po_no });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/purchase-orders/:id/receive — تسجيل استلام = دخول مخزون
router.put('/purchase-orders/:id/receive', (req, res) => {
    const db = req.db;
    try {
    const po = db.prepare('SELECT * FROM sys_purchase_orders WHERE id=?').get(req.params.id);
    if (!po) return res.status(404).json({ ok:false, error:'Not found' });
    const items = db.prepare('SELECT * FROM sys_purchase_items WHERE po_id=?').all(po.id);

    db.transaction(() => {
      for (const it of items) {
        if (it.product_id) {
          const prod = db.prepare('SELECT * FROM sys_products WHERE id=?').get(it.product_id);
          if (prod) {
            const newQty = prod.stock_qty + it.qty;
            db.prepare("UPDATE sys_products SET stock_qty=? WHERE id=?").run(newQty, it.product_id);
            db.prepare(`INSERT INTO sys_stock_moves (product_id,type,qty,unit_cost,ref_type,ref_id,notes) VALUES (?,'in',?,?,'po',?,?)`)
              .run(it.product_id, it.qty, it.unit_cost, po.id, 'أوردر شراء '+po.po_no);
          }
        }
        db.prepare('UPDATE sys_purchase_items SET received_qty=qty WHERE id=?').run(it.id);
      }
      db.prepare("UPDATE sys_purchase_orders SET status='received', received_date=datetime('now') WHERE id=?")
        .run(po.id);
      // سجّل دفع للمورد في الخزينة لو wallet_id موجود
      const { wallet_id } = req.body;
      if (wallet_id && po.total_amount > 0) {
        db.prepare(`INSERT INTO sys_transactions (date,type,amount,wallet_id,description,ref_type,ref_id)
          VALUES (date('now'),'out',?,?,?,'po',?)`)
          .run(po.total_amount, wallet_id,
            'دفع مورد: ' + (db.prepare('SELECT name FROM sys_suppliers WHERE id=?').get(po.supplier_id)?.name || 'مورد') + ' — ' + po.po_no,
            po.id);
      }
    })();
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/purchase-orders/:id/cancel
router.put('/purchase-orders/:id/cancel', (req, res) => {
    const db = req.db;
    try {
    db.prepare("UPDATE sys_purchase_orders SET status='cancelled' WHERE id=?")
      .run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/suppliers/stats/summary
router.get('/suppliers/stats/summary', (req, res) => {
    const db = req.db;
    try {
    const total = db.prepare('SELECT COUNT(*) as n FROM sys_suppliers WHERE active=1').get().n;
    const po_total = db.prepare("SELECT COUNT(*) as n FROM sys_purchase_orders").get().n;
    const po_pending = db.prepare("SELECT COUNT(*) as n FROM sys_purchase_orders WHERE status='pending'").get().n;
    const total_spent = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM sys_purchase_orders WHERE status='received'").get().s;
    res.json({ ok:true, data:{ total_suppliers:total, total_po:po_total, pending_po:po_pending, total_spent } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Public router (no auth) ─────────────────────────────────
const publicRouter = require('express').Router();

publicRouter.get('/:id/public', (req, res) => {
    const db = req.db;
    try {
    const o = db.prepare('SELECT id,order_no,client_name,status,shipping_co,tracking_no,created_at,updated_at,total FROM sys_orders WHERE id=?').get(req.params.id);
    if (!o) return res.status(404).json({ ok:false, error:'الطلب غير موجود' });
    const logs = db.prepare('SELECT status,note,created_at FROM sys_order_logs WHERE order_id=? ORDER BY created_at ASC').all(o.id);
    const STATUS_LBL = { new:'جديد', processing:'قيد المعالجة', preparing:'قيد التجهيز', shipped:'مع المندوب', delivered:'تم التسليم', cancelled:'ملغي', returned:'مرتجع' };
    res.json({ ok:true, data:{ ...o, logs, status_label: STATUS_LBL[o.status]||o.status } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});



module.exports = router;
module.exports.publicOrderRouter = publicRouter;
