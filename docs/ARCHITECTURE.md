# Architecture & Engineering Guide (Study 2, v2)

Technical reference for the research chat platform in its **Study 2 / v2** form: system architecture,
data model, key flows, the agent prompt system, configuration, deployment, operations, testing, known
issues and a maintenance guide.

> **Audience:** engineers and researchers maintaining or extending the platform.
> **Companion documents:** [`STUDY2_API.md`](./STUDY2_API.md) (the authoritative API contract),
> [`STUDY2_PLAN.md`](./STUDY2_PLAN.md) (the decisions behind v2, section 0), [`API.md`](./API.md)
> (endpoint summary), [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md) (researcher dashboard and exports),
> [`../PRD.md`](../PRD.md) and [`../Policy_Pairs_Reference_Document.md`](../Policy_Pairs_Reference_Document.md)
> (research documents). Where a document and the code disagree, **the code wins**; this guide
> describes the code on branch `study2/single-session` as of 2026-09-07.

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
16. [Study 1 (v1) history](#16-study-1-v1-history)

---

## 1. Overview

This is a **behavioral research platform** studying how a customer-service AI agent's
**Emotional Intelligence (EI) x Cognitive Intelligence (CI)** profile affects how people perceive a
service conversation across three service **contexts**: a utilitarian food-delivery failure, a hedonic
food-delivery failure, and an informational hotel-booking inquiry (no failure).

A participant arrives from a Qualtrics survey, presses **Begin**, and is silently assigned one of
**4 agent conditions x 3 contexts** (12 cells). The context's scenario is shown and auto-sent as the
participant's first message; the agent replies; the participant continues for a total of **10
interactions** (1 interaction = 1 participant message + 1 agent reply). The chat then locks, a
**16-item post-chat questionnaire** follows, and the participant receives a **unique 5-digit
completion code** to type back into Qualtrics. There are no accounts, no login and no personal data.

- **Frontend:** React SPA (Vite + TypeScript + shadcn/ui, hash routing) deployed on Netlify.
- **Backend:** Node.js + Express + PostgreSQL + OpenAI Chat Completions, deployed on Render.
- **Lineage:** the v1 platform (login-based, 20 topics, 9 agents) ran January-August 2026 and was
  rewritten into v2 in September 2026. See [section 16](#16-study-1-v1-history).

## 2. Research design

**Protocol per participant (one anonymous session):**

1. **Landing** (from the Qualtrics link, optionally carrying `?rid=<ResponseID>`) -> **Begin**.
2. **Assignment**: one of 12 cells, fixed for the session; the participant never learns which.
3. **Chat**: the scenario is auto-sent as interaction 1; 10 interactions total; then the session locks.
4. **Post-chat survey**: 16 Likert items (`post-1` ... `post-16`, 1-7), submitted once.
5. **Completion code**: unique integer in 10000-99999, shown on screen and re-shown on any revisit.

**The 4 agent conditions** (`backend/src/seeds/agent_conditions.seed.ts`; table `agent_conditions`):

| id | code | EI | CI |
|---|---|---|---|
| 1 | `hiEI_hiCI` | high | high |
| 2 | `hiEI_loCI` | high | low |
| 3 | `loEI_hiCI` | low | high |
| 4 | `loEI_loCI` | low | low |

All four share **one neutral display name** (`Alex`) and **one context-agnostic base persona**
(`SHARED_SYSTEM_PROMPT_TEMPLATE`, which deliberately contains no EI/CI wording). The manipulation lives
**only** in the EI and CI guidance blocks that the prompt builder appends (section 9). A unit test
guards this.

**The 3 contexts** (`backend/src/seeds/contexts.seed.ts`; table `contexts`):

| id | code | title | domain | type | content status |
|---|---|---|---|---|---|
| 1 | `food_utilitarian` | Missing Food Item | Food Delivery | utilitarian | verbatim copy of v1 topic 1 |
| 2 | `food_hedonic` | Messy Food Presentation | Food Delivery | hedonic | verbatim copy of v1 topic 2 |
| 3 | `hotel_informational` | Hotel Booking Inquiry | Hotel Booking | informational | **fabricated placeholder** ("Harborview Grand Hotel" policy document + booking record); to be replaced with the team's material |

Each context has a `participant_scenario` (second person; shown in the scenario panel **and**
auto-sent as the participant's first message) and a hidden `agent_policy` (reference material injected
into the agent's prompt, never sent to the participant). Verbatim fidelity of contexts 1-2 and of the 16
survey items to the v1 baseline is asserted by SHA-256 hashes in `backend/tests/unit.test.ts`.

**Assignment** (`ASSIGNMENT_MODE`): `random` (default) draws uniformly over the 12 cells;
`balanced` draws uniformly among the cells with the fewest *started* sessions, serialised with a
Postgres advisory lock so concurrent arrivals cannot pile into one cell.

**Survey items** are frozen in two places that must agree: the database table `survey_questions`
(text, category, position, `version = '1.0'`) and the frontend bank `src/data/surveyQuestions.ts`.
The database stores `(question_id, response_value)` per session; the item text is in the DB, so exports
can be joined without the frontend source.

**Reproducibility stamps:** every session records the `model` name it was created under (the
configured `OPENAI_MODEL`, or `mock`) and `prompt_version` (`2.0`, a constant in `config/study.ts`).

## 3. System architecture

```
+----------------------------- Browser -------------------------------+
|  React SPA (Vite + TS + shadcn/ui, HashRouter)                      |
|   /            -> src/pages/Study.tsx   (participant flow)          |
|   /#/admin     -> src/pages/AdminDashboard.tsx (researcher)         |
|   src/lib/api.ts -- all HTTP; session id in                         |
|     localStorage['study_session_id'];                               |
|     admin key in sessionStorage['admin_api_key'];                   |
|     retry x5 with backoff for cold starts; /health pre-check        |
+-------------+-------------------------------------------------------+
              | HTTPS JSON  {success, data | error:{message,code}}
              | Authorization: Bearer <sessionId>   (participant routes)
              | x-admin-api-key: <key>              (admin routes)
              v
+----------- Render web service "persona-glimmer-backend" ------------+
|  Express (backend/src/app.ts), root dir backend/                    |
|   helmet -> CORS -> express.json(100kb) -> [create/admin limiter]   |
|   -> requireSession | requireAdmin -> [message limiter: per         |
|      session, runs after requireSession] -> validate (Zod)          |
|   -> controller -> errorHandler                                     |
|  Routes: /health, /api/sessions/*, /api/admin/*  (everything else   |
|          is 404, incl. all v1 endpoints; /api/admin/* paths answer  |
|          401/403 first unless a valid admin key is sent)            |
|  services/assignment.service.ts -- random | balanced cell choice    |
|  services/agent.service.ts      -- system-prompt assembly           |
|  services/openai.service.ts     -- chat completion (or mock)        |
+------+---------------------------------------+----------------------+
       | pg Pool (max 20), withTransaction()   | OpenAI SDK, 30 s timeout,
       v                                       v 0 SDK retries
+ Render PostgreSQL ------+          + OpenAI Chat Completions --------+
| 8 tables incl.          |          | OPENAI_MODEL (gpt-4o-mini),    |
| schema_migrations       |          | temp 0.7, max_tokens 500       |
+-------------------------+          +--------------------------------+

Frontend deploy: Netlify (netlify.toml -- publish dist/, SPA redirect;
  VITE_API_URL baked in at build time, pointing at the Render URL)
```

## 4. Repository layout

```
/                          Frontend (Vite React app) + project docs
|-- src/
|   |-- pages/             Study.tsx (participant state machine), AdminDashboard.tsx, NotFound.tsx
|   |-- components/
|   |   |-- chat/          ChatHeader, ChatWindow, MessageBubble, MessageInput, TypingIndicator
|   |   |-- layout/        ScenarioPanel
|   |   |-- survey/        SurveyScreen, LikertScale
|   |   `-- ui/            shadcn/ui primitives (generated)
|   |-- lib/api.ts         All HTTP calls, storage helpers, error mapping
|   |-- lib/entryParams.ts Reads ?rid= and ?force= from the URL (search or hash query)
|   |-- utils/retry.ts     Retry-with-backoff wrapper used by api.ts
|   |-- data/surveyQuestions.ts  The 16 post-chat items (mirror of the DB table)
|   |-- types/index.ts     Shared frontend types (mirror of STUDY2_API.md)
|   `-- test/              Vitest + Testing Library specs (study, admin, api, entryParams)
|-- backend/
|   |-- src/
|   |   |-- app.ts              Express app (exported; does not listen)
|   |   |-- server.ts           Listens, dev-only OpenAI key check, graceful shutdown
|   |   |-- config/             study.ts (constants + env switches), database.ts (pool,
|   |   |                       withTransaction), openai.ts (lazy client, 30 s / 0 retries)
|   |   |-- middleware/         session (Bearer session id), validation (Zod), error handler
|   |   |-- routes/ + controllers/   session.*, admin.*
|   |   |-- services/           assignment, agent (prompt assembly), openai
|   |   |-- models/             AgentCondition, Context, Session, SessionMessage,
|   |   |                       SessionSurveyResponse, SurveyQuestion, GlobalGuardrail, db.ts
|   |   |-- migrations/         001-008 *.sql, run-migrations.ts (tracked), reset-database.ts (guarded)
|   |   |-- seeds/              agent_conditions, contexts, survey_questions, guardrails, run-seeds.ts
|   |   `-- utils/              errors.ts, sanitize.ts, completionCode.ts
|   |-- tests/                  Vitest + supertest integration/unit tests (local Postgres)
|   |-- env.example, README.md, check-env.ts, test-db-connection.ts
|-- docs/                  This file, STUDY2_API.md, STUDY2_PLAN.md, API.md, ADMIN_GUIDE.md,
|                          archive/study1/ (retired v1 notes)
|-- PRD.md, Policy_Pairs_Reference_Document.md   Research documents (root)
|-- netlify.toml           Frontend deploy config
`-- render.yaml            Backend deploy config (Blueprint)
```

## 5. Frontend architecture

**Routing** (`src/App.tsx`): `HashRouter` with three routes -- `/` (participant flow), `/admin`
(researcher dashboard, `/#/admin` in the URL) and a catch-all `NotFound`. An effect redirects a
plain-path `/admin` visit to `/#/admin`. Hash routing survives static hosting regardless of redirect
rules. State is plain `useState`/`useEffect`; there is no react-query.

**`src/pages/Study.tsx`** owns the participant state machine. Its `view` is one of
`loading | landing | chat | survey | completion | error`:

```
bootstrap: localStorage has study_session_id?
  no  -> landing --Begin--> POST /api/sessions -> chat
  yes -> GET /api/sessions/me
           surveyCompleted -> completion (code re-shown)
           isLocked        -> survey
           otherwise       -> chat (transcript restored)
           401 SESSION_INVALID -> forget id, landing (toast)
           other error         -> error view with "Try again"
chat: messages.length === 0 -> auto-send openingMessage once (clientMessageId "opening")
      ... 10 interactions -> isLocked -> "Continue to the questionnaire" -> survey
survey: 16 items, submit disabled until all answered -> POST /me/survey -> completion
```

Key behaviours:

- **Entry parameters** (`src/lib/entryParams.ts`): `rid` becomes `externalId` (trimmed to 100 chars);
  `force=<agent>,<context>` becomes `force` (validated to 1-4 / 1-3, otherwise ignored). Both are read
  from the regular query string and from the query inside the hash (`/#/?rid=X`), hash winning.
  `force` is only *honoured* by the backend when `ALLOW_FORCED_ASSIGNMENT=true`.
- **Opening auto-send**: when the chat view has a session with no messages and the session is not
  locked, the frontend sends `openingMessage` (== `context.participantScenario`) with the fixed
  `clientMessageId: "opening"`, guarded by a ref so StrictMode/re-renders cannot fire it twice. The
  input is disabled with "Please wait for the conversation to start..." until the reply arrives.
- **Sending**: each new message gets `crypto.randomUUID()` as `clientMessageId`. On success the two
  returned messages are merged by id and the counter/lock state updated. Error handling:
  `SESSION_INVALID` -> back to landing; `SESSION_LOCKED` / `SESSION_COMPLETED` -> re-sync from
  `GET /me` (local state was stale); anything else (`AGENT_UNAVAILABLE`, timeout, network) -> the
  draft **and the same `clientMessageId`** are kept and an inline "Try again" appears. A retry, even
  after editing the draft, reuses that id, so the server can never store the message twice.
- **Survey**: `SurveyScreen` is full-screen and not dismissible; responses are emitted in instrument
  order (`post-1` ... `post-16`). `SESSION_NOT_LOCKED` / `SESSION_COMPLETED` on submit re-sync from
  the server.
- **Completion**: the code is rendered large with a copy button, the instruction to enter it in
  Qualtrics, and a note that reopening the page shows the same code. If the code is somehow missing,
  a "Reload code" button calls `GET /me`.
- **Blinding**: the only agent attribute ever rendered is `agent.displayName`; the UI never receives
  EI/CI levels, condition codes or the agent policy (`ScenarioPanel` shows exactly `context.title` and
  `context.participantScenario`). `ChatHeader` shows `interactionCount / maxInteractions` taken from
  the API, never a hardcoded 10.

**API layer** (`src/lib/api.ts`):

- Base URL from `VITE_API_URL` (default `http://localhost:3000`).
- Credentials: the session id lives in `localStorage['study_session_id']` and is sent as
  `Authorization: Bearer <sessionId>`; the admin key lives in `sessionStorage['admin_api_key']` and
  is sent as `x-admin-api-key`. Storage access is wrapped in try/catch (private mode).
- `apiRequest()` wraps `fetch` in `retry()` (`src/utils/retry.ts`): up to 5 retries with exponential
  backoff from 2 s, 30 s per attempt. Retried: bare `502/503/504` without an API envelope (Render cold
  start), network errors, and per-attempt timeouts. **Not** retried: any response carrying an API
  envelope -- in particular a `502 AGENT_UNAVAILABLE` is surfaced immediately for a manual retry.
  `sendMessage` uses a 45 s attempt (server-side model timeout 30 s plus margin) and does **not**
  auto-retry a timeout, because the idempotent `clientMessageId` makes the participant's manual
  "Try again" the safer path.
- `coldStartWait` (session create/resume, admin verify/dashboard) pings `/health` and waits up to 30 s
  for the backend to wake before the real request.
- `401` on a participant call clears the stored session id and becomes `SESSION_INVALID`; `401` on an
  admin call clears the stored key and becomes `ADMIN_UNAUTHORIZED`; `429` becomes `RATE_LIMITED`
  quoting `Retry-After`. Backend error codes are otherwise passed through verbatim.
- `adminApi.exportCsv()` fetches the streamed CSV as a blob (the key travels in a header, so a plain
  link cannot be used) and saves it via an object URL, taking the filename from `Content-Disposition`.

**`src/pages/AdminDashboard.tsx`** gates itself behind the key form (`GET /api/admin/verify`), then
renders four tabs (Dashboard with totals and the 4 x 3 cell grid, Sessions with a detail modal,
Messages, Surveys), each paged at 100 rows with server-side filters, and three export buttons. Cell
codes come from the dashboard payload, so nothing about the conditions is hardcoded except the id
ranges 1-4 and 1-3 used to lay out the grid. See [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md).

## 6. Backend architecture

**Bootstrap** (`backend/src/app.ts`): loads `.env`, checks that `DATABASE_URL`, `ADMIN_API_KEY` and
(unless `MOCK_OPENAI=true`) `OPENAI_API_KEY` are present -- exits with a list of the missing names
otherwise -- sets `trust proxy 1` (Render), applies `helmet`, CORS and `express.json({ limit: '100kb' })`,
mounts `/health`, `/api/sessions`, `/api/admin`, a JSON `404 NOT_FOUND` catch-all, and the error handler
last. `app.ts` exports the app; `server.ts` listens (`PORT`, default 3000), logs the assignment mode and
mock status, validates the OpenAI key in development only (non-blocking), and shuts down gracefully on
`SIGTERM`/`SIGINT` (close server, drain pool, hard exit after 10 s).

**Middleware pipeline** (per request):

```
POST /api/sessions   : helmet -> CORS -> express.json -> createSessionLimiter (per IP)
                       -> validate (Zod on {body, query, params}) -> controller -> errorHandler
/api/sessions/me/*   : helmet -> CORS -> express.json -> requireSession
                       -> messageLimiter (per session; POST /me/messages only)
                       -> validate -> controller -> errorHandler
/api/admin/*         : helmet -> CORS -> express.json -> adminRateLimiter (per IP)
                       -> requireAdmin -> controller -> errorHandler
```

The two per-IP limiters run **before** authentication (so rejected admin keys count); the per-session
message limiter needs `req.session.id` and therefore runs **after** `requireSession` -- a request with a
missing or unknown bearer gets `401` and never counts against it.

- **CORS**: requests without an `Origin` header are allowed (non-browser clients). Otherwise the origin
  is parsed as a URL and allowed if: not in production and the hostname is `localhost`/`127.0.0.1`
  (any port); or it equals `FRONTEND_URL` exactly (trailing slashes stripped); or it is `https:` and the
  **hostname ends with `.netlify.app`** (a real suffix test -- `x.netlify.app.evil.com` is rejected).
  Allowed headers: `Content-Type`, `Authorization`, `x-admin-api-key`.
- **Rate limits** (`express-rate-limit`, all skipped when `DISABLE_RATE_LIMITS=true`, all answering
  `429 RATE_LIMITED`):
  - `POST /api/sessions`: `SESSION_CREATE_LIMIT_PER_HOUR` per IP per hour (default **60**). The limit is
    read on every request so it can be raised without a code change when many participants share one
    public IP (labs, campus NAT).
  - `POST /api/sessions/me/messages`: `MESSAGE_LIMIT_PER_MINUTE` per **session** per minute (default
    **30**; keyed by `session:<id>`, applied after `requireSession`). Replays count.
  - `/api/admin/*`: 100 per IP per 15 minutes, applied before the key check so rejected keys count.
- **`requireSession`** (`middleware/session.middleware.ts`): `Authorization: Bearer <uuid>`; missing,
  malformed or unknown -> `401 SESSION_INVALID`; otherwise the full session row is attached as
  `req.session`.
- **`requireAdmin`** (`controllers/admin.controller.ts`): `403 ADMIN_NOT_CONFIGURED` if `ADMIN_API_KEY`
  is unset (fails closed, no fallback, no dev bypass); `401 ADMIN_UNAUTHORIZED` unless the header equals
  the key (SHA-256 of both, then `timingSafeEqual`). The key is read at request time.
- **`validate`** (`middleware/validation.middleware.ts`): Zod shape check, `ZodError` -> `400
  VALIDATION_ERROR`. The parse result is discarded; controllers re-read `req.body` and do the semantic
  checks and sanitisation themselves.
- **Errors** (`middleware/error.middleware.ts`, `utils/errors.ts`): `AppError` subclasses map to
  `400 ValidationError`, `401 AuthenticationError`/`SessionInvalidError`, `404 NotFoundError`,
  `409 ConflictError` (codes `SESSION_LOCKED`, `SESSION_COMPLETED`, `SESSION_NOT_LOCKED`) and
  `502 AgentUnavailableError`. Malformed JSON bodies become `400`, bodies over the 100 kB limit `413 PAYLOAD_TOO_LARGE`. Anything else is `500 INTERNAL_ERROR`
  with the message exposed only in development. If headers were already sent (a CSV stream), the
  response is destroyed instead.

**Route map:**

| Mount | Routes | Auth |
|---|---|---|
| `/health` | liveness probe | none |
| `/api/sessions` | `POST /` (create), `GET /me` (resume), `POST /me/messages`, `POST /me/survey` | none for create; session bearer for `/me/*` |
| `/api/admin` | `GET /verify`, `/dashboard`, `/sessions`, `/sessions/:id`, `/messages`, `/surveys`, `/export?type=` | `x-admin-api-key`; read-only |

Everything else, including every v1 endpoint (`/api/auth`, `/api/user`, `/api/topics`, `/api/chat`,
`/api/surveys`, `/api/guardrails`, `/api/admin/users`, the migration/seed endpoints), returns `404`
(paths under `/api/admin/` return `401`/`403` first unless a valid admin key is sent, because
`adminRateLimiter` and `requireAdmin` are router-level middleware that run before path matching).

**Models** (`backend/src/models/`) are plain classes issuing parameterised SQL through either the shared
`pg` Pool or a checked-out client (`Queryable`, `models/db.ts`), so the same method can run inside a
transaction. `config/database.ts` provides `withTransaction(fn)` (BEGIN / COMMIT / ROLLBACK on throw)
and `closePool()`. No ORM.

**Input sanitisation** (`utils/sanitize.ts`) runs in controllers after Zod: `sanitizeString` (null
bytes, C0 control characters **except TAB/LF/CR**, and DEL `0x7F` removed -- so newlines in participant
text survive into the database and CSV -- then trimmed and cut at 10,000 chars) for `externalId`, which
is then cut at 100; `sanitizeMessageContent` (same, cut at 5,000) for message text. Because Zod already rejects
content over 5,000 characters, the message cut is a no-op in practice. There is no LLM-side content
moderation on input; the prompt-level guardrails are the only content control.

## 7. Data model

PostgreSQL, provisioned by plain-SQL files `backend/src/migrations/NNN_*.sql` and a **tracked,
transactional runner** (`run-migrations.ts`, `npm run migrate`): it creates
`schema_migrations(filename PK, applied_at)` if missing, then applies every `\d{3}_*.sql` in filename
order that is not yet recorded. Each file is executed as **one multi-statement query inside one
transaction** together with its `schema_migrations` row, so a failure leaves nothing half-applied.
Re-running applies nothing. Adding a migration means adding a file -- there is no list to maintain.

| Table | PK | Key columns / constraints |
|---|---|---|
| `agent_conditions` (001) | INT CHECK 1-4 | `code` UNIQUE (`hiEI_hiCI` ...); `emotional_intelligence`, `cognitive_intelligence` CHECK IN ('low','high'), UNIQUE together; `display_name`; `system_prompt_template` |
| `contexts` (002) | INT CHECK 1-3 | `code` UNIQUE; `title`, `domain`; `scenario_type` CHECK IN ('utilitarian','hedonic','informational'); `participant_scenario`; `agent_policy` |
| `sessions` (003) | UUID `gen_random_uuid()` | `agent_condition_id` FK, `context_id` FK; `external_id` VARCHAR(100) nullable (indexed); `interaction_count` CHECK 0-10; `is_locked`; `survey_completed`; `completion_code` INT UNIQUE CHECK 10000-99999; `model`, `prompt_version`; `created_at` (indexed), `locked_at`, `completed_at`, `updated_at`; index on `(agent_condition_id, context_id)` |
| `session_messages` (004) | UUID | `session_id` FK CASCADE; `sequence` >= 1, UNIQUE per session; `role` CHECK ('user','agent'); `content`; `is_fallback` (always false in v2); `client_message_id` VARCHAR(64) UNIQUE per session (set on user messages only -- the idempotency key) |
| `session_survey_responses` (005) | UUID | `session_id` FK CASCADE; `question_id`; `response_value` CHECK 1-7; UNIQUE(session_id, question_id) |
| `survey_questions` (006) | `question_id` | `text`, `category`, `position` UNIQUE, `version` |
| `global_guardrails` (007) | INT CHECK (id = 1) | singleton: `title`, `content` |
| `schema_migrations` | `filename` | written by the runner |

Migration 008 adds `updated_at` triggers to `agent_conditions`, `contexts`, `sessions` and
`global_guardrails`.

**Conventions:**

- `sequence` is 1-based over **all** messages of a session: 1 = the participant's auto-sent scenario,
  2 = the first agent reply, ..., 20 = the tenth reply. The participant message of interaction *n* is
  `2n - 1`, the reply `2n`. A replayed request derives its historical `interactionCount` as
  `agentSequence / 2`.
- `is_locked` becomes true exactly when `interaction_count` reaches 10 (`locked_at` set once);
  `survey_completed` and `completed_at` are set by the survey submission; `completion_code` exists
  only for completed sessions.
- **No table stores names, emails, IP addresses or user agents.** The only participant-supplied
  identifier is the optional `external_id` (Qualtrics ResponseID from `?rid=`).
- Session status in the admin API is derived: `in_progress` = not locked; `locked` = locked and survey
  not completed; `completed` = survey completed.

**Seeds** (`npm run seed`, `seeds/run-seeds.ts`) are idempotent upserts, in order: the 4 agent
conditions, the 3 contexts (the runner prints the hotel placeholder note), the 16 survey questions
(`version '1.0'`, positions 1-16), the guardrails singleton (8 context-neutral rules). Re-run after
editing any seed file.

## 8. Key flows

### 8.1 Session lifecycle

```
POST /api/sessions        -> row created, interaction_count 0          (state: in_progress)
POST /me/messages x10     -> sequences 1..20, count 10, is_locked      (state: locked)
POST /me/survey           -> 16 rows, survey_completed, unique code    (state: completed)
GET  /me at any time      -> the same state; the frontend resumes from it
```

**Create** (`session.controller.ts:createSession`): body `{ externalId?, force? }` (Zod: `externalId`
<= 100 chars; `force.agentConditionId` 1-4, `force.contextId` 1-3). `AssignmentService.createAssignedSession`
picks the cell (section 2; `force` honoured only when `ALLOW_FORCED_ASSIGNMENT=true`, otherwise
silently ignored, though a malformed `force` is still a `400`) and inserts the row stamped with
`model = OpenAIService.getModelName()` and `prompt_version = '2.0'`. Response `201` with the public
state: `sessionId`, `agent: { displayName }`, `context: { id, code, title, scenarioType,
participantScenario }`, `openingMessage`, `maxInteractions: 10`, counters, `completionCode: null`,
`messages: []`. Nothing about the condition leaks (an integration test asserts the absence of
`emotional`, `cognitive`, `hiEI`, `agentPolicy`, ... in the JSON).

**Resume** (`GET /me`): the same shape with `messages` ordered by `sequence`.

### 8.2 Sending a message (the core loop)

`session.controller.ts:sendMessage`, body `{ clientMessageId (1-64 chars), content (1-5000 after trim) }`:

1. **Replay check** (no lock yet): if a user message with this `(session_id, client_message_id)`
   exists, rebuild the original result from it and the agent message at `sequence + 1` and return
   `200` -- **no writes**, no model call. Even a different `content` with the same id is treated as the
   same message. `shouldShowSurvey` is recomputed from the *current* `survey_completed`, so a replay
   after the survey does not resurrect the survey prompt.
2. **Fail fast on state**: `survey_completed` -> `409 SESSION_COMPLETED`; `is_locked` or count >= 10
   -> `409 SESSION_LOCKED`.
3. **Generate the reply outside any database lock**: load the condition, context, guardrails and the
   full transcript in parallel; build the system prompt (section 9) and the message list (system,
   whole transcript with `agent` -> `assistant`, new user message); call `OpenAIService.generateReply`.
   Any failure -- network, API error, 30 s timeout, empty completion -- becomes
   `502 AGENT_UNAVAILABLE` and **nothing is persisted**. The frontend keeps the draft and retries with
   the same `clientMessageId`.
4. **Persist in one transaction under a row lock** (`withTransaction`): `SELECT ... FROM sessions
   WHERE id = $1 FOR UPDATE`; re-run the replay check under the lock (a concurrent retry with the same
   id may have won); re-assert the state (a concurrent send with a *different* id may have filled the
   last slot -- then this request gets `409` and its generated reply is discarded); insert the user
   message at `sequence = interaction_count * 2 + 1` with the `client_message_id`; insert the agent
   reply at `sequence + 1`; `UPDATE sessions SET interaction_count = interaction_count + 1, is_locked =
   (interaction_count + 1 >= 10), locked_at = ...`. Commit.
5. Respond `{ userMessage, agentMessage, interactionCount, isLocked, shouldShowSurvey }` where
   `shouldShowSurvey = isLocked && !surveyCompleted`.

Because the counter increment and both inserts happen under `FOR UPDATE`, five concurrent sends at
count 8 yield exactly two `200`s (interactions 9 and 10) and three `409 SESSION_LOCKED`s; the
database ends at 10 interactions and 20 messages (`tests/sessions.test.ts`). The `UNIQUE
(session_id, client_message_id)` constraint is the backstop for idempotency.

### 8.3 Survey and completion code

`session.controller.ts:submitSurvey`, body `{ responses: [{ questionId, value }] }`. Zod checks the
shape; `validateSurveyAnswers` then requires **exactly 16** answers, ids exactly `post-1` ... `post-16`
with no duplicates, and integer values 1-7 (`400 VALIDATION_ERROR` otherwise). Then, in one transaction
with the session row locked `FOR UPDATE`:

- already `survey_completed` -> return `{ completionCode, alreadyCompleted: true }` and **write
  nothing** (values from the first submission stand);
- not `is_locked` -> `409 SESSION_NOT_LOCKED`;
- otherwise upsert the 16 rows (`ON CONFLICT (session_id, question_id) DO UPDATE`), set
  `survey_completed = TRUE`, `completed_at = COALESCE(completed_at, NOW())`, and assign a **unique
  completion code**: `utils/completionCode.ts` draws `randomInt(10000, 99999 + 1)` (a uniform integer in
  `[10000, 99999]`; Node's upper bound is exclusive) and runs
  `UPDATE sessions SET completion_code = $1` under a `SAVEPOINT`; a unique violation (`23505`) rolls
  back to the savepoint and tries again, up to 20 attempts.

Response `{ completionCode, alreadyCompleted: false }`. After completion, new messages are refused
with `409 SESSION_COMPLETED`; replays of earlier ids still return `200`.

### 8.4 Assignment

`services/assignment.service.ts`. `SessionModel.countStartedPerCell` returns all 12 cells
(`agent_conditions CROSS JOIN contexts LEFT JOIN sessions`) with their started counts, including
zeros; it throws if nothing is seeded. **Random** picks a cell uniformly (`crypto.randomInt`).
**Balanced** runs inside a transaction that first takes `pg_advisory_xact_lock(7120002)`, so concurrent
creations see fresh counts and 12 simultaneous arrivals land in 12 distinct cells
(`tests/assignment.test.ts`). **Forced** (`ALLOW_FORCED_ASSIGNMENT=true` only) verifies the cell
exists and inserts directly. The admin dashboard reports the active mode.

### 8.5 Admin and research data

- **Dashboard** (`GET /api/admin/dashboard`): totals (`sessions`, `completed`, `locked`, `inProgress`,
  `messages`, `surveyResponses`), the 12 cells with `started` / `completed`, and `assignmentMode`.
- **Lists** (`/sessions`, `/messages`, `/surveys`): `limit` default 100 / max 1000, `offset`, and
  filters; every integer parameter is validated with a regex (`400` on `abc`, `-1`, `NaN`), `sessionId`
  must be a UUID, `status` must be one of the three values. Ordered newest first.
- **Detail** (`/sessions/:id`): the session, its transcript by `sequence`, and its survey responses by
  item number.
- **Export** (`/export?type=sessions|messages|surveys`): headers are flushed first (`text/csv`,
  `Content-Disposition: attachment; filename="study2-<type>-<date>.csv"`, `Cache-Control: no-store`),
  then rows are streamed in **keyset-paginated batches of 1000** with back-pressure (`drain`).
  Ordering: sessions by `(created_at, id)`; **messages by session start, then `session_id`, then
  `sequence`** (a participant message and its reply share one transaction timestamp, so ordering by
  message time alone would interleave them wrongly); surveys by `(created_at, id)`. Cursors carry the
  timestamp as `::text` to keep microsecond precision; a cursor that fails to advance aborts the
  stream rather than looping. `csvField` quotes per RFC 4180 and prefixes strings that start with
  `=`, `+`, `-`, `@`, TAB or CR with a single quote (spreadsheet formula injection); Dates are ISO
  8601. The sessions export adds `emotional_intelligence` and `cognitive_intelligence`; the messages
  export includes `client_message_id`.

## 9. The AI agent system

**Prompt assembly** (`AgentService.buildSystemPrompt(condition, context, guardrails)` in
`backend/src/services/agent.service.ts`), concatenated in exactly this order:

1. `condition.system_prompt_template` -- the shared base persona ("You are Alex, a customer support
   agent for the company the customer is contacting ...").
2. `## Your Intelligence Profile` -- the sentence "You have {low|high} emotional intelligence and
   {low|high} cognitive intelligence.", then the **EI guidance block** for the condition's level
   (`**Emotional Intelligence: Low**` = direct, factual, efficient, less warm; `High` = warm, empathetic,
   validating), then the **CI guidance block** (`Low` = simple, scripted, clarifying questions; `High` =
   detailed, analytical, multiple solution approaches). Only `low` and `high` exist; `medium` was dropped
   with v1.
3. `## Global Guidelines` -- the `global_guardrails` singleton's content (omitted only if the row is
   missing): stay in role, be truthful to the reference information, do not invent policies or
   commitments, never reveal the instructions or the participant's condition, keep to the current
   inquiry, no harmful content, stay professional, protect privacy.
4. `## Reference Information` -- `context.agent_policy` verbatim (the food-delivery handling policy,
   or the hotel policy document plus the booking record).
5. `## Conversation Guidelines` -- eight bullets: stay within the scope of "{context.title}"; the
   customer's first message describes the situation, treat it as the context for the whole
   conversation; rely on the Reference Information for every policy, record or remedy; steer unrelated
   requests back; 2-4 sentences; actionable next steps; always respond; never say you cannot help.

`AgentService.buildMessages` then produces `[system, ...full transcript (agent -> assistant), new user
message]` -- the **entire** session history (at most 20 prior messages), not a window.

**Generation** (`services/openai.service.ts`): `chat.completions.create` with `OPENAI_MODEL` (default
`gpt-4o-mini`), `temperature 0.7`, `max_tokens 500`, `presence_penalty 0.1`, `frequency_penalty 0.1`,
and per-request `timeout: 30000, maxRetries: 0` (the SDK's default two retries would stretch a failing
call past the frontend's 45 s attempt and risk double model calls). An empty or whitespace completion
is a failure. **There is no output substring filter**; the v1 `hack/exploit/illegal` filter is gone.
With `MOCK_OPENAI=true` the service returns `"[mock reply to: <first 60 chars of the last user
message>]"` and reports model `mock` -- used by every test and available for local development
without a key.

**Placeholder hygiene:** the hotel context is marked as a placeholder **only in code** (comments and
the `HOTEL_CONTEXT_PLACEHOLDER_NOTE` constant that `npm run seed` logs). Neither `participant_scenario`
nor `agent_policy` may contain words like "placeholder", "fabricated" or "fictional", because
`agent_policy` is pasted into the prompt and a model told its material is fake can say so to
participants. A unit test enforces this for all four conditions.

## 10. Configuration

**Backend** (`backend/.env`, template `backend/env.example`; all read from `process.env`, switches at
call time so tests can toggle them):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes (startup exit) | pg connection string. SSL is required when the URL contains `render.com` or `NODE_ENV=production`, with certificate verification **on**; `DATABASE_CA_CERT` (PEM) supplies a custom CA and `DATABASE_SSL_NO_VERIFY=true` is a last-resort escape hatch. Pool: max 20, 10 s connect timeout |
| `ADMIN_API_KEY` | yes (startup exit) | Admin API disabled (403) if unset at request time; researchers enter this value at `/#/admin` |
| `OPENAI_API_KEY` | yes unless `MOCK_OPENAI=true` | Lazy client; warned if it does not start with `sk-` |
| `OPENAI_MODEL` | no | default `gpt-4o-mini`; stamped on each session |
| `MOCK_OPENAI` | no (`false`) | deterministic replies, no network; tests force `true` |
| `ASSIGNMENT_MODE` | no (`random`) | `random` or `balanced` |
| `ALLOW_FORCED_ASSIGNMENT` | no (`false`) | honour `force` on session creation -- dev/test/pilot only |
| `SESSION_CREATE_LIMIT_PER_HOUR` | no (`60`) | per-IP cap on `POST /api/sessions`; raise for shared-IP settings |
| `MESSAGE_LIMIT_PER_MINUTE` | no (`30`) | per-session cap on messages |
| `DISABLE_RATE_LIMITS` | no (`false`) | tests only |
| `FRONTEND_URL` | no | exact-match CORS origin, no trailing slash (`http://localhost:8080` locally) |
| `PORT` | no (`3000`) | |
| `NODE_ENV` | no | `production` enables SSL + hides error detail; `development` logs queries and validates the OpenAI key at startup; `test` is set by the test harness |

`JWT_SECRET` is **no longer used**. Constants that are not configurable live in
`backend/src/config/study.ts`: `MAX_INTERACTIONS = 10`, `PROMPT_VERSION = '2.0'`, the 16 question ids,
the 1-7 range, the 10000-99999 code range and 20 collision attempts, the default model. The frontend
never hardcodes these; it reads `maxInteractions` from API responses.

**Frontend:** one build-time variable, `VITE_API_URL` (default `http://localhost:3000`). On Netlify it
must be set in the site's environment before the build; changing it requires a rebuild. The Vite dev
server is pinned to port **8080** (`vite.config.ts`), matching `FRONTEND_URL` in `env.example`
(outside production any localhost port passes CORS anyway).

## 11. Deployment

The two halves deploy from **two different GitHub repositories**, both from branch `main`:

| Half | Repository | Platform | Target |
|---|---|---|---|
| Backend | `Elham-yaz/persona-glimmer-front` (git remote `origin`) | Render web service `persona-glimmer-backend`, root dir `backend/` | `https://persona-glimmer-backend-kmrl.onrender.com` |
| Frontend | `surjray/persona-glimmer-front` (git remote `surjray`) | Netlify | `https://zesty-heliotrope-b3362c.netlify.app` |

A change that touches both halves must be pushed to both repositories.

**Backend -> Render** (`render.yaml`, Blueprint): Node, region Oregon, `rootDir: backend`, build
`npm install && npm run build` (the `prebuild` script forces `npm install --include=dev` because Render
prunes devDependencies and `tsx`/TypeScript are needed for the build and the CLI scripts), start
`npm start` (`node dist/server.js`), health check `/health`. Non-secret env vars are in the file
(`NODE_ENV=production`, `PORT=3000`, `ASSIGNMENT_MODE=random`, `ALLOW_FORCED_ASSIGNMENT="false"`,
`OPENAI_MODEL=gpt-4o-mini`); `DATABASE_URL`, `OPENAI_API_KEY`, `ADMIN_API_KEY` and `FRONTEND_URL` are set
as secrets in the Render dashboard. Free-tier cold starts (30-60 s) are why the frontend has the
`/health` wait.

**Database provisioning is a manual CLI step** and never part of the build: after a deploy against a
fresh database, run `npm run migrate` and `npm run seed` in the service's **Shell** tab (or a one-off
job), or locally against the *external* connection string. `npm run db:reset` on production likewise
runs only from a shell with `CONFIRM_RESET=<database name>`; there is no HTTP endpoint for any of
these. The scripts run through `tsx` from `src/` because `tsc` does not copy `.sql` files into `dist/`.

**Frontend -> Netlify** (`netlify.toml`): build `npm run build`, publish `dist/`, SPA redirect
`/* -> /index.html 200` (also in `public/_redirects`), security headers (no CSP). `VITE_API_URL` must
point at the Render URL. Deploy previews on `*.netlify.app` are accepted by the backend's CORS rule.

Neither platform runs tests or lint before deploying; a broken push to `main` goes live.

## 12. Operational scripts

All run from `backend/`.

| Script | Command | Notes |
|---|---|---|
| Migrate | `npm run migrate` | Applies unrecorded `NNN_*.sql` files, one transaction each, records them in `schema_migrations`; idempotent |
| Seed | `npm run seed` | Upserts conditions, contexts, survey questions, guardrails; safe to re-run |
| **Reset** | `CONFIRM_RESET=<db name> npm run db:reset` | Prints host + database, then `DROP SCHEMA public CASCADE; CREATE SCHEMA public` (falls back to dropping tables one by one). **Refuses** (exit 1, touches nothing) unless `CONFIRM_RESET` equals the database name parsed from `DATABASE_URL`; exit 1 on any failure. Follow with `migrate` and `seed` |
| Env check | `npx tsx check-env.ts` | Prints which required variables are set (aware of `MOCK_OPENAI`) |
| DB connectivity | `npx tsx test-db-connection.ts` | Connects, checks the v2 tables exist, prints row counts |
| Dev server | `npm run dev` | `tsx watch src/server.ts` |
| Build / start | `npm run build` / `npm start` | `tsc` to `dist/`, `node dist/server.js` |
| Tests / lint | `npm test`, `npm run test:watch`, `npm run lint` | see section 13 |

Typical fresh local database:

```bash
export DATABASE_URL=postgresql://localhost:5432/persona_glimmer_dev
CONFIRM_RESET=persona_glimmer_dev npm run db:reset
npm run migrate && npm run seed
```

## 13. Testing

**Backend** (`backend/tests/`, Vitest + supertest, `npm test`): the global setup (`global-setup.ts`)
drops and recreates the `public` schema, migrates and seeds a **local** database
(`DATABASE_URL` if set, else `postgresql://localhost:5432/persona_glimmer_test`) and **refuses to run
against any host other than `localhost` / `127.0.0.1` / `::1`**. Every worker forces `NODE_ENV=test`,
`MOCK_OPENAI=true`, `DISABLE_RATE_LIMITS=true` and a throwaway `ADMIN_API_KEY`; no network is needed.
Files run one at a time against the shared database (`fileParallelism: false`), and each file binds its
own HTTP server explicitly to `127.0.0.1` (avoids a macOS wildcard-port hijack seen at ~1 in 2000
requests).

| File | Covers |
|---|---|
| `sessions.test.ts` | Contract shape and blinding of `POST /api/sessions`; `401 SESSION_INVALID` cases; opening message = interaction 1 with sequences 1-2; validation; lock at 10 and `409` on the 11th; replay with same and different body; **5 concurrent sends at count 8 -> exactly 10**; `502 AGENT_UNAVAILABLE` persists nothing and the same id then succeeds; survey `409 SESSION_NOT_LOCKED`, all `400` shapes, exactly 16 rows, unique code, idempotent re-submit, `409 SESSION_COMPLETED` afterwards, replay after completion |
| `admin.test.ts` | `401`/`403` behaviour; dashboard totals and 12 cells; session list filters and guarded pagination; detail view; message/survey lists; CSV headers, RFC 4180 quoting, formula neutralisation, **every row exactly once across 1000-row page boundaries including equal timestamps**; a representative set of removed v1 endpoints -> `404` (requested with the admin key, so the admin paths get past `requireAdmin`); the three rate limits (with `SESSION_CREATE_LIMIT_PER_HOUR` overridden to 5) |
| `assignment.test.ts` | 12 cells exposed; random picks valid cells; balanced always fills a least-populated cell, also under 12 concurrent creations; `force` honoured only with the flag; malformed `force` -> `400` |
| `migrations.test.ts` | Exactly the eight v2 files in order; idempotent runner; only v2 tables exist; `updated_at` trigger; the reset CLI refuses without the exact `CONFIRM_RESET`, resets with it, exits 1 on failure |
| `rate-limit-config.test.ts` | `DEFAULT_SESSION_CREATE_LIMIT_PER_HOUR = 60` and `DEFAULT_MESSAGE_LIMIT_PER_MINUTE = 30`; positive-integer env overrides honoured; malformed values (`0`, `-3`, `abc`, empty, `1.5x`) fall back to the defaults |
| `unit.test.ts` | Prompt section order and per-condition guidance; shared template has no EI/CI wording; message list shape; mock and real OpenAI paths (empty completion -> `AGENT_UNAVAILABLE`, no output filter, `timeout 30000 / maxRetries 0`); assignment helpers; CSV field rules; code range; `DATABASE_URL` parsing; hotel placeholder hygiene; SHA-256 fidelity of contexts 1-2 and the 16 items to the v1 baseline |

**Frontend** (`src/test/`, Vitest + jsdom + Testing Library, `npm test` at the repo root):
`study.test.tsx` (landing -> Begin -> opening auto-sent exactly once; `rid`/`force` forwarded; resume
into survey/completion; `AGENT_UNAVAILABLE` keeps draft and id; stale session cleared; lock -> survey;
`409` re-sync; timeout not auto-retried; copy button; "Reload code"), `adminDashboard.test.tsx` (key
verification, totals and grid, detail view, export with key header, Refresh keeps filters, rejected
keys), `api.test.ts` (retry policy: bare `502` retried, enveloped `502` not, 45 s single attempt for
sends, `401`/`429` mapping), `entryParams.test.ts`. `src/test/setup.ts` polyfills `matchMedia`,
`scrollIntoView` and an in-memory `localStorage`/`sessionStorage`.

There is still **no CI**: nothing runs these suites before a deploy.

## 14. Known issues & code health

### Resolved by the v2 rewrite

The long v1 issue list (see the v1 guide at tag `snapshot-2026-08-30`) is closed by construction:
the admin key is no longer in the bundle and the admin API fails closed with timing-safe comparison
and a rate limit; there is no client-side admin login; CORS parses the origin; database TLS is verified;
password recovery, JWT invalidation and the token blacklist are moot (no accounts); the agent matrix is
a clean 2 x 2 with one shared template (no contradictory personas); the final-survey `500` and every
progression loophole are gone (one context per session, cap enforced under `FOR UPDATE`); a failed model
call persists nothing instead of a canned apology; message sends are idempotent; the stimulus opening
is uniform across contexts; the substring output filter, the unpersisted thumbs feedback, the GETs with
write side effects, the unguarded `parseInt`s, the remote migration/seed endpoints and the dead-code
inventory are removed; migrations are tracked and transactional; the reset script requires
confirmation; survey item text is in the database; guardrails have one source (they are no longer shown
to participants, so displayed-vs-enforced drift cannot occur); and the platform has real test suites.

### Open items

1. **Hotel context content is a placeholder.** `contexts.seed.ts` id 3 (policy document, booking
   record, scenario) is fabricated for development and pilots. Replace it with the team's material
   (one file edit, then `npm run seed`) before real data collection in that context.
2. **`post-6` wording for the informational context.** "The agent resolved my issue to my
   satisfaction." presupposes a service problem, which the hotel inquiry does not have. The item is
   currently asked verbatim in all three contexts; the team must decide whether to keep, reword or make
   it context-conditional (changing it means editing `survey_questions.seed.ts`, `src/data/surveyQuestions.ts`
   and the fidelity hash in `unit.test.ts`).
3. **No email or PII, by design.** Participants cannot be contacted or de-duplicated by the platform;
   the only identifiers are the completion code and the optional `external_id`. Repeat participation is
   only weakly discouraged (a browser with a completed session in `localStorage` is shown its code again
   and cannot start a new session without clearing storage).
4. **Two-repository deployment.** The backend deploys from `Elham-yaz/main` (Render) and the frontend
   from `surjray/main` (Netlify). Every change must be pushed to both, and the two can drift.
5. **`*.netlify.app` CORS allowance.** Any HTTPS origin whose hostname ends in `.netlify.app` may make
   browser requests to the API. This is what lets deploy previews work, but it also means any other
   Netlify site could call the participant endpoints from a browser. The session bearer is not a cookie
   and is never sent automatically, so the practical exposure is low; tightening it means setting
   `FRONTEND_URL` and removing the suffix rule in `app.ts`.
6. **Phantom sessions on retried creation.** `POST /api/sessions` is not idempotent, and the frontend
   retries it on bare gateway errors, network errors and timeouts (cold starts). If the server created
   the row but the response was lost, the retry creates a second session; the participant continues in
   the second one and the first stays at `interaction_count = 0`. Such rows inflate `started` counts
   (and, in `balanced` mode, the cell counts used for assignment). Filter them out in analysis.
7. **Concurrent sends from one session can use a stale transcript.** The model call runs *before* the
   row lock, on the transcript read at that moment. Two different `clientMessageId`s in flight at once
   (two tabs, or a client that ignores the disabled input) each get a reply generated without the
   other's exchange; the transaction still keeps counts and sequences consistent and never exceeds 10.
   The UI disables the input while a send is pending, so this does not happen in normal use.

### Minor notes

- `validate()` discards Zod's parse output; controllers re-read `req.body`. Harmless today (no
  transforms/defaults are relied upon) but easy to trip over.
- `is_fallback` is always `false` in v2; the column and the admin "(fallback)" marker are kept for
  compatibility.
- `sessions.model` is stamped at creation from configuration, not from the `model` string the API
  reports per completion (which can carry a dated suffix).
- The admin grid hardcodes the id ranges 1-4 and 1-3 for layout; codes and counts come from the API.

## 15. Maintenance guide: where to change things

| Change | Where |
|---|---|
| Replace the hotel content (or edit a food context) | `backend/src/seeds/contexts.seed.ts`, then `npm run seed`. Keep placeholder/fabricated wording out of prompt-visible text (`unit.test.ts` checks) |
| Change the agent persona or the EI/CI guidance | Base template and display name in `seeds/agent_conditions.seed.ts` (then `npm run seed`); guidance blocks in `services/agent.service.ts` |
| Change the prompt structure | `AgentService.buildSystemPrompt`; update the order test in `tests/unit.test.ts` and bump `PROMPT_VERSION` in `config/study.ts` |
| Change the model or generation parameters | `OPENAI_MODEL` env var; temperature/max_tokens/penalties in `services/openai.service.ts`; timeout in `config/openai.ts` |
| Change the 10-interaction cap | `MAX_INTERACTIONS` in `backend/src/config/study.ts` **and** the `CHECK (interaction_count BETWEEN 0 AND 10)` in `003_create_sessions.sql` (new migration). The frontend reads the value from the API |
| Edit survey items | `backend/src/seeds/survey_questions.seed.ts` (bump `SURVEY_VERSION`), `src/data/surveyQuestions.ts`, the count/ids in `config/study.ts` if the number changes, and the fidelity hash in `unit.test.ts` |
| Edit the guardrails | `backend/src/seeds/guardrails.seed.ts`, then `npm run seed` (single source; nothing is shown to participants) |
| Assignment behaviour | `ASSIGNMENT_MODE` env; algorithms in `services/assignment.service.ts` |
| Rate limits | `SESSION_CREATE_LIMIT_PER_HOUR`, `MESSAGE_LIMIT_PER_MINUTE` env (defaults in `config/study.ts`); admin limit in `routes/admin.routes.ts` |
| Session / message / survey logic | `controllers/session.controller.ts` (+ `models/Session.ts`, `models/SessionMessage.ts`, `utils/completionCode.ts`) |
| Admin API, exports, CSV columns | `controllers/admin.controller.ts` (`EXPORT_SPECS`), `routes/admin.routes.ts`; UI in `src/pages/AdminDashboard.tsx`, client in `adminApi` (`src/lib/api.ts`) |
| Schema changes | Add `backend/src/migrations/009_*.sql` (next number; one file = one transaction), run `npm run migrate` locally and on Render; update the file list assertion in `tests/migrations.test.ts` |
| Participant UI flow / copy | `src/pages/Study.tsx` (landing, completion and the state machine), `src/components/{chat,layout,survey}/` |
| Qualtrics hand-off | `src/lib/entryParams.ts` (`rid`), `sessions.external_id`; completion screen text in `Study.tsx` |
| CORS / allowed origins | `backend/src/app.ts`, `FRONTEND_URL` env |
| Deployment config | `render.yaml`, `netlify.toml`, `backend/package.json` scripts, `VITE_API_URL` in Netlify |

## 16. Study 1 (v1) history

The v1 platform (email/password accounts, JWT, 9 agents on a broken 3 x 3, 20 sequential topics with a
16-item survey each, AI-literacy survey) was operated from January to August 2026 and retired on
2026-09-06.

- **Code:** git tag `snapshot-2026-08-30` (also branch `snapshot/main-2026-08-30-pre-deep-changes`)
  is the last v1 state, including the v1 `ARCHITECTURE.md`, API and schema documents.
- **Data:** the complete Study 1 database export lives in `data_folder_private/export_2026-08-30/`
  (git-ignored; users, messages, both survey sets, dashboard stats as CSV and JSON). The production
  database was then wiped and recreated with the v2 schema; no v1 table exists in it.
- **Notes:** the ~50 incident/fix/deployment logs that used to sit in the repository root and
  `backend/` are in [`docs/archive/study1/`](./archive/study1/README.md). They describe v1 only and
  quoted credentials at the time they were written; treat every value in them (and in git history) as
  compromised and never reuse one.
