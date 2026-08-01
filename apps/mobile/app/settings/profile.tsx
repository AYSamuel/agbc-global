import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  ActionPill,
  AppHeader,
  Button,
  MenuCard,
  MenuLabel,
  MenuRow,
  Screen,
  Skeleton,
} from '@/components/ui';
import { AwaitingPanel } from '@/features/branch-change/AwaitingPanel';
import { useMyBranchRequests } from '@/features/branch-change/queries';
import { useCancelRequest } from '@/features/branch-change/useAskToJoin';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useMyProfile } from '@/features/profile/queries';
import { ProfileHead } from '@/features/profile/ProfileHead';
import { useToast } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * PROFILE (docs/spec/16, ADR 0015): who you are, and the one branch fact you can change.
 *
 * Two states, both drawn in the W2.7 frames. SETTLED shows the home branch as a row that
 * opens the picker. AWAITING replaces the chevron with a pill, adds the `.rhythm` panel
 * naming the branch that is deciding, and offers Cancel. The awaiting state stays ON the
 * screen rather than becoming a sheet, because it is something a member lives with for 48
 * hours and a modal you dismiss repeatedly is a nuisance.
 *
 * THE HOME BRANCH DOES NOT CHANGE WHILE A REQUEST IS OPEN, and the screen says so. Until a
 * leader approves it, reminders, events and "My branch" feeds all still belong to the
 * current branch; the row keeps showing it, and only the panel below mentions the other
 * one. That is the truth of the data model (`profiles.branch_id` is untouched until
 * `decide_branch_request` runs), so the screen cannot imply otherwise.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  const profile = useMyProfile();
  const requests = useMyBranchRequests();
  const branchNames = useBranchNames();
  const cancel = useCancelRequest();

  const pending = requests.data?.pending ?? null;
  const homeBranchName = profile.data
    ? (branchNames[profile.data.branchId] ?? '')
    : '';
  const askedBranchName = pending
    ? (branchNames[pending.toBranchId] ?? '')
    : '';

  const memberSince = profile.data
    ? new Date(profile.data.joinedAt).getFullYear().toString()
    : '';

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('settings:profile.title')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />

      {profile.isPending ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Skeleton width={76} height={76} round />
          <View style={{ height: spacing.md }} />
          <Skeleton width={160} height={22} />
          <View style={{ height: spacing.sm }} />
          <Skeleton width={220} height={14} />
        </View>
      ) : profile.data ? (
        <ProfileHead
          name={profile.data.displayName}
          line={t('settings:profile.since', {
            branch: homeBranchName,
            year: memberSince,
          })}
        />
      ) : (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 14,
              color: colors.sub,
              textAlign: 'center',
            }}
          >
            {t('settings:profile.errorLoad')}
          </Text>
        </View>
      )}

      <View style={{ paddingHorizontal: spacing.lg }}>
        <MenuLabel label={t('settings:profile.branchSection')} />
        <MenuCard>
          <MenuRow
            icon="🏠"
            label={t('settings:profile.homeBranch')}
            value={homeBranchName}
            // While a request is open the row stops being a way in: asking again is
            // refused by the one-open-request index, so offering the picker would be
            // offering a dead end. The pill says why.
            trailing={
              pending ? (
                <ActionPill
                  label={t('settings:profile.awaitingPill')}
                  tone="goldSoft"
                />
              ) : undefined
            }
            onPress={() => {
              // While a request is open this row is a statement, not a way in. Asking
              // again is refused by the one-open-request index, so opening the picker
              // would offer a dead end; the pill and the panel below say why.
              if (!pending) router.push('/settings/branch');
            }}
          />
        </MenuCard>
      </View>

      {pending ? (
        <>
          <AwaitingPanel
            label={t('settings:profile.askedToJoin')}
            branchName={askedBranchName}
            note={t('settings:profile.usuallyWithin')}
            ringLabel={t('settings:profile.ring48h')}
          />
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              lineHeight: 18,
              color: colors.muted,
              marginTop: spacing.md,
              marginHorizontal: spacing.lg,
            }}
          >
            {t('settings:profile.staysUntilConfirmed', {
              branch: homeBranchName,
            })}
          </Text>
          <View style={{ padding: spacing.lg }}>
            <Button
              label={t('settings:profile.cancelRequest')}
              variant="outline"
              fullWidth
              disabled={cancel.isPending}
              onPress={() => {
                cancel.mutate(pending.id, {
                  onSuccess: () => {
                    toast.show(t('settings:profile.cancelled'));
                  },
                  onError: () => {
                    toast.show(t('settings:profile.cancelFailed'));
                  },
                });
              }}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
