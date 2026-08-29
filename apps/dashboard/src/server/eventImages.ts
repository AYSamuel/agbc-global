import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import {
  imageRefusal,
  loadImageFacts,
  mintImageUpload,
  publicImageUrl,
  retireImage,
  verifyImageObject,
  type ImageExtension,
  type ImageFacts,
  type MintOutcome,
} from './imageShelf';

/**
 * The event-images shelf (docs/spec/11, docs/spec/02 §Storage; the storage contract is
 * `20260822120000_an_event_gets_a_picture.sql`).
 *
 * `sermonArtwork.ts`'s sibling, and everything bucket-shaped is the same code rather than
 * the same shape: `imageShelf.ts` holds the mint, the magic-byte read-back and the retire.
 * What is here is what touches `events`.
 *
 * TWO DIFFERENCES FROM THE ARTWORK MODULE, both in who is asking rather than what happens.
 *
 * A LEADER may do this, not only an admin. Their branch runs its own events, so the storage
 * policy reads `caller_is_moderator_live()` rather than `caller_is_admin_live()`. That
 * widens who may put bytes in the bucket and nothing else: WHICH event a picture may land on
 * is still decided by the events row policy, per branch. The bucket cannot do that scoping
 * (an object row has no branch) and does not try to.
 *
 * AND NOTHING HERE WRITES THE ROW. Unlike the artwork module, whose picture has a manage
 * screen of its own, an event's picture is a field on the event form (the approved frame),
 * so `saveEvent` stays the single writer of an event and calls the two functions below
 * around its own write. Two writers of one table would be two places to get the RLS
 * zero-row trap wrong, and that refusal is silent: an UPDATE a caller may not make is
 * FILTERED, not refused (pgTAP `050` proves the silence is real).
 */

type Client = SupabaseClient<Database>;

export const EVENT_IMAGES_BUCKET = 'event-images';

export type EventImageExtension = ImageExtension;
export type EventImageFacts = ImageFacts;
export type { MintOutcome };

export async function loadEventImageFacts(
  supabase: Client,
  path: string,
): Promise<EventImageFacts> {
  return await loadImageFacts(supabase, EVENT_IMAGES_BUCKET, path);
}

/**
 * Where the picture lives for anyone looking at it: assembled locally, no round trip, no
 * credential. The app builds the same URL the same way from the same path.
 */
export function eventImageUrl(supabase: Client, path: string): string {
  return publicImageUrl(supabase, EVENT_IMAGES_BUCKET, path);
}

export async function mintEventImageUpload(
  supabase: Client,
  extension: EventImageExtension,
): Promise<MintOutcome> {
  return await mintImageUpload(supabase, EVENT_IMAGES_BUCKET, extension);
}

/**
 * Are these bytes an image, and is the object really there?
 *
 * Called BEFORE the row points at the path, which is not a preference: the guard trigger
 * refuses a dangling reference outright, and a broken hero on the event page would be worse
 * than the branded cover it replaced, because the fallback is designed and a broken image is
 * not. A file that fails is discarded by the shelf, so a rejected upload cannot survive as
 * an attachable object.
 */
export async function verifyEventImage(supabase: Client, path: string) {
  return await verifyImageObject(supabase, EVENT_IMAGES_BUCKET, path);
}

/**
 * Retires the picture an event has just stopped pointing at.
 *
 * Called AFTER the row write, never before: the delete policy refuses to remove an object a
 * row still points at, so the other order cannot even be written. A failure here leaves an
 * orphaned file, which is storage garbage rather than a member-facing defect.
 */
export async function retireEventImage(
  supabase: Client,
  previousPath: string | null,
  currentPath: string | null,
): Promise<boolean> {
  return await retireImage(
    supabase,
    EVENT_IMAGES_BUCKET,
    previousPath,
    currentPath,
  );
}

export { imageRefusal as eventImageRefusal };
