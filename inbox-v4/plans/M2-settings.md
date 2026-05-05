# M2 — Settings (إعادة الهيكلة الكاملة)
> الحالة: ✅ مكتمل (المرحلتان 1 و 2)
> تاريخ الجلسة: 2026-05-04
> المحور: M2 من Phase 9

---

## القرارات المتفق عليها

| السؤال | القرار |
|---|---|
| هيكل الـ Settings | صفحة كاملة مستقلة (مش modal) |
| Canned Responses | جدول جديد `inbox_canned_responses_v4` |
| SLA | Policies متعددة (`inbox_sla_policies_v4`) |
| Custom Attributes | نوعان منفصلان: Conversation + Contact |
| Business Hours | تؤثر على 3: SLA calculation + Away trigger + Agent status |
| Channels في Settings | إعدادات متوسطة (Modal عادي يكفي) |

---

## 1. ماذا نبني؟

صفحة Settings كاملة مستقلة تحل محل الإعدادات المبعثرة في `inbox_settings`
(جدول واحد بـ 30 column) وتنظمها في 5 أقسام:

```
Settings Page
├── 🏢 المؤسسة          ← tenant_profile + Business Hours
├── 👥 الفريق           ← M1 (inbox_users + inbox_roles)
├── 🔌 التطبيقات        ← القنوات + التكاملات
├── 📬 الـ Inbox         ← Labels + Canned + Attrs + SLA + CSAT + Appearance
└── ⚙️ الأتمتة          ← Automation موجود + Chatbot (صفحة كاملة)
```

---

## 2. لماذا هكذا؟

| القرار | السبب |
|---|---|
| صفحة كاملة بدل modal | Settings كثيرة ومعقدة — modal ضيق ويضيع المستخدم |
| فصل `inbox_settings` | جدول واحد بـ 30 column = impossible to extend + يخلط channels مع SLA مع appearance |
| `inbox_canned_responses_v4` جدول جديد | `inbox_templates` موجود لكن بدون categories + shortcuts — يُبنى من الصفر |
| SLA Policies متعددة | `sla_minutes=120` في inbox_settings = single value لا يكفي لـ priority-based SLA |
| Custom Attrs نوعان | `inbox_contact_attrs` الحالي = conversation attrs فقط (اسمه مضلل) — نفصل الاثنين |
| Business Hours جدول موجود | `inbox_work_hours` موجود بالفعل (7 rows) — نُنشئ v4 مستقل مع timezone |

---

## 3. كيف يُبنى؟

### 3.1 — قاعدة البيانات (Migrations)

#### Migration M2_001 — `inbox_canned_responses_v4`
**الملف:** `server/migrations/inbox-v4/M2_001_canned_responses.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_canned_responses_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shortcut     TEXT NOT NULL UNIQUE,   -- مثال: /hello, /refund
  name         TEXT NOT NULL,          -- اسم وصفي
  content      TEXT NOT NULL,          -- نص الرد
  category     TEXT DEFAULT 'عام',
  platforms    TEXT DEFAULT '[]',      -- JSON array: [] = الكل
  created_by   INTEGER,                -- inbox_user_id
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_canned_shortcut ON inbox_canned_responses_v4(shortcut);
CREATE INDEX IF NOT EXISTS idx_canned_category ON inbox_canned_responses_v4(category);
```

#### Migration M2_002 — `inbox_sla_policies_v4`
**الملف:** `server/migrations/inbox-v4/M2_002_sla_policies.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_sla_policies_v4 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  is_default       INTEGER DEFAULT 0,     -- 1 = تطبق لو ما في policy معينة
  priority         TEXT DEFAULT 'all',    -- all | urgent | high | normal | low
  first_response   INTEGER NOT NULL,      -- بالدقائق
  resolution_time  INTEGER NOT NULL,      -- بالدقائق
  business_hours   INTEGER DEFAULT 1,     -- 1 = يحسب بساعات العمل فقط
  escalate_agent   INTEGER DEFAULT 0,     -- 1 = ينبّه لو انتهك
  created_at       TEXT DEFAULT (datetime('now'))
);

-- Seed: policy افتراضية تحل محل sla_minutes=120
INSERT INTO inbox_sla_policies_v4
  (name, is_default, priority, first_response, resolution_time, business_hours)
VALUES ('الافتراضي', 1, 'all', 120, 480, 1);
```

