/**
 * paymob.js — Paymob Gateway (dynamic credentials)
 * آخر تحديث: 2026-05-02
 *
 * credentials تأتي كـ parameter لكل call (Multi-Tenant)
 */

'use strict';

const https  = require('https');
const crypto = require('crypto');

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout:  15000,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Paymob request timed out')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * إنشاء Unified Checkout Intention
 * @param {object} creds — { secret_key, public_key, integration_card, integration_wallet, integration_installment, hmac_secret }
 * @param {object} opts  — { amount, clientName, clientPhone, method, invoiceRef, redirectUrl }
 * @returns { redirectUrl, orderId }
 */
async function createPaymentUrl(creds, opts) {
  const { secret_key, public_key } = creds;
  if (!secret_key) throw new Error('Paymob Secret Key مطلوب');
  if (!public_key) throw new Error('Paymob Public Key مطلوب');

  const { amount, clientName, clientPhone, method = 'card', invoiceRef, redirectUrl: redir } = opts;

  // اختيار الـ integration ID حسب طريقة الدفع
  const integrationMap = {
    card:        creds.integration_card,
    wallet:      creds.integration_wallet,
    installment: creds.integration_installment,
  };
  const integrationId = integrationMap[method] || integrationMap.card;
  if (!integrationId) throw new Error(`Integration ID لـ ${method} غير مضبوط — أضفه في إعدادات بوابات الدفع`);

  const amountCents = Math.round(parseFloat(amount) * 100);
  const nameParts   = (clientName || 'عميل').split(' ');

  let phone = (clientPhone || '').replace(/\D/g, '');
  if (phone.startsWith('0'))   phone = '2' + phone;
  if (!phone.startsWith('20')) phone = '20' + phone;
  if (!phone) phone = '201000000000';

  const ourRef = invoiceRef || `PAY-${Date.now()}`;

  const payload = {
    amount:          amountCents,
    currency:        'EGP',
    payment_methods: [String(integrationId)],
    items: [{ name: 'دفعة', amount: amountCents, quantity: 1 }],
    billing_data: {
      first_name:   nameParts[0] || 'عميل',
      last_name:    nameParts.slice(1).join(' ') || 'Pro',
      phone_number: `+${phone}`,
      email:        'pay@areejegypt.com',
    },
    merchant_order_id: ourRef,
    redirection_url:   redir || `${opts.baseUrl || ''}/pay/result`,
  };

  const resp = await httpsPost(
    'https://accept.paymob.com/v1/intention/',
    payload,
    { Authorization: `Token ${secret_key}` }
  );

  if (!resp.data?.client_secret) {
    throw new Error(typeof resp.data === 'string' ? resp.data : (resp.data?.detail || JSON.stringify(resp.data)));
  }

  const clientSecret = resp.data.client_secret;
  const orderId      = String(resp.data.id || Date.now());
  const redirectUrl  = `https://accept.paymob.com/unifiedcheckout/?publicKey=${public_key}&clientSecret=${clientSecret}`;

  return { redirectUrl, orderId, ourRef };
}

/**
 * التحقق من HMAC الـ webhook
 */
function verifyHmac(creds, data, receivedHmac) {
  const hmacSecret = creds?.hmac_secret;
  if (!hmacSecret) return true;

  const str = [
    data.amount_cents, data.created_at, data.currency,
    data.error_occured, data.has_parent_transaction, data.id,
    data.integration_id, data.is_3d_secure, data.is_auth,
    data.is_capture, data.is_refunded, data.is_standalone_payment,
    data.is_voided, data.order?.id ?? data.order, data.owner,
    data.pending,
    data.source_data?.pan ?? data['source_data.pan'],
    data.source_data?.sub_type ?? data['source_data.sub_type'],
    data.source_data?.type ?? data['source_data.type'],
    data.success,
  ].join('');

  const computed = crypto.createHmac('sha512', hmacSecret).update(str).digest('hex').toUpperCase();
  return computed === (receivedHmac || '').toUpperCase();
}

module.exports = { createPaymentUrl, verifyHmac };
