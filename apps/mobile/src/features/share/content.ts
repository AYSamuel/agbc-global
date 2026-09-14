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
  /** The row's id, which the QR encodes so a scan lands on this testimony (links.ts). */
  id: string;
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
  /** The row's id, which the QR encodes so a scan lands on this request (links.ts). */
  id: string;
  body: string;
  authorName: string | null;
  branchName: string | null;
  anonymous: boolean;
}

/**
 * An event (mockup `CARD · an event, with its picture` and `· with no picture`). The
 * words arrive FORMATTED, in the sharer's locale, because the card draws a date block
 * and a "Saturday · 7:00 PM" line and has no business owning `Intl`; the preset that
 * builds this runs the same formatters EVENT-DETAIL already runs. `imageUrl` is the
 * public `event-images` object, built rather than signed (`features/events/image.ts`),
 * or null for the common case.
 */
export interface EventShareContent {
  kind: 'event';
  id: string;
  title: string;
  /** `.scdate .d`, e.g. "24". */
  day: string;
  /** `.scdate .m`, e.g. "Aug". */
  month: string;
  /** `.scby`, e.g. "Saturday · 7:00 PM". */
  when: string;
  /** `.scby .b`: the branch and the venue, or null for a global event with no venue. */
  place: string | null;
  imageUrl: string | null;
}

/**
 * A message (mockup `CARD · a message`). `imageUrl` is what the artwork rule already
 * decided for every other surface (`features/watch/artwork.ts`): the church's own
 * artwork, else YouTube's thumbnail, else null and the ink ground. `meta` is the `.b`
 * line under the speaker, formatted by the preset.
 */
export interface SermonShareContent {
  kind: 'sermon';
  id: string;
  title: string;
  speaker: string;
  meta: string | null;
  imageUrl: string | null;
}

/** One `.scrows` row on a branch card: a clock or a pin, and the words beside it. */
export interface BranchShareRow {
  icon: 'clock' | 'pin';
  text: string;
  /** `.scrows b`: the Sunday line is the one a stranger came for. */
  strong: boolean;
}

/**
 * A branch (mockup `CARD · a branch`). The rows are the branch's own `service_times`
 * strings, untranslated on purpose: `02` stores what the branch wrote, and Berlin wrote
 * "Mittwochs 19:00 Uhr".
 */
export interface BranchShareContent {
  kind: 'branch';
  id: string;
  name: string;
  rows: BranchShareRow[];
}

export type ShareContent =
  | VerseShareContent
  | TestimonyShareContent
  | PrayerShareContent
  | EventShareContent
  | SermonShareContent
  | BranchShareContent;

export type ShareKind = ShareContent['kind'];
