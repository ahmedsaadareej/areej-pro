const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"نظام أريج" <${process.env.SMTP_USER}>`,
    to, subject, html
  });
}

async function sendWelcome({ name, email, trial_ends }) {
  const date = new Date(trial_ends).toLocaleDateString('ar-EG');
  return sendMail({
    to: email,
    subject: '🎉 أهلاً بيك في نظام أريج!',
    html: `
<div dir="rtl" style="font-family:Cairo,sans-serif;max-width:600px;margin:auto;background:#f8f8f8;padding:30px;border-radius:12px">
  <div style="background:#1B5E30;padding:20px;border-radius:8px;text-align:center">
    <h1 style="color:#F5A623;margin:0">نظام أريج</h1>
    <p style="color:#fff;margin:5px 0">منصة إدارة أعمالك</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:8px;margin-top:16px">
    <h2 style="color:#1B5E30">أهلاً ${name}! 👋</h2>
    <p>تم تفعيل حسابك بنجاح. عندك <strong>14 يوم تجريبي مجاناً</strong> تنتهي في <strong>${date}</strong>.</p>
    <p>خلال التجربة هتقدر تستخدم كل مميزات النظام بالكامل:</p>
    <ul style="color:#333;line-height:2">
      <li>📦 إدارة المخزون</li>
      <li>🧾 الفواتير والعقود</li>
      <li>👥 CRM العملاء</li>
      <li>💰 الخزينة والمصاريف</li>
      <li>🚚 تتبع الطلبات والموزعين</li>
      <li>+ 10 أدوات تانية</li>
    </ul>
    <div style="text-align:center;margin-top:24px">
      <a href="https://pro.areejegypt.com/dashboard" style="background:#1B5E30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:18px">ابدأ دلوقتي →</a>
    </div>
  </div>
</div>`
  });
}

async function sendOTP({ email, code }) {
  return sendMail({
    to: email,
    subject: `${code} — كود تسجيل الدخول لنظام أريج`,
    html: `
<div dir="rtl" style="font-family:Cairo,sans-serif;max-width:500px;margin:auto">
  <h2 style="color:#1B5E30">كود تسجيل الدخول</h2>
  <div style="background:#f0f9f4;border:2px solid #1B5E30;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
    <p style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#1B5E30;margin:0">${code}</p>
  </div>
  <p style="color:#666">الكود صالح لمدة 10 دقائق. لو مش أنت اللي طلبته، تجاهل الإيميل ده.</p>
</div>`
  });
}

async function sendSubscriptionConfirm({ name, email, plan, amount, ends_at }) {
  const planNames = { monthly: 'شهري', yearly: 'سنوي', lifetime: 'مدى الحياة' };
  const endStr = ends_at ? `تنتهي في ${new Date(ends_at).toLocaleDateString('ar-EG')}` : 'لا تنتهي أبداً';
  return sendMail({
    to: email,
    subject: '✅ تم تفعيل اشتراكك في نظام أريج',
    html: `
<div dir="rtl" style="font-family:Cairo,sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#1B5E30">تم تفعيل الاشتراك ✅</h2>
  <p>أهلاً ${name}،</p>
  <p>تم تأكيد اشتراكك <strong>${planNames[plan]}</strong> بنجاح.</p>
  <div style="background:#f0f9f4;border-radius:8px;padding:16px;margin:16px 0">
    <p>💳 المبلغ المدفوع: <strong>${(amount/100).toLocaleString()} ج.م</strong></p>
    <p>📅 الاشتراك: ${endStr}</p>
  </div>
  <a href="https://pro.areejegypt.com/dashboard" style="background:#1B5E30;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none">ادخل على حسابك</a>
</div>`
  });
}


async function sendAdminCreatedAccount({ name, email, password, slug, days, login_url }) {
  const domainLink = login_url || ('https://' + slug + '.areejegypt.com/');
  return sendMail({
    to: email,
    subject: '🎉 تم إنشاء حسابك في نظام أريج!',
    html: `
<div dir="rtl" style="font-family:Cairo,sans-serif;max-width:600px;margin:auto;background:#f8f8f8;padding:30px;border-radius:12px">
  <div style="background:#1B5E30;padding:20px;border-radius:8px;text-align:center">
    <h1 style="color:#F5A623;margin:0">نظام أريج</h1>
    <p style="color:#fff;margin:5px 0">منصة إدارة أعمالك</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:8px;margin-top:16px">
    <h2 style="color:#1B5E30">أهلاً ${name}! 👋</h2>
    <p style="color:#333;line-height:1.8">تم إنشاء حسابك في نظام أريج. عندك <strong>${days} يوم</strong> تقدر تستخدم فيهم النظام بالكامل.</p>

    <div style="background:#f0fdf4;border-right:4px solid #1B5E30;border-radius:8px;padding:16px;margin:20px 0">
      <div style="font-size:15px;font-weight:700;color:#1B5E30;margin-bottom:12px">🔑 بيانات الدخول</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:100px">الرابط:</td>
            <td><a href="${domainLink}" style="color:#1B5E30;font-weight:700;word-break:break-all">${domainLink}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">الإيميل:</td>
            <td style="font-family:monospace;font-size:14px">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">كلمة السر:</td>
            <td style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px;color:#1B5E30">${password}</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="${domainLink}" style="background:#1B5E30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700">ادخل على النظام →</a>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin-top:20px;text-align:center">
      لو محتاج مساعدة تواصل معنا على <a href="mailto:sales@areejegypt.com" style="color:#1B5E30">sales@areejegypt.com</a>
    </p>
  </div>
</div>`
  });
}

module.exports = { sendWelcome, sendOTP, sendSubscriptionConfirm, sendAdminCreatedAccount, sendMail };
