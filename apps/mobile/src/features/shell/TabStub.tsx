import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import { EmptyState, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

// Placeholder tab root until the tab's work item lands (Watch W1.3, Family W1.5,
// Give W1.6). A real screen per docs/spec/04's no-dead-ends rule: mockup .stitle
// title + a friendly empty state; the tab bar itself is the way onward.
export interface TabStubProps {
  title: string;
  body: string;
  icon?: ReactNode;
}

export function TabStub({ title, body, icon }: TabStubProps) {
  const { colors } = useTheme();

  return (
    <Screen widthClass="capped">
      <Text
        accessibilityRole="header"
        style={{
          // Mockup .stitle h1: display 800 at 26.
          fontFamily: fontFamily.display.extraBold,
          fontSize: 26,
          letterSpacing: -0.52,
          color: colors.text,
          marginTop: spacing.md,
        }}
      >
        {title}
      </Text>
      <View style={{ marginTop: spacing.x4l }}>
        <EmptyState title={body} icon={icon} />
      </View>
    </Screen>
  );
}
