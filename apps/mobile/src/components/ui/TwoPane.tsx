import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The tablet master-detail layout (mockup `.twopane`): a fixed list pane with a
 * hairline down its right edge, and a detail pane that takes the rest.
 *
 * ROUTES STAY THE SOURCE OF TRUTH (decided with Ayo, 2026-09-02). The detail
 * pane holds the SAME navigator the phone pushes onto, so a row tap still
 * changes the route, a deep link still lands on the right screen, and back and
 * gate-return still behave as `04` and `03` describe. The only difference on a
 * tablet is where the route draws: beside the list instead of over it. The
 * alternative, a selected id held in component state, would have made a
 * notification deep link open a phone-shaped full screen on a tablet and given
 * back two different meanings on two devices, which is exactly the sort of split
 * W3.6 spent a day verifying away.
 *
 * Values are the frame's: 396 wide, a `--border` hairline (decorative, so
 * `cardline` rather than `controlline`), and both panes scroll independently.
 */
export interface TwoPaneProps {
  list: ReactNode;
  detail: ReactNode;
}

/** `.pane-list` width, the frame's own. */
export const PANE_LIST_WIDTH = 396;

export function TwoPane({ list, detail }: TwoPaneProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View
        style={{
          width: PANE_LIST_WIDTH,
          borderRightWidth: 1,
          borderRightColor: colors.cardline,
        }}
      >
        {list}
      </View>
      {/* `minWidth: 0` so a long unbreakable line in the detail cannot push the
          list pane off its fixed width. */}
      <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
    </View>
  );
}
