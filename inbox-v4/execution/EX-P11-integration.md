# EX-P11 — Phase 11: التكامل الحقيقي + QA + الانتقال لـ v4
> آخر تحديث: 2026-05-04
> المتطلب: Phase 10 مكتملة ✅ (M1+M5+M3+M2+M4)
> الهدف: Inbox v4 يشتغل فعلياً في المتصفح ويخدم عميل حقيقي

---

## 📌 المنطق العام لـ Phase 11

Phase 10 بنت كل الكود — لكنه لسا **غير مربوط** كاملاً.
Phase 11 هي "التشغيل الحقيقي":
- Shell يُحمّل الـ Pages فعلياً
- الصلاحيات تُقرأ من DB حقيقية
- عميل واحد ينتقل من v3 لـ v4 كـ Pilot
- الأخطاء تُصلح، والـ UX يتضبط

---

## 🗺️ المحاور والترتيب الإلزامي

```
P11-A (Shell Wiring) → P11-B (Permissions DB) → P11-C (QA + Bugfix)
→ P11-D (Pilot Migration) → P11-E (Deferred Features)
```

---

## 🔗 المحور P11-A: ربط Shell بالـ Page Modules فعلياً
> الجلسة: 1 جلسة (5 مهام)
> الهدف: فتح /inbox في المتصفح يشتغل كامل

---

### A1 — ربط page-reports.js بـ InboxAnalytics.mount()

**الملفات:**
- `public/inbox-v4/pages/page-reports.js` ← تعديل

**المطلوب:**
```javascript
const PageReports = {
  mount(container, params) {
    // تحميل scripts الـ analytics لو مش موجودة
    // InboxAnalytics.mount(container, { section: params.section || 'overview' })
  },
  unmount() { InboxAnalytics.unmount?.(); }
};
```

**تحقق:**
- `/reports` في المتصفح → Live Status Bar يظهر
- `/reports/labels` → قسم التصنيفات يظهر
- `/reports/scheduled` → مرئي لـ Admin فقط

---

### A2 — ربط page-settings.js بـ InboxSettings.mount()

**الملفات:**
- `public/inbox-v4/pages/page-settings.js` ← تعديل

**المطلوب:**
```javascript
const PageSettings = {
  mount(container, params) {
    InboxSettings.mount(container, { section: params.section || 'org' });
  },
  unmount() { InboxSettings.unmount?.(); }
};
```

**تحقق:**
- `/settings` → صفحة الإعدادات تظهر بالكامل
- `/settings/channels` → قنوات التواصل

---

### A3 — ربط page-inbox.js بالـ 3 أعمدة الحالية

**الملفات:**
- `public/inbox-v4/pages/page-inbox.js` ← تعديل

**المطلوب:**
- يحقن HTML الـ 3 أعمدة (من `public/dashboard/inbox-v4/index.html`) في container
- يستدعي `InboxApp.init()` أو ما يعادله
- لو params.convId → يفتح المحادثة فوراً بعد الـ init

**تحقق:**
- `/inbox` → قائمة محادثات تظهر
- `/inbox/conv/5` → محادثة رقم 5 تفتح مباشرة (deep link)

---

### A4 — تحديث shell.js: ربط route:change بالـ Page Modules

**الملفات:**
- `public/inbox-v4/shell.js` ← تعديل

**المطلوب:**
- `route:change` event → `shell.js` يستدعي `PageXxx.mount(container, params)`
- يستدعي `PageXxx.unmount()` على الصفحة القديمة قبل الانتقال
- Sidebar active state يتحدث مع كل route change

**تحقق:**
- التنقل بين Inbox → Reports → Settings → Inbox يعمل بدون reload
- الـ SSE لا ينقطع أثناء التنقل

---

### A5 — اختبار Deep Links + Back Button

**لا ملفات جديدة** — اختبار فقط ثم إصلاح ما يظهر

**اختبارات إلزامية:**
```
/inbox                → قائمة محادثات
/inbox/conv/<id>      → محادثة مباشرة
/reports/agents       → قسم الموظفين مباشرة
/settings/channels    → إعدادات القنوات مباشرة
زر Back في المتصفح   → يرجع للصفحة السابقة بدون reload
```

**commit بعد نجاح كل اختبار.**

---

