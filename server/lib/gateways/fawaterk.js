/**
 * fawaterk.js — Fawaterk Gateway (dynamic credentials)
 * آخر تحديث: 2026-05-02
 *
 * مختلف عن areej-payment: credentials تأتي كـ parameter لكل call
 * ولا تُقرأ من .env — مما يتيح Multi-Tenant
 */

'use strict';

const https   = require('https');
const crypto  = require('crypto');

const BASE_URL = 'https://app.fawaterk.com/api/v2';

const PAYMENT_METHODS = {
  card:   2,
  fawry:  3,
  wallet: 4,
  aman:   12,
  basata: 14,
  apple:  42,
};

function normalizePhone(phone) {
  let n = (phone || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('20')) n = '0' + n.slice(2);
  if (!n.startsWith('0')) n = '0' + n;
  return n;
}

// ── جلب بيانات raw عبر HTTPS (لا axios dependency) ──────────────────────────
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Fawaterk request timed out')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'GET',
      headers:  { 'Content-Type': 'application/json', ...headers },
      timeout:  10000,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Fawaterk GET timed out')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * إنشاء فاتورة دفع
 * @param {object} creds        — { api_key, vendor_key }
 * @param {object} opts         — { amount, clientName, clientPhone, method, invoiceRef, successUrl, failUrl, webhookUrl, itemName }
 * @returns { invoiceId, invoiceKey, ourRef, redirectUrl, paymentData, requiresAction, method }
 */
async function createInvoice(creds, opts) {
  const { api_key } = creds;
  if (!api_key) throw new Error('Fawaterk API Key مطلوب');

  const { amount, clientName, clientPhone, method = 'card', invoiceRef,
          successUrl, failUrl, webhookUrl, itemName } = opts;

  const paymentMethodId = PAYMENT_METHODS[method];
  if (!paymentMethodId) throw new Error(`طريقة دفع غير مدعومة: ${method}`);

  const nameParts = (clientName || 'عميل').split(' ');
  const ourRef    = invoiceRef || `PAY-${Date.now()}`;

  const payload = {
    payment_method_id: paymentMethodId,
    cartTotal:  String(amount),
    currency:   'EGP',
    invoice_number: ourRef,
    customer: {
      first_name: nameParts[0] || 'عميل',
      last_name:  nameParts.slice(1).join(' ') || 'Pro',
      email:      'pay@areejegypt.com',
      phone:      normalizePhone(clientPhone),
      address:    'Egypt',
    },
    redirectionUrls: {
      successUrl: successUrl || `${opts.baseUrl || ''}/pay/success`,
      failUrl:    failUrl    || `${opts.baseUrl || ''}/pay/fail`,
      pendingUrl: failUrl    || `${opts.baseUrl || ''}/pay/pending`,
      webhookUrl: webhookUrl || `${opts.baseUrl || ''}/api/pay/webhook/fawaterk`,
    },
    cartItems: [{ name: itemName || 'دفعة', price: String(amount), quantity: '1' }],
    payLoad:   { our_ref: ourRef, client_phone: clientPhone },
    redirectOption: method === 'wallet' ? true : undefined,
    lang: 'ar',
  };

  const resp = await httpsPost(`${BASE_URL}/invoiceInitPay`, payload, {
    Authorization: `Bearer ${api_key}`,
  });

  if (resp.data?.status !== 'success') {
    throw new Error(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data));
  }

  const d = resp.data.data;
  const hasRedirect = ['card', 'apple', 'wallet'].includes(method);

  return {
    invoiceId:      d.invoice_id,
    invoiceKey:     d.invoice_key,
    ourRef,
    paymentData:    d.payment_data,
    redirectUrl:    hasRedirect ? (d.payment_data?.redirectTo || null) : null,
    requiresAction: !hasRedirect,
    method,
  };
}

/**
 * التحقق من HMAC الـ webhook
 */
function verifyHmac(creds, { invoice_id, invoice_key, payment_method }, receivedHash) {
  const vendorKey = creds?.vendor_key;
  if (!vendorKey) return true; // skip if not set
  const str = `InvoiceId=${invoice_id}&InvoiceKey=${invoice_key}&PaymentMethod=${payment_method}`;
  const computed = crypto.createHmac('sha256', vendorKey).update(str).digest('hex');
  return computed.toLowerCase() === (receivedHash || '').toLowerCase();
}

/**
 * جلب حالة فاتورة
 */
async function getInvoiceStatus(creds, invoiceId) {
  try {
    const resp = await httpsGet(`${BASE_URL}/getInvoiceData/${invoiceId}`, {
      Authorization: `Bearer ${creds.api_key}`,
    });
    const data = resp.data?.data || resp.data || {};
    const raw  = data.invoice_status ?? data.status ?? data.invoiceStatus ?? '';
    let status = 'pending';
    if ([1, '1', 'paid', 'success'].includes(raw) || String(raw).toLowerCase() === 'paid') {
      status = 'paid';
    } else if ([2, '2', 'failed', 'fail', 'rejected', 'declined'].includes(raw)) {
      status = 'failed';
    } else if ([3, '3', 'expired', 'cancelled', 'canceled'].includes(raw)) {
      status = 'expired';
    }
    return { status, raw, data };
  } catch (err) {
    return { status: 'unknown', error: err.message };
  }
}

module.exports = { createInvoice, verifyHmac, getInvoiceStatus, PAYMENT_METHODS, normalizePhone };
