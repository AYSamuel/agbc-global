import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, spacing } from '@agbc/shared/theme';

import { HomeTabIcon, NoteBanner } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * HOME · the quiet line while a request is open (docs/spec/16, decision 11).
 *
 * The mockup's `.linkbanner` in its gold variant, which now lives in the shared library as
 * `NoteBanner` (W2.5 needed the same shape in both tones, and a banner drawn twice is a
 * banner that drifts). What stayed here is what belongs to this line: the icon, the copy,
 * and Dismiss.
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
          <HomeTabIcon size={18} color={accent} strokeWidth={1.8} />
        )}
        lead={t('settings:branchChange.notePending', { branch: shortName })}
        body={t('settings:branchChange.noteBody', { branch: branchName })}
        trailing={
          // A coloured text action rather than a button: a full control in a line this
          // quiet is what made the old version loud. Still a 44px target through hitSlop,
          // because a smaller LOOK is not a smaller touch area.
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
        }
      />
    </View>
  );
}