## 🔐 المحور P11-B: تفعيل نظام الصلاحيات على DB حقيقية
> الجلسة: 1 جلسة (4 مهام)
> الهدف: كل موظف يرى فقط ما له صلاحية

---

### B1 — تحقق من migrations v33→v43 على DB الحالية

**الملفات:**
- `server/migrations.js` ← قراءة فقط
- تشغيل على tenant DB حقيقية

**المطلوب:**
```bash
# تحقق إن كل الـ migrations اتطبقت
sqlite3 /home/areej/areej-pro/data/tenants/<id>.db \
  "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 5"
# يجب أن يظهر 43 كأعلى رقم
```

**لو ناقص migrations:** `pm2 restart areej-pro` يُشغّل الـ runner تلقائياً.

---

### B2 — seed inbox_users من tenant_users الحاليين

**الملفات:**
- سكريبت جديد: `server/scripts/seed-inbox-users.js`

**المطلوب:**
```javascript
// يقرأ tenant_users → يُنشئ inbox_users مقابلة
// Owner (role_id=1) → inbox_role_id=1
// باقي الأدوار → inbox_role_id=4 (Agent) كـ default
// لا يكرر لو موجود (INSERT OR IGNORE)
```

**تحقق:**
```bash
node server/scripts/seed-inbox-users.js <tenant_id>
sqlite3 data/tenants/<id>.db "SELECT COUNT(*) FROM inbox_users"
# يساوي عدد tenant_users
```

---

### B3 — اختبار Permission Guard في المتصفح

**لا ملفات جديدة** — اختبار فقط

**اختبارات:**
- Agent يفتح `/reports` → يُعاد توجيهه لأدائه الشخصي
- Agent يفتح `/settings/channels` → "ليس لديك صلاحية"
- Admin يفتح `/reports/scheduled` → يرى الجدول

**لو في خطأ:** إصلاح في `permissions.js` أو `shell.js` حسب المشكلة.

---

### B4 — اختبار Supervisor Team Filter

**اختبار:**
- موظف بدور Supervisor يفتح `/reports/agents`
- يرى فريقه فقط (لو `team_id` مضبوط)
- لو `team_id = null` → يرى الكل (fallback آمن)

---

## 🧪 المحور P11-C: QA شامل + إصلاح الأخطاء
> الجلسة: 1-2 جلسة (حسب عدد الأخطاء)
> الهدف: inbox v4 يشتغل بدون أخطاء console

---

### C1 — Console Error Audit

**فتح الـ Inbox في المتصفح مع DevTools مفتوح:**

```
الصفحات المطلوب اختبارها:
/inbox              → قايمة محادثات + فتح محادثة
/inbox/broadcast    → Broadcast panel
/reports/overview   → نظرة عامة
/reports/labels     → تصنيفات
/reports/automation → AI & Automation
/settings/org       → إعدادات المؤسسة
/settings/channels  → القنوات
```

**لكل خطأ:** سجّله في `inbox-v4/bugs/C1-console-errors.md` ثم أصلحه.

---

### C2 — SSE Stability Test

**المطلوب:**
- افتح الـ Inbox لمدة 5 دقائق
- تنقّل بين الصفحات 10 مرات
- تحقق إن SSE connection واحد فقط مفتوح (DevTools > Network > EventStream)

**لو في double connection:** راجع `_initialized` guard في `stream.js` (D-029).

---

### C3 — Mobile Responsive Check

**breakpoints:**
- 1280px → Layout 3 أعمدة طبيعي
- 768px → Sidebar تصبح icon-only (48px)
- 480px → Bottom tab bar

**إصلاح أي مشكلة CSS في `shell.css` أو `inbox.css`.**

---

### C4 — Dark Mode Check

**تفعيل Dark Mode في النظام → تحقق إن:**
- الألوان مقروءة في كل الصفحات
- لا نص أبيض على خلفية بيضاء
- Charts وBadges واضحة

---

## 🚀 المحور P11-D: Pilot Migration — عميل واحد من v3 لـ v4
> الجلسة: 1 جلسة (3 مهام)
> الهدف: عميل حقيقي يستخدم v4 ويرجع يقدر لـ v3 لو في مشكلة

---

### D1 — Data Migration Utility (D-046)

