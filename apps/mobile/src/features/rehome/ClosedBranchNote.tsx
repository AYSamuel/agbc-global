import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, icon, spacing } from '@agbc/shared/theme';

import { HomeTabIcon, NoteBanner } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * HOME · the card that stays, when a member's branch has closed (frame approved 2026-08-21).
 *
 * The same `NoteBanner` in the same gold tone as the open-request line beside it, with ONE
 * difference that carries the whole decision: there is no Dismiss. The launch prompt can be
 * put off, and once it has been, nothing else in the app is going to ask. A dismissible card
 * would leave a member with no branch, no branch news and no way back except a Settings row
 * they have no reason to open.
 *
 * The trailing action is "Choose" rather than a dismissal, in the same quiet coloured-text
 * treatment: a full button in a line this quiet is what made the first version of the
 * request note loud (W2.7).
 */
export function ClosedBranchNote({
  branchName,
  onChoose,
}: {
  branchName: string;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.sm,
        marginBottom: spacing.md,
      }}
    >
      <NoteBanner
        tone="gold"
        icon={(accent) => (
          <HomeTabIcon size={icon.lg} color={accent} strokeWidth={1.8} />
        )}
        lead={t('settings:rehome.noteLead', { branch: branchName })}
        body={t('settings:rehome.noteBody')}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings:rehome.noteActionLabel')}
            onPress={onChoose}
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
              {t('settings:rehome.noteAction')}
            </Text>
          </Pressable>
        }
      />
    </View>
  );
}
