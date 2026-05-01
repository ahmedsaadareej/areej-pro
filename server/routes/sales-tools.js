'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
const crypto  = require('crypto');

// POST /api/system/payment-links — إنشاء لينك دفع
router.post('/payment-links', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { invoice_id, amount, client_name, client_phone, description } = req.body;
    if (!amount) return res.json({ ok: false, error: 'amount required' });
    const token = crypto.randomBytes(16).toString('hex');
    const r = db.prepare(`INSERT INTO payment_links (invoice_id, token, amount, client_name, client_phone, description) VALUES (?,?,?,?,?,?)`)
      .run(invoice_id || null, token, parseFloat(amount), client_name||'', client_phone||'', description||'');
    const baseUrl = process.env.APP_BASE_URL || 'https://pro.areejegypt.com';
    const link = `${baseUrl}/pay/${token}`;
    res.json({ ok: true, id: r.lastInsertRowid, token, link });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/payment-links — قائمة اللينكات
router.get('/payment-links', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(`SELECT pl.*, i.invoice_no FROM payment_links pl LEFT JOIN sys_invoices i ON i.id=pl.invoice_id ORDER BY pl.created_at DESC LIMIT 30`).all();
    res.json({ ok: true, links: rows });
  } catch(e) { res.json({ ok: true, links: [] }); }
});

// ============================================================
// ORDER FORMS — فورم الطلب
// ============================================================

// POST /api/system/order-forms — إنشاء فورم
router.post('/order-forms', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { title, products } = req.body;
    if (!title) return res.json({ ok: false, error: 'title required' });
    const token = crypto.randomBytes(12).toString('hex');
    const r = db.prepare(`INSERT INTO order_forms (token, title, products) VALUES (?,?,?)`)
      .run(token, title, JSON.stringify(products || []));
    const baseUrl = process.env.APP_BASE_URL || 'https://pro.areejegypt.com';
    const link = `${baseUrl}/order-form/${token}`;
    res.json({ ok: true, id: r.lastInsertRowid, token, link });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/order-forms
router.get('/order-forms', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const forms = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM order_form_submissions s WHERE s.form_id=f.id) as submissions_count FROM order_forms f ORDER BY f.created_at DESC`).all();
    res.json({ ok: true, forms });
  } catch(e) { res.json({ ok: true, forms: [] }); }
});

// GET /api/system/order-forms/:token/submissions
router.get('/order-forms/:token/submissions', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const form = db.prepare('SELECT * FROM order_forms WHERE token=?').get(req.params.token);
    if (!form) return res.json({ ok: false, error: 'not found' });
    const subs = db.prepare('SELECT * FROM order_form_submissions WHERE form_id=? ORDER BY created_at DESC').all(form.id);
    res.json({ ok: true, form, submissions: subs });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/system/order-forms/:id
router.delete('/order-forms/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM order_forms WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// SHIPPING — الشحن المتكامل
// ============================================================

// GET /api/system/shipping/settings
router.get('/shipping/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    let s = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get();
    if (!s) {
      db.prepare('INSERT OR IGNORE INTO shipping_settings (id) VALUES (1)').run();
      s = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get();
    }
    res.json({ ok: true, settings: s || {} });
  } catch(e) { res.json({ ok: true, settings: {} }); }
});

// POST /api/system/shipping/settings
router.post('/shipping/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { bosta_api_key, aramex_api_key, jnt_api_key, default_company, sender_name, sender_phone, sender_address } = req.body;
    db.prepare(`INSERT OR REPLACE INTO shipping_settings (id, bosta_api_key, aramex_api_key, jnt_api_key, default_company, sender_name, sender_phone, sender_address, updated_at)
      VALUES (1,?,?,?,?,?,?,?,datetime('now'))`).run(bosta_api_key||'', aramex_api_key||'', jnt_api_key||'', default_company||'bosta', sender_name||'', sender_phone||'', sender_address||'');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/shipping/create — إنشاء شحنة
router.post('/shipping/create', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const { order_id, company, receiver_name, receiver_phone, receiver_address, receiver_city, weight, cod_amount, notes } = req.body;
    if (!order_id || !receiver_phone) return res.json({ ok: false, error: 'order_id and receiver_phone required' });
    const order = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(order_id);
    if (!order) return res.json({ ok: false, error: 'order not found' });
    const settings = db.prepare('SELECT * FROM shipping_settings WHERE id=1').get() || {};
    const shippingCo = company || settings.default_company || 'manual';

    // Generate waybill number
    const waybillNo = shippingCo.toUpperCase().substring(0,3) + '-' + Date.now().toString().slice(-8);

    // Save shipment
    const r = db.prepare(`INSERT INTO sys_shipments (order_id, company, waybill_no, receiver_name, receiver_phone, receiver_address, receiver_city, weight, cod_amount, notes, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`).run(order_id, shippingCo, waybillNo, receiver_name||order.client_name, receiver_phone||order.client_phone, receiver_address||order.client_address||'', receiver_city||'', weight||0.5, cod_amount||0, notes||'');

    // Update order with tracking
    db.prepare('UPDATE sys_orders SET shipping_co=?, tracking_no=? WHERE id=?').run(shippingCo, waybillNo, order_id);

    // Add order log
    db.prepare('INSERT INTO sys_order_logs (order_id, status, note) VALUES (?,?,?)').run(order_id, 'shipped', 'تم إنشاء شحنة ' + shippingCo + ' — ' + waybillNo);

    const trackingLink = `https://pro.areejegypt.com/track/${waybillNo}`;
    const waMsg = `مرحباً ${receiver_name||order.client_name} 👋\nطلبك رقم ${order.order_no} في الطريق إليك!\nرقم الشحنة: ${waybillNo}\nتتبع الشحنة: ${trackingLink}\nشركة الشحن: ${shippingCo}`;

    res.json({ ok: true, shipment_id: r.lastInsertRowid, waybill_no: waybillNo, tracking_link: trackingLink, wa_message: waMsg });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/shipping/shipments
router.get('/shipping/shipments', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(`SELECT s.*, o.order_no, o.client_name FROM sys_shipments s LEFT JOIN sys_orders o ON o.id=s.order_id ORDER BY s.created_at DESC LIMIT 30`).all();
    const stats = db.prepare(`SELECT status, COUNT(*) as c FROM sys_shipments GROUP BY status`).all();
    res.json({ ok: true, shipments: rows, stats });
  } catch(e) { res.json({ ok: true, shipments: [], stats: [] }); }
});

