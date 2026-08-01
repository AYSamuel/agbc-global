import { ActionSheet } from './ActionSheet';

export interface GateSheetProps {
  visible: boolean;
  /** Framed to the action per docs/spec/03: "Sign in to say Glory to God". */
  title: string;
  /** One line of benefit copy. */
  body: string;
  signInLabel: string;
  dismissLabel: string;
  /** Announced on dismiss per the 05 contract. */
  dismissAnnouncement: string;
  onSignIn: () => void;
  onDismiss: () => void;
}

/**
 * The account gate (docs/spec/03), now a thin wrapper over `ActionSheet`.
 *
 * The sheet itself moved when the branch-change flow needed the same `.gatesheet` element
 * for three non-gate moments. This keeps the gate's own vocabulary at its call sites: a
 * gate has a sign-in and a dismissal, not a "primary" and a "secondary".
 *
 * ONE VISIBLE CHANGE came with the move, and it is a correction rather than a new
 * decision: the sheet's title and body are centred, which is what `.gatesheet`'s CSS has
 * always said (`text-align: center`) and what every gate frame draws. This component was
 * left-aligned before.
 */
export function GateSheet({
  visible,
  title,
  body,
  signInLabel,
  dismissLabel,
  dismissAnnouncement,
  onSignIn,
  onDismiss,
}: GateSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      title={title}
      body={body}
      primaryLabel={signInLabel}
      onPrimary={onSignIn}
      secondaryLabel={dismissLabel}
      dismissAnnouncement={dismissAnnouncement}
      onDismiss={onDismiss}
    />
  );
}
