import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Sheet, SheetBody, SheetTitle, useSheetDismiss } from './Sheet';

export interface ActionSheetProps {
  visible: boolean;
  /** Framed to the moment, not the mechanism: "Ask to join Berlin?" */
  title: string;
  body: string;
  /**
   * The mockup's `.gi`: the content of a 56px gold tile above the title. Pass a glyph or
   * an icon; the tile itself, its colour and its navy foreground belong to this component
   * so three sheets cannot each draw it slightly differently.
   */
  icon?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  /** `.btn.danger` for the button that ends something (delete, block). */
  primaryVariant?: 'primary' | 'danger';
  /** Omitted when the sheet has one way out, like the 90-day settle notice. */
  secondaryLabel?: string;
  /** Announced on dismiss per the 05 contract. */
  dismissAnnouncement: string;
  onDismiss: () => void;
  /**
   * The frames' `.authnote`: a quiet line under the buttons that takes the
   * pressure off the decision ("You're checked in either way"). Only the
   * notification ask draws one so far (W2.8).
   */
  footnote?: string;
}

/**
 * A title, a line of explanation and a decision: the confirm shape of `Sheet`.
 *
 * Generalised out of `GateSheet` when the branch-change flow needed the same element for
 * three non-gate moments (confirm a move, a refusal, the 90-day settle), and generalised
 * again at W2.6 when the report and block frames needed the same modal around a list of
 * rows instead. The modal itself, the scrim, the grab handle and the dismissal
 * announcement now live in `Sheet` and are shared; this file is the confirm layout and
 * nothing else.
 *
 * `GateSheet` is a thin wrapper over this with the account gate's own wording, so the
 * auth flow keeps its named props and nothing about it changed.
 */
export function ActionSheet({
  visible,
  title,
  body,
  icon,
  primaryLabel,
  onPrimary,
  primaryVariant = 'primary',
  secondaryLabel,
  dismissAnnouncement,
  onDismiss,
  footnote,
}: ActionSheetProps) {
  const { colors } = useTheme();
  const dismiss = useSheetDismiss(dismissAnnouncement, onDismiss);

  return (
    <Sheet
      visible={visible}
      dismissLabel={secondaryLabel ?? primaryLabel}
      onDismiss={dismiss}
    >
      {/* No container gap: every piece carries the margin `.gatesheet` gives it (.gi
          14, h3 8, p 18, .btn 8), which is what the frame actually draws. */}
      {icon ? (
        // `.gatesheet .gi`: 56px, radius 16, gold, navy content, centred.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: 'center',
            width: 56,
            height: 56,
            borderRadius: radius.cardTight,
            backgroundColor: palette.gold,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.md + 2,
          }}
        >
          {icon}
        </View>
      ) : null}
      {/* Centred, per `.gatesheet { text-align: center }`. */}
      <SheetTitle label={title} />
      <SheetBody text={body} />
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={primaryLabel}
          variant={primaryVariant}
          fullWidth
          onPress={onPrimary}
        />
      </View>
      {secondaryLabel ? (
        <Button
          label={secondaryLabel}
          variant="ghost"
          fullWidth
          onPress={dismiss}
        />
      ) : null}
      {/* `.authnote{12.5px;muted;centred;margin-top:14px;line-height:1.5}`. The
          frame overrides its margin to 2 here, because the ghost button above
          already carries 8. */}
      {footnote ? (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            lineHeight: 19,
            color: colors.muted,
            textAlign: 'center',
            marginTop: spacing.xs - 2,
          }}
        >
          {footnote}
        </Text>
      ) : null}
    </Sheet>
  );
}
