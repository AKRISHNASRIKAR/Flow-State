# AGENTS.md — Instructions for AI coding agents

> Read this before making any change to this repository. It encodes the conventions actually used in the code, not generic best practice. Every rule below is backed by a real file you can open and check.
>
> Companion documents: **`PROJECT_OVERVIEW.md`** (full system reference) · **`CLAUDE.md`** (condensed persistent context).

---

## 1. Project overview

**FlowState** (directory is `flowforge/`, renamed in commit `f47ee0e` — see PROJECT_OVERVIEW § "A note on the name") is a self-hosted workflow automation engine.

A **Workflow** owns exactly one **Trigger** and an ordered chain of **Actions**. When the trigger fires (webhook / manual / scheduled poll), a `workflow.triggered` event is emitted, a `WorkflowExecution` row is created, and a BullMQ job is enqueued. A worker runs the actions in order, persisting an `ActionExecution` row per step.

Monorepo: pnpm workspaces + Turborepo.

| Workspace | Path | Stack |
|---|---|---|
| `api` | `backend/` | NestJS 11, Prisma 6, PostgreSQL 16, Redis 7, BullMQ |
| `web` | `frontend/` | Next.js 15 App Router, React 19, TanStack Query, Zustand, Tailwind v4 |
| `@flowstate/api-types` | `packages/api-types/` | Hand-maintained shared types, no build step |

---

## 2. Architecture rules

### The one rule that matters most

**Ingress never executes.** A controller's job is to validate, persist a record, emit an event, and return. All real work happens on a queue in a worker.

```
HTTP / poll  →  emit 'workflow.triggered'  →  TriggeredListener  →  BullMQ  →  WorkflowProcessor
   (fast)          (fire-and-forget)          (admission control)   (durable)      (the work)
```

Never `await` execution inside a request handler. Never call `ActionExecutorService` from a controller.

### Layering

```
Controller  → HTTP shape, Swagger docs, guards, DTO binding. NO business logic.
Service     → business logic, Prisma access, audit logging, serialization.
Guard       → authorization (JwtAuthGuard globally, WorkflowOwnerGuard per resource).
Processor   → queue consumers. The only place that runs an action chain.
Executor    → one side effect, behind IActionExecutor. Never touches Prisma.
```

Executors must stay pure with respect to the database. They receive an interpolated config, a payload, and a context, and return an `ActionResult`. Persistence is `WorkflowProcessor`'s job.

---

## 3. Coding conventions

### TypeScript

- **Strict mode everywhere.** `backend/tsconfig.json` and `frontend/tsconfig.json` both set `strict: true`. Frontend additionally sets `noUnusedLocals` and `noUnusedParameters`.
- **Never use `any`.** Use `unknown` and narrow. See `template.util.ts:53-59` (`resolvePath`) and `polling-config.ts:isRecord` for the established narrowing idioms.
- **Prefer explicit local `interface`s over inline object types** for config shapes. Every executor declares its own, e.g. `HttpRequestConfig` in `http-request.executor.ts:6-11`.
- Use `Prisma.InputJsonValue` / `Prisma.InputJsonObject` when writing JSON columns — see `workflow.processor.ts:65`.
- Type-only imports use `import type`.

### Comments

This codebase has a distinctive and deliberate comment style: **comments explain *why* and record trade-offs; they never restate the code.**

Good examples to imitate:
- `webhooks.service.ts:239-242` — why the fingerprint deliberately excludes a timestamp, citing real provider retry windows.
- `workflow.processor.ts:159-162` — why the rethrow is required for BullMQ retries.
- `FlowCanvas.tsx:98-100` — why nodes must stay selectable (React Flow applies `pointer-events: none` otherwise).
- `triggered.listener.ts:82-85` — why `EXPIRE` is only set on the first `INCR`.

**When you make a non-obvious decision, leave a comment in this style.** When you change behaviour that a comment describes, **update the comment in the same edit** — the repo already has one case where this didn't happen (see F2 in PROJECT_OVERVIEW).

### Naming

