/**
 * Shared types mirroring the FlowState backend API surface (Phases 1–3).
 * Hand-maintained against backend/prisma/schema.prisma and the controller
 * serializers — keep in sync when the API changes.
 */

// ---------------------------------------------------------------------------
// Enums (mirror backend/prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const WorkflowStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const ExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const TriggerType = {
  WEBHOOK: 'WEBHOOK',
  MANUAL: 'MANUAL',
  SCHEDULED: 'SCHEDULED',
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const ActionType = {
  LOG_MESSAGE: 'LOG_MESSAGE',
  DELAY: 'DELAY',
  HTTP_REQUEST: 'HTTP_REQUEST',
  SEND_EMAIL: 'SEND_EMAIL',
  TELEGRAM_NOTIFY: 'TELEGRAM_NOTIFY',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/** WebhookEvent.status values (stored as a plain string in the schema). */
export const WebhookEventStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  MANUAL: 'MANUAL',
  SKIPPED: 'SKIPPED',
  SKIPPED_CONCURRENCY_LIMIT: 'SKIPPED_CONCURRENCY_LIMIT',
  SKIPPED_RATE_LIMIT: 'SKIPPED_RATE_LIMIT',
} as const;
export type WebhookEventStatus = (typeof WebhookEventStatus)[keyof typeof WebhookEventStatus];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Body of POST /auth/google/exchange. Google is the only sign-in method:
 * the dashboard navigates to GET /auth/google/start?nonce=…&returnTo=…,
 * and lands back on /auth/callback?code=…&returnTo=… on success or
 * /login?error=<GoogleSignInError> on failure.
 */
export interface GoogleExchangeRequest {
  code: string;
  nonce: string;
}

export type GoogleSignInError =
  | 'access_denied'
  | 'state_expired'
  | 'email_unverified'
  | 'account_conflict'
  | 'google_failed';

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds (900 = 15 min). */
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** Decoded JWT access-token payload (client-side decode; no /auth/me yet). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  status: WorkflowStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  enabled?: boolean;
}

export type UpdateWorkflowRequest = Partial<CreateWorkflowRequest>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface LogMessageConfig {
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export interface DelayConfig {
  seconds: number;
}

export interface HttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SendEmailConfig {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}

export interface TelegramNotifyConfig {
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'Markdown';
}

export type ActionConfig =
  | LogMessageConfig
  | DelayConfig
  | HttpRequestConfig
  | SendEmailConfig
  | TelegramNotifyConfig;

/** Action as serialized by the API (`configuration`/`order`, not the raw DB columns). */
export interface Action {
  id: string;
  workflowId: string;
  type: ActionType | string;
  configuration: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActionRequest {
  type: ActionType | string;
  configuration?: Record<string, unknown>;
  order?: number;
}

export type UpdateActionRequest = Partial<CreateActionRequest>;

export interface ReorderActionsRequest {
  /** Every action ID in the workflow, in the desired order. */
  orderedIds: string[];
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** SCHEDULED trigger configuration (PollingConfig). */
export interface PollingConfig {
  /** Poll interval in seconds — backend floor is 30. */
  interval: number;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  stateKey?: string;
  changeMode?: 'any' | 'specific_field' | 'array_length';
}

export interface Trigger {
  id: string;
  workflowId: string;
  type: TriggerType;
  configuration: Record<string, unknown>;
  /** Masked for WEBHOOK triggers: first 8 chars + "..." — full secret is never returned. */
  secret: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTriggerRequest {
  type: TriggerType;
  configuration?: Record<string, unknown>;
}

export interface FireTriggerRequest {
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Webhook events & polling history
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  id: string;
  workflowId: string;
  payload: unknown;
  receivedAt: string;
  status: WebhookEventStatus | string;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface PollingEvent {
  id: string;
  triggerId: string;
  polledAt: string;
  changed: boolean;
  responseSnapshot: unknown;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ActionExecution {
  id: string;
  actionId: string;
  status: ExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExecutionDetail {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: ExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  actionExecutions: ActionExecution[];
}

export interface ExecutionStats {
  total: number;
  byStatus: Record<ExecutionStatus, number>;
  last24hTotal: number;
  avgDurationMs: number | null;
  failedJobsInDLQ: number;
  rateLimitRemaining: number | null;
  activeWorkers: { configuredConcurrency: number };
}

// ---------------------------------------------------------------------------
// Health & Admin
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: string;
  redis: string;
  queueDepth: number;
  workers: unknown;
}

export interface FailedJob {
  jobId: string;
  executionId: string;
  error: string;
  failedAt: string;
  attemptsMade: number;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Global exception-filter shape. `message` is an array for validation errors. */
export interface ApiErrorResponse {
  error: string;
  message: string | string[];
  statusCode: number;
  timestamp: string;
}
