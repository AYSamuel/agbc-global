import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * The sermon-audio shelf (docs/spec/17 §4, docs/spec/08, frames approved 2026-08-14;
 * the storage contract is `docs/spec/plans/W3.1-audio-slice.md`).
 *
 * Everything runs through the CALLER's own client. The storage policies are the boundary
 * (live-table admin at aal2 writes; everyone mints reads) and the sermons admin policy
 * plus the `audio_path` guard trigger sit under every row write, so nothing here can
 * widen any of them. What this module owns is the ORDER of operations the database
 * cannot see across statements: verify the bytes before the row points at them, clear
 * the row before the file goes.
 *
 * The upload itself never passes through here: the browser sends the bytes straight to
 * storage under a signed upload URL this module mints (a 30 MB file must not ride
 * through a server action). What the browser DID upload is then treated as untrusted:
 * `attachAudio` reads the object's own first bytes and refuses anything that is not
 * MPEG audio or an MP4 container, whatever the file was named or declared as
 * (~/.claude/standards/security.md §File uploads: never trust the client's Content-Type).
 */

type Client = SupabaseClient<Database>;

export const SERMON_AUDIO_BUCKET = 'sermon-audio';

/** Mirrors the bucket row's file_size_limit (150 MiB), for the client-side early refusal. */
export const MAX_AUDIO_BYTES = 157286400;

/**
 * Mirrors the storage INSERT policy's name rule: machine-minted `<uuid>.<ext>`, nothing
 * traversable, nothing human-written. Validated here as well so a forged form field is
 * refused before any storage round trip.
 */
const OBJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|aac)$/;

export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac'] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

/** Ceiling for a believable sermon: 10 hours, in seconds. Display metadata, not authority. */
const MAX_DURATION_SECONDS = 36000;

export interface ShelfRow {
  id: string;
  title: string;
  speaker: string;
  series: string | null;
  youtubeId: string | null;
  audioPath: string | null;
  durationSec: number | null;
  publishedAt: string;
  kind: 'video' | 'live_replay';
}

export interface Shelf {
  rows: ShelfRow[];
  withAudio: number;
  withoutAudio: number;
  audioOnly: number;
}

export type ShelfFilter = 'all' | 'without' | 'with' | 'audio_only';

const SERMON_FIELDS =
  'id, title, speaker, series, youtube_id, audio_path, duration_sec, published_at, kind';

/**
 * The shelf: recent messages newest-first, and the three counts.
 *
 * Available rows only, everywhere. An `unavailable` row is a YouTube video that vanished
 * (docs/spec/08 rot handling); nagging the media team to add audio to a message members
 * cannot open would be work with no destination. The counts are shelf-wide and the list
 * is a window, which is why they are counted by the database rather than from the rows.
 */
export async function loadShelf(
  supabase: Client,
  filter: ShelfFilter = 'all',
): Promise<Shelf> {
  let query = supabase
    .from('sermons')
    .select(SERMON_FIELDS)
    .eq('status', 'available')
    .order('published_at', { ascending: false })
    .limit(30);
  if (filter === 'without') query = query.is('audio_path', null);
  if (filter === 'with') query = query.not('audio_path', 'is', null);
  if (filter === 'audio_only') query = query.is('youtube_id', null);

  const [list, withAudio, withoutAudio, audioOnly] = await Promise.all([
    query,
    supabase
      .from('sermons')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available')
      .not('audio_path', 'is', null),
    supabase
      .from('sermons')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available')
      .is('audio_path', null),
    supabase
      .from('sermons')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available')
      .is('youtube_id', null),
  ]);
  if (list.error) throw new Error(list.error.message);
  for (const counted of [withAudio, withoutAudio, audioOnly]) {
    if (counted.error) throw new Error(counted.error.message);
  }

  return {
    rows: list.data.map((row) => ({
      id: row.id,
      title: row.title,
      speaker: row.speaker,
      series: row.series,
      youtubeId: row.youtube_id,
      audioPath: row.audio_path,
      durationSec: row.duration_sec,
      publishedAt: row.published_at,
      kind: row.kind,
    })),
    withAudio: withAudio.count ?? 0,
    withoutAudio: withoutAudio.count ?? 0,
    audioOnly: audioOnly.count ?? 0,
  };
}

