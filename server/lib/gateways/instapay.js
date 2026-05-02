/**
 * instapay.js — InstaPay Gateway (link-based, no API)
 * آخر تحديث: 2026-05-02
 */

'use strict';

/**
 * إنشاء رابط InstaPay
 * @param {object} creds — { instapay_link }
 * @param {object} opts  — { amount, clientName, clientPhone }
 * @returns { instapayLink, requiresAction: true }
 */
function createInstapayLink(creds, opts) {
  const link = creds?.instapay_link;
  if (!link) throw new Error('رابط InstaPay غير مضبوط — أضفه في إعدادات بوابات الدفع');

  return {
    instapayLink:   link,
    requiresAction: true,
    method:         'instapay',
    amount:         opts.amount,
  };
}

module.exports = { createInstapayLink };
