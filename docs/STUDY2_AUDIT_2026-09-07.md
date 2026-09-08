# PRE-DEPLOY AUDIT REPORT — Study 2 (branch `study2/single-session` @ 59de1e8)

Audience: research team and engineer. Sources: seven lens audits (requirements, research-validity, backend, frontend, security-privacy, deploy-readiness, participant-experience) plus a three-vote adversarial verification pass on every non-low finding. Nothing in this report goes beyond what those inputs established.

## 1. Verdict

**Deploy-ready with fixes.** The implementation meets all eight researcher requirements and every confirmed decision, both packages type-check, build and pass their suites (backend 79/79, frontend 31/31), and no participant-facing or data-storage defect was found; however, one pre-push blocker (live Study-1 database password and JWT secret in tracked `docs/archive/study1/*` files on two public repos) must be redacted/rotated before either `main` is pushed, and two research-validity items (EI wording inside the hedonic context policy; unrecoverable per-turn timestamps) should be decided or fixed before real data collection starts.

## 2. Requirements traceability

| Item | Status | Evidence |
|---|---|---|
| Overall flow: Qualtrics -> land -> random agent x context -> 10 interactions -> post-chat questions -> random number -> back to Qualtrics | Met (one deviation: assignment fires on the Begin click, not on page load — deliberate anti-bot measure, plan §5) | `src/pages/Study.tsx:111-157` landing/resume + `POST /api/sessions` on Begin; `:63-74` state -> chat/survey/completion; `:205-214` auto-send opening; `:234-255` survey -> code; `:488` "Please return to the Qualtrics survey and enter this code where asked."; `?rid` capture `src/lib/entryParams.ts:15-31` -> `sessions.external_id` (`session.controller.ts:215`) |
| Req 1: single interaction per user; no login, no name fields, no auth | Met | `backend/src/app.ts:85-94` mounts only `/api/sessions` and `/api/admin`; removed v1 routes return 404 (probed); `session.middleware.ts:19-45` anonymous UUID bearer only; migration 003 has no name/email/IP/UA columns; no login/JWT code in `src/`; one session per browser via `localStorage.study_session_id` (`src/lib/api.ts:93-121`) |
| Req 2: AI literacy/familiarity questions moved to Qualtrics | Met | `src/data/surveyQuestions.ts` holds only `postChatSurveyQuestions`; `grep -i literacy` over `src/` and `backend/src` empty; no literacy table in migrations 001-008; `lit-1` id -> 400 (`tests/sessions.test.ts:336-338`) |
| Req 3: four fixed agents, 2x2 EI x CI (a) hi/hi (b) hi/lo (c) lo/hi (d) lo/lo | Met | `agent_conditions.seed.ts:16-21` ids 1-4 = hiEI_hiCI, hiEI_loCI, loEI_hiCI, loEI_loCI; migration 001 CHECK id 1-4, levels IN ('low','high'), UNIQUE(EI,CI); `agent.service.ts:29-32, :73-113` Study-1 low/high blocks verbatim, 'medium' dropped; all four display as "Alex"; `AgentCondition.toPublic` exposes only displayName |
| Req 4: three contexts — two food-delivery (hedonic, utilitarian) reused + new hotel-booking informational context using a policy document | Met (hotel = placeholder by decision) | `contexts.seed.ts:37-90` ids 1-2 byte-identical to `dc3f98e:backend/src/seeds/topics.seed.ts` ids 1-2 (programmatic diff; hash test `unit.test.ts:282-283`); id 3 `hotel_informational` `:91-172` with policy sections, booking record, second-person inquiry scenario; injected as `## Reference Information` (`agent.service.ts:38`) |
| Req 5: random assignment on entry to one of 4 x 3; same agent/context all session | Met | `assignment.service.ts:19-32` `crypto.randomInt` uniform over 12 CROSS JOIN cells (`Session.ts:97-110`); persisted once in `sessions.agent_condition_id/context_id`, no update path; every message uses the session's ids (`session.controller.ts:271-276`); 200 probe sessions spread across all 12 cells; `force` ignored without `ALLOW_FORCED_ASSIGNMENT=true` (verified) |
| Req 6: after ten interactions, the same post-chat questions as before | Met (presentation differs: single page, extra click — see §5) | 10-cap under `SELECT ... FOR UPDATE` (`Session.ts:61-79`), 11th message -> 409 SESSION_LOCKED; survey requires lock (409 SESSION_NOT_LOCKED) and exactly 16 ids post-1..16, values 1-7 (`session.controller.ts:341-372`); all 16 texts/categories identical to `dc3f98e:src/data/mockData.ts:50-65` in `src/data/surveyQuestions.ts`, `survey_questions.seed.ts` and the seeded DB; Likert anchors identical |
| Req 7: after the questions, display a random 5-digit integer and instruct return to Qualtrics | Met | `completionCode.ts:10-12` `randomInt(10000, 100000)`; generated in the survey transaction (`session.controller.ts:403-409`); `Study.tsx:451-459` large code, `:470-484` copy button, `:487-490` Qualtrics instruction; same code re-shown on reload via `GET /me` |
| Req 8: store full transcript, assigned agent/context, post-chat responses, completion number | Met | Migrations 003 (sessions), 004 (session_messages seq 1..20, `client_message_id='opening'` marks stimulus), 005 (survey responses), 006 (frozen question text); writes in one transaction (`session.controller.ts:296-333`, `:403-407`); admin CSV exports (sessions/messages/surveys) include EI/CI, context_code, full transcript, completion_code; SQL invariants over 4126 messages / 208 sessions: 0 violations |
| Decision: hotel content is a fabricated placeholder | Met | `contexts.seed.ts:11-19, :33-34` (`HOTEL_CONTEXT_PLACEHOLDER_NOTE`, printed by `run-seeds.ts:17`), per-field PLACEHOLDER comments `:97, :99-100`; the word never appears in participant_scenario/agent_policy (test `unit.test.ts:231-258`) |
| Decision: production DB wiped and recreated; Study-1 export + tag | Met (reset not yet executed — a deploy step) | Tag `snapshot-2026-08-30` = dc3f98e; `data_folder_private/export_2026-08-30/` has users/messages/both survey sets/dashboard_stats (csv+json), git-ignored; fresh migrations 001-008 with tracked idempotent runner; reset guarded by `CONFIRM_RESET == <db name>` (`reset-database.ts:93-99`) |
| Decision: `ASSIGNMENT_MODE=random|balanced`, random default | Met | `config/study.ts:26-28`; balanced path under `pg_advisory_xact_lock` picks uniformly among least-started cells (`assignment.service.ts:33-37, :63-71`); `render.yaml` sets random; dashboard reports mode |
| Decision: opening mechanics kept as Study 1 (stimulus auto-sent as participant's first message, counts as 1 of 10) | Met | `Study.tsx:205-214` auto-sends `session.openingMessage` (== `context.participantScenario`) once with `clientMessageId 'opening'`; server stores it as sequence 1 and sets interaction_count 1 (`session.controller.ts:310-325`); header shows 1/10; idempotent replay and AGENT_UNAVAILABLE retry verified live |
| Decision: completion codes unique | Met | `003_create_sessions.sql` UNIQUE + CHECK 10000-99999; SAVEPOINT retry on 23505 up to 20 (`completionCode.ts:19-46`); 200 concurrent completions -> 200 distinct codes; resubmit returns same code |
| Decision: split deploys (backend Elham-yaz/main -> Render; frontend surjray/main -> Netlify) | Met (repo wiring itself not verifiable from code) | `render.yaml` rootDir backend, build/start/healthCheckPath as in production; `netlify.toml` build + SPA redirect; backend `tsc` and frontend `vite build` pass; `VITE_API_URL` is the only frontend env var; CORS normalises the trailing slash on `FRONTEND_URL` (`app.ts:58`) |

## 3. Confirmed findings (ranked by severity)

Severity shown is the post-verification consensus; the original auditor severity is noted where the verifiers moved it.

### F1 — CRITICAL — Live Study-1 Render Postgres password and JWT secret are committed in tracked docs on two PUBLIC repos
- **What:** Seven files under `docs/archive/study1/` contain the full Study-1 connection string `postgresql://paid_db_9iwk_user:MQyX...@dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com:5432/paid_db_9iwk`; six contain `JWT_SECRET=7d9a6324...400400`. Both `surjray/persona-glimmer-front` and `Elham-yaz/persona-glimmer-front` report `visibility: PUBLIC`. The secret has been on public `main` since 3c42a55/eb35f27 (Jan 2026); this branch only moved the files into `docs/archive/`.
- **Evidence:** `git grep -n 'REDACTED-ROTATED' 59de1e8` -> `DEPLOYMENT_FIX.md:20`, `NETLIFY_DEPLOYMENT_GUIDE.md:23`, `QUICK_DEPLOYMENT_FIX.md:36`, `RENDER_DEPLOYMENT_CHECKLIST.md:30`, `RENDER_DEPLOYMENT_GUIDE.md:60`, `DATABASE_ACCESS_GUIDE.md:72/76`, `HOW_TO_VIEW_DATABASE_DATA.md:137/141`; JWT_SECRET at `DEPLOYMENT_FIX.md:22`, `NETLIFY_DEPLOYMENT_GUIDE.md:25`, `QUICK_DEPLOYMENT_FIX.md:38`, `RENDER_DEPLOYMENT_CHECKLIST.md:34`, `RENDER_DEPLOYMENT_GUIDE.md:68`, `backend/ENV_CONFIGURATION.txt:31`. Verifier fetched `DEPLOYMENT_FIX.md` from both public repos via `gh api` and got the password back; host resolves (35.227.164.209) and TCP 5432 is open. Credential validity was not tested (no one authenticated). `docs/archive/study1/README.md:17-21` and `ARCHITECTURE.md:743-745` already say these values are "compromised"; nothing records the `paid_db_9iwk` password as rotated or the instance as deleted.
- **Why it matters:** If `paid_db_9iwk` still exists it holds Study-1 participant PII (names, emails, transcripts) readable by anyone. It is a different instance from Study 2's `research_chat_platform` and Study 2 collects no PII, so Study 2 data is not exposed — but the planned push republishes the files. One verifier rated this low as "pre-existing and out of Study 2 scope"; the majority kept it at critical/high because knowingly re-pushing a possibly live credential is unsafe.
- **Fix:** (1) In Render, confirm `paid_db_9iwk` is deleted or rotate its password; delete the unused `JWT_SECRET` env var. (2) Replace the URL/secret values in all listed files with placeholders on this branch before pushing. (3) Decide whether to rewrite history (`git filter-repo` + force-push both repos, re-tag `snapshot-2026-08-30`) or accept history exposure and rely on rotation. (4) Add a secret-scan (e.g. gitleaks) and extend the audit grep to `postgres(ql)?://[^:]+:[^@]+@` and `JWT_SECRET=`.
- **Blocks deploy:** Yes — the push step must not run until (1) and (2) are done.

### F2 — HIGH — Hedonic food context policy injects EI instructions into all four agents (EI x context confound)
- **What:** `food_hedonic` `agent_policy` is pasted verbatim into every agent's prompt and contains "Acknowledge the emotional disappointment - this was a special occasion" and "Validate feelings about the special moment being spoiled". In the two loEI x hedonic cells this contradicts the low-EI block ("Focus on solving problems efficiently rather than emotional support", "Use straightforward language without emotional nuance"). Contexts 1 and 3 carry no comparable wording.
- **Evidence:** `backend/src/seeds/contexts.seed.ts:74-78`; `agent.service.ts:38` injects `agent_policy` ~10 lines after the low-EI block (`:76-81`), and `:43` tells the model to rely on it; dev-DB check `position('Validate feelings' in agent_policy)` = 0 / 618 / 0 for ids 1-3. Text is byte-identical to Study 1 (`dc3f98e:topics.seed.ts:53-57`), which is what the verbatim-reuse decision asked for.
- **Why it matters:** The EI main effect is attenuated in exactly the context where it should be most diagnostic, and the EI x context interaction becomes hard to interpret. One verifier refuted it as "as specified" (verbatim reuse); two confirmed it as a real design confound the researchers may not know about because the policy text is hidden from them in the participant view. This is a research-team decision, not a code defect.
- **Fix:** Research team to choose: remove the two affective bullets from context 2's `agent_policy` (keeping remedy/severity/escalation facts), or accept the confound explicitly. If changed, bump `PROMPT_VERSION` and re-seed.
- **Blocks deploy:** No. Should be decided before pilot data are treated as study data.

### F3 — HIGH (two verifiers: medium) — Participant send time and agent latency are unrecoverable; user and agent rows share one post-reply timestamp
- **What:** `sendMessage` awaits OpenAI, then opens the transaction that inserts both rows; both take transaction-stable `NOW()`. No `sent_at`/`latency_ms` exists anywhere; the frontend sends no client timestamp.
- **Evidence:** `session.controller.ts:285` (generateReply) before `withTransaction` `:296`; inserts `:310-323`; `SessionMessage.ts:37` omits `created_at`; `004_create_session_messages.sql:12` DEFAULT NOW(). Live reproduction with a 2 s delay shim: POST at 16:17:37.642, both rows `created_at` 16:17:39.678661. Study 1 (`dc3f98e:chat.controller.ts:90,101,120`) inserted the user row before the model call, so latency was recoverable in the "current setup" — this is a silent regression.
- **Why it matters:** Post-8 ("response time was acceptable") has no behavioural correlate; high-CI (longer) vs low-CI reply latency cannot be checked as a confound; think time is lost. Not requested in Requirement 8 and turn-to-turn intervals plus session created_at/locked_at remain, hence two verifiers rated medium. The data cannot be reconstructed later.
- **Fix:** Capture `Date.now()` (or `clock_timestamp()`) at request entry and after `generateReply`; pass explicit `created_at` for the user row and store `latency_ms` (optionally token usage) on the agent row. Small change; the DB is being reset anyway.
- **Blocks deploy:** No, but strongly recommended before data collection since it is irrecoverable.

### F4 — MEDIUM (raised as high by two lenses; one verifier refuted as by-design) — Shared-browser resume shows the previous participant's transcript/completion code and blocks a new session
- **What:** `bootstrap()` resumes any `localStorage.study_session_id` without comparing the incoming `?rid=`; `entryParams.externalId` is used only in `handleBegin`. The completion screen has no "start a new session" path. On a shared device participant B lands on A's completion code (or A's half-finished chat) and cannot participate without clearing site data.
- **Evidence:** `src/pages/Study.tsx:111-130` (bootstrap), `:146-149` (rid on Begin only), `:439-491` (completion copy: "If you reopen it, the same code will be shown again"); `src/lib/api.ts:93-117`; backend has no lookup by `external_id` (`session.controller.ts:203-228`). Documented as intended in `docs/STUDY2_PLAN.md` D1 ("A new session only starts if storage is cleared") and README.md:24/28; D1 carries a "revisit" marker.
- **Why it matters:** Intended anti-repeat behaviour for one-device-per-person online panels; a real problem for lab/classroom collection (README.md:226/315 anticipates lab sessions). Failure is visible (B never chats) and detectable post hoc (duplicate code; `external_id` = R_A), and transcripts contain no PII, so the privacy exposure is small.
- **Fix:** Store the rid next to the session id (e.g. `study_session_rid`); in `bootstrap()`, if the URL carries a rid that differs from the stored one, discard the stored session and show the landing page; optionally add a quiet "Not you? Start a new session" link on the completion screen. If the team prefers strict one-per-browser, add a shared-device caveat to README Known limitations and to lab instructions (use incognito/clear site data between participants).
- **Blocks deploy:** No. Confirm recruitment channel with the team.