/**
 * The banner's subject: the newest watchable message with no audio yet. Filter-blind on
 * purpose (the banner must not vanish because the reader is looking at another tab), and
 * never an audio-only row, which cannot be missing its audio.
 */
export async function loadNewestMissing(
  supabase: Client,
): Promise<ShelfRow | null> {
  const { data, error } = await supabase
    .from('sermons')
    .select(SERMON_FIELDS)
    .eq('status', 'available')
    .is('audio_path', null)
    .not('youtube_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    speaker: data.speaker,
    series: data.series,
    youtubeId: data.youtube_id,
    audioPath: data.audio_path,
    durationSec: data.duration_sec,
    publishedAt: data.published_at,
    kind: data.kind,
  };
}

export async function loadSermon(
  supabase: Client,
  id: string,
): Promise<ShelfRow | null> {
  const { data, error } = await supabase
    .from('sermons')
    .select(SERMON_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    speaker: data.speaker,
    series: data.series,
    youtubeId: data.youtube_id,
    audioPath: data.audio_path,
    durationSec: data.duration_sec,
    publishedAt: data.published_at,
    kind: data.kind,
  };
}

/** What the manage screen states about the file, read from the object itself. */
export interface AudioFacts {
  sizeBytes: number | null;
  shelvedAt: string | null;
}

export async function loadAudioFacts(
  supabase: Client,
  path: string,
): Promise<AudioFacts> {
  const { data, error } = await supabase.storage
    .from(SERMON_AUDIO_BUCKET)
    .list('', { search: path, limit: 1 });
  const object = error ? null : data.find((entry) => entry.name === path);
  return {
    sizeBytes: readSize(object?.metadata),
    shelvedAt: object?.created_at ?? null,
  };
}

function readSize(metadata: unknown): number | null {
  if (metadata && typeof metadata === 'object' && 'size' in metadata) {
    const size = metadata.size;
    return typeof size === 'number' ? size : null;
  }
  return null;
}

export type MintOutcome =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; reason: 'refused' | 'failed' };

/**
 * A one-shot door for one upload: a machine-minted name and a signed upload URL token.
 *
 * Minted server-side, after authorize(), so the name rule is never in the browser's
 * hands. The token is single-use and the storage INSERT policy still stands under it, so
 * a caller whose role changed between mint and upload is refused by the layer that
 * matters.
 */
