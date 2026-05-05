# M4 — التقارير (Analytics) — خطة التصميم المعماري الكاملة
> المرحلة 1: تحليل + تصميم معماري
> تاريخ الجلسة: 2026-05-04
> الحالة: مكتملة ✅

---

## 🔍 الواقع الحالي — ما تم بناؤه في Phase 0–8

### Backend — `/server/routes/inbox/analytics.js`
الـ Backend **مكتمل ومتقدم جداً**. الـ endpoints الموجودة:

| الـ Endpoint | الوصف | الحالة |
|---|---|---|
| `GET /analytics/overview` | KPIs عامة: إجماليات + متوسطات | ✅ موجود |
| `GET /analytics/sla` | SLA overview بالأولوية | ✅ موجود |
| `GET /analytics/sla/detail` | SLA تفصيلي: يومي + بالمنصة + أسوأ 10 | ✅ موجود |
| `GET /analytics/agents` | أداء الموظفين (جميعهم) | ✅ موجود |
| `GET /analytics/agents/:id` | تفاصيل موظف واحد | ✅ موجود |
| `GET /analytics/platforms` | توزيع المنصات | ✅ موجود |
| `GET /analytics/platforms/:platform` | تفاصيل منصة واحدة | ✅ موجود |
| `GET /analytics/volume` | حجم المحادثات اليومي | ✅ موجود |
| `GET /analytics/hourly` | توزيع الرسائل بالساعة | ✅ موجود |
| `GET /analytics/csat` | تحليل CSAT كامل | ✅ موجود |
| `GET /analytics/sentiment` | تحليل المشاعر بالذكاء الاصطناعي | ✅ موجود |

**⚠️ ما ينقص في الـ Backend:**
- لا يوجد endpoint لتقرير Labels/Topics
- لا يوجد endpoint للـ AI/Automation Report
- لا يوجد endpoint للـ Scheduled Reports (email delivery)
- لا يوجد endpoint لـ Live Dashboard (real-time counters)
- لا يوجد تطبيق لـ Permission Filtering (كل موظف يرى ما يحق له فقط)
- لا يوجد export endpoint (الـ export حالياً CSV client-side فقط)

### Frontend — `/public/dashboard/inbox-v4/analytics.js`
الـ Frontend موجود كـ **overlay modal** يُفتح فوق الـ Inbox. فيه:
- ✅ KPI Cards
- ✅ Volume Chart (SVG يدوي)
- ✅ Hourly Heatmap
- ✅ Platforms section مع drill-down
- ✅ SLA section مع تفصيل modal
- ✅ CSAT section كامل
- ✅ Agents table مع drill-down
- ✅ Sentiment Analysis (AI)
- ✅ Export CSV (client-side)
- ✅ Date Range Picker (7/30/90/custom)

**⚠️ ما ينقص في الـ Frontend:**
- لا يوجد قسم Labels/Topics
- لا يوجد قسم AI & Automation Report
- لا يوجد Scheduled Reports UI
- لا يوجد Live Dashboard
- لا يوجد Permission-aware rendering (Supervisor يرى كل شيء حالياً)
- Analytics تفتح كـ overlay modal — في Phase 9 نحددها كـ **صفحة مستقلة** (D-013 pattern + M3)

---

## 📌 القرارات المعمارية لـ M4

### Q1: هل نعيد بناء الـ Analytics UI من الصفر أم نهاجر الكود الحالي؟

**القرار: هجرة + تطوير (لا إعادة بناء)**

المبررات:
- الكود الحالي متقدم ويشتغل — إعادة البناء من الصفر = ضياع وقت بلا سبب
- التحويل لـ Page Module (D-027 pattern) يتم بـ wrapper بسيط
- نضيف الـ features الناقصة فوق الكود الحالي

### Q2: كيف تصبح Analytics صفحة مستقلة بدلاً من modal؟

**القرار: Analytics تُحوَّل لـ Page Module متوافق مع M3 App Shell**

- `InboxAnalytics` يصبح Page Module بـ `mount(container, params)` / `unmount()`
- يُفتح من Sidebar عبر `InboxRouter.navigate('/analytics')`
- الـ overlay CSS (`iv4-an-overlay`) يُزال — يُستعاض عنه بـ full-page layout في Shell
- الـ container يُمرَّر من App Shell عند mount
- لا reload — SPA navigation

### Q3: كيف يؤثر M1 (Permissions) على Analytics؟

**القرار: Permission Filtering على مستويين**

| المستوى | التفاصيل |
|---|---|
| Backend | كل endpoint يتحقق من `req.inboxUser.role` قبل الرد |
| Frontend | `InboxAnalytics.mount()` يستقبل `userRole` ويُخفي الأقسام غير المسموحة |

**Permission Rules:**
| الدور | ما يرى |
|---|---|
| Owner / Admin | كل شيء |
| Supervisor | تقارير فريقه فقط (يُمرَّر team_id في كل query) |
| Agent | نفسه فقط (`/analytics/agents/:myId`) |
| Read-only | نفس Agent لكن بدون export |

### Q4: هل نضيف Scheduled Reports (إرسال تلقائي بالإيميل)؟

**القرار: نصمّم المعمارية ونؤجل التنفيذ لـ Phase 10**

- نضيف الجداول اللازمة في M4 خطة التنفيذ
- نصمم الـ UI في هذه الجلسة
- التنفيذ الفعلي يحتاج Email Module (موجود في Phase 8) — يُستخدم مباشرة

### Q5: هل نضيف Live Dashboard (real-time counters)؟

**القرار: نضيف Live Cards بسيطة — لا Real-time Chart كاملة**

- بيانات live (محادثات مفتوحة الآن + موظفين Online) = SSE stream موجود
- نعرضها في أعلى الصفحة كـ "Live Status" section بسيطة
- لا نبني real-time chart متكاملة — complexity عالية / فايدة محدودة الآن

---

## 🏗️ التصميم المعماري الكامل لـ M4

### هيكل الصفحة (Page Layout)

```
/analytics  ← Route مستقلة في App Shell (M3)
│
├── Header Bar
│   ├── عنوان "التقارير"
│   ├── Date Range Picker (7d / 30d / 90d / custom)
│   └── [Export Button] ← لو role يسمح
│
├── Live Status Bar (أعلى الصفحة)
│   ├── محادثات مفتوحة الآن: [N]
│   ├── موظفين Online: [N]
│   └── يُحدَّث كل 30 ثانية (polling بسيط — لا SSE جديد)
│
├── Sidebar/Tabs Navigation (يسار الصفحة)
│   ├── 📊 نظرة عامة       ← Overview
│   ├── 👥 الموظفين         ← Agents
│   ├── 📡 القنوات          ← Platforms/Channels
│   ├── 🏷️ التصنيفات       ← Labels & Topics
│   ├── ⏱ SLA              ← SLA Reports
│   ├── ⭐ رضا العملاء      ← CSAT
│   ├── 🤖 الأتمتة والذكاء ← AI & Automation
│   └── 📤 الجدولة         ← Scheduled Reports [لو Admin+]
│
└── Content Area (يمين)
    └── [محتوى القسم النشط]
```

### الأقسام السبعة — التفاصيل

---

#### 1. نظرة عامة (Overview)
**يُبنى من:** `/analytics/overview` + `/analytics/volume` + `/analytics/hourly`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ [Live Status: مفتوحة الآن: 12 | Online: 4]                  │
├──────┬──────┬──────┬──────┬──────┐
│ 💬   │ ✅   │ ⚡   │ 🔒   │ 📥   │  ← KPI Cards
│ محادثات│ إغلاق│ أول رد│ وقت حل│ رسائل│
├──────┴──────┴──────┴──────┴──────┤
│ 📅 حجم المحادثات يومياً (SVG Bar Chart)                       │
├─────────────────┬────────────────┤
│ 🕐 أوقات الذروة │ 📡 توزيع المنصات│
│ (Hourly Heat)   │ (Donut/Bars)   │
└─────────────────┴────────────────┘
```

---

#### 2. الموظفين (Agents)
**يُبنى من:** `/analytics/agents` + `/analytics/agents/:id`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🏆 Leaderboard: أفضل 3 موظفين (KPI cards ملوّنة)             │
├─────────────────────────────────────────────────────────────┤
│ جدول كل الموظفين:                                            │
│ الموظف | محادثات | مغلقة | معدل% | رسائل | أول رد | وقت حل  │
│ [كل صف قابل للنقر → تفصيل الموظف في Panel جانبي]           │
└─────────────────────────────────────────────────────────────┘

Agent Detail Panel (يُفتح على اليمين):
├── KPI Cards: محادثات + إغلاق + رسائل + أول رد + وقت حل
├── Daily Trend (mini bar chart)
├── Platform Distribution
├── Priority Distribution
└── Recent 10 Conversations
```

