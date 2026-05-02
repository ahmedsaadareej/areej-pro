# 📋 PROJECT.md — مرجع مشروع Areej Pro
> **قاعدة ذهبية:** هذا الملف يُحدَّث بعد كل خطوة بدون استثناء.
> أي جلسة جديدة تبدأ بقراءة هذا الملف أولاً قبل أي شيء.
> آخر تحديث: 2026-05-02 09:24 UTC (جلسة ثانية)

---

## 🧭 أمر استئناف أي جلسة جديدة

```
اقرأ /home/areej/areej-pro/PROJECT.md كامل، ثم أخبرني:
1. ما آخر خطوة تمت؟
2. ما الخطوة التالية حسب الخطة؟
3. هل تحتاج أي معلومات إضافية قبل البدء؟

تذكر: بعد كل خطوة تنفذها، حدّث PROJECT.md فوراً.
```

---

## 🎯 الرؤية الكاملة للمشروع (من أحمد مباشرة)

### المشكلة التي يحلّها Areej Pro:
أحمد كان يشتغل على أكثر من نظام في نفس الوقت:
- **دفترة** (ERP): حسابات، مخزون، مبيعات، مشتريات، HR
- **Respond.io**: إدارة قنوات التواصل الاجتماعي (WhatsApp, Messenger, Instagram)

**المشكلة الجوهرية:** لا يوجد ربط بين الأنظمة.
- لما بيكلم عميل على WhatsApp → مش شايف تاريخه أو فواتيره أو أوامر شغله
- عشان يبعت فاتورة → لازم يفتح نظام تاني، يحملها، يبعتها يدوياً
- الموظفين بيردوا على WhatsApp بدون ما يشوفوا أي سياق عن العميل

### الحل = Areej Pro:
نظام واحد متكامل يجمع:
1. **ERP** — مبيعات، مخزون، حسابات، HR
2. **CRM** — إدارة العملاء والعلاقات
3. **Inbox** — إدارة كل قنوات التواصل الاجتماعي
4. **منصة بيع** — متجر إلكتروني
5. **منصة موردين** — عرض وشراء من الموردين
6. **منصة دفع** — استقبال وإرسال مدفوعات
7. **منصة تعليمية** — محتوى، موردين، مصانع، أخبار الصناعة

### ما يجعله فريداً:
- **موجّه لصناعة بعينها** (ملابس + طباعة) — مش نظام عام
- **كل شيء في مكان واحد** — لا تنقل بين برامج
- **مناسب لكل الأحجام** — من فرد لـ 20+ موظف

---

## 👥 العملاء المستهدفون

### الفئة الأساسية:
- أصحاب محلات ملابس وطباعة في مصر
- من يعمل في صناعة الملابس أو طباعة الملابس
- عملاء أونلاين صغار (بيبيعوا من البيت / إنستجرام)

### حجم الفريق:
- **صغير:** 1-3 موظفين (الغالبية)
- **متوسط:** 5-10 موظفين
- **كبير:** 20+ موظف

### استراتيجية اكتساب العملاء (Lead Magnet):
- PDF/كتاب مجاني: "كيف تبدأ براند ملابس من الصفر"
  - مصادر تيشرتات، أنواع طباعة، أنواع قماش
  - أسماء موردين ومصانع
  - خطوات عملية للمبتدئ
- العميل يسجل باسمه ورقمه → يحمل الدليل
- بعدها: يتحول لاشتراك مدفوع في Areej Pro

### نموذج التحويل:
المشاكل التي يواجهها العميل بعد القراءة:
- مش عارف ربحه كام (يحتاج ERP)
- مش عارف يتواصل مع عملاه (يحتاج Inbox + CRM)
- مش عارف يدير إعلاناته (يحتاج Content module)
- مش عارف يجيب موردين (يحتاج Supplier platform)

---

## 💰 نظام الباقات (سيتحدد التسعير لاحقاً)

### المستويات المقترحة:

| الباقة | المستهدف | الميزات الرئيسية |
|---|---|---|
| **Starter** | فرد / 1-3 موظفين | Inbox + CRM أساسي + فواتير |
| **Growth** | 5-10 موظفين | Starter + أتمتة + تقارير + API |
| **Pro** | 20+ موظف | Growth + موردين + تعليم + كل شيء |

