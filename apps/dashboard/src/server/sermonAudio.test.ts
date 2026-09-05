import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  anonymousClient,
  createCaller,
  deleteCaller,
  type TestCaller,
} from '@/test/callers';

import {
  attachAudio,
  createAudioOnlySermon,
  isMp3Magic,
  mintUpload,
  removeAudio,
  SERMON_AUDIO_BUCKET,
  updateAudioOnlySermon,
} from './sermonAudio';

/**
 * The shelf, attempted as real callers against the real local stack (docs/spec/21 §4;
 * the storage contract is `docs/spec/02` §Storage).
 *
 * pgTAP 034 proves the policies in SQL; this file proves them THROUGH THE STORAGE API,
 * which is a different road (the W2.7 column-grants lesson: a privilege proven in the
 * database still has to be proven through the client stack that will actually use it).
 * On top of the boundary, it proves the two orders this module owns: bytes are checked
 * before a row points at them, and the row lets go before the file does.
 *
 * A mocked client would only prove this file agrees with the mock. Everything here is a
 * genuine session, genuine RLS, genuine storage objects.
 */

const MP3_BYTES = new Uint8Array([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90,
  0x00, 0x00, 0x00, 0x00, 0x00,
]);
const TEXT_BYTES = new TextEncoder().encode(
  'not audio at all, whatever the name',
);

let verifiedAdmin: TestCaller;
let unchallengedAdmin: TestCaller;
let leader: TestCaller;
const minted: TestCaller[] = [];
const sermonIds: string[] = [];
const orphanPaths: string[] = [];

beforeAll(async () => {
  [verifiedAdmin, unchallengedAdmin, leader] = await Promise.all([
    createCaller({ role: 'admin', mfa: 'verified' }),
    createCaller({ role: 'admin', mfa: 'unchallenged' }),
    createCaller({ role: 'leader', mfa: 'verified' }),
  ]);
  minted.push(verifiedAdmin, unchallengedAdmin, leader);
}, 120_000);

afterAll(async () => {
  const service = admin();
  if (sermonIds.length > 0) {
    await service.from('sermons').delete().in('id', sermonIds);
  }
  if (orphanPaths.length > 0) {
    await service.storage.from(SERMON_AUDIO_BUCKET).remove(orphanPaths);
  }
  await Promise.all(minted.map(deleteCaller));
}, 60_000);

