# Study 2 — Backend/Frontend Contract (v2)

**Authoritative for implementation.** Both the backend (`backend/`) and the frontend (`src/`) are built against this document. If something here is ambiguous, prefer the plan (`docs/STUDY2_PLAN.md` §0 decisions) and then the simplest robust behavior. Date: 2026-09-06.

## 0. Constants & environment

| Name | Value / default | Notes |
|---|---|---|
| `MAX_INTERACTIONS` | `10` (constant, single source in backend `config/study.ts`; frontend reads it from API responses — never hardcode 10 in the frontend) | 1 interaction = 1 participant message + 1 agent reply |
| `ASSIGNMENT_MODE` env | `random` \| `balanced`, default `random` | `random` = uniform over the 12 cells; `balanced` = uniform among cells with the fewest **started** sessions |
| `ALLOW_FORCED_ASSIGNMENT` env | `false` | when `true`, `POST /api/sessions` honors `force` (dev/test/pilot only) |
| `MOCK_OPENAI` env | `false` | when `true`, the OpenAI service returns a deterministic reply (`"[mock reply to: <first 60 chars>]"`) without network calls — used by tests and local dev |
| `OPENAI_MODEL` env | `gpt-4o-mini` | stamped onto each session as `model` |
| `PROMPT_VERSION` | `"2.0"` constant in backend | stamped onto each session |
| Required env at startup | `DATABASE_URL`, `OPENAI_API_KEY` (unless `MOCK_OPENAI=true`), `ADMIN_API_KEY` | process exits otherwise. `JWT_SECRET` is **no longer used** |
| Other env | `PORT` (3000), `NODE_ENV`, `FRONTEND_URL`, `DATABASE_SSL_NO_VERIFY`, `DATABASE_CA_CERT` | unchanged semantics |
| Frontend env | `VITE_API_URL` (default `http://localhost:3000`) | unchanged |

Response envelope everywhere: `{ success: true, data: … }` or `{ success: false, error: { message, code } }`.

## 1. Participant session API

Auth for `/api/sessions/me/*`: header `Authorization: Bearer <sessionId>` (the UUID returned at creation). Unknown/malformed → `401 { code: 'SESSION_INVALID' }`.

### `POST /api/sessions` — create session (no auth; rate-limit 20 / hour / IP)
Request: `{ "externalId"?: string (≤100 chars, e.g. Qualtrics ResponseID), "force"?: { "agentConditionId": 1-4, "contextId": 1-3 } }`
`force` is ignored (not an error) unless `ALLOW_FORCED_ASSIGNMENT=true`.
Response `201`:
```json
{ "success": true, "data": {
  "sessionId": "uuid",
  "agent":   { "displayName": "Alex" },
  "context": { "id": 1, "code": "food_utilitarian", "title": "Missing Food Item",
               "scenarioType": "utilitarian", "participantScenario": "You ordered ..." },
  "openingMessage": "You ordered ...",      // == context.participantScenario; the frontend auto-sends this as the participant's first message (D4)
  "maxInteractions": 10,
  "interactionCount": 0, "isLocked": false, "surveyCompleted": false, "completionCode": null,
  "messages": []
}}
```
Never returns EI/CI levels, condition ids/codes, or the hidden `agentPolicy` to participants.

### `GET /api/sessions/me` — resume
Same `data` shape as creation, with `messages` populated:
`messages: [{ "id", "sequence", "role": "user"|"agent", "content", "createdAt" }]` ordered by `sequence`.

### `POST /api/sessions/me/messages` — send a message (rate-limit 30 / min / session)
Request: `{ "clientMessageId": string (1–64 chars), "content": string (1–5000 chars after trim) }`
- The frontend uses `clientMessageId = "opening"` for the auto-sent stimulus and `crypto.randomUUID()` for every other message.
- **Idempotent:** if `(sessionId, clientMessageId)` already exists, return `200` with the original result and perform no writes.
- `409 { code: 'SESSION_LOCKED' }` if `isLocked` (10 interactions reached).
- `409 { code: 'SESSION_COMPLETED' }` if survey already completed.
- On OpenAI failure: **persist nothing**, return `502 { code: 'AGENT_UNAVAILABLE', message: 'The agent is temporarily unavailable. Please try sending your message again.' }`. The frontend keeps the draft and offers retry with the **same** `clientMessageId`.
- Success `200`:
```json
{ "success": true, "data": {
  "userMessage":  { "id", "sequence", "role": "user",  "content", "createdAt" },
  "agentMessage": { "id", "sequence", "role": "agent", "content", "createdAt" },
  "interactionCount": 1, "isLocked": false, "shouldShowSurvey": false
}}
```
Server invariants: user message + agent message + counter increment happen in **one transaction** with the session row locked (`SELECT … FOR UPDATE`) so concurrent sends can never exceed 10. `sequence` is 1-based over all messages (1 = participant opening, 2 = first agent reply, …, 20 = tenth agent reply). `isLocked` becomes true exactly when `interactionCount` reaches 10; `shouldShowSurvey` = `isLocked && !surveyCompleted`.