**Permission Note:**
- Supervisor: يرى فريقه فقط (filter by team_id)
- Agent: يرى نفسه فقط (يُوجَّه مباشرة لـ `/agents/:myId`)

---

#### 3. القنوات (Channels)
**يُبنى من:** `/analytics/platforms` + `/analytics/platforms/:platform`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ شبكة كروت للمنصات (grid):                                    │
│ [🟢 WhatsApp] [🔵 Telegram] [🟣 Instagram] [📧 Email] ...   │
│ كل كرت: إجمالي + معدل إغلاق + متوسط أول رد                  │
│ [النقر على كرت → تفصيل المنصة في Panel جانبي]               │
├─────────────────────────────────────────────────────────────┤
│ Bar Chart مقارنة المنصات (محادثات كل منصة)                   │
└─────────────────────────────────────────────────────────────┘

Channel Detail Panel:
├── KPI Cards
├── Daily Trend
├── Priority Distribution
└── أداء الموظفين على هذه المنصة
```

---

#### 4. التصنيفات (Labels & Topics)  ← **جديد — غير موجود حالياً**
**يُبنى من:** endpoint جديد `/analytics/labels`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ أكثر 10 Labels استخداماً (Horizontal Bar Chart)              │
├─────────────────────────────────────────────────────────────┤
│ جدول كل Labels:                                              │
│ الـ Label | عدد المحادثات | % من الكل | متوسط وقت الحل       │
├─────────────────────────────────────────────────────────────┤
│ اتجاه Labels بمرور الوقت (Stacked Area chart بسيط)           │
└─────────────────────────────────────────────────────────────┘
```

**ما يحتاجه الـ Backend:**
```sql
-- يُحسب من inbox_conversation_labels JOIN inbox_labels
SELECT
  l.name AS label_name,
  l.color,
  COUNT(DISTINCT cl.conversation_id) AS conv_count,
  AVG(c.resolved_at - c.first_message_at) AS avg_resolution_sec
FROM inbox_labels l
JOIN inbox_conversation_labels cl ON cl.label_id = l.id
JOIN inbox_conversations_v4 c ON c.id = cl.conversation_id
WHERE c.created_at BETWEEN ? AND ?
GROUP BY l.id
ORDER BY conv_count DESC
```

---

#### 5. SLA
**يُبنى من:** `/analytics/sla` + `/analytics/sla/detail`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ KPI Cards:                                                   │
│ [نسبة الالتزام - أول رد] [نسبة الالتزام - إغلاق]            │
│ [متوسط وقت أول رد] [متوسط وقت الإغلاق]                       │
├─────────────────────────────────────────────────────────────┤
│ SLA by Priority (Progress Bars: عاجل / عالي / عادي / منخفض) │
├──────────────────────┬──────────────────────────────────────┤
│ SLA بالمنصة          │ اتجاه الالتزام اليومي (Line Chart)   │
│ (جدول)               │                                      │
├──────────────────────┴──────────────────────────────────────┤
│ أسوأ 10 محادثات (أطول وقت استجابة)                          │
└─────────────────────────────────────────────────────────────┘
```

---

#### 6. رضا العملاء (CSAT)
**يُبنى من:** `/analytics/csat`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ KPIs: متوسط التقييم ⭐ | إجمالي التقييمات | إيجابية% | سلبية%│
├──────────────────┬──────────────────────────────────────────┤
│ Star Distribution│ Daily Trend (ألوان: أخضر/أصفر/أحمر)      │
│ (Horizontal Bars)│                                          │
├──────────────────┴──────────────────────────────────────────┤
│ جدول CSAT بالموظف (الاسم | متوسط | عدد | إيجابية%)         │
└─────────────────────────────────────────────────────────────┘
```

---

#### 7. الأتمتة والذكاء (AI & Automation)  ← **جديد — غير موجود حالياً**
**يُبنى من:** endpoint جديد `/analytics/automation`

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ KPI Cards:                                                   │
│ [محادثات Chatbot-only] [% Auto-closed] [Keyword hits]       │
│ [رسائل تم إرسالها بـ AI Suggest]                             │
├──────────────────────────────────────────────────────────────┤
│ Sentiment Analysis (موجود — يُنقل من Overview إلى هنا)      │
│ (Positive% / Neutral% / Negative% + Daily stacked chart)    │
├──────────────────────────────────────────────────────────────┤
│ Top Negative Conversations (قابلة للنقر → فتح المحادثة)      │
├──────────────────────────────────────────────────────────────┤
│ Keyword Stats:                                               │
│ الكلمة | عدد الـ Triggers | آخر استخدام                      │
└─────────────────────────────────────────────────────────────┘
```

**ما يحتاجه الـ Backend:**
```javascript
// نحتاج إحصاءات من:
// - inbox_chatbot_sessions_v4: عدد جلسات انتهت بدون تدخل بشري
// - inbox_auto_close_v4: عدد المحادثات المغلقة تلقائياً
// - inbox_keywords: لكل keyword → عدد مرات trigger-ها
// - inbox_messages_v4: رسائل بـ metadata.ai_suggested = true
```

---

#### 8. الجدولة (Scheduled Reports)  ← **جديد — مؤجل لـ Phase 10**
**مرئي لـ:** Owner / Admin فقط

**المحتوى:**
```
┌─────────────────────────────────────────────────────────────┐
│ [+ إنشاء تقرير مجدول]                                       │
├─────────────────────────────────────────────────────────────┤
│ جدول التقارير المجدولة:                                      │
│ الاسم | النوع | التكرار | المستلمون | آخر إرسال | الحالة     │
└─────────────────────────────────────────────────────────────┘