### F5 — MEDIUM — Chat screen uses `h-screen` (100vh) + `overflow-hidden`; on mobile Safari/Chrome the input row and the post-lock "Continue to the questionnaire" button can sit behind the browser toolbar
- **Evidence:** `src/pages/Study.tsx:332` (`h-screen flex flex-col`), `:339` (`flex-1 ... overflow-hidden`); no `dvh`/`safe-area-inset` anywhere in `src/`; `MessageInput.tsx:52-75` ~100 px, locked footer `ChatWindow.tsx:101-111` ~120 px. Tailwind 3.4.17 emits `.h-dvh`. Same layout existed in Study 1 (`dc3f98e:Index.tsx:657,711`), so not a regression; not tested on a physical device.
- **Why it matters:** Qualtrics panels have a large mobile share; after the 10th interaction the only path forward may be hidden. One verifier rated high (stranding), one refuted to low (Study-1 parity; focusing the textarea scrolls it into view).
- **Fix:** `h-screen h-dvh` (or `min-h-[100dvh]`) on the chat wrapper; `pb-[env(safe-area-inset-bottom)]` on the input form. One-class change.
- **Blocks deploy:** No; cheap enough to include.

### F6 — MEDIUM — `?sslmode=require` in `DATABASE_URL` (as README and render.yaml instruct) silently disables `DATABASE_SSL_NO_VERIFY` and `DATABASE_CA_CERT`
- **Evidence:** pg 8.17.2 `connection-parameters.js:59-60` merges the parsed URL over the config, and `pg-connection-string` builds its own `ssl` object whenever `sslmode` is present; probe: URL without sslmode -> `ssl {rejectUnauthorized:false}`, with `?sslmode=require` -> `ssl {}`. Instruction appears at README.md:256, :267 and render.yaml:26 (new in Study 2; contradicts STUDY2_API.md:16 / ARCHITECTURE.md:541 "unchanged semantics"). The current production URL has no sslmode, so the planned deploy is unaffected. One verifier found the External hostname's Let's Encrypt cert validates against the system CA, so README:267 (local External URL) works regardless.
- **Why it matters:** Anyone rebuilding the service per the repo's own docs gets a loud TLS failure that the documented escape hatch cannot fix.
- **Fix:** Drop `?sslmode=require` from README.md:256/267 and render.yaml:26 (SSL is already forced by NODE_ENV=production), or make `database.ts` strip/reject `sslmode` with a clear error.
- **Blocks deploy:** No (docs/config).

