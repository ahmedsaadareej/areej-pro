// ============================================================
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let cachedMicStream = null; // Pre-acquired mic stream to avoid startup delay
let recordingTimer = null;
let recordingSeconds = 0;

function showRecordingUI(show) {
  const btn = document.getElementById('inbox-mic-btn');
  const ta = document.getElementById('inbox-reply-text');
  let indicator = document.getElementById('voice-recording-indicator');
  if (show) {
    // Change mic button to red pulsing
    if (btn) { btn.style.background='#fef2f2'; btn.style.borderColor='#ef4444'; btn.style.color='#ef4444'; btn.title='إيقاف التسجيل ⭕'; }
    // Show recording indicator inside reply area
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'voice-recording-indicator';
      indicator.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-family:Cairo,sans-serif;font-size:13px;color:#ef4444;font-weight:600';
      indicator.innerHTML = '<span id="rec-dot" style="width:10px;height:10px;border-radius:50%;background:#ef4444;animation:pulse 1s infinite"></span><span>جاري التسجيل...</span><span id="rec-timer" style="margin-right:auto;font-size:12px;color:#6b7280">0:00</span><button onclick="toggleVoiceRecord()" style="background:#ef4444;border:none;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;font-size:11px;font-weight:700">⏹ إيقاف</button>';
      // Insert before reply-box send button
      const replyBox = document.getElementById('inbox-reply-box');
      if (replyBox) replyBox.insertBefore(indicator, replyBox.firstChild);
    }
    indicator.style.display = 'flex';
    // Hide textarea while recording
    if (ta) ta.style.display = 'none';
    // Start timer
    recordingSeconds = 0;
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const min = Math.floor(recordingSeconds / 60);
      const sec = String(recordingSeconds % 60).padStart(2,'0');
      const timerEl = document.getElementById('rec-timer');
      if (timerEl) timerEl.textContent = min + ':' + sec;
    }, 1000);
  } else {
    if (btn) { btn.style.background='#f9fafb'; btn.style.borderColor='#e5e7eb'; btn.style.color='#6b7280'; btn.title='تسجيل رسالة صوتية'; }
    if (indicator) indicator.style.display = 'none';
    if (ta) ta.style.display = '';
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  }
}

async function toggleVoiceRecord() {
  if (!isRecording) {
    // Start recording
    try {
      if (!inboxCurrentConv) { showToast('ختار محادثة أولاً'); return; }
      // Use cached stream if available (avoids ~1s permission delay)
      let stream = cachedMicStream;
      if (!stream || stream.getTracks().every(t => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        cachedMicStream = stream;
      }
      audioChunks = [];
      // Try to use best supported codec
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      let mimeType = 'audio/webm';
      for (const mt of mimeTypes) { if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; } }
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        showRecordingUI(false);
        // Keep stream alive (cachedMicStream) to avoid startup delay next time
        const blob = new Blob(audioChunks, { type: mimeType });
        if (blob.size < 200) { showToast('التسجيل قصير جداً — حاول تاني'); return; }
        // Show preview with confirm/cancel instead of sending immediately
        const duration = recordingSeconds;
        const ext = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mp4') ? '.m4a' : '.webm';
        const blobUrl = URL.createObjectURL(blob);
        // Remove any existing preview
        document.getElementById('voice-preview-bar')?.remove();
        const previewBar = document.createElement('div');
        previewBar.id = 'voice-preview-bar';
        previewBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;font-family:Cairo,sans-serif;font-size:13px;direction:rtl';
        previewBar.innerHTML =
          '<span style="font-size:16px">🎙️</span>' +
          '<audio controls src="'+blobUrl+'" style="flex:1;height:30px;max-width:180px"></audio>' +
          '<span style="font-size:11px;color:#6b7280">'+duration+'ث</span>' +
          '<button id="voice-send-btn" style="background:#1B5E30;border:none;color:#fff;padding:5px 12px;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;font-size:12px;font-weight:700">إرسال ✅</button>' +
          '<button onclick="document.getElementById(\'voice-preview-bar\').remove();URL.revokeObjectURL(\''+blobUrl+'\')" style="background:#fee2e2;border:none;color:#ef4444;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;font-size:12px;font-weight:700">حذف ❌</button>';
        const replyBox = document.getElementById('inbox-reply-box');
        if (replyBox) replyBox.insertBefore(previewBar, replyBox.firstChild);
        // Wire send button
        document.getElementById('voice-send-btn').onclick = async () => {
          previewBar.remove();
          URL.revokeObjectURL(blobUrl);
          showToast('⏳ جاري رفع التسجيل...');
          const formData = new FormData();
          formData.append('file', blob, 'voice-' + Date.now() + ext);
          try {
            const resp = await fetch('/api/system/inbox/upload-media', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + getToken() },
              body: formData
            });
            const d = await resp.json();
            if (d.ok && inboxCurrentConv) {
              const sd = await apiFetch('/api/system/inbox/send-media', {
                method: 'POST',
                body: JSON.stringify({ conversation_id: inboxCurrentConv.id, media_url: d.url, media_type: 'audio', caption: '🎙️ رسالة صوتية (' + duration + 'ث)' })
              });
              if (sd.ok) { openConversation(inboxCurrentConv.id); showToast('✅ تم إرسال الرسالة الصوتية'); }
              else { showToast('❌ ' + (sd.error || 'خطأ في الإرسال')); }
            } else { showToast('❌ ' + (d.error || 'خطأ في الرفع')); }
          } catch(e) { showToast('❌ خطأ: ' + e.message); }
        };
      };
      mediaRecorder.start(100); // collect data every 100ms
      isRecording = true;
      showRecordingUI(true);
    } catch(e) {
      isRecording = false;
      if (e.name === 'NotAllowedError') {
        showToast('❌ تم رفض الوصول للميكروفون — اسمح للمتصفح باستخدام الميك');
      } else if (e.name === 'NotFoundError') {
        showToast('❌ لا يوجد ميكروفون — تأكد من توصيل ميك');
      } else {
        showToast('❌ لا يمكن الوصول للميكروفون: ' + e.message);
      }
    }
  } else {
    // Stop recording
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }
}

// ============================================================
// REPLY BOX ENHANCEMENTS (Phase 2c)
// ============================================================
let slashCmdTemplates = [];

// ── Typing Indicator State ──
let _typingTimer = null;
let _isTypingSent = false;

async function sendTypingAction() {
  if (!inboxCurrentConv) return;
  const platform = inboxCurrentConv.platform;
  if (platform !== 'telegram') return; // only Telegram supports typing indicator
  try {
    await apiFetch('/api/system/inbox/typing', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: inboxCurrentConv.id })
    });
  } catch(e) {} // silent fail
}

function onReplyTextInput(ta) {
  // Char count
  const cc = document.getElementById('reply-char-count');
  if (cc) cc.textContent = ta.value.length;
  // Auto-resize
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  // ── Typing Indicator ──
  if (inboxCurrentConv && inboxCurrentConv.platform === 'telegram') {
    if (!_isTypingSent) {
      _isTypingSent = true;
      sendTypingAction();
    }
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => { _isTypingSent = false; }, 4000);
  }
  // Slash command
  const val = ta.value;
  const dropdown = document.getElementById('slash-cmd-dropdown');
  if (!dropdown) return;
  if (val === '/' || (val.startsWith('/') && val.length > 1 && !val.includes('\n'))) {
    const query = val.substring(1).toLowerCase();
    const filtered = slashCmdTemplates.filter(t => !query || t.name.toLowerCase().includes(query) || t.content.toLowerCase().includes(query));
    if (filtered.length) {
      dropdown.innerHTML = filtered.slice(0,8).map((t,i) => 
        '<div onclick="applySlashTemplate(' + i + ')" style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f3f4f6" onmouseenter="this.style.background=\'#f0fdf4\'" onmouseleave="this.style.background=\'\'">' +
        '<span style="font-weight:700;color:var(--brand,#1B5E30)">' + esc(t.name) + '</span>' +
        '<span style="color:#6b7280;margin-right:6px">' + esc(t.content.substring(0,50)) + '</span>' +
        '</div>'
      ).join('');
      dropdown.setAttribute('data-results', JSON.stringify(filtered.slice(0,8)));
      dropdown.style.display = 'block';
    } else {
      dropdown.style.display = 'none';
    }
  } else {
    dropdown.style.display = 'none';
  }
}

