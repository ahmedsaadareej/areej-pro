# 📋 PROJECT.md — مرجع مشروع Areej Pro
> **قاعدة ذهبية:** هذا الملف يُحدَّث بعد كل خطوة بدون استثناء.
> أي جلسة جديدة تبدأ بقراءة هذا الملف أولاً قبل أي شيء.
> آخر تحديث: 2026-05-02 17:21 UTC

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

## 🎯 الرؤية الكاملة للمشروع

### المشكلة التي يحلّها Areej Pro:
أحمد يعمل بنظامين منفصلين:
- **دفترة** (ERP): حسابات، مخزون، مبيعات، مشتريات، HR
- **Respond.io**: إدارة قنوات التواصل (WhatsApp, Messenger, Instagram)

**المشكلة الجوهرية:** لا ربط بين الأنظمة.

### الحل = Areej Pro:
نظام واحد يجمع: ERP + CRM + Inbox + متجر + موردين + دفع + تعليم
موجّه لصناعة الملابس والطباعة في مصر — Arabic-first — من فرد لـ 20+ موظف

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
| **Git** | GitHub: areej-pro repo — branch: main |

### اعتبارات السيرفر:
- لا تشغّل builds ثقيلة وقت الذروة
- استخدم `pm2 reload areej-pro` للـ deploy (لا restart)
- `pro-test.areejegypt.com` للاختبار فقط — لا تكسر prod

---

## 📁 هيكل ملفات الـ Inbox v3

```
public/dashboard/inbox-v3/
├── inbox-state.js      ← IV3 object — الـ State المركزي
├── inbox-api.js        ← IV3_API object — كل الـ API calls
├── inbox-conv.js       ← قائمة المحادثات + render + فلاتر
├── inbox-chat.js       ← Chat window + messages + header actions
├── inbox-reply.js      ← Reply box + templates + AI + media + voice
├── inbox-context.js    ← Context Panel + ERP + labels + notes
├── inbox-init.js       ← Init + Polling + Toast + Sound
└── inbox.css           ← CSS كامل

public/dashboard/js/
├── inbox.js            ← showPage routing + legacy functions (3300+ سطر)
├── inbox-settings.js   ← إعدادات الرسائل (554 سطر)
└── core.js             ← apiFetch + NAV_PERM_MAP + auth

public/dashboard/index.html  ← المصدر الوحيد للـ HTML (4700+ سطر)
  ↳ page-inbox              ← سطر ~2237
  ↳ page-inbox-settings     ← سطر ~2992
  ↳ inboxSettingsModal      ← legacy مخفي (display:none!important)

server/routes/inbox.js       ← Backend كامل (2400+ سطر، 116 endpoint)
```

### قواعد الكود:
- **`apiFetch(url, opts)`** في `core.js` — تُضيف Bearer تلقائاً وترجع JSON مباشرة
- **`IV3_API`** لكل calls، لا تكتب `fetch` مباشرة في ملفات أخرى
- **`IV3.activeConvId`** هو الـ state الأساسي — تحقق منه قبل أي action
- **`iv3Toast(msg, type)`** للإشعارات — type: success/error/info/warning
- **`index.html` هو المصدر** — `inbox.html` مجرد reference، أي تعديل يكون في index.html

---

## 📊 Schema الـ Inbox

```sql
inbox_conversations  (id, platform, sender_id, sender_name, status, assigned_to_id, unread_count, last_message_at)
inbox_messages       (id, conversation_id, direction, content, sent_at, media_url, media_type, is_note, status)
inbox_notes          (id, conversation_id, content, author_id, user_name, created_at)
inbox_templates      (id, name, content)
inbox_labels         (id, name, color)
inbox_settings       (id, telegram_token, telegram_active, welcome_active, welcome_message, away_active, ...)
inbox_keywords       (id, word, reply)
inbox_broadcasts     (id, title, status, sent_count)
inbox_agent_status   (id, user_id, status)
```

---

## 🔌 المنصات المدعومة

| المنصة | الحالة | الملاحظات |
|---|---|---|
| Telegram | ✅ شغّال | Bot Token في inbox_settings |
| WhatsApp QR | ✅ شغّال | Baileys — يحتاج مسح QR من أحمد |
| WhatsApp API | ⚠️ جزئي | 360dialog / Meta — يحتاج token |
| Facebook Messenger | ⚠️ جزئي | Meta webhook موجود |
| Instagram DM | ⚠️ جزئي | Meta webhook موجود |

---

## 💳 مشروع Payment Gateway — White-Label SaaS

### القرارات المعمارية المتفق عليها (2026-05-02):

1. **areej-payment لا يُلمس** — يبقى مشروع أحمد الخاص كما هو
2. **منطق الدفع يُعاد كتابته داخل areej-pro** كـ modules مستقلة (Xيار B)
3. **كل Tenant عنده credentials خاصة** في جدول `payment_gateways` في tenant DB
4. **صفحة الدفع White-Label** على نفس subdomain الـ tenant:
   `{slug}.areejegypt.com/pay/{token}`
