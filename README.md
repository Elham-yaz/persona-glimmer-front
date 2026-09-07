# Research Chat Platform

A research platform for studying how a customer-service AI agent's **Emotional Intelligence (EQ) × Cognitive Intelligence (CQ)** profile affects user perceptions of service failures. Participants chat with one of **9 AI agents** across **20 service-failure topics** (10 policy pairs, each in a *utilitarian* and a *hedonic* framing), complete surveys after each topic, and have every interaction logged for analysis.

Built as a research V1 that prioritizes correctness of flow over polish. Originally scaffolded with Lovable; primarily developed in January 2026 and operated as a live study through spring 2026.

## 📚 Documentation

| Document | What it covers |
|---|---|
| **[Architecture & Engineering Guide](./docs/ARCHITECTURE.md)** | System design, data model, key flows, the AI agent system, deployment, **known issues**, and a maintenance guide — start here |
| [PRD](./PRD.md) | Product requirements and study protocol |
| [Policy Pairs Reference](./Policy_Pairs_Reference_Document.md) | The research instrument: all 20 scenarios with stimuli and agent policies |
| [API Documentation](./docs/API_DOCUMENTATION.md) | Participant-facing endpoint reference |
| [Admin API Documentation](./docs/ADMIN_API_DOCUMENTATION.md) | Researcher endpoints for data access |
| [Database Schema](./docs/DATABASE_SCHEMA.md) | Table structure (⚠️ partially stale — the migrations in `backend/src/migrations/` are the source of truth) |
| [Backend Implementation Plan](./docs/BACKEND_IMPLEMENTATION.md) | Original backend development guide |

> The many `*_FIX.md` / `*_SUMMARY.md` files in the repo root are **historical incident logs** from the January 2026 build-out, kept for reference. Several no longer reflect the code — trust [ARCHITECTURE.md](./docs/ARCHITECTURE.md) over them.

## How it works

