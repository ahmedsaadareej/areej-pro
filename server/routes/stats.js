'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
// ============================================================
// STATS
// ============================================================

router.get('/stats', (req, res) => {
    const db = req.db;
    try {
    const total_products = db.prepare('SELECT COUNT(*) as n FROM sys_products').get().n;
    const low_stock = db.prepare('SELECT COUNT(*) as n FROM sys_products WHERE stock_qty <= low_stock_at AND low_stock_at > 0').get().n;
    const stock_value = db.prepare('SELECT COALESCE(SUM(stock_qty * cost_price),0) as v FROM sys_products').get().v;
    const potential_revenue = db.prepare('SELECT COALESCE(SUM(stock_qty * sell_price),0) as v FROM sys_products').get().v;
    const categories = db.prepare('SELECT category, COUNT(*) as n FROM sys_products WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC').all();
    const recent_moves = db.prepare(`
      SELECT m.*, p.name as product_name FROM sys_stock_moves m
      JOIN sys_products p ON p.id=m.product_id
      ORDER BY m.created_at DESC LIMIT 10
    `).all();

    res.json({ ok: true, data: {
      total_products, low_stock,
      stock_value: +stock_value.toFixed(2),
      potential_revenue: +potential_revenue.toFixed(2),
      estimated_profit: +(potential_revenue - stock_value).toFixed(2),
      categories, recent_moves
    }});
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// PRICING CALCULATOR — حاسبة التسعير
// ============================================================

// POST /api/system/pricing/calculate
router.post('/pricing/calculate', (req, res) => {
    const db = req.db;
    try {
    const {
      product_id,     // اختياري — يجيب تكلفة الشراء من المخزون
      cost_price,             // تكلفة الشراء/الإنتاج
      print_cost = 0,         // تكلفة الطباعة
      shipping_cost = 0, shipping = 0,  // shipping alias
      fixed_cost = 0,
      platform_fee = 0,       // عمولة المنصة %
      other_costs = 0,
      margin_percent,         // هامش الربح %
      target_margin,          // alias for margin_percent
      target_price            // عكسي: السعر → احسب الهامش
    } = req.body;
    // aliases
    const _margin  = margin_percent != null ? margin_percent : (target_margin != null ? target_margin : null);
    const _ship    = +shipping_cost || +shipping || 0;
    const _pfee    = +platform_fee || 0;

    let base_cost = +cost_price || 0;

    // لو product_id موجود — جيب التكلفة من المخزون
    if (product_id && !cost_price) {
      const p = db.prepare('SELECT cost_price FROM sys_products WHERE id=?').get(+product_id);
      if (p) base_cost = p.cost_price;
    }

    const total_cost = base_cost + +print_cost + _ship + +fixed_cost + +other_costs;
    // platform_fee is % of sell price — applied later

    let result = {};

    if (_margin != null) { const margin_percent = _margin;
      // احسب سعر البيع من الهامش
      const margin = +margin_percent / 100;
      // if platform_fee % → adjust denominator
      const pfee_factor = _pfee > 0 ? (1 - _pfee/100) : 1;
      const sell_price = total_cost / ((1 - margin) * pfee_factor);
      const profit = sell_price * pfee_factor - total_cost;
      result = {
        total_cost: +total_cost.toFixed(2),
        sell_price: +sell_price.toFixed(2),
        suggested_price: +sell_price.toFixed(2),
        profit: +profit.toFixed(2),
        margin_pct: +margin_percent,
        margin_percent: +margin_percent,
        breakeven_units: profit > 0 ? Math.ceil(total_cost / profit) : 0
      };
    } else if (target_price != null) {
      // احسب الهامش من السعر
      const profit = +target_price - total_cost;
      const margin = total_cost > 0 ? (profit / +target_price) * 100 : 0;
      result = {
        total_cost: +total_cost.toFixed(2),
        sell_price: +target_price,
        profit: +profit.toFixed(2),
        margin_percent: +margin.toFixed(1),
        is_profitable: profit > 0
      };
    } else {
      return res.status(400).json({ ok: false, error: 'مطلوب margin_percent أو target_price' });
    }

    res.json({ ok: true, data: result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


module.exports = router;
