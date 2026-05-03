## Session 2026-05-03 (06:20 → 06:31 UTC) — مكتملة
- الحالة: تم الإكمال
- ما تم إنجازه:
  - fix: WA QR Chrome — السبب الجذري للانقطاع كان LD_LIBRARY_PATH ناقص في بيئة pm2
  - إضافة LD_LIBRARY_PATH في ecosystem.config.js
  - إضافة checkChromeHealth() قبل autoRestore
  - حذف --single-process (كان يسبب SIGTRAP crash)
  - إضافة --no-zygote + --memory-pressure-off
  - النتيجة: QR يتولّد الآن بشكل صحيح ✅
- قرارات تقنية:
  - LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/lib في ecosystem.config.js
  - --single-process محذوف نهائياً (SIGTRAP في VPS)
  - health check يستخدم spawnSync مع --no-zygote بدون --single-process
- آخر Commit: d0f3c39
- نقطة البداية القادمة: صوت التنبيه عند رسالة جديدة — inbox-init.js + index.html + public/sounds/

## Session 2026-05-03 (06:08 → 06:30 UTC) — مكتملة
- الحالة: تم الإكمال (5 مهام — اكتملت الجلسة)
- ما تم إنجازه:
  - Catalog → فاتورة: زر إضافة + invoice picker + endpoint add-item (576a9c0)
  - مراجعة كود بوابات الدفع + إصلاح 4 bugs:
    Bug#1: webhook/fawaterk + webhook/paymob لم يكونا يستدعيان handlePaymentSuccess الكامل (خزنة+CRM+Inbox مش بتشتغل)
    Bug#2: /pay/:token/result route مش موجود → redirect من البوابة يرجع 404
    Bug#3: selectMethod() فيها 3 loops متكررة — الأولتان تُلغيان التحديد
    Bug#4: الصفحة لا تتعامل مع ?status=paid في URL عند redirect
- قرارات تقنية:
  - webhook/fawaterk + paymob الآن يستدعيان handlePaymentSuccess() الكامل
  - Paymob amount يُستخرج من amount_cents/100 وليس من link.amount فقط
  - /pay/:token/result route يُسيرف نفس index.html
  - pay/index.html يتحقق من ?status=paid/error/pending قبل تحميل API
- آخر Commit: fa8c1a2
- نقطة البداية القادمة: اختبار حقيقي لبوابات الدفع بـ test credentials (Paymob sandbox أو Fawaterk test) — يحتاج keys من أحمد

## Session 2026-05-03 (05:54 → 06:15 UTC) — مكتملة
- الحالة: تم الإكمال (4 مهام من 5)
- ما تم إنجازه:
  - WA-Template Sender: زر APPROVED Templates في Reply Box + modal متغيرات + endpoint إرسال (afa1d5d)
  - Bulk Messaging: إرسال رسالة جماعية من Inbox لمحادثات محددة (Telegram + WA QR + WA API) (343e3f6)
  - Deep Search: بحث full-text في محتوى الرسائل + highlight + فلتر منصة/نوع + panel مخصص (67ff6b0)
  - Catalog → فاتورة: زر "📝 فاتورة" في كل منتج + invoice picker + endpoint add-item (576a9c0)
- قرارات تقنية:
  - WA Template Sender يظهر فقط لـ platform='whatsapp' (API) ويُخفى للـ QR/Telegram
  - Bulk Message backend: delay 300ms بين كل رسالة لحماية rate-limit
  - Deep Search: snippet 60 حرف يسار/يمين الكلمة + highlight بـ <mark>
  - Catalog: زران منفصلان (إرسال في رسالة / إضافة للفاتورة) بدل زر واحد
  - invoice picker يظهر فقط لو الفواتير > 1 وغير مدفوعة/ملغية
- آخر Commit: 576a9c0
- نقطة البداية القادمة: اختبار بوابات الدفع Sandbox (يحتاج test credentials من أحمد) أو تحسين WA QR انقطاع

