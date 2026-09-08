# Study 2 Platform Redesign — Implementation Plan

**Status:** APPROVED 2026-09-06 (see §0) — implementation in progress on branch `study2/single-session` · **Date:** 2026-08-30 · **Rollback anchor:** tag `snapshot-2026-08-30` / branch `snapshot/main-2026-08-30-pre-deep-changes` on both repos

This plan turns the current 20-topic, login-based, twice-weekly platform into a **single anonymous session**: land from Qualtrics → random assignment (4 agents × 3 contexts) → 10 interactions → 16 post-chat questions → 5-digit completion code → back to Qualtrics. Qualtrics itself is out of scope; only the hand-offs (inbound link, outbound code) are covered.

## 0. Decisions confirmed (2026-09-06)

| Item | Decision |
|---|---|
| Control-context content | **Fabricated placeholder content for now** (reference document, order record, scenario) — contextual to the use case; the team will supply the real material later. Kept in one seed file so swapping is a single edit. |
| D2 database | **Clean slate.** Study-1 data is preserved in `data_folder_private/export_2026-08-30/` and git tag `snapshot-2026-08-30`; the production database is **wiped and recreated** with the v2 schema. The old migration set is replaced by a fresh v2 set and a tracked (`schema_migrations`) runner. |
| D3 assignment | **Config flag** `ASSIGNMENT_MODE=random\|balanced`, **default `random`** (uniform over the 12 cells). |
| D4 opening | **Keep the current setup:** the context's stimulus text is auto-sent as the participant's first message and **counts as interaction 1 of 10**; the agent replies. Made robust: the frontend sends it through the normal message endpoint with a deterministic idempotency key, so retries/refreshes cannot duplicate or skip it. |
| D5 codes | **Unique** 5-digit completion codes (10000–99999), generated at survey submission, idempotent on re-submit. |
| D10 deploys | **Unchanged for now:** backend from `Elham-yaz/main` (Render), frontend from `surjray/main` (Netlify). |
| Everything else | Implementer's judgement, following the recommendations in §2 (neutral agent name, `?rid=` capture, error-and-retry on OpenAI failure with no persisted fallback, balanced/random flag, no PII). |
| Control context *(amendment 2026-09-07)* | **Changed from a booking-inquiry scenario in a separate travel domain to a food-delivery informational context**, per researcher request: context 3 is now `food_informational` ("Delivery Order Inquiry"), same Food Delivery domain as contexts 1–2, with **no service issue** — the customer has a just-placed order and chats with the agent to learn about delivery timing, ingredients/allergens, packaging/presentation and the delivery process. Domain is now constant across all three contexts; the content remains a fabricated placeholder until the team supplies the final material. |

---

## 1. What changes, conceptually

| Area | Study 1 (current) | Study 2 (target) |
|---|---|---|
| Identity | Email + password, JWT, persistent user | **None.** Anonymous session created on landing; no PII collected |
| Entry | Login/register page | Landing directly from a Qualtrics link |
| AI-literacy survey | 8 questions on the platform | **Removed** (asked in Qualtrics) |
| Agents | 9 (broken 3×3, contradictory prompts) | **4**, clean 2×2: EI {high, low} × CI {high, low} |
| Contexts | 20 topics, sequential unlock | **3**, one per session: food-delivery utilitarian, food-delivery hedonic, **new** food-delivery informational (no service issue; amended 2026-09-07 — see §0) |
| Assignment | Agent at registration; topics in fixed order | **Agent × context randomized on entry**, fixed for the session |
| Progression | 10 interactions → survey → next topic ×20 | 10 interactions → survey → **completion code** → done |
| Post-chat survey | 16 items per topic | Same 16 items, once |
| Completion | "Study complete" screen | **Random 5-digit code**, persisted, participant types it into Qualtrics |
| Data | users / messages / interactions / surveys | sessions / messages / survey responses / completion codes (+ assignment) |

**Bugs from the current platform that this redesign eliminates by construction:** the guaranteed 500 on the final survey (no more progression index), the topic-1-only stimulus asymmetry (one uniform opening), server-unenforced progression (single context, server-enforced cap), the agent-matrix contradictions (4 freshly written agents), the PolicyPanel placeholder (scenario served by the API), and the displayed-vs-enforced guardrail drift.

---

## 2. Architecture decisions (with recommendations)

Each item: **Decision → Recommendation → Why.** Items marked ❓ need research-team confirmation (collected again in §11).

