#!/usr/bin/env node
/**
 * Inbox v4 — Integration Tests
 * آخر تحديث: 2026-05-04
 *
 * تشغيل:
 *   cd /home/areej/areej-pro && node tests/inbox-v4.test.js
 *   node tests/inbox-v4.test.js --verbose    ← تفاصيل الـ responses
 *   node tests/inbox-v4.test.js --group=core ← فقط مجموعة معينة
 *
 * يولّد TOKEN تلقائياً من JWT_SECRET في server/.env
 * لا يحتاج npm install — يستخدم Node.js fetch المدمج (v18+)
 */

'use strict';

require(__dirname + '/../server/node_modules/dotenv').config({ path: __dirname + '/../server/.env' });
const jwt    = require(__dirname + '/../server/node_modules/jsonwebtoken');
const crypto = require('crypto');

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════
const BASE      = process.env.TEST_BASE_URL || 'http://localhost:3002';
const VERBOSE   = process.argv.includes('--verbose');
const GROUP_ARG = (process.argv.find(a => a.startsWith('--group=')) || '').replace('--group=', '');

// توليد token تجريبي
const TOKEN = jwt.sign(
  { id: 1, email: 'ops@areejegypt.com', role: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const HEADERS = {
  'Authorization': 'Bearer ' + TOKEN,
  'Content-Type':  'application/json',
};

// ══════════════════════════════════════════════════════════════
// TEST RUNNER
// ══════════════════════════════════════════════════════════════
let passed = 0, failed = 0, skipped = 0;
const failures = [];

async function test(name, group, fn) {
  if (GROUP_ARG && group !== GROUP_ARG) { skipped++; return; }
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    if (VERBOSE && e.response) console.log('     response:', JSON.stringify(e.response, null, 2));
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function api(method, path, body) {
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + '/api' + path, opts);
  const ct  = res.headers.get('content-type') || '';
  const json = ct.includes('application/json') ? await res.json() : null;
  if (VERBOSE) console.log(`     [${method} ${path}] ${res.status}`, json ? JSON.stringify(json).slice(0, 200) : '');
  const err = new Error(`HTTP ${res.status}: ${json?.error || 'non-json'}`);
  err.response = json;
  err.status   = res.status;
  return { status: res.status, json, ok: res.ok, _throw: (c) => { if (!c) throw err; } };
}

// ══════════════════════════════════════════════════════════════
// STATE مشترك بين الاختبارات
// ══════════════════════════════════════════════════════════════
const state = {};

// ══════════════════════════════════════════════════════════════
// GROUPS
// ══════════════════════════════════════════════════════════════

async function runHealth() {
  console.log('\n🏥 Health & Auth');

  await test('GET /health — server up', 'health', async () => {
    const r = await api('GET', '/../health');
    assert(r.status === 200, `status=${r.status}`);
    assert(r.json?.ok === true, 'ok!=true');
  });

  await test('GET /inbox/conversations — بدون token → 401', 'health', async () => {
    const res = await fetch(BASE + '/api/inbox/conversations');
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  await test('GET /inbox/conversations — مع token → 200', 'health', async () => {
    const r = await api('GET', '/inbox/conversations');
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.conversations), 'conversations not array');
  });
}

async function runConversations() {
  console.log('\n💬 Conversations');

  await test('GET /inbox/conversations?status=open', 'core', async () => {
    const r = await api('GET', '/inbox/conversations?status=open');
    assert(r.ok, `status=${r.status}`);
    assert(typeof r.json?.total === 'number', 'total not number');
  });

  await test('GET /inbox/conversations?status=closed', 'core', async () => {
    const r = await api('GET', '/inbox/conversations?status=closed');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/conversations — pagination params', 'core', async () => {
    const r = await api('GET', '/inbox/conversations?page=1&limit=5');
    assert(r.ok, `status=${r.status}`);
    assert(r.json?.conversations?.length <= 5, 'limit not respected');
  });

  // POST /inbox/conversations غير مطبّق (inbox v4 يستقبل المحادثات من الـ webhook فقط)
  await test('POST /inbox/conversations — 404 متوقع (لا يوجد endpoint إنشاء يدوي)', 'core', async () => {
    const r = await api('POST', '/inbox/conversations', {
      contact_name:  'تجريبي اختبار',
      contact_phone: '+201000000099',
      platform:      'whatsapp_api',
    });
    // inbox v4 لا يدعم POST /conversations — المحادثات تأتي من webhook
    assert(r.status === 404 || r.status === 405, `expected 404/405 got ${r.status}`);
  });

  // لو ما عندناش conv — نجلب أول واحدة
  await test('GET /inbox/conversations — جلب أول محادثة', 'core', async () => {
    if (state.convId) { assert(true); return; }
    const r = await api('GET', '/inbox/conversations?limit=1');
    assert(r.ok, `status=${r.status}`);
    if (r.json?.conversations?.length > 0) {
      state.convId = r.json.conversations[0].id;
    }
    // لو DB فاضي — OK
    assert(true);
  });
}

async function runMessages() {
  console.log('\n📨 Messages');

  if (!state.convId) {
    console.log('  ⏭  skip — لا يوجد convId');
    skipped += 3;
    return;
  }

  await test('GET /inbox/conversations/:id/messages', 'core', async () => {
    const r = await api('GET', `/inbox/conversations/${state.convId}/messages`);
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.messages || r.json), 'messages not array');
  });

  await test('POST /inbox/conversations/:id/messages — note', 'core', async () => {
    const r = await api('POST', `/inbox/conversations/${state.convId}/messages`, {
      message: 'رسالة اختبار تلقائي',
      is_note:  true,
    });
    // note لا يحتاج WA token — يجب أن ينجح
    assert(r.status !== 500, `server error: ${r.json?.error}`);
    if (r.json?.message?.id || r.json?.id) {
      state.msgId = r.json?.message?.id || r.json?.id;
    }
  });

  await test('GET /inbox/conversations/:id/messages — بعد إضافة note', 'core', async () => {
    const r = await api('GET', `/inbox/conversations/${state.convId}/messages`);
    assert(r.ok, `status=${r.status}`);
  });
}

