# EX-M2 — تنفيذ M2: Settings (إعادة الهيكلة)
> المرجع: `inbox-v4/plans/M2-settings.md`
> المهام: T31 → T50 (20 مهمة)
> المتطلب: M1 + M5 + M3 مكتملة
> آخر تحديث: 2026-05-04

---

## 📋 حالة المهام

| # | المهمة | النوع | الحالة |
|---|--------|-------|--------|
| T31 | Migration: `inbox_canned_responses_v4` | DB | ⏳ |
| T32 | Migration: `inbox_sla_policies_v4` | DB | ⏳ |
| T33 | Migration: `inbox_custom_attrs_v4` + `inbox_attr_values_v4` | DB | ⏳ |
| T34 | Migration: `inbox_appearance_v4` | DB | ⏳ |
| T35 | Migration: `inbox_business_hours_v4` + `inbox_business_days_v4` | DB | ⏳ |
| T36 | Migration: `inbox_csat_settings_v4` | DB | ⏳ |
| T37 | `settings.js` — Org + Business Hours API | Backend | ⏳ |
| T38 | `settings.js` — Canned Responses API | Backend | ⏳ |
| T39 | `settings.js` — Custom Attrs API | Backend | ⏳ |
| T40 | `settings.js` — SLA Policies API | Backend | ⏳ |
| T41 | `settings.js` — CSAT + Appearance + Channels API | Backend | ⏳ |
| T42 | `api.js` — settings namespace | Frontend | ⏳ |
| T43 | `settings/settings-page.js` — Shell الرئيسي | Frontend | ⏳ |
| T44 | `settings/org.js` | Frontend | ⏳ |
| T45 | `settings/channels.js` | Frontend | ⏳ |
| T46 | `settings/inbox-settings.js` | Frontend | ⏳ |
| T47 | `settings/automation-hub.js` | Frontend | ⏳ |
| T48 | `reply.js` — Canned Responses trigger | Frontend | ⏳ |
| T49 | `context.js` — Custom Attrs display | Frontend | ⏳ |
| T50 | Business Hours ربط SLA + Away | Backend | ⏳ |

---

## 🗺️ ترتيب التنفيذ في M2

```
Migrations (T31→T36) → Backend APIs (T37→T41) → Frontend Shell (T42→T43)
→ Frontend Sub-sections (T44→T47) → Integrations (T48→T50)
```

---

## 🏗️ المرحلة الأولى — DB Migrations (T31 → T36)

> كل migration = ملف مستقل + commit مستقل.

---

### ▶️ T31 — Migration: `inbox_canned_responses_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_001_canned_responses.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_canned_responses_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shortcut    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'عام',
  platforms   TEXT DEFAULT '[]',  -- JSON array: ['whatsapp','telegram']
  created_by  INTEGER,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_canned_shortcut ON inbox_canned_responses_v4(shortcut);
CREATE INDEX IF NOT EXISTS idx_canned_category ON inbox_canned_responses_v4(category);
```

**تحقق قبل commit:**
```bash
node --check server/migrations/inbox-v4/M2_001_canned_responses.js
sqlite3 /path/to/db.sqlite "PRAGMA table_info(inbox_canned_responses_v4);"
# تأكد UNIQUE على shortcut
```

---

### ▶️ T32 — Migration: `inbox_sla_policies_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_002_sla_policies.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_sla_policies_v4 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  is_default       INTEGER NOT NULL DEFAULT 0,
  priority         TEXT DEFAULT 'all',  -- 'all'|'urgent'|'high'|'medium'|'low'
  first_response   INTEGER NOT NULL DEFAULT 120,   -- بالدقائق
  resolution_time  INTEGER NOT NULL DEFAULT 480,   -- بالدقائق
  business_hours   INTEGER NOT NULL DEFAULT 0,     -- 0=24h, 1=business only
  escalate_agent   INTEGER DEFAULT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- Seed: policy افتراضية إلزامي
INSERT OR IGNORE INTO inbox_sla_policies_v4
  (id, name, is_default, priority, first_response, resolution_time)
  VALUES (1, 'الافتراضية', 1, 'all', 120, 480);
