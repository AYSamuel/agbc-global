import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { StatusPanel } from '@/components/ui';

/**
 * The mockup's `.rhythm` panel, carrying the awaiting state (docs/spec/16, ADR 0015).
 *
 * It stays on the Profile screen for the whole 48 hours, which is why it is a panel and
 * not a sheet: it is an ongoing fact you live with, not a notice you dismiss.
 *
 * The panel itself moved into `components/ui/StatusPanel` at W2.8, when Home's rhythm
 * strip turned out to be the same ink band with a real progress ring. This keeps the
 * screen's spacing and its own name for the state it carries.
 *
 * ITS RING IS A PICTURE, not a claim: a third of the circle, exactly as the mockup draws
 * it, because nothing here knows how far through the 48 hours a request is.
 */
export function AwaitingPanel({
  label,
  branchName,
  note,
  ringLabel,
}: {
  /** "Asked to join" */
  label: string;
  branchName: string;
  /** "A leader there usually confirms within 48 hours" */
  note: string;
  /** "48h" */
  ringLabel: string;
}) {
  return (
    <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <StatusPanel
        label={label}
        title={branchName}
        note={note}
        ring={{ label: ringLabel, fraction: 1 / 3 }}
      />
    </View>
  );
}
