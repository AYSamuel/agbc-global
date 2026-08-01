import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { fontFamily, palette } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { CheckIcon } from './icons';
import { Screen } from './Screen';

export interface SuccessScreenProps {
  title: string;
  /** Plain body; pass `bodyNode` instead when part of it carries weight. */
  body?: string;
  bodyNode?: ReactNode;
  actionLabel: string;
  onAction: () => void;
}

/**
 * The mockup's `.success`: a gold check disc with its soft ring, a display title, one
 * sentence, and a single gold action.
 *
 * Extracted from AUTH-4's SuccessStep when the branch-change flow needed the same screen
 * for arriving at a new branch. The mockup calls that frame "arrival is a welcome, not a
 * receipt", and it is the same element AUTH-4 uses for exactly the same reason, so it
 * should not be drawn twice with two sets of pixel values.
 *
 * What did NOT move: AUTH-4's auto-continue timer and its gate-aware copy. Those belong to
 * that step, not to the shape.
 */
export function SuccessScreen({
  title,
  body,
  bodyNode,
  actionLabel,
  onAction,
}: SuccessScreenProps) {
  const { colors } = useTheme();

  return (
    <Screen widthClass="capped" padded={false} scroll={false}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 34,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: palette.gold,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          {/* The mockup's 10px soft gold ring, as a view (no RN boxShadow). */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -10,
              left: -10,
              right: -10,
              bottom: -10,
              borderWidth: 10,
              borderColor: 'rgba(255,207,74,0.15)',
              borderRadius: 54,
            }}
          />
          <CheckIcon size={42} color={palette.navy} strokeWidth={2.6} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 14.5,
            lineHeight: 22,
            color: colors.sub,
            textAlign: 'center',
            marginBottom: 22,
          }}
        >
          {bodyNode ?? body}
        </Text>
        <View style={{ width: '100%', maxWidth: 220 }}>
          <Button
            label={actionLabel}
            variant="accent"
            fullWidth
            onPress={onAction}
          />
        </View>
      </View>
    </Screen>
  );
}
