/**
 * Persons Routes — /api/persons/*
 * جدول موحد للعملاء والموردين
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth-middleware');

// GET /api/persons — list
router.get('/', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { role, search, status, page=1, limit=50 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (role === 'client')   { where += " AND roles IN ('client','both')"; }
    if (role === 'supplier') { where += " AND roles IN ('supplier','both')"; }
    if (status) { where += ' AND status=?'; params.push(status); }
    if (search) {
      where += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      params.push('%'+search+'%','%'+search+'%','%'+search+'%');
    }
    const total = db.prepare(`SELECT COUNT(*) as c FROM persons ${where}`).get(...params).c;
    const offset = (parseInt(page)-1)*parseInt(limit);
    const rows = db.prepare(`SELECT * FROM persons ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    res.json({ ok: true, data: rows, total, page: parseInt(page) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/persons/search?q=xxx
router.get('/search', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const q = (req.query.q || '').trim();
    const role = req.query.role || '';
    if (q.length < 2) return res.json({ ok: true, persons: [] });
    let where = 'WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const params = ['%'+q+'%','%'+q+'%','%'+q+'%'];
    if (role === 'client')   { where += " AND roles IN ('client','both')"; }
    if (role === 'supplier') { where += " AND roles IN ('supplier','both')"; }
    const rows = db.prepare(`SELECT id,name,phone,phone_code,email,city,governorate,country,address,roles,status,client_balance,supplier_balance FROM persons ${where} ORDER BY CASE WHEN phone LIKE ? THEN 0 ELSE 1 END, name ASC LIMIT 8`).all(...params, '%'+q+'%');
    res.json({ ok: true, persons: rows });
  } catch(e) { res.json({ ok: true, persons: [] }); }
});

// GET /api/persons/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const p = db.prepare('SELECT * FROM persons WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'not found' });
    // Invoices
    const invoices = db.prepare('SELECT * FROM sys_invoices WHERE contact_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
    // Orders
    const orders = db.prepare('SELECT * FROM sys_orders WHERE contact_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
    // Purchase orders (as supplier)
    const pos = p.legacy_supplier_id
      ? db.prepare('SELECT * FROM sys_purchase_orders WHERE supplier_id=? ORDER BY created_at DESC LIMIT 20').all(p.legacy_supplier_id)
      : [];
    // Notes
    const notes = db.prepare('SELECT * FROM crm_notes WHERE contact_id=? ORDER BY created_at DESC LIMIT 30').all(req.params.id);
    // Net balance
    const netBalance = (p.client_balance || 0) - (p.supplier_balance || 0);
    res.json({ ok: true, person: { ...p, invoices, orders, purchase_orders: pos, notes, net_balance: netBalance } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/persons — create
router.post('/', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { name, phone, phone_code, email, country, governorate, city, address,
            roles='client', status='lead', source='manual', niche, notes,
            supplier_products, supplier_category } = req.body;
    if (!name?.trim()) return res.json({ ok: false, error: 'الاسم مطلوب' });
    const phoneVal = phone || null;
    if (phoneVal) {
      const existing = db.prepare('SELECT id, name, roles FROM persons WHERE phone=?').get(phoneVal);
      if (existing) {
        // لو موجود وعايز نضيفه كـ both
        if (roles === 'both' || (existing.roles === 'client' && roles === 'supplier') || (existing.roles === 'supplier' && roles === 'client')) {
          db.prepare('UPDATE persons SET roles=\'both\', supplier_products=COALESCE(?,supplier_products), supplier_category=COALESCE(?,supplier_category), updated_at=datetime(\'now\') WHERE id=?')
            .run(supplier_products||null, supplier_category||null, existing.id);
          return res.json({ ok: true, id: existing.id, merged: true });
        }
        return res.status(409).json({ ok: false, error: 'هذا الرقم مسجّل بالفعل لـ ' + existing.name, existing_id: existing.id, existing_name: existing.name });
      }
    }
    const r = db.prepare(`INSERT INTO persons (name,phone,phone_code,email,country,governorate,city,address,roles,status,source,niche,notes,supplier_products,supplier_category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name.trim(),phoneVal,phone_code||'+20',email||null,country||'EG',governorate||null,city||null,address||null,roles,status,source,niche||null,notes||null,supplier_products||null,supplier_category||null);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ ok: false, error: 'رقم التليفون مسجّل مسبقاً' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/persons/:id
router.put('/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const fields = ['name','phone','phone_code','email','country','governorate','city','address','roles','status','niche','notes','supplier_products','supplier_category','supplier_rating'];
    const updates = fields.map(f => `${f}=COALESCE(?,${f})`).join(', ');
    const vals = fields.map(f => req.body[f] !== undefined ? req.body[f] : null);
    db.prepare(`UPDATE persons SET ${updates}, updated_at=datetime('now') WHERE id=?`).run(...vals, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/persons/:id/payment — تسجيل دفعة
router.post('/:id/payment', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { amount, direction, wallet_id, payment_method, notes } = req.body;
    // direction: 'in' = وارد (دفع العميل لنا) | 'out' = صادر (دفعنا للمورد)
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'المبلغ مطلوب' });
    if (!direction) return res.json({ ok: false, error: 'direction required (in/out)' });
    const person = db.prepare('SELECT * FROM persons WHERE id=?').get(req.params.id);
    if (!person) return res.json({ ok: false, error: 'not found' });
    db.transaction(() => {
      if (direction === 'in') {
        // دفع وارد: العميل دفع لنا
        db.prepare('UPDATE persons SET client_balance=MAX(0,COALESCE(client_balance,0)-?), total_paid=COALESCE(total_paid,0)+? WHERE id=?').run(parseFloat(amount), parseFloat(amount), person.id);
      } else {
        // دفع صادر: دفعنا للمورد
        db.prepare('UPDATE persons SET supplier_balance=MAX(0,COALESCE(supplier_balance,0)-?) WHERE id=?').run(parseFloat(amount), person.id);
      }
      // تسجيل في الخزينة
      const targetWallet = wallet_id
        ? db.prepare('SELECT id FROM sys_wallets WHERE id=?').get(wallet_id)
        : db.prepare("SELECT id FROM sys_wallets WHERE type='cash' LIMIT 1").get();
      if (targetWallet) {
        const txType = direction === 'in' ? 'in' : 'out';
        const desc = direction === 'in'
          ? 'دفعة من ' + person.name + (payment_method ? ' — ' + payment_method : '')
          : 'دفع لمورد: ' + person.name + (payment_method ? ' — ' + payment_method : '');
        db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,description,date) VALUES (?,?,?,?,date('now'))`).run(targetWallet.id, txType, parseFloat(amount), desc);
        db.prepare('UPDATE sys_wallets SET balance=balance+? WHERE id=?').run(direction==='in'?parseFloat(amount):-parseFloat(amount), targetWallet.id);
      }
      // Note
      if (person.legacy_contact_id || person.roles !== 'supplier') {
        try {
          const cid = person.legacy_contact_id || person.id;
          db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(cid, (direction==='in'?'💰 دفعة مستلمة: ':'💸 دفعة مدفوعة: ') + parseFloat(amount).toLocaleString() + ' ج.م' + (payment_method?' — '+payment_method:''));
        } catch(e) { console.error('[routes-persons.js]', e.message); }
      }
    })();
    const updated = db.prepare('SELECT client_balance,supplier_balance FROM persons WHERE id=?').get(person.id);
    const net = (updated.client_balance||0) - (updated.supplier_balance||0);
    res.json({ ok: true, client_balance: updated.client_balance, supplier_balance: updated.supplier_balance, net_balance: net });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE /api/persons/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM persons WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