5. **الـ tenant_profile موجود فعلاً** ويحتوي: `company_name`, `logo_url`, `brand_color`
6. **جدول payment_links موجود فعلاً** في tenant DB — سيُستخدم مباشرة
7. **نوعان من روابط الدفع:**
   - رابط حر: `invoice_id = NULL` + مبلغ محدد أو مفتوح (عربون / مقدم)
   - رابط فاتورة: `invoice_id = X` + مبلغ ثابت → يُحدّث الفاتورة بعد الدفع
8. **البوابات المدعومة:** Fawaterk + Paymob + InstaPay (قابل للتوسع)
9. **كل tenant يختار بوابته** من صفحة إعدادات الدفع في dashboard

### Schema الجديد:
```sql
-- في كل tenant DB (lazy migration)
payment_gateways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_name TEXT NOT NULL,   -- 'fawaterk' | 'paymob' | 'instapay' | ...
  display_name TEXT,
  enabled INTEGER DEFAULT 0,
  credentials_json TEXT,        -- مشفّر بـ AES
  config_json TEXT,             -- integration IDs وإعدادات إضافية
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)

-- payment_links موجود فعلاً — تعديل بسيط:
-- invoice_id = NULL → رابط حر
-- amount = NULL → العميل يحدد المبلغ
```

### خطة ACUs المتبقية:
| # | المهمة | الملفات | الحالة |
|---|---|---|---|
| **ACU-1** | جدول `payment_gateways` + route CRUD كامل | `server/routes/payment-gateways.js` + `app.js` | ✅ commit 99750a2 |
| **ACU-2** | صفحة إعدادات بوابات الدفع في dashboard | `index.html` + route | ✅ |
| **ACU-3** | Gateway modules (Fawaterk + Paymob) + route `/pay/:token` + صفحة White-Label | modules جديدة + route | ✅ |
| **ACU-4** | زر "رابط دفع" في Inbox → token → يُرسل في المحادثة | `inbox-context.js` | ✅ commit ef3211f |
| **ACU-5** | زر "إرسال للدفع" في الفواتير + تحديث status بعد الدفع | `invoices.js` | ✅ commit f7a854b |
| **ACU-A** | ربط بوابات الدفع بالخزنة + العمولة (نسبة + ثابتة) | `payment-gateways.js` + `index.html` | ✅ commit 99750a2 |
| **ACU-B** | `handlePaymentSuccess()` — دورة حياة كاملة بعد الدفع | `pay.js` | ✅ commit 897fa80 |
| **ACU-C** | `conversation_id` في `payment_links` — ربط الإشعارات | `inbox.js` + `inbox-context.js` + `inbox-api.js` | ✅ commit e6d7c1d |

---

## ✅ ما تم إنجازه حتى الآن (2026-05-02)

### Inbox v3 — البنية الكاملة
- [x] CSS كامل (inbox.css — 1328+ سطر)
- [x] JS مقسّم 7 ملفات — كلها syntax OK وموجودة في index.html
- [x] 3-panel layout (محادثات + chat + context) شغّال ✅
- [x] Polling كل 8 ثواني شغّال ✅
- [x] API calls كلها مع Bearer token ✅

### Inbox v3 — الـ Features المكتملة
- [x] قائمة المحادثات مع فلترة (منصة / حالة / موظف / بحث)
- [x] Infinite scroll + Skeleton loading
- [x] Unread badges + Title badge
- [x] فتح محادثة + تحميل رسائل
- [x] Bubbles (in/out) + فاصل يومي + Media rendering
- [x] Lightbox للصور
- [x] Tick status (✓ ✓✓ 🔵 ✗)
- [x] Internal Notes (🔒) في الرسائل
- [x] تغيير حالة المحادثة (open/waiting/closed)
- [x] تعيين لموظف
- [x] Labels — عرض في القائمة
- [x] Context Panel — CRM data (رصيد + فواتير + أوردرات)
- [x] Notes Panel — إضافة + حذف + عرض
- [x] Voice Recording — MediaRecorder + رفع + إرسال
- [x] Slash command `/` لفتح Templates
- [x] AI suggestions
- [x] إرفاق ملفات مع preview
- [x] Internal Notes mode في صندوق الرد
- [x] إرسال فاتورة من المحادثة
- [x] Quick actions (ملف عميل / فاتورة / أوردر جديد)
- [x] Sound toggle
- [x] Toast notifications
- [x] Quote/Reply على رسالة محددة — commit bbe54f7
- [x] Snooze المحادثة — commit 6920703
- [x] Conversation Timeline — commit f3579d2
- [x] زر "تحويل لأوردر" من المحادثة — commit 5c18915
- [x] Bulk Actions — commit d4b9d94
- [x] Collision Detection — commit 17c91cb
- [x] Keyboard Shortcuts — commit 7b4fec8

