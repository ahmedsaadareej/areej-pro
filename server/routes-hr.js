/**
 * HR Module — /api/hr/*
 * موظفين، حضور، مرتبات، دفع من الخزينة
 */
const express = require('express');
const router = express.Router();
const { getTenantDb } = require('./db-tenant');
const { requireAuth } = require('./auth-middleware');
require('dotenv').config();

router.use(requireAuth);
router.use((req, res, next) => {
  req.db = getTenantDb(req.user.id);
  next();
});

// L5: Query builder آمن ومنظّم — بديل string concatenation
// الاستخدام: const { clause, params } = buildWhere([...conditions])
// كل condition: { sql: 'col = ?', val: value } أو { sql: 'col IN (?,?)', vals: [a,b] }
function buildWhere(conditions) {
  const clauses = ['1=1'];
  const params = [];
  for (const c of conditions) {
    if (c == null) continue;
    clauses.push(c.sql);
    if (Array.isArray(c.vals)) params.push(...c.vals);
    else if (c.val !== undefined) params.push(c.val);
  }
  return { clause: 'WHERE ' + clauses.join(' AND '), params };
}

// ============================================================
// EMPLOYEES
// ============================================================

// GET /api/hr/employees
router.get('/employees', (req, res) => {
  try {
    const db = req.db;
    const { search, active } = req.query;
    const s = search ? '%' + search + '%' : null;
    const { clause, params } = buildWhere([
      s ? { sql: '(name LIKE ? OR job_title LIKE ? OR department LIKE ?)', vals: [s, s, s] } : null,
      active !== undefined ? { sql: 'active=?', val: active === '1' ? 1 : 0 } : null,
    ]);

    const employees = db.prepare(`SELECT * FROM hr_employees ${clause} ORDER BY name ASC`).all(...params);

    // Enrich with current month attendance summary
    const currentMonth = new Date().toISOString().slice(0,7);
    const enriched = employees.map(emp => {
      const att = db.prepare(`
        SELECT
          COUNT(*) as total_days,
          SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as days_present,
          SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as days_absent,
          SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) as days_late,
          SUM(CASE WHEN status='leave' THEN 1 ELSE 0 END) as days_leave
        FROM hr_attendance
        WHERE employee_id=? AND strftime('%Y-%m', work_date)=?
      `).get(emp.id, currentMonth);
      return { ...emp, this_month: att };
    });

    res.json({ ok: true, data: enriched });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/hr/employees/:id
router.get('/employees/:id', (req, res) => {
  try {
    const db = req.db;
    const emp = db.prepare('SELECT * FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    const attendance = db.prepare('SELECT * FROM hr_attendance WHERE employee_id=? ORDER BY work_date DESC LIMIT 31').all(emp.id);
    const payroll = db.prepare('SELECT * FROM hr_payroll WHERE employee_id=? ORDER BY period_month DESC LIMIT 12').all(emp.id);
    res.json({ ok: true, data: { ...emp, attendance, payroll } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/employees
router.post('/employees', (req, res) => {
  try {
    const db = req.db;
    const { name, email, phone, national_id, job_title, department, hire_date, base_salary, salary_type, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'اسم الموظف مطلوب' });
    const r = db.prepare(`
      INSERT INTO hr_employees (name, email, phone, national_id, job_title, department, hire_date, base_salary, salary_type, default_role_id, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(name.trim(), email?.trim().toLowerCase()||null, phone||null, national_id||null, job_title||null, department||null,
           hire_date||null, base_salary||0, salary_type||'monthly',
           parseInt(req.body.default_role_id)||null, notes||null);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/hr/employees/:id
router.put('/employees/:id', (req, res) => {
  try {
    const db = req.db;
    const { name, email, phone, national_id, job_title, department, hire_date, base_salary, salary_type, active, notes } = req.body;
    const emp = db.prepare('SELECT id FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    db.prepare(`UPDATE hr_employees SET
      name=COALESCE(?,name), email=COALESCE(?,email), phone=COALESCE(?,phone), national_id=COALESCE(?,national_id),
      job_title=COALESCE(?,job_title), department=COALESCE(?,department), hire_date=COALESCE(?,hire_date),
      base_salary=COALESCE(?,base_salary), salary_type=COALESCE(?,salary_type),
      active=COALESCE(?,active), default_role_id=COALESCE(?,default_role_id), notes=COALESCE(?,notes) WHERE id=?`
    ).run(name||null, email?.trim().toLowerCase()||null, phone||null, national_id||null, job_title||null, department||null,
          hire_date||null, base_salary||null, salary_type||null,
          active !== undefined ? (active ? 1 : 0) : null,
          req.body.default_role_id !== undefined ? (parseInt(req.body.default_role_id)||null) : null,
          notes||null, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/hr/employees/:id
router.delete('/employees/:id', (req, res) => {
  try {
    const db = req.db;
    db.prepare('DELETE FROM hr_employees WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// ATTENDANCE
// ============================================================

// GET /api/hr/attendance?employee_id=&month=2026-04
router.get('/attendance', (req, res) => {
  try {
    const db = req.db;
    const { employee_id, month } = req.query;
    const { clause, params } = buildWhere([
      employee_id ? { sql: 'a.employee_id=?', val: employee_id } : null,
      month       ? { sql: "strftime('%Y-%m', a.work_date)=?", val: month } : null,
    ]);

    const rows = db.prepare(`
      SELECT a.*, e.name as employee_name, e.job_title
      FROM hr_attendance a
      JOIN hr_employees e ON e.id = a.employee_id
      ${clause}
      ORDER BY a.work_date DESC, e.name ASC
    `).all(...params);

    res.json({ ok: true, data: rows });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/attendance — single record (upsert)
router.post('/attendance', (req, res) => {
  try {
    const db = req.db;
    const { employee_id, work_date, check_in, check_out, status, notes } = req.body;
    if (!employee_id || !work_date) return res.status(400).json({ ok: false, error: 'الموظف والتاريخ مطلوبين' });

    db.prepare(`
      INSERT INTO hr_attendance (employee_id, work_date, check_in, check_out, status, notes)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET
        check_in=excluded.check_in, check_out=excluded.check_out,
        status=excluded.status, notes=excluded.notes
    `).run(employee_id, work_date, check_in||null, check_out||null, status||'present', notes||null);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/attendance/bulk — تسجيل حضور يوم كامل لكل الموظفين
router.post('/attendance/bulk', (req, res) => {
  try {
    const db = req.db;
    const { work_date, records } = req.body; // records: [{employee_id, status, check_in, check_out}]
    if (!work_date || !Array.isArray(records)) {
      return res.status(400).json({ ok: false, error: 'التاريخ والسجلات مطلوبة' });
    }
    const upsert = db.prepare(`
      INSERT INTO hr_attendance (employee_id, work_date, check_in, check_out, status)
      VALUES (?,?,?,?,?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET
        check_in=excluded.check_in, check_out=excluded.check_out, status=excluded.status
    `);
    const tx = db.transaction(rows => { rows.forEach(r => upsert.run(r.employee_id, work_date, r.check_in||null, r.check_out||null, r.status||'present')); });
    tx(records);
    res.json({ ok: true, count: records.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// PAYROLL — حساب ودفع المرتبات
// ============================================================

// GET /api/hr/payroll?month=2026-04
router.get('/payroll', (req, res) => {
  try {
    const db = req.db;
    const { month } = req.query;
    const { clause, params } = buildWhere([
      month ? { sql: 'p.period_month=?', val: month } : null,
    ]);

    const rows = db.prepare(`
      SELECT p.*, e.name as employee_name, e.job_title, e.department,
             w.name as wallet_name
      FROM hr_payroll p
      JOIN hr_employees e ON e.id = p.employee_id
      LEFT JOIN sys_wallets w ON w.id = p.wallet_id
      ${clause}
      ORDER BY p.period_month DESC, e.name ASC
    `).all(...params);
    res.json({ ok: true, data: rows });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/payroll/calculate — حساب مرتب شهر
router.post('/payroll/calculate', (req, res) => {
  try {
    const db = req.db;
    const { period_month } = req.body; // e.g. "2026-04"
    if (!period_month) return res.status(400).json({ ok: false, error: 'الشهر مطلوب' });

    const employees = db.prepare('SELECT * FROM hr_employees WHERE active=1').all();
    const upsert = db.prepare(`
      INSERT INTO hr_payroll (employee_id, period_month, base_salary, bonus, deductions, net_salary, days_worked, days_absent, status)
      VALUES (?,?,?,0,0,?,?,?,  'draft')
      ON CONFLICT(employee_id, period_month) DO UPDATE SET
        base_salary=excluded.base_salary, days_worked=excluded.days_worked,
        days_absent=excluded.days_absent, net_salary=excluded.net_salary
      WHERE status='draft'
    `);

    const results = [];
    const tx = db.transaction(() => {
      for (const emp of employees) {
        // Get attendance for the month
        const att = db.prepare(`
          SELECT
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as days_worked,
            SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as days_absent
          FROM hr_attendance
          WHERE employee_id=? AND strftime('%Y-%m', work_date)=?
        `).get(emp.id, period_month);

        const daysWorked = att?.days_worked || 0;
        const daysAbsent = att?.days_absent || 0;

        // Calculate net salary (daily rate if absent deductions needed)
        // Working days in month ≈ 26
        const workingDaysInMonth = 26;
        const dailyRate = emp.base_salary / workingDaysInMonth;
        const deductions = daysAbsent * dailyRate;
        const netSalary = Math.max(0, emp.base_salary - deductions);

        upsert.run(emp.id, period_month, emp.base_salary, netSalary, daysWorked, daysAbsent);
        results.push({ employee_id: emp.id, name: emp.name, days_worked: daysWorked, days_absent: daysAbsent, net_salary: +netSalary.toFixed(2) });
      }
    });
    tx();

    res.json({ ok: true, data: results, period_month });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/hr/payroll/:id — update bonus/deductions manually
router.put('/payroll/:id', (req, res) => {
  try {
    const db = req.db;
    const { bonus, deductions, notes } = req.body;
    const p = db.prepare('SELECT * FROM hr_payroll WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'السجل غير موجود' });
    if (p.status === 'paid') return res.status(400).json({ ok: false, error: 'المرتب تم صرفه ولا يمكن تعديله' });

    const newBonus = bonus ?? p.bonus;
    const newDeductions = deductions ?? p.deductions;
    const netSalary = Math.max(0, p.base_salary + newBonus - newDeductions);

    db.prepare(`UPDATE hr_payroll SET bonus=?, deductions=?, net_salary=?, notes=COALESCE(?,notes) WHERE id=?`)
      .run(newBonus, newDeductions, netSalary, notes||null, req.params.id);
    res.json({ ok: true, net_salary: netSalary });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/payroll/:id/pay — دفع المرتب من الخزينة
router.post('/payroll/:id/pay', (req, res) => {
  try {
    const db = req.db;
    const { wallet_id, notes } = req.body;
    if (!wallet_id) return res.status(400).json({ ok: false, error: 'اختر الخزينة' });

    const p = db.prepare('SELECT p.*, e.name as emp_name FROM hr_payroll p JOIN hr_employees e ON e.id=p.employee_id WHERE p.id=?').get(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'السجل غير موجود' });
    if (p.status === 'paid') return res.status(400).json({ ok: false, error: 'تم الصرف مسبقاً' });

    const wallet = db.prepare('SELECT * FROM sys_wallets WHERE id=?').get(wallet_id);
    if (!wallet) return res.status(404).json({ ok: false, error: 'الخزينة غير موجودة' });

    const tx = db.transaction(() => {
      // Create treasury transaction
      const txn = db.prepare(`
        INSERT INTO sys_transactions (wallet_id, type, amount, category, description, ref_type, ref_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(wallet_id, 'out', p.net_salary, 'payroll',
             `مرتب ${p.emp_name} — ${p.period_month}` + (notes ? ` — ${notes}` : ''),
             'hr_payroll', p.id);

      // Update wallet balance
      db.prepare('UPDATE sys_wallets SET balance = balance - ? WHERE id=?').run(p.net_salary, wallet_id);

      // Mark payroll as paid
      db.prepare(`UPDATE hr_payroll SET status='paid', wallet_id=?, transaction_id=?, paid_at=datetime('now') WHERE id=?`)
        .run(wallet_id, txn.lastInsertRowid, p.id);

      return txn.lastInsertRowid;
    });

    const txnId = tx();
    res.json({ ok: true, transaction_id: txnId, net_salary: p.net_salary });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/hr/summary — ملخص HR للداشبورد
router.get('/summary', (req, res) => {
  try {
    const db = req.db;
    const currentMonth = new Date().toISOString().slice(0,7);
    const today = new Date().toISOString().slice(0,10);

    const totalEmployees = db.prepare('SELECT COUNT(*) as n FROM hr_employees WHERE active=1').get().n;
    const todayPresent = db.prepare("SELECT COUNT(*) as n FROM hr_attendance WHERE work_date=? AND status IN ('present','late')").get(today).n;
    const todayAbsent = db.prepare("SELECT COUNT(*) as n FROM hr_attendance WHERE work_date=? AND status='absent'").get(today).n;

    const payrollMonth = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as pending_count,
        SUM(net_salary) as total_payroll,
        SUM(CASE WHEN status='paid' THEN net_salary ELSE 0 END) as paid_amount,
        SUM(CASE WHEN status='draft' THEN net_salary ELSE 0 END) as pending_amount
      FROM hr_payroll WHERE period_month=?
    `).get(currentMonth);

    res.json({ ok: true, data: { totalEmployees, todayPresent, todayAbsent, today, currentMonth, payroll: payrollMonth } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
// ACTIVATE / RESET SYSTEM ACCESS
// ============================================================

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function generatePassword() {
  // 10 chars: letters + digits, readable
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from(crypto.randomBytes(10)).map(b => chars[b % chars.length]).join('');
}

// POST /api/hr/employees/:id/activate — تفعيل وصول السيستم للموظف
router.post('/employees/:id/activate', async (req, res) => {
  const db = req.db;
  try {
    let { role_id } = req.body;
    const emp = db.prepare('SELECT * FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    if (!emp.email) return res.status(400).json({ ok: false, error: 'الموظف ليس عنده إيميل — أضفه أولاً' });
    if (emp.system_user_id) return res.status(400).json({ ok: false, error: 'الموظف عنده وصول بالفعل — استخدم إعادة تعيين الباسورد' });
    // Use employee default role if none specified
    if (!role_id && emp.default_role_id) role_id = emp.default_role_id;

    // Check max users
    const count = db.prepare('SELECT COUNT(*) as n FROM tenant_users').get().n;
    if (count >= 10) return res.status(400).json({ ok: false, error: 'الحد الأقصى 10 مستخدمين لكل حساب' });

    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);

    // Create tenant_user
    const result = db.prepare(`
      INSERT INTO tenant_users (name, email, password, password_plain, role_id, employee_id, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(emp.name, emp.email, hash, password, role_id || null, emp.id);

    const userId = result.lastInsertRowid;

    // Link back to employee
    db.prepare('UPDATE hr_employees SET system_user_id=? WHERE id=?').run(userId, emp.id);

    // Get owner info for email (owner_email is the "company email" sub-users use to login)
    const master = require('./db-master');
    const owner = master.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);

    // Send welcome email
    if (process.env.SMTP_USER && emp.email) {
      try {
        const transport = makeTransport();
        const roleName = role_id ? (db.prepare('SELECT name FROM tenant_roles WHERE id=?').get(role_id)?.name || '') : '—';
        await transport.sendMail({
          from: `"نظام أريج" <${process.env.SMTP_USER}>`,
          to: emp.email,
          subject: `مرحباً بك في نظام أريج — بيانات دخولك`,
          html: `
            <div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
              <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:32px">🌱</div>
                <h2 style="color:#1B5E30;margin:8px 0">مرحباً بك يا ${emp.name}!</h2>
              </div>
              <div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px">
                <p style="color:#374151;margin:0 0 16px">تم تفعيل حسابك في <strong>${owner?.name || 'أريج'}</strong> — دورك: <strong>${roleName}</strong></p>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:8px;background:#f3f4f6;border-radius:6px 0 0 6px;font-size:13px;color:#6b7280;width:40%">رابط الدخول</td>
                    <td style="padding:8px;background:#f3f4f6;border-radius:0 6px 6px 0;font-size:13px"><a href="https://${owner?.slug || ''}.areejegypt.com/" style="color:#1B5E30;font-weight:700;word-break:break-all">https://${owner?.slug || ''}.areejegypt.com/</a></td></tr>
                  <tr><td style="padding:8px;font-size:13px;color:#6b7280">إيميلك</td>
                    <td style="padding:8px;font-size:13px;font-weight:700">${emp.email}</td></tr>
                  <tr><td style="padding:8px;background:#f3f4f6;font-size:13px;color:#6b7280">كلمة السر</td>
                    <td style="padding:8px;font-size:20px;font-weight:900;color:#1B5E30;letter-spacing:2px">${password}</td></tr>
                </table>
              </div>
              <p style="font-size:12px;color:#9ca3af;text-align:center">هذه البيانات سرية — لا تشاركها مع أحد</p>
            </div>
          `
        });
      } catch(emailErr) {
        console.error('Email send error:', emailErr.message);
      }
    }

    res.json({ ok: true, user_id: userId, password, message: 'تم تفعيل الوصول وإرسال بيانات الدخول على الإيميل' });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ ok: false, error: 'الإيميل مستخدم بالفعل — موظف آخر عنده نفس الإيميل' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/hr/employees/:id/reset-password — إعادة تعيين الباسورد (Admin only)
router.post('/employees/:id/reset-password', async (req, res) => {
  const db = req.db;
  try {
    const { new_password } = req.body;
    const emp = db.prepare('SELECT * FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    if (!emp.system_user_id) return res.status(400).json({ ok: false, error: 'الموظف ليس عنده وصول — فعّله أولاً' });

    const password = new_password?.trim() || generatePassword();
    const hash = await bcrypt.hash(password, 10);

    db.prepare('UPDATE tenant_users SET password=?, password_plain=? WHERE id=?').run(hash, password, emp.system_user_id);

    // Send email with new password
    const master = require('./db-master');
    const owner = master.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);

    if (process.env.SMTP_USER && emp.email) {
      try {
        const transport = makeTransport();
        await transport.sendMail({
          from: `"نظام أريج" <${process.env.SMTP_USER}>`,
          to: emp.email,
          subject: `تم تغيير كلمة السر — نظام أريج`,
          html: `
            <div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
              <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:32px">🔑</div>
                <h2 style="color:#1B5E30;margin:8px 0">تم تغيير كلمة سرك</h2>
              </div>
              <div style="background:#fff;border-radius:10px;padding:20px">
                <p style="color:#374151;margin:0 0 12px">تم تغيير كلمة سر حسابك في <strong>${owner?.name || 'أريج'}</strong></p>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:8px;background:#f3f4f6;font-size:13px;color:#6b7280;width:40%">إيميلك</td>
                    <td style="padding:8px;background:#f3f4f6;font-size:13px;font-weight:700">${emp.email}</td></tr>
                  <tr><td style="padding:8px;background:#f3f4f6;font-size:13px;color:#6b7280">رابط الدخول</td>
                    <td style="padding:8px;background:#f3f4f6;font-size:13px"><a href="https://${owner?.slug || ''}.areejegypt.com/" style="color:#1B5E30;font-weight:700">https://${owner?.slug || ''}.areejegypt.com/</a></td></tr>
                  <tr><td style="padding:8px;font-size:13px;color:#6b7280">كلمة السر الجديدة</td>
                    <td style="padding:8px;font-size:20px;font-weight:900;color:#1B5E30;letter-spacing:2px">${password}</td></tr>
                </table>
              </div>
            </div>
          `
        });
      } catch(emailErr) {
        console.error('Email error:', emailErr.message);
      }
    }

    res.json({ ok: true, password, message: 'تم تغيير كلمة السر وإرسالها على إيميل الموظف' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/employees/:id/resend-credentials — إعادة إرسال بيانات الدخول (نفس الباسورد — بدون تغيير)
router.post('/employees/:id/resend-credentials', async (req, res) => {
  const db = req.db;
  try {
    const emp = db.prepare('SELECT * FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    if (!emp.system_user_id) return res.status(400).json({ ok: false, error: 'الموظف ليس عنده وصول — فعّله أولاً' });
    if (!emp.email) return res.status(400).json({ ok: false, error: 'الموظف ليس عنده إيميل' });

    // Get stored password (plain) — NO change to password
    const userRow = db.prepare('SELECT role_id, password_plain FROM tenant_users WHERE id=?').get(emp.system_user_id);
    const password = userRow?.password_plain;
    if (!password) return res.status(400).json({ ok: false, error: 'لا يوجد باسورد محفوظ — استخدم زر "باسورد جديد" بدلاً' });

    // Get role name
    const roleName = userRow?.role_id
      ? (db.prepare('SELECT name FROM tenant_roles WHERE id=?').get(userRow.role_id)?.name || '')
      : '—';

    // Get owner info
    const master = require('./db-master');
    const owner = master.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);

    // Send email
    if (process.env.SMTP_USER && emp.email) {
      try {
        const transport = makeTransport();
        await transport.sendMail({
          from: `"نظام أريج" <${process.env.SMTP_USER}>`,
          to: emp.email,
          subject: `تذكير ببيانات الدخول — نظام أريج`,
          html: `
            <div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
              <div style="text-align:center;margin-bottom:20px">
                <div style="font-size:32px">🔑</div>
                <h2 style="color:#1B5E30;margin:8px 0">تذكير ببيانات دخولك</h2>
                <p style="color:#6b7280;font-size:13px">طلب منك المدير إعادة إرسال البيانات</p>
              </div>
              <div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:8px;background:#f3f4f6;border-radius:6px 0 0 6px;font-size:13px;color:#6b7280;width:40%">رابط الدخول</td>
                    <td style="padding:8px;background:#f3f4f6;border-radius:0 6px 6px 0;font-size:13px"><a href="https://${owner?.slug || ''}.areejegypt.com/" style="color:#1B5E30;font-weight:700;word-break:break-all">https://${owner?.slug || ''}.areejegypt.com/</a></td></tr>
                  <tr><td style="padding:8px;font-size:13px;color:#6b7280">إيميلك</td>
                    <td style="padding:8px;font-size:13px;font-weight:700">${emp.email}</td></tr>
                  <tr><td style="padding:8px;background:#f3f4f6;font-size:13px;color:#6b7280">كلمة السر</td>
                    <td style="padding:8px;font-size:20px;font-weight:900;color:#1B5E30;letter-spacing:2px">${password}</td></tr>
                  <tr><td style="padding:8px;background:#f3f4f6;font-size:13px;color:#6b7280">دورك</td>
                    <td style="padding:8px;background:#f3f4f6;font-size:13px">${roleName}</td></tr>
                </table>
              </div>
              <p style="font-size:12px;color:#9ca3af;text-align:center">هذه البيانات سرية — لا تشاركها مع أحد</p>
            </div>
          `
        });
      } catch(emailErr) {
        console.error('Email error:', emailErr.message);
        // Still return ok — password was reset
      }
    }

    res.json({ ok: true, message: 'تم إرسال بيانات الدخول على إيميل الموظف' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/employees/:id/deactivate — إيقاف وصول السيستم
router.post('/employees/:id/deactivate', (req, res) => {
  const db = req.db;
  try {
    const emp = db.prepare('SELECT * FROM hr_employees WHERE id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'الموظف غير موجود' });
    if (!emp.system_user_id) return res.status(400).json({ ok: false, error: 'ليس عنده وصول' });
    db.prepare('UPDATE tenant_users SET active=0 WHERE id=?').run(emp.system_user_id);
    res.json({ ok: true, message: 'تم إيقاف وصول الموظف' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/hr/team-activity — نشاط الفريق (for team monitor page)
router.get('/team-activity', (req, res) => {
  const db = req.db;
  try {
    const members = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.active, u.last_login,
        r.name as role_name,
        e.id as employee_id, e.job_title, e.department, e.phone,
        e.system_user_id
      FROM tenant_users u
      LEFT JOIN tenant_roles r ON r.id = u.role_id
      LEFT JOIN hr_employees e ON e.system_user_id = u.id
      ORDER BY u.last_login DESC
    `).all();

    const today = new Date().toISOString().slice(0,10);
    const enriched = members.map(m => {
      let todayAtt = null;
      if (m.employee_id) {
        todayAtt = db.prepare('SELECT status, check_in, check_out FROM hr_attendance WHERE employee_id=? AND work_date=?').get(m.employee_id, today);
      }
      return { ...m, today_attendance: todayAtt };
    });

    res.json({ ok: true, data: enriched });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE ENDPOINTS (sub-user auth required)
// ════════════════════════════════════════════════════════════

// GET /api/hr/my/profile — بيانات الموظف الحالي
router.get('/my/profile', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const tenantUser = req.tenantUser; // set by auth-middleware for sub-users
    if (!tenantUser) return res.status(403).json({ ok: false, error: 'متاح للموظفين فقط' });

    const emp = db.prepare('SELECT * FROM hr_employees WHERE system_user_id=?').get(tenantUser.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'لم يتم ربط حسابك بملف موظف' });

    const today = new Date().toISOString().slice(0,10);
    const todayAtt = db.prepare('SELECT * FROM hr_attendance WHERE employee_id=? AND work_date=?').get(emp.id, today);

    // This month stats
    const month = today.slice(0,7);
    const monthStats = db.prepare(`
      SELECT 
        COUNT(*) as total_days,
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) as late
      FROM hr_attendance WHERE employee_id=? AND work_date LIKE ?
    `).get(emp.id, month + '%');

    res.json({ ok: true, employee: emp, today: todayAtt, month: monthStats });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/my/checkin — تسجيل حضور
router.post('/my/checkin', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const tenantUser = req.tenantUser;
    if (!tenantUser) return res.status(403).json({ ok: false, error: 'متاح للموظفين فقط' });

    const emp = db.prepare('SELECT * FROM hr_employees WHERE system_user_id=?').get(tenantUser.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'لم يتم ربط حسابك بملف موظف' });

    const today = new Date().toISOString().slice(0,10);
    const now = new Date().toTimeString().slice(0,5); // HH:MM

    // Check if already checked in today
    const existing = db.prepare('SELECT * FROM hr_attendance WHERE employee_id=? AND work_date=?').get(emp.id, today);
    if (existing && existing.check_in) {
      return res.status(400).json({ ok: false, error: 'تم تسجيل حضورك بالفعل اليوم في ' + existing.check_in });
    }

    // Determine status: late if after 09:00 (configurable in future)
    const workStartHour = 9;
    const currentHour = parseInt(now.split(':')[0]);
    const status = currentHour >= workStartHour + 1 ? 'late' : 'present';

    db.prepare(`
      INSERT INTO hr_attendance (employee_id, work_date, check_in, status)
      VALUES (?,?,?,?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET check_in=excluded.check_in, status=excluded.status
    `).run(emp.id, today, now, status);

    res.json({ ok: true, time: now, status, message: status === 'late' ? 'تم تسجيل الحضور — متأخر' : 'تم تسجيل الحضور ✅' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/hr/my/checkout — تسجيل انصراف
router.post('/my/checkout', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const tenantUser = req.tenantUser;
    if (!tenantUser) return res.status(403).json({ ok: false, error: 'متاح للموظفين فقط' });

    const emp = db.prepare('SELECT * FROM hr_employees WHERE system_user_id=?').get(tenantUser.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'لم يتم ربط حسابك بملف موظف' });

    const today = new Date().toISOString().slice(0,10);
    const now = new Date().toTimeString().slice(0,5);

    const existing = db.prepare('SELECT * FROM hr_attendance WHERE employee_id=? AND work_date=?').get(emp.id, today);
    if (!existing || !existing.check_in) {
      return res.status(400).json({ ok: false, error: 'سجّل حضورك أولاً' });
    }
    if (existing.check_out) {
      return res.status(400).json({ ok: false, error: 'تم تسجيل انصرافك بالفعل في ' + existing.check_out });
    }

    // Calculate hours worked
    const [inH, inM] = existing.check_in.split(':').map(Number);
    const [outH, outM] = now.split(':').map(Number);
    const hoursWorked = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;

    db.prepare('UPDATE hr_attendance SET check_out=? WHERE employee_id=? AND work_date=?').run(now, emp.id, today);

    res.json({ ok: true, time: now, hours: hoursWorked.toFixed(1), message: 'تم تسجيل الانصراف ✅ — عملت ' + hoursWorked.toFixed(1) + ' ساعة' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/hr/my/history — سجل الحضور (آخر 30 يوم)
router.get('/my/history', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const tenantUser = req.tenantUser;
    if (!tenantUser) return res.status(403).json({ ok: false, error: 'متاح للموظفين فقط' });

    const emp = db.prepare('SELECT id FROM hr_employees WHERE system_user_id=?').get(tenantUser.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'لم يتم ربط حسابك بملف موظف' });

    const { month } = req.query;
    const filter = month || new Date().toISOString().slice(0,7);

    const records = db.prepare(`
      SELECT work_date, check_in, check_out, status, notes
      FROM hr_attendance WHERE employee_id=? AND work_date LIKE ?
      ORDER BY work_date DESC
    `).all(emp.id, filter + '%');

    res.json({ ok: true, data: records, month: filter });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
