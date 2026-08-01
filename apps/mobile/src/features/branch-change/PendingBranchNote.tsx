import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { HomeTabIcon } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * HOME · the quiet line while a request is open (docs/spec/16, decision 11).
 *
 * The mockup's `.linkbanner` in its gold variant: an icon, one sentence, and a coloured
 * Dismiss on the same line. It replaced a taller `.notecard` treatment after that read on
 * device as a card demanding attention rather than as a line you can ignore (Ayo,
 * 2026-08-01). A member waits up to 48 hours for this answer, so the shape has to be
 * something they can live alongside.
 *
 * THEME-RESPONSIVE THROUGHOUT. The wash and border are the shared `tonal.goldSoft` pair,
 * which is translucent and therefore correct on both the cream and the ink surface, and
 * the icon, the emphasis and Dismiss all take `colors.eye`: deep gold on light, where
 * bright gold fails contrast, and bright gold on dark (`05`).
 *
 * It says where the request IS, not what will happen. Nothing here promises an outcome,
 * and the branch that is deciding is named because that is the honest thing to name: no
 * person, ever (decision 3).
 */
export function PendingBranchNote({
  shortName,
  branchName,
  onDismiss,
}: {
  /** "Berlin", for the emphasised opening. */
  shortName: string;
  branchName: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // The space that separates the bold lead from the rest of the sentence. Built here
  // rather than inline, because two nested <Text> runs have no margin between them and a
  // literal in JSX is banned; keeping it out of the translation avoids a leading space
  // that a translator would reasonably delete.
  const rest = ` ${t('settings:branchChange.noteBody', { branch: branchName })}`;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md - 2,
        backgroundColor: tonal.goldSoft.bg,
        borderWidth: 1,
        borderColor: tonal.goldSoft.border,
        borderRadius: radius.button,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg - 2,
        marginHorizontal: spacing.lg,
        marginTop: spacing.sm,
        marginBottom: spacing.md,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ marginTop: 1 }}
      >
        <HomeTabIcon size={18} color={colors.eye} strokeWidth={1.8} />
      </View>

      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            color: colors.eye,
          }}
        >
          {t('settings:branchChange.notePending', { branch: shortName })}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            color: colors.text,
          }}
        >
          {rest}
        </Text>
      </Text>

      {/* A coloured text action rather than a button: a full control in a line this quiet
          is what made the old version loud. Still a 44px target through hitSlop, because
          a smaller LOOK is not a smaller touch area. */}
      <Pressable
        accessibilityRole="button"
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={({ pressed }) => ({
          alignSelf: 'center',
          minHeight: hitTarget.min - 22,
          justifyContent: 'center',
          paddingLeft: spacing.md,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 13,
            color: colors.eye,
          }}
        >
          {t('settings:branchChange.noteDismiss')}
        </Text>
      </Pressable>
    </View>
  );
}
