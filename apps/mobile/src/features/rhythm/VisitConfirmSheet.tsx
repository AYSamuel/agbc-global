import { useTranslation } from 'react-i18next';

import { icon, palette } from '@agbc/shared/theme';

import { ActionSheet, PinIcon } from '@/components/ui';

// The visiting confirm (mockup "HOME · visiting · the confirm", composed
// 2026-09-06). Why the tap asks at all is in `visiting.ts`; this is only
// what the question looks like, in one place because two screens ask it.
//
// The pin is the note's own glyph, deliberately: the sentence under the buttons
// and the sheet over them are about the same thing, which is WHERE the member is
// standing.

export interface VisitConfirmSheetProps {
  visible: boolean;
  /** The branch the check-in would go to: the browsed one, or the one on screen. */
  branchName: string;
  onConfirm: () => void;
  onDismiss: () => void;
  /**
   * The refusal that DOES something: it hands the member their own branch back
   * rather than only closing, because "no" otherwise leaves them browsing
   * somebody else's front page with their own service behind the chip (`04`
   * forbids dead ends). Absent only when their home branch cannot be named, and
   * then the refusal is a plain one: a question with only a "yes" is not a
   * question.
   */
  elsewhere?: { label: string; onPress: () => void };
}

export function VisitConfirmSheet({
  visible,
  branchName,
  onConfirm,
  onDismiss,
  elsewhere,
}: VisitConfirmSheetProps) {
  const { t } = useTranslation();

  return (
    <ActionSheet
      visible={visible}
      icon={<PinIcon size={icon.x2l} color={palette.navy} />}
      title={t('rhythm:visitConfirmTitle', { branch: branchName })}
      body={t('rhythm:visitConfirmBody', { branch: branchName })}
      primaryLabel={t('rhythm:visitConfirmYes')}
      onPrimary={onConfirm}
      secondaryLabel={elsewhere?.label ?? t('rhythm:visitConfirmNo')}
      onSecondary={elsewhere?.onPress}
      dismissAnnouncement={t('rhythm:visitConfirmDismissed')}
      onDismiss={onDismiss}
    />
  );
}