export async function mintUpload(
  supabase: Client,
  extension: AudioExtension,
): Promise<MintOutcome> {
  const path = `${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(SERMON_AUDIO_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return { ok: false, reason: 'failed' };
  // signedUrl as well as token: the browser uploads over XHR rather than supabase-js,
  // because XHR is the one path that reports progress, and a 30 MB upload with no
  // progress is indistinguishable from a hang.
  return { ok: true, path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Are these first bytes actually audio we can serve?
 *
 * Accepted shapes: an ID3-tagged or bare MPEG audio stream (MP3, and ADTS AAC shares the
 * frame-sync form), or an MP4 container (`ftyp` at offset 4: M4A). Exported so the
 * refusal is unit-testable byte by byte without a storage round trip.
 */
export function isAudioMagic(bytes: Uint8Array): boolean {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return true;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true;
  }
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  return false;
}

type Verification = 'audio' | 'missing' | 'not_audio';

/**
 * Reads the object's own first bytes through a short-lived signed URL.
 *
 * A Range request, so a 60 MB check costs 12 bytes, and a timeout, because every
 * outbound call gets one (~/.claude/standards/backend.md): a stalled storage host must
 * fail the save, not hang the action.
 */
async function verifyAudioObject(
  supabase: Client,
  path: string,
): Promise<Verification> {
  const { data, error } = await supabase.storage
    .from(SERMON_AUDIO_BUCKET)
    .createSignedUrl(path, 60);
  if (error) return 'missing';

  const response = await fetch(data.signedUrl, {
    headers: { Range: 'bytes=0-11' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return 'missing';

  const bytes = new Uint8Array(await response.arrayBuffer());
  return isAudioMagic(bytes) ? 'audio' : 'not_audio';
}

export interface AttachInput {
  sermonId: string;
  path: string;
  durationSec: number;
  speaker: string;
  series: string | null;
}

export type AttachOutcome =
  | { ok: true; replaced: boolean }
  | {
      ok: false;
      reason:
        'invalid' | 'not_audio' | 'missing' | 'gone' | 'refused' | 'failed';
    };

/**
 * Puts an uploaded file on a message: verify the bytes, write the row, then retire any
 * file it replaces.
 *
 * The order is load-bearing at both ends. The bytes are checked BEFORE the row points at
 * them, and a file that fails the check is discarded on the spot, so a renamed .exe never
 * exists as anything but an unreferenced object for a few seconds. The OLD file goes
 * LAST, only after the row has moved on, because the delete policy refuses to remove a
 * referenced object; a failure at that final step leaves an orphaned file, which is
 * storage garbage, not a member-facing defect, and it is reported rather than thrown.
 */
export async function attachAudio(
  supabase: Client,
  input: AttachInput,
): Promise<AttachOutcome & { oldFileRemoved?: boolean }> {
  const invalid = validateAttach(input);
  if (invalid) return { ok: false, reason: 'invalid' };

  const verified = await verifyAudioObject(supabase, input.path);
  if (verified === 'missing') return { ok: false, reason: 'missing' };
  if (verified === 'not_audio') {
    // Discarded immediately: nothing should keep a non-audio file shelvable. The path is
    // unreferenced (the row write never happened), so the delete policy allows this.
    await supabase.storage.from(SERMON_AUDIO_BUCKET).remove([input.path]);
    return { ok: false, reason: 'not_audio' };
  }

  const current = await loadSermon(supabase, input.sermonId);
  if (!current) return { ok: false, reason: 'gone' };
  const previousPath = current.audioPath;

  // duration_sec is written ONLY for an audio-only row. On a synced row the sync owns
  // duration (20260720190000's field policy), and the file's read duration overwriting
  // YouTube's showed up immediately in verification: a 25-minute video claiming "3 min
  // on YouTube" after a short test file was attached (seen live, 2026-08-14). For a real
  // sermon the two durations agree anyway; for the row the sync never touches, the file
  // is the only source there is.
  const changes: Database['public']['Tables']['sermons']['Update'] = {
    audio_path: input.path,
    speaker: input.speaker,
    series: input.series,
  };
  if (current.youtubeId === null) changes.duration_sec = input.durationSec;

  // `.select()` for the same reason removeVerse reads its rows back: RLS turns a refused
  // update into a successful statement that touches nothing, and reporting that as saved
  // would be a lie (the zero-row trap, ADR 0015's plan).
  const { data, error } = await supabase
    .from('sermons')
    .update(changes)
    .eq('id', input.sermonId)
    .select('id');
  if (error) return { ok: false, reason: 'failed' };
  if (data.length === 0) return { ok: false, reason: 'refused' };

  if (previousPath && previousPath !== input.path) {
    const removed = await supabase.storage
      .from(SERMON_AUDIO_BUCKET)
      .remove([previousPath]);
    return {
      ok: true,
      replaced: true,
      oldFileRemoved: !removed.error && removed.data.length > 0,
    };
  }
  return { ok: true, replaced: false };
}

function validateAttach(input: AttachInput): string | null {
  if (!OBJECT_NAME.test(input.path)) return 'path';
  if (
    !Number.isInteger(input.durationSec) ||
    input.durationSec < 1 ||
    input.durationSec > MAX_DURATION_SECONDS
  ) {
    return 'duration';
  }
  if (input.speaker.length === 0 || input.speaker.length > 120)
    return 'speaker';
  if (input.series !== null && input.series.length > 120) return 'series';
  return null;
}

export interface CreateAudioOnlyInput {
  title: string;
  speaker: string;
  series: string | null;
  /** The date preached (YYYY-MM-DD): decides where it sorts in the app's rails. */
  publishedOn: string;
  path: string;
  durationSec: number;
}

export type CreateOutcome =
  | { ok: true; sermonId: string }
  | {
      ok: false;
      reason: 'invalid' | 'not_audio' | 'missing' | 'refused' | 'failed';
    };

/**
 * A message that was never on YouTube at all (docs/spec/08: a row with only
 * `audio_path`; the app has rendered that state since W1.3).
 *
 * `kind` keeps its default. The enum names which CHANNEL TAB the sync sourced a row
 * from, and a row the sync never touches has no honest value there; `youtube_id is null`
 * is what the app actually branches on.
 */
export async function createAudioOnlySermon(
  supabase: Client,
  input: CreateAudioOnlyInput,
): Promise<CreateOutcome> {
  const invalid = validateCreate(input);
  if (invalid) return { ok: false, reason: 'invalid' };

  const verified = await verifyAudioObject(supabase, input.path);
  if (verified === 'missing') return { ok: false, reason: 'missing' };
  if (verified === 'not_audio') {
    await supabase.storage.from(SERMON_AUDIO_BUCKET).remove([input.path]);
    return { ok: false, reason: 'not_audio' };
  }

  const { data, error } = await supabase
    .from('sermons')
    .insert({
      title: input.title,
      speaker: input.speaker,
      series: input.series,
      published_at: `${input.publishedOn}T12:00:00Z`,
      audio_path: input.path,
      duration_sec: input.durationSec,
    })
    .select('id')
    .single();
  if (error) {
    // An RLS refusal on INSERT arrives as an error rather than as zero rows.
    return {
      ok: false,
      reason: error.code === '42501' ? 'refused' : 'failed',
    };
  }
  return { ok: true, sermonId: data.id };
}

function validateCreate(input: CreateAudioOnlyInput): string | null {
  if (input.title.length === 0 || input.title.length > 200) return 'title';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn)) return 'date';
  if (Number.isNaN(Date.parse(`${input.publishedOn}T12:00:00Z`))) return 'date';
  return validateAttach({
    sermonId: 'unused',
    path: input.path,
    durationSec: input.durationSec,
    speaker: input.speaker,
    series: input.series,
  });
}

export type RemoveOutcome =
  | { ok: true; fileRemoved: boolean }
  | {
      ok: false;
      reason: 'gone' | 'no_audio' | 'audio_only' | 'refused' | 'failed';
    };

/**
 * Takes the audio off a message: clear the reference, THEN delete the file.
 *
 * That order is the one the database permits (a referenced object refuses deletion), and
 * it is also the honest one for members: the moment the row is cleared, Listen is gone
 * from the app; anyone mid-listen finishes on a signed URL that outlives the file's
 * reachability by at most a day.
 *
 * An audio-only message is refused: with no YouTube half, removing the audio would leave
 * a message that is nothing at all. Replacing (attach with a new file) stays open.
 */
export async function removeAudio(
  supabase: Client,
  sermonId: string,
): Promise<RemoveOutcome> {
  const current = await loadSermon(supabase, sermonId);
  if (!current) return { ok: false, reason: 'gone' };
  if (!current.audioPath) return { ok: false, reason: 'no_audio' };
  if (!current.youtubeId) return { ok: false, reason: 'audio_only' };

  const { data, error } = await supabase
    .from('sermons')
    .update({ audio_path: null })
    .eq('id', sermonId)
    .select('id');
  if (error) return { ok: false, reason: 'failed' };
  if (data.length === 0) return { ok: false, reason: 'refused' };

  const removed = await supabase.storage
    .from(SERMON_AUDIO_BUCKET)
    .remove([current.audioPath]);
  return {
    ok: true,
    fileRemoved: !removed.error && removed.data.length > 0,
  };
}