#### Migration M2_003 — `inbox_custom_attrs_v4` + `inbox_attr_values_v4`
**الملف:** `server/migrations/inbox-v4/M2_003_custom_attrs.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_custom_attrs_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_type    TEXT NOT NULL CHECK(attr_type IN ('conversation','contact')),
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  field_type   TEXT DEFAULT 'text',     -- text | number | select | date | checkbox
  options      TEXT DEFAULT '[]',       -- JSON: للـ select فقط
  required     INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_attr_type_key
  ON inbox_custom_attrs_v4(attr_type, key);

CREATE TABLE IF NOT EXISTS inbox_attr_values_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_id      INTEGER NOT NULL REFERENCES inbox_custom_attrs_v4(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL CHECK(entity_type IN ('conversation','contact')),
  entity_id    INTEGER NOT NULL,
  value        TEXT,
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attr_values_entity
  ON inbox_attr_values_v4(attr_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_attr_values_lookup
  ON inbox_attr_values_v4(entity_type, entity_id);
```

#### Migration M2_004 — `inbox_appearance_v4`
**الملف:** `server/migrations/inbox-v4/M2_004_appearance.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_appearance_v4 (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  density      TEXT DEFAULT 'comfy',    -- comfy | compact
  font_size    TEXT DEFAULT 'medium',   -- small | medium | large
  show_avatar  INTEGER DEFAULT 1,
  updated_at   TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO inbox_appearance_v4 (id) VALUES (1);
```

#### Migration M2_005 — `inbox_business_hours_v4` + `inbox_business_days_v4`
**الملف:** `server/migrations/inbox-v4/M2_005_business_hours.js`

```sql
-- لا نمس inbox_work_hours (v3) — نُنشئ جدول مستقل
CREATE TABLE IF NOT EXISTS inbox_business_hours_v4 (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  timezone     TEXT DEFAULT 'Africa/Cairo',
  active       INTEGER DEFAULT 0,       -- 0 = دايماً متاح
  updated_at   TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO inbox_business_hours_v4 (id) VALUES (1);

CREATE TABLE IF NOT EXISTS inbox_business_days_v4 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week  INTEGER NOT NULL,        -- 0=أحد ... 6=سبت
  is_working   INTEGER DEFAULT 1,
  start_time   TEXT DEFAULT '09:00',
  end_time     TEXT DEFAULT '17:00'
);
INSERT OR IGNORE INTO inbox_business_days_v4 (day_of_week, is_working) VALUES
  (0,0),(1,1),(2,1),(3,1),(4,1),(5,1),(6,0);
```

#### Migration M2_006 — `inbox_csat_settings_v4`
**الملف:** `server/migrations/inbox-v4/M2_006_csat_settings.js`

```sql
CREATE TABLE IF NOT EXISTS inbox_csat_settings_v4 (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  enabled         INTEGER DEFAULT 0,
  trigger         TEXT DEFAULT 'on_close',  -- on_close | manual
  delay_minutes   INTEGER DEFAULT 0,
  message         TEXT DEFAULT 'كيف كانت تجربتك معنا؟',
  scale           INTEGER DEFAULT 5,        -- 3 أو 5 نجوم
  updated_at      TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO inbox_csat_settings_v4 (id) VALUES (1);
```

---

### 3.2 — الـ Backend

#### الملفات المتأثرة