```

**⚠️ الـ Seed إلزامي:** `getSlaPolicy()` ستفشل إذا لم يكن فيه سياسة افتراضية.

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "SELECT * FROM inbox_sla_policies_v4;"
# يجب أن يُعيد صف واحد بـ is_default=1
```

---

### ▶️ T33 — Migration: `inbox_custom_attrs_v4` + `inbox_attr_values_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_003_custom_attrs.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_custom_attrs_v4 (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_type  TEXT NOT NULL CHECK(attr_type IN ('conversation','contact')),
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',  -- text|number|select|date|checkbox
  options    TEXT DEFAULT '[]',  -- JSON array للـ select type
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_attrs_key ON inbox_custom_attrs_v4(attr_type, key);

CREATE TABLE IF NOT EXISTS inbox_attr_values_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  attr_id     INTEGER NOT NULL REFERENCES inbox_custom_attrs_v4(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('conversation','contact')),
  entity_id   INTEGER NOT NULL,
  value       TEXT,
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attr_values_unique
  ON inbox_attr_values_v4(attr_id, entity_id);
```

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "PRAGMA table_info(inbox_attr_values_v4);"
# تأكد UNIQUE على (attr_id, entity_id)
```

---

### ▶️ T34 — Migration: `inbox_appearance_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_004_appearance.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_appearance_v4 (
  id        INTEGER PRIMARY KEY DEFAULT 1,
  density   TEXT DEFAULT 'comfy' CHECK(density IN ('comfy','compact')),
  font_size INTEGER DEFAULT 14,
  show_avatar INTEGER DEFAULT 1
);
INSERT OR IGNORE INTO inbox_appearance_v4 (id) VALUES (1);
```

**ملاحظة:** id=1 دايماً — جدول إعدادات singleton.

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "SELECT * FROM inbox_appearance_v4;"
# يجب أن يُعيد صف واحد بـ id=1
```

---

### ▶️ T35 — Migration: `inbox_business_hours_v4` + `inbox_business_days_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_005_business_hours.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_business_hours_v4 (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  timezone TEXT DEFAULT 'Africa/Cairo',
  active   INTEGER DEFAULT 0  -- 0=disabled (24/7), 1=enabled
);
INSERT OR IGNORE INTO inbox_business_hours_v4 (id) VALUES (1);

CREATE TABLE IF NOT EXISTS inbox_business_days_v4 (
  day_of_week INTEGER PRIMARY KEY,  -- 0=الأحد, 6=السبت
  is_working  INTEGER DEFAULT 1,
  start_time  TEXT DEFAULT '09:00',
  end_time    TEXT DEFAULT '17:00'
);

-- Seed: 7 أيام
INSERT OR IGNORE INTO inbox_business_days_v4 (day_of_week, is_working) VALUES
  (0, 0),  -- الأحد: عطلة
  (1, 1),  -- الاثنين
  (2, 1),  -- الثلاثاء
  (3, 1),  -- الأربعاء
  (4, 1),  -- الخميس
  (5, 1),  -- الجمعة
  (6, 0);  -- السبت: عطلة
```

**⚠️ تنبيه:** لا تمس `inbox_work_hours` القديم إن وُجد.

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "SELECT COUNT(*) FROM inbox_business_days_v4;"
# يجب أن يُعيد: 7
```

---

### ▶️ T36 — Migration: `inbox_csat_settings_v4`

**الملف الجديد:**
```
server/migrations/inbox-v4/M2_006_csat_settings.js
```

**الـ SQL:**
```sql
CREATE TABLE IF NOT EXISTS inbox_csat_settings_v4 (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  enabled         INTEGER DEFAULT 0,
  trigger         TEXT DEFAULT 'on_close' CHECK(trigger IN ('on_close','on_resolve','manual')),
  delay_minutes   INTEGER DEFAULT 0,
  message         TEXT DEFAULT 'كيف كانت تجربتك معنا؟',
  scale           INTEGER DEFAULT 5 CHECK(scale IN (3, 5, 10))
);
INSERT OR IGNORE INTO inbox_csat_settings_v4 (id) VALUES (1);
```

