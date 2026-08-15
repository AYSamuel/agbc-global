import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  anonymousClient,
  createCaller,
  deleteCaller,
  type TestCaller,
} from '@/test/callers';
import { localStack } from '@/test/localStack';

import {
  artworkUrl,
  isImageMagic,
  mintArtworkUpload,
  removeArtwork,
  SERMON_ARTWORK_BUCKET,
  setArtwork,
} from './sermonArtwork';

/**
 * The artwork shelf, attempted as real callers against the real local stack
 * (docs/spec/21 §4; the storage contract is `20260815140000_a_message_gets_a_face.sql`).
 *
 * pgTAP `036` proves the policies in SQL. This file proves them THROUGH THE STORAGE API,
 * which is a different road, and it drives one thing pgTAP structurally cannot: the
 * PUBLIC object route, fetched over HTTP with no credential at all. That route is the
 * whole posture decision, and a decision nobody exercised is a decision nobody checked.
 */

// A one-pixel JPEG's leading bytes are enough: the check reads twelve.
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const TEXT_BYTES = new TextEncoder().encode('not a picture, whatever the name');

let verifiedAdmin: TestCaller;
let unchallengedAdmin: TestCaller;
let leader: TestCaller;
let member: TestCaller;
const minted: TestCaller[] = [];
const sermonIds: string[] = [];
const orphanPaths: string[] = [];

beforeAll(async () => {
  // Sequential, not Promise.all: four concurrent TOTP enrolments trip Supabase's own
  // MFA rate limit on the local stack and fail the whole file at setup with an empty
  // error body. The member needs no factor at all (mobile members never enrol one),
  // which also makes them the honest stand-in for a real app session.
  verifiedAdmin = await createCaller({ role: 'admin', mfa: 'verified' });
  unchallengedAdmin = await createCaller({
    role: 'admin',
    mfa: 'unchallenged',
  });
  leader = await createCaller({ role: 'leader', mfa: 'verified' });
  member = await createCaller({ role: 'member', mfa: 'none' });
  minted.push(verifiedAdmin, unchallengedAdmin, leader, member);
}, 120_000);

afterAll(async () => {
  const service = admin();
  if (sermonIds.length > 0) {
    await service.from('sermons').delete().in('id', sermonIds);
  }
  if (orphanPaths.length > 0) {
    await service.storage.from(SERMON_ARTWORK_BUCKET).remove(orphanPaths);
  }
  await Promise.all(minted.map(deleteCaller));
}, 60_000);

