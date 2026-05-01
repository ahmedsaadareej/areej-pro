'use strict';
const { CronJob } = require('cron');

async function sendTrialReminder(user, sendMail) {
  const slug = user.slug || '';
  const loginUrl = 'https://pro-' + slug + '.areejegypt.com/';
  return sendMail({
    to: user.email,
    subject: '⏰ تبقى 3 أيام على انتهاء تجربتك المجانية — نظام أريج',
    html: '<div dir="rtl" style="font-family:Cairo,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">'
      + '<div style="background:#1B5E30;padding:20px;border-radius:8px;text-align:center;margin-bottom:20px">'
      + '<h2 style="color:#fff;margin:0;font-size:20px">⏰ تجربتك المجانية على وشك الانتهاء</h2>'
      + '</div>'
      + '<p style="font-size:15px;color:#374151">أهلاً <strong>' + user.name + '</strong>،</p>'
      + '<p style="font-size:15px;color:#374151">تجربتك المجانية على <strong>نظام أريج</strong> ستنتهي خلال <strong style="color:#dc2626">3 أيام</strong>.</p>'
      + '<p style="font-size:14px;color:#6b7280">للاستمرار في استخدام النظام بدون انقطاع للداتا أو الحسابات، اشترك الآن.</p>'
      + '<div style="text-align:center;margin:24px 0">'
      + '<a href="https://pro.areejegypt.com/upgrade/" style="background:#1B5E30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">اشترك الآن ←</a>'
      + '</div>'
      + '<p style="font-size:12px;color:#9ca3af;text-align:center">رابط نظامك: <a href="' + loginUrl + '">' + loginUrl + '</a></p>'
      + '</div>'
  });
}

function startCronJobs(masterDb, sendMail) {
  // Trial expiry reminder — daily at 9 AM Cairo time
  new CronJob('0 9 * * *', async () => {
    try {
      const threeDays = new Date();
      threeDays.setDate(threeDays.getDate() + 3);
      const dateStr = threeDays.toISOString().slice(0, 10);
      const expiring = masterDb.prepare(
        "SELECT id, name, email, slug FROM users WHERE status='trial' AND date(trial_ends) = date(?)"
      ).all(dateStr);
      console.log('[Cron] Trial reminder: found', expiring.length, 'expiring accounts');
      for (const user of expiring) {
        try { await sendTrialReminder(user, sendMail); console.log('[Cron] Reminder sent to', user.email); }
        catch(e) { console.error('[Cron] Failed to send reminder to', user.email, e.message); }
      }
    } catch(e) { console.error('[Cron] Trial reminder error:', e.message); }
  }, null, true, 'Africa/Cairo');

  console.log('[Cron] Jobs started');
}

module.exports = { startCronJobs };