```
server/
├── migrations/inbox-v4/
│   ├── M2_001_canned_responses.js     ← جديد
│   ├── M2_002_sla_policies.js         ← جديد
│   ├── M2_003_custom_attrs.js         ← جديد
│   ├── M2_004_appearance.js           ← جديد
│   ├── M2_005_business_hours.js       ← جديد
│   └── M2_006_csat_settings.js        ← جديد
└── routes/inbox/
    └── settings.js                    ← تعديل: إضافة M2 routes (M1 كتب الـ shell)
```

#### APIs الكاملة في `settings.js`

```
// ─── قسم المؤسسة ────────────────────────────────────────
GET    /inbox/settings/org
PUT    /inbox/settings/org                    requirePermission('org_settings')
GET    /inbox/settings/business-hours
PUT    /inbox/settings/business-hours         requirePermission('org_settings')

// ─── قسم التطبيقات (القنوات) ────────────────────────────
GET    /inbox/settings/channels               requirePermission('channels')
GET    /inbox/settings/channels/:channel      requirePermission('channels')
PUT    /inbox/settings/channels/:channel      requirePermission('channels')
POST   /inbox/settings/channels/:channel/test requirePermission('channels')

// ─── Canned Responses ───────────────────────────────────
GET    /inbox/settings/canned                 (كل الموظفين)
GET    /inbox/settings/canned/search?q=       (كل الموظفين — للـ reply box)
POST   /inbox/settings/canned                 requirePermission('inbox_settings')
PUT    /inbox/settings/canned/:id             requirePermission('inbox_settings')
DELETE /inbox/settings/canned/:id             requirePermission('inbox_settings')

// ─── Custom Attributes ──────────────────────────────────
GET    /inbox/settings/attrs/:type            requirePermission('inbox_settings')
POST   /inbox/settings/attrs/:type            requirePermission('inbox_settings')
PUT    /inbox/settings/attrs/:type/:id        requirePermission('inbox_settings')
DELETE /inbox/settings/attrs/:type/:id        requirePermission('inbox_settings')
PUT    /inbox/settings/attrs/:type/reorder    requirePermission('inbox_settings')

// ─── SLA Policies ───────────────────────────────────────
GET    /inbox/settings/sla                    requirePermission('inbox_settings')
POST   /inbox/settings/sla                    requirePermission('inbox_settings')
PUT    /inbox/settings/sla/:id                requirePermission('inbox_settings')
DELETE /inbox/settings/sla/:id                requirePermission('inbox_settings')
PUT    /inbox/settings/sla/:id/set-default    requirePermission('inbox_settings')

// ─── CSAT ───────────────────────────────────────────────
GET    /inbox/settings/csat                   requirePermission('inbox_settings')
PUT    /inbox/settings/csat                   requirePermission('inbox_settings')

// ─── Appearance ─────────────────────────────────────────
GET    /inbox/settings/appearance             (كل الموظفين)
PUT    /inbox/settings/appearance             (كل الموظفين — per-user لاحقاً)
```

#### قواعد Backend مهمة

