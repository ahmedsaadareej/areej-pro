/**
 * inbox-distributor.js
 * نظام توزيع المحادثات على الفريق
 * يُستدعى من webhook عند وصول محادثة جديدة
 */

/**
 * يجيب الموظف المناسب حسب إعدادات التوزيع
 * @param {object} db - tenant DB
 * @param {string} platform - telegram | whatsapp | meta | instagram
 * @returns {{ user_id, user_name } | null}
 */
function getNextAgent(db, platform) {
  try {
    const settings = db.prepare('SELECT * FROM inbox_distribution_settings WHERE id=1').get();
    if (!settings || !settings.auto_assign_new) return null;

    const method = settings.method || 'manual';
    if (method === 'manual') return null;

    // نشوف لو في فريق مخصص للقناة دي
    let teamId = null;
    if (platform) {
      const routing = db.prepare('SELECT team_id FROM inbox_channel_routing WHERE platform=?').get(platform);
      if (routing?.team_id) teamId = routing.team_id;
    }

    const maxConcurrent = settings.max_concurrent || 10;

    // نجيب الموظفين المتاحين (online + inbox_active + مش وصلوا الـ limit)
    let agentsQuery;
    if (teamId) {
      agentsQuery = db.prepare(`
        SELECT u.id, u.name, u.max_concurrent,
          COUNT(c.id) as active_convs
        FROM tenant_users u
        JOIN inbox_team_members tm ON tm.user_id = u.id AND tm.team_id = ?
        LEFT JOIN inbox_agent_status s ON s.user_id = u.id
        LEFT JOIN inbox_conversations c ON c.assigned_to_id = u.id
          AND (c.status = 'open' OR c.status IS NULL)
        WHERE u.active = 1 AND u.inbox_active = 1
          AND (s.status = 'online' OR s.status IS NULL)
        GROUP BY u.id
        HAVING COUNT(c.id) < COALESCE(u.max_concurrent, ?)
        ORDER BY COUNT(c.id) ASC, u.id ASC
      `);
    } else {
      agentsQuery = db.prepare(`
        SELECT u.id, u.name, u.max_concurrent,
          COUNT(c.id) as active_convs
        FROM tenant_users u
        LEFT JOIN inbox_agent_status s ON s.user_id = u.id
        LEFT JOIN inbox_conversations c ON c.assigned_to_id = u.id
          AND (c.status = 'open' OR c.status IS NULL)
        WHERE u.active = 1 AND u.inbox_active = 1
          AND (s.status = 'online' OR s.status IS NULL)
        GROUP BY u.id
        HAVING COUNT(c.id) < COALESCE(u.max_concurrent, ?)
        ORDER BY COUNT(c.id) ASC, u.id ASC
      `);
    }

    const args = teamId ? [teamId, maxConcurrent] : [maxConcurrent];
    const agents = agentsQuery.all(...args);
    if (!agents.length) return null;

    if (method === 'least_loaded') {
      // الأول في القائمة (مرتبة tascendingly بعدد المحادثات)
      return { user_id: agents[0].id, user_name: agents[0].name };
    }

    if (method === 'round_robin') {
      // نجيب آخر assignment ونروح للتالي
      const lastAssign = db.prepare(`
        SELECT assigned_to_id FROM inbox_conversations
        WHERE assigned_to_id IS NOT NULL
        ORDER BY last_message_at DESC LIMIT 1
      `).get();

      if (!lastAssign) return { user_id: agents[0].id, user_name: agents[0].name };

      const lastIdx = agents.findIndex(a => a.id === lastAssign.assigned_to_id);
      const nextIdx = (lastIdx + 1) % agents.length;
      return { user_id: agents[nextIdx].id, user_name: agents[nextIdx].name };
    }

    return null;
  } catch(e) {
    console.error('[distributor]', e.message);
    return null;
  }
}

/**
 * يوزّع محادثة جديدة أو يتركها في القائمة
 * @param {object} db
 * @param {number} convId
 * @param {string} platform
 */
function autoAssign(db, convId, platform) {
  try {
    const conv = db.prepare('SELECT * FROM inbox_conversations WHERE id=?').get(convId);
    if (!conv) return;

    // لو المحادثة معيّنة بالفعل — متلمسهاش
    if (conv.assigned_to_id && conv.assigned_to_id !== 0) return;

    const agent = getNextAgent(db, platform);
    if (!agent) return; // manual أو مفيش حد متاح

    db.prepare(`
      UPDATE inbox_conversations
      SET assigned_to_id=?, assigned_to_name=?
      WHERE id=?
    `).run(agent.user_id, agent.user_name, convId);

    // إشعار داخلي للموظف
    const settings = db.prepare('SELECT * FROM inbox_distribution_settings WHERE id=1').get();
    db.prepare(`INSERT INTO notifications (title, body, type) VALUES (?,?,?)`)
      .run(
        '📨 محادثة جديدة',
        `تم تعيين محادثة لـ ${agent.user_name}`,
        'info'
      );

    return agent;
  } catch(e) {
    console.error('[distributor] autoAssign:', e.message);
    return null;
  }
}

/**
 * يجيب نطاق رؤية الـ conversations حسب دور المستخدم
 * @param {object} req - Express request (req.user, req.tenantUser, req.db)
 * @returns {{ whereClause, params, isOwner }}
 */
function getConversationScope(req) {
  const isOwner = !req.tenantUser; // Owner = لا يوجد sub-user
  const isAdmin  = req.user?.role === 'admin';

  if (isOwner || isAdmin) {
    return { whereClause: '', params: [], isOwner: true };
  }

  // sub-user — نشوف صلاحياته
  const perms = JSON.parse(req.tenantUser?.permissions || '{}');
  const canSeeAll = perms['inbox.view_all'] || perms['full_access'];

  if (canSeeAll) {
    return { whereClause: '', params: [], isOwner: false };
  }

  // يشوف المعيّنة ليه + غير المعيّنة (Queue)
  const userId = req.tenantUser.id;
  return {
    whereClause: `AND (c.assigned_to_id = ? OR c.assigned_to_id IS NULL OR c.assigned_to_id = 0)`,
    params: [userId],
    isOwner: false
  };
}

module.exports = { getNextAgent, autoAssign, getConversationScope };