function applySlashTemplate(idx) {
  const dropdown = document.getElementById('slash-cmd-dropdown');
  if (!dropdown) return;
  const templates = JSON.parse(dropdown.getAttribute('data-results') || '[]');
  const tmpl = templates[idx];
  if (!tmpl) return;
  const ta = document.getElementById('inbox-reply-text');
  if (ta) { ta.value = tmpl.content; ta.focus(); onReplyTextInput(ta); }
  dropdown.style.display = 'none';
}

function inboxReplyKeydown(event) {
  const dropdown = document.getElementById('slash-cmd-dropdown');
  if (dropdown && dropdown.style.display !== 'none' && event.key === 'Escape') {
    dropdown.style.display = 'none';
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendInboxReply();
  }
}

// Load templates for slash command
async function loadSlashCommandTemplates() {
  const d = await apiFetch('/api/system/inbox/templates');
  slashCmdTemplates = d.templates || [];
}

// ============================================================
// AUTOMATION RULES (Phase 3)
// ============================================================
async function loadAutomationRules() {
  const d = await apiFetch('/api/system/inbox/automation-rules');
  const el = document.getElementById('automation-rules-list');
  if (!el) return;
  const rules = d.rules || [];
  if (!rules.length) {
    el.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:14px">لا توجد قواعد — أضف أول قاعدة أتمتة</div>';
    return;
  }
  const condLabel = { contains:'يحتوي على', equals:'يساوي', starts_with:'يبدأ بـ', ends_with:'ينتهي بـ', always:'دائماً' };
  const actionLabel = { send_message:'رد برسالة', assign_label:'إضافة تسمية', change_status:'تغيير الحالة', assign_agent:'تعيين لموظف' };
  el.innerHTML = rules.map(r => 
    '<div style="border:1.5px solid '+(r.active?'#bbf7d0':'#f3f4f6')+';border-radius:8px;padding:10px;margin-bottom:6px;background:'+(r.active?'#f0fdf4':'#f9fafb')+'">' +
    '<div style="display:flex;justify-content:space-between;align-items:start">' +
    '<div>' +
    '<div style="font-weight:700;font-size:12px;color:#111827">'+esc(r.name)+'</div>' +
    '<div style="font-size:11px;color:#6b7280;margin-top:2px">شرط: <b>'+(condLabel[r.condition_type]||r.condition_type)+'</b> "'+esc(r.condition_value||'')+ '" ← '+
    'إجراء: <b>'+(actionLabel[r.action_type]||r.action_type)+'</b>: "'+esc((r.action_value||'').substring(0,30))+'"</div>' +
    '</div>' +
    '<div style="display:flex;gap:6px">' +
    '<label style="cursor:pointer;display:flex;align-items:center;gap:3px;font-size:11px">' +
    '<input type="checkbox" '+(r.active?'checked':'')+' onchange="toggleAutomationRule('+r.id+',this.checked)"> تفعيل</label>' +
    '<button onclick="deleteAutomationRule('+r.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">🗑️</button>' +
    '</div>' +
    '</div></div>'
  ).join('');
}

