import { prisma, PrismaClient } from '@postpilot/db';

/**
 * Minimal session shape the API expects from its consumer. The Next.js web
 * app passes in the Auth.js session; the mobile app's requests resolve to the
 * same shape via a bearer-token lookup. Keeping this loose lets us evolve
 * Auth.js without retyping the API.
 */
export interface SessionLike {
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  } | null;
  expires?: string;
}

export interface CreateContextOptions {
  session: SessionLike | null;
  headers?: Headers;
}

export function createTRPCContext(opts: CreateContextOptions): {
  session: SessionLike | null;
  headers: Headers | undefined;
  prisma: PrismaClient;
} {
  return {
    session: opts.session,
    headers: opts.headers,
    prisma,
  };
}

export type Context = ReturnType<typeof createTRPCContext>;
