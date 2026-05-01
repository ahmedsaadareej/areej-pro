/**
 * routes/team-settings.js
 * إعدادات الفريق — Owner/Admin فقط
 * Tabs: users | roles | teams | distribution | work-hours | reports
 */
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../auth-middleware');
const bcrypt = require('bcryptjs');

// ── Middleware: Owner/Admin only ─────────────────────────────────────────────
function requireOwner(req, res, next) {
  // Owner = sub_user_id غير موجود (صاحب الحساب الأصلي)
  // أو دور admin في الـ master
  if (req.tenantUser) {
    // sub-user — نتحقق من صلاحية team_settings
    // permissions قد يكون object أو string حسب من أين جاء الـ request
    const rawPerms = req.tenantUser.permissions || {};
    const perms = typeof rawPerms === 'string' ? JSON.parse(rawPerms) : rawPerms;
    if (!perms['team_settings'] && !perms['full_access']) {
      return res.status(403).json({ ok: false, error: 'هذه الصفحة للمالك والأدمن فقط' });
    }
  }
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — المستخدمون
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/users
router.get('/team/users', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.active, u.last_login, u.created_at,
             u.max_concurrent, u.notify_telegram_id, u.inbox_active,
             r.name as role_name, r.id as role_id,
             t.name as team_name, t.id as team_id,
             s.status as agent_status
      FROM tenant_users u
      LEFT JOIN tenant_roles r ON r.id = u.role_id
      LEFT JOIN inbox_team_members tm ON tm.user_id = u.id
      LEFT JOIN inbox_teams t ON t.id = tm.team_id
      LEFT JOIN inbox_agent_status s ON s.user_id = u.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ ok: true, users });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/team/users — إضافة موظف
router.post('/team/users', requireAuth, requireOwner, async (req, res) => {
  const db = req.db;
  try {
    const { name, email, password, role_id, max_concurrent = 10, notify_telegram_id, inbox_active = 1 } = req.body;
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ ok: false, error: 'الاسم والإيميل وكلمة المرور مطلوبة' });
    }
    const exists = db.prepare('SELECT id FROM tenant_users WHERE email=?').get(email.trim().toLowerCase());
    if (exists) return res.status(400).json({ ok: false, error: 'الإيميل مستخدم بالفعل' });

    const hash = await bcrypt.hash(password, 10);
    const r = db.prepare(`
      INSERT INTO tenant_users (name, email, password, password_plain, role_id, active, max_concurrent, notify_telegram_id, inbox_active)
      VALUES (?,?,?,?,?,1,?,?,?)
    `).run(name.trim(), email.trim().toLowerCase(), hash, password, role_id || null, max_concurrent, notify_telegram_id || null, inbox_active ? 1 : 0);

    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/system/team/users/:id
