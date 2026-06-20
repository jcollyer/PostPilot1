import { defineConfig } from '@trigger.dev/sdk';
import { ffmpeg } from '@trigger.dev/build/extensions/core';
import { prismaExtension } from '@trigger.dev/build/extensions/prisma';

/**
 * Trigger.dev project config. The crons in ./src/trigger wrap PostPilot's
 * framework-agnostic worker functions (the same ones the local `*:watch`
 * scripts call) so they run durably in production.
 *
 * Set up:
 *   1. `cd packages/jobs && npx trigger.dev@latest init` (sets the project ref)
 *   2. `npm run trigger:dev` to test locally, `npm run trigger:deploy` to ship
 *
 * Build extensions:
 *   - ffmpeg(): the AI pipeline shells out to ffmpeg/ffprobe for frames,
 *     audio extraction, and pHash.
 *   - prismaExtension(): generates the Prisma client in the deployed image.
 */
export default defineConfig({
  // Replace via `trigger.dev init`, or set TRIGGER_PROJECT_REF.
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_REPLACE_ME',
  dirs: ['./src/trigger'],
  maxDuration: 3600,
  build: {
    extensions: [
      ffmpeg(),
      prismaExtension({ mode: 'legacy', schema: '../db/prisma/schema.prisma' }),
    ],
  },
});
