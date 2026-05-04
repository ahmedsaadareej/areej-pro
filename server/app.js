require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const path       = require('path');
const compression = require('compression');
const { errorHandler } = require('./middleware/errorHandler');
const helmet  = require('helmet');

const app  = express();
const PORT = process.env.PORT || 3002;

// ── Middleware ────────────────────────────────────────────────────────────
// Trust proxy (nginx/caddy in front)
app.set('trust proxy', 1);

// ── Gzip Compression ─────────────────────────────────────────────────────
// يضغط كل الـ responses أكبر من 1KB تلقائياً
app.use(compression({ threshold: 1024 }));

// ── Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,       // SPA inline scripts — تعطيل مؤقت حتى نهاجر الـ frontend
  crossOriginEmbedderPolicy: false,   // نفس السبب
  hsts: {
    maxAge: 31536000,                 // سنة كاملة
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ── Hide server fingerprint ───────────────────────────────────────────────
app.disable('x-powered-by');

// Rate Limiting
const rateLimit = require('express-rate-limit');

// Global: 500 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { ok: false, error: 'طلبات كثيرة جداً — حاول مرة أخرى بعد دقيقة' },
  skip: (req) => req.path === '/health',
}));

// API: 200 req/min per token
app.use('/api/system', rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  validate: false,
  keyGenerator: (req) => (req.headers.authorization || req.ip || 'anonymous').substring(0, 50),
  message: { ok: false, error: 'حد الطلبات المسموح تجاوزته — انتظر دقيقة' },
}));

// Inbox rate limit removed


// Webhook: 100 req/min
app.use('/api/webhook', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  validate: false,
  message: { ok: false, error: 'Webhook rate limit exceeded' },
}));

// ── CORS — restrict to areejegypt.com subdomains only ───────────────────
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?areejegypt\.com$/,
  /^http:\/\/localhost(:\d+)?$/       // dev only
];
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin (no origin header) or matched domain
    if (!origin || ALLOWED_ORIGINS.some(r => r.test(origin))) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: true
}));

// ── Body size limit (prevent large payload attacks) ──────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan('tiny'));
app.use(require('./tenant-middleware')); // slug-based tenant context

// ── API Routes FIRST (before static) ──────────────────────────────────────
app.use('/api/auth',    require('./routes-auth'));
app.use('/api/billing', require('./routes-billing'));
app.use('/api/webhook', require('./routes-inbox-webhook'));
app.use('/api/public',  require('./routes-public'));
// Email inbound webhook — public (no auth, token في URL)
app.use('/api/inbox', require('./routes/inbox/email'));
app.use('/api/pay',     require('./routes/pay'));        // Payment links (public — no auth)
app.use('/api/persons', require('./routes-persons'));
app.use('/api/system',  require('./routes-system'));
app.use('/api/inbox',   require('./routes/inbox/index'));  // Inbox v4 (موازي لـ v3 على /api/system)
app.use('/api/crm',     require('./routes-crm'));
app.use('/api/users',   require('./routes-users'));
app.use('/api/hr',      require('./routes-hr'));

// ── Static files (after API routes) ──────────────────────────────────────
// Uploads: no directory listing, no script execution via Content-Type sniffing
app.use('/uploads', (req, res, next) => {
  // Block path traversal attempts
  if (req.path.includes('..') || req.path.includes('%2e')) {
    return res.status(400).json({ ok: false, error: 'Invalid path' });
  }
  next();
}, express.static(require('path').join(__dirname, '../public/uploads'), {
  dotfiles: 'deny',
  index: false
}));
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders(res, filePath) {
    // HTML: لا cache أبداً — عشان المستخدم ياخد آخر version
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
    // JS + CSS: cache سنة كاملة — بنستخدم ETag للـ invalidation
    else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // صور وفونتس: cache سبع أيام
    else if (/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// ── SPA fallback ──────────────────────────────────────────────────────────

// ── WA QR Auto-Restore on Startup ──────────────────────────
// Delay 10s after server start to let everything initialize
setTimeout(() => {
  try {
    const waQR = require('./whatsapp-qr-service');
    if (typeof waQR.autoRestoreAllSessions === 'function') {
      console.log('[Startup] Auto-restoring WA QR sessions...');
      waQR.autoRestoreAllSessions().catch(e => console.error('[Startup] WA QR restore error:', e.message));
    }
  } catch(e) { console.error('[Startup] WA QR module error:', e.message); }
}, 10000);

// ── Health Check (internal watchdog only — no sensitive data exposed) ────
app.get('/health', (req, res) => {
  const master = require('./db-master');
  try {
    master.prepare('SELECT 1').get(); // DB connectivity check
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      status: 'healthy',
      uptime_human: formatUptime(uptime),
      memory_mb: Math.round(mem.rss / 1024 / 1024),
      timestamp: new Date().toISOString()
      // ⚠️ لا نكشف عدد المستخدمين للعالم
    });
  } catch(e) {
    res.status(500).json({ ok: false, status: 'unhealthy' });
  }
});

function formatUptime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h + 'h ' + m + 'm';
}

app.get('/csat/:token',        (req, res) => res.sendFile(require('path').join(__dirname, '../public/csat/index.html')));
app.get('/pay/:token',         (req, res) => res.sendFile(path.join(__dirname, '../public/pay/index.html')));
app.get('/pay/:token/result',  (req, res) => res.sendFile(path.join(__dirname, '../public/pay/index.html')));
app.get('/track/:waybill',    (req, res) => res.sendFile(path.join(__dirname, '../public/track/index.html')));
app.get('/order-form/:token', (req, res) => res.sendFile(path.join(__dirname, '../public/order-form/index.html')));
app.get('/landing*', (req, res) => res.sendFile(path.join(__dirname, '../public/landing/index.html')));
// T19+T20: App Shell (Inbox SPA) — يجب أن تكون قبل /dashboard*
app.get('/inbox*',    (req, res) => res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html')));
app.get(['/contacts*', '/reports*', '/settings*'], (req, res) => res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html')));
app.get('/dashboard*', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard/index.html')));
app.get('/my*', (req, res) => res.sendFile(path.join(__dirname, '../public/my/index.html')));
app.get('/admin*',     (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/owner*',     (req, res) => res.sendFile(path.join(__dirname, '../public/owner/index.html')));
app.get('/register*',  (req, res) => res.sendFile(path.join(__dirname, '../public/register/index.html')));

// Smart root routing
app.get('/', (req, res) => {
  const host = req.headers.host || '';
  if (host === 'pro.areejegypt.com' || host === 'localhost:3002' || !host.startsWith('pro-')) {
    return res.sendFile(path.join(__dirname, '../public/landing/index.html'));
  }
  res.sendFile(path.join(__dirname, '../public/auth/index.html'));
});

app.get('*',           (req, res) => res.sendFile(path.join(__dirname, '../public/auth/index.html')));

// ── Centralized Error Handler (must be LAST middleware) ──────────────────────
app.use(errorHandler);

// Start background cron jobs
// آخر تحديث: 2026-05-04 — P11-E1 (تمرير getTenantDb لـ scheduled reports)
try {
  const masterDb        = require('./db-master');
  const { sendMail }    = require('./email');
  const { getTenantDb } = require('./db-tenant');
  require('./cron-jobs').startCronJobs(masterDb, sendMail, getTenantDb);
} catch(e) { console.error('Cron start error:', e.message); }

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => console.log(`[Areej Pro] running on port ${PORT}`));
