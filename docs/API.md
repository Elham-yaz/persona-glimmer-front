# API reference (v2)

Short map of the Study 2 backend API. The **authoritative contract** is
[`docs/STUDY2_API.md`](./STUDY2_API.md); this page only summarises it. Where the two disagree, the
code in `backend/src/` wins (`routes/`, `controllers/`, `config/study.ts`).

- Base URL: `http://localhost:3000` locally; `https://persona-glimmer-backend-kmrl.onrender.com` in production.
- Every JSON response uses one envelope: `{ "success": true, "data": ... }` or
  `{ "success": false, "error": { "message": "...", "code": "..." } }`.
- Two credentials, both plain headers:
  - participant routes: `Authorization: Bearer <sessionId>` (the UUID returned by `POST /api/sessions`);
  - admin routes: `x-admin-api-key: <ADMIN_API_KEY>`.
- There is no login, no JWT, and no user account anywhere in v2.

## Endpoints

| Method and path | Auth | Rate limit | What it does |
|---|---|---|---|
| `GET /health` | none | none | Liveness probe: `{ "status": "ok", "timestamp": ... }`. Not enveloped. |
| `POST /api/sessions` | none | `SESSION_CREATE_LIMIT_PER_HOUR` per IP per hour (default 60; `STUDY2_API.md` and `backend/README.md` still say 20 -- the code default is 60) | Creates an anonymous session with a random (or balanced) agent x context assignment. Body `{ externalId?, force? }` -- `externalId` (max 100 chars) may also be an explicit `null`; `force` is honoured only when `ALLOW_FORCED_ASSIGNMENT=true`. Returns `201` with the full session state (`messages: []`). |
| `GET /api/sessions/me` | session | none | Resume: same shape as creation with the transcript populated, plus `interactionCount`, `isLocked`, `surveyCompleted`, `completionCode`. |
| `POST /api/sessions/me/messages` | session | `MESSAGE_LIMIT_PER_MINUTE` per session per minute (default 30) | One interaction: `{ clientMessageId, content }` -> `{ userMessage, agentMessage, interactionCount, isLocked, shouldShowSurvey }`. Idempotent on `clientMessageId`. Locks the session at 10. |
| `POST /api/sessions/me/survey` | session | none | `{ responses: [ { questionId: "post-1".."post-16", value: 1..7 } x16 ] }` -> `{ completionCode, alreadyCompleted }`. Requires a locked session; idempotent. |
| `GET /api/admin/verify` | admin | 100 per IP per 15 min (shared by all admin routes) | `{ ok: true }` -- used by the dashboard to check a key before storing it. |
| `GET /api/admin/dashboard` | admin | shared | `{ totals: { sessions, completed, locked, inProgress, messages, surveyResponses }, cells: [12 x { agentConditionId, agentCode, contextId, contextCode, started, completed }], assignmentMode }`. |
| `GET /api/admin/sessions` | admin | shared | Paginated list. Query: `limit` (default 100, clamped to 1..1000 -- `limit=0` becomes 1), `offset`, `agentConditionId`, `contextId`, `status=in_progress\|locked\|completed`. Newest first. |
| `GET /api/admin/sessions/:id` | admin | shared | One session plus `messages[]` (by sequence) and `surveyResponses[]` (by item number). `400` if `:id` is not a UUID, `404` if unknown. |
| `GET /api/admin/messages` | admin | shared | Paginated list. Query: `limit`, `offset`, `sessionId`, `agentConditionId`, `contextId`. Newest first. |
| `GET /api/admin/surveys` | admin | shared | Paginated list. Query: `limit`, `offset`, `sessionId`. Newest first. |
| `GET /api/admin/export?type=sessions\|messages\|surveys` | admin | shared | Streams **all** rows as RFC 4180 CSV (`text/csv`, attachment `study2-<type>-<YYYY-MM-DD>.csv`). Messages are ordered by session start, then `sequence`. |

All admin endpoints are read-only. Migrations and seeds run from the CLI only (`npm run migrate`,
`npm run seed`, `npm run db:reset`); there is no HTTP endpoint for them.

