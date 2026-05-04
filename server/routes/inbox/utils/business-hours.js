/**
 * business-hours.js — مساعد ساعات العمل
 * يُستخدم في: SLA calculation + Away trigger + Auto-away
 *
 * آخر تحديث: 2026-05-04 (M2 T37)
 */

'use strict';

/**
 * isBusinessHour(db, timestamp?)
 * يعيد true لو الوقت الحالي (أو المحدد) داخل ساعات العمل
 * - لو business_hours.active=0 → دايماً true (24/7)
 * - timezone: Africa/Cairo (افتراضي) — يقرأ من DB
 */
async function isBusinessHour(db, timestamp) {
  const config = db.prepare('SELECT * FROM inbox_business_hours_v4 WHERE id=1').get();
  // لو الإعداد غير موجود أو غير مفعّل → 24/7
  if (!config || !config.active) return true;

  const tz = config.timezone || 'Africa/Cairo';
  const date = timestamp ? new Date(timestamp) : new Date();

  // نحوّل التوقيت للـ timezone المطلوب
  const localeStr = date.toLocaleString('en-US', { timeZone: tz, hour12: false });
  const localDate = new Date(localeStr);
  const dayOfWeek = localDate.getDay();
  const hours = localDate.getHours();
  const minutes = localDate.getMinutes();
  const timeStr = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

  const dayConfig = db.prepare(
    'SELECT * FROM inbox_business_days_v4 WHERE day_of_week=?'
  ).get(dayOfWeek);

  if (!dayConfig || !dayConfig.is_working) return false;

  return timeStr >= dayConfig.start_time && timeStr < dayConfig.end_time;
}

module.exports = { isBusinessHour };
