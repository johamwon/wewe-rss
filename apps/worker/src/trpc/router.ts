import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { statusMap } from '../constants';
import type { TrpcContext } from './context';
import {
  deleteAccount,
  deleteFeed,
  getAccountById,
  getFeedById,
  listAccounts,
  listArticles,
  listFeeds,
  updateAccount,
  updateFeed,
  upsertAccount,
  upsertFeed,
} from '../services/db-queries';
import { toArticleDto } from '../db';
import {
  createLoginUrl,
  getBlockedAccountIds,
  getHistoryMpArticles,
  getInProgressHistoryMp,
  getIsRefreshAllMpArticlesRunning,
  getLoginResult,
  getMpArticles,
  getMpInfo,
  refreshAllMpArticlesAndUpdateFeed,
  refreshMpArticlesAndUpdateFeed,
  removeBlockedAccount,
} from '../services/trpc-service';

const t = initTRPC.context<TrpcContext>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.authError) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: ctx.authError });
  }
  return next({ ctx });
});

export const appRouter = t.router({
  account: t.router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 1000;
        const { items, nextCursor } = await listAccounts(
          ctx.env.DB,
          limit,
          input.cursor,
        );
        return {
          blocks: getBlockedAccountIds(),
          items,
          nextCursor,
        };
      }),
    byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
      const account = await getAccountById(ctx.env.DB, input);
      if (!account) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No account with id '${input}'`,
        });
      }
      return account;
    }),
    add: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1).max(32),
          token: z.string().min(1),
          name: z.string().min(1),
          status: z.number().default(statusMap.ENABLE),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const account = await upsertAccount(ctx.env.DB, input);
        removeBlockedAccount(input.id);
        return account;
      }),
    edit: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            token: z.string().min(1).optional(),
            name: z.string().min(1).optional(),
            status: z.number().optional(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const account = await updateAccount(ctx.env.DB, input.id, input.data);
        removeBlockedAccount(input.id);
        return account;
      }),
    delete: protectedProcedure
      .input(z.string())
      .mutation(async ({ ctx, input }) => {
        await deleteAccount(ctx.env.DB, input);
        removeBlockedAccount(input);
        return input;
      }),
  }),
  feed: t.router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 1000;
        const { items, nextCursor } = await listFeeds(
          ctx.env.DB,
          limit,
          input.cursor,
        );
        return { items, nextCursor };
      }),
    byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
      const feed = await getFeedById(ctx.env.DB, input);
      if (!feed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No feed with id '${input}'`,
        });
      }
      return feed;
    }),
    add: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          mpName: z.string(),
          mpCover: z.string(),
          mpIntro: z.string(),
          syncTime: z.number().optional().default(Math.floor(Date.now() / 1e3)),
          updateTime: z.number(),
          status: z.number().default(statusMap.ENABLE),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return upsertFeed(ctx.env.DB, input);
      }),
    edit: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            mpName: z.string().optional(),
            mpCover: z.string().optional(),
            mpIntro: z.string().optional(),
            syncTime: z.number().optional(),
            updateTime: z.number().optional(),
            status: z.number().optional(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return updateFeed(ctx.env.DB, input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.string())
      .mutation(async ({ ctx, input }) => {
        await deleteFeed(ctx.env.DB, input);
        return input;
      }),
    refreshArticles: protectedProcedure
      .input(
        z.object({
          mpId: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.mpId) {
          await refreshMpArticlesAndUpdateFeed(ctx.env, input.mpId);
        } else {
          await refreshAllMpArticlesAndUpdateFeed(ctx.env);
        }
      }),
    isRefreshAllMpArticlesRunning: protectedProcedure.query(() => {
      return getIsRefreshAllMpArticlesRunning();
    }),
    getHistoryArticles: protectedProcedure
      .input(
        z.object({
          mpId: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await getHistoryMpArticles(ctx.env, input.mpId ?? '');
      }),
    getInProgressHistoryMp: protectedProcedure.query(() => {
      return getInProgressHistoryMp();
    }),
  }),
  article: t.router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
          mpId: z.string().nullish(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 1000;
        const { items, nextCursor } = await listArticles(
          ctx.env.DB,
          limit,
          input.cursor,
          input.mpId,
        );
        return { items, nextCursor };
      }),
    byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
      const article = await ctx.env.DB
        .prepare('SELECT * FROM articles WHERE id = ?')
        .bind(input)
        .first();
      if (!article) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No article with id '${input}'`,
        });
      }
      return toArticleDto(article as any);
    }),
    add: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          mpId: z.string(),
          title: z.string(),
          picUrl: z.string().optional().default(''),
          publishTime: z.number(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await ctx.env.DB
          .prepare(
            `INSERT INTO articles (id, mp_id, title, pic_url, publish_time, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               pic_url = excluded.pic_url,
               publish_time = excluded.publish_time,
               mp_id = excluded.mp_id,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.id,
            input.mpId,
            input.title,
            input.picUrl ?? '',
            input.publishTime,
            Date.now(),
            Date.now(),
          )
          .run();
        return input;
      }),
    delete: protectedProcedure
      .input(z.string())
      .mutation(async ({ ctx, input }) => {
        await ctx.env.DB
          .prepare('DELETE FROM articles WHERE id = ?')
          .bind(input)
          .run();
        return input;
      }),
  }),
  platform: t.router({
    getMpArticles: protectedProcedure
      .input(z.object({ mpId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await getMpArticles(ctx.env, input.mpId);
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error?.data?.message || error.message,
            cause: error?.stack,
          });
        }
      }),
    getMpInfo: protectedProcedure
      .input(
        z.object({
          wxsLink: z
            .string()
            .refine((v) => v.startsWith('https://mp.weixin.qq.com/s/')),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await getMpInfo(ctx.env, input.wxsLink);
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error?.data?.message || error.message,
            cause: error?.stack,
          });
        }
      }),
    createLoginUrl: protectedProcedure.mutation(async ({ ctx }) => {
      return createLoginUrl(ctx.env);
    }),
    getLoginResult: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return getLoginResult(ctx.env, input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
