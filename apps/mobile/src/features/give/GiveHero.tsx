import { Text, View } from 'react-native';

import { fontFamily, onInk, palette, typeScale } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';

// GIVE hero (mockup .mediahero on the Give frame): a scripture banner, NOT a media
// card, so unlike Watch's MediaHero it has no thumbnail, play circle, or press
// behaviour. Green-to-ink gradient, gold eyebrow, title, verse. The gradient stops
// are decorative brand literals (same convention MediaHero uses for its #33507f).
export interface GiveHeroProps {
  eyebrow: string;
  title: string;
  verse: string;
}

export function GiveHero({ eyebrow, title, verse }: GiveHeroProps) {
  return (
    <View
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        minHeight: 168,
        justifyContent: 'flex-end',
        backgroundColor: palette.ink,
      }}
    >
      <GradientFill direction="diagonal" from="#3a5a3f" to={palette.ink} />
      {/* Mockup .mediahero .bg::after: the bottom scrim that darkens the text
          area (rgba ink .05 to .92). Same plain-hex + stop-opacity approach as
          MediaHero's scrim. */}
      <GradientFill
        direction="vertical"
        from={palette.ink}
        to={palette.ink}
        fromOpacity={0.05}
        toOpacity={0.92}
      />
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
          accessibilityRole="header"
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
          {verse}
        </Text>
      </View>
    </View>
  );
}
