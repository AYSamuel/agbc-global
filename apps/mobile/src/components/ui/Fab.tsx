import { View } from 'react-native';

import { radius, spacing } from '@agbc/shared/theme';

import { Button } from './Button';
import { CAPPED_MAX_WIDTH } from './Screen';

export interface FabProps {
  label: string;
  onPress: () => void;
}

/**
 * The card inset, which is what this button lines up with: the mockup's `.fab` is
 * `left:16px; right:16px`, the same as `.testi` / `.prayer`, so the pinned action sits
 * directly under the column of cards rather than 4px wider on each side.
 */
const FAB_INSET = spacing.lg;

/** The capped column's inner width, once that inset is taken off both sides: what the
 * button may grow to before it stops tracking the feed it belongs to. */
const FAB_MAX_WIDTH = CAPPED_MAX_WIDTH - FAB_INSET * 2;

/**
 * Pinned full-width primary action at the bottom of a feed (mockup `.fab`): the Family
 * testimony/prayer share button today, reusable by any feed with a single create action.
 * Sits above the tab bar because each tab screen's area already ends at the tab bar's top
 * edge, so `bottom` is measured from there.
 *
 * Capped and centred on `Screen`'s measure, found on a 1000dp tablet (2026-08-04). This is
 * positioned against the SCREEN rather than against the feed, so it ran the full width of
 * the device while the cards it belongs to sat in a 680dp column, and read as a bar across
 * the bottom overlapping the last card rather than a button under it. On a phone the cap is
 * wider than the device, so only the inset below changes there.
 *
 * The positioning layer is `box-none` now that it spans the whole width: without it, that
 * layer would swallow every tap along the bottom of the feed.
 */
export function Fab({ label, onPress }: FabProps) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: spacing.lg,
        alignItems: 'center',
        paddingHorizontal: FAB_INSET,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: FAB_MAX_WIDTH,
          // Mockup .fab .btn: a soft lift so the button reads above the feed.
          borderRadius: radius.button,
          shadowColor: '#0e1420',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Button label={label} variant="primary" fullWidth onPress={onPress} />
      </View>
    </View>
  );
}
