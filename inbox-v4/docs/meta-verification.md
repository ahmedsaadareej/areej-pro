# Meta Business Verification — دليل التحقق
> تاريخ الإنشاء: 2026-05-05 (GTS Zone I3)
> الهدف: تحويل Meta App من Development → Live Mode

---

## 🎯 لماذا هذه الخطوة ضرورية؟

الـ WhatsApp API حالياً في **Development Mode** — يعني:
- الرسائل تُرسل فقط لأرقام مضافة كـ Test Numbers
- لا يمكن التواصل مع عملاء حقيقيين
- حد يومي منخفض (1000 رسالة/يوم)

بعد **Business Verification** → **Live Mode**:
- إرسال لأي رقم WhatsApp
- حد يومي أعلى بكثير (تبدأ بـ 1K ثم ترتفع)
- Meta Template Messages تُفعَّل

---

## 📋 المتطلبات من Meta

### 1. Meta Business Suite Account
- [ ] حساب مُسجَّل على business.facebook.com
- [ ] اسم العمل يطابق السجل التجاري
- [ ] رقم هاتف نشط مرتبط بالحساب

### 2. الوثائق المطلوبة من أحمد
- [ ] **السجل التجاري** — سجل شركة أريج لماكينات وخدمات الطباعة
- [ ] **رقم الـ Tax ID** أو البطاقة الضريبية
- [ ] **عنوان الشركة الرسمي** كما في السجل

### 3. الـ App في Meta Developer Console
- [ ] App مُنشأة (موجودة بالفعل — مُستخدمة في Development)
- [ ] WhatsApp Business API product مُضاف
- [ ] رقم الهاتف مُسجَّل ومُتحقق منه في الـ App

---

## 🔧 خطوات التحقق على Meta Business Suite

### الخطوة 1: إعداد الحساب
1. افتح [business.facebook.com](https://business.facebook.com)
2. من القائمة: **Settings → Business Info**
3. تأكد من صحة:
   - Business Name: **أريج لماكينات وخدمات الطباعة**
   - Business Email: البريد الرسمي
   - Business Phone: رقم نشط

### الخطوة 2: طلب التحقق
1. من القائمة: **Security Center → Start Verification**
2. اختر **Business Verification**
3. أدخل البيانات:
   - Legal Business Name
   - Business Address
   - Business Phone Number
4. رفع الوثائق (السجل التجاري / البطاقة الضريبية)

### الخطوة 3: انتظار الموافقة
- المدة: 3-7 أيام عمل (أحياناً أسرع)
- Meta قد تطلب وثائق إضافية عبر البريد الإلكتروني
- تابع البريد يومياً

---

## 🚀 بعد الموافقة: تحويل App لـ Live Mode

### في Meta Developer Console
1. افتح [developers.facebook.com](https://developers.facebook.com)
2. اختر الـ App
3. من الـ Top Bar: **"In Development"** → انقر → **"Switch to Live Mode"**
4. اقرأ التحذيرات → **Confirm**

### التحقق من النجاح
```bash
# اختبر إرسال رسالة لعميل حقيقي
curl -X POST "https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"201012345678","type":"text","text":{"body":"اختبار"}}'
# يجب أن يصل للعميل فعلاً
```

---

## ⚠️ تحذيرات مهمة

1. **Templates ضرورية لمحادثات جديدة** — لا يمكن بدء محادثة بدون Meta-approved template
2. **24 ساعة window** — بعد رد العميل، يمكن إرسال رسائل عادية لمدة 24 ساعة
3. **لا تُرسل Spam** — Meta تراقب وتُعاقب على الرسائل الغير مرغوبة
4. **Business Policy** — تأكد أن نشاطك يتوافق مع [Meta Business Policy](https://www.facebook.com/policies/commerce/)

---

## 📝 حالة أريج الحالية

| العنصر | الحالة |
|--------|--------|
| Meta App | ✅ موجودة (Development Mode) |
| WhatsApp API | ✅ تعمل (test numbers) |
| Business Suite Account | ❓ يحتاج تأكيد أحمد |
| Business Verification | 🔴 لم تبدأ بعد |
| Live Mode | 🔴 ينتظر التحقق |

---

## 🔗 روابط مفيدة

- [Meta Business Verification Guide](https://www.facebook.com/business/help/2058515294227817)
- [WhatsApp Business API Overview](https://developers.facebook.com/docs/whatsapp/overview)
- [Meta Developer Console](https://developers.facebook.com)
- [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy/)

---

> **الخطوة التالية:** أحمد يجمع الوثائق المطلوبة ويبدأ طلب التحقق على business.facebook.com
