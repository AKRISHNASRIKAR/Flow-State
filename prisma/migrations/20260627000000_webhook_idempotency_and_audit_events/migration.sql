ALTER TABLE "webhook_events" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "webhook_events_workflow_id_idempotency_key_key"
  ON "webhook_events"("workflow_id", "idempotency_key");

ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE TEXT USING "action"::TEXT;