نموذج إنشاء تقرير مجدول:
├── اسم التقرير
├── نوع البيانات (Overview / Agents / SLA / CSAT / الكل)
├── التكرار (يومي / أسبوعي / شهري)
├── وقت الإرسال (HH:MM)
├── المستلمون (إيميلات مفصولة بفاصلة)
└── تنسيق الملف (CSV / PDF)
```

---

## 🗄️ جداول DB المطلوبة — M4

### جدول جديد: `inbox_scheduled_reports_v4`
```sql
CREATE TABLE IF NOT EXISTS inbox_scheduled_reports_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  report_type TEXT    NOT NULL,   -- 'overview' | 'agents' | 'sla' | 'csat' | 'full'
  frequency   TEXT    NOT NULL,   -- 'daily' | 'weekly' | 'monthly'
  send_hour   INTEGER NOT NULL DEFAULT 8,   -- 0-23
  send_day    INTEGER,            -- 0=Sunday…6=Saturday (للأسبوعي)
  recipients  TEXT    NOT NULL,   -- JSON array of emails
  format      TEXT    NOT NULL DEFAULT 'csv',  -- 'csv' | 'pdf'
  active      INTEGER NOT NULL DEFAULT 1,
  last_sent   INTEGER,            -- Unix timestamp
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by  INTEGER             -- inbox_users.id
);
```

**ملاحظة:** لا جداول أخرى جديدة مطلوبة في M4 — الـ analytics تقرأ من الجداول الحالية فقط.

---

## ⚠️ المخاطر والـ Edge Cases

| المخاطر | التفاصيل | الحل |
|---|---|---|
| **أداء SQL على بيانات كبيرة** | query تجلب 10,000+ محادثة = بطيء | إضافة INDEX على `created_at` + `assigned_to_id` |
| **Sentiment API Cost** | كل طلب تحليل يستهلك tokens | الكاش الحالي في metadata يحل المشكلة — نبقيه |
| **Permission Bypass** | Supervisor يقدر يطلب `/agents/5` مباشرة | Backend يتحقق من team membership قبل الرد |
| **تعارض مع v3 analytics** | قد يوجد `/analytics` route قديم | نتحقق في التنفيذ — نضيف prefix `/inbox/analytics` |
| **Scheduled Reports + SMTP** | يحتاج Email Module جاهز | يعتمد على Phase 8 email.js — dependency موثقة |
| **Export PDF** | PDF generation = مكتبة خارجية | نؤجل PDF لـ Phase 10+ — نبقى على CSV في البداية |

---

## 🔗 نقاط التلامس مع المحاور الأخرى

| المحور | نقطة التلامس |
|---|---|
| **M1 (Permissions)** | Permission filtering في كل analytics endpoint + Frontend permission-aware rendering |
| **M2 (Settings)** | Scheduled Reports يستخدم SMTP settings من M2 (إعدادات المؤسسة → البريد الإلكتروني) |
| **M3 (Navigation)** | Analytics تصبح Page Module متوافق مع App Shell — mount/unmount pattern (D-027) |
| **M5 (Standalone)** | Analytics endpoints يجب أن تعمل بدون ERP dependencies — موجود بالفعل |

---

## 📋 ملخص القرارات المعمارية الجديدة

| # | القرار | التفاصيل |
|---|---|---|
| **D-031** | Analytics = Page Module (لا modal) | تُحوَّل لـ Page Module بـ mount/unmount — تُفتح من Sidebar |
| **D-032** | Permission Filtering على مستوى Backend + Frontend | كل endpoint يتحقق من role قبل الرد |
| **D-033** | Live Status = polling كل 30 ثانية (لا SSE جديد) | يُعيد استخدام `/analytics/overview` مع flag `?live=true` |
| **D-034** | Scheduled Reports = جدول `inbox_scheduled_reports_v4` | مؤجل للتنفيذ لـ Phase 10 — يعتمد على email.js |
| **D-035** | Labels Analytics = endpoint جديد `/analytics/labels` | يقرأ من inbox_conversation_labels JOIN inbox_labels |
| **D-036** | AI/Automation Analytics = endpoint جديد `/analytics/automation` | يقرأ من chatbot_sessions + keywords + auto_close |
| **D-037** | Sentiment يُنقل من Overview → AI & Automation section | منطقياً أنسب — لا تغيير في الكود |
| **D-038** | Export PDF مؤجل — CSV فقط في Phase 10 | PDF يحتاج npm package جديد — يُقرر لاحقاً |

---

## ✅ إجابة أسئلة معيار الجودة الخمسة

1. **ماذا نبني؟**
   تحويل Analytics من overlay modal إلى صفحة مستقلة كاملة بـ 7 أقسام، مع إضافة Labels Analytics و AI/Automation Analytics وتطبيق Permission Filtering.

2. **لماذا هكذا؟**
   - الصفحة المستقلة تتسق مع M3 App Shell وتعطي مساحة كافية للتقارير
   - هجرة الكود الحالي أسرع من إعادة البناء
   - Permission Filtering ضروري مع M1

3. **كيف يُبنى؟**
   → الجلسة القادمة (المرحلة 2) تجيب على هذا بالتفصيل الكامل

4. **ما الذي يمكن أن يفشل؟**
   - SQL performance على بيانات كثيرة → INDEX
   - Permission bypass → Backend double-check
   - Scheduled Reports يعتمد على Email Module → dependency موثقة

5. **كيف يتكامل مع الباقي؟**
   - M1: Permission Filtering
   - M2: SMTP للـ Scheduled Reports
   - M3: Page Module mount/unmount
   - M5: لا ERP dependencies

---

> المرحلة 1 مكتملة ✅
> الجلسة القادمة: المرحلة 2 — خطة التنفيذ التقنية التفصيلية

---

# المرحلة 2 — خطة التنفيذ التقنية التفصيلية
> تاريخ الجلسة: 2026-05-04
> الحالة: جارية ✍️

---

## 📁 الملفات المتأثرة — نظرة عامة

| الملف | النوع | العملية |
|---|---|---|
| `server/routes/inbox/analytics.js` | Backend | تعديل — إضافة endpoints + Permission Filtering |
| `public/dashboard/inbox-v4/analytics.js` | Frontend | تعديل — تحويل لـ Page Module + أقسام جديدة |
| `public/inbox-v4/shell.js` | Frontend | تعديل — إضافة route `/analytics` |
| `public/inbox-v4/index.html` | Frontend | لا تعديل — shell.js يتحكم |
| DB Migration | SQL | جديد — جدول `inbox_scheduled_reports_v4` |

---

## 🗄️ الخطوة 0 — DB Migration (أولاً قبل أي كود)

### الملف: `server/migrations/add_scheduled_reports_v4.sql`

```sql
-- Migration: Add inbox_scheduled_reports_v4
-- Phase 9 M4 — Analytics Scheduled Reports
-- تاريخ: 2026-05-04

CREATE TABLE IF NOT EXISTS inbox_scheduled_reports_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  report_type TEXT    NOT NULL CHECK(report_type IN ('overview','agents','sla','csat','labels','automation','full')),
  frequency   TEXT    NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
  send_hour   INTEGER NOT NULL DEFAULT 8 CHECK(send_hour BETWEEN 0 AND 23),
  send_day    INTEGER CHECK(send_day BETWEEN 0 AND 6),  -- 0=Sunday للأسبوعي فقط
  recipients  TEXT    NOT NULL,  -- JSON array: ["a@b.com","c@d.com"]
  format      TEXT    NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','pdf')),
  active      INTEGER NOT NULL DEFAULT 1,
  last_sent   INTEGER,           -- Unix timestamp
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by  INTEGER            -- tenant_users.id
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active
  ON inbox_scheduled_reports_v4(active, send_hour);
```

### كيف يُشغَّل:
```javascript
// في server/routes/inbox/index.js — دالة initDb الموجودة:
db.exec(fs.readFileSync('server/migrations/add_scheduled_reports_v4.sql', 'utf8'));
```

---

## ⚙️ الخطوة 1 — Backend: Permission Helper

### الملف: `server/routes/inbox/analytics.js` — أعلى الملف

أضف هذه الدالة المساعدة **بعد** `const router = express.Router();`:

```javascript
// ─── Permission Helper ─────────────────────────────────────
// يعيد دور المستخدم في الـ Inbox بناءً على M1 pattern
// role_id: 1=مدير/Admin, 2=محاسب, 3=مبيعات, 4=مخزن
// inbox_role: owner | admin | supervisor | agent | readonly
function getInboxRole(req) {
  // لو inbox_role موجود مباشرة (M1 implementation)
  if (req.user.inbox_role) return req.user.inbox_role;
  // fallback بناءً على role_id حتى يكتمل M1
  if (req.user.role_id === 1) return 'admin';
  return 'agent';
}

function requireAnalyticsAccess(req, res, next) {
  const role = getInboxRole(req);
  // readonly يحق له رؤية التقارير (عرض فقط)
  // agent يحق له رؤية نفسه فقط — يُتحقق منه في كل endpoint
  next();
}

