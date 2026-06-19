import { router } from './trpc';
import { userRouter } from './routers/user';
import { connectionsRouter } from './routers/connections';

export const appRouter = router({
  user: userRouter,
  connections: connectionsRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