| Thing | Convention | Example |
|---|---|---|
| Files (backend) | `kebab-case.<role>.ts` | `action-executor.service.ts`, `workflow-owner.guard.ts`, `send-email.executor.ts` |
| Files (frontend components) | `PascalCase.tsx` | `FlowCanvas.tsx`, `StatusBadge.tsx` |
| Files (frontend non-components) | `kebab-case.ts` | `api-client.ts`, `action-meta.ts`, `auth-store.ts` |
| Classes | `PascalCase` + role suffix | `WorkflowsService`, `PollingWorker`, `AdminGuard` |
| DB columns | `snake_case` via `@map` | `provider_account_id`, `workflow_id` |
| Prisma fields | `camelCase` | `providerAccountId`, `workflowId` |
| API JSON | `camelCase` | `{ accessToken, workflowId }` |
| Constants | `SCREAMING_SNAKE`, module-top | `MAX_LIMIT`, `WORKER_CONCURRENCY`, `HTTP_TIMEOUT_MS` |
| Redis keys | `namespace:purpose:id` | `rate:exec:<userId>:<hour>`, `poll:state:<triggerId>` |
| Events | dot-namespaced | `workflow.triggered`, `workflow.executed` |

**Magic numbers go in a named module-level constant with a comment.** Never inline a timeout or a limit.

---

## 4. Folder conventions

### Backend — one folder per domain module

```
src/<domain>/
├── <domain>.module.ts       # wiring
├── <domain>.controller.ts   # HTTP + Swagger
├── <domain>.service.ts      # logic
├── dto/                     # class-validator request shapes
├── guards/                  # authorization
├── types/                   # local interfaces
└── interfaces/              # exported contracts
```

Cross-cutting code lives in `common/` (pure utilities) or `shared/` (injectable services like `AuditLogService`).

### Frontend — routing is separate from pages

- `src/app/**/page.tsx` — **thin `'use client'` wrapper only.** Import a view, wrap in `<Suspense>` if it reads `useSearchParams`, render. Nothing else.
- `src/views/` — the actual page component. One per route.
- `src/features/<area>/` — composites scoped to one domain area.
- `src/components/` — cross-feature: `ui.tsx` primitives, `AppShell`, `ProtectedRoute`, `StatusBadge`.
- `src/lib/` — `api-client.ts` (transport + auth refresh), `api.ts` (typed endpoints), stores, formatters.

**Do not put page logic in `app/`.** Compare `app/(app)/workflows/page.tsx` (7 lines) with `views/workflows/WorkflowsListPage.tsx` (149 lines).

---

## 5. Component patterns (frontend)

### Server state vs client state

- **Server data → TanStack Query.** Never `useEffect` + `fetch`.
- **Client-only state → Zustand** (`auth-store.ts`, `toast.ts`) or local `useState`.

### Query key conventions

```ts
['workflows', page]                              // list
['workflow', workflowId]                         // detail
['actions', workflowId]
['trigger', workflowId]
['executions', { workflowId, status, page }]     // object for multi-filter
['execution', executionId]
['webhook-events', workflowId, page]
['execution-stats'] / ['health'] / ['failed-jobs']
```

Invalidate with the **prefix**: `invalidateQueries({ queryKey: ['workflows'] })` clears every page.

### Conditional polling — required pattern

Never poll unconditionally. Return `false` from `refetchInterval` when nothing is in flight:

```ts
refetchInterval: (query) => {
  const rows = query.state.data?.data;
  return rows?.some((e) => e.status === 'PENDING' || e.status === 'RUNNING') ? 3000 : false;
}
```
Reference: `ExecutionsTable.tsx:31-35`, `ExecutionDetailPage.tsx:26-30`.

### Optimistic updates

Use `onMutate` → snapshot → optimistic `setQueryData` → `onError` restore (the toast comes from the global handler — set `meta.errorContext`) → `onSettled` invalidate. Reference: the `reorder` mutation in `FlowCanvas.tsx`.

### Forms

react-hook-form + `zodResolver`. **Mirror backend validation exactly and say so in a comment** — `ScheduledConfigForm.tsx:10` does this.

### UI primitives

Always use `components/ui.tsx`: `Button`, `Modal` (short decisions), `Drawer` (side panel for editing), `ConfirmDialog`, `Switch`, `Menu`, `Tabs`, `Notice`, `Spinner`, `EmptyState`, `Pagination`, `FieldError`, `CopyField`, `Icon`/`ICON_PATHS`, plus the `inputClass` / `labelClass` / `hintClass` exports. **Never hand-roll a modal or a button.** There is no external component library — do not add one.

