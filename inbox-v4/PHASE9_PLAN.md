# تقرير Phase 9 — الخطة الكاملة
> تاريخ الجلسة: 2026-05-04
> حالة المشروع: Phase 8 ✅ مكتملة — بداية التخطيط لـ Phase 9

---

## 📌 القرارات الاستراتيجية المتفق عليها

### القرار الأول — نموذج التوزيع (Distribution Model)

**السيناريو المختار: C**

الـ Inbox يُبنى الآن كجزء من areej-pro (SaaS)، لكن بمعمارية تسمح بفصله لاحقاً كـ standalone product يُباع منفصلاً.

| النقطة | التفاصيل |
|---|---|
| الوضع الحالي | مدمج في areej-pro على سيرفر أحمد |
| المستقبل (V2) | standalone product مستقل |
| نموذج الاستضافة | Self-hosted على سيرفر أحمد — كل عميل حساب منفصل |
| التوزيع | أحمد يدير السيرفر لعملائه |

**ما يعنيه هذا معمارياً:**
- كل الـ Inbox logic تبقى في مجلد/module منفصل قابل للنزع
- لا dependencies صعبة على باقي areej-pro (الفوترة، المخزون، إلخ)
- الـ Auth/Users system يبقى مجرد adapter قابل للاستبدال
- الـ Database tables كلها prefixed بـ `inbox_` — لا اختلاط مع جداول أخرى

---

### القرار الثاني — هيكل التطوير

التطوير يسير في **5 محاور رئيسية** (Phase 9):

---

## 🗂️ المحاور الخمسة — Phase 9

---

### المحور 1 — الشاشات العائمة → حجم مناسب

**المبدأ:** مش إزالة الـ modal كلياً — كل حاجة تاخد الحجم المناسب ليها.

| النوع | الحجم المناسب |
|---|---|
| Chatbot Flow Builder | صفحة كاملة مستقلة (complex canvas) |
| تقرير كبير / Analytics | صفحة مستقلة |
| Webhook إضافة/تعديل | Drawer/Side-panel كبير |
| إعداد بسيط (toggle, text field) | في مكانه في الـ Settings مباشرة |
| نموذج متوسط (Channel setup) | Modal عادي يكفي |

**الفايدة:**
- المستخدم يقدر يشتغل على إعداد وعينه على المحادثة
- Chatbot builder مش محشور في modal
- كل صفحة ليها URL مباشر قابل للمشاركة

---

### المحور 2 — قسم Settings (إعادة هيكلة كاملة)

**الهيكل المتفق عليه:**

```
Settings:
├── 🏢 المؤسسة
│   ├── الاسم + اللوجو + Favicon
│   ├── Timezone + Language + Date Format
│   ├── Business Hours (بيأثر على SLA + Away)
│   └── Branding (لون، footer الإيميل)
│
├── 👥 الفريق
│   ├── المستخدمين (إضافة / تعديل / دعوة بالإيميل / حذف)
│   ├── الفرق (Teams) + تعيين الأعضاء
│   ├── Roles & Permissions (Owner / Admin / Supervisor / Agent / Read-only)
│   └── Agent Capacity (الحد الأقصى محادثات لكل موظف)
│
├── 🔌 التطبيقات
│   ├── القنوات (WhatsApp API / QR / Telegram / Instagram / Messenger / Email)
│   └── التكاملات (OpenAI / Zapier / n8n / Payment Providers)
│
├── 📬 الـ Inbox
│   ├── Labels / Tags
│   ├── Canned Responses (الردود الجاهزة)
│   ├── Custom Attributes (حقول إضافية للمحادثة والعميل)
│   ├── Contact Fields
│   ├── SLA Policies (تعريف أوقات الاستجابة لكل priority)
│   ├── CSAT Settings
│   └── Inbox Appearance (compact / comfy / font size)
│
├── ⚙️ الأتمتة
│   ├── Keyword Replies
│   ├── Welcome + Away Messages
│   ├── Auto-Close Rules
│   ├── Auto-Assign Rules
│   ├── Escalation Rules (تصعيد تلقائي لو ما اتردش خلال X دقيقة)
│   ├── Business Rules (conditions + actions)
│   ├── Chatbots [صفحة كاملة — Flow Builder]
│   ├── Scheduled Messages
│   └── Webhooks (outbound triggers)
│
└── 📁 البيانات
    ├── Import Contacts (CSV)
    ├── Import Conversations (migration من v3)
    ├── Export Data (محادثات / تقارير / جهات اتصال)
    └── Backup (نسخة كاملة من tenant data)
```

---

### المحور 3 — قسم التقارير (Analytics — قسم مستقل)

**الهيكل المتفق عليه:**

```
Reports:
├── 📊 Overview
│   ├── إجمالي المحادثات (اليوم / الأسبوع / الشهر)
│   ├── Open vs Closed vs Waiting
│   ├── متوسط وقت الاستجابة الأول (FRT)
│   ├── متوسط وقت الحل (Resolution Time)
│   ├── CSAT Score العام
│   └── Live: محادثات مفتوحة الآن + موظفين Online
│
├── 👤 تقارير الموظفين
│   ├── محادثات لكل موظف (Handled / Resolved / Transferred)
│   ├── متوسط وقت استجابة لكل موظف
│   ├── أوقات النشاط
│   ├── CSAT لكل موظف
│   └── Leaderboard (مقارنة بين الموظفين)
│
├── 📱 تقارير القنوات
│   ├── توزيع المحادثات على كل قناة
│   ├── أداء كل قناة (FRT + Resolution Time)
│   └── أوقات الذروة لكل قناة
│
├── 🏷️ تقارير Labels + Topics
│   ├── أكثر الموضوعات تكراراً
│   └── اتجاهات الـ labels بمرور الوقت
│
├── ⏱️ SLA Reports
│   ├── نسبة الامتثال للـ SLA
│   ├── المحادثات التي خرقت الـ SLA
│   └── Breach by Agent / by Channel / by Priority
│
├── 😊 CSAT Reports
│   ├── التقييمات الكاملة مع تفاصيل المحادثة
│   ├── اتجاهات الرضا بمرور الوقت
│   └── أسوأ/أحسن محادثات بناءً على التقييم
│
├── 🤖 AI & Automation Reports
│   ├── نسبة محادثات الـ Chatbot (بدون تدخل بشري)
│   ├── Keyword hits statistics
│   └── Auto-close vs manually closed
│
└── 📤 Export (لكل تقرير)
    ├── CSV + Excel + PDF
    └── Scheduled Reports (إرسال تقرير أسبوعي/شهري على الإيميل)
```