```javascript
// Business Hours helper — يُستدعى من 3 أماكن
// server/routes/inbox/utils/business-hours.js
function isBusinessHour(db, timestamp = Date.now()) {
  const bh = db.prepare('SELECT * FROM inbox_business_hours_v4 WHERE id=1').get();
  if (!bh || !bh.active) return true; // دايماً متاح لو غير مفعّل
  const days = db.prepare('SELECT * FROM inbox_business_days_v4').all();
  const now = new Date(new Intl.DateTimeFormat('en', {
    timeZone: bh.timezone,
    hour12: false, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  }).format(timestamp));
  // ... فحص اليوم + الوقت
}

// يُستدعى من:
// 1. conversations.js → SLA breach calculation
// 2. automation.js → away message trigger (يحل محل away_start/away_end)
// 3. team.js → auto-away على login خارج الدوام

// SLA: fallback للكود القديم
function getSlaPolicy(db, priority) {
  let policy = db.prepare(
    'SELECT * FROM inbox_sla_policies_v4 WHERE priority=? OR priority="all" ORDER BY priority!="all" DESC LIMIT 1'
  ).get(priority);
  if (!policy) {
    // fallback لـ inbox_settings.sla_minutes القديم
    const old = db.prepare('SELECT sla_minutes FROM inbox_settings WHERE id=1').get();
    policy = { first_response: old?.sla_minutes || 120, resolution_time: 480, business_hours: 1 };
  }
  return policy;
}

// Channels PUT — PATCH-style (لا يمسح config قديم)
router.put('/settings/channels/:channel', requirePermission('channels'), (req, res) => {
  const allowed = ['whatsapp_api','whatsapp_qr','telegram','instagram','messenger','email'];
  if (!allowed.includes(req.params.channel)) return res.status(400).json({error:'invalid channel'});
  // يُحدّث inbox_settings المفاتيح المناسبة فقط
});

// SLA DELETE — يرفض حذف الـ default
router.delete('/settings/sla/:id', requirePermission('inbox_settings'), (req,res) => {
  const policy = req.db.prepare('SELECT * FROM inbox_sla_policies_v4 WHERE id=?').get(req.params.id);
  if (!policy) return res.status(404).json({error:'غير موجود'});
  if (policy.is_default) return res.status(400).json({error:'لا يمكن حذف السياسة الافتراضية — عيّن أخرى أولاً'});
});
```

---

### 3.3 — الـ Frontend

#### الملفات الجديدة

```
public/dashboard/inbox-v4/
├── settings/
│   ├── settings-page.js    ← shell رئيسي (tabs + routing داخلي)
│   ├── org.js              ← قسم المؤسسة + Business Hours
│   ├── channels.js         ← قسم التطبيقات (القنوات + Modals)
│   ├── inbox-settings.js   ← Labels + Canned + Attrs + SLA + CSAT + Appearance
│   └── automation-hub.js   ← روابط للأتمتة الموجودة + زر Chatbot
├── index.html              ← إضافة script tags + ⚙️ في sidebar
└── app.js                  ← إضافة navigateToSettings + navigateToInbox
```

#### Settings Page Navigation

```javascript
// في app.js
InboxStore.navigateToSettings = function(section = 'org') {
  document.getElementById('iv4-root').classList.add('iv4-settings-mode');
  InboxSettings.open(section);
};

InboxStore.navigateToInbox = function() {
  document.getElementById('iv4-root').classList.remove('iv4-settings-mode');
  InboxSettings.close();
};

// Route Guard قبل الفتح (من M1)
function openSettings(section) {
  const hasAny = ['org_settings','team_manage','channels','inbox_settings','automation']
    .some(k => InboxStore.can(k));
  if (!hasAny) return InboxStore.showToast('ليس لديك صلاحية', 'error');
  InboxStore.navigateToSettings(section);
}
```

#### CSS Mode

```css
/* في inbox.css */
.iv4-root.iv4-settings-mode .iv4-sidebar,
.iv4-root.iv4-settings-mode .iv4-conv-col,
.iv4-root.iv4-settings-mode .iv4-chat-col { display: none; }

.iv4-root.iv4-settings-mode #iv4-settings-page {
  display: flex;
  width: 100%;
  height: 100vh;
}

#iv4-settings-page {
  display: none;    /* مخفي افتراضياً */
  flex-direction: row;
}

/* Sidebar للـ Settings */
.iv4-settings-nav {
  width: 220px;
  border-left: 1px solid var(--iv4-border);
  padding: 16px 0;
}

/* محتوى القسم */
.iv4-settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}
```

#### هيكل الـ Settings Page (HTML)

