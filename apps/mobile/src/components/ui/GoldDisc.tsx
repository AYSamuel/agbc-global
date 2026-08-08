import type { ReactNode } from 'react';
import { View } from 'react-native';

import { palette } from '@agbc/shared/theme';

/**
 * The mockup's 88px gold disc with its 10px soft ring: `.success .sicon` on
 * AUTH-4 and branch arrival, and `.celebrate .celdisc` on the milestone overlay
 * (`box-shadow:0 0 0 10px rgba(255,207,74,.15)`, drawn as a view because RN has
 * no box-shadow).
 *
 * Extracted at W2.8 when the celebration needed the same disc the success screen
 * already drew. The plan calls it "AUTH-4's arrival disc" precisely because it is
 * meant to be the same object: an arrival and a milestone are the same kind of
 * moment, and two copies of these numbers would drift the first time one of them
 * was nudged.
 *
 * Decorative by construction: whatever it holds (a check, an emoji) is a picture
 * of something the words underneath already say, so the whole disc is hidden
 * from assistive tech and callers do not have to remember to do it.
 */
export function GoldDisc({
  children,
  /** Rendered inside the disc, behind its content: the celebration's burst. */
  behind,
}: {
  children: ReactNode;
  behind?: ReactNode;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: palette.gold,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -10,
          left: -10,
          right: -10,
          bottom: -10,
          borderWidth: 10,
          borderColor: 'rgba(255,207,74,0.15)',
          borderRadius: 54,
        }}
      />
      {behind}
      {children}
    </View>
  );
}
