/**
 * Inbox v4 Routes — /api/inbox/*
 * آخر تحديث: 2026-05-03 (P5-1 context route)
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

// ─── Auth + Tenant DB ─────────────────────────────────────────────────────
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

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
router.use('/analytics', require('./analytics'));

// [Phase 6] Settings
// router.use('/', require('./settings'));

module.exports = router;