**D1 — Session identity without login.** On landing, the frontend calls `POST /api/sessions`; the backend creates a session row (UUID v4) with the random assignment and returns the id. The frontend keeps it in `localStorage` and sends it as `Authorization: Bearer <sessionId>` on every call. → *A 122-bit random UUID is an unguessable bearer credential; no JWT machinery needed.* Refresh/cold-start resumes the same session. ❓ Revisit behavior: a browser holding a **completed** session should see its completion code again (never a new session); an **incomplete** one resumes. A new session only starts if storage is cleared — this also weakly discourages repeat participation.

**D2 — Data model: new v2 tables in the same database; Study-1 tables frozen.** Add `agent_conditions`, `contexts`, `sessions`, `session_messages`, `session_survey_responses`. Do **not** modify or drop `users`, `messages`, `topics`, `agents`, `user_topic_interactions`, `*_survey_responses`, `password_reset_tokens` — they stay as the Study-1 archive (also fully exported to `data_folder_private/export_2026-08-30/`). Reuse `global_guardrails` (config, not participant data). → *No new infrastructure, Study 1 stays queryable, and every change is purely additive (trivially reversible). The old tables' `CHECK` constraints (agents 1–9, topics 1–20, numeric EQ/CQ) make reuse messier than fresh tables.* Alternative: a second Render Postgres for total isolation — cleaner but costs another instance; not recommended unless the team wants Study 2 fully separate.

**D3 — Random assignment.** Uniform random over the 12 cells (4 × 3) per the spec. ❓ Option: **balanced randomization** (pick uniformly among the currently least-filled cells) guarantees even cells at any N; pure random can drift (e.g., 25 vs 45 at N≈400). Recommend offering a config flag, default per the team's preference.

**D4 — Opening mechanics and what counts as an interaction.** ❓ Current Study-1 behavior auto-sends the second-person `stimulus_text` as the participant's first message (odd: the agent "hears" the narration) and only on topic 1. Recommend: show the scenario as a **context card/panel**, the **agent opens with a short greeting** (not counted), and **each participant message + agent reply = 1 interaction**, cap 10, identical across all three contexts. Alternative faithful to "as in the current setup": auto-send `initial_customer_message` (first-person) as turn 1 and count it — symmetric, but gives participants only 9 authored turns.

**D5 — Completion code.** Generated **on survey submission** (not at session start, so codes exist only for completers): random integer in **10000–99999** (no leading-zero ambiguity), `UNIQUE` in `sessions.completion_code` with a retry loop on collision, and the survey endpoint is **idempotent** — re-submitting/refreshing returns the same code. ❓ Uniqueness is recommended because the code is the join key to Qualtrics.

**D6 — OpenAI failure handling.** Today an OpenAI error silently persists a canned apology as a real agent turn and still burns an interaction (contaminates data). Recommend: on failure, **do not persist anything**, return an error, and let the participant retry (the frontend shows "please try again"). If the team prefers never blocking, fall back but persist `is_fallback = true` and do **not** count the interaction. Either way, remove the naive `hack/exploit/illegal` substring output filter (false positives) — the prompt-level guardrails remain.

**D7 — Agent display / blinding.** ❓ Show a single **neutral display name** (e.g., "Alex, Customer Support") for all four conditions so nothing in the UI hints at the manipulation. The four agents share one base persona template; the manipulation lives entirely in the EI and CI guidance blocks (reusing the existing `low`/`high` blocks; `medium` is dropped). This also fixes the current template/level contradictions.

**D8 — Control-context knowledge injection** *(amended 2026-09-07: the control context is a food-delivery informational inquiry — see §0)*. Store the control context's reference material as plain text in `contexts.agent_policy`; the prompt builder injects it as "Reference information" for that context (same slot the food-failure policies use). gpt-4o-mini's context window makes even a multi-page document fine — no retrieval layer needed. The context also needs a small **fictional order record** (order number, restaurant name, ordered items with prices, time placed, estimated delivery window — no customer name) plus ingredient/allergen, packaging and delivery-process information so the agent can answer the informational question threads consistently. ❓ Content must come from the team.

**D9 — Qualtrics linkage.** ❓ Recommend the Qualtrics link carry the response id (e.g. `…/#/?rid=${e://Field/ResponseID}`); the frontend passes it to `POST /api/sessions` and it's stored as `sessions.external_id`. This gives a **second join key** besides the hand-typed completion code (typos happen). Costs nothing; falls back gracefully if absent.

