import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import {
  ActionPill,
  AppHeader,
  BellIcon,
  Button,
  Card,
  Chip,
  EmptyState,
  Eyebrow,
  FamilyTabIcon,
  GateSheet,
  GiveTabIcon,
  HeartIcon,
  HomeTabIcon,
  MenuCard,
  MenuLabel,
  MenuRow,
  MoreTabIcon,
  SegmentedControl,
  Skeleton,
  TabBar,
  useToast,
  WatchTabIcon,
} from '@/components/ui';
import { ThemeScope, useTheme, type ThemeName } from '@/theme';

// DEV-ONLY gallery route (W0.8): every primitive in BOTH themes on one screen for
// screenshot checks per docs/spec/25. Never linked from product navigation; literal
// strings exempt from the i18n rule (this screen never ships to users).

function ScopePreview() {
  const [scope, setScope] = useState<'branch' | 'everywhere'>('everywhere');
  return (
    <SegmentedControl
      accessibilityLabel="Scope"
      segments={[
        { key: 'everywhere', label: 'Everywhere' },
        { key: 'branch', label: 'My branch' },
      ]}
      value={scope}
      onChange={setScope}
    />
  );
}

function PrimitiveSet({ theme }: { theme: ThemeName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        padding: spacing.gutter,
        gap: spacing.lg,
      }}
    >
      <Text style={[typeScale.section, { color: colors.text }]}>{theme}</Text>
      <Eyebrow label="Eyebrow label" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label="Primary" variant="primary" />
        <Button label="Accent" variant="accent" />
        <Button label="Outline" variant="outline" />
        <Button label="Ghost" variant="ghost" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip
          label="AGBC Berlin"
          selected
          accessibilityLabel="Current branch AGBC Berlin, change branch"
        />
        <Chip label="Glasgow" />
        <Chip label="Filter" />
      </View>
      {/* ActionPill tones (Family reactions): neutral, committed (gold), fulfilled
          (green). The Glory pill is the neutral tone with the star icon. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <ActionPill
          label="Glory to God · 14"
          icon={
            <Text style={{ fontSize: 12.5, color: colors.accent }}>{'✦'}</Text>
          }
        />
        <ActionPill
          label="I will pray"
          icon={<HeartIcon size={15} color={colors.sub} />}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <ActionPill
          label="I prayed"
          tone="goldSoft"
          icon={<HeartIcon size={15} color={colors.eye} />}
        />
        <ActionPill label="You prayed" tone="green" />
      </View>
      <ScopePreview />
      <Card>
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          Static card
        </Text>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          Surface + cardline border, radius 18.
        </Text>
      </Card>
      <Card
        size="hero"
        onPress={() => {
          // gallery: press feedback only
        }}
        accessibilityLabel="Pressable hero card"
      >
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          Pressable hero card
        </Text>
      </Card>
      <AppHeader
        title="App header"
        onBack={() => {
          // gallery: press feedback only
        }}
        trailing={<BellIcon color={colors.text} />}
      />
      <TabBar
        items={[
          {
            key: 'home',
            label: 'Home',
            renderIcon: (c, s) => <HomeTabIcon color={c} size={s} />,
          },
          {
            key: 'watch',
            label: 'Watch',
            renderIcon: (c, s) => <WatchTabIcon color={c} size={s} />,
          },
          {
            key: 'family',
            label: 'Family',
            badge: 3,
            renderIcon: (c, s) => <FamilyTabIcon color={c} size={s} />,
          },
          {
            key: 'give',
            label: 'Give',
            renderIcon: (c, s) => <GiveTabIcon color={c} size={s} />,
          },
          {
            key: 'more',
            label: 'More',
            renderIcon: (c, s) => <MoreTabIcon color={c} size={s} />,
          },
        ]}
        activeKey="home"
        onPress={() => {
          // gallery: press feedback only
        }}
      />
      <View>
        <MenuLabel label="Menu section" />
        <MenuCard>
          <MenuRow
            icon="📍"
            label="Chevron row"
            onPress={() => {
              // gallery: press feedback only
            }}
          />
          <MenuRow
            icon="🌐"
            label="Value row"
            value="English"
            onPress={() => {
              // gallery: press feedback only
            }}
          />
          <MenuRow
            icon="📚"
            label="Locked row"
            badge="Sign in"
            onPress={() => {
              // gallery: press feedback only
            }}
          />
          <MenuRow
            icon="🗑️"
            label="Danger row"
            danger
            onPress={() => {
              // gallery: press feedback only
            }}
          />
        </MenuCard>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Skeleton width="60%" height={20} />
        <Skeleton />
        <Skeleton width={120} height={120} round />
      </View>
      <EmptyState
        title="No testimonies yet"
        body="Be the first to share what God has done."
        actionLabel="Share a testimony"
        onAction={() => {
          // gallery: press feedback only
        }}
      />
    </View>
  );
}

function InteractiveExtras() {
  const [gateOpen, setGateOpen] = useState(false);
  const toast = useToast();
  return (
    <View style={{ padding: spacing.gutter, gap: spacing.md }}>
      <Button
        label="Show toast"
        variant="outline"
        onPress={() => {
          toast.show('Bank details copied');
        }}
      />
      <Button
        label="Open gate sheet"
        variant="outline"
        onPress={() => {
          setGateOpen(true);
        }}
      />
      <GateSheet
        visible={gateOpen}
        title="Sign in to say Glory to God"
        body="Join the family to react, share testimonies, RSVP, and track your rhythm."
        signInLabel="Sign in"
        dismissLabel="Not now"
        dismissAnnouncement="Sign in sheet dismissed"
        onSignIn={() => {
          setGateOpen(false);
        }}
        onDismiss={() => {
          setGateOpen(false);
        }}
      />
    </View>
  );
}

export default function Gallery() {
  return (
    <ScrollView>
      <ThemeScope name="light">
        <PrimitiveSet theme="light" />
      </ThemeScope>
      <ThemeScope name="dark">
        <PrimitiveSet theme="dark" />
      </ThemeScope>
      <InteractiveExtras />
    </ScrollView>
  );
}
