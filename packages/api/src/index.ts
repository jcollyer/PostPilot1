import { router } from './trpc';
import { userRouter } from './routers/user';
import { connectionsRouter } from './routers/connections';
import { mediaRouter } from './routers/media';
import { queueRouter } from './routers/queue';
import { notificationsRouter } from './routers/notifications';

export const appRouter = router({
  user: userRouter,
  connections: connectionsRouter,
  media: mediaRouter,
  queue: queueRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
