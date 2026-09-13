import type { RefObject } from 'react';
import type { View } from 'react-native';

/**
 * Turning the share card into a file, and handing that file to the OS (W4.15).
 *
 * BOTH MODULES ARE NATIVE AND BOTH ARE LOADED BEHIND A GUARD, the `CopyRow` /
 * `Gradient` pattern. A dev client built before they were added throws "Cannot find
 * native module" at import, which would take the whole route down, so a missing module
 * makes `PICTURE_SHARE_LINKED` false and every share degrades to the text share the app
 * has sent for a year. The next EAS build links them; until then nothing is broken, it is
 * simply the old behaviour.
 *
 * WHY expo-sharing AND NOT `Share.share({ url })`. React Native's own Share takes a file
 * url on iOS only, so on Android this is the only road. The cost is stated on the card:
 * `SharingOptions` is `mimeType`, `dialogTitle`, `UTI` and `anchor` and nothing else, so
 * NO caption, link or app name can travel beside the picture, which is why everything a
 * stranger needs is printed on the card itself (plan §3).
 */

interface ViewShotModule {
  captureRef: (
    view: RefObject<View | null>,
    options: {
      format: 'png';
      result: 'tmpfile';
      fileName?: string;
    },
  ) => Promise<string>;
}

interface SharingModule {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (
    url: string,
    options?: { mimeType?: string; dialogTitle?: string; UTI?: string },
  ) => Promise<void>;
}

function loadViewShot(): ViewShotModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-view-shot') as ViewShotModule;
  } catch {
    return null;
  }
}

function loadSharing(): SharingModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-sharing') as SharingModule;
  } catch {
    return null;
  }
}

const ViewShot = loadViewShot();
const Sharing = loadSharing();

/**
 * Are the native modules in THIS BINARY? The dev-client fence, and nothing else.
 *
 * Synchronous on purpose, because it decides something before a sheet is ever opened: on a
 * dev client built before W4.15 the picture is not merely unavailable, it was never a
 * possibility, so the Share button goes straight to the text share it has sent for a year
 * rather than opening a sheet in order to apologise. A member on any real build never
 * takes this path.
 */
export const PICTURE_SHARE_LINKED = ViewShot !== null && Sharing !== null;

/**
 * Whether the OS will actually show a share sheet (`isAvailableAsync` is false on a
 * simulator with no sharing services, and on a device with no target that accepts files).
 *
 * A DIFFERENT QUESTION FROM THE ONE ABOVE and answered in a different place: this is a
 * runtime failure the member should be told about, so it lands on the sheet's error state,
 * where there is a way out. Async because the module's own answer is.
 */
export async function canShareImage(): Promise<boolean> {
  if (!ViewShot || !Sharing) return false;
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Rasterise the mounted card and return a local file uri.
 *
 * NO `width`/`height` OPTION, deliberately. Those RESIZE the result from the view's
 * bounds rather than setting the render size, so passing 1080 here would resample a
 * capture that is already 1080 (see `geometry.ts`: the card is rendered at exactly the dp
 * that lands on 1080 real pixels for this device). A resample can only cost sharpness.
 *
 * `tmpfile` rather than base64: the file is handed straight to another app, and a
 * megabyte of base64 across the bridge to make a file the OS wants anyway is waste.
 * The result is NOT released afterwards, on purpose: the receiving app may read the file
 * after `shareAsync` has resolved, and a tmpfile dies with the process regardless.
 */
export async function captureShareCard(
  ref: RefObject<View | null>,
): Promise<string> {
  if (!ViewShot) throw new Error('react-native-view-shot is not linked');
  const uri = await ViewShot.captureRef(ref, {
    format: 'png',
    result: 'tmpfile',
    // Android names the file from this; it is what a recipient sees if their chat app
    // shows a filename. Not translated: a filename is not UI copy.
    fileName: 'agbc-share',
  });
  return uri;
}

/** Hand the PNG to the OS share sheet. */
export async function shareCardImage(
  uri: string,
  dialogTitle: string,
): Promise<void> {
  if (!Sharing) throw new Error('expo-sharing is not linked');
  await Sharing.shareAsync(toFileUri(uri), {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle,
  });
}

/**
 * `captureRef`'s tmpfile comes back as a bare path on some platforms and a `file://` uri
 * on others, and `shareAsync` wants the scheme (react-native-view-shot's own README says
 * so under "Trying to share the capture result with expo-sharing?").
 */
function toFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}
