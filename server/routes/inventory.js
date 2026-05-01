/**
 * Inventory Routes — /api/system/products, /api/system/categories, /api/system/stock
 * Mounted via routes-system.js → router.use('/', inventoryRoutes)
 */
'use strict';
const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const { requireAuth } = require('../auth-middleware');
const { validate, assertId } = require('../middleware/validate');

// Product image upload
// Allowed image extensions for product uploads
const ALLOWED_IMG_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const ALLOWED_IMG_MIME = /^image\/(jpeg|png|gif|webp|svg\+xml)$/i;

const prodImgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id || 'shared';
    const dir = path.join(__dirname, '../../public/uploads/products', String(userId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'prod_' + Date.now() + '-' + Math.random().toString(36).slice(2,6) + ext);
  }
});
const prodUpload = multer({
  storage: prodImgStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG_EXT.test(file.originalname) && ALLOWED_IMG_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح — يُسمح بالصور فقط (jpg, png, gif, webp)'));
    }
  }
});


// GET /api/system/products
router.get('/products', (req, res) => {
    const db = req.db;
    try {
    const { search, category, low_stock } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (name LIKE ? OR sku LIKE ?)'; const s='%'+search+'%'; params.push(s,s); }
    if (category) { where += ' AND category=?'; params.push(category); }
    if (low_stock === '1') { where += ' AND stock_qty <= low_stock_at AND low_stock_at > 0'; }

    const products = db.prepare(`SELECT * FROM sys_products ${where} ORDER BY name ASC`).all(...params);

    // حساب قيمة المخزون لكل منتج
    const enriched = products.map(p => ({
      ...p,
      stock_value: +(p.stock_qty * p.cost_price).toFixed(2),
      potential_revenue: +(p.stock_qty * p.sell_price).toFixed(2),
      is_low_stock: p.stock_qty <= p.low_stock_at && p.low_stock_at > 0
    }));

    const total_value = enriched.reduce((s, p) => s + p.stock_value, 0);
    res.json({ ok: true, data: enriched, total_value: +total_value.toFixed(2) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/system/products/:id
router.get('/products/:id', (req, res) => {
    const db = req.db;
    try {
    const p = db.prepare('SELECT * FROM sys_products WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
    const moves = db.prepare(`
      SELECT m.*,
        CASE WHEN m.ref_type='invoice' THEN (SELECT invoice_no FROM sys_invoices WHERE id=m.ref_id) END as invoice_no,
        CASE WHEN m.ref_type='po'      THEN (SELECT po_no FROM sys_purchase_orders WHERE id=m.ref_id) END as po_no
      FROM sys_stock_moves m
      WHERE m.product_id=? ORDER BY m.created_at DESC LIMIT 100
    `).all(p.id);
    res.json({ ok: true, data: { ...p, moves } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/products
router.post('/products', (req, res) => {
    const db = req.db;
    try {
    // ── Validation ──
    const body = validate(req.body, {
      name:        { required: true, type: 'string', maxLen: 300, label: 'اسم المنتج' },
      sku:         { type: 'string', maxLen: 100 },
      cost_price:  { type: 'number', min: 0 },
      sell_price:  { type: 'number', min: 0 },
      stock_qty:   { type: 'number', min: 0 },
      low_stock_at:{ type: 'number', min: 0 },
    });
    const { name, sku, category, unit='قطعة', cost_price=0, sell_price=0, stock_qty=0, low_stock_at=5, notes } = { ...req.body, ...body };
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'اسم المنتج مطلوب' });

    const ins = db.prepare(`
      INSERT INTO sys_products (name, sku, category, unit, cost_price, sell_price, stock_qty, low_stock_at, notes)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(name.trim(), sku||null, category||null, unit, +cost_price, +sell_price, +stock_qty, +low_stock_at, notes||null);

    // سجّل حركة الكمية الأولية
    if (+stock_qty > 0) {
      db.prepare(`INSERT INTO sys_stock_moves (product_id, type, qty, unit_cost, ref_type, notes)
        VALUES (?,?,?,?,'manual','رصيد أولي')`).run(ins.lastInsertRowid, 'in', +stock_qty, +cost_price);
    }

    res.json({ ok: true, id: ins.lastInsertRowid, data: { id: ins.lastInsertRowid } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/system/products/:id
router.put('/products/:id', (req, res) => {
    const db = req.db;
    try {
    const { name, sku, category, unit, cost_price, sell_price, low_stock_at, notes } = req.body;
    db.prepare(`
      UPDATE sys_products SET
        name=COALESCE(?,name), sku=COALESCE(?,sku), category=COALESCE(?,category),
        unit=COALESCE(?,unit), cost_price=COALESCE(?,cost_price), sell_price=COALESCE(?,sell_price),
        low_stock_at=COALESCE(?,low_stock_at), notes=COALESCE(?,notes)
      WHERE id=?
    `).run(name,sku,category,unit,cost_price!=null?+cost_price:null,sell_price!=null?+sell_price:null,low_stock_at!=null?+low_stock_at:null,notes,req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/system/products/:id
router.delete('/products/:id', (req, res) => {
    const db = req.db;
    try {
    db.prepare('DELETE FROM sys_products WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// STOCK MOVES — شراء / بيع / تعديل
// ============================================================

// POST /api/system/products/:id/move
router.post('/products/:id/move', (req, res) => {
    const db = req.db;
    try {
    const { type, qty, unit_cost, notes, ref_type, ref_id } = req.body;
    if (!['in','out','adjust','return'].includes(type)) return res.status(400).json({ ok: false, error: 'نوع الحركة غير صحيح' });
    if (!qty || +qty <= 0) return res.status(400).json({ ok: false, error: 'الكمية يجب أن تكون أكبر من صفر' });

    const pid = +req.params.id;
    const product = db.prepare('SELECT * FROM sys_products WHERE id=?').get(pid);
    if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });

    // حساب الكمية الجديدة
    let newQty = product.stock_qty;
    if (type === 'in' || type === 'return') newQty += +qty;
    else if (type === 'out') newQty -= +qty;
    else if (type === 'adjust') newQty = +qty; // تعديل مباشر

    if (newQty < 0) return res.status(400).json({ ok: false, error: 'الكمية المطلوبة أكبر من المخزون المتاح' });

    db.transaction(() => {
      db.prepare(`INSERT INTO sys_stock_moves (product_id, type, qty, unit_cost, ref_type, ref_id, notes)
        VALUES (?,?,?,?,?,?,?)`).run(pid, type, +qty, unit_cost ? +unit_cost : product.cost_price, ref_type||'manual', ref_id||null, notes||null);
      db.prepare("UPDATE sys_products SET stock_qty=? WHERE id=?").run(newQty, pid);

      // لو شراء وعنده تكلفة جديدة — حدّث الـ cost_price
      if (type === 'in' && unit_cost) {
        db.prepare("UPDATE sys_products SET cost_price=? WHERE id=?").run(+unit_cost, pid);
      }
    })();

    res.json({ ok: true, new_qty: newQty });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
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

// ── Product Image Upload ──
router.post('/products/:id/image', prodUpload.single('image'), (req, res) => {
  const db = req.db;
  try {
    if (!req.file) return res.json({ ok: false, error: 'no file' });
    const url = '/uploads/products/' + req.file.filename;
    db.prepare('UPDATE sys_products SET image_url=? WHERE id=?').run(url, req.params.id);
    res.json({ ok: true, url });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