**D10 — Deployment repos.** Backend deploys from `Elham-yaz/main` (Render), frontend from `surjray/main` (Netlify). ❓ Recommend pointing Netlify at `Elham-yaz` too so one push deploys both; otherwise keep pushing to both (as done for the security fix).

**D11 — Idempotent messaging.** The frontend retries POSTs (Render cold starts), which can duplicate turns. Every message carries a client-generated `clientMessageId`; the server enforces `UNIQUE(session_id, client_message_id)` and returns the existing result on replay.

---

## 3. Data model (v2 tables — additive migration `013_create_study2_tables.sql`)

```sql
agent_conditions
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  code VARCHAR(20) UNIQUE,            -- 'hiEI_hiCI' | 'hiEI_loCI' | 'loEI_hiCI' | 'loEI_loCI'
  emotional_intelligence VARCHAR(4) CHECK (IN ('low','high')),
  cognitive_intelligence VARCHAR(4) CHECK (IN ('low','high')),
  display_name VARCHAR(100),          -- same neutral name for all four (D7)
  system_prompt_template TEXT,        -- shared base persona
  created_at TIMESTAMPTZ

contexts
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 3),
  code VARCHAR(40) UNIQUE,            -- 'food_utilitarian' | 'food_hedonic' | 'food_informational'
  title, domain, scenario_type VARCHAR CHECK (IN ('utilitarian','hedonic','informational')),
  participant_scenario TEXT,          -- what the participant reads (from topics 1–2 stimulus_text; new for the informational context)
  agent_policy TEXT,                  -- hidden: service policy / informational reference doc + order record
  created_at TIMESTAMPTZ

sessions
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_condition_id INT REFERENCES agent_conditions,
  context_id INT REFERENCES contexts,
  external_id VARCHAR(100),           -- optional Qualtrics id (D9)
  interaction_count INT DEFAULT 0 CHECK (BETWEEN 0 AND 10),
  is_locked BOOL DEFAULT FALSE, survey_completed BOOL DEFAULT FALSE,
  completion_code INT UNIQUE CHECK (BETWEEN 10000 AND 99999),
  model VARCHAR(50), prompt_version VARCHAR(20),   -- reproducibility
  created_at, locked_at, completed_at TIMESTAMPTZ
  -- no IP / no user-agent by default (no PII)

session_messages
  id UUID PK, session_id UUID REFERENCES sessions ON DELETE CASCADE,
  sequence INT,                       -- 1 = participant's auto-sent stimulus, 2 = first agent reply, ... 20
  role VARCHAR CHECK (IN ('user','agent')),
  content TEXT, is_fallback BOOL DEFAULT FALSE,
  client_message_id UUID,  UNIQUE(session_id, client_message_id),   -- idempotency (D11)
  created_at TIMESTAMPTZ

session_survey_responses
  id UUID PK, session_id UUID REFERENCES sessions ON DELETE CASCADE,
  question_id VARCHAR(20), response_value INT CHECK (BETWEEN 1 AND 7),
  UNIQUE(session_id, question_id), created_at TIMESTAMPTZ

survey_questions (recommended)        -- freeze item text in the DB for analysis
  question_id VARCHAR(20) PK, text TEXT, category VARCHAR(50), version VARCHAR(10)
```

Indexes: `sessions(created_at)`, `sessions(agent_condition_id, context_id)`, `session_messages(session_id, sequence)`.

---

## 4. Backend changes

**Add**
- `models/Session.ts`, `models/SessionMessage.ts`, `models/SessionSurveyResponse.ts`, `models/Context.ts`, `models/AgentCondition.ts`
- `controllers/session.controller.ts` + `routes/session.routes.ts`
- `middleware/session.middleware.ts` — resolves `Authorization: Bearer <uuid>` → `req.session` (404/401 if unknown)
- `controllers/admin.controller.ts` — v2 endpoints (sessions, messages, surveys, cell-distribution dashboard, **server-side CSV export**)
- `migrations/013_create_study2_tables.sql` (+ add to the runner array); `seeds/agent_conditions.seed.ts`, `seeds/contexts.seed.ts`, `seeds/survey_questions.seed.ts`
- `utils/completionCode.ts` (generate + collision retry)

**Modify**
- `services/agent.service.ts` — `buildSystemPrompt(condition, context, guardrails)`: base template → EI block → CI block → global guardrails → context reference info → conversation rules. Drop `medium`.
- `services/openai.service.ts` — surface errors instead of canned text (D6); remove substring filter; stamp `model`.
- `app.ts` — mount `/api/sessions`, `/api/admin`; remove old mounts; keep the exact-match CORS fix (from the pending security batch).
- `config/database.ts` — carry the TLS-verification fix (pending batch).
- `seeds/run-seeds.ts` — seed conditions, contexts, questions, guardrails (reviewed wording — the current text is service-failure flavored; make it context-neutral).

