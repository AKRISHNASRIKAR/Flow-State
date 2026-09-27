# CLAUDE.md — Persistent context for FlowState

> Loaded at the start of every session. Deep reference: **`PROJECT_OVERVIEW.md`**. Coding rules: **`AGENTS.md`**. Keep this file current — if you change architecture or status, update it in the same commit.

## Project summary

**FlowState** — self-hosted workflow automation engine (a Zapier/n8n-style engine you own). A **Workflow** has exactly one **Trigger** and an ordered chain of **Actions**. On trigger, an event is emitted, a `WorkflowExecution` row is created, and a BullMQ job runs the chain, persisting one `ActionExecution` row per step.

**Naming:** the directory is `flowforge/` but the product was renamed **FlowState** in `f47ee0e`. The old name survives in `X-FlowForge-Signature` (load-bearing — never rename), the Swagger title, and docker-compose container names.

**Emphasis:** reliability over integration breadth. Only 5 action types, but full HMAC verification, idempotency, rate limiting, retries, DLQ, per-step records, and audit logging.

> Stack, dependencies, and workspace names: read `package.json` at the root and in `backend/`, `frontend/`, `packages/api-types`. Two things the manifests don't tell you: `packages/api-types` has **no build step** (consumers import TS source directly), and the only third-party integrations are Resend (email) and the Telegram Bot API.

## Current architecture

```
Webhook / Manual / Poll
        ↓ emit 'workflow.triggered'
  TriggeredListener        ← admission: workflow ACTIVE? concurrency < 3? rate limit < 100/hr?
        ↓ create WorkflowExecution (PENDING) + enqueue (jobId = executionId)
  BullMQ 'workflow-execution' (Redis, attempts: 3, exp backoff)
        ↓
  WorkflowProcessor        ← actions by position ASC; one ActionExecution row per step
        ↓
  ActionExecutorService    ← Map<type, IActionExecutor>; interpolates {{payload.x}} centrally
        ↓
  5 executors: LOG_MESSAGE · DELAY · HTTP_REQUEST · SEND_EMAIL · TELEGRAM_NOTIFY
```

**Core rule: ingress never executes.** Controllers validate → persist → emit → return.

**Two runtimes, one API.** The diagram is the NestJS backend (`backend/`, on Render). `worker/` is the same REST API and engine on **Cloudflare** — Hono + Workflows (one durable instance per run, one `step.do` per step) + Durable Objects (`Poller` per SCHEDULED trigger, `RateLimiter` per user, `OneTimeStore` for sign-in state) + **D1** (Cloudflare's SQLite; schema in `worker/migrations/`, a separate database from the backend's Postgres). All of it runs on the **Workers Free plan**, and `wrangler dev` runs it locally with no account. Same routes, JSON and errors (49/50 endpoints byte-identical in a side-by-side check), same JWT secrets and refresh-token hashing, so sessions work on either. Both import the engine's logic from framework-free files in `backend/src` (executors via `actions/run-action.ts`, `scheduler/poll-change.ts`, `webhooks/webhook-signature.ts`, `telegram/telegram-bot.ts`, `auth/refresh-token-hash.ts`, `auth/google/google-oauth.ts`, `common/crypto/token-cipher.ts`, `common/limits.ts`). Deploy guide: `worker/README.md`.

Second queue: `polling` (repeatable jobs) → `PollingWorker` → detects change → emits the same event.

Redis also holds poll state (`poll:state:<triggerId>`, 24h TTL) rate limits (`rate:exec:<userId>:<hour>`), and single-use Google sign-in state (`oauth:google:state:*`, 10 min; `oauth:google:handoff:*`, 60 s — read with `GETDEL`).

## Implementation status