### Empty states must teach

Every empty state explains the concept, not just the absence:

> *"A workflow is a trigger plus an ordered chain of actions. Create your first one to get started."*

Match that tone.

---

## 6. Database patterns

- **Always go through `PrismaService`.** Never instantiate `PrismaClient`.
- **Always scope by owner.** Either the route carries `WorkflowOwnerGuard`, or the service filters by `userId` — see `ExecutionsService.getOne`, which loads `workflow.userId` and throws `NotFoundException` (**not** `ForbiddenException`) when it doesn't match, so the endpoint doesn't leak existence.
- **Soft delete, don't destroy.** `DELETE /workflows/:id` sets `status = ARCHIVED`. Reads exclude archived via `findVisibleOwnedWorkflow`.
- **Paginate with the house pattern**: clamp `page ≥ 1` and `limit ≤ 100`, run `findMany` + `count` in a single `$transaction([...])`, return `{ data, meta }`.
- **Multi-row writes use `$transaction`** — see `ActionsService.reorder`.
- **Let the database arbitrate races.** Catch `Prisma.PrismaClientKnownRequestError` with `err.code === 'P2002'` rather than trusting a prior existence check. Reference: `webhooks.service.ts:96-107`.
- **Serialize at the service boundary.** Never return raw Prisma models. Every service has a private `serialize()` that renames DB fields to API fields (`position` → `order`, `config` → `configuration`) and masks secrets.

---

## 7. API patterns

Every new endpoint needs all six of these:

1. **Swagger decorators** — `@ApiOperation({ summary, description })` plus an `@ApiResponse` for every status you can return. Look at `workflows.controller.ts` for the density expected.
2. **A DTO** in `dto/` with `class-validator` **and** `@ApiProperty` / `@ApiPropertyOptional`.
3. **Auth** — protected by default via the global guard. Add `@Public()` only for genuinely public routes (`/health`, `/auth/*`, `/webhooks/*`, `/admin/*`) and explain why.
4. **Ownership** — `@UseGuards(WorkflowOwnerGuard)` on any route with a workflow `:id`.
5. **`@CurrentUser('id')`** to get the user ID. Don't read `request.user` manually.
6. **`@HttpCode(HttpStatus.OK)`** on any `POST` that isn't creating a resource.

### Error mapping

| Situation | Exception |
|---|---|
| Validation failure | Automatic via `ValidationPipe` |
| Not found, or found but not owned by a non-workflow resource | `NotFoundException` |
| Owned by someone else (workflow routes) | `ForbiddenException` (from the guard) |
| Malformed UUID | `BadRequestException` |
| Wrong state (e.g. cancelling a RUNNING execution) | `BadRequestException` |
| Bad credentials / bad signature / bad admin secret | `UnauthorizedException` |
| Duplicate email | `ConflictException` |

---

## 8. Authentication flow

```
Google sign-in  → /auth/google/start → Google → /auth/google/callback → dashboard /auth/callback?code
                 → POST /auth/google/exchange { code, nonce } → { accessToken (15m, in memory), refreshToken (7d, localStorage) }
Every request  → Authorization: Bearer <accessToken>
On 401         → single-flight POST /auth/refresh → retry once
Refresh        → old token revoked, replacedByTokenId set, new pair issued
On reload      → bootstrapSession() silently refreshes before rendering
```

**Rules:**
- The access token is **never** persisted. Only the refresh token goes to `localStorage`.
- Refresh tokens are **one-time-use**. Anything that could fire concurrent refreshes must share the in-flight promise (`api-client.ts:35-58`). Breaking this logs users out at random.
- There are no passwords. Refresh tokens are stored as a **SHA-256** digest (`auth/refresh-token-hash.ts`, compared with `timingSafeEqual`). Fine because they're high-entropy random JWT ids — never use a fast hash for anything a human chose.
- Google OAuth tokens are **encrypted** (not hashed — they must be usable) with `TokenCipher` (AES-256-GCM) before touching the DB. Never store or log them raw.
- The sign-in nonce (dashboard `sessionStorage` → `/auth/google/start` → handoff → `/auth/google/exchange`) is what stops login CSRF. Don't drop it or move it to `localStorage`.
- Secret comparison uses `crypto.timingSafeEqual` with a length check first. **Never `===`.**

