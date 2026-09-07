import { useTranslation } from 'react-i18next';

import { shortBranchName } from '@/features/branch-change/BranchWelcome';
import { resolveBranchList } from '@/features/onboarding/branchList';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';

import { queueCheckIn } from './useImHere';
import { useVisitConfirmStore } from './visiting';
import { VisitConfirmSheet } from './VisitConfirmSheet';

/**
 * The visiting question, answered (mockup "HOME · visiting · the confirm").
 * Why it is asked at all is in `visiting.ts`.
 *
 * Mounted at the ROOT, beside the celebration and the notification ask, and for
 * the same reason: it arrives over whichever screen the member is on. Two of the
 * three taps that raise it come from screens (Home, BRANCH-INFO), but the third
 * is the gate-return replay, which fires after AUTH-4 has moved them, and by
 * then the browsing chip may have become the branch they just chose as home.
 * Keyed to a screen, the question would simply never be asked there, and the tap
 * would vanish.
 *
 * No ordering against the other two overlays is needed, because this one comes
 * BEFORE a check-in exists: the celebration and the reminder ask are both raised
 * by the write this sheet is standing in front of.
 *
 * THIS COMPONENT OWNS THE WRITE for the visiting path. Nothing is recorded until
 * "Yes", which is the whole point of the sheet.
 */
export function VisitConfirm() {
  const { t } = useTranslation();
  const pending = useVisitConfirmStore((state) => state.pending);
  const clear = useVisitConfirmStore((state) => state.clear);
  const homeBranchId = useAuthStore((state) => state.profile?.branchId ?? null);
  const setBranch = useBranchStore((state) => state.setBranch);
  // Cached and prefetched at launch, with a bundled snapshot behind it, so this
  // costs a lookup rather than a fetch. Only the REFUSAL needs it: the branch
  // being asked about names itself, from the tap that raised the question.
  const branchesQuery = useBranchesQuery();
  const { branches } = resolveBranchList(branchesQuery);
  const homeBranch = branches.find((one) => one.id === homeBranchId);

  return (
    <VisitConfirmSheet
      visible={pending !== null}
      branchName={pending?.branchName ?? ''}
      onConfirm={() => {
        if (pending) queueCheckIn(pending.branchId);
        clear();
      }}
      onDismiss={clear}
      elsewhere={
        homeBranch
          ? {
              // "No, I'm at Berlin" has to have somewhere to put them, and that
              // somewhere is the chip: their own branch is the one thing they
              // are not being shown while this sheet is up. Same list the
              // switcher sets from, so this and a manual switch land in exactly
              // the same state. It writes nothing: the check-in at their own
              // branch is still their own tap.
              label: t('rhythm:visitConfirmElsewhere', {
                branch: shortBranchName(homeBranch.name),
              }),
              onPress: () => {
                setBranch({
                  id: homeBranch.id,
                  slug: homeBranch.slug,
                  name: homeBranch.name,
                  timezone: homeBranch.timezone,
                });
                clear();
              },
            }
          : undefined
      }
    />
  );
}