| Area | Status |
|---|---|
| Auth — Google sign-in only (PKCE, nonce-bound handoff), rotating refresh tokens, global guard | ✅ Complete |
| Credential store (`connections`, AES-256-GCM tokens) | ⚠️ Stores Google tokens at sign-in; no refresh/use path yet |
| Workflow CRUD (soft delete, clone, pause/resume) | ✅ Complete |
| Actions + reorder (linear chain) | ✅ Complete |
| Triggers: WEBHOOK / MANUAL / SCHEDULED | ✅ Complete |
| Webhook ingress (HMAC + idempotency) | ✅ Complete — strongest area |
| Polling (3 change modes) | ✅ Complete |
| Execution engine (retry + DLQ, resume-from-failure, payload chaining) | ✅ Complete |
| Dashboard | ✅ Redesigned: trigger set up on the canvas (side `Drawer`), per-workflow setup checklist, "What's new" panel, On/Off switches, plain-language statuses, every error a toast |
| Admin / DLQ | ✅ API only — dashboard page removed in `8034c79` |
| Telegram bot | ✅ Webhook mode (`POST /telegram/webhook`, secret header) on both runtimes; no Telegraf. Still no `User` link |
| Cloudflare runtime (`worker/`) | ✅ **Production.** Full API + engine on D1, Free plan, live at `https://flowstate-api.akrishnasrikar.workers.dev` with Google sign-in configured. Verified end to end on local workerd; SQL tested in CI. Render data not imported (optional, `scripts/postgres-to-d1.mjs`) |
| Conditions / branching | ❌ Schema only, never evaluated |
| Tests | ⚠️ Unit only — `template.util`, `polling-config`, HMAC, `WorkflowProcessor` (stubbed Prisma). No integration/e2e |
| CI | ✅ `.github/workflows/ci.yml` — lint, typecheck, test, build, migration-drift check |
| Deployment | **API: Cloudflare Worker** `flowstate-api` + D1 `flowstate` (id pinned in `worker/wrangler.jsonc`). **Dashboard: Vercel** `https://flow-state-fe.vercel.app`, `NEXT_PUBLIC_API_URL` = the Worker. Google OAuth client in GCP project `flowstate-509818`. Old NestJS API on Render (`flow-state-i6u4.onrender.com`) — to be suspended. Deploy guide: `worker/README.md` |
| Migrations | ✅ Squashed to one baseline (`20260926000000_baseline`); CI rebuilds a fresh DB and fails on drift |

> Build history: `git log --oneline`. Commits are coarse — roughly one per subsystem, in the order listed in the status table above.

## Current priorities

Phase 0 (reproducibility) is done, and **production now runs on Cloudflare** (`worker/`, Free plan) with the dashboard on Vercel. Remaining cut-over: optionally import Render's data, then suspend the Render service — never run both, see high-risk #14. Every API change must land on **both** runtimes (the NestJS backend is the reference and local-dev option); new engine logic goes in the shared `backend/src` modules.

Next up is **Google as the identity + integration platform**: users sign in with Google, and the same OAuth grant powers Gmail / Sheets / Calendar actions and triggers. That needs, in order:

1. ✅ **Sign in with Google** — replaces email+password. The `connections` row *is* the identity (no `googleSub` on `User`).
2. 🟠 **Access-token refresh** for `connections` (single-flight — a Durable Object on the worker, a Redis lock on NestJS; `invalid_grant` → `NEEDS_REAUTH`).
3. 🟠 **Incremental scopes** — a "grant Gmail/Sheets access" flow reusing the same OAuth client, triggered when a user adds a Google action.
4. 🟠 Google actions using the payload-chaining convention below (`gmail`, `sheets`, … keys).
5. 🟠 Google triggers via the existing polling worker (Gmail `historyId` as poll state).

## Known limitations

- **At-least-once per step.** A retry (BullMQ or admin DLQ) resumes at the first action without a `SUCCEEDED` row, using the payload checkpointed in `workflow_executions.output`. The *failing* step itself can still repeat — if it had a side effect before erroring (e.g. a timeout after the remote accepted), that side effect repeats. The UI groups repeated steps into "attempts".
- **`DELAY` blocks a worker slot** on the NestJS engine (the processor sleeps inline). On the Cloudflare worker it's a durable `step.sleep` and holds nothing.
- **Payload chaining is namespaced.** An executor publishes to later steps via `enrichedPayload` under its own key — `HTTP_REQUEST` → `{{payload.http.status}}` / `{{payload.http.body.*}}`. A later step of the same type overwrites it. Only `HTTP_REQUEST` publishes today.
- **Refresh token in `localStorage`** (XSS-exposed); documented trade-off while API and frontend are on different origins.
- **No per-endpoint rate limiting** — `/auth/google/start` is unthrottled (each call writes a 10-minute Redis key).
- **SSRF surface** — `HTTP_REQUEST` and polling fetch arbitrary user URLs with no allowlist.
- **Shared credentials** — one Resend key and one Telegram bot for all users.
- Polling minimum 30s. Google is the only sign-in (no fallback if Google is down or unconfigured). `conditions` table unused. `Workflow.version` never incremented. `Trigger.enabled` has no API.