### F7 — LOW–MEDIUM — `docs/STUDY2_PLAN.md` §9 describes an additive "migration 013" deploy and a database rollback that no longer exist
- **Evidence:** `STUDY2_PLAN.md:202-205` (also §3 heading :68, :128) vs §0 D2 (:12 "wiped and recreated"), README.md:259-267, ARCHITECTURE.md §16 (:739-741); migrations are 001-008 plain `CREATE TABLE`; export is CSV/JSON only, no restore script in `backend/src`. Following §9 literally fails loudly (`global_guardrails` exists in both v1 and v2 schemas), so no silent corruption.
- **Fix:** Rewrite §9 to match README §Deploy (env var first, push, one-off `CONFIRM_RESET=research_chat_platform npm run db:reset && npm run migrate && npm run seed`, smoke test) and state that rollback is code-only; Study-1 data survives only as the offline export.
- **Blocks deploy:** No.

### F8 — LOW–MEDIUM — Hotel placeholder dates carry wrong weekdays
- **Evidence:** `contexts.seed.ts:98, :155-156, :162, :164` label Oct 17/20/14/16 2026 as Fri/Mon/Tue/Thu; `cal 10 2026` gives Sat/Tue/Wed/Fri. Amounts and 72 h/24 h tiers are internally consistent ($867 + $104.04 + $84 = $1,055.04). The "friend may join" follow-up is underdetermined (Deluxe King "up to 2 adults" already has 2 adults; policy prices "$35 per additional adult").
- **Why it matters:** Manipulation-irrelevant inconsistency in the "confirm the details" condition; will be used in the pilot even though the content is a placeholder.
- **Fix:** Shift the stay to Fri Oct 16 – Mon Oct 19, 2026 (deadline Tue Oct 13 3:00 PM; one-night tier until Thu Oct 15 3:00 PM) or drop weekday names; add an explicit third-guest line to the booking record; apply the same checklist to the team's real document.
- **Blocks deploy:** No.