---

## 9. State management

| Kind | Tool | Where |
|---|---|---|
| Server data | TanStack Query | Everywhere |
| Auth session | Zustand | `lib/auth-store.ts` |
| Toasts | Zustand | `lib/toast.ts` |
| Form state | react-hook-form | Per form |
| UI state (modals, tabs, expanded rows) | `useState` | Locally |
| Pagination / active tab | **URL search params** | `?page=2`, `?tab=runs` |

Put navigational state in the URL so it survives reload and can be linked.

---

## 10. Error handling

### Backend

- Controllers throw Nest HTTP exceptions; don't build responses by hand.
- **Executors never throw** — return `{ success: false, error: string }`. `ActionExecutorService` catches throws as a safety net (`action-executor.service.ts:49-55`), but don't rely on it.
- **Audit logging never throws.** `AuditLogService.log` returns `void` and swallows errors into the logger. Preserve this.
- **Health checks never throw.** Each dependency check is individually caught and degrades the status.
- Wrap third-party calls in `AbortController` + timeout, and `clearTimeout` in `finally`.

### Frontend

- All errors surface as `ApiError` with a `messages: string[]` (validation errors arrive as arrays).
- **Errors are toasts, raised in one place.** `app/providers.tsx` wires `QueryCache`/`MutationCache` `onError` → `toastError` (`lib/errors.ts`), which turns an `ApiError` into plain words (offline, session ended, not found, validation…). Components **don't** write `onError: toast.error(...)`; they set `meta: { errorContext: 'Couldn’t save the step' }` to name what failed. Failed loads get a Retry action automatically.
- `meta: { silent: true }` only when the component turns the failure into UI itself (a 404 that means "not set up yet", a redirect on not-found, an expected 400 race). Say why in a comment.
- Field validation stays inline (`FieldError` under the field); everything else — server validation included — is a toast. There is no `FormErrors` banner any more.
- A network failure is `ApiError` with `statusCode === NETWORK_ERROR_STATUS` (0), never a raw `TypeError`.
- **Handle expected non-200s as information, not failure.** Two established examples: a 404 from `GET /trigger` means "no trigger yet" → `null` in `useTrigger` (`features/workflow/queries.ts`); a 400 from cancel means a worker won the race → `toast.info` (the `cancel` mutation in `ExecutionDetailPage.tsx`).
- Never retry 4xx; retry an unreachable API once, 5xx twice (configured globally in `app/providers.tsx`).
- A session refresh that gets **no answer** (offline, 5xx) must not log the user out — `refreshSession` returns `'unreachable'` and `ProtectedRoute` offers a retry. Only a rejected refresh clears the session.
- User-facing words: **On / Paused / Draft** for workflows, **Queued / Running / Succeeded / Failed / Cancelled** for runs, **Runs** (not executions), **steps** (not actions). Use the label maps in `StatusBadge.tsx`; API enums stay unchanged.

---

## 11. Validation

Validation lives in **three** places and they must agree:

1. **Backend DTO** (`class-validator`) — authoritative for request shape.
2. **Domain normalizer** (e.g. `normalizePollingConfig`) — authoritative for business rules; throws plain `Error`, and the service converts it to a `BadRequestException`.
3. **Frontend Zod schema** — mirrors 1 and 2 for instant feedback. **Add a comment naming the backend rule it mirrors.**

`ValidationPipe` runs with `forbidNonWhitelisted: true`, so an unknown body field is a **400**, not a silent drop. When you add a field to a request, you must add it to the DTO or requests will fail.

**Note:** string config fields support `{{payload.x}}` templates, so frontend schemas for URL/email fields deliberately use `min(1)` rather than `.url()` / `.email()` — a template isn't a valid URL until interpolated. See the comment block in `action-meta.ts`.

---

## 12. Logging

- `private readonly logger = new Logger(ClassName.name)` as the first class member.
- `logger.log` for lifecycle, `logger.warn` for expected rejections (rate limits, inactive workflows), `logger.error` for genuine failures.
- Include identifiers: `` `workflow.triggered workflowId=${id} source=${source}` ``.
- **Never log secrets, tokens, passwords, or full webhook payloads.**
- Business events go to `AuditLogService`, not just the logger.

