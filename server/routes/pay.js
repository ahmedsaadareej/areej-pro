/**
 * pay.js — Payment Link API
 * آخر تحديث: 2026-05-02
 *
 * Public endpoints (لا تحتاج auth — العميل هو من يفتحها):
 *   GET  /api/pay/link/:token          ← جلب بيانات الرابط + tenant branding
 *   POST /api/pay/initiate             ← بدء الدفع (يختار gateway + method)
 *   GET  /api/pay/status/:token        ← حالة الدفع
 *   POST /api/pay/webhook/fawaterk     ← Fawaterk webhook
 *   POST /api/pay/webhook/paymob       ← Paymob webhook
 *
 * Protected endpoints (تحتاج auth من dashboard):
 *   POST /api/system/payment-links/create   ← في routes-system (sales-tools)
 */

'use strict';

const express    = require('express');
const crypto     = require('crypto');
const router     = express.Router();
const master     = require('../db-master');
const { getTenantDb } = require('../db-tenant');
const fawaterk   = require('../lib/gateways/fawaterk');
const paymob     = require('../lib/gateways/paymob');
const instapay   = require('../lib/gateways/instapay');
const { getGatewayCredentials } = require('./payment-gateways');

// BASE_URL للـ webhooks
const BASE_URL = process.env.BASE_URL || 'https://pro.areejegypt.com';

// ── Helper: جلب tenant DB من slug أو user_id ─────────────────────────────────
function getTenantBySlug(slug) {
  return master.prepare('SELECT * FROM users WHERE slug = ?').get(slug?.toLowerCase().trim());
}

// ── Lazy migration: إضافة أعمدة مفقودة في payment_links ───────────────────────
function ensurePaymentLinksColumns(db) {
  const cols = db.prepare("PRAGMA table_info(payment_links)").all().map(c => c.name);
  if (!cols.includes('invoice_ref'))    db.prepare('ALTER TABLE payment_links ADD COLUMN invoice_ref TEXT').run();
  if (!cols.includes('gateway'))        db.prepare('ALTER TABLE payment_links ADD COLUMN gateway TEXT').run();
  if (!cols.includes('gateway_method')) db.prepare('ALTER TABLE payment_links ADD COLUMN gateway_method TEXT').run();
  if (!cols.includes('updated_at'))     db.prepare('ALTER TABLE payment_links ADD COLUMN updated_at TEXT').run();
}

// ── Helper: جلب payment_link من tenant DB ────────────────────────────────────
function getPayLink(db, token) {
  ensurePaymentLinksColumns(db);
  return db.prepare('SELECT * FROM payment_links WHERE token = ?').get(token);
}

// ── Helper: جلب tenant profile ───────────────────────────────────────────────
function getTenantProfile(db) {
  return db.prepare('SELECT * FROM tenant_profile WHERE id = 1').get() || {};
}

