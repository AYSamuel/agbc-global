import type { ComponentType, ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  icon,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button, type ButtonVariant } from './Button';
import type { IconProps } from './icons';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Decorative icon slot; hidden from assistive tech. */
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * The frames draw most empty actions as `.btn.primary`, which is the default.
   * RHYTHM's draws `.btn.gold`: the one empty state that is an invitation to
   * something warm rather than a way out of a dead end (W2.8).
   */
  actionVariant?: ButtonVariant;
}

// 05: never a bare empty list; icon + copy + a primary action.
export function EmptyState({
  title,
  body,
  icon,
  actionLabel,
  onAction,
  actionVariant = 'primary',
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
          style={[typeScale.body, { color: colors.sub, textAlign: 'center' }]}
        >
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant={actionVariant}
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}

/**
 * The mockup's `.empty .ei`: a 66px alt circle around a 30px muted glyph, which is what
 * every drawn empty state puts above its title (MY-POSTS, BLOCKED-MEMBERS).
 *
 * Distinct from `features/shell/StubIcon`, which is the smaller `.authicon` circle the
 * not-built-yet placeholders use. Same idea, two sizes, and the frames pick per screen.
 */
export function EmptyGlyph({ Icon }: { Icon: ComponentType<IconProps> }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 66,
        height: 66,
        borderRadius: radius.full,
        backgroundColor: colors.alt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={icon.x3l} color={colors.muted} />
    </View>
  );
}
