import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';
import { localStack } from '@/test/localStack';

import {
  EVENT_IMAGES_BUCKET,
  eventImageUrl,
  mintEventImageUpload,
  verifyEventImage,
} from './eventImages';
import { saveEvent } from './events';

/**
 * The event-images shelf, attempted as real callers against the real local stack
 * (docs/spec/21 §4; the storage contract is `20260822120000_an_event_gets_a_picture.sql`).
 *
 * pgTAP `050` proves the policies in SQL. This file drives the two things it structurally
 * cannot.
 *
 * THE BYTES ACTUALLY MOVE. Every layer of this slice can be green while the picture never
 * arrives: a mint that hands back a token nothing accepts, a magic-byte check reading an
 * empty body, a path saved on a row that points at nothing. So one test uploads a real
 * JPEG through the same mint-and-signed-URL door the browser uses, attaches it with the
 * ordinary `saveEvent`, and then fetches THE PUBLIC URL WITH NO CREDENTIAL AT ALL, which
 * is the whole posture decision and the exact request a member's phone makes.
 *
 * AND THE APP BUILDS THE SAME URL. `apps/mobile/src/features/events/image.ts` assembles it
 * from the path by hand rather than asking supabase-js, so the two constructions are
 * asserted to agree here; if they ever drift, every event picture in the app breaks at once
 * and nothing else would notice.
 */

// A one-pixel JPEG's leading bytes: the check reads twelve.
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const TEXT_BYTES = new TextEncoder().encode(
  'not a picture, whatever it is named',
);

let leader: TestCaller;
let branchId: string;
const paths: string[] = [];

beforeAll(async () => {
  branchId = await createTestBranch('event-images');
  // A LEADER, not an admin: they are the caller this slice widened the bucket for, so
  // testing it as an admin would prove the wrong thing.
  leader = await createCaller({ role: 'leader', branchId, mfa: 'verified' });
}, 60000);

afterAll(async () => {
  const service = admin();
  // Rows first, then objects: the delete policy refuses an object an event points at, so
  // the teardown has to walk the same removal order the product does.
  await service
    .from('events')
    .update({ image_path: null })
    .eq('branch_id', branchId);
  if (paths.length > 0) {
    await service.storage.from(EVENT_IMAGES_BUCKET).remove(paths);
  }
  await service.from('events').delete().eq('branch_id', branchId);
  await deleteCaller(leader);
  // The branch goes too. A test branch left behind is not inert: it joins the app's own
  // switcher on the dev stack and it breaks any assertion counting branches, which is
  // exactly what `002` had to be scoped against.
  await deleteTestBranch(branchId);
}, 60000);

/** Uploads through the same mint + signed-URL door the browser uses. */
async function upload(bytes: Uint8Array = JPEG_BYTES): Promise<string> {
  const client = leader.serverClient();
  const minted = await mintEventImageUpload(client, 'jpg');
  if (!minted.ok) throw new Error('mint refused');
  paths.push(minted.path);

  const sent = await client.storage
    .from(EVENT_IMAGES_BUCKET)
    .uploadToSignedUrl(minted.path, minted.token, bytes, {
      contentType: 'image/jpeg',
    });
  if (sent.error) throw new Error(sent.error.message);
  return minted.path;
}

async function createEvent(title: string, imagePath?: string) {
  const result = await saveEvent(leader.serverClient(), {
    scope: 'branch',
    title,
    description: '',
    startsAtLocal: '2026-12-01T19:00',
    location: 'Somewhere',
    rsvpEnabled: true,
    ...(imagePath === undefined ? {} : { imagePath }),
  });
  return result;
}

describe('a picture on an event, end to end', () => {
  test('a leader uploads one, saves it, and it is readable with no credential', async () => {
    const path = await upload();
    const created = await createEvent('Picture end to end', path);
    // Narrowed rather than matched with `expect.any`, which is typed `any` and would make
    // every read off this result unchecked.
    if (!created.ok) throw new Error(`save refused: ${created.reason}`);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const { data } = await admin()
      .from('events')
      .select('image_path')
      .eq('id', created.id)
      .single();
    // A PATH on the row, never a URL: the URL is derivable and a stored one would pin the
    // project host into it (`19`).
    expect(data?.image_path).toBe(path);
    expect(data?.image_path).not.toContain('http');

    // The request a member's phone makes: no Authorization header, no apikey, nothing.
    const url = eventImageUrl(leader.serverClient(), path);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);
  }, 60000);

  test('the app builds the identical URL by hand', async () => {
    const path = await upload();
    // The mobile builder, inlined rather than imported: this workspace cannot import from
    // apps/mobile, and the point is that two independent constructions agree. If this ever
    // drifts, every event picture in the app breaks at once.
    const base = localStack().url.replace(/\/+$/, '');
    const byHand = `${base}/storage/v1/object/public/${EVENT_IMAGES_BUCKET}/${path}`;

    expect(eventImageUrl(leader.serverClient(), path)).toBe(byHand);
    expect((await fetch(byHand)).status).toBe(200);
  }, 60000);
});

describe('what the row will not accept', () => {
  test('a file that is not a picture is refused and discarded, whatever it is named', async () => {
    const path = await upload(TEXT_BYTES);

    const result = await createEvent('Not a picture', path);
    expect(result).toEqual({ ok: false, reason: 'image_not_an_image' });

    // Discarded by the shelf, so a rejected upload cannot survive as an attachable object.
    const { data } = await admin()
      .storage.from(EVENT_IMAGES_BUCKET)
      .list('', { search: path, limit: 1 });
    expect(data?.some((entry) => entry.name === path)).toBe(false);
  }, 60000);

  test('a path nobody uploaded is refused before the row is touched', async () => {
    const invented = '11111111-1111-4111-8111-111111111111.jpg';
    expect(await verifyEventImage(leader.serverClient(), invented)).toBe(
      'missing',
    );

    const result = await createEvent('Invented path', invented);
    expect(result).toEqual({ ok: false, reason: 'image_not_found' });
  }, 60000);

  test('a name the client made up is refused without a storage round trip', async () => {
    expect(
      await verifyEventImage(leader.serverClient(), 'berlin-youth-camp.jpg'),
    ).toBe('invalid');
  }, 60000);
});