---

### المحور 4 — نظام الصلاحيات (Roles & Permissions)

**الأدوار الخمسة:**

| الدور | الوصف |
|---|---|
| **Owner** | صاحب الحساب — كل صلاحيات بدون استثناء |
| **Admin** | إدارة كاملة إلا حذف الحساب / تغيير الباقة |
| **Supervisor** | يشوف تقارير الفريق + يعدّل محادثات الكل + لا يعدّل Settings الحساسة |
| **Agent** | يشتغل على محادثاته أو المعينة له |
| **Read-only** | يشوف فقط — لا رد، لا تعديل |

**Permission Matrix:**

| القسم | Owner | Admin | Supervisor | Agent | Read-only |
|---|---|---|---|---|---|
| إعدادات المؤسسة | ✅ | ✅ | ❌ | ❌ | ❌ |
| مستخدمين + فرق | ✅ | ✅ | 👁️ عرض | ❌ | ❌ |
| القنوات + تكاملات | ✅ | ✅ | ❌ | ❌ | ❌ |
| إعدادات Inbox | ✅ | ✅ | ✅ | ❌ | ❌ |
| الأتمتة | ✅ | ✅ | ✅ | ❌ | ❌ |
| التقارير الكاملة | ✅ | ✅ | فريقه فقط | نفسه فقط | 👁️ عرض |
| Export Data | ✅ | ✅ | ❌ | ❌ | ❌ |
| حذف الحساب | ✅ | ❌ | ❌ | ❌ | ❌ |

**ملاحظة تقنية مهمة:**
Route Guard صريح في كل صفحة frontend — مش بس في الـ Sidebar.
لأن معرفة URL المباشر يجب ألا تكفي للوصول بدون صلاحية.

---

### المحور 5 — هيكل التنقل (Navigation)

**Sidebar الرئيسي:**
```
├── 💬 Inbox          ← الصفحة الرئيسية
├── 👥 Contacts       ← CRM
├── 📊 Reports        ← قسم مستقل
├── ⚙️ Settings       ← قسم مستقل
└── [لوجو + اسم المؤسسة في الأعلى]
```

---

## 🔑 النقاط التقنية المهمة (لازم تتذكر أثناء التنفيذ)

1. **Business Hours** — مش مجرد إعداد شكلي، بيأثر على:
   - متى تُحسب انتهاكات الـ SLA
   - متى تُرسل الـ Away Message
   - متى يُعتبر الموظف "Away" تلقائياً

2. **Agent Capacity** — رقم لكل موظف بيتحكم في الـ auto-assign:
   - لو الموظف وصل لـ capacity → auto-assign يتجاهله
   - Supervisor/Admin يقدر يعدل الـ capacity

3. **Custom Attributes** — نوعان:
   - Conversation Attributes (مثلاً: "رقم الطلب"، "نوع المشكلة")
   - Contact Attributes (مثلاً: "نوع المنتج"، "تاريخ الشراء")

4. **Escalation Rules** — منفصلة عن Auto-Assign:
   - Trigger: مرور X دقيقة بدون رد
   - Action: رفع priority / إرسال تنبيه / إعادة تعيين

5. **Scheduled Reports** — يحتاج:
   - جدول cron داخلي
   - SMTP settings (من إعدادات المؤسسة)
   - تحديد المستلمين + التكرار (يومي/أسبوعي/شهري)

6. **Route Guard** — يُطبَّق على مستويين:
   - Frontend: redirect لو role مش مناسب
   - Backend: middleware يتحقق من الـ role في كل API call

---

## 📋 ملخص تنفيذي

| المحور | الأولوية | التعقيد | الفايدة |
|---|---|---|---|
| هيكل التنقل + حجم الشاشات | عالية | منخفض | UX أفضل فوراً |
| نظام الصلاحيات | عالية جداً | عالي | ضروري قبل أي توسع |
| Settings (إعادة هيكلة) | عالية | متوسط-عالي | الأساس لكل الـ features |
| التقارير (Analytics) | متوسطة | عالي | ميزة تنافسية كبيرة |
| Standalone Architecture | منخفضة (الآن) | عالي | مستقبلي — لكن نبني عليه من الأول |

---

## 🚀 الخطوة التالية

**ننتظر موافقة أحمد على ترتيب أولويات المحاور الخمسة قبل البدء.**

الترتيب المقترح للتنفيذ:
1. نظام الصلاحيات (الأساس — كل حاجة تانية بتعتمد عليه)
2. Settings (إعادة الهيكلة)
3. هيكل التنقل + الشاشات
4. التقارير
5. Standalone Architecture

---

> آخر تحديث: 2026-05-04 09:52 UTC
> الجلسة القادمة: تبدأ من هنا