1. **Register / log in** — each new participant is randomly and permanently assigned one of 9 agents (the agent's EQ/CQ profile is hidden from them).
2. **AI-literacy survey** — one-time, 8 questions.
3. **Chat through 20 topics** — the participant role-plays an aggrieved customer; the agent responds via OpenAI (`gpt-4o-mini` by default) using a system prompt assembled from its persona, EQ/CQ behavioral guidance, global guardrails, and the topic's hidden service policy. Each topic locks after **10 exchanges**.
4. **Post-topic survey** — 16 Likert (1–7) questions; completing it unlocks the next topic.
5. **Study complete** after all 20 topics.

Researchers use the admin dashboard (`/#/admin`) to browse users, transcripts, and survey data, and export CSVs. Access requires the backend's `ADMIN_API_KEY`, entered on the dashboard and verified server-side.

## Tech stack

**Frontend** (repo root): Vite + React 18 + TypeScript, shadcn/ui + Tailwind CSS, React Router (hash routing). Deployed on **Netlify**.

**Backend** (`backend/`): Node.js + Express + TypeScript, PostgreSQL (raw SQL via `pg`), OpenAI SDK, Zod validation, JWT auth, bcrypt. Deployed on **Render**.

## Repository structure

```
/                  Frontend app + project docs
├── src/           React app (pages/, components/, lib/api.ts, data/)
├── backend/       Express API (src/{routes,controllers,services,models,
│                  middleware,migrations,seeds})
├── docs/          Architecture guide, API docs, schema docs, admin docs
├── netlify.toml   Frontend deploy config
└── render.yaml    Backend deploy config
```

See the [repository layout section](./docs/ARCHITECTURE.md#4-repository-layout) of the architecture guide for the full tree.

## Getting started (local development)

**Prerequisites:** Node.js 18+, npm, a PostgreSQL database, and an OpenAI API key.

### 1. Backend

```sh
cd backend
npm install

# Configure environment
cp env.example .env
# Edit .env — required: DATABASE_URL, OPENAI_API_KEY, JWT_SECRET
# (see docs/ARCHITECTURE.md#10-configuration for all variables)

# Create the schema and seed the 9 agents, 20 topics, and guardrails
npm run migrate
npm run seed

# Run the API (http://localhost:3000)
npm run dev
```

Verify with `curl http://localhost:3000/health`.

### 2. Frontend

```sh
# From the repo root
npm install
npm run dev        # http://localhost:8080 (port pinned in vite.config.ts)
```

The frontend targets `http://localhost:3000` by default; set `VITE_API_URL` in a `.env` file at the repo root to point elsewhere.

### Scripts reference

| Location | Script | Purpose |
|---|---|---|
| root | `npm run dev` / `build` / `preview` | Vite dev server / production build / preview |
| root | `npm run lint`, `npm test` | ESLint; Vitest (currently only a placeholder test) |
| backend | `npm run dev` | API with hot reload (`tsx watch`) |
| backend | `npm run build` / `start` | Compile to `dist/` / run compiled app |
| backend | `npm run migrate` | Run SQL migrations (hardcoded list in `run-migrations.ts` — new migrations must be added there) |
| backend | `npm run seed` | Seed agents, topics, guardrails |
| backend | `npm run lint` | ESLint |

⚠️ `backend/src/migrations/reset-database.ts` **drops the entire schema (a hardcoded list of 19 tables, CASCADE) with no confirmation prompt** and acts on whatever `DATABASE_URL` points at. Never run it without checking your environment first.

## Deployment (Render + Netlify)

Deploy in this order: **1. database → 2. backend → 3. migrations & seeds → 4. frontend**. The frontend needs the backend URL at build time, and the backend refuses to start without a database.

> 🔐 Before deploying: the historical deployment guides in this repo (`RENDER_DEPLOYMENT_GUIDE.md`, `NETLIFY_DEPLOYMENT_GUIDE.md`, …) contain **real credentials that were committed to git history** (a database connection string, a JWT secret, an OpenAI key). Do not reuse any value found in them — generate fresh secrets and rotate anything that was exposed. See [ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-known-issues--code-health).

### 1. Database — Render PostgreSQL

1. In the [Render dashboard](https://dashboard.render.com): **New + → PostgreSQL**.
2. Pick a name and a region — **use the same region you'll use for the web service** (e.g. Oregon) so the internal connection works.
3. After creation, copy from the database's info page:
   - the **Internal Database URL** — use this as the backend's `DATABASE_URL` (same-region service-to-DB traffic);
   - the **External Database URL** — for running migrations or SQL from your own machine.
4. Append `?sslmode=require` to the connection string if it isn't already there. (Note the app itself disables TLS *verification* for Render hosts — `rejectUnauthorized: false` in `backend/src/config/database.ts` — a known weakness, not something to rely on.)

The database is empty at this point; tables are created in step 3.

### 2. Backend — Render Web Service

Option A — **Blueprint**: the repo ships [render.yaml](./render.yaml); **New + → Blueprint** and point it at the repo, then fill in the secret env vars it deliberately omits.

Option B — **manual** (**New + → Web Service**, connect the GitHub repo):

| Setting | Value |
|---|---|
| Root Directory | `backend` ⚠️ — without this the build finds the frontend's package.json and fails |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Auto-Deploy | on (redeploys on every push to `main`) |

The `prebuild` script in `backend/package.json` runs `npm install --include=dev` — this is a deliberate workaround for Render pruning devDependencies (TypeScript and `tsx` are needed to build and to run migrations). Don't remove it.

**Environment variables** (Environment tab — the service exits at startup if the first three are missing):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal Database URL from step 1 (with `?sslmode=require`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `JWT_SECRET` | Fresh random secret — e.g. `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `FRONTEND_URL` | Your Netlify site URL, e.g. `https://your-site.netlify.app` — **no trailing slash** (the CORS check is `startsWith`, so a trailing slash breaks it). You can set this after step 4 and redeploy; until then, CORS falls back to allowing `.netlify.app` origins |
| `ADMIN_API_KEY` | Strong random string (e.g. `openssl rand -hex 32`). Required for the admin dashboard: if unset, the admin API **fails closed** (403 on every request). Researchers enter this value at `/#/admin` — changing it needs no frontend redeploy |
| `OPENAI_MODEL` | Optional; defaults to `gpt-4o-mini` |

Create the service and watch the build logs: install → `tsc` compile → `node dist/app.js`. Then verify:

```sh
curl https://<your-backend>.onrender.com/health   # → {"status":"ok",...}
```

### 3. Migrations & seeds (manual, once per fresh database)

Deploying does **not** create tables — `npm run migrate` is not part of the build or start command. From the service's **Shell** tab in the Render dashboard:

```sh
npm run migrate   # creates all tables (safe to re-run; "already exists" is skipped)
npm run seed      # seeds the 9 agents, 20 topics, and guardrails — must run AFTER migrate
```

No Shell access? Run the same commands locally against the **External** Database URL:

```sh
cd backend
DATABASE_URL='<external-url>?sslmode=require' npm run migrate
DATABASE_URL='<external-url>?sslmode=require' npm run seed
```

Migrations must run via `tsx` from `src/` (as these scripts do) — the compiled `dist/` contains no `.sql` files. Re-run `npm run seed` whenever you change agents, topics, or guardrails; new migration files must also be added to the hardcoded array in `backend/src/migrations/run-migrations.ts`.

### 4. Frontend — Netlify

1. In Netlify: **Add new site → Import an existing project**, connect the GitHub repo.
2. Build settings come from [netlify.toml](./netlify.toml): build `npm run build`, publish `dist`, plus the SPA redirect and security headers. Leave the base directory as the repo root.
3. **Before the first build**, set the environment variable (Site settings → Environment variables):
   - `VITE_API_URL` = `https://<your-backend>.onrender.com` (no trailing slash), scoped to all contexts.
   - This is **baked into the bundle at build time** — a missing or changed value requires a rebuild, not just a browser refresh. If you set it after the first deploy, trigger **Deploys → Trigger deploy → Clear cache and deploy site**.
4. Copy the resulting site URL back into the backend's `FRONTEND_URL` env var (step 2) and let Render redeploy.

### 5. Verify the deployment

1. `curl https://<backend>/health` returns `{"status":"ok"}`.
2. Open the Netlify site with the browser console open — API calls must go to the Render URL, not localhost, with no CORS errors.
3. Register a throwaway user: you should land on the AI-literacy survey; completing it should drop you into topic 1 with the scenario message auto-sent and an agent reply arriving.
4. Check the Render logs for OpenAI errors — a bad `OPENAI_API_KEY` does **not** stop the deploy; it silently produces canned fallback replies (see [ARCHITECTURE.md §8.2](./docs/ARCHITECTURE.md#82-chat-message-the-core-loop)).

### Operational notes

- **Cold starts:** on Render's free tier the backend sleeps after idle; the first request takes ~30–60s. The frontend already waits on `/health` before auth/admin calls, so users see a "waking up" delay, not an error.
- **Auto-deploy:** both platforms redeploy on every push to `main`, and **no tests or lint run anywhere in that path** — a broken commit goes straight to the live study.
- **Database changes** never deploy automatically: after a push that adds a migration, run `npm run migrate` again (step 3).
- Netlify serves path-based deep links via the SPA redirect, but the app itself uses hash routing (`/#/admin`); a plain `/admin` visit is redirected by the app.

Architecture-level detail and the reasons behind these settings: [ARCHITECTURE.md §11](./docs/ARCHITECTURE.md#11-deployment).

## Research data

- All messages, survey responses, and progression state live in PostgreSQL — see the [data model](./docs/ARCHITECTURE.md#7-data-model).
- Survey question *text* lives in `src/data/mockData.ts` (live code, despite the name); the database stores question IDs (`lit-1…8`, `post-1…16`) and values, so analysis joins against that file.
- The admin dashboard exports CSVs client-side; `data_folder_private/` (git-ignored) holds standalone SQL for direct database queries.

## Known issues

The platform has significant known issues — including a guaranteed error on every participant's final survey submission and deviations of the seeded agent matrix from the intended 3×3 EQ×CQ design. (The critical security issues around the admin API, CORS, and database TLS were fixed in August 2026; credential rotation for previously leaked keys is still on the owner.) Before operating or extending the platform, read **[ARCHITECTURE.md §14 — Known issues & code health](./docs/ARCHITECTURE.md#14-known-issues--code-health)**.

## Contributing / editing

Standard local workflow: clone, `npm install` in both the root and `backend/`, and use any IDE. The project can also still be edited through its Lovable project (changes sync to this repo).
