'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
// ============================================================
// CENTRAL DASHBOARD
// ============================================================

router.get('/dashboard', (req, res) => {
    const db = req.db;
    try {
    // — المخزون
    const inv = db.prepare('SELECT COUNT(*) as total_products, COALESCE(SUM(sell_price*stock_qty),0) as stock_value, COALESCE(SUM(CASE WHEN stock_qty<=low_stock_at THEN 1 ELSE 0 END),0) as low_stock FROM sys_products').get();

    // — الفواتير
    const invStats = db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0) as paid_revenue, COALESCE(SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END),0) as drafts FROM sys_invoices").get();
    const monthRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM sys_invoices WHERE status='paid' AND paid_at >= datetime('now','start of month')").get().s;

    // — الطلبات
    const ordStats = db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='new' THEN 1 ELSE 0 END),0) as new_orders, COALESCE(SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END),0) as shipped, COALESCE(SUM(CASE WHEN status='delivered' THEN total ELSE 0 END),0) as delivered_revenue FROM sys_orders").get();

    // — CRM
    const crmStats = db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='client' OR status='vip' THEN 1 ELSE 0 END),0) as clients, COALESCE(SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END),0) as new_month FROM crm_contacts").get();

    // — الموردين
    const supStats = db.prepare('SELECT COUNT(*) as total_suppliers, COALESCE(SUM(CASE WHEN po.status=\'pending\' THEN 1 ELSE 0 END),0) as pending_po FROM sys_suppliers LEFT JOIN sys_purchase_orders po ON po.supplier_id=sys_suppliers.id').get();

    // — الموزعين
    const affStats = db.prepare("SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN a.active=1 THEN 1 ELSE 0 END),0) as active, COALESCE(SUM(CASE WHEN ao.status='pending' THEN ao.commission_amount ELSE 0 END),0) as pending_comm FROM sys_affiliates a LEFT JOIN sys_affiliate_orders ao ON ao.affiliate_id=a.id").get();

    // — آخر 5 طلبات
    const recentOrders = db.prepare("SELECT o.*, i.invoice_no FROM sys_orders o LEFT JOIN sys_invoices i ON i.id=o.invoice_id ORDER BY o.created_at DESC LIMIT 5").all();

    // — أفضل 5 عملاء
    const topClients = db.prepare("SELECT c.name, c.phone, c.status, COUNT(o.id) as order_count, COALESCE(SUM(o.total),0) as total_spent FROM crm_contacts c LEFT JOIN sys_orders o ON o.contact_id=c.id GROUP BY c.id HAVING order_count>0 ORDER BY total_spent DESC LIMIT 5").all();

    // — مخزون منخفض
    const lowStock = db.prepare('SELECT name, stock_qty, low_stock_at, sell_price FROM sys_products WHERE stock_qty<=low_stock_at AND stock_qty>=0 ORDER BY stock_qty ASC LIMIT 5').all();

    // — متابعة مطلوبة
    const fupNeeded = db.prepare("SELECT COUNT(*) as n FROM sys_followup_logs WHERE status='pending' AND sent_at >= datetime('now','-1 day')").get().n;

    res.json({
      ok: true,
      data: {
        inventory: inv,
        invoices: { ...invStats, month_revenue: monthRevenue },
        orders: ordStats,
        crm: crmStats,
        suppliers: supStats,
        affiliates: affStats,
        recent_orders: recentOrders,
        top_clients: topClients,
        low_stock: lowStock,
        followup_needed: fupNeeded
      }
    });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});


module.exports = router;
