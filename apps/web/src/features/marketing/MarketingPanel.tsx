import { CheckCircle2, Sparkles } from 'lucide-react';

/**
 * Brand panel shown beside the auth form on the landing/login page. States the
 * positioning ("your content queue", not a "social media manager"). Pricing now
 * lives on the dedicated /pricing page.
 */

const VALUE_PROPS = [
  'Upload a backlog once — AI writes titles, captions, hashtags, and picks thumbnails.',
  'It spaces similar videos apart and posts on your schedule to TikTok, Reels & Shorts.',
  'It runs itself — and only pings you when something genuinely needs you.',
];

export function MarketingPanel() {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-primary flex items-center gap-2 text-xl font-bold tracking-tight">
          <Sparkles className="h-5 w-5" />
          PostPilot
        </div>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
          Upload once. Queue it. Walk away.
        </h1>
        <p className="text-muted-foreground mt-3 text-base">
          Your content queue on autopilot — batch once, stay consistent. We&apos;ll only ping you if
          we genuinely need you.
        </p>
      </div>

      <ul className="space-y-2.5">
        {VALUE_PROPS.map((v) => (
          <li key={v} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
