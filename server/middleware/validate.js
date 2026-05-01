/**
 * Input Validation & Sanitization Helper — Areej Pro
 * ════════════════════════════════════════════════════
 * استخدام:
 *   const { validate, sanitize, assertId } = require('../middleware/validate');
 *
 *   // في route handler:
 *   const { name, amount } = validate(req.body, {
 *     name:   { required: true, type: 'string', maxLen: 200 },
 *     amount: { required: true, type: 'number', min: 0 },
 *   });
 */
'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * sanitize — ينظّف string من HTML/XSS
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * sanitizeDeep — ينظّف كل strings في object/array
 */
function sanitizeDeep(obj) {
  if (typeof obj === 'string') return sanitize(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k] = sanitizeDeep(v);
    return result;
  }
  return obj;
}

/**
 * assertId — يتحقق إن الـ ID صحيح (رقم موجب)
 * @throws ValidationError
 */
function assertId(val, fieldName = 'id') {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) {
    throw new ValidationError(`قيمة ${fieldName} غير صالحة`);
  }
  return n;
}

/**
 * validate — يتحقق من الـ body ويرجع القيم المنظّفة
 * @param {object} body   - req.body
 * @param {object} schema - { fieldName: { required, type, maxLen, min, max, enum } }
 * @returns {object} validated & sanitized values
 * @throws ValidationError
 */
function validate(body, schema) {
  const result = {};

  for (const [field, rules] of Object.entries(schema)) {
    let val = body[field];

    // Required check
    if (rules.required && (val === undefined || val === null || val === '')) {
      throw new ValidationError(`الحقل "${rules.label || field}" مطلوب`);
    }

    // Skip optional empty fields
    if (val === undefined || val === null || val === '') {
      result[field] = val ?? null;
      continue;
    }

    // Type coercion & check
    if (rules.type === 'number' || rules.type === 'int' || rules.type === 'float') {
      val = +val;
      if (isNaN(val)) throw new ValidationError(`"${rules.label || field}" يجب أن يكون رقماً`);
      if (rules.type === 'int') val = Math.floor(val);
      if (rules.min !== undefined && val < rules.min)
        throw new ValidationError(`"${rules.label || field}" لا يمكن أن يكون أقل من ${rules.min}`);
      if (rules.max !== undefined && val > rules.max)
        throw new ValidationError(`"${rules.label || field}" لا يمكن أن يتجاوز ${rules.max}`);
    }

    else if (rules.type === 'string' || !rules.type) {
      val = String(val).trim();
      if (rules.maxLen && val.length > rules.maxLen)
        throw new ValidationError(`"${rules.label || field}" يتجاوز الحد الأقصى (${rules.maxLen} حرف)`);
      if (rules.minLen && val.length < rules.minLen)
        throw new ValidationError(`"${rules.label || field}" أقصر من الحد الأدنى (${rules.minLen} حرف)`);
      // Sanitize strings by default unless noSanitize
      if (!rules.noSanitize) val = sanitize(val);
    }

    else if (rules.type === 'boolean') {
      val = val === true || val === 'true' || val === 1 || val === '1';
    }

    else if (rules.type === 'date') {
      const d = new Date(val);
      if (isNaN(d.getTime())) throw new ValidationError(`"${rules.label || field}" تاريخ غير صالح`);
      val = d.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // Enum check
    if (rules.enum && !rules.enum.includes(val)) {
      throw new ValidationError(`"${rules.label || field}" قيمة غير مسموح بها`);
    }

    result[field] = val;
  }

  return result;
}

/**
 * validateMiddleware — يمكن استخدامه كـ Express middleware
 * @param {object} schema
 */
function validateMiddleware(schema) {
  return (req, res, next) => {
    try {
      req.validated = validate(req.body, schema);
      next();
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  };
}

module.exports = { validate, validateMiddleware, sanitize, sanitizeDeep, assertId, ValidationError };
