# Project Vision: Video Queue

## Mission

Video Queue is the simplest way for creators to stay consistently active on short-form social media.

It is **not** a marketing platform.

It is **not** a social media manager.

It is an **AI-powered Content Queue** that automatically transforms a creator's backlog of videos into a publishing pipeline.

The promise is simple:

> **Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you.**

---

# The Problem

Most creators produce content in batches.

They spend an afternoon creating dozens of videos, then spend the next month manually uploading and scheduling them.

Existing tools focus on enterprise marketing teams and agencies. They overwhelm solo creators with analytics, collaboration tools, approvals, reports, CRMs, and AI features that don't solve the real problem.

The real problem is:

> "I have 150 videos. Can someone please keep posting them while I keep creating?"

Video Queue exists to be that "someone."

---

# The Product Philosophy

The product should feel like hiring a quiet, reliable employee.

You upload content.

The app organizes it.

The app builds your queue.

The app publishes every day.

You barely think about it.

A good employee runs the operation on their own — but flags you the moment something needs a human. Video Queue works the same way. It handles the steady state autonomously and reaches out **only** when it hits something it genuinely cannot resolve on its own, such as a disconnected account.

The user should trust the system enough that they don't check it every day — because they know it will contact them if it ever needs them.

---

# Target Audience

Primary

- YouTube Shorts creators
- TikTok creators
- Instagram Reels creators
- Faceless channels
- Drone creators
- Travel creators

Secondary

- Real estate agents
- Small businesses
- Local service businesses
- Solo entrepreneurs

Avoid enterprise and agency workflows.

---

# Core Value Proposition

Current tools make users manage calendars.

Video Queue manages content.

Creators don't think:

"I need to schedule Tuesday."

They think:

"I have 90 videos ready."

The queue should reflect how creators actually work.

---

# The Signature Feature

## AI Queue Builder

This is the defining feature of the product.

Instead of asking creators to organize hundreds of videos manually, the AI acts like a content manager.

Workflow:

1. User uploads 100–500 videos.
2. AI analyzes every video.
3. AI detects duplicate or near-duplicate uploads.
4. AI generates:

   - Titles
   - Captions
   - Hashtags
   - Suggested thumbnail frames

5. AI categorizes videos automatically.
6. AI identifies similar content.
7. AI intelligently spaces similar videos apart.
8. AI builds an optimized publishing queue based on the user's posting schedule.
9. User reviews the queue.
10. User clicks **Start Queue**.

The entire process should take minutes instead of hours.

The creator should feel like they hired a virtual assistant.

---

# MVP Features

## Authentication

- Email/password
- Google login (future)
- Token-based sessions that work seamlessly across web and the mobile app

---

## Platform Connections

Support only:

- TikTok
- Instagram Reels
- YouTube Shorts

Nothing else.

Each connected account stores its OAuth credentials securely, with proactive token refresh handled automatically in the background (see _Reliability & Notifications_).

---

## Media Library

- Upload videos
- Cover image (optional)
- Edit metadata
- Search
- Filter
- Preview

---

## Queue

The queue is the heart of the application.

Users can:

- Add videos
- Remove videos
- Drag to reorder
- Pause queue
- Resume queue
- Skip videos
- Move videos
- See upcoming posts

---

## Scheduling

Simple recurring schedules.

Examples:

- Every day at 9 AM
- Every weekday
- Monday/Wednesday/Friday
- Twice daily

Avoid complex calendar interfaces.

The queue consumes itself automatically. **Video Queue owns the schedule** — none of the target platforms offer reliable native scheduling (TikTok offers none at all), so the app's own scheduler computes what is due and triggers publishing at the right time.

---

## Automatic Publishing

Background workers publish content.

No phone.

No browser.

No confirmation dialogs.

No manual intervention in the steady state.

The queue continues operating on its own, day after day, without the creator logging in. The only time the creator is contacted is when a failure genuinely requires them — see below.

---

# Reliability & Notifications

The "walk away" promise is honest because the system is built to **detect, attempt to auto-fix, and escalate cleanly** rather than to guarantee it never fails. Failures fall into two buckets.

**Handled automatically (no human needed):**

- Proactive OAuth token refresh, performed on a schedule well before expiry. TikTok's rotating refresh tokens are persisted on every rotation; Instagram/Meta long-lived tokens are refreshed before they lapse.
- Transient publish failures are retried with exponential backoff.
- Platform processing delays are polled until complete.

**Escalated to the user (human-in-the-loop):**

- A connection that can no longer be auto-recovered — revoked access, a password change, the app being removed, or an account requiring full re-authentication.
- Content rejected by a platform.
- Any other condition the system cannot resolve on its own.

