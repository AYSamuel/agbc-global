/**
 * What a share card can be about (W4.15).
 *
 * ONE MEMBER PER SLICE, ON PURPOSE. Slice 1 built the daily verse; slice 2 added the
 * testimony and the prayer request. Slices 3 and 4 widen it as each card is drawn.
 * `ShareKind` is DERIVED from the union rather than written out beside it, so a new card
 * kind cannot be added without `ShareKind` growing with it, which is what makes the
 * compile-time check in `lib/analytics` bite: adding a share surface without naming it
 * in the tracking plan fails `pnpm typecheck` instead of shipping unmeasured (plan §8).
 *
 * THESE ARE FACTS, NOT PRESENTATION. `authorName` is null when the feed sent none, and
 * the CARD decides that null reads as "A member" (`family:aMember`), exactly as the feed
 * does; the branch is passed even for an anonymous request and the card is what drops it
 * (plan §5). Keeping the decisions on the card keeps them in one place, beside the frame
 * they come from, rather than spread across five call sites.
 */

/** The daily verse (mockup `CARD · daily verse`). */
export interface VerseShareContent {
  kind: 'verse';
  /** Scripture, unquoted: the card adds the curly quotes, as `VerseCard` already does. */
  text: string;
  /** e.g. "Philippians 4:19". */
  reference: string;
  /** e.g. "WEB" (docs/spec/07 §40: the World English Bible, chosen so a branded picture
   * of the text is licensing-clean). */
  translation: string;
}

/**
 * A testimony (mockup `CARD · a testimony`, `· with its photo`, `· a long testimony`).
 * The photo is an object path in the private `testimony-photos` bucket, signed per view
 * and never stored; the card mints its own URL and falls back to the ink ground when the
 * picture cannot be fetched, which the frame names as a state of this card.
 */
export interface TestimonyShareContent {
  kind: 'testimony';
  body: string;
  /** The feed's abbreviated display name ("Sarah O."), or null when the feed sent none. */
  authorName: string | null;
  branchName: string | null;
  photoPath: string | null;
}

/**
 * A prayer request (mockup `CARD · a prayer request`, `· posted anonymously`). An
 * anonymous request arrives with `authorName` null because the server never sent one
 * (ADR 0013); `anonymous` is passed alongside rather than inferred from that null, because
 * a NAMED author whose name failed to load is a different case from a member who asked
 * not to be named, and only the second drops the branch.
 */
export interface PrayerShareContent {
  kind: 'prayer';
  body: string;
  authorName: string | null;
  branchName: string | null;
  anonymous: boolean;
}

export type ShareContent =
  VerseShareContent | TestimonyShareContent | PrayerShareContent;

export type ShareKind = ShareContent['kind'];
