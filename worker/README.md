# FlowState on Cloudflare

The whole FlowState backend — API, execution engine, scheduling and database —
as one Cloudflare Worker, entirely on the **Workers Free plan**. It serves the
same REST API as the NestJS backend (`backend/`) — same routes, same JSON, same
errors — so the dashboard works against either without changes.

| NestJS backend (Render) | This Worker |
|---|---|
| NestJS + Express | [Hono](https://hono.dev) |
| Postgres + Prisma | **D1** (Cloudflare's SQLite) — schema in `migrations/`, queries in `src/repo/` |
| BullMQ queue + `WorkflowProcessor` | **Workflows** — one durable instance per run, one `step.do` per step (`src/engine/run-workflow.ts`) |
| Redis rate limit (`INCR`) | `RateLimiter` Durable Object, one per user |
| Redis `GETDEL` for sign-in state | `OneTimeStore` Durable Object |
| BullMQ repeatable jobs + Redis poll state | `Poller` Durable Object per SCHEDULED trigger — its alarm is the timer |
| — | Cron every 15 min re-arms pollers (safety net) |

The engine's logic isn't duplicated: step executors, templating, polling change
detection, webhook HMAC, Google sign-in helpers, token encryption and the
Telegram bot are imported straight from `backend/src` (framework-free files —
see "Rules" below).

**Behaviour differences** (all improvements or neutral):
- A **Wait** step is a durable `step.sleep` — it no longer occupies a worker for its whole duration.
- Retries are **per step** (3 attempts, 2s → 4s backoff). Steps that already succeeded are never re-run.
- A run that exhausts its retries simply ends **FAILED**; `/admin/failed-jobs` lists those, and retrying one starts a new instance that resumes after the steps that succeeded.
- No Swagger UI (the NestJS backend still serves `/api/docs`).

## This deployment

| | |
|---|---|
| API | `https://flowstate-api.akrishnasrikar.workers.dev` (`/health` → `"db":"up"`) |
| Database | D1 `flowstate`, id pinned in `wrangler.jsonc` |
| Dashboard | `https://flow-state-fe.vercel.app` (Vercel, `NEXT_PUBLIC_API_URL` = the API above) |
| Google OAuth | GCP project `flowstate-509818`, client `flowstate`; redirect URI `…workers.dev/auth/google/callback` |
| Secrets set | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` (freshly generated, not Render's), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Not set yet | `RESEND_*`, `TELEGRAM_*`, `ADMIN_SECRET` — email/Telegram steps and `/admin` are off until added |

List what's set with `npx wrangler secret list` (names only).

## Cost: free

Everything used here is on the **Workers Free plan** — Workers, D1, Workflows,
Durable Objects (SQLite-backed) and Cron. Local development costs nothing and
needs no account. Free-plan limits that matter at FlowState's scale:

| Limit (Free plan) | Value | What it means here |
|---|---|---|
| Requests | 100,000 / day | API calls + webhooks + Telegram |
| CPU per request, step, alarm | 10 ms | Waiting on D1 or `fetch` doesn't count; FlowState's own work is JWT checks, AES and JSON |
| D1 queries per request | 50 | Multi-row writes (clone, reorder) are one batch; the reconcile cron re-arms up to ~49 polling workflows per run |
| Workflow runs | 100,000 / day | One per run |
| D1 size | 500 MB per database | |

Past those, the $5/month Workers Paid plan lifts them — no code changes.

## Run it locally (free, no account)

```bash
cp worker/.dev.vars.example worker/.dev.vars   # fill in the secrets you have (it also points the URLs at localhost)
pnpm --filter worker db:migrate:local          # create the local D1 tables (once)
pnpm --filter worker dev                       # http://localhost:8787 — real workerd, D1, Workflows, DOs, alarms
```

Run the dashboard against it with `NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm dev:web`.
Trigger the reconcile cron with `wrangler dev --test-scheduled` and
`curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"`.
Query the local database: `npx wrangler d1 execute flowstate --local --command "SELECT count(*) FROM workflows"`.

Checks: `pnpm --filter worker lint` (types), `pnpm --filter worker test` (every
SQL query against a D1 built from `migrations/` — also runs in CI), and
`pnpm --filter worker build` (bundles exactly as `deploy` would).

## Deploy

From `worker/`:

1. `npx wrangler login`
2. **Set the URLs** in `wrangler.jsonc` → `vars`: `FRONTEND_URL` and `CORS_ORIGIN` (the dashboard), and `GOOGLE_REDIRECT_URI` = `https://flowstate-api.<your-subdomain>.workers.dev/auth/google/callback`. These are production values; `.dev.vars` overrides them for `wrangler dev`.
3. **Deploy**: `pnpm run deploy` (not `pnpm deploy`, a different built-in pnpm command). A deploy with no `database_id` **creates the D1 database**; Wrangler doesn't write the id back, so copy it from the deploy or `db:migrate:remote` output into `wrangler.jsonc` and commit it. (Already done for this repo's `flowstate` database — a fork should delete that `database_id` line first.)
4. **Create the tables**: `pnpm run db:migrate:remote`.
5. **Secrets**: fill in `.secrets.production.env` (gitignored), then `npx wrangler secret bulk .secrets.production.env` and delete the file. Required: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Generate the first three with `openssl rand` straight into the file; take the Google pair from the client's **downloaded JSON**, not by copy-pasting (a dropped first character gives "OAuth client was not found"). Quoted values are fine.
6. **Check**: `curl https://flowstate-api.<subdomain>.workers.dev/health` → `"db":"up"`.
7. **Google Console**: add the `GOOGLE_REDIRECT_URI` from step 2 to the OAuth client's *Authorised redirect URIs*.
8. **Dashboard**: set its `NEXT_PUBLIC_API_URL` to the Worker's URL and rebuild (Vercel: env var + Redeploy; or Cloudflare: `NEXT_PUBLIC_API_URL=… pnpm --filter web cf:deploy`). It's baked in at build time, so an already-open tab keeps calling the old API until a hard refresh.
9. **Telegram** (optional): add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` as secrets, then
   `curl "https://api.telegram.org/bot<token>/setWebhook" -d url=https://…workers.dev/telegram/webhook -d secret_token=<secret>`.

## Moving from the Render backend

1. **Copy the data** (read-only on Postgres; needs `psql`), into the *empty* D1 created in step 4 above:
   ```bash
   DATABASE_URL="<Render external URL>" node scripts/postgres-to-d1.mjs > flowstate-data.sql
   npx wrangler d1 execute flowstate --remote --file=flowstate-data.sql
   ```
2. **Secrets:** reusing Render's `JWT_*` secrets would keep sessions alive, but the SHA-256 refresh-token switch ends them once anyway, so this deployment uses fresh ones — everyone signs in again. Reuse Render's `CREDENTIALS_ENCRYPTION_KEY` only if Render stored Google tokens you need; otherwise imported Google tokens become unreadable — harmless today, since nothing uses them yet, but a future Google feature will need those users to re-grant access.
3. Switch the dashboard (step 8), repoint Telegram (step 9), then **suspend the Render service**.

⚠️ **Don't leave both running.** Each polls SCHEDULED triggers on its own, so
while both are up a changed URL starts two runs. After the switch each
poller's first tick only records a baseline, so the move itself never fires a
run. Anything written to Postgres after the export stays behind — export
right before switching.

## Rules for changing this code

- **Schema changes** are a new file in `migrations/` (`npx wrangler d1 migrations create flowstate <name>`), never an edit to an applied one. Update `src/repo/` to match; `pnpm --filter worker test` fails until you do. While the NestJS backend still runs, mirror the change in `backend/prisma` too.
- **Timestamps** are ISO-8601 UTC strings — always `now()` from `src/db.ts`, never SQL `CURRENT_TIMESTAMP` (a different format that sorts differently).
- **IDs** are generated in the Worker (`crypto.randomUUID()`); no column has a database default for them.
- **Atomic writes** go in one `db.batch([...])` — D1 has no interactive transactions. Uniqueness races are settled by the unique constraints, not by read-then-write checks.
- **Workflow code** outside `step.do` re-runs on every replay; keep all I/O inside steps (`src/engine/run-workflow.ts`).
- **Shared code:** every `backend/src` file the Worker imports — directly, or through them (e.g. `run-action.ts` → the executors and `template.util.ts`) — must stay framework-free: no NestJS, no Prisma. A Nest import would still bundle, then fail at runtime in workerd, so nothing but this rule catches it.
