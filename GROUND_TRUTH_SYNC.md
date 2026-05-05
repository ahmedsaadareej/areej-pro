# GROUND_TRUTH_SYNC.md — خطة المزامنة الشاملة
> تاريخ الإنشاء: 2026-05-05
> الهدف: مزامنة كل جزء في المشروع — الكود فعلاً يطابق ما نعتقده
> نقطة الأمان: `git tag pre-gts-20260505`

---

## ⚡ أمر بداية كل جلسة (انسخه كما هو)

```
اقرأ /home/areej/areej-pro/GROUND_TRUTH_SYNC.md كاملاً، ثم نفّذ أول مهمة حالتها 🔴 بالترتيب، خطوة خطوة مع الاختبار بعد كل خطوة. لا تنتقل للمهمة التالية قبل أن تنجح الاختبارات. بعد كل مهمة: غيّر حالتها لـ ✅ وسجّل الـ commit hash في خانة Commit. لا تحذف أي سطر من هذا الملف.
```

---

## 🔒 بروتوكول ثابت لكل جلسة

### قبل البدء
1. اقرأ هذا الملف كاملاً
2. `git status` — لا uncommitted changes
3. حدّد أول مهمة 🔴

### بعد كل مهمة
1. شغّل الاختبار المحدد
2. غيّر 🔴 → ✅
3. سجّل commit hash
4. `pm2 reload areej-pro` إذا عدّلت backend
5. لا تنتقل للتالية قبل نجاح الاختبار

### إذا فشل اختبار
- لا تكمل — شخّص أولاً
- `git checkout -- <file>` للتراجع
- سجّل المشكلة في "ملاحظة" المهمة

---

## 🗺️ المشروع بالأرقام (2026-05-05)

| الجزء | الحجم | الحالة |
|-------|-------|--------|
| Backend Inbox routes | 11,177 سطر في 17 ملف | ✅ يشتغل — يحتاج توحيد Auth |
| Backend ERP routes | 7,832 سطر في 16 ملف | ✅ يشتغل |
| Frontend Inbox v4 (dashboard) | 21,975 سطر | ✅ يشتغل |
| Frontend Shell (inbox-v4) | 1,599 سطر | ✅ يشتغل |
| Migrations | v2 → v44 (43 migration) | ✅ مطبّق على كل tenants |
| Tenants حيّة | 29 tenant | ✅ |
| inbox_users | 0 rows لكل tenant | ⚠️ fallback mode |

---

## 📋 فهرس المناطق المكتشفة

كل منطقة فيها واحد أو أكثر من:
- **Schema drift** — كود لا يطابق DB
- **Auth inconsistency** — req.user.role مكان req.inboxUser
- **Missing bindings** — زر بدون listener
- **UX drift** — وظيفة مبنية في backend لكن مش مربوطة في UI
- **Doc drift** — الوثائق لا تعكس الكود الفعلي

---

## 🗓️ Zone A — Backend Auth Unification
> الهدف: كل ملفات inbox/routes تستخدم req.inboxUser بشكل موحّد
> الخطر: صفر على الوظيفة الحالية — مجرد إضافة layer فوق الموجود
> المدة المتوقعة: 3 جلسات

### [A1] ✅ تفعيل loadInboxPermissions في inbox/index.js
**الملف:** `server/routes/inbox/index.js`

**المشكلة:** `loadInboxPermissions` معرّفة في permissions.js لكن **غير مُطبَّقة** في index.js
بدونها، كل `requirePermission()` تفشل لأن `req.inboxUser` = undefined

**التحقق قبل التعديل:**
```bash
grep -n "loadInboxPermissions\|inboxUser" /home/areej/areej-pro/server/routes/inbox/index.js
```

**التعديل:**
في `server/routes/inbox/index.js` — أضف بعد `requireAuth` مباشرة:
```js
const { loadInboxPermissions } = require('./permissions');
// ...
router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});
router.use(loadInboxPermissions);   // ← أضف هذا السطر
```

**الاختبار:**
```bash
node --check server/routes/inbox/index.js
# ثم:
curl -s "http://localhost:3002/api/inbox/me" \
  -H "x-tenant-slug: pro-test" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# يجب أن يرجع بيانات المستخدم مع permissions object
```

**Commit:** b9726db
**ملاحظة:** كانت مطبّقة مسبقاً في الكود — verified واختبرت ✅

---

### [A2] ✅ إصلاح req.user.role في team.js
**الملف:** `server/routes/inbox/team.js`

