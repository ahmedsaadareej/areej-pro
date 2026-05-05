# M3 — هيكل التنقل + حجم الشاشات
> الحالة: ✅ المرحلة 1 مكتملة | 🔴 المرحلة 2 — خطة التنفيذ التقنية
> تاريخ الجلسة: 2026-05-04

---

## القرارات المتفق عليها (من أحمد)

| السؤال | القرار |
|---|---|
| Sidebar ثابت أم متغير؟ | **A) ثابت دايماً** |
| مراجعة الـ Modals | **B) راجعنا كل الـ Modals وحددنا كل اللي يحتاج تغيير** |
| نظام الـ URLs | **B) URLs كاملة — /inbox/conv/123, /reports/agents, /settings/team** |
| Responsive | **B) كامل — موبايل + تابلت + desktop** |
| Broadcast/Chatbot/Webhooks/Email/Automation → فين ينتقلوا؟ | **B) قائمة أدوات Inbox (Inbox Tools menu) — مش في الـ Sidebar الرئيسي** |
| Contacts/CRM | **B) هيكل أساسي — layout + URL scheme بدون تفاصيل داخلية** |

---

## 1. ماذا نبني؟

إعادة هيكلة نظام التنقل بالكامل لـ Inbox v4 عبر:

1. **Global App Shell** يحل محل الـ iframe + outer dashboard
2. **Sidebar رئيسي ثابت** بـ 5 أقسام فقط (مع Inbox Tools menu للأدوات)
3. **URL Scheme كامل** مبني على `history.pushState` — لا hash routing
4. **Responsive كامل** على 3 breakpoints
5. **تصنيف كل الـ Modals/Overlays الحالية** لحجمها الصح

---

## 2. الوضع الحالي — المشاكل

### مشكلة A: الـ iframe architecture
- inbox-v4 يشتغل داخل iframe في `dashboard/index.html`
- مشكلة: لا يمكن تغيير URL الـ outer page من داخل الـ iframe
- مشكلة: Sidebar الـ outer dashboard (ERP) منفصل تماماً عن inbox sidebar
- الحل في M3: **App Shell موحّد** — inbox-v4 يصبح standalone SPA بـ sidebar خاص بيه

### مشكلة B: الـ Sidebar الحالي مكدّس
الـ sidebar الحالي يحتوي على **13+ عنصر** مختلفة في نفس المستوى:
- مفتوحة / انتظار / مؤجلة / مغلقة / الكل
- ملكي / غير معيّن
- الأولوية
- Labels
- الإحصاءات
- Chatbot
- ترحيب/غياب
- مجدولة
- جماعي
- Webhooks
- إيميل

**النتيجة:** الـ sidebar يصبح scroll list طويلة — مش navigation.

### مشكلة C: لا URL scheme
- كل الأدوات تفتح كـ overlays فوق بعض بدون URLs
- لا يمكن مشاركة رابط محادثة معينة أو تقرير معين
- الـ back button لا يعمل بشكل صحيح

### مشكلة D: أحجام غير مناسبة
| الأداة | الحجم الحالي | المشكلة |
|---|---|---|
| Chatbot Flow Builder | Modal 860px max | محتاج canvas كامل — مش modal |
| Analytics (التقارير) | Modal 900px max | تقارير كثيرة — محتاجة صفحة مستقلة |
| Automation | Modal 640px max | يكفي — لكن يجب الانتقال لـ Settings |
| Broadcast | Side drawer 520px | يكفي — لكن ينتقل لـ Inbox Tools |
| Email Settings | Modal 720px | ينتقل لـ Settings > التطبيقات |
| Webhooks | Modal 780px | ينتقل لـ Settings > الأتمتة |
| Welcome/Away | Modal 780px | ينتقل لـ Settings > الأتمتة |
| Labels Manager | Modal 520px | ينتقل لـ Settings > الـ Inbox |
| Transfer Modal | Modal 420px | مناسب — يبقى modal |
| Scheduled Messages | Modal 480px | ينتقل لـ Inbox Tools |

---

## 3. التصميم المعماري الجديد

### 3.1 App Shell (الهيكل العام)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo + اسم المؤسسة]   [Agent Status]   [Avatar + Menu]   │  ← Top bar (48px)
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ SIDEBAR  │              MAIN CONTENT AREA                   │
│ (220px)  │                                                   │
│          │   يتغير بناءً على القسم النشط                     │
│  ثابت    │                                                   │
│ دايماً   │                                                   │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### 3.2 Sidebar الجديد (ثابت — 220px)

```
┌─────────────────────┐
│  🖨️  أريج برو       │  ← Logo + اسم المؤسسة
│      [اسم المستأجر] │
├─────────────────────┤
│  💬  الرسائل        │  ← /inbox  (النشط)
│  👥  جهات الاتصال   │  ← /contacts
│  📊  التقارير       │  ← /reports
│  ⚙️  الإعدادات      │  ← /settings
├─────────────────────┤
│  🧰  أدوات Inbox ▾  │  ← Inbox Tools dropdown/section
│    ├ 📢 جماعي       │  → /inbox/broadcast
│    ├ 📅 مجدولة      │  → /inbox/scheduled
│    └ 🤖 Chatbot     │  → /inbox/chatbot
├─────────────────────┤
│  ─────── spacer ─── │
│  [Agent Status]     │  ← حالة الموظف (online/busy/away)
│  [SSE indicator]    │  ← نقطة الاتصال
└─────────────────────┘
```

**ملاحظات تصميمية:**
- الـ 4 أقسام الرئيسية دايماً ظاهرة
- "أدوات Inbox" قابلة للطي (collapsible) — مفتوحة افتراضياً لو في قسم الرسائل
- Labels + Priority filters = تبقى داخل الـ Inbox page (Col 1) — مش في الـ global sidebar
- على موبايل: الـ sidebar يتحول لـ bottom tab bar (4 tabs فقط)

### 3.3 داخل قسم الرسائل (/inbox)

```
┌──────────┬──────────────────┬─────────────────────────────┐
│  GLOBAL  │   INBOX COL 1    │                             │
│ SIDEBAR  │   (220px)        │      COL 2 + COL 3          │
│          │                  │                             │
│  💬 ●    │  مفتوحة ●        │  [قائمة المحادثات]  [Chat]  │
│  👥      │  انتظار          │                             │
│  📊      │  مؤجلة           │                             │
│  ⚙️      │  مغلقة           │                             │
│          │  ──────          │                             │
│  🧰 ▾    │  ملكي            │                             │
│   📢     │  غير معيّن       │                             │
│   📅     │  ──────          │                             │
│   🤖     │  الأولوية        │                             │
│          │  ──────          │                             │
│ [Status] │  🏷️ Labels       │                             │
└──────────┴──────────────────┴─────────────────────────────┘
```

الـ Col 1 الـ inbox (filters/labels) تبقى كما هي — لكنها الآن **داخل page-inbox** وليست جزءاً من global sidebar.

### 3.4 URL Scheme الكامل

