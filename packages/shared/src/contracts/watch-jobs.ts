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
  /** Videos seen in the source this run (RSS caps at 15, docs/spec/08). */
  fetched: z.number().int().nonnegative(),
  upserted: z.number().int().nonnegative(),
  /** API mode only: rows whose youtube_id vanished from the uploads playlist. */
  markedUnavailable: z.number().int().nonnegative(),
  /** Rows whose youtube_id reappeared (restore is symmetric, docs/spec/08). */
  restored: z.number().int().nonnegative(),
});
export type YoutubeSyncSummary = z.infer<typeof youtubeSyncSummarySchema>;