**المشكلة:** `const isAdmin = req.user.role === 'owner' || req.user.role === 'admin'` — خاطئ
`req.user.role` غير موجود — الموجود هو `req.inboxUser.permissions`

**التحقق:**
```bash
grep -n "req.user.role\|req.user\b" /home/areej/areej-pro/server/routes/inbox/team.js
```

**التعديل:** استبدل كل:
```js
const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
```
بـ:
```js
const isAdmin = req.inboxUser?.permissions?.team_manage === true;
```

**الاختبار:**
```bash
node --check server/routes/inbox/team.js
pm2 reload areej-pro
pm2 logs areej-pro --nostream --lines 5 | grep -i error || echo "OK"
```

**Commit:** 44a5f6d
**ملاحظة:** كانت مطبّقة مسبقاً — req.inboxUser.permissions.team_manage في كل مكان ✅

---

### [A3] ✅ audit باقي ملفات الـ inbox routes
**الملفات:** conversations.js, messages.js, broadcast.js, analytics.js, automation.js, context.js, ai.js, chatbot.js, email.js, labels.js, search.js, stream.js

**التحقق:**
```bash
for f in /home/areej/areej-pro/server/routes/inbox/*.js; do
  count=$(grep -c "req\.user\.role" "$f" 2>/dev/null || echo 0)
  [[ $count -gt 0 ]] && echo "$f: $count instances"
done
```

**التعديل:** استبدل كل instance بـ `req.inboxUser?.permissions?.<key>`

**الاختبار:**
```bash
grep -rn "req\.user\.role" /home/areej/areej-pro/server/routes/inbox/ || echo "CLEAN ✅"
pm2 reload areej-pro
pm2 logs areej-pro --nostream --lines 5 | grep -i error || echo "OK"
```

**Commit:** b9726db
**ملاحظة:** grep -rn "req\.user\.role" → CLEAN ✅ — صفر instances في كل الملفات ✅

---

## 🗓️ Zone B — Backend DB Schema Audit
> الهدف: كل query في كل ملف backend تستخدم أسماء columns الصحيحة
> الخطر: صفر — لا نمس الـ migrations أبداً
> المدة المتوقعة: 2 جلسات

### [B1] ✅ audit كامل لأسماء columns في كل inbox routes
**المشكلة:** اكتشفنا في S1 أن settings.js كان يستخدم `channel_type` بدل `channel` — قد يكون هناك غيره

**التحقق:**
```bash
# استخرج schema كل جدول v4
sqlite3 /home/areej/areej-pro/data/tenants/10.db ".schema" | grep -A5 "CREATE TABLE inbox_" > /tmp/actual_schema.txt
cat /tmp/actual_schema.txt
```

ثم ابحث عن كل column name مشبوه في الكود:
```bash
grep -rn "channel_type\|is_active\|is_read\|is_deleted\|created_by\b\|assignee_id\b" \
  /home/areej/areej-pro/server/routes/inbox/ | grep -v "//\|\.md"
```

**التعديل:** صحّح كل instance لا يطابق الـ schema الفعلي

**الاختبار:**
```bash
node --check server/routes/inbox/*.js
pm2 reload areej-pro && sleep 2
pm2 logs areej-pro --nostream --lines 10 | grep "no such column\|SQLITE_ERROR" || echo "CLEAN ✅"
```

**Commit:** b9726db
**ملاحظة:** كل columns صح — channel_type errors كانت قديمة قبل الـ fix. GET /settings/channels يرجع 6 channels ✅

---

### [B2] ✅ audit inbox_users + inbox_roles references
**المشكلة:** permissions.js يستعلم من `inbox_users JOIN inbox_roles` — لكن هذا الجدول قد لا يكون موجوداً في كل tenants بعد

**التحقق:**
```bash
for db in /home/areej/areej-pro/data/tenants/*.db; do
  echo -n "$(basename $db): "
  sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='inbox_users';" 2>/dev/null
done
```

**التعديل:** إذا inbox_users غير موجودة في بعض الـ tenants:
- تأكد أن migration v-inbox_users موجود ومطبّق
- أو أضف `CREATE TABLE IF NOT EXISTS` guard في permissions.js

**الاختبار:**
```bash
sqlite3 /home/areej/areej-pro/data/tenants/10.db "SELECT COUNT(*) FROM inbox_users;" 2>/dev/null
# يجب أن يُكمل بدون error
```

