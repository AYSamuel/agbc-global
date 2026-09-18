import { z } from 'zod';

// Contract for the Watch background job (docs/spec/21 §5, 25 §3.5). It is
// cron/service-invoked (never client-called): the request carries no body worth
// validating, so the contract is the response summary each run returns, used by
// deno tests, manual invocations, and later the dashboard's job-health view.
//
// `liveDetectionSummarySchema` was here until 2026-08-15 and went with its function
// (ADR 0021: the app carries no live state, so nothing detects one).

export const syncModeSchema = z.enum(['api', 'rss']);
export type SyncMode = z.infer<typeof syncModeSchema>;

export const youtubeSyncSummarySchema = z.object({
  mode: syncModeSchema,
  channelId: z.string(),
  /**
   * The census: every video the channel still lists, walked to the end of both
   * tabs (W4.21). Distinct from `fetched`, and the distinction is the item: a
   * run reads the whole listing but pays for details on a bounded slice of it.
   * In RSS mode it is just what the 15-entry feed held.
   */
  listed: z.number().int().nonnegative(),
  /** playlistItems requests the census cost; 0 in RSS mode. */
  playlistPages: z.number().int().nonnegative(),
  /** Videos this run read details for, which is what it will write. */
  fetched: z.number().int().nonnegative(),
  /**
   * Listed videos still owed a details read after this run's budget ran out.
   * Falls to 0 once the archive has caught up, and is the number to watch while
   * the first backfill walks in over successive ticks.
   */
  pending: z.number().int().nonnegative(),
  upserted: z.number().int().nonnegative(),
  /** API mode only: rows whose youtube_id vanished from the uploads playlist. */
  markedUnavailable: z.number().int().nonnegative(),
  /** Rows whose youtube_id reappeared (restore is symmetric, docs/spec/08). */
  restored: z.number().int().nonnegative(),
});
export type YoutubeSyncSummary = z.infer<typeof youtubeSyncSummarySchema>;
