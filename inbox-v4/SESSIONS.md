## جلسة 2026-05-04 18:35 UTC — P11-D: Pilot Migration
- الحالة: مكتملة ✅
- ما تم:
  - **D1**: كتابة `server/scripts/migrate-inbox-v3-to-v4.js` (412 سطر)
    - dry-run mode + execute mode + --all mode
    - Transaction-safe (rollback كامل عند أي خطأ)
    - `inbox_migration_log` جدول جديد لتسجيل كل عملية
    - INSERT OR IGNORE = آمن لو شُغّل مرتين
    - تحويل direction: in/out → inbound/outbound
    - تحويل timestamps: TEXT → unix
    - تحديث first_message_at تلقائياً
  - **D2**: Dry-Run ناجح على Tenant 2 (pro-test)
    - 11 محادثة + 466 رسالة ✅
  - **D2**: تنفيذ الهجرة على Tenant 2
    - backup: `2.db.backup-20260504-183800`
    - نتيجة: 11/11 محادثة ✅ + 466/466 رسالة ✅
    - migration_log: status=ok ✅
  - Health check: `pm2 reload areej-pro` + `curl /health` → ok ✅
- قرارات: لا جديد (D-046 مُنفّذة)
- آخر commit: 7f8e333
- المهمة القادمة: **P11-E** — Deferred Features (Email مجدول + Contacts + PDF)

---

## جلسة 2026-05-04 18:37 UTC — P11-D: Pilot Migration
- الحالة: مكتملة ✅
- ما تم:
  - **D1**: `server/migrations.js` — migration v44: جدول `inbox_migration_log` + index
  - **D1**: `server/scripts/migrate-inbox-v3-to-v4.js` — migration utility كامل
    - Dry-run mode (`--dry-run`) + Execute mode (`--execute`) + `--all` flag
    - Rollback تلقائي عند أي خطأ (better-sqlite3 transaction)
    - INSERT OR IGNORE — آمن لو اتشغل مرتين
    - تحويل timestamps نص→unix + direction in/out→inbound/outbound
    - تحديث `first_message_at` بعد نقل الرسائل
    - FK safety: تخطي رسائل بـ conversation_id غير موجود في v4
  - **D2**: Pilot ناجح على Tenant 2 ✅
    - 11 محادثة + 466 رسالة مهاجرة
    - Backup: `data/tenants/2.db.backup-20260504-*`
    - Schema version: 44
    - Dry-run أولاً → Execute ناجح → تحقق → commit
  - pm2 restart areej-pro → server شغال ✅
- قرارات: D3 (قرار v4 كـ Default) — ينتظر مراجعة أحمد بعد أسبوع Pilot
- آخر commit: 6ff7186
- المهمة القادمة: **P11-D3** — مراجعة Pilot بعد أسبوع + قرار `/inbox` → v4 كـ Default

---

## جلسة 2026-05-04 18:00 UTC — P11-C: QA + Bugfix (Browser Automation)
- الحالة: مكتملة ✅
- ما تم:
  - **BUG-C1-01**: إصلاح email.js — req.inboxUser.id → req.user.id ✅
  - **BUG-C1-03**: inbox-auth-adapter fallback لـ platform owner ✅
  - api.js: تصدير _getToken لـ stream.js ✅
  - stream.js frontend: SSE token via ?_t= ✅
  - **Cloudflare SSE buffering**: Cloudflare يحجب SSE (HTTP/2 buffer) — تم تنفيذ Long Polling fallback
    - stream.js: 10s timeout على SSE CONNECTING → انتقال تلقائي لـ Long Polling
    - backend /api/inbox/poll: 25s hold + إشعار broadcast+sendToUser waiters
    - Caddyfile: flush_interval=-1 لـ SSE endpoint
  - تححق نهائي: sseConnected=true + "متصل" في UI ✅
- قرارات: لو Cloudflare غيّر إعدادات proxying ليعمل SSE، Long Polling يبقى كـ fallback
- آخر commit: d60fb2f
- المهمة القادمة: **P11-D Pilot Migration** — seed العميل الأول + تسليم access

---

## جلسة 2026-05-04 17:54 UTC — P11-B: Permissions DB
- الحالة: مكتملة ✅
- ما تم:
  - B1: تحقق migrations — Tenant 1 و 2 عند v43 ✅، باقي الـ tenants عند v17 (طبيعي)
  - B1: inbox_roles جاهزة (5 أدوار) + inbox_users + inboxAuthAdapter كلها موجودة ✅
  - B2: `server/scripts/seed-inbox-users.js` — seed كامل من tenant_users إلى inbox_users
    - Dry run ✅ ثم Execute ✅ على Tenant 1 (هشام سعد → inbox_role=1 Owner)
    - --all mode يتعامل مع tenants ناقصة الـ migrations بأمان (skip مع رسالة)
  - B3: تحقق Permission Guards — `requirePermission` مطبّق على settings routes ✅
    - Frontend: `_applyPermissionGuards()` في shell.js تخفي روابط بدون صلاحية ✅
    - Backend: `loadInboxPermissions` + `requirePermission` في permissions.js ✅
  - B4: Supervisor Team Filter — `getTeamFilter()` في analytics.js موجود ومطبّق ✅
- قرارات: لا جديد
- آخر commit: 13c86cc
- المهمة القادمة: **P11-C QA + Bugfix** — Console Error Audit + SSE Stability + Mobile + Dark Mode

---

## جلسة 2026-05-04 17:48 UTC — P11-A: Shell Wiring
- الحالة: مكتملة ✅
- ما تم:
  - A1: `page-reports.js` — استبدال `InboxAnalytics.open()` بـ `mount()` الرسمي
  - A2: `page-settings.js` — تبسيط كامل: تفويض لـ `InboxSettings.mount()` بدل layout مستقل
  - A3: `page-inbox.js` — مراجعة + إبقاء (كان سليماً)
  - A4: `shell.js` — `requestAnimationFrame` قبل `mod.mount()` + رسائل خطأ أوضح
  - A4: `index.html` — إضافة 33 script (كل الـ dashboard modules في الترتيب الصحيح)
  - A5: اختبار Deep Links — كل مسارات `/inbox*`, `/reports*`, `/settings*`, `/contacts` ترجع 200 ✅
  - كل الـ scripts تُخدَّم بـ 200 ✅ + health check نجح ✅
- قرارات: لا جديد
- آخر commit: 0db0bed
- المهمة القادمة: **P11-B Permissions DB** — seed inbox_users + اختبار Permission Guards

---
## جلسة 2026-05-04 17:11 UTC — M4 كامل: Analytics (T51→T63)
- الحالة: مكتملة ✅
- ما تم:
  - T51+T52: `migrations.js` — v42 (`inbox_scheduled_reports_v4` + index) + v43 (6 analytics indexes)
  - T53: `analytics.js` backend — `getInboxRole()` + `requireAnalyticsAccess()` + `requireOwnerAdmin()` + `getTeamFilter()`
  - T54: endpoint جديد `GET /analytics/labels` — تحليل تصنيفات + trend أكثر 5
  - T55: endpoint جديد `GET /analytics/automation` — chatbot + auto_close + AI + keywords (graceful D-045)
  - T56: Permission Filtering على `/agents` (owner/admin/supervisor) + `/agents/:id` (agent نفسه)
  - T57: Scheduled Reports CRUD (GET/POST/PUT/DELETE `/analytics/scheduled`) — owner/admin فقط
  - T58: `analytics.js` frontend — `mount(container, params)` + `unmount()` — Page Module (D-027)
  - T59: قسم Labels — جدول + شريط تقدم بالألوان
  - T60: قسم AI & Automation — KPIs + keywords + Sentiment هنا (D-037)
  - T61: Live Status Bar — polling 30ث (D-033) — open_now + agents_online
  - T62: Permission-Aware Rendering — agent → صفحته فقط — canExport — canScheduled
  - T63: Scheduled Reports UI — جدول + modal إنشاء + toggle + delete — إرسال مؤجل Phase 10+
  - `inbox.css` — 90+ سطر CSS جديد (`iv4-an-page*` classes)
  - Backend: live mode لـ `/overview?live=1` — أرقام فورية
- قرارات: لا جديد
- آخر commit: 50f792a
- المهمة القادمة: **Phase 10 مكتملة بالكامل ✅** — خطوات إدارية فقط (راجع أدناه)

---
## جلسة 2026-05-04 17:09 UTC — M2 كامل: Settings (T31→T50)
- الحالة: مكتملة ✅
- ما تم:
  - T31-T36: 6 migrations (v36→v41) في `migrations.js`:
    - `inbox_canned_responses_v4` (shortcut UNIQUE + 2 indexes)
    - `inbox_sla_policies_v4` (seed سياسة افتراضية)
    - `inbox_custom_attrs_v4` + `inbox_attr_values_v4` (CASCADE DELETE)
    - `inbox_appearance_v4` (singleton id=1)
    - `inbox_business_hours_v4` + `inbox_business_days_v4` (7 أيام seed)
    - `inbox_csat_settings_v4` (singleton id=1)
  - T37-T41: `server/routes/inbox/settings.js` — 781 سطر إجمالاً:
    - org + business-hours API
    - canned responses CRUD + search
    - custom attrs CRUD + reorder
    - SLA policies CRUD + set-default (ترفض حذف is_default=1)
    - CSAT + appearance + channels (6 قنوات)
  - `server/routes/inbox/utils/business-hours.js` — helper isBusinessHour()
  - T42: `api.js` — settings namespace كامل (30+ method)
  - T43: `settings/settings-page.js` — Shell رئيسي (5 أقسام مع permission guard)
  - T44: `settings/org.js` — بيانات الشركة + ساعات العمل
  - T45: `settings/channels.js` — 6 قنوات مع toggle + حفظ + اختبار
  - T46: `settings/inbox-settings.js` — Canned + SLA + Custom Attrs + CSAT + Appearance (5 tabs)
  - T47: `settings/team.js` + `settings/automation-hub.js`
  - T48: `reply.js` — canned responses trigger "/" dropdown
  - T49: `context.js` — custom attrs display لجهة الاتصال
  - T50: `conversations.js` — _computeSLA() تستخدم inbox_sla_policies_v4