// PUT /api/system/shipping/shipments/:id/status
router.put('/shipping/shipments/:id/status', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { status, notes } = req.body;
    db.prepare('UPDATE sys_shipments SET status=?, notes=?, updated_at=datetime(\'now\') WHERE id=?').run(status, notes||'', req.params.id);
    // Update order status too
    const ship = db.prepare('SELECT * FROM sys_shipments WHERE id=?').get(req.params.id);
    if (ship) {
      const ordStatus = status === 'delivered' ? 'delivered' : status === 'returned' ? 'returned' : 'shipped';
      db.prepare('UPDATE sys_orders SET status=? WHERE id=?').run(ordStatus, ship.order_id);
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// PRODUCT CATEGORIES
// ============================================================
router.get('/categories', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM product_categories ORDER BY name').all();
    res.json({ ok: true, categories: rows });
  } catch(e) { res.json({ ok: true, categories: [] }); }
});

router.post('/categories', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name } = req.body;
    if (!name) return res.json({ ok: false, error: 'name required' });
    const r = db.prepare('INSERT INTO product_categories (name) VALUES (?)').run(name.trim());
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.json({ ok: false, error: 'الفئة موجودة بالفعل' });
    res.json({ ok: false, error: e.message });
  }
});

router.delete('/categories/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM product_categories WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/products/check-name?name=xxx
router.get('/products/check-name', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, exclude_id } = req.query;
    if (!name) return res.json({ ok: true, exists: false });
    let q = 'SELECT id FROM sys_products WHERE LOWER(name)=LOWER(?)';
    const params = [name.trim()];
    if (exclude_id) { q += ' AND id != ?'; params.push(parseInt(exclude_id)); }
    const row = db.prepare(q).get(...params);
    res.json({ ok: true, exists: !!row });
  } catch(e) { res.json({ ok: true, exists: false }); }
});

// ============================================================
// PRODUCT IMAGE UPLOAD
// ============================================================
const multer_prod = require('multer');
const path_prod = require('path');
const prodImgStorage = multer_prod.diskStorage({
  destination: (req, file, cb) => {
    const dir = path_prod.join(__dirname, '../public/uploads/products');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path_prod.extname(file.originalname);
    cb(null, 'prod-' + Date.now() + ext);
  }
});
const prodUpload = multer_prod({ storage: prodImgStorage, limits: { fileSize: 3 * 1024 * 1024 } });

