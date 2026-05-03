/**
 * Inbox v4 Routes — /api/inbox/*
 * آخر تحديث: 2026-05-03
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

// [Phase 3] Labels
// router.use('/', require('./labels'));

// [Phase 4] Automation
// router.use('/', require('./automation'));

// [Phase 5] Analytics
// router.use('/', require('./analytics'));

// [Phase 6] Settings
// router.use('/', require('./settings'));

module.exports = router;