```
/inbox                          ← الرسائل الرئيسية (open filter)
/inbox/conv/:id                 ← محادثة معينة مفتوحة
/inbox/broadcast                ← أداة الرسائل الجماعية
/inbox/scheduled                ← أداة الرسائل المجدولة
/inbox/chatbot                  ← Chatbot Flow Builder (صفحة كاملة)

/contacts                       ← جهات الاتصال (هيكل أساسي)
/contacts/:id                   ← جهة اتصال معينة

/reports                        ← Overview (الرئيسية)
/reports/agents                 ← تقارير الموظفين
/reports/channels               ← تقارير القنوات
/reports/labels                 ← تقارير الـ Labels
/reports/sla                    ← تقارير SLA
/reports/csat                   ← تقارير CSAT
/reports/automation             ← تقارير الأتمتة

/settings                       ← الإعدادات (redirect → /settings/org)
/settings/org                   ← إعدادات المؤسسة
/settings/team                  ← الفريق (M1)
/settings/channels              ← القنوات والتكاملات
/settings/inbox                 ← إعدادات الـ Inbox
/settings/automation            ← الأتمتة (Webhooks + Welcome/Away + Rules)
/settings/data                  ← البيانات (Import/Export/Backup)
```

### 3.5 تصنيف الـ Modals/Overlays — القرارات النهائية

| الأداة الحالية | النوع الحالي | القرار الجديد | السبب |
|---|---|---|---|
| **Chatbot Flow Builder** | Modal 860px, 90vh | ← صفحة كاملة `/inbox/chatbot` | Canvas معقد يحتاج مساحة كاملة |
| **Analytics (التقارير)** | Modal 900px | ← صفحة مستقلة `/reports` | تقارير كثيرة + Charts |
| **Broadcast** | Side drawer 520px | ← صفحة `/inbox/broadcast` | متعدد الخطوات — drawer ضيق |
| **Scheduled Dashboard** | Panel | ← صفحة `/inbox/scheduled` | عرض قوائم + إدارة |
| **Automation (Keywords/Auto-close/Auto-assign)** | Modal 640px | ← Settings > `/settings/automation` | إعداد — مش أداة تشغيلية |
| **Webhooks** | Modal 780px | ← Settings > `/settings/automation` | إعداد |
| **Welcome/Away** | Modal 780px | ← Settings > `/settings/automation` | إعداد |
| **Email Settings** | Modal 720px | ← Settings > `/settings/channels` | إعداد |
| **Labels Manager** | Modal 520px | ← Settings > `/settings/inbox` | إعداد |
| **Transfer Modal** | Modal 420px | ✅ يبقى Modal | عملية سريعة داخل المحادثة |
| **Scheduled (new msg)** | Modal 480px | ✅ يبقى Modal | عملية سريعة داخل الـ reply box |
| **Snooze** | Dropdown/Modal | ✅ يبقى Dropdown | عملية سريعة |
| **Priority** | Dropdown | ✅ يبقى Dropdown | عملية سريعة |
| **Assign** | Dropdown | ✅ يبقى Dropdown | عملية سريعة |
| **Interactive Messages** | Modal | ✅ يبقى Modal | نموذج متوسط |
| **WA Catalog** | Modal/Panel | ✅ يبقى Panel | تصفح منتجات |
| **AI Suggestions** | Inline/Tooltip | ✅ يبقى Inline | |
| **Context Panel** | Side flyout | ✅ يبقى Side flyout | |

---

## 4. التصميم Responsive

### Breakpoints

```
Desktop  : ≥ 1024px — 3 columns كاملة + global sidebar
Tablet   : 640px–1023px — global sidebar + conv list OR chat (toggle)
Mobile   : < 640px — Bottom tab bar + single column (Inbox → List → Chat)
```

### Desktop (≥ 1024px)
```
[Global Sidebar 220px] [Inbox Col1 220px] [Conv List 320px] [Chat + Context]
```

### Tablet (640–1023px)
```
[Global Sidebar 56px icons-only] [Conv List] [Chat]
← عند فتح محادثة: يخفي Conv List ويفتح Chat كاملاً
```

### Mobile (< 640px)
```
Bottom bar: [💬 Inbox] [👥 Contacts] [📊 Reports] [⚙️ Settings]

في Inbox:
[1] قائمة المحادثات (full screen)
[2] فتح محادثة → Chat (full screen، back button يرجع للقائمة)

أدوات Inbox (Broadcast/Scheduled/Chatbot) → تفتح كـ full screen pages
```

### Global Sidebar على Tablet
- يتحول لـ 56px — icons فقط بدون labels
- Inbox Tools تظهر كـ tooltip عند hover

### Global Sidebar على Mobile
- يختفي تماماً
- يُستبدل بـ Bottom Tab Bar (4 tabs: Inbox / Contacts / Reports / Settings)

---

## 5. ما الذي يمكن أن يفشل؟

