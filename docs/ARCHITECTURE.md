# Architecture & Engineering Guide

Technical reference for the research chat platform: system architecture, data model, key flows, the AI agent system, configuration, deployment, and known issues.

> **Audience:** engineers and researchers maintaining or extending the platform.
> For product requirements see [PRD.md](../PRD.md); for the research instrument see [Policy_Pairs_Reference_Document.md](../Policy_Pairs_Reference_Document.md); for endpoint-level detail see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Research design](#2-research-design)
3. [System architecture](#3-system-architecture)
4. [Repository layout](#4-repository-layout)
5. [Frontend architecture](#5-frontend-architecture)
6. [Backend architecture](#6-backend-architecture)
7. [Data model](#7-data-model)
8. [Key flows](#8-key-flows)
9. [The AI agent system](#9-the-ai-agent-system)
10. [Configuration](#10-configuration)
11. [Deployment](#11-deployment)
12. [Operational scripts](#12-operational-scripts)
13. [Testing](#13-testing)
14. [Known issues & code health](#14-known-issues--code-health)
15. [Maintenance guide: where to change things](#15-maintenance-guide-where-to-change-things)

---

## 1. Overview

This is a **behavioral research platform** studying how a customer-service AI agent's **Emotional Intelligence (EQ) × Cognitive Intelligence (CQ)** profile affects user perceptions across service-failure scenarios framed as **utilitarian** (functional loss) vs **hedonic** (experiential loss).

Participants register, are randomly and permanently assigned one of 9 AI agents, complete a one-time AI-literacy survey, then chat through 20 service-failure topics (role-playing an aggrieved customer) with a 16-question survey after each topic. Every message and survey response is logged for analysis.

- **Frontend:** React SPA (Vite + TypeScript + shadcn/ui) deployed on Netlify.
- **Backend:** Node.js + Express + PostgreSQL + OpenAI Chat Completions, deployed on Render.
- **Origin:** scaffolded with Lovable; the bulk of the application was built in late January 2026, with the study operated live through at least April 2026.

## 2. Research design

**Study protocol per participant:**

1. **Register** → randomly assigned one of 9 agents (`Math.floor(Math.random() * 9) + 1` in `backend/src/models/User.ts`, `UserModel.create`). The assignment is permanent (between-subjects design). The agent's EQ/CQ profile is deliberately hidden from participants (blinding), though the agent *name* is still shown in several UI locations.
2. **AI-literacy survey** — one-time, 8 questions (`lit-1` … `lit-8`).
3. **20 topics** — 10 service domains × 2 scenario framings (utilitarian / hedonic), i.e. 10 *policy pairs*. Each topic locks after **10 interactions** (user + agent exchanges).
4. **Post-topic survey** — 16 questions (`post-1` … `post-16`), Likert 1–7, required to unlock the next topic.
5. After all 20 topics: "Study Complete" screen.

**The 9 agents** (seeded by `backend/src/seeds/agents.seed.ts`) each carry a categorical EQ and CQ level (`low` / `medium` / `high`):

| Agent | EQ | CQ |
|---|---|---|
| 1 | low | medium |
| 2 | medium | medium |
| 3 | medium | low |
| 4 | low | high |
| 5 | high | low |
| 6 | medium | medium |
| 7 | medium | medium |
| 8 | high | high |
| 9 | low | low |

> ⚠️ **This is not a full 3×3 factorial**: (medium, high) and (high, medium) are missing, and (medium, medium) appears three times. Additionally, agents 1, 3, 6 and 7 have `system_prompt_template` text that *contradicts* their stored levels (e.g. Agent 1 is stored EQ=low/CQ=medium but its template claims "high cognitive intelligence"). See [Known issues](#14-known-issues--code-health).

**The 20 topics** are seeded by `backend/src/seeds/topics.seed.ts` from [Policy_Pairs_Reference_Document.md](../Policy_Pairs_Reference_Document.md): Food Delivery, Ride-Hailing, Airline, Hotel, Retail, Subscription, Telecom, Events, Banking, E-commerce — each with a utilitarian and a hedonic variant. The `domain`, `scenario_type`, and `policy_pair_id` columns are pure analysis metadata: no runtime code path reads them; the experimental manipulation manifests only through the differing `stimulus_text` and `topic_specific_policy` injected into the LLM prompt.

**Survey question text** lives only in the frontend (`src/data/mockData.ts` — despite the name, this file is live production code). The database stores `(question_id, value)` pairs; analysis must join against the frontend question bank.

## 3. System architecture

```
┌────────────────────────── Browser ──────────────────────────┐
│  React SPA (Vite + TS + shadcn/ui, HashRouter)              │
│   /            → src/pages/Index.tsx  (participant flow)    │
│   /#/admin     → src/pages/AdminDashboard.tsx (researcher)  │
│   src/lib/api.ts — all HTTP; JWT in                         │
│     localStorage['auth_token']; retry ×5 with backoff;      │
│     /health pre-check to ride out Render cold starts        │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS JSON  {success, data | error:{message,code}}
             │ Authorization: Bearer <JWT>    (participant routes)
             │ x-admin-api-key: <key>         (admin routes)
             ▼
┌──────────── Render web service (root dir: backend/) ────────┐
│  Express (backend/src/app.ts)                               │
│   helmet → CORS → express.json → per-route rate limit       │
│   → authenticate (JWT) → validate (Zod) → controller        │
│   → errorHandler                                            │
│  Routes: /health, /api/{auth,user,topics,chat,surveys,      │
│          guardrails,admin}                                  │
│  services/agent.service.ts   — system-prompt assembly       │
│  services/openai.service.ts  — chat completions             │
└─────┬───────────────────────────────┬───────────────────────┘
      │ pg Pool (max 20)              │ OpenAI SDK, 30s timeout
      ▼                               ▼
┌ Render PostgreSQL ┐        ┌ OpenAI Chat Completions  ┐
│ 9 live tables     │        │ gpt-4o-mini (default),   │
└───────────────────┘        │ temp 0.7, max_tokens 500 │
                             └──────────────────────────┘

Frontend deploy: Netlify (netlify.toml — publish dist/, SPA redirect;
  env var VITE_API_URL points at the Render backend)
```

## 4. Repository layout

```
/                       Frontend (Vite React app) + project docs
├── src/
│   ├── pages/          Index.tsx (participant state machine),
│   │                   AdminDashboard.tsx, NotFound.tsx
│   ├── components/
│   │   ├── auth/       AuthForm, ForgotPasswordForm, AgentIntroduction (dead)
│   │   ├── chat/       ChatWindow, MessageInput, MessageBubble,
│   │   │               TopicHeader, TypingIndicator
│   │   ├── layout/     TopicList, TopicListModal, PolicyPanel, ProgressBar
│   │   ├── survey/     SurveyModal, LikertScale
│   │   └── ui/         shadcn/ui primitives (generated)
│   ├── lib/api.ts      All HTTP calls, token helpers
│   ├── utils/retry.ts  Retry-with-backoff wrapper used by api.ts
│   ├── data/mockData.ts  LIVE: survey question banks + displayed guardrails
│   └── types/index.ts  Shared frontend types
├── backend/
│   └── src/
│       ├── app.ts              Express bootstrap, CORS, route mounting
│       ├── config/             database.ts (pg Pool), openai.ts (SDK client)
│       ├── middleware/         auth (JWT), validation (Zod), error handler
│       ├── routes/ + controllers/   auth, user, topic, chat, survey,
│       │                            guardrail, admin
│       ├── services/           agent.service.ts, openai.service.ts
│       ├── models/             One class per table (raw SQL via pg)
│       ├── migrations/         Plain .sql files + run-migrations.ts runner
│       ├── seeds/              agents, topics, guardrails + run-seeds.ts
│       └── utils/              sanitize.ts, password.ts, errors.ts,
│                               intelligenceLevel.ts (dead)
├── docs/               This file, API docs, DB schema doc, admin docs
├── netlify.toml        Frontend deploy config
├── render.yaml         Backend deploy config
└── *.md (repo root)    PRD, policy-pairs reference, and ~35 historical
                        incident/fix logs from the January 2026 deployment
```

## 5. Frontend architecture

**Routing** (`src/App.tsx`): `HashRouter` with three routes — `/` (participant app), `/admin` (researcher dashboard, i.e. `/#/admin` in the URL), and a catch-all `NotFound`. Hash routing was adopted after path-based routing 404'd on static hosting; an effect in `App.tsx` additionally redirects a plain-path `/admin` visit to `/#/admin`.

**State management:** everything is hand-rolled `useState`/`useEffect`. A `QueryClientProvider` is mounted in `App.tsx` but **no component uses react-query** — it is vestigial scaffolding.

**`src/pages/Index.tsx` is the heart of the frontend.** It owns the entire participant state machine:

```
auth ──► literacy-survey ──► chat loop (per topic) ──► study complete
  │                            │  10 exchanges → topic locks
  └── admin login branch       └► 16-q post-topic survey → next topic
```

Key responsibilities concentrated in `Index.tsx`:

- On mount, `loadUserState` restores the session from the stored JWT (`GET /api/user/state`), loading the current topic, message history, and progress.
- `handleAuth` handles register/login; a hardcoded credential check branches to the admin dashboard (see [Known issues](#14-known-issues--code-health)).
- `handleSendMessage` performs an optimistic UI update, calls `POST /api/chat/message`, then reconciles with the server response (interaction count, lock state, survey trigger).
- `handleLiteracySurveySubmit` → after the literacy survey, auto-sends the topic's `stimulus_text` as the participant's first message — **only at this one call site**, which is why topic 1 behaves differently from topics 2–20 (see Known issues).
- Survey modals, progress, and the "Study Complete" screen — shown when `completedTopics >= totalTopics` **or** `currentTopicIndex >= allTopics.length`. The second condition misfires when the topic list failed to load (`0 >= 0`), showing "Study Complete" to a mid-study participant.

**API layer** (`src/lib/api.ts`):

- Base URL from `VITE_API_URL` (default `http://localhost:3000`); all endpoints under `/api`.
- JWT stored in `localStorage['auth_token']`; sent as `Authorization: Bearer <token>`.
- On any 401: token removed and an `auth-failed` window event dispatched; `Index.tsx` listens and resets to the auth screen. This blanket handler also intercepts a failed *login* (the backend returns 401 for bad credentials), so a mistyped password surfaces as a "session expired" toast instead of "invalid email or password".
- For `/auth/` and `/admin/` calls, a `GET /health` pre-check waits up to ~30s for Render free-tier cold starts.
- Every request is wrapped in `retry()` (`src/utils/retry.ts`): 1 initial attempt + up to 5 retries (6 total), exponential backoff starting at 2s, 30s `AbortController` timeout per attempt. ⚠️ This includes **non-idempotent POSTs** — see Known issues.
- Responses follow `{success: true, data} | {success: false, error: {message, code}}`.

**Presentational components** (`src/components/`) are thin: `ChatWindow` renders messages + typing indicator; `MessageInput` gates on lock state; `PolicyPanel` shows the topic stimulus, the *hardcoded* guardrail text from `mockData.ts`, and a static placeholder sentence where a topic policy would go (the real `topic_specific_policy` never leaves the backend — no API response carries it); `SurveyModal`/`LikertScale` render the 16-question instrument; `TopicList`/`ProgressBar` show progression.

## 6. Backend architecture

**Bootstrap** (`backend/src/app.ts`): validates that `DATABASE_URL`, `OPENAI_API_KEY`, and `JWT_SECRET` are present (exits otherwise), sets `trust proxy 1` (Render), applies `helmet`, CORS, and `express.json`, mounts routes, and registers the error handler last.

> Note: env loading is order-fragile — `config/openai.ts` and `config/database.ts` call `dotenv.config()` at import time, which is what actually loads `.env` before `app.ts`'s own top-level code runs.

**Middleware pipeline** (per request):

```
helmet → CORS → express.json
  → authenticate (JWT → req.userId/req.userEmail)   [all /api/* except /api/auth]
  → rate limiter   [auth routes only; plus POST /api/chat/message, after authenticate]
  → validate (Zod schema on {body,query,params})
  → controller → errorHandler
```

- **CORS** (`app.ts`): the `Origin` header is parsed as a URL and checked against: any localhost/127.0.0.1 port in development, an exact match with `FRONTEND_URL` (normalized, no trailing slash), or an HTTPS origin whose parsed *hostname* ends with `.netlify.app` (a true suffix check — `x.netlify.app.evil.com` is rejected). Requests with **no `Origin` header are always allowed** — CORS is a browser mechanism and does not gate curl/server-side clients.
- **Rate limits** (express-rate-limit): register/login 5 per 15 min, password reset 3/hr, `POST /api/chat/message` 30/min (applied after `authenticate`), and all `/api/admin/*` routes 100 per 15 min (failed key attempts count, throttling brute force). The chat GET endpoints and the user/topic/survey/guardrail routes are not rate-limited.
- **`authenticate`** (`middleware/auth.middleware.ts`): verifies an HS256 JWT (payload `{userId, email}`, 7-day expiry), then does one DB lookup to reject tokens for deleted users and tokens issued before the user's last password reset (`password_changed_at`), and copies the payload onto the request as `req.userId`/`req.userEmail` (no `req.user`; controllers fetch the full user record themselves). `generateToken` in the same file issues tokens; there is no fallback JWT secret — the process exits at startup if `JWT_SECRET` is unset.
- **`validate`** (`middleware/validation.middleware.ts`): parses with Zod and maps `ZodError` → 400. The parse *result* is discarded, so Zod transforms/defaults never reach controllers.
- **Error handling** (`middleware/error.middleware.ts` + `utils/errors.ts`): typed `AppError` subclasses (`ValidationError` 400, `AuthenticationError` 401, `NotFoundError` 404, `ConflictError` 409); anything else becomes a generic 500 (`INTERNAL_ERROR`), with detail leaked only in development.

**Route map:**

| Mount | Routes | Auth |
|---|---|---|
| `/health` | liveness probe | none |
| `/api/auth` | `POST /register`, `POST /login`, `POST /forgot-password`, `POST /reset-password` | none (rate-limited) |
| `/api/user` | `GET /state` (full session restore payload), `GET /agent` | JWT |
| `/api/topics` | `GET /`, `GET /current`, `GET /with-status`, `GET /:id` | JWT |
| `/api/chat` | `POST /message`, `GET /messages/:topicId`, `GET /status/:topicId` | JWT |
| `/api/surveys` | `POST /literacy`, `GET /literacy/status`, `POST /post-topic` | JWT |
| `/api/guardrails` | `GET /` | JWT |
| `/api/admin` | `GET /verify`, `GET /dashboard`, `GET /users`, `GET /users/:userId`, `GET /messages`, `GET /surveys/literacy`, `GET /surveys/post-topic`, `POST /migrations/run`, `POST /seeds/run` | `x-admin-api-key` header (timing-safe compare against `ADMIN_API_KEY`; **fails closed** — 403 for every request if the env var is unset) |

**Models** (`backend/src/models/`) are plain classes issuing parameterized SQL through the shared pg `Pool` (`config/database.ts`, max 20 connections). There is no ORM and — notably — **no transactions anywhere** (see Known issues).

**Input sanitization** (`backend/src/utils/sanitize.ts`) runs in controllers *after* Zod validation, on every user-supplied string: strips null bytes and C0 control characters (preserving tab/LF/CR), trims, and **silently truncates** — `sanitizeString` at 10,000 chars, `sanitizeMessageContent` at 5,000, `sanitizeEmail` at 255 (lowercased, whitespace stripped), `sanitizePassword` at 1,000 (not trimmed). There is no LLM content moderation on input.

## 7. Data model

PostgreSQL, provisioned by plain-SQL files in `backend/src/migrations/`, executed by `run-migrations.ts` — a hand-rolled runner with a **hardcoded file list** and no `schema_migrations` tracking table (idempotency relies on `IF NOT EXISTS` and swallowing pg error codes `42P07`/`42710`, which also makes `npm run migrate` safe to re-run). The runner additionally retries-then-skips failing `CREATE INDEX` statements (error `42703`), and it splits each file naively on semicolons and executes the fragments without a transaction — a semicolon inside a string literal breaks it, and a mid-file failure leaves a migration half-applied.

| Table | PK | Key columns / constraints |
|---|---|---|
| `users` | UUID | `email` UNIQUE; `password_hash` (bcrypt, cost 12); `assigned_agent_id` INT CHECK 1–9 (no FK to `agents`); `current_topic_index` INT CHECK 0–19 (0-based); `has_completed_literacy_survey` BOOL; `password_changed_at` TIMESTAMPTZ (migration 012 — used to invalidate JWTs issued before a password reset) |
| `agents` | INT 1–9 | `name`, `system_prompt_template`; `emotional_intelligence_level` / `cognitive_intelligence_level` VARCHAR CHECK IN ('low','medium','high') — originally INTEGER 1–10, converted by migration `010_update_agents_intelligence_levels.sql` |
| `topics` | INT 1–20 | `title`, `stimulus_text`, `topic_specific_policy`, `order_index` UNIQUE 1–20 (1-based); migration 011 adds `domain`, `scenario_type`, `policy_pair_id`, `initial_customer_message` — all nullable and unconstrained; the 'utilitarian'/'hedonic' and 1–10 value sets are seed conventions, not CHECKs |
| `messages` | UUID | `user_id` FK→users CASCADE; `topic_id` FK→topics RESTRICT; `role` CHECK ('user','agent'); `content`; `timestamp` |
| `user_topic_interactions` | UUID | UNIQUE(user_id, topic_id); `interaction_count` CHECK ≥ 0 (the 10-cap is app-level only); `is_locked`; `survey_completed` |
| `ai_literacy_survey_responses` | UUID | UNIQUE(user_id, question_id); `response_value` TEXT (no range validation) |
| `post_topic_survey_responses` | UUID | UNIQUE(user_id, topic_id, question_id); `response_value` INT CHECK 1–7 |
| `global_guardrails` | INT CHECK (id=1) | singleton row: `title`, `content` |
| `password_reset_tokens` | UUID | `token` UNIQUE (stores the SHA-256 hash of the token; the raw token exists only in the response to the requester); `expires_at`; `used` |

**Conventions worth knowing:**

- `users.current_topic_index` is **0-based**; `topics.order_index` is **1-based**. They join via `order_index = current_topic_index + 1` (`TopicModel.getCurrentTopicForUser`).
- Migration `008` adds `updated_at` triggers to five tables.
- Two migration files share the `010_` prefix. `010_create_blacklisted_tokens.sql` is **absent from the runner's hardcoded list**, so the `blacklisted_tokens` table is never created and `models/BlacklistedToken.ts` is dead code (there is also no `/logout` route — logout is purely client-side token removal).
- Survey question *text* is not in the database; join exported `question_id`s against `src/data/mockData.ts`.

## 8. Key flows

### 8.1 Auth / session

- **Register:** `AuthForm` → `POST /api/auth/register` (Zod: email + password ≥ 6) → `UserModel.create` (bcrypt cost 12; random agent 1–9) → `{user, agent, token}` → JWT into `localStorage`.
- **Login:** `POST /api/auth/login`; generic "Invalid email or password" on both failure modes (no account enumeration) — though the frontend's blanket 401 handler intercepts it, so the user actually sees a "session expired" message. Note: login initializes an empty chat view — history loads via `GET /api/user/state` only on a full page load.
- **Session restore:** on mount, `Index.tsx` calls `GET /api/user/state`, which returns user, agent, current topic, messages, interaction state, and progress in one payload. ⚠️ Its error handler removes the token on *any* failure — a transient cold-start error logs the participant out.
- **Logout:** client-side token removal only. No server-side session invalidation exists; issued JWTs remain valid for their full 7 days.
- **Password reset:** `POST /forgot-password` creates a 24-hour single-use token (only its SHA-256 hash is stored). **No email is ever sent** — the raw token is returned in the API response only when `NODE_ENV=development`. Production password recovery is therefore still non-functional. `POST /reset-password` consumes the token and stamps `users.password_changed_at`, which invalidates all JWTs issued before the reset (checked in the auth middleware).

### 8.2 Chat message (the core loop)

1. `MessageInput` → `Index.handleSendMessage` → optimistic temp bubble → `POST /api/chat/message {topicId, content}`.
2. Backend (`chat.controller.ts:sendMessage`): `findOrCreate` the interaction row; reject if the topic is locked with survey pending; load topic, user, agent, guardrails, and message history; sanitize and **persist the user message**.
3. `OpenAIService.generateAgentResponse` builds the system prompt (see §9) + last-10 history and calls Chat Completions (30s timeout). ⚠️ **Any OpenAI error is caught and a canned apology is persisted as a normal agent message** — the interaction still counts and nothing in the DB marks it as a fallback. An empty/blank completion likewise becomes a hardcoded "could you provide a bit more detail" reply — a second unmarked fallback path.
4. Persist the agent reply; `incrementInteraction` (read-then-write; sets `is_locked` when the count reaches 10).
5. Respond `{userMessage, agentMessage, interactionCount, isLocked, shouldShowSurvey}`; the frontend swaps the temp bubble and opens the survey modal when the topic just locked.

No transaction wraps the three writes. The message-feedback thumbs in the UI are local state only — never persisted.

### 8.3 Topic & survey progression

- **Literacy survey** → `POST /api/surveys/literacy` → sets `has_completed_literacy_survey` → the frontend then auto-sends the current topic's `stimulus_text` as the participant's first chat message. Because this auto-send is wired only to the literacy-survey submit handler, **it fires for topic 1 only** — topics 2–20 start with an empty chat. On topic 1 the auto-sent stimulus consumes one of the 10 counted interactions, so participants author only 9 messages of their own there versus 10 on topics 2–20; and if the auto-send fails, it fails silently, leaving those participants with no stimulus message at all. The seeded `initial_customer_message` column is never read by any code path.
- **Topic lock** at 10 interactions → 16-question survey → `POST /api/surveys/post-topic` (Zod: exactly 16 responses, ints 1–7; requires the topic to be locked; 409 if already completed) → upserts the 16 rows, `markSurveyCompleted`, then `unlockNextTopic` increments `users.current_topic_index`.
- ⚠️ **The final (topic-20) survey always returns 500**: `unlockNextTopic` unconditionally writes `current_topic_index + 1` = 20, violating the `CHECK (0–19)` constraint. Because there is no transaction, the 16 responses and `survey_completed` are already saved — so the data is intact, but the participant sees an error, a retry hits 409 "Survey already completed", and the completion screen is only reached after a page refresh (via `completedTopics >= 20`).
- ⚠️ Linear progression is **frontend-enforced only**: the chat API accepts any `topicId`, and once a topic's survey is completed the lock check (`is_locked && !survey_completed`) permits unlimited further chat on it.

### 8.4 Admin / research data

- The admin dashboard (`/#/admin`, `src/pages/AdminDashboard.tsx`) first asks for the admin API key, verifies it via `GET /api/admin/verify`, and keeps it in `sessionStorage` for the browser session. It then shows aggregate stats, users, messages, and both survey datasets, with client-side CSV export (capped by the 1,000-row message fetch). A rejected key (401) clears the stored key and returns to the entry form.
- Backend access control is the `x-admin-api-key` header, compared timing-safely against `ADMIN_API_KEY` in `admin.controller.ts:requireAdmin` — fail-closed (admin API disabled with a 403 if the env var is unset; no fallback key, no development bypass), rate-limited at 100 requests / 15 min.
- `POST /api/admin/migrations/run` and `POST /api/admin/seeds/run` exist to re-run the intelligence-level migration and the agent seed remotely (they were built for the Jan 2026 EQ/CQ format change; the migration endpoint reads a `.sql` file from disk and would fail in a compiled `dist/` deployment since `tsc` doesn't copy `.sql` files).
- `data_folder_private/` (git-ignored) holds standalone SQL queries mirroring the admin views plus real exported study data.

## 9. The AI agent system

**Prompt assembly** (`AgentService.buildSystemPrompt`, `backend/src/services/agent.service.ts`), concatenated in order:

1. `agent.system_prompt_template` (the persona, from the seed).
2. **"Your Intelligence Profile"** — the agent's EQ/CQ levels plus per-level behavioral guidance blocks (`getEmotionalIntelligenceGuidance` / `getCognitiveIntelligenceGuidance`).
3. **"Global Guidelines"** — the `global_guardrails` singleton row's content (seeded by `guardrails.seed.ts`).
4. **"Topic-Specific Policy"** — `topic.topic_specific_policy`: the agent-side workflow, severity classification, resolution options, and escalation triggers for the scenario (hidden from participants).
5. Conversation guidelines: stay on the topic, use `stimulus_text` as context, redirect out-of-scope questions, keep replies to 2–4 sentences.
6. "Never say you cannot help."

Then the last 10 messages (`agent` role remapped to `assistant`) plus the new user message go to Chat Completions — model from `OPENAI_MODEL` (default `gpt-4o-mini`), temperature 0.7, `max_tokens` 500, `presence_penalty` 0.1, `frequency_penalty` 0.1, 30s timeout.

**Guardrails exist in three disconnected layers:**

| Layer | Source | Status |
|---|---|---|
| Prompt-injected | `global_guardrails` DB row | The only layer the model actually obeys |
| Output filter | `openai.service.ts` | Naive substring check — a reply containing "hack"/"exploit"/"illegal"/"harmful" is replaced wholesale with the out-of-scope message (false-positives on e.g. "hackathon") |
| Displayed to participants | `globalGuardrails` in `src/data/mockData.ts` | **Hardcoded** — `GET /api/guardrails` exists but has no frontend caller, so displayed policy can drift from enforced policy |

There is no input-side content moderation (only the character-level sanitization of §6).

## 10. Configuration

**Backend** (`backend/.env`, template in `backend/env.example`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ (startup exit) | pg connection string. TLS certificate verification is **on by default** for Render/production connections; `DATABASE_CA_CERT` supplies a custom CA (PEM), and `DATABASE_SSL_NO_VERIFY=true` is a last-resort escape hatch that restores the old unverified behavior |
| `OPENAI_API_KEY` | ✅ (startup exit) | Also throws at import time in `config/openai.ts` |
| `JWT_SECRET` | ✅ (startup exit) | HS256 signing key |
| `PORT` | – | default 3000 |
| `NODE_ENV` | – | gates CORS mode, error detail, and password-reset token echo |
| `FRONTEND_URL` | – | CORS allowlist entry; if unset in production, any `.netlify.app`-containing origin is accepted instead |
| `ADMIN_API_KEY` | required for admin routes | **Fails closed**: if unset, every `/api/admin/*` request gets a 403 (no fallback key, no dev bypass). Researchers enter this value at `/#/admin` |
| `OPENAI_MODEL` | – | default `gpt-4o-mini`; **not listed in env.example** |

**Frontend:** a single env var, `VITE_API_URL` (default `http://localhost:3000`, in `src/lib/api.ts`), baked in at build time — on Netlify it must be set in site settings before the build. The dev server itself runs on port **8080** (pinned in `vite.config.ts`); `backend/env.example` ships `FRONTEND_URL=http://localhost:5173`, which mismatches that port but works locally only because development-mode CORS allows all origins.

## 11. Deployment

**Backend → Render** (`render.yaml`, guides in the repo root):

- Web service with **Root Directory = `backend/`**; build `npm install && npm run build` (a `prebuild` script forces `npm install --include=dev` because Render prunes devDependencies); start `npm start` (`node dist/app.js`).
- **Migrations are a manual post-deploy step**: `npm run migrate` from the Render shell. This runs via `tsx` against `src/` — the compiled `dist/` contains no `.sql` files.
- Seeding likewise: `npm run seed` (agents → topics → guardrails; topics require migration 011's columns to exist first).
- Free-tier cold starts are why the frontend has the `/health` wait machinery.

**Frontend → Netlify** (`netlify.toml`):

- Build `npm run build`, publish `dist/`, SPA redirect `/* → /index.html 200` (duplicated in `public/_redirects`).
- Routing is hash-based, so deep links work regardless of redirect config.
- Security headers are set; there is no CSP.

## 12. Operational scripts

| Script | Command | Notes |
|---|---|---|
| Migrate | `cd backend && npm run migrate` | Hand-rolled runner, hardcoded file list — **new migrations must be added to the array in `run-migrations.ts`** |
| Seed | `cd backend && npm run seed` | Agents, topics, guardrails (upserts) |
| Env check | `cd backend && npx tsx check-env.ts` | Prints which env vars are set |
| DB connectivity | `cd backend && npx tsx test-db-connection.ts` | Checks connection + core tables |
| **Reset DB** | `cd backend && npx tsx src/migrations/reset-database.ts` | ☠️ **Drops a hardcoded list of 19 tables — the entire current schema plus legacy tables — with CASCADE, immediately: no confirmation, no environment guard, no dry-run.** It runs at module import and acts on whatever `DATABASE_URL` points at; individual drop failures are logged but swallowed (the run still exits 0), and the script ships compiled in `dist/`. Treat as radioactive. |

## 13. Testing

**There is effectively no automated testing.** The only test in the repository is the Lovable template's placeholder (`expect(true).toBe(true)` in `src/test/example.test.ts`); `npm test` reports a misleading green. The backend declares a `vitest` test script but has zero test files and no config. There is no CI (no GitHub Actions, no hooks) — nothing runs tests or lint before a deploy. Vitest, Testing Library, and jsdom are installed and configured on the frontend (`vitest.config.ts`, `src/test/setup.ts`), so adding tests requires no new setup.

## 14. Known issues & code health

Ranked by severity. Verified against source as of early 2026.

### Critical — security / data exposure

> **Status (Aug 2026):** issues 1, 2, 4, and 6 below were fixed in code; 5 was partially fixed (delivery is still missing); 3 requires credential rotation by the owner. The original descriptions are kept for history, each with its resolution.

1. ~~**The admin API is effectively public.**~~ **Fixed.** Previously the admin key was hardcoded in the shipped frontend bundle and printed in repo docs, with a fallback dev key, a development-mode bypass, no rate limit, and a non-timing-safe comparison. Now: `requireAdmin` fails closed (403 on every request if `ADMIN_API_KEY` is unset), compares timing-safely, admin routes are rate-limited (100/15 min), the key is no longer in the bundle (researchers enter it at `/#/admin`, verified via `GET /api/admin/verify`, held in `sessionStorage`), and the key value was redacted from the docs. ⚠️ The old key remains in git history — **set a fresh `ADMIN_API_KEY`**; the old value no longer works anywhere once the new backend deploys.
2. ~~**Admin "login" is client-side.**~~ **Fixed.** The hardcoded email/password check in `Index.tsx` and the truthy-localStorage route guard are gone; the dashboard now gates itself on a server-verified admin key.
3. **A live OpenAI key is recoverable from git history** (committed via deployment docs; the incident was "resolved" with GitHub's allow-secret URL rather than rotation — see `GIT_SECRET_FIX.md`). Locally, `docs/safe_keeping.md` (git-ignored, never committed) holds a plaintext DB connection string and API key. **Still open: rotate both credentials** (OpenAI dashboard → revoke + recreate the key; Render → reset the database password), then update the Render env vars.
4. ~~**CORS origin checks are bypassable.**~~ **Fixed.** Origins are now parsed as URLs and checked by exact match against `FRONTEND_URL` or an exact hostname-suffix test for `.netlify.app` over HTTPS — `https://x.netlify.app.evil.com` is rejected. (Requests with no `Origin` header are still allowed, as CORS only governs browsers.)
5. **Password recovery — partially fixed.** Reset tokens are now stored as SHA-256 hashes, and a reset stamps `users.password_changed_at` (migration 012), invalidating all previously issued JWTs via the auth middleware. Still open: **no email delivery exists**, so production recovery remains non-functional (the raw token is echoed only when `NODE_ENV=development`).
6. ~~**Database TLS verification is disabled.**~~ **Fixed.** Certificate verification is on by default; `DATABASE_CA_CERT` supplies a custom CA and `DATABASE_SSL_NO_VERIFY=true` is a last-resort escape hatch. If the first deploy after this change fails to connect, provide the CA or (temporarily) set the escape hatch.

### High — research validity

7. **The agent matrix is not the documented 3×3 factorial** (three (med,med) cells; (med,high) and (high,med) missing) and four agents' persona templates contradict their stored EQ/CQ levels, giving the model conflicting instructions (§2).
8. **The topic-20 survey always 500s** (CHECK-constraint violation in `unlockNextTopic`); data is saved but every participant's study ends on an error (§8.3).
9. **OpenAI failures silently pollute the data**: canned apologies (and a hardcoded "more detail" reply for empty completions) stored as genuine agent messages, still consuming an interaction, with no marker (§8.2).
10. **Non-idempotent retry**: the frontend retries `POST /api/chat/message` up to 5×; a slow OpenAI call (>30s) can duplicate message pairs and interaction counts.
11. **Progression loopholes**: no server-side current-topic enforcement; completed topics accept unlimited extra chat; `unlockNextTopic` advances the index for *any* topic's survey, not specifically the current one.
12. **Stimulus asymmetry**: only topic 1 auto-sends the stimulus message; `initial_customer_message` is seeded but unused (§8.3).
13. **Message feedback (thumbs) is never persisted** — no endpoint or column exists.
14. **The substring output filter** can replace legitimate agent replies, contaminating agent-behavior data.
15. **Silent truncation**: chat messages over 5,000 characters are truncated before storage and before the LLM sees them, with no signal to the participant (and no client-side max length).

### Medium — correctness / robustness

16. **No transactions** around multi-write operations (chat's 3 writes; the survey's 16 upserts + completion + unlock) and several read-then-write races (`findOrCreate`, `incrementInteraction`, registration email check) that can 500 or overshoot under concurrency.
17. **Session fragility**: `loadUserState` removes the token on any error, so a cold-start blip logs participants out; login doesn't load chat history (only a page reload does).
18. **GETs with write side effects**: `/api/user/state`, `/api/chat/status/:topicId`, and `/api/topics/with-status` all call `findOrCreate` (the last creates all 20 interaction rows via N+1 queries).
19. **Admin input handling**: unchecked `parseInt` on `limit`/`offset`/`topicId` (NaN → pg errors), no maximum limit, and a literacy `questionId` longer than VARCHAR(100) causes a 500.
20. **`validate()` discards Zod's parse output**, so transforms/defaults never take effect; several wrong status codes (400 where 401/404 belong).
21. **The remote migration endpoint would fail in production builds** (no `.sql` files in `dist/`).

### Documentation drift

The root-level `*_FIX.md` / `*_SUMMARY.md` files are historical logs, not current documentation — several are now wrong. Worst offenders: `LOGOUT_IMPLEMENTATION_SUMMARY.md` describes a server-side logout that does not exist (the entire token-blacklist stack is dead code); `docs/DATABASE_SCHEMA.md` is stale on at least five counts (numeric intelligence levels, missing migrations 009–011); `DISCREPANCIES_CHECK.md` calls `mockData.ts` unused when it is the live source of both survey banks and the displayed guardrails; `docs/API_DOCUMENTATION.md`'s rate limits and question-ID examples don't match the code.

### Dead code inventory

`backend/src/utils/intelligenceLevel.ts`, `BlacklistedTokenModel` + its migration + `cleanupExpiredTokens`, `src/components/auth/AgentIntroduction.tsx` (contains a NaN bug: `'medium'/10`), `guardrailApi.getGuardrails`, `chatApi.getStatus`, `surveyApi.getLiteracyStatus`, `topicApi.getById`, `mockData.ts`'s `agents`/`topics`/`mockAgentResponses`, `TopicListModal`'s topic-click handler (never wired), `SurveyModal.onClose`, `src/hooks/use-mobile.tsx`, `src/components/NavLink.tsx`, the mounted-but-unused QueryClient, and `topics.initial_customer_message`.

## 15. Maintenance guide: where to change things

| Change | Where |
|---|---|
| Add/edit a topic or policy | `backend/src/seeds/topics.seed.ts` + [Policy_Pairs_Reference_Document.md](../Policy_Pairs_Reference_Document.md). DDL CHECKs pin ids/order to 1–20 (topic 21 needs a migration); `totalTopics: 20` is hardcoded in `user.controller.ts` and `Index.tsx` |
| Change an agent persona or EQ/CQ level | `backend/src/seeds/agents.seed.ts`, then `npm run seed`; per-level guidance text in `agent.service.ts` |
| Change the system prompt structure | `AgentService.buildSystemPrompt` in `backend/src/services/agent.service.ts` |
| Change the LLM model / params | `OPENAI_MODEL` env var (or `config/openai.ts`); temperature/max_tokens in `openai.service.ts` |
| Change the 10-interaction cap | Three places: `UserTopicInteraction.ts` (`>= 10`), `chat.controller.ts` (`maxInteractions`), `Index.tsx` (`MAX_INTERACTIONS`) — plus a `/10` literal in `TopicList.tsx` |
| Edit survey questions | `src/data/mockData.ts` (both banks); the backend stores IDs only, but the Zod schema in `survey.controller.ts` pins the post-topic count to exactly 16 |
| Edit guardrails | **Two disconnected places**: `backend/src/seeds/guardrails.seed.ts` (what the model obeys) and `mockData.ts`'s `globalGuardrails` (what participants see) |
| Auth / JWT behavior | `backend/src/middleware/auth.middleware.ts`, `auth.controller.ts`, token helpers in `src/lib/api.ts` |
| Chat pipeline | `chat.routes.ts` → `chat.controller.ts:sendMessage` → `openai.service.ts` |
| Progression logic | `UserTopicInteraction.ts` (`incrementInteraction`, `unlockNextTopic`), `topic.controller.ts`, and the `Index.tsx` state machine |
| Admin / export | `admin.controller.ts` (`requireAdmin` at the top), `AdminDashboard.tsx`, `adminApi` in `src/lib/api.ts` |
| Schema changes | New `.sql` file in `backend/src/migrations/` **plus** an entry in `run-migrations.ts`'s hardcoded array (forgetting this is how the blacklist table was lost); then run `npm run migrate` manually on Render |
| Deployment config | `backend/package.json` scripts, `render.yaml`, `netlify.toml`, `VITE_API_URL` in Netlify site settings |
| Participant UI flow | `src/pages/Index.tsx` (everything routes through it); presentational components in `src/components/{chat,auth,survey,layout}/` |
