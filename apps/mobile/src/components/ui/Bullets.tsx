import { Text, View } from 'react-native';

import { fontFamily, palette, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

/**
 * The mockup's `.bullets` block: a short list of plain statements, each behind a
 * small round dot (DELETE's "what will be removed", PRIVACY's "what we collect"
 * and "how we use it").
 *
 * EXTRACTED AT THE SECOND USE, not the first. DELETE hand-rolled it at W4.5 with
 * the frame's arithmetic written out in a comment, and PRIVACY needs the same
 * geometry with a different dot colour. Two copies of `marginTop: 8` on a 6px dot
 * is two chances for one screen to drift a pixel from the other, which is the
 * same argument `ListScreen` was extracted on.
 *
 * THE DOT CARRIES THE TONE AND THE TEXT NEVER DOES. DELETE's dots are red because
 * the list is what a member is about to lose; PRIVACY's are `eye` gold, the
 * frame's default. The sentences stay `sub` in both, because red body text on a
 * list this long reads as a warning about every line rather than about the act.
 */
export type BulletTone = 'eye' | 'danger';

export interface BulletsProps {
  items: readonly string[];
  tone?: BulletTone;
}

export function Bullets({ items, tone = 'eye' }: BulletsProps) {
  const { colors } = useTheme();
  const dot = tone === 'danger' ? palette.red : colors.eye;

  return (
    // `.bullets` sits at 20 in the frame against the cards' 16, so it takes the
    // extra 4 itself rather than the screen's gutter widening for everything.
    <View style={{ paddingHorizontal: spacing.xs }}>
      {items.map((item) => (
        <View
          key={item}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 11,
            paddingVertical: 6,
          }}
        >
          <View
            // Decorative: the dot repeats nothing and a screen reader announcing
            // "bullet" five times is noise, so only the sentence is exposed.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: dot,
              marginTop: 8,
            }}
          />
          <Text
            style={{
              flex: 1,
              fontFamily: fontFamily.body.regular,
              fontSize: 14,
              lineHeight: 21,
              color: colors.sub,
            }}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}
