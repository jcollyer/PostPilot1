import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';

import { appRouter, createTRPCContext, type SessionLike } from '@postpilot/api';
import { auth } from '@/server/auth';

/**
 * Resolve a caller session from the Better Auth session cookie. Both clients
 * end up here:
 *   - Web sends the cookie automatically.
 *   - Mobile attaches the Better Auth cookie (managed by the Expo plugin /
 *     SecureStore) via the tRPC client's `Cookie` header.
 *
 * Either way `auth.api.getSession` returns the same `{ session, user }` shape,
 * so the shared tRPC context looks identical to downstream code.
 */
async function resolveSession(req: NextRequest): Promise<SessionLike | null> {
  const result = await auth.api.getSession({ headers: req.headers });
  if (!result?.user?.id) return null;

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name ?? null,
      image: result.user.image ?? null,
    },
    expires:
      result.session.expiresAt instanceof Date
        ? result.session.expiresAt.toISOString()
        : new Date(result.session.expiresAt).toISOString(),
  };
}

const handler = async (req: NextRequest) => {
  const session = await resolveSession(req);

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ session, headers: req.headers }),
    onError({ error, path }) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`tRPC error on ${path ?? '<unknown>'}:`, error);
      }
    },
  });
};

export { handler as GET, handler as POST };