- قرارات: لا جديد
- آخر commit: f98d138
- المهمة القادمة: M4 Analytics — `inbox-v4/execution/EX-M4-analytics.md`
---
## جلسة 2026-05-04 16:49 UTC — M3 كامل: App Shell + Navigation (T19→T30)
- الحالة: مكتملة ✅
- ما تم:
  - T19+T20: `server/app.js` — routes `/inbox*` + `/contacts*` + `/reports*` + `/settings*` (قبل `/dashboard*`)
  - +endpoint: `GET /api/inbox/me` + `PUT /api/inbox/me/status` في `inbox/index.js`
  - T21: `public/inbox-v4/index.html` — App Shell HTML (جديد)
  - T22: `public/inbox-v4/shell.css` — كامل مع Responsive + Dark Mode (جديد، prefix: `shell-*`)
  - T23: `public/inbox-v4/router.js` — Client-Side Router بـ history.pushState (جديد)
  - T24: `public/inbox-v4/shell.js` — Shell Controller: auth check → SSE → Router → Pages (جديد)
  - T25: `stream.js` — إضافة `init()` مع `_initialized` guard (D-029) + emit sse:connected/disconnected
  - T26: `pages/page-inbox.js` — Page Module (جديد)
  - T27: `pages/page-contacts.js` — Placeholder (جديد)
  - T28: `pages/page-reports.js` — يُغلّف InboxAnalytics (جديد)
  - T29: `pages/page-settings.js` — يُغلّف Roles + Users settings (جديد)
  - T30: `dashboard/index.html` — استبدال iframe بـ redirect button لـ /inbox
- قرارات: لا جديد
- آخر commit: d1401e8
- المهمة القادمة: M2 Settings أو M4 Analytics — حسب EX files

---

## جلسة 2026-05-04 16:36 UTC — M5 كامل: Auth Adapter (T12→T18)
- الحالة: مكتملة ✅
- ما تم:
  - T12+T13: `server/inbox-auth-adapter.js` (جديد) + تفعيل في `inbox/index.js`
  - T14: `context.js` — ERP Plugin Guard (`erpGuard` middleware) + هجرة كاملة لـ `req.inboxUser`
  - T15: `team.js` — `req.user.role` → `permissions.team_manage` + `req.inboxUser`
  - T16: `conversations.js` — هجرة `req.inboxUser`
  - T17 [1-9/10]: stream, messages, automation, broadcast, chatbot, email, labels, search, ai — كلها `req.inboxUser`
  - T17 settings.js: كان نظيفاً من M1 — لا تغيير
  - T18: `public/dashboard/inbox-v4/api.js` — `InboxConfig` object (تمهيد Standalone)
- قرارات: لا جديد (D-042→D-046 موثقة مسبقاً)
- آخر commit: 0b26b5d
- المهمة القادمة: M3 Shell — `inbox-v4/execution/EX-M3-shell.md`

---

## جلسة 2026-05-04 — M1 كامل: نظام الصلاحيات (T01→T11)
- الحالة: مكتملة ✅
- ما تم:
  - T01: migration v33 — `inbox_roles` + seed 5 أدوار ثابتة (Owner→Read-only)
  - T02: migration v34 — `inbox_users` + 3 indexes (email UNIQUE + tenant_user + role)
  - T03: migration v35 — `ALTER inbox_team_members ADD COLUMN role_override`
  - T04: `server/routes/inbox/permissions.js` — loadInboxPermissions + requirePermission(key) + fallback map
  - T05: `server/routes/inbox/settings.js` — Roles API (GET/POST/PUT/DELETE) مع حماية is_system
  - T06: تكملة settings.js — Users API مع قاعدة last_owner
  - T07: `server/routes/inbox/index.js` — loadInboxPermissions على كل request + requirePermission على /analytics و /settings
  - T08: `public/dashboard/inbox-v4/store.js` — currentUser.permissions + canDo() helper
  - T09: `public/dashboard/inbox-v4/app.js` — guardRoute() + loadCurrentUser() + guard على Analytics
  - T10: `public/dashboard/inbox-v4/settings/roles.js` — صفحة الأدوار (list + drawer create/edit/delete)
  - T11: `public/dashboard/inbox-v4/settings/users.js` — صفحة الموظفين (table + drawer + last_owner guard)
- قرارات جديدة: لا يوجد (موثق مسبقاً D-008→D-012)
- آخر commit: 15f49a0
- المهمة القادمة: M5 T01 — `inbox-v4/execution/EX-M5-adapter.md`

---
## جلسة 2026-05-04 — مراجعة M1→M5 وكتابة PHASE10_TASKS.md
- الحالة: مكتملة ✅
- ما تم:
  - قراءة M1→M5 كاملة وتحقق عدم التعارض
  - ترتيب التنفيذ: M1 → M5(Adapter) → M3(Shell) → M2(Settings) → M4(Analytics)
  - كتابة `inbox-v4/PHASE10_TASKS.md` — 63 مهمة موزعة + جدول dependencies + تحذيرات
- قرارات جديدة: لا يوجد
- الخطوة التالية: Phase 10 — جلسة تقسيم المهام (PHASE10_EXECUTION.md)

---

## جلسة 2026-05-04 — المحور M5: Standalone Architecture (المرحلة 2)
- الحالة: مكتملة ✅
- ما تم: خطة تنفيذ تقنية كاملة (8 خطوات) لفصل Inbox عن areej-pro
  - STEP 1: inbox-auth-adapter.js (ملف جديد — كود كامل)
  - STEP 2: تحديث inbox/index.js لاستدعاء الـ Adapter
  - STEP 3: context.js → optional ERP plugin (has_erp check + graceful degradation)
  - STEP 4: team.js — استبدال req.user.role بـ req.inboxUser.permissions
  - STEP 5: conversations.js — هجرة req.tenantUser → req.inboxUser
  - STEP 6: 10 ملفات متبقية (stream, messages, analytics, ...) — نمط موحّد
  - STEP 7: InboxConfig في api.js (Frontend Standalone-ready)
  - STEP 8: تحديث ملفات التوثيق
- قرارات جديدة: لا (D-042→D-046 موثقة من المرحلة 1)
- المحور القادم: Phase 9 مكتملة ✅ → جلسة مراجعة شاملة (Phase 10 تمهيد)

---

## جلسة 2026-05-04 — المحور M5: Standalone Architecture — المرحلة 1
- الحالة: مكتملة ✅
- ما تم:
  - خريطة كاملة لكل نقاط التبعية بين Inbox وـ areej-pro (Auth + DB + context.js + iframe + tenant-middleware)
  - تصميم Adapter Layer: inbox-auth-adapter.js + req.inboxUser
  - تحديد حدود الفصل (Boundaries): ما داخل Inbox Core وما خارجه
  - Optional Plugin Pattern لـ context.js (has_erp flag)
  - ثلاثة Deployment Models: Integrated / Side-by-side / Fully Standalone
  - تكامل M5 مع M1/M2/M3/M4
- قرارات جديدة: D-042, D-043, D-044, D-045, D-046
- المحور القادم: M5 — المرحلة 2 (خطة التنفيذ التقنية التفصيلية)

---

## جلسة 2026-05-04 — المحور M4: التقارير (Analytics) — المرحلة 2
- الحالة: مكتملة ✅
- ما تم:
  - DB Migration: جدول `inbox_scheduled_reports_v4` + 6 DB Indexes للأداء
  - Backend: `getInboxRole()` + `getTeamFilter()` + `requireAnalyticsAccess()` helpers
  - Backend: endpoint جديد `/analytics/labels` (Labels Analytics)
  - Backend: endpoint جديد `/analytics/automation` (AI & Chatbot Analytics)
  - Backend: Permission Filtering في `/overview`, `/agents`, `/agents/:id`
  - Backend: Scheduled Reports CRUD (GET/POST/PUT/DELETE `/analytics/scheduled`)
  - Frontend: تحويل InboxAnalytics لـ Page Module (mount/unmount/D-027)
  - Frontend: Tab Loaders لـ 8 أقسام (Overview/Agents/Channels/Labels/SLA/CSAT/Automation/Scheduled)
  - Frontend: CSS Classes `iv4-an-*` كاملة
  - Shell: Route `/analytics` + Sidebar Link + Route Guard
  - تسلسل تنفيذ من 10 خطوات مرتبة لـ Phase 10
- قرارات جديدة: D-039, D-040, D-041
- المحور القادم: M5 — Standalone Architecture

## جلسة 2026-05-04 — المحور M4: التقارير (Analytics) — المرحلة 1
- الحالة: مكتملة ✅
- ما تم: تحليل كامل لـ Backend + Frontend الحالي — تصميم معماري للصفحة المستقلة بـ 7 أقسام + Permission Filtering + Live Status + Labels/AI endpoints جديدة + Scheduled Reports مؤجلة
- قرارات جديدة: D-031, D-032, D-033, D-034, D-035, D-036, D-037, D-038
- المحور القادم: M4 المرحلة 2

---

## جلسة 2026-05-04 — المحور M3: هيكل التنقل + حجم الشاشات (المرحلة 2)
- الحالة: مكتملة ✅
- ما تم: خطة التنفيذ التقنية الكاملة لـ App Shell — router.js + shell.js + shell.css + index.html + 4 page modules + تعديلات backend + Deep Link + Responsive
- قرارات جديدة: D-026, D-027, D-028, D-029, D-030
- المحور القادم: M4 — التقارير (Analytics) المرحلة 1

---

## جلسة 2026-05-04 — المحور M2: Settings (إعادة الهيكلة الكاملة)
- الحالة: مكتملة
- ما تم:
  - المرحلة 1: تحليل + تصميم معماري (5 أقسام + قرارات الجداول)
  - المرحلة 2: خطة تنفيذ كاملة (6 migrations + APIs + Frontend + CSS)
- قرارات جديدة: D-013, D-014, D-015, D-016, D-017
- المحور القادم: M3 — هيكل التنقل + حجم الشاشات

---

## جلسة 2026-05-04 — المحور M1: نظام الصلاحيات
- الحالة: مكتملة
- ما تم:
  - المرحلة 1: تحليل + تصميم معماري كامل لنظام الصلاحيات
  - المرحلة 2: خطة تنفيذ تقنية تفصيلية كاملة
  - ملف الخطة: `inbox-v4/plans/M1-permissions.md`
- قرارات جديدة: D-008, D-009, D-010, D-011, D-012
- المحور القادم: M2 — Settings (إعادة الهيكلة الكاملة)

---