**تحقق قبل commit:**
```bash
sqlite3 /path/to/db.sqlite "SELECT * FROM inbox_csat_settings_v4;"
# يجب أن يُعيد صف واحد
```

---

## 🔧 المرحلة الثانية — Backend APIs (T37 → T41)

> كلها تعديلات على نفس الملف `server/routes/inbox/settings.js` — كل تعديل = commit مستقل.

---

### ▶️ T37 — Backend: Org + Business Hours API

**الملف المعدَّل:**
```
server/routes/inbox/settings.js
```

**Helper جديد في `server/routes/inbox/utils/business-hours.js`:**
```javascript
async function isBusinessHour(db, timestamp) {
  const config = await db.get('SELECT * FROM inbox_business_hours_v4 WHERE id=1');
  if (!config || !config.active) return true;  // 24/7 بالافتراضي

  const date = new Date(timestamp);
  // تحويل للـ timezone المحدد (Africa/Cairo)
  const dayOfWeek = date.getDay();
  const dayConfig = await db.get(
    'SELECT * FROM inbox_business_days_v4 WHERE day_of_week=?', [dayOfWeek]
  );
  if (!dayConfig || !dayConfig.is_working) return false;

  const timeStr = date.toTimeString().slice(0, 5);  // HH:MM
  return timeStr >= dayConfig.start_time && timeStr < dayConfig.end_time;
}
module.exports = { isBusinessHour };
```

**الـ Routes المضافة لـ settings.js:**
```
GET /inbox/settings/org                    ← جلب tenant_profile
PUT /inbox/settings/org                    ← requirePermission('org_settings')
GET /inbox/settings/business-hours         ← جلب الإعدادات + الأيام
PUT /inbox/settings/business-hours         ← requirePermission('org_settings')
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/settings.js
node --check server/routes/inbox/utils/business-hours.js
curl http://localhost:3002/api/inbox/settings/org -H "Cookie: <session>"
# يجب أن يُعيد بيانات الشركة
```

---

### ▶️ T38 — Backend: Canned Responses API

**الملف المعدَّل:**
```
server/routes/inbox/settings.js
```

**الـ Routes المضافة:**
```
GET    /inbox/settings/canned              ← كل الموظفين
GET    /inbox/settings/canned/search?q=   ← بحث سريع
POST   /inbox/settings/canned             ← requirePermission('inbox_settings')
PUT    /inbox/settings/canned/:id         ← requirePermission('inbox_settings')
DELETE /inbox/settings/canned/:id         ← requirePermission('inbox_settings')
```

**ملاحظة search:** `WHERE shortcut LIKE ? OR content LIKE ?` مع `'%' + q + '%'`

**تحقق قبل commit:**
```bash
# أضف رد بـ shortcut '/test'
# GET /settings/canned/search?q=/ → يُعيد الرد
```

---

### ▶️ T39 — Backend: Custom Attrs API

**الملف المعدَّل:**
```
server/routes/inbox/settings.js
```

