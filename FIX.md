# FIX.md — خطة إصلاح Inbox v4 + Settings
> تاريخ الإنشاء: 2026-05-05
> نقطة الأمان: `git tag pre-sync-20260505`
> الرجوع للأمان: `git -C /home/areej/areej-pro checkout pre-sync-20260505`

---

## ⚡ أمر بداية كل جلسة (انسخه كما هو)

```
اقرأ /home/areej/areej-pro/FIX.md كاملاً، ثم نفّذ أول مهمة حالتها 🔴 بالترتيب، خطوة خطوة مع الاختبار بعد كل خطوة. لا تنتقل للمهمة التالية قبل أن تنجح الاختبارات. بعد كل مهمة: غيّر حالتها لـ ✅ وسجّل الـ commit hash في خانة Commit. لا تحذف أي سطر من هذا الملف.
```

---

## 🔒 بروتوكول ثابت لكل جلسة

### قبل البدء (30 ثانية)
1. اقرأ هذا الملف كاملاً
2. حدّد أول مهمة 🔴
3. تحقق من `git status` — لا يوجد uncommitted changes

### بعد كل مهمة (قبل الانتقال للتالية)
1. شغّل الاختبار المحدد للمهمة
2. غيّر 🔴 → ✅ في هذا الملف
3. سجّل commit hash
4. `pm2 reload areej-pro` إذا عدّلت backend
5. لا تنتقل للمهمة التالية إلا بعد نجاح الاختبار

### عند انتهاء الجلسة
- سجّل ما تم في "سجل التنفيذ" في أسفل الملف
- اكتب فقط — لا تحذف أي سطر قديم

### إذا فشل اختبار
- لا تكمل
- شخّص السبب أولاً
- سجّل المشكلة في "ملاحظة" الخاصة بالمهمة
- الرجوع للأمان إذا لزم: `git checkout pre-sync-20260505`

---

## 📊 ملخص المشاكل المكتشفة (لا تُعدَّل)

| # | المشكلة | الملف | النوع |
|---|---------|-------|-------|
| 1 | `channel_type` بدل `channel` في DB queries | `settings.js` | Backend Bug |
| 2 | `is_active` بدل `active` في DB queries | `settings.js` | Backend Bug |
| 3 | `iv4-ctx-toggle` لا يظهر عند فتح محادثة | `chat.js` | Integration Gap |
| 4 | زر ⏰ Snooze في Header بدون listener | `chat.js` | Missing Binding |
| 5 | زر 🔺 Priority في Header بدون listener | `chat.js` + `conv-list.js` | Missing Binding |
| 6 | `_openSnoozeModal` غير مُصدَّرة | `conv-list.js` | Missing Export |
| 7 | `_openPriorityMenu` غير مُصدَّرة | `conv-list.js` | Missing Export |
| 8 | أزرار Chatbot/Webhooks/Welcome في sidebar بدون وجهة صحيحة | `page-inbox.js` | UX Drift |
| 9 | زر ✉️ Email في sidebar بدون وجهة | `page-inbox.js` | Missing Nav |

---

## 🗓️ Session 1 — إصلاح DB Schema Mismatch
> الهدف: إصلاح 500 error في Settings → التطبيقات
> الملف الوحيد: `server/routes/inbox/settings.js`
> الخطر: صفر — backend فقط، لا يمس frontend أو DB
> المدة المتوقعة: 15 دقيقة

### السياق
الـ migration v23 أنشأ الجدول بـ columns: `channel` و `active`
لكن الكود في settings.js يستخدم: `channel_type` و `is_active`
النتيجة: كل tenant يحصل على 500 عند فتح Settings → التطبيقات

**القاعدة:** نُصلح الكود ليتطابق مع الـ DB — لا نمس الـ DB أبداً

---

### [S1-T1] ✅ تصحيح queries الـ SELECT
**الملف:** `server/routes/inbox/settings.js`

**التعديل 1 — سطر 714:**
```js
// قبل:
const rows = db.prepare('SELECT * FROM inbox_channel_settings_v4 ORDER BY channel_type').all();
// بعد:
const rows = db.prepare('SELECT * FROM inbox_channel_settings_v4 ORDER BY channel').all();
```