router.put('/team/users/:id', requireAuth, requireOwner, async (req, res) => {
  const db = req.db;
  try {
    const { name, email, password, role_id, active, max_concurrent, notify_telegram_id, inbox_active } = req.body;
    const user = db.prepare('SELECT id FROM tenant_users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });

    let passwordHash = null;
    if (password?.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    db.prepare(`
      UPDATE tenant_users SET
        name               = COALESCE(?, name),
        email              = COALESCE(?, email),
        password           = COALESCE(?, password),
        password_plain     = COALESCE(?, password_plain),
        role_id            = ?,
        active             = COALESCE(?, active),
        max_concurrent     = COALESCE(?, max_concurrent),
        notify_telegram_id = COALESCE(?, notify_telegram_id),
        inbox_active       = COALESCE(?, inbox_active)
      WHERE id=?
    `).run(
      name?.trim() || null,
      email?.trim().toLowerCase() || null,
      passwordHash,
      password?.trim() || null,
      role_id !== undefined ? (role_id || null) : undefined,
      active !== undefined ? (active ? 1 : 0) : null,
      max_concurrent ?? null,
      notify_telegram_id !== undefined ? (notify_telegram_id || null) : null,
      inbox_active !== undefined ? (inbox_active ? 1 : 0) : null,
      req.params.id
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/system/team/users/:id
router.delete('/team/users/:id', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_team_members WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM tenant_users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — الأدوار والصلاحيات
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/roles
router.get('/team/roles', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const roles = db.prepare('SELECT *, (SELECT COUNT(*) FROM tenant_users WHERE role_id=tenant_roles.id) as user_count FROM tenant_roles ORDER BY id').all();
    res.json({ ok: true, roles: roles.map(r => ({ ...r, permissions: JSON.parse(r.permissions || '{}') })) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/team/roles
router.post('/team/roles', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { name, permissions = {} } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'اسم الدور مطلوب' });
    const r = db.prepare('INSERT INTO tenant_roles (name, permissions) VALUES (?,?)').run(name.trim(), JSON.stringify(permissions));
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/system/team/roles/:id
router.put('/team/roles/:id', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { name, permissions } = req.body;
    db.prepare('UPDATE tenant_roles SET name=COALESCE(?,name), permissions=COALESCE(?,permissions) WHERE id=?')
      .run(name?.trim() || null, permissions ? JSON.stringify(permissions) : null, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/system/team/roles/:id
router.delete('/team/roles/:id', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const inUse = db.prepare('SELECT COUNT(*) as c FROM tenant_users WHERE role_id=?').get(req.params.id);
    if (inUse.c > 0) return res.status(400).json({ ok: false, error: `الدور مستخدم من ${inUse.c} موظف — غيّر دورهم أولاً` });
    db.prepare('DELETE FROM tenant_roles WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — الفرق
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/teams
router.get('/team/teams', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const teams = db.prepare(`
      SELECT t.*,
        u.name as supervisor_name,
        (SELECT COUNT(*) FROM inbox_team_members WHERE team_id=t.id) as member_count,
        (SELECT COUNT(*) FROM inbox_team_members tm2
          JOIN inbox_agent_status s ON s.user_id=tm2.user_id
          WHERE tm2.team_id=t.id AND s.status='online') as online_count
      FROM inbox_teams t
      LEFT JOIN tenant_users u ON u.id=t.supervisor_id
      ORDER BY t.created_at DESC
    `).all();

    // نجيب أعضاء كل فريق
    const result = teams.map(team => {
      const members = db.prepare(`
        SELECT u.id, u.name, u.email, tm.max_concurrent,
               s.status as agent_status
        FROM inbox_team_members tm
        JOIN tenant_users u ON u.id=tm.user_id
        LEFT JOIN inbox_agent_status s ON s.user_id=u.id
        WHERE tm.team_id=?
      `).all(team.id);

      const channels = db.prepare('SELECT platform FROM inbox_team_channels WHERE team_id=?').all(team.id).map(c => c.platform);
      return { ...team, members, channels };
    });

    res.json({ ok: true, teams: result });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/team/teams
router.post('/team/teams', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { name, description, supervisor_id, color = '#1B5E30', members = [], channels = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'اسم الفريق مطلوب' });

    const r = db.prepare('INSERT INTO inbox_teams (name, description, supervisor_id, color) VALUES (?,?,?,?)')
      .run(name.trim(), description || null, supervisor_id || null, color);
    const teamId = r.lastInsertRowid;

    // إضافة الأعضاء
    const addMember = db.prepare('INSERT OR IGNORE INTO inbox_team_members (team_id, user_id, max_concurrent) VALUES (?,?,?)');
    for (const m of members) {
      addMember.run(teamId, m.user_id || m, m.max_concurrent || 10);
    }
    // إضافة القنوات
    const addChannel = db.prepare('INSERT OR IGNORE INTO inbox_team_channels (team_id, platform) VALUES (?,?)');
    for (const ch of channels) addChannel.run(teamId, ch);

    res.json({ ok: true, id: teamId });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/system/team/teams/:id
router.put('/team/teams/:id', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { name, description, supervisor_id, color, active, members, channels } = req.body;
    const teamId = req.params.id;

    db.prepare(`UPDATE inbox_teams SET
      name=COALESCE(?,name), description=COALESCE(?,description),
      supervisor_id=?, color=COALESCE(?,color), active=COALESCE(?,active)
      WHERE id=?`
    ).run(name?.trim()||null, description||null, supervisor_id !== undefined ? (supervisor_id||null) : undefined, color||null, active !== undefined ? (active?1:0) : null, teamId);

    // تحديث الأعضاء لو موجودين في الـ request
    if (members !== undefined) {
      db.prepare('DELETE FROM inbox_team_members WHERE team_id=?').run(teamId);
      const addMember = db.prepare('INSERT OR IGNORE INTO inbox_team_members (team_id, user_id, max_concurrent) VALUES (?,?,?)');
      for (const m of members) addMember.run(teamId, m.user_id || m, m.max_concurrent || 10);
    }
    if (channels !== undefined) {
      db.prepare('DELETE FROM inbox_team_channels WHERE team_id=?').run(teamId);
      const addChannel = db.prepare('INSERT OR IGNORE INTO inbox_team_channels (team_id, platform) VALUES (?,?)');
      for (const ch of channels) addChannel.run(teamId, ch);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/system/team/teams/:id
router.delete('/team/teams/:id', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    db.prepare('DELETE FROM inbox_teams WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — إعدادات التوزيع
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/distribution
router.get('/team/distribution', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const settings = db.prepare('SELECT * FROM inbox_distribution_settings WHERE id=1').get() || {};
    const routing  = db.prepare(`
      SELECT cr.*, t.name as team_name
      FROM inbox_channel_routing cr
      LEFT JOIN inbox_teams t ON t.id=cr.team_id
    `).all();
    res.json({ ok: true, settings, routing });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/team/distribution
router.post('/team/distribution', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { method, auto_assign_new, fallback_to_queue, max_concurrent, notify_telegram, routing = [] } = req.body;

    db.prepare(`UPDATE inbox_distribution_settings SET
      method=COALESCE(?,method), auto_assign_new=COALESCE(?,auto_assign_new),
      fallback_to_queue=COALESCE(?,fallback_to_queue), max_concurrent=COALESCE(?,max_concurrent),
      notify_telegram=COALESCE(?,notify_telegram), updated_at=datetime('now')
      WHERE id=1`
    ).run(method||null, auto_assign_new !== undefined ? (auto_assign_new?1:0) : null,
          fallback_to_queue !== undefined ? (fallback_to_queue?1:0) : null,
          max_concurrent||null, notify_telegram !== undefined ? (notify_telegram?1:0) : null);

    // تحديث الـ channel routing
    const upsert = db.prepare('INSERT OR REPLACE INTO inbox_channel_routing (platform, team_id) VALUES (?,?)');
    for (const r of routing) upsert.run(r.platform, r.team_id || null);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — ساعات العمل
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/work-hours
router.get('/team/work-hours', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const hours = db.prepare('SELECT * FROM inbox_work_hours ORDER BY day_of_week').all();
    const settings = db.prepare('SELECT work_hours_active, away_message_workhours FROM inbox_settings WHERE id=1').get() || {};
    res.json({ ok: true, hours, settings });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/system/team/work-hours
router.post('/team/work-hours', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const { hours = [], work_hours_active, away_message_workhours } = req.body;

    const update = db.prepare('UPDATE inbox_work_hours SET is_off=?, start_time=?, end_time=? WHERE day_of_week=?');
    for (const h of hours) {
      update.run(h.is_off ? 1 : 0, h.start_time || '09:00', h.end_time || '17:00', h.day_of_week);
    }

    // حفظ الرسالة وحالة التفعيل
    if (work_hours_active !== undefined || away_message_workhours !== undefined) {
      db.prepare(`UPDATE inbox_settings SET
        work_hours_active=COALESCE(?,work_hours_active),
        away_message_workhours=COALESCE(?,away_message_workhours)
        WHERE id=1`
      ).run(work_hours_active !== undefined ? (work_hours_active?1:0) : null, away_message_workhours||null);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6 — تقارير الفريق
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/system/team/reports?period=today|week|month
router.get('/team/reports', requireAuth, requireOwner, (req, res) => {
  const db = req.db;
  try {
    const period = req.query.period || 'today';
    let dateFilter;
    if (period === 'today')  dateFilter = "date('now')";
    if (period === 'week')   dateFilter = "date('now', '-7 days')";
    if (period === 'month')  dateFilter = "date('now', '-30 days')";

    // إحصائيات لكل موظف
    const agentStats = db.prepare(`
      SELECT
        u.id, u.name, u.email,
        s.status as agent_status,
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(m.id) as total_messages_sent,
        AVG(CASE
          WHEN m.direction='out' THEN
            (SELECT MIN(julianday(m2.sent_at)) FROM inbox_messages m2
             WHERE m2.conversation_id=m.conversation_id AND m2.direction='out'
               AND m2.sent_at > (SELECT MIN(m3.sent_at) FROM inbox_messages m3
                                    WHERE m3.conversation_id=m.conversation_id AND m3.direction='in'))
            - julianday((SELECT MIN(m3.sent_at) FROM inbox_messages m3
                          WHERE m3.conversation_id=m.conversation_id AND m3.direction='in'))
          ELSE NULL END) * 1440 as avg_response_min,
        AVG(c.csat_score) as avg_csat
      FROM tenant_users u
      LEFT JOIN inbox_conversations c ON c.assigned_to_id=u.id
        AND date(c.last_message_at) >= ${dateFilter}
      LEFT JOIN inbox_messages m ON m.conversation_id=c.id AND m.direction='out'
      LEFT JOIN inbox_agent_status s ON s.user_id=u.id
      GROUP BY u.id
      ORDER BY total_conversations DESC
    `).all();

    // إجماليات
    const totals = db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(DISTINCT CASE WHEN c.status='open' THEN c.id END) as open_conversations,
        COUNT(DISTINCT CASE WHEN c.assigned_to_id IS NULL THEN c.id END) as unassigned,
        AVG(c.csat_score) as avg_csat
      FROM inbox_conversations c
      WHERE date(c.last_message_at) >= ${dateFilter}
    `).get();

    res.json({ ok: true, agentStats, totals, period });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
