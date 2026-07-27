import {
  CONSENT_VERSION,
  CONSENT_VERSION_PHOTO,
  composeSchema,
  consentVersionFor,
} from '@agbc/shared';

import { mapComposeError, photoFailureKey } from '../composeErrors';
import { parseDraft } from '../drafts';

import de from '@/i18n/locales/de/family.json';
import en from '@/i18n/locales/en/family.json';
import fr from '@/i18n/locales/fr/family.json';
import nl from '@/i18n/locales/nl/family.json';

describe('mapComposeError', () => {
  test('the quota trigger becomes the cap copy', () => {
    expect(
      mapComposeError({
        code: '23514',
        message: 'daily sharing limit reached',
      }),
    ).toBe('errorLimit');
  });

  test('a retired consent version tells the user to update', () => {
    expect(
      mapComposeError({
        code: '23514',
        message: 'consent wording content-share-v0 is not the current version',
      }),
    ).toBe('errorConsentStale');
  });

  test('the consent FK also reads as a stale build', () => {
    expect(
      mapComposeError({
        code: '23503',
        message:
          'insert or update on table "testimonies" violates foreign key constraint "testimonies_consent_version_fkey"',
      }),
    ).toBe('errorConsentStale');
  });

  test('a pg refusal we do not recognise is generic, never silently swallowed', () => {
    expect(mapComposeError({ code: '23505', message: 'duplicate key' })).toBe(
      'errorGeneric',
    );
  });

  test('a transport failure (no pg code) reads as offline', () => {
    expect(mapComposeError({ message: 'Network request failed' })).toBe(
      'errorOffline',
    );
    expect(mapComposeError(new Error('aborted'))).toBe('errorOffline');
  });
});

describe('parseDraft', () => {
  test('a well-formed draft round-trips', () => {
    expect(
      parseDraft(
        JSON.stringify({
          body: 'hello',
          categoryId: 'c1',
          isAnonymous: true,
          savedAt: 7,
        }),
      ),
    ).toEqual({
      body: 'hello',
      categoryId: 'c1',
      imagePath: null,
      isAnonymous: true,
      savedAt: 7,
    });
  });

  test('nothing, junk, and an empty body all read as "no draft"', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft('[]')).toBeNull();
    expect(parseDraft(JSON.stringify({ body: '   ' }))).toBeNull();
  });

  test('a draft from an older build fills its gaps rather than throwing', () => {
    expect(parseDraft(JSON.stringify({ body: 'hi' }))).toEqual({
      body: 'hi',
      categoryId: null,
      imagePath: null,
      isAnonymous: false,
      savedAt: 0,
    });
  });
});

