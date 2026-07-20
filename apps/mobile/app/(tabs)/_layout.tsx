import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  FamilyTabIcon,
  GiveTabIcon,
  HomeTabIcon,
  MoreTabIcon,
  TabBar,
  WatchTabIcon,
  type IconProps,
} from '@/components/ui';

// The five roots per docs/spec/04: Home · Watch · Family · Give · More. Icons and
// order match the mockup .tabbar exactly.
const TAB_CONFIG = [
  { name: 'home', Icon: HomeTabIcon },
  { name: 'watch', Icon: WatchTabIcon },
  { name: 'family', Icon: FamilyTabIcon },
  { name: 'give', Icon: GiveTabIcon },
  { name: 'more', Icon: MoreTabIcon },
] as const;

type TabName = (typeof TAB_CONFIG)[number]['name'];

// Minimal structural slice of react-navigation's tab-bar props. Typed locally
// because this repo never imports @react-navigation/* (docs/spec/01: Expo Router
// only); the real props satisfy this shape.
interface TabBarSlice {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

function AppTabBar({ state, navigation }: TabBarSlice) {
  const { t } = useTranslation();

  const items = state.routes.map((route) => {
    const config = TAB_CONFIG.find((tab) => tab.name === route.name);
    const Icon = config?.Icon;
    return {
      key: route.name as TabName,
      label: t(`tabs.${route.name}`),
      renderIcon: Icon
        ? (color: IconProps['color'], size: number) => (
            <Icon color={color} size={size} />
          )
        : undefined,
    };
  });

  const activeKey = state.routes[state.index].name as TabName;

  const onPress = (key: TabName) => {
    const route = state.routes.find((r) => r.name === key);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (key !== activeKey && !event.defaultPrevented) {
      navigation.navigate(key);
    }
  };

  return <TabBar items={items} activeKey={activeKey} onPress={onPress} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      // 04 global rule: Android hardware back on a non-Home tab root returns to
      // Home; back on Home exits.
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
