/**
 * Public Routes — لا تحتاج auth
 * /pay/:token — صفحة دفع الزبون
 * /order-form/:token — فورم طلب الزبون
 * /api/public/order-form/:token — submit فورم
 * /api/public/pay/:token — بيانات لينك الدفع
 */
const express = require('express');
const router = express.Router();
const master = require('./db-master');
const { getTenantDb } = require('./db-tenant');
const crypto = require('crypto');

// Helper: ابحث عن العميل اللي عنده الـ token ده
function findTenantByPayToken(token) {
  const users = master.prepare('SELECT id FROM users WHERE status IN (?,?,?)').all('active','trial','expired');
  for (const u of users) {
    try {
      const db = getTenantDb(u.id);
      const link = db.prepare('SELECT * FROM payment_links WHERE token=?').get(token);
      if (link) return { db, userId: u.id, link };
    } catch(e) { console.error('[routes-public.js]', e.message); }
  }
  return null;
}

function findTenantByFormToken(token) {
  const users = master.prepare('SELECT id FROM users WHERE status IN (?,?,?)').all('active','trial','expired');
  for (const u of users) {
    try {
      const db = getTenantDb(u.id);
      const form = db.prepare('SELECT * FROM order_forms WHERE token=? AND active=1').get(token);
      if (form) return { db, userId: u.id, form };
    } catch(e) { console.error('[routes-public.js]', e.message); }
  }
  return null;
}

// GET /api/public/pay/:token
router.get('/pay/:token', (req, res) => {
  const result = findTenantByPayToken(req.params.token);
  if (!result) return res.json({ ok: false, error: 'لينك غير صالح أو منتهي' });
  const { link } = result;
  res.json({ ok: true, link: { amount: link.amount, client_name: link.client_name, description: link.description, status: link.status } });
});

// POST /api/public/pay/:token/confirm (simulate payment)
router.post('/pay/:token/confirm', express.json(), (req, res) => {
  const result = findTenantByPayToken(req.params.token);
  if (!result) return res.json({ ok: false, error: 'لينك غير صالح' });
  const { db, link } = result;
  if (link.status === 'paid') return res.json({ ok: false, error: 'تم الدفع مسبقاً' });
  // Mark as paid
  db.prepare(`UPDATE payment_links SET status='paid', paid_at=datetime('now') WHERE token=?`).run(req.params.token);
  // Update invoice if linked
  if (link.invoice_id) {
    db.prepare(`UPDATE sys_invoices SET status='paid' WHERE id=?`).run(link.invoice_id);
    // Add treasury transaction
    try {
      const wallet = db.prepare(`SELECT id FROM sys_wallets WHERE type='cash' LIMIT 1`).get();
      if (wallet) {
        db.prepare(`INSERT INTO sys_transactions (type, amount, wallet_id, description, date) VALUES ('in',?,?,?,date('now'))`)
          .run(link.amount, wallet.id, 'دفع أونلاين — ' + (link.description || 'فاتورة'));
      }
    } catch(e) { console.error('[routes-public.js]', e.message); }
  }
  // Notification
  try {
    db.prepare(`INSERT INTO notifications (title, body, type) VALUES (?,?,?)`)
      .run('💳 تم الدفع!', (link.client_name||'زبون') + ' دفع ' + link.amount + ' ج.م', 'success');
  } catch(e) { console.error('[routes-public.js]', e.message); }
  res.json({ ok: true, message: 'تم الدفع بنجاح' });
});

// GET /api/public/order-form/:token
router.get('/order-form/:token', (req, res) => {
  const result = findTenantByFormToken(req.params.token);
  if (!result) return res.json({ ok: false, error: 'فورم غير موجود' });
  const { form } = result;
  res.json({ ok: true, form: { title: form.title, products: JSON.parse(form.products || '[]') } });
});

// POST /api/public/order-form/:token/submit
router.post('/order-form/:token/submit', express.json(), (req, res) => {
  const result = findTenantByFormToken(req.params.token);
  if (!result) return res.json({ ok: false, error: 'فورم غير موجود' });
  const { db, form } = result;
  const { client_name, client_phone, client_address, items, notes } = req.body;
  if (!client_name || !client_phone) return res.json({ ok: false, error: 'الاسم والهاتف مطلوبان' });
  // Create order
  let order_no = 'ORD-' + Date.now();
  try {
    const seq = db.prepare('SELECT counter FROM sys_order_seq').get();
    const next = (seq ? seq.counter : 0) + 1;
    db.prepare('UPDATE sys_order_seq SET counter=?').run(next);
    order_no = 'ORD-' + String(next).padStart(4, '0');
  } catch(e) { console.error('[routes-public.js]', e.message); }
  let orderId = null;
  try {
    const r = db.prepare(`INSERT INTO sys_orders (order_no, client_name, client_phone, client_address, status, notes, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`)
      .run(order_no, client_name, client_phone, client_address||'', 'new', notes||'');
    orderId = r.lastInsertRowid;
  } catch(e) { console.error('[routes-public.js]', e.message); }
  // Save submission
  db.prepare(`INSERT INTO order_form_submissions (form_id, order_id, client_name, client_phone, client_address, items, notes) VALUES (?,?,?,?,?,?,?)`)
    .run(form.id, orderId, client_name, client_phone, client_address||'', JSON.stringify(items||[]), notes||'');
  // Notification
  try {
    db.prepare(`INSERT INTO notifications (title, body, type) VALUES (?,?,?)`)
      .run('📋 طلب جديد من الفورم!', client_name + ' — ' + client_phone, 'info');
  } catch(e) { console.error('[routes-public.js]', e.message); }
  res.json({ ok: true, order_no, message: 'تم استلام طلبك بنجاح!' });
});

// GET /api/public/track/:waybill
router.get('/track/:waybill', (req, res) => {
  const waybill = req.params.waybill;
  const users = master.prepare('SELECT id FROM users WHERE status IN (?,?,?)').all('active','trial','expired');
  for (const u of users) {
    try {
      const db = getTenantDb(u.id);
      const ship = db.prepare('SELECT s.*, o.order_no, o.client_name FROM sys_shipments s LEFT JOIN sys_orders o ON o.id=s.order_id WHERE s.waybill_no=?').get(waybill);
      if (ship) return res.json({ ok: true, shipment: ship });
    } catch(e) { console.error('[routes-public.js]', e.message); }
  }
  res.json({ ok: false, error: 'شحنة غير موجودة' });
});

module.exports = router;

// POST /api/public/inbox/csat/:token
router.post('/inbox/csat/:token', express.json(), (req, res) => {
  const { rating, comment } = req.body; // rating: 1-5
  if (!rating || rating < 1 || rating > 5) return res.json({ ok:false, error:'rating 1-5 required' });
  // Find conversation by token
  const users = master.prepare('SELECT id FROM users WHERE status IN (?,?,?)').all('active','trial','expired');
  for (const u of users) {
    try {
      const db = getTenantDb(u.id);
      const conv = db.prepare('SELECT * FROM inbox_conversations WHERE csat_token=?').get(req.params.token);
      if (conv) {
        db.prepare('UPDATE inbox_conversations SET csat_rating=?, csat_comment=?, csat_at=datetime(\'now\') WHERE id=?')
          .run(rating, comment||'', conv.id);
        return res.json({ ok:true, message:'شكراً على تقييمك!' });
      }
    } catch(e) { console.error('[routes-public.js]', e.message); }
  }
  res.json({ ok:false, error:'not found' });
});
