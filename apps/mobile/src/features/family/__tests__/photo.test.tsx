import { StorageApiError } from '@supabase/supabase-js';

import { TESTIMONY_PHOTO_MAX_LABEL } from '@agbc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { photoFailureKey } from '../composeErrors';
import { PhotoField } from '../PhotoField';
import {
  base64ToBytes,
  guardFailure,
  resizeTarget,
  uploadFailure,
} from '../photo';
import { testimonyPhotoQueryKey } from '../useSignedPhotoUrl';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockUpload = jest.fn<Promise<{ error: unknown }>, unknown[]>();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        remove: () => Promise.resolve({ error: null }),
        createSignedUrl: () =>
          Promise.resolve({ data: null, error: new Error('not in tests') }),
      }),
    },
    functions: { invoke: () => Promise.resolve({ data: { ok: true } }) },
  },
}));

const PATH =
  '93000000-0000-4000-8000-00000000000a/11111111-2222-4333-8444-555555555555.jpg';

// RNTL v14's render is async and MUST be awaited (same trap as the auth suite):
// without it `screen` is never populated and every query reports "render function
// has not been called".
async function renderField(
  props: Partial<React.ComponentProps<typeof PhotoField>>,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <PhotoField
          path={null}
          previewUri={null}
          busy={false}
          failure={null}
          onPick={jest.fn()}
          onRemove={jest.fn()}
          {...props}
        />
      </ThemeScope>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// ---------------------------------------------------------------------------
// The pure pieces of the pipeline
// ---------------------------------------------------------------------------

describe('base64ToBytes', () => {
  test('decodes to the exact bytes, padding included', () => {
    // "Hi" and "Hi!" exercise both padding lengths; the third is a real JPEG
    // header, which is what the server-side check reads.
    expect(Array.from(base64ToBytes('SGk='))).toEqual([0x48, 0x69]);
    expect(Array.from(base64ToBytes('SGkh'))).toEqual([0x48, 0x69, 0x21]);
    expect(Array.from(base64ToBytes('/9j/4A=='))).toEqual([
      0xff, 0xd8, 0xff, 0xe0,
    ]);
  });

  test('survives the whitespace some encoders insert', () => {
    expect(Array.from(base64ToBytes('SGkh\n'))).toEqual([0x48, 0x69, 0x21]);
  });

  test('an empty string is an empty buffer, not a crash', () => {
    expect(base64ToBytes('').byteLength).toBe(0);
  });
});

describe('where a signed photo URL is cached', () => {
  test('outside the family tree, so family invalidations cannot re-sign it', () => {
    // It lived under ['family', 'photo', path] until a landed Glory invalidated
    // ['family'], re-signed every photo in the feed, and made unrelated images
    // reload as the URI changed under them (found on device 2026-07-27). The URL
    // is keyed by an immutable object path; a count changing is none of its
    // business.
    expect(testimonyPhotoQueryKey('u/p.jpg')[0]).not.toBe('family');
  });
});

describe('resizeTarget', () => {
  test('constrains the longer edge and lets the other follow', () => {
    expect(resizeTarget(4032, 3024)).toEqual({ width: 1600 });
    expect(resizeTarget(3024, 4032)).toEqual({ height: 1600 });
    expect(resizeTarget(2000, 2000)).toEqual({ width: 1600 });
  });

  test('leaves an image that already fits alone', () => {
    // Upscaling a small photo only makes a bigger file out of the same pixels.
    expect(resizeTarget(1200, 900)).toBeNull();
    expect(resizeTarget(1600, 1600)).toBeNull();
  });
});

describe('a dev client built before the native modules were linked', () => {
  // The real symptom of the fence: `require('expo-image-picker')` throws
  // "Cannot find native module" on a client whose last EAS build predates the
  // module, and an unguarded import would take the whole composer route down
  // with it. jest resolves the JS fine, so the throw has to be staged.
  function loadWithoutPicker(): typeof import('../photo') {
    let photo!: typeof import('../photo');
    jest.isolateModules(() => {
      jest.doMock('expo-image-picker', () => {
        throw new Error("Cannot find native module 'ExponentImagePicker'");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      photo = require('../photo') as typeof import('../photo');
    });
    return photo;
  }

  test('the module still loads, and reports the picker unavailable', () => {
    expect(loadWithoutPicker().photoPickingAvailable).toBe(false);
  });

  test('and refuses cleanly if it is called anyway', async () => {
    await expect(
      loadWithoutPicker().pickAndUploadTestimonyPhoto(
        '93000000-0000-4000-8000-00000000000a',
      ),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The four states of the compose affordance
// ---------------------------------------------------------------------------

describe('the photo field on TESTIMONY-COMPOSE', () => {
  test('with no photo it offers the dashed Add a photo row', async () => {
    const onPick = jest.fn();
    await renderField({ onPick });
    await fireEvent.press(screen.getByLabelText('Add a photo'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  test('with a photo attached it offers removal, not another add', async () => {
    await renderField({ path: PATH, previewUri: 'file:///tmp/x.jpg' });
    expect(screen.getByLabelText('Remove photo')).toBeTruthy();
    expect(screen.queryByLabelText('Add a photo')).toBeNull();
  });

  test('removing hands back the path so the object can be deleted too', async () => {
    const onRemove = jest.fn();
    await renderField({
      path: PATH,
      previewUri: 'file:///tmp/x.jpg',
      onRemove,
    });
    await fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('while preparing, it says so and offers no remove control', async () => {
    // Nothing to remove yet: the upload and the server check are still running,
    // and a control that raced them would leave an object with no owner.
    await renderField({ busy: true, previewUri: 'file:///tmp/x.jpg' });
    expect(screen.getByText('Preparing your photo…')).toBeTruthy();
    expect(screen.queryByLabelText('Remove photo')).toBeNull();
  });

  test('a refused photo says what happened and leaves the row usable', async () => {
    await renderField({ failure: 'not_an_image' });
    expect(
      screen.getByText(
        "That file doesn't look like a photo. Please choose a picture from your library.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Add a photo')).toBeTruthy();
  });

  test('a cancelled pick is not a failure and shows no copy', async () => {
    // ComposeFlow never sets a failure for 'cancelled'; this pins the field's
    // half of that: no failure, no line.
    await renderField({ failure: null });
    expect(screen.queryByText(/couldn't add that photo/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// What a photo failure is allowed to claim (W4.19)
// ---------------------------------------------------------------------------
// The defect these pin: every unclassified failure reached one line, and that
// line told the member to check their connection. So a refused credential on
// production (Storage answers 400) read as a network fault on a working network,
// and the only report that ever came back was "it errored".

describe('reading an upload failure', () => {
  test('a status means Storage ANSWERED, so the connection is never blamed', () => {
    // 400 is what production returns for a credential it refuses, 403 for an RLS
    // refusal, 500 for its own trouble. The network reached Storage in all three.
    for (const status of [400, 403, 500]) {
      expect(
        uploadFailure(new StorageApiError('refused', status, String(status))),
      ).toBe('failed');
    }
  });

  test('413 is the bucket cap talking, and says so', () => {
    expect(uploadFailure(new StorageApiError('too big', 413, '413'))).toBe(
      'too_large',
    );
  });

  test('no status at all is unconfirmed: nothing answered', () => {
    // A wrapped fetch failure, or fetchWithTimeout's own ten-second abort.
    expect(uploadFailure(new Error('Network request failed'))).toBe(
      'unconfirmed',
    );
    expect(uploadFailure(null)).toBe('unconfirmed');
  });
});

describe('reading a photo-guard refusal', () => {
  test('each verdict keeps its own words', () => {
    expect(guardFailure('not_an_image')).toBe('not_an_image');
    expect(guardFailure('too_large')).toBe('too_large');
    expect(guardFailure('rate_limited')).toBe('rate_limited');
  });

  test('anything unrecognised is generic, never a server string', () => {
    expect(guardFailure('some_new_code')).toBe('failed');
    expect(guardFailure(null)).toBe('failed');
  });
});

describe('the copy contract', () => {
  test('ONLY the unconfirmed line mentions the connection, in every language', () => {
    // THE REGRESSION TEST. Put "connection" back into photoErrorGeneric, in any
    // of the four languages, and this goes red. That is the sentence that hid a
    // production outage for the whole life of the app.
    const connection = {
      en: 'connection',
      de: 'Verbindung',
      nl: 'verbinding',
      fr: 'connexion',
    };
    for (const [locale, word] of Object.entries(connection)) {
      /* eslint-disable-next-line @typescript-eslint/no-require-imports --
         the four namespaces are read as data, by locale, in one loop */
      const strings = require(`@/i18n/locales/${locale}/family.json`) as Record<
        string,
        string
      >;
      const mentions = Object.entries(strings)
        .filter(([key]) => key.startsWith('photoError'))
        .filter(([, line]) => line.toLowerCase().includes(word.toLowerCase()))
        .map(([key]) => key);
      expect(mentions).toEqual(['photoErrorUnconfirmed']);
    }
  });

  test('every reason the app can produce has a line of its own', () => {
    // `unavailable` and `failed` deliberately share the generic line; everything
    // else is distinct, so a member is never told the wrong thing to do next.
    expect(photoFailureKey('permission')).toBe('photoErrorPermission');
    expect(photoFailureKey('could_not_open')).toBe('photoErrorCouldNotOpen');
    expect(photoFailureKey('could_not_prepare')).toBe(
      'photoErrorCouldNotPrepare',
    );
    expect(photoFailureKey('too_large')).toBe('photoErrorTooLarge');
    expect(photoFailureKey('not_an_image')).toBe('photoErrorNotAnImage');
    expect(photoFailureKey('rate_limited')).toBe('photoErrorRateLimited');
    expect(photoFailureKey('unconfirmed')).toBe('photoErrorUnconfirmed');
    expect(photoFailureKey('signed_out')).toBe('photoErrorSignedOut');
    expect(photoFailureKey('failed')).toBe('photoErrorGeneric');
    expect(photoFailureKey('unavailable')).toBe('photoErrorGeneric');
  });

  test('signing in is never described as trying again', () => {
    // The generic line says "try again in a moment", and no amount of trying
    // fixes a dead session. This is the one reason whose advice was actively
    // wrong before it had a line of its own.
    const line = i18n.t('family:photoErrorSignedOut');
    expect(line).toMatch(/sign in again/i);
    expect(line).not.toMatch(/try again/i);
  });

  test('the size a member is told is the size the bucket enforces', () => {
    // Four locale files could each drift from TESTIMONY_PHOTO_MAX_BYTES, so the
    // number is interpolated rather than written out. Change the constant and
    // every language follows; write "5 MB" into a locale by hand and this fails.
    expect(TESTIMONY_PHOTO_MAX_LABEL).toBe('5 MB');
    for (const locale of ['en', 'de', 'nl', 'fr']) {
      /* eslint-disable-next-line @typescript-eslint/no-require-imports --
         the four namespaces are read as data, by locale, in one loop */
      const strings = require(`@/i18n/locales/${locale}/family.json`) as Record<
        string,
        string
      >;
      for (const key of ['composePhotoHint', 'photoErrorTooLarge']) {
        expect(strings[key]).toContain('{{size}}');
        expect(strings[key]).not.toContain('MB');
      }
    }
  });
});

describe('the size hint on the compose affordance', () => {
  test('is offered BEFORE a pick, with the real number in it', async () => {
    await renderField({});
    expect(
      screen.getByText(
        'Any photo works, we resize it before sending so it stays under 5 MB.',
      ),
    ).toBeTruthy();
  });

  test('gives way to the failure line, so only one of the two ever shows', async () => {
    await renderField({ failure: 'too_large' });
    expect(screen.queryByText(/Any photo works/)).toBeNull();
    expect(
      screen.getByText(
        'That photo is still over 5 MB after resizing. Please choose another one.',
      ),
    ).toBeTruthy();
  });

  test('and is still there after a cancelled pick, which is not a failure', async () => {
    await renderField({ failure: 'cancelled' });
    expect(screen.getByText(/Any photo works/)).toBeTruthy();
  });
});
