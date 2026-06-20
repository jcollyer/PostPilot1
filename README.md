# PostPilot

**Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you.**

PostPilot is an AI-powered content queue for short-form video creators. Batch-upload 100–500 videos; AI analyzes them (transcribes, writes titles/captions/hashtags, categorizes, detects duplicates, picks thumbnails, orders the queue to space similar content apart); you review and start the queue; background workers then publish to **TikTok, Instagram Reels, and YouTube Shorts** on a recurring schedule — autonomously, contacting you only when something genuinely needs a human (e.g. a connection breaks).

It's two systems sharing one codebase: the interactive web/mobile app, and an always-on engine (AI pipeline, scheduler, publishing + notification workers) that runs regardless of who's logged in.

## Tech stack

- **Turborepo** monorepo with npm workspaces (`@postpilot/*`).
- **Next.js (App Router)** web + **Expo / React Native** mobile, sharing a typed **tRPC** API.
- **Better Auth** (email/password + email verification via Resend; Google ready).
- **Neon Postgres + Prisma**, with **pgvector** for embeddings (dedupe + smart ordering).
- **Cloudflare R2** for media (presigned direct-to-storage uploads, public CDN).
- **OpenAI** (Whisper + GPT-4o vision + embeddings) for the AI pipeline; **ffmpeg** for frames/audio.
- **Trigger.dev** durable crons (scaffolded) on **Railway**; **Resend / Expo / Twilio** for notifications.

## Structure

```
apps/
  web/            Next.js app (dashboard, library, queue, settings, auth)
  mobile/         Expo app (read-only monitor + auth)
packages/
  api/            tRPC routers + AppRouter type
  db/             Prisma schema, client, migrations (pgvector)
  types/          Shared Zod schemas + enums
  connectors/     Platform OAuth adapters, token crypto + refresh
  storage/        R2 presigned uploads + public URLs
  ai-pipeline/    ffmpeg / Whisper / vision / embeddings / pHash / dedupe
  queue/          ordering + tz scheduler + PublishTask materializer
  publishing/     Publish(Video) adapters + retry/poll/degradation runner
  notifications/  email / push / SMS dispatch + queue-health alerts
  jobs/           Trigger.dev task definitions (cron wrappers)
  config/         Shared TypeScript configs
```

## Getting started

```bash
npm install                              # also runs prisma generate
cp .env.example .env                     # then fill in the values
npm run db:migrate:deploy                # apply migrations
npm run dev                              # web → http://localhost:3000
```

See `.env.example` for every variable (Neon, Better Auth, R2, OpenAI, the
platform OAuth clients, and the optional Twilio/Expo notification channels).

## The background engine

Heavy work never runs in request handlers. During development, run the worker
loops (each is a framework-agnostic entrypoint that Trigger.dev wraps in
production — see `DEPLOY.md`):

| Command | What it does |
| --- | --- |
| `npm run ai:watch` | Drains PENDING videos through the AI pipeline |
| `npm run publish:watch` | Publishes due posts + polls in-flight ones |
| `npm run notify:watch` | Queue-health checks + delivers notifications |
| `npm run refresh:connections` | Proactive OAuth token refresh |
| `npm run queue:reschedule` | Recomputes the publish plan |

ffmpeg must be installed locally (`brew install ffmpeg`) and on the worker host.

## Deployment

See **`DEPLOY.md`** for wiring Trigger.dev (durable crons) + Railway (hosting).

## Platform review realities

Publishing requires each platform's audit/verification before going public:
TikTok restricts unaudited apps to private posts, Instagram needs a Business/
Creator account + Meta App Review, and YouTube needs a verified project. Default
post visibility is private/self-only so you can test within those limits. No
watermarks or superimposed branding are added to published content (TikTok ToS).