---

## 13. Styling rules

- **Tailwind utility classes inline.** No CSS modules, no styled-components, no `@apply`. `globals.css` is 5 lines.
- Palette: `slate` for neutrals, `indigo` for primary/interactive, `emerald` success, `red` danger, `amber` warning.
- Cards: `rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200`. Use `ring-*`, not `border-*`, for card outlines.
- Numeric columns get `tabular-nums`.
- **Colour must never be the sole carrier of meaning.** `StatusBadge` pairs every colour with text; `StatsWidget` pairs every bar segment with a label and count (there is a comment documenting CVD validation).
- Responsive prefixes `sm:` / `lg:` on grids and tables.

---

## 14–17. Task workflows → skills

These procedures now live as skills, loaded on demand instead of sitting in context every session. Invoke them by name:

| Task | Skill |
|---|---|
| Add an action executor or trigger type | `add-action-type` |
| Change the database schema | `prisma-migration` |
| Add a REST endpoint | `new-api-endpoint` |
| Add a dashboard page or route | `new-frontend-page` |

Source: `.claude/skills/<name>/SKILL.md`.

---

## 18. Important files

Read these before changing behaviour in their area.

| File | Why it matters |
|---|---|
| `backend/src/app.module.ts` | Composition root; global `JwtAuthGuard` registration |
| `backend/src/main.ts` | **Raw-body middleware for `/webhooks`** — fragile, see §19 |
| `backend/prisma/schema.prisma` | Source of truth for the data model |
| `backend/src/executions/workflow.processor.ts` | The execution engine |
| `backend/src/events/triggered.listener.ts` | Admission control: concurrency + rate limits |
| `backend/src/actions/action-executor.service.ts` | Action registry — one line per new type |
| `backend/src/common/utils/template.util.ts` | `{{payload.x}}` engine, used by every action |
| `backend/src/webhooks/webhooks.service.ts` | HMAC + idempotency — security critical |
| `backend/src/workflows/guards/workflow-owner.guard.ts` | The authorization boundary |
| `frontend/src/lib/api-client.ts` | Transport + single-flight refresh |
| `frontend/src/features/flow/action-meta.ts` | Frontend action model — 4 places to update per type |
| `packages/api-types/src/index.ts` | The contract between the two apps |

---

## 19. Things NOT to change

| Don't | Why |
|---|---|
| The `X-FlowForge-Signature` header name | Every already-configured external sender signs against it. Renaming silently breaks live integrations |
| The raw-body middleware in `main.ts` | Re-enabling the global body parser for `/webhooks` breaks **all** HMAC verification, silently and only in production |
| `timingSafeEqual` in `verifyHmac` | Reverting to `===` reintroduces a timing side channel |
| The `@@unique([workflowId, idempotencyKey])` constraint | It is the only thing making dedup race-safe |
| `jobId: execution.id` on enqueue | Provides idempotency at the queue layer |
| The `attemptsMade < maxAttempts` early return in `onFailed` | Removing it fires dead-letter bookkeeping on every retry |
| The rethrow at the end of `WorkflowProcessor.process` | Without it, BullMQ never retries |
| `AdminGuard` throwing when `ADMIN_SECRET` is unset | Failing open would expose the DLQ publicly |
| `AuditLogService.log` returning `void` and swallowing errors | Callers rely on it never breaking the audited operation |
| Single-flight refresh in `api-client.ts` | Concurrent refreshes spend a one-time-use token and log users out |
| `selectable` on React Flow nodes | Fully inert nodes get `pointer-events: none`, killing their buttons |
| The two-pass render in `ProtectedRoute` | Prevents a prerender/localStorage mismatch bouncing authenticated users to `/login` |
| Global `ValidationPipe` options | `forbidNonWhitelisted: true` is a deliberate strictness choice |
| Anything in `docs/` assumed to be shared | `docs/` is **gitignored** — collaborators and CI never see it |

---

## 20. Common pitfalls