## Error codes

| HTTP | `error.code` | Raised by | Meaning |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | any | Zod shape check failed, malformed JSON, bad query parameter, wrong survey count/ids/values, empty message. |
| 401 | `SESSION_INVALID` | participant routes | `Authorization` header missing, not a UUID, or unknown session. The frontend forgets the stored id and shows the landing page. |
| 401 | `ADMIN_UNAUTHORIZED` | admin routes | Missing or wrong `x-admin-api-key`. Counts against the admin rate limit. |
| 403 | `ADMIN_NOT_CONFIGURED` | admin routes | `ADMIN_API_KEY` is empty at request time; the admin API is disabled (fails closed). Normally unreachable: the server refuses to start without the variable. |
| 404 | `NOT_FOUND` | any | Unknown route or unknown admin session id. Removed v1 paths outside `/api/admin/` get this unconditionally; removed `/api/admin/*` paths reach it only when a valid admin key is sent (see below). |
| 409 | `SESSION_LOCKED` | messages | 10 interactions reached; no more messages accepted. |
| 409 | `SESSION_COMPLETED` | messages | Survey already submitted. |
| 409 | `SESSION_NOT_LOCKED` | survey | Fewer than 10 interactions; the survey is not open yet. |
| 429 | `RATE_LIMITED` | limited routes | Too many requests. Every limiter sets `Retry-After` (seconds), which is what the frontend quotes. The standard headers differ by router: session routes emit IETF draft-7 (`RateLimit: limit=..., remaining=..., reset=...` plus `RateLimit-Policy`), admin routes draft-6 (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`). |
| 502 | `AGENT_UNAVAILABLE` | messages | The model call failed, timed out (30 s) or returned an empty reply. **Nothing was persisted**; retry with the same `clientMessageId`. |
| 413 | `PAYLOAD_TOO_LARGE` | any | JSON request body over the `express.json` limit of 100 kB. |
| 500 | `INTERNAL_ERROR` | any | Unexpected error; detail is included only when `NODE_ENV=development`. |

## Removed v1 endpoints

`/api/auth/*`, `/api/user/*`, `/api/topics/*`, `/api/chat/*`, `/api/surveys/*`, `/api/guardrails`,
`/api/admin/users*`, `/api/admin/surveys/literacy`, `/api/admin/surveys/post-topic`,
`POST /api/admin/migrations/run` and `POST /api/admin/seeds/run` no longer exist. The non-admin paths
return `404 NOT_FOUND` unconditionally. Anything under `/api/admin/` passes the admin rate limiter and
`requireAdmin` before route matching, so without a valid `x-admin-api-key` a removed admin path returns
`401 ADMIN_UNAUTHORIZED` (or `403 ADMIN_NOT_CONFIGURED`) and counts against the admin limit; only a
request carrying a valid key reaches the `404` catch-all. `backend/tests/admin.test.ts` checks a
representative subset of these paths (with the test admin key set), not the `/api/admin/surveys/*` ones.

## Quick examples

```bash
# Start a session (optionally carrying the Qualtrics ResponseID)
curl -s -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' -d '{"externalId":"R_example123"}'

# Send the opening message (the frontend uses clientMessageId "opening" for the auto-sent scenario)
curl -s -X POST http://localhost:3000/api/sessions/me/messages \
  -H "Authorization: Bearer $SESSION_ID" -H 'Content-Type: application/json' \
  -d '{"clientMessageId":"opening","content":"You ordered dinner ..."}'

# Admin: cell distribution, then a full CSV export
curl -s http://localhost:3000/api/admin/dashboard -H "x-admin-api-key: $ADMIN_API_KEY"
curl -s -o study2-messages.csv "http://localhost:3000/api/admin/export?type=messages" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

For the exact request/response shapes, invariants (transactions, `FOR UPDATE`, sequence numbering,
unique completion codes) and the constants behind them, read [`docs/STUDY2_API.md`](./STUDY2_API.md)
and [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).
