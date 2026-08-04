import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  BlockedIcon,
  EmptyGlyph,
  EmptyState,
  Screen,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useBlockedMembers,
  useUnblockMember,
  type BlockedMember,
} from '@/features/family/moderation';
import { useTheme } from '@/theme';

/**
 * BLOCKED-MEMBERS (frames `Settings > Blocked members` and `nobody blocked`; docs/spec/16).
 *
 * A list and one action each, because that is the whole of it. The line under the title
 * repeats what blocking does: somebody arriving here weeks later is deciding whether to
 * undo it and cannot be expected to remember. No count of what they are missing and no
 * date, per the frame's note: both invite second-guessing a decision already made.
 */
export default function BlockedMembers() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  const query = useBlockedMembers();
  const unblock = useUnblockMember();

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('settings:blocked.title')}
        backLabel={t('back')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/settings');
        }}
      />

      {query.isPending ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      ) : query.isError ? (
        <EmptyState
          title={t('errors:somethingWrong')}
          body={t('errors:couldntLoad')}
          actionLabel={t('errors:tryAgain')}
          onAction={() => {
            void query.refetch();
          }}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<EmptyGlyph Icon={BlockedIcon} />}
          title={t('settings:blocked.emptyTitle')}
          body={t('settings:blocked.emptyBody')}
        />
      ) : (
        <>
          {/* The frame's `.subhead`, above the rows. */}
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 13.5,
              lineHeight: 20,
              color: colors.sub,
              paddingHorizontal: spacing.gutter,
              paddingBottom: spacing.xs,
              // `.subhead`'s -4: it tucks under the header rather than sitting a full
              // row below it.
              marginTop: -spacing.xs,
            }}
          >
            {t('settings:blocked.subhead')}
          </Text>
          <View style={{ height: 10 }} />
          {query.data.map((member) => (
            <BlockedRow
              key={member.id}
              member={member}
              busy={unblock.isPending}
              onUnblock={() => {
                unblock.mutate(member.id, {
                  onSuccess: () => {
                    toast.show(
                      t('settings:blocked.unblocked', {
                        name: member.displayName,
                      }),
                    );
                  },
                  onError: () => {
                    toast.show(t('settings:blocked.unblockFailed'));
                  },
                });
              }}
            />
          ))}
          <View style={{ height: spacing.lg }} />
        </>
      )}
    </Screen>
  );
}

/** The frame's `.copyrow`: the name, and the one thing to do about it. */
function BlockedRow({
  member,
  busy,
  onUnblock,
}: {
  member: BlockedMember;
  busy: boolean;
  onUnblock: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.button,
        paddingVertical: 13,
        paddingLeft: spacing.lg,
        // The row's own right padding is 4 because the Unblock control carries 12 of
        // its own; together they are the frame's 16, and the touch target reaches the
        // card edge instead of stopping short of it.
        paddingRight: spacing.xs,
        marginHorizontal: spacing.lg,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: fontFamily.display.extraBold,
          fontSize: 16,
          letterSpacing: -0.16,
          color: colors.text,
        }}
      >
        {member.displayName}
      </Text>
      <Pressable
        accessibilityRole="button"
        // The row's own name is not enough for a reader arriving on the control: three
        // Unblock buttons in a column need to say which member each one is about.
        accessibilityLabel={t('settings:blocked.unblockNamed', {
          name: member.displayName,
        })}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onUnblock}
        style={({ pressed }) => ({
          minHeight: hitTarget.min,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          opacity: busy ? 0.5 : pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12.5,
            color: colors.blue,
          }}
        >
          {t('settings:blocked.unblock')}
        </Text>
      </Pressable>
    </View>
  );
}