> ملاحظة: التسعير الفعلي سيتحدد بعد اكتمال النظام.

---

## 🔑 الـ Pain Points الحقيقية (أولوية التطوير)

### ترتيب حسب الأهمية لأحمد:
1. **ربط الرسائل بسياق العميل** — لما موظف بيرد، يشوف الفواتير والأوردرات فوراً
2. **إرسال فاتورة من داخل المحادثة** — بضغطة واحدة
3. **صلاحيات منفصلة للـ Inbox** — نوعان: users النظام + agents الرسائل
4. **تتبع أوامر الشغل** — من استلام الطلب للتسليم والدفع
5. **Onboarding wizard** — لما عميل يسجل، يعرف يبدأ فين

---

## 🏗️ البنية التقنية

| العنصر | التفاصيل |
|---|---|
| **السيرفر** | Ubuntu 24.04 — AMD EPYC 4 cores — 15GB RAM — 150GB |
| **المسار** | `/home/areej/areej-pro/` |
| **Backend** | Node.js + Express + SQLite (better-sqlite3) |
| **Frontend** | HTML/CSS/JS — no framework |
| **DB** | Multi-tenant: `data/master.db` + `data/tenants/*.db` |
| **Process** | PM2 — `areej-pro` (id: 1) على port 3002 |
| **Reverse Proxy** | Caddy → `/etc/caddy/Caddyfile` |
| **Domains** | `pro.areejegypt.com` (prod) + `pro-test.areejegypt.com` (test) |

### الملفات الرئيسية للـ Inbox:
```
server/routes/inbox.js            ← Backend كامل (2400+ سطر)
server/routes-inbox-webhook.js    ← Webhooks الواردة
server/routes/team-settings.js    ← إعدادات الفريق والتوزيع
server/whatsapp-qr-service.js     ← خدمة WhatsApp QR (Baileys)
server/inbox-distributor.js       ← توزيع المحادثات التلقائي
public/dashboard/js/inbox.js      ← Frontend كامل (3300+ سطر)
public/dashboard/css/inbox-v2.css ← CSS الجديد (1006 سطر)
public/dashboard/index.html       ← HTML الرئيسي (4694 سطر)
```

---

## 📊 قاعدة البيانات — Inbox Tables

```sql
inbox_conversations       -- المحادثات (platform, sender, status, assigned_to_id)
inbox_messages            -- الرسائل (direction in/out, media_url, file_id)
inbox_settings            -- إعدادات المنصات (tokens, active flags)
inbox_labels              -- التسميات الملوّنة
inbox_conversation_labels -- ربط محادثات بتسميات
inbox_notes               -- ملاحظات داخلية على المحادثات
inbox_templates           -- الردود الجاهزة
inbox_keywords            -- ردود تلقائية بالكلمات المفتاحية
inbox_broadcasts          -- حملات الإرسال الجماعي
inbox_chatbot_flows       -- شجرة الشات بوت
inbox_drip_campaigns      -- حملات Drip التلقائية
inbox_agent_status        -- حالة كل موظف (online/offline)
inbox_team_members        -- أعضاء الفرق
```

---

## 🔌 المنصات المدعومة

| المنصة | الحالة | الملاحظات |
|---|---|---|
| Telegram | ✅ شغّال | Bot Token في inbox_settings |
| WhatsApp QR | ✅ شغّال | Baileys — session per user |
| WhatsApp API | ⚠️ جزئي | 360dialog / Meta — يحتاج token |
| Facebook Messenger | ⚠️ جزئي | Meta webhook موجود |
| Instagram DM | ⚠️ جزئي | Meta webhook موجود |

---

## ✅ ما تم إنجازه (جلسة 2026-05-01)

- [x] دراسة الباكب الكامل وفهم المنظومة
- [x] إنشاء workspace + SECRETS.md + system-overview.md
- [x] ربط GitHub repos (areej-shop, areej-pro, areej-payment, areej-website)
- [x] إصلاح SSL 525 لـ shop, pay, pro + إضافة pro-test في Caddyfile
- [x] دراسة كاملة للكود (inbox backend + frontend)
- [x] إنشاء inbox-v2.css (1006 سطر) — تصميم جديد
- [x] استبدال HTML قسم الـ inbox بـ v2 layout (3 أعمدة)
- [x] تحديث renderInboxConvList + setInboxFilter + switchInboxPlatform
- [x] تحديث contact panel helpers
- [x] إضافة تاب "🔐 الصلاحيات" + Permissions UI كامل
- [x] إضافة POST /api/system/inbox/user-perms endpoint
- [x] إضافة PROJECT.md كمرجع دائم

