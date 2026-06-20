# Deploying PostPilot

PostPilot is two runtimes:

1. **The app** — the Next.js web app (and the API it serves). Hosted on **Railway**.
2. **The always-on engine** — the AI pipeline, scheduler, publishing, and
   notification jobs. Run as durable crons on **Trigger.dev**, which wrap the
   same framework-agnostic functions the local `*:watch` scripts call.

> You'll need a Neon database (already set up), a Cloudflare R2 bucket, an
> OpenAI key, your platform OAuth apps, and (optionally) Resend/Twilio — the
> same values from `.env`. Plus free accounts at railway.app and trigger.dev.

---

## 1. Database

Run migrations once against your production database (from your machine, with
production `DATABASE_URL`/`DIRECT_URL` in `.env`):

```bash
npm run db:migrate:deploy
```

---

## 2. Web app on Railway

1. Create a project at railway.app → **Deploy from GitHub repo**, pick this repo.
2. Railway reads `railway.json`: it installs **ffmpeg + Node 20** (Nixpacks),
   builds `@postpilot/web`, and starts it. No Dockerfile needed.
3. Add all environment variables (see the checklist below) in the service's
   **Variables** tab.
4. Set **`AUTH_URL`** (and `BETTER_AUTH_URL`) to the Railway URL Railway assigns
   (e.g. `https://postpilot-production.up.railway.app`), then update every
   platform OAuth **redirect URI** to that origin:
   - `https://<domain>/api/connections/tiktok/callback`
   - `https://<domain>/api/connections/instagram/callback`
   - `https://<domain>/api/connections/youtube/callback`
   - and the Google login callback if you enabled it.
5. Also add `<domain>` as a verified URL prefix in the **TikTok** dev portal
   (required for PULL_FROM_URL) and confirm `R2_PUBLIC_BASE_URL` is reachable.

The web app does **not** run ffmpeg/OpenAI work — that's the engine below — but
ffmpeg is included in the image anyway in case you later co-locate a worker.

---

## 3. The engine on Trigger.dev

The jobs live in `packages/jobs` (`trigger.config.ts` + `src/trigger/*`). They're
scheduled crons:

| Task | Cron | Wraps |
| --- | --- | --- |
| `refresh-connections` | hourly | `refreshDueConnections()` |
| `ai-process` | every 5 min | `processPending()` |
| `queue-reschedule` | hourly | `rescheduleAllActiveQueues()` |
| `publish-due` | every minute | `publishDueTasks()` |
| `notify-dispatch` | every 2 min | `dispatchPending()` |
| `queue-health` | daily | `runQueueHealthChecks()` |

Set up:

```bash
cd packages/jobs
npx trigger.dev@latest init      # links your Trigger.dev project, sets the ref
npm run trigger:dev              # test the crons locally against your DB
npm run trigger:deploy           # deploy to Trigger.dev's cloud
```

In the **Trigger.dev dashboard → Environment Variables**, add the same values
the engine needs: `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, all `R2_*`,
`TOKEN_ENCRYPTION_KEY`, every platform OAuth client (TikTok/IG/YouTube),
`AUTH_RESEND_KEY` + `EMAIL_FROM`, and (optional) `TWILIO_*` / `EXPO_ACCESS_TOKEN`.

`trigger.config.ts` already includes the **ffmpeg** build extension (so the AI
pipeline's frame/audio/pHash steps work) and the **Prisma** extension (so the
client is generated in the deployed image).

> Optional: trigger `ai-process` immediately after an upload instead of waiting
> for the 5-minute cron — call the task from `media.completeUpload`. The cron is
> the reliable floor.

---

## 4. Environment variable checklist

Core (web + engine): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`,
`TOKEN_ENCRYPTION_KEY`.
Auth email: `AUTH_RESEND_KEY`, `EMAIL_FROM` (+ optional `AUTH_GOOGLE_ID/SECRET`).
Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
AI (engine): `OPENAI_API_KEY`.
Platforms: `TIKTOK_*`, `IG_CLIENT_ID/SECRET/REDIRECT_URI`,
`YOUTUBE_CLIENT_ID/SECRET/REDIRECT_URI`.
Publishing (optional overrides): `TIKTOK_DEFAULT_PRIVACY`, `YOUTUBE_DEFAULT_PRIVACY`.
Notifications (optional): `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`,
`EXPO_ACCESS_TOKEN`.

---

## 5. Mobile (Expo)

The Expo app points at the deployed API via `EXPO_PUBLIC_API_URL`. Build/submit
with EAS (`eas build`) when you're ready; it's a read-only monitor today, so it
isn't required for the core publishing loop.

---

## 6. Going live on the platforms

Publishing only works publicly once each platform approves your app: TikTok
audit (unaudited = private/SELF_ONLY only), Meta App Review for Instagram
content publishing (Business/Creator account required), and Google verification
for the YouTube `youtube.upload` scope. Until then, keep the default
private/self-only visibility. Never add watermarks/branding to published content
(TikTok ToS).