/** A synced-looking sermon with no audio yet, written by the trusted path. */
async function createSermon(): Promise<string> {
  const { data, error } = await admin()
    .from('sermons')
    .insert({
      title: `Shelf Test ${String(sermonIds.length + 1)}`,
      speaker: 'Pastor Test',
      youtube_id: `shelf-test-${String(Date.now())}-${String(sermonIds.length)}`,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  sermonIds.push(data.id);
  return data.id;
}

/** Uploads through the same mint + signed-URL door the browser uses. */
async function shelveAs(
  caller: TestCaller,
  bytes: Uint8Array = MP3_BYTES,
): Promise<string> {
  const client = caller.serverClient();
  const mintedUpload = await mintUpload(client, 'mp3');
  if (!mintedUpload.ok) throw new Error('mint refused');
  orphanPaths.push(mintedUpload.path);

  const upload = await client.storage
    .from(SERMON_AUDIO_BUCKET)
    .uploadToSignedUrl(mintedUpload.path, mintedUpload.token, bytes, {
      contentType: 'audio/mpeg',
    });
  if (upload.error) throw new Error(upload.error.message);
  return mintedUpload.path;
}

async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await admin()
    .storage.from(SERMON_AUDIO_BUCKET)
    .list('', { search: path, limit: 1 });
  if (error) throw new Error(error.message);
  return data.some((entry) => entry.name === path);
}

describe('what counts as an MP3', () => {
  test('the two MP3 shapes pass and everything else fails', () => {
    // ID3-tagged, a bare MPEG-1 Layer III frame, a bare MPEG-2 Layer III frame.
    expect(isMp3Magic(MP3_BYTES)).toBe(true);
    expect(isMp3Magic(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(true);
    expect(isMp3Magic(new Uint8Array([0xff, 0xf3, 0x90, 0x00]))).toBe(true);

    // The MP4 container M4A ships in: accepted until W4.9 slice 1, now the whole point.
    expect(
      isMp3Magic(
        new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
      ),
    ).toBe(false);
    // ADTS AAC shares the frame sync and carries layer bits 00; an `.aac` renamed `.mp3`
    // is exactly the file the old check let through.
    expect(isMp3Magic(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe(false);
    expect(isMp3Magic(new Uint8Array([0xff, 0xf9, 0x50, 0x80]))).toBe(false);
    // Frame sync with the reserved version bits.
    expect(isMp3Magic(new Uint8Array([0xff, 0xeb, 0x90, 0x00]))).toBe(false);

    expect(isMp3Magic(TEXT_BYTES)).toBe(false);
    // A PNG and a Windows executable, the classic renames.
    expect(
      isMp3Magic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])),
    ).toBe(false);
    expect(isMp3Magic(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBe(false);
    expect(isMp3Magic(new Uint8Array([0xff]))).toBe(false);
    expect(isMp3Magic(new Uint8Array([]))).toBe(false);
  });
});

describe('the shelf boundary, through the storage API', () => {
  test('an admin at aal2 shelves a file, and a guest can mint a link to it', async () => {
    const path = await shelveAs(verifiedAdmin);
    expect(await objectExists(path)).toBe(true);

    // The mint permission covers anon: guest listening is a 08 requirement.
    const signed = await anonymousClient()
      .storage.from(SERMON_AUDIO_BUCKET)
      .createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
  }, 30_000);

  test('an admin session that never cleared its factor cannot shelve', async () => {
    // The aal2 half of the policy, alone: same live-table admin, aal1 session.
    const client = unchallengedAdmin.serverClient();
    const mintedUpload = await mintUpload(client, 'mp3');
    if (mintedUpload.ok) orphanPaths.push(mintedUpload.path);
    const refused = mintedUpload.ok
      ? await client.storage
          .from(SERMON_AUDIO_BUCKET)
          .uploadToSignedUrl(mintedUpload.path, mintedUpload.token, MP3_BYTES, {
            contentType: 'audio/mpeg',
          })
      : { error: new Error('refused at mint') };
    expect(refused.error).not.toBeNull();
  }, 30_000);

  test('a leader cannot shelve at all', async () => {
    await expect(shelveAs(leader)).rejects.toThrow();
  }, 30_000);
});

describe('attach: bytes checked before the row points at them', () => {
  test('the happy path lands the path and the metadata on the row', async () => {
    const sermonId = await createSermon();
    const path = await shelveAs(verifiedAdmin);

    const outcome = await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: 'Grace',
      artworkPath: null,
    });
    expect(outcome).toMatchObject({ ok: true, replaced: false });

    const { data } = await admin()
      .from('sermons')
      .select('audio_path, duration_sec, speaker, series')
      .eq('id', sermonId)
      .single();
    // duration_sec stays the sync's on a synced row (null here: the fixture never had
    // one); only an audio-only row takes the file's duration.
    expect(data).toEqual({
      audio_path: path,
      duration_sec: null,
      speaker: 'Pastor Olayinka',
      series: 'Grace',
    });
  }, 30_000);

  test('a renamed text file dies at the save with nothing kept', async () => {
    const sermonId = await createSermon();
    const path = await shelveAs(verifiedAdmin, TEXT_BYTES);

    const outcome = await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });
    expect(outcome).toEqual({ ok: false, reason: 'not_audio' });

    // Discarded on refusal, and the row never pointed at it.
    expect(await objectExists(path)).toBe(false);
    const { data } = await admin()
      .from('sermons')
      .select('audio_path')
      .eq('id', sermonId)
      .single();
    expect(data?.audio_path).toBeNull();
  }, 30_000);

  test('a leader holding a real path is still refused at the row', async () => {
    const sermonId = await createSermon();
    const path = await shelveAs(verifiedAdmin);

    // The read half (verification) is public by design; the WRITE is what RLS turns
    // into a zero-row statement, and reporting that as saved would be the lie this
    // module refuses to tell (the ADR 0015 zero-row trap).
    const outcome = await attachAudio(leader.serverClient(), {
      sermonId,
      path,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });
    expect(outcome).toEqual({ ok: false, reason: 'refused' });
  }, 30_000);

  test('replacing swaps the reference first and retires the old file after', async () => {
    const sermonId = await createSermon();
    const first = await shelveAs(verifiedAdmin);
    const attached = await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path: first,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });
    expect(attached.ok).toBe(true);

    const second = await shelveAs(verifiedAdmin);
    const replaced = await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path: second,
      durationSec: 2530,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });
    expect(replaced).toMatchObject({
      ok: true,
      replaced: true,
      oldFileRemoved: true,
    });
    expect(await objectExists(first)).toBe(false);
    expect(await objectExists(second)).toBe(true);
  }, 45_000);
});