**Remove** (routes, controllers, models, middleware — tables stay)
- `/api/auth/*`, `/api/user/*`, `/api/topics/*`, `/api/chat/*` (replaced by sessions), `/api/surveys/*` (replaced), `/api/guardrails`
- `auth.middleware.ts` (JWT), `User.ts`, `PasswordResetToken.ts`, `BlacklistedToken.ts`, `Topic.ts`, `UserTopicInteraction.ts`, `Message.ts` (v1), `utils/password.ts`, `utils/intelligenceLevel.ts`
- The uncommitted password-reset/JWT-invalidation work and migration 012 become **moot** — discard them (no users, no passwords).

**API contract (v2)**

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /api/sessions` `{externalId?}` | none (rate-limited ~20/hr/IP) | Random assignment → `201 {sessionId, agent:{displayName}, context:{title, scenario}, openingMessage, maxInteractions:10}` |
| `GET /api/sessions/me` | session | Full state for resume: assignment, messages, count, locked, completed, code (if any) |
| `POST /api/sessions/me/messages` `{clientMessageId, content}` | session (30/min) | Rejects if locked (409); dedupes on `clientMessageId`; **transaction**: insert user msg → OpenAI → insert agent msg → increment count → lock at 10. Returns `{userMessage, agentMessage, interactionCount, isLocked, shouldShowSurvey}` |
| `POST /api/sessions/me/survey` `{responses[16]}` | session | Requires locked & not completed; exactly 16 ids, values 1–7; **transaction**: upsert responses → mark complete → generate unique code. Idempotent: returns existing code on repeat |
| `GET /api/admin/dashboard` | admin key | Totals + **4×3 cell counts** (started / completed) — essential for monitoring balance |
| `GET /api/admin/sessions[/:id]`, `/messages`, `/surveys` | admin key | Paginated, filterable by condition/context/date |
| `GET /api/admin/export?type=sessions\|messages\|surveys` | admin key | Streams CSV server-side (no 1,000-row client cap) |

Invariants enforced server-side: one context per session; max 10 interactions; survey only when locked; code only after survey; no writes to Study-1 tables anywhere in the new code.

---

## 5. Frontend changes

**Flow** (`src/pages/Study.tsx` replaces `Index.tsx`'s state machine):
1. **Landing** — brief instructions + **"Begin"** button (prevents bots/prefetchers from creating sessions; captures `?rid=` if present). If `localStorage` holds a session → skip straight to resume.
2. **Chat** — scenario panel (`PolicyPanel` repurposed, fed by the API), stimulus auto-sent as the participant's first message (D4, counts as interaction 1), counter `n/10`, input disabled at 10. Existing `ChatWindow`/`MessageBubble`/`MessageInput`/`TypingIndicator` reused. Errors surface a retry (D6); retries reuse the same `clientMessageId`.
3. **Post-chat survey** — existing `SurveyModal`/`LikertScale` with the 16 items (`post-1…16`), presented as a full-screen step (not dismissible).
4. **Completion** — large 5-digit code, copy button, instruction to enter it in Qualtrics, note that refreshing shows the same code.

**Remove:** `AuthForm`, `ForgotPasswordForm`, `AgentIntroduction`, `TopicList`, `TopicListModal`, `ProgressBar`, literacy-survey step and `aiLiteracySurveyQuestions`, `mockData.agents/topics/mockAgentResponses`, the hardcoded `globalGuardrails` display, JWT token helpers and `auth-failed` handling in `api.ts`, `Study Complete` logic.

**Modify:** `api.ts` → `sessionApi` (create/get/message/survey) with the session bearer + kept cold-start `/health` wait; `AdminDashboard.tsx` → sessions/messages/surveys tabs, cell-distribution card, server CSV export links, literacy tab removed; `App.tsx` routes: `/` → Study, `/admin` → dashboard.

**Keep** the key-entry admin auth shipped on 2026-08-30.

---

## 6. Content needed from the research team (blocking for seeding)

1. **Control (informational) context:** the reference document (delivery timing, ingredients/allergens, packaging/presentation, the delivery process — PDF/DOCX/TXT, we convert to text); the fictional order record the agent "knows"; the participant scenario text ("You just placed an order at … and want to know …"); the agent opening line.
2. **Food-delivery contexts:** confirm reuse of topics 1–2 verbatim (`Missing Food Item` utilitarian; `Messy Food Presentation` hedonic), or supply edits.
3. **Four agent prompts:** confirm the shared base persona + existing EI/CI `low`/`high` guidance blocks are the intended manipulation, or supply wording.
4. **Post-chat items:** confirm all 16 verbatim. ⚠️ At least `post-6` ("The agent resolved my issue to my satisfaction") presupposes a service issue — decide whether it stays for the informational context, is reworded, or is context-conditional.
5. **Global guardrails** text review (currently service-failure flavored).
6. **Landing-page copy** (instructions; any consent line) and the **completion-screen wording**.
7. **Agent display name(s)** (D7).

---

## 7. Security carry-overs (from the Aug-30 review)

Shipped: admin key rotation + server-side verification. Carry into this rewrite: exact-match CORS (`app.ts`), DB TLS verification (`database.ts`), per-IP rate limits on session creation and messages, no PII collection, admin-only data endpoints. Dropped as moot: password reset hardening, JWT invalidation, migration 012. Still owner-side: rotate the OpenAI key (in progress), revoke the Render/Netlify tokens created for the Aug-30 deploy, restrict DB network access.

---

## 8. Testing & verification (the platform currently has zero real tests)

- **Backend integration tests** (vitest + supertest, OpenAI mocked) for the session lifecycle: create → 10 messages → 11th rejected → survey wrong count rejected → survey ok → code unique & idempotent → resume returns same state; replayed `clientMessageId` doesn't duplicate; concurrent messages don't overshoot 10.
- **Frontend**: build + type-check; manual run of every screen in all 12 cells (a `?force=agent,context` dev-only override makes this feasible).
- **Post-deploy smoke script** (adapt `e2e-check.py`): runs a full session end-to-end against production and asserts a real (non-fallback) reply and a code.
- **Pilot**: ~12–24 real sessions; verify cell counts in the admin dashboard, export CSV, and join a few codes against Qualtrics test responses.

---

## 9. Deployment & rollback

1. Work on branch `study2/single-session` (off `main`). 2. Run migration 013 against production **first** — purely additive, old code ignores the new tables (safe). 3. Seed conditions/contexts/questions. 4. Merge → push backend to `Elham-yaz/main` (Render auto-deploys) and frontend to `surjray/main` (Netlify) — or consolidate per D10. 5. Smoke test. 6. Pilot.
**Rollback:** push `snapshot-2026-08-30` back onto each `main`; the v2 tables can be left in place or dropped — Study-1 data is never touched.

---

## 10. Phases & rough sizing

| Phase | Work | Size |
|---|---|---|
| 0 — Decisions & content | Resolve §11, receive §6 content | team-dependent |
| 1 — Backend v2 | Migration, models, session API, prompt builder, admin v2, removals, tests | ~1.5–2 days |
| 2 — Frontend v2 | Study flow, removals, api client, admin dashboard, completion screen | ~1.5 days |
| 3 — Content & seeding | Control-context doc ingestion, 4 agents, 3 contexts, guardrails, questions | ~0.5 day |
| 4 — Verify & deploy | Local e2e, migrate, deploy both, smoke, pilot across 12 cells | ~0.5–1 day |
| 5 — Docs | Update ARCHITECTURE.md / README for v2; ops runbook | ~0.5 day |

Phases 1 and 2 can proceed in parallel once the API contract (§4) is agreed; Phase 3 needs §6 content.

---

## 11. Open questions checklist (need answers before Phase 3; defaults in **bold**)

1. Revisit behavior: **resume incomplete / re-show code for completed**; new session only if storage cleared? (D1)
2. Assignment: **pure random** or balanced-least-filled? (D3)
3. Opening: **agent greets, participant authors all 10** vs auto-send first-person opener counted as turn 1? (D4)
4. Completion codes **unique**? Any format constraints beyond 5 digits? (D5)
5. OpenAI failure: **error + retry, nothing persisted** vs fallback flagged & uncounted? (D6)
6. **One neutral agent name** for all conditions? (D7)
7. Pass a Qualtrics response id via the link (`?rid=`)? **Yes, recommended.** (D9)
8. Point Netlify at `Elham-yaz` so one repo deploys both? **Yes, recommended.** (D10)
9. `post-6` wording for the informational context? (§6.4)
10. Same DB with new tables (**recommended**) vs a fresh database? (D2)
11. Show the `n/10` counter to participants? (**yes**, as today)
12. Store user-agent/device info? (**no** — no PII by default)
