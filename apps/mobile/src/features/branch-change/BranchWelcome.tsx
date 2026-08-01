import { useTranslation } from 'react-i18next';
import { Modal, Text } from 'react-native';

import { fontFamily } from '@agbc/shared/theme';

import { SuccessScreen } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * BRANCH-CHANGE · approved (docs/spec/16, ADR 0015): "arrival is a welcome, not a receipt".
 *
 * A full screen rather than a toast or a banner, and that is the frame's point. The move
 * has already happened by the time this shows: the member's branch, reminders, events and
 * feeds all belong somewhere new, and being told that in a strip at the top of Home would
 * treat a change of belonging as a notification.
 *
 * IN A MODAL, which is what makes it actually full-screen. Home lives inside the tab
 * navigator, so a welcome returned as Home's own content leaves the tab bar sitting under
 * it: the frame draws no tab bar, and more than a look is at stake. A `Modal` owns its
 * native window, so the welcome becomes the whole accessibility tree, where otherwise a
 * screen-reader user swipes past it into the tab bar and lands on Watch mid-sentence. It
 * also closes the gap where tapping another tab walked around the welcome without
 * acknowledging it, so a once-only moment came back on the next visit to Home.
 *
 * Opaque and fading, unlike this app's other three Modals: they are sheets that slide up
 * over a screen you are still in, and this one replaces the screen.
 *
 * Shown once, then acknowledged. What "once" means, and why it lives on the device, is
 * written down in `seen.ts`.
 */
export function BranchWelcome({
  visible,
  branchName,
  shortName,
  onContinue,
}: {
  visible: boolean;
  branchName: string;
  /** The branch without its org prefix: "Berlin", for the title. */
  shortName: string;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      // Android's hardware back acknowledges, exactly as Continue does. A takeover with no
      // back handler is a trap, which is the shape of the switch-sheet bug fixed alongside
      // this: they have seen the welcome either way.
      onRequestClose={onContinue}
    >
      <SuccessScreen
        title={t('settings:branchChange.welcomeTitle', { branch: shortName })}
        bodyNode={
          <Text>
            {t('settings:branchChange.welcomeBodyBefore')}
            {/* The frame's `<b style="color:var(--text)">`: the branch name carries both the
              weight and the full text colour, against a body set in `--sub`. */}
            <Text
              style={{ fontFamily: fontFamily.body.bold, color: colors.text }}
            >
              {branchName}
            </Text>
            {t('settings:branchChange.welcomeBodyAfter')}
          </Text>
        }
        actionLabel={t('settings:branchChange.welcomeContinue')}
        onAction={onContinue}
      />
    </Modal>
  );
}

/**
 * "AGBC Lighthouse Berlin" -> "Berlin", for the title line only.
 *
 * The frame says "Welcome to Berlin", not "Welcome to AGBC Lighthouse Berlin", because a
 * welcome uses the name people actually say. The full name is still in the sentence
 * underneath, so nothing is ambiguous.
 */
export function shortBranchName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // `words` is empty only for an empty name, which is what the fallback covers; indexing
  // it would otherwise read as always-defined here.
  return words.length > 0 ? words[words.length - 1] : name;
}
