'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
// ============================================================
// AFFILIATES
// ============================================================

// GET /api/system/affiliates
router.get('/affiliates', (req, res) => {
    const db = req.db;
    try {
    const rows = db.prepare(`
      SELECT a.*,
        COUNT(ao.id) as order_count,
        COALESCE(SUM(ao.order_total),0) as total_sales,
        COALESCE(SUM(ao.commission_amount),0) as total_commission,
        COALESCE(SUM(CASE WHEN ao.status='pending' THEN ao.commission_amount ELSE 0 END),0) as pending_commission
      FROM sys_affiliates a
      LEFT JOIN sys_affiliate_orders ao ON ao.affiliate_id=a.id
      GROUP BY a.id ORDER BY total_sales DESC
    `).all();
    const stats = {
      total: rows.length,
      active: rows.filter(r=>r.status==='active').length,
      total_sales: rows.reduce((s,r)=>s+r.total_sales,0),
      pending_commission: rows.reduce((s,r)=>s+r.pending_commission,0)
    };
    res.json({ ok:true, data:rows, stats });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/affiliates/stats/summary
router.get('/affiliates/stats/summary', (req, res) => {
    const db = req.db;
    try {
    const rows = db.prepare(`SELECT CASE WHEN a.active=1 THEN 'active' ELSE 'inactive' END as status, COUNT(*) as n, COALESCE(SUM(ao.commission_amount),0) as commission
      FROM sys_affiliates a LEFT JOIN sys_affiliate_orders ao ON ao.affiliate_id=a.id AND ao.status='pending'
      GROUP BY status`).all();
    const active = rows.find(r=>r.status==='active')?.n || 0;
    const pending_comm = rows.reduce((s,r)=>s+r.commission,0);
    const total_sales = db.prepare("SELECT COALESCE(SUM(order_total),0) as s FROM sys_affiliate_orders").get().s;
    res.json({ ok:true, data: { active, pending_comm, total_sales } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/affiliates
router.post('/affiliates', (req, res) => {
    const db = req.db;
    try {
    const { name, whatsapp, email, city, commission_rate=10, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok:false, error:'اسم الموزع مطلوب' });
    const r = db.prepare('INSERT INTO sys_affiliates (name,whatsapp,email,city,commission_rate,notes) VALUES (?,?,?,?,?,?)').run(name.trim(),whatsapp||null,email||null,city||null,+commission_rate||10,notes||null);
    res.json({ ok:true, id:r.lastInsertRowid, data:{id:r.lastInsertRowid} });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/affiliates/:id
router.put('/affiliates/:id', (req, res) => {
    const db = req.db;
    try {
    const { name, whatsapp, email, city, commission_rate, status, notes } = req.body;
    db.prepare('UPDATE sys_affiliates SET name=COALESCE(?,name), whatsapp=COALESCE(?,whatsapp), email=COALESCE(?,email), city=COALESCE(?,city), commission_rate=COALESCE(?,commission_rate), status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?')
      .run(name||null,whatsapp||null,email||null,city||null,commission_rate!=null?+commission_rate:null,status||null,notes||null,req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/affiliates/:id/orders
router.get('/affiliates/:id/orders', (req, res) => {
    const db = req.db;
    try {
    const aff = db.prepare('SELECT * FROM sys_affiliates WHERE id=?').get(req.params.id);
    if (!aff) return res.status(404).json({ ok:false, error:'Not found' });
    const orders = db.prepare('SELECT ao.*, o.order_no FROM sys_affiliate_orders ao LEFT JOIN sys_orders o ON o.id=ao.order_id WHERE ao.affiliate_id=? ORDER BY ao.created_at DESC').all(req.params.id);
    res.json({ ok:true, affiliate:aff, data:orders });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/affiliates/:id/orders
router.post('/affiliates/:id/orders', (req, res) => {
    const db = req.db;
    try {
    const aff = db.prepare('SELECT * FROM sys_affiliates WHERE id=?').get(req.params.id);
    if (!aff) return res.status(404).json({ ok:false, error:'Not found' });
    const { amount=0, commission_rate, order_id } = req.body;
    let { description } = req.body;
    // auto-generate description from order if not provided
    if (!description?.trim() && order_id) {
      const ord = db.prepare('SELECT * FROM sys_orders WHERE id=?').get(order_id);
      description = ord ? 'طلب ' + ord.order_no + ' — ' + (ord.client_name||'') : 'طلب #' + order_id;
    }
    if (!description?.trim()) description = 'طلب موزع';
    const pct = commission_rate != null ? +commission_rate : aff.commission_rate;
    const commission = (+amount * pct / 100);
    const r = db.prepare('INSERT INTO sys_affiliate_orders (affiliate_id,order_id,description,amount,commission) VALUES (?,?,?,?,?)').run(+req.params.id, order_id||null, description.trim(), +amount, commission);
    res.json({ ok:true, id:r.lastInsertRowid, commission });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/affiliate-orders/:id/status
router.put('/affiliate-orders/:id/status', (req, res) => {
    const db = req.db;
    try {
    const { status } = req.body;
    const extra = status==='paid' ? ", paid_at=datetime('now')" : '';
    db.prepare('UPDATE sys_affiliate_orders SET status=?'+extra+' WHERE id=?').run(status, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});


module.exports = router;
