# Backend — Study 2 (single anonymous session)

Express + PostgreSQL API for the research chat platform, v2. One anonymous session per participant:
random assignment to one of 4 agent conditions x 3 contexts, 10 interactions, a 16-item post-chat
survey, and a unique 5-digit completion code. The authoritative contract is
[`docs/STUDY2_API.md`](../docs/STUDY2_API.md); the plan is [`docs/STUDY2_PLAN.md`](../docs/STUDY2_PLAN.md).

## Quick start

```bash
cd backend
npm install
cp env.example .env            # then edit DATABASE_URL, OPENAI_API_KEY (or MOCK_OPENAI=true), ADMIN_API_KEY
npm run migrate                # tracked migrations (schema_migrations), idempotent
npm run seed                   # agent conditions, contexts, survey questions, guardrails (upserts)
npm run dev                    # tsx watch src/server.ts (default port 3000)
```

Required environment variables: `DATABASE_URL`, `ADMIN_API_KEY`, and `OPENAI_API_KEY` unless
`MOCK_OPENAI=true`. `JWT_SECRET` is no longer used. See `env.example` for the full list
(`ASSIGNMENT_MODE`, `ALLOW_FORCED_ASSIGNMENT`, `OPENAI_MODEL`, `FRONTEND_URL`, `PORT`, TLS options).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with `tsx watch` |
| `npm run build` / `npm start` | Compile to `dist/` and run `node dist/server.js` |
| `npm run migrate` | Apply `src/migrations/NNN_*.sql` not yet recorded in `schema_migrations`, each in one transaction |
| `npm run seed` | Idempotent upserts of all reference data |
| `npm run db:reset` | Drop and recreate schema `public`. Refuses unless `CONFIRM_RESET=<database name from DATABASE_URL>` |
| `npm test` / `npm run test:watch` | Vitest + supertest integration tests (see below) |
| `npm run lint` | ESLint |

Typical fresh database:

```bash
DATABASE_URL=postgresql://localhost:5432/persona_glimmer_dev CONFIRM_RESET=persona_glimmer_dev npm run db:reset
DATABASE_URL=postgresql://localhost:5432/persona_glimmer_dev npm run migrate
DATABASE_URL=postgresql://localhost:5432/persona_glimmer_dev npm run seed
```

## API

Envelope everywhere: `{ success: true, data }` or `{ success: false, error: { message, code } }`.

Participant (`Authorization: Bearer <sessionId>` for `/me/*`; unknown -> `401 SESSION_INVALID`):

| Endpoint | Notes |
|---|---|
| `POST /api/sessions` | Create a session (`{ externalId?, force? }`); 20/hour/IP. `force` honored only with `ALLOW_FORCED_ASSIGNMENT=true` |
| `GET /api/sessions/me` | Resume: full state incl. transcript |
| `POST /api/sessions/me/messages` | `{ clientMessageId, content }`; idempotent per id; 30/min/session; `409 SESSION_LOCKED` at 10; `502 AGENT_UNAVAILABLE` persists nothing |
| `POST /api/sessions/me/survey` | 16 responses `post-1..post-16`, values 1-7; `409 SESSION_NOT_LOCKED` before 10 interactions; idempotent, returns the unique code |

Admin (`x-admin-api-key`, read-only, 100 per 15 min): `GET /api/admin/verify`, `/dashboard`,
`/sessions[/:id]`, `/messages`, `/surveys`, and `/export?type=sessions|messages|surveys`
(streamed RFC-4180 CSV). Migrations and seeds run via CLI only.

All v1 endpoints (`/api/auth`, `/api/user`, `/api/topics`, `/api/chat`, `/api/surveys`, `/api/guardrails`)
are gone and return 404.

## Layout

```
src/
  app.ts                 express app (exported, does not listen)   server.ts   listens + graceful shutdown
  config/                database.ts (pool, withTransaction), openai.ts (lazy client), study.ts (constants/env switches)
  middleware/            session.middleware.ts (Bearer session), validation, error handler
  controllers/routes/    session.*, admin.*
  models/                AgentCondition, Context, Session, SessionMessage, SessionSurveyResponse, SurveyQuestion, GlobalGuardrail
  services/              assignment (random | balanced), agent (prompt assembly), openai (MOCK_OPENAI support)
  migrations/            001-008 *.sql, run-migrations.ts, reset-database.ts
  seeds/                 agent_conditions, contexts (the informational context 3 is a marked PLACEHOLDER), survey_questions, guardrails
  utils/                 errors, sanitize, completionCode
tests/                   vitest + supertest integration tests
```

## Tests

```bash
npm test
```

Tests run against `DATABASE_URL` if set, otherwise `postgresql://localhost:5432/persona_glimmer_test`,
and **refuse to run unless the host is localhost / 127.0.0.1** — the global setup drops and
recreates the `public` schema, then migrates and seeds. `MOCK_OPENAI=true` and
`DISABLE_RATE_LIMITS=true` are forced; no network access is needed.

## Deployment notes

- `npm start` runs `node dist/server.js` (the `main` entry). Run `npm run migrate && npm run seed`
  from the service shell after deploying a fresh database.
- Production requires TLS to the database by default (`DATABASE_CA_CERT` / `DATABASE_SSL_NO_VERIFY`
  as escape hatches, unchanged from v1).
- The other Markdown files in this directory (`CURRENT_STATUS.md`, `DEBUG_LOGIN.md`, `SETUP_GUIDE.md`,
  `QUICK_START.md`, `ENV_SETUP_CHECKLIST.md`, `ENV_CONFIGURATION.txt`) describe the **v1** login-based
  platform and are kept only as history.
