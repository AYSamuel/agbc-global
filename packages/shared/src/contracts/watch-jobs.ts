import { z } from 'zod';

// Contracts for the Watch background jobs (docs/spec/21 §5, 25 §3.5). Both are
// cron/service-invoked (never client-called): the request carries no body worth
// validating, so the contract is the response summary each run returns, used by
// deno tests, manual invocations, and later the dashboard's job-health view.

export const syncModeSchema = z.enum(['api', 'rss']);
export type SyncMode = z.infer<typeof syncModeSchema>;

export const youtubeSyncSummarySchema = z.object({
  mode: syncModeSchema,
  channelId: z.string(),
  /** Videos seen in the source this run (RSS caps at 15, docs/spec/08). */
  fetched: z.number().int().nonnegative(),
  upserted: z.number().int().nonnegative(),
  /** API mode only: rows whose youtube_id vanished from the uploads playlist. */
  markedUnavailable: z.number().int().nonnegative(),
  /** Rows whose youtube_id reappeared (restore is symmetric, docs/spec/08). */
  restored: z.number().int().nonnegative(),
  /** Stale is_live flags cleared (older than the 15-minute bound). */
  staleLiveCleared: z.number().int().nonnegative(),
});
export type YoutubeSyncSummary = z.infer<typeof youtubeSyncSummarySchema>;

export const liveDetectionSummarySchema = z.object({
  /** False outside every service window: the run exits without YouTube calls. */
  inServiceWindow: z.boolean(),
  channelId: z.string().nullable(),
  liveVideoId: z.string().nullable(),
  flagsCleared: z.number().int().nonnegative(),
});
export type LiveDetectionSummary = z.infer<typeof liveDetectionSummarySchema>;