## ✅ ما تم إنجازه (جلسة 2026-05-02 — الصبح)

- [x] مراجعة PROJECT.md وتحديثه بالحالة الكاملة
- [x] تأكيد الخطوة التالية: بناء inbox-v3/inbox.js
- [x] الجلسة الجديدة ستبدأ من inbox.js مباشرةً

---

## 🚧 القرار الاستراتيجي الحالي

### إعادة بناء موديول الـ Inbox من الصفر

**السبب:** التعديل على كود قديم يحدّ الناتج. البناء من الصفر يضمن تفوقاً حقيقياً.

**ما يُحتفظ به (Backend):**
- كل API endpoints ✅
- قاعدة البيانات ✅
- منطق webhooks + distributor ✅

**ما يُعاد بناؤه (Frontend):**
- HTML layout جديد كامل
- CSS جديد من الصفر
- JS منظم ومقسّم لملفات

---

## 📋 خطة العمل — Inbox v3 (من الصفر)

### المرحلة 0: البحث والتصميم ✅ مكتملة
- [x] بحث على Respond.io + Wati + ManyChat + Chatwoot
- [x] تحديد الفيتشرز الأفضل من كل منافس
- [x] رسم wireframe للـ layout الجديد (INBOX_V3_DESIGN.md)
- [x] تحديد الفرص التنافسية

**الفرص المحددة على المنافسين:**
- Customer Context (فواتير+أوردرات+ذمم) داخل الـ inbox — مفيش عند أي منافس
- إرسال فاتورة + رابط دفع بضغطة واحدة — حصري
- ERP + CRM + Inbox في نظام واحد — مفيش في العالم
- Arabic-first + موجّه لصناعة الملابس — كل المنافسين generic
- نأخذ من Respond.io: Lifecycle view
- نأخذ من Chatwoot: Private Notes + @mentions
- نأخذ من ManyChat: Flow builder بصري سهل

### المرحلة 1: الـ Layout الجديد — جاري
- [x] CSS كامل من الصفر: `public/dashboard/inbox-v3/inbox.css` (1238 سطر)
- [x] HTML skeleton كامل: `public/dashboard/inbox-v3/inbox.html` (375 سطر)
- [x] JS مقسّم لملفات منظمة (7 ملفات، كلها syntax OK):
  - [x] `inbox-v3/inbox-state.js` — الـ State المركزي
  - [x] `inbox-v3/inbox-api.js` — كل الـ API calls
  - [x] `inbox-v3/inbox-conv.js` — قائمة المحادثات + render + فلاتر
  - [x] `inbox-v3/inbox-chat.js` — Chat window + messages + actions
  - [x] `inbox-v3/inbox-reply.js` — Reply box + templates + AI + media
  - [x] `inbox-v3/inbox-context.js` — Contact panel + ERP context + labels + notes
  - [x] `inbox-v3/inbox-init.js` — Init + Polling + Toast + Sound
- [x] دمج في index.html و تفعيل ← **تمّ ✅**
  - [x] إضافة inbox-v3/inbox.css في رأس الصفحة
  - [x] استبدال page-inbox القديم (v2) بـ inbox.html (v3)
  - [x] إضافة الـ 7 JS modules في نهاية index.html
  - [x] pm2 reload — سيرفر شغال بدون errors

- [x] ربط iv3 مع نظام التنقل `sbShowPage` — `iv3OnPageShow/Hide` في inbox.js
- [x] إصلاح inbox-context.js ليتوافق مع IDs الحقيقية في inbox.html
- [x] `iv3OnPageShow` ذكي (init مرة واحدة فقط، polling فقط بعد كدة)
- [x] ربط `iv3ResetContextPanel` مع `iv3ResetChat`
- [x] pm2 reload — سيرفر شغال، inbox v3 يطلب الـ API فعلاً
- [x] كل التغييرات commitية على GitHub

