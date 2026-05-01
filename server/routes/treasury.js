'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
const { requirePerm } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
// ============================================================
// TREASURY — الخزينة
// ============================================================

// GET /api/system/wallets
router.get('/wallets', (req, res) => {
    const db = req.db;
    try {
    const wallets = db.prepare(`
      SELECT w.*,
        COALESCE((SELECT SUM(
            CASE
              WHEN t.type='in'                              THEN  t.amount   -- وارد: يزيد
              WHEN t.type='out'                             THEN -t.amount   -- صادر: ينقص
              WHEN t.type='transfer' AND t.wallet_id=w.id  THEN -t.amount   -- تحويل خارج: ينقص
              ELSE 0
            END)
          FROM sys_transactions t WHERE t.wallet_id=w.id),0)
        +
        COALESCE((SELECT SUM(t.amount)                                       -- تحويل داخل: يزيد
          FROM sys_transactions t WHERE t.wallet_to_id=w.id AND t.type='transfer'),0)
        as computed_balance
      FROM sys_wallets w WHERE w.active=1 ORDER BY w.id
    `).all();
    // update stored balance
    const upd = db.prepare('UPDATE sys_wallets SET balance=? WHERE id=?');
    wallets.forEach(w => upd.run(w.computed_balance, w.id));
    res.json({ ok: true, data: wallets });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/wallets
router.post('/wallets', (req, res) => {
    const db = req.db;
    try {
    const { name, type='cash', color='#1B5E30', icon='💰', notes } = req.body;
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    const r = db.prepare('INSERT INTO sys_wallets (name,type,color,icon,notes) VALUES (?,?,?,?,?)').run(name,type,color,icon,notes||null);
    res.json({ ok:true, data: { id: r.lastInsertRowid } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/wallets/:id
router.put('/wallets/:id', (req, res) => {
    const db = req.db;
    try {
    const { name, color, icon, notes, active } = req.body;
    db.prepare('UPDATE sys_wallets SET name=COALESCE(?,name), color=COALESCE(?,color), icon=COALESCE(?,icon), notes=COALESCE(?,notes), active=COALESCE(?,active) WHERE id=?')
      .run(name||null, color||null, icon||null, notes||null, active!=null?active:null, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/wallets/summary — dashboard totals
router.get('/wallets/summary', (req, res) => {
    const db = req.db;
    try {
    const wallets = db.prepare(`
      SELECT w.id, w.name, w.type, NULL as icon, NULL as color,
        COALESCE(SUM(CASE WHEN t.type='in' THEN t.amount WHEN t.type='out' THEN -t.amount
                         WHEN t.type='transfer' AND t.wallet_id=w.id THEN -t.amount
                         WHEN t.type='transfer' AND t.wallet_to_id=w.id THEN t.amount ELSE 0 END),0) as balance
      FROM sys_wallets w LEFT JOIN sys_transactions t ON (t.wallet_id=w.id OR t.wallet_to_id=w.id)
      WHERE w.active=1 GROUP BY w.id ORDER BY w.id
    `).all();
    const liquid = wallets.filter(w=>['cash','ewallet','bank'].includes(w.type)).reduce((s,w)=>s+w.balance,0);
    const receivable = wallets.filter(w=>['shipping_co','receivable'].includes(w.type)).reduce((s,w)=>s+w.balance,0);
    const payable = Math.abs(wallets.filter(w=>w.type==='payable').reduce((s,w)=>s+w.balance,0));
    res.json({ ok:true, data: { wallets, liquid, receivable, payable, net: liquid+receivable-payable } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/transactions
router.get('/transactions', (req, res) => {
    const db = req.db;
    try {
    const { wallet_id, type, from, to, limit=50, page=1, category } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (wallet_id) { where += ' AND (t.wallet_id=? OR t.wallet_to_id=?)'; params.push(wallet_id, wallet_id); }
    if (type)      { where += ' AND t.type=?'; params.push(type); }
    if (from)      { where += ' AND t.date>=?'; params.push(from); }
    if (to)        { where += ' AND t.date<=?'; params.push(to); }
    if (category)  { where += ' AND t.category=?'; params.push(category); }
    const offset = (parseInt(page)-1)*parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as n FROM sys_transactions t ${where}`).get(...params).n;
    const rows = db.prepare(`
      SELECT t.*, w.name as wallet_name, NULL as wallet_icon, w2.name as wallet_to_name
      FROM sys_transactions t
      LEFT JOIN sys_wallets w ON w.id=t.wallet_id
      LEFT JOIN sys_wallets w2 ON w2.id=t.wallet_to_id
      ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ ok:true, data: rows, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/transactions
router.post('/transactions', (req, res) => {
    const db = req.db;
    try {
    // ── Validation ──
    const body = validate(req.body, {
      type:        { required: true, enum: ['in','out','transfer'], label: 'نوع المعاملة' },
      amount:      { required: true, type: 'number', min: 0.01, label: 'المبلغ' },
      wallet_id:   { required: true, type: 'int', min: 1, label: 'المحفظة' },
      description: { required: true, type: 'string', maxLen: 500, label: 'الوصف' },
      category:    { type: 'string', maxLen: 100 },
      notes:       { type: 'string', maxLen: 1000 },
    });
    const { date, type, amount, wallet_id, wallet_to_id, description, ref_type, ref_id, category, notes } = { ...req.body, ...body };
    if (!type || !amount || !wallet_id || !description) return res.status(400).json({ ok:false, error:'missing fields' });
    if (type==='transfer' && !wallet_to_id) return res.status(400).json({ ok:false, error:'wallet_to_id required for transfer' });
    const r = db.prepare(`INSERT INTO sys_transactions (date,type,amount,wallet_id,wallet_to_id,description,category,notes,ref_type,ref_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(date||null, type, parseFloat(amount), wallet_id, wallet_to_id||null, description, category||null, notes||null, ref_type||null, ref_id||null);
    // update wallet balance
    db.prepare("UPDATE sys_wallets SET balance=balance+? WHERE id=?")
      .run(type==='in' ? parseFloat(amount) : -parseFloat(amount), wallet_id);
    if (type==='transfer' && wallet_to_id) {
      db.prepare("UPDATE sys_wallets SET balance=balance+? WHERE id=?")
        .run(parseFloat(amount), wallet_to_id);
    }
    res.json({ ok:true, data: { id: r.lastInsertRowid } });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// DELETE /api/system/transactions/:id
router.delete('/transactions/:id', (req, res) => {
    const db = req.db;
    try {
    db.prepare('DELETE FROM sys_transactions WHERE id=?').run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/transactions/stats/categories — مصروفات بالتصنيف
router.get('/transactions/stats/categories', (req, res) => {
    const db = req.db;
    try {
    const { from, to, type = 'out' } = req.query;
    let where = "WHERE t.type=?";
    const params = [type];
    if (from) { where += ' AND t.date>=?'; params.push(from); }
    if (to)   { where += ' AND t.date<=?'; params.push(to); }
    const rows = db.prepare(`
      SELECT COALESCE(t.category,'غير مصنّف') as category,
        COUNT(*) as count,
        COALESCE(SUM(t.amount),0) as total
      FROM sys_transactions t
      ${where}
      GROUP BY category ORDER BY total DESC
    `).all(...params);
    const grand = rows.reduce((s,r)=>s+r.total, 0);
    res.json({ ok:true, data: rows, grand_total: grand });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/transactions/stats/monthly — trend آخر 6 شهور
router.get('/transactions/stats/monthly', (req, res) => {
    const db = req.db;
    try {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', date) as month,
        COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE 0 END),0) as total_in,
        COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END),0) as total_out
      FROM sys_transactions
      WHERE date >= date('now','-6 months')
      GROUP BY month ORDER BY month
    `).all();
    res.json({ ok:true, data: rows });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ============================================================
// NOTIFICATIONS
// ============================================================
router.get('/notifications', requireAuth, (req, res) => {
  const db = req.tenantDb;
  try {
    const rows = db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`).all();
    const unread = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE is_read=0`).get().c;
    res.json({ ok:true, notifications: rows, unread });
  } catch(e) { res.json({ ok:true, notifications:[], unread:0 }); }
});

router.post('/notifications/read/:id', requireAuth, (req, res) => {
  const db = req.tenantDb;
  try {
    db.prepare(`UPDATE notifications SET is_read=1 WHERE id=?`).run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false }); }
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  const db = req.tenantDb;
  try {
    db.prepare(`UPDATE notifications SET is_read=1`).run();
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false }); }
});


module.exports = router;
