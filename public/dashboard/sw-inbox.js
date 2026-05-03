/**
 * sw-inbox.js — Areej Pro Inbox v3 Service Worker
 * Browser Push Notifications + Background Sync
 * آخر تحديث: 2026-05-03
 */

const SW_VERSION = 'inbox-sw-v1';

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Push Event ───────────────────────────────────────────────
// يُستدعى عند وصول Push Notification من الـ backend
self.addEventListener('push', (event) => {
  let data = { title: 'رسالة جديدة', body: 'لديك رسالة جديدة في Areej Pro', convId: null, platform: '' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const platformEmoji = {
    'whatsapp-qr': '🟢',
    'whatsapp':    '🟢',
    'telegram':    '✈️',
    'facebook':    '🔵',
    'instagram':   '📸',
  };
  const emoji = platformEmoji[data.platform] || '💬';

  const options = {
    body:    data.body,
    icon:    '/dashboard/assets/logo-192.png',
    badge:   '/dashboard/assets/logo-72.png',
    tag:     `inbox-conv-${data.convId || 'new'}`,
    renotify: true,
    data: {
      convId:  data.convId,
      url:     '/dashboard/',
    },
    actions: [
      { action: 'open',    title: '📂 فتح المحادثة' },
      { action: 'dismiss', title: '✕ تجاهل' },
    ],
    dir:  'rtl',
    lang: 'ar',
  };

  event.waitUntil(
    self.registration.showNotification(`${emoji} ${data.title}`, options)
  );
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const convId = event.notification.data?.convId;
  const targetUrl = convId
    ? `/dashboard/?page=inbox&conv=${convId}`
    : '/dashboard/?page=inbox';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // ابحث عن تبويب areej-pro مفتوح
      const existing = clients.find(c => c.url.includes('/dashboard'));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'IV3_OPEN_CONV', convId });
      } else {
        self.clients.openWindow(targetUrl);
      }
    })
  );
});