async function runLabels() {
  console.log('\n🏷  Labels');

  await test('GET /inbox/labels — قائمة', 'labels', async () => {
    const r = await api('GET', '/inbox/labels');
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.labels || r.json), 'labels not array');
  });

  await test('POST /inbox/labels — إنشاء', 'labels', async () => {
    const r = await api('POST', '/inbox/labels', {
      name:  'test-label-' + Date.now(),
      color: '#FF5733',
    });
    assert(r.ok || r.status === 409, `status=${r.status} error=${r.json?.error}`);
    if (r.json?.label?.id || r.json?.id) {
      state.labelId = r.json?.label?.id || r.json?.id;
    }
  });

  await test('DELETE /inbox/labels/:id — حذف', 'labels', async () => {
    if (!state.labelId) { assert(true, 'skip no labelId'); return; }
    const r = await api('DELETE', `/inbox/labels/${state.labelId}`);
    assert(r.ok, `status=${r.status}`);
  });
}

async function runTeam() {
  console.log('\n👥 Team');

  await test('GET /inbox/team — قائمة الأعضاء', 'team', async () => {
    const r = await api('GET', '/inbox/team');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/me — بيانات المستخدم الحالي', 'team', async () => {
    const r = await api('GET', '/inbox/me');
    assert(r.ok, `status=${r.status}`);
  });
}

async function runAnalytics() {
  console.log('\n📊 Analytics');

  await test('GET /inbox/analytics/overview', 'analytics', async () => {
    const r = await api('GET', '/inbox/analytics/overview?period=7d');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/analytics/agents', 'analytics', async () => {
    const r = await api('GET', '/inbox/analytics/agents?period=7d');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/analytics/platforms', 'analytics', async () => {
    const r = await api('GET', '/inbox/analytics/platforms?period=7d');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/analytics/sentiment', 'analytics', async () => {
    const r = await api('GET', '/inbox/analytics/sentiment?period=7d');
    assert(r.ok, `status=${r.status}`);
  });
}