## 4. Findings raised but refuted

- **Exact prompt per session not recoverable / model id discarded (research-validity):** Behaviour matches STUDY2_API §0 and ARCHITECTURE.md ~706 (model stamped from config by design); hotel swap is scheduled before real collection on a wiped DB; sequence-1 message pins the scenario text; seed history is in git. Residual: add "bump PROMPT_VERSION" to the ARCHITECTURE §15 rows for content/guardrail edits (doc polish).
- **Opening stimulus content is client-supplied, not validated server-side (research-validity):** Specified in STUDY2_API §1 and plan D4 (frontend sends `openingMessage` via the normal endpoint), same as Study 1; UI disables input until the opening exists; export contains sequence-1 content + context_code so any mismatch is trivially detectable. Server-side canonicalisation is optional hardening.
- **Explicit "You have low ... intelligence" label / asymmetric block wording (research-validity):** Label, blocks and 2-4 sentence cap are verbatim Study 1 as required; wording is an open research-team item (STUDY2_PLAN §6 item 3) with a 12-24 session pilot already planned; blocks are structurally matched (5 bullets, 44-47 words).
- **Post-chat items presuppose a service failure; no N/A (research-validity):** Requirement 6 mandates the same 16 items; the concern is already surfaced to the team (README.md:312, STUDY2_PLAN §6.4/§11.9); context_code in exports allows per-context handling of post-6. Researcher decision, not a defect.
- **Participants can re-roll assignment; no server link between respondent and session (research-validity):** Requirement 1 forbids identification; D1/D9 make rid optional; conditions are invisible so re-rolling cannot target a cell; `external_id` and unique codes in exports make duplicates detectable; balanced-mode started-count semantics are documented (README.md:313, ADMIN_GUIDE.md:88).
- **Completed session silently reused for a different rid (frontend, high):** Same behaviour as F4; refuted at high because D1/STUDY2_API.md:177 specify resume-by-stored-id and a rid check was never in the contract. Kept as F4 at medium.
- **POST /api/sessions auto-retried on timeout -> orphan sessions (frontend):** Contract requires idempotency only for messages/survey; orphans have interaction_count 0, no messages/survey/code, and ADMIN_GUIDE.md:87-88 already tells analysts to exclude them; default random mode ignores started counts. Polish: disable `retryOnTimeout` for create.
- **Half-answered survey lost on refresh (frontend):** Nothing lost server-side; participant resumes directly on the survey; Study 1 `SurveyModal.tsx:18` behaved identically. Polish: sessionStorage draft.
- **Deploy order leaves a window where the backend cannot reach the DB (deploy-readiness):** Fail-closed and safe (process alive, clean 500, nothing written); no participants exist during cutover per plan (deploy -> smoke test -> pilot -> launch); the reset window is inherent in the clean-slate decision. The actionable remainder is a runbook ordering note — carried into §8.
- **Auto-sent scenario appears as "You" with no explanation; counter starts at 1/10 (participant-experience, high):** Exactly decision D4, which the plan raised (STUDY2_PLAN.md:50) and the researchers kept; Study 1 rendered it identically; ScenarioPanel shows the same text beside the bubble; constant across all 12 cells. Copy improvement listed in §5.
- **Landing page omits duration / exchange count (participant-experience):** No requirement or doc asks for it; STUDY2_PLAN §6 item 6 marks landing copy as content owed by the team; "n / 10" is visible from the first chat screen; Study 1 had no duration either. Copy suggestion in §5.
- **"Never say you don't know" pushes fabrication (participant-experience):** Line is verbatim Study 1 and specified at STUDY2_API.md:172; Study 2 adds `agent.service.ts:43` ("do not invent details") plus guardrails 2-3 prescribing the non-refusal fallback; scenario-directed questions are covered by the placeholder policy. Wording polish at most.
- **Survey shows construct labels above items (participant-experience):** Study 1 `SurveyModal.tsx:91-93` rendered the same labels; contract only forbids EI/CI/condition codes; identical across cells. Methodological note for the team (§5).
- **Opening-failure copy says "your message" (participant-experience):** Error text is mandated verbatim by STUDY2_API.md:53; retry path works with the same 'opening' id; the "Try again" button is the only enabled control. Copy polish (§5).

