import { View } from 'react-native';

import { radius, spacing } from '@agbc/shared/theme';

import { Button } from './Button';

export interface FabProps {
  label: string;
  onPress: () => void;
}

// Pinned full-width primary action at the bottom of a feed (mockup .fab): the
// Family testimony/prayer share button today, reusable by any feed with a single
// create action. Sits above the tab bar because each tab screen's area already
// ends at the tab bar's top edge, so `bottom` is measured from there.
export function Fab({ label, onPress }: FabProps) {
  return (
    <View
      // pointerEvents box-none would let taps fall through the padding; the button
      // itself is the only interactive child, so a plain absolute wrapper is fine.
      style={{
        position: 'absolute',
        left: spacing.gutter,
        right: spacing.gutter,
        bottom: spacing.lg,
        // Mockup .fab .btn: a soft lift so the button reads above the feed.
        borderRadius: radius.button,
        shadowColor: '#0e1420',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <Button label={label} variant="primary" onPress={onPress} />
    </View>
  );
}
