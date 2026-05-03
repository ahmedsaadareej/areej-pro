/**
 * inbox/ai.js — AI Features لـ Inbox v4
 * آخر تحديث: 2026-05-03 (P7-3 Auto-Label Suggestion)
 *
 * Endpoints:
 *   POST /api/inbox/conversations/:id/ai/suggest   — اقتراح رد ذكي
 *   POST /api/inbox/conversations/:id/ai/summary   — ملخص المحادثة
 *   POST /api/inbox/conversations/:id/ai/translate — ترجمة رسالة
 *   POST /api/inbox/conversations/:id/ai/improve   — تحسين نص مكتوب
 *   POST /api/inbox/conversations/:id/ai/labels    — اقتراح labels مناسبة (P7-3)
 *
 * يعتمد على:
 *   - OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL في .env
 *   - آخر 30 رسالة من المحادثة كـ context
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const url     = require('url');

// ─── Config من .env ───────────────────────────────────────────────────────
const AI_KEY   = process.env.OPENAI_API_KEY   || '';
const AI_BASE  = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.OPENAI_MODEL     || 'gpt-4o-mini';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * جلب آخر N رسالة من المحادثة (بدون نوتس)
 */
function _getMessages(db, convId, limit = 30) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT direction, content, content_type, agent_name, contact_name, created_at
       FROM inbox_messages_v4
       WHERE conversation_id = ?
         AND direction != 'note'
         AND content IS NOT NULL AND content != ''
       ORDER BY created_at DESC
       LIMIT ?`,
      [convId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).reverse()); // الأقدم أولاً
      }
    );
  });
}

/**
 * جلب بيانات المحادثة (اسم العميل + المنصة)
 */
function _getConv(db, convId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT contact_name, platform, subject FROM inbox_conversations_v4 WHERE id = ?`,
      [convId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      }
    );
  });
}

/**
 * استدعاء OpenAI-compatible API
 * @param {Array} messages - مصفوفة { role, content }
 * @param {number} maxTokens
 * @returns {Promise<string>} النص المُولَّد
 */
