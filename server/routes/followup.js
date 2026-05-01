'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
// ============================================================
// FOLLOW-UP ENGINE
// ============================================================

// GET /api/system/followup/rules
router.get('/followup/rules', (req, res) => {
    const db = req.db;
    try {
    const rules = db.prepare('SELECT * FROM sys_followup_rules ORDER BY id').all();
    res.json({ ok:true, data:rules });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/followup/rules
router.post('/followup/rules', (req, res) => {
    const db = req.db;
    try {
    const { name, trigger, days, template, active=1 } = req.body;
    if (!name||!trigger||!template) return res.status(400).json({ ok:false, error:'Missing fields' });
    const r = db.prepare('INSERT INTO sys_followup_rules (name,trigger,days,template,active) VALUES (?,?,?,?,?)').run(name,trigger,+days||1,template,active?1:0);
    res.json({ ok:true, id:r.lastInsertRowid, data:{id:r.lastInsertRowid} });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// PUT /api/system/followup/rules/:id
router.put('/followup/rules/:id', (req, res) => {
    const db = req.db;
    try {
    const { name, trigger, days, template, active } = req.body;
    db.prepare('UPDATE sys_followup_rules SET name=COALESCE(?,name), trigger=COALESCE(?,trigger), days=COALESCE(?,days), template=COALESCE(?,template), active=COALESCE(?,active) WHERE id=?')
      .run(name||null, trigger||null, days!=null?+days:null, template||null, active!=null?(active?1:0):null, req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// DELETE /api/system/followup/rules/:id
router.delete('/followup/rules/:id', (req, res) => {
    const db = req.db;
    try {
    db.prepare('DELETE FROM sys_followup_rules WHERE id=?').run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/followup/scan  —  فحص من يحتاج متابعة اليوم
router.get('/followup/scan', (req, res) => {
    const db = req.db;
    try {
    const rules = db.prepare('SELECT * FROM sys_followup_rules WHERE active=1').all();
    const results = [];

    rules.forEach(rule => {
      if (rule.trigger === 'no_order_days') {
        // عملاء آخر طلب لهم منذ X يوم أو أكثر
        const contacts = db.prepare(`
          SELECT c.id, c.name, c.phone, c.status,
                 MAX(o.created_at) as last_order
          FROM crm_contacts c
          LEFT JOIN sys_orders o ON o.contact_id=c.id AND o.status='delivered'
          WHERE c.status IN ('client','vip')
          GROUP BY c.id
          HAVING last_order IS NULL OR last_order < datetime('now','-'||?||' days')
        `).all(rule.days);
        contacts.forEach(c => {
          const recentLog = db.prepare("SELECT id FROM sys_followup_logs WHERE rule_id=? AND contact_id=? AND created_at > datetime('now','-7 days')").get(rule.id, c.id);
          if (recentLog) return;
          const msg = rule.template
            .replace(/{name}/g, c.name||'عزيزي')
            .replace(/{phone}/g, c.whatsapp||'');
          results.push({ rule_id:rule.id, rule_name:rule.name, contact_id:c.id, contact_name:c.name, wa_phone:c.phone, message:msg, trigger:rule.trigger, last_order:c.last_order });
        });
      }

      if (rule.trigger === 'delivered_days') {
        // طلبات تم تسليمها منذ X أيام
        const orders = db.prepare(`
          SELECT o.id, o.order_no, o.client_name, o.client_phone, o.contact_id, o.updated_at
          FROM sys_orders o
          WHERE o.status='delivered'
          AND o.updated_at < datetime('now','-'||?||' days')
          AND o.updated_at > datetime('now','-'||((?)+7)||' days')
        `).all(rule.days, rule.days);
        orders.forEach(o => {
          const recentLog = db.prepare('SELECT id FROM sys_followup_logs WHERE rule_id=? AND order_id=?').get(rule.id, o.id);
          if (recentLog) return;
          const contact = o.contact_id ? db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(o.contact_id) : null;
          const msg = rule.template
            .replace(/{name}/g, contact?.name||o.client_name||'عزيزي')
            .replace(/{order_no}/g, o.order_no);
          results.push({ rule_id:rule.id, rule_name:rule.name, contact_id:o.contact_id, order_id:o.id, contact_name:o.client_name, wa_phone:o.client_phone, message:msg, trigger:rule.trigger, order_no:o.order_no });
        });
      }

      if (rule.trigger === 'shipped_days') {
        // طلبات لا تزال "مع المندوب" منذ X أيام
        const orders = db.prepare(`
          SELECT o.id, o.order_no, o.client_name, o.client_phone, o.contact_id, o.updated_at
          FROM sys_orders o
          WHERE o.status='shipped'
          AND o.updated_at < datetime('now','-'||?||' days')
        `).all(rule.days);
        orders.forEach(o => {
          const recentLog = db.prepare('SELECT id FROM sys_followup_logs WHERE rule_id=? AND order_id=? AND created_at > datetime(\'now\',\'-3 days\')').get(rule.id, o.id);
          if (recentLog) return;
          const contact = o.contact_id ? db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(o.contact_id) : null;
          const msg = rule.template
            .replace(/{name}/g, contact?.name||o.client_name||'عزيزي')
            .replace(/{order_no}/g, o.order_no);
          results.push({ rule_id:rule.id, rule_name:rule.name, contact_id:o.contact_id, order_id:o.id, contact_name:o.client_name, wa_phone:o.client_phone, message:msg, trigger:rule.trigger, order_no:o.order_no });
        });
      }
    });

    res.json({ ok:true, data:results, count:results.length });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST /api/system/followup/mark-sent  — تسجيل إرسال
router.post('/followup/mark-sent', (req, res) => {
    const db = req.db;
    try {
    const { rule_id, contact_id, order_id, wa_phone, message, status='sent' } = req.body;
    const r = db.prepare('INSERT INTO sys_followup_logs (rule_id,contact_id,order_id,wa_phone,message,status,sent_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))').run(
      rule_id||null, contact_id||null, order_id||null, wa_phone||null, message, status
    );
    // سجّل في CRM
    if (contact_id) db.prepare("INSERT INTO crm_notes (contact_id,content) VALUES (?,?)").run(contact_id, '📱 متابعة واتساب: ' + (message||'').substring(0,80));
    res.json({ ok:true, id:r.lastInsertRowid, data:{id:r.lastInsertRowid} });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET /api/system/followup/logs
router.get('/followup/logs', (req, res) => {
    const db = req.db;
    try {
    const { limit=50 } = req.query;
    const logs = db.prepare('SELECT l.*, r.name as rule_name FROM sys_followup_logs l LEFT JOIN sys_followup_rules r ON r.id=l.rule_id ORDER BY l.sent_at DESC LIMIT ?').all(+limit);
    const stats = db.prepare('SELECT status, COUNT(*) as n FROM sys_followup_logs GROUP BY status').all();
    res.json({ ok:true, data:logs, stats });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});


module.exports = router;