async function saveAutomationRule() {
  const name = document.getElementById('ar-name')?.value.trim();
  const cond_type = document.getElementById('ar-cond-type')?.value;
  const cond_val = document.getElementById('ar-cond-val')?.value.trim();
  const action_type = document.getElementById('ar-action-type')?.value;
  const action_val = document.getElementById('ar-action-val')?.value.trim();
  if (!name) { showToast('أدخل اسم القاعدة'); return; }
  const d = await apiFetch('/api/system/inbox/automation-rules', {
    method: 'POST',
    body: JSON.stringify({ name, condition_type: cond_type, condition_value: cond_val, action_type, action_value: action_val })
  });
  if (d.ok) {
    showToast('✅ تم حفظ القاعدة');
    ['ar-name','ar-cond-val','ar-action-val'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    loadAutomationRules();
  } else showToast('❌ ' + (d.error || 'خطأ'));
}

async function toggleAutomationRule(id, active) {
  await apiFetch('/api/system/inbox/automation-rules/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
  loadAutomationRules();
}

async function deleteAutomationRule(id) {
  if (!confirm('حذف القاعدة؟')) return;
  await apiFetch('/api/system/inbox/automation-rules/' + id, { method: 'DELETE' });
  loadAutomationRules();
}

// ============================================================
// QUEUE MANAGEMENT (Phase 5b)
// ============================================================
async function loadQueueTab() {
  const d = await apiFetch('/api/system/inbox/queue');
  const el = document.getElementById('queue-list');
  if (!el) return;
  const queue = d.queue || [];
  if (!queue.length) {
    el.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">لا توجد محادثات في الانتظار 🎉</div>';
    return;
  }
  const platLabel = { telegram:'TG', whatsapp:'WA', messenger:'FB', instagram:'IG' };
  el.innerHTML = queue.map(c => {
    const wait = c.wait_minutes > 60 ? Math.round(c.wait_minutes/60) + ' ساعة' : (c.wait_minutes||0) + ' دقيقة';
    const urgent = c.wait_minutes > 60;
    return '<div style="border:1.5px solid '+(urgent?'#fca5a5':'#e5e7eb')+';border-radius:8px;padding:8px;margin-bottom:6px;background:'+(urgent?'#fef2f2':'#fff')+'">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
      '<div style="font-weight:700;font-size:12px">'+esc(c.sender_name||c.sender_id)+' <span style="font-size:10px;background:#e5e7eb;padding:1px 5px;border-radius:4px">'+(platLabel[c.platform]||c.platform)+'</span></div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:2px">⏱️ انتظر ' + wait + (urgent?' ⚠️':'') + '</div>' +
      '</div>' +
      '<button onclick="openConversation('+c.id+');closeModal(\'inboxSettingsModal\')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:5px 10px;border-radius:6px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">فتح</button>' +
      '</div></div>';
  }).join('');
}

// ============================================================
// ADVANCED ANALYTICS (Phase 6)
// ============================================================
async function loadAdvancedAnalytics() {
  const days = document.getElementById('adv-analytics-days')?.value || 30;
  const d = await apiFetch('/api/system/inbox/analytics/advanced?days=' + days);
  if (!d.ok) { showToast('❌ خطأ في تحميل الإحصائيات'); return; }
  const a = d.analytics || {};
  
  // Cards
  const cardsEl = document.getElementById('adv-analytics-cards');
  if (cardsEl) {
    const cards = [
      { label: 'إجمالي المحادثات', value: a.total_conversations || 0, icon: '💬', color: '#1B5E30' },
      { label: 'الرسائل الواردة', value: a.incoming_messages || 0, icon: '📥', color: '#0369a1' },
      { label: 'الرسائل الصادرة', value: a.outgoing_messages || 0, icon: '📤', color: '#7c3aed' },
      { label: 'متوسط وقت الرد', value: (a.avg_response_minutes || 0) + ' دق', icon: '⏱️', color: '#b45309' }
    ];
    cardsEl.innerHTML = cards.map(c => 
      '<div style="background:#fff;border:1.5px solid #f0f0f0;border-radius:10px;padding:12px;text-align:center">' +
      '<div style="font-size:20px;margin-bottom:4px">'+c.icon+'</div>' +
      '<div style="font-size:18px;font-weight:900;color:'+c.color+'">'+c.value+'</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:2px">'+c.label+'</div>' +
      '</div>'
    ).join('');
  }
  
  // Platform breakdown
  const platEl = document.getElementById('adv-analytics-platforms');
  if (platEl && a.by_platform && a.by_platform.length) {
    const total = a.total_conversations || 1;
    const platColors = { telegram: '#0088cc', whatsapp: '#25D366', messenger: '#0099ff', instagram: '#E1306C' };
    platEl.innerHTML = '<div style="font-size:12px;font-weight:700;margin-bottom:8px">📊 حسب المنصة</div>' +
      a.by_platform.map(p => {
        const pct = Math.round((p.count / total) * 100);
        const clr = platColors[p.platform] || '#6b7280';
        return '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
          '<span style="font-weight:700">' + (p.platform || 'غير محدد') + '</span>' +
          '<span>' + p.count + ' (' + pct + '%)</span></div>' +
          '<div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:'+pct+'%;background:'+clr+';border-radius:3px;transition:.5s"></div></div></div>';
      }).join('');
  }
  
  // Top keywords
  const kwEl = document.getElementById('adv-analytics-keywords');
  if (kwEl && a.top_keywords && a.top_keywords.length) {
    kwEl.innerHTML = '<div style="font-size:12px;font-weight:700;margin-bottom:8px;margin-top:12px">🔤 أكثر الكلمات شيوعاً</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      a.top_keywords.map(k => 
        '<span style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:3px 10px;border-radius:20px;font-size:12px">' +
        esc(k.word) + ' <b>' + k.count + '</b></span>'
      ).join('') + '</div>';
  }
}

// ============================================================
// KEYBOARD SHORTCUTS (Phase 7c)
// ============================================================
document.addEventListener('keydown', function(e) {
  // Only in inbox page
  const inboxPage = document.getElementById('page-inbox');
  if (!inboxPage || !inboxPage.classList.contains('active')) return;
  
  // ArrowUp/Down — navigate conversations
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const activeEl = document.querySelector('.conv-item.active');
    if (activeEl) {
      const allItems = [...document.querySelectorAll('.conv-item')];
      const idx = allItems.indexOf(activeEl);
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (nextIdx >= 0 && nextIdx < allItems.length) {
        const nextId = parseInt(allItems[nextIdx].getAttribute('onclick')?.match(/\d+/) || [0]);
        if (nextId) openConversation(nextId);
        e.preventDefault();
      }
    }
  }
  
  // Escape — close lightbox
  if (e.key === 'Escape') {
    const lb = document.getElementById('inbox-lightbox');
    if (lb) lb.style.display = 'none';
    const dd = document.getElementById('slash-cmd-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

// ============================================================
// INBOX NOTES (Phase 4b) - Override existing
// ============================================================
async function openConvNotes() {
  if (!inboxCurrentConv) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+inboxCurrentConv.id+'/notes');
  const notes = d.notes || [];
  let html = '<div class="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center" id="notesModal">';
  html += '<div style="background:#fff;border-radius:14px;padding:20px;width:380px;max-height:80vh;overflow-y:auto;position:relative">';
  html += '<div style="font-size:14px;font-weight:800;margin-bottom:14px;display:flex;justify-content:space-between">';
  html += '📝 ملاحظات داخلية <button onclick="document.getElementById(\'notesModal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer">✕</button></div>';
  html += '<div style="background:#fef9c3;border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;color:#92400e">⚠️ هذه الملاحظات داخلية — لا يراها العميل</div>';
  if (!notes.length) {
    html += '<div style="color:#9ca3af;text-align:center;padding:16px;font-size:12px">لا توجد ملاحظات</div>';
  } else {
    html += notes.map(n => 
      '<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:6px">' +
      '<div style="font-size:12px;color:#374151;white-space:pre-wrap">'+esc(n.content)+'</div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:4px;display:flex;justify-content:space-between">' +
      '<span>'+(n.user_name||'أنت')+'</span>' +
      '<span>'+(n.created_at ? new Date(n.created_at).toLocaleDateString('ar-EG') : '')+'</span>' +
      '<button onclick="deleteNote('+n.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px">حذف</button>' +
      '</div></div>'
    ).join('');
  }
  html += '<div style="margin-top:12px"><textarea id="note-content-input" rows="3" placeholder="اكتب ملاحظتك هنا..." style="width:100%;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;resize:vertical"></textarea>' +
    '<button onclick="addConvNote()" style="background:#1B5E30;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer;margin-top:6px;width:100%">✅ إضافة ملاحظة</button></div>';
  html += '</div></div>';
  const existing = document.getElementById('notesModal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  window._currentNotesConvId = inboxCurrentConv.id;
}

async function addConvNote() {
  const content = document.getElementById('note-content-input')?.value.trim();
  if (!content || !window._currentNotesConvId) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+window._currentNotesConvId+'/notes', {
    method: 'POST', body: JSON.stringify({ content })
  });
  if (d.ok) {
    showToast('✅ تم إضافة الملاحظة');
    document.getElementById('notesModal')?.remove();
    openConvNotes();
  } else showToast('❌ ' + (d.error||'خطأ'));
}

async function deleteNote(noteId) {
  if (!window._currentNotesConvId) return;
  const d = await apiFetch('/api/system/inbox/conversations/'+window._currentNotesConvId+'/notes/'+noteId, { method: 'DELETE' });
  if (d.ok) { document.getElementById('notesModal')?.remove(); openConvNotes(); }
}

// ============================================================
// CONTACT STATS PANEL ENHANCEMENT (Phase 4a)
// ============================================================
async function loadContactStats(convId) {
  // Load total messages, labels for this conversation
  const [msgsD, labelsD] = await Promise.all([
    apiFetch('/api/system/inbox/messages/' + convId),
    apiFetch('/api/system/inbox/conversations/' + convId + '/labels')
  ]);
  return {
    messageCount: (msgsD.messages || []).length,
    labels: labelsD.labels || []
  };
}



// ============================================================
// LIBRARY SYSTEM
// ============================================================
const LIBRARY_STEPS = [
  { num:1, icon:'🎯', title:'اختار منتجك وجمهورك', body:'قرر هتبيع إيه لمين — تيشيرت بيسك؟ هودي شتوي؟ ملابس أطفال؟ كل قرار بيحدد موردك وسعرك وعميلك. الأول حدد الجمهور، بعدين المنتج.', tips:['ابدأ بمنتج واحد بس', 'اختار جمهور محدد (مش الكل)', 'ادرس المنافسة قبل ما تبدأ'] },
  { num:2, icon:'🏭', title:'لاقي موردين وسعّر صح', body:'روح قسم الموردين في المكتبة واختار مورد قريب منك — جرب واطلب عينة أول. بعدين استخدم حاسبة التسعير تحسب سعر بيعك الصح.', tips:['طلب عينة قبل أي أوردر كبير', 'قارن 3 موردين على الأقل', 'احسب كل التكاليف (خامة + طباعة + شحن + تغليف)'] },
  { num:3, icon:'🎨', title:'ابني هويتك البصرية', body:'الاسم + اللوجو + الألوان = الهوية. مش لازم تصرف كتير — Canva كافي في الأول. المهم تبقى consistent في كل حاجة.', tips:['اختار 2-3 ألوان بس', 'لوجو بسيط أحسن من معقد', 'صور المنتجات بضوء كويس'] },
  { num:4, icon:'🚀', title:'أول طلب وأول بيعة', body:'إبدأ بدائرة المقربين — أهل، أصحاب، زملاء. اعمل ستوري على إنستجرام. اعمل واتساب ستاتس. المهم تبيع أول قطعة وتاخد فيدباك حقيقي.', tips:['لا تخلي المخزون كبير في الأول', 'اطلب تقييم من كل عميل', 'صور المنتج على شخص حقيقي مش مانيكان'] },
  { num:5, icon:'📈', title:'كبّر وانظّم', body:'لما الطلبات تبدأ تيجي — سجّل كل حاجة في السيستم: فواتير، مخزون، عملاء. ده اللي هيخليك تعرف إيه الناجح وإيه اللازم تغيره.', tips:['سجّل كل بيعة في الفواتير', 'تابع المخزون علشان ما تخسرش فرص', 'ابني قاعدة عملاء في CRM'] }
];

const PRINTING_TECHNIQUES = [
  { name:'DTF (Direct to Film)', emoji:'🎨', desc:'أفضل تقنية دلوقتي للبراندات الصغيرة — تطبع على أي لون خامة بجودة عالية', price_from:15, price_to:35, fabrics:'قطن، بوليستر، كتان، مزيج', pros:['ألوان نابضة', 'مش محتاج minimum كبير', 'يتحمل الغسيل كويس'], cons:['أغلى شوية من السيلك بالكميات الكبيرة'] },
  { name:'سيلك سكرين (Silk Screen)', emoji:'🖌️', desc:'الأرخص بالكميات الكبيرة — مثالي لو بتطبع لون أو لونين بس', price_from:5, price_to:20, fabrics:'قطن، بوليستر', pros:['أرخص بالكمية', 'ألوان ثابتة جداً', 'سريع بالكميات'], cons:['Setup تقيل', 'كل لون بيحتاج شاشة منفصلة'] },
  { name:'ديجيتال (Digital Print)', emoji:'💻', desc:'مناسب للتصاميم المعقدة والكميات الصغيرة جداً', price_from:20, price_to:60, fabrics:'قطن 100% بس', pros:['أي تصميم مهما كان معقد', 'بدون minimum', 'جودة عالية'], cons:['أغلى التكلفة', 'مش كل الخامات بتقبله'] },
  { name:'سبليميشن (Sublimation)', emoji:'🌈', desc:'للبوليستر والخامات الفاتحة — ألوان زي الصورة', price_from:10, price_to:30, fabrics:'بوليستر 100% فاتح اللون', pros:['ألوان مبهرة جداً', 'الطباعة جوه الخامة (ما بتشققش)', 'مناسب للرياضة'], cons:['بوليستر فاتح بس', 'ما ينفعش على قطن'] },
  { name:'HTV (Heat Transfer Vinyl)', emoji:'✂️', desc:'للكميات الصغيرة والتصاميم البسيطة — مناسب للمحلات', price_from:8, price_to:25, fabrics:'قطن، بوليستر، مزيج', pros:['مناسب للكميات الصغيرة', 'يمكن عمله في المنزل', 'ألوان واضحة'], cons:['مش مناسب للتصاميم المعقدة جداً', 'وزن على الخامة'] }
];

const DEFAULT_SUPPLIERS = [
  { name:'مركز الجملة للخامات - العتبة', region:'القاهرة', products:'قطن، بوليستر، كتان', phone:'01012345678', address:'العتبة، القاهرة', rating:4.5, notes:'متوفر جميع الألوان والمقاسات' },
  { name:'شركة النيل للأقمشة', region:'الجيزة', products:'قطن، مزيج', phone:'01123456789', address:'إمبابة، الجيزة', rating:4.2, notes:'أسعار الجملة مناسبة' },
  { name:'مصنع المحلة - فرع القاهرة', region:'القاهرة', products:'قطن 100%، إنترلوك', phone:'01234567890', address:'شبرا الخيمة', rating:4.8, notes:'أفضل جودة قطن في مصر' },
  { name:'مجمع الغزل والنسيج - المحلة', region:'المحلة الكبرى', products:'جميع الخامات', phone:'01098765432', address:'المحلة الكبرى، الغربية', rating:4.6, notes:'مصنع مباشر - أرخص سعر' },
  { name:'بورسعيد للأقمشة الرياضية', region:'بورسعيد', products:'بوليستر، رياضي', phone:'01187654321', address:'بورسعيد', rating:4.3, notes:'متخصص في الخامات الرياضية' },
  { name:'محلات العتبة للملابس الجاهزة', region:'القاهرة', products:'تيشيرتات جاهزة، هوديات', phone:'01276543210', address:'العتبة، وسط البلد', rating:3.9, notes:'للكميات الصغيرة - سريع' },
];

let allSuppliers = [...DEFAULT_SUPPLIERS];

function showSuccessTab(tab, btn) {
  document.querySelectorAll('.success-tab').forEach(b => {
    b.style.background = '#fff';
    b.style.color = '#6b7280';
    b.style.borderColor = '#e5e7eb';
  });
  btn.style.background = 'var(--brand,#1B5E30)';
  btn.style.color = '#fff';
  btn.style.borderColor = 'var(--brand,#1B5E30)';
  document.getElementById('success-steps').style.display = tab === 'steps' ? 'block' : 'none';
  document.getElementById('success-plan90').style.display = tab === 'plan90' ? 'block' : 'none';
  if (tab === 'steps') renderSteps();
}

function showLibTab(tab, btn) {
  document.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.lib-section').forEach(s => s.style.display = 'none');
  btn.classList.add('active');
  document.getElementById('lib-' + tab).style.display = 'block';
  if (tab === 'success') renderSteps();
  if (tab === 'suppliers') renderSuppliers();
  if (tab === 'printing') renderPrinting();
  if (tab === 'updates') loadLibUpdates();
}

function renderSteps() {
  const el = document.getElementById('lib-steps-list');
  el.innerHTML = LIBRARY_STEPS.map(s => {
    const tips = s.tips.map(t => '<li style="font-size:11.5px;color:#6b7280;margin-bottom:2px">💡 ' + t + '</li>').join('');
    return '<div class="step-card">'
      + '<div class="step-num">' + s.num + '</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:20px">' + s.icon + '</span><h4 style="font-size:14px;font-weight:800;color:var(--brand,#1B5E30)">' + s.title + '</h4></div>'
      + '<p style="font-size:13px;color:#374151;margin-bottom:10px;line-height:1.7">' + s.body + '</p>'
      + '<ul style="list-style:none;padding:0">' + tips + '</ul>'
      + '</div></div>';
  }).join('');
}

function renderSuppliers() {
  filterSuppliers();
}

function filterSuppliers() {
  const region = document.getElementById('sup-filter-region').value;
  const product = document.getElementById('sup-filter-product').value;
  const search = (document.getElementById('sup-search').value || '').toLowerCase();
  const filtered = allSuppliers.filter(s => {
    if (region && s.region !== region) return false;
    if (product && !s.products.includes(product)) return false;
    if (search && !s.name.toLowerCase().includes(search) && !s.products.toLowerCase().includes(search)) return false;
    return true;
  });
  const grid = document.getElementById('lib-suppliers-grid');
  if (!filtered.length) { grid.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:30px;grid-column:1/-1">لا يوجد موردين بهذه المعايير</div>'; return; }
  grid.innerHTML = filtered.map(s => {
    const stars = '⭐'.repeat(Math.round(s.rating));
    return '<div class="sup-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
      + '<h4 style="font-size:13px;font-weight:800;color:var(--brand,#1B5E30)">' + s.name + '</h4>'
      + '<span style="font-size:12px;color:#F5A623;font-weight:700">' + s.rating + ' ' + stars + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:6px">📦 ' + s.products + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:6px">📍 ' + s.address + '</div>'
      + (s.notes ? '<div style="font-size:11.5px;color:#9ca3af;margin-bottom:10px;font-style:italic">' + s.notes + '</div>' : '')
      + '<a href="https://wa.me/2' + s.phone + '?text=' + encodeURIComponent('السلام عليكم، أنا صاحب براند ملابس وعايز أعرف أسعاركم على ' + s.products) + '" target="_blank" style="display:block;text-align:center;background:var(--brand,#1B5E30);color:#fff;padding:7px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">📲 طلب عرض سعر على واتساب</a>'
      + '</div>';
  }).join('');
}

function renderPrinting() {
  const grid = document.getElementById('lib-printing-grid');
  grid.innerHTML = PRINTING_TECHNIQUES.map(t => {
    const pros = t.pros.map(p => '<li style="font-size:11.5px;color:#16a34a">✅ ' + p + '</li>').join('');
    const cons = t.cons.map(c => '<li style="font-size:11.5px;color:#CC2200">❌ ' + c + '</li>').join('');
    return '<div class="print-card">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:24px">' + t.emoji + '</span><div class="tech-name">' + t.name + '</div></div>'
      + '<p style="font-size:12px;color:#6b7280;margin-bottom:10px;line-height:1.7">' + t.desc + '</p>'
      + '<div style="background:#f0fdf4;border-radius:8px;padding:8px 12px;margin-bottom:10px">'
      + '<div style="font-size:11px;color:#6b7280">السعر (ج.م / قطعة)</div>'
      + '<div style="font-size:18px;font-weight:900;color:var(--brand,#1B5E30)">' + t.price_from + ' — ' + t.price_to + ' ج.م</div>'
      + '</div>'
      + '<div style="font-size:11.5px;color:#6b7280;margin-bottom:8px">🧵 الخامات: ' + t.fabrics + '</div>'
      + '<ul style="list-style:none;padding:0">' + pros + cons + '</ul>'
      + '</div>';
  }).join('');
}

async function loadLibUpdates() {
  const el = document.getElementById('lib-updates-list');
  // Default updates إذا مفيش API
  const defaults = [
    { icon:'💰', category:'أسعار', title:'أسعار القطن — أبريل 2026', body:'القطن 100%: 28-35 ج.م/قطعة | الكتان: 45-60 ج.م/قطعة | البوليستر: 18-25 ج.م/قطعة', date:'2026-04-01' },
    { icon:'🏭', category:'موردين', title:'موردين جدد في المحلة الكبرى', body:'اتضاف 3 موردين جدد من المحلة الكبرى بأسعار تنافسية — راجع قسم الموردين', date:'2026-03-15' },
    { icon:'📊', category:'السوق', title:'ارتفاع الطلب على الهوديات الشتوية', body:'الشتاء القادم — ابدأ تخزّن مبكر. الهودي القطن شهد ارتفاع 30% في الطلب الموسم ده', date:'2026-03-01' },
  ];
  el.innerHTML = defaults.map(u => {
    return '<div class="update-card">'
      + '<div style="width:40px;height:40px;border-radius:10px;background:var(--brand,#1B5E30);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">' + u.icon + '</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<span style="font-size:11px;background:#f0fdf4;color:var(--brand,#1B5E30);padding:2px 8px;border-radius:6px;font-weight:700">' + u.category + '</span>'
      + '<span style="font-size:11px;color:#9ca3af">' + u.date + '</span>'
      + '</div>'
      + '<h4 style="font-size:13px;font-weight:800;color:#1a1a1a;margin-bottom:4px">' + u.title + '</h4>'
      + '<p style="font-size:12px;color:#6b7280;line-height:1.7">' + u.body + '</p>'
      + '</div></div>';
  }).join('');
}

async function libLoadProductCost() {
  const sel = document.getElementById('lib-calc-product');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cost) {
    document.getElementById('calc-material').value = opt.dataset.cost;
    calcPrice();
  }
}

async function loadLibCalcProducts() {
  const d = await sysGet('/products').catch(()=>({}));
  if (!d.ok) return;
  const sel = document.getElementById('lib-calc-product');
  if (!sel) return;
  sel.innerHTML = '<option value="">— أدخل التكلفة يدوياً —</option>';
  (d.data||[]).forEach(p => {
    sel.innerHTML += '<option value="'+p.id+'" data-cost="'+p.cost_price+'">'+esc(p.name)+' (تكلفة: '+fmt(p.cost_price)+' ج.م)</option>';
  });
}

function calcPrice() {
  const material = parseFloat(document.getElementById('calc-material').value) || 0;
  const print = parseFloat(document.getElementById('calc-print').value) || 0;
  const pack = parseFloat(document.getElementById('calc-pack').value) || 0;
  const ship = parseFloat(document.getElementById('calc-ship').value) || 0;
  const other = parseFloat(document.getElementById('calc-other').value) || 0;
  const margin = parseFloat(document.getElementById('calc-margin').value) || 0;
  const cost = material + print + pack + ship + other;
  const factor = margin > 0 ? 100 / (100 - margin) : 1;
  const online = Math.ceil(cost * factor);
  const wholesale = Math.ceil(cost * (1 + (margin * 0.5 / 100)));
  const retail = Math.ceil(cost * (1 + (margin * 0.7 / 100)));
  const profit = online - cost;
  document.getElementById('calc-r-cost').textContent = cost > 0 ? cost.toFixed(0) + ' ج.م' : '—';
  document.getElementById('calc-r-online').textContent = online > 0 ? online + ' ج.م' : '—';
  document.getElementById('calc-r-wholesale').textContent = wholesale > 0 ? wholesale + ' ج.م' : '—';
  document.getElementById('calc-r-retail').textContent = retail > 0 ? retail + ' ج.م' : '—';
  document.getElementById('calc-r-profit').textContent = profit > 0 ? profit.toFixed(0) + ' ج.م' : '—';
  if (cost > 0 && margin > 0) {
    document.getElementById('calc-r-note').textContent = 'ربح ' + margin + '% = ' + profit.toFixed(0) + ' ج.م لكل قطعة — لو بعت 100 قطعة = ' + (profit * 100).toFixed(0) + ' ج.م ربح صافي';
  }
}

// Initialize library on page show
const _origShowPage = window.showPage || function(){};
window._libInit = false;

// ============================================================
// SHIPPING — الشحن
// ============================================================
const SHIP_STATUS_LABELS = { pending:'منتظر', picked:'تم الاستلام', transit:'في الطريق', out:'مع المندوب', delivered:'تم التسليم', returned:'مرتجع' };
const SHIP_STATUS_COLORS = { pending:'#F5A623', picked:'#3b82f6', transit:'#8b5cf6', out:'#F5A623', delivered:'#16a34a', returned:'#ef4444' };

// ── Orders Page Main Tabs ──
function switchOrderMainTab(tab, btn) {
  document.querySelectorAll('.ord-main-tab').forEach(b => {
    b.style.background = '#fff'; b.style.color = '#6b7280'; b.style.borderColor = '#e5e7eb';
  });
  btn.style.background = 'var(--brand,#1B5E30)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--brand,#1B5E30)';
  document.getElementById('ord-tab-orders').style.display    = tab === 'orders'    ? 'block' : 'none';
  document.getElementById('ord-tab-shipments').style.display = tab === 'shipments' ? 'block' : 'none';
  if (tab === 'shipments') loadShipmentsInOrders();
}

async function loadShipmentsInOrders() {
  const tbody = document.getElementById('ship-tbody2');
  if (!tbody) return;
  const d = await apiFetch('/api/system/shipping/shipments');
  const shipments = d.shipments || [];
  const stats = d.stats || [];
  const statMap = {};
  stats.forEach(s => statMap[s.status] = s.c);
  const el = id => document.getElementById(id);
  if (el('ship-pending2')) el('ship-pending2').textContent = (statMap['pending']||0)+(statMap['picked']||0);
  if (el('ship-transit2')) el('ship-transit2').textContent = (statMap['transit']||0)+(statMap['out']||0);
  if (el('ship-delivered2')) el('ship-delivered2').textContent = statMap['delivered']||0;
  if (el('ship-returned2')) el('ship-returned2').textContent = statMap['returned']||0;
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">لا توجد شحنات — افتح أوردر واضغط "إنشاء شحنة"</td></tr>';
    return;
  }
  tbody.innerHTML = shipments.map(s => {
    const color = SHIP_STATUS_COLORS[s.status]||'#9ca3af';
    const trackLink = 'https://pro.areejegypt.com/track/' + s.waybill_no;
    const waMsg = encodeURIComponent('طلبك في الطريق! تتبع: ' + trackLink);
    const phone = (s.receiver_phone||'').replace(/^0/,'');
    const opts = ['pending','picked','transit','out','delivered','returned'].map(st =>
      '<option value="'+st+'"'+(s.status===st?' selected':'')+'>'+( SHIP_STATUS_LABELS[st]||st)+'</option>').join('');
    return '<tr style="border-bottom:1px solid #f3f4f6">'
      + '<td style="padding:10px 14px;cursor:pointer" onclick="openShipmentDetail('+s.id+',\''+esc(s.waybill_no||'')+'\')" title="تفاصيل"><div style="font-weight:700;font-size:12px;color:var(--brand,#1B5E30);text-decoration:underline">'+esc(s.waybill_no)+'</div><div style="font-size:10px;color:#9ca3af">'+esc(s.company)+'</div></td>'
      + '<td style="padding:10px 14px;font-size:13px">'+esc(s.client_name||s.receiver_name||'')+'</td>'
      + '<td style="padding:10px 14px;font-size:12px;color:#6b7280">'+esc(s.company)+'</td>'
      + '<td style="padding:10px 14px"><select onchange="updateShipStatus('+s.id+',this.value)" style="padding:4px 8px;border:1.5px solid '+color+';border-radius:6px;color:'+color+';font-family:Cairo,sans-serif;font-size:11px;font-weight:700;background:'+color+'20">'+opts+'</select></td>'
      + '<td style="padding:10px 14px"><div style="display:flex;gap:4px">'
      + '<button onclick="copyText(\''+trackLink+'\')" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:4px 8px;border-radius:6px;font-family:Cairo,sans-serif;font-size:10px;font-weight:700;cursor:pointer">🔗 تتبع</button>'
      + (phone?'<a href="https://wa.me/2'+phone+'?text='+waMsg+'" target="_blank" style="background:#25D366;color:#fff;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;text-decoration:none">📲</a>':'')
      + '</div></td>'
      + '</tr>';
  }).join('');
}

function switchShipTab(tab, btn) {
  document.querySelectorAll('.ship-tab').forEach(b => {
    b.style.background = '#fff'; b.style.color = '#6b7280'; b.style.borderColor = '#e5e7eb';
  });
  btn.style.background = 'var(--brand,#1B5E30)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--brand,#1B5E30)';
  document.getElementById('ship-tab-orders').style.display    = tab === 'orders'    ? 'block' : 'none';
  document.getElementById('ship-tab-shipments').style.display = tab === 'shipments' ? 'block' : 'none';
  // تحميل الشحنات لما يتم التحويل إلى تبويب الشحنات
  if (tab === 'shipments') loadShipping();
}

async function loadShipping() {
  // Load orders ready to ship
  await loadShipOrders();
  // Load shipments
  const d = await apiFetch('/api/system/shipping/shipments');
  const shipments = d.shipments || [];
  const stats = d.stats || [];
  const statMap = {};
  stats.forEach(s => statMap[s.status] = s.c);
  const el = id => document.getElementById(id);
  if (el('ship-transit')) el('ship-transit').textContent = (statMap['transit']||0) + (statMap['out']||0);
  if (el('ship-delivered')) el('ship-delivered').textContent = statMap['delivered']||0;
  if (el('ship-returned')) el('ship-returned').textContent = statMap['returned']||0;
  const tbody = document.getElementById('ship-tbody');
  if (!tbody) return;
  if (!shipments.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">لا توجد شحنات — افتح أي أوردر واضغط "إنشاء شحنة"</td></tr>'; return; }
  tbody.innerHTML = shipments.map(s => {
    const color = SHIP_STATUS_COLORS[s.status]||'#9ca3af';
    const trackLink = 'https://pro.areejegypt.com/track/' + s.waybill_no;
    const waMsg = encodeURIComponent('طلبك ' + s.order_no + ' في الطريق! تتبع شحنتك: ' + trackLink);
    const phone = (s.receiver_phone||'').replace(/^0/,'');
    const opts = ['pending','picked','transit','out','delivered','returned'].map(st =>
      '<option value="'+st+'"'+(s.status===st?' selected':'')+'>'+( SHIP_STATUS_LABELS[st]||st)+'</option>').join('');
    return '<tr style="border-bottom:1px solid #f3f4f6">'
      + '<td style="padding:10px 14px;cursor:pointer" onclick="openShipmentDetail('+s.id+',\''+esc(s.waybill_no||'')+'\')" title="تفاصيل الشحنة"><div style="font-weight:700;font-size:12px;color:var(--brand,#1B5E30);text-decoration:underline">'+esc(s.waybill_no)+'</div><div style="font-size:10px;color:#9ca3af">'+esc(s.company)+'</div></td>'
      + '<td style="padding:10px 14px;font-size:13px">'+esc(s.client_name||s.receiver_name||'')+'</td>'
      + '<td style="padding:10px 14px;font-size:12px;color:#6b7280">'+esc(s.company)+'</td>'
      + '<td style="padding:10px 14px"><select onchange="updateShipStatus('+s.id+',this.value)" style="padding:4px 8px;border:1.5px solid '+color+';border-radius:6px;color:'+color+';font-family:Cairo,sans-serif;font-size:11px;font-weight:700;background:'+color+'20">'+opts+'</select></td>'
      + '<td style="padding:10px 14px"><div style="display:flex;gap:4px">'
      + '<button onclick="copyText(\''+trackLink+'\')" style="background:#f0fdf4;border:1.5px solid #bbf7d0;color:var(--brand,#1B5E30);padding:4px 8px;border-radius:6px;font-family:Cairo,sans-serif;font-size:10px;font-weight:700;cursor:pointer">🔗 لينك</button>'
      + (phone ? '<a href="https://wa.me/2'+phone+'?text='+waMsg+'" target="_blank" style="background:#25D366;color:#fff;padding:4px 8px;border-radius:6px;font-size:10px;font-weight:700;text-decoration:none">📱</a>' : '')
      + '</div></td>'
      + '</tr>';
  }).join('');
}

async function loadShipOrders() {
  const tbody = document.getElementById('ship-orders-tbody');
  if (!tbody) return;
  const d = await apiFetch('/api/system/orders?limit=50');
  const orders = (d.data||[]).filter(o => !['delivered','cancelled','returned'].includes(o.status));
  // Update new orders count
  const newCount = orders.filter(o => o.status === 'new' || o.status === 'preparing').length;
  const el = document.getElementById('ship-new-orders');
  if (el) el.textContent = newCount;
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">لا توجد أوردرات جديدة</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const statusColors = { new:'#3b82f6', processing:'#F5A623', preparing:'#F5A623', shipped:'#8b5cf6' };
    const statusLabels = { new:'جديد', processing:'معالجة', preparing:'تجهيز', shipped:'شحن' };
    const sc = statusColors[o.status]||'#9ca3af';
    const sl = statusLabels[o.status]||o.status;
    return '<tr style="border-bottom:1px solid #f3f4f6">'
      + '<td style="padding:10px 14px;font-weight:700;color:var(--brand,#1B5E30)">'+esc(o.order_no)+'</td>'
      + '<td style="padding:10px 14px;font-size:13px">'+esc(o.client_name||'')+'</td>'
      + '<td style="padding:10px 14px;font-weight:700;color:var(--brand,#1B5E30)">'+fmt(o.total||0)+' ج.م</td>'
      + '<td style="padding:10px 14px"><span style="background:'+sc+'20;color:'+sc+';padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">'+sl+'</span></td>'
      + '<td style="padding:10px 14px"><div style="display:flex;gap:6px">'
      + '<button onclick="openCreateShipmentFromOrder('+o.id+',\''+esc(o.order_no)+'\',\''+esc(o.client_name||'')+'\',' +(o.client_phone?'\''+esc(o.client_phone)+'\'':'null')+','+o.total+')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:6px 12px;border-radius:7px;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;cursor:pointer">🚚 شحن</button>'
      + '</div></td>'
      + '</tr>';
  }).join('');
}

function openCreateShipmentFromOrder(orderId, orderNo, clientName, clientPhone, total) {
  document.getElementById('ship-order-id').value = orderId;
  document.getElementById('shipment-order-info').innerHTML = '<strong>'+esc(orderNo)+'</strong> — '+esc(clientName);
  document.getElementById('ship-name').value = clientName || '';
  document.getElementById('ship-phone').value = clientPhone || '';
  document.getElementById('ship-address').value = '';
  document.getElementById('ship-cod').value = total || 0;
  document.getElementById('ship-result').innerHTML = '';
  document.getElementById('createShipmentModal').classList.remove('hidden');
}

async function updateShipStatus(id, status) {
  await apiFetch('/api/system/shipping/shipments/'+id+'/status', { method:'PUT', body: JSON.stringify({ status }) });
  showToast('✅ تم تحديث حالة الشحنة');
  loadShipping();
}

function openCreateShipment() {
  if (!currentOrder) return;
  document.getElementById('ship-order-id').value = currentOrder.id;
  document.getElementById('shipment-order-info').innerHTML = '<strong>'+esc(currentOrder.order_no)+'</strong> — '+esc(currentOrder.client_name);
  document.getElementById('ship-name').value = currentOrder.client_name || '';
  document.getElementById('ship-phone').value = currentOrder.client_phone || '';
  document.getElementById('ship-address').value = currentOrder.client_address || '';
  document.getElementById('ship-cod').value = currentOrder.total || 0;
  document.getElementById('ship-result').innerHTML = '';
  document.getElementById('createShipmentModal').classList.remove('hidden');
}

async function submitCreateShipment() {
  const order_id = document.getElementById('ship-order-id').value;
  const receiver_name = document.getElementById('ship-name').value.trim();
  const receiver_phone = document.getElementById('ship-phone').value.trim();
  const receiver_address = document.getElementById('ship-address').value.trim();
  const company = document.getElementById('ship-company').value;
  const weight = document.getElementById('ship-weight').value;
  const cod_amount = document.getElementById('ship-cod').value;
  if (!receiver_phone) { showToast('أدخل هاتف المستلم'); return; }
  const d = await apiFetch('/api/system/shipping/create', {
    method: 'POST',
    body: JSON.stringify({ order_id, company, receiver_name, receiver_phone, receiver_address, weight, cod_amount })
  });
  if (d.ok) {
    const el = document.getElementById('ship-result');
    const phone = receiver_phone.replace(/^0/,'');
    el.innerHTML = '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px">'
      + '<div style="font-weight:700;color:var(--brand,#1B5E30);margin-bottom:8px">✅ ' + d.waybill_no + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button onclick="copyText(\''+d.tracking_link+'\')" style="background:var(--brand,#1B5E30);color:#fff;border:none;padding:6px 12px;border-radius:7px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer">📋 نسخ لينك التتبع</button>'
      + '<a href="https://wa.me/2'+phone+'?text='+encodeURIComponent(d.wa_message)+'" target="_blank" style="background:#25D366;color:#fff;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;text-decoration:none">📱 بعت واتساب</a>'
      + '</div></div>';
    loadShipping();
    openOrderDetail(order_id);
  } else {
    showToast('❌ ' + (d.error||'خطأ'));
  }
}

async function showShippingSettings() {
  document.getElementById('shippingSettingsModal').classList.remove('hidden');
  const d = await apiFetch('/api/system/shipping/settings');
  const s = d.settings || {};
  document.getElementById('ss-sender-name').value = s.sender_name || '';
  document.getElementById('ss-sender-phone').value = s.sender_phone || '';
  document.getElementById('ss-sender-address').value = s.sender_address || '';
  const sco = document.getElementById('ss-default-co');
  if (sco) sco.value = s.default_company || 'bosta';
}

async function saveShippingSettings() {
  const d = await apiFetch('/api/system/shipping/settings', {
    method: 'POST',
    body: JSON.stringify({
      sender_name: document.getElementById('ss-sender-name').value.trim(),
      sender_phone: document.getElementById('ss-sender-phone').value.trim(),
      sender_address: document.getElementById('ss-sender-address').value.trim(),
      default_company: document.getElementById('ss-default-co').value
    })
  });
  if (d.ok) { closeModal('shippingSettingsModal'); showToast('✅ تم الحفظ'); }
}



// ============================================================
// COUNTRIES DATA
// ============================================================
const COUNTRIES = [
  { code:'EG', name:'مصر 🇪🇬', phone_code:'+20', govs:['القاهرة','الجيزة','الإسكندرية','البحيرة','المنوفية','القليوبية','الشرقية','الغربية','سوهاج','أسيوط','قنا','الفيوم','بني سويف','المنيا','أسوان','لوكسور','دمياط','كفر الشيخ','الدقهلية','بورسعيد','الإسماعيلية','السويس','جنوب سيناء','شمال سيناء','البحر الأحمر','الوادي الجديد','مطروح'] },
  { code:'SA', name:'السعودية 🇸🇦', phone_code:'+966', govs:['الرياض','جدة','مكة','المدينة المنورة','الدمام','الخبر','الطائف','تبوك','أبها','القصيم','حائل','جازان','نجران','الباحة','الجوف','عسير'] },
  { code:'AE', name:'الإمارات 🇦🇪', phone_code:'+971', govs:['دبي','أبوظبي','الشارقة','عجمان','رأس الخيمة','الفجيرة','أم القيوين'] },
  { code:'KW', name:'الكويت 🇰🇼', phone_code:'+965', govs:['الكويت','حولي','الفروانية','مبارك الكبير','الجهراء','الأحمدي'] },
  { code:'QA', name:'قطر 🇶🇦', phone_code:'+974', govs:['الدوحة','الريان','الشمال','الوكرة','الخور','الشمال'] },
  { code:'BH', name:'البحرين 🇧🇭', phone_code:'+973', govs:['المنامة','المحرق','الشمالية','الجنوبية'] },
  { code:'OM', name:'عُمان 🇴🇲', phone_code:'+968', govs:['مسقط','صلالة','صحار','نزوى','صور','عبري'] },
  { code:'JO', name:'الأردن 🇯🇴', phone_code:'+962', govs:['عمان','الزرقاء','إربد','البلقاء','مادبا','الكرك','العقبة'] },
  { code:'LB', name:'لبنان 🇱🇧', phone_code:'+961', govs:['بيروت','جبل لبنان','الشمال','الجنوب','البقاع','النبطية'] },
  { code:'SY', name:'سوريا 🇸🇾', phone_code:'+963', govs:['دمشق','حلب','حمص','اللاذقية','طرطوس','حماة','دير الزور'] },
  { code:'IQ', name:'العراق 🇮🇶', phone_code:'+964', govs:['بغداد','البصرة','الموصل','أربيل','كركوك','النجف','كربلاء','الأنبار'] },
  { code:'LY', name:'ليبيا 🇱🇾', phone_code:'+218', govs:['طرابلس','بنغازي','مصراتة','الزاوية','سبها'] },
  { code:'TN', name:'تونس 🇹🇳', phone_code:'+216', govs:['تونس','صفاقس','سوسة','القيروان','بنزرت','نابل'] },
  { code:'MA', name:'المغرب 🇲🇦', phone_code:'+212', govs:['الدار البيضاء','الرباط','فاس','مراكش','طنجة','أكادير','مكناس'] },
  { code:'DZ', name:'الجزائر 🇩🇿', phone_code:'+213', govs:['الجزائر','وهران','عنابة','قسنطينة','سطيف','باتنة','تلمسان'] },
  { code:'SD', name:'السودان 🇸🇩', phone_code:'+249', govs:['الخرطوم','أم درمان','بورتسودان','كسلا','مدني'] },
  { code:'TR', name:'تركيا 🇹🇷', phone_code:'+90', govs:['إسطنبول','أنقرة','إزمير','بورصة','أنطاليا','أضنة'] },
  { code:'US', name:'الولايات المتحدة 🇺🇸', phone_code:'+1', govs:[] },
  { code:'GB', name:'المملكة المتحدة 🇬🇧', phone_code:'+44', govs:[] },
  { code:'DE', name:'ألمانيا 🇩🇪', phone_code:'+49', govs:[] },
  { code:'FR', name:'فرنسا 🇫🇷', phone_code:'+33', govs:[] },
];

function getCountry(code) { return COUNTRIES.find(c => c.code === code) || COUNTRIES[0]; }

function buildCountryOptions(selectedCode='EG') {
  return COUNTRIES.map(c => '<option value="'+c.code+'"'+(c.code===selectedCode?' selected':'')+'>'+c.name+'</option>').join('');
}

function buildGovernorateOptions(countryCode='EG', selectedGov='') {
  const country = getCountry(countryCode);
  if (!country.govs.length) return '<option value="">—</option>';
  return '<option value="">— المحافظة —</option>' + country.govs.map(g => '<option value="'+g+'"'+(g===selectedGov?' selected':'')+'>'+g+'</option>').join('');
}

function onCountryChange(countrySelectId, govSelectId, phoneCodeId) {
  const code = document.getElementById(countrySelectId)?.value || 'EG';
  const country = getCountry(code);
  const govSel = document.getElementById(govSelectId);
  if (govSel) govSel.innerHTML = buildGovernorateOptions(code);
  const phoneCode = document.getElementById(phoneCodeId);
  if (phoneCode) phoneCode.textContent = country.phone_code;
}


// ============================================================
// SIDEBAR NAVIGATION
// ============================================================
function toggleSidebar() {
  // mobile: open/close
  const sb = document.getElementById('main-sidebar');
  if (sb) sb.classList.toggle('open');
}

function toggleSidebarCollapse() {
  const sb = document.getElementById('main-sidebar');
  const mc = document.getElementById('main-content');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!sb) return;
  const isRtl = document.documentElement.dir !== 'ltr';
  const isCollapsed = sb.classList.toggle('collapsed');
  if (isCollapsed) {
    if (mc) mc.classList.add('full');
    btn.textContent = isRtl ? '\u25b6' : '\u25c0';
    btn.style.right = isRtl ? '0' : 'auto';
    btn.style.left = isRtl ? 'auto' : '0';
  } else {
    if (mc) mc.classList.remove('full');
    btn.textContent = isRtl ? '\u25c0' : '\u25b6';
    btn.style.right = isRtl ? '190px' : 'auto';
    btn.style.left = isRtl ? 'auto' : '190px';
  }
}