## 5. Low-severity / polish list

Code (participant-facing)
- Survey does not auto-open after the 10th reply; participant must click "Continue to the questionnaire" (`Study.tsx:174-176, :318, :359`; `ChatWindow.tsx:100-111`). Study 1 opened the modal automatically. Consider auto-advancing after a short delay.
- Landing copy: add approximate duration and "10 exchanges; the first is sent for you and describes your situation" (`Study.tsx:388-392`); add a caption under the sequence-1 bubble ("Sent for you to describe your situation"); consider renaming "Interactions:" in `ChatHeader.tsx:31-38`.
- Completion copy: "Go back to the Qualtrics survey tab ... do not close this window until you have entered the code"; README Qualtrics setup should say to open the link in a new tab and pass `${e://Field/ResponseID}` as rid.
- Opening-failure error string: branch on `isOpening` in `performSend` (`Study.tsx:186-193`).
- Cold-start UX: after ~5 s show "Connecting to the study server — this can take up to a minute"; consider extending `waitForBackend` (`api.ts:318-330`).
- Likert: add `aria-pressed`/radiogroup semantics (`LikertScale.tsx:23-38`); `flex-shrink-0`/wrap on 360-375 px screens; `MessageInput.tsx:44-49` check `e.nativeEvent.isComposing` before Enter-to-send.
- Survey construct labels (`SurveyScreen.tsx:76-79`) — Study-1 parity; team to decide whether to hide them and record the decision in STUDY2_PLAN §11.
- Survey format differs from Study 1 (single page vs paginated modal, transcript hidden) — items identical; document or reintroduce pagination if comparability matters.

