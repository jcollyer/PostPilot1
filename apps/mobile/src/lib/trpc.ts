import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@postpilot/api';

/**
 * Typed tRPC hooks for the mobile app. Imports the same `AppRouter` type the
 * Next.js web app uses, so every procedure is autocompleted and type-safe.
 */
export const trpc = createTRPCReact<AppRouter>();