## Coding standards

- **Strict TypeScript, no `any`.** Narrow `unknown` (`isRecord`, `resolvePath` idioms).
- **Comments explain *why*, never what.** If you change behaviour a comment describes, update the comment in the same edit.
- Files: `kebab-case.<role>.ts` (backend), `PascalCase.tsx` (components), `kebab-case.ts` (frontend libs).
- DB `snake_case` via `@map`; Prisma/API `camelCase`.
- Magic numbers → named module-level constants.
- Services `serialize()` before returning; never leak raw Prisma models.
- Executors never throw — return `ActionResult`.
- Every external call gets an `AbortController` timeout.
- Frontend: TanStack Query for server state, Zustand for client state, `components/ui.tsx` primitives only.
- Frontend errors: never `onError: toast.error(...)` — set `meta: { errorContext }` and the global handler in `app/providers.tsx` toasts it (details in `AGENTS.md` §Frontend).
- Shipping a user-visible feature? Add a `lib/changelog.ts` entry in the same change — and only for things that work end to end.

## Design philosophy

1. Reliability over breadth.
2. Document shortcuts in code **and** README — never hide them.
3. Constrain the UI to what the engine can actually do (hence the vertical list, not a DAG editor).
4. Let infrastructure enforce invariants (unique constraints, atomic `INCR`, queue locks) rather than application checks.
5. Fail visibly, not destructively (unresolved templates stay visible; audit failures never abort the audited operation).

## Commands

```bash
pnpm install
docker compose up -d                      # Postgres + Redis (app services NOT included)
pnpm dev                                  # both apps
pnpm dev:api                              # API only  (:3000 — use PORT=3001 if taken)
pnpm dev:web                              # dashboard (:5173)
pnpm build | pnpm lint | pnpm test

pnpm --filter api exec prisma migrate dev --name <name>
pnpm --filter api prisma:studio
pnpm --filter api exec prisma generate

# Cloudflare worker — free, no account needed locally (see worker/README.md)
pnpm --filter worker db:migrate:local     # create the local D1 tables (once)
pnpm --filter worker dev                  # :8787, real workerd + D1 + Workflows + DOs
pnpm --filter worker test                 # every worker SQL query against a D1 built from migrations/
pnpm --filter worker build                # bundle exactly as deploy would
DATABASE_URL=… node worker/scripts/postgres-to-d1.mjs > data.sql   # copy Postgres data into D1

# Production (from worker/, needs `npx wrangler login`)
pnpm run db:migrate:remote                # apply new D1 migrations — before deploying code that needs them
pnpm run deploy                           # deploy the Worker
npx wrangler tail                         # live production logs
npx wrangler d1 execute flowstate --remote --command "SELECT …"
```

Swagger: `http://localhost:3000/api/docs` · Dashboard: `http://localhost:5173`

## Environment variables

Single `.env` at the repo root (backend reads `['.env', '../.env']`).

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres |
| `REDIS_URL` | ✅ | Or `REDIS_HOST`/`PORT`/`PASSWORD`/`DB` |
| `JWT_ACCESS_SECRET` | ✅ | `getOrThrow` |
| `JWT_REFRESH_SECRET` | ✅ | `getOrThrow` |
| `TELEGRAM_BOT_TOKEN` | Optional | Needed for `TELEGRAM_NOTIFY` and the bot's replies. Not needed to boot |
| `TELEGRAM_WEBHOOK_SECRET` | With the bot | Must equal the `secret_token` given to `setWebhook`; unset → `/telegram/webhook` refuses everything |
| `RESEND_API_KEY` / `RESEND_FROM_ADDRESS` | Optional | `SEND_EMAIL` fails gracefully without it |
| `ADMIN_SECRET` | Optional | Unset → `/admin` returns 401 (never fails open) |
| `PORT`, `CORS_ORIGIN`, `WORKER_CONCURRENCY` | Optional | Defaults 3000 / `http://localhost:5173` / 5 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ to sign in | Missing → API boots, `/auth/google/start` returns 503 |
| `CREDENTIALS_ENCRYPTION_KEY` | ✅ to sign in | 32 bytes base64. **Rotating it orphans every stored Google token** |
| `GOOGLE_REDIRECT_URI` | Optional | Default `http://localhost:$PORT/auth/google/callback`; must match the Google client exactly |
| `FRONTEND_URL` | Optional | Default `http://localhost:5173`; post-sign-in redirect target |
| `NEXT_PUBLIC_API_URL` | Frontend | Defaults `http://localhost:3000`; baked in at build; trailing slashes stripped. Production: the Worker URL (set on Vercel) |

