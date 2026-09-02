import type { ReactElement } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { WIDTH_MEASURES, type ScreenProps } from './Screen';

/**
 * `Screen`, but the scroller is virtualized.
 *
 * WHY IT EXISTS. Until W4.7 slice 3 there was no `FlatList`, `FlashList` or
 * `SectionList` anywhere in this app: every feed, result list and notification
 * centre was a `ScrollView` with `.map()`, so every row was mounted whether or
 * not it was on screen. The risk was bounded rather than unbounded, because the
 * Family feed caps at `FEED_LIMIT` with no pagination, but "bounded" here still
 * means fifty testimony cards with remote photos all mounted at once, on the
 * screen a member opens most, on the low-end Android this has to run on.
 *
 * A PRIMITIVE RATHER THAN A `FlatList` PER SCREEN, because the chrome is the
 * part that is easy to get subtly wrong: the top inset plus `screenTop` that
 * reproduces the mockup's frame-top-to-title geometry, the bottom safe-area
 * inset, the capped measure, and a refresh control that only spins for a real
 * pull. Seven screens hand-rolling that is seven chances to differ. The geometry
 * is imported from `Screen` rather than copied, so the two cannot drift.
 *
 * A LIST SCREEN OWNS ITS SCROLLER. A `FlatList` inside a same-axis `ScrollView`
 * loses virtualization entirely and warns, so anything that should scroll ABOVE
 * the rows goes in `header`, not around this component.
 */
export interface ListScreenProps<T>
  extends Pick<
    ScreenProps,
    'widthClass' | 'padded' | 'bottomInset' | 'refreshing' | 'onRefresh'
  > {
  data: readonly T[];
  renderItem: (item: T) => ReactElement | null;
  keyExtractor: (item: T) => string;
  /** Scrolls with the rows, the way it did when the screen was one ScrollView. */
  header?: ReactElement | null;
  /** Drawn instead of the rows when `data` is empty. The four-states contract
   *  (`04`) still belongs to the screen: it decides between loading, empty,
   *  error and offline and hands the right one down. */
  empty?: ReactElement | null;
  footer?: ReactElement | null;
  testID?: string;
}

export function ListScreen<T>({
  data,
  renderItem,
  keyExtractor,
  header = null,
  empty = null,
  footer = null,
  widthClass = 'full',
  padded = true,
  bottomInset = true,
  refreshing,
  onRefresh,
  testID,
}: ListScreenProps<T>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      testID={testID}
      data={data}
      renderItem={({ item }) => renderItem(item)}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        {
          paddingTop: insets.top + spacing.screenTop,
          paddingBottom: (bottomInset ? insets.bottom : 0) + spacing.x2l,
        },
        padded && { paddingHorizontal: spacing.gutter },
        widthClass !== 'full' && {
          width: '100%',
          maxWidth: WIDTH_MEASURES[widthClass],
          alignSelf: 'center',
        },
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.muted}
          />
        ) : undefined
      }
    />
  );
}

/**
 * The horizontal inset the CARDS sit at, inside a screen title's wider gutter
 * (the mockup's `.testi` / `.prayer` margin of 16 against the title's 20). A
 * `ScrollView` screen wrapped its rows in one padded `View`; a list has no such
 * wrapper, so the inset belongs to the row.
 */
export function ListRow({
  children,
}: {
  children: ReactElement | null;
}): ReactElement {
  return <View style={{ paddingHorizontal: spacing.lg }}>{children}</View>;
}
