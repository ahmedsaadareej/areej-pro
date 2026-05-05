# PHASE10_EXECUTION.md — دليل التنفيذ الرئيسي
> آخر تحديث: 2026-05-04
> الحالة: ✅ جاهز للتنفيذ

---

## 🎯 كيف تستخدم هذا الدليل

كل جلسة تنفيذ = خطوة واحدة فقط من الملف المناسب.

**قبل أي جلسة تنفيذ، اقرأ:**
1. `inbox-v4/GROUND_TRUTH.md` ← الحقائق الثابتة
2. هذا الملف (INDEX) ← الخطوة القادمة
3. ملف المحور المناسب ← التفاصيل التقنية

**بروتوكول كل جلسة تنفيذ:**
```
اتبع بروتوكول /home/areej/areej-pro/docs/INBOX_SESSION_PROTOCOL.md بالكامل.
اقرأ الملفات المطلوبة وأخبرني بالمهمة القادمة قبل أي تنفيذ.
```

---

## 🗺️ ترتيب المحاور — ثابت لا يتغير

```
Phase A: M1 (الصلاحيات)     → execution/EX-M1-permissions.md
Phase B: M5 (Auth Adapter)   → execution/EX-M5-adapter.md
Phase C: M3 (App Shell)      → execution/EX-M3-shell.md
Phase D: M2 (Settings)       → execution/EX-M2-settings.md
Phase E: M4 (Analytics)      → execution/EX-M4-analytics.md
```

**السبب:** M1 يُنشئ الصلاحيات → M5 يُوحّد Auth → M3 يبني الهيكل → M2+M4 يعيشان داخله.

---

## 📊 حالة التنفيذ الإجمالية

| المحور | الملف | المهام | الحالة |
|--------|-------|--------|--------|
| M1 — الصلاحيات | `execution/EX-M1-permissions.md` | T01→T11 (11 مهمة) | ⏳ لم تبدأ |
| M5 — Auth Adapter | `execution/EX-M5-adapter.md` | T12→T18 (7 مهام) | ⏳ لم تبدأ |
| M3 — App Shell | `execution/EX-M3-shell.md` | T19→T30 (12 مهمة) | ⏳ لم تبدأ |
| M2 — Settings | `execution/EX-M2-settings.md` | T31→T50 (20 مهمة) | ⏳ لم تبدأ |
| M4 — Analytics | `execution/EX-M4-analytics.md` | T51→T63 (13 مهمة) | ⏳ لم تبدأ |

**الإجمالي:** 63 مهمة

---

## ⚡ المهمة القادمة الآن

**→ ابدأ بـ M1، الخطوة الأولى: T01**
اقرأ: `inbox-v4/execution/EX-M1-permissions.md`

---

## 🚨 قواعد لا تُكسر (لكل جلسة)

| القاعدة | التفصيل |
|---------|---------|
| **Migration أولاً** | كل DB change = migration مستقل قبل أي كود |
| **node --check** | كل ملف JS جديد يُتحقق من syntax أولاً |
| **git commit بعد كل خطوة** | نجحت الخطوة = commit فوري |
| **git checkout -- file عند فشل** | فشلت الخطوة = تراجع فوري |
| **لا تمس v3** | `inbox_conversations` و`inbox_messages` القديمة = محرمة |
| **req.inboxUser لا req.user.role** | الكود الجديد كله يستخدم inboxUser |
| **لا npm packages جديدة** | بدون موافقة صريحة من أحمد |
| **خطوة واحدة = ملف واحد** | لا تعدل أكثر من ملف في جلسة واحدة |
