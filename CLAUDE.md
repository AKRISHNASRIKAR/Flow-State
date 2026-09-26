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

Second queue: `polling` (repeatable jobs) → `PollingWorker` → detects change → emits the same event.

Redis also holds poll state (`poll:state:<triggerId>`, 24h TTL) and rate limits (`rate:exec:<userId>:<hour>`).

## Implementation status

| Area | Status |
|---|---|
| Auth (Argon2, rotating refresh tokens, global guard) | ✅ Complete |
| Workflow CRUD (soft delete, clone, pause/resume) | ✅ Complete |
| Actions + reorder (linear chain) | ✅ Complete |
| Triggers: WEBHOOK / MANUAL / SCHEDULED | ✅ Complete |
| Webhook ingress (HMAC + idempotency) | ✅ Complete — strongest area |
| Polling (3 change modes) | ✅ Complete |
| Execution engine (retry + DLQ, resume-from-failure, payload chaining) | ✅ Complete |
| Dashboard (7 pages) | ✅ Complete |
| Admin / DLQ | ✅ API only — dashboard page removed in `8034c79` |
| Telegram bot | ⚠️ Partial — no `User` link; boots without a token (dummy token, polling off) |
| Conditions / branching | ❌ Schema only, never evaluated |
| Tests | ⚠️ Unit only — `template.util`, `polling-config`, HMAC, `WorkflowProcessor` (stubbed Prisma). No integration/e2e |
| CI | ✅ `.github/workflows/ci.yml` — lint, typecheck, test, build, migration-drift check |
| Dockerfile / deployment | ❌ None exist |
| Migrations | ✅ Squashed to one baseline (`20260926000000_baseline`); CI rebuilds a fresh DB and fails on drift |

> Build history: `git log --oneline`. Commits are coarse — roughly one per subsystem, in the order listed in the status table above.

## Current priorities

Phase 0 (reproducibility) is done. Next up is **Google as the identity + integration platform**: users sign in with Google, and the same OAuth grant powers Gmail / Sheets / Calendar actions and triggers. That needs, in order:

1. 🟠 **Per-user credential store** (`connections`, encrypted tokens, single-flight refresh) — the Phase 4 vault, pulled forward.
2. 🟠 **Sign in with Google** alongside (or replacing) email+password; `User` gains a Google subject ID.
3. 🟠 Google actions using the payload-chaining convention below (`gmail`, `sheets`, … keys).
4. 🟠 Google triggers via the existing polling worker (Gmail `historyId` as poll state).

## Known limitations

- **At-least-once per step.** A retry (BullMQ or admin DLQ) resumes at the first action without a `SUCCEEDED` row, using the payload checkpointed in `workflow_executions.output`. The *failing* step itself can still repeat — if it had a side effect before erroring (e.g. a timeout after the remote accepted), that side effect repeats. The UI groups repeated steps into "attempts".
- **`DELAY` blocks a worker slot** for its full duration (the processor sleeps inline).
- **Payload chaining is namespaced.** An executor publishes to later steps via `enrichedPayload` under its own key — `HTTP_REQUEST` → `{{payload.http.status}}` / `{{payload.http.body.*}}`. A later step of the same type overwrites it. Only `HTTP_REQUEST` publishes today.
- **Refresh token in `localStorage`** (XSS-exposed); documented trade-off while API and frontend are on different origins.
- **No per-endpoint rate limiting** — `/auth/login` is unthrottled.
- **SSRF surface** — `HTTP_REQUEST` and polling fetch arbitrary user URLs with no allowlist.
- **Shared credentials** — one Resend key and one Telegram bot for all users.
- Polling minimum 30s. Email+password auth only. `conditions` table unused. `Workflow.version` never incremented. `Trigger.enabled` has no API.

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
| `TELEGRAM_BOT_TOKEN` | Optional | Unset → module registers with a dummy token and polling off; `TELEGRAM_NOTIFY` fails at run time |
| `RESEND_API_KEY` / `RESEND_FROM_ADDRESS` | Optional | `SEND_EMAIL` fails gracefully without it |
| `ADMIN_SECRET` | Optional | Unset → `/admin` returns 401 (never fails open) |
| `PORT`, `CORS_ORIGIN`, `WORKER_CONCURRENCY` | Optional | Defaults 3000 / `http://localhost:5173` / 5 |
| `NEXT_PUBLIC_API_URL` | Frontend | Defaults `http://localhost:3000` |

