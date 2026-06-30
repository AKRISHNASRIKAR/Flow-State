CREATE TABLE "polling_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trigger_id" UUID NOT NULL,
  "polled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changed" BOOLEAN NOT NULL,
  "response_snapshot" JSONB,
  "error" TEXT,

  CONSTRAINT "polling_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "polling_events_trigger_id_idx" ON "polling_events"("trigger_id");
CREATE INDEX "polling_events_polled_at_idx" ON "polling_events"("polled_at");

ALTER TABLE "polling_events"
  ADD CONSTRAINT "polling_events_trigger_id_fkey"
  FOREIGN KEY ("trigger_id")
  REFERENCES "triggers"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
