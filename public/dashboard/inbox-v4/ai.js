/**
 * ai.js — AI Features لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P7-1 AI Suggestions)
 *
 * المسؤوليات:
 *   - زر "✨ اقتراح AI" في reply box — يولّد رد ويضعه في الـ textarea
 *   - زر "📋 ملخص" في chat header — يعرض ملخص المحادثة في panel
 *   - زر "تحسين النص" — يحسّن ما كتبه الموظف
 *   - زر "ترجمة" — يترجم الرسالة المقتبسة أو المكتوبة
 *   - كل الطلبات لها loading state + error toast
 */

const InboxAI = (() => {
  'use strict';

  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelector(sel);

  // ─── State ────────────────────────────────────────────────────────────────
  let _loading = false;  // يمنع الطلبات المتزامنة

  // ─── Toast ────────────────────────────────────────────────────────────────
  function _toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `iv4-toast ${type}`;
    el.textContent = msg;
    const container = $('iv4-toasts');
    if (container) container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ─── Loading State UI ─────────────────────────────────────────────────────
  function _setLoading(btn, isLoading, originalText) {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = '⏳';
      btn.classList.add('ai-loading');
    } else {
      btn.textContent = originalText || btn.dataset.originalText || btn.textContent;
      btn.classList.remove('ai-loading');
    }
  }

  // ─── API Calls ────────────────────────────────────────────────────────────

  async function _apiPost(convId, action, body = {}) {
    try {
      const res = await fetch(`/api/inbox/conversations/${convId}/ai/${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ error: 'فشل في قراءة الرد' }));
      if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
      return { data: json };
    } catch (e) {
      return { error: e.message || 'خطأ في الاتصال' };
    }
  }

  // ─── P7-1: Suggest Reply ──────────────────────────────────────────────────

  /**
   * يولّد رداً مقترحاً ويضعه في الـ textarea
   * @param {'formal'|'friendly'|'brief'} tone
   */
  async function suggestReply(tone = 'friendly') {
    if (_loading) return;
    const convId = InboxStore.state.activeConvId;
    if (!convId) return _toast('لا توجد محادثة مفتوحة', 'error');

    const btn = $('iv4-ai-suggest-btn');
    _loading = true;
    _setLoading(btn, true);

    const { data, error } = await _apiPost(convId, 'suggest', { tone });
    _setLoading(btn, false, '✨ اقتراح AI');
    _loading = false;

    if (error) return _toast(`فشل الاقتراح: ${error}`, 'error');
    if (!data?.suggestion) return _toast('لم يُولَّد أي اقتراح', 'warning');

    // ضع النص في الـ textarea
    const textarea = $('iv4-reply-textarea');
    if (textarea) {
      textarea.value = data.suggestion;
      textarea.focus();
      // أطلق event input لتفعيل الـ char count + send btn
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // أظهر panel التون
    _showTonePanel();
  }

  // ─── Tone Panel (formal / friendly / brief) ───────────────────────────────

  /**
   * يعرض خيارات التون تحت الـ textarea
   */
  function _showTonePanel() {
    if ($('iv4-ai-tone-panel')) return; // مفتوح بالفعل

    const panel = document.createElement('div');
    panel.id        = 'iv4-ai-tone-panel';
    panel.className = 'iv4-ai-tone-panel';
    panel.innerHTML = `
      <span class="iv4-ai-tone-label">نبرة الرد:</span>
      <button class="iv4-ai-tone-btn" data-tone="friendly" title="ودي">😊 ودي</button>
      <button class="iv4-ai-tone-btn" data-tone="formal"   title="رسمي">👔 رسمي</button>
      <button class="iv4-ai-tone-btn" data-tone="brief"    title="مختصر">⚡ مختصر</button>
      <button class="iv4-ai-tone-close" title="إغلاق">✕</button>
    `;

    panel.querySelectorAll('.iv4-ai-tone-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        panel.querySelectorAll('.iv4-ai-tone-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await suggestReply(btn.dataset.tone);
      });
    });

    panel.querySelector('.iv4-ai-tone-close').addEventListener('click', () => {
      panel.remove();
    });

    // أضف فوق الـ reply toolbar
    const replyBox = $('iv4-reply-box');
    const toolbar  = replyBox?.querySelector('.iv4-reply-toolbar');
    if (toolbar && replyBox) {
      replyBox.insertBefore(panel, toolbar);
    }
  }

  // ─── P7-2: Summary ────────────────────────────────────────────────────────

  /**
   * يعرض ملخص المحادثة في overlay
   */
  async function showSummary() {
    if (_loading) return;
    const convId = InboxStore.state.activeConvId;
    if (!convId) return _toast('لا توجد محادثة مفتوحة', 'error');

    const btn = $('iv4-ai-summary-btn');
    _loading = true;
    _setLoading(btn, true);

    const { data, error } = await _apiPost(convId, 'summary');
    _setLoading(btn, false, '📋 ملخص');
    _loading = false;

    if (error) return _toast(`فشل التلخيص: ${error}`, 'error');
    if (!data?.summary) return _toast('لا يوجد ملخص متاح', 'warning');

    _showSummaryOverlay(data.summary);
  }

  function _showSummaryOverlay(text) {
    // أزل القديم
    const old = $('iv4-ai-summary-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'iv4-ai-summary-overlay';
    overlay.className = 'iv4-ai-summary-overlay';

    // تحويل النقاط إلى HTML
    const html = text
      .split('\n')
      .filter(l => l.trim())
      .map(l => `<p class="iv4-ai-summary-line">${_esc(l)}</p>`)
      .join('');

    overlay.innerHTML = `
      <div class="iv4-ai-summary-box">
        <div class="iv4-ai-summary-header">
          <span class="iv4-ai-summary-title">📋 ملخص المحادثة</span>
          <button class="iv4-ai-summary-close" id="iv4-ai-sum-close">✕</button>
        </div>
        <div class="iv4-ai-summary-body">${html}</div>
        <div class="iv4-ai-summary-footer">
          <button class="iv4-ai-copy-btn" id="iv4-ai-sum-copy">📋 نسخ الملخص</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#iv4-ai-sum-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#iv4-ai-sum-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        _toast('تم نسخ الملخص', 'success');
      } catch {
        _toast('فشل النسخ', 'error');
      }
    });
  }

  // ─── Improve Text ─────────────────────────────────────────────────────────

  /**
   * يحسّن النص الموجود في الـ textarea
   * @param {'formal'|'shorter'|'friendlier'|'fix'} goal
   */
  async function improveText(goal = 'formal') {
    if (_loading) return;
    const convId  = InboxStore.state.activeConvId;
    if (!convId)  return _toast('لا توجد محادثة مفتوحة', 'error');

    const textarea = $('iv4-reply-textarea');
    const text     = textarea?.value?.trim();
    if (!text)     return _toast('اكتب نصاً أولاً لتحسينه', 'warning');

    _loading = true;

    const { data, error } = await _apiPost(convId, 'improve', { text, goal });
    _loading = false;

    if (error) return _toast(`فشل التحسين: ${error}`, 'error');
    if (!data?.improved) return _toast('لم يُنتَج نص محسَّن', 'warning');

    textarea.value = data.improved;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ─── Translate ────────────────────────────────────────────────────────────

  /**
   * يترجم النص الموجود في الـ textarea
   * @param {'ar'|'en'} targetLang
   */
  async function translate(targetLang = 'en') {
    if (_loading) return;
    const convId  = InboxStore.state.activeConvId;
    if (!convId)  return _toast('لا توجد محادثة مفتوحة', 'error');

    const textarea = $('iv4-reply-textarea');
    const text     = textarea?.value?.trim();
    if (!text)     return _toast('اكتب نصاً أولاً للترجمة', 'warning');

    _loading = true;

    const { data, error } = await _apiPost(convId, 'translate', { text, targetLang });
    _loading = false;

    if (error) return _toast(`فشل الترجمة: ${error}`, 'error');
    if (!data?.translated) return _toast('لم تُنتَج ترجمة', 'warning');

    textarea.value = data.translated;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ─── AI Toolbar (dropdown button) ────────────────────────────────────────

  /**
   * يعرض/يخفي قائمة أدوات الـ AI
   */
  function _toggleAIMenu() {
    const existing = $('iv4-ai-menu');
    if (existing) { existing.remove(); return; }

    const btnRef = $('iv4-ai-toolbar-btn');
    const menu   = document.createElement('div');
    menu.id        = 'iv4-ai-menu';
    menu.className = 'iv4-ai-menu';
    menu.innerHTML = `
      <button class="iv4-ai-menu-item" data-action="suggest-friendly">✨ اقتراح رد (ودي)</button>
      <button class="iv4-ai-menu-item" data-action="suggest-formal">✨ اقتراح رد (رسمي)</button>
      <button class="iv4-ai-menu-item" data-action="suggest-brief">✨ اقتراح رد (مختصر)</button>
      <div class="iv4-ai-menu-divider"></div>
      <button class="iv4-ai-menu-item" data-action="improve-fix">🔧 تصحيح إملائي</button>
      <button class="iv4-ai-menu-item" data-action="improve-formal">👔 اجعله أكثر رسمية</button>
      <button class="iv4-ai-menu-item" data-action="improve-shorter">⚡ اختصره</button>
      <button class="iv4-ai-menu-item" data-action="improve-friendlier">😊 اجعله أكثر ودية</button>
      <div class="iv4-ai-menu-divider"></div>
      <button class="iv4-ai-menu-item" data-action="translate-ar">🌍 ترجمة إلى العربية</button>
      <button class="iv4-ai-menu-item" data-action="translate-en">🌍 ترجمة إلى الإنجليزية</button>
    `;

    // تموضع أسفل أو فوق الزر
    document.body.appendChild(menu);
    if (btnRef) {
      const rect = btnRef.getBoundingClientRect();
      const menuH = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < menuH) {
        menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        menu.style.top    = 'auto';
      } else {
        menu.style.top    = `${rect.bottom + 4}px`;
        menu.style.bottom = 'auto';
      }
      menu.style.left = `${rect.left}px`;
    }

    // ربط الأحداث
    menu.querySelectorAll('.iv4-ai-menu-item').forEach(item => {
      item.addEventListener('mousedown', async e => {
        e.preventDefault();
        menu.remove();
        const action = item.dataset.action;

        if (action.startsWith('suggest-'))  await suggestReply(action.replace('suggest-', ''));
        if (action.startsWith('improve-'))  await improveText(action.replace('improve-', ''));
        if (action.startsWith('translate-')) await translate(action.replace('translate-', ''));
      });
    });

    // أغلق عند النقر خارجه
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!menu.contains(e.target) && e.target !== btnRef) {
          menu.remove();
          document.removeEventListener('click', _close);
        }
      });
    }, 0);
  }

  // ─── Utils ────────────────────────────────────────────────────────────────
  function _esc(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // زر "✨ AI" في الـ reply toolbar (الزر الرئيسي)
    const aiBtn = $('iv4-ai-toolbar-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', e => {
        e.stopPropagation();
        _toggleAIMenu();
      });
    }

    // زر اقتراح سريع (لو موجود مستقل)
    const suggestBtn = $('iv4-ai-suggest-btn');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => suggestReply('friendly'));
    }

    // زر ملخص في chat header
    const summaryBtn = $('iv4-ai-summary-btn');
    if (summaryBtn) {
      summaryBtn.addEventListener('click', showSummary);
    }

    // أغلق الـ tone panel عند تغيير المحادثة
    InboxStore.on('activeConvId:change', () => {
      const tone = $('iv4-ai-tone-panel');
      if (tone) tone.remove();
      const sumOverlay = $('iv4-ai-summary-overlay');
      if (sumOverlay) sumOverlay.remove();
      const menu = $('iv4-ai-menu');
      if (menu) menu.remove();
    });

    console.log('[InboxAI] ✅ جاهز');
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    suggestReply,
    showSummary,
    improveText,
    translate,
  };

})();

window.InboxAI = InboxAI;
