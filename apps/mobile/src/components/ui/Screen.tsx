import type { PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Width classes per docs/spec/05 tablet rules: 'full' spans the viewport (feeds, rails);
// 'capped' centers content at a readable measure (~680, forms/Home) so large screens
// never stretch awkwardly.
const CAPPED_MAX_WIDTH = 680;

export interface ScreenProps extends PropsWithChildren {
  /** Scrollable by default; static screens (players, maps) opt out. */
  scroll?: boolean;
  /** 'capped' centers content at ~680 max width on wide screens. */
  widthClass?: 'full' | 'capped';
  /** Apply the horizontal gutter (05: 18-20). Defaults on. */
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  widthClass = 'full',
  padded = true,
  refreshing,
  onRefresh,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const contentWidth =
    widthClass === 'capped'
      ? {
          width: '100%' as const,
          maxWidth: CAPPED_MAX_WIDTH,
          alignSelf: 'center' as const,
        }
      : null;

  const inner = (
    <View
      style={[
        { flex: scroll ? undefined : 1 },
        padded && { paddingHorizontal: spacing.gutter },
        contentWidth,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View
        testID={testID}
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {inner}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.x2l,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.muted}
          />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  );
}
