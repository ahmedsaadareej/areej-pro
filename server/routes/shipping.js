'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
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


module.exports = router;
