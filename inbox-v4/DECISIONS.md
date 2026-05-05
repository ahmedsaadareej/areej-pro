# DECISIONS.md — القرارات المعمارية
> كل قرار مهم هنا برقم تسلسلي + سبب + تاريخ

---

## D-001 | Node.js + SQLite (WAL) بدل PostgreSQL
- **التاريخ:** 2026-05-03
- **القرار:** الإبقاء على Node.js + SQLite مع WAL mode
- **السبب:** يكفي حتى 1000 عميل؛ PostgreSQL يضيف تعقيداً بدون ضرورة الآن
- **شرط المراجعة:** لو تجاوزنا 500 tenant نشط أو احتجنا cross-tenant queries

## D-002 | SSE بدل WebSocket للـ Real-time
- **التاريخ:** 2026-05-03
- **القرار:** Server-Sent Events (SSE) للـ receive، HTTP POST للـ send
- **السبب:** بسيط — يشتغل خلف Caddy بدون config إضافي — HTTP/1.1 كافي
- **شرط المراجعة:** لو احتجنا bi-directional binary data (مثلاً voice calls)

## D-003 | Vanilla JS بدون Framework
- **التاريخ:** 2026-05-03
- **القرار:** Vanilla JS مع Module Pattern (IIFE / ES Modules)
- **السبب:** الفريق معتاد عليه — لا build step — تحكم كامل في الـ bundle
- **شرط المراجعة:** لو الـ components صارت معقدة جداً (> 50 component)

## D-004 | inbox-v4 يبنى موازياً لـ v3
- **التاريخ:** 2026-05-03
- **القرار:** v3 يكمل شغّال حتى v4 تكتمل بالكامل
- **السبب:** لا downtime — أحمد يستمر يشتغل على v3 أثناء بناء v4
- **شرط التبديل:** Phase 1 + Phase 2 + Phase 3 مكتملة ومختبرة

## D-005 | routes/inbox/ منفصلة (مش ملف واحد)
- **التاريخ:** 2026-05-03
- **القرار:** كل domain له ملف route منفصل في `server/routes/inbox/`
- **السبب:** ملف `routes/inbox.js` الحالي = 3552 سطر — غير قابل للصيانة
- **الملفات:** conversations.js / messages.js / stream.js / team.js / automation.js / labels.js / analytics.js / broadcast.js / settings.js

## D-006 | Migrations ملفات منفصلة (لا inline ALTER TABLE)
- **التاريخ:** 2026-05-03
- **القرار:** كل migration = ملف مستقل مرقّم في `server/migrations/inbox-v4/`
- **السبب:** الـ inline migrations (ALTER TABLE في routes) = خطر على الـ production
- **الشكل:** `001_init_conversations.js`, `002_add_priority.js`, ...

## D-008 | inbox_roles منفصل عن tenant_roles
- **التاريخ:** 2026-05-04
- **القرار:** جدول `inbox_roles` مستقل تماماً عن `tenant_roles` (ERP)
- **السبب:** الـ Inbox يجب أن يعمل مستقلاً عن ERP (السيناريو C) — موظف Inbox ممكن يكون مش في ERP
- **الشرط:** `inbox_roles.is_system = 1` لا يُحذف ولا يُعدّل

## D-009 | inbox_users جدول وسيط مع tenant_user_id nullable
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_users.tenant_user_id` nullable — يسمح بموظفين Inbox-only
- **السبب:** عميل ممكن يشغّل Inbox-only بدون باقي ERP modules
- **الشرط:** Auth middleware يتعامل مع inbox_users مستقل في حالة tenant_user_id = null

## D-010 | Permissions على مستوى القسم (section-level)
- **التاريخ:** 2026-05-04
- **القرار:** 10 permission keys في JSON — section-level لا action-level
- **السبب:** بسيط للمستخدم ويكفي للـ use case الحالية — action-level يضيف تعقيداً غير ضروري
- **الـ Keys:** org_settings / team_manage / channels / inbox_settings / automation / reports_full / reports_team / reports_self / export / delete_account

## D-011 | Team-level overrides فوق الدور الأساسي
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_team_members.role_override` JSON nullable — يُطبق فوق دور الموظف
- **السبب:** Supervisor يحتاج يشوف تقارير فريقه فقط بغض النظر عن دوره الأصلي
- **الشرط:** null = يطبق الدور الأصلي بدون تعديل

