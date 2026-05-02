/**
 * stripe.js — Stripe Checkout Session Gateway
 * آخر تحديث: 2026-05-02
 *
 * الـ Flow:
 *   1. createPaymentLink(creds, linkData) → { redirectUrl, gatewayRef }
 *   2. العميل يكمل الدفع على صفحة Stripe
 *   3. Stripe يعمل redirect لـ success_url / cancel_url
 *   4. webhook أو success redirect يستدعي handlePaymentSuccess()
 *
 * المتطلبات:
 *   - secret_key  : sk_live_... أو sk_test_...
 *   - webhook_secret : whsec_... (اختياري، للـ webhook)
 *
 * Stripe Docs: https://stripe.com/docs/api/checkout/sessions/create
 */

'use strict';

const BASE_URL = process.env.BASE_URL || 'https://pro.areejegypt.com';

/**
 * إنشاء Stripe Checkout Session وإرجاع رابط الدفع
 * @param {object} creds       - { secret_key, webhook_secret }
 * @param {object} linkData    - { token, amount, currency, description, customer_name, customer_email }
 * @returns {{ redirectUrl: string, gatewayRef: string }}
 */
async function createPaymentLink(creds, linkData) {
  if (!creds?.secret_key) throw new Error('Stripe secret_key مطلوب');

  const fetch = (await import('node-fetch')).default;

  const amount      = Math.round(parseFloat(linkData.amount) * 100); // Stripe بيستخدم cents
  const currency    = (linkData.currency || 'egp').toLowerCase();
  const description = linkData.description || 'دفعة عبر Areej Pro';
  const token       = linkData.token;

  const successUrl = `${BASE_URL}/api/pay/stripe/success?token=${token}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${BASE_URL}/pay/${token}?cancelled=1`;

  const params = new URLSearchParams();
  params.append('payment_method_types[]', 'card');
  params.append('mode', 'payment');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', currency);
  params.append('line_items[0][price_data][unit_amount]', amount);
  params.append('line_items[0][price_data][product_data][name]', description);
  params.append('metadata[areej_token]', token);

  if (linkData.customer_email) {
    params.append('customer_email', linkData.customer_email);
  }

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${creds.secret_key}`,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Stripe-Version': '2023-10-16',
    },
    body:   params.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();

  if (!resp.ok || !data.url) {
    const msg = data?.error?.message || `HTTP ${resp.status}`;
    throw new Error('Stripe: ' + msg);
  }

  return {
    redirectUrl: data.url,
    gatewayRef:  data.id, // cs_...
  };
}

/**
 * التحقق من حالة Session بعد العودة من Stripe
 * @param {object} creds
 * @param {string} sessionId  - CHECKOUT_SESSION_ID من الـ URL
 * @returns {{ paid: boolean, amount: number, gatewayRef: string }}
 */
async function verifySession(creds, sessionId) {
  if (!creds?.secret_key) throw new Error('Stripe secret_key مطلوب');

  const fetch = (await import('node-fetch')).default;

  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { 'Authorization': `Bearer ${creds.secret_key}` },
    signal:  AbortSignal.timeout(10000),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);

  return {
    paid:       data.payment_status === 'paid',
    amount:     data.amount_total / 100,
    gatewayRef: data.id,
    rawData:    data,
  };
}

/**
 * التحقق من Stripe Webhook signature
 * @param {string} payload       - raw body as string
 * @param {string} sigHeader     - Stripe-Signature header
 * @param {string} webhookSecret - whsec_...
 * @returns {object} event
 */
function constructWebhookEvent(payload, sigHeader, webhookSecret) {
  // Stripe webhook signature: HMAC-SHA256
  const parts     = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const v1        = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !v1) throw new Error('Invalid Stripe-Signature header');

  const crypto    = require('crypto');
  const signed    = `${timestamp}.${payload}`;
  const expected  = crypto.createHmac('sha256', webhookSecret).update(signed).digest('hex');

  if (expected !== v1) throw new Error('Webhook signature mismatch');

  return JSON.parse(payload);
}

/**
 * اختبار الاتصال — يجلب account info
 */
async function testConnection(creds) {
  if (!creds?.secret_key) throw new Error('secret_key مطلوب');

  const fetch = (await import('node-fetch')).default;
  const resp  = await fetch('https://api.stripe.com/v1/account', {
    headers: { 'Authorization': `Bearer ${creds.secret_key}` },
    signal:  AbortSignal.timeout(8000),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  return { ok: true, account: data.display_name || data.business_profile?.name || data.id };
}

module.exports = { createPaymentLink, verifySession, constructWebhookEvent, testConnection };