function sbShowPage(name, btn, _skipHistory) {
  // Update active state in sidebar
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Close mobile sidebar
  document.getElementById('main-sidebar')?.classList.remove('open');
  // Call showPage — pass _skipHistory flag through
  const pageBtn = document.querySelector('[data-page="'+name+'"]');
  showPage(name, pageBtn || btn, _skipHistory);
}

function updateSidebarBadge() {
  const badge = document.getElementById('sb-inbox-badge');
  const mainBadge = document.getElementById('inbox-nav-badge');
  if (badge && mainBadge) {
    const count = mainBadge.textContent;
    if (mainBadge.style.display !== 'none' && count) {
      badge.style.display = 'inline';
      badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }
  }
}

// Sync sidebar active state when showPage is called
const _origShowPage2 = window.showPage;
window.showPage = function(name, btn) {
  if (_origShowPage2) _origShowPage2.call(this, name, btn);
  // Update sidebar active
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  const sbItem = document.getElementById('sb-'+name);
  if (sbItem) sbItem.classList.add('active');
};

// Sync inbox badge to sidebar
setInterval(updateSidebarBadge, 2000);

// ============================================================
// LANGUAGE SYSTEM (i18n)
// ============================================================
const TRANSLATIONS = {
  ar: {
    logout: 'خروج',
    dashboard: '🏠 الرئيسية',
    invoices: '🧾 الفواتير',
    orders: '📋 الطلبات',
    crm: '👥 العملاء',
    inventory: '📦 المخزون',
    suppliers: '🛍️ الموردين',
    treasury: '💰 الخزينة',
    followup: '📱 المتابعة',
    affiliates: '🤝 الموزعين',
    pricing: '💲 التسعير',
    contracts: '📝 العقود',
    roas: '📊 ROAS',
    content: '📅 المحتوى',
    plan90: '🗓️ 90 يوم',
    hr: '👤 HR',
    team: '🔑 الفريق',
    settings: '⚙️ الإعدادات',
    library: '🎓 المكتبة',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    search: 'بحث...',
    loading: 'جاري التحميل...',
    noData: 'لا توجد بيانات',
    confirm: 'تأكيد',
    revenue: 'إيراد الشهر',
    newOrders: 'طلبات جديدة',
    clients: 'العملاء',
    lowStock: 'مخزون منخفض',
  },
  en: {
    logout: 'Logout',
    dashboard: '🏠 Dashboard',
    invoices: '🧾 Invoices',
    orders: '📋 Orders',
    crm: '👥 Clients',
    inventory: '📦 Inventory',
    suppliers: '🛍️ Suppliers',
    treasury: '💰 Treasury',
    followup: '📱 Follow-up',
    affiliates: '🤝 Affiliates',
    pricing: '💲 Pricing',
    contracts: '📝 Contracts',
    roas: '📊 ROAS',
    content: '📅 Content',
    plan90: '🗓️ 90 Days',
    hr: '👤 HR',
    team: '🔑 Team',
    settings: '⚙️ Settings',
    library: '🎓 Library',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search...',
    loading: 'Loading...',
    noData: 'No data found',
    confirm: 'Confirm',
    revenue: 'Monthly Revenue',
    newOrders: 'New Orders',
    clients: 'Clients',
    lowStock: 'Low Stock',
  }
};

