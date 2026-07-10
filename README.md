# FlowState

**A self-hosted workflow automation engine built with NestJS, PostgreSQL, and Redis.**

Trigger multi-step pipelines from webhooks, scheduled polling, or manual calls.  
Every execution is queued, retried, and fully audited.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

FlowState is a backend automation engine that lets you compose workflows from ordered actions and attach triggers to them. When a trigger fires — via an incoming webhook, a scheduler polling an external API, or a direct API call — the workflow is pushed onto a Redis-backed queue and executed step-by-step, with each action's output forwarded to the next.

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
| 🔐 | **JWT Authentication** | Access tokens (15 min) + rotating refresh tokens (7 days), Argon2 password hashing |
| 📋 | **Workflow CRUD** | Create, update, delete, pause, resume, and clone workflows with ownership enforcement |
| ⚡ | **Three Trigger Types** | Webhook (HMAC-SHA256), Scheduled polling (pull-based), Manual fire |
| 🔧 | **Five Action Executors** | HTTP request, email (Resend), Telegram notification, delay, log message |
| 🔗 | **Payload Chaining** | Each action's output is merged into the running payload for downstream steps |
| 🧩 | **Template Interpolation** | `{{payload.field}}` dot-notation in any action config field |
| 📬 | **Async Execution Queue** | BullMQ + Redis with configurable concurrency and automatic retries |
| 💀 | **Dead-Letter Handling** | Exhausted jobs stay in Redis and are reflected in Postgres for full observability |
| 🔁 | **Idempotent Webhooks** | Dedup via `X-Idempotency-Key` header or automatic SHA-256 payload fingerprinting |
| 📝 | **Comprehensive Audit Log** | Every auth event, CRUD operation, and workflow execution is written to an immutable table |
| 📖 | **Swagger UI** | Interactive API docs at `/api/docs` |
| 🐳 | **Docker Compose** | One command to spin up Postgres 16 + Redis 7 for local development |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 + TypeScript |
| Framework | NestJS 11 |
| Database | PostgreSQL 16 via Prisma 6 |
| Queue / Cache | Redis 7 + BullMQ 5 |
| Authentication | JWT (RS256 access + refresh), Argon2id |
| Email | Resend API |
| Notifications | Telegram Bot API |
| API Docs | Swagger / OpenAPI 3 |
| Validation | class-validator + class-transformer |

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

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Docker** & Docker Compose (for Postgres and Redis)
- **npm**

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/flowstate.git
cd flowstate

# Install dependencies
npm install
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
| `PORT` | ✅ | `3000` | HTTP port |
| `WORKER_CONCURRENCY` | ✅ | `5` | Parallel jobs per worker instance |
| `RESEND_API_KEY` | Optional | — | Required to use the `SEND_EMAIL` action |
| `RESEND_FROM_ADDRESS` | Optional | `noreply@example.com` | Verified sender address for outbound email |
| `TELEGRAM_BOT_TOKEN` | Optional | — | Required to use the `TELEGRAM_NOTIFY` action |
| `ADMIN_SECRET` | Optional | — | Enables admin/DLQ endpoints when set (sent as `X-Admin-Secret` header) |

> ⚠️ **Never commit `.env` to version control.** It is listed in `.gitignore`. Generate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with `openssl rand -hex 64`.

### Running Locally

**1. Start Postgres and Redis:**

```bash
docker compose up -d
```

**2. Run database migrations:**

```bash
npm run prisma:migrate
```

**3. Start the development server:**

```bash
npm run start:dev
```

| URL | Description |
|---|---|
| `http://localhost:3000` | REST API |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/health` | Health check |

---

## API Reference

All protected endpoints require `Authorization: Bearer <access_token>`.

For a fully interactive reference, open the Swagger UI at `/api/docs` after starting the server.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register, returns access + refresh token pair |
| `POST` | `/auth/login` | Public | Login, returns access + refresh token pair |
| `POST` | `/auth/refresh` | Public | Rotate a refresh token |
| `POST` | `/auth/logout` | 🔒 | Revoke the current refresh token |
| `GET` | `/auth/me` | 🔒 | Get the authenticated user's profile |

### Workflows

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/workflows` | Create a workflow |
| `GET` | `/workflows` | List your workflows (paginated, `?page=1&limit=20`) |
| `GET` | `/workflows/:id` | Get a single workflow |
| `PATCH` | `/workflows/:id` | Partially update a workflow |
| `DELETE` | `/workflows/:id` | Delete a workflow |
| `POST` | `/workflows/:id/pause` | Pause — stops the trigger from firing |
| `POST` | `/workflows/:id/resume` | Resume a paused workflow |
| `POST` | `/workflows/:id/clone` | Clone a workflow (all triggers + actions) |
| `GET` | `/workflows/:id/poll-history` | Last 50 polling events for debugging |

### Triggers

| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/workflows/:id/trigger` | Create or replace the trigger |
| `GET` | `/workflows/:id/trigger` | Get the current trigger (secret is masked) |
| `DELETE` | `/workflows/:id/trigger` | Remove the trigger |
| `POST` | `/workflows/:id/trigger/rotate-secret` | Generate a new HMAC secret |

### Actions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/workflows/:id/actions` | Add an action |
| `GET` | `/workflows/:id/actions` | List actions, ordered by `position` |
| `PATCH` | `/workflows/:id/actions/:actionId` | Update an action |
| `DELETE` | `/workflows/:id/actions/:actionId` | Remove an action |

