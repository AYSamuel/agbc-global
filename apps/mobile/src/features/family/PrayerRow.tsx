import { useIntercessionPress } from './useIntercession';
import { PrayerCard } from './PrayerCard';
import type { FamilyScope, PrayerFeedItem } from './queries';

/**
 * A prayer in a feed: `PrayerCard` plus the intercession machinery that decides
 * what the "I prayed" control does and how the 5s undo behaves.
 *
 * Lifted out of the Family tab at W4.7 slice 4, when the tablet's list pane
 * needed the same row. Two copies of this would have been two answers to "have I
 * prayed for this", which is the one-owner rule the project already paid for
 * once (W2.4).
 */
export function PrayerRow({
  prayer,
  branchName,
  scope,
  onOpen,
  onGate,
}: {
  prayer: PrayerFeedItem;
  branchName: string | null;
  scope: FamilyScope;
  onOpen: () => void;
  onGate: () => void;
}) {
  const { commitment, onPress, onUndo } = useIntercessionPress(
    prayer,
    onGate,
    scope,
  );
  return (
    <PrayerCard
      prayer={prayer}
      branchName={branchName}
      commitment={commitment}
      onPress={onOpen}
      onCommit={onPress ?? (() => undefined)}
      onUndo={onUndo}
    />
  );
}
