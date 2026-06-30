# PostPilot — Session Handoff

> Paste this into a new session to continue development. It describes what
> PostPilot is, the decisions already locked in, what's built (chunks 1–3),
> the environment/run constraints, and exactly what to build next.

---

## 0. How to use this doc (instructions for the next session)

You are picking up development of **PostPilot**, a monorepo already in progress.
**All planned chunks (1–10) are complete.** Read sections 1–6 for context. The
remaining work is operational, not feature-build: connect a live Trigger.dev
project + Railway deploy (see `DEPLOY.md`), pass each platform's API audit, and
the deferred mobile push/management features (section 6). Keep the existing
architecture and conventions (don't re-litigate decisions in section 4); confirm
scope-changing decisions with the user before building.

Important working constraint: **the assistant sandbox has no network access to
npm or the Neon database.** Write all code and migrations, then give the user
exact commands to run themselves (`npm install`, `npx prisma migrate deploy`,
etc.). The user runs them and reports back.

---

## 1. What PostPilot is

PostPilot is an **AI-powered content queue** for short-form video creators. Not
a social media manager, not a marketing platform. The promise: **"Upload once.
Queue it. Walk away — we'll only ping you if we genuinely need you."**

A creator batch-uploads 100–500 videos; AI analyzes them (transcribes,
generates titles/captions/hashtags, categorizes, detects duplicates, picks
thumbnails, orders the queue to space similar content apart); the creator
reviews and clicks **Start Queue**; background workers then publish to TikTok,
Instagram Reels, and YouTube Shorts on a recurring schedule — autonomously,
contacting the user only when something genuinely needs a human (e.g. a
connection breaks). Target users: solo/faceless/travel/drone creators (plus
small businesses). Explicitly NOT: analytics, social inbox, comments, teams,
approvals, agencies, Facebook/LinkedIn/X/Pinterest, chatbots, CRM.

It's effectively **two systems sharing one codebase**: (1) the interactive
web/mobile app the creator touches, and (2) an always-on engine (queue,
scheduler, AI pipeline, publishing workers) that runs on persistent compute
regardless of who's logged in. Heavy work never runs in serverless request
handlers.

---

## 2. Tech stack (as actually implemented)

- **Monorepo:** Turborepo + **npm workspaces** (note: spec said pnpm, but the
  repo uses npm — `packageManager: npm@10.9.0`). Node 20+ (sandbox has 22).
- **Web:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Mobile:** Expo / React Native (Expo Router), NativeWind.
- **API:** tRPC v11 (shared `AppRouter` type used by web + mobile).
- **Auth:** Better Auth (email/password + Expo plugin). Replaced NextAuth.
- **DB:** Neon Postgres + Prisma 5, **pgvector** (1536-dim embeddings).
- **Shared packages (rebranded `@postpilot/*` in Chunk 10):** `db`, `types`,
  `api`, `connectors`, `storage`, `ai-pipeline`, `queue`, `publishing`,
  `notifications`, `jobs`, `config`.
- **Storage:** Cloudflare R2 via the AWS S3 SDK (`@aws-sdk/client-s3` +
  `s3-request-presigner`). Decision locked in Chunk 4 (R2, not S3).
- **AI:** OpenAI for everything (Chunk 5) — Whisper transcription, GPT-4o
  vision for metadata, text-embedding-3-small. ffmpeg/ffprobe binaries on the
  worker host. `@saas/ai-pipeline` package; framework-agnostic (Trigger.dev
  wiring still deferred).
- **Queue/scheduler:** `@saas/queue` package (Chunk 6) — luxon for tz-aware
  slots; framework-agnostic with a `queue:reschedule` cron entrypoint. Web uses
  dnd-kit for drag-to-reorder. Cross-post model: one item per slot → all the
  schedule's platforms.
- **Publishing:** `@saas/publishing` package (Chunk 7) — native per-platform
  `Publish(Video)` adapters (TikTok/IG/YouTube), framework-agnostic runner with
  `publish:due`/`publish:watch` entrypoints. Default visibility is
  private/self-only (configurable). No external HTTP lib (native fetch).
- **Notifications:** `@saas/notifications` package (Chunk 8) — Resend (email) /
  Expo (push) / Twilio (SMS, urgent only) channel senders (native fetch),
  dispatcher with dedupe/throttle, queue-health producers, and `notify:*`
  entrypoints. In-app inbox via the `notifications` tRPC router + NavBar bell.
- **Planned but not yet wired:** Cloudflare R2 (storage), Trigger.dev (durable
  jobs/cron), Railway (worker host), Resend (email — partly used for auth),
  Expo push, Twilio (SMS). ffmpeg + Whisper + a vision LLM for the AI pipeline.

Repo layout:

```
apps/web         Next.js app (auth, tRPC route, settings, connections UI)
apps/mobile      Expo app (auth, tRPC, home/settings)
packages/db      Prisma schema + migrations + client
packages/types   Zod schemas + shared enums (Platform, statuses, scheduleRule)
packages/api     tRPC routers (user, connections) + context
packages/connectors  Platform OAuth adapters, token crypto, refresh service
packages/storage     R2 (S3-compatible) presigned uploads + public CDN URLs
packages/ai-pipeline AI steps (ffmpeg/Whisper/vision/embeddings/pHash/dedupe)
packages/queue       queue ordering + tz scheduler + PublishTask materializer
packages/publishing  Publish(Video) adapters + retry/poll/degradation runner
packages/notifications  email/push/SMS dispatch + dedupe/throttle + queue-health
packages/config  shared tsconfig
assets/icon      app icon (user-provided PostPilot logo) + render script
```

---

## 3. Build progress — DONE (chunks 1–3)

### Chunk 1 — Auth migration: NextAuth → Better Auth

- Prisma auth models swapped to Better Auth shapes (`user/session/account/
verification`; `emailVerified` is now Boolean; hashed password on `account`).
- `apps/web/src/server/auth.ts`: Better Auth instance — email/password with
  **required email verification via Resend**, Google scaffolded (only registers
  when `AUTH_GOOGLE_ID/SECRET` set), `expo()` + `nextCookies()` plugins. Reuses
  `AUTH_SECRET`/`AUTH_URL`/`AUTH_RESEND_KEY`.
- Handler at `/api/auth/[...all]`; removed old `[...nextauth]`, `auth-handlers`,
  and the custom `/auth/mobile` bearer-token bridge.
- Web: `lib/auth-client.ts`, login page → `AuthForm` (sign in / create account /
  forgot password), `/reset-password` page, `server/session.ts` helper, updated
  route guards, signout server actions, tRPC route resolves session via
  `auth.api.getSession({ headers })` (works for web cookie + mobile forwarded
  cookie — no more bearer tokens).
- Mobile: `lib/auth-client.ts` with `expoClient` plugin (SecureStore), passthrough
  AuthContext backed by `authClient.useSession()`, `TRPCProvider` forwards the
  Better Auth cookie, email/password sign-in screen.
- Deps: added `better-auth`, `@better-auth/expo`; removed `next-auth`,
  `@auth/prisma-adapter`.
- Migration: `packages/db/prisma/migrations/20260617000000_better_auth_init`.

### Chunk 2 — Domain data model + pgvector

- 14 domain models + 14 enums added to `schema.prisma`:
  `PlatformConnection`, `Video` (storage pointers, base metadata, transcript,
  `pHash`, `embedding vector(1536)`), `VideoPlatformMeta` (per-platform
  captions), `Category`, `UploadSession`, `ThumbnailCandidate`,
  `DuplicateMatch`, `Queue` (1:1 user), `QueueItem` (float `position` for dnd),
  `Schedule` (daysOfWeek + times + timezone), `PublishTask` (the per-platform
  Publish unit: scheduledAt, attemptCount/nextAttemptAt backoff, HELD state,
  platform post IDs), `Notification`, `NotificationDelivery`, `Device`.
- pgvector enabled via `previewFeatures=["postgresqlExtensions"]` +
  `extensions=[vector]`; `embedding` is Prisma `Unsupported("vector(1536)")` —
  **read/write it with raw SQL (`$queryRaw`/`$executeRaw`)**, not the typed
  client. HNSW cosine index created in the migration.
- `User` extended with `timezone`, `phoneNumber`, and product relations.
- Shared enums + `scheduleRuleSchema` exported from `@saas/types`.
- Migration: `20260617010000_domain_model`.

### Chunk 3 — Platform connections (native adapters)

- New `@saas/connectors` package (reused by web now, workers later):
  - `crypto.ts`: AES-256-GCM token encryption (`TOKEN_ENCRYPTION_KEY`), PKCE +
    state helpers.
  - Adapters for **TikTok** (PKCE, rotating refresh token persisted on rotation,
    sandbox/prod key switch), **Instagram** (short→long-lived token exchange,
    in-place 60-day refresh), **YouTube** (Google OAuth, offline refresh token,
    channel identity) behind a common `PlatformAdapter` interface + registry.
  - `connection-service.ts`: start/complete/disconnect, `getFreshAccessToken`
    (auto-refresh near expiry), `getConnectionOverview` (safe DTOs — never
    exposes tokens).
  - `refresh-service.ts`: `refreshConnection` (recoverable vs unrecoverable →
    mark `NEEDS_RECONNECT` + queue one deduplicated "Reconnect [Platform]"
    notification, other platforms untouched), `refreshDueConnections` cron
    entrypoint (`npm run refresh:connections`).
- tRPC `connections` router (`overview`, `disconnect`).
- Web OAuth redirect routes: `/api/connections/[platform]/start` + `/callback`
  with an encrypted state/PKCE cookie.
- Web `/settings/connections` page: connect / reconnect / disconnect + health
  badges; linked from settings.
- env added: `TOKEN_ENCRYPTION_KEY`, `TIKTOK_ENV` + redirect, YouTube creds +
  redirect; turbo `globalEnv` updated; root `refresh:connections` script.

### Chunk 4 — Media Library (direct-to-storage uploads)

- New **`@saas/storage`** package wrapping the AWS S3 SDK pointed at Cloudflare
  R2 (R2 is S3-compatible). Modules: `config.ts` (env + `publicUrlForKey` CDN
  builder + `isStorageConfigured`), `client.ts` (cached `S3Client`,
  `forcePathStyle`), `keys.ts` (key layout `users/<userId>/videos/<videoId>/…`),
  `presign.ts` (`planMultipart`, `createMultipartUpload`, `presignUploadParts`,
  `completeMultipart`, `abortMultipart`, `presignPut`, `deleteObject`,
  `deletePrefix`).
- Media Zod schemas in `@saas/types` (`media.ts`): init/complete/abort upload,
  cover upload, list/search/filter, updateMetadata, createUploadSession, plus
  accepted MIME lists + size caps (10 GB video / 15 MB cover).
- **`media` tRPC router** (`packages/api/src/routers/media.ts`), registered in
  `appRouter`: `initUpload` (creates `Video` UPLOADING + opens multipart +
  returns presigned part URLs), `completeUpload` (finalizes → status READY,
  sets `cdnUrl`, bumps `UploadSession.videoCount`), `abortUpload`,
  `initCoverUpload`/`confirmCoverUpload`, `list` (cursor pagination + search
  over title/caption/filename/transcript/hashtags + status/category filters),
  `get` (incl. platformMeta + thumbnails), `updateMetadata`, `remove`
  (deletes the storage prefix too), `createUploadSession`, `listUploadSessions`,
  `listCategories`. Every mutation checks ownership; storage-backed procedures
  throw a clean `PRECONDITION_FAILED` when R2 env is missing.
- **Web UI** at `/media`: `MediaLibraryView` (search + status/category filters +
  infinite-scroll grid), `UploadDialog` (drag/drop, multi-file, per-file
  progress, cancel — uploads each part via presigned PUT straight to R2, reads
  ETag, then `completeUpload`), `EditMetadataDialog` (title/caption/hashtags/
  category + cover image upload), inline preview (`<video src=cdnUrl>`). Upload
  helper at `features/media/upload.ts` (XHR PUT with progress + abort). Nav link
  "Library" added to `NavBar`.
- **Upload flow:** video bytes never touch the app server — server only issues
  presigned URLs and records metadata. After upload, `Video.status = READY` and
  `aiStatus = PENDING` (Chunk 5 picks up PENDING rows).
- env added: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (+ optional `R2_ENDPOINT`/`R2_REGION`); turbo
  `globalEnv` + `.env.example` updated. **No DB migration needed** — the `Video`/
  `UploadSession`/`Category`/`ThumbnailCandidate`/`VideoPlatformMeta` models
  already landed in Chunk 2.
- ⚠️ **Bucket setup the user must do** (see commands below): R2 CORS must allow
  `PUT` from the web origin and **expose the `ETag` header** (multipart needs
  it), and the bucket must be **publicly served** (r2.dev or a custom domain set
  as `R2_PUBLIC_BASE_URL`) because IG/TikTok fetch the file from that URL.

### Chunk 5 — AI Pipeline (OpenAI, framework-agnostic)

- New **`@saas/ai-pipeline`** package. Provider: OpenAI for everything
  (decision locked). Config in `config.ts` (`OPENAI_API_KEY` + overridable
  model names; `isAiConfigured`). ffmpeg/ffprobe invoked as binaries via
  `child_process` (no native deps) — `ffmpeg.ts` (`probeMedia`, `extractFrame`,
  `extractGray9x8`, `extractAudio`).
- Steps (`src/steps/`): `frames.ts` (sample 5 frames → upload to R2 →
  ThumbnailCandidate rows, returns JPEG buffers), `transcribe.ts` (Whisper;
  returns null when no audio — degrades gracefully), `metadata.ts` (GPT-4o
  vision over frames+transcript → base title/caption/hashtags + category +
  bestFrameIndex + per-platform variants, JSON-validated with zod),
  `persist.ts` (writes Video base fields, upserts Category, sets selected
  thumbnail, upserts VideoPlatformMeta per platform — **skips rows the user has
  edited**), `embeddings.ts` (text-embedding-3-small → pgvector via raw SQL),
  `duplicates.ts` (pHash Hamming + embedding cosine → DuplicateMatch rows,
  flags `isDuplicate`/`duplicateOfId`).
- `phash.ts` = dHash from a 9×8 gray frame (verified: gradient→`ffff…`,
  flat→`0000…`, 1-pixel flip→Hamming 1). `vectors.ts` = `writeEmbedding` +
  `findSimilarByEmbedding` (cosine `<=>`), **all raw SQL** (embedding column is
  Prisma `Unsupported`).
- Orchestration: `pipeline.ts#processVideo(videoId)` runs the ordered steps and
  drives `aiStatus` RUNNING→COMPLETED/FAILED (+ `aiProcessedAt`); each AI step is
  isolated so a late failure doesn't lose earlier work. `batch.ts`
  (`processPending`, `processUploadSession`). Worker entrypoint
  `jobs/process-pending.ts` → root script **`npm run ai:process`** (mirrors the
  Chunk-3 refresh entrypoint; Trigger.dev wraps this later, logic unchanged).
- **tRPC** (added to `media` router; heavy work stays in the worker — the router
  only reads state + enqueues): `aiSummary` (counts by aiStatus),
  `regenerateMetadata` (sets videos → PENDING for the worker; `onlyFailed`
  option), `selectThumbnail`, `setPlatformMeta` (marks `edited`), `duplicates`.
  `media.list`/`get` DTO now exposes `thumbnailUrl` (user cover ?? AI thumbnail).
- **Web**: library shows an AI-status bar + **Generate metadata** button (polls
  `aiSummary` while busy, auto-refreshes the grid); cards show AI state
  (spinner/✨/⚠) + a **duplicate** badge and use the AI thumbnail. Edit dialog
  gains a **thumbnail picker** and a **per-platform caption editor**.
- env added: `OPENAI_API_KEY` (+ optional model/`AI_BATCH_LIMIT`/`FFMPEG_PATH`/
  `FFPROBE_PATH`); turbo `globalEnv` + `.env.example` updated. **No DB migration**
  — all target models existed from Chunk 2.
- ⚠️ The worker host needs **ffmpeg installed** (present in dev; add to the
  Railway build for prod). The web server never calls OpenAI/ffmpeg.

### Chunk 6 — Queue + Scheduler (cross-post, materialize-only)

- New **`@saas/queue`** package (deps: db, types, **luxon**). Modules:
  `positions.ts` (float position helpers + renormalize), `embeddings.ts`
  (`readEmbeddings` bulk raw-SQL read of the pgvector column + cosine),
  `ordering.ts` (`orderBySpacing` — greedy diversification with a 2-item
  lookback; embedding-based, category fallback), `slots.ts` (`generateSlots` —
  tz-aware, DST-safe via luxon; weekday convention 0=Sun..6=Sat),
  `scheduler.ts` (`ensureQueue`, `recomputeSchedule`, `getUpcoming`),
  `service.ts` (`smartArrangeQueue`).
- **recomputeSchedule** is the heart: idempotent — deletes future SCHEDULED/HELD
  tasks + resets those items to PENDING, then (unless the queue is PAUSED or has
  no active schedules) walks PENDING items in position order, assigns each to the
  next slot, and creates one PublishTask per target platform (**cross-post**).
  Platforms resolve to the schedule's explicit list, else all ACTIVE
  connections; a task whose platform has no ACTIVE connection is created **HELD**
  (surfaces "reconnect needed"). Pure DB work — called after every queue
  mutation and by the cron entrypoint. Horizon `QUEUE_HORIZON_DAYS` (21),
  `QUEUE_MAX_SLOTS` (120).
- Worker entrypoint `jobs/reschedule.ts` → root script **`npm run
queue:reschedule`** (recomputes all ACTIVE queues; future Trigger.dev cron).
- **tRPC `queue` router** (registered): `get` (status + ordered items with
  per-platform task chips), `addVideos` (READY only, dedupes, appends),
  `removeItem`, `move` (float reposition), `skip`/`unskip`, `pause`/`resume`,
  `smartArrange`, `upcoming`, and schedule CRUD (`listSchedules`,
  `createSchedule`, `updateSchedule`, `deleteSchedule`). Every mutation
  re-runs `recomputeSchedule`.
- **Web** `/queue`: dnd-kit drag-to-reorder list (thumbnail, scheduled time,
  per-platform chips with reconnect warning, duplicate flag, skip/remove),
  pause/resume, **Smart arrange**, a schedule manager (days/times/platforms/
  timezone, prefilled with the browser tz), and a grouped **Upcoming posts**
  timeline. "Add to queue" added to library cards; nav link added.
- deps to install: **luxon** + `@types/luxon` (queue), **@dnd-kit/core,
  @dnd-kit/sortable, @dnd-kit/utilities** (web). `.env.example` + turbo
  `globalEnv` updated. **No DB migration** — Queue/QueueItem/Schedule/
  PublishTask all existed from Chunk 2.
- Scope: materializes PublishTasks as SCHEDULED/HELD + the upcoming view; it
  does NOT call platform APIs (that's Chunk 7).

### Chunk 7 — Publishing Engine (native adapters, framework-agnostic)

- New **`@saas/publishing`** package. `Publish(Video)` interface (`types.ts`) +
  per-platform adapters behind a registry (`getPublishAdapter`):
  - **TikTok** (`adapters/tiktok.ts`): creator_info → video/init (PULL_FROM_URL
    from the R2 CDN url) → poll status/fetch. Picks an allowed privacy level
    (prefers `TIKTOK_DEFAULT_PRIVACY`, falls back to SELF_ONLY). Handles
    TikTok's 200-with-error envelope.
  - **Instagram** (`adapters/instagram.ts`): create REELS container (video_url)
    → poll status_code → media_publish → best-effort permalink. Classifies IG
    error codes (190 etc → reconnect; 4/17/32/613 → retry).
  - **YouTube** (`adapters/youtube.ts`): resumable upload — init (reads the
    `Location` header) then PUTs bytes from R2 (`getObjectBuffer`). Returns
    PUBLISHED with a /shorts/ url. 403 quota → retry vs forbidden → reconnect.
- **runner.ts** `publishDueTasks({limit})`: selects due SCHEDULED (scheduledAt
  ≤ now) + PROCESSING tasks (nextAttemptAt ≤ now), resolves a fresh token via
  `getFreshAccessToken`, builds per-platform copy (VideoPlatformMeta override
  else base), calls `publish`/`poll`. Transitions: PUBLISHED (+ ids/url/
  publishedAt), PROCESSING (poll later, capped at `PUBLISH_MAX_POLLS`),
  recoverable → exponential backoff up to `PUBLISH_MAX_ATTEMPTS` then FAILED,
  auth → `markNeedsReconnect` + task HELD (per-platform degradation, others
  unaffected), rejected → FAILED. Failures create dedup `Notification` rows
  (PUBLISH_FAILED/CONTENT_REJECTED; send-side is Chunk 8). Rolls up QueueItem →
  PUBLISHING / COMPLETED.
- Errors classified by `PublishError {recoverable|needsReconnect|rejected}`.
- Worker entrypoints `jobs/publish-due.ts` + `jobs/publish-watch.ts` → root
  scripts **`npm run publish:due`** (one-shot) / **`npm run publish:watch`**
  (dev loop, default 30s). Trigger.dev cron wraps `publishDueTasks` later.
- **tRPC**: `queue.retryPublish` (FAILED/HELD → SCHEDULED now); `queue.get`
  task DTO now exposes `postUrl`/`lastError`/`id`. **Web** queue rows show
  status-aware platform chips (scheduled/processing ⟳/published ✓+link/failed
  ⚠), failed/held chips click to retry, and the page polls while anything is
  PROCESSING/PUBLISHING.
- env added: `TIKTOK_DEFAULT_PRIVACY`, `YOUTUBE_DEFAULT_PRIVACY`, retry/poll
  tunables, `IG_GRAPH_BASE/VERSION`; turbo `globalEnv` + `.env.example`. **No DB
  migration** — PublishTask existed from Chunk 2.
- ⚠️ Platform gotchas: TikTok PULL_FROM_URL needs `R2_PUBLIC_BASE_URL` added as
  a verified URL prefix in the TikTok portal; you can't actually post publicly
  until each app passes its audit/verification (default visibility keeps test
  posts private/self-only and within sandbox limits). YouTube uploads buffer the
  file in memory (`getObjectBuffer`) — fine for Shorts, revisit for huge files.

### Chunk 8 — Notifications (multi-channel dispatch + queue health)

- New **`@saas/notifications`** package (deps: db, types; native fetch — no
  provider SDKs). `config.ts`: channel routing (EMAIL + PUSH for all alerts; SMS
  only RECONNECT_REQUIRED + QUEUE_EMPTY), throttle window, provider detection.
  `channels.ts`: `sendEmail` (Resend, reuses AUTH_RESEND_KEY/EMAIL_FROM),
  `sendPush` (Expo push API), `sendSms` (Twilio Messages, Basic auth).
- `dispatcher.ts#dispatchPending`: consumes PENDING Notifications, fans out to
  the routed channels, writes a `NotificationDelivery` per channel (idempotent
  on notificationId+channel), dedupe-throttles repeats of the same `dedupeKey`
  within the window (→ SUPPRESSED), sets notification status SENT/FAILED. In-app
  delivery is implicit (the row itself). Missing provider/recipient is not a
  failure (in-app still counts).
- `queue-health.ts`: `computeQueueHealth` (remaining items, posts/day from
  active schedules, days remaining, estimated empty date — reused by the Chunk 9
  dashboard) + `runQueueHealthChecks` which raises QUEUE_LOW (< threshold days)
  / QUEUE_EMPTY alerts (deduped per user). `notify.ts#createNotification` is the
  shared dedup creator.
- Entrypoints → root scripts: **`npm run notify:dispatch`** (one-shot send),
  **`npm run notify:queue-health`** (raise low/empty alerts), **`npm run
notify:watch`** (dev loop: health-check + dispatch every ~30s). Trigger.dev
  crons wrap these later.
- **tRPC `notifications` router** (registered): `list` (cursor paginated, hides
  SUPPRESSED), `unreadCount`, `markRead`, `markAllRead`. **Web**: `NavBar` bell
  with unread badge (polls 30s) + dropdown inbox (mark read/all read, deep-links
  reconnect→/settings/connections, others→/queue).
- env added: `EXPO_ACCESS_TOKEN` (optional), `TWILIO_ACCOUNT_SID/AUTH_TOKEN/
FROM_NUMBER`, `NOTIFY_THROTTLE_MS`, `QUEUE_LOW_THRESHOLD_DAYS`; turbo
  `globalEnv` + `.env.example`. **No DB migration** — Notification/
  NotificationDelivery existed from Chunk 2.
- Note: email is testable now (Resend key already present); push needs the
  mobile app to register a Device; SMS needs a Twilio 10DLC number. All three
  light up automatically when their env/recipients are present. Publishing's
  own `createNotification` (Chunk 7) still writes rows the dispatcher delivers.

### Chunk 9 — Dashboard + Queue Health (web + read-only mobile)

- **tRPC `dashboard` router** (registered) `overview`: queue status + health
  (reuses `computeQueueHealth` from @saas/notifications — remaining, posts/day,
  daysRemaining, estimatedEmptyDate, plus a derived `recommendedUploadBy` =
  empty − 14d), next scheduled post, last published (with post URL), ready-video
  count, and connection health (`getConnectionOverview`). `@saas/notifications`
  added as an api dep for the shared health calc.
- **Web**: `/home` placeholder replaced with `DashboardView` — queue-health
  stats, next/last post cards, ready-in-library count, connected-account health
  badges (reconnect deep-links). Minimal, no analytics/charts (per spec).
- **Mobile** (read-only monitor, per the chosen scope): `(app)/index.tsx` now a
  pull-to-refresh dashboard mirroring web (queue health, next/last post,
  connection status) via the same `dashboard.overview`. Heavier management stays
  on web. Push-device registration + reconnect-from-mobile deferred (need a
  device/EAS build) — see gaps.
- **No DB migration**, no new packages, no new third-party deps.

### Chunk 10 — Branding + polish + infra

- **Rebrand**: every package renamed `@saas/*` → `@postpilot/*` (names, imports,
  tsconfig `extends`); root package `postpilot`; prisma global
  `__postpilot_prisma__`. Verified 0 `@saas/` left in source. **Run `npm install`
  to regenerate the workspace symlinks/lockfile after pulling.**
- **Naming/metadata**: web `<title>`/description, mobile `app.json`
  name/slug/scheme (`postpilot`) + bundle id `com.postpilot.app`, mobile + auth
  `APP_SCHEME` default `postpilot`, auth SecureStore `storagePrefix` `postpilot`,
  rewritten README.
- **Marketing**: landing/login page is now two-column — `MarketingPanel` (brand
  positioning + value props + pricing Free / Creator $5 / Pro $8) beside the
  auth form.
- **Trigger.dev scaffold** (`packages/jobs`, `@postpilot/jobs`): `trigger.config.ts`
  (ffmpeg + prisma build extensions) and six scheduled-task crons wrapping the
  existing functions — `refresh-connections` (hourly), `ai-process` (5 min),
  `queue-reschedule` (hourly), `publish-due` (1 min), `notify-dispatch` (2 min),
  `queue-health` (daily). Added `rescheduleAllActiveQueues()` to `@postpilot/queue`.
  Needs `@trigger.dev/sdk` + `@trigger.dev/build` installed and a real project ref
  (`npx trigger.dev init`).
- **Deploy**: `railway.json` (Nixpacks with ffmpeg, builds/starts `@postpilot/web`)
  - **`DEPLOY.md`** walkthrough (Railway web host + Trigger.dev engine + env
    checklist + platform-audit notes).
- No DB migration. New third-party deps to install: `@trigger.dev/sdk`,
  `@trigger.dev/build` (in `@postpilot/jobs`).

### Icon (side task, done)

- User supplied `assets/icon/postpilot-icon.png` (transparent blue "PP+wing"
  wordmark). Wired in: mobile `app.json` `icon` (white-flattened, iOS-safe) +
  `android.adaptiveIcon` (padded transparent + white bg); web favicon via
  Next file convention (`apps/web/src/app/icon.png` + `apple-icon.png`).

---

## 4. Decisions already locked (do NOT re-litigate)

- **Auth:** Better Auth, email/password + required verification now, Google
  "later" (conditional), mobile via Expo plugin (cookie-based, no bearer tokens).
- **Embeddings:** 1536-dim (OpenAI text-embedding-3-small family). One embedding
  set powers both dedupe and smart ordering.
- **Metadata:** base metadata on `Video` + per-platform overrides in
  `VideoPlatformMeta` (platform-aware captions).
- **Connections:** native per-platform adapters (NOT a unified API like
  Ayrshare). Tokens encrypted at rest. Refresh = framework-agnostic service +
  cron entrypoint; Trigger.dev wiring deferred to the jobs/publishing work.
- **Graceful degradation:** per-platform. `ConnectionStatus.NEEDS_RECONNECT`
  pauses only that platform; impacted `PublishTask`s get `HELD` (never dropped);
  one deduplicated reconnect alert.
- **Queue model:** one `Queue` per user; `QueueItem` slot with float `position`;
  per-platform publishing tracked by child `PublishTask` rows behind a
  `Publish(Video)` interface.

---

## 5. Environment & run notes

User runs all installs/migrations (sandbox can't reach npm/Neon).

Migrations applied so far (in order): `better_auth_init`, `domain_model`.
Apply new ones with:

```
npm install
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

`.env` already has: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`,
`AUTH_RESEND_KEY`, `EMAIL_FROM`, `AUTH_GOOGLE_ID/SECRET`, TikTok sandbox+prod
keys, `IG_CLIENT_ID/SECRET/REDIRECT_URI`, and **AWS S3** vars (`AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`).
Being added by user: `TOKEN_ENCRYPTION_KEY`, `YOUTUBE_CLIENT_ID/SECRET`
(reusing the same Google "PostPilot" OAuth client is fine — add the YouTube
redirect URI + enable YouTube Data API v3).

> ✅ **Resolved (Chunk 4):** storage is **Cloudflare R2** (user confirmed). The
> `@saas/storage` package talks to R2 through the AWS S3 SDK, so it stays
> S3-compatible if that ever changes. The old AWS S3 vars are gone from `.env`;
> the R2\_\* vars are what's used now.

For Chunk 4/5, the user adds: R2 storage vars (`R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`)
and `OPENAI_API_KEY`. R2 bucket also needs CORS (PUT from the web origin,
ExposeHeaders ETag) + public access (r2.dev or custom domain). No new DB
migration was needed for either chunk.

Useful scripts: `npm run dev` (web), `npm run mobile`, `npm run db:migrate`,
`npm run db:studio`, `npm run refresh:connections`, **`npm run ai:process`**
(one-shot: drains PENDING videos then exits — needs `OPENAI_API_KEY` + ffmpeg on
PATH), and **`npm run ai:watch`** (dev-only long-running poll that drains
PENDING every ~5s so "Generate metadata" clicks process automatically; stands in
for the future Trigger.dev cron/on-upload trigger), and **`npm run
queue:reschedule`** (recomputes the publish plan for all active queues), and
**`npm run publish:due`** (one-shot: publishes due tasks + polls in-flight) /
**`npm run publish:watch`** (dev loop), and the notification jobs **`npm run
notify:dispatch`** / **`npm run notify:queue-health`** / **`npm run
notify:watch`** — all future Trigger.dev crons. For Chunk 6 the user installs
**luxon** + `@types/luxon` and the three **@dnd-kit** packages; Chunks 7–8 added
no new third-party deps (native fetch).

---

## 6. Known gaps / cross-cutting TODOs

- Trigger.dev + Railway are **scaffolded but not deployed** (Chunk 10): the
  crons in `@postpilot/jobs` and `railway.json`/`DEPLOY.md` exist, but you must
  create the accounts, run `npx trigger.dev init` (real project ref), set env
  vars in both dashboards, and deploy. Until then the local `*:watch` scripts
  are the engine. The Railway image already includes ffmpeg (Nixpacks); the
  Trigger.dev image gets it via the ffmpeg build extension.
- Optional polish not done: trigger `ai-process` on upload (vs the 5-min cron)
  for instant metadata.
- AI pipeline runs sequentially per batch (rate-limit/CPU friendly) and has no
  concurrency lock yet — fine for the manual entrypoint; add idempotency/locking
  when Trigger.dev runs it on a schedule. Thumbnail "score" is left null (the
  vision model picks the best frame directly via `selectedThumbnailId`).
- Mobile has no connections/reconnect UI yet (reuses the `connections` tRPC
  router — build when needed). Mobile now has a read-only dashboard (Chunk 9)
  but no queue management, push-device registration, or reconnect flow yet.
- `recomputeSchedule` runs synchronously inside queue mutations and has no
  concurrency lock; fine for one user editing, but when Trigger.dev/publishing
  run it on a schedule, guard against racing a publish-in-progress (only future
  SCHEDULED/HELD tasks are cleared, so in-flight PROCESSING/PUBLISHED are safe).
- Publishing runs sequentially with no distributed lock — fine for the manual
  entrypoint / single worker; add locking/idempotency when Trigger.dev runs it
  concurrently. YouTube buffers the file in memory; switch to a streamed upload
  for very large files. No "publish now" override yet (only retry of failed/held).
- Publishing is untestable end-to-end until platform apps pass audit/verification
  (TikTok private-only sandbox; IG needs a Business/Creator acct + Meta App
  Review; YouTube needs a verified project). Default visibility is private/
  self-only so test posts stay within those limits.
- `NotificationDelivery` send-side (Resend/Expo/Twilio dispatch + throttle) not
  built — only the schema + the `markNeedsReconnect` record creation exist.
- Platform review realities (from spec) are the critical path, not code: TikTok
  sandbox restricts to private until audited; IG needs a Business/Creator
  account + Meta App Review for content-publishing; YouTube `youtube.upload` is
  a sensitive scope needing Google verification.

---

## 7. Remaining build plan (Chunks 4–10)

**Chunk 4 — Media Library** ✅ DONE (see section 3)
Direct-to-storage presigned multipart uploads on R2, public CDN URLs,
`Video`/`UploadSession` create+metadata via tRPC, optional cover image,
search/filter/preview, upload UI (web).

**Chunk 5 — AI Pipeline** ✅ DONE (see section 3)
Framework-agnostic step functions + `npm run ai:process` worker entrypoint
(Trigger.dev wrapping deferred). OpenAI for transcription/vision/embeddings;
ffmpeg for frames/audio/pHash. Reuses one embedding set for dedupe + ordering.

**Chunk 6 — Queue + Scheduler** ✅ DONE (see section 3)
`@saas/queue` package + `queue` tRPC router + `/queue` web UI: dnd-kit reorder
(float `position`), pause/resume/skip/move, recurring schedules, smart ordering
that spaces similar videos apart via embeddings, and an upcoming-posts view.
Cross-post, materialize-only (PublishTasks SCHEDULED/HELD). `npm run
queue:reschedule` cron entrypoint; Trigger.dev wrapping deferred to Chunk 7.

**Chunk 7 — Publishing Engine** ✅ DONE (see section 3)
`@saas/publishing` package: native TikTok/IG/YouTube `Publish(Video)` adapters +
retry/poll/degradation runner; `publish:due`/`publish:watch` entrypoints;
private-by-default visibility; web publish-status chips + retry. Trigger.dev
wrapping deferred to Chunk 10.

**Chunk 7 (orig spec) — Publishing Engine**
`Publish(Video)` per-platform implementations: TikTok Content Posting API
(Direct Post), Instagram container→poll→publish, YouTube resumable upload.
Exponential-backoff retries, processing polls, per-platform graceful
degradation (hold tasks when connection not ACTIVE). Reuses
`getFreshAccessToken` from `@saas/connectors`. Wire Trigger.dev cron for "publish
what's due" + the existing `refreshDueConnections`.

**Chunk 8 — Notifications** ✅ DONE (see section 3)
`@saas/notifications` package: Resend/Expo/Twilio channels + dispatcher with
dedupe/throttle + queue-health producers; `notify:*` entrypoints; in-app inbox
(notifications tRPC router + NavBar bell). Trigger.dev wrapping deferred.

**Chunk 9 — Dashboard + Queue Health** ✅ DONE (see section 3)
Web dashboard (`/home`) + read-only mobile monitor, both from `dashboard.overview`
(queue health, next/last post, connection status). No analytics/charts. Push
registration + mobile reconnect deferred.

**Chunk 9 (orig spec) — Dashboard + Queue Health**
Minimal web + mobile dashboards: queue remaining, days of content remaining,
next scheduled post, last published, connected-account health. No analytics/
charts. Mobile: queue monitoring, light management, reconnect, push.

**Chunk 10 — Branding + polish + infra** ✅ DONE (see section 3)
Rebranded `@saas/*` → `@postpilot/*` + app naming, marketing/pricing on the
landing page, Trigger.dev crons scaffolded (`@postpilot/jobs`) + Railway config

- `DEPLOY.md`. Live deploy + platform audits are operational steps for the user.

> 🎉 **All ten build chunks are complete.** What's left is operational: deploy
> (Trigger.dev + Railway per `DEPLOY.md`), pass the TikTok/Meta/YouTube API
> audits, and — when desired — the deferred mobile features (push-device
> registration, queue management + reconnect on mobile) and a "publish now"
> override.

---

## 8. North star

A creator spends one afternoon uploading months of content, the AI organizes
everything, they review, click **Start Queue**, and walk away. Weeks later their
content has posted consistently across TikTok, Instagram Reels, and YouTube
Shorts with zero manual effort — and if anything needed them, they were pinged
the moment it mattered. The software should feel like a dependable employee, not
a scheduling app.