When an unrecoverable failure occurs, the system practices **per-platform graceful degradation**: it pauses only the affected platform, **holds** the impacted videos (never silently consuming or skipping them), surfaces a clear "Reconnect [Platform]" call to action in-app, and notifies the user. The other connected platforms keep publishing untouched, so one dead connection never takes down the whole queue.

Notification channels:

- **Email** (Resend) — default for most alerts.
- **Mobile push** (Expo) — for app users.
- **SMS** (Twilio) — reserved for the genuinely urgent "your queue is stalled until you act" alerts only, given SMS cost and US 10DLC registration overhead.

All alerts are **deduplicated and throttled** — one "reconnect TikTok" message, never one per failed video. The same notification surface powers Queue Health alerts (running low, estimated empty date), so "running low," "empty in 3 days," and "reconnect your account" are simply different states of one alerting system.

---

# AI Features

## AI Metadata Generation

Automatically generate:

- Titles
- Captions
- Hashtags

Creators edit instead of creating from scratch.

---

## Batch Metadata

Generate metadata for an entire upload session with one click.

Example:

Upload 75 videos.

Click:

Generate Metadata.

Return a minute later with every video populated.

---

## Duplicate Detection

Detect:

- Exact duplicates
- Near duplicates
- Trimmed versions
- Different exports of the same clip

Warn before queueing.

Implementation: perceptual hashing (pHash) catches exact, trimmed, and re-exported copies cheaply; embedding similarity (stored in pgvector) catches near-duplicates.

---

## AI Categories

Automatically organize videos into collections.

Examples:

Travel

Japan

Drone

Nature

Sunsets

Users can filter or build queues using categories.

---

## Smart Queue Ordering

AI avoids repetitive posting.

Instead of:

Drone

Drone

Drone

Drone

The AI creates:

Drone

Travel

Waterfall

City

Drone

The feed feels more varied and engaging.

This reuses the same embeddings computed for duplicate detection — one set of vectors powers both dedupe and the "space similar videos apart" logic.

---

## Thumbnail Suggestions

Choose the strongest frame automatically.

Allow creators to override it.

---

## Platform-Aware Captions

Generate captions optimized for:

- TikTok
- Instagram
- YouTube

Rather than using identical text everywhere.

---

## Queue Health

Display useful insights.

Examples:

Queue Remaining

87 videos

Estimated Coverage

43 days

Estimated Empty Date

August 14

Recommended Upload Date

Within 2 weeks

The goal is to reduce creator anxiety.

---

# Dashboard

Minimal.

Show only:

- Queue remaining
- Days of content remaining
- Next scheduled post
- Last published
- Connected accounts (with health/connection status)

No analytics dashboard.

No charts.

No engagement graphs.

---

# Explicitly Out of Scope

Do NOT build:

- Analytics
- Social inbox
- Comments
- Team collaboration
- Approval workflows
- Agencies
- Facebook
- LinkedIn
- Pinterest
- X
- AI chatbots
- AI image generation
- Social listening
- CRM
- Marketing automation

Stay relentlessly focused.

---

# Pricing

Free

- Limited queue
- Limited uploads

Creator

- $5/month

Pro

- $8–10/month

Affordable enough to feel like an impulse purchase.

> **Note:** No watermarking or superimposed branding on published content. TikTok's content guidelines prohibit adding any brand name, logo, watermark, or promotional overlay to content shared through its API, so this is excluded from all tiers to stay within platform Terms of Service.

---

# Technical Architecture

Video Queue is effectively **two systems sharing one codebase**:

1. **The interactive app** — the web and mobile experience the creator touches.
2. **The always-on engine** — the queue, scheduler, AI pipeline, and publishing workers that run on persistent compute whether or not anyone is logged in.

Getting that split right is the central architectural decision. The heavy, long-running work never runs inside serverless request handlers.

## Monorepo

- **Turborepo + pnpm workspaces**
- Shared packages for types, Zod schemas, the Prisma client, and domain logic — consumed by web, mobile, and the workers alike.

## Frontend — Web

- **Next.js** (App Router) + **TypeScript** + **Tailwind**
- **shadcn/ui** for components
- **dnd-kit** for drag-to-reorder in the queue

## Frontend — Mobile

- **React Native via Expo**
- Primary role: monitor queue health, light queue management, receive push notifications, reconnect accounts
- Push notifications via Expo

## API Layer

- Typed API shared by web and mobile (REST or tRPC)
- Core domain logic factored into a shared package so the workers reuse the exact same logic

## Authentication

- **Better Auth** — open source, self-hosted, first-class token/mobile support via its Expo plugin
- Email/password now; Google login later

## Database

- **Neon** (serverless Postgres) + **Prisma**
- **pgvector** (built into Neon) for embedding storage — powers duplicate detection and smart ordering without a separate vector database
- Pooled connection string for the serverless/Next.js side; a deliberate, separate connection strategy for long-running workers; migrations run from a single place

## Media Storage

