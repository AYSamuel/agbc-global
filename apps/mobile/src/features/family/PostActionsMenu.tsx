import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ComposeTarget } from '@agbc/shared';
import { icon, spacing } from '@agbc/shared/theme';

import {
  Button,
  CircleIconButton,
  GateSheet,
  MoreIcon,
  RadioRow,
  Sheet,
  SheetBody,
  SheetEyebrow,
  SheetRow,
  SheetTitle,
  useSheetDismiss,
  useToast,
} from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

import {
  REPORT_REASONS,
  useBlockMember,
  useReportPost,
  type ReportReason,
} from './moderation';
import { useDeletePost } from './ownPost';

/**
 * The `...` menu on a detail header (docs/spec/09 §Post actions menu, decided 2026-07-17:
 * one tap deeper than the feed card, so the cards stay clean).
 *
 * It is TWO menus and the row decides which (frames `POST-ACTIONS` and `REPORT / Block`).
 * `is_mine` comes off the feed row itself (migration 20260803170000) rather than from an
 * identity this component holds, which is what lets the author of an ANONYMOUS request
 * get Edit and Delete on words the same row refuses to attribute to them.
 *
 * The sheets ride along with the button. A Modal renders outside the layout wherever it
 * is declared, so this can be handed to `AppHeader`'s trailing slot as one element and no
 * screen has to hold five pieces of sheet state to show one menu.
 */
export interface PostActionsMenuProps {
  target: ComposeTarget;
  postId: string;
  /** From the feed row: whether the caller wrote it. */
  isMine: boolean;
  /**
   * The author, when the row names one. NULL for an anonymous request, and then Block is
   * not offered: there is nobody to block that the reader could have meant, and offering
   * it would be offering to act on an identity the app has correctly refused to disclose.
   */
  authorId: string | null;
  authorName: string | null;
  /** Called once the post has left this member's world (deleted, or its author blocked). */
  onGone: () => void;
}

type OpenSheet = 'actions' | 'report' | 'block' | 'delete' | 'gate' | null;

export function PostActionsMenu({
  target,
  postId,
  isMine,
  authorId,
  authorName,
  onGone,
}: PostActionsMenuProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const signedIn = useAuthStore((state) => state.status === 'member');

  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  // Which gate wording to show, and which pending action the sign-in carries.
  const [gateFor, setGateFor] = useState<'report' | 'block'>('report');

  const report = useReportPost();
  const block = useBlockMember();
  const remove = useDeletePost();

  const close = () => {
    setSheet(null);
  };
  const dismissActions = useSheetDismiss(t('family:actions.dismissed'), close);
  const name = authorName ?? t('family:aMember');
  const isTestimony = target === 'testimony';

  const openGate = (kind: 'report' | 'block') => {
    track('gate_shown', { action_type: kind });
    setGateFor(kind);
    setSheet('gate');
  };

  return (
    <>
      <CircleIconButton
        icon={<MoreIcon size={icon.xl} color={colors.text} />}
        accessibilityLabel={t('family:actions.open')}
        backgroundColor={colors.alt}
        onPress={() => {
          setSheet('actions');
        }}
      />

      {/* POST-ACTIONS / REPORT-BLOCK: the same sheet with the rows the row's own
          authorship decides. */}
      <Sheet
        visible={sheet === 'actions'}
        dismissLabel={t('common:cancel')}
        onDismiss={dismissActions}
      >
        <SheetEyebrow
          label={t(isMine ? 'family:actions.mine' : 'family:actions.theirs')}
        />
        {isMine ? (
          <>
            <SheetRow
              label={t('family:actions.edit')}
              sub={t('family:actions.editSub')}
              onPress={() => {
                close();
                router.push(
                  isTestimony
                    ? {
                        pathname: '/testimony/compose',
                        params: { edit: postId },
                      }
                    : { pathname: '/prayer/compose', params: { edit: postId } },
                );
              }}
            />
            <SheetRow
              label={t('family:actions.delete')}
              tone="danger"
              onPress={() => {
                setSheet('delete');
              }}
            />
          </>
        ) : (
          <>
            <SheetRow
              label={t('family:actions.report')}
              onPress={() => {
                if (!signedIn) {
                  openGate('report');
                  return;
                }
                setReason(null);
                setSheet('report');
              }}
            />
            {authorId === null ? null : (
              <SheetRow
                label={t('family:actions.block')}
                tone="danger"
                onPress={() => {
                  if (!signedIn) {
                    openGate('block');
                    return;
                  }
                  setSheet('block');
                }}
              />
            )}
          </>
        )}
        <SheetRow label={t('common:cancel')} onPress={dismissActions} />
      </Sheet>

      {/* REPORT · the reason, in the reporter's words. */}
      <ReportSheet
        visible={sheet === 'report'}
        reason={reason}
        sending={report.isPending}
        onChoose={setReason}
        onDismiss={close}
        onSend={() => {
          if (reason === null) return;
          report.mutate(
            { target: { kind: target, id: postId }, reason },
            {
              // Sent, already reported, and over the daily cap all land here. The
              // reporter is told the same thing in each case, on purpose: see
              // ReportOutcome.
              onSuccess: () => {
                close();
                toast.show(t('family:report.thanks'));
              },
              onError: () => {
                close();
                toast.show(t('family:report.failed'));
              },
            },
          );
        }}
      />

      {/* BLOCK · what blocking actually does. */}
      <BlockSheet
        visible={sheet === 'block'}
        name={name}
        blocking={block.isPending}
        onDismiss={close}
        onConfirm={() => {
          if (authorId === null) return;
          // `mutateAsync`, not `mutate` with callbacks. Blocking makes this very post
          // vanish from the feed views, so the refetch that follows the write unmounts
          // this menu (the detail header stops rendering it once the row is gone), and
          // react-query drops the per-call callbacks of an unmounted observer. On device
          // that meant a block worked, said nothing, and left the member staring at
          // "This is no longer available" (found 2026-08-04). A continuation after
          // `await` is plain JS and runs either way.
          void block
            .mutateAsync(authorId)
            .then(() => {
              close();
              toast.show(t('family:block.done', { name }));
              onGone();
            })
            .catch(() => {
              close();
              toast.show(t('family:block.failed'));
            });
        }}
      />

      {/* DELETE · the confirm behind POST-ACTIONS. */}
      <DeleteSheet
        visible={sheet === 'delete'}
        target={target}
        deleting={remove.isPending}
        onDismiss={close}
        onConfirm={() => {
          // Same reason as the block above: a deleted post leaves the feed views, this
          // menu unmounts with it, and per-call callbacks would go with it.
          void remove
            .mutateAsync({ target, id: postId })
            .then(() => {
              close();
              toast.show(t('family:deletePost.done'));
              onGone();
            })
            .catch(() => {
              close();
              toast.show(t('family:deletePost.failed'));
            });
        }}
      />

      <GateSheet
        visible={sheet === 'gate'}
        title={t(
          gateFor === 'report'
            ? 'family:actions.gateReportTitle'
            : 'family:actions.gateBlockTitle',
        )}
        body={t('family:actions.gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          useGateStore.getState().beginGateSignIn({ kind: gateFor });
          close();
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate(gateFor);
          close();
        }}
      />
    </>
  );
}