// ── GET /api/pay/link/:token — بيانات الرابط للـ frontend ───────────────────
router.get('/link/:token', (req, res) => {
  try {
    const { token } = req.params;

    // الـ token يحتوي على: {tenantSlug}.{actualToken}
    const dotIdx = token.indexOf('.');
    if (dotIdx === -1) return res.status(400).json({ ok: false, error: 'رابط غير صحيح' });

    const slug      = token.slice(0, dotIdx);
    const linkToken = token.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.status(404).json({ ok: false, error: 'الشركة غير موجودة' });

    const db      = getTenantDb(owner.id);
    const link    = getPayLink(db, linkToken);
    if (!link) return res.status(404).json({ ok: false, error: 'رابط الدفع غير موجود أو منتهي الصلاحية' });

    if (link.status === 'paid') {
      return res.json({ ok: true, status: 'paid', message: 'تم الدفع مسبقاً، شكراً لك!' });
    }
    if (link.status === 'expired') {
      return res.json({ ok: true, status: 'expired', message: 'انتهت صلاحية هذا الرابط' });
    }

    const profile = getTenantProfile(db);

    // جلب البوابات المفعّلة للـ tenant
    const enabledGateways = [];
    for (const gwName of ['fawaterk', 'paymob', 'instapay']) {
      const creds = getGatewayCredentials(db, gwName);
      if (creds) enabledGateways.push(gwName);
    }

    res.json({
      ok: true,
      status: link.status,
      link: {
        token:        linkToken,
        fullToken:    token,
        amount:       link.amount,
        description:  link.description || 'رابط دفع',
        client_name:  link.client_name,
        client_phone: link.client_phone,
        invoice_id:   link.invoice_id,
      },
      branding: {
        company_name: profile.company_name || owner.company_name || 'النظام',
        logo_url:     profile.logo_url     || owner.logo_url     || null,
        brand_color:  profile.brand_color  || owner.brand_color  || '#1B5E30',
      },
      gateways: enabledGateways,
    });
  } catch (err) {
    console.error('pay/link GET error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/pay/initiate — بدء الدفع ──────────────────────────────────────
router.post('/initiate', async (req, res) => {
  try {
    const { token, gateway, method = 'card', phone, name } = req.body;
    if (!token || !gateway) return res.status(400).json({ ok: false, error: 'token و gateway مطلوبان' });

    const dotIdx = token.indexOf('.');
    if (dotIdx === -1) return res.status(400).json({ ok: false, error: 'token غير صحيح' });

    const slug      = token.slice(0, dotIdx);
    const linkToken = token.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.status(404).json({ ok: false, error: 'الشركة غير موجودة' });

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link) return res.status(404).json({ ok: false, error: 'رابط الدفع غير موجود' });
    if (link.status === 'paid') return res.json({ ok: false, error: 'تم الدفع مسبقاً' });

    const creds = getGatewayCredentials(db, gateway);
    if (!creds)  return res.status(400).json({ ok: false, error: `بوابة ${gateway} غير مفعّلة أو غير مضبوطة` });

    const amount      = link.amount;
    const clientName  = name  || link.client_name  || 'عميل';
    const clientPhone = phone || link.client_phone || '';
    const profile     = getTenantProfile(db);
    const companyName = profile.company_name || owner.company_name || 'النظام';
    const tenantBase  = `https://${slug}.areejegypt.com`;

    // ── Fawaterk ─────────────────────────────────────────────────────────────
    if (gateway === 'fawaterk') {
      const result = await fawaterk.createInvoice(creds, {
        amount, clientName, clientPhone, method,
        invoiceRef: `PL-${link.id}-${Date.now()}`,
        baseUrl:    tenantBase,
        itemName:   link.description || companyName,
        webhookUrl: `${BASE_URL}/api/pay/webhook/fawaterk`,
      });

      // حفظ invoice_ref في payment_links
      db.prepare(`UPDATE payment_links SET invoice_ref=?, gateway=?, gateway_method=?, updated_at=datetime('now')
                  WHERE token=?`)
        .run(String(result.invoiceId), 'fawaterk', method, linkToken);

      if (result.redirectUrl) {
        return res.json({ ok: true, action: 'redirect', url: result.redirectUrl });
      }
      // Offline methods (fawry/aman/basata)
      return res.json({
        ok: true,
        action: 'show_code',
        method,
        payment_data: result.paymentData,
        invoice_key:  result.invoiceKey,
      });
    }

    // ── Paymob ───────────────────────────────────────────────────────────────
    if (gateway === 'paymob') {
      const result = await paymob.createPaymentUrl(creds, {
        amount, clientName, clientPhone, method,
        invoiceRef: `PL-${link.id}-${Date.now()}`,
        baseUrl:    tenantBase,
        redirectUrl: `${tenantBase}/pay/${token}/result`,
      });

      db.prepare(`UPDATE payment_links SET invoice_ref=?, gateway=?, gateway_method=?, updated_at=datetime('now')
                  WHERE token=?`)
        .run(result.orderId, 'paymob', method, linkToken);

      return res.json({ ok: true, action: 'redirect', url: result.redirectUrl });
    }

    // ── InstaPay ─────────────────────────────────────────────────────────────
    if (gateway === 'instapay') {
      const result = instapay.createInstapayLink(creds, { amount, clientName, clientPhone });

      db.prepare(`UPDATE payment_links SET gateway=?, gateway_method=?, updated_at=datetime('now')
                  WHERE token=?`)
        .run('instapay', 'instapay', linkToken);

      return res.json({
        ok:           true,
        action:       'instapay',
        instapay_url: result.instapayLink,
        amount,
      });
    }

    res.status(400).json({ ok: false, error: 'بوابة غير معروفة' });

  } catch (err) {
    console.error('pay/initiate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/pay/status/:token — حالة الدفع ─────────────────────────────────
router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const dotIdx    = token.indexOf('.');
    if (dotIdx === -1) return res.status(400).json({ ok: false, error: 'token غير صحيح' });

    const slug      = token.slice(0, dotIdx);
    const linkToken = token.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.status(404).json({ ok: false, error: 'الشركة غير موجودة' });

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link) return res.status(404).json({ ok: false, error: 'رابط غير موجود' });

    // لو مدفوع من DB — رجّع مباشرة
    if (link.status === 'paid') {
      return res.json({ ok: true, status: 'paid' });
    }

    // لو عنده invoice_ref — اتحقق من الـ gateway
    if (link.invoice_ref && link.gateway === 'fawaterk') {
      const creds = getGatewayCredentials(db, 'fawaterk');
      if (creds) {
        const result = await fawaterk.getInvoiceStatus(creds, link.invoice_ref);
        if (result.status === 'paid' && link.status !== 'paid') {
          await handlePaymentSuccess(db, link, 'fawaterk');
        }
        return res.json({ ok: true, status: result.status });
      }
    }

    res.json({ ok: true, status: link.status || 'pending' });
  } catch (err) {
    console.error('pay/status error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/pay/webhook/fawaterk — Fawaterk Webhook ───────────────────────
router.post('/webhook/fawaterk', async (req, res) => {
  try {
    const data = req.body || {};
    const { invoice_id, invoice_key, payment_method, invoice_status, hashKey } = data;

    if (!invoice_id) return res.sendStatus(400);

    // نبحث عن الـ link في كل tenant DBs (عبر invoice_ref)
    const allUsers = master.prepare('SELECT id FROM users WHERE slug IS NOT NULL').all();
    let found = null;
    for (const u of allUsers) {
      const db   = getTenantDb(u.id);
      const link = db.prepare(`SELECT * FROM payment_links WHERE invoice_ref=?`).get(String(invoice_id));
      if (link) { found = { db, link, userId: u.id }; break; }
    }

    if (!found) { console.log(`Fawaterk webhook: invoice ${invoice_id} not found`); return res.sendStatus(200); }

    const { db, link } = found;
    if (link.status === 'paid') return res.sendStatus(200); // duplicate

    // التحقق من HMAC لو عندنا credentials
    const creds = getGatewayCredentials(db, 'fawaterk');
    if (creds && hashKey) {
      const valid = fawaterk.verifyHmac(creds, { invoice_id, invoice_key, payment_method }, hashKey);
      if (!valid) console.warn(`⚠️ Fawaterk HMAC mismatch for invoice ${invoice_id}`);
    }

    const isPaid = invoice_status === '1' || invoice_status === 1 ||
                   String(invoice_status).toLowerCase() === 'paid';

    if (isPaid) {
      db.prepare(`UPDATE payment_links SET status='paid', paid_at=datetime('now') WHERE id=?`).run(link.id);
      if (link.invoice_id) {
        db.prepare(`UPDATE sys_invoices SET status='paid', paid_at=datetime('now') WHERE id=?`).run(link.invoice_id);
      }
      console.log(`✅ Payment paid via Fawaterk: link#${link.id}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Fawaterk webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ── POST /api/pay/webhook/paymob — Paymob Webhook ───────────────────────────
router.post('/webhook/paymob', async (req, res) => {
  try {
    const data  = req.body || {};
    const obj   = data.obj || data;
    const hmac  = req.query.hmac;
    const success = obj.success === true || obj.success === 'true';
    const orderId = String(obj.order?.id || obj.order || '');

    if (!orderId) return res.sendStatus(400);

    const allUsers = master.prepare('SELECT id FROM users WHERE slug IS NOT NULL').all();
    let found = null;
    for (const u of allUsers) {
      const db   = getTenantDb(u.id);
      const link = db.prepare(`SELECT * FROM payment_links WHERE invoice_ref=?`).get(orderId);
      if (link) { found = { db, link }; break; }
    }

    if (!found) return res.sendStatus(200);
    const { db, link } = found;
    if (link.status === 'paid') return res.sendStatus(200);

    if (hmac) {
      const creds = getGatewayCredentials(db, 'paymob');
      if (creds) {
        const valid = paymob.verifyHmac(creds, obj, hmac);
        if (!valid) { console.warn('⚠️ Paymob HMAC mismatch'); return res.sendStatus(401); }
      }
    }

    if (success) {
      db.prepare(`UPDATE payment_links SET status='paid', paid_at=datetime('now') WHERE id=?`).run(link.id);
      if (link.invoice_id) {
        db.prepare(`UPDATE sys_invoices SET status='paid', paid_at=datetime('now') WHERE id=?`).run(link.invoice_id);
      }
      console.log(`✅ Payment paid via Paymob: link#${link.id}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Paymob webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