Code (backend)
- CORS rejections return 500 INTERNAL_ERROR with a stack in dev logs (`app.ts:47, :70`); use `callback(null, false)` or a typed 403 AppError.
- Two different clientMessageIds in flight build prompts from the same history (`session.controller.ts:271-285` vs `:296-333`); only reachable by bypassing the UI; optional STALE_HISTORY 409 check under the lock.
- Concurrent same-id retries each spend a model call before serialising on the lock (cost only).
- `express.urlencoded` enabled on a JSON-only API (`app.ts:78`) permits preflight-free cross-site session creation; remove it.
- Admin export `type in EXPORT_SPECS` accepts prototype keys (`admin.controller.ts:617`); use `hasOwnProperty`/allowlist.
- No `exposedHeaders` in CORS, so `Retry-After`/`Content-Disposition` reads in `api.ts:424-427, :585-587` are always null (benign).
- `ContextPublic` exposes `code`/`scenarioType`/`id` (`Context.ts:33-41`) — visible only in devtools; frontend does not use them; drop.
- `?force=` parsing is compiled into the production bundle (`entryParams.ts:16-48`); safety rests on `ALLOW_FORCED_ASSIGNMENT` being unset; gate on `import.meta.env.DEV` and refuse the flag when NODE_ENV=production.
- No startup guard against `MOCK_OPENAI=true` in production (`study.ts:34-36`); exit at startup.
- `run-migrations.ts` should throw when it finds zero `.sql` files (dist/ contains none, so `node dist/migrations/run-migrations.js` would report "0 applied" and exit 0); the planned `npm run migrate` (tsx from src/) is fine.
- `/health` is DB-agnostic (`app.ts:82-84`); add a `SELECT 1` or document that the smoke test must POST a session.
- `db:reset` table-by-table fallback leaves `cleanup_expired_blacklisted_tokens()` behind (cosmetic).
- No Node version pin (`engines` or `.node-version`); add `>=20 <23`.
- `npm audit fix` (no `--force`) in both packages: path-to-regexp/form-data/body-parser/lodash advisories on unreachable paths.
- Add a CSP header in `netlify.toml`; drop obsolete X-XSS-Protection.