function ReportSheet({
  visible,
  reason,
  sending,
  onChoose,
  onDismiss,
  onSend,
}: {
  visible: boolean;
  reason: ReportReason | null;
  sending: boolean;
  onChoose: (reason: ReportReason) => void;
  onDismiss: () => void;
  onSend: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSheetDismiss(t('family:report.dismissed'), onDismiss);

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('common:cancel')}
      onDismiss={dismiss}
    >
      <SheetEyebrow label={t('family:report.title')} />
      {/* Nothing is preselected, which is where this leaves the frame's drawn state on
          purpose: the frame shows the first row `.on` to draw the selected style, and
          shipping that as a default would file every distracted tap as "someone may be
          at risk". Send waits for a real choice. */}
      {REPORT_REASONS.map((key, index) => (
        <RadioRow
          key={key}
          title={t(`family:report.reasons.${key}.title`)}
          description={t(`family:report.reasons.${key}.body`)}
          selected={reason === key}
          last={index === REPORT_REASONS.length - 1}
          onSelect={() => {
            onChoose(key);
          }}
        />
      ))}
      <View style={{ marginTop: spacing.md + 2, marginBottom: spacing.sm }}>
        <Button
          label={t('family:report.send')}
          variant="primary"
          fullWidth
          disabled={reason === null}
          loading={sending}
          onPress={onSend}
        />
      </View>
      <SheetRow label={t('common:cancel')} onPress={dismiss} />
    </Sheet>
  );
}

function BlockSheet({
  visible,
  name,
  blocking,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  blocking: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSheetDismiss(t('family:block.dismissed'), onDismiss);

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('common:cancel')}
      onDismiss={dismiss}
    >
      <SheetTitle label={t('family:block.title', { name })} />
      <SheetBody text={t('family:block.body')} />
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={t('family:block.confirm', { name })}
          variant="danger"
          fullWidth
          loading={blocking}
          onPress={onConfirm}
        />
      </View>
      <SheetRow label={t('common:cancel')} onPress={dismiss} />
    </Sheet>
  );
}

function DeleteSheet({
  visible,
  target,
  deleting,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  target: ComposeTarget;
  deleting: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSheetDismiss(t('family:deletePost.dismissed'), onDismiss);
  const testimony = target === 'testimony';

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('common:cancel')}
      onDismiss={dismiss}
    >
      <SheetTitle
        label={t(
          testimony
            ? 'family:deletePost.titleTestimony'
            : 'family:deletePost.titlePrayer',
        )}
      />
      <SheetBody
        text={t(
          testimony
            ? 'family:deletePost.bodyTestimony'
            : 'family:deletePost.bodyPrayer',
        )}
      />
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={t('family:deletePost.confirm')}
          variant="danger"
          fullWidth
          loading={deleting}
          onPress={onConfirm}
        />
      </View>
      <SheetRow label={t('common:cancel')} onPress={dismiss} />
    </Sheet>
  );
}
