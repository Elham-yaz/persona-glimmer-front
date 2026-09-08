# Admin guide: the researcher dashboard and data exports

The admin dashboard is part of the frontend at **`/#/admin`** (a plain `/admin` visit is redirected
there). It shows the Study 2 data live from the backend and downloads full CSV exports. Access is
controlled by one shared secret, the backend's `ADMIN_API_KEY`.

## 1. Getting in

1. Open `https://<the Netlify site>/#/admin` (production: `https://zesty-heliotrope-b3362c.netlify.app/#/admin`; locally `http://localhost:8080/#/admin`).
2. Enter the **admin API key**. This is the value of the `ADMIN_API_KEY` environment variable on the
   backend (Render dashboard -> service `persona-glimmer-backend` -> Environment). Nothing about the
   key is stored in the frontend build; whoever operates the backend hands the value to the
   researchers who need data access.
3. The dashboard calls `GET /api/admin/verify` with the key. If the backend accepts it, the key is kept
   in the browser's `sessionStorage` for that tab only and the data loads. Closing the tab forgets
   the key; you will be asked for it again next time.

If the backend is asleep (Render free tier) the first call can take 30-60 seconds. The dashboard
polls `/health` before the key check and before the first data load: the key form shows "Verifying..."
on its button while it waits, and once the key is accepted (or on a reload with the key already in
`sessionStorage`) the dashboard shows "Connecting to backend..." while the tabs load.

**Logout** (top right) forgets the key and returns to the study landing page. A key the backend no
longer accepts (for example after a rotation) sends you back to the key form automatically.

## 2. What each tab shows

The header shows the active **assignment mode** (`random` or `balanced`) reported by the backend.
**Refresh** reloads every tab with the filters and page currently selected.

### Dashboard
- Six totals: sessions, in progress (fewer than 10 interactions), locked (10 interactions, survey not
  yet submitted), completed (survey submitted), messages, survey responses.
- **Cell distribution**: a 4 x 3 table, agent condition (`hiEI_hiCI`, `hiEI_loCI`, `loEI_hiCI`,
  `loEI_loCI`) by context (`food_utilitarian`, `food_hedonic`, `food_informational`). Each cell shows
  `started / completed` sessions, with row totals. This is the view to watch for balance during data
  collection.
- The three **Export** buttons (sessions, messages, surveys).

### Sessions
- One row per session: created time, session id (shortened; hover for the full UUID), external id
  (the Qualtrics `ResponseID` if the study link carried `?rid=`), agent code, context code,
  interaction count, status, completion code, model and prompt version.
- Filters: agent condition, context, status. Pages of 100.
- Click a row (or **View**) for the **session detail**: status, interactions, completion code,
  external id, model / prompt version, locked-at and completed-at times, the full **transcript** in
  sequence order (1 = the auto-sent scenario, 2 = the first agent reply, ..., 20 = the tenth reply)
  and the 16 **survey responses** with the item text.

### Messages
- Every participant and agent message across all sessions, newest first: time, session (click to open
  the detail view), sequence number, role, agent code, context code, content (truncated; hover for the
  full text).
- Filters: session id (paste the UUID and press Apply), agent condition, context. Pages of 100.

### Surveys
- One row per answered item: time, session, question id (hover for the item text), value (1-7),
  agent code, context code, completion code.
- Filter: session id. Pages of 100.

Nothing in the dashboard can modify data; every admin endpoint is read-only.

## 3. Exports

Exports are generated **server-side** by `GET /api/admin/export?type=...` and streamed as a CSV file,
so they contain **every row** regardless of what is on screen or which filters are set. The browser
fetches the file with the key in a header and saves it as `study2-<type>-<YYYY-MM-DD>.csv`.

| Export | One row per | Columns |
|---|---|---|
| `sessions` | session | `id, external_id, agent_condition_id, agent_code, emotional_intelligence, cognitive_intelligence, context_id, context_code, interaction_count, is_locked, survey_completed, completion_code, model, prompt_version, created_at, locked_at, completed_at` |
| `messages` | message | `id, session_id, agent_code, context_code, sequence, role, content, is_fallback, client_message_id, created_at` -- ordered by session start, then `sequence` |
| `surveys` | answered item | `id, session_id, agent_code, context_code, completion_code, question_id, response_value, created_at` |