let currentLang = localStorage.getItem('areej_lang') || 'ar';

function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.ar)[key] || key;
}

function toggleLang() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('areej_lang', currentLang);
  applyLang();
}

function applyLang() {
  const isEn = currentLang === 'en';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = isEn ? 'AR' : 'EN';
  // Reposition sidebar-toggle after dir change
  const sb = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn && sb) {
    const isCollapsed = sb.classList.contains('collapsed');
    if (isEn) {
      btn.textContent = isCollapsed ? '\u25b6' : '\u25c0';
      btn.style.right = 'auto';
      btn.style.left = isCollapsed ? '0' : '190px';
    } else {
      btn.textContent = isCollapsed ? '\u25c0' : '\u25b6';
      btn.style.left = 'auto';
      btn.style.right = isCollapsed ? '0' : '190px';
    }
  }
  // Update nav tabs
  document.querySelectorAll('[data-page]').forEach(btn => {
    const page = btn.getAttribute('data-page');
    if (TRANSLATIONS[currentLang][page]) btn.textContent = TRANSLATIONS[currentLang][page];
  });
  // Update data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (TRANSLATIONS[currentLang][key]) el.textContent = TRANSLATIONS[currentLang][key];
  });
}

// Apply on load
document.addEventListener('DOMContentLoaded', () => {
  applyLang();
  // Mobile: show hamburger, hide sidebar-toggle
  if (window.innerWidth <= 768) {
    const hb = document.getElementById('mobile-hamburger');
    if (hb) hb.style.display = 'flex';
    const st = document.getElementById('sidebar-toggle-btn');
    if (st) st.style.display = 'none';
  }
  // Set initial toggle arrow direction
  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) {
    const isRtl = document.documentElement.dir !== 'ltr';
    btn.textContent = isRtl ? '\u25c0' : '\u25b6';
  }
  // Company name in topbar
  const sn = document.getElementById('sb-brand-name');
  const tb = document.getElementById('tb-company-name');
  if (sn && tb) tb.textContent = '';
});

