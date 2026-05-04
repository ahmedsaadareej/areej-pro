# EX-M4 — تنفيذ M4: Analytics (التقارير)
> المرجع: `inbox-v4/plans/M4-analytics.md`
> المهام: T51 → T63 (13 مهمة)
> المتطلب: M1 + M5 + M3 مكتملة (M2 اختياري — يمكن موازاة)
> آخر تحديث: 2026-05-04

---

## 📋 حالة المهام

| # | المهمة | النوع | الحالة |
|---|--------|-------|--------|
| T51 | Migration: `inbox_scheduled_reports_v4` | DB | ✅ commit 83c6659 |
| T52 | Migration: Analytics DB Indexes | DB | ✅ commit 83c6659 |
| T53 | `analytics.js` — Permission Helper | Backend | ✅ commit b24a352 |
| T54 | `analytics.js` — `/labels` endpoint | Backend | ✅ commit b24a352 |
| T55 | `analytics.js` — `/automation` endpoint | Backend | ✅ commit b24a352 |
| T56 | `analytics.js` — Permission Filtering | Backend | ✅ commit b24a352 |
| T57 | `analytics.js` — Scheduled Reports CRUD | Backend | ✅ commit b24a352 |
| T58 | `analytics.js` — تحويل لـ Page Module | Frontend | ✅ commit 50f792a |
| T59 | `analytics.js` — قسم Labels | Frontend | ✅ commit 50f792a |
| T60 | `analytics.js` — قسم AI & Automation | Frontend | ✅ commit 50f792a |
| T61 | `analytics.js` — Live Status Bar | Frontend | ✅ commit 50f792a |
| T62 | `analytics.js` — Permission-Aware Rendering | Frontend | ✅ commit 50f792a |
| T63 | `analytics.js` — Scheduled Reports UI | Frontend | ✅ commit 50f792a |

---

## 🗺️ ترتيب التنفيذ في M4

```
Migrations (T51→T52) → Backend Permission Helper (T53)
→ Backend New Endpoints (T54→T55) → Backend Permission Filtering (T56)
→ Backend Scheduled CRUD (T57) → Frontend Page Module (T58)
→ Frontend New Sections (T59→T61) → Frontend Permissions (T62)
→ Frontend Scheduled UI (T63)
```

---

## 🏗️ المرحلة الأولى — DB Migrations (T51 + T52)

---

### ▶️ T51 — Migration: `inbox_scheduled_reports_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M4_001_scheduled_reports.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_scheduled_reports_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  report_type  TEXT NOT NULL CHECK(report_type IN
               ('overview','agents','sla','csat','labels','automation','full')),
  frequency    TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
  send_hour    INTEGER NOT NULL DEFAULT 8
               CHECK(send_hour BETWEEN 0 AND 23),
  send_day     INTEGER CHECK(send_day BETWEEN 0 AND 6),  -- لـ weekly فقط
  recipients   TEXT NOT NULL,  -- JSON array: ["ahmed@example.com"]
  format       TEXT NOT NULL DEFAULT 'csv'
               CHECK(format IN ('csv','pdf')),
  active       INTEGER NOT NULL DEFAULT 1,
  last_sent    INTEGER,  -- Unix timestamp
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active
  ON inbox_scheduled_reports_v4(active, send_hour);
```

**ملاحظة:** التنفيذ الفعلي لإرسال الـ email = مؤجل (D-034) — الجدول جاهز لكن الإرسال Phase 10+.

**تحقق قبل commit:**
```bash
node --check server/migrations/inbox-v4/M4_001_scheduled_reports.js
sqlite3 /path/to/db.sqlite "PRAGMA table_info(inbox_scheduled_reports_v4);"
```

---

### ▶️ T52 — Migration: Analytics DB Indexes

**الملف الجديد:**
```
server/migrations/inbox-v4/M4_002_analytics_indexes.js
```

**الـ SQL:**
```sql
-- Indexes للأداء — آمن تماماً على بيانات production (لا يعدّل البيانات)
CREATE INDEX IF NOT EXISTS idx_conv_created_at
  ON inbox_conversations_v4(created_at);
