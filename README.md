# Research Chat Platform — Study 2

A web platform for a behavioral study of how a customer-service AI agent's **emotional intelligence (EI) × cognitive intelligence (CI)** profile shapes the way people experience a short service conversation. Each participant arrives from a Qualtrics survey, is randomly assigned to one of **12 cells** — 4 agent conditions (EI high/low × CI high/low, all presented as the same neutral agent, "Alex") × 3 conversation contexts (a *utilitarian* food-delivery failure, a *hedonic* food-delivery failure, and an *informational* hotel-booking inquiry) — has exactly **10 interactions** with the agent (one participant message plus one agent reply each; the scenario text is auto-sent as interaction 1), answers a **16-item post-chat questionnaire**, receives a **unique 5-digit completion code**, and returns to Qualtrics. No accounts, no login, no personal data: a session is an anonymous UUID held in the participant's browser. Researchers monitor cell balance and export transcripts and survey responses from a key-gated admin dashboard.

This is version 2 of the platform ("Study 2"). Study 1 — a login-based, 20-topic, 9-agent design — ran from January to August 2026; its data and documentation are archived (see [Documentation](#documentation)).

## Contents

- [How a participant session works](#how-a-participant-session-works)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started locally](#getting-started-locally)
- [Scripts reference](#scripts-reference)
- [Testing](#testing)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Admin dashboard and data export](#admin-dashboard-and-data-export)
- [Research-data notes](#research-data-notes)
- [Known limitations](#known-limitations)

## How a participant session works

1. **Qualtrics → landing.** The Qualtrics survey links to the frontend, ideally passing the response id so the two datasets can be joined later, e.g. `https://<frontend>/?rid=${e://Field/ResponseID}` (the `rid` parameter is accepted both before and inside the hash: `/?rid=X#/` and `/#/?rid=X`). The landing page shows a title, four lines of instructions and a **Begin** button. If the browser already holds a session id (`localStorage.study_session_id`), the landing page is skipped and the session is resumed at whatever step it was on.
2. **Assignment.** Clicking Begin calls `POST /api/sessions`. The backend picks a cell — uniformly at random over the 12 cells by default, or among the least-filled cells when `ASSIGNMENT_MODE=balanced` — creates the session row (stamped with the model name and prompt version), and returns the session id, the agent's display name, the context (title, scenario text, scenario type) and `maxInteractions`. The response never contains the EI/CI levels, the condition code, or the agent's hidden reference material. The frontend stores the id and sends it as `Authorization: Bearer <sessionId>` from then on.
3. **Chat (10 interactions).** The chat screen shows the scenario in a side panel ("Your situation"), the agent header ("Alex · Customer Service") and a counter `n / 10`. As soon as the chat opens with an empty transcript, the frontend **auto-sends the scenario text as the participant's first message** with the fixed idempotency key `clientMessageId: "opening"`; this counts as interaction 1 (message sequence 1 = participant, 2 = agent). Every subsequent message gets a fresh `crypto.randomUUID()` key. For each message the backend assembles the system prompt (shared persona template → EI block → CI block → global guidelines → the context's hidden reference material → conversation guidelines), sends the full transcript to OpenAI (`gpt-4o-mini` by default, 30 s timeout, no SDK retries), and then writes the participant message, the agent reply and the incremented counter **in one transaction under a row lock**, so concurrent or replayed sends can never exceed 10. When the counter reaches 10 the session is locked (`isLocked`, `locked_at`) and the input is replaced by a "Continue to the questionnaire" button. If the model call fails, **nothing is persisted**: the API answers `502 AGENT_UNAVAILABLE`, the frontend keeps the draft and shows an inline **Try again** that reuses the same `clientMessageId`, so a retry can neither duplicate nor skip a turn.
4. **Post-chat questionnaire.** A full-screen, non-dismissible page with the 16 Likert items (`post-1 … post-16`, values 1–7); the submit button is disabled until every item is answered. `POST /api/sessions/me/survey` validates exactly 16 distinct ids, upserts the responses, marks the session completed and generates a **unique** completion code in `10000–99999` (retrying on collision) — all in one transaction. Re-submitting returns the same code and writes nothing.
5. **Completion code → back to Qualtrics.** The code is displayed large with a copy button and the instruction to return to the Qualtrics survey and enter it there. Refreshing or reopening the page shows the same code again (`GET /api/sessions/me`); a new session is only created if the browser's storage is cleared or the backend no longer knows the stored id (for example after a database reset) — a `401 SESSION_INVALID` on resume makes the frontend forget the id and return the participant to the landing page, where Begin creates a fresh session.

The full request/response contract, error codes and invariants are in [docs/STUDY2_API.md](./docs/STUDY2_API.md).

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Architecture and engineering guide: system design, data model, key flows, the agent/prompt system, deployment, known issues, maintenance guide |
| [docs/STUDY2_PLAN.md](./docs/STUDY2_PLAN.md) | The redesign plan from Study 1 to Study 2; **§0 lists the confirmed decisions** (clean-slate database, random assignment default, auto-sent opening, unique codes, deploy repos) |
| [docs/STUDY2_API.md](./docs/STUDY2_API.md) | The backend/frontend contract: endpoints, payloads, error codes, schema, seeds, prompt assembly, frontend flow. Authoritative for implementation |
| [docs/API.md](./docs/API.md) | Endpoint reference for the participant and admin APIs |
| [docs/ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md) | Researcher guide to the admin dashboard, filters and CSV export |
| [PRD.md](./PRD.md) | The original product requirements (written for Study 1; where Study 2 differs, the plan and contract above win) |
| [Policy_Pairs_Reference_Document.md](./Policy_Pairs_Reference_Document.md) | The research instrument: the 10 utilitarian/hedonic policy pairs. Study 2 contexts 1 and 2 are the food-delivery pair, reused verbatim |
| [backend/README.md](./backend/README.md) | Backend-only quick start, layout and test notes |

**Study-1 history.** The Study-1 documentation (architecture guide, API and schema docs, admin docs, and the incident logs from the January 2026 build-out) lives in `docs/archive/study1/`. The last Study-1 code is git tag `snapshot-2026-08-30`; the exported Study-1 database (users, messages, surveys) is in `data_folder_private/export_2026-08-30/`, which is git-ignored and never leaves the owner's machine.

## Tech stack

**Frontend** (repo root): Vite 5 + React 18 + TypeScript, shadcn/ui (Radix) + Tailwind CSS, React Router (hash routing: `/#/` study, `/#/admin` dashboard), Vitest + Testing Library + jsdom. Deployed on **Netlify**.

**Backend** (`backend/`): Node.js + Express 4 + TypeScript, PostgreSQL via `pg` (raw parameterized SQL, no ORM), OpenAI SDK, Zod validation, Helmet, `express-rate-limit`, Vitest + Supertest. Deployed on **Render**.

**Database:** PostgreSQL (Render Postgres in production; Postgres 17 via Homebrew locally, any recent version works). Eight tracked SQL migrations, recorded in `schema_migrations`.

## Repository layout

```
/                              Frontend app + project docs
├── src/
│   ├── pages/Study.tsx        Participant flow: landing → chat → survey → completion
│   ├── pages/AdminDashboard.tsx  Key-gated researcher dashboard (tabs + CSV export)
│   ├── pages/NotFound.tsx     Catch-all route
│   ├── lib/api.ts             API client (session bearer / admin key, cold-start wait, retry policy)
│   ├── lib/entryParams.ts     Reads ?rid= (and dev-only ?force=) from the entry URL
│   ├── utils/retry.ts         Retry-with-backoff wrapper used by api.ts
│   ├── hooks/                 use-toast, use-mobile
│   ├── data/surveyQuestions.ts  The 16 post-chat items (mirrors the backend seed)
│   ├── components/            chat/, survey/, layout/ScenarioPanel, ui/ (shadcn)
│   ├── types/index.ts         Shapes mirroring docs/STUDY2_API.md
│   └── test/                  Frontend Vitest suites (fake fetch implementing the contract)
├── backend/
│   ├── src/
│   │   ├── app.ts / server.ts     Express app (CORS, Helmet, routes, 404, errors) / listener + shutdown
│   │   ├── config/study.ts        Constants + env switches (MAX_INTERACTIONS, rate limits, assignment mode…)
│   │   ├── config/database.ts     pg pool, TLS settings, withTransaction()
│   │   ├── config/openai.ts       Lazy OpenAI client (30 s timeout, 0 retries)
│   │   ├── controllers/           session.controller.ts, admin.controller.ts (incl. streamed CSV export)
│   │   ├── routes/                session.routes.ts (rate limiters), admin.routes.ts
│   │   ├── middleware/            session (Bearer UUID), validation (Zod), error handler
│   │   ├── services/              assignment (random | balanced), agent (prompt assembly), openai
│   │   ├── models/                AgentCondition, Context, Session, SessionMessage, SessionSurveyResponse, …
│   │   ├── migrations/            001–008 *.sql, run-migrations.ts (tracked runner), reset-database.ts (guarded)
│   │   ├── seeds/                 agent_conditions, contexts (hotel = PLACEHOLDER), survey_questions, guardrails
│   │   └── utils/                 errors, sanitize, completionCode
│   ├── tests/                 Vitest + Supertest integration and unit tests
│   ├── env.example            Every backend environment variable, documented
│   └── package.json
├── docs/                      Architecture, plan, API contract, admin guide, archive/
├── data_folder_private/       Git-ignored: Study-1 export and ad-hoc SQL
├── netlify.toml               Frontend deploy (build, SPA redirect, security headers)
└── render.yaml                Backend deploy blueprint (rootDir backend, env vars)
```

## Getting started locally

**Prerequisites:** Node.js (20 or newer recommended) and npm, PostgreSQL (e.g. `brew install postgresql@17 && brew services start postgresql@17`, or any running Postgres), and an OpenAI API key — or use `MOCK_OPENAI=true` to run without one.

### 1. Database

```sh
createdb persona_glimmer_dev
```

### 2. Backend (port 3000)

```sh
cd backend
npm install
cp env.example .env
```

Edit `.env`:

- `DATABASE_URL=postgresql://localhost:5432/persona_glimmer_dev`
- `ADMIN_API_KEY=` any strong random string (e.g. `openssl rand -hex 32`) — required; the server refuses to start without it
- `OPENAI_API_KEY=sk-…`, **or** set `MOCK_OPENAI=true` to get deterministic replies (`[mock reply to: …]`) with no network calls

Then:

```sh
npm run migrate      # applies src/migrations/001–008 not yet recorded in schema_migrations
npm run seed         # 4 agent conditions, 3 contexts, 16 survey items, global guidelines (idempotent upserts)
npm run dev          # tsx watch src/server.ts → http://localhost:3000
```

Check with `curl http://localhost:3000/health`. The server refuses to start if a required variable is missing and prints which one.

### 3. Frontend (port 8080)

```sh
# from the repo root
npm install
npm run dev          # http://localhost:8080 (port pinned in vite.config.ts)
```

The frontend calls `http://localhost:3000` by default. To point it elsewhere, create a `.env` file at the repo root with `VITE_API_URL=https://…` (no trailing slash). Outside production the backend's CORS allows any `localhost` / `127.0.0.1` origin, so no `FRONTEND_URL` change is needed for local work.

Open `http://localhost:8080/` for the participant flow and `http://localhost:8080/#/admin` for the dashboard (enter the `ADMIN_API_KEY` value). To land in a specific cell while testing, set `ALLOW_FORCED_ASSIGNMENT=true` in the backend `.env` and open `http://localhost:8080/#/?force=<agentConditionId>,<contextId>` (agents 1–4, contexts 1–3); without the flag the parameter is silently ignored.

### Starting over with a fresh database

```sh
cd backend
CONFIRM_RESET=persona_glimmer_dev npm run db:reset   # refuses unless CONFIRM_RESET equals the DB name in DATABASE_URL
npm run migrate && npm run seed
```

## Scripts reference

### Frontend (repo root, `package.json`)

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 8080 |
| `npm run build` | Production build to `dist/` (what Netlify runs) |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run (`vitest run`) |
| `npm run test:watch` | Vitest in watch mode |

### Backend (`backend/package.json`)

| Script | Purpose |
|---|---|
| `npm run dev` | API with hot reload (`tsx watch src/server.ts`) |
| `npm run build` | Compile TypeScript to `dist/` (`prebuild` runs `npm install --include=dev` first) |
| `npm start` | Run the compiled app (`node dist/server.js`) — Render's start command |
| `npm run migrate` | Tracked, transactional migrations: every `NNN_*.sql` in `src/migrations/` not yet in `schema_migrations`, each file in one transaction; idempotent |
| `npm run seed` | Idempotent upserts of all reference data (agent conditions, contexts, survey questions, guardrails); safe to re-run after editing a seed |
| `npm run db:reset` | Drops and recreates schema `public`; **refuses unless `CONFIRM_RESET` equals the database name parsed from `DATABASE_URL`**; exits non-zero on any failure |
| `npm run lint` | ESLint over `src` and `tests` |
| `npm test` | Vitest + Supertest, single run (see [Testing](#testing)) |
| `npm run test:watch` | Vitest in watch mode |

`migrate`, `seed` and `db:reset` run from `src/` through `tsx` (the compiled `dist/` does not contain the `.sql` files). They are CLI-only — there are no HTTP endpoints for migrations or seeds.

## Testing

### Backend (Vitest + Supertest against a real Postgres)

```sh
cd backend
createdb persona_glimmer_test      # once
npm test
```

- Tests use `DATABASE_URL` if set, otherwise `postgresql://localhost:5432/persona_glimmer_test`, and **refuse to run unless the host is `localhost` / `127.0.0.1` / `::1`** — the global setup drops and recreates the `public` schema, then migrates and seeds.
- The environment is forced to `NODE_ENV=test`, `MOCK_OPENAI=true`, `DISABLE_RATE_LIMITS=true` and a fixed test admin key; `OPENAI_API_KEY` is removed. No network access is needed.
- Files run one at a time against the shared database. Suites: `sessions.test.ts` (create/resume, the 10-interaction lock, idempotent replay, concurrency, `AGENT_UNAVAILABLE` persists nothing, survey validation and unique codes), `admin.test.ts` (auth, dashboard, filters, CSV export incl. page boundaries and formula neutralization, removed v1 endpoints, rate limits), `assignment.test.ts` (random vs balanced, forced assignment), `migrations.test.ts` (runner idempotence, schema, reset guard), `rate-limit-config.test.ts`, `unit.test.ts` (prompt assembly, OpenAI service, CSV helpers, seed content checks).

### Frontend (Vitest + jsdom + Testing Library)

```sh
npm test               # from the repo root
```

`fetch` is replaced with a fake backend that implements the contract, so the suites (`study.test.tsx`, `adminDashboard.test.tsx`, `api.test.ts`, `entryParams.test.ts`) need neither a server nor a database.

The frontend config is the root `vitest.config.ts` (environment `jsdom`, `setupFiles: src/test/setup.ts`), separate from the backend's. `setup.ts` polyfills `matchMedia` and `scrollIntoView` and installs an in-memory `Storage` for `localStorage`/`sessionStorage`, because Node 22+'s experimental Web Storage global shadows jsdom's implementation under Vitest — check there first if a local `npm test` fails on a newer Node.

There is no CI: nothing runs tests or lint before a deploy, so run both suites locally before pushing to `main`.

## Configuration

### Backend environment variables (`backend/env.example`, `backend/src/config/study.ts`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | **Required.** Postgres connection string. TLS is used when the URL contains `render.com` or `NODE_ENV=production` |
| `DATABASE_CA_CERT` | unset | PEM CA certificate for the database TLS connection, if the provider's certificate does not validate against the system bundle |
| `DATABASE_SSL_NO_VERIFY` | `false` | Last resort: `true` disables certificate verification |
| `OPENAI_API_KEY` | — | **Required unless `MOCK_OPENAI=true`** |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model; stamped onto every session as `model` |
| `MOCK_OPENAI` | `false` | `true` returns deterministic replies without calling OpenAI; sessions are stamped `model = "mock"`. Tests and local dev only |
| `ADMIN_API_KEY` | — | **Required at startup** (the server exits if it is missing). Sent by the dashboard as `x-admin-api-key`. If it is somehow empty at request time the admin API fails closed with `403 ADMIN_NOT_CONFIGURED` — no fallback key, no dev bypass |
| `ASSIGNMENT_MODE` | `random` | `random` = uniform over the 12 cells; `balanced` = uniform among the cells with the fewest *started* sessions (serialized with an advisory lock) |
| `ALLOW_FORCED_ASSIGNMENT` | `false` | `true` makes `POST /api/sessions` honor `force: { agentConditionId, contextId }` (and the frontend's `?force=a,c`). Dev/test/pilot only — never in production |
| `SESSION_CREATE_LIMIT_PER_HOUR` | `60` | Max `POST /api/sessions` **per IP per hour**. Read per request, so it can be raised without a redeploy of code. Note: `docs/STUDY2_API.md` §1 and `backend/README.md` still state 20/hour; the code default (and this README) is 60 |
| `MESSAGE_LIMIT_PER_MINUTE` | `30` | Max `POST /api/sessions/me/messages` **per session per minute** (keyed by session id, not IP) |
| `DISABLE_RATE_LIMITS` | `false` | `true` disables all three limiters (session creation, messages, admin). Tests only |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | `production` enables TLS to the database and tightens CORS/logging; `development` logs queries and validates the OpenAI key at startup |
| `FRONTEND_URL` | — | Exact-match CORS origin of the deployed frontend, no trailing slash. In addition, any `https://*.netlify.app` origin is allowed, and outside production any `localhost` port |

**Shared-IP caveat.** Participants often start from one public IP (campus NAT, computer labs, panel providers). The per-IP session-creation limit must comfortably exceed the number of participants who may begin from a single network within an hour; raise `SESSION_CREATE_LIMIT_PER_HOUR` before a lab session. A limited request returns `429 RATE_LIMITED`.

The admin API is additionally limited to **100 requests per 15 minutes per IP** (not configurable); rejected keys count against it, which throttles brute-forcing.

### Constants (`backend/src/config/study.ts`)

`MAX_INTERACTIONS = 10`, `PROMPT_VERSION = "2.0"`, 16 survey items (`post-1 … post-16`) with values 1–7, completion codes in `10000–99999` with up to 20 collision retries. The frontend reads `maxInteractions` from API responses rather than hardcoding it; the 16 survey items (ids and text) are duplicated in `src/data/surveyQuestions.ts` and must be kept in sync with the backend seed, and the admin grid hardcodes the id ranges 1–4 / 1–3 for layout.

**Input limits** (fixed in code, not configurable): message `content` at most 5,000 characters after trimming and `clientMessageId` at most 64 (`backend/src/controllers/session.controller.ts`); `externalId` at most 100; the JSON request body at 100 kB (`express.json` in `backend/src/app.ts`). An over-long message is rejected with `400 VALIDATION_ERROR` — worth recognising when watching a pilot. A body over 100 kB currently surfaces as `500 INTERNAL_ERROR`.

### Frontend environment variables

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Backend base URL, no trailing slash. **Baked into the bundle at build time** — changing it requires a rebuild/redeploy |

## Deployment

The two halves deploy from **different GitHub repositories**, both from branch `main`:

| Side | Platform | Repository / branch | Notes |
|---|---|---|---|
| Backend | Render web service `persona-glimmer-backend` — `https://persona-glimmer-backend-kmrl.onrender.com` | `Elham-yaz/persona-glimmer-front`, `main` | `rootDir: backend`; build `npm install && npm run build`; start `npm start`; health check `/health` ([render.yaml](./render.yaml)) |
| Frontend | Netlify site `zesty-heliotrope-b3362c.netlify.app` | `surjray/persona-glimmer-front`, `main` | build `npm run build`, publish `dist`, SPA redirect + security headers ([netlify.toml](./netlify.toml)) |

Because the repos differ, **every change must be pushed to both `main` branches** (or the platforms re-pointed at one repo — see D10 in the plan). Both platforms auto-deploy on push, and nothing runs tests first.

### Backend on Render

1. Create the service from `render.yaml` (Blueprint) or manually with the settings above.
2. Set the secret environment variables in the Render dashboard: `DATABASE_URL` (the Render Postgres **Internal** URL, with `?sslmode=require`), `OPENAI_API_KEY`, `ADMIN_API_KEY` (strong random value), `FRONTEND_URL` (the Netlify site URL, no trailing slash). `NODE_ENV=production`, `PORT=3000`, `ASSIGNMENT_MODE=random`, `ALLOW_FORCED_ASSIGNMENT=false` and `OPENAI_MODEL=gpt-4o-mini` come from the blueprint; add `SESSION_CREATE_LIMIT_PER_HOUR` / `MESSAGE_LIMIT_PER_MINUTE` if the defaults are too tight. `JWT_SECRET` from Study 1 is no longer used.
3. Verify: `curl https://persona-glimmer-backend-kmrl.onrender.com/health`.

### One-time production database reset (Study 1 → Study 2)

Study 2 uses a **fresh schema** in the existing production database; the Study-1 tables are dropped (their contents are preserved in the git-ignored export and the snapshot tag). Deploying does **not** touch the database — run this once, by hand, from the Render service **Shell** tab or a one-off job, never over HTTP:

```sh
CONFIRM_RESET=<production database name> npm run db:reset && npm run migrate && npm run seed
```

`db:reset` prints the host and database it is about to wipe and refuses unless `CONFIRM_RESET` matches the database name in `DATABASE_URL` exactly. After any later push that adds a migration or changes a seed, run `npm run migrate` and/or `npm run seed` again the same way. Without Shell access, run the same commands locally with `DATABASE_URL` set to the database's **External** URL (`?sslmode=require`).

### Frontend on Netlify

1. Import the `surjray/persona-glimmer-front` repo; build settings come from `netlify.toml` (base directory = repo root).
2. Set `VITE_API_URL=https://persona-glimmer-backend-kmrl.onrender.com` **before the first build** (Site settings → Environment variables). It is compiled into the bundle, so after changing it use *Deploys → Trigger deploy → Clear cache and deploy site*.
3. Copy the Netlify site URL into the backend's `FRONTEND_URL` and let Render redeploy.

### Smoke test after deploying

Open the Netlify site with the browser console open: API calls must go to the Render URL with no CORS errors. Click Begin, confirm the scenario is auto-sent and a real (non-mock) reply arrives, complete 10 interactions and the questionnaire, and confirm a code is shown; then check the cell in the admin dashboard. On Render's free tier the backend sleeps when idle and the first request can take 30–60 s — the frontend polls `/health` for up to 30 s before creating or resuming a session and before the admin key check and dashboard load, so participants see a loading state rather than an error. Other calls rely on the transport retry policy in `src/lib/api.ts`: bare `502/503/504` and network errors are retried up to 5 times with exponential backoff from 2 s; message sends use a 45 s per-attempt timeout and are *not* auto-retried on timeout (the participant's manual **Try again** reuses the `clientMessageId`); a `502` that carries an API envelope (`AGENT_UNAVAILABLE`) is never auto-retried. The CSV export is a single plain `fetch` with neither the health wait nor retries.

## Admin dashboard and data export

Open `/#/admin` on the frontend (a plain `/admin` URL is redirected there client-side) and enter the backend's `ADMIN_API_KEY`. The key is verified server-side (`GET /api/admin/verify`) before anything loads and is kept in `sessionStorage` for the tab only; it is never shipped in the bundle. All admin endpoints are read-only.

- **Dashboard** — totals (sessions, in progress, locked, completed, messages, survey responses), the current assignment mode, and the **4 × 3 cell grid** showing *started / completed* sessions per agent condition × context.
- **Sessions** — filter by agent condition, context and status (`in_progress` = fewer than 10 interactions, `locked` = 10 interactions but no survey, `completed`); newest first, 100 per page. Clicking a row opens the full transcript, the 16 survey responses and the completion code.
- **Messages** — every participant and agent message with its sequence number; filter by session id, agent condition, context.
- **Surveys** — one row per item; filter by session id.
- **Export CSV** — buttons call `GET /api/admin/export?type=sessions|messages|surveys`; the server streams RFC-4180 CSV of **all rows** (no client-side cap) as `study2-<type>-<date>.csv`, downloaded through a blob because the key travels in a header.

CSV columns:

| Export | Columns | Order |
|---|---|---|
| `sessions` | `id, external_id, agent_condition_id, agent_code, emotional_intelligence, cognitive_intelligence, context_id, context_code, interaction_count, is_locked, survey_completed, completion_code, model, prompt_version, created_at, locked_at, completed_at` | session start |
| `messages` | `id, session_id, agent_code, context_code, sequence, role, content, is_fallback, client_message_id, created_at` | **session start, then sequence** (transcript order within each session) |
| `surveys` | `id, session_id, agent_code, context_code, completion_code, question_id, response_value, created_at` | response time |

Every string column — which matters for the participant-typed ones (message content, `client_message_id`, `external_id`) — that begins with a spreadsheet formula character (`=`, `+`, `-`, `@`, tab or carriage return) is prefixed with a quote and force-quoted so it cannot execute when the file is opened in Excel or LibreOffice.

## Research-data notes

- **What is stored** (PostgreSQL, see the schema in [docs/STUDY2_API.md](./docs/STUDY2_API.md) §4): one `sessions` row per participant (assignment, `external_id`, interaction count, lock/complete flags and timestamps, completion code, `model`, `prompt_version`); every message in `session_messages` (`sequence` 1–20, `role`, `content`, `client_message_id`); every answer in `session_survey_responses` (`question_id`, `response_value`); plus reference tables `agent_conditions`, `contexts`, `survey_questions` (the frozen item text, version `1.0`) and `global_guardrails`.
- **What is not stored:** names, emails, IP addresses, user agents, device information, or anything typed outside the chat and the questionnaire. There are no user accounts. Participants are only ever shown the agent name "Alex" and the scenario — never the EI/CI levels or the condition code.
- **Joining to Qualtrics.** The primary join key is the **completion code** the participant types into Qualtrics (`sessions.completion_code`, unique). The secondary key is `sessions.external_id`, populated when the Qualtrics link carries `?rid=` (typically the Qualtrics `ResponseID`); use it to recover sessions whose code was mistyped. Both appear in the sessions export; the surveys export also carries the code.
- **Reading the exports.** Use `agent_code` (`hiEI_hiCI`, `hiEI_loCI`, `loEI_hiCI`, `loEI_loCI`) and `context_code` (`food_utilitarian`, `food_hedonic`, `hotel_informational`) as factors. The messages export is ordered by session start and then `sequence`, so each session's transcript is contiguous and in order (odd sequences are the participant, even the agent; sequence 1 is the auto-sent scenario). `is_fallback` is always `false` in Study 2 — a failed model call persists nothing — and is kept only for schema compatibility. `model` and `prompt_version` (`2.0`) are stamped per session for reproducibility; sessions created with `MOCK_OPENAI=true` show `model = "mock"` and should be excluded.
- **Cell counts.** "Started" counts every session created, including abandoned ones; filter on `survey_completed` (or `status=completed`) for analyzable sessions.

## Known limitations

See the known-issues section of [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full list and background. The ones a researcher or operator is most likely to hit:

- **Hotel context is placeholder content.** Context 3 (`hotel_informational`, "Harborview Grand Hotel") — its policy document, booking record and participant scenario — was fabricated for development and pilot testing. The real material from the research team goes into `backend/src/seeds/contexts.seed.ts` (one edit), followed by `npm run seed`. Keep any "placeholder" wording out of the seeded text itself: it is pasted verbatim into the agent's prompt.
- **`post-6` wording.** "The agent resolved my issue to my satisfaction" presupposes a service problem, which the informational hotel context does not have. Whether it stays, is reworded, or becomes context-conditional is an open decision; item text lives in both `backend/src/seeds/survey_questions.seed.ts` and `src/data/surveyQuestions.ts` and must be changed in both.
- **Phantom (abandoned) sessions.** A session row is created the moment a participant clicks Begin. If they leave, clear their browser storage, or switch devices, that row stays `in_progress` forever and a new one is created on the next Begin. Such rows inflate the "started" counts (and, in `balanced` mode, steer assignment), so analyze completed sessions only.
- **Hand-typed completion codes** can be mistyped in Qualtrics; only sessions whose Qualtrics link carried `?rid=` have the second join key.
- **Shared-IP rate limiting.** The default of 60 new sessions per IP per hour can block a lab or campus network; raise `SESSION_CREATE_LIMIT_PER_HOUR` in advance.
- **Cold starts.** On Render's free tier the first request after idle takes 30–60 s; the frontend waits, but a participant may see a long loading state.
- **Two deploy repositories and no CI.** Backend and frontend deploy from different GitHub repos, both straight from `main` with no automated tests in the path; forgetting one push leaves the halves out of sync.
- **Replay edge case.** Replaying an old `clientMessageId` after the survey has been submitted returns the original messages but `shouldShowSurvey: false` (the current state), a deliberate deviation from a literal reading of the contract.
