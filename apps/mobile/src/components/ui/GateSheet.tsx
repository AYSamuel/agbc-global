import { AccessibilityInfo, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Button } from './Button';

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

// The account gate (docs/spec/03): a bottom sheet, never a full screen, so the guest
// keeps their context. RN Modal provides the focus trap (accessibilityViewIsModal on
// iOS, modal semantics on Android); dismissal is announced.
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
          accessibilityLabel={dismissLabel}
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
          <Text
            accessibilityRole="header"
            style={[typeScale.section, { color: colors.text }]}
          >
            {title}
          </Text>
          <Text style={[typeScale.body, { color: colors.sub }]}>{body}</Text>
          <Button
            label={signInLabel}
            variant="primary"
            fullWidth
            onPress={onSignIn}
          />
          <Button
            label={dismissLabel}
            variant="ghost"
            fullWidth
            onPress={dismiss}
          />
        </View>
      </View>
    </Modal>
  );
}
