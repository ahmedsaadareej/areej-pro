/* ============================================================
   Inbox v4 — Page Module: Inbox
   يُحمَّل من InboxShell عند /inbox أو /inbox/conv/:id
   آخر تحديث: 2026-05-04
   ============================================================ */

const PageInbox = (() => {

  let _mounted = false;

  return {
    mount(container, params) {
      _mounted = true;

      // حقن الـ 3-column layout الأساسي
      container.innerHTML = `
        <div id="iv4-app" class="iv4-app-wrapper">
          <div id="iv4-sidebar"></div>
          <div id="iv4-conv-list"></div>
          <div id="iv4-conv-view"></div>
        </div>
      `;

      // تهيئة الـ Inbox App الكاملة
      if (typeof window._inboxAppInitialized === 'undefined') {
        window._inboxAppInitialized = false;
      }

      if (typeof InboxConvList !== 'undefined') InboxConvList.init();
      if (typeof InboxChat     !== 'undefined') InboxChat.init();
      if (typeof InboxTeam     !== 'undefined') InboxTeam.init();
      if (typeof InboxReply    !== 'undefined') InboxReply.init();
      if (typeof InboxLabels   !== 'undefined') InboxLabels.init();
      if (typeof InboxSearch   !== 'undefined') InboxSearch.init();
      if (typeof InboxContext  !== 'undefined') InboxContext.init();
      if (typeof InboxAI       !== 'undefined') InboxAI.init();
      if (typeof InboxBroadcast !== 'undefined') InboxBroadcast.init();
      if (typeof InboxInteractive !== 'undefined') InboxInteractive.init();
      if (typeof InboxCatalog  !== 'undefined') InboxCatalog.init();
      if (typeof InboxEmail    !== 'undefined') InboxEmail.init();
      if (typeof InboxChatbot  !== 'undefined') InboxChatbot.init();

      // لو فيه convId في الـ params → افتح المحادثة مباشرة (Deep Link)
      if (params && params.convId) {
        // تأخير بسيط حتى تنتهي الـ init
        setTimeout(() => {
          if (typeof InboxChat !== 'undefined' && InboxChat.openConversation) {
            InboxChat.openConversation(parseInt(params.convId, 10));
          } else {
            InboxStore.set('activeConvId', parseInt(params.convId, 10));
          }
        }, 100);
      }

      _mounted = true;
    },

    unmount() {
      _mounted = false;
      // تنظيف أي intervals أو listeners لو احتجنا (مستقبلاً)
    }
  };
})();

window.PageInbox = PageInbox;
