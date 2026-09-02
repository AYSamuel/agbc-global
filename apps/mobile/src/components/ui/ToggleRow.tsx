import { Children, type PropsWithChildren, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  control,
  fontFamily,
  hitTarget,
  motion,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The mockup's toggle vocabulary (`.toglist` / `.togrow` / `.switch`): a card of rows, each
// a title, a supporting line, and a pill switch on the trailing edge. Drawn from the frames'
// CSS: 46x28 track at full radius, a 22px knob inset 3px, green when on and the card's
// hairline when off.
//
// In the library rather than in the screen that needed it first (SETTINGS' analytics
// switch, W2.10), because NOTIF-PREFS is a whole screen of these rows (W3.3) and the second
// copy of a control is where the two start to diverge.
//
// Not RN's `Switch`: that draws the platform's control, and these frames specify their own.
// The whole ROW is the touch target, so the 28px switch never has to be hit on its own.

export function ToggleList({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, index) => (
        // Index keys: a preferences list is static and never reordered (same as MenuCard).
        <View key={index}>
          {index > 0 ? (
            <View style={{ height: 1, backgroundColor: colors.cardline }} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const KNOB = 22;
const KNOB_INSET = 3;

function Switch({ on }: { on: boolean }) {
  const { colors } = useTheme();
  // State, not a ref: the React Compiler forbids reading `ref.current` during render, and
  // the interpolation below happens in render. Same shape as Burst.tsx's reduce-motion read.
  const [progress] = useState(() => new Animated.Value(on ? 1 : 0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const to = on ? 1 : 0;
    // Reduced motion still arrives, it just arrives immediately (05's mandatory variant).
    if (reduceMotion) {
      progress.setValue(to);
      return;
    }
    Animated.timing(progress, {
      toValue: to,
      duration: motion.fast,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [on, progress, reduceMotion]);

  return (
    <View
      // The state is announced by the row's accessibilityState, so the track itself is
      // decoration: a screen reader that also read this would say it twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: radius.full,
        backgroundColor: on ? palette.green : colors.controlline,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: radius.full,
          backgroundColor: control.knob,
          shadowColor: control.knobShadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 1,
          shadowRadius: 3,
          elevation: 2,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [KNOB_INSET, TRACK_WIDTH - KNOB - KNOB_INSET],
              }),
            },
          ],
        }}
      />
    </View>
  );
}

export interface ToggleRowProps {
  /** Mockup `.tl`: what the switch does, in the member's terms. */
  title: string;
  /** Mockup `.td`: the supporting line. Scales fully; it is body copy, not a label. */
  body?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Defaults to the title; pass when the title alone is not a sentence. */
  accessibilityLabel?: string;
}

export function ToggleRow({
  title,
  body,
  value,
  onValueChange,
  accessibilityLabel,
}: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={body}
      accessibilityState={{ checked: value }}
      onPress={() => {
        onValueChange(!value);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        // The frame's `.togrow` is `padding:14px 16px` with `gap:14px`, one past `.mrow`'s
        // 15px: a switch row sits slightly wider than a chevron row in this design.
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        minHeight: hitTarget.min,
        backgroundColor: pressed ? colors.alt : 'transparent',
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 14.5,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        {body ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12,
              lineHeight: 12 * 1.4,
              color: colors.muted,
              marginTop: 3,
            }}
          >
            {body}
          </Text>
        ) : null}
      </View>
      <Switch on={value} />
    </Pressable>
  );
}
