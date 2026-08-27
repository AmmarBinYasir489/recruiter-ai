ALTER TABLE "AiSetting"
  ADD COLUMN IF NOT EXISTS "model" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "providerKeys" TEXT NOT NULL DEFAULT '{}';

-- Preserve the currently configured encrypted key as the key for its provider.
UPDATE "AiSetting"
SET "providerKeys" = jsonb_build_object("provider", "apiKey")::text
WHERE "apiKey" <> ''
  AND ("providerKeys" = '' OR "providerKeys" = '{}');

-- The per-provider map is now authoritative; remove the duplicate legacy copy.
UPDATE "AiSetting"
SET "apiKey" = ''
WHERE "apiKey" <> ''
  AND "providerKeys" <> '{}';