// ============================================================
// NOTIFICATIONS SYSTEM
// ============================================================
let notifOpen = false;

function toggleNotifDropdown() {
  notifOpen = !notifOpen;
  const dd = document.getElementById('topbar-notif-dropdown');
  if (dd) dd.style.display = notifOpen ? 'block' : 'none';
  if (notifOpen) loadNotifications();
}

// Close dropdowns if clicked outside
document.addEventListener('click', (e) => {
  // Notifications
  if (notifOpen && !e.target.closest('#topbar-notif-dropdown') && !e.target.closest('#topbar-notif-btn')) {
    notifOpen = false;
    const dd = document.getElementById('topbar-notif-dropdown');
    if (dd) dd.style.display = 'none';
  }
  // Templates dropdown
  const tplDd = document.getElementById('templates-dropdown');
  if (tplDd && tplDd.style.display !== 'none') {
    if (!e.target.closest('#templates-dropdown') && !e.target.closest('[onclick="toggleTemplates()"]')) {
      tplDd.style.display = 'none';
    }
  }
  // AI suggestions dropdown
  const aiDd = document.getElementById('ai-suggestions-dropdown');
  if (aiDd && aiDd.style.display !== 'none') {
    if (!e.target.closest('#ai-suggestions-dropdown') && !e.target.closest('#ai-reply-btn')) {
      aiDd.style.display = 'none';
    }
  }
});

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">جاري التحميل...</div>';
  const r = await apiFetch('/api/system/notifications');
  if (!r.ok) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">خطأ في التحميل</div>'; return; }
  updateNotifBadge(r.unread);
  if (!r.notifications.length) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">🔔 لا توجد إشعارات</div>';
    return;
  }
  list.innerHTML = r.notifications.map(n => {
    const ico = n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : n.type === 'error' ? '❌' : '🔔';
    const bg = n.is_read ? '#fff' : '#f0fdf4';
    const ago = timeAgo(n.created_at);
    return '<div onclick="markRead(' + n.id + ',this)" style="padding:12px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;background:' + bg + ';transition:.15s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'' + bg + '\'">' +
      '<div style="display:flex;gap:8px;align-items:flex-start">' +
      '<span style="font-size:16px;flex-shrink:0">' + ico + '</span>' +
      '<div style="flex:1">' +
      '<div style="font-size:12px;font-weight:' + (n.is_read ? '400' : '700') + ';color:#1a1a1a;margin-bottom:2px">' + (n.title||'') + '</div>' +
      '<div style="font-size:11px;color:#6b7280">' + (n.body||'') + '</div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:3px">' + ago + '</div>' +
      '</div></div></div>';
  }).join('');
}

