import { artworkUrl, sermonArtworkUrl } from '../artwork';

/**
 * Which picture a message shows (W3.1 slice 5).
 *
 * A pure module deliberately, so this needs no mock at all: the whole reason
 * `artwork.ts` does not reach the Supabase client is that four surfaces call it, one of
 * them a presentational row, and a row that cannot render without a configured backend is
 * a row with a dependency it does not need.
 */

const BASE = 'http://127.0.0.1:55321';
const original = process.env.EXPO_PUBLIC_SUPABASE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = original;
});

function withBase(base: string | undefined) {
  if (base === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = base;
}

describe('the public object URL', () => {
  test('is the documented public route, and takes no credential', () => {
    withBase(BASE);
    expect(artworkUrl('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg')).toBe(
      `${BASE}/storage/v1/object/public/sermon-artwork/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`,
    );
  });

  test('a trailing slash on the configured base does not double up', () => {
    // `.env` is hand-edited between the USB and LAN modes, and a trailing slash is the
    // easiest thing in the world to leave behind there.
    withBase(`${BASE}/`);
    expect(artworkUrl('a.jpg')).toBe(
      `${BASE}/storage/v1/object/public/sermon-artwork/a.jpg`,
    );
  });
});

describe('which picture wins', () => {
  test('the message’s own artwork beats the YouTube thumbnail', () => {
    withBase(BASE);
    expect(
      sermonArtworkUrl({
        artwork_path: 'cover.jpg',
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      }),
    ).toBe(`${BASE}/storage/v1/object/public/sermon-artwork/cover.jpg`);
  });

  test('with no artwork the YouTube thumbnail stands', () => {
    withBase(BASE);
    expect(
      sermonArtworkUrl({
        artwork_path: null,
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      }),
    ).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });

  test('a message with neither returns null, which is the branded gradient', () => {
    withBase(BASE);
    // The sync writes '' where it found no thumbnail, and a message created in the
    // dashboard before this slice never had one: both mean "no picture", and only one of
    // them is falsy by type.
    expect(
      sermonArtworkUrl({ artwork_path: null, thumbnail_url: '' }),
    ).toBeNull();
  });

  test('an unconfigured base falls back rather than rendering a broken URL', () => {
    // Unreachable in the app (lib/supabase.ts throws at startup without it), so this is
    // about the degradation being the designed one rather than a half-built string.
    withBase(undefined);
    expect(
      sermonArtworkUrl({
        artwork_path: 'cover.jpg',
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      }),
    ).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
    expect(
      sermonArtworkUrl({ artwork_path: 'cover.jpg', thumbnail_url: '' }),
    ).toBeNull();
  });
});
