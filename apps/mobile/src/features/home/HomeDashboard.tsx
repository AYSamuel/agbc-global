import type { ReactNode } from 'react';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { useLayout } from '@/lib/layout';

/**
 * Home's sections, laid out for the screen they are on (mockup `HOME · tablet
 * landscape · dashboard grid`, the `.dash` block).
 *
 * WHY THE SECTIONS ARE NAMED PROPS rather than children. The phone order is
 * load-bearing and `07` says so: the rhythm strip sits directly under the
 * service card because it answers the same question. The tablet's two columns
 * put the verse under the service instead. A component that split `children` by
 * index would silently reorder the phone the day a section moved, so each
 * section arrives by name and this file is the only place either order lives.
 *
 * TWO COLUMNS ONLY IN LANDSCAPE. The mockup draws the grid for tablet landscape
 * and draws no portrait Home at all, so portrait keeps the single column at the
 * reading measure rather than inventing a split nobody designed.
 */
export interface HomeDashboardProps {
  service: ReactNode;
  rhythm: ReactNode;
  verse: ReactNode;
  family: ReactNode;
  sermons: ReactNode;
  join: ReactNode;
}

export function HomeDashboard({
  service,
  rhythm,
  verse,
  family,
  sermons,
  join,
}: HomeDashboardProps) {
  const { isTablet, isLandscape } = useLayout();

  if (!isTablet || !isLandscape) {
    // The phone, unchanged: the frame's own order and the gutter it has always
    // had. Nothing about this path is new.
    return (
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {service}
        {rhythm}
        {verse}
        {family}
        {sermons}
        {join}
      </View>
    );
  }

  return (
    // `.dash`: two columns, 20 gap, 20/26 padding, capped at 1000 and centred,
    // items aligned to the top so a short column does not stretch to match a
    // long one.
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.gutter,
        paddingHorizontal: 26,
        paddingVertical: spacing.gutter,
        alignItems: 'flex-start',
      }}
    >
      {/* The frame's first column: the service hero, then the verse. */}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.lg }}>
        {service}
        {verse}
      </View>
      {/* The frame's second column, and the member frame's note that the rhythm
          belongs on this side ("rhythm in the right column"). */}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.lg }}>
        {rhythm}
        {family}
        {sermons}
        {join}
      </View>
    </View>
  );
}