router.post('/products/:id/image', requireAuth, prodUpload.single('image'), (req, res) => {
  const db = req.db;
  try {
    if (!req.file) return res.json({ ok: false, error: 'no file' });
    const url = '/uploads/products/' + req.file.filename;
    db.prepare('UPDATE sys_products SET image_url=? WHERE id=?').run(url, req.params.id);
    res.json({ ok: true, url });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// SHIPPING COMPANIES — شركات الشحن
// ============================================================

// GET /api/system/shipping/companies
router.get('/shipping/companies', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare('SELECT * FROM shipping_companies ORDER BY is_default DESC, name ASC').all();
    res.json({ ok: true, companies: rows });
  } catch(e) { res.json({ ok: true, companies: [] }); }
});

// POST /api/system/shipping/companies
router.post('/shipping/companies', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, name_en, logo_url, api_endpoint, api_key, api_secret, tracking_url_template, webhook_secret, is_default, notes } = req.body;
    if (!name) return res.json({ ok: false, error: 'name required' });
    if (is_default) db.prepare('UPDATE shipping_companies SET is_default=0').run();
    const r = db.prepare(`INSERT INTO shipping_companies (name,name_en,logo_url,api_endpoint,api_key,api_secret,tracking_url_template,webhook_secret,is_default,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name,name_en||'',logo_url||'',api_endpoint||'',api_key||'',api_secret||'',
      tracking_url_template||'',webhook_secret||'',is_default?1:0,notes||'');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// PUT /api/system/shipping/companies/:id
router.put('/shipping/companies/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, name_en, logo_url, api_endpoint, api_key, api_secret, tracking_url_template, webhook_secret, is_default, notes, active } = req.body;
    if (is_default) db.prepare('UPDATE shipping_companies SET is_default=0').run();
    db.prepare(`UPDATE shipping_companies SET name=COALESCE(?,name), name_en=COALESCE(?,name_en),
      api_endpoint=COALESCE(?,api_endpoint), api_key=COALESCE(?,api_key), api_secret=COALESCE(?,api_secret),
      tracking_url_template=COALESCE(?,tracking_url_template), webhook_secret=COALESCE(?,webhook_secret),
      is_default=COALESCE(?,is_default), notes=COALESCE(?,notes), active=COALESCE(?,active)
      WHERE id=?`).run(name||null,name_en||null,api_endpoint||null,api_key||null,api_secret||null,
      tracking_url_template||null,webhook_secret||null,is_default!=null?is_default?1:0:null,
      notes||null,active!=null?active?1:0:null,req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/system/shipping/companies/:id
router.delete('/shipping/companies/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM shipping_companies WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/shipping/companies/:id/test — اختبار الـ API
router.post('/shipping/companies/:id/test', requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const co = db.prepare('SELECT * FROM shipping_companies WHERE id=?').get(req.params.id);
    if (!co) return res.json({ ok: false, error: 'not found' });
    if (!co.api_endpoint || !co.api_key) return res.json({ ok: false, error: 'API endpoint/key not configured' });
    const https = require('https');
    const http = require('http');
    const url = new URL(co.api_endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    await new Promise((resolve) => {
      const req2 = mod.request({ hostname: url.hostname, path: url.pathname, method: 'GET',
        headers: { 'Authorization': 'Bearer ' + co.api_key, 'Content-Type': 'application/json' }
      }, (r) => { resolve(r.statusCode); });
      req2.on('error', () => resolve(null));
      req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
      req2.end();
    });
    res.json({ ok: true, message: 'تم الاتصال بنجاح' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/shipping/shipments/:id
router.get('/shipping/shipments/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const s = db.prepare(`SELECT s.*, o.order_no, o.client_name as order_client, o.total as order_total,
      o.status as order_status FROM sys_shipments s LEFT JOIN sys_orders o ON o.id=s.order_id WHERE s.id=?`).get(req.params.id);
    if (!s) return res.json({ ok: false, error: 'not found' });
    res.json({ ok: true, shipment: s });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// ORDER → INVOICE
// ============================================================
router.post('/orders/:id/to-invoice', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'الطلب غير موجود' });
    if (ord.invoice_id) {
      const inv = db.prepare('SELECT invoice_no FROM sys_invoices WHERE id=?').get(ord.invoice_id);
      return res.json({ ok: true, invoice_id: ord.invoice_id, invoice_no: inv?.invoice_no, already_exists: true });
    }

    const { wallet_id, payment_method, items } = req.body;
    const invoice_no = nextInvoiceNo(db);

    // حساب الإجمالي من items أو من الأوردر
    let invoiceItems = items || [];
    const subtotal = invoiceItems.length
      ? invoiceItems.reduce((s, it) => s + (+it.qty * +it.unit_price), 0)
      : (ord.total || 0);
    const total = subtotal;

    const creatorId   = req.tenantUser ? req.tenantUser.id   : req.user.id;
    const creatorName = req.tenantUser ? req.tenantUser.name : req.user.name;

    const invId = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO sys_invoices (invoice_no, contact_id, client_name, client_phone, client_email, client_address,
          status, notes, subtotal, discount, tax, total, created_by_id, created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)
      `).run(invoice_no, ord.contact_id||null, ord.client_name, ord.client_phone||null,
             ord.client_email||null, ord.client_address||null,
             wallet_id ? 'paid' : 'sent',
             ord.notes||null, subtotal, total, creatorId, creatorName||'');

      const invInserted = ins.lastInsertRowid;

      // إضافة الـ items
      if (invoiceItems.length) {
        const insItem = db.prepare('INSERT INTO sys_invoice_items (invoice_id,description,qty,unit_price,total,product_id) VALUES (?,?,?,?,?,?)');
        invoiceItems.forEach(it => {
          const itTotal = +it.qty * +it.unit_price;
          insItem.run(invInserted, it.description||it.name||'', +it.qty, +it.unit_price, itTotal, it.product_id||null);
          // خصم من المخزون (إلا لو POD من خامة العميل)
          if (it.product_id && ord.order_type !== 'pod_client') {
            const prod = db.prepare('SELECT * FROM sys_products WHERE id=?').get(it.product_id);
            if (prod) {
              const newQty = Math.max(0, prod.stock_qty - +it.qty);
              db.prepare('UPDATE sys_products SET stock_qty=? WHERE id=?').run(newQty, it.product_id);
              db.prepare(`INSERT INTO sys_stock_moves (product_id,type,qty,unit_cost,ref_type,ref_id,notes) VALUES (?,'out',?,?,'invoice',?,?)`)
                .run(it.product_id, +it.qty, +it.unit_price, invInserted, 'فاتورة '+invoice_no);
            }
          }
        });
      }

      // ربط الأوردر بالفاتورة
      db.prepare('UPDATE sys_orders SET invoice_id=?, status=?, updated_at=datetime(\'now\') WHERE id=?').run(invInserted, 'preparing', ord.id);
      db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'preparing', 'تم تحويله لفاتورة: '+invoice_no);

      // دفع إلى خزينة
      if (wallet_id) {
        db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,description,ref_type,ref_id,date) VALUES (?,?,?,?,?,?,date('now'))`)
          .run(parseInt(wallet_id), 'in', total, 'فاتورة: '+invoice_no+' — '+ord.client_name, 'invoice', invInserted);
        db.prepare('UPDATE sys_wallets SET balance=balance+? WHERE id=?').run(total, parseInt(wallet_id));
        db.prepare('UPDATE sys_invoices SET paid_at=datetime(\'now\') WHERE id=?').run(invInserted);
      }

      // CRM note
      if (ord.contact_id) {
        db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(ord.contact_id, 'فاتورة من أوردر: '+invoice_no+' — '+total+' ج.م');
      }

      return invInserted;
    })();

    res.json({ ok: true, invoice_id: invId, invoice_no });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/orders/:id/to-production
router.post('/orders/:id/to-production', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { production_notes, production_supplier, production_due_date } = req.body;
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'not found' });
    db.prepare(`UPDATE sys_orders SET status='in_production', production_notes=COALESCE(?,production_notes),
      production_supplier=COALESCE(?,production_supplier), production_due_date=COALESCE(?,production_due_date),
      updated_at=datetime('now') WHERE id=?`).run(production_notes||null, production_supplier||null, production_due_date||null, ord.id);
    db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'in_production', 'تم إرساله للإنتاج'+(production_supplier?' — '+production_supplier:''));
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/orders/:id/ready
router.post('/orders/:id/ready', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(req.params.id);
    if (!ord) return res.json({ ok: false, error: 'not found' });
    db.prepare("UPDATE sys_orders SET status='ready', updated_at=datetime('now') WHERE id=?").run(ord.id);
    db.prepare('INSERT INTO sys_order_logs (order_id,status,note) VALUES (?,?,?)').run(ord.id, 'ready', 'جاهز للشحن');
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/suppliers/:id/link-person
router.post('/suppliers/:id/link-person', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { person_id } = req.body;
    db.prepare('UPDATE sys_suppliers SET person_id=? WHERE id=?').run(person_id, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


module.exports = router;
