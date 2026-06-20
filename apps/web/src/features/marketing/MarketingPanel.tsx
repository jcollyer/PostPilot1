import { CheckCircle2, Sparkles } from 'lucide-react';

/**
 * Brand panel shown beside the auth form on the landing/login page. States the
 * positioning ("your content queue", not a "social media manager") and pricing.
 */

const VALUE_PROPS = [
  'Upload a backlog once — AI writes titles, captions, hashtags, and picks thumbnails.',
  'It spaces similar videos apart and posts on your schedule to TikTok, Reels & Shorts.',
  'It runs itself — and only pings you when something genuinely needs you.',
];

const TIERS = [
  { name: 'Free', price: '$0', blurb: 'A limited queue and uploads to try it out.' },
  { name: 'Creator', price: '$5', blurb: 'For solo creators staying consistent.', featured: true },
  { name: 'Pro', price: '$8', blurb: 'Bigger queues and more headroom.' },
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

      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
          Affordable enough to be an impulse
        </p>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`rounded-lg border p-3 ${t.featured ? 'border-primary bg-primary/5' : ''}`}
            >
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-lg font-semibold">
                {t.price}
                <span className="text-muted-foreground text-xs font-normal">/mo</span>
              </p>
              <p className="text-muted-foreground mt-1 text-[11px] leading-snug">{t.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
