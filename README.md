# 🌿 Areej Pro — نظام إدارة أعمال SaaS

نظام إدارة متكامل لأصحاب ماكينات الطباعة والتخصيص.

## 🏗️ Stack

| Component | Tech |
|-----------|------|
| Backend | Node.js + Express.js |
| Database | SQLite (better-sqlite3) — multi-tenant |
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| Proxy | Caddy (HTTPS + on-demand TLS) |
| Process | PM2 |
| Backups | Local + Cloudflare R2 |

## 🚀 تشغيل المشروع

```bash
# تشغيل عبر PM2
pm2 start ecosystem.config.js

# أو مباشرة
cd server && node app.js
```

## 📁 هيكل المشروع

```
areej-pro/
├── server/
│   ├── app.js                  ← Entry point + middleware
│   ├── auth-middleware.js       ← JWT auth
│   ├── db-master.js            ← Master DB (users, plans, payments)
│   ├── db-tenant.js            ← Tenant DB (per-user data)
│   ├── migrations.js           ← ✅ Versioned migration system
│   ├── tenant-middleware.js    ← Subdomain → tenant mapping
│   ├── routes-auth.js          ← /api/auth/*
│   ├── routes-billing.js       ← /api/billing/*
│   ├── routes-crm.js           ← /api/crm/*
│   ├── routes-hr.js            ← /api/hr/*
│   ├── routes-users.js         ← /api/users/*
│   ├── routes-persons.js       ← /api/persons/*
│   ├── routes-public.js        ← /api/public/*
│   ├── routes-system.js        ← /api/system/* (main routes)
│   ├── routes-inbox-webhook.js ← /api/webhook/* (Telegram etc.)
│   ├── cron-jobs.js            ← Background tasks
│   ├── email.js                ← SMTP helper
│   └── whatsapp-qr-service.js  ← WhatsApp QR session
├── public/
│   ├── dashboard/index.html    ← Main SPA (dashboard)
│   ├── auth/                   ← Login page
│   ├── landing/                ← Landing page
│   └── ...
├── data/
│   ├── master.db               ← Master database (gitignored)
│   └── tenants/                ← Per-tenant databases (gitignored)
├── scripts/
│   ├── deploy.sh               ← ✅ آمن deploy مع auto-rollback
│   ├── rollback.sh             ← ✅ استرجاع سريع
│   └── safe-edit.sh            ← ✅ checkpoint قبل أي تعديل
└── .env                        ← (gitignored — لا ترفعه أبداً)
```

## 🔒 الأمان

### ما تم تطبيقه:
- ✅ **Helmet.js** — security headers (HSTS, X-Frame, CSP, nosniff)
- ✅ **CORS restricted** — areejegypt.com subdomains فقط
- ✅ **JWT secret قوي** — 128-char random hex
- ✅ **Rate limiting** — global + API + webhook
- ✅ **Body size limit** — 2MB max
- ✅ **Path traversal protection** — uploads endpoint
- ✅ **SQLite WAL mode** — آمن من corruption
- ✅ **Multi-tenant isolation** — كل عميل DB منفصلة
- ✅ **Subscription check** على كل request

### ما لا يُفعل أبداً:
- ❌ لا ترفع `.env` على Git أبداً
- ❌ لا تعدّل الـ databases مباشرة — استخدم الـ API
- ❌ لا تضيف columns إلا عبر migrations.js

## 🗄️ نظام الـ Migrations

أضف دايماً في `server/migrations.js`:

```javascript
// مثال:
{ version: 15, sqls: [
  "ALTER TABLE inbox_conversations ADD COLUMN new_col TEXT",
]},
```

- **رقم الـ version فريد ومتزايد دايماً**
- **لا تعدّل migration قديم أبداً — أضف migration جديد**
- بيشتغل تلقائياً على كل DB عند أول request

## 🛠️ Scripts

```bash
# قبل أي تعديل كبير — عمل checkpoint
./scripts/safe-edit.sh "قبل تعديل الـ inbox"

# Deploy آمن مع health check + auto-rollback
./scripts/deploy.sh "إضافة ميزة X"

# استرجاع
./scripts/rollback.sh list                        # شوف الـ commits
./scripts/rollback.sh file server/routes-system.js   # استرجاع ملف
./scripts/rollback.sh full abc1234                # rollback كامل
```

## 💾 Backups

- **محلي**: `/home/work/areej-backups/daily/` — كل 12 ساعة
- **Offsite**: Cloudflare R2 — تلقائي مع كل backup
- **Retention**: 30 يوم
- **Watchdog**: كل 5 دقايق يتأكد السيرفر شغّال

## 🌐 URLs

| Service | URL |
|---------|-----|
| Main | https://pro.areejegypt.com |
| Tenant | https://pro-[slug].areejegypt.com |
| Health | http://localhost:3002/health |

## ✏️ إضافة ميزة جديدة — الخطوات الصح

1. `./scripts/safe-edit.sh "قبل إضافة [اسم الميزة]"`
2. عدّل الكود
3. لو في DB changes → أضف migration في `migrations.js`
4. اختبر محلياً: `curl http://localhost:3002/health`
5. `./scripts/deploy.sh "إضافة [اسم الميزة]"`
