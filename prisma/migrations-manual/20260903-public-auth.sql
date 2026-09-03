-- Additive public-launch migration. Run once in the configured project's SQL
-- editor after backup. Does not delete users, applications, banks, or Storage.
-- Portal data access stays server-side (Prisma); no browser Data API access.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "authId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_authId_key" ON public."User" ("authId");
CREATE TABLE IF NOT EXISTS public."AuthRateLimit" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "AuthRateLimit_expiresAt_idx" ON public."AuthRateLimit" ("expiresAt");
DO $$
DECLARE portal_table TEXT;
BEGIN
  FOREACH portal_table IN ARRAY ARRAY[
    'AuthRateLimit','User','Session','UniversityTier','Drive','Funnel','Application',
    'AssessmentResult','AssessmentAttempt','Notification','AuditLog','OnsiteInvite',
    'RatBatch','RatSubmission','ThresholdChange','CvJob','Question','AiSetting'
  ] LOOP
    IF to_regclass(format('public.%I', portal_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', portal_table);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', portal_table);
    END IF;
  END LOOP;
END $$;
COMMIT;
