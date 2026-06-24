-- Per-video platform targeting. Empty array = "all connected platforms" (the
-- default), so existing videos keep cross-posting everywhere with no backfill.

-- AlterTable
ALTER TABLE "Video"
  ADD COLUMN "targetPlatforms" "Platform"[] NOT NULL DEFAULT ARRAY[]::"Platform"[];
