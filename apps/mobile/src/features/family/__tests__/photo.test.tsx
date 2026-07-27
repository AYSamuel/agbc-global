import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { PhotoField } from '../PhotoField';
import { base64ToBytes, resizeTarget } from '../photo';
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
