import { TRPCError } from '@trpc/server';

import { deleteAccountSchema, updateProfileSchema } from '@postpilot/types';

import { protectedProcedure, publicProcedure, router } from '../trpc';

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  createdAt: true,
} as const;

export const userRouter = router({
  /** Returns the current session, or null if signed out. */
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),

  /** Returns the full user record for the signed-in user. */
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: userSelect,
    }),
  ),

  /** Update the signed-in user's display name. */
  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(({ ctx, input }) =>
    ctx.prisma.user.update({
      where: { id: ctx.userId },
      data: { name: input.name },
      select: userSelect,
    }),
  ),

  /**
   * Permanently delete the signed-in user and all of their data.
   *
   * Every User relation in the schema declares `onDelete: Cascade`, so a
   * single `user.delete` atomically removes the entire ownership graph —
   * including all Session rows, which invalidates every signed-in device.
   *
   * Safety: the caller must pass `confirmEmail` matching the user's current
   * email exactly (case-insensitive). The UI also gates this behind a typed
   * confirmation modal.
   *
   * The session cookie on the client is not cleared by this mutation — the
   * caller is responsible for triggering sign-out afterwards so the now
   * invalid cookie is removed.
   */
  deleteAccount: protectedProcedure.input(deleteAccountSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
    }

    const typed = input.confirmEmail.toLowerCase();
    const expected = (user.email ?? '').toLowerCase();

    if (!expected || typed !== expected) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "The email you typed doesn't match the account email.",
      });
    }

    await ctx.prisma.user.delete({ where: { id: user.id } });

    console.log(`[user] account deleted: userId=${user.id}`);

    return { success: true as const };
  }),
});
