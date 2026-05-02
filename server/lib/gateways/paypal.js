/**
 * paypal.js — PayPal Orders API v2 Gateway
 * آخر تحديث: 2026-05-02
 *
 * الـ Flow:
 *   1. getAccessToken(creds) → Bearer token
 *   2. createOrder(creds, linkData) → { orderId, approveUrl }
 *   3. العميل يوافق على PayPal
 *   4. PayPal redirect لـ return_url?token=ORDER_ID
 *   5. captureOrder(creds, orderId) → تأكيد وقبض المبلغ
 *
 * المتطلبات:
 *   - client_id     : من PayPal Developer Dashboard
 *   - client_secret : من PayPal Developer Dashboard
 *   - mode          : 'sandbox' أو 'live' (افتراضي: live)
 *
 * PayPal Docs: https://developer.paypal.com/docs/api/orders/v2/
 */

'use strict';

const BASE_URL = process.env.BASE_URL || 'https://pro.areejegypt.com';

function getBaseUrl(mode) {
  return mode === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

/**
 * جلب Access Token من PayPal
 */
async function getAccessToken(creds) {
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error('PayPal: client_id و client_secret مطلوبان');
  }

  const fetch   = (await import('node-fetch')).default;
  const baseUrl = getBaseUrl(creds.mode || 'live');
  const auth    = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');

  const resp = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body:   'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error('PayPal auth: ' + (data?.error_description || `HTTP ${resp.status}`));
  }

  return data.access_token;
}

/**
 * إنشاء PayPal Order وإرجاع رابط الموافقة
 */
async function createPaymentLink(creds, linkData) {
  const fetch       = (await import('node-fetch')).default;
  const baseUrl     = getBaseUrl(creds.mode || 'live');
  const accessToken = await getAccessToken(creds);
  const token       = linkData.token;

  // PayPal يقبل USD/EUR/GBP — لو العملة جنيه نحوّلها
  const currency = ['USD', 'EUR', 'GBP', 'SAR', 'AED'].includes((linkData.currency || '').toUpperCase())
    ? linkData.currency.toUpperCase()
    : 'USD';

  const amount = parseFloat(linkData.amount).toFixed(2);

  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id:  token,
      description:   linkData.description || 'دفعة عبر Areej Pro',
      amount: {
        currency_code: currency,
        value:         amount,
      },
    }],
    application_context: {
      brand_name:          'Areej Pro',
      locale:              'ar-EG',
      landing_page:        'BILLING',
      shipping_preference: 'NO_SHIPPING',
      user_action:         'PAY_NOW',
      return_url:          `${BASE_URL}/api/pay/paypal/return?areej_token=${token}`,
      cancel_url:          `${BASE_URL}/pay/${token}?cancelled=1`,
    },
  };

  const resp = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'PayPal-Request-Id': `areej-${token}-${Date.now()}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('PayPal order: ' + (data?.message || `HTTP ${resp.status}`));
  }

  // رابط الموافقة = rel: 'approve'
  const approveLink = data.links?.find(l => l.rel === 'approve');
  if (!approveLink) throw new Error('PayPal: لا يوجد رابط موافقة في الـ response');

  return {
    redirectUrl: approveLink.href,
    gatewayRef:  data.id,
  };
}

/**
 * تأكيد وقبض المبلغ بعد موافقة العميل
 */
async function captureOrder(creds, orderId) {
  const fetch       = (await import('node-fetch')).default;
  const baseUrl     = getBaseUrl(creds.mode || 'live');
  const accessToken = await getAccessToken(creds);

  const resp = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body:   '{}',
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error('PayPal capture: ' + (data?.message || `HTTP ${resp.status}`));

  const unit   = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];

  return {
    paid:       capture?.status === 'COMPLETED',
    amount:     parseFloat(capture?.amount?.value || 0),
    currency:   capture?.amount?.currency_code,
    gatewayRef: data.id,
    captureId:  capture?.id,
    rawData:    data,
  };
}

/**
 * اختبار الاتصال
 */
async function testConnection(creds) {
  // getAccessToken بيرمي error لو الـ credentials غلط
  const token = await getAccessToken(creds);
  if (!token) throw new Error('لم يتم الحصول على Access Token');
  return { ok: true, message: 'الاتصال بـ PayPal ناجح' };
}

module.exports = { getAccessToken, createPaymentLink, captureOrder, testConnection };