function getTeamFilter(req) {
  // Supervisor يرى فريقه فقط
  const role = getInboxRole(req);
  if (role === 'supervisor' && req.user.team_id) {
    return req.user.team_id;
  }
  return null;
}
// ─────────────────────────────────────────────────────────────
```


---

## ⚙️ الخطوة 2 — Backend: Endpoints الجديدة

### 2A. `/analytics/labels` — تقرير التصنيفات

أضف في `server/routes/inbox/analytics.js`:

```javascript
// GET /analytics/labels
// Permission: owner | admin | supervisor (فريقه) | agent (لا يصل)
router.get('/labels', requireAnalyticsAccess, (req, res) => {
  const role = getInboxRole(req);
  if (role === 'agent' || role === 'readonly') {
    return res.status(403).json({ error: 'غير مسموح' });
  }

  const { from, to } = getDateRange(req); // دالة موجودة في analytics.js
  const db = req.db;

  try {
    // إجماليات كل label
    const labels = db.prepare(`
      SELECT
        l.id,
        l.name,
        l.color,
        COUNT(DISTINCT cl.conversation_id) AS conv_count,
        ROUND(AVG(
          CASE WHEN c.resolved_at IS NOT NULL
          THEN (c.resolved_at - c.created_at) / 60.0
          ELSE NULL END
        ), 1) AS avg_resolution_min
      FROM inbox_labels l
      LEFT JOIN inbox_conversation_labels cl ON cl.label_id = l.id
      LEFT JOIN inbox_conversations_v4 c
        ON c.id = cl.conversation_id
        AND c.created_at BETWEEN ? AND ?
      GROUP BY l.id
      ORDER BY conv_count DESC
      LIMIT 50
    `).all(from, to);

    // اتجاه يومي لأكثر 5 labels
    const topIds = labels.slice(0, 5).map(l => l.id);
    const trend = topIds.length > 0 ? db.prepare(`
      SELECT
        cl.label_id,
        date(c.created_at, 'unixepoch') AS day,
        COUNT(*) AS count
      FROM inbox_conversation_labels cl
      JOIN inbox_conversations_v4 c ON c.id = cl.conversation_id
      WHERE cl.label_id IN (${topIds.map(() => '?').join(',')})
        AND c.created_at BETWEEN ? AND ?
      GROUP BY cl.label_id, day
      ORDER BY day ASC
    `).all(...topIds, from, to) : [];

    res.json({ labels, trend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

---

### 2B. `/analytics/automation` — تقرير الأتمتة والذكاء

```javascript
// GET /analytics/automation
// Permission: owner | admin | supervisor
router.get('/automation', requireAnalyticsAccess, (req, res) => {
  const role = getInboxRole(req);
  if (role === 'agent' || role === 'readonly') {
    return res.status(403).json({ error: 'غير مسموح' });
  }

  const { from, to } = getDateRange(req);
  const db = req.db;

  try {
    // إجمالي المحادثات في الفترة
    const totalConvs = db.prepare(`
      SELECT COUNT(*) AS total
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
    `).get(from, to)?.total || 0;

    // محادثات انتهت بالكامل عبر Chatbot (بدون تدخل بشري)
    const chatbotOnly = db.prepare(`
      SELECT COUNT(DISTINCT conversation_id) AS count
      FROM inbox_chatbot_sessions_v4
      WHERE ended_by = 'bot'
        AND created_at BETWEEN ? AND ?
    `).get(from, to)?.count || 0;

    // محادثات أُغلقت تلقائياً
    const autoClosed = db.prepare(`
      SELECT COUNT(DISTINCT conversation_id) AS count
      FROM inbox_conversations_v4
      WHERE close_reason = 'auto_close'
        AND created_at BETWEEN ? AND ?
    `).get(from, to)?.count || 0;

    // Keyword triggers
    const keywordStats = db.prepare(`
      SELECT
        k.keyword,
        k.trigger_count,
        k.last_triggered
      FROM inbox_keywords k
      ORDER BY k.trigger_count DESC
      LIMIT 20
    `).all();

    // رسائل بـ AI Suggest (fallback graceful لو العمود مش موجود)
    let aiSuggested = 0;
    try {
      aiSuggested = db.prepare(`
        SELECT COUNT(*) AS count
        FROM inbox_messages_v4
        WHERE json_extract(metadata, '$.ai_suggested') = 1
          AND created_at BETWEEN ? AND ?
      `).get(from, to)?.count || 0;
    } catch (_) { /* العمود غير موجود — يبقى 0 */ }

    // Sentiment من الـ conversations (موجود في metadata)
    const sentiment = db.prepare(`
      SELECT
        SUM(CASE WHEN json_extract(metadata,'$.sentiment') = 'positive' THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN json_extract(metadata,'$.sentiment') = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
        SUM(CASE WHEN json_extract(metadata,'$.sentiment') = 'negative' THEN 1 ELSE 0 END) AS negative
      FROM inbox_conversations_v4
      WHERE created_at BETWEEN ? AND ?
        AND json_extract(metadata,'$.sentiment') IS NOT NULL
    `).get(from, to) || { positive: 0, neutral: 0, negative: 0 };

    // أسوأ 10 محادثات سلبية
    const negativeConvs = db.prepare(`
      SELECT id, contact_name, platform, created_at, resolved_at
      FROM inbox_conversations_v4
      WHERE json_extract(metadata,'$.sentiment') = 'negative'
        AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(from, to);

    res.json({
      summary: {
        total_conversations: totalConvs,
        chatbot_only: chatbotOnly,
        chatbot_pct: totalConvs > 0 ? Math.round(chatbotOnly / totalConvs * 100) : 0,
        auto_closed: autoClosed,
        auto_closed_pct: totalConvs > 0 ? Math.round(autoClosed / totalConvs * 100) : 0,
        ai_suggested: aiSuggested
      },
      sentiment,
      keyword_stats: keywordStats,
      negative_conversations: negativeConvs
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```


---

### 2C. تعديل Endpoints الموجودة — Permission Filtering

أضف Permission check في بداية كل endpoint موجود:

#### `/analytics/overview`
```javascript
// أضف في بداية الـ handler:
router.get('/overview', (req, res) => {
  const role = getInboxRole(req);
  const teamId = getTeamFilter(req);
  const isLive = req.query.live === 'true';

  // Agent يُوجَّه لـ /analytics/agents/:myId
  if (role === 'agent') {
    return res.redirect(`/inbox/analytics/agents/${req.user.id}`);
  }

  // ... باقي الكود الموجود مع إضافة teamId filter لو موجود
  // لو teamId != null: أضف WHERE assigned_to_id IN (SELECT id FROM inbox_team_members WHERE team_id = ?)
});
```

#### `/analytics/agents` (القائمة الكاملة)
```javascript
// Permission: owner | admin | supervisor (فريقه فقط)
router.get('/agents', (req, res) => {
  const role = getInboxRole(req);
  if (role === 'agent' || role === 'readonly') {
    // Agent يُوجَّه لبياناته فقط
    return res.redirect(`/inbox/analytics/agents/${req.user.id}`);
  }
  const teamId = getTeamFilter(req);
  // لو teamId موجود → أضف JOIN مع inbox_team_members
  // ... باقي الكود
});
```

#### `/analytics/agents/:id` (موظف واحد)
```javascript
router.get('/agents/:id', (req, res) => {
  const role = getInboxRole(req);
  const targetId = parseInt(req.params.id);

  // Agent يقدر يرى نفسه فقط
  if (role === 'agent' && targetId !== req.user.id) {
    return res.status(403).json({ error: 'غير مسموح' });
  }

  // Supervisor يتحقق من أن الموظف في فريقه
  if (role === 'supervisor') {
    const inTeam = req.db.prepare(`
      SELECT 1 FROM inbox_team_members
      WHERE team_id = ? AND user_id = ?
    `).get(req.user.team_id, targetId);
    if (!inTeam) return res.status(403).json({ error: 'غير مسموح' });
  }

  // ... باقي الكود الموجود
});
```

---

### 2D. Scheduled Reports CRUD Endpoints (مؤجل التنفيذ — لكن يُعرَّف الـ routes)

```javascript
// مرئي لـ Owner/Admin فقط
function requireAdminForReports(req, res, next) {
  const role = getInboxRole(req);
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ error: 'يحتاج صلاحية Admin' });
  }
  next();
}

// GET /analytics/scheduled — قائمة التقارير المجدولة
router.get('/scheduled', requireAdminForReports, (req, res) => {
  const reports = req.db.prepare(
    'SELECT * FROM inbox_scheduled_reports_v4 ORDER BY created_at DESC'
  ).all();
  res.json(reports);
});

// POST /analytics/scheduled — إنشاء تقرير مجدول
router.post('/scheduled', requireAdminForReports, (req, res) => {
  const { name, report_type, frequency, send_hour, send_day, recipients, format } = req.body;
  if (!name || !report_type || !frequency || !recipients) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }
  const result = req.db.prepare(`
    INSERT INTO inbox_scheduled_reports_v4
      (name, report_type, frequency, send_hour, send_day, recipients, format, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, report_type, frequency, send_hour || 8, send_day || null,
         JSON.stringify(recipients), format || 'csv', req.user.id);
  res.json({ id: result.lastInsertRowid });
});

// PUT /analytics/scheduled/:id — تعديل
router.put('/scheduled/:id', requireAdminForReports, (req, res) => {
  const { name, frequency, send_hour, send_day, recipients, format, active } = req.body;
  req.db.prepare(`
    UPDATE inbox_scheduled_reports_v4
    SET name=?, frequency=?, send_hour=?, send_day=?, recipients=?, format=?, active=?
    WHERE id=?
  `).run(name, frequency, send_hour, send_day, JSON.stringify(recipients), format,
         active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// DELETE /analytics/scheduled/:id
router.delete('/scheduled/:id', requireAdminForReports, (req, res) => {
  req.db.prepare('DELETE FROM inbox_scheduled_reports_v4 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
```


---

## 🎨 الخطوة 3 — Frontend: تحويل analytics.js لـ Page Module

### 3A. هيكل التحويل

الملف الحالي `public/dashboard/inbox-v4/analytics.js` يحتوي على object واحد كبير.
**التحويل:** wrap بـ IIFE مع `mount(container, params)` و`unmount()`.

```javascript
// public/dashboard/inbox-v4/analytics.js
// الهيكل الجديد — Page Module Pattern (D-027)

const InboxAnalytics = (() => {
  // ─── State داخلي ───────────────────────────────────────────
  let _container = null;
  let _userRole   = 'agent';
  let _userId     = null;
  let _teamId     = null;
  let _dateRange  = { period: 30 };
  let _activeTab  = 'overview';
  let _liveTimer  = null;

  // ─── Permission Helpers ────────────────────────────────────
  function canSeeAll()     { return ['owner','admin'].includes(_userRole); }
  function canSeeSuperv()  { return ['owner','admin','supervisor'].includes(_userRole); }
  function canExport()     { return ['owner','admin'].includes(_userRole); }
  function canSchedule()   { return ['owner','admin'].includes(_userRole); }

  // ─── HTML Shell ────────────────────────────────────────────
  function _renderShell() {
    _container.innerHTML = `
      <div class="iv4-an-page" id="iv4-an-page">

        <!-- Header Bar -->
        <div class="iv4-an-header">
          <h2>التقارير</h2>
          <div class="iv4-an-header-actions">
            <select id="iv4-an-period" class="iv4-an-select">
              <option value="7">آخر 7 أيام</option>
              <option value="30" selected>آخر 30 يوماً</option>
              <option value="90">آخر 90 يوماً</option>
              <option value="custom">مخصص</option>
            </select>
            ${canExport() ? '<button class="iv4-an-btn-export" id="iv4-an-export">⬇ تصدير CSV</button>' : ''}
          </div>
        </div>

        <!-- Live Status Bar -->
        <div class="iv4-an-live-bar" id="iv4-an-live-bar">
          <span>🟢 محادثات مفتوحة الآن: <strong id="iv4-live-open">–</strong></span>
          <span>👤 موظفين Online: <strong id="iv4-live-agents">–</strong></span>
          <span class="iv4-an-live-stamp" id="iv4-live-stamp"></span>
        </div>

        <!-- Body: Sidebar + Content -->
        <div class="iv4-an-body">

          <!-- Sidebar Tabs -->
          <nav class="iv4-an-sidebar" id="iv4-an-sidebar">
            <button class="iv4-an-tab active" data-tab="overview">📊 نظرة عامة</button>
            ${canSeeSuperv() ? '<button class="iv4-an-tab" data-tab="agents">👥 الموظفين</button>' : ''}
            <button class="iv4-an-tab" data-tab="channels">📡 القنوات</button>
            ${canSeeSuperv() ? '<button class="iv4-an-tab" data-tab="labels">🏷️ التصنيفات</button>' : ''}
            <button class="iv4-an-tab" data-tab="sla">⏱ SLA</button>
            <button class="iv4-an-tab" data-tab="csat">⭐ رضا العملاء</button>
            ${canSeeSuperv() ? '<button class="iv4-an-tab" data-tab="automation">🤖 الأتمتة والذكاء</button>' : ''}
            ${canSchedule() ? '<button class="iv4-an-tab" data-tab="scheduled">📤 الجدولة</button>' : ''}
          </nav>

          <!-- Content Area -->
          <div class="iv4-an-content" id="iv4-an-content">
            <div class="iv4-an-loading">جاري التحميل...</div>
          </div>

        </div>
      </div>
    `;
  }

  // ─── Tab Navigation ────────────────────────────────────────
  function _bindTabs() {
    _container.querySelectorAll('.iv4-an-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _container.querySelectorAll('.iv4-an-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeTab = btn.dataset.tab;
        _loadTab(_activeTab);
      });
    });
  }

  function _loadTab(tab) {
    const content = document.getElementById('iv4-an-content');
    if (!content) return;
    content.innerHTML = '<div class="iv4-an-loading">جاري التحميل...</div>';

    const loaders = {
      overview:   _loadOverview,
      agents:     _loadAgents,
      channels:   _loadChannels,
      labels:     _loadLabels,
      sla:        _loadSLA,
      csat:       _loadCSAT,
      automation: _loadAutomation,
      scheduled:  _loadScheduled,
    };

    if (loaders[tab]) loaders[tab](content);
  }

  // ─── Live Status ───────────────────────────────────────────
  function _startLive() {
    _fetchLive();
    _liveTimer = setInterval(_fetchLive, 30000);
  }

  function _fetchLive() {
    InboxAPI.get('/analytics/overview?live=true').then(data => {
      const el1 = document.getElementById('iv4-live-open');
      const el2 = document.getElementById('iv4-live-agents');
      const stamp = document.getElementById('iv4-live-stamp');
      if (el1) el1.textContent = data.open_now ?? '–';
      if (el2) el2.textContent = data.online_agents ?? '–';
      if (stamp) stamp.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');
    }).catch(() => {});
  }

  // ─── Public API ────────────────────────────────────────────
  return {
    mount(container, params = {}) {
      _container = container;
      _userRole  = params.userRole  || InboxStore.state.userRole  || 'agent';
      _userId    = params.userId    || InboxStore.state.userId;
      _teamId    = params.teamId    || InboxStore.state.teamId    || null;

      _renderShell();
      _bindTabs();
      _startLive();
      _loadTab('overview');

      // Date range change
      const periodSel = document.getElementById('iv4-an-period');
      if (periodSel) {
        periodSel.addEventListener('change', () => {
          _dateRange.period = periodSel.value;
          _loadTab(_activeTab);
        });
      }

      // Export button
      const exportBtn = document.getElementById('iv4-an-export');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => _exportCSV(_activeTab));
      }
    },

    unmount() {
      if (_liveTimer) clearInterval(_liveTimer);
      _liveTimer = null;
      if (_container) _container.innerHTML = '';
      _container = null;
    }
  };
})();
```


---

### 3B. تفاصيل كل Tab Loader

#### `_loadOverview(content)`
```javascript
function _loadOverview(content) {
  const p = _dateRange.period;
  Promise.all([
    InboxAPI.get(`/analytics/overview?period=${p}`),
    InboxAPI.get(`/analytics/volume?period=${p}`),
    InboxAPI.get(`/analytics/hourly?period=${p}`),
    InboxAPI.get(`/analytics/platforms?period=${p}`)
  ]).then(([overview, volume, hourly, platforms]) => {
    content.innerHTML = `
      <div class="iv4-an-kpi-row">
        ${_kpiCard('💬 محادثات', overview.total_conversations)}
        ${_kpiCard('✅ مغلقة', overview.resolved_conversations)}
        ${_kpiCard('⚡ أول رد', _formatMin(overview.avg_first_response_min))}
        ${_kpiCard('🔒 وقت الحل', _formatMin(overview.avg_resolution_min))}
        ${_kpiCard('📥 رسائل', overview.total_messages)}
      </div>
      <div class="iv4-an-chart-row">
        <div class="iv4-an-chart-box iv4-an-wide">
          <h4>📅 حجم المحادثات يومياً</h4>
          <div id="iv4-chart-volume"></div>
        </div>
      </div>
      <div class="iv4-an-chart-row">
        <div class="iv4-an-chart-box">
          <h4>🕐 أوقات الذروة</h4>
          <div id="iv4-chart-hourly"></div>
        </div>
        <div class="iv4-an-chart-box">
          <h4>📡 توزيع المنصات</h4>
          <div id="iv4-chart-platforms"></div>
        </div>
      </div>
    `;
    // استخدم دوال الـ Chart الموجودة (SVG يدوي)
    _renderBarChart('iv4-chart-volume', volume.daily || []);
    _renderHeatmap('iv4-chart-hourly', hourly.data || []);
    _renderPlatformBars('iv4-chart-platforms', platforms || []);
  }).catch(e => { content.innerHTML = `<p class="iv4-an-error">خطأ في التحميل</p>`; });
}
```

#### `_loadAgents(content)`
```javascript
function _loadAgents(content) {
  // Agent يرى نفسه فقط
  const url = (_userRole === 'agent')
    ? `/analytics/agents/${_userId}?period=${_dateRange.period}`
    : `/analytics/agents?period=${_dateRange.period}`;

  InboxAPI.get(url).then(data => {
    if (_userRole === 'agent') {
      // عرض بيانات الموظف نفسه فقط
      content.innerHTML = _renderAgentDetail(data);
      return;
    }

    const agents = Array.isArray(data) ? data : data.agents || [];
    // Leaderboard: أفضل 3
    const top3 = agents.slice(0, 3);
    content.innerHTML = `
      <div class="iv4-an-leaderboard">
        ${top3.map((a, i) => `
          <div class="iv4-an-leader-card iv4-an-rank-${i+1}">
            <span class="iv4-an-rank-badge">${['🥇','🥈','🥉'][i]}</span>
            <strong>${a.name}</strong>
            <span>${a.resolved_count} إغلاق</span>
          </div>
        `).join('')}
      </div>
      <table class="iv4-an-table" id="iv4-agents-table">
        <thead>
          <tr>
            <th>الموظف</th><th>محادثات</th><th>مغلقة</th>
            <th>معدل%</th><th>أول رد</th><th>وقت الحل</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map(a => `
            <tr class="iv4-an-row-clickable" data-agent-id="${a.id}">
              <td>${a.name}</td>
              <td>${a.total_count}</td>
              <td>${a.resolved_count}</td>
              <td>${a.resolution_rate}%</td>
              <td>${_formatMin(a.avg_first_response_min)}</td>
              <td>${_formatMin(a.avg_resolution_min)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    // النقر على صف يفتح Agent Detail Panel
    content.querySelectorAll('.iv4-an-row-clickable').forEach(row => {
      row.addEventListener('click', () => {
        _openAgentPanel(row.dataset.agentId, content);
      });
    });
  });
}
```

#### `_loadLabels(content)` — جديد
```javascript
function _loadLabels(content) {
  InboxAPI.get(`/analytics/labels?period=${_dateRange.period}`).then(({ labels, trend }) => {
    if (!labels.length) {
      content.innerHTML = '<p class="iv4-an-empty">لا يوجد بيانات للـ Labels في هذه الفترة</p>';
      return;
    }
    content.innerHTML = `
      <div class="iv4-an-section">
        <h4>أكثر التصنيفات استخداماً</h4>
        <div id="iv4-chart-labels-bar"></div>
      </div>
      <table class="iv4-an-table">
        <thead>
          <tr><th>التصنيف</th><th>محادثات</th><th>% من الكل</th><th>متوسط وقت الحل</th></tr>
        </thead>
        <tbody>
          ${_labelsTableRows(labels)}
        </tbody>
      </table>
      ${trend.length ? `
      <div class="iv4-an-section">
        <h4>اتجاه التصنيفات بمرور الوقت</h4>
        <div id="iv4-chart-labels-trend"></div>
      </div>` : ''}
    `;
    const total = labels.reduce((s, l) => s + l.conv_count, 0);
    _renderHBarChart('iv4-chart-labels-bar', labels.slice(0, 10).map(l => ({
      label: l.name, value: l.conv_count, color: l.color || '#667eea'
    })));
    if (trend.length) _renderTrendChart('iv4-chart-labels-trend', trend);
  });
}

function _labelsTableRows(labels) {
  const total = labels.reduce((s, l) => s + l.conv_count, 0);
  return labels.map(l => `
    <tr>
      <td><span class="iv4-label-dot" style="background:${l.color||'#999'}"></span>${l.name}</td>
      <td>${l.conv_count}</td>
      <td>${total > 0 ? Math.round(l.conv_count / total * 100) : 0}%</td>
      <td>${l.avg_resolution_min ? Math.round(l.avg_resolution_min) + ' دقيقة' : '—'}</td>
    </tr>
  `).join('');
}
```

#### `_loadAutomation(content)` — جديد
```javascript
function _loadAutomation(content) {
  InboxAPI.get(`/analytics/automation?period=${_dateRange.period}`).then(data => {
    const { summary, sentiment, keyword_stats, negative_conversations } = data;
    content.innerHTML = `
      <div class="iv4-an-kpi-row">
        ${_kpiCard('🤖 Chatbot فقط', summary.chatbot_only + ` (${summary.chatbot_pct}%)`)}
        ${_kpiCard('🔄 إغلاق تلقائي', summary.auto_closed + ` (${summary.auto_closed_pct}%)`)}
        ${_kpiCard('💡 AI اقتراحات', summary.ai_suggested)}
      </div>

      <div class="iv4-an-section">
        <h4>🧠 تحليل المشاعر</h4>
        <div class="iv4-an-sentiment-bars">
          ${_sentimentBar('إيجابي', sentiment.positive, '#22c55e')}
          ${_sentimentBar('محايد', sentiment.neutral, '#94a3b8')}
          ${_sentimentBar('سلبي', sentiment.negative, '#ef4444')}
        </div>
      </div>

      ${negative_conversations.length ? `
      <div class="iv4-an-section">
        <h4>⚠️ أبرز المحادثات السلبية</h4>
        <table class="iv4-an-table">
          <thead><tr><th>العميل</th><th>المنصة</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${negative_conversations.map(c => `
              <tr class="iv4-an-row-clickable" data-conv-id="${c.id}"
                  title="فتح المحادثة">
                <td>${c.contact_name || 'غير معروف'}</td>
                <td>${c.platform}</td>
                <td>${new Date(c.created_at * 1000).toLocaleDateString('ar-EG')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="iv4-an-section">
        <h4>🔑 إحصاءات الكلمات المفتاحية</h4>
        ${keyword_stats.length ? `
        <table class="iv4-an-table">
          <thead><tr><th>الكلمة</th><th>عدد التفعيلات</th><th>آخر استخدام</th></tr></thead>
          <tbody>
            ${keyword_stats.map(k => `
              <tr>
                <td><code>${k.keyword}</code></td>
                <td>${k.trigger_count || 0}</td>
                <td>${k.last_triggered ? new Date(k.last_triggered * 1000).toLocaleDateString('ar-EG') : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<p class="iv4-an-empty">لا يوجد بيانات للكلمات المفتاحية</p>'}
      </div>
    `;

    // فتح المحادثة السلبية عند النقر
    content.querySelectorAll('[data-conv-id]').forEach(row => {
      row.addEventListener('click', () => {
        InboxRouter.navigate(`/conversation/${row.dataset.convId}`);
      });
    });
  });
}
```

#### `_loadScheduled(content)` — جديد (Admin فقط)
```javascript
function _loadScheduled(content) {
  if (!canSchedule()) {
    content.innerHTML = '<p class="iv4-an-empty">هذا القسم متاح للمدراء فقط</p>';
    return;
  }
  InboxAPI.get('/analytics/scheduled').then(reports => {
    content.innerHTML = `
      <div class="iv4-an-section-header">
        <h4>📤 التقارير المجدولة</h4>
        <button class="iv4-an-btn-primary" id="iv4-new-report">+ إنشاء تقرير جديد</button>
      </div>
      ${reports.length ? `
      <table class="iv4-an-table">
        <thead>
          <tr><th>الاسم</th><th>النوع</th><th>التكرار</th><th>آخر إرسال</th><th>الحالة</th><th></th></tr>
        </thead>
        <tbody>
          ${reports.map(r => `
            <tr>
              <td>${r.name}</td>
              <td>${r.report_type}</td>
              <td>${r.frequency}</td>
              <td>${r.last_sent ? new Date(r.last_sent*1000).toLocaleDateString('ar-EG') : 'لم يُرسل بعد'}</td>
              <td>${r.active ? '🟢 نشط' : '⚫ موقوف'}</td>
              <td>
                <button class="iv4-an-btn-sm" data-edit="${r.id}">تعديل</button>
                <button class="iv4-an-btn-sm iv4-an-btn-danger" data-del="${r.id}">حذف</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="iv4-an-empty">لا يوجد تقارير مجدولة بعد</p>'}

      <p class="iv4-an-note">💡 ملاحظة: PDF قادم في التحديث القادم — التصدير متاح بـ CSV حالياً</p>
    `;

    document.getElementById('iv4-new-report')?.addEventListener('click', () => {
      _openScheduledForm(null, content);
    });
    content.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('حذف هذا التقرير؟')) {
          InboxAPI.delete(`/analytics/scheduled/${btn.dataset.del}`)
            .then(() => _loadScheduled(content));
        }
      });
    });
  });
}
```


---

## 🎨 الخطوة 4 — Frontend: CSS Classes الجديدة

أضف في نهاية `public/dashboard/inbox-v4/inbox.css`:

```css
/* ─── Analytics Page Module ─────────────────────────────────── */
/* تاريخ الإضافة: Phase 9 M4 */

.iv4-an-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #f8fafc);
  font-family: inherit;
}

/* Header */
.iv4-an-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.iv4-an-header h2 { margin: 0; font-size: 18px; color: #1e293b; }
.iv4-an-header-actions { display: flex; gap: 10px; align-items: center; }
.iv4-an-select {
  padding: 6px 12px; border: 1px solid #cbd5e1;
  border-radius: 6px; font-size: 13px; background: #fff;
}
.iv4-an-btn-export {
  padding: 6px 14px; background: #667eea; color: #fff;
  border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
}
.iv4-an-btn-export:hover { background: #5a67d8; }

/* Live Bar */
.iv4-an-live-bar {
  display: flex; gap: 24px; align-items: center;
  padding: 8px 24px; background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  font-size: 13px; color: #166534; flex-shrink: 0;
}
.iv4-an-live-stamp { color: #6b7280; margin-right: auto; font-size: 11px; }

/* Body Layout */
.iv4-an-body {
  display: flex; flex: 1; overflow: hidden;
}

/* Sidebar */
.iv4-an-sidebar {
  width: 180px; background: #fff;
  border-left: 1px solid #e2e8f0; /* RTL: يكون على اليسار */
  display: flex; flex-direction: column;
  padding: 12px 0; flex-shrink: 0; overflow-y: auto;
}
.iv4-an-tab {
  display: block; width: 100%; text-align: right;
  padding: 10px 16px; font-size: 13px; color: #475569;
  background: none; border: none; cursor: pointer;
  transition: background 0.15s;
}
.iv4-an-tab:hover { background: #f1f5f9; }
.iv4-an-tab.active {
  background: #eff6ff; color: #2563eb;
  font-weight: 600; border-right: 3px solid #2563eb; /* RTL */
}

/* Content Area */
.iv4-an-content {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}

/* KPI Cards */
.iv4-an-kpi-row {
  display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px;
}
.iv4-an-kpi-card {
  flex: 1; min-width: 140px; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 16px; text-align: center;
}
.iv4-an-kpi-card .iv4-an-kpi-label { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.iv4-an-kpi-card .iv4-an-kpi-value { font-size: 22px; font-weight: 700; color: #1e293b; }

/* Charts */
.iv4-an-chart-row { display: flex; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
.iv4-an-chart-box {
  flex: 1; min-width: 260px; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px;
}
.iv4-an-chart-box.iv4-an-wide { flex: 2; }
.iv4-an-chart-box h4 { margin: 0 0 12px; font-size: 14px; color: #334155; }

/* Tables */
.iv4-an-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: #fff; border-radius: 10px; overflow: hidden;
  border: 1px solid #e2e8f0;
}
.iv4-an-table th {
  background: #f8fafc; padding: 10px 14px;
  text-align: right; font-weight: 600; color: #475569;
  border-bottom: 1px solid #e2e8f0;
}
.iv4-an-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; }
.iv4-an-table tr:last-child td { border-bottom: none; }
.iv4-an-row-clickable { cursor: pointer; }
.iv4-an-row-clickable:hover { background: #f8fafc; }

/* Leaderboard */
.iv4-an-leaderboard { display: flex; gap: 12px; margin-bottom: 20px; }
.iv4-an-leader-card {
  flex: 1; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 16px; text-align: center;
}
.iv4-an-rank-1 { border-color: #fbbf24; background: #fffbeb; }
.iv4-an-rank-2 { border-color: #94a3b8; background: #f8fafc; }
.iv4-an-rank-3 { border-color: #cd7c2e; background: #fdf6ee; }
.iv4-an-rank-badge { font-size: 24px; display: block; margin-bottom: 8px; }

/* Sentiment */
.iv4-an-sentiment-bars { display: flex; flex-direction: column; gap: 8px; }
.iv4-an-sentiment-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.iv4-an-sentiment-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 4px; height: 12px; }
.iv4-an-sentiment-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }

/* Loading / Empty / Error */
.iv4-an-loading { text-align: center; padding: 40px; color: #94a3b8; }
.iv4-an-empty   { text-align: center; padding: 30px; color: #94a3b8; }
.iv4-an-error   { text-align: center; padding: 30px; color: #ef4444; }
.iv4-an-note    { font-size: 12px; color: #94a3b8; margin-top: 16px; }

/* Section */
.iv4-an-section { margin-bottom: 24px; }
.iv4-an-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.iv4-an-section-header h4 { margin: 0; font-size: 14px; color: #334155; }

/* Buttons */
.iv4-an-btn-primary {
  padding: 7px 16px; background: #2563eb; color: #fff;
  border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
}
.iv4-an-btn-primary:hover { background: #1d4ed8; }
.iv4-an-btn-sm {
  padding: 4px 10px; font-size: 12px; border: 1px solid #cbd5e1;
  background: #fff; border-radius: 5px; cursor: pointer;
}
.iv4-an-btn-danger { border-color: #fca5a5; color: #ef4444; }

/* Label dot */
.iv4-label-dot {
  display: inline-block; width: 8px; height: 8px;
  border-radius: 50%; margin-left: 6px;
}
/* ─────────────────────────────────────────────────────────── */
```


---

## 🔗 الخطوة 5 — ربط Analytics بـ App Shell (M3)

### 5A. إضافة Route في `shell.js`

```javascript
// في public/inbox-v4/shell.js — داخل InboxRouter.routes:

const routes = {
  '/inbox':        { module: InboxMain,      permission: null },
  '/analytics':    { module: InboxAnalytics, permission: null },   // ← جديد
  '/contacts':     { module: InboxContacts,  permission: null },
  '/settings':     { module: InboxSettings,  permission: ['owner','admin','supervisor'] },
};

// InboxRouter يتحقق من الـ permission قبل mount:
function navigate(path) {
  const route = routes[path];
  if (!route) return navigateTo('/inbox');

  // Route Guard — لو permission محدد، تحقق
  if (route.permission) {
    const role = InboxStore.state.userRole;
    if (!route.permission.includes(role)) {
      // redirect للـ inbox بدلاً من 404
      return navigate('/inbox');
    }
  }

  // unmount الصفحة الحالية
  if (_currentModule?.unmount) _currentModule.unmount();

  // mount الجديدة
  _currentModule = route.module;
  const container = document.getElementById('shell-content');
  route.module.mount(container, {
    userRole: InboxStore.state.userRole,
    userId:   InboxStore.state.userId,
    teamId:   InboxStore.state.teamId,
  });

  _updateSidebarActive(path);
}
```

### 5B. Sidebar Link في `shell.js`

```javascript
// في renderSidebar() — أضف:
const navItems = [
  { path: '/inbox',      icon: '💬', label: 'المحادثات', roles: null },
  { path: '/contacts',   icon: '👥', label: 'جهات الاتصال', roles: null },
  { path: '/analytics',  icon: '📊', label: 'التقارير', roles: null },  // كل الأدوار
  { path: '/settings',   icon: '⚙️', label: 'الإعدادات', roles: ['owner','admin','supervisor'] },
];
// كل item يُعرض لو roles=null أو role في roles
```

---

## 🧪 الخطوة 6 — DB Indexes للأداء

أضف في Migration (مع جدول Scheduled Reports):

```sql
-- تحسين أداء Analytics queries على بيانات كبيرة
-- Phase 9 M4

CREATE INDEX IF NOT EXISTS idx_conv_v4_created_at
  ON inbox_conversations_v4(created_at);

CREATE INDEX IF NOT EXISTS idx_conv_v4_assigned_created
  ON inbox_conversations_v4(assigned_to_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conv_v4_platform_created
  ON inbox_conversations_v4(platform, created_at);

CREATE INDEX IF NOT EXISTS idx_conv_labels_label_id
  ON inbox_conversation_labels(label_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_created
  ON inbox_chatbot_sessions_v4(created_at);

-- ملاحظة: CREATE INDEX IF NOT EXISTS = آمن على DB حية
```

---

## 📋 الخطوة 7 — Helper Functions مشتركة

هذه الدوال تُضاف في قسم "Utilities" داخل `analytics.js`:

```javascript
// ─── Utility Functions ─────────────────────────────────────

function _kpiCard(label, value) {
  return `
    <div class="iv4-an-kpi-card">
      <div class="iv4-an-kpi-label">${label}</div>
      <div class="iv4-an-kpi-value">${value ?? '–'}</div>
    </div>`;
}

function _formatMin(minutes) {
  if (!minutes && minutes !== 0) return '–';
  if (minutes < 60) return Math.round(minutes) + ' د';
  if (minutes < 1440) return Math.round(minutes / 60) + ' س';
  return Math.round(minutes / 1440) + ' يوم';
}

function _sentimentBar(label, count, color) {
  const total = /* يُحسب من context */ 1;  // يُمرَّر من الخارج
  return `
    <div class="iv4-an-sentiment-row">
      <span style="width:70px">${label}</span>
      <div class="iv4-an-sentiment-bar-wrap">
        <div class="iv4-an-sentiment-bar-fill" style="background:${color};width:${count}px"></div>
      </div>
      <span>${count}</span>
    </div>`;
}

function _exportCSV(tab) {
  // يفتح URL لتنزيل CSV — الـ endpoint الموجود
  const period = _dateRange.period;
  const urls = {
    overview:   `/inbox/analytics/overview/export?period=${period}`,
    agents:     `/inbox/analytics/agents/export?period=${period}`,
    sla:        `/inbox/analytics/sla/export?period=${period}`,
    csat:       `/inbox/analytics/csat/export?period=${period}`,
  };
  const url = urls[tab] || urls.overview;
  window.open(url, '_blank');
}

function _renderHBarChart(containerId, items) {
  // Horizontal Bar Chart — SVG يدوي
  // items: [{label, value, color}]
  const el = document.getElementById(containerId);
  if (!el || !items.length) return;
  const max = Math.max(...items.map(i => i.value));
  el.innerHTML = items.map(item => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
      <span style="width:120px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.label}</span>
      <div style="flex:1;background:#f1f5f9;border-radius:3px;height:10px">
        <div style="width:${max>0?Math.round(item.value/max*100):0}%;background:${item.color};height:100%;border-radius:3px"></div>
      </div>
      <span style="width:30px;text-align:left">${item.value}</span>
    </div>
  `).join('');
}
// ─────────────────────────────────────────────────────────────
```


---

## 📝 الخطوة 8 — تسلسل التنفيذ الكامل (Phase 10)

هذا الترتيب يضمن: كل خطوة تعمل بمعزل وقابلة للـ rollback.

```
STEP 1 — DB Migration (لا تعتمد على كود)
  الملف: server/migrations/add_analytics_v4.sql
  المحتوى: CREATE TABLE inbox_scheduled_reports_v4 + 6 INDEX
  التحقق: node -e "require('./server/db').getTenantDb(1).prepare('SELECT 1 FROM inbox_scheduled_reports_v4').all()"
  Commit: "feat: add inbox_scheduled_reports_v4 + analytics indexes"

STEP 2 — Backend: Permission Helper + /analytics/labels
  الملف: server/routes/inbox/analytics.js
  التعديل: أضف getInboxRole() + requireAnalyticsAccess() + route /labels
  التحقق: node --check server/routes/inbox/analytics.js
  Smoke test: curl localhost:3002/inbox/analytics/labels?period=30 (مع auth)
  Commit: "feat: analytics labels endpoint + permission helpers"

STEP 3 — Backend: /analytics/automation
  الملف: server/routes/inbox/analytics.js
  التعديل: أضف route /automation
  التحقق: node --check + smoke test
  Commit: "feat: analytics automation endpoint"

STEP 4 — Backend: Permission Filtering في Endpoints الموجودة
  الملف: server/routes/inbox/analytics.js
  التعديل: أضف role check في /overview + /agents + /agents/:id
  التحقق: node --check + اختبار بـ role='agent' يُوجَّه لـ /agents/:id
  Commit: "feat: analytics permission filtering for existing endpoints"

STEP 5 — Backend: Scheduled Reports CRUD
  الملف: server/routes/inbox/analytics.js
  التعديل: أضف /scheduled routes (GET/POST/PUT/DELETE)
  التحقق: node --check + smoke test POST /scheduled
  Commit: "feat: scheduled reports CRUD endpoints"

STEP 6 — Frontend: تحويل InboxAnalytics لـ Page Module
  الملف: public/dashboard/inbox-v4/analytics.js
  التعديل: wrap بـ IIFE + mount/unmount + _renderShell + _bindTabs + _startLive
  ⚠️ تحذير: لا تكسر الدوال الموجودة (_renderOverview إلخ) — انقلها للداخل
  التحقق: افتح الـ inbox في المتصفح وتأكد من فتح /analytics بدون console errors
  Commit: "feat: InboxAnalytics as Page Module with mount/unmount"

STEP 7 — Frontend: إضافة أقسام Labels + Automation
  الملف: public/dashboard/inbox-v4/analytics.js
  التعديل: أضف _loadLabels() + _loadAutomation() + Tab buttons
  التحقق: افتح قسم التصنيفات والأتمتة وتأكد من ظهور البيانات
  Commit: "feat: analytics labels & automation sections"

STEP 8 — Frontend: إضافة قسم Scheduled Reports
  الملف: public/dashboard/inbox-v4/analytics.js
  التعديل: أضف _loadScheduled() + _openScheduledForm()
  التحقق: افتح قسم الجدولة وأنشئ تقرير تجريبي
  Commit: "feat: analytics scheduled reports UI"

STEP 9 — CSS: إضافة Analytics Page Styles
  الملف: public/dashboard/inbox-v4/inbox.css
  التعديل: أضف classes iv4-an-* في نهاية الملف
  التحقق: لا CSS conflicts — prefix iv4-an- آمن
  Commit: "style: analytics page module CSS"

STEP 10 — Shell Integration
  الملف: public/inbox-v4/shell.js
  التعديل: أضف route /analytics + Sidebar link + Route Guard
  التحقق: تنقل بين /inbox و /analytics بدون page reload
  Commit: "feat: analytics page route in App Shell"
```

---

## ⚠️ Edge Cases والمخاطر التنفيذية

| الموقف | التفاصيل | الحل |
|---|---|---|
| **الـ overlay CSS القديم** | `iv4-an-overlay` في analytics.js القديم | احذف فقط الـ CSS class — لا تحذف HTML بعد، اختبر أولاً |
| **`getDateRange` غير موجودة** | لو الدالة اسمها مختلف في analytics.js الحالي | ابحث عن `FROM` و `TO` في الكود الحالي وتأكد من اسم الدالة |
| **`inbox_keywords.trigger_count` غير موجود** | العمود قد لا يكون موجوداً | أضف fallback: `k.trigger_count || 0` + try/catch في الـ query |
| **`inbox_chatbot_sessions_v4.ended_by` غير موجود** | العمود قد لا يكون موجوداً | try/catch + fallback صفر في query |
| **`InboxAPI.get` vs `fetch` مباشرة** | تأكد من اسم الدالة في api.js | ابحث عن `async get` أو `get:` في api.js |
| **RTL vs LTR في CSS** | الـ Sidebar على اليسار أو اليمين؟ | الكود الحالي RTL — Sidebar يُبنى على اليسار في الـ flex layout |
| **`InboxStore.state.userRole` غير موجود بعد** | M1 لم يُنفَّذ بعد | استخدم fallback: `req.user.role_id === 1 ? 'admin' : 'agent'` مؤقتاً |

---

## ✅ معيار إغلاق M4

المحور مكتمل عندما:
- [ ] جدول `inbox_scheduled_reports_v4` موجود
- [ ] 6 Indexes مضافة لتحسين الأداء
- [ ] `/analytics/labels` يرجع بيانات صحيحة
- [ ] `/analytics/automation` يرجع بيانات صحيحة مع graceful fallback
- [ ] Permission Filtering يعمل: Agent لا يرى بيانات الآخرين
- [ ] InboxAnalytics يعمل كـ Page Module بـ mount/unmount
- [ ] Tab: Labels يعرض البيانات
- [ ] Tab: Automation يعرض الـ Sentiment + Keywords + Negative convs
- [ ] Tab: Scheduled Reports يعرض القائمة + نموذج الإنشاء
- [ ] Live Status Bar يتحدث كل 30 ثانية ويتوقف عند unmount
- [ ] Route `/analytics` مضاف في App Shell مع Sidebar Link
- [ ] لا console errors عند التنقل بين الـ tabs

---

## ✅ إجابة معيار الجودة الخمسة — المرحلة 2

1. **ماذا نبني؟**
   تحويل Analytics لـ Page Module + إضافة 5 endpoints (labels, automation, scheduled CRUD) + Permission Filtering كامل + قسم Labels + قسم AI/Automation + قسم Scheduled Reports + CSS جديد + ربط بـ App Shell.

2. **لماذا هكذا؟**
   - Page Module = متسق مع M3 + لا إعادة بناء من الصفر
   - Permission Filtering على Backend + Frontend = double-check آمن (D-032)
   - Live polling بدل SSE = أبسط + كافي لـ 30 ثانية (D-033)
   - Migration أولاً قبل كود = ضمانات سلامة Phase 9

3. **كيف يُبنى؟**
   10 خطوات مرتبة، كل خطوة = ملف واحد + commit مستقل. الترتيب: Migration → Backend جديد → Backend تعديل → Frontend Module → Frontend Sections → CSS → Shell.

4. **ما الذي يمكن أن يفشل؟**
   - أعمدة غير موجودة في inbox_keywords/chatbot_sessions → try/catch + fallback صفر
   - overlay CSS القديم → يُحذف تدريجياً بعد التحقق
   - userRole غير متاح قبل M1 → fallback على role_id

5. **كيف يتكامل مع الباقي؟**
   - M1: Permission Filtering يعتمد على inbox_role — fallback مؤقت موجود
   - M2: Scheduled Reports يستخدم SMTP من إعدادات M2 (dependency موثقة)
   - M3: Page Module mount/unmount + Route في shell.js + Sidebar link
   - M5: لا ERP dependencies في analytics — كل queries على inbox_* tables فقط

---

> المرحلة 2 مكتملة ✅
> M4 مكتمل ✅
> المحور القادم: M5 — Standalone Architecture