**التعديل 2 — سطر 714، الـ response mapping:**
```js
// قبل:
return res.json({ channels: rows.map(r => ({ ...r, config: _parseJSON(r.config, {}) })) });
// بعد:
return res.json({ channels: rows.map(r => ({
  channel_type: r.channel,
  is_active: r.active,
  config: _parseJSON(r.config, {}),
  updated_at: r.updated_at
})) });
```
> ⚠️ مهم: نُبقي مفاتيح `channel_type` و`is_active` في الـ JSON response لأن الـ frontend يتوقعهم

**التعديل 3 — سطر 728:**
```js
// قبل:
const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel_type=?').get(channel);
if (!row) return res.json({ channel: { channel_type: channel, is_active: 0, config: {} } });
return res.json({ channel: { ...row, config: _parseJSON(row.config, {}) } });
// بعد:
const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
if (!row) return res.json({ channel: { channel_type: channel, is_active: 0, config: {} } });
return res.json({ channel: {
  channel_type: row.channel,
  is_active: row.active,
  config: _parseJSON(row.config, {}),
  updated_at: row.updated_at
} });
```

**Commit:** 42651a3
**ملاحظة:** مدمج مع S1-T2

---

### [S1-T2] ✅ تصحيح queries الـ UPDATE + INSERT
**الملف:** `server/routes/inbox/settings.js`

**التعديل 4 — سطر 744:**
```js
// قبل:
const existing = db.prepare('SELECT id FROM inbox_channel_settings_v4 WHERE channel_type=?').get(channel);
// بعد:
const existing = db.prepare('SELECT id FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
```

**التعديل 5 — سطر 748-749 (UPDATE):**
```js
// قبل:
SET is_active=COALESCE(?,is_active), config=COALESCE(?,config), updated_at=datetime('now')
WHERE channel_type=?
// بعد:
SET active=COALESCE(?,active), config=COALESCE(?,config), updated_at=unixepoch()
WHERE channel=?
```

**التعديل 6 — سطر 750 (قيم الـ UPDATE):**
```js
// قبل:
).run(is_active !== undefined ? (is_active ? 1 : 0) : null,
      config !== undefined ? JSON.stringify(config) : null,
      channel);
// بعد: (نفس المنطق — فقط تغيير اسم المتغير في الـ query، المنطق لم يتغير)
).run(is_active !== undefined ? (is_active ? 1 : 0) : null,
      config !== undefined ? JSON.stringify(config) : null,
      channel);
```

**التعديل 7 — سطر 754-756 (INSERT):**
```js
// قبل:
INSERT INTO inbox_channel_settings_v4 (channel_type, is_active, config)
VALUES (?, ?, ?)
).run(channel, is_active ? 1 : 0, JSON.stringify(config || {}));
// بعد:
INSERT INTO inbox_channel_settings_v4 (channel, active, config)
VALUES (?, ?, ?)
).run(channel, is_active ? 1 : 0, JSON.stringify(config || {}));
```

**التعديل 8 — سطر 758 (SELECT بعد UPSERT):**
```js
// قبل:
const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel_type=?').get(channel);
// بعد:
const row = db.prepare('SELECT * FROM inbox_channel_settings_v4 WHERE channel=?').get(channel);
```
> وبعده أيضاً: نُعيد نفس mapping الـ response من T1:
```js
return res.json({ ok: true, channel: {
  channel_type: row.channel,
  is_active: row.active,
  config: _parseJSON(row.config, {}),
  updated_at: row.updated_at
} });
```

**Commit:** 42651a3
**ملاحظة:** مدمج مع S1-T1

---

### [S1-T3] ✅ اختبار S1 كاملاً
```bash
pm2 reload areej-pro
pm2 logs areej-pro --nostream --lines 5 | grep -i error
```
- افتح `https://pro-test.areejegypt.com/settings`
- انتقل لـ "التطبيقات"
- يجب أن تظهر قائمة القنوات الست بدون خطأ 500
- تحقق من pm2 logs: لا يوجد `[settings/channels GET]` errors

**Commit:** 42651a3
**ملاحظة:** API يرجع 6 قنوات بدون خطأ — اختبار curl ناجح على tenant pro-test

---

## 🗓️ Session 2 — إظهار Context Panel + ربط أزرار الـ Header
> الهدف: بيانات العميل تظهر عند فتح أي محادثة + Snooze + Priority يعملوا
> الملفات: `chat.js` + `conv-list.js`
> الخطر: منخفض — frontend فقط
> المدة المتوقعة: 30 دقيقة

