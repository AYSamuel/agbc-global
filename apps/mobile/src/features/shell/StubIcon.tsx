import type { ComponentType } from 'react';
import { View } from 'react-native';

import { icon, radius } from '@agbc/shared/theme';

import type { IconProps } from '@/components/ui';
import { useTheme } from '@/theme';

// Decorative circle for stub empty states (mockup .authicon shape: a soft alt
// circle around a glyph). EmptyState already hides its icon slot from a11y.
export function StubIcon({ Icon }: { Icon: ComponentType<IconProps> }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: radius.full,
        backgroundColor: colors.alt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={icon.x2l} color={colors.muted} />
    </View>
  );
}
