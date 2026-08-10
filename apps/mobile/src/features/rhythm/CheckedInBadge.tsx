import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  icon,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { CheckIcon } from '@/components/ui';
import { useTheme } from '@/theme';

// "I'm here", once the tap has landed (mockup W2.8 `.hero .btns .btn.gold.on`).
//
// The action quietens rather than disappearing: the same tinted-gold treatment
// `.glory.on` and `.glorybig.on` use for a reaction the member has already made,
// so "done" reads the same way wherever the app says it. It keeps the gold
// button's slot and metrics so the pair beside it stays even at any text scale.
//
// Deliberately NOT a Button. There is nothing left to press, and a control that
// answers a tap with nothing is a dead button (project convention: hide, never
// disable). It is a status, and it reads as one to assistive tech.
export interface CheckedInBadgeProps {
  /**
   * Which surface it sits on. The gold tint and the gold hairline hold on both;
   * only the label's colour changes, because white on a light card is the one
   * thing that would not survive the move (BRANCH-INFO puts the same state on a
   * card, Home's hero puts it on ink).
   */
  surface?: 'ink' | 'card';
}

export function CheckedInBadge({ surface = 'ink' }: CheckedInBadgeProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t('rhythm:checkedInLabel')}
      style={{
        flex: 1,
        minHeight: hitTarget.preferred,
        paddingHorizontal: spacing.x2l,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: palette.gold,
        backgroundColor: 'rgba(255,207,74,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
      }}
    >
      <CheckIcon
        size={icon.lg}
        color={surface === 'ink' ? palette.gold : colors.eye}
      />
      <Text
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 15.5,
          color: surface === 'ink' ? onInk.text : colors.text,
          textAlign: 'center',
        }}
      >
        {t('rhythm:checkedIn')}
      </Text>
    </View>
  );
}