describe('remove: the row lets go before the file does', () => {
  test('a referenced file refuses deletion even for the admin, through the API', async () => {
    const sermonId = await createSermon();
    const path = await shelveAs(verifiedAdmin);
    await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });

    const direct = await verifiedAdmin
      .serverClient()
      .storage.from(SERMON_AUDIO_BUCKET)
      .remove([path]);
    // RLS filters the delete to zero objects rather than erroring.
    expect(direct.data ?? []).toHaveLength(0);
    expect(await objectExists(path)).toBe(true);
  }, 30_000);

  test('removeAudio clears the row, then the file, and the app side is instant', async () => {
    const sermonId = await createSermon();
    const path = await shelveAs(verifiedAdmin);
    await attachAudio(verifiedAdmin.serverClient(), {
      sermonId,
      path,
      durationSec: 2520,
      speaker: 'Pastor Olayinka',
      series: null,
      artworkPath: null,
    });

    const outcome = await removeAudio(verifiedAdmin.serverClient(), sermonId);
    expect(outcome).toEqual({ ok: true, fileRemoved: true });

    const { data } = await admin()
      .from('sermons')
      .select('audio_path')
      .eq('id', sermonId)
      .single();
    expect(data?.audio_path).toBeNull();
    expect(await objectExists(path)).toBe(false);
  }, 30_000);
});

