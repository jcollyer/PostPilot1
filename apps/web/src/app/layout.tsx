import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PostPilot — Your content queue on autopilot',
  description:
    'Upload once. Queue it. Walk away. PostPilot auto-publishes your short-form videos to TikTok, Instagram Reels, and YouTube Shorts — and only pings you when it genuinely needs you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
