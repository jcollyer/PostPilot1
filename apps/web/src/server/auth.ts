import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { expo } from '@better-auth/expo';
import { Resend } from 'resend';

import { prisma } from '@postpilot/db';

/**
 * Better Auth server instance — the single source of truth for authentication
 * across web and mobile.
 *
 *   - Email/password is the primary method for MVP. New signups must verify
 *     their email (verification mail is sent via Resend) before they can sign
 *     in.
 *   - Google is scaffolded but only registers when its env vars are present,
 *     so the app boots without it (it's a "later" provider per the spec).
 *   - The Expo plugin enables the mobile app to authenticate against this same
 *     server and persist the session in SecureStore.
 *   - `nextCookies()` must be the LAST plugin so Better Auth can set cookies
 *     from Next.js server actions.
 *
 * Sessions are cookie-based on both platforms, so the shared tRPC context only
 * ever sees one session shape regardless of client.
 */

const APP_SCHEME = process.env.MOBILE_APP_SCHEME ?? 'postpilot';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';

const resend = process.env.AUTH_RESEND_KEY ? new Resend(process.env.AUTH_RESEND_KEY) : null;

/**
 * Send a transactional email through Resend. If no key is configured (e.g. a
 * fresh local clone) we log the link instead of throwing, so verification
 * never hard-blocks local development.
 */
async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!resend) {
    console.warn(
      `[auth] AUTH_RESEND_KEY not set — would send "${opts.subject}" to ${opts.to}`,
    );
    return;
  }
  await resend.emails.send({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

function emailLayout(heading: string, body: string, cta: { href: string; label: string }): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
    <p style="font-size:14px;line-height:22px;color:#475569;margin:0 0 20px">${body}</p>
    <a href="${cta.href}" style="display:inline-block;background:#2d3f63;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${cta.label}</a>
    <p style="font-size:12px;line-height:18px;color:#94a3b8;margin:24px 0 0">If the button doesn't work, copy and paste this link:<br/>${cta.href}</p>
  </div>`;
}

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const auth = betterAuth({
  // Reuse the existing AUTH_* env vars so no .env changes are required to boot.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your PostPilot password',
        html: emailLayout(
          'Reset your password',
          'We received a request to reset your password. This link expires in one hour.',
          { href: url, label: 'Reset password' },
        ),
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your email for PostPilot',
        html: emailLayout(
          'Confirm your email',
          'Tap the button below to verify your email and finish setting up your account.',
          { href: url, label: 'Verify email' },
        ),
      });
    },
  },

  // Google is added only when configured — "later" per the product spec.
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: process.env.AUTH_GOOGLE_ID as string,
            clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
          },
        },
      }
    : {}),

  session: {
    // 90 days; refreshed at most once a day so active users effectively stay
    // signed in. Matches the previous NextAuth lifetime.
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
  },

  // The web origin plus the mobile custom scheme so the Expo app's requests
  // are accepted.
  trustedOrigins: [
    process.env.AUTH_URL ?? 'http://localhost:3000',
    `${APP_SCHEME}://`,
  ],

  // expo() enables the mobile flow; nextCookies() MUST stay last.
  plugins: [expo(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