describe('the audio-only message', () => {
  test('an admin creates one, and its audio can be replaced but never removed', async () => {
    const path = await shelveAs(verifiedAdmin);
    const created = await createAudioOnlySermon(verifiedAdmin.serverClient(), {
      title: 'Midweek: The Quiet Work of God',
      speaker: 'Pastor Olayinka',
      series: null,
      publishedOn: '2026-08-13',
      path,
      durationSec: 2280,
      artworkPath: null,
    });
    if (!created.ok) throw new Error(`create refused: ${created.reason}`);
    sermonIds.push(created.sermonId);

    const { data } = await admin()
      .from('sermons')
      .select('youtube_id, audio_path, kind, status')
      .eq('id', created.sermonId)
      .single();
    expect(data?.youtube_id).toBeNull();
    expect(data?.audio_path).toBe(path);

    // With no YouTube half, removing the audio would leave nothing at all.
    const removed = await removeAudio(
      verifiedAdmin.serverClient(),
      created.sermonId,
    );
    expect(removed).toEqual({ ok: false, reason: 'audio_only' });
  }, 30_000);

  test('a leader cannot create one', async () => {
    const path = await shelveAs(verifiedAdmin);
    const created = await createAudioOnlySermon(leader.serverClient(), {
      title: 'Not Theirs To Shelve',
      speaker: 'Pastor Olayinka',
      series: null,
      publishedOn: '2026-08-13',
      path,
      durationSec: 2280,
      artworkPath: null,
    });
    expect(created).toEqual({ ok: false, reason: 'refused' });
  }, 30_000);

  // W4.9 slice 1: the facts of a hand-typed message can be corrected; a synced one's
  // belong to the sync. Every assertion reads the ROW after, never the return value alone.
  test('an admin corrects its facts, and the row carries them', async () => {
    const path = await shelveAs(verifiedAdmin);
    const created = await createAudioOnlySermon(verifiedAdmin.serverClient(), {
      title: 'Midweek: Prayer That Hodls',
      speaker: 'Pastor Olayinka',
      series: null,
      publishedOn: '2026-08-06',
      path,
      durationSec: 2280,
      artworkPath: null,
    });
    if (!created.ok) throw new Error(`create refused: ${created.reason}`);
    sermonIds.push(created.sermonId);

    const edited = await updateAudioOnlySermon(verifiedAdmin.serverClient(), {
      sermonId: created.sermonId,
      title: 'Midweek: Prayer That Holds',
      speaker: 'Pastor Olayinka Ademiluka',
      series: 'Midweek',
      publishedOn: '2026-08-05',
    });
    expect(edited).toEqual({ ok: true });

    const { data } = await admin()
      .from('sermons')
      .select('title, speaker, series, published_at, audio_path')
      .eq('id', created.sermonId)
      .single();
    expect(data?.title).toBe('Midweek: Prayer That Holds');
    expect(data?.speaker).toBe('Pastor Olayinka Ademiluka');
    expect(data?.series).toBe('Midweek');
    expect(data?.published_at).toBe('2026-08-05T12:00:00+00:00');
    // The audio is not a fact: an edit never touches the file.
    expect(data?.audio_path).toBe(path);
  }, 30_000);

  test("a synced message is refused as synced, and its facts stay the sync's", async () => {
    const { data: synced, error } = await admin()
      .from('sermons')
      .insert({
        title: 'Shelf Test Synced',
        speaker: '',
        youtube_id: `shelf-synced-${String(Date.now())}`,
        published_at: '2026-08-09T12:00:00Z',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    sermonIds.push(synced.id);

    const edited = await updateAudioOnlySermon(verifiedAdmin.serverClient(), {
      sermonId: synced.id,
      title: 'Renamed By Hand',
      speaker: 'Somebody',
      series: null,
      publishedOn: '2026-08-10',
    });
    expect(edited).toEqual({ ok: false, reason: 'synced' });

    const { data } = await admin()
      .from('sermons')
      .select('title')
      .eq('id', synced.id)
      .single();
    expect(data?.title).toBe('Shelf Test Synced');
  }, 30_000);

  test('a leader is refused, a missing id is gone, and nonsense is invalid', async () => {
    const path = await shelveAs(verifiedAdmin);
    const created = await createAudioOnlySermon(verifiedAdmin.serverClient(), {
      title: 'Kept As Typed',
      speaker: 'Pastor Olayinka',
      series: null,
      publishedOn: '2026-08-06',
      path,
      durationSec: 2280,
      artworkPath: null,
    });
    if (!created.ok) throw new Error(`create refused: ${created.reason}`);
    sermonIds.push(created.sermonId);

    const facts = {
      title: 'Changed By A Leader',
      speaker: 'Pastor Olayinka',
      series: null,
      publishedOn: '2026-08-06',
    };
    expect(
      await updateAudioOnlySermon(leader.serverClient(), {
        sermonId: created.sermonId,
        ...facts,
      }),
    ).toEqual({ ok: false, reason: 'refused' });
    expect(
      await updateAudioOnlySermon(verifiedAdmin.serverClient(), {
        sermonId: '00000000-0000-4000-8000-00000000dead',
        ...facts,
      }),
    ).toEqual({ ok: false, reason: 'gone' });
    expect(
      await updateAudioOnlySermon(verifiedAdmin.serverClient(), {
        sermonId: created.sermonId,
        ...facts,
        title: '',
      }),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await updateAudioOnlySermon(verifiedAdmin.serverClient(), {
        sermonId: created.sermonId,
        ...facts,
        publishedOn: '6 August 2026',
      }),
    ).toEqual({ ok: false, reason: 'invalid' });

    const { data } = await admin()
      .from('sermons')
      .select('title')
      .eq('id', created.sermonId)
      .single();
    expect(data?.title).toBe('Kept As Typed');
  }, 30_000);
});
