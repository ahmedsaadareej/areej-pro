/**
 * payment-gateways.js — إدارة بوابات الدفع لكل Tenant
 * آخر تحديث: 2026-05-02
 *
 * Endpoints:
 *   GET    /payment-gateways          ← قائمة البوابات المتاحة + حالة كل بوابة
 *   GET    /payment-gateways/:name    ← تفاصيل بوابة واحدة
 *   POST   /payment-gateways/:name    ← حفظ/تحديث credentials بوابة
 *   DELETE /payment-gateways/:name    ← حذف credentials بوابة
 *   POST   /payment-gateways/:name/test ← اختبار الاتصال
 *
 * الجدول: payment_gateways (lazy migration)
 * البوابات المدعومة: fawaterk | paymob | instapay
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

// ── Encryption helpers (AES-256-GCM) ────────────────────────────────────────
// المفتاح مشتق من GATEWAY_SECRET أو fallback ثابت (يُغيَّر في production)
const ENC_KEY = crypto
  .createHash('sha256')
  .update(process.env.GATEWAY_SECRET || 'areej-pro-gw-secret-change-me')
  .digest(); // 32 bytes

function encrypt(text) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(stored) {
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      ENC_KEY,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

// ── البوابات المدعومة وحقولها ────────────────────────────────────────────────
const SUPPORTED_GATEWAYS = {
  fawaterk: {
    display_name: 'فواتيرك',
    icon: '🧾',
    fields: [
      { key: 'api_key',    label: 'API Key',    secret: true },
      { key: 'vendor_key', label: 'Vendor Key', secret: true },
    ],
    methods: ['card', 'wallet', 'fawry', 'aman', 'basata', 'apple'],
  },
  paymob: {
    display_name: 'Paymob',
    icon: '💳',
    fields: [
      { key: 'api_key',              label: 'API Key',              secret: true  },
      { key: 'public_key',           label: 'Public Key',           secret: false },
      { key: 'secret_key',           label: 'Secret Key',           secret: true  },
      { key: 'hmac_secret',          label: 'HMAC Secret',          secret: true  },
      { key: 'integration_card',     label: 'Integration ID (كارت)',       secret: false },
      { key: 'integration_wallet',   label: 'Integration ID (محفظة)',      secret: false },
      { key: 'integration_installment', label: 'Integration ID (تقسيط)', secret: false },
    ],
    methods: ['card', 'wallet', 'installment'],
  },
  instapay: {
    display_name: 'InstaPay',
    icon: '📱',
    fields: [
      { key: 'instapay_link', label: 'رابط InstaPay الخاص بك', secret: false },
    ],
    methods: ['instapay'],
  },
};

// ── Lazy Migration ────────────────────────────────────────────────────────────
function ensureTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS payment_gateways (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      gateway_name     TEXT NOT NULL UNIQUE,
      display_name     TEXT,
      enabled          INTEGER DEFAULT 0,
      credentials_json TEXT,
      config_json      TEXT,
      wallet_id        INTEGER DEFAULT NULL,
      commission_pct   REAL    DEFAULT 0,
      commission_fixed REAL    DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )
  `).run();
  // lazy migration للجداول القديمة
  const cols = db.prepare('PRAGMA table_info(payment_gateways)').all().map(c => c.name);
  if (!cols.includes('wallet_id'))        db.prepare('ALTER TABLE payment_gateways ADD COLUMN wallet_id INTEGER DEFAULT NULL').run();
  if (!cols.includes('commission_pct'))   db.prepare('ALTER TABLE payment_gateways ADD COLUMN commission_pct REAL DEFAULT 0').run();
  if (!cols.includes('commission_fixed')) db.prepare('ALTER TABLE payment_gateways ADD COLUMN commission_fixed REAL DEFAULT 0').run();
}

// ── Helper: قراءة بوابة من DB ────────────────────────────────────────────────
function getGateway(db, name) {
  return db.prepare('SELECT * FROM payment_gateways WHERE gateway_name = ?').get(name);
}

// ── Helper: إخفاء الـ secrets في الـ response ────────────────────────────────
function sanitizeCredentials(creds, gatewayName) {
  if (!creds) return {};
  const def = SUPPORTED_GATEWAYS[gatewayName];
  if (!def) return {};
  const out = {};
  for (const field of def.fields) {
    if (creds[field.key]) {
      out[field.key] = field.secret ? '••••••••' : creds[field.key];
    }
  }
  return out;
}

// ── GET /payment-gateways — قائمة كل البوابات ────────────────────────────────
router.get('/payment-gateways', (req, res) => {
  try {
    const db = req.db;
    ensureTable(db);

    const rows = db.prepare('SELECT * FROM payment_gateways').all();
    const rowMap = {};
    for (const r of rows) rowMap[r.gateway_name] = r;

    const result = Object.entries(SUPPORTED_GATEWAYS).map(([name, def]) => {
      const row   = rowMap[name];
      let creds   = {};
      if (row?.credentials_json) {
        try {
          const dec = decrypt(row.credentials_json);
          creds = dec ? JSON.parse(dec) : {};
        } catch {}
      }
      const configured = Object.keys(creds).length > 0;

      return {
        gateway_name:    name,
        display_name:    def.display_name,
        icon:            def.icon,
        enabled:         row ? !!row.enabled : false,
        configured,
        methods:         def.methods,
        fields:          def.fields.map(f => ({ key: f.key, label: f.label, secret: f.secret })),
        credentials:     sanitizeCredentials(creds, name),
        wallet_id:       row?.wallet_id        || null,
        commission_pct:  row?.commission_pct   || 0,
        commission_fixed:row?.commission_fixed || 0,
      };
    });

    // أضف قائمة الخزن للـ frontend
    let wallets = [];
    try {
      wallets = db.prepare("SELECT id, name, type FROM sys_wallets WHERE active=1 ORDER BY name").all();
    } catch {}

    res.json({ ok: true, gateways: result, wallets });
  } catch (err) {
    console.error('payment-gateways GET error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /payment-gateways/:name — تفاصيل بوابة واحدة ─────────────────────────
router.get('/payment-gateways/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!SUPPORTED_GATEWAYS[name]) {
    return res.status(404).json({ ok: false, error: 'بوابة غير معروفة' });
  }

  try {
    const db = req.db;
    ensureTable(db);

    const def = SUPPORTED_GATEWAYS[name];
    const row = getGateway(db, name);
    let creds = {};
    if (row?.credentials_json) {
      try {
        const dec = decrypt(row.credentials_json);
        creds = dec ? JSON.parse(dec) : {};
      } catch {}
    }

    let wallets = [];
    try {
      wallets = db.prepare("SELECT id, name, type FROM sys_wallets WHERE active=1 ORDER BY name").all();
    } catch {}

    res.json({
      ok:              true,
      gateway_name:    name,
      display_name:    def.display_name,
      icon:            def.icon,
      enabled:         row ? !!row.enabled : false,
      configured:      Object.keys(creds).length > 0,
      methods:         def.methods,
      fields:          def.fields,
      credentials:     sanitizeCredentials(creds, name),
      wallet_id:       row?.wallet_id        || null,
      commission_pct:  row?.commission_pct   || 0,
      commission_fixed:row?.commission_fixed || 0,
      wallets,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /payment-gateways/:name — حفظ credentials ───────────────────────────
router.post('/payment-gateways/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!SUPPORTED_GATEWAYS[name]) {
    return res.status(404).json({ ok: false, error: 'بوابة غير معروفة' });
  }

  try {
    const db      = req.db;
    ensureTable(db);

    const def     = SUPPORTED_GATEWAYS[name];
    const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : 1;

    // جمع الـ credentials من الـ body — نتجاهل الحقول الفارغة (•••• = لم تتغير)
    const row    = getGateway(db, name);
    let existing = {};
    if (row?.credentials_json) {
      try {
        const dec = decrypt(row.credentials_json);
        existing = dec ? JSON.parse(dec) : {};
      } catch {}
    }

    const newCreds = { ...existing };
    for (const field of def.fields) {
      const val = req.body[field.key];
      // تجاهل القيم الفارغة أو المخفية (لم تتغير)
      if (val !== undefined && val !== '' && !val.startsWith('••')) {
        newCreds[field.key] = val.trim();
      }
    }

    const encCreds = encrypt(JSON.stringify(newCreds));

    // wallet_id + commission
    const walletId       = req.body.wallet_id        ? parseInt(req.body.wallet_id)         : null;
    const commissionPct  = req.body.commission_pct   ? parseFloat(req.body.commission_pct)  : 0;
    const commissionFixed= req.body.commission_fixed ? parseFloat(req.body.commission_fixed): 0;

    if (row) {
      db.prepare(`
        UPDATE payment_gateways
        SET enabled=?, credentials_json=?, wallet_id=?, commission_pct=?, commission_fixed=?, updated_at=datetime('now')
        WHERE gateway_name=?
      `).run(enabled, encCreds, walletId, commissionPct, commissionFixed, name);
    } else {
      db.prepare(`
        INSERT INTO payment_gateways (gateway_name, display_name, enabled, credentials_json, wallet_id, commission_pct, commission_fixed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(name, def.display_name, enabled, encCreds, walletId, commissionPct, commissionFixed);
    }

    res.json({ ok: true, message: `تم حفظ إعدادات ${def.display_name} بنجاح` });
  } catch (err) {
    console.error('payment-gateways POST error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /payment-gateways/:name — حذف credentials ─────────────────────────
router.delete('/payment-gateways/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!SUPPORTED_GATEWAYS[name]) {
    return res.status(404).json({ ok: false, error: 'بوابة غير معروفة' });
  }

  try {
    const db = req.db;
    ensureTable(db);
    db.prepare('DELETE FROM payment_gateways WHERE gateway_name = ?').run(name);
    res.json({ ok: true, message: 'تم حذف إعدادات البوابة' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /payment-gateways/:name/test — اختبار الاتصال ───────────────────────
router.post('/payment-gateways/:name/test', async (req, res) => {
  const name = req.params.name.toLowerCase();
  if (!SUPPORTED_GATEWAYS[name]) {
    return res.status(404).json({ ok: false, error: 'بوابة غير معروفة' });
  }

  try {
    const db  = req.db;
    ensureTable(db);
    const row = getGateway(db, name);

    if (!row?.credentials_json) {
      return res.status(400).json({ ok: false, error: 'لم يتم حفظ credentials بعد' });
    }

    let creds = {};
    try {
      const dec = decrypt(row.credentials_json);
      creds = dec ? JSON.parse(dec) : {};
    } catch {
      return res.status(400).json({ ok: false, error: 'خطأ في فك تشفير الـ credentials' });
    }

    // ── اختبار Fawaterk ──────────────────────────────────────────────────────
    if (name === 'fawaterk') {
      if (!creds.api_key) {
        return res.status(400).json({ ok: false, error: 'API Key مطلوب' });
      }
      const fetch = (await import('node-fetch')).default;
      const resp  = await fetch('https://app.fawaterk.com/api/v2/invoiceInitData', {
        method:  'GET',
        headers: { Authorization: `Bearer ${creds.api_key}`, 'Content-Type': 'application/json' },
        signal:  AbortSignal.timeout(8000),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok || data?.status === 'success') {
        return res.json({ ok: true, message: '✅ الاتصال بفواتيرك ناجح' });
      }
      return res.status(400).json({ ok: false, error: data?.message || `HTTP ${resp.status}` });
    }

    // ── اختبار Paymob ────────────────────────────────────────────────────────
    if (name === 'paymob') {
      if (!creds.api_key) {
        return res.status(400).json({ ok: false, error: 'API Key مطلوب' });
      }
      const fetch = (await import('node-fetch')).default;
      const resp  = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: creds.api_key }),
        signal:  AbortSignal.timeout(8000),
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.token) {
        return res.json({ ok: true, message: '✅ الاتصال بـ Paymob ناجح' });
      }
      return res.status(400).json({ ok: false, error: data?.detail || 'API Key غير صحيح' });
    }

    // ── InstaPay — لا يوجد API للاختبار ─────────────────────────────────────
    if (name === 'instapay') {
      if (!creds.instapay_link) {
        return res.status(400).json({ ok: false, error: 'رابط InstaPay مطلوب' });
      }
      const isValid = creds.instapay_link.startsWith('https://ipn.eg/') ||
                      creds.instapay_link.startsWith('https://instapay');
      if (isValid) {
        return res.json({ ok: true, message: '✅ الرابط يبدو صحيحاً' });
      }
      return res.status(400).json({ ok: false, error: 'الرابط يجب أن يبدأ بـ https://ipn.eg/' });
    }

    res.json({ ok: true, message: 'اختبار غير متاح لهذه البوابة' });
  } catch (err) {
    console.error('payment-gateways test error:', err.message);
    res.status(500).json({ ok: false, error: 'فشل الاختبار: ' + err.message });
  }
});

// ── Helper export: جلب credentials بوابة لاستخدامها في payment processing ────
// تُستخدم من ملفات أخرى (payment processor, pay route, إلخ)
function getGatewayCredentials(db, gatewayName) {
  ensureTable(db);
  const row = getGateway(db, gatewayName);
  if (!row || !row.enabled || !row.credentials_json) return null;
  try {
    const dec = decrypt(row.credentials_json);
    return dec ? JSON.parse(dec) : null;
  } catch {
    return null;
  }
}

// ── Helper: جلب إعدادات البوابة كاملة (credentials + wallet + commission) ──────
function getGatewayConfig(db, gatewayName) {
  ensureTable(db);
  const row = getGateway(db, gatewayName);
  if (!row || !row.enabled || !row.credentials_json) return null;
  try {
    const dec   = decrypt(row.credentials_json);
    const creds = dec ? JSON.parse(dec) : null;
    if (!creds) return null;
    return {
      creds,
      wallet_id:        row.wallet_id        || null,
      commission_pct:   row.commission_pct   || 0,
      commission_fixed: row.commission_fixed || 0,
    };
  } catch {
    return null;
  }
}

module.exports = router;
module.exports.getGatewayCredentials  = getGatewayCredentials;
module.exports.getGatewayConfig       = getGatewayConfig;
module.exports.SUPPORTED_GATEWAYS     = SUPPORTED_GATEWAYS;
module.exports.ensureTable            = ensureTable;