```html
<!-- يُضاف في index.html قبل إغلاق #iv4-root -->
<div id="iv4-settings-page">
  <!-- Sidebar -->
  <nav class="iv4-settings-nav">
    <div class="iv4-settings-back">
      <button id="iv4-settings-back-btn">← الـ Inbox</button>
    </div>
    <div class="iv4-settings-nav-title">الإعدادات</div>
    <button class="iv4-settings-nav-item active" data-section="org">🏢 المؤسسة</button>
    <button class="iv4-settings-nav-item" data-section="team">👥 الفريق</button>
    <button class="iv4-settings-nav-item" data-section="channels">🔌 التطبيقات</button>
    <button class="iv4-settings-nav-item" data-section="inbox">📬 الـ Inbox</button>
    <button class="iv4-settings-nav-item" data-section="automation">⚙️ الأتمتة</button>
  </nav>
  <!-- Content -->
  <div class="iv4-settings-content" id="iv4-settings-content">
    <!-- تُحمَّل ديناميكياً بـ settings-page.js -->
  </div>
</div>

<!-- زر الإعدادات في الـ Sidebar الأصلي (يُضاف قبل iv4-sidebar-spacer) -->
<button class="iv4-nav-btn" data-action="open-settings" title="الإعدادات">
  <span class="iv4-nav-icon">⚙️</span>
  <span class="iv4-nav-label">الإعدادات</span>
</button>
```

#### Script Tags (تُضاف في index.html)

```html
<script src="settings/settings-page.js?v=1"></script>
<script src="settings/org.js?v=1"></script>
<script src="settings/channels.js?v=1"></script>
<script src="settings/inbox-settings.js?v=1"></script>
<script src="settings/automation-hub.js?v=1"></script>
```

#### InboxAPI — إضافة settings namespace

```javascript
// في api.js
InboxAPI.settings = {
  // Org
  getOrg:       () => _get('/inbox/settings/org'),
  updateOrg:    (d) => _put('/inbox/settings/org', d),
  getHours:     () => _get('/inbox/settings/business-hours'),
  updateHours:  (d) => _put('/inbox/settings/business-hours', d),

  // Channels
  getChannels:  () => _get('/inbox/settings/channels'),
  getChannel:   (ch) => _get(`/inbox/settings/channels/${ch}`),
  updateChannel:(ch,d) => _put(`/inbox/settings/channels/${ch}`, d),
  testChannel:  (ch,d) => _post(`/inbox/settings/channels/${ch}/test`, d),

  // Canned
  getCanned:    (cat) => _get('/inbox/settings/canned' + (cat?`?category=${cat}`:'')),
  cannedSearch: (q)   => _get(`/inbox/settings/canned/search?q=${encodeURIComponent(q)}`),
  createCanned: (d)   => _post('/inbox/settings/canned', d),
  updateCanned: (id,d)=> _put(`/inbox/settings/canned/${id}`, d),
  deleteCanned: (id)  => _delete(`/inbox/settings/canned/${id}`),

  // Custom Attrs
  getAttrs:     (type)    => _get(`/inbox/settings/attrs/${type}`),
  createAttr:   (type,d)  => _post(`/inbox/settings/attrs/${type}`, d),
  updateAttr:   (type,id,d)=> _put(`/inbox/settings/attrs/${type}/${id}`, d),
  deleteAttr:   (type,id) => _delete(`/inbox/settings/attrs/${type}/${id}`),
  reorderAttrs: (type,d)  => _put(`/inbox/settings/attrs/${type}/reorder`, d),

  // SLA
  getSLAPolicies:  () => _get('/inbox/settings/sla'),
  createSLA:       (d)=> _post('/inbox/settings/sla', d),
  updateSLA:       (id,d)=> _put(`/inbox/settings/sla/${id}`, d),
  deleteSLA:       (id)=> _delete(`/inbox/settings/sla/${id}`),
  setDefaultSLA:   (id)=> _put(`/inbox/settings/sla/${id}/set-default`, {}),

  // CSAT
  getCSAT:      () => _get('/inbox/settings/csat'),
  updateCSAT:   (d)=> _put('/inbox/settings/csat', d),

  // Appearance
  getAppearance:   () => _get('/inbox/settings/appearance'),
  updateAppearance:(d)=> _put('/inbox/settings/appearance', d),
};
```

#### Canned Responses — ربط بـ Reply Box (في reply.js)