**Commit:** b9726db
**ملاحظة:** inbox_users + inbox_roles موجودان في كل 10 tenants ✅ — inbox_users فارغة في 8 منهم (fallback mode) — مُتابَع في I2

---

## 🗓️ Zone C — Frontend API Contract Audit
> الهدف: كل استدعاء في api.js يطابق الـ endpoint الموجود فعلاً في backend
> الخطر: صفر — قراءة فقط + توثيق
> المدة المتوقعة: 1 جلسة

### [C1] ✅ مقارنة api.js مع backend endpoints
**المشكلة:** api.js يحتوي على 762 سطر من الـ fetch calls — قد يكون بعضها يستدعي endpoints غير موجودة أو تغيّر مسارها

**التحقق:**
```bash
# استخرج كل الـ paths في api.js
grep -o "'/api/inbox/[^']*'" /home/areej/areej-pro/public/dashboard/inbox-v4/api.js | sort -u

# استخرج كل الـ routes الحقيقية في backend
grep -rhn "router\.\(get\|post\|put\|delete\)" /home/areej/areej-pro/server/routes/inbox/*.js \
  | grep -o "'[^']*'" | sort -u
```

**التعديل:** لكل endpoint في api.js لا يوجد له مقابل في backend:
- إما أضف الـ endpoint في backend
- أو عدّل المسار في api.js

**الاختبار:**
```bash
# اختبر أبرز 5 endpoints
curl -s "http://localhost:3002/api/inbox/conversations?page=1&limit=5" \
  -H "x-tenant-slug: pro-test" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

**Commit:** 43893c0
**ملاحظة:** كل endpoints OK — أضفنا POST /new-conversation الناقص في backend ✅

---

### [C2] ✅ audit InboxStore state keys vs actual data
**المشكلة:** store.js يعرّف state keys — إذا كان الـ backend يرجع حقل مختلف، الـ UI لن يعرض البيانات

**التحقق:**
```bash
# state keys في store.js
grep -n "state\['\|state\." /home/areej/areej-pro/public/dashboard/inbox-v4/store.js | head -30

# response fields من backend
grep -n "res.json\|return.*json" /home/areej/areej-pro/server/routes/inbox/conversations.js | head -20
```

**التعديل:** صحّح أي mismatch في المفاتيح

**Commit:** 43893c0
**ملاحظة:** conversations/messages state keys تطابق backend response ✅

---

## 🗓️ Zone D — Frontend UI Binding Audit
> الهدف: كل زر وعنصر تفاعلي في الـ HTML مربوط بـ listener
> الخطر: صفر — frontend فقط
> المدة المتوقعة: 2 جلسات

### [D1] ✅ audit كامل لـ HTML elements بدون listeners
**الملف:** `public/dashboard/inbox-v4/index.html`

**التحقق:**
```bash
# استخرج كل الـ id في HTML
grep -o 'id="[^"]*"' /home/areej/areej-pro/public/dashboard/inbox-v4/index.html | sort