## Session 2026-05-02 (19:29 → 20:20 UTC) — مكتملة
- الحالة: تم الإكمال
- ما تم إنجازه:
  - WA-1: صفحة إعدادات WhatsApp API — scenario toggle (عندك رقم / جديد) + تعليمات مفصّلة للمبتدئين + خطوات فصل الرقم من المنصة القديمة (Respond/Wati)
  - WA-2: Template Manager كامل — list/create/delete + live preview + backend proxy لـ Meta API v19.0
  - WA-3: Analytics Dashboard — Tier + Quality + Conv stats + Cost estimate + Local DB stats
  - fix: إصلاح syntax error قديم في testWhatsAppConnection كان يوقف كل الـ JS
  - fix: cache-bust لجميع JS files
- قرارات تقنية:
  - 3 tabs في صفحة WhatsApp API: ⚙️ إعدادات / 📝 Templates / 📊 تحليلات
  - Backend endpoints proxy على Meta Graph API v19.0
  - Local stats تشتغل حتى بدون credentials Meta
  - waInitWhatsApp() تُستدعى لما تُفتح الصفحة لـ reset صحيح للـ tabs
- آخر Commit: 8fef0c0
- نقطة البداية القادمة: ربط رقم WhatsApp API (يحتاج Phone Number ID + WABA ID + System User Token من أحمد) ثم اختبار بوابات الدفع Sandbox

## Session 2026-05-02 (19:29 → 20:12 UTC) — مكتملة
- الحالة: تم الإكمال
- ما تم إنجازه:
  - WA-1: صفحة إعدادات WhatsApp API — toggle سيناريو (عندك رقم / جديد) + System User Token guidance
  - WA-2: Template Manager كامل — list/create/delete + live preview + backend proxy لـ Meta API
  - WA-3: Analytics Dashboard — Tier + Quality + Conv stats + Cost estimate + Local DB stats
- قرارات تقنية:
  - 3 tabs في صفحة WhatsApp API: ⚙️ إعدادات / 📝 Templates / 📊 تحليلات
  - Backend endpoints proxy على Meta Graph API v19.0
  - التكلفة التقديرية تُحسب من local data بأسعار Meta (EG)
  - Local stats دائماً تشتغل حتى بدون credentials Meta
- آخر Commit: e2d28a1
- نقطة البداية القادمة: اختبار بوابات الدفع Sandbox — يحتاج test credentials من أحمد

# SESSION_CONTEXT.md — آخر تحديث: 2026-05-02 19:15 UTC
# هذا الملف هو نقطة البداية لأي جلسة جديدة — اقرأه أولاً دائماً

---

## 🔴 بروتوكول بداية أي جلسة جديدة
1. اقرأ هذا الملف + PROJECT.md
2. أعلن المهمة القادمة + الملفات المتأثرة
3. انتظر "موافق" من أحمد
4. نفّذ (max 5 مهام/جلسة، 10 ثوانٍ بين كل مهمة)
5. بعد كل مهمة: تحقق → commit → حدّث هذا الملف

---

## 📋 سجل الجلسات

### جلسة 2026-05-02 (17:22 → 19:15 UTC) — مكتملة
**8 commits:**
- `7388d2f` fix: page-payment-gateways blank
- `4f04e8a` fix: cache-bust inbox.js
- `4e118f2` + `b9cba21` feat: Stripe + PayTabs + PayPal (modules + logos + setup_url)
- `1203734` feat: دورة الدفع الكاملة (initiate → webhook → success)
- `b9729ff` feat: CLV Badge — عدد الفواتير + مدفوع في Context Panel
- `814a890` feat: Catalog — زر 📦 في Reply box
- `011544e` fix: WhatsApp QR — waQR header + Puppeteer Chrome
- `2d0ea7d` fix: WhatsApp @lid — أسماء وأرقام صحيحة
- `cdd407b` fix: رسائل WA — نص + صور + فيديوهات + migration
- `0b7ea67` fix+feat: selectedIds.has + New Conversation Modal
- `20c6dfa` feat: Platform Badge + Context Panel → Icon Sidebar
- `e30c56a` feat: إجراءات مدمجة في كل section + tab دفع
- `ea70e6c` fix: Tooltip RTL/LTR + WA reconnect
- `127d48d` fix: حذف keepalive + reconnect آمن (حماية من البان)