describe('composeSchema', () => {
  test('the ceilings match the database CHECKs, per target', () => {
    const base = {
      categoryId: null,
      imagePath: null,
      isAnonymous: false,
      consentAgreed: true,
    };
    expect(
      composeSchema('testimony').safeParse({ ...base, body: 'x'.repeat(2000) })
        .success,
    ).toBe(true);
    expect(
      composeSchema('testimony').safeParse({ ...base, body: 'x'.repeat(2001) })
        .success,
    ).toBe(false);
    expect(
      composeSchema('prayer').safeParse({ ...base, body: 'x'.repeat(1000) })
        .success,
    ).toBe(true);
    expect(
      composeSchema('prayer').safeParse({ ...base, body: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
  });

  test('consent is required and whitespace is not a body', () => {
    expect(
      composeSchema('prayer').safeParse({
        body: 'pray for me',
        categoryId: null,
        imagePath: null,
        isAnonymous: false,
        consentAgreed: false,
      }).success,
    ).toBe(false);
    expect(
      composeSchema('prayer').safeParse({
        body: '   ',
        categoryId: null,
        imagePath: null,
        isAnonymous: false,
        consentAgreed: true,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The consent-wording pin
// ---------------------------------------------------------------------------
// CONSENT_VERSION is what the database stores as Art. 9(2)(a) evidence
// (docs/spec/20), and it is only evidence if it identifies the words that were
// actually on screen. This hashes the consent copy in ALL FOUR languages and
// pins it to the version.
//
// IF THIS TEST FAILS you have changed consent wording. That is allowed, but it
// is a new version, not an edit: add a row to public.consent_versions in a
// migration, retire the old one, bump CONSENT_VERSION in
// packages/shared/src/contracts/family.ts, and update the hash below. Never just
// update the hash: rows already recorded against the old key would then claim
// the author agreed to words they never saw.

const CONSENT_KEYS = [
  'consentTitle',
  'consentLeadTestimony',
  'consentLeadPrayer',
  'consentPoint1Title',
  'consentPoint1Body',
  'consentPoint2Title',
  'consentPoint2Body',
  'consentPoint3Title',
  'consentPoint3Body',
  'consentAgree',
  'consentPostTestimony',
  'consentPostPrayer',
] as const;

/** FNV-1a, implemented here rather than imported: node's crypto is not part of
 * the RN runtime this suite emulates, and a 32-bit hash is plenty to catch an
 * edit. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// The bundles carry a nested `categories` object alongside the flat strings, so
// they are read as unknown-valued records and each consent line is proved to be
// a string on the way out: a missing key must fail loudly, not hash as
// "undefined" and quietly pin the wrong thing.
type Bundle = Record<string, unknown>;

const BUNDLES: Record<string, Bundle> = { en, de, nl, fr };

function consentLine(bundle: Bundle, key: string): string {
  const value = bundle[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`consent key "${key}" is missing or empty`);
  }
  return value;
}

describe('consent wording is pinned to its version', () => {
  test(`${CONSENT_VERSION} still describes the wording on screen`, () => {
    const material = Object.keys(BUNDLES)
      .sort()
      .flatMap((lang) =>
        CONSENT_KEYS.map(
          (key) => `${lang}.${key}=${consentLine(BUNDLES[lang], key)}`,
        ),
      )
      .join('\n');

    expect(CONSENT_VERSION).toBe('content-share-v1');
    expect(fnv1a(material)).toBe('8f54c679');
  });

  test('every language actually carries every consent string', () => {
    for (const lang of Object.keys(BUNDLES)) {
      for (const key of CONSENT_KEYS) {
        expect(() => consentLine(BUNDLES[lang], key)).not.toThrow();
      }
    }
  });

  // The photo wording is a SECOND version, not an edit of the first: a post with
  // a photo shows the three points above plus the photo-permission clause, and
  // records content-share-photo-v1. Same rule if this fails: mint a new version
  // in a migration, do not edit the words under an existing key.
  test(`${CONSENT_VERSION_PHOTO} still describes the wording on screen`, () => {
    const keys = [...CONSENT_KEYS, 'consentPhotoTitle', 'consentPhotoBody'];
    const material = Object.keys(BUNDLES)
      .sort()
      .flatMap((lang) =>
        keys.map((key) => `${lang}.${key}=${consentLine(BUNDLES[lang], key)}`),
      )
      .join('\n');

    expect(CONSENT_VERSION_PHOTO).toBe('content-share-photo-v1');
    expect(fnv1a(material)).toBe('caf26b16');
  });
});

describe('consentVersionFor', () => {
  test('the version recorded names the wording that was actually shown', () => {
    expect(consentVersionFor(false)).toBe(CONSENT_VERSION);
    expect(consentVersionFor(true)).toBe(CONSENT_VERSION_PHOTO);
  });
});

describe('the photo field on the compose schema', () => {
  const base = { categoryId: null, isAnonymous: false, consentAgreed: true };

  test('a testimony accepts an object path in the author-folder shape', () => {
    expect(
      composeSchema('testimony').safeParse({
        ...base,
        body: 'God provided',
        imagePath:
          '93000000-0000-4000-8000-00000000000a/11111111-2222-4333-8444-555555555555.jpg',
      }).success,
    ).toBe(true);
  });

  test('a testimony refuses anything that is not that shape', () => {
    for (const imagePath of [
      'photo.jpg',
      '93000000-0000-4000-8000-00000000000a/../secret.jpg',
      'https://example.test/photo.jpg',
    ]) {
      expect(
        composeSchema('testimony').safeParse({
          ...base,
          body: 'God provided',
          imagePath,
        }).success,
      ).toBe(false);
    }
  });

  test('a prayer request cannot carry a photo at all', () => {
    expect(
      composeSchema('prayer').safeParse({
        ...base,
        body: 'please pray',
        imagePath:
          '93000000-0000-4000-8000-00000000000a/11111111-2222-4333-8444-555555555555.jpg',
      }).success,
    ).toBe(false);
  });
});

describe('photoFailureKey', () => {
  test('every failure reaches copy that says what to do next', () => {
    expect(photoFailureKey('permission')).toBe('photoErrorPermission');
    expect(photoFailureKey('too_large')).toBe('photoErrorTooLarge');
    expect(photoFailureKey('not_an_image')).toBe('photoErrorNotAnImage');
    expect(photoFailureKey('failed')).toBe('photoErrorGeneric');
    expect(photoFailureKey('unavailable')).toBe('photoErrorGeneric');
    // Every key it can return exists in all four bundles: a photo failure must
    // never surface as a raw i18n key.
    for (const lang of Object.keys(BUNDLES)) {
      for (const failure of [
        'permission',
        'too_large',
        'not_an_image',
        'failed',
      ] as const) {
        expect(() =>
          consentLine(BUNDLES[lang], photoFailureKey(failure)),
        ).not.toThrow();
      }
    }
  });
});