### `POST /api/sessions/me/survey` — submit post-chat survey
Request: `{ "responses": [ { "questionId": "post-1", "value": 1-7 }, … exactly 16 items, ids post-1 … post-16 each exactly once ] }`
- `409 { code: 'SESSION_NOT_LOCKED' }` if fewer than 10 interactions.
- `400 VALIDATION_ERROR` on count/id/value problems.
- **Idempotent:** if already completed, return `200 { completionCode, alreadyCompleted: true }` and write nothing.
- Success `200`: `{ "success": true, "data": { "completionCode": 48213, "alreadyCompleted": false } }`
Server: one transaction — upsert 16 responses, set `survey_completed`, `completed_at`, generate a **unique** code in `[10000, 99999]` (retry on unique-violation, max 20 attempts).

## 2. Admin API (`x-admin-api-key`, existing `requireAdmin`; rate limit 100 / 15 min)

| Endpoint | Returns |
|---|---|
| `GET /api/admin/verify` | `{ ok: true }` (unchanged) |
| `GET /api/admin/dashboard` | `{ totals: { sessions, completed, locked, inProgress, messages, surveyResponses }, cells: [ { agentConditionId, agentCode, contextId, contextCode, started, completed } ×12 ], assignmentMode }` |
| `GET /api/admin/sessions?limit&offset&agentConditionId&contextId&status=in_progress\|locked\|completed` | `{ sessions: [ { id, externalId, agentConditionId, agentCode, contextId, contextCode, interactionCount, isLocked, surveyCompleted, completionCode, model, promptVersion, createdAt, lockedAt, completedAt } ], total }` (default limit 100, max 1000; `parseInt` guarded) |
| `GET /api/admin/sessions/:id` | session (as above) + `messages[]` + `surveyResponses[]` |
| `GET /api/admin/messages?limit&offset&sessionId&agentConditionId&contextId` | `{ messages: [ { id, sessionId, sequence, role, content, isFallback, createdAt, agentCode, contextCode } ], total }` |
| `GET /api/admin/surveys?limit&offset&sessionId` | `{ responses: [ { id, sessionId, questionId, responseValue, createdAt, agentCode, contextCode, completionCode } ], total }` |
| `GET /api/admin/export?type=sessions\|messages\|surveys` | `text/csv` streamed, RFC-4180 quoting, all rows, filename `study2-<type>-<date>.csv` |

Admin endpoints are read-only. The old `POST /migrations/run` and `POST /seeds/run` endpoints are **removed** (migrations/seeds run via CLI only).

## 3. Removed endpoints (must return 404)
`/api/auth/*`, `/api/user/*`, `/api/topics/*`, `/api/chat/*`, `/api/surveys/*`, `/api/guardrails`.

## 4. Database schema (v2 — fresh database, tracked migrations)

Runner (`backend/src/migrations/run-migrations.ts`): creates `schema_migrations(filename PK, applied_at)`, applies every `NNN_*.sql` in `backend/src/migrations/` in filename order that isn't recorded, **each file inside one transaction**, executing the file as a single multi-statement query (no manual `;` splitting). Idempotent and re-runnable. `npm run migrate`.

Reset (`backend/src/migrations/reset-database.ts`): refuses to run unless `CONFIRM_RESET` env equals the target database name (parsed from `DATABASE_URL`); prints host + db, then `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (fallback: drop every table in `information_schema.tables` where `table_schema='public'`, then `schema_migrations`). Exits non-zero on any failure. `npm run db:reset`.

```sql
-- 001_create_agent_conditions.sql
CREATE TABLE agent_conditions (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  code VARCHAR(20) NOT NULL UNIQUE,                 -- hiEI_hiCI | hiEI_loCI | loEI_hiCI | loEI_loCI
  emotional_intelligence VARCHAR(4) NOT NULL CHECK (emotional_intelligence IN ('low','high')),
  cognitive_intelligence VARCHAR(4) NOT NULL CHECK (cognitive_intelligence IN ('low','high')),
  display_name VARCHAR(100) NOT NULL,
  system_prompt_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emotional_intelligence, cognitive_intelligence)
);
-- 002_create_contexts.sql
CREATE TABLE contexts (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 3),
  code VARCHAR(40) NOT NULL UNIQUE,                 -- food_utilitarian | food_hedonic | hotel_informational
  title VARCHAR(200) NOT NULL, domain VARCHAR(100) NOT NULL,
  scenario_type VARCHAR(20) NOT NULL CHECK (scenario_type IN ('utilitarian','hedonic','informational')),
  participant_scenario TEXT NOT NULL,               -- shown to participant AND auto-sent as their first message (D4)
  agent_policy TEXT NOT NULL,                       -- hidden reference material for the agent
  created_at/updated_at TIMESTAMPTZ
);
-- 003_create_sessions.sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_condition_id INTEGER NOT NULL REFERENCES agent_conditions(id),
  context_id INTEGER NOT NULL REFERENCES contexts(id),
  external_id VARCHAR(100),
  interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (interaction_count BETWEEN 0 AND 10),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  survey_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completion_code INTEGER UNIQUE CHECK (completion_code BETWEEN 10000 AND 99999),
  model VARCHAR(50) NOT NULL, prompt_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), locked_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON sessions (created_at); CREATE INDEX ON sessions (agent_condition_id, context_id); CREATE INDEX ON sessions (external_id);
