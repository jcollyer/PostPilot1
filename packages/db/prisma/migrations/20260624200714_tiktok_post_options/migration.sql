-- TikTok Direct Post options on per-platform metadata.
-- Privacy is intentionally nullable with NO default: TikTok requires the
-- creator to manually choose a privacy level before posting.

-- AlterTable
ALTER TABLE "VideoPlatformMeta"
  ADD COLUMN "tiktokPrivacy" TEXT,
  ADD COLUMN "tiktokAllowComment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokAllowDuet" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokAllowStitch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokCommercial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokBrandOrganic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokBrandedContent" BOOLEAN NOT NULL DEFAULT false;
