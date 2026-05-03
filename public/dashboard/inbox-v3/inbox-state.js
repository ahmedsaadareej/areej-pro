/**
 * inbox-state.js — Areej Pro Inbox v3
 * الـ State المركزي للـ Inbox
 * آخر تحديث: 2026-05-02
 */

const IV3 = {
  // ── المحادثات ──────────────────────────────────────
  convs: [],            // كل المحادثات المحمّلة
  filteredConvs: [],    // بعد الفلترة والبحث
  activeConvId: null,   // المحادثة المفتوحة حالياً
  activeConv: null,     // بيانات المحادثة الكاملة

  // ── الفلاتر ────────────────────────────────────────
  platform: '',         // '' = الكل، 'whatsapp-qr'، 'telegram'، إلخ
  statusFilter: '',     // '' = الكل، 'open'، 'waiting'، 'closed'
  agentFilter: '',      // '' = الكل، 'unassigned'، أو user_id
  labelFilter: 'all',   // 'all' | 'mine' | 'unassigned' | label_id (number)
  searchQuery: '',      // نص البحث
  dateFrom: '',         // فلتر من تاريخ (YYYY-MM-DD)
  dateTo: '',           // فلتر إلى تاريخ (YYYY-MM-DD)

  // ── الرسائل ────────────────────────────────────────
  messages: [],         // رسائل المحادثة الحالية
  replyMode: 'reply',   // 'reply' أو 'note'
  pendingMedia: null,   // { file, url, name, size, type }

  // ── الصفحات ────────────────────────────────────────
  convPage: 1,
  convPageSize: 30,
  convHasMore: false,
  loadingConvs: false,
  loadingMsgs: false,
  loadingMoreMsgs: false,   // جاري تحميل رسائل أقدم
  hasMoreMessages: false,   // هل يوجد رسائل أقدم قابلة للتحميل

  // ── المستخدم الحالي ────────────────────────────────
  me: null,             // { id, name, role, inbox_role }

  // ── الـ Realtime ───────────────────────────────────
  pollTimer: null,
  pollInterval: 8000,   // 8 ثواني
  lastPollTime: 0,

  // ── الإعدادات ──────────────────────────────────────
  soundEnabled: true,
  notifSound: null,     // Audio object

  // ── البيانات المساعدة ──────────────────────────────
  agents: [],           // قائمة الموظفين
  labels: [],           // قائمة التسميات
  templates: [],        // الردود الجاهزة

  // ── Dropdowns ──────────────────────────────────────
  tmplDropdownOpen: false,
  aiDropdownOpen: false,

  // ── Quote/Reply ────────────────────────────────────
  quotedMsg: null,      // { id, content, sender_name, direction } الرسالة المُقتبسة

  // ── Timeline ───────────────────────────────────────
  timeline: [],         // أحداث المحادثة الحالية ({ id, event_type, actor_name, meta, created_at })

  // ── Bulk Actions ────────────────────────────────────
  bulkMode: false,      // وضع التحديد الجماعي
  selectedIds: new Set(), // IDs المحادثات المحددة
};

// guard: نضمن إن selectedIds دايماً Set (يُعيد بناء نفسه لو اتكسر)
Object.defineProperty(IV3, 'selectedIds', {
  get() { return this._selectedIds || (this._selectedIds = new Set()); },
  set(v) { this._selectedIds = (v instanceof Set) ? v : new Set(); },
  configurable: true,
});

// ── Relative Time Utility ────────────────────────────────────
// دالة مشتركة تُستخدم في inbox-conv.js + inbox-chat.js

/**
 * iv3RelativeTime(ts) → نص عربي نسبي
 * مثال: "الآن" / "منذ 3 دقائق" / "منذ ساعتين" / "أمس" / "الثلاثاء" / "12 مايو"
 */
function iv3RelativeTime(ts) {
  if (!ts) return '';
  const d    = new Date(ts);
  if (isNaN(d)) return '';
  const now  = new Date();
  const diff = (now - d) / 1000; // بالثواني

  if (diff < 45)    return 'الآن';
  if (diff < 90)    return 'منذ دقيقة';
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 5400)  return 'منذ ساعة';
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;

  // أمس أو يوم الأسبوع
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYest  = new Date(startOfToday - 86400000);
  if (d >= startOfYest && d < startOfToday) return 'أمس';

  // خلال الأسبوع الأخير — اسم اليوم
  if (diff < 604800) {
    return d.toLocaleDateString('ar-EG', { weekday: 'long' });
  }

  // أقدم من أسبوع — التاريخ
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

/**
 * iv3RelativeTimeFull(ts) → وقت كامل للـ tooltip
 * مثال: "الأحد 3 مايو 2026 — 14:32"
 */
function iv3RelativeTimeFull(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * iv3StartRelativeTimeTicker
 * يُحدّث كل عناصر [data-ts] في الـ DOM كل 60 ثانية بدون re-render كامل
 * يُستدعى مرة واحدة بعد iv3Init()
 */
function iv3StartRelativeTimeTicker() {
  if (IV3._relTimerStarted) return;
  IV3._relTimerStarted = true;

  setInterval(() => {
    document.querySelectorAll('[data-ts]').forEach(el => {
      const ts = el.dataset.ts;
      if (ts) el.textContent = iv3RelativeTime(ts);
    });
  }, 60000); // كل دقيقة
}