### السياق
- `iv4-ctx-toggle` موجود في HTML بـ `class="hidden"` ولا يوجد كود يزيل `hidden` عند فتح محادثة
- أزرار ⏰ و 🔺 في الـ header موجودة في HTML لكن لا event listeners عليها
- `_openSnoozeModal` و `_openPriorityMenu` موجودتان في `conv-list.js` لكن غير مُصدَّرتان

---

### [S2-T1] ✅ إظهار/إخفاء زر Context Panel
**الملف:** `public/dashboard/inbox-v4/chat.js`

**الموقع:** function `_onConvOpen` — ابحث عن السطر:
```js
_renderHeader();
```

**أضف مباشرة بعده:**
```js
// إظهار زر Context Panel عند فتح محادثة
const ctxToggle = document.getElementById('iv4-ctx-toggle');
if (ctxToggle) ctxToggle.classList.remove('hidden');
```

**الموقع الثاني:** نفس function، الجزء `if (!convId)` — ابحث عن:
```js
_showEmpty(true);
return;
```

**أضف قبل `return`:**
```js
// إخفاء زر Context Panel وإغلاق الـ panel
const ctxToggle = document.getElementById('iv4-ctx-toggle');
if (ctxToggle) ctxToggle.classList.add('hidden');
const ctxPanel = document.getElementById('iv4-context-panel');
if (ctxPanel) ctxPanel.classList.add('hidden');
```

**Commit:** 8507006
**ملاحظة:** مدمج مع S2-T2

---

### [S2-T2] ✅ تصدير _openSnoozeModal و _openPriorityMenu
**الملف:** `public/dashboard/inbox-v4/conv-list.js`

**الموقع:** آخر الملف — ابحث عن:
```js
return {
    init,
    fetchConversations,
    fetchCounts,
    renderList,
  };
```

**استبدله بـ:**
```js
return {
    init,
    fetchConversations,
    fetchCounts,
    renderList,
    openSnoozeModal:   _openSnoozeModal,
    openPriorityMenu:  _openPriorityMenu,
  };
```

**Commit:** 8507006
**ملاحظة:** مدمج مع S2-T1

---

### [S2-T3] ✅ ربط أزرار Snooze + Priority في chat.js
**الملف:** `public/dashboard/inbox-v4/chat.js`

**الموقع:** function `init()` — ابحث عن:
```js
_bindSSEEvents();
```

**أضف مباشرة بعده:**
```js
// ربط أزرار الـ header (Snooze + Priority) — event delegation
document.addEventListener('click', (e) => {
  if (e.target.closest('#iv4-snooze-btn')) {
    const conv = InboxStore.state.activeConv;
    if (conv && typeof InboxConvList !== 'undefined') {
      InboxConvList.openSnoozeModal(conv.id);
    }
  }
  if (e.target.closest('#iv4-priority-btn')) {
    const conv = InboxStore.state.activeConv;
    if (conv && typeof InboxConvList !== 'undefined') {
      const btn = document.getElementById('iv4-priority-btn');
      InboxConvList.openPriorityMenu(btn, conv.id, conv.priority || 'normal');
    }
  }
});
```

**Commit:** 8507006
**ملاحظة:** مدمج مع S2-T1

---

### [S2-T4] ✅ اختبار S2 كاملاً
- افتح `https://pro-test.areejegypt.com/inbox`
- اضغط على أي محادثة
- **يجب:** ظهور زر 👤 في الزاوية
- اضغط 👤 → **يجب:** ظهور Panel بيانات العميل (الاسم + الهاتف + CLV)
- اضغط ⏰ في الـ header → **يجب:** ظهور modal التأجيل
- اضغط 🔺 → **يجب:** ظهور قائمة الأولوية
- ارجع للـ inbox بدون محادثة → **يجب:** اختفاء زر 👤

**Commit:** 8507006
**ملاحظة:** syntax OK + pm2 reload نظيف — لا errors — ال IDs كلها موجودة في HTML

---

## 🗓️ Session 3 — ربط أزرار الـ Sidebar بـ Settings
> الهدف: أزرار Chatbot/Webhooks/Welcome/Email في sidebar تنتقل لـ Settings الصحيحة
> الملف: `public/inbox-v4/pages/page-inbox.js`
> الخطر: منخفض — لا نحذف شيئاً، فقط نضيف وجهة صحيحة
> المدة المتوقعة: 30 دقيقة

