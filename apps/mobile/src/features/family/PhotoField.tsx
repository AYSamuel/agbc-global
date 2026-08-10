import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { CloseIcon, ImageIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import { photoFailureKey } from './composeErrors';
import type { PhotoFailure } from './photo';
import { useSignedPhotoUrl } from './useSignedPhotoUrl';

// TESTIMONY-COMPOSE's photo affordance, in its four frames: the dashed
// "Add a photo" box (mockup `.addphoto`, line 1151), the attached preview with a
// remove control (`.shotbox.cshot` + `.rm`), the same preview under a busy
// overlay while the photo is being prepared and checked (`.busy`), and the
// failure line under a restored dashed box (`.photoerr`).
//
// The overlay's copy matters: "preparing" covers a re-encode, an upload AND the
// server-side check, which is the truth from the author's side and does not
// promise which step is slow.

/** Mockup `.cshot`: 184px tall inside an 18px-margin 390pt frame. Kept as a ratio
 * so the box holds its shape on a small phone and a tablet alike. */
const PREVIEW_ASPECT = 354 / 184;

export interface PhotoFieldProps {
  /** Object path once uploaded and checked; null while there is no photo. */
  path: string | null;
  /** Local file URI of the re-encoded pick, when this session made it. Preferred
   * over a signed URL: no round trip, and it still paints with no network. */
  previewUri: string | null;
  busy: boolean;
  failure: PhotoFailure | null;
  onPick: () => void;
  onRemove: () => void;
}

export function PhotoField({
  path,
  previewUri,
  busy,
  failure,
  onPick,
  onRemove,
}: PhotoFieldProps) {
  const { t } = useTranslation('family');
  const { colors } = useTheme();
  // Only needed for a draft restored after the app was killed: the object is
  // still there, the cached file the picker wrote is not.
  const signed = useSignedPhotoUrl(previewUri === null ? path : null);
  const uri = previewUri ?? signed.data ?? null;

  const box = {
    width: '100%' as const,
    aspectRatio: PREVIEW_ASPECT,
    borderRadius: radius.cardTight,
    overflow: 'hidden' as const,
    backgroundColor: colors.alt,
    marginTop: 14,
  };

  if (path !== null || busy) {
    return (
      <View style={box}>
        {uri === null ? null : (
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessible={false}
          />
        )}

        {busy ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              paddingHorizontal: spacing.lg,
              backgroundColor: onInk.scrimSolid,
            }}
          >
            <ActivityIndicator size="small" color={onInk.text} />
            <Text
              // flexShrink so the German string at the device's maximum font
              // scale wraps inside the overlay instead of running off it.
              style={{
                flexShrink: 1,
                fontFamily: fontFamily.body.bold,
                fontSize: 13,
                color: onInk.text,
              }}
            >
              {t('composePhotoBusy')}
            </Text>
          </View>
        ) : (
          // Mockup `.rm`: a 32px dark disc over the top-right corner. hitSlop
          // lifts the touch target to the 44px floor without changing the drawn
          // size (docs/spec/05 accessibility contract).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('composePhotoRemove')}
            onPress={onRemove}
            hitSlop={6}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 10,
              right: 10,
              width: 32,
              height: 32,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: onInk.scrimSolid,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <CloseIcon size={icon.md} color={onInk.text} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('composeAddPhoto')}
        onPress={onPick}
        style={({ pressed }) => ({
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.cardline,
          borderRadius: radius.cardTight,
          padding: 18,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <ImageIcon size={icon.xl} color={colors.muted} />
        <Text
          // Same reason as the busy overlay: at maximum scale the label wraps
          // inside the dashed box rather than pushing past its edge.
          style={{
            flexShrink: 1,
            fontFamily: fontFamily.body.bold,
            fontSize: 14,
            color: colors.muted,
          }}
        >
          {t('composeAddPhoto')}
        </Text>
      </Pressable>

      {/* Backing out of the system picker is not a failure and gets no copy;
          ComposeFlow already filters it, and saying so here makes the rule
          visible at the place that would otherwise show a line. */}
      {failure === null || failure === 'cancelled' ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            lineHeight: 12 * 1.45,
            color: palette.red,
            marginTop: spacing.sm,
          }}
        >
          {t(photoFailureKey(failure))}
        </Text>
      )}
    </>
  );
}
