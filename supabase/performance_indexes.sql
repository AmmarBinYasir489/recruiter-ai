-- Additive, idempotent indexes for the portal's hot ownership, timeline, and
-- invitation queries. The current database is small, so these idempotent index
-- builds finish quickly and can be executed together by Prisma's db executor.
CREATE INDEX IF NOT EXISTS "Drive_ownerId_status_idx" ON "Drive" ("ownerId", "status");
CREATE INDEX IF NOT EXISTS "OnsiteInvite_applicationId_createdAt_idx" ON "OnsiteInvite" ("applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OnsiteInvite_scheduledAt_status_idx" ON "OnsiteInvite" ("scheduledAt", "status");
CREATE INDEX IF NOT EXISTS "RatBatch_driveId_createdAt_idx" ON "RatBatch" ("driveId", "createdAt");
CREATE INDEX IF NOT EXISTS "RatSubmission_applicationId_createdAt_idx" ON "RatSubmission" ("applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "RatSubmission_batchId_idx" ON "RatSubmission" ("batchId");
CREATE INDEX IF NOT EXISTS "ThresholdChange_funnelId_createdAt_idx" ON "ThresholdChange" ("funnelId", "createdAt");
CREATE INDEX IF NOT EXISTS "ThresholdChange_driveId_phaseType_idx" ON "ThresholdChange" ("driveId", "phaseType");
