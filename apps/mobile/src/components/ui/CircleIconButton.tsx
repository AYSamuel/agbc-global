import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { radius } from '@agbc/shared/theme';

// The mockup's .heronav / .branchhero .nav circle: a 40px glass button floating
// over a hero image or gradient (white-alpha fill, white icon). Also carries
// the chead back-circle role when given a solid background color.
export interface CircleIconButtonProps {
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  /** Defaults to the on-hero glass fill. */
  backgroundColor?: string;
}

export function CircleIconButton({
  icon,
  accessibilityLabel,
  onPress,
  backgroundColor = 'rgba(255,255,255,0.18)',
}: CircleIconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}
