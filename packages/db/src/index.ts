import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient instance across hot-reloads in dev so we don't
// exhaust the database connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __postpilot_prisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma: PrismaClient = globalThis.__postpilot_prisma__ ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__postpilot_prisma__ = prisma;
}

export * from '@prisma/client';
