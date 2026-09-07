# Study 1 (v1) archive

Everything in this folder describes the **retired Study 1 platform** (the login-based, 20-topic,
9-agent version that ran from January 2026 to August 2026). It was moved here on 2026-09-07 when
the platform was rewritten as the single-session Study 2 (v2). Nothing in this folder describes
the current code.

Use these files only to understand *history*: what was deployed when, which incidents happened,
and how they were handled at the time.

## Read this before relying on anything here

- **Stale by construction.** The files were written incrementally during the v1 build-out and were
  already partly contradicted by later v1 code (see the "Documentation drift" notes in the v1
  architecture guide at git tag `snapshot-2026-08-30`). Endpoints, tables, environment variables
  (`JWT_SECRET`, `/api/auth/*`, `users`, `topics`, ...) and screens they mention no longer exist.
- **Credentials that appear in these files are compromised.** Several deployment and fix logs
  quoted live connection strings and API keys at the time they were written. Some values have
  since been redacted, others have not, and all of them remain in git history. Treat every
  secret-looking value in this folder as burned: never reuse one, and rotate anything that has
  not been rotated yet.
- **Not maintained.** These files will not be updated. If something here is useful for v2, the
  place to write it is the current documentation, not this folder.

## Where the current documentation lives

| Topic | Document |
|---|---|
| How the v2 platform works (start here) | [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| API contract (authoritative) | [`docs/STUDY2_API.md`](../../STUDY2_API.md), summarised in [`docs/API.md`](../../API.md) |
| Design decisions and the plan behind v2 | [`docs/STUDY2_PLAN.md`](../../STUDY2_PLAN.md) |
| Researcher dashboard and CSV exports | [`docs/ADMIN_GUIDE.md`](../../ADMIN_GUIDE.md) |
| Backend setup and scripts | [`backend/README.md`](../../../backend/README.md) |

## Where the Study 1 data and code went

- **Code:** git tag `snapshot-2026-08-30` (and branch `snapshot/main-2026-08-30-pre-deep-changes`)
  is the last v1 state of both repositories.
- **Data:** the full Study 1 database export is in `data_folder_private/export_2026-08-30/`
  (git-ignored; lives only on the owner's machine and backups). The production database itself was
  wiped and recreated with the v2 schema.

## What is in this folder

Root-level files (the repository root of v1):

| Group | Files |
|---|---|
| Deployment guides and checklists | `RENDER_DEPLOYMENT_GUIDE.md`, `RENDER_DEPLOYMENT_CHECKLIST.md`, `RENDER_BUILD_FIX.md`, `RENDER_BUILD_FIX_INSTRUCTIONS.md`, `RENDER_FIX_ROOT_DIRECTORY.md`, `NETLIFY_DEPLOYMENT_GUIDE.md`, `NETLIFY_ENV_VAR_SETUP.md`, `NETLIFY_REDEPLOY_GUIDE.md`, `DEPLOYMENT_FIX.md`, `DEPLOYMENT_SUMMARY.md`, `QUICK_DEPLOYMENT_FIX.md`, `GITHUB_PUSH_GUIDE.md` |
| Incident and fix logs | `BACKEND_CONNECTION_FIX.md`, `DATABASE_CONNECTION_FIX.md`, `CONNECTION_DEBUG.md`, `LOGIN_ERROR_FIX.md`, `QUICK_FIX.md`, `QUICK_FIX_AUTH_ERROR.md`, `FIX_CHAT_AND_INTELLIGENCE_LEVELS.md`, `REMOVE_AGENT_INTRO_AND_FIX_CHAT.md`, `PASSWORD_RECOVERY_AND_STIMULUS_FIX.md`, `TESTING_BACKEND_CONNECTION_FIXES.md`, `NEXT_STEPS_AFTER_FIX.md`, `GIT_SECRET_FIX.md`, `TROUBLESHOOTING.md` |
| Feature implementation summaries | `HIGH_PRIORITY_IMPLEMENTATION_SUMMARY.md`, `MEDIUM_PRIORITY_IMPLEMENTATION_SUMMARY.md`, `QUICK_WINS_AND_CRITICAL_IMPLEMENTATION_SUMMARY.md`, `LOGOUT_IMPLEMENTATION_SUMMARY.md`, `PASSWORD_RECOVERY_IMPLEMENTATION.md`, `FRONTEND_INTEGRATION.md`, `FIXES_APPLIED.md`, `INTELLIGENCE_LEVELS_UPDATE.md`, `API_KEY_UPDATE_COMPLETE.md`, `UPDATE_API_KEY_SUMMARY.md` |
| PRD reviews | `PRD_COMPLIANCE_CHECK.md`, `PRD_DISCREPANCY_REPORT.md`, `DISCREPANCIES_CHECK.md`, `RECOMMENDATIONS.md` |
| Database access notes | `DATABASE_ACCESS_GUIDE.md`, `HOW_TO_VIEW_DATABASE_DATA.md`, `QUICK_DATABASE_VIEWER.md`, `view-database-data.ps1` |

`backend/` (the v1 `backend/` directory notes): `CURRENT_STATUS.md`, `DEBUG_LOGIN.md`,
`ENV_CONFIGURATION.txt`, `ENV_SETUP_CHECKLIST.md`, `QUICK_START.md`, `SETUP_GUIDE.md`.

The v1 API, admin API, database schema and backend implementation documents that used to live in
`docs/` were deleted rather than archived; the tagged snapshot has them.
