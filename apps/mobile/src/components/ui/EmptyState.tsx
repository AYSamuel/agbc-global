import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Decorative icon slot; hidden from assistive tech. */
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

// 05: never a bare empty list; icon + copy + a primary action.
export function EmptyState({
  title,
  body,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.x4l,
        paddingHorizontal: spacing.gutter,
      }}
    >
      {icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </View>
      ) : null}
      <Text
        style={[
          typeScale.cardTitle,
          { color: colors.text, textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}
        >
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="primary" onPress={onAction} />
      ) : null}
    </View>
  );
}