**The Worker doesn't read `.env`.** Locally: `worker/.dev.vars` (template `.dev.vars.example`; it also overrides the production URLs in `wrangler.jsonc` `vars` with localhost ones). Production: public config in `worker/wrangler.jsonc` `vars` (`FRONTEND_URL`, `CORS_ORIGIN`, `GOOGLE_REDIRECT_URI`), secrets via `npx wrangler secret bulk .secrets.production.env` from `worker/` (gitignored file — delete after). It has no `DATABASE_URL`/`REDIS_*`/`PORT`/`WORKER_CONCURRENCY`. The production JWT secrets and `CREDENTIALS_ENCRYPTION_KEY` were freshly generated and differ from Render's.

## Database overview

PostgreSQL, 12 models, all UUID PKs, all `snake_case` via `@@map`.

`users` · `connections` (**`@@unique([provider, providerAccountId])`** = the Google identity; `@@unique([userId, provider])`) · `refresh_tokens` (self-relation rotation chain) · `workflows` · `triggers` (`workflowId @unique` = one per workflow) · `webhook_events` (**`@@unique([workflowId, idempotencyKey])`** = race-safe dedup) · `polling_events` · `conditions` (unused) · `actions` (`position` ASC = order) · `workflow_executions` · `action_executions` (one row **per step per attempt**) · `audit_logs` (`action` is TEXT, not the enum) · `telegram_users` (**no FK to `users`**).

Enums: `WorkflowStatus` (DRAFT/ACTIVE/PAUSED/ARCHIVED) · `ExecutionStatus` (PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED) · `TriggerType` (WEBHOOK/MANUAL/SCHEDULED) · `ConnectionProvider` (GOOGLE) · `ConnectionStatus` (ACTIVE/NEEDS_REAUTH) · `AuditAction`.

**Soft delete:** `DELETE /workflows/:id` sets `ARCHIVED`; reads filter it out via `findVisibleOwnedWorkflow`.

## Important services

| Service | Responsibility |
|---|---|
| `AuthService` | `startSession`, token pair issue, SHA-256-hashed rotation chain (`refresh-token-hash.ts`) |
| `GoogleAuthService` | OAuth start/callback/exchange, user + `Connection` upsert, account linking |
| `WorkflowsService` | CRUD, soft delete, clone (fresh secret, DRAFT), poller sync |
| `ActionsService` | Chain CRUD, transactional reorder |
| `TriggersService` | Upsert with secret preservation, masking, poller registration |
| `WebhooksService` | HMAC, idempotency, event log, manual fire |
| `TriggeredListener` | Admission control → durable queue |
| `WorkflowProcessor` | Runs the chain; retry/DLQ bookkeeping |
| `ActionExecutorService` | Strategy registry + central interpolation |
| `SchedulerService` / `PollingWorker` | Repeatable pollers, change detection |
| `ExecutionsService` | History, stats, cancel |
| `AuditLogService` | Fire-and-forget, **never throws** |

## Debugging

