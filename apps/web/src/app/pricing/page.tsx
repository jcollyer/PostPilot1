import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Pricing — PostPilot',
  description:
    'Simple, affordable plans for staying consistent. Start free, upgrade when your queue grows.',
};

/**
 * /pricing — public pricing page linked from the marketing homepage.
 */

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    blurb: 'A limited queue and uploads to try it out.',
    cta: 'Start free',
    features: [
      'Connect TikTok, Reels & Shorts',
      'Small upload queue',
      'AI captions & hashtags',
      'Automatic scheduling',
    ],
  },
  {
    name: 'Creator',
    price: '$5',
    blurb: 'For solo creators staying consistent.',
    cta: 'Choose Creator',
    featured: true,
    features: [
      'Everything in Free',
      'Larger upload queue',
      'AI thumbnails & smart spacing',
      'Priority publishing',
    ],
  },
  {
    name: 'Pro',
    price: '$8',
    blurb: 'Bigger queues and more headroom.',
    cta: 'Choose Pro',
    features: [
      'Everything in Creator',
      'Biggest upload queue',
      'More accounts per platform',
      'Early access to new features',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight">Simple, affordable pricing</h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Start free and upgrade when your queue grows. Affordable enough to be an impulse —
              cancel anytime.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-2xl border p-7 ${
                  t.featured
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border/60 bg-card shadow-sm'
                }`}
              >
                {t.featured ? (
                  <span className="bg-primary text-primary-foreground absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-medium">
                    Most popular
                  </span>
                ) : null}

                <h2 className="text-lg font-semibold">{t.name}</h2>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </p>
                <p className="text-muted-foreground mt-2 text-sm">{t.blurb}</p>

                <ul className="mt-6 space-y-3 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-2">
                  <Button
                    asChild
                    className="w-full"
                    variant={t.featured ? 'default' : 'outline'}
                  >
                    <Link href="/signin?mode=signup">
                      {t.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground mx-auto mt-12 max-w-xl text-center text-sm">
            Already have an account?{' '}
            <Link href="/signin" className="text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
