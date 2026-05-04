/* ============================================================
   Inbox v4 — Client-Side Router
   URL routing حقيقي بدون reload (history.pushState)
   آخر تحديث: 2026-05-04
   ============================================================ */

const InboxRouter = (() => {

  // ترتيب الـ routes مهم: الأكثر تحديداً أولاً
  const routes = [
    {
      pattern: /^\/inbox\/conv\/(\d+)$/,
      page: 'inbox',
      params: m => ({ convId: m[1] })
    },
    {
      pattern: /^\/inbox\/broadcast\/?$/,
      page: 'broadcast',
      params: () => ({})
    },
    {
      pattern: /^\/inbox\/scheduled\/?$/,
      page: 'scheduled',
      params: () => ({})
    },
    {
      pattern: /^\/inbox\/chatbot\/?$/,
      page: 'chatbot',
      params: () => ({})
    },
    {
      pattern: /^\/inbox\/?$/,
      page: 'inbox',
      params: () => ({})
    },
    {
      pattern: /^\/contacts(?:\/(\d+))?\/?$/,
      page: 'contacts',
      params: m => ({ contactId: m[1] || null })
    },
    {
      pattern: /^\/reports(?:\/([\w-]+))?\/?$/,
      page: 'reports',
      params: m => ({ section: m[1] || 'overview' })
    },
    {
      pattern: /^\/settings(?:\/([\w-]+))?\/?$/,
      page: 'settings',
      params: m => ({ section: m[1] || null })
    },
  ];

  function _dispatch(path) {
    // تجاهل query string وـ hash
    const cleanPath = path.split('?')[0].split('#')[0];

    for (const route of routes) {
      const m = cleanPath.match(route.pattern);
      if (m) {
        InboxStore.emit('route:change', {
          page: route.page,
          params: route.params(m),
          fullPath: cleanPath
        });
        return;
      }
    }

    // Fallback: inbox
    InboxStore.emit('route:change', {
      page: 'inbox',
      params: {},
      fullPath: cleanPath
    });
  }

  return {
    /** التنقل لـ URL جديد مع تحديث الـ browser history */
    navigate(path) {
      if (window.location.pathname === path) return; // لا تكرار
      history.pushState({}, '', path);
      _dispatch(path);
    },

    /** استبدال الـ URL الحالي بدون إضافة entry في الـ history */
    replace(path) {
      history.replaceState({}, '', path);
      _dispatch(path);
    },

    /** تهيئة الـ Router (يُستدعى مرة واحدة من shell.js) */
    init() {
      // Browser back/forward
      window.addEventListener('popstate', () => {
        _dispatch(window.location.pathname);
      });

      // Dispatch الـ route الحالي عند load
      _dispatch(window.location.pathname);
    }
  };
})();