| Symptom | Check |
|---|---|
| Webhook returns 200 but nothing runs | `webhook_events.status` — `SKIPPED*` means workflow inactive, concurrency cap, or rate limit |
| HMAC always fails | Raw-body middleware in `main.ts` — global body parsing on `/webhooks` breaks signatures |
| Executions stuck `PENDING` | Redis reachable? Worker running? `GET /health` → `queueDepth` / `workers` |
| Failed runs vanish | They're in the DLQ — `GET /admin/failed-jobs` (needs `ADMIN_SECRET`) |
| Poller never fires | First poll only baselines. Then: trigger `SCHEDULED` + `enabled`, workflow `ACTIVE`, and `poll:state:*` in Redis |
| Template renders `{{payload.x}}` literally | Path unresolvable — deliberate fail-soft, check the actual payload in the execution detail |
| Random logouts | Concurrent refresh spending the one-time token — verify single-flight in `api-client.ts`. An *unreachable* API must return `'unreachable'` from `refreshSession`, never clear the session |
| "Test run" is greyed out | Workflow is off, or has no trigger — manual fire requires `ACTIVE` (404s otherwise) |
| An error toast never appears in a background tab | Expected: React Query pauses retries while the tab is hidden and resumes on focus |
| 400 on a valid-looking body | `forbidNonWhitelisted` — the field isn't on the DTO |
| App won't boot | Port 3000 taken (use `PORT=3001`) |
| Sign-in button → Google says "OAuth client was not found" / `redirect_uri_mismatch` | `GOOGLE_CLIENT_ID` wrong, or `GOOGLE_REDIRECT_URI` isn't listed on the Google client. Pasted IDs/secrets have lost their **first character** here twice — load them from the client's downloaded JSON instead. The live ID is visible in the `client_id=` of `/auth/google/start`'s redirect |
| Dashboard sign-in goes to the wrong API (e.g. Render) | `NEXT_PUBLIC_API_URL` is baked in at build: change it on Vercel **and redeploy**, then hard-refresh (an open tab keeps the old bundle). `curl` the live `/_next/static` JS to see which URL a build contains |
| Worker: `no such table` | D1 migrations not applied — `pnpm --filter worker db:migrate:remote` (`/health` says `db: up` without tables) |
| Worker: logs / errors in production | `npx wrangler tail` in `worker/`, or the dashboard's Workers → flowstate-api → Logs (observability is on) |
| Sign-in lands on `/login?error=state_expired` | Took >10 min on Google's screen, or the callback was replayed |
| Callback page says the link expired | Handoff is 60 s and single-use; or the sign-in was started in another tab (nonce is per-tab) |

## High-risk areas

Change these only with care (full list in `AGENTS.md` §19):

1. `main.ts` raw-body middleware — breaking it disables all HMAC verification **silently**.
2. `verifyHmac` — `timingSafeEqual`, never `===`.
3. `X-FlowForge-Signature` header name — renaming breaks live senders.
4. `@@unique([workflowId, idempotencyKey])` — the whole dedup guarantee.
5. `WorkflowProcessor`'s rethrow and the `attemptsMade < maxAttempts` guard.
6. Single-flight refresh in `api-client.ts`.
7. `AdminGuard` throwing when `ADMIN_SECRET` is unset.
8. Prisma schema without a matching migration — broke twice before the baseline squash; CI's drift check now catches it.
9. The `output` checkpoint in `WorkflowProcessor` — it must be written in the same transaction that marks a step `SUCCEEDED`, or a retry resumes with the wrong payload.
10. Google sign-in's nonce check in `GoogleAuthService.exchangeHandoff` and `sanitizeReturnTo` — removing either reopens login CSRF / open redirect.
11. `CREDENTIALS_ENCRYPTION_KEY` — rotating it without re-encrypting makes every stored Google token undecryptable.
12. Worker (D1) conventions — timestamps are ISO-8601 UTC text from `now()` in `worker/src/db.ts`, never SQL `CURRENT_TIMESTAMP`; IDs come from `crypto.randomUUID()`; atomic writes go in one `db.batch()` (D1 has no interactive transactions). Schema changes are a new file in `worker/migrations/`, mirrored in `backend/prisma` while the NestJS backend still runs.
13. Shared `backend/src` files the worker imports must stay free of NestJS/Prisma — a Nest import still bundles, then fails at runtime in workerd.
14. Don't run the NestJS backend and the worker against one database at the same time in production — both poll SCHEDULED triggers, so every change would start two runs.

## Recent architectural decisions

