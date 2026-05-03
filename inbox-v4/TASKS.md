# TASKS.md — Inbox v4
> آخر تحديث: 2026-05-03

---

## Phase 0 — الأساس (Scaffold + Infrastructure)

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P0-1 | إنشاء scaffold (هذا الملف + SESSIONS + DECISIONS + SCHEMA) | `inbox-v4/*.md` | ✅ مكتملة |
| P0-2 | بناء InboxStore (state management) | `public/dashboard/inbox-v4/store.js` | ✅ مكتملة |
| P0-3 | بناء InboxAPI layer (كل الـ fetch calls) | `public/dashboard/inbox-v4/api.js` | ✅ مكتملة |
| P0-4 | SSE endpoint في backend | `server/routes/inbox/stream.js` | ✅ مكتملة |
| P0-5 | SSE receiver في frontend | `public/dashboard/inbox-v4/stream.js` | ✅ مكتملة |
| P0-6 | Layout الأساسي (3 columns + shell) | `public/dashboard/inbox-v4/index.html` + `inbox.css` | ✅ مكتملة |
| P0-7 | Migrations جديدة (inbox tables v4) | `server/migrations.js` v18–v24 | ✅ مكتملة |

---

## Phase 1 — Core Messaging

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P1-1 | Conversations List + Real-time updates | `conv-list.js` | ✅ مكتملة |
| P1-2 | Chat Window + Message Rendering | `chat.js` | ✅ مكتملة |
| P1-3 | Send Text + Media | `reply.js` + backend `messages.js` | ✅ مكتملة |
| P1-4 | Reply Mode + Note Mode | `reply.js` + `chat.js` | ✅ مكتملة |
| P1-5 | Read/Unread tracking | `chat.js` + `conv-list.js` | ✅ مكتملة |

---

## Phase 2 — Team

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P2-1 | Assignment + Auto-assign | `team.js` + backend `team.js` | ✅ مكتملة |
| P2-2 | Agent Status (Online/Busy/Away/Offline) | `team.js` | ✅ مكتملة |
| P2-3 | Collision Detection | `chat.js` + SSE | ✅ مكتملة |
| P2-4 | @Mentions في الـ Notes | `reply.js` | ✅ مكتملة |
| P2-5 | Conversation Transfer مع context | `team.js` | ✅ مكتملة |

---

## Phase 3 — Conversations Management

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P3-1 | Labels + Tags | `labels.js` + backend `labels.js` | ✅ مكتملة |
| P3-2 | Priority (Low/Normal/High/Urgent) | `conv-list.js` + backend | ✅ مكتملة |
| P3-3 | Snooze | `conv-list.js` + backend | ✅ مكتملة |
| P3-4 | Bulk Actions | `conv-list.js` | ✅ مكتملة |
| P3-5 | Search (Quick + Deep) | `search.js` + backend | ✅ مكتملة |
| P3-6 | SLA Tracking | backend `conversations.js` + analytics | ✅ مكتملة |

---

## Phase 4 — Automation

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P4-1 | Keywords Auto-Reply | backend `automation.js` | ✅ مكتملة |
| P4-2 | Chatbot Flows (visual builder) | `chatbot.js` + backend | ✅ مكتملة |
| P4-3 | Welcome + Away Messages | backend `automation.js` | ✅ مكتملة |
| P4-4 | Auto-Close | backend `automation.js` | ✅ مكتملة |
| P4-5 | Scheduled Messages | backend `automation.js` | ✅ مكتملة |

---

## Phase 5 — Context Panel

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P5-1 | Customer Info + CRM Link | `context.js` | ✅ مكتملة |
| P5-2 | Order/Invoice History + CLV | `context.js` + backend | ✅ مكتملة |
| P5-3 | Quick Actions (New Invoice / Payment Link) | `context.js` | ✅ مكتملة |
| P5-4 | Internal Notes | `context.js` | ✅ مكتملة |
| P5-5 | Conversation Timeline | `context.js` | ✅ مكتملة |

---

## Phase 6 — Analytics

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P6-1 | Overview Dashboard | `analytics.js` + backend `analytics.js` | ✅ مكتملة |
| P6-2 | Agent Performance Reports | backend `analytics.js` | ✅ مكتملة |
| P6-3 | Platform Breakdown | backend `analytics.js` | ✅ مكتملة |
| P6-4 | CSAT Analytics | backend `analytics.js` | ✅ مكتملة |
| P6-5 | SLA Reports | backend `analytics.js` | ✅ مكتملة |
| P6-6 | Export PDF/Excel | backend `analytics.js` | ✅ مكتملة (CSV+BOM) |

---

## Phase 7 — AI Features

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P7-1 | AI Suggestions محسّنة | `reply.js` + backend | ✅ مكتملة |
| P7-2 | Conversation Summary | `chat.js` + backend | ✅ مكتملة (ضمن P7-1) |
| P7-3 | Auto-Label Suggestion | backend `automation.js` | ⬜ |
| P7-4 | Sentiment Analysis | backend `analytics.js` | ⬜ |
| P7-5 | Voice Note Transcript (Whisper) | `components/media-player.js` + backend | ⬜ |

---

## Phase 8 — Advanced Integrations

| # | المهمة | الملفات | الحالة |
|---|--------|---------|--------|
| P8-1 | Email Channel | backend `settings.js` + frontend | ⬜ |
| P8-2 | WA Interactive Messages (Buttons/Lists) | backend `messages.js` | ⬜ |
| P8-3 | WA Catalog Products | backend `messages.js` | ⬜ |
| P8-4 | Broadcast V2 (multi-platform) | backend `broadcast.js` | ⬜ |
| P8-5 | Webhook Triggers | backend `automation.js` | ⬜ |

---

## 🔴 المهمة القادمة
**P7-3: Auto-Label Suggestion** — backend `automation.js`
أو — **P8-2: WA Interactive Messages (Buttons/Lists)** — backend `messages.js`