## جلسة 2026-05-03 23:42 UTC
- الحالة: مكتملة
- ما تم:
  - P8-1: server/migrations.js — migration v32
    - جدول inbox_email_accounts_v4: SMTP + IMAP + Webhook (Sendgrid/Mailgun/Postmark)
    - جدول inbox_email_messages_v4: thread tracking per conversation
    - ALTER inbox_conversations_v4: email_account_id + email_subject + email_thread_id
  - P8-1: server/routes/inbox/email.js — backend كامل (جديد 430+ سطر)
    - CRUD accounts + toggle + test-smtp + test-imap + poll manual
    - POST /email/webhook/:token — inbound (Sendgrid/Mailgun/Postmark) بدون auth
    - GET /email/messages/:convId — email thread
    - POST /email/messages/:convId/send — إرسال عبر SMTP
    - pollImapAccount() + runEmailPolling() — IMAP polling engine
    - getOrCreateEmailConv() — thread detection + contact auto-create
  - P8-1: server/routes/inbox/index.js — تسجيل email route
  - P8-1: server/app.js — email webhook public route
  - P8-1: public/dashboard/inbox-v4/email.js — frontend كامل (جديد 380+ سطر)
    - Settings panel: قائمة حسابات + form SMTP/IMAP/Webhook
    - test + poll + toggle + delete + copy webhook URL
    - renderEmailThread() — email thread في chat window
    - sendEmailReply() — SMTP إرسال من reply box
  - P8-1: api.js — InboxAPI.email (11 methods)
  - P8-1: app.js — InboxEmail.init()
  - P8-1: index.html — زر ✉️ إيميل + email.js script
  - P8-1: chat.js — زر "📧 Thread" في محادثات email + email thread overlay
  - P8-1: reply.js — إرسال SMTP عند platform=email (بدلاً من WA)
  - P8-1: inbox.css — ~170 سطر CSS + dark mode
  - server/package.json: imap-simple@5.1.0
- قرارات: لا جديد
- آخر commit: 1ba603f
- المهمة القادمة: Phase 9 — QA + Integration Tests أو مهمة جديدة حسب أحمد

---

## جلسة 2026-05-03 23:33 UTC
- الحالة: مكتملة
- ما تم:
  - P8-5: `server/migrations.js` — migration v31
    - جدول `inbox_webhooks_v4`: id, name, url, secret, events, is_active, retry_count, last_triggered_at, last_status
    - جدول `inbox_webhook_logs_v4`: per-delivery tracking (event, payload, status_code, attempt, success, error_msg)
    - 4 indexes للأداء
  - P8-5: `server/routes/inbox/automation.js` — إضافة Webhook section
    - `GET /automation/webhook-events` — كشف الأحداث المدعومة (8 أحداث)
    - `GET/POST /automation/webhooks` — قائمة + إنشاء
    - `GET/PUT/DELETE /automation/webhooks/:id` — CRUD كامل
    - `PUT /automation/webhooks/:id/toggle` — تفعيل/تعطيل
    - `POST /automation/webhooks/:id/test` — إرسال ping تجريبي
    - `GET /automation/webhooks/:id/logs` — سجل المحاولات
    - `triggerWebhooks(db, tenantId, event, data)` — engine مع retry exponential backoff
    - `_fireWithRetry()` — محاولات تلقائية (1s, 2s, 4s)
    - `_fireWebhook()` — HTTP POST مع HMAC-SHA256 signature
    - `_logWebhook()` — تسجيل كل محاولة
  - P8-5: `public/dashboard/inbox-v4/automation.js` — إضافة InboxWebhooks
    - Panel كامل (list + form + logs)
    - List: بطاقات مع حالة + آخر تشغيل + last_status
    - Form: اسم + URL + Secret + events grid (تحديد الكل/إلغاء) + retry_count
    - Test مباشر مع عرض كود الاستجابة
    - Logs: جدول آخر 30 محاولة
  - P8-5: `public/dashboard/inbox-v4/api.js` — إضافة `InboxAPI.webhooks` (8 methods)
  - P8-5: `public/dashboard/inbox-v4/app.js` — `InboxWebhooks.init()`
  - P8-5: `public/dashboard/inbox-v4/index.html` — زر "⚡ Webhooks" في الـ sidebar
  - `inbox.css`: ~170 سطر CSS (كل مكونات + dark mode)
  - ربط `triggerWebhooks` في:
    - `messages.js` — حدث `message.sent` لكل رسالة صادرة
    - `conversations.js` — حدث `conversation.closed`
    - `routes-inbox-webhook.js` — حدثي `message.received` + `conversation.created`
- قرارات: لا جديد
- آخر commit: 721e5e9
- المهمة القادمة: **P8-1 Email Channel** أو بدء Phase 9 (QA + Integration Tests)

---

## جلسة 2026-05-03 23:17 UTC
- الحالة: مكتملة
- ما تم:
  - P8-4: `server/migrations.js` — migration v30
    - جدول `inbox_broadcasts_v4`: id, name, message, media_url, content_type, platforms, audience_filter, status, total, sent, failed, timestamps
    - جدول `inbox_broadcast_recipients_v4`: per-recipient tracking (status, sent_at, error_msg)
    - 4 indexes للأداء
  - P8-4: `server/routes/inbox/broadcast.js` — backend جديد بالكامل
    - `GET /broadcasts` — قائمة مع فلتر status
    - `POST /broadcasts` — إنشاء draft
    - `GET/PUT/DELETE /broadcasts/:id`
    - `POST /broadcasts/:id/send` — يبني recipients + يشغّل _runBroadcast في الخلفية (non-blocking)
    - `POST /broadcasts/:id/cancel` — يوقف الإرسال فوراً
    - `GET /broadcasts/:id/recipients` — pagination مع فلتر status
    - _buildRecipients(): يجمع المحادثات المفتوحة حسب فلاتر (platform + label + search)
    - _runBroadcast(): إرسال تسلسلي مع SEND_DELAY_MS=800ms بين كل رسالة
    - دعم whatsapp_api + whatsapp_qr + telegram
  - P8-4: `public/dashboard/inbox-v4/broadcast.js` — frontend جديد
    - Panel جانبي (slide-in) مع 3 views: list / compose / detail
    - List: بطاقات بحالة حية + progress bar للجاري
    - Compose: اختيار منصة + نص + فلاتر audience (ليبل + بحث)
    - Detail: KPI cards (total/sent/failed/متبقي) + progress + جدول مستلمين
    - تصدير CSV بالنتائج (BOM لـ Excel)
    - Polling تلقائي كل 4 ثوان لتحديث البرودكاست الجاري
  - P8-4: `api.js` — استبدال broadcast V1 بـ 8 methods جديدة
  - P8-4: `app.js` — `InboxBroadcast.init()`
  - P8-4: `index.html` — زر "📢 جماعي" في الـ sidebar + broadcast.js script
  - `inbox.css`: ~220 سطر CSS (كل مكونات + dark mode)
- قرارات: لا جديد
- آخر commit: 31b04c2
- المهمة القادمة: **P8-5 Webhook Triggers** — backend `automation.js` + frontend

---

## جلسة 2026-05-03 23:11 UTC
- الحالة: مكتملة
- ما تم:
  - P8-3: `server/routes/inbox/messages.js` — endpoint جديد
    - `POST /conversations/:id/messages/catalog`
    - يدعم: `single_product` (منتج واحد) + `multi_product` (sections بمنتجات متعددة)
    - Validation: catalog_id + product_retailer_id (single) أو sections + thumbnail (multi)
    - يبني WA `interactive` payload من نوع `product` / `product_list`
    - يحفظ الرسالة بـ content_type='catalog' + metadata كاملة
    - تلخيص تلقائي في content: `[منتج: PROD-001]` أو `[كتالوج: 5 منتج]`
  - P8-3: `public/dashboard/inbox-v4/catalog.js` — جديد بالكامل
    - Modal بتاب مزدوج: "منتج واحد" / "قائمة منتجات"
    - Single: Catalog ID + Product ID + نص + Footer
    - Multi: Catalog ID + Header + Thumbnail + sections (إضافة/حذف/تعديل ديناميكي) + نص + Footer
    - _syncSectionsFromDOM() لحفظ البيانات قبل إعادة البناء
    - renderCatalogMessage(): يعرض بطاقة المنتج في الـ chat (single + multi)
    - _updateButtonVisibility(): يُخفت الزر للمنصات غير whatsapp_api
  - P8-3: `api.js` — `InboxAPI.messages.sendCatalog(convId, opts)`
  - P8-3: `app.js` — `InboxCatalog.init()`
  - P8-3: `index.html` — `catalog.js` script
  - `inbox.css`: ~150 سطر CSS (modal + form + sections + chat bubble + dark mode)
- قرارات: لا جديد
- آخر commit: 67eac57
- المهمة القادمة: **P8-4 Broadcast V2 (multi-platform)** أو **P8-5 Webhook Triggers**

---

## جلسة 2026-05-03 23:04 UTC
- الحالة: مكتملة
- ما تم:
  - P8-2: `server/routes/inbox/messages.js` — endpoint جديد
    - `POST /conversations/:id/messages/interactive`
    - يقبل: `type` (button|list) + header + body + footer + buttons[] + sections[]
    - Validation كامل: 1–3 أزرار، 1–10 عناصر للقائمة، فقط whatsapp_api
    - يبني WA `interactive` payload ويرسله عبر Graph API v19
    - يحفظ الرسالة في DB بـ content_type='interactive' و metadata=interactive payload
  - P8-2: `public/dashboard/inbox-v4/interactive.js` — جديد بالكامل
    - Modal بناء الرسالة: tab "أزرار" / "قائمة"
    - أزرار: إضافة/حذف ديناميكي، حد 3
    - قائمة: عناصر بعنوان + وصف، حد 10، button_label مخصص
    - Header/Footer اختياري + char count حيّ
    - Loading state + error toast مؤقت
    - يتحقق من منصة whatsapp_api قبل الفتح
  - P8-2: `chat.js` — `_renderInteractive()` محسَّن
    - يعرض header/footer، أزرار، sections+rows
    - يعرض button_reply/list_reply الواردة كـ chip خضر
  - P8-2: `api.js` — `InboxAPI.messages.sendInteractive()`
  - P8-2: `app.js` — `InboxInteractive.init()`
  - P8-2: `index.html` — زر "⚡ أزرار" في الـ toolbar + interactive.js script
  - `inbox.css`: ~145 سطر CSS (بطاقة interactive + modal كامل + dark mode)
- قرارات: لا جديد
- آخر commit: be9133d
- المهمة القادمة: **P8-3 WA Catalog Products** أو **P8-4 Broadcast V2** أو **P8-5 Webhook Triggers** — backend `automation.js`

---