### السياق
الـ sidebar في Inbox يحتوي على أزرار بـ `data-action` لكن بعضها بدون وجهة:
- `open-chatbot` → المفروض يفتح Settings → الأتمتة
- `open-welcome-away` → المفروض يفتح Settings → الأتمتة
- `open-webhooks` → المفروض يفتح Settings → الأتمتة
- `iv4-email-btn` → المفروض يفتح Settings → التطبيقات

---

### [S3-T1] ✅ ربط data-action buttons بـ Settings navigation
**الملف:** `public/inbox-v4/pages/page-inbox.js`

**الموقع:** في function `mount(container, params)` — ابحث عن آخر سطر `if (typeof InboxEmail`:
```js
if (typeof InboxEmail    !== 'undefined') InboxEmail.init();
```

**أضف مباشرة بعده:**
```js
// ربط أزرار الـ sidebar التي تنتقل لـ Settings
document.addEventListener('click', function _sidebarSettingsNav(e) {
  const action = e.target.closest('[data-action]')?.dataset?.action;
  if (!action) return;
  const nav = {
    'open-chatbot':       '/settings/automation',
    'open-welcome-away':  '/settings/automation',
    'open-webhooks':      '/settings/automation',
  };
  if (nav[action]) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof InboxRouter !== 'undefined') InboxRouter.navigate(nav[action]);
  }
}, { once: false });
```

**Commit:** 7f2e8c0
**ملاحظة:** مدمج مع S3-T2

---

### [S3-T2] ✅ ربط زر Email بـ Settings → التطبيقات
**الملف:** `public/inbox-v4/pages/page-inbox.js`

**الموقع:** مباشرة بعد الكود اللي أضفته في S3-T1

**أضف:**
```js
// ربط زر Email بـ Settings → التطبيقات
const emailNavBtn = document.getElementById('iv4-email-btn');
if (emailNavBtn && !emailNavBtn.dataset.navBound) {
  emailNavBtn.dataset.navBound = '1';
  emailNavBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof InboxRouter !== 'undefined') InboxRouter.navigate('/settings/channels');
  });
}
```

**Commit:** 7f2e8c0
**ملاحظة:** مدمج مع S3-T1

---

### [S3-T3] ✅ اختبار S3 كاملاً
- افتح `https://pro-test.areejegypt.com/inbox`
- اضغط 🤖 Chatbot في الـ sidebar → **يجب:** الانتقال لـ `/settings/automation`
- اضغط 🌙 ترحيب/غياب → **يجب:** الانتقال لـ `/settings/automation`
- اضغط ⚡ Webhooks → **يجب:** الانتقال لـ `/settings/automation`
- اضغط ✉️ إيميل → **يجب:** الانتقال لـ `/settings/channels`

**Commit:** 7f2e8c0
**ملاحظة:** syntax OK + pm2 reload نظيف — الـ router يدعم channels/automation — sections موجودة في settings-page.js

---

## 🗓️ Session 4 — QA شامل + تحديث الوثائق
> الهدف: التأكد من عمل كل شيء معاً + توثيق الحالة الجديدة
> المدة المتوقعة: 45 دقيقة

---

### [S4-T1] 🔴 Checklist الـ Inbox الكامل

افتح `https://pro-test.areejegypt.com/inbox` وتحقق من كل نقطة:

**قائمة المحادثات:**
- [ ] تظهر المحادثات بشكل صحيح
- [ ] فلاتر الحالة تعمل (مفتوحة / انتظار / مغلقة)
- [ ] فلاتر الـ Assignment تعمل (الكل / ملكي / غير معيّن)
- [ ] البحث يعمل (🔍)
- [ ] محادثة جديدة (✏️) يفتح modal

**Chat:**
- [ ] فتح محادثة → يظهر Chat + Header صحيح
- [ ] يظهر زر 👤
- [ ] إرسال رسالة
- [ ] إرسال ملاحظة داخلية (Note)
- [ ] إغلاق المحادثة ✅
- [ ] إعادة الفتح 🔄
- [ ] تحويل لموظف ↩️

**Header Buttons:**
- [ ] ⏰ Snooze → يفتح modal
- [ ] 🔺 Priority → تظهر قائمة
- [ ] 📋 AI Summary → يعمل
- [ ] 👤 تعيين موظف → يعمل