**الملف الجديد:**
- `server/scripts/migrate-inbox-v3-to-v4.js`

**المطلوب:**
```javascript
// يقرأ inbox_conversations (v3) ويكتب في inbox_conversations_v4
// يقرأ inbox_messages (v3) ويكتب في inbox_messages_v4
// يحافظ على IDs + timestamps
// DRY RUN mode أولاً (--dry-run flag)
// لو --dry-run ناجح → --execute
```

**⚠️ قواعد المهاجر:**
- لا تحذف v3 tables
- أي خطأ → rollback كامل
- سجّل كل migration في `inbox_migration_log` جدول جديد

---

### D2 — Pilot على عميل تجريبي

**الخطوات:**
```bash
# 1. Backup أولاً
cp data/tenants/<id>.db data/tenants/<id>.db.backup-$(date +%Y%m%d)

# 2. Dry run
node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --dry-run

# 3. تحقق من الأرقام
# "سيتم نقل X محادثة، Y رسالة"

# 4. Execute
node server/scripts/migrate-inbox-v3-to-v4.js --tenant=<id> --execute

# 5. تحقق
sqlite3 data/tenants/<id>.db "SELECT COUNT(*) FROM inbox_conversations_v4"
```

---

### D3 — قرار التبديل: v3 → v4 كـ Default

**المطلوب من أحمد:**
- مراجعة الـ Pilot مع العميل التجريبي لمدة أسبوع
- لو كل شيء OK → `server/app.js` يُغيّر `/inbox` route لـ v4 index.html
- v3 يبقى على `/inbox-legacy` للطوارئ فقط

---

## 🔧 المحور P11-E: الميزات المؤجلة
> جلسات منفصلة حسب الأولوية

---

### E1 — Email Delivery للتقارير المجدولة

**الملفات:**
- `server/routes/inbox/analytics.js` ← إضافة email sending
- يعتمد على `email.js` (SMTP موجود من Phase 8)

**المطلوب:**
- Cron job يشتغل كل ساعة
- يفحص `inbox_scheduled_reports_v4` اللي حان وقتها
- يولّد CSV ويُرسله عبر SMTP

---

### E2 — صفحة Contacts كاملة

**الملفات:**
- `public/inbox-v4/pages/page-contacts.js` ← من placeholder لـ صفحة حقيقية

**المطلوب:**
- جدول جهات الاتصال من `crm_contacts`
- بحث + فلتر
- فتح بروفايل جهة الاتصال مع محادثاتها

---

### E3 — PDF Export للتقارير (D-038)

**يحتاج موافقة أحمد أولاً على npm package:**
- `puppeteer` (Chromium-based) — ~170MB
- أو `pdfkit` — خفيف لكن بدون CSS rendering

---

### E4 — WhatsApp Live Mode

**المطلوب:**
- تقديم طلب Meta Business Verification
- بعد الموافقة: تغيير App Mode من Development لـ Live
- اختبار إرسال/استقبال مع أرقام خارج قائمة الـ Test Numbers

---

## ✅ معيار إغلاق Phase 11

```
[ ] /inbox يفتح وقائمة المحادثات تظهر (بدون console errors)
[ ] /reports/overview يعرض أرقام حقيقية
[ ] /settings/org يحفظ بيانات المؤسسة
[ ] Agent لا يرى Reports الكاملة
[ ] SSE connection واحد فقط مفتوح
[ ] عميل Pilot يعمل على v4 لمدة 3 أيام بدون مشاكل
[ ] git log يظهر commit لكل خطوة
```

---

## 📋 ترتيب الجلسات الموصى به

| الجلسة | المحور | المهام | الأمر |
|---|---|---|---|
| 1 | P11-A Shell Wiring | A1→A5 | `اتبع البروتوكول... EX-P11... المهمة: P11-A` |
| 2 | P11-B Permissions DB | B1→B4 | `اتبع البروتوكول... EX-P11... المهمة: P11-B` |
| 3 | P11-C QA | C1→C4 | `اتبع البروتوكول... EX-P11... المهمة: P11-C` |
| 4 | P11-D Pilot | D1→D3 | `اتبع البروتوكول... EX-P11... المهمة: P11-D` |
| 5+ | P11-E Features | E1, E2, E3... | حسب الأولوية |