Admin dashboard
- Refresh swaps the whole dashboard for the connecting spinner (`AdminDashboard.tsx:262-276`); `/admin/` with trailing slash renders the participant landing (`App.tsx:12-16`); session-id filters require a full UUID.

Docs
- `docs/STUDY2_API.md` §1 says 20 sessions/hour/IP; code default is 60 (`study.ts:62`). Update STUDY2_API.md and backend/README.md.
- Post-6/post-10 presuppose an issue in the hotel context — record the team's decision in STUDY2_PLAN §0/§11 and the analysis plan.
- Hotel opener's meta sentence ("Nothing has gone wrong with your booking; you are simply contacting...") reads as narration when received by the agent; phrase the real scenario so it works as both instructions and first message.

## 6. Verified as correct (coverage)

Build/test: backend `tsc` clean, `npm test` 79/79 on `persona_glimmer_test`; frontend `tsc -p tsconfig.app.json` clean, `vite build` OK (318 kB JS), vitest 31/31; working tree left clean by every auditor; all probe servers stopped.

Design/manipulation: shared template and guardrails contain no EI/CI wording; the only manipulation is the Intelligence Profile section; EI/CI blocks are verbatim Study-1 low/high (5 bullets, 44-47 words each; full prompts differ by <=61 chars across conditions); 2x2 ids map to the researchers' (a)-(d); food contexts byte-identical to Study 1; hotel scenario reads as an inquiry, guardrails contain no apology/refund language; booking arithmetic consistent.

Blinding: participant API returns only `agent.displayName` ("Alex" for all four) and context `{id, code, title, scenarioType, participantScenario}`; EI/CI, agent codes, `agent_policy`, `externalId` never returned (live response key dumps); no condition codes in participant-facing source (test asserts none in DOM); neutral page title/meta; localStorage holds only `study_session_id`.

Assignment: `crypto.randomInt` over 12 CROSS JOIN cells, no Math.random; balanced mode serialised by advisory lock with concurrency tests; `force` ignored without the env flag (probed); 200 probe sessions covered all 12 cells; assignment columns have no update path.

Conversation/transaction integrity: prompt built and OpenAI called outside any lock; user message + reply + counter persisted in one transaction under `FOR UPDATE` with replay and state re-checks; UNIQUE(session_id, client_message_id) and UNIQUE(session_id, sequence); concurrency at the boundary produced exactly [200,200,409,409,409] with final count 10 and 20 rows; same-id concurrent sends -> one row pair; OpenAI failure -> 502 AGENT_UNAVAILABLE with nothing persisted; OpenAI success + DB failure -> rollback; `is_fallback` hard-wired false; model='mock' only under MOCK_OPENAI.

Input validation: externalId <=100 (trimmed, control chars stripped), content 1-5000 after trim, clientMessageId 1-64, 100 kB body -> 413, malformed JSON -> 400, leading `=` preserved in DB and neutralised in CSV; survey rejects 15/17 items, duplicate/unknown/uppercase ids, non-integer or out-of-range values with zero rows written; SESSION_INVALID on missing/malformed/unknown bearer; sequence 1..20 strictly alternating (SQL invariants: 0 violations over 4126 messages).

Completion codes: uniform in [10000, 99999], never a leading zero, UNIQUE + SAVEPOINT retry; 200 concurrent completions -> 200 distinct codes; idempotent resubmit; same code on reload.

Frontend behaviour: opening auto-sent exactly once (ref guard survives StrictMode; test asserts one POST); input disabled until opening exists, while sending, and after lock; failed sends keep draft and idempotency key; 409s re-sync from `GET /me`; counter reads `maxInteractions`/`interactionCount` from API; survey submit disabled until all 16 answered, payload in instrument order, not dismissible, failed submit keeps answers; rid parsed from `?query` and `#/?query`, capped at 100 chars; SESSION_INVALID clears storage and returns to landing with a toast; admin dashboard shapes/filters/pagination/export match `admin.controller.ts`; key verified via `/api/admin/verify`, never in the bundle.

Security/privacy: no IP/UA/email/name columns or logging; admin fails closed (403 when key unset; startup exits without it), SHA-256 + `timingSafeEqual`, GET-only, rate-limited 100/15 min; CSV formula injection neutralised; env-only switches for rate limits/mode/force/mock; `trust proxy 1`; CORS exact `FRONTEND_URL` with trailing-slash normalisation plus https `*.netlify.app` suffix, spoof hosts rejected; helmet headers present; removed v1 endpoints 404 as JSON; `safe_keeping.md`, `*.local.txt`, `render_api_info.txt`, `deploy-fix-*.txt`, `data_folder_private` git-ignored and never committed; no `backend123`/`sk-proj`/`rnd_` values in tracked files.