async function createSermon(
  extra: { youtubeId?: string | null; audioPath?: string | null } = {},
): Promise<string> {
  const { data, error } = await admin()
    .from('sermons')
    .insert({
      title: `Artwork Test ${String(sermonIds.length + 1)}`,
      speaker: 'Pastor Test',
      youtube_id:
        extra.youtubeId === null
          ? null
          : `artwork-test-${String(Date.now())}-${String(sermonIds.length)}`,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  sermonIds.push(data.id);
  return data.id;
}

/** Uploads through the same mint + signed-URL door the browser uses. */
async function hangAs(
  caller: TestCaller,
  bytes: Uint8Array = JPEG_BYTES,
): Promise<string> {
  const client = caller.serverClient();
  const mintedUpload = await mintArtworkUpload(client, 'jpg');
  if (!mintedUpload.ok) throw new Error('mint refused');
  orphanPaths.push(mintedUpload.path);

  const upload = await client.storage
    .from(SERMON_ARTWORK_BUCKET)
    .uploadToSignedUrl(mintedUpload.path, mintedUpload.token, bytes, {
      contentType: 'image/jpeg',
    });
  if (upload.error) throw new Error(upload.error.message);
  return mintedUpload.path;
}

async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await admin()
    .storage.from(SERMON_ARTWORK_BUCKET)
    .list('', { search: path, limit: 1 });
  if (error) throw new Error(error.message);
  return data.some((entry) => entry.name === path);
}

describe('what counts as a picture', () => {
  test('the three admitted formats pass and everything else fails', () => {
    expect(isImageMagic(JPEG_BYTES)).toBe(true);
    expect(isImageMagic(PNG_BYTES)).toBe(true);
    expect(isImageMagic(WEBP_BYTES)).toBe(true);

    expect(isImageMagic(TEXT_BYTES)).toBe(false);
    // An MP3 and a Windows executable: one is the neighbouring field's file on the same
    // form, the other is the classic rename.
    expect(isImageMagic(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe(false);
    expect(isImageMagic(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBe(false);
    // HEIC: an `ftyp` box at 4, which the AUDIO check accepts as an MP4 container and
    // this one must not. The likeliest real file a phone hands the media team.
    expect(
      isImageMagic(
        new Uint8Array([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69,
          0x63,
        ]),
      ),
    ).toBe(false);
    // A truncated RIFF that never says WEBP: a WAV starts exactly like this.
    expect(
      isImageMagic(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
          0x45,
        ]),
      ),
    ).toBe(false);
    expect(isImageMagic(new Uint8Array([]))).toBe(false);
  });
});

describe('the shelf boundary, through the storage API', () => {
  test('an admin at aal2 hangs a picture', async () => {
    const path = await hangAs(verifiedAdmin);
    expect(await objectExists(path)).toBe(true);
  }, 30_000);

  test('an admin session that never cleared its factor cannot hang', async () => {
    const client = unchallengedAdmin.serverClient();
    const mintedUpload = await mintArtworkUpload(client, 'jpg');
    if (mintedUpload.ok) orphanPaths.push(mintedUpload.path);
    const refused = mintedUpload.ok
      ? await client.storage
          .from(SERMON_ARTWORK_BUCKET)
          .uploadToSignedUrl(
            mintedUpload.path,
            mintedUpload.token,
            JPEG_BYTES,
            {
              contentType: 'image/jpeg',
            },
          )
      : { error: new Error('refused at mint') };
    expect(refused.error).not.toBeNull();
  }, 30_000);

  test('a leader cannot hang at all', async () => {
    await expect(hangAs(leader)).rejects.toThrow();
  }, 30_000);
});

describe('public means the picture, not the index of pictures', () => {
  test('the bytes come back over plain HTTP with no credential', async () => {
    // The load-bearing proof of the posture decision, and the one road pgTAP cannot
    // drive: this is the request every member's device and every lock screen makes.
    const path = await hangAs(verifiedAdmin);
    const url = artworkUrl(admin(), path);

    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/');
    expect((await response.arrayBuffer()).byteLength).toBe(JPEG_BYTES.length);

    // And the URL carries no token: that is what lets a device cache it and the OS
    // fetch it hours into a background listen.
    expect(url).toContain('/object/public/');
    expect(url).not.toContain('token=');
    expect(url.startsWith(localStack().url)).toBe(true);
  }, 30_000);

  test('nobody but an admin can list the bucket', async () => {
    await hangAs(verifiedAdmin);

    const asGuest = await anonymousClient()
      .storage.from(SERMON_ARTWORK_BUCKET)
      .list('', { limit: 5 });
    expect(asGuest.data ?? []).toHaveLength(0);

    const asMember = await member
      .serverClient()
      .storage.from(SERMON_ARTWORK_BUCKET)
      .list('', { limit: 5 });
    expect(asMember.data ?? []).toHaveLength(0);

    // Which costs them nothing: the app holds the path from the sermon row and builds
    // the URL locally, so a member reaches the picture without this table.
    const asAdmin = await verifiedAdmin
      .serverClient()
      .storage.from(SERMON_ARTWORK_BUCKET)
      .list('', { limit: 5 });
    expect((asAdmin.data ?? []).length).toBeGreaterThan(0);
  }, 30_000);
});

describe('set: bytes checked before the row points at them', () => {
  test('the happy path lands the path on the row', async () => {
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin);

    const outcome = await setArtwork(
      verifiedAdmin.serverClient(),
      sermonId,
      path,
    );
    expect(outcome).toMatchObject({ ok: true, replaced: false });

    const { data } = await admin()
      .from('sermons')
      .select('artwork_path, thumbnail_url')
      .eq('id', sermonId)
      .single();
    expect(data?.artwork_path).toBe(path);
    // The sync's column is untouched, which is the entire reason artwork has its own.
    expect(data?.thumbnail_url).toBe('');
  }, 30_000);

  test('a renamed text file dies at the save with nothing kept', async () => {
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin, TEXT_BYTES);

    const outcome = await setArtwork(
      verifiedAdmin.serverClient(),
      sermonId,
      path,
    );
    expect(outcome).toEqual({ ok: false, reason: 'not_image' });

    expect(await objectExists(path)).toBe(false);
    const { data } = await admin()
      .from('sermons')
      .select('artwork_path')
      .eq('id', sermonId)
      .single();
    expect(data?.artwork_path).toBeNull();
  }, 30_000);

  test('a leader holding a real path never reaches the row', async () => {
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin);

    const outcome = await setArtwork(leader.serverClient(), sermonId, path);
    expect(outcome.ok).toBe(false);
    const { data } = await admin()
      .from('sermons')
      .select('artwork_path')
      .eq('id', sermonId)
      .single();
    expect(data?.artwork_path).toBeNull();
  }, 30_000);

  test('and is refused one layer EARLIER than the audio path refuses one', async () => {
    // Worth pinning, because it is the artwork posture showing through. The audio bucket
    // lets everyone read an object row (that read IS the permission to mint a playback
    // URL), so a leader gets as far as the row write and is refused there, as `refused`.
    // This bucket's SELECT is admin-only, so a leader cannot even mint the short-lived
    // URL the byte check reads through, and Storage answers a caller who may not read an
    // object exactly as it answers one asking for an object that is not there.
    //
    // Nobody sees the difference: `authorize()` in the server action refuses a leader
    // before either function runs, and this path is defence in depth. If that ever stops
    // being true, this test is where the wrong wording gets caught.
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin);
    expect(await setArtwork(leader.serverClient(), sermonId, path)).toEqual({
      ok: false,
      reason: 'missing',
    });
  }, 30_000);

  test('replacing swaps the reference first and retires the old file after', async () => {
    const sermonId = await createSermon();
    const first = await hangAs(verifiedAdmin);
    expect(
      await setArtwork(verifiedAdmin.serverClient(), sermonId, first),
    ).toMatchObject({ ok: true, replaced: false });

    const second = await hangAs(verifiedAdmin);
    expect(
      await setArtwork(verifiedAdmin.serverClient(), sermonId, second),
    ).toMatchObject({ ok: true, replaced: true, oldFileRemoved: true });

    expect(await objectExists(first)).toBe(false);
    expect(await objectExists(second)).toBe(true);
  }, 45_000);
});

