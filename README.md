# FlowState

**A self-hosted workflow automation engine — runs on NestJS + PostgreSQL + Redis, or entirely on Cloudflare's free plan.**

Trigger multi-step pipelines from webhooks, scheduled polling, or manual calls.  
Every execution is queued, retried, and fully audited.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

FlowState is a backend automation engine that lets you compose workflows from ordered actions and attach triggers to them. When a trigger fires — via an incoming webhook, a scheduler polling an external API, or a direct API call — the workflow is queued durably and executed step-by-step, with each action's output forwarded to the next.

The same REST API ships as two interchangeable runtimes: the **NestJS backend** (`backend/` — Postgres, Redis, BullMQ) and a **Cloudflare Worker** (`worker/` — D1, Workflows, Durable Objects, on the free plan). The dashboard works against either.

Think of it as the engine behind something like Zapier or n8n, except it's open source, self-hosted, and purpose-built for developers who want to own the stack.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
  - [Running on Cloudflare locally](#running-on-cloudflare-locally)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Trigger Types](#trigger-types)
- [Action Types](#action-types)
- [Payload Templating](#payload-templating)
- [Security Model](#security-model)
- [Admin & Dead-Letter Queue](#admin--dead-letter-queue)
- [Project Structure](#project-structure)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| | Feature | Details |
|---|---|---|
| 🔐 | **Sign in with Google** | Google OAuth (PKCE) is the only sign-in method; FlowState then issues its own access tokens (15 min) + rotating refresh tokens (7 days) |
| 📋 | **Workflow CRUD** | Create, update, delete, pause, resume, and clone workflows with ownership enforcement |
| ⚡ | **Three Trigger Types** | Webhook (HMAC-SHA256), Scheduled polling (pull-based), Manual fire |
| 🔧 | **Five Action Executors** | HTTP request, email (Resend), Telegram notification, delay, log message |
| 🔗 | **Payload Chaining** | An `HTTP_REQUEST` step's response is available to later steps as `{{payload.http.body.*}}` |
| 🧩 | **Template Interpolation** | `{{payload.field}}` dot-notation in any action config field |
| 📬 | **Durable Execution** | BullMQ + Redis (NestJS) or Cloudflare Workflows (Worker), with automatic retries that resume from the failed step |
| 💀 | **Dead-Letter Handling** | Runs that exhaust their retries are listed and retryable through the admin API |
| ☁️ | **Runs on Cloudflare for free** | The whole API + engine as one Worker on D1 — no servers, no Docker, Workers Free plan |
| 🔁 | **Idempotent Webhooks** | Dedup via `X-Idempotency-Key` header or automatic SHA-256 payload fingerprinting |
| 📝 | **Comprehensive Audit Log** | Every auth event, CRUD operation, and workflow execution is written to an immutable table |
| 📖 | **Swagger UI** | Interactive API docs at `/api/docs` (NestJS backend) |
| 🐳 | **Docker Compose** | One command to spin up Postgres 16 + Redis 7 for local development |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 + TypeScript (`backend/`) · Cloudflare Workers (`worker/`) |
| Framework | NestJS 11 · Hono on the Worker |
| Database | PostgreSQL 16 via Prisma 6 · Cloudflare D1 (SQLite) on the Worker |
| Queue / Scheduling | Redis 7 + BullMQ 5 · Cloudflare Workflows + Durable Objects on the Worker |
| Dashboard | Next.js 15 App Router, TanStack Query, Zustand (Vercel, or Cloudflare via OpenNext) |
| Authentication | Google OAuth 2.0 / OIDC (PKCE), JWT access + refresh, SHA-256-hashed refresh tokens |
| Email | Resend API |
| Notifications | Telegram Bot API |
| API Docs | Swagger / OpenAPI 3 |
| Validation | class-validator + class-transformer · zod on the Worker |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                      HTTP Client                    │
└───────────────────────────┬─────────────────────────┘
                            │
               ┌────────────▼────────────┐
               │     NestJS REST API      │
               │   Controllers / Guards   │
               └────────────┬────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼─────┐    ┌───────▼──────┐   ┌───────▼──────┐
    │   Auth   │    │  Workflows   │   │   Webhooks   │
    │  Module  │    │  + Triggers  │   │  + Scheduler │
    └──────────┘    └───────┬──────┘   └───────┬──────┘
                            │                  │
               ┌────────────▼──────────────────▼──────┐
               │         BullMQ Queue  (Redis)         │
               │      "workflow-execution" queue       │
               └───────────────────┬──────────────────┘
                                   │
               ┌───────────────────▼──────────────────┐
               │           WorkflowProcessor           │
               │  Fetches actions → runs in order →   │
               │  threads payload → writes audit log   │
               └───────────────────┬──────────────────┘
                                   │
               ┌───────────────────▼──────────────────┐
               │        ActionExecutorService          │
               │   Strategy registry: type → class    │
               │                                      │
               │  HTTP_REQUEST  │  SEND_EMAIL         │
               │  TELEGRAM_NOTIFY  │  DELAY           │
               │  LOG_MESSAGE                         │
               └──────────────────────────────────────┘
```

**Execution flow:** trigger fires → NestJS event emitted → job pushed to BullMQ → `WorkflowProcessor` locks and runs the job → actions execute sequentially with the merged payload → every step is persisted as an `ActionExecution` row → audit log written on completion or failure.

**On Cloudflare** (`worker/`) the same flow maps onto platform primitives:

| NestJS backend | Cloudflare Worker |
|---|---|
| NestJS controllers | Hono routes — same paths, JSON and error shapes |
| PostgreSQL + Prisma | D1 (SQLite) — schema in `worker/migrations/` |
| BullMQ + `WorkflowProcessor` | A Workflow instance per run, one durable `step.do` per action |
| Redis rate limits / sign-in state | `RateLimiter` and `OneTimeStore` Durable Objects |
| BullMQ repeatable polling jobs | A `Poller` Durable Object per scheduled trigger (alarms), plus a 15-minute Cron safety net |

Executors, templating, change detection, webhook HMAC, Google sign-in helpers, token encryption and the Telegram bot are shared: the Worker imports them from framework-free files in `backend/src`.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Docker** & Docker Compose (for Postgres and Redis)
- **pnpm** ≥ 9 (`corepack enable` or `npm i -g pnpm`)

### Installation

This is a pnpm + Turborepo monorepo: the NestJS API lives in `backend/`, the
React dashboard in `frontend/`, and shared API types in `packages/api-types`.

```bash
# Clone the repository
git clone https://github.com/your-username/flowstate.git
cd flowstate

# Install all workspace dependencies
pnpm install
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_ACCESS_SECRET` | ✅ | — | Secret for signing access tokens (use a long random string) |
| `JWT_REFRESH_SECRET` | ✅ | — | Secret for signing refresh tokens (different from access secret) |
| `PORT` | Optional | `3000` | HTTP port |
| `WORKER_CONCURRENCY` | Optional | `5` | Parallel jobs per worker instance |
| `CORS_ORIGIN` | Optional | `http://localhost:5173` | The dashboard's origin |
| `RESEND_API_KEY` | Optional | — | Required to use the `SEND_EMAIL` action |
| `RESEND_FROM_ADDRESS` | Optional | `noreply@example.com` | Verified sender address for outbound email |
| `TELEGRAM_BOT_TOKEN` | Optional | — | Required to use the `TELEGRAM_NOTIFY` action and the bot |
| `TELEGRAM_WEBHOOK_SECRET` | With the bot | — | `secret_token` for Telegram's `setWebhook`; the bot runs in webhook mode at `POST /telegram/webhook` |
| `ADMIN_SECRET` | Optional | — | Enables admin/DLQ endpoints when set (sent as `X-Admin-Secret` header) |
| `GOOGLE_CLIENT_ID` | ✅ to sign in | — | OAuth client ID (Google Cloud → Google Auth Platform → Clients → *Web application*) |
| `GOOGLE_CLIENT_SECRET` | ✅ to sign in | — | That client's secret |
| `GOOGLE_REDIRECT_URI` | Optional | `http://localhost:$PORT/auth/google/callback` | Must exactly match an *Authorized redirect URI* on the OAuth client |
| `CREDENTIALS_ENCRYPTION_KEY` | ✅ to sign in | — | 32 bytes, base64 (`openssl rand -base64 32`). Encrypts stored Google tokens. Changing it makes stored tokens unreadable |
| `FRONTEND_URL` | Optional | `http://localhost:5173` | Where the API sends the browser after Google sign-in |

The dashboard reads one variable, `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`), baked in at build time — no trailing slash needed (it's stripped).

The Cloudflare Worker doesn't read `.env`: locally it uses `worker/.dev.vars` (template: `worker/.dev.vars.example`), and in production Wrangler secrets plus the `vars` in `worker/wrangler.jsonc`. It needs no `DATABASE_URL`, `REDIS_URL`, `PORT` or `WORKER_CONCURRENCY`.

> ⚠️ **Never commit `.env` to version control.** It is listed in `.gitignore`. Generate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with `openssl rand -hex 64`.

**Google sign-in setup.** In Google Cloud Console → Google Auth Platform: configure the consent screen (add yourself as a test user), then create a client of type *Web application* with `http://localhost:3000/auth/google/callback` as an authorized redirect URI (`http://localhost:8787/auth/google/callback` for the local Worker). Leave *Authorised JavaScript origins* empty. Prefer **Download JSON** over copy-pasting the ID and secret — a dropped first character gives Google's "OAuth client was not found". Sign-in only requests `openid email profile`, which needs no Google verification. Without the three required variables the API still starts, but `/auth/google/start` returns 503 and nobody can sign in.

### Running Locally

**1. Start Postgres and Redis:**

```bash
docker compose up -d
```

**2. Run database migrations:**

```bash
pnpm --filter api prisma:migrate
```

**3. Start the development servers (API + web via Turborepo):**

```bash
pnpm dev            # both apps
pnpm dev:api        # API only (NestJS on :3000)
pnpm dev:web        # dashboard only (Next.js on :5173)
```

| URL | Description |
|---|---|
| `http://localhost:3000` | REST API |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/health` | Health check |
| `http://localhost:5173` | Web dashboard |

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env` (defaults to
`http://localhost:3000`); the API allows the dashboard origin via `CORS_ORIGIN`
(defaults to `http://localhost:5173`).

### Running on Cloudflare locally

No Docker, no Postgres, no Redis, no Cloudflare account:

```bash
cp worker/.dev.vars.example worker/.dev.vars   # fill in the secrets you have
pnpm --filter worker db:migrate:local          # create the local D1 tables (once)
pnpm --filter worker dev                       # API on http://localhost:8787
NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm dev:web
```

`wrangler dev` runs the real Workers runtime with local D1, Workflows, Durable Objects and alarms.

---

## Deployment

The live setup is the **Cloudflare Worker** for the API (Workers Free plan) and the dashboard on **Vercel**:

| Piece | Where | Config |
|---|---|---|
| API + engine + database | Cloudflare Worker `flowstate-api` + D1 `flowstate` | `worker/wrangler.jsonc` (`vars`: `FRONTEND_URL`, `CORS_ORIGIN`, `GOOGLE_REDIRECT_URI`) + Wrangler secrets |
| Dashboard | Vercel (or Cloudflare via `pnpm --filter web cf:deploy`) | `NEXT_PUBLIC_API_URL` = the Worker's URL, then redeploy |
| Google OAuth client | Google Cloud → Google Auth Platform | Redirect URI = the Worker's `/auth/google/callback` |

Step-by-step deploy, secrets, and moving data off a Postgres deployment: [`worker/README.md`](worker/README.md). The NestJS backend still deploys anywhere Node, Postgres and Redis run (it was on Render) — but **never run both runtimes in production at once**: each polls scheduled triggers, so every detected change would start two runs.

---

## API Reference

All protected endpoints require `Authorization: Bearer <access_token>`.

For a fully interactive reference, open the Swagger UI at `/api/docs` after starting the server.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/google/start?nonce=&returnTo=` | Public | Browser navigation — redirects to Google (PKCE) |
| `GET` | `/auth/google/callback` | Public | Google's redirect target — redirects to the dashboard with a one-time code, or to `/login?error=` |
| `POST` | `/auth/google/exchange` | Public | Trade `{ code, nonce }` for an access + refresh token pair (single-use, 60 s) |
| `POST` | `/auth/refresh` | Public | Rotate a refresh token |
| `POST` | `/auth/logout` | 🔒 | Revoke the current refresh token |

### Workflows

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/workflows` | Create a workflow |
| `GET` | `/workflows` | List your workflows (paginated, `?page=1&limit=20`) |
| `GET` | `/workflows/:id` | Get a single workflow |
| `PATCH` | `/workflows/:id` | Partially update a workflow |
| `DELETE` | `/workflows/:id` | Delete (archive) a workflow |
| `POST` | `/workflows/:id/pause` | Pause — stops the trigger from firing |
| `POST` | `/workflows/:id/resume` | Resume a paused workflow |
| `POST` | `/workflows/:id/clone` | Clone a workflow (trigger + actions, fresh webhook secret, as a draft) |
| `GET` | `/workflows/:id/poll-history` | Last 50 polling events for debugging |

### Triggers

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/workflows/:id/trigger` | Create or replace the trigger (an existing webhook secret is kept) |
| `GET` | `/workflows/:id/trigger` | Get the current trigger (secret is masked) |
| `DELETE` | `/workflows/:id/trigger` | Remove the trigger |
| `POST` | `/workflows/:id/trigger/fire` | Manual fire with a custom JSON payload (workflow must be `ACTIVE`) |
| `GET` | `/workflows/:id/webhook-events` | Webhook event history (`?status=` filter) |

### Actions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/workflows/:id/actions` | Add an action |
| `GET` | `/workflows/:id/actions` | List actions, ordered by `position` |
| `PATCH` | `/workflows/:id/actions/:actionId` | Update an action |
| `DELETE` | `/workflows/:id/actions/:actionId` | Remove an action |
| `POST` | `/workflows/:id/actions/reorder` | Reorder the chain in one transaction |

### Executions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/executions` | Paginated history (`?page&limit&status&workflowId`) |
| `GET` | `/executions/stats` | Counts by status and average duration |
| `GET` | `/executions/:id` | Single execution with per-step details |
| `POST` | `/executions/:id/cancel` | Cancel an execution that hasn't started (`PENDING` only) |

### Webhooks

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/webhooks/:workflowId` | Public | Incoming external webhook (HMAC-verified) |
| `POST` | `/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` | Telegram bot updates (webhook mode) |
| `GET` | `/health` | Public | Liveness + database status |

### Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/failed-jobs` | `X-Admin-Secret` | List dead-lettered jobs |
| `POST` | `/admin/failed-jobs/:jobId/retry` | `X-Admin-Secret` | Retry a failed run, resuming after the steps that succeeded |

---

## Trigger Types

### `WEBHOOK`

An external service (GitHub, Stripe, your own app, etc.) sends a `POST` request to `/webhooks/:workflowId`.

**Signature verification**: If the trigger has a secret, the request must include an `X-FlowForge-Signature: sha256=<hex>` header. FlowState recomputes `HMAC-SHA256(rawBody, secret)` and compares using a constant-time comparison to prevent timing attacks.

The webhook secret is auto-generated on first creation and kept when the trigger is saved again. Only the first 8 characters are returned in API responses. There's no rotation endpoint yet — delete and re-create the trigger to get a new secret.

**Deduplication**: Requests are deduplicated using the `X-Idempotency-Key` header if provided, or automatically via a deterministic SHA-256 fingerprint of the payload body. Duplicate requests receive a `{ received: true, duplicate: true }` response with no side effects.

**Payload format**: The parsed JSON body of the incoming webhook is available in action templates as `{{payload.*}}`.

---

### `SCHEDULED`

FlowState polls an external HTTP endpoint on a configurable interval (minimum 30 seconds). The workflow only fires when a **change** is detected in the response.

**Trigger configuration fields:**

| Field | Required | Description |
|---|---|---|
| `interval` | ✅ | Polling interval in seconds (minimum: 30) |
| `endpoint` | ✅ | Full URL to poll |
| `method` | No | HTTP method (default: `GET`) |
| `headers` | No | Request headers as a flat key-value object |
| `changeMode` | No | How to detect changes (default: `any`) |
| `stateKey` | Conditional | Required when `changeMode` is `specific_field` |

**Change detection modes (`changeMode`):**

| Mode | Fires when... |
|---|---|
| `any` | Any part of the JSON response changes |
| `specific_field` | The value at the dot-notation `stateKey` path changes |
| `array_length` | The number of items in a top-level array changes |

---

### `MANUAL`

`POST /workflows/:id/trigger/fire` with any JSON body as the payload (the dashboard's **Test run** button). The workflow must be `ACTIVE`. Useful for testing pipelines without setting up an external sender.

---

## Action Types

Actions run in ascending `position` order. Each action receives the current payload and may enrich it — subsequent actions see the merged result.

### `HTTP_REQUEST`

Makes an outbound HTTP call. Later steps can read the response as `{{payload.http.status}}` and `{{payload.http.body.*}}` (a later `HTTP_REQUEST` overwrites it).

| Config field | Required | Description |
|---|---|---|
| `url` | ✅ | Target URL |
| `method` | No | HTTP method (default: `GET`) |
| `headers` | No | Request headers |
| `body` | No | Request body string (ignored for GET/HEAD) |

### `SEND_EMAIL`

Sends a transactional email via [Resend](https://resend.com). Requires `RESEND_API_KEY` and `RESEND_FROM_ADDRESS`.

| Config field | Required | Description |
|---|---|---|
| `to` | ✅ | Recipient email address |
| `subject` | ✅ | Email subject |
| `body` | ✅ | Email body (HTML supported) |
| `fromName` | No | Sender display name (default: `FlowState`) |
| `fromAddress` | No | Override sender address (falls back to `RESEND_FROM_ADDRESS`) |

### `TELEGRAM_NOTIFY`

Sends a message to a Telegram chat via Bot API. Requires `TELEGRAM_BOT_TOKEN`.

| Config field | Required | Description |
|---|---|---|
| `chatId` | ✅ | Telegram chat ID |
| `message` | ✅ | Message text |
| `parseMode` | No | `HTML` or `Markdown` (default: `HTML`) |

### `DELAY`

Pauses execution for a fixed number of seconds.

| Config field | Required | Description |
|---|---|---|
| `seconds` | ✅ | Duration to wait |

> **Note**: On the NestJS backend this blocks a worker slot for the duration; see [Known Limitations](#known-limitations). On the Cloudflare Worker it's a durable `step.sleep` that holds nothing.

### `LOG_MESSAGE`

Writes a message to the server log. Useful for debugging pipelines.

| Config field | Required | Description |
|---|---|---|
| `message` | ✅ | Text to log (supports templating) |

---

## Payload Templating

Every string value in an action's `config` object supports `{{mustache}}`-style placeholders. Placeholders are resolved against the live payload using dot-notation before the action executes.

**Example — send an email using data from a webhook payload:**

```json
{
  "type": "SEND_EMAIL",
  "config": {
    "to": "{{payload.customer.email}}",
    "subject": "Order confirmed: #{{payload.order.id}}",
    "body": "<p>Hi {{payload.customer.name}}, your total is ${{payload.order.total}}.</p>"
  }
}
```

**Rules:**
- Paths are resolved from the root `payload` object using `.` as a separator.
- Unresolvable paths leave the placeholder **unchanged** rather than throwing — a typo is visible in the output, not a silent crash.
- Interpolation applies recursively through nested objects and arrays.

---

## Security Model

| Concern | Implementation |
|---|---|
| Sign-in | Google only (authorization code + PKCE, server-side). A dashboard-generated nonce bound to the browser tab blocks login CSRF; `returnTo` is restricted to same-origin paths |
| Google tokens | AES-256-GCM encrypted at rest (`CREDENTIALS_ENCRYPTION_KEY`); never sent to the browser |
| Refresh token storage | Stored as SHA-256 digests (the tokens are high-entropy random ids); the raw token is never persisted |
| Token rotation | Each refresh issues a new pair and revokes the old one; chain tracked via `replacedByTokenId` |
| Webhook authenticity | HMAC-SHA256 with `timingSafeEqual` — prevents both forgery and timing attacks |
| Resource ownership | `WorkflowOwnerGuard` on all per-workflow routes — cross-user access returns 403 |
| Input validation | `class-validator` with `whitelist: true` (unknown fields stripped) and `forbidNonWhitelisted: true` |
| Admin routes | Opt-in via `ADMIN_SECRET` env var; disabled entirely when unset |
| Secret masking | Webhook secrets are masked in all API responses (first 8 chars + `...`) |

---

## Admin & Dead-Letter Queue

When a workflow execution exhausts all BullMQ retry attempts, it is **dead-lettered** (NestJS backend):
- The failed job is retained in Redis in a `failed` state.
- The `WorkflowExecution` row in Postgres is updated to `FAILED` with the terminal error message.
- An audit log entry with event type `workflow.execution.dead_lettered` is written.

The admin endpoints let you inspect and recover these jobs without needing direct Redis access:

```bash
# List all dead-lettered jobs
GET /admin/failed-jobs
X-Admin-Secret: your-secret

# Requeue a specific job (resets WorkflowExecution status to PENDING)
POST /admin/failed-jobs/:jobId/retry
X-Admin-Secret: your-secret
```

On the Cloudflare Worker, a run that exhausts its per-step retries simply ends `FAILED`; `/admin/failed-jobs` lists those, and retrying one starts a new Workflow instance that resumes after the steps that succeeded.

Admin routes are completely **disabled** if `ADMIN_SECRET` is not set in the environment.

---

## Project Structure

```
flowstate/                      # pnpm workspace root (Turborepo)
├── backend/                    # NestJS API (workspace: "api")
│   ├── src/                    # (see below)
│   └── prisma/
│       └── schema.prisma       # Full data model
├── frontend/                   # Next.js dashboard (workspace: "web")
│   └── src/
│       ├── app/                # App Router routes (thin client wrappers)
│       ├── components/         # Shell, UI primitives, status badges
│       ├── features/
│       │   ├── flow/           # React Flow linear canvas + action config forms
│       │   ├── trigger/        # Trigger config, test-fire, webhook events
│       │   └── executions/     # Runs tables, stats widget
│       ├── lib/                # API client (auth refresh), stores, helpers
│       └── views/              # Page components (login + Google callback, workflows, executions)
├── worker/                     # Same API on Cloudflare (workspace: "worker") — see worker/README.md
│   ├── src/                    # Hono routes, repo/ (D1 SQL), engine/ (Workflow, polling), durable/ (DOs)
│   ├── migrations/             # D1 schema
│   ├── scripts/postgres-to-d1.mjs  # One-off data move from Postgres
│   └── wrangler.jsonc
├── packages/
│   └── api-types/              # Shared TS types mirroring the API surface
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml          # Postgres + Redis for local development

backend/src/
│   ├── actions/
│   │   ├── executors/          # One file per action type
│   │   │   ├── delay.executor.ts
│   │   │   ├── http-request.executor.ts
│   │   │   ├── log-message.executor.ts
│   │   │   ├── send-email.executor.ts
│   │   │   └── telegram-notify.executor.ts
│   │   ├── interfaces/         # IActionExecutor contract
│   │   └── action-executor.service.ts  # Strategy registry
│   ├── admin/                  # Admin/DLQ endpoints
│   ├── auth/                   # Google sign-in, JWT, refresh token rotation
│   ├── common/
│   │   └── utils/
│   │       └── template.util.ts        # {{mustache}} interpolation engine
│   ├── events/                 # NestJS event listeners (workflow.triggered)
│   ├── executions/             # BullMQ processor, execution history API
│   ├── health/                 # Health check endpoint
│   ├── prisma/                 # PrismaService wrapper
│   ├── scheduler/              # Polling worker, scheduler registration, change detection
│   ├── telegram/               # Bot (webhook mode)
│   ├── shared/                 # AuditLogService
│   ├── triggers/               # Trigger CRUD, HMAC secret management
│   ├── webhooks/               # Webhook ingestion, dedup, manual fire
│   └── workflows/              # Workflow CRUD, pagination, clone, pause/resume
```

---

## Known Limitations

These are intentional simplifications. They are documented here rather than papered over.

| Limitation | Detail |
|---|---|
| **At-least-once per step** | A retry skips steps that already succeeded and resumes at the failed one with the payload as it was. The failed step itself re-runs, so if it had an external effect before erroring (e.g. the remote accepted a request, then the connection timed out), that effect can happen twice. |
| **`DELAY` blocks the worker (NestJS only)** | The processor sleeps inline, holding a BullMQ worker slot for the full duration. The Cloudflare Worker uses a durable `step.sleep` instead. |
| **Cloudflare Free plan limits** | 100,000 requests/day, 10 ms CPU per request or step, 50 D1 queries or subrequests per invocation — so the 15-minute poller safety net re-arms up to ~49 polling workflows per run. The $5/month Paid plan lifts these with no code change. |
| **One runtime at a time** | The NestJS backend and the Worker each poll scheduled triggers; running both in production doubles every polled run. |
| **SPA token storage** | The dashboard keeps the refresh token in `localStorage` (access token stays in memory). Fine for local/dev; a production deployment should move refresh-token storage behind a BFF or a same-site cookie once API and frontend share a domain. |
| **No per-endpoint rate limiting** | Runs are capped per user per hour, but there are no request-rate guards on the API itself (e.g. `/auth/google/start`). |
| **SSRF surface** | `HTTP_REQUEST` and polling fetch any user-supplied URL; there's no allowlist. |
| **Shared credentials** | One Resend key and one Telegram bot serve every user. |
| **Single-region (NestJS)** | No built-in support for multi-region Redis or Postgres failover. |
| **Polling minimum: 30 seconds** | Sub-30s intervals are rejected at the API layer to prevent runaway polling. |
| **Google-only sign-in** | No email/password or other providers. Pre-Google accounts are linked on first sign-in when the Google account's verified email matches. |
| **Conditions table unused** | The `conditions` table exists in the schema but the condition-evaluation step is not wired into the execution engine. |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

In brief:
1. Fork → branch → change → test → PR
2. Run `pnpm lint` and `pnpm test` (and `pnpm --filter api format`) before pushing — CI runs the same, plus the Worker's D1 tests
3. Keep PRs focused — one concern per PR

---

## License

[MIT](LICENSE) — © FlowState Contributors
