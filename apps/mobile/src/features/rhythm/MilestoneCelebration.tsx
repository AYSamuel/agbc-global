import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Celebration } from '@/components/ui';
import { shareText } from '@/features/family/share';
import { useAuthStore } from '@/state/auth';

import { useCelebratedStore, uncelebrated } from './celebrated';
import { useMilestonesQuery } from './history';
import { badgeFor } from './milestones';

/**
 * Turns a milestone ROW into the celebration overlay (docs/spec/10: "achieving
 * one shows a brief celebration overlay + optional share").
 *
 * Mounted at the root, not on a screen, because a milestone does not arrive from
 * one place. `first_service` and the week rungs land when a queued check-in
 * reaches the server, which may be minutes after the tap and on whatever screen
 * the member has wandered to; `first_testimony` and `first_prayer` are awarded
 * when a MODERATOR approves, which happens while the app is closed. The one
 * thing they have in common is a new row, so a new row is what this watches.
 *
 * ONE AT A TIME, oldest first. Two milestones can land together (a first service
 * that is also a fourth week), and two overlays at once would be a pile-up; the
 * second appears when the first is closed.
 */
export function MilestoneCelebration() {
  const { t } = useTranslation();
  const isMember = useAuthStore((state) => state.status === 'member');
  const query = useMilestonesQuery(isMember);
  const known = useCelebratedStore((state) => state.known);
  const seedBaseline = useCelebratedStore((state) => state.seedBaseline);
  const markCelebrated = useCelebratedStore((state) => state.markCelebrated);

  const achieved = query.data?.map((row) => row.kind) ?? null;

  useEffect(() => {
    // The first list this device sees for this member is history, not news.
    if (achieved !== null) seedBaseline(achieved);
  }, [achieved, seedBaseline]);

  const pending = uncelebrated(achieved ?? [], known);
  // A kind with no entry in this build is marked told and never shown: the app
  // cannot name it, and an overlay reading `plan_7_days` at somebody would be
  // worse than silence (see milestones.ts).
  const next = pending.find((kind) => badgeFor(kind) !== null) ?? null;
  const unnameable = pending.filter((kind) => badgeFor(kind) === null);

  useEffect(() => {
    unnameable.forEach(markCelebrated);
  }, [unnameable, markCelebrated]);

  // Published so the notification ask knows to wait (see NotificationAsk).
  const setShowing = useCelebratedStore((state) => state.setShowing);
  useEffect(() => {
    setShowing(next);
  }, [next, setShowing]);

  const badge = next === null ? null : badgeFor(next);
  // The query is disabled for a guest, so this is belt AND braces: a milestone
  // is a fact about a member, and "the read happens to be off" is a weaker thing
  // to depend on than saying so (found by the test that asserted it, W2.8).
  if (!isMember || badge === null) return null;

  const title = t(badge.celebrateTitleKey);
  const body = t(badge.celebrateBodyKey);

  return (
    <Celebration
      visible
      glyph={badge.glyph}
      eyebrow={t('rhythm:celebrateEyebrow')}
      title={title}
      body={body}
      // Text-only through the share sheet the app already uses, not a rendered
      // image: `10` calls the share optional, and a branded milestone card would
      // be new work for a gain nobody asked for (W2.8 decision 5).
      shareLabel={t('rhythm:celebrateShare')}
      onShare={() => {
        void shareText(t('rhythm:celebrateShareText', { title }));
        markCelebrated(badge.kind);
      }}
      closeLabel={t('common:close')}
      onClose={() => {
        markCelebrated(badge.kind);
      }}
    />
  );
}