Deploy plumbing: startup requires exactly DATABASE_URL, ADMIN_API_KEY, OPENAI_API_KEY (JWT_SECRET unused); `prebuild` identical to Study 1; `DATABASE_SSL_NO_VERIFY=true` honoured for the current URL shape; `CONFIRM_RESET` parses `research_chat_platform` from the production URL and refuses otherwise; migrate/seed/reset run via tsx from `src/` where the `.sql` files live and share the pool config; migration runner idempotent ("0 applied, 8 already applied" on second run); server survives an unreachable DB (500 on create, 401 on /me, graceful SIGTERM); snapshot tag and branches exist on both remotes; export folder present and ignored.

## 7. Placeholder strings the team must replace before the real study

All in `backend/src/seeds/contexts.seed.ts:89-171` (context id 3, `hotel_informational`), replaceable in one edit followed by `npm run seed`:
- `title` "Hotel Booking Inquiry" (participant-visible in the scenario panel and in the prompt)
- `domain` "Hotel Booking" (admin only)
- `participant_scenario` (`:98`): Harborview Grand Hotel, Deluxe King, guest "Jordan", confirmation HG-7R4K2M, Friday Oct 17 – Monday Oct 20, 2026, "Nothing has gone wrong with your booking..."
- `agent_policy` (`:99-171`): policy sections 1-10 (check-in/out, rate types, cancellation tiers 72 h/24 h, modifications, no-shows, deposits, pets, parking, breakfast) and the "BOOKING RECORD ON FILE" block ($289/night x 3, 12% tax $104.04, destination fee $84, total $1,055.04, card ending 4417, deadlines Tue Oct 14 / Thu Oct 16)
- Code-level markers to delete afterwards: `HOTEL_CONTEXT_PLACEHOLDER_NOTE` (`:33-34`) and the four `// PLACEHOLDER` comments (`:97, :99-100`), the log line in `run-seeds.ts:17`, and mentions in README.md:83, :311; docs/ARCHITECTURE.md:87, :382, :528-530, :670-671; docs/STUDY2_API.md:162; docs/STUDY2_PLAN.md:11.
- Landing-page copy is also flagged by the plan (STUDY2_PLAN §6 item 6) as content still owed by the team.
- Bump `PROMPT_VERSION` (`backend/src/config/study.ts:7`) when the hotel content or any guardrail/prompt text changes, so pre/post sessions are distinguishable in exports.

## 8. Recommended deploy sequence adjustments

Planned: push both mains -> set `DATABASE_SSL_NO_VERIFY=true` -> wait for live -> one-off job -> smoke test. Recommended:

1. **Before any push:** rotate/delete the `paid_db_9iwk` credential and delete `JWT_SECRET` in Render; redact the values in `docs/archive/study1/*` on this branch (F1). Decide on history rewrite.
2. Optionally land the small code fixes while the DB is about to be reset anyway: per-turn timestamps/latency (F3), `h-dvh` (F5), rid-mismatch handling or shared-device caveat (F4); fix hotel weekdays (F8); drop `?sslmode=require` from README/render.yaml (F6); rewrite STUDY2_PLAN §9 (F7); `npm audit fix` in both packages.
3. **Set `DATABASE_SSL_NO_VERIFY=true` on the Render service first**, while the old code is still deployed (harmless to it). This avoids the first new deploy going live with TLS verification failing while `/health` still reports 200.
4. Push backend `main` (Elham-yaz) and wait for the deploy to be live.
5. Run the one-off job exactly as planned: `CONFIRM_RESET=research_chat_platform npm run db:reset && npm run migrate && npm run seed` (uses tsx from `src/`; do not switch to `dist/`, which has no `.sql` files). Confirm the seed log prints the hotel placeholder note and 4 conditions / 3 contexts / 16 questions.
6. Push frontend `main` (surjray) and wait for Netlify.
7. **Smoke test with a real session, not `/health`:** full 10-interaction session in the Netlify UI -> questionnaire -> code; verify in the admin dashboard that the session shows the expected cell, 20 messages with sequence 1 = `opening`, 16 survey rows and the code; check the cell grid and one CSV export. Do a second session with storage cleared to confirm random assignment varies.
8. Do not distribute the Qualtrics link until step 7 passes; run the planned 12-24 session pilot across all 12 cells first, reading hotel transcripts for factual errors by CI level, and exclude pilot sessions (or reset again) before real collection.
9. Configure the Qualtrics link to open in a new tab and pass `?rid=${e://Field/ResponseID}`; instruct lab operators to use a fresh/incognito profile per participant unless F4 is fixed.