## Database overview

PostgreSQL, 11 models, all UUID PKs, all `snake_case` via `@@map`.

`users` · `refresh_tokens` (self-relation rotation chain) · `workflows` · `triggers` (`workflowId @unique` = one per workflow) · `webhook_events` (**`@@unique([workflowId, idempotencyKey])`** = race-safe dedup) · `polling_events` · `conditions` (unused) · `actions` (`position` ASC = order) · `workflow_executions` · `action_executions` (one row **per step per attempt**) · `audit_logs` (`action` is TEXT, not the enum) · `telegram_users` (**no FK to `users`**).

Enums: `WorkflowStatus` (DRAFT/ACTIVE/PAUSED/ARCHIVED) · `ExecutionStatus` (PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED) · `TriggerType` (WEBHOOK/MANUAL/SCHEDULED) · `AuditAction`.

**Soft delete:** `DELETE /workflows/:id` sets `ARCHIVED`; reads filter it out via `findVisibleOwnedWorkflow`.

## Important services

| Service | Responsibility |
|---|---|
| `AuthService` | Argon2, token pair issue, rotation chain |
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
| Random logouts | Concurrent refresh spending the one-time token — verify single-flight in `api-client.ts` |
| 400 on a valid-looking body | `forbidNonWhitelisted` — the field isn't on the DTO |
| App won't boot | Port 3000 taken (use `PORT=3001`) |

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

## Recent architectural decisions

| Decision | Why |
|---|---|
| Vite → Next.js App Router (`a5770de`, `3566534`) | App Router structure; `pages/` renamed to `views/` with thin route wrappers |
| Turborepo + `packages/api-types` (`3566534`) | Stop backend/frontend type drift; shared types, no build step |
| Idempotency fingerprint excludes timestamps | Correct dedup across real provider retry windows (GitHub 60s, Stripe 30–90s) |
| Canvas is a vertical list, not a DAG editor | The engine runs a strict linear chain — the UI must not promise more |
| Admin auth = shared secret, not a role | No admin role on `User`; single-tenant. Fails closed when unset |
| `DELAY` blocks inline | Deliberate simplification, documented in the processor and the executor |
| Migrations squashed to one baseline (`20260926000000_baseline`) | History couldn't build a fresh DB; no production data to preserve. An existing dev DB needs its three old `_prisma_migrations` rows deleted, then `prisma migrate resolve --applied 20260926000000_baseline` |
| Retries resume from the failed step | Google write actions (send mail, append row) must not repeat on retry; `output` doubles as the payload checkpoint |
| Google is the identity provider (planned) | One OAuth grant for sign-in *and* app access, so users never connect Google twice |
| Telegram via long polling | Works locally without a public webhook URL |

## Open TODOs

- 🟠 `TelegramModule` conditional registration (today it boots with a dummy token instead of not registering).
- 🟠 Link `TelegramUser` → `User`.
- 🟠 `enrichedPayload` for the remaining executors (`SEND_EMAIL` → message id, etc.).
- 🟠 Validate action `type` against the executor registry at write time.
- 🟠 Add the global exception filter that `ApiErrorResponse` already describes.
- 🟠 `POST /workflows/:id/trigger/rotate-secret` (referenced in a comment, doesn't exist).
- 🟡 Integration test for `WorkflowProcessor` against real Postgres + Redis (unit spec uses stubs).
- 🟡 Shared `RedisModule` (4 ad-hoc clients, only 1 closes properly).
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
- pnpm is strict: a direct import must be a declared dependency of that workspace.
- `docs/` is gitignored (`.gitignore:64`) — never assume anything there is shared with collaborators or CI, and don't put decisions there that belong in these root docs.
- **Don't build UI for backend features that haven't landed.** The dashboard is complete for what the engine actually does; conditions/branching and any Google/RSS/AI integrations have no backend, so no UI for them until they do.