## D-012 | requirePermission middleware في كل route حساسة
- **التاريخ:** 2026-05-04
- **القرار:** كل route تستخدم `requirePermission('key')` middleware — لا يكفي frontend guard وحده
- **السبب:** معرفة URL المباشر لا يجب أن تكفي للوصول بدون صلاحية
- **الشرط:** Backend + Frontend double-check

## D-013 | Settings = صفحة كاملة مستقلة (لا modal)
- **التاريخ:** 2026-05-04
- **القرار:** Settings تُفتح كـ full page بـ `iv4-settings-mode` CSS class تُخفي الـ 3 columns
- **السبب:** محتوى كثير ومعقد — modal ضيق يضيع المستخدم
- **الشرط:** Back button يعيد للـ Inbox بدون reload

## D-014 | inbox_canned_responses_v4 جديد (لا inbox_templates)
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_canned_responses_v4` جدول مستقل مع shortcuts + categories
- **السبب:** `inbox_templates` بدون shortcuts وبدون categories — v3 dependency
- **الشرط:** shortcut UNIQUE constraint + "/" trigger في reply.js

## D-015 | SLA Policies جدول منفصل (لا sla_minutes scalar)
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_sla_policies_v4` مع priority-based policies + is_default
- **السبب:** `inbox_settings.sla_minutes` = single value لا يكفي لـ priority-based SLA
- **الشرط:** fallback لـ sla_minutes لو ما في policy — لا نكسر الكود القديم

