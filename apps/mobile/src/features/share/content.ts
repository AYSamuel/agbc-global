/**
 * What a share card can be about (W4.15).
 *
 * ONE MEMBER PER SLICE, ON PURPOSE. Slice 1 builds the daily verse and nothing else, so
 * this union has one arm; slices 2 to 4 widen it as each card is drawn. `ShareKind` is
 * DERIVED from the union rather than written out beside it, so a new card kind cannot be
 * added without `ShareKind` growing with it, which is what makes the compile-time check
 * in `lib/analytics` bite: adding a share surface without naming it in the tracking plan
 * fails `pnpm typecheck` instead of shipping unmeasured (plan §8).
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

export type ShareContent = VerseShareContent;

export type ShareKind = ShareContent['kind'];