1. **Editing `schema.prisma` without a migration.** This happened twice (F1) before the history was squashed to a baseline. Always pair them — CI's drift check fails otherwise.
2. **Adding a request field without adding it to the DTO.** `forbidNonWhitelisted` turns it into a 400.
3. **Forgetting `packages/api-types`.** No build step means no compile error at the boundary; you find out at runtime.
4. **Assuming every executor chains.** Only `HTTP_REQUEST` returns `enrichedPayload` (as `payload.http`). A new executor that should feed later steps must return it under its own namespaced key.
5. **Assuming `DELAY` is non-blocking.** The processor sleeps inline and holds the worker slot for the whole delay.
6. **Assuming retries are exactly-once.** A retry skips steps that already `SUCCEEDED` and resumes from the checkpointed `output`, but the failing step itself re-runs — make external writes idempotent where the API allows it.
7. **Unconditional `refetchInterval`.** Always gate on in-flight status.
8. **Using `@Public()` without `AdminGuard`** on an admin route — that makes it genuinely public.
9. **Forgetting the poller.** Any change to workflow status or trigger type must call `registerPoller` / `unregisterPoller`.
10. **`WorkflowOwnerGuard` doesn't filter archived.** It only checks ownership; the archived filter lives in the service.
11. **Port 3000 conflicts** on this machine. Use `PORT=3001` when smoke-testing.
12. **pnpm strictness.** A direct import must be a declared dependency of that workspace (this is why `express` had to be added to `backend`).
13. **`Trigger.enabled` has no API.** Don't build UI for toggling it.
14. **Two copies of the rate-limit key format** (`triggered.listener.ts` and `executions.service.ts`). Change one, change both.

---

## 21. Development philosophy

Inferred from consistent patterns across the codebase:

1. **Reliability over breadth.** Five actions, but full retry/DLQ/idempotency machinery. Don't add integrations at the cost of correctness.
2. **Document the shortcut, don't hide it.** The README has a Known Limitations table; the processor has a comment explaining exactly why `DELAY` blocks and what production would do instead. **If you take a shortcut, write it down in both places.**
3. **Constrain the UI to what the engine can do.** The canvas isn't a DAG editor because the engine isn't a DAG runner. Don't let the UI promise more than the backend delivers.
4. **Let infrastructure enforce invariants.** Unique constraints for dedup, atomic `INCR` for rate limits, BullMQ locks for concurrency — not application-level checks.
5. **Fail visibly, not destructively.** Unresolved templates stay visible; audit failures don't abort operations; health checks degrade rather than throw.
6. **Explain concepts in the UI.** Empty states and confirm dialogs teach the model.

---

## 22. Performance expectations

- **API responses < 100ms** for CRUD. Webhook ingress must return without waiting on anything downstream.
- **Every list endpoint paginates**, clamped at 100.
- **Every external call has a timeout**: HTTP action 10s, Resend 10s, Telegram 10s, polling 15s.
- **No unconditional polling** in the UI.
- **Watch for N+1.** Use `include`/`select` rather than looping queries. Known offenders to avoid copying: the 1000-job DLQ scan in `ExecutionsService.countFailedJobsForUser`, and the per-trigger `COUNT` in `TriggeredListener`.
- **Select only needed columns** on hot paths (`select: { id: true }`).

---

## 23. Security expectations

- SHA-256 for refresh tokens (high-entropy); `TokenCipher` for OAuth tokens that must be decrypted later.
- `timingSafeEqual` for every secret comparison.
- Secrets masked in **all** API responses; full values never returned, not even at creation.
- Protected by default; `@Public()` requires justification.
- Ownership checked on every resource access.
- `whitelist` + `forbidNonWhitelisted` on all input.
- Never log secrets or full payloads.
- **Be aware of SSRF:** `HTTP_REQUEST` and the polling worker fetch arbitrary user-supplied URLs with no allowlist. Don't widen this surface further without adding protection.
- **Credentials are global, not per-user.** `RESEND_API_KEY` and `TELEGRAM_BOT_TOKEN` are shared across all users. Don't build multi-user features that assume otherwise until a credential vault exists.

---

## 24. Code review checklist

Moved to the `flowstate-review` skill (`.claude/skills/flowstate-review/SKILL.md`) — invoke it before proposing or committing a change. It covers correctness, contracts, security, quality, frontend, and docs, plus the "things that must not change" list from §19.
