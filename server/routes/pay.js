/**
 * pay.js — Payment Link API
 * آخر تحديث: 2026-05-02
 *
 * Public endpoints (لا تحتاج auth — العميل هو من يفتحها):
 *   GET  /api/pay/link/:token            ← جلب بيانات الرابط + tenant branding
 *   POST /api/pay/initiate               ← بدء الدفع (يختار gateway + method)
 *   GET  /api/pay/status/:token          ← حالة الدفع
 *   POST /api/pay/webhook/fawaterk       ← Fawaterk webhook
 *   POST /api/pay/webhook/paymob         ← Paymob webhook
 *   POST /api/pay/webhook/paytabs        ← PayTabs callback (server_url)
 *   POST /api/pay/webhook/stripe         ← Stripe webhook (Stripe-Signature)
 *   GET  /api/pay/stripe/success         ← Stripe redirect بعد الدفع
 *   GET  /api/pay/paytabs/return         ← PayTabs redirect بعد الدفع
 *   GET  /api/pay/paypal/return          ← PayPal redirect + capture
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
const stripeGw   = require('../lib/gateways/stripe');
const paytabsGw  = require('../lib/gateways/paytabs');
const paypalGw   = require('../lib/gateways/paypal');
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

// ──────────────────────────────────────────────────────────────────────
// handlePaymentSuccess — معالجة متكاملة بعد نجاح أي دفعة
// الخطوات:
//  1. payment_links → paid
//  2. sys_invoices  → paid (لو مرتبطة بفاتورة)
//  3. خصم receivable_wallet لو كانت الفاتورة آجلاً
//  4. IN صافي (مبلغ - عمولة) في خزنة البوابة
//  5. OUT عمولة البوابة كمصروف منفصل
//  6. crm_contacts: balance -= المبلغ، total_paid += المبلغ
//  7. inbox: رسالة تأكيد + note داخلي للموظفين (لو conversation_id موجود)
// ──────────────────────────────────────────────────────────────────────
async function handlePaymentSuccess(db, link, gatewayName, paidAmount) {
  try {
    const amount = paidAmount || link.amount || 0;

    // 1. payment_links → paid
    db.prepare(`UPDATE payment_links SET status='paid', paid_at=datetime('now'), gateway=COALESCE(gateway,?) WHERE id=?`)
      .run(gatewayName, link.id);

    // 2. sys_invoices → paid
    if (link.invoice_id) {
      db.prepare(`UPDATE sys_invoices SET status='paid', paid_at=datetime('now') WHERE id=?`).run(link.invoice_id);
    }

    // 3+4+5. خزنة البوابة + عمولة
    try {
      const gwRow = db.prepare('SELECT * FROM payment_gateways WHERE gateway_name=? AND enabled=1').get(gatewayName);
      if (gwRow?.wallet_id) {
        const pct   = parseFloat(gwRow.commission_pct   || 0);
        const fixed = parseFloat(gwRow.commission_fixed || 0);
        const comm  = (amount * pct / 100) + fixed;
        const net   = amount - comm;

        // 3. خصم receivable_wallet لو الفاتورة آجلة
        if (link.invoice_id) {
          const inv = db.prepare('SELECT * FROM sys_invoices WHERE id=?').get(link.invoice_id);
          if (inv?.payment_type === 'credit') {
            const rwId = db.prepare(`SELECT id FROM sys_wallets WHERE name LIKE '%receivable%' OR name LIKE '%آجل%' LIMIT 1`).get()?.id;
            if (rwId) {
              db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,category,description,created_at) VALUES (?,?,?,?,?,datetime('now'))`)
                .run(rwId, 'OUT', amount, 'تحصيل آجل', `تحصيل فاتورة #${link.invoice_id}`);
              db.prepare('UPDATE sys_wallets SET balance = balance - ? WHERE id=?').run(amount, rwId);
            }
          }
        }

        // 4. IN صافي في خزنة البوابة
        if (net > 0) {
          db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,category,description,created_at) VALUES (?,?,?,?,?,datetime('now'))`)
            .run(gwRow.wallet_id, 'IN', net, 'مدفوعات إلكترونية', `دفعة عبر ${gatewayName} - رابط #${link.id}`);
          db.prepare('UPDATE sys_wallets SET balance = balance + ? WHERE id=?').run(net, gwRow.wallet_id);
        }

        // 5. OUT عمولة كمصروف منفصل
        if (comm > 0) {
          db.prepare(`INSERT INTO sys_transactions (wallet_id,type,amount,category,description,created_at) VALUES (?,?,?,?,?,datetime('now'))`)
            .run(gwRow.wallet_id, 'OUT', comm, 'مصروفات بوابات الدفع', `عمولة ${gatewayName} - رابط #${link.id}`);
          db.prepare('UPDATE sys_wallets SET balance = balance - ? WHERE id=?').run(comm, gwRow.wallet_id);
        }
      }
    } catch (walletErr) {
      console.error('handlePaymentSuccess wallet error:', walletErr.message);
    }

    // 6. crm_contacts: balance -= المبلغ، total_paid += المبلغ
    try {
      if (link.client_phone) {
        const contact = db.prepare('SELECT id FROM crm_contacts WHERE phone=? LIMIT 1').get(link.client_phone);
        if (contact) {
          db.prepare('UPDATE crm_contacts SET balance = balance - ?, total_paid = COALESCE(total_paid,0) + ? WHERE id=?')
            .run(amount, amount, contact.id);
        }
      }
    } catch (crmErr) {
      console.error('handlePaymentSuccess CRM error:', crmErr.message);
    }

    // 7. inbox: رسالة تأكيد + note داخلي
    try {
      const convId = link.conversation_id;
      if (convId) {
        const gatewayLabel = { fawaterk: 'فواتيرك', paymob: 'Paymob', instapay: 'InstaPay', stripe: 'Stripe', paytabs: 'PayTabs', paypal: 'PayPal' }[gatewayName] || gatewayName;
        db.prepare(`INSERT INTO inbox_messages (conversation_id, direction, content, sent_at, is_note) VALUES (?,?,?,datetime('now'),0)`)
          .run(convId, 'out', `✅ تم استلام مبلغ ${amount} ج.م عبر ${gatewayLabel}. شكراً لك!`);
        db.prepare(`INSERT INTO inbox_messages (conversation_id, direction, content, sent_at, is_note) VALUES (?,?,?,datetime('now'),1)`)
          .run(convId, 'in', `💰 دفع ناجح: ${amount} ج.م عبر ${gatewayLabel}`);
        db.prepare(`UPDATE inbox_conversations SET last_message_at=datetime('now') WHERE id=?`).run(convId);
      }
    } catch (inboxErr) {
      console.error('handlePaymentSuccess inbox error:', inboxErr.message);
    }

    console.log(`✅ handlePaymentSuccess: link#${link.id} | gateway:${gatewayName} | amount:${amount}`);
  } catch (err) {
    console.error('❌ handlePaymentSuccess CRITICAL:', err.message);
  }
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
    for (const gwName of ['fawaterk', 'paymob', 'instapay', 'stripe', 'paytabs', 'paypal']) {
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

    // ── Stripe ────────────────────────────────────────────────────────────────
    if (gateway === 'stripe') {
      const result = await stripeGw.createPaymentLink(creds, {
        token,
        amount,
        currency:       'egp',
        description:    link.description || companyName,
        customer_name:  clientName,
        customer_email: link.client_email || null,
      });

      db.prepare(`UPDATE payment_links SET invoice_ref=?, gateway=?, gateway_method=?, updated_at=datetime('now') WHERE token=?`)
        .run(result.gatewayRef, 'stripe', 'card', linkToken);

      return res.json({ ok: true, action: 'redirect', url: result.redirectUrl });
    }

    // ── PayTabs ───────────────────────────────────────────────────────────────
    if (gateway === 'paytabs') {
      const result = await paytabsGw.createPaymentLink(creds, {
        token,
        amount,
        currency:       'EGP',
        description:    link.description || companyName,
        customer_name:  clientName,
        customer_phone: clientPhone,
        customer_email: link.client_email || 'customer@areejegypt.com',
      });

      db.prepare(`UPDATE payment_links SET invoice_ref=?, gateway=?, gateway_method=?, updated_at=datetime('now') WHERE token=?`)
        .run(result.gatewayRef, 'paytabs', 'card', linkToken);

      return res.json({ ok: true, action: 'redirect', url: result.redirectUrl });
    }

    // ── PayPal ────────────────────────────────────────────────────────────────
    if (gateway === 'paypal') {
      const result = await paypalGw.createPaymentLink(creds, {
        token,
        amount,
        currency:    link.currency || 'USD',
        description: link.description || companyName,
      });

      db.prepare(`UPDATE payment_links SET invoice_ref=?, gateway=?, gateway_method=?, updated_at=datetime('now') WHERE token=?`)
        .run(result.gatewayRef, 'paypal', 'paypal', linkToken);

      return res.json({ ok: true, action: 'redirect', url: result.redirectUrl });
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

    // H7 Fix: invoice_ref يحتوي على "PL-{linkId}-{ts}" — نبحث في master أولاً
    // الـ invoice_ref بتتكون كـ PL-{id}-{timestamp} — نستخرج الـ slug منها
    // لكن Fawaterk مش بيبعت الـ slug — نلف على التيناتس مع early-exit وcache
    // الحل الأمثل: البحث في master_payment_index لو موجود، وإلا fallback للـ loop
    let found = null;
    // أسرع: loop مع break فور الإيجاد (الغالبية العظمى ستجد في أول 1-2 tenants)
    const allUsers = master.prepare('SELECT id FROM users WHERE slug IS NOT NULL AND status IN (?,?,?)').all('active','trial','grace');
    for (const u of allUsers) {
      const db   = getTenantDb(u.id);
      const link = db.prepare('SELECT * FROM payment_links WHERE invoice_ref=?').get(String(invoice_id));
      if (link) { found = { db, link, userId: u.id }; break; }
    }

    if (!found) { console.log(`Fawaterk webhook: invoice ${invoice_id} not found`); return res.sendStatus(200); }

    const { db, link } = found;
    if (link.status === 'paid') return res.sendStatus(200); // duplicate

    // التحقق من HMAC لو عندنا credentials
    const creds = getGatewayCredentials(db, 'fawaterk');
    if (creds && hashKey) {
      const valid = fawaterk.verifyHmac(creds, { invoice_id, invoice_key, payment_method }, hashKey);
      if (!valid) {
        console.warn(`⚠️ Fawaterk HMAC mismatch for invoice ${invoice_id} — rejected`);
        return res.status(401).json({ ok: false, error: 'invalid signature' }); // H4 fix
      }
    }

    const isPaid = invoice_status === '1' || invoice_status === 1 ||
                   String(invoice_status).toLowerCase() === 'paid';

    if (isPaid) {
      await handlePaymentSuccess(db, link, 'fawaterk', link.amount);
      console.log(`✅ Payment paid via Fawaterk webhook: link#${link.id}`);
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

    // H7 Fix: loop مع early-exit + فلتر active tenants فقط
    const allUsers = master.prepare('SELECT id FROM users WHERE slug IS NOT NULL AND status IN (?,?,?)').all('active','trial','grace');
    let found = null;
    for (const u of allUsers) {
      const db   = getTenantDb(u.id);
      const link = db.prepare('SELECT * FROM payment_links WHERE invoice_ref=?').get(orderId);
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
      const paidAmt = parseFloat(obj.amount_cents || 0) / 100 || link.amount;
      await handlePaymentSuccess(db, link, 'paymob', paidAmt);
      console.log(`✅ Payment paid via Paymob webhook: link#${link.id}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Paymob webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ── GET /api/pay/stripe/success — Stripe redirect بعد الدفع ─────────────────
router.get('/stripe/success', async (req, res) => {
  const { token, session_id } = req.query;
  if (!token || !session_id) return res.redirect('/pay/error?msg=missing_params');

  try {
    const dotIdx    = token.indexOf('.');
    const slug      = token.slice(0, dotIdx);
    const linkToken = token.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.redirect('/pay/error?msg=tenant_not_found');

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link) return res.redirect('/pay/error?msg=link_not_found');
    if (link.status === 'paid') return res.redirect(`/pay/${token}/result?status=paid`);

    const creds = getGatewayCredentials(db, 'stripe');
    if (!creds) return res.redirect(`/pay/${token}/result?status=error`);

    const result = await stripeGw.verifySession(creds, session_id);

    if (result.paid) {
      await handlePaymentSuccess(db, link, 'stripe', result.amount);
      return res.redirect(`/pay/${token}/result?status=paid`);
    }

    return res.redirect(`/pay/${token}/result?status=pending`);
  } catch (err) {
    console.error('Stripe success redirect error:', err.message);
    return res.redirect(`/pay/${token}/result?status=error`);
  }
});

// ── POST /api/pay/webhook/stripe — Stripe Webhook ────────────────────────────
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // H5 Fix: نعمل parse مبدئي لجلب الـ token أولاً (بدون بيانات مالية بعد)،
  // ثم نـ verify الـ signature قبل أي معالجة مالية
  try {
    const sig  = req.headers['stripe-signature'];
    const body = req.body?.toString() || '';
    if (!sig || !body) return res.sendStatus(400);

    // Parse مبدئي للحصول على areej_token فقط (metadata — ليست بيانات مالية)
    let eventRaw;
    try { eventRaw = JSON.parse(body); } catch { return res.sendStatus(400); }

    if (eventRaw.type !== 'checkout.session.completed') return res.sendStatus(200);

    const session    = eventRaw.data?.object;
    const areejToken = session?.metadata?.areej_token;
    if (!areejToken) return res.sendStatus(200);

    const dotIdx    = areejToken.indexOf('.');
    const slug      = areejToken.slice(0, dotIdx);
    const linkToken = areejToken.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.sendStatus(200);

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link || link.status === 'paid') return res.sendStatus(200);

    // H5: Verify signature قبل أي معالجة مالية
    const creds = getGatewayCredentials(db, 'stripe');
    if (creds?.webhook_secret) {
      try {
        stripeGw.constructWebhookEvent(body, sig, creds.webhook_secret);
      } catch (e) {
        console.warn('⚠️ Stripe webhook signature mismatch:', e.message);
        return res.sendStatus(401); // رفض — لا معالجة مالية بدون verify
      }
    } else {
      // لو مفيش webhook_secret → رفض الـ webhook تماماً (لا نثق بغير الموقّع)
      console.warn('⚠️ Stripe webhook_secret غير مضبوط — webhook مرفوض');
      return res.sendStatus(401);
    }

    // بعد الـ verify: المعالجة المالية آمنة
    if (session.payment_status === 'paid') {
      const amount = session.amount_total / 100;
      await handlePaymentSuccess(db, link, 'stripe', amount);
      console.log(`✅ Payment paid via Stripe webhook: link#${link.id}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ── POST /api/pay/webhook/paytabs — PayTabs Callback (server_url) ─────────────
router.post('/webhook/paytabs', async (req, res) => {
  try {
    const body = req.body || {};
    const result = paytabsGw.verifyCallback(body);

    if (!result.token) return res.sendStatus(200);

    const dotIdx    = result.token.indexOf('.');
    const slug      = result.token.slice(0, dotIdx);
    const linkToken = result.token.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.sendStatus(200);

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link || link.status === 'paid') return res.sendStatus(200);

    if (result.paid) {
      await handlePaymentSuccess(db, link, 'paytabs', result.amount);
      console.log(`✅ Payment paid via PayTabs: link#${link.id}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('PayTabs webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ── GET /api/pay/paytabs/return — PayTabs redirect بعد الدفع ─────────────────
router.get('/paytabs/return', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/pay/error?msg=missing_token');

  try {
    // PayTabs يرسل الحالة في callback (server_url) — هنا فقط نوجّه
    const dotIdx = token.indexOf('.');
    const slug   = token.slice(0, dotIdx);
    const owner  = getTenantBySlug(slug);
    if (!owner) return res.redirect('/pay/error?msg=not_found');

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, token.slice(dotIdx + 1));
    if (!link) return res.redirect('/pay/error?msg=not_found');

    const status = link.status === 'paid' ? 'paid' : 'pending';
    return res.redirect(`/pay/${token}/result?status=${status}`);
  } catch (err) {
    console.error('PayTabs return error:', err.message);
    return res.redirect('/pay/error?msg=server_error');
  }
});

// ── GET /api/pay/paypal/return — PayPal redirect + capture ───────────────────
router.get('/paypal/return', async (req, res) => {
  // PayPal بيرجع: ?areej_token=slug.token&token=ORDER_ID
  const areejToken = req.query.areej_token;
  const orderId    = req.query.token; // PayPal ORDER_ID

  if (!areejToken || !orderId) return res.redirect('/pay/error?msg=missing_params');

  try {
    const dotIdx    = areejToken.indexOf('.');
    const slug      = areejToken.slice(0, dotIdx);
    const linkToken = areejToken.slice(dotIdx + 1);

    const owner = getTenantBySlug(slug);
    if (!owner) return res.redirect('/pay/error?msg=not_found');

    const db   = getTenantDb(owner.id);
    const link = getPayLink(db, linkToken);
    if (!link) return res.redirect('/pay/error?msg=not_found');
    if (link.status === 'paid') return res.redirect(`/pay/${areejToken}/result?status=paid`);

    const creds = getGatewayCredentials(db, 'paypal');
    if (!creds) return res.redirect(`/pay/${areejToken}/result?status=error`);

    const result = await paypalGw.captureOrder(creds, orderId);

    if (result.paid) {
      await handlePaymentSuccess(db, link, 'paypal', result.amount);
      console.log(`✅ Payment paid via PayPal: link#${link.id}`);
      return res.redirect(`/pay/${areejToken}/result?status=paid`);
    }

    return res.redirect(`/pay/${areejToken}/result?status=pending`);
  } catch (err) {
    console.error('PayPal return error:', err.message);
    return res.redirect(`/pay/${areejToken}/result?status=error`);
  }
});

module.exports = router;