## جلسة 2026-05-03 23:00 UTC
- الحالة: مكتملة
- ما تم:
  - P7-5: `server/routes/inbox/messages.js` — endpoint جديد
    - `POST /conversations/:id/messages/:msgId/transcript`
    - تحميل ملف الصوت مؤقتاً ← إرسال لـ Whisper API (multipart/form-data يدوي)
    - Cache ذكي: يحفظ النتيجة في `metadata` الرسالة لتجنب إعادة الحساب
    - يدعم redirect، timeout 60s، و language hint = "ar"
    - fallback: WHISPER_API_KEY → OPENAI_API_KEY ← يُضاف في .env لو Genspark لا يدعم Whisper
    - helpers جديدة: `_downloadFile()` + `_callWhisper()` + `_extToMime()`
  - P7-5: `public/dashboard/inbox-v4/api.js` — `InboxAPI.messages.transcript(convId, msgId)`
  - P7-5: `public/dashboard/inbox-v4/chat.js`
    - `_renderAudio()`: زر 🎙 جديد + div transcript مخفي (يظهر عند الاستدعاء)
    - يعرض transcript المحفوظ مباشرة لو موجود في metadata
    - `_requestTranscript()`: handler async — loading state ⏳ → نص + toggle visibility
    - `_bindMessageEvents()`: ربط زر `.iv4-audio-transcript-btn`
  - `inbox.css`: ~65 سطر CSS (زر 🎙 + بطاقة transcript + animation + dark mode)
- قرارات: لا جديد
- آخر commit: cce0028
- المهمة القادمة: **P8-2 WA Interactive Messages (Buttons/Lists)** — backend `messages.js`

---

## جلسة 2026-05-03 22:52 UTC
- الحالة: مكتملة
- ما تم:
  - P7-4: `server/routes/inbox/analytics.js` — endpoint جديد
    - `GET /analytics/sentiment` — تحليل مشاعر رسائل العملاء الواردة
    - Batch processing: 30 رسالة/استدعاء → يوفر tokens
    - Cache ذكي: يحفظ النتيجة في `metadata` الرسالة لتجنب إعادة الحساب
    - يُعيد: summary (positive/neutral/negative + نسب) + daily trend + top 5 محادثات سلبية
  - P7-4: `public/dashboard/inbox-v4/api.js` — `InboxAPI.analytics.sentiment()`
  - P7-4: `public/dashboard/inbox-v4/analytics.js`
    - Section "🧠 تحليل المشاعر" جديد في الـ Dashboard
    - `_renderSentiment()` — KPI pills ثلاثية + شريط توزيع + SVG chart يومي مكدس + top negative list
    - `_renderSentimentChart()` — Stacked Bar SVG (🟢 إيجابي / 🟡 محايد / 🔴 سلبي)
    - النقر على محادثة سلبية يفتحها في الـ inbox مباشرة
    - `_esc()` helper مضاف للـ analytics.js
    - `sentimentRes` مضاف لـ `_loadAll()` parallel fetch
  - `inbox.css`: ~120 سطر CSS (pills + stacked bar + chart + neg list + dark mode)
- قرارات: لا جديد
- آخر commit: 2bfc107
- المهمة القادمة: **P7-5 Voice Note Transcript (Whisper)** أو **P8-2 WA Interactive Messages**

---

## جلسة 2026-05-03 22:46 UTC
- الحالة: مكتملة
- ما تم:
  - P7-3: `server/routes/inbox/ai.js` — endpoint جديد
    - `POST /conversations/:id/ai/labels` — يجلب الرسائل + labels المتاحة، يسأل AI، يُعيد مصفوفة `{ id, name, reason }`
    - فلترة آمنة: يتحقق أن كل label مقترح موجود فعلاً في قاعدة البيانات قبل الإعادة
  - P7-3: `public/dashboard/inbox-v4/api.js` — `InboxAPI.ai.suggestLabels(convId)`
  - P7-3: `public/dashboard/inbox-v4/labels.js`
    - زر "✨ اقتراح تلقائي" في footer الـ label dropdown
    - `_aiSuggestLabels()` — يطلب من API ويعرض loading state على الزر
    - `_renderAISuggestions()` — section منفصل داخل الـ dropdown يعرض الاقتراحات مع السبب + badge "AI"
    - "إضافة الكل" — يضيف labels المقترحة دفعة واحدة
    - `_showAISuggestError()` — رسالة خطأ مؤقتة تختفي تلقائياً بعد 4 ثوانٍ
  - `inbox.css`: ~90 سطر CSS (AI btn gradient + suggestions section + reason text + badge + dark mode)
- قرارات: لا جديد
- آخر commit: 21aad28
- المهمة القادمة: **P7-4 Sentiment Analysis** أو **P8-2 WA Interactive Messages (Buttons/Lists)**

---

# SESSIONS.md — يوميات جلسات Inbox v4
> أضف كل جلسة في الأعلى (الأحدث أولاً)

---

## جلسة 2026-05-03 22:40 UTC
- الحالة: مكتملة
- ما تم:
  - P7-1: `server/routes/inbox/ai.js` — backend جديد بالكامل
    - `POST /conversations/:id/ai/suggest` — اقتراح رد ذكي (tone: formal/friendly/brief)
    - `POST /conversations/:id/ai/summary` — ملخص المحادثة
    - `POST /conversations/:id/ai/translate` — ترجمة عربي/إنجليزي
    - `POST /conversations/:id/ai/improve` — تحسين النص (formal/shorter/friendlier/fix)
    - `_callAI()` — محرك OpenAI-compatible (Genspark proxy) مع timeout 30s
  - P7-1: `public/dashboard/inbox-v4/ai.js` — frontend جديد
    - زر "✨ AI" dropdown في reply toolbar — كل الأدوات في menu واحد
    - Tone Panel (ودي/رسمي/مختصر) يظهر بعد الاقتراح لإعادة التوليد
    - Summary Overlay مع نسخ النص
    - تحسين + ترجمة يكتبان في الـ textarea مباشرة
  - `api.js`: إضافة `InboxAPI.ai.*` (suggest/summary/translate/improve)
  - `index.html`: زر AI toolbar + زر "📋 ملخص" في chat header + ai.js script
  - `app.js`: `InboxAI.init()`
  - `inbox.css`: ~130 سطر CSS (كل مكونات AI + dark mode)
- قرارات: لا جديد
- آخر commit: 73a2f2f
- المهمة القادمة: **P7-2 Conversation Summary** مكتمل ضمن P7-1 — التالي: **P7-3 Auto-Label Suggestion** أو **P8-2 WA Interactive Messages**

---

## جلسة 2026-05-03 22:24 UTC
- الحالة: مكتملة
- ما تم:
  - P4-5: **migration v29** — جدول `inbox_scheduled_messages_v4`
  - P4-5: `automation.js` backend:
    - `GET /api/inbox/scheduled` — كل الرسائل بحسب الحالة
    - `GET /api/inbox/conversations/:id/scheduled` — رسائل محادثة
    - `POST /api/inbox/conversations/:id/scheduled` — إنشاء
    - `PUT /api/inbox/scheduled/:id` — تعديل
    - `DELETE /api/inbox/scheduled/:id` — حذف
    - `POST /api/inbox/automation/scheduled/run` — تشغيل يدوي
    - `runScheduledMessages(db, tenantId)` — محرك الإرسال (sent/failed tracking)
  - P4-5: `scheduled.js` frontend:
    - Dashboard عام (Pending/Sent/Failed tabs)
    - Form Modal (إضافة/تعديل مع datetime-local picker)
    - زر "▶ تشغيل الآن" مع عرض sent/failed
    - Mini panel في المحادثة لعرض الرسائل المجدولة
  - `api.js`: `InboxAPI.scheduled.*` (6 methods)
  - `app.js`: `InboxScheduled.init()`
  - `index.html`: زر 📅 مجدولة في الـ sidebar
  - `inbox.css`: ~160 سطر CSS + dark mode
- قرارات: لا جديد
- آخر commit: 6ef4429
- المهمة القادمة: **Phase 4 ✅ مكتملة** — التالي: **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 22:17 UTC
- الحالة: مكتملة
- ما تم:
  - P4-4: **migration v28** — جدول `inbox_auto_close_v4`
  - P4-4: `automation.js` backend:
    - `GET/PUT /api/inbox/automation/auto-close`
    - `POST /api/inbox/automation/auto-close/run` — تشغيل يدوي
    - `runAutoClose(db, tenantId)` — محرك كامل: تحذير + إغلاق
      - overnight idle detection
      - تحتفظ بعدم تكرار التحذير بفحص آخر رسالة Bot
  - P4-4: `automation.js` frontend:
    - قسم جديد داخل نفس overlay الـ Welcome/Away
    - idle_minutes + live hint بالدقائق/ساعات/أيام
    - فلتر حالة المحادثة (open/waiting)
    - رسالة إغلاق اختيارية + تحذير قبل الإغلاق
    - زر "▶ تشغيل الآن" مع عرض النتيجة
  - `api.js`: `InboxAPI.autoClose.get/update/run`
  - `inbox.css`: ~55 سطر CSS جديد
- قرارات: لا جديد
- آخر commit: 851dc52
- المهمة القادمة: **P4-5 Scheduled Messages** — backend `automation.js` + frontend أو **P7-1 AI Suggestions**

---

## جلسة 2026-05-03 22:10 UTC
- الحالة: مكتملة
- ما تم:
  - P4-3: **migration v27** — جدول `inbox_welcome_away_v4`
  - P4-3: `automation.js` backend — `GET/PUT /api/inbox/automation/welcome-away`
    - `processWelcomeAway(db, conv, isNew, tenantId)` — محرك الترحيب/الغياب
    - `_isAwayNow(cfg)` — حساب دقيق بالـ timezone + أيام العمل + overnight support
  - P4-3: `public/dashboard/inbox-v4/automation.js` — frontend كامل
    - Toggle تفعيل/تعطيل لكل رسالة
    - اختيار أيام العمل (0–6)
    - جدول الغياب (away_start → away_end) + overnight
    - Timezone selector (8 مناطق)
    - Away Mode: schedule / always
    - معاينة حية للوضع الحالي (عمل/غياب)
  - `api.js`: `InboxAPI.welcomeAway.get/update`
  - `app.js`: `InboxAutomation.init()`
  - `index.html`: زر 🌙 ترحيب/غياب في الـ sidebar
  - `inbox.css`: ~160 سطر CSS + dark mode
  - `routes-inbox-webhook.js`: ربط WA webhook بمحرك Welcome/Away