---

## 🏗️ المنظومة الحالية

| الخدمة | المسار | الحالة |
|---|---|---|
| areej-pro | `/home/areej/areej-pro/` | ✅ شغّال على port 3002 |
| PM2 | `pm2 reload areej-pro` | ✅ |
| SQLite | `data/master.db` + `data/tenants/*.db` | ✅ |
| WhatsApp QR | `server/whatsapp-qr-service.js` | ✅ شغّال (تحذير: unofficial API) |

---

## ✅ ما تم إنجازه (كامل)

### Inbox v3
- [x] Platform Badge ملون جنب كل محادثة (WA/TG/FB/IG)
- [x] Context Panel → Icon Sidebar (52px) + Flyout panels
  - 👤 بيانات + بروفايل CRM + إضافة للـ CRM
  - 📄 فواتير + زر "فاتورة جديدة"
  - 📦 أوردرات + زر "أوردر جديد"
  - 💳 دفع (إرسال فاتورة + رابط دفع)
  - 📝 ملاحظات
- [x] CLV Badge (عدد الفواتير + إجمالي المدفوع)
- [x] Catalog عرض سريع في Reply box (زر 📦 + search + إدراج)
- [x] New Conversation Modal (WA QR + Telegram)
- [x] Tooltip أيقونات (RTL يمين / LTR يسار)
- [x] إصلاح selectedIds.has error
- [x] إصلاح @lid أسماء وأرقام

### WhatsApp QR
- [x] تثبيت Puppeteer Chrome + مكتبات النظام
- [x] إصلاح waQR undefined في inbox.js
- [x] takeoverOnConflict: true
- [x] Reconnect آمن: مرة واحدة بعد 60ث فقط
- [x] حذف keepalive (كان يرسل 2880 request/يوم → خطر بان)
- [x] إصلاح رسائل النص + الصور + الفيديوهات + الملفات
- [x] Migration رسائل [رسالة] القديمة

### بوابات الدفع
- [x] Stripe + PayTabs + PayPal (كامل)
- [x] إصلاح page-payment-gateways blank
- [x] دورة الدفع الكاملة (initiate → webhook → success)
- [x] Logos + setup_url صحيحة

---

## 🔵 المتبقي (مرتّب بالأولوية)

### أولوية عالية
1. **اختبار حقيقي لبوابات الدفع** — Stripe sandbox أو Paymob test mode
2. **إصلاح الانقطاع السريع لـ WA QR** — السبب الجذري غير معروف بعد (يحتاج تجربة ومراقبة logs)
3. **New Conversation Modal — تحسين**: إضافة Meta/Instagram (يحتاج template message)

### أولوية متوسطة
4. **WhatsApp Business API الرسمي** — بديل آمن لـ QR على المدى البعيد
5. **Bulk messaging** من الـ Inbox (إرسال لعدة عملاء)
6. **Search عميق** في الرسائل (full-text search)

### أولوية منخفضة
7. **Catalog — إضافة للفاتورة مباشرة** (بدل كتابة الاسم يدوياً)
8. **صوت التنبيه** عند رسالة جديدة (مخصص لكل منصة)
9. **تصدير المحادثات** PDF/Excel

---

## ⚙️ تفاصيل تقنية مهمة

### req.db
```js
// في server/routes-system.js سطر 19
req.db = getTenantDb(req.user.id);
```

### WhatsApp QR — تحذير أمني
- `whatsapp-web.js` unofficial API — خطر بان دائم
- الـ reconnect: مرة واحدة فقط بعد 60ث
- LOGOUT = لا reconnect أبداً
- الحل الآمن طويل المدى: Meta Business API الرسمي

### Context Panel الجديد
- Icon bar: `#iv3-ctx-iconbar` (52px)
- Flyout: `#iv3-ctx-flyout` (290px)
- Tabs: `contact | invoices | orders | pay | notes`
- دالة الفتح: `iv3CtxToggleTab('tab-name')`

---

## 📌 آخر commit
`127d48d` — fix: حذف keepalive + reconnect آمن

