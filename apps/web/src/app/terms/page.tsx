import type { Metadata } from 'next';

import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Terms of Service — PostPilot',
  description: 'The terms that govern your use of PostPilot.',
};

/**
 * /terms — public terms of service linked from the marketing footer.
 */
export default function TermsPage() {
  const lastUpdated = 'June 30, 2026';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground mt-3 text-sm">Last updated {lastUpdated}</p>

          <div className="mt-10 space-y-8 text-base leading-relaxed">
            <p>
              These Terms of Service (“Terms”) govern your access to and use of PostPilot (the
              “Service”). By creating an account or using the Service, you agree to these Terms. If
              you don’t agree, please don’t use PostPilot.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Using PostPilot</h2>
              <p>
                You must be at least 13 years old (or the minimum age required in your country) to
                use the Service. You’re responsible for the activity on your account and for keeping
                your login credentials secure. Use PostPilot only for lawful purposes and in
                compliance with the terms of any platform you connect.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Your content</h2>
              <p>
                You retain ownership of the content you upload and queue. You grant PostPilot the
                limited permission needed to process and publish that content on your behalf to the
                platforms you connect. You’re responsible for ensuring you have the rights to the
                content you post and that it doesn’t violate any third party’s rights or the rules of
                the destination platforms.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Connected platforms</h2>
              <p>
                PostPilot publishes to third-party platforms such as TikTok, Instagram Reels, and
                YouTube Shorts using the access you grant. Your use of those platforms is governed by
                their own terms, and PostPilot isn’t responsible for changes they make to their APIs,
                policies, or availability.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Acceptable use</h2>
              <p>
                Don’t use PostPilot to post unlawful, infringing, or abusive content, to spam, to
                circumvent platform rules, or to interfere with the Service’s operation or security.
                We may suspend or terminate accounts that violate these Terms.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Plans and payment</h2>
              <p>
                Paid plans are billed in advance on a recurring basis and renew until cancelled. You
                can cancel at any time; cancellation takes effect at the end of the current billing
                period. Fees are non-refundable except where required by law.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Service availability</h2>
              <p>
                We work to keep PostPilot running reliably, but the Service is provided “as is”
                without warranties of any kind. We don’t guarantee that publishing will always
                succeed or that the Service will be uninterrupted or error-free.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, PostPilot and its operators won’t be liable
                for any indirect, incidental, or consequential damages, or for lost content, revenue,
                or data arising from your use of the Service.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Termination</h2>
              <p>
                You can stop using PostPilot and delete your account at any time. We may suspend or
                terminate access if you breach these Terms or use the Service in a way that creates
                risk or legal exposure.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Changes to these Terms</h2>
              <p>
                We may update these Terms from time to time. If we make material changes, we’ll
                update this page and revise the date above. Continued use of the Service after a
                change means you accept the updated Terms.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
              <p>
                Questions about these Terms? Email us at{' '}
                <a href="mailto:support@postpilot.app" className="text-foreground font-medium hover:underline">
                  support@postpilot.app
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
