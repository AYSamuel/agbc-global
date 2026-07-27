import * as Crypto from 'expo-crypto';

import {
  TESTIMONY_PHOTO_BUCKET,
  TESTIMONY_PHOTO_MAX_BYTES,
  TESTIMONY_PHOTO_MAX_EDGE,
  TESTIMONY_PHOTO_QUALITY,
} from '@agbc/shared';

import { supabase } from '@/lib/supabase';

// The testimony photo pipeline (W2.3 slice 3): pick, re-encode, upload, then ask
// the server to open it. Each step exists for a stated reason (docs/spec/02
// §Storage, ~/.claude/standards/security.md §File uploads):
//
//   pick      the member's own library only. The app never opens the camera, so
//             the camera and microphone permissions are blocked outright in the
//             config plugin.
//   re-encode this is what strips EXIF/GPS. A testimony photo taken at home
//             carries the author's home coordinates, and nothing downstream
//             would remove them. Also bounds the upload to something a phone on
//             church wifi can actually send.
//   random id the object is named with a fresh uuid, never the member's filename
//             ("IMG_20250412_kids_hospital.jpg" is itself disclosure).
//   guard     the bytes are read server-side before anything may reference them
//             (photo-guard). The database refuses an unvalidated path, so this
//             call is not a courtesy the client may skip.
//
// expo-image-picker and expo-image-manipulator are NATIVE modules. A dev client
// built before they were linked (anything before the 2026-07-27 build) throws at
// import and would kill the whole composer route, so both are behind guarded
// requires and the affordance simply does not render without them. Same pattern
// as features/give/CopyRow.tsx and components/ui/Gradient.tsx.

interface PickedAsset {
  uri: string;
  width: number;
  height: number;
}

interface ImagePickerModule {
  launchImageLibraryAsync: (options: {
    mediaTypes: string[];
    allowsMultipleSelection: boolean;
    quality: number;
    exif: boolean;
  }) => Promise<{ canceled: boolean; assets: PickedAsset[] | null }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
}

interface ManipulatorContext {
  resize: (size: { width?: number; height?: number }) => ManipulatorContext;
  renderAsync: () => Promise<{
    saveAsync: (options: {
      format: string;
      compress: number;
      base64: boolean;
    }) => Promise<{ uri: string; base64?: string }>;
  }>;
}

interface ImageManipulatorModule {
  ImageManipulator: { manipulate: (uri: string) => ManipulatorContext };
  SaveFormat: { JPEG: string };
}

function loadPicker(): ImagePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

function loadManipulator(): ImageManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as ImageManipulatorModule;
  } catch {
    return null;
  }
}

const Picker = loadPicker();
const Manipulator = loadManipulator();

/** False on a dev client that predates these native modules, and on web. The
 * composer hides the affordance rather than offering a control that throws. */
export const photoPickingAvailable = Picker !== null && Manipulator !== null;

/**
 * Base64 to bytes, hand-rolled because the alternatives are worse here: `atob`
 * is a Hermes built-in this project has not verified on both platforms, Buffer
 * is not part of the RN runtime, and expo-file-system would be a THIRD native
 * module and another EAS rebuild before the photo could ship. Exported for its
 * unit test.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let out = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = B64.indexOf(clean[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (buffer >> bits) & 0xff;
      out += 1;
    }
  }
  return bytes.subarray(0, out);
}

/**
 * The resize instruction for one picked image: constrain the LONGER edge and let
 * the manipulator derive the other, so portrait and landscape both come out
 * within the ceiling and neither is distorted. An image already inside it is
 * left alone (upscaling a small photo just makes a bigger file).
 */
export function resizeTarget(
  width: number,
  height: number,
  maxEdge: number = TESTIMONY_PHOTO_MAX_EDGE,
): { width?: number; height?: number } | null {
  if (width <= maxEdge && height <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export type PhotoFailure =
  | 'cancelled'
  | 'permission'
  | 'too_large'
  | 'not_an_image'
  | 'unavailable'
  | 'failed';

export type PhotoResult =
  | {
      ok: true;
      path: string;
      bytes: number;
      /** The re-encoded local file, so the composer can paint the preview without
       * a round trip to sign a URL for an object the author just sent. */
      previewUri: string;
    }
  | { ok: false; reason: PhotoFailure };

/** Maps the wire error from photo-guard onto the app's reasons. Anything the app
 * does not recognise is a generic failure: never surface a server string. */
function guardFailure(code: unknown): PhotoFailure {
  if (code === 'not_an_image') return 'not_an_image';
  if (code === 'too_large') return 'too_large';
  return 'failed';
}

/**
 * Pick a photo and leave it uploaded, re-encoded and server-checked, returning
 * the object path the testimony row will carry. Every failure is a value, not a
 * throw: the composer has a state for each and the author never loses their
 * words to a photo problem.
 */
export async function pickAndUploadTestimonyPhoto(
  userId: string,
): Promise<PhotoResult> {
  if (Picker === null || Manipulator === null)
    return { ok: false, reason: 'unavailable' };

  let picked: PickedAsset;
  try {
    const permission = await Picker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'permission' };

    const result = await Picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      // The re-encode strips metadata anyway; not reading it in the first place
      // means the author's coordinates never enter the JS heap at all.
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) {
      return { ok: false, reason: 'cancelled' };
    }
    picked = result.assets[0];
  } catch {
    return { ok: false, reason: 'failed' };
  }

  let bytes: Uint8Array;
  let previewUri: string;
  try {
    let context = Manipulator.ImageManipulator.manipulate(picked.uri);
    const target = resizeTarget(picked.width, picked.height);
    if (target !== null) context = context.resize(target);

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: Manipulator.SaveFormat.JPEG,
      compress: TESTIMONY_PHOTO_QUALITY,
      base64: true,
    });
    if (!saved.base64) return { ok: false, reason: 'failed' };
    bytes = base64ToBytes(saved.base64);
    previewUri = saved.uri;
  } catch {
    return { ok: false, reason: 'failed' };
  }

  // Storage enforces this too; checking here turns a rejected upload into copy
  // the author can act on, before spending their data on the transfer.
  if (bytes.byteLength > TESTIMONY_PHOTO_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const upload = await supabase.storage
    .from(TESTIMONY_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) return { ok: false, reason: 'failed' };

  // The server opens the file. A refusal has already deleted the object, so
  // there is nothing to clean up here.
  const guard = await supabase.functions.invoke<{ ok: boolean }>(
    'photo-guard',
    {
      body: { path },
    },
  );
  if (guard.error) {
    // supabase-js hangs the raw Response off the error as `context`; reading the
    // machine code out of it is what turns "it failed" into copy the author can
    // act on. Anything unexpected in there falls through to the generic line.
    let code: unknown = null;
    const context: unknown = (guard.error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.json()) as { error?: unknown };
        code = body.error ?? null;
      } catch {
        // Not JSON, or already consumed.
      }
    }
    return { ok: false, reason: guardFailure(code) };
  }

  return { ok: true, path, bytes: bytes.byteLength, previewUri };
}

/** Remove an object the author has decided against. Best effort by design: the
 * composer must not block on cleanup, and an orphan in a private bucket the
 * member owns is a housekeeping matter, not a leak. */
export async function discardTestimonyPhoto(path: string): Promise<void> {
  try {
    await supabase.storage.from(TESTIMONY_PHOTO_BUCKET).remove([path]);
  } catch {
    // Nothing the author can do about it, and nothing they should see.
  }
}
