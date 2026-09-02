import { usePathname, useRouter, useSegments } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  FamilyTabIcon,
  GiveTabIcon,
  HomeTabIcon,
  MoreTabIcon,
  NavRail,
  TwoPane,
  WatchTabIcon,
  type IconProps,
  type TabItem,
} from '@/components/ui';
import { FamilyListPane } from '@/features/family/FamilyListPane';
import { WatchListPane } from '@/features/watch/WatchListPane';
import { useLayout } from '@/lib/layout';
import { useTheme } from '@/theme';

/**
 * The tablet shell: a nav rail beside EVERYTHING, not just the tab roots.
 *
 * WHY IT LIVES HERE AND NOT IN `(tabs)/_layout`. The rail started life in the
 * tab navigator's own bar slot, which is the obvious place and the wrong one. A
 * bar slot belongs to the five tab ROOTS, so opening ACADEMY or a sermon left a
 * 1400dp tablet showing a phone-shaped column with no navigation at all. Found
 * on the real device (W4.7 slice 4); every tablet frame in the mockup draws the
 * rail, and `ACADEMY · tablet portrait` is a pushed route. So the rail is a
 * sibling of the whole `Stack` instead, and the tab navigator simply draws no
 * bar when the shell is present.
 *
 * On a phone this renders its children untouched and nothing else changes.
 */
const TAB_CONFIG = [
  { name: 'home', Icon: HomeTabIcon },
  { name: 'watch', Icon: WatchTabIcon },
  { name: 'family', Icon: FamilyTabIcon },
  { name: 'give', Icon: GiveTabIcon },
  { name: 'more', Icon: MoreTabIcon },
] as const;

type TabName = (typeof TAB_CONFIG)[number]['name'];

/**
 * Which root a pushed screen belongs to, so the rail keeps saying where you are
 * rather than going blank the moment you open something.
 *
 * This is `04`'s navigation graph written down: the mockup's own ACADEMY tablet
 * frame highlights **More**, because More is the hub Academy hangs off. Any
 * route absent from this map is deliberate rather than forgotten, and falls
 * through to `more`, which is where the hub rows live.
 */
const ROUTE_OWNER: Record<string, TabName> = {
  sermon: 'watch',
  'watch-search': 'watch',
  'my-list': 'watch',
  testimony: 'family',
  prayer: 'family',
  'my-posts': 'family',
  give: 'give',
};

/**
 * Routes that are NOT inside the shell at all: the app has no navigation to
 * offer until somebody is past them. Splash resolves the session, onboarding is
 * a linear flow with its own "I'm just looking" exit, and auth is a gate that
 * returns you where you came from (`03`, `06`).
 */
const SHELL_FREE = new Set([
  'index',
  'onboarding',
  'auth',
  '_sitemap',
  '+not-found',
]);

export function TabletShell({ children }: PropsWithChildren) {
  const { isTablet, isLandscape } = useLayout();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // A length check rather than `?? 'index'`: expo-router types `segments[0]` as
  // a plain string, so the nullish fallback reads as dead to the linter, while
  // at runtime the array really is empty on the very first render (splash).
  const first = segments.length > 0 ? segments[0] : 'index';
  const inTabs = first === '(tabs)';
  // Matched against the real roots rather than cast to one: `segments` is just
  // strings, and a cast would quietly accept a name that is not a tab.
  const activeKey: TabName = inTabs
    ? (TAB_CONFIG.find((tab) => tab.name === segments[1])?.name ?? 'home')
    : (ROUTE_OWNER[first] ?? 'more');

  // `segments` is empty on the very first render, which is the splash route.
  const showRail = isTablet && !SHELL_FREE.has(first);

  if (!showRail) return <>{children}</>;

  /**
   * A DETAIL ROUTE GETS ITS LIST BACK (mockup `WATCH · tablet landscape · rail +
   * two-pane`). On a phone the sermon covers the list; on a tablet there is room
   * for both, so the same route draws beside the list instead of over it.
   *
   * Landscape only: the frames draw two panes at 1080 wide, and 396 of list plus
   * a sermon does not fit an 876dp portrait tablet.
   *
   * The id comes from the PATH rather than from state, which is the whole point
   * of doing this route-first: a notification deep link into a sermon lights the
   * right row for free.
   */
  /**
   * The id a `/<family>/<id>` route is showing, or null.
   *
   * `compose` is excluded by name because it is a SIBLING of the ids, not one of
   * them: `/testimony/compose` and `/prayer/compose` are full-screen flows with
   * their own consent step, and matching them here would have opened the
   * composer in a detail pane beside the feed.
   */
  const detailId = (family: string): string | null => {
    if (first !== family) return null;
    const id = new RegExp(`^/${family}/([^/]+)`).exec(pathname)?.[1] ?? null;
    return id === 'compose' ? null : id;
  };
  const sermonId = detailId('sermon');
  // Both Family detail routes sit beside the same feed: the pane already knows
  // which sub-tab is showing, so a prayer and a testimony need no separate case.
  const familyId = detailId('testimony') ?? detailId('prayer');
  const paneFor =
    sermonId !== null ? (
      <WatchListPane selectedId={sermonId} />
    ) : familyId !== null ? (
      <FamilyListPane selectedId={familyId} />
    ) : null;
  const twoPane = isLandscape && paneFor !== null;

  const items: TabItem<TabName>[] = TAB_CONFIG.map((tab) => ({
    key: tab.name,
    label: t(`tabs.${tab.name}`),
    renderIcon: (color: IconProps['color'], size: number) => (
      <tab.Icon color={color} size={size} />
    ),
  }));

  return (
    /**
     * THE TABLET STARTS BELOW THE STATUS BAR (Ayo, 2026-09-02).
     *
     * Android draws edge-to-edge, so the app's own surfaces ran up behind the
     * system bar: content was never overlapped (the rail's first item measured
     * at exactly `insets.top` + its own padding), but the RAIL's card colour
     * reached y=0, which put a seam of app chrome behind the clock. On a phone
     * that is the intended look; on a tablet the rail and the panes are the
     * app's frame, and a frame should begin where the app does.
     *
     * The inset is consumed ONCE here and then ZEROED for everything below, by
     * overriding the insets context. Without that, `Screen` and the panes would
     * each add `insets.top` again and push their content a status bar further
     * down. One owner for one measurement.
     */
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: colors.bg,
      }}
    >
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <NavRail
            items={items}
            activeKey={activeKey}
            onPress={(key) => {
              // `navigate` rather than `push`: tapping a root you are already deep
              // inside should return to it, not stack a second copy.
              router.navigate(`/(tabs)/${key}`);
            }}
            accessibilityLabel={t('tabs.railLabel')}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            {twoPane ? <TwoPane list={paneFor} detail={children} /> : children}
          </View>
        </View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
