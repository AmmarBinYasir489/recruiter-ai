-- Optional default funnel selected when a drive is created. Applications may
-- later be moved to another published funnel from the recruiter portal.
ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "defaultFunnelId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Drive_defaultFunnelId_key" ON "Drive" ("defaultFunnelId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Drive_defaultFunnelId_fkey'
  ) THEN
    ALTER TABLE "Drive"
      ADD CONSTRAINT "Drive_defaultFunnelId_fkey"
      FOREIGN KEY ("defaultFunnelId") REFERENCES "Funnel"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