function _callAI(messages, maxTokens = 500) {
  return new Promise((resolve, reject) => {
    if (!AI_KEY) return reject(new Error('OPENAI_API_KEY غير محدد'));

    const body = JSON.stringify({
      model:      AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const parsed  = url.parse(`${AI_BASE}/chat/completions`);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.path,
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${AI_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      // timeout 30s
      timeout: 30000,
    };

    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'AI error'));
          const text = json.choices?.[0]?.message?.content?.trim() || '';
          resolve(text);
        } catch (e) {
          reject(new Error('فشل في قراءة رد الـ AI'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('انتهت مهلة الـ AI (30 ثانية)'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * تحويل رسائل المحادثة إلى نص مقروء للـ context
 */
function _formatHistory(msgs, contactName) {
  return msgs.map(m => {
    const who = m.direction === 'inbound'
      ? (m.contact_name || contactName || 'العميل')
      : (m.agent_name || 'الموظف');
    return `${who}: ${m.content}`;
  }).join('\n');
}

// ─── P7-1: AI Suggest Reply ───────────────────────────────────────────────

/**
 * POST /api/inbox/conversations/:id/ai/suggest
 * Body: { tone?: 'formal'|'friendly'|'brief' }
 * Response: { suggestion: string }
 */
router.post('/conversations/:id/ai/suggest', async (req, res) => {
  const convId = req.params.id;
  const tone   = req.body.tone || 'friendly'; // formal | friendly | brief

  try {
    const [msgs, conv] = await Promise.all([
      _getMessages(req.db, convId, 20),
      _getConv(req.db, convId),
    ]);

    if (msgs.length === 0) {
      return res.json({ suggestion: '' });
    }

    const history = _formatHistory(msgs, conv.contact_name);
    const toneMap = {
      formal:   'رسمي ومهني',
      friendly: 'ودي وإيجابي',
      brief:    'قصير ومباشر (جملة أو جملتين فقط)',
    };
    const toneLabel = toneMap[tone] || toneMap.friendly;

    const systemPrompt = `أنت موظف خدمة عملاء محترف في شركة أريج لماكينات وخدمات الطباعة في مصر.
مهمتك: اقترح رداً مناسباً على آخر رسالة من العميل.
أسلوب الرد المطلوب: ${toneLabel}.
قواعد مهمة:
- اكتب الرد بالعربية فقط
- لا تكتب أي شرح أو مقدمة — فقط نص الرد الجاهز للإرسال
- الرد يجب أن يكون مفيداً ومتعلقاً بمحتوى المحادثة
- لا تذكر أنك AI`;

    const messages = [
      { role: 'system',  content: systemPrompt },
      { role: 'user',    content: `المحادثة:\n${history}\n\nاقترح رداً على آخر رسالة:` },
    ];

    const suggestion = await _callAI(messages, 400);
    res.json({ suggestion });

  } catch (err) {
    console.error('[ai] suggest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── P7-2: Conversation Summary ───────────────────────────────────────────

/**
 * POST /api/inbox/conversations/:id/ai/summary
 * Response: { summary: string }
 */
router.post('/conversations/:id/ai/summary', async (req, res) => {
  const convId = req.params.id;

  try {
    const [msgs, conv] = await Promise.all([
      _getMessages(req.db, convId, 30),
      _getConv(req.db, convId),
    ]);

    if (msgs.length < 2) {
      return res.json({ summary: 'المحادثة قصيرة جداً للتلخيص.' });
    }

    const history = _formatHistory(msgs, conv.contact_name);

    const messages = [
      {
        role: 'system',
        content: `أنت مساعد يلخص محادثات خدمة العملاء.
قواعد:
- لخّص بالعربية في 3-5 نقاط واضحة
- ابدأ كل نقطة بـ •
- اذكر: موضوع المحادثة / طلب العميل / ما تم / الحالة الراهنة
- لا تضف شرحاً أو عنواناً`,
      },
      {
        role: 'user',
        content: `لخّص هذه المحادثة:\n${history}`,
      },
    ];

    const summary = await _callAI(messages, 350);
    res.json({ summary });

  } catch (err) {
    console.error('[ai] summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Translate ────────────────────────────────────────────────────────────

/**
 * POST /api/inbox/conversations/:id/ai/translate
 * Body: { text: string, targetLang?: 'ar'|'en' }
 * Response: { translated: string }
 */
router.post('/conversations/:id/ai/translate', async (req, res) => {
  const { text, targetLang = 'ar' } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'النص مطلوب' });
  }

  const langLabel = targetLang === 'en' ? 'الإنجليزية' : 'العربية';

  try {
    const messages = [
      {
        role: 'system',
        content: `أنت مترجم محترف. ترجم النص التالي إلى ${langLabel} فقط بدون أي شرح أو مقدمة.`,
      },
      { role: 'user', content: text },
    ];

    const translated = await _callAI(messages, 500);
    res.json({ translated });

  } catch (err) {
    console.error('[ai] translate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Improve Text ─────────────────────────────────────────────────────────

/**
 * POST /api/inbox/conversations/:id/ai/improve
 * Body: { text: string, goal?: 'formal'|'shorter'|'friendlier'|'fix' }
 * Response: { improved: string }
 */
router.post('/conversations/:id/ai/improve', async (req, res) => {
  const { text, goal = 'formal' } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'النص مطلوب' });
  }

  const goalMap = {
    formal:     'اجعله أكثر رسمية واحترافية',
    shorter:    'اختصره مع الحفاظ على المعنى الكامل',
    friendlier: 'اجعله أكثر ودية وإيجابية',
    fix:        'صحّح الأخطاء الإملائية والنحوية فقط دون تغيير المعنى',
  };
  const instruction = goalMap[goal] || goalMap.formal;

  try {
    const messages = [
      {
        role: 'system',
        content: `أنت محرر نصوص محترف. ${instruction}. أعد كتابة النص المُدخل فقط بدون أي شرح أو مقدمة.`,
      },
      { role: 'user', content: text },
    ];

    const improved = await _callAI(messages, 500);
    res.json({ improved });

  } catch (err) {
    console.error('[ai] improve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── P7-3: Auto-Label Suggestion ────────────────────────────────────────────

/**
 * POST /api/inbox/conversations/:id/ai/labels
 * يقترح labels مناسبة للمحادثة بناءً على محتواها
 * Response: { suggestions: Array<{ name: string, reason: string }> }
 */
router.post('/conversations/:id/ai/labels', async (req, res) => {
  const convId = req.params.id;

  try {
    // 1) جلب بيانات المحادثة + الرسائل
    const [msgs, conv] = await Promise.all([
      _getMessages(req.db, convId, 20),
      _getConv(req.db, convId),
    ]);

    if (msgs.length === 0) {
      return res.json({ suggestions: [] });
    }

    // 2) جلب الـ labels المتاحة للـ tenant
    const availableLabels = req.db.prepare(
      'SELECT id, name FROM inbox_labels_v4 WHERE tenant_id = ? ORDER BY name ASC'
    ).all(req.user.id);

    // لو مفيش labels أصلاً، ارجع فاضي
    if (!availableLabels || availableLabels.length === 0) {
      return res.json({ suggestions: [], message: 'لا توجد labels محددة بعد' });
    }

    // 3) بناء prompt يعرف الـ AI الـ labels المتاحة ويطلب منه الاختيار
    const history   = _formatHistory(msgs, conv.contact_name);
    const labelList = availableLabels.map(l => `- ${l.name}`).join('\n');

    const systemPrompt = `أنت نظام تصنيف محادثات خدمة العملاء لشركة أريج لماكينات وخدمات الطباعة في مصر.
مهمتك: اقرأ المحادثة وحدد أي من الـ labels المتاحة تنطبق عليها.

الـ labels المتاحة:
${labelList}

قواعد مهمة:
- اختر فقط labels من القائمة أعلاه (لا تخترع labels جديدة)
- يمكنك اختيار صفر إلى 3 labels كحد أقصى
- أجب بـ JSON array فقط بهذا الشكل:
[
  { "name": "اسم اللابل", "reason": "سبب الاختيار في جملة قصيرة" }
]
- لو مفيش labels مناسبة، أرجع: []
- لا تضف أي نص خارج الـ JSON`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `المحادثة:\n${history}\n\nما هي الـ labels المناسبة؟` },
    ];

    // temperature منخفضة لضمان الالتزام بالـ JSON
    const rawText = await _callAI(messages, 300);

    // 4) تحليل الـ JSON مع fallback آمن
    let suggestions = [];
    try {
      // استخراج JSON من الرد حتى لو فيه نص زيادة
      const jsonMatch = rawText.match(/\[.*?\]/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          // تحقق أن الـ labels المقترحة موجودة فعلاً في القائمة المتاحة
          const validNames = new Set(availableLabels.map(l => l.name.toLowerCase()));
          suggestions = parsed
            .filter(s => s && typeof s.name === 'string' && validNames.has(s.name.toLowerCase()))
            .slice(0, 3) // حد أقصى 3 labels
            .map(s => ({
              // نعيد الاسم بالضبط كما هو في القائمة (للتطابق مع الـ id)
              name:   availableLabels.find(l => l.name.toLowerCase() === s.name.toLowerCase())?.name || s.name,
              id:     availableLabels.find(l => l.name.toLowerCase() === s.name.toLowerCase())?.id,
              reason: s.reason || '',
            }))
            .filter(s => s.id); // فقط labels لها id صالح
        }
      }
    } catch (parseErr) {
      console.warn('[ai/labels] JSON parse warning:', parseErr.message, '| raw:', rawText.slice(0, 200));
      suggestions = [];
    }

    res.json({ suggestions });

  } catch (err) {
    console.error('[ai] labels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
