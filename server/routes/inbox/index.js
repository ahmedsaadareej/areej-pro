/**
 * Inbox v4 Routes — /api/inbox/*
 * آخر تحديث: 2026-05-04 (M5 T13 — inboxAuthAdapter مُفعَّل قبل loadInboxPermissions)
 *
 * مسجّل في app.js كـ:
 *   app.use('/api/inbox', require('./routes/inbox/index'))
 *
 * Auth: requireAuth على كل الـ routes
 * Tenant DB: req.db مُحقون تلقائياً
 *
 * الـ routes:
 *   GET  /api/inbox/stream  ← SSE (stream.js)
 *   [المزيد يُضاف مع كل Phase]
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const { requireAuth }  = require('../../auth-middleware');
const { getTenantDb }  = require('../../db-tenant');
const { loadInboxPermissions, requirePermission } = require('./permissions');
const inboxAuthAdapter = require('../../inbox-auth-adapter');

// ─── Auth + Tenant DB ─────────────────────────────────────────────────────
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

// ─── Auth Adapter (M5 T13) ───────────────────────────────────────────────
// يبني req.inboxUser قبل loadInboxPermissions
// الترتيب: getTenantDb → inboxAuthAdapter → loadInboxPermissions
router.use(inboxAuthAdapter);

// ─── Inbox Permissions (M1 T07) ──────────────────────────────────────────
// لو req.inboxUser موجود (من inboxAuthAdapter) → تُكمّل permissions فقط
router.use(loadInboxPermissions);

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/inbox/me — بيانات المستخدم الحالي للـ App Shell
router.get('/me', (req, res) => {
  const u = req.inboxUser;
  res.json({
    id          : u.id,
    name        : u.name,
    email       : u.email,
    inbox_role_id: u.inbox_role_id,
    permissions : u.permissions || {},
    has_erp     : u.has_erp,
    has_payment : u.has_payment
  });
});

// PUT /api/inbox/me/status — تحديث حالة الموظف من الـ Shell
router.put('/me/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['online', 'busy', 'away', 'offline'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: 'حالة غير صالحة' });
  }
  try {
    req.db.prepare(
      `UPDATE inbox_agent_status_v4 SET status=?, updated_at=CURRENT_TIMESTAMP
       WHERE tenant_user_id=?`
    ).run(status, req.inboxUser.inbox_user_id);
    // لو السجل غير موجود → أنشئه
    const exists = req.db.prepare(
      `SELECT id FROM inbox_agent_status_v4 WHERE tenant_user_id=?`
    ).get(req.inboxUser.inbox_user_id);
    if (!exists) {
      req.db.prepare(
        `INSERT OR IGNORE INTO inbox_agent_status_v4 (tenant_user_id, status) VALUES (?, ?)`
      ).run(req.inboxUser.inbox_user_id, status);
    }
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// SSE stream
const { router: streamRouter } = require('./stream');
router.use('/', streamRouter);

// Phase 1 — Conversations, Messages, Labels, Counts
router.use('/', require('./conversations'));
router.use('/', require('./messages'));

// Phase 2 — Team Assignment
router.use('/', require('./team'));

// Phase 3 — Labels + Search
router.use('/', require('./labels'));
router.use('/', require('./search'));

// Phase 4 — Automation (P4-1 Keywords Auto-Reply) + (P4-2 Chatbot Flows)
router.use('/', require('./automation'));
router.use('/', require('./chatbot'));

// Phase 5 — Context Panel (P5-1 Customer Info + CRM Link)
router.use('/', require('./context'));

// Phase 3 cont. — Analytics + SLA (P3-6)
// requirePermission('reports_self') = أدنى مستوى — Agent وما فوقه
router.use('/analytics', requirePermission('reports_self'), require('./analytics'));

// Phase 7 — AI Features (P7-1)
router.use('/', require('./ai'));

// Phase 8-4 — Broadcast V2
router.use('/', require('./broadcast'));

// Phase 8-1 — Email Channel
router.use('/', require('./email'));

// Phase 10 M1 — Settings (Roles + Users)
router.use('/settings', require('./settings'));

module.exports = router;
