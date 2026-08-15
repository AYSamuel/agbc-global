import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, onInk, palette, typeScale } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';

// Mockup .mediahero: 20-radius ink card, gradient + heavy bottom scrim over the
// picture, optional LIVE badge, gold play circle, eyebrow + title + meta.
//
// W3.1 slice 5: it takes a resolved artwork URL rather than the YouTube thumbnail
// by name. This is the biggest picture in the app, so it is the one place where
// showing the gradient while the rail row below it showed real artwork would be
// most obviously wrong.
export interface MediaHeroProps {
  eyebrow: string;
  title: string;
  meta: string;
  /** Already resolved by `sermonArtworkUrl`: ours, else YouTube's, else null. */
  artworkUrl: string | null;
  liveBadge?: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export function MediaHero({
  eyebrow,
  title,
  meta,
  artworkUrl,
  liveBadge,
  onPress,
  accessibilityLabel,
}: MediaHeroProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 20,
        overflow: 'hidden',
        minHeight: 200,
        justifyContent: 'flex-end',
        backgroundColor: palette.ink,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <GradientFill direction="diagonal" from="#33507f" to={palette.ink} />
      {artworkUrl ? (
        <Image
          source={{ uri: artworkUrl }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
          transition={150}
          onError={(event) => {
            // Decorative: the gradient below is the fallback, but say so in dev.
            console.warn('hero artwork failed:', artworkUrl, event.error);
          }}
        />
      ) : null}
      {/* Scrim via plain hex + explicit stop opacities: rgba-in-stopColor is
          the less reliable path through react-native-svg. */}
      <GradientFill
        direction="vertical"
        from={palette.ink}
        to={palette.ink}
        fromOpacity={0.15}
        toOpacity={0.92}
      />
      {liveBadge ? (
        <View
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: palette.red,
            borderRadius: 100,
            paddingVertical: 5,
            paddingHorizontal: 11,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: onInk.text,
            }}
          />
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 11.5,
              color: onInk.text,
            }}
          >
            {liveBadge}
          </Text>
        </View>
      ) : null}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          alignSelf: 'center',
          top: '50%',
          marginTop: -30,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: palette.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            marginLeft: 4,
            borderLeftWidth: 16,
            borderTopWidth: 10,
            borderBottomWidth: 10,
            borderLeftColor: palette.navy,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
          }}
        />
      </View>
      <View style={{ paddingHorizontal: 18, paddingVertical: 16 }}>
        <Text
          style={[
            typeScale.label,
            { fontSize: 11, letterSpacing: 2.6, color: palette.gold },
          ]}
        >
          {eyebrow}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 20,
            letterSpacing: -0.4,
            color: onInk.text,
            marginTop: 6,
            marginBottom: 2,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: onInk.sub,
          }}
        >
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}