```javascript
// trigger "/" في الـ textarea
textarea.addEventListener('input', async e => {
  const val = e.target.value;
  const slashIdx = val.lastIndexOf('/');
  if (slashIdx !== -1 && slashIdx === val.length - 1 - (val.length - slashIdx - 1)) {
    const query = val.slice(slashIdx + 1);
    if (query.length >= 0) {
      const results = await InboxAPI.settings.cannedSearch(query);
      _showCannedDropdown(results, slashIdx);
    }
  } else {
    _hideCannedDropdown();
  }
});

function _showCannedDropdown(items, slashIdx) {
  // dropdown يظهر فوق الـ textarea
  // عند الاختيار → يستبدل النص من slashIdx للنهاية بـ item.content
}
```

---

## 4. ما الذي يمكن أن يفشل؟

| الخطر | السيناريو | الحل |
|---|---|---|
| **inbox_settings تعارض** | channels PUT يعدّل لكن inbox_settings لا يزال يُقرأ من v3 code | PATCH-style: يكتب على inbox_settings نفسه — backward compatible |
| **SLA migration vs sla_minutes** | الكود القديم في conversations.js يقرأ sla_minutes | `getSlaPolicy()` helper مع fallback لـ sla_minutes القديم |
| **Business Hours timezone** | المستخدم اختار timezone غلط → away لا تشتغل | تحقق من الـ timezone بـ `Intl.supportedValuesOf('timeZone')` قبل الحفظ |
| **Canned shortcut conflict** | موظفان يضيفان /hello بالتوازي | UNIQUE constraint على shortcut + 409 response |
| **Custom Attrs حذف وعنده values** | حذف field وفيه بيانات محفوظة | CASCADE DELETE في الـ FK — يحذف القيم تلقائياً |
| **Settings Page navigation** | Back في المتصفح وهو في Settings | popstate listener يُزيل `iv4-settings-mode` |
| **Appearance لا تُطبَّق فوراً** | User يغيّر density → يحتاج reload | تطبيق CSS class على iv4-root مباشرة بدون reload |
| **SLA حذف الـ default** | المستخدم يحذف الـ policy الوحيدة | Backend يرفض: must set-default لأخرى أولاً |

---

## 5. كيف يتكامل مع المحاور الأخرى؟

| المحور | نقطة التلامس |
|---|---|
| **M1 — Permissions** | قسم "الفريق" يستخدم roles.js + users.js من M1. كل route لها requirePermission المناسب |
| **M3 — Navigation** | زر ⚙️ في Sidebar (M3) يفتح Settings Page. الـ 3-column يختفي بـ iv4-settings-mode |
| **M4 — Analytics** | إعدادات CSAT هنا تتحكم في متى تُرسل. Business Hours تؤثر على حساب SLA في التقارير |
| **M5 — Standalone** | كل جداول M2 prefixed بـ inbox_ — جاهزة للفصل. inbox_business_hours_v4 مستقلة عن inbox_work_hours |
| **Automation موجودة** | قسم الأتمتة = روابط للـ overlays الموجودة + زر Chatbot يفتح chatbot.js الكاملة |
| **Reply Box** | reply.js يستخدم "/" trigger للبحث في inbox_canned_responses_v4 عبر InboxAPI.settings.cannedSearch() |
| **conversations.js** | isBusinessHour() helper جديد يُستدعى من SLA calculation |

---

## ✅ Checklist إغلاق M2

- [x] ماذا نبني؟ — صفحة Settings كاملة: 5 أقسام + 6 جداول جديدة
- [x] لماذا هكذا؟ — inbox_settings جدول مكتظ، كل قرار موثق
- [x] كيف يُبنى؟ — 6 migrations + APIs + Frontend files + CSS mode + api.js namespace
- [x] ما الذي يمكن أن يفشل؟ — 8 edge cases مع حلول
- [x] كيف يتكامل مع الباقي؟ — M1/M3/M4/M5 + reply.js + conversations.js
