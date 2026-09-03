-- Preserve each newly snapshotted attempt's selected questions/puzzle on reload.
-- Existing attempts remain unchanged; runtime lazily fills null snapshots.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public."AssessmentAttempt" ADD COLUMN IF NOT EXISTS "questionSnapshot" TEXT;
COMMIT;