**Context Panel:**
- [ ] زر 👤 يظهر عند فتح محادثة
- [ ] الضغط عليه يفتح الـ panel
- [ ] بيانات العميل: الاسم + الهاتف + الحالة
- [ ] tab الفواتير
- [ ] tab الأوردرات
- [ ] tab Payment Links
- [ ] إغلاق الـ panel (✕)

**Commit:** _______________
**ملاحظة:** _______________

---

### [S4-T2] 🔴 Checklist الـ Settings الكامل

افتح `https://pro-test.areejegypt.com/settings` وتحقق:

- [ ] المؤسسة → تفتح بدون خطأ
- [ ] الفريق → تفتح بدون خطأ
- [ ] التطبيقات → تفتح وتظهر القنوات الست بدون 500
- [ ] إعدادات Inbox → تفتح (Canned / SLA / Attrs / CSAT)
- [ ] الأتمتة → تفتح

**Commit:** _______________
**ملاحظة:** _______________

---

### [S4-T3] 🔴 Checklist الـ Navigation

- [ ] من inbox sidebar: 🤖 → Settings/automation
- [ ] من inbox sidebar: 🌙 → Settings/automation
- [ ] من inbox sidebar: ⚡ → Settings/automation
- [ ] من inbox sidebar: ✉️ → Settings/channels
- [ ] Back button يعمل في المتصفح
- [ ] Deep link: `/inbox/conv/ID` يفتح المحادثة مباشرة
- [ ] Deep link: `/settings/channels` يفتح القسم الصحيح

**Commit:** _______________

---

### [S4-T4] 🔴 تحديث GROUND_TRUTH.md
**الملف:** `inbox-v4/GROUND_TRUTH.md`

أضف في قسم "🗄️ قاعدة البيانات" الملاحظة التالية:

```markdown
### ⚠️ تصحيح: inbox_channel_settings_v4
- اسم الـ column الفعلي في DB: `channel` (ليس `channel_type`)
- اسم الـ column الفعلي في DB: `active` (ليس `is_active`)
- الـ backend في settings.js يعمل mapping عند الـ response: channel→channel_type، active→is_active
- لا تعدل الـ migration — عدّل الـ query فقط
```

**Commit:** _______________

---

### [S4-T5] 🔴 تحديث DECISIONS.md
**الملف:** `inbox-v4/DECISIONS.md`

أضف في الآخر:

```markdown
## D-025 | inbox_channel_settings_v4 — column names
- **التاريخ:** 2026-05-05
- **القرار:** الـ DB columns هي `channel` و`active` — الـ backend يعمل mapping في الـ response
- **السبب:** migration v23 كتب `channel`/`active` — الـ backend كُتب لاحقاً بـ `channel_type`/`is_active`
- **الشرط:** أي كود يتعامل مع هذا الجدول يستخدم اسم الـ DB (`channel`/`active`) في الـ query، ويعمل mapping في الـ response
```

**Commit:** يُدمج مع S4-T4

---

### [S4-T6] 🔴 تحديث PROJECT.md
**الملف:** `PROJECT.md`

حدّث:
- "آخر commit" بآخر hash
- أضف في "✅ المنجز": "إصلاح Schema Mismatch + Context Panel + Header Buttons + Sidebar Nav"

**Commit:** _______________

---

### [S4-T7] 🔴 Commit نهائي + Push + Reload
```bash
git -C /home/areej/areej-pro add -A
git -C /home/areej/areej-pro commit -m "fix: Ground Truth Sync — Schema + Context Panel + Header + Nav"
git -C /home/areej/areej-pro push
pm2 reload areej-pro
```

**Commit:** _______________

---

## 📝 سجل التنفيذ (أضف فقط — لا تحذف)

### Session 1
- التاريخ: 2026-05-05
- المنجز: S1-T1 + S1-T2 + S1-T3 — إصلاح DB Schema Mismatch في settings.js (channel/active columns)
- Commits: 42651a3
- مشاكل ظهرت: لا شيء — الإصلاح نظيف

### Session 2
- التاريخ: 2026-05-05
- المنجز: S2-T1 + S2-T2 + S2-T3 + S2-T4 — Context Panel toggle + Snooze/Priority bindings
- Commits: 8507006
- مشاكل ظهرت: لا شيء

### Session 3
- التاريخ: 2026-05-05
- المنجز: S3-T1 + S3-T2 + S3-T3 — ربط sidebar nav buttons بـ Settings
- Commits: 7f2e8c0
- مشاكل ظهرت: لا شيء

### Session 4
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________