| الخطر | التفاصيل | الحل |
|---|---|---|
| **iframe → SPA migration** | inbox-v4 حالياً داخل iframe — الـ outer dashboard لازم يعرف URL الـ inbox | postMessage من inbox لـ outer حتى يعمل `history.pushState` على الـ outer — أو نقل inbox لـ standalone route |
| **History API conflict** | outer dashboard يستخدم hash routing (#p=inbox) — inbox-v4 يستخدم pushState | تحديد: inbox-v4 يتحكم في الـ URL لما يكون النشط، outer يراقب بس |
| **Back button** | المستخدم يضغط back لما هو في `/inbox/conv/123` → يرجع للـ `/inbox` مش للـ outer page | تحديد history stack بدقة — conv navigation = push state |
| **Deep link** | مستخدم يفتح `/inbox/conv/123` مباشرة — الـ app يلزم يعرف يload الـ conversation | init logic يقرأ الـ URL أول وتحميل الـ conversation قبل الـ render |
| **Mobile Chatbot** | Chatbot Flow Builder = visual canvas — على موبايل مش practical | على موبايل: عرض read-only + رسالة "استخدم desktop لتعديل الـ flows" |
| **Inbox Tools collapse** | لو المستخدم أغلق الـ Inbox Tools section وانتقل لصفحة /inbox/broadcast — السـ sidebar لازم يفتح التقسيم تلقائياً | active state detection: لو الـ URL يبدأ بـ /inbox → افتح Inbox Tools تلقائياً |
| **SSE + navigation** | لما المستخدم ينتقل من /inbox لـ /reports — الـ SSE connection يلزم يبقى شغّال | SSE يبقى في App Shell — مش في page-inbox فقط |

---

## 6. كيف يتكامل مع المحاور الأخرى؟

| المحور | نقطة التلامس |
|---|---|
| **M1 — Permissions** | الـ Sidebar يخفي أقسام بناءً على الدور (لو Agent → Reports تُخفي أو تُقيّد) / Route Guard على كل URL |
| **M2 — Settings** | الـ Settings page هي `/settings/*` — M3 يحدد الـ URL scheme والـ layout فقط، M2 يحدد المحتوى |
| **M4 — Analytics** | Reports section = `/reports/*` — M3 يحدد الـ shell والـ navigation، M4 يحدد المحتوى |
| **M5 — Standalone** | App Shell يصبح entry point الـ standalone product — مستقل عن outer dashboard |

---

## 7. القرارات المعمارية الجديدة من M3

| # | القرار |
|---|---|
| D-018 | inbox-v4 ينتقل من iframe لـ standalone SPA يتحكم في URL خاص بيه |
| D-019 | Global Sidebar = 4 sections + Inbox Tools collapsible — ثابت دايماً |
| D-020 | URL Scheme كامل مبني على history.pushState — لا hash routing |
| D-021 | Chatbot + Broadcast + Scheduled = صفحات كاملة لا overlays |
| D-022 | Automation/Webhooks/Welcome/Away/Email/Labels تنتقل لـ Settings |
| D-023 | SSE يعيش في App Shell — لا يُقطع عند الانتقال بين الصفحات |
| D-024 | Mobile = Bottom Tab Bar (4 tabs) + single column navigation |

---

## الحالة الحالية

- [x] المرحلة 1: التحليل + التصميم المعماري ✅
- [ ] المرحلة 2: خطة التنفيذ التقنية التفصيلية ⏳

---

> آخر تحديث: 2026-05-04

---

# المرحلة 2 — خطة التنفيذ التقنية التفصيلية
> تاريخ الجلسة: 2026-05-04

---

## نظرة عامة على التنفيذ

M3 يتضمن **4 تغييرات كبرى**:
1. **Backend:** إضافة route `/inbox*` في `server/app.js` (سطران فقط)
2. **Frontend جديد:** إنشاء `public/inbox-v4/` مستقل بـ App Shell جديد (HTML + CSS + JS)
3. **تحديث الملفات الموجودة:** نقل SSE للـ App Shell، استبدال iframe بـ redirect في `dashboard/index.html`
4. **Router داخلي:** ملف `router.js` جديد يتحكم في `history.pushState`

**المبدأ الحاكم:** الـ inbox-v4 الحالية في `/dashboard/inbox-v4/` **لا تُمس** — ننشئ entry point جديد في `/inbox*` route، والملفات الموجودة تنتقل تدريجياً.

---

## قائمة الملفات الكاملة

### ملفات جديدة تُنشأ

```
public/inbox-v4/
├── index.html          ← App Shell الجديد (يحل محل /dashboard/inbox-v4/index.html)
├── shell.css           ← CSS خاص بالـ App Shell (Global Sidebar + Topbar + Responsive)
├── shell.js            ← JS خاص بالـ App Shell (init + user info + agent status)
├── router.js           ← Router داخلي (history.pushState + popstate handler)
├── pages/
│   ├── page-inbox.js   ← يحمّل inbox columns (الـ 3 أعمدة الحالية)
│   ├── page-contacts.js← Contacts placeholder (هيكل أساسي فقط)
│   ├── page-reports.js ← يحمّل analytics (موجود بالفعل في analytics.js)
│   └── page-settings.js← يحمّل settings (موجود بالفعل في M2)
```

**ملاحظة:** الملفات الحالية في `/dashboard/inbox-v4/` (store.js, api.js, chat.js, ...) **تبقى في مكانها** — يتم require/import منها في الـ page modules.

### ملفات تُعدَّل

```
server/app.js                          ← إضافة /inbox* route + auth redirect
public/dashboard/index.html            ← استبدال iframe بـ redirect link
public/dashboard/inbox-v4/app.js       ← إزالة SSE init (ينتقل لـ shell.js)
public/dashboard/inbox-v4/stream.js    ← تعديل: يقبل trigger من shell بدل auto-init
```

### ملفات لا تُمس

```
public/dashboard/inbox-v4/store.js     ← يبقى كما هو
public/dashboard/inbox-v4/api.js       ← يبقى كما هو
public/dashboard/inbox-v4/chat.js      ← يبقى كما هو
public/dashboard/inbox-v4/conv-list.js ← يبقى كما هو
public/dashboard/inbox-v4/inbox.css    ← يبقى كما هو (يُستورد في index.html الجديد)
... كل ملفات inbox-v4 الحالية         ← تبقى كما هي
```

---

## الخطوة 1 — Backend: إضافة `/inbox*` route

**الملف:** `server/app.js`
**السطر المستهدف:** قبل سطر `/dashboard*` (سطر 183 الحالي)

### التعديل

```javascript
// أضف هذين السطرين قبل سطر /dashboard*

// ── Inbox v4 standalone (auth-protected) ──────────────────────────────────
app.get('/inbox*', (req, res) => {
  if (!req.session || !req.session.userId) {
    const redirect = encodeURIComponent(req.path + (req.query ? '?' + new URLSearchParams(req.query).toString() : ''));
    return res.redirect('/auth?redirect=' + redirect);
  }
  res.sendFile(path.join(__dirname, '../public/inbox-v4/index.html'));
});
```

**ملاحظات:**
- `req.session.userId` — اسم الـ field مطابق لباقي الكود (تحقق من `server/routes/auth.js` إذا كان `userId` أو `user`)
- كل sub-routes (`/inbox/conv/123`, `/inbox/broadcast`, ...) ترجع نفس الـ `index.html` — الـ router الداخلي يتولى الباقي
- يُضاف **قبل** سطر `app.get('/dashboard*', ...)` لأن Express يمشي بالترتيب


---

## الخطوة 2 — router.js (Router الداخلي)

**الملف الجديد:** `public/inbox-v4/router.js`

### المسؤوليات
- يقرأ `window.location.pathname` عند الـ load
- يستمع لـ `popstate` (زر Back/Forward في المتصفح)
- يوفر `InboxRouter.navigate(path)` لكل الملفات الأخرى
- يُطلق event `route:change` على InboxStore

### الكود الكامل

```javascript
/**
 * router.js — Inbox v4 Router
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 *
 * يتحكم في history.pushState + popstate
 * InboxRouter.navigate('/inbox/conv/123')
 * InboxStore.on('route:change', ({ path, params }) => { ... })
 */

const InboxRouter = (() => {
  'use strict';

  // ─── Route Patterns ─────────────────────────────────────────────────────
  const ROUTES = [
    { pattern: /^\/inbox\/conv\/(\d+)$/,  page: 'inbox',    params: m => ({ convId: m[1] }) },
    { pattern: /^\/inbox\/broadcast$/,    page: 'broadcast', params: () => ({}) },
    { pattern: /^\/inbox\/scheduled$/,    page: 'scheduled', params: () => ({}) },
    { pattern: /^\/inbox\/chatbot$/,      page: 'chatbot',   params: () => ({}) },
    { pattern: /^\/inbox(\/.*)?$/,        page: 'inbox',    params: () => ({}) },
    { pattern: /^\/contacts\/(\d+)$/,     page: 'contacts', params: m => ({ contactId: m[1] }) },
    { pattern: /^\/contacts(\/.*)?$/,     page: 'contacts', params: () => ({}) },
    { pattern: /^\/reports\/(\w+)$/,      page: 'reports',  params: m => ({ sub: m[1] }) },
    { pattern: /^\/reports(\/.*)?$/,      page: 'reports',  params: () => ({}) },
    { pattern: /^\/settings\/(\w+)$/,     page: 'settings', params: m => ({ tab: m[1] }) },
    { pattern: /^\/settings(\/.*)?$/,     page: 'settings', params: () => ({}) },
  ];

  // ─── Match ───────────────────────────────────────────────────────────────
  function match(pathname) {
    for (const r of ROUTES) {
      const m = pathname.match(r.pattern);
      if (m) return { page: r.page, params: r.params(m), path: pathname };
    }
    return { page: 'inbox', params: {}, path: '/inbox' };  // fallback
  }

  // ─── Navigate ────────────────────────────────────────────────────────────
  function navigate(path, { replace = false } = {}) {
    if (replace) {
      history.replaceState({}, '', path);
    } else {
      history.pushState({}, '', path);
    }
    dispatch(path);
  }

  function dispatch(pathname) {
    const resolved = match(pathname);
    if (typeof InboxStore !== 'undefined') {
      InboxStore.emit('route:change', resolved);
    }
  }

  // ─── Listeners ───────────────────────────────────────────────────────────
  window.addEventListener('popstate', () => dispatch(window.location.pathname));

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    dispatch(window.location.pathname);
  }

  return { navigate, match, init };
})();
```

### كيف تستخدمه الصفحات الأخرى

```javascript
// من أي ملف — الانتقال لمحادثة معينة:
InboxRouter.navigate('/inbox/conv/123');

// من conv-list.js عند النقر على محادثة:
InboxRouter.navigate('/inbox/conv/' + conv.id);

// من الـ sidebar عند النقر على Reports:
InboxRouter.navigate('/reports');

// الاستماع للتغيير (في shell.js أو page modules):
InboxStore.on('route:change', ({ page, params, path }) => {
  showPage(page, params);
});
```

---

## الخطوة 3 — shell.js (App Shell Logic)

**الملف الجديد:** `public/inbox-v4/shell.js`

### المسؤوليات
1. تحميل بيانات المستخدم (`/api/me` أو `/api/inbox/me`)
2. عرض اسم المؤسسة + Agent في الـ Topbar
3. تفعيل SSE (ينقل init من `app.js` هنا)
4. التحكم في Active state الـ Sidebar بناءً على `route:change`
5. Responsive: تفعيل Bottom Tab Bar على موبايل
6. Inbox Tools section collapse/expand

### هيكل الكود

```javascript
/**
 * shell.js — Inbox v4 App Shell
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 *
 * المسؤوليات:
 *  - تحميل user info + tenant name
 *  - SSE init (نُقل من app.js)
 *  - Sidebar active state
 *  - Responsive behavior
 *  - Inbox Tools toggle
 */

const InboxShell = (() => {
  'use strict';
  const $ = id => document.getElementById(id);

  // ─── Init ────────────────────────────────────────────────────────────────
  async function init() {
    await loadUserInfo();
    initSidebar();
    initResponsive();
    InboxRouter.init();          // يُطلق route:change الأول
    InboxStream.init();          // SSE — نُقل من app.js
  }

  // ─── User Info ───────────────────────────────────────────────────────────
  async function loadUserInfo() {
    try {
      const data = await InboxAPI.get('/api/inbox/me');
      // عرض اسم الموظف في الـ topbar
      const nameEl = $('shell-agent-name');
      if (nameEl) nameEl.textContent = data.name || '';
      // عرض اسم المؤسسة
      const tenantEl = $('shell-tenant-name');
      if (tenantEl) tenantEl.textContent = data.tenantName || 'أريج برو';
      // حفظ في الـ store
      InboxStore.set('currentUser', data);
    } catch (e) {
      console.error('shell: failed to load user info', e);
    }
  }

  // ─── Sidebar Active State ────────────────────────────────────────────────
  function initSidebar() {
    InboxStore.on('route:change', ({ page, path }) => {
      // تحديث active class في الـ sidebar
      document.querySelectorAll('[data-nav-page]').forEach(el => {
        el.classList.toggle('active', el.dataset.navPage === page);
      });

      // فتح Inbox Tools تلقائياً لو الـ URL يبدأ بـ /inbox
      const toolsSection = $('shell-inbox-tools');
      if (toolsSection) {
        toolsSection.classList.toggle('open', path.startsWith('/inbox'));
      }

      // تحديث URL في المتصفح (لو مش متحدّث بالفعل)
      if (window.location.pathname !== path) {
        history.replaceState({}, '', path);
      }
    });

    // Inbox Tools toggle
    const toolsToggle = $('shell-tools-toggle');
    if (toolsToggle) {
      toolsToggle.addEventListener('click', () => {
        $('shell-inbox-tools').classList.toggle('open');
      });
    }
  }

  // ─── Agent Status ────────────────────────────────────────────────────────
  // (يُستكمل في M1 Phase10 — الـ status dropdown)

  // ─── Responsive ──────────────────────────────────────────────────────────
  function initResponsive() {
    const mq = window.matchMedia('(max-width: 639px)');
    function onBreakpoint(e) {
      document.body.classList.toggle('is-mobile', e.matches);
    }
    mq.addEventListener('change', onBreakpoint);
    onBreakpoint(mq);  // initial check
  }

  return { init };
})();

// ─── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => InboxShell.init());
```

**ملاحظة:** `InboxAPI.get('/api/inbox/me')` — هذا endpoint موجود بالفعل في `server/routes/inbox/index.js` (يُعيد بيانات الـ user من `req.user`). تحقق من الاسم الدقيق قبل التنفيذ.


---

## الخطوة 4 — index.html (App Shell HTML)

**الملف الجديد:** `public/inbox-v4/index.html`

### الهيكل الكامل

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>الرسائل — أريج برو</title>
  <!-- Shell styles أولاً -->
  <link rel="stylesheet" href="/dashboard/inbox-v4/inbox.css?v=1" />
  <link rel="stylesheet" href="/inbox-v4/shell.css?v=1" />
</head>
<body class="iv4-body shell-body">

  <!-- ══════════════ TOP BAR (48px) ══════════════ -->
  <header id="shell-topbar" class="shell-topbar">
    <div class="shell-topbar-brand">
      <span class="shell-brand-icon">🖨️</span>
      <span id="shell-tenant-name" class="shell-brand-text">أريج برو</span>
    </div>
    <div class="shell-topbar-right">
      <span id="shell-sse-dot" class="shell-sse-dot"></span>
      <div id="shell-agent-menu" class="shell-agent-menu">
        <span id="shell-agent-name" class="shell-agent-name">...</span>
        <span id="shell-agent-status" class="shell-agent-status online">●</span>
      </div>
    </div>
  </header>

  <!-- ══════════════ MAIN LAYOUT ══════════════ -->
  <div class="shell-layout">

    <!-- ── GLOBAL SIDEBAR (220px desktop / 56px tablet / hidden mobile) ── -->
    <nav id="shell-sidebar" class="shell-sidebar">

      <!-- 4 أقسام رئيسية -->
      <div class="shell-nav-main">
        <a href="/inbox"    data-nav-page="inbox"    class="shell-nav-item active" onclick="return InboxRouter.navigate('/inbox'), false">
          <span class="shell-nav-icon">💬</span>
          <span class="shell-nav-label">الرسائل</span>
          <span id="shell-inbox-badge" class="shell-nav-badge" style="display:none">0</span>
        </a>
        <a href="/contacts" data-nav-page="contacts" class="shell-nav-item" onclick="return InboxRouter.navigate('/contacts'), false">
          <span class="shell-nav-icon">👥</span>
          <span class="shell-nav-label">جهات الاتصال</span>
        </a>
        <a href="/reports"  data-nav-page="reports"  class="shell-nav-item" onclick="return InboxRouter.navigate('/reports'), false">
          <span class="shell-nav-icon">📊</span>
          <span class="shell-nav-label">التقارير</span>
        </a>
        <a href="/settings" data-nav-page="settings" class="shell-nav-item" onclick="return InboxRouter.navigate('/settings'), false">
          <span class="shell-nav-icon">⚙️</span>
          <span class="shell-nav-label">الإعدادات</span>
        </a>
      </div>

      <!-- Inbox Tools (collapsible) -->
      <div id="shell-inbox-tools" class="shell-inbox-tools open">
        <button id="shell-tools-toggle" class="shell-tools-header">
          <span class="shell-nav-icon">🧰</span>
          <span class="shell-nav-label">أدوات Inbox</span>
          <span class="shell-tools-arrow">▾</span>
        </button>
        <div class="shell-tools-items">
          <a href="/inbox/broadcast" data-nav-page="broadcast" class="shell-nav-item shell-tool-item" onclick="return InboxRouter.navigate('/inbox/broadcast'), false">
            <span class="shell-nav-icon">📢</span>
            <span class="shell-nav-label">جماعي</span>
          </a>
          <a href="/inbox/scheduled" data-nav-page="scheduled" class="shell-nav-item shell-tool-item" onclick="return InboxRouter.navigate('/inbox/scheduled'), false">
            <span class="shell-nav-icon">📅</span>
            <span class="shell-nav-label">مجدولة</span>
          </a>
          <a href="/inbox/chatbot" data-nav-page="chatbot" class="shell-nav-item shell-tool-item" onclick="return InboxRouter.navigate('/inbox/chatbot'), false">
            <span class="shell-nav-icon">🤖</span>
            <span class="shell-nav-label">Chatbot</span>
          </a>
        </div>
      </div>

      <!-- Spacer + Agent Status -->
      <div class="shell-sidebar-footer">
        <div id="shell-agent-status-row" class="shell-status-row">
          <span id="shell-status-dot" class="shell-status-dot online"></span>
          <span id="shell-status-label" class="shell-status-label">متصل</span>
        </div>
      </div>
    </nav>

    <!-- ── CONTENT AREA ── -->
    <main id="shell-content" class="shell-content">
      <!-- تُحقن الصفحات هنا ديناميكياً -->
    </main>

  </div>

  <!-- ══════════════ BOTTOM TAB BAR (mobile only) ══════════════ -->
  <nav id="shell-bottom-bar" class="shell-bottom-bar">
    <a href="/inbox"    data-nav-page="inbox"    onclick="return InboxRouter.navigate('/inbox'), false">
      <span>💬</span><span>الرسائل</span>
    </a>
    <a href="/contacts" data-nav-page="contacts" onclick="return InboxRouter.navigate('/contacts'), false">
      <span>👥</span><span>جهات الاتصال</span>
    </a>
    <a href="/reports"  data-nav-page="reports"  onclick="return InboxRouter.navigate('/reports'), false">
      <span>📊</span><span>التقارير</span>
    </a>
    <a href="/settings" data-nav-page="settings" onclick="return InboxRouter.navigate('/settings'), false">
      <span>⚙️</span><span>الإعدادات</span>
    </a>
  </nav>

  <!-- ══════════════ TOASTS ══════════════ -->
  <div id="iv4-toasts" class="iv4-toasts"></div>

  <!-- ══════════════ SCRIPTS (بالترتيب) ══════════════ -->
  <!-- 1. Store أولاً -->
  <script src="/dashboard/inbox-v4/store.js"></script>
  <!-- 2. API layer -->
  <script src="/dashboard/inbox-v4/api.js"></script>
  <!-- 3. Router -->
  <script src="/inbox-v4/router.js"></script>
  <!-- 4. Stream (SSE) -->
  <script src="/dashboard/inbox-v4/stream.js"></script>
  <!-- 5. كل ملفات الـ inbox الحالية -->
  <script src="/dashboard/inbox-v4/conv-list.js"></script>
  <script src="/dashboard/inbox-v4/chat.js"></script>
  <script src="/dashboard/inbox-v4/reply.js"></script>
  <script src="/dashboard/inbox-v4/context.js"></script>
  <script src="/dashboard/inbox-v4/team.js"></script>
  <script src="/dashboard/inbox-v4/labels.js"></script>
  <script src="/dashboard/inbox-v4/search.js"></script>
  <script src="/dashboard/inbox-v4/ai.js"></script>
  <script src="/dashboard/inbox-v4/interactive.js"></script>
  <script src="/dashboard/inbox-v4/catalog.js"></script>
  <script src="/dashboard/inbox-v4/scheduled.js"></script>
  <script src="/dashboard/inbox-v4/broadcast.js"></script>
  <script src="/dashboard/inbox-v4/chatbot.js"></script>
  <script src="/dashboard/inbox-v4/analytics.js"></script>
  <script src="/dashboard/inbox-v4/email.js"></script>
  <script src="/dashboard/inbox-v4/automation.js"></script>
  <!-- 6. Page modules -->
  <script src="/inbox-v4/pages/page-inbox.js"></script>
  <script src="/inbox-v4/pages/page-contacts.js"></script>
  <script src="/inbox-v4/pages/page-reports.js"></script>
  <script src="/inbox-v4/pages/page-settings.js"></script>
  <!-- 7. App.js الحالي (منقح) -->
  <script src="/dashboard/inbox-v4/app.js"></script>
  <!-- 8. Shell آخر شيء -->
  <script src="/inbox-v4/shell.js"></script>
</body>
</html>
```

**ملاحظة ترتيب الـ scripts:**
- `store.js` أولاً دايماً — كل الملفات تعتمد عليه
- `router.js` قبل `shell.js` — shell يستدعي `InboxRouter.init()`
- `stream.js` قبل `shell.js` — shell يستدعي `InboxStream.init()`
- `shell.js` آخر شيء — يُطلق الـ bootstrap


---

## الخطوة 5 — shell.css

**الملف الجديد:** `public/inbox-v4/shell.css`

### CSS Variables + Layout الأساسي

```css
/* shell.css — Inbox v4 App Shell Styles
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 */

/* ── Variables ── */
:root {
  --shell-topbar-h: 48px;
  --shell-sidebar-w: 220px;
  --shell-sidebar-collapsed-w: 56px;
  --shell-bottom-bar-h: 56px;
  --shell-brand: #1B5E30;
  --shell-brand-light: #e8f5e9;
  --shell-text: #111827;
  --shell-muted: #6b7280;
  --shell-border: #e5e7eb;
  --shell-active-bg: #f0fdf4;
  --shell-active-color: #1B5E30;
}

/* ── Base Layout ── */
.shell-body {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.shell-topbar {
  height: var(--shell-topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--shell-border);
  background: #fff;
  flex-shrink: 0;
  z-index: 100;
}

.shell-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Sidebar ── */
.shell-sidebar {
  width: var(--shell-sidebar-w);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--shell-border); /* RTL */
  background: #fff;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.shell-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  margin: 2px 8px;
  cursor: pointer;
  text-decoration: none;
  color: var(--shell-text);
  font-size: 14px;
  transition: background 0.15s;
}
.shell-nav-item:hover     { background: var(--shell-brand-light); }
.shell-nav-item.active    { background: var(--shell-active-bg); color: var(--shell-active-color); font-weight: 600; }

/* ── Inbox Tools Collapsible ── */
.shell-tools-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; width: 100%;
  border: none; background: none; cursor: pointer;
  font-size: 14px; color: var(--shell-muted);
}
.shell-tools-items { display: none; }
.shell-inbox-tools.open .shell-tools-items { display: block; }
.shell-inbox-tools.open .shell-tools-arrow { transform: rotate(180deg); }
.shell-tool-item { padding-right: 32px; font-size: 13px; }

