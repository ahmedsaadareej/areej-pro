'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
// ============================================================
// CONTRACTS (مولّد العقود)
// ============================================================

// GET /api/system/contracts/templates — قائمة القوالب
router.get('/contracts/templates', (req, res) => {
    const db = req.db;
res.json({ ok: true, templates: CONTRACT_TEMPLATES.map(t => ({ id: t.id, name: t.name, desc: t.desc })) });
});

// POST /api/system/contracts/generate — توليد عقد HTML
router.post('/contracts/generate', (req, res) => {
    const db = req.db;
    try {
    let { template_id, client, contract, party_a, party_b, date, details } = req.body;
    // Support flat fields (party_a/party_b) as well as nested {client:{name}}
    if (!client?.name && party_b) client = { name: party_b };
    if (!client?.name && party_a) client = { name: party_a };
    if (!template_id || !client?.name) {
      return res.status(400).json({ ok: false, error: 'القالب واسم العميل مطلوبان' });
    }
    if (!contract && (date||details)) contract = { date: date||'', details: details||'' };
    const tmpl = CONTRACT_TEMPLATES.find(t => t.id === template_id);
    if (!tmpl) return res.status(404).json({ ok: false, error: 'قالب غير موجود' });
    const html = tmpl.generate({ client, contract: contract || {} });
    // Return as JSON with html field OR raw HTML based on Accept header
    if (req.headers['accept']?.includes('text/html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
    res.json({ ok: true, html });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// قوالب العقود
const CONTRACT_TEMPLATES = [
  {
    id: 'printing-services',
    name: 'عقد خدمات طباعة',
    desc: 'للبراندات اللي بتطلب خدمات طباعة منتظمة',
    generate: ({ client, contract }) => contractBase({
      title: 'عقد خدمات طباعة على الملابس',
      client,
      contract,
      body: `
        <h3>أولاً: نطاق الخدمة</h3>
        <p>تلتزم شركة أريج للطباعة بتقديم خدمات الطباعة على الملابس للطرف الثاني وفقًا للمواصفات المتفق عليها.</p>
        <ul>
          <li>نوع الطباعة: ${esc(contract.print_type || 'طباعة حرارية / سكرين')}</li>
          <li>الكمية: ${esc(contract.quantity || 'حسب الاتفاق')}</li>
          <li>مدة التسليم: ${esc(contract.delivery_days || '7—1٠٤')} أيام عمل</li>
        </ul>
        <h3>ثانيًا: الأسعار والدفع</h3>
        <p>القيمة الإجمالية: <strong>${esc(contract.total_price || 'حسب الاتفاق')} ج.م</strong></p>
        <p>شروط الدفع: عربون 50% عند تأكيد الطلب والباقي عند الاستلام.</p>
        <h3>ثالثًا: مسؤوليات الطرفين</h3>
        <p>يلتزم الطرف الثاني بتوفير التصاميم بجودة عالية (دقة لا تقل عن 150 dpi) قبل بدء الإنتاج.</p>
        <p>تلتزم شركة أريج بضمان جودة الطباعة والتسليم خلال المدة المتفق عليها.</p>
        <h3>رابعًا: حالات إلغاء العقد</h3>
        <p>للطرف الأول حق إلغاء العقد مع استرداد العربون كاملاً في حال عدم بدء التنفيذ. بعد بدء الإنتاج لا يحق استرداد العربون.</p>
      `
    })
  },
  {
    id: 'brand-partnership',
    name: 'عقد شراكة براند',
    desc: 'للتعاون المستمر مع براند ثابت على طول السنة',
    generate: ({ client, contract }) => contractBase({
      title: 'عقد شراكة وتعاون',
      client,
      contract,
      body: `
        <h3>أولاً: محور الشراكة</h3>
        <p>يتفق الطرفان على إقامة شراكة تسويقية بين شركة أريج للطباعة وبراند ${esc(client.brand || client.name)} وذلك لمدة ${esc(contract.duration || '12')} شهراً.</p>
        <h3>ثانيًا: التزامات الطرف الثاني</h3>
        <ul>
          <li>طلب منتجات الطباعة حصريًا من أريج</li>
          <li>حجم شهري مضمون: ${esc(contract.monthly_qty || 'حسب الاتفاق')}</li>
          <li>سعر مخصص للشريك: ${esc(contract.discount_pct || '10')}%</li>
        </ul>
        <h3>ثالثًا: التزامات شركة أريج</h3>
        <ul>
          <li>أولوية في التنفيذ وضمان الجودة</li>
          <li>تسليم خلال ${esc(contract.delivery_days || '5–7')} أيام عمل</li>
          <li>تحمل تكاليف الشحن داخل القاهرة والإسكندرية</li>
        </ul>
        <h3>رابعًا: الدفع والتجديد</h3>
        <p>يُسدّد شهريًا خلال 3 أيام من استلام الفاتورة. يُجدّد العقد تلقائيًا ما لم يُبلغ أي طرف رغبته في الإنهاء قبل نهاية المدة بشهر.</p>
      `
    })
  },
  {
    id: 'freelance-designer',
    name: 'عقد مصمم حر',
    desc: 'للتعاقد مع مصمم خارجي على مشروع محدد',
    generate: ({ client, contract }) => contractBase({
      title: 'عقد تقديم خدمات تصميم',
      client,
      contract,
      body: `
        <h3>أولاً: نطاق العمل</h3>
        <p>يلتزم المصمّم بتقديم خدمات التصميم التالية:</p>
        <ul>
          <li>تصميم شعار البراند</li>
          <li>تصميمات للطباعة على الملابس</li>
          <li>مراجعة حتى ${esc(contract.revisions || '3')} تعديلات</li>
        </ul>
        <h3>ثانيًا: المقابل المالي</h3>
        <p>إجمالي المشروع: <strong>${esc(contract.total_price || 'حسب الاتفاق')} ج.م</strong></p>
        <p>دفعة أولى 50% لبدء العمل — والباقي عند تسليم الملفات النهائية.</p>
        <h3>ثالثًا: المواعيد</h3>
        <p>مدة المشروع: ${esc(contract.duration_days || '14')} يوم من تاريخ تأكيد الطلب واستلام الدفعة الأولى.</p>
        <h3>رابعًا: حقوق الملكية</h3>
        <p>تنتقل جميع حقوق الملكية الفكرية للطرف الأول فور استلام الدفعة الأخيرة كاملة. للمصمّم حق عرض العمل في ملفه الشخصي.</p>
      `
    })
  }
];

function contractBase({ title, client, contract, body }) {
  const today = fmt_date(new Date().toISOString());
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#fff;color:#1a1a1a;padding:40px;max-width:720px;margin:auto;line-height:1.8}
.header{border-bottom:3px solid #1B5E30;padding-bottom:20px;margin-bottom:28px}
.brand-line{display:flex;justify-content:space-between;align-items:flex-start}
.brand h1{font-size:24px;font-weight:800;color:#1B5E30}
.brand p{font-size:12px;color:#6b7280}
.contract-title{text-align:center;margin:24px 0;padding:16px;background:#f0fdf4;border-radius:10px;border:2px solid #1B5E30}
.contract-title h2{font-size:20px;font-weight:800;color:#1B5E30}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.party-box{border:1.5px solid #e5e7eb;border-radius:10px;padding:14px}
.party-box h3{font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:8px}
.party-name{font-size:16px;font-weight:700;color:#1B5E30;margin-bottom:4px}
.party-info{font-size:13px;color:#6b7280}
body > h3{font-size:15px;font-weight:700;color:#1B5E30;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
body > ul{padding-right:20px;margin-bottom:12px}
body > ul li{margin-bottom:6px;font-size:14px}
body > p{font-size:14px;margin-bottom:10px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:48px;padding-top:24px;border-top:2px dashed #e5e7eb}
.sig-box{text-align:center}
.sig-line{border-bottom:2px solid #1B5E30;margin-bottom:8px;height:48px}
.sig-label{font-size:13px;color:#6b7280;font-weight:600}
.sig-name{font-size:14px;font-weight:700;margin-top:4px}
.footer{margin-top:32px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px}
.no-print{margin-bottom:20px;display:flex;gap:10px}
@media print{.no-print{display:none}body{padding:20px}}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#1B5E30;color:#fff;border:none;border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer">🖨️ طباعة / حفظ PDF</button>
  <button onclick="window.close()" style="padding:8px 16px;background:#f3f4f6;border:none;border-radius:8px;font-family:'Cairo',sans-serif;cursor:pointer">إغلاق</button>
</div>

<div class="header">
  <div class="brand-line">
    <div class="brand"><h1>أريج للطباعة على الملابس</h1><p>areejegypt.com | 01222784206</p></div>
    <div style="text-align:left;font-size:13px;color:#6b7280">تاريخ العقد: ${today}<br>رقم: ${esc(contract.ref || 'CON-'+Date.now().toString().slice(-5))}</div>
  </div>
</div>

<div class="contract-title"><h2>${esc(title)}</h2></div>

<div class="parties">
  <div class="party-box">
    <h3>الطرف الأول (مقدّم الخدمة)</h3>
    <div class="party-name">شركة أريج للطباعة</div>
    <div class="party-info">القاهرة، جمهورية مصر العربية<br>sales@areejegypt.com</div>
  </div>
  <div class="party-box">
    <h3>الطرف الثاني (العميل)</h3>
    <div class="party-name">${esc(client.brand || client.name)}</div>
    <div class="party-info">
      ${client.name ? 'الممثل: '+esc(client.name)+'<br>' : ''}
      ${client.phone ? 'هاتف: '+esc(client.phone)+'<br>' : ''}
      ${client.email ? 'email: '+esc(client.email) : ''}
    </div>
  </div>
</div>

<p style="margin-bottom:16px"><strong>تمهيد:</strong> اتفق الطرفان على البنود والشروط الواردة بهذا العقد وذلك في تاريخ ${today}.</p>

${body}

<div class="sigs">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">توقيع الطرف الأول</div>
    <div class="sig-name">شركة أريج للطباعة</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">توقيع الطرف الثاني</div>
    <div class="sig-name">${esc(client.brand || client.name)}</div>
  </div>
</div>

<div class="footer">هذا العقد محرر إلكترونيًا ويعد ساري المفعول بتوقيع الطرفين — أريج للطباعة &copy; ${new Date().getFullYear()}</div>
</body></html>`;
}


module.exports = router;
