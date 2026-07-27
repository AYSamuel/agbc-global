import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { useSignedPhotoUrl } from './useSignedPhotoUrl';

// The optional testimony photo, on the feed card (mockup `.testi .shot`, under the
// words and above the actions) and on TESTIMONY-DETAIL (mockup `.tshot`, between
// the quote and the author). Both frames are a rounded box of fixed proportion
// with the image covering it, so a portrait pick and a landscape pick sit in the
// same rhythm down the feed.
//
// Expressed as an aspect ratio rather than the frames' fixed pixel heights: the
// frames are drawn at one 390pt width, and a fixed height would letterbox on a
// tablet and crop harder on a small phone. The ratios below are the frames' own
// box divided by the width they were drawn at.
const ASPECT = {
  card: 322 / 172,
  detail: 350 / 212,
} as const;

export interface TestimonyPhotoProps {
  /** `testimonies.image_path`; null renders nothing at all. */
  path: string | null;
  variant: keyof typeof ASPECT;
  /** The author's display name, for the accessible description. */
  authorName: string;
}

/**
 * Most testimonies carry no photo, so the signing query is not merely disabled
 * for them, it is never mounted: the hook lives one component deeper. That keeps
 * a text-only feed free of per-card query subscriptions, and keeps every screen
 * that renders a plain testimony independent of the query layer.
 */
export function TestimonyPhoto({
  path,
  variant,
  authorName,
}: TestimonyPhotoProps) {
  if (path === null) return null;
  return <SignedPhoto path={path} variant={variant} authorName={authorName} />;
}

function SignedPhoto({
  path,
  variant,
  authorName,
}: TestimonyPhotoProps & { path: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation('family');
  const signed = useSignedPhotoUrl(path);

  const frame = {
    width: '100%' as const,
    aspectRatio: ASPECT[variant],
    borderRadius: radius.cardTight,
    overflow: 'hidden' as const,
    backgroundColor: colors.alt,
    marginTop: variant === 'card' ? spacing.md : 0,
    marginBottom: variant === 'detail' ? spacing.lg : 0,
  };

  // The four states, resolved for what this actually is: a photo attached to
  // words that stand on their own. Loading reserves the space so the card does
  // not jump; a refusal, an expired link, an offline mint and a missing object
  // all collapse to "no photo", because there is no useful action to offer and
  // an error card where a picture should be would be louder than the testimony.
  if (signed.data === undefined && !signed.isError) {
    return <View style={frame} accessibilityElementsHidden />;
  }
  if (signed.isError || signed.data === null) return null;

  return (
    <View style={frame}>
      <Image
        source={{ uri: signed.data }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        accessible
        accessibilityRole="image"
        // No author-supplied alt text exists, so the label says what is true
        // rather than inventing a description of the image.
        accessibilityLabel={t('photoFrom', { name: authorName })}
        transition={150}
      />
    </View>
  );
}
