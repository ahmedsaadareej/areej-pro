/**
 * paytabs.js — PayTabs Hosted Payment Page Gateway
 * آخر تحديث: 2026-05-02
 *
 * الـ Flow:
 *   1. createPaymentLink(creds, linkData) → { redirectUrl, gatewayRef }
 *   2. العميل يكمل الدفع على صفحة PayTabs
 *   3. PayTabs يعمل redirect لـ return_url + callback لـ server_url
 *   4. webhook على /api/pay/webhook/paytabs يستدعي handlePaymentSuccess()
 *
 * المتطلبات:
 *   - profile_id : رقم الـ Profile ID من PayTabs Dashboard
 *   - server_key : Server Key من PayTabs Dashboard
 *   - region     : ARE | EGY | SAU | OMN | JOR | TUN | PAK | IRQ | Global
 *
 * PayTabs Docs: https://support.paytabs.com/en/support/solutions/articles/60000799151
 * Regions API: https://api.paytabs.com (EGY), https://secure.paytabs.com (SAU/ARE)
 */

'use strict';

const BASE_URL = process.env.BASE_URL || 'https://pro.areejegypt.com';

// Endpoint لكل region
const REGION_ENDPOINTS = {
  EGY:    'https://secure-egypt.paytabs.com',
  ARE:    'https://secure.paytabs.com',
  SAU:    'https://secure.paytabs.sa',
  OMN:    'https://secure-oman.paytabs.com',
  JOR:    'https://secure-jordan.paytabs.com',
  PAK:    'https://secure-pakistan.paytabs.com',
  IRQ:    'https://secure-iraq.paytabs.com',
  Global: 'https://secure-global.paytabs.com',
};

function getEndpoint(region) {
  return REGION_ENDPOINTS[region] || REGION_ENDPOINTS['EGY'];
}

/**
 * إنشاء PayTabs Hosted Payment Page وإرجاع رابط الدفع
 */
async function createPaymentLink(creds, linkData) {
  if (!creds?.profile_id) throw new Error('PayTabs: profile_id مطلوب');
  if (!creds?.server_key) throw new Error('PayTabs: server_key مطلوب');

  const fetch    = (await import('node-fetch')).default;
  const endpoint = getEndpoint(creds.region || 'EGY');
  const token    = linkData.token;

  const body = {
    profile_id:   parseInt(creds.profile_id),
    tran_type:    'sale',
    tran_class:   'ecom',
    cart_id:      token,
    cart_currency: linkData.currency || 'EGP',
    cart_amount:  parseFloat(linkData.amount),
    cart_description: linkData.description || 'دفعة عبر Areej Pro',
    paypage_lang: 'ar',
    callback:     `${BASE_URL}/api/pay/webhook/paytabs`,
    return:       `${BASE_URL}/api/pay/paytabs/return?token=${token}`,
    customer_details: {
      name:    linkData.customer_name  || 'عميل',
      email:   linkData.customer_email || 'customer@areejegypt.com',
      phone:   linkData.customer_phone || '01000000000',
      street1: 'Cairo',
      city:    'Cairo',
      state:   'CAI',
      country: 'EG',
      zip:     '12345',
    },
    shipping_details: {
      name:    linkData.customer_name  || 'عميل',
      email:   linkData.customer_email || 'customer@areejegypt.com',
      phone:   linkData.customer_phone || '01000000000',
      street1: 'Cairo',
      city:    'Cairo',
      state:   'CAI',
      country: 'EG',
      zip:     '12345',
    },
  };

  const resp = await fetch(`${endpoint}/payment/request`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': creds.server_key,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();

  if (!resp.ok || !data.redirect_url) {
    throw new Error('PayTabs: ' + (data?.message || data?.details || `HTTP ${resp.status}`));
  }

  return {
    redirectUrl: data.redirect_url,
    gatewayRef:  data.tran_ref || data.cart_id,
  };
}

/**
 * التحقق من callback من PayTabs
 * PayTabs يرسل POST بيانات الـ transaction في الـ callback
 */
function verifyCallback(body) {
  return {
    paid:         body?.payment_result?.response_status === 'A',
    amount:       parseFloat(body?.cart_amount || 0),
    token:        body?.cart_id,
    gatewayRef:   body?.tran_ref,
    responseMsg:  body?.payment_result?.response_message,
    rawData:      body,
  };
}

/**
 * اختبار الاتصال — يجلب payment methods المتاحة
 */
async function testConnection(creds) {
  if (!creds?.profile_id || !creds?.server_key) {
    throw new Error('profile_id و server_key مطلوبان');
  }

  const fetch    = (await import('node-fetch')).default;
  const endpoint = getEndpoint(creds.region || 'EGY');

  const resp = await fetch(`${endpoint}/payment/request`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': creds.server_key,
    },
    body:   JSON.stringify({
      profile_id:       parseInt(creds.profile_id),
      tran_type:        'sale',
      tran_class:       'ecom',
      cart_id:          'test_connection_' + Date.now(),
      cart_currency:    'EGP',
      cart_amount:      1,
      cart_description: 'Test Connection',
      callback:         'https://example.com/callback',
      return:           'https://example.com/return',
      customer_details: {
        name: 'Test', email: 'test@test.com', phone: '01000000000',
        street1: 'Cairo', city: 'Cairo', state: 'CAI', country: 'EG', zip: '12345',
      },
      shipping_details: {
        name: 'Test', email: 'test@test.com', phone: '01000000000',
        street1: 'Cairo', city: 'Cairo', state: 'CAI', country: 'EG', zip: '12345',
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await resp.json();

  // PayTabs بيرجع redirect_url لو الـ credentials صح
  if (data?.redirect_url || resp.status === 200) {
    return { ok: true, message: 'الاتصال بـ PayTabs ناجح' };
  }

  throw new Error(data?.message || data?.details || `HTTP ${resp.status}`);
}

module.exports = { createPaymentLink, verifyCallback, testConnection, getEndpoint };
