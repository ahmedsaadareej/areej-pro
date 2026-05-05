/**
 * Marketplace Routes — /api/system/marketplace/*
 * آخر تحديث: 2026-05-05 (A3-P2: نُقلت من routes/inbox.js)
 *
 * يعمل على master DB (مش tenant) — الـ marketplace مشترك بين الكل
 */
'use strict';
const express       = require('express');
const router        = express.Router();
const { requireAuth } = require('../auth-middleware');
const master        = require('../db-master');

// GET /api/system/marketplace/suppliers
router.get('/marketplace/suppliers', requireAuth, (req, res) => {
  try {
    const { region, product, search, page = 1 } = req.query;
    let q = `SELECT * FROM marketplace_suppliers WHERE status='approved'`;
    const params = [];
    if (region) { q += ` AND regions LIKE ?`; params.push('%' + region + '%'); }
    if (product) { q += ` AND products LIKE ?`; params.push('%' + product + '%'); }
    if (search) { q += ` AND (name LIKE ? OR description LIKE ? OR products LIKE ?)`; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
    q += ` ORDER BY rating DESC, id ASC LIMIT 20 OFFSET ?`;
    params.push((parseInt(page)-1)*20);
    const rows = master.prepare(q).all(...params);
    const total = master.prepare(`SELECT COUNT(*) as c FROM marketplace_suppliers WHERE status='approved'`).get().c;
    res.json({ ok: true, suppliers: rows, total });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/marketplace/quote
router.post('/marketplace/quote', requireAuth, (req, res) => {
  try {
    const { supplier_id, product_type, quantity, specs, message } = req.body;
    if (!supplier_id || !product_type) return res.json({ ok: false, error: 'missing fields' });
    const supplier = master.prepare('SELECT * FROM marketplace_suppliers WHERE id=? AND status=?').get(supplier_id, 'approved');
    if (!supplier) return res.json({ ok: false, error: 'supplier not found' });
    const user = req.user;
    const r = master.prepare(`INSERT INTO marketplace_quotes (supplier_id, client_user_id, client_name, client_phone, product_type, quantity, specs, message) VALUES (?,?,?,?,?,?,?,?)`)
      .run(supplier_id, user.id, user.name, user.phone||'', product_type, quantity||0, specs||'', message||'');
    res.json({ ok: true, quote_id: r.lastInsertRowid, supplier_phone: supplier.phone, supplier_name: supplier.name });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/system/marketplace/rate
router.post('/marketplace/rate', requireAuth, (req, res) => {
  try {
    const { supplier_id, rating, comment } = req.body;
    if (!supplier_id || !rating) return res.json({ ok: false, error: 'missing fields' });
    const existing = master.prepare('SELECT id FROM marketplace_ratings WHERE supplier_id=? AND user_id=?').get(supplier_id, req.user.id);
    if (existing) {
      master.prepare('UPDATE marketplace_ratings SET rating=?, comment=? WHERE id=?').run(rating, comment||'', existing.id);
    } else {
      master.prepare('INSERT INTO marketplace_ratings (supplier_id, user_id, rating, comment) VALUES (?,?,?,?)').run(supplier_id, req.user.id, rating, comment||'');
    }
    const avg = master.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM marketplace_ratings WHERE supplier_id=?').get(supplier_id);
    master.prepare('UPDATE marketplace_suppliers SET rating=?, rating_count=? WHERE id=?').run(avg.avg||0, avg.cnt||0, supplier_id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/system/marketplace/my-quotes
router.get('/marketplace/my-quotes', requireAuth, (req, res) => {
  try {
    const quotes = master.prepare(`SELECT q.*, s.name as supplier_name, s.phone as supplier_phone FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id WHERE q.client_user_id=? ORDER BY q.created_at DESC LIMIT 20`).all(req.user.id);
    res.json({ ok: true, quotes });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── ADMIN ────────────────────────────────────────────────────────────────────
router.get('/marketplace/admin/suppliers', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const rows = master.prepare('SELECT * FROM marketplace_suppliers ORDER BY created_at DESC').all();
    res.json({ ok: true, suppliers: rows });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/marketplace/admin/approve/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    master.prepare('UPDATE marketplace_suppliers SET status=? WHERE id=?').run(req.body.status || 'approved', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/marketplace/admin/add', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const { name, phone, products, regions, price_range, description, commission_rate } = req.body;
    if (!name || !phone || !products) return res.json({ ok: false, error: 'missing fields' });
    const r = master.prepare('INSERT INTO marketplace_suppliers (name,phone,products,regions,price_range,description,commission_rate,status) VALUES (?,?,?,?,?,?,?,?)').run(name,phone,products,regions||'',price_range||'',description||'',commission_rate||3,'approved');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/marketplace/admin/suppliers/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    master.prepare('DELETE FROM marketplace_suppliers WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.get('/marketplace/admin/quotes', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const rows = master.prepare('SELECT q.*, s.name as supplier_name, s.commission_rate FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id ORDER BY q.created_at DESC LIMIT 50').all();
    const total_deals = master.prepare('SELECT SUM(deal_amount) as t FROM marketplace_quotes WHERE deal_amount > 0').get().t || 0;
    const total_commission = master.prepare('SELECT SUM(commission_amount) as t FROM marketplace_quotes WHERE commission_amount > 0').get().t || 0;
    res.json({ ok: true, quotes: rows, total_deals, total_commission });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.put('/marketplace/admin/quotes/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false });
  try {
    const { status, deal_amount } = req.body;
    const q = master.prepare('SELECT * FROM marketplace_quotes q JOIN marketplace_suppliers s ON s.id=q.supplier_id WHERE q.id=?').get(req.params.id);
    if (!q) return res.json({ ok: false, error: 'not found' });
    const commission = deal_amount ? (deal_amount * (q.commission_rate / 100)) : 0;
    master.prepare('UPDATE marketplace_quotes SET status=?, deal_amount=?, commission_amount=? WHERE id=?').run(status || q.status, deal_amount || q.deal_amount, commission, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