- قرارات: لا جديد
- آخر commit: 715105d
- المهمة القادمة: **P4-4 Auto-Close** — backend `automation.js` + مهمة Cron أو **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 22:00 UTC
- الحالة: مكتملة
- ما تم:
  - P4-2: **migration v26** — 3 جداول جديدة:
    - `inbox_chatbot_flows_v4` (الـ flows)
    - `inbox_chatbot_steps_v4` (خطوات الـ flow)
    - `inbox_chatbot_sessions_v4` (جلسات المحادثات النشطة)
  - P4-2: `server/routes/inbox/chatbot.js` — backend كامل
    - CRUD flows (GET/POST/PUT/DELETE/toggle)
    - Bulk replace steps (`PUT /flows/:id/steps`)
    - Test endpoint (`POST /flows/:id/test`) — simulate
    - **محرك** `processChatbot()` للـ webhook
    - دعم step types: message / question / input / condition / action / delay
    - دعم triggers: keyword / always
  - P4-2: `public/dashboard/inbox-v4/chatbot.js` — frontend Visual Builder
    - قائمة flows مع toggle تفعيل/تعطيل
    - Flow Editor: شجرة steps بصرية (إضافة/تعديل/حذف/child steps)
    - Step Modal بحقول ديناميكية حسب النوع
    - زر اختبار (simulate) قبل الحفظ
  - `api.js`: إضافة `InboxAPI.chatbot.*` (8 methods)
  - `app.js`: تفعيل `InboxChatbot.init()`
  - `index.html`: زر 🤖 Chatbot في الـ sidebar
  - `inbox.css`: ~200 سطر CSS (كل مكونات الـ builder + dark mode)
  - `routes-inbox-webhook.js`: ربط خفيف بمحرك chatbot عند WA webhook
- قرارات: لا جديد
- آخر commit: 560ba36
- المهمة القادمة: **P4-3 Welcome + Away Messages** — backend `automation.js` أو **P7-1 AI Suggestions** — `reply.js` + backend

---

## جلسة 2026-05-03 21:56 UTC
- الحالة: مكتملة
- ما تم:
  - P6-4: `server/routes/inbox/analytics.js` — `GET /analytics/csat`
    - ملخص + distribution نجوم + daily trend + by_agent
  - P6-4: `analytics.js` — section CSAT كامل (KPI + star bars + daily + agent table)
  - P6-6: `_exportFullExcel()` — CSV بـ BOM (Excel-friendly)
    - زر "📅 Excel كامل" يصدّر الموظفين + CSAT + توزيع النجوم
  - `api.js`: analytics.csat()
  - `inbox.css`: star bars + export-group + export-btn--primary
- قرارات: لا جديد
- آخر commit: 14ae51e
- المهمة القادمة: **Phase 6 ✅ مكتملة** — التالي: **P4-2 Chatbot Flows** أو **P7-1 AI Suggestions**

---

## جلسة 2026-05-03 21:52 UTC
- الحالة: مكتملة
- ما تم:
  - P6-3: `server/routes/inbox/analytics.js` — `GET /analytics/platforms/:platform`
    - ملخص + تطور يومي + توزيع أولوية + أداء موظفين على المنصة
  - P6-3: `analytics.js` — `_openPlatformDetail()` modal مع drill-down
  - P6-5: `server/routes/inbox/analytics.js` — `GET /analytics/sla/detail`
    - التزام يومي + SLA بالمنصة + أسوأ 10 محادثات
  - P6-5: `analytics.js` — `_openSLADetail()` modal + زر "🔍 تفصيل" داخل section SLA
  - `api.js`: analytics.platformDetail() + analytics.slaDetail()
  - `inbox.css`: hover + detail hint
- قرارات: لا جديد
- آخر commit: c16cc9f
- المهمة القادمة: **P6-4 CSAT Analytics** أو **P6-6 Export PDF/Excel** أو **P4-2 Chatbot Flows**

---

## جلسة 2026-05-03 21:48 UTC
- الحالة: مكتملة
- ما تم:
  - P6-2: `server/routes/inbox/analytics.js` — endpoint جديد
    - `GET /analytics/agents/:id`: تفاصيل موظف واحد (تطور + منصات + أولوية + آخر 10 محادثات)
  - P6-2: `public/dashboard/inbox-v4/analytics.js` — `_openAgentDetail()` modal
    - KPI row + mini bar chart يومي + two-col منصات/أولوية + جدول آخر محادثات
    - النقر على اسم الموظف في الجدول يفتح drill-down modal
  - `api.js`: analytics.agentDetail(agentId, { from, to })
  - `inbox.css`: ~110 سطر CSS (modal + KPI + bars + status badges + dark mode)
- قرارات: لا جديد
- آخر commit: ff88979
- المهمة القادمة: **P6-3 Platform Breakdown** أو **P6-5 SLA Reports**

---

## جلسة 2026-05-03 21:41 UTC
- الحالة: مكتملة
- ما تم:
  - P6-1: `server/routes/inbox/analytics.js` — أضاف endpointين جديدين
    - `GET /analytics/volume`: حجم المحادثات يومياً (إجمالي + مغلقة + توزيع منصات)
    - `GET /analytics/hourly`: توزيع الرسائل الواردة على 24 ساعة
  - P6-1: `public/dashboard/inbox-v4/analytics.js` — جديد بالكامل
    - Overlay Dashboard مستقل فوق اللّينبوكس
    - KPI Cards: إجمالي / معدل إغلاق / وقت أول رد / وقت إغلاق / رسائل
    - Volume Chart: SVG bar chart يومي مع tooltip
    - Hourly Heatmap: 24 خلية بألوان حرارية (cold→hot)
    - Platforms: progress bars بنسب المنصات
    - SLA: ملخص نسبة الالتزام + تفصيل حسب الأولوية
    - Agents Table: أداء الموظفين مع export CSV
    - Date Range: presets 7d/30d/90d + custom picker
  - `api.js`: أضاف analytics.sla / platforms / volume / hourly
  - `index.html`: زر 📊 الإحصاءات في الـ sidebar + analytics.js script
  - `app.js`: ربط زر الإحصائات بـ InboxAnalytics.open()
  - `inbox.css`: ~200 سطر CSS كامل (overlay + dark mode)
- قرارات: لا جديد
- آخر commit: 0d49909
- المهمة القادمة: **P6-2 Agent Performance Reports** أو **P4-2 Chatbot Flows**

---

## جلسة 2026-05-03 21:33 UTC
- الحالة: مكتملة
- ما تم:
  - P5-5: `server/routes/inbox/context.js` — endpoint جديد
    - `GET /conversations/:id/timeline`: جلب أحداث المحادثة (max 100، cursor-based pagination)
    - يدعم: assigned / unassigned / transferred / label_added|removed / note_mention / crm_linked|unlinked / invoice_created / paylink_created / status_changed / snoozed / unsnoozed / priority_set
  - P5-5: `public/dashboard/inbox-v4/context.js` — تب "⏱ التاريخ" جديد
    - `TIMELINE_META`: خريطة icon + label + color لكل event type
    - `_loadTimeline(append)`: جلب مع cursor-based load more
    - `_renderTimelineList()`: HTML مع خط رأسي يربط الأحداث
    - `_renderTimelineEvent()`: بطاقة حدث مع dot ملون + actor + وصف + تاريخ
    - `_tlEventDesc()`: نص وصفي عربي لكل نوع حدث
    - Reset `_timeline` عند فتح محادثة جديدة
  - P5-5: `inbox.css` — ~80 سطر CSS (timeline dots + vertical line + tag chips + dark mode)
- قرارات: لا جديد
- آخر commit: 58ace35
- المهمة القادمة: **P4-2 Chatbot Flows** — `settings.js` + backend أو **P6-1 Analytics Dashboard**

---

## جلسة 2026-05-03 21:27 UTC
- الحالة: مكتملة
- ما تم:
  - P5-4: `inbox_conv_notes_v4` migration جديد (v25)
  - P5-4: `server/routes/inbox/context.js` — 3 endpoints
    - `GET /conversations/:id/context/notes`: جلب كل النوتس (الأحدث أولاً)
    - `POST /conversations/:id/context/notes`: إضافة نوتة + SSE broadcast
    - `DELETE /conversations/:id/context/notes/:nid`: حذف بصلاحية (author أو admin)
  - P5-4: `public/dashboard/inbox-v4/context.js` — تب "📝 نوتس" جديد
    - `_loadNotes()` + `_renderNotesList()` + `_renderNoteItem()`
    - `_submitNote()` مع Optimistic UI + `_deleteNote()` مع rollback
    - SSE listeners: `conv:note_added` + `conv:note_deleted`
    - Reset `_notes` عند فتح محادثة جديدة
  - P5-4: `api.js` — إضافة `getNotes` + `addNote` + `deleteNote`
  - P5-4: `stream.js` — إضافة listeners: `conv:note_added` + `conv:note_deleted`
  - P5-4: `inbox.css` — ~100 سطر CSS (نوتة بطاقة + composer + dark mode)
- قرارات: لا جديد
- آخر commit: 8ccfcd8
- المهمة القادمة: **P5-5 Conversation Timeline** — `context.js`

---

## جلسة 2026-05-03 21:21 UTC
- الحالة: مكتملة
- ما تم:
  - P5-2: `public/dashboard/inbox-v4/context.js` — تحسين كامل للـ tabs
    - Pagination على Invoices + Orders + PayLinks (10 عناصر/صفحة)
    - فلتر حالة على الفواتير (الكل/مدفوعة/مرسلة/مسودة/ملغاة) + الطلبات
    - CLV Mini Summary أعلى tab الفواتير (مدفوع + عدد + متوسط)
    - تب CLV كامل: grid بطاقات 6 إحصائيات + progress bar التحويل + رسم شهري mini bar chart
  - P5-3: Quick Actions مكتمل
    - زر "+ فاتورة" في tab الفواتير → modal بسيط (مبلغ + وصف) → API → reload + toast
    - زر "+ رابط دفع" في tab الدفع → modal → API → reload + toast
    - زر "📋 نسخ" لكل رابط دفع نشط → clipboard copy
    - زر "📤 إرسال" لكل رابط دفع نشط → يُدرج النص في reply box
  - `inbox.css`: ~210 سطر CSS جديد
    - toolbar + filter pills + clv-mini + pager + pay-actions
    - CLV grid + progress bar + bar chart
    - Quick Action modal + overlay + toast
    - dark mode كامل
- قرارات: لا جديد
- آخر commit: 9cfe934
- المهمة القادمة: **P5-4 Internal Notes** — `context.js` أو **P5-5 Conversation Timeline** — `context.js`

---