| Decision | Why |
|---|---|
| Vite → Next.js App Router (`a5770de`, `3566534`) | App Router structure; `pages/` renamed to `views/` with thin route wrappers |
| Turborepo + `packages/api-types` (`3566534`) | Stop backend/frontend type drift; shared types, no build step |
| Idempotency fingerprint excludes timestamps | Correct dedup across real provider retry windows (GitHub 60s, Stripe 30–90s) |
| Canvas is a vertical list, not a DAG editor | The engine runs a strict linear chain — the UI must not promise more |
| Trigger lives on the canvas, edited in a side drawer (no Trigger tab) | The Flow tab used to be empty until a trigger was set on another tab. `?tab=trigger` still opens the drawer |
| Setup checklist order: trigger → step → **on** → test | Manual fire is refused unless `ACTIVE`, so testing must come after turning on |
| One global error → toast handler (`QueryCache`/`MutationCache`) | ~20 copy-pasted `onError`s, and queries that failed silently, collapsed into one place |
| Admin auth = shared secret, not a role | No admin role on `User`; single-tenant. Fails closed when unset |
| `DELAY` blocks inline | Deliberate simplification, documented in the processor and the executor |
| Migrations squashed to one baseline (`20260926000000_baseline`) | History couldn't build a fresh DB; no production data to preserve. An existing dev DB needs its three old `_prisma_migrations` rows deleted, then `prisma migrate resolve --applied 20260926000000_baseline` |
| Retries resume from the failed step | Google write actions (send mail, append row) must not repeat on retry; `output` doubles as the payload checkpoint |
| Google is the only identity provider | One OAuth grant for sign-in *and* app access, so users never connect Google twice. Sign-in requests identity scopes only; app scopes come incrementally |
| Nonce-bound handoff code, not tokens in the redirect | API and dashboard are cross-origin, so no shared cookie; tokens in a URL leak to history. The `sessionStorage` nonce ties the flow to the initiating tab (login-CSRF defence) |
| ID token claims read without signature check | It came straight from Google's token endpoint over TLS (OIDC Core §3.1.3.7) — avoids a JWKS dependency. **Never reuse that helper on a browser-supplied token** |
| Telegram in webhook mode, not long polling | No always-running process — required for Workers, and a sleeping Render instance just wakes on the request |
| Refresh tokens hashed with SHA-256, not argon2 | They're random 122-bit JWT ids — nothing to brute-force, so a slow hash adds nothing, and argon2 is a native module Workers can't load. Pre-switch sessions end once |
| Worker on D1, not Postgres + Hyperdrive | Keeps the whole backend on Cloudflare's Free plan and local dev account-free. Separate schema (`worker/migrations/`); `scripts/postgres-to-d1.mjs` moves existing data once |
| Pollers on Durable Object alarms, not Cron | Cron's minimum is 1 minute; FlowState allows 30s polling |

## Open TODOs

- 🟠 Link `TelegramUser` → `User`.
- 🟠 `enrichedPayload` for the remaining executors (`SEND_EMAIL` → message id, etc.).
- 🟠 Validate action `type` against the executor registry at write time.
- 🟠 Add the global exception filter that `ApiErrorResponse` already describes.
- 🟠 `POST /workflows/:id/trigger/rotate-secret` (referenced in a comment, doesn't exist).
- 🟡 Integration test for `WorkflowProcessor` against real Postgres + Redis (unit spec uses stubs).
- 🟡 Move the 4 ad-hoc Redis clients onto the shared `RedisModule` (`REDIS_CLIENT`) — only auth uses it so far.
- 🟡 Indexes on `workflow_executions.status` / `.created_at`.
- 🟡 Extract the duplicated pagination helper and rate-limit key builder.

## Roadmap

- **Phase 0 — Reproducibility:** ✅ migrations, comment fix, Telegram boot, first tests, CI, resume-on-retry, payload chaining (HTTP).
- **Phase 1 — Make advertised features real:** non-blocking DELAY, type validation, exception filter, secret rotation, indexes.
- **Phase 2 — Conditions & branching:** evaluate the dormant `conditions` table; the canvas becomes a real DAG editor **only** at this point.
- **Phase 3 — Scale:** separate worker process, idempotency keys for the failing step itself, per-action retry policy, metrics + structured logs.
- **Phase 4 — Multi-tenancy:** orgs/roles, per-user credential vault (**being pulled forward** for Google), workflow versioning via the dormant `version` column, templates via `clone`.
- **Phase 5 — Integration breadth:** deliberately last, after the credential vault exists.

## Working notes

- The user commits their own checkpoints — **don't commit unless asked.** Git state can change mid-session.
- Port 3000 is often taken on this machine; use `PORT=3001` to smoke-test.
- **Secrets never go through chat, command arguments, or logs.** Generate them with `openssl rand` straight into the gitignored `worker/.secrets.production.env`, upload with `wrangler secret bulk`, delete the file. Check pasted values by shape (length, prefix) without printing them.
- `python3` on this machine is blocked by an unaccepted Xcode license — script with `node` instead.
- Wrangler is logged in (OAuth) as the account that owns `flowstate-api`; deploy with `pnpm run deploy` from `worker/` (`pnpm deploy` is a different built-in).
- pnpm is strict: a direct import must be a declared dependency of that workspace.
- `docs/` is gitignored (`.gitignore:64`) — never assume anything there is shared with collaborators or CI, and don't put decisions there that belong in these root docs.
- **Don't build UI for backend features that haven't landed.** The dashboard is complete for what the engine actually does; conditions/branching and any Google/RSS/AI integrations have no backend, so no UI for them until they do.