**الـ Routes المضافة:**
```
GET    /inbox/settings/attrs/:type         ← type = conversation | contact
POST   /inbox/settings/attrs/:type         ← requirePermission('inbox_settings')
PUT    /inbox/settings/attrs/:type/:id     ← requirePermission('inbox_settings')
DELETE /inbox/settings/attrs/:type/:id     ← requirePermission('inbox_settings')
PUT    /inbox/settings/attrs/:type/reorder ← تحديث sort_order (array of {id, sort_order})
```

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/settings.js
curl http://localhost:3002/api/inbox/settings/attrs/conversation
# يجب أن يُعيد: []
```

---

### ▶️ T40 — Backend: SLA Policies API

**الملف المعدَّل:**
```
server/routes/inbox/settings.js
```

**الـ Routes المضافة:**
```
GET    /inbox/settings/sla                 ← كل السياسات
POST   /inbox/settings/sla                 ← requirePermission('inbox_settings')
PUT    /inbox/settings/sla/:id             ← requirePermission('inbox_settings')
DELETE /inbox/settings/sla/:id             ← يرفض is_default=1 (400)
PUT    /inbox/settings/sla/:id/set-default ← يُصفر الكل ثم يُعين الجديد
```

**تحقق قبل commit:**
```bash
# محاولة DELETE على is_default=1 → يجب أن يُعيد 400
```

---

### ▶️ T41 — Backend: CSAT + Appearance + Channels API

**الملف المعدَّل:**
```
server/routes/inbox/settings.js
```

**الـ Routes المضافة:**
```
GET    /inbox/settings/csat                ← requirePermission('inbox_settings')
PUT    /inbox/settings/csat                ← requirePermission('inbox_settings')
GET    /inbox/settings/appearance          ← مفتوح لكل الموظفين
PUT    /inbox/settings/appearance          ← مفتوح لكل الموظفين
GET    /inbox/settings/channels            ← requirePermission('channels')
GET    /inbox/settings/channels/:channel   ← requirePermission('channels')
PUT    /inbox/settings/channels/:channel   ← requirePermission('channels')
POST   /inbox/settings/channels/:channel/test ← requirePermission('channels')
```

**Channels المسموحة:** `['whatsapp_api','whatsapp_qr','telegram','instagram','messenger','email']`

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/settings.js
curl http://localhost:3002/api/inbox/settings/appearance
# يجب أن يُعيد: { density: 'comfy', font_size: 14, show_avatar: 1 }
```

---

## 🎨 المرحلة الثالثة — Frontend (T42 → T47)

---

### ▶️ T42 — Frontend: `api.js` — settings namespace

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/api.js
```

**التعديلات — إضافة كائن جديد:**

```javascript
InboxAPI.settings = {
  getOrg: () => InboxAPI.get('/inbox/settings/org'),
  updateOrg: (data) => InboxAPI.put('/inbox/settings/org', data),
  getHours: () => InboxAPI.get('/inbox/settings/business-hours'),
  updateHours: (data) => InboxAPI.put('/inbox/settings/business-hours', data),

  getCanned: () => InboxAPI.get('/inbox/settings/canned'),
  searchCanned: (q) => InboxAPI.get(`/inbox/settings/canned/search?q=${encodeURIComponent(q)}`),
  createCanned: (data) => InboxAPI.post('/inbox/settings/canned', data),
  updateCanned: (id, data) => InboxAPI.put(`/inbox/settings/canned/${id}`, data),
  deleteCanned: (id) => InboxAPI.delete(`/inbox/settings/canned/${id}`),

  getAttrs: (type) => InboxAPI.get(`/inbox/settings/attrs/${type}`),
  createAttr: (type, data) => InboxAPI.post(`/inbox/settings/attrs/${type}`, data),
  updateAttr: (type, id, data) => InboxAPI.put(`/inbox/settings/attrs/${type}/${id}`, data),
  deleteAttr: (type, id) => InboxAPI.delete(`/inbox/settings/attrs/${type}/${id}`),
  reorderAttrs: (type, order) => InboxAPI.put(`/inbox/settings/attrs/${type}/reorder`, order),

  getSLA: () => InboxAPI.get('/inbox/settings/sla'),
  createSLA: (data) => InboxAPI.post('/inbox/settings/sla', data),
  updateSLA: (id, data) => InboxAPI.put(`/inbox/settings/sla/${id}`, data),
  deleteSLA: (id) => InboxAPI.delete(`/inbox/settings/sla/${id}`),
  setDefaultSLA: (id) => InboxAPI.put(`/inbox/settings/sla/${id}/set-default`),

  getCSAT: () => InboxAPI.get('/inbox/settings/csat'),
  updateCSAT: (data) => InboxAPI.put('/inbox/settings/csat', data),
  getAppearance: () => InboxAPI.get('/inbox/settings/appearance'),
  updateAppearance: (data) => InboxAPI.put('/inbox/settings/appearance', data),

  getChannels: () => InboxAPI.get('/inbox/settings/channels'),
  getChannel: (ch) => InboxAPI.get(`/inbox/settings/channels/${ch}`),
  updateChannel: (ch, data) => InboxAPI.put(`/inbox/settings/channels/${ch}`, data),
  testChannel: (ch) => InboxAPI.post(`/inbox/settings/channels/${ch}/test`),
};
```

**تحقق قبل commit:**
```bash
# في Console:
InboxAPI.settings.getAppearance  // موجود كـ function
```

---

### ▶️ T43 — Frontend: `settings/settings-page.js` — Shell الرئيسي

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/settings-page.js
```