## جلسة 2026-05-03 21:01 UTC
- الحالة: مكتملة
- ما تم:
  - P5-1: `server/routes/inbox/context.js` — جديد — 3 endpoints
    - `GET /conversations/:id/context`: بيانات العميل + فواتير + طلبات + روابط دفع + CLV
    - ربط تلقائي بالهاتف لو كان العميل غير مربوط
    - `POST /conversations/:id/context/link`: ربط/إلغاء ربط CRM + timeline log + SSE
    - `GET /conversations/:id/context/search`: بحث في crm_contacts (10 نتائج)
  - P5-1: `public/dashboard/inbox-v4/context.js` — frontend كامل
    - تب Contact: avatar + بيانات + CLV stats row + fields + بحث CRM + فتح صفحة CRM
    - تب Invoices: آخر 5 فواتير مع الحالة + رابط صفحة الفواتير
    - تب Orders: آخر 5 طلبات + tracking_no + رابط صفحة الطلبات
    - تب Pay: روابط الدفع
    - Auto-reload عند فتح محادثة جديدة
    - بحث autocomplete للربط اليدوي
  - `server/routes/inbox/index.js`: تسجيل context route
  - `index.html`: تفعيل context.js
  - `app.js`: `InboxContext.init()`
  - `inbox.css`: ~180 سطر CSS (كل مكونات البانل + dark mode)
- قرارات: لا جديد
- آخر commit: 3bd636f
- المهمة القادمة: **P5-2 Order/Invoice History + CLV** — `context.js` + backend أو **P5-3 Quick Actions**

---

## جلسة 2026-05-03 20:56 UTC
- الحالة: مكتملة
- ما تم:
  - P4-1: `server/routes/inbox/automation.js` — جديد بالكامل
    - 6 Endpoints: GET/POST/PUT/DELETE keywords + toggle + reorder
    - POST `/automation/test`: اختبار قاعدة على نص بدون إرسال
    - `processAutoReply(db, conv, text, tenantId)`: المحرك المركزي — يُستدعى من webhook عند استقبال رسالة واردة
    - 4 أنماط مطابقة: exact / contains / starts / regex
    - دعم تأخير `reply_delay_sec` + `apply_once_per_conv` + تصفية حسب المنصة `platforms`
    - SSE broadcast عند كل رد تلقائي
    - أولوية `priority_order` + `reorder` endpoint
  - `server/routes/inbox/index.js`: تفعيل automation route
  - `server/routes/inbox/messages.js`: تصدير `dispatchOutbound` لاستخدام automation.js
- قرارات: لا جديد
- آخر commit: f46c564
- المهمة القادمة: **P4-2 Chatbot Flows** — `settings.js` + backend أو **P5-1 Customer Info + CRM Link** — `context.js`

---

## جلسة 2026-05-03 20:51 UTC
- الحالة: مكتملة
- ما تم:
  - P3-6: `server/routes/inbox/conversations.js` — SLA helpers
    - `SLA_THRESHOLDS_SEC`: حدود الوقت حسب الأولوية (urgent 15د / high 1س / normal 4س / low 24س)
    - `_computeSLA(conv)`: حساب first_response_status + resolution_status + نسب الوقت المستهلك
    - `recordFirstResponse(db, convId, sentAt)`: تسجيل أول رد صادر (no-op لو محدد مسبقاً)
    - `GET /conversations/:id/sla`: SLA لمحادثة واحدة
    - `POST /conversations/:id/sla/backfill`: إعادة حساب من الرسائل الفعلية
    - `module.exports`: تصدير `recordFirstResponse` + `computeSLA` + `SLA_THRESHOLDS_SEC`
  - P3-6: `server/routes/inbox/messages.js` — hook SLA تلقائي
    - `recordFirstResponse` يُستدعى بعد نجاح إرسال أي رسالة صادرة (outbound غير failed)
  - P3-6: `server/routes/inbox/analytics.js` — جديد بالكامل
    - `GET /analytics/overview`: أرقام عامة (inbox health)
    - `GET /analytics/sla`: نسب الالتزام + متوسطات + توزيع حسب الأولوية
    - `GET /analytics/agents`: أداء الموظفين (ردود + وقت استجابة + إغلاق + CSAT)
    - `GET /analytics/platforms`: توزيع المحادثات على المنصات
  - `server/routes/inbox/index.js`: تسجيل analytics route على `/analytics`
- قرارات: لا جديد
- آخر commit: fc082db
- المهمة القادمة: **P4-1 Keywords Auto-Reply** — backend `server/routes/inbox/automation.js`

---

## جلسة 2026-05-03 20:43 UTC
- الحالة: مكتملة
- ما تم:
  - P3-5: `server/routes/inbox/search.js` — backend كامل
    - `GET /search`: بحث quick (اسم + هاتف + آخر رسالة) + deep (كل نص الرسائل)
    - `GET /search/suggest`: autocomplete أسماء وأرقام العملاء
    - `_highlight()`: تشغيل snippet مع تمييز النص المطابق
    - scope check للصلاحيات (owner/admin يشوف الكل — موظف عادي = محادثاته فقط)
  - P3-5: `public/dashboard/inbox-v4/search.js` — frontend كامل
    - Quick Search: إدخال debounce 300ms + suggest dropdown مع تنقل (لوحة مفاتيح + ماوس)
    - Deep Search: overlay كامل مع فلاتر (mode/status/platform) + تمييز النص + load more
    - Ctrl+F → يفتح deep overlay
    - بادج badge "في رسالة" للنتائج من نص الرسائل
    - فتح المحادثة مباشرة عند النقر على النتيجة
  - `api.js`: إضافة `InboxAPI.search.search()` + `InboxAPI.search.suggest()`
  - `server/routes/inbox/index.js`: تسجيل search route
  - `index.html`: إضافة `search.js` + زر بحث متقدم + trigger داخل شريط البحث
  - `app.js`: تهيئة InboxSearch.init() + ربط أزرار البحث المتقدم
  - `inbox.css`: تصميم كامل (suggest dropdown + deep overlay + result items + dark mode)
  - Smoke test: HTTP 200 health ✔️ + routes 401 ✔️
- قرارات: لا جديد
- آخر commit: 73e5969
- المهمة القادمة: **P3-6 SLA Tracking** — backend `conversations.js` + `analytics.js`

---

## جلسة 2026-05-03 20:39 UTC
- الحالة: مكتملة
- ما تم:
  - P3-4: `public/dashboard/inbox-v4/conv-list.js` — Bulk Actions UI كامل
    - `_selectedIds` Set لتتبع التحديد
    - `_syncBulkUI`: مزامنة toolbar + checked state + bulk-selected class
    - `_executeBulkAction`: Optimistic UI + API call + rollback + confirm للحذف
    - `_bindBulkToolbar`: ربط أحداث الـ toolbar + صندوق تحديد الكل
    - صندوق تحديد على كل كارد (hover → ظاهر)
    - أكشن جاهزة: إغلاق / إعادة فتح / حذف
  - `public/dashboard/inbox-v4/index.html`: إضافة `#iv4-bulk-toolbar` بأزرار الاكشن
  - `public/dashboard/inbox-v4/inbox.css`: ~70 سطر CSS (toolbar + bulk-check + bulk-selected + dark mode)
- قرارات: لا جديد
- آخر commit: 017c9b9
- المهمة القادمة: **P3-5 Search (Quick + Deep)** — `search.js` + backend

---

## جلسة 2026-05-03 20:35 UTC
- الحالة: مكتملة
- ما تم:
  - P3-3: `public/dashboard/inbox-v4/conv-list.js` — Snooze UI كامل
    - `_openSnoozeModal`: modal ب 5 خيارات جاهزة (ساعة / 3س / 24س / غداً 9صباحاً / أسبوع) + datetime-local
    - `_closeSnoozeModal`, `_snooze`, `_unsnooze`: optimistic UI + rollback
    - `_formatSnoozedUntil`: تنسيق الوقت للـ badge
    - `_msUntilTomorrow9am` + `_toLocalDatetimeInput`: helpers
    - `.iv4-snooze-trigger`: زر hover على كل كارد
    - `.iv4-snooze-badge--active`: badge قابل للنقر لإلغاء التأجيل
    - `.iv4-conv-snoozed`: شفافية خفيفة للكارد المؤجل
  - `public/dashboard/inbox-v4/inbox.css`: ~110 سطر CSS جديد (Snooze modal + badges + dark mode)
- قرارات: لا جديد
- آخر commit: 5dc61ba
- المهمة القادمة: **P3-4 Bulk Actions** — `conv-list.js`

---

## جلسة 2026-05-03 20:31 UTC
- الحالة: مكتملة
- ما تم:
  - P3-2: `public/dashboard/inbox-v4/conv-list.js` — Priority UI كامل
    - `PRIORITY_META` map: icon + label لكل مستوى (urgent/high/normal/low)
    - `_renderConvItem`: badge ملون يظهر في `.iv4-conv-bottom-badges` (normal مخفي)
    - `data-priority` attribute على كل كارد للتتبع السريع
    - `_openPriorityMenu`: dropdown مُتموضع fixed عند الكليك على الـ badge
    - `_closePriorityMenu`: إغلاق عند الكليك خارجها (once listener)
    - `_setPriority`: Optimistic UI + API call + rollback عند الفشل
    - `_updatePriorityDOM`: تحديث badge + border الكارد بدون re-render كامل
    - `_renderPriorityFilters`: قسم فلتر في الـ sidebar (الكل/عاجل/عالي/عادي/منخفض)
  - `public/dashboard/inbox-v4/index.html`: إضافة `#iv4-priority-filters` في الـ sidebar
  - `public/dashboard/inbox-v4/inbox.css`: ~120 سطر CSS جديد
    - `.iv4-priority-badge` + 4 variants (urgent/high/normal/low)
    - `.iv4-conv-item.iv4-priority-*` border-right ملون
    - `.iv4-priority-menu` + `.iv4-priority-option` + `.iv4-priority-opt-check`
    - `@keyframes iv4-fade-in` للـ dropdown
    - Dark mode كامل
- قرارات: لا جديد
- آخر commit: 4c58034
- المهمة القادمة: **P3-3 Snooze** — `conv-list.js` + backend `conversations.js`

---

## جلسة 2026-05-03 20:22 UTC
- الحالة: مكتملة
- ما تم:
  - P3-1: `server/routes/inbox/labels.js` — backend كامل منفصل
    - GET/POST/PUT/DELETE `/labels` مع SSE broadcast `labels_update`
    - GET/POST/DELETE `/conversations/:id/labels` مع timeline log + SSE `conv_update`
    - نقل الـ labels endpoints من `conversations.js` لـ `labels.js`
  - P3-1: `public/dashboard/inbox-v4/labels.js` — frontend كامل
    - `InboxLabels.init()` + `openConversation(convId, labels)`
    - Label Manager Modal: إنشاء / تعديل / حذف labels مع 20 لون جاهز
    - Label Picker في Chat Header: chips + dropdown + بحث
    - SSE listener: `labels_update` + `conv_update` → تحديث فوري
  - `api.js`: إضافة `labels.update()` + `labels.getConvLabels()`
  - `app.js`: تفعيل `InboxLabels.init()`
  - `chat.js`: إضافة `iv4-label-picker-mount` + استدعاء `InboxLabels.openConversation`
  - `stream.js`: استقبال `labels_update` من SSE
  - `inbox.css`: أكثر من 200 سطر CSS لـ label picker + manager + chips + dropdown