async function markRead(id, el) {
  await apiFetch('/api/system/notifications/read/' + id, { method:'POST' });
  el.style.background = '#fff';
  el.querySelector('div > div > div:first-child').style.fontWeight = '400';
  const badge = document.getElementById('topbar-notif-count');
  const cur = parseInt(badge ? badge.textContent : '0') || 0;
  updateNotifBadge(Math.max(0, cur - 1));
}

async function markAllRead() {
  await apiFetch('/api/system/notifications/read-all', { method:'POST' });
  updateNotifBadge(0);
  loadNotifications();
}

function updateNotifBadge(count) {
  // topbar badge
  const badge = document.getElementById('topbar-notif-count');
  if (badge) {
    if (count > 0) {
      badge.style.display = 'inline';
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge.style.display = 'none';
    }
  }
  // legacy sidebar badge (no longer visible but keep for compat)
  const oldBadge = document.getElementById('notif-badge');
  if (oldBadge) { oldBadge.textContent = count; oldBadge.style.display = count > 0 ? 'block' : 'none'; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'منذ ثواني';
  if (diff < 3600) return 'منذ ' + Math.floor(diff/60) + ' دقيقة';
  if (diff < 86400) return 'منذ ' + Math.floor(diff/3600) + ' ساعة';
  return 'منذ ' + Math.floor(diff/86400) + ' يوم';
}

// Poll notifications count every 60 seconds
setInterval(async () => {
  try {
    const r = await apiFetch('/api/system/notifications');
    if (r.ok) updateNotifBadge(r.unread);
  } catch(e) {}
}, 60000);

// Load initial badge count after auth
const _origCheckAuth = checkAuth;
checkAuth = async function() {
  await _origCheckAuth();
  try {
    const r = await apiFetch('/api/system/notifications');
    if (r && r.ok) updateNotifBadge(r.unread);
  } catch(e) {}
};

