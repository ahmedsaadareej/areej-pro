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
  searchQuery: '',      // نص البحث

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
};