**الهيكل الأساسي:**

```javascript
const InboxSettings = {
  sections: [
    { id: 'org',        label: 'المؤسسة',    perm: 'org_settings',   module: () => SettingsOrg },
    { id: 'team',       label: 'الفريق',     perm: 'team_manage',    module: () => SettingsTeam },
    { id: 'channels',   label: 'التطبيقات',  perm: 'channels',       module: () => SettingsChannels },
    { id: 'inbox',      label: 'الـ Inbox',  perm: 'inbox_settings', module: () => SettingsInbox },
    { id: 'automation', label: 'الأتمتة',    perm: null,             module: () => SettingsAutomation },
  ],

  mount(container, { section }) {
    // 1. رسم Sidebar الأقسام (مع إخفاء ما ليس له صلاحية)
    // 2. تحميل القسم المطلوب
    this._loadSection(container, section || 'org');
  },

  _loadSection(container, sectionId) {
    const sec = this.sections.find(s => s.id === sectionId);
    if (!sec) return;
    // Permission check
    if (sec.perm && !InboxStore.can(sec.perm)) {
      container.innerHTML = '<p>ليس لديك صلاحية لعرض هذا القسم</p>';
      return;
    }
    const mod = sec.module();
    mod.mount(document.getElementById('settings-content'), {});
  },

  unmount() {}
};
```

**تحقق قبل commit:**
```bash
# /settings → Sidebar يظهر بـ 5 أقسام
# Agent لا يرى قسم المؤسسة
```

---

### ▶️ T44 — Frontend: `settings/org.js`

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/org.js
```

**يحتوي على:**
- **بيانات المؤسسة:** نموذج اسم الشركة + timezone picker
- **Business Hours:**
  - toggle تفعيل/تعطيل
  - لكل يوم: checkbox (working/off) + start time + end time
  - حفظ → `InboxAPI.settings.updateHours()`

**تحقق قبل commit:**
```bash
# تعديل timezone → يُحفظ
# تعطيل يوم الجمعة → يُحفظ
```

---

### ▶️ T45 — Frontend: `settings/channels.js`

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/channels.js
```

**يحتوي على:**
- شبكة كروت: WhatsApp API / WhatsApp QR / Telegram / Instagram / Messenger / Email
- كل كرت يعرض: حالة الاتصال (connected/disconnected) + زر تعديل
- زر تعديل → Modal بحقول إعدادات القناة (Token, Webhook URL, ...)
- زر "اختبار الاتصال" → `InboxAPI.settings.testChannel(channel)`

**تحقق قبل commit:**
```bash
# تعديل Telegram token → يُحفظ
# زر اختبار الاتصال → يُعيد نتيجة
```

---

### ▶️ T46 — Frontend: `settings/inbox-settings.js`

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/inbox-settings.js
```

**6 sub-sections بـ tabs:**

| Tab | المحتوى |
|-----|---------|
| Labels | قايمة Labels + إضافة + تعديل اللون |
| Canned Responses | قايمة + إضافة (shortcut + content + category) |
| Custom Attrs | conversation attrs + contact attrs بـ sub-tabs |
| SLA | قايمة السياسات + إنشاء + تعيين default |
| CSAT | تفعيل + رسالة + scale + trigger |
| Appearance | density (comfy/compact) + font size |

**تحقق قبل commit:**
```bash
# إضافة canned بـ shortcut '/test' → يظهر في القايمة
# تغيير density لـ compact → يُحفظ
```

---

### ▶️ T47 — Frontend: `settings/automation-hub.js`

**الملف الجديد:**
```
public/dashboard/inbox-v4/settings/automation-hub.js
```

**يحتوي على (روابط فقط — لا إعادة بناء):**
- "إدارة قواعد الأتمتة" → فتح الـ Automation modal الموجود
- "إعداد رسالة الترحيب / الغياب" → فتح الـ modal الموجود
- "إدارة الـ Webhooks" → فتح الـ modal الموجود
- "Chatbot Builder" → `InboxRouter.navigate('/inbox/chatbot')`

**تحقق قبل commit:**
```bash
# كل الروابط تفتح الـ features الصح
```

---

## 🔗 المرحلة الرابعة — Integrations (T48 → T50)

---

### ▶️ T48 — Frontend: `reply.js` — Canned Responses trigger

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/reply.js
```

