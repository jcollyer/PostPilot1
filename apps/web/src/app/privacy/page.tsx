import type { Metadata } from 'next';

import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy — PostPilot',
  description: 'How PostPilot handles your data. Short version: we don’t store your personal information.',
};

/**
 * /privacy — public privacy policy linked from the marketing footer.
 */
export default function PrivacyPage() {
  const lastUpdated = 'June 30, 2026';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-3 text-sm">Last updated {lastUpdated}</p>

          <div className="mt-10 space-y-8 text-base leading-relaxed">
            <p>
              PostPilot is built to respect your privacy. The short version: we do not store your
              personal information. This policy explains what that means in practice.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Information we don’t store</h2>
              <p>
                PostPilot does not collect, sell, or retain your personal information. We don’t build
                advertising profiles, we don’t share your data with third parties for marketing, and
                we don’t keep a copy of your content beyond what is needed to perform the action you
                asked for.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">How PostPilot works</h2>
              <p>
                When you connect a social account and queue content, PostPilot uses that information
                only to publish on your behalf and to show you your own queue. Anything processed to
                make this work — such as the videos you upload or the captions we generate — is used
                solely to deliver the service to you and is not retained for any other purpose.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Connected accounts</h2>
              <p>
                If you connect platforms like TikTok, Instagram Reels, or YouTube Shorts, PostPilot
                uses the access you grant only to post and manage the content you’ve queued. You can
                disconnect a platform at any time, which revokes that access.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Cookies and analytics</h2>
              <p>
                We use only the strictly necessary cookies required to keep you signed in and to
                operate the app. We do not use tracking cookies to follow you across other sites.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Your choices</h2>
              <p>
                Because we don’t retain your personal information, there is little for us to delete —
                but you can remove your account and disconnect any linked platforms at any time. If
                you have a question about your data, reach out and we’ll help.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Changes to this policy</h2>
              <p>
                If we ever change how we handle data, we’ll update this page and revise the date
                above. Continued use of PostPilot after a change means you accept the updated policy.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
              <p>
                Questions about this policy? Email us at{' '}
                <a href="mailto:privacy@postpilot.app" className="text-foreground font-medium hover:underline">
                  privacy@postpilot.app
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