- قرارات: لا جديد
- آخر commit: be1d659
- المهمة القادمة: **P3-2 Priority (Low/Normal/High/Urgent)** — `conv-list.js` + backend `conversations.js`

---

## جلسة 2026-05-03 19:38 UTC
- الحالة: مكتملة
- ما تم:
  - P2-4: `reply.js` — @Mentions autocomplete في النوتس
    - `_parseMentionContext` كشف @ مع تحليل query + start position
    - `_showMentionDropdown` فلتر الموظفين + عرض dropdown متموضع fixed
    - تحكم بلوحة المفاتيح (↑↓ Enter Tab Escape)
    - `_extractMentions` تقاطع مع InboxStore.state.agents
    - `messages.js` backend: `_notifyMentions` + SSE `note:mention` لكل موظف مذكور + timeline log
    - `stream.js` frontend: استقبال `note:mention` + toast مخصص قابل للنقر
    - `api.js`: إضافة `mentionIds` لـ `messages.send`
    - `inbox.css`: `.iv4-mention-dropdown` + `.iv4-toast--mention`
  - P2-5: `team.js` + backend `team.js` — Conversation Transfer
    - backend: `POST /conversations/:id/transfer` — تحديث assigned_to + نوتس داخلي + context آخر 3 رسائل + timeline + SSE broadcast
    - `team.js` frontend: `openTransferModal` — modal مع بحث + ملاحظة + checkbox context
    - `api.js`: إضافة `team.transfer()`
    - `stream.js` frontend: استقبال `conv:transferred` + toast مخصص
    - `chat.js`: زر "تحويل" في الـ header مربوط بـ `openTransferModal`
    - `inbox.css`: modal styling + `.iv4-toast--transfer` + `.iv4-btn`
- قرارات: لا جديد
- آخر commit: 5509280
- المهمة القادمة: **P3-1 Labels + Tags** — `labels.js` + backend `labels.js`

---

## جلسة 2026-05-03 18:50 UTC
- الحالة: مكتملة
- ما تم:
  - P2-3: `server/routes/inbox/stream.js` — Collision Detection backend
    - `_viewing` Map: tenantId → convId → userId → agentName
    - POST /stream/viewing: تسجيل بدء مشاهدة + broadcast `conv:viewing` لباقي الموظفين + إرجاع viewers
    - DELETE /stream/viewing/:convId: إلغاء مشاهدة + broadcast `conv:viewing:stop`
    - `_cleanupViewingForUser` عند قطع SSE connection تلقائياً
  - P2-3: `public/dashboard/inbox-v4/stream.js` — استقبال `conv:viewing` و `conv:viewing:stop`
    - حفظ في `InboxStore.state.convViewers`
    - emit لـ InboxStore
  - P2-3: `public/dashboard/inbox-v4/api.js` — `InboxAPI.stream.startViewing()` + `stopViewing()`
  - P2-3: `public/dashboard/inbox-v4/chat.js` — Collision UI
    - `_currentViewingConvId` لتتبع المحادثة الفعالة
    - `_onConvOpen`: stopViewing للسابقة + startViewing للجديدة
    - `_showCollisionBanner` / `_hideCollisionBanner` / `_addCollisionViewer` / `_removeCollisionViewer`
    - Banner يظهر بين header و messages بتحذير أصفر مع animation
    - `beforeunload` → sendBeacon لضمان إرسال stopViewing عند إغلاق الـ tab
  - `inbox.css`: `.iv4-collision-banner` + animation slide-in/out + dark mode
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: cec54e2
- المهمة القادمة: **P2-4** @Mentions في الـ Notes — `reply.js`

---

## جلسة 2026-05-03 18:45 UTC
- الحالة: مكتملة
- ما تم:
  - P2-2: `chat.js` — زر تعيين الموظف في الـ chat header
    - يفتح assign dropdown من InboxTeam.openAssignDropdown
    - يعرض dot ملوّنة بحالة الموظف المعيّن (online/busy/away/offline)
    - يستمع لـ `conv_assigned` event ويُعيد رسم الـ header
  - P2-2: `chat.js` — Typing Indicator
    - `_showTypingIndicator()` يعرض bar متحرك في أسفل الـ messages
    - يستمع لـ SSE event `agent_typing` ويعرض اسم الموظف
    - auto-hide بعد 4 ثوانٍ إن لم يأتِ `typing:false`
  - P2-2: `server/routes/inbox/team.js` — POST /conversations/:id/typing
    - broadcast عبر SSE بدون كتابة DB (fire-and-forget)
  - P2-2: `reply.js` — إرسال typing events
    - `_sendTypingStart()` مرة واحدة عند البدء بالكتابة
    - `_sendTypingStop()` تلقائياً بعد 3.5 ث بلا كتابة
  - P2-2: `api.js` — team.sendTyping(convId, typing)
  - CSS: `.iv4-typing-bar` + `.iv4-header-assign-btn` + `.iv4-agent-status-dot`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: b9d5118
- المهمة القادمة: **P2-3** Collision Detection (`chat.js` + SSE)

---

## جلسة 2026-05-03 17:39 UTC
- الحالة: مكتملة
- ما تم:
  - P2-1: `server/routes/inbox/team.js` — backend Team Assignment
    - GET /team/agents — قائمة الموظفين + حالتهم + open_count
    - GET /team/agents/:id — بيانات موظف واحد
    - PUT /team/agents/status — تغيير حالة الموظف (online/busy/away/offline) + UPSERT
    - PUT /conversations/:id/assign — تعيين يدوي + scope check
    - POST /conversations/auto-assign — اختيار أفضل موظف (online → أقل محادثات → LIFO)
    - POST /conversations/auto-assign-all — توزيع كل المحادثات المفتوحة
    - timeline logging لكل تعيين + SSE broadcast
  - P2-1: `public/dashboard/inbox-v4/team.js` — frontend Team
    - Agent Status Widget في sidebar (بدون تلوث الأخرين)
    - Assign Dropdown (بحث + حالة كل موظف + open_count)
    - Auto-assign button (single + all)
    - SSE listener لتحديث حالات الموظفين
    - localStorage حفظ حالة الموظف بين الجلسات
  - تحديث `api.js`: team shortcuts مباشرة (getAgents, setAgentStatus, assignConversation, autoAssign, autoAssignAll)
  - تفعيل team route في `server/routes/inbox/index.js`
  - إضافة team.js لـ `index.html` + تهيئة في `app.js`
  - CSS كامل (status widget + assign dropdown) في `inbox.css`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: e74b705
- المهمة القادمة: **P2-2** Agent Status كامل (تحسين UX + عرض حالات الموظفين في الهيدر + typing indicator) — `team.js`

---

## جلسة 2026-05-03 17:34 UTC
- الحالة: مكتملة
- ما تم:
  - P1-4: `chat.js` — زر رد ↩ على كل رسالة (hover)
    - يُطلق `reply:quote` event → reply.js يعالجه
    - الاتجاه: وارد = يمين / صادر = يسار
    - معالجة direction: inbound/outbound + in/out (backward compat)
    - Note tag مُحسَّن مع styling مميز للـ bubble
  - P1-5: `conv-list.js` — إزالة unread badge فوراً عند فتح المحادثة
    - `_clearUnreadBadge()` — optimistic UI (لا ينتظر الـ API)
    - تحديث InboxStore محلياً + إزالة DOM badge
    - animation fade-out للـ badge
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 2661366
- المهمة القادمة: **Phase 1 مكتملة** — التالي: **P2-1** Team Assignment + Auto-assign (`team.js` + backend `team.js`)

---

## جلسة 2026-05-03 17:22 UTC
- الحالة: مكتملة
- ما تم:
  - P1-3: `server/routes/inbox/messages.js` — backend إرسال الرسائل
    - POST /conversations/:id/messages (نص + ملاحظة داخلية)
    - POST /conversations/:id/messages/media (رفع ملف + إرسال)
    - dispatch لـ whatsapp_api + telegram
    - SSE broadcast عند كل إرسال (message_new + message_status + conv_update)
    - multer upload (max 20MB) داخل uploads/inbox-media/
  - P1-3: `public/dashboard/inbox-v4/reply.js` — frontend reply box
    - إرسال نص (Enter أو Ctrl+Enter)
    - إرسال ميديا + drag & drop
    - preview الميديا قبل الإرسال
    - quoted message (رد على رسالة محددة)
    - formatting buttons (bold/italic/strike/mono)
    - char count + auto-grow textarea
    - lock منع الإرسال المزدوج
  - تسجيل messages route في `server/routes/inbox/index.js`
  - تفعيل reply.js في `index.html` + `app.js`
  - إضافة CSS: media preview + quoted preview + char count + drag-over
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 548fdbd
- المهمة القادمة: **P1-4** — Reply Mode + Note Mode (`reply.js` — تفعيل الـ note UI) + P1-5 Read/Unread tracking

---

## جلسة 2026-05-03 17:15 UTC
- الحالة: مكتملة
- ما تم:
  - P1-2: `public/dashboard/inbox-v4/chat.js` — Chat Window كامل
    - عرض الرسائل مع Date Dividers
    - 8 أنواع محتوى: text | image | video | audio | file | sticker | template | interactive
    - Chat Header مع أزرار إغلاق / إعادة فتح
    - حالة الرسائل: pending | sent | delivered | read | failed
    - Quoted messages + scroll-to-message
    - Lightbox للصور
    - Audio player بسيط
    - Load More عبر IntersectionObserver
    - Read tracking (تعليم مقروءة بعد 1.2ث)
    - SSE real-time (message_new | message_status | conv_update)
  - تفعيل `chat.js` في `index.html` + `app.js`
  - تحديث الـ messages area في `index.html`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: 73bc7af
- المهمة القادمة: **P1-3** — Send Text + Media (`reply.js` + backend `messages.js`)

---