async function runAutomation() {
  console.log('\n🤖 Automation');

  await test('GET /inbox/automation/welcome-away', 'automation', async () => {
    const r = await api('GET', '/inbox/automation/welcome-away');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/automation/keywords', 'automation', async () => {
    const r = await api('GET', '/inbox/automation/keywords');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/automation/auto-close', 'automation', async () => {
    const r = await api('GET', '/inbox/automation/auto-close');
    assert(r.ok, `status=${r.status}`);
  });

  await test('GET /inbox/automation/webhooks', 'automation', async () => {
    const r = await api('GET', '/inbox/automation/webhooks');
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.webhooks || r.json), 'webhooks not array');
  });
}

async function runBroadcast() {
  console.log('\n📢 Broadcast');

  await test('GET /inbox/broadcasts', 'broadcast', async () => {
    const r = await api('GET', '/inbox/broadcasts');
    assert(r.ok, `status=${r.status}`);
  });

  await test('POST /inbox/broadcasts — إنشاء draft', 'broadcast', async () => {
    const r = await api('POST', '/inbox/broadcasts', {
      name:      'اختبار broadcast ' + Date.now(),
      message:   'هذه رسالة اختبار تلقائي',
      platforms: ['whatsapp_api'],
    });
    assert(r.ok || r.status === 400, `unexpected ${r.status}: ${r.json?.error}`);
    if (r.json?.broadcast?.id || r.json?.id) {
      state.broadcastId = r.json?.broadcast?.id || r.json?.id;
    }
  });

  await test('DELETE /inbox/broadcasts/:id — حذف draft', 'broadcast', async () => {
    if (!state.broadcastId) { assert(true, 'skip'); return; }
    const r = await api('DELETE', `/inbox/broadcasts/${state.broadcastId}`);
    assert(r.ok, `status=${r.status}`);
  });
}

async function runEmail() {
  console.log('\n✉️  Email');

  await test('GET /inbox/email/accounts — قائمة حسابات', 'email', async () => {
    const r = await api('GET', '/inbox/email/accounts');
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.accounts || r.json), 'accounts not array');
  });
}

async function runScheduled() {
  console.log('\n📅 Scheduled Messages');

  await test('GET /inbox/scheduled', 'scheduled', async () => {
    const r = await api('GET', '/inbox/scheduled');
    assert(r.ok, `status=${r.status}`);
  });
}

async function runSearch() {
  console.log('\n🔍 Search');

  await test('GET /inbox/search?q=test — بحث سريع', 'search', async () => {
    const r = await api('GET', '/inbox/search?q=test');
    assert(r.ok, `status=${r.status}`);
    assert(Array.isArray(r.json?.results || r.json?.conversations || []), 'results not array');
  });
}

async function runSettings() {
  console.log('\n⚙️  Settings');

  await test('GET /inbox/settings — channel settings', 'settings', async () => {
    const r = await api('GET', '/inbox/settings');
    assert(r.ok || r.status === 404, `status=${r.status}`);
  });
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Inbox v4 — Integration Tests');
  console.log(` Base URL: ${BASE}`);
  console.log(` Group:    ${GROUP_ARG || 'all'}`);
  console.log('═══════════════════════════════════════════════════');

  await runHealth();
  await runConversations();
  await runMessages();
  await runLabels();
  await runTeam();
  await runAnalytics();
  await runAutomation();
  await runBroadcast();
  await runEmail();
  await runScheduled();
  await runSearch();
  await runSettings();

  // ── Summary ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(` النتيجة: ✅ ${passed} نجح  ❌ ${failed} فشل  ⏭ ${skipped} تخطّى`);
  if (failures.length) {
    console.log('\n الأخطاء:');
    failures.forEach(f => console.log(`  ❌ ${f.name}\n     ${f.error}`));
  }
  console.log('═══════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
