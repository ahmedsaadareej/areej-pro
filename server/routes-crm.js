/**
 * CRM Routes — /api/crm/*
 * Protected by admin token (same as admin panel)
 */
const express = require('express');
const router = express.Router();
const { getTenantDb } = require('./db-tenant');
const { requireAuth } = require('./auth-middleware');

router.use(requireAuth);
router.use((req, res, next) => { req.db = getTenantDb(req.user.id); next(); });



// ============================================================
// CONTACTS
// ============================================================

// GET /api/crm/contacts — list with filters
router.get('/contacts', (req, res) => {
  const db = req.db;
    try {
    const { status, search, tag, page = 1, limit = 30 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (status) { where += ' AND c.status=?'; params.push(status); }
    if (search) {
      where += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.niche LIKE ?)';
      const s = '%' + search + '%';
      params.push(s, s, s, s);
    }
    if (tag) {
      where += ' AND EXISTS (SELECT 1 FROM crm_contact_tags ct JOIN crm_tags t ON t.id=ct.tag_id WHERE ct.contact_id=c.id AND t.name=?)';
      params.push(tag);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare('SELECT COUNT(*) as n FROM crm_contacts c ' + where).get(...params).n;
    const contacts = db.prepare(`
      SELECT c.*,
        GROUP_CONCAT(t.name, '|') as tags,
        GROUP_CONCAT(t.color, '|') as tag_colors,
        (SELECT content FROM crm_notes WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) as last_note,
        (SELECT created_at FROM crm_notes WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 1) as last_note_at
      FROM crm_contacts c
      LEFT JOIN crm_contact_tags ct ON ct.contact_id=c.id
      LEFT JOIN crm_tags t ON t.id=ct.tag_id
      ${where}
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    // Parse tags
    const parsed = contacts.map(c => ({
      ...c,
      tags: c.tags ? c.tags.split('|').map((n,i) => ({ name: n, color: (c.tag_colors||'').split('|')[i] || '#1B5E30' })) : [],
      tag_colors: undefined
    }));

    res.json({ ok: true, data: parsed, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/crm/contacts/:id — single contact with notes + tags

// GET /api/crm/contacts/search?q=xxx — autocomplete
router.get('/contacts/search', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ ok: true, contacts: [] });
    const rows = db.prepare(`
      SELECT id, name, phone, email, city, status
      FROM crm_contacts
      WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
      ORDER BY
        CASE WHEN phone LIKE ? THEN 0 ELSE 1 END,
        name ASC
      LIMIT 8
    `).all('%'+q+'%', '%'+q+'%', '%'+q+'%', '%'+q+'%');
    res.json({ ok: true, contacts: rows });
  } catch(e) { res.json({ ok: true, contacts: [] }); }
});

// GET /api/crm/contacts/by-phone?phone=xxx
// يدعم البحث برقم الهاتف أو الاسم (فائدة لـ @lid)
router.get('/contacts/by-phone', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const raw = (req.query.phone || '').trim();
    if (!raw) return res.json({ ok: false });

    // حدد هل هو رقم أم اسم
    const isNumeric = /^[\d+\-\s()]+$/.test(raw);
    let row;
    if (isNumeric) {
      const phone = raw.replace(/^\+?0+/, ''); // شيل leading zeros/+
      row = db.prepare('SELECT * FROM crm_contacts WHERE phone LIKE ?').get('%'+phone);
    } else {
      // بحث بالاسم (fallback لـ @lid)
      row = db.prepare('SELECT * FROM crm_contacts WHERE name LIKE ?').get('%'+raw+'%');
    }
    if (!row) return res.json({ ok: false, contact: null });
    // عدد الفواتير من sys_invoices
    let invoice_count = 0;
    try {
      const cnt = db.prepare('SELECT COUNT(*) as cnt FROM sys_invoices WHERE contact_id=?').get(row.id);
      invoice_count = cnt?.cnt || 0;
    } catch (_) {}
    res.json({ ok: true, contact: { ...row, invoice_count } });
  } catch(e) { res.json({ ok: false }); }
});

router.get('/contacts/:id', (req, res) => {
  const db = req.db;
    try {
    const c = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Not found' });

    const tags = db.prepare(`
      SELECT t.id, t.name, t.color FROM crm_tags t
      JOIN crm_contact_tags ct ON ct.tag_id=t.id
      WHERE ct.contact_id=?
    `).all(c.id);

    const notes = db.prepare('SELECT * FROM crm_notes WHERE contact_id=? ORDER BY created_at DESC').all(c.id);

    res.json({ ok: true, data: { ...c, tags, notes } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/crm/contacts — create
router.post('/contacts', (req, res) => {
  const db = req.db;
  try {
    const { name, company_name, contact_name, phone, whatsapp, email, niche, city, governorate, address, country, phone_code, status = 'lead', source = 'manual', notes } = req.body;
    const displayName = company_name || name;
    if (!displayName) return res.status(400).json({ ok: false, error: 'اسم الشركة / الاسم مطلوب' });
    const phoneVal = phone || whatsapp || null;
    if (!phoneVal) return res.status(400).json({ ok: false, error: 'رقم الهاتف مطلوب' });
    // تحقق من تكرار رقم التليفون
    const existing = db.prepare('SELECT id, name, company_name FROM crm_contacts WHERE phone=?').get(phoneVal);
    if (existing) return res.status(409).json({ ok: false, error: 'هذا الرقم مسجّل بالفعل لـ ' + (existing.company_name||existing.name), existing_id: existing.id, existing_name: existing.company_name||existing.name });
    const ins = db.prepare(`
      INSERT INTO crm_contacts (name, company_name, contact_name, phone, phone_code, email, niche, city, governorate, address, country, status, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(displayName, company_name||null, contact_name||null, phoneVal, phone_code||'+20', email || null, niche || null, city || null, governorate || null, address || null, country||'EG', status, source, notes || null);
    res.json({ ok: true, id: ins.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ ok: false, error: 'رقم التليفون مسجّل مسبقاً' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/crm/contacts/:id — update
router.put('/contacts/:id', (req, res) => {
  const db = req.db;
    try {
    const { name, company_name, contact_name, phone, whatsapp, email, niche, city, governorate, address, country, phone_code, status, notes } = req.body;
    const displayName = company_name || name;
    db.prepare(`
      UPDATE crm_contacts SET
        name=COALESCE(?,name), company_name=COALESCE(?,company_name), contact_name=COALESCE(?,contact_name),
        phone=COALESCE(?,phone), phone_code=COALESCE(?,phone_code),
        email=COALESCE(?,email), niche=COALESCE(?,niche),
        city=COALESCE(?,city), governorate=COALESCE(?,governorate),
        address=COALESCE(?,address), country=COALESCE(?,country),
        status=COALESCE(?,status), notes=COALESCE(?,notes), updated_at=datetime('now')
      WHERE id=?
    `).run(displayName||null, company_name||null, contact_name||null, phone || whatsapp || null, phone_code||null, email, niche, city, governorate, address, country, status, notes, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/crm/contacts/:id
router.delete('/contacts/:id', (req, res) => {
  const db = req.db;
    try {
    db.prepare('DELETE FROM crm_contacts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// TAGS
// ============================================================

router.get('/tags', (req, res) => {
  const db = req.db;
    try {
    const tags = db.prepare('SELECT t.*, COUNT(ct.contact_id) as count FROM crm_tags t LEFT JOIN crm_contact_tags ct ON ct.tag_id=t.id GROUP BY t.id ORDER BY t.name').all();
    res.json({ ok: true, data: tags });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/tags', (req, res) => {
  const db = req.db;
    try {
    const { name, color = '#1B5E30' } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'اسم التاج مطلوب' });
    const ins = db.prepare('INSERT OR IGNORE INTO crm_tags (name, color) VALUES (?,?)').run(name.trim(), color);
    res.json({ ok: true, id: ins.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/tags/:id', (req, res) => {
  const db = req.db;
    try {
    db.prepare('DELETE FROM crm_tags WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/crm/contacts/:id/tags — set tags for contact
router.post('/contacts/:id/tags', (req, res) => {
  const db = req.db;
    try {
    const { tag_ids, tag_id } = req.body; // tag_ids = array (replace all), tag_id = single (append)
    if (tag_ids !== undefined) {
      // Replace all tags
      db.prepare('DELETE FROM crm_contact_tags WHERE contact_id=?').run(req.params.id);
      const ins = db.prepare('INSERT OR IGNORE INTO crm_contact_tags (contact_id, tag_id) VALUES (?,?)');
      const tx = db.transaction(ids => { ids.forEach(tid => ins.run(req.params.id, tid)); });
      tx(Array.isArray(tag_ids) ? tag_ids : []);
    } else if (tag_id) {
      // Append single tag
      db.prepare('INSERT OR IGNORE INTO crm_contact_tags (contact_id, tag_id) VALUES (?,?)').run(req.params.id, tag_id);
    }
    db.prepare("UPDATE crm_contacts SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// NOTES
// ============================================================

router.post('/contacts/:id/notes', (req, res) => {
  const db = req.db;
    try {
    const { body, content } = req.body;
    const noteText = body || content;
if (!noteText?.trim()) return res.status(400).json({ ok: false, error: 'النص مطلوب' });
    const ins = db.prepare('INSERT INTO crm_notes (contact_id, content) VALUES (?,?)').run(req.params.id, noteText.trim());
    db.prepare("UPDATE crm_contacts SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true, id: ins.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/notes/:id', (req, res) => {
  const db = req.db;
    try {
    db.prepare('DELETE FROM crm_notes WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// STATS
// ============================================================

router.get('/stats', (req, res) => {
  const db = req.db;
    try {
    const total = db.prepare('SELECT COUNT(*) as n FROM crm_contacts').get().n;
    const byStatus = db.prepare('SELECT status, COUNT(*) as n FROM crm_contacts GROUP BY status').all();
    const recent = db.prepare("SELECT COUNT(*) as n FROM crm_contacts WHERE created_at >= datetime('now','-7 days')").get().n;
    const topNiches = db.prepare('SELECT niche, COUNT(*) as n FROM crm_contacts WHERE niche IS NOT NULL GROUP BY niche ORDER BY n DESC LIMIT 5').all();
    res.json({ ok: true, data: { total, byStatus, recent, topNiches } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// EXPORT CSV
// ============================================================

router.get('/export', (req, res) => {
  const db = req.db;
    try {
    const { status } = req.query;
    let where = '';
    const params = [];
    if (status) { where = 'WHERE status=?'; params.push(status); }

    const contacts = db.prepare(`SELECT * FROM crm_contacts ${where} ORDER BY created_at DESC`).all(...params);

    const header = 'الاسم,واتساب,إيميل,النيش,المدينة,الحالة,المصدر,ملاحظات,تاريخ الإضافة\n';
    const rows = contacts.map(c =>
      [c.name, c.phone, c.email, c.niche, c.city, c.status, c.source, (c.notes||'').replace(/,/g,'،'), c.created_at]
        .map(v => '"' + (v||'') + '"').join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="crm-contacts.csv"');
    res.send('\uFEFF' + header + rows); // BOM for Excel Arabic support
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// IMPORT FROM GUIDE LEADS
// ============================================================
router.post('/import-guides', (req, res) => {
  const db = req.db;
    try {
    const leads = db.prepare("SELECT * FROM guide_leads WHERE email NOT IN (SELECT email FROM crm_contacts WHERE email IS NOT NULL)").all();
    const ins = db.prepare("INSERT OR IGNORE INTO crm_contacts (name, whatsapp, email, source, status) VALUES (?,?,?,'guide','lead')");
    const tx = db.transaction(rows => { rows.forEach(l => ins.run(l.name, l.whatsapp, l.email)); });
    tx(leads);
    res.json({ ok: true, imported: leads.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// PERSONA
// ============================================================

// GET persona for a contact
router.get('/contacts/:id/persona', (req, res) => {
  const db = req.db;
  try {
    const p = db.prepare('SELECT * FROM crm_personas WHERE contact_id=?').get(req.params.id);
    res.json({ ok: true, data: p || null });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// UPSERT persona for a contact
router.post('/contacts/:id/persona', (req, res) => {
  const db = req.db;
  try {
    const {
      age, gender, city, job, income_level,
      source, motivation, budget_min, budget_max,
      buy_frequency, pain_points, preferred_contact, notes
    } = req.body;
    const contactId = parseInt(req.params.id);
    // Verify contact exists
    const contact = db.prepare('SELECT id FROM crm_contacts WHERE id=?').get(contactId);
    if (!contact) return res.status(404).json({ ok: false, error: 'العميل غير موجود' });

    db.prepare(`
      INSERT INTO crm_personas
        (contact_id, age, gender, city, job, income_level, source, motivation,
         budget_min, budget_max, buy_frequency, pain_points, preferred_contact, notes, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(contact_id) DO UPDATE SET
        age=excluded.age, gender=excluded.gender, city=excluded.city,
        job=excluded.job, income_level=excluded.income_level,
        source=excluded.source, motivation=excluded.motivation,
        budget_min=excluded.budget_min, budget_max=excluded.budget_max,
        buy_frequency=excluded.buy_frequency, pain_points=excluded.pain_points,
        preferred_contact=excluded.preferred_contact, notes=excluded.notes,
        updated_at=datetime('now')
    `).run(contactId, age||null, gender||null, city||null, job||null, income_level||null,
           source||null, motivation||null, budget_min||null, budget_max||null,
           buy_frequency||null, pain_points||null, preferred_contact||null, notes||null);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET persona analytics — aggregate across all contacts with personas
router.get('/persona-analytics', (req, res) => {
  const db = req.db;
  try {
    // Gender breakdown
    const genders = db.prepare(`
      SELECT gender, COUNT(*) as n FROM crm_personas WHERE gender IS NOT NULL GROUP BY gender
    `).all();

    // Age distribution (buckets)
    const ages = db.prepare(`
      SELECT
        CASE
          WHEN age < 20 THEN 'أقل من 20'
          WHEN age BETWEEN 20 AND 24 THEN '20–24'
          WHEN age BETWEEN 25 AND 29 THEN '25–29'
          WHEN age BETWEEN 30 AND 34 THEN '30–34'
          WHEN age BETWEEN 35 AND 39 THEN '35–39'
          ELSE '40+'
        END as bucket,
        COUNT(*) as n
      FROM crm_personas WHERE age IS NOT NULL
      GROUP BY bucket ORDER BY MIN(age)
    `).all();

    // Top cities
    const cities = db.prepare(`
      SELECT city, COUNT(*) as n FROM crm_personas
      WHERE city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 5
    `).all();

    // Top sources (how they found us)
    const sources = db.prepare(`
      SELECT source, COUNT(*) as n FROM crm_personas
      WHERE source IS NOT NULL GROUP BY source ORDER BY n DESC
    `).all();

    // Top motivations
    const motivations = db.prepare(`
      SELECT motivation, COUNT(*) as n FROM crm_personas
      WHERE motivation IS NOT NULL GROUP BY motivation ORDER BY n DESC
    `).all();

    // Budget averages
    const budget = db.prepare(`
      SELECT
        ROUND(AVG(budget_min),0) as avg_min,
        ROUND(AVG(budget_max),0) as avg_max,
        ROUND(AVG((budget_min+budget_max)/2),0) as avg_mid
      FROM crm_personas WHERE budget_min IS NOT NULL
    `).get();

    // Buy frequency
    const frequency = db.prepare(`
      SELECT buy_frequency, COUNT(*) as n FROM crm_personas
      WHERE buy_frequency IS NOT NULL GROUP BY buy_frequency ORDER BY n DESC
    `).all();

    // Income level
    const income = db.prepare(`
      SELECT income_level, COUNT(*) as n FROM crm_personas
      WHERE income_level IS NOT NULL GROUP BY income_level ORDER BY n DESC
    `).all();

    // Total filled
    const total = db.prepare('SELECT COUNT(*) as n FROM crm_personas').get().n;
    const totalContacts = db.prepare('SELECT COUNT(*) as n FROM crm_contacts').get().n;

    res.json({ ok: true, data: { total, totalContacts, genders, ages, cities, sources, motivations, budget, frequency, income } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;

// ============================================================
// CLIENT PAYMENTS — دفعات العملاء
// ============================================================

// GET /api/crm/contacts/:id/balance
router.get('/contacts/:id/balance', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const c = db.prepare('SELECT id, name, balance, total_invoiced, total_paid FROM crm_contacts WHERE id=?').get(req.params.id);
    if (!c) return res.json({ ok: false, error: 'not found' });
    res.json({ ok: true, contact: c });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/crm/contacts/:id/payment — تسجيل دفعة
router.post('/contacts/:id/payment', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { amount, wallet_id, payment_method, notes } = req.body;
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'المبلغ مطلوب وأكبر من صفر' });
    const contact = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
    if (!contact) return res.json({ ok: false, error: 'عميل غير موجود' });

    db.transaction(() => {
      // خصم من رصيد العميل
      const newBalance = Math.max(0, (contact.balance||0) - parseFloat(amount));
      const newPaid = (contact.total_paid||0) + parseFloat(amount);
      db.prepare('UPDATE crm_contacts SET balance=?, total_paid=? WHERE id=?').run(newBalance, newPaid, contact.id);

      // تسجيل في الخزينة
      const targetWallet = wallet_id
        ? db.prepare('SELECT id FROM sys_wallets WHERE id=?').get(wallet_id)
        : db.prepare("SELECT id FROM sys_wallets WHERE type='cash' LIMIT 1").get();

      if (targetWallet) {
        db.prepare(`INSERT INTO sys_transactions (wallet_id, type, amount, description, date) VALUES (?,?,?,?,date('now'))`)
          .run(targetWallet.id, 'in', parseFloat(amount),
            'دفعة من ' + contact.name + (payment_method ? ' — ' + payment_method : '') + (notes ? ' | ' + notes : ''));
        db.prepare('UPDATE sys_wallets SET balance=balance+? WHERE id=?').run(parseFloat(amount), targetWallet.id);
      }

      // خصم من خزينة الذمم المدينة
      const receivableWallet = db.prepare("SELECT id FROM sys_wallets WHERE type='receivable' LIMIT 1").get();
      if (receivableWallet) {
        db.prepare(`INSERT INTO sys_transactions (wallet_id, type, amount, description, date) VALUES (?,?,?,?,date('now'))`)
          .run(receivableWallet.id, 'out', parseFloat(amount), 'تحصيل ذمم: ' + contact.name);
        db.prepare('UPDATE sys_wallets SET balance=balance-? WHERE id=?').run(parseFloat(amount), receivableWallet.id);
      }

      // ملاحظة CRM
      db.prepare("INSERT INTO crm_notes (contact_id, content) VALUES (?,?)").run(
        contact.id, '💰 دفعة مستلمة: ' + parseFloat(amount).toLocaleString('ar-EG') + ' ج.م' + (payment_method ? ' — ' + payment_method : '') + (notes ? ' | ' + notes : '')
      );
    })();

    const updated = db.prepare('SELECT balance, total_paid FROM crm_contacts WHERE id=?').get(contact.id);
    res.json({ ok: true, new_balance: updated.balance, total_paid: updated.total_paid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ============================================================
// ACCOUNT STATEMENT — كشف حساب العميل
// ============================================================
router.get('/contacts/:id/statement', requireAuth, (req, res) => {
  const db = req.db;
  try {
    const { from, to } = req.query;
    const contact = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
    if (!contact) return res.json({ ok: false, error: 'not found' });

    // Fetch invoices
    let invQ = 'SELECT * FROM sys_invoices WHERE contact_id=?';
    const invParams = [contact.id];
    if (from) { invQ += ' AND date(created_at) >= ?'; invParams.push(from); }
    if (to)   { invQ += ' AND date(created_at) <= ?'; invParams.push(to); }
    invQ += ' ORDER BY created_at ASC';
    const invoices = db.prepare(invQ).all(...invParams);

    // Fetch payments from notes (crude but works)
    let notesQ = 'SELECT * FROM crm_notes WHERE contact_id=? AND content LIKE ?';
    const notesParams = [contact.id, '💰 دفعة مستلمة:%'];
    if (from) { notesQ += ' AND date(created_at) >= ?'; notesParams.push(from); }
    if (to)   { notesQ += ' AND date(created_at) <= ?'; notesParams.push(to); }
    notesQ += ' ORDER BY created_at ASC';
    const paymentNotes = db.prepare(notesQ).all(...notesParams);

    // Build transactions timeline
    const transactions = [];
    invoices.forEach(inv => {
      transactions.push({
        date: (inv.created_at||'').substring(0,10),
        type: 'invoice',
        ref: inv.invoice_no,
        description: 'فاتورة',
        debit: inv.total,
        credit: 0,
        status: inv.status
      });
      if (inv.status === 'paid' && inv.paid_at) {
        transactions.push({
          date: (inv.paid_at||inv.created_at||'').substring(0,10),
          type: 'payment',
          ref: inv.invoice_no,
          description: 'دفع فاتورة',
          debit: 0,
          credit: inv.total
        });
      }
    });

    paymentNotes.forEach(n => {
      // Parse amount from note like "💰 دفعة مستلمة: 500 ج.م — نقدي"
      const match = (n.content||'').match(/دفعة مستلمة:\s*([\d.]+)/);
      if (match) {
        transactions.push({
          date: (n.created_at||'').substring(0,10),
          type: 'payment',
          ref: 'دفعة',
          description: n.content.replace('💰 ', '').substring(0, 60),
          debit: 0,
          credit: parseFloat(match[1]) || 0
        });
      }
    });

    // Sort by date
    transactions.sort((a,b) => a.date.localeCompare(b.date));

    // Running balance
    let balance = 0;
    transactions.forEach(t => {
      balance += t.debit - t.credit;
      t.balance = balance;
    });

    const totalDebit  = transactions.reduce((s,t) => s + t.debit, 0);
    const totalCredit = transactions.reduce((s,t) => s + t.credit, 0);

    res.json({
      ok: true,
      contact,
      transactions,
      summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit },
      period: { from: from||null, to: to||null }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

