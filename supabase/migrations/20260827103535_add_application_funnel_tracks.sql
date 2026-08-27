-- One drive application may participate in multiple independent funnel tracks.
-- Existing rows remain the root track; additional tracks point back to it and
-- keep their own stage, attempts, results, scores, and notifications.
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "sourceApplicationId" TEXT,
  ADD COLUMN IF NOT EXISTS "trackKey" TEXT NOT NULL DEFAULT 'PRIMARY';

ALTER TABLE "Application"
  DROP CONSTRAINT IF EXISTS "Application_candidateId_driveId_key";

DROP INDEX IF EXISTS "Application_candidateId_driveId_key";

ALTER TABLE "Application"
  DROP CONSTRAINT IF EXISTS "Application_sourceApplicationId_fkey";

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_sourceApplicationId_fkey"
  FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Application_candidateId_driveId_funnelId_key"
  ON "Application"("candidateId", "driveId", "funnelId");

CREATE UNIQUE INDEX IF NOT EXISTS "Application_candidateId_driveId_trackKey_key"
  ON "Application"("candidateId", "driveId", "trackKey");

CREATE INDEX IF NOT EXISTS "Application_sourceApplicationId_idx"
  ON "Application"("sourceApplicationId");

CREATE INDEX IF NOT EXISTS "Application_candidateId_driveId_idx"
  ON "Application"("candidateId", "driveId");
