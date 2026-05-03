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

## D-007 | InboxStore = Single Source of Truth
- **التاريخ:** 2026-05-03
- **القرار:** كل الـ state في `InboxStore` object — لا global variables مبعثرة
- **السبب:** الـ IV3 object الحالي = state + logic + UI mixed — صعب debug
- **الشكل:** `InboxStore.state` + `InboxStore.on(event, handler)` + `InboxStore.emit(event, data)`
