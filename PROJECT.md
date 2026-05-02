# 📋 PROJECT.md — مرجع مشروع Areej Pro
> **قاعدة ذهبية:** هذا الملف يُحدَّث بعد كل خطوة بدون استثناء.
> أي جلسة جديدة تبدأ بقراءة هذا الملف أولاً قبل أي شيء.
> آخر تحديث: 2026-05-02 15:23 UTC

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

### 🔴 الأولوية القصوى (ابدأ هنا)

#### 1. Quote/Reply على رسالة محددة
**الوصف:** المستخدم يضغط على رسالة → يظهر زر Reply → يُرسل الرد مقتبساً منها
**الملفات:** `inbox-chat.js` + `inbox-reply.js` + `index.html`
**التقدير:** 2-3 ساعات

#### 2. Snooze المحادثة
**الوصف:** زر Snooze في header المحادثة → يختار وقت (30 دق / ساعة / 3 ساعات / غداً) → المحادثة تختفي وترجع تلقائياً
**الملفات:** `inbox-chat.js` + `inbox-init.js` (polling يتحقق من snooze) + `server/routes/inbox.js` (endpoint جديد)
**التقدير:** 3-4 ساعات

#### 3. Conversation Timeline
**الوصف:** سجل أحداث داخل المحادثة — "تم التعيين لـ X" / "تم الإغلاق" / "تم تغيير الحالة"
**الملفات:** `inbox-chat.js` + `server/routes/inbox.js`
**التقدير:** 2-3 ساعات

#### 4. زر "تحويل لأوردر" من المحادثة
**الوصف:** زر في Context Panel → يفتح نموذج أوردر بمعلومات العميل جاهزة
**الملفات:** `inbox-context.js` + ربط بـ orders module
**التقدير:** 3-4 ساعات

#### 5. Payment Link من المحادثة
**الوصف:** زر في Context Panel أو Reply box → ينشئ رابط دفع ويرسله للعميل
**الملفات:** `inbox-context.js` + `inbox-reply.js`
**التقدير:** 2-3 ساعات

### 🟡 الأولوية العالية

#### 6. Bulk Actions
**الوصف:** checkbox على كل محادثة → إغلاق / تعيين / label دفعة واحدة
**الملفات:** `inbox-conv.js` + `inbox-chat.js` + `index.html`
**التقدير:** 4-5 ساعات

#### 7. Collision Detection
**الوصف:** "أحمد يرد على هذه المحادثة الآن" — يمنع ردين في نفس الوقت
**الملفات:** `inbox-init.js` (polling) + `inbox-chat.js` + `server/routes/inbox.js`
**التقدير:** 3-4 ساعات

#### 8. Keyboard Shortcuts
**الوصف:** Tab للانتقال بين محادثات / R للرد / E للإغلاق / A للتعيين
**الملفات:** `inbox-init.js`
**التقدير:** 2-3 ساعات

### 🟢 تضيف قيمة تنافسية فريدة

#### 9. Customer Lifetime Value Badge
**الوصف:** في Context Panel — "12 فاتورة / 4,500 جنيه" يظهر تلقائياً
**الملفات:** `inbox-context.js`
**التقدير:** 1-2 ساعة

#### 10. Catalog العرض السريع
**الوصف:** زر في Reply box → يعرض المنتجات من المخزون → موظف يختار ويبعت
**الملفات:** `inbox-reply.js` + ربط بـ inventory API
**التقدير:** 4-5 ساعات

### ⚪ يحتاج تدخّل أحمد

#### 11. ربط WhatsApp QR
**الوصف:** مسح QR مرة واحدة لربط رقم واتساب بـ pro-test
**المطلوب من أحمد:** فتح صفحة الإعدادات → قنوات التواصل → واتساب QR → مسح الـ QR

#### 12. ربط Telegram Bot
**الوصف:** Bot Token من @BotFather
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