CREATE INDEX IF NOT EXISTS idx_conv_assigned
  ON inbox_conversations_v4(assigned_to_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_status_date
  ON inbox_conversations_v4(status, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_conv_id
  ON inbox_messages_v4(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_labels_conv
  ON inbox_conversation_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_label
  ON inbox_conversation_labels(label_id);
```

**⚠️ ملاحظة production:** هذا الـ migration آمن — `CREATE INDEX IF NOT EXISTS` لا يمس البيانات ويعمل حتى لو الجدول يحتوي ملايين الصفوف.

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite \
  "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM inbox_conversations_v4 WHERE created_at > '2026-01-01';"
# يجب أن يظهر: "USING INDEX idx_conv_created_at"
```

---

## 🔧 المرحلة الثانية — Backend (T53 → T57)

> كل تعديل على `analytics.js` = commit مستقل.

---

### ▶️ T53 — Backend: Permission Helper في `analytics.js`

**الملف المعدَّل:**
```
server/routes/inbox/analytics.js
```

**إضافة في أعلى الملف:**

```javascript
// دالة مساعدة: تُعيد role string للتوافق مع الكود القديم
function getInboxRole(req) {
  const roleMap = { 1: 'owner', 2: 'admin', 3: 'supervisor', 4: 'agent', 5: 'readonly' };
  return roleMap[req.inboxUser?.inbox_role_id] || 'agent';
}

// Middleware: يتحقق من صلاحية التقارير (أدنى مستوى)
function requireAnalyticsAccess(req, res, next) {
  const role = getInboxRole(req);
  if (!['owner','admin','supervisor','agent','readonly'].includes(role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// دالة: تُعيد team_id filter للـ Supervisor
function getTeamFilter(req) {
  if (getInboxRole(req) === 'supervisor') {
    return req.inboxUser.team_id || null;
  }
  return null;
}
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/analytics.js
```

---

### ▶️ T54 — Backend: Endpoint `/analytics/labels`

**الملف المعدَّل:**
```
server/routes/inbox/analytics.js
```

**Route جديد:**
```javascript
router.get('/analytics/labels', requirePermission('reports_team'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = req.db;
    const teamFilter = getTeamFilter(req);

    const labels = await db.all(`
      SELECT
        l.id, l.name, l.color,
        COUNT(DISTINCT cl.conversation_id) as conv_count,
        AVG(
          CASE WHEN c.resolved_at IS NOT NULL
          THEN (julianday(c.resolved_at) - julianday(c.created_at)) * 1440
          ELSE NULL END
        ) as avg_resolution_min
      FROM inbox_labels l
      LEFT JOIN inbox_conversation_labels cl ON cl.label_id = l.id
      LEFT JOIN inbox_conversations_v4 c ON c.id = cl.conversation_id
        AND c.created_at BETWEEN ? AND ?
        ${teamFilter ? 'AND c.team_id = ?' : ''}
      GROUP BY l.id
      ORDER BY conv_count DESC
    `, teamFilter ? [from, to, teamFilter] : [from, to]);

    // Trend: أكثر 5 labels
    const top5 = labels.slice(0, 5).map(l => l.id);
    // ... daily trend query ...

    res.json({ labels, trend: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**تحقق قبل commit:**
```bash
curl "http://localhost:3002/api/inbox/analytics/labels?from=2026-01-01&to=2026-12-31"
# يجب أن يُعيد: { labels: [...], trend: [] }
# لا 500 حتى لو الجداول فارغة
```

---

### ▶️ T55 — Backend: Endpoint `/analytics/automation`

**الملف المعدَّل:**
```
server/routes/inbox/analytics.js
```

**Route جديد:**
```javascript
router.get('/analytics/automation', requirePermission('reports_team'), async (req, res) => {
  const { from, to } = req.query;
  const db = req.db;

  // كل query في try/catch مستقل — graceful degradation (D-045)
  let chatbot_only = 0, auto_closed = 0, keyword_stats = [], ai_suggested = 0;

  try {
    const r = await db.get(
      "SELECT COUNT(*) as c FROM inbox_conversations_v4 WHERE ended_by='bot' AND created_at BETWEEN ? AND ?",
      [from, to]
    );
    chatbot_only = r?.c || 0;
  } catch (_) {}

  try {
    const r = await db.get(
      "SELECT COUNT(*) as c FROM inbox_conversations_v4 WHERE close_reason='auto_close' AND created_at BETWEEN ? AND ?",
      [from, to]
    );
    auto_closed = r?.c || 0;
  } catch (_) {}

  // ... باقي الـ queries ...

  res.json({ chatbot_only, auto_closed, keyword_stats, ai_suggested });
});
```

**تحقق قبل commit:**
```bash
curl "http://localhost:3002/api/inbox/analytics/automation?from=2026-01-01&to=2026-12-31"
# يجب أن يُعيد أصفار — لا 500
```

---

### ▶️ T56 — Backend: Permission Filtering على الـ Endpoints الحالية

**الملف المعدَّل:**
```
server/routes/inbox/analytics.js
```

**التعديلات على كل endpoint:**

```javascript
// /overview, /volume, /hourly → مفتوح (requireAnalyticsAccess فقط)
// /agents → owner/admin/supervisor فقط:
router.get('/analytics/agents', (req, res, next) => {
  const role = getInboxRole(req);
  if (!['owner','admin','supervisor'].includes(role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Supervisor: أضف team filter
  const teamId = getTeamFilter(req);
  // ...
  next();
}, agentsHandler);

// /agents/:id → agent يرى نفسه فقط:
router.get('/analytics/agents/:id', (req, res, next) => {
  const role = getInboxRole(req);
  if (role === 'agent' && req.params.id !== String(req.inboxUser.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}, agentDetailHandler);

// /platforms, /sla, /csat, /sentiment → owner/admin/supervisor فقط
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/analytics.js
# Agent يطلب /analytics/agents → 403
# Agent يطلب /analytics/agents/<agent_own_id> → 200
```

---

### ▶️ T57 — Backend: Scheduled Reports CRUD API

**الملف المعدَّل:**
```
server/routes/inbox/analytics.js
```

**Routes جديدة:**
```
GET    /analytics/scheduled      ← owner/admin فقط
POST   /analytics/scheduled      ← owner/admin فقط
PUT    /analytics/scheduled/:id  ← owner/admin فقط
DELETE /analytics/scheduled/:id  ← owner/admin فقط
```

**قيد الصلاحية:**
```javascript
function requireOwnerAdmin(req, res, next) {
  const role = getInboxRole(req);
  if (!['owner','admin'].includes(role)) {
    return res.status(403).json({ error: 'owner_or_admin_required' });
  }
  next();
}
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/analytics.js
# Supervisor يطلب /analytics/scheduled → 403
# Admin يطلب /analytics/scheduled → 200
```

---

## 🎨 المرحلة الثالثة — Frontend (T58 → T63)

> كلها تعديلات على `public/dashboard/inbox-v4/analytics.js`
> كل تعديل = commit مستقل

---

### ▶️ T58 — Frontend: تحويل `analytics.js` لـ Page Module

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**التعديلات:**

```javascript
// تغليف الكود الحالي:
const InboxAnalytics = {
  _container: null,
  _section: 'overview',

  mount(container, params) {
    this._container = container;
    this._section = params.section || 'overview';

    // استبدال overlay CSS القديم (iv4-an-overlay) بـ full-page container
    container.innerHTML = `
      <div class="iv4-an-page">
        <nav class="iv4-an-nav">
          <!-- Sections nav -->
        </nav>
        <div class="iv4-an-content" id="iv4-an-content"></div>
      </div>
    `;

    this._loadSection(this._section);
  },

  _loadSection(section) {
    // ... الكود الحالي للـ sections ...
  },

  unmount() {
    this._container = null;
    // cleanup intervals
    if (this._liveInterval) clearInterval(this._liveInterval);
  }
};
```

**ملاحظة:** CSS prefix `iv4-an-*` يبقى كما هو (D-041).

**تحقق قبل commit:**
```bash
# في Console:
InboxAnalytics.mount(document.getElementById('shell-content'), { section: 'overview' })
# Analytics يظهر كـ full page
```

---

### ▶️ T59 — Frontend: قسم Labels في Analytics

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**إضافة section جديد:**

```javascript
// في _loadSection() — إضافة case:
case 'labels':
  this._renderLabels(content, from, to);
  break;

async _renderLabels(container, from, to) {
  const { labels } = await InboxAPI.get(
    `/inbox/analytics/labels?from=${from}&to=${to}`
  );
  container.innerHTML = `
    <div class="iv4-an-section">
      <h2>📊 تحليل التصنيفات</h2>
      <!-- Horizontal Bar Chart: أكثر 10 labels -->
      <!-- جدول: label / عدد / % / متوسط وقت الحل -->
    </div>
  `;
  // رسم الـ charts ...
}
```

**تحقق قبل commit:**
```bash
# /reports/labels → قسم التصنيفات يظهر
```

---

### ▶️ T60 — Frontend: قسم AI & Automation في Analytics

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**إضافة section جديد:**

```javascript
case 'automation':
  this._renderAutomation(content, from, to);
  break;

async _renderAutomation(container, from, to) {
  const [autoData, sentimentData] = await Promise.all([
    InboxAPI.get(`/inbox/analytics/automation?from=${from}&to=${to}`),
    InboxAPI.get(`/inbox/analytics/sentiment?from=${from}&to=${to}`)
  ]);

  container.innerHTML = `
    <div class="iv4-an-section">
      <h2>🤖 الأتمتة والذكاء الاصطناعي</h2>
      <!-- KPI Cards: chatbot-only % + auto-closed % + keyword hits + AI-suggested -->
      <!-- Sentiment Analysis (منقول من Overview) -->
      <!-- Keyword Stats table -->
      <!-- Top Negative Conversations -->
    </div>
  `;
}
```

**ملاحظة:** Sentiment Analysis يُنقل من Overview لهنا (D-037) — احذفه من Overview بعد إضافته هنا.

**تحقق قبل commit:**
```bash
# /reports/automation → القسم يظهر بـ KPI Cards
```

---

### ▶️ T61 — Frontend: Live Status Bar في Overview

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**إضافة في Overview section:**

```javascript
_initLiveStatus(container) {
  const liveBar = container.querySelector('.iv4-an-live-bar');
  if (!liveBar) return;

  const refresh = async () => {
    try {
      const data = await InboxAPI.get('/inbox/analytics/overview?live=true');
      liveBar.innerHTML = `
        <span>🟢 محادثات مفتوحة الآن: <strong>${data.open_now}</strong></span>
        <span>👤 موظفون Online: <strong>${data.agents_online}</strong></span>
      `;
    } catch (_) {}
  };

  refresh();  // استدعاء فوري
  this._liveInterval = setInterval(refresh, 30000);  // كل 30 ثانية (D-033)
},
```

**⚠️ لا SSE جديد** — فقط polling كل 30 ثانية (D-033 pattern).

**تحقق قبل commit:**
```bash
# Overview يعرض Live Status Bar
# الأرقام تتحدث كل 30 ثانية (تحقق من Network tab)
```

---

### ▶️ T62 — Frontend: Permission-Aware Rendering

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**التعديلات في `mount()`:**

```javascript
mount(container, params) {
  const role = InboxStore.state.currentUser.inbox_role_id;
  const roleStr = { 1:'owner', 2:'admin', 3:'supervisor', 4:'agent', 5:'readonly' }[role];

  // Agent → وجّهه مباشرة لأدائه الشخصي
  if (roleStr === 'agent') {
    params.section = `agents/${InboxStore.state.currentUser.id}`;
  }

  // Read-only → أخفِ أزرار Export
  this._canExport = InboxStore.can('export');

  // تمرير team_id للـ Supervisor
  this._teamId = roleStr === 'supervisor' ? InboxStore.state.currentUser.team_id : null;

  // ...باقي mount...
}

// في كل section يُعرض Export button:
if (this._canExport) {
  container.querySelector('.iv4-an-export-btn')?.removeAttribute('hidden');
}
```

**تحقق قبل commit:**
```bash
# Agent يفتح /reports → يُعيد redirect لـ /reports/agents/<id>
# Read-only يفتح /reports → لا يرى زر Export
# Supervisor يرى بيانات فريقه فقط
```

---

### ▶️ T63 — Frontend: قسم Scheduled Reports في Analytics

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/analytics.js
```

**إضافة section جديد (مرئي لـ Owner / Admin فقط):**

```javascript
case 'scheduled':
  // Permission check
  const role = getInboxRole(req);  // نسخة frontend من InboxStore
  if (!InboxStore.can('reports_full') || !['owner','admin'].includes(roleStr)) {
    container.innerHTML = '<p>هذا القسم للمدراء فقط</p>';
    return;
  }
  this._renderScheduled(content);
  break;

async _renderScheduled(container) {
  const reports = await InboxAPI.get('/inbox/analytics/scheduled');
  container.innerHTML = `
    <div class="iv4-an-section">
      <div class="iv4-an-header">
        <h2>📅 التقارير المجدولة</h2>
        <button id="iv4-new-report-btn">+ إنشاء تقرير</button>
      </div>
      <!-- جدول: الاسم / النوع / التكرار / الوقت / المستلمون / الحالة -->
      <!-- أزرار: تعطيل / حذف -->
    </div>
  `;
  // نموذج إنشاء (Modal):
  // - الاسم
  // - نوع البيانات (overview/agents/sla/csat/labels/automation/full)
  // - التكرار (daily/weekly/monthly)
  // - الوقت (send_hour)
  // - المستلمون (emails)
  // - التنسيق (csv/pdf)
}
```

**ملاحظة:** Email delivery مؤجل — الـ UI يحفظ في DB لكن الإرسال الفعلي في Phase 10+.

**تحقق قبل commit:**
```bash
# /reports/scheduled → Admin يرى القسم
# Supervisor يفتح /reports/scheduled → "هذا القسم للمدراء فقط"
# إنشاء تقرير جديد → يُحفظ في inbox_scheduled_reports_v4
```

---

## ✅ معيار إغلاق M4

قبل الإعلان عن اكتمال Phase 10، تأكد من كل ما يلي:

- [ ] `PRAGMA table_info(inbox_scheduled_reports_v4)` ✅
- [ ] Indexes موجودة: `EXPLAIN QUERY PLAN` يظهر "USING INDEX"
- [ ] `node --check server/routes/inbox/analytics.js` ✅
- [ ] Agent → `/analytics/agents` = 403
- [ ] `/analytics/labels` يُعيد JSON (لا 500)
- [ ] `/analytics/automation` يُعيد أصفار (لا 500 على جداول فارغة)
- [ ] `InboxAnalytics.mount()` يعمل كـ Page Module
- [ ] `/reports/labels` يعرض القسم
- [ ] `/reports/automation` يعرض القسم
- [ ] Live Status Bar يتحدث كل 30 ثانية
- [ ] Agent يُعاد توجيهه لأدائه الشخصي
- [ ] git log يظهر commit لكل خطوة

---

## 🏁 بعد اكتمال M4 — Phase 10 منتهية!

تهانينا — عند اكتمال M4، يكون كل Phase 10 منجزاً.

**آخر خطوات إدارية:**
```bash
# 1. حدّث PHASE10_EXECUTION.md — علّم كل المحاور بـ ✅
# 2. commit نهائي:
git add -A
git commit -m "✅ Phase 10 complete — M1+M5+M3+M2+M4 fully implemented"
git push
```
