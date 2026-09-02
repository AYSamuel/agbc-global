import type { PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Width classes per docs/spec/05 tablet rules: 'full' spans the viewport (feeds, rails);
// 'capped' centers content at a readable measure (~680, forms/Home) so large screens
// never stretch awkwardly.
/**
 * The 'capped' measure. Exported because a bottom `Sheet` renders in a Modal, outside
 * any screen's width class, and has to hold the same column by itself (found on a
 * 1000dp tablet, W2.6). One number, one place.
 */
export const CAPPED_MAX_WIDTH = 680;

/**
 * The mockup draws FOUR content measures and this app had one (W4.7 slice 4).
 * `.tcol` 600 for a centred form or list, `.readwrap` 680 for reading, `.dash`
 * 1000 for the Home dashboard grid, `.tgrid` 1040 for the store grid. On a phone
 * none of them binds, since no phone is 600dp wide, so these are tablet measures
 * that happen to be expressed as a maximum.
 *
 * `capped` deliberately keeps 680 and its meaning, so nothing that already used
 * it moves; the other two are added rather than substituted. The store's 1040 is
 * absent because the store is, and it arrives with W4.2.
 */
export const WIDTH_MEASURES = {
  /** `.tcol`: a form or a centred list. */
  column: 600,
  /** `.readwrap`, and the measure `capped` has always meant. */
  capped: CAPPED_MAX_WIDTH,
  /** `.dash`: the Home dashboard grid, which is two columns inside this. */
  dashboard: 1000,
} as const;

export type WidthClass = 'full' | keyof typeof WIDTH_MEASURES;

export interface ScreenProps extends PropsWithChildren {
  /** Scrollable by default; static screens (players, maps) opt out. */
  scroll?: boolean;
  /** Centres content at one of the mockup's measures on wide screens; 'full'
   *  spans the viewport. See `WIDTH_MEASURES`. */
  widthClass?: WidthClass;
  /** Apply the horizontal gutter (05: 18-20). Defaults on. */
  padded?: boolean;
  /**
   * Pad the bottom safe-area inset. Defaults on. A screen whose content must
   * reach the tab bar (the Family map's bottom sheet) sets this false: the tab
   * bar already owns the home-indicator inset, so padding here just leaves a gap.
   */
  bottomInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Form screens set this so a tap on the submit button lands on the first
   * try while the keyboard is open (default RN behavior swallows it into a
   * keyboard dismiss).
   */
  keyboardPersistTaps?: boolean;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  widthClass = 'full',
  padded = true,
  bottomInset = true,
  refreshing,
  onRefresh,
  keyboardPersistTaps = false,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = bottomInset ? insets.bottom : 0;

  const contentWidth =
    widthClass === 'full'
      ? null
      : {
          width: '100%' as const,
          maxWidth: WIDTH_MEASURES[widthClass],
          alignSelf: 'center' as const,
        };

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

  // insets.top alone glues the first row to the status bar; the real inset plus
  // screenTop reproduces the mockup's frame-top-to-title geometry (see the
  // token's note). True flush-top screens (splash, photo-hero onboarding) do
  // not use Screen.
  const topPadding = insets.top + spacing.screenTop;

  if (!scroll) {
    return (
      <View
        testID={testID}
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: topPadding,
          paddingBottom: bottomPad,
        }}
      >
        {inner}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      keyboardShouldPersistTaps={keyboardPersistTaps ? 'handled' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: topPadding,
        paddingBottom: bottomPad + spacing.x2l,
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
