import type {
  PrayerShareContent,
  TestimonyShareContent,
  VerseShareContent,
} from '../content';
import {
  isShareLink,
  routeForShareLink,
  SHARE_LINK_FALLBACK,
  SHARE_ORIGIN,
  SHARE_ORIGIN_LABEL,
  shareUrlFor,
} from '../links';

/**
 * Both ends of the road a scanned card travels (W4.15 slice 2b): what the QR encodes,
 * and what the app makes of it when Android hands the URL back. The second half is a
 * parser over UNTRUSTED input, because a link can arrive from anywhere that can open the
 * app, so it is tested the way deepLinks.ts is: for what it refuses as much as for what
 * it opens.
 */

const ID = '7415a000-0000-4000-8000-000000000001';

const TESTIMONY: TestimonyShareContent = {
  kind: 'testimony',
  id: ID,
  body: 'He is faithful.',
  authorName: 'Sarah O.',
  branchName: 'AGBC Glasgow',
  photoPath: null,
};

const PRAYER: PrayerShareContent = {
  kind: 'prayer',
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  body: 'Pray for me.',
  authorName: null,
  branchName: null,
  anonymous: true,
};

const VERSE: VerseShareContent = {
  kind: 'verse',
  text: 'And my God will supply every need of yours',
  reference: 'Philippians 4:19',
  translation: 'WEB',
};

describe('shareUrlFor', () => {
  it('encodes each card on www, never the apex', () => {
    expect(shareUrlFor(TESTIMONY)).toBe(
      `https://www.agbcglobal.com/app/t/${ID}`,
    );
    expect(shareUrlFor(PRAYER)).toBe(
      'https://www.agbcglobal.com/app/p/bbbbbbbb-0000-4000-8000-000000000002',
    );
    expect(shareUrlFor(VERSE)).toBe('https://www.agbcglobal.com/app');
    // The apex 308-redirects and is not claimed, so a card printed with it could never
    // open the app (app.config.js, the website's SPEC-app-links.md).
    expect(SHARE_ORIGIN.startsWith('https://www.')).toBe(true);
  });

  it('prints the address without scheme or www, as the frame draws it', () => {
    expect(SHARE_ORIGIN_LABEL).toBe('agbcglobal.com');
  });

  it('round-trips: what a card encodes is what the app opens', () => {
    expect(routeForShareLink(shareUrlFor(TESTIMONY))).toBe(`/testimony/${ID}`);
    expect(routeForShareLink(shareUrlFor(PRAYER))).toBe(
      '/prayer/bbbbbbbb-0000-4000-8000-000000000002',
    );
    expect(routeForShareLink(shareUrlFor(VERSE))).toBe(SHARE_LINK_FALLBACK);
  });
});

describe('isShareLink', () => {
  it('recognises the claimed https form and the app scheme, nothing else', () => {
    expect(isShareLink(`https://www.agbcglobal.com/app/t/${ID}`)).toBe(true);
    expect(isShareLink('https://www.agbcglobal.com/app')).toBe(true);
    expect(isShareLink(`agbcglobal://app/t/${ID}`)).toBe(true);
    // The apex is not claimed, so Android never hands it over; and http is not https.
    expect(isShareLink(`https://agbcglobal.com/app/t/${ID}`)).toBe(false);
    expect(isShareLink(`http://www.agbcglobal.com/app/t/${ID}`)).toBe(false);
    // Other pages on the site are not the app's business.
    expect(isShareLink('https://www.agbcglobal.com/privacy')).toBe(false);
    expect(isShareLink('https://www.agbcglobal.com/application')).toBe(false);
    // The dev client's own launch URL must pass through untouched.
    expect(
      isShareLink(
        'exp+agbc://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
      ),
    ).toBe(false);
  });
});

describe('routeForShareLink', () => {
  it('opens a testimony or a prayer request from either URL form', () => {
    expect(routeForShareLink(`https://www.agbcglobal.com/app/t/${ID}`)).toBe(
      `/testimony/${ID}`,
    );
    expect(routeForShareLink(`https://www.agbcglobal.com/app/p/${ID}/`)).toBe(
      `/prayer/${ID}`,
    );
    expect(routeForShareLink(`agbcglobal://app/t/${ID}`)).toBe(
      `/testimony/${ID}`,
    );
  });

  it('drops a query or fragment rather than passing it to a screen', () => {
    expect(
      routeForShareLink(`https://www.agbcglobal.com/app/t/${ID}?confirm=1`),
    ).toBe(`/testimony/${ID}`);
    expect(routeForShareLink(`https://www.agbcglobal.com/app/p/${ID}#x`)).toBe(
      `/prayer/${ID}`,
    );
  });

  it('lands on Home for anything under /app it cannot name', () => {
    expect(routeForShareLink('https://www.agbcglobal.com/app')).toBe('/home');
    expect(routeForShareLink('https://www.agbcglobal.com/app/')).toBe('/home');
    expect(routeForShareLink('https://www.agbcglobal.com/app/t')).toBe('/home');
    expect(routeForShareLink(`https://www.agbcglobal.com/app/x/${ID}`)).toBe(
      '/home',
    );
    expect(
      routeForShareLink(`https://www.agbcglobal.com/app/t/${ID}/extra`),
    ).toBe('/home');
  });

  it('refuses a segment that is not an id', () => {
    expect(routeForShareLink('https://www.agbcglobal.com/app/t/../give')).toBe(
      '/home',
    );
    expect(routeForShareLink('https://www.agbcglobal.com/app/t/.hidden')).toBe(
      '/home',
    );
    expect(
      routeForShareLink(`https://www.agbcglobal.com/app/t/${'a'.repeat(129)}`),
    ).toBe('/home');
  });

  it('never opens anything for a URL that is not a share link', () => {
    expect(routeForShareLink('https://www.agbcglobal.com/privacy')).toBe(
      '/home',
    );
  });
});
