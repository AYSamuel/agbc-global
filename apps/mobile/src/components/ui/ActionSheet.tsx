import type { ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button } from './Button';

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
  /** Omitted when the sheet has one way out, like the 90-day settle notice. */
  secondaryLabel?: string;
  /** Announced on dismiss per the 05 contract. */
  dismissAnnouncement: string;
  onDismiss: () => void;
}

/**
 * The mockup's `.gatesheet`: a bottom sheet, never a full screen, so the reader keeps
 * their context.
 *
 * Generalised out of `GateSheet` when the branch-change flow needed the same element for
 * three non-gate moments (confirm a move, a refusal, the 90-day settle). One sheet, one
 * set of behaviours: RN Modal provides the focus trap (accessibilityViewIsModal on iOS,
 * modal semantics on Android), the scrim and the hardware back both dismiss, and the
 * dismissal is announced.
 *
 * `GateSheet` is now a thin wrapper over this with the account gate's own wording, so the
 * auth flow keeps its named props and nothing about it changed.
 */
export function ActionSheet({
  visible,
  title,
  body,
  icon,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  dismissAnnouncement,
  onDismiss,
}: ActionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const dismiss = () => {
    AccessibilityInfo.announceForAccessibility(dismissAnnouncement);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel ?? primaryLabel}
          onPress={dismiss}
          style={{ flex: 1, backgroundColor: 'rgba(10,15,24,0.5)' }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.cardHero,
            borderTopRightRadius: radius.cardHero,
            padding: spacing.x2l,
            paddingBottom: insets.bottom + spacing.x2l,
            gap: spacing.md,
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              alignSelf: 'center',
              width: spacing.x4l,
              height: 4,
              borderRadius: radius.full,
              backgroundColor: colors.cardline,
            }}
          />
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
              }}
            >
              {icon}
            </View>
          ) : null}
          {/* Centred, per `.gatesheet { text-align: center }`. */}
          <Text
            accessibilityRole="header"
            style={[
              typeScale.section,
              { color: colors.text, textAlign: 'center' },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[typeScale.body, { color: colors.sub, textAlign: 'center' }]}
          >
            {body}
          </Text>
          <Button
            label={primaryLabel}
            variant="primary"
            fullWidth
            onPress={onPrimary}
          />
          {secondaryLabel ? (
            <Button
              label={secondaryLabel}
              variant="ghost"
              fullWidth
              onPress={dismiss}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