## D-016 | Custom Attrs نوعان منفصلان
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_custom_attrs_v4` مع attr_type = 'conversation' | 'contact'
- **السبب:** `inbox_contact_attrs` الحالي مضلل الاسم + يخلط النوعين
- **الشرط:** CASCADE DELETE على attr_values_v4 لو حُذف الـ field

## D-017 | Business Hours جدول v4 مستقل (لا inbox_work_hours)
- **التاريخ:** 2026-05-04
- **القرار:** `inbox_business_hours_v4` + `inbox_business_days_v4` مستقلان
- **السبب:** inbox_work_hours بدون timezone — v3 dependency — لا نمسه
- **التأثير:** يؤثر على 3: SLA calculation + Away trigger + Agent auto-away
- **الشرط:** isBusinessHour() helper مشترك في utils/

## D-025 | /inbox route مستقلة — Auth redirect مع ?redirect param
- **التاريخ:** 2026-05-04
- **القرار:** inbox-v4 يأخذ route مستقلة `/inbox*` في `app.js` يخدم `public/inbox-v4/index.html`
- **Auth:** لو مفيش session → redirect لـ `/auth?redirect=/inbox/conv/123` (server-side)
- **السبب:** متسق مع باقي التطبيق + يحل مشكلة الـ deep link تلقائياً
- **الشرط:** يُضاف قبل الـ `app.get('*', ...)` fallback الحالي

## D-007 | InboxStore = Single Source of Truth
- **التاريخ:** 2026-05-03
- **القرار:** كل الـ state في `InboxStore` object — لا global variables مبعثرة
- **السبب:** الـ IV3 object الحالي = state + logic + UI mixed — صعب debug
- **الشكل:** `InboxStore.state` + `InboxStore.on(event, handler)` + `InboxStore.emit(event, data)`

## D-026 | public/inbox-v4/ مجلد مستقل للـ App Shell
- **التاريخ:** 2026-05-04
- **القرار:** `public/inbox-v4/` يحتوي على ملفات App Shell الجديدة — `public/dashboard/inbox-v4/` يبقى للملفات الحالية
- **السبب:** فصل واضح بين Shell الجديد والـ modules القائمة — لا نكسر الكود الحالي
- **الشرط:** الـ scripts في index.html الجديد تشير لـ `/dashboard/inbox-v4/` للملفات الحالية

## D-027 | Page modules = IIFE objects بـ mount/unmount
- **التاريخ:** 2026-05-04
- **القرار:** كل page module = `const PageXxx = (() => { return { mount(container, params), unmount() }; })()`
- **السبب:** متسق مع pattern الكود الحالي (Vanilla JS IIFE) — لا framework جديد
- **الشرط:** mount دايماً يستقبل (container, params) — unmount لا يستقبل شيء

## D-028 | shell.js يتحكم في ترتيب init
- **التاريخ:** 2026-05-04
- **القرار:** `InboxShell.init()` يستدعي: loadUserInfo → InboxRouter.init → InboxStream.init
- **السبب:** SSE يحتاج auth أولاً — Router يحتاج يُطلق route:change بعد الـ user data جاهزة
- **الشرط:** `DOMContentLoaded` في shell.js فقط — لا auto-init في stream.js

## D-029 | InboxStream._initialized guard
- **التاريخ:** 2026-05-04
- **القرار:** أضف `if (InboxStream._initialized) return; InboxStream._initialized = true;` في بداية `InboxStream.init()`
- **السبب:** يمنع double SSE connection لو init اتستدعت مرتين عن طريق الخطأ
- **الشرط:** يُضاف كأول سطرين في init()

## D-031 | Analytics = Page Module (لا modal)
- **التاريخ:** 2026-05-04
- **القرار:** InboxAnalytics يتحوّل لـ Page Module بـ mount(container, params) / unmount() — يُفتح من Sidebar عبر route /analytics
- **السبب:** الصفحة المستقلة تتسق مع M3 App Shell وتعطي مساحة كافية للتقارير
- **الشرط:** الـ overlay CSS يُزال — يُستعاض عنه بـ full-page layout في Shell

## D-032 | Permission Filtering على مستوى Backend + Frontend
- **التاريخ:** 2026-05-04
- **القرار:** كل analytics endpoint يتحقق من role قبل الرد — Supervisor يرى فريقه فقط — Agent يرى نفسه فقط
- **السبب:** ضروري مع M1 — Supervisor لا يجب أن يرى أداء موظفين خارج فريقه
- **الشرط:** Backend check + Frontend hide (double-check)

## D-033 | Live Status = polling كل 30 ثانية (لا SSE جديد)
- **التاريخ:** 2026-05-04
- **القرار:** Live Status Bar يستخدم setInterval يستدعي /analytics/overview?live=true كل 30 ثانية
- **السبب:** SSE موجود للـ messages — إضافة SSE ثاني للـ analytics = complexity بلا ضرورة
- **الشرط:** يُوقف الـ interval عند unmount() لتجنب memory leak

## D-034 | Scheduled Reports = جدول inbox_scheduled_reports_v4
- **التاريخ:** 2026-05-04
- **القرار:** نضيف جدول inbox_scheduled_reports_v4 في M4 — التنفيذ مؤجل لـ Phase 10
- **السبب:** يعتمد على email.js من Phase 8 — يُبنى فوقه مباشرة
- **الشرط:** مرئي لـ Owner / Admin فقط

## D-035 | Labels Analytics = endpoint جديد /analytics/labels
- **التاريخ:** 2026-05-04
- **القرار:** endpoint جديد يقرأ من inbox_conversation_labels JOIN inbox_labels مع filter بالفترة الزمنية
- **السبب:** لا يوجد حالياً أي تحليل للـ labels — ميزة تنافسية لفهم أنواع المشاكل
- **الشرط:** يُعيد label_name + conv_count + avg_resolution_sec + trend يومي

## D-036 | AI/Automation Analytics = endpoint جديد /analytics/automation
- **التاريخ:** 2026-05-04
- **القرار:** endpoint جديد يقرأ من chatbot_sessions + keywords + auto_close + messages.metadata
- **السبب:** لا يوجد حالياً تقرير لأداء الأتمتة والـ chatbot
- **الشرط:** fallback graceful لو الجداول فارغة (أرقام صفر — لا error)

## D-037 | Sentiment يُنقل من Overview إلى AI & Automation section
- **التاريخ:** 2026-05-04
- **القرار:** _renderSentiment() يُستدعى من قسم AI & Automation — لا تغيير في الكود نفسه
- **السبب:** منطقياً أنسب — Sentiment = تحليل ذكاء اصطناعي وليس overview عام
- **الشرط:** لا يكسر الكود الحالي — مجرد نقل مكان الاستدعاء

## D-038 | Export PDF مؤجل — CSV فقط في Phase 10
- **التاريخ:** 2026-05-04
- **القرار:** export يبقى CSV فقط — PDF يُقرر في Phase 10+
- **السبب:** PDF generation يحتاج npm package جديد — D-012 يمنع npm بدون موافقة
- **الشرط:** يُذكر للمستخدم في الـ UI أن PDF قادم

## D-030 | CSS Prefix shell-* حصري للـ App Shell
- **التاريخ:** 2026-05-04
- **القرار:** كل classes في shell.css تبدأ بـ `.shell-` — لا classes مشتركة مع `iv4-*`
- **السبب:** يمنع أي CSS conflict بين App Shell الجديد والـ inbox CSS الحالي
- **الشرط:** shell.css لا تعدّل أي rule من inbox.css

## D-039 | getInboxRole() — Permission Helper مركزي في analytics.js
- **التاريخ:** 2026-05-04
- **القرار:** دالة `getInboxRole(req)` تُضاف في أعلى analytics.js — تعيد inbox_role أو fallback على role_id
- **السبب:** لا تكرار في كل endpoint + fallback آمن قبل اكتمال M1
- **الشرط:** لو req.user.inbox_role موجود (M1 مكتمل) → يُستخدم مباشرة — وإلا fallback على role_id

## D-040 | DB Indexes على inbox_conversations_v4 قبل Analytics queries
- **التاريخ:** 2026-05-04
- **القرار:** 6 Indexes جديدة على created_at + assigned_to_id + platform في نفس migration الـ Scheduled Reports
- **السبب:** Analytics queries بدون index = full table scan على 10,000+ محادثة = بطيء
- **الشرط:** CREATE INDEX IF NOT EXISTS = آمن على DB حية بدون migration rollback

## D-041 | Analytics CSS prefix: iv4-an-* حصري للصفحة
- **التاريخ:** 2026-05-04
- **القرار:** كل classes الـ Analytics Page Module تبدأ بـ .iv4-an- — لا classes مشتركة مع shell-* أو iv4-*
- **السبب:** يمنع CSS conflict بين Page Module الجديد والـ inbox CSS الحالي (نفس مبدأ D-030)
- **الشرط:** الـ overlay class القديم iv4-an-overlay يُحذف في STEP 6 بعد التحقق من عدم استخدامه

## D-042 | req.inboxUser بدل req.user في Inbox routes
- **التاريخ:** 2026-05-04
- **القرار:** كل ملفات inbox/routes تستخدم `req.inboxUser` فقط — لا `req.user` ولا `req.tenantUser`
- **يُبنى بواسطة:** `inbox-auth-adapter.js` middleware يُضاف في inbox/index.js بعد requireAuth
- **السبب:** يفصل Inbox Core عن Auth system الخارجي (SRP — Single Responsibility)
- **الاستثناء:** `req.db` يبقى كما هو (getTenantDb موجود بالفعل)

## D-043 | has_erp + has_payment flags في req.inboxUser
- **التاريخ:** 2026-05-04
- **القرار:** req.inboxUser يحمل `has_erp` و`has_payment` boolean flags
- **has_erp=true** → context.js يُظهر Invoices + Orders + CRM sections
- **has_erp=false** → context.js يُعيد بيانات جهة الاتصال فقط
- **السبب:** Plugin Pattern — يحمي Inbox من crash لو ERP غير موجود

## D-044 | InboxConfig object في api.js
- **التاريخ:** 2026-05-04
- **القرار:** `public/dashboard/inbox-v4/api.js` يضيف InboxConfig object في الأعلى (apiBase + authBase + wsBase)
- **السبب:** يمنع hardcoded URLs التي تعيق Standalone deployment

## D-045 | context.js يُحاط بـ try/catch + has_erp check
- **التاريخ:** 2026-05-04
- **القرار:** كل query في context.js تُحاط بـ try/catch + has_erp check
- فشل الـ query أو غياب ERP يُعيد `[]` أو `{}` بدون error 500
- **السبب:** graceful degradation في Standalone mode

## D-046 | Inbox data migration utility (مستقبل — Phase 10+)
- **التاريخ:** 2026-05-04
- **القرار:** نخطط لـ export utility: `sqlite3 {id}.db .dump | grep "^INSERT INTO inbox_"`
- **يُنفّذ في Phase 10+** — ليس الآن
- **السبب:** يسمح بنقل بيانات Inbox من areej-pro DB إلى Standalone DB بدون ERP data

## D-025 | inbox_channel_settings_v4 — column names
- **التاريخ:** 2026-05-05
- **القرار:** الـ DB columns هي `channel` و`active` — الـ backend يعمل mapping في الـ response
- **السبب:** migration v23 كتب `channel`/`active` — الـ backend كُتب لاحقاً بـ `channel_type`/`is_active`
- **الشرط:** أي كود يتعامل مع هذا الجدول يستخدم اسم الـ DB (`channel`/`active`) في الـ query، ويعمل mapping في الـ response