- [x] **إصلاح تعارض Polling** — حذف `loadInbox()` القديم من `showPage` (commit: 92d0504)
- [x] **إصلاح API prefix** — `/api/inbox/` → `/api/system/inbox/` في `inbox-api.js` + `inbox-chat.js` (commit: 2cb0ebe)
- [x] **إصلاح Branding** — `loadAndApplyBranding` تستخدم `apiFetch` مباشرة (commit: 14a7021)
- [x] **إصلاح 401** — `inbox-api.js` يستخدم `apiFetch` (Bearer token) بدل `fetch` المجرد (commit: 00b4406)
- [x] **تأكيد حي من المتصفح (Chromium headless):**
  - `IV3._initialized: true` ✅
  - `IV3.pollTimer: شغّال` ✅
  - `/api/system/inbox/me` → `{ok:true, isOwner:true}` ✅
  - `/api/system/inbox/conversations` → `{ok:true, conversations:[]}` ✅

- [x] **إصلاح inbox-context.js** — endpoint صح (`/api/crm/contacts/by-phone` + `/api/system/invoices`) + apiFetch + جلب فواتير العميل
- [x] **إصلاح inbox-chat.js** — حقول DB صح (content/sent_at/media_type) + حذف → إغلاق
- [x] **إصلاح inbox-reply.js** — حقول متوافقة (content/sent_at) + templates تستخدم name بدل title
- [x] **cache-busting** لكل الملفات المعدّلة

- [x] **فحص inbox.html** — كل IDs متطابقة مع JS ✔️
- [x] **iv3ToggleVoice stub** — زر ميكروفون شغّال (قيد التطوير)
- [x] **iv3UpdateCharCount** — دالة عد الحروف مربوطة بالـ textarea
- [x] **اختبار حي (Chromium headless)** — UI يظهر صح، 3 panels، لا errors جديدة

**الخطوة التالية (تحتاج تدخّل أحمد):** ربط WhatsApp QR بـ pro-test وإرسال رسالة تجريبية لاختبار العرض الكامل

### المرحلة 2: الـ Core Features
- [ ] عرض المحادثات مع فلترة وبحث
- [ ] فتح محادثة + عرض الرسائل
- [ ] الرد النصي + الميديا
- [ ] سياق العميل (فواتير + أوردرات) في real-time

### المرحلة 3: الـ Power Features
- [ ] إرسال فاتورة بضغطة واحدة من المحادثة
- [ ] ملاحظات داخلية (Internal Notes)
- [ ] Labels ملوّنة
- [ ] تعيين لموظف + Queue
- [ ] Keyboard shortcuts

### المرحلة 4: الـ Automation
- [ ] ردود جاهزة (Templates) بـ slash command
- [ ] AI reply suggestions
- [ ] Auto-assign rules
- [ ] Chatbot flows

### المرحلة 5: الإدارة والتقارير
- [ ] Inbox Permissions UI (موجود جزئياً)
- [ ] Analytics dashboard
- [ ] CSAT
- [ ] Broadcast

### المرحلة 6: Onboarding Wizard
- [ ] خطوات ترحيبية لأي عميل جديد يسجل
- [ ] ربط أول قناة تواصل
- [ ] إضافة أول عميل CRM
- [ ] إرسال أول رسالة

---

## 🔧 أوامر مهمة

```bash
# Deploy آمن
cd /home/areej/areej-pro && pm2 reload areej-pro

# Syntax check قبل deploy
node --check server/routes/inbox.js

# مشاهدة اللوج
pm2 logs areej-pro --lines 50

# نسخة احتياطية
cd /home/areej/areej-pro && ./scripts/deploy.sh "وصف التغيير"
```

---

## ⚠️ قواعد العمل المتفق عليها

1. **PROJECT.md يُحدَّث بعد كل خطوة** — بدون استثناء
2. **كل جلسة جديدة تبدأ بقراءة PROJECT.md**
3. **Syntax check قبل كل deploy**
4. **الأسرار في SECRETS.md فقط** — لا تكتب tokens في الكود
5. **القاعدة الذهبية (3 أماكن):** سيرفر + GitHub + Cloudflare
6. **pro-test.areejegypt.com** للاختبار — لا تكسر pro.areejegypt.com
7. **الـ 29 عميل الحاليين** تجريبيون فقط — لا يوجد عملاء حقيقيون بعد
