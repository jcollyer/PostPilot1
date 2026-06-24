-- DropIndex
DROP INDEX "Video_embedding_idx";

-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "daysOfWeek" DROP DEFAULT,
ALTER COLUMN "times" DROP DEFAULT,
ALTER COLUMN "platforms" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Video" ALTER COLUMN "hashtags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VideoPlatformMeta" ALTER COLUMN "hashtags" DROP DEFAULT;
