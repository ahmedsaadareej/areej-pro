/**
 * Centralized Error Handler — Areej Pro
 * ══════════════════════════════════════
 * - يمنع كشف stack traces و DB internals للـ users
 * - يسجّل الأخطاء في الـ console مع تفاصيل كاملة للـ devs
 * - يرجع رسالة آمنة وقصيرة للـ client
 */
'use strict';

// أخطاء SQLite المعروفة — نترجمها لرسائل مفهومة
const SQLITE_MESSAGES = {
  'SQLITE_CONSTRAINT_UNIQUE': 'هذا العنصر موجود بالفعل',
  'SQLITE_CONSTRAINT_FOREIGNKEY': 'لا يمكن الحذف — مرتبط بعناصر أخرى',
  'SQLITE_CONSTRAINT_NOTNULL': 'حقل مطلوب ناقص',
  'SQLITE_TOOBIG': 'البيانات كبيرة جداً',
  'SQLITE_FULL': 'مساحة التخزين ممتلئة',
};

// هل نحن في بيئة development؟
const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Express error middleware (4 params = error handler)
 */
function errorHandler(err, req, res, next) {
  // سجّل الخطأ الكامل داخلياً
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] ${timestamp} ${req.method} ${req.path}`, {
    message: err.message,
    code: err.code,
    user: req.user?.id || 'anonymous',
    stack: IS_DEV ? err.stack : '[hidden in production]',
  });

  // لو الـ response اتبعت بالفعل، خلّي Express يتعامل معاه
  if (res.headersSent) return next(err);

  // تحديد نوع الخطأ
  let status = err.status || err.statusCode || 500;
  let message = 'حدث خطأ غير متوقع';

  // Validation errors (من الـ validate helper)
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  }
  // SQLite errors
  else if (err.code && SQLITE_MESSAGES[err.code]) {
    status = 409;
    message = SQLITE_MESSAGES[err.code];
  }
  else if (err.code === 'SQLITE_ERROR') {
    status = 500;
    message = IS_DEV ? err.message : 'خطأ في قاعدة البيانات';
  }
  // JWT errors
  else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'جلسة منتهية — يرجى تسجيل الدخول مجدداً';
  }
  // Multer file upload errors
  else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'حجم الملف أكبر من المسموح به';
  }
  // في الـ dev: نكشف الرسالة الحقيقية
  else if (IS_DEV) {
    message = err.message || message;
  }

  res.status(status).json({ ok: false, error: message });
}

/**
 * Not Found handler — يمسك الـ routes الغير موجودة في /api
 */
function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'المسار غير موجود' });
  }
  // غير /api → خلّي Express يكمل (static files)
  res.status(404).json({ ok: false, error: 'not found' });
}

module.exports = { errorHandler, notFoundHandler };
