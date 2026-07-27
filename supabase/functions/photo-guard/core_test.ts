import { assertEquals } from 'jsr:@std/assert@1';

import { judge, ownsPath, parsePhotoGuard, sniffImageType } from './core.ts';

const AUTHOR = '93000000-0000-4000-8000-00000000000a';
const OBJECT = '11111111-2222-4333-8444-555555555555';
const PATH = `${AUTHOR}/${OBJECT}.jpg`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

Deno.test('parsePhotoGuard accepts a well-formed object path', () => {
  assertEquals(parsePhotoGuard({ path: PATH })?.path, PATH);
});

Deno.test('parsePhotoGuard refuses paths that are not <uuid>/<uuid>.ext', () => {
  // Traversal, a bare filename, a foreign extension, and a non-uuid folder: the
  // pattern is the first thing standing between a client and a storage key.
  assertEquals(parsePhotoGuard({ path: `${AUTHOR}/../secrets.jpg` }), null);
  assertEquals(parsePhotoGuard({ path: 'photo.jpg' }), null);
  assertEquals(parsePhotoGuard({ path: `${AUTHOR}/${OBJECT}.svg` }), null);
  assertEquals(parsePhotoGuard({ path: `me/${OBJECT}.jpg` }), null);
});

Deno.test('parsePhotoGuard refuses unknown fields', () => {
  assertEquals(parsePhotoGuard({ path: PATH, skipCheck: true }), null);
});

Deno.test('ownsPath compares the folder with the caller', () => {
  assertEquals(ownsPath(PATH, AUTHOR), true);
  assertEquals(ownsPath(PATH, '93000000-0000-4000-8000-00000000000b'), false);
});

Deno.test('sniffImageType reads the container from the leading bytes', () => {
  assertEquals(sniffImageType(JPEG), 'image/jpeg');
  assertEquals(sniffImageType(PNG), 'image/png');
});

Deno.test('sniffImageType refuses anything that is not jpeg or png', () => {
  // A GIF, a PDF, an ELF binary, and a truncated read: all "not an image we
  // accept", none of which the declared Content-Type would have revealed.
  assertEquals(sniffImageType(new TextEncoder().encode('GIF89a__')), null);
  assertEquals(sniffImageType(new TextEncoder().encode('%PDF-1.7')), null);
  assertEquals(sniffImageType(new Uint8Array([0x7f, 0x45, 0x4c, 0x46])), null);
  assertEquals(sniffImageType(new Uint8Array([0xff, 0xd8])), null);
});

Deno.test('judge accepts an image whose bytes match what it claims to be', () => {
  assertEquals(judge({ sizeBytes: 400_000, declaredType: 'image/jpeg' }, JPEG), {
    ok: true,
    contentType: 'image/jpeg',
  });
});

Deno.test('judge refuses a file that lies about its type', () => {
  // The upload declared PNG; the bytes are JPEG. Serving it under the declared
  // type is how a browser gets told the wrong thing about a file.
  assertEquals(judge({ sizeBytes: 400_000, declaredType: 'image/png' }, JPEG), {
    ok: false,
    reason: 'not_an_image',
  });
});

Deno.test('judge refuses non-image bytes behind an image content type', () => {
  assertEquals(
    judge(
      { sizeBytes: 1_000, declaredType: 'image/jpeg' },
      new TextEncoder().encode('<?php ec'),
    ),
    { ok: false, reason: 'not_an_image' },
  );
});

Deno.test('judge refuses anything over the bucket ceiling', () => {
  assertEquals(
    judge({ sizeBytes: 5 * 1024 * 1024 + 1, declaredType: 'image/jpeg' }, JPEG),
    { ok: false, reason: 'too_large' },
  );
});

Deno.test('judge fails closed when the size is unknown', () => {
  assertEquals(
    judge({ sizeBytes: Number.POSITIVE_INFINITY, declaredType: null }, JPEG),
    { ok: false, reason: 'too_large' },
  );
});

Deno.test('judge accepts an object with no declared type at all', () => {
  // Nothing to contradict, so the bytes decide on their own.
  assertEquals(judge({ sizeBytes: 100, declaredType: null }, PNG), {
    ok: true,
    contentType: 'image/png',
  });
});