**التعديلات:**

```javascript
// في حدث input/keyup على reply textarea:
const text = textarea.value;
if (text.startsWith('/') && text.length > 1) {
  const results = await InboxAPI.settings.searchCanned(text.slice(1));
  showCannedDropdown(results);
} else {
  hideCannedDropdown();
}

// عند النقر على نتيجة:
function onCannedSelect(canned) {
  textarea.value = canned.content;
  hideCannedDropdown();
  textarea.focus();
}
```

**تحقق قبل commit:**
```bash
# اكتب '/hello' في reply box → dropdown يظهر
# النقر على نتيجة → يُدرج النص في reply box
```

---

### ▶️ T49 — Frontend: `context.js` — Custom Attrs display

**الملف المعدَّل:**
```
public/dashboard/inbox-v4/context.js
```

**التعديلات:**
- عند فتح محادثة → جلب `inbox_custom_attrs_v4` (conversation + contact)
- جلب قيمها من `inbox_attr_values_v4` للـ entity الحالية
- عرضها في Context Panel مع labels
- Save → PUT `/api/inbox/attrs/value` (endpoint يُضاف في T39)

**تحقق قبل commit:**
```bash
# أضف custom attr من نوع 'conversation' من Settings
# افتح محادثة → الـ attr يظهر في Context Panel
```

---

### ▶️ T50 — Backend: Business Hours ربط SLA + Away

**الملفات المعدَّلة:**

**1. `server/routes/inbox/conversations.js`:**
```javascript
// في getSlaPolicy() أو عند حساب SLA breach:
const { isBusinessHour } = require('./utils/business-hours');
// ...
const inBusiness = await isBusinessHour(req.db, Date.now());
if (!inBusiness && policy.business_hours === 1) {
  // لا تحسب الـ breach خارج أوقات العمل
  return;
}
```

**2. `server/routes/inbox/automation.js`:**
```javascript
// استبدال away_start/away_end القديم:
const { isBusinessHour } = require('./utils/business-hours');
// في trigger الـ away message:
const inBusiness = await isBusinessHour(req.db, Date.now());
if (!inBusiness) {
  // أرسل رسالة الغياب
  await sendAwayMessage(conversation);
}
```

**⚠️ تنبيه:** كل ملف = commit مستقل.

**تحقق قبل commit:**
```bash
node --check server/routes/inbox/conversations.js
node --check server/routes/inbox/automation.js
# اختبر: خارج أوقات العمل → رسالة الغياب تُرسل
```

---

## ✅ معيار إغلاق M2

قبل الانتقال لـ M4، تأكد من كل ما يلي:

- [ ] `SELECT COUNT(*) FROM inbox_sla_policies_v4` ≥ 1 (الـ default موجود)
- [ ] `SELECT COUNT(*) FROM inbox_business_days_v4` = 7
- [ ] `SELECT id FROM inbox_appearance_v4` = 1
- [ ] `node --check` نجح على settings.js وكل الـ utils
- [ ] `InboxAPI.settings.getAppearance()` يُعيد البيانات
- [ ] الـ 5 أقسام تظهر في `/settings`
- [ ] كتابة "/" في reply box يعرض Canned Responses
- [ ] Custom Attr يظهر في Context Panel
- [ ] git log يظهر commit لكل خطوة

---

## 🔗 الخطوة التالية بعد M2

**→ انتقل إلى:** `inbox-v4/execution/EX-M4-analytics.md`
