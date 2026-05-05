/**
 * System Routes — /api/system/*
 * ══════════════════════════════════════════════════════
 * Multi-tenant: كل request بيجيب db الخاصة بالـ user من JWT
 * 
 * ♻️ Phase 3 Refactor: الـ routes اتقسمت لملفات منفصلة في routes/
 * كل ملف مسؤول عن domain محدد — سهل التعديل والتطوير.
 * ══════════════════════════════════════════════════════
 */
'use strict';
const express = require('express');
const router  = express.Router();
const { getTenantDb } = require('./db-tenant');
const { requireAuth } = require('./auth-middleware');

// ── Middleware: Auth + Tenant DB injection ──────────────────────────────
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

// ── Route Modules ───────────────────────────────────────────────────────
// كل ملف = domain مستقل — لتعديل موديول: افتح الملف الخاص به فقط

router.use('/', require('./routes/inventory'));    // /products, /categories, /stock
router.use('/', require('./routes/team-settings')); // /team/*
router.use('/', require('./routes/stats'));        // /stats, /pricing
router.use('/', require('./routes/invoices'));     // /invoices
router.use('/', require('./routes/contracts'));    // /contracts
router.use('/', require('./routes/dashboard'));    // /dashboard
router.use('/', require('./routes/affiliates'));   // /affiliates
router.use('/', require('./routes/followup'));     // /followup
router.use('/', require('./routes/orders'));       // /orders, /suppliers, /purchase-orders
router.use('/', require('./routes/treasury'));     // /wallets, /transactions, /notifications
router.use('/', require('./routes/shipping'));     // /shipping
router.use('/', require('./routes/sales-tools'));         // /payment-links, /order-forms, /orders/:id/to-invoice
router.use('/', require('./routes/payment-gateways'));    // /payment-gateways
router.use('/', require('./routes/marketplace'));   // /marketplace/*
router.use('/', require('./routes/inbox'));        // /inbox/* (v3 — pending deprecation)

// ── Settings / Profile (صغيرة — تبقى هنا) ─────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    let s = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get();
    if (!s) { db.prepare('INSERT OR IGNORE INTO tenant_profile (id) VALUES (1)').run(); s = db.prepare('SELECT * FROM tenant_profile WHERE id=1').get(); }
    // also get brand from master
    const master = require('./db-master');
    const owner = master.prepare('SELECT brand_color, logo_url, company_name FROM users WHERE id=?').get(req.user.id);
    res.json({ ok: true, settings: { ...s, brand_color: s?.brand_color || owner?.brand_color || '#1B5E30', logo_url: s?.logo_url || owner?.logo_url } });
  } catch(e) { res.json({ ok: true, settings: {} }); }
});

router.post('/settings', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const allowed = ['company_name','company_name_en','logo_url','brand_color','address','phone','email','website','tax_number','commercial_reg','invoice_notes'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.json({ ok: false, error: 'no valid fields' });
    const sets = fields.map(f => `${f}=?`).join(',');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE tenant_profile SET ${sets}, updated_at=datetime('now') WHERE id=1`).run(...vals);
    // sync brand_color to master users table
    if (req.body.brand_color) {
      const master = require('./db-master');
      master.prepare('UPDATE users SET brand_color=? WHERE id=?').run(req.body.brand_color, req.user.id);
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── Exports ─────────────────────────────────────────────────────────────
const { publicOrderRouter } = require('./routes/orders');
module.exports = router;
module.exports.publicOrderRouter = publicOrderRouter;