## جلسة 2026-05-03 17:07 UTC
- الحالة: مكتملة
- ما تم:
  - P1-1: `public/dashboard/inbox-v4/conv-list.js` — عرض قائمة المحادثات + real-time updates + load more + labels
  - `server/routes/inbox/conversations.js` — routes كاملة (list/get/status/assign/snooze/priority/bulk/counts/mark-all-read/messages/read/labels)
  - تفعيل `conv-list.js` في `index.html` + `app.js`
  - تسجيل conversations route في `server/routes/inbox/index.js`
  - Smoke test: HTTP 200 health ✔️
- قرارات: لا جديد
- آخر commit: a135415
- المهمة القادمة: **P1-2** — Chat Window + Message Rendering (`public/dashboard/inbox-v4/chat.js`)

---

## جلسة 2026-05-03 17:00 UTC
- الحالة: مكتملة
- ما تم:
  - P0-7: migrations v18–v24 في `server/migrations.js`
  - 7 جداول جديدة: `inbox_conversations_v4`, `inbox_messages_v4`, `inbox_timeline_v4`, `inbox_agent_status_v4`, `inbox_conversation_labels`, `inbox_channel_settings_v4`, `inbox_automation_v4`
  - تطبّقت تلقائياً عند reload على كل tenant DBs
  - تحقق: `schema_versions` يُظهر v18–v24 بتوقيت 17:01:22
- قرارات: `inbox_agent_status_v4` سُمّيت بـ `_v4` تفادياً لـ collision مع `inbox_agent_status` (v17)
- آخر commit: 9997c28
- المهمة القادمة: **P1-1** — Conversations List (`public/dashboard/inbox-v4/conv-list.js`) — قراءة + عرض المحادثات من backend + تحديث real-time عبر SSE

---

## جلسة 2026-05-03 16:45 UTC
- الحالة: مكتملة
- ما تم:
  - P0-2: `public/dashboard/inbox-v4/store.js` — InboxStore كامل (state + events + helpers)
  - P0-3: `public/dashboard/inbox-v4/api.js` — InboxAPI كامل (conversations + messages + labels + team + analytics + crm + broadcast)
  - P0-4: `server/routes/inbox/stream.js` — SSE backend (broadcast + sendToUser + keepalive ping)
  - P0-5: `public/dashboard/inbox-v4/stream.js` — SSE frontend (connect + reconnect + visibility API)
  - P0-6: `public/dashboard/inbox-v4/index.html` + `inbox.css` + `app.js` — Layout 3 أعمدة + CSS كامل + init
  - `server/routes/inbox/index.js` — entry point مسجّل في app.js على `/api/inbox`
  - smoke test: HTTP 401 على `/api/inbox/stream` = route شغّال + auth يعمل ✅
- قرارات: لا جديد
- آخر commit: d603671
- المهمة القادمة: **P0-7** — Migrations (7 ملفات SQL في `server/migrations/inbox-v4/`)

## جلسة 2026-05-03 16:41 UTC
- الحالة: مكتملة (P0-1)
- ما تم: إنشاء scaffold — مجلد `inbox-v4/` + الملفات الأربعة (TASKS + SESSIONS + DECISIONS + SCHEMA)
- قرارات: لا قرارات جديدة — الرؤية متفق عليها في INBOX_VISION.md
- آخر commit: bd7b101
- المهمة القادمة: P0-2 — بناء InboxStore في `public/dashboard/inbox-v4/store.js`

---

## جلسة 2026-05-04 18:43 UTC — P11-E1: Scheduled Reports Engine
- الحالة: مكتملة ✅
- ما تم:
  - `server/inbox-scheduled-reports.js` (جديد — 280 سطر)
    - `runScheduledReports(getTenantDb, masterDb)` — الدالة الرئيسية
    - `_isDue()` — تحقق daily/weekly/monthly + send_hour + last_sent guard (لا إرسال مرتين في نفس اليوم)
    - `_buildRange()` — نطاق الفترة حسب التكرار (أمس/أسبوع/شهر)
    - `_fetchSection()` — 6 أنواع: overview/agents/sla/csat/labels/automation + full (كلها مجموعة)
    - `_generateCSV()` — BOM + escape للعربية + Excel-compatible
    - SMTP من `inbox_email_accounts_v4` (fallback آمن لو لا يوجد SMTP)
  - `server/cron-jobs.js` — `startCronJobs` يقبل `getTenantDb` + CronJob كل ساعة عند الدقيقة 5
  - `server/app.js` — تمرير `getTenantDb` لـ `startCronJobs`
  - اختبار: tenant 2 → overview CSV صحيح + last_sent محدّث ✅
  - pm2 reload + `[Cron] Inbox scheduled reports: مُفعَّل` ✅
- آخر commit: 2f8f93a
- المهمة القادمة: **P11-E2** — صفحة Contacts كاملة

---

## جلسة 2026-05-04 23:36 UTC — P11-E2: Contacts Page
- الحالة: مكتملة ✅
- ما تم:
  - **Backend** `server/routes/inbox/contacts.js` (جديد — 7 endpoints):
    - GET /contacts — قائمة + بحث + فلتر status + pagination
    - GET /contacts/stats — إحصائيات سريعة
    - GET /contacts/:id — بروفايل كامل + invoices_count
    - GET /contacts/:id/conversations — محادثات مرتبطة
    - POST /contacts — إنشاء + تحقق تكرار الهاتف
    - PUT /contacts/:id — تحديث
    - DELETE /contacts/:id — حذف + فك ربط المحادثات
    - Dual mode: CRM (crm_contacts) أو Standalone (inbox_conversations_v4)
  - **API** `api.js` — namespace `contacts` كامل (8 methods)
  - **Frontend** `public/inbox-v4/pages/page-contacts.js`:
    - جدول + بحث real-time + فلاتر الحالة
    - Panel بروفايل جانبي: بيانات + KPIs مالية + محادثات
    - Form إنشاء/تعديل + Pagination + Toast
    - Responsive + Dark Mode
  - **CSS** `inbox.css` — 150+ سطر بـ prefix `ct-*`
  - اختبار كامل: list ✅ + create ✅ + get ✅ + stats ✅ + delete ✅
- قرارات: لا جديد
- آخر commit: 9e91047
- المهمة القادمة: **P11-E1** — Email Delivery للتقارير المجدولة (Scheduled Reports)

---

## جلسة 2026-05-04 23:47 UTC — P11-E3: PDF Export
- الحالة: مكتملة ✅
- ما تم:
  - **Backend** `server/routes/inbox/analytics.js`:
    - `GET /api/inbox/analytics/export?format=json|html`
    - format=json → بيانات overview + agents + platforms + top_labels في طلب واحد
    - format=html → HTML كامل جاهز للطباعة (Ctrl+P → PDF) مع @media print
    - requireOwnerAdmin: owner/admin فقط
    - بدون npm packages جديدة ✅
  - **Frontend** `analytics.js`:
    - `_exportPDF()` → tab جديد بـ HTML جاهز للطباعة
    - `_showPDFPreview()` → fallback modal لو popup محجوب
    - زر "🖨 تصدير PDF" في toolbar Overview + قسم الموظفين
  - **API** `api.js`: `exportReport()` + `exportPdfUrl()`
  - **CSS**: لون primary button متسق + @media print
  - اختبار: format=json ✅ + format=html ✅
- قرارات: لا جديد (D-038 مُنفَّذة بدون npm)
- آخر commit: dae7065
- المهمة القادمة: **P11-E1** — Email Delivery للتقارير المجدولة

---

## جلسة 2026-05-05 00:00 UTC — P11-E1: Scheduled Reports Email Engine
- الحالة: مكتملة ✅
- ما تم:
  - تحقق: `server/inbox-scheduled-reports.js` موجود ومكتمل (commit 2f8f93a)
  - تحقق: `server/cron-jobs.js` يُشغّل `runScheduledReports` كل ساعة عند الدقيقة 5
  - تحقق: `server/app.js` يُمرّر `getTenantDb` لـ `startCronJobs`
  - **bugfix**: `email.js` — إضافة fallback `req.inboxUser = { id: req.user.id }` في middleware المحلي (كان يُسبب TypeError)
  - pm2 reload ناجح + `[Cron] Inbox scheduled reports: مُفعَّل` في اللوج ✅
- قرارات: لا جديد
- آخر commit: fe2ab4f
- **Phase 11 مكتملة بالكامل ✅** — كل المحاور A→B→C→D→E1→E2→E3

---

## جلسة 2026-05-05 00:00 UTC — P12-A: تحويل /inbox لـ v4 رسمياً
- الحالة: مكتملة ✅
- ما تم:
  - تحقق: `/inbox*` كان يشير لـ `public/inbox-v4/index.html` من P11-A ✅
  - **P12-A2**: إضافة `/inbox-legacy*` → `public/dashboard/index.html` (v3 fallback للطوارئ)
  - **P12-A3**: اختبار شامل — كل Deep Links تعمل بـ 200 ✅
    - /inbox ✅ + /inbox/test-deep ✅ + /contacts ✅ + /reports/overview ✅ + /settings/org ✅ + /inbox-legacy ✅
    - كل الـ 11 script/CSS تُخدَّم بـ 200 ✅
    - /health → ok ✅
  - pm2 reload ناجح ✅
  - **P12-A4**: commit 74d1e88 + push ✅
- الملف المُعدَّل: `server/app.js` (سطر واحد → 3 أسطر)
- المهمة القادمة: **P12-B** — هجرة باقي الـ Tenants

---

## جلسة 2026-05-05 00:03 UTC — P12-B: هجرة باقي الـ Tenants
- الحالة: مكتملة ✅
- ما تم:
  - **B1**: `server/scripts/run-all-migrations.js` (جديد) — يُشغّل getTenantDb على كل tenant
    - 10 tenants كلها على schema v44 ✅
    - Tenant 3,4,5,22,26,29,99999: من v17 → v44 (27 migration لكل واحد)
    - Tenant 10: من v41 → v44 (3 migrations)
    - Tenant 1, 2: كانوا v44 بالفعل ✅
  - **B2**: Tenant 1 — فارغ (بيانات v3=0) + inbox_users موجود ✅
  - **B3**: هجرة بيانات v3→v4:
    - Tenant 26: 1/1 محادثة + 2/2 رسالة ✅
    - Tenant 29: 15/15 محادثة + 161/161 رسالة ✅
    - **bugfix**: media_id column غير موجودة في tenants القديمة (v17)
      → إضافة `PRAGMA table_info(inbox_messages)` check في migration script
  - **B4**: تحقق COUNT نهائي — كل 10 tenants على v44 ✅
  - pm2 reload + health ok ✅
- آخر commit: 56e8f8b
- المهمة القادمة: **P12-C** — WhatsApp Live Mode (Meta Business Verification)