- **Cloudflare R2** (zero egress fees — critical when repeatedly pulling video to push to three platforms)
- **Direct-to-storage uploads** via presigned multipart URLs — video never passes through the app server; the server only issues URLs and records metadata
- **Public URLs behind a CDN (Cloudflare)** — required because Instagram and TikTok fetch the video file from a hosted URL during publishing

## Background Jobs, Scheduler & Workers

- **Trigger.dev** — durable workflows with built-in cron scheduling, retries, concurrency limits, and step-based pipelines. The AI pipeline maps directly onto its step model; the daily "publish what's due" cron is a first-class feature. Failed steps emit events that drive the notification/alerting system.
- **Railway** — hosts the persistent worker/processing services (and the app, as desired). Real CPU/RAM and runtime for ffmpeg and AI work that serverless functions cannot provide.

## AI Processing Pipeline

For MVP, call hosted APIs to avoid GPU infrastructure entirely:

- **ffmpeg** — frame extraction and thumbnail candidates
- **Whisper (API)** — transcription, feeding metadata generation
- **Vision-capable LLM** — titles, captions, hashtags, categorization
- **pHash + embeddings (pgvector)** — duplicate detection and smart ordering

All pipeline work runs as durable jobs, never request/response.

## Notifications

- **Resend** — email
- **Expo** — mobile push
- **Twilio** — SMS, urgent alerts only

## Platform Publishing

Each platform implements a common publishing interface.

The queue only knows:

```
Publish(Video)
```

It does not know platform-specific implementation details.

Native adapters per platform (TikTok, Instagram, YouTube), each behind the `Publish(Video)` interface, handling that platform's OAuth, upload flow, rate limits, and compliance requirements.

---

# Platform Publishing Realities

The clean `Publish(Video)` abstraction is correct, but each adapter is a meaty integration. The **platform review/audit processes — not the code — are the critical path.** Key constraints to design around:

**TikTok (Content Posting API — Direct Post)**

- Fully automated server-side publishing is supported.
- Unaudited clients have content restricted to private viewing until a compliance audit is passed (can take weeks and requires a compliant UX).
- No scheduled-publish parameter — Video Queue's own scheduler handles timing.
- Tight limits: ~6 requests/minute per user token; ~15 posts/day per creator account.
- No superimposed branding/watermarks permitted (reflected in pricing).
- Compliant consent/disclosure UX required.

**Instagram Reels (Graph API)**

- Fully automatable: create container → poll until ready → publish.
- Requires a Business/Creator account linked to a Facebook Page, a Meta developer app, content-publishing permission, and Meta App Review (~2–4 weeks). Personal accounts excluded.
- Reels capped around 90 seconds via API.
- Video must be hosted at a publicly accessible URL (hence R2 + CDN).
- Roughly 25–100 published posts per 24 hours per account.

**YouTube Shorts (Data API v3)**

- Upload via OAuth (`youtube.upload` scope).
- As of the December 2025 quota change, a video upload costs ~100 units (down from ~1,600), so the default 10,000 units/day allows ~100 uploads/day. _(Verify current figures before launch.)_
- Unverified projects typically have uploads locked to private until audited.
- A "Short" is simply a qualifying vertical video, not a special upload type.

**Cross-cutting**

- Even via official APIs, botlike posting patterns can be throttled or restricted — favor humanized pacing.
- **Build-vs-buy:** a unified publishing API (e.g. Ayrshare and others) can skip per-platform audits and OAuth boilerplate for MVP, at a per-post cost and third-party dependency, then be replaced with native adapters later behind the same `Publish(Video)` interface.

> **Credential caveat:** API access approved for a _previous_ app is tied to that app's specific reviewed use case and UX. Reusing those credentials for Video Queue — a new product with a new UX, especially one whose original app is being sunset — may fall outside what was approved and can require re-audit/re-review. Confirm this before building on the existing keys, as discovering it at launch is expensive.

---

# Brand Positioning

Never describe Video Queue as a "social media management platform."

Instead describe it as:

- Your Content Queue
- Your Publishing Pipeline
- Your Posting Machine
- Your AI Content Manager

Messaging examples:

"Upload 100 videos. We'll handle the next 3 months."

"Your content should work while you don't."

"Stop scheduling posts. Start filling your queue."

"Batch once. Stay consistent."

"Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you."

---

# The North Star

A creator should spend one afternoon uploading months of content.

The AI should organize everything automatically.

The creator should review the queue, make any desired adjustments, click **Start Queue**, and confidently walk away.

When they return weeks later, their content has been consistently published across TikTok, Instagram Reels, and YouTube Shorts without any manual effort — and if anything ever required their attention, they were notified the moment it mattered, not left to discover a silent failure.

The software should feel less like a scheduling app and more like a dependable employee who quietly keeps their content business running in the background — and who knows exactly when to tap them on the shoulder.

> **Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you.**