### Executions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/workflows/:id/executions` | Paginated execution history |
| `GET` | `/executions/:id` | Single execution with per-action details |

### Webhooks

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/webhooks/:workflowId` | Public | Incoming external webhook (HMAC-verified) |
| `POST` | `/webhooks/:workflowId/fire` | 🔒 | Manual trigger fire with a custom payload |
| `GET` | `/webhooks/:workflowId/events` | 🔒 | Webhook event history with status filter |

### Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/failed-jobs` | `X-Admin-Secret` | List dead-lettered jobs |
| `POST` | `/admin/failed-jobs/:jobId/retry` | `X-Admin-Secret` | Requeue a failed job |

---

## Trigger Types

### `WEBHOOK`

An external service (GitHub, Stripe, your own app, etc.) sends a `POST` request to `/webhooks/:workflowId`.

**Signature verification**: If the trigger has a secret, the request must include an `X-FlowForge-Signature: sha256=<hex>` header. FlowState recomputes `HMAC-SHA256(rawBody, secret)` and compares using a constant-time comparison to prevent timing attacks.

The webhook secret is auto-generated on first creation. Only the first 8 characters are returned in API responses. Use `POST /workflows/:id/trigger/rotate-secret` to cycle it.

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

`POST /webhooks/:workflowId/fire` with any JSON body as the payload. The workflow must be `ACTIVE`. Useful for testing pipelines without setting up an external sender.

---

## Action Types

Actions run in ascending `position` order. Each action receives the current payload and may enrich it — subsequent actions see the merged result.

### `HTTP_REQUEST`

Makes an outbound HTTP call. The response body is merged into the payload for downstream steps.

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

> **Note**: This blocks the worker thread for the duration. Acceptable for short delays in development; see [Known Limitations](#known-limitations) for the production caveat.

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
| Password storage | Argon2id hashing — no plaintext or bcrypt |
| Refresh token storage | Stored as Argon2id hashes; the raw token is never persisted |
| Token rotation | Each refresh issues a new pair and revokes the old one; chain tracked via `replacedByTokenId` |
| Webhook authenticity | HMAC-SHA256 with `timingSafeEqual` — prevents both forgery and timing attacks |
| Resource ownership | `WorkflowOwnerGuard` on all per-workflow routes — cross-user access returns 403 |
| Input validation | `class-validator` with `whitelist: true` (unknown fields stripped) and `forbidNonWhitelisted: true` |
| Admin routes | Opt-in via `ADMIN_SECRET` env var; disabled entirely when unset |
| Secret masking | Webhook secrets are masked in all API responses (first 8 chars + `...`) |

---

## Admin & Dead-Letter Queue

When a workflow execution exhausts all BullMQ retry attempts, it is **dead-lettered**:
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

Admin routes are completely **disabled** if `ADMIN_SECRET` is not set in the environment.

---

## Project Structure

```
flowstate/
├── src/
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
│   ├── auth/                   # JWT auth, refresh token rotation
│   ├── common/
│   │   └── utils/
│   │       └── template.util.ts        # {{mustache}} interpolation engine
│   ├── events/                 # NestJS event listeners (workflow.triggered)
│   ├── executions/             # BullMQ processor, execution history API
│   ├── health/                 # Health check endpoint
│   ├── prisma/                 # PrismaService wrapper
│   ├── scheduler/              # Polling worker, scheduler registration
│   ├── shared/                 # AuditLogService
│   ├── triggers/               # Trigger CRUD, HMAC secret management
│   ├── webhooks/               # Webhook ingestion, dedup, manual fire
│   └── workflows/              # Workflow CRUD, pagination, clone, pause/resume
├── prisma/
│   └── schema.prisma           # Full data model
├── .env.example                # Environment variable reference
├── docker-compose.yml          # Postgres + Redis for local development
├── CONTRIBUTING.md
└── LICENSE
```

---

## Known Limitations

These are intentional simplifications. They are documented here rather than papered over.

| Limitation | Detail |
|---|---|
| **`DELAY` blocks the worker** | The delay executor uses `setTimeout` inline, holding a BullMQ worker slot for the full duration. A production system would split remaining actions into a new delayed job so the worker is not held hostage. |
| **No frontend** | FlowState is a pure REST API. There is no UI. Pair it with any frontend. |
| **No per-endpoint rate limiting** | There are no request-rate guards on the API. |
| **Single-region** | No built-in support for multi-region Redis or Postgres failover. |
| **Polling minimum: 30 seconds** | Sub-30s intervals are rejected at the API layer to prevent runaway polling. |
| **Email auth only** | No OAuth, magic links, or social login. Email + password only. |
| **Conditions table unused** | The `conditions` table exists in the schema but the condition-evaluation step is not wired into the execution engine. |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

In brief:
1. Fork → branch → change → test → PR
2. Run `npm run lint && npm run format` before pushing
3. Keep PRs focused — one concern per PR

---

## License

[MIT](LICENSE) — © FlowState Contributors