/* ── Content Area ── */
.shell-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* ── Bottom Bar (mobile only — hidden by default) ── */
.shell-bottom-bar { display: none; }

/* ── SSE Dot ── */
.shell-sse-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  display: inline-block;
}
.shell-sse-dot.connected    { background: #22c55e; }
.shell-sse-dot.disconnected { background: #ef4444; }
.shell-sse-dot.connecting   { background: #f59e0b; animation: pulse 1s infinite; }

/* ── Sidebar Footer ── */
.shell-sidebar-footer {
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid var(--shell-border);
}

/* ══════════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════════ */

/* ── Tablet (640px – 1023px) ── */
@media (min-width: 640px) and (max-width: 1023px) {
  .shell-sidebar {
    width: var(--shell-sidebar-collapsed-w);
  }
  .shell-nav-label,
  .shell-brand-text,
  .shell-tools-items,
  .shell-tools-arrow,
  .shell-status-label,
  .shell-agent-name { display: none; }
  .shell-nav-item   { justify-content: center; padding: 12px; margin: 2px 4px; }
  .shell-nav-icon   { font-size: 18px; }
  .shell-tools-header { justify-content: center; }
}

/* ── Mobile (< 640px) ── */
@media (max-width: 639px) {
  .shell-sidebar      { display: none; }
  .shell-bottom-bar   {
    display: flex;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: var(--shell-bottom-bar-h);
    background: #fff;
    border-top: 1px solid var(--shell-border);
    z-index: 200;
  }
  .shell-bottom-bar a {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-size: 11px; color: var(--shell-muted);
    text-decoration: none; gap: 2px;
  }
  .shell-bottom-bar a.active { color: var(--shell-active-color); }
  .shell-content {
    padding-bottom: var(--shell-bottom-bar-h);
  }
}
```

---

## الخطوة 6 — Page Modules

### 6.1 page-inbox.js

**الملف الجديد:** `public/inbox-v4/pages/page-inbox.js`

```javascript
/**
 * page-inbox.js — يعرض الـ 3 أعمدة الحالية
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 */

const PageInbox = (() => {
  'use strict';

  // HTML الـ 3 أعمدة — نفس index.html الحالي بالضبط (يُنقل هنا)
  const TEMPLATE = `
    <div id="iv4-root" class="iv4-root" style="height:100%">
      <!-- Col 1: Sidebar الداخلي (filters + labels) -->
      <aside id="iv4-sidebar" class="iv4-sidebar">
        <!-- ... نفس المحتوى الحالي من index.html ... -->
      </aside>
      <!-- Col 2: قائمة المحادثات -->
      <div id="iv4-col2" class="iv4-col2">
        <!-- ... -->
      </div>
      <!-- Col 3: Chat + Context -->
      <div id="iv4-col3" class="iv4-col3">
        <!-- ... -->
      </div>
    </div>
  `;

  function mount(container, params) {
    container.innerHTML = TEMPLATE;
    // تشغيل الـ init functions الموجودة
    if (typeof ConvList !== 'undefined') ConvList.init();
    if (typeof InboxChat !== 'undefined') InboxChat.init();
    // لو في convId في الـ params → افتح المحادثة مباشرة
    if (params.convId) {
      InboxStore.set('activeConvId', parseInt(params.convId));
    }
  }

  function unmount() {
    // cleanup لو احتاجنا
  }

  return { mount, unmount };
})();
```

**ملاحظة مهمة:** الـ TEMPLATE في page-inbox.js = نفس الـ HTML الموجود في `dashboard/inbox-v4/index.html` من سطر `<div id="iv4-root">` للنهاية. أثناء التنفيذ: انسخ المحتوى الكامل.

### 6.2 page-contacts.js (هيكل أساسي)

```javascript
/**
 * page-contacts.js — Contacts placeholder
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 * ملاحظة: هيكل أساسي فقط — المحتوى الكامل في مرحلة لاحقة
 */

const PageContacts = (() => {
  'use strict';

  function mount(container, params) {
    container.innerHTML = `
      <div style="padding:48px;text-align:center;color:#6b7280">
        <div style="font-size:48px;margin-bottom:16px">👥</div>
        <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">جهات الاتصال</h2>
        <p>هذا القسم قيد التطوير</p>
      </div>
    `;
  }
  function unmount() {}

  return { mount, unmount };
})();
```

### 6.3 page-reports.js

```javascript
/**
 * page-reports.js — يعرض Analytics الموجود
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 */

const PageReports = (() => {
  'use strict';

  function mount(container, params) {
    container.innerHTML = `<div id="iv4-analytics-root" style="height:100%;overflow-y:auto"></div>`;
    // InboxAnalytics موجود في analytics.js
    if (typeof InboxAnalytics !== 'undefined') {
      InboxAnalytics.init(document.getElementById('iv4-analytics-root'), params.sub || 'overview');
    }
  }
  function unmount() {
    if (typeof InboxAnalytics !== 'undefined' && InboxAnalytics.destroy) InboxAnalytics.destroy();
  }

  return { mount, unmount };
})();
```

### 6.4 page-settings.js

```javascript
/**
 * page-settings.js — يعرض Settings (M2)
 * آخر تحديث: 2026-05-04 (M3-Phase2)
 */

const PageSettings = (() => {
  'use strict';

  function mount(container, params) {
    container.innerHTML = `<div id="iv4-settings-root" style="height:100%;overflow-y:auto"></div>`;
    if (typeof InboxSettings !== 'undefined') {
      InboxSettings.init(document.getElementById('iv4-settings-root'), params.tab || 'org');
    }
  }
  function unmount() {}

  return { mount, unmount };
})();
```

### الـ Router يستدعي الـ pages — تُضاف في shell.js

```javascript
// في shell.js — initSidebar() — بعد route:change listener:

const PAGES = {
  inbox:     PageInbox,
  contacts:  PageContacts,
  reports:   PageReports,
  settings:  PageSettings,
  broadcast: { mount: (c) => { if (InboxBroadcast) InboxBroadcast.openPage(c); }, unmount: () => {} },
  scheduled: { mount: (c) => { if (InboxScheduled) InboxScheduled.openPage(c); }, unmount: () => {} },
  chatbot:   { mount: (c) => { if (InboxChatbot)   InboxChatbot.openPage(c);   }, unmount: () => {} },
};

let currentPage = null;

InboxStore.on('route:change', ({ page, params }) => {
  const content = document.getElementById('shell-content');
  if (!content) return;
  if (currentPage && PAGES[currentPage] && PAGES[currentPage].unmount) {
    PAGES[currentPage].unmount();
  }
  currentPage = page;
  if (PAGES[page]) PAGES[page].mount(content, params);
});
```


---

## الخطوة 7 — تعديل stream.js (نقل SSE init)

**الملف:** `public/dashboard/inbox-v4/stream.js`

### التغيير المطلوب

الـ `stream.js` الحالي يستدعي `init()` تلقائياً عند تحميل الملف (أو عبر `DOMContentLoaded`).
الهدف: جعل `init()` تُستدعى **من shell.js** بدل أن تكون auto-run.

### التعديل (سطر واحد فقط)

```javascript
// ابحث عن هذا في stream.js:
document.addEventListener('DOMContentLoaded', () => InboxStream.init());
// أو:
InboxStream.init();

// واستبدله بـ:
// (لا تضيف شيء — shell.js سيستدعي InboxStream.init() بنفسه)
```

**إذا كان stream.js يستدعي init() داخل IIFE أو DOMContentLoaded:**
- احذف السطر الذي يستدعي init() تلقائياً
- اترك `const InboxStream = (() => { ... return { init, ... }; })();` كما هو
- shell.js سيستدعي `InboxStream.init()` في الوقت الصح

**لماذا؟** SSE يجب أن يبدأ بعد تحميل بيانات الـ user (لأن الـ SSE endpoint يحتاج auth). shell.js يضمن الترتيب الصح: `loadUserInfo()` → `InboxStream.init()`.

---

## الخطوة 8 — تعديل dashboard/index.html

**الملف:** `public/dashboard/index.html`

### التغيير المطلوب

الـ iframe الحالي:
```html
<div class="page" id="page-inbox" style="padding:0;overflow:hidden">
  <iframe id="inbox-v4-frame" src="/dashboard/inbox-v4/index.html" ...></iframe>
</div>
```

يُستبدل بـ:
```html
<div class="page" id="page-inbox" style="padding:0;overflow:hidden;
     display:flex;align-items:center;justify-content:center">
  <div style="text-align:center">
    <p style="color:#6b7280;margin-bottom:12px">الرسائل انتقلت لعنوان مستقل</p>
    <a href="/inbox" target="_blank"
       style="background:#1B5E30;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">
      فتح الرسائل ←
    </a>
  </div>
</div>
```

**ملاحظة:** الـ sidebar item "الرسائل" في `dashboard/index.html` يُعدَّل ليفتح `/inbox` في tab جديد بدل تشغيل الـ page القديمة. هذا يضمن عدم كسر أي شيء أثناء الانتقال.

```javascript
// في dashboard/index.html — عدّل sbShowPage للـ inbox:
// ابحث عن:
// document.getElementById('sb-inbox').onclick = function() { sbShowPage('inbox', this); }
// أضف redirect:
if (page === 'inbox') {
  window.open('/inbox', '_blank');
  return;
}
```

---

## الخطوة 9 — تعديل app.js (إزالة SSE auto-init)

**الملف:** `public/dashboard/inbox-v4/app.js`

### التغيير

```javascript
// ابحث عن سطر init الـ SSE في آخر app.js:
// مثلاً: InboxStream.init(); أو document.addEventListener('DOMContentLoaded', ...)

// احذفه — shell.js سيتولى ذلك
```

**باقي app.js يبقى كما هو** — كل الـ event listeners والـ status nav buttons لا تزال صالحة.

---

## الخطوة 10 — Deep Link Handler

**في page-inbox.js — دالة mount:**

```javascript
function mount(container, params) {
  container.innerHTML = TEMPLATE;
  // init الـ modules الحالية
  if (typeof ConvList !== 'undefined') ConvList.init();
  if (typeof InboxChat !== 'undefined') InboxChat.init();

  // Deep Link: لو في convId في الـ URL
  if (params.convId) {
    // انتظر تحميل المحادثات أولاً ثم افتح المحادثة
    const tryOpen = () => {
      const conv = InboxStore.state.conversations.find(c => c.id == params.convId);
      if (conv) {
        InboxStore.set('activeConvId', conv.id);
      } else {
        // المحادثة مش في الـ list الحالية — حمّلها مباشرة
        InboxAPI.get('/api/inbox/conversations/' + params.convId)
          .then(data => {
            if (data && data.id) InboxStore.set('activeConvId', data.id);
          })
          .catch(() => InboxRouter.navigate('/inbox', { replace: true }));
      }
    };

    if (InboxStore.state.convLoading) {
      InboxStore.on('convLoading:change', ({ value }) => {
        if (!value) tryOpen();
      });
    } else {
      tryOpen();
    }
  }
}
```

---

## الخطوة 11 — Inbox Badge في Shell Sidebar

**في app.js أو store.js — أضف:**

```javascript
// تحديث الـ badge في shell sidebar
InboxStore.on('counts:change', ({ value }) => {
  const badge = document.getElementById('shell-inbox-badge');
  if (!badge) return;
  const open = value.open || 0;
  badge.textContent = open > 99 ? '99+' : open;
  badge.style.display = open > 0 ? 'inline-flex' : 'none';
});
```


---

## الخطوة 12 — Mobile: Chatbot على صغر الشاشات

**في page-inbox.js أو chatbot page:**

```javascript
// في mount الـ chatbot page:
function mountChatbot(container) {
  const isMobile = window.innerWidth < 640;
  if (isMobile) {
    container.innerHTML = `
      <div style="padding:48px;text-align:center;color:#6b7280">
        <div style="font-size:48px;margin-bottom:16px">🤖</div>
        <h2 style="margin-bottom:8px">Chatbot Flow Builder</h2>
        <p style="margin-bottom:16px">هذه الأداة تحتاج شاشة أكبر للعمل بشكل صحيح</p>
        <p style="font-size:13px">يرجى الفتح من جهاز كمبيوتر أو تابلت</p>
      </div>
    `;
    return;
  }
  // عرض الـ builder الكامل
  if (typeof InboxChatbot !== 'undefined') InboxChatbot.openPage(container);
}
```

---

## تسلسل التنفيذ (الترتيب الإلزامي)

```
الخطوة 1  ← server/app.js          — إضافة /inbox* route
           [node --check server/app.js] [restart server] [تحقق: curl /inbox يرجع 200]

الخطوة 2  ← public/inbox-v4/router.js  — ملف جديد
           [node --check router.js] [تحقق: InboxRouter.navigate موجود]

الخطوة 3  ← public/inbox-v4/pages/    — 4 ملفات جديدة
           [page-inbox.js, page-contacts.js, page-reports.js, page-settings.js]

الخطوة 4  ← public/inbox-v4/shell.js  — ملف جديد
           [node --check shell.js]

الخطوة 5  ← public/inbox-v4/shell.css — ملف جديد

الخطوة 6  ← public/inbox-v4/index.html — ملف جديد (App Shell)
           [افتح /inbox في المتصفح — تحقق من الـ layout]

الخطوة 7  ← stream.js — إزالة auto-init (سطر واحد)
           [تحقق: SSE يتصل بعد فتح /inbox]

الخطوة 8  ← app.js — إزالة SSE auto-init (سطر واحد)

الخطوة 9  ← dashboard/index.html — استبدال iframe بـ redirect
           [تحقق: زر الرسائل في dashboard يفتح /inbox]

كل خطوة: git commit مستقل
```

---

## التكامل مع المحاور الأخرى

### مع M1 (Permissions)
```javascript
// في shell.js — بعد loadUserInfo():
// يُضاف في Phase 10 عند تنفيذ M1:
const perms = InboxStore.state.currentUser?.permissions || {};

// إخفاء Reports لو مش عنده صلاحية
if (!perms.reports_self && !perms.reports_team && !perms.reports_full) {
  document.querySelector('[data-nav-page="reports"]')?.remove();
}
// إخفاء Settings لو مش admin
if (!perms.org_settings && !perms.inbox_settings && !perms.automation) {
  document.querySelector('[data-nav-page="settings"]')?.remove();
}
```

### مع M2 (Settings)
- `page-settings.js` يستدعي `InboxSettings.init(container, tab)`
- M2 ينفذ `InboxSettings` module مع الـ tabs: `org`, `team`, `channels`, `inbox`, `automation`, `data`
- M3 يوفر الـ container والـ tab param — M2 يوفر المحتوى

### مع M4 (Analytics)
- `page-reports.js` يستدعي `InboxAnalytics.init(container, sub)`
- M4 ينفذ `InboxAnalytics` module مع الـ sub-pages: `overview`, `agents`, `channels`, `labels`, `sla`, `csat`, `automation`
- M3 يوفر الـ container والـ sub param — M4 يوفر المحتوى

### مع M5 (Standalone)
- `public/inbox-v4/index.html` = entry point الـ standalone product
- عند الفصل: فقط تغيير مسار الـ scripts من `/dashboard/inbox-v4/` لـ `/inbox-v4/`
- الـ App Shell نفسه لا يتغير

---

## ما الذي يمكن أن يفشل؟ (Edge Cases)

| الخطر | التفصيل | الحل المحدد |
|---|---|---|
| `req.session.userId` vs `req.session.user` | اسم الـ field في الـ session ممكن يكون مختلف | قبل التنفيذ: `grep -n "session\." server/routes/auth.js` وتأكد من الاسم الصح |
| Script load order | لو script تحمّل قبل ما store يجهز → `InboxStore is not defined` | الترتيب في index.html إلزامي — store.js دايماً أول |
| `InboxStream.init()` يُستدعى مرتين | لو app.js ما اتعدّلش وshell.js كمان يستدعيه | أضف guard: `if (InboxStream._initialized) return;` في بداية `init()` |
| CSS conflict | inbox.css الحالي فيه rules ممكن تتعارض مع shell.css | shell.css يستخدم `.shell-*` prefix حصري — لا تعارض |
| Mobile back button | على موبايل: back من `/inbox/conv/123` للـ `/inbox` | `history.pushState` يتولى ذلك تلقائياً لأننا بنضيف كل navigation للـ history stack |
| `/api/inbox/me` غير موجود | لو الـ endpoint مش موجود في الـ backend | بدّل بـ: `GET /api/inbox/conversations?limit=0` يرجع user info في الـ headers، أو أضف `/api/inbox/me` في `server/routes/inbox/index.js` — سطران فقط |
| conv-list.js + chat.js يستدعوا `document.getElementById` | الـ IDs موجودة في TEMPLATE الـ page-inbox.js | لازم نتأكد إن TEMPLATE يحتوي على كل الـ IDs الموجودة في index.html الحالي قبل قص/لصق |

---

## معيار الإغلاق — متى يكتمل M3؟

✅ `/inbox` يفتح App Shell كامل بدون iframe
✅ الـ Sidebar يظهر بـ 4 أقسام + Inbox Tools
✅ Click على "الرسائل" يعرض الـ 3 أعمدة الحالية
✅ `/inbox/conv/123` يفتح المحادثة مباشرة (Deep Link)
✅ Click على "التقارير" يعرض Analytics
✅ Click على "الإعدادات" يعرض Settings
✅ الـ SSE يبقى متصلاً عند الانتقال بين الصفحات
✅ على موبايل: Bottom Tab Bar يظهر بدل الـ Sidebar
✅ Back button يعمل في كل الصفحات
✅ `dashboard/index.html` — زر الرسائل يفتح `/inbox`
✅ لا regression في الـ inbox الحالي

---

## القرارات الجديدة من المرحلة 2

| # | القرار |
|---|---|
| D-025 | (موجود) `/inbox*` route مستقلة مع auth redirect |
| D-026 | `public/inbox-v4/` مجلد مستقل للـ App Shell — `dashboard/inbox-v4/` يبقى للملفات الحالية |
| D-027 | page modules تُنشأ في `public/inbox-v4/pages/` كـ IIFE objects بـ `mount(container, params)` + `unmount()` |
| D-028 | shell.js يتحكم في ترتيب init: `loadUserInfo → InboxRouter.init → InboxStream.init` |
| D-029 | `InboxStream._initialized` guard يمنع double-init |
| D-030 | CSS Prefix `shell-*` حصري للـ App Shell — لا تعارض مع `iv4-*` الحالي |

---

## الحالة الكاملة للمحور M3

- [x] المرحلة 1: التحليل + التصميم المعماري ✅
- [x] المرحلة 2: خطة التنفيذ التقنية التفصيلية ✅

**M3 مكتمل ✅**

---

> آخر تحديث: 2026-05-04 (المرحلة 2 مكتملة)
