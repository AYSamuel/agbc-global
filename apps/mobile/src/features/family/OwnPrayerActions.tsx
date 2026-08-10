import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, icon, spacing } from '@agbc/shared/theme';

import {
  Button,
  ClockIcon,
  NoteBanner,
  Sheet,
  SheetBody,
  SheetRow,
  SheetTitle,
  useSheetDismiss,
  useToast,
} from '@/components/ui';
import { useTheme } from '@/theme';

import { answeredUndoBlocked, useMarkAnswered } from './markAnswered';
import type { PrayerFeedItem } from './queries';

/**
 * The action region on YOUR OWN prayer request (frames `PRAYER-DETAIL · own request`,
 * `· answered, testimony not written yet`, `· answered, testimony awaiting review`, and
 * the two `NOT-ANSWERED` confirms).
 *
 * The author does not see "I will pray" on their own request: the frame does not draw it,
 * and the two-step exists so the family can carry somebody, not so somebody can carry
 * themselves. Edit and Delete are not here either; they live in the header's `...` menu
 * where W2.6 put every post action.
 *
 * WHAT IT OFFERS IS DECIDED BY THE ROW, and by one column in particular. `answer_testimony_id`
 * only reports an APPROVED testimony, because it drives the public reverse link;
 * `my_answer_testimony_status` reports one in any state, because that is what the database
 * checks before allowing the undo (migration 20260804120000). Reading the first for this
 * decision would re-offer "Write a testimony" for a request that already has one and hand
 * the author a unique-constraint violation for their trouble.
 */
export interface OwnPrayerActionsProps {
  prayer: PrayerFeedItem;
  onShare: () => void;
  /** Marked answered: the parent shows MARK-ANSWERED, the loop's celebration. */
  onMarkedAnswered: () => void;
  onWriteTestimony: () => void;
  onGoToMyPosts: () => void;
}

export function OwnPrayerActions({
  prayer,
  onShare,
  onMarkedAnswered,
  onWriteTestimony,
  onGoToMyPosts,
}: OwnPrayerActionsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const mark = useMarkAnswered();

  const [sheet, setSheet] = useState<'undo' | 'blocked' | null>(null);
  const close = () => {
    setSheet(null);
  };

  const answered = prayer.answered_at !== null;
  const linked = prayer.my_answer_testimony_status;
  // Approved is the one state with a destination of its own: the parent already renders
  // the public "Read how God answered" link above these actions.
  const awaiting =
    linked === 'pending' || linked === 'rejected' || linked === 'removed'
      ? linked
      : null;

  const setAnswered = (next: boolean) => {
    // `mutateAsync().then()`, not per-call `mutate` callbacks. The refetch this write
    // triggers re-renders the screen into a different branch, and react-query drops the
    // callbacks of an observer that unmounted in between (the failure W2.6 shipped and
    // found on device). A continuation after `await` is plain JS and runs either way.
    void mark
      .mutateAsync({ prayerId: prayer.id, answered: next })
      .then(() => {
        close();
        if (next) onMarkedAnswered();
        else toast.show(t('family:answered.undone'));
      })
      .catch((error: unknown) => {
        close();
        // The race the screen cannot predict: a testimony was linked between the read
        // that decided to offer this and the tap that took it. Say the same thing the
        // sheet says when it can see one coming, rather than a generic failure.
        if (!next && answeredUndoBlocked(error)) {
          setSheet('blocked');
          return;
        }
        toast.show(t('family:answered.failed'));
      });
  };

  return (
    <>
      {!answered ? (
        <Button
          label={t('family:answered.markAnswered')}
          variant="primary"
          fullWidth
          loading={mark.isPending}
          onPress={() => {
            setAnswered(true);
          }}
        />
      ) : awaiting !== null ? (
        // The testimony exists but is not public, so the loop's next step is not on
        // offer: it has been taken. The gold line says where it actually is.
        <NoteBanner
          tone="gold"
          icon={(accent) => (
            <ClockIcon size={icon.lg} color={accent} strokeWidth={1.8} />
          )}
          lead={t(`family:answered.linked.${awaiting}Lead`)}
          body={t(`family:answered.linked.${awaiting}Body`)}
        />
      ) : linked === null ? (
        // Answered with no testimony: the invitation stands, however many times it has
        // been declined (docs/spec/09 allows answered-without-testimony as an end state).
        <Button
          label={t('family:answered.writeTestimony')}
          variant="primary"
          fullWidth
          onPress={onWriteTestimony}
        />
      ) : null}

      <Button
        label={t('family:share')}
        variant="outline"
        fullWidth
        onPress={onShare}
      />

      {answered ? (
        // A correction, at the weight of a correction: a text link rather than a third
        // button, so it never competes with the loop's next step (decided 2026-08-04).
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSheet(linked === null ? 'undo' : 'blocked');
          }}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingVertical: spacing.xs,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 13,
              color: colors.blue,
            }}
          >
            {t('family:answered.markNotAnswered')}
          </Text>
        </Pressable>
      ) : null}

      <UndoAnsweredSheet
        visible={sheet === 'undo'}
        working={mark.isPending}
        onDismiss={close}
        onConfirm={() => {
          setAnswered(false);
        }}
      />
      <LinkedTestimonySheet
        visible={sheet === 'blocked'}
        onDismiss={close}
        onGoToMyPosts={() => {
          close();
          onGoToMyPosts();
        }}
      />
    </>
  );
}

/** NOT-ANSWERED · the confirm behind the undo. Nothing is lost and it can be marked
 * answered again, so the button is primary rather than danger and the copy says what the
 * family sees change instead of warning about a cost that does not exist. */
function UndoAnsweredSheet({
  visible,
  working,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  working: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSheetDismiss(t('family:answered.dismissed'), onDismiss);

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('common:cancel')}
      onDismiss={dismiss}
    >
      <SheetTitle label={t('family:answered.undoTitle')} />
      <SheetBody text={t('family:answered.undoBody')} />
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={t('family:answered.markNotAnswered')}
          variant="primary"
          fullWidth
          loading={working}
          onPress={onConfirm}
        />
      </View>
      <SheetRow label={t('common:cancel')} onPress={dismiss} />
    </Sheet>
  );
}

/**
 * NOT-ANSWERED · a testimony is linked to it.
 *
 * docs/spec/09: "once one exists, undo requires deleting that testimony first, and the
 * confirm sheet says so". The database refuses the update, so this sheet explains instead
 * of acting.
 *
 * MY POSTS and not TESTIMONY-DETAIL, deliberately: the linked testimony is often still
 * pending, and TESTIMONY-DETAIL reads the approved-only feed, so it would greet its own
 * author with "This is no longer available". MY-POSTS holds a post in every state, and
 * Delete is on the card there.
 */
function LinkedTestimonySheet({
  visible,
  onDismiss,
  onGoToMyPosts,
}: {
  visible: boolean;
  onDismiss: () => void;
  onGoToMyPosts: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSheetDismiss(t('family:answered.dismissed'), onDismiss);

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('common:close')}
      onDismiss={dismiss}
    >
      <SheetTitle label={t('family:answered.blockedTitle')} />
      <SheetBody text={t('family:answered.blockedBody')} />
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={t('family:answered.goToMyPosts')}
          variant="outline"
          fullWidth
          onPress={onGoToMyPosts}
        />
      </View>
      <SheetRow label={t('common:close')} onPress={dismiss} />
    </Sheet>
  );
}