Notes for analysis:
- Timestamps are ISO 8601 in UTC. Booleans are `true`/`false`.
- Fields are quoted per RFC 4180 (message content can contain commas, quotes and line breaks). A
  text field that starts with `=`, `+`, `-`, `@`, tab or CR is prefixed with a single quote so a
  spreadsheet will not evaluate it as a formula; strip that leading quote if you process the file
  programmatically and it matters.
- `completion_code` is the join key to Qualtrics (participants type it in); `external_id` is the
  second join key when the study link passed `?rid=${e://Field/ResponseID}`.
- Survey item text is not in the CSV. It is fixed in the `survey_questions` table (version `1.0`) and
  in `src/data/surveyQuestions.ts`; ids are `post-1` ... `post-16`.
- `is_fallback` is always `false` in v2 (a failed model call persists nothing); the column exists for
  compatibility.
- Sessions with `interaction_count = 0` are participants who pressed Begin but never received the
  first reply (or duplicates from a retried session-create request); exclude them as you see fit.

The same endpoints work from the command line, which is convenient for scheduled pulls:

```bash
curl -s -o sessions.csv "https://persona-glimmer-backend-kmrl.onrender.com/api/admin/export?type=sessions" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

## 4. Changing or rotating the key

1. Generate a new value, e.g. `openssl rand -hex 32`.
2. Set `ADMIN_API_KEY` to it in the backend environment (Render -> service -> Environment) and let the
   service restart. Locally, edit `backend/.env` and restart `npm run dev`.
3. Tell the researchers the new value. No frontend change or redeploy is needed: the dashboard only
   ever asks for the key at runtime. Anyone still holding the old key gets `401` on their next request
   and is returned to the key form.

Rotate the key whenever someone who had it leaves the project, or if it was ever pasted somewhere it
should not have been. Never commit the key or put it in documentation.

## 5. Security properties worth knowing

- The backend compares the header against `ADMIN_API_KEY` in constant time and **fails closed**: if
  the variable is empty at request time, every admin request gets `403 ADMIN_NOT_CONFIGURED` (the
  server also refuses to start without it, so this is a backstop). There is no fallback key and no
  development bypass.
- All admin routes share one rate limit of 100 requests per IP per 15 minutes; rejected keys count,
  which throttles brute-forcing.
- The dashboard sees condition codes and EI/CI levels; participants never do (`POST /api/sessions`
  and `GET /api/sessions/me` return only the neutral display name and the scenario).
- The database stores no names, emails, IP addresses or user agents. The only participant-supplied
  identifiers are the optional `external_id` and the message text itself.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Access denied" on the key form | The key does not match `ADMIN_API_KEY` exactly (check for stray whitespace), or the backend is unreachable. |
| Error mentions "Admin API is disabled" | `ADMIN_API_KEY` is not set on the backend. Set it and restart the service. |
| "Connecting to backend..." for a long time | Render cold start; wait up to a minute. If it never connects, check `https://<backend>/health`. |
| "Too many requests" | The 100 / 15 min admin limit was hit (Refresh loads four endpoints at once, exports one each). Wait for the window to pass. |
| Export downloads an empty or truncated file | The connection dropped mid-stream; run the export again. The endpoint is stateless. |
| Export fails immediately with a network or gateway error | Unlike the other admin calls, the export is a single plain `fetch`: it does not poll `/health` first and is not retried, so against a sleeping Render instance it fails at once. Wait until the dashboard itself has loaded (or press Refresh), then run the export again. |
| A rejected key keeps sending you back to the form | The key was rotated on the backend; obtain the new value. |

For the endpoint shapes see [`docs/API.md`](./API.md) and [`docs/STUDY2_API.md`](./STUDY2_API.md);
for how the data is produced see [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).