describe('remove: the row lets go before the file does', () => {
  test('a referenced picture refuses deletion even for the admin', async () => {
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin);
    await setArtwork(verifiedAdmin.serverClient(), sermonId, path);

    const direct = await verifiedAdmin
      .serverClient()
      .storage.from(SERMON_ARTWORK_BUCKET)
      .remove([path]);
    expect(direct.data ?? []).toHaveLength(0);
    expect(await objectExists(path)).toBe(true);
  }, 30_000);

  test('removeArtwork clears the row, then the file', async () => {
    const sermonId = await createSermon();
    const path = await hangAs(verifiedAdmin);
    await setArtwork(verifiedAdmin.serverClient(), sermonId, path);

    expect(await removeArtwork(verifiedAdmin.serverClient(), sermonId)).toEqual(
      { ok: true, fileRemoved: true },
    );

    const { data } = await admin()
      .from('sermons')
      .select('artwork_path')
      .eq('id', sermonId)
      .single();
    expect(data?.artwork_path).toBeNull();
    expect(await objectExists(path)).toBe(false);
  }, 30_000);

  test('a message with no picture says so rather than reporting a change', async () => {
    const sermonId = await createSermon();
    expect(await removeArtwork(verifiedAdmin.serverClient(), sermonId)).toEqual(
      { ok: false, reason: 'no_artwork' },
    );
  }, 30_000);
});