### منظومة الدفع (Payment Gateway) — مكتملة ✅
- [x] جدول `payment_gateways` + CRUD + AES encryption — commit 99750a2
- [x] صفحة إعدادات بوابات الدفع في dashboard
- [x] Gateway modules: Fawaterk + Paymob + InstaPay
- [x] صفحة دفع White-Label: `{slug}.areejegypt.com/pay/{token}`
- [x] زر "رابط دفع" في Inbox Context Panel — commit ef3211f
- [x] زر "إرسال للدفع" من صفحة الفواتير — commit f7a854b
- [x] ربط بوابات الدفع بالخزنة + العمولة (نسبة + ثابتة) — commit 99750a2
- [x] `handlePaymentSuccess()`: receivable خصم + خزنة صافي + عمولة مصروف + CRM + inbox — commit 897fa80
- [x] `conversation_id` في `payment_links` — commit e6d7c1d

### إعدادات الرسائل (page-inbox-settings)
- [x] صفحة منفصلة كاملة (مش modal) — شغّالة ✅
- [x] قنوات التواصل: Telegram / WhatsApp QR / Messenger / Instagram
- [x] رسائل تلقائية (ترحيب + خارج أوقات العمل) — شغّالة ✅
- [x] كلمات مفتاحية — شغّالة ✅
- [x] Labels — شغّالة ✅
- [x] ردود جاهزة — شغّالة ✅
- [x] التحليلات — شغّالة (cards + platform breakdown) ✅
- [x] فريق الرد (team-management) — موجود

### Bug Fixes هامة
- [x] `#page-inbox { display:flex }` كان يظهر الـ inbox فوق الإعدادات → تصحيح لـ `#page-inbox.active`
- [x] `page-inbox-settings` ظاهر مع inbox → إضافة `display:none` في inline style
- [x] `showInboxSettings()` stub في inbox-init.js كان يطغى على الدالة الشغّالة → حُذف
- [x] `addNote` كانت ترسل `{note}` والـ API يتوقع `{content}` → إصلاح
- [x] Legacy modal IDs مكررة مع page-inbox-settings → توحيد

---

## 🎯 المهام القادمة — مرتبة بالأولوية

### ✅ منظومة الدفع مكتملة بالكامل
→ ACU-1 → ACU-5 + ACU-A + ACU-B + ACU-C كلها مُنجزة

### 🔴 الأولوية القصوى (ابدأ هنا)
→ **Customer Lifetime Value Badge** — `inbox-context.js` — "12 فاتورة / 4,500 ج.م" يظهر تلقائياً في Context Panel لكل محادثة

### 🟢 تضيف قيمة تنافسية فريدة

#### Customer Lifetime Value Badge
**الوصف:** في Context Panel — "12 فاتورة / 4,500 جنيه" يظهر تلقائياً
**الملفات:** `inbox-context.js`
**التقدير:** 1-2 ساعة

#### Catalog العرض السريع
**الوصف:** زر في Reply box → يعرض المنتجات من المخزون → موظف يختار ويبعت
**الملفات:** `inbox-reply.js` + ربط بـ inventory API
**التقدير:** 4-5 ساعات

### ⚪ يحتاج تدخّل أحمد

#### ربط WhatsApp QR
**المطلوب من أحمد:** فتح صفحة الإعدادات → قنوات التواصل → واتساب QR → مسح الـ QR

#### ربط Telegram Bot
**المطلوب من أحمد:** 5 دقائق فقط — Token في إعدادات قنوات التواصل

---

## 🔧 أوامر مهمة

```bash
# Deploy آمن
cd /home/areej/areej-pro && pm2 reload areej-pro

# Syntax check
node --check public/dashboard/inbox-v3/inbox-chat.js

# لوج السيرفر
pm2 logs areej-pro --lines 50

# OTP للـ owner login في pro-test
sqlite3 /home/areej/areej-pro/data/master.db \
  "INSERT INTO otp_codes (email,code,expires_at,used) VALUES ('sales@areejegypt.com','123456',datetime('now','+10 minutes'),0);"
# ثم استخدم 123456 في صفحة الـ OTP

# مسار DB العملاء
# Master: /home/areej/areej-pro/data/master.db
# Tenant 1 (pro-test): /home/areej/areej-pro/data/tenants/1.db
```

---

## ⚠️ قواعد العمل المتفق عليها

1. **PROJECT.md يُحدَّث بعد كل خطوة** — بدون استثناء
2. **كل جلسة جديدة تبدأ بقراءة PROJECT.md**
3. **Syntax check قبل كل commit**
4. **الأسرار في SECRETS.md فقط**
5. **القاعدة الذهبية:** سيرفر + GitHub + Cloudflare
6. **pro-test فقط للاختبار** — لا تكسر prod
7. **بروتوكول المهام:** ACU → تنفيذ → Syntax check → Commit → انتظار 10 ثواني
8. **حد أقصى 5 مهام في الجلسة الواحدة**
9. **SESSION_CONTEXT.md يُحدَّث في أعلى الملف قبل إغلاق الجلسة**
10. **areej-payment لا يُلمس أبداً** — منطق الدفع يُعاد كتابته داخل areej-pro