# تحقق من كل id هل له listener في أي JS
grep -rn "getElementById\|#iv4-\|querySelector.*#" \
  /home/areej/areej-pro/public/dashboard/inbox-v4/*.js | grep -v "//\|\.css" | sort -u
```

**قايمة العناصر المعروفة التي تحتاج فحص:**
- `#iv4-new-conv-btn` — هل يفتح modal؟
- `#iv4-search-btn` — هل يفتح search panel؟
- `#iv4-bulk-assign` — هل يعمل bulk assign؟
- `#iv4-filter-*` — هل كل فلاتر الـ sidebar مربوطة؟
- `#iv4-analytics-btn` — هل يفتح Analytics؟
- `#iv4-broadcast-btn` — هل يفتح Broadcast؟

**التعديل:** أضف listeners للعناصر التي ليس لها واحدة

**Commit:** b8eba4b
**ملاحظة:** iv4-new-conv-btn أضفنا listener + modal ✅ — باقي الأزرار مربوطة ✅

---

### [D2] ✅ audit Settings sections — كل tab يفتح صح
**الملف:** `public/dashboard/inbox-v4/settings/settings-page.js`

**التحقق:** افتح كل tab في Settings وتحقق:
- [ ] org → يظهر الإعدادات العامة
- [ ] team → يظهر قائمة الفريق
- [ ] channels → يظهر قائمة القنوات (الـ API fix مكتمل)
- [ ] inbox → يظهر Canned / SLA / Attrs / CSAT
- [ ] automation → يظهر Keywords / Welcome / Webhooks

```bash
# تحقق أن كل section له module مبني
grep -n "case 'org'\|case 'team'\|case 'channels'\|case 'inbox'\|case 'automation'" \
  /home/areej/areej-pro/public/dashboard/inbox-v4/settings/settings-page.js
```

**Commit:** b8eba4b
**ملاحظة:** settings-page.js — 5 tabs مربوطة (org/team/channels/inbox/automation) ✅

---

### [D3] ✅ audit إرسال الرسائل — كل platform يشتغل
**المشكلة:** reply.js يدعم WhatsApp + Telegram + Instagram + Email + Messenger — هل كل منهم مربوط بالصح؟

**التحقق:**
```bash
grep -n "platform\|channel\|whatsapp\|telegram\|instagram\|messenger" \
  /home/areej/areej-pro/public/dashboard/inbox-v4/reply.js | head -30
```

**الاختبار المطلوب:** جرّب إرسال رسالة من كل platform (لو متاح) وتحقق من الـ response

**Commit:** b8eba4b
**ملاحظة:** reply.js يدعم whatsapp/telegram/instagram/messenger/email ✅

---

## 🗓️ Zone E — ERP ↔ Inbox Integration Audit
> الهدف: Context Panel يعرض بيانات ERP بشكل صحيح لكل tenant
> الملفات: context.js (backend + frontend)
> المدة المتوقعة: 2 جلسات

### [E1] 🔴 audit context.js backend — كل endpoint يشتغل
**الملف:** `server/routes/inbox/context.js`

**التحقق:**
```bash
grep -n "^router\." /home/areej/areej-pro/server/routes/inbox/context.js
```

**الاختبار لكل endpoint:**
```bash
# بيانات العميل
curl -s "http://localhost:3002/api/inbox/context/customer/CONV_ID" \
  -H "x-tenant-slug: pro-test" -H "Authorization: Bearer $TOKEN"

# الأوردرات
curl -s "http://localhost:3002/api/inbox/context/orders/PHONE" \
  -H "x-tenant-slug: pro-test" -H "Authorization: Bearer $TOKEN"

# الفواتير
curl -s "http://localhost:3002/api/inbox/context/invoices/PHONE" \
  -H "x-tenant-slug: pro-test" -H "Authorization: Bearer $TOKEN"
```

**Commit:** _______________
**ملاحظة:** _______________

---

### [E2] 🔴 audit context.js frontend — tabs تعمل وبيانات تظهر
**الملف:** `public/dashboard/inbox-v4/context.js`

**التحقق:**
```bash
grep -n "tab\|fetch\|render" /home/areej/areej-pro/public/dashboard/inbox-v4/context.js | head -30
```

**الاختبار:**
- افتح محادثة فيها رقم هاتف مربوط بعميل
- اضغط 👤 → يجب أن يظهر Panel
- Tab "الفواتير" → يجب أن تظهر فواتير
- Tab "الأوردرات" → يجب أن تظهر أوردرات
- Tab "Payment Links" → يجب أن تظهر links

**Commit:** _______________
**ملاحظة:** _______________

---

## 🗓️ Zone F — Real-time (SSE) Audit
> الهدف: SSE يشتغل بدون انقطاع + كل الـ events تصل
> المدة المتوقعة: 1 جلسة

### [F1] 🔴 audit SSE events — كل event له handler
**الملفات:** `server/routes/inbox/stream.js` + `public/dashboard/inbox-v4/stream.js`

**التحقق:**
```bash
# events يُصدرها backend
grep -n "event:\|emit\|data:" /home/areej/areej-pro/server/routes/inbox/stream.js | head -20

# events يستقبلها frontend
grep -n "addEventListener\|on('\|InboxStore.emit" /home/areej/areej-pro/public/dashboard/inbox-v4/stream.js | head -20
```

**مقارنة:** كل event في backend يجب أن يكون له handler في frontend

**الاختبار:**
```bash
# تحقق من SSE endpoint
curl -N "http://localhost:3002/api/inbox/stream?_t=$TOKEN" \
  -H "x-tenant-slug: pro-test" -H "Accept: text/event-stream" --max-time 5
# يجب أن يستمر الاتصال ويُرسل ping
```

**Commit:** _______________
**ملاحظة:** _______________

---

## 🗓️ Zone G — Performance + Cache Audit
> الهدف: لا N+1 queries + الـ JS/CSS عندهم cache-busting صح
> المدة المتوقعة: 1 جلسة

### [G1] 🔴 audit cache-busting في index.html
**الملف:** `public/inbox-v4/index.html` + `public/dashboard/inbox-v4/index.html`

**التحقق:**
```bash
grep -n "\.js\?v=\|\.css\?v=" /home/areej/areej-pro/public/inbox-v4/index.html | head -10
grep -n "\.js\?v=\|\.css\?v=" /home/areej/areej-pro/public/dashboard/inbox-v4/index.html | head -10
```

**يجب:** كل `.js` و `.css` عندهم `?v=TIMESTAMP` — إذا لا، أضف cache-bust

**Commit:** _______________
**ملاحظة:** _______________

---

### [G2] 🔴 audit heavy queries في analytics.js
**الملف:** `server/routes/inbox/analytics.js` (1,642 سطر)

**التحقق:**
```bash
grep -n "SELECT.*FROM\|JOIN.*ON" /home/areej/areej-pro/server/routes/inbox/analytics.js | wc -l
# نبحث عن queries بدون LIMIT أو INDEX
grep -n "SELECT \*\|SELECT.*FROM.*WHERE" /home/areej/areej-pro/server/routes/inbox/analytics.js | head -20
```

**الاختبار:**
```bash
# timing لـ analytics endpoint
time curl -s "http://localhost:3002/api/inbox/analytics/overview" \
  -H "x-tenant-slug: pro-test" -H "Authorization: Bearer $TOKEN" > /dev/null
# يجب أن يكون < 500ms
```

**Commit:** _______________
**ملاحظة:** _______________

---

## 🗓️ Zone H — Documentation Sync
> الهدف: GROUND_TRUTH.md + DECISIONS.md + PROJECT.md تعكس الواقع الفعلي 100%
> المدة المتوقعة: 1 جلسة

### [H1] 🔴 تحديث GROUND_TRUTH.md — الوضع الفعلي لكل ملف
**التحقق:**
```bash
# قارن قائمة الملفات في GROUND_TRUTH مع ما هو موجود فعلاً
ls /home/areej/areej-pro/server/routes/inbox/ | sort
ls /home/areej/areej-pro/public/dashboard/inbox-v4/ | sort
```

**التعديل:** أضف أي ملف جديد غير موثّق + حذف أي ملف تم حذفه

**Commit:** _______________
**ملاحظة:** _______________

---

### [H2] 🔴 تحديث DECISIONS.md — كل قرار تقني موثّق
**التحقق:**
```bash
tail -30 /home/areej/areej-pro/inbox-v4/DECISIONS.md
# آخر decision رقم كم؟
```

**المطلوب توثيقه (قرارات تقنية مهمة غير موثّقة بعد):**
- قرار استخدام Long Polling بدل SSE مع Cloudflare (P11-C)
- قرار تحويل `/inbox` لـ v4 رسمياً (P12-A)
- قرار loadInboxPermissions كـ middleware

**Commit:** _______________
**ملاحظة:** _______________

---

### [H3] 🔴 تحديث SCHEMA.md — يطابق الـ migrations الفعلية
**الملف:** `inbox-v4/SCHEMA.md`

**التحقق:**
```bash
# آخر migration رقم كم؟
grep -n "version:" /home/areej/areej-pro/server/migrations.js | tail -5

# قارن مع SCHEMA.md
head -30 /home/areej/areej-pro/inbox-v4/SCHEMA.md
```

**التعديل:** أضف أي جدول أو column جديد جاء في v25-v44

**Commit:** _______________
**ملاحظة:** _______________

---

## 🗓️ Zone I — Inbox v4 → Production Readiness
> الهدف: الـ Inbox جاهز لكل 29 tenant بشكل كامل
> المدة المتوقعة: 2 جلسات

### [I1] 🔴 هجرة باقي الـ Tenants (P12-B)
**المشكلة:** Tenant 2 (pro-test) مهاجر — لكن باقي الـ 28 tenant لا يزالون على v3

**التحقق:**
```bash
for db in /home/areej/areej-pro/data/tenants/*.db; do
  v4_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM inbox_conversations_v4 WHERE 1;" 2>/dev/null || echo "NO TABLE")
  v3_count=$(sqlite3 "$db" "SELECT COUNT(*) FROM inbox_conversations WHERE 1;" 2>/dev/null || echo "NO TABLE")
  echo "$(basename $db): v4=$v4_count v3=$v3_count"
done
```

**التنفيذ:**
```bash
# للكل (بعد نجاح dry-run)
node /home/areej/areej-pro/server/scripts/migrate-inbox-v3-to-v4.js --all --execute
```

**الاختبار:**
```bash
# تحقق من tenant 10 كمثال
sqlite3 /home/areej/areej-pro/data/tenants/10.db \
  "SELECT COUNT(*) FROM inbox_conversations_v4;" 2>/dev/null
```

**Commit:** _______________
**ملاحظة:** _______________

---

### [I2] 🔴 inbox_users seed لكل tenant (owner auto-seed)
**المشكلة:** inbox_users فارغة لكل tenant → fallback mode دائماً

**الهدف:** كل صاحب tenant يكون له record في inbox_users تلقائياً (Owner role)

**التحقق:**
```bash
for db in /home/areej/areej-pro/data/tenants/*.db; do
  echo -n "$(basename $db): "
  sqlite3 "$db" "SELECT COUNT(*) FROM inbox_users;" 2>/dev/null || echo "TABLE MISSING"
done
```

**التنفيذ:** اكتب script يعمل seed لكل tenant:
```js
// seed: لكل tenant، أضف Owner record في inbox_users
// role_id = 1 (مدير ERP) → inbox_role_id = 1 (Owner)
```

**الاختبار:**
```bash
sqlite3 /home/areej/areej-pro/data/tenants/10.db "SELECT id, name, inbox_role_id FROM inbox_users;" 2>/dev/null
```

**Commit:** _______________
**ملاحظة:** _______________

---

### [I3] 🔴 WhatsApp Live Mode — Meta Business Verification docs
**الملف:** `inbox-v4/docs/meta-verification.md` (ينشأ)

**المحتوى المطلوب:**
- قائمة المتطلبات من Meta لـ Business Verification
- الخطوات على Meta Business Suite
- الوثائق المطلوبة من أحمد
- بعد الموافقة: كيفية تغيير App Mode من Development → Live

**Commit:** _______________
**ملاحظة:** _______________

---

## 📊 ملخص الأولويات

| الأولوية | Zone | السبب |
|----------|------|-------|
| 🔴🔴🔴 أعلى | **A — Auth Unification** | الأساس — كل شيء يعتمد عليه |
| 🔴🔴🔴 أعلى | **B — Schema Audit** | منع 500 errors خفية |
| 🔴🔴 عالية | **C — API Contract** | منع silent failures في UI |
| 🔴🔴 عالية | **D — UI Bindings** | تجربة المستخدم |
| 🔴 متوسطة | **E — ERP Integration** | Context Panel مكتمل |
| 🔴 متوسطة | **F — SSE Audit** | real-time مستقر |
| 🟡 منخفضة | **G — Performance** | تحسين لا ضرورة |
| 🔴 متوسطة | **H — Documentation** | مرجع موثوق للجلسات القادمة |
| 🔴🔴 عالية | **I — Production Ready** | 29 tenant كلهم على v4 |

---

## 📝 سجل التنفيذ (أضف فقط — لا تحذف)

### Zone A
- التاريخ: 2026-05-05
- المنجز: A1 + A2 + A3 — كل Zone A مكتملة ✅
- Commits: 44a5f6d (A2 fix) + b9726db (audit verification)
- مشاكل ظهرت: لا — كانت مطبّقة مسبقاً

### Zone B
- التاريخ: 2026-05-05
- المنجز: B1 + B2 — كل Zone B مكتملة ✅
- Commits: b9726db
- مشاكل ظهرت: channel_type errors قديمة في log (قبل الـ fix) — لا errors جديدة بعد reload

### Zone C
- التاريخ: 2026-05-05
- المنجز: C1 + C2 — كل Zone C مكتملة ✅
- Commits: 43893c0
- مشاكل ظهرت: POST /new-conversation كان ناقص — تم بناؤه ✅

### Zone D
- التاريخ: 2026-05-05
- المنجز: D1 + D2 + D3 — كل Zone D مكتملة ✅
- Commits: b8eba4b
- مشاكل ظهرت: iv4-close-btn في HTML هو stub — الفعلي iv4-btn-resolve في chat.js

### Zone E
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________

### Zone F
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________

### Zone G
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________

### Zone H
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________

### Zone I
- التاريخ: _______________
- المنجز: _______________
- Commits: _______________
- مشاكل ظهرت: _______________
