import { useCallback, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  hitTarget,
  palette,
  radius,
  spacing,
  tonal,
  typeScale,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { CAPPED_MAX_WIDTH } from './Screen';

/**
 * The mockup's `.gatesheet`: one bottom sheet, and the only one.
 *
 * Extracted from `ActionSheet` at W2.6, when the post-actions, report and block frames
 * turned out to need the same modal with a different inside: a list of `.actrow`s rather
 * than a title, a body and two buttons. Everything that can be got wrong in a modal lives
 * here and is written once: the RN Modal that provides the focus trap
 * (`accessibilityViewIsModal` on iOS, modal semantics on Android), the scrim, the
 * hardware back, and the single rule that EVERY way out announces itself (05 contract).
 *
 * What is deliberately not here is the layout of the contents. `ActionSheet` composes a
 * title, a body and buttons; the W2.6 sheets compose `SheetEyebrow` and `SheetRow`s.
 * Both draw from the pieces below, so the sheets share their vocabulary without one
 * growing a dozen props to describe the other's shape.
 *
 * The contents scroll. A sheet is the one surface with no room to grow: four report
 * reasons with their explanations, at a large font setting, are taller than the phone,
 * and a bottom sheet that cannot scroll simply hides its own primary action.
 */
export interface SheetProps {
  visible: boolean;
  /**
   * The accessible name of the scrim, which IS a dismiss control: usually the same word
   * as the sheet's own way out ("Cancel", "Not now").
   */
  dismissLabel: string;
  /** Every exit runs this; wrap it with `useSheetDismiss` so every exit also announces. */
  onDismiss: () => void;
  /**
   * Sheets that hold a text input set this so the keyboard lifts the sheet
   * instead of covering its primary action (standards/mobile.md: the keyboard
   * is an inset). Opt-in and inert when false: a Modal escapes the window's
   * ordinary inset handling on iOS, so the sheet must avoid the keyboard
   * itself. First needed by REGISTRATION-CONTACT (W2.9 slice 3).
   */
  avoidKeyboard?: boolean;
  children: ReactNode;
}

/**
 * The 05 contract's "a dismissal is announced", in one place.
 *
 * Returned rather than applied internally because a sheet has more ways out than the
 * scrim: a Cancel row, a secondary button, the hardware back. They must all be the same
 * function, or the one that got missed is the one that leaves a screen reader silent.
 */
export function useSheetDismiss(announcement: string, onDismiss: () => void) {
  return useCallback(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
    onDismiss();
  }, [announcement, onDismiss]);
}

export function Sheet({
  visible,
  dismissLabel,
  onDismiss,
  avoidKeyboard = false,
  children,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        enabled={avoidKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          onPress={onDismiss}
          style={{ flex: 1, backgroundColor: 'rgba(10,15,24,0.5)' }}
        />
        <View
          accessibilityViewIsModal
          style={{
            // 85%, not 100%: some of the screen behind stays visible, which is what
            // tells a reader this is a sheet over their post and not a new screen.
            maxHeight: '85%',
            // Capped and centred at the same measure as `Screen`, found on a 1000dp
            // tablet (2026-08-03): a Modal renders outside the screen's width class, so
            // the sheet ran the full width of the device while the post behind it sat in
            // a 680dp column, and the actions ended up a hand's width from the words
            // they act on. Full-bleed on a phone, where 680 is wider than the device.
            width: '100%',
            maxWidth: CAPPED_MAX_WIDTH,
            alignSelf: 'center',
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.cardHero,
            borderTopRightRadius: radius.cardHero,
          }}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={{
              padding: spacing.x2l,
              paddingBottom: insets.bottom + spacing.x2l,
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
                marginBottom: spacing.lg,
              }}
            />
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The mockup's `.sheettitle`: the small muted line naming what the rows below act on
 * ("Your post", "This post"). Not a heading in the assistive-tech sense and not marked
 * as one: it labels a list of actions, and announcing it as a header would promise a
 * section that is really three buttons.
 */
export function SheetEyebrow({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        textAlign: 'center',
        fontFamily: fontFamily.body.bold,
        fontSize: 12,
        letterSpacing: 0.36,
        color: colors.muted,
        marginTop: 2,
        marginBottom: spacing.sm,
      }}
    >
      {label}
    </Text>
  );
}

/** The mockup's `.gatesheet h3`. */
export function SheetTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        typeScale.section,
        {
          fontSize: 20,
          color: colors.text,
          textAlign: 'center',
          marginBottom: spacing.sm,
        },
      ]}
    >
      {label}
    </Text>
  );
}

/** The mockup's `.gatesheet p`. */
export function SheetBody({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={[
        typeScale.body,
        {
          fontSize: 14,
          lineHeight: 21,
          color: colors.sub,
          textAlign: 'center',
          marginBottom: spacing.lg + 2,
        },
      ]}
    >
      {text}
    </Text>
  );
}

export interface SheetRowProps {
  label: string;
  /** The mockup's `.actrow .sub`: the consequence, under the verb. */
  sub?: string;
  /** `.actrow.danger`: the row that ends something. */
  tone?: 'default' | 'danger';
  onPress: () => void;
}

/**
 * The mockup's `.actrow`: a full-width, centred, filled row. The sheet's own kind of
 * button, distinct from `Button` in that a list of them IS the content rather than the
 * conclusion of it.
 */
export function SheetRow({
  label,
  sub,
  tone = 'default',
  onPress,
}: SheetRowProps) {
  const { colors } = useTheme();
  const danger = tone === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      // The sub line is part of what the member is agreeing to, so it is part of the
      // name assistive tech reads out, not decoration beside it.
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: hitTarget.preferred,
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.control,
        backgroundColor: danger ? tonal.redRow.bg : colors.alt,
        marginTop: 9,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 15,
          textAlign: 'center',
          color: danger ? palette.red : colors.text,
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={{
            fontFamily: fontFamily.body.medium,
            fontSize: 11.5,
            textAlign: 'center',
            color: colors.muted,
            marginTop: 3,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}
