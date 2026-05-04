/**
 * Inbox v4 Routes — /api/inbox/*
 * آخر تحديث: 2026-05-04 (M1 T07 — loadInboxPermissions + requirePermission)
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

// ─── Auth + Tenant DB ─────────────────────────────────────────────────────
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

// ─── Inbox Permissions (M1 T07) ──────────────────────────────────────────
// يُحقن req.inboxUser.permissions على كل request بعد req.db
router.use(loadInboxPermissions);

// ─── Routes ───────────────────────────────────────────────────────────────

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