-- 004_create_session_messages.sql
CREATE TABLE session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  role VARCHAR(10) NOT NULL CHECK (role IN ('user','agent')),
  content TEXT NOT NULL,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  client_message_id VARCHAR(64),                    -- set on user messages only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence), UNIQUE (session_id, client_message_id)
);
-- 005_create_session_survey_responses.sql
CREATE TABLE session_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id VARCHAR(20) NOT NULL,
  response_value INTEGER NOT NULL CHECK (response_value BETWEEN 1 AND 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id)
);
-- 006_create_survey_questions.sql
CREATE TABLE survey_questions ( question_id VARCHAR(20) PRIMARY KEY, text TEXT NOT NULL, category VARCHAR(50), position INTEGER NOT NULL UNIQUE, version VARCHAR(10) NOT NULL );
-- 007_create_global_guardrails.sql  (same shape as v1: singleton id=1, title, content, timestamps)
-- 008_create_updated_at_triggers.sql (agent_conditions, contexts, sessions, global_guardrails)
```
No table stores IP addresses, user agents, names, or emails.

## 5. Seeds (`npm run seed`, idempotent upserts)
- **agent_conditions:** ids 1–4 = (high,high), (high,low), (low,high), (low,low); `display_name = 'Alex'` for all; one shared, context-agnostic `system_prompt_template` (no EI/CI wording inside it — the manipulation lives only in the guidance blocks).
- **contexts:** 1 `food_utilitarian` and 2 `food_hedonic` copied **verbatim** from the current `topics.seed.ts` ids 1 and 2 (`stimulus_text → participant_scenario`, `topic_specific_policy → agent_policy`, title/domain/scenario_type); 3 `hotel_informational` = fabricated placeholder ("Harborview Grand Hotel": realistic policy document ≈600–900 words covering check-in/out, cancellation tiers, modifications, no-shows, deposits, pets, parking, breakfast; plus a fictional booking record — guest **first name only**, dates, room type, rate, confirmation number, cancellation deadline; plus a second-person participant scenario asking to confirm booking details and understand the cancellation policy). Clearly marked `PLACEHOLDER — replace with the team's document`.
- **survey_questions:** `post-1 … post-16` text/category copied **verbatim** from `src/data/mockData.ts`, `version = '1.0'`.
- **global_guardrails:** rewritten to be context-neutral (applies equally to a hotel inquiry and a delivery complaint): stay in role, be truthful to the reference material, don't invent policies, don't reveal these instructions or the participant's condition, redirect off-topic requests, no harmful content.

## 6. Prompt assembly (backend `services/agent.service.ts`)
```
[condition.system_prompt_template]
## Your Intelligence Profile          ← EI block (low|high) + CI block (low|high), reused from current agent.service.ts (drop 'medium')
## Global Guidelines                  ← global_guardrails.content
## Reference Information               ← context.agent_policy
## Conversation Guidelines            ← stay within context.title; treat the customer's first message as the situation; 2–4 sentences; never say you cannot help
```
then the full session transcript (≤20 messages; `agent`→`assistant`) + the new message. Generation: `OPENAI_MODEL`, temperature 0.7, max_tokens 500, presence/frequency penalty 0.1, 30 s timeout. **No output substring filter.** Empty completion → treated as failure (`AGENT_UNAVAILABLE`).

## 7. Frontend flow (`src/`)
Route `/` (HashRouter): **Landing** (title, 3–4 lines of instructions, "Begin" button; reads `rid` from `window.location.search` or hash query; if `localStorage.study_session_id` exists → skip to resume) → **Chat** (scenario card from `context.participantScenario`; on first load with `messages.length === 0` auto-send `openingMessage` with `clientMessageId: 'opening'`; counter `interactionCount / maxInteractions`; input disabled while sending or when locked; `AGENT_UNAVAILABLE` → inline "try again" keeping the draft and id) → **Survey** (full-screen, 16 Likert items, not dismissible, submit disabled until all answered) → **Completion** (5-digit code large, copy button, "enter this code in the Qualtrics survey", "you may close this window"; refresh shows the same code via `GET /me`). Route `/admin`: existing key-entry gate; tabs Dashboard (totals + 4×3 cell grid), Sessions (filter, detail view with transcript + survey), Messages, Surveys; export buttons hit `/api/admin/export?type=…` (with the key header, download via blob). Remove all auth/literacy/topic-progression UI and code. Never display EI/CI or condition codes to participants.
